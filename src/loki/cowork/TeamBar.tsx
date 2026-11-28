// THE TEAM'S BAR (operator 2026-11-10): the strip over a team's block. It is the block's drag handle (the three panes move together), it says what the team has spent, runs a task through it, shows where the run is, and when the QA has
// rejected the work three times it is where the person is told, with every verdict.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { ROLE_LABEL } from "./team-layout";
import { InlineName } from "./InlineName";
import { todoOf, violationNote, type TeamRow, type TeamRun, type TodoItem, type TodoState } from "./teams";

export const ROLE_COLOR: Record<string, string> = { planner: "#6aa8ff", worker: "#5ad1b5", qa: "#f0b252" };
const money = (n: number) => `$${n.toFixed(n >= 1 ? 2 : 3)}`;

/** The line a run reads as, in words. Pure. */
export function runLine(r: TeamRun | null): { text: string; tone: "idle" | "working" | "ok" | "bad" } {
  if (!r) return { text: "talk to the planner to start", tone: "idle" };
  const a = r.run?.attempt ?? 0; const max = r.run?.max_attempts ?? 3;
  if (r.ended) return r.outcome === "done" ? { text: `done · ${a} attempt${a === 1 ? "" : "s"}`, tone: "ok" } : { text: "needs you", tone: "bad" };
  const phase = r.run?.phase ?? "planning";
  return { text: phase === "planning" ? "planning…" : phase === "working" ? `working · attempt ${a} of ${max}` : `QA · attempt ${a} of ${max}`, tone: "working" };
}

