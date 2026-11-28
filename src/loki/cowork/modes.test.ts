import { describe, it, expect } from "vitest";
import { parseMode } from "./modes";

describe("the mode an agent's screen shows", () => {
  it("reads Antigravity's four modes from its footer", () => {
    const foot = (w: string) => [">", `? for shortcuts                    ${w}Gemini 4 Hydrogen · high`];
    expect(parseMode("gemini", foot("auto · "))?.kind).toBe("auto");
    expect(parseMode("gemini", foot("plan · "))?.kind).toBe("plan");
    expect(parseMode("gemini", foot("accept-edits · "))).toEqual({ kind: "edits", label: "Accept edits" });
    expect(parseMode("gemini", foot(""))?.kind).toBe("default");
  });
  it("reads OpenCode's agent from its box, Claude Code's and Codex's from their footers", () => {
    expect(parseMode("opencode", ["  ┃  Plan · Seaglass Alpha Free antiloki / OpenCode", "  shift+tab agents"])).toEqual({ kind: "plan", label: "Plan" });
    expect(parseMode("claude-code", ["❯", "  ⏵⏵ auto mode on (shift+tab to cycle)"])?.kind).toBe("auto");
    expect(parseMode("claude-code", ["❯", "  ⏸ plan mode on (shift+tab to cycle)"])?.kind).toBe("plan");
    expect(parseMode("claude-code", ["❯", "  ? for shortcuts"])?.kind).toBe("default");
    expect(parseMode("claude-code", ["❯", "  ⏸ manual mode on · ← 3 agents"])?.kind).toBe("default");
    expect(parseMode("codex", ["  Plan mode (shift+tab to cycle)"])?.kind).toBe("plan");
  });
  it("says nothing when the screen does not", () => {
    expect(parseMode("claude-code", ["building…"])).toBeNull();
    expect(parseMode("x-echo", ["? for shortcuts"])).toBeNull();
  });
});
