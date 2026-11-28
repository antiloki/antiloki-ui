// THE TEAM BOARD, AS PURE FUNCTIONS (RFC 0008 §4.12, mockup boards 1 to 4): where each node sits, how the wires run, what state a node is in, what the loop frames enclose. No React, no fetch: tested alone.
import type { Edge, GNode, Graph, NodeBench, RoleKey, Run, RunRow } from "./types";

export const FAILURE_PORTS = ["failed", "error", "timeout", "cap", "budget", "human"] as const;
export const isFailPort = (p: string) => (FAILURE_PORTS as readonly string[]).includes(p);
export type Box = { x: number; y: number; w: number; h: number };
export const CHIP = { w: 132, h: 72 }, ICON = { w: 50, h: 50 }, TOOL = { w: 112, h: 60 }, COL_W = 176, ROW_H = 108, PAD = 24;
/** The sizes when every node is a CARD (the Cards look): an agent card, and a smaller card for a tool or a piece of control flow. */
export const CARD = { chip: { w: 212, h: 116 }, small: { w: 160, h: 50 }, col: 256, row: 138 };

export const ROLE_COLOR: Record<RoleKey | "leader" | "human", string> = { leader: "#ffd166", planner: "#c792ea", worker: "#52c7ff", qa: "#3ddc97", debugger: "#ff8f6b", audit: "#9fb3ff", agent: "#79b8a8", human: "#ffb547" };
export const ROLE_LABEL: Record<RoleKey | "leader", string> = { leader: "Leader", planner: "Planner", worker: "Worker", qa: "QA", debugger: "Debugger", audit: "Audit", agent: "Agent" };
/** What is printed on a role's chip, as on a real package, and the one letter a list row wears. */
export const ROLE_CODE: Record<RoleKey | "leader", string> = { leader: "LDR", planner: "PLN", worker: "WRK", qa: "QA", debugger: "DBG", audit: "AUD", agent: "AGT" };
export const ROLE_LETTER: Record<RoleKey | "leader", string> = { leader: "L", planner: "P", worker: "W", qa: "Q", debugger: "D", audit: "A", agent: "G" };

