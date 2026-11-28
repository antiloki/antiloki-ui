// STEER A RUNNING TEAM (AffectUI's Steering idea, our build): leave a note and every agent call that starts after it is told it, as the person's own words; nothing is stopped. The notes sent so far are listed under the box.
import * as React from "react";
import { C, nav } from "@/loki/theme";
import { steerRun } from "./api";

export function SteerBox({ run }: { run: string }) {
  const [text, setText] = React.useState(""); const [sent, setSent] = React.useState<string[]>([]); const [err, setErr] = React.useState(""); const [busy, setBusy] = React.useState(false);
  const send = async () => { const t = text.trim(); if (!t || busy) return; setBusy(true); const r = await steerRun(run, t); setBusy(false); if (r.ok) { setSent((x) => [...x, t]); setText(""); setErr(""); } else setErr(r.error ?? "the note was not added"); };
  return (
    <div data-testid="steer" style={{ fontFamily: nav, fontSize: 12.5, color: C.fg, padding: "6px 16px", borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input id="steer-text" data-testid="steer-text" aria-label="a note for the running team" value={text} placeholder="Steer it: a note for the steps that start next" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} style={{ flex: 1, minWidth: 0, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", fontFamily: nav, fontSize: 12.5 }} />
        <button data-testid="steer-send" disabled={busy || !text.trim()} onClick={() => void send()} style={{ fontFamily: nav, fontSize: 12, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", opacity: text.trim() ? 1 : 0.5 }}>Add note</button>
      </div>
      {err && <div data-testid="steer-error" style={{ color: "var(--c-bad)", marginTop: 4 }}>{err}</div>}
      {sent.length > 0 && <ul data-testid="steer-sent" style={{ margin: "4px 0 0", paddingLeft: 18, color: C.muted }}>{sent.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    </div>
  );
}
