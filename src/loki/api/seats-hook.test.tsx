// @vitest-environment jsdom
// ONE READ, AND A SWITCH IS HEARD (audit 2026-10-01): fourteen components call useSeats(); each mount sent its own GET, and forgetSeats() cleared the cache without telling the ones already mounted.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

let payload: any; let reads = 0; let gate: Promise<void> | null = null;
vi.mock("./client", () => ({ apiGet: vi.fn(async () => { reads++; if (gate) await gate; return payload; }) }));
import { fetchSeats, forgetSeats, useSeats } from "./seats";

const machine = (claudeOn: boolean) => ({ engines: [{ key: "claude-code", name: "Claude", usable: claudeOn, on: claudeOn }, { key: "codex", name: "Codex", usable: true, on: true }], heimdall: { effective: "codex" } });
beforeEach(() => { forgetSeats(); reads = 0; gate = null; payload = machine(true); });

describe("fetchSeats", () => {
  it("shares one read between concurrent callers", async () => {
    let release!: () => void; gate = new Promise<void>((r) => { release = r; });
    const all = Promise.all([fetchSeats(), fetchSeats(), fetchSeats()]);
    release();
    const [a, b, c] = await all;
    expect(reads).toBe(1);
    expect(a).toBe(b); expect(b).toBe(c);
    await fetchSeats(); expect(reads).toBe(1);                       // and the answer is cached afterwards
  });
  it("a read that began before forgetSeats() does not fill the cache with the old machine", async () => {
    let release!: () => void; gate = new Promise<void>((r) => { release = r; });
    const stale = fetchSeats();
    forgetSeats(); payload = machine(false); gate = null;
    release(); await stale;
    const fresh = await fetchSeats();
    expect(fresh!.seats.find((x) => x.key === "claude-code")!.on).toBe(false);
  });
});

describe("useSeats", () => {
  it("fifteen mounted hooks make one read, not fifteen", async () => {
    const hooks = Array.from({ length: 15 }, () => renderHook(() => useSeats()));
    await waitFor(() => expect(hooks.every((h) => h.result.current !== null)).toBe(true));
    expect(reads).toBe(1);
  });
  it("forgetSeats() makes a mounted hook read again and show the new machine", async () => {
    const h = renderHook(() => useSeats());
    await waitFor(() => expect(h.result.current?.seats.find((x) => x.key === "claude-code")!.on).toBe(true));
    payload = machine(false);                                          // the operator switched Claude off
    act(() => { forgetSeats(); });
    await waitFor(() => expect(h.result.current?.seats.find((x) => x.key === "claude-code")!.on).toBe(false));
    expect(reads).toBe(2);
  });
  it("an unmounted hook is not called back", async () => {
    const h = renderHook(() => useSeats());
    await waitFor(() => expect(h.result.current).not.toBeNull());
    h.unmount();
    act(() => { forgetSeats(); });
    await Promise.resolve();
    expect(reads).toBe(1);
  });
});