/** How a node is drawn: a chip (a role: an agent), an icon (control flow), a tool (a useTool node), or the leader's. */
export type Shape = "chip" | "icon" | "tool" | "leader";
export const shapeOf = (n: GNode): Shape => (n.node === "role" ? "chip" : n.node === "use_tool" ? "tool" : n.node === "leader" ? "leader" : "icon");
export const sizeOf = (n: GNode, cards = false): { w: number; h: number } => { const s = shapeOf(n); if (cards) return s === "chip" || s === "leader" ? CARD.chip : CARD.small; return s === "chip" || s === "leader" ? CHIP : s === "tool" ? TOOL : ICON; };
/** The icon a node wears (names the glyph set in `icons.tsx`). */
/** A DETERMINISTIC NODE (operator 2026-11-21: "all deterministic nodes should have a deterministic flag"): no model is called, so the same input gives the same output. Control flow, gates, checks, tests, code, transforms, artifacts, and a tool node that does not start a model. Mirrors `deterministic()` in the serve's team_graph.rs. Pure. */
export function isDeterministic(n: GNode): boolean {
  switch ((n as { node: string }).node) {
    case "if": case "switch": case "loop": case "for_each": case "timer": case "fork": case "join": case "retry": case "stop": case "budget_gate": case "human": case "check": case "artifact": case "deliver": case "test": case "contract": case "review": case "code": case "transform": return true;
    case "use_tool": return (n as any).starts_model !== true;
    default: return false;
  }
}
export function iconOf(n: GNode): string {
  switch (n.node) {
    case "leader": return "leader"; case "role": return n.role; case "if": return "ifelse"; case "switch": return "switch"; case "loop": return "loop"; case "for_each": return "foreach"; case "timer": return "timer";
    case "fork": return "fork"; case "join": return "join"; case "retry": return "fallback"; case "budget_gate": return "gauge"; case "human": return "hand"; case "deliver": return "deliver"; case "artifact": return "artifact"; case "check": return "check"; case "llm": return "model";
    case "use_tool": return n.tool.type === "pane" ? "pane" : n.tool.type === "web" ? "globe" : n.tool.type === "mcp" ? "plug" : n.tool.type === "source" ? "doc" : n.tool.type === "webapp" ? "globe" : n.tool.type === "db" ? "db" : n.tool.type === "file" ? "file" : n.tool.type === "saga" ? "saga" : "wrench";
    case "code": return "code"; case "transform": return "transform"; case "stop": return "stop"; case "sub_team": return "subteam";
  }
}
/** A node's words on the board: the label, else (for a custom agent) its title, else the id. */
export const titleOf = (id: string, n: GNode): string => (n.label && n.label.trim()) || (n.node === "role" && n.role === "agent" && n.agent?.title?.trim()) || id;
/** The code printed on a node's chip: the role's, or for a custom agent the first letters of its title. */
export const codeOf = (n: GNode): string => (n.node === "leader" ? "LDR" : n.node === "role" ? (n.role === "agent" ? ((n.agent?.title ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "AGT") : ROLE_CODE[n.role]) : "");
export const letterOf = (n: GNode): string => (n.node === "role" && n.role === "agent" ? ((n.agent?.title ?? "").trim().charAt(0).toUpperCase() || "G") : n.node === "leader" ? "L" : n.node === "role" ? ROLE_LETTER[n.role] : "");
/** Which of the six drawn characters a node wears in a theme: its role; a custom agent takes one by its id, the same one every time. */
export type FaceKey = "leader" | "planner" | "worker" | "qa" | "debugger" | "audit";
const FACES: FaceKey[] = ["worker", "planner", "qa", "debugger", "audit", "leader"];
export function faceOf(id: string, n: GNode): FaceKey { if (n.node === "leader") return "leader"; if (n.node !== "role") return "worker"; if (n.role !== "agent") return n.role; let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return FACES[h % 5]; }
/** The small line under a role's name: its model (or its tier's) and the tier. */
export function modelLine(n: GNode): string { return n.node === "role" ? `${n.model?.trim() || tierDefault(n.tier ?? defaultTier(n.role))} · ${n.tier ?? defaultTier(n.role)}` : ""; }
export const defaultTier = (r: RoleKey) => (r === "planner" ? "mid" : "low") as "low" | "mid";
const tierDefault = (t: string) => (t === "high" ? "strongest" : t === "mid" ? "sonnet-class" : "haiku-class");
/** What the Leader's chip says, from the run (operator 2026-11-12: "at the end the leader still shows running even though it finished"). The Leader is the person's terminal, so it is not a node that works: it WATCHES while a run goes, and is done when the run is. Pure. */
export function leaderOf(run: Run | null | undefined): { state: NodeState; word: string } {
  const st = run?.state?.status?.status;
  if (!run || !st || st === "idle") return { state: "idle", word: "idle" };
  if (st === "running") return run.live ? { state: "working", word: "watching" } : { state: "idle", word: "idle" };
  if (st === "paused") return { state: "waiting", word: "paused" };
  if (st === "done") return { state: "done", word: "done" };
  if (st === "blocked") return { state: "failed", word: "handed to you" };
  return { state: "idle", word: "stopped" };
}
export const money = (v: number | undefined | null) => { const x = v ?? 0; return `$${x > 0 && x < 0.01 ? x.toFixed(3) : x.toFixed(2)}`; };
/** What a control node says about itself on the board (the condition, the limit, the wait). */
export function sublabel(n: GNode): string {
  switch (n.node) {
    case "if": return n.cond; case "switch": return n.on; case "loop": return `≤ ${n.max_iterations}${n.until ? ` · until ${n.until}` : ""}`; case "for_each": return n.over;
    case "timer": return n.mode === "delay" ? `${n.seconds ?? 0}s` : n.mode === "timeout" ? `timeout ${n.seconds ?? 0}s` : `cron ${n.cron ?? ""}`;
    case "join": return n.policy === "quorum" ? `quorum ${n.quorum ?? 1}` : n.policy; case "retry": return `≤ ${n.max}${n.open_after ? ` · breaker ${n.open_after}` : ""}`;
    case "code": return `code · ${(n.examples ?? []).length} example${(n.examples ?? []).length === 1 ? "" : "s"}`; case "transform": return n.mode; case "stop": return n.message; case "sub_team": return `team ${n.team}`; case "budget_gate": return `stop at ${Math.round(n.stop_at * 100)}%`; case "human": return n.gate;
    case "use_tool": return `${n.tool.type} · ${n.tool.name}`; case "artifact": return `${n.name}.${n.format}`; case "check": return `${n.rules.length} rule${n.rules.length === 1 ? "" : "s"}`; case "llm": return n.preset ? `${n.preset.kind} · ${n.seat}` : n.seat; default: return "";
  }
}

const successors = (g: Graph, id: string, skipFail = false): string[] => g.edges.filter((e) => e.from === id && g.nodes[e.to] && (!skipFail || !isFailPort(e.port))).map((e) => e.to);
/** Where a run starts (the server's own rule): `start`, else the nodes nothing leads into (not the leader, not a timeout timer). */
export function entriesOf(g: Graph): string[] {
  if (g.start && g.start.length) return g.start.filter((s) => g.nodes[s]);
  const fed = new Set(g.edges.map((e) => e.to));
  return Object.keys(g.nodes).filter((k) => g.nodes[k].node !== "leader" && !fed.has(k) && !(g.nodes[k].node === "timer" && (g.nodes[k] as any).mode === "timeout"));
}
/** The nodes that go round with a loop: reachable from its body and able to come back to it. Pure. */
export function loopBody(g: Graph, loopId: string): string[] {
  const reach = (from: string[], stopAt: string): Set<string> => { const seen = new Set<string>(); const q = [...from]; while (q.length) { const n = q.pop()!; if (n === stopAt || seen.has(n)) continue; seen.add(n); for (const m of successors(g, n)) q.push(m); } return seen; };
  const down = reach(g.edges.filter((e) => e.from === loopId && (e.port === "body" || e.port === "again")).map((e) => e.to), loopId);
  return [...down].filter((n) => { const back = new Set<string>(); const q = [n]; while (q.length) { const x = q.pop()!; if (back.has(x)) continue; back.add(x); if (x === loopId) return true; for (const m of successors(g, x)) q.push(m); } return false; });
}

export type Layout = { boxes: Record<string, Box>; width: number; height: number; back: Set<string>; /** which band (line) of the board each node is on */ band: Record<string, number> };
/** The board's own layout: a column per step of the flow (back wires and failure wires do not push a node right), the leader on its own line below. A node the person moved keeps its `pos`. Pure. */
export function layoutGraph(g: Graph, maxCols = Infinity, cards = false): Layout {
  const COL_W_ = cards ? CARD.col : COL_W, ROW_H_ = cards ? CARD.row : ROW_H;
  const ids = Object.keys(g.nodes); const depth: Record<string, number> = {}; const order: string[] = []; const back = new Set<string>();
  const state: Record<string, 0 | 1 | 2> = {};   // 1 = on the stack, 2 = done
  const visit = (id: string, d: number) => {
    depth[id] = Math.max(depth[id] ?? 0, d); if (state[id] === 1) return; if (state[id] === 2 && (depth[id] ?? 0) > d) { /* already placed deeper */ }
    if (state[id] === 2) { for (const m of successors(g, id, true)) { const e = g.edges.find((x) => x.from === id && x.to === m)!; if (state[m] !== 1) propagate(m, depth[id] + 1); else back.add(`${e.from}|${e.port}|${e.to}`); } return; }
    state[id] = 1; order.push(id);
    for (const e of g.edges.filter((x) => x.from === id && g.nodes[x.to])) {
      if (isFailPort(e.port)) continue;
      if (state[e.to] === 1) { back.add(`${e.from}|${e.port}|${e.to}`); continue; }
      visit(e.to, depth[id] + 1);
    }
    state[id] = 2;
  };
  const propagate = (id: string, d: number) => { if ((depth[id] ?? 0) >= d || state[id] === 1) return; depth[id] = d; for (const m of successors(g, id, true)) propagate(m, d + 1); };
  const entries = entriesOf(g); for (const e of entries) visit(e, 0);
  for (const id of ids) { if (id === "leader" || g.nodes[id].node === "leader") continue; if (state[id] === undefined) visit(id, Math.max(0, ...g.edges.filter((e) => e.to === id && depth[e.from] !== undefined).map((e) => depth[e.from] + 1), 0)); }
  // failure wires into a node nothing else leads to: it sits one column right of its catcher
  const cols: Record<number, string[]> = {};
  for (const id of order) { if (g.nodes[id].node === "leader") continue; (cols[depth[id] ?? 0] ||= []).push(id); }
  const nCols = Math.max(0, ...Object.keys(cols).map(Number)) + 1; const perBand = Math.max(2, Math.min(maxCols, nCols)); const nBands = Math.ceil(nCols / perBand);
  // a board wider than its pane WRAPS INTO LINES (bands), never sideways: column c sits in band floor(c / perBand)
  const rowsOfBand = (b: number) => Math.max(1, ...Object.entries(cols).filter(([c]) => Math.floor(Number(c) / perBand) === b).map(([, l]) => l.length));
  const bandY: number[] = []; let yy = PAD; for (let b = 0; b < nBands; b++) { bandY.push(yy); yy += rowsOfBand(b) * ROW_H_ + (b < nBands - 1 ? 34 : 0); }
  const boxes: Record<string, Box> = {}; const band: Record<string, number> = {};
  for (const [c, list] of Object.entries(cols)) { const b = Math.floor(Number(c) / perBand), cc = Number(c) % perBand; const off = ((rowsOfBand(b) - list.length) * ROW_H_) / 2; list.forEach((id, i) => { const sz = sizeOf(g.nodes[id], cards); const cw = cards ? CARD.chip.w : CHIP.w, chh = cards ? CARD.chip.h : CHIP.h; const cx = PAD + cc * COL_W_ + cw / 2, cy = bandY[b] + off + i * ROW_H_ + chh / 2; boxes[id] = { x: cx - sz.w / 2, y: cy - sz.h / 2, w: sz.w, h: sz.h }; band[id] = b; }); }
  const maxRows = yy - PAD > 0 ? Math.round((yy - PAD) / ROW_H_) : 1;
  const lead = ids.find((k) => g.nodes[k].node === "leader");
  if (lead) { const s = sizeOf(g.nodes[lead], cards); boxes[lead] = { x: PAD, y: yy + 8, w: s.w, h: s.h }; band[lead] = nBands; }
  for (const id of ids) { const p = g.nodes[id].pos; if (p && boxes[id]) { boxes[id] = { ...boxes[id], x: p[0], y: p[1] }; } else if (p) { const s = sizeOf(g.nodes[id], cards); boxes[id] = { x: p[0], y: p[1], w: s.w, h: s.h }; } }
  const right = Math.max(...Object.values(boxes).map((b) => b.x + b.w), 0), bottom = Math.max(...Object.values(boxes).map((b) => b.y + b.h), 0);
  return { boxes, width: Math.max(right + PAD, perBand * COL_W_), height: bottom + PAD + 26, back, band };
}
/** The frame a loop draws round its body (padded), or null when the body is empty or not placed. */
export function loopFrames(g: Graph, l: Layout, loopId: string): Box[] {
  const members = loopBody(g, loopId).filter((m) => l.boxes[m]); if (!members.length) return [];
  const bands = [...new Set(members.map((m) => l.band[m]))].sort((a, b) => a - b);   // a loop that wraps onto another line is framed once per line
  return bands.map((bd) => { const xs = members.filter((m) => l.band[m] === bd).map((m) => l.boxes[m]); const x0 = Math.min(...xs.map((b) => b.x)) - 22, y0 = Math.min(...xs.map((b) => b.y)) - 30, x1 = Math.max(...xs.map((b) => b.x + b.w)) + 22, y1 = Math.max(...xs.map((b) => b.y + b.h)) + 20; return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; });
}
export const loopFrame = (g: Graph, l: Layout, loopId: string): Box | null => loopFrames(g, l, loopId)[0] ?? null;
/** A wire as an SVG path with right angles: out of the right of its source, into the left of its target; a wire that goes back (or down to a failure catcher) runs round underneath. `lane` keeps parallel wires apart. */
export function wirePath(from: Box, to: Box, backward: boolean, lane: number, floor: number): { d: string; label: { x: number; y: number } } {
  const x1 = from.x + from.w, y1 = from.y + from.h / 2, x2 = to.x, y2 = to.y + to.h / 2;
  if (!backward && x2 > x1 + 8) { const mx = x1 + Math.max(14, (x2 - x1) / 2 - lane * 6); return { d: `M${x1} ${y1} H${mx} V${y2} H${x2}`, label: { x: x1 + 6, y: y1 - 6 } }; }
  const yb = floor + 12 + lane * 11;   // round underneath everything
  return { d: `M${x1} ${y1} H${x1 + 14 + lane * 4} V${yb} H${x2 - 14 - lane * 4} V${y2} H${x2}`, label: { x: x1 + 18, y: yb - 4 } };
}
/** What a wire carries on the board: its port, unless it is the plain `out`. */
export const portLabel = (e: Edge) => (e.port === "out" ? "" : e.port);

export type NodeState = "idle" | "working" | "waiting" | "done" | "failed";
/** A node's state in a run: working or waiting (a human, a timer, a queued node) while it is active; failed when its latest event says so; done once it wrote its values. Pure. */
export function nodeState(g: Graph, run: Run | null, id: string): NodeState {
  if (!run) return "idle"; const n = g.nodes[id]; if (!n) return "idle";
  if (id in (run.state.active ?? {})) return n.node === "human" || n.node === "timer" ? "waiting" : "working";
  if ((run.state.queued ?? []).includes(id)) return "waiting";
  const last = (run.events ?? []).find((e) => e.actor === id && ["failed", "done", "answer", "timeout", "cap"].includes(e.kind));
  if (last && (last.kind === "failed" || last.kind === "timeout" || last.kind === "cap")) return "failed";
  if (id in (run.state.values ?? {}) || last) return "done";
  return "idle";
}
export type Counts = { working: number; waiting: number; done: number; failed: number };
export function counts(g: Graph, run: Run | null): Counts { const c = { working: 0, waiting: 0, done: 0, failed: 0 }; for (const id of Object.keys(g.nodes)) { if (g.nodes[id].node === "leader") continue; const s = nodeState(g, run, id); if (s === "working") c.working++; else if (s === "waiting") c.waiting++; else if (s === "done") c.done++; else if (s === "failed") c.failed++; } return c; }
/** The nodes in the order the flow meets them (the collapsed strip's order). */
export function flowOrder(g: Graph): string[] { const l = layoutGraph(g); return Object.keys(l.boxes).sort((a, b) => l.boxes[a].x - l.boxes[b].x || l.boxes[a].y - l.boxes[b].y); }
/** The loop a pass counter belongs to: how far through its limit the run is. */
export function loopProgress(run: Run | null, id: string): { n: number; max: number } | null { const v = run?.state.values?.[id]; return v && typeof v.count === "number" ? { n: v.count, max: v.max ?? 0 } : null; }
export const statusWords = (s: { status: string; why?: string } | undefined): string => !s ? "not started" : s.status === "blocked" ? `handed to you: ${s.why ?? ""}` : s.status === "running" ? "running" : s.status === "paused" ? "paused" : s.status === "done" ? "delivered" : s.status === "stopped" ? "stopped" : "not started";
/** The first human node a run is parked at, if any. */
export function parkedAt(g: Graph, run: Run | null): string | null { if (!run) return null; for (const id of Object.keys(run.state.active ?? {})) if (g.nodes[id]?.node === "human" || (g.nodes[id] && run.park_info?.[id] === "permission")) return id; return null; }

/** The values a node writes into the run state (the server's own table), by name and type: what a condition may read. Pure. */
export function writesOf(n: GNode): { field: string; type: string }[] {
  const t = (field: string, type: string) => ({ field, type });
  switch (n.node) {
    case "role": return n.role === "planner" ? [t("plan", "object"), t("sagas", "list"), t("criteria", "list")] : n.role === "worker" ? [t("done", "bool"), t("files", "list")] : n.role === "qa" ? [t("pass", "bool"), t("failed", "list"), t("evidence", "list")] : n.role === "debugger" ? [t("patched", "bool"), t("files", "list")] : n.role === "agent" ? [t("done", "bool"), t("pass", "bool"), t("report", "string"), t("files", "list")] : [t("verdict", "enum"), t("flags", "list")];
    case "use_tool": return [t("ok", "bool"), ...Object.entries(n.outputs ?? {}).filter(([k]) => k !== "ok").map(([k, v]) => t(k, v))];
    case "artifact": return [t("ok", "bool"), t("name", "string"), t("path", "string"), t("format", "string")];
    case "check": return [t("ok", "bool"), t("pass", "bool"), t("failed", "list"), t("passed", "list"), t("score", "number")];
    case "llm": return [t("ok", "bool"), t("seat_used", "string"), t("escalated_from", "string"), ...Object.entries(n.answer ?? {}).map(([k, v]) => t(k, typeof v === "string" ? v.replace("?", "") : "enum"))];
    case "human": return [t("approved", "bool")]; case "loop": return [t("count", "int"), t("max", "int")]; case "for_each": return [t("item", "object"), t("index", "int"), t("count", "int")];
    case "code": case "transform": return [t("ok", "bool"), t("output", "object")];
    case "sub_team": return [t("ok", "bool"), t("child_run", "string"), t("team", "string"), t("outputs", "object")];
    case "stop": return [];
    default: return [];
  }
}
/** Is this the same team? The nodes and the wires, not where the editor drew them or what branch it sits on. A run keeps the team it STARTED with; the saved team may have been rewritten since (by the Leader, say). Pure. */
export function sameTeam(a: Graph | null | undefined, b: Graph | null | undefined): boolean {
  if (!a || !b) return a === b;
  const flat = (g: Graph) => JSON.stringify({ budget: g.budget_usd, start: g.start ?? [], nodes: Object.fromEntries(Object.entries(g.nodes ?? {}).sort(([x], [y]) => (x < y ? -1 : 1)).map(([id, n]) => { const { pos: _pos, ...rest } = n as any; return [id, rest]; })), edges: [...(g.edges ?? [])].map((e) => `${e.from}.${e.port}>${e.to}`).sort() });
  return flat(a) === flat(b);
}
/** Every value a condition could read in this graph: `node.field` for the nodes that write one, then the run's own (budget, time). */
export function operandsOf(g: Graph): { name: string; type: string }[] {
  const out: { name: string; type: string }[] = []; for (const [id, n] of Object.entries(g.nodes)) for (const w of writesOf(n)) out.push({ name: `${id}.${w.field}`, type: w.type });
  return [...out, { name: "budget.left", type: "number" }, { name: "budget.spent", type: "usd" }, { name: "elapsed", type: "seconds" }];
}
/** A short id for a new node of a kind: `worker`, then `worker2`, `worker3`. Pure. */
export function freshId(g: Graph, base: string): string { const b = base.replace(/^tool_/, "").replace(/[^a-z0-9_]/g, "_"); if (!g.nodes[b]) return b; let i = 2; while (g.nodes[`${b}${i}`]) i++; return `${b}${i}`; }
/** The graph with a wire set: a port holds one wire (except a fork's branches), so a new wire from the same port replaces the old. Pure. */
export function withWire(g: Graph, from: string, port: string, to: string): Graph {
  const keep = g.edges.filter((e) => !(e.from === from && e.port === port && port !== "branch") && !(e.from === from && e.port === port && e.to === to));
  return { ...g, edges: [...keep, { from, port, to }] };
}
/** Put a new node on the line after `after`: what `after` handed to its next step on its main port now goes through the new node, which hands it on by `port`. A node with nothing after it just gets the new one wired to it. Pure. */
export function insertAfter(g: Graph, after: string, id: string, node: GNode, port = "out"): Graph {
  const main = g.edges.find((e) => e.from === after && !isFailPort(e.port) && e.port !== "branch"); const edges = g.edges.filter((e) => e !== main);
  const out = [...edges, { from: after, port: main?.port ?? "out", to: id }]; if (main) out.push({ from: id, port, to: main.to });
  return { ...g, nodes: { ...g.nodes, [id]: node }, edges: out };
}
export function withoutNode(g: Graph, id: string): Graph { const nodes = { ...g.nodes }; delete nodes[id]; return { ...g, nodes, edges: g.edges.filter((e) => e.from !== id && e.to !== id), start: (g.start ?? []).filter((s) => s !== id) }; }
/** What differs between two graphs, in a line each (for the banner that says the Leader changed the design). Pure. */
export function diffLines(a: Graph, b: Graph): string[] {
  const out: string[] = []; for (const k of Object.keys(b.nodes)) { if (!a.nodes[k]) out.push(`+ node ${k}`); else if (JSON.stringify(a.nodes[k]) !== JSON.stringify(b.nodes[k])) out.push(`~ node ${k}`); } for (const k of Object.keys(a.nodes)) if (!b.nodes[k]) out.push(`- node ${k}`);
  const key = (e: Edge) => `${e.from}.${e.port} → ${e.to}`; const ka = new Set(a.edges.map(key)), kb = new Set(b.edges.map(key)); for (const k of kb) if (!ka.has(k)) out.push(`+ wire ${k}`); for (const k of ka) if (!kb.has(k)) out.push(`- wire ${k}`);
  if (a.budget_usd !== b.budget_usd) out.push(`~ budget $${a.budget_usd} → $${b.budget_usd}`); return out;
}

/** One node's bar in a run's waterfall: when it began and ended (ms since the run started), what it cost, how it ended; a loop or for-each is the PARENT of the steps of its body. */
export type WaterKind = "agent" | "llm" | "tool" | "control" | "human" | "other";
export type WaterRow = { id: string; kind: WaterKind; icon: string; title: string; sub: string; start: number; end: number; ms: number; cost: number; state: "done" | "failed" | "working" | "ran"; slowest: boolean; dearest: boolean; parent: string | null; depth: number; children: number };
export type Water = { total_ms: number; total_cost: number; rows: WaterRow[]; stats: { steps: number; model_calls: number; tool_calls: number; errors: number } };
/** What colour family a node's bar belongs to: agents (roles), model calls (llm), tools, control flow, the person. Pure. */
export function waterKindOf(n: GNode): WaterKind { return n.node === "role" ? "agent" : n.node === "llm" ? "llm" : n.node === "use_tool" || n.node === "code" || n.node === "transform" || n.node === "check" || n.node === "sub_team" ? "tool" : n.node === "human" ? "human" : ["if", "switch", "loop", "for_each", "fork", "join", "retry", "timer", "stop"].includes(n.node) ? "control" : "other"; }
/** Round time-axis ticks for a run of `total_ms`: about four, at 1, 2, 5 times a power of ten of seconds. Pure. */
export function axisTicks(total_ms: number): number[] {
  if (total_ms <= 0) return [0]; const target = total_ms / 4; const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600].map((s) => s * 1000); const step = steps.find((s) => s >= target) ?? steps[steps.length - 1];
  const out: number[] = []; for (let t = 0; t <= total_ms; t += step) out.push(t); return out;
}
/** A short second line for a node: the seat/model of a call, the tool of a tool node, the tier of an agent. Pure. */
export function waterSub(n: GNode): string {
  if (n.node === "llm") return String((n as any).seat ?? "").replace(/^claude-code:/, "").slice(0, 28);
  if (n.node === "use_tool") return `${(n as any).tool?.type ?? ""} ${(n as any).tool?.name ?? ""}`.trim().slice(0, 28);
  if (n.node === "role") return n.role === "agent" ? "agent" : n.role;
  if (n.node === "code" || n.node === "transform" || n.node === "check") return n.node;
  return "";
}
/** A run as a waterfall (RFC 0010 §4.20; the operator's wish 2026-11-15: ONE waterfall for time and cost): from the trace events (first and last of each node) and the run's per-node cost. A node still working ends at "now"; a loop or for-each
 *  is the parent of the steps of its body and spans them. Pure. */
