import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const apiGet = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (p: string) => apiGet(p) }));
import { TaskQueuePanel, clearAll, uncleared } from "./TaskQueue";

const q = { plan: [{ text: "read", state: "done" as const }], asks: [{ text: "continue", state: "doing" as const }] };
describe("clearing the queue", () => {
  beforeEach(() => { cleanup(); localStorage.clear(); apiGet.mockReset().mockResolvedValue({ ok: true, ...q }); });
  it("hides what was there, and the same words asked again are seen", () => {
    const c = clearAll(q); expect(uncleared(q, c)).toEqual({ queue: { plan: [], asks: [] }, hidden: 2 });
    expect(uncleared({ ...q, asks: [...q.asks, { text: "continue", state: "todo" }] }, c).queue.asks).toEqual([{ text: "continue", state: "todo" }]);
  });
  it("has a button that empties the list, stays cleared when opened again, and can show it back", async () => {
    render(<TaskQueuePanel paneId={4} onClose={() => {}} />);
    fireEvent.click(await screen.findByTestId("queue-clear")); expect(screen.queryAllByTestId("queue-item")).toHaveLength(0);
    cleanup(); render(<TaskQueuePanel paneId={4} onClose={() => {}} />);
    fireEvent.click(await screen.findByTestId("queue-show-cleared")); await waitFor(() => expect(screen.getAllByTestId("queue-item")).toHaveLength(2));
  });
});
