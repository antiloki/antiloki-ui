// The folder paper's READINGS — the pure functions that turn measurements into the labels the
// paper prints. Split out of atlas-decorators.tsx (2026-09-12) so each rule is a unit-testable
// function with its predicate visible, not a ternary buried in 1900 lines of JSX.
//
// Every function here follows the paper's own ladder: measurement → observation → classification,
// and returns the rule text alongside the label so the page can print "no adjectives without
// predicates" honestly.

// ── composition ────────────────────────────────────────────────────────────────────────────────

export type DefKind = "comp" | "hook" | "cls" | "fn" | "data";

/** The atlas def kinds, bucketed for the composition census. `const`/`type` are DATA — they
 *  describe the module's surface but are not code, so they leave the profile denominator. */
export function kindOf(n: { type?: string; name?: string }): DefKind {
  const t = String(n.type ?? "");
  if (t === "component") return "comp";
  if (t === "hook" || /^use[A-Z0-9]/.test(String(n.name ?? ""))) return "hook";
  if (t === "class" || t === "method") return "cls";
  if (t === "const" || t === "type") return "data";
  return "fn";
}

export type CompCounts = Record<DefKind, number>;

export function emptyCounts(): CompCounts {
  return { comp: 0, hook: 0, cls: 0, fn: 0, data: 0 };
}

/** The folder's profile from its code defs (data excluded). Thresholds printed in the label. */
export function profileOf(c: CompCounts): string {
  const code = c.comp + c.hook + c.cls + c.fn;
  if (code === 0) return c.data > 0 ? "a data surface (constants and types only)" : "empty (no definitions)";
  if ((c.comp + c.hook) / code >= 0.5) return "a presentation layer (≥50% components + hooks)";
  if (c.cls / code >= 0.5) return "an object-oriented core (≥50% classes + methods)";
  if (c.fn / code >= 0.6) return "a procedural library (≥60% plain functions)";
  return "a mixed workshop (no kind reaches 50%)";
}

// ── the heaviest charge (the case exhibit) ─────────────────────────────────────────────────────

/** The judge's weights — mirrored so the exhibit's cost is on the health scale. */
export const AXIS_WEIGHTS: Record<string, number> = { compliance: 0.25, defects: 0.18, tests: 0.16, structure: 0.15, coupling: 0.12, cohesion: 0.06, change: 0.08 };

export type Axes = Record<string, { score: number; parts?: Record<string, unknown> } | null | undefined>;
export type Viol = { law_key: string; line?: number | null; weight?: number; confidence?: number; severity?: string; evidence?: string };

export type Charge =
  | { kind: "law"; law_key: string; hits: number; cost: number; v: Viol }
  | { kind: "axis"; ax: string; score: number; cost: number; parts: Record<string, unknown>; line: number | null; block: string | null; because: string; fix: string };

/** The one thing that costs a file the most health — a law's penalty OR a weak axis — on one
 *  scale: health points lost, i.e. (100 − axisScore) × weight / Σ present weights. A law's cost
 *  is its compliance penalty scaled the same way. Compliance itself is never an "axis charge":
 *  its content is the laws. */
export function pickCharge(vios: Viol[], axes: Axes | undefined): Charge | null {
  return rankCharges(vios, axes)[0] ?? null;
}

/** The heaviest charge that can be SHOWN in the source: a law with a line, or an axis whose
 *  measurement points at a block (structure's worst block). tests/coupling/change are whole-file
 *  facts about the graph or the history — real charges, but no line to open. */
export function pickExhibit(vios: Viol[], axes: Axes | undefined): Charge | null {
  // a charge worth under 2 health points is not an exhibit — showing a healthy block as "the
  // heaviest charge" would be the paper inventing a case
  return rankCharges(vios, axes).find((c) => c.cost >= EXHIBIT_MIN_COST && (c.kind === "law" ? c.v.line != null : c.line != null)) ?? null;
}

/** Below this many health points a charge is not worth a code exhibit. */
export const EXHIBIT_MIN_COST = 2;

