// THE RUN PANEL OF A SAGA (operator 2026-11-10: "a saga created by hand can choose model, total to spend, steps, description, and has a Run button"): which seat and model do the work, the most it may cost, and Run
// (Stop while it goes). The run is made from the saga's open episodes; the saga takes its states, cost and seat as it goes. Nothing runs until the person presses Run.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { listEngines, type Engine } from "@/loki/cowork/api";
import { runState, type Saga, type Episode } from "./model";

const field: React.CSSProperties = { background: C.panel, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 8px", fontFamily: nav, fontSize: 12.5, minWidth: 0, width: "100%", boxSizing: "border-box" };
const lab: React.CSSProperties = { fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 };

export function RunPanel({ saga, episodes, onSet, onRun, onStop, busy }: { saga: Saga; episodes: readonly Episode[]; onSet: (patch: Record<string, unknown>) => void; onRun: () => void; onStop: () => void; busy: boolean }) {
  const [engines, setEngines] = React.useState<Engine[] | null>(null);
  React.useEffect(() => { let stop = false; void listEngines().then((e) => { if (!stop) setEngines(e); }); return () => { stop = true; }; }, []);
  const st = runState(saga, episodes); const cfg = saga.run ?? {};
  const [model, setModel] = React.useState(cfg.model ?? ""); const [budget, setBudget] = React.useState(cfg.budget_usd ? String(cfg.budget_usd) : "");
  React.useEffect(() => { setModel(cfg.model ?? ""); setBudget(cfg.budget_usd ? String(cfg.budget_usd) : ""); }, [cfg.model, cfg.budget_usd]);
  const locked = st.running;
  return (
    <div data-testid="run-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div><div style={lab}>Seat</div>
        <select data-testid="run-engine" aria-label="which seat does the work" disabled={locked} value={cfg.engine ?? ""} onChange={(e) => onSet({ engine: e.target.value, model: "" })} style={field}>
          <option value="">the default seat</option>
          {(engines ?? []).filter((e) => e.installed).map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
        </select></div>
      <div><div style={lab}>Model</div>
        <input data-testid="run-model" aria-label="which model" disabled={locked || !cfg.engine} placeholder={cfg.engine ? "the seat's default model" : "choose a seat first"} value={model} onChange={(e) => setModel(e.target.value)} onBlur={() => { if (model.trim() !== (cfg.model ?? "")) onSet({ model: model.trim() }); }} style={field} /></div>
      <div><div style={lab}>Most it may spend (USD)</div>
        <input data-testid="run-budget" aria-label="the most it may spend, in dollars" inputMode="decimal" disabled={locked} placeholder="no limit" value={budget} onChange={(e) => setBudget(e.target.value)} onBlur={() => { const next = budget.trim() === "" ? 0 : Number(budget.replace(",", ".")); if (Number.isFinite(next) && next >= 0 && next !== (cfg.budget_usd ?? 0)) onSet({ budget_usd: next }); }} style={field} />
        <div style={{ fontSize: 11, color: C.muted, marginTop: 3, lineHeight: 1.4 }}>The run stops by itself when it has cost this much.</div></div>
      {st.running
        ? <button data-testid="run-stop" disabled={busy} onClick={onStop} style={{ background: "transparent", color: C.bad, border: `1px solid ${C.bad}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontFamily: nav, fontSize: 13 }}>Stop the run</button>
        : <button data-testid="run-start" disabled={!st.can || busy} title={st.why || `run ${st.open} episode${st.open === 1 ? "" : "s"}`} onClick={onRun} style={{ background: st.can ? C.brand : "transparent", color: st.can ? "#fff" : C.muted, border: `1px solid ${st.can ? C.brand : C.border}`, borderRadius: 8, padding: "7px 12px", cursor: st.can && !busy ? "pointer" : "default", fontFamily: nav, fontSize: 13, fontWeight: 600 }}>{busy ? "starting…" : `Run ${st.open} episode${st.open === 1 ? "" : "s"}`}</button>}
      {!st.can && !st.running && st.why && <div data-testid="run-why" style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>{st.why}</div>}
      {st.running && <div data-testid="run-going" style={{ fontSize: 12, color: C.ok, fontFamily: mono }}>running…</div>}
    </div>
  );
}
