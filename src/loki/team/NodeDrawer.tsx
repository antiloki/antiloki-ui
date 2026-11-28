// A NODE'S DRAWER (RFC 0008 §4.14; mockup board 4): click any chip and its drawer opens over the board. A role node shows its read-only terminal (the transcript of its headless calls), its model, its budget and scope, where a failure goes,
// its history and what it wrote; a tool node shows the call it made and its typed result. Every control here is also an MCP call, so the Leader can do the same.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { controlRun, editNode, nodeBench, nodeView } from "./api";
import { Icon, RoleBox } from "./icons";
import { Led } from "./Board";
import { DrawerLive } from "./DrawerLive";
import { FAILURE_PORTS, ROLE_LABEL, faceOf, iconOf, letterOf, modelLine, money, nodeState, sublabel, titleOf } from "./model";
import type { AgentSpec, Graph, NodeBench, NodeView, Run } from "./types";

const MODELS = [{ id: "", label: "the tier's own model (default)" }, { id: "claude-haiku-5-5", label: "Haiku 5.5 · low" }, { id: "claude-sonnet-5-5", label: "Sonnet 5.5 · mid and high" }];
const sec: React.CSSProperties = { fontFamily: mono, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: C.muted, margin: "14px 0 6px" };
const kv = (k: string, v: React.ReactNode, tone?: string) => <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12.5 }}><span style={{ color: C.muted, fontFamily: nav }}>{k}</span><span style={{ fontFamily: mono, color: tone ?? C.fg, textAlign: "right" }}>{v}</span></div>;
const btn: React.CSSProperties = { fontFamily: nav, fontSize: 12, background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 7, padding: "5px 11px", cursor: "pointer" };

