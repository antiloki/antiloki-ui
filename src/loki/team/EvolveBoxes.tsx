// THE EVOLUTION RESULTS, ON THE GRAPH (the operator 2026-11-22: "the evolution grid and table should appear after an evolution session, floating as glassy boxes on the right bottom on the graph"): when a session has ended, two small glass boxes float over the graph's bottom right: the gain meters (the grid) and the trials (the table).
// They replace the old Improve and Requests pages of the Edit tab. Closing them remembers the session, so they do not come back for the same one; a new session brings them again.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import type { EvolveState } from "./api";
import { EVOLVE_COLOR, GainMeters, PanelStyle } from "./panel-kit";
import { STATUS_WORD } from "./EvolveButton";

const key = (team: string) => `antiloki.evolve.boxes.${team}`;
const read = (team: string) => { try { return Number(localStorage.getItem(key(team))) || 0; } catch { return 0; } };
const write = (team: string, v: number) => { try { localStorage.setItem(key(team), String(v)); } catch { /* private window */ } };
/** Show the boxes? A session that has ended and tried at least one idea, not closed yet (or asked for by the person). Pure. */
export function boxesShown(st: EvolveState | null, dismissed: number, forced: boolean): boolean {
  if (!st || st.running || st.session.status === "running" || st.session.trials.length === 0) return false; return forced || dismissed !== st.session.started_ms;
}
export const OUTCOME_WORD: Record<string, string> = { admitted: "applied", not_admitted: "below line", screened_out: "pass fell", passed_not_applied: "also passed", error: "error", no_proposal: "no idea", proposed: "proposed", running: "running", waiting: "waiting" };
const outColor = (o: string) => (o === "admitted" ? "var(--c-ok)" : o === "error" || o === "screened_out" ? "var(--c-bad)" : C.muted);
export function EvolveBoxes({ team, st, forced, onClose }: { team: string; st: EvolveState | null; forced?: boolean; onClose?: () => void }) {
  const [dismissed, setDismissed] = React.useState(() => read(team)); React.useEffect(() => setDismissed(read(team)), [team]);
  if (!st || !boxesShown(st, dismissed, !!forced)) return null; const s = st.session;
  const close = () => { write(team, s.started_ms); setDismissed(s.started_ms); onClose?.(); };
  const box: React.CSSProperties = { pointerEvents: "auto", padding: 10, borderRadius: 14, color: C.fg, fontFamily: nav };
  return (
    <div data-testid="evolve-boxes" style={{ position: "absolute", right: 412, bottom: 14, zIndex: 14, width: 264, maxWidth: "calc(100% - 440px)", maxHeight: "72%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
      <PanelStyle />
      <div role="dialog" aria-label="Evolution: gain against today's version" data-testid="evolve-box-grid" style={box}><div className="ek" style={{ ["--ek-accent" as any]: EVOLVE_COLOR }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}><span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, background: EVOLVE_COLOR }} /><b style={{ fontSize: 12 }}>Evolution</b><span style={{ color: C.muted, fontFamily: mono, fontSize: 10 }}>{STATUS_WORD[s.status] ?? s.status}</span><span style={{ flex: 1 }} /><button data-testid="evolve-boxes-close" aria-label="close the results" onClick={close} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 12 }}>✕</button></div>
        <GainMeters trials={s.trials} minGain={s.min_gain_pct} /></div></div>
      <div role="dialog" aria-label="Evolution: the trials" data-testid="evolve-box-table" style={box}><div className="ek" style={{ ["--ek-accent" as any]: EVOLVE_COLOR }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}><b style={{ fontSize: 12 }}>Trials</b><span style={{ color: C.muted, fontFamily: mono, fontSize: 10 }}>${s.spent_usd.toFixed(2)} of ${s.budget_usd.toFixed(2)}</span></div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><tbody>{s.trials.map((t) => <tr key={t.n} data-testid={`evolve-trial-${t.n}`} style={{ borderTop: `1px solid ${C.border}` }}>
          <td style={{ padding: "4px 5px 4px 0", maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.why || t.hypothesis}>{t.hypothesis || `idea ${t.n}`}</td>
          <td style={{ padding: "4px 4px", color: outColor(t.outcome), whiteSpace: "nowrap" }}>{OUTCOME_WORD[t.outcome] ?? t.outcome}</td>
          <td style={{ padding: "4px 0 4px 4px", textAlign: "right", fontFamily: mono, color: C.dim, whiteSpace: "nowrap" }}>{t.gain_pct > 0 ? "+" : ""}{Math.round(t.gain_pct)}%</td></tr>)}</tbody></table>
        {s.note && <div className="ek-note">{s.note}</div>}
      </div></div>
    </div>
  );
}
