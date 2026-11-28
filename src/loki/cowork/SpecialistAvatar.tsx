// A SPECIALIST'S MASCOT (the operator 2026-11-21): the APPROVED topbar (the operator's mockup "Specialist Panes Mockup"): the bar is the same colour as every agent's bar; the right half of it holds a PIXELATED SHADOW in the specialist's colour (blocks of 5px, an ordered dither that gets denser toward the right edge) with the avatar drawn in the same blocks; at the left the flat mascot with two white pill eyes, the name and a Specialist tag. Six states (idle, thinking, working, waiting, blocked, done) move the face, the body and the pixels. No gradients, no shadows.
// Shape and colour are the specialist's own (its definition may name them); when it does not, they come from its id, so the same specialist always looks the same.
import * as React from "react";
import { createPortal } from "react-dom";

import { MASCOTS } from "./mascots";
import { usePixelStyle, useFx } from "./use-appearance";
export const SHAPES = Object.keys(MASCOTS) as readonly string[];
export type Shape = string;
export const PALETTE: Record<string, string> = { white: "#f1f1f3", brown: "#9a5b34", red: "#ee3a45", orange: "#fa6a1a", amber: "#f59e1b", green: "#22b45a", teal: "#14a89a", blue: "#2a6df4", purple: "#8b4df0", pink: "#ea3d8c", gray: "#76767e" };
export type AvatarState = "idle" | "thinking" | "working" | "waiting" | "blocked" | "done";

function hashOf(id: string): number { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; }
/** The mascot a specialist is: its own choice when valid, else from its id; with no colour named it wears the colour it has on the sheet. Pure. */
export function mascotOf(id: string, shape?: string, color?: string): { shape: Shape; color: string; hex: string } {
  const h = hashOf(id); const sh = SHAPES.includes(shape ?? "") ? (shape as Shape) : SHAPES[h % SHAPES.length];
  const c = color && PALETTE[color] ? color : MASCOTS[sh].color; return { shape: sh, color: c, hex: PALETTE[c] };
}
/** The accent of a specialist's pane (bar, border). Pure. */
export function specialistColor(id: string, color?: string): string { return mascotOf(id, undefined, color).hex; }

const CSS = `
@keyframes sv-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}
@keyframes sv-blink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.12)}}
@keyframes sv-think{0%,100%{transform:translate(0,0)}25%{transform:translate(-1.4px,-1.2px)}60%{transform:translate(1.4px,-1.2px)}}
@keyframes sv-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.2px)}}
@keyframes sv-work{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-1.8px) rotate(2deg)}}
@keyframes sv-sway{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
@keyframes sv-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-1.6px)}40%{transform:translateX(1.6px)}60%{transform:translateX(-1.2px)}80%{transform:translateX(1.2px)}}
@keyframes sv-hop{0%{transform:translateY(0)}35%{transform:translateY(-4px)}70%{transform:translateY(0)}100%{transform:translateY(0)}}
@keyframes sv-spark{0%{opacity:0;transform:translate(0,2px) scale(.4)}40%{opacity:1}100%{opacity:0;transform:translate(5px,-6px) scale(1)}}
.sv *{transform-box:fill-box;transform-origin:50% 60%}
.sv .body{animation:sv-breathe 3.2s ease-in-out infinite}
.sv .eye{animation:sv-blink 4.4s ease-in-out infinite}
.sv[data-state=thinking] .body{animation:sv-bob 1.6s ease-in-out infinite}.sv[data-state=thinking] .eyes{animation:sv-think 2.4s ease-in-out infinite}
.sv[data-state=working] .body{animation:sv-work .55s ease-in-out infinite}.sv[data-state=working] .eye{animation:none}
.sv[data-state=waiting] .body{animation:sv-sway 2.6s ease-in-out infinite}
.sv[data-state=blocked] .body{animation:sv-shake .5s ease-in-out infinite}.sv[data-state=blocked] .eye{animation:none;transform:scaleY(.5)}
.sv[data-state=done] .body{animation:sv-hop 1.1s ease-out 1}.sv[data-state=done] .eye{animation:none}
.sv .spark{opacity:0}.sv[data-state=working] .spark{animation:sv-spark .9s ease-out infinite}
@media (prefers-reduced-motion: reduce){.sv *{animation:none!important}}`;

