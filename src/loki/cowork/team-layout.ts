// TEAMS IN THE LAYOUT (operator 2026-11-10: "when we drag a pane to inside another that pane links to that other one. So it appears 3 regions, planner, worker, qa ... they appear as 1 block with the dragging forced on the 3 if
// we drag the block"). The serve holds who is in which team (`teams.json`); the layout holds where it is drawn. A team is a SPLIT marked with its id, whose children are its panes in role order: planner, worker, QA. Dragging the
// block is moving that split. Pure and immutable, like layout.ts.
import { leaves, normalize, splitNode, type TeamRole, type Layout, type Node, type PaneRef, type Side, type Split } from "./layout";

export const ROLES: readonly TeamRole[] = ["planner", "worker", "qa"];
export const ROLE_LABEL: Record<TeamRole, string> = { planner: "planner", worker: "worker", qa: "QA" };
/** A team as the serve lists it: the cockpit pane (`pane`) that plays each role. */
export type TeamDef = { id: string; name?: string; members: { role: TeamRole; pane: number }[] };

const teamSplit = (n: Node, id: string): Split | null => (n.type === "split" && n.team === id ? n : null);
const rank = (r: TeamRole | undefined) => (r ? ROLES.indexOf(r) : 9);

/** The team block with this id, if the layout has one. */
export function teamBlock(l: Layout, id: string): Split | null {
  let found: Split | null = null;
  const walk = (n: Node | null) => { if (!n || found) return; const c = teamSplit(n, id); if (c) { found = c; return; } if (n.type === "split") n.children.forEach(walk); };
  walk(l.root); return found;
}
/** The team a layout pane belongs to (by the block it sits in), or null. */
export function teamOfPane(l: Layout, paneId: string): string | null {
  let found: string | null = null;
  const walk = (n: Node | null, team: string | null) => { if (!n || found) return; if (n.type === "leaf") { if (n.pane.id === paneId) found = team; return; } n.children.forEach((c) => walk(c, n.team ?? team)); };
  walk(l.root, null); return found;
}

/** Remove the leaves `ids` from a tree, collapsing a split left with one child. */
function without(n: Node, ids: Set<string>): Node | null {
  if (n.type === "leaf") return ids.has(n.pane.id) ? null : n;
  const kept: Node[] = []; const sizes: number[] = [];
  n.children.forEach((c, i) => { const r = without(c, ids); if (r) { kept.push(r); sizes.push(n.sizes[i]); } });
  if (kept.length === 0) return null; if (kept.length === 1) return kept[0];
  return { ...n, children: kept, sizes: normalize(sizes) };
}

/** Make the layout show this team as one block: its panes (found by their cockpit pane number) leave where they were and stand side by side, in role order, where the first of them was. Roles are written onto the panes.
 *  A layout that already shows exactly that comes back unchanged (the same object), so it can be applied on every poll. */
