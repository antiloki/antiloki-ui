// THE TEAM PANE (RFC 0008 §4.15; simplified 2026-11-22 by the operator): the Graph and the Leader, switched on the pane's top bar. The Edit, Activity, Sagas, Result and X-ray tabs and the floating right-hand menu are gone: editing happens on the graph, the team's sagas are the saga icon of the top bar, time and cost
// are a small reading on the bottom bar that opens in the middle of the screen, forks are a button of the top bar, and the results of an evolution session float over the graph's bottom right. The node drawer is an overlay on the graph.
import { AwayDigest } from "./AwayDigest";
import { Icon } from "./icons";
import { createPortal } from "react-dom";
import { ViewBarSlot } from "./viewbar-slot";
import { HeaderSlot } from "@/loki/cowork/header-slot";
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { appsPreflight, getTeamReading, listTeams, runStatus, runTeam, type AppsPreflight } from "./api";
import { RunPicker } from "./RunPicker";
import type { RunRow } from "./types";
import { AppConnections } from "./AppConnections";
import { TeamEdit } from "./TeamEdit";
import { TeamRun } from "./TeamRun";
import { TeamThreads } from "./TeamThreads";
import { useSwitchAnim } from "@/loki/cowork/switch-anim";
import { Inbox } from "./Inbox";
import { ConflictRadar } from "./ConflictRadar";
import { Checkpoints } from "./Checkpoints";
import { RootCause } from "./RootCause";
import { RunReasoning } from "./RunReasoning";
import { NoticeHost, NoticeCard } from "./NoticeHost";
import { useEvolve } from "./EvolveButton";
import { useSwarm } from "./SwarmButton";
import { RunFacts } from "./RunFacts";
import { ExperimentCard } from "./ExperimentCard";
import type { Graph, Report, Run } from "./types";
import { TimeCostMini } from "./TimeCost";
import { EvolveBoxes } from "./EvolveBoxes";
import { ForkButton } from "./TeamTopControls";

