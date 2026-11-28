import { describe, it, expect } from "vitest";
import {
  emptyLayout, addPane, splitPane, closePane, setSizes, focusPane, cycleFocus, toggleZoom, toggleCollapse, swapPanes, updatePane, movePane, flipSplit,
  resizePane, leaves, paneCount, normalize, parseLayout, serializeLayout, addBlocked, MAX_PANES, MIN_SHARE, type PaneRef, type Layout, type Split,
} from "./layout";

const P = (id: string, kind: PaneRef["kind"] = "engine"): PaneRef => ({ id, kind, engine: kind === "engine" ? id : undefined });
const ids = (l: Layout) => leaves(l.root).map((p) => p.id);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("adding panes", () => {
  it("the first pane is the root and has the focus", () => {
    const l = addPane(emptyLayout(), P("claude"));
    expect(l.root?.type).toBe("leaf"); expect(l.focus).toBe("claude");
  });
  it("a second pane splits the focused one to the right, half each", () => {
    const l = addPane(addPane(emptyLayout(), P("claude")), P("gemini"));
    const r = l.root as Split;
    expect(r.type).toBe("split"); expect(r.dir).toBe("row"); expect(r.sizes).toEqual([0.5, 0.5]); expect(ids(l)).toEqual(["claude", "gemini"]); expect(l.focus).toBe("gemini");
  });
  it("splitting on the left, below and above puts the new pane there", () => {
    const base = addPane(emptyLayout(), P("a"));
    expect(ids(splitPane(base, "a", "left", P("b")))).toEqual(["b", "a"]);
    const below = splitPane(base, "a", "below", P("c")); expect((below.root as Split).dir).toBe("col"); expect(ids(below)).toEqual(["a", "c"]);
    expect(ids(splitPane(base, "a", "above", P("d")))).toEqual(["d", "a"]);
  });
  it("splitting a pane inside a same-direction split adds a sibling, not a nest", () => {
    let l = addPane(emptyLayout(), P("a")); l = addPane(l, P("b")); l = splitPane(l, "a", "right", P("c"));
    const r = l.root as Split;
    expect(r.children).toHaveLength(3); expect(ids(l)).toEqual(["a", "c", "b"]); expect(sum(r.sizes)).toBeCloseTo(1, 9);
    expect(r.sizes[0]).toBeCloseTo(0.25, 9); expect(r.sizes[1]).toBeCloseTo(0.25, 9); expect(r.sizes[2]).toBeCloseTo(0.5, 9);
  });
  it("splitting the other way nests", () => {
    let l = addPane(emptyLayout(), P("a")); l = addPane(l, P("b")); l = splitPane(l, "b", "below", P("c"));
    const r = l.root as Split; expect(r.children).toHaveLength(2); expect((r.children[1] as Split).dir).toBe("col");
  });
  it("a duplicate pane and a split of a pane that is not there change nothing", () => {
    const l = addPane(emptyLayout(), P("a"));
    expect(addPane(l, P("a"))).toBe(l); expect(splitPane(l, "ghost", "right", P("z"))).toBe(l);
  });
  it("stops at the cap, and says why", () => {
    let l = emptyLayout(); for (let i = 0; i < MAX_PANES; i += 1) l = addPane(l, P(`p${i}`));
    expect(paneCount(l)).toBe(MAX_PANES);
    expect(addBlocked(l, P("one-more"))).toMatch(/most this machine should hold/);
    expect(addPane(l, P("one-more"))).toBe(l);
  });
});

