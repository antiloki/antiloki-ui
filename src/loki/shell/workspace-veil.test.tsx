// @vitest-environment jsdom
// The veil has one hard requirement: it must ALWAYS come down. A loading screen you cannot leave is a worse bug than
// the stale data it was covering, so both exits — the switch took, the switch failed — are tested.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { WorkspaceVeil, veilText, SWITCHING, CHANGED, FAILED, SETTLE_MS } from "./workspace-veil";

const fire = (type: string, name?: string) => act(() => { window.dispatchEvent(new CustomEvent(type, { detail: name ? { name } : {} })); });

describe("veilText", () => {
  it("names the destination when the event carried one, and stays generic when it did not", () => {
    expect(veilText("miniStore")).toBe("switching to miniStore…");
    expect(veilText(null)).toBe("switching workspace…");
    expect(veilText("")).toBe("switching workspace…");
  });
});

describe("the workspace veil", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is absent until a switch starts, then covers the screen and names the workspace", () => {
    render(<WorkspaceVeil />);
    expect(screen.queryByTestId("workspace-veil")).toBeNull();
    fire(SWITCHING, "react-main");
    expect(screen.getByTestId("workspace-veil")).toBeTruthy();
    expect(screen.getByTestId("workspace-veil-text").textContent).toBe("switching to react-main…");
  });

  it("stays up for a moment after the switch takes — so the first refetches land behind it, not empty screens", () => {
    render(<WorkspaceVeil />);
    fire(SWITCHING, "react-main");
    fire(CHANGED, "react-main");
    expect(screen.queryByTestId("workspace-veil")).toBeTruthy();   // still up during the settle
    act(() => { vi.advanceTimersByTime(SETTLE_MS + 20); });
    expect(screen.queryByTestId("workspace-veil")).toBeNull();     // and it comes down
  });

  it("comes down AT ONCE when the switch fails — the operator is still on the old workspace and needs the screen", () => {
    render(<WorkspaceVeil />);
    fire(SWITCHING, "react-main");
    fire(FAILED, "react-main");
    expect(screen.queryByTestId("workspace-veil")).toBeNull();
    act(() => { vi.advanceTimersByTime(SETTLE_MS + 20); });
    expect(screen.queryByTestId("workspace-veil")).toBeNull();     // and a late settle cannot raise it again
  });

  it("a second switch during the settle keeps the veil up rather than flashing it away", () => {
    render(<WorkspaceVeil />);
    fire(SWITCHING, "a");
    fire(CHANGED, "a");
    fire(SWITCHING, "b");                                          // the operator switched again immediately
    act(() => { vi.advanceTimersByTime(SETTLE_MS + 20); });
    expect(screen.getByTestId("workspace-veil")).toBeTruthy();      // the first switch's settle must not close the second
    expect(screen.getByTestId("workspace-veil-text").textContent).toBe("switching to b…");
    fire(CHANGED, "b");
    act(() => { vi.advanceTimersByTime(SETTLE_MS + 20); });
    expect(screen.queryByTestId("workspace-veil")).toBeNull();
  });
});