/** Forget the sampled silhouettes (tests). */
export function resetHalfPixels() { HALF_CACHE.clear(); }
/** A silhouette (one `M x y L x y … z` per outline) as polygons; the traced mascots are all of that shape. Pure. */
export function polygonsOf(d: string): [number, number][][] {
  const out: [number, number][][] = []; for (const sub of d.split(/(?=M)/)) { const pts = [...sub.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]); if (pts.length >= 3) out.push(pts); } return out;
}
/** Is the point inside the silhouette (even-odd over every outline: an eye hole stays a hole). No canvas, so the same answer everywhere and every time. Pure. */
export function insideShape(polys: [number, number][][], x: number, y: number): boolean {
  let inside = false; for (const p of polys) { for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } } return inside;
}
/** Is the point inside the silhouette? The traced paths are plain polygons (M x y L … z, several of them for a body with a hole), so this is the even-odd rule over their edges: pure, the same everywhere, and it needs no canvas (found 2026-11-22: a canvas that was not ready cached an empty answer and the avatar was sometimes smooth, sometimes half pixelated). */
export function inPath(d: string, x: number, y: number): boolean {
  let inside = false; for (const sub of d.split(/(?=M)/)) { const pts = [...sub.matchAll(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])] as const); for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } }
  return inside;
}
const HALF_CACHE = new Map<string, { x: number; y: number; a: number }[]>();
/** The right half of a mascot as blocks: 3-unit cells of the silhouette on a grid, fading toward the right edge. Always the same for a shape. */
export function halfPixels(shape: string): { x: number; y: number; a: number }[] {
  const hit = HALF_CACHE.get(shape); if (hit) return hit; const art = MASCOTS[shape]; const cells: { x: number; y: number; a: number }[] = [];
  if (art) for (let y = 0; y < 36; y += 3) for (let x = 18; x < 36; x += 3) { if (inPath(art.d, x + 1.5, y + 1.5)) cells.push({ x, y, a: Math.max(0.25, 1 - (x - 18) / 22) }); }
  HALF_CACHE.set(shape, cells); return cells;
}
/** Forget the sampled silhouettes (tests). */

export function SpecialistAvatar({ id, size = 24, state = "idle", shape, color, pixel = true }: { id: string; size?: number; state?: AvatarState; shape?: string; color?: string; /** the right half is drawn in pixels (the chat look); false = the whole mascot smooth (a terminal pane's bar) */ pixel?: boolean }) {
  const m = mascotOf(id, shape, color); const art = MASCOTS[m.shape]; const uid = React.useId().replace(/:/g, ""); const style = usePixelStyle("avatar"); const cells = React.useMemo(() => (pixel && style === "pixel" ? halfPixels(m.shape) : []), [m.shape, pixel, style]); const ink = style === "minimal" ? m.hex : "#16161a";
  return (
    <span data-testid="specialist-avatar" data-specialist={id} data-shape={m.shape} data-color={m.color} style={{ display: "inline-flex", flexShrink: 0, width: size, height: size }}>
      <style>{CSS}</style>
      <svg className="sv" data-state={state} viewBox="0 0 36 36" width={size} height={size} role="img" aria-label={`specialist ${id}, ${state}`}>
        <g className="body" fill={style === "minimal" ? "none" : m.hex} stroke={style === "minimal" ? m.hex : undefined} strokeWidth={style === "minimal" ? 1.6 : undefined} strokeLinejoin="round">{cells.length ? <><clipPath id={`sp-l-${uid}`}><rect x="0" y="0" width="18" height="36" /></clipPath><path d={art.d} clipPath={`url(#sp-l-${uid})`} />{cells.map((p, i) => <rect key={i} x={p.x + 0.2} y={p.y + 0.2} width="2.6" height="2.6" opacity={p.a} />)}</> : pixel && (style === "shadow" || style === "liquid") ? <><linearGradient id={`sp-g-${uid}`} x1="0" x2="1" y1="0" y2="0"><stop offset="0.45" stopColor="#fff" /><stop offset="1" stopColor="#fff" stopOpacity="0.22" /></linearGradient><mask id={`sp-m-${uid}`}><rect width="36" height="36" fill={`url(#sp-g-${uid})`} /></mask><path d={art.d} mask={`url(#sp-m-${uid})`} /></> : <path d={art.d} />}</g>
        <g className="eyes" fill={style === "minimal" ? m.hex : ink}>{art.eyes.map((e, i) => <rect key={i} className="eye" x={e[0]} y={e[1]} width={e[2]} height={e[3]} rx={e[2] / 2} />)}</g>
        <g fill={PALETTE.amber}><rect className="spark" x="28" y="8" width="2.400" height="2.400" rx="1" /><rect className="spark" x="31" y="13" width="2" height="2" rx="1" style={{ animationDelay: ".3s" }} /></g>
      </svg>
    </span>
  );
}

