import { describe, expect, it } from "vitest";
import { antilokiLine } from "./ChatSkin";

describe("a turn antiloki typed", () => {
  it("is one line: who handed over, or the command as typed", () => {
    expect(antilokiLine("[antiloki] You are taking over this conversation from Claude Code on gemma4:e4b (local) because the person switched provider. Before anything else…\n# Reconciliation pack")).toBe("antiloki handed this conversation over from Claude Code on gemma4:e4b (local)");
    expect(antilokiLine("/model haiku")).toBe("/model haiku");
  });
});
