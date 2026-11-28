// THE CIRCUIT BOARD (RFC 0008 §4.12; mockup boards 1 and 2): every node a chip, an icon or a tool, wires with right angles, a loop drawn as a dashed frame, LEDs that blink while a node works and pulses along the wire that
// carries work. Read-only in a run; in the editor a node can be dragged, a wire drawn from a pin, a wire or a node removed. The board scales to the pane so the pane never scrolls sideways.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { Icon } from "./icons";
import { AgentFace, useAgentTheme } from "./themes";
import { CARD_CSS, NodeCard, StepsPanel } from "./NodeCard";
import { NodeLive } from "./NodeLive";
import { CARD, CHIP, COL_W, ICON, PAD, leaderOf, codeOf, faceOf, letterOf, TOOL, isFailPort, iconOf, layoutGraph, loopFrames, loopProgress, modelLine, money, nodeState, portLabel, shapeOf, sublabel, titleOf, wirePath, type Box, type NodeState } from "./model";
import type { Graph, Run } from "./types";

const LED: Record<NodeState, string> = { idle: "#44484d", working: "#4f9cc4", waiting: "#c9a34e", done: "#3f8f6c", failed: "#b0615d" };
const STATE_WORD: Record<NodeState, string> = { idle: "idle", working: "working", waiting: "waiting", done: "done", failed: "failed" };
export const BOARD_CSS = `
@keyframes tg-blink{0%,100%{opacity:1}50%{opacity:.2}}
@keyframes tg-slow{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes tg-flow{to{stroke-dashoffset:-18}}
.tg-led.working{animation:tg-blink .9s steps(2,jump-none) infinite}
.tg-led.waiting{animation:tg-slow 2.4s ease-in-out infinite}
.tg-pulse{stroke-dasharray:5 13;animation:tg-flow 1.1s linear infinite}
.tg-chip{--pin:var(--c-border);position:absolute;border:1px solid var(--c-border);border-radius:14px;background:var(--c-panel2,var(--c-panel));display:flex;flex-direction:column;justify-content:flex-start;gap:2px;padding:9px 12px 8px;box-sizing:border-box;user-select:none}
.tg-chip[data-state=working]{border-color:color-mix(in srgb,#4d8dff 60%,var(--c-border))}.tg-chip[data-state=waiting]{border-color:color-mix(in srgb,#f5a524 60%,var(--c-border))}.tg-chip[data-state=done]{border-color:color-mix(in srgb,#3ecf8e 55%,var(--c-border))}.tg-chip[data-state=failed]{border-color:color-mix(in srgb,#f04e4e 60%,var(--c-border))}
/* the circuit-board pins are gone: a card is a card (the operator 2026-11-18: "canvas view still ugly") */
.tg-chip .pl,.tg-chip .pr,.tg-chip .pt,.tg-chip .pb,.tg-chip .n1{display:none}
.tg-chip .pl,.tg-chip .pr{position:absolute;top:8px;bottom:8px;width:6px;background:repeating-linear-gradient(to bottom,var(--pin) 0 2px,transparent 2px 6px)}.tg-chip .pl{left:-6px}.tg-chip .pr{right:-6px}
.tg-chip .pt,.tg-chip .pb{position:absolute;left:14px;right:14px;height:5px;background:repeating-linear-gradient(to right,var(--pin) 0 2px,transparent 2px 6px)}.tg-chip .pt{top:-5px}.tg-chip .pb{bottom:-5px}
.tg-chip .n1{position:absolute;left:5px;top:5px;width:4px;height:4px;border-radius:50%;border:1px solid var(--pin)}
.tg-card{border:1px solid var(--c-border);border-radius:14px;background:var(--c-panel2,var(--c-panel));box-sizing:border-box;position:absolute}
.tg-card[data-state=working]{border-color:color-mix(in srgb,#4d8dff 60%,var(--c-border))}.tg-card[data-state=waiting]{border-color:color-mix(in srgb,#f5a524 60%,var(--c-border))}.tg-card[data-state=done]{border-color:color-mix(in srgb,#3ecf8e 55%,var(--c-border))}.tg-card[data-state=failed]{border-color:color-mix(in srgb,#f04e4e 60%,var(--c-border))}
.tg-icon{border:1px solid var(--c-border);border-radius:14px;background:var(--c-panel2,var(--c-panel));display:flex;align-items:center;justify-content:center;color:var(--c-muted);position:relative}
.tg-icon[data-state=waiting]{border-color:color-mix(in srgb,#f5a524 60%,var(--c-border));color:#f5a524}.tg-icon[data-state=working]{border-color:color-mix(in srgb,#4d8dff 60%,var(--c-border))}.tg-icon[data-state=done]{border-color:color-mix(in srgb,#3ecf8e 55%,var(--c-border))}
@media (prefers-reduced-motion:reduce){.tg-led.working,.tg-led.waiting{animation:none}.tg-pulse{animation:none;stroke-dasharray:5 6}}`;

