import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { canAnimate, SWITCH_MS, useSwitchAnim } from "./switch-anim";

function Area({ k }: { k: string }) { const ref = useSwitchAnim<HTMLDivElement>(k); return <div ref={ref} data-testid="area">{k}</div>; }
describe("the switch animation", () => {
  it("is fast, and off without Web Animations or with reduced motion", () => {
    expect(SWITCH_MS).toBeLessThanOrEqual(200); expect(canAnimate(null, false)).toBe(false); expect(canAnimate({}, false)).toBe(false); expect(canAnimate({ animate: () => 0 }, true)).toBe(false); expect(canAnimate({ animate: () => 0 }, false)).toBe(true);
  });
  it("runs when the key changes, not on the first paint, and never remounts", () => {
    const animate = vi.fn(); (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
    const { rerender, getByTestId } = render(<Area k="a" />); const el = getByTestId("area"); expect(animate).not.toHaveBeenCalled();
    rerender(<Area k="b" />); expect(animate).toHaveBeenCalledTimes(1); expect(getByTestId("area")).toBe(el); rerender(<Area k="b" />); expect(animate).toHaveBeenCalledTimes(1);
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  });
});
