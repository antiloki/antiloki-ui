import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RunReasoning, clock, effortOf, kindOf, seatOf, seatsOf, stepsOf } from "./RunReasoning";

const ev = (id: number, t_ms: number, text: string): any => ({ id, saga_id: 1, task_id: null, t_ms, actor: "x", kind: "k", text });
const nodes: any = { classify: { node: "llm", seat: "endpoint:lfm3", label: "Classify" }, writer: { node: "role", role: "agent", tier: "low", label: "Writer" }, check: { node: "check", on: "x", rules: [] }, deliver: { node: "deliver" } };
// events arrive newest first
const events = [ev(9, 9000, "deliver finished"), ev(8, 8000, "deliver started"), ev(7, 7000, "check finished (ok)"), ev(6, 5000, "check started"), ev(5, 4900, "writer finished (done=true)"), ev(4, 1500, "writer started"), ev(3, 1400, "classify finished (label=x)"), ev(2, 400, "classify started"), ev(1, 100, "the team zz started")];
describe("run reasoning", () => {
  it("steps are paired from the start and finish events, oldest first, and the team's own event is not a step", () => {
    const s = stepsOf(events); expect(s.map((x) => x.node)).toEqual(["classify", "writer", "check", "deliver"]); expect(s[0]).toMatchObject({ start_ms: 400, end_ms: 1400 });
    expect(stepsOf([ev(2, 20, "writer started")])[0].end_ms).toBeNull(); expect(stepsOf([ev(2, 20, "writer failed (Error): x"), ev(1, 10, "writer started")])[0].failed).toBe(true);
  });
  it("kinds, seats, effort and the clock", () => {
    expect(kindOf(nodes.classify)).toBe("model"); expect(kindOf(nodes.writer)).toBe("agent"); expect(kindOf(nodes.check)).toBe("check"); expect(kindOf(undefined)).toBe("other");
    expect(seatOf(nodes.classify, "claude-code")).toBe("endpoint:lfm3"); expect(seatOf(nodes.writer, "claude-code")).toBe("claude-code"); expect(seatOf({ node: "role", model: "cursor:" } as any, "claude-code")).toBe("cursor"); expect(seatOf({ node: "role", model: "haiku" } as any, "claude-code")).toBe("claude-code:haiku");
    expect(effortOf(nodes.writer)).toBe(1); expect(effortOf({ node: "role", tier: "high" } as any)).toBe(3); expect(clock(72000)).toBe("1:12");
    const seats = seatsOf(stepsOf(events), nodes, { writer: 0.004 }, "claude-code", 9000); expect(seats.map((x) => x.seat)).toEqual(["claude-code", "endpoint:lfm3"]); expect(seats[0].cost).toBeCloseTo(0.004);
  });
  it("a finished run reads 'Reasoned for … · N steps'; a model opens its details; the steps list opens", () => {
    const run: any = { live: false, engine: "claude-code", graph: { nodes }, events, state: { status: { status: "done" }, started_ms: 0, now_ms: 9000, spent_usd: 0.02, node_cost: { writer: 0.004 } } };
    render(<RunReasoning run={run} />); expect(screen.getByTestId("rr-title").textContent).toBe("Reasoned for 0:09 · 4 steps"); expect(screen.getAllByTestId("rr-seg").length).toBe(4);
    fireEvent.click(screen.getByTestId("rr-seat-endpoint:lfm3")); expect(screen.getByTestId("rr-seat-detail").textContent).toContain("Classify"); fireEvent.click(screen.getByTestId("rr-steps-btn")); expect(screen.getAllByTestId("rr-step").length).toBe(4);
  });
  it("says nothing for a run with no steps, and 'Reasoning' while it works", () => {
    const base: any = { live: true, engine: "claude-code", graph: { nodes }, state: { status: { status: "running" }, started_ms: 0, now_ms: 3000, node_cost: {} } };
    const { container, unmount } = render(<RunReasoning run={{ ...base, events: [] }} />); expect(container.textContent).toBe(""); unmount();
    render(<RunReasoning run={{ ...base, events: [ev(2, 2000, "writer started")] }} />); expect(screen.getByTestId("rr-title").textContent).toBe("Reasoning"); expect(screen.getByTestId("run-reasoning").getAttribute("data-live")).toBe("1");
  });
});
