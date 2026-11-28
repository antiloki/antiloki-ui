// @vitest-environment jsdom
// THE FUEL SAYS ONLY WHAT WAS REPORTED (audit 2026-10-01): a seat that answered "limit" (out of quota) had a made-up `fiveH: 100`, so the Limits window printed "session 100%" for a CLI that reported no window;
// and a fetch that was in flight when the workspace changed wrote the OLD project's money into the cache after the switch had cleared it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiGet = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...(a as [])), apiPost: vi.fn(async () => null) }));
import { fetchFuel, forgetFuel, lastFuel, linesFromFuel, lineText, ringSectors, type Fuel } from "./fuel-mini";
import { limitBars, limitsLine, LimitsWindow, LimitsIcon } from "./limits-icon";

const resets = Math.floor(new Date(2026, 8, 30, 16, 44).getTime() / 1000);
const geminiOut = (): Fuel => ({
  days: 7, houses: [{ house: "gemini", calls: 8, cost: 0.1, tokens_in: 10, tokens_out: 5, tokens: 15, failed: 0, models: 2 }], models: [],
  limits: [{ house: "gemini", label: "limit", used_pct: 100, resets_at: resets, note: "quota exceeded" }],
  saved: { runs: 0, routed: 0, actual: 0, baseline: 0, saved: 0, pct: 0, tokens: 0, line: "", proof: [] }, compare: [], analysis: "",
});
beforeEach(() => { apiGet.mockReset(); forgetFuel(); });

describe("a seat out of quota with no window reported", () => {
  it("keeps 'out' apart from the 5h window: no invented number reaches the bars or the rings", () => {
    const g = linesFromFuel(geminiOut()).find((l) => l.key === "gemini")!;
    expect(g.out).toBe(true);
    expect(g.fiveH).toBeNull();
    expect(g.tone).toBe("bad");
    expect(lineText(g)).toMatch(/^out of quota until/);
    const bar = limitBars([g])[0];
    expect(bar.session).toBeNull(); expect(bar.out).toBe(true);
    expect(limitsLine([bar])).toBe("gemini out of quota");
    const sector = ringSectors([g], (l) => l.fiveH)[0];
    expect(sector.pct).toBeNull(); expect(sector.out).toBe(true); expect(sector.usedTo).toBe(sector.a0);
  });
  it("the Limits window says 'out of quota' and prints no percentage for it", async () => {
    apiGet.mockResolvedValue(geminiOut());
    render(<LimitsWindow onClose={() => {}} />);
    const row = await screen.findByTestId("limits-row-gemini");
    await waitFor(() => expect(row.textContent).toContain("out of quota"));
    expect(row.textContent).not.toMatch(/\d+%/);
  });
  it("the icon's popover says it too", async () => {
    apiGet.mockResolvedValue(geminiOut());
    render(<LimitsIcon />);
    await waitFor(() => expect(screen.getByTestId("limit-bar-out-gemini")).toBeTruthy());
    fireEvent.mouseEnter(screen.getByTestId("limits-icon"));
    const pop = screen.getByTestId("limits-popover");
    expect(pop.textContent).toContain("out of quota");
    expect(pop.textContent).not.toContain("session 100%");
  });
  it("a window the seat DID report is still printed as reported", () => {
    const f = geminiOut(); f.limits.push({ house: "gemini", label: "5h", used_pct: 42 });
    const g = linesFromFuel(f).find((l) => l.key === "gemini")!;
    expect(g.fiveH).toBe(42);
  });
});

describe("a fuel reply that belongs to the workspace we have left", () => {
  it("is not remembered: forgetFuel() while the fetch is in flight leaves the cache empty", async () => {
    let resolve!: (v: any) => void;
    apiGet.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const pending = fetchFuel(7);
    forgetFuel();                                                     // the operator switched workspace
    resolve({ ...geminiOut() });                                      // the old project's reply lands late
    await pending;
    expect(lastFuel(7)).toBeNull();
  });
  it("a reply from after the switch is remembered as before", async () => {
    apiGet.mockResolvedValueOnce(geminiOut());
    await fetchFuel(7);
    expect(lastFuel(7)).not.toBeNull();
  });
});
