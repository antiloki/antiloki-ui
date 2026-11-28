// WHAT THE CHAT SHOWS WHILE THE WORK HAPPENS (operator 2026-09-28, three bugs from one "add a button"):
//   1. "no text result from the AI was shown, a summary of the work finished"        → RunResult
//   2. "all indications that something is running happen outside the chat … the sub-agent loading, and thinking
//       words, just like Claude Code does, below the question"                        → LiveLine
//   3. "a screening question was made, I answered, and my answer with the question didn't appear on the chat,
//       only on the side pane. The chat window is where the user should see live information" → ScreeningCard
//
// All three read the goal runs the pane already polls (`routes`). Nothing here is computed twice: the run's own
// status, tasks and events say what is happening; this file only draws it where the operator is looking.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiPost } from "@/loki/api/client";
import { BubbleBody } from "@/loki/chat/chat-thread";
import { runIsMoving } from "@/loki/chat/qa-live";
import { goalOp, type GoalRun } from "@/loki/widgets/subagents";
import { FlowBlock } from "./chat-flow";
import { Icon } from "@/loki/team/icons";

const GLYPHS = ["✻", "✽", "✶", "✳", "✢", "·", "✢", "✳", "✶", "✽"];
// Claude Code's own habit: a different word every few seconds, so a long wait reads as alive rather than frozen.
const THINKING = ["Thinking", "Pondering", "Weighing it up", "Working it out", "Mulling", "Reasoning", "Considering"];
const PLANNING = ["Planning", "Reading the code", "Deciding the shape", "Splitting the work", "Checking the plan"];
const WORKING = ["Working", "Writing", "Building", "Wiring it up", "Making the change"];
const WRAPPING = ["Wrapping up", "Reading the result", "Judging the work", "Adding it up"];

/** One ticking clock for every live line on screen. */
function useNow(on: boolean, every = 1000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { if (!on) return; setNow(Date.now()); const h = setInterval(() => setNow(Date.now()), every); return () => clearInterval(h); }, [on, every]);
  return now;
}

/** "12s" · "1m 04s". Pure — tested. */
export function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** The run that is moving right now, newest first — the one the live line describes. Pure — tested. */
export function liveRunOf(runs: GoalRun[]): GoalRun | null {
  const live = runs.filter((r) => r.status === "planning" || r.status === "running" || r.status === "joining" || r.status === "awaiting-approval");
  return live.sort((a, b) => b.created - a.created)[0] ?? null;
}

/** What the run is doing in words: the stage, the verbs to rotate through, and one line about the sub-agents. Pure — tested. */
export function liveWords(run: GoalRun | null): { verbs: string[]; sub: string | null; last: string | null } {
  if (!run) return { verbs: THINKING, sub: null, last: null };
  const events = run.events ?? [];
  const last = events.length ? events[events.length - 1].text : null;
  const seat = run.pair?.hands_model ? `${run.pair.hands.split(":")[0]} · ${run.pair.hands_model}` : (run.workers ?? null);
  if (run.status === "planning") return { verbs: PLANNING, sub: `Heimdall is reading the ask${run.plan_binding ? ` with ${run.plan_binding}` : ""}`, last };
  if (run.status === "awaiting-approval") return { verbs: ["Waiting for your go"], sub: `${run.tasks.length} task${run.tasks.length === 1 ? "" : "s"} planned — approve in the Heimdall rail`, last };
  if (run.status === "joining") return { verbs: WRAPPING, sub: `${run.tasks.filter((t) => t.status === "done").length}/${run.tasks.length} tasks done`, last };
  const running = run.tasks.filter((t) => t.status === "running" || t.status === "verifying");
  const done = run.tasks.filter((t) => t.status === "done").length;
  const what = running.length
    ? running.map((t) => `${t.status === "verifying" ? "checking" : "writing"} “${t.title.slice(0, 48)}”`).join(" · ")
    : run.tasks.some((t) => t.status === "ready" || t.status === "pending") ? "starting the next task" : "finishing";
  return { verbs: WORKING, sub: `${run.tasks.length} sub-agent${run.tasks.length === 1 ? "" : "s"}${seat ? ` on ${seat}` : ""} · ${what} · ${done}/${run.tasks.length} done`, last };
}

