import { describe, it, expect } from "vitest";
import { addPane, emptyLayout, splitPane, type Layout, type PaneRef } from "./layout";
import { focusToward, neighbour, rectsOf, shiftPane } from "./geometry";

const p = (id: string): PaneRef => ({ id, kind: "shell", paneId: Number(id.replace(/\D/g, "")) || 1 });
// a | (b over c)
const L = (): Layout => { let l = addPane(emptyLayout(), p("a")); l = splitPane(l, "a", "right", p("b")); l = splitPane(l, "b", "below", p("c")); return { ...l, focus: "a" }; };

describe("where the panes are", () => {
  it("lays the tree out on a unit square by the splits' shares", () => {
    const r = rectsOf(L());
    expect(r.get("a")).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(r.get("b")).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 }); expect(r.get("c")).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(rectsOf(emptyLayout()).size).toBe(0);
  });
  it("a neighbour is the nearest pane beyond the edge that shares some of the extent", () => {
    const l = L();
    expect(neighbour(l, "a", "right")).toMatch(/^[bc]$/);       // both touch a's right edge equally; either is next door
    expect(neighbour(l, "b", "left")).toBe("a"); expect(neighbour(l, "c", "left")).toBe("a");
    expect(neighbour(l, "b", "down")).toBe("c"); expect(neighbour(l, "c", "up")).toBe("b");
    expect(neighbour(l, "a", "left")).toBeNull(); expect(neighbour(l, "a", "up")).toBeNull(); expect(neighbour(l, "b", "up")).toBeNull(); expect(neighbour(l, "c", "right")).toBeNull();
    expect(neighbour(l, "nope", "left")).toBeNull();
  });
  it("of two panes next door, the one sharing more of the extent wins", () => {
    let l = addPane(emptyLayout(), p("a")); l = splitPane(l, "a", "right", p("b")); l = splitPane(l, "b", "below", p("c"));
    // make b much taller than c
    const root = l.root as any; root.children[1].sizes = [0.8, 0.2]; l = { ...l, root };
    expect(neighbour(l, "a", "right")).toBe("b");
  });
  it("focus follows a direction and stays where it is at an edge; a move trades places and stays put at an edge", () => {
    const l = L();
    expect(focusToward({ ...l, focus: "b" }, "left").focus).toBe("a"); expect(focusToward({ ...l, focus: "b" }, "up").focus).toBe("b");
    const moved = shiftPane({ ...l, focus: "b" }, "b", "down"); expect(rectsOf(moved).get("b")).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }); expect(rectsOf(moved).get("c")?.y).toBe(0);
    expect(shiftPane(l, "a", "left")).toBe(l); expect(shiftPane(l, null, "left")).toBe(l);
    const across = shiftPane(l, "a", "right"); expect(rectsOf(across).get("a")?.x).toBe(0.5);
  });
});
