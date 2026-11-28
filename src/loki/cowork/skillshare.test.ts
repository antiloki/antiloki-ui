import { describe, it, expect } from "vitest";
import { KINDS, allItems, buildItems, counts, driftFrom, filterItems, groupItems, installSourceOk, parseSkillshare, rowActions, rowSub, runLine, sourceGroups, type RawScope } from "./skillshare";

// the shapes are the ones the CLI prints (read from how herdr's panel reads them)
const RAW: RawScope = {
  list: [
    { name: "code-review", kind: "skill", relPath: "code-review", source: "https://github.com/acme/skills.git" },
    { name: "planner.md", kind: "agent", relPath: "planner.md" },
    { name: "docs", kind: "skill", relPath: "acme/docs", repoName: "acme-skills" },
    { name: "style", kind: "skill", relPath: "acme/style", repoName: "acme-skills" },
    { name: "old", kind: "skill", relPath: "old", disabled: true },
    { name: "fresh", kind: "skill", relPath: "fresh" },
    { name: "drifted", kind: "skill", relPath: "drifted" },
    { kind: "skill" }, 7, null,
  ],
  diff: { targets: [{ name: "claude", items: [{ name: "fresh", kind: "skill", action: "add", is_sync: true, reason: "not in claude yet" }, { name: "drifted", kind: "skill", action: "modify", is_sync: true, reason: "changed" }, { name: "local-only", kind: "skill", action: "add", is_sync: false }] }, { name: "codex", items: [{ name: "drifted", kind: "skill", action: "add", is_sync: true }] }] },
  check: { skills: [{ name: "code-review", status: "update_available", version: "abc1234def", source: "https://github.com/acme/skills.git" }], tracked_repos: [{ name: "acme-skills", status: "behind", behind: 3 }] },
  checkAgents: [{ name: "planner", status: "update_available" }],
  mcp: { changes: [{ name: "github", target: "claude", action: "unchanged" }, { name: "github", target: "codex", action: "add" }, { name: "linear", target: "claude", action: "unchanged" }] },
  plugins: { packages: { formatter: { version: "1.2.0", source: "https://github.com/acme/fmt", bindings: { claude: { pending: true }, codex: {} } }, lone: { bindings: {} } } },
  hooks: { source: { entries: { lint: { enabled: true, description: "lint on save", bindings: { claude: {} } }, quiet: { enabled: false, bindings: { claude: {} } } } },
           plan: { changes: [{ name: "lint", target: "claude", action: "unchanged" }, { name: "quiet", target: "claude", action: "unchanged" }, { target: "codex", action: "conflict", message: "both changed" }], warnings: ["a warning"] } },
};
const items = buildItems("global", RAW);
const by = (kind: string, name: string) => items.find((i) => i.kind === kind && i.name === name)!;

