// HOW THE COWORK SCREEN LOOKS (operator 2026-11-10): terminals and panes as translucent as you like, a wallpaper behind them, and a palette from an Omarchy theme. All of it is
// the person's taste, kept per browser; none of it is the product's data. This is the pure part: the settings and their limits, and how an Omarchy palette becomes antiloki's tokens.

export type Appearance = {
  /** how opaque the terminals are (what the text sits on), 0 (clear glass: the wallpaper shows whole) to 1 (solid) */ termOpacity: number;
  /** how opaque the panes' own chrome is (headers, the sidebar, the strip), 0 to 1 */ paneOpacity: number;
  /** how far the wallpaper is darkened, 0 (as it is) to 0.85 */ dim: number;
  /** the Omarchy theme worn, or null for antiloki's own */ themeId: string | null;
  /** the wallpaper (a file of that theme); null for the theme's first; "" for none at all */ wallpaper: string | null;
  /** wear whichever theme Omarchy itself is wearing */ follow: boolean;
  /** how agent panes are drawn by default: the terminal itself, or a chat over the same terminal (a pane's own switch wins) */ agentSkin: "terminal" | "chat";
  /** how the pixel effects (a specialist's bar and avatar, the space tiles, the loaders) are drawn: in blocks, or the same thing smooth, like a moving shadow, or minimal: only the borders coloured, three dots for reasoning */ pixelStyle: "pixel" | "shadow" | "minimal" | "liquid";
  /** the custom theme over whose own look the person chose theirs; null or another theme: the theme's look is worn */ lookOver?: string | null;
};
export const DEFAULT_APPEARANCE: Appearance = { termOpacity: 0.8, paneOpacity: 0.75, dim: 0.4, themeId: null, wallpaper: null, follow: false, agentSkin: "terminal", pixelStyle: "pixel" };
export const MIN_OPACITY = 0;
export const MAX_DIM = 0.85;
export const APPEARANCE_KEY = "antiloki.cowork.appearance";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
export const clampOpacity = (n: number, fallback: number = DEFAULT_APPEARANCE.termOpacity) => clamp(num(n, fallback), MIN_OPACITY, 1);
export const clampDim = (n: number) => clamp(num(n, DEFAULT_APPEARANCE.dim), 0, MAX_DIM);

/** The settings from storage, never trusted: anything wrong falls back to the default for that field. */
export function parseAppearance(raw: unknown): Appearance {
  let v: any = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return { ...DEFAULT_APPEARANCE }; } }
  if (!v || typeof v !== "object") return { ...DEFAULT_APPEARANCE };
  const id = (x: unknown) => (typeof x === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/.test(x) ? x : null);
  const file = (x: unknown) => (typeof x === "string" && /^[A-Za-z0-9][A-Za-z0-9._ -]{0,120}\.(png|jpe?g|webp|svg)$/i.test(x) ? x : null);
  // a setting kept before the panes had their own slider: the panes follow the terminals
  const term = clampOpacity(v.termOpacity);
  return { termOpacity: term, paneOpacity: clampOpacity(v.paneOpacity, typeof v.termOpacity === "number" ? term : DEFAULT_APPEARANCE.paneOpacity), dim: clampDim(v.dim), themeId: id(v.themeId), wallpaper: v.wallpaper === "" ? "" : file(v.wallpaper), follow: v.follow === true, ...(id(v.lookOver) ? { lookOver: id(v.lookOver) } : {}), agentSkin: v.agentSkin === "chat" ? "chat" : "terminal", pixelStyle: v.pixelStyle === "shadow" || v.pixelStyle === "minimal" || v.pixelStyle === "liquid" ? v.pixelStyle : "pixel" };
}

export type Palette = Record<string, string>;
const hex = (v: unknown): string | null => (typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v : null);
const first = (c: Palette, ...keys: string[]) => { for (const k of keys) { const h = hex(c[k]); if (h) return h; } return null; };

/** An Omarchy palette (`colors.toml`) as antiloki's CSS variables. A key the theme does not have is left out, so antiloki's own value shows through. The two backgrounds are
 *  chosen as Omarchy uses them: the darkest behind everything, `background` for a panel, the lighter one for a raised surface. */
export function paletteToVars(c: Palette): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (k: string, v: string | null) => { if (v) out[k] = v; };
  set("--c-bg", first(c, "darker_background", "dark_background", "background"));
  set("--c-panel", first(c, "background"));
  set("--c-panel2", first(c, "lighter_background", "background"));
  set("--c-border", first(c, "selection", "muted"));
  set("--c-fg", first(c, "foreground", "bright_foreground"));
  set("--c-muted", first(c, "dark_foreground", "muted"));
  set("--c-dim", first(c, "muted", "dark_foreground"));
  set("--c-ok", first(c, "green"));
  set("--c-warn", first(c, "yellow", "orange"));
  set("--c-bad", first(c, "red"));
  set("--c-brand", first(c, "accent", "blue"));
  set("--c-hover", first(c, "selection"));
  set("--c-active", first(c, "lighter_background", "selection"));
  return out;
}

/** The address of a theme's wallpaper (or preview) on the serve. */
export const themeFileUrl = (be: string, id: string, file: string): string => `${be}/api/v1/themes/omarchy/file?id=${encodeURIComponent(id)}&path=${encodeURIComponent(file.includes("/") || file === "preview.png" ? file : `backgrounds/${file}`)}`;

/** The wallpaper to show: the chosen file if the theme has it, else the theme's first, else none. */
export function pickWallpaper(backgrounds: string[], chosen: string | null): string | null {
  if (chosen && backgrounds.includes(chosen)) return chosen;
  return backgrounds[0] ?? null;
}

/** How the panes are drawn at a given opacity: the share of the panel colour that is kept, as a CSS percentage. */
export const panePct = (opacity: number): string => `${Math.round(clampOpacity(opacity) * 100)}%`;
/** The dark layer over the wallpaper, as a CSS colour. */
export const dimLayer = (dim: number): string => `color-mix(in srgb, var(--c-bg) ${Math.round(clampDim(dim) * 100)}%, transparent)`;

// ── the palette, remembered for the next first frame ────────────────────────────────────────────────────────────────────────
/** every variable a palette can set (what a boot or a change clears before the new one goes on) */
export const PALETTE_VARS = ["--c-bg", "--c-panel", "--c-panel2", "--c-border", "--c-fg", "--c-muted", "--c-dim", "--c-ok", "--c-warn", "--c-bad", "--c-brand", "--c-hover", "--c-active"] as const;
const VARS_KEY = "antiloki.cowork.appearance.vars";
/** Keeps (or forgets, with `null`) the CSS variables of the worn palette. Only a convenience: storage may be blocked. */
export function rememberVars(vars: Record<string, string> | null): void { try { if (vars) window.localStorage.setItem(VARS_KEY, JSON.stringify(vars)); else window.localStorage.removeItem(VARS_KEY); } catch { /* blocked storage */ } }
/** Puts the remembered palette on the page before React paints (called from `main.tsx`), so a page does not flash antiloki's own colours first. Only `--c-*` colour values are taken. */
export function bootAppearance(): void {
  try {
    const raw = window.localStorage.getItem(VARS_KEY); if (!raw) return;
    const v = JSON.parse(raw); if (!v || typeof v !== "object") return;
    for (const [k, c] of Object.entries(v)) if (/^--c-[a-z0-9]+$/.test(k) && typeof c === "string" && /^#[0-9a-f]{3,8}$/i.test(c)) document.documentElement.style.setProperty(k, c);
  } catch { /* nothing remembered */ }
}
