// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), loadSkillshare: vi.fn(), runSkillshare: vi.fn() }));
import * as api from "./api";
import { parseSkillshare } from "./skillshare";
import { SkillsharePane } from "./SkillsharePane";

const GLOBAL = {
  list: [
    { name: "code-review", kind: "skill", relPath: "code-review", source: "https://github.com/acme/skills.git" }, { name: "planner.md", kind: "agent", relPath: "planner.md" },
    { name: "docs", kind: "skill", relPath: "acme/docs", repoName: "acme-skills" }, { name: "style", kind: "skill", relPath: "acme/style", repoName: "acme-skills" },
    { name: "old", kind: "skill", relPath: "old", disabled: true }, { name: "fresh", kind: "skill", relPath: "fresh" }, { name: "steady", kind: "skill", relPath: "steady" }, { name: "steady2", kind: "skill", relPath: "steady2" },
  ],
  diff: { targets: [{ name: "claude", items: [{ name: "fresh", kind: "skill", action: "add", is_sync: true }] }] },
  check: { skills: [{ name: "code-review", status: "update_available", version: "abc1234def" }], tracked_repos: [] },
  mcp: { changes: [{ name: "github", target: "claude", action: "unchanged" }] },
  hooks: { source: { entries: { lint: { enabled: true, bindings: { claude: {} } } } }, plan: { changes: [{ name: "lint", target: "claude", action: "unchanged" }] } },
};
const ready = (extra: object = {}) => parseSkillshare({ installed: true, version: "0.18.2", source: "/home/u/skills", targets: 2, scopes: { global: GLOBAL, ...extra } });
const withProject = () => ready({ project: { list: [{ name: "local-skill", kind: "skill" }] } });
beforeEach(() => { vi.mocked(api.loadSkillshare).mockReset(); vi.mocked(api.runSkillshare).mockReset(); vi.mocked(api.runSkillshare).mockResolvedValue({ ok: true, json: { updated: 1 } }); });
afterEach(() => cleanup());
const mount = async (st = ready()) => { vi.mocked(api.loadSkillshare).mockResolvedValue(st); render(<SkillsharePane />); await waitFor(() => expect(screen.getByTestId("skillshare").getAttribute("data-state")).toBe("ready")); };

