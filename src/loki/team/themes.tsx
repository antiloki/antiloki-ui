// AGENT LOOK THEMES (operator 2026-11-12): the person picks a THEME for how every agent of every team looks, never an avatar per agent. The app's own light and dark theme is untouched.
// Each theme draws the same facts (the role, the state, the name) in its own way: a LED, a wave of dots, a bobbing sprite. State is also written beside the face (the board's label), never only in motion.
// A face is an inline SVG built from a string: every word that reaches it (a custom agent's title) is escaped first. `prefers-reduced-motion` stops every animation.
import * as React from "react";
import type { FaceKey, NodeState } from "./model";
import { SPRITES } from "./sprites";

export type ThemeKey = "cards" | "microchip" | "dots" | "bot" | "pixel" | "glyph" | "prompt" | "blueprint";
export const THEMES: { key: ThemeKey; label: string; note: string }[] = [
  { key: "cards", label: "Cards", note: "a flat card per step: its dot-matrix mark, what it does now, its spend and its tools; a colour wash while it works" },
  { key: "microchip", label: "Microchip", note: "an IC package: pins on every side, the role code printed on top, a LED" },
  { key: "dots", label: "Dot matrix", note: "the role's letter in a dot grid; a wave runs across the dots while it works" },
  { key: "bot", label: "Bot", note: "a small robot head; the eyes scan while it works" },
  { key: "pixel", label: "Pixel fantasy", note: "a 16-bit fantasy party: king, wizard, dwarf smith, ranger, slayer, paladin" },
  { key: "glyph", label: "Glyph", note: "a thin ring with the role's letter; the ring turns while it works" },
  { key: "prompt", label: "Prompt", note: "a tiny terminal window: the name after a prompt, then exit 0 or exit 1" },
  { key: "blueprint", label: "Blueprint", note: "line drawings on a dashed sheet; the lines march while it works" },
];
export const DEFAULT_THEME: ThemeKey = "cards";
// v2 (2026-11-15): the Cards look is the new default for everyone; a look chosen before it existed is not carried over
const KEY = "antiloki.team.agentTheme.v2";
const listeners = new Set<() => void>();
const valid = (v: unknown): v is ThemeKey => THEMES.some((t) => t.key === v);
export function getAgentTheme(): ThemeKey { try { const v = localStorage.getItem(KEY); return valid(v) ? v : DEFAULT_THEME; } catch { return DEFAULT_THEME; } }
export function setAgentTheme(k: ThemeKey) { try { localStorage.setItem(KEY, k); } catch { /* private window: the choice lasts until the page closes */ memory = k; } listeners.forEach((f) => f()); }
let memory: ThemeKey | null = null;
const read = (): ThemeKey => { const v = getAgentTheme(); return v === DEFAULT_THEME && memory ? memory : v; };
const subscribe = (f: () => void) => { listeners.add(f); window.addEventListener("storage", f); return () => { listeners.delete(f); window.removeEventListener("storage", f); }; };
export function useAgentTheme(): [ThemeKey, (k: ThemeKey) => void] { const t = React.useSyncExternalStore(subscribe, read, () => DEFAULT_THEME); return [t, setAgentTheme]; }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const RING: Record<NodeState, string> = { idle: "var(--c-dim)", working: "#5aa6cc", waiting: "#c9a34e", done: "#4fa77a", failed: "#d9665c" };
const FG = "var(--c-fg)", PANEL = "var(--c-panel)", BG = "var(--c-bg)", MUTED = "var(--c-muted)", LINE = "var(--c-border)";
export type FaceProps = { theme: ThemeKey; face: FaceKey; code: string; letter: string; name: string; state: NodeState };
const wrap = (inner: string, vb = "0 0 64 64") => `<svg viewBox="${vb}" width="100%" height="100%" aria-hidden="true" shape-rendering="${vb === "0 0 64 64" ? "auto" : "crispEdges"}">${inner}</svg>`;
const led = (s: NodeState, x: number, y: number) => `<circle cx="${x}" cy="${y}" r="3" fill="${RING[s]}" ${s === "working" ? 'class="tgf-pulse"' : ""}/>`;