/** The parts of a node's details, so the inside of a node can show one at a time (NodeInterior): its words and the live trail, its brief and call, its model, its budget, what it wrote and what happens when it fails. */
export type Part = "trail" | "brief" | "model" | "cap" | "out";
export function NodeDrawer({ graph, run, id, onClose, onChanged, only }: { graph: Graph; run: Run | null; id: string; onClose: () => void; onChanged?: () => void; /** show just this part, without the header and the sheet */ only?: Part }) {
  const show = (k: Part) => !only || only === k;
  React.useEffect(() => { if (only) return; /* a part inside a node's own canvas does not own Esc: that canvas closes the window first */ const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, only]);
  const n = graph.nodes[id]; const [view, setView] = React.useState<NodeView | null>(null); const [attempt, setAttempt] = React.useState(-1); const [model, setModel] = React.useState<string>(""); const [msg, setMsg] = React.useState<{ text: string; bad?: boolean } | null>(null);
  const [cap, setCap] = React.useState<string>(n?.cap_usd ? String(n.cap_usd) : "");
  const [bench, setBench] = React.useState<NodeBench | null>(null);
  React.useEffect(() => { let stop = false; setBench(null); void nodeBench(graph.team).then((l) => { if (!stop) setBench(l.find((b) => b.node === id) ?? null); }); return () => { stop = true; }; }, [graph.team, id, run?.state.status]);   // read again when a run moves on
  React.useEffect(() => { if (!run) { setView(null); return; } let stop = false; const load = () => void nodeView(run.id, id).then((v) => { if (!stop) setView(v); }); load(); const t = setInterval(load, 2000); return () => { stop = true; clearInterval(t); }; }, [run?.id, id]);
  React.useEffect(() => { setAttempt(-1); setCap(graph.nodes[id]?.cap_usd ? String(graph.nodes[id].cap_usd) : ""); setModel(""); setMsg(null); }, [id]);
  if (!n) return null;
  const target = run?.live ? { run: run.id } : { team: graph.team }; const st = nodeState(graph, run, id); const isRole = n.node === "role"; const isTool = n.node === "use_tool";
  const apply = async (patch: Record<string, unknown>, said: string) => { const r = await editNode(target, id, patch); setMsg(r.ok ? { text: said } : { text: r.error ?? "not applied", bad: true }); if (r.ok) onChanged?.(); };
  const attempts = view?.attempts ?? []; const shown = attempts.length ? attempts[attempt < 0 ? attempts.length - 1 : Math.min(attempt, attempts.length - 1)] : null;
  const fails = graph.edges.filter((e) => e.from === id && (FAILURE_PORTS as readonly string[]).includes(e.port));
  const history = (run?.events ?? []).filter((e) => e.actor === id).slice(0, 12);
  const out = run?.state.values?.[id];
  return (
    (() => { const body = (
      <div className={only ? undefined : "nd-body"} style={{ padding: only ? "0 0 6px" : "0 16px 18px" }}>
        {show("trail") && run && (isRole || isTool) && <DrawerLive graph={graph} run={run} id={id} onChanged={onChanged} />}
        {show("trail") && isRole && <div data-testid="drawer-banner" style={{ margin: "12px 0", padding: "9px 12px", background: "color-mix(in srgb, #12445a 25%, var(--c-panel2))", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ color: "#52c7ff" }}>●</span><span style={{ flex: 1 }}>Read-only. <b>The team drives this agent</b>{run ? ` (run ${run.id})` : ""}.</span>
          {run?.live && <button data-testid="drawer-takeover" style={btn} onClick={() => void controlRun(run.id, "pause").then((r) => setMsg(r.ok ? { text: "the run is paused: take the work over, then resume" } : { text: r.error ?? "could not pause", bad: true }))}>Take over</button>}
        </div>}
        {show("brief") && isTool && <div style={{ margin: "12px 0", padding: "9px 12px", background: "var(--c-panel2)", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}>A tool node has no conversation. Here is the call it made and the typed result it wrote into the run state.</div>}
        {show("trail") && run && (isRole || isTool) && <div data-testid="drawer-terminal" style={{ background: "var(--c-bg)", border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, fontFamily: mono, fontSize: 11.5, lineHeight: 1.5, whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto", color: C.fg }}>
          {attempts.length > 1 && <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>{attempts.map((a, i) => <button key={a.file} data-testid={`attempt-${i + 1}`} onClick={() => setAttempt(i)} style={{ ...btn, padding: "1px 8px", fontSize: 11, borderColor: (attempt < 0 ? attempts.length - 1 : attempt) === i ? C.brand : C.border }}>attempt {i + 1}</button>)}</div>}
          {shown ? shown.text : st === "working" ? "working… its words appear here when its call ends" : "nothing yet: it has not run"}
        </div>}
        {show("brief") && isRole && (n as any).role === "agent" && (n as any).agent && <AgentJob a={(n as any).agent} />}
        {show("model") && isRole && <>
          <div style={sec}>Model for this node</div>
          <div style={{ fontFamily: mono, fontSize: 11.5, color: C.muted, marginBottom: 6 }}>now: {modelLine(n)}</div>
          <select data-testid="drawer-model" value={model} onChange={(e) => setModel(e.target.value)} style={{ width: "100%", background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 8px", fontFamily: mono, fontSize: 12 }}>
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
          <input data-testid="drawer-model-text" placeholder="or type a model, or engine:model" value={model && !MODELS.some((m) => m.id === model) ? model : ""} onChange={(e) => setModel(e.target.value)} style={{ width: "100%", marginTop: 6, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 8px", fontFamily: mono, fontSize: 12 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button data-testid="drawer-model-next" style={{ ...btn, background: C.brand, borderColor: C.brand, color: "#fff" }} onClick={() => void apply({ model }, model ? `${model} for the next attempt` : "back to the tier's own model")}>Use for the next attempt</button>
            {run?.live && id in (run.state.active ?? {}) && <button data-testid="drawer-model-now" style={btn} onClick={() => void apply({ model }, "changed").then(async () => { const r = await (await import("./api")).teamOp("restart", { run: run.id, node: id }); setMsg(r.ok ? { text: "restarted with it" } : { text: r.error ?? "could not restart", bad: true }); })}>Restart with it now</button>}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>A change is an event on the team saga (who changed it, from what to what), and the Leader is told.</div>
        </>}
        {show("cap") && (isRole || isTool || n.node === "loop") && <>
          <div style={sec}>Budget and scope</div>
          {run && n.cap_usd ? <div style={{ height: 5, borderRadius: 3, background: C.border, overflow: "hidden", margin: "4px 0 6px" }}><i data-testid="cap-bar" style={{ display: "block", height: "100%", width: `${Math.min(100, ((run.state.node_cost?.[id] ?? 0) / n.cap_usd) * 100)}%`, background: "#52c7ff" }} /></div> : null}
          {kv("spent / cap", `${money(run?.state.node_cost?.[id])} / ${n.cap_usd ? money(n.cap_usd) : "no cap"}`)}
          <div style={{ display: "flex", gap: 8, margin: "8px 0" }}><input data-testid="drawer-cap" inputMode="decimal" placeholder="cap $" value={cap} onChange={(e) => setCap(e.target.value)} style={{ width: 90, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 8px", fontFamily: mono, fontSize: 12 }} /><button data-testid="drawer-cap-save" style={btn} onClick={() => void apply({ cap_usd: parseFloat(cap) || 0 }, "the cap is changed")}>set cap</button></div>
          {isRole && kv("owns", ((n as any).owns ?? []).join(", ") || "—")}{isRole && kv("read-only", (n as any).readonly === false ? "off" : ["planner", "qa", "audit"].includes((n as any).role) ? "on" : "off")}
          {isTool && kv("allow-list", ((n as any).allow?.effects ?? []).join(", ") || "none")}{isTool && kv("paths", ((n as any).allow?.paths ?? []).join(", ") || "—")}
        </>}
        {show("out") && <><div style={sec}>If it fails</div>
        {fails.length ? fails.map((e) => kv(e.port, `→ ${e.to}`)) : <div style={{ fontSize: 12, color: C.muted }}>nothing catches it: the run stops and is handed to you</div>}</>}
        {show("brief") && ["code", "transform", "stop", "sub_team"].includes(n.node) && <><div style={sec}>Settings</div>{Object.entries(n as Record<string, unknown>).filter(([k]) => !["node", "label", "why", "pos", "timeout_s", "cap_usd"].includes(k)).map(([k, v]) => kv(k, <span style={{ fontFamily: mono, fontSize: 11.5, wordBreak: "break-all" }}>{typeof v === "string" ? v.slice(0, 160) : JSON.stringify(v).slice(0, 160)}</span>))}</>}
        {show("brief") && isTool && <><div style={sec}>The call</div>{kv("type", (n as any).tool.type)}{kv("name", (n as any).tool.name)}{kv("args", JSON.stringify((n as any).tool.args ?? {}))}{kv("timeout", n.timeout_s ? `${n.timeout_s} s` : "—")}{kv("cost", "$0.00 · no model", "#3ddc97")}</>}
        {show("out") && <>
        <div style={sec}>{isTool ? "Typed result (written to the run state)" : "Output (what it wrote into the run state)"}</div>
        <pre data-testid="drawer-output" style={{ margin: 0, background: "var(--c-bg)", border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, fontFamily: mono, fontSize: 11.5, whiteSpace: "pre-wrap", maxHeight: 180, overflowY: "auto" }}>{out ? JSON.stringify(out, null, 2) : "nothing written yet"}</pre></>}
        {show("cap") && bench && <div data-testid="node-bench">
          <div style={sec}>Benchmark</div>
          {bench.enough_runs
            ? <>{kv("success", `${Math.round(bench.stats.ok_rate * 100)}% of ${bench.stats.n} runs`, bench.stats.ok_rate < 0.7 ? "var(--c-bad)" : undefined)}{kv("retries", `${Math.round(bench.stats.retry_rate * 100)}%`)}{bench.kind === "llm" && kv("climbed to a stronger seat", `${Math.round(bench.stats.climb_rate * 100)}%`)}
                {kv("cost (median)", `${money(bench.stats.cost_median)} · ${Math.round(bench.cost_share * 100)}% of the team${bench.cost_rank ? ` · #${bench.cost_rank} by cost` : ""}`)}{kv("time (median)", `${(bench.stats.ms_median / 1000).toFixed(1)} s`)}{bench.cost_per_ok != null && kv("one good output costs", money(bench.cost_per_ok))}</>
            : <div data-testid="bench-few" style={{ fontSize: 12.5, color: C.muted }}>Too few runs to say ({bench.stats.n} of 5): no verdict yet.</div>}
          {bench.vs_previous_cfg && <div data-testid="bench-change" style={{ fontSize: 12.5, padding: "5px 0", color: bench.vs_previous_cfg.verdict === "worse" ? "var(--c-bad)" : bench.vs_previous_cfg.verdict === "better" ? "var(--c-ok)" : C.muted }}>Since it was changed: {bench.vs_previous_cfg.verdict} ({Math.round(bench.vs_previous_cfg.old.ok_rate * 100)}% over {bench.vs_previous_cfg.old.n} runs before, {Math.round(bench.vs_previous_cfg.new.ok_rate * 100)}% over {bench.vs_previous_cfg.new.n} since).</div>}
        </div>}
        {show("trail") && <>
        <div style={sec}>History</div>
        {history.length ? history.map((e) => <div key={e.id} style={{ display: "flex", gap: 8, fontSize: 12, padding: "3px 0" }}><span style={{ fontFamily: mono, color: e.kind === "failed" ? "var(--c-bad)" : C.muted, minWidth: 54 }}>{e.kind}</span><span>{e.text}</span></div>) : <div style={{ fontSize: 12, color: C.muted }}>no events yet</div>}
        </>}
        {show("brief") && n.node !== "leader" && !isRole && !isTool && <div style={{ marginTop: 12, fontFamily: mono, fontSize: 12, color: C.muted }}>{sublabel(n)}</div>}
        {show("trail") && run?.live && <div style={{ display: "flex", gap: 8, marginTop: 16 }}><button data-testid="drawer-pause" style={btn} onClick={() => void controlRun(run.id, "pause")}>Pause run</button><button data-testid="drawer-resume" style={btn} onClick={() => void controlRun(run.id, "resume")}>Resume</button></div>}
        {msg && <div data-testid="drawer-msg" style={{ marginTop: 10, fontSize: 12, color: msg.bad ? "var(--c-bad)" : "var(--c-ok)" }}>{msg.text}</div>}
      </div>
    ); if (only) return body; return (
    <aside data-testid="node-drawer" data-node={id} aria-label={`node ${id}`} style={{ position: "sticky", bottom: 0, width: "100%", boxSizing: "border-box", maxHeight: "min(62vh, 600px)", background: C.panel, borderTop: `1px solid ${C.border}`, borderRadius: "14px 14px 0 0", boxShadow: "none", overflowY: "auto", zIndex: 20, fontFamily: nav }}>
      <style>{".nd-body{columns:2 320px;column-gap:32px}.nd-body>*{break-inside:avoid}"}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.panel }}>
        {isRole ? <RoleBox role={(n as any).role} size={26} letter={letterOf(n)} face={faceOf(id, n)} state={st} /> : <span style={{ color: "#6ee7d8", display: "inline-flex" }}><Icon name={iconOf(n)} size={26} /></span>}
        <div style={{ minWidth: 0 }}><div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase" }}>{isRole ? ROLE_LABEL[(n as any).role as keyof typeof ROLE_LABEL] : isTool ? `useTool · ${(n as any).tool.type}` : n.node.replace("_", " ")}</div><div style={{ fontWeight: 600, fontSize: 14 }}>{titleOf(id, n)}</div>{n.why && <div data-testid="drawer-why" style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{n.why.kind.replace("_", " ")}{n.why.note ? ` · ${n.why.note}` : ""}</div>}</div>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 11, color: C.muted }}><Led state={st} />{st}</span>
        <button data-testid="drawer-close" aria-label="close" title="close" onClick={onClose} style={{ ...btn, padding: "3px 7px", display: "inline-flex", border: "none" }}><Icon name="x" size={15} /></button>
      </div>
      {body}
    </aside>); })()
  );
}

/** What a custom agent is for, in plain words: its one responsibility, brief, context, skills, tools and what it may do in the world. */
export const EFFECT_WORDS: Record<string, string> = { read: "reads only", network: "reads the web (search and pages); nothing is sent or posted", web: "searches and reads the web with its own tools", document: "writes documents that are kept with the run, never in your code", write: "writes the files it owns", outward: "posts, sends or publishes: only after you approve", money: "spends money: only after you approve", exec: "runs commands", destructive: "can destroy: only after you approve" };
export function AgentJob({ a }: { a: AgentSpec }) {
  return <div data-testid="agent-job">
    <div style={sec}>Its one job</div>
    <div style={{ fontSize: 13, lineHeight: 1.45 }}>{a.responsibility}</div>
    <div style={sec}>Its brief</div>
    <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.muted, whiteSpace: "pre-wrap" }}>{a.brief}</div>
    {kv("reads first", (a.context ?? []).join(", ") || "—")}{kv("skills", (a.skills ?? []).join(", ") || "none")}{kv("MCP tools", (a.mcp ?? []).join(", ") || "none")}
    <div style={{ ...sec, marginTop: 10 }}>What it may do</div>
    {(a.effects?.length ? a.effects : ["read"]).map((e) => <div key={e} style={{ fontSize: 12.5, padding: "2px 0", color: e === "outward" || e === "money" ? "#c9a34e" : C.fg }}>· {EFFECT_WORDS[e] ?? e}</div>)}
  </div>;
}
