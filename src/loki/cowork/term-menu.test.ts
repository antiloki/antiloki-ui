import { describe, it, expect } from "vitest";
import { menuKeys, parseTermMenu } from "./term-menu";
import { idleAgy, listsModelsOnScreen } from "./ChatSkin";
import screens from "./__fixtures__/model-menus.json";
import { parseTermError } from "./term-error";
import { parseMode } from "./modes";

describe("a menu on the agent's terminal", () => {
  it("reads a numbered permission question (Antigravity's own)", () => {
    const m = parseTermMenu(["────────────────────────", "antiloki/antiloki_panes", "Allow calling this tool?", "> 1. Yes, allow tool call", "  2. Yes, and always allow tool 'x' in this conversation", "  3. No, deny tool call", "", "↑/↓ Navigate · tab Amend", "esc to cancel"])!;
    expect(m.options).toHaveLength(3); expect(m.selected).toBe(0); expect(m.title).toContain("Allow calling this tool?");
    expect(menuKeys(m, 2)).toEqual(["\x1b[B", "\x1b[B", "\r"]); expect(menuKeys(m, 0)).toEqual(["\r"]);
  });
  it("keeps every choice when long ones wrap to the next line", () => {
    const m = parseTermMenu(["Allow calling this tool?", "> 1. Yes, allow tool call", "  2. Yes, and always allow tool 'antiloki/antiloki_panes' in this", "conversation", "  3. Yes, and always allow tool 'antiloki/antiloki_panes' (Persist to", "settings.json)", "  4. No, deny tool call", "↑/↓ Navigate · tab Amend", "esc to cancel"])!;
    expect(m.options).toHaveLength(4); expect(m.options[1]).toContain("in this conversation"); expect(m.options[3]).toBe("No, deny tool call");
  });
  it("reads a trust question with the cursor on the second line", () => {
    const m = parseTermMenu(["Do you trust the files in this folder?", "  1. Yes, proceed", "❯ 2. No, exit"])!;
    expect(m.selected).toBe(1); expect(menuKeys(m, 0)).toEqual(["\x1b[A", "\r"]);
  });
  it("reads an arrow list only when the screen says how to move in it", () => {
    const rows = ["Choose a model", "> sonnet", "  opus", "  haiku", "↑/↓ Navigate · enter Select"];
    expect(parseTermMenu(rows)!.options).toEqual(["sonnet", "opus", "haiku"]);
    expect(parseTermMenu(rows.slice(0, 4))).toBeNull();
  });
  it("ordinary output is not a menu: a numbered answer, a typed prompt", () => {
    expect(parseTermMenu(["Here are two steps:", "1. install it", "2. run it", "> "])).toBeNull();
    expect(parseTermMenu(["> Call the tool and answer", "● done"])).toBeNull();
  });
  it("reads OpenCode's side-by-side permission box and moves right to the choice", () => {
    const m = parseTermMenu(["  ┃", "  ┃  △ Permission required", "  ┃", "  ┃  $ echo antiloki-permission-test", "  ┃", "  ┃", "  ┃   Allow once   Always allow   Reject                  ctrl+f fullscreen  ⇆ select  enter confirm", "  ┃"])!;
    expect(m.options).toEqual(["Allow once", "Always allow", "Reject"]); expect(m.title.join(" ")).toContain("Permission required"); expect(m.title.join(" ")).toContain("$ echo");
    expect(menuKeys(m, 0)).toEqual(["\r"]); expect(menuKeys(m, 2)).toEqual(["\x1b[C", "\x1b[C", "\r"]);
  });
  it("keeps only OpenCode's question in the card, not the conversation or the side panel above it", () => {
    const m = parseTermMenu(["  Run the shell command: ls -la          MCP", "  + 1 thought          • antiloki Connected", "  Press ctrl+b to move running work to the background", "  ┃", "  ┃  △ Permission required", "  ┃  $ ls -la", "  ┃   Allow once   Always allow   Reject          ⇆ select  enter confirm"])!;
    expect(m.title).toEqual(["△ Permission required", "$ ls -la"]);
  });
  it("reads choices that each name their key", () => {
    const m = parseTermMenu(["Run this command?", " → Run (once) (y)", "   Add to allowlist (a)", "   Skip (esc or n)"])!;
    expect(m.options).toEqual(["Run (once)", "Add to allowlist", "Skip"]); expect(menuKeys(m, 2)).toEqual(["n"]);
  });
});

