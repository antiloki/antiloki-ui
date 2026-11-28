// The DISCRETE Heimdall flag (operator 2026-07-19): every AI-calling surface can
// carry one. Cycles: global (the cooking switch decides) → rank-1 (exploit: the
// ledger's top sample-ok model is pinned; casting reason 'ledger') → training
// (the rotation runs; the ledger keeps learning). Backed by system.heimdall.mode;
// ai-call reads the row at its chokepoint, so the flag governs every call of the
// surface with nothing threaded through callers.
import React from "react";
import { apiPost } from "@/loki/api/client";
import { C } from "@/loki/theme";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
const NEXT: Record<string, string> = { default: "rank1", rank1: "train", train: "default" };
const LABEL: Record<string, string> = { default: "⚡ heimdall · global", rank1: "① heimdall · rank-1", train: "⚡ heimdall · training" };
const TIP: Record<string, string> = {
  default: "follows the global cooking switch — click to pin rank-1, click again for training",
  rank1: "exploit — every call of this surface takes the ledger's ranking-1 model (cold ledger → empirical top order)",
  train: "training — the model rotation runs for this surface; Heimdall's ledger keeps learning",
};

export function HeimdallFlag({ template }: { template: string }) {
  const [mode, setMode] = React.useState<string>("default");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.heimdall.mode", input: { op: "get", template_base: template } });
        const d = r?.result?.result ?? r?.result ?? r;
        if (alive && d?.ok) setMode(d.mode ?? "default");
      } catch { /* a BE without the action — the flag stays at global */ }
    })();
    return () => { alive = false; };
  }, [template]);
  const cycle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.heimdall.mode", input: { op: "set", template_base: template, mode: NEXT[mode] ?? "default" } });
      const d = r?.result?.result ?? r?.result ?? r;
      if (d?.ok !== false) setMode(d?.mode ?? "default");
    } catch { /* refused — the mode stands */ }
    finally { setBusy(false); }
  };
  return (
    <button onClick={() => void cycle()} disabled={busy} title={TIP[mode] ?? TIP.default}
      style={{ background: "transparent", border: `1px solid ${C.border}`, color: mode === "default" ? C.dim : C.muted, borderRadius: 5, padding: "0 8px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>
      {busy ? "…" : (LABEL[mode] ?? LABEL.default)}
    </button>
  );
}
