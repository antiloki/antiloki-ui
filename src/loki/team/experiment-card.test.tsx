import { describe, expect, it } from "vitest";
import { cardOf } from "./ExperimentCard";
const req = (over: Record<string, unknown> = {}) => ({ n: 3, status: "open", problem: "the writer is slow", experiment: null, ...over }) as any;
describe("the experiment card", () => {
  it("shows a running test, a verdict, and nothing otherwise", () => {
    expect(cardOf(req(), { state: "running", spent_usd: 0.4 })?.state).toBe("running");
    expect(cardOf(req({ experiment: { admitted: true, why: "better by 12%", spent_usd: 1 } }), { state: "done" })).toMatchObject({ state: "admitted", why: "better by 12%" });
    expect(cardOf(req({ experiment: { admitted: false, why: "a regression", spent_usd: 1 } }), null)?.state).toBe("held back");
    expect(cardOf(req(), { state: "idle" })).toBeNull(); expect(cardOf(req({ status: "approved", experiment: { admitted: true } }), null)).toBeNull();
  });
});
