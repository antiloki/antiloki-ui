// The scope tree is how an operator decides what a notebook (or the Studio) is allowed to read, so
// its two derived structures have to be exactly right: the folder nesting built from flat paths, and
// the CUMULATIVE token map — a folder's chip has to add up its whole subtree or the operator picks a
// scope believing it costs a fraction of what it does.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { buildTree, topKids, buildTokenMap, Check, TreeNode } from "./checkbox-tree";

describe("buildTree", () => {
  it("nests flat paths into folders, marking only the leaf as a file", () => {
    const t = buildTree(["src/a.ts", "src/deep/b.ts"]);
    const src = t.children.src;
    expect(src.isFile).toBe(false);
    expect(src.path).toBe("src");
    expect(src.children["a.ts"]).toMatchObject({ path: "src/a.ts", isFile: true });
    expect(src.children.deep.children["b.ts"]).toMatchObject({ path: "src/deep/b.ts", isFile: true });
  });

  it("merges paths that share a prefix into one branch", () => {
    const t = buildTree(["a/b/one.ts", "a/b/two.ts", "a/c/three.ts"]);
    expect(Object.keys(t.children.a.children)).toEqual(["b", "c"]);
    expect(Object.keys(t.children.a.children.b.children)).toEqual(["one.ts", "two.ts"]);
  });

  it("ignores empty segments from leading, trailing or doubled slashes", () => {
    const t = buildTree(["/src//a.ts/"]);
    expect(t.children.src.children["a.ts"].path).toBe("src/a.ts");
  });

  it("handles a bare filename and an empty list", () => {
    expect(buildTree(["a.ts"]).children["a.ts"].isFile).toBe(true);
    expect(Object.keys(buildTree([]).children)).toEqual([]);
  });
});

describe("topKids ordering", () => {
  it("puts folders before files, each alphabetical", () => {
    const t = buildTree(["z.ts", "a.ts", "zed/x.ts", "abc/y.ts"]);
    expect(topKids(t).map((k: any) => k.name)).toEqual(["abc", "zed", "a.ts", "z.ts"]);
  });

  it("returns an empty list for a childless node instead of throwing", () => {
    expect(topKids({})).toEqual([]);
  });
});

describe("buildTokenMap", () => {
  it("adds each file's tokens into every ancestor folder", () => {
    const m = buildTokenMap({ "src/a.ts": 100, "src/deep/b.ts": 50 })!;
    expect(m["src/a.ts"]).toBe(100);
    expect(m["src/deep/b.ts"]).toBe(50);
    expect(m["src/deep"]).toBe(50);
    expect(m.src).toBe(150);            // the whole subtree, not just direct children
  });

  it("keeps sibling branches independent", () => {
    const m = buildTokenMap({ "a/x.ts": 10, "b/y.ts": 20 })!;
    expect(m.a).toBe(10);
    expect(m.b).toBe(20);
  });

  it("passes null through so callers can render no chips at all", () => {
    expect(buildTokenMap(null)).toBeNull();
    expect(buildTokenMap(undefined)).toBeNull();
    expect(buildTokenMap({})).toEqual({});
  });
});

describe("Check", () => {
  it("shows a tick only when on", () => {
    const { container, unmount } = render(<Check on />);
    expect(container.textContent).toBe("✓");
    unmount();
    expect(render(<Check on={false} />).container.textContent).toBe("");
  });

  it("dims itself when the state was inherited rather than chosen", () => {
    const solid = render(<Check on />).container.firstChild as HTMLElement;
    const dim = render(<Check on dim />).container.firstChild as HTMLElement;
    expect(parseFloat(dim.style.opacity)).toBeLessThan(parseFloat(solid.style.opacity || "1"));
  });
});

describe("TreeNode", () => {
  const tree = buildTree(["src/a.ts", "src/deep/b.ts"]);
  const node = tree.children.src;

  const mount = (over: any = {}) => {
    const props = {
      node, depth: 0,
      checked: new Set<string>(), onToggle: vi.fn(),
      expanded: new Set<string>(), toggleExp: vi.fn(),
      forceOpen: false, ancestorChecked: false, token: null,
      ...over,
    };
    return { props, ...render(<TreeNode {...props} />) };
  };

  it("shows a folder collapsed, with a trailing slash to distinguish it from a file", () => {
    mount();
    expect(screen.getByText("src/")).toBeTruthy();
    expect(screen.queryByText("a.ts")).toBeNull();   // children hidden while collapsed
    expect(screen.getByText("▸")).toBeTruthy();
  });

  it("reveals children once expanded and flips the caret", () => {
    mount({ expanded: new Set(["src"]) });
    expect(screen.getByText("a.ts")).toBeTruthy();
    expect(screen.getByText("deep/")).toBeTruthy();
    expect(screen.getByText("▾")).toBeTruthy();
  });

  it("forceOpen expands the whole subtree without touching the expanded set", () => {
    mount({ forceOpen: true });
    expect(screen.getByText("b.ts")).toBeTruthy();   // two levels down
  });

  it("clicking a folder name expands it rather than toggling its checkbox", () => {
    const { props } = mount();
    fireEvent.click(screen.getByText("src/"));
    expect(props.toggleExp).toHaveBeenCalledWith("src");
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it("clicking a FILE name toggles it, since a file has nothing to expand", () => {
    const { props } = mount({ node: tree.children.src.children["a.ts"] });
    fireEvent.click(screen.getByText("a.ts"));
    expect(props.onToggle).toHaveBeenCalledWith("src/a.ts");
  });

  it("clicking the checkbox toggles that path", () => {
    const { props } = mount();
    // row = [caret, checkbox wrapper, name]
    fireEvent.click(screen.getByText("src/").parentElement!.children[1]);
    expect(props.onToggle).toHaveBeenCalledWith("src");
    expect(props.toggleExp).not.toHaveBeenCalled();
  });

  it("a checked ancestor ticks every descendant and locks them against toggling", () => {
    const { props } = mount({ ancestorChecked: true, forceOpen: true });
    expect(screen.getAllByText("✓").length).toBeGreaterThan(1);
    fireEvent.click(screen.getByText("a.ts").parentElement!.children[1]);
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it("indents each level so the hierarchy is readable", () => {
    const { container } = mount({ forceOpen: true });
    const rows = Array.from(container.querySelectorAll("div > div")) as HTMLElement[];
    const pads = rows.map((r) => parseFloat(r.style.paddingLeft || "0"));
    expect(Math.max(...pads)).toBeGreaterThan(Math.min(...pads));
  });

  it("shows a token chip per row when a token source is given, and none without one", () => {
    const tokens = buildTokenMap({ "src/a.ts": 1200, "src/deep/b.ts": 800 })!;
    const { unmount } = mount({ forceOpen: true, token: (p: string) => tokens[p] ?? null });
    expect(screen.getByTitle(/2,000 tokens/)).toBeTruthy();   // the folder sums its subtree
    unmount();
    mount({ forceOpen: true });
    expect(screen.queryByTitle(/tokens/)).toBeNull();
  });

  it("hides the chip for a path with no tokens instead of printing ~0", () => {
    mount({ forceOpen: true, token: () => 0 });
    expect(screen.queryByTitle(/tokens/)).toBeNull();
  });
});
