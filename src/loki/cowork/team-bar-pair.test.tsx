// @vitest-environment jsdom
// A PAIR (operator 2026-11-13): two agents, one dragged into the other; the planner also judges. Its bar says so, and can swap the two.
import * as React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TeamBar } from "./TeamBar";
import type { TeamRow } from "./teams";

afterEach(cleanup);
const drag = { draggable: true, onDragStart: () => {}, onDragEnd: () => {} };
const pair: TeamRow = { id: "pair", name: "Pair", pair: true, ready: true, members: [{ role: "planner", pane: 2, agent: "Ana" }, { role: "worker", pane: 3, agent: "Bo" }] };
const team: TeamRow = { id: "t", name: "Team", ready: true, members: [{ role: "planner", pane: 2 }, { role: "worker", pane: 3 }, { role: "qa", pane: 4 }] };

describe("a pair's bar", () => {
  it("says the planner is also the QA, and swaps the two on ⇄", () => {
    const onSwap = vi.fn(); render(<TeamBar team={pair} run={null} cost={0} onStop={() => {}} onDissolve={() => {}} onSwap={onSwap} dragProps={drag} />);
    expect(screen.getByText("planner · QA")).toBeTruthy(); expect(screen.getByText("worker")).toBeTruthy(); expect(screen.queryByText("QA")).toBeNull();
    fireEvent.click(screen.getByTestId("team-swap-pair")); expect(onSwap).toHaveBeenCalled();
    expect(screen.queryByTestId("team-run-pair")).toBeNull(); expect(screen.queryByTestId("team-form-pair")).toBeNull();   // no Run: you talk to the planner
  });
  it("a team keeps its three roles and has no swap", () => {
    render(<TeamBar team={team} run={null} cost={0} onStop={() => {}} onDissolve={() => {}} dragProps={drag} />);
    expect(screen.getByText("QA")).toBeTruthy(); expect(screen.queryByTestId("team-swap-t")).toBeNull(); expect(screen.queryByText("planner · QA")).toBeNull();
  });
});