describe("closing panes", () => {
  it("closing one of two leaves the other as the root, focused", () => {
    const l = closePane(addPane(addPane(emptyLayout(), P("a")), P("b")), "b");
    expect(l.root?.type).toBe("leaf"); expect(l.focus).toBe("a");
  });
  it("the share of the closed pane goes back to the others, summing to one", () => {
    let l = addPane(emptyLayout(), P("a")); l = addPane(l, P("b")); l = addPane(l, P("c"));
    l = closePane(l, "b"); const r = l.root as Split;
    expect(r.children).toHaveLength(2); expect(sum(r.sizes)).toBeCloseTo(1, 9);
  });
  it("closing the last pane empties the layout", () => {
    const l = closePane(addPane(emptyLayout(), P("a")), "a");
    expect(l).toEqual(emptyLayout());
  });
  it("closing the focused pane moves the focus to its neighbour; closing another keeps it", () => {
    let l = addPane(emptyLayout(), P("a")); l = addPane(l, P("b")); l = addPane(l, P("c"));
    expect(closePane(focusPane(l, "b"), "b").focus).toBe("c");
    expect(closePane(focusPane(l, "a"), "c").focus).toBe("a");
  });
  it("a zoomed pane that closes un-zooms", () => {
    let l = addPane(addPane(emptyLayout(), P("a")), P("b")); l = toggleZoom(l, "b");
    expect(closePane(l, "b").zoom).toBeNull();
  });
  it("a nested split collapses when it is left with one pane", () => {
    let l = addPane(emptyLayout(), P("a")); l = addPane(l, P("b")); l = splitPane(l, "b", "below", P("c"));
    l = closePane(l, "c");
    const r = l.root as Split; expect(r.children.every((c) => c.type === "leaf")).toBe(true);
  });
});

describe("sizes, focus, zoom, swap", () => {
  it("normalize scales to one and lifts a sliver to the minimum", () => {
    expect(sum(normalize([3, 1]))).toBeCloseTo(1, 9);
    const n = normalize([0.99, 0.005, 0.005]); expect(Math.min(...n)).toBeGreaterThanOrEqual(MIN_SHARE - 1e-9); expect(sum(n)).toBeCloseTo(1, 9);
    expect(normalize([0, 0, 0])).toEqual([1 / 3, 1 / 3, 1 / 3]); expect(normalize([NaN, -2])).toEqual([0.5, 0.5]);
  });
  it("setSizes sets the split at a path, normalised, and ignores a wrong length", () => {
    const l = addPane(addPane(emptyLayout(), P("a")), P("b"));
    expect((setSizes(l, [], [3, 1]).root as Split).sizes).toEqual([0.75, 0.25]);
    expect(setSizes(l, [], [1, 1, 1])).toEqual(l);
  });
  it("focus cycles in reading order, both ways, and only to panes that exist", () => {
    let l = addPane(emptyLayout(), P("a")); l = addPane(l, P("b")); l = addPane(l, P("c")); l = focusPane(l, "a");
    expect(cycleFocus(l, 1).focus).toBe("b"); expect(cycleFocus(l, -1).focus).toBe("c"); expect(focusPane(l, "ghost")).toBe(l);
  });
  it("zoom toggles and ignores a missing pane", () => {
    const l = addPane(addPane(emptyLayout(), P("a")), P("b"));
    expect(toggleZoom(l, "a").zoom).toBe("a"); expect(toggleZoom(toggleZoom(l, "a"), "a").zoom).toBeNull(); expect(toggleZoom(l, "ghost")).toBe(l);
  });
  it("swap exchanges two panes and leaves the sizes where they were", () => {
    let l = addPane(addPane(emptyLayout(), P("a")), P("b")); l = setSizes(l, [], [3, 1]);
    const s = swapPanes(l, "a", "b"); expect(ids(s)).toEqual(["b", "a"]); expect((s.root as Split).sizes).toEqual([0.75, 0.25]);
  });
  it("updatePane changes a title without moving the pane, and never its id", () => {
    const l = updatePane(addPane(addPane(emptyLayout(), P("a")), P("b")), "b", { title: "tests", id: "hacked" } as Partial<PaneRef>);
    expect(ids(l)).toEqual(["a", "b"]); expect(leaves(l.root)[1].title).toBe("tests");
  });
});

