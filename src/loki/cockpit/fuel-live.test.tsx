// @vitest-environment jsdom
// THE FUEL ON SCREEN AND A WORKSPACE SWITCH (operator 2026-09-30: "the preview of money saved is holding another workspace's"). Every surface that draws the fuel must drop the old
// project's reading AT ONCE on a switch, and must ignore an answer that was already on its way for the old one.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const apiGet = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...(a as [])) }));
import { useFuelLive, forgetFuel, lineText, linesFromFuel } from "./fuel-mini";

const fuel = (saved: number) => ({ ok: true, houses: [], limits: [], models: [], saved: { saved, runs: 1, actual: 1, baseline: 2, pct: 50, tokens: 1, line: "", proof: [] } });
beforeEach(() => { forgetFuel(); apiGet.mockReset(); });

describe("useFuelLive", () => {
  it("drops the old workspace's money the moment the workspace changes, then shows the new one's", async () => {
    apiGet.mockResolvedValueOnce(fuel(44));
    const { result } = renderHook(() => useFuelLive());
    await waitFor(() => expect((result.current as any)?.saved.saved).toBe(44));
    let release: (v: any) => void = () => {};
    apiGet.mockReturnValueOnce(new Promise((r) => { release = r; }));      // the new workspace's answer is slow
    act(() => { window.dispatchEvent(new CustomEvent("antiloki:workspace-changed")); });
    expect(result.current).toBeNull();                                    // not 44 for a second longer
    await act(async () => { release(fuel(3)); });
    await waitFor(() => expect((result.current as any)?.saved.saved).toBe(3));
  });

  it("ignores a reply that was in flight for the OLD workspace when the switch happened", async () => {
    let releaseOld: (v: any) => void = () => {};
    apiGet.mockReturnValueOnce(new Promise((r) => { releaseOld = r; }));  // the first poll is still on its way
    const { result } = renderHook(() => useFuelLive());
    apiGet.mockResolvedValueOnce(fuel(7));                                // the poll the switch triggers
    act(() => { window.dispatchEvent(new CustomEvent("antiloki:workspace-changed")); });
    await waitFor(() => expect((result.current as any)?.saved.saved).toBe(7));
    await act(async () => { releaseOld(fuel(999)); });                    // the stale one lands late
    expect((result.current as any)?.saved.saved).toBe(7);
  });
});

describe("the windows are the account's", () => {
  it("a seat with no calls in this workspace still shows its limit windows", () => {
    const f: any = { houses: [{ house: "claude", calls: 0, cost: 0, tokens: 0, models: 0 }], limits: [{ house: "claude", label: "5h", used_pct: 12 }, { house: "claude", label: "week", used_pct: 83 }], models: [] };
    const claude = linesFromFuel(f)[0];
    expect(lineText(claude)).toBe("no calls here · 5h 12% · wk 83%");
    expect(lineText(linesFromFuel(f)[3])).toBe("not running");             // gemini: nothing reported, nothing invented
  });
});