export function groupTeam(l: Layout, team: TeamDef): Layout {
  if (!l.root) return l;
  const byPane = new Map<number, TeamRole>(team.members.map((m) => [m.pane, m.role]));
  const present = leaves(l.root).filter((p) => p.paneId !== undefined && byPane.has(p.paneId));
  if (present.length === 0) return l;
  const block = teamBlock(l, team.id);
  // THE ORDER INSIDE A BLOCK IS THE PERSON'S (operator 2026-11-10: dragging reorders a team): a block that already holds exactly these panes keeps its order; a new member goes where its role belongs among the others, a first block is in role order
  const inBlock = block ? leaves(block) : [];
  const order = inBlock.length ? [...inBlock.filter((p) => byPane.has(p.paneId ?? -1)), ...present.filter((p) => !inBlock.some((b) => b.id === p.id))] : present.slice().sort((a, b) => rank(byPane.get(a.paneId!)) - rank(byPane.get(b.paneId!)));
  const roled: PaneRef[] = order.map((p) => ({ ...p, role: byPane.get(p.paneId!) }));
  if (present.length === 1) return withRoles(l, roled);                 // a team of one is no block yet: only the role shows
  if (block && sameLeaves(block, roled)) return l.root && rolesAlready(l, roled) ? l : withRoles(l, roled);
  const firstId = present[0].id;
  // the others leave their places; the block takes the first member's
  const rest = without(l.root, new Set(roled.map((p) => p.id).filter((i) => i !== firstId)));
  if (!rest) return l;
  const fresh: Split = { type: "split", dir: "row", team: team.id, sizes: roled.map(() => 1 / roled.length), children: roled.map((pane) => ({ type: "leaf" as const, pane })) };
  return { ...l, root: replaceLeaf(rest, firstId, fresh) };
}
function withRoles(l: Layout, roled: PaneRef[]): Layout {
  const m = new Map(roled.map((p) => [p.id, p.role]));
  const walk = (n: Node): Node => n.type === "leaf" ? (m.has(n.pane.id) && n.pane.role !== m.get(n.pane.id) ? { type: "leaf", pane: { ...n.pane, role: m.get(n.pane.id) } } : n) : { ...n, children: n.children.map(walk) };
  return { ...l, root: l.root ? walk(l.root) : null };
}
const rolesAlready = (l: Layout, roled: PaneRef[]) => roled.every((r) => leaves(l.root).find((p) => p.id === r.id)?.role === r.role);
const sameLeaves = (block: Split, roled: PaneRef[]) => block.children.length === roled.length && block.children.every((c, i) => c.type === "leaf" && c.pane.id === roled[i].id);
function replaceLeaf(n: Node, id: string, by: Node): Node { return n.type === "leaf" ? (n.pane.id === id ? by : n) : { ...n, children: n.children.map((c) => replaceLeaf(c, id, by)) }; }

/** A SIDE QUESTION AND ITS AGENT ARE ONE BLOCK (operator 2026-11-11: "a line between them, and when dragging one the other comes together"): a split marked `side:<the side pane's cockpit number>` holding the agent and its side question, the agent first. Dragged by its bar,
 *  the pair moves as one, the way a team does. */
export const SIDE_PREFIX = "side:";
export const sideBlockId = (sidePaneId: number) => `${SIDE_PREFIX}${sidePaneId}`;
/** Make every side question stand beside the agent it is about, as one block. A pair whose agent or side pane is gone dissolves (the panes stay). The same object when nothing changes. Pure. */
export function groupSidePairs(l: Layout): Layout {
  if (!l.root) return l;
  let out = l;
  // a block whose two panes are not both there any more is just two panes
  const dissolve = (n: Node): Node => n.type === "leaf" ? n : (() => { const kids = n.children.map(dissolve); const bad = n.team?.startsWith(SIDE_PREFIX) && !(kids.length === 2 && kids.every((k) => k.type === "leaf") && (kids[1] as { pane: PaneRef }).pane.side !== undefined && (kids[0] as { pane: PaneRef }).pane.paneId === (kids[1] as { pane: PaneRef }).pane.side); const keep = bad ? { ...n, team: undefined } : n; return kids.every((k, i) => k === n.children[i]) && keep === n ? n : { ...keep, children: kids }; })();
  const d = dissolve(out.root!); if (d !== out.root) out = { ...out, root: d };
  for (const side of leaves(out.root).filter((p) => p.side !== undefined && p.paneId !== undefined)) {
    const id = sideBlockId(side.paneId!); if (teamBlock(out, id)) continue;
    const parent = leaves(out.root).find((p) => p.paneId === side.side); if (!parent || parent.id === side.id) continue;
    // an agent that already stands in a team's block keeps that place: its side question stays beside it as an ordinary pane
    const inTeam = (n: Node, within: boolean): boolean => n.type === "leaf" ? within && n.pane.id === parent.id : n.children.some((c) => inTeam(c, within || (!!n.team && !n.team.startsWith(SIDE_PREFIX))));
    if (inTeam(out.root!, false)) continue;
    const rest = without(out.root!, new Set([side.id])); if (!rest) continue;
    const fresh: Split = { type: "split", dir: "row", team: id, sizes: [0.5, 0.5], children: [{ type: "leaf", pane: parent }, { type: "leaf", pane: side }] };
    out = { ...out, root: replaceLeaf(rest, parent.id, fresh) };
  }
  return out;
}

