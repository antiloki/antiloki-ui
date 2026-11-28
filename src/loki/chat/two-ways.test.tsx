// @vitest-environment jsdom
// This strip exists to make a spending choice visible before it is made, so the tests are about the two ways it could
// mislead: printing a price for a way nobody has measured, and hiding how little evidence is behind the numbers.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

const apiGet = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...a) }));
import { TwoWays, priceOf, evidenceOf, WAY_NAME } from "./two-ways";

const way = (key: "thin" | "deep", o: Partial<any> = {}) => ({ key, label: "", usd: 0.02, s: 40, n: 6, quality: 0.9, ...o });
beforeEach(() => { apiGet.mockReset(); vi.useFakeTimers(); });
// fake timers (`waitFor` would poll on real ones and hang): the time passes INSIDE act, so what the answer changes is drawn before the next line reads it (#24: outside act the redraw was scheduled on a real queue, and lost the race under load)
const pass = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe("priceOf", () => {
  it("prices a measured way in dollars and the time a person would notice", () => {
    expect(priceOf(way("thin", { usd: 0.023, s: 40 }))).toBe("≈ $0.023 · 40s");
    expect(priceOf(way("deep", { usd: 1.2, s: 300 }))).toBe("≈ $1.20 · 5m");
  });
  it("says NOT MEASURED rather than inventing a figure", () => {
    expect(priceOf(way("deep", { usd: null, s: null }))).toBe("not measured here");
  });
});

describe("evidenceOf", () => {
  it("names a single run as a single run", () => {
    expect(evidenceOf(way("thin", { n: 1, quality: 0.8 }))).toBe("1 run · scores 0.80");
    expect(evidenceOf(way("thin", { n: 6, quality: null }))).toBe("6 runs");
    expect(evidenceOf(way("thin", { n: 0 }))).toBe("no runs here yet");
  });
});

describe("the two-ways strip", () => {
  it("shows both ways with their prices and the serve's reason, and marks the recommended one", async () => {
    apiGet.mockResolvedValue({ ok: true, job: "editor-s", size: "s", thin: way("thin"), deep: way("deep", { usd: 0.9, s: 300, quality: 0.91 }),
      recommended: "thin", why: "a single call scores 0.90 here against 0.91 planned — the extra $0.88 buys nothing measurable" });
    render(<TwoWays ask="tidy src/a.ts" />);
    await pass(500);
    expect(screen.getByTestId("two-ways")).toBeTruthy();
    expect(screen.getByTestId("two-ways-thin").textContent).toContain(WAY_NAME.thin);
    expect(screen.getByTestId("two-ways-thin").dataset.recommended).toBe("1");
    expect(screen.getByTestId("two-ways-deep").dataset.recommended).toBe("0");
    expect(screen.getByTestId("two-ways-deep").textContent).toContain("$0.90");
    expect(screen.getByTestId("two-ways-why").textContent).toContain("buys nothing measurable");
  });

  it("asks once per pause, not once per keystroke", async () => {
    apiGet.mockResolvedValue({ ok: true, thin: way("thin"), deep: way("deep"), recommended: "thin", why: "" });
    const { rerender } = render(<TwoWays ask="ti" />);
    rerender(<TwoWays ask="tid" />);
    rerender(<TwoWays ask="tidy src/a.ts" />);
    await pass(500);
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet.mock.calls[0][0]).toContain(encodeURIComponent("tidy src/a.ts"));
  });

  it("does not appear at all for an empty ask, or when the serve has no such route", async () => {
    const { container, rerender } = render(<TwoWays ask="   " />);
    await pass(500);
    expect(container.textContent).toBe("");
    apiGet.mockRejectedValue(new Error("404"));
    rerender(<TwoWays ask="tidy src/a.ts" />);
    await pass(500);
    expect(screen.queryByTestId("two-ways")).toBeNull();
  });

  it("hands the pick back to the pane", async () => {
    apiGet.mockResolvedValue({ ok: true, thin: way("thin"), deep: way("deep"), recommended: "thin", why: "" });
    const picked: string[] = [];
    render(<TwoWays ask="rebuild the parser across the module" onPick={(w) => picked.push(w)} />);
    await pass(500);
    expect(screen.getByTestId("two-ways-deep")).toBeTruthy();
    fireEvent.click(screen.getByTestId("two-ways-deep"));
    expect(picked).toEqual(["deep"]);
  });
});
