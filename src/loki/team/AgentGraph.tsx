// THE TEAM GRAPH (the approved mockup of 2026-11-18, from the idea of AffectUI's Agent Graph; drawn by us): the Leader in the middle with a soft halo, every agent a tile with its provider's mark, model and state, the tools and files around the agent they belong to,
// thin wires with light travelling where work is going on, a badge at the tile's corner for done / needs you / failed. What needs you and what failed rise into the header. Pure `hubLayout` places the tiles; the drawing only reads the graph and the run.
import { branchColor, branchOf, edgeKey, stepNumbers } from "./graph-order";
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { counts, failureOf, flowOrder, money, modelLine, nodeState, titleOf, type NodeState } from "./model";
import type { Artifact, GNode, Graph, Run } from "./types";
import { getResult, listArtifacts, listMedia, type Media } from "./api";
import { SpecialistAvatar, type AvatarState } from "@/loki/cowork/SpecialistAvatar";
import { NodePreview, PREVIEW_H, PREVIEW_W, artifactOf, artifactPreview, mediaByNode, mediaPreviews, type PreviewSource } from "./NodePreview";

export type Pos = { x: number; y: number; kind: "hub" | "agent" | "tool" };
const AGENT_KINDS = ["role", "llm", "code", "sub_team"];
export const isAgent = (n: GNode) => AGENT_KINDS.includes(n.node);
/** Where each node stands: the Leader at the centre, the agents on an ellipse around it in flow order, every other node just outside the agent it is wired to (else on an outer ring). Pure. */
/** Nothing sits closer than a label's width: tiles that are too close are pushed apart (the Leader stays where it is). Mutates and returns `out`. */
export function separate(out: Record<string, Pos>): Record<string, Pos> {
  const keys = Object.keys(out);
  for (let pass = 0; pass < 12; pass++) for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) {
    const A = out[keys[a]], B = out[keys[b]]; let dx = B.x - A.x, dy = B.y - A.y; const d = Math.hypot(dx, dy) || 0.01; const min = A.kind === "hub" || B.kind === "hub" ? 96 : 84;
    if (d < min) { const push = (min - d) / 2; dx /= d; dy /= d; if (A.kind !== "hub") { A.x -= dx * push; A.y -= dy * push; } if (B.kind !== "hub") { B.x += dx * push; B.y += dy * push; } }
  }
  return out;
}
export function hubLayout(g: Graph, w = 900, h = 560): Record<string, Pos> {
  const ids = Object.keys(g.nodes); const leader = ids.find((i) => g.nodes[i].node === "leader"); const cx = w / 2, cy = h / 2;
  const out: Record<string, Pos> = {}; if (leader) out[leader] = { x: cx, y: cy, kind: "hub" };
  const order = flowOrder(g); const agents = order.filter((i) => i !== leader && isAgent(g.nodes[i])); const rest = ids.filter((i) => i !== leader && !agents.includes(i));
  const rx = w * 0.27, ry = h * 0.25;
  agents.forEach((id, k) => { const a = (-135 + (k * 360) / Math.max(agents.length, 1)) * (Math.PI / 180); out[id] = { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), kind: "agent" }; });
  const near: Record<string, number> = {}; const loose: string[] = [];
  for (const id of rest) {
    const nb = g.edges.map((e) => (e.from === id ? e.to : e.to === id ? e.from : null)).find((x) => x && agents.includes(x));
    if (!nb) { loose.push(id); continue; }
    const p = out[nb]; const k = (near[nb] = (near[nb] ?? 0) + 1) - 1; const vx = p.x - cx, vy = p.y - cy, len = Math.hypot(vx, vy) || 1; const ux = vx / len, uy = vy / len, side = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 74;
    out[id] = { x: p.x + ux * 120 - uy * side, y: p.y + uy * 120 + ux * side, kind: "tool" };
  }
  loose.forEach((id, k) => { const a = (-60 + (k * 360) / Math.max(loose.length, 1)) * (Math.PI / 180); out[id] = { x: cx + rx * 1.5 * Math.cos(a), y: cy + ry * 1.55 * Math.sin(a), kind: "tool" }; });
  separate(out); const keys = Object.keys(out);
  for (const id of keys) { out[id].x = Math.max(52, Math.min(w - 52, out[id].x)); out[id].y = Math.max(42, Math.min(h - 56, out[id].y)); }
  return out;
}
export type SkillSpot = { name: string; x: number; y: number; near: string; draft: boolean };
/** Where the team's skills stand: each beside the agent that uses it (else under the Leader), as a support node. Pure. */
export function skillSpots(g: Graph, pos: Record<string, Pos>, skills: { name: string; status: string }[], w = 900, h = 560): SkillSpot[] {
  const hub = Object.keys(pos).find((i) => pos[i].kind === "hub"); const cx = w / 2, cy = h / 2; const count: Record<string, number> = {}; const all: Record<string, Pos> = { ...Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, { ...v }])) };
  const users = (name: string) => Object.keys(g.nodes).filter((i) => { const n = g.nodes[i] as any; return n.node === "role" && (n.agent?.skills ?? []).includes(name) && pos[i]; });
  const spots = skills.map((sk) => { const near = users(sk.name)[0] ?? hub ?? ""; const a = pos[near] ?? { x: cx, y: cy, kind: "hub" as const }; const used = (count[near] = (count[near] ?? 0) + 1) - 1;
    const base = Object.values(pos).filter((p) => p.kind === "tool" && Math.hypot(p.x - a.x, p.y - a.y) < 150).length; const vx = a.x - cx, vy = a.y - cy, len = Math.hypot(vx, vy);
    let x: number, y: number; if (a.kind === "hub" || len < 1) { const ang = (90 + (used - 1.5) * 34) * (Math.PI / 180); x = cx + 135 * Math.cos(ang); y = cy + 135 * Math.sin(ang); } else { const ux = vx / len, uy = vy / len, side = ((base + used) % 2 === 0 ? 1 : -1) * Math.ceil((base + used) / 2) * 74; x = a.x + ux * 120 - uy * side; y = a.y + uy * 120 + ux * side; }
    all[`skill:${sk.name}`] = { x, y, kind: "tool" }; return { name: sk.name, near, draft: sk.status !== "approved", x, y }; });
  separate(all); return spots.map((sp) => ({ ...sp, x: Math.max(52, Math.min(w - 52, all[`skill:${sp.name}`].x)), y: Math.max(42, Math.min(h - 56, all[`skill:${sp.name}`].y)) }));
}
/** Which glyph a node wears: an agent its provider's mark (from the seat or model it runs on), every other node a drawing of what it is. Pure. */
export type Glyph = "claude" | "gpt" | "gem" | "cur" | "loc" | "you" | "doc" | "web" | "folder" | "stop" | "deliver" | "check" | "branch" | "loop" | "code" | "shuffle" | "plug" | "term" | "skill" | "tool";
export function providerOf(n: GNode): Glyph {
  if (n.node === "human") return "you";
  const m = (n.node === "role" ? n.model ?? "" : n.node === "llm" ? n.seat ?? "" : "").toLowerCase();
  if (n.node === "role" || n.node === "llm" || n.node === "sub_team") { if (m.startsWith("codex") || m.includes("gpt")) return "gpt"; if (m.startsWith("gemini")) return "gem"; if (m.startsWith("cursor")) return "cur"; if (m.startsWith("local") || m.startsWith("endpoint")) return "loc"; return "claude"; }
  switch (n.node) {
    case "artifact": return "doc"; case "stop": return "stop"; case "deliver": return "deliver"; case "check": return "check"; case "if": case "switch": case "fork": case "join": return "branch"; case "loop": case "for_each": case "retry": return "loop";
    case "code": return "code"; case "transform": return "shuffle";
    case "use_tool": return n.tool.type === "web" || n.tool.type === "webapp" ? "web" : n.tool.type === "source" ? "folder" : n.tool.type === "mcp" ? "plug" : n.tool.type === "skill" ? "skill" : n.tool.type === "pane" || n.tool.type === "shell" ? "term" : "tool";
    default: return "tool";
  }
}
const stateWord = (s: NodeState) => ({ idle: "", working: "working", waiting: "needs you", done: "done", failed: "failed" }[s]);

