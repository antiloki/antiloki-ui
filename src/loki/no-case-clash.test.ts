// @vitest-environment node
// WINDOWS AND MACOS ARE CASE-INSENSITIVE, LINUX IS NOT (found 2026-11-25 on a friend's Windows machine): with `FreePane.tsx` and `freepane.ts` side by side,
// `import "./FreePane"` makes the dev server try `FreePane.ts` first, which Windows answers with `freepane.ts`: "doesn't provide an export named 'FreePane'", and the
// screen crashes. Nothing on Linux ever shows it. So: no two files in one folder may share a name apart from case.
import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) { if (n === "node_modules" || n.startsWith(".")) continue; const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); }
  return out;
}

describe("file names are safe on a case-insensitive disk", () => {
  it("no two files in a folder have the same name apart from case (a .ts next to a .tsx counts: imports leave the extension out)", () => {
    const groups = new Map<string, Set<string>>();
    for (const f of walk("src")) {
      const stem = basename(f, extname(f)); const dir = f.slice(0, f.length - basename(f).length); const key = `${dir}${stem.toLowerCase()}`;
      (groups.get(key) ?? groups.set(key, new Set()).get(key)!).add(stem);
    }
    const clashes = [...groups.entries()].filter(([, names]) => names.size > 1).map(([k, names]) => `${k}: ${[...names].join(" vs ")}`);
    expect(clashes, "rename one of each pair (see the comment at the top of this file)").toEqual([]);
  });
});
