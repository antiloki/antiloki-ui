// EVENT-SOURCED-FE (Phase 5): usePoll's per-entity patch path — a scoped ping
// patches in place instead of refetching the whole payload; an undecided patch
// (undefined) falls back to a full refetch.
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

let firedListener: ((change?: any) => void) | null = null;
vi.mock("./client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  makePoll: () => () => {}, // no background polling in tests
  sameOrNext: (_p: unknown, n: unknown) => n,
  isNotWired: () => false,
}));
vi.mock("./events", () => ({
  subscribeToSubstrate: (fn: any) => { firedListener = fn; return () => {}; },
  isStreamHealthy: () => true,
}));
vi.mock("./dispatch", () => ({ fetchWorkspaces: vi.fn() }));

import { usePoll } from "./hooks";

const ping = async (entities: any[]) => {
  await act(async () => {
    firedListener?.({ t: "change", entities });
    await new Promise((r) => setTimeout(r, 700)); // past the 600ms debounce
  });
};

describe("usePoll Phase 5 patch path", () => {
  it("patches in place on a scoped ping instead of refetching", async () => {
    const fetcher = vi.fn(async () => [{ slug: "A" }, { slug: "B" }]);
    const patch = vi.fn((entities: any[], prev: any[]) =>
      prev.map((c) => (c.slug === entities[0].id ? { ...c, patched: true } : c)));
    const { result } = renderHook(() => usePoll<any[]>(fetcher, 0, true, { patch }));
    await waitFor(() => expect(result.current.data).toEqual([{ slug: "A" }, { slug: "B" }]));
    expect(fetcher).toHaveBeenCalledTimes(1); // initial only

    await ping([{ kind: "card", id: "B", op: "update" }]);

    expect(patch).toHaveBeenCalled();
    expect(result.current.data).toEqual([{ slug: "A" }, { slug: "B", patched: true }]);
    expect(fetcher).toHaveBeenCalledTimes(1); // NO refetch — patched in place
  });

  it("falls back to a full refetch when the patch declines (undefined)", async () => {
    let n = 0;
    const fetcher = vi.fn(async () => [{ slug: "A", v: ++n }]);
    const patch = vi.fn(() => undefined);
    const { result } = renderHook(() => usePoll<any[]>(fetcher, 0, true, { patch }));
    await waitFor(() => expect(result.current.data).toEqual([{ slug: "A", v: 1 }]));

    await ping([{ kind: "card", id: "X" }]);

    expect(patch).toHaveBeenCalled();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2)); // declined → refetched
    expect(result.current.data).toEqual([{ slug: "A", v: 2 }]);
  });

  it("without a patch fn, a ping refetches as before (unchanged behavior)", async () => {
    let n = 0;
    const fetcher = vi.fn(async () => ["v" + ++n]);
    const { result } = renderHook(() => usePoll<string[]>(fetcher, 0));
    await waitFor(() => expect(result.current.data).toEqual(["v1"]));
    await ping([{ kind: "card", id: "Z" }]);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
});
