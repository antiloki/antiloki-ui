// @vitest-environment jsdom
// the chip pickers' pure parts — folders under a path, coverage by globs, catalog grouping — and the
// pack chips: a kind adds itself for every path of the scope at once
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn() }));
import { entriesFromNodes, entriesFromTree, childrenOf, covered, filesInScope, foldersInScope, categorize, globFor, PackChips } from "./scope-picker";

const nodes = [
  { type: "file", path: "src/ui/A.tsx" }, { type: "file", path: "src/ui/B.tsx" }, { type: "file", path: "src/lib/x.ts" },
  { type: "file", path: "README.md" }, { type: "function", path: "src/ui/A.tsx", name: "A" },
];

describe("scope picker", () => {
  const entries = entriesFromNodes(nodes);
  it("derives folders from file paths and lists a level's children with counts, biggest first", () => {
    expect(entries.filter((e) => e.dir).map((e) => e.path)).toEqual(["src", "src/lib", "src/ui"]);
    const root = childrenOf(entries, "");
    expect(root.folders).toEqual([{ path: "src", name: "src", files: 3 }]);
    expect(root.files).toEqual([{ path: "README.md", name: "README.md" }]);
    const src = childrenOf(entries, "src");
    expect(src.folders.map((f) => `${f.name}:${f.files}`)).toEqual(["ui:2", "lib:1"]);
  });
  it("flattens the code/tree shape", () => {
    const e = entriesFromTree({ name: "", path: "", type: "dir", children: [{ name: "src", path: "src", type: "dir", children: [{ name: "a.ts", path: "src/a.ts", type: "file" }] }, { name: "R.md", path: "R.md", type: "file" }] });
    expect(e).toEqual([{ path: "R.md", dir: false }, { path: "src", dir: true }, { path: "src/a.ts", dir: false }]);
  });
  it("coverage follows folder globs down and counts files in scope", () => {
    expect(globFor({ path: "src/ui", dir: true })).toBe("src/ui/**");
    expect(covered(["src/ui/**"], "src/ui/A.tsx", false)).toBe(true);
    expect(covered(["src/ui/**"], "src/lib/x.ts", false)).toBe(false);
    expect(covered(["src/**"], "src/ui", true)).toBe(true);
    expect(filesInScope(entries, ["src/ui/**", "README.md"])).toEqual(["README.md", "src/ui/A.tsx", "src/ui/B.tsx"]);
    expect(foldersInScope(["src/ui/**", "src/lib/x.ts", "src/ui/A.tsx"])).toEqual(["src/ui", "src/lib"]);
  });
  it("groups catalog sources by category, packable only, leftovers under more", () => {
    const sources = [
      { key: "file", label: "file review", description: "", args: [{ name: "path", description: "worktree-relative file path" }], packable: true, ai: false },
      { key: "git", label: "git", description: "", args: [], packable: true, ai: false },
      { key: "describe", label: "d", description: "", args: [], packable: false, ai: true },
      { key: "weird", label: "w", description: "", args: [], packable: true, ai: false },
    ];
    const g = categorize(sources);
    expect(g.map((x) => `${x.label}:${x.sources.map((s) => s.key).join(",")}`)).toEqual(["reviews:file", "git:git", "more:weird"]);
  });

  it("PackChips: a kind adds itself for every file (file review) or folder (folder paper) of the scope at once; several kinds stack; ▸ refines", () => {
    const sources = [
      { key: "file", label: "file review", description: "the file's review", args: [{ name: "path", description: "worktree-relative file path" }], packable: true, ai: false },
      { key: "folder", label: "folder paper", description: "the folder's paper", args: [{ name: "path", description: "worktree-relative folder" }], packable: true, ai: false },
      { key: "git", label: "git", description: "", args: [], packable: true, ai: false },
    ];
    const onSetMany = vi.fn(); const onToggle = vi.fn();
    const { rerender } = render(<PackChips items={[]} onToggle={onToggle} onSetMany={onSetMany} sources={sources as any} scope={["src/ui/**"]} entries={entries} />);
    fireEvent.click(screen.getByText(/file review/));
    expect(onSetMany).toHaveBeenCalledWith([{ kind: "file", path: "src/ui/A.tsx" }, { kind: "file", path: "src/ui/B.tsx" }], true);
    fireEvent.click(screen.getByText(/folder paper/));
    expect(onSetMany).toHaveBeenLastCalledWith([{ kind: "folder", path: "src/ui" }], true);
    // both kinds selected → counts shown, a click removes that kind's items only
    rerender(<PackChips items={[{ kind: "file", path: "src/ui/A.tsx" }, { kind: "file", path: "src/ui/B.tsx" }, { kind: "folder", path: "src/ui" }]} onToggle={onToggle} onSetMany={onSetMany} sources={sources as any} scope={["src/ui/**"]} entries={entries} />);
    fireEvent.click(screen.getByText(/file review/));
    expect(onSetMany).toHaveBeenLastCalledWith([{ kind: "file", path: "src/ui/A.tsx" }, { kind: "file", path: "src/ui/B.tsx" }], false);
    // ▸ refine opens the per-path row
    fireEvent.click(screen.getByTestId("refine-file"));
    expect(screen.getByTitle("file review · src/ui/A.tsx")).toBeTruthy();
    // a path-less kind adds at once
    fireEvent.click(screen.getAllByText(/git/).find((e) => e.tagName === "SPAN" && e.title === " — click to add")!);
    expect(onToggle).toHaveBeenCalledWith({ kind: "git" });
  });
});
