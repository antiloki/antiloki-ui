// THE RUN'S REASONING CARD (operator 2026-11-16, from the AffectUI "reasoning summary" idea; our own flat design, mockup approved): how a run spent its time. A counter, one bar with a segment per step sized by its time, the time per kind,
// one row per seat (with the node's tier as an effort meter), the steps. Everything is read from what the run already records: the start and finish events of each node, its cost, the graph.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { ProviderIcon } from "@/loki/cowork/provider-icons";
import { money } from "./model";
import type { GNode, Run, TraceEvent } from "./types";

export type Step = { node: string; start_ms: number; end_ms: number | null; failed: boolean };
export type KindKey = "agent" | "check" | "model" | "tool" | "code" | "other";
export const KINDS: Record<KindKey, { label: string; color: string }> = { agent: { label: "Agent", color: "#6f8cff" }, check: { label: "Check", color: "#4cb782" }, model: { label: "Model call", color: "#f4b73f" }, tool: { label: "Tool", color: "#7d828b" }, code: { label: "Code", color: "#c07be8" }, other: { label: "Other", color: "#575c64" } };
const TIERS = ["low", "mid", "high"];

/** The steps of a run in the order they began, from its start / finish / failure events (they arrive newest first). A step with no end is still working. Pure. */
export function stepsOf(events: TraceEvent[]): Step[] {
  const out: Step[] = []; const open = new Map<string, Step>();
  for (const e of [...events].sort((a, b) => a.t_ms - b.t_ms || a.id - b.id)) {
    const m = /^(\S+) (started|finished|failed)\b/.exec(e.text ?? ""); if (!m) continue; const [, node, what] = m;
    if (node === "the") continue;
    if (what === "started") { const s: Step = { node, start_ms: e.t_ms, end_ms: null, failed: false }; open.set(node, s); out.push(s); }
    else { const s = open.get(node); if (s) { s.end_ms = e.t_ms; s.failed = what === "failed"; open.delete(node); } }
  }
  return out;
}
export function kindOf(n: GNode | undefined): KindKey {
  switch (n?.node) { case "role": case "leader": return "agent"; case "check": return "check"; case "llm": return "model"; case "use_tool": return "tool"; case "code": case "transform": return "code"; default: return "other"; }
}
/** The seat a node used: a model node names it; an agent step names `engine:model`, else the run's engine. Pure. */
export function seatOf(n: GNode | undefined, runEngine: string): string {
  if (!n) return ""; if (n.node === "llm") return (n as any).seat ?? ""; if (n.node === "role") { const m = (n as any).model as string | null | undefined; return m && m.trim() ? (m.includes(":") ? m.replace(/:$/, "") : `${runEngine}:${m}`) : runEngine; } return "";
}
export const effortOf = (n: GNode | undefined): number => { if (n?.node !== "role") return 1; const t = TIERS.indexOf(((n as any).tier ?? "mid") as string); return t < 0 ? 2 : t + 1; };
export const clock = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const engineOf = (seat: string) => seat.split(":")[0];

export type Seat = { seat: string; ms: number; cost: number; nodes: string[]; effort: number };
/** Time and cost per seat, longest first. Pure. */
export function seatsOf(steps: Step[], nodes: Record<string, GNode>, cost: Record<string, number>, runEngine: string, now: number): Seat[] {
  const m = new Map<string, Seat>();
  for (const s of steps) { const n = nodes[s.node]; const seat = seatOf(n, runEngine); if (!seat) continue; const e = m.get(seat) ?? { seat, ms: 0, cost: 0, nodes: [], effort: 0 }; e.ms += (s.end_ms ?? now) - s.start_ms; e.cost += cost[s.node] ?? 0; if (!e.nodes.includes(s.node)) e.nodes.push(s.node); e.effort = Math.max(e.effort, effortOf(n)); m.set(seat, e); }
  return [...m.values()].sort((a, b) => b.ms - a.ms);
}

