// The token estimator is deliberately approximate (BYOK means no single true tokenizer), but it
// must be approximate CONSISTENTLY — every surface that shows a count reads this module, so a
// change to the rounding here silently moves every number in the app.
import { describe, it, expect } from "vitest";
import { estimateTokens, fmtTokens, tokenLabel, fmtTokenLabel } from "./tokens";

describe("estimateTokens — ~4 chars per token, rounded UP", () => {
  it("returns 0 for empty, null and undefined (never NaN)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });

  it("rounds up so any non-empty text costs at least one token", () => {
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("x".repeat(4000))).toBe(1000);
  });
});

describe("fmtTokens — the three display bands", () => {
  it("shows raw digits below 1000", () => {
    expect(fmtTokens(0)).toBe("0");
    expect(fmtTokens(812)).toBe("812");
    expect(fmtTokens(999)).toBe("999");
  });

  it("shows one decimal from 1k to 10k", () => {
    expect(fmtTokens(1000)).toBe("1.0k");
    expect(fmtTokens(1234)).toBe("1.2k");
    expect(fmtTokens(9999)).toBe("10.0k"); // toFixed rounds at the band edge
  });

  it("drops the decimal at 10k and above", () => {
    expect(fmtTokens(10000)).toBe("10k");
    expect(fmtTokens(34400)).toBe("34k");
    expect(fmtTokens(1_500_000)).toBe("1500k");
  });

  it("clamps negatives to 0 and survives NaN rather than printing 'NaNk'", () => {
    expect(fmtTokens(-5)).toBe("0");
    expect(fmtTokens(NaN)).toBe("0");
  });
});

describe("the canonical labels", () => {
  it("always carries the ~ prefix and the 'tok' unit", () => {
    expect(tokenLabel("x".repeat(4800))).toBe("~1.2k tok");
    expect(fmtTokenLabel(34400)).toBe("~34k tok");
  });

  it("labels empty text as ~0 tok rather than omitting the count", () => {
    expect(tokenLabel("")).toBe("~0 tok");
  });
});
