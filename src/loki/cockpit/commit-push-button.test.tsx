import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";

const get = vi.fn(); const post = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => get(...a), apiPost: (...a: any[]) => post(...a) }));
import { CommitPushButton, shipChoice, shipNote, type ShipPreview } from "./commit-push-button";

const pv = (o: Partial<ShipPreview> = {}): ShipPreview => ({ ok: true, dirty: true, files: ["a.ts", "b.ts"], branch: "antiloki/x/main", remote: true, ahead: 0, message: "add the thing", ...o });

describe("shipChoice / shipNote (pure)", () => {
  it("offers a commit only when there is something to commit, and a push only with a remote", () => {
    expect(shipChoice(pv())).toMatchObject({ canCommit: true, canPush: true });
    expect(shipChoice(pv({ dirty: false, files: [] }))).toMatchObject({ canCommit: false, canPush: false, label: "nothing to commit" });
    expect(shipChoice(pv({ dirty: false, files: [], ahead: 2 }))).toMatchObject({ canCommit: false, canPush: true, label: "2 commits not pushed" });
    expect(shipChoice(pv({ remote: false }))).toMatchObject({ canCommit: true, canPush: false });
    expect(shipChoice(null).canCommit).toBe(false);
  });
  it("says what happened, including a push that failed after the commit landed", () => {
    expect(shipNote({ committed: true, sha: "abc1234", pushed: true, branch: "b" })).toBe("committed abc1234 on b; pushed");
    expect(shipNote({ committed: true, sha: "abc1234", pushed: false, branch: "b", push_error: "no upstream" })).toMatch(/committed abc1234 on b; could not push - no upstream/);
    expect(shipNote({ committed: false, pushed: false, error: "git is not installed" })).toBe("could not commit - git is not installed");
    expect(shipNote({ committed: false, pushed: true, branch: "b" })).toBe("nothing new to commit on b; pushed");
  });
});

describe("<CommitPushButton>", () => {
  beforeEach(() => { get.mockReset(); post.mockReset(); });
  it("opens with the auto message, sends no message in auto, and the typed one in edit", async () => {
    get.mockResolvedValue(pv());
    post.mockResolvedValue({ ok: true, committed: true, sha: "abc1234", pushed: true, branch: "antiloki/x/main" });
    render(<CommitPushButton paneId={7} />);
    fireEvent.click(screen.getByTestId("ship-open"));
    await waitFor(() => expect((screen.getByTestId("ship-message") as HTMLTextAreaElement).value).toBe("add the thing"));
    expect((screen.getByTestId("ship-message") as HTMLTextAreaElement).readOnly).toBe(true);
    fireEvent.click(screen.getByTestId("ship-push"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toEqual({ pane_id: 7, push: true });
    await waitFor(() => expect(screen.getByTestId("ship-note").textContent).toMatch(/committed abc1234.*pushed/));

    fireEvent.click(screen.getByTestId("ship-open"));
    await waitFor(() => screen.getByTestId("ship-edit"));
    fireEvent.click(screen.getByTestId("ship-edit"));
    const ta = screen.getByTestId("ship-message") as HTMLTextAreaElement;
    expect(ta.readOnly).toBe(false);
    fireEvent.change(ta, { target: { value: "fix: the real thing" } });
    fireEvent.click(screen.getByTestId("ship-commit"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][1]).toEqual({ pane_id: 7, push: false, message: "fix: the real thing" });
  });
  it("does not let an edited message go out empty, and shows the serve's refusal", async () => {
    get.mockResolvedValue(pv());
    post.mockRejectedValue(new Error("POST /api/v1/cockpit/agent/ship → 400: nothing to commit"));
    render(<CommitPushButton paneId={7} />);
    fireEvent.click(screen.getByTestId("ship-open"));
    await waitFor(() => screen.getByTestId("ship-edit"));
    fireEvent.click(screen.getByTestId("ship-edit"));
    fireEvent.change(screen.getByTestId("ship-message"), { target: { value: "  " } });
    expect((screen.getByTestId("ship-commit") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("ship-message"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("ship-commit"));
    await waitFor(() => expect(screen.getByTestId("ship-note").textContent).toBe("could not commit - nothing to commit"));
  });
  it("renders nothing without a pane", () => { const { container } = render(<CommitPushButton paneId={null} />); expect(container.innerHTML).toBe(""); });
});
