// TEMPORARY SUBAGENTS — the pure bits: the delivery line, the list glyphs, the shared store.
import { describe, it, expect, vi } from "vitest";
vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn(), apiGet: vi.fn() }));
import { deliveryMessage, jobGlyph, activeJobs, publishSubagents, readSubagents, subscribeSubagents, subagentKey, type SubagentJob } from "./subagents";

const job = (over: Partial<SubagentJob> = {}): SubagentJob => ({ id: 1, parent: "9-9", goal: "g", title: "find env reads", prompt: "", engine: "claude-code", cwd: "/w", write: false, status: "done", created: 0, started: 1000, ended: 9000, result: "3 places:\nsrc/a.ts\nsrc/b.ts", error: null, delivered: false, trace: { tools: [{ name: "Grep", target: "process.env" }], ms: 8000, cost: 0.02 }, ...over });

describe("deliveryMessage", () => {
  it("is one line the parent terminal accepts, with the report folded", () => {
    expect(deliveryMessage(job())).toBe('[antiloki] subagent "find env reads" finished in 8s · 1 tool. Its report: 3 places: ⏎ src/a.ts ⏎ src/b.ts');
    expect(deliveryMessage(job({ status: "failed", result: null, error: "timed out", trace: null }))).toBe('[antiloki] subagent "find env reads" failed. Its report: timed out');
  });
});
describe("jobGlyph + activeJobs", () => {
  it("maps every status to a glyph, tone and state", () => {
    expect(jobGlyph(job()).glyph).toBe("✓");
    expect(jobGlyph(job({ delivered: true })).state).toBe("delivered");
    expect(jobGlyph(job({ status: "running", started: Date.now() - 12_000 })).state).toMatch(/^running 1[12]s$/);
    expect(jobGlyph(job({ status: "queued" })).glyph).toBe("·");
    expect(jobGlyph(job({ status: "failed" })).tone).toBe("bad");
    expect(jobGlyph(job({ status: "cancelled" })).glyph).toBe("⊘");
    expect(activeJobs([job(), job({ status: "running" }), job({ status: "queued" })]).length).toBe(2);
  });
});
describe("the store the Threads list reads", () => {
  it("publishes only real changes and notifies subscribers", () => {
    const key = subagentKey(5, 7);
    expect(key).toBe("5-7");
    const seen = vi.fn();
    const off = subscribeSubagents(seen);
    publishSubagents(key, [job({ status: "running" })]);
    publishSubagents(key, [job({ status: "running" })]); // same → no notify
    expect(seen).toHaveBeenCalledTimes(1);
    publishSubagents(key, [job({ status: "done" })]);
    expect(seen).toHaveBeenCalledTimes(2);
    expect(readSubagents(key)[0].status).toBe("done");
    off();
  });
});

import { taskGlyph, runLabel, goalDelivery, isRunDelivery, publishGoalRuns, readGoalRuns, type GoalRun, type GoalTask } from "./subagents";
const task = (over: Partial<GoalTask> = {}): GoalTask => ({ id: "t1", title: "inventory", prompt: "", owns: ["src/a/**"], needs: [], acceptance: ["a table"], status: "done", wave: 0, attempts: 1, started: 1000, ended: 9000, report: "did it", verdict: { passed: true, reasons: ["met"], by: "engine" }, error: null, trace: null, changed: [], ...over });
const run = (over: Partial<GoalRun> = {}): GoalRun => ({ id: 3, parent: "1-2", goal: "audit env", engine: "claude-code", cwd: "/w", write: false, concurrency: 3, status: "done", created: 0, started: 0, ended: 0, tasks: [task(), task({ id: "t2", status: "failed" }), task({ id: "t3", status: "blocked", needs: ["t2"] })], blackboard: [], events: [], report: "# Goal run\n3 tasks\nsummary line one\nsummary line two", delivered: false, error: null, ...over });

describe("goal runs — glyphs, labels, delivery, store", () => {
  it("taskGlyph names every state", () => {
    expect(taskGlyph(task()).state).toBe("passed · 8s");
    expect(taskGlyph(task({ status: "running", ended: null, started: Date.now() - 5000, attempts: 2 })).state).toMatch(/^running [45]s · attempt 2$/);
    expect(taskGlyph(task({ status: "pending", needs: ["t1", "t2"] })).state).toBe("waits for t1, t2");
    expect(taskGlyph(task({ status: "blocked" })).tone).toBe("bad");
  });
  it("runLabel + goalDelivery summarise the run for the chip and the parent terminal", () => {
    expect(runLabel(run())).toBe("done · 1/3 passed");
    expect(runLabel(run({ status: "awaiting-approval" }))).toBe("plan ready — approve to run");
    expect(runLabel(run({ status: "inline", route: { tier: "low", delegate: false, why: "one file", bias: [], verify_tier: "mid", join_tier: "high" } }))).toBe("one job — no sub-agents (tier low)");
    expect(goalDelivery(run())).toBe("[antiloki] goal run #3 finished: 1/3 tasks passed · open: t2, t3. 3 tasks ⏎ summary line one ⏎ summary line two (full report in the pane's ⋔ subagents → goal runs) — The operator already reads this report in the chat: answer in ONE short sentence, do not restate it, and do not run any build, test or command.");
  });
  it("publishGoalRuns only notifies on a real change", () => {
    const seen = vi.fn(); const off = subscribeSubagents(seen);
    publishGoalRuns("9-9", [run({ status: "running" })]);
    publishGoalRuns("9-9", [run({ status: "running" })]);
    expect(seen).toHaveBeenCalledTimes(1);
    publishGoalRuns("9-9", [run({ status: "running", tasks: [task({ status: "running" })] })]);
    expect(seen).toHaveBeenCalledTimes(2);
    expect(readGoalRuns("9-9")[0].tasks[0].status).toBe("running");
    off();
  });
});

describe("the tier ladder the router delivers on (operator 2026-09-28)", () => {
  it("has a cheap rung, because a low route that buys nothing is not a route", async () => {
    const { claudeModelForTier } = await import("./subagents");
    // serve settled this in cli::tier_model on 2026-09-21; the front end mapped low → sonnet until 2026-09-28,
    // so every routed simple ask ran on the mid model
    expect(claudeModelForTier("low")).toBe("haiku");
    expect(claudeModelForTier("mid")).toBe("sonnet");
    expect(claudeModelForTier("high")).toBe("opus");
  });
});

describe("isRunDelivery", () => {
  it("recognises the synthetic report turn, and survives a turn with no text at all", () => {
    expect(isRunDelivery("[antiloki] goal run #250 finished: 1/1 tasks passed. Added it")).toBe(true);
    expect(isRunDelivery("add a button")).toBe(false);
    expect(isRunDelivery(undefined)).toBe(false);
    expect(isRunDelivery(null)).toBe(false);
  });
});
