// THE PROVIDER SWITCH SHOWS AT ONCE (operator 2026-09-25: "i switched to codex seek … didnt change the UI for
// codex, so my prompt didnt appear even tough the changes were made. Just when i reloaded the page it appeared
// like a codex"). The serve awaits the rotation and returns the engine it settled on; the chat row came only
// from a list refetch that races it, so the pane stayed keyed to the old engine until a reload.
import { describe, it, expect } from "vitest";
import { applySwitch } from "./chats-tab";

const row = (engine: string, pane = 7) => ({ pane_id: pane, engine, session_id: 1 });

describe("showing the engine the serve confirmed", () => {
  it("wins over a list that has not caught up", () => {
    expect(applySwitch(row("claude-code"), { pane: 7, engine: "codex" })?.engine).toBe("codex");
  });

  it("steps aside the moment the list agrees", () => {
    const listed = row("codex");
    expect(applySwitch(listed, { pane: 7, engine: "codex" })).toBe(listed);  // the same object, untouched
  });

  it("never speaks for a different pane", () => {
    expect(applySwitch(row("claude-code", 7), { pane: 99, engine: "codex" })?.engine).toBe("claude-code");
  });

  it("with no switch in flight it is the list, unchanged", () => {
    const listed = row("opencode");
    expect(applySwitch(listed, null)).toBe(listed);
  });

  it("no chat yet is still no chat", () => {
    expect(applySwitch(null, { pane: 7, engine: "codex" })).toBeNull();
    expect(applySwitch(undefined, null)).toBeNull();
  });
});