describe("an Antigravity screen waiting at its prompt", () => {
  it("is idle, and one with something to cancel is not", () => {
    expect(idleAgy("gemini", ["> ", "? for shortcuts      auto"])).toBe(true);
    expect(idleAgy("gemini", ["Generating...", "esc to cancel   auto"])).toBe(false);
    expect(idleAgy("opencode", ["? for shortcuts"])).toBe(false);
  });
});

describe("the model lists of Antigravity and OpenCode, as their screens drew them", () => {
  it("Antigravity's is an arrow list", () => {
    const m = parseTermMenu(screens.agy)!;
    expect(m.options[1]).toBe("Gemini 3.8 Flash"); expect(m.options).toHaveLength(8); expect(m.selected).toBe(0);
    expect(menuKeys(m, 2)).toEqual(["\x1b[B", "\x1b[B", "\r"]);
  });
  it("OpenCode's is chosen by its search, headings left out", () => {
    const m = parseTermMenu(screens.opencode)!;
    expect(m.options).toEqual(["qwen2.5-coder:3b", "qwen3:0.6b", "qwen3:4b", "Seaglass Alpha Free", "Tidepool Alpha Free", "Hy4 flash Free", "Iceman Free", "Flint 40B Free", "DeepSeek V4.1 Flash Free"]);
    expect(m.selected).toBe(3); expect(menuKeys(m, 5)).toEqual(["Hy4 flash Free", "\r"]);
  });
  it("only those two send the bare command", () => {
    expect(listsModelsOnScreen("gemini", "/model ")).toBe(true); expect(listsModelsOnScreen("opencode", "/models")).toBe(true); expect(listsModelsOnScreen("claude-code", "/model")).toBe(false);
  });
});

describe("Cursor's screens, as it drew them", () => {
  it("its model list is chosen with the arrows", () => {
    const m = parseTermMenu(screens.cursor)!;
    expect(m.options.slice(0, 3)).toEqual(["Auto", "Grok 4.7 · 256K Medium", "Grok 4.6 · High"]); expect(m.selected).toBe(1); expect(menuKeys(m, 0)).toEqual(["\x1b[A", "\r"]);
  });
  it("its free-plan refusal is read, without its key hints", () => {
    expect(parseTermError(screens.cursorError)).toBe("Model unavailable on Free Free includes Grok 4.7, Grok 4.6, and Auto with fixed settings. Switch to an included model to continue.");
    expect(parseTermError(["  I fixed the error: the model is now loaded.", "→ Add a follow-up"])).toBeNull();
  });
  it("its modes", () => {
    expect(parseMode("cursor", ["  → Plan, search, build anything", "  Debug (shift+tab to cycle)", "  Auto"])?.kind).toBe("debug");
    expect(parseMode("cursor", ["  → Add a follow-up", "  Auto · 7%"])).toEqual({ kind: "default", label: "Agent" });
  });
  it("reads Cursor's command question, whose choices have letters and named keys", () => {
    const m = parseTermMenu([" $  pwd && ls -la in .", " Run this command?", " Not in allowlist: pwd", "  → Run (once) (y)", "    Add Shell(pwd) to allowlist? (tab)", "    Run Everything (shift+tab)", "    Skip & tell the agent what to do instead (esc or n)"])!;
    expect(m.options).toEqual(["Run (once)", "Add Shell(pwd) to allowlist?", "Run Everything", "Skip & tell the agent what to do instead"]);
    expect(m.title.join(" ")).toContain("Run this command?");
    expect(menuKeys(m, 0)).toEqual(["y"]); expect(menuKeys(m, 1)).toEqual(["\t"]); expect(menuKeys(m, 2)).toEqual(["\x1b[Z"]); expect(menuKeys(m, 3)).toEqual(["n"]);
  });
  it("reads Claude's trust question, which has no numbers and names no arrows", () => {
    const m = parseTermMenu(["────────────────────────", " Accessing workspace:", "", " /home/x/project", "", " Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source", " project, or work from your team). If not, take a moment to review what's in this folder first.", "", " Claude Code'll be able to read, edit, and execute files here.", "", " Security guide", "", " ❯ No, exit", "   Yes, I trust this folder", "", " Enter to confirm · Esc to cancel"])!;
    expect(m.options).toEqual(["No, exit", "Yes, I trust this folder"]); expect(m.selected).toBe(0);
    expect(menuKeys(m, 1)).toEqual(["\x1b[B", "\r"]);
    expect(m.title.join(" ")).toContain("/home/x/project"); expect(m.title.join(" ")).toContain("Quick safety check");
  });
});