/** The drawing of a glyph, centred on (x, y), `s` pixels across. Strokes only for the quiet ones; the agents wear colour. */
export function Mark({ k, x, y, s }: { k: Glyph; x: number; y: number; s: number }) {
  const t = `translate(${x} ${y}) scale(${s / 20})`; const m = C.muted, f = C.fg; const st = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (k) {
    case "claude": return <g transform={t}>{[0, 1, 2, 3, 4, 5].map((i) => <line key={i} x1={0} y1={0} x2={Math.cos((i * Math.PI) / 3 + 0.3) * 10} y2={Math.sin((i * Math.PI) / 3 + 0.3) * 10} stroke="#ee7d4f" strokeWidth={2.2} strokeLinecap="round" />)}</g>;
    case "gpt": return <g transform={t}><path d="M0 -10 L8.7 -5 L8.7 5 L0 10 L-8.7 5 L-8.7 -5Z" stroke={f} strokeWidth={1.8} {...st} /><circle r={3.2} stroke={f} strokeWidth={1.6} fill="none" /></g>;
    case "gem": return <g transform={t}><path d="M0 -10 C1 -4 4 -1 10 0 C4 1 1 4 0 10 C-1 4 -4 1 -10 0 C-4 -1 -1 -4 0 -10Z" fill="#4d8dff" /></g>;
    case "cur": return <g transform={t}><path d="M0 -10 L8.7 -5 L8.7 5 L0 10 L-8.7 5 L-8.7 -5Z" stroke={f} strokeWidth={1.6} {...st} /><path d="M0 0 L8.7 -5 M0 0 L0 10 M0 0 L-8.7 -5" stroke={f} strokeWidth={1.2} fill="none" /></g>;
    case "loc": return <g transform={t}><rect x={-7} y={-7} width={14} height={14} rx={3} stroke="#2dd4bf" strokeWidth={1.8} fill="none" /><rect x={-3} y={-3} width={6} height={6} rx={1} fill="#2dd4bf" /><path d="M-3 -9 V-7 M3 -9 V-7 M-3 7 V9 M3 7 V9 M-9 -3 H-7 M-9 3 H-7 M7 -3 H9 M7 3 H9" stroke="#2dd4bf" strokeWidth={1.2} fill="none" /></g>;
    case "you": return <g transform={t}><circle cy={-3.5} r={4} stroke={f} strokeWidth={1.7} fill="none" /><path d="M-8 9 C-7 3 7 3 8 9" stroke={f} strokeWidth={1.7} {...st} /></g>;
    case "doc": return <g transform={t}><path d="M-6 -9 H2 L7 -4 V9 H-6Z" stroke={m} strokeWidth={1.5} {...st} /><path d="M2 -9 V-4 H7" stroke={m} strokeWidth={1.3} {...st} /><path d="M-3 1 H4 M-3 4.5 H4" stroke={m} strokeWidth={1.3} {...st} /></g>;
    case "web": return <g transform={t}><circle r={8.5} stroke={m} strokeWidth={1.5} fill="none" /><path d="M-8.5 0 H8.5 M0 -8.5 C-5 -3 -5 3 0 8.5 C5 3 5 -3 0 -8.5" stroke={m} strokeWidth={1.2} fill="none" /></g>;
    case "folder": return <g transform={t}><path d="M-9 -5 H-3 L-1 -3 H9 V7 H-9Z" stroke={m} strokeWidth={1.5} {...st} /></g>;
    case "stop": return <g transform={t}><path d="M-3.5 -9 H3.5 L9 -3.5 V3.5 L3.5 9 H-3.5 L-9 3.5 V-3.5Z" stroke="#f04e4e" strokeWidth={1.6} {...st} /><rect x={-3.2} y={-3.2} width={6.4} height={6.4} rx={1} fill="#f04e4e" /></g>;
    case "deliver": return <g transform={t}><path d="M-8 -2 L0 -8 L8 -2 V8 H-8Z" stroke={m} strokeWidth={1.5} {...st} /><path d="M-3 8 V2 H3 V8" stroke={m} strokeWidth={1.3} {...st} /></g>;
    case "check": return <g transform={t}><path d="M0 -9 L8 -6 V1 C8 5 4 8 0 9.5 C-4 8 -8 5 -8 1 V-6Z" stroke={m} strokeWidth={1.5} {...st} /><path d="M-3.4 0.5 L-0.8 3.2 L3.8 -2.4" stroke="#3ecf8e" strokeWidth={1.8} {...st} /></g>;
    case "branch": return <g transform={t}><circle cx={-6} cy={-6} r={2.4} stroke={m} strokeWidth={1.5} fill="none" /><circle cx={-6} cy={6} r={2.4} stroke={m} strokeWidth={1.5} fill="none" /><circle cx={6} cy={-1} r={2.4} stroke={m} strokeWidth={1.5} fill="none" /><path d="M-6 -3.6 V3.6 M-6 1 C-6 -1.5 6 2 6 1.4" stroke={m} strokeWidth={1.4} fill="none" /></g>;
    case "loop": return <g transform={t}><path d="M7 -2 A7.5 7.5 0 1 0 5.4 4.6" stroke={m} strokeWidth={1.6} {...st} /><path d="M8 -7 V-2 H3" stroke={m} strokeWidth={1.6} {...st} /></g>;
    case "code": return <g transform={t}><path d="M-4.5 -5 L-9 0 L-4.5 5 M4.5 -5 L9 0 L4.5 5 M1.5 -7 L-1.5 7" stroke={m} strokeWidth={1.6} {...st} /></g>;
    case "shuffle": return <g transform={t}><path d="M-9 -4 H-4 C0 -4 0 4 4 4 H8 M-9 4 H-4 C0 4 0 -4 4 -4 H8" stroke={m} strokeWidth={1.5} {...st} /><path d="M6 -6.5 L8.6 -4 L6 -1.5 M6 1.5 L8.6 4 L6 6.5" stroke={m} strokeWidth={1.4} {...st} /></g>;
    case "plug": return <g transform={t}><path d="M-3 -9 V-3 M3 -9 V-3 M-6 -3 H6 V1 C6 4.5 3.5 7 0 7 C-3.5 7 -6 4.5 -6 1Z M0 7 V10" stroke={m} strokeWidth={1.5} {...st} /></g>;
    case "term": return <g transform={t}><rect x={-9} y={-7.5} width={18} height={15} rx={3} stroke={m} strokeWidth={1.5} fill="none" /><path d="M-5 -2.5 L-1.5 0 L-5 2.5 M1 3 H5" stroke={m} strokeWidth={1.5} {...st} /></g>;
    case "skill": return <g transform={t}><path d="M0 -9 L2.6 -3 L9 -2.4 L4.2 1.8 L5.6 8 L0 4.8 L-5.6 8 L-4.2 1.8 L-9 -2.4 L-2.6 -3Z" stroke="#e0b341" strokeWidth={1.5} {...st} /></g>;
    default: return <g transform={t}><path d="M-8 6 L-2 -0.5 M-2 -0.5 A4.5 4.5 0 1 1 3 4.5 L-2 -0.5" stroke={m} strokeWidth={1.5} {...st} /></g>;
  }
}
const COLOR: Record<NodeState, string> = { idle: "var(--c-border)", working: "#4d8dff", waiting: "#f5a524", done: "#3ecf8e", failed: "#f04e4e" };
const CSS = `
@keyframes ag-trav{from{stroke-dashoffset:256}to{stroke-dashoffset:0}}@keyframes ag-halo{0%,100%{opacity:.5}50%{opacity:.95}}@keyframes ag-spin{to{transform:rotate(360deg)}}
.ag-trav{fill:none;stroke-linecap:round;stroke-dasharray:14 240;animation:ag-trav 2.8s linear infinite}.ag-halo{animation:ag-halo 3.2s ease-in-out infinite}.ag-spin{transform-box:fill-box;transform-origin:center;animation:ag-spin 1s linear infinite}
.ag-nd{cursor:pointer;outline:none}.ag-nd:hover .ag-tile,.ag-nd:focus-visible .ag-tile,.ag-nd[data-sel="1"] .ag-tile{stroke:#4d8dff}
@media (prefers-reduced-motion:reduce){.ag-trav,.ag-halo,.ag-spin{animation:none}}`;

