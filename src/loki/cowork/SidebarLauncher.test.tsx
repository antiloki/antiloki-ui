// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { BloomPanel, originOf, FOLD_MS } from "./SidebarLauncher";

describe("the sidebar opens from the logo on the bottom bar", () => {
  it("the panel grows from the bar's logo, and folds back on Esc or a click outside, after its fold animation", () => {
    vi.useFakeTimers(); const close = vi.fn(); render(<><button data-testid="bar-logo">a.</button><BloomPanel onClose={close}><div data-testid="inside">the sidebar</div></BloomPanel></>);
    expect(screen.getByTestId("inside")).toBeTruthy(); const panel = screen.getByTestId("launcher-panel"); expect(panel.style.getPropertyValue("--bx")).toMatch(/px$/); expect(panel.getAttribute("data-closing")).toBe("0");
    fireEvent.keyDown(window, { key: "Escape" }); expect(panel.getAttribute("data-closing")).toBe("1"); expect(close).not.toHaveBeenCalled(); act(() => { vi.advanceTimersByTime(FOLD_MS + 5); }); expect(close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("a click on the dimmed screen folds it too, and the origin is the offset from the middle of the screen to the logo", () => {
    vi.useFakeTimers(); const close = vi.fn(); render(<BloomPanel onClose={close}><div /></BloomPanel>); fireEvent.mouseDown(screen.getByTestId("launcher-scrim")); act(() => { vi.advanceTimersByTime(FOLD_MS + 5); }); expect(close).toHaveBeenCalledTimes(1); vi.useRealTimers();
    expect(originOf({ left: 10, top: 10, width: 30, height: 30 }, 1000, 800)).toEqual({ x: -475, y: -375 }); expect(originOf(null, 900, 600).x).toBeLessThan(0);
  });
});
