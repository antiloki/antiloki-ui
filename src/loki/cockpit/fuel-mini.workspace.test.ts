import { describe, it, expect, vi, beforeEach } from "vitest";

// the fetch is mocked so the test is about the CACHE, not about the network
const apiGet = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...(a as [])) }));

import { fetchFuel, lastFuel, forgetFuel } from "./fuel-mini";
// the listener lives in a hook on the components now, so this exercises the rule itself

const fuel = (spent: number) => ({ ok: true, houses: [{ key: "h", spent }] });

describe("the fuel cache and a workspace switch", () => {
  beforeEach(() => { forgetFuel(); apiGet.mockReset(); });

  it("remembers the last good answer within a workspace — the whole reason it exists", async () => {
    apiGet.mockResolvedValueOnce(fuel(1.25));
    await fetchFuel(7);
    expect(lastFuel(7)).toBeTruthy();
    expect((lastFuel(7) as any).houses[0].spent).toBe(1.25);
  });

  // A WORKSPACE SWITCH RE-MOUNTS ANOTHER PROJECT'S DB, so the remembered number is now the wrong project's and was
  // drawn instantly as if it were this one's. Showing nothing is honest; showing the other project is not.
  it("forgets it across one, rather than drawing the other project's money", async () => {
    apiGet.mockResolvedValueOnce(fuel(1.25));
    await fetchFuel(7);
    expect(lastFuel(7)).toBeTruthy();

    forgetFuel();                       // what the components' hook calls on antiloki:workspace-changed
    expect(lastFuel(7)).toBeNull();

    // …and the next real answer fills it again, per window
    apiGet.mockResolvedValueOnce(fuel(9));
    await fetchFuel(7);
    expect((lastFuel(7) as any).houses[0].spent).toBe(9);
    expect(lastFuel(30)).toBeNull();  // a window nobody asked for stays empty
  });

  it("a failed fetch never poisons the cache with a null", async () => {
    apiGet.mockResolvedValueOnce(fuel(2));
    await fetchFuel(7);
    apiGet.mockRejectedValueOnce(new Error("offline"));
    expect(await fetchFuel(7)).toBeNull();
    expect(lastFuel(7)).toBeTruthy();
  });
});
