// @vitest-environment jsdom
// THE SAGAS BOARD: cards in columns, a drag says what it will do over a column and refuses with the reason, a drop calls the move.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import * as React from "react";
import { Board } from "./board";
import type { Saga, Status } from "./model";

const r = (o: any = {}) => ({ episodes: 2, todo: 1, doing: 0, done: 1, failed: 0, canceled: 0, ms: 0, usd: 0.05, tokens: 0, seats: {}, ...o });
const saga = (id: number, status: Status, o: any = {}): Saga => ({ id, title: `Saga ${id}`, objective: "", status, origin: "you", plan_ref: null, confidence: "", delivered: 0, created_ms: 0, updated_ms: id, rollup: r(), ...o } as Saga);
const dt = () => ({ setData: vi.fn(), dropEffect: "", effectAllowed: "" });

describe("the sagas board", () => {
  afterEach(() => cleanup());
  const sagas = [saga(1, "todo"), saga(2, "doing"), saga(3, "done"), saga(4, "canceled")];

  it("puts each saga in its column, newest first, with its progress, and opens one on click", () => {
    const onOpen = vi.fn(); render(<Board sagas={sagas} showWs={false} onOpen={onOpen} onMove={async () => null} />);
    expect(screen.getByTestId("board-col-todo").textContent).toContain("Saga 1"); expect(screen.getByTestId("board-col-done").textContent).toContain("Saga 3"); expect(screen.queryByTestId("board-col-failed")).toBeNull();
    expect(screen.getByTestId("board-progress-1").textContent).toBe("1/2");
    fireEvent.click(screen.getByTestId("board-card-2")); expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });

  it("says what a drop will do while the card is over a column, and refuses with the reason", () => {
    render(<Board sagas={sagas} showWs={false} onOpen={() => {}} onMove={async () => null} />);
    fireEvent.dragStart(screen.getByTestId("board-card-1"), { dataTransfer: dt() });
    fireEvent.dragOver(screen.getByTestId("board-col-canceled"), { dataTransfer: dt() });
    expect(screen.getByTestId("board-col-canceled").getAttribute("data-over")).toBe("ok"); expect(screen.getByTestId("board-hint").textContent).toBe("cancels the saga");
    fireEvent.dragOver(screen.getByTestId("board-col-done"), { dataTransfer: dt() }); expect(screen.getByTestId("board-hint").textContent).toBe("marks its open episodes done");
    fireEvent.dragStart(screen.getByTestId("board-card-3"), { dataTransfer: dt() });
    fireEvent.dragOver(screen.getByTestId("board-col-canceled"), { dataTransfer: dt() });
    expect(screen.getByTestId("board-col-canceled").getAttribute("data-over")).toBe("no"); expect(screen.getByTestId("board-hint").textContent).toContain("part of the record");
  });

  it("calls the move on a drop it allows and says so; a drop it refuses calls nothing and says why", async () => {
    const onMove = vi.fn(async () => null); render(<Board sagas={sagas} showWs={false} onOpen={() => {}} onMove={onMove} />);
    fireEvent.dragStart(screen.getByTestId("board-card-1"), { dataTransfer: dt() }); fireEvent.drop(screen.getByTestId("board-col-canceled"), { dataTransfer: dt() });
    await waitFor(() => expect(screen.getByTestId("board-note").textContent).toContain("cancels the saga")); expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "canceled");
    fireEvent.dragStart(screen.getByTestId("board-card-3"), { dataTransfer: dt() }); fireEvent.drop(screen.getByTestId("board-col-todo"), { dataTransfer: dt() });
    await waitFor(() => expect(screen.getByTestId("board-note").textContent).toContain("does not go back")); expect(onMove).toHaveBeenCalledTimes(1);
  });

  it("shows the serve's own sentence when a move fails, and the workspace chip when the page spans workspaces", async () => {
    render(<Board sagas={[saga(1, "todo", { workspace: "ministore" })]} showWs onOpen={() => {}} onMove={async () => "the serve said no"} />);
    expect(screen.getByTestId("board-ws-chip").textContent).toBe("ministore");
    fireEvent.dragStart(screen.getByTestId("board-card-1"), { dataTransfer: dt() }); fireEvent.drop(screen.getByTestId("board-col-canceled"), { dataTransfer: dt() });
    await waitFor(() => expect(screen.getByTestId("board-note").textContent).toBe("the serve said no"));
  });
});
