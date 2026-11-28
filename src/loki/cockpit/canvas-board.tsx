// CANVAS BOARD — the "case board" surface (operator 2026-07-16: "a canvas
// report like excalidraw · the same widgets, on a canvas · it only makes sense
// if there are CONNECTIONS between the boxes"). A generic, reusable pan/zoom
// board: cards (already-rendered widget JSX) as draggable panels, plus EDGES —
// curved arrows drawn between cards that follow them as they're dragged (the
// n8n read). Cards may declare an initial x/y (a flow layout); positions
// persist per board key in a module store so a drag survives a mode toggle.
import * as React from "react";
import { C, mono } from "@/loki/theme";

export type BoardCard = { id: string; label: string; w?: number; x?: number; y?: number; node: React.ReactNode };
export type BoardEdge = { from: string; to: string; tone?: string; label?: string };
type Box = { x: number; y: number; w: number };
const BOARD_POS: Record<string, Record<string, Box>> = {};

// side-aware curved connector: exits/enters the nearest edges of the two cards
function edgePath(a: Box & { h: number }, b: Box & { h: number }) {
  const ay = a.y + Math.min(a.h / 2, 90), by = b.y + Math.min(b.h / 2, 90);
  if (b.x >= a.x + a.w - 4) { // target to the right
    const x1 = a.x + a.w, x2 = b.x, dx = Math.max(34, (x2 - x1) * 0.5);
    return { d: `M ${x1} ${ay} C ${x1 + dx} ${ay}, ${x2 - dx} ${by}, ${x2} ${by}`, mx: (x1 + x2) / 2, my: (ay + by) / 2 };
  }
  if (a.x >= b.x + b.w - 4) { // target to the left
    const x1 = a.x, x2 = b.x + b.w, dx = Math.max(34, (x1 - x2) * 0.5);
    return { d: `M ${x1} ${ay} C ${x1 - dx} ${ay}, ${x2 + dx} ${by}, ${x2} ${by}`, mx: (x1 + x2) / 2, my: (ay + by) / 2 };
  }
  if (b.y >= a.y + a.h) { // below
    const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y, dy = Math.max(26, (y2 - y1) * 0.5);
    return { d: `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
  }
  const x1 = a.x + a.w / 2, y1 = a.y, x2 = b.x + b.w / 2, y2 = b.y + b.h, dy = Math.max(26, (y1 - y2) * 0.5);
  return { d: `M ${x1} ${y1} C ${x1} ${y1 - dy}, ${x2} ${y2 + dy}, ${x2} ${y2}`, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
}

export function CanvasBoard({ boardKey, cards, edges = [] }: { boardKey: string; cards: BoardCard[]; edges?: BoardEdge[] }) {
  const store = (BOARD_POS[boardKey] ??= {});
  const [, force] = React.useReducer((n) => n + 1, 0);
  const [view, setView] = React.useState({ tx: 12, ty: 12, s: 0.9 });
  const panRef = React.useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const dragRef = React.useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const hRef = React.useRef<Record<string, number>>({}); // measured card heights → edge anchors

  // place any card without a saved position: its declared x/y (flow layout) or a masonry slot
  const COLS = 3, GAP = 18; const colW = 320;
  const colH = React.useRef<number[]>([]);
  if (!colH.current.length) colH.current = new Array(COLS).fill(20);
  for (const c of cards) {
    if (!store[c.id]) {
      if (c.x != null || c.y != null) store[c.id] = { x: c.x ?? 20, y: c.y ?? 20, w: c.w ?? colW };
      else {
        const col = colH.current.indexOf(Math.min(...colH.current));
        store[c.id] = { x: 20 + col * (colW + GAP), y: colH.current[col], w: c.w ?? colW };
        colH.current[col] += 260 + GAP;
      }
    }
  }
  // one re-render once real heights are measured, so the edges anchor correctly
  React.useEffect(() => { const t = setTimeout(() => force(), 60); return () => clearTimeout(t); }, [cards.length]);

  const onWheel = (e: React.WheelEvent) => { e.preventDefault(); const b = boxRef.current?.getBoundingClientRect(); if (!b) return; const mx = e.clientX - b.left, my = e.clientY - b.top; const ns = Math.min(2.2, Math.max(0.3, view.s * (e.deltaY > 0 ? 0.9 : 1.1))); setView({ s: ns, tx: mx - ((mx - view.tx) / view.s) * ns, ty: my - ((my - view.ty) / view.s) * ns }); };
  const panStart = (e: React.MouseEvent) => { const el = e.target as HTMLElement; if (!el?.hasAttribute?.("data-void")) return; panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; };
  const cardDown = (e: React.MouseEvent, id: string) => { e.stopPropagation(); const p = store[id]; dragRef.current = { id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y }; };
  React.useEffect(() => {
    const mv = (e: MouseEvent) => {
      const g = panRef.current; if (g) setView((v) => ({ ...v, tx: g.tx + e.clientX - g.x, ty: g.ty + e.clientY - g.y }));
      const d = dragRef.current; if (d && store[d.id]) { store[d.id] = { ...store[d.id], x: d.ox + (e.clientX - d.sx) / view.s, y: d.oy + (e.clientY - d.sy) / view.s }; force(); }
    };
    const up = () => { panRef.current = null; dragRef.current = null; };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.s]);
  const fit = () => setView({ tx: 12, ty: 12, s: 0.9 });

  const ids = new Set(cards.map((c) => c.id));
  const live = edges.filter((e) => ids.has(e.from) && ids.has(e.to) && store[e.from] && store[e.to]);
  const tones = [...new Set(live.map((e) => e.tone ?? C.dim))];
  const mk = boardKey.replace(/[^a-zA-Z0-9]/g, "");

  return (
    <div ref={boxRef} data-void="" onWheel={onWheel} onMouseDown={panStart}
      style={{ flex: 1, width: "100%", minWidth: 0, height: "100%", minHeight: 360, position: "relative", overflow: "hidden", cursor: panRef.current ? "grabbing" : "grab", background: C.bg, backgroundImage: `radial-gradient(circle, color-mix(in oklab, ${C.border} 55%, transparent) 1px, transparent 1px)`, backgroundSize: "26px 26px" }}>
      <button onClick={fit} title="reset the view" style={{ position: "absolute", right: 8, top: 8, zIndex: 5, background: C.panel, border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: "2px 9px", borderRadius: 7 }}>⊡ fit</button>
      <div data-void="" style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})` }}>
        {/* THE CONNECTIONS — under the cards, following them live as they drag */}
        {live.length > 0 && (
          <svg width={4000} height={2600} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
            <defs>
              {tones.map((t, i) => (
                <marker key={t} id={`cbA-${mk}-${i}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6.5" markerHeight="6.5" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke={t} strokeWidth="1.5" /></marker>
              ))}
            </defs>
            {live.map((e, i) => {
              const a = { ...store[e.from], h: hRef.current[e.from] ?? 120 };
              const b = { ...store[e.to], h: hRef.current[e.to] ?? 120 };
              const tone = e.tone ?? C.dim;
              const { d, mx, my } = edgePath(a, b);
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke={tone} strokeWidth={1.6} opacity={0.65} markerEnd={`url(#cbA-${mk}-${tones.indexOf(tone)})`} />
                  {e.label && <text x={mx} y={my - 5} textAnchor="middle" fontSize={7.5} fontFamily="monospace" fill={tone} opacity={0.9}>{e.label}</text>}
                </g>
              );
            })}
          </svg>
        )}
        {cards.map((c) => {
          const p = store[c.id]; if (!p) return null;
          return (
            <div key={c.id} ref={(el) => { if (el) hRef.current[c.id] = el.offsetHeight; }}
              style={{ position: "absolute", left: p.x, top: p.y, width: p.w, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: `0 6px 20px color-mix(in oklab, ${C.bg} 70%, transparent)` }}>
              <div onMouseDown={(e) => cardDown(e, c.id)} title="drag" style={{ cursor: "grab", display: "flex", alignItems: "center", gap: 6, padding: "5px 9px", borderBottom: `1px solid ${C.border}`, background: `color-mix(in oklab, ${C.border} 20%, ${C.panel})`, borderRadius: "10px 10px 0 0" }}>
                <span style={{ color: C.dim, fontSize: 9 }}>⠿</span>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
              </div>
              <div style={{ padding: "8px 10px", maxHeight: 460, overflowY: "auto" }}>{c.node}</div>
            </div>
          );
        })}
      </div>
      <div data-void="" style={{ position: "absolute", left: 8, bottom: 6, fontFamily: mono, fontSize: 7.5, color: C.dim }}>drag a card's header to move · drag the void to pan · wheel to zoom</div>
    </div>
  );
}