export function TeamBar({ team, run, cost, onStop, onDissolve, onRename, onSwap, dragProps }: {
  team: TeamRow; run: TeamRun | null; cost: number; onStop: (runId: string) => void; onDissolve: () => void; /** a pair only: the planner and the worker change places */ onSwap?: () => void; /** the team's shown name (its id never changes); returns the serve's sentence when it is refused */ onRename?: (name: string) => void;
  dragProps: { draggable: boolean; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void };
}) {
  const line = runLine(run); const going = !!run && !run.ended;
  const tone = line.tone === "bad" ? C.bad : line.tone === "ok" ? C.ok : line.tone === "working" ? C.brand : C.muted;
  const spent = run?.run?.spent_usd ?? 0;
  return (
    <div data-testid={`team-bar-${team.id}`} data-state={going ? "running" : run?.ended ? run.outcome ?? "" : "idle"} style={{ display: "flex", flexDirection: "column", flexShrink: 0, fontFamily: nav, fontSize: 12 }}>
      <div {...dragProps} title="drag this bar to move the whole team" style={{ display: "flex", alignItems: "center", gap: 10, height: 32, padding: "0 8px 0 12px", cursor: "grab", borderBottom: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.fg} 4%, transparent)`, borderRadius: "11px 11px 0 0" }}>
        <span style={{ color: C.fg, fontWeight: 600, whiteSpace: "nowrap" }}><span aria-hidden style={{ display: "inline-flex", verticalAlign: "-3px", marginRight: 6, color: C.muted }}>{team.pair ? <Glyph k="pair" /> : <Glyph k="team" />}</span>{onRename ? <InlineName value={team.name} label="the team's name" max={60} onCommit={onRename} style={{ color: C.fg, fontWeight: 600 }} /> : team.name}</span>
        <span style={{ display: "flex", gap: 6 }}>{team.members.map((m) => <span key={m.role} title={`${ROLE_LABEL[m.role]}${team.pair && m.role === "planner" ? " (it also judges the work)" : ""}: ${m.agent ?? `pane ${m.pane}`}`} style={{ color: ROLE_COLOR[m.role], background: `color-mix(in srgb, ${ROLE_COLOR[m.role]} 15%, transparent)`, borderRadius: 7, padding: "1px 8px", fontSize: 11, fontWeight: 500 }}>{team.pair && m.role === "planner" ? "planner · QA" : ROLE_LABEL[m.role]}</span>)}</span>
        <span data-testid={`team-state-${team.id}`} style={{ color: tone }}>{line.text}</span>
        {team.members.some((m) => m.baseline_dirty) && <span data-testid={`team-dirty-${team.id}`} title={`${team.members.filter((m) => m.baseline_dirty).map((m) => ROLE_LABEL[m.role]).join(" and ")}'s box already had changes when it was held read-only: they are kept as its baseline, not reverted. If they are the ${team.members.find((m) => m.baseline_dirty && m.role === "planner") ? "planner" : "QA"}'s own edits, undo them in its box (git status shows them) or unlink and link it again.`} style={{ color: C.warn, border: `1px dashed ${C.warn}`, borderRadius: 999, padding: "0 7px", fontSize: 10.5 }}>box had changes</span>}
        {violationNote(team) && <span data-testid={`team-violations-${team.id}`} title={violationNote(team)!.title} style={{ color: C.warn, border: `1px solid ${C.warn}`, borderRadius: 999, padding: "0 7px", fontSize: 10.5 }}>{violationNote(team)!.text}</span>}
        <span style={{ flex: 1 }} />
        <span data-testid={`team-cost-${team.id}`} title="what the team's agents have spent, together (each pane keeps its own meter)" style={{ color: C.muted }}>{money(cost)}{spent > 0 ? ` · this run ${money(spent)}` : ""}</span>
        {going && <button data-testid={`team-stop-${team.id}`} aria-label="stop the run" title="stop the run" onClick={() => run && onStop(run.run_id)} style={ibtn(C.warn)}><Glyph k="stop" /></button>}
        {team.pair && onSwap && <button data-testid={`team-swap-${team.id}`} aria-label="swap the planner and the worker" title="swap: the planner becomes the worker and the worker the planner" onClick={onSwap} style={ibtn(C.muted)}><Glyph k="swap" /></button>}
        <button data-testid={`team-dissolve-${team.id}`} aria-label="unlink the team" title="unlink: the panes stay, the roles go" onClick={onDissolve} style={ibtn(C.muted)}><Glyph k="unlink" /></button>
      </div>
      {run && <TodoPanel team={team.id} run={run} />}
      {run?.ended && run.outcome === "blocked" && (
        <div data-testid={`team-blocked-${team.id}`} style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.bad} 10%, ${C.panel2})`, display: "flex", flexDirection: "column", gap: 5, fontFamily: nav, fontSize: 12 }}>
          <div style={{ color: C.fg }}><b style={{ color: C.bad }}>Needs you.</b> {run.blocked}</div>
          {(run.verdicts ?? []).map((v, i) => <div key={i} style={{ color: C.muted }}>QA verdict {i + 1}: {v.results.filter((r) => !r.ok).map((r) => `${r.id} — ${r.evidence}`).join("; ") || "all passed"}</div>)}
          {run.saga ? <a href={`/sagas#saga/${run.saga}`} style={{ color: C.brand, fontFamily: mono, fontSize: 11 }}>every step is in saga {run.saga}</a> : null}
        </div>
      )}
    </div>
  );
}
const btn = (c: string): React.CSSProperties => ({ background: "transparent", border: `1px solid ${c}`, color: c, borderRadius: 6, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 11 });
/** An icon-only button of the bar (the words are its tooltip), like the buttons on the team pane. */
const ibtn = (c: string): React.CSSProperties => ({ width: 26, height: 26, display: "inline-grid", placeItems: "center", background: "transparent", border: "none", borderRadius: 8, color: c, cursor: "pointer", padding: 0 });
const PATHS: Record<string, React.ReactNode> = {
  run: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" />,
  swap: <path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4" />,
  unlink: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  pair: <><circle cx="9" cy="12" r="5" /><circle cx="15" cy="12" r="5" /></>,
  team: <><circle cx="6" cy="12" r="2.4" /><circle cx="12" cy="12" r="2.4" /><circle cx="18" cy="12" r="2.4" /><path d="M8.4 12h1.2M14.4 12h1.2" /></>,
};
function Glyph({ k }: { k: string }) { return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{PATHS[k]}</svg>; }

