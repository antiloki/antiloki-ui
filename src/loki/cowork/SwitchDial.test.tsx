import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SwitchDial, turnDial, wrapK, arcPos, stepIndex } from "./SwitchDial";
import { tickSamples } from "./tick-sound";
vi.mock("./tick-sound", async (orig) => ({ ...(await orig<any>()), playTick: vi.fn() }));
import { playTick } from "./tick-sound";

const T = (id: string, team?: string): any => ({ id, name: id, active: false, team: team ?? null, panes: [] });
describe("the switch dial", () => {
  it("wraps round the ring and lays items along the arc", () => {
    expect(wrapK(9, 10)).toBe(-1); expect(wrapK(-1, 10)).toBe(-1); expect(wrapK(5, 10)).toBe(5); expect(stepIndex(0, -1, 4)).toBe(3); expect(stepIndex(3, 1, 4)).toBe(0); expect(arcPos(0).y).toBe(0); expect(arcPos(1).y).toBeGreaterThan(0); expect(arcPos(-1).y).toBeLessThan(0); expect(arcPos(2).x).toBeLessThan(arcPos(0).x);
  });
  it("a tick is a few milliseconds of noise that dies away at once", () => {
    const s = tickSamples(48000, 14, () => 0.9); expect(s.length).toBe(672); expect(Math.abs(s[0])).toBeGreaterThan(Math.abs(s[s.length - 1]) * 50);
  });
  it("opens when the leader asks, turns with Up and Down and a tick, chooses nothing until Enter, and Esc or any other key stays", () => {
    vi.mocked(playTick).mockClear(); const go = vi.fn(); render(<SwitchDial threads={[T("main"), T("copy"), T("seo", "seo")]} activeId="main" onGo={go} />);
    expect(screen.queryByTestId("switch-dial")).toBeNull();
    act(() => turnDial(1)); expect(screen.getByTestId("dial-item-copy").getAttribute("data-sel")).toBe("1"); expect(playTick).toHaveBeenCalledTimes(1); expect(go).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "ArrowDown" }); expect(screen.getByTestId("dial-item-seo").getAttribute("data-sel")).toBe("1"); fireEvent.keyDown(window, { key: "ArrowUp" }); expect(screen.getByTestId("dial-item-copy").getAttribute("data-sel")).toBe("1"); expect(go).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Enter" }); expect(go).toHaveBeenCalledWith("copy"); expect(screen.queryByTestId("switch-dial")).toBeNull();
    go.mockClear(); act(() => turnDial(-1)); fireEvent.keyDown(window, { key: "Escape" }); expect(go).not.toHaveBeenCalled(); expect(screen.queryByTestId("switch-dial")).toBeNull();
    act(() => turnDial(1)); fireEvent.keyDown(window, { key: "x" }); expect(go).not.toHaveBeenCalled(); expect(screen.queryByTestId("switch-dial")).toBeNull();
  });
});
