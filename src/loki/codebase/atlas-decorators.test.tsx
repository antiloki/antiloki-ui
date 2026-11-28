// The scoring behind the block decorators. These are the numbers the operator reads as a verdict on
// their code, so the thresholds and the weighting are the contract: a block that should read "bad"
// reading "ok" is a wrong verdict delivered with full confidence.
import { describe, it, expect, vi } from "vitest";

// The module pulls in the full decorator UI; only the pure scoring functions are under test here.
vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn(async () => null), apiGet: vi.fn(async () => null), unwrapResult: (r: any) => r }));

import { conTone, blockAxes, harvestArms } from "./atlas-decorators";
import { C } from "@/loki/theme";

describe("conTone — the health colour bands", () => {
  it("is dim for an unknown score, never a verdict colour", () => {
    // An unmeasured file must not look like a passing one.
    expect(conTone(null)).toBe(C.dim);
    expect(conTone(undefined)).toBe(C.dim);
  });

  it("is ok from 85 up", () => {
    expect(conTone(85)).toBe(C.ok);
    expect(conTone(100)).toBe(C.ok);
  });

  it("is warn from 60 to 84", () => {
    expect(conTone(84)).toBe(C.warn);
    expect(conTone(60)).toBe(C.warn);
  });

  it("is bad below 60", () => {
    expect(conTone(59)).toBe(C.bad);
    expect(conTone(0)).toBe(C.bad);
  });
});

