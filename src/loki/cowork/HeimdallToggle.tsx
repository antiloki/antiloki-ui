// HEIMDALL, PER AGENT (operator 2026-11-11: "each frontier provider has its own screening ... turn it off, don't remove it; we will use it on the local models"): the pane menu's switch. Claude, Codex, Gemini, Grok, Cursor and DeepSeek start with it OFF
// (they screen and plan their own work); OpenCode and local models start with it ON. This row says which it is and flips it; a flip that matches the default clears the override.
import * as React from "react";
import { C, nav } from "@/loki/theme";
import { paneModels, setPaneHeimdall } from "./api";

/** What the row says. Pure. */
export function heimdallLine(on: boolean, byDefault: boolean): { label: string; hint: string; next: boolean | null } {
  return on
    ? { label: "Heimdall screening: on", hint: byDefault ? "on by default for this kind of agent: it reads each ask and may ask you back" : "turned on for this agent (its provider screens its own work by itself)", next: byDefault ? false : null }
    : { label: "Heimdall screening: off", hint: byDefault ? "off by default: this provider screens and plans its own work" : "turned off for this agent", next: byDefault ? true : null };
}
export function HeimdallToggle({ paneId, onDone }: { paneId: number; onDone: () => void }) {
  const [st, setSt] = React.useState<{ on: boolean; byDefault: boolean } | null>(null);
  React.useEffect(() => { let live = true; void paneModels(paneId).then((m) => { if (live && m) setSt({ on: m.heimdall, byDefault: m.heimdallDefault }); }); return () => { live = false; }; }, [paneId]);
  if (!st) return null;
  const line = heimdallLine(st.on, st.byDefault);
  // an override that is the same as the default is cleared, so a pane is not left pinned to what it would do anyway
  const flip = async () => { const want = !st.on; const r = await setPaneHeimdall(paneId, want === st.byDefault ? null : want); if (r.ok) setSt({ on: r.heimdall === true, byDefault: r.heimdallDefault === true }); onDone(); };
  return <button role="menuitem" data-testid={`heimdall-toggle-${paneId}`} data-on={st.on ? "1" : "0"} title={line.hint} onClick={() => void flip()} style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: nav, fontSize: 12, padding: "0 5px", lineHeight: "26px", borderRadius: 4, display: "block", width: "100%", textAlign: "left", color: C.fg }}>{line.label}</button>;
}
