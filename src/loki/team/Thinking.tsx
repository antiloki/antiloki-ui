// THINKING, IN THE TEAM CHAT (approved mockup 2026-11-18, from the idea of AffectUI's Thinking State; drawn by us): while a step works, a small live panel under the conversation (a shimmer on the word, a timer, and what it is doing as it does it, from the tools it has used);
// when the step has answered, the same panel folds to one line, "Thought for 12 s · 4 steps", that opens again. Nothing here is invented: the steps are the tool uses the run recorded for that step.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { Icon } from "./icons";
import { nodeState, stepsOf, titleOf } from "./model";
import type { Graph, Run } from "./types";

const CSS = `@keyframes th-shm{to{background-position:-200% 0}}.th-shim{background:linear-gradient(90deg,var(--c-muted),var(--c-fg),var(--c-muted));background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:th-shm 1.8s linear infinite}@keyframes th-in{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}.th-step{animation:th-in .3s ease-out}@media (prefers-reduced-motion:reduce){.th-shim,.th-step{animation:none;color:inherit;-webkit-text-fill-color:currentColor}}`;
/** How long a step has been thinking (working: since it started; done: from its start to its last event), in ms, or null when the run never said. Pure. */
export function thoughtMs(run: Run, id: string, now: number): number | null {
  const evs = (run.events ?? []).filter((e) => e.actor === id).sort((a, b) => a.id - b.id); const start = [...evs].reverse().find((e) => e.kind === "start"); if (!start) return null;
  const working = id in (run.state.active ?? {}); const end = working ? now : Math.max(...evs.map((e) => e.t_ms)); return Math.max(0, end - start.t_ms);
}
export const words = (ms: number) => (ms < 1000 ? "under a second" : `${Math.round(ms / 1000)} s`);

export function Thinking({ graph, run }: { graph: Graph; run: Run }) {
  const [open, setOpen] = React.useState<string | null>(null); const now = run.state.now_ms || Date.now();
  const ids = Object.keys(graph.nodes).filter((id) => graph.nodes[id].node !== "leader");
  const working = ids.filter((id) => nodeState(graph, run, id) === "working");
  const folded = ids.filter((id) => nodeState(graph, run, id) === "done" && (run.tools_live?.[id] ?? []).length > 0);
  if (!working.length && !folded.length) return null;
  return (
    <div data-testid="thinking" style={{ display: "grid", gap: 8, fontFamily: nav, margin: "6px 0 0 42px" }}>
      <style>{CSS}</style>
      {working.map((id) => { const steps = stepsOf(id, run, now, 5); const ms = thoughtMs(run, id, now);
        return <div key={id} data-testid={`thinking-${id}`} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "8px 12px", background: "var(--c-panel2, var(--c-panel))", fontSize: 12.5 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><b style={{ fontWeight: 600 }}>{titleOf(id, graph.nodes[id])}</b><span className="th-shim" style={{ fontWeight: 500 }}>Thinking</span>{ms !== null && <span data-testid={`thinking-time-${id}`} style={{ fontFamily: mono, color: C.dim }}>{words(ms)}</span>}</div>
          {steps.length > 0 && <div style={{ marginTop: 6, display: "grid", gap: 3, color: C.muted }}>{steps.slice().reverse().map((s, i) => <div key={i} className="th-step" style={{ display: "flex", gap: 7, alignItems: "center" }}><Icon name={s.icon} size={12} />{s.text}<span style={{ marginLeft: "auto", color: C.dim, fontSize: 11 }}>{s.ago}</span></div>)}</div>}
        </div>; })}
      {folded.map((id) => { const n = (run.tools_live?.[id] ?? []).length; const ms = thoughtMs(run, id, now); const on = open === id;
        return <div key={id} data-testid={`thought-${id}`} style={{ fontSize: 12.5, color: C.muted }}>
          <button data-testid={`thought-toggle-${id}`} aria-expanded={on} onClick={() => setOpen(on ? null : id)} style={{ background: "transparent", border: 0, padding: 0, color: C.muted, fontFamily: nav, fontSize: 12.5, cursor: "pointer" }}>{on ? "▾" : "▸"} {titleOf(id, graph.nodes[id])} thought{ms !== null ? ` for ${words(ms)}` : ""} · {n} step{n === 1 ? "" : "s"}</button>
          {on && <div style={{ display: "grid", gap: 3, margin: "5px 0 0 14px" }}>{stepsOf(id, run, now, 12).map((s, i) => <div key={i} style={{ display: "flex", gap: 7, alignItems: "center" }}><Icon name={s.icon} size={12} />{s.text}</div>)}</div>}
        </div>; })}
    </div>
  );
}
