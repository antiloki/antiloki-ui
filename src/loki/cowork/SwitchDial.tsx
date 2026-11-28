// THE SWITCH DIAL (the operator 2026-11-22, approved mockups): the leader key, then Up or Down, opens a small half-dial on the left edge with the threads and teams of this workspace along an arc. Each press turns it one step with a tick; nothing is chosen while it turns. Enter goes to the thread it stopped on; Esc (or any other key) stays. No border and no body: only icons and names, and the selected one carries the look's own motion (minimal: none; liquid flows, pixel steps and fades, shadow drifts and fades).
import * as React from "react";
import { usePixelStyle } from "./use-appearance";
import { useReducedMotion } from "./use-cowork";
import { playTick } from "./tick-sound";
import type { Thread } from "./api";

const R = 118, STEP = 15, VIS = 4, CX = 14;
const PALETTE = ["#7aa2ff", "#f08ac0", "#5fd0e8", "#6fe0a0", "#ffb070", "#b08cff", "#c6d86a", "#9aa6ff"];
const colorOf = (i: number) => PALETTE[i % PALETTE.length];
/** The signed distance round a ring of `n` (the shortest way). Pure. */
export const wrapK = (k: number, n: number): number => { const m = ((k % n) + n) % n; return m > n / 2 ? m - n : m; };
/** Where the item `k` steps from the selected one sits on the arc, from the dial's own middle. Pure. */
export const arcPos = (k: number): { x: number; y: number } => { const a = (k * STEP * Math.PI) / 180; return { x: R * Math.cos(a) + CX, y: R * Math.sin(a) }; };
/** The next selection for a step (+1 down, -1 up), round the ring. Pure. */
export const stepIndex = (i: number, d: number, n: number): number => (n === 0 ? 0 : (i + d + n) % n);
/** The screen tells the dial a leader key was pressed for it: `dir` +1 down, -1 up. */
export const DIAL_EVENT = "antiloki-dial";
export const turnDial = (dir: 1 | -1) => window.dispatchEvent(new CustomEvent(DIAL_EVENT, { detail: { dir } }));
const ICON = { thread: "M5 6h14v9H9l-4 3z", team: "M8 11l8-4M8 13l8 4" };

