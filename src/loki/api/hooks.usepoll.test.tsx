// usePoll request-versioning (2026-06-09 review fix): overlapping fetches
// must apply ONLY the latest response — a slow stale response resolving
// after a newer one must not clobber state.
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("./client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  makePoll: () => () => {},          // no background polling in tests
  sameOrNext: (_prev: unknown, next: unknown) => next,
  isNotWired: () => false,
}));
vi.mock("./events", () => ({
  subscribeToSubstrate: () => () => {},
  isStreamHealthy: () => true,
}));
vi.mock("./dispatch", () => ({
  fetchWorkspaces: vi.fn(),
}));

import { usePoll } from "./hooks";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("usePoll request versioning", () => {
  it("a stale slow response does not clobber a newer one", async () => {
    const pending: Array<{ promise: Promise<string>; resolve: (v: string) => void }> = [];
    const fetcher = vi.fn(() => {
      const d = deferred<string>();
      pending.push(d);
      return d.promise;
    });

    const { result } = renderHook(() => usePoll<string>(fetcher, 0));
    await waitFor(() => expect(pending.length).toBe(1)); // initial run

    // Fire a second run while the first is still in flight.
    act(() => { result.current.refetch(); });
    await waitFor(() => expect(pending.length).toBe(2));

    // Newer request resolves first…
    await act(async () => { pending[1].resolve("NEW"); });
    await waitFor(() => expect(result.current.data).toBe("NEW"));

    // …then the stale one resolves late. It must be dropped.
    await act(async () => { pending[0].resolve("STALE"); });
    expect(result.current.data).toBe("NEW");
    expect(result.current.error).toBe(false);
  });

  it("in-order responses still apply normally", async () => {
    const fetcher = vi.fn(async () => "A");
    const { result } = renderHook(() => usePoll<string>(fetcher, 0));
    await waitFor(() => expect(result.current.data).toBe("A"));
    expect(result.current.loading).toBe(false);
  });
});
