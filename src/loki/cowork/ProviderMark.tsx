// THE PROVIDERS' MARKS (operator 2026-11-24: "you are using the initials of the providers instead of their logos"): a small drawn mark per provider, in the provider's own colour, for the provider button and its list.
// Plain shapes, no outside files. An unknown provider gets its first letter.
import * as React from "react";

const MARKS: Record<string, { color: string; draw: React.ReactNode }> = {
  // Anthropic's spark: eight rays
  "claude-code": { color: "#d97757", draw: <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">{[0, 45, 90, 135].map((a) => <line key={a} x1="12" y1="3" x2="12" y2="21" transform={`rotate(${a} 12 12)`} />)}</g> },
  // OpenAI's knot, simplified: a hexagon with three chords
  codex: { color: "#10a37f", draw: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" /><path d="M12 3v9l7.8 4.5M12 12l-7.8 4.5M4.2 7.5L12 12" opacity=".7" /></g> },
  // Cursor: the cube
  cursor: { color: "#a0a0a8", draw: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3l8 4.6v8.8L12 21l-8-4.6V7.6z" /><path d="M12 12l8-4.4M12 12L4 7.6M12 12v9" /></g> },
  // Gemini: the four-point star
  gemini: { color: "#4f8cf7", draw: <path fill="currentColor" d="M12 2c.7 5.6 4.4 9.3 10 10-5.6.7-9.3 4.4-10 10-.7-5.6-4.4-9.3-10-10 5.6-.7 9.3-4.4 10-10z" /> },
  // Grok: a ring cut by a stroke
  grok: { color: "#e6e6e6", draw: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="7.5" /><path d="M5 19L19 5" /></g> },
  // OpenCode: a block between brackets
  opencode: { color: "#9aa0a6", draw: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 5H5v14h3M16 5h3v14h-3" /><rect x="9.5" y="9.5" width="5" height="5" fill="currentColor" stroke="none" /></g> },
  // Antigravity: an arch lifting off a line
  gemini2: { color: "#4f8cf7", draw: null },
  antigravity: { color: "#8b7cf6", draw: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18L12 5l8 13" /><path d="M7.5 18h9" /></g> },
  // a model on this machine: a chip
  local: { color: "#7fc48f", draw: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M10 3.5v3M14 3.5v3M10 17.5v3M14 17.5v3M3.5 10h3M3.5 14h3M17.5 10h3M17.5 14h3" /></g> },
};
const ALIAS: Record<string, string> = { agy: "antigravity", "opencode-direct": "opencode", deepseek: "opencode" };
export function hasMark(key: string): boolean { const k = ALIAS[key] ?? key; return !!MARKS[k]?.draw; }

export function ProviderMark({ engine, size = 16, local = false }: { engine?: string; size?: number; local?: boolean }) {
  const k = local ? "local" : (ALIAS[engine ?? ""] ?? engine ?? "");
  const m = MARKS[k];
  if (!m || !m.draw) return <span aria-hidden data-testid="provider-mark" style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.7, fontWeight: 700 }}>{(engine ?? "?").slice(0, 1).toUpperCase()}</span>;
  return <svg data-testid="provider-mark" data-mark={k} width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ color: m.color, flexShrink: 0, display: "block" }}>{m.draw}</svg>;
}
