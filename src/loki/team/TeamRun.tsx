// THE RUN TAB (RFC 0008 §4.12 to §4.14; mockup board 1): the circuit with its LEDs and pulses (collapsible to one line of avatars), what needs the person, and the saga pack as a list. The Leader's terminal is its own pane beside this one.
import { DecisionNotice, fillNote } from "./ApprovalCard";
import { SequenceView, SequenceSkeleton } from "./SequenceView";
import { ViewBarSlot } from "./viewbar-slot";
import { HeaderSlot } from "@/loki/cowork/header-slot";
import { createPortal } from "react-dom";
import { EditorView } from "./EditorView";
import { AgentGraph } from "./AgentGraph";
import { specialistsOpenable } from "@/loki/cowork/api";
import { useNotice } from "./NoticeHost";
import { SkillPanel } from "./SkillPanel";
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { answerAt, controlRun, stashWorkspace, workspaceState, type WorkspaceState } from "./api";
import { Board, Led } from "./Board";
import { IconSeg } from "./TeamHubs";
import { Icon, RoleBox } from "./icons";
import { draftsOf } from "./TeamSkills";
import { listRequests, listSkills } from "./api";
import { NodeInterior } from "./NodeInterior";
import { ROLE_CODE, counts, flowOrder, iconOf, money, nodeState, parkedAt, statusWords, titleOf, sameTeam } from "./model";
import type { Graph, Report, Run, Skill } from "./types";

const btn: React.CSSProperties = { fontFamily: nav, fontSize: 12.5, background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 7, padding: "5px 12px", cursor: "pointer" };
const ctl: React.CSSProperties = { width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: 8, color: "var(--c-muted)", cursor: "pointer" };
const pill = (tone: string): React.CSSProperties => ({ fontFamily: mono, fontSize: 11.5, border: `1px solid ${tone}`, color: tone, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" });
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }; const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

/** The collapsed circuit: one line of avatars with their LEDs and a thin trace between them (board 3). */
export function Strip({ graph, run, onSelect }: { graph: Graph; run: Run | null; onSelect: (id: string) => void }) {
  const order = flowOrder(graph);
  return (
    <div data-testid="circuit-strip" style={{ display: "flex", alignItems: "flex-start", gap: 0, padding: "12px 16px", overflowX: "auto" }}>
      {order.map((id, i) => { const n = graph.nodes[id]; const st = nodeState(graph, run, id);
        return <React.Fragment key={id}>
          {i > 0 && <span style={{ width: 26, height: 2, background: "color-mix(in srgb, var(--c-brand) 30%, var(--c-border))", marginTop: 16, flex: "none" }} />}
          <button data-testid={`strip-${id}`} data-state={st} onClick={() => onSelect(id)} title={`${titleOf(id, n)} · ${st}`} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: C.fg, padding: "0 2px", flex: "none" }}>
            <span style={{ width: 34, height: 26, borderRadius: 3, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", background: C.panel, color: C.muted, fontFamily: mono, fontSize: 9.5, letterSpacing: ".08em" }}>{n.node === "role" ? ROLE_CODE[n.role] : n.node === "leader" ? "LDR" : <Icon name={iconOf(n)} size={15} />}</span>
            <Led state={n.node === "leader" ? "working" : st} size={7} /><span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, maxWidth: 62, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titleOf(id, n)}</span>
          </button></React.Fragment>; })}
    </div>
  );
}

