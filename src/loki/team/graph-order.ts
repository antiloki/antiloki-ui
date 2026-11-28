// THE ORDER AND THE BRANCHES OF A GRAPH (the operator 2026-11-22: "on the graph, add mini numbers on the nodes referent to the order, and make different branches having different colours on the lines"):
// `stepNumbers` numbers the steps in the order they run (parallel steps share a depth and are numbered one after another), `branchOf` says which branch a line belongs to: the main line is 0, and every line that leaves a node
// which splits the work (a fork, an if, a switch, a for-each: more than one way forward) starts a branch of its own that its downstream lines keep until they join again. Pure over the graph, so the same graph always draws the same.
import type { Graph } from "./types";

/** The ports that are a way out of trouble, not a way forward: they do not count for order or branches. */
export const TROUBLE_PORTS = ["failed", "error", "timeout", "cap", "budget", "human"];
const candidate = (g: Graph) => g.edges.filter((e) => g.nodes[e.from] && g.nodes[e.to] && e.from !== e.to && !TROUBLE_PORTS.includes(e.port));
/** The lines that go forward: no trouble ports, and no line that closes a loop (found by walking from the start: a line back to a node still being walked is a loop's return). */
function forwardEdges(g: Graph) {
  const cand = candidate(g); const ids = Object.keys(g.nodes); const hasIn = new Set(cand.map((e) => e.to)); const roots = [...(g.start ?? []).filter((i) => g.nodes[i]), ...ids.filter((i) => !hasIn.has(i))]; const state: Record<string, 0 | 1 | 2> = {}; const back = new Set<number>();
  const walk = (v: string) => { state[v] = 1; cand.forEach((e, k) => { if (e.from !== v) return; if (state[e.to] === 1) back.add(k); else if (!state[e.to]) walk(e.to); }); state[v] = 2; };
  [...roots, ...ids].forEach((r) => { if (!state[r]) walk(r); }); return cand.filter((_, k) => !back.has(k));
}
/** A topological order (Kahn) over the forward lines: depth first, the graph's own node order within a depth; what a loop leaves over comes last in that same order. */
function topo(g: Graph): { order: string[]; depth: Record<string, number> } {
  const ids = Object.keys(g.nodes); const fw = forwardEdges(g); const indeg: Record<string, number> = {}; const out: Record<string, string[]> = {}; const depth: Record<string, number> = {};
  ids.forEach((i) => { indeg[i] = 0; out[i] = []; depth[i] = 0; }); fw.forEach((e) => { indeg[e.to]++; out[e.from].push(e.to); });
  let level = ids.filter((i) => indeg[i] === 0); const order: string[] = []; const seen = new Set<string>();
  while (level.length) { const next: string[] = []; for (const v of level) { if (seen.has(v)) continue; seen.add(v); order.push(v); for (const w of out[v]) { depth[w] = Math.max(depth[w], depth[v] + 1); if (--indeg[w] === 0) next.push(w); } } level = next; }
  ids.forEach((i) => { if (!seen.has(i)) { order.push(i); seen.add(i); } });   // a loop's members: after everything that reached them, in the graph's own order
  return { order: order.sort((a, b) => depth[a] - depth[b] || ids.indexOf(a) - ids.indexOf(b)), depth };
}
/** 1-based step numbers in the order the steps run. `skip` leaves some nodes out (the Leader's hub is not a step). Pure. */
export function stepNumbers(g: Graph, skip: string[] = []): Record<string, number> { const r: Record<string, number> = {}; let n = 0; for (const id of topo(g).order) if (!skip.includes(id)) r[id] = ++n; return r; }
export const edgeKey = (e: { from: string; port: string; to: string }) => `${e.from}>${e.port}>${e.to}`;
/** For every forward line, its branch: 0 is the main line; a node with more than one way forward gives each of them a new number (1, 2, 3...), and a line keeps the branch it arrives on; where lines of different branches meet, what leaves is the main line again. Pure. */
export function branchOf(g: Graph): Record<string, number> {
  const fw = forwardEdges(g); const { order } = topo(g); const inColors: Record<string, number[]> = {}; const colour: Record<string, number> = {}; const res: Record<string, number> = {}; let next = 1;
  for (const v of order) {
    const ins = inColors[v] ?? []; const nodeCol = ins.length === 0 ? 0 : ins.every((c) => c === ins[0]) ? ins[0] : 0; colour[v] = nodeCol;
    const outs = fw.filter((e) => e.from === v); const split = outs.length > 1;
    for (const e of outs) { const c = split ? next++ : nodeCol; res[edgeKey(e)] = c; (inColors[e.to] ??= []).push(c); }
  }
  return res;
}
/** The colours of the branches (0, the main line, keeps the graph's own line colour). Hues far apart, readable on dark and light. */
export const BRANCH_COLORS = ["#e8825a", "#3fc7b5", "#a98bff", "#e6b84a", "#ec6fa8", "#8fd05a"];
export const branchColor = (b: number): string | null => (b <= 0 ? null : BRANCH_COLORS[(b - 1) % BRANCH_COLORS.length]);
