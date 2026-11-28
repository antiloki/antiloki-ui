// Grokbot QA 2026-10-12, item 25: a graph of two folder nodes must not be zoomed until its nodes fill the screen.
import { describe, it, expect } from "vitest";
import { graphBounds, GRAPH_MIN_W, GRAPH_MIN_H } from "./atlas-graph";

describe("graph view box", () => {
  it("two nodes with no edge still get a roomy box, so a node stays small", () => {
    const b = graphBounds([{ x: 0, y: 0 }, { x: 60, y: 10 }]);
    expect(b.w).toBeGreaterThanOrEqual(GRAPH_MIN_W);
    expect(b.h).toBeGreaterThanOrEqual(GRAPH_MIN_H);
    // a node of radius 7 drawn into a 1000 px wide container is then at most ~20 px across, not the ~100 px the tight box gave
    expect((7 * 2 * 1000) / b.w).toBeLessThan(40);
  });
  it("a single node is centred in the box, with room on the right for its label", () => {
    const b = graphBounds([{ x: 100, y: 50 }]);
    expect(b.minX).toBeLessThan(100 - 30);
    expect(b.minX + b.w).toBeGreaterThan(100 + 30 + 90 - 1);
    expect(b.minY).toBeLessThan(50);
    expect(b.minY + b.h).toBeGreaterThan(50);
  });
  it("a large graph is fitted as before, plus the label room", () => {
    const b = graphBounds([{ x: -500, y: -400 }, { x: 500, y: 400 }]);
    expect(b.w).toBeCloseTo(1000 + 60 + 90, 0);
    expect(b.h).toBeCloseTo(800 + 60, 0);
    expect(b.minX).toBeCloseTo(-530, 0);
  });
});
