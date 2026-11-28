// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const answer = { ok: true, plan: [{ text: "write the parser", state: "doing" }], asks: [...Array.from({ length: 11 }, (_, i) => ({ text: `old ${i}`, state: "done" })), { text: "add tests", state: "todo" }] };
const apiGet = vi.fn(async () => answer);
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: unknown[]) => (apiGet as any)(...a) }));
import { parseQueue, trimDone, TaskQueuePanel } from "./TaskQueue";

afterEach(() => cleanup());
describe("an agent's queue", () => {
  it("reads the serve's lists, and a bad answer is none", () => {
    expect(parseQueue({ ok: true, plan: [{ text: "a", state: "odd" }, { nope: 1 }], asks: null })).toEqual({ plan: [{ text: "a", state: "todo" }], asks: [] });
    expect(parseQueue({ ok: false })).toBeNull();
  });
  it("keeps the last eight finished ones in sight and never hides what is left", () => {
    const t = trimDone(answer.asks as any); expect(t.hidden).toBe(3); expect(t.shown[0].text).toBe("old 3"); expect(t.shown.at(-1)?.text).toBe("add tests");
  });
  it("shows the plan and the asks with their states, opens the earlier ones, and closes", async () => {
    const close = vi.fn(); render(<TaskQueuePanel paneId={7} onClose={close} />);
    await waitFor(() => expect(screen.getAllByTestId("queue-item").length).toBe(10));
    expect(screen.getByTestId("queue-panel-7").textContent).toContain("Your asks · 11/12"); expect(screen.getAllByTestId("queue-item")[0].getAttribute("data-state")).toBe("doing");
    fireEvent.click(screen.getByTestId("queue-earlier")); expect(screen.getAllByTestId("queue-item").length).toBe(13);
    fireEvent.click(screen.getByTestId("queue-close")); expect(close).toHaveBeenCalled();
  });
});
