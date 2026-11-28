import { paneKey } from "@/loki/api/workspace-scope";
// THE AGENT THEMES (operator 2026-09-20: "a theme button to switch the agent theme — Claude, Codex,
// OpenCode, terminal, Windows, Linux, Mac, Windows XP. Not just the colors — change its style").
// A theme is a whole personality for the conversation: the layout (bubbles vs a transcript), the type,
// the glyphs each side speaks with, how a tool call is written, how a turn ends, the composer's shape.
// Pure data + pure helpers; the pane renders from it. THERE IS NO HOUSE THEME (operator 2026-10-11: "remove the antiloki theme completely"): every agent, antiChat included, wears its
// engine's own look - Claude, Codex, Cursor, Gemini, Grok, or the model for OpenCode - and the picker offers every theme there is.
export type AgentThemeKey = "claude" | "codex" | "cursor" | "gemini" | "grok" | "opencode" | "deepseek" | "kimi" | "qwen" | "terminal" | "windows" | "linux" | "mac" | "xp";
export type AgentTheme = {
  key: AgentThemeKey; label: string; hint: string;
  /** bubbles = a messenger; transcript = lines with a prompt glyph, the way a CLI paints */
  layout: "bubbles" | "transcript";
  font: string; mono: string; size: number;
  bg: string; fg: string; muted: string; dim: string; accent: string; panel: string; border: string;
  radius: number;
  /** the user's line: how it is marked and painted */
  user: { glyph: string; bg: string; fg: string; border?: string; align: "right" | "left"; band?: boolean };
  reply: { glyph: string; bg: string; fg: string; border?: string };
  tool: { glyph: string; style: "line" | "box" | "cmd" };
  /** the line that closes a turn — `{s}` seconds, `{cost}` dollars */
  done: string;
  composer: { prompt: string; placeholder: string; bg: string; border: string; radius: number; hint: string; button?: string };
  /** an OS chrome around the pane: a title bar */
  chrome?: { kind: "xp" | "mac" | "win" | "gnome"; title: string };
};

