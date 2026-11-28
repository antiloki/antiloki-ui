// THE STORY OF A TURN, in the chat (operator 2026-09-24: "at the chat must be very clear who is working, the logs
// of its work, the diff, like stages … even gates like QA when active, tool calling from x-ray and deterministic
// gates as well. Must use natural human language based on templates … and at the end a final summary of the work
// done, stages completed, files readed and writen, x-ray features and tools accessed, tokens saved by use heimdall
// router, tokens and time used, time saved in comparation with raw frontier AI. Very beautiful, organized, simple").
//
// Every sentence here comes from GET /api/v1/cockpit/goals/story (serve/src/work_story.rs), which reads the run's
// own ledger. Nothing is computed twice: this file is a view, and if a number looks wrong the ledger is wrong.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";
import { WorkDiffView } from "./work-diff";
import { goalOpStrict } from "@/loki/widgets/subagents";
import { reasonOf } from "@/loki/api/post-strict";
import { saveQaPlan } from "@/loki/api/qa-plans";

const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;

export type StoryStage = { key: string; title: string; kind: string; who: string; machine: boolean; ok: boolean | null; went_right: boolean | null; red_is_good: boolean; detail: string; ms: number; cost: number; tokens: number };
export type StoryGate = { name: string; kind: "deterministic" | "model"; passed: boolean; score?: number | null; detail: string };
/** WHAT THE QA SAID (serve/src/work_story.rs::qa_of) - shown in the open, not in a log nobody opens */
export type StoryQa = { state: "none" | "judging" | "met" | "unmet" | "stopped"; pending: boolean; rounds: number; sent_back: number; met: number; unmet_n: number; unproven: number;
  unmet: { claim: string; why: string; by: string }[]; timeline: { kind: string; text: string; t: number }[] };
export type StoryControls = { can_stop: boolean; can_pause: boolean; can_resume: boolean; stop_label: string };
/** WHAT THE RUN CAN SAY ABOUT ITSELF WHEN IT ENDS (serve/src/confidence.rs): three words and the reasons, never a made-up percentage; `suggest_qa` = QA did not run and there is finished work to judge. */
export type Confidence = { level: "high" | "medium" | "low"; reasons: string[]; qa_ran: boolean; suggest_qa: boolean };
export type Story = {
  /** absent on an older serve */ qa?: StoryQa; controls?: StoryControls; confidence?: Confidence | null;
  run: number; goal: string; status: string; headline: string;
  who: { solo: boolean; brain: { engine: string; label: string; did: string }; hands: { engine: string; label: string; did: string } | null;
    /** the merge the agent IS, when this turn did not use it (2026-09-24) */ configured?: string | null; note?: string | null };
  router: { on: boolean; line: string };
  stages: StoryStage[]; gates: StoryGate[];
  summary: {
    stages: { done: number; failed: number; total: number };
    tasks: { total: number; done: number };
    files: { read: number; written: string[]; read_list: string[] };
    xray: { skills: string[]; specialists: string[]; tools: { name: string; count: number }[]; tool_calls: number };
    tokens: { in: number; out: number; total: number; human: string };
    money: { spent_human: string; baseline_human: string; saved_human: string; saved_pct: number; baseline_name: string; line: string } | null;
    time: { human: string; baseline_human?: string; saved_human?: string; faster?: boolean; note: string };
  };
};

/** THE PLAN HEIMDALL WROTE, AS BULLETS (operator 2026-10-09: the rewrite of the ask "should be displayed as an AI interpretation, not a user message ... a plan section ... with simple bullet points").
 *  `goal` is the prompt Heimdall consolidated from the conversation; `tasks` are the steps the run was split into. The first line, the bullets of an "Acceptance:" block (or any "- " lines) and the
 *  task titles when there is more than one step. Pure - tested. */
