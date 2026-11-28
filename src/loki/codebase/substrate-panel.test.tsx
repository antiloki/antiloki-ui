// "Grafana for antiloki itself" — first-party telemetry the substrate already writes. Its honesty
// matters more than its prettiness: an empty AI window means the substrate ran deterministic and
// free (good news), not that telemetry broke, and the panel must say which. The phase bars are the
// other half: they exist to catch "ingest got 2× slower this month", so they must be relative to
// the slowest phase, not to an arbitrary scale.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const telemetryGet = vi.fn();
vi.mock("@/loki/api/codebase", () => ({ telemetryGet: (...a: any[]) => telemetryGet(...a) }));

import { SubstratePanel } from "./substrate-panel";

const telemetry = (over: any = {}) => ({
  window_hours: 720,
  ai: {
    calls: 12, cost_usd: 1.5, tokens_in: 8000, tokens_out: 4000, cache_hit_pct: 40, avg_ms: 1500,
    series: [{ day: "2026-05-19", calls: 5, cost: 0.5, avg_ms: 1000 }, { day: "2026-05-20", calls: 7, cost: 1.0, avg_ms: 2000 }],
    by_prompt: [{ name: "tl-draft", calls: 7, cost: 1.2, avg_ms: 2000 }],
    by_provider: [{ provider: "anthropic", calls: 12, cost: 1.5 }],
    by_tier: [{ tier: "mid", calls: 12, cost: 1.5 }],
    ...(over.ai ?? {}),
  },
  rebuild: {
    runs: 3,
    phases: [{ phase: "ingest", avg_ms: 8000, last_ms: 9000 }, { phase: "metrics", avg_ms: 2000, last_ms: 2100 }],
    series: [{ at: "a", total_ms: 20000 }, { at: "b", total_ms: 18000 }],
    ...(over.rebuild ?? {}),
  },
});

const mount = async (t: any) => {
  telemetryGet.mockResolvedValue(t);
  const r = render(<SubstratePanel />);
  await waitFor(() => expect(screen.queryByText(/reading the substrate's own telemetry/)).toBeNull());
  return r;
};

beforeEach(() => { telemetryGet.mockReset(); });

describe("loading and failure", () => {
  it("says it is reading its own telemetry", () => {
    telemetryGet.mockReturnValue(new Promise(() => {}));
    render(<SubstratePanel />);
    expect(screen.getByText(/reading the substrate's own telemetry/)).toBeTruthy();
  });

  it("blames the BE when there is no telemetry at all", async () => {
    await mount(null);
    expect(screen.getByText(/telemetry unavailable — is the BE running\?/)).toBeTruthy();
  });
});

describe("the window", () => {
  it("defaults to 30 days and re-reads on a different window", async () => {
    await mount(telemetry());
    expect(telemetryGet).toHaveBeenCalledWith({ window_hours: 720 });
    fireEvent.click(screen.getByText("7d"));
    await waitFor(() => expect(telemetryGet).toHaveBeenLastCalledWith({ window_hours: 168 }));
    fireEvent.click(screen.getByText("90d"));
    await waitFor(() => expect(telemetryGet).toHaveBeenLastCalledWith({ window_hours: 2160 }));
  });

  it("marks which window is active", async () => {
    await mount(telemetry());
    expect((screen.getByText("30d") as HTMLElement).style.color).not.toBe((screen.getByText("7d") as HTMLElement).style.color);
  });

  it("says the observability is first-party", async () => {
    await mount(telemetry());
    expect(screen.getByText(/first-party, no vendor/)).toBeTruthy();
  });
});

describe("the AI runtime section", () => {
  it("reads an empty window as good news, not as a failure", async () => {
    await mount(telemetry({ ai: { calls: 0, cost_usd: 0, tokens_in: 0, tokens_out: 0, cache_hit_pct: null, avg_ms: null, series: [], by_prompt: [], by_provider: [], by_tier: [] } }));
    expect(screen.getByText(/the substrate runs deterministic\/\$0 by default/)).toBeTruthy();
    expect(screen.queryByText("spend")).toBeNull();
  });

  it("reports spend, calls, latency, cache hits and tokens", async () => {
    await mount(telemetry());
    const stat = (label: string) => screen.getByText(label).parentElement!.textContent;
    expect(stat("spend")).toContain("$1.50");
    expect(stat("calls")).toContain("12");
    expect(stat("avg latency")).toContain("1.5s");
    expect(stat("cache hit")).toContain("40%");
    expect(stat("tokens")).toContain("12k");
  });

  it("shows sub-cent spend to four decimals rather than rounding it to zero", async () => {
    await mount(telemetry({ ai: { ...telemetry().ai, cost_usd: 0.0042 } }));
    expect(screen.getByText("$0.0042")).toBeTruthy();
  });

  it("shows a dash rather than a made-up number for unknown latency and cache rate", async () => {
    await mount(telemetry({ ai: { ...telemetry().ai, avg_ms: null, cache_hit_pct: null } }));
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("breaks the spend down by prompt, provider and tier", async () => {
    await mount(telemetry());
    expect(screen.getByText("tl-draft")).toBeTruthy();
    expect(screen.getByText("7×")).toBeTruthy();
    expect(screen.getByText(/anthropic/)).toBeTruthy();
    expect(screen.getByText(/mid/)).toBeTruthy();
  });

  it("draws the cost trend only when there is more than one point", async () => {
    const { unmount } = await mount(telemetry());
    expect(screen.getByText("cost / day")).toBeTruthy();
    unmount();

    await mount(telemetry({ ai: { ...telemetry().ai, series: [{ day: "d", calls: 1, cost: 1, avg_ms: 1 }] } }));
    expect(screen.queryByText("cost / day")).toBeNull();
  });
});

describe("the rebuild section", () => {
  it("explains the empty state instead of showing a blank waterfall", async () => {
    await mount(telemetry({ rebuild: { runs: 0, phases: [], series: [] } }));
    // Grokbot QA 2026-10-12, item 24: it used to say "no rebuilds recorded yet" beside History's "1 rebuild recorded". Timings are written from this version on; History lists every rebuild.
    expect(screen.getByText(/no rebuild timings recorded yet/)).toBeTruthy();
    expect(screen.getByText(/the phase waterfall \(scope→ingest→metrics→…\) appears after the next one/)).toBeTruthy();
    expect(screen.queryByText(/no rebuilds recorded yet/)).toBeNull();
  });

  it("counts the rebuilds, pluralising correctly", async () => {
    const { unmount } = await mount(telemetry());
    expect(screen.getByText("3 rebuilds")).toBeTruthy();
    unmount();
    await mount(telemetry({ rebuild: { ...telemetry().rebuild, runs: 1 } }));
    expect(screen.getByText("1 rebuild")).toBeTruthy();
  });

  it("scales each phase bar against the slowest phase, so a creep is visible", async () => {
    const { container } = await mount(telemetry());
    const bars = Array.from(container.querySelectorAll("div[style*='background']"))
      .map((d) => (d as HTMLElement).style.width).filter((w) => w.endsWith("%"));
    expect(bars).toContain("100%");
    expect(bars).toContain("25%");    // metrics is a quarter of ingest
  });

  it("labels each phase with its average duration in human units", async () => {
    await mount(telemetry());
    expect(screen.getByText("ingest")).toBeTruthy();
    expect(screen.getByText("8.0s")).toBeTruthy();
    expect(screen.getAllByText("2.0s").length).toBeGreaterThan(0);
  });

  it("says what the bars are for", async () => {
    await mount(telemetry());
    expect(screen.getByText(/watch a phase creep/)).toBeTruthy();
  });
});