describe("the skills pane, laid out like herdr's skillshare panel", () => {
  it("without the CLI it says what skillshare is and how to get it, and can check again", async () => {
    vi.mocked(api.loadSkillshare).mockResolvedValue(parseSkillshare({ installed: false, hint: "skillshare is not installed. Install it (github.com/runkids/skillshare), run `skillshare init`." }));
    render(<SkillsharePane />); await waitFor(() => expect(screen.getByTestId("skillshare").getAttribute("data-state")).toBe("missing"));
    expect(screen.getByText(/github.com\/runkids\/skillshare/)).toBeTruthy(); const before = vi.mocked(api.loadSkillshare).mock.calls.length; fireEvent.click(screen.getByTestId("skillshare-recheck")); await waitFor(() => expect(vi.mocked(api.loadSkillshare).mock.calls.length).toBe(before + 1));
  });
  it("reads the state first and then asks for the update checks, which are slower", async () => {
    await mount(); await waitFor(() => expect(api.loadSkillshare).toHaveBeenCalledWith(true, true)); expect(vi.mocked(api.loadSkillshare).mock.calls[0]).toEqual([true, false]);
  });
  it("shows the version, the tools, a tab per kind with its count, and the list grouped by what needs doing", async () => {
    await mount();
    expect(screen.getByText(/v0\.18\.2 · 2 tools/)).toBeTruthy(); expect(screen.getByTestId("ss-kind-skills").textContent).toContain("7"); expect(screen.getByTestId("ss-kind-agents").textContent).toContain("1"); expect(screen.getByTestId("ss-kind-mcp").textContent).toContain("1"); expect(screen.getByTestId("ss-kind-hooks").textContent).toContain("1");
    expect(screen.getByTestId("ss-group-update").textContent).toContain("Updates available · 1"); expect(screen.getByTestId("ss-group-sync").textContent).toContain("Needs sync · 1"); expect(screen.getByTestId("ss-group-ok").textContent).toContain("In sync");
    expect(screen.getByTestId("ss-row-skills-code-review").getAttribute("data-state")).toBe("update"); expect(screen.getByTestId("ss-row-skills-code-review").textContent).toContain("abc1234 → newer"); expect(screen.getByTestId("ss-row-skills-fresh").textContent).toContain("not synced yet");
    fireEvent.click(screen.getByTestId("ss-kind-agents")); expect(screen.getByTestId("ss-row-agents-planner")).toBeTruthy(); fireEvent.click(screen.getByTestId("ss-kind-hooks")); expect(screen.getByTestId("ss-row-hooks-lint")).toBeTruthy();
  });
  it("with a project it has an All / Project / Global switch with counts that narrows the list", async () => {
    await mount(withProject()); expect(screen.getByTestId("ss-scope-all").textContent).toContain("All"); expect(screen.getByTestId("ss-scope-project").textContent).toContain("1");
    fireEvent.click(screen.getByTestId("ss-scope-project")); expect(screen.getByTestId("ss-row-skills-local-skill")).toBeTruthy(); expect(screen.queryByTestId("ss-row-skills-code-review")).toBeNull();
    await mount(ready()).catch(() => {}); cleanup(); await mount(); expect(screen.queryByTestId("ss-scope-project")).toBeNull();
  });
  it("Update all and a row's update press the CLI for the right scope and kind, then read it all again", async () => {
    await mount(); fireEvent.click(screen.getByTestId("ss-update-all"));
    await waitFor(() => expect(api.runSkillshare).toHaveBeenCalledWith({ op: "update", all: true, scope: "global", kind: "skills" })); await waitFor(() => expect(screen.getByTestId("ss-note").textContent).toBe("update: updated 1"));
    fireEvent.click(screen.getByTestId("ss-update-code-review")); await waitFor(() => expect(api.runSkillshare).toHaveBeenLastCalledWith({ op: "update", scope: "global", kind: "skills", name: "code-review" }));
  });
  it("Sync names the scope that needs it and runs it", async () => {
    await mount(); expect(screen.getByTestId("ss-sync").textContent).toBe("Sync global"); fireEvent.click(screen.getByTestId("ss-sync")); await waitFor(() => expect(api.runSkillshare).toHaveBeenCalledWith({ op: "sync", scope: "global" }));
  });
  it("uninstall asks first, and keeping leaves everything as it was", async () => {
    await mount(); fireEvent.click(screen.getByTestId("ss-source-acme-skills")); fireEvent.click(screen.getByTestId("ss-uninstall-style")); expect(screen.getByTestId("ss-confirm").textContent).toContain("skillshare trash");
    fireEvent.click(screen.getByTestId("ss-confirm-no")); expect(screen.queryByTestId("ss-confirm")).toBeNull(); expect(api.runSkillshare).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("ss-uninstall-style")); fireEvent.click(screen.getByTestId("ss-confirm-yes")); await waitFor(() => expect(api.runSkillshare).toHaveBeenCalledWith({ op: "uninstall", scope: "global", kind: "skills", name: "acme/style" }));
  });
  it("install takes owner/repo or a git address and nothing that could be an option; Enter installs", async () => {
    await mount(); fireEvent.click(screen.getByTestId("ss-install")); const go = screen.getByTestId("ss-install-go") as HTMLButtonElement; expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("ss-source"), { target: { value: "--upload-pack=evil" } }); expect(go.disabled).toBe(true); fireEvent.change(screen.getByTestId("ss-source"), { target: { value: "acme/more-skills" } }); expect(go.disabled).toBe(false);
    fireEvent.keyDown(screen.getByTestId("ss-source"), { key: "Enter" }); await waitFor(() => expect(api.runSkillshare).toHaveBeenCalledWith({ op: "install", scope: "global", source: "acme/more-skills" })); expect(screen.queryByTestId("ss-install-form")).toBeNull();
  });
  it("a hook can be disabled and removed, and the filter narrows by name or source", async () => {
    await mount(); fireEvent.click(screen.getByTestId("ss-kind-hooks")); fireEvent.click(screen.getByTestId("ss-hook-disable-lint")); await waitFor(() => expect(api.runSkillshare).toHaveBeenCalledWith({ op: "hook", action: "disable", scope: "global", name: "lint" }));
    fireEvent.click(screen.getByTestId("ss-kind-skills")); fireEvent.change(screen.getByTestId("ss-filter"), { target: { value: "STEADY" } }); expect(screen.getByTestId("ss-row-skills-steady")).toBeTruthy(); expect(screen.queryByTestId("ss-row-skills-fresh")).toBeNull();
    fireEvent.change(screen.getByTestId("ss-filter"), { target: { value: "zzz" } }); expect(screen.getByText("Nothing matches the filter.")).toBeTruthy();
  });
  it("disabled entries are hidden until asked for; rows from one source fold into a group (even local ones) that opens and closes", async () => {
    await mount(); expect(screen.getByTestId("ss-source-local").textContent).toContain("2"); fireEvent.click(screen.getByTestId("ss-show-off")); expect(screen.getByTestId("ss-source-local").textContent).toContain("3");
    expect(screen.queryByTestId("ss-row-skills-old")).toBeNull(); fireEvent.click(screen.getByTestId("ss-source-local")); expect(screen.getByTestId("ss-row-skills-old").textContent).toContain("disabled");
    fireEvent.click(screen.getByTestId("ss-source-local")); expect(screen.queryByTestId("ss-row-skills-old")).toBeNull();
  });
  it("a failed button says why, in red, and does not pretend", async () => {
    vi.mocked(api.runSkillshare).mockResolvedValue({ ok: false, error: "boom" }); await mount(); fireEvent.click(screen.getByTestId("ss-sync")); await waitFor(() => expect(screen.getByTestId("ss-note").textContent).toBe("boom"));
  });
});

