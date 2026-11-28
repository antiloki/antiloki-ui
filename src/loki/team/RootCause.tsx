// ROOT CAUSE (UI-19): when a run is blocked, the causes tested against what it left: confirmed with the evidence, ruled out with why. The finding can be copied (with the improver's brief) for the improver. Quiet when the run did not fail.
import * as React from "react";
import { C, nav } from "@/loki/theme";
import { improvePrompt, rootCause, type RootCause as RC } from "./api";

const tone = (s: string) => (s === "confirmed" ? { bg: "#4cb78222", fg: "var(--c-ok, #4cb782)", word: "confirmed" } : { bg: "#e5484d22", fg: "var(--c-bad, #e5484d)", word: "ruled out" });
export function RootCause({ run, team, failed }: { run: string; team: string; failed: boolean }) {
  const [rc, setRc] = React.useState<RC | null>(null); const [copied, setCopied] = React.useState(false);
  React.useEffect(() => { if (!failed) { setRc(null); return; } let on = true; void rootCause(run).then((r) => on && setRc(r)); return () => { on = false; }; }, [run, failed]);
  if (!failed || !rc) return null;
  const copy = async () => { const p = await improvePrompt(team); const text = `${rc.finding}\n\n${p.ok && p.prompt ? p.prompt : ""}`; try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* no clipboard */ } };
  return (
    <div data-testid="root-cause" style={{ margin: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: nav, fontSize: 12.5, color: C.fg }}>
      <div style={{ padding: "6px 14px", color: C.dim, fontSize: 11, letterSpacing: ".04em" }}>RUN FAILED AT {rc.node.toUpperCase()} · WHY</div>
      {rc.hypotheses.map((h) => { const t = tone(h.status); return (
        <div key={h.claim} data-testid={`cause-${h.status}`} style={{ display: "flex", gap: 12, alignItems: "center", minHeight: 32, padding: "4px 14px", borderTop: `1px solid ${C.border}` }}>
          <span style={{ background: t.bg, color: t.fg, borderRadius: 9, padding: "0 8px", fontSize: 11, lineHeight: "18px", flex: "none" }}>{t.word}</span>
          <span style={{ flex: 1 }}>{h.claim}<span style={{ color: C.muted }}> · {h.evidence}</span></span>
        </div>); })}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: `1px solid ${C.border}`, color: C.muted }}>
        <span style={{ flex: 1 }}>{rc.hypotheses.some((h) => h.status === "confirmed") ? "Copy this for the improver: it turns it into one small request you approve." : "No known cause fits: read the step's transcript."}</span>
        <button data-testid="copy-finding" onClick={copy} style={{ height: 24, padding: "0 10px", borderRadius: 5, border: `1px solid ${C.border}`, background: "none", color: C.fg, cursor: "pointer", font: "inherit", fontSize: 12 }}>{copied ? "Copied" : "Copy for the improver"}</button>
      </div>
    </div>
  );
}
