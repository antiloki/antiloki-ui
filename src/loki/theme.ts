// Centralized design tokens for all antiloki screens.
// Every file under src/loki used to duplicate this block. Refactor a color
// here, every screen updates.
//
// Why oklch literals instead of CSS variables? Inline styles need a real
// string at render time, and Lovable's screens use the inline-style pattern
// throughout. CSS-variable migration is a follow-up.

// Redesign 2026-06-21 (operator pick): warm graphite near-monochrome + ONE ember accent.
// Purple dropped — it read "AI-startup playful" and fought the serious/clean/private brief.
// The surface is ~90% graphite (warm-neutral, hue ~55, near-zero chroma); ember
// (oklch 0.64 0.11 38 — between Odysseus coral & Claude clay, desaturated so it reads
// serious not alarming) is the lone brand colour: send button, active tab, brand mark.
// ok/warn/bad stay functional STATE colours only — never decorative.
// Tokens resolve to CSS variables (defined in styles.css) so the theme is switchable at
// runtime (Settings → Theme). Literal values live in styles.css :root (Ember) + .theme-midnight.
export const C = {
  bg:     "var(--c-bg)",
  panel:  "var(--c-panel)",
  panel2: "var(--c-panel2)",
  border: "var(--c-border)",
  fg:     "var(--c-fg)",
  dim:    "var(--c-dim)",
  muted:  "var(--c-muted)",
  ok:     "var(--c-ok)",
  warn:   "var(--c-warn)",
  bad:    "var(--c-bad)",
  brand:  "var(--c-brand)",
  hover:  "var(--c-hover)",
  active: "var(--c-active)",
} as const;

// Runtime theme switch (operator: a settings button to toggle legacy ↔ new, both named).
export type ThemeKey = string;
export const THEMES: { key: string; label: string; hint: string }[] = [
  { key: "ember",      label: "Ember",          hint: "warm graphite + ember — the antiloki redesign" },
  { key: "midnight",   label: "Midnight",       hint: "the legacy theme — blue-graphite + violet" },
  { key: "dracula",    label: "Dracula",        hint: "the classic — dark + purple/pink" },
  { key: "onedark",    label: "One Dark",       hint: "Atom's One Dark — slate + blue" },
  { key: "monokai",    label: "Monokai",        hint: "Sublime's Monokai — olive + orange/pink" },
  { key: "nord",       label: "Nord",           hint: "arctic — muted slate + frost cyan" },
  { key: "solarized",  label: "Solarized Dark", hint: "Schoonover's teal classic" },
  { key: "gruvbox",    label: "Gruvbox Dark",   hint: "retro warm — brown + amber/orange" },
  { key: "tokyonight", label: "Tokyo Night",    hint: "deep navy + soft blue/purple" },
  { key: "githubdark", label: "GitHub Dark",    hint: "GitHub's dark — near-black + blue" },
  { key: "catppuccin", label: "Catppuccin",     hint: "Mocha — soft pastel mauve" },
  { key: "nightowl",   label: "Night Owl",      hint: "deep teal night" },
  { key: "githublight",    label: "GitHub Light",     hint: "light — clean white + blue" },
  { key: "solarizedlight", label: "Solarized Light",  hint: "light — warm cream + teal" },
  { key: "onelight",       label: "One Light",        hint: "light — Atom's One Light" },
  { key: "latte",          label: "Catppuccin Latte", hint: "light — soft pastel" },
];
const THEME_KEYS = THEMES.map((t) => t.key);
const THEME_KEY = "antiloki-theme";
export function getTheme(): ThemeKey {
  try { const v = localStorage.getItem(THEME_KEY); return v && THEME_KEYS.includes(v) ? v : "ember"; } catch { return "ember"; }
}
export function applyTheme(key: ThemeKey): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  THEME_KEYS.forEach((k) => el.classList.remove(`theme-${k}`));
  el.classList.add(`theme-${THEME_KEYS.includes(key) ? key : "ember"}`);
  try { localStorage.setItem(THEME_KEY, key); } catch { /* private mode */ }
}

export const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
// Redesign 2026-06-21: the "beautiful font" for nav tab names + headings. Geist (Vercel) —
// clean, premium, Claude-Code-adjacent. One-line swap (e.g. "Geist Mono" for a terminal feel).
export const nav = '"Geist", "AntilokiSymbols", -apple-system, system-ui, sans-serif';