describe("the skillshare model, as herdr's panel reads the CLI", () => {
  it("not installed is said with the reason; anything unreadable is the same, never a crash", () => {
    expect(parseSkillshare({ installed: false, hint: "install it" })).toEqual({ installed: false, hint: "install it" });
    for (const bad of [null, undefined, 5, "x", [], {}]) expect(parseSkillshare(bad)).toMatchObject({ installed: false });
    const ok = parseSkillshare({ installed: true, version: "0.18.2", source: "/s", targets: 2, scopes: { global: RAW, project: { list: [] } } });
    expect(ok.installed && ok.scopes.map((s) => s.scope)).toEqual(["global", "project"]); expect(ok.installed && allItems(ok).length).toBeGreaterThan(5);
  });
  it("skills and agents come from the list; a row with no name or that is not an object is dropped; an agent loses its .md", () => {
    expect(items.filter((i) => i.kind === "skills").map((i) => i.name).sort()).toEqual(["code-review", "docs", "drifted", "fresh", "old", "style"]); expect(by("agents", "planner")).toBeTruthy();
  });
  it("an update upstream (a skill's own check, an agent's, or a tracked repo that is behind) is `update`, with the short version and how far behind", () => {
    expect(by("skills", "code-review").state).toBe("update"); expect(by("agents", "planner").state).toBe("update"); expect(by("skills", "docs").state).toBe("update"); expect(by("skills", "docs").behind).toBe(3);
    expect(rowSub(by("skills", "code-review"), false)).toBe("abc1234 → newer"); expect(rowSub(by("skills", "docs"), false)).toBe("update available · ↓3"); expect(rowSub(by("agents", "planner"), true)).toBe("global · update available");
  });
  it("what a target still needs is `missing` (never synced) or `sync` (changed), across targets, and what a sync would not touch is left out", () => {
    expect(by("skills", "fresh").state).toBe("missing"); expect(rowSub(by("skills", "fresh"), false)).toBe("not synced yet");
    const d = by("skills", "drifted"); expect([d.state, d.targets]).toEqual(["sync", ["claude", "codex"]]); expect(rowSub(d, false)).toBe("changed");
    expect(items.some((i) => i.name === "local-only")).toBe(false); expect(driftFrom({ targets: [{ name: "t", items: [{ name: "x.md", kind: "agent", action: "add", is_sync: true }] }] }).has("agents:x")).toBe(true); expect(driftFrom(null).size).toBe(0);
  });
  it("a disabled skill is `off` and the plain rest are `ok`, captioned with where they came from", () => {
    expect(by("skills", "old").state).toBe("off"); expect(rowSub(by("skills", "old"), false)).toBe("disabled"); expect(by("skills", "style").state).toBe("update"); expect(by("skills", "style").repo).toBe("acme-skills"); expect(rowSub(by("skills", "fresh"), false)).toBe("not synced yet"); expect(rowSub(by("agents", "planner"), false)).toContain("update");
  });
  it("MCP servers are in sync unless a target has a pending change; plugins are in sync, pending in a target, or not bound anywhere", () => {
    expect(by("mcp", "github").state).toBe("sync"); expect(by("mcp", "github").reason).toBe("codex: add"); expect(by("mcp", "linear").state).toBe("ok");
    expect(by("plugins", "formatter").state).toBe("sync"); expect(by("plugins", "formatter").reason).toBe("pending in claude"); expect(by("plugins", "lone").state).toBe("missing"); expect(rowSub(by("plugins", "formatter"), false)).toBe("changed since last sync");
    expect(parseSkillshare({ installed: true, scopes: { global: { mcp: [{ name: "a" }, "b"] } } }).installed).toBe(true); expect(buildItems("global", { mcp: [{ name: "a" }, "b"] }).map((i) => i.name)).toEqual(["a", "b"]);
  });
  it("hooks: declared ones are ok or off, a plan conflict becomes a notice the row group leaves out, and nothing but a top-level declared hook can be switched", () => {
    expect(by("hooks", "lint").state).toBe("ok"); expect(by("hooks", "quiet").state).toBe("off"); expect(by("hooks", "lint").declared).toBe(true);
    const notices = items.filter((i) => i.notice); expect(notices.length).toBeGreaterThan(0); expect(notices.some((n) => n.blocker)).toBe(true); expect(notices.some((n) => n.lines.includes("a warning"))).toBe(true);
    expect(rowActions(by("hooks", "lint"))).toEqual(["disable", "remove"]); expect(rowActions(by("hooks", "quiet"))).toEqual(["enable", "remove"]); expect(rowActions(notices[0])).toEqual([]);
    expect(buildItems("global", { list: [], hooks: { source: { entries: { a: {} } } } }).find((i) => i.name === "a")?.state).toBe("unknown");
  });
  it("groups: updates, what needs a sync, what is in sync; a notice is in none; the lists are by label", () => {
    const g = groupItems(items); expect(g.update.map((i) => i.name).sort()).toEqual(["code-review", "docs", "planner", "style"]); expect(g.sync.map((i) => i.name).sort()).toEqual(["drifted", "formatter", "fresh", "github", "lone"].sort());
    expect(g.ok.map((i) => i.name)).toContain("old"); expect([...g.update, ...g.sync, ...g.ok].some((i) => i.notice)).toBe(false);
  });
  it("two or more rows from one source are a group (a tracked repo by name, a url by owner/repo); the rest stay rows", () => {
    const s = sourceGroups([by("skills", "style"), { ...by("skills", "docs"), state: "ok" }, by("skills", "old"), { ...by("skills", "fresh"), src: "github.com/acme/skills" }, { ...by("skills", "drifted"), src: "github.com/acme/skills" }]);
    expect(s.groups.map((g) => [g.label, g.items.length, g.repo])).toEqual([["acme-skills", 2, true], ["acme/skills", 2, true]]); expect(s.rows.map((r) => r.name)).toEqual(["old"]);
  });
  it("filters by scope, kind and what is typed (name or source), and can hide the disabled", () => {
    const both = [...items, ...buildItems("project", { list: [{ name: "local-skill", kind: "skill" }] })];
    expect(filterItems(both, { scope: "project", kind: null, query: "" }).map((i) => i.name)).toEqual(["local-skill"]); expect(filterItems(both, { scope: "all", kind: "agents", query: "" }).length).toBe(1);
    expect(filterItems(both, { scope: "all", kind: "skills", query: "ACME" }).map((i) => i.name).sort()).toEqual(["code-review", "docs", "style"]); expect(filterItems(both, { scope: "global", kind: "skills", query: "", hideDisabled: true }).some((i) => i.name === "old")).toBe(false);
    expect(counts(both)).toMatchObject({ project: 1, agents: 1, mcp: 2, plugins: 2, hooks: 2 }); expect(counts(both).all).toBe(both.filter((i) => !i.notice).length);
  });
  it("a row offers update (when there is one) and uninstall; MCP and plugins are looked at, not changed here", () => {
    expect(rowActions(by("skills", "code-review"))).toEqual(["update", "disable", "uninstall"]); expect(rowActions({ ...by("skills", "style"), state: "ok" })).toEqual(["disable", "uninstall"]); expect(rowActions({ ...by("skills", "style"), state: "off", disabled: true })).toEqual(["enable", "uninstall"]); expect(rowActions(by("mcp", "github"))).toEqual([]); expect(rowActions(by("plugins", "lone"))).toEqual([]);
  });
  it("what may be installed from: owner/repo or a git address, nothing that could be an option or a command", () => {
    for (const ok of ["acme/skills", "github.com/acme/skills", "https://github.com/acme/skills.git", "git@github.com:acme/skills.git", "ssh://git@host/a/b"]) expect(installSourceOk(ok), ok).toBe(true);
    for (const bad of ["", "skills", "--upload-pack=x", "a b/c", "x$(id)/y", "a/b;ls", "~/x", "/etc"]) expect(installSourceOk(bad), bad).toBe(false);
  });
  it("lists the five kinds the CLI manages, and a button's result reads as a line", () => {
    expect(KINDS.map((k) => k.key)).toEqual(["skills", "agents", "mcp", "plugins", "hooks"]);
    expect(runLine("sync", { ok: true, json: { synced: 3 } })).toEqual({ ok: true, line: "sync: synced 3" }); expect(runLine("update", { ok: true, json: { updated: 2, failed: 1 } })).toEqual({ ok: true, line: "update: updated 2, 1 failed" });
    expect(runLine("check", { ok: true, json: null })).toEqual({ ok: true, line: "check: done" }); expect(runLine("sync", { ok: false, error: "boom" })).toEqual({ ok: false, line: "boom" }); expect(runLine("sync", null).ok).toBe(false);
  });
});


