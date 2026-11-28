// paneDisplay names a pane in every surface that shows one. It exists because panes used to be
// titled "pane" when the thing in them is Claude, and "shape" when the product is called the RFC
// Drawer — a title that isn't the agent's own name reads as a bug to the operator.
import { describe, it, expect } from "vitest";
import { AGENT_META, paneDisplay } from "./types";

describe("paneDisplay", () => {
  it("gives each known engine its own name and glyph", () => {
    for (const [kind, meta] of Object.entries(AGENT_META)) {
      expect(paneDisplay(kind), kind).toEqual(meta);
      expect(meta.name).not.toBe(kind);       // a name, not the raw key
      expect(meta.glyph.length).toBeGreaterThan(0);
    }
  });

  it("names the tool panes after the product, not the internal kind", () => {
    expect(paneDisplay("shape")).toEqual({ glyph: "🧩", name: "RFC Drawer" });
  });

  it("makes an unknown kind readable rather than showing a raw key", () => {
    expect(paneDisplay("my-new-tool")).toEqual({ glyph: "❯", name: "my new tool" });
  });

  it("falls back to 'pane' only when there is genuinely no kind", () => {
    expect(paneDisplay("").name).toBe("pane");
    expect(paneDisplay(undefined as any).name).toBe("pane");
  });

  it("distinguishes the two OpenCode wirings — same glyph, different names", () => {
    const a = paneDisplay("opencode");
    const b = paneDisplay("opencode-direct");
    expect(a.glyph).toBe(b.glyph);
    expect(a.name).not.toBe(b.name);
  });
});
