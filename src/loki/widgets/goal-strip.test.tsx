// THE ORCHESTRATION STRIP — the dots and the phrase must say what is happening (operator 2026-09-17).
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn(), apiGet: vi.fn() }));
import { GoalStrip, stripPhrase } from "./goal-strip";
import type { GoalRun, GoalTask } from "./subagents";

const task = (over: Partial<GoalTask>): GoalTask => ({ id: "t", title: "t", prompt: "", owns: [], needs: [], acceptance: [], status: "pending", wave: 0, attempts: 1, started: null, ended: null, report: null, verdict: null, error: null, trace: null, changed: [], ...over });
const run = (over: Partial<GoalRun>): GoalRun => ({ id: 1, parent: "k", goal: "g", engine: "claude-code", cwd: "/w", write: false, concurrency: 3, status: "running", created: 0, started: 0, ended: null, tasks: [], blackboard: [], events: [], report: null, delivered: false, error: null, ...over });

describe("stripPhrase", () => {
  it("says the one thing happening now", () => {
    expect(stripPhrase(run({ status: "planning" }))).toBe("planning…");
    expect(stripPhrase(run({ tasks: [task({ id: "t1", status: "running", started: Date.now() - 12_000 }), task({ id: "t2", status: "running", started: Date.now() })] }))).toMatch(/^t1 t2 working · 1[12]s$/);
    expect(stripPhrase(run({ tasks: [task({ id: "t1", status: "verifying", attempts: 2 })] }))).toBe("t1 verifying · retry");
    expect(stripPhrase(run({ status: "joining" }))).toBe("joining the reports…");
    expect(stripPhrase(run({ status: "done", tasks: [task({ status: "done" }), task({ status: "done" })] }))).toBe("2/2 · report delivered");
    expect(stripPhrase(run({ status: "failed", tasks: [task({ id: "t1", status: "done" }), task({ id: "t2", status: "failed" }), task({ id: "t3", status: "blocked" })] }))).toBe("1/3 · t2, t3 open");
  });
});
describe("GoalStrip", () => {
  it("draws one dot per task with its state, and the phrase", () => {
    const r = run({ tasks: [task({ id: "t1", wave: 0, status: "done" }), task({ id: "t2", wave: 0, status: "running", started: Date.now() }), task({ id: "t3", wave: 1, status: "pending", needs: ["t1", "t2"] })] });
    render(<GoalStrip runs={[r]} onOpen={() => {}} />);
    expect(screen.getByTestId("goal-dot-t1").getAttribute("data-state")).toBe("done");
    expect(screen.getByTestId("goal-dot-t2").getAttribute("data-state")).toBe("running");
    expect(screen.getByTestId("goal-dot-t3").getAttribute("data-state")).toBe("pending");
    expect(screen.getByTestId("goal-phrase").textContent).toMatch(/t2 working/);
  });
  it("renders nothing without a run, and ignores a cancelled one", () => {
    const { container } = render(<GoalStrip runs={[run({ status: "cancelled" })]} onOpen={() => {}} />);
    expect(container.querySelector("[data-testid='goal-strip']")).toBeNull();
  });
});
