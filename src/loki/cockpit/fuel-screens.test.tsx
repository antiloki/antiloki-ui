// @vitest-environment jsdom
// THE FUEL SCREENS (PLAN-THE-TESTS phase 4/5, 2026-10-01): the preview a hover opens, the stats window and the overlay around it - the parts of fuel-mini.tsx that no test drew (it was at 36 %).
// They are drawn from one payload, so each assertion is a sentence the operator reads: what the router kept, where the money went, what failed, what moved against the window before.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";

const apiGet = vi.fn(); const apiPost = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...(a as [])), apiPost: (...a: any[]) => apiPost(...(a as [])) }));
vi.mock("./cockpit-panes-tools", () => ({ FuelPane: ({ sessionId }: any) => <div data-testid="fuel-pane">live panes of session {sessionId}</div> }));
import { FuelStats, FuelOverlay, FuelBrief, FuelMini, forgetFuel, type Fuel } from "./fuel-mini";

const fuel = (over: Partial<Fuel> = {}): Fuel => ({
  days: 7,
  houses: [
    { house: "claude", calls: 3, cost: 1.5, tokens_in: 1000, tokens_out: 500, tokens: 1500, failed: 1, models: 2 },
    { house: "codex", calls: 1, cost: 0.004, tokens_in: 10, tokens_out: 10, tokens: 2_400_000, failed: 0, models: 1 },
    { house: "opencode", calls: 0, cost: 0, tokens_in: 0, tokens_out: 0, tokens: 0, failed: 0, models: 0 },
  ],
  models: [
    { model: "opus", house: "claude", tier: "high", calls: 2, cost: 1.2, tokens: 1000, failed: 0, ms: 150_000 },
    { model: "haiku", house: "claude", tier: "low", calls: 1, cost: 0.3, tokens: 500, failed: 2, ms: 4000 },
    { model: "gpt-x", house: "codex", tier: "mid", calls: 1, cost: 0.004, tokens: 20, failed: 0, ms: 2000 },
  ],
  limits: [],
  saved: { runs: 2, routed: 2, actual: 1.5, baseline: 3.75, saved: 2.25, pct: 60, tokens: 1500, line: "", proof: [{ id: 7, goal: "rename the helper", actual: 1, baseline: 2.5, saved: 1.5, pct: 60, tokens: 900, against: "claude · opus", tiers: ["t1:mid"], router: true }] },
  compare: [{ house: "claude", cost: 1.5, was: 1, delta_pct: 50, trend: "up" }, { house: "codex", cost: 0.004, was: 0, delta_pct: 0, trend: "up" }, { house: "opencode", cost: 0, was: 0, delta_pct: 0, trend: "flat" }],
  analysis: "Opus took most of the money.",
  ...over,
});
beforeEach(() => { forgetFuel(); apiGet.mockReset(); apiPost.mockReset(); });