describe("antiloki's own bank in the pane", () => {
  const native = () => parseSkillshare({ installed: true, native: true, version: "antiloki", source: "/h/.antiloki/skillbank", targets: 2, tools: [{ key: "claude", label: "Claude Code" }, { key: "codex", label: "Codex" }],
    scopes: { global: { list: [{ name: "alpha", kind: "skill", relPath: "alpha" }, { name: "off-one", kind: "skill", relPath: "off-one", disabled: true }, { name: "planner.md", kind: "agent", relPath: "planner.md" }], diff: { targets: [{ name: "codex", items: [{ name: "alpha", kind: "skill", action: "add", is_sync: true }] }] } } } });
  it("is called Skills, names the tools it links to, and has only the skills and agents tabs", async () => {
    await mount(native());
    expect(screen.getByTestId("ss-tools").textContent).toContain("one bank · 2 tools: Claude Code, Codex"); expect(screen.queryByTestId("ss-kind-mcp")).toBeNull(); expect(screen.queryByTestId("ss-kind-plugins")).toBeNull(); expect(screen.queryByTestId("ss-kind-hooks")).toBeNull(); expect(screen.getByTestId("ss-kind-skills")).toBeTruthy(); expect(screen.getByTestId("ss-kind-agents")).toBeTruthy();
    expect(screen.queryByText(/not installed/)).toBeNull();
  });
  it("makes a new skill of your own with a name and what it is for, and switches one off and on", async () => {
    await mount(native()); fireEvent.click(screen.getByTestId("ss-new")); expect((screen.getByTestId("ss-new-go") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("ss-new-name"), { target: { value: "bad name!" } }); expect((screen.getByTestId("ss-new-go") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("ss-new-name"), { target: { value: "my-skill" } }); fireEvent.change(screen.getByTestId("ss-new-desc"), { target: { value: "use it for tests" } }); fireEvent.click(screen.getByTestId("ss-new-go"));
    await waitFor(() => expect(api.runSkillshare).toHaveBeenCalledWith({ op: "new", scope: "global", name: "my-skill", description: "use it for tests" }));
    fireEvent.click(screen.getByTestId("ss-toggle-disable-alpha")); await waitFor(() => expect(api.runSkillshare).toHaveBeenCalledWith({ op: "toggle", off: true, scope: "global", kind: "skills", name: "alpha" }));
    fireEvent.click(screen.getByTestId("ss-show-off")); fireEvent.click(screen.getByTestId("ss-toggle-enable-off-one")); await waitFor(() => expect(api.runSkillshare).toHaveBeenCalledWith({ op: "toggle", off: false, scope: "global", kind: "skills", name: "off-one" }));
  });
  it("says in its own words what uninstalling does", async () => {
    await mount(native()); fireEvent.click(screen.getByTestId("ss-uninstall-alpha")); expect(screen.getByTestId("ss-confirm").textContent).toContain("taken out of the bank");
  });
});

