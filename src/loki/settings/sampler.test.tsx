// @vitest-environment jsdom
// The sampler panel's job is to make a spending decision legible. These tests guard the two ways it could lie: turning
// a probability into a promise, and bragging about the queue while hiding what the budget refused.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const arm = (label: string, o: Partial<any> = {}) => ({ planner: "claude-code:sonnet", worker: "opencode:opencode/qwen3.6-plus", qa: "", n: 4, q: 0.8, usd: 0.09, s: 120, controlled: true, label, ...o });
const step = (o: Partial<any> = {}) => ({ job: "editor-l", size: "l", domain: "backend", traffic: 19, need: "separate", p_flip: 0.42, runs: 8, usd: 0.8, priced: true, value: 10.02, why: "42% chance X beats Y — 8 run(s) would settle it", leader: arm("Sonnet × Qwen"), challenger: arm("Opus × Flash"), ...o });

const SETTLED = step({ job: "editor-s", size: "s", domain: "backend", need: "decided", runs: 0, usd: 0,
  why: "a × 1 and b × 1 are indistinguishable after 20 and 20 runs — the record cannot separate them, so b × 1 takes it on price and this cell stops costing money" });

const PLAN = {
  settled: [SETTLED],
  steps: [step(), step({ job: "planner", size: "s", domain: "any", need: "confirm", traffic: 11, runs: 8, usd: 0.024, p_flip: 0.5, why: "the leader here is real-use evidence only" }),
          step({ job: "planner", size: "l", domain: "mixed", need: "challenger", traffic: 1, runs: 1, usd: 0.008, p_flip: 0.5, challenger: null, why: "only Codex × Qwen is measured here" })],
  summary: { cells: 13, queued: 3, projected_usd: 0.83, budget: null, decided: 2, untrafficked: 5, needs_challenger: 1, needs_confirming: 1, skipped_usd: 1.4 },
};
const apiGet = vi.fn(async () => PLAN);
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...(a as [])) }));
import { Sampler, headline, costWord, closeness, cellName, NEED, type Summary } from "./sampler";

const sum = (o: Partial<Summary> = {}): Summary => ({ cells: 13, queued: 3, projected_usd: 0.83, budget: null, decided: 2, untrafficked: 5, needs_challenger: 1, needs_confirming: 1, skipped_usd: 0, ...o });

describe("headline", () => {
  it("names the refusals, not only the queue — that is what a sampler is for", () => {
    const h = headline(sum());
    expect(h).toContain("3 of 13 cells would change a decision");
    expect(h).toContain("$0.83 to settle them");
    expect(h).toContain("5 nobody routes to — never measured");
    expect(h).toContain("2 already decided");
  });
  it("hedges a projection the serve had to guess, and refuses to print $0.00 as a price", () => {
    expect(headline(sum({ projected_priced: false }))).toContain("about $0.83 to settle them");
    expect(headline(sum({ projected_usd: 0 }))).toContain("nothing priced yet to settle them");
    expect(headline(sum())).toContain("$0.83 to settle them");
    expect(headline(sum())).not.toContain("about");
  });
  // "NOBODY ROUTES HERE" IS NOT "NOTHING WAS MEASURED HERE" — 12 of 17 such cells held 5-6 benched arms apiece.
  it("does not write off a measured cell as unmeasured just because nothing routes to it", () => {
    expect(headline(sum({ untrafficked: 17, untrafficked_benched: 12 }))).toContain("17 nobody routes to (12 measured anyway)");
    expect(headline(sum({ untrafficked: 17, untrafficked_benched: 0 }))).toContain("17 nobody routes to — never measured");
  });
  it("counts the cells the router never reads among the refusals, not among the queue", () => {
    expect(headline(sum({ pooled: 4 }))).toContain("4 the pool already answers");
    expect(headline(sum())).not.toContain("the pool already answers");
  });
  it("omits a refusal it does not have, and says nothing about an empty record", () => {
    expect(headline(sum({ untrafficked: 0, decided: 0 }))).toBe("3 of 13 cells would change a decision · $0.83 to settle them");
    expect(headline(sum({ cells: 0 }))).toBe("");
    expect(headline(null)).toBe("");
  });
});

