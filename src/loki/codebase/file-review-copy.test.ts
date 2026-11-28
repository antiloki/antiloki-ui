import { describe, it, expect, vi, afterEach } from "vitest";
import { feedbackText, planText, copyText } from "./file-review-copy";

describe("feedbackText", () => {
  it("is empty when there is nothing to fix", () => {
    expect(feedbackText({ path: "a.ts", laws: [], axes: [] })).toBe("");
  });
  it("names file, line, code and the change for each violation", () => {
    const t = feedbackText({
      path: "src/a.ts", health: 62,
      laws: [{ title: "No nested loops", key: "nest", severity: "warn", fix: "extract the inner loop", insts: [{ line: 12, evidence: "for (x of y)" }, { line: 30 }] }],
    });
    expect(t).toContain("Fix the review findings in src/a.ts (health 62/100)");
    expect(t).toContain("1. No nested loops [warn]");
    expect(t).toContain("Change: extract the inner loop");
    expect(t).toContain("- src/a.ts:12 — `for (x of y)`");
    expect(t).toContain("- src/a.ts:30");
  });
  it("falls back to the rule text and appends weak axes numbered after the laws", () => {
    const t = feedbackText({
      path: "a.ts",
      laws: [{ key: "k", rule_md: "never   do\nthis", insts: [] }],
      axes: [{ ax: "structure", score: 41, detail: "split the god function", targets: [{ line: 5, code: "function big()", note: "extract" }] }],
    });
    expect(t).toContain("Change: never do this");
    expect(t).toContain("2. Raise structure (41/100)");
    expect(t).toContain("- a.ts:5 — `function big()` → extract");
  });
});

describe("planText", () => {
  it("is empty without steps", () => { expect(planText({ path: "a.ts", steps: [] })).toBe(""); });
  it("lists every step with gain, detail and targets, plus the projection", () => {
    const t = planText({
      path: "a.ts", health: 60,
      steps: [
        { label: "fix 2× nested loops", detail: "flatten", gain: 8, targets: [{ line: 3, code: "for" }, { file: "b.ts", line: 9 }] },
        { label: "raise tests", gain: 5 },
      ],
    });
    expect(t).toContain("## Fix plan — a.ts");
    expect(t).toContain("health 60 → ≈ 73 · 2 steps");
    expect(t).toContain("### 1. fix 2× nested loops · ≈ +8 health");
    expect(t).toContain("- a.ts:3 — `for`");
    expect(t).toContain("- b.ts:9");
    expect(t).toContain("### 2. raise tests · ≈ +5 health");
  });
  it("caps the projection at 100", () => {
    expect(planText({ path: "a", health: 95, steps: [{ label: "x", gain: 30 }] })).toContain("health 95 → ≈ 100 · 1 step");
  });
});

describe("copyText", () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it("uses navigator.clipboard when present", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await copyText("hi")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hi");
  });
  it("falls back to a textarea + execCommand when the clipboard rejects", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
    (document as any).execCommand = vi.fn().mockReturnValue(true);
    expect(await copyText("hi")).toBe(true);
    expect((document as any).execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });
});
