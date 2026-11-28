// Grokbot QA 2026-10-12, item 36: the page must say which colour scheme native controls are drawn in, per theme.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
describe("native controls follow the theme", () => {
  it("dark by default, light for the four light themes", () => {
    expect(css).toMatch(/:root\s*\{\s*color-scheme:\s*dark;?\s*\}/);
    const light = css.match(/([.\w\-, \n]+)\{\s*color-scheme:\s*light;?\s*\}/)?.[1] ?? "";
    for (const t of ["githublight", "solarizedlight", "onelight", "latte"]) expect(light, t).toContain(`.theme-${t}`);
  });
  it("option lists take the panel colours", () => {
    expect(css).toMatch(/select,\s*option,\s*optgroup\s*\{[^}]*background-color:\s*var\(--c-panel\)[^}]*color:\s*var\(--c-fg\)/);
  });
});