/** ✻ Pondering… (12s) — and, beneath it, who is working and the last thing the run said. */
export function LiveLine({ run, since, agentBusy }: { run: GoalRun | null; since: number; agentBusy: boolean }) {
  const on = !!run || agentBusy;
  const fast = useNow(on, 140);
  const now = useNow(on, 1000);
  const { verbs, sub, last } = liveWords(run);
  if (!on) return null;
  const glyph = GLYPHS[Math.floor(fast / 140) % GLYPHS.length];
  const verb = verbs[Math.floor(now / 3200) % verbs.length];
  return (
    <div data-testid="live-line" style={{ fontFamily: mono, margin: "2px 0 4px", lineHeight: 1.6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12 }}>
        <span style={{ color: C.brand, width: 14, display: "inline-block", textAlign: "center" }}>{glyph}</span>
        <span style={{ color: C.warn, animation: "antilokiPulse 1.6s ease-in-out infinite" }}>{verb}…</span>
        <span style={{ color: C.dim, fontSize: 10.5 }}>({elapsedLabel(now - since)}{run ? ` · run #${run.id}` : ""})</span>
      </div>
      {sub && <div style={{ fontSize: 10.5, color: C.muted, paddingLeft: 22 }}>⎿ {sub}</div>}
      {last && <div style={{ fontSize: 10, color: C.dim, paddingLeft: 22, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{last.slice(0, 160)}</div>}
    </div>
  );
}

/** The one line the thread keeps of an answered question. Pure — tested. */
export function answerNote(question: string, answer: string, usedDefault: boolean): string {
  return `↳ you answered “${question.slice(0, 120)}” — ${answer}${usedDefault ? " (the default)" : ""}`;
}

/** Heimdall's blocking question, in the thread: the words, the options, the answer box — and once answered, the
 *  thread keeps the question and the answer as lines, so the conversation reads in order. */
export function ScreeningCard({ run, paneId, onChanged }: { run: GoalRun; paneId: number; onChanged?: () => void }) {
  const qs = (run.questions ?? []).filter((q) => !q.answer);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  if (run.status !== "awaiting-answers" || !qs.length) return null;
  const submit = async (useDefaults: boolean) => {
    setBusy(true);
    try {
      await goalOp("answer", { id: run.id, answers: useDefaults ? {} : answers });
      // THE ANSWER LIVES IN THE THREAD, NOT ONLY ON THE RAIL — a note the serve persists, so it survives a reload
      for (const q of qs) {
        const typed = (useDefaults ? "" : (answers[q.id] ?? "")).trim();
        const said = typed || q.default || "antiloki decides";
        try { await apiPost("/api/v1/cockpit/agent/note", { pane_id: paneId, tone: "ok", text: answerNote(q.text, said, !typed) }, { timeoutMs: 10_000 }); } catch { /* the answer still went to the run */ }
      }
      setAnswers({});
      onChanged?.();
    } finally { setBusy(false); }
  };
  const chip = (on: boolean): React.CSSProperties => ({ fontFamily: mono, fontSize: 10.5, padding: "2px 10px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? C.brand : C.border}`, background: on ? `color-mix(in oklab, ${C.brand} 18%, transparent)` : "transparent", color: on ? C.brand : C.muted });
  // QA SENT THE RUN BACK AND IT IS STILL WRONG: the same card, worded for that (the question is the serve's; the answer steers the workers)
  const qa = qs.some((q) => q.kind === "qa-direction");
  return (
    <div data-testid="screening-card" style={{ margin: "6px 0 10px", padding: "12px", borderRadius: 12, border: `1px solid color-mix(in oklab, ${C.warn} 45%, ${C.border})`, background: C.panel, fontFamily: mono }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.fg, marginBottom: 10 }}><span style={{ color: C.warn, display: "inline-flex" }}><Icon name={qa ? "qa" : "hand"} size={15} /></span>{qa ? "QA needs your direction" : "Heimdall asks before planning"}</div>
      {qs.map((q) => (
        <div key={q.id} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: C.fg, lineHeight: 1.5, marginBottom: 5, whiteSpace: "pre-wrap" }}>{q.text}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {(q.options ?? []).map((o) => <button key={o} disabled={busy} onClick={() => setAnswers((a) => ({ ...a, [q.id]: o }))} style={{ ...chip(answers[q.id] === o), display: "inline-flex", alignItems: "center", gap: 4 }}>{answers[q.id] === o && <Icon name="tick" size={11} />}{o}</button>)}
            <input data-testid={`screening-answer-${q.id}`} disabled={busy} value={answers[q.id] ?? ""} placeholder={q.default ? `default: ${q.default}` : "your answer"}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") void submit(false); }}
              style={{ flex: 1, minWidth: 160, fontFamily: mono, fontSize: 11, padding: "3px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.fg }} />
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <button data-testid="screening-go" disabled={busy} onClick={() => void submit(false)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 11, padding: "4px 12px", borderRadius: 8, border: `1px solid ${C.brand}`, background: C.brand, color: C.bg, cursor: "pointer" }}><Icon name="play" size={11} />{busy ? "sending…" : qa ? "send my direction" : "answer & plan"}</button>
        <button data-testid="screening-defaults" disabled={busy} onClick={() => void submit(true)} style={{ ...chip(false), display: "inline-flex", alignItems: "center", gap: 5 }} title={qa ? "accept the run as it is, with QA's verdict written on it" : "every question takes the router's default"}><Icon name="bolt" size={11} />{qa ? "accept as it is" : "take the defaults"}</button>
      </div>
    </div>
  );
}

/** The worker's report is prose followed by a pasted diff; the chat wants the prose. Cuts at the first code fence or
 *  diff header and keeps what came before — unless nothing came before, then the whole report stands. Pure — tested. */
export function resultProse(report: string): { text: string; cut: boolean } {
  const at = report.search(/```|^diff --git |^--- a\/|^@@ /m);
  const head = at > 0 ? report.slice(0, at).replace(/[\s⏎↵-]+$/u, "").trimEnd() : "";
  return head.trim().length >= 20 ? { text: head, cut: true } : { text: report, cut: false };
}

/** WHERE A RESULT BELONGS IN TIME (operator 2026-09-29: the report of the run appeared ABOVE the answer that produced it). A run's result was
 *  drawn inside the exchange that started it; but an answer to Heimdall's question is a later exchange, and the report lands after it. The result
 *  is drawn in the LAST exchange the operator opened before the run ended - the run's own story stays where it started. Pure - tested.
 *  Returns exchange index -> the run ids whose result is drawn there. */
export function resultHomes(exchanges: { user?: { t: number }; stories: number[] }[], runs: { id: number; ended?: number | null }[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  exchanges.forEach((x, j) => {
    for (const id of x.stories) {
      const run = runs.find((r) => r.id === id);
      let home = j;
      if (run?.ended) for (let k = j; k < exchanges.length; k++) { const u = exchanges[k].user; if (u && u.t <= run.ended) home = k; }
      out.set(home, [...(out.get(home) ?? []), id]);
    }
  });
  return out;
}

/** THE REPORT'S ONE LINE (operator 2026-10-08: "the report should be 1 line with an expand button"): its first sentence, markdown
 *  marks off, ellipsized. Pure \u2014 tested. */
export function firstSentence(report: string, max = 110): string {
  const line = report.replace(/```[\s\S]*?```/g, " ").split("\n").map((l) => l.replace(/^[#>*\-\s]+/, "").replace(/^\d+[.)]\s+/, "").replace(/[*_`]/g, "").trim()).find(Boolean) ?? "";
  const m = /^(.+?[.!?])(\s|$)/.exec(line);
  const s = m ? m[1] : line;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}\u2026` : s;
}

/** THE END OF EVERYTHING (operator 2026-10-08): nothing in the thread is moving - the agent is not busy, no send is in flight, and no run is
 *  planning, working, waiting on the operator or being judged by QA (`qa_pending`: judging, or sending the run back). Pure \u2014 tested. */
export function threadIdle({ busy, sending, routes }: { busy: boolean; sending: boolean; routes: GoalRun[] }): boolean {
  if (busy || sending) return false;
  return !routes.some((r) => runIsMoving(r.status) || r.qa_pending);
}

/** What the finished run says it did - in the chat, the moment it lands, not only after the agent has re-read it and answered (that hand-off
 *  waits on a poll and then on a model). ONE LINE until opened (operator 2026-10-08): `\u25b8 result \u00b7 run #N \u00b7 its first sentence`, a click unfolds
 *  the report as flowing text; a long one shows its first part and a button for the rest, inline. */
export function RunResult({ run }: { run: GoalRun | null | undefined }) {
  const [shown, setShown] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  if (!run || (run.status !== "done" && run.status !== "failed") || !run.report?.trim()) return null;
  const { text: prose, cut } = resultProse(run.report);
  const MAX = 1600;
  const long = prose.length > MAX;
  const tail = cut ? "\n\n(the diff is in the story above)" : "";
  const text = long && !open ? `${prose.slice(0, MAX).trimEnd()}\n\n\u2026` : `${prose}${tail}`;
  const failed = run.status === "failed";
  const ts = run.ended ? new Date(run.ended).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : undefined;
  return (
    <div data-testid="run-result" data-open={shown ? "1" : "0"} style={{ margin: "6px 0 10px" }}>
      <button data-testid="run-result-toggle" onClick={() => setShown((s) => !s)} title={shown ? "fold the report to one line" : "unfold the whole report"}
        style={{ display: "flex", alignItems: "baseline", gap: 6, width: "100%", textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: mono, fontSize: 11, color: C.muted }}>
        <span>{shown ? "\u25be" : "\u25b8"}</span>
        <span style={{ color: failed ? C.bad : C.ok, fontWeight: 700, whiteSpace: "nowrap" }}>{failed ? "run failed" : "result"} {"\u00b7"} run #{run.id}</span>
        {!shown && <span data-testid="run-result-line" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.dim }}>{"\u00b7"} {firstSentence(prose)}</span>}
        {shown && <span style={{ flex: 1 }} />}
        {ts && <span style={{ color: C.dim, fontSize: 10 }}>{ts}</span>}
      </button>
      {shown && (
        <FlowBlock kind="result" tone={failed ? "bad" : undefined}>
          <BubbleBody text={text} />
          {long && <button data-testid="run-result-expand" onClick={() => setOpen((o) => !o)} style={{ display: "block", background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 11, padding: "2px 0 6px" }}>{open ? "\u25b4 show less" : `\u25be show the full report (${(prose.length - MAX).toLocaleString()} more characters)`}</button>}
        </FlowBlock>
      )}
    </div>
  );
}