describe("what comes back from storage is never trusted", () => {
  it("round-trips", () => {
    let l = addPane(emptyLayout(), P("a")); l = addPane(l, P("b", "shell")); l = splitPane(l, "b", "below", { id: "t", kind: "tool", tool: "issues" });
    expect(parseLayout(serializeLayout(l))).toEqual(l);
  });
  it("garbage, wrong shapes and bad JSON give an empty layout", () => {
    for (const bad of [null, 7, "not json", "{", { root: 3 }, { root: { type: "leaf" } }, { root: { type: "leaf", pane: { id: "", kind: "engine" } } }]) expect(parseLayout(bad as never)).toEqual(emptyLayout());
  });
  it("drops a duplicate pane and an unknown kind, collapses what is left, repairs focus", () => {
    const raw = { root: { type: "split", dir: "row", sizes: [1, 1, 1], children: [
      { type: "leaf", pane: { id: "a", kind: "engine" } }, { type: "leaf", pane: { id: "a", kind: "engine" } }, { type: "leaf", pane: { id: "x", kind: "spaceship" } }] }, focus: "ghost", zoom: "ghost" };
    const l = parseLayout(raw);
    expect(ids(l)).toEqual(["a"]); expect(l.root?.type).toBe("leaf"); expect(l.focus).toBe("a"); expect(l.zoom).toBeNull();
  });
  it("repairs sizes that do not add up, and a depth bomb does not recurse forever", () => {
    const l = parseLayout({ root: { type: "split", dir: "col", sizes: [5, 5, 5], children: [{ type: "leaf", pane: { id: "a", kind: "shell" } }, { type: "leaf", pane: { id: "b", kind: "shell" } }] } });
    expect(sum((l.root as Split).sizes)).toBeCloseTo(1, 9);
    let deep: any = { type: "leaf", pane: { id: "z", kind: "shell" } };
    for (let i = 0; i < 40; i += 1) deep = { type: "split", dir: "row", sizes: [1, 1], children: [deep, { type: "leaf", pane: { id: `q${i}`, kind: "shell" } }] };
    expect(() => parseLayout({ root: deep })).not.toThrow();
  });
  it("keeps the serve's pane id and drops one that is not a number", () => {
    const l = parseLayout({ root: { type: "split", dir: "row", sizes: [1, 1], children: [
      { type: "leaf", pane: { id: "a", kind: "engine", paneId: 42 } }, { type: "leaf", pane: { id: "b", kind: "shell", paneId: "42" } }] } });
    expect(leaves(l.root).map((p) => p.paneId)).toEqual([42, undefined]);
  });
  it("a title is capped", () => {
    expect(leaves(parseLayout({ root: { type: "leaf", pane: { id: "a", kind: "shell", title: "x".repeat(500) } } }).root)[0].title).toHaveLength(80);
  });
});

