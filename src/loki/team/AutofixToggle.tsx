// AUTOFIX ON THE LEADER'S TOP BAR (the operator 2026-11-18: "a run failed and the Leader did not receive the report; it should be automatic so it can fix it and try again, on by default, with an on/off button"): when a run of the team fails, the serve tells the Leader what failed and, with this on,
// asks it to fix the cause and run the team again on its own (a few failures in a row at most, then it stops and tells you). Off: the Leader is only told, and waits for you.
import * as React from "react";
import { C, mono } from "@/loki/theme";
import { teamOp } from "./api";

export function AutofixToggle({ team }: { team: string }) {
  const [on, setOn] = React.useState<boolean | null>(null); const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { let stop = false; void teamOp<{ on: boolean }>("autofix", { team }).then((r) => { if (!stop && r.ok && typeof r.on === "boolean") setOn(r.on); }); return () => { stop = true; }; }, [team]);
  if (on === null) return null;
  const flip = async () => { const next = !on; setBusy(true); setOn(next); const r = await teamOp<{ on: boolean }>("autofix_set", { team, on: next }); setBusy(false); if (!r.ok) setOn(!next); };
  return (
    <button data-testid="autofix-toggle" role="switch" aria-checked={on} aria-label={on ? "autofix on" : "autofix off"} disabled={busy} onClick={() => void flip()} onMouseDown={(e) => e.stopPropagation()} draggable={false}
      title={on ? "Autofix is on: when a run fails the Leader is told and fixes it and runs it again by itself (up to 3 failures in a row). Click to turn it off." : "Autofix is off: when a run fails the Leader is told and waits for you. Click to turn it on."}
      style={{ display: "inline-flex", alignItems: "center", gap: 0, background: "transparent", border: `1px solid ${on ? "color-mix(in srgb, #3ecf8e 50%, transparent)" : C.border}`, color: on ? "#3ecf8e" : C.muted, borderRadius: 999, height: 22, width: 26, justifyContent: "center", padding: "0 6px", cursor: "pointer", fontFamily: mono, fontSize: 10.5, lineHeight: 0, whiteSpace: "nowrap" }}>
      <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20 15 9" /><path d="m14 6 4 4" /><path d="M18 3v3M16.5 4.5h3" /><path d="M7 4v2M6 5h2" /><path d="M20 14v2M19 15h2" /></svg>
    </button>
  );
}
