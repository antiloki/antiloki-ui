// FUEL MUST NEVER GO BLANK (operator 2026-09-25: "everytime fuel preview or window close, it looses its state
// and have to recall it. Dont loose state, recall updates, but never gets empty").
//
// Every fuel surface held its reading in component state, so closing the window threw it away and reopening
// started at the reading-the-record placeholder — for a number that had been on screen a second earlier.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const get = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => get(...a), apiPost: vi.fn(), unwrapResult: (x: any) => x }));

const answer = (cost: number) => ({ houses: [{ house: "claude-code", cost }], models: [], compare: [], analysis: "" });

let fetchFuel: typeof import("./fuel-mini")["fetchFuel"];
let lastFuel: typeof import("./fuel-mini")["lastFuel"];
// `resetModules` + a dynamic import re-evaluates this module's whole graph, and that graph grew (2026-09-28) — the
// default 10s hook budget is not about this test's own work, it is about how long a cold re-import takes while the
// rest of the suite is running in parallel. 30s, so a slow machine does not read as a broken test.
beforeEach(async () => {
  vi.clearAllMocks(); vi.resetModules();
  const m = await import("./fuel-mini"); fetchFuel = m.fetchFuel; lastFuel = m.lastFuel;
}, 30_000);
afterEach(() => vi.resetModules());

describe("the last fuel reading", () => {
  it("is nothing before the first read — a placeholder is right exactly once", () => {
    expect(lastFuel(7)).toBeNull();
  });

  it("survives the component that fetched it, so reopening draws immediately", async () => {
    get.mockResolvedValue(answer(37.95));
    await fetchFuel(7);
    // the window closed and reopened here: module scope outlives the unmount
    expect(lastFuel(7)?.houses[0].cost).toBe(37.95);
  });

  it("is kept per window — a 30-day view does not answer for the 7-day one", async () => {
    get.mockResolvedValue(answer(1));
    await fetchFuel(30);
    expect(lastFuel(30)).not.toBeNull();
    expect(lastFuel(7)).toBeNull();
  });

  it("a failed refresh leaves the last good answer standing rather than blanking it", async () => {
    get.mockResolvedValue(answer(37.95));
    await fetchFuel(7);
    get.mockRejectedValue(new Error("the serve restarted"));
    expect(await fetchFuel(7)).toBeNull();          // the caller learns this attempt failed…
    expect(lastFuel(7)?.houses[0].cost).toBe(37.95); // …and the screen still has real numbers on it
  });

  it("a malformed reply is not cached as though it were data", async () => {
    get.mockResolvedValue({ nothing: true });
    expect(await fetchFuel(7)).toBeNull();
    expect(lastFuel(7)).toBeNull();
  });
});
