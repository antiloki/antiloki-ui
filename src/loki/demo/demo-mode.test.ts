// DEMO MODE is a data-leak boundary, not a UI nicety. An unpaid tab renders the real screens fed
// fixture data, so the rules that matter are: which SURFACE the operator is on, whether that
// surface is unlocked, and — the one that has already gone wrong once — that shell endpoints and
// real card titles are NEVER served from a demo tab.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/loki/shell/dock-store", () => ({ dockStore: { get: () => ({ chatMode: mockChatMode }) } }));
vi.mock("./fixtures", () => ({ demoFixture: (...a: any[]) => mockFixture(...a) }));

let mockChatMode = "agent";
let mockFixture: (...a: any[]) => any = () => undefined;

const { currentSurface, demoActive, demoIntercept, markSurfaceMounted, clearSurfaceMounted } = await import("./demo-mode");

/** jsdom's location is read-only; replace it wholesale. */
function at(pathname: string, search = "") {
  Object.defineProperty(window, "location", { value: { pathname, search, href: `http://x${pathname}${search}` }, writable: true, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mockChatMode = "agent";
  mockFixture = () => undefined;
  at("/");
  for (const t of ["explorer", "hub", "canvas", "harness"] as const) clearSurfaceMounted(t);
});
afterEach(() => { localStorage.clear(); });

describe("currentSurface — which product the operator is looking at", () => {
  it("maps the atlas and design routes to the explorer", () => {
    at("/operations/atlas"); expect(currentSurface()).toBe("explorer");
    at("/operations/atlas/deep"); expect(currentSurface()).toBe("explorer");
    at("/operations/design"); expect(currentSurface()).toBe("explorer");
  });

  it("maps the remaining operations and pipeline routes to the harness", () => {
    at("/operations"); expect(currentSurface()).toBe("harness");
    at("/pipeline/FEAT-X"); expect(currentSurface()).toBe("harness");
  });

  it("checks atlas BEFORE the generic operations prefix", () => {
    // Both prefixes match /operations/atlas; explorer must win or the atlas would demo as harness.
    at("/operations/atlas");
    expect(currentSurface()).toBe("explorer");
  });

  it("returns null for a route that is not a product surface", () => {
    at("/settings/cost"); expect(currentSurface()).toBeNull();
    at("/kanban"); expect(currentSurface()).toBeNull();
  });

  describe("the '/' stage, where the surface is announced rather than routed", () => {
    it("prefers the surface a screen announced at mount", () => {
      // Render runs before effects, so this is what makes a screen's FIRST fetches see the right
      // surface — the reason it exists at all.
      markSurfaceMounted("canvas");
      expect(currentSurface()).toBe("canvas");
    });

    it("falls back to the pending dock handoff before the dock store", () => {
      sessionStorage.setItem("antiloki:dock-mode", "search");
      mockChatMode = "terminal";
      expect(currentSurface()).toBe("hub");
    });

    it("falls back to the dock's chat mode last", () => {
      mockChatMode = "terminal";
      expect(currentSurface()).toBe("canvas");
      mockChatMode = "search";
      expect(currentSurface()).toBe("hub");
    });

    it("is null on the plain agent chat — that is not a sellable surface", () => {
      mockChatMode = "agent";
      expect(currentSurface()).toBeNull();
    });

    it("clearSurfaceMounted only clears the surface that announced itself", () => {
      markSurfaceMounted("canvas");
      clearSurfaceMounted("hub");            // a different screen unmounting
      expect(currentSurface()).toBe("canvas");
      clearSurfaceMounted("canvas");
      expect(currentSurface()).toBeNull();
    });
  });
});

describe("activation", () => {
  it("?demo=all unlocks every tab and persists", () => {
    at("/operations/atlas", "?demo=all");
    expect(demoActive()).toBe("explorer");
    expect(localStorage.getItem("antiloki:demo-tabs")).toBe("all");

    at("/operations/atlas"); // no query — the stored value carries it
    expect(demoActive()).toBe("explorer");
  });

  it("?demo=<csv> unlocks only the named tabs", () => {
    at("/operations/atlas", "?demo=hub,canvas");
    expect(demoActive()).toBeNull();          // explorer was not bought
    at("/", "?demo=hub,canvas");
    mockChatMode = "search";
    expect(demoActive()).toBe("hub");
  });

  it("?demo= with no value means all", () => {
    at("/operations/atlas", "?demo=");
    expect(demoActive()).toBe("explorer");
  });

  it("?demo=off clears the unlock", () => {
    at("/operations/atlas", "?demo=all");
    expect(demoActive()).toBe("explorer");
    at("/operations/atlas", "?demo=off");
    expect(demoActive()).toBeNull();
    expect(localStorage.getItem("antiloki:demo-tabs")).toBeNull();
  });

  it("is inactive by default — nothing is demoed unless asked for", () => {
    at("/operations/atlas");
    expect(demoActive()).toBeNull();
  });

  it("tolerates whitespace and empty entries in the csv", () => {
    at("/", "?demo= hub , ,canvas ");
    mockChatMode = "search";
    expect(demoActive()).toBe("hub");
  });
});

describe("demoIntercept — the leak boundary", () => {
  const unlock = () => at("/operations/atlas", "?demo=all");

  it("passes everything through untouched when demo mode is off", () => {
    at("/operations/atlas");
    expect(demoIntercept("GET", "/api/v1/cards")).toBeUndefined();
  });

  it("NEVER intercepts shell endpoints, even with every tab unlocked", () => {
    // Faking these would break the gate/nav itself; they must always hit the real substrate.
    unlock();
    for (const p of ["/api/v1/workspaces", "/api/v1/auth/session", "/api/v1/settings", "/healthz", "/api/v1/god/anything"]) {
      expect(demoIntercept("GET", p), p).toBeUndefined();
    }
  });

  it("DOES intercept real card and cost reads — the leak that already happened once", () => {
    // The first release shipped real card titles into an unpaid harness tab. These two paths are
    // on the product list precisely because of that incident.
    unlock();
    expect(demoIntercept("GET", "/api/v1/cards")).not.toBeUndefined();
    expect(demoIntercept("GET", "/api/v1/cost/today")).not.toBeUndefined();
  });

  it("serves the fixture when one exists for the request", () => {
    unlock();
    mockFixture = () => ({ nodes: ["fixture"] });
    expect(demoIntercept("GET", "/api/v1/codebase/get")).toEqual({ nodes: ["fixture"] });
  });

  it("answers an un-fixtured read with null so the screen's empty state renders", () => {
    unlock();
    expect(demoIntercept("GET", "/api/v1/codebase/unknown")).toBeNull();
  });

  it("answers an un-fixtured mutation ok-shaped, so every button 'works' and nothing persists", () => {
    unlock();
    expect(demoIntercept("POST", "/api/v1/board/card/add", { slug: "X" })).toEqual({ ok: true, demo: true });
  });

  it("lets a fixture return null deliberately, distinct from 'no fixture'", () => {
    unlock();
    mockFixture = () => null;
    expect(demoIntercept("POST", "/api/v1/codebase/get")).toBeNull();
  });

  it("only demos the surface the operator is actually on", () => {
    at("/operations/atlas", "?demo=hub");    // bought hub, looking at explorer
    expect(demoIntercept("GET", "/api/v1/codebase/get")).toBeUndefined();
  });

  it("passes the method, path and body through to the fixture resolver", () => {
    unlock();
    const seen: any[] = [];
    mockFixture = (...a: any[]) => { seen.push(a); return undefined; };
    demoIntercept("POST", "/api/v1/notebook/store", { id: 3 });
    expect(seen[0]).toEqual(["explorer", "POST", "/api/v1/notebook/store", { id: 3 }]);
  });
});
