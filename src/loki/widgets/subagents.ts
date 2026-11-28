// TEMPORARY SUBAGENTS (operator 2026-09-17: "under each agent, multiple mini-agents working in
// parallel for a goal"). One agent pane can fan a goal out into N headless CLI runs that work in
// PARALLEL inside the parent's own worktree — same scope gate, same context pack, same audit hook.
// Each finished result is typed into the parent agent's terminal (delivered once). Temporary: the
// jobs live in the chat-engine worker for the life of the BE process, not in the database.
//
// The store below is what the Threads list reads to draw the children under an agent — keyed by the
// widget's minted (sessionId, paneId) pair, which both the pane and the list know.
import { apiPost, apiGet } from "@/loki/api/client";
import { apiPostStrict } from "@/loki/api/post-strict";

export type SubagentJob = {
  id: number; parent: string; goal: string; title: string; prompt: string; engine: string; cwd: string; write: boolean;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  created: number; started: number | null; ended: number | null;
  result: string | null; error: string | null; delivered: boolean;
  trace?: { tools?: { name: string; target: string }[]; tokensIn?: number | null; tokensOut?: number | null; cost?: number | null; ms?: number } | null;
};
export type SubagentTask = { title: string; prompt: string };

const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;
export const subagentKey = (sessionId: number, paneId: number) => `${sessionId}-${paneId}`;

export async function listSubagents(parent: string): Promise<SubagentJob[]> {
  try { const r = unwrap(await apiGet(`/api/v1/cockpit/subagents?parent=${encodeURIComponent(parent)}`, { timeoutMs: 10_000 })); return Array.isArray(r?.jobs) ? r.jobs : []; } catch { return []; }
}
export async function planSubagents(goal: string, n: number, engine: string, cwd: string): Promise<SubagentTask[]> {
  try { const r = unwrap(await apiPost(`/api/v1/cockpit/subagents/plan`, { goal, n, engine, cwd }, { timeoutMs: 300_000 })); return Array.isArray(r?.tasks) ? r.tasks : []; } catch { return []; }
}
export async function spawnSubagents(input: { parent: string; goal: string; tasks: SubagentTask[]; engine: string; cwd: string; write: boolean }): Promise<SubagentJob[]> {
  try { const r = unwrap(await apiPost(`/api/v1/cockpit/subagents/spawn`, input, { timeoutMs: 20_000 })); return Array.isArray(r?.jobs) ? r.jobs : []; } catch { return []; }
}
export async function cancelSubagent(id: number): Promise<boolean> {
  try { const r = unwrap(await apiPost(`/api/v1/cockpit/subagents/cancel`, { id }, { timeoutMs: 10_000 })); return r?.ok === true; } catch { return false; }
}
export async function markDelivered(id: number): Promise<boolean> {
  try { const r = unwrap(await apiPost(`/api/v1/cockpit/subagents/delivered`, { id }, { timeoutMs: 10_000 })); return r?.ok === true; } catch { return false; }
}

/** What the parent agent gets typed into its terminal when a subagent finishes — pure, tested. */
export function deliveryMessage(job: SubagentJob): string {
  const head = `[antiloki] subagent "${job.title}" ${job.status === "done" ? "finished" : job.status}${job.trace?.ms ? ` in ${(job.trace.ms / 1000).toFixed(0)}s` : ""}${job.trace?.tools?.length ? ` · ${job.trace.tools.length} tool${job.trace.tools.length === 1 ? "" : "s"}` : ""}. Its report:`;
  const body = (job.result ?? job.error ?? "(no output)").trim().replace(/\r?\n/g, " ⏎ ").slice(0, 1800);
  return `${head} ${body}`;
}

/** One line for the thread list: `⋔ title · running 12s` / `✓ title` / `✗ title`. Pure, tested. */
export function jobGlyph(j: SubagentJob): { glyph: string; tone: "ok" | "warn" | "bad" | "dim"; state: string } {
  if (j.status === "running") return { glyph: "⋔", tone: "warn", state: j.started ? `running ${Math.max(0, Math.round((Date.now() - j.started) / 1000))}s` : "running" };
  if (j.status === "queued") return { glyph: "·", tone: "dim", state: "queued" };
  if (j.status === "done") return { glyph: "✓", tone: "ok", state: j.delivered ? "delivered" : "done" };
  if (j.status === "cancelled") return { glyph: "⊘", tone: "dim", state: "cancelled" };
  return { glyph: "✗", tone: "bad", state: "failed" };
}
export const activeJobs = (jobs: SubagentJob[]) => jobs.filter((j) => j.status === "queued" || j.status === "running");

