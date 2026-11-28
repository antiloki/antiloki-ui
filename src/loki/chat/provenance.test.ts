// The point of these tests is the ONE thing provenance.ts must never do: answer a question it has no evidence for.
import { describe, it, expect } from "vitest";
import { domainOf, measuredOn, domainWord, domainsTested, coverageLine, stackLine, thin, evidenceLine, stackOf, stackWord, languagesTested,
         suiteOf, suiteWord, suiteRoutes, benchesTested, benchesLine, CONTROL_SUITES, SUITE_ABOUT } from "./provenance";
import { readFileSync, existsSync } from "node:fs";

const row = (domain: string | undefined, n: number) => ({ domain, n });

describe("domainOf", () => {
  it("treats an absent, empty and unknown domain as the same pool", () => {
    expect(domainOf({})).toBe("any");
    expect(domainOf({ domain: "" })).toBe("any");
    expect(domainOf({ domain: "  " })).toBe("any");
    expect(domainOf({ domain: "unknown" })).toBe("any");
    expect(domainOf({ domain: "any" })).toBe("any");
  });
  it("normalises case, because the record is written by several call paths", () => {
    expect(domainOf({ domain: "Backend" })).toBe("backend");
  });
});

describe("measuredOn", () => {
  it("names the kind of work and the sample count", () => {
    expect(measuredOn(row("backend", 31))).toBe("backend work · 31 samples");
    expect(measuredOn(row("frontend", 1))).toBe("frontend work · 1 sample");
  });
  it("says POOLED for `any` instead of dressing the pool up as a domain", () => {
    expect(measuredOn(row("any", 280))).toBe("pooled across kinds of work · 280 samples");
    expect(measuredOn(row(undefined, 4))).toContain("pooled");
  });
  it("says NOT MEASURED when there are no samples — never a domain with zero behind it", () => {
    expect(measuredOn(row("backend", 0))).toBe("not measured");
    expect(measuredOn(row("backend", -1))).toBe("not measured");
    expect(measuredOn({ domain: "backend" })).toBe("not measured");
  });
});

describe("domainWord", () => {
  it("is three words at most and still refuses to invent", () => {
    expect(domainWord(row("backend", 5))).toBe("backend");
    expect(domainWord(row("any", 5))).toBe("pooled");
    expect(domainWord(row("backend", 0))).toBe("unmeasured");
  });
});

describe("domainsTested", () => {
  it("counts rows and samples per kind of work, most evidence first", () => {
    const t = domainsTested([row("backend", 100), row("backend", 32), row("frontend", 32), row("any", 280)]);
    expect(t).toEqual([
      { domain: "pooled", rows: 1, samples: 280 },
      { domain: "backend", rows: 2, samples: 132 },
      { domain: "frontend", rows: 1, samples: 32 },
    ]);
  });
  it("matches the real record's shape (2026-09-25: backend 132 · any 280 · frontend 32 · mixed 2)", () => {
    const rows = [
      ...Array(81).fill(0).map(() => row("backend", 132 / 81)),
      ...Array(59).fill(0).map(() => row("any", 280 / 59)),
      ...Array(16).fill(0).map(() => row("frontend", 2)),
      ...Array(2).fill(0).map(() => row("mixed", 1)),
    ];
    const t = domainsTested(rows);
    expect(t.map((d) => d.domain)).toEqual(["pooled", "backend", "frontend", "mixed"]);
    expect(t.find((d) => d.domain === "backend")!.rows).toBe(81);
  });
  it("is empty for no rows", () => { expect(domainsTested([])).toEqual([]); });
});

describe("coverageLine", () => {
  it("prints what was tested, in sample order", () => {
    expect(coverageLine([row("backend", 132), row("frontend", 32), row("any", 280)]))
      .toBe("tested on pooled (280) · backend (132) · frontend (32)");
  });
  it("is EMPTY rather than a lie when nothing has samples", () => {
    expect(coverageLine([])).toBe("");
    expect(coverageLine([row("backend", 0), row("frontend", 0)])).toBe("");
  });
});

describe("stackLine", () => {
  it("prints the repo's own technology — the other axis, never compared to a domain", () => {
    expect(stackLine("rust")).toBe("this repo is rust");
  });
  it("is empty when the serve could not tell, or said `any`", () => {
    expect(stackLine(undefined)).toBe("");
    expect(stackLine("")).toBe("");
    expect(stackLine("any")).toBe("");
  });
});

describe("thin", () => {
  it("calls a null or under-sampled winner thin, so a weight is never shown as earned", () => {
    expect(thin(null)).toBe(true);
    expect(thin(undefined)).toBe(true);
    expect(thin({ n: 0 })).toBe(true);
    expect(thin({ n: 2 })).toBe(true);
    expect(thin({ n: 3 })).toBe(false);
    expect(thin({ n: 3 }, 10)).toBe(true);
  });
});

// ── WHAT KIND OF EVIDENCE (plan II.7, the other half of provenance) ────────────────────────────────────────────────
describe("evidenceLine", () => {
  it("counts controlled and observed runs apart, because they are not interchangeable", () => {
    expect(evidenceLine({ controlled: { rows: 24, runs: 120 }, observed: { rows: 134, runs: 158 } }))
      .toBe("from 120 controlled (bench) · 158 observed (your runs)");
  });
  it("names a quarantined source instead of letting it vanish", () => {
    expect(evidenceLine({ observed: { runs: 3 }, quarantined: [{ source: "bench-v2", rows: 1, runs: 1 }] }))
      .toBe("from 3 observed (your runs) · 1 quarantined, scored zero");
  });
  it("says nothing when the serve said nothing — an older serve, or a record it could not read", () => {
    expect(evidenceLine(null)).toBe("");
    expect(evidenceLine(undefined)).toBe("");
    expect(evidenceLine({})).toBe("");
    expect(evidenceLine({ controlled: { rows: 0, runs: 0 }, observed: { rows: 0, runs: 0 } })).toBe("");
  });
  it("omits a class with no runs rather than printing a zero", () => {
    expect(evidenceLine({ controlled: { runs: 9 } })).toBe("from 9 controlled (bench)");
    expect(evidenceLine({ observed: { runs: 9 } })).toBe("from 9 observed (your runs)");
  });
});

