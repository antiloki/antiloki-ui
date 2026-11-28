import { describe, it, expect } from "vitest";
import { parseUsage } from "./api";

const ok = (extra: object = {}) => ({ ok: true, known: true, working: false, blocked: null, model: "Sonnet 5.5", context: { used_pct: 38 }, limits: [{ label: "5h", used_pct: 61 }], session_cost: 2.84, run: null, ...extra });
const run = (extra: object = {}) => ({ started_t: "2026-11-10T00:00:00.000Z", finished_t: "2026-11-10T00:04:54.800Z", ms: 294_800, prompt: "fix it", tokens_in: 42_100, tokens_out: 3_800, turns: 19, tools: 6, cost: 0.31, baseline: 3.1, against: "claude · opus", transcript: true, ...extra });

describe("the usage reply is read defensively", () => {
  it("reads a known pane's numbers", () => {
    const u = parseUsage(ok({ run: run() }))!;
    expect(u).toMatchObject({ known: true, working: false, model: "Sonnet 5.5", contextPct: 38, sessionCost: 2.84, limits: [{ label: "5h", used_pct: 61 }] });
    expect(u.run).toMatchObject({ tokensIn: 42_100, tokensOut: 3_800, cost: 0.31, baseline: 3.1, ms: 294_800, turns: 19, tools: 6, against: "claude · opus", finishedT: "2026-11-10T00:04:54.800Z" });
  });
  it("a Codex or OpenCode pane keeps its own engine and says where its cost came from", () => {
    const u = parseUsage(ok({ engine: "opencode", run: run({ cost_source: "engine" }) }))!;
    expect(u.engine).toBe("opencode"); expect(u.run).toMatchObject({ engine: "opencode", costSource: "engine" });
    expect(parseUsage(ok({ engine: "codex", run: run({ cost_source: "table" }) }))!.run).toMatchObject({ engine: "codex", costSource: "table" });
    expect(parseUsage(ok({ run: run() }))!.engine).toBe("claude-code");
  });
  it("a pane in the chat sandbox says so, and one in a real box does not", () => {
    expect(parseUsage(ok({ sandbox: true }))!.sandbox).toBe(true);
    expect(parseUsage(ok())!.sandbox).toBe(false);
    expect(parseUsage({ ok: true, known: false, engine: "claude-code", sandbox: true })!.sandbox).toBe(true);
  });
  it("the route label comes through for a known pane, and a non-string is absent", () => {
    expect(parseUsage(ok({ route: "a small change" }))!.route).toBe("a small change");
    expect(parseUsage(ok({ route: 5 }))!.route).toBeUndefined(); expect(parseUsage(ok())!.route).toBeUndefined();
  });
  it("an engine with no reader is known:false with its reason, and a blocked screen still comes through", () => {
    const u = parseUsage({ ok: true, known: false, engine: "codex", reason: "no local usage source for this engine yet", blocked: "Press enter to continue" })!;
    expect(u).toMatchObject({ known: false, reason: "no local usage source for this engine yet", blocked: "Press enter to continue", run: null });
  });
  it("tokens and cost are unknown, not zero, until the transcript can be read", () => {
    const u = parseUsage(ok({ working: true, run: run({ transcript: false, finished_t: null, tokens_in: 0, tokens_out: 0, cost: 0, baseline: 0 }) }))!;
    expect(u.working).toBe(true); expect(u.run).toMatchObject({ tokensIn: undefined, tokensOut: undefined, cost: undefined, baseline: undefined, finishedT: null });
  });
  it("garbage is null, and bad fields become absent rather than throwing", () => {
    for (const bad of [null, 7, "x", {}, { ok: false }]) expect(parseUsage(bad)).toBeNull();
    const u = parseUsage(ok({ context: { used_pct: "lots" }, limits: [{ label: 5 }, { label: "5h", used_pct: "x" }], session_cost: "free", run: { started_t: 3 } }))!;
    expect(u.contextPct).toBeNull(); expect(u.sessionCost).toBeNull(); expect(u.limits).toEqual([{ label: "5h", used_pct: null }]); expect(u.run).toBeNull();
  });
  it("unwraps a result envelope", () => { expect(parseUsage({ result: ok() })?.known).toBe(true); });
});