// ── the tiny shared store (pane writes, Threads list reads) ─────────────────────────────────────
const store = new Map<string, SubagentJob[]>();
const listeners = new Set<() => void>();
export function publishSubagents(key: string, jobs: SubagentJob[]) {
  const prev = store.get(key);
  if (prev && prev.length === jobs.length && prev.every((p, i) => p.id === jobs[i].id && p.status === jobs[i].status && p.delivered === jobs[i].delivered)) return;
  store.set(key, jobs);
  for (const l of listeners) l();
}
export function readSubagents(key: string): SubagentJob[] { return store.get(key) ?? []; }
export function subscribeSubagents(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }

// ── GOAL RUNS (operator 2026-09-17: subagents reformulated — decomposition · synchronization ·
// velocity · accuracy · orchestration). A run = PLAN (a DAG of tasks, each owning disjoint files,
// approved by the operator) → WAVES (parallel, ownership enforced, predecessors' reports + a shared
// blackboard in each prompt) → VERIFY (each task judged against its acceptance, one retry) → JOIN
// (one consolidated report delivered to the parent). Controls: pause / resume / cancel / retry / skip.
export type Tier = "low" | "mid" | "high";
/** THE ROUTER'S DECISION (2026-09-19): tier of the work, whether to delegate at all, the tiers of the review and the join, what the ledger changed */
export type QaFinding = { task: string | null; kind: "unmet" | "drift" | "claim" | "risk" | "ok" | string; text: string };
export type QaReview = { passed: boolean; score: number; summary: string; findings: QaFinding[]; by: string; t: number; error?: string | null };
/** What the QA rail says of a run. Pure — tested. */
export function qaLine(r: { status: string; qa_review_wanted?: boolean; qa_review?: QaReview | null }): string {
  if (!r.qa_review_wanted) return "";
  if (r.qa_review) { const q = r.qa_review; if (q.error) return `judge error — ${q.summary}`; return `${q.passed ? "PASSED" : "FAILED"} · score ${q.score} · ${q.findings.length} finding${q.findings.length === 1 ? "" : "s"}`; }
  if (r.status === "done" || r.status === "failed") return "judging…";
  return "QA waits for the join";
}
export type Route = { tier: Tier; delegate: boolean; why: string; bias: string[]; verify_tier: Tier; join_tier: Tier; confidence?: string; /** MIN's fallback: files the ask names that have no intel — this ask runs with exploration on */ no_intel?: string[] };
export type GoalTask = { id: string; title: string; prompt: string; owns: string[]; needs: string[]; acceptance: string[]; tier?: Tier; status: "pending" | "ready" | "running" | "verifying" | "done" | "failed" | "blocked" | "skipped"; wave: number; attempts: number; started: number | null; ended: number | null; report: string | null; verdict: { passed: boolean; reasons: string[]; by: string } | null; error: string | null; trace: SubagentJob["trace"]; changed: string[];
  /** the lenses the planner chose for this task and the briefs their reviews produced (2026-09-19) */
  specialists?: string[]; briefs?: string[];
  /** the skills the planner named for this task — their SKILL.md rode in its prompt (2026-09-20) */
  skills?: string[];
};
export type GoalQuestion = { id: string; text: string; options: string[]; default: string; certainty: "blocking" | "assumable"; answer: string | null; /** what kind of question: a screening kind, or "qa-direction" when QA has spent its send-backs */ kind?: string };
export type GoalRun = { id: number; parent: string; goal: string; engine: string; cwd: string; write: boolean; concurrency: number; status: "planning" | "awaiting-answers" | "awaiting-approval" | "running" | "paused" | "joining" | "done" | "failed" | "cancelled" | "inline"; route?: Route | null; created: number; started: number | null; ended: number | null; tasks: GoalTask[]; blackboard: { task: string; text: string; t: number }[]; events: { t: number; kind: string; text: string; task?: string; /** unique event id (warnings start with "W") — absent on older runs */ id?: string }[]; report: string | null; delivered: boolean; error: string | null; /** QA is still judging - or has sent the run back to be fixed - so it is not announced as finished */ qa_pending?: boolean; qa_rounds?: number;
  /** MIN (2026-09-21): a chat turn taken with exploration off, recorded as its own settled run */
  min?: boolean;
  /** QA (2026-09-21): the pane's isolated judge reviews the whole run after the join */
  qa_review_wanted?: boolean;
  qa_review?: QaReview | null;
  compare?: Comparison | null;
  /** THE SCREENING GATE (2026-09-20): Heimdall's blocking questions (answered once), and the planner's own assumptions for the assumable ones */
  questions?: GoalQuestion[];
  assumptions?: string[];
  /** the cockpit PR opened from the run's box (write runs, 2026-09-19) */
  pr?: number | null;
  /** Heimdall's router was on for this run (2026-09-20) */
  router?: boolean;
  /** HEIMDALL'S DECISIONS, AS THEY LAND (operator 2026-09-27: "role, planner and worker … and QA — all those should be
   *  displayed in real time on the sidepane of heimdall"): the role verdict, the merge it chose, the worker seat, the
   *  planner's binding and the stages that ran — each absent until decided, which is what "real time" shows. */
  role?: { role?: string; name?: string; domain?: string; objective?: string; brain?: string | null; hands?: string | null; measured?: boolean; why?: string; bent?: string } | null;
  pair?: { name: string; brain: string; hands: string; brain_model?: string | null; hands_model?: string | null } | null;
  workers?: string | null;
  plan_binding?: string;
  stages?: { name: string; engine: string; tier: string; ok: boolean; ms: number; cost?: number; note?: string }[];
  /** the API-equivalent the router saved against one high-tier agent doing the same tokens */
  savings?: Savings | null;
  /** THE QA GATE (2026-09-20): the related tests run on the changed files after the join */
  qa?: { cmd: string; passed: boolean; exit: number; ms: number; tail: string; files: string[]; pre_existing?: boolean } | null;
  qa_baseline?: { passed: boolean; ms: number; files: string[] } | null;
};
/** MIN's column (2026-09-21): the turns taken with exploration off — what they cost vs the same turns with it (an estimate from the measured share). Pure — tested. */
export function minSavings(runs: { min?: boolean; savings?: { saved_usd: number; actual_usd: number } | null }[]): { saved: number; actual: number; turns: number } {
  let saved = 0; let actual = 0; let n = 0;
  for (const r of runs) { if (r.min && r.savings) { saved += r.savings.saved_usd; actual += r.savings.actual_usd; n += 1; } }
  return { saved, actual, turns: n };
}
export type Savings = { tokens_in: number; tokens_out: number; actual_usd: number; baseline_usd: number; saved_usd: number; saved_pct: number; baseline: string; tiers: string[] };
/** one line for the panel: "saved $1.80 (53%) — $1.58 vs $3.38 at claude-code · opus, 165k tokens". Pure. */
export function savingsLine(s: Savings, router = true): string {
  const tok = s.tokens_in + s.tokens_out; const k = tok >= 1000 ? `${Math.round(tok / 1000)}k` : String(tok);
  if (!router) return `router off — $${s.actual_usd.toFixed(2)} at the pane's tier, ${k} tokens (API-equivalent)`;
  return `the router saved $${s.saved_usd.toFixed(2)} (${Math.round(s.saved_pct)}%) — $${s.actual_usd.toFixed(2)} vs $${s.baseline_usd.toFixed(2)} at ${s.baseline}, ${k} tokens · API-equivalent`;
}