export function waterfallOf(run: { graph: Graph; state: { started_ms: number; now_ms: number; active: Record<string, number>; node_cost: Record<string, number> }; events: { t_ms: number; actor: string; kind: string }[] }): Water {
  const t0 = run.state.started_ms; const now = Math.max(run.state.now_ms, t0);
  const by = new Map<string, { first: number; last: number; kinds: Set<string> }>();
  for (const e of run.events) { if (!e.actor || e.actor === "team" || !run.graph.nodes[e.actor]) continue; const x = by.get(e.actor) ?? { first: e.t_ms, last: e.t_ms, kinds: new Set<string>() }; x.first = Math.min(x.first, e.t_ms); x.last = Math.max(x.last, e.t_ms); x.kinds.add(e.kind); by.set(e.actor, x); }
  for (const id of Object.keys(run.state.active ?? {})) if (run.graph.nodes[id] && !by.has(id)) by.set(id, { first: run.state.active[id], last: now, kinds: new Set(["start"]) });
  const rows: WaterRow[] = [...by.entries()].map(([id, x]) => {
    const n = run.graph.nodes[id]; const working = id in (run.state.active ?? {}); const start = Math.max(0, x.first - t0); const end = Math.max(start, (working ? now : x.last) - t0);
    const failed = ["failed", "timeout", "cap", "budget"].some((k) => x.kinds.has(k)); const done = x.kinds.has("done");
    return { id, kind: waterKindOf(n), icon: iconOf(n), title: titleOf(id, n), sub: waterSub(n), start, end, ms: end - start, cost: run.state.node_cost?.[id] ?? 0, state: (working ? "working" : failed ? "failed" : done ? "done" : "ran") as WaterRow["state"], slowest: false, dearest: false, parent: null, depth: 0, children: 0 };
  }).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  // a loop or for-each is the parent of the steps of its body, and spans them (and their cost)
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  for (const r of rows) { const n = run.graph.nodes[r.id]; if (n.node !== "loop" && n.node !== "for_each") continue;
    const kids = loopBody(run.graph, r.id).map((k) => byId.get(k)).filter((k): k is WaterRow => !!k && !k.parent && k.id !== r.id);
    for (const k of kids) { k.parent = r.id; k.depth = 1; r.start = Math.min(r.start, k.start); r.end = Math.max(r.end, k.end); }
    r.children = kids.length; r.ms = r.end - r.start; }   // a parent shows the whole of its span; its cost stays its own (the children carry theirs), so nothing is counted twice
  // top level in time order, each parent followed by its children
  const top = rows.filter((r) => !r.parent); const ordered: WaterRow[] = []; for (const r of top) { ordered.push(r); ordered.push(...rows.filter((k) => k.parent === r.id)); }
  const leaves = ordered.filter((r) => r.children === 0);
  const maxMs = Math.max(0, ...leaves.map((r) => r.ms)); const maxCost = Math.max(0, ...ordered.map((r) => r.cost));
  for (const r of ordered) { r.slowest = r.children === 0 && maxMs > 0 && r.ms === maxMs && leaves.length > 1; r.dearest = maxCost > 0 && r.cost === maxCost && ordered.length > 1; }
  const kindCount = (k: WaterKind[]) => ordered.filter((r) => k.includes(r.kind)).length;
  return { total_ms: Math.max(0, ...ordered.map((r) => r.end)), total_cost: ordered.reduce((a, r) => a + r.cost, 0), rows: ordered, stats: { steps: ordered.length, model_calls: kindCount(["agent", "llm"]), tool_calls: kindCount(["tool"]), errors: ordered.filter((r) => r.state === "failed").length } };
}
/** 0.4 s · 12 s · 3 min 5 s · 2 h 10 min. Pure. */
export function spanWords(ms: number): string { if (ms < 950) return `${Math.max(0, Math.round(ms / 100) / 10)} s`; const s = Math.round(ms / 1000); if (s < 60) return `${s} s`; const m = Math.floor(s / 60); if (m < 60) return `${m} min${s % 60 ? ` ${s % 60} s` : ""}`; return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`; }

/** RUNNING NOW (AffectUI's idea, the operator's yes): the runs that are going or waiting for the person, over every team: how many, how many need you, newest first. `live` is the serve's list of runs it is driving. Pure. */
export type NowRow = { id: string; team: string; ask: string; waiting: boolean; paused: boolean; spent_usd: number; since_ms: number };
export function runningNow(runs: RunRow[], live: string[]): { rows: NowRow[]; running: number; needs_you: number; label: string } {
  const on = new Set(live); const rows = runs.filter((r) => on.has(r.id) && (r.status.status === "running" || r.status.status === "paused"))
    .map((r) => ({ id: r.id, team: r.team, ask: r.ask, waiting: !!r.needs_you, paused: r.status.status === "paused", spent_usd: r.spent_usd, since_ms: r.started_ms })).sort((a, b) => Number(b.waiting) - Number(a.waiting) || b.since_ms - a.since_ms);
  const needs = rows.filter((r) => r.waiting).length;
  return { rows, running: rows.length, needs_you: needs, label: rows.length === 0 ? "" : `${rows.length} running${needs ? ` · ${needs} need${needs === 1 ? "s" : ""} you` : ""}` };
}

/** The last `hours` hours as buckets of what happened (a run starting or ending counts one each), oldest first, with the peak. Pure. */
export function hourBuckets(runs: { started_ms: number; ended_ms: number; kind: string }[], now_ms: number, hours = 24): { counts: number[]; peak: number; peak_at: number } {
  const counts = new Array<number>(hours).fill(0); const H = 3_600_000; const first = now_ms - hours * H;
  const put = (t: number) => { if (t < first || t > now_ms) return; counts[Math.min(hours - 1, Math.floor((t - first) / H))] += 1; };
  for (const r of runs) { put(r.started_ms); if (r.kind !== "running") put(r.ended_ms); }
  const peak = Math.max(0, ...counts); return { counts, peak, peak_at: peak ? counts.indexOf(peak) : -1 };
}
/** "3 min ago", "2 h ago", "yesterday": how long ago, in the words a person says. Pure. */
export function agoWords(ms: number, now_ms: number): string { const d = Math.max(0, now_ms - ms); const m = Math.round(d / 60_000); if (m < 1) return "just now"; if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 24) return `${h} h ago`; const days = Math.round(h / 24); return days === 1 ? "yesterday" : `${days} days ago`; }

// ── THE NODE CARD (the operator 2026-11-15: cards like AffectUI's Agent Crew, for every kind of node) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** What a card says a node is doing, in one short line: its last word while it works, what it waits for, how it ended, else what it is for. Pure. */
export function cardLine(id: string, n: GNode, st: NodeState, run: Run | null): string {
  const last = (run?.events ?? []).find((e) => e.actor === id && e.text);
  const own = n.node === "role" && n.role === "agent" ? n.agent?.responsibility?.trim() : "";
  if (st === "working") return (last?.text ?? "").trim().slice(0, 70) || "Working";
  if (st === "waiting") return n.node === "human" ? "Waiting for you" : n.node === "timer" ? "Waiting for its time" : "Waiting its turn";
  if (st === "failed") return (last?.text ?? "").trim().slice(0, 70) || "Failed";
  if (st === "done") return (last?.text ?? "").trim().slice(0, 70) || "Done";
  return own ? own.slice(0, 70) : n.node === "role" ? "Waiting for work" : "";
}
/** The tools an agent may use, as card badges: an icon each, at most four and how many more. Pure. */
export function cardTools(n: GNode): { icons: string[]; more: number } {
  if (n.node !== "role" || n.role !== "agent" || !n.agent) return { icons: [], more: 0 };
  const a: any = n.agent; const all: string[] = [];
  for (const e of a.effects ?? []) { const i = e === "web" ? "globe" : e === "document" ? "doc" : e === "write" ? "code" : e === "outward" ? "deliver" : e === "money" ? "gauge" : ""; if (i && !all.includes(i)) all.push(i); }
  if ((a.mcp ?? []).length) all.push("plug"); if ((a.skills ?? []).length) all.push("wrench");
  return { icons: all.slice(0, 4), more: Math.max(0, all.length - 4) };
}
/** A node's spend against its cap, for the card's bar: the share (0..1) and the words. No cap: no bar, just the spend. Pure. */
export function cardSpend(n: GNode, spent: number | undefined): { share: number | null; words: string } {
  const s = spent ?? 0; const cap = n.cap_usd ?? null; return { share: cap && cap > 0 ? Math.min(1, s / cap) : null, words: cap && cap > 0 ? `${money(s)} / ${money(cap)}` : s > 0 ? money(s) : "" };
}

// ── THE LIVE STRIP OF A NODE (the operator 2026-11-15: not a theme, the CONTENT inside a node: in every look, small tool icons and two short lines of what runs now, animated) ───────────────────────────────────────────────────
/** The icon of a tool an agent started: reading, searching, running a command, editing, the web, an MCP tool, a sub-agent. Pure. */
export function toolIcon(tool: string): string {
  const t = tool.toLowerCase(); if (t.startsWith("mcp__")) return "plug";
  if (["read", "notebookread"].includes(t)) return "doc"; if (["grep", "glob", "ls", "find"].includes(t)) return "search"; if (["bash", "shell", "exec"].includes(t)) return "term";
  if (["edit", "write", "multiedit", "notebookedit", "apply_patch"].includes(t)) return "code"; if (t.startsWith("web")) return "globe"; if (["task", "agent"].includes(t)) return "agent"; return "wrench";
}
/** A tool and its target as one short phrase: `Read · src/a.rs`, a long path cut from the left so the file name stays. Pure. */
export function toolPhrase(u: { tool: string; target: string }, max = 34): string {
  const raw = (u.target ?? "").trim(); if (!raw) return u.tool;
  // a command reads from its start (its first line, cut at the right); a path or an address keeps its end (cut at the left) so the file name stays
  if (/^(bash|shell|exec|sh)$/i.test(u.tool)) { const line = (raw.split("\n").find((l) => l.trim()) ?? "").replace(/\s+/g, " ").trim(); return `${u.tool} · ${line.length > max ? `${line.slice(0, max - 1)}…` : line}`; }
  const t = raw.replace(/\s+/g, " "); const cut = t.length > max ? `…${t.slice(t.length - (max - 1))}` : t; return `${u.tool} · ${cut}`;
}
/** What a node's live strip shows: its icons (the distinct tools it used, newest first, at most four), the line for what it does now, the line for what it did before, and a key that changes when the news does. Pure. */
export function liveOf(id: string, n: GNode, st: NodeState, run: Run | null): { icons: string[]; active: string | null; now: string; before: string; key: string; shown: boolean } {
  const used = run?.tools_live?.[id] ?? []; const icons: string[] = []; for (const u of used) { const i = toolIcon(u.tool); if (!icons.includes(i)) icons.push(i); }
  const working = st === "working"; const now = working ? (used[0] ? toolPhrase(used[0]) : cardLine(id, n, st, run)) : st === "waiting" ? cardLine(id, n, st, run) : st === "failed" ? cardLine(id, n, st, run) : st === "done" ? (used.length ? `${used.length} tool${used.length === 1 ? "" : "s"} used` : cardLine(id, n, st, run)) : "";
  const before = working ? (used[1] ? toolPhrase(used[1]) : "") : st === "done" && used[0] ? toolPhrase(used[0]) : "";
  const shown = !!run && st !== "idle" && n.node !== "leader" && (!!now || icons.length > 0);
  return { icons: icons.slice(0, 4), active: working && used[0] ? toolIcon(used[0].tool) : null, now, before, key: `${st}|${used[0]?.t_ms ?? ""}|${now}`, shown };
}

// ── THE BATCH OF 2026-11-15 (AffectUI review): ledger, context map and window, team chat, sequence, a node's steps ────────────────────────────────────────────────────────────────────────────────────────────────────
/** A tool's own cache is not work: a path with a hidden folder in it (`.hyperframes/…`), or node_modules. Pure. */
export const isToolCache = (p: string): boolean => p.split("/").some((seg) => (seg.startsWith(".") && seg.length > 1 && ![".github", ".gitignore", ".env.example"].includes(seg)) || seg === "node_modules");
const nameList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : typeof (x as any)?.name === "string" ? (x as any).name : "")).filter((n) => !!n && !isToolCache(n)) : []);
/** THE LEDGER of a run: what each step changed outside its own words: the files a worker or debugger touched, what was put back (outside its scope), the documents it made, and what it cost. Newest first. Pure. */
export type LedgerRow = { node: string; title: string; files: string[]; put_back: string[]; artifacts: string[]; cost: number; at_ms: number; failed: boolean; /** the net lines the step added and removed, when the serve counted them */ lines?: { added: number; removed: number } };
export function ledgerOf(run: Run): { rows: LedgerRow[]; files: number; put_back: number } {
  const g = run.graph; const rows: LedgerRow[] = [];
  for (const [id, v] of Object.entries(run.state.values ?? {})) { const n = g.nodes[id]; if (!n || typeof v !== "object" || !v) continue; const files = nameList((v as any).files), put_back = nameList((v as any).put_back), artifacts = nameList((v as any).artifacts); if (!files.length && !put_back.length && !artifacts.length) continue;
    const evs = (run.events ?? []).filter((e) => e.actor === id); rows.push({ node: id, title: titleOf(id, n), files, put_back, artifacts, lines: typeof (v as any).lines?.added === "number" ? { added: (v as any).lines.added, removed: Number((v as any).lines.removed) || 0 } : undefined, cost: run.state.node_cost?.[id] ?? 0, at_ms: evs.length ? Math.max(...evs.map((e) => e.t_ms)) : run.state.started_ms, failed: evs.some((e) => ["failed", "timeout", "cap", "budget"].includes(e.kind)) }); }
  rows.sort((a, b) => b.at_ms - a.at_ms);
  return { rows, files: rows.reduce((a, r) => a + r.files.length, 0), put_back: rows.reduce((a, r) => a + r.put_back.length, 0) };
}
/** WHAT FILLS A RUN'S CONTEXT: what each step wrote into the run, sized in rough tokens (a token is about four characters), who reads it and who it reads from. Pure; the sizes are estimates and say so. */
export type CtxItem = { id: string; title: string; kind: WaterKind; tokens: number; readers: string[]; reads: string[] };
export function contextOf(run: Run): { items: CtxItem[]; total: number } {
  const g = run.graph; const items: CtxItem[] = [];
  for (const [id, v] of Object.entries(run.state.values ?? {})) { const n = g.nodes[id]; if (!n) continue; const tokens = Math.max(1, Math.round(JSON.stringify(v ?? "").length / 4)); items.push({ id, title: titleOf(id, n), kind: waterKindOf(n), tokens, readers: [...new Set(g.edges.filter((e) => e.from === id).map((e) => e.to))], reads: [...new Set(g.edges.filter((e) => e.to === id).map((e) => e.from))] }); }
  items.sort((a, b) => b.tokens - a.tokens); return { items, total: items.reduce((a, i) => a + i.tokens, 0) };
}
/** One step's context window: its brief (estimated) plus what the steps before it wrote, against the window of its model. Pure; an estimate. */
export function windowOf(run: Run, id: string, limit = 200_000): { used: number; limit: number; share: number; parts: { id: string; tokens: number }[] } {
  const c = contextOf(run); const parts = c.items.filter((i) => i.readers.includes(id)).map((i) => ({ id: i.id, tokens: i.tokens })); const used = 800 + parts.reduce((a, p) => a + p.tokens, 0); return { used, limit, share: Math.min(1, used / limit), parts };
}
/** A slice-and-dice treemap: the weights laid out in a w by h box, the heaviest first, splitting the list in two halves by weight and alternating the direction. Pure; the boxes tile the box exactly. */
export function treemap(items: { id: string; weight: number }[], w: number, h: number): { id: string; x: number; y: number; w: number; h: number }[] {
  const list = items.filter((i) => i.weight > 0).sort((a, b) => b.weight - a.weight);
  const go = (xs: typeof list, x: number, y: number, bw: number, bh: number, vertical: boolean): { id: string; x: number; y: number; w: number; h: number }[] => {
    if (!xs.length) return []; if (xs.length === 1) return [{ id: xs[0].id, x, y, w: bw, h: bh }];
    const total = xs.reduce((a, i) => a + i.weight, 0); let acc = 0; let cut = 1; for (let i = 0; i < xs.length - 1; i++) { acc += xs[i].weight; cut = i + 1; if (acc >= total / 2) break; }
    const first = xs.slice(0, cut), rest = xs.slice(cut); const share = first.reduce((a, i) => a + i.weight, 0) / total;
    return vertical ? [...go(first, x, y, bw * share, bh, !vertical), ...go(rest, x + bw * share, y, bw * (1 - share), bh, !vertical)] : [...go(first, x, y, bw, bh * share, !vertical), ...go(rest, x, y + bh * share, bw, bh * (1 - share), !vertical)];
  };
  return go(list, 0, 0, w, h, w >= h);
}
/** THE TEAM AS A CHAT (read-only): every event of the run as a message from a step to the steps that follow it, oldest first; a finished step hands over, a human gate asks, a failure says so. Pure. */
export type ChatMsg = { id: number; t_ms: number; from: string; from_title: string; to: string[]; kind: "handoff" | "question" | "failed" | "answer" | "start" | "note"; text: string };
/** A message's words: for a finished step the report alone (the engine sends `done=…, report=…, said=…`), once, on one line, cut where a bubble stays readable. Pure. */
export function chatText(raw: string, kind: string, max = 600): string {
  let t = raw.replace(/, said=[\s\S]*$/, "").replace(/\s+/g, " ").trim();
  const rep = t.match(/\breport=([\s\S]*?)\)?$/); if (kind === "handoff" && rep && rep[1].trim()) t = rep[1].trim(); else t = t.replace(/^\S+ finished \(([\s\S]*)\)$/, "$1");
  if (!t) return kind === "handoff" ? "done" : kind; return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
export function chatOf(run: Run): ChatMsg[] {
  const g = run.graph; const out: ChatMsg[] = [];
  for (const e of [...(run.events ?? [])].sort((a, b) => a.id - b.id)) {
    const n = g.nodes[e.actor]; if (!n) continue; const to = [...new Set(g.edges.filter((x) => x.from === e.actor).map((x) => x.to))].filter((t) => g.nodes[t] && g.nodes[t].node !== "leader");
    const kind: ChatMsg["kind"] = e.kind === "human" ? "question" : e.kind === "answer" ? "answer" : ["failed", "timeout", "cap", "budget"].includes(e.kind) ? "failed" : e.kind === "done" ? "handoff" : e.kind === "start" ? "start" : "note";
    out.push({ id: e.id, t_ms: e.t_ms, from: e.actor, from_title: titleOf(e.actor, n), to: kind === "handoff" ? to : [], kind, text: chatText(e.text ?? "", kind) });
  }
  return out;
}
/** THE RUN AS A SEQUENCE DIAGRAM: the lifelines (the steps that took part, in the order they first spoke, with the person when they were asked) and the arrows between them, in time order. Pure. */
export type Seq = { lanes: { id: string; title: string }[]; arrows: { id: number; from: number; to: number; label: string; kind: ChatMsg["kind"]; t_ms: number }[] };
export function sequenceOf(run: Run): Seq {
  const msgs = chatOf(run); const lanes: { id: string; title: string }[] = []; const at = (id: string, title: string) => { let i = lanes.findIndex((l) => l.id === id); if (i < 0) { lanes.push({ id, title }); i = lanes.length - 1; } return i; };
  const arrows: Seq["arrows"] = [];
  for (const m of msgs) { if (m.kind === "handoff") for (const t of m.to) { const tn = run.graph.nodes[t]; arrows.push({ id: m.id, from: at(m.from, m.from_title), to: at(t, titleOf(t, tn)), label: m.text.slice(0, 40), kind: m.kind, t_ms: m.t_ms }); }
    else if (m.kind === "question") arrows.push({ id: m.id, from: at(m.from, m.from_title), to: at("person", "You"), label: "needs you", kind: m.kind, t_ms: m.t_ms });
    else if (m.kind === "answer") arrows.push({ id: m.id, from: at("person", "You"), to: at(m.from, m.from_title), label: m.text.slice(0, 40), kind: m.kind, t_ms: m.t_ms });
    else if (m.kind === "failed") arrows.push({ id: m.id, from: at(m.from, m.from_title), to: at(m.from, m.from_title), label: m.text.slice(0, 40), kind: m.kind, t_ms: m.t_ms }); }
  return { lanes, arrows };
}
/** The last tool uses of a node as the steps list of its card: icon, phrase and how long ago, newest first. Pure. */
export function stepsOf(id: string, run: Run | null, now_ms: number, max = 6): { icon: string; text: string; ago: string }[] {
  return (run?.tools_live?.[id] ?? []).slice(0, max).map((u) => ({ icon: toolIcon(u.tool), text: toolPhrase(u, 40), ago: agoWords(u.t_ms, now_ms) }));
}

/** THE DETERMINISTIC SUMMARY OF ONE RUN (the operator 2026-11-15: "recap should be a consolidation of each run, deterministic plus an AI summary"): what happened, in sentences made only from what the run recorded. Pure. */
export type RunDigest = { status: string; steps: number; failed: number; ms: number; cost: number; files: string[]; tools: number; asked: number; lines: string[]; evidence: string };
export function runDigest(run: Run): RunDigest {
  const st = run.state.status; const c = counts(run.graph, run); const files = ledgerOf(run).rows.flatMap((r) => r.files); const tools = Object.values(run.tools_live ?? {}).reduce((a, l) => a + l.length, 0);
  const ends = (run.events ?? []).map((e) => e.t_ms); const ms = Math.max(0, (ends.length ? Math.max(...ends) : run.state.now_ms) - run.state.started_ms); const asked = (run.events ?? []).filter((e) => e.kind === "human").length; const cost = run.state.spent_usd ?? 0;
  const steps = Object.keys(run.state.values ?? {}).length; const lines: string[] = [];
  lines.push(st.status === "done" ? `Finished in ${spanWords(ms)} for ${money(cost)}.` : st.status === "blocked" ? `Stopped and handed to you${st.why ? `: ${st.why}` : ""}. ${spanWords(ms)} in, ${money(cost)} spent.` : st.status === "stopped" ? `Stopped by hand after ${spanWords(ms)}, ${money(cost)} spent.` : `Still ${st.status} after ${spanWords(ms)}, ${money(cost)} spent.`);
  lines.push(`${steps} step${steps === 1 ? "" : "s"} wrote a result${c.failed ? `, ${c.failed} failed` : ", none failed"}${tools ? `; ${tools} tool call${tools === 1 ? "" : "s"}` : ""}.`);
  if (files.length) lines.push(`Changed ${files.length} file${files.length === 1 ? "" : "s"}: ${files.slice(0, 4).join(", ")}${files.length > 4 ? `, and ${files.length - 4} more` : ""}.`);
  if (asked) lines.push(`Asked you ${asked} time${asked === 1 ? "" : "s"}.`);
  const said = Object.entries(run.state.values ?? {}).map(([id, v]) => { const t = typeof v === "object" && v ? String((v as any).report ?? (v as any).said ?? "") : ""; return t ? `${titleOf(id, run.graph.nodes[id] ?? ({ node: "stop" } as any))}: ${t.replace(/\s+/g, " ").slice(0, 300)}` : ""; }).filter(Boolean).join("\n");
  return { status: st.status, steps, failed: c.failed, ms, cost, files, tools, asked, lines, evidence: said };
}

/** PLAN AND ACTUAL (the operator 2026-11-14: "store the estimate and the actual"): for each step, what it usually takes and costs (the median of its earlier runs, from the team's own records) next to what this run took and cost, with the difference. A step with fewer than two runs on record has no usual yet; a human step's waiting is not work, so it has none. Pure. */
export type PlanRow = { id: string; title: string; icon: string; kind: WaterKind; n: number; usual_ms: number | null; ms: number; usual_cost: number | null; cost: number; d_ms: number | null; d_cost: number | null };
export function planVsActual(water: Water, bench: NodeBench[]): { rows: PlanRow[]; usual_ms: number; usual_cost: number; ms: number; cost: number; known: number } {
  const by = new Map(bench.map((b) => [b.node, b] as const)); const delta = (a: number, u: number | null): number | null => (u === null || u <= 0 ? null : (a - u) / u);
  const rows: PlanRow[] = water.rows.filter((r) => r.children === 0).map((r) => { const b = by.get(r.id); const has = !!b && b.stats.n >= 2 && r.kind !== "human"; const um = has && b!.stats.ms_median > 0 ? b!.stats.ms_median : null, uc = has ? b!.stats.cost_median : null;   // a stored time of 0 is a time that was never measured, not a step that takes no time
    return { id: r.id, title: r.title, icon: r.icon, kind: r.kind, n: b?.stats.n ?? 0, usual_ms: um, ms: r.ms, usual_cost: uc, cost: r.cost, d_ms: delta(r.ms, um), d_cost: delta(r.cost, uc) }; });
  const known = rows.filter((r) => r.usual_ms !== null || r.usual_cost !== null); const sum = (f: (r: PlanRow) => number) => known.reduce((a, r) => a + f(r), 0);
  return { rows, usual_ms: sum((r) => r.usual_ms ?? 0), usual_cost: sum((r) => r.usual_cost ?? 0), ms: sum((r) => r.ms), cost: sum((r) => r.cost), known: known.length };
}

/** WHY A NODE FAILED, in the run's own words (the operator 2026-11-20: it must show on the graph and inside the node): kept in the node's values by the serve; else in the run's log; else (an older run that kept nothing) the honest line that nothing was kept. Pure. */
export function failureOf(run: Run | null, id: string): { text: string; kind: string } | null {
  if (!run) return null; const v: any = run.state.values?.[id];
  if (v?.failed && typeof v.error === "string" && v.error) return { text: v.error, kind: String(v.error_kind ?? "error") };
  const ev = (run.events ?? []).find((e) => e.actor === id && ["failed", "timeout", "cap"].includes(e.kind)); if (ev && ev.text) return { text: ev.text, kind: ev.kind };
  const why = (run.state as any).status?.why; return { text: `No error text was kept for this run${why ? ` (${why})` : ""}. A run started after the serve update keeps it.`, kind: "error" };
}
