// @vitest-environment jsdom
// The tree row (2026-09-18): the ARROW expands/collapses, the folder NAME opens the folder's review.
// Before, both toggled — there was no way to ask for a folder's paper from the tree.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { buildTree, sortKids, TreeRow } from "./file-tree";

const tree = buildTree([{ path: "src/a.ts", fileNode: { id: 1 } }, { path: "src/deep/b.ts", fileNode: { id: 2 } }]);
const src = sortKids(tree)[0];

function mount(over: any = {}) {
  const setOpen = vi.fn(); const onPick = vi.fn(); const onPickFolder = vi.fn();
  render(<TreeRow node={src} depth={0} selected={null} onPick={onPick} onPickFolder={onPickFolder} openMap={{}} setOpen={setOpen} {...over} />);
  return { setOpen, onPick, onPickFolder };
}

describe("TreeRow — arrow vs name on a folder", () => {
  it("the arrow toggles open/closed and never opens the folder review", () => {
    const { setOpen, onPickFolder } = mount();
    fireEvent.click(screen.getByTestId("tree-arrow-src"));
    expect(setOpen).toHaveBeenCalledWith("src", false); // depth 0 starts open → the arrow closes it
    expect(onPickFolder).not.toHaveBeenCalled();
  });

  it("the name opens the folder review and leaves the fold alone", () => {
    const { setOpen, onPickFolder } = mount();
    fireEvent.click(screen.getByTestId("tree-folder-src"));
    expect(onPickFolder).toHaveBeenCalledWith(expect.objectContaining({ path: "src", isFile: false }));
    expect(setOpen).not.toHaveBeenCalled();
  });

  it("without an onPickFolder the name still toggles (the old behaviour survives for other trees)", () => {
    const { setOpen } = mount({ onPickFolder: undefined });
    fireEvent.click(screen.getByTestId("tree-folder-src"));
    expect(setOpen).toHaveBeenCalledWith("src", false);
  });

  it("a file row picks the file; the selected folder is highlighted by its path", () => {
    const { onPick } = mount({ selected: "src" });
    fireEvent.click(screen.getByTitle("src/a.ts"));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ path: "src/a.ts", isFile: true }));
    expect(screen.getByTestId("tree-folder-src").parentElement!.style.background).not.toBe("");
  });
});