/** Every charge against a file, heaviest first, on one scale (health points). */
export function rankCharges(vios: Viol[], axes: Axes | undefined): Charge[] {
  const present = Object.keys(AXIS_WEIGHTS).filter((ax) => axes?.[ax]?.score != null);
  const wSum = present.reduce((a, ax) => a + AXIS_WEIGHTS[ax], 0) || 1;
  const charges: Charge[] = [];
  // laws: one charge per law, cost = its share of the compliance penalty on the health scale
  const byLaw = new Map<string, Viol[]>();
  for (const v of vios) { if (!byLaw.has(v.law_key)) byLaw.set(v.law_key, []); byLaw.get(v.law_key)!.push(v); }
  for (const [law_key, list] of byLaw) {
    const penalty = list.reduce((a, v) => a + Math.round((v.weight ?? 1) * (v.confidence ?? 1)), 0);
    const withLine = list.filter((v) => v.line != null);
    const v = [...(withLine.length ? withLine : list)].sort((a, b) => (b.weight ?? 1) * (b.confidence ?? 1) - (a.weight ?? 1) * (a.confidence ?? 1))[0];
    charges.push({ kind: "law", law_key, hits: list.length, cost: Math.min(90, penalty) * (AXIS_WEIGHTS.compliance / wSum), v });
  }
  // axes: every engineering axis below 100
  for (const ax of present) {
    if (ax === "compliance") continue;
    const a = axes![ax]!;
    const cost = (100 - a.score) * (AXIS_WEIGHTS[ax] / wSum);
    if (cost <= 0) continue;
    const parts = (a.parts ?? {}) as Record<string, unknown>;
    charges.push({ kind: "axis", ax, score: a.score, cost, parts, line: axisLine(ax, parts), block: axisBlock(ax, parts), because: axisBecause(ax, parts), fix: axisFix(ax, parts) });
  }
  charges.sort((x, y) => y.cost - x.cost);
  return charges;
}

function num(v: unknown): number | null { return typeof v === "number" && Number.isFinite(v) ? v : null; }

function axisLine(ax: string, p: Record<string, unknown>): number | null {
  if (ax === "structure") return num(p.worst_line) ?? num(p.max_nesting_line);
  return null;
}
function axisBlock(ax: string, p: Record<string, unknown>): string | null {
  if (ax === "structure" && typeof p.worst_block === "string") return p.worst_block;
  return null;
}

/** The measurement behind the axis, in the axis's own vocabulary. */
export function axisBecause(ax: string, p: Record<string, unknown>): string {
  switch (ax) {
    case "structure": {
      const bits: string[] = [];
      if (num(p.worst_cognitive) != null) bits.push(`cognitive ${p.worst_cognitive}`);
      if (num(p.max_nesting) != null) bits.push(`max nesting ${p.max_nesting}`);
      if (num(p.nested_loops)) bits.push(`${p.nested_loops} nested loop${p.nested_loops === 1 ? "" : "s"}`);
      if (p.god_file) bits.push("god-file (top decile of fan-in AND complexity)");
      return bits.length ? bits.join(", ") : "structural complexity above the cohort";
    }
    case "tests": {
      const basis = typeof p.basis === "string" ? p.basis : "static-import";
      return p.covered ? "covered" : `uncovered (${basis}) with fan-in in the ${Math.round((num(p.pct_fan_in) ?? 0) * 100)}th percentile`;
    }
    case "coupling": return `fan-in p${Math.round((num(p.pct_fan_in) ?? 0) * 100)} · fan-out p${Math.round((num(p.pct_fan_out) ?? 0) * 100)}${p.cycle ? " · in an import cycle" : ""}`;
    case "cohesion": return `${Math.round((num(p.connected_ratio) ?? 0) * 100)}% of the file's definitions call or render one another`;
    case "change": return `churn ${p.churn ?? "—"} (p${Math.round((num(p.pct_churn) ?? 0) * 100)}) on complexity p${Math.round((num(p.pct_complexity) ?? 0) * 100)}`;
    case "defects": return `${p.findings ?? 0} finding${p.findings === 1 ? "" : "s"}${p.high ? `, ${p.high} high` : ""}`;
    default: return "below the cohort";
  }
}

