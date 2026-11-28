// The sentinel's thresholds are PRINTED to the operator and mirrored by the close-time consolidator,
// so "what you saw live is what the record says". Moving a boundary here without moving it there
// breaks that promise silently — these tests pin the exact numbers, including both sides of each edge.
import { describe, it, expect, vi, afterEach } from "vitest";
import { sentinelFlags, episodeReportLanded } from "./sentinel-watch";

const turns = (...costs: number[]) => costs.map((ai_cost_usd) => ({ ai_cost_usd }));
const texts = (t: any[]) => sentinelFlags(t).map((f) => f.text);

describe("empty input", () => {
  it("returns no flags for an empty, null or undefined turn list", () => {
    expect(sentinelFlags([])).toEqual([]);
    expect(sentinelFlags(null as any)).toEqual([]);
    expect(sentinelFlags(undefined as any)).toEqual([]);
  });
});

describe("episode spend — the $0.25 notice and $1.00 warn", () => {
  it("stays silent below $0.25", () => {
    expect(texts(turns(0.24))).toEqual([]);
  });

  it("notices AT exactly $0.25", () => {
    const f = sentinelFlags(turns(0.25));
    expect(f[0]).toEqual({ sev: "notice", text: "episode spend $0.25 ≥ $0.25" });
  });

  it("warns AT exactly $1.00, and does NOT also emit the notice", () => {
    const f = sentinelFlags(turns(1));
    expect(f[0]).toEqual({ sev: "warn", text: "episode spend $1.00 ≥ $1.00" });
    expect(f.filter((x) => x.text.includes("$0.25"))).toHaveLength(0);
  });

  it("sums across turns rather than looking at any single one", () => {
    expect(texts(turns(0.1, 0.1, 0.1))).toContain("episode spend $0.30 ≥ $0.25");
  });

  it("treats a missing or non-numeric cost as zero instead of NaN", () => {
    expect(sentinelFlags([{}, { ai_cost_usd: null }, { ai_cost_usd: "abc" }])).toEqual([]);
    expect(texts([{ ai_cost_usd: "0.30" }, {}])).toContain("episode spend $0.30 ≥ $0.25");
  });
});

describe("cost spike — 3× the median, floored at $0.02", () => {
  it("needs at least 4 turns before it will fire at all", () => {
    // Three turns is too small a sample for a median to mean anything.
    expect(texts(turns(0.001, 0.001, 0.5)).some((t) => t.includes("spike"))).toBe(false);
  });

  it("fires when the LAST turn is 3× the median and above the $0.02 floor", () => {
    const t = texts(turns(0.01, 0.01, 0.01, 0.09));
    expect(t.some((x) => x.includes("cost spike — last turn $0.090"))).toBe(true);
  });

  it("does NOT fire on a big ratio that is still pennies (the $0.02 floor)", () => {
    // 100× the median, but $0.001 is not worth interrupting the operator over.
    expect(texts(turns(0.00001, 0.00001, 0.00001, 0.001)).some((x) => x.includes("spike"))).toBe(false);
  });

  it("does not fire when the last turn is merely average", () => {
    expect(texts(turns(0.05, 0.05, 0.05, 0.05)).some((x) => x.includes("spike"))).toBe(false);
  });

  it("judges the LAST turn, not the largest one", () => {
    // A spike in the middle already passed; the live watch is about what just happened.
    expect(texts(turns(0.01, 0.9, 0.01, 0.01)).some((x) => x.includes("spike"))).toBe(false);
  });
});

describe("rotation warning", () => {
  it("is silent at 44 turns and fires at 45", () => {
    const at44 = Array.from({ length: 44 }, () => ({ ai_cost_usd: 0 }));
    expect(texts(at44).some((t) => t.includes("rotation"))).toBe(false);
    expect(texts([...at44, { ai_cost_usd: 0 }])).toContain("45 turns — rotation lands at 60");
  });
});

describe("combinations", () => {
  it("reports spend, spike and rotation together, in that order", () => {
    const many = Array.from({ length: 44 }, () => ({ ai_cost_usd: 0.01 }));
    const f = sentinelFlags([...many, { ai_cost_usd: 0.5 }]);
    expect(f.map((x) => x.text.split(" ")[0])).toEqual(["episode", "cost", "45"]);
    expect(f[0].sev).toBe("notice"); // 44×0.01 + 0.5 = $0.94 — over $0.25, under $1.00
  });
});

describe("episodeReportLanded", () => {
  afterEach(() => vi.restoreAllMocks());

  it("publishes the chapter id as a window event (no import cycle with the sidebar)", () => {
    const seen: any[] = [];
    window.addEventListener("antiloki:episode-report", (e) => seen.push((e as CustomEvent).detail));
    episodeReportLanded(42);
    expect(seen).toEqual([{ id: 42 }]);
  });
});
