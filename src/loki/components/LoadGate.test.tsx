import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LoadGate, type LoadGateQuery } from "./LoadGate";
import { reportFeError } from "@/loki/api/error-report";

vi.mock("@/loki/api/error-report", () => ({
  reportFeError: vi.fn(),
}));

const CHILD_TEXT = "the real screen content";
const Child = () => <div>{CHILD_TEXT}</div>;

function gate(queries: LoadGateQuery[]) {
  return (
    <LoadGate queries={queries} label="board">
      <Child />
    </LoadGate>
  );
}

describe("LoadGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(reportFeError).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gates: unsettled query shows the overlay and does NOT render children", () => {
    render(gate([{ lastSuccessAt: null }]));
    expect(screen.getByText("loading board…")).toBeInTheDocument();
    expect(screen.queryByText(CHILD_TEXT)).toBeNull();
  });

  it("opens: all queries settled renders children, no overlay", () => {
    render(gate([{ lastSuccessAt: 1 }, { lastSuccessAt: 2 }]));
    expect(screen.getByText(CHILD_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(/loading board/)).toBeNull();
  });

  it("latches: a later error never re-shows the overlay for this mount", () => {
    const { rerender } = render(gate([{ lastSuccessAt: 1 }]));
    expect(screen.getByText(CHILD_TEXT)).toBeInTheDocument();
    // usePoll keeps lastSuccessAt across later transient errors — and even
    // if a query somehow unsettled, the ref latch keeps the gate open.
    rerender(gate([{ lastSuccessAt: 1, error: true }]));
    expect(screen.getByText(CHILD_TEXT)).toBeInTheDocument();
    rerender(gate([{ lastSuccessAt: null, error: true }]));
    expect(screen.getByText(CHILD_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(/loading board/)).toBeNull();
  });

  it("settles on definitive gone (404) without a success timestamp", () => {
    render(gate([{ lastSuccessAt: null, gone: true }]));
    expect(screen.getByText(CHILD_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(/loading board/)).toBeNull();
  });

  it("escalates 5s → slow line, 20s → failure panel + reportFeError; Retry refetches + resets", () => {
    const refetch = vi.fn();
    render(gate([{ lastSuccessAt: null, refetch }]));
    expect(screen.getByText("loading board…")).toBeInTheDocument();
    expect(screen.queryByText(/taking longer/)).toBeNull();

    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.getByText(/taking longer than usual — still trying…/)).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(15_000); });
    expect(screen.getByText(/couldn't load board/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(reportFeError).toHaveBeenCalledWith("load-gate-timeout", expect.stringContaining("board"));

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    // Panel resets to the spinner state and the timers restart.
    expect(screen.queryByText(/couldn't load board/)).toBeNull();
    expect(screen.getByText("loading board…")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.getByText(/taking longer/)).toBeInTheDocument();
  });
});