export async function listGoalRuns(parent: string): Promise<GoalRun[]> {
  try { const r = unwrap(await apiGet(`/api/v1/cockpit/goals?parent=${encodeURIComponent(parent)}&scope=workspace`, { timeoutMs: 10_000 })); return Array.isArray(r?.runs) ? r.runs : []; } catch { return []; }
}
/** THE ROUTED PROMPT (operator 2026-09-20: "the terminal didn't show the selection of the model or if a plan
 *  was needed"): what an inline route types into the terminal — the model switch Claude understands, then the
 *  goal with the router's verdict. Pure. */
/** THE LADDER SERVE ACTUALLY ROUTES ON (operator 2026-09-28: "is always choosing sonnet, even though the task is
 *  simple"). This mapped tier LOW to sonnet — there was no cheap rung at all — so every routed inline turn ran on
 *  the mid model however trivial the ask, and a "low" route bought nothing. Serve settled this on 2026-09-21
 *  (`cli::tier_model`): low and mid were BOTH sonnet until a bench showed haiku writes a small module from a
 *  complete spec just as well at a third of the price. The front end never got that change; it has it now. */
export function claudeModelForTier(tier: Tier): string {
  return tier === "high" ? "opus" : tier === "low" ? "haiku" : "sonnet";
}
export function routedPrompt(run: GoalRun): string {
  const r = run.route; const sure = r?.confidence ? `, ${r.confidence} confidence` : "";
  return `${run.goal}\n\n(antiloki's router: one job, tier ${r?.tier ?? "mid"}${sure}${r?.why ? ` — ${r.why}` : ""}. Do it here, no sub-agents.)`;
}
export async function planGoalRun(input: { parent: string; goal: string; engine: string; cwd: string; write: boolean; n: number; pane_id?: number; always?: boolean }): Promise<GoalRun | null> {
  // A REFUSAL IS NOT A NULL (operator 2026-09-27 "my message go to vacuo", and again on every fresh fork
  // 2026-09-28). This `catch` used to swallow the reason and answer `null`, so `askHeimdall`'s catch never ran
  // and the ask it was holding was never sent to anyone. The reason is rethrown; a caller that genuinely does
  // not care still catches it, but it has to say so.
  // THE PANE IS THE BRAIN, NEVER THE HANDS (operator 2026-09-22, and again 2026-09-28: "why is not using
  // composer, grok, gemini? the task was simple frontend task").
  //
  // `always` is the serve flag that makes a ONE-JOB route dispatch to one worker on the RECORD'S WINNER for that
  // job, size and domain — `goals.rs:1358`. Without it, `delegate: false` means "do it in this terminal", so the
  // pane's own seat does the work and the winner is never consulted: a simple frontend ask ran on Claude even
  // though the record puts `cursor:composer-2.5` top of that cell at 0.955. The BENCH has always set this flag,
  // so the benchmark measured the merge while the product quietly did not use it.
  //
  // The caller may still turn it off; the default is the behaviour the operator asked for twice.
  const r = unwrap(await apiPost(`/api/v1/cockpit/goals/plan`, { always: true, ...input }, { timeoutMs: 600_000, throwOnError: true }));
  return r?.run ?? null;
}
type GoalOpName = "approve" | "answer" | "pause" | "resume" | "cancel" | "retry" | "skip" | "delivered" | "setPlan" | "finding" | "compare" | "pr" | "qa";
const goalOpMs = (op: GoalOpName) => (op === "compare" ? 960_000 : op === "pr" ? 120_000 : op === "answer" ? 600_000 : 20_000);
export async function goalOp(op: GoalOpName, body: Record<string, unknown>): Promise<any> {
  try { return unwrap(await apiPost(`/api/v1/cockpit/goals/${op}`, body, { timeoutMs: goalOpMs(op) })); } catch { return null; }
}
/** THE SAME CALL, BUT A FAILURE REACHES THE CALLER (audit 2026-10-01). `goalOp` answers null for a refusal, a timeout and a dead serve alike, so Stop/Pause/Resume reported success on a run that was
 *  never touched. This one throws the serve's reason; a button that tells the operator what happened uses it, a caller that does not care keeps `goalOp`. */
