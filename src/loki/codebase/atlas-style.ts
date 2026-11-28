// The style vocabulary shared by the atlas modules (same tokens as swarm-blueprint.tsx).
import * as React from "react";
import { C, mono } from "@/loki/theme";

export const sectionLabel: React.CSSProperties = {
  fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase",
  letterSpacing: 1, marginBottom: 6,
};
export const chip: React.CSSProperties = {
  fontFamily: mono, fontSize: 9.5, color: C.brand, border: `1px solid ${C.border}`,
  borderRadius: 4, padding: "0 5px", whiteSpace: "nowrap",
};
export const inputStyle: React.CSSProperties = {
  background: C.bg, border: `1px solid ${C.border}`, color: C.fg,
  fontFamily: mono, fontSize: 11, padding: "4px 8px", borderRadius: 4, outline: "none",
};
export function btn(primary?: boolean): React.CSSProperties {
  // discrete: no fill, no border — primary = ember text, the rest = dim.
  return {
    fontFamily: mono, fontSize: 11, padding: "4px 8px", borderRadius: 5, cursor: "pointer",
    border: "none",
    background: "transparent",
    color: primary ? C.brand : C.dim,
  };
}