const MARK: Record<TodoState, { glyph: string; color: string }> = { pending: { glyph: "○", color: C.muted }, doing: { glyph: "◐", color: C.brand }, checking: { glyph: "◑", color: C.warn }, done: { glyph: "✓", color: C.ok }, failed: { glyph: "✗", color: C.bad } };
function Item({ it }: { it: TodoItem }) {
  const m = MARK[it.state];
  return (
    <li data-testid={`todo-${it.id}`} data-state={it.state} style={{ display: "flex", gap: 8, alignItems: "flex-start", listStyle: "none", lineHeight: 1.45 }}>
      <span aria-label={it.state} style={{ color: m.color, width: 14, flexShrink: 0, textAlign: "center", animation: it.state === "doing" || it.state === "checking" ? "antilokiPulse 1.2s ease-in-out infinite" : undefined }}>{m.glyph}</span>
      <span style={{ color: it.state === "done" ? C.muted : C.fg, textDecoration: it.state === "done" ? "line-through" : "none" }}>{it.text}{it.note && <span style={{ display: "block", color: C.bad, fontSize: 11.5 }}>{it.note}</span>}</span>
    </li>
  );
}
/** THE RUN AS A TO-DO LIST (operator 2026-11-10): where it is (plan, each attempt's work and QA), the planner's steps, and the acceptance criteria as the QA has judged them, moving as the run does. */
export function TodoPanel({ team, run }: { team: string; run: TeamRun }) {
  const [open, setOpen] = React.useState(true); const t = todoOf(run);
  const pipeColor = (s: string) => (s === "done" ? C.ok : s === "failed" ? C.bad : s === "doing" ? C.brand : C.muted);
  return (
    <div data-testid={`team-todo-${team}`} style={{ borderBottom: `1px solid ${C.border}`, background: C.panel2, fontFamily: nav, fontSize: 12 }}>
      <style>{"@keyframes antilokiPulse{0%,100%{opacity:1}50%{opacity:.35}}"}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", flexWrap: "wrap" }}>
        <button aria-expanded={open} aria-label={open ? "hide the to-do list" : "show the to-do list"} onClick={() => setOpen((o) => !o)} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, padding: 0 }}>{open ? "▾" : "▸"}</button>
        <span style={{ color: C.muted, fontFamily: mono, fontSize: 11 }}>{run.task.length > 70 ? `${run.task.slice(0, 70)}…` : run.task}</span>
        <span style={{ flex: 1 }} />
        <span data-testid={`team-pipeline-${team}`} style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {t.pipeline.map((p, i) => <span key={i} data-state={p.state} style={{ fontFamily: mono, fontSize: 10.5, color: pipeColor(p.state), border: `1px solid ${pipeColor(p.state)}`, borderRadius: 999, padding: "0 7px", opacity: p.state === "pending" ? 0.6 : 1 }}>{p.label}</span>)}
        </span>
      </div>
      {open && (t.steps.length > 0 || t.criteria.length > 0) && (
        <div style={{ display: "flex", gap: 24, padding: "2px 14px 10px", flexWrap: "wrap" }}>
          {t.steps.length > 0 && <div style={{ flex: "1 1 220px", minWidth: 0 }}><div style={{ color: C.muted, fontFamily: mono, fontSize: 10.5, letterSpacing: ".05em", marginBottom: 3 }}>PLAN</div><ul style={{ margin: 0, padding: 0, display: "grid", gap: 3 }}>{t.steps.map((it) => <Item key={it.id} it={it} />)}</ul></div>}
          {t.criteria.length > 0 && <div style={{ flex: "1 1 220px", minWidth: 0 }}><div style={{ color: C.muted, fontFamily: mono, fontSize: 10.5, letterSpacing: ".05em", marginBottom: 3 }}>ACCEPTANCE</div><ul style={{ margin: 0, padding: 0, display: "grid", gap: 3 }}>{t.criteria.map((it) => <Item key={it.id} it={it} />)}</ul></div>}
        </div>
      )}
    </div>
  );
}
