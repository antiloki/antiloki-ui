// THE MODEL CARD (operator 2026-09-23, after the paper: "a merged model, compiled — not trained"): a merge is a model,
// so a winner has a card — name, composition by side, the adapter, the measured row, and a version that moves with the
// benchmark.
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { cardOf, versionOf, label, sourceWord, MergeCardView, BRAIN_JOBS, HANDS_JOBS, ADAPTER_PACKS } from "./merge-card";
import { JOB_ORDER } from "./jobs";
import type { MergeRowLite } from "./agents-tab";

const row = (o: Partial<any> = {}) => ({ job: "editor-l", size: "l", planner: "opencode:opencode/kimi-k2.7-code", worker: "opencode:opencode/deepseek-v4-flash", qa: "claude-code:opus", n: 3, audit: 0.973, s: 163, usd: 0.041, weight: 0.74, source: "bench+run", ...o }) as any;

describe("the model card", () => {
  it("names the merge, splits the jobs by side, and versions it by samples", () => {
    const c = cardOf("editor-l", row());
    expect(c.name).toBe("KimiSeek Builder");
    expect(c.brain).toEqual({ engine: "opencode", model: "opencode/kimi-k2.7-code", label: "OpenCode Kimi K2.7 Code" });
    expect(c.hands?.label).toBe("OpenCode DeepSeek v4 Flash");
    expect(c.qa?.label).toBe("Claude Opus");
    expect(c.version).toBe("v3");
    expect(c.measured).toBe(true);
    // every job belongs to exactly one side — the card can't leave one out
    expect([...BRAIN_JOBS, ...HANDS_JOBS].sort()).toEqual([...JOB_ORDER].sort());
  });
  it("an unmeasured job still has a card — a draft that says so", () => {
    const c = cardOf("report", null);
    expect(c.measured).toBe(false); expect(c.version).toBe("draft"); expect(c.name).toContain("Herald");
    expect(versionOf(null)).toBe("draft"); expect(versionOf({ n: 0 })).toBe("draft"); expect(versionOf({ n: 12 })).toBe("v12");
  });
  it("labels a side the way a person reads it, and says where the numbers came from", () => {
    expect(label("claude-code:sonnet")).toBe("Claude Sonnet");
    expect(label("opencode:opencode/deepseek-v4-pro")).toBe("OpenCode DeepSeek v4 Pro");
    expect(label("opencode:opencode/qwen3.6-plus")).toBe("OpenCode Qwen 3.6 Plus");
    expect(label("raw")).toBe("raw session"); expect(label("-")).toBe("—");
    expect(sourceWord("bench")).toMatch(/shipped base/); expect(sourceWord("use")).toMatch(/audited calls/);
    expect(sourceWord("bench+run")).toMatch(/then your runs/);
  });
  it("renders the numbers, the version and the adapter", () => {
    render(<MergeCardView card={cardOf("editor-l", row())} />);
    const card = screen.getByTestId("merge-card");
    expect(card.getAttribute("data-version")).toBe("v3");
    expect(card.textContent).toContain("KimiSeek Builder");
    expect(card.textContent).toContain("97%");   // the audit
    expect(card.textContent).toContain("163 s");
    expect(card.textContent).toContain("$0.041");
    expect(card.textContent).toContain("0.74");  // the weight
    for (const p of ADAPTER_PACKS) expect(card.textContent).toContain(p.key);
    expect(card.textContent).toMatch(/Compiled, not trained/);
  });
});

// ── THE KIND OF WORK BEHIND A WINNER (plan II.7) ──────────────────────────────────────────────────────────────────
describe("cardOf · provenance", () => {
  const row = (domain: string | undefined, n: number): MergeRowLite =>
    ({ job: "planner", size: "l", domain, planner: "claude-code:opus", worker: "claude-code:sonnet", qa: "",
       n, audit: 0.9, s: 12, usd: 0.04, weight: 0.81, source: "bench+run" });

  it("carries the kind of work the numbers were measured on", () => {
    expect(cardOf("planner", row("backend", 31)).work).toBe("backend work · 31 samples");
    expect(cardOf("planner", row("backend", 31)).workWord).toBe("backend");
  });
  it("calls an unlabelled row POOLED instead of claiming a kind of work", () => {
    expect(cardOf("planner", row(undefined, 14)).work).toContain("pooled");
    expect(cardOf("planner", row("any", 14)).workWord).toBe("pooled");
  });
  it("says NOT MEASURED for a job nothing has won", () => {
    const c = cardOf("planner", null);
    expect(c.work).toBe("not measured");
    expect(c.thin).toBe(true);
    expect(c.measured).toBe(false);
  });
  it("flags a thin winner — two samples is not a ranking", () => {
    expect(cardOf("planner", row("backend", 2)).thin).toBe(true);
    expect(cardOf("planner", row("backend", 3)).thin).toBe(false);
  });
});

describe("MergeCardView · provenance", () => {
  const row: MergeRowLite = { job: "planner", size: "l", domain: "backend", planner: "claude-code:opus",
    worker: "claude-code:sonnet", qa: "", n: 2, audit: 0.9, s: 12, usd: 0.04, weight: 0.81, source: "run" };

  it("prints the thin warning, with the kind of work, when the evidence is thin", () => {
    render(<MergeCardView card={cardOf("planner", row)} />);
    expect(screen.getByTestId("merge-card-thin").textContent).toContain("backend work · 2 samples");
  });
  it("shows no warning once the evidence is there, but still names the work", () => {
    render(<MergeCardView card={cardOf("planner", { ...row, n: 31 })} />);
    expect(screen.queryByTestId("merge-card-thin")).toBeNull();
    expect(screen.getByTestId("merge-card").textContent).toContain("backend work · 31 samples");
  });
});