describe("FuelStats", () => {
  it("says what it is waiting for, never calls a failed read an empty workspace, and says an empty one is empty", async () => {
    apiGet.mockResolvedValueOnce(null);                                              // the read failed
    const { unmount } = render(<FuelStats />);
    expect(screen.getByText(/reading the workspace's own record/)).toBeTruthy();
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByText(/reading the workspace's own record/)).toBeTruthy();      // still waiting: "no calls" would be a claim about the record, and nothing was read
    unmount(); forgetFuel();
    apiGet.mockResolvedValue(fuel({ models: [] }));                                  // the record was read and holds nothing
    render(<FuelStats />);
    await waitFor(() => expect(screen.getByText(/has not made a call in the last 7 days/)).toBeTruthy());
  });

  it("leads with what the router kept, proves it from the runs, and ranks where the money, the time and the failures went", async () => {
    apiGet.mockResolvedValue(fuel());
    render(<FuelStats />);
    const saved = await screen.findByTestId("fuel-saved");
    expect(saved.textContent).toContain("$2.25");
    expect(saved.textContent).toContain("kept by the router — 60% of the bill");
    expect(saved.textContent).toContain("2 settled runs · 2k tokens");
    expect(saved.textContent).toContain("what antiloki actually paid$1.50");
    expect(saved.textContent).toContain("one frontier agent, same tokens$3.75");
    // the total is a claim until its runs can be opened
    expect(screen.queryByTestId("fuel-proof-7")).toBeNull();
    fireEvent.click(screen.getByTestId("fuel-proof"));
    expect(screen.getByTestId("fuel-proof-7").textContent).toContain("rename the helper");
    expect(screen.getByTestId("fuel-proof-7").textContent).toContain("−60%");
    fireEvent.click(screen.getByTestId("fuel-proof"));
    expect(screen.queryByTestId("fuel-proof-7")).toBeNull();
    expect(screen.getByTestId("stats-analysis").textContent).toBe("Opus took most of the money.");
    const text = screen.getByTestId("fuel-stats").textContent ?? "";
    // money is ranked by cost, time by milliseconds, and each cell prints its own unit
    expect(text.indexOf("opus · high")).toBeLessThan(text.indexOf("haiku · low"));
    expect(text).toContain("$1.20"); expect(text).toContain("$0.0040");          // under a cent keeps four places: not $0.00
    expect(text).toContain("opus · 2 calls3 min");                                  // 150 s
    expect(text).toContain("haiku · 1 call4 s");
    expect(text).toContain("calls that did not succeed"); expect(text).toContain("haiku2");
    expect(text).toContain("4 calls");
    // against the window before it: a rise with a base, one that is new, and nothing for a house with no money in either window
    expect(text).toContain("▲ 50% vs $1.00"); expect(text).toContain("new this window"); expect(text).not.toContain("opencode —");
    // tokens per house, short
    expect(text).toContain("claude · 2 models2k"); expect(text).toContain("codex · 1 model2.4M");
  });

  it("hides the sections that have nothing to say instead of drawing empty ones", async () => {
    apiGet.mockResolvedValue(fuel({ saved: { runs: 0, routed: 0, actual: 0, baseline: 0, saved: 0, pct: 0, tokens: 0, line: "", proof: [] }, models: [{ model: "opus", house: "claude", tier: "high", calls: 1, cost: 0.5, tokens: 10, failed: 0, ms: 1000 }], compare: [] }));
    render(<FuelStats />);
    await screen.findByTestId("fuel-stats");
    expect(screen.queryByTestId("fuel-saved")).toBeNull();
    expect(screen.queryByText("calls that did not succeed")).toBeNull();
  });

  it("asks again for another window, and draws a window it has read before at once", async () => {
    apiGet.mockImplementation(async (url: string) => fuel({ days: Number(/days=(\d+)/.exec(url)![1]) }));
    render(<FuelStats />);
    await screen.findByTestId("fuel-stats");
    fireEvent.click(screen.getByTestId("stats-days-30"));
    await waitFor(() => expect(apiGet.mock.calls.some(([u]) => String(u).includes("days=30"))).toBe(true));
    fireEvent.click(screen.getByTestId("stats-days-0"));
    await waitFor(() => expect(apiGet.mock.calls.some(([u]) => String(u).includes("days=0"))).toBe(true));
    expect(screen.getByTestId("stats-days-0").textContent).toBe("all time");
    expect(screen.getByTestId("stats-days-1").textContent).toBe("24h");
    // back to a window it has already read: no placeholder frame in between
    fireEvent.click(screen.getByTestId("stats-days-7"));
    expect(screen.queryByText(/reading the workspace's own record/)).toBeNull();
  });

  // operator 2026-09-30: "the preview of money saved is holding another workspace's" - the window drops the other project's reading and reads again
  it("drops the reading the moment the workspace changes and shows the new one's", async () => {
    apiGet.mockResolvedValueOnce(fuel());
    render(<FuelStats />);
    await screen.findByTestId("fuel-saved");
    let release: (v: any) => void = () => {};
    apiGet.mockReturnValueOnce(new Promise((r) => { release = r; }));
    act(() => { window.dispatchEvent(new CustomEvent("antiloki:workspace-changed")); });
    expect(screen.queryByTestId("fuel-saved")).toBeNull();
    expect(screen.getByText(/reading the workspace's own record/)).toBeTruthy();
    await act(async () => { release(fuel({ saved: { runs: 1, routed: 1, actual: 1, baseline: 8, saved: 7, pct: 88, tokens: 10, line: "", proof: [] } })); });
    await waitFor(() => expect(screen.getByTestId("fuel-saved").textContent).toContain("$7.00"));
  });
});

describe("FuelBrief", () => {
  it("says what was kept and what moved, and nothing when there is no reading", () => {
    const { container, rerender } = render(<FuelBrief f={null} />);
    expect(container.textContent).toBe("");
    rerender(<FuelBrief f={fuel()} />);
    const b = screen.getByTestId("fuel-brief");
    expect(b.textContent).toContain("⑂ $2.25 kept");
    expect(b.textContent).toContain("60% · 2 runs · $1.50 of $3.75");
    expect(b.textContent).toContain("Opus took most of the money.");
    expect(screen.getByTestId("fuel-trend-claude").textContent).toContain("▲ claude $1.50 was $1.00");
    expect(screen.queryByTestId("fuel-trend-opencode")).toBeNull();                // flat and free: not worth a line
    expect(b.textContent).toContain("a subscription pays $0 metered");
  });
  it("prints no 'kept' line when nothing was saved", () => {
    render(<FuelBrief f={fuel({ saved: { runs: 0, routed: 0, actual: 0, baseline: 0, saved: 0, pct: 0, tokens: 0, line: "", proof: [] } })} />);
    expect(screen.getByTestId("fuel-brief").textContent).not.toContain("kept");
  });
});

describe("FuelMini", () => {
  it("shows the donut at rest and the engine lines with the brief on hover - in each of its three shapes", async () => {
    apiGet.mockResolvedValue(fuel({ limits: [{ house: "claude", label: "5h", used_pct: 82 }, { house: "claude", label: "week", used_pct: 40 }] }));
    for (const variant of ["ghost", "icon", "money"] as const) {
      forgetFuel();
      const open = vi.fn();
      const { unmount } = render(<FuelMini variant={variant} label="$2.25" onOpenFull={open} />);
      const root = await screen.findByTestId("fuel-mini");
      await waitFor(() => expect(apiGet).toHaveBeenCalled());
      if (variant !== "money") expect(screen.getByTestId("fuel-donut")).toBeTruthy(); else expect(root.textContent).toContain("$2.25");
      fireEvent.mouseEnter(root);
      await waitFor(() => expect(screen.getByTestId("fuel-mini-claude").textContent).toContain("5h 82%"));
      expect(screen.getByTestId("fuel-mini-opencode").textContent).toContain("not running");
      expect(within(root).getByTestId("fuel-brief").textContent).toContain("$2.25 kept");
      fireEvent.click(root); expect(open).toHaveBeenCalledTimes(1);
      fireEvent.mouseLeave(root);
      expect(screen.queryByTestId("fuel-brief")).toBeNull();
      unmount();
    }
  });
});

describe("FuelOverlay", () => {
  it("opens on the record, switches to the live panes of the chat's cockpit session, and closes on Escape", async () => {
    apiGet.mockResolvedValue(fuel());
    apiPost.mockImplementation(async (_u: string, b: any) => b?.id ? { result: { panes: [{ id: 1 }] } } : { result: { sessions: [{ id: 3, name: "antichat#9", status: "open" }, { id: 4, name: "other", status: "closed" }] } });
    const onClose = vi.fn();
    render(<FuelOverlay chatSessionId={9} onClose={onClose} />);
    await screen.findByTestId("fuel-stats");
    await waitFor(() => expect(screen.getByTestId("fuel-overlay").textContent).toContain("antichat#9 · session #3"));
    fireEvent.click(screen.getByTestId("fuel-tab-panes"));
    expect((await screen.findByTestId("fuel-pane")).textContent).toContain("session 3");
    fireEvent.click(screen.getByTestId("fuel-tab-record"));
    expect(screen.getByTestId("fuel-stats")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("says to start an agent first when the chat has no cockpit session", async () => {
    apiGet.mockResolvedValue(fuel());
    apiPost.mockResolvedValue({ result: { sessions: [] } });
    render(<FuelOverlay chatSessionId={null} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("fuel-overlay").textContent).toContain("no cockpit session yet"));
    fireEvent.click(screen.getByTestId("fuel-tab-panes"));
    expect(screen.getByText(/start an agent first/)).toBeTruthy();
  });
  it("clicking the backdrop closes it and clicking the window does not", async () => {
    apiGet.mockResolvedValue(fuel()); apiPost.mockResolvedValue({ result: { sessions: [] } });
    const onClose = vi.fn();
    render(<FuelOverlay chatSessionId={1} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("fuel-overlay")); expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("fuel-overlay").parentElement!); expect(onClose).toHaveBeenCalledTimes(1);
  });
});
