// The file review's FIX generators — the pure rules behind "beyond the lines" and the plan.
// Split out of atlas-decorators.tsx (2026-09-12) after an audit found the prescriptions
// overreaching where the diagnosis was right: a test importing a module-private function, an
// N×N warning on a loop that walks a partition, a structure exhibit pointed at the wrong arms,
// and a plan that priced every axis at 100 after one edit.
//
// Every function here is deterministic over the judge's parts + the source lines.

// ── the test target: an EXPORTED symbol, or the default export ────────────────────────────────

export type Block = { name: string; kind?: string; line?: number | null; end_line?: number | null; complexity?: number | null; flags?: string[] };

export type TestTarget =
  | { kind: "named"; name: string; importLine: string; why: string }
  | { kind: "default"; name: string; importLine: string; why: string }
  | { kind: "none"; why: string };

/** What a new test file can import. A module-private function is not a test target: the test
 *  would not compile. Prefers the most complex EXPORTED block; falls back to the default export
 *  read off the source (`export default X` / `export default function X`). */
export function pickTestTarget(blocks: Block[], srcLines: string[] | null, base: string): TestTarget {
  const def = defaultExportName(srcLines);
  const exported = blocks.filter((b) => (b.flags ?? []).includes("exported") && b.kind !== "const" && b.kind !== "type");
  if (exported.length) {
    const top = [...exported].sort((x, y) => (y.complexity ?? 0) - (x.complexity ?? 0))[0];
    const why = `${top.name} is exported and the most complex of the ${exported.length} exported symbol${exported.length === 1 ? "" : "s"}`;
    // `export default function X` marks X exported AND is the default — a named import would fail
    if (def && def.name === top.name) return { kind: "default", name: top.name, importLine: `import ${top.name} from './${base}';`, why: `${why} (the default export)` };
    return { kind: "named", name: top.name, importLine: `import { ${top.name} } from './${base}';`, why };
  }
  if (def) {
    const local = blocks.find((b) => b.name === def.name);
    const name = def.name || base;
    return { kind: "default", name, importLine: `import ${name} from './${base}';`, why: `the module's only public surface is its default export${local ? ` (${local.kind ?? "symbol"} ${local.name}${local.complexity != null ? `, cx ${local.complexity}` : ""})` : ""}` };
  }
  return { kind: "none", why: "nothing is exported from this file — a test would have to reach its callers instead" };
}

/** `export default function X` · `export default class X` · `export default X;` → X. */
export function defaultExportName(srcLines: string[] | null): { name: string; line: number } | null {
  if (!srcLines) return null;
  for (let i = 0; i < srcLines.length; i++) {
    const m = srcLines[i].match(/^\s*export\s+default\s+(?:async\s+)?(?:function\s*\*?\s*|class\s+)?([A-Za-z_$][\w$]*)?/);
    if (m && /^\s*export\s+default\b/.test(srcLines[i])) {
      const name = m[1] && !["function", "class", "async"].includes(m[1]) ? m[1] : "";
      return { name, line: i + 1 };
    }
  }
  return null;
}

// ── nested loops: a partition walk is linear, not N×N ─────────────────────────────────────────

export type LoopNest = { outerLine: number; innerLine: number; outerHead: string; innerHead: string; partition: boolean };

/** Every inner loop under an outer loop inside [start, end]. `partition` is true when the inner
 *  loop iterates something bound BY the outer loop's own element (`for (const [k, rows] of m)` →
 *  `for (const r of rows)`): that is one pass over the data, not a product. */