export async function goalOpStrict(op: GoalOpName, body: Record<string, unknown>): Promise<any> {
  const r = unwrap(await apiPostStrict(`/api/v1/cockpit/goals/${op}`, body, { timeoutMs: goalOpMs(op) }));
  if (r && typeof r === "object" && (r as any).ok === false) throw new Error(String((r as any).error ?? (r as any).why ?? "the serve would not do it"));
  return r;
}
/** THE RAW COMPARISON (operator 2026-09-19: "compare with raw claude as well"): the same goal as one plain call beside the run. */
export type Comparison = { engine: string; tier: Tier; started: number; ended: number | null; ms: number; tokens_in: number | null; tokens_out: number | null; tools: number; chars: number; report: string | null; error: string | null; run_ms: number; run_calls: number; run_tools: number; run_tokens_in: number; run_tokens_out: number; run_chars: number; run_passed: number; run_tasks: number };
/** the side-by-side lines of a comparison — pure */
export function compareLines(c: Comparison): { label: string; raw: string; run: string }[] {
  const s = (ms: number) => `${Math.round(ms / 1000)}s`;
  return [
    { label: "time", raw: s(c.ms), run: s(c.run_ms) },
    { label: "calls", raw: "1", run: String(c.run_calls) },
    { label: "tool calls", raw: String(c.tools), run: String(c.run_tools) },
    { label: "tokens", raw: c.tokens_in != null ? `${c.tokens_in}→${c.tokens_out ?? 0}` : "—", run: c.run_tokens_in ? `${c.run_tokens_in}→${c.run_tokens_out}` : "—" },
    { label: "report", raw: `${c.chars} chars`, run: `${c.run_chars} chars` },
    { label: "verified", raw: "none — nobody checked it", run: `${c.run_passed}/${c.run_tasks} tasks passed a strict verifier` },
  ];
}

