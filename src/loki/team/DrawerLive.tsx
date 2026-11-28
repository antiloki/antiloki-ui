// WHAT A STEP IS DOING NOW, IN ITS DRAWER (the operator 2026-11-15: "when we click on the agent we don't see what it is doing right now"; AffectUI's Agent Monitor, Agent Trail, Tool Access Map and Run Controls, our build): THE MONITOR (its current step with a clock and its bill),
// THE TRAIL (the tools it used, newest first), THE ACCESS MAP (a graph inside the graph: the agent in the middle, the tools it may reach around it, the one in use lit), THE RUN CONTROLS (pause, resume, stop, a note to steer) and its context window.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { controlRun } from "./api";
import { ContextWindow } from "./ContextMap";
import { Icon } from "./icons";
import { SteerBox } from "./SteerBox";
import { cardTools, liveOf, money, nodeState, spanWords, stepsOf, toolIcon } from "./model";
import type { Graph, Run } from "./types";

const BLUE = "#60a5fa"; const sec: React.CSSProperties = { fontSize: 10, letterSpacing: "0.09em", textTransform: "uppercase", color: C.dim, margin: "12px 0 6px" };
const btn: React.CSSProperties = { fontFamily: nav, fontSize: 12, background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 7, padding: "3px 10px", cursor: "pointer" };

/** The tools around an agent on its access map: what it may reach (its tool badges, its MCP apps and skills by name) plus what it has used, each with its icon; the lit ones are in use now. Pure. */
export function accessOf(graph: Graph, run: Run | null, id: string): { name: string; icon: string; used: boolean; lit: boolean }[] {
  const n: any = graph.nodes[id]; const used = run?.tools_live?.[id] ?? []; const lit = used[0]?.tool ?? ""; const out: { name: string; icon: string; used: boolean; lit: boolean }[] = [];
  const add = (name: string, icon: string) => { if (!out.some((o) => o.name === name)) out.push({ name, icon, used: used.some((u) => u.tool === name), lit: lit === name }); };
  for (const m of n?.agent?.mcp ?? []) add(String(m), "plug"); for (const s of n?.agent?.skills ?? []) add(String(s), "wrench"); if (n?.agent?.effects?.includes("web")) add("WebSearch", "globe"); if (n?.agent?.effects?.includes("document")) add("Write", "doc");
  for (const u of used) add(u.tool, toolIcon(u.tool)); return out.slice(0, 10);
}
export function AccessMap({ graph, run, id }: { graph: Graph; run: Run | null; id: string }) {
  const nodes = accessOf(graph, run, id); if (!nodes.length) return null; const R = 62, cx = 110, cy = 80;
  return (
    <svg data-testid="access-map" width="100%" viewBox="0 0 220 160" role="img" aria-label="the tools this agent can reach" style={{ display: "block", maxWidth: 260 }}>
      {nodes.map((t, i) => { const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2; const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * (R - 16); return <g key={t.name} data-testid={`access-${t.name}`} data-lit={t.lit ? "1" : "0"}>
        <line x1={cx} y1={cy} x2={x} y2={y} stroke={t.lit ? BLUE : "currentColor"} strokeOpacity={t.lit ? 0.9 : 0.2} strokeWidth={t.lit ? 1.6 : 1} />
        <circle cx={x} cy={y} r={9} fill="none" stroke={t.lit ? BLUE : "currentColor"} strokeOpacity={t.lit ? 1 : t.used ? 0.55 : 0.25} />
        <foreignObject x={x - 6} y={y - 6} width={12} height={12}><div style={{ color: t.lit ? BLUE : C.muted, display: "flex" }}><Icon name={t.icon} size={12} /></div></foreignObject>
        <text x={x} y={y + 20} textAnchor="middle" fontSize={8} fill="currentColor" fillOpacity={0.6} fontFamily="inherit">{t.name.replace(/^mcp__/, "").slice(0, 12)}</text></g>; })}
      <circle cx={cx} cy={cy} r={12} fill="none" stroke="currentColor" strokeOpacity={0.5} /><text x={cx} y={cy + 3} textAnchor="middle" fontSize={8} fill="currentColor" fontFamily="inherit">agent</text>
    </svg>
  );
}

export function DrawerLive({ graph, run, id, onChanged }: { graph: Graph; run: Run | null; id: string; onChanged?: () => void }) {
  const n = graph.nodes[id]; const [tick, setTick] = React.useState(0);
  React.useEffect(() => { if (!run?.live) return; const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, [run?.live]);
  if (!n || !run) return null; const st = nodeState(graph, run, id); const l = liveOf(id, n, st, run); const since = run.state.active?.[id]; const now = run.live ? Date.now() : run.state.now_ms; const steps = stepsOf(id, run, now, 10); const isAgent = n.node === "role"; void tick;
  const ctl = async (a: "pause" | "resume" | "stop") => { await controlRun(run.id, a); onChanged?.(); };
  return (
    <div data-testid="drawer-live" style={{ fontFamily: nav, fontSize: 12.5, color: C.fg }}>
      <div style={sec}>Now</div>
      <div data-testid="monitor" style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", display: "grid", gap: 3 }}>
        <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}><b style={{ fontWeight: 500 }}>{st === "working" ? "Working" : st === "waiting" ? "Waiting" : st === "done" ? "Done" : st === "failed" ? "Failed" : "Idle"}</b>{since && st === "working" && <span data-testid="monitor-clock" style={{ fontFamily: mono, color: C.muted }}>{spanWords(Math.max(0, now - since))}</span>}<span style={{ marginLeft: "auto", fontFamily: mono, color: C.muted }}>{money(run.state.node_cost?.[id])}</span></span>
        <span data-testid="monitor-now" style={{ color: C.muted, fontFamily: steps[0] ? mono : nav, fontSize: 11.5 }}>{l.now || "nothing yet"}</span>
      </div>
      {steps.length > 0 && <><div style={sec}>Trail</div>
        <ol data-testid="trail" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 0 }}>{steps.map((s, i) => <li key={i} style={{ display: "grid", gridTemplateColumns: "18px 1fr auto", gap: 8, alignItems: "center", padding: "4px 0", borderBottom: `1px solid color-mix(in srgb, currentColor 5%, transparent)` }}><span style={{ color: i === 0 && st === "working" ? BLUE : C.dim, display: "inline-flex" }}><Icon name={s.icon} size={12} /></span><span style={{ fontFamily: mono, fontSize: 11.5, color: i === 0 ? C.fg : C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.text}</span><span style={{ fontSize: 10.5, color: C.dim }}>{s.ago}</span></li>)}</ol></>}
      {isAgent && <><div style={sec}>Access</div><AccessMap graph={graph} run={run} id={id} /></>}
      <div style={sec}>Context</div><ContextWindow run={run} id={id} />
      {run.live && <><div style={sec}>Run controls</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>{run.state.status.status === "paused" ? <button data-testid="drawer-resume" style={btn} onClick={() => void ctl("resume")}>Resume</button> : <button data-testid="drawer-pause" style={btn} onClick={() => void ctl("pause")}>Pause</button>}<button data-testid="drawer-stop" style={{ ...btn, color: "#f87171" }} onClick={() => void ctl("stop")}>Stop the run</button></div>
        <SteerBox run={run.id} /></>}
      {cardTools(n).icons.length === 0 && !isAgent ? null : null}
    </div>
  );
}
