// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { boxesShown, EvolveBoxes } from "./EvolveBoxes";
const trial = (n: number, o: any = {}) => ({ n, kind: "x", hypothesis: `idea ${n}`, request: n, outcome: "not_admitted", gain_pct: 12, sure_pct: 8, spent_usd: 0.2, why: "w", ...o });
const st = (o: any = {}, s: any = {}) => ({ ok: true, config: {}, running: false, tune: 2, heldout: 3, session: { status: "goal_met", goal: "cost", min_gain_pct: 20, max_trials: 5, budget_usd: 2, spent_usd: 0.6, started_ms: 77, ended_ms: 99, trials: [trial(1, { outcome: "admitted", gain_pct: 31, sure_pct: 25 }), trial(2)], report: "", note: "", ...s }, ...o }) as any;
beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } }); afterEach(cleanup);
describe("the evolution results on the graph", () => {
  it("shown only after a session has ended with at least one idea, and only until it is closed", () => {
    expect(boxesShown(null, 0, false)).toBe(false); expect(boxesShown(st({ running: true }), 0, false)).toBe(false); expect(boxesShown(st({}, { status: "running" }), 0, false)).toBe(false); expect(boxesShown(st({}, { trials: [] }), 0, true)).toBe(false);
    expect(boxesShown(st(), 0, false)).toBe(true); expect(boxesShown(st(), 77, false)).toBe(false); expect(boxesShown(st(), 77, true)).toBe(true); expect(boxesShown(st(), 55, false)).toBe(true);
  });
  it("two glass boxes: the gain meters and the trials table; closing remembers the session and a new session brings them back", () => {
    const { rerender } = render(<EvolveBoxes team="t" st={st()} />); expect(screen.getByTestId("evolve-box-grid")).toBeTruthy(); expect(screen.getByTestId("evolve-box-table").textContent).toContain("idea 2"); expect(screen.getByTestId("evolve-trial-1").textContent).toContain("applied"); expect(screen.getByTestId("evolve-trial-1").textContent).toContain("+31%");
    fireEvent.click(screen.getByTestId("evolve-boxes-close")); expect(screen.queryByTestId("evolve-boxes")).toBeNull(); expect(localStorage.getItem("antiloki.evolve.boxes.t")).toBe("77");
    rerender(<EvolveBoxes team="t" st={st({}, { started_ms: 120 })} />); expect(screen.getByTestId("evolve-boxes")).toBeTruthy();
  });
  it("can be asked for again by the person after closing", () => { localStorage.setItem("antiloki.evolve.boxes.t", "77"); const { rerender } = render(<EvolveBoxes team="t" st={st()} />); expect(screen.queryByTestId("evolve-boxes")).toBeNull(); rerender(<EvolveBoxes team="t" st={st()} forced />); expect(screen.getByTestId("evolve-boxes")).toBeTruthy(); });
});
