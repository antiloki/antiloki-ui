import { describe, it, expect } from "vitest";
import { covered, filesInScope, foldersInScope, withDefaultScope, FULL_SCOPE } from "./scope-picker";

describe("the default scope is the whole project (operator 2026-10-11)", () => {
  const entries = [{ path: "src", dir: true }, { path: "src/a.ts", dir: false }, { path: "docs", dir: true }, { path: "docs/x.md", dir: false }, { path: "README.md", dir: false }] as any;
  it("nothing declared is the whole project; a declared scope is kept as it is", () => {
    expect(withDefaultScope([])).toEqual([FULL_SCOPE]); expect(withDefaultScope(undefined)).toEqual(["**"]); expect(withDefaultScope(null)).toEqual(["**"]);
    expect(withDefaultScope(["docs/**"])).toEqual(["docs/**"]);
  });
  it("`**` covers every file and folder, and names no single folder", () => {
    expect(covered(["**"], "src/a.ts", false)).toBe(true); expect(covered(["**"], "docs", true)).toBe(true); expect(covered(["**"], "README.md", false)).toBe(true);
    expect(filesInScope(entries, ["**"]).sort()).toEqual(["README.md", "docs/x.md", "src/a.ts"]);
    expect(foldersInScope(["**"])).toEqual([]);
    // a narrowed scope still narrows
    expect(filesInScope(entries, ["docs/**"])).toEqual(["docs/x.md"]);
  });
});
