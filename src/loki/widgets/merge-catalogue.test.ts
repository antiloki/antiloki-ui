// THE CATALOGUE IS THE EVIDENCE (operator 2026-09-25: "we were combining frontier models to chinese models …
// you should be able to merge any model to any model"). The wizard shipped six hardcoded pairs, every one of
// them a frontier model over a cheap one. The record already held Chinese×Chinese and Claude×Claude.
import { describe, it, expect } from "vitest";
import { mergeOptions, mergeNote, sideOf, EMPTY, type MeasuredMerge, type Machine } from "./engines";

const merge = (p: Partial<MeasuredMerge> = {}): MeasuredMerge => ({
  planner: "claude-code:sonnet", worker: "opencode:opencode/deepseek-v4-flash",
  label: "sonnet × deepseek-v4-flash", engines: ["claude-code", "opencode"],
  runs: 19, rows: 9, quality: 0.98, usd: 0.217, s: 281,
  jobs: ["editor-l"], domains: ["backend", "frontend"], ready: true, missing: [], ...p,
});
const machine = (merges: MeasuredMerge[]): Machine => ({ ...EMPTY, merges });

describe("the merge catalogue", () => {
  it("offers whatever the record measured, including the pairings the six hardcoded ones excluded", () => {
    const m = machine([
      merge(),
      merge({ label: "opus × sonnet", engines: ["claude-code", "claude-code"], runs: 2 }),
      merge({ label: "kimi × qwen3.6-plus", engines: ["opencode", "opencode"], runs: 2 }),
    ]);
    expect(mergeOptions(m).map((x) => x.label)).toEqual(["sonnet × deepseek-v4-flash", "opus × sonnet", "kimi × qwen3.6-plus"]);
  });

  it("keeps thinly-measured pairs visible — hiding them hides exactly what needs trying", () => {
    expect(mergeOptions(machine([merge({ runs: 1 })]))).toHaveLength(1);
    expect(mergeOptions(machine([merge({ runs: 1 })]), 5)).toHaveLength(0);  // …unless a caller asks
  });

  it("an empty or unreachable serve yields nothing rather than a broken list", () => {
    expect(mergeOptions(EMPTY)).toEqual([]);
  });

  it("the note carries the sample size, because a mean over 2 and a mean over 90 look identical without it", () => {
    expect(mergeNote(merge())).toBe("19 runs · 98% of checks · $0.22 · 5 min · measured on backend, frontend");
    expect(mergeNote(merge({ runs: 1, usd: 0.004, s: 45, domains: [] }))).toBe("1 run · 98% of checks · $0.004 · 45 s");
  });

  it("says plainly when nothing audited a pair, instead of printing a made-up score", () => {
    expect(mergeNote(merge({ quality: null }))).toContain("nothing audited it yet");
  });

  it("splits a recorded side into the shape a pane stores", () => {
    expect(sideOf("opencode:opencode/deepseek-v4-flash")).toEqual({ engine: "opencode", model: "opencode/deepseek-v4-flash" });
    expect(sideOf("claude-code:opus")).toEqual({ engine: "claude-code", model: "opus" });
    // "default" means the job's measured model, which is no model at all
    expect(sideOf("claude-code:default")).toEqual({ engine: "claude-code" });
    expect(sideOf("codex:medium")).toEqual({ engine: "codex", model: "medium" });
    // a row from an engine this build has never heard of must not take the picker down
    expect(sideOf("some-future-engine:x").engine).toBe("opencode");
  });

  it("a merge this machine cannot run names the engine to install", () => {
    const x = merge({ ready: false, missing: ["codex"], label: "sonnet × codex medium" });
    expect(mergeNote(x)).toBe("needs codex — not installed on this machine");
  });
});
