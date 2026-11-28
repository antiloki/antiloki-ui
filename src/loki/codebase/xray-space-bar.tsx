// THE SPACE FILTER OF THE X-RAY PAGE (operator 2026-11-10): one chip per registered space; the chosen one is what every panel below is about. It lives on the PAGE, not in the IDE's header band: a space with no atlas yet shows an
// empty state instead of that band, and the way out of an empty space is another one.
import * as React from "react";
import { C, mono } from "@/loki/theme";
import { XraySpaceContext } from "./xray-space";

export function XraySpaceBar() {
  const sp = React.useContext(XraySpaceContext);
  if (!sp || sp.spaces.length < 2) return null;
  return (
    <div data-testid="xray-spaces" role="group" aria-label="space" style={{ position: "absolute", top: 0, left: 96, height: 38, zIndex: 30, display: "flex", gap: 6, alignItems: "center", maxWidth: "calc(50vw - 250px)", overflowX: "auto", scrollbarWidth: "none" }}>
      {sp.spaces.map((s) => (
        <button key={s.root} data-testid={`xray-space-${s.name}`} aria-pressed={sp.chosen === s.root} title={`${s.root}${s.open ? " — the space Cowork has open" : ""}`} onClick={() => sp.choose(s.root)}
          style={{ fontFamily: mono, fontSize: 10, padding: "2px 9px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${sp.chosen === s.root ? C.brand : C.border}`, background: "transparent", color: sp.chosen === s.root ? C.brand : C.dim }}>
          {s.name}{s.open ? " ·" : ""}
        </button>
      ))}
    </div>
  );
}
