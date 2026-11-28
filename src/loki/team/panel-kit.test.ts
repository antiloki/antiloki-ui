import { describe, it, expect } from "vitest";
import { afford, bracketRow, meaning, meterGeom, meterPos, perIdeaCents, recommended, stageOf } from "./panel-kit";
const t = (o: any) => ({ n: 1, hypothesis: "h", outcome: "proposed", gain_pct: 0, spent_usd: 0, why: "", ...o });
describe("the panel helpers", () => {
  it("meaning: 20% cheaper needs 80% of today's cost; better means more passes, capped at 100", () => { expect(meaning("cost", 20)).toMatchObject({ today: 100, needed: 80, word: "−20%", label: "cost" }); expect(meaning("time", 35).needed).toBe(65); expect(meaning("quality", 20)).toMatchObject({ today: 70, needed: 84, word: "+20%" }); expect(meaning("quality", 60).needed).toBe(100); expect(meaning("cost", 500).needed).toBe(10); });
  it("perIdeaCents: the mean of what ideas cost, else a typical 35 cents", () => { expect(perIdeaCents([])).toEqual({ cents: 35, fromSession: false }); expect(perIdeaCents([t({ spent_usd: 0.2 }), t({ spent_usd: 0.4 }), t({ spent_usd: 0 })])).toEqual({ cents: 30, fromSession: true }); });
  it("afford: how many ideas a budget pays for and what all of them need", () => { expect(afford(200, 35, 5)).toEqual({ can: 5, enough: true, needCents: 175 }); expect(afford(75, 35, 5)).toEqual({ can: 2, enough: false, needCents: 175 }); expect(afford(25, 35, 5).can).toBe(0); });
  it("the meter scale: 0 at 40 %, the goal's line at 40 + gain, whiskers mirror the noise-counted gain", () => {
    expect(meterPos(0)).toBe(40); expect(meterPos(20)).toBe(60); expect(meterPos(-100)).toBe(0); expect(meterPos(500)).toBe(100);
    const g = meterGeom(24, 10, 20); expect(g.clears).toBe(false); expect(g.barL).toBe(40); expect(g.barW).toBe(24); expect(g.whL).toBe(50); expect(g.whW).toBe(28);
    expect(meterGeom(31, 25, 20).clears).toBe(true); expect(meterGeom(31, 15, 20).clears).toBe(false); expect(meterGeom(-22, undefined)).toMatchObject({ barL: 18, barW: 22, whW: 0, clears: false });
  });
  it("stageOf: propose, screen, race, verdict", () => { expect(stageOf("idle", [])).toBe(-1); expect(stageOf("running", [])).toBe(0); expect(stageOf("running", [t({ outcome: "running" })])).toBe(1); expect(stageOf("running", [t({ outcome: "running", experiment: { stage: "full" } })])).toBe(2); expect(stageOf("goal_met", [t({ outcome: "admitted" })])).toBe(3); });
  it("bracketRow: waiting is hollow, running pulses, a screened-out idea says why, the winner is marked", () => {
    expect(bracketRow(t({ outcome: "waiting" })).screen).toEqual(["wait"]); expect(bracketRow(t({ outcome: "running" })).screen).toEqual(["run"]); expect(bracketRow(t({ outcome: "screened_out", experiment: { stage: "screened_out", candidate: { n: 1, passed: 0 } } }))).toMatchObject({ screen: ["fail"], dead: "pass fell" });
    expect(bracketRow(t({ outcome: "admitted", experiment: { stage: "full", candidate: { n: 5, passed: 4 } } }))).toMatchObject({ full: ["pass", "pass", "pass", "pass", "fail"], win: true, dead: "" }); expect(bracketRow(t({ outcome: "passed_not_applied" })).dead).toBe("also passed"); expect(bracketRow(t({ outcome: "error" })).dead).toBe("error");
  });
  it("recommended: memory first, then half the cores", () => { expect(recommended(null)).toBe(3); expect(recommended({ free_gb: 9.9, total_gb: 15, cores: 8, load1: 1, pause_under_gb: 2.5, continue_over_gb: 4 })).toBe(3); expect(recommended({ free_gb: 20, total_gb: 32, cores: 16, load1: 1, pause_under_gb: 4.8, continue_over_gb: 8 })).toBe(6); expect(recommended({ free_gb: 2, total_gb: 15, cores: 8, load1: 1, pause_under_gb: 2.5, continue_over_gb: 4 })).toBe(1); });
});