/** A team that needs DIRECTION is one whose nodes use what is asked of it (`{ask}`), or that says so (`direction: "leader"`); one that does the same job each time (`direction: "none"`, or nothing in it takes the ask) just runs. Pure. */
export function needsDirection(graph: Graph): boolean {
  const d = (graph as any).direction; if (d === "leader") return true; if (d === "none") return false;
  try { return JSON.stringify(graph.nodes ?? {}).includes("{ask}"); } catch { return false; }
}
export function TeamRun({ leaderControls, graph, report, run, onEdit, onRun, onChanged, onRequests, onLead, chat, onChat, onLeaveChat, leaderDot }: { /** THE CHAT IS THE FIRST VIEW (the operator 2026-11-22): the Leader shown in place of the graph; while it is, this draws only its view bar so the person can switch back */ chat?: boolean; onChat?: () => void; onLeaveChat?: () => void; /** the Leader is asking for you, or working: a dot on the Chat option */ leaderDot?: "blocked" | "working" | "idle"; /** a team that needs direction: ▶ goes to the Leader (this opens its tab) */ onLead?: () => void; /** the Leader's placement switches (float, beside), drawn at the start of the top bar */ leaderControls?: React.ReactNode; /** open the improvement requests (a click on a suggestion node) */ onRequests?: () => void; graph: Graph; report: Report | null; run: Run | null; onEdit: () => void; onRun: (ask: string, budget?: number) => Promise<string | null>; onChanged: () => void }) {
  const [sel, setSel] = React.useState<string | null>(null); const [note, setNote] = React.useState<{ text: string; bad?: boolean } | null>(null); const [busy, setBusy] = React.useState(false);
  const c = counts(graph, run); const parked = parkedAt(graph, run); const status = run?.state.status; const live = !!run?.live && status && (status.status === "running" || status.status === "paused");
  // A RUN KEEPS THE TEAM IT STARTED WITH. When the team was rewritten since (the Leader remade it) and that run is not going, the circuit shows the team AS IT IS NOW, and says so; the run's own version is one click away.
  const [oldView, setOldView] = React.useState(false); const [nowView, setNowView] = React.useState(false); const [view, setViewRaw] = React.useState<"graph" | "canvas" | "sequence" | "editor">(() => { const v = lsGet("antiloki.team.view"); return v === "canvas" || v === "sequence" || v === "editor" ? v : "graph"; }); const setView = (v: "graph" | "canvas" | "sequence" | "editor") => { setViewRaw(v); try { localStorage.setItem("antiloki.team.view", v); } catch { /* private window */ } };   // the Graph is the default view (approved mockup 2026-11-18); the Canvas left the switch on 2026-11-18 (the graph shows the branches and loops as tiles, Sequence the order, Edit the wiring); a stored "canvas" still draws the old board
  const differs = !!run && !sameTeam(run.graph, graph); const changed = differs && !live;
  // a run that is going keeps the team it started with (its state is on those nodes), and says so when the team has been changed since; "show the team now" shows the team as it is, to see a node added after the run began
  const shown: Graph = !run ? graph : live ? (differs && nowView ? graph : (run.graph ?? graph)) : (!changed || oldView ? (run.graph ?? graph) : graph);
  React.useEffect(() => { setOldView(false); setNowView(false); }, [run?.id]);
  // the mascots of the project's specialists, so a node that runs as one shows its real avatar
  const [specs, setSpecs] = React.useState<Record<string, { shape?: string; color?: string }>>({});
  React.useEffect(() => { let stop = false; void specialistsOpenable().then((rows) => { if (!stop) setSpecs(Object.fromEntries(rows.map((r) => [r.id, { shape: r.shape, color: r.color }]))); }).catch(() => {}); return () => { stop = true; }; }, []);
  const gate = parked ? run!.park_info?.[parked] || (graph.nodes[parked] as any)?.gate : "";
  const answer = async (approve: boolean) => { if (!run || !parked) return; setBusy(true); const r = await answerAt(run.id, parked, approve); setBusy(false); setNote(r.ok ? { text: approve ? (gate === "merge" ? "approved: the pack landed on the workspace" : "approved") : "not approved: the run is handed back to you" } : { text: r.error ?? "not answered", bad: true }); onChanged(); };
  // a merge gate asks the serve what in the workspace would stop the land, so the card can say so before the click
  const [ws, setWs] = React.useState<WorkspaceState | null>(null); const atMerge = !!run && !!parked && gate === "merge"; const runId = run?.id;
  React.useEffect(() => { if (!atMerge || !runId) { setWs(null); return; } let stop = false; const go = async () => { const w = await workspaceState(runId); if (!stop && w) setWs(w); }; void go(); const t = setInterval(go, 5000); return () => { stop = true; clearInterval(t); }; }, [atMerge, runId]);
  const stash = async () => { if (!run) return; setBusy(true); const r = await stashWorkspace(run.id); setBusy(false); setNote(r.ok ? { text: "your changes are set aside" } : { text: r.error ?? "could not set them aside", bad: true }); const w = await workspaceState(run.id); if (w) setWs(w); };
  const [waiting, setWaiting] = React.useState<string[]>([]); const [suggestions, setSuggestions] = React.useState<{ n: number; problem: string }[]>([]); const [skills, setSkills] = React.useState<Skill[]>([]); const [selSkill, setSelSkill] = React.useState<string | null>(null);
  React.useEffect(() => { let stop = false; let busy = false; const go = async () => { if (busy || (typeof document !== "undefined" && document.hidden)) return; busy = true; try { const rq = await listRequests(graph.team); if (!stop) setSuggestions((old) => { const n = rq.filter((x) => x.status === "open").map((x) => ({ n: x.n, problem: x.problem })); return JSON.stringify(old) === JSON.stringify(n) ? old : n; }); const l = await listSkills(graph.team); if (!stop) setSkills((old) => (JSON.stringify(old) === JSON.stringify(l) ? old : l)); if (!stop) setWaiting((old) => { const n = draftsOf(l).map((x) => x.name); return JSON.stringify(old) === JSON.stringify(n) ? old : n; }); } finally { busy = false; } }; void go(); const t = setInterval(go, 12_000); return () => { stop = true; clearInterval(t); }; }, [graph.team]);
  // THE PLAY BUTTON (the operator 2026-11-20: "teams has no play button, should have"): starts a run of this team from what is asked of it; the last ask is kept to run again
  const directed = needsDirection(graph); const [starting, setStarting] = React.useState(false);
  // ▶ runs the team again with the same ask as its last run (the ask is kept by the run), else the team's own name (a team that has everything in its nodes needs no sentence)
  const start = async () => { const a = run?.ask || graph.team; if (starting) return; setStarting(true); const err = await onRun(a); setStarting(false); if (err) setNote({ text: err, bad: true }); else { setNote(null); } };
  const put = useNotice(); const [zoomApi, setZoomApi] = React.useState<{ zoomIn: () => void; zoomOut: () => void; fit: () => void } | null>(null);
  const blocked = report && !report.errors.length === false ? report.errors[0]?.message : waiting.length ? `${waiting.length} skill${waiting.length === 1 ? "" : "s"} to read and approve first (${waiting.join(", ")})` : null;
  // THE VIEW BAR (the operator 2026-11-21: "the Graph, Editor, Sequence switcher disappeared again: put it on the topbar where the latest-run dropdown is, to the right, not draggable, not transparent"): drawn in the run picker's row when there is one, else at the top right of the run
  // THE VIEW BAR LIVES ON A TOP BAR, NEVER FLOATING (the operator 2026-11-24): the run picker's slot when the Run tab has one, else the pane's own header; it floats only when there is neither (a team shown on its own)
  const barSlot0 = React.useContext(ViewBarSlot); const headerSlot0 = React.useContext(HeaderSlot); const barSlot = barSlot0 ?? headerSlot0;
  const viewBar = !sel ? <div data-testid="run-header" style={{ display: "flex", gap: 8, alignItems: "center", height: 30, minWidth: 0, fontSize: 12.5, ...(barSlot ? {} : { position: "absolute", top: 8, right: 12, zIndex: 12, padding: "0 8px", border: `1px solid ${C.border}`, borderRadius: 14, background: "var(--c-panel2, var(--c-panel))" }) }}>
        {leaderControls}<span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {view === "graph" && !chat && !sel && <span data-testid="graph-zoom" style={{ display: "inline-flex", gap: 4 }}>{[["−", "zoom out", () => zoomApi?.zoomOut()], ["+", "zoom in", () => zoomApi?.zoomIn()], ["⤢", "fit the graph", () => zoomApi?.fit()]].map(([t, tip, fn]: any) => <button key={t} type="button" title={tip} aria-label={tip} onClick={fn} style={{ width: 24, height: 24, borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer", fontSize: 13, lineHeight: "20px", padding: 0 }}>{t}</button>)}</span>}
          <span style={{ position: "relative", display: "inline-flex" }}><IconSeg items={[...(onChat ? [["chat", "chat", "Chat"] as ["chat", string, string]] : []), ["graph", "graph", "Graph"], ["editor", "code", "Editor"], ["sequence", "seq", "Sequence"]] as any} value={chat ? "chat" : view} onPick={(v: string) => { if (v === "chat") { onChat?.(); return; } if (chat) onLeaveChat?.(); setView(v as "graph" | "canvas" | "sequence" | "editor"); }} testPrefix="view" label="view of the run" bare />{onChat && !chat && (leaderDot === "blocked" || leaderDot === "working") && <i data-testid={`leader-dot-${leaderDot}`} title={leaderDot === "blocked" ? "the Leader is asking for you" : "the Leader is working"} style={{ position: "absolute", top: 2, left: 2, width: 7, height: 7, borderRadius: 4, background: leaderDot === "blocked" ? "var(--c-warn)" : "var(--c-ok)", pointerEvents: "none" }} />}</span>
          {live && <span style={{ display: "inline-flex", gap: 2 }}>
            {status?.status === "running" && <button data-testid="run-pause" aria-label="pause the run" title="Pause" style={ctl} onClick={() => void controlRun(run!.id, "pause").then(onChanged)}><Icon name="pause" size={15} /></button>}
            {status?.status === "paused" && <button data-testid="run-resume" aria-label="resume the run" title="Resume" style={ctl} onClick={() => void controlRun(run!.id, "resume").then(onChanged)}><Icon name="play" size={15} /></button>}
            <button data-testid="run-stop" aria-label="stop the run" title="Stop" style={ctl} onClick={() => void controlRun(run!.id, "stop").then(onChanged)}><Icon name="stop" size={15} /></button>
          </span>}
          {!live && <button data-testid="run-start" aria-label="run the team" title={blocked ? `cannot run yet: ${blocked}` : directed && onLead ? "This team needs your direction: talk to the Leader" : "Run the team again, as the last run (the same ask)"} style={{ ...ctl, opacity: blocked ? 0.4 : 1 }} disabled={!!blocked || starting} onClick={() => { if (directed && onLead) onLead(); else void start(); }}><Icon name="play" size={15} /></button>}
        </span>
      </div> : null;
  if (chat) return <div data-testid="team-run-chat" style={{ position: "relative" }}>{viewBar && (barSlot ? createPortal(viewBar, barSlot) : viewBar)}</div>;   // the Leader is shown: only the bar stays, so the other views are one click away
  return (
    <div data-testid="team-run" style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", fontFamily: nav, color: C.fg }}>
      {viewBar && (barSlot ? createPortal(viewBar, barSlot) : viewBar)}
      <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
        {put(<>
        {live && differs && <div data-testid="team-changed-live" style={{ padding: "7px 16px", fontSize: 12, color: "#ffb547", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Icon name="hand" size={13} /><span>{nowView ? "This is the team as it is now. Run " + run!.id + " is going with the team it started with." : "The team has been changed since this run began. The run goes on with the team it started with."}</span>
          <button data-testid="team-changed-live-toggle" onClick={() => setNowView((v) => !v)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "1px 9px", cursor: "pointer", fontSize: 11.5 }}>{nowView ? "show the run's team" : "show the team now"}</button></div>}
        {changed && <div data-testid="team-changed" style={{ padding: "7px 16px", fontSize: 12, color: "#ffb547", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>{oldView ? `This is the team as run ${run!.id} started it. The team has been changed since.` : `The team has been changed since run ${run!.id}. This is the team as it is now; start a new run to use it.`}</span>
          <button data-testid="team-changed-toggle" onClick={() => setOldView((v) => !v)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "1px 9px", cursor: "pointer", fontSize: 11.5 }}>{oldView ? "show the team now" : "show the run's team"}</button></div>}
        {selSkill && skills.find((x) => x.name === selSkill) && <SkillPanel team={graph.team} skill={skills.find((x) => x.name === selSkill)!} onClose={() => setSelSkill(null)} onChanged={() => { void listSkills(graph.team).then(setSkills); onChanged(); }} />}
        </>)}
        <div data-testid="run-body" style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column", overflow: "auto" }}>{sel && shown.nodes[sel] ? <NodeInterior graph={shown} run={run} id={sel} onClose={() => setSel(null)} onChanged={onChanged} /> : view === "sequence" && run ? <SequenceView run={run} onSelect={setSel} /> : view === "sequence" ? <SequenceSkeleton graph={shown} /> : view === "editor" && run ? <EditorView run={run} /> : view === "editor" ? <div data-testid="editor-norun" style={{ padding: 16, color: "var(--c-muted)" }}>Start a run to watch the agents write.</div> : view === "graph" ? <AgentGraph graph={shown} run={run} specialists={specs} selected={sel} onSelect={(id) => { setSelSkill(null); setSel(id); }} onZoomApi={setZoomApi} skills={skills} suggestions={suggestions} onSuggestion={() => onRequests?.()} selectedSkill={selSkill} onSkill={(n) => { setSel(null); setSelSkill(n); }} /> : <Board graph={shown} run={run} selected={sel} onSelect={setSel} />}</div>   {/* the pane no longer scrolls on the Run tab (the view bar must always be in sight): the view scrolls inside itself, where it needs to */}
      </div>
      {put(<>
      {parked && <DecisionNotice title={titleOf(parked, graph.nodes[parked])} gate={String(gate ?? "")} run={run?.id} node={parked} approval={(graph.nodes[parked] as any)?.approval ? { risk: (graph.nodes[parked] as any).approval.risk, show: (graph.nodes[parked] as any).approval.show, note: fillNote((graph.nodes[parked] as any).approval.note ?? "", run?.ask ?? "", run?.state?.values ?? {}) } : null} busy={busy} error={note?.bad ? note.text : null} workspace={ws} onStash={() => void stash()} onAnswer={answer} />}
      {waiting.length > 0 && !live && <div data-testid="skills-wait" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
        <i style={{ width: 6, height: 6, borderRadius: "50%", background: "#c9a34e", display: "inline-block" }} />
        <span><b style={{ fontWeight: 500 }}>Skills wait for you</b> <span style={{ color: C.muted }}>· the Leader wrote {waiting.join(", ")}; read and approve {waiting.length === 1 ? "it" : "them"} before the team can run</span></span>
        <button data-testid="skills-review" onClick={() => setSelSkill(waiting[0] ?? null)} style={{ marginLeft: "auto", fontFamily: nav, fontSize: 12, background: "transparent", color: C.fg, border: "1px solid #7a5f3a", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>Review</button>
      </div>}
      {status?.status === "blocked" && !parked && <div data-testid="handed-over" style={{ display: "flex", gap: 10, padding: "9px 16px", borderTop: `1px solid ${C.border}`, fontSize: 13 }}><i style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-bad)", display: "inline-block", marginTop: 7 }} /><span><b style={{ fontWeight: 500 }}>Handed to you</b> <span style={{ color: C.muted }}>· {status.why}</span></span></div>}
      {/* THE ONLY WAY TO TALK TO A TEAM IS ITS LEADER (the operator 2026-11-18): there is no ask field here; this line only says why a team cannot run */}
      {!live && blocked && <div data-testid="run-blocked" style={{ borderTop: `1px solid ${C.border}`, padding: "10px 16px", fontSize: 12, color: "var(--c-bad)", display: "flex", gap: 6, alignItems: "center" }}><Icon name="x" size={13} />This graph cannot run: {blocked}</div>}
      {note && !(note.bad && parked) && <div data-testid="run-note" style={{ fontSize: 12, padding: "6px 16px", color: note.bad ? "var(--c-bad)" : C.muted }}>{note.text}</div>}
      </>)}
    </div>
  );
}
