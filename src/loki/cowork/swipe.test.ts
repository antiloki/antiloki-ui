import { describe, expect, it } from "vitest";
import { SWIPE_MIN_PX, startsInSideScroll, stepTo, swipeStep } from "./swipe";

describe("swiping between panes", () => {
  it("a long, mostly sideways drag is a switch: left goes on, right goes back; short or mostly vertical ones are not", () => {
    expect(swipeStep(-120, 10)).toBe(1); expect(swipeStep(120, -10)).toBe(-1); expect(swipeStep(-(SWIPE_MIN_PX - 1), 0)).toBe(0); expect(swipeStep(-100, 90)).toBe(0); expect(swipeStep(0, 200)).toBe(0); expect(swipeStep(-60, 38)).toBe(1);
  });
  it("steps round the panes in order, and has nowhere to go with fewer than two", () => {
    expect(stepTo(["a", "b", "c"], "a", 1)).toBe("b"); expect(stepTo(["a", "b", "c"], "c", 1)).toBe("a"); expect(stepTo(["a", "b", "c"], "a", -1)).toBe("c"); expect(stepTo(["a"], "a", 1)).toBeNull(); expect(stepTo([], null, 1)).toBeNull(); expect(stepTo(["a", "b"], null, 1)).toBe("a");
  });
  it("a touch that begins inside a text field or something that scrolls sideways belongs to it", () => {
    const root = document.createElement("div"); const wide = document.createElement("div"); wide.style.overflowX = "auto"; Object.defineProperty(wide, "scrollWidth", { value: 900 }); Object.defineProperty(wide, "clientWidth", { value: 300 });
    const inner = document.createElement("span"); wide.appendChild(inner); const input = document.createElement("input"); const plain = document.createElement("p"); root.append(wide, input, plain); document.body.appendChild(root);
    expect(startsInSideScroll(inner, root)).toBe(true); expect(startsInSideScroll(input, root)).toBe(true); expect(startsInSideScroll(plain, root)).toBe(false); document.body.removeChild(root);
  });
});
