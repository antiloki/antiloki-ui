// Architecture over time, built from digest snapshots — no runtime telemetry, no vendor. The
// time-travel cursor is the mechanism everything else hangs off: the headline, the metric tiles and
// the causal chain must all morph to the SELECTED rebuild, and the "incident" is only meaningful at
// now. A readout that keeps showing today's numbers while the slider is in the past is the failure
// this panel exists to avoid.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const historyGet = vi.fn();
vi.mock("@/loki/api/codebase", () => ({ historyGet: (...a: any[]) => historyGet(...a) }));
vi.mock("./substrate-panel", () => ({ SubstratePanel: () => <div data-testid="substrate" /> }));

import { HistoryPanel, HistoryTabs } from "./history-panel";

const point = (over: any = {}) => ({
  id: 1, at: "2026-05-01", files: 100, health: 60, risk: 3, cycles: 0,
  coverage: 80, smells: 0, fan_in: 1, d_health: null, d_cycles: null, d_coverage: null, ...over,
});
const hist = (over: any = {}) => ({
  origin: "atlas", count: 3,
  points: [
    point({ id: 1, at: "2026-05-01", health: 60 }),
    point({ id: 2, at: "2026-05-10", health: 65, d_health: 5 }),
    point({ id: 3, at: "2026-05-20", health: 72, d_health: 7 }),
  ],
  trend: { now: 72, month: { health: 72, at: "2026-05-20", delta: 12 }, quarter: null },
  incident: null,
  ...over,
});

const onOpen = vi.fn();
const mount = async (data: any) => {
  historyGet.mockResolvedValue(data);
  const r = render(<HistoryPanel onOpen={onOpen} />);
  await waitFor(() => expect(screen.queryByText(/reading the architecture timeline/)).toBeNull());
  return r;
};

beforeEach(() => { historyGet.mockReset(); onOpen.mockReset(); });
afterEach(() => vi.useRealTimers());

describe("the rail's two tabs", () => {
  it("opens on architecture and reaches the substrate panel", async () => {
    historyGet.mockResolvedValue(hist());
    render(<HistoryTabs />);
    await waitFor(() => expect(screen.getByText(/architecture over time/)).toBeTruthy());
    fireEvent.click(screen.getByText(/◉ substrate/));
    expect(screen.getByTestId("substrate")).toBeTruthy();
  });
});

describe("the empty states", () => {
  it("says it is reading the timeline", () => {
    historyGet.mockReturnValue(new Promise(() => {}));
    render(<HistoryPanel />);
    expect(screen.getByText(/reading the architecture timeline/)).toBeTruthy();
  });

  it("explains that snapshots come from rebuilds, and that none of this is telemetry", async () => {
    await mount({ origin: "a", count: 0, points: [], trend: { now: null, month: null, quarter: null }, incident: null });
    expect(screen.getByText(/no history yet — the timeline is built from the digest snapshot/)).toBeTruthy();
    expect(screen.getByText(/local, deterministic, no telemetry/)).toBeTruthy();
  });

  it("treats a failed read as no history", async () => {
    await mount(null);
    expect(screen.getByText(/no history yet/)).toBeTruthy();
  });
});

describe("the headline", () => {
  it("opens at the latest rebuild and labels it 'now'", async () => {
    await mount(hist());
    expect(screen.getByText("health now").parentElement!.textContent).toBe("72health now");
  });

  it("shows the month and quarter trend at 'now'", async () => {
    await mount(hist({ trend: { now: 72, month: { health: 72, at: "x", delta: 12 }, quarter: { health: 72, at: "y", delta: -3 } } }));
    expect(screen.getByText("this month")).toBeTruthy();
    expect(screen.getByText("this quarter")).toBeTruthy();
    expect(screen.getByText(/▲ \+12/)).toBeTruthy();
    expect(screen.getByText(/▼ -3/)).toBeTruthy();
  });

  it("counts the rebuilds when there is no trend yet", async () => {
    await mount(hist({ count: 2, trend: { now: 72, month: null, quarter: null } }));
    expect(screen.getByText("2 rebuilds recorded")).toBeTruthy();
  });
});

