// buildTree/sortKids build the IDE's file tree from a flat path list. The interesting cases are the
// ones a flat list hides: shared prefixes must MERGE into one folder rather than duplicate, and a
// Windows-separated path must produce the same tree as a posix one.
import { describe, it, expect } from "vitest";
import { buildTree, sortKids } from "./file-tree";

const f = (path: string, fileNode: any = { path }) => ({ path, fileNode });
const names = (n: any) => sortKids(n).map((k: any) => k.name);

describe("buildTree", () => {
  it("nests a path into one node per segment", () => {
    const root = buildTree([f("src/loki/a.ts")]);
    const src = root.children.get("src")!;
    const loki = src.children.get("loki")!;
    const a = loki.children.get("a.ts")!;
    expect(src.isFile).toBe(false);
    expect(loki.isFile).toBe(false);
    expect(a.isFile).toBe(true);
  });

  it("gives every node its full path, not just its name", () => {
    const root = buildTree([f("src/loki/a.ts")]);
    expect(root.children.get("src")!.path).toBe("src");
    expect(root.children.get("src")!.children.get("loki")!.path).toBe("src/loki");
    expect(root.children.get("src")!.children.get("loki")!.children.get("a.ts")!.path).toBe("src/loki/a.ts");
  });

  it("MERGES a shared prefix instead of creating it twice", () => {
    const root = buildTree([f("src/a.ts"), f("src/b.ts")]);
    expect(root.children.size).toBe(1);
    expect(names(root.children.get("src")!)).toEqual(["a.ts", "b.ts"]);
  });

  it("attaches the file payload only to the leaf", () => {
    const root = buildTree([f("src/a.ts", { tokens: 42 })]);
    const src = root.children.get("src")!;
    expect(src.fileNode).toBeUndefined();
    expect(src.children.get("a.ts")!.fileNode).toEqual({ tokens: 42 });
  });

  it("normalises Windows separators to the same tree as posix", () => {
    const win = buildTree([f("src\\loki\\a.ts")]);
    expect(win.children.get("src")!.children.get("loki")!.children.get("a.ts")!.path).toBe("src/loki/a.ts");
  });

  it("drops empty segments from leading, trailing and doubled slashes", () => {
    const root = buildTree([f("/src//a.ts")]);
    expect(root.children.size).toBe(1);
    expect(root.children.get("src")!.children.has("a.ts")).toBe(true);
  });

  it("handles a bare filename at the root", () => {
    const root = buildTree([f("README.md")]);
    expect(root.children.get("README.md")!.isFile).toBe(true);
  });

  it("returns an empty root for no files", () => {
    const root = buildTree([]);
    expect(root.children.size).toBe(0);
    expect(root.path).toBe("");
  });

  it("keeps a directory a directory even when a file shares its name elsewhere", () => {
    const root = buildTree([f("src/lib/a.ts"), f("lib")]);
    expect(root.children.get("lib")!.isFile).toBe(true);
    expect(root.children.get("src")!.children.get("lib")!.isFile).toBe(false);
  });

  it("does not lose a file when a deeper path is added under the same folder", () => {
    const root = buildTree([f("src/a.ts"), f("src/deep/b.ts")]);
    expect(names(root.children.get("src")!)).toEqual(["deep", "a.ts"]);
  });
});

describe("sortKids — folders first, then files, each alphabetical", () => {
  it("puts folders before files", () => {
    const root = buildTree([f("z-file.ts"), f("a-folder/x.ts")]);
    expect(names(root)).toEqual(["a-folder", "z-file.ts"]);
  });

  it("sorts folders alphabetically among themselves", () => {
    const root = buildTree([f("b/x.ts"), f("a/x.ts"), f("c/x.ts")]);
    expect(names(root)).toEqual(["a", "b", "c"]);
  });

  it("sorts files alphabetically among themselves", () => {
    const root = buildTree([f("c.ts"), f("a.ts"), f("b.ts")]);
    expect(names(root)).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("returns an empty list for a leaf", () => {
    const root = buildTree([f("a.ts")]);
    expect(sortKids(root.children.get("a.ts")!)).toEqual([]);
  });

  it("does not mutate the underlying children map order", () => {
    const root = buildTree([f("z.ts"), f("a/x.ts")]);
    const before = [...root.children.keys()];
    sortKids(root);
    expect([...root.children.keys()]).toEqual(before);
  });
});
