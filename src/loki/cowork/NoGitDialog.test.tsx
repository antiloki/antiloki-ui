import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

const api = vi.hoisted(() => ({ startGit: vi.fn() }));
vi.mock("./api", () => api);
import { NoGitDialog } from "./NoGitDialog";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("a project without Git", () => {
  it("says what Git gives, and keeping it as it is starts nothing", () => {
    const onKeep = vi.fn(); render(<NoGitDialog onKeep={onKeep} onStarted={() => {}} />);
    expect(screen.getByTestId("no-git").textContent).toContain("A worktree needs Git"); fireEvent.click(screen.getByTestId("no-git-keep"));
    expect(onKeep).toHaveBeenCalled(); expect(api.startGit).not.toHaveBeenCalled();
  });
  it("Start Git starts it, and a failure is said in the dialog", async () => {
    const onStarted = vi.fn(); api.startGit.mockResolvedValueOnce({ ok: false, error: "git could not run" }).mockResolvedValueOnce({ ok: true });
    render(<NoGitDialog onKeep={() => {}} onStarted={onStarted} />); fireEvent.click(screen.getByTestId("no-git-start"));
    await waitFor(() => expect(screen.getByTestId("no-git-error").textContent).toContain("git could not run")); expect(onStarted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("no-git-start")); await waitFor(() => expect(onStarted).toHaveBeenCalled());
  });
});