/** Make the layout agree with the serve's teams: every team is a block; a block or a role the serve no longer has goes away (its panes stay, side by side, as plain panes). The same object when nothing changes. */
export function reconcileTeams(l: Layout, teams: TeamDef[]): Layout {
  if (!l.root) return l;
  let out = l;
  const known = new Set(teams.map((c) => c.id));
  const memberPanes = new Set(teams.flatMap((c) => c.members.map((m) => m.pane)));
  // blocks of teams that are gone, and roles of panes that are in no team
  const strip = (n: Node): Node => n.type === "leaf"
    ? (n.pane.role && !(n.pane.paneId !== undefined && memberPanes.has(n.pane.paneId)) ? { type: "leaf", pane: { ...n.pane, role: undefined } } : n)
    : (() => { const kids = n.children.map(strip); const keep = n.team && !known.has(n.team) && !n.team.startsWith(SIDE_PREFIX) ? { ...n, team: undefined } : n; return kids.every((k, i) => k === n.children[i]) && keep === n ? n : { ...keep, children: kids }; })();
  const stripped = strip(l.root); if (stripped !== l.root) out = { ...out, root: stripped };
  for (const c of teams) out = groupTeam(out, c);
  return out;
}

/** Move a whole team block beside another pane (or beside another team's block): the three panes go together. */
export function moveTeam(l: Layout, teamId: string, targetId: string, side: Side): Layout {
  const block = teamBlock(l, teamId); if (!l.root || !block) return l;
  const inside = new Set(leaves(block).map((p) => p.id)); if (inside.has(targetId)) return l;
  const rest = without(l.root, inside); if (!rest) return l;
  const lifted: Layout = { ...l, root: rest };
  const next = splitNode(lifted, targetId, side, block);
  return next === lifted ? l : { ...next, zoom: null };
}

/** Reorder inside a team: take `id` out of the block and set it before or after `targetId` (left or above is before). Both must be in this team's block; anything else changes nothing. */
export function reorderInTeam(l: Layout, teamId: string, id: string, targetId: string, side: Side): Layout {
  const block = teamBlock(l, teamId); if (!l.root || !block || id === targetId) return l;
  const kids = block.children; const from = kids.findIndex((c) => c.type === "leaf" && c.pane.id === id); const to = kids.findIndex((c) => c.type === "leaf" && c.pane.id === targetId);
  if (from < 0 || to < 0) return l;
  const sizes = block.sizes.slice(); const children = kids.slice();
  const [moved] = children.splice(from, 1); const [sz] = sizes.splice(from, 1);
  let at = children.findIndex((c) => c.type === "leaf" && c.pane.id === targetId); if (side === "right" || side === "below") at += 1;
  children.splice(at, 0, moved); sizes.splice(at, 0, sz);
  const next: Split = { ...block, children, sizes: normalize(sizes) };
  const swap = (n: Node): Node => (n === block ? next : n.type === "split" ? { ...n, children: n.children.map(swap) } : n);
  return { ...l, root: swap(l.root) };
}
/** What the middle of a pane means to a drag, in words: the drop zone's label. `dragged`/`target`: whether each is an agent and which team each is in. Pure. */
export function centerLabel(dragged: { agent: boolean; team: string | null }, target: { agent: boolean; team: string | null }): string {
  if (dragged.team && dragged.team === target.team) return "swap places in the team";
  if (!dragged.agent || !target.agent) return "swap places";
  if (dragged.team) return "take it out of its team first";
  return target.team ? "already in a team or a pair" : "start a pair session";
}
/** What an edge of a pane means, in words. */
export function edgeLabel(zone: Side, dragged: { team: string | null }, target: { team: string | null }): string {
  const where = zone === "above" ? "above" : zone === "below" ? "below" : zone;
  if (dragged.team && dragged.team === target.team) return `put it ${where} here, in the team`;
  if (dragged.team) return `take it out of the team and put it ${where}`;
  return `put ${zone === "above" ? "above" : zone === "below" ? "below" : zone}`;
}
