// usePoll tri-state + reconcile behavior (path-to-8+ Tests program, 2026-07-11):
//   transient failure → error + FAST retry (capped)  ·  notWired sentinel
//   engine-404 sentinel → gone (definitive, not data) ·  ping-burst debounce
//   static surfaces never subscribe to substrate pings
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const NOT_WIRED = { __not_wired: true };
let firedListener: ((change?: any) => void) | null = null;
let subscribeCalls = 0;

vi.mock("./client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  makePoll: () => () => {}, // no background polling in tests
  sameOrNext: (_p: unknown, n: unknown) => n,
  isNotWired: (v: unknown) => v === NOT_WIRED,
}));
vi.mock("./events", () => ({
  subscribeToSubstrate: (fn: any) => { subscribeCalls += 1; firedListener = fn; return () => {}; },
  isStreamHealthy: () => true,
}));
vi.mock("./dispatch", () => ({ fetchWorkspaces: vi.fn() }));

import { usePoll } from "./hooks";

afterEach(() => { firedListener = null; subscribeCalls = 0; });

describe("usePoll tri-state", () => {
  it("transient failure sets error, then the fast retry recovers within ~1.5s", async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? null : { ok: calls }; // fail once, then recover
    });
    const { result } = renderHook(() => usePoll(fetcher, 60_000));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toBeNull();
    // fast retry fires at ~1.5s — well before any poll interval
    await waitFor(() => expect(result.current.data).toEqual({ ok: 2 }), { timeout: 4_000 });
    expect(result.current.error).toBe(false);
  }, 10_000);

  it("the fast retry is CAPPED so a dead BE is not hammered forever", async () => {
    const fetcher = vi.fn(async () => null); // permanently down
    renderHook(() => usePoll(fetcher, 60_000));
    // initial + up to 3 fast retries = 4; give time for would-be extras
    await act(async () => { await new Promise((r) => setTimeout(r, 6_500)); });
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(4);
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
  }, 12_000);

  it("notWired sentinel → notWired=true, never error, never data", async () => {
    const fetcher = vi.fn(async () => NOT_WIRED as any);
    const { result } = renderHook(() => usePoll(fetcher, 60_000));
    await waitFor(() => expect(result.current.notWired).toBe(true));
    expect(result.current.error).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it("engine-404 sentinel → gone=true (a definitive answer, not data); success clears it", async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? ({ __engine_error: true } as any) : { hello: 1 };
    });
    const { result } = renderHook(() => usePoll(fetcher, 60_000));
    await waitFor(() => expect(result.current.gone).toBe(true));
    expect(result.current.data).toBeNull();
    act(() => { result.current.refetch(); });
    await waitFor(() => expect(result.current.data).toEqual({ hello: 1 }));
    expect(result.current.gone).toBe(false);
  });
});

describe("usePoll reconcile (SSE ping path)", () => {
  it("a burst of pings collapses into ONE refetch after the debounce (trailing edge)", async () => {
    const fetcher = vi.fn(async () => ({ n: fetcher.mock.calls.length }));
    renderHook(() => usePoll(fetcher, 60_000));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1)); // initial
    await act(async () => {
      firedListener?.({ t: "change" });
      firedListener?.({ t: "change" });
      firedListener?.({ t: "change" });
      await new Promise((r) => setTimeout(r, 800)); // past the 600ms trailing debounce
    });
    expect(fetcher).toHaveBeenCalledTimes(2); // burst → exactly one reconcile fetch
  });

  it("static surfaces never subscribe to substrate pings (no refetch storms)", async () => {
    const fetcher = vi.fn(async () => ({ catalog: true }));
    renderHook(() => usePoll(fetcher, 60_000, true, { static: true }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(subscribeCalls).toBe(0);
  });
});