/** Task glyphs for the board and the thread children — pure. */
export function taskGlyph(t: GoalTask): { glyph: string; tone: "ok" | "warn" | "bad" | "dim" | "fg"; state: string } {
  const el = t.started ? Math.max(0, Math.round(((t.ended ?? Date.now()) - t.started) / 1000)) : 0;
  switch (t.status) {
    case "running": return { glyph: "⋔", tone: "warn", state: `running ${el}s${t.attempts > 1 ? ` · attempt ${t.attempts}` : ""}` };
    case "verifying": return { glyph: "⚖", tone: "warn", state: "verifying" };
    case "done": return { glyph: "✓", tone: "ok", state: `passed${el ? ` · ${el}s` : ""}` };
    case "failed": return { glyph: "✗", tone: "bad", state: "failed" };
    case "blocked": return { glyph: "⊘", tone: "bad", state: "blocked" };
    case "skipped": return { glyph: "–", tone: "dim", state: "skipped" };
    case "ready": return { glyph: "▹", tone: "fg", state: "ready" };
    default: return { glyph: "·", tone: "dim", state: `waits for ${t.needs.join(", ")}` };
  }
}
export const runLabel = (r: GoalRun) => {
  const done = r.tasks.filter((t) => t.status === "done").length;
  const running = r.tasks.filter((t) => t.status === "running" || t.status === "verifying").length;
  return r.status === "running" ? `running · ${running} active · ${done}/${r.tasks.length} passed` : r.status === "awaiting-answers" ? `${r.questions?.length ?? 0} question${(r.questions?.length ?? 0) === 1 ? "" : "s"} before planning` : r.status === "awaiting-approval" ? `plan ready — approve to run` : r.status === "inline" ? `one job — no sub-agents (tier ${r.route?.tier ?? "mid"})` : `${r.status} · ${done}/${r.tasks.length} passed`;
};
export const activeRuns = (runs: GoalRun[]) => runs.filter((r) => r.status === "running" || r.status === "joining" || r.status === "planning" || r.status === "paused");
export function goalDelivery(r: GoalRun): string {
  const done = r.tasks.filter((t) => t.status === "done").length;
  const open = r.tasks.filter((t) => t.status === "failed" || t.status === "blocked").map((t) => t.id);
  const summary = (r.report ?? "").split("\n").filter((l) => l.trim() && !l.startsWith("#")).slice(0, 3).join(" ⏎ ").slice(0, 900);
  return `[antiloki] goal run #${r.id} finished: ${done}/${r.tasks.length} tasks passed${open.length ? ` · open: ${open.join(", ")}` : ""}. ${summary} (full report in the pane's ⋔ subagents → goal runs) — The operator already reads this report in the chat: answer in ONE short sentence, do not restate it, and do not run any build, test or command.`;
}
/** The synthetic turn the pane types into the agent when a run finishes. It is NOT something the operator said, so the chat draws it as a system line. Pure — tested. */
export const isRunDelivery = (text: string | null | undefined): boolean => /^\[antiloki\] goal run #\d+ finished/.test(String(text ?? "").trim());

