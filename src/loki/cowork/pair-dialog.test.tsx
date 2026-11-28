// @vitest-environment jsdom
// Dragging an agent onto another says "Start a pair session" (never "link into a team"): the one dropped on plans and judges, the dragged one works, and ⇄ swaps them.
import * as React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PairDialog } from "./PairDialog";

afterEach(cleanup);
describe("the pair dialog", () => {
  it("says it is a pair and not a team, names who plans and judges and who works, and starts with the roles as shown", () => {
    const onStart = vi.fn(); render(<PairDialog dragged="Bo" target="Ana" onStart={onStart} onCancel={() => {}} />);
    expect(screen.getByRole("dialog", { name: "start a pair session" })).toBeTruthy(); expect(screen.getByText("Start a pair session", { selector: "div" })).toBeTruthy(); expect(screen.queryByText(/link into a team/i)).toBeNull(); expect(screen.getByText(/not a team/)).toBeTruthy();
    expect(screen.getByTestId("pair-roles")).toHaveTextContent("planner · QAAna"); expect(screen.getByTestId("pair-roles")).toHaveTextContent("workerBo");
    fireEvent.click(screen.getByTestId("pair-start")); expect(onStart).toHaveBeenCalledWith(false);
  });
  it("swaps the roles before starting, and cancels", () => {
    const onStart = vi.fn(); const onCancel = vi.fn(); render(<PairDialog dragged="Bo" target="Ana" onStart={onStart} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("pair-swap")); expect(screen.getByTestId("pair-roles")).toHaveTextContent("planner · QABo"); expect(screen.getByTestId("pair-roles")).toHaveTextContent("workerAna");
    fireEvent.click(screen.getByTestId("pair-start")); expect(onStart).toHaveBeenCalledWith(true); fireEvent.click(screen.getByText("cancel")); expect(onCancel).toHaveBeenCalled();
  });
});
