import { describe, it, expect } from "vitest";
import { commandsOf, parseCommand, studioProblem } from "./commands";

describe("a command from the serve, read defensively", () => {
  it("an open is a terminal by default, with a side and a title, and an agent or a studio tool names what to open", () => {
    expect(parseCommand({ id: 3, op: "open", args: { kind: "terminal", title: "tests", side: "below" } })).toEqual({ id: 3, op: "open", kind: "terminal", title: "tests", side: "below", engine: "", tool: "", run: 0 });
    expect(parseCommand({ id: 4, op: "open", args: {} })).toMatchObject({ kind: "terminal", side: "right" });
    expect(parseCommand({ id: 5, op: "open", args: { kind: "agent", engine: "codex" } })).toMatchObject({ kind: "agent", engine: "codex" });
    expect(parseCommand({ id: 6, op: "open", args: { kind: "studio", tool: "preview", side: "sideways" } })).toMatchObject({ kind: "studio", tool: "preview", side: "right", run: 0 });
    expect(parseCommand({ id: 7, op: "open", args: { kind: "studio", tool: "qa", run: 1794355200000 } })).toMatchObject({ tool: "qa", run: 1794355200000 }); expect(parseCommand({ id: 8, op: "open", args: { kind: "studio", tool: "qa", run: "x" } })).toMatchObject({ run: 0 });
  });
  it("close and focus name a pane; anything else, or a command with no id, is nothing", () => {
    expect(parseCommand({ id: 7, op: "close", args: { id: "shell-12" } })).toEqual({ id: 7, op: "close", paneId: "shell-12" });
    expect(parseCommand({ id: 8, op: "focus", args: { id: "shell-12" } })).toEqual({ id: 8, op: "focus", paneId: "shell-12" });
    for (const bad of [null, 5, "x", {}, { id: 0, op: "open" }, { id: 1.5, op: "open" }, { id: 1, op: "close", args: {} }, { id: 1, op: "rm -rf" }, { id: 1, op: "open", args: { kind: "weird" } }]) expect(parseCommand(bad), JSON.stringify(bad)).toBeNull();
  });
  it("a list keeps the commands it can read and drops the rest", () => {
    expect(commandsOf([{ id: 1, op: "open" }, "junk", { id: 2, op: "close", args: { id: "a" } }]).map((c) => c.id)).toEqual([1, 2]); expect(commandsOf(undefined)).toEqual([]);
  });
  it("every Studio tool opens as a pane, and a name that is not one is refused with the list", () => { for (const k of ["notes", "xray", "code-graph", "skillshare", "skill-library", "design-canvas"]) expect(studioProblem(k), k).toBeNull(); expect(studioProblem("atlas-xray")).toMatch(/is one of: sagas, issues, notes, preview/); });
});

