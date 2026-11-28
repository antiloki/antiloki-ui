// @vitest-environment jsdom
import * as React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThreadBar, type ThreadBarProps } from "./ThreadBar";

afterEach(cleanup);
const props = (o: Partial<ThreadBarProps> = {}): ThreadBarProps => ({ project: "shop", thread: { id: "pricing", name: "Pricing", active: true, panes: [{ id: "a", kind: "engine", title: "Claude Code", paneId: 7 }] }, onCreate: vi.fn(), onNotNow: vi.fn(), onMerge: vi.fn(), onDiscard: vi.fn(), onDismissCrowded: vi.fn(), ...o });

describe("the thread's top bar", () => {
  it("says the thread works in the project folder and offers a worktree; Main offers none", () => {
    const p = props(); const { rerender } = render(<ThreadBar {...p} />);
    expect(screen.getByTestId("thread-bar-where").textContent).toContain("project folder"); fireEvent.click(screen.getByTestId("thread-bar-create")); expect(p.onCreate).toHaveBeenCalled();
    rerender(<ThreadBar {...p} thread={{ id: "main", name: "Main", active: true, panes: [] }} />); expect(screen.queryByTestId("thread-bar-create")).toBeNull();
  });
  it("says when an agent works in a copy of its own, so the folder it names is not that agent's", () => {
    const p = props(); p.thread = { ...p.thread, copies: ["Claude Code"] }; render(<ThreadBar {...p} />);
    expect(screen.getByTestId("thread-bar-copies").textContent).toBe("1 agent has its own copy");
  });
  it("offers Start Git to a team thread in a project without it, and no worktree button until then", () => {
    const start = vi.fn(); render(<ThreadBar {...props({ teamNeedsGit: true, onStartGit: start })} />);
    expect(screen.queryByTestId("thread-bar-create")).toBeNull(); fireEvent.click(screen.getByTestId("thread-bar-start-git")); expect(start).toHaveBeenCalled();
  });
  it("names the thread's worktree, and discarding is asked twice", () => {
    const p = props(); p.thread = { ...p.thread, tree: { worktree: "/t", branch: "thread-x-pricing", ahead: 2, dirty: false } };
    render(<ThreadBar {...p} />);
    expect(screen.getByTestId("thread-bar").textContent).toContain("Pricing worktree"); expect(screen.getByTestId("thread-bar").textContent).toContain("2 commits to merge");
    fireEvent.click(screen.getByTestId("thread-bar-merge")); expect(p.onMerge).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("thread-bar-discard")); expect(p.onDiscard).not.toHaveBeenCalled(); fireEvent.click(screen.getByTestId("thread-bar-discard-yes")); expect(p.onDiscard).toHaveBeenCalled();
  });
  it("shows an agent's suggestion with Create and Not now, and the warning about a shared folder", () => {
    const p = props({ crowded: ["Main"] }); p.thread = { ...p.thread, suggest: { paneId: 7, reason: "a large rewrite" } };
    render(<ThreadBar {...p} />);
    expect(screen.getByTestId("thread-bar-suggest").textContent).toContain("Claude Code suggests a worktree for this thread: a large rewrite");
    fireEvent.click(screen.getByTestId("thread-bar-suggest-no")); expect(p.onNotNow).toHaveBeenCalled(); expect(p.onCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId("thread-bar-crowded").textContent).toContain("Main also has agents"); fireEvent.click(screen.getByTestId("thread-bar-crowded-no")); expect(p.onDismissCrowded).toHaveBeenCalled();
  });
});
