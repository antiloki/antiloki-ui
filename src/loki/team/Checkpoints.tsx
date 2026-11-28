// CHECKPOINTS (UI-18): the run's checkpoints in a line, inside the saga. "Rewind here" (it asks first: a new run spends from the budget) starts a NEW run from that point; the old run stays, and the checkpoint shows the runs started from it.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { runCheckpoints, runRewind, type Checkpoint } from "./api";

export const labelOf = (c: Checkpoint, names: Record<string, string> = {}) => c.nodes.map((n) => names[n] || n).join(", ") || `step ${c.k}`;
const btn: React.CSSProperties = { height: 22, padding: "0 9px", borderRadius: 5, border: `1px solid ${C.border}`, background: "none", color: C.fg, cursor: "pointer", font: "inherit", fontSize: 12 };

export function Checkpoints({ run, names, refreshKey, onRewound }: { run: string; names?: Record<string, string>; refreshKey?: unknown; onRewound?: (run: string) => void }) {
  const [rows, setRows] = React.useState<Checkpoint[]>([]); const [ask, setAsk] = React.useState<number | null>(null); const [err, setErr] = React.useState<string | null>(null); const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(() => { void runCheckpoints(run).then(setRows); }, [run]);
  React.useEffect(load, [load, refreshKey]);
  if (!rows.length) return null;
  const go = async (k: number) => { setBusy(true); const r = await runRewind(run, k); setBusy(false); if (!r.ok) { setErr(r.error ?? "the rewind did not start"); return; } setErr(null); setAsk(null); load(); onRewound?.(r.run ?? ""); };
  return (
    <div data-testid="checkpoints" style={{ margin: "0 12px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: nav, fontSize: 12.5, color: C.fg, position: "relative" }}>
      <div style={{ padding: "6px 14px", color: C.dim, fontSize: 11, letterSpacing: ".04em" }}>CHECKPOINTS · {rows.length}</div>
      {rows.map((c) => (
        <div key={c.k} data-testid={`checkpoint-${c.k}`} style={{ borderTop: `1px solid ${C.border}`, padding: "6px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 22 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--c-ok, #4cb782)", flex: "none" }} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{labelOf(c, names)}</span>
            <span style={{ color: C.muted }}>${(c.spent_usd ?? 0).toFixed(2)}</span><span style={{ fontFamily: mono, color: C.dim, fontSize: 11 }}>c{c.k}</span>
            <button style={btn} data-testid={`rewind-${c.k}`} onClick={() => setAsk(ask === c.k ? null : c.k)}>Rewind here</button>
          </div>
          {c.runs.length > 0 && <div style={{ marginLeft: 20, color: C.muted, fontSize: 11.5 }}>started again from here: {c.runs.join(", ")}</div>}
          {ask === c.k && <div data-testid={`rewind-ask-${c.k}`} style={{ marginLeft: 20, marginTop: 4, display: "flex", gap: 8, alignItems: "center", color: C.muted }}>A new run starts from here with the budget left. This one stays.<button style={{ ...btn, background: "var(--c-brand, #8a8fff)", borderColor: "var(--c-brand, #8a8fff)", color: "#0e0f11" }} disabled={busy} data-testid={`rewind-go-${c.k}`} onClick={() => go(c.k)}>Start</button><button style={btn} onClick={() => setAsk(null)}>Cancel</button></div>}
        </div>))}
      {err && <div data-testid="checkpoint-error" style={{ padding: "6px 14px", color: "var(--c-bad)" }}>{err}</div>}
    </div>
  );
}
