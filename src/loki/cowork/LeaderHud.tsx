// WHAT THE LEADER OFFERS (the operator 2026-11-22): the leader key was pressed, so a small quiet panel at the bottom says which keys do what. It is the glass of the theme (the window shell dresses it) and it goes away with the next key, Escape, or after a few seconds.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { ACTIONS, showChord, type Bindings } from "./shortcuts";

const SHOWN = ["pane.terminal", "pane.agent", "agent.specialist", "browser.light", "pane.close", "thread.remove", "thread.prev", "thread.next"] as const;
const SHORT: Record<string, string> = { "pane.terminal": "terminal", "pane.agent": "agent", "agent.specialist": "specialist", "browser.light": "light browser", "pane.close": "close pane", "thread.remove": "remove thread", "thread.prev": "dial up", "thread.next": "dial down" };
export function LeaderHud({ bindings, leader }: { bindings: Bindings; leader: string }) {
  return (
    <div role="menu" aria-label="leader" data-testid="leader-hud" style={{ position: "fixed", left: "50%", bottom: 46, transform: "translateX(-50%)", zIndex: 2147482000, padding: "8px 14px", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", maxWidth: "calc(100vw - 32px)", fontFamily: nav, fontSize: 11.5, color: C.fg, pointerEvents: "none" }}>
      <span style={{ color: C.muted, fontFamily: mono, fontSize: 10.5 }}>{showChord(leader)} then</span>
      {SHOWN.filter((id) => bindings[id]).map((id) => <span key={id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><kbd style={{ fontFamily: mono, fontSize: 10.5, padding: "1px 6px", borderRadius: 5, background: "color-mix(in srgb, var(--c-fg) 12%, transparent)" }}>{showChord(bindings[id])}</kbd><span style={{ color: C.muted }}>{SHORT[id]}</span></span>)}
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><kbd style={{ fontFamily: mono, fontSize: 10.5, padding: "1px 6px", borderRadius: 5, background: "color-mix(in srgb, var(--c-fg) 12%, transparent)" }}>1–0</kbd><span style={{ color: C.muted }}>go to thread</span></span>
      <span style={{ color: C.muted, fontFamily: mono, fontSize: 10.5 }}>Esc cancels · {ACTIONS.length} keys in all</span>
    </div>
  );
}