/** The move that pays, keyed by the part that dominates. */
export function axisFix(ax: string, p: Record<string, unknown>): string {
  switch (ax) {
    case "structure":
      if ((num(p.max_nesting) ?? 0) >= 4 || (num(p.nested_loops) ?? 0) >= 2) return `split ${typeof p.worst_block === "string" ? `\`${p.worst_block}\`` : "the worst block"} at its deepest loop — one helper per pass drops nesting below 3 and the cognitive score with it`;
      if ((num(p.worst_cognitive) ?? 0) >= 15) return `extract the branches of ${typeof p.worst_block === "string" ? `\`${p.worst_block}\`` : "the worst block"} into named helpers until no block scores above 15`;
      if (p.god_file) return "move the least-related exports out — a god-file is a change magnet by fan-in, not by size";
      return "flatten the deepest block";
    case "tests": return p.covered ? "keep the test importing it" : "a test that imports this file directly — static analysis needs the import to see the coverage";
    case "coupling": return "cut the widest fan-out import (the one used least) or move the file toward the layer that imports it";
    case "cohesion": return "split the file along its two unconnected groups of definitions";
    case "change": return "stabilise the interface before the next change — churn on complexity is where regressions land";
    case "defects": return "resolve the high findings first";
    default: return "raise the axis";
  }
}

// ── the boundary, layering-aware ──────────────────────────────────────────────────────────────

export type TargetClass = "shared" | "sibling" | "app";

const SHARED_RE = /(^|\/)(lib|libs|shared|common|core|utils?|helpers?|types|hooks|packages|api|services?|store|stores|config|constants)(\/|$)/i;

/** Where an outbound edge lands, relative to the folder: a SHARED layer (by name, or because ≥3
 *  distinct top-level folders import into it — measured), a SIBLING under the same parent, or
 *  elsewhere in the app. */
export function classifyTarget(dir: string, target: string, importerFoldersOf: (folder: string) => number): TargetClass {
  const parent = dir.split("/").slice(0, -1).join("/");
  const tdir = target.split("/").slice(0, -1).join("/");
  if (SHARED_RE.test(tdir) || SHARED_RE.test(target.split("/").slice(0, 2).join("/"))) return "shared";
  if (importerFoldersOf(tdir) >= 3) return "shared";
  if (parent && tdir.startsWith(parent + "/") && tdir !== dir) return "sibling";
  if (!parent && !tdir.includes("/")) return "sibling";
  return "app";
}

export type BoundaryInput = {
  internal: number; inbound: number;
  outShared: number; outSibling: number; outApp: number;
  /** a sibling folder both imports this folder and is imported by it */
  mutualSibling: boolean;
};

export type BoundaryReading = { label: "sealed" | "layered" | "tangled" | "leaky" | "unmeasured"; cohesion: number | null; text: string; rule: string; observation: string };

/** measurement → observation → classification, direction-aware. A UI folder whose outbound edges
 *  all go DOWN to shared layers is layered, not leaky: that is the correct direction of
 *  dependency. Leakage is wiring that crosses to siblings or back up into the app. */
export function boundaryReading(b: BoundaryInput | null): BoundaryReading {
  const rule = "sealed: internal ≥60% · layered: ≥70% of outbound goes to shared layers and no sibling imports back · tangled: ≥30% of outbound to siblings, or a mutual sibling import · leaky: otherwise <50%";
  if (!b) return { label: "unmeasured", cohesion: null, text: "unmeasured", rule, observation: "the atlas was unavailable" };
  const out = b.outShared + b.outSibling + b.outApp;
  const touching = b.internal + b.inbound + out;
  const cohesion = touching ? Math.round((b.internal / touching) * 100) : null;
  const downward = out ? b.outShared / out : 0;
  const toSiblings = out ? b.outSibling / out : 0;
  const observation = out
    ? `${Math.round(downward * 100)}% of outbound goes down to shared layers, ${Math.round(toSiblings * 100)}% to siblings, ${Math.round(((b.outApp) / out) * 100)}% elsewhere`
    : "no outbound wiring";
  if (cohesion == null) return { label: "unmeasured", cohesion, text: "unmeasured", rule, observation };
  if (cohesion >= 60) return { label: "sealed", cohesion, text: `sealed · cohesion ${cohesion}%`, rule, observation };
  if (toSiblings >= 0.3 || b.mutualSibling) return { label: "tangled", cohesion, text: `tangled · cohesion ${cohesion}%, ${Math.round(toSiblings * 100)}% of outbound to siblings${b.mutualSibling ? ", mutual import" : ""}`, rule, observation };
  if (downward >= 0.7) return { label: "layered", cohesion, text: `layered · cohesion ${cohesion}%, ${Math.round(downward * 100)}% of outbound goes down to shared layers`, rule, observation };
  if (cohesion >= 50) return { label: "layered", cohesion, text: `firm · cohesion ${cohesion}%`, rule, observation };
  return { label: "leaky", cohesion, text: `leaky · cohesion ${cohesion}%`, rule, observation };
}

// ── the trajectory ─────────────────────────────────────────────────────────────────────────────

export type Regression = {
  prev_snapshot_id: number; health_delta: number | null;
  new?: unknown[]; fixed?: unknown[];
  comparable?: boolean; prev_engineering_version?: string | null; laws_changed?: boolean;
} | null | undefined;

export type TrajectoryReading = { text: string; detail: string; tone: "ok" | "bad" | "muted" | "dim"; kind: "none" | "reset" | "drift" | "improving" | "regressing" | "holding" };

/** A delta is a regression only when the two snapshots were judged by the same laws AND the same
 *  instrument. A small delta with no law change is the cohort moving under a percentile axis. */
export function trajectoryReading(reg: Regression, curVersion?: string | null): TrajectoryReading {
  if (!reg || reg.health_delta == null) return { text: "— needs a second snapshot", detail: "no earlier snapshot judged this folder", tone: "dim", kind: "none" };
  const d = reg.health_delta;
  const signed = `${d >= 0 ? "+" : ""}${d}`;
  if (reg.comparable === false) {
    const why = reg.laws_changed ? "the laws changed" : `the instrument changed (${reg.prev_engineering_version ?? "pre-versioned"} → ${curVersion ?? "?"})`;
    return { text: `baseline reset — ${why}; ${signed} since #${reg.prev_snapshot_id} is not comparable`, detail: `${why} between #${reg.prev_snapshot_id} and this snapshot, so ${signed} is not a trend`, tone: "muted", kind: "reset" };
  }
  const lawMoves = (reg.new?.length ?? 0) + (reg.fixed?.length ?? 0);
  if (Math.abs(d) <= 2 && lawMoves === 0) return { text: `holding (${signed} is cohort drift — percentile axes moved, no law changed)`, detail: `${signed} since #${reg.prev_snapshot_id} with no law change`, tone: "muted", kind: "drift" };
  if (d > 0) return { text: `improving (+${d} since #${reg.prev_snapshot_id})`, detail: `+${d} since #${reg.prev_snapshot_id}`, tone: "ok", kind: "improving" };
  if (d < 0) return { text: `regressing (${d} since #${reg.prev_snapshot_id})`, detail: `${d} since #${reg.prev_snapshot_id}`, tone: "bad", kind: "regressing" };
  return { text: "holding", detail: `no change since #${reg.prev_snapshot_id}`, tone: "muted", kind: "holding" };
}

