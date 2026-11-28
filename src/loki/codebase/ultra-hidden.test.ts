import { describe, it, expect } from "vitest";
import { isSoon, SOON_TABS, DASH_TABS } from "./repo-dashboard";

describe("Ultra review is 'soon' in X-ray until it is fixed (operator 2026-10-11)", () => {
  it("the tab stays in the strip for everyone, and only the dev build opens it for real", () => {
    expect(DASH_TABS.map((t) => t.key)).toContain("ultra");
    expect(SOON_TABS).toEqual(["ultra"]);
    expect(isSoon("ultra", false)).toBe(true); expect(isSoon("ultra", true)).toBe(false);
    for (const t of ["overview", "code", "design", "hurt", "breaks", "happened"] as const) expect(isSoon(t, false), t).toBe(false);
  });
});