describe("moving a pane, and turning a split the other way", () => {
  const three = (): Layout => addPane(addPane(addPane(emptyLayout(), P("a")), P("b")), P("c"));
  it("dropping on the left or right of a pane puts it there in a row, on the top or bottom in a column", () => {
    const l = three();
    expect(ids(movePane(l, "c", "a", "left"))).toEqual(["c", "a", "b"]);
    const col = movePane(l, "c", "a", "below"); expect(ids(col)).toEqual(["a", "c", "b"]);
    const root = col.root as Split; expect(root.dir).toBe("row"); expect((root.children[0] as Split).dir).toBe("col");
    expect(ids(movePane(l, "a", "c", "above"))).toEqual(["b", "a", "c"]);
  });
  it("the pane that left gives its share back, nothing is lost, and the moved pane takes the focus", () => {
    const m = movePane(three(), "c", "a", "below");
    expect(ids(m).sort()).toEqual(["a", "b", "c"]); expect(m.focus).toBe("c");
    const sums = (n: any): boolean => n.type === "leaf" || (Math.abs(n.sizes.reduce((x: number, y: number) => x + y, 0) - 1) < 1e-9 && n.children.every(sums));
    expect(sums(m.root)).toBe(true);
  });
  it("onto itself, from or to a pane that is not there, or in a layout of one, changes nothing", () => {
    const l = three();
    expect(movePane(l, "a", "a", "left")).toBe(l); expect(movePane(l, "ghost", "a", "left")).toBe(l); expect(movePane(l, "a", "ghost", "left")).toBe(l);
    const one = addPane(emptyLayout(), P("a")); expect(movePane(one, "a", "a", "right")).toBe(one);
  });
  it("a move un-zooms, so the person sees where it went", () => {
    const z = toggleZoom(three(), "a"); expect(movePane(z, "c", "a", "left").zoom).toBeNull();
  });
  it("flipping turns the pane's own split, and only that one", () => {
    const l = splitPane(three(), "b", "below", P("d"));   // a | [b over d] | c
    const f = flipSplit(l, "b"); const inner = (f.root as Split).children[1] as Split;
    expect(inner.dir).toBe("row"); expect((f.root as Split).dir).toBe("row");
    const g = flipSplit(l, "a"); expect((g.root as Split).dir).toBe("col"); expect(((g.root as Split).children[1] as Split).dir).toBe("col");
    expect(flipSplit(l, "ghost")).toBe(l); const one = addPane(emptyLayout(), P("a")); expect(flipSplit(one, "a")).toBe(one);
    expect(ids(flipSplit(l, "b"))).toEqual(ids(l));
  });
});