describe("costWord", () => {
  it("prices a step in runs and dollars, with three decimals where cents are not enough", () => {
    expect(costWord(step({ runs: 8, usd: 0.744 }))).toBe("8 runs · $0.744");
    expect(costWord(step({ runs: 1, usd: 2.5 }))).toBe("1 run · $2.50");
  });
  it("says PRICE UNKNOWN rather than $0.00, which would read as free", () => {
    expect(costWord(step({ runs: 1, usd: 0 }))).toBe("1 run · price unknown");
  });
  // A BORROWED PRICE IS NOT A MEASURED ONE (2026-09-28). The flat seats print no price, so cells made only of their
  // rows used to project $0.00. The serve stands the record's typical run in; the word "about" is how the screen
  // refuses to quote a stand-in as a figure.
  it("says ABOUT when the serve had to stand a typical run in for a cell it could not price", () => {
    expect(costWord(step({ runs: 4, usd: 1.0, priced: false }))).toBe("4 runs · about $1.00");
    expect(costWord(step({ runs: 4, usd: 1.0, priced: true }))).toBe("4 runs · $1.00");
  });
});

describe("the settled list", () => {
  // A DECISION THE OPERATOR CANNOT SEE IS NOT A DECISION. A settled cell reached this screen as a number in the
  // headline and nothing else — and a cell settled by a TIE carries the one sentence that explains the choice.
  it("names the cell and says why it stopped costing money", async () => {
    render(<Sampler />);
    const row = await screen.findByTestId("sampler-settled-0");
    expect(row.textContent).toContain("indistinguishable");
    expect(row.textContent).toContain("takes it on price");
  });
});

describe("closeness", () => {
  it("calls a coin a coin and never calls anything proven", () => {
    expect(closeness(step({ p_flip: 0.5 }))).toBe("a coin — 50% chance the runner-up is better");
    expect(closeness(step({ p_flip: 0.22 }))).toBe("22% chance the runner-up is better");
    expect(closeness(step({ p_flip: 0.04 }))).toBe("4% — close to settled");
    expect(closeness(step({ p_flip: 0.001 }))).not.toContain("proven");
  });
  it("refuses to state odds where there is nothing to compare", () => {
    expect(closeness(step({ need: "challenger" }))).toBe("nothing to compare yet");
  });
});

describe("cellName", () => {
  it("names the cell the way the benchmark screen names its groups", () => {
    expect(cellName(step())).toBe("editor-l · L · backend work");
    expect(cellName(step({ domain: "any" }))).toBe("editor-l · L · pooled");
    expect(cellName(step({ domain: "" }))).toBe("editor-l · L · pooled");
  });
});

describe("the sampler panel", () => {
  it("lists the plan, prices each step, and shows what the budget left out", async () => {
    render(<Sampler />);
    await waitFor(() => expect(screen.getByTestId("sampler-step-0")).toBeTruthy());
    expect(screen.getByTestId("sampler-headline").textContent).toContain("never measured");
    expect(screen.getByTestId("sampler-step-0").textContent).toContain("editor-l · L · backend work");
    expect(screen.getByTestId("sampler-cost-0").textContent).toBe("8 runs · $0.800");
    expect(screen.getByTestId("sampler-close-0").textContent).toContain("a coin");
    // a challenger step must not print odds it cannot have
    expect(screen.getByTestId("sampler-close-2").textContent).toBe("nothing to compare yet");
    expect(screen.getByTestId("sampler-skipped").textContent).toContain("$1.40 more would be worth measuring");
  });
  it("asks the serve again with the operator's budget, and only when they give one", async () => {
    apiGet.mockClear();
    render(<Sampler />);
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/api/v1/settings/sampler"));
    fireEvent.change(screen.getByTestId("sampler-budget"), { target: { value: "1.50" } });
    fireEvent.keyDown(screen.getByTestId("sampler-budget"), { key: "Enter" });
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/api/v1/settings/sampler?budget=1.5"));
    // garbage is not a budget: the request goes back to asking for everything rather than sending NaN
    fireEvent.change(screen.getByTestId("sampler-budget"), { target: { value: "abc" } });
    fireEvent.keyDown(screen.getByTestId("sampler-budget"), { key: "Enter" });
    await waitFor(() => expect(apiGet).toHaveBeenLastCalledWith("/api/v1/settings/sampler"));
  });
  it("every need has a word and a colour, so no step renders as a raw key", () => {
    for (const k of ["separate", "challenger", "confirm", "decided", "untrafficked"]) {
      expect(NEED[k].word.length).toBeGreaterThan(0);
      expect(NEED[k].title.length).toBeGreaterThan(10);
    }
  });
});