describe("the commands that reorganise and restyle the screen", () => {
  it("an arrange names the pane and the action, with only the arguments that action takes, each checked", () => {
    expect(parseCommand({ id: 1, op: "arrange", args: { action: "move", id: "shell-1", dir: "left" } })).toMatchObject({ op: "arrange", action: "move", paneId: "shell-1", dir: "left", to: "", side: "" });
    expect(parseCommand({ id: 2, op: "arrange", args: { action: "move", id: "a", to: "b", side: "below" } })).toMatchObject({ to: "b", side: "below", dir: "" });
    expect(parseCommand({ id: 3, op: "arrange", args: { action: "resize", id: "a", share: 0.7 } })).toMatchObject({ share: 0.7 }); expect(parseCommand({ id: 3, op: "arrange", args: { action: "resize", id: "a", share: "wide" } })).toMatchObject({ share: null });
    expect(parseCommand({ id: 4, op: "arrange", args: { action: "zoom", id: "a", on: false } })).toMatchObject({ on: false }); expect(parseCommand({ id: 5, op: "arrange", args: { action: "rename", id: "a", title: "Tests" } })).toMatchObject({ title: "Tests" });
    for (const bad of [{ action: "explode", id: "a" }, { action: "move" }, { id: "a" }, {}]) expect(parseCommand({ id: 6, op: "arrange", args: bad }), JSON.stringify(bad)).toBeNull();
    expect(parseCommand({ id: 7, op: "arrange", args: { action: "move", id: "a", dir: "diagonal", side: "over" } })).toMatchObject({ dir: "", side: "" });
  });
  it("a look is a patch of numbers, a theme, a wallpaper and following; an empty one reads, and nothing else gets through", () => {
    expect(parseCommand({ id: 1, op: "look", args: { patch: { termOpacity: 0.2, paneOpacity: 0, dim: 0.5, themeId: "nord", wallpaper: "1-a.jpg", follow: false, evil: "x" } } })).toEqual({ id: 1, op: "look", patch: { termOpacity: 0.2, paneOpacity: 0, dim: 0.5, themeId: "nord", wallpaper: "1-a.jpg", follow: false } });
    expect(parseCommand({ id: 2, op: "look", args: {} })).toEqual({ id: 2, op: "look", patch: {} }); expect(parseCommand({ id: 3, op: "look", args: { patch: { themeId: null, wallpaper: null } } })).toMatchObject({ patch: { themeId: null, wallpaper: null } });
    expect(parseCommand({ id: 4, op: "look", args: { patch: { termOpacity: "lots", dim: NaN } } })).toEqual({ id: 4, op: "look", patch: {} });
  });
  it("a screen command shows or hides the sidebar and names a workspace; empty it only reads", () => {
    expect(parseCommand({ id: 1, op: "screen", args: { sidebar: "hide", workspace: "ministore" } })).toEqual({ id: 1, op: "screen", sidebar: "hide", workspace: "ministore" }); expect(parseCommand({ id: 2, op: "screen", args: { sidebar: "maybe" } })).toEqual({ id: 2, op: "screen", sidebar: "", workspace: "" });
  });
});

describe("the commands that look inside a pane and act in it", () => {
  it("a view names the pane and how much text to bring; an act names the pane, the action and its target, and only what that action takes", () => {
    expect(parseCommand({ id: 1, op: "pane_view", args: { id: "sagas-3" } })).toEqual({ id: 1, op: "pane_view", paneId: "sagas-3", chars: 6000 }); expect(parseCommand({ id: 2, op: "pane_view", args: { id: "a", text_chars: 99999 } })).toMatchObject({ chars: 20000 }); expect(parseCommand({ id: 3, op: "pane_view", args: {} })).toBeNull();
    expect(parseCommand({ id: 4, op: "pane_act", args: { id: "sagas-3", action: "type", testid: "saga-new-title", value: "Ship it", submit: true, junk: "x" } })).toEqual({ id: 4, op: "pane_act", paneId: "sagas-3", act: { action: "type", testid: "saga-new-title", value: "Ship it", submit: true }, view: true });
    expect(parseCommand({ id: 5, op: "pane_act", args: { id: "a", action: "click", ref: "e7", view: false } })).toMatchObject({ act: { action: "click", ref: "e7" }, view: false }); expect(parseCommand({ id: 6, op: "pane_act", args: { id: "a", action: "scroll", text: "list", dy: -200 } })).toMatchObject({ act: { dy: -200 } });
    for (const bad of [{ id: "a", action: "explode" }, { action: "click" }, { id: "a" }]) expect(parseCommand({ id: 7, op: "pane_act", args: bad }), JSON.stringify(bad)).toBeNull();
  });
});

describe("a report keeps the command's id apart from the pane's", () => {
  it("the body the screen posts carries the command's id last, so a pane's name can never take its place", async () => {
    const { reportCommand } = await import("./api");
    const { apiPost } = await import("@/loki/api/client");
    const seen: unknown[] = []; const { vi } = await import("vitest");
    vi.spyOn(await import("@/loki/api/client"), "apiPost").mockImplementation(async (_p: string, body: unknown) => { seen.push(body); return { ok: true } as never; });
    await reportCommand(9, { ok: true, pane: "shell-12", pane_id: 12 });
    expect(seen[0]).toEqual({ ok: true, pane: "shell-12", pane_id: 12, id: 9 });
    void apiPost;
  });
});