describe("antiloki's own bank, as the pane reads it", () => {
  it("reads the native flag and the tools, and says what a button did in words", () => {
    const st: any = parseSkillshare({ installed: true, native: true, version: "antiloki", source: "/h/.antiloki/skillbank", targets: 2, tools: [{ key: "claude", label: "Claude Code" }, { key: "codex", label: "Codex" }, { bad: 1 }], scopes: { global: { list: [{ name: "alpha", kind: "skill", relPath: "alpha" }], diff: { targets: [] } } } });
    expect(st.native).toBe(true); expect(st.tools).toEqual([{ key: "claude", label: "Claude Code" }, { key: "codex", label: "Codex" }]); expect(parseSkillshare({ installed: true, scopes: {} })).toMatchObject({ native: false, tools: [] });
    expect(runLine("install", { ok: true, json: { installed: ["review", "planner.md"], synced: 4, skipped: ["Claude Code · review: x"] } }).line).toBe("install: synced 4, 1 left alone (a tool has its own), installed review, planner.md");
    expect(runLine("new", { ok: true, json: { created: "mine" } }).line).toBe("new: created mine"); expect(runLine("update", { ok: true, json: { updated: ["review"] } }).line).toBe("update: updated review"); expect(runLine("sync", { ok: false, error: "no project is open" })).toEqual({ ok: false, line: "no project is open" });
  });
});
