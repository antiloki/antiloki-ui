// GOAL RUNS PANEL (operator 2026-09-17): the orchestration surface of one agent pane.
//   new run:   goal · engine · read-only/write · up to N tasks → ⋔ plan  →  the DAG (editable: title,
//              prompt, owns, needs, acceptance) → ✓ approve & run
//   a run:     wave board (tasks by wave, status · attempt · elapsed · verdict), the shared blackboard,
//              the orchestration log, pause / resume / cancel / retry / skip, the join report.
import React from "react";
import { C, mono } from "@/loki/theme";
import { paneDisplay } from "./types";
import { CopyButton } from "./view-widgets";
import { EventId } from "./heimdall-rail";
import { planGoalRun, goalOp, taskGlyph, runLabel, goalDelivery, compareLines, savingsLine, type Comparison, type GoalRun, type GoalTask, type Tier } from "./subagents";

const chip = (on: boolean, color?: string): React.CSSProperties => ({ background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${on ? C.brand : color ?? C.border}`, color: on ? C.brand : color ?? C.muted, borderRadius: 6, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 });
const toneColor = (t: string) => (t === "ok" ? C.ok : t === "warn" ? C.warn : t === "bad" ? C.bad : t === "fg" ? C.fg : C.dim);
const fmtT = (ms: number) => new Date(ms).toLocaleTimeString();

type Draft = { id: string; title: string; prompt: string; owns: string; needs: string; acceptance: string; tier: Tier };
const toDraft = (t: GoalTask): Draft => ({ id: t.id, title: t.title, prompt: t.prompt, owns: t.owns.join(", "), needs: t.needs.join(", "), acceptance: t.acceptance.join("\n"), tier: t.tier ?? "mid" });
const fromDraft = (d: Draft) => ({ id: d.id.trim(), title: d.title.trim(), prompt: d.prompt.trim(), tier: d.tier, owns: d.owns.split(",").map((s) => s.trim()).filter(Boolean), needs: d.needs.split(",").map((s) => s.trim()).filter(Boolean), acceptance: d.acceptance.split("\n").map((s) => s.trim()).filter(Boolean) });

const TIER_TONE: Record<Tier, string> = { low: C.dim, mid: C.muted, high: C.warn };
/** the router's one line — pure, tested */
export function routeLine(run: GoalRun): string | null {
  const r = run.route; if (!r) return null;
  const n = run.tasks.length;
  return `router: tier ${r.tier} · ${r.delegate ? `${n} sub-agent${n === 1 ? "" : "s"} (${run.tasks.map((t) => `${t.id} ${t.tier ?? "mid"}`).join(", ")})` : "no delegation — one job for this terminal"} · verify ≥ ${r.verify_tier} · join ${r.join_tier}${r.confidence ? ` · ${r.confidence} confidence` : ""}${r.why ? ` — ${r.why}` : ""}${r.bias.length ? ` · heimdall: ${r.bias.join("; ")}` : ""}`;
}
export function GoalRunPanel({ parentKey, engine, worktree, runs, onRefresh, onSay, watchOnly = false, paneId, busyGoal, section }: { parentKey: string; engine: string; worktree: string; runs: GoalRun[]; onRefresh: () => void; onSay: (text: string) => void; /** the pane whose policy (router, tier, max, ask-first) the run obeys */ paneId?: number; /** a goal the pane is routing right now (its first ask) — shown as busy */ busyGoal?: string | null; /** the rail's view (2026-09-20): "screen" = the questions and assumptions only, "plan" = the plan / board / QA / report only, else everything */ section?: "all" | "screen" | "plan"; /** the plan watcher (operator 2026-09-19): no goal form — the agent starts its runs itself */ watchOnly?: boolean }) {
  const sec = section ?? "all"; const showAsk = !watchOnly && sec === "all"; const showScreen = sec !== "plan"; const showPlan = sec !== "screen";
  const [goal, setGoal] = React.useState("");
  const [n, setN] = React.useState(4);
  const [eng, setEng] = React.useState(engine);
  const [write, setWrite] = React.useState(false);
  const [planning, setPlanning] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [sel, setSel] = React.useState<number | null>(null);
  const [drafts, setDrafts] = React.useState<Draft[] | null>(null);
  const [openTask, setOpenTask] = React.useState<string | null>(null);
  const run = runs.find((r) => r.id === sel) ?? runs[0] ?? null;
  React.useEffect(() => { if (run && run.status === "awaiting-approval" && drafts === null) setDrafts(run.tasks.map(toDraft)); if (run && run.status !== "awaiting-approval" && drafts) setDrafts(null); }, [run?.id, run?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = async () => {
    if (!goal.trim()) return; setPlanning(true); setErr(null);
    // `planGoalRun` rethrows the serve's own refusal since 2026-09-28 — this panel shows it rather than guessing
    let r: Awaited<ReturnType<typeof planGoalRun>> = null;
    try { r = await planGoalRun({ parent: parentKey, goal: goal.trim(), engine: eng, cwd: worktree, write, n, ...(paneId != null ? { pane_id: paneId } : {}) }); }
    catch (e: any) { setPlanning(false); setErr(String(e?.message ?? e).replace(/^POST [^ ]+ → /, "").slice(0, 200)); return; }
    setPlanning(false);
    if (!r) { setErr("planning failed — is the chat engine worker running?"); return; }
    if (r.status === "failed") setErr(r.error ?? "the planner returned no tasks");
    setSel(r.id); setDrafts(r.tasks.map(toDraft)); setGoal(""); onRefresh();
  };
  const approve = async () => {
    if (!run) return;
    if (drafts) { const edited = drafts.map(fromDraft).filter((t) => t.title); const same = JSON.stringify(edited) === JSON.stringify(run.tasks.map((t) => fromDraft(toDraft(t)))); if (!same) await goalOp("setPlan", { id: run.id, tasks: edited }); }
    await goalOp("approve", { id: run.id }); setDrafts(null); onRefresh();
  };
  const op = async (o: "pause" | "resume" | "cancel" | "retry" | "skip", task?: string) => { if (!run) return; await goalOp(o, { id: run.id, ...(task ? { task } : {}) }); onRefresh(); };
  const [comparing, setComparing] = React.useState(false);
  // THE SCREENING GATE: the answers being typed, by question id; an untouched question takes its default
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [answering, setAnswering] = React.useState(false);
  const answer = async (useDefaults: boolean) => { if (!run) return; setAnswering(true); await goalOp("answer", { id: run.id, answers: useDefaults ? {} : answers }); setAnswering(false); setAnswers({}); onRefresh(); };
  const compare = async () => { if (!run) return; setComparing(true); await goalOp("compare", { id: run.id }); setComparing(false); onRefresh(); };
  // THE RESULT AS A PR (operator 2026-09-19): a finished write run commits its box — goal as the
  // title, joined report as the body — into the cockpit PR the Diff/review widget lists
  const waves = run ? Array.from(new Set(run.tasks.map((t) => t.wave))).sort((a, b) => a - b) : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* NEW RUN — only where the operator drives (the chat's own panel); in the wizard the agent starts runs */}
      {showAsk && <div style={{ display: "flex", flexDirection: "column", gap: 6, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", background: C.panel }}>
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} data-testid="goal-input" rows={2} spellCheck={false} placeholder={paneId != null ? "what should the agent do? — Heimdall routes it first: tier and model, one job or a plan, questions when unsure" : "a goal for the agent's sub-agents (the agent usually starts these itself)"}
          style={{ background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 9px", fontFamily: mono, fontSize: 10.5, lineHeight: 1.5, resize: "vertical", outline: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontFamily: mono, fontSize: 9.5, color: C.dim }}>
          up to {[2, 3, 4, 6, 8].map((k) => <button key={k} onClick={() => setN(k)} style={chip(n === k)}>{k}</button>)} tasks
          <span style={{ marginLeft: 6 }}>engine</span>
          {(["claude-code", "codex", "gemini", "grok", "cursor", "opencode"] as const).map((k) => <button key={k} onClick={() => setEng(k)} style={chip(eng === k)}>{paneDisplay(k).glyph} {paneDisplay(k).name}</button>)}
          <button onClick={() => setWrite((w) => !w)} title="read-only: tasks report; write: each task may edit ONLY the files it owns (enforced by the hook)" style={chip(write)}>{write ? "✎ tasks may write their files" : "👁 read-only"}</button>
          <span style={{ flex: 1 }} />
          <button data-testid="goal-plan" disabled={!goal.trim() || planning} onClick={() => void plan()} style={{ ...chip(false), color: C.fg, borderColor: C.fg, padding: "2px 10px" }}>{planning ? "planning… (the engine reads the code first)" : "⋔ plan"}</button>
        </div>
        {busyGoal && <span data-testid="goal-busy" style={{ fontFamily: mono, fontSize: 9.5, color: C.brand }}>⚡ routing “{busyGoal.slice(0, 80)}” — the router reads the code first…</span>}
        {err && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.bad }}>{err}</span>}
      </div>}
      {/* RUN PICKER */}
      {runs.length > 1 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {runs.slice().reverse().map((r) => <button key={r.id} onClick={() => { setSel(r.id); setDrafts(null); }} style={chip(run?.id === r.id)} title={r.goal}>#{r.id} · {r.status}</button>)}
        </div>
      )}
      {/* MEASURED, SO NO LONGER SAID (2026-09-26): this used to read "the router was sure enough … to plan without
          asking", which implies asking was on the table. HumanEvalComm says it is not — the planner asked in 0 of 50
          calls, a 95% upper bound of 6%. "It did not ask" is true of almost every run and is therefore no comfort at
          all; what the operator can actually use is whether it named an assumption. */}
      {run && sec === "screen" && run.status !== "awaiting-answers" && !(run.assumptions?.length) && <span data-testid="goal-screen-quiet" style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>nothing to correct — the planner named no assumption for “{run.goal.slice(0, 60)}”.</span>}
      {!run && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{watchOnly ? "nothing delegated yet — the agent starts a run itself (antiloki_delegate) when the work splits into independent parts; it lands here, live" : paneId != null ? "nothing routed yet — ask above, or type in the terminal to bypass Heimdall." : "nothing delegated yet."}</span>}
      {run && (
        <div data-testid={`goal-run-${run.id}`} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
            <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 700 }}>#{run.id}</span>
            <span style={{ fontFamily: mono, fontSize: 10, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 380 }} title={run.goal}>{run.goal}</span>
            <span style={{ fontFamily: mono, fontSize: 9.5, color: run.status === "done" ? C.ok : run.status === "failed" || run.status === "cancelled" ? C.bad : run.status === "running" ? C.warn : C.dim }}>{runLabel(run)}</span>
            <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{paneDisplay(run.engine).name} · {run.write ? "✎ write" : "read-only"} · {waves.length} wave{waves.length === 1 ? "" : "s"}</span>
            <span style={{ flex: 1 }} />
            {run.status === "awaiting-approval" && <button data-testid="goal-approve" onClick={() => void approve()} style={{ background: C.brand, border: `1px solid ${C.brand}`, color: C.bg, borderRadius: 6, padding: "3px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 700 }}>✓ approve & run</button>}
            {run.status === "running" && <button onClick={() => void op("pause")} style={chip(false)}>‖ pause</button>}
            {run.status === "paused" && <button onClick={() => void op("resume")} style={chip(false, C.ok)}>▶ resume</button>}
            {(run.status === "running" || run.status === "paused" || run.status === "awaiting-answers" || run.status === "awaiting-approval") && <button onClick={() => void op("cancel")} style={chip(false, C.bad)}>■ cancel</button>}
            {run.report && <button onClick={() => onSay(goalDelivery(run))} style={chip(false)} title="type the summary into the agent's terminal again">→ tell the agent</button>}
          </div>
          {/* THE ROUTE (2026-09-19): what the router decided — tier, delegation, the tiers of every sub-agent, the review, the join */}
          {sec !== "screen" && routeLine(run) && <div data-testid="goal-route" style={{ fontFamily: mono, fontSize: 9.5, color: run.route?.delegate ? C.muted : C.ok, padding: "5px 10px", borderBottom: `1px solid ${C.border}`, lineHeight: 1.5 }}>{routeLine(run)}</div>}
          {/* THE SCREENING GATE (2026-09-20): Heimdall graded the goal's doubts — the blocking ones wait here, once; the assumable ones are listed below as the planner's assumptions */}
          {showScreen && run.status === "awaiting-answers" && (run.questions?.length ?? 0) > 0 && (
            <div data-testid="goal-screen" style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8, borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: mono, fontSize: 10.5, color: C.warn, fontWeight: 700 }}>the router needs an answer before planning</span>
              {run.questions!.map((q) => (
                <div key={q.id} data-testid={`goal-question-${q.id}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontFamily: mono, fontSize: 10, color: C.fg, lineHeight: 1.5 }}><b style={{ color: C.brand }}>{q.id}</b> · {q.text}</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                    {q.options.map((o) => <button key={o} onClick={() => setAnswers((a) => ({ ...a, [q.id]: o }))} style={chip(answers[q.id] === o, C.brand)}>{o}</button>)}
                    <input data-testid={`goal-answer-${q.id}`} value={answers[q.id] ?? ""} placeholder={q.default ? `default: ${q.default}` : "your answer"} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} style={{ flex: 1, minWidth: 160, background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 6px", fontFamily: mono, fontSize: 9.5 }} />
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 6 }}>
                <button data-testid="goal-answer" disabled={answering} onClick={() => void answer(false)} style={{ background: C.brand, border: `1px solid ${C.brand}`, color: C.bg, borderRadius: 6, padding: "3px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 700, opacity: answering ? 0.6 : 1 }}>{answering ? "planning…" : "→ answer & plan"}</button>
                <button data-testid="goal-answer-defaults" disabled={answering} onClick={() => void answer(true)} style={chip(false)} title="every question takes the router's default">take the defaults</button>
              </div>
            </div>
          )}
          {/* WHERE SCREENING ACTUALLY LANDS (measured 2026-09-26 against HumanEvalComm, n=25 pairs).
              The planner asks in 0 of 50 calls. What it DOES do is name the reading it took: an assumption on 88%
              of underspecified asks against 48% of clear ones (z=3.03, p≈0.002) — a real, well-separated signal
              that was rendering as the smallest, dimmest text on this panel while we waited for a question that
              never comes.
              So it reads like the screening output it is, and each line is CORRECTABLE: clicking one writes the
              correction into the agent's ask, which needs no new endpoint and no second planner call. Saying "not
              that one" is the whole point — a listed assumption nobody can contradict is just a log line. */}
          {showScreen && (run.assumptions?.length ?? 0) > 0 && (
            <div data-testid="goal-assumptions" style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: C.warn, fontWeight: 700 }}>the planner chose a reading — correct it if it is wrong</span>
              {run.assumptions!.map((a, i) => (
                <button key={i} data-testid={`goal-assumption-${i}`} onClick={() => onSay(`About “${run.goal.slice(0, 80)}”: the assumption “${a}” is wrong. Instead: `)}
                  title="put this in the agent's ask so you can say what it should have assumed"
                  style={{ textAlign: "left", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 7px", cursor: "pointer", fontFamily: mono, fontSize: 10, color: C.dim, lineHeight: 1.45 }}>
                  assumed · {a}
                </button>
              ))}
            </div>
          )}
          {showPlan && run.status === "inline" && (
            <div data-testid="goal-inline" style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontFamily: mono, fontSize: 10.5, color: C.ok, fontWeight: 700 }}>one job — no sub-agents</span>
              <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>The router read the code and decided this does not deserve delegation: do it in this terminal at tier <b style={{ color: TIER_TONE[run.route?.tier ?? "mid"] }}>{run.route?.tier ?? "mid"}</b>{run.route?.why ? ` — ${run.route.why}` : ""}.</span>
              <div><button onClick={() => onSay(`${run.goal}\n\n(antiloki's router: one job, tier ${run.route?.tier ?? "mid"} — do it here, no sub-agents.)`)} style={chip(false, C.ok)}>→ do it in this terminal</button></div>
            </div>
          )}
          {/* THE PLAN (editable before approval) / THE WAVE BOARD */}
          {showPlan && <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
            {run.status === "awaiting-approval" && drafts ? (
              <>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>plan · owns = its files · needs = waits for · acceptance = how it is judged</span>
                {drafts.map((d, i) => (
                  <div key={i} data-testid={`goal-task-${d.id}`} style={{ display: "grid", gridTemplateColumns: "44px 1fr 1fr", gap: 6, alignItems: "start", borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <input value={d.id} onChange={(e) => setDrafts((ds) => ds!.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))} style={{ background: C.bg, color: C.brand, border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 5px", fontFamily: mono, fontSize: 9.5 }} />
                      <select data-testid={`goal-tier-${d.id}`} value={d.tier} onChange={(e) => setDrafts((ds) => ds!.map((x, j) => (j === i ? { ...x, tier: e.target.value as Tier } : x)))} title="the tier this sub-agent runs at" style={{ background: C.bg, color: TIER_TONE[d.tier], border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 3px", fontFamily: mono, fontSize: 9 }}>
                        <option value="low">low</option><option value="mid">mid</option><option value="high">high</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <input value={d.title} onChange={(e) => setDrafts((ds) => ds!.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="title" style={{ background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 6px", fontFamily: mono, fontSize: 10, fontWeight: 600 }} />
                      <textarea value={d.prompt} onChange={(e) => setDrafts((ds) => ds!.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)))} rows={2} placeholder="what exactly to do" style={{ background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 6px", fontFamily: mono, fontSize: 9.5, resize: "vertical" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <input value={d.owns} onChange={(e) => setDrafts((ds) => ds!.map((x, j) => (j === i ? { ...x, owns: e.target.value } : x)))} placeholder="owns: src/a/**, src/b.ts" style={{ background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 6px", fontFamily: mono, fontSize: 9.5 }} />
                      <input value={d.needs} onChange={(e) => setDrafts((ds) => ds!.map((x, j) => (j === i ? { ...x, needs: e.target.value } : x)))} placeholder="needs: t1, t2" style={{ background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 6px", fontFamily: mono, fontSize: 9.5 }} />
                      <textarea value={d.acceptance} onChange={(e) => setDrafts((ds) => ds!.map((x, j) => (j === i ? { ...x, acceptance: e.target.value } : x)))} rows={2} placeholder="acceptance, one per line" style={{ background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 6px", fontFamily: mono, fontSize: 9.5, resize: "vertical" }} />
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setDrafts((ds) => [...(ds ?? []), { id: `t${(ds?.length ?? 0) + 1}`, title: "", prompt: "", owns: "", needs: "", acceptance: "", tier: "mid" }])} style={chip(false)}>+ task</button>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{run.events.filter((e) => e.kind === "plan-fix").map((e) => e.text).join(" · ")}</span>
                </div>
              </>
            ) : (
              waves.map((w) => (
                <div key={w} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>wave {w + 1}</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 6 }}>
                    {run.tasks.filter((t) => t.wave === w).map((t) => { const g = taskGlyph(t); const tone = toneColor(g.tone); const open = openTask === t.id; return (
                      <div key={t.id} data-testid={`goal-board-${t.id}`} onClick={() => setOpenTask(open ? null : t.id)} style={{ border: `1px solid ${open ? C.brand : C.border}`, borderRadius: 7, padding: "6px 8px", background: C.bg, cursor: "pointer", display: "flex", flexDirection: "column", gap: 3, gridColumn: open ? "1 / -1" : undefined }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: tone, fontFamily: mono, fontSize: 11 }}>{g.glyph}</span>
                          <span style={{ fontFamily: mono, fontSize: 9, color: C.brand }}>{t.id}</span>
                          <span data-testid={`goal-board-tier-${t.id}`} title="the tier this sub-agent ran at" style={{ fontFamily: mono, fontSize: 8, color: TIER_TONE[t.tier ?? "mid"], border: `1px solid ${C.border}`, borderRadius: 3, padding: "0 3px" }}>{t.tier ?? "mid"}</span>
                          <span style={{ fontFamily: mono, fontSize: 10, color: C.fg, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{t.title}</span>
                          <span style={{ fontFamily: mono, fontSize: 9, color: tone, flexShrink: 0 }}>{g.state}</span>
                        </div>
                        <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>owns {t.owns.join(", ") || "—"}{t.needs.length ? ` · needs ${t.needs.join(", ")}` : ""}{t.changed.length ? ` · changed ${t.changed.length}` : ""}{t.trace?.tools?.length ? ` · ${t.trace.tools.length} tools` : ""}</span>
                        {(t.specialists?.length ?? 0) > 0 && <span data-testid={`goal-board-specialists-${t.id}`} title="the lenses the planner chose — their isolated reviews ride in the task's prompt as briefs" style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>⚉ {t.specialists!.join(", ")}{t.briefs?.length ? ` · ${t.briefs.length} brief${t.briefs.length === 1 ? "" : "s"} in`: " · briefs pending"}</span>}
                        {(t.skills?.length ?? 0) > 0 && <span data-testid={`goal-board-skills-${t.id}`} title="the skills the planner named — their SKILL.md rode in the task's prompt" style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>✧ {t.skills!.join(", ")}</span>}
                        {t.verdict && <span style={{ fontFamily: mono, fontSize: 8.5, color: t.verdict.passed ? C.ok : C.bad }}>⚖ {t.verdict.reasons.join(" · ")}</span>}
                        {(t.status === "failed" || t.status === "blocked" || t.status === "skipped") && <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}><button onClick={() => void op("retry", t.id)} style={chip(false, C.ok)}>↻ retry</button>{t.status !== "skipped" && <button onClick={() => void op("skip", t.id)} style={chip(false)}>skip</button>}</div>}
                        {open && (
                          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4, borderTop: `1px solid ${C.border}`, paddingTop: 4 }}>
                            <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{t.prompt}</span>
                            <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>acceptance: {t.acceptance.join(" · ") || "—"}</span>
                            {t.trace?.tools?.length ? <div style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{t.trace.tools.slice(0, 20).map((tl, i) => <div key={i}>· {tl.name} {tl.target}</div>)}</div> : null}
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>report</span>{t.report && <CopyButton text={t.report} />}</div>
                            <pre style={{ margin: 0, fontFamily: mono, fontSize: 10, lineHeight: 1.5, color: t.status === "failed" ? C.bad : C.fg, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 260, overflowY: "auto" }}>{t.report ?? t.error ?? (t.status === "running" ? "working…" : "—")}</pre>
                          </div>
                        )}
                      </div>
                    ); })}
                  </div>
                </div>
              ))
            )}
          </div>}
          {/* BLACKBOARD + LOG + JOIN */}
          {run.blackboard.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.border}`, padding: "6px 10px" }}>
              <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>shared blackboard · {run.blackboard.length}</span>
              {run.blackboard.slice(-8).map((b, i) => <div key={i} style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}><span style={{ color: C.brand }}>[{b.task}]</span> {b.text}</div>)}
            </div>
          )}
          <details style={{ borderTop: `1px solid ${C.border}`, padding: "6px 10px" }}>
            <summary style={{ fontFamily: mono, fontSize: 9, color: C.dim, cursor: "pointer" }}>orchestration log · {run.events.length}</summary>
            <div data-testid="goal-events" style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 4 }}>
              {run.events.slice(-60).map((e, i) => <div key={i} style={{ display: "flex", gap: 8, fontFamily: mono, fontSize: 9.5, color: e.kind === "fail" || e.kind === "error" || e.kind === "reject" || e.kind === "blocked" ? C.bad : e.kind === "pass" || e.kind === "done" ? C.ok : C.muted }}><span style={{ color: C.dim, width: 66, flexShrink: 0 }}>{fmtT(e.t)}</span><span style={{ width: 62, flexShrink: 0 }}>{e.kind}</span>{e.task && <span style={{ color: C.brand, width: 28, flexShrink: 0 }}>{e.task}</span>}<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.text}</span><EventId id={e.id} /></div>)}
            </div>
          </details>
          {/* THE ERRORS, LOUD (operator 2026-09-19: "error handling for sub-agent errors"): every failed task's
              reason on one banner, with the cure — retry, or change the engine / tier in the policy above */}
          {run.tasks.some((t) => t.status === "failed" && t.error) && (
            <div data-testid="goal-errors" style={{ borderTop: `1px solid ${C.border}`, padding: "6px 10px", background: `color-mix(in oklab, ${C.bad} 8%, transparent)`, display: "flex", flexDirection: "column", gap: 3 }}>
              {run.tasks.filter((t) => t.status === "failed" && t.error).map((t) => (
                <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: mono, fontSize: 9.5 }}>
                  <span style={{ color: C.bad, fontWeight: 700, flexShrink: 0 }}>✕ {t.id}</span>
                  <span style={{ color: C.fg, flex: 1, minWidth: 0, wordBreak: "break-word" }}>{t.error}</span>
                  <span style={{ color: C.dim, flexShrink: 0 }}>{String(t.error).startsWith("engine failure") ? "the CLI could not run — change the engine or tier in the policy, then ↻ retry" : String(t.error).startsWith("rejected twice") ? "the verifier refused it twice — read the verdict, then ↻ retry or ⏭ skip" : String(t.error).startsWith("lost:") ? "↻ retry" : ""}</span>
                </div>
              ))}
            </div>
          )}
          {run.error && <div style={{ borderTop: `1px solid ${C.border}`, padding: "6px 10px", fontFamily: mono, fontSize: 9.5, color: C.bad }}>✕ {run.error}</div>}
          {run.qa && (
            <div data-testid="goal-qa" title={`${run.qa.cmd}\n\n${run.qa.tail.slice(-1200)}`} style={{ borderTop: `1px solid ${C.border}`, padding: "5px 10px", fontFamily: mono, fontSize: 9.5, color: run.qa.passed ? C.ok : run.qa.pre_existing ? C.warn : C.bad }}>{run.qa.passed ? "✓" : run.qa.pre_existing ? "⚠" : "✕"} QA gate — the related tests {run.qa.passed ? "passed" : `FAILED (exit ${run.qa.exit})`} on {run.qa.files.length} changed file{run.qa.files.length === 1 ? "" : "s"} in {Math.round(run.qa.ms / 1000)}s{run.qa.passed ? "" : run.qa.pre_existing ? " — already red before the change (baseline): pre-existing, not this run's doing" : " — read the tail (hover) before merging"}</div>
          )}
          {run.savings && (
            <div data-testid="goal-savings" title="what the same tokens would cost with one high-tier agent, minus what the router's tiers cost — public API list prices; a subscription pays $0 metered" style={{ borderTop: `1px solid ${C.border}`, padding: "5px 10px", fontFamily: mono, fontSize: 9.5, color: run.router === false ? C.dim : C.ok }}>⚡ {savingsLine(run.savings, run.router !== false)}</div>
          )}
          {/* THE RESULT (2026-09-21): a PR is born only when the agent is closed without discarding — this row says what
              changed and where the PR will come from; the "open PR" button left here */}
          {run.write && (run.status === "done" || run.status === "failed") && (
            <div data-testid="goal-pr" style={{ borderTop: `1px solid ${C.border}`, padding: "6px 10px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>the result</span>
              <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>{run.tasks.flatMap((t) => t.changed ?? []).length} file{run.tasks.flatMap((t) => t.changed ?? []).length === 1 ? "" : "s"} changed in the box</span>
              <span style={{ flex: 1 }} />
              {run.pr ? <span style={{ fontFamily: mono, fontSize: 9.5, color: C.ok }}>⎇ PR #{run.pr} · Diff / review</span>
                : <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }} title="close the agent (✕ on its cell) and choose Pull Request — that is where the PR is born; discard throws the box away">⎇ the pull request opens when you close the agent</span>}
            </div>
          )}
          {/* THE RAW COMPARISON (operator 2026-09-19): the same goal as one plain call, beside the run's numbers */}
          {(run.status === "done" || run.status === "failed" || run.status === "inline") && (
            <div data-testid="goal-compare" style={{ borderTop: `1px solid ${C.border}`, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>compare with raw {run.engine}</span>
                <span style={{ flex: 1 }} />
                {!run.compare && <button disabled={comparing} onClick={() => void compare()} style={chip(false, C.brand)} title="run the same goal as ONE plain call — no context pack, no lenses, no briefs, no verification — and put the numbers side by side">{comparing ? "running the raw call…" : "▶ compare"}</button>}
              </div>
              {run.compare && (
                <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: "2px 12px", fontFamily: mono, fontSize: 9.5 }}>
                  <span /><span style={{ color: C.muted, fontWeight: 700 }}>raw {run.compare.engine} · {run.compare.tier}</span><span style={{ color: C.brand, fontWeight: 700 }}>antiloki run</span>
                  {compareLines(run.compare as Comparison).map((l) => <React.Fragment key={l.label}><span style={{ color: C.dim }}>{l.label}</span><span style={{ color: C.fg }}>{l.raw}</span><span style={{ color: C.fg }}>{l.run}</span></React.Fragment>)}
                  {run.compare.error && <><span style={{ color: C.dim }}>error</span><span style={{ color: C.bad }}>{run.compare.error}</span><span /></>}
                  {run.compare.report && <><span style={{ color: C.dim }}>raw report</span><pre style={{ gridColumn: "2 / -1", margin: 0, fontFamily: mono, fontSize: 9.5, lineHeight: 1.5, color: C.muted, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflowY: "auto" }}>{run.compare.report}</pre></>}
                </div>
              )}
            </div>
          )}
          {run.report && (
            <div style={{ borderTop: `1px solid ${C.border}`, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>joined report</span><CopyButton text={run.report} /></div>
              <pre style={{ margin: 0, fontFamily: mono, fontSize: 10, lineHeight: 1.5, color: C.fg, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 320, overflowY: "auto" }}>{run.report}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
