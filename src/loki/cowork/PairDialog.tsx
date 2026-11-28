// START A PAIR SESSION (operator 2026-11-13: "when dragging an agent inside another it should say start a pair session ... a team is only made with the New team button, it is a different concept: a pair is planner/QA + worker, pair
// programming"). Dropping an agent on the middle of another free agent asks one thing: go ahead? The one dropped on plans and also judges; the dragged one works. Swap changes who is who.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";

export function PairDialog({ dragged, target, onStart, onCancel }: { dragged: string; target: string; onStart: (swap: boolean) => void; onCancel: () => void }) {
  const [swap, setSwap] = React.useState(false); const planner = swap ? dragged : target; const worker = swap ? target : dragged;
  const pill = (t: string, color: string) => <span style={{ color, border: `1px solid ${color}`, borderRadius: 999, padding: "0 8px", fontSize: 11, fontFamily: mono }}>{t}</span>;
  return (
    <div role="dialog" aria-label="start a pair session" data-testid="pair-dialog" style={{ position: "fixed", inset: 0, zIndex: 120, display: "grid", placeItems: "center", background: "rgba(0,0,0,.4)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ width: 420, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12, fontFamily: nav, color: C.fg, fontSize: 13 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>Start a pair session</div>
        <div style={{ color: C.muted, lineHeight: 1.5 }}>Two agents working together, like pair programming. It is not a team: the planner plans and also judges the work, the worker does it, and if the judge says no the worker tries again (three times at most). You talk to the planner.</div>
        <div data-testid="pair-roles" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{pill("planner · QA", C.brand)}<b style={{ fontWeight: 500 }}>{planner}</b></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{pill("worker", C.ok)}<b style={{ fontWeight: 500 }}>{worker}</b></div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button data-testid="pair-swap" onClick={() => setSwap((s) => !s)} title="the planner becomes the worker and the worker the planner" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: nav }}>⇄ swap</button>
          <span style={{ flex: 1 }} />
          <button onClick={onCancel} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: nav }}>cancel</button>
          <button data-testid="pair-start" onClick={() => onStart(swap)} style={{ background: C.brand, border: "none", color: "#08201a", borderRadius: 6, padding: "4px 14px", cursor: "pointer", fontWeight: 600, fontFamily: nav }}>Start pair session</button>
        </div>
      </div>
    </div>
  );
}
