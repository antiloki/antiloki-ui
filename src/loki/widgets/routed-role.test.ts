// Grokbot QA 2026-10-12, item 8: the role chip must show the role Heimdall named on a run.
import { describe, it, expect } from "vitest";
import { routedRoleOf, roleWhyOf } from "./cockpit-pane-body";

describe("the routed role of a pane", () => {
  it("is read from the run's role, newest first", () => {
    const runs = [{ id: 1, role: { role: "backender", why: "api work" } }, { id: 2, role: { role: "frontender", why: "a UI ask" } }];
    expect(routedRoleOf(runs)).toBe("frontender");
    expect(roleWhyOf(runs)).toBe("a UI ask");
  });
  it("skips a newer run that named none, and honours the older route.role shape", () => {
    expect(routedRoleOf([{ id: 1, role: { role: "tester" } }, { id: 2 }])).toBe("tester");
    expect(routedRoleOf([{ id: 1, route: { role: "docs", why: "docs ask" } }])).toBe("docs");
    expect(roleWhyOf([{ id: 1, route: { role: "docs", why: "docs ask" } }])).toBe("docs ask");
  });
  it("is null when no run named a role", () => {
    expect(routedRoleOf([])).toBeNull();
    expect(routedRoleOf([{ id: 1, route: {} }])).toBeNull();
    expect(roleWhyOf([{ id: 1 }])).toBeNull();
  });
});
