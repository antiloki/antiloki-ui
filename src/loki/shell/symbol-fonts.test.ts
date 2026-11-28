// Grokbot QA 2026-10-12, item 34: icons drawn as Unicode symbols showed as empty boxes where no symbol font is installed. The app now carries subsets of OFL fonts; this keeps every symbol the source draws covered.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { mono, nav } from "../theme";

const SRC = resolve(__dirname, "../..");
const RANGES: [number, number][] = [[0x2190, 0x21ff], [0x2200, 0x22ff], [0x2300, 0x23ff], [0x2460, 0x24ff], [0x25a0, 0x25ff], [0x2600, 0x26ff], [0x2700, 0x27bf], [0x2900, 0x297f], [0x2b00, 0x2bff]];
const SKIP = new Set("—–’‘“”…•·");
/** Symbols the system EMOJI font draws by itself (colour emoji presentation): no text font carries them, and none is needed. */
const EMOJI = new Set([0x2705, 0x2728, 0x2754, 0x2795]);

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(tsx?|css)$/.test(f) && !/\.test\./.test(f)) out.push(p); }
  return out;
}
const css = readFileSync(join(SRC, "styles.css"), "utf8");
const faces = [...css.matchAll(/@font-face\s*\{[^}]*font-family:\s*"AntilokiSymbols"[^}]*unicode-range:\s*([^;]+);[^}]*\}/g)].map((m) => m[1]);
const covered = (cp: number) => faces.some((r) => r.split(",").some((part) => { const m = part.trim().match(/^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/i); if (!m) return false; const a = parseInt(m[1], 16), b = m[2] ? parseInt(m[2], 16) : a; return cp >= a && cp <= b; }));

describe("the icon symbols travel with the app", () => {
  it("carries four subset faces, each file present and small", () => {
    expect(faces).toHaveLength(4);
    for (const k of ["a", "b", "c", "d"]) { const p = join(SRC, "assets/fonts", `antiloki-symbols-${k}.woff2`); expect(existsSync(p), p).toBe(true); expect(statSync(p).size).toBeLessThan(40 * 1024); }
    expect(existsSync(join(SRC, "assets/fonts/LICENSE.md"))).toBe(true);
  });
  it("the font stacks name the symbol family after the main face", () => {
    expect(mono).toContain('"JetBrains Mono", "AntilokiSymbols"');
    expect(nav).toContain('"Geist", "AntilokiSymbols"');
  });
  it("covers every symbol the source draws (else: run scripts/symbol-fonts.py and paste its unicode-range lines into styles.css)", () => {
    const missing = new Set<string>();
    for (const f of walk(SRC)) for (const ch of readFileSync(f, "utf8")) {
      const cp = ch.codePointAt(0)!;
      if (SKIP.has(ch) || EMOJI.has(cp) || !RANGES.some(([a, b]) => cp >= a && cp <= b)) continue;
      if (!covered(cp)) missing.add(`${ch} (U+${cp.toString(16).toUpperCase()})`);
    }
    expect([...missing]).toEqual([]);
  }, 60_000);   // it reads every source file: the tree grew past the default 5 s on a busy machine
});