function microchip(o: FaceProps) {
  const c = RING[o.state]; let p = "";
  for (let i = 0; i < 5; i++) { const x = 12 + i * 8; p += `<rect x="${x}" y="6" width="3" height="5" fill="${c}" opacity=".55"/><rect x="${x}" y="53" width="3" height="5" fill="${c}" opacity=".55"/>`; }
  for (let i = 0; i < 4; i++) { const y = 14 + i * 9; p += `<rect x="6" y="${y}" width="5" height="3" fill="${c}" opacity=".55"/><rect x="53" y="${y}" width="5" height="3" fill="${c}" opacity=".55"/>`; }
  return wrap(`${p}<rect x="11" y="11" width="42" height="42" rx="3" fill="${PANEL}" stroke="${c}" stroke-width="1.5"/><circle cx="16" cy="16" r="1.6" fill="${c}"/><text x="32" y="35" text-anchor="middle" font-family="ui-monospace,monospace" font-size="${o.code.length > 3 ? 10 : 12}" font-weight="600" fill="${FG}">${esc(o.code)}</text>${led(o.state, 44, 46)}`);
}
const FONT: Record<string, string[]> = {
  A: [".XXX.", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"], B: ["XXXX.", "X...X", "X...X", "XXXX.", "X...X", "X...X", "XXXX."], C: [".XXX.", "X...X", "X....", "X....", "X....", "X...X", ".XXX."],
  D: ["XXXX.", "X...X", "X...X", "X...X", "X...X", "X...X", "XXXX."], E: ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "XXXXX"], F: ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "X...."],
  G: [".XXX.", "X...X", "X....", "X.XXX", "X...X", "X...X", ".XXX."], H: ["X...X", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"], I: [".XXX.", "..X..", "..X..", "..X..", "..X..", "..X..", ".XXX."],
  J: ["..XXX", "...X.", "...X.", "...X.", "...X.", "X..X.", ".XX.."], K: ["X...X", "X..X.", "X.X..", "XX...", "X.X..", "X..X.", "X...X"], L: ["X....", "X....", "X....", "X....", "X....", "X....", "XXXXX"],
  M: ["X...X", "XX.XX", "X.X.X", "X.X.X", "X...X", "X...X", "X...X"], N: ["X...X", "XX..X", "X.X.X", "X..XX", "X...X", "X...X", "X...X"], O: [".XXX.", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
  P: ["XXXX.", "X...X", "X...X", "XXXX.", "X....", "X....", "X...."], Q: [".XXX.", "X...X", "X...X", "X...X", "X.X.X", "X..XX", ".XXXX"], R: ["XXXX.", "X...X", "X...X", "XXXX.", "X.X..", "X..X.", "X...X"],
  S: [".XXXX", "X....", "X....", ".XXX.", "....X", "....X", "XXXX."], T: ["XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "..X.."], U: ["X...X", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
  V: ["X...X", "X...X", "X...X", "X...X", "X...X", ".X.X.", "..X.."], W: ["X...X", "X...X", "X...X", "X.X.X", "X.X.X", "XX.XX", "X...X"], X: ["X...X", "X...X", ".X.X.", "..X..", ".X.X.", "X...X", "X...X"],
  Y: ["X...X", "X...X", ".X.X.", "..X..", "..X..", "..X..", "..X.."], Z: ["XXXXX", "....X", "...X.", "..X..", ".X...", "X....", "XXXXX"],
};
function dots(o: FaceProps) {
  const g = FONT[o.letter.toUpperCase()] ?? FONT.A; let s = "";
  const col = o.state === "idle" ? "var(--c-dim)" : o.state === "failed" ? RING.failed : o.state === "done" ? RING.done : o.state === "waiting" ? RING.waiting : FG;
  g.forEach((r, y) => [...r].forEach((c, x) => { const on = c === "X"; s += `<circle cx="${14 + x * 9}" cy="${10 + y * 7.4}" r="${on ? 3 : 1}" fill="${on ? col : LINE}" ${on && o.state === "working" ? `class="tgf-wave" style="animation-delay:${((x + y) * 0.09).toFixed(2)}s"` : ""} ${on && o.state === "failed" ? 'class="tgf-pulse"' : ""}/>`; }));
  return wrap(s);
}
function bot(o: FaceProps) {
  const c = RING[o.state]; const ant: Record<FaceKey, string> = { leader: "M32 12 L28 6 L32 9 L36 6 Z", planner: "M32 12 V5 M29 5 H35", worker: "M32 12 V6 M29 6 A3 3 0 1 0 35 6 A3 3 0 1 0 29 6", qa: "M32 12 V5 M32 5 L36 3", debugger: "M26 12 L22 5 M38 12 L42 5", audit: "M32 12 V6 M28 6 H36" };
  const eye: Record<FaceKey, string> = { leader: "round", planner: "bar", worker: "sq", qa: "lens", debugger: "x", audit: "half" };
  const e = (x: number) => { const y = 34; const k = eye[o.face];
    if (o.state === "failed") return `<path d="M${x - 3.5} ${y - 3.5} l7 7 M${x + 3.5} ${y - 3.5} l-7 7" stroke="${c}" stroke-width="2"/>`;
    if (k === "round") return `<circle cx="${x}" cy="${y}" r="3.5" fill="${c}"/>`; if (k === "bar") return `<rect x="${x - 4}" y="${y - 1.5}" width="8" height="3" rx="1.5" fill="${c}"/>`;
    if (k === "sq") return `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" rx="1" fill="${c}"/>`; if (k === "lens") return `<circle cx="${x}" cy="${y}" r="4.5" fill="none" stroke="${c}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="1.4" fill="${c}"/>`;
    if (k === "half") return `<path d="M${x - 4} ${y + 2} a4 4 0 0 1 8 0 Z" fill="${c}"/>`; return `<path d="M${x - 3.5} ${y - 3.5} l7 7 M${x + 3.5} ${y - 3.5} l-7 7" stroke="${c}" stroke-width="2"/>`; };
  return wrap(`<path d="${ant[o.face]}" stroke="${MUTED}" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="12" y="14" width="40" height="34" rx="9" fill="${PANEL}" stroke="${c}" stroke-width="1.8"/><rect x="18" y="24" width="28" height="20" rx="6" fill="${BG}"/><g ${o.state === "working" ? 'class="tgf-scan"' : ""}>${e(24)}${e(40)}</g><rect x="26" y="52" width="12" height="4" rx="2" fill="${c}" opacity=".5"/>`);
}
function pixel(o: FaceProps) {
  const sp = SPRITES[o.face]; let r = ""; sp.rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ".") r += `<rect x="${x}" y="${y}" width="1.03" height="1.03" fill="${sp.pal[ch] ?? "#000"}"/>`; }));
  const filt = o.state === "idle" ? 'style="filter:grayscale(.6) brightness(.92);opacity:.85"' : o.state === "failed" ? 'style="filter:saturate(.6) brightness(.85)"' : "";
  const badge = o.state === "done" ? `<circle cx="18" cy="3" r="3.2" fill="${RING.done}"/><path d="M16.4 3 l1.3 1.4 l2.2 -2.6" stroke="#fff" stroke-width="1" fill="none"/>` : o.state === "failed" ? `<circle cx="18" cy="3" r="3.2" fill="${RING.failed}"/><path d="M16.6 1.6 l2.8 2.8 M19.4 1.6 l-2.8 2.8" stroke="#fff" stroke-width="1"/>` : "";
  const spark = o.state === "working" ? `<g class="tgf-pulse" fill="${RING.working}"><rect x="-1" y="6" width="1.2" height="1.2"/><rect x="20.4" y="14" width="1.2" height="1.2"/><rect x="1" y="1" width="1.2" height="1.2"/></g>` : "";
  return wrap(`<g ${o.state === "working" ? 'class="tgf-bob"' : ""} ${filt}>${r}</g>${spark}${badge}`, "-2 0 24 24");
}
function glyph(o: FaceProps) {
  const c = RING[o.state];
  return wrap(`<circle cx="32" cy="32" r="22" fill="none" stroke="${c}" stroke-width="1.6" ${o.state === "working" ? 'stroke-dasharray="26 12" class="tgf-spin"' : ""}/><text x="32" y="38" text-anchor="middle" font-size="17" font-weight="500" fill="${FG}" font-family="system-ui,sans-serif">${esc(o.letter)}</text>${o.state === "done" ? `<circle cx="49" cy="15" r="4" fill="${RING.done}"/>` : o.state === "failed" ? `<circle cx="49" cy="15" r="4" fill="${RING.failed}"/>` : ""}`);
}
function prompt(o: FaceProps) {
  const c = RING[o.state]; const name = o.name.length > 9 ? `${o.name.slice(0, 8)}…` : o.name;
  return wrap(`<rect x="3" y="14" width="58" height="36" rx="5" fill="${BG}" stroke="${c}" stroke-width="1.4"/><text x="9" y="30" font-family="ui-monospace,monospace" font-size="9" fill="${MUTED}">$</text><text x="17" y="30" font-family="ui-monospace,monospace" font-size="9" fill="${FG}">${esc(name)}</text>${o.state === "working" ? `<rect x="${Math.min(54, 17 + name.length * 5.4 + 2)}" y="22" width="5" height="10" fill="${FG}" class="tgf-blink"/>` : ""}<text x="9" y="43" font-family="ui-monospace,monospace" font-size="8" fill="${c}">${o.state === "idle" ? "· idle" : o.state === "waiting" ? "· waiting" : o.state === "working" ? "… running" : o.state === "done" ? "✓ exit 0" : "✗ exit 1"}</text>`);
}
function blueprint(o: FaceProps) {
  const c = RING[o.state];
  const ic: Record<FaceKey, string> = { leader: "M16 42 L20 24 L28 34 L32 20 L36 34 L44 24 L48 42 Z", planner: "M18 20 H46 V46 H18 Z M24 28 H40 M24 34 H40 M24 40 H34", worker: "M20 44 L36 28 M32 20 a8 8 0 0 1 12 12 l-6 -2 l-4 -4 Z", qa: "M30 40 a10 10 0 1 1 0.1 0 M38 38 L48 48 M26 31 l4 4 l7 -8", debugger: "M32 24 a8 10 0 1 0 .1 0 M24 30 l-8 -4 M24 38 l-8 4 M40 30 l8 -4 M40 38 l8 4 M32 24 V18", audit: "M32 18 L46 24 V36 C46 44 38 48 32 50 C26 48 18 44 18 36 V24 Z M26 34 l4 4 l8 -9" };
  return wrap(`<rect x="6" y="6" width="52" height="52" rx="4" fill="none" stroke="${c}" stroke-width="1" stroke-dasharray="2 3"/><path d="M6 12 H12 M52 6 V12 M58 52 H52 M12 58 V52" stroke="${c}" stroke-width="1.2"/><path d="${ic[o.face]}" fill="none" stroke="${FG}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" ${o.state === "working" ? 'stroke-dasharray="4 3" class="tgf-dash"' : ""}/>${o.state === "done" ? `<circle cx="52" cy="12" r="3.5" fill="${RING.done}"/>` : o.state === "failed" ? `<circle cx="52" cy="12" r="3.5" fill="${RING.failed}"/>` : ""}`);
}
const DRAW: Record<ThemeKey, (o: FaceProps) => string> = { cards: dots, microchip, dots, bot, pixel, glyph, prompt, blueprint };
/** The SVG of one face: pure, so a test can read it. */
export const faceSvg = (o: FaceProps): string => DRAW[o.theme](o);

