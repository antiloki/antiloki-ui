import { describe, it, expect } from "vitest";
import { computeBlockLayout, flattenBlocks, shortId, plannedToDiagram } from "./blueprint-tab";
import type { Blueprint } from "@/loki/api/blueprint";

const mol: Blueprint = {
  contract_slug: "CT",
  version: 1,
  blocks: [
    { id: "src/a.ts", type: "file", path: "src/a.ts", intent: "logic a", children: [{ id: "src/a.ts.f", type: "function", intent: "m", authored: true, children: [] }] },
    { id: "src/b.ts", type: "file", path: "src/b.ts", intent: "logic b", children: [{ id: "src/b.ts.g", type: "function", intent: "m", authored: false, children: [] }] },
  ],
  bindings: [{ output: "src/a.ts.f", input: "src/b.ts.g", type: "User[]" }],
};

describe("computeBlockLayout", () => {
  it("lays nuclei into dependency layers (downstream file block further right)", () => {
    const l = computeBlockLayout(mol)!;
    expect(l.fileBlocks.length).toBe(2);
    const a = l.fileBlocks.find((x) => x.path === "src/a.ts")!;
    const b = l.fileBlocks.find((x) => x.path === "src/b.ts")!;
    expect(b.cx).toBeGreaterThan(a.cx);
  });

  it("positions each file block's child blocks on its orbit (radius from the nucleus)", () => {
    const l = computeBlockLayout(mol)!;
    const a = l.fileBlocks.find((x) => x.path === "src/a.ts")!;
    expect(a.children.length).toBe(1);
    const e = a.children[0];
    const r = Math.hypot(e.ex - a.cx, e.ey - a.cy);
    expect(Math.round(r)).toBe(Math.round(a.orbitR));
    expect(a.authored).toBe(1);
  });

  it("builds one binding per resolvable binding, carrying its type label", () => {
    const l = computeBlockLayout(mol)!;
    expect(l.bindings.length).toBe(1);
    expect(l.bindings[0].type).toBe("User[]");
    expect(l.bindings[0].path.startsWith("M ")).toBe(true);
  });

  it("drops a binding whose endpoints don't resolve", () => {
    const l = computeBlockLayout({ ...mol, bindings: [{ output: "nope", input: "src/b.ts.g" }] })!;
    expect(l.bindings.length).toBe(0);
  });

  it("returns null when there are no file blocks", () => {
    expect(computeBlockLayout({ contract_slug: "X", blocks: [] })).toBeNull();
    expect(computeBlockLayout(null)).toBeNull();
  });
});

describe("flattenBlocks", () => {
  it("flattens nested children depth-first with depth markers", () => {
    const flat = flattenBlocks([
      { id: "p", type: null, intent: null, authored: false, children: [{ id: "c", type: null, intent: null, authored: true, children: [] }] },
    ]);
    expect(flat.map((e) => [e.id, e.depth])).toEqual([["p", 0], ["c", 1]]);
  });
});

describe("shortId", () => {
  it("shows the trailing segment of a dotted/slashed block id", () => {
    expect(shortId("src/filter.ts.filterUsers")).toBe("filterUsers");
  });
});

describe("plannedToDiagram (AST-skeleton delta highlighting)", () => {
  const planned: Blueprint = {
    contract_slug: "CT",
    planned_nodes: [
      { id: "src/util.js", type: "file", name: "src/util.js", path: "src/util.js" },
      { id: "src/util.js#foo", type: "function", name: "foo", path: "src/util.js", signature: "(a, b)" },
      { id: "src/new.js", type: "file", name: "src/new.js", path: "src/new.js" },
      { id: "src/new.js#hello", type: "function", name: "hello", path: "src/new.js", signature: "()" },
    ],
    planned_edges: [{ from_node: "src/new.js", to_node: "src/util.js", type: "imports" }],
    delta: {
      by_id: { "src/util.js": "unchanged", "src/util.js#foo": "changed", "src/new.js": "added", "src/new.js#hello": "added" },
      counts: { added: 2, changed: 1, unchanged: 1, removed: 0 },
    },
  };

  it("dims the unchanged neighborhood and keeps added/changed at full opacity", () => {
    const d = plannedToDiagram(planned)!;
    const byId = Object.fromEntries(d.nodes.map((n: any) => [n.id, n]));
    expect(byId["src/util.js"].dim).toBe(true);          // unchanged → dimmed
    expect(byId["src/util.js#foo"].dim).toBe(false);     // changed → bright
    expect(byId["src/new.js#hello"].dim).toBe(false);    // added → bright
  });

  it("captions the delta counts and maps a resolvable planned edge", () => {
    const d = plannedToDiagram(planned)!;
    expect(d.caption).toContain("**2** added");
    expect(d.caption).toContain("**1** changed");
    expect(d.edges).toEqual([{ from: "src/new.js", to: "src/util.js", label: "" }]); // 'imports' label suppressed
  });

  it("returns null for a pre-stub design (no planned graph) → falls back to blocks", () => {
    expect(plannedToDiagram({ contract_slug: "X" })).toBeNull();
    expect(plannedToDiagram({ contract_slug: "X", planned_nodes: [{ id: "only-one" }] })).toBeNull();
  });
});
