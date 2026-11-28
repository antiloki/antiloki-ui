// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { companiesOf, fmtMeasure, barCost, valueOf } from "./usage-model";

const lines = [{ key: "claude", glyph: "c", label: "Claude", panes: 1, tokens: 1, cost: 0.4, fiveH: 30, week: 63, weekTokens: null, tone: "ok" }, { key: "cursor", glyph: "u", label: "Cursor", panes: 0, tokens: 0, cost: 0, fiveH: null, week: null, weekTokens: null, tone: "dim", out: true }];
const fuel = {
  houses: [{ house: "claude", calls: 3, cost: 0, tokens_in: 10, tokens_out: 5, tokens: 15, failed: 0, models: 2 }],
  models: [
    { model: "claude-opus-5-5", house: "claude", tier: "high", calls: 3, cost: 0, tokens: 1_500_000, tokens_in: 1_000_000, tokens_out: 500_000, failed: 0, ms: 1, or_in: 4, or_out: 20, or_cost: 14 },
    { model: "claude-haiku-5-5", house: "claude", tier: "low", calls: 9, cost: 0, tokens: 2_000_000, tokens_in: 1_800_000, tokens_out: 200_000, failed: 0, ms: 1, or_in: 0.1, or_out: 0.5, or_cost: 0.28 },
    { model: "gpt-5.5", house: "codex", tier: "high", calls: 2, cost: 0, tokens: 500_000, failed: 0, ms: 1, or_in: 5, or_out: 30, or_cost: 4 },
    { model: "mystery", house: "opencode", tier: "low", calls: 1, cost: 0, tokens: 1000, failed: 0, ms: 1, or_in: null, or_out: null, or_cost: null },
    { model: "team runs", house: "teams", tier: "", calls: 2, cost: 0.08, tokens: 0, failed: 0, ms: 0 },
  ],
  limits: [], saved: {}, compare: [], analysis: "", days: 7, or_cost: 18.36, or_prev: 12, daily: [{ day: "2026-11-19", cost: 1 }, { day: "2026-11-20", cost: 4 }, { day: "2026-11-21", cost: 13 }],
};
vi.mock("./fuel-mini", async (orig) => ({ ...(await orig<typeof import("./fuel-mini")>()), useFuelLive: () => fuel, fetchFuel: async () => null, linesFromFuel: () => lines }));
import { UsagePopover } from "./usage-popover";

describe("the usage numbers", () => {
  it("price every model at OpenRouter's list, count team runs at what they spent, and mark a model with no price", () => {
    const c = companiesOf(fuel as any, "cost"); expect(c.total).toBeCloseTo(14 + 0.28 + 4 + 0.08, 6); expect(c.unpriced).toBe(1); expect(c.companies.map((x) => x.house)).toEqual(["claude", "codex", "teams", "opencode"]);
    expect(c.companies[0].models.map((m) => m.model)).toEqual(["claude-opus-5-5", "claude-haiku-5-5"]); expect(c.companies[0].models[0].share).toBeCloseTo(14 / 18.36, 3);
    expect(companiesOf(fuel as any, "tokens").total).toBe(4_001_000); expect(companiesOf(fuel as any, "requests").total).toBe(17); expect(companiesOf(null, "cost")).toEqual({ companies: [], total: 0, unpriced: 0 });
    expect(barCost(fuel as any)).toBeCloseTo(18.36, 6); expect(barCost(null)).toBeNull(); expect(valueOf({ model: "x", house: "claude", tier: "", calls: 1, cost: 5, tokens: 1, failed: 0, ms: 0 }, "cost")).toBe(0);   // a model with no price is not billed as if it had one
    expect(fmtMeasure(0.004, "cost")).toBe("<$0.01"); expect(fmtMeasure(1_500_000, "tokens")).toBe("1.50M"); expect(fmtMeasure(12.345, "cost")).toBe("$12.3");
  });
});
describe("the usage window, one screen", () => {
  it("shows the cost at OpenRouter prices with a branch per model as wide as its share, bars per company, limits, every model's price and the day line", () => {
    render(<UsagePopover onClose={() => {}} />);
    expect(screen.getByTestId("usage-spend")).toHaveTextContent("$18.4"); expect(screen.getByTestId("usage-delta")).toHaveTextContent("+53%"); expect(screen.getByTestId("usage-unpriced")).toHaveTextContent("1 model not on OpenRouter");
    const b0 = screen.getByTestId("usage-branch-0"); expect(b0.textContent).toContain("claude-opus-5-5"); expect(b0.textContent).toContain("$4 / $20"); const w0 = Number(b0.querySelector("path")!.getAttribute("data-w")); const w3 = Number(screen.getByTestId("usage-branch-3").querySelector("path")!.getAttribute("data-w")); expect(w0).toBeGreaterThan(w3 * 5);
    expect(screen.getByTestId("usage-bar-claude")).toBeTruthy(); expect(screen.getByTestId("usage-limit-claude")).toHaveTextContent("week 63%"); expect(screen.getByTestId("usage-limit-cursor")).toHaveTextContent("out of quota"); expect(screen.getByTestId("usage-advice")).toHaveTextContent("Cursor is out of quota");
    expect(screen.getByTestId("usage-row-mystery")).toHaveTextContent("no price"); expect(screen.getByTestId("usage-row-claude-opus-5-5")).toHaveTextContent("$14.0"); expect(screen.getByTestId("usage-daily")).toBeTruthy(); expect(screen.getByTestId("usage-status")).toHaveTextContent("A seat is out");
    expect(screen.queryByText("All the numbers")).toBeNull(); expect(screen.queryByTestId("usage-full")).toBeNull();   // no second window behind it
  });
  it("switches the measure and the window like the router's switches, and shows a company's models on hover", () => {
    render(<UsagePopover onClose={() => {}} />); fireEvent.click(screen.getByTestId("usage-measure-tokens")); expect(screen.getByTestId("usage-measure-tokens").getAttribute("aria-checked")).toBe("true"); expect(screen.getByTestId("usage-spend")).toHaveTextContent("4.00M");
    fireEvent.click(screen.getByTestId("usage-measure-requests")); expect(screen.getByTestId("usage-spend")).toHaveTextContent("17"); fireEvent.click(screen.getByTestId("usage-window-0")); expect(screen.getByTestId("usage-label")).toHaveTextContent("today");
    fireEvent.click(screen.getByTestId("usage-window-7")); fireEvent.mouseEnter(screen.getByTestId("usage-bar-claude")); expect(screen.getByTestId("usage-tip")).toHaveTextContent("claude-haiku-5-5"); expect(screen.getByTestId("usage-tip")).toHaveTextContent("OpenRouter $4 in");
  });
  it("is a card in the middle of the screen, drawn in the body, and a click outside or Escape closes it", () => {
    const onClose = vi.fn(); render(<UsagePopover onClose={onClose} />); const scrim = screen.getByTestId("usage-scrim"); expect(scrim.style.placeItems).toBe("center"); expect(scrim.parentElement).toBe(document.body);
    fireEvent.mouseDown(screen.getByTestId("usage-popover")); expect(onClose).not.toHaveBeenCalled(); fireEvent.mouseDown(scrim); expect(onClose).toHaveBeenCalledTimes(1); fireEvent.keyDown(window, { key: "Escape" }); expect(onClose).toHaveBeenCalledTimes(2);
  });
});
