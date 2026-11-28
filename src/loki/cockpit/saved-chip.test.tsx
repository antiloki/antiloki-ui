// @vitest-environment jsdom
// The product's one claim, in the one slot that never folds. These hold the two rules it must not break.
import { describe, it, expect } from "vitest";
import { savedLabel, savedTitle, type Saved } from "./saved-chip";

const s = (o: Partial<NonNullable<Saved>>): Saved => ({ saved_usd: 1, actual_usd: 1, baseline_usd: 2, tokens: 10, runs: 1, ...o });

describe("the saved chip", () => {
  it("shows the money, and never invents one", () => {
    expect(savedLabel(s({ saved_usd: 12.3456 }))).toBe("$12.35");   // just the money — no word, the colour says it
    // NOTHING MEASURED IS NOT ZERO. "$0.00 saved" reads as "this saves you nothing" to the one person who has not
    // tried it yet — the worst possible audience for that sentence.
    expect(savedLabel(null)).toBe("");
    expect(savedLabel(s({ runs: 0 }))).toBe("");
    // …BUT ONCE ANYTHING HAS BEEN MEASURED (the first-run check's tiny calls) the chip shows, with the truth: nothing saved yet
    expect(savedLabel(s({ runs: 0, saved_usd: 0, calls: 4 }))).toBe("$0.00");
    expect(savedLabel(s({ runs: 0, saved_usd: 0, calls: 0 }))).toBe("");
    expect(savedLabel(s({ saved_usd: NaN }))).toBe("");
  });
  it("does not round a real saving down to nothing", () => {
    expect(savedLabel(s({ saved_usd: 0.004 }))).toBe("<$0.01");
    expect(savedLabel(s({ saved_usd: 0 }))).toBe("$0.00");   // a measured zero IS zero
  });
  it("says what the number means, so it is never read as a metered bill", () => {
    const t = savedTitle(s({ saved_usd: 6, actual_usd: 4, baseline_usd: 10, runs: 3 }));
    expect(t).toContain("$4.00 instead of $10.00");
    expect(t).toContain("60%");
    expect(t).toContain("3 routed runs");
    expect(t).toContain("subscription pays $0 metered");
  });
  it("tells a new operator why it is empty rather than saying zero", () => {
    expect(savedTitle(s({ runs: 0 }))).toContain("nothing routed yet");
    expect(savedTitle(s({ runs: 0, calls: 4, calls_usd: 0.012 }))).toMatch(/4 calls measured so far \(\$0\.01 at API prices\).*nothing saved yet/);
  });
});