// ── THE LANGUAGE AXIS (II.2 — what a polyglot benchmark fills) ──────────────────────────────────────────────────────
describe("stackOf · stackWord · languagesTested", () => {
  it("treats an absent or unknown language as the pool, and normalises case", () => {
    expect(stackOf({})).toBe("any");
    expect(stackOf({ stack: "" })).toBe("any");
    expect(stackOf({ stack: "unknown" })).toBe("any");
    expect(stackOf({ stack: "Rust" })).toBe("rust");
  });
  it("says POOLED rather than dressing the pool up as a language, and UNMEASURED with no samples", () => {
    expect(stackWord({ stack: "rust", n: 4 })).toBe("rust");
    expect(stackWord({ stack: "any", n: 4 })).toBe("pooled");
    expect(stackWord({ stack: "rust", n: 0 })).toBe("unmeasured");
  });
  it("counts the samples behind each language, most evidence first", () => {
    expect(languagesTested([{ stack: "rust", n: 6 }, { stack: "python", n: 2 }, { stack: "rust", n: 4 }, { n: 100 }]))
      .toBe("languages: pooled (100) · rust (10) · python (2)");
  });
  it("says nothing when nothing is measured, so the caller can omit the line", () => {
    expect(languagesTested([])).toBe("");
    expect(languagesTested([{ stack: "rust", n: 0 }])).toBe("");
  });
});

// ── WHICH BENCH (2026-09-26) ───────────────────────────────────────────────────────────────────────────────────────
describe("the bench a number came from", () => {
  it("does NOT call an unlabelled row pooled — a lost label is not breadth", () => {
    // this is the distinction the whole axis rests on: `domain: ""` means measured across many; `suite: ""` means
    // measured on exactly one and nobody wrote down which. Calling the second `pooled` invents coverage.
    expect(suiteOf({})).toBe("unnamed");
    expect(suiteOf({ suite: "" })).toBe("unnamed");
    expect(suiteOf({ suite: "unknown" })).toBe("unnamed");
    expect(suiteOf({ suite: "Ministore" })).toBe("ministore");
    expect(domainOf({ domain: "" })).toBe("any");   // and the other axis is unchanged
  });
  it("says unmeasured with no samples", () => {
    expect(suiteWord({ suite: "polyglot", n: 3 })).toBe("polyglot");
    expect(suiteWord({ suite: "polyglot", n: 0 })).toBe("unmeasured");
  });
  it("knows which benches are control — kept for comparison, never a vote", () => {
    expect(suiteRoutes("ministore")).toBe(true);
    expect(suiteRoutes("polyglot")).toBe(true);
    expect(suiteRoutes("unnamed")).toBe(true);       // an old row still earned its place
    expect(suiteRoutes("swebench")).toBe(false);
    expect(suiteRoutes(" SWE ")).toBe(false);        // trimmed and case-folded, or the guard is bypassable
    expect(suiteRoutes("control")).toBe(false);
  });
  it("counts each bench apart and MARKS a control one in the line", () => {
    const rows = [{ suite: "ministore", n: 120 }, { suite: "polyglot", n: 30 }, { suite: "swebench", n: 12 }, { n: 11 }];
    expect(benchesTested(rows).map((b) => b.suite)).toEqual(["ministore", "polyglot", "swebench", "unnamed"]);
    expect(benchesLine(rows)).toBe("benches: ministore (120) · polyglot (30) · swebench (12, control) · unnamed (11)");
  });
  it("says nothing when nothing is measured", () => {
    expect(benchesLine([])).toBe("");
    expect(benchesLine([{ suite: "ministore", n: 0 }])).toBe("");
  });
  it("has a sentence for every bench it can name, the unlabelled one included", () => {
    for (const k of ["ministore", "polyglot", "swebench", "swtbench", "unnamed"]) expect(SUITE_ABOUT[k]).toBeTruthy();
    // a control bench is named as one in its own sentence, and SWT-bench is NOT a control: it measures a job the
    // router actually files work under, so it routes
    expect(SUITE_ABOUT.swebench).toContain("does not route");
    expect(suiteRoutes("swtbench")).toBe(true);
  });
});

// THE DRIFT THAT WOULD BE INVISIBLE: the FE marks a bench "control" and the serve decides whether it routes. If the
// two lists part ways, the screen says a number does not vote while the router counts it — a silent lie. So the test
// reads the serve's own list. Skipped, not failed, where the sibling repo is not checked out.
describe("CONTROL_SUITES against the serve", () => {
  it("matches merges::suite_routes exactly", () => {
    const f = "../antiloki-core-rust/serve/src/merges.rs";
    if (!existsSync(f)) { expect(CONTROL_SUITES.length).toBeGreaterThan(0); return; }
    const m = readFileSync(f, "utf8").match(/pub const CONTROL_SUITES: &\[&str\] = &\[([^\]]*)\]/);
    expect(m, "CONTROL_SUITES is not where this test expects it — update both sides together").toBeTruthy();
    const rust = (m![1].match(/"([^"]+)"/g) ?? []).map((q) => q.slice(1, -1)).sort();
    expect(rust).toEqual([...CONTROL_SUITES].sort());
  });
});
