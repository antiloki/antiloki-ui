// THE AUTONOMY DIAL (the operator 2026-11-15, from AffectUI's Autonomy Dial): how much one step may do on its own, as three stops on a line: runs on its own, asks once per run, asks every time. The person sets it; the run honours it (a step that asks parks at an
// approval card and starts only on a yes). Flat: a thin track, three dots, the chosen one filled; arrow keys move it.
import * as React from "react";
import { C, nav } from "@/loki/theme";

export type Autonomy = "auto" | "ask" | "always";
export const STOPS: { key: Autonomy; label: string; hint: string }[] = [
  { key: "auto", label: "Runs on its own", hint: "starts without asking" },
  { key: "ask", label: "Asks once", hint: "asks you the first time in a run, then goes on" },
  { key: "always", label: "Asks every time", hint: "asks you before every start" },
];
/** The stop a node's setting means (none is auto). Pure. */
export const stopOf = (a: string | null | undefined): Autonomy => (a === "ask" || a === "always" ? a : "auto");
const AMBER = "#f5b942";
export function AutonomyDial({ value, onChange, disabled }: { value: string | null | undefined; onChange: (v: Autonomy) => void; disabled?: boolean }) {
  const at = STOPS.findIndex((s) => s.key === stopOf(value)); const move = (d: number) => { const n = Math.max(0, Math.min(2, at + d)); if (n !== at) onChange(STOPS[n].key); };
  return (
    <div role="slider" aria-label="autonomy" aria-valuemin={0} aria-valuemax={2} aria-valuenow={at} aria-valuetext={STOPS[at].label} tabIndex={disabled ? -1 : 0} data-testid="autonomy-dial" data-stop={STOPS[at].key}
      onKeyDown={(e) => { if (disabled) return; if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); move(1); } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); move(-1); } }}
      style={{ fontFamily: nav, fontSize: 11.5, color: C.fg, display: "grid", gap: 4, opacity: disabled ? 0.5 : 1 }}>
      <div style={{ position: "relative", height: 16, margin: "0 8px" }}>
        <i style={{ position: "absolute", left: 0, right: 0, top: 7, height: 2, background: C.border, borderRadius: 1 }} />
        <i style={{ position: "absolute", left: 0, top: 7, height: 2, width: `${at * 50}%`, background: at === 0 ? C.border : AMBER, borderRadius: 1 }} />
        {STOPS.map((s, i) => <button key={s.key} type="button" data-testid={`autonomy-${s.key}`} aria-pressed={i === at} title={s.hint} disabled={disabled} onClick={() => onChange(s.key)} style={{ position: "absolute", left: `calc(${i * 50}% - 8px)`, top: 0, width: 16, height: 16, borderRadius: "50%", border: `2px solid ${i <= at && at > 0 ? AMBER : C.border}`, background: i === at ? (at === 0 ? C.muted : AMBER) : C.panel, cursor: disabled ? "default" : "pointer", padding: 0 }} />)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", color: C.muted, fontSize: 10.5 }}>{STOPS.map((s, i) => <span key={s.key} style={{ color: i === at ? C.fg : C.muted, textAlign: i === 0 ? "left" : i === 2 ? "right" : "center", flex: 1 }}>{s.label}</span>)}</div>
    </div>
  );
}
