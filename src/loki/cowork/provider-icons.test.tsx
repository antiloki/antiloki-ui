// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import * as React from "react";
import { ProviderIcon, spriteOf, SPRITE_COLOR, type SpriteKey } from "./provider-icons";

describe("the provider sprites", () => {
  afterEach(() => cleanup());
  it("names the sprite of every engine the product runs, and of a family member, and none for a stranger", () => {
    for (const [e, k] of [["claude-code", "claude-code"], ["codex", "codex"], ["opencode", "opencode"], ["opencode-direct", "opencode"], ["gemini", "gemini"], ["grok", "grok"], ["cursor", "cursor"], ["deepseek", "deepseek"], ["DeepSeek-web", "deepseek"]] as const) expect(spriteOf(e), e).toBe(k);
    expect(spriteOf("script")).toBeNull(); expect(spriteOf(null)).toBeNull(); expect(spriteOf("")).toBeNull();
  });
  it("draws a mark for each one, in its colour, and a plain ring for none", () => {
    for (const k of Object.keys(SPRITE_COLOR) as SpriteKey[]) { const { container, unmount } = render(<ProviderIcon engine={k} size={20} />); const svg = container.querySelector("svg")!; expect(svg.getAttribute("data-sprite")).toBe(k); expect(svg.getAttribute("width")).toBe("20"); expect(svg.innerHTML).toContain(SPRITE_COLOR[k]); unmount(); }
    const { container } = render(<ProviderIcon engine="script" />); expect(container.querySelector("svg")!.getAttribute("data-sprite")).toBe(""); expect(container.querySelectorAll("circle")).toHaveLength(1);
  });
});
