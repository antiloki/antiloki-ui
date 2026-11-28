// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
const posts: any[] = [];
vi.mock("@/loki/api/client", () => ({
  apiGet: async (p: string) => (p.includes("/jobs") ? { ok: true, running: [], routines: [{ id: 2, name: "morning report", who: "cc", brief: "read and report", every_min: 0, at: "09:00", budget_usd: 0.5, write: [], sites: [], on: false, by: "pane-4", runs: [{ t_ms: 1, status: "done", text: "nothing new", usd: 0.01 }] }] }
    : { ok: true, agents: [{ pane_id: 7, engine: "claude-code", specialist: null, state: "working", doing: "writing", todo: 2, messages: 1 }], tasks: [{ id: "c-001", from: "pane-7", to: "cc", task: "check the copy", state: "done" }], groups: [{ id: 3, status: "active", goal: "g" }] }),
  apiPost: async (p: string, b: any) => { posts.push([p, b]); return { ok: true }; },
}));
vi.mock("./api", () => ({ specialistsOpenable: async () => [{ id: "cc", name: "Copy Checker", purpose: "", notes: 0 }] }));
import { BoardPane, parseBoard, when } from "./Board";

afterEach(() => { cleanup(); posts.length = 0; });
describe("the board", () => {
  it("says when a routine runs and reads nothing from a bad answer", () => { expect([when({ at: "09:00", everyMin: 0 }), when({ at: "", everyMin: 120 }), when({ at: "", everyMin: 45 }), when({ at: "", everyMin: 2880 })]).toEqual(["daily at 09:00", "every 2 h", "every 45 min", "every 2 d"]); expect(parseBoard(null)).toBeNull(); });
  it("lists the agents, and Stop all asks first, then pauses them and stops the groups", async () => {
    render(<BoardPane />); await waitFor(() => expect(screen.getByTestId("board-agent-7").textContent).toContain("writing"));
    fireEvent.click(screen.getByTestId("board-stop")); expect(posts).toEqual([]); fireEvent.click(screen.getByTestId("board-stop-yes"));
    await waitFor(() => expect(posts).toContainEqual(["/api/v1/cockpit/groups", { op: "stop", id: 3 }])); expect(posts[0]).toEqual(["/api/v1/cockpit/watch", { pane_id: 7, op: "pause" }]);
    fireEvent.click(screen.getByTestId("board-tab-tasks")); expect(screen.getByTestId("board-task-c-001").textContent).toContain("check the copy");
  });
  it("shows a proposed routine as off, switches it on only by the person's click, and removes only after asking", async () => {
    render(<BoardPane />); fireEvent.click(screen.getByTestId("board-tab-routines")); await waitFor(() => expect(screen.getByTestId("routine-2").textContent).toContain("proposed by pane-4"));
    expect(screen.getByTestId("routine-switch-2").getAttribute("aria-checked")).toBe("false"); fireEvent.click(screen.getByTestId("routine-switch-2")); expect(posts).toContainEqual(["/api/v1/cockpit/jobs", { op: "on", id: 2 }]);
    fireEvent.click(screen.getByTestId("routine-remove-2")); expect(posts.filter((p) => p[1].op === "remove")).toEqual([]); fireEvent.click(screen.getByTestId("routine-remove-yes-2")); expect(posts).toContainEqual(["/api/v1/cockpit/jobs", { op: "remove", id: 2 }]);
  });
});