/** A wire between two tiles: a soft S-curve that leaves and enters the tiles' edges (never through them). */
export function wireBetween(a: Pos, b: Pos, ra: number, rb: number): string {
  const dx = b.x - a.x, dy = b.y - a.y; const horizontal = Math.abs(dx) >= Math.abs(dy);
  const sx = a.x + (horizontal ? Math.sign(dx) * ra : 0), sy = a.y + (horizontal ? 0 : Math.sign(dy) * ra), ex = b.x - (horizontal ? Math.sign(dx) * rb : 0), ey = b.y - (horizontal ? 0 : Math.sign(dy) * rb);
  return horizontal ? `M${sx} ${sy} C${sx + (ex - sx) / 2} ${sy} ${sx + (ex - sx) / 2} ${ey} ${ex} ${ey}` : `M${sx} ${sy} C${sx} ${sy + (ey - sy) / 2} ${ex} ${sy + (ey - sy) / 2} ${ex} ${ey}`;
}
const SIZE = { hub: 52, agent: 40, tool: 30 };
/** Which nodes show which mini previews: an artifact node what it wrote, a node its own pictures and videos (named in its outputs), and Deliver THE FINAL RESULT: the finished documents wired into it and whatever picture or video no node names. Pure. */
export function previewItems(graph: Graph, arts: readonly Artifact[], media: readonly Media[], values: Record<string, unknown> | undefined | null, hasResult = false): { id: string; src: PreviewSource }[] {
  const out: { id: string; src: PreviewSource }[] = []; const { byNode, rest } = mediaByNode(media, values);
  const made = (n: any) => (n?.node === "artifact" && artifactOf(arts, n) ? artifactPreview({ name: n.name, format: n.format }) : null);
  for (const [id, n] of Object.entries(graph.nodes) as [string, any][]) {
    const own = made(n); if (own) out.push({ id, src: own });
    for (const src of mediaPreviews(byNode[id] ?? [])) out.push({ id, src });
    if (n.node === "deliver") {
      if (hasResult) { out.push({ id, src: { kind: "page", title: "Result", result: true } }); continue; }   // the master page of the Result and files tab
      const fed = graph.edges.filter((e) => e.to === id).map((e) => made(graph.nodes[e.from] as any)).filter((x): x is PreviewSource => !!x);
      for (const src of [...fed, ...mediaPreviews(rest)].slice(0, 2)) out.push({ id, src });
    }
  }
  return out;
}
export type PreviewSpot = { id: string; n: number; key: string; x: number; y: number; src: PreviewSource };
/** Where a node's mini previews stand: beside the node on the side away from the Leader; a spot that would cover a node (its tile and label), a skill or another preview is moved round the node and then further out until it is clear; kept inside the drawing. Pure. */
export function previewSpots(pos: Record<string, Pos>, items: { id: string; src: PreviewSource }[], w: number, h: number, extra: { x: number; y: number }[] = []): PreviewSpot[] {
  const hub = Object.values(pos).find((p) => p.kind === "hub") ?? { x: w / 2, y: h / 2 }; const count: Record<string, number> = {};
  const hw = PREVIEW_W / 2 + 6, hh = PREVIEW_H / 2 + 6;
  // what a preview must not cover: every node with its label under it, every skill, and the previews already placed
  const blocks: { x: number; y: number; hw: number; hh: number }[] = [...Object.values(pos).map((p) => ({ x: p.x, y: p.y + 10, hw: 52, hh: SIZE[p.kind] / 2 + 28 })), ...extra.map((e) => ({ x: e.x, y: e.y + 10, hw: 52, hh: 40 }))];
  const clear = (x: number, y: number) => x - hw >= 0 && x + hw <= w && y - hh >= 0 && y + hh <= h && blocks.every((b) => Math.abs(b.x - x) >= b.hw + hw || Math.abs(b.y - y) >= b.hh + hh);
  const out: PreviewSpot[] = [];
  for (const it of items) {
    const p = pos[it.id]; if (!p) continue; const n = (count[it.id] = (count[it.id] ?? 0) + 1) - 1;
    let ux = p.x - hub.x, uy = p.y - hub.y; const len = Math.hypot(ux, uy); if (len < 1) { ux = 0; uy = 1; } else { ux /= len; uy /= len; }
    const base = Math.atan2(uy, ux); let best: { x: number; y: number } | null = null;
    search: for (const r of [PREVIEW_W / 2 + 56, PREVIEW_W / 2 + 96, PREVIEW_W / 2 + 140]) for (const turn of [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180]) {
      const a = base + (turn * Math.PI) / 180; const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * (r * 0.62 + PREVIEW_H / 2 - 10);
      if (clear(x, y)) { best = { x, y }; break search; }
    }
    const fb = { x: Math.max(hw, Math.min(w - hw, p.x + ux * (PREVIEW_W / 2 + 56))), y: Math.max(hh, Math.min(h - hh, p.y + uy * (PREVIEW_H / 2 + 56))) };
    const at = best ?? fb; blocks.push({ x: at.x, y: at.y, hw: PREVIEW_W / 2, hh: PREVIEW_H / 2 }); out.push({ id: it.id, n, key: `pv:${it.id}:${n}`, src: it.src, x: at.x, y: at.y });
  }
  return out;
}