// ── the roster and the tests basis ─────────────────────────────────────────────────────────────

export type Roster = { total: number; logic: number; glue: number; test: number; unknown: number; carried: number } | null | undefined;

export function rosterLine(r: Roster, snapId?: number | null): string {
  if (!r) return "—";
  const bits = [`${r.logic} logic`, `${r.glue} glue`];
  if (r.test) bits.push(`${r.test} test`);
  if (r.unknown) bits.push(`${r.unknown} unknown`);
  if (r.carried) bits.push(`${r.carried} law result${r.carried === 1 ? "" : "s"} carried forward (unchanged content)`);
  return bits.join(" · ");
}

export const GLUE_RULE = "glue = a file with no logic definitions (a barrel, constants, types); scored on laws + defects only — the five engineering axes do not apply, so a clean one lands at 100";

/** What the tests axis can honestly say. */
export function testsAxisNote(basis: string | null | undefined, score: number | null | undefined): { measured: boolean; text: string } {
  if (!basis || basis === "unmeasured") return { measured: false, text: "The tests axis is unmeasured — no test file in the atlas imports a member and no coverage report was read; health excludes it (weights renormalised). Rule: covered = a test file imports the source (static) or lcov reports a hit." };
  if (basis === "inline") return { measured: true, text: `The tests axis (${score ?? "—"}) reads inline test modules (#[cfg(test)]) — a file carrying its own tests covers itself.` };
  if (basis === "mixed") return { measured: true, text: `The tests axis (${score ?? "—"}) mixes instruments across members (static imports and inline tests).` };
  return { measured: true, text: `The tests axis (${score ?? "—"}) is static: covered = a test file imports the source. An e2e spec that drives a URL imports nothing, so it cannot be attributed — run coverage to measure it.` };
}
