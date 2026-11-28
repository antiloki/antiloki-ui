// The fixtures are what an unpaid tab renders INSTEAD of the operator's real substrate, so two
// properties matter more than any individual row: a rule must only answer for the surface it belongs
// to (a demo Harness must never serve Explorer data, and vice versa), and an unmatched request must
// return undefined so demo-mode falls through to its safe default rather than inventing a response.
import { describe, it, expect } from "vitest";
import { demoFixture } from "./fixtures";

const TABS = ["hub", "explorer", "canvas", "harness"] as const;

describe("routing a request to a fixture", () => {
  it("returns undefined for a surface that has no fixtures at all", () => {
    expect(demoFixture("nope", "GET", "/api/v1/cards")).toBeUndefined();
  });

  it("returns undefined for an unmatched path on a known surface", () => {
    for (const tab of TABS) expect(demoFixture(tab, "POST", "/api/v1/totally/unknown", {}), tab).toBeUndefined();
  });

  it("respects the method — a POST rule does not answer a GET", () => {
    expect(demoFixture("explorer", "POST", "/api/v1/codebase/get")).toBeTruthy();
    expect(demoFixture("explorer", "GET", "/api/v1/codebase/get")).toBeUndefined();
  });

  it("keeps each surface's fixtures to itself", () => {
    // The Harness board must not leak into Explorer, and Explorer's atlas must not leak into Harness.
    expect(demoFixture("harness", "GET", "/api/v1/cards")).toBeTruthy();
    expect(demoFixture("explorer", "GET", "/api/v1/cards")).toBeUndefined();
    expect(demoFixture("harness", "POST", "/api/v1/codebase/get")).toBeUndefined();
  });

  it("matches a path regardless of the host prefix in front of the route", () => {
    expect(demoFixture("explorer", "POST", "http://localhost:41931/api/v1/codebase/get")).toBeTruthy();
  });
});

describe("the notebook store is dispatched by op, not just by path", () => {
  const store = (op: string) => demoFixture("hub", "POST", "/api/v1/notebook/store", { op });

  it("list and get return different shapes off the same route", () => {
    expect(store("list")).toHaveProperty("notebooks");
    expect(store("get")).toHaveProperty("items");
  });

  it("an unknown op falls through instead of returning the list by accident", () => {
    expect(store("delete")).toBeUndefined();
  });

  it("the listed notebooks carry the fields the panel reads", () => {
    for (const nb of (store("list") as any).notebooks) {
      expect(nb).toMatchObject({ id: expect.any(Number), title: expect.any(String), item_count: expect.any(Number) });
    }
  });
});

describe("fixtures that reflect the request back", () => {
  it("blast radius keeps the seeds the caller asked about", () => {
    const r = demoFixture("explorer", "POST", "/api/v1/codebase/blast", { node_ids: ["file:x.ts"] });
    expect(r.seeds).toEqual(["file:x.ts"]);
    expect(r.affected.length).toBeGreaterThan(0);
  });

  it("blast radius falls back to its own seeds when none are given", () => {
    expect(demoFixture("explorer", "POST", "/api/v1/codebase/blast", {}).seeds).toEqual(["file:auth/guard.ts"]);
  });

  it("file read echoes the requested path and returns real-looking source", () => {
    const r = demoFixture("explorer", "POST", "/api/v1/codebase/file/read", { path: "a/b.ts" });
    expect(r.path).toBe("a/b.ts");
    expect(r.content).toContain("export");
    expect(r.bytes).toBe(r.content.length);
    expect(r.truncated).toBe(false);
  });

  it("an ask repeats the operator's question back in the answer's title", () => {
    const r = demoFixture("hub", "POST", "/api/v1/notebook/ask", { question: "why is auth slow?" });
    expect(r.item.title).toBe("why is auth slow?");
    expect(r.item.body_md).toContain("Demo answer");
    expect(r.item.meta.citations.length).toBeGreaterThan(0);
  });

  it("an ask with no question still produces a titled item", () => {
    expect(demoFixture("hub", "POST", "/api/v1/notebook/ask", {}).item.title).toBe("your question");
  });
});

describe("the constitution paper dispatch splits list from get", () => {
  const paper = (op?: string) =>
    demoFixture("hub", "POST", "/api/v1/dispatch", { action_name: "system.constitution.paper", input: { op } });

  it("op=get returns one paper with its markdown", () => {
    const r = paper("get").result.result;
    expect(r.paper.markdown).toContain("#");
  });

  it("any other op returns the list", () => {
    expect(paper("list").result.result).toHaveProperty("papers");
    expect(paper().result.result).toHaveProperty("papers");
  });

  it("a different action on the same dispatch route is not answered", () => {
    expect(demoFixture("hub", "POST", "/api/v1/dispatch", { action_name: "system.card.add" })).toBeUndefined();
  });
});

describe("the demo board is fake by construction", () => {
  const cards = () => demoFixture("harness", "GET", "/api/v1/cards?limit=2000&slim=1") as any[];

  it("serves a believable spread of statuses", () => {
    const statuses = new Set(cards().map((c) => c.status));
    expect(statuses.size).toBeGreaterThan(2);
    expect(cards().length).toBeGreaterThan(4);
  });

  it("every row carries the CardSlim fields the board renders", () => {
    for (const c of cards()) {
      expect(c).toMatchObject({ id: expect.any(Number), slug: expect.any(String), title: expect.any(String), status: expect.any(String) });
      expect(c.body_json).toBeUndefined();          // slim rows only — never the fat columns
    }
  });

  it("uses invented slugs, not anything that could be a real card", () => {
    for (const c of cards()) expect(c.slug).toMatch(/^(FEAT|EPIC|FIX)-/);
  });

  it("gives the cost tile a total that matches its breakdown's magnitude", () => {
    const r = demoFixture("harness", "POST", "/api/v1/cost/today");
    const sum = Object.values(r.by_tier as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(r.total_usd).toBeCloseTo(sum, 2);
  });
});

describe("the canvas fleet overview", () => {
  const o = () => demoFixture("canvas", "POST", "/api/v1/cockpit/overview");

  it("totals agree with the session rows behind them", () => {
    const r = o();
    expect(r.sessions).toHaveLength(r.totals.sessions);
    expect(r.sessions.filter((s: any) => s.status === "active")).toHaveLength(r.totals.active);
    const panes = r.sessions.reduce((a: number, s: any) => a + s.panes, 0);
    const calls = r.sessions.reduce((a: number, s: any) => a + s.calls, 0);
    expect(panes).toBe(r.totals.panes);
    expect(calls).toBe(r.totals.calls);
    expect(r.sessions.reduce((a: number, s: any) => a + s.cost_usd, 0)).toBeCloseTo(r.totals.cost_usd, 2);
  });

  it("dates the sessions relative to now so the demo never looks stale", () => {
    const newest = o().sessions[0].created_at.slice(0, 10);
    expect(newest).toBe(new Date().toISOString().slice(0, 10));
  });
});
