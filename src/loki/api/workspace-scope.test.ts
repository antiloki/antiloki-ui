import { describe, it, expect, beforeEach } from "vitest";
import { setWorkspaceScope, paneKey, workspaceScope } from "./workspace-scope";
import { saveTheme, loadTheme } from "@/loki/cockpit/agent-themes";
import { splitKey } from "@/loki/chat/chat-widgets";

describe("what the browser remembers about a pane belongs to its project", () => {
  beforeEach(() => { setWorkspaceScope(""); try { localStorage.clear(); } catch { /* */ } });
  it("keys differ between two projects and match across spellings of one", () => {
    setWorkspaceScope("/home/u/a"); const a = paneKey("x", 5);
    setWorkspaceScope("/home/u/b"); const b = paneKey("x", 5);
    expect(a).not.toBe(b);
    setWorkspaceScope("C:\\Users\\u\\App\\"); const w1 = paneKey("x", 5);
    setWorkspaceScope("c:/users/u/app"); expect(paneKey("x", 5)).toBe(w1);
  });
  it("is the old unscoped key until the project is known", () => {
    expect(workspaceScope()).toBe(""); expect(paneKey("x", 5)).toBe("x:5");
  });
  it("project B's chat 5 does not inherit project A's chat-5 theme or widget split", () => {
    setWorkspaceScope("/p/a"); saveTheme(5, "codex"); localStorage.setItem(splitKey(5), "diff");
    expect(loadTheme(5, "claude")).toBe("codex");
    setWorkspaceScope("/p/b");
    expect(loadTheme(5, "claude")).toBe("claude");
    expect(localStorage.getItem(splitKey(5))).toBeNull();
    setWorkspaceScope("/p/a"); expect(loadTheme(5, "claude")).toBe("codex");
  });
});