export type PlanInfo = { goal: string; tasks: { id: string; title: string; status: string }[] };
export function planBullets(p: PlanInfo): { headline: string; bullets: string[]; steps: string[] } {
  const lines = String(p.goal ?? "").split("\n").map((l) => l.trim());
  const first = (lines.find((l) => l && !/^(goal|acceptance|context)\s*:?\s*$/i.test(l)) ?? "").replace(/^goal\s*:\s*/i, "");
  const dash = lines.filter((l) => /^[-*•]\s+/.test(l)).map((l) => l.replace(/^[-*•]\s+/, "")).filter(Boolean);
  const steps = p.tasks.length > 1 ? p.tasks.map((t) => t.title.trim()).filter(Boolean) : [];
  return { headline: first.length > 160 ? first.slice(0, 160) + "…" : first, bullets: dash.slice(0, 8), steps: steps.slice(0, 12) };
}
export function PlanSection({ plan }: { plan: PlanInfo }) {
  const { headline, bullets, steps } = planBullets(plan);
  if (!headline && !bullets.length && !steps.length) return null;
  const li = (t: string, k: number) => <li key={k} style={{ margin: 0 }}>{t}</li>;
  return (
    <div data-testid="story-plan" style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, lineHeight: 1.55 }}>
      <div style={{ color: C.dim }}>⚡ Heimdall's plan <span style={{ color: C.muted }}>— what it understood and will do (an interpretation, not your message)</span></div>
      {headline && <div style={{ color: C.fg, marginTop: 2 }}>{headline}</div>}
      {steps.length > 0 && <ul data-testid="story-plan-steps" style={{ margin: "2px 0 0", paddingLeft: 16 }}>{steps.map(li)}</ul>}
      {bullets.length > 0 && <ul data-testid="story-plan-bullets" style={{ margin: "2px 0 0", paddingLeft: 16 }}>{bullets.map(li)}</ul>}
      <details style={{ marginTop: 3 }}><summary style={{ cursor: "pointer", color: C.dim }}>the full prompt Heimdall wrote</summary>
        <div data-testid="story-plan-full" style={{ whiteSpace: "pre-wrap", color: C.muted, marginTop: 3 }}>{plan.goal}</div></details>
    </div>
  );
}
export async function fetchStory(runId: number): Promise<Story | null> {
  try { const r = unwrap(await apiGet(`/api/v1/cockpit/goals/story?id=${runId}`, { timeoutMs: 15_000 })); return r?.story ?? null; } catch { return null; }
}

/** THE ONE TRICK OF THE LIST: nine "Checked the work on …" in a row is a log, not a story. Consecutive repeats of
 *  the SAME step (`check:t1`, `check:t2`, … share the base `check`) that all went right fold into one line.
 *
 *  Two things never fold, and both matter more than the tidiness: a stage that did not go right — that is the line
 *  the operator is scanning for — and a stage whose red is the point (`red_is_good`), because "Proved the tests
 *  fail on empty files" is the single most interesting step in a blueprint and folding it into "4 checks passed"
 *  hides the part that explains why the tests can be trusted at all. Pure — tested. */
const stepBase = (key: string) => key.split(":")[0];
export function foldStages(stages: StoryStage[]): { stage: StoryStage; folded: StoryStage[] }[] {
  const out: { stage: StoryStage; folded: StoryStage[] }[] = [];
  for (const s of stages) {
    const last = out[out.length - 1];
    const foldable = s.went_right === true && !s.red_is_good && last
      && !last.stage.red_is_good && last.stage.went_right === true
      && stepBase(last.stage.key) === stepBase(s.key);
    if (foldable) { last.folded.push(s); continue; }
    out.push({ stage: s, folded: [] });
  }
  return out;
}
/** "9 checks passed · 34 s" — the line a folded group shows instead of nine of its own. Pure. */
export function foldLabel(group: { stage: StoryStage; folded: StoryStage[] }): string | null {
  if (!group.folded.length) return null;
  const all = [group.stage, ...group.folded];
  const ms = all.reduce((a, b) => a + b.ms, 0);
  return `${all.length} checks passed · ${ms >= 1000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms)} ms`}`;
}

const tone = (right: boolean | null) => (right == null ? C.dim : right ? C.ok : C.bad);
const mark = (s: StoryStage) => (s.went_right == null ? "·" : s.went_right ? "✓" : "✗");
const ms = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)} s` : `${Math.round(n)} ms`);

