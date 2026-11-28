// Grokbot QA round 2, item 12: "Code graph controls render as solid black blocks on light themes; a black pill in the Architecture graph". These surfaces were painted with fixed dark colours.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (f: string) => readFileSync(resolve(__dirname, f), "utf8");
describe("graph surfaces follow the theme", () => {
  for (const f of ["atlas-graph.tsx", "gravity-map.tsx", "file-tree.tsx", "highlight.tsx"]) {
    it(`${f} paints no fixed dark background`, () => {
      const src = read(f);
      expect(src).not.toMatch(/background:\s*"oklch\(0\.[0-3]\d* /);   // an oklch lightness under 0.4 is a dark colour that stays dark on a light theme
      expect(src).not.toMatch(/background:\s*"#0[0-9a-f]{5}"/i);
    });
  }
  it("the control buttons and pills take the panel colour", () => {
    const src = read("atlas-graph.tsx");
    expect(src).toContain("color-mix(in oklab, ${C.panel} 88%, transparent)");
  });
});
