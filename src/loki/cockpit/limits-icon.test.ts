import { describe, it, expect } from "vitest";
import { limitBars, tightest, limitsLine } from "./limits-icon";

const l = (o: Partial<any>) => ({ key: "claude", glyph: "✦", label: "claude", panes: 1, tokens: 1, cost: 1, fiveH: null, week: null, weekTokens: 1, tone: "ok" as const, ...o });

describe("the limits graph", () => {
  // `used_pct` IS ALWAYS A PERCENTAGE (audit 2026-09-28). Serve computes it as `used / size * 100` and its own
  // tests assert 6.0 and 63.0; `fuel-mini` prints it as `Math.round(l.fiveH)%`. This test used to assert that
  // 0.8 meant 80%, which encoded a shape serve never sends — and the `v > 1 ? v/100 : v` guess that satisfied it
  // drew a window at 1% as a FULL RED BAR while the fuel popover beside it read "5h 1%".
  it("reads used_pct as a percentage, and clamps", () => {
    const [b] = limitBars([l({ fiveH: 42, week: 80 })]);
    expect(b.session).toBeCloseTo(0.42); expect(b.week).toBeCloseTo(0.8);
    // the case that was backwards: one percent used is nearly empty, not nearly full
    expect(limitBars([l({ fiveH: 1 })])[0].session).toBeCloseTo(0.01);
    expect(limitBars([l({ fiveH: 0.5 })])[0].session).toBeCloseTo(0.005);
    expect(limitBars([l({ fiveH: 140 })])[0].session).toBe(1);
    expect(limitBars([l({ fiveH: -5 })])[0].session).toBe(0);
  });
  it("NEVER reads a silent engine as plenty left", () => {
    // the whole point of the icon: an unknown window is unknown, not empty
    const [b] = limitBars([l({ fiveH: null, week: null })]);
    expect(b.session).toBeNull(); expect(b.week).toBeNull();
    expect(tightest([b])).toBeNull();
    expect(limitsLine([b])).toBe("no engine has reported a window yet");
  });
  it("shows the WORST window anywhere, because that is the one that stops you", () => {
    const bars = limitBars([l({ key: "claude", fiveH: 20, week: 55 }), l({ key: "codex", label: "codex", fiveH: 91, week: 10 })]);
    const t = tightest(bars)!;
    expect(t.key).toBe("codex"); expect(t.which).toBe("session");
    expect(limitsLine(bars)).toBe("9% of codex's session left");
  });
  it("counts a weekly window when it is the tighter one", () => {
    const bars = limitBars([l({ fiveH: 10, week: 96 })]);
    expect(tightest(bars)!.which).toBe("week");
    expect(limitsLine(bars)).toBe("4% of claude's week left");
  });
});

import { tokenTotals } from "./limits-icon";
describe("the token totals", () => {
  const f = (houses: any[]) => ({ days: 7, houses, models: [], limits: [], saved: null, compare: [], analysis: "" } as any);
  it("sums every engine's calls, tokens and cost", () => {
    const t = tokenTotals(f([
      { house: "claude", calls: 10, cost: 1.5, tokens_in: 1000, tokens_out: 200, tokens: 1200, failed: 1, models: 2 },
      { house: "codex", calls: 4, cost: 0.5, tokens_in: 400, tokens_out: 100, tokens: 500, failed: 0, models: 1 },
    ]));
    expect(t).toEqual({ tokens: 1700, tokens_in: 1400, tokens_out: 300, calls: 14, failed: 1, cost: 2 });
  });
  it("answers zeroes for no data rather than throwing", () => {
    expect(tokenTotals(null).tokens).toBe(0);
  });
});
