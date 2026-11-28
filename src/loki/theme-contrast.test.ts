// EVERY THEME'S TEXT IS READABLE, AND THE ORDER OF THE TEXT COLOURS IS THE ORDER OF THEIR WEIGHT (QA report A11Y-002, 2026-10-06).
// axe's color-contrast failed the muted text of the default theme at 2.96:1; measuring all sixteen found every one of them under 4.5:1 (the lowest 1.97:1) - the named
// themes borrow each palette's canonical "comment" colour, which is made for code, not for a label. This reads styles.css and holds every theme to:
//   muted >= 4.5:1 and dim >= 4.5:1 on the LIGHTEST surface it sits on (bg, panel, panel2, hover, active), and fg > dim > muted by at least 0.15 of contrast, so lifting
//   the quiet text never makes it louder than the loud text.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function hexToLin(h: string): number[] {
  let x = h.replace("#", ""); if (x.length === 3) x = x.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => lin(parseInt(x.slice(i, i + 2), 16) / 255));
}
function oklchToLin(L: number, C: number, hDeg: number): number[] {
  const a = C * Math.cos((hDeg * Math.PI) / 180), b = C * Math.sin((hDeg * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map((c) => Math.min(1, Math.max(0, c)));
}
function toLin(v: string): number[] | null {
  v = v.trim();
  const o = v.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (o) return oklchToLin(+o[1]!, +o[2]!, +o[3]!);
  return v.startsWith("#") ? hexToLin(v) : null;
}
const lum = (c: number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const css = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
const themes = [...css.matchAll(/((?::root,\s*)?\.theme-[\w-]+)\s*\{([^}]*)\}/g)].map((m) => {
  const tokens: Record<string, string> = {};
  for (const t of m[2]!.matchAll(/--c-([\w]+)\s*:\s*([^;]+?)(?:\s*\/\*.*?\*\/)?;/g)) tokens[t[1]!] = t[2]!.trim();
  return { name: m[1]!.replace(/^:root,\s*/, ""), tokens };
}).filter((t) => t.tokens.fg && t.tokens.dim && t.tokens.muted);
const SURFACES = ["bg", "panel", "panel2", "hover", "active"];

describe("theme contrast (styles.css)", () => {
  it("finds every theme", () => { expect(themes.length).toBeGreaterThanOrEqual(16); });
  for (const t of themes) {
    it(`${t.name}: muted and dim are >= 4.5:1 on every surface, and fg > dim > muted`, () => {
      const surf = SURFACES.map((k) => toLin(t.tokens[k] ?? "")).filter((x): x is number[] => !!x);
      expect(surf.length).toBeGreaterThanOrEqual(3);
      const worst = (k: string) => Math.min(...surf.map((s) => ratio(toLin(t.tokens[k]!)!, s)));
      const [fg, dim, muted] = [worst("fg"), worst("dim"), worst("muted")];
      expect(muted, `${t.name} muted ${muted.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      expect(dim, `${t.name} dim ${dim.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      expect(fg - dim, `${t.name} fg ${fg.toFixed(2)} vs dim ${dim.toFixed(2)}`).toBeGreaterThanOrEqual(0.15);
      expect(dim - muted, `${t.name} dim ${dim.toFixed(2)} vs muted ${muted.toFixed(2)}`).toBeGreaterThanOrEqual(0.15);
    });
  }
});
