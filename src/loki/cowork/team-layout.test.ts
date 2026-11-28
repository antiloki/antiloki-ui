// Teams in the layout: the block, its order, moving it whole, and agreeing with the serve.
import { describe, expect, it } from "vitest";
import { addPane, closePane, emptyLayout, leaves, parseLayout, type Layout, type PaneRef } from "./layout";
import { centerLabel, teamBlock, teamOfPane, edgeLabel, groupTeam, groupSidePairs, moveTeam, reconcileTeams, reorderInTeam, sideBlockId, type TeamDef } from "./team-layout";

const eng = (id: string, paneId: number): PaneRef => ({ id, kind: "engine", engine: "claude-code", title: id, paneId });
const sh = (id: string): PaneRef => ({ id, kind: "shell", title: id });
const build = (...p: PaneRef[]): Layout => p.reduce((l, x) => addPane(l, x), emptyLayout());
const team: TeamDef = { id: "k", members: [{ role: "qa", pane: 3 }, { role: "planner", pane: 1 }, { role: "worker", pane: 2 }] };
const order = (l: Layout) => leaves(l.root).map((p) => p.id);

describe("a team is one block of its panes in role order", () => {
  it("gathers the members where the first stood, planner then worker then QA, with their roles", () => {
    const l = groupTeam(build(eng("a", 2), sh("s"), eng("b", 1), eng("c", 3)), team);
    const block = teamBlock(l, "k")!; expect(block.type).toBe("split"); expect(block.dir).toBe("row");
    expect(block.children.map((c) => c.type === "leaf" ? `${c.pane.id}:${c.pane.role}` : "?")).toEqual(["b:planner", "a:worker", "c:qa"]);
    expect(order(l).sort()).toEqual(["a", "b", "c", "s"]); expect(teamOfPane(l, "a")).toBe("k"); expect(teamOfPane(l, "s")).toBeNull();
    expect(block.sizes.reduce((x, y) => x + y, 0)).toBeCloseTo(1);
  });
  it("is the same object when the layout already shows the team, so applying it on every poll changes nothing", () => {
    const l = groupTeam(build(eng("a", 2), eng("b", 1), eng("c", 3)), team);
    expect(groupTeam(l, team)).toBe(l); expect(reconcileTeams(l, [team])).toBe(l);
  });
  it("with one member present only that pane's role shows; the others join the block when they appear", () => {
    const one = groupTeam(build(eng("a", 2), sh("s")), team); expect(teamBlock(one, "k")).toBeNull(); expect(leaves(one.root).find((p) => p.id === "a")!.role).toBe("worker");
    const two = groupTeam(addPane(one, eng("b", 1)), team); expect(teamBlock(two, "k")!.children).toHaveLength(2);
    const three = groupTeam(addPane(two, eng("c", 3)), team); expect(teamBlock(three, "k")!.children).toHaveLength(3);
  });
});

describe("moving the block moves all of it", () => {
  it("lifts the three panes out and sets the block beside another pane, intact", () => {
    const l = groupTeam(build(eng("a", 2), eng("b", 1), eng("c", 3), sh("s")), team);
    const moved = moveTeam(l, "k", "s", "below");
    expect(order(moved).sort()).toEqual(["a", "b", "c", "s"]);
    expect(teamBlock(moved, "k")!.children.map((c) => c.type === "leaf" ? c.pane.id : "?")).toEqual(["b", "a", "c"]);
    expect(moveTeam(l, "k", "a", "right")).toBe(l);            // onto one of its own panes: nothing
    expect(moveTeam(l, "nope", "s", "right")).toBe(l);
  });
  it("a pane dropped beside one of the team's panes lands beside the block, not inside it", () => {
    const l = groupTeam(build(eng("a", 2), eng("b", 1), eng("c", 3), sh("s")), team);
    const next = addPane({ ...l, focus: "a" }, sh("t"), "right");
    expect(teamBlock(next, "k")!.children).toHaveLength(3); expect(order(next)).toContain("t");
  });
});

describe("the layout follows the serve", () => {
  it("drops a block and the roles of a team the serve no longer has, keeping the panes", () => {
    const l = groupTeam(build(eng("a", 2), eng("b", 1), eng("c", 3)), team);
    const gone = reconcileTeams(l, []);
    expect(teamBlock(gone, "k")).toBeNull(); expect(order(gone).sort()).toEqual(["a", "b", "c"]); expect(leaves(gone.root).every((p) => p.role === undefined)).toBe(true);
  });
  it("takes a pane out of the block when the serve unlinked it", () => {
    const l = groupTeam(build(eng("a", 2), eng("b", 1), eng("c", 3)), team);
    const smaller = reconcileTeams(l, [{ id: "k", members: [{ role: "planner", pane: 1 }, { role: "worker", pane: 2 }] }]);
    expect(teamBlock(smaller, "k")!.children).toHaveLength(2); expect(leaves(smaller.root).find((p) => p.id === "c")!.role).toBeUndefined();
  });
  it("closing a member leaves the others as the block; closing down to one dissolves it", () => {
    const l = groupTeam(build(eng("a", 2), eng("b", 1), eng("c", 3)), team);
    const two = closePane(l, "c"); expect(teamBlock(two, "k")!.children).toHaveLength(2);
    expect(teamBlock(closePane(two, "a"), "k")).toBeNull();
  });
  it("survives a reload", () => {
    const l = groupTeam(build(eng("a", 2), eng("b", 1), eng("c", 3)), team);
    const back = parseLayout(JSON.parse(JSON.stringify(l))); expect(teamBlock(back, "k")!.children).toHaveLength(3); expect(leaves(back.root).map((p) => p.role)).toEqual(["planner", "worker", "qa"]);
  });
});

