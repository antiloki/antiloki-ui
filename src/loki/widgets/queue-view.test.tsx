import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const queueOp = vi.fn(async (..._a: any[]) => ({ ok: true }));
vi.mock("./subagents", async (orig) => ({ ...(await orig<any>()), queueOp: (...a: any[]) => (queueOp as any)(...a) }));

import { QueueView, itemGlyph, activeCount } from "./queue-view";
import { dropIndex, type QueueItem, type QueueSnapshot } from "./subagents";

const item = (id: number, status: QueueItem["status"], over: Partial<QueueItem> = {}): QueueItem => ({
  id, pane_id: 5, ask: `ask ${id}`, goal: `goal ${id}`, status, binding: { label: "Frontender · Composer 2.5 writes", why: "", note: "", mode: "auto" }, run_id: null,
  cp_before: null, cp_after: null, created: id, started: null, ended: null, note: "", paths: [], creates: false, removes: false, reverts: false, ...over,
});
const snap = (items: QueueItem[], over: Partial<QueueSnapshot> = {}): QueueSnapshot => ({ items, checkpoints: [], conflicts: [], idle: false, ...over });

describe("where a dragged item lands", () => {
  it("counts among the queued items only, before or after the row it is dropped on", () => {
    const ids = [10, 11, 12, 13];
    expect(dropIndex(ids, 13, 10, false)).toBe(0);      // dropped on the top half of the first row -> next
    expect(dropIndex(ids, 10, 12, true)).toBe(2);       // dragged out, dropped on the lower half of #12 -> after it (11, 12, then 10)
    expect(dropIndex(ids, 11, null, true)).toBe(3);     // dropped past the end -> last
    expect(dropIndex(ids, 12, 99, false)).toBe(3);      // an unknown row -> last
    expect(dropIndex(ids, 11, 11, true)).toBe(1);       // on itself -> where it is
  });
  it("names the states and counts what is not settled", () => {
    expect(itemGlyph("done").g).toBe("✓"); expect(itemGlyph("failed").g).toBe("✗"); expect(itemGlyph("doing").g).toBe("●"); expect(itemGlyph("queued").g).toBe("○");
    expect(activeCount(snap([item(1, "done"), item(2, "doing"), item(3, "queued"), item(4, "cancelled")]))).toBe(2);
    expect(activeCount(null)).toBe(0);
  });
});

describe("the queue panel", () => {
  beforeEach(() => queueOp.mockClear());

  it("shows done, doing and next in that order with who will do each, and what was re-decided", () => {
    render(<QueueView refresh={() => {}} q={snap([
      item(1, "done", { cp_before: { rev: "abcdef123456", n: 3, label: "", t: 1 }, cp_after: { rev: "x", n: 4, label: "", t: 2 } }),
      item(2, "doing"), item(3, "queued", { binding: { label: "Backender · Codex plans, Composer writes", why: "", note: "re-bound at its turn: A -> B", mode: "auto" } }), item(4, "queued"),
    ], { conflicts: [[3, 4]] })} />);
    const text = document.body.textContent ?? "";
    expect(text.indexOf("goal 3")).toBeLessThan(text.indexOf("goal 2")); // next, then doing, then done, top to bottom by section
    expect(text.indexOf("goal 2")).toBeLessThan(text.indexOf("goal 1"));
    expect(screen.getByTestId("queue-route-3").textContent).toContain("Backender");
    expect(screen.getByTestId("queue-item-3").textContent).toContain("re-bound");
    expect(screen.getByTestId("queue-item-1").textContent).toContain("cp 3→4");
    expect(screen.getByTestId("queue-item-3").textContent).toContain("same file as #4");
    // only queued items can be dragged or re-prompted; only queued/doing can be cancelled; only finished ones undone
    expect(screen.getByTestId("queue-item-3").getAttribute("draggable")).toBe("true");
    expect(screen.getByTestId("queue-item-2").getAttribute("draggable")).toBe("false");
    expect(screen.queryByTestId("queue-reprompt-2")).toBeNull();
    expect(screen.getByTestId("queue-cancel-2")).toBeTruthy(); expect(screen.queryByTestId("queue-cancel-1")).toBeNull();
    expect(screen.getByTestId("queue-undo-1")).toBeTruthy(); expect(screen.queryByTestId("queue-undo-3")).toBeNull();
  });

  it("cancels, re-prompts (Enter saves, Escape leaves it) and undoes through the serve", async () => {
    const refresh = vi.fn();
    render(<QueueView refresh={refresh} q={snap([item(1, "done", { cp_before: { rev: "abcdef123456", n: 3, label: "", t: 1 } }), item(3, "queued")])} />);
    fireEvent.click(screen.getByTestId("queue-cancel-3"));
    await waitFor(() => expect(queueOp).toHaveBeenCalledWith("cancel", { id: 3 }));
    fireEvent.click(screen.getByTestId("queue-undo-1"));
    await waitFor(() => expect(queueOp).toHaveBeenCalledWith("restore", { id: 1 }));
    fireEvent.click(screen.getByTestId("queue-reprompt-3"));
    const box = screen.getByTestId("queue-edit-3") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "remove the header instead" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(queueOp).toHaveBeenCalledWith("reprompt", { id: 3, goal: "remove the header instead" }));
    expect(refresh).toHaveBeenCalled();
    // Escape drops the edit without asking the serve
    queueOp.mockClear();
    fireEvent.doubleClick(screen.getByTestId("queue-goal-3"));
    fireEvent.keyDown(screen.getByTestId("queue-edit-3"), { key: "Escape" });
    expect(queueOp).not.toHaveBeenCalled();
  });

  it("reorders by dragging: the dropped item goes where dropIndex says", async () => {
    const refresh = vi.fn();
    render(<QueueView refresh={refresh} q={snap([item(3, "queued"), item(4, "queued"), item(5, "queued")])} />);
    const dt = { setData: vi.fn(), getData: () => "5" };
    fireEvent.dragStart(screen.getByTestId("queue-item-5"), { dataTransfer: dt });
    const first = screen.getByTestId("queue-item-3");
    (first as any).getBoundingClientRect = () => ({ top: 0, height: 100, left: 0, right: 0, bottom: 100, width: 10 });
    fireEvent.drop(first, { dataTransfer: dt, clientY: 10 });          // upper half of #3 -> before it -> index 0
    await waitFor(() => expect(queueOp).toHaveBeenCalledWith("reorder", { id: 5, index: 0 }));
    expect(refresh).toHaveBeenCalled();
  });

  it("says why when the serve refuses, and says nothing is queued when nothing is", async () => {
    queueOp.mockResolvedValueOnce({ ok: false, error: "only a queued item can be moved" } as any);
    render(<QueueView refresh={() => {}} q={snap([item(2, "doing")])} />);
    fireEvent.click(screen.getByTestId("queue-cancel-2"));
    await waitFor(() => expect(screen.getByTestId("queue-error").textContent).toContain("only a queued item can be moved"));
    render(<QueueView refresh={() => {}} q={snap([])} />);
    expect(document.body.textContent).toContain("nothing asked yet");
  });
});