/** The silhouettes as plain paths in the same 36x36 box: the pixel shadow rasterises them with Path2D. */
export const PIX: Record<string, string> = Object.fromEntries(Object.entries(MASCOTS).map(([k, v]) => [k, v.d]));
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
/** Which blocks of the shadow are drawn: `[x, y, alpha, isAvatar]` for a grid of cols x rows. The dither gets denser toward the right edge; the avatar is the same silhouette in blocks, near the right edge, as tall as the bar (at most 8 blocks). Pure, so it is testable without a canvas. */
export function shadowBlocks(cols: number, rows: number, inShape: (u: number, v: number) => boolean, time = 0, working = false): [number, number, number, boolean][] {
  const out: [number, number, number, boolean][] = []; const av = Math.min(rows, 8); const ax0 = cols - av - 3; const ay0 = Math.floor((rows - av) / 2);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const t = cols > 1 ? x / (cols - 1) : 0;
    // RUNNING (the operator 2026-11-22: "fluid, like the reasoning box below the text"): the blocks do not appear and disappear: the same dither stays and every block breathes smoothly, a wave of light travelling left to right through them (continuous in time, drawn every frame)
    const dens = Math.pow(t, 1.5) * 0.9 + (working ? 0.25 : 0); const th = (BAYER[y % 4][x % 4] + 0.5) / 16;
    if (dens > th) { const phase = ((x * 7 + y * 13) % 17) / 17 * 6.283; const wave = working ? 0.5 + 0.5 * Math.sin(time * 3.2 - x * 0.28 + phase * 0.35) : 1; const swell = working ? 0.5 + 0.5 * Math.sin(time * 1.3 - x * 0.09) : 0; const base = 0.16 + 0.3 * t; out.push([x, y, working ? Math.min(0.8, base * (0.35 + 0.9 * wave) + 0.22 * wave * swell) : base, false]); }
    const u = (x - ax0) / av; const v = (y - ay0) / av; if (u >= 0 && u <= 1 && v >= 0 && v <= 1 && inShape(u, v)) out.push([x, y, working ? 0.55 + 0.25 * Math.sin(time * 3.2) : 0.55, true]);
  }
  return out;
}
/** THE SHADOW ART (the operator 2026-11-22: "not blurring the pixels: a complete new art of colours moving and fading into the background"): the same effect as the pixel shadow (denser and stronger toward the right edge, a wave of light travelling through it while the agent runs) painted as soft clouds of colour: a row of overlapping glows, each breathing and drifting. Pure, so it is testable without a canvas: `{x, y, r, a}` in the bar's own pixels. */
/** The same colour turned `deg` degrees round the wheel (the iridescence of the shadow look: the clouds are the specialist's colour and its neighbours). Pure. */
export function shiftHue(hex: string, deg: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return hex; const n = parseInt(m[1], 16); const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn;
  let h = 0; if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); const hh = (((h + deg) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * sat; const x = c * (1 - Math.abs(((hh / 60) % 2) - 1)); const mm = l - c / 2; const [r1, g1, b1] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + mm) * 255).toString(16).padStart(2, "0"); return `#${to(r1)}${to(g1)}${to(b1)}`;
}
export function fieldBlobs(w: number, h: number, time: number, working: boolean): { x: number; y: number; r: number; a: number; hue: number }[] {
  const K = 9; const out: { x: number; y: number; r: number; a: number; hue: number }[] = [];
  for (let i = 0; i < K; i++) {
    const t = (i + 0.5) / K; const base = 0.10 + 0.34 * Math.pow(t, 1.4);
    const wave = working ? 0.5 + 0.5 * Math.sin(time * 3.2 - t * 5.2 + i * 0.4) : 1; const breathe = working ? 1 + 0.28 * Math.sin(time * 1.9 + i * 1.3) : 1;
    const dx = working ? Math.sin(time * 0.9 + i * 1.7) * w * 0.035 : 0; const dy = working ? Math.sin(time * 1.3 + i * 2.1) * h * 0.22 : 0;
    out.push({ x: w * (0.08 + 0.9 * t) + dx, y: h * (0.5 + 0.32 * Math.sin(i * 1.9)) + dy, r: h * (0.95 + 0.55 * ((i * 37) % 7) / 7) * breathe, a: working ? base * (0.35 + 1.0 * wave) : base, hue: [0, 28, -26, 0, 14, -14, 0, 24, -20][i] });
  }
  if (working) { const head = ((time * 0.42) % 1.35) - 0.2; out.push({ x: w * head, y: h * 0.5 + Math.sin(time * 2.4) * h * 0.18, r: h * 1.35, a: 0.34, hue: 40 }); }   // a bright cloud sweeping across, again and again
  return out;
}
/** THE LIQUID ART (a fourth look, flat): the same field as flat drops that merge and split (the canvas is drawn with solid circles and a goo filter fuses them) and a tide along the bottom. Pure `{x, y, r}`. */
export function liquidBlobs(w: number, h: number, time: number, working: boolean): { x: number; y: number; r: number }[] {
  const sp = working ? 1 : 0.28; const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 7; i++) { const t = (i + 0.5) / 7; out.push({ x: w * (0.1 + 0.88 * t) + Math.sin(time * 0.9 * sp + i * 1.7) * w * 0.04, y: h * (0.46 + 0.22 * Math.sin(i * 1.9)) + Math.sin(time * 1.3 * sp + i * 2.1) * h * 0.2, r: h * (0.34 + 0.2 * ((i * 37) % 7) / 7 + 0.07 * t) * (1 + 0.22 * Math.sin(time * 1.7 * sp + i)) }); }
  out.push({ x: w * (0.5 + 0.12 * Math.sin(time * 0.8 * sp)), y: h * 1.02, r: h * (0.55 + 0.12 * Math.sin(time * 2 * sp)) });   // the tide
  return out;
}
function drawLiquid(c: CanvasRenderingContext2D, w: number, h: number, time: number, working: boolean, hex: string, strength: number) {
  c.clearRect(0, 0, w, h); c.fillStyle = hex; c.globalAlpha = 1; for (const b of liquidBlobs(w, h, time, working)) { c.beginPath(); c.arc(b.x, b.y, Math.max(1, b.r), 0, Math.PI * 2); c.fill(); }   // solid: the goo curve fuses it, the element's opacity makes it soft
}
/** The goo: blur then a hard alpha curve fuses the drops into one flat liquid (no lighting: flat). */
export function GooDefs() { return <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}><defs><filter id="antiloki-goo" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" /><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" /></filter></defs></svg>; }
/** Paint the shadow art: the clouds in the specialist's colour, the avatar a soft glow of its silhouette near the right edge. */
function drawField(c: CanvasRenderingContext2D, w: number, h: number, time: number, working: boolean, hex: string, strength: number, silhouette?: string) {
  c.clearRect(0, 0, w, h);
  for (const b of fieldBlobs(w, h, time, working)) { const g = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r); const a = Math.min(0.9, b.a * strength); const col = shiftHue(hex, b.hue); g.addColorStop(0, hexA(col, a)); g.addColorStop(0.5, hexA(col, a * 0.45)); g.addColorStop(1, hexA(col, 0)); c.fillStyle = g; c.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); }
  if (silhouette && typeof Path2D === "function") { const av = Math.min(h * 0.9, 34); const x0 = w - av - 8; const y0 = (h - av) / 2; c.save(); c.translate(x0, y0); c.scale(av / 36, av / 36); c.shadowColor = hex; c.shadowBlur = 10; c.globalAlpha = working ? 0.55 + 0.25 * Math.sin(time * 3.2) : 0.55; c.fillStyle = hex; c.fill(new Path2D(silhouette)); c.restore(); }
}
function hexA(hex: string, a: number): string { const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return hex; const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`; }
/** THE SHADOW LOOK (the operator 2026-11-22: "a coloured shadow like Gemini does"): a soft glow of colour that turns slowly, the specialist's colour with its neighbours on the wheel (blue, violet, rose, as Gemini's glow runs), pulsing while the agent runs. A blurred conic gradient, drawn by the GPU: no canvas, no blocks, no drops. Pure stops. */
export function glowStops(hex: string): string[] { return [hex, shiftHue(hex, 38), shiftHue(hex, 78), shiftHue(hex, -34)]; }
const GLOW_CSS = "@property --sg-ang{syntax:'<angle>';inherits:false;initial-value:0deg}@keyframes sg-turn{to{--sg-ang:360deg}}@keyframes sg-pulse{0%,100%{opacity:.42;transform:scale(1)}50%{opacity:.8;transform:scale(1.07)}}@media (prefers-reduced-motion: reduce){.sg-layer{animation:none!important}}";
export function ShadowGlow({ hex, silhouette, working = false, behind = false, strength = 1, colors, speedS, effect }: { hex: string; silhouette?: string; working?: boolean; behind?: boolean; strength?: number; /** a custom theme's own colours, speed and effect for this place */ colors?: string[]; speedS?: number; effect?: string }) {
  const own = colors && colors.length >= 2 ? [colors[0], colors[1], colors[2] ?? colors[0], colors[3] ?? colors[1]] : null; const [c0, c1, c2, c3] = own ?? glowStops(hex); const still = effect === "pulse"; const dur = speedS ?? (working ? 3.6 : 11);
  return (
    <div aria-hidden data-testid="specialist-shadow" data-style="glow" style={{ position: "absolute", right: 0, top: 0, height: "100%", width: behind ? "100%" : "56%", overflow: "hidden", zIndex: behind ? -1 : 0, pointerEvents: "none", WebkitMaskImage: behind ? undefined : "linear-gradient(to right, transparent, #000 32%)", maskImage: behind ? undefined : "linear-gradient(to right, transparent, #000 32%)" }}>
      <style>{GLOW_CSS}</style>
      <div className="sg-layer" style={{ position: "absolute", inset: "-90% -30%", background: `conic-gradient(from var(--sg-ang), ${c0}, ${c1}, ${c2}, ${c3}, ${c0})`, filter: "blur(18px)", opacity: Math.min(0.9, 0.5 * strength), animation: `${still ? "" : `sg-turn ${working ? Math.min(dur, 3.6 * dur / (speedS ?? 3.6)) : dur}s linear infinite`}${working || still ? `${still ? "" : ", "}sg-pulse ${still ? dur : 2.2}s ease-in-out infinite` : ""}` || "none" }} />
      {silhouette && !behind && <svg viewBox="0 0 36 36" width="30" height="30" style={{ position: "absolute", right: 22, top: "50%", marginTop: -15, filter: `drop-shadow(0 0 8px ${hex})`, opacity: working ? 0.85 : 0.6 }}><path d={silhouette} fill={hex} /></svg>}
    </div>
  );
}
/** The pixelated shadow over the right half of a specialist's top bar, with its avatar in the same blocks (canvas, 5px blocks, scaled up without smoothing). */
export function PixelShadow({ hex, silhouette, px = 5, working = false, testid = "specialist-shadow", strength = 1, behind = false }: { /** drawn behind the content of a tile (letters stay on top) */ behind?: boolean; /** how strong the blocks are (the space tiles ask for more: on a light theme they were too faint) */ strength?: number; hex: string; /** an SVG path in a 36x36 box drawn in the same blocks near the right edge; none = only the dither */ silhouette?: string; px?: number; /** the pixels move */ working?: boolean; testid?: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null); const pstyle = usePixelStyle("topbar"); const fxTop = useFx("topbar"); const smooth = pstyle === "shadow"; const liquid = pstyle === "liquid"; const hidden = pstyle === "minimal";
  React.useEffect(() => {
    const cv = ref.current; if (!cv || hidden) return; const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const polys = silhouette ? polygonsOf(silhouette) : null; let raf = 0; let last = 0; const t0 = performance.now();
    const draw = (now = t0) => {
      const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
      if (liquid) { const rw = Math.ceil(w / 2), rh = Math.ceil(h / 2); if (cv.width !== rw || cv.height !== rh) { cv.width = rw; cv.height = rh; } const c3 = cv.getContext("2d"); if (c3) drawLiquid(c3, rw, rh, (now - t0) / 1000, working && !calm, hex, strength); return; }
      if (smooth) { const rw = Math.ceil(w / 2), rh = Math.ceil(h / 2); if (cv.width !== rw || cv.height !== rh) { cv.width = rw; cv.height = rh; } const c2 = cv.getContext("2d"); if (c2) drawField(c2, rw, rh, (now - t0) / 1000, working && !calm, hex, strength, silhouette); return; }
      const cols = Math.ceil(w / px), rows = Math.ceil(h / px); if (cv.width !== cols || cv.height !== rows) { cv.width = cols; cv.height = rows; } const c = cv.getContext("2d"); if (!c) return; c.clearRect(0, 0, cols, rows);
      const inShape = (u: number, v: number) => (polys ? insideShape(polys, u * 36, v * 36) : false);
      for (const [x, y, a] of shadowBlocks(cols, rows, inShape, (now - t0) / 1000, working && !calm)) { c.fillStyle = hex; c.globalAlpha = Math.min(1, a * strength); c.fillRect(x, y, 1, 1); } c.globalAlpha = 1;
    };
    const loop = (now: number) => { if (!document.hidden && now - last > 33) { last = now; draw(now); } raf = requestAnimationFrame(loop); };   // 30 frames a second, none while the tab is hidden
    draw(); if (working && !calm && typeof requestAnimationFrame === "function") raf = requestAnimationFrame(loop);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => draw(performance.now())) : null; ro?.observe(cv); return () => { ro?.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [hex, silhouette, px, working, strength, smooth, liquid, hidden]);
  if (hidden) return null;   // the minimal look: no shadows, no pixels
  if (smooth) return <ShadowGlow hex={hex} silhouette={silhouette} working={working} behind={behind} strength={fxTop ? strength * (0.4 + fxTop.intensity) : strength} colors={fxTop?.colors} speedS={fxTop?.speed_s} effect={fxTop?.effect} />;
  if (liquid) return <div aria-hidden style={{ position: "absolute", right: 0, top: 0, height: "100%", width: behind ? "100%" : "56%", overflow: "hidden", zIndex: behind ? -1 : 0, pointerEvents: "none", WebkitMaskImage: behind ? undefined : "linear-gradient(to right, transparent, #000 30%)", maskImage: behind ? undefined : "linear-gradient(to right, transparent, #000 30%)" }}><GooDefs /><canvas ref={ref} data-testid={testid} style={{ width: "100%", height: "100%", filter: "url(#antiloki-goo)", opacity: Math.min(0.85, 0.5 * strength) }} /></div>;
  return <canvas ref={ref} data-testid={testid} aria-hidden style={{ position: "absolute", right: 0, top: 0, height: "100%", width: "50%", zIndex: behind ? -1 : 0, pointerEvents: "none", imageRendering: smooth ? "auto" : "pixelated", ...(smooth ? { WebkitMaskImage: "linear-gradient(to right, transparent, #000 40%)", maskImage: "linear-gradient(to right, transparent, #000 40%)" } : {}) }} />;
}
/** The pixelated shadow of a specialist's top bar: its colour, its silhouette in the same blocks. */
export function SpecialistShadow({ id, shape, color, working = false }: { id: string; shape?: string; color?: string; working?: boolean }) {
  const m = mascotOf(id, shape, color); return <PixelShadow hex={m.hex} silhouette={PIX[m.shape]} working={working} />;
}

/** The "Specialist" tag next to a specialist's name (the mockup's): its colour, in mono capitals; it becomes an "S" when the bar is narrow; clicking it opens the specialist's window. */
export function SpecialistTag({ id, color, onClick, label = "Specialist", narrow = false }: { /** the bar is narrow: the word becomes its first letter */ narrow?: boolean; id: string; color?: string; onClick?: () => void; /** "Leader" on a team leader's bar */ label?: string }) {
  const c = specialistColor(id, color);
  return (
    <button data-testid="specialist-tag" className="sp-tag" aria-label={onClick ? "open this specialist" : label} title={onClick ? "Specialist: open everything it has" : label} onClick={(e) => { e.stopPropagation(); onClick?.(); }} onMouseDown={(e) => e.stopPropagation()} draggable={false}
      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", borderRadius: 4, padding: "1px 6px", color: c, border: `1px solid color-mix(in srgb, ${c} 55%, transparent)`, background: `color-mix(in srgb, ${c} 12%, transparent)`, flexShrink: 0, cursor: onClick ? "pointer" : "default" }}>
      <style>{".sp-hdr > *{position:relative;z-index:1}"}</style>
      <span className="full" style={{ display: narrow ? "none" : "inline" }}>{label}</span><span className="short" aria-hidden style={{ display: narrow ? "inline" : "none" }}>{label.slice(0, 1)}</span>
    </button>
  );
}

/** The window that opens on a specialist's avatar, in the middle of the screen: every mascot of the sheet, then the palette. */
export function AvatarPicker({ id, shape, color, onPick, onClose }: { id: string; shape?: string; color?: string; onPick: (shape: string, color: string) => void; onClose: () => void }) {
  const cur = mascotOf(id, shape, color); const [sh, setSh] = React.useState(cur.shape); const [co, setCo] = React.useState(cur.color);
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const pick = (s2: string, c2: string) => { setSh(s2); setCo(c2); onPick(s2, c2); };
  const body = (
    <>
      <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,.45)" }} />
      <div role="dialog" aria-modal="true" aria-label="choose the avatar" data-testid="avatar-picker" style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: 9999, width: "min(460px, calc(100vw - 32px))", maxHeight: "calc(100vh - 48px)", overflowY: "auto", padding: 18, borderRadius: 16, background: "var(--c-panel2, #1f1f24)", color: "var(--c-fg, #ececf1)", border: "1px solid var(--c-border, #3a3a44)", boxShadow: "0 16px 48px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", alignItems: "center", paddingBottom: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Choose an avatar</span><span style={{ flex: 1 }} />
          <button data-testid="avatar-close" aria-label="close" onClick={onClose} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
          {SHAPES.map((x) => (
            <button key={x} data-testid={`avatar-shape-${x}`} aria-pressed={x === sh} aria-label={x} onClick={() => pick(x, co)} title={x}
              style={{ padding: 6, borderRadius: 10, border: `2px solid ${x === sh ? PALETTE[co] : "transparent"}`, background: x === sh ? "color-mix(in srgb, currentColor 8%, transparent)" : "transparent", color: "inherit", cursor: "pointer", display: "grid", placeItems: "center" }}>
              <SpecialistAvatar id={id} size={52} shape={x} color={co} />
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, paddingTop: 14, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, opacity: 0.7, marginRight: 4 }}>Colour</span>
          {Object.entries(PALETTE).map(([k, hex]) => <button key={k} data-testid={`avatar-color-${k}`} aria-label={k} aria-pressed={k === co} onClick={() => pick(sh, k)} title={k} style={{ width: 24, height: 24, borderRadius: 12, background: hex, border: `2px solid ${k === co ? "#fff" : "transparent"}`, cursor: "pointer", padding: 0 }} />)}
        </div>
      </div>
    </>
  );
  return typeof document !== "undefined" ? createPortal(body, document.body) : body;
}
