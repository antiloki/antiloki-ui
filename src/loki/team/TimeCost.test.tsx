// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { clock, readingOf, TimeCostMini, usd } from "./TimeCost";
import { setStripSlot } from "@/loki/cowork/strip-slot";
const run = (o: any = {}) => ({ id: "r1", team: "t", live: false, spent_usd: 0, state: { status: { status: "done" }, started_ms: 1000, now_ms: 1000 + 252_000, spent_usd: 0.113, node_cost: {}, active: {}, queued: [], values: {} }, graph: { nodes: {}, edges: [] }, events: [], ...o }) as any;
afterEach(() => { cleanup(); setStripSlot(null); });
describe("time and cost on the bottom bar", () => {
  it("clock and usd: minutes and seconds, hours when long, a cent figure, three decimals under a cent", () => { expect(clock(252_000)).toBe("4:12"); expect(clock(3_725_000)).toBe("1:02:05"); expect(clock(-5)).toBe("0:00"); expect(usd(0.113)).toBe("$0.11"); expect(usd(0.004)).toBe("$0.004"); expect(usd(0)).toBe("$0.00"); });
  it("readingOf: a finished run stops at its own clock, a live run counts on, no run is nothing", () => { expect(readingOf(null)).toBeNull(); expect(readingOf(run())).toEqual({ time: "4:12", cost: "$0.11", live: false }); expect(readingOf(run({ live: true }), 1000 + 61_000)).toEqual({ time: "1:01", cost: "$0.11", live: true }); });
  it("draws into the bar's slot; one click opens the waterfall in the middle of the screen, Escape and the close button put it away", () => {
    const slot = document.createElement("span"); document.body.appendChild(slot); act(() => setStripSlot(slot));
    render(<TimeCostMini run={run()} />); expect(slot.querySelector("[data-testid=timecost-mini]")).toBeTruthy(); expect(screen.getByTestId("timecost-time").textContent).toBe("4:12"); expect(screen.getByTestId("timecost-cost").textContent).toBe("$0.11");
    expect(screen.queryByTestId("timecost-window")).toBeNull(); fireEvent.click(screen.getByTestId("timecost-mini")); expect(screen.getByTestId("timecost-window")).toBeTruthy(); expect(screen.getByRole("dialog", { name: "Time and cost" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" }); expect(screen.queryByTestId("timecost-window")).toBeNull(); fireEvent.click(screen.getByTestId("timecost-mini")); fireEvent.click(screen.getByTestId("timecost-close")); expect(screen.queryByTestId("timecost-window")).toBeNull();
  });
  it("with no run it shows dashes and cannot be opened", () => { const slot = document.createElement("span"); document.body.appendChild(slot); act(() => setStripSlot(slot)); render(<TimeCostMini run={null} />); expect(screen.getByTestId("timecost-time").textContent).toBe("—"); expect((screen.getByTestId("timecost-mini") as HTMLButtonElement).disabled).toBe(true); });
});