describe("time travel", () => {
  const slider = () => document.querySelector('input[type=range]') as HTMLInputElement;

  it("morphs the headline, the date and the distance-from-now when the slider moves", async () => {
    await mount(hist());
    fireEvent.change(slider(), { target: { value: "0" } });
    expect(screen.getByText(/health · 2026-05-01/).parentElement!.textContent).toBe("60health · 2026-05-01");
    expect(screen.getByText(/2 back from now/)).toBeTruthy();
    expect(screen.queryByText("health now")).toBeNull();
  });

  it("morphs the metric tiles too", async () => {
    await mount(hist({ points: [
      point({ id: 1, at: "a", health: 60, cycles: 4, coverage: 30.4, smells: 9, files: 50 }),
      point({ id: 2, at: "b", health: 72, cycles: 0, coverage: 81.2, smells: 1, files: 120 }),
    ] }));
    expect(screen.getByText(/^120/)).toBeTruthy();
    fireEvent.change(slider(), { target: { value: "0" } });
    expect(screen.getByText(/^50/)).toBeTruthy();
    expect(screen.getByText(/^30%/)).toBeTruthy();   // rounded, not 30.4
  });

  it("travels by clicking a row in the timeline", async () => {
    await mount(hist());
    fireEvent.click(screen.getByText("2026-05-01"));
    expect(screen.getByText(/health · 2026-05-01/)).toBeTruthy();
  });

  it("replays the timeline forward and can be stopped", async () => {
    vi.useFakeTimers();
    historyGet.mockResolvedValue(hist());
    render(<HistoryPanel />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    fireEvent.click(screen.getByText("▶ replay"));
    expect(slider().value).toBe("0");
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(slider().value).toBe("1");

    fireEvent.click(screen.getByText("◼ stop"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(slider().value).toBe("1");                 // stopped where it was
  });

  it("cannot replay a single snapshot", async () => {
    await mount(hist({ points: [point()], count: 1, trend: { now: 60, month: null, quarter: null } }));
    expect((screen.getByText("▶ replay") as HTMLButtonElement).disabled).toBe(true);
  });

  it("moving the slider stops a running replay", async () => {
    vi.useFakeTimers();
    historyGet.mockResolvedValue(hist());
    render(<HistoryPanel />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByText("▶ replay"));
    fireEvent.change(slider(), { target: { value: "2" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(slider().value).toBe("2");
  });
});

describe("the causal chain", () => {
  it("names the structural drivers behind the selected health", async () => {
    await mount(hist({ points: [point({ health: 40, cycles: 2, coverage: 40, smells: 3, fan_in: 5 })], trend: { now: 40, month: null, quarter: null } }));
    expect(screen.getByText(/why health is 40 — the structural drivers/)).toBeTruthy();
    expect(screen.getByText(/2 import cycles — no clean build order/)).toBeTruthy();
    expect(screen.getByText(/coverage 40% — untested paths carry risk/)).toBeTruthy();
    expect(screen.getByText(/3 structural smells/)).toBeTruthy();
    expect(screen.getByText(/avg fan-in 5/)).toBeTruthy();
  });

  it("says nothing at all when the rebuild is structurally clean", async () => {
    await mount(hist({ points: [point({ health: 95, cycles: 0, coverage: 90, smells: 0, fan_in: 1 })], trend: { now: 95, month: null, quarter: null } }));
    expect(screen.queryByText(/the structural drivers/)).toBeNull();
  });

  it("pluralises a single cycle and a single smell", async () => {
    await mount(hist({ points: [point({ cycles: 1, smells: 1, coverage: 90 })], trend: { now: 60, month: null, quarter: null } }));
    expect(screen.getByText(/1 import cycle —/)).toBeTruthy();
    expect(screen.getByText(/1 structural smell /)).toBeTruthy();
  });
});

describe("the structural incident", () => {
  const incident = (over: any = {}) => ({
    severity: "high", at: "2026-05-20", from_at: "2026-05-10",
    summary: "since the last rebuild: health fell 12", d_health: -12, d_cycles: 2,
    d_coverage: null, d_files: 4, d_smells: 1, new_risky: ["src/god.ts"], entry_points: null, ...over,
  });

  it("reports it with its severity, window and summary", async () => {
    await mount(hist({ incident: incident() }));
    expect(screen.getByText(/high — structural incident/)).toBeTruthy();
    expect(screen.getByText("2026-05-10 → 2026-05-20")).toBeTruthy();
    expect(screen.getByText(/health fell 12/)).toBeTruthy();
    expect(screen.getByText(/no runtime data, just the graph over time/)).toBeTruthy();
  });

  it("labels an improvement and a no-change differently from an incident", async () => {
    const { unmount } = await mount(hist({ incident: incident({ severity: "improved" }) }));
    expect(screen.getByText("✓ improvement")).toBeTruthy();
    unmount();
    await mount(hist({ incident: incident({ severity: "info" }) }));
    expect(screen.getByText("no change")).toBeTruthy();
  });

  it("opens a file that entered the riskiest set", async () => {
    await mount(hist({ incident: incident() }));
    fireEvent.click(screen.getByText(/src\/god.ts/));
    expect(onOpen).toHaveBeenCalledWith("src/god.ts");
  });

  it("hides the incident while the slider is in the past — it only means anything at 'now'", async () => {
    await mount(hist({ incident: incident() }));
    fireEvent.change(document.querySelector('input[type=range]')!, { target: { value: "0" } });
    expect(screen.queryByText(/structural incident/)).toBeNull();
  });
});

describe("the timeline list", () => {
  it("lists rebuilds newest first, with health and its delta", async () => {
    await mount(hist());
    const dates = screen.getAllByText(/^2026-05-\d\d$/).map((e) => e.textContent);
    expect(dates[0]).toBe("2026-05-20");
    expect(screen.getAllByText(/health/).length).toBeGreaterThan(1);
    expect(screen.getByText(/▲ \+7/)).toBeTruthy();
  });

  it("flags a rebuild that carries cycles", async () => {
    await mount(hist({ points: [point({ cycles: 3, d_cycles: 2 })], trend: { now: 60, month: null, quarter: null } }));
    expect(screen.getByText(/3 cycles/)).toBeTruthy();
    expect(screen.getByText(/\(\+2\)/)).toBeTruthy();
  });
});