describe("reordering inside a team and what a drop says", () => {
  it("reorders the block's panes and the reorder survives the layout agreeing with the serve", () => {
    const l = groupTeam(build(eng("a", 2), eng("b", 1), eng("c", 3)), team);          // planner b, worker a, qa c
    const r = reorderInTeam(l, "k", "c", "b", "left");
    expect(teamBlock(r, "k")!.children.map((x) => x.type === "leaf" ? x.pane.id : "?")).toEqual(["c", "b", "a"]);
    expect(reconcileTeams(r, [team])).toBe(r);                                        // kept: the order is the person's
    expect(teamBlock(reorderInTeam(r, "k", "c", "a", "right"), "k")!.children.map((x) => x.type === "leaf" ? x.pane.id : "?")).toEqual(["b", "a", "c"]);
    expect(reorderInTeam(l, "k", "a", "a", "left")).toBe(l); expect(reorderInTeam(l, "k", "a", "zz", "left")).toBe(l); expect(reorderInTeam(l, "nope", "a", "b", "left")).toBe(l);
  });
  it("puts a new member among the others by its role, not at the end", () => {
    const two = groupTeam(build(eng("a", 2), eng("b", 1)), { id: "k", members: [{ role: "planner", pane: 1 }, { role: "worker", pane: 2 }] });
    const three = groupTeam(addPane(two, eng("c", 3)), team);
    expect(teamBlock(three, "k")!.children.map((x) => x.type === "leaf" ? x.pane.role : "?")).toEqual(["planner", "worker", "qa"]);
  });
  it("says add to the team when an agent is over a team, link as a team over a lone agent, and what an edge does to a member", () => {
    expect(centerLabel({ agent: true, team: null }, { agent: true, team: "k" })).toBe("already in a team or a pair");
    expect(centerLabel({ agent: true, team: null }, { agent: true, team: null })).toBe("start a pair session");
    expect(centerLabel({ agent: true, team: "k" }, { agent: true, team: "k" })).toBe("swap places in the team");
    expect(centerLabel({ agent: true, team: "k" }, { agent: true, team: null })).toBe("take it out of its team first");
    expect(centerLabel({ agent: false, team: null }, { agent: true, team: null })).toBe("swap places");
    expect(edgeLabel("left", { team: "k" }, { team: "k" })).toBe("put it left here, in the team"); expect(edgeLabel("below", { team: "k" }, { team: null })).toBe("take it out of the team and put it below"); expect(edgeLabel("right", { team: null }, { team: "k" })).toBe("put right");
  });
});

describe("a side question and its agent as one block", () => {
  const leaf = (id: string, paneId: number, extra: object = {}) => ({ type: "leaf", pane: { id, kind: "engine", engine: "claude-code", paneId, title: id, ...extra } }) as any;
  const row = (kids: any[], team?: string) => ({ type: "split", dir: "row", sizes: kids.map(() => 1 / kids.length), children: kids, ...(team ? { team } : {}) }) as any;
  it("stands the side question beside its agent in a block of its own, the agent first, and changes nothing when it already does", () => {
    const l: any = { root: row([leaf("a", 7), leaf("x", 9), leaf("s", 12, { side: 7 })]), focus: null, zoom: null };
    const g: any = groupSidePairs(l); const pair = g.root.children[0]; expect(pair.team).toBe(sideBlockId(12)); expect(pair.children.map((c: any) => c.pane.id)).toEqual(["a", "s"]); expect(g.root.children.map((c: any) => (c.type === "leaf" ? c.pane.id : c.team))).toEqual([sideBlockId(12), "x"]);
    expect(groupSidePairs(g)).toBe(g); expect(teamBlock(g, sideBlockId(12))).not.toBeNull();
  });
  it("is kept by the team reconciliation, dissolves when either pane is gone, and leaves an agent that is in a team where it is", () => {
    const l: any = { root: row([leaf("a", 7), leaf("s", 12, { side: 7 })]), focus: null, zoom: null }; const g: any = groupSidePairs(l);
    expect(reconcileTeams(g, [])).toBe(g);
    const alone: any = { ...g, root: row([{ ...g.root, children: [g.root.children[0]], sizes: [1] }, leaf("z", 20)], sideBlockId(12)) };   // the side pane left the block
    expect(JSON.stringify(groupSidePairs(alone))).not.toContain(`"team":"${sideBlockId(12)}"`);
    const inTeam: any = { root: row([row([leaf("a", 7, { role: "planner" }), leaf("w", 8, { role: "worker" })], "k"), leaf("s", 12, { side: 7 })]), focus: null, zoom: null };
    expect(teamOfPane(groupSidePairs(inTeam), "a")).toBe("k"); expect(teamBlock(groupSidePairs(inTeam), sideBlockId(12))).toBeNull();
  });
  it("moves with its agent when the block is dragged", () => {
    const l: any = groupSidePairs({ root: row([leaf("a", 7), leaf("s", 12, { side: 7 }), leaf("z", 20)]), focus: null, zoom: null });
    const moved = moveTeam(l, sideBlockId(12), "z", "right"); const ids = (n: any): string[] => (n.type === "leaf" ? [n.pane.id] : n.children.flatMap(ids)); expect(ids(moved.root)).toEqual(["z", "a", "s"]); expect(teamBlock(moved, sideBlockId(12))?.children).toHaveLength(2);
  });
});