const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
export const AGENT_THEMES: Record<AgentThemeKey, AgentTheme> = {
  // THE ENGINES THAT HAD NO LOOK OF THEIR OWN (2026-10-11): Cursor, Gemini and Grok used to fall back to the house theme. Each is a transcript in its vendor's colours.
  cursor: { key: "cursor", label: "Cursor", hint: "the Cursor CLI: → asks, ◇ tools, black and white", layout: "transcript", font: MONO, mono: MONO, size: 12.5,
    bg: "#0d0d0d", fg: "#ececec", muted: "#a1a1a1", dim: "#5a5a5a", accent: "#f2f2f2", panel: "#161616", border: "#2b2b2b", radius: 6,
    user: { glyph: "→ ", bg: "transparent", fg: "#ffffff", align: "left" }, reply: { glyph: "", bg: "transparent", fg: "#ececec" }, tool: { glyph: "◇ ", style: "line" },
    done: "· {s}s · ${cost}", composer: { prompt: "→ ", placeholder: "Ask Cursor…", bg: "#0d0d0d", border: "#333333", radius: 6, hint: "⏎ send · ⚡ heimdall first" } },
  gemini: { key: "gemini", label: "Gemini", hint: "the Gemini / Antigravity CLI: > asks, ✦ answers, Google blue", layout: "transcript", font: MONO, mono: MONO, size: 12.5,
    bg: "#0f1218", fg: "#e3e8f4", muted: "#9aa5bd", dim: "#555f77", accent: "#8ab4f8", panel: "#161b25", border: "#252d3d", radius: 6,
    user: { glyph: "> ", bg: "transparent", fg: "#ffffff", align: "left" }, reply: { glyph: "✦ ", bg: "transparent", fg: "#e3e8f4" }, tool: { glyph: "› ", style: "line" },
    done: "✦ {s}s · ${cost}", composer: { prompt: "> ", placeholder: "Ask Antigravity…", bg: "#0f1218", border: "#2f394d", radius: 6, hint: "⏎ send · ⚡ heimdall first" } },
  grok: { key: "grok", label: "Grok", hint: "the Grok CLI: $ asks, ↳ tools, white on black", layout: "transcript", font: MONO, mono: MONO, size: 12.5,
    bg: "#000000", fg: "#e7e9ea", muted: "#8b949e", dim: "#4a4f55", accent: "#e7e9ea", panel: "#0b0b0b", border: "#1f1f1f", radius: 4,
    user: { glyph: "$ ", bg: "transparent", fg: "#ffffff", align: "left" }, reply: { glyph: "", bg: "transparent", fg: "#e7e9ea" }, tool: { glyph: "↳ ", style: "line" },
    done: "── {s}s · ${cost}", composer: { prompt: "$ ", placeholder: "Ask Grok…", bg: "#000000", border: "#2a2a2a", radius: 4, hint: "⏎ send · ⚡ heimdall first" } },
  claude: { key: "claude", label: "Claude Code", hint: "the Claude Code TUI: ❯ asks, ● answers, ⎿ tools, ✻ done", layout: "transcript", font: MONO, mono: MONO, size: 12.5,
    bg: "#0e0e0e", fg: "#e8e6e3", muted: "#9a9590", dim: "#5c5854", accent: "#d97757", panel: "#161616", border: "#2a2825", radius: 0,
    user: { glyph: "❯ ", bg: "#2b2521", fg: "#e8e6e3", align: "left", band: true }, reply: { glyph: "● ", bg: "transparent", fg: "#e8e6e3" }, tool: { glyph: "⎿ ", style: "line" },
    done: "✻ Crunched for {s}s · ${cost}", composer: { prompt: "❯ ", placeholder: "Try \"fix the failing test\"", bg: "#0e0e0e", border: "#3a3733", radius: 0, hint: "▸▸ auto mode on (shift+tab to cycle) · ⚡ heimdall routes the ask first" } },
  codex: { key: "codex", label: "Codex", hint: "the Codex TUI: › asks, • answers, $ commands, └ output", layout: "transcript", font: MONO, mono: MONO, size: 12.5,
    bg: "#0b0f19", fg: "#e6edf3", muted: "#8b98a5", dim: "#4b5563", accent: "#5ea3ff", panel: "#111827", border: "#1f2937", radius: 6,
    user: { glyph: "› ", bg: "transparent", fg: "#ffffff", align: "left" }, reply: { glyph: "• ", bg: "transparent", fg: "#e6edf3" }, tool: { glyph: "$ ", style: "cmd" },
    done: "── tokens used · ${cost} · {s}s", composer: { prompt: "› ", placeholder: "Ask Codex to do anything", bg: "#0b0f19", border: "#374151", radius: 6, hint: "⏎ send · /model · /clear · ⚡ heimdall first" } },
  opencode: { key: "opencode", label: "OpenCode", hint: "the OpenCode TUI: boxed asks, → tools, a purple accent", layout: "transcript", font: MONO, mono: MONO, size: 12.5,
    bg: "#121216", fg: "#e4e4e7", muted: "#9f9fae", dim: "#5b5b6b", accent: "#a78bfa", panel: "#1a1a21", border: "#2b2b36", radius: 6,
    user: { glyph: "▎", bg: "#1a1a21", fg: "#e4e4e7", border: "#2b2b36", align: "left", band: true }, reply: { glyph: "", bg: "transparent", fg: "#e4e4e7" }, tool: { glyph: "→ ", style: "line" },
    done: "◇ {s}s · ${cost}", composer: { prompt: "", placeholder: "Ask anything…", bg: "#1a1a21", border: "#2b2b36", radius: 8, hint: "ctrl+p commands · ⚡ heimdall first" } },
  // THE MODEL THEMES (operator 2026-09-23: "use the themes for the colors of claude, codex and the others — each one
  // has a theme"): the three OpenCode base agents, each in its own accent — DeepSeek's blue, Kimi's mint, Qwen's violet.
  deepseek: { key: "deepseek", label: "DeepSeek", hint: "DeepSeek over OpenCode: boxed asks, → tools, the whale's blue", layout: "transcript", font: MONO, mono: MONO, size: 12.5,
    bg: "#0f1320", fg: "#e3e8f5", muted: "#9aa6c4", dim: "#56607a", accent: "#4d6bfe", panel: "#161b2c", border: "#252c42", radius: 6,
    user: { glyph: "▎", bg: "#161b2c", fg: "#e3e8f5", border: "#252c42", align: "left", band: true }, reply: { glyph: "", bg: "transparent", fg: "#e3e8f5" }, tool: { glyph: "→ ", style: "line" },
    done: "◇ {s}s · ${cost}", composer: { prompt: "", placeholder: "Ask DeepSeek…", bg: "#161b2c", border: "#252c42", radius: 8, hint: "ctrl+p commands · ⚡ heimdall first" } },
  kimi: { key: "kimi", label: "Kimi", hint: "Kimi over OpenCode: boxed asks, → tools, a mint accent", layout: "transcript", font: MONO, mono: MONO, size: 12.5,
    bg: "#0f1614", fg: "#e2efe9", muted: "#95b3a8", dim: "#4f6a60", accent: "#2ec9a0", panel: "#151f1b", border: "#233530", radius: 6,
    user: { glyph: "▎", bg: "#151f1b", fg: "#e2efe9", border: "#233530", align: "left", band: true }, reply: { glyph: "", bg: "transparent", fg: "#e2efe9" }, tool: { glyph: "→ ", style: "line" },
    done: "◇ {s}s · ${cost}", composer: { prompt: "", placeholder: "Ask Kimi…", bg: "#151f1b", border: "#233530", radius: 8, hint: "ctrl+p commands · ⚡ heimdall first" } },
  qwen: { key: "qwen", label: "Qwen", hint: "Qwen over OpenCode: boxed asks, → tools, a violet accent", layout: "transcript", font: MONO, mono: MONO, size: 12.5,
    bg: "#14111f", fg: "#ebe6f7", muted: "#ad9fd0", dim: "#61557f", accent: "#8b5cf6", panel: "#1c172b", border: "#2d2542", radius: 6,
    user: { glyph: "▎", bg: "#1c172b", fg: "#ebe6f7", border: "#2d2542", align: "left", band: true }, reply: { glyph: "", bg: "transparent", fg: "#ebe6f7" }, tool: { glyph: "→ ", style: "line" },
    done: "◇ {s}s · ${cost}", composer: { prompt: "", placeholder: "Ask Qwen…", bg: "#1c172b", border: "#2d2542", radius: 8, hint: "ctrl+p commands · ⚡ heimdall first" } },
  terminal: { key: "terminal", label: "terminal", hint: "green on black, $ prompts, nothing else", layout: "transcript", font: MONO, mono: MONO, size: 12.5,
    bg: "#000000", fg: "#33ff66", muted: "#1fbf4c", dim: "#146e2e", accent: "#33ff66", panel: "#000000", border: "#146e2e", radius: 0,
    user: { glyph: "$ ", bg: "transparent", fg: "#ffffff", align: "left" }, reply: { glyph: "", bg: "transparent", fg: "#33ff66" }, tool: { glyph: "# ", style: "cmd" },
    done: "[done {s}s cost=${cost}]", composer: { prompt: "$ ", placeholder: "", bg: "#000000", border: "#146e2e", radius: 0, hint: "" } },
  windows: { key: "windows", label: "Windows 11", hint: "Segoe UI, Mica gray, the Fluent blue", layout: "bubbles", font: '"Segoe UI", "Segoe UI Variable", system-ui, sans-serif', mono: '"Cascadia Code", Consolas, monospace', size: 13,
    bg: "#f3f3f3", fg: "#1b1b1b", muted: "#5d5d5d", dim: "#8a8a8a", accent: "#0067c0", panel: "#ffffff", border: "#e5e5e5", radius: 6,
    user: { glyph: "", bg: "#0067c0", fg: "#ffffff", align: "right" }, reply: { glyph: "", bg: "#ffffff", fg: "#1b1b1b", border: "#e5e5e5" }, tool: { glyph: "▸ ", style: "box" },
    done: "Done in {s}s · ${cost}", composer: { prompt: "", placeholder: "Type a message", bg: "#ffffff", border: "#d0d0d0", radius: 6, hint: "", button: "Send" }, chrome: { kind: "win", title: "Claude Code — antiloki" } },
  linux: { key: "linux", label: "GNOME", hint: "Cantarell, Adwaita, a header bar", layout: "bubbles", font: 'Cantarell, Ubuntu, "Noto Sans", system-ui, sans-serif', mono: '"Source Code Pro", "DejaVu Sans Mono", monospace', size: 13.5,
    bg: "#f6f5f4", fg: "#2e3436", muted: "#5e5c64", dim: "#9a9996", accent: "#3584e4", panel: "#ffffff", border: "#d8d4d0", radius: 10,
    user: { glyph: "", bg: "#3584e4", fg: "#ffffff", align: "right" }, reply: { glyph: "", bg: "#ffffff", fg: "#2e3436", border: "#d8d4d0" }, tool: { glyph: "⚙ ", style: "box" },
    done: "Finished · {s}s · ${cost}", composer: { prompt: "", placeholder: "Message…", bg: "#ffffff", border: "#d8d4d0", radius: 20, hint: "", button: "Send" }, chrome: { kind: "gnome", title: "Claude Code" } },
  mac: { key: "mac", label: "macOS", hint: "SF, iMessage bubbles, blue and gray", layout: "bubbles", font: '-apple-system, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif', mono: '"SF Mono", Menlo, monospace', size: 13.5,
    bg: "#ffffff", fg: "#1c1c1e", muted: "#6e6e73", dim: "#aeaeb2", accent: "#0b84ff", panel: "#f2f2f7", border: "#e5e5ea", radius: 18,
    user: { glyph: "", bg: "#0b84ff", fg: "#ffffff", align: "right" }, reply: { glyph: "", bg: "#e9e9eb", fg: "#1c1c1e" }, tool: { glyph: "", style: "box" },
    done: "Delivered · {s}s · ${cost}", composer: { prompt: "", placeholder: "iMessage", bg: "#ffffff", border: "#c7c7cc", radius: 20, hint: "", button: "↑" }, chrome: { kind: "mac", title: "Claude Code" } },
  xp: { key: "xp", label: "Windows XP", hint: "Luna: Tahoma, the blue title bar, beveled buttons", layout: "bubbles", font: 'Tahoma, "MS Sans Serif", Verdana, sans-serif', mono: '"Lucida Console", monospace', size: 12,
    bg: "#ece9d8", fg: "#000000", muted: "#4d4d4d", dim: "#7f7f7f", accent: "#0a246a", panel: "#ffffff", border: "#919b9c", radius: 3,
    user: { glyph: "", bg: "#fff7d6", fg: "#000000", border: "#e2cf86", align: "right" }, reply: { glyph: "", bg: "#ffffff", fg: "#000000", border: "#919b9c" }, tool: { glyph: "» ", style: "box" },
    done: "Done — {s}s, ${cost}", composer: { prompt: "", placeholder: "", bg: "#ffffff", border: "#7f9db9", radius: 0, hint: "", button: "Send" }, chrome: { kind: "xp", title: "Claude Code - antiloki" } },
};
export const AGENT_THEME_KEYS = Object.keys(AGENT_THEMES) as AgentThemeKey[];
/** a theme by key; anything the app does not have (an old "antiloki" saved on a pane or a recipe) reads as the generic terminal look */
export function agentTheme(key: string | null | undefined): AgentTheme { return AGENT_THEMES[key as AgentThemeKey] ?? AGENT_THEMES.terminal; }
/** `wanted` when it names a theme the app has, else `fallback` (the engine's own). Pure. */
export function validThemeOr(wanted: string | null | undefined, fallback: AgentThemeKey): AgentThemeKey { return wanted && AGENT_THEMES[wanted as AgentThemeKey] ? (wanted as AgentThemeKey) : fallback; }
/** The closing line of a turn in the theme's voice. Pure. */
export function doneLine(theme: AgentTheme, ms: number, cost: number): string {
  return theme.done.replace("{s}", (ms / 1000).toFixed(1)).replace("{cost}", cost.toFixed(3));
}
/** The engine's own look (operator 2026-09-20: "claude agent should spawn with claude theme, codex, open code as well their themes"):
 *  a pane starts dressed as its CLI until the viewer picks another. An OpenCode pane dresses as the MODEL it runs
 *  (2026-09-23: DeepSeek · Kimi · Qwen each have a theme) — `hint` is its model id, or a pair label ("Kimi × DeepSeek":
 *  the brain, first, wins). Pure — tested. */
