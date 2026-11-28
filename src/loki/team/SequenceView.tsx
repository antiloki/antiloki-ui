// THE RUN AS SWIMLANES (the operator 2026-11-22, from his reference; approved mockup): the SAME NODES as the graph. A lane per node, one card per node in its column (left to right as the work flows), the graph's own wires between them. A card says where its node is now: done, working (turning border), waiting for you (amber diamond), failed, or still to come (dashed). Click a card for its popover; drag the empty space to pan. The graph keeps its own step view.
import * as React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import { Icon } from "./icons";
import { chatOf, iconOf, isFailPort, layoutGraph, nodeState, sublabel, titleOf } from "./model";
import type { Run } from "./types";

const GLYPH: Record<string, { icon: string; color: string }> = { idle: { icon: "clock", color: "#94a3b8" }, working: { icon: "spark", color: "#60a5fa" }, waiting: { icon: "hand", color: "#f5b942" }, done: { icon: "tick", color: "#34d399" }, failed: { icon: "x", color: "#f87171" } };
const WORD: Record<string, string> = { idle: "To come", working: "Running", waiting: "Waiting for you", done: "Done", failed: "Failed" };
const CSS = `@keyframes sq-in{from{opacity:0;transform:translateY(-50%) scale(.94)}to{opacity:1;transform:translateY(-50%)}}.sq-card{animation:sq-in .35s ease both}@keyframes sq-pop{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:scale(1)}}@keyframes sq-draw{from{stroke-dasharray:1;stroke-dashoffset:1}to{stroke-dasharray:1;stroke-dashoffset:0}}.sq-wire{animation:sq-draw .45s ease-out both}@property --sq-a{syntax:'<angle>';inherits:false;initial-value:0deg}@keyframes sq-turn{to{--sq-a:360deg}}.sq-run{animation:sq-turn 3.2s linear infinite!important}@media (prefers-reduced-motion:reduce){.sq-card,.sq-run,.sq-wire,[data-testid=seq-detail]{animation:none!important}}`;
const LANE_COLORS = ["#4f7cf0", "#8b4df0", "#2aa6c8", "#3fb27a", "#e0813a", "#d4538f", "#7a8a2e", "#6b7cff"];
/** `m:ss` from the run's start. Pure. */
export const clock = (t_ms: number, start_ms: number): string => { const s = Math.max(0, Math.round((t_ms - start_ms) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
/** The lanes of a graph in the order the work flows (its columns, then top to bottom), each with its column. Pure. */
export function lanesOf(g: Run["graph"]): { id: string; col: number }[] {
  const l = layoutGraph(g); const xs = [...new Set(Object.values(l.boxes).map((b) => Math.round(b.x)))].sort((a, b) => a - b);
  return Object.keys(g.nodes).filter((id) => l.boxes[id]).map((id) => ({ id, col: xs.indexOf(Math.round(l.boxes[id].x)), y: l.boxes[id].y })).sort((a, b) => a.col - b.col || a.y - b.y).map(({ id, col }) => ({ id, col }));
}

/** how many columns of each run were already drawn once: a view that opens again (or re-mounts on a poll) shows them still, and only what changes moves */
const DRAWN = new Set<string>();
const LW = 150, COLW = 142, CW = 120, RH = 60, TOP = 46, PADX = 26;
export function SequenceView({ run }: { run: Run; onSelect?: (id: string) => void }) {
  const g = run.graph; const lanes = React.useMemo(() => lanesOf(g), [g]);
  const firstDraw = React.useRef(!DRAWN.has(run.id)); React.useEffect(() => { DRAWN.add(run.id); }, [run.id]);
  const [pick, setPick] = React.useState<string | null>(null); const [rect, setRect] = React.useState<DOMRect | null>(null);
  // DRAG THE BACKGROUND TO PAN (the operator 2026-11-22): sideways and up and down, like a map
  const box = React.useRef<HTMLDivElement>(null); const drag = React.useRef<{ x: number; y: number; sl: number; st: number; v: HTMLElement | null } | null>(null);
  const vScroller = (el: HTMLElement | null): HTMLElement | null => { let n: HTMLElement | null = el; while (n) { const oy = getComputedStyle(n).overflowY; if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n; n = n.parentElement; } return null; };
  React.useEffect(() => { const mv = (e: PointerEvent) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 3) setPick(null); if (box.current) box.current.scrollLeft = d.sl - dx; if (d.v) d.v.scrollTop = d.st - dy; }; const up = () => { if (drag.current) { drag.current = null; document.body.style.cursor = ""; } }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); return () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }; }, []);
  if (!lanes.length) return <div data-testid="seq-empty" style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, color: C.muted, fontFamily: nav, fontSize: 13 }}><Icon name="seq" size={16} />This team has no steps yet.</div>;
  const n = lanes.length; const nCols = Math.max(...lanes.map((l) => l.col)) + 1; const row = (id: string) => lanes.findIndex((l) => l.id === id); const cy = (id: string) => TOP + row(id) * RH + RH / 2; const colOf = (id: string) => lanes[row(id)].col; const X = (id: string) => LW + PADX + colOf(id) * COLW;
  const W = LW + PADX * 2 + nCols * COLW; const Hh = Math.max(TOP + n * RH + 8, 270);
  const st = (id: string) => nodeState(g, run, id); const isGate = (id: string) => g.nodes[id].node === "human" || g.nodes[id].node === "timer";
  const inX = (id: string) => (isGate(id) ? X(id) + 1 : X(id) - 1); const outX = (id: string) => (isGate(id) ? X(id) + 23 : X(id) + CW + 1);
  const back = layoutGraph(g).back; const known = g.edges.filter((e) => g.nodes[e.from] && g.nodes[e.to] && e.from !== e.to && row(e.from) >= 0 && row(e.to) >= 0); const goesBack = (e: (typeof known)[number]) => back.has(`${e.from}|${e.port}|${e.to}`) || colOf(e.to) <= colOf(e.from); const edges = known.filter((e) => !goesBack(e));
  // A RETRY IS A LOOP (the approved mockup): an edge that goes back to an earlier step is drawn as an amber dashed curve under the cards, from the step that sends work back to the one that takes it again, with a small mark at its middle
  const loops = known.filter(goesBack);
  const loopWire = (e: (typeof loops)[number]) => { const x1 = outX(e.from), y1 = cy(e.from) + 12, x2 = X(e.to) + CW / 2, y2 = cy(e.to) + 20; const drop = Math.max(y1, y2) + 26; const mx = (x1 + x2) / 2;
    return `<path class="${firstDraw.current ? "sq-wire" : ""}" pathLength="1" d="M${x1} ${y1}C${x1 + 28} ${drop} ${x2 + 28} ${drop} ${x2} ${y2}" fill="none" stroke="#f5b942" stroke-width="1.25" stroke-dasharray="3.5 3.5"/><text x="${mx}" y="${drop - 3}" text-anchor="middle" fill="#f5b942" font-size="10" font-family="ui-monospace,monospace">↻ ${e.port === "out" ? "retry" : e.port}</text>`; };
  const r = 6; const wire = (e: (typeof edges)[number], i: number) => { const x1 = outX(e.from), y1 = cy(e.from), x2 = inX(e.to), y2 = cy(e.to); const xm = X(e.to) - 11; const k = y2 > y1 ? 1 : -1;
    const d = y1 === y2 ? `M${x1} ${y1}H${x2}` : `M${x1} ${y1}H${xm - r}Q${xm} ${y1} ${xm} ${y1 + k * r}V${y2 - k * r}Q${xm} ${y2} ${xm + r} ${y2}H${x2}`; const reached = st(e.from) === "done"; const fail = isFailPort(e.port);
    return `<path class="${firstDraw.current ? "sq-wire" : ""}" pathLength="1" style="animation-delay:${(colOf(e.to) * 0.22 + 0.15).toFixed(2)}s" d="${d}" fill="none" stroke="${fail ? "#f87171" : "var(--c-dim)"}" stroke-width="1.25" ${reached ? "" : 'stroke-dasharray="3.5 3.5"'} opacity="${reached ? 1 : 0.6}"/>`; };
  const c = { working: 0, waiting: 0, done: 0, failed: 0 }; lanes.forEach((l) => { const s = st(l.id); if (s in c) c[s as keyof typeof c]++; });
  const pill = c.waiting ? ["Waiting for you", "#f5b942"] : c.failed ? ["Failed", "#f87171"] : c.working ? ["Running", "#60a5fa"] : c.done === n ? ["Done", "#34d399"] : ["Ready", "#94a3b8"];
  const say = (id: string): string => { const m = chatOf(run).filter((x) => x.from === id).pop(); return m?.text ?? ""; };
  const nameOf = (id: string) => titleOf(id, g.nodes[id]); const mark = (id: string) => <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}><Icon name={iconOf(g.nodes[id])} size={12} />{nameOf(id)}</span>;
  return (
    <div ref={box} data-testid="sequence" onPointerDown={(e) => { if (e.button !== 0 && e.button !== 2) return; if ((e.target as HTMLElement).closest("button,input,a,[role=dialog]")) return; const v = vScroller(box.current); drag.current = { x: e.clientX, y: e.clientY, sl: box.current?.scrollLeft ?? 0, st: v?.scrollTop ?? 0, v }; document.body.style.cursor = "grabbing"; }} onContextMenu={(e) => e.preventDefault()} style={{ overflow: "auto", flex: 1, minHeight: 0, maxHeight: "100%", fontFamily: nav, color: C.fg, cursor: "grab", userSelect: "none" }}>
      <style>{CSS}</style>
      <div style={{ position: "relative", width: W, minWidth: "100%", height: Hh, background: "transparent", borderRadius: 14, boxSizing: "border-box" }}>
        <div style={{ position: "absolute", left: 20, right: 20, top: 0, height: TOP, display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}><span style={{ flex: 1 }} /><span style={{ color: C.muted, fontSize: 12 }}>{c.done} of {n}</span><span data-testid="seq-pill" style={{ fontSize: 12, borderRadius: 6, padding: "3px 9px", color: pill[1], background: `color-mix(in srgb, ${pill[1]} 14%, transparent)` }}>{pill[0]}</span></div>
        {lanes.map((l, i) => <span key={`ln-${l.id}`} aria-hidden style={{ position: "absolute", left: 20, right: 20, top: TOP + i * RH, borderTop: `1px solid color-mix(in srgb, ${C.fg} 7%, transparent)` }} />)}
        <div data-testid="seq-lanes" style={{ position: "sticky", left: 0, width: LW + 6, height: 0, zIndex: 4 }}>
          {lanes.map((l, i) => { const s = st(l.id); const gl = GLYPH[s]; const col = LANE_COLORS[i % LANE_COLORS.length];
            return (
              <div key={l.id} data-testid={`seq-lane-${l.id}`} style={{ position: "absolute", left: 20, width: LW - 20, top: TOP + i * RH, height: RH, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", color: col, background: `color-mix(in srgb, ${col} 14%, transparent)` }}><Icon name={iconOf(g.nodes[l.id])} size={13} /></span>
                <span style={{ minWidth: 0 }}><b style={{ fontWeight: 600, fontSize: 13, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 96, color: "var(--c-fg)" }}>{nameOf(l.id)}</b><span style={{ color: gl.color, fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name={gl.icon} size={10} />{s}</span></span>
              </div>); })}
        </div>
        <svg width={W} height={Hh} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }} dangerouslySetInnerHTML={{ __html: edges.map(wire).join("") + loops.map(loopWire).join("") }} />
        {lanes.map((l, i) => { const id = l.id; const s = st(id); const x = X(id); const y = cy(id); const col = LANE_COLORS[i % LANE_COLORS.length]; const delay = firstDraw.current ? colOf(id) * 0.22 + 0.4 : 0;
          const open = (e: React.MouseEvent<HTMLElement>) => { if (pick === id) { setPick(null); return; } setRect(e.currentTarget.getBoundingClientRect()); setPick(id); };
          if (isGate(id)) return (
            <button key={`${id}-${s}`} data-testid={`seq-node-${id}`} data-state={s} className="sq-card" onClick={open} style={{ animationDelay: `${delay}s`, position: "absolute", left: x, top: y, width: 24, height: 24, transform: "translateY(-50%)", background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: nav, color: GLYPH[s].color }}>
              <span aria-hidden style={{ position: "absolute", left: 4, top: 4, width: 16, height: 16, border: `1.5px ${s === "idle" ? "dashed" : "solid"} ${GLYPH[s].color}`, borderRadius: 4, transform: "rotate(45deg)", background: `color-mix(in srgb, ${GLYPH[s].color} 14%, transparent)` }} />
              <span style={{ position: "absolute", left: 12, top: 30, transform: "translateX(-50%)", fontSize: 11, background: `color-mix(in srgb, ${GLYPH[s].color} 14%, transparent)`, borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>{nameOf(id)}</span></button>);
          const live = s === "working"; const todo = s === "idle";
          return (
            <button key={`${id}-${s}`} data-testid={`seq-node-${id}`} data-state={s} className={`sq-card${live ? " sq-run" : ""}`} onClick={open} title={nameOf(id)} style={{ animationDelay: `${delay}s`, position: "absolute", left: x, top: y, width: CW, height: 38, transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 6, padding: "0 10px 0 9px", borderRadius: 10, cursor: "pointer", textAlign: "left", fontFamily: nav, fontSize: 11.5, lineHeight: 1.2, color: todo ? C.muted : C.fg, minWidth: 0,
              border: live ? "1px solid transparent" : todo ? `1px dashed color-mix(in srgb, ${C.fg} 18%, transparent)` : "none",
              background: live ? `linear-gradient(${C.panel}, ${C.panel}) padding-box, conic-gradient(from var(--sq-a, 0deg), ${col}, #e86cc0, #4fb8ff, ${col}) border-box` : todo ? "transparent" : `linear-gradient(110deg, color-mix(in srgb, ${s === "failed" ? "#f87171" : s === "waiting" ? "#f5b942" : col} 20%, ${C.panel}), ${C.panel} 85%)`, outline: pick === id ? "2px solid color-mix(in srgb, #4d8dff 45%, transparent)" : "none", outlineOffset: 1 }}>
              <span style={{ color: GLYPH[s].color, fontSize: 11, flex: "none" }}>{s === "done" ? "✓" : s === "failed" ? "✕" : s === "working" ? "●" : s === "waiting" ? "!" : "○"}</span>
              <span style={{ minWidth: 0, flex: 1 }}><span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(id)}</span><span style={{ display: "block", fontFamily: mono, fontSize: 10, color: C.dim }}>{s === "idle" ? "to come" : s}</span></span>
              <span aria-hidden style={{ position: "absolute", right: -5, top: "50%", width: 8, height: 8, borderRadius: "50%", border: "1.25px solid var(--c-dim)", background: C.panel, transform: "translateY(-50%)" }} />
            </button>); })}
      </div>
      {pick !== null && g.nodes[pick] && (() => { const id = pick; const s = st(id); const stc = GLYPH[s].color; const full = say(id); const PW = 280; const PH = 250; const rr = rect ?? new DOMRect(0, 0, CW, 38); const vh = window.innerHeight, vw = window.innerWidth; const below = rr.top - PH - 10 < 8 && vh - rr.bottom > rr.top; const left = Math.max(8, Math.min(rr.left - 30, vw - PW - 8)); const top = below ? Math.min(rr.bottom + 10, vh - 80) : Math.max(8, rr.top - 10);
        const from = g.edges.filter((e) => e.to === id && g.nodes[e.from]).map((e) => e.from); const to = g.edges.filter((e) => e.from === id && g.nodes[e.to]).map((e) => e.to);
        return createPortal(
          <div data-testid="seq-detail" role="dialog" data-no-bloom style={{ position: "fixed", left, width: PW, zIndex: 2147483000, maxHeight: below ? vh - top - 8 : undefined, overflowY: "auto", ...(below ? { top, transformOrigin: `${Math.max(12, rr.left + CW / 2 - left)}px 0` } : { bottom: vh - top, transformOrigin: `${Math.max(12, rr.left + CW / 2 - left)}px 100%` }), animation: "sq-pop .2s cubic-bezier(.2,.9,.25,1.05) both", background: "color-mix(in srgb, var(--c-bg) 97%, transparent)", color: "var(--c-fg)", backdropFilter: "blur(14px)", borderRadius: 12, padding: "10px 12px 12px", fontSize: 12.5, boxShadow: "0 10px 34px rgba(0,0,0,.45)" }}>
            <style>{CSS}</style><span data-testid="seq-picked" aria-hidden style={{ display: "none" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, background: `color-mix(in srgb, ${C.fg} 8%, transparent)`, color: "var(--c-muted)" }}>Step {lanes.findIndex((l) => l.id === id) + 1}</span>
              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, color: stc, background: `color-mix(in srgb, ${stc} 14%, transparent)` }}>{WORD[s]}</span>
              <span style={{ flex: 1 }} /><button aria-label="close" data-testid="seq-close" onClick={() => setPick(null)} style={{ background: "transparent", border: "none", color: "var(--c-muted)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 2 }}>×</button></div>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{nameOf(id)}</div>
            <div style={{ margin: "4px 0 8px", color: "var(--c-muted)" }}>{sublabel(g.nodes[id]) || g.nodes[id].node}</div>
            <div style={{ lineHeight: 1.45, maxHeight: 96, overflowY: "auto", paddingBottom: 8, borderBottom: `1px solid color-mix(in srgb, ${C.fg} 10%, transparent)` }}>{full || (s === "idle" ? "Not started yet." : "—")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "42px 1fr", rowGap: 6, paddingTop: 8, alignItems: "center" }}>
              <span style={{ color: "var(--c-dim)" }}>From</span><span style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>{from.length ? from.map((f) => <React.Fragment key={f}>{mark(f)}</React.Fragment>) : <span style={{ color: "var(--c-muted)" }}>the start</span>}</span>
              <span style={{ color: "var(--c-dim)" }}>To →</span><span style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>{to.length ? to.map((t) => <React.Fragment key={t}>{mark(t)}</React.Fragment>) : <span style={{ color: "var(--c-muted)" }}>the end</span>}</span>
              {run.state.node_cost?.[id] ? <><span style={{ color: "var(--c-dim)" }}>Cost</span><span style={{ fontFamily: mono }}>${run.state.node_cost[id].toFixed(2)}</span></> : null}</div>
          </div>, document.body); })()}
    </div>
  );
}

/** What the Sequence tab shows before there is a run to draw (never the graph): the team's own lanes with soft placeholders where the cards will land. */
export function SequenceSkeleton({ graph }: { graph: Run["graph"] }) {
  const lanes = React.useMemo(() => lanesOf(graph), [graph]); const nCols = Math.max(1, ...lanes.map((l) => l.col + 1));
  return (
    <div data-testid="sequence-skeleton" aria-busy="true" style={{ overflow: "hidden", flex: 1, minHeight: 0, fontFamily: nav, color: C.fg }}>
      <style>{"@keyframes sq-sk{0%,100%{opacity:.25}50%{opacity:.6}}"}</style>
      <div style={{ position: "relative", height: TOP + lanes.length * RH + 8, width: LW + PADX * 2 + nCols * COLW }}>
        {lanes.map((l, i) => (
          <div key={l.id} style={{ position: "absolute", left: 20, right: 20, top: TOP + i * RH, height: RH, borderTop: `1px solid color-mix(in srgb, ${C.fg} 7%, transparent)`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: `color-mix(in srgb, ${C.fg} 12%, transparent)`, animation: `sq-sk 1.3s ease-in-out ${i * 0.1}s infinite` }} />
            <span style={{ fontSize: 13, fontWeight: 600, maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titleOf(l.id, graph.nodes[l.id])}</span>
            <span style={{ position: "absolute", left: LW + PADX - 20 + l.col * COLW, width: CW, height: 38, borderRadius: 10, background: `color-mix(in srgb, ${C.fg} 9%, transparent)`, animation: `sq-sk 1.3s ease-in-out ${i * 0.1}s infinite` }} />
          </div>))}
      </div>
    </div>
  );
}
