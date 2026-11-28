import * as React from "react";
import { C, mono } from "@/loki/theme";

/** A SCREEN THAT IS NOT READY (operator 2026-10-11: "replace the ultra review page for a soon, so you can keep the button and make all the page there but blurred"): the page is drawn as it will be, behind
 *  a blur that cannot be clicked or read by a screen reader, with a card on top that says it is coming. `on` false draws the page as it is (the dev build). */
export function SoonBlur({ on, title, text, children }: { on: boolean; title: string; text?: string; children: React.ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <div data-testid="soon-blur" style={{ position: "relative", flex: 1, minHeight: 360, overflow: "hidden", borderRadius: 8 }}>
      <div aria-hidden inert style={{ filter: "blur(7px) saturate(.85)", opacity: 0.55, pointerEvents: "none", userSelect: "none", height: "100%" }}>{children}</div>
      <div data-testid="soon-overlay" role="status" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "color-mix(in oklab, var(--c-bg) 35%, transparent)" }}>
        <div style={{ textAlign: "center", maxWidth: 380, padding: "22px 26px", borderRadius: 12, border: `1px solid ${C.border}`, background: `color-mix(in oklab, ${C.panel} 94%, transparent)`, boxShadow: "0 14px 40px rgba(0,0,0,.4)" }}>
          <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.warn, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 10px" }}>soon</span>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.fg, margin: "12px 0 6px" }}>{title}</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.55 }}>{text ?? "We are finishing it. It will open here, ready to use, in a coming version."}</div>
        </div>
      </div>
    </div>
  );
}

/** A BUTTON (OR A ROW OF THEM) THAT IS NOT READY (operator 2026-10-11: "hide the buttons - not the functionality - blurred with soon, just like the Ultra review, but just those buttons"). The buttons stay where they are, drawn blurred, unclickable and out of the
 *  accessibility tree, with a small "soon" tag on top; the code behind them is untouched. `on` false draws them as they are (the dev build). */
export function SoonInline({ on, title, children }: { on: boolean; title?: string; children: React.ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <span data-testid="soon-inline" title={title ?? "coming in a future version"} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 10, cursor: "default" }}>
      <span aria-hidden inert style={{ display: "inline-flex", alignItems: "center", gap: 10, filter: "blur(3.5px) saturate(.8)", opacity: 0.55, pointerEvents: "none", userSelect: "none" }}>{children}</span>
      <span data-testid="soon-inline-tag" role="status" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
        <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", color: C.warn, border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 10px", background: `color-mix(in oklab, ${C.panel} 92%, transparent)` }}>soon</span>
      </span>
    </span>
  );
}