// the store the Threads list reads (goal runs, next to the quick fan-out jobs)
const runStore = new Map<string, GoalRun[]>();
export function publishGoalRuns(key: string, runs: GoalRun[]) {
  const prev = runStore.get(key);
  const sig = (rs: GoalRun[]) => rs.map((r) => `${r.id}:${r.status}:${r.tasks.map((t) => t.status).join(",")}`).join("|");
  if (prev && sig(prev) === sig(runs)) return;
  runStore.set(key, runs);
  for (const l of listeners) l();
}
export function readGoalRuns(key: string): GoalRun[] { return runStore.get(key) ?? []; }

// ── THE QUEUE (operator 2026-09-29): each agent's list of what was asked - done, doing, next. The serve owns it; this is the panel's door.
export type QueueStatus = "queued" | "doing" | "done" | "failed" | "cancelled";
export type QueueBinding = { label: string; why: string; note: string; mode: string; role?: any; pair?: any };
export type QueueCp = { rev: string; tree?: string; n: number; label: string; t: number };
export type QueueItem = {
  id: number; pane_id: number; ask: string; goal: string; status: QueueStatus; binding: QueueBinding; run_id: number | null;
  cp_before: QueueCp | null; cp_after: QueueCp | null; created: number; started: number | null; ended: number | null; note: string;
  paths: string[]; creates: boolean; removes: boolean; reverts: boolean;
};
export type QueueSnapshot = { items: QueueItem[]; checkpoints: { n: number; rev: string; subject: string }[]; conflicts: [number, number][]; idle: boolean };
export async function queueList(paneId: number): Promise<QueueSnapshot | null> {
  try { const r = unwrap(await apiGet(`/api/v1/cockpit/queue?pane_id=${paneId}`)); return r && Array.isArray(r.items) ? r as QueueSnapshot : null; } catch { return null; }
}
/** Add an ask to the agent's queue. The serve starts it at once when the agent is idle (and then throws the router's refusal exactly as `planGoalRun` did), else it waits its turn. */
export async function queueAdd(input: { parent: string; goal: string; engine: string; cwd: string; write: boolean; n: number; pane_id: number; always?: boolean }): Promise<{ queued: boolean; duplicate: boolean; item: QueueItem | null; run: GoalRun | null }> {
  const r = unwrap(await apiPost(`/api/v1/cockpit/queue/add`, { always: true, ...input }, { timeoutMs: 600_000, throwOnError: true }));
  return { queued: !!r?.queued, duplicate: !!r?.duplicate, item: r?.item ?? null, run: r?.run ?? null };
}
export async function queueOp(op: "cancel" | "reorder" | "reprompt" | "restore", body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; [k: string]: any }> {
  try { const r = unwrap(await apiPost(`/api/v1/cockpit/queue/${op}`, body, { timeoutMs: 20_000, throwOnError: true })); return { ok: true, ...(r ?? {}) }; }
  catch (e: any) { return { ok: false, error: String(e?.message ?? e).replace(/^POST [^ ]+ → \d{3}:?\s*/, "") }; }
}
/** WHERE A DRAGGED ITEM LANDS, among the QUEUED items only (0 = next). Dropping on a row puts the item before it, or after it in that row's lower half; dropping past the end appends. Pure - tested. */
export function dropIndex(queuedIds: number[], dragged: number, over: number | null, after: boolean): number {
  if (over === dragged) return Math.max(0, queuedIds.indexOf(dragged)); // on itself: it stays where it is
  const rest = queuedIds.filter((i) => i !== dragged);
  if (over == null) return rest.length;
  const at = rest.indexOf(over);
  if (at < 0) return rest.length;
  return at + (after ? 1 : 0);
}