const CSS = `@keyframes tgf-bob{50%{transform:translateY(-1px)}}@keyframes tgf-pulse{50%{opacity:.35}}@keyframes tgf-spin{to{transform:rotate(360deg)}}@keyframes tgf-wave{0%,100%{opacity:.25}50%{opacity:1}}@keyframes tgf-blink{50%{opacity:0}}@keyframes tgf-scan{0%,100%{transform:translateX(-3px)}50%{transform:translateX(3px)}}@keyframes tgf-dash{to{stroke-dashoffset:-14}}
.tgf-bob{animation:tgf-bob .7s steps(2) infinite}.tgf-pulse{animation:tgf-pulse 1.2s ease-in-out infinite}.tgf-spin{transform-origin:32px 32px;animation:tgf-spin 3s linear infinite}.tgf-wave{animation:tgf-wave 1.1s ease-in-out infinite}.tgf-blink{animation:tgf-blink 1s steps(2) infinite}.tgf-scan{animation:tgf-scan 1.1s ease-in-out infinite}.tgf-dash{animation:tgf-dash 1s linear infinite}
@media (prefers-reduced-motion:reduce){.tgf-bob,.tgf-pulse,.tgf-spin,.tgf-wave,.tgf-blink,.tgf-scan,.tgf-dash{animation:none!important}}`;
let cssIn = false;
function ensureCss() { if (cssIn || typeof document === "undefined") return; cssIn = true; const el = document.createElement("style"); el.setAttribute("data-agent-faces", ""); el.textContent = CSS; document.head.appendChild(el); }

/** One agent's face in the chosen theme. `size` is its square, in px. */
export function AgentFace(p: FaceProps & { size?: number }) {
  ensureCss(); const { size = 48, ...o } = p;
  return <span data-testid="agent-face" data-face-theme={o.theme} data-face-state={o.state} style={{ display: "inline-block", width: size, height: size, lineHeight: 0, flex: "none" }} dangerouslySetInnerHTML={{ __html: faceSvg(o) }} />;
}