describe("resizePane", () => {
  const sh = (id: string): PaneRef => ({ id, kind: "shell", paneId: Number(id.replace(/\D/g, "")) });
  const three = () => { let l = addPane(emptyLayout(), sh("a1")); l = splitPane(l, "a1", "right", sh("b2")); l = splitPane(l, "b2", "right", sh("c3")); return l; };
  const sizes = (l: Layout) => (l.root as { sizes: number[] }).sizes;
  it("gives a pane its share and the others keep their proportions among the rest", () => {
    const l = three(); const base = sizes(l); expect(base.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const r = resizePane(l, "a1", 0.6); expect(sizes(r)[0]).toBeCloseTo(0.6); expect(sizes(r).reduce((a, b) => a + b, 0)).toBeCloseTo(1); expect(sizes(r)[1] / sizes(r)[2]).toBeCloseTo(base[1] / base[2]);
  });
  it("never squeezes any pane under the minimum share, on either side", () => {
    const l = three(); expect(sizes(resizePane(l, "b2", 0.0))[1]).toBeCloseTo(MIN_SHARE); expect(Math.min(...sizes(resizePane(l, "b2", 1)))).toBeGreaterThanOrEqual(MIN_SHARE - 1e-9);
  });
  it("a pane alone, one that is not there, an empty layout and a nonsense share change nothing", () => {
    const one = addPane(emptyLayout(), sh("a1")); expect(resizePane(one, "a1", 0.5)).toBe(one); const l = three();
    expect(resizePane(l, "zz", 0.5)).toBe(l); expect(resizePane(emptyLayout(), "a1", 0.5).root).toBeNull(); expect(resizePane(l, "a1", NaN)).toBe(l);
  });
  it("works in a nested split: only that pane's own split changes", () => {
    let l = three(); l = splitPane(l, "c3", "below", sh("d4")); const before = JSON.stringify((l.root as { sizes: number[] }).sizes);
    const r = resizePane(l, "d4", 0.8); expect(JSON.stringify((r.root as { sizes: number[] }).sizes)).toBe(before); const inner = ((r.root as any).children[2]).sizes as number[]; expect(inner[1]).toBeCloseTo(0.8);
  });
});

describe("a side question's pane", () => {
  it("keeps the agent it is about through a save and a load, and drops a bad number", () => {
    const l = { root: { type: "leaf", pane: { id: "claude-code-9", kind: "engine", engine: "claude-code", paneId: 9, side: 7 } }, focus: null, zoom: null };
    expect(parseLayout(JSON.parse(serializeLayout(parseLayout(l)))).root).toMatchObject({ pane: { side: 7 } });
    expect(parseLayout({ ...l, root: { type: "leaf", pane: { id: "a-1", kind: "engine", side: -3 } } }).root).not.toHaveProperty("pane.side");
  });
});

describe("folding a pane into a strip", () => {
  const two = { root: { type: "split", dir: "row", sizes: [0.5, 0.5], children: [{ type: "leaf", pane: { id: "a", kind: "shell", title: "A" } }, { type: "leaf", pane: { id: "b", kind: "shell", title: "B" } }] }, focus: "a", zoom: null } as any;
  const kids = (l: any) => l.root.children.map((c: any) => c.pane);
  it("folds one pane and opens it again, keeps it through a save and a load, and never folds the last open pane", () => {
    const folded = toggleCollapse(two, "a"); expect(kids(folded)[0].collapsed).toBe(true); expect(kids(folded)[1].collapsed).toBeUndefined();
    expect(parseLayout(JSON.parse(serializeLayout(parseLayout(folded)))).root).toMatchObject({ children: [{ pane: { id: "a", collapsed: true } }, { pane: { id: "b" } }] });
    expect(toggleCollapse(folded, "b")).toBe(folded);   // b is the only one left open: it stays open
    const open = toggleCollapse(folded, "a"); expect("collapsed" in kids(open)[0]).toBe(false); expect(toggleCollapse(two, "zzz")).toBe(two);
    expect(toggleCollapse({ root: null, focus: null, zoom: null } as any, "a").root).toBeNull();
  });
  it("a fork's Leader is a terminal marked leaderOf: it survives the stored layout and is never taken for the team's own Leader", async () => {
    const { parseLayout } = await import("./layout"); const { leaderPaneOf, teamRequired } = await import("./team-panes");
    const l = parseLayout({ root: { type: "split", dir: "row", children: [{ type: "leaf", pane: { id: "t", kind: "tool", tool: "team", teamId: "video-editing" } }, { type: "leaf", pane: { id: "a", kind: "engine", engine: "claude-code", paneId: 5 } }, { type: "leaf", pane: { id: "b", kind: "engine", engine: "cursor", paneId: 9, leaderOf: "Video editing--t-try" } }], sizes: [1, 1, 1] }, focus: "t" });
    const panes = (function lv(n: any): any[] { return n.type === "leaf" ? [n.pane] : n.children.flatMap(lv); })(l.root);
    expect(panes.find((p: any) => p.id === "b").leaderOf).toBe("Video editing--t-try"); expect(leaderPaneOf(panes, "video-editing", 0)).toBe(5); expect([...teamRequired(panes, "video-editing", 0)].sort()).toEqual(["a", "t"]);
    expect(parseLayout({ root: { type: "leaf", pane: { id: "x", kind: "engine", leaderOf: "<script>" } } }).root).toBeTruthy();
  });
});

describe("a specialist's pane survives a reload", () => {
  it("keeps its id, and drops a malformed one", () => {
    const L = { root: { type: "leaf", pane: { id: "a", kind: "engine", engine: "claude-code", specialist: { id: "copy-chief" } } }, focus: "a", zoom: null };
    const back = parseLayout(JSON.parse(JSON.stringify(L))) as { root: { pane: { specialist?: { id: string } } } };
    expect(back.root.pane.specialist).toEqual({ id: "copy-chief" });
    const bad = parseLayout({ root: { type: "leaf", pane: { id: "a", kind: "engine", engine: "claude-code", specialist: { id: "../x" } } }, focus: "a", zoom: null }) as { root: { pane: { specialist?: unknown } } };
    expect(bad.root.pane.specialist).toBeUndefined();
  });
});
