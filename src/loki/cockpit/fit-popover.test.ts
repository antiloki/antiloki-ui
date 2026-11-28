import { describe, it, expect } from "vitest";
import { shiftToFit, fitPopover } from "./fit-popover";

describe("a preview stays on the screen", () => {
  it("moves a box that leaks over the right edge back inside, and one over the left edge", () => {
    expect(shiftToFit(1047, 1297, 1280)).toBe(-29);            // the money chip's preview at the right edge: 250 wide, 17 px over the 12 px margin
    expect(shiftToFit(-20, 230, 1280)).toBe(32);               // leaking left
    expect(shiftToFit(500, 750, 1280)).toBe(0);                // already fine
    expect(shiftToFit(0, 600, 400)).toBe(12);                  // wider than the window: left edge to the margin
  });
  it("applies the shift to a real element", () => {
    const el = document.createElement("div");
    el.getBoundingClientRect = () => ({ left: 1047, right: 1297, top: 0, bottom: 10, width: 250, height: 10, x: 1047, y: 0, toJSON() {} }) as DOMRect;
    Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
    fitPopover(el);
    expect(el.style.marginLeft).toBe("-29px");
    el.getBoundingClientRect = () => ({ left: 600, right: 850, top: 0, bottom: 10, width: 250, height: 10, x: 600, y: 0, toJSON() {} }) as DOMRect;
    fitPopover(el);
    expect(el.style.marginLeft).toBe("0px");   // it fits now, so nothing is applied (and an earlier nudge is cleared)
  });
});