export function Led({ state, size = 9 }: { state: NodeState; size?: number }) {
  return <span className={`tg-led ${state}`} data-testid="led" data-state={state} style={{ width: size, height: size, borderRadius: "50%", background: LED[state], boxShadow: "none", display: "inline-block", flex: "none" }} />;
}
const stateBorder = (s: NodeState) => C.border;

export type BoardProps = {
  graph: Graph; run?: Run | null; selected?: string | null; onSelect?: (id: string | null) => void;
  /** the editor: */ editable?: boolean; onMove?: (id: string, pos: [number, number]) => void; onWire?: (from: string, port: string, to: string) => void; selectedWire?: string | null; onSelectWire?: (key: string | null) => void;
  onDropNode?: (itemId: string, pos: [number, number]) => void; ports?: (id: string) => string[];
};
const wireKey = (e: { from: string; port: string; to: string }) => `${e.from}|${e.port}|${e.to}`;

export function Board({ graph, run = null, selected = null, onSelect, editable = false, onMove, onWire, selectedWire = null, onSelectWire, onDropNode, ports }: BoardProps) {
  const wrap = React.useRef<HTMLDivElement>(null); const [w, setW] = React.useState(900);
  React.useEffect(() => { const el = wrap.current; if (!el) return; setW(el.clientWidth || 900); if (typeof ResizeObserver === "undefined") return; const ro = new ResizeObserver(() => setW(el.clientWidth || 900)); ro.observe(el); return () => ro.disconnect(); }, []);
  const [theme] = useAgentTheme(); const cards = theme === "cards"; const [openSteps, setOpenSteps] = React.useState<Set<string>>(new Set());
  // the board wraps into lines to fit its pane (never sideways); only a pane narrower than two columns scales it down
  const maxCols = Math.max(2, Math.floor((w - PAD) / (theme === "cards" ? CARD.col : COL_W)));
  const lay = React.useMemo(() => layoutGraph(graph, maxCols, cards), [graph, maxCols, cards]);
  const scale = Math.min(1, Math.max(0.6, (w - 2) / Math.max(1, lay.width)));
  const [drag, setDrag] = React.useState<{ id: string; dx: number; dy: number; x: number; y: number } | null>(null);
  const [wiring, setWiring] = React.useState<{ from: string; x: number; y: number } | null>(null);
  const [chooser, setChooser] = React.useState<{ from: string; to: string; ports: string[]; x: number; y: number } | null>(null);
  const boxOf = (id: string): Box => { const b = lay.boxes[id]; return drag && drag.id === id ? { ...b, x: drag.x, y: drag.y } : b; };
  const floor = Math.max(...Object.values(lay.boxes).map((b) => b.y + b.h), 0) + 6;
  const toBoard = (e: { clientX: number; clientY: number }) => { const r = wrap.current!.getBoundingClientRect(); return { x: (e.clientX - r.left + wrap.current!.scrollLeft) / scale, y: (e.clientY - r.top) / scale }; };
  const lanes: Record<string, number> = {}; const laneOf = (key: string, from: string) => (lanes[key] = (lanes[from] = (lanes[from] ?? -1) + 1));
  const states: Record<string, NodeState> = {}; for (const id of Object.keys(graph.nodes)) states[id] = nodeState(graph, run, id);
  const onUp = (e: React.PointerEvent) => {
    if (drag) { const nx = Math.max(0, Math.round(drag.x / 10) * 10), ny = Math.max(0, Math.round(drag.y / 10) * 10); onMove?.(drag.id, [nx, ny]); setDrag(null); }
    if (wiring) {
      const p = toBoard(e); const hit = Object.keys(graph.nodes).find((id) => id !== wiring.from && graph.nodes[id].node !== "leader" && p.x >= lay.boxes[id].x - 8 && p.x <= lay.boxes[id].x + lay.boxes[id].w + 8 && p.y >= lay.boxes[id].y - 8 && p.y <= lay.boxes[id].y + lay.boxes[id].h + 8);
      if (hit) { const pl = (ports?.(wiring.from) ?? ["out"]); if (pl.length <= 1) onWire?.(wiring.from, pl[0] ?? "out", hit); else setChooser({ from: wiring.from, to: hit, ports: pl, x: p.x, y: p.y }); }
      setWiring(null);
    }
  };
  const onMoveP = (e: React.PointerEvent) => { if (drag) { const p = toBoard(e); setDrag({ ...drag, x: p.x - drag.dx, y: p.y - drag.dy }); } if (wiring) { const p = toBoard(e); setWiring({ ...wiring, x: p.x, y: p.y }); } };
  const edges = graph.edges.filter((e) => lay.boxes[e.from] && lay.boxes[e.to]);

  return (
    <div ref={wrap} data-testid="board" data-scale={scale.toFixed(2)} onPointerMove={onMoveP} onPointerUp={onUp} onPointerLeave={() => { setDrag(null); setWiring(null); }} onClick={(e) => { if (e.target === e.currentTarget) { onSelect?.(null); onSelectWire?.(null); } }}
      onDragOver={(e) => { if (editable) e.preventDefault(); }} onDrop={(e) => { if (!editable) return; e.preventDefault(); const id = e.dataTransfer.getData("text/team-node"); if (id) { const p = toBoard(e); onDropNode?.(id, [Math.max(0, Math.round((p.x - 70) / 10) * 10), Math.max(0, Math.round((p.y - 30) / 10) * 10)]); } }}
      style={{ position: "relative", width: "100%", height: lay.height * scale, overflowX: scale <= 0.601 ? "auto" : "hidden", overflowY: "hidden", background: `radial-gradient(circle at 1px 1px, color-mix(in srgb, ${C.border} 60%, transparent) 1px, transparent 1.4px) 0 0/22px 22px, ${C.panel2}`, touchAction: "pan-y pinch-zoom" }}>
      <style>{BOARD_CSS}{cards ? CARD_CSS : ""}</style>
      <div style={{ position: "absolute", left: 0, top: 0, width: lay.width, height: lay.height, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        {Object.keys(graph.nodes).filter((id) => graph.nodes[id].node === "loop").flatMap((id) => loopFrames(graph, lay, id).map((f, i) => { const p = loopProgress(run, id); const n: any = graph.nodes[id];
          return <div key={`frame-${id}-${i}`} data-testid={i === 0 ? `loop-frame-${id}` : `loop-frame-${id}-${i + 1}`} style={{ position: "absolute", left: f.x, top: f.y, width: f.w, height: f.h, border: `1.4px dashed #34373b`, borderRadius: 16, pointerEvents: "none" }}>
            {i === 0 && <span style={{ position: "absolute", left: 12, top: -10, background: C.panel2, padding: "0 8px", fontFamily: mono, fontSize: 10.5, color: C.fg, display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name="loop" size={13} />{titleOf(id, n)} · {p ? `pass ${p.n} of ${p.max}` : `up to ${n.max_iterations} passes`}{n.cap_usd ? ` · cap ${money(n.cap_usd)}` : ""}</span>}</div>; }))}
        <svg width={lay.width} height={lay.height} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
          {edges.map((e) => { const key = wireKey(e); const back = lay.back.has(key) || boxOf(e.to).x <= boxOf(e.from).x; const { d, label } = wirePath(boxOf(e.from), boxOf(e.to), back || isFailPort(e.port) && boxOf(e.to).x <= boxOf(e.from).x + 8, laneOf(key, e.from), floor);
            const carrying = (states[e.to] === "working" || states[e.to] === "waiting") && (states[e.from] === "done" || states[e.from] === "idle" && false); const fail = isFailPort(e.port); const sel = selectedWire === key;
            return <g key={key}>
              <path d={d} fill="none" stroke={fail ? "color-mix(in srgb, #f04e4e 45%, var(--c-border))" : sel ? C.brand : "var(--c-border)"} strokeWidth={sel ? 2.2 : 1.2} strokeDasharray={fail || back ? "3 5" : undefined} opacity={fail ? 0.8 : 1} />
              {carrying && <path d={d} fill="none" stroke="#4d8dff" strokeWidth={1.6} className="tg-pulse" data-testid="pulse" />}
              {editable && <path d={d} fill="none" stroke="transparent" strokeWidth={12} style={{ pointerEvents: "stroke", cursor: "pointer" }} data-testid={`wire-${key}`} onClick={(ev) => { ev.stopPropagation(); onSelectWire?.(sel ? null : key); onSelect?.(null); }} />}
              {portLabel(e) && <text x={label.x} y={label.y} fill={fail ? "#8a4a47" : "#595e64"} fontSize="10" fontFamily="ui-monospace, monospace">{portLabel(e)}</text>}
            </g>; })}
          {wiring && <path d={`M${boxOf(wiring.from).x + boxOf(wiring.from).w} ${boxOf(wiring.from).y + boxOf(wiring.from).h / 2} L${wiring.x} ${wiring.y}`} stroke={C.brand} strokeWidth={2} strokeDasharray="4 4" fill="none" />}
        </svg>
        {Object.keys(graph.nodes).map((id) => {
          const n = graph.nodes[id]; const b = boxOf(id); const st = states[id]; const sel = selected === id; const shape = shapeOf(n);
          const common: React.CSSProperties = { position: "absolute", left: 0, top: 0, width: b.w, height: b.h, cursor: editable ? "grab" : "pointer", outline: sel ? `2px solid ${C.brand}` : "none", outlineOffset: 3, userSelect: "none", opacity: st === "idle" && run ? 0.66 : 1, touchAction: editable ? "none" : undefined };   // a node is dragged by a finger in the editor; the rest of the board scrolls the page
          const down = (e: React.PointerEvent) => { if (!editable || (e.target as HTMLElement).closest("[data-pin]")) return; const p = toBoard(e); setDrag({ id, dx: p.x - b.x, dy: p.y - b.y, x: b.x, y: b.y }); onSelect?.(id); onSelectWire?.(null); };
          const pins = editable && n.node !== "leader" && n.node !== "deliver" ? <span data-pin="out" data-testid={`pin-${id}`} title="draw a wire from here" onPointerDown={(e) => { e.stopPropagation(); const p = toBoard(e); setWiring({ from: id, x: p.x, y: p.y }); }} style={{ position: "absolute", left: b.w - 7, top: b.h / 2 - 6, width: 12, height: 12, borderRadius: "50%", background: C.brand, border: `2px solid ${C.panel2}`, cursor: "crosshair", zIndex: 2 }} /> : null;
          const dim = { opacity: st === "idle" && run ? 0.7 : 1 };
          const lead = leaderOf(run); const stWord = n.node === "leader" ? lead.word : STATE_WORD[st];
          const body = cards ? <NodeCard id={id} n={n} st={st} run={run} theme={theme} lead={lead} big={shape === "chip" || shape === "leader"} selected={sel} stepsOpen={openSteps.has(id)} onSteps={() => setOpenSteps((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; })} style={{ ...common, ...dim, outline: "none" }} />
            : shape === "chip" || shape === "leader"
            ? theme !== "microchip" ? (
              <div className="tg-card" data-state={n.node === "leader" ? lead.state : st} style={{ ...common, ...dim, display: "flex", alignItems: "center", gap: 6, padding: "4px 8px 4px 4px", fontFamily: nav }}>
                <AgentFace theme={theme} face={faceOf(id, n)} code={codeOf(n)} letter={letterOf(n)} name={n.node === "leader" ? "leader" : titleOf(id, n)} state={n.node === "leader" ? lead.state : st} size={54} />
                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.node === "leader" ? "leader" : titleOf(id, n)}</div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.node === "leader" ? "your terminal" : modelLine(n).split(" · ")[0]}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: mono, fontSize: 10, color: C.dim }}><span>{money(run?.state.node_cost?.[id])}</span><span style={{ textTransform: "lowercase" }}>{stWord}</span></div>
                </div>
              </div>) : (<div className="tg-chip" data-state={n.node === "leader" ? lead.state : st} style={{ ...common, ...dim, fontFamily: nav }}>
                <span className="pl" /><span className="pr" /><span className="pt" /><span className="pb" /><span className="n1" />
                <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: ".14em", textTransform: "uppercase", color: C.dim, paddingLeft: 7 }}>{codeOf(n)}</div>
                <div style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.1, paddingLeft: 7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.node === "leader" ? "leader" : titleOf(id, n)}</div>
                <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, paddingLeft: 7, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.node === "leader" ? "your terminal" : modelLine(n).split(" · ")[0]}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 10, color: C.dim, paddingLeft: 7, marginTop: 1 }}><Led state={n.node === "leader" ? lead.state : st} size={6} /><span>{money(run?.state.node_cost?.[id])}</span><span style={{ marginLeft: "auto", textTransform: "lowercase" }}>{stWord}</span></div>
              </div>)
            : shape === "tool"
            ? <div className="tg-chip" data-state={st} style={{ ...common, ...dim, padding: "8px 10px", borderRadius: 3, fontFamily: nav, justifyContent: "center" }}>
                <span className="pl" /><span className="pr" />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ color: C.muted, display: "inline-flex" }}><Icon name={iconOf(n)} size={16} /></span><div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titleOf(id, n)}</div><div style={{ fontFamily: mono, fontSize: 10, color: C.dim, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{(n as any).tool.name} · {(n as any).starts_model ? "model" : "no model"}</div></div></div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 10, color: C.dim, marginTop: 2 }}><Led state={st} size={6} /><span>{STATE_WORD[st]}</span></div>
              </div>
            : <div style={{ ...common, ...dim, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div className="tg-icon" data-state={st} style={{ width: ICON.w, height: ICON.h }}>
                  <Icon name={iconOf(n)} size={24} />
                  {n.node === "loop" && loopProgress(run, id) && <span style={{ position: "absolute", right: -6, top: -7, fontFamily: mono, fontSize: 9.5, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 5px", color: C.muted }}>{loopProgress(run, id)!.n}/{loopProgress(run, id)!.max}</span>}
                  <span style={{ position: "absolute", left: -2, bottom: -2 }}><Led state={st} size={6} /></span>
                </div>
                <div style={{ position: "absolute", top: ICON.h + 4, width: 120, left: (b.w - 120) / 2, textAlign: "center", fontFamily: mono, fontSize: 10, color: C.dim, lineHeight: 1.25 }}>{titleOf(id, n)}{sublabel(n) ? <><br />{sublabel(n)}</> : null}</div>
              </div>;
          const strip = !cards && shape !== "icon" ? <NodeLive id={id} n={n} st={st} run={run} icons={false} style={{ position: "absolute", left: 0, top: b.h + 3, width: Math.max(b.w, 132) }} /> : null;
          return <div key={id} data-testid={`node-${id}`} data-state={st} data-kind={n.node} data-shape={shape} onPointerDown={down} onClick={(e) => { e.stopPropagation(); if (!editable) onSelect?.(id); }} style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h }}>{body}{strip}{cards && openSteps.has(id) ? <StepsPanel id={id} run={run} now={run?.live ? Date.now() : run?.state.now_ms ?? 0} /> : null}{pins}</div>;
        })}
        {chooser && <div data-testid="port-chooser" style={{ position: "absolute", left: chooser.x, top: chooser.y, zIndex: 5, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 6, display: "flex", flexDirection: "column", gap: 4, fontFamily: nav, fontSize: 12 }}>
          <div style={{ color: C.muted, fontSize: 11 }}>which port?</div>{chooser.ports.map((p) => <button key={p} data-testid={`port-${p}`} onClick={() => { onWire?.(chooser.from, p, chooser.to); setChooser(null); }} style={{ textAlign: "left", background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: mono }}>{p}</button>)}<button onClick={() => setChooser(null)} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 11 }}>cancel</button></div>}
      </div>
    </div>
  );
}
export { CHIP, TOOL };