describe("blockAxes", () => {
  const dec = (over: any = {}) => ({ line: 10, end_line: 20, complexity: 3, ...over } as any);

  it("treats a block with no violations as fully compliant", () => {
    expect(blockAxes(dec(), undefined).compliance).toBe(100);
  });

  it("takes compliance from the bucketed constitution score when there is one", () => {
    expect(blockAxes(dec(), { score: 40 } as any).compliance).toBe(40);
  });

  it("measures length from the inclusive line range", () => {
    expect(blockAxes(dec({ line: 10, end_line: 20 }), undefined).loc).toBe(11);
    expect(blockAxes(dec({ line: 5, end_line: 5 }), undefined).loc).toBe(1);
  });

  it("reports loc null when the block has no end line", () => {
    expect(blockAxes(dec({ end_line: null }), undefined).loc).toBeNull();
  });

  it("gives a small, simple block a perfect structure score", () => {
    // complexity ≤ 4 and ≤ 50 lines cost nothing — the thresholds are the point.
    expect(blockAxes(dec({ line: 1, end_line: 40, complexity: 4 }), undefined).structure).toBe(100);
  });

  it("penalises complexity ABOVE 4, at 7 points each", () => {
    expect(blockAxes(dec({ line: 1, end_line: 10, complexity: 5 }), undefined).structure).toBe(93);
    expect(blockAxes(dec({ line: 1, end_line: 10, complexity: 8 }), undefined).structure).toBe(72);
  });

  it("penalises length ABOVE 50 lines, at 0.3 per line", () => {
    // 150 lines → (150 − 50) × 0.3 = 30 points off.
    expect(blockAxes(dec({ line: 1, end_line: 150, complexity: 0 }), undefined).structure).toBe(70);
    // and 51 lines costs almost nothing — the threshold is a soft start, not a cliff
    expect(blockAxes(dec({ line: 1, end_line: 51, complexity: 0 }), undefined).structure).toBe(100);
  });

  it("floors structure at 0 rather than going negative", () => {
    expect(blockAxes(dec({ line: 1, end_line: 5000, complexity: 200 }), undefined).structure).toBe(0);
  });

  it("caps structure at 100", () => {
    expect(blockAxes(dec({ line: 1, end_line: 2, complexity: 0 }), undefined).structure).toBeLessThanOrEqual(100);
  });

  it("reports structure null when neither complexity nor length is known", () => {
    const a = blockAxes(dec({ complexity: null, end_line: null }), undefined);
    expect(a.structure).toBeNull();
    expect(a.cx).toBeNull();
  });

  it("falls back to compliance alone for health when structure is unknown", () => {
    expect(blockAxes(dec({ complexity: null, end_line: null }), { score: 42 } as any).health).toBe(42);
  });

  it("blends compliance and structure when both are known", () => {
    // A perfect-structure block that breaks laws must not read as healthy.
    const h = blockAxes(dec({ line: 1, end_line: 10, complexity: 1 }), { score: 0 } as any).health;
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(100);
  });

  it("is 100 only when both axes are clean", () => {
    expect(blockAxes(dec({ line: 1, end_line: 10, complexity: 1 }), undefined).health).toBe(100);
  });

  it("never returns a health outside 0–100", () => {
    for (const d of [dec(), dec({ complexity: 99, end_line: 900 }), dec({ complexity: null, end_line: null })]) {
      for (const con of [undefined, { score: 0 } as any, { score: 100 } as any]) {
        const h = blockAxes(d, con).health;
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("harvestArms — finding a block's top-level branches", () => {
  it("a function that is one switch exhibits its cases, not the lone switch head (HIR/visitors.ts)", () => {
    const src = [
      "export function mapInstructionValueOperands(v) {",
      "  switch (v.kind) {",
      "    case 'BinaryExpression': {",
      "      v.left = fn(v.left);",
      "      break;",
      "    }",
      "    case 'PropertyLoad': {",
      "      v.object = fn(v.object);",
      "      break;",
      "    }",
      "    default: {",
      "      break;",
      "    }",
      "  }",
      "}",
    ];
    const arms = harvestArms(src, 1, 15)!;
    expect(arms.map((a) => a.text)).toEqual(["case 'BinaryExpression':", "case 'PropertyLoad':", "default:"]);
    expect(arms[0].to).toBe(6);
  });
  const src = (s: string) => s.split("\n");

  it("returns null without source or a start line", () => {
    expect(harvestArms(null, 1, 10)).toBeNull();
    expect(harvestArms(src("a"), null, 10)).toBeNull();
    expect(harvestArms(src("a"), undefined, 10)).toBeNull();
  });

  it("finds if / else-if arms at the same indentation", () => {
    const lines = src([
      "function f() {",
      "  if (a) {",
      "  } else if (b) {",
      "  } else if (c) {",
      "  }",
      "}",
    ].join("\n"));
    const arms = harvestArms(lines, 1, 6)!;
    expect(arms).toHaveLength(3);
    expect(arms[0].ln).toBe(2);
    expect(arms[0].text).toBe("if (a)");     // the trailing brace is trimmed
  });

  it("finds switch cases", () => {
    const lines = src(["switch (x) {", "  case 1:", "  case 2:", "  default:", "}"].join("\n"));
    const arms = harvestArms(lines, 1, 5)!;
    expect(arms.map((a) => a.text)).toEqual(["case 1:", "case 2:", "default:"]);
  });

  it("returns null for fewer than two arms — one branch is not a shape worth drawing", () => {
    expect(harvestArms(src(["function f() {", "  if (a) {", "  }", "}"].join("\n")), 1, 4)).toBeNull();
    expect(harvestArms(src(["function f() {", "  return 1;", "}"].join("\n")), 1, 3)).toBeNull();
  });

  it("keeps only the SHALLOWEST indentation — nested branches are not top-level arms", () => {
    const lines = src([
      "function f() {",
      "  if (a) {",
      "      if (deep1) {}",
      "      if (deep2) {}",
      "  } else if (b) {",
      "  }",
      "}",
    ].join("\n"));
    const arms = harvestArms(lines, 1, 7)!;
    expect(arms).toHaveLength(2);
    expect(arms.map((a) => a.ln)).toEqual([2, 5]);
  });

  it("gives each arm a range ending just before the next one", () => {
    const lines = src(["f() {", "  if (a) {", "    x();", "  } else if (b) {", "    y();", "  }", "}"].join("\n"));
    const arms = harvestArms(lines, 1, 7)!;
    expect(arms[0].to).toBe(3);       // up to the line before the next arm
    expect(arms[1].to).toBe(6);       // the last arm runs to the block end
  });

  it("caps at 6 arms", () => {
    const body = Array.from({ length: 12 }, (_, i) => `  case ${i}:`).join("\n");
    const arms = harvestArms(src(`switch (x) {\n${body}\n}`), 1, 14)!;
    expect(arms).toHaveLength(6);
  });

  it("truncates a long arm header to 72 chars", () => {
    const lines = src(["f() {", `  if (${"a".repeat(200)}) {`, "  } else if (b) {", "  }"].join("\n"));
    expect(harvestArms(lines, 1, 4)![0].text.length).toBe(72);
  });

  it("never reads past the end of the source", () => {
    expect(() => harvestArms(src("f() {\n  if (a) {"), 1, 9999)).not.toThrow();
  });

  it("does not treat the START line itself as an arm", () => {
    // The scan begins at start + 1 — the signature line is the block, not a branch of it.
    const lines = src(["if (outer) {", "  if (a) {", "  } else if (b) {", "  }"].join("\n"));
    expect(harvestArms(lines, 1, 4)!.map((a) => a.ln)).toEqual([2, 3]);
  });
});

// THE FILE DOSSIER (2026-09-19): the review as a deterministic page for the chat — every axis with the
// points it costs, the signals, the violations with their fix, the ratchet, a folder's roster.
import { fileDossier, AXIS_HINT } from "./atlas-decorators";
describe("fileDossier — what the chat reads about the open file", () => {
  const con: any = {
    found: true, path: "src/a.ts", health: 81, score: 3, archetype: "logic", engineering_version: "e7",
    axes: { compliance: { score: 100 }, tests: { score: 27 }, coupling: { score: 57 }, structure: { score: 93 }, cohesion: null },
    signals: { loc: 82, complexity: 5, fan_in: 1, fan_out: 1, transitive: 4, covered: false, churn: 0, authors: 0 },
    neighborhood: { pct_repo: 0.71, pct_folder: 0.67 },
    anchors: { importers: ["src/b.ts"], imports: ["react"], findings: [] },
    violations: [{ law_key: "no-var", severity: "warn", line: 12, title: "No `var`", fix: "use const" }, { law_key: "no-console", severity: "info", line: null }],
    categories: [{ category: "style", violations: 2, score: 88 }],
    regression: { prev_snapshot_id: 5, new: [{ law_key: "no-var", count: 1 }], fixed: [], health_delta: -19, score_delta: 0, regressed: true },
    history: [{ snapshot_id: 5, health: 100 }, { snapshot_id: 6, health: 81 }],
  };
  it("names the file, then the axes worst-first with the points each costs and what it measures", () => {
    const md = fileDossier(con);
    expect(md.split("\n")[0]).toBe("file src/a.ts — health 81 · score 3 · archetype logic · judged by e7");
    expect(md).toContain(`axes: tests 27 (−73: ${AXIS_HINT.tests}); coupling 57 (−43: ${AXIS_HINT.coupling}); structure 93 (−7: ${AXIS_HINT.structure}); compliance 100`);
  });
  it("carries the signals, the neighborhood, the wiring, every violation with its fix, the categories, the ratchet and the history", () => {
    const md = fileDossier(con);
    expect(md).toContain("signals: loc 82 · complexity 5 · fan-in 1 · fan-out 1 · transitive 4 · covered no · churn 0 · authors 0");
    expect(md).toContain("neighborhood: 71th pct of the repo · 67th pct of its folder");
    expect(md).toContain("imported by 1 (src/b.ts) · imports 1 (react)");
    expect(md).toContain("violations (2):\n- no-var [warn] line 12 — No `var` · fix: use const\n- no-console [info]");
    expect(md).toContain("by category: style 2× (score 88)");
    expect(md).toContain("vs the previous snapshot #5: health -19 · REGRESSED · new: no-var ×1");
    expect(md).toContain("history: #5 100 → #6 81");
  });
  it("a clean file says so; a folder adds its roster and worst members", () => {
    expect(fileDossier({ found: true, path: "src/clean.ts", health: 100, violations: [] })).toContain("violations: none — the code obeys the constitution");
    const md = fileDossier({ found: true, path: "src", is_folder: true, files: 40, health: 94, roster: { total: 40, logic: 30, glue: 8, test: 2, unknown: 0, carried: 0 }, health_logic: 72, members: [{ path: "src/x.ts", health: 42, score: 1 }, { path: "src/y.ts", health: 55, score: 1 }], members_truncated: true } as any);
    expect(md.split("\n")[0]).toBe("folder src — health 94 · 40 files");
    expect(md).toContain("roster: 40 files — 30 logic · 8 glue · 2 test · logic-only health 72");
    expect(md).toContain("worst members: x.ts 42, y.ts 55, …");
  });
});