function Who({ story }: { story: Story }) {
  const { brain, hands, solo } = story.who;
  const card = (label: string, role: string, did: string, color: string) => (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: `color-mix(in oklab, ${color} 6%, transparent)` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: 6, background: color, flexShrink: 0 }} />
        <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim, marginLeft: "auto" }}>{role}</span>
      </div>
      <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, lineHeight: 1.45 }}>{did}</span>
    </div>
  );
  return (
    <div data-testid="story-who" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {card(brain.label, solo ? "on its own" : "decides", brain.did, C.brand)}
        {hands && card(hands.label, "writes", hands.did, C.ok)}
      </div>
      {/* A MERGE THAT DID NOT SPLIT (operator 2026-09-24: "said that open code wrote, but was all sonnet"). The
          roster shows the agent AS a merge, so when only one side ran the story says which and why. */}
      {story.who.note && <span data-testid="story-who-note" style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.55 }}>{story.who.note}</span>}
    </div>
  );
}

function Stages({ story }: { story: Story }) {
  const groups = foldStages(story.stages);
  return (
    <div data-testid="story-stages" style={{ display: "flex", flexDirection: "column", gap: 0, borderLeft: `1px solid ${C.border}`, marginLeft: 5, paddingLeft: 12 }}>
      {groups.map((g, i) => {
        const s = g.stage; const folded = foldLabel(g);
        return (
          <div key={`${s.key}-${i}`} data-testid="story-stage" style={{ display: "flex", flexDirection: "column", gap: 1, padding: "5px 0", borderTop: i ? `1px solid color-mix(in oklab, ${C.border} 45%, transparent)` : "none" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
              <span style={{ color: tone(s.went_right), fontFamily: mono, fontSize: 10, width: 9, marginLeft: -21, textAlign: "center", background: C.bg }}>{mark(s)}</span>
              <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{folded ? folded : s.title}</span>
              {s.red_is_good && s.went_right && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 5, padding: "0 5px" }}>as intended</span>}
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, whiteSpace: "nowrap" }}>{ms(s.ms)}{s.cost > 0 ? ` · $${s.cost < 0.01 ? s.cost.toFixed(4) : s.cost.toFixed(2)}` : ""}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7, paddingLeft: 0 }}>
              <span style={{ fontFamily: mono, fontSize: 9, color: s.machine ? C.dim : C.muted, fontStyle: s.machine ? "italic" : "normal" }}>{s.who}</span>
              {!folded && s.detail && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>— {s.detail}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Gates({ gates }: { gates: StoryGate[] }) {
  const [open, setOpen] = React.useState<number | null>(null);
  if (!gates.length) return null;
  return (
    <div data-testid="story-gates" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {gates.map((g, i) => (
        <div key={i} data-testid="story-gate" onClick={() => setOpen((o) => (o === i ? null : i))}
          style={{ cursor: "pointer", borderRadius: 7, border: `1px solid ${g.passed ? C.border : C.bad}`, padding: "6px 9px", background: g.passed ? "transparent" : `color-mix(in oklab, ${C.bad} 7%, transparent)` }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{ color: g.passed ? C.ok : C.bad, fontFamily: mono, fontSize: 10 }}>{g.passed ? "✓" : "✗"}</span>
            <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{g.name}</span>
            <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 0.8, textTransform: "uppercase", color: C.dim }}>
              {g.kind === "deterministic" ? "a machine, not an opinion" : "a model's judgement"}
            </span>
            {g.score != null && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>score {g.score}</span>}
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{open === i ? "▾" : "▸"}</span>
          </div>
          <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, lineHeight: 1.5, marginTop: 3,
            ...(open === i ? {} : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }) }}>{g.detail}</div>
        </div>
      ))}
    </div>
  );
}