export function SwitchDial({ threads, activeId, onGo }: { threads: Thread[]; activeId: string; onGo: (id: string) => void }) {
  const [open, setOpen] = React.useState(false); const [sel, setSel] = React.useState(0);
  const st = React.useRef<{ open: boolean; sel: number; timer?: number }>({ open: false, sel: 0 }); const items = React.useRef(threads); items.current = threads; const active = React.useRef(activeId); active.current = activeId; const go = React.useRef(onGo); go.current = onGo;
  React.useEffect(() => {
    const close = (commit: boolean) => { if (!st.current.open) return; const it = items.current[st.current.sel]; st.current.open = false; window.clearTimeout(st.current.timer); setOpen(false); if (commit && it && it.id !== active.current) go.current(it.id); };
    // after the leader, Up or Down opens the dial (an event from the keyboard of the screen); then the dial listens itself: Up / Down roll it, Enter goes, Escape stays, any other key stays
    const turn = (dir: number) => { if (items.current.length < 2) return; if (!st.current.open) { const i = Math.max(0, items.current.findIndex((t) => t.id === active.current)); st.current = { open: true, sel: i }; setOpen(true); } st.current.sel = stepIndex(st.current.sel, dir, items.current.length); setSel(st.current.sel); playTick(); window.clearTimeout(st.current.timer); st.current.timer = window.setTimeout(() => close(false), 8000); };
    const ev = (e: Event) => turn((e as CustomEvent<{ dir: number }>).detail.dir);
    const down = (e: KeyboardEvent) => {
      if (!st.current.open || e.key === "Control" || e.key === "Shift" || e.key === "Alt" || e.key === "Meta") return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === "ArrowDown" || e.key === "Tab" && !e.shiftKey || e.key === "j") turn(1); else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey) || e.key === "k") turn(-1); else if (e.key === "Enter") close(true); else close(false);
    };
    window.addEventListener(DIAL_EVENT, ev); window.addEventListener("keydown", down, true);
    return () => { window.removeEventListener(DIAL_EVENT, ev); window.removeEventListener("keydown", down, true); };
  }, []);
  const look = usePixelStyle(); const still = useReducedMotion();
  if (!open) return null; const n = threads.length;
  return (
    <div data-testid="switch-dial" role="status" aria-label={`Switching to ${threads[sel]?.name ?? ""}`} style={{ position: "fixed", left: 0, top: "50%", width: 0, height: 0, zIndex: 2147482000, pointerEvents: "none", fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      <Fx look={look} color={colorOf(sel)} k={0} still={still} />
      {threads.map((t, i) => { const k = wrapK(i - sel, n); const vis = Math.abs(k) <= VIS; const p = arcPos(k); const on = k === 0; const col = colorOf(i);
        return (
          <div key={t.id} data-testid={`dial-item-${t.id}`} data-sel={on ? "1" : "0"} style={{ position: "absolute", left: p.x + 18, top: p.y, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontSize: 11, fontWeight: on ? 600 : 400, color: on ? "#fff" : "rgba(236,234,243,.78)", textShadow: "0 1px 6px rgba(0,0,0,.7)", opacity: vis ? 1 - Math.abs(k) * 0.2 : 0, transform: `translateY(-50%) rotate(${k * STEP * 0.4}deg)`, transition: still ? "none" : "left .45s cubic-bezier(.2,.9,.25,1.05), top .45s cubic-bezier(.2,.9,.25,1.05), opacity .35s, transform .45s", zIndex: 2 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" style={{ stroke: col, fill: "none", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", flex: "none" }}>{t.team ? <><circle cx="6" cy="12" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d={ICON.team} /></> : <path d={ICON.thread} />}</svg>
            <span>{t.name}</span>{on && t.team ? <small style={{ font: "9.5px ui-monospace, monospace", color: "#a9a6b8", fontWeight: 400 }}>team</small> : null}
          </div>); })}
    </div>
  );
}
/** The selected thread's own motion, drawn behind its name. Minimal draws none. */
function Fx({ look, color, still }: { look: string; color: string; k: number; still: boolean }) {
  const cv = React.useRef<HTMLCanvasElement>(null); const sh = React.useRef<HTMLDivElement>(null); const c = React.useRef(color); c.current = color; const { x, y } = arcPos(0);
  React.useEffect(() => {
    if (still || look === "minimal") return; let raf = 0; let last = -1; const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const loop = (t: number) => {
      const s = t / 1000; const ctx = cv.current?.getContext("2d");
      if (look === "liquid" && ctx) { ctx.clearRect(0, 0, 240, 80); ctx.save(); ctx.translate(30, 40); ctx.filter = "blur(5px)"; ctx.fillStyle = c.current;
        [[26 + Math.sin(s * 1.7) * 9, Math.cos(s * 1.3) * 5, 9], [40 + Math.sin(s * 1.1 + 2) * 10, Math.sin(s * 1.9) * 6, 7.5], [14 + Math.cos(s * 1.5) * 8, Math.sin(s * 1.2 + 1) * 6, 6.5], [60 + Math.sin(s * 0.9) * 8, Math.cos(s * 1.6 + 1) * 4, 5.5]].forEach(([bx, by, br]) => { ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill(); });
        const d = (s % 2.6) / 2.6; ctx.globalAlpha = d < 0.7 ? 1 : 1 - (d - 0.7) / 0.3; ctx.beginPath(); ctx.arc(34 + Math.sin(s * 0.7) * 6, 6 + d * d * 30, Math.max(1, d < 0.35 ? 3 + d * 8 : 5.5 - (d - 0.35) * 4), 0, 7); ctx.fill(); ctx.filter = "none"; ctx.globalAlpha = 1; ctx.restore();
        const img = ctx.getImageData(0, 0, 240, 80), dd = img.data; for (let i = 3; i < dd.length; i += 4) dd[i] = dd[i] > 110 ? Math.min(255, dd[i] * 1.6) : dd[i] * 0.35; ctx.putImageData(img, 0, 0); }
      if (look === "pixel" && ctx) { const f = Math.floor(t / 110); if (f !== last) { last = f; ctx.clearRect(0, 0, 240, 80); const [r, g, b] = rgb(c.current); const cell = 4;
        for (let gx = 0; gx < 52; gx++) for (let gy = 0; gy < 16; gy++) { const fx = Math.max(0, 1 - Math.abs(gx - 18) / 20), fy = 1 - Math.abs(gy - 7.5) / 9, w = (Math.sin(gx * 0.7 - f * 0.9) + Math.sin(gy * 1.3 + f * 0.5)) / 4 + 0.5; if (Math.random() < fx * fy * (0.35 + w * 0.55)) { ctx.fillStyle = `rgba(${r},${g},${b},${(0.15 + 0.55 * fx * fy * Math.random()).toFixed(2)})`; ctx.fillRect(gx * cell + 16, gy * cell + 8, cell - 1, cell - 1); } } } }
      if (look === "shadow" && sh.current) { sh.current.style.marginLeft = `${Math.sin(s * 0.8) * 14}px`; sh.current.style.opacity = (0.55 + Math.sin(s * 1.6) * 0.25).toFixed(2); sh.current.style.transform = `scaleX(${(1 + Math.sin(s * 1.1) * 0.12).toFixed(3)})`; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, [look, still]);
  if (look === "minimal" || still) return null;
  const at: React.CSSProperties = { position: "absolute", left: x + 18, top: y, transition: "left .45s, top .45s", pointerEvents: "none" };
  return look === "shadow"
    ? <div style={at}><div ref={sh} style={{ position: "absolute", left: -50, top: -40, width: 250, height: 80, filter: "blur(16px)", background: `radial-gradient(ellipse 50% 50% at 42% 50%, ${color} 0%, color-mix(in srgb, ${color} 45%, transparent) 38%, transparent 72%)` }} /></div>
    : <div style={at}><canvas ref={cv} width={240} height={80} style={{ position: "absolute", left: -30, top: -40, width: 240, height: 80, imageRendering: look === "pixel" ? "pixelated" : "auto" }} /></div>;
}