export function engineTheme(paneKind: string | null | undefined, hint?: string | null): AgentThemeKey {
  const k = String(paneKind ?? "");
  if (k === "claude-code") return "claude";
  if (k === "codex") return "codex";
  if (k.startsWith("opencode")) return modelTheme(hint) ?? "opencode";
  if (k === "cursor") return "cursor";
  if (k === "gemini") return "gemini";
  if (k === "grok") return "grok";
  return "terminal";
}
/** The theme of an OpenCode model by its name — the first of deepseek/kimi/qwen that appears. Pure. */
export function modelTheme(hint: string | null | undefined): AgentThemeKey | null {
  const h = String(hint ?? "").toLowerCase();
  const at = (["deepseek", "kimi", "qwen"] as const).map((m) => [m, h.indexOf(m)] as const).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]);
  return at.length ? at[0][0] : null;
}
/** THE FACE'S COLOUR (operator 2026-09-23: "each one has a theme"): a saved theme's accent, else the engine's (the
 *  model's for OpenCode), else undefined — the face then falls back to its palette. Pure — tested. */
export function faceColor(theme?: string | null, engine?: string | null, hint?: string | null): string | undefined {
  const t = theme && AGENT_THEMES[theme as AgentThemeKey]?.accent ? AGENT_THEMES[theme as AgentThemeKey] : null;
  if (t) return t.accent;
  // an engine with no look of its own (the generic terminal fallback) has no colour either: the face keeps its palette
  const k = engineTheme(engine, hint);
  return engine && k !== "terminal" ? AGENT_THEMES[k].accent || undefined : undefined;
}
/** Where the viewer keeps the theme for a pane (a per-viewer taste, not a pane setting). */
// THE KEY IS VERSIONED (2026-09-28): every agent started on `antiloki` the day the picker left, but Main kept a theme
// chosen months earlier and drew a different chrome from its own forks. `v2` drops those stale picks; a pick from the
// restored button is stored under it and stays.
export function loadTheme(paneId: number, fallback?: string | null): AgentThemeKey {
  const fb = validThemeOr(fallback, "terminal");
  try { return validThemeOr(localStorage.getItem(paneKey("antiloki:agent-theme:v2", paneId)), fb); } catch { return fb; }
}
export function saveTheme(paneId: number, key: AgentThemeKey) { try { localStorage.setItem(paneKey("antiloki:agent-theme:v2", paneId), key); } catch { /* fine */ } }
