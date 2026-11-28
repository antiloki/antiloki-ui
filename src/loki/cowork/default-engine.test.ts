import { describe, it, expect } from "vitest";
import { pickDefaultEngine } from "./default-engine";
import type { Engine } from "./api";

const e = (key: string, over: Partial<Engine> = {}): Engine => ({ key, label: key, installed: true, seat: true, ...over } as Engine);

describe("the agent that opens when the person did not choose one", () => {
  it("is Claude Code when it is installed and signed in", () => { expect(pickDefaultEngine([e("cursor"), e("claude-code"), e("codex")])?.key).toBe("claude-code"); });
  it("is the one the machine has: a friend with only Cursor gets Cursor, never a Claude pane that cannot run", () => {
    expect(pickDefaultEngine([e("claude-code", { installed: false, seat: false }), e("codex", { installed: false, seat: false }), e("cursor")])?.key).toBe("cursor");
  });
  it("prefers a signed-in agent to an installed one that is signed out, and an installed one to nothing", () => {
    expect(pickDefaultEngine([e("claude-code", { seat: false }), e("codex")])?.key).toBe("codex");
    expect(pickDefaultEngine([e("claude-code", { seat: false }), e("codex", { installed: false })])?.key).toBe("claude-code");
  });
  it("skips an agent that is switched off or broken, and is null when nothing can run", () => {
    expect(pickDefaultEngine([e("claude-code", { off: true }), e("cursor", { broken: "will not start" }), e("codex")])?.key).toBe("codex");
    expect(pickDefaultEngine([e("claude-code", { installed: false }), e("cursor", { installed: false })])).toBeNull(); expect(pickDefaultEngine([])).toBeNull();
  });
});
