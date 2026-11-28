import { describe, it, expect } from "vitest";
import { confidenceOf, confidenceLabel, measuredPct } from "./confidence";

describe("confidence, and where it came from", () => {
  it("counts evidence with the same curve the router weights a row by", () => {
    // n/(n+1): one run is a coin flip, and no amount of runs reaches certainty
    expect(measuredPct(1)).toBe(50);
    expect(measuredPct(3)).toBe(75);
    expect(measuredPct(9)).toBe(90);
    expect(measuredPct(99)).toBe(99);
    expect(measuredPct(0)).toBe(0);
    expect(measuredPct(-4)).toBe(0);
  });

  it("prefers a count over an opinion", () => {
    const c = confidenceOf({ confidence: "high" }, { runs: 3 })!;
    expect(c.kind).toBe("measured");
    expect(c.pct).toBe(75);          // the record's 3 runs, not the model's "high" (85)
    expect(c.why).toContain("not whether the answer is right");
  });

  it("falls back to the model's own word, and says that is what it is", () => {
    const c = confidenceOf({ confidence: "medium" }, { runs: 0 })!;
    expect(c).toEqual({ pct: 60, kind: "stated", why: expect.stringContaining("the model's own word") });
    expect(confidenceLabel(c)).toBe("60% stated");
  });

  it("SAYS NOTHING when it has nothing — the whole point", () => {
    // a number here would be indistinguishable from a measured one, and wrong
    expect(confidenceOf(null, null)).toBeNull();
    expect(confidenceOf({ confidence: "" }, { runs: 0 })).toBeNull();
    expect(confidenceOf({ confidence: "quite sure actually" }, null)).toBeNull();
    expect(confidenceOf(undefined, undefined)).toBeNull();
  });
});