const Stat = ({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
    <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>{label}</span>
    <span style={{ fontFamily: mono, fontSize: strong ? 14 : 12, color: strong ? C.ok : C.fg, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    {sub && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, lineHeight: 1.4 }}>{sub}</span>}
  </div>
);

function Summary({ story }: { story: Story }) {
  const s = story.summary;
  const [files, setFiles] = React.useState(false);
  const tools = s.xray.tools.slice().sort((a, b) => b.count - a.count);
  return (
    <div data-testid="story-summary" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.border}`, background: `color-mix(in oklab, ${C.panel} 60%, transparent)` }}>
      <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: 1.4, textTransform: "uppercase", color: C.muted }}>stats detail</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
        <Stat label="stages" value={`${s.stages.done}/${s.stages.total}`} sub={s.stages.failed ? `${s.stages.failed} went wrong` : "all the way through"} />
        {s.tasks.total > 0 && <Stat label="tasks" value={`${s.tasks.done}/${s.tasks.total}`} sub="finished" />}
        <Stat label="files" value={`${s.files.written.length} written`} sub={`${s.files.read} more read`} />
        <Stat label="tokens" value={s.tokens.human} sub={`${Math.round(s.tokens.in / 1000)}k in · ${Math.round(s.tokens.out / 1000)}k out`} />
        <Stat label="time" value={s.time.human} sub={s.time.baseline_human ? `${s.time.faster ? "faster" : "slower"} by ${s.time.saved_human} than ${s.time.baseline_human} raw` : "no raw baseline yet"} />
        {s.money && <Stat label="saved" value={s.money.saved_human} sub={`paid ${s.money.spent_human} of ${s.money.baseline_human}`} strong />}
      </div>
      {s.money && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, lineHeight: 1.55 }}>{s.money.line}</div>}
      <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, lineHeight: 1.55 }}>{s.time.note}</div>
      {!!tools.length && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>tools · {s.xray.tool_calls} calls</span>
          {tools.map((t) => <span key={t.name} style={{ fontFamily: mono, fontSize: 9, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 5, padding: "0 6px" }}>{t.name} ×{t.count}</span>)}
        </div>
      )}
      {(!!s.xray.skills.length || !!s.xray.specialists.length) && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>x-ray</span>
          {[...s.xray.skills, ...s.xray.specialists].map((k) => <span key={k} style={{ fontFamily: mono, fontSize: 9, color: C.brand, border: `1px solid ${C.border}`, borderRadius: 5, padding: "0 6px" }}>{k}</span>)}
        </div>
      )}
      {!!s.files.written.length && <WorkDiffView run={story.run} />}
      {!!s.files.written.length && (
        <div>
          <button data-testid="story-files" onClick={() => setFiles((f) => !f)} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9.5, padding: 0 }}>
            {files ? "▾" : "▸"} the files it touched
          </button>
          {files && (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 4 }}>
              {s.files.written.map((f) => <span key={f} style={{ fontFamily: mono, fontSize: 9, color: C.ok }}>✎ {f}</span>)}
              {s.files.read_list.map((f) => <span key={f} style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>📄 {f}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** THE QA'S VERDICT, PLAINLY (operator 2026-09-30: "failed on qa? this should be more explicit, i didnt see anywhere that was happening a second round, also why did it fail?"). Always visible -
 *  not behind the fold: who judged, what it said, WHY, and that the work went back for another round. */
export function qaLine(q: StoryQa): { text: string; tone: "ok" | "warn" | "bad" | "dim" } {
  switch (q.state) {
    case "judging": return { text: q.sent_back > 0 ? `QA is judging round ${q.sent_back + 1}…` : "QA is judging…", tone: "warn" };
    // WHAT IT MEANS FOR A PULL REQUEST, IN THE SAME LINE (QA report BUG-011, 2026-10-06): a verdict that does not say what to do next makes the person work it out. The passed line
    // claims only what QA checked - no claim it judged is left unmet - not that the work is free of bugs.
    case "unmet": return { text: (q.sent_back > 0 ? `QA: NOT MET — sent back to the worker ${q.sent_back} time${q.sent_back === 1 ? "" : "s"}` : `QA: NOT MET — ${q.unmet.length || q.unmet_n} claim${(q.unmet.length || q.unmet_n) === 1 ? "" : "s"} unmet`) + " — not ready for a pull request", tone: "bad" };
    case "met": return { text: (q.sent_back > 0 ? `QA passed after ${q.sent_back} send-back${q.sent_back === 1 ? "" : "s"}` : "QA passed") + " — no unmet claim blocks a pull request", tone: "ok" };
    case "stopped": return { text: "QA stopped by you — the work stands as written, not verified; read it before you open a pull request", tone: "warn" };
    default: return { text: "", tone: "dim" };
  }
}
/** The one word the chat keeps of the QA: `QA judging…` · `QA ✓` · `QA ✗ not met` · `QA stopped`; nothing when QA never looked. Pure — tested. */
export function qaWord(q?: StoryQa): { text: string; color: string } | null {
  switch (q?.state) {
    case "judging": return { text: "QA judging…", color: C.warn };
    case "met": return { text: "QA ✓", color: C.ok };
    case "unmet": return { text: "QA ✗ not met", color: C.bad };
    case "stopped": return { text: "QA stopped", color: C.warn };
    default: return null;
  }
}
/** KEEP THE QA AS A REGRESSION TEST (queue item 10: the serve could already keep a passed QA plan and replay it with no model; no screen could ask). One click on a settled, passing run keeps the plan the QA ran
 *  beside the code; the serve's own reason is printed when it refuses (a plan that did not pass, or decided nothing, is not kept). Pure helper `keepLine` - tested. */
export function keepLine(r: { ok: true; plan: { slug: string } } | { ok: false; error: string }): { text: string; tone: "ok" | "bad" } {
  return r.ok ? { text: `kept as "${r.plan.slug}" - replay it any time, no model, no pictures to read`, tone: "ok" } : { text: `not kept - ${r.error}`, tone: "bad" };
}
export function KeepQaPlan({ run }: { run: number }) {
  const [busy, setBusy] = React.useState(false); const [res, setRes] = React.useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  return (
    <div data-testid="keep-qa" style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 10 }}>
      {!res?.tone || res.tone === "bad" ? <button data-testid="keep-qa-button" disabled={busy} onClick={async () => { setBusy(true); try { setRes(keepLine(await saveQaPlan(run))); } finally { setBusy(false); } }}
        title="Keep the steps and checks this QA ran as a regression test: replayed later with no model and no pictures to read"
        style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "1px 8px", cursor: busy ? "wait" : "pointer", fontFamily: mono, fontSize: 10 }}>⧉ keep this QA as a regression test</button> : null}
      {res && <span data-testid="keep-qa-result" style={{ color: res.tone === "ok" ? C.ok : C.bad }}>{res.text}</span>}
    </div>
  );
}
export function QaVerdict({ qa, run, settled }: { qa?: StoryQa; run?: number; settled?: boolean }) {
  if (!qa || (qa.state === "none" && qa.timeline.length === 0)) return null;
  const line = qaLine(qa);
  const color = line.tone === "ok" ? C.ok : line.tone === "bad" ? C.bad : line.tone === "warn" ? C.warn : C.muted;
  const sentBack = qa.timeline.filter((e) => e.kind === "qa-send-back");
  return (
    <div data-testid="qa-verdict" data-state={qa.state} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 9px", borderRadius: 8, border: `1px solid ${color}`, background: `color-mix(in oklab, ${color} 8%, transparent)` }}>
      <div style={{ fontFamily: mono, fontSize: 11, color, fontWeight: 700 }}>{line.text}</div>
      {qa.unmet.map((u, i) => (
        <div key={i} data-testid="qa-unmet" style={{ fontFamily: mono, fontSize: 10, lineHeight: 1.5, color: C.fg }}>
          <span style={{ color: C.bad }}>✗ </span>{u.claim}<div style={{ color: C.muted, paddingLeft: 14 }}>why: {u.why}{u.by ? ` — judged by ${u.by}` : ""}</div>
        </div>
      ))}
      {sentBack.length > 0 && (
        <div data-testid="qa-sent-back" style={{ fontFamily: mono, fontSize: 10, color: C.warn, lineHeight: 1.5 }}>
          ↩ {sentBack.map((e) => e.text).slice(-1)[0]?.slice(0, 260)}{sentBack.length > 1 ? ` (+${sentBack.length - 1} earlier)` : ""}
        </div>
      )}
      {settled && run != null && qa.state === "met" && !qa.pending && <KeepQaPlan run={run} />}
    </div>
  );
}

/** The line under a finished result (pure, tested): "confidence: high - the compiler or the project's tests passed on the changed files" - the strongest reason, the rest in the tooltip. */
export function confidenceLine(c: Confidence | null | undefined): { text: string; tone: "ok" | "warn" | "bad"; title: string } | null {
  if (!c || !c.level) return null;
  const tone = c.level === "high" ? "ok" : c.level === "medium" ? "warn" : "bad";
  return { text: `confidence: ${c.level}${c.reasons[0] ? ` — ${c.reasons[0]}` : ""}`, tone, title: c.reasons.join("\n") };
}
/** CONFIDENCE AFTER THE RESULT + THE OFFER TO RUN QA (operator 2026-10-10): QA is optional now, so a finished run says how far it can be trusted and, when QA did not run, offers it as a button. */
export function ConfidenceLine({ story }: { story: Story }) {
  const [busy, setBusy] = React.useState(false); const [msg, setMsg] = React.useState("");
  const line = confidenceLine(story.confidence);
  if (!line || story.status !== "done") return null;
  const color = line.tone === "ok" ? C.ok : line.tone === "warn" ? C.warn : C.bad;
  const ask = async () => { setBusy(true); setMsg(""); try { await goalOpStrict("qa", { id: story.run }); setMsg("QA started — its verdict lands in the ✓ QA rail"); } catch (e) { setMsg(`could not start QA: ${reasonOf(e)}`); } finally { setBusy(false); } };
  const offer = !!story.confidence?.suggest_qa && !(story.qa?.pending);
  return (
    <div data-testid="confidence" data-level={story.confidence!.level} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontFamily: mono, fontSize: 10 }}>
      <span data-testid="confidence-line" title={line.title} style={{ color }}>{line.text}</span>
      {offer && <button data-testid="run-qa" disabled={busy} onClick={() => void ask()} title="an isolated judge reviews the whole run: the claims, the browser evidence and the design"
        style={{ background: "transparent", border: `1px solid ${story.confidence!.level === "high" ? C.border : color}`, color: story.confidence!.level === "high" ? C.muted : color, borderRadius: 6, padding: "1px 9px", cursor: busy ? "wait" : "pointer", fontFamily: mono, fontSize: 10 }}>
        {busy ? "starting…" : "run independent QA"}</button>}
      {msg && <span data-testid="run-qa-msg" style={{ color: C.muted }}>{msg}</span>}
    </div>
  );
}

// 2026-10-13: stop confirm survives remount between the two clicks (4s expiry).
const stopArmed = new Map<number, number>();
function stopArmedFor(run: number): boolean {
  const until = stopArmed.get(run);
  if (!until) return false;
  if (Date.now() > until) { stopArmed.delete(run); return false; }
  return true;
}
function armStop(run: number) { stopArmed.set(run, Date.now() + 4000); }
function disarmStop(run: number) { stopArmed.delete(run); }

/** PAUSE / STOP (operator 2026-09-30: "a button to pause or stop an execution, so we dont be locked on a wrong execution"). Shown only while there is something to stop: a run that is planning, waiting,
 *  working - or done but still being judged, where "stop" stops the QA and keeps the work. */
export function RunControls({ story }: { story: Story }) {
  const c = story.controls;
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState("");
  // STOP KILLS THE WORKERS, so it takes a second click (audit 2026-10-01); the question lapses by itself so a stray first click never leaves a loaded button behind
  const [sure, setSure] = React.useState(() => stopArmedFor(story.run));
  React.useEffect(() => { setSure(stopArmedFor(story.run)); }, [story.run]);
  React.useEffect(() => { if (!sure) return; const h = setTimeout(() => { disarmStop(story.run); setSure(false); }, 4000); return () => clearTimeout(h); }, [sure, story.run]);
  if (!c || !(c.can_stop || c.can_resume)) return msg ? <span data-testid="run-controls-msg" style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>{msg}</span> : null;
  const qaStop = c.stop_label === "stop the QA";
  const go = async (op: "pause" | "resume" | "cancel") => {
    setBusy(op); setMsg(""); disarmStop(story.run); setSure(false);
    // goalOp swallows every failure as null, so Stop/Pause/Resume said "stopped" on a run the serve never touched; the strict call throws the reason and nothing is marked
    try { await goalOpStrict(op, { id: story.run }); setMsg(op === "cancel" ? (qaStop ? "QA stopped — the work stands, not verified" : "stopped") : op === "pause" ? "paused — running tasks finish, nothing new starts" : "resumed"); }
    catch (e) { setMsg(`could not ${op === "cancel" ? "stop" : op}: ${reasonOf(e)}`); } finally { setBusy(null); }
  };
  const btn: React.CSSProperties = { fontFamily: mono, fontSize: 10, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "1px 9px", cursor: "pointer" };
  return (
    <div data-testid="run-controls" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {c.can_pause && <button data-testid="run-pause" disabled={!!busy} onClick={() => void go("pause")} style={btn} title="running tasks finish, nothing new starts - you can resume">⏸ pause</button>}
      {c.can_resume && <button data-testid="run-resume" disabled={!!busy} onClick={() => void go("resume")} style={{ ...btn, color: C.ok, borderColor: C.ok }}>▶ resume</button>}
      {c.can_stop && <button data-testid="run-stop" disabled={!!busy} onClick={() => { if (qaStop || sure) void go("cancel"); else { armStop(story.run); setSure(true); } }} style={{ ...btn, color: C.bad, borderColor: C.bad, ...(sure ? { background: `color-mix(in oklab, ${C.bad} 14%, transparent)` } : {}) }}
        title={qaStop ? "end the QA now - the work stands as written and nothing is sent back" : "stop this run now - workers are killed"}>■ {sure ? "confirm stop" : c.stop_label}</button>}
      {msg && <span data-testid="run-controls-msg" style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>{msg}</span>}
    </div>
  );
}

/** The whole story, folded by default to its headline — a turn that went fine should cost one line of attention. */
export function WorkStory({ story, startOpen = false, plan }: { story: Story; startOpen?: boolean; plan?: PlanInfo | null }) {
  const clean = story.status === "done" && !story.gates.some((g) => !g.passed);
  // COLLAPSED, ALWAYS (operator 2026-09-28: "the stats detail box appears always expanded. It should appear collapsed"). It
  // used to open itself whenever a gate was not green — and an unproven QA line counts as not green, so it was open on
  // nearly every run. The "!" in front of the headline says something needs a look; the operator opens it.
  const [open, setOpen] = React.useState(startOpen);
  return (
    <div data-testid="work-story" style={{ display: "flex", flexDirection: "column", gap: 9, margin: "6px 0 10px", padding: "9px 11px", borderRadius: 10, border: `1px solid ${C.border}`, background: `color-mix(in oklab, ${C.panel} 35%, transparent)` }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "baseline", gap: 8, cursor: "pointer" }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: clean ? C.ok : C.warn }}>{clean ? "✓" : "!"}</span>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.fg, lineHeight: 1.45, flex: 1, minWidth: 0 }}>{story.headline}</span>
        {/* THE QA LEFT THE CHAT (operator 2026-10-08: "QA judging … shouldn't be shown inside the chat but an icon on the side pane"):
            its verdict, the live browser and the pictures are in the pane's ✓ QA rail; the chat keeps one word so it is not a secret */}
        {qaWord(story.qa) && <span data-testid="work-story-qa" data-state={story.qa!.state} title="the full verdict, the live QA and its pictures are in the ✓ QA rail at the side" style={{ fontFamily: mono, fontSize: 9.5, color: qaWord(story.qa)!.color, whiteSpace: "nowrap" }}>{qaWord(story.qa)!.text}</span>}
        <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{open ? "▾" : "▸"}</span>
      </div>
      <RunControls story={story} />
      <ConfidenceLine story={story} />
      {open && <>
        {plan && <PlanSection plan={plan} />}
        <Who story={story} />
        <div data-testid="story-router" style={{ fontFamily: mono, fontSize: 9.5, color: story.router.on ? C.muted : C.dim, lineHeight: 1.5 }}>⑂ {story.router.line}</div>
        <Stages story={story} />
        <Gates gates={story.gates} />
        <Summary story={story} />
      </>}
    </div>
  );
}
