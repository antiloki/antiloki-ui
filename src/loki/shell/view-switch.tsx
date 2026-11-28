// THE VIEW SWITCH (operator 2026-09-17: "antiDesk is a place with 2 views — Blocks and Threads — a
// switcher floating top-center"; then "the same concept on antiIDE for Code and Design"). One
// translucent pill, two words; the chosen one wears the brand. Fixed top-center so it rides every
// view of its screen without taking a bar.
import React from "react";
import { C, nav } from "@/loki/theme";

export type ViewOption<K extends string> = { key: K; label: string };

/** WHERE THE FLOATING CHROME SITS FROM THE TOP: the screen switch, the instruments pill and the logo are one row and share this number, so moving the row is one edit and the three never drift apart.
 *  8px is where it was and where it stays (operator 2026-10-11: lowering it "a little" was tried and did not look right - "before was better"; the X-ray menu moved to a right sidebar instead, so nothing sits under it). */
export const FLOATING_TOP = 8;
export function ViewSwitch<K extends string>({ view, options, onChange, testId = "view-switch", middle, middleAt, inline = false, bar = false }: { view: K; options: readonly ViewOption<K>[]; onChange: (v: K) => void; testId?: string; middle?: React.ReactNode; middleAt?: number; /** not floating: the pill is a row of its own, full width, wherever it is put (the Cowork sidebar) */ inline?: boolean; /** drawn into a bar (the bottom bar): no pill of its own, the bar is the glass; the words sit flat in a row */ bar?: boolean }) {
  // `middle` — the mini instruments (fuel · timeline) between the words (operator 2026-09-18); `middleAt`
  // says after how many options it sits (default: the midpoint; the screen switch puts it after the first)
  const mid = middleAt ?? Math.ceil(options.length / 2);
  return (
    <div data-testid={testId} style={{ ...(inline ? { position: "relative", width: "100%", boxSizing: "border-box" as const } : { position: "fixed", top: FLOATING_TOP, left: "50%", transform: "translateX(-50%)", zIndex: 125 }), display: "flex", gap: 2, padding: bar ? 0 : 2, borderRadius: 9,
      background: `color-mix(in oklab, ${C.panel} var(--antiloki-glass, 78%), transparent)`, border: `1px solid color-mix(in oklab, ${C.border} 70%, transparent)`, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", boxShadow: "0 6px 20px rgba(0,0,0,.25)", ...(bar ? { background: "transparent", border: "none", backdropFilter: "none", WebkitBackdropFilter: "none", boxShadow: "none", width: "auto", gap: 4 } : {}) }}>
      {options.map((o, i) => {
        const on = view === o.key;
        return (<React.Fragment key={o.key}>
          {i === mid && middle != null && <div data-testid={`${testId}-middle`} style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 4px", borderLeft: `1px solid color-mix(in oklab, ${C.border} 70%, transparent)`, borderRight: `1px solid color-mix(in oklab, ${C.border} 70%, transparent)`, margin: "0 2px" }}>{middle}</div>}
          <button data-testid={`view-${o.key}`} onClick={() => onChange(o.key)} title={`${o.label} view`}
            style={{ ...(inline ? { flex: 1 } : {}), border: "none", borderRadius: 7, padding: bar ? "3px 14px" : inline ? "3px 6px" : "3px 11px", cursor: "pointer", background: on ? `color-mix(in oklab, ${C.brand} 16%, transparent)` : "transparent", color: on ? C.brand : C.muted, fontFamily: nav, fontSize: 11, fontWeight: on ? 600 : 400, transition: "background .16s ease, color .16s ease" }}>{o.label}</button>
        </React.Fragment>);
      })}
    </div>
  );
}

/** antiDesk: Blocks (every instrument on one stage) · Threads (a list — one fills the right). */
export const DESK_VIEWS = [{ key: "blocks", label: "Blocks" }, { key: "threads", label: "Threads" }] as const;
export type DeskView = (typeof DESK_VIEWS)[number]["key"];

/** antiIDE: Code (the read-only IDE) · Design (the design surface). */
export const IDE_VIEWS = [{ key: "code", label: "Code" }, { key: "design", label: "Design" }] as const;
export type IdeView = (typeof IDE_VIEWS)[number]["key"];
