// THE PROVIDER SPRITES (operator 2026-11-10: "instead of the coloured dots, the provider's logo like herdr does, a mini icon of the provider of the model ... you create the sprites svg"). One small mark per engine, drawn here, 24×24, flat:
// they are our own simple glyphs in each provider's own colour, not their trademarked logos. An agent whose engine has no sprite wears a plain chip.
import * as React from "react";

export type SpriteKey = "claude-code" | "codex" | "opencode" | "gemini" | "grok" | "cursor" | "deepseek";
export const SPRITE_COLOR: Record<SpriteKey, string> = { "claude-code": "#d97757", codex: "#19c39b", opencode: "#5ad1b5", gemini: "#6f9bff", grok: "#e4ecef", cursor: "#c5ccd1", deepseek: "#5b7bff" };
export const SPRITE_NAME: Record<SpriteKey, string> = { "claude-code": "Claude Code", codex: "Codex", opencode: "OpenCode", gemini: "Antigravity", grok: "Grok", cursor: "Cursor", deepseek: "DeepSeek" };

/** Which sprite an engine wears: its key, or the family it belongs to (`opencode-direct` is OpenCode; the antigravity seat is Gemini). `null` when there is none. Pure. */
export function spriteOf(engine: string | null | undefined): SpriteKey | null {
  const e = String(engine ?? "").toLowerCase();
  if (e === "claude-code" || e.startsWith("claude")) return "claude-code";
  if (e === "codex" || e.startsWith("codex")) return "codex";
  if (e.startsWith("opencode")) return "opencode";
  if (e === "gemini" || e === "antigravity" || e === "agy") return "gemini";
  if (e === "grok") return "grok";
  if (e === "cursor" || e.startsWith("cursor")) return "cursor";
  if (e.startsWith("deepseek")) return "deepseek";
  return null;
}

/** The marks, in a 24×24 box. Strokes use the provider's colour. */
function Glyph({ k, c }: { k: SpriteKey; c: string }) {
  const s = { fill: "none", stroke: c, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (k) {
    // a spark of eight rays
    case "claude-code": return <g {...s}>{[0, 45, 90, 135].map((a) => <path key={a} d="M12 3.5v17" transform={`rotate(${a} 12 12)`} />)}</g>;
    // a rounded hexagon holding a prompt
    case "codex": return <g {...s}><path d="M12 2.8l7.9 4.6v9.2L12 21.2l-7.9-4.6V7.4z" /><path d="M9 10.2l2.6 2L9 14.2M13 14.4h2.8" strokeWidth={1.9} /></g>;
    // two brackets with a cursor between
    case "opencode": return <g {...s}><path d="M8.5 4.5H5.5v15h3M15.5 4.5h3v15h-3" /><path d="M12 9.5v5" strokeWidth={2.6} /></g>;
    // a four-point star
    case "gemini": return <path d="M12 2.5c.8 5.2 4.3 8.7 9.5 9.5-5.2.8-8.7 4.3-9.5 9.5-.8-5.2-4.3-8.7-9.5-9.5 5.2-.8 8.7-4.3 9.5-9.5z" fill={c} />;
    // a ring struck through
    case "grok": return <g {...s}><circle cx="12" cy="12" r="8.2" /><path d="M6.8 17.4L17.4 6.6" /></g>;
    // a cube with its three faces
    case "cursor": return <g {...s}><path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z" /><path d="M4 7.4l8 4.6 8-4.6M12 12v9" /></g>;
    // a small whale
    case "deepseek": return <g {...s}><path d="M3.5 13.5c0-4 3.3-7 7.6-7 3.6 0 6 1.9 7.4 4.6l2.6-1.6-.6 4.2-2.7 1.2c-1.3 2.6-3.9 4-7 4-3.6 0-7.3-1.4-7.3-5.4z" /><circle cx="8.6" cy="11.2" r=".9" fill={c} stroke="none" /></g>;
  }
}

/** The mark of an engine, `size` px square. `title` is what a hover says. */
export function ProviderIcon({ engine, size = 18, title }: { engine: string | null | undefined; size?: number; title?: string }) {
  const k = spriteOf(engine); const c = k ? SPRITE_COLOR[k] : "#93a3ab";
  return (
    <svg data-testid={`provider-${k ?? "none"}`} data-sprite={k ?? ""} viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={title ?? (k ? SPRITE_NAME[k] : "agent")} style={{ flexShrink: 0, overflow: "visible" }}>
      {title && <title>{title}</title>}
      {k ? <Glyph k={k} c={c} /> : <circle cx="12" cy="12" r="7" fill="none" stroke={c} strokeWidth={2.2} />}
    </svg>
  );
}