/** `floating`: a discreet box over the corner of the pane (the operator 2026-11-17), folded to a small pill that shows the time and cost; a click opens the whole card, and a second click on its title folds it again. */
export function RunReasoning({ run, floating, facts }: { run: Run; floating?: boolean; /** what the run says about itself (status, cost, size of the team), shown beside the title */ facts?: React.ReactNode }) {
  const [folded, setFolded] = React.useState(true);
  const [open, setOpen] = React.useState<string | null>(null); const [steps, setSteps] = React.useState(false); const [hot, setHot] = React.useState<string | null>(null);
  const live = run.live || run.state.status.status === "running"; const nodes = run.graph?.nodes ?? {};
  const all = React.useMemo(() => stepsOf(run.events ?? []), [run.events]); if (!all.length) return null;
  const now = live ? run.state.now_ms || Date.now() : Math.max(...all.map((s) => s.end_ms ?? s.start_ms));
  const dur = (s: Step) => Math.max(0, (s.end_ms ?? now) - s.start_ms); const total = all.reduce((a, s) => a + dur(s), 0) || 1; const wall = Math.max(0, now - (run.state.started_ms || all[0].start_ms));
  const label = (id: string) => nodes[id]?.label || id;
  const byKind = (Object.keys(KINDS) as KindKey[]).map((k) => ({ k, ms: all.filter((s) => kindOf(nodes[s.node]) === k).reduce((a, s) => a + dur(s), 0) })).filter((x) => x.ms > 0);
  const seats = seatsOf(all, nodes, run.state.node_cost ?? {}, run.engine || "claude-code", now);
  const dim = (on: boolean): React.CSSProperties => (hot && !on ? { opacity: 0.35 } : {});
  const pulse = `@keyframes rrPulse{50%{opacity:.45}}`;
  if (floating && folded) return (
    <button data-testid="run-reasoning" data-floating="1" data-folded="1" data-live={live ? "1" : "0"} aria-label="open the reasoning of this run" onClick={() => setFolded(false)} style={{ position: "absolute", left: 14, bottom: 14, zIndex: 30, display: "inline-flex", alignItems: "center", gap: 8, height: 30, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 14, background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 82%, transparent)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", color: C.fg, fontFamily: nav, fontSize: 12.5, cursor: "pointer" }}>
      <style>{pulse}</style>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: "#6f8cff", display: "inline-block", animation: live ? "rrPulse 1.6s ease-in-out infinite" : "none" }} /><span>{live ? "Reasoning" : `Reasoned for ${clock(wall)}`}</span><span style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{live ? clock(wall) : money(run.state.spent_usd ?? 0)}</span></span>
    </button>);
  return (
    <div data-testid="run-reasoning" data-live={live ? "1" : "0"} data-floating={floating ? "1" : "0"} style={floating ? { position: "absolute", left: 14, bottom: 14, zIndex: 30, width: 340, maxWidth: "calc(100% - 28px)", maxHeight: "65%", overflowY: "auto", background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 82%, transparent)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: `1px solid ${C.border}`, borderRadius: 14, fontFamily: nav, fontSize: 12.5, color: C.fg } : { margin: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: nav, fontSize: 12.5, color: C.fg, overflow: "hidden" }}>
      <style>{pulse}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
        <span aria-hidden style={{ width: 18, height: 18, borderRadius: 5, background: "#6f8cff", display: "inline-block", animation: live ? "rrPulse 1.6s ease-in-out infinite" : "none" }} />
        <b data-testid="rr-title" style={{ fontWeight: 500 }}>{live ? "Reasoning" : `Reasoned for ${clock(wall)} · ${all.length} step${all.length === 1 ? "" : "s"}`}</b>
        <span style={{ marginLeft: "auto", color: C.muted, fontVariantNumeric: "tabular-nums" }}>{live ? clock(wall) : money(run.state.spent_usd ?? 0)}</span>
        {floating && <button data-testid="rr-fold" aria-label="fold the reasoning" onClick={() => setFolded(true)} style={{ border: 0, background: "none", color: C.muted, cursor: "pointer", font: "inherit", padding: "0 2px" }}>×</button>}
      </div>
      {facts && <div style={{ padding: "0 14px 8px" }}>{facts}</div>}
      <div role="img" aria-label={byKind.map((x) => `${KINDS[x.k].label} ${clock(x.ms)}`).join(", ")} style={{ display: "flex", gap: 2, height: 8, margin: "0 14px 10px" }}>
        {all.map((s, i) => { const k = kindOf(nodes[s.node]); return <span key={i} data-testid="rr-seg" title={`${label(s.node)} · ${clock(dur(s))}`} onMouseEnter={() => setHot(k)} onMouseLeave={() => setHot(null)} style={{ flex: Math.max(dur(s), 300), background: s.failed ? "var(--c-bad, #e5484d)" : KINDS[k].color, borderRadius: 2, animation: s.end_ms == null && live ? "rrPulse 1.6s ease-in-out infinite" : "none", ...dim(hot === k) }} />; })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px", padding: "0 14px 10px" }}>
        {byKind.map((x) => <div key={x.k} data-testid={`rr-kind-${x.k}`} onMouseEnter={() => setHot(x.k)} onMouseLeave={() => setHot(null)} style={{ display: "flex", alignItems: "center", gap: 8, height: 24, color: C.muted, ...dim(hot === x.k) }}><span style={{ width: 8, height: 8, borderRadius: 2, background: KINDS[x.k].color }} /><span style={{ color: C.fg }}>{KINDS[x.k].label}</span><span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{clock(x.ms)}</span></div>)}
      </div>
      {seats.map((s) => { const kind = kindOf(nodes[s.nodes[0]]); const dimmed = hot && hot !== kind; return (
        <div key={s.seat} style={{ borderTop: `1px solid ${C.border}`, ...(dimmed ? { opacity: 0.35 } : {}) }}>
          <button data-testid={`rr-seat-${s.seat}`} aria-expanded={open === s.seat} onClick={() => setOpen(open === s.seat ? null : s.seat)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, minHeight: 34, padding: "6px 14px", background: "none", border: 0, color: C.fg, cursor: "pointer", font: "inherit", textAlign: "left" }}>
            <ProviderIcon engine={engineOf(s.seat)} size={16} /><span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.seat}</span>
            <span aria-label={`effort ${["low", "mid", "high"][Math.max(0, s.effort - 1)]}`} style={{ display: "inline-flex", gap: 2, alignItems: "flex-end", height: 12 }}>{[1, 2, 3, 4].map((i) => <i key={i} style={{ width: 3, height: 3 + i * 2, borderRadius: 1, background: i <= s.effort ? KINDS[kind].color : C.border, display: "block" }} />)}</span>
            <span style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{clock(s.ms)}</span>
          </button>
          {open === s.seat && <div data-testid="rr-seat-detail" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 14px", padding: "6px 14px 10px 40px", color: C.muted, background: "color-mix(in srgb, currentColor 3%, transparent)" }}><span>Steps</span><span style={{ color: C.fg }}>{s.nodes.map(label).join(", ")}</span><span>Cost</span><span style={{ color: C.fg }}>{money(s.cost)}</span></div>}
        </div>); })}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderTop: `1px solid ${C.border}` }}>
        <button data-testid="rr-steps-btn" aria-expanded={steps} onClick={() => setSteps((v) => !v)} style={{ height: 24, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 5, background: "none", color: C.fg, cursor: "pointer", font: "inherit" }}>Steps · {all.length} {steps ? "▴" : "▾"}</button>
      </div>
      {steps && all.map((s, i) => { const k = kindOf(nodes[s.node]); return <div key={i} data-testid="rr-step" style={{ display: "flex", gap: 10, alignItems: "center", height: 28, padding: "0 14px", borderTop: `1px solid ${C.border}`, color: C.muted }}><span style={{ width: 8, height: 8, borderRadius: 2, background: s.failed ? "var(--c-bad, #e5484d)" : KINDS[k].color }} /><span style={{ color: C.fg, flex: 1 }}>{label(s.node)}{s.failed ? " (failed)" : ""}</span><span style={{ fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{clock(dur(s))}</span></div>; })}
    </div>
  );
}