/** The visible box of the view: `k` times closer, its corner at (x, y) in the drawing's own units. Pure. */
export function camBox(c: { k: number; x: number; y: number }, w: number, h: number) { return { x: c.x, y: c.y, w: w / c.k, h: h / c.k }; }
/** Zoom by `f` keeping the point under the pointer (fx, fy as 0..1 of the view) where it is; between 0.4x and 4x. Pure. */
export function zoomAt(c: { k: number; x: number; y: number }, f: number, fx: number, fy: number, w: number, h: number) {
  const k = Math.max(0.4, Math.min(4, c.k * f)); const px = c.x + fx * (w / c.k), py = c.y + fy * (h / c.k); return { k, x: px - fx * (w / k), y: py - fy * (h / k) };
}
/** How many agents and how many tools (support nodes) the graph draws. Pure. */
export function graphCounts(g: Graph): { agents: number; tools: number } { const p = hubLayout(g, 900, 560); const k = Object.values(p); return { agents: k.filter((x) => x.kind !== "tool").length, tools: k.filter((x) => x.kind === "tool").length }; }
/** The specialist an agent node runs as (its id), or null. Pure. */
export const specialistOf = (n: GNode | undefined): string | null => { const s = (n as any)?.agent?.specialist; return typeof s === "string" && s ? s : null; };
/** The id of a team's Leader specialist, spelled exactly as the serve spells it (`leader-` + the team's name in lowercase letters and digits, other runs of characters one dash, at most 40). Pure. */
export const leaderIdOf = (team: string): string => { const t = team.split('').map((c) => (/[A-Za-z0-9]/.test(c) ? c.toLowerCase() : '-')).join('').split('-').filter(Boolean).join('-').slice(0, 40); return `leader-${t || 'team'}`; };
/** Does this node get a face? Every model-driven agent does (code and sub-team nodes keep their glyph). Pure. */
export const hasFace = (n: GNode | undefined): boolean => !!n && (n.node === "role" || n.node === "llm");
/** Whose face: the specialist it runs as, else the node's own id (so the same agent always has the same mascot). Pure. */
export const faceOf = (id: string, n: GNode | undefined): string => specialistOf(n) ?? id;
/** A node's state as the avatar shows it: a failed node looks blocked. Pure. */
export const avatarState = (s: NodeState): AvatarState => (s === "failed" ? "blocked" : s);
export function AgentGraph({ graph, run, selected, onSelect, specialists = {}, skills = [], selectedSkill = null, onSkill, suggestions = [], onSuggestion, onZoomApi }: { /** the view's own controls, handed to the bar above it (zoom in / out / fit) */ onZoomApi?: (api: { zoomIn: () => void; zoomOut: () => void; fit: () => void } | null) => void; graph: Graph; run: Run | null; selected?: string | null; onSelect: (id: string) => void; /** the project's specialists by id (their mascot), so a node shows the real avatar */ specialists?: Record<string, { shape?: string; color?: string }>; /** the team's skills, drawn as support nodes beside the agents that use them */ skills?: { name: string; status: string }[]; selectedSkill?: string | null; onSkill?: (name: string) => void; /** open improvement requests, drawn as a dashed suggestion tile by the Leader */ suggestions?: { n: number; problem: string }[]; onSuggestion?: (n: number) => void }) {
  // the drawing takes the whole width of the team's pane (the operator 2026-11-18): its units follow the pane, the height keeps a wide aspect
  const wrap = React.useRef<HTMLDivElement>(null); const [boxW, setBoxW] = React.useState(900); const [boxH, setBoxH] = React.useState(0);
  React.useEffect(() => { const el = wrap.current; if (!el || typeof ResizeObserver === "undefined") return; const ro = new ResizeObserver((es) => { const w = Math.round(es[0].contentRect.width); if (w > 0) setBoxW((o) => (Math.abs(o - w) < 8 ? o : w)); const h = Math.round(es[0].contentRect.height); if (h > 0) setBoxH((o) => (Math.abs(o - h) < 8 ? o : h)); }); ro.observe(el); return () => ro.disconnect(); }, []);
  const W = Math.max(520, boxW), Hh = boxH > 0 ? Math.max(380, boxH) : Math.round(Math.max(460, Math.min(760, W * 0.5)));   /* the whole height of the pane when it has one */ const base = React.useMemo(() => hubLayout(graph, W, Hh), [graph]);
  // THE GRAPH IS A SURFACE (the operator 2026-11-18: "i cant zoom in out and navigate like a graph with the hand, also dragging the boxes"): the wheel zooms where the pointer is, the empty surface drags the view, a tile drags where you drop it (kept for this team), double-click puts it back
  const posKey = `antiloki.team.graph.pos.${graph.team}`;
  const [moved, setMoved] = React.useState<Record<string, { x: number; y: number }>>(() => { try { return JSON.parse(localStorage.getItem(posKey) ?? "{}"); } catch { return {}; } });
  const previewsRef = React.useRef<PreviewSpot[]>([]); const [cam, setCam] = React.useState({ k: 1, x: 0, y: 0 }); const svgRef = React.useRef<SVGSVGElement>(null); const gesture = React.useRef<{ kind: "pan" | "node"; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null); const wasDrag = React.useRef(false);
  const pos = React.useMemo(() => { const o: Record<string, Pos> = {}; for (const [id, p] of Object.entries(base)) o[id] = moved[id] ? { ...p, x: moved[id].x, y: moved[id].y } : p; return o; }, [base, moved]);
  const toSvg = (cx: number, cy: number) => { const el = svgRef.current; const r = el?.getBoundingClientRect(); if (!el || !r || !r.width) return { x: cx, y: cy }; const vb = camBox(cam, W, Hh); return { x: vb.x + ((cx - r.left) / r.width) * vb.w, y: vb.y + ((cy - r.top) / r.height) * vb.h }; };
  React.useEffect(() => { const el = svgRef.current; if (!el) return; const wheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); setCam((c) => zoomAt(c, e.deltaY < 0 ? 1.12 : 1 / 1.12, (e.clientX - r.left) / (r.width || 1), (e.clientY - r.top) / (r.height || 1), W, Hh)); }; el.addEventListener("wheel", wheel, { passive: false }); return () => el.removeEventListener("wheel", wheel); }, []);
  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return; const t = (e.target as Element).closest?.("[data-testid^='ag-node-']"); const id = t?.getAttribute("data-testid")?.slice("ag-node-".length); const p = toSvg(e.clientX, e.clientY); wasDrag.current = false;
    const pv = (e.target as Element).closest?.("[data-pvkey]"); const pvKey = pv?.getAttribute("data-pvkey"); const pvAt = pvKey ? previewsRef.current.find((v) => v.key === pvKey) : undefined;
    if (pvKey && pvAt) gesture.current = { kind: "node", id: pvKey, sx: p.x, sy: p.y, ox: pvAt.x, oy: pvAt.y, moved: false };
    else if (id && pos[id]) gesture.current = { kind: "node", id, sx: p.x, sy: p.y, ox: pos[id].x, oy: pos[id].y, moved: false };
    else if (!(e.target as Element).closest?.("[data-testid^='ag-skill-'],[data-testid^='ag-suggestion-'],[data-testid^='ag-preview-']")) gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: cam.x, oy: cam.y, moved: false };
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current; if (!g) return;
    if (!g.moved) { try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* no capture */ } }   /* the pointer is taken only once it really drags: capturing on press sent the click to the background and no tile could be opened */
    if (g.kind === "node" && g.id) { const p = toSvg(e.clientX, e.clientY); const dx = p.x - g.sx, dy = p.y - g.sy; if (!g.moved && Math.hypot(dx, dy) < 4) return; g.moved = true; wasDrag.current = true; const id = g.id; setMoved((m) => ({ ...m, [id]: { x: g.ox + dx, y: g.oy + dy } })); }
    else { const r = svgRef.current?.getBoundingClientRect(); if (!r || !r.width) return; const dx = e.clientX - g.sx, dy = e.clientY - g.sy; if (!g.moved && Math.hypot(dx, dy) < 3) return; g.moved = true; wasDrag.current = true; setCam((c) => ({ ...c, x: g.ox - (dx / r.width) * (W / c.k), y: g.oy - (dy / r.height) * (Hh / c.k) })); }
  };
  const up = (e: React.PointerEvent<SVGSVGElement>) => { const g = gesture.current; gesture.current = null; (e.currentTarget as Element).releasePointerCapture?.(e.pointerId); if (g?.kind === "node" && g.moved) { try { localStorage.setItem(posKey, JSON.stringify(moved)); } catch { /* private window */ } } };
  /* a dragged node has no box to stay in: the canvas has no edge, so pan to follow a node as far as you like */
  const reset = () => { setCam({ k: 1, x: 0, y: 0 }); setMoved({}); try { localStorage.removeItem(posKey); } catch { /* private window */ } };
  const zoom = (f: number) => setCam((c) => zoomAt(c, f, 0.5, 0.5, W, Hh));
  const apiRef = React.useRef({ zoomIn: () => zoom(1.25), zoomOut: () => zoom(1 / 1.25), fit: reset }); apiRef.current = { zoomIn: () => zoom(1.25), zoomOut: () => zoom(1 / 1.25), fit: reset };
  React.useEffect(() => { onZoomApi?.({ zoomIn: () => apiRef.current.zoomIn(), zoomOut: () => apiRef.current.zoomOut(), fit: () => apiRef.current.fit() }); return () => onZoomApi?.(null); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const spots = React.useMemo(() => skillSpots(graph, pos, skills, W, Hh), [graph, pos, skills]);
  // WHAT THE RUN MADE, to hang a mini preview on the node that made it (artifact nodes) or on Deliver (pictures and videos)
  const [made, setMade] = React.useState<{ arts: Artifact[]; media: Media[]; result: boolean }>({ arts: [], media: [], result: false }); const runId = run?.id; const runLive = !!run?.live;
  React.useEffect(() => {
    if (!runId) { setMade({ arts: [], media: [], result: false }); return; } let stop = false;
    const go = async () => { try { const [arts, media, res] = await Promise.all([Promise.resolve().then(() => listArtifacts(runId)), Promise.resolve().then(() => listMedia(runId)), Promise.resolve().then(() => getResult(runId)).catch(() => null)]); const result = !!(res && (res as any).ok && (res as any).text); if (!stop) setMade((o) => (o.arts.length === arts.length && o.media.length === media.length && o.result === result ? o : { arts, media, result })); } catch { /* no previews, the graph still draws */ } };
    void go(); const t = runLive ? setInterval(go, 5000) : undefined; return () => { stop = true; if (t) clearInterval(t); };
  }, [runId, runLive]);
  const items = React.useMemo(() => previewItems(graph, made.arts, made.media, (run?.state as any)?.values, made.result), [graph, made, run]);
  const previews = React.useMemo(() => previewSpots(pos, items, W, Hh, spots).map((v) => (moved[v.key] ? { ...v, x: moved[v.key].x, y: moved[v.key].y } : v)), [pos, items, W, Hh, spots, moved]); previewsRef.current = previews;
  const ids = Object.keys(pos); const st = (id: string) => nodeState(graph, run, id); const cs = counts(graph, run);
  const needs = ids.filter((i) => st(i) === "waiting"), failed = ids.filter((i) => st(i) === "failed");
  const agentsN = ids.filter((i) => pos[i].kind !== "tool").length, toolsN = ids.filter((i) => pos[i].kind === "tool").length;
  const live = (from: string, to: string) => !!run && (st(to) === "working" || st(from) === "working");
  const hubId = ids.find((i) => pos[i].kind === "hub"); const nums = React.useMemo(() => stepNumbers(graph, hubId ? [hubId] : []), [graph, hubId]); const br = React.useMemo(() => branchOf(graph), [graph]); const nodeBranch = (id: string) => { const e = graph.edges.find((x) => x.to === id && br[edgeKey(x)] !== undefined); return e ? br[edgeKey(e)] : 0; };   /* the order numbers and the branch colours (the operator 2026-11-22) */ const r = (id: string) => SIZE[pos[id].kind] / 2;
  const edges = graph.edges.filter((e) => pos[e.from] && pos[e.to] && e.from !== e.to);
  return (
    <div data-testid="agent-graph" style={{ padding: "0 0 0", fontFamily: nav, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", position: "relative" }}>
      <style>{CSS}</style>
      <div style={{ position: "absolute", top: 12, left: 14, zIndex: 5, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", maxWidth: "55%" }}>
        
        <span data-testid="graph-chips" style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
          {needs.map((i) => <span key={i} data-testid={`chip-needs-${i}`} style={chip("#f5a524")}>{titleOf(i, graph.nodes[i])} needs you</span>)}
          {failed.map((i) => <span key={i} data-testid={`chip-failed-${i}`} title={failureOf(run, i)?.text} style={chip("#f04e4e")}>{titleOf(i, graph.nodes[i])} failed: {trim(failureOf(run, i)?.text ?? "error", 60)}</span>)}
        </span>
        <span style={{ marginLeft: "auto" }} />
      </div>
      <div ref={wrap} style={{ width: "100%", flex: 1, minHeight: 360 }}>
        {/* drawn at its own size (never stretched to the pane: that blew the fonts and tiles up), centred, and smaller only when the pane is narrower than the drawing */}
        <svg ref={svgRef} viewBox={(() => { const b = camBox(cam, W, Hh); return `${b.x} ${b.y} ${b.w} ${b.h}`; })()} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={(e) => { if (!(e.target as Element).closest?.("[data-testid^='ag-']")) reset(); }} onClickCapture={(e) => { if (wasDrag.current) { e.stopPropagation(); wasDrag.current = false; } }} data-testid="graph-surface" data-zoom={cam.k.toFixed(2)} role="img" aria-label="the team's agents and what they are wired to" style={{ display: "block", width: "100%", height: boxH > 0 ? "100%" : "auto", touchAction: "none", cursor: gesture.current ? "grabbing" : "grab", userSelect: "none" }}>
          <defs>
            <filter id="ag-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" /></filter>
            <radialGradient id="ag-hg"><stop offset="0" stopColor="#4d8dff" stopOpacity=".3" /><stop offset="1" stopColor="#4d8dff" stopOpacity="0" /></radialGradient>
          </defs>
          {hubId && <circle className="ag-halo" cx={pos[hubId].x} cy={pos[hubId].y} r={84} fill="url(#ag-hg)" />}
          {edges.map((e, k) => { const d = wireBetween(pos[e.from], pos[e.to], r(e.from), r(e.to)); const on = live(e.from, e.to); const col = st(e.to) === "waiting" ? "#f5a524" : st(e.to) === "failed" ? "#f04e4e" : "#4d8dff"; const failPort = ["failed", "error", "timeout", "cap", "budget"].includes(e.port);
            return <g key={k}><path d={d} fill="none" stroke={failPort ? "color-mix(in srgb, #f04e4e 40%, var(--c-border))" : branchColor(br[edgeKey(e)] ?? 0) ?? "var(--c-border)"} strokeWidth={!failPort && (br[edgeKey(e)] ?? 0) > 0 ? 1.6 : 1} data-branch={br[edgeKey(e)] ?? ""} strokeDasharray={failPort ? "3 4" : undefined} opacity={0.9} />{on && <><path className="ag-trav" d={d} stroke={col} strokeWidth={4} filter="url(#ag-blur)" opacity={0.6} /><path className="ag-trav" d={d} stroke={col} strokeWidth={1.5} /></>}</g>; })}
          {suggestions.slice(0, 3).map((q, i) => { const x = W / 2 + 190, y = 70 + i * 74; return <g key={`sg-${q.n}`} className="ag-nd" data-testid={`ag-suggestion-${q.n}`} tabIndex={0} role="button" aria-label={`suggestion ${q.n}: ${q.problem}`} onClick={() => onSuggestion?.(q.n)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSuggestion?.(q.n); } }}>
            {hubId && pos[hubId] && <path d={`M${pos[hubId].x} ${pos[hubId].y} Q${(pos[hubId].x + x) / 2} ${y - 30} ${x - 18} ${y}`} fill="none" stroke="#4d8dff" strokeOpacity={0.4} strokeDasharray="2 4" />}
            <rect className="ag-tile" x={x - 18} y={y - 18} width={36} height={36} rx={11} fill="var(--c-panel2, var(--c-panel))" stroke="#4d8dff" strokeDasharray="3 3" strokeWidth={1.1} />
            <path d={`M${x} ${y - 8} l2.2 5.6 5.6 2.2 -5.6 2.2 -2.2 5.6 -2.2 -5.6 -5.6 -2.2 5.6 -2.2z`} fill="none" stroke="#4d8dff" strokeWidth={1.5} strokeLinejoin="round" />
            <text x={x} y={y + 32} textAnchor="middle" fill={C.fg} fontSize={11} fontWeight={500} fontFamily={nav}>suggestion</text><text x={x} y={y + 44} textAnchor="middle" fill={C.muted} fontSize={9.5} fontFamily={nav}>{trim(q.problem, 26)}</text>
          </g>; })}
          {spots.map((k) => { const a = pos[k.near]; return a ? <path key={`w-${k.name}`} d={wireBetween(a, { x: k.x, y: k.y, kind: "tool" }, SIZE[a.kind] / 2, SIZE.tool / 2)} fill="none" stroke="#e0b341" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="2 4" /> : null; })}
          {spots.map((k) => <g key={`skill-${k.name}`} className="ag-nd" data-testid={`ag-skill-${k.name}`} data-draft={k.draft ? "1" : "0"} data-sel={selectedSkill === k.name ? "1" : "0"} tabIndex={0} role="button" aria-label={`skill ${k.name}${k.draft ? ", waiting for approval" : ""}`} onClick={() => onSkill?.(k.name)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSkill?.(k.name); } }}>
            <rect className="ag-tile" x={k.x - SIZE.tool / 2} y={k.y - SIZE.tool / 2} width={SIZE.tool} height={SIZE.tool} rx={9} fill="var(--c-panel2, var(--c-panel))" stroke={selectedSkill === k.name ? "#4d8dff" : "#e0b341"} strokeOpacity={k.draft ? 1 : 0.55} strokeDasharray={k.draft ? "3 3" : undefined} strokeWidth={1.1} />
            <Mark k="skill" x={k.x} y={k.y} s={15} /><text x={k.x} y={k.y + SIZE.tool / 2 + 14} textAnchor="middle" fill={C.fg} fontSize={11} fontWeight={500} fontFamily={nav}>{trim(k.name, 18)}</text><text x={k.x} y={k.y + SIZE.tool / 2 + 26} textAnchor="middle" fontSize={9.5} fontFamily={nav} fill={k.draft ? "#f5a524" : C.muted}>{k.draft ? "skill · needs approval" : "skill"}</text>
          </g>)}
          {ids.map((id) => { const n = graph.nodes[id], p = pos[id], s = st(id), hub = p.kind === "hub", tool = p.kind === "tool", sz = SIZE[p.kind], sel = selected === id; const bx = p.x + sz / 2 - 2, by = p.y - sz / 2 + 2;
            return (
              <g key={id} className="ag-nd" data-testid={`ag-node-${id}`} data-state={s} data-sel={sel ? "1" : "0"} tabIndex={0} role="button" aria-label={`${titleOf(id, n)}${stateWord(s) ? `, ${stateWord(s)}` : ""}`} onClick={() => onSelect(id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); } }}>
                {s === "failed" && <title>{failureOf(run, id)?.text}</title>}
                {hub && <rect x={p.x - sz / 2 - 4} y={p.y - sz / 2 - 4} width={sz + 8} height={sz + 8} rx={16} fill="none" stroke="#4d8dff" strokeOpacity={0.5} />}
                <rect className="ag-tile" x={p.x - sz / 2} y={p.y - sz / 2} width={sz} height={sz} rx={hub ? 14 : tool ? 9 : 11} fill="var(--c-panel2, var(--c-panel))" stroke={hub ? "#4d8dff" : s === "idle" ? "var(--c-border)" : COLOR[s]} strokeWidth={1.1} />
                {nums[id] && !hub && <g data-testid={`ag-order-${id}`} aria-hidden><circle cx={p.x - sz / 2 + 1} cy={p.y - sz / 2 + 1} r={6.5} fill="var(--c-panel2, var(--c-panel))" stroke={branchColor(nodeBranch(id)) ?? "var(--c-muted)"} strokeWidth={1.1} /><text x={p.x - sz / 2 + 1} y={p.y - sz / 2 + 1} dy="0.34em" textAnchor="middle" fontSize={8} fontFamily={mono} fill={branchColor(nodeBranch(id)) ?? C.dim}>{nums[id]}</text></g>}
                {hub ? <g data-testid="ag-leader-face"><foreignObject x={p.x - 18} y={p.y - 18} width={36} height={36} style={{ overflow: "visible", pointerEvents: "none" }}><SpecialistAvatar id={leaderIdOf(graph.team)} size={36} state={avatarState(s)} shape={specialists[leaderIdOf(graph.team)]?.shape} color={specialists[leaderIdOf(graph.team)]?.color} /></foreignObject></g> : !tool && hasFace(n) ? <g data-testid={`ag-spec-${id}`}><foreignObject x={p.x - 15} y={p.y - 15} width={30} height={30} style={{ overflow: "visible", pointerEvents: "none" }}><SpecialistAvatar id={faceOf(id, n)} size={30} state={avatarState(s)} shape={specialists[faceOf(id, n)]?.shape} color={specialists[faceOf(id, n)]?.color} /></foreignObject><Mark k={providerOf(n)} x={p.x - sz / 2 + 7} y={p.y + sz / 2 - 7} s={9} /></g> : <Mark k={providerOf(n)} x={p.x} y={p.y} s={tool ? 15 : 19} />}
                <text x={p.x} y={p.y + sz / 2 + 14} textAnchor="middle" fill={C.fg} fontSize={11} fontWeight={500} fontFamily={nav}>{trim(hub ? "Leader" : titleOf(id, n), 18)}</text>
                <text x={p.x} y={p.y + sz / 2 + 26} textAnchor="middle" fontSize={9.5} fontFamily={nav} fill={s === "waiting" ? "#f5a524" : s === "failed" ? "#f04e4e" : C.muted}>{s === "waiting" ? "Needs you" : s === "failed" ? trim(failureOf(run, id)?.text ?? "Error", 24) : trim(tool ? kindWord(n) : hub ? "" : modelLine(n).split(" · ")[0] || kindWord(n), 20)}</text>
                {s === "done" && !hub && <g><circle cx={bx} cy={by} r={6.5} fill="#3ecf8e" /><path d={`M${bx - 2.8} ${by} l1.9 2 l3.7 -3.9`} stroke="#07130d" strokeWidth={1.5} fill="none" strokeLinecap="round" /></g>}
                {s === "waiting" && <g><circle cx={bx} cy={by} r={6.5} fill="#f5a524" /><circle cx={bx} cy={by} r={3.5} fill="none" stroke="#1a1100" strokeWidth={1.2} /><path d={`M${bx} ${by - 2} V${by} l1.5 1`} stroke="#1a1100" strokeWidth={1.1} fill="none" strokeLinecap="round" /></g>}
                {s === "failed" && <g><circle cx={bx} cy={by} r={4} fill="#f04e4e" /><circle cx={bx} cy={by} r={6.5} fill="none" stroke="#f04e4e" strokeOpacity={0.4} /></g>}
                {s === "working" && !hub && <circle className="ag-spin" cx={bx} cy={by} r={5.5} fill="var(--c-panel)" stroke="#4d8dff" strokeWidth={1.8} strokeDasharray="7 27" />}
              </g>
            ); })}
          {runId && previews.map((v) => { const a = pos[v.id]; return <g key={v.key} data-pvkey={v.key} data-testid={`ag-previewspot-${v.id}`} style={{ cursor: "grab" }}>
            <path d={`M${a.x} ${a.y} L${v.x} ${v.y}`} fill="none" stroke="#4d8dff" strokeOpacity={0.35} strokeDasharray="2 4" />
            <foreignObject x={v.x - PREVIEW_W / 2} y={v.y - PREVIEW_H / 2} width={PREVIEW_W} height={PREVIEW_H}><NodePreview run={runId} src={v.src} id={v.key.replace(/[^a-z0-9_-]/gi, "_")} dragged={() => wasDrag.current} /></foreignObject>
          </g>; })}
        </svg>
      </div>
    </div>
  );
}
const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const kindWord = (n: GNode): string => (n.node === "use_tool" ? n.tool.name : n.node === "artifact" ? n.format : n.node === "human" ? "your decision" : n.node === "role" ? n.role : n.node.replace("_", " "));
const chip = (c: string): React.CSSProperties => ({ fontSize: 11, lineHeight: "19px", padding: "0 8px", borderRadius: 999, color: c, border: `1px solid color-mix(in srgb, ${c} 45%, transparent)`, background: `color-mix(in srgb, ${c} 10%, transparent)`, whiteSpace: "nowrap" });
