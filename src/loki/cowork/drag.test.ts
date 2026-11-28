import { describe, it, expect } from "vitest";
import { zoneAt, zoneBox, EDGE } from "./drag";

const R = { left: 100, top: 50, width: 400, height: 300 };
describe("where a dropped pane goes", () => {
  it("the nearest edge inside the band wins; the middle swaps", () => {
    expect(zoneAt(110, 200, R)).toBe("left"); expect(zoneAt(490, 200, R)).toBe("right");
    expect(zoneAt(300, 55, R)).toBe("above"); expect(zoneAt(300, 345, R)).toBe("below");
    expect(zoneAt(300, 200, R)).toBe("swap");
  });
  it("the band is a share of each side, so a narrow pane still has a middle", () => {
    const edgePx = EDGE * R.width; expect(zoneAt(R.left + edgePx - 1, 200, R)).toBe("left"); expect(zoneAt(R.left + edgePx + 1, 200, R)).toBe("swap");
  });
  it("a corner goes to the nearer of its two edges", () => {
    expect(zoneAt(105, 60, R)).toBe("left");   // 1.25% from the left, 3.3% from the top
    expect(zoneAt(130, 52, R)).toBe("above");  // 7.5% from the left, 0.7% from the top
  });
  it("a pointer outside the box, or a box with no size, is clamped or a swap, never a throw", () => {
    expect(zoneAt(-50, 200, R)).toBe("left"); expect(zoneAt(300, 200, { ...R, width: 0 })).toBe("swap");
  });
  it("each zone lights the half it would take", () => {
    expect(zoneBox("left")).toEqual({ left: "0%", top: "0%", width: "50%", height: "100%" }); expect(zoneBox("below").top).toBe("50%"); expect(zoneBox("swap").width).toBe("100%");
  });
});
