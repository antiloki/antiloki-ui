// FileTree's collapse logic — folders closed by default, only what sits under open folders is listed
import { describe, it, expect } from "vitest";
import { parentDirs, visibleEntries } from "./cockpit-view";

describe("FileTree collapse", () => {
  const entries = [
    { path: "README.md", dir: false }, { path: "src", dir: true }, { path: "src/a.ts", dir: false },
    { path: "src/ui", dir: true }, { path: "src/ui/A.tsx", dir: false },
  ];
  it("lists the top level only until a folder is opened", () => {
    expect(visibleEntries(entries, new Set()).map((e) => e.path)).toEqual(["README.md", "src"]);
    expect(visibleEntries(entries, new Set(["src"])).map((e) => e.path)).toEqual(["README.md", "src", "src/a.ts", "src/ui"]);
    expect(visibleEntries(entries, new Set(["src", "src/ui"])).map((e) => e.path)).toEqual(["README.md", "src", "src/a.ts", "src/ui", "src/ui/A.tsx"]);
    expect(visibleEntries(entries, new Set(["src/ui"])).map((e) => e.path)).toEqual(["README.md", "src"]);
  });
  it("names the ancestors a selected glob needs open", () => {
    expect(parentDirs("src/ui/A.tsx")).toEqual(["src", "src/ui"]);
    expect(parentDirs("src/ui")).toEqual(["src"]);
    expect(parentDirs("README.md")).toEqual([]);
  });
});

import { tokensUnder, folderTokens } from "./cockpit-view";
describe("FileTree tokens", () => {
  it("sums a folder, reads a file, stays silent without data", () => {
    const tk = { "src/a.ts": 100, "src/ui/A.tsx": 250, "README.md": 10 };
    expect(tokensUnder(tk, "src", true)).toBe(350);
    expect(tokensUnder(tk, "src/ui/A.tsx", false)).toBe(250);
    expect(tokensUnder(tk, "docs", true)).toBeNull();
    expect(tokensUnder(undefined, "src", true)).toBeNull();
    // the once-per-map folder sums the tree renders from (2026-09-20) agree with the per-row scan
    const ft = folderTokens(tk);
    expect(ft["src"]).toBe(350); expect(ft["src/ui"]).toBe(tokensUnder(tk, "src/ui", true)); expect(ft["docs"]).toBeUndefined();
    expect(folderTokens(undefined)).toEqual({});
  });
});

import { scopeWithout } from "./cockpit-view";
// Grokbot QA 2026-10-12, item 9: unticking a nested child under a covering glob must leave it OUT, not add it.
describe("scopeWithout", () => {
  const entries = [
    { path: ".agents", dir: true }, { path: "README.md", dir: false },
    { path: "client", dir: true }, { path: "client/src", dir: true }, { path: "client/src/App.tsx", dir: false }, { path: "client/src/ui", dir: true }, { path: "client/package.json", dir: false },
    { path: "server", dir: true }, { path: "server/src", dir: true },
  ];
  const e = (p: string) => entries.find((x) => x.path === p)!;
  it("a top-level entry under the whole-project glob is dropped from its top-level spelling", () => {
    expect(scopeWithout(["**"], entries, e(".agents"))).toEqual(["README.md", "client/**", "server/**"]);
  });
  it("a nested child under `client/**` is excluded and its siblings stay", () => {
    expect(scopeWithout(["client/**", "server/**"], entries, e("client/src"))).toEqual(["server/**", "client/package.json"]);
  });
  it("under `**` the same untick works two levels down, and nothing is ADDED", () => {
    const out = scopeWithout(["**"], entries, e("client/src/App.tsx"));
    expect(out).toContain("server/**");
    expect(out).toContain("client/package.json");
    expect(out).toContain("client/src/ui/**");
    expect(out).not.toContain("client/src/App.tsx");
    expect(out).not.toContain("client/**");
    expect(out).not.toContain("client/src/**");
  });
  it("an entry ticked by its own token is just dropped", () => {
    expect(scopeWithout(["client/src/**", "server/**"], entries, e("client/src"))).toEqual(["server/**"]);
  });
  it("an entry nothing covers is left alone", () => {
    expect(scopeWithout(["server/**"], entries, e("client/src"))).toEqual(["server/**"]);
  });
});
