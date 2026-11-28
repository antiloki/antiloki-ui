// Redesign 2026-06-21: the antiloki wordmark — a bold Geist logotype. Operator: "a beautiful
// logo, very bold font." Lowercase, tight tracking, an ember accent dot. `mark` shows a small
// ember glyph before it (for the chats-sidebar header / favicon contexts).
import React from "react";
import { C, nav } from "@/loki/theme";

export function Logo({ size = 18, mark = false, compact = false }: { size?: number; mark?: boolean; compact?: boolean }) {
  // compact = the collapsed-rail monogram (operator 2026-07-14): the wordmark CUT
  // to "a." — same letters, same weight, deliberately rendered instead of clipped.
  if (compact) {
    return (
      <span style={{ fontFamily: nav, fontWeight: 700, fontSize: size, letterSpacing: size * -0.035, lineHeight: 1, userSelect: "none", color: C.fg, whiteSpace: "nowrap" }} title="antiloki">
        a<span style={{ color: C.brand }}>.</span>
      </span>
    );
  }
  return (
    <span style={{
      fontFamily: nav, fontWeight: 700, fontSize: size, letterSpacing: size * -0.035,
      color: C.fg, userSelect: "none", display: "inline-flex", alignItems: "center", gap: size * 0.34,
      lineHeight: 1, whiteSpace: "nowrap",
    }}>
      {mark && <span style={{ color: C.brand, fontSize: size * 0.92 }}>▲</span>}
      <span>antiloki<span style={{ color: C.brand }}>.</span></span>
    </span>
  );
}
