// groupByFile turns the flat node/edge atlas into the per-file view the explorer renders. Its
// contract is easy to break in ways nothing surfaces: an edge attributed to the wrong file, a
// duplicated import, or a symbol counted as its own file.
import { describe, it, expect } from "vitest";
import { groupByFile } from "./atlas-view";

const file = (path: string, id = `f:${path}`) => ({ id, path, type: "file", name: path } as any);
const def = (path: string, name: string, id = `d:${name}`) => ({ id, path, type: "function", name } as any);
const edge = (from: string, to: string, type: string) => ({ from_node: from, to_node: to, type } as any);

describe("grouping", () => {
  it("puts the file node and its definitions in one group", () => {
    const g = groupByFile([file("a.ts"), def("a.ts", "foo"), def("a.ts", "bar")], []);
    expect(g).toHaveLength(1);
    expect(g[0].path).toBe("a.ts");
    expect(g[0].fileNode!.id).toBe("f:a.ts");
    expect(g[0].defs.map((d: any) => d.name)).toEqual(["bar", "foo"]); // sorted, see below
  });

  it("keeps the file node OUT of defs — it is the container, not a definition", () => {
    expect(groupByFile([file("a.ts")], [])[0].defs).toEqual([]);
  });

  it("creates a group for a file that only has symbols and no file node", () => {
    const g = groupByFile([def("a.ts", "foo")], []);
    expect(g[0].fileNode).toBeNull();
    expect(g[0].defs).toHaveLength(1);
  });

  it("separates files", () => {
    const g = groupByFile([file("a.ts"), file("b.ts"), def("b.ts", "x")], []);
    expect(g.map((x) => x.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("returns an empty list for no nodes", () => {
    expect(groupByFile([], [])).toEqual([]);
  });
});

// Everything is sorted before returning, so the same atlas always renders in the same order —
// otherwise React reshuffles the file list on every refetch and the operator loses their place.
describe("stable ordering", () => {
  it("orders groups by path regardless of node order", () => {
    const g = groupByFile([file("z.ts"), file("a.ts"), file("m.ts")], []);
    expect(g.map((x) => x.path)).toEqual(["a.ts", "m.ts", "z.ts"]);
  });

  it("orders defs by type then name, so kinds stay clustered", () => {
    const nodes = [
      file("a.ts"),
      { id: "1", path: "a.ts", type: "function", name: "zeta" },
      { id: "2", path: "a.ts", type: "class", name: "Beta" },
      { id: "3", path: "a.ts", type: "function", name: "alpha" },
    ] as any;
    expect(groupByFile(nodes, [])[0].defs.map((d: any) => `${d.type}:${d.name}`))
      .toEqual(["class:Beta", "function:alpha", "function:zeta"]);
  });

  it("orders imports alphabetically", () => {
    const g = groupByFile([file("a.ts")], [
      { from_node: "f:a.ts", to_node: "zod", type: "imports" },
      { from_node: "f:a.ts", to_node: "axios", type: "imports" },
    ] as any);
    expect(g[0].imports).toEqual(["axios", "zod"]);
  });

  it("tolerates a def with no name", () => {
    const nodes = [file("a.ts"), { id: "1", path: "a.ts", type: "function" }] as any;
    expect(() => groupByFile(nodes, [])).not.toThrow();
  });
});

describe("imports", () => {
  it("records the TARGET FILE's path, not the raw node id", () => {
    const g = groupByFile(
      [file("a.ts"), file("b.ts")],
      [edge("f:a.ts", "f:b.ts", "imports")],
    );
    expect(g.find((x) => x.path === "a.ts")!.imports).toEqual(["b.ts"]);
  });

  it("falls back to the raw endpoint for an import of something outside the atlas", () => {
    // External packages have no node — dropping them would understate a file's dependencies.
    const g = groupByFile([file("a.ts")], [edge("f:a.ts", "react", "imports")]);
    expect(g[0].imports).toEqual(["react"]);
  });

  it("DEDUPES repeated imports of the same target", () => {
    const g = groupByFile(
      [file("a.ts"), file("b.ts"), def("a.ts", "x"), def("a.ts", "y")],
      [edge("f:a.ts", "f:b.ts", "imports"), edge("d:x", "f:b.ts", "imports"), edge("d:y", "f:b.ts", "imports")],
    );
    expect(g.find((x) => x.path === "a.ts")!.imports).toEqual(["b.ts"]);
  });

  it("attributes an edge from a SYMBOL to that symbol's file", () => {
    const g = groupByFile(
      [file("a.ts"), def("a.ts", "x"), file("b.ts")],
      [edge("d:x", "f:b.ts", "imports")],
    );
    expect(g.find((y) => y.path === "a.ts")!.imports).toEqual(["b.ts"]);
  });

  it("ignores an edge whose SOURCE is unknown — it cannot be attributed to any file", () => {
    const g = groupByFile([file("a.ts")], [edge("ghost", "f:a.ts", "imports")]);
    expect(g[0].imports).toEqual([]);
  });
});

describe("calls", () => {
  it("counts outgoing calls per file", () => {
    const g = groupByFile(
      [file("a.ts"), def("a.ts", "x")],
      [edge("d:x", "somewhere", "calls"), edge("f:a.ts", "elsewhere", "calls")],
    );
    expect(g[0].callsOut).toBe(2);
  });

  it("counts every call, including repeats to the same target", () => {
    const g = groupByFile([file("a.ts")], [edge("f:a.ts", "t", "calls"), edge("f:a.ts", "t", "calls")]);
    expect(g[0].callsOut).toBe(2);
  });

  it("does not confuse calls with imports", () => {
    const g = groupByFile(
      [file("a.ts"), file("b.ts")],
      [edge("f:a.ts", "f:b.ts", "calls"), edge("f:a.ts", "f:b.ts", "imports")],
    );
    const a = g.find((x) => x.path === "a.ts")!;
    expect(a.callsOut).toBe(1);
    expect(a.imports).toEqual(["b.ts"]);
  });

  it("ignores an edge type it does not model", () => {
    const g = groupByFile([file("a.ts")], [edge("f:a.ts", "t", "extends")]);
    expect(g[0].callsOut).toBe(0);
    expect(g[0].imports).toEqual([]);
  });

  it("starts every group at zero", () => {
    expect(groupByFile([file("a.ts")], [])[0].callsOut).toBe(0);
  });
});
