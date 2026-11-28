// A WORKSPACE SWITCH INVALIDATES EVERY POLLER (operator 2026-09-25: "on switching workspaces should show a loading on
// the entire screen and update with the new workspace data").
//
// The bug was not a missing spinner. The serve re-mounts another project's whole DB set on activation, and one surface
// listened for that — so every other screen kept serving the previous project's payload: real data, wrong repo, nothing
// on screen saying so. These tests hold the two properties that fix it: the stale data is DROPPED (not left on screen
// while a refetch runs), and the refetch is immediate.
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("./client", () => ({
  apiGet: vi.fn(), apiPost: vi.fn(),
  makePoll: () => () => {},          // no background polling in tests
  sameOrNext: (_prev: unknown, next: unknown) => next,
  isNotWired: () => false,
}));
vi.mock("./events", () => ({ subscribeToSubstrate: () => () => {}, isStreamHealthy: () => true }));
vi.mock("./dispatch", () => ({ fetchWorkspaces: vi.fn() }));

import { usePoll } from "./hooks";

const changed = () => act(() => { window.dispatchEvent(new CustomEvent("antiloki:workspace-changed", { detail: { name: "other" } })); });

describe("usePoll on a workspace switch", () => {
  it("drops the old workspace's data and refetches at once", async () => {
    let answer = "cards from workspace A";
    const fetcher = vi.fn(async () => answer);
    const { result } = renderHook(() => usePoll<string>(fetcher, 0));
    await waitFor(() => expect(result.current.data).toBe("cards from workspace A"));
    expect(fetcher).toHaveBeenCalledTimes(1);

    answer = "cards from workspace B";
    changed();
    // THE POINT: not "eventually B" but "never A again" — a screen must never render another project's data, so the
    // hook reports loading with no data rather than keeping what it had.
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe("cards from workspace B"));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("invalidates a `static` surface too — a catalog that never changes mid-run still changes with the project", async () => {
    const fetcher = vi.fn(async () => "skills of workspace A");
    const { result } = renderHook(() => usePoll<string>(fetcher, 0, true, { static: true }));
    await waitFor(() => expect(result.current.data).toBe("skills of workspace A"));
    changed();
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it("an in-flight fetch from the old workspace cannot land after the switch", async () => {
    let resolveFirst!: (v: string) => void;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<string>((r) => { resolveFirst = r; }))
      .mockImplementation(async () => "workspace B");
    const { result } = renderHook(() => usePoll<string>(fetcher as any, 0));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    changed();
    await act(async () => { resolveFirst("workspace A, answered late"); });
    await waitFor(() => expect(result.current.data).toBe("workspace B"));
    expect(result.current.data).not.toContain("workspace A");
  });

  it("stops listening when unmounted — a dead hook must not refetch on a later switch", async () => {
    const fetcher = vi.fn(async () => "x");
    const { unmount } = renderHook(() => usePoll<string>(fetcher, 0));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    unmount();
    changed();
    await new Promise((r) => setTimeout(r, 20));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

// FOUND BY AUDITING (2026-09-26): the listener sat inside `if (!enabled) return`, so a poller switched off at the
// moment of the switch kept the previous project's data and handed it to whatever rendered next.
describe("a poller that is switched off when the workspace changes", () => {
  it("drops the old project's data anyway, without claiming a fetch is in flight", async () => {
    const fetcher = vi.fn(async () => "cards from workspace A");
    const { result, rerender } = renderHook(({ on }) => usePoll<string>(fetcher, 0, on), { initialProps: { on: true } });
    await waitFor(() => expect(result.current.data).toBe("cards from workspace A"));

    rerender({ on: false });                    // the pane closed, the tab changed — the poller is off but still holds data
    changed();
    expect(result.current.data).toBeNull();     // …and must not keep serving another repo's cards
    expect(result.current.loading).toBe(false); // a disabled poller is empty, not loading
    expect(fetcher).toHaveBeenCalledTimes(1);   // and it does not fetch while it is off
  });
});
