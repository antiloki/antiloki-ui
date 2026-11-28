// THE EVOLVE BUTTON (the operator 2026-11-22): on the team's top bar, beside the autofix. A DNA icon with a coloured border; while a session runs the border and the whole team pane are lit in the colour of a controlled browser. The panel behind it
// is two pages (approved mockups "The panels behind the icons" and "Evolve and Swarm as one living story"): SETUP (what should get better, how much, how many ideas, the budget, the tests) and RESULTS (the budget ring, the stage, a gain meter per idea that draws its noise, the team's versions).
import * as React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import { benchmarkOf, evolveSet, evolveStart, evolveStatus, evolveStop, type EvolveCfg, type EvolveState } from "./api";
import { afford, BankTiles, BudgetField, BudgetRing, EVOLVE_COLOR, GainMeters, GoalCards, GoButton, Lineage, MeanBars, PanelStyle, perIdeaCents, Slider, Squares, StageTrack, stageOf, type Goal } from "./panel-kit";

export { EVOLVE_COLOR };
export const STATUS_WORD: Record<string, string> = { idle: "no session yet", running: "running", goal_met: "goal met", exhausted: "all trials used, goal not reached", budget: "budget ran out", stopped: "stopped", needs_tasks: "needs tests", error: "error" };
/** The live state of a team's evolution: polled while the screen is open (faster while a session runs). */
export function useEvolve(team: string | null) {
  const [st, setSt] = React.useState<EvolveState | null>(null);
  const load = React.useCallback(async () => { if (!team) return null; try { const r = await evolveStatus(team); if (r.ok && (r as any).session) setSt(r as unknown as EvolveState); return r; } catch { return null; } }, [team]);   // an older serve has no such op: the button just does not show
  React.useEffect(() => { if (!team) return; let stop = false; let t = 0; const tick = async () => { await load(); if (!stop) t = window.setTimeout(tick, st?.running ? 3000 : 12000); }; void tick(); return () => { stop = true; window.clearTimeout(t); }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [team, load, st?.running]);
  return { st, reload: load };
}
const DNA = <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3c0 6 8 6 8 9s-8 3-8 9" /><path d="M16 3c0 6-8 6-8 9s8 3 8 9" /><path d="M9.6 6.5h4.8M9.6 17.5h4.8" /></svg>;
export function EvolveButton({ team }: { team: string }) {
  const { st, reload } = useEvolve(team); const [open, setOpen] = React.useState(false); const [msg, setMsg] = React.useState(""); const [busy, setBusy] = React.useState(false);
  const [tab, setTab] = React.useState<"setup" | "results" | null>(null); const [d, setD] = React.useState<{ goal?: Goal; gain?: number; trials?: number; cents?: number }>({});
  const btn = React.useRef<HTMLButtonElement>(null); const [at, setAt] = React.useState<{ right: number; top: number }>({ right: 12, top: 40 });
  const [vers, setVers] = React.useState<{ id: string; label: string }[]>([]);
  React.useEffect(() => { if (open && btn.current) { const r = btn.current.getBoundingClientRect(); setAt({ right: Math.max(8, window.innerWidth - r.right), top: r.bottom + 8 }); } }, [open]);
  React.useEffect(() => { if (!open) return; let live = true; void benchmarkOf(team).then((b) => { if (live && b) setVers(b.versions.slice(-4).map((v) => ({ id: v.id, label: `v${v.n}` }))); }).catch(() => {}); return () => { live = false; }; }, [open, team, st?.session.status]);
  if (!st) return null; const c = st.config; const s = st.session; const run = st.running || s.status === "running"; const page = tab ?? (run ? "results" : "setup");
  const goal = d.goal ?? c.goal; const gain = d.gain ?? c.min_gain_pct; const trials = d.trials ?? c.max_trials; const cents = d.cents ?? Math.round(c.budget_usd * 100); const est = perIdeaCents(s.trials); const bankOk = st.tune > 0 && st.heldout > 0; const dirty = Object.keys(d).length > 0;
  const save = async () => { const r = await evolveSet(team, { goal, min_gain_pct: gain, max_trials: trials, budget_usd: cents / 100 }); if (!r.ok) { setMsg(String((r as any).error ?? "not saved")); return false; } setD({}); await reload(); return true; };
  const start = async () => { setBusy(true); setMsg(""); if (dirty && !(await save())) { setBusy(false); return; } const r = await evolveStart(team); setBusy(false); if (!r.ok) { setMsg(String((r as any).error ?? "did not start")); return; } setTab("results"); await reload(); };
  const last = [...s.trials].reverse().find((t) => t.why && ["admitted", "not_admitted", "screened_out"].includes(t.outcome)); const won = s.status === "goal_met";
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button ref={btn} data-testid="evolve-button" data-running={run ? "1" : "0"} aria-haspopup="dialog" aria-expanded={open} aria-label={run ? "self-evolution is running" : "self-evolution"} title={run ? "The team is evolving: an experiment is running" : "Self-evolution: make the team better by an experiment"} onClick={() => setOpen((o) => !o)} onMouseDown={(e) => e.stopPropagation()}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${run ? EVOLVE_COLOR : "color-mix(in srgb, " + EVOLVE_COLOR + " 45%, transparent)"}`, color: run ? EVOLVE_COLOR : C.muted, borderRadius: 7, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 11, animation: run ? "evolve-pulse 1.8s ease-in-out infinite" : "none" }}>{DNA}{run && <span>{s.trials.length}/{s.max_trials}</span>}</button>
      <style>{`@keyframes evolve-pulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb, ${EVOLVE_COLOR} 55%, transparent)}50%{box-shadow:0 0 10px 1px color-mix(in srgb, ${EVOLVE_COLOR} 55%, transparent)}}@media (prefers-reduced-motion: reduce){[data-testid=evolve-button]{animation:none!important}}`}</style>
      {open && createPortal(
        <div role="dialog" aria-label="self-evolution" data-testid="evolve-panel" onMouseDown={(e) => e.stopPropagation()} style={{ position: "fixed", right: at.right, top: at.top, zIndex: 2147482000, width: 264, maxHeight: "70vh", overflowY: "auto", padding: 10, ["--ek-accent" as any]: EVOLVE_COLOR }}>
          <PanelStyle />
          <div className="ek" style={{ ["--ek-accent" as any]: EVOLVE_COLOR }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ color: EVOLVE_COLOR, display: "inline-flex", width: 22, height: 22, borderRadius: 7, boxShadow: `inset 0 0 0 1.5px ${EVOLVE_COLOR}`, alignItems: "center", justifyContent: "center" }}>{DNA}</span><b style={{ fontSize: 12.5 }}>Evolve</b><span style={{ flex: 1 }} />
              <span className={`ek-chip${run ? " run" : won ? " ok" : ""}`} data-testid="evolve-status">{run ? "running" : s.status === "idle" ? "no session yet" : STATUS_WORD[s.status] ?? s.status}</span></div>
            <div className="ek-tabs" role="group" aria-label="page"><button data-testid="evolve-tab-setup" aria-pressed={page === "setup"} onClick={() => setTab("setup")}>Setup</button><button data-testid="evolve-tab-results" aria-pressed={page === "results"} onClick={() => setTab("results")}>Results</button></div>
            {page === "setup" ? <>
              <div><div className="ek-cap">What should get better?</div><GoalCards value={goal} disabled={run} onChange={(g) => setD({ ...d, goal: g })} /></div>
              <div><div className="ek-row"><div className="ek-cap">At least how much better?</div><div className="ek-big"><span data-testid="evolve-gain-value">{gain}</span><small>%</small></div></div><Slider testid="evolve-gain" label="least gain in percent" min={5} max={60} step={5} value={gain} disabled={run} onChange={(n) => setD({ ...d, gain: n })} /><MeanBars goal={goal} gain={gain} /></div>
              <div><div className="ek-row"><div className="ek-cap">How many ideas to try</div><div className="ek-big" data-testid="evolve-trials-value">{trials}</div></div><div style={{ marginTop: 8 }}><Squares testid="evolve-trials" label="ideas to try" value={trials} max={20} disabled={run} onChange={(n) => setD({ ...d, trials: n })} /></div></div>
              <BudgetField cents={cents} trials={trials} per={est.cents} fromSession={est.fromSession} disabled={run} onChange={(n) => setD({ ...d, cents: n })} />
              <div><div className="ek-cap">The tests it will use</div><BankTiles tune={st.tune} held={st.heldout} />{!bankOk && <div className="ek-warn" data-testid="evolve-bank-warn" style={{ marginTop: 8 }}><span>⚠</span><span>It needs at least 1 practice and 1 held-out test: save a few passed runs as tests first.</span></div>}</div>
              <div className="ek-sticky">{run ? <GoButton testid="evolve-stop" stop onClick={() => void evolveStop(team).then(reload)}>Stop</GoButton> : <GoButton testid="evolve-start" disabled={busy || !bankOk || !afford(cents, est.cents, trials).can} onClick={() => void start()}>{busy ? "Starting…" : `Start evolving: ${goal === "cost" ? "cheaper" : goal === "time" ? "faster" : "better"} by ${gain}%`}</GoButton>}
              <div className="ek-foot">Stops any time. A full report goes to the Leader.</div></div>
            </> : <>
              <div className="ek-top"><BudgetRing spent={s.spent_usd} budget={s.budget_usd || c.budget_usd} /><StageTrack stage={stageOf(s.status, s.trials)} /></div>
              {s.trials.length > 0 ? <div><div className="ek-cap">Gain vs today</div><GainMeters trials={s.trials} minGain={s.min_gain_pct || gain} /><div className="ek-why" data-testid="evolve-why">{last?.why ?? "Waiting for the first result."}</div></div> : <div className="ek-note">No ideas yet. Start a session on the Setup page.</div>}
              {vers.length > 0 && <div><div className="ek-cap">The team's versions</div><Lineage versions={vers} won={won} /></div>}
              {run && <GoButton testid="evolve-stop" stop onClick={() => void evolveStop(team).then(reload)}>Stop</GoButton>}
              {!run && s.report && <details><summary style={{ cursor: "pointer", color: C.muted, fontSize: 11.5 }}>Full report (also sent to the Leader)</summary><pre data-testid="evolve-report" style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", fontFamily: mono, fontSize: 11, color: C.dim }}>{s.report}</pre></details>}
            </>}
            {msg && <div data-testid="evolve-msg" style={{ color: "var(--c-bad)", fontSize: 12 }}>{msg}</div>}
          </div>
        </div>, document.body)}
    </span>
  );
}
export default EvolveButton;