export type Tab = "run" | "leader";
/** A stored tab from before keeps working: the Leader stays the Leader, every other old tab is the graph now. Pure. */
export function tabOf(stored: string | null): { tab: Tab } { return { tab: stored === "leader" ? "leader" : "run" }; }
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }; const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
export const slugOf = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The run a team's pane shows: the one that is going, else the latest. Pure over the list. */
export function pickRun(rows: { id: string; team: string; started_ms: number }[], live: string[], team: string): string | null {
  const mine = rows.filter((r) => slugOf(r.team) === slugOf(team)).sort((a, b) => b.started_ms - a.started_ms); return mine.find((r) => live.includes(r.id))?.id ?? mine[0]?.id ?? null;
}
/** Is this the run the pane already shows? The clock of a running run moves every poll and is not a change. Pure. */
export function sameRun(a: Run | null, b: Run | null): boolean { if (!a || !b) return a === b; const strip = (r: Run) => JSON.stringify(r, (k, v) => (k === "now_ms" ? undefined : v)); return strip(a) === strip(b); }
/** The pane of a team with its threads above it: a thread shows as the team it runs as (its own graph, runs and costs). */
export type LeaderDot = "blocked" | "working" | "idle";
export function TeamPane({ team, leader, leaderDot, leaders, leaderDots, onForkLeader }: { team: string; leader?: React.ReactNode; leaderDot?: LeaderDot; /** the Leader terminals of the forks, by the fork's team */ leaders?: Record<string, React.ReactNode>; leaderDots?: Record<string, LeaderDot>; /** a fork was shown: make its Leader if it has none (the team of the fork, the engine it was forked onto) */ onForkLeader?: (forkTeam: string, engine: string) => void }) {
  const [shown, setShown] = React.useState(team); React.useEffect(() => setShown(team), [team]);
  const [menuOpen, setMenuOpen] = React.useState(false); const [forkNote, setForkNote] = React.useState<string | null>(null);   // held here: the pane under them is rebuilt when another thread is shown
  const switchRef = useSwitchAnim<HTMLDivElement>(shown);   // a fast fade when another team, fork or thread is shown
  return <div style={{ height: "100%", display: "flex", flexDirection: "column" }}><div ref={switchRef} style={{ flex: 1, minHeight: 0 }}><TeamPaneOne key={shown} team={shown} leader={shown === team ? leader : leaders?.[shown]} leaderDot={shown === team ? leaderDot : leaderDots?.[shown]} threads={<TeamThreads column team={team} shown={shown} onOpen={setShown} onLeader={onForkLeader} note={forkNote} onForked={(n, e, left) => { setMenuOpen(true); setForkNote(`Forked "${n}" on ${e}: every agent step runs there now${left ? `; ${left} typed model call${left === 1 ? "" : "s"} stayed as they were` : ""}. It is open below; pick main to go back.`); }} />} menuOpen={menuOpen} onMenuOpen={(o) => { setMenuOpen(o); if (!o) setForkNote(null); }} /></div></div>;
}
/** What a team's pane showed last, kept for the life of the page: opening a team paints this at once and the fresh answer replaces it (stale while revalidate). */
const SEEN = new Map<string, { graph: Graph; report: Report | null; run: Run | null }>();
function TeamPaneOne({ team, leader, leaderDot, threads, menuOpen, onMenuOpen }: { team: string; leader?: React.ReactNode; leaderDot?: LeaderDot; threads?: React.ReactNode; menuOpen?: boolean; onMenuOpen?: (open: boolean) => void }) {
  const tabKey = `antiloki.team.tab.${team}`; const first = React.useMemo(() => tabOf(lsGet(tabKey)), [tabKey]); const [tab0, setTab] = React.useState<Tab>(lsGet(tabKey) === null && leader ? "leader" : first.tab); const tab: Tab = tab0 === "leader" && !leader ? "run" : tab0;   /* THE LEADER IS A TAB OF THE TEAM (the operator 2026-11-18): the team has the whole width; a team made just now opens on it */ const [editing, setEditing] = React.useState(false); const [showBoxes, setShowBoxes] = React.useState(false);   /* EDITING IS ON THE GRAPH (the operator 2026-11-22): a toggle of the graph, not a tab */
  const [graph, setGraph] = React.useState<Graph | null>(() => SEEN.get(team)?.graph ?? null); const [report, setReport] = React.useState<Report | null>(() => SEEN.get(team)?.report ?? null); const [run, setRun] = React.useState<Run | null>(() => SEEN.get(team)?.run ?? null); const graphSeen = React.useRef<Graph | null>(null); const [err, setErr] = React.useState<string | null>(null); const [flash, setFlash] = React.useState<{ nodes: number; at: number } | null>(null);   /* the team changed under you (the Leader edited it): say so for a moment, with the node count (the operator 2026-11-18: a loader for team creation and update) */
  React.useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 5000); return () => clearTimeout(t); }, [flash]);
   const [tick, setTick] = React.useState(0);
  const go = (t: Tab) => { setTab(t); lsSet(tabKey, t); };
  const reload = React.useCallback(() => setTick((x) => x + 1), []); const misses = React.useRef(0); const loaded = React.useRef(false);
  React.useEffect(() => { let stop = false; const load = async () => {
    if (typeof document !== "undefined" && document.hidden) return;   // a tab nobody looks at is not polled
    const teamsAsked = listTeams(); /* asked together with the graph: they do not depend on each other */ const rd = await getTeamReading(team); if (stop) return; const g = rd.found; if (!g) { misses.current += 1; if (rd.missing && (!loaded.current || misses.current >= 4)) setErr(`there is no team called ${team}`); return; /* a busy serve says nothing about the team: keep what is shown, ask again */ } misses.current = 0; loaded.current = true; setErr(null); { const prev = graphSeen.current; const same = !!prev && JSON.stringify(prev) === JSON.stringify(g.graph); if (prev && !same) setFlash({ nodes: Object.keys(g.graph.nodes).length, at: Date.now() }); graphSeen.current = g.graph; if (!same) setGraph(g.graph); } setReport(g.report); SEEN.set(team, { graph: g.graph, report: g.report, run: SEEN.get(team)?.run ?? null });
    const l = await teamsAsked; if (l.failed) return; /* a busy serve gave no answer: keep what is shown */ if (!stop) setRunRows(l.runs.filter((x) => slugOf(x.team) === slugOf(team)).sort((a, b) => b.started_ms - a.started_ms)); const pin = pinnedRef.current && l.runs.some((x) => x.id === pinnedRef.current) ? pinnedRef.current : null; const id = pin ?? pickRun(l.runs, l.live, team); if (!id) { if (!stop) setRun(null); const c0 = SEEN.get(team); if (c0) SEEN.set(team, { ...c0, run: null }); return; } const r = await runStatus(id); if (!stop && r) { setRun((old) => (sameRun(old, r) ? old : r)); const c1 = SEEN.get(team); if (c1) SEEN.set(team, { ...c1, run: r }); }
  }; void load(); const t = setInterval(load, run?.live ? 2500 : 6000); return () => { stop = true; clearInterval(t); }; }, [team, tick, run?.live]);
  // THE RUNS OF THIS TEAM, AND WHICH ONE THE GRAPH SHOWS (the operator 2026-11-20: "a drop down at the top with the runs, so we can see each run's state on the graph; when running, go to the running state unless I click another run"): auto follows the live run (else the latest); a run picked by hand stays until "Latest" is chosen
  const [runRows, setRunRows] = React.useState<RunRow[]>([]); const [pinned, setPinned] = React.useState<string | null>(null); const pinnedRef = React.useRef<string | null>(null); pinnedRef.current = pinned;
  const pickRunBy = (id: string | null) => { setPinned(id); pinnedRef.current = id; reload(); };
  const [apps, setApps] = React.useState<AppsPreflight | null>(null);
  React.useEffect(() => { let stop = false; void appsPreflight(team).then((p) => { if (!stop) setApps(p); }); return () => { stop = true; }; }, [team, tick]);
  const onRun = async (ask: string, budget?: number): Promise<string | null> => { const p = await appsPreflight(team); if (p) setApps(p); if (p && p.used > 0 && !p.ready) return `the team's web apps are not ready: ${p.human[0] ?? "connect them first"}`; const r = await runTeam(team, ask, budget); if (!r.ok) return r.error ?? "the team did not start"; pickRunBy(null); reload(); return null; };
  /* clicking the Leader tab puts the cursor in it at once (the operator 2026-11-18): the terminal's own input, or the chat box when the engine is a chat */
  /* THE LEADER MAY FLOAT (the operator 2026-11-18, optional): a glass window over the panes, wherever the person is, kept mounted like the tab; the choice is kept */
  const FLOAT_KEY = "antiloki.team.leader.float"; const [floatLeader, setFloatLeaderRaw] = React.useState<boolean>(() => lsGet(FLOAT_KEY) === "1"); const setFloatLeader = (v: boolean) => { setFloatLeaderRaw(v); lsSet(FLOAT_KEY, v ? "1" : "0"); };
  const SIDE_KEY = "antiloki.team.leader.side"; const [sideLeader, setSideLeaderRaw] = React.useState<boolean>(() => lsGet(SIDE_KEY) === "1"); const setSideLeader = (v: boolean) => { setSideLeaderRaw(v); lsSet(SIDE_KEY, v ? "1" : "0"); if (v) setFloatLeader(false); };   // BESIDE THE TEAM (the operator 2026-11-21): the Leader takes a third of the pane, kept mounted; the one exception to extra panes on a team
  const side = sideLeader && !!leader; const floating = !side && floatLeader && !!leader; const leaderShown = side || floating || tab === "leader";
  // THE FLOATING LEADER'S PLACE, SIZE AND SEE-THROUGH (the operator 2026-11-21): dragged by its title strip, resized from its corner, its opacity set by a slider; kept
  const FP_KEY = "antiloki.team.leader.fp"; type FP = { x: number | null; y: number | null; w: number | null; h: number | null; o: number };
  const [sidePct, setSidePctRaw] = React.useState<number>(() => { const v = Number(lsGet("antiloki.team.leader.sidew")); return Number.isFinite(v) && v >= 20 && v <= 60 ? v : 33.333; }); const setSidePct = (v: number) => { const c = Math.min(60, Math.max(20, v)); setSidePctRaw(c); lsSet("antiloki.team.leader.sidew", String(c)); };
  const [leaderHot, setLeaderHot] = React.useState(false); const prevFocus = React.useRef<HTMLElement | null>(null);   // the pane that had the keyboard before the pointer came over the Leader: it gets it back when the pointer leaves const [sidePct, setSidePctRaw] = React.useState<number>(() => { const v = Number(lsGet("antiloki.team.leader.sidew")); return Number.isFinite(v) && v >= 20 && v <= 60 ? v : 33.333; }); const setSidePct = (v: number) => { const c = Math.min(60, Math.max(20, v)); setSidePctRaw(c); lsSet("antiloki.team.leader.sidew", String(c)); };
  const [fp, setFpRaw] = React.useState<FP>(() => { try { const v = JSON.parse(lsGet(FP_KEY) || "null"); if (v && typeof v === "object") return { x: Number.isFinite(v.x) ? v.x : null, y: Number.isFinite(v.y) ? v.y : null, w: Number.isFinite(v.w) ? v.w : null, h: Number.isFinite(v.h) ? v.h : null, o: Number.isFinite(v.o) ? Math.min(1, Math.max(0.25, v.o)) : 1 }; } catch { /* not ours */ } return { x: null, y: null, w: null, h: null, o: 1 }; });
  const setFp = (f: (c: FP) => FP) => setFpRaw((c) => { const n = f(c); lsSet(FP_KEY, JSON.stringify(n)); return n; });
  const startDrag = (e: React.PointerEvent) => {
    const box = leaderBox.current; const host = box?.parentElement; if (!box || !host || (e.target as HTMLElement).closest("input,button")) return; const hr = host.getBoundingClientRect(); const br = box.getBoundingClientRect(); const dx = e.clientX - br.left, dy = e.clientY - br.top;
    const move = (m: PointerEvent) => { const x = Math.min(Math.max(0, m.clientX - hr.left - dx), Math.max(0, hr.width - 80)); const y = Math.min(Math.max(0, m.clientY - hr.top - dy), Math.max(0, hr.height - 40)); setFp((c) => ({ ...c, x, y })); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); e.preventDefault();
  };
  React.useEffect(() => { const box = leaderBox.current; if (!floating || !box || typeof ResizeObserver === "undefined") return; let first = true; const ro = new ResizeObserver(() => { if (first) { first = false; return; } const w = Math.round(box.offsetWidth), h = Math.round(box.offsetHeight); setFp((c) => (c.w === w && c.h === h ? c : { ...c, w, h })); }); ro.observe(box); return () => ro.disconnect(); }, [floating]);   // eslint-disable-line react-hooks/exhaustive-deps
  const { st: swm } = useSwarm(team); const swarming = !!swm && (swm.running || swm.session.status === "running");   // a swarm is running: the pane is lit in yellow
  const { st: evo } = useEvolve(team); const evolving = !!evo && (evo.running || evo.session.status === "running");   // a session is running: the whole pane is lit
  const [noticeHost, setNoticeHost] = React.useState<HTMLDivElement | null>(null); const leaderBox = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { if (tab !== "leader") return; const t = setTimeout(() => { const el = leaderBox.current?.querySelector<HTMLElement>("textarea, input, [contenteditable=true], .xterm-helper-textarea"); el?.focus({ preventScroll: true }); }, 60); return () => clearTimeout(t); }, [tab]);
  const sw = (on: boolean): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, padding: 0, borderRadius: 8, border: "none", cursor: "pointer", color: on ? C.fg : C.muted, background: on ? "color-mix(in srgb, var(--c-brand) 22%, transparent)" : "transparent" });
  const headerSlot = React.useContext(HeaderSlot); const [barSlot, setBarSlot] = React.useState<HTMLElement | null>(null);
  const leaderControlsNode = leader ? (
    <span data-testid="leader-modes" role="group" aria-label="Where the Leader sits" style={{ display: "inline-flex", gap: 2 }}>
      <button data-testid="side-leader" aria-pressed={side} title={side ? "Put the Leader back into a tab" : "Leader beside the team (a third of the pane)"} aria-label={side ? "Leader into a tab" : "Leader beside the team"} onClick={() => { setSideLeader(!sideLeader); if (!sideLeader && tab === "leader") go("run"); }} style={sw(side)}><Icon name="side" size={16} /></button>
      <button data-testid="float-leader" aria-pressed={floating} title={floating ? "Dock the Leader back into a tab" : "Float the Leader over the panes: drag it, resize it, make it see-through"} aria-label={floating ? "Dock the Leader" : "Float the Leader"} onClick={() => { setFloatLeader(!floatLeader); if (!floatLeader) setSideLeaderRaw(false); if (!floatLeader && tab === "leader") go("run"); }} style={sw(floating)}><Icon name="float" size={16} /></button>
    </span>) : null;
  const topNode = <span data-testid="team-top" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><ForkButton open={!!menuOpen} onOpen={(o) => onMenuOpen?.(o)} branch={graph?.branch}>{threads}</ForkButton>{leaderControlsNode}</span>;   /* THE TOP BAR'S TEAM CONTROLS (the operator 2026-11-22): the Leader/Graph switcher, the Fork button, and the Leader's placement */
  const inHeader = !!headerSlot; const leaderControls = inHeader ? null : topNode;   // on the pane's own top bar when it has one; else on the run bar
  return (
    <NoticeHost.Provider value={noticeHost}>
    <ViewBarSlot.Provider value={barSlot}>
    {inHeader && createPortal(topNode, headerSlot!)}
    <div style={{ height: "100%", position: "relative" }}>
    <div data-testid="team-pane" data-team={team} data-evolving={evolving ? "1" : "0"} data-swarming={swarming ? "1" : "0"} data-tab={tab} style={{ height: "100%", width: side ? `${100 - sidePct}%` : undefined, overflowY: tab === "run" ? "hidden" : "auto", overflowX: "hidden", background: "transparent", position: "relative" }}>   {/* no colour of its own: the pane around it carries the panes' transparency (--cw-term), so a team is as see-through as a terminal */}
      <style>{"[data-testid^=pane-]:has([data-swarming=\"1\"]):not(:has([data-evolving=\"1\"])){outline:2px solid #f2c230;outline-offset:-2px;border-radius:12px}[data-testid^=pane-]:has([data-evolving=\"1\"]){outline:2px solid #d97757;outline-offset:-2px;border-radius:12px;animation:evolve-frame 2.4s ease-in-out infinite}@keyframes evolve-frame{0%,100%{box-shadow:inset 0 0 0 0 rgba(217,119,87,.0)}50%{box-shadow:inset 0 0 26px 2px rgba(217,119,87,.28)}}@media (prefers-reduced-motion: reduce){[data-testid^=pane-]:has([data-evolving=\"1\"]){animation:none}}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.tn-card:empty{display:none}[data-testid=team-notices]:has(.tn-decision-chip) .tn-card:not(:has(.tn-decision-chip)){display:none}.tn-card:not(:has(>:not(.tn-x))){display:none}.tn-x:hover{opacity:1!important;background:rgba(255,255,255,.08)!important}.tn-card>*{margin:0!important;border:0!important;border-radius:0!important;background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:none!important}.tn-card>*+*{border-top:1px solid var(--c-border)!important}"}</style>
      {err && <div data-testid="team-error" style={{ padding: 16, color: "var(--c-bad)", fontFamily: nav, fontSize: 13 }}>{err}</div>}
      {graph && tab === "run" && runRows.length > 0 && <RunPicker rows={runRows} live={runRows.filter((x) => x.status?.status === "running" || x.status?.status === "paused").map((x) => x.id)} shown={run?.id ?? null} pinned={pinned} onPick={pickRunBy} slotRef={setBarSlot} />}
      {graph && tab === "run" && <AppConnections pre={apps} />}
      {graph && (tab === "run" || tab === "leader") && !editing && <TeamRun chat={tab === "leader"} onChat={leader ? () => { if (side) setSideLeader(false); if (floating) setFloatLeader(false); go("leader"); } : undefined} onLeaveChat={() => go("run")} leaderDot={leaderDot} leaderControls={leaderControls} graph={graph} report={report} run={run} onLead={leader ? () => go("leader") : undefined} onEdit={() => setEditing(true)} onRequests={() => setShowBoxes(true)} onRun={onRun} onChanged={reload} />}
      {graph && tab === "run" && editing && <TeamEdit team={team} graph={graph} onSaved={reload} onBack={() => setEditing(false)} />}
      {!graph && !err && <div data-testid="team-loading" aria-busy="true" aria-label="loading the team" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <style>{"@keyframes al-pulse{0%,100%{opacity:.35}50%{opacity:.7}}"}</style>
        <div style={{ height: 14, width: "38%", borderRadius: 4, background: C.border, animation: "al-pulse 1.2s ease-in-out infinite" }} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ height: 64, flex: "1 1 160px", maxWidth: 220, borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel2, animation: `al-pulse 1.2s ease-in-out ${i * 0.1}s infinite` }} />)}</div>
        <div style={{ height: 10, width: "62%", borderRadius: 4, background: C.border, animation: "al-pulse 1.2s ease-in-out infinite" }} />
        <div style={{ height: 10, width: "48%", borderRadius: 4, background: C.border, animation: "al-pulse 1.2s ease-in-out infinite" }} />
      </div>}
    </div>
    {leaderControls && tab !== "run" && <div style={{ position: "absolute", top: 10, left: 12, zIndex: 12, display: "flex", padding: 2, border: `1px solid ${C.border}`, borderRadius: 10, background: "color-mix(in srgb, var(--c-panel) 80%, transparent)" }}>{leaderControls}</div>}
    {leader && <div ref={leaderBox} data-testid="leader-tab" onMouseEnter={() => { setLeaderHot(true); if (side || floating) { const box = leaderBox.current; const a = document.activeElement as HTMLElement | null; if (a && box && !box.contains(a)) prevFocus.current = a; box?.querySelector<HTMLElement>("textarea, input:not([type=range]), [contenteditable=true], .xterm-helper-textarea")?.focus({ preventScroll: true }); } }} onMouseLeave={() => { setLeaderHot(false); if (side || floating) { const box = leaderBox.current; const a = document.activeElement as HTMLElement | null; const back = prevFocus.current; prevFocus.current = null; if (box && a && box.contains(a)) { if (back && back.isConnected) back.focus({ preventScroll: true }); else a.blur(); } } }} onFocusCapture={() => setLeaderHot(true)} onBlurCapture={() => setLeaderHot(false)} style={side ? { position: "absolute", right: 14, top: 10, bottom: 12, width: `calc(${sidePct}% - 26px)`, zIndex: 11, display: "flex", minHeight: 0, border: `1px solid ${leaderHot ? C.brand : C.border}`, borderRadius: 10, overflow: "hidden", background: "color-mix(in srgb, var(--c-panel) var(--cw-term, 100%), transparent)" } : floating ? { position: "absolute", ...(fp.x != null && fp.y != null ? { left: fp.x, top: fp.y } : { right: 64, top: 56 }), width: fp.w ?? "min(460px, calc(100% - 120px))", height: fp.h ?? "min(560px, calc(100% - 230px))", minWidth: 280, minHeight: 200, maxWidth: "100%", maxHeight: "100%", resize: "both", zIndex: 20, display: "flex", flexDirection: "column", border: `1px solid ${leaderHot ? C.brand : C.border}`, borderRadius: 14, overflow: "hidden", opacity: leaderHot ? 1 : 0.35, transition: "opacity .18s", background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 70%, transparent)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", boxShadow: "0 12px 40px rgba(0,0,0,.4)" } : { position: "absolute", left: 0, right: 0, top: 38, bottom: 0, zIndex: 11, background: "transparent", display: leaderShown ? "flex" : "none", minHeight: 0 }}>{side && <div data-testid="leader-seam" role="separator" aria-orientation="vertical" aria-label="Resize the Leader" onPointerDown={(e) => { const host = leaderBox.current?.parentElement; if (!host) return; const hr = host.getBoundingClientRect(); const move = (m: PointerEvent) => setSidePct(((hr.right - m.clientX) / hr.width) * 100); const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); e.preventDefault(); }} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 2 }} />}{floating && <div data-testid="leader-float-bar" onPointerDown={startDrag} style={{ display: "flex", alignItems: "center", gap: 8, height: 26, padding: "0 8px 0 12px", flex: "none", cursor: "grab", touchAction: "none", borderBottom: `1px solid ${C.border}`, fontFamily: nav, fontSize: 11.5, color: C.muted, userSelect: "none" }}>Leader<span style={{ flex: 1 }} /><button data-testid="leader-float-reset" title="Back to the default place and size" aria-label="Reset place and size" onClick={() => setFp((c) => ({ ...c, x: null, y: null, w: null, h: null }))} style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", padding: 2 }}>⟲</button></div>}<div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>{leader}</div></div>}   {/* kept mounted while hidden: the terminal keeps its screen and its session */}
    <TimeCostMini run={run} />
    {flash && tab !== "leader" && <div data-testid="team-updated" role="status" style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 13, display: "inline-flex", alignItems: "center", gap: 8, fontFamily: nav, fontSize: 12.5, color: C.fg, background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 82%, transparent)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid color-mix(in srgb, #4d8dff 40%, var(--c-border))", borderRadius: 999, padding: "5px 14px", boxShadow: "0 8px 24px rgba(0,0,0,.3)" }}><i aria-hidden style={{ width: 7, height: 7, borderRadius: 4, background: "#4d8dff", animation: "tg-blink .9s steps(2,jump-none) infinite" }} />The team was updated · {flash.nodes} nodes</div>}
    {tab === "run" && run && <RunReasoning run={run} floating facts={graph ? <RunFacts graph={graph} run={run} /> : undefined} />}
    {/* THE NOTICES OF A TEAM float here, over the pane, bottom right (not in a bar at its top): the inbox, file overlaps, what happened while you were away, the experiment, and what the run below has to say */}
    <div ref={setNoticeHost} data-testid="team-notices" style={{ position: "absolute", right: 60, bottom: 14, zIndex: 14, width: 340, maxWidth: "calc(100% - 100px)", maxHeight: "70%", overflowY: "auto", display: "flex", flexDirection: "column-reverse", gap: 8, pointerEvents: "none" }}>
      {tab !== "leader" && <NoticeCard><Inbox team={team} /></NoticeCard>}
      {tab !== "leader" && <NoticeCard><ConflictRadar /></NoticeCard>}
      {tab === "run" && <NoticeCard><AwayDigest /></NoticeCard>}
      {tab !== "leader" && <ExperimentCard team={team} onOpen={() => setShowBoxes(true)} />}
      {tab === "run" && run && run.state.status.status === "blocked" && <NoticeCard><RootCause run={run.id} team={team} failed /></NoticeCard>}
    </div>
    {tab !== "leader" && <EvolveBoxes team={team} st={evo} forced={showBoxes} onClose={() => setShowBoxes(false)} />}
    </div>
    </ViewBarSlot.Provider>
    </NoticeHost.Provider>
  );
}
