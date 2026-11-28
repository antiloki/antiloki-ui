// This panel answers "is the codebase getting better or worse?" from the judgment ledger — no AI,
// no rebuild. Its three empty-ish states are genuinely different advice ("rebuild a couple of times"
// vs "one snapshot isn't a trend"), and the movers must not swap direction: an improved file shown
// under "regressed" would send the operator to fix the wrong thing.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const reviewHistoryGet = vi.fn();
vi.mock("@/loki/api/codebase", () => ({ reviewHistoryGet: (...a: any[]) => reviewHistoryGet(...a) }));

import { ReviewHistoryPanel } from "./review-history-panel";

const mover = (over: any = {}) => ({ path: "src/a.ts", from: 40, to: 80, delta: 40, series: [40, 60, 80], ...over });
const history = (over: any = {}) => ({
  snapshot_count: 3, file_count: 12,
  timeline: [
    { id: 1, at: "2026-05-01", files: 12, avg_health: 60, avg_score: 60 },
    { id: 2, at: "2026-05-10", files: 12, avg_health: 65, avg_score: 65 },
    { id: 3, at: "2026-05-20", files: 12, avg_health: 72, avg_score: 72 },
  ],
  movers: { improved: [mover()], regressed: [mover({ path: "src/b.ts", from: 90, to: 50, delta: -40, series: [90, 70, 50] })] },
  axes_drift: [{ axis: "cohesion", from: 50, to: 70, delta: 20 }, { axis: "coupling", from: 80, to: 60, delta: -20 }],
  ...over,
});

const onOpen = vi.fn();
const mount = async (data: any) => {
  reviewHistoryGet.mockResolvedValue(data);
  const r = render(<ReviewHistoryPanel onOpen={onOpen} />);
  await waitFor(() => expect(screen.queryByText(/reading the review ledger/)).toBeNull());
  return r;
};

beforeEach(() => { reviewHistoryGet.mockReset(); onOpen.mockReset(); });

describe("the empty states", () => {
  it("says it is reading the ledger first", () => {
    reviewHistoryGet.mockReturnValue(new Promise(() => {}));
    render(<ReviewHistoryPanel />);
    expect(screen.getByText(/reading the review ledger/)).toBeTruthy();
  });

  it("explains that snapshots come from rebuilds when there are none", async () => {
    await mount({ snapshot_count: 0, file_count: 0, timeline: [], movers: { improved: [], regressed: [] }, axes_drift: [] });
    expect(screen.getByText(/No review snapshots yet/)).toBeTruthy();
    expect(screen.getByText(/rebuild the codebase \(↻\) a couple of times/)).toBeTruthy();
  });

  it("treats a failed read the same as no snapshots rather than crashing", async () => {
    await mount(null);
    expect(screen.getByText(/No review snapshots yet/)).toBeTruthy();
  });

  it("says a single snapshot is not yet a trend", async () => {
    await mount(history({ insufficient: true, snapshot_count: 1 }));
    expect(screen.getByText(/Only one review snapshot so far — two are needed to chart movement/)).toBeTruthy();
    expect(screen.queryByText(/most improved/)).toBeNull();
  });
});

describe("the repo health headline", () => {
  it("shows the latest health and the movement across the whole window", async () => {
    await mount(history());
    expect(screen.getByText("72")).toBeTruthy();
    expect(screen.getByText(/▲ \+12 over 3 snapshots/)).toBeTruthy();
  });

  it("marks a decline with a down arrow and the alarm colour", async () => {
    await mount(history({ timeline: [
      { id: 1, at: "a", files: 1, avg_health: 80, avg_score: 80 },
      { id: 2, at: "b", files: 1, avg_health: 60, avg_score: 60 },
    ] }));
    const delta = screen.getByText(/▼ -20 over 2 snapshots/) as HTMLElement;
    expect(delta.style.color).toBeTruthy();
  });

  it("says the numbers are deterministic, from the ledger", async () => {
    await mount(history());
    expect(screen.getByText(/3 snapshots · 12 files · deterministic, from the judgment ledger/)).toBeTruthy();
  });
});

describe("the movers", () => {
  it("puts climbers under improved and slippers under regressed", async () => {
    await mount(history());
    const improved = screen.getByText(/most improved/).parentElement!;
    const regressed = screen.getByText(/most regressed/).parentElement!;
    expect(improved.textContent).toContain("a.ts");
    expect(improved.textContent).toContain("▲40");
    expect(regressed.textContent).toContain("b.ts");
    expect(regressed.textContent).toContain("▼40");
  });

  it("says plainly when a side has no movers", async () => {
    await mount(history({ movers: { improved: [], regressed: [] } }));
    expect(screen.getByText("none climbed")).toBeTruthy();
    expect(screen.getByText("none slipped")).toBeTruthy();
  });

  it("keeps the full path in reach while showing only the basename", async () => {
    await mount(history());
    expect(screen.getByTitle(/src\/a.ts · 40 → 80/)).toBeTruthy();
    expect(screen.getByText("a.ts")).toBeTruthy();
  });

  it("opens a mover's file", async () => {
    await mount(history());
    fireEvent.click(screen.getByText("a.ts"));
    expect(onOpen).toHaveBeenCalledWith("src/a.ts");
  });

  it("draws a sparkline per mover, and an empty one when there is too little history", async () => {
    const { unmount } = await mount(history());
    expect(document.querySelectorAll("svg path").length).toBeGreaterThan(0);
    unmount();

    await mount(history({ movers: { improved: [mover({ series: [null, 80] })], regressed: [] } }));
    const moverSvg = screen.getByText("a.ts").parentElement!.querySelector("svg")!;
    expect(moverSvg.querySelector("path")).toBeNull();
  });
});

describe("the axis drift", () => {
  it("shows each axis's first→latest with its signed delta", async () => {
    await mount(history());
    expect(screen.getByText("cohesion")).toBeTruthy();
    expect(screen.getByText("50→70 (+20)")).toBeTruthy();
    expect(screen.getByText("80→60 (-20)")).toBeTruthy();
  });

  it("colours a rising axis apart from a falling one", async () => {
    await mount(history());
    expect((screen.getByText("50→70 (+20)") as HTMLElement).style.color)
      .not.toBe((screen.getByText("80→60 (-20)") as HTMLElement).style.color);
  });

  it("omits the section entirely when no axis moved", async () => {
    await mount(history({ axes_drift: [] }));
    expect(screen.queryByText(/axis drift/)).toBeNull();
  });
});