export function nestedLoops(srcLines: string[] | null, start: number | null | undefined, end: number | null | undefined): LoopNest[] {
  if (!srcLines || !start) return [];
  const lo = start, hi = Math.min(srcLines.length, end ?? start + 300);
  const loopRe = /^(\s*)(?:for\s*(?:await\s*)?\(|while\s*\(|do\b|\S.*\.(?:forEach|map|flatMap|filter|reduce|some|every)\s*\()/;
  const heads: { ln: number; ind: number; text: string }[] = [];
  for (let ln = lo; ln <= hi; ln++) {
    const t = srcLines[ln - 1] ?? "";
    const m = t.match(loopRe);
    if (m) heads.push({ ln, ind: m[1].length, text: t.trim().slice(0, 90) });
  }
  const out: LoopNest[] = [];
  for (let i = 0; i < heads.length; i++) {
    const outer = heads[i];
    const outerEnd = blockEnd(srcLines, outer.ln, hi, outer.ind);
    const bound = boundNames(outer.text);
    for (let j = i + 1; j < heads.length; j++) {
      const inner = heads[j];
      if (inner.ln > outerEnd) break;
      if (inner.ind <= outer.ind) continue;
      const iter = iteratedName(inner.text);
      out.push({ outerLine: outer.ln, innerLine: inner.ln, outerHead: outer.text, innerHead: inner.text, partition: iter != null && bound.has(iter) });
    }
  }
  return out;
}

/** The names a loop head binds: `for (const [k, rows] of …)` → {k, rows}; `for (const r of …)` → {r}. */
function boundNames(head: string): Set<string> {
  const m = head.match(/for\s*(?:await\s*)?\(\s*(?:const|let|var)\s+([^=]+?)\s+(?:of|in)\s/);
  const names = new Set<string>();
  if (m) for (const n of m[1].replace(/[[\]{}]/g, " ").split(/[\s,]+/)) if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
  const cb = head.match(/\.(?:forEach|map|flatMap|filter|reduce|some|every)\s*\(\s*(?:async\s*)?\(?\s*([A-Za-z_$][\w$]*)/);
  if (cb) names.add(cb[1]);
  return names;
}

/** What a loop head iterates: `for (… of X)` → X; `X.forEach(` → X (root identifier). */
function iteratedName(head: string): string | null {
  const m = head.match(/\s(?:of|in)\s+([A-Za-z_$][\w$]*)/);
  if (m) return m[1];
  const cb = head.match(/^([A-Za-z_$][\w$]*)(?:\.[\w$]+)*\.(?:forEach|map|flatMap|filter|reduce|some|every)\s*\(/);
  return cb ? cb[1] : null;
}

/** The last line of the block opened at `ln` (by indentation — the first later line indented
 *  at or under the head's level, minus one). */
function blockEnd(srcLines: string[], ln: number, hi: number, ind: number): number {
  for (let k = ln + 1; k <= hi; k++) {
    const t = srcLines[k - 1] ?? "";
    if (!t.trim()) continue;
    const kInd = t.match(/^(\s*)/)![1].length;
    if (kInd <= ind && /^\s*[}\])]/.test(t) === false && k > ln + 1) return k - 1;
    if (kInd < ind) return k - 1;
  }
  return hi;
}

/** The sentence "beyond the lines" prints for nested loops — honest about the shape. */
export function nestedLoopsNote(nests: LoopNest[]): string | null {
  if (!nests.length) return null;
  const products = nests.filter((n) => !n.partition);
  if (!products.length) {
    const n = nests[0];
    return `${nests.length} loop${nests.length === 1 ? "" : "s"} inside loops — but the inner loop walks the outer element's own items (L${n.outerLine} → L${n.innerLine}): that is one pass over the data, not N×N. No lookup table needed; the cost here is reading depth, not time.`;
  }
  const n = products[0];
  return `${products.length} loop${products.length === 1 ? "" : "s"} inside loops over independent collections (L${n.outerLine} → L${n.innerLine}). If both range over the same data that is N×N — 1,000 items → 1,000,000 inner passes. Fix: put one side in a Map first — the inner loop becomes a single lookup.`;
}

// ── the dense region: where the nesting actually is ──────────────────────────────────────────

export type Region = { start: number; end: number; head: string; kind: "loop" | "switch" | "branch" | "block" };

/** The innermost loop/switch/if enclosing `line` inside [start, end] — the region a structure
 *  exhibit should show. The judge's `max_nesting_line` sits inside it; the block's top-level
 *  arms may be somewhere else entirely. */
export function enclosingRegion(srcLines: string[] | null, line: number | null | undefined, start: number | null | undefined, end: number | null | undefined): Region | null {
  if (!srcLines || !line || !start) return null;
  const hi = Math.min(srcLines.length, end ?? start + 300);
  const target = srcLines[line - 1] ?? "";
  const tInd = target.match(/^(\s*)/)![1].length;
  // walk up to the nearest shallower head
  for (let ln = line - 1; ln > start; ln--) {
    const t = srcLines[ln - 1] ?? "";
    if (!t.trim()) continue;
    const ind = t.match(/^(\s*)/)![1].length;
    if (ind >= tInd) continue;
    const head = t.trim();
    const kind: Region["kind"] | null = /^(for|while|do)\b/.test(head) || /\.(forEach|map|flatMap|filter|reduce)\s*\(/.test(head) ? "loop" : /^switch\b/.test(head) ? "switch" : /^(\}?\s*else\s+if|if|\}\s*else)\b/.test(head) ? "branch" : null;
    if (kind) return { start: ln, end: blockEnd(srcLines, ln, hi, ind), head: head.replace(/\s*\{\s*$/, "").slice(0, 90), kind };
  }
  return null;
}

// ── realistic gains: what one edit can actually recover ──────────────────────────────────────

export const AXIS_WEIGHTS: Record<string, number> = { compliance: 0.25, defects: 0.18, tests: 0.16, structure: 0.15, coupling: 0.12, cohesion: 0.06, change: 0.08 };

export type GainCtx = { facade?: boolean; cycle?: boolean; godFile?: boolean; worstCognitive?: number | null; maxNesting?: number | null };

/** Health points a plan step can honestly claim. The old plan priced every axis at 100 after its
 *  fix; that is only true where the measurement is binary (a test flips `covered`). Structure
 *  keeps its god-file and transitive parts after a split; a facade barely moves the coupling
 *  percentiles; change is history and cannot be edited at all. */
export function realisticGain(ax: string, score: number, ctx: GainCtx = {}): { gain: number; ceiling: number; why: string } {
  const w = AXIS_WEIGHTS[ax] ?? 0.06;
  const deficit = Math.max(0, 100 - score);
  const price = (fraction: number, why: string) => {
    const ceiling = Math.round(score + deficit * fraction);
    return { gain: Math.max(0, Math.round(deficit * fraction * w)), ceiling, why };
  };
  switch (ax) {
    case "tests": return price(1, "coverage is binary — one test that imports the file flips it to covered");
    case "defects": return price(1, "each finding resolved leaves the ledger");
    case "structure": {
      // the split lowers the worst block's cognitive count and nesting; god-file (fan-in × complexity
      // rank) and transitive weight are what remains
      const stays = (ctx.godFile ? 0.25 : 0) + 0.15;
      return price(1 - stays, ctx.godFile ? "splitting the worst block lowers cognitive and nesting; the god-file rank (fan-in × complexity) and transitive weight stay" : "splitting the worst block lowers cognitive and nesting; the transitive weight stays");
    }
    case "coupling":
      if (ctx.cycle) return price(0.6, "breaking the cycle is most of it; the fan percentiles stay");
      if (ctx.facade) return price(0.3, "a facade folds edges but fan-in/fan-out percentiles barely move");
      return { gain: 0, ceiling: score, why: "no cycle and no collapsible cluster — nothing an edit recovers; the rank is where the file sits in this repo" };
    case "cohesion": return price(0.5, "splitting the unconnected groups apart raises it; some cross-links always remain");
    case "change": return { gain: 0, ceiling: score, why: "churn is history — no edit changes it; the test that pins the hotspot lives under `tests`" };
    default: return price(0.5, "half the deficit, by default");
  }
}

/** The assertion line for a test target: a component is rendered, a function is called. */
export function testBody(t: TestTarget, blocks: Block[]): string {
  if (t.kind === "none") return "";
  const b = blocks.find((x) => x.name === t.name);
  const isComponent = b?.kind === "component" || (!b && /^[A-Z]/.test(t.name));
  return isComponent
    ? `test('${t.name} renders its current shape', () => {\n  expect(render(<${t.name} {...typicalProps} />).container).toMatchSnapshot();\n});`
    : `test('${t.name} keeps its current behavior', () => {\n  expect(${t.name}(typicalInput)).toEqual(whatItReturnsToday);\n});`;
}

/** The shortest import path between two files over the neighborhood's import edges (either
 *  direction), or null. A co-change pair with a 2-hop path is not "hidden": the contract is
 *  declared, just not directly. */
export function importPath(edges: { from: string; to: string; kind?: string }[], a: string, b: string, maxHops = 4): string[] | null {
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.kind && e.kind !== "import" && e.kind !== "imports") continue;
    if (!adj.has(e.from)) adj.set(e.from, new Set()); adj.get(e.from)!.add(e.to);
    if (!adj.has(e.to)) adj.set(e.to, new Set()); adj.get(e.to)!.add(e.from);
  }
  const prev = new Map<string, string | null>([[a, null]]);
  let frontier = [a];
  for (let hop = 0; hop < maxHops && frontier.length; hop++) {
    const next: string[] = [];
    for (const x of frontier) for (const y of adj.get(x) ?? []) {
      if (prev.has(y)) continue;
      prev.set(y, x); next.push(y);
      if (y === b) { const path = [b]; let c: string | null = b; while ((c = prev.get(c!) ?? null) != null) path.unshift(c); return path; }
    }
    frontier = next;
  }
  return null;
}

// ── the "+" line for a law comment: the REAL line rewritten when the fix is mechanical ────────

/** For laws whose fix is a token swap, the after-line is the source line itself, rewritten —
 *  `kind == X` → `kind === X` — not a generic `if (a === b) …`. Returns null when the fix is a
 *  judgement call (then the law's own example/fix text is shown). */
export function rewriteLine(lawKey: string, line: string): string | null {
  const t = line.trimEnd();
  switch (lawKey) {
    case "no-loose-equality": {
      const r = t.replace(/([^=!<>])==(?!=)/g, "$1===").replace(/!=(?!=)/g, "!==");
      return r === t ? null : r;
    }
    case "no-var": return /\bvar\b/.test(t) ? t.replace(/\bvar\b/, "let") + "   // or const when never reassigned" : null;
    case "no-debugger": return /\bdebugger\b/.test(t) ? t.replace(/\s*debugger;?/, "") || "// (debugger removed)" : null;
    case "js-no-console": return /console\.(log|debug)\s*\(/.test(t) ? `// ${t.trim()}   ← remove, or route through the project logger` : null;
    case "ts-no-ts-ignore": return /@ts-ignore/.test(t) ? t.replace(/@ts-ignore/, "@ts-expect-error TODO: why") : null;
    case "ts-no-any": return /:\s*any\b/.test(t) ? t.replace(/:\s*any\b/, ": unknown") + "   // then narrow at the use site" : null;
    default: return null;
  }
}

/** Follow a single dominant arm (≥ `share` of the body) down into its own arms, up to `depth`
 *  levels: a function that is one `switch` with 600 lines of cases exhibits the cases, not
 *  "one switch arm → its own function". */
export function descendDominant<A extends { ln: number; to: number; text: string }>(srcLines: string[] | null, arms: A[] | null, harvest: (start: number, end: number) => A[] | null, share = 0.8, depth = 3): A[] | null {
  let cur = arms;
  for (let d = 0; d < depth && cur && cur.length; d++) {
    const total = cur.reduce((a, x) => a + (x.to - x.ln + 1), 0) || 1;
    const big = [...cur].sort((x, y) => (y.to - y.ln) - (x.to - x.ln))[0];
    if ((big.to - big.ln + 1) / total < share) return cur;
    if (!/^(switch|if|for|while|\}?\s*else)/.test(big.text)) return cur;
    const inner = harvest(big.ln, big.to);
    if (!inner || inner.length < 2) return cur;
    cur = inner;
  }
  return cur;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
