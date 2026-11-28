// THE SWARM BUTTON (the operator 2026-11-22, RFC 0019): a bee, icon only, beside the evolve button. The panel behind it has two pages (approved mockups): SETUP (how many run at once as sockets, how many ideas per round, what this machine can hold) and RESULTS
// (the sockets with what runs in each, the ideas waiting for one, the machine's pause notice, and the bracket: a row per idea, a square per run). While a swarm runs the team pane is lit in yellow.
import * as React from "react";
import { createPortal } from "react-dom";
import { C, mono } from "@/loki/theme";
import { swarmSet, swarmStart, swarmStatus, swarmStop, type SwarmState, type EvolveTrial } from "./api";
import { Bracket, GoButton, MachineBar, PanelStyle, PauseIcon, recommended, Slots, Sockets, Squares, SWARM_COLOR, StageTrack, BudgetRing, stageOf } from "./panel-kit";

export { SWARM_COLOR };
/** The squares of one idea's row, kept for the tests and the button's tooltip: its candidate's runs (passed first, then failed), one pulsing square while it runs, one hollow while it waits. Pure. */
export function cellsOf(t: Pick<EvolveTrial, "outcome"> & { experiment?: any }): ("pass" | "fail" | "run" | "wait")[] {
  if (t.outcome === "waiting") return ["wait"]; if (t.outcome === "running") return ["run"];
  const a = t.experiment?.candidate; const n = Math.max(0, Math.min(60, Number(a?.n) || 0)); const p = Math.max(0, Math.min(n, Number(a?.passed) || 0));
  if (n === 0) return t.outcome === "error" || t.outcome === "no_proposal" ? ["fail"] : [];
  return [...Array(p).fill("pass"), ...Array(n - p).fill("fail")];
}
export function useSwarm(team: string | null) {
  const [st, setSt] = React.useState<SwarmState | null>(null);
  const load = React.useCallback(async () => { if (!team) return null; try { const r = await swarmStatus(team); if (r.ok && (r as any).session) setSt(r as unknown as SwarmState); return r; } catch { return null; } }, [team]);
  React.useEffect(() => { if (!team) return; let stop = false; let t = 0; const tick = async () => { await load(); if (!stop) t = window.setTimeout(tick, st?.running ? 2500 : 15000); }; void tick(); return () => { stop = true; window.clearTimeout(t); }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [team, load, st?.running]);
  return { st, reload: load };
}
const BEE = <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="14" rx="5" ry="6" /><path d="M9 9C6 4 3 6 5 9M15 9c3-5 6-3 4 0M10 12h4M10 15h4" /></svg>;
export function SwarmButton({ team }: { team: string }) {
  const { st, reload } = useSwarm(team); const [open, setOpen] = React.useState(false); const [msg, setMsg] = React.useState(""); const [tab, setTab] = React.useState<"setup" | "results" | null>(null);
  const [d, setD] = React.useState<{ width?: number; concurrency?: number }>({}); const btn = React.useRef<HTMLButtonElement>(null); const [at, setAt] = React.useState({ right: 12, top: 40 });
  React.useEffect(() => { if (open && btn.current) { const r = btn.current.getBoundingClientRect(); setAt({ right: Math.max(8, window.innerWidth - r.right), top: r.bottom + 8 }); } }, [open]);
  if (!st) return null; const run = st.running || st.session.status === "running"; const s = st.session; const w = d.width ?? st.swarm.width; const k = d.concurrency ?? st.swarm.concurrency; const page = tab ?? (run ? "results" : "setup");
  const mv = st.machine?.view ?? null; const rec = recommended(mv); const bankOk = st.tune > 0 && st.heldout > 0; const dirty = Object.keys(d).length > 0;
  const runningT = s.trials.filter((t) => t.outcome === "running"); const queued = s.trials.filter((t) => t.outcome === "waiting"); const paused = st.machine?.paused ?? 0;
  const start = async () => { setMsg(""); if (dirty) { const r = await swarmSet(team, { width: w, concurrency: k }); if (!r.ok) { setMsg(String((r as any).error ?? "not saved")); return; } setD({}); } const r = await swarmStart(team); if (!r.ok) { setMsg(String((r as any).error ?? "did not start")); return; } setTab("results"); await reload(); };
  const note = (() => { if (!mv) return null; if (mv.free_gb < mv.pause_under_gb) return { ok: false, icon: "||", text: `Only ${mv.free_gb} GB free: runs pause, new ones wait.` }; if (k <= rec) return { ok: true, icon: "✓", text: `${k} at once fits. Runs pause when it gets busy.` }; return { ok: false, icon: "⚠", text: `${k} will often hit the memory limit. ${rec} is faster.` }; })();
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button ref={btn} data-testid="swarm-button" data-running={run ? "1" : "0"} aria-haspopup="dialog" aria-expanded={open} aria-label={run ? "a swarm is running" : "swarm"} title={run ? `Swarm: ${runningT.length} run(s) going, ${s.trials.length}/${s.max_trials} ideas` : "Swarm: test several ideas at the same time"} onClick={() => setOpen((o) => !o)} onMouseDown={(e) => e.stopPropagation()}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${run ? SWARM_COLOR : "color-mix(in srgb, " + SWARM_COLOR + " 45%, transparent)"}`, color: run ? SWARM_COLOR : C.muted, borderRadius: 7, padding: "1px 7px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>{BEE}{run && <span>{s.trials.length}/{s.max_trials}</span>}</button>
      {open && createPortal(
        <div role="dialog" aria-label="swarm" data-testid="swarm-panel" onMouseDown={(e) => e.stopPropagation()} style={{ position: "fixed", right: at.right, top: at.top, zIndex: 2147482000, width: 264, maxHeight: "70vh", overflowY: "auto", padding: 10 }}>
          <PanelStyle />
          <div className="ek" style={{ ["--ek-accent" as any]: SWARM_COLOR }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ color: SWARM_COLOR, display: "inline-flex", width: 22, height: 22, borderRadius: 7, boxShadow: `inset 0 0 0 1.5px ${SWARM_COLOR}`, alignItems: "center", justifyContent: "center" }}>{BEE}</span><b style={{ fontSize: 12.5 }}>Swarm</b><span style={{ flex: 1 }} />
              <span className={`ek-chip${run ? " run" : ""}`} data-testid="swarm-status">{run ? "racing" : s.status === "idle" ? "uses the Evolve goal" : s.status.replace(/_/g, " ")}</span></div>
            <div className="ek-tabs" role="group" aria-label="page"><button data-testid="swarm-tab-setup" aria-pressed={page === "setup"} onClick={() => setTab("setup")}>Setup</button><button data-testid="swarm-tab-results" aria-pressed={page === "results"} onClick={() => setTab("results")}>Results</button></div>
            {page === "setup" ? <>
              <div><div className="ek-row"><div className="ek-cap">Running at once</div><div className="ek-big" data-testid="swarm-concurrency-value">{k}</div></div><Sockets value={k} rec={rec} disabled={run} onChange={(n) => setD({ ...d, concurrency: n })} /></div>
              <div><div className="ek-row"><div className="ek-cap">Ideas per round</div><div className="ek-big" data-testid="swarm-width-value">{w}</div></div><div style={{ marginTop: 8 }}><Squares testid="swarm-width" label="ideas per round" value={w} max={8} disabled={run} onChange={(n) => setD({ ...d, width: n })} /></div></div>
              <div><div className="ek-cap">Your machine</div><MachineBar m={mv} />{note && <div className={`ek-warn${note.ok ? " ok" : ""}`} data-testid="swarm-note" style={{ marginTop: 8 }}><span>{note.icon}</span><span>{note.text}</span></div>}</div>
              {!bankOk && <div className="ek-warn" data-testid="swarm-bank"><span>⚠</span><span>It needs at least 1 practice and 1 held-out test ({st.tune} and {st.heldout} now): save passed runs as tests first.</span></div>}
              <div className="ek-sticky">{run ? <GoButton testid="swarm-stop" stop onClick={() => void swarmStop(team).then(reload)}>Stop</GoButton> : <GoButton testid="swarm-start" bee disabled={!bankOk} onClick={() => void start()}>{`Start a swarm · up to ${k} at once`}</GoButton>}
              <div className="ek-foot">Same goal, budget and trials as Evolve. The best idea that passes is applied.</div></div>
            </> : <>
              <div className="ek-top"><BudgetRing spent={s.spent_usd} budget={s.budget_usd || st.config.budget_usd} /><StageTrack stage={stageOf(s.status, s.trials)} /></div>
              <div><div className="ek-cap">Running at once <i>cap {k}</i></div><Slots cap={k} running={runningT} queued={queued} paused={paused} /></div>
              {paused > 0 && <div className="ek-msg" data-testid="swarm-paused"><PauseIcon /><span>{paused} paused: {st.machine?.why || "your computer is busy"}. They continue by themselves.</span></div>}
              {s.trials.length > 0 ? <div><div className="ek-cap">The race <i>every square is one run</i></div><Bracket trials={s.trials} /></div> : <div className="ek-note">No swarm yet. Start one on the Setup page.</div>}
              {s.trials.some((t) => t.why) && <div className="ek-why" data-testid="swarm-why">{[...s.trials].reverse().find((t) => t.why)?.why}</div>}
              {run && <GoButton testid="swarm-stop" stop onClick={() => void swarmStop(team).then(reload)}>Stop</GoButton>}
            </>}
            {msg && <div data-testid="swarm-msg" style={{ color: "var(--c-bad)", fontSize: 12 }}>{msg}</div>}
          </div>
        </div>, document.body)}
    </span>
  );
}
export default SwarmButton;
