// THE LOADING LOOK (the operator 2026-11-22: "instead of writing loading layout, the pixels of the reasoning box, that at the end expand fast"): a grid of pixels that breathe in a wave while something loads; when it is ready (`done`) the whole grid grows fast and fades into what was loading. Also a skeleton for anything that takes more than a second.
import * as React from "react";
import { C } from "@/loki/theme";
import { usePixelStyle, useFx } from "./use-appearance";
import { shiftHue } from "./SpecialistAvatar";

const CSS = `
@property --sg-ang{syntax:'<angle>';inherits:false;initial-value:0deg}@keyframes sg-turn{to{--sg-ang:360deg}}@keyframes sg-pulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:.95;transform:scale(1.12)}}
@keyframes pl-px{0%,100%{opacity:.15;transform:scale(.65)}50%{opacity:1;transform:scale(1)}}
@keyframes pl-expand{0%{opacity:1}100%{opacity:0}}
@keyframes pl-shimmer{0%{opacity:.35}50%{opacity:.7}100%{opacity:.35}}
@keyframes pl-f1{0%,100%{transform:translate(-26px,4px) scale(1)}50%{transform:translate(22px,-8px) scale(1.35)}}
@keyframes pl-f2{0%,100%{transform:translate(20px,-6px) scale(1.2)}50%{transform:translate(-18px,8px) scale(.9)}}
@keyframes pl-f3{0%,100%{transform:translate(0,10px) scale(.9)}50%{transform:translate(8px,-12px) scale(1.4)}}
@keyframes pl-dot{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-9px);opacity:1}}
@media (prefers-reduced-motion: reduce){.pl-c,.pl-sk,.pl-f,.pl-d{animation:none!important}}`;
/** How long the grid takes to grow and fade when the load is done (ms). */
export const EXPAND_MS = 160;

export function PixelLoader({ done = false, onGone, color, label = "loading" }: { done?: boolean; onGone?: () => void; color?: string; label?: string }) {
  const fx = useFx("loading"); color = fx?.colors[0] ?? color; const pstyle = usePixelStyle("loading"); const soft = pstyle === "liquid"; const glow = pstyle === "shadow"; const minimal = pstyle === "minimal"; const cols = 9, rows = 5; const cells = React.useMemo(() => Array.from({ length: cols * rows }, (_, i) => ({ x: i % cols, y: Math.floor(i / cols), d: ((i % cols) * 0.09 + Math.floor(i / cols) * 0.16).toFixed(2) })), []);
  React.useEffect(() => { if (!done) return; const h = window.setTimeout(() => onGone?.(), EXPAND_MS); return () => window.clearTimeout(h); }, [done, onGone]);
  return (
    <div data-testid="pixel-loader" data-done={done ? "1" : "0"} role="status" aria-label={label} style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", zIndex: 20 }}>
      <style>{CSS}</style>
      {glow ? <div aria-hidden data-testid="loader-glow" style={{ width: 120, height: 120, borderRadius: "50%", background: `conic-gradient(from var(--sg-ang, 0deg), ${color ?? C.brand}, ${shiftHue(color ?? "#7c5cf0", 40)}, ${shiftHue(color ?? "#7c5cf0", 80)}, ${color ?? C.brand})`, filter: "blur(16px)", opacity: 0.8, animation: done ? `pl-expand ${EXPAND_MS}ms cubic-bezier(.2,.8,.2,1) forwards` : `sg-turn ${fx?.speed_s ?? 3.2}s linear infinite, sg-pulse 1.8s ease-in-out infinite` }} /> : minimal ? <div aria-hidden style={{ display: "flex", gap: 9, animation: done ? `pl-expand ${EXPAND_MS}ms cubic-bezier(.2,.8,.2,1) forwards` : "none" }}>{[0, 1, 2].map((i) => <span key={i} className="pl-d" style={{ width: 11, height: 11, borderRadius: 6, background: color ?? C.brand, animation: `pl-dot 1.1s ease-in-out ${i * 0.16}s infinite`, opacity: 0.35 }} />)}</div> : soft ? <svg width={cols * 12} height={rows * 12} viewBox={`0 0 ${cols * 12} ${rows * 12}`} aria-hidden style={{ overflow: "visible", animation: done ? `pl-expand ${EXPAND_MS}ms cubic-bezier(.2,.8,.2,1) forwards` : "none", transformOrigin: "center" }}>
        <defs><filter id="pl-blur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b" /><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" /></filter></defs>
        <g filter="url(#pl-blur)" fill={color ?? C.brand}>{[["pl-f1", 20, 30, 20, 1.6], ["pl-f2", 54, 28, 24, 1.9], ["pl-f3", 88, 32, 18, 1.4]].map(([n, cx, cy, r, d], i) => <circle key={i} className="pl-f" cx={cx as number} cy={cy as number} r={r as number} style={{ transformBox: "fill-box", transformOrigin: "center", animation: `${n} ${d}s ease-in-out infinite` }} />)}</g>
      </svg> : <svg width={cols * 12} height={rows * 12} viewBox={`0 0 ${cols * 12} ${rows * 12}`} aria-hidden style={{ filter: soft ? "blur(1.6px)" : undefined, animation: done ? `pl-expand ${EXPAND_MS}ms cubic-bezier(.2,.8,.2,1) forwards` : "none", transformOrigin: "center" }}>
        {cells.map((c, i) => <rect key={i} className="pl-c" x={c.x * 12} y={c.y * 12} width="10" height="10" rx={soft ? 5 : 2} fill={color ?? C.brand} style={{ transformBox: "fill-box", transformOrigin: "center", animation: `pl-px 1.2s ease-in-out ${c.d}s infinite`, opacity: 0.15 }} />)}
      </svg>}
    </div>
  );
}
/** True once `active` has lasted `ms` (default one second): what is short shows nothing, what is long shows its skeleton. */
export function useSlow(active: boolean, ms = 1000): boolean {
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => { if (!active) { setSlow(false); return; } const h = window.setTimeout(() => setSlow(true), ms); return () => window.clearTimeout(h); }, [active, ms]);
  return slow;
}
/** Grey bars that shimmer where lines of text will be. */
export function Skeleton({ lines = 5, testid = "skeleton" }: { lines?: number; testid?: string }) {
  const w = [92, 78, 86, 60, 72, 48, 80];
  return (
    <div data-testid={testid} aria-hidden style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 18px" }}>
      <style>{CSS}</style>
      {Array.from({ length: lines }, (_, i) => <div key={i} className="pl-sk" style={{ height: 11, width: `${w[i % w.length]}%`, borderRadius: 5, background: `color-mix(in srgb, ${C.fg} 14%, transparent)`, animation: `pl-shimmer 1.4s ease-in-out ${i * 0.12}s infinite` }} />)}
    </div>
  );
}
