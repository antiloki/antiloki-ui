// VIRTUAL decorators — deterministic doc-cards for code blocks, derived from the AST and NEVER written
// to source. They overlay the read-only editor (above each block), pop up on a diagram node click, and
// compose into a whole-codebase documentation (DocsView). The card is 100% deterministic; [explain] is
// the optional AI enrichment for a single block. See .antiloki/skills/codebase/code-decorate.mjs.
import React from "react";
import { apiPost } from "@/loki/api/client";
import { startNarrationJob, armAudio, subscribeNarration as subNarr, getPlayback as narrPlayback, getNarrationJob as narrJob } from "@/loki/widgets/narration-jobs";

import { C, mono } from "@/loki/theme";
import { explainSnippet, fileRead, decorateFile, regenerateBlock, regenerateStage, regenerateMerge, getAtlas } from "@/loki/api/codebase";
import type { Decorator } from "@/loki/api/codebase";
import { DocsSiteOverlay, Dashboard as DocsSiteDashboard, getDocsSiteCached } from "./docs-site";
import { TokLine } from "./highlight";
import { FileReviewHistoryTab } from "./file-review-history-tab";
import { feedbackText, planText, copyText } from "./file-review-copy";
import { ExportButtons } from "@/loki/util/export-view";
import { kindOf as paperKindOf, emptyCounts, profileOf, pickCharge, pickExhibit, classifyTarget, boundaryReading, trajectoryReading, rosterLine, GLUE_RULE, testsAxisNote } from "./atlas-folder-paper";
import type { Charge } from "./atlas-folder-paper";
import { SoonInline } from "@/loki/components/soon-blur";
import { devOnly } from "@/loki/dev-only";
import { pickTestTarget, testBody, nestedLoops, nestedLoopsNote, enclosingRegion, realisticGain, ordinal, importPath, rewriteLine, descendDominant } from "./atlas-file-fixes";

// the CINEMATIC video-class player (class-cinema is a leaf module — lazy keeps it off the initial
// chunk since the paper only needs it when ▶ is pressed).
const CinematicPlayerLazy = React.lazy(() => import("./class-cinema").then((m) => ({ default: m.CinematicPlayer })));

// ─── CONSTITUTION, per block & per file ──────────────────────────────────────
// The engineering analysis lives WITH the code (operator 2026-07-17: "analyzed
// per block of code, just like docs — part of the docs blocks"). The file
// overview sits atop the docs; each block carries the laws IT breaks + its own
// compliance (mirrors the judge: 100 − Σ round(weight×confidence), capped @90).
const AXES = ["compliance", "defects", "tests", "structure", "coupling", "cohesion", "change"] as const;
/** What each axis measures — the "why not 100" line of the docked review (plain words, one clause). */
export const AXIS_HINT: Record<string, string> = {
  compliance: "the laws this file breaks",
  defects: "smells and likely bugs found in the code",
  tests: "how much of it the tests reach",
  structure: "size, nesting and complexity of its blocks",
  coupling: "how many files depend on it and it on them",
  cohesion: "whether its parts belong together",
  change: "how often and by how many hands it changes",
};

export type BlockCon = { score: number; violations: { law_key: string; line: number | null; severity: string; law_scope?: string; title?: string; fix?: string }[] };
export type FileCon = {
  found?: boolean; path?: string; health?: number | null; score?: number | null; archetype?: string;
  axes?: Record<string, { score: number } | null>;
  signals?: { loc?: number; complexity?: number; fan_in?: number; fan_out?: number; transitive?: number; covered?: boolean | null; churn?: number; authors?: number };
  neighborhood?: { pct_repo?: number | null; pct_folder?: number | null };
  violations?: FileConViolation[];
  categories?: { category: string; violations: number; score: number }[];
  peers?: Record<string, { files: number; top: { path: string; n: number }[] }>;
  history?: { snapshot_id: number; created_at?: string; health: number | null; score: number | null; axes?: Record<string, number> | null; files?: number | null; engineering_version?: string | null }[];
  anchors?: { importers: string[]; imports: string[]; findings: { line?: number | null; text: string }[] };
  is_folder?: boolean; files?: number;
  // every member of the folder (risk desc), each with how it was scored — `archetype` says whether the
  // five engineering axes applied (logic) or only laws + defects (glue); `axes` carries the parts
  members?: { path: string; health: number | null; score: number | null; risk?: number | null; archetype?: string | null; cached?: number | null; loc?: number | null; complexity?: number | null; fan_in?: number | null; fan_out?: number | null; covered?: number | null; churn?: number | null; axes?: Record<string, { score: number; parts?: Record<string, unknown> } | null> }[];
  members_truncated?: boolean;
  roster?: { total: number; logic: number; glue: number; test: number; unknown: number; carried: number } | null;
  health_logic?: number | null;           // the mean over `logic` members — the number the roster's axes actually describe
  tests_basis?: string | null;            // static-import | inline | lcov | mixed | unmeasured
  engineering_version?: string | null;    // the instrument revision this snapshot was judged by
  blocks?: NbBlock[]; // per-block SELF vs NEIGHBORHOOD (interaction outranks isolation)
  // THE RATCHET — vs the previous snapshot: what grew, what got fixed, did it regress
  regression?: { prev_snapshot_id: number; prev_created_at?: string; new: { law_key: string; title?: string; count: number; lines?: number[] }[]; fixed: { law_key: string; title?: string; count: number }[]; health_delta: number | null; score_delta: number | null; regressed: boolean; comparable?: boolean; prev_engineering_version?: string | null; laws_changed?: boolean } | null;
};
export type NbBlock = { name: string; line: number; self: number; neigh: number | null; final: number; in: number; out: number; cyc?: number };
type Target = { file?: string; line?: number | null; code?: string; note?: string };
export type FileConViolation = {
  law_key: string; path?: string; line?: number | null; symbol?: string | null; severity: string; law_scope?: string;
  weight?: number; confidence?: number; evidence?: string;
  title?: string; rule_md?: string; category?: string; fix?: string; // the complete dossier (server-enriched)
  example?: { bad: string; good: string } | null;                    // before → after
};
const catTone = (v: number | null | undefined) => conTone(v);
const SEV_TONE: Record<string, string> = { critical: C.bad, error: C.bad, warn: C.warn, info: C.dim };
export const conTone = (v: number | null | undefined) => v == null ? C.dim : v >= 85 ? C.ok : v >= 60 ? C.warn : C.bad;
const pctTxt = (p: number | null | undefined) => (p == null ? "—" : `${Math.round(p * 100)}th`);

// ── THE AXES, split by WHAT they measure. CODE axes decompose to a single
// function/class (compliance · defects · structure) — a block IS scored on
// these, in isolation. CONTEXT axes are properties of the whole FILE (is it
// tested? a coupling hub? churny? one author?) — they can't belong to a block.
// That split is why a file of clean blocks (90+) can still be a 65: the code is
// good, the file's context isn't.
const AXIS_W: Record<string, number> = { compliance: 0.25, defects: 0.18, tests: 0.16, structure: 0.15, coupling: 0.12, cohesion: 0.06, change: 0.08 };
const AXIS_GROUP: Record<string, "code" | "context"> = { compliance: "code", defects: "code", structure: "code", tests: "context", coupling: "context", cohesion: "context", change: "context" };
const AXIS_KIND: Record<string, "law" | "measured"> = { compliance: "law", defects: "measured", tests: "measured", structure: "measured", coupling: "measured", cohesion: "measured", change: "measured" };
export const CODE_AXES = ["compliance", "defects", "structure"] as const;
export const CONTEXT_AXES = ["tests", "coupling", "cohesion", "change"] as const;
function groupScore(con: FileCon, group: "code" | "context"): number | null {
  let sum = 0, w = 0;
  for (const ax of AXES) if (AXIS_GROUP[ax] === group) { const s = con.axes?.[ax]?.score; if (s != null) { sum += s * AXIS_W[ax]; w += AXIS_W[ax]; } }
  return w > 0 ? Math.round(sum / w) : null;
}

// per-block compliance from the block's own violations — SAME formula as the file judge.
function blockScore(vs: { weight?: number; confidence?: number }[]): number {
  const penalty = vs.reduce((a, v) => a + Math.round((v.weight ?? 1) * (v.confidence ?? 1)), 0);
  return Math.max(10, 100 - Math.min(90, penalty));
}
// a block, analyzed IN ISOLATION on the code axes that decompose to it:
//   compliance — the laws it breaks · structure — its complexity + size.
export type BlockAxes = { compliance: number; structure: number | null; health: number; cx: number | null; loc: number | null };
export function blockAxes(d: Decorator, con: BlockCon | undefined): BlockAxes {
  const compliance = con ? con.score : 100;
  const cx = d.complexity ?? null;
  const loc = d.end_line != null ? d.end_line - d.line + 1 : null;
  const structure = (cx == null && loc == null) ? null
    : Math.max(0, Math.min(100, Math.round(100 - Math.max(0, (cx ?? 0) - 4) * 7 - Math.max(0, (loc ?? 0) - 50) * 0.3)));
  // weighted blend of the code axes that apply (compliance always; structure when known)
  const parts: [number, number][] = [[compliance, AXIS_W.compliance]];
  if (structure != null) parts.push([structure, AXIS_W.structure]);
  const w = parts.reduce((a, [, x]) => a + x, 0);
  const health = w > 0 ? Math.round(parts.reduce((a, [s, x]) => a + s * x, 0) / w) : compliance;
  return { compliance, structure, health, cx, loc };
}
// bucket a file's violations into each decorator by line-range containment (symbol name as fallback).
export function bucketConstitution(decs: Decorator[], file: FileCon | null): Map<number, BlockCon> {
  const m = new Map<number, BlockCon>();
  if (!file?.violations?.length) return m;
  for (const d of decs) {
    const lo = d.line, hi = d.end_line ?? d.line;
    const vs = file.violations.filter((v) => (v.line != null && v.line >= lo && v.line <= hi) || (v.symbol && v.symbol === d.name));
    if (vs.length) m.set(d.line, { score: blockScore(vs), violations: vs.map((v) => ({ law_key: v.law_key, line: v.line ?? null, severity: v.severity, law_scope: v.law_scope, title: v.title, fix: v.fix })) });
  }
  return m;
}
// the AI-call window (⌘-openable) for a per-file constitution fetch.
export async function fetchFileCon(path: string): Promise<FileCon | null> {
  // Keep the found:false object too — it carries the reason (doc_md: "rebuild to generate the review").
  // conActive still gates on .found, so the constitution UI stays off; only the score badge uses the reason.
  try { const r: any = await apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.file", input: { path } }); const d = r?.result?.result ?? r?.result ?? r; return d?.path != null ? d : null; }
  catch { return null; }
}

// ─── VIOLATION STRIP — the doc-block for a WRONG line (operator 2026-07-18:
// "each incorrect line should get the doc block above, focused on the law
// violation — very complete info"). Collapsed: a severity-toned one-liner above
// the exact line. Expanded: the full dossier — the law (title · key · rule), its
// concern + severity + weight×confidence penalty, the matched evidence, and the
// concrete suggested fix. [select line] bridges to the editor toolbar
// (explain · regenerate · edit) for acting on it.
/** THE FILE DOSSIER (operator 2026-09-19: "the chat knows every info of X-ray"): one file's (or folder's)
 *  review as a deterministic markdown page for the screen manifest — health, archetype, every axis with
 *  the points it costs, the signals, the neighborhood, the violations (law · line · fix), the ratchet,
 *  the members of a folder. Numbers the chat can quote, nothing it has to guess. */
export function fileDossier(con: FileCon): string {
  const L: string[] = [];
  const kind = con.is_folder ? "folder" : "file";
  L.push(`${kind} ${con.path ?? "?"} — health ${con.health ?? "—"}${con.score != null ? ` · score ${con.score}` : ""}${con.archetype ? ` · archetype ${con.archetype}` : ""}${con.is_folder && con.files != null ? ` · ${con.files} files` : ""}${con.engineering_version ? ` · judged by ${con.engineering_version}` : ""}`);
  const axes = Object.entries(con.axes ?? {}).filter(([, a]) => a).map(([k, a]) => ({ k, s: a!.score })).sort((a, b) => a.s - b.s);
  if (axes.length) L.push(`axes: ${axes.map((a) => `${a.k} ${a.s}${a.s < 100 ? ` (−${100 - a.s}: ${AXIS_HINT[a.k] ?? ""})` : ""}`).join("; ")}`);
  const s = con.signals;
  if (s) L.push(`signals: loc ${s.loc ?? "—"} · complexity ${s.complexity ?? "—"} · fan-in ${s.fan_in ?? "—"} · fan-out ${s.fan_out ?? "—"} · transitive ${s.transitive ?? "—"} · covered ${s.covered == null ? "unknown" : s.covered ? "yes" : "no"} · churn ${s.churn ?? "—"} · authors ${s.authors ?? "—"}${con.tests_basis ? ` · tests basis ${con.tests_basis}` : ""}`);
  if (con.neighborhood && (con.neighborhood.pct_repo != null || con.neighborhood.pct_folder != null)) L.push(`neighborhood: ${pctTxt(con.neighborhood.pct_repo)} pct of the repo · ${pctTxt(con.neighborhood.pct_folder)} pct of its folder`);
  const a = con.anchors;
  if (a && (a.importers?.length || a.imports?.length)) L.push(`imported by ${a.importers?.length ?? 0}${a.importers?.length ? ` (${a.importers.slice(0, 6).join(", ")}${a.importers.length > 6 ? ", …" : ""})` : ""} · imports ${a.imports?.length ?? 0}${a.imports?.length ? ` (${a.imports.slice(0, 6).join(", ")}${a.imports.length > 6 ? ", …" : ""})` : ""}`);
  const vs = con.violations ?? [];
  if (vs.length) {
    L.push(`violations (${vs.length}):`);
    for (const v of vs.slice(0, 14)) L.push(`- ${v.law_key} [${v.severity}]${v.line != null ? ` line ${v.line}` : ""}${v.path && v.path !== con.path ? ` in ${v.path}` : ""}${v.title ? ` — ${v.title}` : ""}${v.fix ? ` · fix: ${v.fix.slice(0, 120)}` : ""}`);
    if (vs.length > 14) L.push(`- … +${vs.length - 14} more`);
  } else if (con.found) L.push("violations: none — the code obeys the constitution");
  const cats = con.categories ?? [];
  if (cats.length) L.push(`by category: ${cats.map((c) => `${c.category} ${c.violations}× (score ${c.score})`).join(", ")}`);
  const r = con.regression;
  if (r) L.push(`vs the previous snapshot #${r.prev_snapshot_id}: health ${r.health_delta == null ? "—" : `${r.health_delta > 0 ? "+" : ""}${r.health_delta}`}${r.regressed ? " · REGRESSED" : ""}${r.new?.length ? ` · new: ${r.new.map((n) => `${n.law_key} ×${n.count}`).join(", ")}` : ""}${r.fixed?.length ? ` · fixed: ${r.fixed.map((n) => `${n.law_key} ×${n.count}`).join(", ")}` : ""}`);
  if (con.is_folder) {
    if (con.roster) L.push(`roster: ${con.roster.total} files — ${con.roster.logic} logic · ${con.roster.glue} glue · ${con.roster.test} test${con.health_logic != null ? ` · logic-only health ${con.health_logic}` : ""}`);
    const ms = (con.members ?? []).slice(0, 12);
    if (ms.length) L.push(`worst members: ${ms.map((m) => `${m.path.split("/").pop()} ${m.health ?? "—"}`).join(", ")}${con.members_truncated ? ", …" : ""}`);
  }
  const hist = (con.history ?? []).slice(-6);
  if (hist.length > 1) L.push(`history: ${hist.map((h) => `#${h.snapshot_id} ${h.health ?? "—"}`).join(" → ")}`);
  return L.join("\n");
}

export function ViolationStrip({ vs, onSelectLine }: { vs: FileConViolation[]; onSelectLine?: () => void }) {
  const [open, setOpen] = React.useState(false);
  const tone = vs.some((v) => SEV_TONE[v.severity] === C.bad) ? C.bad : vs.some((v) => v.severity === "warn") ? C.warn : C.dim;
  if (!open) {
    const first = vs[0];
    return (
      <div onClick={() => setOpen(true)} title="click for the full violation dossier — the law, the evidence, the fix"
        style={{ margin: "2px 0 0 56px", display: "flex", alignItems: "baseline", gap: 6, cursor: "pointer", borderLeft: `2px solid ${tone}`, paddingLeft: 7 }}>
        <span style={{ color: tone, fontSize: 9.5 }}>⚖</span>
        <b style={{ fontFamily: mono, fontSize: 9.5, color: tone }}>{first.title ?? first.law_key}</b>
        {vs.length > 1 && <span style={{ fontFamily: mono, fontSize: 8, color: tone }}>+{vs.length - 1} more</span>}
        <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {first.fix ? `→ ${first.fix}` : first.evidence ?? ""}
        </span>
      </div>
    );
  }
  return (
    <div style={{ margin: "2px 0 2px 56px", borderLeft: `2px solid ${tone}`, background: C.panel2, borderRadius: 4, padding: "6px 10px" }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, cursor: "pointer" }} onClick={() => setOpen(false)}>
        <span style={{ color: tone, fontSize: 10 }}>⚖</span>
        <span style={{ fontFamily: mono, fontSize: 8, color: tone, textTransform: "uppercase", letterSpacing: 0.8 }}>law violation{vs.length > 1 ? `s (${vs.length})` : ""} — this line</span>
        <span style={{ flex: 1 }} />
        {onSelectLine && <button onClick={(e) => { e.stopPropagation(); onSelectLine(); }} title="select the line — the toolbar (explain · regenerate · edit) opens on it"
          style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.brand, borderRadius: 4, padding: "0 6px", cursor: "pointer", fontFamily: mono, fontSize: 8.5 }}>⌖ select line</button>}
        <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, cursor: "pointer" }}>▴</span>
      </div>
      {vs.map((v, i) => {
        const sev = SEV_TONE[v.severity] ?? C.warn;
        const penalty = Math.round((v.weight ?? 1) * (v.confidence ?? 1));
        return (
          <div key={i} style={{ padding: "4px 0", borderTop: i ? `1px solid color-mix(in oklab, ${C.border} 45%, transparent)` : "none" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <b style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{v.title ?? v.law_key}</b>
              <code style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{v.law_key}</code>
              <span style={{ fontFamily: mono, fontSize: 7.5, color: sev, border: `1px solid color-mix(in oklab, ${sev} 45%, ${C.border})`, borderRadius: 2, padding: "0 4px" }}>{v.severity}</span>
              {v.category && <span style={{ fontFamily: mono, fontSize: 7.5, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 2, padding: "0 4px" }}>{v.category}</span>}
              <span style={{ flex: 1 }} />
              <span title={`weight ${v.weight} × confidence ${Math.round((v.confidence ?? 1) * 100)}% — what this costs the file's compliance`} style={{ fontFamily: mono, fontSize: 8, color: sev, fontVariantNumeric: "tabular-nums" }}>−{penalty} · w{v.weight}{v.confidence != null && v.confidence < 1 ? ` ·${Math.round(v.confidence * 100)}%` : ""}</span>
            </div>
            {v.rule_md && <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>{v.rule_md}</div>}
            {v.evidence && (
              <div style={{ marginTop: 3 }}>
                <span style={{ fontFamily: mono, fontSize: 7, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8 }}>evidence{v.line != null ? ` · L${v.line}` : ""}</span>
                <code style={{ display: "block", fontFamily: mono, fontSize: 9, color: sev, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, padding: "2px 6px", marginTop: 1, overflowX: "auto", whiteSpace: "pre" }}>{v.evidence}</code>
              </div>
            )}
            {v.fix && (
              <div style={{ marginTop: 3 }}>
                <span style={{ fontFamily: mono, fontSize: 7, color: C.ok, textTransform: "uppercase", letterSpacing: 0.8 }}>✎ suggested fix</span>
                <div style={{ fontFamily: mono, fontSize: 9.5, color: C.ok, lineHeight: 1.5, marginTop: 1 }}>{v.fix}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AxisRow({ ax, score }: { ax: string; score: number | null | undefined }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", fontFamily: mono, fontSize: 9 }}>
      <span style={{ width: 66, color: C.dim }}>{ax}</span>
      <div style={{ flex: 1, height: 5, background: `color-mix(in oklab, ${C.border} 45%, transparent)`, borderRadius: 3, overflow: "hidden" }}>{score != null && <div style={{ width: `${score}%`, height: "100%", background: conTone(score) }} />}</div>
      <b style={{ width: 20, textAlign: "right", color: score == null ? C.dim : C.fg, fontVariantNumeric: "tabular-nums" }}>{score ?? "n/a"}</b>
    </div>
  );
}

// ─── THE SCORING GUIDE — one "?" per section opens a detailed, formula-level
// window on how the deterministic engineering model scores (operator 2026-07-17:
// "a single question for the session; on click a beautiful window with the whole
// information in detail how the scoring works"). Every number is versioned in
// engineering.mjs; this is its human-readable mirror.
const SCORING_AXES: { key: string; weight: number; measures: string; formula: string; na?: string }[] = [
  { key: "compliance", weight: 0.25, measures: "Does the file obey the constitution — the laws you ratified? This axis IS the constitution.", formula: "100 − Σ(weight × confidence) for every law it breaks · one file's penalty caps at 90 · floor 10" },
  { key: "defects", weight: 0.18, measures: "Bugs the deterministic bench actually found in this file — not a guess, a ledger.", formula: "100 − (15 × findings + 10 × high-severity findings) · capped at 90" },
  { key: "tests", weight: 0.16, measures: "Is it tested — weighted by how central it is? An untested hub is worse than an untested leaf.", formula: "covered → 100 · else 100 − (45 + 45 × fan-in percentile)", na: "test files · glue" },
  { key: "structure", weight: 0.15, measures: "Complexity DECOMPOSED (absolute-first, from the tree-sitter parse): the worst block's cognitive score (branches + loops, each +nesting depth), max nesting, nested loops, transitive-import weight, the god-file smell.", formula: "100 − (3 × (worst-block cognitive − 8) [≤55] + 5 × (nesting − 4) [≤15] + 20 × transitive-pct + 15 × god-file) · falls back to cyclomatic percentile when unparseable", na: "glue" },
  { key: "coupling", weight: 0.12, measures: "How entangled it is: who depends on it, what it depends on, and whether it sits in a cycle.", formula: "100 − (45 × fan-in-pct + 35 × fan-out-pct + 20 × in-cycle)", na: "glue" },
  { key: "cohesion", weight: 0.06, measures: "Do the file's OWN symbols reference each other (a cohesive module) or sit as disjoint islands (a junk drawer)?", formula: "connected symbols / total symbols · from the atlas intra-file call/use graph", na: "files with < 2 symbols · glue" },
  { key: "change", weight: 0.08, measures: "Hotspot risk from git history — a file that changes OFTEN and is complex is where bugs breed (the best-evidenced defect predictor). Absolute-first: a young file is never a hotspot.", formula: "churn < 3 → 100 · else 100 − 90 × churn-pct × max(complexity-pct, 0.3)" },
];
const SCORING_META: { key: string; measures: string; formula: string }[] = [
  { key: "health", measures: "The headline. A weighted mean of only the axes that APPLY to this file — a missing signal is never counted as zero, it's dropped and the weights renormalize.", formula: "Σ(axis × weight) / Σ(weights present)" },
  { key: "determinism", measures: "How much of the codebase the atlas parsed cleanly with tree-sitter. Low determinism means the model is partly blind — read the scores with that caveat.", formula: "cleanly-parsed files / total files" },
  { key: "ai-readability", measures: "A legibility proxy — how easily an AI can hold this file in its head. Smaller, less transitively-entangled, lower fan-out reads easier. Not a quality score.", formula: "100 − (45 × loc-pct + 35 × transitive-pct + 20 × fan-out-pct)" },
];

function ScoringGuideModal({ onClose }: { onClose: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const wtone = (w: number) => `color-mix(in oklab, ${C.brand} ${Math.round((w / 0.25) * 100)}%, ${C.dim})`;
  const formulaBox: React.CSSProperties = { fontFamily: mono, fontSize: 9.5, color: C.fg, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 7px", marginTop: 5, lineHeight: 1.5, overflowX: "auto" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 96vw)", maxHeight: "90vh", overflow: "auto", background: C.panel, border: `1px solid color-mix(in oklab, ${C.brand} 22%, ${C.border})`, borderRadius: 15, boxShadow: "0 24px 70px -12px rgba(0,0,0,.7)" }}>
        {/* header */}
        <div style={{ position: "sticky", top: 0, background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 700, color: C.fg }}>How the scoring works</span>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 3, padding: "0 5px" }}>deterministic · $0 · advisory</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 11 }}>✕ esc</button>
        </div>
        <div style={{ padding: "14px 18px" }}>
          <p style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, lineHeight: 1.65, margin: "0 0 10px" }}>
            Every file gets a <b style={{ color: C.fg }}>health</b> score — a weighted blend of seven axes computed from the code atlas, git history, and the bench ledger. No AI, no opinion: each axis records its <i>parts</i>, and where a signal is missing the axis is dropped (never guessed as zero). Percentiles are relative to <b style={{ color: C.fg }}>this</b> repo, so “70th” means “better than 70% of the files here”.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "0 0 14px" }}>
            <div style={{ border: `1px solid color-mix(in oklab, ${C.brand} 30%, ${C.border})`, borderRadius: 8, background: C.panel2, padding: "8px 11px" }}>
              <b style={{ fontFamily: mono, fontSize: 10.5, color: C.brand }}>⚖ law-based</b>
              <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, lineHeight: 1.55, marginTop: 3 }}><b style={{ color: C.fg }}>compliance</b> — the one axis driven by the constitution. It decomposes into per-concern sub-scores (security · testing · architecture · patterns…): add laws, add concerns, no engine change.</div>
            </div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel2, padding: "8px 11px" }}>
              <b style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>📊 measured</b>
              <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, lineHeight: 1.55, marginTop: 3 }}>defects · tests · structure · coupling · cohesion · change — each a deterministic <i>formula</i> over the atlas, git, and the bench. Not laws; measurements. (Bus-factor is map-only info — single authorship is not a defect.)</div>
            </div>
          </div>
          {/* the 7 axes */}
          <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>the seven axes — weighted into health</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 10 }}>
            {SCORING_AXES.map((a) => (
              <div key={a.key} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel2, padding: "9px 11px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                  <b style={{ fontFamily: mono, fontSize: 12, color: C.fg }}>{a.key}</b>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }} title="its weight in the health blend">w {a.weight.toFixed(2)}</span>
                  <div style={{ width: 46, height: 5, background: `color-mix(in oklab, ${C.border} 45%, transparent)`, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${(a.weight / 0.25) * 100}%`, height: "100%", background: wtone(a.weight) }} /></div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{a.measures}</div>
                <div style={formulaBox}>{a.formula}</div>
                {a.na && <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginTop: 4 }}>n/a for: <span style={{ color: C.warn }}>{a.na}</span></div>}
              </div>
            ))}
          </div>
          {/* meta scores */}
          <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 8px" }}>meta scores</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 10 }}>
            {SCORING_META.map((m) => (
              <div key={m.key} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel2, padding: "9px 11px" }}>
                <b style={{ fontFamily: mono, fontSize: 12, color: C.fg }}>{m.key}</b>
                <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.5, marginTop: 4 }}>{m.measures}</div>
                <div style={formulaBox}>{m.formula}</div>
              </div>
            ))}
          </div>
          {/* archetype + per-block */}
          <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 8px" }}>what keeps the score honest</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel2, padding: "9px 11px" }}>
              <b style={{ fontFamily: mono, fontSize: 11, color: C.brand }}>archetype-aware</b>
              <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.55, marginTop: 4 }}>
                A file that owns no logic definitions is structural <b style={{ color: C.fg }}>glue</b> (a barrel · re-export · constants · types · config). The tests and coupling axes MISFIRE on glue — you don't unit-test a re-export, and being imported is a barrel's whole job — so glue is scored on <b style={{ color: C.fg }}>compliance + defects only</b>. A clean barrel then reads ~100, as it should. Files with logic are <b style={{ color: C.fg }}>logic</b> (all axes); test files are excluded from the cohort.
              </div>
            </div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel2, padding: "9px 11px" }}>
              <b style={{ fontFamily: mono, fontSize: 11, color: C.brand }}>per block, not just per file</b>
              <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.55, marginTop: 4 }}>
                Compliance is the one axis that decomposes to a single function or class: each block in the docs carries the laws IT breaks and its own compliance — <span style={{ fontFamily: mono, color: C.fg }}>100 − Σ(weight × confidence)</span> over just that block's violations, the same formula as the file. The other axes (tests, coupling, churn…) only exist at file scale, so the file snapshot carries those.
              </div>
            </div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel2, padding: "9px 11px" }}>
              <b style={{ fontFamily: mono, fontSize: 11, color: C.brand }}>self vs neighborhood</b>
              <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.55, marginTop: 4 }}>
                A block is never judged only in isolation. <b style={{ color: C.fg }}>SELF</b> = the block alone (its violations + its cognitive shape). <b style={{ color: C.fg }}>NEIGHBORHOOD</b> = the mean SELF of the blocks it exchanges calls/data with (the intra-file graph), −15 when the exchange is a cycle. <b style={{ color: C.fg }}>FINAL = 0.4×self + 0.6×neighborhood</b> — interaction outranks isolation: a clean helper wired into a sick neighborhood scores below a clean helper in a healthy one. An isolated block makes no neighborhood claim (final = self).
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// the single "?" trigger — drop one per section that shows scores.
export function ScoringGuideButton({ compact }: { compact?: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (<>
    <button onClick={(e) => { e.stopPropagation(); setOpen(true); }} title="how the scoring works — click for the detailed guide"
      style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 10, padding: compact ? "0 5px" : "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: compact ? 8 : 8.5, height: compact ? 13 : "auto", textTransform: "none", letterSpacing: 0 }}>
      <span style={{ fontWeight: 700 }}>?</span>{!compact && <span>how scoring works</span>}
    </button>
    {open && <ScoringGuideModal onClose={() => setOpen(false)} />}
  </>);
}

// FILE-SCORE MODAL — THE FILE REVIEW (operator 2026-07-18: "a complete review of
// the file and how to fix it; the stats discrete, a sidebar right"). Main column =
// the review, verdict-first: the law violations (line · evidence · fix), the
// engineering findings (weak axes translated into concrete remediation from their
// own parts), then a FIX PLAN ranked by ≈health gain. Sidebar = the stats. All
// deterministic — the same snapshot, read as a review instead of a dashboard.
function partsStr(parts: any): string {
  if (!parts || typeof parts !== "object") return "";
  return Object.entries(parts).map(([k, v]) => {
    const key = k.replace(/^pct_/, "").replace(/_/g, " ");
    if (typeof v === "number") return `${key} ${v > 0 && v < 1 ? ordinal(Math.round(v * 100)) + " pct" : v}`;
    return `${key} ${v}`;
  }).join(" · ");
}
// a height-capped section that fades out with a blur at the end — click to expand.
function Collapsible({ children, max = 250, more = "show all" }: { children: React.ReactNode; max?: number; more?: string }) {
  const [open, setOpen] = React.useState(false);
  const [overflowing, setOverflowing] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => { const el = ref.current; if (!el) return; const v = el.scrollHeight > max + 24; setOverflowing((p) => (p === v ? p : v)); });
  return (
    <div style={{ position: "relative" }}>
      <div ref={ref} style={{ maxHeight: open ? undefined : max, overflow: "hidden" }}>{children}</div>
      {!open && overflowing && (
        <div style={{ position: "absolute", bottom: 20, left: 0, right: 0, height: 52, background: `linear-gradient(transparent, ${C.panel})`, backdropFilter: "blur(1.5px)", WebkitBackdropFilter: "blur(1.5px)", maskImage: "linear-gradient(transparent, black 70%)", WebkitMaskImage: "linear-gradient(transparent, black 70%)", pointerEvents: "none" }} />
      )}
      {(overflowing || open) && (
        <button onClick={() => setOpen((o) => !o)} style={{ display: "block", width: "100%", textAlign: "center", background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 8.5, padding: "3px 0" }}>{open ? "▴ collapse" : `▾ ${more}`}</button>
      )}
    </div>
  );
}

// ⌗ widget name tags (operator 2026-07-23: "add a discrete name of the widget in each widget so I
// can mention it here") — tiny, dim, selectable; corner variant needs a position:relative parent.
// Each named widget also carries a "?" whose mouseover explains HOW TO READ the drawing.
const WIDGET_HELP: Record<string, string> = {
  "exploded-function": "The function drawn as ONE box holding its real branch arms — each arm sized by its real line count, labeled with its real condition. After: the same function as a thin index; every arm becomes its own small helper.",
  "staircase": "Each step is one nesting level in the real code — the deeper the stair, the more conditions a reader carries per line. After: early returns exit at the top; the work runs flat at depth ≤2.",
  "commit-ticks": "Each tick = one recent commit touching this file. Churn with no test is where the next bug lands. After: the test shield — every future change must pass it before landing.",
  "bug-pins": "Each pin = one recorded finding, at its real line, wired to its text. After: fixed AND pinned by a regression test so it cannot return silently.",
  "dependents-web": "Every arrow = a file that imports this one. It is uncovered — a break here lands on every arrow. After: the test stands in front; a break fails there first.",
  "import-fan": "Every arrow = one import this file makes. A cluster landing in one folder can fold behind a single index (facade). After: N edges become 1 — moves inside that folder stop touching this file.",
  "inbound-web": "Arrows IN = the files depending on this one; the narrow gate is its exported surface — every signature change ripples into all of them. After: a small, stable, test-pinned surface.",
  "cycle-ring": "The arrows chase each other in a circle — these files import each other, so there is no clean build/test order and changes loop. After: the shared piece extracted; every arrow points one way.",
  "iceberg": "Importing this file LOOKS like one edge — but it drags the whole mass below the waterline with it. After: the heavy chains are cut or lazy-loaded.",
  "junk-drawer": "Blocks sharing one file without referencing each other — a junk drawer. After: split into modules whose parts actually work together.",
  "twin-files": "Two files that change together, commit after commit, with NO import between them — an invisible contract nothing declares. After: make the dependency explicit, or merge the pieces that move together.",
  "fix-diff": "The fix as ONE diff — real lines: − what is there today, + what should be there instead (same logic, restructured).",
  "fix-article": "The comment and its code diff as one article: the narration flows straight into the code block that shows the move.",
};
export const WTag = ({ n, corner = false }: { n: string; corner?: boolean }) => (
  <span style={{ fontFamily: mono, fontSize: 6.5, color: C.dim, opacity: 0.55, letterSpacing: 0.4, userSelect: "all", flexShrink: 0, display: "inline-flex", gap: 2, alignItems: "baseline",
    ...(corner ? { position: "absolute", right: 4, bottom: 2 } as React.CSSProperties : {}) }}>
    ⌗{n}
    {WIDGET_HELP[n] && <span title={WIDGET_HELP[n]} style={{ cursor: "help", color: C.brand, opacity: 0.9, fontSize: 7 }}>?</span>}
  </span>
);

// harvest a block's top-level branch ARMS from the real source (shared by the fix-diff builder and
// the ⌗exploded-function drawing): each arm = its real condition text + its real line range.
export function harvestArms(srcLines: string[] | null, startLine: number | null | undefined, endLine: number | null | undefined) {
  if (!srcLines || !startLine) return null;
  const start = startLine;
  const end = Math.min(srcLines.length, endLine ?? start + 300);
  const heads: { ln: number; text: string; ind: number }[] = [];
  for (let ln = start + 1; ln <= end; ln++) {
    const t = srcLines[ln - 1] ?? "";
    const m = t.match(/^(\s*)(?:\}?\s*else\s+if\s*\(|if\s*\(|case\s+|default\s*:|switch\s*\()/);
    if (m) heads.push({ ln, text: t.trim().replace(/\s*\{\s*$/, "").slice(0, 72), ind: m[1].length });
  }
  if (heads.length < 2) return null;
  // the ARMS are the shallowest indent level that has ≥2 heads: a function that is one `switch`
  // has a single head at the top level and its cases one level in — those are the arms
  const levels = [...new Set(heads.map((h) => h.ind))].sort((a, b) => a - b);
  const ref = levels.find((lv) => heads.filter((h) => h.ind === lv).length >= 2);
  if (ref == null) return null;
  // `to` is computed over ALL arms before capping the list — otherwise the sixth arm silently
  // swallows every arm after it ("446 lines live in this arm" for a 20-case switch)
  const all = heads.filter((h) => h.ind === ref).map((h, i, a) => ({ ...h, to: (a[i + 1]?.ln ?? end) - 1 }));
  const arms = all.slice(0, 6).map((a) => ({ ...a, more: all.length - 6 }));
  return arms.length >= 2 ? arms : null;
}

// the fix as ONE code diff, styled like the code reader (operator 2026-07-23: "one code diff each,
// not 2 boxes… beautiful like the code reader"), with the explanation TEXT as the left column when
// provided ("one column the text, another the diff"). − lines then + lines — a git-style rewrite hunk.
export function ExampleCols({ ex, text }: { ex: { bad: string; good: string }; text?: string }) {
  const rows = [
    ...ex.bad.split("\n").map((t) => ({ t, sign: "−" as const })),
    ...ex.good.split("\n").map((t) => ({ t, sign: "+" as const })),
  ];
  const diff = (
    <div style={{ borderRadius: 7, background: C.bg, overflow: "hidden", minWidth: 0 }}>
      <div style={{ display: "flex", gap: 10, padding: "2px 9px", fontFamily: mono, fontSize: 7.5 }}>
        <span style={{ color: C.bad }}>− before</span><span style={{ color: C.ok }}>+ after — same logic, restructured</span>
        <span style={{ flex: 1 }} /><WTag n="fix-diff" />
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: "max-content" }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", background: r.sign === "−" ? `color-mix(in oklab, ${C.bad} 7%, transparent)` : `color-mix(in oklab, ${C.ok} 7%, transparent)` }}>
              <span style={{ width: 16, flexShrink: 0, textAlign: "center", fontFamily: mono, fontSize: 8.5, lineHeight: 1.6, color: r.sign === "−" ? C.bad : C.ok, userSelect: "none", borderRight: `1px solid color-mix(in oklab, ${C.border} 55%, transparent)` }}>{r.sign}</span>
              <code style={{ fontFamily: mono, fontSize: 8.5, lineHeight: 1.6, whiteSpace: "pre", padding: "0 9px", color: C.fg }}><TokLine text={r.t} /></code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  if (!text) return <div style={{ marginTop: 5 }}>{diff}</div>;
  // text provided → ONE ARTICLE (operator 2026-07-23: "merge the comment and code diff… like they
  // are one article, not different boxes"): the narration flows straight into its code block.
  return (
    <div style={{ marginTop: 5, border: `1px solid ${C.border}`, borderRadius: 9, background: C.panel2, padding: "7px 10px 9px", transform: "rotate(-0.25deg)" }}>
      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, lineHeight: 1.6 }}>✎ {text}<WTag n="fix-article" /></div>
      <div style={{ marginTop: 6 }}>{diff}</div>
    </div>
  );
}

// weak-axis → a concrete remediation, built from the axis' own parts + the file signals.
const AXIS_REMEDY: Record<string, (p: any, g: any) => string> = {
  tests: (p, g) => `Add a test that imports this file — ${g?.fan_in ?? "several"} file(s) depend on it${p?.pct_fan_in != null ? ` (${ordinal(Math.round(p.pct_fan_in * 100))} fan-in pct)` : ""} while it's uncovered. Start with its public surface.`,
  structure: (p, g) => `Simplify the shape — complexity ${g?.complexity ?? "?"}${p?.pct_complexity != null ? ` (${ordinal(Math.round(p.pct_complexity * 100))} pct)` : ""}: extract branches into small named functions, flatten nesting with early returns${p?.god_file ? ", and split the god-file by responsibility" : ""}.`,
  coupling: (p, g) => `Reduce the entanglement — ${g?.fan_in ?? "?"} file(s) import this one (fan-in) and it imports ${g?.fan_out ?? "?"} (fan-out)${p?.cycle ? " · sits in an import CYCLE (break that first)" : ""}. The moves: fold same-directory imports behind one index, keep the exported surface small, move logic next to the data it uses.`,
  cohesion: (p) => `The file's symbols barely reference each other${p?.connected_ratio != null ? ` (${Math.round(p.connected_ratio * 100)}% connected)` : ""} — a junk drawer. Split it into modules whose parts actually work together.`,
  change: (p, g) => `This file changed ×${g?.churn ?? p?.churn ?? "?"} times AND is complex — bugs breed exactly here. Demand a test BEFORE the next change lands; extract the part that keeps changing so the churn stops touching the whole file.`,
  defects: (p) => `Fix the ${p?.findings ?? "open"} bench finding(s)${p?.high ? ` (${p.high} high-severity)` : ""} recorded for this file in the bug ledger.`,
};
export function FileScoreModal({ con, onClose }: { con: FileCon; onClose: () => void }) {
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const health = con.health ?? 100;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: con.found ? "min(1240px, 96vw)" : "min(520px, 94vw)", maxHeight: "92vh", overflow: "auto", background: C.panel, border: `1px solid color-mix(in oklab, ${C.brand} 22%, ${C.border})`, borderRadius: 15, boxShadow: "0 24px 70px -12px rgba(0,0,0,.7)" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 2, background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 700, color: C.fg }}>{con.is_folder ? "Folder review" : "File review"}</span>
          {con.found && <b style={{ fontFamily: mono, fontSize: 22, color: conTone(health), fontVariantNumeric: "tabular-nums" }}>{health}</b>}
          {con.is_folder && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{con.files ?? "?"} files</span>}
          <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>{con.path}</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 11 }}>✕ esc</button>
        </div>
        {con.found ? <FileReviewBody con={con} /> : (
          <div style={{ padding: "22px 18px", fontFamily: mono, fontSize: 11.5, color: C.muted, lineHeight: 1.75 }}>
            <div style={{ color: C.warn, marginBottom: 8 }}>No review snapshot for this file yet.</div>
            The file review is deterministic — it reads a constitution/judgment snapshot of the atlas. This workspace doesn&apos;t have one for <b style={{ color: C.fg }}>{con.path}</b> (a rebuild or scope change clears it).
            <div style={{ marginTop: 12, color: C.dim }}>Rebuild the codebase (the ↻ in the dock) to regenerate the review — then the health score and its tabs come back.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// THE REVIEW BODY — the full review + stats sidebar. Lives in the modal AND
// inline in the generated docs (operator 2026-07-18: "integrated as part of the
// docs"); handles files AND folders (is_folder aggregates).
// The exported shell owns NAVIGATION (operator: the canvas nodes are doors —
// click a neighbor → ITS review, breadcrumb back). The inner body is per-file.
export function FileReviewBody({ con }: { con: FileCon }) {
  const [stack, setStack] = React.useState<FileCon[]>([]);
  React.useEffect(() => { setStack([]); }, [con.path]);
  const cur = stack[stack.length - 1] ?? con;
  const navigate = async (p: string) => { const fc = await fetchFileCon(p); if (fc) setStack((s) => [...s, fc]); };
  return (
    <>
      {stack.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px 0", fontFamily: mono, fontSize: 8.5 }}>
          <button onClick={() => setStack((s) => s.slice(0, -1))} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 4, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: 8.5 }}>← back</button>
          <span style={{ color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[con, ...stack].map((c) => c.path?.split("/").pop() ?? "?").join(" › ")}</span>
        </div>
      )}
      {cur.is_folder
        ? <FolderReviewTabs key={cur.path ?? "?"} con={cur} onNavigate={navigate} />
        : <FileReviewBodyInner key={cur.path ?? "?"} con={cur} onNavigate={navigate} />}
    </>
  );
}

// FOLDER REVIEW (operator 2026-07-26: "collect all file reviews of a folder as tabs — first tab the
// dashboard"): ◈ dashboard = the REAL folder dashboard (stats of every file, the errors each file
// carries, insights, the ecosystem), ☰ manifest = the old aggregate body, then ONE TAB PER MEMBER
// FILE, each rendering that file's complete review — the same body the file modal uses, cached.
function FolderReviewTabs({ con, onNavigate }: { con: FileCon; onNavigate: (p: string) => void }) {
  const [tab, setTab] = React.useState<string>("__dash__");
  const [cache, setCache] = React.useState<Record<string, FileCon | null | "loading">>({});
  const members = con.members ?? [];
  React.useEffect(() => { setTab("__dash__"); setCache({}); }, [con.path]);
  React.useEffect(() => {
    if (tab.startsWith("__") || cache[tab] !== undefined) return;
    let alive = true;
    setCache((c) => ({ ...c, [tab]: "loading" }));
    void fetchFileCon(tab).then((fc) => { if (alive) setCache((c) => ({ ...c, [tab]: fc })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const active = tab.startsWith("__") ? null : cache[tab];
  const tabBtn = (on: boolean): React.CSSProperties => ({ background: "transparent", border: "none", borderBottom: `1px solid ${on ? C.brand : "transparent"}`, marginBottom: -1, color: on ? C.brand : C.dim, padding: "2px 1px 4px", cursor: "pointer", fontFamily: mono, fontSize: 9.5, transition: "color .12s ease", display: "inline-flex", alignItems: "baseline", gap: 4 });
  return (
    <>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline", padding: "9px 16px 0", borderBottom: `1px solid color-mix(in oklab, ${C.border} 60%, transparent)` }}>
        <button onClick={() => setTab("__dash__")} style={tabBtn(tab === "__dash__")}>📄 the folder paper</button>
        <button onClick={() => setTab("__manifest__")} style={tabBtn(tab === "__manifest__")}>☰ manifest</button>
        {members.map((m) => (
          <button key={m.path} onClick={() => setTab(m.path)} title={m.path} style={tabBtn(tab === m.path)}>
            {m.path.split("/").pop()}
            {m.health != null && <span style={{ fontSize: 8, color: conTone(m.health), fontVariantNumeric: "tabular-nums" }}>{m.health}</span>}
          </button>
        ))}
      </div>
      {tab === "__dash__" ? <FolderDashboard con={con} onOpenFile={setTab} />
        : tab === "__manifest__" ? <FileReviewBodyInner key={con.path ?? "?"} con={con} onNavigate={onNavigate} />
        : active === "loading" || active === undefined ? <div style={{ padding: "18px 16px", fontFamily: mono, fontSize: 10, color: C.muted }}>◆ reading the review of {tab.split("/").pop()}…</div>
        : active ? <FileReviewBodyInner key={active.path ?? tab} con={active} onNavigate={onNavigate} />
        : <div style={{ padding: "18px 16px", fontFamily: mono, fontSize: 10, color: C.warn }}>no review snapshot for {tab} — rebuild the codebase to regenerate it.</div>}
    </>
  );
}

// ── the FOLDER DASHBOARD (operator 2026-07-26: "a FULL dashboard — the stats of all files, the
// errors list from each file, insights, and a beyond-the-lines RICHER than the file one, treating
// the folder as an ECOSYSTEM; zoom the files' health out into the folder health"). All $0:
// the numbers + spectrum from con.members, the per-file errors from the aggregated violations
// (each instance carries its file), the ecosystem from the atlas import edges.
/** THE FOLDER STAGE (operator 2026-09-18: "neighborhood and folder paper on a folder click, merged"):
 *  the folder paper, then the folder's neighborhood canvas — one page. */
export function FolderStageBody({ con, onOpenFile }: { con: FileCon; onOpenFile: (p: string) => void }) {
  return (
    <div data-testid="folder-stage">
      <FolderDashboard con={con} onOpenFile={onOpenFile} />
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8 }}>
        <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim, padding: "10px 16px 0" }}>🕸 neighborhood — what this folder touches, and what touches it</div>
        <FileReviewBodyInner key={`nb-${con.path ?? "?"}`} con={con} initialView="canvas" onNavigate={onOpenFile} />
      </div>
    </div>
  );
}
function FolderDashboard({ con, onOpenFile }: { con: FileCon; onOpenFile: (p: string) => void }) {
  const dir = con.path ?? "";
  // worst → best, so the spectrum and the error list read left-to-right as "start here"
  const members = React.useMemo(() => [...(con.members ?? [])].sort((a, b) => (a.health ?? 101) - (b.health ?? 101)), [con]);
  const vios = React.useMemo(() => (con.violations ?? []) as (FileConViolation & { path?: string })[], [con]);
  const byFile = React.useMemo(() => {
    const m = new Map<string, (FileConViolation & { path?: string })[]>();
    for (const v of vios) { const p = v.path ?? "?"; if (!m.has(p)) m.set(p, []); m.get(p)!.push(v); }
    return m;
  }, [vios]);

  // ── the zoom-out numbers ──
  const healths = members.map((m) => m.health).filter((h): h is number => h != null);
  // the roster split: glue (no logic definitions) is scored on laws + defects only and lands at 100
  // when clean — it belongs in the headline's population but not in a sentence about "members".
  const roster = con.roster ?? null;
  const logicMembers = members.filter((m) => (m as any).archetype == null || (m as any).archetype === "logic");
  const logicHealths = logicMembers.map((m) => m.health).filter((h): h is number => h != null);
  const avg = con.health_logic ?? (logicHealths.length ? Math.round(logicHealths.reduce((a, b) => a + b, 0) / logicHealths.length) : null);
  const high = vios.filter((v) => SEV_TONE[v.severity] === C.bad).length;
  const clean = members.filter((m) => !(byFile.get(m.path)?.length)).length;
  const buckets = [
    { label: "solid ≥85", tone: C.ok, test: (h: number) => h >= 85 },
    { label: "decent 70–84", tone: "oklch(0.78 0.13 90)", test: (h: number) => h >= 70 && h < 85 },
    { label: "sick 50–69", tone: C.warn, test: (h: number) => h >= 50 && h < 70 },
    { label: "critical <50", tone: C.bad, test: (h: number) => h < 50 },
  ].map((b) => ({ ...b, n: healths.filter(b.test).length }));

  // ── INSIGHTS — only sentences the numbers actually support ──
  const byCount = React.useMemo(() => [...members].sort((a, b) => (byFile.get(b.path)?.length ?? 0) - (byFile.get(a.path)?.length ?? 0)), [members, byFile]);
  const insights: { by: string; tone: string; t: React.ReactNode }[] = [];
  if (vios.length >= 4) {
    let cum = 0, k = 0;
    for (const m of byCount) { cum += byFile.get(m.path)?.length ?? 0; k += 1; if (cum / vios.length >= 0.7) break; }
    if (k <= Math.max(1, Math.floor(members.length / 3)))
      insights.push({ by: "concentration", tone: C.warn, t: <><b style={{ color: C.fg }}>{k} file{k === 1 ? "" : "s"}</b> carr{k === 1 ? "ies" : "y"} {Math.round((cum / Math.max(1, vios.length)) * 100)}% of the folder's violations — the fix concentrates there: {byCount.slice(0, k).map((m) => m.path.split("/").pop()).join(", ")}.</> });
  }
  const lawFiles = new Map<string, { title?: string; files: Set<string> }>();
  for (const v of vios) { const e = lawFiles.get(v.law_key) ?? { title: v.title, files: new Set<string>() }; e.files.add(v.path ?? "?"); lawFiles.set(v.law_key, e); }
  const patterns = [...lawFiles.entries()].filter(([, e]) => e.files.size >= 2).sort((a, b) => b[1].files.size - a[1].files.size);
  if (patterns.length) insights.push({ by: "the pattern", tone: C.brand, t: <><code style={{ fontFamily: mono, fontSize: 8.5, color: C.fg }}>{patterns[0][0]}</code> breaks in <b style={{ color: C.fg }}>{patterns[0][1].files.size}/{members.length}</b> files — a folder-wide habit, not a local slip. Fix the pattern once, then sweep it everywhere.</> });
  const axesSorted = AXES.map((ax) => ({ ax, s: con.axes?.[ax]?.score })).filter((x) => x.s != null).sort((a, b) => (a.s as number) - (b.s as number));
  if (axesSorted[0] && (axesSorted[0].s as number) < 70) insights.push({ by: "the axes", tone: conTone(axesSorted[0].s), t: <>The folder's weakest axis is <b style={{ color: conTone(axesSorted[0].s) }}>{axesSorted[0].ax} ({axesSorted[0].s})</b> — the drag every member feels at once.</> });
  if (healths.length >= 2 && Math.max(...healths) - Math.min(...healths) >= 35)
    insights.push({ by: "the spread", tone: C.dim, t: <>Health spread is wide ({Math.min(...healths)}–{Math.max(...healths)}) — the folder isn't uniformly sick; quarantine the tail instead of rewriting the module.</> });
  if (clean > 0 && clean < members.length) insights.push({ by: "the reference", tone: C.ok, t: <><b style={{ color: C.ok }}>{clean}</b> of {members.length} files are violation-free — the house style already lives here; the sick files have working references next door.</> });

  // ── the ECOSYSTEM — beyond the lines at folder grade, from the atlas import edges ──
  const [eco, setEco] = React.useState<any>("loading");
  const paperRef = React.useRef<HTMLDivElement | null>(null); // the exported document (⬇ md · html · pdf)
  React.useEffect(() => {
    let alive = true;
    void getAtlas({}).then((a) => {
      if (!alive) return;
      if (!a) { setEco(null); return; }
      const inF = (p: string) => p === dir || p.startsWith(dir + "/");
      const top2 = (p: string) => p.split("/").slice(0, 2).join("/");
      const fileIds = new Set((a.nodes ?? []).filter((n) => n.type === "file").map((n) => n.id));
      // dedupe multi-edges once — the clean list also feeds the transitive closures below
      // EDGE KINDS (2026-09-12): a `type`-only import is erased at compile time — it is
      // documentation, not coupling — so it never counts as wiring, a door, blast or a link. It is
      // counted separately so §8 can say how many cross the wall. `dynamic` (a lazy `import()`) and
      // `reexport` (a barrel) are real edges and count like a value import.
      const seen = new Set<string>(); const EDGES: Array<{ f: string; t: string; kind: string }> = [];
      let typeOnly = 0;
      const dynamicTargets = new Set<string>();
      for (const e of a.edges ?? []) {
        if (!fileIds.has(e.from_node) || !fileIds.has(e.to_node) || e.from_node === e.to_node) continue;
        const kind = String((e as any).kind ?? "value");
        if (kind === "type") { if (inF(e.from_node) !== inF(e.to_node)) typeOnly += 1; continue; }
        const k = `${e.from_node}→${e.to_node}`; if (seen.has(k)) continue; seen.add(k);
        EDGES.push({ f: e.from_node, t: e.to_node, kind });
        if (kind === "dynamic") dynamicTargets.add(e.to_node);
      }
      // where an outbound edge lands: down to a SHARED layer, across to a SIBLING, or elsewhere.
      // "shared" is by name OR measured (≥3 distinct top-level folders import into that folder).
      const importersOfFolder = new Map<string, Set<string>>();
      for (const { f, t } of EDGES) { const td = t.split("/").slice(0, -1).join("/"); if (!importersOfFolder.has(td)) importersOfFolder.set(td, new Set()); importersOfFolder.get(td)!.add(top2(f)); }
      const importerFoldersOf = (folder: string) => importersOfFolder.get(folder)?.size ?? 0;
      let internal = 0, outbound = 0, outShared = 0, outSibling = 0, outApp = 0;
      const siblingOut = new Set<string>(); const siblingIn = new Set<string>();
      const inbound = new Map<string, Set<string>>(); const outByFolder = new Map<string, Set<string>>();
      const intIn = new Map<string, number>(); const linked = new Set<string>(); const blast = new Set<string>();
      const impFolders = new Map<string, number>();
      const fwd = new Map<string, string[]>(); const rev = new Map<string, string[]>();
      const pairCount = new Map<string, number>(); // internal member→member imports — the MRI's nerves
      for (const { f, t } of EDGES) {
        if (!fwd.has(f)) fwd.set(f, []); fwd.get(f)!.push(t);
        if (!rev.has(t)) rev.set(t, []); rev.get(t)!.push(f);
        const fi = inF(f), ti = inF(t);
        if (fi && ti) { internal += 1; intIn.set(t, (intIn.get(t) ?? 0) + 1); linked.add(f); linked.add(t); pairCount.set(`${f}→${t}`, (pairCount.get(`${f}→${t}`) ?? 0) + 1); }
        else if (!fi && ti) {
          if (!inbound.has(t)) inbound.set(t, new Set()); inbound.get(t)!.add(f); blast.add(f); impFolders.set(top2(f), (impFolders.get(top2(f)) ?? 0) + 1);
          if (classifyTarget(dir, f, importerFoldersOf) === "sibling") siblingIn.add(f.split("/").slice(0, -1).join("/"));
        }
        else if (fi && !ti) {
          outbound += 1; if (!outByFolder.has(top2(t))) outByFolder.set(top2(t), new Set()); outByFolder.get(top2(t))!.add(t);
          const cls = classifyTarget(dir, t, importerFoldersOf);
          if (cls === "shared") outShared += 1; else if (cls === "sibling") { outSibling += 1; siblingOut.add(t.split("/").slice(0, -1).join("/")); } else outApp += 1;
        }
      }
      const mutualSibling = [...siblingOut].some((d3) => siblingIn.has(d3));
      // THE DOCS LAYER (operator 2026-07-26: "the generated docs knowledge is vital") — the atlas's
      // DEF layer is the same substrate the generated docs render from: every symbol with its kind,
      // its docs intent, and def-level call/uses edges. Mined here: the composition census, the
      // named shapes (rule printed in §3), and the REAL public surface — symbols outside actually calls.
      const nodesById = new Map((a.nodes ?? []).map((n) => [n.id, n]));
      const defs = (a.nodes ?? []).filter((n) => n.type !== "file" && inF(String(n.path ?? "")));
      // the census reads the atlas's own kinds (the parsers name components and hooks since the
      // React reading of 2026-09-12); `const`/`type` are DATA and leave the profile denominator
      const compCounts = emptyCounts() as Record<string, number>;
      const perFile = new Map<string, { fn: number; comp: number; hook: number; cls: number; data: number }>();
      for (const d2 of defs) {
        const kk = paperKindOf(d2 as any); compCounts[kk] += 1;
        const pf = perFile.get(String(d2.path)) ?? { fn: 0, comp: 0, hook: 0, cls: 0, data: 0 };
        (pf as any)[kk] += 1; perFile.set(String(d2.path), pf);
      }
      const nameShapes = [
        { kind: "provider", names: defs.filter((d2) => /Provider$/.test(String(d2.name ?? ""))).map((d2) => String(d2.name)) },
        { kind: "context", names: defs.filter((d2) => /Context/.test(String(d2.name ?? "")) && !/Provider$/.test(String(d2.name ?? ""))).map((d2) => String(d2.name)) },
        { kind: "store", names: defs.filter((d2) => /store/i.test(String(d2.name ?? ""))).map((d2) => String(d2.name)) },
        { kind: "factory", names: defs.filter((d2) => /^(make|create)[A-Z]/.test(String(d2.name ?? ""))).map((d2) => String(d2.name)) },
      ].filter((x) => x.names.length > 0).map((x) => ({ ...x, names: x.names.slice(0, 6) }));
      const apiCalls = new Map<string, number>();
      for (const e of a.edges ?? []) {
        const fromN: any = nodesById.get(e.from_node), toN: any = nodesById.get(e.to_node);
        if (!fromN || !toN || toN.type === "file" || fromN.type === "file") continue;
        if (inF(String(toN.path ?? "")) && !inF(String(fromN.path ?? ""))) apiCalls.set(e.to_node, (apiCalls.get(e.to_node) ?? 0) + 1);
      }
      const api = [...apiCalls.entries()].map(([id2, n2]) => { const d2: any = nodesById.get(id2); return { name: String(d2?.name ?? id2).slice(0, 40), file: String(d2?.path ?? ""), n: n2, intent: d2?.intent ? String(d2.intent) : null }; })
        .sort((x, y) => y.n - x.n).slice(0, 8);
      const profile = profileOf(compCounts as any);
      // THE PROJECT RELATION (operator 2026-07-26: "not just this folder but beyond — in relation to
      // the whole project"): transitive closures over the deduped graph. downstream = every outside
      // file that would FEEL this folder breaking; upstream = every outside file this folder needs
      // standing before it works. Both BFS, still $0.
      const memberIds = [...fileIds].filter(inF);
      const closure = (adj: Map<string, string[]>) => {
        const s2 = new Set(memberIds); const q = [...memberIds];
        while (q.length) { const x = q.pop()!; for (const y of adj.get(x) ?? []) if (!s2.has(y)) { s2.add(y); q.push(y); } }
        return [...s2].filter((p) => !inF(p));
      };
      const down = closure(rev), up = closure(fwd);
      const outsideN = Math.max(1, fileIds.size - memberIds.length);
      const inboundTotal = [...inbound.values()].reduce((x, s3) => x + s3.size, 0);
      const touching = internal + inboundTotal + outbound;
      setEco({
        internal, outbound, inboundTotal, typeOnly, outShared, outSibling, outApp, mutualSibling,
        dynamicTargets: [...dynamicTargets],
        cohesion: touching ? Math.round((internal / touching) * 100) : null,
        entries: [...inbound.entries()].map(([p, s3]) => ({ path: p, n: s3.size })).sort((x, y) => y.n - x.n).slice(0, 8),
        deps: [...outByFolder.entries()].map(([f, s3]) => ({ folder: f, n: s3.size })).sort((x, y) => y.n - x.n).slice(0, 8),
        hub: [...intIn.entries()].sort((x, y) => y[1] - x[1])[0] ?? null,
        blast: blast.size,
        orphans: memberIds.filter((p) => !linked.has(p) && !inbound.has(p)).slice(0, 8),
        traffic: memberIds.map((p) => ({ path: p, tin: (intIn.get(p) ?? 0) + (inbound.get(p)?.size ?? 0) })),
        pairs: [...pairCount.entries()].map(([k2, n2]) => { const [a2, b2] = k2.split("→"); return { a: a2, b: b2, n: n2 }; }).sort((x, y) => y.n - x.n).slice(0, 40),
        docs: { defs: defs.length, ...compCounts, profile, shapes: nameShapes, api, perFile: [...perFile.entries()].map(([p2, c2]) => ({ path: p2, ...c2 })) },
        project: {
          files: fileIds.size, edges: EDGES.length,
          share: Math.round((memberIds.length / Math.max(1, fileIds.size)) * 100),
          edgeShare: EDGES.length ? Math.round((touching / EDGES.length) * 100) : 0,
          down: down.length, downPct: Math.round((down.length / outsideN) * 100),
          up: up.length, upPct: Math.round((up.length / outsideN) * 100),
          importerFolders: [...impFolders.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4),
          // the SIBLING modules (same parent, folders only) — §13's related work
          siblings: (() => {
            const parent = dir.split("/").slice(0, -1).join("/");
            const sibCount = new Map<string, number>();
            for (const p of fileIds) {
              if (parent && !p.startsWith(parent + "/")) continue;
              const rest = parent ? p.slice(parent.length + 1) : p;
              if (!rest.includes("/")) continue; // a file at parent level, not a folder
              const sd = parent ? `${parent}/${rest.split("/")[0]}` : rest.split("/")[0];
              if (sd !== dir) sibCount.set(sd, (sibCount.get(sd) ?? 0) + 1);
            }
            return [...sibCount.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([d2, n2]) => ({ dir: d2, files: n2 }));
          })(),
        },
      });
    }).catch(() => { if (alive) setEco(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  // ── the FOLDER PAPER (operator 2026-07-26: "use the PAPER design — deterministically"): the same
  // NL.pdf/Sakana form the swarm study presses (title · authors · ABSTRACT · numbered sections ·
  // Figures with captions · Remarks · Sources), but authored by the INSTRUMENTS themselves — the
  // detectors, the axes, the import graph. No swarm, no model call: every sentence is a measurement.
  const FS = { small: 8.5, base: 10.5 };
  let FIGN = 0; let LSTN = 0;
  const P = ({ children }: { children: React.ReactNode }) => (
    <p style={{ margin: "0 0 11px", fontSize: FS.base + 0.5, lineHeight: 1.9, color: C.fg, textAlign: "justify" }}>{children}</p>
  );
  // Figure/Listing numbers are assigned when the PARENT builds the element (`n={fig()}`), never
  // inside the child's render: React's dev StrictMode double-invokes child components, and a
  // counter bumped during the child's render printed Figure 2, 4, 6 … in every dev export.
  const fig = () => ++FIGN;
  const lst = () => ++LSTN;
  const Fig = ({ n, children, caption }: { n: number; children: React.ReactNode; caption: React.ReactNode }) => (
    <figure style={{ margin: "16px 0", padding: 0 }}>
      {children}
      <figcaption style={{ fontSize: FS.small, color: C.dim, marginTop: 5, lineHeight: 1.65, maxWidth: 720 }}><b style={{ color: C.muted }}>Figure {n}.</b> {caption}</figcaption>
    </figure>
  );
  // the numbered code exhibit — same design the swarm paper uses: line numbers, the sick line
  // highlighted in its severity tone, a captioned Listing counter.
  const Listing = ({ n, rows, sickLine, severity, caption }: { n: number; rows: { ln: number; text: string }[]; sickLine?: number | null; severity?: string; caption: React.ReactNode }) => {
    const sevT = SEV_TONE[severity ?? "warn"] ?? C.warn;
    return (
      <figure style={{ margin: "12px 0", padding: 0 }}>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", maxWidth: 720 }}>
          {rows.map((row) => { const sickR = sickLine != null && row.ln === sickLine; return (
            <div key={row.ln} style={{ display: "flex", minHeight: 17, background: sickR ? `color-mix(in oklab, ${sevT} 9%, transparent)` : "transparent" }}>
              <span style={{ width: 36, flexShrink: 0, textAlign: "right", paddingRight: 7, fontSize: FS.small, color: sickR ? sevT : C.dim, lineHeight: "17px", userSelect: "none", borderRight: `1px solid ${C.border}`, fontFamily: mono }}>{row.ln}</span>
              <code style={{ fontSize: FS.base - 1, whiteSpace: "pre", overflowX: "auto", padding: "0 7px", flex: 1, minWidth: 0, lineHeight: "17px", fontFamily: mono, opacity: sickR ? 1 : 0.82 }}><TokLine text={row.text} /></code>
            </div>
          ); })}
        </div>
        <figcaption style={{ fontSize: FS.small, color: C.dim, marginTop: 4, lineHeight: 1.65, maxWidth: 720 }}><b style={{ color: C.muted }}>Listing {n}.</b> {caption}</figcaption>
      </figure>
    );
  };
  const Remark = ({ by, children }: { by: string; children: React.ReactNode }) => (
    <div style={{ margin: "9px 0 11px 24px", fontSize: FS.base, color: C.muted, fontStyle: "italic", lineHeight: 1.8, textAlign: "justify" }}>
      <b style={{ color: C.fg, fontStyle: "normal" }}>Remark</b> ({by}). {children}
    </div>
  );
  // READ-ALONG (operator 2026-07-27: "synchronize a markup above the text that is read, and
  // automatic scroll while the voice narrates"): a Sec that owns the playing narration section
  // (matched by topic prefix) glows and the page follows it. Section-level sync — honest: the
  // voice speaks the class script, so the paper highlights the REGION being taught, not words.
  const Sec = ({ n, title, narr, children }: { n: React.ReactNode; title: React.ReactNode; narr?: string; children: React.ReactNode }) => {
    const hot = narr != null && nowTopic != null && narr.split("|").some((p) => nowTopic.toLowerCase().startsWith(p.toLowerCase()));
    return (
      <div data-narr-topic={narr ?? undefined} style={{ transition: "background .6s ease, box-shadow .6s ease", ...(hot ? { background: `color-mix(in oklab, ${C.brand} 7%, transparent)`, boxShadow: `inset 2px 0 0 ${C.brand}`, borderRadius: 8, padding: "2px 12px", margin: "0 -12px" } : {}) }}>
        <h3 style={{ fontSize: FS.base + 2.5, color: C.fg, margin: "26px 0 10px", fontWeight: 700, letterSpacing: 0.2 }}>{n}&ensp;{title}{hot ? <span style={{ marginLeft: 10, fontFamily: mono, fontSize: 9, color: C.brand, animation: "loki-narr-pulse 1.4s ease-in-out infinite" }}>♪ reading</span> : null}</h3>
        {children}
      </div>
    );
  };
  const fileBtn = (p: string) => (
    <button onClick={() => onOpenFile(p)} title={`open the full review of ${p}`}
      style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: "inherit", padding: 0, textDecoration: "underline dotted", textUnderlineOffset: 2 }}>
      {p.split("/").pop()}
    </button>
  );
  const lawChip = (k: string, n: number, sev: string) => (
    <span key={k} title={k} style={{ fontFamily: mono, fontSize: FS.small, color: SEV_TONE[sev] ?? C.warn, border: `1px solid color-mix(in oklab, ${SEV_TONE[sev] ?? C.warn} 40%, ${C.border})`, borderRadius: 4, padding: "0 5px", marginRight: 4, whiteSpace: "nowrap" }}>{k}{n > 1 ? ` ×${n}` : ""}</span>
  );
  const folderName = dir.split("/").pop() || dir || "the folder";
  const sick = byCount.filter((m) => (byFile.get(m.path)?.length ?? 0) > 0);
  const best = members[members.length - 1];
  const E = eco !== "loading" && eco ? eco : null;
  // ── the PROJECT RELATION, read (fixed thresholds, stated in the figure so the label is checkable) ──
  const PR = E?.project ?? null;
  const role = !PR ? null
    : PR.downPct >= 20 && PR.upPct < 12 ? "a foundation — the project stands on it"
    : PR.downPct >= 20 ? "a load-bearing connector — it carries the project and leans on it at once"
    : PR.downPct < 5 && PR.upPct >= 15 ? "an application shell — it consumes the project; almost nothing consumes it"
    : PR.downPct < 5 && PR.upPct < 5 ? "an island — barely wired to the rest of the project"
    : "a working organ — moderate traffic in both directions";
  const hOf = (p: string) => members.find((m) => m.path === p)?.health ?? null;
  // ── the READINGS that risks, threats and the card all share (pure, from atlas-folder-paper.ts) ──
  const boundaryR = boundaryReading(E ? { internal: E.internal, inbound: E.inboundTotal, outShared: E.outShared ?? 0, outSibling: E.outSibling ?? 0, outApp: E.outApp ?? E.outbound, mutualSibling: !!E.mutualSibling } : null);
  const testsNote = testsAxisNote(con.tests_basis, con.axes?.tests?.score);
  const reg = (con.regression ?? null) as any;
  const roleTags = (p: string): string[] => {
    const t: string[] = [];
    if (E?.entries?.some((x: any) => x.path === p)) t.push("door");
    if (E?.hub && E.hub[0] === p) t.push("hub");
    if (E?.orphans?.includes(p)) t.push("unlinked");
    return t;
  };
  // ── the RISK REGISTER — computed crossings of health × position; each risk cites its files ──
  type Risk = { sev: "high" | "medium" | "low"; title: string; body: React.ReactNode; plain: string };
  const risks: Risk[] = [];
  if (E) {
    const sickDoors = (E.entries as any[]).filter((x) => (hOf(x.path) ?? 100) < 70);
    if (sickDoors.length) risks.push({ sev: "high", title: "the public face is sick", plain: `outside code enters through ${sickDoors.map((x: any) => `${String(x.path).split("/").pop()} (health ${hOf(x.path)})`).join(", ")} — every importer inherits that door's problems first.`, body: <>Outside code enters through {sickDoors.map((x: any, i: number) => <span key={x.path}>{i > 0 ? ", " : ""}{fileBtn(x.path)} (health {hOf(x.path)}, ← {x.n})</span>)} — every importer inherits that door's problems before anything else in the folder.</> });
    if (E.hub && (hOf(E.hub[0]) ?? 100) < 70) risks.push({ sev: "high", title: "the load-bearing member is weak", plain: `${String(E.hub[0]).split("/").pop()} holds ${E.hub[1]} siblings at health ${hOf(E.hub[0])} — the module's spine is its weakest bone.`, body: <>{fileBtn(E.hub[0])} holds {E.hub[1]} sibling{E.hub[1] === 1 ? "" : "s"} at health {hOf(E.hub[0])} — the module's spine is its weakest bone.</> });
    if (PR && PR.downPct >= 15 && avg != null && avg < 75) risks.push({ sev: "high", title: "the project inherits this folder's state", plain: `${PR.downPct}% of the project (${PR.down} files) transitively depends on a folder whose average member sits at ${avg}.`, body: <><b>{PR.downPct}%</b> of the project ({PR.down} files) transitively depends on a folder whose average member sits at {avg} — the debt here is not local.</> });
    if (patterns.length && patterns[0][1].files.size >= Math.max(2, Math.ceil(members.length / 3))) risks.push({ sev: "medium", title: "a habit, spreading", plain: `${patterns[0][0]} breaks in ${patterns[0][1].files.size} of ${members.length} members — the next file written here will likely repeat it.`, body: <><code style={{ fontSize: FS.small }}>{patterns[0][0]}</code> breaks in {patterns[0][1].files.size} of {members.length} members — the next file written in this folder will most likely repeat it.</> });
    if (testsNote.measured && (con.axes?.tests?.score ?? 100) < 50 && E.blast > 3) risks.push({ sev: "medium", title: "no net under the traffic", plain: `tests score ${con.axes?.tests?.score} while ${E.blast} outside files land here — a break travels outward before anything catches it.`, body: <>The tests axis scores {con.axes?.tests?.score} while {E.blast} outside file{E.blast === 1 ? " lands" : "s land"} here — a break travels outward before anything catches it.</> });
    if (E.orphans.length) risks.push({ sev: "low", title: "dead-weight suspicion", plain: `${E.orphans.length} member(s) have no imports in or out (type-only and lazy imports already counted).`, body: <>{E.orphans.length} member{E.orphans.length === 1 ? " has" : "s have"} no imports in or out ({(E.orphans as string[]).map((p, i) => <span key={p}>{i > 0 ? ", " : ""}{fileBtn(p)}</span>)}) — lazy <code style={{ fontSize: FS.small }}>import()</code> and barrel re-exports already count as links, so these are either roots entered by a router or weight nothing carries.</> });
    if (healths.length >= 2 && Math.max(...healths) - Math.min(...healths) >= 35) risks.push({ sev: "low", title: "two folders in one", plain: `health runs ${Math.min(...healths)}–${Math.max(...healths)} — quality depends on which file you touch.`, body: <>Health runs {Math.min(...healths)}–{Math.max(...healths)} — the quality you get depends on WHICH file you touch; a consistency smell more than a single defect.</> });
  }
  const sevTone = (s: string) => (s === "high" ? C.bad : s === "medium" ? C.warn : C.dim);
  const nLia = Math.min(3, Math.ceil(members.length / 2));
  const nPri = Math.min(3, members.length - nLia);

  // ── EFFECT SIZES (§5) — the distribution quantified: mean/median/σ over health, Gini over
  // violation counts (0 = spread evenly, 1 = one file carries everything). Pure arithmetic.
  const vioCounts = members.map((m) => byFile.get(m.path)?.length ?? 0);
  const gini = (() => { const tot = vioCounts.reduce((a, b) => a + b, 0); if (!tot || vioCounts.length < 2) return 0; const s2 = [...vioCounts].sort((a, b) => a - b); const n = s2.length; const cum = s2.reduce((a, x, i) => a + (i + 1) * x, 0); return Math.max(0, Math.min(1, (2 * cum) / (n * tot) - (n + 1) / n)); })();
  const stdev = healths.length ? Math.sqrt(healths.reduce((a, h) => a + (h - (avg ?? 0)) ** 2, 0) / healths.length) : 0;
  const medianH = healths.length ? [...healths].sort((a, b) => a - b)[Math.floor((healths.length - 1) / 2)] : null;

  // ── SENSITIVITY (§10) — the model's own derivative: recompute each member's compliance with one
  // law hypothetically swept, on the file formula (max(10, 100 − min(90, Σ round(w×c)))); the folder
  // level is approximated as the mean of members — the assumption is printed in §14.
  const sens = (() => {
    const present = AXES.filter((ax) => con.axes?.[ax]?.score != null);
    const wSum = present.reduce((a, ax) => a + (AXIS_W[ax] ?? 0), 0) || 1;
    const wC = AXIS_W.compliance ?? 0;
    const penOf = (arr: any[]) => arr.reduce((a, v) => a + Math.round((v.weight ?? 1) * (v.confidence ?? 1)), 0);
    const scoreOf = (pen: number) => Math.max(10, 100 - Math.min(90, pen));
    const basePer = members.map((m) => scoreOf(penOf(byFile.get(m.path) ?? [])));
    const baseMean = basePer.length ? basePer.reduce((a, b) => a + b, 0) / basePer.length : 100;
    return [...lawFiles.keys()].map((key) => {
      const per = members.map((m) => scoreOf(penOf((byFile.get(m.path) ?? []).filter((v) => v.law_key !== key))));
      const mean2 = per.length ? per.reduce((a, b) => a + b, 0) / per.length : 100;
      const dC = mean2 - baseMean;
      return { key, files: lawFiles.get(key)!.files.size, n: vios.filter((v) => v.law_key === key).length, dC, dH: dC * (wC / wSum) };
    }).filter((x) => x.dC > 0.05).sort((a, b) => b.dC - a.dC).slice(0, 5);
  })();

  // ── EVOLUTION + THE WAGER (§11) — the longitudinal record (when snapshots exist) and a
  // falsifiable prediction priced by the sensitivity model, gradeable on the next rebuild.
  const hist = ((con.history ?? []) as any[]).filter((h) => h?.health != null);
  const wager = sens[0] ?? null;
  const wagerH = wager && con.health != null ? Math.round((con.health as number) + wager.dH) : null;
  const snapId = hist.length ? Math.max(...hist.map((h) => Number(h.snapshot_id ?? 0))) : reg?.prev_snapshot_id != null ? Number(reg.prev_snapshot_id) + 1 : null;

  // ── CONTAGION (§12) — do the folder's habits break OUTSIDE it, and do they travel along the
  // import direction? Crossed from the repo-wide law spread (peers) × the ecosystem's importers.
  const peers2 = (con.peers ?? {}) as Record<string, any>;
  const contagion = patterns.slice(0, 2).map(([key]) => {
    const top = ((peers2[key]?.top ?? []) as any[]).filter((t) => t?.path && String(t.path) !== dir && !String(t.path).startsWith(dir + "/")).slice(0, 3);
    const impTops = new Set(((PR?.importerFolders ?? []) as any[]).map((x) => String(x[0])));
    return { key, outside: top, filesOutside: peers2[key]?.files ?? null, viaImports: top.filter((t) => impTops.has(String(t.path).split("/").slice(0, 2).join("/"))).length };
  }).filter((c2) => c2.outside.length > 0);

  // ── RELATED MODULES (§13) — the sibling folders, fetched once the atlas names them.
  const [sibs, setSibs] = React.useState<any[] | null>(null);
  const sibKey = ((PR?.siblings ?? []) as any[]).map((s2) => s2.dir).join("|");
  React.useEffect(() => {
    let alive = true;
    const list = sibKey ? sibKey.split("|") : [];
    if (!list.length) { setSibs([]); return; }
    void Promise.all(list.map(async (d2) => {
      try { const fc = await fetchFileCon(d2); return { dir: d2, health: fc?.health ?? null, files: fc?.files ?? null }; }
      catch { return { dir: d2, health: null, files: null }; }
    })).then((r2) => { if (alive) setSibs(r2); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sibKey]);

  // ── THREATS TO VALIDITY (§15) — each fires from a stated condition; the last is standing.
  const avgConf = vios.length ? vios.reduce((a, v) => a + (v.confidence ?? 1), 0) / vios.length : 1;
  const threats: { t: string; d: React.ReactNode }[] = [];
  if (vios.length && avgConf < 0.97) threats.push({ t: "internal validity", d: <>Mean detector confidence is {avgConf.toFixed(2)} — {Math.round((1 - avgConf) * 100)}% of the penalty mass rides on sub-certain matches; the compliance number carries that uncertainty.</> });
  if (boundaryR.label === "tangled" || boundaryR.label === "leaky") threats.push({ t: "construct validity", d: <>The boundary reads {boundaryR.label} ({boundaryR.observation}) — the folder may not match the conceptual module; every folder-level aggregate inherits that doubt.</> });
  if (!testsNote.measured) threats.push({ t: "measurement", d: <>{testsNote.text}</> });
  if (reg && reg.comparable === false) threats.push({ t: "longitudinal validity", d: <>Snapshot #{reg.prev_snapshot_id} was judged by {reg.laws_changed ? "different laws" : `a different instrument (${reg.prev_engineering_version ?? "?"})`}; the {reg.health_delta >= 0 ? "+" : ""}{reg.health_delta} in §12 is a baseline reset, not a trend.</> });
  if (roster && roster.glue > 0) threats.push({ t: "population", d: <>{roster.glue} of {roster.total} members are glue — {GLUE_RULE}. The cover number ({con.health ?? "—"}) includes them; the logic-only mean is {con.health_logic ?? avg ?? "—"}.</> });
  threats.push({ t: "external validity", d: <>Health is a static proxy: runtime behavior, latency, memory and production impact were not measured and sit outside this paper's claims.</> });

  // ── THE CITATION — a deterministic identity + BibTeX, so a paper can cite a paper.
  const citeId = `antiloki:folder-paper/${dir}@${snapId != null ? `snap-${snapId}` : "latest"}`;
  const bibtex = `@techreport{antiloki_${(folderName || "folder").replace(/[^\w]+/g, "_")}${snapId != null ? `_s${snapId}` : ""},\n  title       = {The State of ${dir}/: ${members.length} Files Pressed into One Health Number},\n  author      = {{The Detectors} and {The Seven Axes} and {The Import Graph}},\n  institution = {antiloki --- deterministic instruments},\n  year        = {${new Date().getFullYear()}},\n  note        = {${citeId} · health ${con.health ?? "—"} · \\$0 compute, reproducible on rebuild}\n}`;
  // ── THE CORPUS (operator 2026-07-26: "papers must cite one another") — this paper registers
  // itself (idempotent by cite_id) and asks for the literature around it: prior editions (their
  // projections graded against today), papers on neighbor dirs, and the newest of the rest.
  const [related, setRelated] = React.useState<any>(null);
  const pressedRef = React.useRef(false);
  React.useEffect(() => {
    if (!E || pressedRef.current) return;
    pressedRef.current = true;
    // THE CLAIM INVENTORY (⛶ podcast, operator 2026-07-27): the paper's own computed variables,
    // pressed as receipted claims — the $0 reasoning-session compiler feeds on EXACTLY this.
    const claims = [
      { id: "health", sec: "§1", n: { health: con.health ?? null, files: members.length } },
      healths.length >= 2 ? { id: "spread", sec: "§4", n: { min: Math.min(...healths), max: Math.max(...healths), spread: Math.max(...healths) - Math.min(...healths) } } : null,
      patterns[0] ? { id: "habit", sec: "§6", n: { law: patterns[0][0], nfiles: patterns[0][1].files.size } } : null,
      risks[0] ? { id: "risk", sec: "§9", n: { risk: risks[0].title, plain: risks[0].plain } } : null,
      sens[0] ? { id: "leverage", sec: "§11", n: { law: sens[0].key, gain: sens[0].dC.toFixed(1), nfiles: sens[0].files } } : null,
      E ? { id: "eco", sec: "§8", n: { blast: E.blast, cohesion: E.cohesion ?? null } } : null,
      wager && wagerH != null ? { id: "wager", sec: "§12", n: { law: wager.key, wagerH, actual: con.health ?? null, missed: reg != null && Math.abs((con.health ?? 0) - wagerH) > 5 ? 1 : 0 } } : null,
      { id: "identity", sec: "§2", n: { role: role ? role.split(" — ")[0] : null, pressure: pressure[0], subject: dir, files: members.length } },
      axesSorted[0] ? { id: "axis", sec: "§5", n: { ax: axesSorted[0].ax, s: axesSorted[0].s } } : null,
      { id: "history", sec: "§12", n: { snapshots: hist.length } },
    ].filter(Boolean);
    const findings = { health: con.health ?? null, pressure: pressure[0], pressure_raw: pressureRaw, role: role ? role.split(" — ")[0] : null, boundary: boundary[0].split(" · ")[0], wagerH, habit: patterns[0]?.[0] ?? null, claims };
    const dirs = [
      ...(((PR?.siblings ?? []) as any[]).map((x) => String(x.dir))),
      ...(((E?.deps ?? []) as any[]).map((x) => String(x.folder))),
      ...(((PR?.importerFolders ?? []) as any[]).map((x) => String(x[0]))),
    ];
    void apiPost(`/api/v1/paper/store`, { op: "press", cite_id: citeId, kind: "folder", subject: dir, snapshot_id: snapId ?? undefined, title: `The State of ${dir}/`, findings }, { timeoutMs: 15000 }).catch(() => null);
    void apiPost(`/api/v1/paper/store`, { op: "related", subject: dir, dirs }, { timeoutMs: 15000 })
      .then((r2: any) => setRelated(r2?.result?.result ?? r2?.result ?? r2)).catch(() => setRelated(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [E]);
  const [apx, setApx] = React.useState(false); // Appendix A — the complete record, collapsed
  const [vc, setVc] = React.useState(false);   // ▶ the video class (the antiDocs ClassPlayer, silent)
  // ♪ THE PAPER, SPOKEN (operator 2026-07-27: "test on a folder paper like a play button") — the
  // deck's speech fields ARE the narration script (written to be heard, deterministic); compile
  // them to nir-1 ($0, instant), then press the voice locally (Kokoro — honest CPU-minutes shown).
  // ♪ one click: compile the deck's spoken script to nir-1 ($0, instant), then hand the press to
  // the GLOBAL narration jobs (bottom-right dock) — switch screens freely, it keeps working.
  const [narr, setNarr] = React.useState<{ busy: boolean; narrationId?: number; err?: string }>({ busy: false });
  React.useEffect(() => { setNarr({ busy: false }); }, [dir]); // another folder, another voice
  // ⛶ the podcast — compile the reasoning session server-side ($0) and hand it to the global dock
  const [pcBusy, setPcBusy] = React.useState(false);
  const [pcSeed, setPcSeed] = React.useState<number | null>(null);
  const [pcObjective, setPcObjective] = React.useState<"curious" | "skeptic">("curious");
  React.useEffect(() => { setPcSeed(null); }, [dir]);

  // the HOST CONTROLS popover (operator: "controls to choose hosts voice and personality, then a
  // generate button") — opened by the two buttons, generation fires only on the Generate click.
  const [pcCfg, setPcCfg] = React.useState<null | { cast: boolean }>(null);
  const [voiceA, setVoiceA] = React.useState("af_heart");
  const [voiceB, setVoiceB] = React.useState("bm_george");
  const podcast = async (seed: number, opts?: { cast?: boolean }): Promise<void> => {
    setPcBusy(true);
    try {
      const r: any = await apiPost("/api/v1/reasoning/manage", { op: "compile", cite_id: citeId, seed, reasoner: pcObjective, voices: { a: voiceA, b: voiceB }, visuals: !!opts?.cast }, { timeoutMs: 30000 }).catch(() => null);
      const d2 = r?.result?.result ?? r?.result ?? r;
      if (!d2?.ok) { setNarr((cur) => ({ ...cur, err: "podcast compile failed — is the paper pressed with claims? (open it once after the BE restart)" })); return; }
      setPcSeed(d2.seed);
      // EVERYTHING renders in the background, in the corner (operator 2026-07-27: no screen
      // freeze, no partial playback): both kinds press fully; the dock unlocks ▶ when done, and
      // a finished video-cast expands to the film from its 🎬 button.
      void startNarrationJob(d2.narration_id, `${opts?.cast ? "🎬" : "⛶"} ${folderName}/ · ${d2.mode} · seed ${d2.seed}`, { autostart: true, kind: opts?.cast ? "video-cast" : "podcast", meta: opts?.cast ? { sessionId: d2.session_id } : undefined });
    } finally { setPcBusy(false); }
  };
  // the read-along cursor: which narration section is SPEAKING right now (bar mode, this paper's job)
  const narrIdRef = React.useRef<number | null>(null);
  narrIdRef.current = narr.narrationId ?? null;
  const [nowTopic, setNowTopic] = React.useState<string | null>(null);
  React.useEffect(() => subNarr(() => {
    const pl = narrPlayback();
    const jid = narrIdRef.current;
    if (!pl || jid == null || pl.jobId !== jid || pl.mode !== "bar" || !pl.playing) { setNowTopic(null); return; }
    setNowTopic(narrJob(jid)?.segs[pl.idx]?.title ?? null);
  }), []);
  React.useEffect(() => { // the page follows the voice
    if (!nowTopic) return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-narr-topic]"));
    const hit = nodes.find((el) => (el.dataset.narrTopic ?? "").split("|").some((p) => nowTopic.toLowerCase().startsWith(p.toLowerCase())));
    hit?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [nowTopic]);
  const narrCompile = async (deck: any, opts?: { autostart?: boolean }): Promise<number | null> => {
    // (the deck rides the job when this is the VIDEO CLASS — the shelf copy can reopen the film)
    setNarr((cur) => ({ ...cur, busy: true }));
    const text = (deck.slides as any[]).map((s2: any) => `## ${s2.topic}\n\n${s2.speech}`).join("\n\n");
    const r: any = await apiPost("/api/v1/narration/manage", { op: "compile", source_kind: "paper", source_key: citeId, title: deck.title, text }, { timeoutMs: 30000 }).catch(() => null);
    const d2 = r?.result?.result ?? r?.result ?? r;
    if (!d2?.ok) { setNarr({ busy: false, err: "compile failed — BE restarted with the narration actions?" }); return null; }
    setNarr({ busy: false, narrationId: d2.narration_id });
    void startNarrationJob(d2.narration_id, `The State of ${folderName}/`, { autostart: opts?.autostart, kind: opts?.autostart ? "video-class" : "paper-read", meta: opts?.autostart ? { deck } : undefined });
    return d2.narration_id as number;
  };

  // ── THE SUBJECT's identity (critique round 2): purpose QUOTED from the README — never guessed.
  // AUDITED 2026-07-27: the code atlas indexes CODE only (no .md anywhere in code.sqlite), so the
  // old probe was doomed for EVERY folder — two guaranteed [ACTION-DIAG] errors in the BE log per
  // paper visit (StrictMode doubles the effect), and the quote never once landed. Don't fire a
  // request the index says cannot succeed. When the atlas learns markdown, restore:
  //   fileRead({ path: `${dir}/README.md` }) → first non-heading line, sliced to 170.
  const readme = "none" as string | "none" | null;
  // PRESSURE — "how urgently should I care", distinct from "how good": formula printed in the card.
  const pressureRaw = Math.round(0.45 * (100 - (con.health ?? 100)) + Math.min(35, (E?.blast ?? 0) * 1.5) + Math.min(20, vios.length * 0.8));
  const pressure: [string, string] = pressureRaw >= 80 ? ["critical", C.bad] : pressureRaw >= 60 ? ["high", C.warn] : pressureRaw >= 40 ? ["moderate", "oklch(0.78 0.13 90)"] : pressureRaw >= 20 ? ["low", C.ok] : ["dormant", C.dim];
  const spreadH = healths.length >= 2 ? Math.max(...healths) - Math.min(...healths) : 0;
  const TONE = { ok: C.ok, bad: C.bad, muted: C.muted, dim: C.dim } as const;
  const trajR = trajectoryReading(reg, con.engineering_version);
  const trajectory: [string, string] = [trajR.text, TONE[trajR.tone]];
  const boundaryTone = boundaryR.label === "sealed" ? C.ok : boundaryR.label === "layered" ? C.muted : boundaryR.label === "unmeasured" ? C.dim : C.warn;
  const boundary: [string, string] = [boundaryR.text, boundaryTone];
  // the ARCHITECTURAL DNA — ✓/✗/— chips, each with its rule; no adjectives without predicates.
  const dna: { on: boolean | null; t: string; rule: string }[] = [
    { on: boundaryR.label === "unmeasured" ? null : boundaryR.label === "sealed" || boundaryR.label === "layered", t: boundaryR.label === "unmeasured" ? "boundary unmeasured" : boundaryR.label === "sealed" ? "high cohesion" : boundaryR.label === "layered" ? "layered dependencies" : `boundary ${boundaryR.label}`, rule: boundaryR.rule },
    { on: E ? (E.entries as any[]).length <= 2 : null, t: "thin public API", rule: "≤2 entry files" },
    { on: healths.length >= 2 ? spreadH < 25 : null, t: "uniform quality", rule: "health spread <25" },
    { on: patterns.length === 0, t: patterns.length ? `habit: ${patterns[0][0].slice(0, 22)}` : "no habit laws", rule: "no law breaking in ≥2 files" },
    { on: E ? E.orphans.length === 0 : null, t: E && E.orphans.length ? "unlinked members" : "fully wired", rule: "0 members without imports" },
    { on: trajR.kind === "none" || trajR.kind === "reset" ? null : trajR.kind !== "regressing", t: trajR.kind === "none" ? "no trend yet" : trajR.kind === "reset" ? "baseline reset" : trajR.kind === "drift" ? "holding (cohort drift)" : trajR.kind, rule: "health Δ ≥0 since a COMPARABLE snapshot (same laws, same instrument); |Δ|≤2 with no law change = drift" },
  ];

  // ── §17 CONCLUSION — the synthesis, assembled from the paper's own strongest signals; the
  // prescription is ORDERED and every step points back at the section that proves it.
  const verdictCross =
    (con.health ?? 100) >= 75 && pressureRaw >= 60 ? "healthy on paper yet under high pressure — quality is not the issue here; exposure is"
    : (con.health ?? 100) < 60 && pressureRaw < 40 ? "sick but quiet — the debt is real, yet little of the project inherits it; schedule the work, don't panic it"
    : (con.health ?? 100) < 60 && pressureRaw >= 60 ? "sick AND load-bearing — this is where the project's next incident is most likely to be born"
    : "in working order — no crossing of sickness and exposure demands urgency";
  const danger0 = E ? ((E.traffic as any[]) ?? []).map((t2: any) => ({ ...t2, h: hOf(t2.path) })).filter((t2: any) => t2.h != null && t2.h < 70 && t2.tin >= 1).sort((a2: any, b2: any) => b2.tin - a2.tin)[0] : null;
  const prescription: { t: React.ReactNode; ref: string }[] = [];
  const prescriptionPlain: string[] = [];
  if (sens[0]) { prescription.push({ ref: "§11", t: <>Sweep <code style={{ fontSize: FS.small }}>{sens[0].key}</code> folder-wide — the single best move, worth <b style={{ color: C.ok }}>+{sens[0].dC.toFixed(1)}</b> mean compliance ({sens[0].n} hit{sens[0].n === 1 ? "" : "s"} in {sens[0].files} file{sens[0].files === 1 ? "" : "s"}).</> }); prescriptionPlain.push(`sweep ${sens[0].key} — worth +${sens[0].dC.toFixed(1)} compliance`); }
  if (danger0) { prescription.push({ ref: "§7", t: <>Operate on {fileBtn(danger0.path)} next — health {danger0.h} with {danger0.tin} import{danger0.tin === 1 ? "" : "s"} arriving: the sickest load-bearing organ.</> }); prescriptionPlain.push(`operate on ${String(danger0.path).split("/").pop()} — sick and load-bearing`); }
  else if (sick[0]) { prescription.push({ ref: "§10", t: <>Operate on {fileBtn(sick[0].path)} next — the sickest member (health {sick[0].health ?? "—"}).</> }); prescriptionPlain.push(`operate on ${String(sick[0].path).split("/").pop()} — the sickest member`); }
  const highRisk = risks.find((r2) => r2.sev === "high");
  if (highRisk) { prescription.push({ ref: "§9", t: <>Close the register's top crossing: <b>{highRisk.title}</b>.</> }); prescriptionPlain.push(`close the top risk: ${highRisk.title}`); }
  if (testsNote.measured && (con.axes?.tests?.score ?? 100) < 50 && (E?.blast ?? 0) > 3) { prescription.push({ ref: "§5", t: <>Put a net under the traffic — the tests axis scores {con.axes?.tests?.score} while {E.blast} outside files land here.</> }); prescriptionPlain.push("put a test net under the traffic"); }
  else if (!testsNote.measured && (E?.blast ?? 0) > 3) { prescription.push({ ref: "§5", t: <>Measure the net — the tests axis is unmeasured here while {E.blast} outside files land on this folder; a coverage run (or a test that imports a member) turns absence of evidence into a number.</> }); prescriptionPlain.push("measure test coverage — the axis is unmeasured"); }
  if (E?.orphans?.length) { prescription.push({ ref: "§8", t: <>Rule on the unlinked member{E.orphans.length === 1 ? "" : "s"} ({(E.orphans as string[]).map((p2, i2) => <span key={p2}>{i2 > 0 ? ", " : ""}{fileBtn(p2)}</span>)}) — do they belong in this folder at all?</> }); prescriptionPlain.push("rule on the unlinked members"); }
  if (boundaryR.label === "tangled" || boundaryR.label === "leaky") { prescription.push({ ref: "§8", t: <>Redraw the boundary — it reads <b>{boundaryR.label}</b> ({boundaryR.observation}): move the sibling-crossing wiring in, or the members that belong elsewhere out.</> }); prescriptionPlain.push(`redraw the boundary — ${boundaryR.label}`); }
  prescription.push({ ref: "§12", t: <>Rebuild after the work — Evolution extends the record and the wager gets graded: verified or falsified, in print.</> }); prescriptionPlain.push("rebuild — the record extends, the wager gets graded");

  // ── THE VIDEO CLASS (operator 2026-07-26 v2: "didactic — explain in a simple manner, with
  // details, slower; prove the allegations with CODE; 3–5 minutes"): a DETERMINISTIC deck pressed
  // from this paper — plain-language narration that defines every term it uses, and code-exhibit
  // slides that show the real source behind each claim. Played by the CinematicPlayer.
  const buildDeck = () => {
    const worst = members[0]; const bestM = members[members.length - 1];
    const exhibitOf = (path: string, v: any, title: string) => {
      if (!v) return undefined;
      const rows = hunk(path, v.line);
      if (rows) return { type: "code-exhibit", title, payload: { lines: rows, sick: v.line, label: `§ ${v.law_key}`, note: v.fix ? String(v.fix).slice(0, 80) : String(v.title ?? "").slice(0, 80) } };
      if (v.evidence) return { type: "code-exhibit", title, payload: { lines: String(v.evidence).split("\n").slice(0, 6).map((t2: string, ix: number) => ({ ln: (v.line ?? 1) + ix, text: t2 })), sick: v.line ?? 1, label: `§ ${v.law_key}`, note: "the detector's recorded evidence" } };
      return undefined;
    };
    const dangerFiles = E ? ((E.traffic as any[]) ?? []).map((t2) => ({ ...t2, h: hOf(t2.path) })).filter((t2) => t2.h != null && t2.h < 70 && t2.tin >= 1).sort((a, b) => b.tin - a.tin).slice(0, 3) : [];
    const roleSimple = !role ? null
      : role.startsWith("a foundation") ? "a foundation. That means the project stands on top of it — many files depend on it, while it depends on little."
      : role.startsWith("a load-bearing connector") ? "a connector. It carries a big part of the project on its shoulders, and it also leans on a lot of the project itself. Traffic flows through it in both directions."
      : role.startsWith("an application shell") ? "an application shell. It consumes the rest of the project to build what the user sees, but almost nothing imports it back."
      : role.startsWith("an island") ? "an island. It is barely wired to the rest of the project — it neither carries much, nor leans on much."
      : "a working organ. It has moderate traffic in both directions — a normal, living part of the project.";
    return {
      title: `The State of ${folderName}/ — video class`,
      slides: [
        // 1 · the abstract, spoken — real numbers from the paper, zero meta
        { topic: `The State of ${folderName}/`, speech: `We press ${members.length} file${members.length === 1 ? "" : "s"} into one number and defend it: ${con.health ?? "unknown"}. ${avg != null && healths.length >= 2 ? `The average member sits at ${avg}; the population runs ${Math.min(...healths)} to ${Math.max(...healths)}. ` : ""}The detectors recorded ${vios.length} violation${vios.length === 1 ? "" : "s"} across ${sick.length} of the ${members.length} files${high ? `, ${high} of them high severity` : ""}. ${patterns.length ? `One law — ${patterns[0][0]} — breaks in ${patterns[0][1].files.size} files: a habit, not an accident. ` : ""}${PR ? `Transitively, ${PR.downPct} percent of the codebase would feel this folder break. ` : ""}${role ? `Read together, the instruments classify it as ${role.split(" — ")[0]}, under ${pressure[0]} pressure.` : ""}`, bullets: [`health ${con.health ?? "—"} · pressure ${pressure[0]}`, `${vios.length} violation${vios.length === 1 ? "" : "s"} · ${clean}/${members.length} clean · $0 compute`] },
        // 3 · identity in the project
        PR ? { topic: "what kind of folder is this?", widget: { type: "flow", title: "its place in the project", payload: { steps: [`the codebase · ${PR.files} files`, `${folderName}/ · ${members.length} files (${PR.share}%)`, `${PR.downPct}% would feel it break`, `it needs ${PR.upPct}% standing`] } }, speech: `First, identity. The whole codebase holds ${PR.files} files; ${folderName} holds ${members.length} of them — ${PR.share} percent. If it broke, ${PR.downPct} percent of the project would transitively feel it. For it to work, it needs ${PR.upPct} percent of the project standing underneath. Read together, the instruments classify it as ${roleSimple ?? "unclassified — the atlas was unavailable"} Its pressure is ${pressure[0]} — pressure asks how urgently the vitals matter, which is a different question from how good they are.` } : null,
        // 3b · the anatomy — the generated docs' knowledge
        E?.docs ? { topic: "what lives inside", widget: { type: "layers", title: "the symbol census — from the generated docs", payload: { layers: [`${E.docs.fn} functions — the verbs`, `${E.docs.comp} components — the visible parts`, `${E.docs.hook} hooks — shared behaviors`, ...(E.docs.cls ? [`${E.docs.cls} classes — the objects`] : [])] } }, speech: `The generated docs read the folder symbol by symbol — ${E.docs.defs} definitions in all. The mix matters more than the count: by composition this reads as ${String(E.docs.profile).split(" (")[0]}.${(E.docs.shapes as any[]).length ? ` The docs also recognize ${(E.docs.shapes as any[]).map((s3: any) => `${s3.names.length} ${s3.kind}${s3.names.length === 1 ? "" : "s"}`).join(", ")} — named shapes, detected by convention.` : ""}` } : null,
        E?.docs?.api?.length ? { topic: "the real public surface", widget: { type: "graph-focus", title: "symbols the outside actually calls", payload: { files: (E.docs.api as any[]).slice(0, 7).map((a3: any) => `${a3.name} ×${a3.n}`), note: "the true API — measured, not declared" } }, speech: `And here is the folder's REAL public surface — not what it exports, but what outside code actually calls, counted on the def-level edges. ${(E.docs.api as any[])[0].name} carries the most traffic${(E.docs.api as any[])[0].intent ? `. The docs describe it like this: ${String((E.docs.api as any[])[0].intent).slice(0, 110)}` : ""}. Everything else is implementation detail.` } : null,
        // 4 · the spectrum
        { topic: "the spectrum — worst to best", widget: { type: "balance", title: "the two ends of the folder", payload: { left: { label: "the liabilities", items: members.slice(0, 3).map((m) => `${m.path.split("/").pop()} · health ${m.health ?? "—"}`) }, right: { label: "the pride", items: [...members].slice(-3).reverse().map((m) => `${m.path.split("/").pop()} · health ${m.health ?? "—"}`) }, verdict: healths.length ? `the average file sits at ${avg} · the spread runs ${Math.min(...healths)} to ${Math.max(...healths)}` : undefined } }, speech: `Now the population. Every file gets its own health number, and the folder's number is the pressure of all of them together. ${worst && worst.health != null ? `The sickest file is ${worst.path.split("/").pop()}, at ${worst.health}.` : ""} ${bestM && bestM.health != null && bestM.path !== worst?.path ? `The healthiest is ${bestM.path.split("/").pop()}, at ${bestM.health}.` : ""} ${healths.length >= 2 && Math.max(...healths) - Math.min(...healths) >= 35 ? "When the gap is this wide, the quality you experience depends entirely on which file you happen to touch." : "The population is fairly uniform — what you see in one file, you get in the others."}` },
        // 5 · the vitals
        axesSorted.length ? { topic: "the vitals — one organism", widget: { type: "axes", title: "the seven axes", payload: { axes: axesSorted.map((x) => ({ ax: x.ax, s: x.s })) } }, speech: `The folder is also scored as ONE organism, across seven axes — the same instruments a single file faces. ${axesSorted[0] && (axesSorted[0].s as number) < 70 ? `The weak organ is ${axesSorted[0].ax}, at ${axesSorted[0].s}. Whatever file you open in this folder, that is the drag you will find first.` : `No axis falls below seventy, which means the weaknesses here are local to individual files — not a disease of the whole module.`}` } : null,
        // 6 · the habit
        patterns.length ? { topic: "the habit", widget: { type: "graph-focus", title: `one law, many files`, payload: { files: [...patterns[0][1].files].slice(0, 7), note: `§ ${patterns[0][0]}` } }, speech: `Here is the most important pattern in the whole paper. The rule ${patterns[0][0]} does not break in one place — it breaks in ${patterns[0][1].files.size} different files. That is not a coincidence, and it is not one developer's bad day. It is a habit of this folder — which means the fix is not one patch. You fix the pattern once, agree on it, and then sweep every file.` } : null,
        // 7 · the habit, PROVEN in code
        patterns.length && patternInsts[0] ? { topic: "the proof, in the source", widget: exhibitOf(patternInsts[0].path, patternInsts[0].v, `${patternInsts[0].path.split("/").pop()} — the habit, caught`), speech: `An allegation is worth nothing without the code. This is the real source of ${patternInsts[0].path.split("/").pop()}${patternInsts[0].line != null ? `, line ${patternInsts[0].line}` : ""}. The highlighted line is where ${patterns[0][0]} breaks. ${patternInsts[0].v?.fix ? `The detector even recorded the fix: ${String(patternInsts[0].v.fix).slice(0, 100)}.` : "The same shape repeats in the sibling files — same law, same fix."}` } : null,
        // 8 · the worst case, proven
        cases[0] && caseExhibits[0]?.charge ? { topic: `the worst case — ${cases[0].path.split("/").pop()}`, widget: exhibitOf(caseExhibits[0].path, caseExhibits[0].v ?? { line: caseExhibits[0].line, evidence: caseExhibits[0].charge!.kind === "axis" ? `${caseExhibits[0].charge!.ax} ${caseExhibits[0].charge!.score} — ${caseExhibits[0].charge!.because}` : "" }, `health ${cases[0].health ?? "—"} — the heaviest charge`), speech: `The sickest file deserves its own slide. ${cases[0].path.split("/").pop()} sits at health ${cases[0].health ?? "unknown"}. On screen is its heaviest single charge — ${caseExhibits[0].charge!.kind === "axis" ? `the ${caseExhibits[0].charge!.ax} axis at ${caseExhibits[0].charge!.score}: ${caseExhibits[0].charge!.because}` : `the law ${(caseExhibits[0].charge as any).law_key}`} — the one costing the most health. Start here: it is the highest-value fix in the folder.` } : null,
        // 9 · the ecosystem
        E ? { topic: "the ecosystem", widget: { type: "flow", title: "how the folder breathes", payload: { steps: [`outside · ${E.blast} file${E.blast === 1 ? "" : "s"} lean on it`, `${E.inboundTotal} imports come in`, `${folderName}/ · cohesion ${E.cohesion ?? "—"}%`, `${E.outbound} imports go out`, (E.deps as any[])[0] ? `mostly to ${(E.deps as any[])[0].folder}/` : "self-contained"] } }, speech: `Zoom out to the ecosystem. ${E.blast} outside file${E.blast === 1 ? " leans" : "s lean"} on this folder, sending ${E.inboundTotal} import${E.inboundTotal === 1 ? "" : "s"} in; ${E.outbound} go out. Cohesion is ${E.cohesion ?? "unknown"} percent — remember, that is the share of wiring that stays inside the walls. ${E.cohesion != null && E.cohesion >= 50 ? "More than half stays in: the folder behaves like a real module, with a life of its own." : "Less than half stays in: this folder talks to the outside more than to itself, which usually means the boundary is drawn in the wrong place."}` } : null,
        // 10 · the danger corner
        dangerFiles.length ? { topic: "the danger corner", widget: { type: "balance", title: "sick × load-bearing", payload: { left: { label: "⚠ sick AND load-bearing", items: dangerFiles.map((t2: any) => `${String(t2.path).split("/").pop()} · health ${t2.h} · ${t2.tin} imports arrive`) }, right: { label: "why it matters", items: ["a break here travels", "every importer inherits the bugs", "fix these before anything else"] } } }, speech: `One more lens: danger is not just being sick — it is being sick AND load-bearing at the same time. ${dangerFiles.map((t2: any) => String(t2.path).split("/").pop()).join(", ")} ${dangerFiles.length === 1 ? "lives" : "live"} in that corner: low health, high traffic. When a file like that breaks, the break does not stay home — it travels to every file that imports it.` } : null,
        // 11 · the risks
        risks.length ? { topic: "the risk register", widget: { type: "repair-order", title: `${risks.length} computed risk${risks.length === 1 ? "" : "s"}`, payload: { steps: risks.slice(0, 5).map((r2) => `${r2.sev.toUpperCase()} — ${r2.title}`) } }, speech: `The paper computes its risks — none of them are opinions; each one fires from a stated threshold. The top of the register: ${risks[0].plain} ${risks.length > 1 ? `And ${risks.length - 1} more crossing${risks.length === 2 ? "" : "s"} follow it, each citing its files in the paper.` : ""}` } : null,
        // 12 · the leverage
        sens.length ? { topic: "the leverage — the single best move", widget: { type: "repair-order", title: "what one fix is worth", payload: { steps: sens.map((s2) => `sweep ${s2.key} → +${s2.dC.toFixed(1)} compliance across ${s2.files} file${s2.files === 1 ? "" : "s"}`) } }, speech: `If you only have one afternoon, spend it here. The formulas recomputed the folder's compliance with each law hypothetically swept away. Sweeping ${sens[0].key} is worth ${sens[0].dC.toFixed(1)} points of compliance on the average member — the biggest single lever the arithmetic can find. This is not advice; it is a derivative.` } : null,
        // 13 · evolution & the wager
        { topic: "the wager", widget: hist.length >= 2 ? { type: "timeline", title: "the record so far", payload: { events: [...hist.slice(-6).map((h) => ({ label: `#${h.snapshot_id} · ${h.health}` })), ...(wagerH != null ? [{ label: `next: ≈${wagerH}?` }] : [])] } } : undefined, speech: wager && wagerH != null ? `The paper ends with a falsifiable bet. If ${wager.key} is fully swept and nothing else changes, the arithmetic prices the folder's health at about ${wagerH}. Pure projection — no judgment involved. The next rebuild will grade this wager in print: verified, or falsified.` : `The paper wants to place a bet about the future, but it needs at least two snapshots to be graded. Rebuild after the next round of work, and this slide becomes the folder's medical file.`, bullets: reg ? [`since snapshot #${reg.prev_snapshot_id}: health ${reg.health_delta != null ? (reg.health_delta >= 0 ? `+${reg.health_delta}` : reg.health_delta) : "—"} · ${(reg.fixed ?? []).length} fixed · ${(reg.new ?? []).length} new`] : undefined },
        // 14 · the conclusion
        { topic: "the conclusion", widget: prescriptionPlain.length ? { type: "repair-order", title: "the prescription, in order", payload: { steps: prescriptionPlain.slice(0, 5) } } : undefined, speech: `So what does it all add up to? ${folderName} is ${role ? role.split(" — ")[0] : "an unclassified module"} under ${pressure[0]} pressure — ${verdictCross}. The prescription is ordered by leverage: start at the top, and after the work, rebuild — the record extends and the wager gets graded.` },
        // 15 · sources
        { topic: "sources & citation", bullets: [`${members.length} member file${members.length === 1 ? "" : "s"} — every one a source`, "instruments: detectors · judge · atlas graph · docs layer · source reader", citeId], speech: `Everything you just watched is reproducible: rebuild the codebase and every number returns. The sources list names the files AND the instruments — the detectors, the judge, the atlas, the generated docs. The paper carries a citation identity, so the next paper about this folder can cite this one — and grade its wager. Not a report. A record.` },
      ].filter(Boolean),
    };
  };

  // ── THE EXHIBITS (operator 2026-07-26: "prove the allegations with the code itself") — the paper
  // quotes real source. Two exhibit sets, both deterministic: the top habit law caught in up to 3
  // DIFFERENT files (§5 — the habit is code, not a diagram), and each case's heaviest charge (§9).
  // Sources are fetched once (capped at the worst 8 cases), sliced ±3 lines around the sick line;
  // when a source or line is unavailable the paper quotes the detector's stored evidence instead.
  const patternInsts = React.useMemo(() => {
    if (!patterns.length) return [] as { path: string; line: number | null; v: any }[];
    const [key] = patterns[0];
    const seen2 = new Set<string>(); const out: { path: string; line: number | null; v: any }[] = [];
    for (const v of vios) { const p = v.path ?? ""; if (v.law_key === key && p && !seen2.has(p)) { seen2.add(p); out.push({ path: p, line: v.line ?? null, v }); if (out.length >= 3) break; } }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vios]);
  // THE CASES (2026-09-12): a file is a case when it is sick — health <70 — OR carries a
  // violation; worst health first. The old roster developed only violation-bearing files, so a
  // file dragged to 52 by its structure (cognitive 26, nesting 4) with one cosmetic law hit was
  // exhibited for the law and never for the structure that actually cost it.
  const cases = React.useMemo(() => members.filter((m) => (m.health != null && m.health < 70) || (byFile.get(m.path)?.length ?? 0) > 0), [members, byFile]);
  // the HEAVIEST CHARGE per case, laws and axes on one scale (health points lost) — the exhibit
  // `heaviest` is what the prose names; `charge` is what the code exhibit shows — the heaviest
  // charge that has a line in the source (tests/coupling/change are whole-file facts with no line)
  const caseExhibits = React.useMemo(() => cases.slice(0, 8).map((m) => {
    const heaviest = pickCharge((byFile.get(m.path) ?? []) as any, (m as any).axes);
    const charge = pickExhibit((byFile.get(m.path) ?? []) as any, (m as any).axes);
    return { path: m.path, heaviest, charge, v: charge?.kind === "law" ? charge.v : null, line: charge?.kind === "law" ? charge.v.line ?? null : charge?.kind === "axis" ? charge.line : null };
  }), [cases, byFile]);
  const [srcs, setSrcs] = React.useState<Record<string, string[] | null>>({});
  const exhibitKey = [...new Set([...patternInsts.map((x) => x.path), ...caseExhibits.map((x) => x.path)])].join("|");
  React.useEffect(() => {
    let alive = true;
    const want = exhibitKey ? exhibitKey.split("|") : [];
    if (!want.length) { setSrcs({}); return; }
    void Promise.all(want.map(async (p) => {
      try { const s3: any = await fileRead({ path: p }); return [p, s3?.content ? String(s3.content).split("\n") : null] as const; }
      catch { return [p, null] as const; }
    })).then((pairs) => { if (alive) setSrcs(Object.fromEntries(pairs)); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhibitKey]);
  const hunk = (p: string, line: number | null | undefined, pad = 3): { ln: number; text: string }[] | null => {
    const L2 = srcs[p]; if (!L2 || line == null) return null;
    const lo = Math.max(1, line - pad), hi = Math.min(L2.length, line + pad);
    return Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => ({ ln: lo + i, text: (L2[lo + i - 1] ?? "").slice(0, 160) }));
  };
  const evidenceBlock = (v: any, note: React.ReactNode) => !v?.evidence ? null : (
    <figure style={{ margin: "10px 0", padding: 0 }}>
      <code style={{ display: "block", fontFamily: mono, fontSize: FS.small, color: SEV_TONE[v.severity] ?? C.warn, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 8px", whiteSpace: "pre-wrap", maxWidth: 720 }}>{String(v.evidence).slice(0, 220)}</code>
      <figcaption style={{ fontSize: FS.small, color: C.dim, marginTop: 3, maxWidth: 720 }}>{note}</figcaption>
    </figure>
  );

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", fontFamily: mono, padding: "14px 18px 30px", minWidth: 0 }}>
      {/* ⬇ the toolbar — outside the exported node so it never appears inside the paper itself */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, position: "relative" }}>
        {/* THE FOUR MEDIA BUTTONS ARE NOT READY (operator 2026-10-11: "hide the buttons, not the functionality: play the paper, podcast, video cast, video class - blurred with soon, so no user tries them; in the future we will have it"). Only these buttons: the export
            buttons beside them stay. Shipped builds draw them blurred and unclickable; the dev build draws them live (`devOnly`), so the code behind them keeps being worked on. */}
        <SoonInline on={!devOnly()} title="play the paper, the podcast, the video cast and the video class are coming in a future version">
        <button onClick={() => { armAudio(); void narrCompile(buildDeck()); }} disabled={narr.busy}
          title="the whole paper, spoken — pressed per section in the background (bottom-right dock); §1 plays while the rest press"
          style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "1px 11px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>
          {narr.busy ? "⏳" : "♪ play the paper"}
        </button>
        {/* ⛶ THE PODCAST — a $0 reasoning session: two voices (Guide ♀ · Reasoner ♂), typed moves,
            seeded from the paper's own claims. 🎲 re-rolls the seed — same facts, another walk. */}
        <button onClick={() => setPcCfg(pcCfg?.cast === false ? null : { cast: false })} disabled={pcBusy}
          title="⛶ the podcast — pick the hosts, then generate: $0, no AI call anywhere, reproducible by seed; the player docks bottom-right"
          style={{ background: "transparent", border: `1px solid ${pcCfg?.cast === false ? C.brand : C.border}`, color: C.muted, borderRadius: 6, padding: "1px 11px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>
          {pcBusy ? "⏳" : "⛶ podcast"}
        </button>
        <button onClick={() => setPcCfg(pcCfg?.cast === true ? null : { cast: true })} disabled={pcBusy}
          title="🎬 video cast — the podcast as a film: slides, host orbs breathing with the waveform, subtitles colored per voice. Pick the hosts, then generate."
          style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 45%, ${C.border})`, color: C.brand, borderRadius: 6, padding: "1px 11px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>
          {pcBusy ? "⏳" : "🎬 video cast"}
        </button>
        {pcCfg != null && (() => {
          const VOICES2: Array<[string, string]> = [["af_heart", "Heart · US ♀ warm"], ["af_bella", "Bella · US ♀ bright"], ["af_nicole", "Nicole · US ♀ soft"], ["am_adam", "Adam · US ♂ deep"], ["am_michael", "Michael · US ♂ even"], ["bf_emma", "Emma · UK ♀ documentary"], ["bm_george", "George · UK ♂ professor"], ["bm_lewis", "Lewis · UK ♂ crisp"]];
          const sel = (v: string, set: (x: string) => void, label: string) => (
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, fontFamily: mono, fontSize: 8.5, color: C.dim }}>
              {label}
              <select value={v} onChange={(e) => set(e.target.value)} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: mono, fontSize: 8.5, padding: "1px 4px" }}>
                {VOICES2.map(([id, l2]) => <option key={id} value={id} style={{ background: C.panel }}>{l2}</option>)}
              </select>
            </label>
          );
          return (
            <div style={{ position: "absolute", top: 26, right: 0, zIndex: 60, width: 250, display: "flex", flexDirection: "column", gap: 8, padding: "11px 13px", borderRadius: 12, background: `color-mix(in oklab, ${C.panel} 74%, transparent)`, backdropFilter: "blur(16px) saturate(1.2)", WebkitBackdropFilter: "blur(16px) saturate(1.2)", border: `1px solid color-mix(in oklab, ${C.border} 78%, ${C.brand})`, boxShadow: "0 14px 38px rgba(0,0,0,.45)" }}>
              <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>{pcCfg.cast ? "🎬 video cast" : "⛶ podcast"} — the hosts</span>
              {sel(voiceA, setVoiceA, "guide")}
              {sel(voiceB, setVoiceB, "reasoner")}
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, fontFamily: mono, fontSize: 8.5, color: C.dim }}>
                personality
                <select value={pcObjective} onChange={(e) => setPcObjective(e.target.value as any)} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: mono, fontSize: 8.5, padding: "1px 4px" }}>
                  <option value="curious" style={{ background: C.panel }}>curious — asks why</option>
                  <option value="skeptic" style={{ background: C.panel }}>skeptic — asks: are we sure?</option>
                  <option value="devil" style={{ background: C.panel }}>devil{"'"}s advocate — argues the other side</option>
                </select>
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { armAudio(); const cast = pcCfg.cast; setPcCfg(null); void podcast(pcSeed ?? 1, { cast }); }} disabled={pcBusy}
                  style={{ flex: 1, background: `color-mix(in oklab, ${C.brand} 16%, transparent)`, border: `1px solid ${C.brand}`, color: C.brand, borderRadius: 7, padding: "3px 10px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>
                  {pcBusy ? "⏳ generating…" : "▶ generate ($0)"}
                </button>
                <button onClick={() => setPcCfg(null)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>✕</button>
              </div>
            </div>
          );
        })()}
        {pcSeed != null && (
          <button onClick={() => { armAudio(); void podcast(((pcSeed * 1664525 + 1013904223) >>> 0) % 999983 || 7); }} disabled={pcBusy}
            title={`🎲 re-roll — new seed, same facts, another path through the bounded set (current seed ${pcSeed}, printed in the receipt)`}
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 6, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>🎲</button>
        )}
        {narr.err && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.bad }}>{narr.err}</span>}
        <button
          onClick={() => {
            armAudio();
            const jid = narr.narrationId;
            const job = jid != null ? narrJob(jid) : undefined;
            if (job && job.segs.length > 0 && job.segs.every((s: any) => !!s.buffer)) { setVc(true); return; } // fully rendered → the film opens
            void narrCompile(buildDeck(), { autostart: true }); // else: press in the corner, come back when ready
          }}
          title="the VOICED video class — first click presses the narration in the corner (background); when it is fully rendered, the button opens the film"
          style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 45%, ${C.border})`, color: C.brand, borderRadius: 6, padding: "1px 11px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>
          {(() => { const j2 = narr.narrationId != null ? narrJob(narr.narrationId) : undefined; return j2 && j2.segs.length > 0 && j2.segs.every((s: any) => !!s.buffer) ? "▶ video class (ready)" : j2 && j2.pressStarted ? "⏳ pressing class…" : "▶ video class"; })()}
        </button>
        </SoonInline>
        <ExportButtons getNode={() => paperRef.current} title={`the folder paper · ${folderName}`} size={9} />
      </div>
      {vc && (
        <React.Suspense fallback={
          <div style={{ position: "fixed", inset: 0, zIndex: 1500, background: "rgba(5,5,7,.9)", display: "grid", placeItems: "center" }}>
            <div style={{ fontFamily: mono, fontSize: 13, color: C.muted, animation: "loki-hub 1.2s ease-in-out infinite" }}>🎬 loading the projector…</div>
          </div>
        }>
          <CinematicPlayerLazy deck={buildDeck()} onClose={() => setVc(false)} narrationId={narr.narrationId ?? null} />
        </React.Suspense>
      )}
      <div ref={paperRef}>
      {/* TITLE · AUTHORS · SCOPE */}
      <div style={{ textAlign: "center", marginTop: 6 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: C.fg, lineHeight: 1.35, maxWidth: 680, margin: "0 auto" }}>The State of {folderName}/: {members.length} File{members.length === 1 ? "" : "s"} Pressed into One Health Number</div>
        <div style={{ fontSize: FS.base, color: C.muted, marginTop: 8 }}>
          The Detectors<sup style={{ color: C.dim }}>1</sup>, The Seven Axes<sup style={{ color: C.dim }}>2</sup> and The Import Graph<sup style={{ color: C.dim }}>3</sup>
        </div>
        <div style={{ fontSize: FS.small, color: C.dim, marginTop: 3 }}>deterministic instruments of this workspace — no model spoke; every sentence below is a measurement</div>
        <div style={{ fontSize: FS.small, color: C.dim, marginTop: 2 }}>
          cases: {members.length} file{members.length === 1 ? "" : "s"} · violations: {vios.length} · population: the latest snapshot · recorded cost $0.0000
        </div>
      </div>

      {/* ABSTRACT — one claim; the findings sit BESIDE it, not inside it (critique r3) */}
      <div data-narr-topic="The State of " style={{ margin: "18px 34px 0", transition: "background .6s ease", ...(nowTopic != null && nowTopic.startsWith("The State of ") ? { background: `color-mix(in oklab, ${C.brand} 7%, transparent)`, borderRadius: 8 } : {}) }}>
        <div style={{ textAlign: "center", fontSize: FS.base, color: C.fg, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>ABSTRACT</div>
        <p style={{ fontSize: FS.base, lineHeight: 1.85, color: C.fg, textAlign: "justify", margin: 0 }}>
          We press {con.files ?? members.length} file{(con.files ?? members.length) === 1 ? "" : "s"} into one number and defend it: <b style={{ color: conTone(con.health) }}>{con.health ?? "—"}</b>
          {roster && roster.glue > 0 ? <> ({roster.logic} logic scored on all seven axes, {roster.glue} glue on laws and defects only; the logic-only mean is <b>{con.health_logic ?? avg ?? "—"}</b>)</> : null}.
          {avg != null && logicHealths.length >= 2 ? <> The logic members run {Math.min(...logicHealths)}–{Math.max(...logicHealths)}.</> : null}
          {" "}The detectors recorded {vios.length} violation{vios.length === 1 ? "" : "s"} across {sick.length} of the {members.length} file{members.length === 1 ? "" : "s"}{high ? <>, {high} of them high-severity</> : null}.
          {patterns.length ? <> One law — <code style={{ fontSize: FS.small }}>{patterns[0][0]}</code> — breaks in {patterns[0][1].files.size} files: a habit, not an accident.</> : null}
          {E ? <> The import graph places the folder in its ecosystem: {E.internal} internal link{E.internal === 1 ? "" : "s"}{E.cohesion != null ? ` (cohesion ${E.cohesion}%)` : ""}, {E.inboundTotal} import{E.inboundTotal === 1 ? "" : "s"} arriving from {E.blast} outside file{E.blast === 1 ? "" : "s"}{PR ? <>; transitively, {PR.downPct}% of the codebase would feel it break</> : null}.</> : null}
          {role ? <> Read together, the subject is <b>{role.split(" — ")[0]}</b> under <b style={{ color: pressure[1] }}>{pressure[0]}</b> pressure.</> : null}
          {wager && wagerH != null ? <> The projection: sweep <code style={{ fontSize: FS.small }}>{wager.key}</code> and health prices at ≈{wagerH} — §12 stakes the wager; the next rebuild grades it.</> : null}
          {" "}Every number below is a measurement; every name arrives by a printed rule.
        </p>
        {/* PRINCIPAL FINDINGS — the executive card, separated from the prose */}
        <div style={{ textAlign: "center", fontSize: FS.small, color: C.dim, fontWeight: 700, letterSpacing: 2, margin: "14px 0 6px" }}>PRINCIPAL FINDINGS</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            ["health", String(con.health ?? "—"), conTone(con.health)],
            ["pressure", pressure[0], pressure[1]],
            ["boundary", boundary[0].split(" · ")[0], boundary[1]],
            ...(role ? [["role", role.split(" — ")[0].replace(/^an? /, ""), C.fg]] : []),
            ...(PR ? [["blast", `${PR.downPct}% of the codebase`, PR.downPct >= 15 ? C.warn : C.muted]] : []),
            ...(patterns.length ? [["habit", `${patterns[0][0].slice(0, 22)} ×${patterns[0][1].files.size} files`, C.warn]] : []),
            ...(vios.length >= 4 ? [["gini", gini.toFixed(2), C.muted]] : []),
            ["violations", `${vios.length} · ${clean}/${members.length} clean`, vios.length ? C.warn : C.ok],
          ].map(([l3, v3, t3], i3) => (
            <span key={i3} style={{ fontFamily: mono, fontSize: FS.small, border: `1px solid color-mix(in oklab, ${t3 as string} 40%, ${C.border})`, borderRadius: 6, padding: "2px 9px", color: t3 as string }}>
              <span style={{ color: C.dim }}>{l3}</span>&ensp;<b>{v3}</b>
            </span>
          ))}
        </div>
        <p style={{ fontSize: FS.small, lineHeight: 1.8, color: C.dim, textAlign: "justify", margin: "12px 0 0" }}>
          Sections 2–16 place the folder in the project, open the anatomy the docs know, lay out the spectrum, the vitals, the admissions with their effect sizes, the pride and the liabilities, the ecosystem, the risks, every case with its code, the leverage, the longitudinal record, the contagion, the related modules, the instruments and the threats to validity; §17 presses it all into a conclusion with an ordered prescription; Appendix A reproduces the complete record and the sources — files AND instruments — close it.
        </p>
      </div>

      {/* 1 · THE SUBJECT — identity before health: the card, the DNA, the MRI */}
      <Sec n="1" title="The subject">
        {(() => {
          const IdRow = ({ l, v, tone }: { l: string; v: React.ReactNode; tone?: string }) => (
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", borderBottom: `1px solid color-mix(in oklab, ${C.border} 40%, transparent)`, padding: "3.5px 0", minWidth: 0 }}>
              <span style={{ width: 118, flexShrink: 0, fontSize: FS.small, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6 }}>{l}</span>
              <span style={{ fontSize: FS.base + 0.5, color: tone ?? C.fg, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span>
            </div>
          );
          const sibRank = sibs && sibs.length ? (() => { const all2 = [{ h: con.health ?? -1, self: true }, ...sibs.map((s2: any) => ({ h: s2.health ?? -1, self: false }))].sort((a2, b2) => b2.h - a2.h); const pos = all2.findIndex((x) => x.self) + 1; return `${pos} of ${all2.length} siblings`; })() : null;
          return (
            <>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "0 26px", background: `color-mix(in oklab, ${C.panel2} 55%, transparent)` }}>
                <IdRow l="folder" v={<b>{dir}/</b>} />
                <IdRow l="role" v={<b>{role ? role.split(" — ")[0] : "needs the atlas"}</b>} />
                <IdRow l="purpose" v={readme == null ? "reading README…" : readme === "none" ? <span style={{ color: C.dim }}>undeclared — one README line fixes this</span> : <i>«{readme}»</i>} />
                <IdRow l="population" v={<>{con.files ?? members.length} files · {E?.docs ? `${E.docs.defs} symbols` : "— symbols"}</>} />
                <IdRow l="roster" v={<span title={GLUE_RULE}>{rosterLine(roster, snapId)}</span>} />
                <IdRow l="composition" v={E?.docs ? E.docs.profile.split(" (")[0] : "—"} />
                <IdRow l="public surface" v={E ? ((E.entries as any[]).length ? <>{(E.entries as any[]).length} door{(E.entries as any[]).length === 1 ? "" : "s"} · {(E.entries as any[]).slice(0, 2).map((x: any) => x.path.split("/").pop()).join(", ")}</> : "no doors") : "—"} />
                <IdRow l="wiring" v={E ? <>{E.internal} internal · {E.inboundTotal} in · {E.outbound} out</> : "—"} />
                <IdRow l="boundary" v={boundary[0]} tone={boundary[1]} />
                <IdRow l="health" v={<b style={{ fontVariantNumeric: "tabular-nums" }}>{con.health ?? "—"}</b>} tone={conTone(con.health)} />
                <IdRow l="pressure" v={<b>{pressure[0]} ({pressureRaw})</b>} tone={pressure[1]} />
                <IdRow l="trajectory" v={trajectory[0]} tone={trajectory[1]} />
                <IdRow l="standing" v={sibRank ?? "no siblings at this level"} />
                {hist.length > 0 && (() => { const hs = [...hist].sort((a2, b2) => (a2.snapshot_id ?? 0) - (b2.snapshot_id ?? 0)); const first = hs[0]; const bestH = Math.max(...hs.map((h2) => h2.health), con.health ?? -Infinity); const worstH = Math.min(...hs.map((h2) => h2.health), con.health ?? Infinity); return (
                  <>
                    <IdRow l="first observed" v={String(first?.created_at ?? "").slice(0, 10) || `snapshot #${first?.snapshot_id ?? "—"}`} />
                    <IdRow l="the record" v={<>{hs.length} snapshot{hs.length === 1 ? "" : "s"} · best <b style={{ color: conTone(bestH) }}>{bestH}</b> · worst <b style={{ color: conTone(worstH) }}>{worstH}</b>{con.engineering_version ? <span style={{ color: C.dim }}> · instrument {con.engineering_version}</span> : null}</>} />
                  </>
                ); })()}
                {hist.length === 0 && <IdRow l="the record" v={<span style={{ color: C.dim }}>begins here — this is the first snapshot</span>} />}
              </div>
              {/* the DNA — trait chips, every one a predicate */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "9px 0 2px" }}>
                {dna.map((t2, i2) => (
                  <span key={i2} title={`rule: ${t2.rule}`} style={{ fontFamily: mono, fontSize: FS.small, border: `1px solid color-mix(in oklab, ${t2.on == null ? C.dim : t2.on ? C.ok : C.warn} 45%, ${C.border})`, color: t2.on == null ? C.dim : t2.on ? C.ok : C.warn, borderRadius: 6, padding: "1px 8px" }}>
                    {t2.on == null ? "—" : t2.on ? "✓" : "✗"} {t2.t}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: FS.small, color: C.dim, lineHeight: 1.6, marginBottom: 4 }}>
                pressure = 0.45·(100−health) + min(35, 1.5·blast) + min(20, 0.8·violations); bands at 20/40/60/80. Every DNA chip's rule shows on hover — no adjectives without predicates.
              </div>
              {/* the MRI — the one-image anatomy of the organism */}
              {E && (E.traffic as any[])?.length > 1 && (() => {
                const items = (E.traffic as any[]).map((t2: any) => ({ path: t2.path, tin: t2.tin, h: hOf(t2.path) })).sort((a2: any, b2: any) => b2.tin - a2.tin).slice(0, 31);
                const W3 = 560, H3 = 330, cx3 = W3 / 2, cy3 = H3 / 2;
                const pos = new Map<string, { x: number; y: number }>();
                items.forEach((it: any, i2: number) => {
                  if (i2 === 0) { pos.set(it.path, { x: cx3, y: cy3 }); return; }
                  const ring = i2 < 7 ? 1 : i2 < 19 ? 2 : 3;
                  const start = ring === 1 ? 1 : ring === 2 ? 7 : 19;
                  const cnt = ring === 1 ? Math.min(6, items.length - 1) : ring === 2 ? Math.min(12, items.length - 7) : Math.max(1, items.length - 19);
                  const ang = ((i2 - start) / cnt) * Math.PI * 2 + ring * 0.55;
                  const r3 = ring === 1 ? 74 : ring === 2 ? 126 : 158;
                  pos.set(it.path, { x: cx3 + Math.cos(ang) * r3 * 1.45, y: cy3 + Math.sin(ang) * r3 * 0.82 });
                });
                const R = (tin: number) => 7 + Math.min(19, Math.sqrt(tin + 1) * 4.2);
                return (
                  <Fig n={fig()} caption={<>The MRI: every member an organ — <b>size = traffic</b> (imports arriving), <b>color = health</b>, <b>nerves = internal imports</b> (thickness = count). One image of the organism; labels mark the busiest organs. Click an organ to open its review (§10).</>}>
                    <svg viewBox={`0 0 ${W3} ${H3}`} style={{ width: "100%", maxWidth: 700, display: "block", overflow: "visible" }}>
                      {((E.pairs as any[]) ?? []).map((pr2: any, i2: number) => {
                        const a2 = pos.get(pr2.a), b2 = pos.get(pr2.b);
                        if (!a2 || !b2) return null;
                        return <path key={i2} d={`M ${a2.x} ${a2.y} Q ${(a2.x + b2.x) / 2 + (i2 % 2 ? 16 : -16)} ${(a2.y + b2.y) / 2} ${b2.x} ${b2.y}`} fill="none" stroke={`color-mix(in oklab, ${C.brand} 30%, ${C.border})`} strokeWidth={Math.min(3.6, 0.7 + pr2.n * 0.7)} opacity={0.55} />;
                      })}
                      {items.map((it: any) => {
                        const p2 = pos.get(it.path)!;
                        return (
                          <g key={it.path} onClick={() => onOpenFile(it.path)} style={{ cursor: "pointer" }}>
                            <circle cx={p2.x} cy={p2.y} r={R(it.tin)} fill={`color-mix(in oklab, ${conTone(it.h)} 30%, ${C.panel})`} stroke={conTone(it.h)} strokeWidth={1.6}>
                              <title>{`${it.path} · health ${it.h ?? "—"} · traffic ${it.tin}`}</title>
                            </circle>
                          </g>
                        );
                      })}
                      {items.slice(0, 8).map((it: any) => { const p2 = pos.get(it.path)!; return <text key={`l-${it.path}`} x={p2.x} y={p2.y + R(it.tin) + 11} textAnchor="middle" fill={C.muted} style={{ fontFamily: mono, fontSize: 8.5 }}>{String(it.path).split("/").pop()}</text>; })}
                    </svg>
                  </Fig>
                );
              })()}
            </>
          );
        })()}
        <P>
          This paper asks a bigger question than "how good is the code": <b>what kind of architectural organism is {folderName}/, and how is it evolving?</b> The card above is the patient sheet — every field measured or quoted, none guessed. Health is one vital among several; pressure says how urgently the vitals matter.
          {members[0] && members[0].health != null ? <> The number is dragged from below by {fileBtn(members[0].path)} ({members[0].health}){best && best.path !== members[0].path && best.health != null ? <> and held up by {fileBtn(best.path)} ({best.health})</> : null}.</> : null}
        </P>
        <P><span style={{ color: C.dim, fontSize: FS.small }}>Section 2 places the folder inside the project; §3 opens the anatomy the generated docs know — symbols, shapes, the real public surface; §4 shows the population at a glance; §5 reads the vitals; §6 records what the numbers admit, with effect sizes and the habit proven in source; §7 separates the pride from the liabilities; §8 leaves the lines for the ecosystem; §9 registers the risks; §10 develops the cases worst-first{sick[0] ? ` (beginning at ${sick[0].path.split("/").pop()})` : ""}, each with its code exhibit; §11 prices the leverage; §12 keeps the longitudinal record and places the wager; §13 traces the habits beyond the wall; §14 situates the folder among its siblings; §15 opens the instruments; §16 confesses the limits; §17 concludes and prescribes. Appendix A reproduces the complete record. Every claim is clickable.</span></P>
      </Sec>

      {/* 2 · THE FOLDER IN THE PROJECT */}
      <Sec n="2" title="The folder in the project" narr="what kind of folder is this?">
        {!E || !PR ? <P><span style={{ color: C.muted }}>{eco === "loading" ? "◆ reading the atlas…" : "The atlas is unavailable — rebuild the codebase and this section lights up with the project-relation evidence."}</span></P> : (
          <>
            <P>
              {folderName}/ holds <b>{members.length}</b> of the codebase's <b>{PR.files}</b> files ({PR.share}%) and touches {PR.edgeShare}% of every import edge in the atlas — "the codebase" always means the whole atlas, never this folder.
              {" "}Transitively, <b>{PR.down}</b> outside file{PR.down === 1 ? "" : "s"} ({PR.downPct}% of the project) would feel this folder breaking, while the folder itself needs <b>{PR.up}</b> outside file{PR.up === 1 ? "" : "s"} ({PR.upPct}%) standing before it works.
              {PR.importerFolders.length ? <> Demand arrives from {PR.importerFolders.length} corner{PR.importerFolders.length === 1 ? "" : "s"} of the project — {PR.importerFolders.map((x: any, i: number) => <span key={x[0]}>{i > 0 ? ", " : ""}<b>{x[0]}/</b> ({x[1]})</span>)}.</> : <> Nothing outside demands it directly.</>}
              {role ? <> Read together, the instruments classify it as <b>{role}</b>.</> : null}
            </P>
            {/* the LADDER — evidence, observation, classification kept apart (critique r2 §1) */}
            <div style={{ margin: "0 0 11px", fontFamily: mono, fontSize: FS.base, lineHeight: 1.9, borderLeft: `2px solid ${C.border}`, paddingLeft: 11 }}>
              <div><span style={{ color: C.dim }}>measurement</span> — downstream {PR.downPct}% · upstream {PR.upPct}% · share {PR.share}%</div>
              <div><span style={{ color: C.dim }}>observation</span> — {PR.downPct >= PR.upPct ? "more of the project depends on it than it depends on the project" : "it depends on more of the project than depends on it"}</div>
              <div><span style={{ color: C.dim }}>classification</span> — <b style={{ color: C.fg }}>{role ? role.split(" — ")[0] : "—"}</b> <span style={{ color: C.dim, fontSize: FS.small }}>(thresholds 20% / 5–15%, fixed)</span></div>
            </div>
            <Fig n={fig()} caption={<>The folder's position in the project. x — how much of the project it transitively needs ({PR.upPct}%); y — how much of the project transitively needs it ({PR.downPct}%). The quadrant labels use fixed thresholds (20% / 5–15%), stated so the classification is checkable, not vibes.</>}>
              {(() => { const qx = 30 + (Math.min(PR.upPct, 50) / 50) * 300; const qy = 175 - (Math.min(PR.downPct, 50) / 50) * 145; return (
                <svg viewBox="0 0 380 200" style={{ width: "100%", maxWidth: 480, display: "block", overflow: "visible" }}>
                  <line x1={30} y1={175} x2={340} y2={175} stroke={C.border} strokeWidth={1.2} />
                  <line x1={30} y1={175} x2={30} y2={20} stroke={C.border} strokeWidth={1.2} />
                  <line x1={30} y1={97} x2={340} y2={97} stroke={C.border} strokeDasharray="4 4" opacity={0.6} />
                  <line x1={185} y1={175} x2={185} y2={20} stroke={C.border} strokeDasharray="4 4" opacity={0.6} />
                  <text x={340} y={190} textAnchor="end" fill={C.dim} style={{ fontFamily: mono, fontSize: 8 }}>needs the project →</text>
                  <text transform="rotate(-90 16 100)" x={16} y={100} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 8 }}>the project needs it →</text>
                  <text x={100} y={40} textAnchor="middle" fill={C.dim} opacity={0.7} style={{ fontFamily: mono, fontSize: 8 }}>foundation</text>
                  <text x={262} y={40} textAnchor="middle" fill={C.dim} opacity={0.7} style={{ fontFamily: mono, fontSize: 8 }}>connector</text>
                  <text x={100} y={168} textAnchor="middle" fill={C.dim} opacity={0.7} style={{ fontFamily: mono, fontSize: 8 }}>island</text>
                  <text x={262} y={168} textAnchor="middle" fill={C.dim} opacity={0.7} style={{ fontFamily: mono, fontSize: 8 }}>application shell</text>
                  <circle cx={qx} cy={qy} r={7} fill={`color-mix(in oklab, ${conTone(con.health)} 30%, transparent)`} stroke={conTone(con.health)} strokeWidth={1.6} />
                  <text x={Math.min(qx + 11, 300)} y={qy + 3} fill={C.fg} style={{ fontFamily: mono, fontSize: 8.5, fontWeight: 700 }}>{folderName}/</text>
                </svg>
              ); })()}
            </Fig>
          </>
        )}
      </Sec>

      {/* 3 · THE ANATOMY — what the generated docs know */}
      <Sec n="3" title="The anatomy — what the docs know" narr="what lives inside|the real public surface">
        {!E?.docs ? <P><span style={{ color: C.dim }}>{eco === "loading" ? "◆ reading the atlas's def layer…" : "The def layer is unavailable — rebuild the codebase and the anatomy lights up."}</span></P> : (() => { const D = E.docs; return (
          <>
            <P>
              The generated docs read the folder symbol by symbol: <b>{D.defs}</b> definition{D.defs === 1 ? "" : "s"} — {D.fn} function{D.fn === 1 ? "" : "s"}, {D.comp} component{D.comp === 1 ? "" : "s"}, {D.hook} hook{D.hook === 1 ? "" : "s"}{D.cls ? <>, {D.cls} class{D.cls === 1 ? "" : "es"}</> : null}.
              {" "}By composition the instruments classify it as <b>{D.profile}</b>{(D.shapes as any[]).length ? <>; recognizable shapes: {(D.shapes as any[]).map((s3: any, i3: number) => <span key={s3.kind}>{i3 > 0 ? ", " : ""}<b>{s3.names.length}</b> {s3.kind}{s3.names.length === 1 ? "" : "s"}</span>)} <span style={{ color: C.dim, fontSize: FS.small }}>(detected by name convention — Provider / Context / store / make·create — the rule printed so the claim is checkable)</span></> : null}.
              {(D.api as any[])[0] ? <> The load-bearing symbol is <code style={{ fontSize: FS.small }}>{(D.api as any[])[0].name}</code> in {fileBtn((D.api as any[])[0].file)}, reached from outside {(D.api as any[])[0].n} time{(D.api as any[])[0].n === 1 ? "" : "s"}{(D.api as any[])[0].intent ? <> — the docs describe it: <i>«{String((D.api as any[])[0].intent).slice(0, 140)}»</i></> : null}.</> : null}
            </P>
            <Fig n={fig()} caption={<>The composition, member by member: λ functions · ⚛ components · ⚓ hooks{D.cls ? " · ◻ classes" : ""}, each card tinted by the file's health. The mix — not the size — is what names the folder's profile.</>}>
              {(() => { const pf = (D.perFile as any[]).slice(0, 16); const cols = 4; const rows = Math.ceil(pf.length / cols); return (
                <svg viewBox={`0 0 640 ${rows * 56 + 12}`} style={{ width: "100%", maxWidth: 720, display: "block", overflow: "visible" }}>
                  {pf.map((f2: any, i2: number) => {
                    const x = 6 + (i2 % cols) * 158, y = 6 + Math.floor(i2 / cols) * 56;
                    const h2 = hOf(f2.path);
                    return (
                      <g key={f2.path} transform={`rotate(${i2 % 2 ? 0.7 : -0.7} ${x + 74} ${y + 22})`} onClick={() => onOpenFile(f2.path)} style={{ cursor: "pointer" }}>
                        <rect x={x} y={y} width={148} height={44} rx={8} fill={`color-mix(in oklab, ${conTone(h2)} 7%, ${C.panel})`} stroke={`color-mix(in oklab, ${conTone(h2)} 45%, ${C.border})`} strokeWidth={1.3} />
                        <text x={x + 9} y={y + 17} fill={C.fg} style={{ fontFamily: mono, fontSize: 9.5 }}>{String(f2.path).split("/").pop()?.slice(0, 19)}</text>
                        <text x={x + 9} y={y + 34} fill={C.muted} style={{ fontFamily: mono, fontSize: 9 }}>{`λ${f2.fn} ⚛${f2.comp} ⚓${f2.hook}${D.cls ? ` ◻${f2.cls}` : ""}`}</text>
                      </g>
                    );
                  })}
                  {(D.perFile as any[]).length > 16 && <text x={634} y={rows * 56 + 6} textAnchor="end" fill={C.dim} style={{ fontFamily: mono, fontSize: 9 }}>＋ {(D.perFile as any[]).length - 16} more files</text>}
                </svg>
              ); })()}
            </Fig>
            {(D.api as any[]).length > 0 && (
              <Fig n={fig()} caption={<>The public surface, symbol by symbol: what outside code ACTUALLY calls (def-level edges from the atlas), with call counts. Narrower than the exports, truer than a README — this is the folder's real API.</>}>
                {(() => { const api2 = (D.api as any[]).slice(0, 6); const H4 = Math.max(120, api2.length * 34 + 30); return (
                  <svg viewBox={`0 0 560 ${H4}`} style={{ width: "100%", maxWidth: 680, display: "block", overflow: "visible" }}>
                    <g transform={`rotate(-0.7 80 ${H4 / 2})`}>
                      <rect x={12} y={H4 / 2 - 26} width={136} height={52} rx={7} fill="none" stroke={C.dim} strokeWidth={1.2} strokeDasharray="5 4" />
                      <text x={80} y={H4 / 2 - 4} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 8.5 }}>the outside world</text>
                      <text x={80} y={H4 / 2 + 12} textAnchor="middle" fill={C.muted} style={{ fontFamily: mono, fontSize: 8 }}>callers</text>
                    </g>
                    {api2.map((a3: any, i3: number) => {
                      const y = 22 + i3 * 34;
                      return (
                        <g key={a3.name + i3}>
                          <path d={`M 150 ${H4 / 2} Q 230 ${(H4 / 2 + y) / 2} 300 ${y}`} fill="none" stroke={`color-mix(in oklab, ${C.brand} 45%, transparent)`} strokeWidth={Math.min(3.4, 1 + a3.n * 0.4)} />
                          <g transform={`rotate(${i3 % 2 ? 0.8 : -0.8} 420 ${y})`}>
                            <rect x={304} y={y - 13} width={232} height={26} rx={7} fill={C.panel2} stroke={C.border} strokeWidth={1.2} />
                            <text x={314} y={y + 4} fill={C.fg} style={{ fontFamily: mono, fontSize: 9.5 }}>{a3.name.slice(0, 22)} <tspan fill={C.brand}>×{a3.n}</tspan> <tspan fill={C.dim}>· {String(a3.file).split("/").pop()?.slice(0, 14)}</tspan></text>
                          </g>
                        </g>
                      );
                    })}
                  </svg>
                ); })()}
              </Fig>
            )}
          </>
        ); })()}
      </Sec>

      {/* 4 · THE SPECTRUM */}
      <Sec n="4" title="The spectrum" narr="the spectrum">
        <P>Each slice below is one member file, ordered worst → best and colored by its measured health. The folder's number is the pressure of this whole strip, not any single slice.</P>
        <Fig n={fig()} caption={<>
          The population of {folderName}/ — {members.length} file{members.length === 1 ? "" : "s"}, worst on the left.
          {" "}{buckets.filter((b) => b.n > 0).map((b, i) => <span key={b.label}>{i > 0 ? " · " : ""}<span style={{ color: b.tone }}>■</span> {b.label}: {b.n}</span>)}.
          {" "}Click a slice to open that file's review (§10).
        </>}>
          <div style={{ display: "flex", height: 30, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}`, maxWidth: 720 }}>
            {members.map((m) => (
              <div key={m.path} onClick={() => onOpenFile(m.path)} title={`${m.path} · health ${m.health ?? "—"}`}
                style={{ flex: 1, background: conTone(m.health), cursor: "pointer", opacity: 0.85 }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.85")} />
            ))}
          </div>
        </Fig>
      </Sec>

      {/* 5 · THE VITALS */}
      <Sec n="5" title="The vitals" narr="the vitals">
        <P>
          The folder is scored like one organism — seven axes, the same instruments a single file faces.
          {axesSorted[0] && (axesSorted[0].s as number) < 70
            ? <> The weak organ is <b style={{ color: conTone(axesSorted[0].s) }}>{axesSorted[0].ax} ({axesSorted[0].s})</b>: whatever member you open, that is the drag you will find first.</>
            : axesSorted.length ? <> No axis falls below 70 — the weaknesses here are local to files, not systemic to the module.</> : null}
        </P>
        {axesSorted.length > 0 && (
          <Fig n={fig()} caption={<>The folder's axes, measured over the aggregated membership. Compliance decomposes into the law book; the rest are engineering measurements (tests, structure, coupling, cohesion, change).</>}>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", maxWidth: 460, display: "flex", flexDirection: "column", gap: 3 }}>
              {AXES.map((ax) => con.axes?.[ax]?.score != null && <AxisRow key={ax} ax={ax} score={con.axes[ax]!.score} />)}
            </div>
          </Fig>
        )}
      </Sec>

      {/* 6 · WHAT THE NUMBERS ADMIT */}
      <Sec n="6" title="What the numbers admit" narr="the habit">
        <P>The distribution, quantified first: mean health <b>{avg ?? "—"}</b> · median <b>{medianH ?? "—"}</b> · σ <b>{stdev.toFixed(1)}</b>; violation inequality <b>Gini {gini.toFixed(2)}</b> <span style={{ color: C.dim, fontSize: FS.small }}>(0 = spread evenly, 1 = one file carries everything)</span>.</P>
        {insights.length === 0
          ? <P>Nothing alarming survives the arithmetic — the folder reads uniform and quiet. The remarks below would appear here the moment a concentration, a pattern or a spread emerged.</P>
          : <>
              <P>The record supports {insights.length} admission{insights.length === 1 ? "" : "s"}, each computed — none narrated:</P>
              {insights.map((x, i) => <Remark key={i} by={x.by}>{x.t}</Remark>)}
            </>}
        {patterns.length > 0 && (() => {
          const laws2 = patterns.slice(0, 4);
          const filesU = [...new Set(laws2.flatMap(([, e2]) => [...e2.files]))].slice(0, 8);
          const LH = Math.max(laws2.length * 40 + 24, filesU.length * 20 + 24);
          const lawY = (i: number) => 30 + i * 40; const fileY = (i: number) => 22 + i * 20;
          const tintL = [C.warn, C.brand, C.muted, C.dim];
          return (
            <Fig n={fig()} caption={<>The habit web: the folder's repeated laws (left) wired to every member they break in (right) — a line means "this law fires in that file". A law with many lines is a house pattern, not a local slip. Click a file to open its review (§10).</>}>
              <svg viewBox={`0 0 560 ${LH}`} style={{ width: "100%", maxWidth: 680, display: "block", overflow: "visible" }}>
                {laws2.map(([k], i) => (
                  <g key={k} transform={`rotate(${i % 2 ? 0.6 : -0.6} 90 ${lawY(i)})`}>
                    <rect x={10} y={lawY(i) - 13} width={162} height={26} rx={6} fill="none" stroke={tintL[i]} strokeWidth={1.2} strokeDasharray="5 4" />
                    <text x={91} y={lawY(i) + 3} textAnchor="middle" fill={tintL[i]} style={{ fontFamily: mono, fontSize: 7 }}>{k.length > 27 ? `${k.slice(0, 26)}…` : k}</text>
                  </g>
                ))}
                {laws2.map(([k, e2], i) => [...e2.files].slice(0, 8).map((f2) => {
                  const j = filesU.indexOf(f2); if (j < 0) return null;
                  return <path key={`${k}→${f2}`} d={`M 174 ${lawY(i)} Q 280 ${(lawY(i) + fileY(j)) / 2} 380 ${fileY(j)}`} fill="none" stroke={tintL[i]} strokeWidth={1} opacity={0.5} />;
                }))}
                {filesU.map((f2, j) => (
                  <text key={f2} x={386} y={fileY(j) + 3} fill={C.fg} onClick={() => onOpenFile(String(f2))}
                    style={{ fontFamily: mono, fontSize: 8, cursor: "pointer" }}>{String(f2).split("/").pop()} <tspan fill={C.dim}>· {hOf(String(f2)) ?? "—"}</tspan></text>
                ))}
              </svg>
            </Fig>
          );
        })()}
        {/* the habit PROVEN — the same law quoted from the source of different files */}
        {patternInsts.length > 0 && (
          <>
            <P>The habit is not a diagram — it is code. The same law, <code style={{ fontSize: FS.small }}>{patterns[0]?.[0]}</code>, caught in the source of {patternInsts.length} different file{patternInsts.length === 1 ? "" : "s"}:</P>
            {patternInsts.map((x) => {
              if (srcs[x.path] === undefined) return <div key={x.path} style={{ fontFamily: mono, fontSize: FS.small, color: C.dim, margin: "6px 0" }}>◆ pulling the source of {x.path.split("/").pop()}…</div>;
              const rows = hunk(x.path, x.line);
              if (rows) return <Listing n={lst()} key={x.path} rows={rows} sickLine={x.line} severity={x.v?.severity}
                caption={<>§ {x.v?.law_key} breaking in <b>{x.path.split("/").pop()}</b> at L{x.line} — {fileBtn(x.path)} for the full review{x.v?.evidence ? <>. Detector evidence: «{String(x.v.evidence).slice(0, 70)}»</> : null}.</>} />;
              return <React.Fragment key={x.path}>{evidenceBlock(x.v, <>the detector's stored evidence from <b>{x.path.split("/").pop()}</b>{x.line != null ? ` · L${x.line}` : ""} (source line unavailable — the record is quoted instead).</>)}</React.Fragment>;
            })}
          </>
        )}
      </Sec>

      {/* 7 · THE BEST AND THE WORST PARTS */}
      <Sec n="7" title="The best and the worst parts" narr="the proof, in the source">
        <P>Zoomed back in, the membership separates cleanly — the record names both ends, and crosses each with its position in the wiring:</P>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16, marginBottom: 6 }}>
          <div style={{ border: `1px solid color-mix(in oklab, ${C.ok} 35%, ${C.border})`, borderRadius: 8, padding: "8px 11px" }}>
            <div style={{ fontSize: FS.base, fontWeight: 700, color: C.ok, marginBottom: 5 }}>the pride</div>
            {members.slice(-nPri).reverse().map((m) => (
              <div key={m.path} style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: FS.small, lineHeight: 2.1, color: C.muted, flexWrap: "wrap" }}>
                <b style={{ color: conTone(m.health), fontSize: FS.base + 1.5, fontVariantNumeric: "tabular-nums", minWidth: 24 }}>{m.health ?? "—"}</b>
                {fileBtn(m.path)}
                {roleTags(m.path).map((t2) => <span key={t2} style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: "0 4px", color: C.dim }}>{t2}</span>)}
                <span style={{ color: C.dim }}>{(byFile.get(m.path)?.length ?? 0) === 0 ? "clean" : `${byFile.get(m.path)!.length} violation${byFile.get(m.path)!.length === 1 ? "" : "s"}`}</span>
              </div>
            ))}
          </div>
          <div style={{ border: `1px solid color-mix(in oklab, ${C.warn} 40%, ${C.border})`, borderRadius: 8, padding: "8px 11px" }}>
            <div style={{ fontSize: FS.base, fontWeight: 700, color: C.warn, marginBottom: 5 }}>the liabilities</div>
            {members.slice(0, nLia).map((m) => (
              <div key={m.path} style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: FS.small, lineHeight: 2.1, color: C.muted, flexWrap: "wrap" }}>
                <b style={{ color: conTone(m.health), fontSize: FS.base + 1.5, fontVariantNumeric: "tabular-nums", minWidth: 24 }}>{m.health ?? "—"}</b>
                {fileBtn(m.path)}
                {roleTags(m.path).map((t2) => <span key={t2} style={{ border: `1px solid color-mix(in oklab, ${C.warn} 45%, ${C.border})`, borderRadius: 4, padding: "0 4px", color: C.warn }}>{t2}</span>)}
                <span style={{ color: C.dim }}>{(byFile.get(m.path)?.length ?? 0) === 0 ? "clean — dragged by axes" : `${byFile.get(m.path)!.length} violation${byFile.get(m.path)!.length === 1 ? "" : "s"}`}</span>
              </div>
            ))}
          </div>
        </div>
        {E && ((E.traffic as any[])?.length ?? 0) > 1 && (() => {
          const tr = (E.traffic as any[]).map((t2) => ({ ...t2, h: hOf(t2.path) })).filter((t2) => t2.h != null);
          if (tr.length < 2) return null;
          const tMax = Math.max(1, ...tr.map((t2: any) => t2.tin));
          const X = (h: number) => 34 + (h / 100) * 380; const Y = (tin: number) => 170 - (tin / tMax) * 135;
          const danger = tr.filter((t2: any) => t2.h < 70 && t2.tin >= Math.max(1, tMax * 0.4)).slice(0, 3);
          return (
            <Fig n={fig()} caption={<>The danger map: every member plotted health (x) × traffic (y — imports arriving from siblings and from outside). The top-left corner is where modules die: sick AND load-bearing. {danger.length ? <>This folder keeps {danger.length} file{danger.length === 1 ? "" : "s"} there — the register (§9) prices it.</> : <>This folder keeps that corner empty.</>} Click a dot to open the file.</>}>
              <svg viewBox="0 0 460 195" style={{ width: "100%", maxWidth: 560, display: "block", overflow: "visible" }}>
                <line x1={34} y1={170} x2={440} y2={170} stroke={C.border} strokeWidth={1.2} />
                <line x1={34} y1={170} x2={34} y2={20} stroke={C.border} strokeWidth={1.2} />
                <line x1={X(70)} y1={170} x2={X(70)} y2={20} stroke={C.border} strokeDasharray="4 4" opacity={0.6} />
                <text x={440} y={184} textAnchor="end" fill={C.dim} style={{ fontFamily: mono, fontSize: 8 }}>health →</text>
                <text transform="rotate(-90 22 95)" x={22} y={95} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 8 }}>traffic →</text>
                <text x={40} y={30} fill={C.bad} opacity={0.85} style={{ fontFamily: mono, fontSize: 8 }}>⚠ sick & load-bearing</text>
                {tr.map((t2: any) => (
                  <g key={t2.path} onClick={() => onOpenFile(t2.path)} style={{ cursor: "pointer" }}>
                    <circle cx={X(t2.h)} cy={Y(t2.tin)} r={4.5} fill={`color-mix(in oklab, ${conTone(t2.h)} 35%, transparent)`} stroke={conTone(t2.h)} strokeWidth={1.3}>
                      <title>{`${t2.path} · health ${t2.h} · traffic ${t2.tin}`}</title>
                    </circle>
                  </g>
                ))}
                {danger.map((t2: any) => <text key={t2.path} x={Math.min(X(t2.h) + 8, 380)} y={Y(t2.tin) - 6} fill={C.bad} style={{ fontFamily: mono, fontSize: 7.5 }}>{String(t2.path).split("/").pop()}</text>)}
              </svg>
            </Fig>
          );
        })()}
      </Sec>

      {/* 8 · BEYOND THE LINES — THE ECOSYSTEM */}
      <Sec n="8" title="Beyond the lines — the ecosystem" narr="the ecosystem|the danger corner">
        {eco === "loading" ? <P><span style={{ color: C.muted }}>◆ reading the atlas…</span></P>
          : !E ? <P><span style={{ color: C.dim }}>The atlas is unavailable — rebuild the codebase and this section lights up with the import-graph evidence.</span></P>
          : (
          <>
            <P>
              A folder is not judged in isolation; it is an organ inside the codebase.
              {" "}{E.blast > 0 ? <><b>{E.blast}</b> outside file{E.blast === 1 ? " leans" : "s lean"} on {folderName}/ through {E.inboundTotal} import{E.inboundTotal === 1 ? "" : "s"}</> : <>Nothing outside imports {folderName}/ — a leaf module (or dead weight)</>};
              {" "}internally its members exchange <b>{E.internal}</b> link{E.internal === 1 ? "" : "s"}{E.cohesion != null ? <> — cohesion <b style={{ color: E.cohesion >= 50 ? C.ok : C.warn }}>{E.cohesion}%</b>, the ladder below keeps the measurement, the observation and the name apart</> : null};
              {" "}and it leans outward on {E.deps.length ? E.deps.map((x: any, i: number) => <span key={x.folder}>{i > 0 ? ", " : ""}<b>{x.folder}/</b> ({x.n})</span>) : <>nothing — self-contained</>}.
            </P>
            <div style={{ margin: "0 0 11px", fontFamily: mono, fontSize: FS.base, lineHeight: 1.9, borderLeft: `2px solid ${C.border}`, paddingLeft: 11 }}>
              <div><span style={{ color: C.dim }}>measurement</span> — internal {E.internal} · in {E.inboundTotal} · out {E.outbound} ({E.outShared ?? 0} down to shared layers · {E.outSibling ?? 0} to siblings · {E.outApp ?? 0} elsewhere){E.cohesion != null ? <> · cohesion {E.cohesion}%</> : null}{E.typeOnly ? <> · {E.typeOnly} type-only import{E.typeOnly === 1 ? "" : "s"} cross the wall (excluded — erased at compile time)</> : null}</div>
              <div><span style={{ color: C.dim }}>observation</span> — {boundaryR.observation}</div>
              <div><span style={{ color: C.dim }}>classification</span> — <b style={{ color: boundary[1] }}>{boundaryR.label === "unmeasured" ? "—" : boundaryR.label === "sealed" ? "sealed module" : boundaryR.label === "layered" ? "layered — depends downward, the correct direction" : boundaryR.label === "tangled" ? "tangled — sibling crossings" : "boundary leakage"}</b> <span style={{ color: C.dim, fontSize: FS.small }}>({boundaryR.rule})</span></div>
            </div>
            <Fig n={fig()} caption={<>The ecosystem, measured: imports in from the outside world (left), the module and its internal cohesion (center), imports out to its dependencies (right). Every number counts distinct import edges in the latest atlas.</>}>
              <svg viewBox="0 0 560 128" style={{ width: "100%", maxWidth: 720, display: "block", overflow: "visible" }}>
                <g>
                  <rect x={14} y={34} width={152} height={56} rx={7} fill="none" stroke={C.dim} strokeWidth={1.2} strokeDasharray="5 4" />
                  <text x={90} y={54} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 8.5 }}>the outside world</text>
                  <text x={90} y={70} textAnchor="middle" fill={E.blast > 8 ? C.warn : C.muted} style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700 }}>{E.blast} file{E.blast === 1 ? "" : "s"} lean on it</text>
                </g>
                <g stroke={C.brand} fill="none" strokeWidth={1.3} strokeLinecap="round">
                  <path d="M 170 52 Q 205 44 238 56" /><path d="M 231 50 L 238 56 L 229 60" />
                  <path d="M 170 76 Q 205 88 238 72" opacity={0.6} /><path d="M 231 78 L 238 72 L 229 67" opacity={0.6} />
                </g>
                <text x={204} y={38} textAnchor="middle" fill={C.brand} style={{ fontFamily: mono, fontSize: 8.5 }}>{E.inboundTotal} imports in</text>
                <g>
                  <rect x={242} y={22} width={136} height={80} rx={9} fill={`color-mix(in oklab, ${conTone(con.health)} 6%, transparent)`} stroke={conTone(con.health)} strokeWidth={1.5} />
                  <text x={310} y={44} textAnchor="middle" fill={C.fg} style={{ fontFamily: mono, fontSize: 10, fontWeight: 700 }}>{folderName}/</text>
                  <text x={310} y={60} textAnchor="middle" fill={C.muted} style={{ fontFamily: mono, fontSize: 8 }}>{members.length} files · {E.internal} internal links</text>
                  {E.cohesion != null && <text x={310} y={76} textAnchor="middle" fill={E.cohesion >= 50 ? C.ok : C.warn} style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700 }}>cohesion {E.cohesion}%</text>}
                  <text x={310} y={92} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 7 }}>health {con.health ?? "—"}</text>
                </g>
                <g stroke={C.dim} fill="none" strokeWidth={1.3} strokeLinecap="round">
                  <path d="M 382 56 Q 415 46 448 58" /><path d="M 441 52 L 448 58 L 439 62" />
                </g>
                <text x={415} y={40} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 8.5 }}>{E.outbound} imports out</text>
                <g>
                  <rect x={452} y={36} width={100} height={52} rx={7} fill="none" stroke={C.dim} strokeWidth={1.2} strokeDasharray="5 4" />
                  <text x={502} y={56} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 8.5 }}>leans on</text>
                  <text x={502} y={70} textAnchor="middle" fill={C.muted} style={{ fontFamily: mono, fontSize: 8 }}>{E.deps.length ? `${E.deps[0].folder}/ +${Math.max(0, E.deps.length - 1)}` : "nothing"}</text>
                </g>
              </svg>
            </Fig>
            <P>
              <b>The public face.</b>{" "}
              {E.entries.length
                ? <>Outside code enters through {E.entries.length === 1 ? "one door" : `${E.entries.length} doors`}: {E.entries.map((x: any, i: number) => <span key={x.path}>{i > 0 ? ", " : ""}{fileBtn(x.path)} (← {x.n})</span>)}. {E.entries.length <= 2 ? "A narrow surface — the module hides its internals well." : "A wide surface — every door is API the outside now depends on."}</>
                : <>No file here is imported from outside the folder. Either this is an application shell (roots are entered by the router, not by imports) — or it is weight nothing carries.</>}
            </P>
            <P>
              <b>The wiring inside.</b>{" "}
              {E.hub ? <>The load-bearing member is {fileBtn(E.hub[0])}, imported by {E.hub[1]} sibling{E.hub[1] === 1 ? "" : "s"} — break it and the module follows. </> : <>No internal hub emerged — members barely lean on each other. </>}
              {E.orphans.length > 0
                ? <span style={{ color: C.warn }}>⚠ {E.orphans.length} member{E.orphans.length === 1 ? " is" : "s are"} unlinked ({E.orphans.map((p: string, i: number) => <span key={p}>{i > 0 ? ", " : ""}{fileBtn(p)}</span>)}) — no imports in or out; the record asks whether they belong in this folder at all.</span>
                : <span style={{ color: C.ok }}>Every member is wired into the module — nothing floats.</span>}
            </P>
          </>
        )}
      </Sec>

      {/* 9 · THE RISK REGISTER */}
      <Sec n="9" title="The risk register" narr="the risk register">
        {risks.length === 0
          ? <P>{E ? <span style={{ color: C.ok }}>No computed crossing fired — the folder's weak spots do not coincide with its load-bearing spots.</span> : <span style={{ color: C.dim }}>The register needs the atlas — rebuild the codebase to compute the crossings.</span>}</P>
          : <>
              <P>The register carries {risks.length} computed crossing{risks.length === 1 ? "" : "s"} of health × position. None are narrated — each fires from a stated threshold and cites its files:</P>
              {risks.map((r2, i) => (
                <div key={i} style={{ margin: "0 0 11px", borderLeft: `2.5px solid ${sevTone(r2.sev)}`, paddingLeft: 11 }}>
                  <div style={{ fontSize: FS.base + 0.5, color: C.fg, fontWeight: 700, marginBottom: 2 }}>
                    R{i + 1} · {r2.title} <span style={{ fontSize: FS.small, color: sevTone(r2.sev), border: `1px solid color-mix(in oklab, ${sevTone(r2.sev)} 45%, ${C.border})`, borderRadius: 4, padding: "0 5px", fontWeight: 400, marginLeft: 5 }}>{r2.sev}</span>
                  </div>
                  <div style={{ fontSize: FS.base, color: C.muted, lineHeight: 1.8, textAlign: "justify" }}>{r2.body}</div>
                </div>
              ))}
            </>}
      </Sec>

      {/* 10 · THE CASES, FILE BY FILE */}
      <Sec n="10" title="The cases, file by file" narr="the worst case">
        {cases.length === 0
          ? <P><span style={{ color: C.ok }}>No member is sick and none carries a violation — the constitution holds across the whole membership and every axis reads above 70.</span> The sources below list every member with its measured health.</P>
          : <>
              <P>The record develops {cases.length} case{cases.length === 1 ? "" : "s"} — every member below health 70 or carrying a violation — worst first. Each name opens the file's complete review — the annotated source, the plan, the neighborhood — as a tab of this same window. The {Math.min(8, cases.length) === 1 ? "case carries" : `first ${Math.min(8, cases.length)} carry`} the <b>heaviest charge</b> as a code exhibit: the one thing — a law or a weak axis, priced on the same health scale — that costs the file the most.</P>
              {cases.map((m, i) => {
                const fv = byFile.get(m.path) ?? [];
                const laws = new Map<string, { n: number; sev: string; title?: string }>();
                for (const v of fv) { const e = laws.get(v.law_key) ?? { n: 0, sev: v.severity, title: v.title }; e.n += 1; if (SEV_TONE[v.severity] === C.bad) e.sev = v.severity; laws.set(v.law_key, e); }
                const ex = caseExhibits.find((x) => x.path === m.path);
                const ch: Charge | null | undefined = ex?.charge;
                const hv: Charge | null | undefined = ex?.heaviest;
                const axesM = ((m as any).axes ?? {}) as Record<string, { score: number; parts?: Record<string, unknown> } | null>;
                const weakAxes = Object.entries(axesM).filter(([k, a]) => a && a.score < 60 && k !== "compliance").sort((a, b) => (a[1]!.score) - (b[1]!.score));
                return (
                  <div key={m.path}>
                    <h4 style={{ fontSize: FS.base + 1, color: C.fg, margin: "16px 0 6px", fontWeight: 700 }}>
                      10.{i + 1}&ensp;{fileBtn(m.path)}&ensp;<span style={{ color: conTone(m.health), fontVariantNumeric: "tabular-nums" }}>health {m.health ?? "—"}</span>
                      {(m as any).archetype === "glue" ? <span style={{ fontSize: FS.small, color: C.dim, marginLeft: 8 }}>glue</span> : null}
                    </h4>
                    <P>
                      {hv ? <>The heaviest charge is {hv.kind === "axis"
                        ? <><b>{hv.ax} {hv.score}</b> — {hv.because}{hv.block ? <>, in <code style={{ fontSize: FS.small }}>{hv.block}</code></> : null} — costing ≈<b>{hv.cost.toFixed(1)}</b> health.</>
                        : <><code style={{ fontSize: FS.small }}>{hv.law_key}</code>{hv.hits > 1 ? ` (×${hv.hits})` : ""} — costing ≈<b>{hv.cost.toFixed(1)}</b> health.</>}
                        {ch && ch !== hv ? <> The heaviest charge <i>with a line in the source</i> is {ch.kind === "axis" ? <><b>{ch.ax} {ch.score}</b>{ch.block ? <> in <code style={{ fontSize: FS.small }}>{ch.block}</code></> : null}</> : <code style={{ fontSize: FS.small }}>{ch.law_key}</code>} (≈{ch.cost.toFixed(1)}) — exhibited below.</> : null}</> : null}
                      {fv.length ? <> The detectors recorded <b>{fv.length}</b> violation{fv.length === 1 ? "" : "s"} across {laws.size} law{laws.size === 1 ? "" : "s"}. {[...laws.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([k, e]) => lawChip(k, e.n, e.sev))}{laws.size > 6 && <span style={{ fontSize: FS.small, color: C.dim }}>+{laws.size - 6} more law{laws.size - 6 === 1 ? "" : "s"}</span>}</> : <> No law fires here — the drag is entirely in the axes.</>}
                      {weakAxes.length ? <> Weak axes: {weakAxes.slice(0, 3).map(([k, a]) => `${k} ${a!.score}`).join(" · ")}.</> : null}
                    </P>
                    {/* the EXHIBIT — the case's heaviest charge quoted from the source itself */}
                    {(() => {
                      if (!ex) return null;
                      if (!ch) return hv ? <div style={{ fontFamily: mono, fontSize: FS.small, color: C.dim, margin: "4px 0 10px" }}>No code exhibit: the charges against this file are whole-file measurements ({hv.kind === "axis" ? hv.ax : hv.law_key}{weakAxes.length > 1 ? `, ${weakAxes.slice(1, 3).map(([k]) => k).join(", ")}` : ""}) — nothing in the source points at a line.</div> : null;
                      if (srcs[m.path] === undefined) return <div style={{ fontFamily: mono, fontSize: FS.small, color: C.dim, margin: "4px 0" }}>◆ pulling the source…</div>;
                      if (ch.kind === "law") {
                        const rows = hunk(m.path, ch.v.line);
                        if (rows) return <Listing n={lst()} rows={rows} sickLine={ch.v.line} severity={ch.v.severity ?? "warn"}
                          caption={<>The case's heaviest charge, in the source: § {ch.v.law_key}{ch.v.line != null ? <> at L{ch.v.line}</> : null} (−{Math.round((ch.v.weight ?? 1) * (ch.v.confidence ?? 1))} compliance, ≈{ch.cost.toFixed(1)} health){(ch.v as any).fix ? <>. Suggested fix: {String((ch.v as any).fix).slice(0, 110)}</> : null}.</>} />;
                        return evidenceBlock(ch.v, <>the detector's stored evidence for § {ch.v.law_key} (no line anchor — the record is quoted instead).</>);
                      }
                      const rows = hunk(m.path, ch.line, 6);
                      const caption = <>The case's heaviest charge, in the source: <b>{ch.ax} {ch.score}</b>{ch.block ? <> — <code style={{ fontSize: FS.small }}>{ch.block}</code></> : null}{ch.line != null ? <> at L{ch.line}</> : null} — {ch.because} (≈{ch.cost.toFixed(1)} health). Fix: {ch.fix}.</>;
                      if (rows) return <Listing n={lst()} rows={rows} sickLine={ch.line} severity="warn" caption={caption} />;
                      return <figure style={{ margin: "10px 0", padding: 0 }}><figcaption style={{ fontSize: FS.small, color: C.dim, maxWidth: 720 }}>{caption} <span style={{ color: C.muted }}>(no line anchor — this axis is a whole-file measurement.)</span></figcaption></figure>;
                    })()}
                  </div>
                );
              })}
            </>}
      </Sec>

      {/* 11 · SENSITIVITY — where the leverage is */}
      <Sec n="11" title="Sensitivity — where the leverage is" narr="the leverage">
        {sens.length === 0
          ? <P>{vios.length === 0 ? <span style={{ color: C.ok }}>No violations — there is no compliance leverage left to price.</span> : <>No single law moves the mean by a measurable amount — the debt is spread thin rather than concentrated.</>}</P>
          : <>
              <P>The formulas' own derivative: each law hypothetically swept, every member's compliance recomputed on the file formula, the folder read as the mean (assumption stated in §15). It answers the only question a maintainer really has — <i>where is the leverage?</i></P>
              <Fig n={fig()} caption={<>The leverage table. Δcompliance = mean member compliance gained by sweeping the law folder-wide; ≈Δhealth scales it by the compliance axis' weight share. Deterministic — recompute it by hand from §15.</>}>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", maxWidth: 640, fontFamily: mono, fontSize: FS.base }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 56px 92px 84px", background: C.panel2, padding: "3px 10px", fontSize: FS.small, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6 }}>
                    <span>law</span><span>files</span><span>hits</span><span>Δcompliance</span><span>≈Δhealth</span>
                  </div>
                  {sens.map((s2, i) => (
                    <div key={s2.key} style={{ display: "grid", gridTemplateColumns: "1fr 56px 56px 92px 84px", padding: "3px 10px", borderTop: `1px solid color-mix(in oklab, ${C.border} 55%, transparent)`, color: C.muted, background: i === 0 ? `color-mix(in oklab, ${C.ok} 5%, transparent)` : "transparent" }}>
                      <code style={{ fontSize: FS.small, color: i === 0 ? C.fg : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s2.key}</code>
                      <span>{s2.files}</span><span>{s2.n}</span>
                      <b style={{ color: C.ok, fontVariantNumeric: "tabular-nums" }}>+{s2.dC.toFixed(1)}</b>
                      <b style={{ fontVariantNumeric: "tabular-nums", color: C.fg }}>+{s2.dH.toFixed(1)}</b>
                    </div>
                  ))}
                </div>
              </Fig>
              {sens[0] && <P><b>The single best move:</b> sweep <code style={{ fontSize: FS.small }}>{sens[0].key}</code> ({sens[0].n} hit{sens[0].n === 1 ? "" : "s"} across {sens[0].files} file{sens[0].files === 1 ? "" : "s"}) — worth <b style={{ color: C.ok }}>+{sens[0].dC.toFixed(1)}</b> mean compliance in one pattern-fix.</P>}
            </>}
      </Sec>

      {/* 12 · EVOLUTION & THE WAGER */}
      <Sec n="12" title="Evolution & the wager" narr="the wager">
        {hist.length >= 2 ? (
          <>
            <P>The longitudinal record — {hist.length} snapshots. A paper is a photograph; this section makes it a page in the folder's medical file.{trajR.kind === "reset" ? <> <b style={{ color: C.muted }}>Baseline reset:</b> {trajR.detail} — a snapshot is comparable to the previous one only when the same laws and the same instrument judged both (rule printed in §15); across a reset the record starts again.</> : trajR.kind === "drift" ? <> <b style={{ color: C.muted }}>Cohort drift:</b> the change axis and the coupling axis are percentiles over the whole cohort, so a member can move a point or two when its neighbours change and it does not — that is what a small delta with no law change means.</> : null}</P>
            <Fig n={fig()} caption={<>Folder health across snapshots (oldest → newest); a hollow point was judged by an earlier instrument revision and is not comparable to the solid ones.{reg?.health_delta != null ? <> Since snapshot #{reg.prev_snapshot_id}: <b style={{ color: reg.comparable === false ? C.muted : reg.health_delta >= 0 ? C.ok : C.bad }}>{reg.health_delta >= 0 ? "+" : ""}{reg.health_delta}</b> health{reg.comparable === false ? " (not comparable)" : ""}{(reg.fixed ?? []).length ? <> · {(reg.fixed as any[]).length} law{(reg.fixed as any[]).length === 1 ? "" : "s"} fixed</> : null}{(reg.new ?? []).length ? <> · <span style={{ color: C.warn }}>{(reg.new as any[]).length} new</span></> : null}.</> : null}</>}>
              {(() => { const hs = hist.slice(-12); const min2 = Math.min(...hs.map((h) => h.health)); const span = Math.max(1, Math.max(...hs.map((h) => h.health)) - min2); const X2 = (i: number) => 16 + (i / Math.max(1, hs.length - 1)) * 380; const Y2 = (h: number) => 52 - ((h - min2) / span) * 38; return (
                <svg viewBox="0 0 470 68" style={{ width: "100%", maxWidth: 560, display: "block", overflow: "visible" }}>
                  <polyline points={hs.map((h, i) => `${X2(i)},${Y2(h.health)}`).join(" ")} fill="none" stroke={conTone(con.health)} strokeWidth={1.6} />
                  {hs.map((h, i) => { const same = !con.engineering_version || !h.engineering_version || h.engineering_version === con.engineering_version; return <circle key={i} cx={X2(i)} cy={Y2(h.health)} r={3} fill={same ? conTone(h.health) : "transparent"} stroke={conTone(h.health)} strokeWidth={1.2}><title>{`#${h.snapshot_id} · ${h.health}${h.engineering_version ? ` · ${h.engineering_version}` : ""}${same ? "" : " (earlier instrument)"}`}</title></circle>; })}
                  <text x={16} y={66} fill={C.dim} style={{ fontFamily: mono, fontSize: 7.5 }}>#{hs[0]?.snapshot_id} · {hs[0]?.health}</text>
                  <text x={396} y={66} textAnchor="end" fill={C.fg} style={{ fontFamily: mono, fontSize: 7.5, fontWeight: 700 }}>#{hs[hs.length - 1]?.snapshot_id} · {hs[hs.length - 1]?.health}</text>
                </svg>
              ); })()}
            </Fig>
          </>
        ) : <P><span style={{ color: C.dim }}>The record holds {hist.length === 1 ? "one snapshot" : "no snapshots yet"} — Evolution needs at least two. Rebuild after the next round of work and this section becomes the folder's medical file.</span></P>}
        {reg && ((reg.fixed ?? []).length || (reg.new ?? []).length) ? (
          <P><b>The ratchet</b>, since snapshot #{reg.prev_snapshot_id}: {(reg.fixed ?? []).length ? <><span style={{ color: C.ok }}>fixed</span> — {(reg.fixed as any[]).slice(0, 4).map((f2: any, i: number) => <span key={i}>{i > 0 ? ", " : ""}<code style={{ fontSize: FS.small }}>{f2.law_key}</code>{f2.count > 1 ? ` ×${f2.count}` : ""}</span>)}{(reg.fixed as any[]).length > 4 ? <> +{(reg.fixed as any[]).length - 4} more</> : null}. </> : null}
            {(reg.new ?? []).length ? <><span style={{ color: C.warn }}>new</span> — {(reg.new as any[]).slice(0, 4).map((f2: any, i: number) => <span key={i}>{i > 0 ? ", " : ""}<code style={{ fontSize: FS.small }}>{f2.law_key}</code>{f2.count > 1 ? ` ×${f2.count}` : ""}</span>)}.</> : null}</P>
        ) : null}
        <P>
          <b>The wager.</b>{" "}
          {wager && wagerH != null
            ? <>If <code style={{ fontSize: FS.small }}>{wager.key}</code> is fully swept and nothing else changes, the arithmetic prices health at <b style={{ color: conTone(wagerH) }}>≈{wagerH}</b> — pure §11 arithmetic, no judgment involved. The next rebuild grades this wager: verified or falsified, in print.</>
            : <>With no compliance leverage left, the standing wager is stability: the projection expects health to hold at <b style={{ color: conTone(con.health) }}>{con.health ?? "—"}</b> unless new code introduces new debt.</>}
        </P>
      </Sec>

      {/* 13 · CONTAGION */}
      <Sec n="13" title="Contagion — do the habits travel?">
        {!patterns.length ? <P><span style={{ color: C.ok }}>No repeated law inside the folder — there is no habit to trace outward.</span></P>
          : !Object.keys(peers2).length ? <P><span style={{ color: C.dim }}>The repo-wide law spread is not on this snapshot — rebuild to trace the habit beyond the folder's wall.</span></P>
          : contagion.length === 0 ? <P>The folder's habit{patterns.length === 1 ? "" : "s"} read{patterns.length === 1 ? "s" : ""} as contained: the repo-wide record shows no notable echo outside {folderName}/ — a local culture, not an epidemic.</P>
          : contagion.map((c2) => (
            <P key={c2.key}>
              <code style={{ fontSize: FS.small }}>{c2.key}</code> also breaks OUTSIDE this folder{c2.filesOutside != null ? <> ({c2.filesOutside} file{c2.filesOutside === 1 ? "" : "s"} repo-wide)</> : null} — nearest echoes: {c2.outside.map((t: any, i: number) => <span key={t.path}>{i > 0 ? ", " : ""}<b>{String(t.path).split("/").pop()}</b>{t.n > 1 ? ` ×${t.n}` : ""}</span>)}.
              {c2.viaImports > 0
                ? <> {c2.viaImports} of {c2.outside.length} echo{c2.outside.length === 1 ? "" : "es"} sit in folders that IMPORT this one — evidence the habit travels along the dependency direction.</>
                : <> None of the nearest echoes import this folder — a parallel habit, not a transmission.</>}
            </P>
          ))}
      </Sec>

      {/* 14 · RELATED MODULES */}
      <Sec n="14" title="Related modules">
        {!PR?.siblings?.length ? <P><span style={{ color: C.dim }}>{E ? "No sibling folders at this level — the module stands alone under its parent." : "The atlas is unavailable — rebuild to situate the folder among its siblings."}</span></P>
          : sibs == null ? <P><span style={{ color: C.muted }}>◆ reading the siblings…</span></P>
          : (() => {
            const all2 = [{ dir, health: (con.health ?? null) as number | null, files: members.length, self: true }, ...sibs.map((s2: any) => ({ ...s2, self: false }))];
            const ranked = [...all2].sort((a, b) => (b.health ?? -1) - (a.health ?? -1));
            const pos = ranked.findIndex((x: any) => x.self) + 1;
            return (
              <>
                <P>Under the same parent the literature holds {ranked.length} modules; {folderName}/ ranks <b>{pos}{pos === 1 ? "st" : pos === 2 ? "nd" : pos === 3 ? "rd" : "th"} of {ranked.length}</b> by health:</P>
                {ranked.map((s2: any) => (
                  <div key={s2.dir} style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: mono, fontSize: FS.base, lineHeight: 2, color: s2.self ? C.fg : C.muted }}>
                    <b style={{ color: conTone(s2.health), fontVariantNumeric: "tabular-nums", minWidth: 24 }}>{s2.health ?? "—"}</b>
                    <span style={{ fontWeight: s2.self ? 700 : 400 }}>{s2.dir}/{s2.self ? " ← this paper" : ""}</span>
                    <span style={{ color: C.dim, fontSize: FS.small }}>{s2.files ?? "?"} files</span>
                  </div>
                ))}
              </>
            );
          })()}
      </Sec>

      {/* 15 · MATERIALS & METHODS */}
      <Sec n="15" title="Materials & methods" narr="sources & citation">
        <P><b>Instruments.</b> The constitution detectors (per-line law matches carrying weight × confidence), the seven-axis judge, and the atlas import graph{PR ? <> ({PR.files} files, {PR.edges} deduplicated import edges)</> : null}. Population: {con.files ?? members.length} member file{(con.files ?? members.length) === 1 ? "" : "s"} of {dir}/, {snapId != null ? <>snapshot #{snapId}</> : "the latest snapshot"}{con.engineering_version ? <>, instrument revision <code style={{ fontSize: FS.small }}>{con.engineering_version}</code></> : null}. Total compute cost $0.0000 — every number reproduces on rebuild.</P>
        <P><b>What counts.</b> A definition is a function, method, class, component (PascalCase and renders JSX, or wrapped in memo/forwardRef) or hook (<code style={{ fontSize: FS.small }}>use</code>-prefixed); constants and types are data. An import edge couples at runtime unless it is <code style={{ fontSize: FS.small }}>import type</code> (erased) — lazy <code style={{ fontSize: FS.small }}>import()</code> and barrel re-exports count. {GLUE_RULE}. Two snapshots are comparable only when the same laws (constitution hash) and the same instrument revision judged both. {testsNote.text}</P>
        <P><b>Formulas.</b> File compliance = max(10, 100 − min(90, Σ round(weight × confidence))) over its violations. Health blends the axes with fixed weights — {AXES.filter((ax) => (AXIS_W as any)[ax] != null).map((ax, i) => <span key={ax}>{i > 0 ? " · " : ""}{ax} {(AXIS_W as any)[ax]}</span>)} — normalized over the axes present. The §2 closures are BFS over the deduplicated file-to-file import edges; cohesion = internal ÷ (internal + inbound + outbound) edges touching the folder; Gini is computed over per-member violation counts.</P>
        <P><b>Stated approximations.</b> §11 reads the folder as the MEAN of member compliance (the judge's own aggregate may weight differently — the deltas, not the absolutes, are the claim). The §2 role thresholds (20% / 5–15%) and every §9 risk condition are fixed constants, printed where used.</P>
      </Sec>

      {/* 16 · THREATS TO VALIDITY */}
      <Sec n="16" title="Threats to validity">
        {threats.map((t2, i) => (
          <div key={i} style={{ margin: "0 0 9px", borderLeft: `2px solid ${C.dim}`, paddingLeft: 11 }}>
            <div style={{ fontSize: FS.base, color: C.fg, fontWeight: 700, marginBottom: 1 }}>T{i + 1} · {t2.t}</div>
            <div style={{ fontSize: FS.base, color: C.muted, lineHeight: 1.75, textAlign: "justify" }}>{t2.d}</div>
          </div>
        ))}
        <div style={{ margin: "4px 0 0", borderLeft: `2px solid ${C.dim}`, paddingLeft: 11 }}>
          <div style={{ fontSize: FS.base, color: C.fg, fontWeight: 700, marginBottom: 1 }}>Not measured — and therefore not claimed</div>
          <div style={{ fontSize: FS.base, color: C.muted, lineHeight: 1.8 }}>Runtime latency · memory · production failures · user traffic · business impact · benchmarks. This paper is about architecture; those truths need other instruments.</div>
        </div>
      </Sec>

      {/* 17 · CONCLUSION — the abstract's mirror: the journey retold, then the future ordered */}
      <Sec n="17" title="Conclusion" narr="the conclusion">
        <P>
          This paper opened with a question a health score cannot answer alone: <i>what kind of architectural organism is {folderName}/, and how is it evolving?</i> Sixteen sections of measurement later, the answer has a shape.
          It is {role ?? "an unclassified module (the atlas was unavailable)"}{E?.docs ? <> — {String(E.docs.profile).split(" (")[0]} of {members.length} file{members.length === 1 ? "" : "s"} and {E.docs.defs} symbols, of which the outside world truly calls {(E.docs.api as any[]).length ? <>only <b>{(E.docs.api as any[]).length}</b></> : "none"}</> : null} —
          living behind a <b style={{ color: boundary[1] }}>{boundary[0].split(" · ")[0]}</b> boundary{E ? <>, carrying {E.blast} outside file{E.blast === 1 ? "" : "s"} through {E.inboundTotal} import{E.inboundTotal === 1 ? "" : "s"}</> : null}.
          {readme && readme !== "none" ? <> Its purpose is declared in its own words — <i>«{readme}»</i> — and the record found the code broadly faithful to that declaration.</> : <> Its purpose remains undeclared; the record's first and smallest prescription is one README line.</>}
        </P>
        <P>
          The vitals gave it <b style={{ color: conTone(con.health) }}>{con.health ?? "—"}</b>, but the number hides more than it says.
          {healths.length >= 2 ? <> The population runs {Math.min(...healths)}–{Math.max(...healths)} (σ {stdev.toFixed(1)}), so the folder is {spreadH >= 35 ? "not one quality but two — which file you touch decides the experience" : "consistent — one standard, evenly kept"}.</> : null}
          {vios.length >= 4 ? <> The debt is {gini >= 0.6 ? <>concentrated (Gini {gini.toFixed(2)}) — a property of a few files, not of the folder, which is why surgical fixes beat sweeping refactors here</> : <>spread thin (Gini {gini.toFixed(2)}) — a property of the culture, not of any file, which is why a policy change beats spot fixes</>}.</> : null}
          {patterns.length ? <> The loudest single finding is a habit: <code style={{ fontSize: FS.small }}>{patterns[0][0]}</code> breaking in {patterns[0][1].files.size} of {members.length} members — proven line-by-line in the source (§6) — which converts {patterns[0][1].files.size} would-be patches into one pattern decision plus a sweep.</> : null}
          {danger0 ? <> And where sickness meets load, the paper can point at the exact address: {fileBtn(danger0.path)}, health {danger0.h} with {danger0.tin} import{danger0.tin === 1 ? "" : "s"} arriving — the place where a private bug becomes a public incident.</> : null}
          {risks.find((r2) => r2.sev === "high") ? <> The register prices that exposure as its gravest crossing: <b>{risks.find((r2) => r2.sev === "high")!.title}</b>.</> : null}
        </P>
        <P>
          Read as one record, the verdict is this: <b>{verdictCross}</b>.
          {sens[0] ? <> Under {pressure[0]} pressure, the leverage table orders the work by arithmetic rather than by alarm — one pattern-fix (<code style={{ fontSize: FS.small }}>{sens[0].key}</code>) is worth <b style={{ color: C.ok }}>+{sens[0].dC.toFixed(1)}</b> mean compliance before any file is "refactored".</> : <> Under {pressure[0]} pressure, no single law concentrates enough debt to dominate — the prescription below leans on position, not on compliance.</>}
          {" "}The trajectory reads <b style={{ color: trajectory[1] }}>{trajR.kind === "reset" ? "baseline reset" : trajectory[0].split(" (")[0]}</b>{trajR.kind === "reset" ? <> ({trajR.detail})</> : null}{wager && wagerH != null ? <>, and the arithmetic has signed its wager: sweep the top law and health prices at <b style={{ color: conTone(wagerH) }}>≈{wagerH}</b>. The next rebuild grades that wager in print — verified or falsified</> : trajR.kind === "none" ? <>, and the wager waits only for a second snapshot to have something to be graded against</> : <>, and with no compliance leverage left the standing wager is stability: health holds at {con.health ?? "—"} unless new code brings new debt — the next comparable snapshot grades it</>}.
          {" "}That is what separates this document from a report: a report describes; this record predicts, and accepts being wrong.
        </P>
        <P><b>Future work — the prescription, in order:</b></P>
        {prescription.map((s3, i3) => (
          <div key={i3} style={{ display: "flex", gap: 9, alignItems: "baseline", fontSize: FS.base, color: C.fg, lineHeight: 1.85, margin: "0 0 5px 10px" }}>
            <b style={{ color: C.brand, minWidth: 18, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{i3 + 1}.</b>
            <span style={{ minWidth: 0, flex: 1 }}>{s3.t}</span>
            <span style={{ color: C.dim, fontSize: FS.small, flexShrink: 0 }}>{s3.ref}</span>
          </div>
        ))}
      </Sec>

      {/* APPENDIX A — the complete record (the manifest), collapsed */}
      <div style={{ marginTop: 24 }}>
        <button onClick={() => setApx((v) => !v)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "3px 12px", cursor: "pointer", fontFamily: mono, fontSize: FS.base }}>{apx ? "▾" : "▸"} Appendix A — the complete record (the manifest)</button>
        {apx && <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, marginTop: 8, overflow: "hidden" }}><FileReviewBodyInner con={con} onNavigate={onOpenFile} /></div>}
      </div>

      {/* RELATED WORK — the corpus: papers citing papers (editions get their projections graded) */}
      {(() => {
        const R2 = related?.ok ? related : null;
        if (!R2) return null;
        const parseF = (p2: any) => { try { return JSON.parse(p2.findings_json || "{}"); } catch { return {}; } };
        const editions = ((R2.editions ?? []) as any[]).filter((p2) => p2.cite_id !== citeId).slice(0, 3);
        const seen2 = new Set<string>([citeId, ...editions.map((p2) => p2.cite_id)]);
        const neighbors = ((R2.neighbors ?? []) as any[]).filter((p2) => !seen2.has(p2.cite_id)).slice(0, 5);
        neighbors.forEach((p2) => seen2.add(p2.cite_id));
        const recent = ((R2.latest ?? []) as any[]).filter((p2) => !seen2.has(p2.cite_id) && !neighbors.some((n2) => n2.subject === p2.subject)).slice(0, 3);
        if (!editions.length && !neighbors.length && !recent.length) return null;
        const row = (tag: string, p2: any, extra?: React.ReactNode) => (
          <div key={p2.cite_id} style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: FS.small, color: C.muted, lineHeight: 1.9, flexWrap: "wrap" }}>
            <span style={{ color: C.dim, minWidth: 62 }}>{tag}</span>
            <code style={{ color: C.brand }}>{p2.cite_id}</code>
            <span style={{ color: C.dim }}>· {String(p2.created_at ?? "").slice(0, 10)}</span>
            {extra}
          </div>
        );
        return (
          <div style={{ marginTop: 26 }}>
            <div style={{ fontSize: FS.base + 2, fontWeight: 700, color: C.fg, marginBottom: 7 }}>Related work</div>
            {editions.map((p2) => { const f2 = parseF(p2); return row("edition", p2, <>
              <span style={{ color: C.dim }}>· health then {f2.health ?? "—"}</span>
              {f2.wagerH != null && con.health != null && <span style={{ color: con.health >= f2.wagerH ? C.ok : C.warn }}> · projected ≈{f2.wagerH} → today {con.health} ({con.health - f2.wagerH >= 0 ? "+" : ""}{con.health - f2.wagerH})</span>}
            </>); })}
            {neighbors.map((p2) => { const f2 = parseF(p2); return row("neighbor", p2, <span style={{ color: C.dim }}>· {p2.subject}/ · health {f2.health ?? "—"}{f2.role ? ` · ${f2.role}` : ""}</span>); })}
            {recent.map((p2) => { const f2 = parseF(p2); return row("recent", p2, <span style={{ color: C.dim }}>· {p2.subject}/ · health {f2.health ?? "—"}</span>); })}
            <div style={{ fontSize: FS.small, color: C.dim, marginTop: 8, lineHeight: 1.7 }}>
              The corpus grows as papers are pressed. A prior edition's projection is shown against today's measurement — graded by the record, not by a verdict: the sweep it assumed may or may not have happened.
            </div>
          </div>
        );
      })()}

      {/* SOURCES — every member, the paper's closing record */}
      <div style={{ marginTop: 28, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
        <div style={{ fontSize: FS.base + 2, fontWeight: 700, color: C.fg, marginBottom: 7 }}>Sources</div>
        {[...members].sort((a, b) => a.path.localeCompare(b.path)).map((m, i) => (
          <div key={m.path} style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: FS.small, color: C.muted, lineHeight: 1.9 }}>
            <span style={{ color: C.dim, minWidth: 22 }}>[{i + 1}]</span>
            <button onClick={() => onOpenFile(m.path)} style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: FS.small, padding: 0, textDecoration: "underline dotted", textUnderlineOffset: 2, textAlign: "left" }}>{m.path}</button>
            <span style={{ color: C.dim }}>· case · health {m.health ?? "—"}{(byFile.get(m.path)?.length ?? 0) > 0 ? ` · ${byFile.get(m.path)!.length} violation${byFile.get(m.path)!.length === 1 ? "" : "s"}` : " · clean"}</span>
          </div>
        ))}
        {/* THE INSTRUMENTS — the tools are sources too (operator 2026-07-26) */}
        <div style={{ fontSize: FS.base + 1, fontWeight: 700, color: C.fg, margin: "14px 0 5px" }}>The instruments</div>
        {[
          ["T1", "the constitution detectors", "system.constitution.file — per-line law matches, weight × confidence"],
          ["T2", "the seven-axis judge", "the same snapshot — health, axes, history, the ratchet"],
          ["T3", "the atlas import graph", "codebase/get — file nodes + deduplicated import edges (§2 · §8 · the MRI)"],
          ["T4", "the generated-docs layer", "the atlas def layer — symbols, kinds, docs intents, def-level call edges (§3)"],
          ["T5", "the source reader", "file/read — the code exhibits (§6 · §10) and the README purpose quote"],
          ["T6", "the repo-wide law spread", "peers on the snapshot — the contagion trace (§13)"],
        ].map(([k2, n2, d2]) => (
          <div key={k2} style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: FS.small, color: C.muted, lineHeight: 1.9 }}>
            <span style={{ color: C.dim, minWidth: 22 }}>[{k2}]</span>
            <b style={{ color: C.fg }}>{n2}</b>
            <span style={{ color: C.dim, minWidth: 0 }}>· {d2}</span>
          </div>
        ))}
        <div style={{ fontSize: FS.small, color: C.dim, marginTop: 10, lineHeight: 1.7 }}>
          All deterministic; reproduced on every rebuild.
        </div>
        {/* CITE THIS PAPER — a deterministic identity, so the next paper can grade this one */}
        <div style={{ marginTop: 14, border: `1px dashed ${C.border}`, borderRadius: 8, padding: "8px 11px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: FS.small, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>cite this paper</span>
            <code style={{ fontSize: FS.small, color: C.muted }}>{citeId}</code>
            <span style={{ flex: 1 }} />
            <button onClick={() => { void navigator.clipboard?.writeText(bibtex); }} title="copy the BibTeX"
              style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "0 8px", cursor: "pointer", fontFamily: mono, fontSize: FS.small }}>⧉ BibTeX</button>
          </div>
          <pre style={{ margin: "6px 0 0", fontFamily: mono, fontSize: FS.small, color: C.dim, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{bibtex}</pre>
        </div>
      </div>

      </div>
    </div>
  );
}

function FileReviewBodyInner({ con, onNavigate, initialView }: { con: FileCon; onNavigate: (p: string) => void; initialView?: "review" | "beyond" | "plan" | "data" | "canvas" | "history" }) {
  const health = con.health ?? 100;
  const isFolder = !!con.is_folder;
  // ONE "CODE REVIEW" (operator 2026-09-18): review · beyond the lines · history review stack on one
  // page with the manifest beside it; plan keeps its tab; the neighborhood belongs to the FOLDER stage.
  const [view, setView] = React.useState<"review" | "beyond" | "plan" | "data" | "canvas" | "history">(initialView ?? (isFolder ? "data" : "review"));
  // 🕸 the NEIGHBORHOOD canvas data (operator 2026-07-18): blast radius to N layers
  const [nb, setNb] = React.useState<any | null>(null);
  // the CAMERA — a real canvas pans and zooms. null = auto-fit; wheel/drag take over.
  const [nbCam, setNbCam] = React.useState<{ x: number; y: number; z: number } | null>(null);
  const nbCamRef = React.useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 1 });
  const nbView = React.useRef<HTMLDivElement | null>(null);
  const nbDrag = React.useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  // circles expand on click into their snippet + errors panel (collapse / enter-the-file)
  const [nbExpand, setNbExpand] = React.useState<Record<string, boolean>>({});
  const [nbFull, setNbFull] = React.useState(false); // ⛶ — the canvas as a fullscreen overlay
  // ⤢ — any widget expands FULLSCREEN with its complete information, examples and analysis
  const [nbZoom, setNbZoom] = React.useState<any | null>(null);
  const [nbSide, setNbSide] = React.useState(true); // the four-questions sidebar, collapsible
  React.useEffect(() => {
    const el = nbView.current;
    if (!el || view !== "canvas") return;
    // native listener — React's onWheel is passive, and a canvas must eat the scroll
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const c = nbCamRef.current; setNbCam({ ...c, z: Math.max(0.35, Math.min(2.2, c.z * (e.deltaY < 0 ? 1.08 : 0.93))) }); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [view, nb]);
  React.useEffect(() => {
    let alive = true;
    if (view !== "canvas" || !con.path) return;
    setNb((s: any) => (s?.ok ? s : { loading: true }));
    void apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.neighborhood", input: { path: con.path } })
      .then((r: any) => { const d = r?.result?.result ?? r?.result ?? r; if (alive) setNb(d?.ok ? d : { error: d?.error ?? "neighborhood unavailable" }); })
      .catch((e: any) => { if (alive) setNb({ error: String(e?.message ?? "failed").slice(0, 120) }); });
    return () => { alive = false; };
  }, [view, con.path, isFolder]);
  const g = con.signals ?? {};
  // the REAL source — the review shows the sick lines themselves, not just the stored evidence.
  const [src, setSrc] = React.useState<string | null>(null);
  React.useEffect(() => { let alive = true; if (con.path && !isFolder) void fileRead({ path: con.path }).then((s: any) => { if (alive) setSrc(s?.content ?? null); }); return () => { alive = false; }; }, [con.path, isFolder]);
  const srcLines = React.useMemo(() => (src ? src.split("\n") : null), [src]);
  // ⚡ SHORT PR — the lightweight inline fix: AI proposes → stage in an isolated
  // WORKTREE → gated merge. Reuses the regenerate pipeline (no file is touched
  // until merge); "short" because it lives right here, no ceremony.
  const [spr, setSpr] = React.useState<any | null>(null);
  // every await wears a try/catch — a thrown fetch (500/403/timeout) must SURFACE,
  // never leave the panel stuck on "staging…" (operator 2026-07-18: "the button didn't work").
  // the MEASURED gate (operator 2026-07-18: "measure the fix, don't estimate it") —
  // re-runs the content-scope laws over the CANDIDATE full file; $0, no writes.
  const runCheck = async (proposed: string, lo: number, hi: number, full: boolean) => {
    if (!con.path || !srcLines) return;
    const content = full ? proposed : [...srcLines.slice(0, lo - 1), proposed, ...srcLines.slice(hi)].join("\n");
    try {
      const r: any = await apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.check", input: { path: con.path, content } });
      const d = r?.result?.result ?? r?.result ?? r;
      setSpr((s: any) => (s ? { ...s, check: d?.ok ? d : null, checkStale: false } : s));
    } catch { setSpr((s: any) => (s ? { ...s, check: null, checkStale: false } : s)); }
  };
  const startSpr = async (key: string, title: string, lo: number, hi: number, instruction: string, full = false) => {
    if (!con.path || isFolder || spr?.loading) return;
    setSpr({ lawKey: key, lawTitle: title, line: lo, endLine: hi, full, loading: true });
    try {
      const r: any = await regenerateBlock({ path: con.path, start_line: lo, end_line: hi, instruction });
      setSpr((s: any) => (s ? { ...s, loading: false, ...(r?.ok ? { data: r } : { err: r?.error ?? "the AI could not propose a fix (provider / key)" }) } : s));
      if (r?.ok && r?.proposed != null) void runCheck(r.proposed, r.start_line ?? lo, r.end_line ?? hi, full);
    } catch (e: any) { setSpr((s: any) => (s ? { ...s, loading: false, err: String(e?.message ?? e).slice(0, 160) } : s)); }
  };
  const startShortPr = (lg: any, line: number) => startSpr(lg.key, lg.title, line, line, `Fix this law violation: ${lg.title}. ${lg.fix ?? ""} Change ONLY what the fix requires; keep style and behavior otherwise.`);
  // ⛙ FULL PR — one AI pass over the WHOLE file fixing every law violation at once (operator 2026-07-18).
  const startFullPr = () => {
    if (!srcLines || !lawGroups.length) return;
    const instruction = `Fix ALL of these law violations in one pass:\n${lawGroups.map((lg: any) => `- ${lg.title}${lg.fix ? ` — ${lg.fix}` : ""} (at ${lg.insts.filter((x: any) => x.line != null).map((x: any) => `L${x.line}`).join(" ") || "file level"})`).join("\n")}\nChange ONLY what the fixes require; keep style and behavior otherwise.`;
    return startSpr("__ALL__", `all ${lawGroups.length} law group${lawGroups.length === 1 ? "" : "s"}`, 1, srcLines.length, instruction, true);
  };
  // ⚡ per plan STEP — the step's own targets give the exact range + instruction.
  const startPlanSpr = (p: any) => {
    const lns = (p.targets ?? []).filter((t: Target) => t.line != null && !t.file).map((t: Target) => t.line as number);
    if (!lns.length || !srcLines) return;
    return startSpr(`plan:${p.id}`, p.label, Math.min(...lns), Math.min(srcLines.length, Math.max(...lns)),
      `${p.detail || p.label}\nThe exact spots: ${p.targets.slice(0, 8).filter((t: Target) => t.line != null).map((t: Target) => `L${t.line}${t.note ? ` (${String(t.note).slice(0, 80)})` : ""}`).join(", ")}.\nChange ONLY what this requires; keep style and behavior otherwise.`);
  };
  const stageShortPr = async () => {
    if (!spr?.data || !con.path) return;
    const session = spr.session ?? `spr-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
    setSpr((s: any) => ({ ...s, staging: true, session }));
    try {
      const st: any = await regenerateStage({ path: con.path, start_line: spr.data.start_line ?? spr.line, end_line: spr.data.end_line ?? spr.endLine ?? spr.line, proposed: spr.data.proposed, session_id: session });
      const res = (st?.result ?? st) || {};
      setSpr((s: any) => ({ ...s, staging: false, stage: res?.ok != null ? res : { ok: false, error: st?.error ?? "stage failed" } }));
    } catch (e: any) { setSpr((s: any) => ({ ...s, staging: false, stage: { ok: false, error: String(e?.message ?? e).slice(0, 160) } })); }
  };
  const mergeShortPr = async () => {
    if (!spr?.session || !con.path) return;
    setSpr((s: any) => ({ ...s, merging: true }));
    try {
      const m: any = await regenerateMerge({ session_id: spr.session, path: con.path, summary: spr.full ? `full PR — ${spr.lawTitle}` : `short PR — ${spr.lawTitle ?? "law fix"} (L${spr.line})` });
      setSpr((s: any) => ({ ...s, merging: false, merged: (m?.result ?? m) || { ok: false } }));
    } catch (e: any) { setSpr((s: any) => ({ ...s, merging: false, merged: { ok: false, applied: false, error: String(e?.message ?? e).slice(0, 160) } })); }
  };
  const closeShortPr = () => { if (spr?.session && !spr?.merged?.applied) void regenerateMerge({ session_id: spr.session, abandon: true }); setSpr(null); };
  // the ⚡ short-PR panel — shared by all views (propose → worktree stage → gated merge).
  // Rendered as a FUNCTION CALL ({SprPanel()}), never <SprPanel /> — a per-render component
  // type would remount the subtree and the proposal textarea would drop focus on every keystroke.
  const SprPanel = () => !spr ? null : (
    <div style={{ marginTop: 6, border: `1px solid color-mix(in oklab, ${C.brand} 40%, ${C.border})`, borderRadius: 5, padding: "6px 9px", background: C.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontFamily: mono, fontSize: 8, color: C.brand, textTransform: "uppercase", letterSpacing: 0.8 }}>{spr.full ? "⛙ full PR · the whole file" : `⚡ short PR · L${spr.line}${spr.endLine != null && spr.endLine !== spr.line ? `–${spr.endLine}` : ""}`}</span>
        <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim }}>AI proposes → isolated worktree → you merge · nothing touches the tree until then</span>
        <span style={{ flex: 1 }} />
        <button onClick={closeShortPr} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>
      </div>
      {spr.loading ? <div style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>◆ proposing the fix…</div>
        : spr.err ? <div style={{ fontFamily: mono, fontSize: 9, color: C.bad }}>{spr.err}</div>
        : spr.data ? (<>
          {spr.data.rationale && <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginBottom: 3 }}>{spr.data.rationale}</div>}
          <code style={{ display: "block", fontFamily: mono, fontSize: 8.5, color: C.bad, background: C.panel2, borderRadius: 3, padding: "2px 6px", overflowX: "auto", whiteSpace: "pre", opacity: 0.7 }}>− {spr.data.original}</code>
          <textarea value={spr.data.proposed} spellCheck={false}
            onChange={(e) => { const v = e.target.value; setSpr((s: any) => ({ ...s, data: { ...s.data, proposed: v }, stage: null, merged: null, checkStale: true })); }}
            style={{ width: "100%", minHeight: 40, maxHeight: 140, fontFamily: mono, fontSize: 8.5, lineHeight: 1.45, color: C.ok, background: C.panel2, border: `1px solid color-mix(in oklab, ${C.ok} 40%, ${C.border})`, borderRadius: 3, padding: "2px 6px", marginTop: 3, resize: "vertical", boxSizing: "border-box", outline: "none" }} />
          {/* MEASURED — the real formulas re-run over the candidate file (not the ▷sim estimate) */}
          {spr.check && (
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "baseline", fontFamily: mono, fontSize: 8, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
              <span style={{ color: C.brand }}>measured:</span>
              <span style={{ color: C.dim }}>violations {spr.check.before.violations} → <b style={{ color: spr.check.after.violations <= spr.check.before.violations ? C.ok : C.bad }}>{spr.check.after.violations}</b></span>
              {spr.check.compliance?.before != null && <span style={{ color: C.dim }}>compliance {spr.check.compliance.before} → <b style={{ color: conTone(spr.check.compliance.after_est) }}>≈{spr.check.compliance.after_est}</b></span>}
              {spr.check.fixed.length > 0 && <span style={{ color: C.ok }}>✓ fixes {spr.check.fixed.map((f: any) => f.law_key).join(", ")}</span>}
              {spr.check.introduced.length > 0 && <span style={{ color: C.bad }}>⚠ INTRODUCES {spr.check.introduced.map((f: any) => `${f.law_key}×${f.count}`).join(", ")}</span>}
              {spr.checkStale && <button onClick={() => void runCheck(spr.data.proposed, spr.data.start_line ?? spr.line, spr.data.end_line ?? spr.endLine ?? spr.line, !!spr.full)}
                style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.warn, borderRadius: 4, padding: "0 6px", cursor: "pointer", fontFamily: mono, fontSize: 7.5 }}>⟳ re-measure (edited)</button>}
              {spr.check.note && !spr.checkStale && <span style={{ color: C.dim, fontStyle: "italic" }}>{spr.check.note}</span>}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
            {spr.merged?.applied ? <span style={{ fontFamily: mono, fontSize: 9, color: C.ok }}>✓ merged — the short PR landed on the working tree (re-run ↻ rebuild to refresh the scores)</span>
              : spr.merged ? <span style={{ fontFamily: mono, fontSize: 9, color: C.bad }}>gate refused: {spr.merged.reason ?? spr.merged.error}</span>
              : spr.stage ? (spr.stage.ok && spr.stage.applies_clean
                ? <><span style={{ fontFamily: mono, fontSize: 8.5, color: C.ok }}>✓ staged in an isolated worktree · applies cleanly</span><button onClick={() => void mergeShortPr()} disabled={spr.merging} style={{ background: C.brand, border: "none", color: C.bg, borderRadius: 4, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 8.5 }}>{spr.merging ? "merging…" : "✓ merge"}</button></>
                : <span style={{ fontFamily: mono, fontSize: 8.5, color: C.warn }}>⚠ {spr.stage.reason || spr.stage.error || "can't stage"}</span>)
              : <><span style={{ fontFamily: mono, fontSize: 7.5, color: C.muted, flex: 1 }}>review / tweak the proposal, then stage — no file is touched until you merge</span><button onClick={() => void stageShortPr()} disabled={spr.staging} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 4, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 8.5 }}>{spr.staging ? "staging…" : "⎇ stage in worktree"}</button></>}
          </div>
        </>) : null}
    </div>
  );
  const codeScore = groupScore(con, "code");
  const contextScore = groupScore(con, "context");
  const lowContext = CONTEXT_AXES.map((ax) => ({ ax, s: con.axes?.[ax as string]?.score })).filter((x) => x.s != null && x.s < 70).sort((a, b) => a.s! - b.s!);
  const lowCode = CODE_AXES.map((ax) => ({ ax, s: con.axes?.[ax as string]?.score })).filter((x) => x.s != null && x.s < 70).sort((a, b) => a.s! - b.s!);

  // ── the review data: violations grouped by law · weak axes · the ranked plan ──
  const lawGroups = React.useMemo(() => {
    const m = new Map<string, any>();
    for (const v of con.violations ?? []) {
      const e = m.get(v.law_key) ?? { key: v.law_key, title: v.title ?? v.law_key, severity: v.severity, rule_md: v.rule_md, fix: v.fix, category: v.category, example: v.example ?? null, count: 0, penalty: 0, insts: [] as { line: number | null; evidence?: string }[] };
      e.count += 1; e.penalty += Math.round((v.weight ?? 1) * (v.confidence ?? 1));
      if (e.insts.length < 6) e.insts.push({ line: v.line ?? null, evidence: v.evidence, path: (v as any).path });
      m.set(v.law_key, e);
    }
    return [...m.values()].sort((a, b) => b.penalty - a.penalty);
  }, [con]);
  const weak = AXES.filter((ax) => ax !== "compliance").map((ax) => ({ ax, a: con.axes?.[ax] as any })).filter((x) => x.a != null && x.a.score < 70).sort((x, y) => x.a.score - y.a.score);
  // the weak axes a maintainer can act on — computed after axisPlan is defined (see below)

  // ── the GROUNDED plan (operator 2026-07-18: "exactly what files, lines, exactly
  // what to do") — every item carries real TARGETS: the violating lines with their
  // code, the actual importers/imports, the most complex blocks, the bench findings.
  const [blocks, setBlocks] = React.useState<any[] | null>(null);
  React.useEffect(() => { let alive = true; if (con.path && !isFolder) void decorateFile({ path: con.path }).then((r: any) => { if (alive) setBlocks(r?.ok ? (r.decorators ?? []) : []); }); return () => { alive = false; }; }, [con.path, isFolder]);
  const A = con.anchors ?? { importers: [], imports: [], findings: [] };
  const testName = con.path ? con.path.replace(/\.(\w+)$/, ".test.$1") : null;
  const codeAt = (line: number | null | undefined) => (line != null && srcLines?.[line - 1] != null ? srcLines[line - 1].trim().slice(0, 100) : undefined);
  // the actual import statements — THE code behind transitive weight and fan-out.
  const importLines = React.useMemo(() => (srcLines ?? []).map((l, i) => ({ line: i + 1, code: l.trim() }))
    .filter((x) => /^(import\b|export\s+.*\bfrom\b|const\s+.+=\s*require\()/.test(x.code)).slice(0, 30), [srcLines]);
  const topCx = React.useMemo(() => (blocks ?? []).filter((b: any) => (b.complexity ?? 0) >= 3).sort((x: any, y: any) => (y.complexity ?? 0) - (x.complexity ?? 0)).slice(0, 6), [blocks]);
  const lawTargets = (key: string): Target[] => (con.violations ?? []).filter((v) => v.law_key === key).slice(0, 30)
    .map((v) => ({ file: isFolder ? (v as any).path : undefined, line: v.line ?? null, code: (v.line != null && !isFolder ? codeAt(v.line) : undefined) ?? (v.evidence ?? "").slice(0, 100) }));
  // the import specifier FROM this file TO a directory — what a human would type (`../HIR`), never
  // the repo-absolute path the atlas stores
  const relSpec = (fromFile: string, toDir: string): string => {
    const a = fromFile.split("/").slice(0, -1), b = toDir.split("/").filter(Boolean);
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    const up = a.length - i, rest = b.slice(i).join("/");
    return (up === 0 ? "./" : "../".repeat(up)) + rest || ".";
  };
  // resolve an import statement to the actual file it lands on (from the atlas anchors).
  const resolveImport = (code: string): string | undefined => {
    const spec = code.match(/from\s+['"]([^'"]+)['"]/)?.[1] ?? code.match(/require\(\s*['"]([^'"]+)['"]/)?.[1];
    if (!spec) return undefined;
    const last = spec.split("/").filter(Boolean).pop() ?? spec;
    return A.imports.find((pth) => { const base = pth.split("/").pop()?.replace(/\.\w+$/, "") ?? ""; const dir = pth.split("/").slice(-2, -1)[0]; return base === last || (base === "index" && dir === last) || pth.includes(`/${last}.`) || pth.endsWith(`/${last}`); });
  };
  const weakKeys = new Set(weak.map((w) => w.ax));
  // each axis item derives its DETAIL from the DOMINANT part and its TARGETS from the
  // real code (operator: "be specific — always show the code behind allegations").
  // HONESTY RULES (operator 2026-07-18): a finding with no code anchor DEMOTES to a
  // context note and leaves the plan; `change` MERGES into `tests` when both are weak
  // (its fix IS the test); structure carries a −/+ example from the REAL worst block.
  const axisPlan = (ax: string, a: any): { detail: string; targets: Target[]; example?: { bad: string; good: string }; merged?: boolean } => {
    const p = a?.parts ?? {};
    // FOLDER mode: the concrete targets are the worst member FILES.
    if (isFolder) return { detail: `${(AXIS_REMEDY[ax]?.(p, g) ?? "").replace(/this file/g, "this folder")} Start with the worst files:`, targets: (con.members ?? []).map((m) => ({ file: m.path, note: `health ${m.health ?? "—"} · compliance ${m.score ?? "—"}` })) };
    if (ax === "structure") {
      const bits: string[] = []; const targets: Target[] = [];
      const cxAbs = g.complexity ?? 0;
      const worstEnd = ((blocks ?? []).find((b: any) => b.line === p.worst_line) ?? topCx[0])?.end_line ?? null;
      // the DENSE REGION: the innermost loop/switch/if around the judge's max_nesting_line. The
      // exhibit's before/after is harvested from THAT region — the block's top-level arms can sit
      // somewhere else entirely (Output.tsx: the ok/err arms at L147–219, the nesting at L106).
      const dense = p.basis === "cognitive" && (p.max_nesting ?? 0) >= 3 && p.max_nesting_line != null && worstEnd != null && p.max_nesting_line > (p.worst_line ?? 0) && p.max_nesting_line <= worstEnd
        ? enclosingRegion(srcLines, p.max_nesting_line, p.worst_line, worstEnd)
        : null;
      // the DECOMPOSED parts (engineering v2): the worst block + nesting, with their exact lines
      if (p.basis === "cognitive") {
        // PLAIN language + a real anchor (operator 2026-07-23: "simplify the language… the example
        // should be complete"): cognitive ≈ how much you must hold in your head at once. Past ~15 a
        // function stops fitting; say "12× past the limit", not just "176".
        if (p.worst_block && (p.worst_cognitive ?? 0) > 8) {
          const over = Math.max(2, Math.round((p.worst_cognitive ?? 0) / 15));
          bits.push(`${p.worst_block} is the dense spot: score ${p.worst_cognitive}. Past ~15 a function stops fitting in your head — this one is ${over}× past that. Fix: move each branch's body into its own small function, so ${p.worst_block} reads like an index.`);
          targets.push({ line: p.worst_line ?? null, code: codeAt(p.worst_line) ?? p.worst_block, note: `${p.worst_block} · score ${p.worst_cognitive} (${over}× the ~15 limit) — move each branch body into its own named function; start with the longest branch` });
        }
        if ((p.max_nesting ?? 0) > 4) {
          bits.push(`Code sits ${p.max_nesting} levels deep — to read one line you carry ${p.max_nesting} conditions in your head. Fix: return early. Each \`if (!x) return\` at the top removes one level of wrapping.`);
          targets.push({ line: p.max_nesting_line ?? null, code: codeAt(p.max_nesting_line), note: `${p.max_nesting} levels deep — flip each wrapping if into an early return (\`if (!cond) return\`), one per level, until you're at ~3` });
        }
        if ((p.nested_loops ?? 0) > 0) {
          // read the loops off the source: a loop over the outer element's OWN items is one pass,
          // not N×N — the old text warned "1,000 → 1,000,000" for every nest, including those
          const note = nestedLoopsNote(nestedLoops(srcLines, p.worst_line, worstEnd));
          bits.push(note ?? `${p.nested_loops} loop(s) inside loops — if both range over the same collection that is N×N; put one side in a Map first.`);
        }
      }
      const topBlocks = (blocks ?? []).filter((b: any) => b.complexity != null).sort((x: any, y: any) => (y.complexity ?? 0) - (x.complexity ?? 0)).slice(0, 4);
      if (dense) bits.push(`The nesting peaks at L${p.max_nesting_line} inside the ${dense.kind} at L${dense.start} (\`${dense.head}\`, L${dense.start}–${dense.end}) — that region, not the function's top-level branches, is what to move out first.`);
      // transitive weight — the imports ARE the code behind it; each resolved to the file it lands on
      if ((g.transitive ?? 0) >= 5 || (p.pct_transitive ?? 0) >= 0.5) {
        bits.push(`Anyone who imports this file silently drags in ${g.transitive ?? "?"} more files behind it. Fix: drop or lazy-load the imports it barely uses — each line below shows where that import lands.`);
        targets.push(...importLines.map((l) => ({ line: l.line, code: l.code, note: resolveImport(l.code) })));
      }
      // real branching (absolute, not just rank) — extract the dense blocks
      if (cxAbs >= 8 && topCx.length) {
        bits.push(`then extract the dense blocks into small named functions.`);
        targets.push(...topCx.map((b: any) => ({ line: b.line, code: codeAt(b.line) ?? b.name, note: `${b.name} · cyclomatic ${b.complexity} = ${b.complexity} independent paths to read (and test) · L${b.line}–${b.end_line ?? b.line} — extract its densest branch into a named function` })));
      } else if ((p.pct_complexity ?? 0) >= 0.4 && cxAbs <= 3) {
        // HONESTY: a trivial absolute cx ranking high = a small-file repo, not a real problem
        bits.push(`complexity is only ${cxAbs} in absolute terms — it ranks ${ordinal(Math.round((p.pct_complexity ?? 0) * 100))} pct only because this repo's files are small; not the real lever here.`);
      }
      if (p.god_file) bits.push("It's also a god-file: many files depend on it AND it does many jobs — every change here risks everything. Long-term fix: split it into one module per job.");
      if (!targets.length) { // never empty — point at the biggest real blocks, with their code
        targets.push(...topBlocks.map((b: any) => ({ line: b.line, code: codeAt(b.line) ?? b.name, note: `${b.name} · cyclomatic ${b.complexity ?? 0} = ${b.complexity ?? 0} paths to read/test · L${b.line}–${b.end_line ?? b.line} — the densest block here; extract its longest branch arm first` })));
        if (!targets.length && importLines.length) targets.push(...importLines.map((l) => ({ line: l.line, code: l.code, note: resolveImport(l.code) })));
      }
      // the −/+ example: THE REAL CODE (operator 2026-07-23 — "should show before and after the
      // dense lines… the specific blocks, or lines that should be changed"). The − side harvests
      // the block's ACTUAL branch arms (their real conditions + real line ranges) straight from the
      // source; the + side rewrites the same function as an index of those arms, each pointing at
      // the exact lines that move. Falls back to a shape sketch only when the source isn't loaded.
      const B = p.worst_block ?? "theBlock";
      const worstBlk = topCx.find((b: any) => b.line === p.worst_line) ?? topCx[0] ?? null;
      // arms come from the dense region when there is one (its `case`/`if` heads), else the block's top level
      const harvested = (dense ? harvestArms(srcLines, dense.start, dense.end) : null) ?? harvestArms(srcLines, p.worst_line, worstBlk?.end_line);
      // a body that is ONE giant arm (a 600-line switch) exhibits that arm's own cases
      const realArms = descendDominant(srcLines, harvested, (a2, b2) => harvestArms(srcLines, a2, b2));
      const armsHead = dense ? codeAt(dense.start) ?? dense.head : codeAt(p.worst_line);
      const armsLabel = dense ? `the ${dense.kind} at L${dense.start} inside ${B}` : B;
      const example = p.basis === "cognitive" && (p.worst_cognitive ?? 0) > 8 && codeAt(p.worst_line)
        ? realArms
          ? {
              bad: [
                `${armsHead}`,
                ...realArms.map((a) => `  ${a.text}   // L${a.ln}–${a.to} · ${a.to - a.ln + 1} lines live in this arm`),
                ...((realArms[0] as any)?.more > 0 ? [`  … +${(realArms[0] as any).more} more arms`] : []),
                `}  // ${dense ? `${armsLabel}: ${realArms.length + Math.max(0, (realArms[0] as any)?.more ?? 0)} arms ${p.max_nesting} levels deep` : `ONE body carries all ${realArms.length + Math.max(0, (realArms[0] as any)?.more ?? 0)} arms`} → score ${p.worst_cognitive}`,
              ].join("\n"),
              good: [
                `${armsHead}`,
                ...realArms.map((a, i) => `  ${a.text} ${dense ? "" : "return "}${B}${i + 1}(…);   // its L${a.ln}–${a.to} move out unchanged`),
                `}`,
                ``,
                ...realArms.slice(0, 3).map((a, i) => `function ${B}${i + 1}(…) { /* the real L${a.ln}–${a.to}, pasted as-is */ }`),
                dense ? `// the ${dense.kind} at L${dense.start} becomes a dispatch; nesting drops by ${Math.max(1, (p.max_nesting ?? 3) - 2)} and each arm tests alone` : `// ${B} becomes a ${realArms.length + 2}-line index; each helper fits in your head and tests alone`,
              ].join("\n"),
            }
          : {
              bad: `${codeAt(p.worst_line)}\n  …all branches in one body → score ${p.worst_cognitive}…\n}`,
              good: `${codeAt(p.worst_line)}\n  // one \`return ${B}X(…)\` per branch — each body moves to its own function\n}`,
            }
        : (p.max_nesting ?? 0) > 4 && codeAt(p.max_nesting_line)
          ? {
              // REAL pyramid: the actual lines above the deepest point, verbatim
              bad: srcLines
                ? srcLines.slice(Math.max(0, (p.max_nesting_line ?? 1) - 5), p.max_nesting_line).map((t: string, i: number) => `${(p.max_nesting_line ?? 1) - 4 + i}│ ${t}`).join("\n")
                : `…${p.max_nesting} nested levels…`,
              good: `// same logic, flipped to early returns — one per wrapping if:\nif (!condA) return;\nif (!condB) continue;\n…the deep work from L${p.max_nesting_line}, now at the top level…`,
            }
          : undefined;
      return { detail: bits.join(" ") || `structure ${a.score} is driven by repo-relative ranking — the concrete levers it has are below.`, targets, example };
    }
    if (ax === "coupling") {
      // LIVE comments (operator 2026-07-18: "you know the lines, the snippets — not generic").
      // Reworked 2026-07-23 ("fan-in 1 · fan-out 1 … doesn't make sense, should be specific and
      // didactic"): (1) trivially-coupled files get the HONESTY treatment — the rank is a small-repo
      // artifact, not a problem, and the item leaves the plan; (2) facade advice separates INTERNAL
      // directories (the facade is an index file THERE) from EXTERNAL packages (the facade would be
      // a local deps module HERE — never "inside @babel/"); (3) every path ends with the exact move.
      const fi = g.fan_in ?? 0, fo = g.fan_out ?? 0;
      // HONESTY: 1-in/1-out is healthy wiring — it only ranked weak because this repo's files are
      // small. No targets → the item demotes out of the plan (same rule as trivial complexity).
      if (fi <= 2 && fo <= 2 && !p.cycle) return { detail: `fan-in ${fi} · fan-out ${fo} — that's healthy wiring; it ranks low only against this repo's percentiles. Nothing to do here.`, targets: [] };
      // the only levers an edit has on this axis are a cycle to break or an internal cluster to
      // fold; a low-fan-in file with neither is ranked, not broken — it leaves the plan below
      const landing = importLines.map((l) => ({ ...l, to: resolveImport(l.code) }));
      const specOf = (t: { code: string }) => t.code.match(/from\s+['"]([^'"]+)['"]/)?.[1] ?? t.code.match(/require\(\s*['"]([^'"]+)['"]/)?.[1] ?? null;
      // INTERNAL cluster: ≥3 imports resolving to files in the SAME repo directory → a real facade
      // candidate (an index.* in that directory re-exporting what this file needs).
      const byDir = new Map<string, typeof landing>();
      for (const l of landing) { if (!l.to) continue; const d2 = l.to.split("/").slice(0, -1).join("/"); if (d2) { if (!byDir.has(d2)) byDir.set(d2, []); byDir.get(d2)!.push(l); } }
      const facade = [...byDir.entries()].filter(([, ls]) => ls.length >= 3).sort((x, y) => y[1].length - x[1].length)[0];
      // EXTERNAL cluster: ≥3 imports from the same PACKAGE scope (@scope/* or pkg/*) — a different
      // move: a local deps module in YOUR repo, and only worth it if several files repeat the cluster.
      const byPkg = new Map<string, typeof landing>();
      for (const l of landing) { if (l.to) continue; const s2 = specOf(l); if (!s2 || s2.startsWith(".")) continue; const pkg = s2.startsWith("@") ? s2.split("/").slice(0, 1)[0] : s2.split("/")[0]; if (!byPkg.has(pkg)) byPkg.set(pkg, []); byPkg.get(pkg)!.push(l); }
      const extCluster = [...byPkg.entries()].filter(([, ls]) => ls.length >= 3).sort((x, y) => y[1].length - x[1].length)[0];
      const lineList = (ls: { line: number }[]) => ls.map((l) => `L${l.line}`).join(" · ");
      const bits = [`fan-in ${fi} (files that import this one) · fan-out ${fo} (files this one imports)${p.cycle ? " — and it sits in an import CYCLE: break that first, nothing else matters until the arrows point one way" : ""}.`];
      if (facade) bits.push(`${facade[1].length} of the ${landing.length} imports resolve into ${facade[0]}/ (${lineList(facade[1])}). The move: create ${facade[0]}/index re-exporting those ${facade[1].length}, import '${relSpec(con.path ?? "", facade[0])}' instead — ${facade[1].length} edges become 1 and later shuffles inside ${facade[0]}/ stop touching this file.`);
      else if (extCluster) bits.push(`${extCluster[1].length} imports pull from the ${extCluster[0]} package (${lineList(extCluster[1])}). That's fine for ONE file — external imports are cheap edges. Only if several files repeat this same cluster, add a local module re-exporting what you use, so the app binds to YOUR module instead of the package layout.`);
      // INBOUND-heavy (fan-out is fine): the live targets are the actual dependents, each named.
      if (fi >= 3 && fo <= 2) {
        bits.push(`The weight is INBOUND: ${fi} files depend on this one — every exported-signature change ripples into all of them. The move: keep the exported surface small and stable, and pin it with a test.`);
        if (A.importers.length) return {
          detail: bits.join(" "),
          targets: A.importers.map((pth) => ({ file: pth, note: `imports this file — a signature change here breaks ${pth.split("/").pop()}` })),
          example: {
            bad: `// ${fi} files call this export:\nexport function doWork(a, b, c, d) { … }\n// adding argument e = editing all ${fi} call sites`,
            good: `// same function, future-proof surface:\nexport function doWork(input: { a; b; c?; d? }) { … }\n// a new field later breaks NOBODY — callers pass an object`,
          },
        };
      }
      if (!facade && !extCluster && fo >= 3) bits.push(`The weight is OUTBOUND: ${fo} imports, no collapsible cluster — the move is to cut or lazy-load the ones this file barely uses (each line below says where it lands).`);
      // HONESTY (operator 2026-07-23: a red axis whose only advice is "fine to keep" is a
      // contradiction): every import external + nothing depends on this file → the rank is a
      // small-repo artifact, not a defect. No targets → the item leaves the plan.
      if (!facade && !extCluster && fi < 3 && landing.length > 0 && !landing.some((l) => l.to)) {
        return { detail: `All ${landing.length} imports are npm packages and only ${fi} file(s) import this one — that's cheap, normal wiring. The score is a rank against this repo's percentiles, not a defect. Nothing to change here.`, targets: [] };
      }
      if (!facade && !p.cycle && fi < 3) {
        return { detail: bits.join(" ") + ` No cycle and no same-directory cluster to fold — the score is this file's rank in the repo, not a defect an edit fixes. Nothing to change here.`, targets: [] };
      }
      // before/after from the REAL import lines: the cluster as it is vs the one-line facade
      const clusterLines = (facade?.[1] ?? extCluster?.[1] ?? []).slice(0, 4);
      const couplingExample = clusterLines.length >= 3 ? {
        bad: clusterLines.map((l) => `${l.line}│ ${l.code.trim().slice(0, 70)}`).join("\n") + `\n// ${clusterLines.length}${(facade?.[1] ?? extCluster?.[1] ?? []).length > 4 ? "+" : ""} separate lines binding to the same ${facade ? `${facade[0]}/ layout` : `${extCluster![0]} package layout`}`,
        good: facade
          ? `import { …what this file uses… } from '${relSpec(con.path ?? "", facade[0])}';\n\n// ${facade[0]}/index.ts (new, ~${facade[1].length} lines):\n${facade[1].slice(0, 3).map((l) => `export * from './${(l.to ?? "").split("/").pop()?.replace(/\.\w+$/, "") ?? "module"}';`).join("\n")}\n// ${facade[1].length} edges become 1 — moves inside ${facade[0]}/ stop touching this file`
          : `import { …what this file uses… } from '@/deps/${extCluster![0].replace(/^@/, "")}';\n\n// src/deps/${extCluster![0].replace(/^@/, "")}.ts (new):\nexport { … } from '${extCluster![0]}/…';\n// worth it ONLY if several files repeat this same cluster`,
      } : undefined;
      // in a CYCLE the ring is the finding — the mutual importers lead, then the import lines
      const mutual = p.cycle ? A.imports.filter((pth) => A.importers.includes(pth)) : [];
      const cycleTargets: Target[] = p.cycle ? (mutual.length ? mutual.map((pth) => ({ file: pth, note: "imports this file AND is imported by it — the ring closes here; extract what they share" })) : [{ note: `in an import cycle (atlas smell) — the ring runs through ${A.imports.length} import${A.imports.length === 1 ? "" : "s"} and back; break it before anything else` }]) : [];
      return {
        detail: bits.join(" "),
        targets: landing.length
          ? [...cycleTargets, ...landing.map((l) => { const pkg = specOf(l); return { line: l.line, code: l.code, note: facade && l.to && l.to.startsWith(facade[0] + "/") ? `→ ${l.to} — one of ${facade[1].length} to fold behind ${facade[0]}/index` : l.to ? `→ ${l.to}` : `→ ${pkg ?? "npm package"} (external) — a cheap edge, keep it; only wrap it if several files repeat this exact group` }; })]
          : A.imports.map((pth) => ({ file: pth, note: "resolved dependency" })),
        example: couplingExample,
      };
    }
    if (ax === "tests") {
      const base = (con.path ?? "").split("/").pop()?.replace(/\.\w+$/, "") ?? "module";
      // the test must import something the module EXPORTS — the most complex exported block, or
      // the default export read off the source; never a module-private function
      const tt = pickTestTarget((blocks ?? []) as any, srcLines, base);
      const topExport = tt.kind === "none" ? "" : tt.name;
      const importLine = tt.kind === "none" ? `// ${tt.why}` : tt.importLine;
      return {
        // when change is ALSO weak, it merges in here — the untested hotspot is ONE finding, and the fix is one move
        detail: `${AXIS_REMEDY.tests(p, g)}${weakKeys.has("change") && (g.churn ?? 0) >= 3 ? ` AND it changed ×${g.churn} — the untested-hotspot combo: the test pays for itself on the very next change.` : ""}`,
        targets: [...(testName ? [{ file: testName, note: "create this test file — cover the top export first" }] : []), ...A.importers.map((pth) => ({ file: pth, note: "depends on this file — breakage lands here" }))],
        example: {
          bad: `// ${testName ?? `${base}.test`} — DOES NOT EXIST\n// ${g.fan_in ?? 0} file(s) import ${base} with no safety net:\n// a silent behavior change here ships straight into all of them`,
          good: tt.kind === "none"
            ? `// ${testName ?? `${base}.test`}:\n${importLine}\n// test the nearest exported caller instead`
            : `// ${testName ?? `${base}.test`}:\n${importLine}   // ${tt.why}\n\n${testBody(tt, (blocks ?? []) as any)}\n// one test → every importer is protected from a silent break`,
        },
      };
    }
    if (ax === "change") {
      if (weakKeys.has("tests")) return { detail: "", targets: [], merged: true }; // folded into the tests finding
      const B2 = topCx[0]?.name ?? (blocks ?? [])[0]?.name ?? "theHotSpot";
      return {
        detail: AXIS_REMEDY.change(p, g),
        targets: (topCx.length ? topCx : (blocks ?? []).slice(0, 3)).map((b: any) => ({ line: b.line, code: codeAt(b.line) ?? b.name, note: `write a test pinning ${b.name}'s current behavior${b.complexity != null ? ` (cx ${b.complexity})` : ""} — the likeliest break point on the next change` })),
        example: {
          bad: `// ${B2} changed ×${g.churn ?? p.churn ?? "?"} recently, zero tests pin it —\n// every edit may flip its behavior and nobody notices until production`,
          good: `test('${B2} — current behavior, pinned', () => {\n  expect(${B2}(realisticInput)).toEqual(currentOutput);\n});\n// the next change either keeps behavior or FAILS loudly right here`,
        },
      };
    }
    if (ax === "cohesion") {
      // A TOOLBOX is not a junk drawer: a module whose definitions are mostly exported and that
      // many files import (a visitors.ts, a utils.ts) is a set of independent tools by design —
      // its functions not calling one another is the point. Cohesion ranks it low; nothing is
      // broken, and "split it" would scatter a library across files.
      const defs = (blocks ?? []).filter((b: any) => b.kind !== "const" && b.kind !== "type");
      const exportedN = defs.filter((b: any) => (b.flags ?? []).includes("exported")).length;
      if (defs.length >= 2 && exportedN / defs.length >= 0.5 && (g.fan_in ?? 0) >= 3) {
        return { detail: `${exportedN} of ${defs.length} definitions are exported and ${g.fan_in} files import this module — a toolbox, not a junk drawer. Its tools are independent by design; low cohesion is the shape of a library, not a defect. Nothing to change here.`, targets: [] };
      }
      // the neighborhood data knows each block's REAL links — name the islands, not a rhetorical question
      const nbB = con.blocks ?? [];
      const isl = nbB.filter((b) => (b.in + b.out) === 0);
      const island = isl[0] ?? null;
      const cohesionExample = island ? {
        bad: `// L${island.line}: ${island.name} lives in this file, but:\n//   nothing here calls ${island.name}\n//   ${island.name} calls nothing here\n// it only CONFUSES readers scanning this file's real job`,
        good: `// move it next to its real users (a new small module is fine):\n//   ${(con.path ?? "x").replace(/\.\w+$/, "")}-${island.name.toLowerCase().slice(0, 12)}.ts\nexport function ${island.name}(…) { …the body, unchanged… }\n// this file keeps ONE job; ${island.name} finds its family`,
      } : undefined;
      if (nbB.length) {
        return {
          detail: `${AXIS_REMEDY.cohesion(p, g)}${isl.length ? ` ${isl.length} of ${nbB.length} block(s) are islands:` : ""}`,
          targets: (isl.length ? isl : nbB).slice(0, 8).map((b) => ({ line: b.line, code: codeAt(b.line) ?? b.name, note: (b.in + b.out) === 0 ? `ISLAND — nothing in this file calls ${b.name}, and it calls nothing here. Move it next to its real users, or into its own module.` : `connected (${b.in + b.out} link${b.in + b.out === 1 ? "" : "s"}) — part of the cohesive core; keep it` })),
          example: cohesionExample,
        };
      }
      return { detail: AXIS_REMEDY.cohesion(p, g), targets: (blocks ?? []).slice(0, 8).map((b: any) => ({ line: b.line, code: codeAt(b.line) ?? b.name, note: "no intra-file links recorded for this block — likely an island" })) };
    }
    if (ax === "defects") {
      const f0 = A.findings[0] ?? null;
      return {
        detail: AXIS_REMEDY.defects(p, g),
        targets: A.findings.map((f) => ({ line: f.line, code: codeAt(f.line), note: f.text })),
        example: f0 ? {
          bad: `// L${f0.line ?? "?"}: ${String(f0.text ?? "the recorded finding").slice(0, 90)}\n${codeAt(f0.line) ?? "…the flagged line…"}`,
          good: `// 1) fix the flagged line\n// 2) pin it so it can't come back:\ntest('regression — ${String(f0.text ?? "finding").slice(0, 40)}', () => {\n  …fails before the fix, passes after…\n});`,
        } : undefined,
      };
    }
    return { detail: AXIS_REMEDY[ax]?.(p, g) ?? "", targets: [] };
  };
  // the FULL ranked plan — every law group + every weak axis that has a real code anchor. The tab
  // shows the top 5 by impact by default (operator 2026-07-23: "why doesn't it show all?"): the top
  // moves are where the health actually comes back, but a big file has more — "show all N" reveals
  // the rest. (Nothing is hidden in the review itself: every recorded violation renders as a line
  // comment in the hunks; every weak axis renders in "beyond the lines". This cap is only the
  // ACTIONABLE to-do list's default depth.)
  const planAll = [
    ...lawGroups.map((lg) => ({ id: `law:${lg.key}`, gain: Math.max(1, Math.round(lg.penalty * AXIS_W.compliance)), label: `fix ${lg.count > 1 ? `${lg.count}× ` : ""}${lg.title}`, detail: lg.fix, tone: SEV_TONE[lg.severity] ?? C.warn, targets: lawTargets(lg.key), example: lg.example })),
    // merged (change→tests) and target-less axis items never reach the plan — no un-anchored advice
    ...weak.map(({ ax, a }) => {
      const ap = axisPlan(ax, a); if (ap.merged || !ap.targets.length) return null;
      // what ONE edit can honestly recover — not "the axis goes to 100"
      const rg = realisticGain(ax, a.score, { godFile: !!a?.parts?.god_file, cycle: !!a?.parts?.cycle, facade: /index re-exporting/.test(ap.detail) });
      if (rg.gain <= 0) return null;
      return { id: `ax:${ax}`, gain: rg.gain, ceiling: rg.ceiling, gainWhy: rg.why, label: `raise ${ax} (${a.score} → ≈${rg.ceiling})`, detail: ap.detail, tone: conTone(a.score), targets: ap.targets, example: ap.example };
    }).filter(Boolean) as any[],
  ].sort((x, y) => y.gain - x.gain);
  const [showAllPlan, setShowAllPlan] = React.useState(false);
  const plan = showAllPlan ? planAll : planAll.slice(0, 5);
  // a weak axis is a CONCERN only when its plan has something an edit recovers; "healthy wiring
  // ranked low against this repo's percentiles" is context, not a note against the file
  const concerns = weak.filter(({ ax, a }) => { const ap = axisPlan(ax, a); return ap.merged || ap.targets.length > 0; });
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  // 📋 copy feedback / copy plan (operator 2026-09-29) — clipboard texts built by pure functions in file-review-copy.ts
  const [copied, setCopied] = React.useState<"fb" | "plan" | null>(null);
  const doCopy = async (which: "fb" | "plan") => {
    const text = which === "fb"
      ? feedbackText({ path: con.path, health, laws: lawGroups.map((lg) => ({ title: lg.title, key: lg.key, severity: lg.severity, fix: lg.fix, rule_md: lg.rule_md, insts: lg.insts })),
          axes: planAll.filter((p) => String(p.id).startsWith("ax:")).map((p) => { const ax = String(p.id).slice(3); return { ax, score: (con.axes as any)?.[ax]?.score, detail: p.detail, targets: p.targets }; }) })
      : planText({ path: con.path, health, steps: plan });
    if (!text || !(await copyText(text))) return;
    setCopied(which); setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
  };
  // review tab: the whole file with UNCOMMENTED regions collapsed (operator 2026-07-23) — each gap
  // between comment clusters folds to a "⋯ N lines" divider; expand one, or reveal the whole file.
  const [revealAll, setRevealAll] = React.useState(false);
  const [openGap, setOpenGap] = React.useState<Record<string, boolean>>({});
  // review margin: draggable comment cards (operator 2026-07-23: "make the comments draggable, so we
  // can position if a comment is above another"). id → {dx,dy} pixel offset from its stacked slot;
  // the arrow to the code line re-anchors so it keeps pointing at the right line as the card moves.
  const [cardPos, setCardPos] = React.useState<Record<string, { dx: number; dy: number }>>({});
  const cardPosRef = React.useRef(cardPos); cardPosRef.current = cardPos; // read current offset without a state-updater side effect
  const reviewBodyRef = React.useRef<HTMLDivElement | null>(null); // export target — the active review tab's content
  React.useEffect(() => { setCardPos({}); }, [con.path]); // fresh layout per file
  const startCardDrag = React.useCallback((id: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // let inner buttons click
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const base = cardPosRef.current[id] ?? { dx: 0, dy: 0 };
    const move = (ev: MouseEvent) => setCardPos((mm) => ({ ...mm, [id]: { dx: base.dx + (ev.clientX - sx), dy: base.dy + (ev.clientY - sy) } }));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  }, []);

  // ── SIMULATE FIX — the deterministic what-if (no AI, no code touched): re-run
  // the REAL formulas under a hypothesis. Only honest models simulate: fixing a
  // law group recovers exactly its penalty; adding the test → 100; extracting the
  // worst block halves its cognitive. Axes we can't honestly model stay put.
  const totalPen = React.useMemo(() => (con.violations ?? []).reduce((s, v) => s + Math.round((v.weight ?? 1) * (v.confidence ?? 1)), 0), [con]);
  const simulate = (items: any[]) => {
    const cur: Record<string, number | null> = {}; for (const ax of AXES) cur[ax] = (con.axes?.[ax] as any)?.score ?? null;
    const next = { ...cur };
    let removedPen = 0, extract = false, addTest = false;
    for (const it of items) {
      if (String(it.id ?? "").startsWith("law:")) { const lg = lawGroups.find((l: any) => `law:${l.key}` === it.id); if (lg) removedPen += lg.penalty; }
      if (it.id === "ax:tests") addTest = true;
      if (it.id === "ax:structure") extract = true;
    }
    if (removedPen && cur.compliance != null) next.compliance = Math.max(10, 100 - Math.min(90, Math.max(0, totalPen - removedPen)));
    if (addTest && cur.tests != null) next.tests = 100;
    if (extract && cur.structure != null) {
      const p = (con.axes?.structure as any)?.parts ?? {};
      if (p.basis === "cognitive") {
        const worst2 = Math.ceil((p.worst_cognitive ?? 0) / 2); // extraction splits the dense block
        const penCog = Math.max(0, Math.min(55, (worst2 - 8) * 3));
        const penNest = (p.max_nesting ?? 0) > 4 ? Math.min(15, ((p.max_nesting ?? 0) - 4) * 5) : 0;
        next.structure = Math.max(0, Math.min(100, Math.round(100 - (penCog + penNest + 20 * (p.pct_transitive ?? 0) + (p.god_file ? 15 : 0)))));
      }
    }
    const blend = (m: Record<string, number | null>) => { let s = 0, w = 0; for (const ax of AXES) if (m[ax] != null) { s += m[ax]! * (AXIS_W[ax] ?? 0); w += AXIS_W[ax] ?? 0; } return w ? Math.round(s / w) : null; };
    return { cur, next, healthCur: blend(cur), healthNext: blend(next) };
  };
  const [simFor, setSimFor] = React.useState<string | null>(null); // plan-item id with its what-if open
              // ── the sketch kit — hand-drawn boxes/arrows for the structural drawings ──
              const SBox = ({ x, y, w, h, label, tone = C.dim, dashed = false, rot = -0.6 }: any) => (
                <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
                  <rect x={x} y={y} width={w} height={h} rx={5} fill="none" stroke={tone} strokeWidth={1.2} strokeDasharray={dashed ? "4 3" : undefined} />
                  <text x={x + w / 2} y={y + h / 2 + 3} textAnchor="middle" fill={tone} style={{ fontFamily: mono, fontSize: 8 }}>{label}</text>
                </g>
              );
              const SArrow = ({ x1, y1, x2, y2, tone = C.dim, dashed = false }: any) => {
                const mx = (x1 + x2) / 2 + (y2 - y1) * 0.15, my = (y1 + y2) / 2 - (x2 - x1) * 0.08;
                const ang = Math.atan2(y2 - my, x2 - mx);
                return (
                  <g stroke={tone} fill="none" strokeWidth={1.2} strokeLinecap="round">
                    <path d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`} strokeDasharray={dashed ? "4 3" : undefined} />
                    <path d={`M ${x2 - 7 * Math.cos(ang - 0.45)} ${y2 - 7 * Math.sin(ang - 0.45)} L ${x2} ${y2} L ${x2 - 7 * Math.cos(ang + 0.45)} ${y2 - 7 * Math.sin(ang + 0.45)}`} />
                  </g>
                );
              };
              const base = (p?: string | null) => (p ?? "").split("/").pop() ?? "";
              const clip8 = (s: string, n = 17) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
              // which weak axes get a DRAWING vs a text note
              const importNames = (A.imports.length ? A.imports.map(base) : importLines.map((l) => { const m = l.code.match(/from\s+['"]([^'"]+)['"]/) ?? l.code.match(/require\(\s*['"]([^'"]+)['"]/); return m ? (m[1].split("/").filter(Boolean).pop() ?? m[1]) : ""; }).filter(Boolean)).slice(0, 4);
              // fixed=true draws the AFTER state (operator 2026-07-23: "the excalidraw-like will
              // show the draw before changes, and the draw after") — same visual language, healed.
              const AxisSketch = ({ ax, a, fixed = false }: { ax: string; a: any; fixed?: boolean }) => {
                const me = clip8(base(con.path), 20);
                const p2 = a?.parts ?? {};
                // STRUCTURE · cognitive-driven → ⌗exploded-function (replaced ⌗skyline, operator
                // 2026-07-23: "it doesn't represent a complex situation simplified in a draw"):
                // ONE box (the function) stuffed with its REAL arms — height ∝ real line count,
                // label = real condition. After: a thin index + each arm as its own small helper.
                if (ax === "structure" && p2.basis === "cognitive" && (p2.worst_cognitive ?? 0) > 8 && (blocks ?? []).length) {
                  const wb = (blocks ?? []).find((b: any) => b.name === p2.worst_block) ?? null;
                  // the DENSE REGION (the loop/switch around max_nesting_line) is what the drawing
                  // explodes when there is one — the block's top-level arms may be elsewhere
                  const dense2 = (p2.max_nesting ?? 0) >= 3 && p2.max_nesting_line != null && wb?.end_line != null && p2.max_nesting_line > (p2.worst_line ?? 0) && p2.max_nesting_line <= wb.end_line
                    ? enclosingRegion(srcLines, p2.max_nesting_line, p2.worst_line, wb.end_line) : null;
                  const arms = descendDominant(srcLines, (dense2 ? harvestArms(srcLines, dense2.start, dense2.end) : null) ?? harvestArms(srcLines, p2.worst_line, wb?.end_line), (a2, b2) => harvestArms(srcLines, a2, b2)) ?? [];
                  const totalLines = Math.max(1, arms.reduce((s2, a2) => s2 + (a2.to - a2.ln + 1), 0));
                  const BN = dense2 ? `${dense2.kind}@L${dense2.start}` : (p2.worst_block ?? "the function");
                  const HN = p2.worst_block ?? "helper"; // the extracted helpers are named after the FUNCTION, whatever region they leave
                  if (fixed) {
                    // AFTER: the index (one thin row per arm) + small helper boxes, arrows out
                    const n = Math.max(2, Math.min(arms.length || 3, 5));
                    const H = Math.max(120, n * 30 + 40);
                    return (
                      <svg viewBox={`0 0 520 ${H}`} style={{ width: "100%", maxWidth: 560, display: "block" }}>
                        <SBox x={10} y={16} w={170} h={n * 14 + 26} label="" tone={C.ok} rot={-0.3} />
                        <text x={20} y={28} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>{clip8(BN, 18)} — now an INDEX</text>
                        {Array.from({ length: n }, (_, i) => (
                          <text key={i} x={22} y={42 + i * 14} fill={C.muted} style={{ fontFamily: mono, fontSize: 6.5 }}>{clip8(arms[i]?.text ?? `arm ${i + 1}`, 22)} → {clip8(`${HN}${i + 1}`, 10)}</text>
                        ))}
                        {Array.from({ length: n }, (_, i) => (
                          <g key={`h${i}`}>
                            <SArrow x1={182} y1={40 + i * 14} x2={288} y2={22 + i * 30} tone={C.ok} />
                            <SBox x={292} y={12 + i * 30} w={150} h={22} label={clip8(`${HN}${i + 1} · L${arms[i]?.ln ?? "?"}–${arms[i]?.to ?? "?"}`, 20)} tone={C.ok} rot={i % 2 ? 0.4 : -0.4} />
                          </g>
                        ))}
                        <text x={12} y={H - 6} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>✓ {clip8(BN, 16)} reads in {n + 2} lines; each helper fits in your head and tests alone</text>
                      </svg>
                    );
                  }
                  // BEFORE: one box carrying every arm — each arm's height is its REAL share of the lines
                  const innerH = 96; let yAcc = 30;
                  const armRects = (arms.length ? arms : [{ ln: p2.worst_line ?? 0, to: (p2.worst_line ?? 0) + 20, text: "the whole body" } as any]).map((a2: any) => {
                    const h2 = Math.max(12, Math.round(((a2.to - a2.ln + 1) / totalLines) * innerH));
                    const r2 = { ...a2, y: yAcc, h: Math.min(h2, 34) }; yAcc += r2.h + 4; return r2;
                  });
                  const H = Math.max(140, yAcc + 26);
                  return (
                    <svg viewBox={`0 0 520 ${H}`} style={{ width: "100%", maxWidth: 560, display: "block" }}>
                      <SBox x={10} y={12} w={300} h={yAcc - 4} label="" tone={C.warn} rot={-0.25} />
                      <text x={20} y={26} fill={C.warn} style={{ fontFamily: mono, fontSize: 7.5 }}>{clip8(BN, 20)} · score {p2.worst_cognitive} — {dense2 ? `${arms.length} arms, ${p2.max_nesting} deep in ${clip8(p2.worst_block ?? "", 12)}` : `ONE body, ${arms.length || "all"} arms`}</text>
                      {armRects.map((a2: any, i: number) => (
                        <g key={i}>
                          <SBox x={26} y={a2.y} w={268} h={a2.h} label="" tone={C.muted} rot={i % 2 ? 0.35 : -0.35} />
                          <text x={34} y={a2.y + Math.min(12, a2.h - 3)} fill={C.muted} style={{ fontFamily: mono, fontSize: 6.3 }}>{clip8(a2.text, 40)} · L{a2.ln}–{a2.to} ({a2.to - a2.ln + 1} lines)</text>
                        </g>
                      ))}
                      <text x={330} y={40} fill={C.dim} style={{ fontFamily: mono, fontSize: 7.5 }}>to read ONE arm you scroll</text>
                      <text x={330} y={52} fill={C.dim} style={{ fontFamily: mono, fontSize: 7.5 }}>past every other arm —</text>
                      <text x={330} y={64} fill={C.dim} style={{ fontFamily: mono, fontSize: 7.5 }}>all paths share one scope</text>
                      <SArrow x1={330} y1={78} x2={300} y2={86} tone={C.ok} dashed />
                      <text x={330} y={92} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>✂ each arm → its own function</text>
                    </svg>
                  );
                }
                // STRUCTURE · nesting-driven → the STAIRCASE into the deep, with the early-return escape.
                if (ax === "structure" && (p2.max_nesting ?? 0) > 4) {
                  const N2 = Math.min(p2.max_nesting, 7);
                  if (fixed) {
                    // AFTER: a flat corridor — early returns exit at the top; the work sits at depth ≤2
                    return (
                      <svg viewBox="0 0 520 122" style={{ width: "100%", maxWidth: 560, display: "block" }}>
                        {[0, 1].map((i) => (
                          <g key={i}>
                            <path d={`M ${20 + i * 54} ${26 + i * 13} h 54`} stroke={C.dim} strokeWidth="1.3" fill="none" strokeLinecap="round" />
                            <path d={`M ${74 + i * 54} ${26 + i * 13} v 13`} stroke={C.dim} strokeWidth="1.3" fill="none" strokeLinecap="round" />
                            <text x={26 + i * 54} y={22 + i * 13} fill={C.dim} style={{ fontFamily: mono, fontSize: 6.5 }}>depth {i + 1}</text>
                          </g>
                        ))}
                        <path d={`M 128 52 H 434`} stroke={C.ok} strokeWidth="1.4" fill="none" strokeLinecap="round" />
                        <text x={140} y={46} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>✓ the work runs here — flat, depth 2</text>
                        {Array.from({ length: 3 }, (_, i) => (
                          <g key={`r${i}`}>
                            <SArrow x1={40 + i * 30} y1={26} x2={40 + i * 30} y2={8} tone={C.ok} />
                            <text x={20} y={6} fill={C.ok} style={{ fontFamily: mono, fontSize: 7 }}>early returns exit up here</text>
                          </g>
                        ))}
                        <text x={140} y={110} fill={C.dim} style={{ fontFamily: mono, fontSize: 7.5 }}>the {N2}-step staircase is gone — L{p2.max_nesting_line ?? "?"} now lives at the surface</text>
                      </svg>
                    );
                  }
                  return (
                    <svg viewBox="0 0 520 122" style={{ width: "100%", maxWidth: 560, display: "block" }}>
                      {Array.from({ length: N2 }, (_, i) => (
                        <g key={i}>
                          <path d={`M ${20 + i * 54} ${20 + i * 13} h 54`} stroke={i >= 4 ? C.warn : C.dim} strokeWidth="1.3" fill="none" strokeLinecap="round" />
                          <path d={`M ${74 + i * 54} ${20 + i * 13} v 13`} stroke={i >= 4 ? C.warn : C.dim} strokeWidth="1.3" fill="none" strokeLinecap="round" />
                          <text x={26 + i * 54} y={16 + i * 13} fill={i >= 4 ? C.warn : C.dim} style={{ fontFamily: mono, fontSize: 6.5 }}>depth {i + 1}</text>
                        </g>
                      ))}
                      <SArrow x1={132} y1={44} x2={156} y2={10} tone={C.ok} dashed />
                      <text x={164} y={14} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>return early — climb out at depth 2</text>
                      <text x={Math.min(20 + N2 * 54, 380)} y={32 + N2 * 13} fill={C.warn} style={{ fontFamily: mono, fontSize: 7.5 }}>L{p2.max_nesting_line ?? "?"} lives down here</text>
                    </svg>
                  );
                }
                // STRUCTURE · transitive weight → ⌗iceberg: one visible box above the waterline,
                // the dragged mass hanging below it (importing this file LOOKS like one edge…).
                if (ax === "structure" && ((g.transitive ?? 0) >= 5 || (p2.pct_transitive ?? 0) >= 0.5)) {
                  const mass = Math.min(Number(g.transitive ?? 12), 18);
                  const rows2 = Math.ceil(mass / 6);
                  if (fixed) {
                    return (
                      <svg viewBox="0 0 520 130" style={{ width: "100%", maxWidth: 560, display: "block" }}>
                        <line x1={8} y1={44} x2={500} y2={44} stroke={C.dim} strokeWidth="1" strokeDasharray="6 5" opacity="0.7" />
                        <SBox x={30} y={14} w={140} h={24} label={me} tone={C.ok} rot={-0.4} />
                        {Array.from({ length: Math.min(4, mass) }, (_, i) => (
                          <g key={i} opacity={0.85}>
                            <path d={`M ${70 + i * 20} 38 v 18`} stroke={C.dim} strokeWidth="1" />
                            <SBox x={50 + i * 26} y={58} w={22} h={14} label="" tone={C.dim} rot={i % 2 ? 0.6 : -0.6} />
                          </g>
                        ))}
                        {Array.from({ length: 3 }, (_, i) => (
                          <g key={`cut${i}`}>
                            <path d={`M ${200 + i * 34} 38 v 10`} stroke={C.bad} strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
                            <text x={196 + i * 34} y={62} fill={C.ok} style={{ fontFamily: mono, fontSize: 8 }}>✂</text>
                          </g>
                        ))}
                        <text x={310} y={30} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>✓ the heavy chains are cut / lazy-loaded</text>
                        <text x={310} y={70} fill={C.dim} style={{ fontFamily: mono, fontSize: 7.5 }}>importing {clip8(me, 14)} now costs</text>
                        <text x={310} y={82} fill={C.dim} style={{ fontFamily: mono, fontSize: 7.5 }}>what it looks like it costs</text>
                      </svg>
                    );
                  }
                  return (
                    <svg viewBox="0 0 520 130" style={{ width: "100%", maxWidth: 560, display: "block" }}>
                      <line x1={8} y1={44} x2={500} y2={44} stroke={C.dim} strokeWidth="1" strokeDasharray="6 5" opacity="0.7" />
                      <text x={430} y={40} fill={C.dim} style={{ fontFamily: mono, fontSize: 7 }}>the waterline</text>
                      <SBox x={30} y={14} w={140} h={24} label={me} tone={C.warn} rot={-0.4} />
                      <text x={180} y={30} fill={C.muted} style={{ fontFamily: mono, fontSize: 7.5 }}>← what an import LOOKS like: one edge</text>
                      {Array.from({ length: mass }, (_, i) => { const r2 = Math.floor(i / 6), c2 = i % 6; return (
                        <g key={i} opacity={0.9 - r2 * 0.18}>
                          <path d={`M ${70 + ((i * 37) % 90)} 38 v ${20 + r2 * 26}`} stroke={C.dim} strokeWidth="0.8" opacity="0.5" />
                          <SBox x={36 + c2 * 44} y={56 + r2 * 26} w={38} h={16} label="" tone={C.dim} rot={i % 2 ? 0.6 : -0.6} />
                        </g>
                      ); })}
                      <text x={310} y={70} fill={C.warn} style={{ fontFamily: mono, fontSize: 7.5 }}>…what it REALLY drags:</text>
                      <text x={310} y={82} fill={C.warn} style={{ fontFamily: mono, fontSize: 7.5 }}>{g.transitive ?? "many"} files below the surface</text>
                      <text x={310} y={100} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>✂ cut or lazy-load the chains</text>
                    </svg>
                  );
                }
                // CHANGE → the COMMIT TIMELINE: every tick a change; the file shakes; dashed green = the test shield.
                if (ax === "change") {
                  const n = Math.max(1, Math.min(Number(g.churn ?? 0), 18));
                  if (fixed) {
                    // AFTER: same timeline, but the file sits INSIDE the test shield — ticks land safely
                    return (
                      <svg viewBox="0 0 520 94" style={{ width: "100%", maxWidth: 560, display: "block" }}>
                        <path d="M 12 62 H 344" stroke={C.dim} strokeWidth="1.1" fill="none" />
                        {Array.from({ length: n }, (_, i) => <path key={i} d={`M ${20 + i * 18} 62 v -${8 + ((i * 7) % 12)}`} stroke={C.ok} strokeWidth="1.2" strokeLinecap="round" fill="none" />)}
                        <text x={12} y={80} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>changes keep coming — now each one must pass the test first</text>
                        <rect x={356} y={22} width={150} height={52} rx={9} fill="none" stroke={C.ok} strokeWidth="1.3" transform="rotate(-0.4 431 48)" />
                        <text x={362} y={18} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>✓ the test shield</text>
                        <SBox x={368} y={36} w={126} h={26} label={me} tone={C.ok} rot={0.5} />
                      </svg>
                    );
                  }
                  return (
                    <svg viewBox="0 0 520 94" style={{ width: "100%", maxWidth: 560, display: "block" }}>
                      <path d="M 12 62 H 344" stroke={C.dim} strokeWidth="1.1" fill="none" />
                      {Array.from({ length: n }, (_, i) => <path key={i} d={`M ${20 + i * 18} 62 v -${8 + ((i * 7) % 12)}`} stroke={C.warn} strokeWidth="1.2" strokeLinecap="round" fill="none" />)}
                      <text x={12} y={80} fill={C.warn} style={{ fontFamily: mono, fontSize: 7.5 }}>×{g.churn ?? "?"} changes — every tick a commit touching this file</text>
                      <SBox x={368} y={38} w={126} h={26} label={me} tone={C.warn} rot={1} />
                      <path d="M 352 30 C 346 44, 346 58, 352 72" fill="none" stroke={C.ok} strokeWidth="1.3" strokeDasharray="5 4" strokeLinecap="round" />
                      <text x={368} y={22} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>+ a test shields the next change</text>
                    </svg>
                  );
                }
                // DEFECTS → BUG PINS: each bench finding pinned where it lives on the file.
                if (ax === "defects" && A.findings.length) {
                  const N3 = srcLines?.length ?? 100;
                  if (fixed) {
                    // AFTER: every pin turned ✓ — fixed AND pinned by a regression test
                    return (
                      <svg viewBox="0 0 520 126" style={{ width: "100%", maxWidth: 560, display: "block" }}>
                        <SBox x={28} y={8} w={30} h={108} label="" tone={C.ok} rot={-0.3} />
                        <text x={43} y={124} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 6.5 }}>L1→L{N3}</text>
                        {A.findings.slice(0, 5).map((f, i) => { const y = 16 + (((f.line ?? ((i + 1) * N3 / 6)) as number) / N3) * 92; return (
                          <g key={i}>
                            <circle cx={43} cy={y} r={6} fill="none" stroke={C.ok} strokeWidth="1.2" />
                            <text x={43} y={y + 2.5} textAnchor="middle" fill={C.ok} style={{ fontFamily: mono, fontSize: 7 }}>✓</text>
                          </g>
                        ); })}
                        <SBox x={340} y={40} w={158} h={26} label="+ regression tests" tone={C.ok} rot={-0.5} />
                        <SArrow x1={340} y1={53} x2={64} y2={53} tone={C.ok} />
                        <text x={130} y={118} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>✓ each fix is pinned — the same bug cannot come back silently</text>
                      </svg>
                    );
                  }
                  return (
                    <svg viewBox="0 0 520 126" style={{ width: "100%", maxWidth: 560, display: "block" }}>
                      <SBox x={28} y={8} w={30} h={108} label="" tone={C.dim} rot={-0.3} />
                      <text x={43} y={124} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 6.5 }}>L1→L{N3}</text>
                      {A.findings.slice(0, 5).map((f, i) => { const y = 16 + (((f.line ?? ((i + 1) * N3 / 6)) as number) / N3) * 92; const ty = 20 + i * 21; return (
                        <g key={i}>
                          <circle cx={43} cy={y} r={6} fill="none" stroke={C.bad} strokeWidth="1.2" />
                          <text x={43} y={y + 2.5} textAnchor="middle" fill={C.bad} style={{ fontFamily: mono, fontSize: 7 }}>✗</text>
                          <path d={`M 51 ${y} C 90 ${y}, 100 ${ty}, 126 ${ty}`} fill="none" stroke={C.dim} strokeWidth="1" />
                          <text x={130} y={ty + 2.5} fill={C.muted} style={{ fontFamily: mono, fontSize: 7.5 }}>{f.line != null ? `L${f.line} · ` : ""}{clip8(f.text, 46)}</text>
                        </g>
                      ); })}
                      <text x={130} y={118} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>✎ each pin is a bench finding — fix, then re-run the bench</text>
                    </svg>
                  );
                }
                if (ax === "tests" && (A.importers.length || testName)) {
                  const imps = A.importers.slice(0, 4).map(base);
                  const H = Math.max(96, imps.length * 30 + 36);
                  const mid = H / 2;
                  if (fixed) {
                    // AFTER: the test is REAL (solid), wired in FRONT — a break fails there first
                    return (
                      <svg viewBox={`0 0 520 ${H}`} style={{ width: "100%", maxWidth: 560, display: "block" }}>
                        {imps.map((nm, i) => (<g key={i}><SBox x={6} y={14 + i * 30} w={128} h={20} label={clip8(nm)} /><SArrow x1={136} y1={24 + i * 30} x2={196} y2={mid} tone={C.ok} /></g>))}
                        {!imps.length && <text x={10} y={mid + 3} fill={C.dim} style={{ fontFamily: mono, fontSize: 8 }}>({g.fan_in ?? 0} dependents)</text>}
                        <SBox x={198} y={mid - 13} w={150} h={26} label={me} tone={C.ok} rot={0.4} />
                        <text x={273} y={mid + 22} textAnchor="middle" fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>✓ covered — a break fails in the test first, not in the importers</text>
                        <g><SBox x={382} y={mid - 13} w={132} h={26} label={clip8(base(testName ?? "the test"), 16)} tone={C.ok} rot={-0.5} /><SArrow x1={382} y1={mid} x2={352} y2={mid} tone={C.ok} /></g>
                      </svg>
                    );
                  }
                  return (
                    <svg viewBox={`0 0 520 ${H}`} style={{ width: "100%", maxWidth: 560, display: "block" }}>
                      {imps.map((nm, i) => (<g key={i}><SBox x={6} y={14 + i * 30} w={128} h={20} label={clip8(nm)} /><SArrow x1={136} y1={24 + i * 30} x2={196} y2={mid} /></g>))}
                      {!imps.length && <text x={10} y={mid + 3} fill={C.dim} style={{ fontFamily: mono, fontSize: 8 }}>({g.fan_in ?? 0} dependents)</text>}
                      {A.importers.length > 4 && <text x={10} y={H - 4} fill={C.dim} style={{ fontFamily: mono, fontSize: 7.5 }}>+{A.importers.length - 4} more</text>}
                      <SBox x={198} y={mid - 13} w={150} h={26} label={me} tone={C.warn} rot={0.4} />
                      <text x={273} y={mid + 22} textAnchor="middle" fill={C.bad} style={{ fontFamily: mono, fontSize: 7.5 }}>uncovered — a break lands on every arrow</text>
                      {testName && (<g><SBox x={382} y={mid - 13} w={132} h={26} label={`+ ${clip8(base(testName), 16)}`} tone={C.ok} dashed rot={-0.5} /><SArrow x1={382} y1={mid} x2={352} y2={mid} tone={C.ok} dashed /></g>)}
                    </svg>
                  );
                }
                // COUPLING · in a CYCLE → ⌗cycle-ring: the arrows chase each other. Partners come
                // from the real graph (files that BOTH import and are imported by this one); longer
                // rings fall back to ghost partners — the shape is the message.
                if (ax === "coupling" && p2.cycle) {
                  const partners = A.importers.filter((pth) => A.imports.includes(pth)).slice(0, 2).map(base);
                  const names = [me, ...(partners.length ? partners : ["cycle partner", partners.length === 0 ? "…" : ""])].filter(Boolean).slice(0, 3).map((s2) => clip8(s2, 14));
                  const pos3 = [[210, 14], [70, 78], [350, 78]] as const;
                  if (fixed) {
                    return (
                      <svg viewBox="0 0 520 150" style={{ width: "100%", maxWidth: 560, display: "block" }}>
                        {names.map((nm, i) => <SBox key={i} x={pos3[i][0]} y={pos3[i][1]} w={110} h={22} label={nm} tone={C.ok} rot={i % 2 ? 0.5 : -0.5} />)}
                        <SBox x={198} y={112} w={134} h={22} label="the shared piece" tone={C.ok} rot={0.4} />
                        {names.map((_, i) => <SArrow key={`a${i}`} x1={pos3[i][0] + 55} y1={pos3[i][1] + 22} x2={264} y2={112} tone={C.ok} />)}
                        <text x={12} y={144} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>✓ the ring is cut — everyone points ONE way, at the extracted shared module</text>
                      </svg>
                    );
                  }
                  return (
                    <svg viewBox="0 0 520 150" style={{ width: "100%", maxWidth: 560, display: "block" }}>
                      {names.map((nm, i) => <SBox key={i} x={pos3[i][0]} y={pos3[i][1]} w={110} h={22} label={nm} tone={C.bad} rot={i % 2 ? 0.5 : -0.5} />)}
                      <SArrow x1={pos3[0][0] + 20} y1={pos3[0][1] + 22} x2={pos3[1][0] + 70} y2={pos3[1][1] - 2} tone={C.bad} />
                      <SArrow x1={pos3[1][0] + 110} y1={pos3[1][1] + 14} x2={pos3[2][0] - 2} y2={pos3[2][1] + 14} tone={C.bad} />
                      <SArrow x1={pos3[2][0] + 60} y1={pos3[2][1] - 2} x2={pos3[0][0] + 96} y2={pos3[0][1] + 22} tone={C.bad} />
                      <text x={12} y={128} fill={C.bad} style={{ fontFamily: mono, fontSize: 7.5 }}>the arrows chase each other — no clean build/test order; a change loops back into itself</text>
                      <text x={12} y={142} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>✂ extract what they SHARE into its own module — break the ring first, nothing else matters until then</text>
                    </svg>
                  );
                }
                // COUPLING · INBOUND-heavy → ⌗inbound-web: dependents point IN at the narrow
                // exported gate (the import-fan drew OUTBOUND arrows here — the wrong story).
                if (ax === "coupling" && (g.fan_in ?? 0) >= 3 && (g.fan_out ?? 0) <= 2 && A.importers.length) {
                  const imps = A.importers.slice(0, 4).map(base);
                  const H = Math.max(96, imps.length * 30 + 36);
                  const mid = H / 2;
                  if (fixed) {
                    return (
                      <svg viewBox={`0 0 520 ${H}`} style={{ width: "100%", maxWidth: 560, display: "block" }}>
                        {imps.map((nm, i) => (<g key={i}><SBox x={6} y={14 + i * 30} w={128} h={20} label={clip8(nm)} /><SArrow x1={136} y1={24 + i * 30} x2={224} y2={mid} tone={C.ok} /></g>))}
                        <rect x={226} y={mid - 8} width={10} height={16} rx={2} fill="none" stroke={C.ok} strokeWidth="1.2" />
                        <SBox x={240} y={mid - 13} w={150} h={26} label={me} tone={C.ok} rot={0.4} />
                        <text x={244} y={mid + 24} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>✓ a SMALL, stable gate — pinned by a test</text>
                        <SBox x={398} y={mid - 13} w={110} h={26} label="its test" tone={C.ok} rot={-0.5} />
                        <SArrow x1={398} y1={mid} x2={392} y2={mid} tone={C.ok} />
                      </svg>
                    );
                  }
                  return (
                    <svg viewBox={`0 0 520 ${H}`} style={{ width: "100%", maxWidth: 560, display: "block" }}>
                      {imps.map((nm, i) => (<g key={i}><SBox x={6} y={14 + i * 30} w={128} h={20} label={clip8(nm)} /><SArrow x1={136} y1={24 + i * 30} x2={224} y2={mid} tone={C.warn} /></g>))}
                      {A.importers.length > 4 && <text x={10} y={H - 4} fill={C.dim} style={{ fontFamily: mono, fontSize: 7.5 }}>+{A.importers.length - 4} more</text>}
                      <rect x={226} y={mid - 14} width={10} height={28} rx={2} fill="none" stroke={C.warn} strokeWidth="1.2" />
                      <text x={222} y={mid - 20} fill={C.warn} style={{ fontFamily: mono, fontSize: 7 }}>the gate: its exports</text>
                      <SBox x={240} y={mid - 13} w={150} h={26} label={me} tone={C.warn} rot={0.4} />
                      <text x={244} y={mid + 24} fill={C.bad} style={{ fontFamily: mono, fontSize: 7.5 }}>every gate change ripples into ALL {g.fan_in} arrows</text>
                      <text x={400} y={mid} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>→ keep the gate small,</text>
                      <text x={400} y={mid + 12} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>stable, test-pinned</text>
                    </svg>
                  );
                }
                if ((ax === "coupling" || ax === "structure") && importNames.length) {
                  const H = Math.max(96, importNames.length * 30 + 24);
                  const mid = H / 2;
                  if (fixed) {
                    // AFTER: many arrows collapsed into ONE — the facade owns the fan-out
                    const H2 = Math.max(96, importNames.length * 26 + 24);
                    const mid2 = H2 / 2;
                    return (
                      <svg viewBox={`0 0 520 ${H2}`} style={{ width: "100%", maxWidth: 560, display: "block" }}>
                        <SBox x={6} y={mid2 - 13} w={150} h={26} label={me} tone={C.ok} rot={0.4} />
                        <SArrow x1={158} y1={mid2} x2={236} y2={mid2} tone={C.ok} />
                        <SBox x={240} y={mid2 - 13} w={104} h={26} label="index (facade)" tone={C.ok} rot={-0.4} />
                        {importNames.slice(0, 5).map((nm, i) => (<g key={i}><SArrow x1={346} y1={mid2} x2={400} y2={16 + i * 26} tone={C.dim} /><SBox x={404} y={6 + i * 26} w={110} h={18} label={clip8(nm, 13)} /></g>))}
                        <text x={162} y={mid2 - 18} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>✓ {importNames.length} edges → 1</text>
                        <text x={240} y={H2 - 4} fill={C.dim} style={{ fontFamily: mono, fontSize: 7.5 }}>moves behind the facade stop touching {me}</text>
                      </svg>
                    );
                  }
                  return (
                    <svg viewBox={`0 0 520 ${H}`} style={{ width: "100%", maxWidth: 560, display: "block" }}>
                      <SBox x={6} y={mid - 13} w={150} h={26} label={me} tone={C.warn} rot={0.4} />
                      {importNames.map((nm, i) => (<g key={i}><SArrow x1={158} y1={mid} x2={348} y2={20 + i * 30} /><SBox x={352} y={10 + i * 30} w={130} h={20} label={clip8(nm)} /></g>))}
                      <g><rect x={344} y={4} width={146} height={importNames.length * 30 + 6} rx={8} fill="none" stroke={C.ok} strokeWidth={1.1} strokeDasharray="5 4" transform={`rotate(0.3 417 ${importNames.length * 15 + 7})`} /><text x={417} y={importNames.length * 30 + 20} textAnchor="middle" fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>→ group behind one facade / cut</text></g>
                    </svg>
                  );
                }
                if (ax === "cohesion" && (blocks ?? []).length >= 3) {
                  const bs = (blocks ?? []).slice(0, 5);
                  const pos = [[26, 32], [116, 58], [206, 28], [56, 92], [186, 96]];
                  if (fixed) {
                    // AFTER: the junk drawer becomes two SMALL modules — related blocks live together
                    const left = bs.slice(0, Math.ceil(bs.length / 2));
                    const right = bs.slice(Math.ceil(bs.length / 2));
                    return (
                      <svg viewBox="0 0 520 150" style={{ width: "100%", maxWidth: 560, display: "block" }}>
                        <SBox x={6} y={14} w={220} h={120} label="" tone={C.ok} rot={-0.2} />
                        <text x={14} y={26} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>{clip8(me, 14)} — one job</text>
                        {left.map((b: any, i: number) => <SBox key={i} x={22} y={38 + i * 26} w={120} h={18} label={clip8(b.name, 14)} tone={C.muted} rot={i % 2 ? 0.5 : -0.5} />)}
                        <SBox x={268} y={14} w={220} h={120} label="" tone={C.ok} rot={0.2} />
                        <text x={276} y={26} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>the split module — its own job</text>
                        {right.map((b: any, i: number) => <SBox key={i} x={284} y={38 + i * 26} w={120} h={18} label={clip8(b.name, 14)} tone={C.muted} rot={i % 2 ? -0.5 : 0.5} />)}
                        <text x={160} y={146} fill={C.ok} style={{ fontFamily: mono, fontSize: 7.5 }}>✓ blocks that reference each other now share a roof</text>
                      </svg>
                    );
                  }
                  return (
                    <svg viewBox="0 0 520 150" style={{ width: "100%", maxWidth: 560, display: "block" }}>
                      <SBox x={6} y={8} w={306} h={134} label="" rot={-0.2} />
                      <text x={14} y={20} fill={C.dim} style={{ fontFamily: mono, fontSize: 7.5 }}>{me}</text>
                      {bs.map((b: any, i: number) => <SBox key={i} x={pos[i][0]} y={pos[i][1]} w={84} h={18} label={clip8(b.name, 12)} tone={C.muted} rot={i % 2 ? 0.6 : -0.6} />)}
                      <path d="M 166 14 C 160 50, 172 100, 164 138" fill="none" stroke={C.ok} strokeWidth={1.2} strokeDasharray="5 4" />
                      <text x={340} y={60} fill={C.ok} style={{ fontFamily: mono, fontSize: 8 }}>✂ split into modules whose</text>
                      <text x={340} y={72} fill={C.ok} style={{ fontFamily: mono, fontSize: 8 }}>parts actually reference</text>
                      <text x={340} y={84} fill={C.ok} style={{ fontFamily: mono, fontSize: 8 }}>each other</text>
                    </svg>
                  );
                }
                return null;
              };
              // each drawing's NAME (operator 2026-07-23: "I want to identify WHICH draw it was") —
              // stable ids for the widget list, mirroring AxisSketch's branch order exactly.
              const sketchName = (ax: string, a: any) => {
                const p2 = a?.parts ?? {};
                if (ax === "structure" && p2.basis === "cognitive" && (p2.worst_cognitive ?? 0) > 8 && (blocks ?? []).length) return "exploded-function";
                if (ax === "structure" && (p2.max_nesting ?? 0) > 4) return "staircase";
                if (ax === "structure" && ((g.transitive ?? 0) >= 5 || (p2.pct_transitive ?? 0) >= 0.5)) return "iceberg";
                if (ax === "change") return "commit-ticks";
                if (ax === "defects") return "bug-pins";
                if (ax === "tests") return "dependents-web";
                if (ax === "coupling" && p2.cycle) return "cycle-ring";
                if (ax === "coupling" && (g.fan_in ?? 0) >= 3 && (g.fan_out ?? 0) <= 2 && A.importers.length) return "inbound-web";
                if (ax === "coupling" || ax === "structure") return "import-fan";
                if (ax === "cohesion") return "junk-drawer";
                return ax;
              };
              // BEFORE / AFTER as drawings (operator 2026-07-23: "the widget itself… the draw
              // before changes, and the draw after" + "don't be side by side, one below another") —
              // stacked, so the side column stays free for the comment + the diff sample.
              const SketchPair = ({ ax, a }: { ax: string; a: any }) => {
                const before = AxisSketch({ ax, a });
                if (!before) return null;
                const after = AxisSketch({ ax, a, fixed: true });
                const nm = sketchName(ax, a);
                const lbl: React.CSSProperties = { fontFamily: mono, fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2, display: "flex", gap: 6, alignItems: "baseline" };
                if (!after) return before;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                    <div style={{ minWidth: 0 }}><div style={{ ...lbl, color: C.warn }}>before — as it is<span style={{ flex: 1 }} /><WTag n={nm} /></div>{before}</div>
                    <div style={{ minWidth: 0 }}><div style={{ ...lbl, color: C.ok }}>after the fix<span style={{ flex: 1 }} /><WTag n={nm} /></div>{after}</div>
                  </div>
                );
              };
              // THE CLIMB — the fix plan as a staircase: do the steps, watch health rise.
              const Climb = () => {
                if (!plan.length) return null;
                let acc = health;
                const bars = [{ v: health, label: `${health}`, sub: "now" }, ...plan.map((p, i) => { acc = Math.min(100, acc + p.gain); return { v: acc, label: `+${p.gain}`, sub: `${i + 1}` }; })];
                const W = 320, H = 66, bw = W / bars.length;
                return (
                  <div>
                    <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>the climb — the fix plan's steps, in order (≈)</div>
                    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 360, display: "block" }}>
                      {bars.map((b, i) => { const h = (b.v / 100) * (H - 18); return (
                        <g key={i}>
                          <rect x={i * bw + 4} y={H - 12 - h} width={bw - 8} height={h} rx={2} fill={i === 0 ? `color-mix(in oklab, ${conTone(health)} 55%, transparent)` : `color-mix(in oklab, ${C.ok} ${Math.min(80, 35 + i * 12)}%, transparent)`} />
                          <text x={i * bw + bw / 2} y={H - 15 - h} textAnchor="middle" fill={i === 0 ? conTone(health) : C.ok} style={{ fontFamily: mono, fontSize: 7 }}>{b.label}</text>
                          <text x={i * bw + bw / 2} y={H - 3} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 6 }}>{b.sub}</text>
                        </g>
                      ); })}
                    </svg>
                  </div>
                );
              };

  // ➕ VIBE — a plan item becomes a context-studio MD in a vibe session (blackboard kind 'context').
  const [vibe, setVibe] = React.useState<any | null>(null);
  const vibeMd = (item: any) => item.md ?? [
    `### Constitution fix — ${item.label}`,
    `_from the constitution analysis · file review of \`${con.path}\` · ≈ +${item.gain} health_`,
    ``,
    `**What to do:** ${item.detail || item.label}`,
    item.targets?.length ? `\n**Exactly where:**\n${item.targets.slice(0, 10).map((t: Target) => `- ${t.file ? `\`${t.file}\`` : t.line != null ? `\`${con.path}:${t.line}\`` : "—"} — ${[t.code ? `\`${t.code}\`` : "", t.note ?? ""].filter(Boolean).join(" → ")}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
  const openVibe = async (item: any) => {
    setVibe({ itemId: item.id, loading: true });
    try { const r: any = await apiPost("/api/v1/cockpit/overview", {}); const d = r?.result ?? r; setVibe({ itemId: item.id, loading: false, sessions: (d?.sessions ?? []).slice(0, 6) }); }
    catch { setVibe({ itemId: item.id, loading: false, sessions: [] }); }
  };
  const postVibe = async (item: any, sessionId: number, sessionName: string) => {
    setVibe((v: any) => ({ ...v, posting: true, err: null }));
    try {
      await apiPost(`/api/v1/dispatch`, { action_name: "system.cockpit.blackboard.post", input: { session_id: sessionId, kind: item.kind ?? "context", body_md: vibeMd(item) } });
      setVibe((v: any) => ({ ...v, posting: false, done: sessionName }));
    } catch (e: any) { setVibe((v: any) => ({ ...v, posting: false, err: String(e?.message ?? "failed").slice(0, 120) })); }
  };
  // ➕ VIBE ALL — the WHOLE plan as ONE blackboard item of kind 'plan': a single,
  // simplified ultra-plan pane in the session (operator 2026-07-18).
  const planAllMd = () => [
    `## Constitution fix plan — \`${con.path}\``,
    `_health ${health} → ≈ ${Math.min(100, health + plan.reduce((a2, p2) => a2 + p2.gain, 0))} · ${plan.length} step${plan.length === 1 ? "" : "s"} · from the constitution file review_`,
    ...plan.map((p2, i) => [
      `### ${i + 1}. ${p2.label} · ≈ +${p2.gain} health`,
      p2.detail || "",
      p2.targets?.length ? `**Exactly where:**\n${p2.targets.slice(0, 8).map((t: Target) => `- ${t.file ? `\`${t.file}\`` : t.line != null ? `\`${con.path}:${t.line}\`` : "—"}${t.code ? ` — \`${t.code}\`` : ""}${t.note ? ` → ${t.note}` : ""}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n")),
  ].join("\n\n");
  const vibeAllItem = () => ({ id: "plan:all", label: `the full fix plan (${plan.length} steps)`, kind: "plan", md: planAllMd() });
  // the session picker — one component, used per step AND for vibe-all (buttons only, safe inline).
  const VibePicker = ({ item }: { item: any }) => !vibe || vibe.itemId !== item.id ? null : (
    <div style={{ marginTop: 4, border: `1px solid color-mix(in oklab, ${C.brand} 35%, ${C.border})`, borderRadius: 5, padding: "5px 8px", background: C.bg, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
      {vibe.done ? <span style={{ fontFamily: mono, fontSize: 8.5, color: C.ok }}>◆ added to “{vibe.done}” — open its {item.kind === "plan" ? "plan pane" : "context studio"}</span>
        : vibe.loading ? <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>loading sessions…</span>
        : vibe.err ? <span style={{ fontFamily: mono, fontSize: 8.5, color: C.bad }}>{vibe.err}</span>
        : (vibe.sessions ?? []).length ? (<>
          <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>into:</span>
          {vibe.sessions.map((s: any) => (
            <button key={s.id} disabled={vibe.posting} onClick={() => void postVibe(item, s.id, s.name)}
              style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 4, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: 8.5 }}>{vibe.posting ? "…" : s.name}</button>
          ))}
        </>) : <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>no vibe session yet — start one in the cockpit, then add this fix</span>}
      <span style={{ flex: 1 }} />
      <button onClick={() => setVibe(null)} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9 }}>✕</button>
    </div>
  );

  const sec: React.CSSProperties = { fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" };
  const Mini = ({ ax }: { ax: string }) => { const a = con.axes?.[ax] as any; return (
    <div title={a?.parts ? `${ax}: ${partsStr(a.parts)}` : `${ax}: no signal`} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: mono, fontSize: 8, padding: "1px 0" }}>
      <span style={{ width: 58, color: C.dim }}>{ax}</span>
      <div style={{ flex: 1, height: 4, background: `color-mix(in oklab, ${C.border} 45%, transparent)`, borderRadius: 2, overflow: "hidden" }}>{a && <div style={{ width: `${a.score}%`, height: "100%", background: conTone(a.score) }} />}</div>
      <b style={{ width: 18, textAlign: "right", color: a ? conTone(a.score) : C.dim, fontVariantNumeric: "tabular-nums" }}>{a?.score ?? "—"}</b>
    </div>
  ); };
  const SRow = ({ k, v }: { k: string; v: any }) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 8, padding: "1px 0" }}>
      <span style={{ color: C.dim }}>{k}</span><span style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );

  // BEYOND THE LINES is its own tab now (operator 2026-07-23: "beyond the lines a new tab, take out
  // from the review tab"): the weak-axis structural review, drawn — before/after sketches + the fix
  // as one article. The review tab is the pure whole-file diff; this is the structural half.
  const beyondEl = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "2px 0" }}>
      <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>beyond the lines — the structural review, drawn</div>
      {weak.length === 0 && <div style={{ fontFamily: mono, fontSize: 10, color: C.ok, fontStyle: "italic" }}>✓ every measured axis is healthy — nothing structural to draw.</div>}
      {weak.map(({ ax, a }) => {
        const ap = axisPlan(ax, a);
        if (ap.merged) return null; // folded into the tests finding
        const pd = a?.parts ?? {};
        // no targets = the plan found nothing an edit recovers (healthy wiring ranked low, a
        // percentile artifact) — that is a context note, and drawing "the problem" for it
        // contradicts the note's own words
        const nothingToDo = !ap.targets.length;
        const drawable = !nothingToDo && ((ax === "tests" && (A.importers.length || testName))
          || (ax === "structure" && ((pd.basis === "cognitive" && ((pd.worst_cognitive ?? 0) > 8 || (pd.max_nesting ?? 0) > 4)) || (g.transitive ?? 0) >= 5 || importNames.length))
          || (ax === "coupling" && (importNames.length || A.importers.length || pd.cycle)) // inbound-web + cycle-ring draw without imports
          || (ax === "cohesion" && (blocks ?? []).length >= 3)
          || ax === "change"
          || (ax === "defects" && A.findings.length > 0));
        return (
          <div key={ax}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ fontFamily: mono, fontSize: 7.5, color: nothingToDo ? C.dim : C.warn, border: `1px solid ${nothingToDo ? C.border : C.warn}`, borderRadius: 8, padding: "0 5px" }}>📊 {ax} {a.score}</span>
              <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{nothingToDo ? "ranked, not broken — nothing to change" : drawable ? "the problem, drawn — dashed green is the fix" : "file-level note"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: drawable ? (ap.example ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr) 270px") : "1fr", columnGap: 18, alignItems: "start" }}>
              {drawable && <div style={{ minWidth: 0 }}>{ap.example ? <SketchPair ax={ax} a={a} /> : (<>
                <AxisSketch ax={ax} a={a} />
                <div style={{ display: "flex" }}><span style={{ flex: 1 }} /><WTag n={sketchName(ax, a)} /></div>
              </>)}</div>}
              <div style={{ position: "relative", marginTop: drawable ? 6 : 3, minWidth: 0 }}>
                {drawable && !ap.example && (
                  <svg style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", pointerEvents: "none" }}>
                    <SArrow x1={8} y1={16} x2={-26} y2={26} tone={C.dim} />
                  </svg>
                )}
                {ap.example ? (
                  <ExampleCols ex={ap.example} text={ap.detail} />
                ) : (
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, background: C.panel2, padding: "6px 10px", transform: "rotate(-0.35deg)" }}>
                    <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, lineHeight: 1.55 }}>✎ {ap.detail}<WTag n="axis-note" /></div>
                    {!drawable && ap.targets.filter((t) => t.file).slice(0, 3).map((t, j) => (
                      <div key={j} style={{ display: "flex", gap: 5, alignItems: "baseline", fontFamily: mono, fontSize: 8, marginTop: 2 }}>
                        <span style={{ color: C.brand }}>{t.file!.split("/").pop()}</span>
                        <span style={{ color: C.dim }}>{t.note ?? ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const showAside = (view === "data" || view === "review" || isFolder) && view !== "canvas"; // the manifest rides beside the merged code review
  return (
        <div style={{ display: "grid", gridTemplateColumns: showAside ? "1fr 212px" : "1fr" }}>
          {/* ── THE REVIEW — 👁 human (annotated diff) or ⚙ data (dense) ── */}
          <div style={{ padding: "13px 16px", borderRight: `1px solid ${C.border}`, minWidth: 0, display: "flex", flexDirection: "column", gap: 13 }}>
            {!isFolder && (
              /* DISCRETE tabs — plain text, the active one carries the brand + a thin underline */
              <div style={{ display: "flex", gap: 16, borderBottom: `1px solid color-mix(in oklab, ${C.border} 60%, transparent)` }}>
                {([["review", "👁 code review"]] as const).map(([v, label]) => (
                  <button key={v} onClick={() => setView(v)}
                    style={{ background: "transparent", border: "none", borderBottom: `1px solid ${view === v ? C.brand : "transparent"}`, marginBottom: -1, color: view === v ? C.brand : C.dim, padding: "2px 1px 4px", cursor: "pointer", fontFamily: mono, fontSize: 9.5, transition: "color .12s ease" }}>{label}</button>
                ))}
                {/* the old "✎ plan" tab is now a small secondary link — COPY FEEDBACK is the primary button (operator 2026-09-29) */}
                <button data-testid="review-plan-link" onClick={() => setView("plan")} title="open the ranked fix plan"
                  style={{ background: "transparent", border: "none", borderBottom: `1px solid ${view === "plan" ? C.brand : "transparent"}`, marginBottom: -1, color: view === "plan" ? C.brand : C.dim, padding: "2px 1px 4px", cursor: "pointer", fontFamily: mono, fontSize: 8.5, opacity: view === "plan" ? 1 : 0.8 }}>plan</button>
                <span style={{ flex: 1 }} />
                <button data-testid="copy-feedback" onClick={() => void doCopy("fb")} disabled={!lawGroups.length && !planAll.length}
                  title="copy only the feedback needed to fix these issues — file, line and what to change — to paste into an agent"
                  style={{ alignSelf: "center", marginBottom: 3, background: "transparent", border: `1px solid ${copied === "fb" ? C.ok : `color-mix(in oklab, ${C.brand} 45%, ${C.border})`}`, color: copied === "fb" ? C.ok : C.brand, borderRadius: 4, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>{copied === "fb" ? "copied ✓" : "copy feedback"}</button>
                <span style={{ alignSelf: "center", paddingBottom: 3 }}><ExportButtons getNode={() => reviewBodyRef.current} title={`${con.path?.split("/").pop() ?? "file"} · ${view} review`} /></span>
              </div>
            )}
            <div ref={reviewBodyRef} style={{ display: "flex", flexDirection: "column", gap: 13, minWidth: 0 }}>
            {view === "review" && !isFolder && srcLines ? (() => {
              // ── THE HUMAN VIEW — a senior's code review: GitHub-style hunks around each
              // commented line (law violations AND weak-axis targets), comment cards
              // beneath, sketch arrows; structural problems get DRAWN (excalidraw-style).
              type RevComment = { kind: "law"; v: FileConViolation } | { kind: "axis"; ax: string; score: number; text: string };
              const commentsByLine = new Map<number, RevComment[]>();
              const addC = (ln: number, c: RevComment) => { if (!commentsByLine.has(ln)) commentsByLine.set(ln, []); commentsByLine.get(ln)!.push(c); };
              for (const v of con.violations ?? []) if (v.line != null) addC(v.line, { kind: "law", v });
              // plain one-liners so a margin comment stands ALONE (operator 2026-07-23: "still not
              // enough to understand"): what the axis measures + what the score rank means + the move.
              const AXIS_MEANING: Record<string, { what: string; move: string }> = {
                structure: { what: "how readable the code's shape is — branching, nesting, block size", move: "extract dense branches into named functions; return early to flatten" },
                coupling: { what: "how tangled this file is with others — what it imports, who imports it", move: "fold same-folder imports behind one index; keep the exported surface small" },
                tests: { what: "whether anything catches a break here before it spreads to the importers", move: "add one test around the main export" },
                change: { what: "how often this file changes — churn is where the next bug lands", move: "pin current behavior with a test before the next change" },
                cohesion: { what: "whether this file's parts work together, or it's a junk drawer", move: "move the island blocks next to their real users" },
                defects: { what: "open bench findings recorded against this file", move: "fix each finding, then pin it with a regression test" },
                compliance: { what: "the house laws this file breaks", move: "fix the flagged lines" },
              };
              for (const { ax, a } of weak) { // in-THIS-file axis targets become line comments too
                const ap = axisPlan(ax, a);
                for (const t of ap.targets.filter((t) => t.line != null && !t.file).slice(0, 3)) {
                  const note = t.note ?? "";
                  // a "this is fine, keep it" target must NOT become a margin comment on a red axis —
                  // that contradiction ("coupling 1 … cheap edge, keep it") read as nonsense.
                  if (/keep it|fine to keep|nothing to do here/i.test(note)) continue;
                  const M = AXIS_MEANING[ax];
                  addC(t.line!, { kind: "axis", ax, score: a.score, text:
                    `${ax} = ${M?.what ?? "a repo-relative rank"}. ${a.score}/100 means it ranks among the worst in THIS repo.\n` +
                    `This line: ${note || "one of the anchors behind that rank"}.\n` +
                    `The move: ${M?.move ?? "see the full analysis"} — details in “beyond the lines” below.` });
                }
              }
              const cLns = [...commentsByLine.keys()].sort((a, b) => a - b);
              const hunks: { lo: number; hi: number }[] = [];
              for (const ln of cLns) { const lo = Math.max(1, ln - 2), hi = Math.min(srcLines.length, ln + 2); const last = hunks[hunks.length - 1]; if (last && lo <= last.hi + 3) last.hi = Math.max(last.hi, hi); else hunks.push({ lo, hi }); }
              // (the glance row — gauge/radar/heat/concerns — was CUT, operator 2026-07-18:
              // it restated the manifest's numbers as decoration. The senior card opens the review.)
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* the senior's summary comment */}
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel2, padding: "9px 12px", transform: "rotate(-0.25deg)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: mono, fontSize: 8, color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 8, padding: "0 6px" }}>§ senior review</span>
                      <b style={{ fontFamily: mono, fontSize: 11, color: conTone(health), fontVariantNumeric: "tabular-nums" }}>{health}</b>
                      <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>{(con.violations ?? []).length} comment{(con.violations ?? []).length === 1 ? "" : "s"} on the code · {concerns.length} file-level note{concerns.length === 1 ? "" : "s"}{weak.length > concerns.length ? ` · ${weak.length - concerns.length} axis ranked low but not broken` : ""}</span>
                      {con.regression?.regressed && <span style={{ fontFamily: mono, fontSize: 8, color: C.bad }}>↓ worse than the last review</span>}
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
                      {codeScore != null && contextScore != null && codeScore >= 75 && codeScore - contextScore >= 12
                        ? <>The code itself reads fine — my concerns are around it: </>
                        : codeScore != null && codeScore < 75 && (lawGroups.length || lowCode.length)
                          ? <>The code itself needs work ({codeScore}){lowCode.length ? <> — {lowCode.map((d) => `${d.ax} ${d.s}`).join(", ")}</> : null}. </>
                        : lawGroups.length ? <>A few things to fix in the code itself. Beyond the line comments: </> : <>Nothing to flag on the lines. </>}
                      {concerns.slice(0, 3).map(({ ax, a }, i) => { const t0 = axisPlan(ax, a).targets[0]; return <span key={ax}>{i ? " · " : ""}<b style={{ color: conTone(a.score) }}>{ax} {a.score}</b>{t0 ? <> — {t0.file ? t0.file.split("/").pop() : t0.line != null ? `L${t0.line}` : ""} <span style={{ color: C.dim }}>{(t0.note ?? t0.code ?? "").slice(0, 60)}</span></> : null}</span>; })}
                    </div>
                  </div>
                  {/* THE WHOLE FILE, uncommented regions COLLAPSED (operator 2026-07-23: "collapse
                      all the areas not commented, so the comments will be close to each one"): a few
                      lines of context wrap each comment cluster; the gaps between fold to a "⋯ N lines"
                      divider you can expand (or reveal the entire file). Each cluster keeps the diff +
                      margin-card + arrows anatomy, so comments sit right next to their code. */}
                  {(() => {
                    const rowH = 17, headH = 20, MW = 270, CTX = 3;
                    // the "+" line: the REAL line rewritten when the law's fix is mechanical (`==` → `===`),
                    // the law's generic example only when it is a judgement call
                    const plusOf = (ln: number): string[] => ((commentsByLine.get(ln) ?? []).filter((c) => c.kind === "law").map((c: any) => rewriteLine(String(c.v?.law_key ?? ""), srcLines[ln - 1] ?? "") ?? c.v?.example?.good ?? (c.v?.fix ? `// fix: ${c.v.fix}` : null)).filter(Boolean).slice(0, 1)) as string[];
                    // hunks = context windows around every commented line, merged when they touch
                    const hunks: { lo: number; hi: number }[] = [];
                    for (const ln of cLns) { const lo = Math.max(1, ln - CTX), hi = Math.min(srcLines.length, ln + CTX); const last = hunks[hunks.length - 1]; if (last && lo <= last.hi + CTX) last.hi = Math.max(last.hi, hi); else hunks.push({ lo, hi }); }
                    // full-file coverage: gap · hunk · gap · … · gap (so expanding every gap = the whole file)
                    type Seg = { t: "hunk" | "gap"; lo: number; hi: number };
                    const segs: Seg[] = []; let cursor = 1;
                    for (const h of hunks) { if (h.lo > cursor) segs.push({ t: "gap", lo: cursor, hi: h.lo - 1 }); segs.push({ t: "hunk", lo: h.lo, hi: h.hi }); cursor = h.hi + 1; }
                    if (cursor <= srcLines.length) segs.push({ t: "gap", lo: cursor, hi: srcLines.length });
                    const CodeRow = ({ ln, commented }: { ln: number; commented?: boolean }) => {
                      const cs = commented ? commentsByLine.get(ln) : undefined;
                      const tint = cs?.some((c) => c.kind === "law") ? C.bad : C.warn;
                      const plus = commented ? plusOf(ln) : [];
                      return (
                        <React.Fragment>
                          <div style={{ display: "flex", height: rowH, background: cs ? `color-mix(in oklab, ${tint} 10%, transparent)` : "transparent" }}>
                            <span style={{ width: 44, flexShrink: 0, textAlign: "right", paddingRight: 8, fontFamily: mono, fontSize: 8.5, color: cs ? tint : C.dim, borderRight: `1px solid ${C.border}`, userSelect: "none", lineHeight: `${rowH}px` }}>{cs ? "− " : ""}{ln}</span>
                            <code style={{ fontFamily: mono, fontSize: 9.5, whiteSpace: "pre", overflow: "hidden", padding: "0 10px", flex: 1, minWidth: 0, lineHeight: `${rowH}px`, opacity: cs ? 1 : 0.62 }}><TokLine text={srcLines[ln - 1] ?? ""} /></code>
                          </div>
                          {plus.map((gtext, gi) => (
                            <div key={`p${gi}`} style={{ display: "flex", minHeight: rowH, background: `color-mix(in oklab, ${C.ok} 9%, transparent)` }}>
                              <span style={{ width: 44, flexShrink: 0, textAlign: "right", paddingRight: 8, fontFamily: mono, fontSize: 8.5, color: C.ok, borderRight: `1px solid ${C.border}`, userSelect: "none", lineHeight: `${rowH}px` }}>+</span>
                              <code style={{ fontFamily: mono, fontSize: 9.5, color: C.ok, whiteSpace: "pre", overflow: "hidden", padding: "0 10px", flex: 1, minWidth: 0, lineHeight: `${rowH}px` }} title="the pattern this line should follow"><TokLine text={gtext} /></code>
                            </div>
                          ))}
                        </React.Fragment>
                      );
                    };
                    return (
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 8, color: C.dim, background: C.panel2, padding: "0 10px", borderBottom: `1px solid ${C.border}`, height: headH - 1, lineHeight: `${headH - 1}px` }}>
                          <span>@@ {con.path?.split("/").pop()} · {srcLines.length} lines · {cLns.length} flagged</span>
                          <span style={{ flex: 1 }} />
                          {segs.some((s) => s.t === "gap") && <button onClick={() => setRevealAll((v) => !v)} title={revealAll ? "collapse the uncommented regions again" : "reveal every line of the file"}
                            style={{ background: "transparent", border: `1px solid ${C.border}`, color: revealAll ? C.brand : C.muted, borderRadius: 4, padding: "0 6px", cursor: "pointer", fontFamily: mono, fontSize: 7.5 }}>{revealAll ? "▲ collapse gaps" : "▼ whole file"}</button>}
                        </div>
                        {!cLns.length && <div style={{ fontFamily: mono, fontSize: 10, color: C.ok, fontStyle: "italic", padding: "10px 12px" }}>✓ no line comments — the code obeys the constitution. See 📊 beyond the lines for the structural review.</div>}
                        {segs.map((s, si) => {
                          if (s.t === "gap") {
                            const key = `${s.lo}-${s.hi}`; const open = revealAll || openGap[key]; const n = s.hi - s.lo + 1;
                            return (
                              <div key={si}>
                                <div onClick={() => setOpenGap((m) => ({ ...m, [key]: !open }))} title={open ? "collapse" : "reveal these lines"}
                                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", background: C.bg, borderTop: si ? `1px solid color-mix(in oklab, ${C.border} 50%, transparent)` : "none", borderBottom: `1px solid color-mix(in oklab, ${C.border} 50%, transparent)`, padding: "1px 10px" }}>
                                  <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{open ? "▲" : "⋯"}</span>
                                  <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{open ? `L${s.lo}–${s.hi}` : `${n} unchanged line${n === 1 ? "" : "s"} hidden`}</span>
                                  <span style={{ fontFamily: mono, fontSize: 7.5, color: C.muted }}>{open ? "collapse" : "show"}</span>
                                </div>
                                {open && Array.from({ length: n }, (_, k) => s.lo + k).map((ln) => <CodeRow key={ln} ln={ln} />)}
                              </div>
                            );
                          }
                          // a HUNK — the code + a margin of comment cards with arrows back to the lines
                          const groups: { key: string; kind: "law" | "axis"; v?: FileConViolation; ax?: string; score?: number; text?: string; lines: number[]; y?: number }[] = [];
                          for (let ln = s.lo; ln <= s.hi; ln += 1) for (const c of commentsByLine.get(ln) ?? []) {
                            const key = c.kind === "law" ? `law:${(c as any).v.law_key}` : `ax:${(c as any).ax}`;
                            let grp = groups.find((x) => x.key === key);
                            if (!grp) { grp = c.kind === "law" ? { key, kind: "law", v: (c as any).v, lines: [] } : { key, kind: "axis", ax: (c as any).ax, score: (c as any).score, text: (c as any).text, lines: [] }; groups.push(grp); }
                            if (!grp.lines.includes(ln)) grp.lines.push(ln);
                          }
                          // local y of each line within this hunk (accounting for + rows)
                          const yTop = new Map<number, number>(); let yy = 0;
                          for (let ln = s.lo; ln <= s.hi; ln++) { yTop.set(ln, yy); yy += rowH * (1 + plusOf(ln).length); }
                          let lastBottom = 0;
                          const placed = groups.map((grp) => { const est = grp.kind === "law" ? 74 + (grp.v?.example ? 30 : 0) : 84; const y = Math.max((yTop.get(grp.lines[0]) ?? 0), lastBottom + (lastBottom ? 10 : 0)); lastBottom = y + est; return { ...grp, y }; });
                          const sprHere = spr && !spr.full && typeof spr.line === "number" && spr.line >= s.lo && spr.line <= s.hi;
                          return (
                            <div key={si} style={{ display: "grid", gridTemplateColumns: `minmax(0, 1fr) ${MW}px`, columnGap: 22, padding: "2px 0" }}>
                              <div style={{ minWidth: 0 }}>
                                {Array.from({ length: s.hi - s.lo + 1 }, (_, k) => s.lo + k).map((ln) => <CodeRow key={ln} ln={ln} commented />)}
                                {sprHere && SprPanel()}
                              </div>
                              <div style={{ position: "relative", minHeight: Math.max(yy, lastBottom) }}>
                                {placed.map((grp, gi) => {
                                  const tone = grp.kind === "law" ? (SEV_TONE[grp.v!.severity] ?? C.warn) : C.warn;
                                  const cid = `${s.lo}:${grp.key}`; const off = cardPos[cid] ?? { dx: 0, dy: 0 };
                                  const moved = off.dx !== 0 || off.dy !== 0;
                                  return (
                                    <div key={grp.key} style={{ position: "absolute", top: grp.y, left: 0, right: 0 }}>
                                      {/* arrow origin follows the dragged card; the tip stays anchored to the code line */}
                                      <svg style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", pointerEvents: "none" }}>
                                        {grp.lines.map((ln) => <SArrow key={ln} x1={8 + off.dx} y1={14 + off.dy} x2={-26} y2={(yTop.get(ln) ?? 0) + rowH / 2 - (grp.y ?? 0)} tone={moved ? C.brand : C.dim} />)}
                                      </svg>
                                      <div onMouseDown={(e) => startCardDrag(cid, e)} title="drag to reposition — the arrow keeps pointing at its line"
                                        style={{ position: "relative", border: `1px solid ${moved ? `color-mix(in oklab, ${C.brand} 45%, ${C.border})` : C.border}`, borderRadius: 9, background: C.panel2, padding: "6px 10px", cursor: "grab", transform: `translate(${off.dx}px, ${off.dy}px) rotate(${gi % 2 ? 0.4 : -0.4}deg)`, boxShadow: moved ? "0 3px 12px oklch(0 0 0 / 0.4)" : "none" }}>
                                        <span style={{ position: "absolute", top: 1, right: 4, fontFamily: mono, fontSize: 7, color: C.dim, opacity: 0.6, userSelect: "none", pointerEvents: "none" }}>⠿</span>
                                        {grp.kind === "law" ? (<>
                                          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                                            <span style={{ fontFamily: mono, fontSize: 7, color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 8, padding: "0 4px" }}>§</span>
                                            <b style={{ fontFamily: mono, fontSize: 9.5, color: C.fg }}>{grp.v!.title ?? grp.v!.law_key}</b>
                                            <span style={{ fontFamily: mono, fontSize: 7, color: tone }}>{grp.v!.severity}{grp.lines.length > 1 ? ` ×${grp.lines.length}` : ""}</span>
                                            <span style={{ flex: 1 }} />
                                            <button onClick={() => void startShortPr({ key: grp.v!.law_key, title: grp.v!.title ?? grp.v!.law_key, fix: grp.v!.fix }, grp.lines[0])} disabled={!!spr?.loading} title={`⚡ short PR — fixes L${grp.lines[0]} (AI proposes → worktree → you merge)`}
                                              style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 45%, ${C.border})`, color: C.brand, borderRadius: 4, padding: "0 5px", cursor: "pointer", fontFamily: mono, fontSize: 7.5 }}>⚡</button>
                                          </div>
                                          <div style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, marginTop: 1 }}>{grp.lines.map((l) => `L${l}`).join(" · ")}</div>
                                          <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>{grp.v!.rule_md}{grp.v!.fix ? <> — <span style={{ color: C.ok }}>{grp.v!.fix}</span></> : null}</div>
                                        </>) : (<>
                                          <span style={{ fontFamily: mono, fontSize: 7.5, color: C.warn, border: `1px solid ${C.warn}`, borderRadius: 8, padding: "0 5px" }}>📊 {grp.ax} {grp.score}/100</span>
                                          <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, lineHeight: 1.55, marginTop: 3, whiteSpace: "pre-line" }}>{grp.text}</div>
                                        </>)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                </div>
              );
            })() : view === "history" && !isFolder ? <FileReviewHistoryTab path={con.path ?? ""} /> : view === "beyond" && !isFolder ? beyondEl : view === "plan" && !isFolder ? (
              /* ── ✎ THE PLAN TAB — the fix plan as its own surface: the climb, then every step (widgets + excalidraw comments) ── */
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Climb />
            {plan.length > 0 ? (
              <div>
                <div style={{ ...sec, display: "flex", alignItems: "baseline", gap: 8 }}><span>✎ the fix plan · ranked by impact</span>
                  <button data-testid="copy-plan" onClick={() => void doCopy("plan")} title="copy the whole plan (every step with where + what) as markdown"
                    style={{ textTransform: "none", letterSpacing: 0, background: "transparent", border: `1px solid ${copied === "plan" ? C.ok : `color-mix(in oklab, ${C.brand} 40%, ${C.border})`}`, color: copied === "plan" ? C.ok : C.brand, borderRadius: 4, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: 8 }}>{copied === "plan" ? "copied ✓" : "copy plan"}</button>
                  {planAll.length > 5 && (
                    <button onClick={() => setShowAllPlan((v) => !v)} title="the plan shows the top moves by impact; the rest are lower-impact but still real"
                      style={{ textTransform: "none", letterSpacing: 0, background: "transparent", border: `1px solid ${C.border}`, color: showAllPlan ? C.brand : C.muted, borderRadius: 4, padding: "0 6px", cursor: "pointer", fontFamily: mono, fontSize: 8 }}>
                      {showAllPlan ? `▴ top 5 of ${planAll.length}` : `▾ show all ${planAll.length}`}</button>
                  )}
                  <span style={{ flex: 1 }} />
                  <span style={{ textTransform: "none", letterSpacing: 0, fontSize: 8.5, color: C.ok, fontVariantNumeric: "tabular-nums" }} title="a deterministic projection — current health + what each step can honestly recover (tests is binary; structure keeps its god-file and transitive parts; coupling only moves with a cycle or a cluster; churn is history)">projection: {health} → ≈ {Math.min(100, health + plan.reduce((a, p) => a + p.gain, 0))}</span>
                  {lawGroups.length > 0 && <button onClick={() => void startFullPr()} disabled={!!spr?.loading} title="⛙ full PR — one AI pass over the whole file fixing every law violation; staged in an isolated worktree, you merge"
                    style={{ textTransform: "none", letterSpacing: 0, background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 40%, ${C.border})`, color: C.brand, borderRadius: 4, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: 8 }}>⛙ fix all · full PR</button>}
                  <button onClick={() => void openVibe(vibeAllItem())} title="➕ vibe all — the whole plan lands in a session as ONE plan pane (a simplified ultra plan)"
                    style={{ textTransform: "none", letterSpacing: 0, background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 40%, ${C.border})`, color: C.brand, borderRadius: 4, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: 8 }}>➕ vibe all</button>
                </div>
                <VibePicker item={vibeAllItem()} />
                {spr && spr.lawKey === "__ALL__" && SprPanel()}
                {plan.map((p, i) => { const shown = expanded[p.id] ? p.targets : p.targets.slice(0, 3);
                  const isLaw = String(p.id).startsWith("law:");
                  const axName = isLaw ? null : String(p.id).slice(3);
                  const aAx = axName ? (con.axes?.[axName] as any) : null;
                  const sketch = aAx ? <SketchPair ax={axName!} a={aAx} /> : null;
                  return (
                  <div key={p.id} style={{ paddingTop: i ? 8 : 0, borderTop: i ? `1px solid color-mix(in oklab, ${C.border} 40%, transparent)` : "none" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 4 }}>
                      <b style={{ fontFamily: mono, fontSize: 11, color: C.brand }}>{i + 1}</b>
                      <b style={{ fontFamily: mono, fontSize: 10.5, color: p.tone }}>{p.label}</b>
                      <span style={{ fontFamily: mono, fontSize: 8.5, color: C.ok, fontVariantNumeric: "tabular-nums" }} title={(p as any).gainWhy ?? "a deterministic estimate — the axis weight × the deficit it recovers"}>≈ +{p.gain} health</span>
                    </div>
                    {/* the step's WIDGET (before/after drawings, stacked) left · the COMMENT + diff sample right */}
                    <div style={{ display: "grid", gridTemplateColumns: p.example ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr) 270px", columnGap: 18, alignItems: "start" }}>
                      <div style={{ minWidth: 0 }}>
                        {sketch ?? (
                          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                            {shown.map((t: Target, j: number) => (
                              <div key={j} style={{ display: "flex", height: 17, background: isLaw ? `color-mix(in oklab, ${C.bad} 6%, transparent)` : "transparent" }}>
                                <span style={{ width: 48, flexShrink: 0, textAlign: "right", paddingRight: 8, fontFamily: mono, fontSize: 8.5, color: isLaw ? C.bad : C.brand, borderRight: `1px solid ${C.border}`, lineHeight: "17px", userSelect: "none", overflow: "hidden" }}>{t.file ? (t.file.split("/").pop() ?? "").slice(0, 8) : t.line != null ? `L${t.line}` : "•"}</span>
                                <code style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, whiteSpace: "pre", overflow: "hidden", padding: "0 10px", flex: 1, minWidth: 0, lineHeight: "17px" }}>{t.code ?? t.note}</code>
                              </div>
                            ))}
                            {p.targets.length > 3 && (
                              <button onClick={() => setExpanded((m) => ({ ...m, [p.id]: !m[p.id] }))}
                                style={{ display: "block", width: "100%", background: "transparent", border: "none", borderTop: `1px solid ${C.border}`, color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 8, padding: "2px 0" }}>{expanded[p.id] ? "▴ less" : `▾ all (${p.targets.length})`}</button>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ position: "relative", marginTop: 2 }}>
                        <svg style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", pointerEvents: "none" }}>
                          <SArrow x1={8} y1={16} x2={-26} y2={24} tone={C.dim} />
                        </svg>
                        <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, background: C.panel2, padding: "6px 10px 9px", transform: `rotate(${i % 2 ? 0.35 : -0.35}deg)` }}>
                          <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, lineHeight: 1.55 }}>✎ {p.detail || p.label}<WTag n="plan-note" /></div>
                          {/* the diff lives INSIDE the comment — one article, same as the review tab */}
                          {p.example && <ExampleCols ex={p.example} />}
                          <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                            <button onClick={() => setSimFor(simFor === p.id ? null : p.id)} title="▷ simulate — re-run the real formulas as if THIS was done. Deterministic; no code touched."
                              style={{ background: "transparent", border: `1px solid ${simFor === p.id ? C.ok : C.border}`, color: simFor === p.id ? C.ok : C.dim, borderRadius: 4, padding: "0 6px", cursor: "pointer", fontFamily: mono, fontSize: 8 }}>▷ sim</button>
                            <button onClick={() => void openVibe(p)} title="add this fix to a vibe session — it lands in the context studio as an MD from the constitution analysis"
                              style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 40%, ${C.border})`, color: C.brand, borderRadius: 4, padding: "0 6px", cursor: "pointer", fontFamily: mono, fontSize: 8 }}>➕ vibe</button>
                            {p.targets.some((t: Target) => t.line != null && !t.file) && (
                              <button onClick={() => void startPlanSpr(p)} disabled={!!spr?.loading} title="⚡ short PR — the AI fixes this step's exact lines; staged in an isolated worktree, you merge"
                                style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 40%, ${C.border})`, color: C.brand, borderRadius: 4, padding: "0 6px", cursor: "pointer", fontFamily: mono, fontSize: 8 }}>⚡ short PR</button>
                            )}
                          </div>
                          {simFor === p.id && (() => { const s1 = simulate([p]); const ch = AXES.filter((ax) => s1.cur[ax] != null && s1.next[ax] !== s1.cur[ax]); return (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline", fontFamily: mono, fontSize: 8, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                              <span style={{ color: C.ok }}>▷ what-if:</span>
                              {ch.length ? ch.map((ax) => <span key={ax} style={{ color: C.dim }}>{ax} <b style={{ color: conTone(s1.cur[ax]) }}>{s1.cur[ax]}</b>→<b style={{ color: conTone(s1.next[ax]) }}>≈{s1.next[ax]}</b></span>) : <span style={{ color: C.dim, fontStyle: "italic" }}>no axis we can honestly model moves</span>}
                              {s1.healthNext !== s1.healthCur && <span style={{ color: C.dim }}>health <b style={{ color: conTone(s1.healthCur) }}>{s1.healthCur}</b>→<b style={{ color: conTone(s1.healthNext) }}>≈{s1.healthNext}</b></span>}
                            </div>
                          ); })()}
                      {/* ➕ vibe — pick the session; the MD lands in its context studio */}
                      <VibePicker item={p} />
                      {spr && spr.lawKey === `plan:${p.id}` && SprPanel()}
                        </div>
                      </div>
                    </div>
                  </div>
                ); })}
                {/* IMPACT — the whole plan, formulas re-run: per-axis before → ≈after */}
                {(() => { const sim = simulate(plan); const ch = AXES.filter((ax) => sim.cur[ax] != null && sim.next[ax] !== sim.cur[ax]); if (!ch.length) return null; return (
                  <div style={{ marginTop: 7, paddingTop: 6, borderTop: `1px solid color-mix(in oklab, ${C.border} 40%, transparent)` }}>
                    <div style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>impact — if the whole plan lands · a deterministic re-run of the formulas</div>
                    {ch.map((ax) => (
                      <div key={ax} style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: mono, fontSize: 9, padding: "1px 0", fontVariantNumeric: "tabular-nums" }}>
                        <span style={{ width: 72, color: C.dim }}>{ax}</span>
                        <b style={{ color: conTone(sim.cur[ax]), width: 22, textAlign: "right" }}>{sim.cur[ax]}</b>
                        <span style={{ color: C.dim }}>→</span>
                        <b style={{ color: conTone(sim.next[ax]) }}>≈{sim.next[ax]}</b>
                        <div style={{ flex: 1, height: 4, background: `color-mix(in oklab, ${C.border} 40%, transparent)`, borderRadius: 2, overflow: "hidden", position: "relative", maxWidth: 180 }}>
                          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${sim.next[ax]}%`, background: `color-mix(in oklab, ${conTone(sim.next[ax])} 35%, transparent)` }} />
                          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${sim.cur[ax]}%`, background: conTone(sim.cur[ax]) }} />
                        </div>
                      </div>
                    ))}
                    {sim.healthNext !== sim.healthCur && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: mono, fontSize: 9.5, padding: "2px 0", fontVariantNumeric: "tabular-nums" }}>
                        <b style={{ width: 72, color: C.fg }}>health</b>
                        <b style={{ color: conTone(sim.healthCur), width: 22, textAlign: "right" }}>{sim.healthCur}</b>
                        <span style={{ color: C.dim }}>→</span>
                        <b style={{ color: conTone(sim.healthNext), fontSize: 11 }}>≈{sim.healthNext}</b>
                      </div>
                    )}
                  </div>
                ); })()}
              </div>
            ) : (
              <div style={{ fontFamily: mono, fontSize: 10, color: C.ok, fontStyle: "italic" }}>✓ nothing to fix — the file obeys its constitution and every measured axis is healthy.</div>
            )}
              </div>
            ) : view === "canvas" ? (() => {
              /* ── 🕸 THE NEIGHBORHOOD, v6 (operator 2026-07-18): the PROBLEMS are the spine.
                 Middle, ranked worst-first: the region's issues — shared laws, the beyond-the-
                 lines axis findings (their drawings ARE the nodes), hidden couplings. Left and
                 right: the FILES each problem connects, as circles (click → the snippet +
                 errors panel, borderless, fade-delimited; ↗ enter the file · ▾ collapse).
                 File wiring stays as faint context, via-symbols written on center edges.
                 Everything draggable; ⚑ = perfect file; every element a door. */
              if (!nb || nb.loading) return <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>◆ walking the neighborhood…</div>;
              if (nb.error) return <div style={{ fontFamily: mono, fontSize: 9.5, color: C.bad }}>{nb.error}</div>;
              const nodes: any[] = nb.nodes ?? [];
              const byPath = new Map<string, any>(nodes.map((n: any) => [n.path, n]));
              const NW = 272, ROWH = 14, PAD = 46;
              const CIR = 56, EXH = 208, CMW2 = 208, SKCM = 46, SKX = SKCM + CMW2 + 26, SKH = 216, MIDCX = 960, TOPY = 96, FILEDX = 348;
              const edgesAll: any[] = (nb.edges ?? []).filter((e: any) => e.kind !== "co_change");
              const coEdges: any[] = (nb.edges ?? []).filter((e: any) => e.kind === "co_change");
              const perfect = (n: any) => !!n && n.judged && (n.health ?? 0) >= 100 && (n.violations ?? 0) === 0;
              const hunksOf = (n: any) => ((n?.worst_list ?? []) as any[]).filter((v: any) => v.snippet?.length);
              const hubs: any[] = nb.issue_hubs ?? [];
              const sketches = weak.map(({ ax, a }) => ({ ax, a, el: AxisSketch({ ax, a }), plan: axisPlan(ax, a) })).filter((s) => s.el != null).slice(0, 3);
              // ── THE PROBLEMS — laws (grouped across files) · weak axes · hidden couplings
              const lawProblems = (() => {
                const m = new Map<string, any>();
                for (const it of (nb.issues ?? [])) {
                  const e = m.get(it.law_key) ?? { kind: "law", key: it.law_key, title: it.title, severity: it.severity, category: it.category ?? null, pen: 0, fix: null as string | null, files: new Map<string, number[]>() };
                  e.pen += it.pen ?? 1;
                  if (!e.files.has(it.path)) e.files.set(it.path, []);
                  if (it.line != null && e.files.get(it.path)!.length < 4) e.files.get(it.path)!.push(it.line);
                  m.set(it.law_key, e);
                }
                for (const h of hubs) { const e = m.get(h.law_key); if (e) for (const mem of h.members) if (!e.files.has(mem)) e.files.set(mem, []); }
                for (const e of m.values()) { // the fix hint rides on any member's worst_list entry
                  for (const [f] of e.files) { const w = (byPath.get(f)?.worst_list ?? []).find((x: any) => x.law_key === e.key); if (w?.fix) { e.fix = w.fix; break; } }
                }
                return [...m.values()].map((e) => ({ ...e, files: [...e.files.entries()] as [string, number[]][] }));
              })();
              const coProblems = coEdges.map((e: any) => ({ kind: "co", e, pen: (e.n ?? 3) * 2, files: [[e.from, []], [e.to, []]] as [string, number[]][] }));
              // beyond-the-lines is its OWN left section (operator 2026-07-18), not a spine member
              const problems: any[] = [...lawProblems, ...coProblems].sort((a, b) => b.pen - a.pen).slice(0, 10);
              // the AXIS a problem damages (operator 2026-07-18: the spine decomposes
              // Issue ↓ Law ↓ Axis — "Cyclomatic Complexity → Structure Axis")
              const axisOfPb = (pb: any): string => {
                if (pb.kind === "co") return "coupling";
                const cat = pb.category ?? "";
                if (cat === "testing" || /test|spec|coverage/.test(pb.key ?? "")) return "tests";
                if (cat === "structure" || cat === "performance" || /complex|nest|bool|loop|alloc|concat/.test(pb.key ?? "")) return "structure";
                if (cat === "architecture" || /import|layer|cycle|coupl/.test(pb.key ?? "")) return "coupling";
                return "compliance";
              };
              // ── GEOMETRY: the spine stacks down the middle; files claim side slots.
              // The Issue↓Law↓Axis decomposition rides as ONE discrete STAMP on the card.
              const pbCardH = (pb: any) => pb.kind === "co" ? 52 : 30 + (pb.fix ? 22 : 0) + 22;
              const pbSize = (pb: any) => ({ w: pb.kind === "co" ? 224 : 252, h: pbCardH(pb) + 6 });
              // the spine breathes on a TIGHT, even rhythm (operator: items were too far apart)
              const pbBase: { x: number; y: number; w: number; h: number }[] = [];
              { let y = TOPY; for (const pb of problems) { const sz = pbSize(pb); pbBase.push({ x: MIDCX - sz.w / 2, y, w: sz.w, h: sz.h }); y += sz.h + 26; } }
              const spineBottom = pbBase.length ? pbBase[pbBase.length - 1].y + pbBase[pbBase.length - 1].h : TOPY;
              // side files distribute HARMONICALLY: each side's files spread evenly over the
              // whole spine height (ordered by their worst problem), never clumped per problem
              const filePos = new Map<string, { cx: number; y: number }>();
              {
                const assign: { f: string; pi: number; side: number }[] = [];
                const seen = new Set<string>();
                let flip = 0;
                problems.forEach((pb: any, pi: number) => { for (const [f] of pb.files) { if (seen.has(f)) continue; seen.add(f); assign.push({ f, pi, side: flip++ % 2 === 0 ? -1 : 1 }); } });
                if (con.path && byPath.has(con.path) && !seen.has(con.path)) assign.push({ f: con.path, pi: 0, side: -1 });
                const spineH = Math.max(spineBottom - TOPY, 220);
                for (const side of [-1, 1]) {
                  const list = assign.filter((x) => x.side === side).sort((a, b) => a.pi - b.pi);
                  const perCol = 7; // beyond that, an outer column opens
                  list.forEach((x, i) => {
                    const col = Math.floor(i / perCol);
                    const rows = Math.min(list.length - col * perCol, perCol);
                    const idx = i % perCol;
                    const y = TOPY + ((idx + 0.5) * (spineH / Math.max(1, rows))) - CIR / 2;
                    filePos.set(x.f, { cx: MIDCX + side * (FILEDX + col * 156), y });
                  });
                }
              }
              const skBase = sketches.map((_: any, i: number) => ({ x: SKX, y: TOPY + i * SKH }));
              const skBottom = sketches.length ? skBase[sketches.length - 1].y + SKH : TOPY;
              const worldW = MIDCX + FILEDX + 240 + PAD;
              const worldH = Math.max(spineBottom, skBottom, ...[...filePos.values()].map((p) => p.y + EXH)) + PAD;
              const fitZ = Math.max(0.3, Math.min(1, 880 / worldW, 560 / worldH));
              const cam = nbCam ?? { x: 0, y: 0, z: fitZ };
              nbCamRef.current = cam;
              // drag removed (operator 2026-07-18) — elements sit still; clicks act, the canvas pans
              const P2 = (_k: string, x: number, y: number) => ({ x, y });
              const dragProps = (_key: string, click?: () => void) => ({
                onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); },
                onClick: click ? (e: React.MouseEvent) => { e.stopPropagation(); click(); } : undefined,
              });
              const toneOf = (n: any) => (!n.judged ? C.dim : conTone(n.health ?? 50));
              const isExp = (p: string) => !!nbExpand[p];
              const sizeOf = (p: string) => { const n = byPath.get(p); if (perfect(n)) return { w: 84, h: 16 }; if (isExp(p)) return { w: NW, h: EXH }; return { w: CIR, h: CIR }; };
              const rectOf = (p: string) => { const b = filePos.get(p); if (!b) return null; const sz = sizeOf(p); return { x: b.cx - sz.w / 2, y: b.y, w: sz.w, h: sz.h }; };
              const pbRect = (pi: number) => ({ ...pbBase[pi] });
              const SFlowH = ({ x1, y1, x2, y2, tone, dashed }: any) => { const sgn = x2 >= x1 ? 1 : -1; const dx = Math.max(26, Math.abs(x2 - x1) * 0.38); return (
                <g stroke={tone} fill="none" strokeWidth={1.1} strokeLinecap="round">
                  <path d={`M ${x1} ${y1} C ${x1 + sgn * dx} ${y1}, ${x2 - sgn * dx} ${y2}, ${x2} ${y2}`} strokeDasharray={dashed ? "4 3" : undefined} />
                  <path d={`M ${x2 - sgn * 7} ${y2 - 3.5} L ${x2} ${y2} L ${x2 - sgn * 7} ${y2 + 3.5}`} />
                </g>
              ); };
              const SFlowV = ({ x1, y1, x2, y2, tone, dashed }: any) => { const sgn = y2 >= y1 ? 1 : -1; const dy = Math.max(22, Math.abs(y2 - y1) * 0.4); return (
                <g stroke={tone} fill="none" strokeWidth={1.0} strokeLinecap="round">
                  <path d={`M ${x1} ${y1} C ${x1} ${y1 + sgn * dy}, ${x2} ${y2 - sgn * dy}, ${x2} ${y2}`} strokeDasharray={dashed ? "4 3" : undefined} />
                  <path d={`M ${x2 - 3.5} ${y2 - sgn * 7} L ${x2} ${y2} L ${x2 + 3.5} ${y2 - sgn * 7}`} />
                </g>
              ); };
              // problem → file: leaves the card on the file's side, lands on the circle/panel
              const ProblemArrow = ({ pi, f, tone, dashed, label }: any) => {
                const pr = pbRect(pi), fr = rectOf(f);
                if (!fr) return null;
                const L = fr.x + fr.w / 2 < pr.x + pr.w / 2;
                const x1 = L ? pr.x : pr.x + pr.w, x2 = L ? fr.x + fr.w : fr.x;
                const y1 = pr.y + Math.min(pr.h / 2, 44), y2 = fr.y + Math.min(fr.h / 2, 40);
                return (<g><SFlowH x1={x1} y1={y1} x2={x2} y2={y2} tone={tone} dashed={dashed} />{label ? <text x={x2 + (L ? 8 : -8)} y={y2 - 5} textAnchor={L ? "start" : "end"} fill={tone} style={{ fontFamily: mono, fontSize: 6.3 }}>{label}</text> : null}</g>);
              };
              // ── the FILE — a circle; click → the borderless fade-delimited snippet panel
              const FileNode = ({ n }: { n: any }) => {
                const r = rectOf(n.path);
                if (!r) return null;
                const isC = n.path === con.path;
                const t = toneOf(n);
                const go = () => void onNavigate(n.path);
                if (perfect(n)) return (
                  <div data-card {...dragProps(n.path, isC ? undefined : go)} title={`${n.path} — perfect`} style={{ position: "absolute", left: r.x, top: r.y, display: "flex", gap: 5, alignItems: "baseline", fontFamily: mono, color: C.ok, cursor: isC ? "grab" : "pointer", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 12 }}>⚑</span><b style={{ fontSize: 9.5 }}>{n.name}</b><b style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>100</b>
                  </div>
                );
                if (!isExp(n.path)) return (<>
                  <div data-card {...dragProps(n.path, () => setNbExpand((m) => ({ ...m, [n.path]: true })))} title={`${n.path} — click to open its snippets`}
                    style={{ position: "absolute", left: r.x, top: r.y, width: CIR, height: CIR, borderRadius: "50%", border: `1.5px ${n.judged ? "solid" : "dashed"} ${isC ? `color-mix(in oklab, ${C.brand} 70%, ${t})` : t}`, background: C.panel, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, cursor: "pointer", boxSizing: "border-box" }}>
                    <b style={{ color: t, fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>{n.health ?? "—"}</b>
                    {(n.errs ?? 0) > 0 && <span style={{ position: "absolute", top: -1, right: -1, width: 9, height: 9, borderRadius: "50%", background: C.bad, border: `1.5px solid ${C.bg}` }} />}
                  </div>
                  <div data-card {...dragProps(n.path, () => setNbExpand((m) => ({ ...m, [n.path]: true })))} style={{ position: "absolute", left: r.x + CIR / 2, top: r.y + CIR + 3, transform: "translateX(-50%)", fontFamily: mono, fontSize: 7.5, color: isC ? C.brand : C.muted, whiteSpace: "nowrap", cursor: "pointer" }}>{n.name}</div>
                </>);
                const hunks = hunksOf(n).slice(0, 1);
                return (
                  <div data-card {...dragProps(n.path)} style={{ position: "absolute", left: r.x - 18, top: r.y - 10, width: NW + 36, border: `1px solid ${isC ? `color-mix(in oklab, ${C.brand} 55%, ${C.border})` : t}`, borderRadius: 12, background: C.panel, padding: "8px 12px 10px", fontFamily: mono, boxSizing: "border-box" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <b style={{ fontSize: isC ? 10.5 : 9.5, color: isC ? C.brand : C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>{n.name}</b>
                      <b style={{ fontSize: 12, color: t, fontVariantNumeric: "tabular-nums" }}>{n.health ?? "—"}</b>
                      {!isC && <button onClick={go} title="enter the file — its full review" style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 7.5 }}>↗ enter</button>}
                      <button onClick={() => setNbZoom({ kind: "file", n })} title="expand — every finding, snippet by snippet" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 8 }}>⤢</button>
                      <button onClick={() => setNbExpand((m) => ({ ...m, [n.path]: false }))} title="collapse back to a circle" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 8 }}>▾</button>
                    </div>
                    {/* discrete geography: the path, only when opened (operator 2026-07-18) */}
                    <div style={{ fontSize: 6.5, color: C.dim, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.path}</div>
                    {hunks.map((v: any, h2: number) => (
                      <div key={h2} style={{ marginTop: 3 }}>
                        <div style={{ fontSize: 7, color: C.dim, padding: "0 2px 1px" }}>@@ L{v.snippet[0].ln}–{v.snippet[v.snippet.length - 1].ln}</div>
                        {v.snippet.map((row: any) => { const sick = row.ln === v.line; const sevT = SEV_TONE[v.severity] ?? C.warn; return (
                          <div key={row.ln} style={{ display: "flex", height: ROWH, background: sick ? `color-mix(in oklab, ${sevT} 9%, transparent)` : "transparent", borderRadius: 3 }}>
                            <span style={{ width: 24, flexShrink: 0, textAlign: "right", paddingRight: 6, fontSize: 7, color: sick ? sevT : C.dim, lineHeight: `${ROWH}px`, userSelect: "none" }}>{row.ln}</span>
                            <code style={{ fontSize: 7.5, color: sick ? C.fg : C.muted, whiteSpace: "pre", overflow: "hidden", padding: "0 4px", flex: 1, minWidth: 0, lineHeight: `${ROWH}px`, fontFamily: mono }}>{row.text}</code>
                          </div>
                        ); })}
                      </div>
                    ))}
                    {(n.worst_list ?? []).length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 6.5, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8 }}>⚠ errors & warnings</div>
                        {(n.worst_list ?? []).slice(0, 3).map((v: any, j: number) => (
                          <div key={j} style={{ display: "flex", gap: 5, alignItems: "baseline", fontSize: 7.5, padding: "0.5px 0", minWidth: 0 }}>
                            <span style={{ color: SEV_TONE[v.severity] ?? C.warn, flexShrink: 0 }}>{v.severity}</span>
                            <span style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{v.title}</span>
                            {v.line != null && <span style={{ color: C.dim, flexShrink: 0 }}>L{v.line}</span>}
                          </div>
                        ))}
                        {(n.violations ?? 0) > 3 && <div style={{ fontSize: 7, color: C.dim }}>+{n.violations - 3} more inside</div>}
                      </div>
                    )}
                    {/* the data it carries between its neighbors — discrete, expand-only */}
                    {(() => {
                      const flows = [
                        ...edgesAll.filter((e: any) => e.from === n.path && byPath.has(e.to)).map((e: any) => ({ dir: "pulls", other: e.to, via: (e.via ?? []) as string[] })),
                        ...edgesAll.filter((e: any) => e.to === n.path && byPath.has(e.from)).map((e: any) => ({ dir: "gives", other: e.from, via: (e.via ?? []) as string[] })),
                      ].slice(0, 4);
                      if (!flows.length) return null;
                      return (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 6.5, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8 }}>the data it carries</div>
                          {flows.map((f2: any, i: number) => (
                            <div key={i} style={{ display: "flex", gap: 5, alignItems: "baseline", fontSize: 7, color: C.dim, minWidth: 0 }}>
                              <span style={{ flexShrink: 0 }}>{f2.dir === "pulls" ? "← pulls" : "→ gives"}</span>
                              <code style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, fontFamily: mono }}>{f2.via.slice(0, 3).join(", ") || "(side-effect import)"}</code>
                              <span style={{ flexShrink: 0 }}>{f2.dir === "pulls" ? "from" : "to"} {f2.other.split("/").pop()}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                );
              };
              const shownFiles = nodes.filter((n: any) => filePos.has(n.path));
              // ── the REGION SCORE (operator 2026-07-18): the whole neighborhood judged as if
              // it were ONE file — per-axis loc-weighted means, health from the same axis
              // weights the engineering model uses. Deterministic, from the nodes' own axes.
              const region = (() => {
                const judged = nodes.filter((n: any) => n.judged && n.axes);
                if (!judged.length) return null;
                const wOfN = (n: any) => Math.max(1, n.signals?.loc ?? 1);
                const axes: Record<string, number> = {};
                for (const ax of AXES) {
                  let s = 0, w = 0;
                  for (const n of judged) { const v = n.axes?.[ax]; if (v != null) { s += v * wOfN(n); w += wOfN(n); } }
                  if (w > 0) axes[ax] = Math.round(s / w);
                }
                let hs = 0, hw = 0;
                for (const [ax, v] of Object.entries(axes)) { const wt = (AXIS_W as any)[ax] ?? 0.06; hs += v * wt; hw += wt; }
                return { health: hw ? Math.round(hs / hw) : null, axes, files: judged.length, loc: judged.reduce((a: number, n: any) => a + (n.signals?.loc ?? 0), 0) };
              })();
              // ── THE FOUR QUESTIONS (operator 2026-07-18): Origin · Propagation · Radius ·
              // Repair Point — each answered deterministically from the charted issues/wiring.
              const questions = (() => {
                const sick = nodes.filter((n: any) => (n.violations ?? 0) > 0);
                if (!sick.length) return null;
                const penOfFile = new Map<string, number>();
                for (const it of (nb.issues ?? [])) penOfFile.set(it.path, (penOfFile.get(it.path) ?? 0) + (it.pen ?? 1));
                const totalPen = [...penOfFile.values()].reduce((a, b) => a + b, 0) || 1;
                // ORIGIN — the sickest, most-downstream point: where the data starts carrying the disease
                const depth2 = (n: any) => (n.dir === "down" ? 2 + n.layer : n.dir === "center" ? 1 : 0);
                const origin = [...sick].sort((a, b) => (depth2(b) - depth2(a)) || ((penOfFile.get(b.path) ?? 0) - (penOfFile.get(a.path) ?? 0)))[0];
                // PROPAGATION — the wiring chain from the origin toward the consumers, and the unwired pattern
                const chain: string[] = [origin.path];
                let cur = origin.path;
                for (let i = 0; i < 3; i += 1) { const e = edgesAll.find((e2: any) => e2.to === cur && byPath.has(e2.from) && !chain.includes(e2.from)); if (!e) break; chain.push(e.from); cur = e.from; }
                const via0 = (edgesAll.find((e2: any) => e2.to === origin.path)?.via ?? []) as string[];
                const patternSpread = Math.max(0, ...(nb.issue_hubs ?? []).map((h: any) => h.members.length));
                // RADIUS — who is touched, wired and unwired
                const upTouched = nodes.filter((n: any) => n.dir === "up").length;
                const ringTouched = nodes.filter((n: any) => n.dir === "issue").length;
                // REPAIR POINT — the least change that clears the most of the charted penalty
                const penOfLaw = new Map<string, { title: string; pen: number; files: Set<string>; sites: number }>();
                for (const it of (nb.issues ?? [])) { const e = penOfLaw.get(it.law_key) ?? { title: it.title ?? it.law_key, pen: 0, files: new Set<string>(), sites: 0 }; e.pen += it.pen ?? 1; e.files.add(it.path); e.sites += 1; penOfLaw.set(it.law_key, e); }
                const bestFile = [...penOfFile.entries()].sort((a, b) => b[1] - a[1])[0];
                const bestLaw = [...penOfLaw.entries()].sort((a, b) => b[1].pen - a[1].pen)[0];
                const repair = bestLaw && (!bestFile || bestLaw[1].pen >= bestFile[1])
                  ? { kind: "law" as const, label: bestLaw[1].title, sites: bestLaw[1].sites, files: bestLaw[1].files.size, pct: Math.round((bestLaw[1].pen / totalPen) * 100) }
                  : { kind: "file" as const, label: bestFile[0], pct: Math.round((bestFile[1] / totalPen) * 100) };
                return { origin, chain, via0, patternSpread, upTouched, ringTouched, sickCount: sick.length, repair };
              })();
              return (
                <div style={nbFull
                  ? { position: "fixed", inset: 10, zIndex: 1000, background: C.bg, border: `1px solid color-mix(in oklab, ${C.brand} 25%, ${C.border})`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 24px 80px rgba(0,0,0,.45)" }
                  : { display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: mono, fontSize: 8 }}>
                    <span style={{ color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>🕸 the neighborhood — the PROBLEMS are the spine, worst first · the files they touch, beside them</span>
                    <span style={{ flex: 1 }} />
                    <button onClick={() => setNbFull((f) => !f)} title={nbFull ? "exit fullscreen" : "fullscreen the neighborhood"} style={{ background: "transparent", border: `1px solid ${nbFull ? C.brand : C.border}`, color: nbFull ? C.brand : C.dim, borderRadius: 4, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>{nbFull ? "🗕" : "⛶"}</button>
                    <button onClick={() => setNbCam({ ...cam, z: Math.max(0.3, cam.z * 0.85) })} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 4, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>−</button>
                    <span style={{ color: C.dim, fontVariantNumeric: "tabular-nums", width: 30, textAlign: "center" }}>{Math.round(cam.z * 100)}%</span>
                    <button onClick={() => setNbCam({ ...cam, z: Math.min(2.2, cam.z * 1.18) })} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 4, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>+</button>
                    <button onClick={() => { setNbCam(null); setNbExpand({}); }} title="fit the whole neighborhood + collapse the circles" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 4, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: 8 }}>⌖ fit</button>
                  </div>
                  {/* the REGION, scored as one single thing */}
                  {region && (
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", fontFamily: mono, fontSize: 8.5, fontVariantNumeric: "tabular-nums" }}
                      title="the neighborhood judged as ONE file: each axis is the loc-weighted mean across its files; health blends them with the engineering model's own axis weights">
                      <span style={{ color: C.dim, textTransform: "uppercase", letterSpacing: 0.8, fontSize: 7 }}>the region as one file</span>
                      <b style={{ fontSize: 14, color: conTone(region.health ?? 50) }}>{region.health ?? "—"}</b>
                      {AXES.filter((ax) => region.axes[ax] != null).map((ax) => (
                        <span key={ax} style={{ color: C.dim }}>{ax} <b style={{ color: conTone(region.axes[ax]) }}>{region.axes[ax]}</b></span>
                      ))}
                      <span style={{ color: C.dim, fontSize: 7.5 }}>· {region.files} file{region.files === 1 ? "" : "s"} · {region.loc} loc · loc-weighted</span>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 14, flex: nbFull ? 1 : undefined, minHeight: 0 }}>
                  {/* the FOUR QUESTIONS — a discrete left sidebar: origin · propagation · radius · repair point */}
                  {questions && !nbSide && (
                    <button onClick={() => setNbSide(true)} title="the four questions — origin · propagation · radius · repair point"
                      style={{ writingMode: "vertical-rl", background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 6, padding: "10px 1px", cursor: "pointer", fontFamily: mono, fontSize: 7.5, letterSpacing: 1, flexShrink: 0, alignSelf: "flex-start" }}>» the four questions</button>
                  )}
                  {questions && nbSide && (
                    <div style={{ width: 184, flexShrink: 0, display: "flex", flexDirection: "column", gap: 11, fontFamily: mono, fontSize: 8.5, lineHeight: 1.55, paddingTop: 6 }}>
                      <button onClick={() => setNbSide(false)} title="collapse the questions" style={{ alignSelf: "flex-end", background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 8.5, padding: 0, margin: "-4px 0 -9px" }}>«</button>
                      {(() => {
                        // the ORIGIN dossier — file · reason · first snapshot · first commit · law
                        const oi = nb.origin_info ?? null;
                        const ow = questions.origin.worst_list?.[0] ?? null;
                        const reason = oi?.reason ?? (coEdges.some((e: any) => e.from === questions.origin.path || e.to === questions.origin.path) ? "hidden coupling"
                          : ow && hubs.some((h: any) => h.law_key === ow.law_key && h.members.length >= 2) ? "a house pattern — the same law breaks elsewhere" : "a local slip");
                        const rel = (iso?: string | null) => { if (!iso) return null; const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); if (d < 1) return "today"; if (d < 14) return `${d} day${d === 1 ? "" : "s"} ago`; const w = Math.floor(d / 7); if (w < 9) return `${w} week${w === 1 ? "" : "s"} ago`; const mo = Math.floor(d / 30); return `${mo} month${mo === 1 ? "" : "s"} ago`; };
                        const Row = ({ k, children }: any) => (<div style={{ marginTop: 2 }}><span style={{ color: C.dim, textTransform: "uppercase", letterSpacing: 0.8, fontSize: 6.5 }}>{k}</span><div style={{ color: C.muted }}>{children}</div></div>);
                        return (
                          <div>
                            <div style={{ color: C.dim, textTransform: "uppercase", letterSpacing: 0.8, fontSize: 7, marginBottom: 1 }}>origin</div>
                            <button onClick={() => { if (questions.origin.path !== con.path) void onNavigate(questions.origin.path); }} style={{ background: "transparent", border: "none", padding: 0, cursor: questions.origin.path !== con.path ? "pointer" : "default", fontFamily: mono, fontSize: 8.5, color: C.fg }}>
                              <b>{oi?.name ?? questions.origin.name}</b>
                            </button>
                            <Row k="reason">{reason}</Row>
                            {oi?.first_snapshot_at && <Row k="first snapshot">{rel(oi.first_snapshot_at)}</Row>}
                            {oi?.first_commit && <Row k="first commit"><code style={{ fontFamily: mono, color: C.fg }}>{oi.first_commit.sha}</code> · {oi.first_commit.date}</Row>}
                            {(oi?.law_title || oi?.law_key || ow) && <Row k="law">{oi?.category ? `${oi.category} — ` : ""}{oi?.law_title ?? oi?.law_key ?? ow?.title ?? ow?.law_key}</Row>}
                          </div>
                        );
                      })()}
                      <div>
                        <div style={{ color: C.dim, textTransform: "uppercase", letterSpacing: 0.8, fontSize: 7, marginBottom: 1 }}>propagation</div>
                        {questions.chain.length > 1 ? (() => {
                          // drawn, not told: the disease's path, origin ring first, via symbols on the first hop
                          const chain = questions.chain.slice(0, 4);
                          const W2 = 176, step = (W2 - 26) / Math.max(1, chain.length - 1);
                          return (
                            <svg width={W2} height={56} style={{ display: "block" }}>
                              {chain.slice(0, -1).map((_, i) => (
                                <SFlowH key={i} x1={13 + i * step + 8} y1={20} x2={13 + (i + 1) * step - 8} y2={20} tone={`color-mix(in oklab, ${C.dim} 60%, transparent)`} />
                              ))}
                              {chain.map((p, i) => { const n3 = byPath.get(p); const t2 = n3?.judged ? conTone(n3.health ?? 50) : C.dim; return (
                                <g key={p}>
                                  <circle cx={13 + i * step} cy={20} r={i === 0 ? 7 : 5.5} fill="none" stroke={i === 0 ? (SEV_TONE[questions.origin.worst_list?.[0]?.severity] ?? C.warn) : t2} strokeWidth={1.4} />
                                  <text x={13 + i * step} y={i % 2 ? 48 : 37} textAnchor="middle" fill={C.muted} style={{ fontFamily: mono, fontSize: 6.2 }}>{(p.split("/").pop() ?? "").slice(0, 13)}</text>
                                </g>
                              ); })}
                              {questions.via0.length > 0 && <text x={13 + step / 2} y={10} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 6 }}>{questions.via0.slice(0, 2).join(", ")}</text>}
                            </svg>
                          );
                        })() : <span style={{ color: C.muted }}>no wired spread — it stays where it is</span>}
                        {questions.patternSpread >= 2 && <div style={{ color: C.warn, fontSize: 7.5 }}>the pattern re-appears unwired in {questions.patternSpread} files</div>}
                      </div>
                      <div>
                        <div style={{ color: C.dim, textTransform: "uppercase", letterSpacing: 0.8, fontSize: 7, marginBottom: 1 }}>radius</div>
                        <span style={{ color: C.muted }}>{questions.upTouched} consumer{questions.upTouched === 1 ? "" : "s"} above the sick core{questions.ringTouched ? `, ${questions.ringTouched} more share the disease unwired` : ""} — {questions.sickCount} of {nodes.length} files in view carry findings</span>
                        <div style={{ color: C.ok, fontSize: 7.5, marginTop: 1 }}>repair radius: {questions.repair.kind === "law" ? `${questions.repair.files} file${questions.repair.files === 1 ? "" : "s"} · ${questions.repair.sites} site${questions.repair.sites === 1 ? "" : "s"}` : "1 file"} — the fix stays that small</div>
                      </div>
                      <div>
                        <div style={{ color: C.dim, textTransform: "uppercase", letterSpacing: 0.8, fontSize: 7, marginBottom: 1 }}>repair point</div>
                        <span style={{ color: C.ok }}>{questions.repair.kind === "law" ? <>fix <b>“{questions.repair.label}”</b> once — {questions.repair.sites} site{questions.repair.sites === 1 ? "" : "s"} in {questions.repair.files} file{questions.repair.files === 1 ? "" : "s"} → clears ≈{questions.repair.pct}% of the charted penalty</> : <>fix <b>{String(questions.repair.label).split("/").pop()}</b> — clears ≈{questions.repair.pct}% of the charted penalty</>}</span>
                        <div style={{ color: C.dim, fontSize: 7 }}>the least change that finishes the spine</div>
                      </div>
                    </div>
                  )}
                  <div ref={nbView}
                    onPointerDown={(e) => { if ((e.target as HTMLElement).closest("[data-card]")) return; nbDrag.current = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
                    onPointerMove={(e) => { const d = nbDrag.current; if (!d) return; setNbCam({ ...cam, x: d.cx + (e.clientX - d.sx), y: d.cy + (e.clientY - d.sy) }); }}
                    onPointerUp={() => { nbDrag.current = null; }}
                    style={{ position: "relative", height: nbFull ? undefined : "60vh", flex: 1, minWidth: 0, minHeight: 380, overflow: "hidden", cursor: nbDrag.current ? "grabbing" : "grab", borderRadius: 10, background: `radial-gradient(color-mix(in oklab, ${C.border} 32%, transparent) 1px, transparent 1px)`, backgroundSize: "22px 22px", touchAction: "none" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, width: worldW, height: worldH, transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`, transformOrigin: "0 0" }}>
                      <svg width={worldW} height={worldH} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
                        {problems.length > 0 && <text x={MIDCX} y={TOPY - 20} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 7.5 }}>▼ the problems, ranked — the worst first</text>}
                        {/* the spine: problem → problem, the reading order */}
                        {problems.slice(0, -1).map((_: any, pi: number) => {
                          const a = pbRect(pi), b = pbRect(pi + 1);
                          return <SFlowV key={`sp${pi}`} x1={a.x + a.w / 2} y1={a.y + a.h} x2={b.x + b.w / 2} y2={b.y} tone={`color-mix(in oklab, ${C.dim} 40%, transparent)`} />;
                        })}
                        {/* problem → the files it lives in (law: solid sev, lines written at the file; axis: dashed; coupling: dashed warn) */}
                        {problems.map((pb: any, pi: number) => pb.files.map(([f, lines]: [string, number[]]) => {
                          const tone = pb.kind === "law" ? `color-mix(in oklab, ${SEV_TONE[pb.severity] ?? C.warn} 60%, transparent)` : pb.kind === "axis" ? `color-mix(in oklab, ${conTone(pb.a.score)} 55%, transparent)` : `color-mix(in oklab, ${C.warn} 60%, transparent)`;
                          return <ProblemArrow key={`${pi}:${f}`} pi={pi} f={f} tone={tone} dashed={pb.kind !== "law"} label={lines.length ? lines.map((l: number) => `L${l}`).join(" ") : null} />;
                        }))}
                        {/* the wiring, faint context — via symbols written on the center's edges */}
                        {edgesAll.map((e: any, i: number) => {
                          const ra = rectOf(e.from), rb = rectOf(e.to);
                          if (!ra || !rb) return null;
                          const L2R = ra.x <= rb.x;
                          const x1 = L2R ? ra.x + ra.w : ra.x, x2 = L2R ? rb.x : rb.x + rb.w;
                          const y1 = ra.y + Math.min(ra.h / 2, 40), y2 = rb.y + Math.min(rb.h / 2, 40);
                          const touchesC = e.from === con.path || e.to === con.path;
                          return (
                            <g key={`w${i}`}>
                              <SFlowH x1={x1} y1={y1} x2={x2} y2={y2} tone={`color-mix(in oklab, ${C.dim} ${touchesC ? 40 : 22}%, transparent)`} />
                              {touchesC && e.via?.length > 0 && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 6.3 }}>{e.via.slice(0, 2).join(", ")}</text>}
                            </g>
                          );
                        })}
                        {/* each boxed comment reaches its drawing */}
                        {sketches.map((_: any, si: number) => (
                          <SArrow key={`skcm${si}`} x1={SKCM + CMW2 + 2} y1={skBase[si].y + 24} x2={SKX - 4} y2={skBase[si].y + 52} tone={C.dim} />
                        ))}
                        {/* the beyond-the-lines section arrows into the files each drawing mentions */}
                        {sketches.map((s: any, si: number) => {
                          const base = P2(`sk:${si}`, skBase[si].x, skBase[si].y);
                          const mentioned = [...new Set<string>((s.plan.targets ?? []).map((t: Target) => t.file).filter((f: any): f is string => !!f && !!rectOf(f)))].slice(0, 4);
                          const tone2 = conTone(s.a.score);
                          return (
                            <g key={`ska${si}`}>
                              {mentioned.map((f) => { const r = rectOf(f)!; return <SFlowH key={f} x1={base.x + NW} y1={base.y + 64} x2={r.x} y2={r.y + Math.min(r.h / 2, 40)} tone={`color-mix(in oklab, ${tone2} 55%, transparent)`} dashed />; })}
                              {!mentioned.length && con.path && rectOf(con.path) && <SFlowH x1={base.x + NW} y1={base.y + 64} x2={rectOf(con.path)!.x} y2={rectOf(con.path)!.y + 30} tone={`color-mix(in oklab, ${tone2} 50%, transparent)`} dashed />}
                            </g>
                          );
                        })}
                      </svg>
                      {/* ── the SPINE: the problems ── */}
                      {problems.map((pb: any, pi: number) => {
                        const r = pbRect(pi);
                        // the decomposition — Issue ↓ Law ↓ Axis — as ONE discrete stamp on the card
                        const axis = axisOfPb(pb);
                        const axScore = region?.axes?.[axis] ?? null;
                        const axTone = axScore != null ? conTone(axScore) : C.dim;
                        const stamp = (
                          <div style={{ position: "absolute", top: -8, right: -9, transform: "rotate(4deg)", border: `1px dashed color-mix(in oklab, ${axTone} 55%, transparent)`, borderRadius: 6, background: C.panel2, padding: "0 5px", fontFamily: mono, fontSize: 6.3, color: axTone, whiteSpace: "nowrap", pointerEvents: "none" }}>{pb.kind === "co" ? "⬡ coupling" : `${pb.key} · ⬡ ${axis}${axScore != null ? ` ${axScore}` : ""}`}</div>
                        );
                        if (pb.kind === "co") return (
                          <div key={`pb${pi}`} data-card {...dragProps(`pb:${pi}`, () => setNbZoom({ kind: "co", pb }))} style={{ position: "absolute", left: r.x, top: r.y, width: r.w, border: `1px dashed ${C.warn}`, borderRadius: 9, background: C.panel2, padding: "4px 9px", transform: `rotate(${pi % 2 ? 0.7 : -0.7}deg)`, fontFamily: mono, fontSize: 7.5, color: C.warn, lineHeight: 1.45, cursor: "pointer", boxSizing: "border-box" }}>
                            {stamp}
                            {(() => { const via = importPath(edgesAll.map((e: any) => ({ from: e.from, to: e.to, kind: e.kind })), pb.e.from, pb.e.to); return (<>
                              <b>⇠⇢ {via ? "indirect" : "hidden"} coupling ×{pb.e.n}</b> <span style={{ float: "right", color: C.dim }}>⤢</span>
                              <div style={{ color: C.dim, fontSize: 7 }}>{via ? `they change together — the import path runs ${via.length - 1} hops via ${via.slice(1, -1).map((p) => p.split("/").pop()).join(" → ") || "…"}` : "they change together — no import declares the contract"}</div>
                            </>); })()}
                          </div>
                        );
                        const sevT = SEV_TONE[pb.severity] ?? C.warn;
                        return (
                          <div key={`pb${pi}`} data-card {...dragProps(`pb:${pi}`, () => setNbZoom({ kind: "law", pb }))} style={{ position: "absolute", left: r.x, top: r.y, width: r.w, border: `1px solid color-mix(in oklab, ${sevT} 55%, ${C.border})`, borderRadius: 9, background: C.panel2, padding: "5px 9px", transform: `rotate(${pi % 2 ? 0.6 : -0.6}deg)`, fontFamily: mono, fontSize: 7.5, color: C.muted, lineHeight: 1.5, cursor: "pointer", boxSizing: "border-box" }}>
                            {stamp}
                            <div style={{ display: "flex", gap: 5, alignItems: "baseline" }}>
                              <span style={{ color: sevT, fontSize: 6.5, border: `1px solid ${sevT}`, borderRadius: 7, padding: "0 4px", flexShrink: 0 }}>{pb.severity}</span>
                              <b style={{ color: C.fg, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pb.title}</b>
                              <span style={{ color: C.dim, fontSize: 6.5, flexShrink: 0 }}>−{pb.pen}</span>
                              <span style={{ flex: 1 }} />
                              <span style={{ color: C.dim, fontSize: 8, flexShrink: 0 }}>⤢</span>
                            </div>
                            {pb.fix && <div style={{ color: C.ok, marginTop: 2 }}>✎ {String(pb.fix).slice(0, 120)}</div>}
                            <div style={{ fontSize: 7, color: C.dim, marginTop: 1 }}>{pb.files.length === 1 ? "one file — a local slip" : `${pb.files.length} files — a pattern, fix it once`}</div>
                          </div>
                        );
                      })}
                      {/* ── ✏ BEYOND THE LINES — its own section: boxed comment LEFT, widget RIGHT ── */}
                      {sketches.length > 0 && <div style={{ position: "absolute", left: SKCM, top: TOPY - 26, fontFamily: mono, fontSize: 7, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>✏ beyond the lines</div>}
                      {sketches.map((s: any, si: number) => { const base = P2(`sk:${si}`, skBase[si].x, skBase[si].y); return (
                        <React.Fragment key={`skc${si}`}>
                          <div style={{ position: "absolute", left: base.x, top: base.y - 13, fontFamily: mono, fontSize: 8, color: conTone(s.a.score), display: "flex", gap: 6, alignItems: "baseline" }}>
                            <span>{s.ax} {s.a.score}</span>
                            <button data-card {...dragProps(`skz:${si}`, () => setNbZoom({ kind: "axis", s }))} title="expand — the full analysis" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: 0 }}>⤢</button>
                          </div>
                          <div data-card {...dragProps(`sk:${si}`, () => setNbZoom({ kind: "axis", s }))} style={{ position: "absolute", left: base.x, top: base.y, width: NW, border: `1px solid color-mix(in oklab, ${conTone(s.a.score)} 40%, ${C.border})`, borderRadius: 10, background: C.panel, padding: "8px 10px", boxSizing: "border-box", cursor: "pointer" }}>{s.el}</div>
                          <div data-card {...dragProps(`skc:${si}`)} style={{ position: "absolute", left: SKCM, top: base.y + 6, width: CMW2, border: `1px solid ${C.border}`, borderRadius: 9, background: C.panel2, padding: "5px 8px", transform: `rotate(${si % 2 ? 0.5 : -0.5}deg)`, fontFamily: mono, fontSize: 7.5, color: C.muted, lineHeight: 1.5, boxSizing: "border-box" }}>
                            ✎ {(s.plan.detail || `${s.ax} ${s.a.score}`).slice(0, 190)}
                          </div>
                        </React.Fragment>
                      ); })}
                      {/* ── the FILES the problems connect — circles beside them ── */}
                      {shownFiles.map((n: any) => <FileNode key={n.path} n={n} />)}
                    </div>
                  </div>
                  </div>
                  {/* ⤢ EXPAND MODE — one widget, fullscreen: complete information, examples, analysis */}
                  {nbZoom && (() => {
                    const Hunk = ({ v }: any) => v?.snippet?.length ? (
                      <div style={{ margin: "3px 0" }}>
                        <div style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>@@ L{v.snippet[0].ln}–{v.snippet[v.snippet.length - 1].ln}</div>
                        {v.snippet.map((row: any) => { const sick = row.ln === v.line; const sevT = SEV_TONE[v.severity] ?? C.warn; return (
                          <div key={row.ln} style={{ display: "flex", height: 16, background: sick ? `color-mix(in oklab, ${sevT} 9%, transparent)` : "transparent", borderRadius: 3 }}>
                            <span style={{ width: 30, flexShrink: 0, textAlign: "right", paddingRight: 7, fontFamily: mono, fontSize: 8.5, color: sick ? sevT : C.dim, lineHeight: "16px", userSelect: "none" }}>{row.ln}</span>
                            <code style={{ fontFamily: mono, fontSize: 9, color: sick ? C.fg : C.muted, whiteSpace: "pre", overflowX: "auto", padding: "0 6px", flex: 1, minWidth: 0, lineHeight: "16px" }}>{row.text}</code>
                          </div>
                        ); })}
                      </div>
                    ) : v?.evidence ? <code style={{ display: "block", fontFamily: mono, fontSize: 9, color: SEV_TONE[v.severity] ?? C.warn, margin: "2px 0" }}>{v.evidence}</code> : null;
                    const FileSection = ({ p, lawKey }: any) => {
                      const n2 = byPath.get(p);
                      if (!n2) return null;
                      const list = (n2.worst_list ?? []).filter((w: any) => !lawKey || w.law_key === lawKey);
                      return (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                            <b style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{n2.name}</b>
                            <b style={{ fontFamily: mono, fontSize: 11, color: toneOf(n2), fontVariantNumeric: "tabular-nums" }}>{n2.health ?? "—"}</b>
                            <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{p}</span>
                            <span style={{ flex: 1 }} />
                            {p !== con.path && <button onClick={() => { setNbZoom(null); void onNavigate(p); }} style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 45%, ${C.border})`, color: C.brand, borderRadius: 4, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: 8.5, flexShrink: 0 }}>↗ enter the file</button>}
                          </div>
                          {list.length ? list.map((v: any, i: number) => <Hunk key={i} v={v} />) : <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, fontStyle: "italic" }}>no line anchor recorded here — open the file review for the full picture</div>}
                        </div>
                      );
                    };
                    const z = nbZoom;
                    return (
                      <div onClick={() => setNbZoom(null)} style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,.6)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 22 }}>
                        <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1100px, 95vw)", maxHeight: "92vh", overflow: "auto", background: C.panel, border: `1px solid color-mix(in oklab, ${C.brand} 25%, ${C.border})`, borderRadius: 14, padding: "14px 20px" }}>
                          <div style={{ display: "flex", gap: 9, alignItems: "baseline", marginBottom: 6 }}>
                            {z.kind === "law" && (<><span style={{ fontFamily: mono, fontSize: 8.5, color: SEV_TONE[z.pb.severity] ?? C.warn, border: `1px solid ${SEV_TONE[z.pb.severity] ?? C.warn}`, borderRadius: 8, padding: "0 6px" }}>{z.pb.severity}</span><b style={{ fontFamily: mono, fontSize: 13, color: C.fg }}>{z.pb.title}</b><span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>−{z.pb.pen} · {z.pb.files.length} file{z.pb.files.length === 1 ? "" : "s"}</span></>)}
                            {z.kind === "axis" && (<><b style={{ fontFamily: mono, fontSize: 13, color: conTone(z.s.a.score) }}>✏ {z.s.ax} {z.s.a.score}</b><span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>beyond the lines — the structural review</span></>)}
                            {z.kind === "co" && <b style={{ fontFamily: mono, fontSize: 13, color: C.warn }}>⇠⇢ hidden coupling ×{z.pb.e.n}</b>}
                            {z.kind === "file" && (<><b style={{ fontFamily: mono, fontSize: 13, color: C.fg }}>{z.n.name}</b><b style={{ fontFamily: mono, fontSize: 14, color: toneOf(z.n), fontVariantNumeric: "tabular-nums" }}>{z.n.health ?? "—"}</b></>)}
                            <span style={{ flex: 1 }} />
                            <button onClick={() => setNbZoom(null)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>
                          </div>
                          {z.kind === "law" && (<>
                            {z.pb.fix && <div style={{ fontFamily: mono, fontSize: 10, color: C.ok, lineHeight: 1.55 }}>✎ {z.pb.fix}</div>}
                            <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, marginTop: 2 }}>{z.pb.files.length === 1 ? "one file — a local slip, not a house pattern" : `${z.pb.files.length} files — a pattern: the SAME fix applies at every arrow`}</div>
                            {z.pb.files.map(([p]: [string, number[]]) => <FileSection key={p} p={p} lawKey={z.pb.key} />)}
                          </>)}
                          {z.kind === "axis" && (<>
                            <div style={{ margin: "6px 0" }}>{z.s.el}</div>
                            <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.6 }}>✎ {z.s.plan.detail || "—"}</div>
                            {z.s.plan.example && <ExampleCols ex={z.s.plan.example} />}
                            {(z.s.plan.targets ?? []).slice(0, 10).map((t: Target, i: number) => (
                              <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: mono, fontSize: 9, padding: "1px 0", minWidth: 0 }}>
                                <span style={{ color: C.brand, flexShrink: 0 }}>{t.file ? t.file.split("/").pop() : t.line != null ? `L${t.line}` : "•"}</span>
                                <code style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{t.code ?? ""}</code>
                                <span style={{ color: C.dim, flexShrink: 0, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note ?? ""}</span>
                              </div>
                            ))}
                          </>)}
                          {z.kind === "co" && (<>
                            {(() => { const via = importPath(edgesAll.map((e: any) => ({ from: e.from, to: e.to, kind: e.kind })), z.pb.e.from, z.pb.e.to); return (
                              <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.6 }}>{via
                                ? <>These two files changed together in {z.pb.e.n} commits. They are not directly wired, but an import path exists — {via.map((p) => p.split("/").pop()).join(" → ")} — so the contract is declared, {via.length - 1} hops away. The question is whether the middle file should own that coupling, or whether the two ends should meet directly.</>
                                : <>These two files changed together in {z.pb.e.n} commits with NO import edge between them — a contract lives between them that no import declares. Make the dependency explicit, or merge the pieces that move together.</>}</div>
                            ); })()}
                            {/* ⌗twin-files — the invisible contract, drawn: synced change-ticks, a ghost line, no arrow */}
                            {(() => { const fA = String(z.pb.e.from).split("/").pop() ?? "a"; const fB = String(z.pb.e.to).split("/").pop() ?? "b"; return (
                              <div style={{ margin: "6px 0" }}>
                                <div style={{ display: "flex", gap: 6, alignItems: "baseline", fontFamily: mono, fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.8, color: C.warn }}>before — as it is<span style={{ flex: 1 }} /><WTag n="twin-files" /></div>
                                <svg viewBox="0 0 520 96" style={{ width: "100%", maxWidth: 560, display: "block" }}>
                                  <rect x={30} y={16} width={170} height={26} rx={7} fill="none" stroke={C.warn} strokeWidth="1.2" transform="rotate(-0.4 115 29)" />
                                  <text x={40} y={33} fill={C.fg} style={{ fontFamily: mono, fontSize: 8 }}>{fA.slice(0, 22)}</text>
                                  <rect x={320} y={16} width={170} height={26} rx={7} fill="none" stroke={C.warn} strokeWidth="1.2" transform="rotate(0.4 405 29)" />
                                  <text x={330} y={33} fill={C.fg} style={{ fontFamily: mono, fontSize: 8 }}>{fB.slice(0, 22)}</text>
                                  <path d="M 205 29 H 316" stroke={C.dim} strokeWidth="1" strokeDasharray="2 5" opacity="0.8" />
                                  <text x={214} y={24} fill={C.dim} style={{ fontFamily: mono, fontSize: 7 }}>the invisible contract — no import</text>
                                  {Array.from({ length: Math.min(Number(z.pb.e.n) || 6, 10) }, (_, i) => (<g key={i}>
                                    <path d={`M ${48 + i * 14} 54 v -${6 + ((i * 5) % 8)}`} stroke={C.warn} strokeWidth="1.1" strokeLinecap="round" />
                                    <path d={`M ${338 + i * 14} 54 v -${6 + ((i * 5) % 8)}`} stroke={C.warn} strokeWidth="1.1" strokeLinecap="round" />
                                  </g>))}
                                  <text x={30} y={70} fill={C.warn} style={{ fontFamily: mono, fontSize: 7.5 }}>the SAME ticks on both sides — ×{z.pb.e.n} commits touched both, yet nothing links them</text>
                                  <text x={30} y={86} fill={C.dim} style={{ fontFamily: mono, fontSize: 7.5 }}>whoever edits one must REMEMBER the other — memory is not a dependency system</text>
                                </svg>
                                <div style={{ display: "flex", gap: 6, alignItems: "baseline", fontFamily: mono, fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.8, color: C.ok, marginTop: 6 }}>after the fix<span style={{ flex: 1 }} /><WTag n="twin-files" /></div>
                                <svg viewBox="0 0 520 64" style={{ width: "100%", maxWidth: 560, display: "block" }}>
                                  <rect x={30} y={14} width={170} height={26} rx={7} fill="none" stroke={C.ok} strokeWidth="1.2" transform="rotate(-0.4 115 27)" />
                                  <text x={40} y={31} fill={C.fg} style={{ fontFamily: mono, fontSize: 8 }}>{fA.slice(0, 22)}</text>
                                  <rect x={320} y={14} width={170} height={26} rx={7} fill="none" stroke={C.ok} strokeWidth="1.2" transform="rotate(0.4 405 27)" />
                                  <text x={330} y={31} fill={C.fg} style={{ fontFamily: mono, fontSize: 8 }}>{fB.slice(0, 22)}</text>
                                  <path d="M 205 27 H 310" stroke={C.ok} strokeWidth="1.3" />
                                  <path d="M 310 27 l -7 -4 v 8 z" fill={C.ok} />
                                  <text x={214} y={22} fill={C.ok} style={{ fontFamily: mono, fontSize: 7 }}>✓ an explicit import — the contract is DECLARED</text>
                                  <text x={30} y={58} fill={C.dim} style={{ fontFamily: mono, fontSize: 7.5 }}>now the graph knows; a change on one side surfaces the other (or merge them into one module)</text>
                                </svg>
                              </div>
                            ); })()}
                            <FileSection p={z.pb.e.from} />
                            <FileSection p={z.pb.e.to} />
                          </>)}
                          {z.kind === "file" && (<>
                            {(z.n.worst_list ?? []).map((v: any, i: number) => (
                              <div key={i} style={{ marginTop: 8 }}>
                                <div style={{ display: "flex", gap: 6, alignItems: "baseline", fontFamily: mono, fontSize: 9.5 }}>
                                  <span style={{ color: SEV_TONE[v.severity] ?? C.warn }}>{v.severity}</span>
                                  <b style={{ color: C.fg }}>{v.title}</b>
                                  {v.line != null && <span style={{ color: C.dim }}>L{v.line}</span>}
                                </div>
                                {v.fix && <div style={{ fontFamily: mono, fontSize: 9, color: C.ok }}>✎ {v.fix}</div>}
                                <Hunk v={v} />
                              </div>
                            ))}
                            {(z.n.violations ?? 0) > (z.n.worst_list ?? []).length && <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginTop: 6 }}>+{z.n.violations - z.n.worst_list.length} more findings — enter the file for the complete review</div>}
                            {z.n.path !== con.path && <button onClick={() => { setNbZoom(null); void onNavigate(z.n.path); }} style={{ marginTop: 8, background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 45%, ${C.border})`, color: C.brand, borderRadius: 5, padding: "2px 10px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>↗ enter the file — the complete review</button>}
                          </>)}
                          <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, marginTop: 10 }}>deterministic · from the latest snapshot · ⤢ shows everything the canvas knows — “enter the file” opens the full review</div>
                        </div>
                      </div>
                    );
                  })()}
                  <div style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{nb.note} · the spine is the region's problems, worst first · circles open on click · ⤢ expands a widget fullscreen</div>
                </div>
              );
            })() : (<>
            <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, lineHeight: 1.6 }}>
              {codeScore != null && contextScore != null && codeScore - contextScore >= 12
                ? <>The <b style={{ color: conTone(codeScore) }}>code itself is {codeScore >= 80 ? "clean" : "decent"}</b> ({codeScore}) — the <b style={{ color: conTone(contextScore) }}>file's context drags it to {health}</b>: {lowContext.length ? lowContext.map((d, i) => { const actionable = concerns.some((c) => c.ax === d.ax); return <React.Fragment key={d.ax}>{i ? ", " : ""}<b style={{ color: conTone(d.s) }}>{d.ax} {d.s}</b>{actionable ? null : <span style={{ color: C.dim }}> (ranked, not broken)</span>}</React.Fragment>; }) : "no single axis"}. No block is "bad" — the FILE is {lowContext.filter((d) => concerns.some((c) => c.ax === d.ax)).map((d) => ({ tests: "untested", coupling: "coupled", change: "churny" } as Record<string, string>)[d.ax] ?? d.ax).join(" / ") || "ranked low against this repo, not broken"}.</>
                : lowCode.length
                  ? <>The code itself has real issues — {lowCode.map((d, i) => <React.Fragment key={d.ax}>{i ? ", " : ""}<b style={{ color: conTone(d.s) }}>{d.ax} {d.s}</b></React.Fragment>)} — and they decompose to the blocks in the editor.</>
                  : (lawGroups.length || weak.length) ? <>Health <b style={{ color: conTone(health) }}>{health}</b> — the findings below say exactly where the points went.</>
                  : <>Both the code and its context are solid — nothing to fix.</>}
            </div>

            {/* THE RATCHET — vs the previous snapshot: worse-than-last-time is its own finding */}
            {con.regression && (con.regression.new.length > 0 || con.regression.fixed.length > 0 || (con.regression.health_delta ?? 0) !== 0) && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline", fontFamily: mono, fontSize: 8.5, fontVariantNumeric: "tabular-nums" }}>
                <b style={{ color: con.regression.comparable === false ? C.muted : con.regression.regressed ? C.bad : C.ok }}>{con.regression.comparable === false ? `⟲ baseline reset — ${con.regression.laws_changed ? "the laws changed" : `the instrument changed (${con.regression.prev_engineering_version ?? "pre-versioned"} → ${con.engineering_version ?? "now"})`}; not comparable` : con.regression.regressed ? "↓ regressed since last review" : "↑ improved since last review"}</b>
                {con.regression.health_delta != null && con.regression.health_delta !== 0 && <span style={{ color: conTone(health) }}>health {con.regression.health_delta > 0 ? "+" : ""}{con.regression.health_delta}</span>}
                {con.regression.new.map((n) => <span key={n.law_key} style={{ color: C.bad }}>+{n.count} {n.law_key}{n.lines?.length ? ` (L${n.lines.join(" L")})` : ""}</span>)}
                {con.regression.fixed.map((f) => <span key={f.law_key} style={{ color: C.ok }}>−{f.count} {f.law_key}</span>)}
                <span style={{ color: C.dim }}>vs snapshot #{con.regression.prev_snapshot_id}</span>
              </div>
            )}

            {(lawGroups.length > 0 || weak.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
              {/* ⚖ left · 📊 right — one column each, a discrete rule between */}
              <div style={{ minWidth: 0, paddingRight: 12, borderRight: `1px solid ${C.border}` }}>
                <div style={{ ...sec, display: "flex", alignItems: "baseline", gap: 8 }}><span>⚖ law violations · {(con.violations ?? []).length}</span><span style={{ flex: 1 }} />
                  {lawGroups.length > 0 && !isFolder && <button onClick={() => void startFullPr()} disabled={!!spr?.loading} title="⛙ full PR — one AI pass over the whole file fixing every law violation at once; staged in an isolated worktree, you merge"
                    style={{ textTransform: "none", letterSpacing: 0, background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 40%, ${C.border})`, color: C.brand, borderRadius: 4, padding: "0 7px", cursor: "pointer", fontFamily: mono, fontSize: 8 }}>⛙ full PR · fix all</button>}
                </div>
                {!lawGroups.length && <span style={{ fontFamily: mono, fontSize: 9, color: C.ok, fontStyle: "italic" }}>none — obeys the constitution</span>}
                {spr && spr.lawKey === "__ALL__" && SprPanel()}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {lawGroups.map((lg) => { const sev = SEV_TONE[lg.severity] ?? C.warn; const peer = con.peers?.[lg.key]; return (
                    <div key={lg.key} style={{ minWidth: 0, gridColumn: spr && spr.lawKey === lg.key ? "1 / -1" : undefined }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                        <b style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{lg.title}</b>
                        {lg.count > 1 && <span style={{ fontFamily: mono, fontSize: 8.5, color: sev }}>×{lg.count}</span>}
                        <span style={{ fontFamily: mono, fontSize: 7.5, color: sev, border: `1px solid color-mix(in oklab, ${sev} 45%, ${C.border})`, borderRadius: 2, padding: "0 4px" }}>{lg.severity}</span>
                        <span style={{ flex: 1 }} />
                        <span title="what this costs the file's compliance" style={{ fontFamily: mono, fontSize: 8.5, color: sev, fontVariantNumeric: "tabular-nums" }}>−{lg.penalty}</span>
                      </div>
                      {lg.rule_md && <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>{lg.rule_md}</div>}
                      {/* THE SICK LINES — the exact offending code, from the real source */}
                      <div style={{ marginTop: 4 }}>
                        {lg.insts.map((ins: any, j: number) => (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 0, marginTop: j ? 1 : 0, fontFamily: mono, fontSize: 8.5 }}>
                            <span style={{ color: C.dim, width: isFolder ? 120 : 36, flexShrink: 0, textAlign: "right", paddingRight: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isFolder && ins.path ? `${String(ins.path).split("/").pop()} ` : ""}{ins.line != null ? `L${ins.line}` : "file"}</span>
                            <code style={{ color: sev, overflowX: "auto", whiteSpace: "pre", flex: 1, minWidth: 0 }}>{ins.line != null && srcLines?.[ins.line - 1] != null ? srcLines[ins.line - 1].trim() : (ins.evidence ?? "(file-level — no single line)")}</code>
                            {ins.line != null && !isFolder && <button onClick={() => void startShortPr(lg, ins.line)} disabled={!!spr?.loading} title="⚡ short PR — the AI proposes the fix, stages it in an isolated worktree, you merge. Inline, no ceremony."
                              style={{ marginLeft: 4, background: "transparent", border: `1px solid color-mix(in oklab, ${C.brand} 45%, ${C.border})`, color: C.brand, borderRadius: 4, padding: "0 6px", cursor: "pointer", fontFamily: mono, fontSize: 8, flexShrink: 0 }}>⚡ fix</button>}
                          </div>
                        ))}
                        {lg.count > lg.insts.length && <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, marginTop: 1, paddingLeft: 42 }}>+{lg.count - lg.insts.length} more</div>}
                      </div>
                      {/* BEFORE → AFTER — the same 2-column comparison as everywhere else */}
                      {lg.example && <ExampleCols ex={lg.example} />}
                      {lg.fix && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.ok, lineHeight: 1.5, marginTop: 4 }}>✎ {lg.fix}</div>}
                      {/* THE COHORT — the same law elsewhere: a local slip or a house-wide pattern? */}
                      <div style={{ fontFamily: mono, fontSize: 8.5, color: peer?.files ? C.muted : C.dim, marginTop: 3 }}>
                        {peer?.files
                          ? <>also breaks in <b style={{ color: C.warn }}>{peer.files}</b> other file{peer.files === 1 ? "" : "s"}: {peer.top.map((t) => `${t.path.split("/").pop()}${t.n > 1 ? ` ×${t.n}` : ""}`).join(" · ")}{peer.files > peer.top.length ? " · …" : ""} — a house-wide pattern, fix the worst first</>
                          : <>only this file breaks it — a local slip, not a house pattern</>}
                      </div>
                      {/* ⚡ THE SHORT PR — inline: propose → worktree stage → gated merge */}
                      {spr && spr.lawKey === lg.key && SprPanel()}
                    </div>
                  ); })}
                </div>
              </div>
              <div style={{ minWidth: 0, paddingLeft: 12 }}>
                <div style={sec}>📊 engineering findings · the weak axes</div>
                {!weak.length && <span style={{ fontFamily: mono, fontSize: 9, color: C.ok, fontStyle: "italic" }}>every measured axis is healthy</span>}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {weak.map(({ ax, a }) => { const ap = axisPlan(ax, a);
                    if (ap.merged) return null; // folded into another finding (change → tests)
                    if (!ap.targets.length && !ap.example) return ( // DEMOTED — no code anchor, no finding slot
                      <div key={ax} style={{ fontFamily: mono, fontSize: 8, color: C.dim, minWidth: 0 }}>📊 {ax} {a.score} — {ap.detail || "no line-level anchor"} <span style={{ fontStyle: "italic" }}>(context note)</span></div>
                    );
                    return (
                    <div key={ax} style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
                        <b style={{ fontFamily: mono, fontSize: 9.5, color: C.fg }}>{ax}</b>
                        <b style={{ fontFamily: mono, fontSize: 9.5, color: conTone(a.score), fontVariantNumeric: "tabular-nums" }}>{a.score}</b>
                        {a.parts && <span style={{ fontFamily: mono, fontSize: 7, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{partsStr(a.parts)}</span>}
                        {(() => { // the metric TIMELINE — this axis across snapshots (from stored history)
                          const hs = (con.history ?? []).map((h) => h.axes?.[ax]).filter((v): v is number => v != null);
                          if (hs.length < 2) return null;
                          const w2 = 54, h2 = 12, lo = Math.min(...hs), hi2 = Math.max(...hs), sp = Math.max(1, hi2 - lo);
                          return <svg width={w2} height={h2} style={{ flexShrink: 0 }} aria-label={`${ax} across snapshots: ${hs.join(" → ")}`}><polyline points={hs.map((v, i) => `${(i / (hs.length - 1)) * (w2 - 2) + 1},${h2 - 2 - ((v - lo) / sp) * (h2 - 4)}`).join(" ")} fill="none" stroke={conTone(a.score)} strokeWidth="1" /></svg>;
                        })()}
                      </div>
                      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, lineHeight: 1.5, marginTop: 1 }}>✎ {ap.detail}</div>
                      {ap.targets.slice(0, 3).map((t: Target, j: number) => (
                        <div key={j} style={{ display: "flex", gap: 4, alignItems: "baseline", fontFamily: mono, fontSize: 8, marginTop: j ? 1 : 2, minWidth: 0 }}>
                          <span style={{ color: C.brand, flexShrink: 0 }}>{t.file ? t.file.split("/").pop() : t.line != null ? `L${t.line}` : "•"}</span>
                          <code style={{ color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{t.code ?? t.note}</code>
                        </div>
                      ))}
                      {ap.example && (
                        <div style={{ marginTop: 2 }}>
                          <ExampleCols ex={ap.example} />
                        </div>
                      )}
                    </div>
                  ); })}
                </div>
              </div>
            </div>
            )}

            <div style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>deterministic review · the atlas, git history + the bench ledger · $0 · gains are estimates from the axis weights</div>
            </>)}
            {/* THE MERGED CODE REVIEW (operator 2026-09-18): under the annotated review, the other lenses of the same file */}
            {view === "review" && !isFolder && (<>
              <div data-testid="review-section-beyond" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim, marginBottom: 8 }}>📊 beyond the lines — why the score is what it is</div>
                {beyondEl}
              </div>
              <div data-testid="review-section-history" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim, marginBottom: 8 }}>≋ history review — the review over the snapshots</div>
                <FileReviewHistoryTab path={con.path ?? ""} />
              </div>
            </>)}
            </div>
          </div>

          {/* ── THE STATS — discrete, sidebar right (⚙ data only) ── */}
          {showAside && (
          <aside style={{ padding: "13px 12px", display: "flex", flexDirection: "column", gap: 10, background: C.bg }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <b style={{ fontFamily: mono, fontSize: 20, color: conTone(health), fontVariantNumeric: "tabular-nums" }}>{health}</b>
                <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>health · compliance {con.score}</span>
              </div>
              {con.archetype && con.archetype !== "logic" && <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 2, padding: "0 4px" }}>{con.archetype}</span>}
            </div>
            <div>
              <div style={sec}>⚖ law-based</div>
              <Mini ax="compliance" />
              {(con.categories ?? []).length > 0 && (
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 3 }}>
                  {con.categories!.map((c) => <span key={c.category} title={`${c.violations} violation(s)`} style={{ fontFamily: mono, fontSize: 7, color: conTone(c.score), border: `1px solid color-mix(in oklab, ${conTone(c.score)} 40%, ${C.border})`, borderRadius: 2, padding: "0 3px" }}>{c.category} {c.score}</span>)}
                </div>
              )}
            </div>
            <div>
              <div style={sec}>📊 measured</div>
              {AXES.filter((ax) => ax !== "compliance").map((ax) => <Mini key={ax} ax={ax} />)}
            </div>
            <div>
              <div style={sec}>signals</div>
              <SRow k="loc" v={g.loc ?? "—"} /><SRow k="complexity" v={g.complexity ?? "—"} /><SRow k="fan-in" v={g.fan_in ?? "—"} /><SRow k="fan-out" v={g.fan_out ?? "—"} />
              <SRow k="transitive" v={g.transitive ?? "—"} /><SRow k="covered" v={g.covered == null ? "—" : g.covered ? "yes" : "no"} /><SRow k="churn" v={g.churn ?? "—"} /><SRow k="authors" v={g.authors ?? "—"} />
            </div>
            <div>
              <div style={sec}>neighborhood</div>
              <SRow k="vs repo" v={con.neighborhood?.pct_repo != null ? `${ordinal(Math.round(con.neighborhood.pct_repo * 100))} pct` : "—"} />
              <SRow k="vs folder" v={con.neighborhood?.pct_folder != null ? `${ordinal(Math.round(con.neighborhood.pct_folder * 100))} pct` : "—"} />
            </div>
            {(con.history ?? []).filter((h) => h.health != null).length >= 2 && (() => {
              const pts = con.history!.filter((h) => h.health != null).map((h) => h.health!) as number[];
              const w = 180, hh = 26, lo = Math.min(...pts), hi = Math.max(...pts), span = Math.max(1, hi - lo);
              const xy = pts.map((v, i) => `${(i / (pts.length - 1)) * (w - 4) + 2},${hh - 3 - ((v - lo) / span) * (hh - 6)}`).join(" ");
              const delta = pts[pts.length - 1] - pts[0];
              return (
                <div>
                  <div style={sec}>trend · {pts.length} snapshot{pts.length === 1 ? "" : "s"}</div>
                  <svg width={w} height={hh} style={{ display: "block" }}><polyline points={xy} fill="none" stroke={conTone(pts[pts.length - 1])} strokeWidth={1.5} /></svg>
                  <div style={{ fontFamily: mono, fontSize: 8, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{pts[0]} → {pts[pts.length - 1]} <span style={{ color: delta > 0 ? C.ok : delta < 0 ? C.bad : C.dim }}>{delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "="}</span></div>
                </div>
              );
            })()}
            {plan.length > 0 && (
              <div>
                <div style={sec}>projection</div>
                <SRow k="now" v={health} />
                <SRow k="plan lands" v={`≈ ${Math.min(100, health + plan.reduce((a, p) => a + p.gain, 0))}`} />
              </div>
            )}
            <div style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, marginTop: "auto" }}>code {codeScore ?? "—"} · context {contextScore ?? "—"}</div>
          </aside>
          )}
        </div>
  );
}

// THE FILE OVERVIEW — the snapshot doc atop every file's docs (moved out of the
// constitution sidebar, which is now the control-center). Deterministic, $0.
export function FileConstitutionOverview({ con }: { con: FileCon | null }) {
  const [modal, setModal] = React.useState<FileCon | null>(null); // the payload under review — the file itself OR its folder
  const [patterns, setPatterns] = React.useState<{ pattern: string; confidence: string; evidence: string }[] | null>(null);
  const cpath = con?.found ? con.path : null;
  React.useEffect(() => {
    if (!cpath) { setPatterns(null); return; }
    let alive = true;
    (async () => { try { const r: any = await apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.patterns", input: { path: cpath } }); const d = r?.result?.result ?? r?.result ?? r; if (alive) setPatterns(d?.patterns ?? []); } catch { if (alive) setPatterns([]); } })();
    return () => { alive = false; };
  }, [cpath]);
  if (!con?.found) return null;
  const g = con.signals ?? {};
  const health = con.health ?? 100;
  const codeScore = groupScore(con, "code");
  const contextScore = groupScore(con, "context");
  const drags = CONTEXT_AXES.concat(CODE_AXES as any).map((ax) => ({ ax, s: con.axes?.[ax]?.score })).filter((x) => x.s != null && x.s < health).sort((a, b) => (a.s! - b.s!)).slice(0, 4);
  const gap = codeScore != null && contextScore != null && codeScore - contextScore >= 12;
  return (
    <div style={{ border: `1px solid color-mix(in oklab, ${conTone(con.health)} 45%, ${C.border})`, background: `color-mix(in oklab, ${conTone(con.health)} 5%, ${C.panel2})`, borderRadius: 6, padding: "8px 11px", margin: "0 0 8px" }}>
      {modal && <FileScoreModal con={modal} onClose={() => setModal(null)} />}
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontFamily: mono, fontSize: 9, color: C.brand }}>§ file snapshot</span>
        <button onClick={() => setModal(con)} title="click for the full review — why this score, the sick lines, the fix plan" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: mono, fontSize: 19, fontWeight: 700, color: conTone(con.health), fontVariantNumeric: "tabular-nums", textDecoration: "underline dotted", textUnderlineOffset: 3 }}>{con.health ?? "—"}</button>
        <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>health · compliance {con.score} · repo {pctTxt(con.neighborhood?.pct_repo)} pct</span>
        {con.archetype && con.archetype !== "logic" && <span title={con.archetype === "glue" ? "a re-export / constants / types file — scored only on laws + defects (tests/coupling don't apply to glue)" : con.archetype} style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 2, padding: "0 4px" }}>{con.archetype}</span>}
        <span style={{ flex: 1 }} />
        <button onClick={async () => { const dir = (con.path ?? "").split("/").slice(0, -1).join("/"); if (!dir) return; const fc = await fetchFileCon(dir); if (fc) setModal(fc); }}
          title="review the whole FOLDER — every member file aggregated into one review" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 8, padding: "0 6px" }}>📁 folder</button>
        <ScoringGuideButton compact />
      </div>
      {/* WHY the score is what it is — split into the CODE (decomposes to blocks) and the FILE CONTEXT (whole-file) */}
      {health < 95 && (
        <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, marginBottom: 7, lineHeight: 1.6, paddingLeft: 8, borderLeft: `2px solid color-mix(in oklab, ${conTone(health)} 50%, ${C.border})` }}>
          {gap
            ? <>The <b style={{ color: conTone(codeScore) }}>code is {codeScore! >= 80 ? "clean" : "decent"}</b> ({codeScore}) — that's why the blocks read high — but the <b style={{ color: conTone(contextScore) }}>file's context</b> ({contextScore}) pulls it to <b style={{ color: conTone(health) }}>{health}</b>: </>
            : <>The <b style={{ color: conTone(health) }}>{health}</b> is the blend of code ({codeScore ?? "—"}) + context ({contextScore ?? "—"}), held down by </>}
          {drags.length ? drags.map((d, i) => <React.Fragment key={d.ax}>{i ? " · " : ""}<b style={{ color: conTone(d.s) }}>{d.ax} {d.s}</b></React.Fragment>) : "no single axis"}. <button onClick={() => setModal(con)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: mono, fontSize: 8.5, color: C.brand, textDecoration: "underline" }}>see the full review →</button>
        </div>
      )}
      {/* the TWO KINDS of axis, transparent — law-based (the constitution, decomposes into concerns) vs measured */}
      <div style={{ marginBottom: 5 }}>
        <div style={{ fontFamily: mono, fontSize: 7, color: C.brand, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 1 }}>⚖ law-based — the constitution</div>
        <AxisRow ax="compliance" score={con.axes?.compliance?.score ?? null} />
        {(con.categories ?? []).length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "3px 0 0 72px" }}>
            {con.categories!.map((c) => <span key={c.category} title={`${c.category} compliance ${c.score} · ${c.violations} violation(s)`} style={{ fontFamily: mono, fontSize: 7.5, color: catTone(c.score), border: `1px solid color-mix(in oklab, ${catTone(c.score)} 40%, ${C.border})`, borderRadius: 3, padding: "0 4px" }}>{c.category} {c.score}</span>)}
          </div>
        )}
      </div>
      <div style={{ fontFamily: mono, fontSize: 7, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 1 }}>📊 measured — atlas · git · bench</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px 14px" }}>
        {AXES.filter((ax) => AXIS_KIND[ax] === "measured").map((ax) => <AxisRow key={ax} ax={ax} score={con.axes?.[ax]?.score ?? null} />)}
      </div>
      <div style={{ fontFamily: mono, fontSize: 8, color: C.muted, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
        loc {g.loc ?? "—"} · cx {g.complexity ?? "—"} · fan-in {g.fan_in ?? "—"} · fan-out {g.fan_out ?? "—"} · transitive {g.transitive ?? "—"} · covered {g.covered == null ? "—" : g.covered ? "yes" : "no"} · churn {g.churn ?? "—"} · authors {g.authors ?? "—"}
      </div>
      {(con.violations ?? []).length > 0 && (
        <div style={{ fontFamily: mono, fontSize: 8, color: C.warn, marginTop: 4 }}>
          {con.violations!.length} violation{con.violations!.length === 1 ? "" : "s"} — see the blocks below (each carries the laws it breaks).
        </div>
      )}
      {/* DESIGN PATTERNS this file uses — deterministic (code-patterns · detectFilePatterns), informational */}
      {patterns && patterns.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginTop: 5 }}>
          <span style={{ fontFamily: mono, fontSize: 7, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8 }}>◇ patterns</span>
          {patterns.map((p, i) => <span key={i} title={`${p.confidence} confidence · ${p.evidence}`} style={{ fontFamily: mono, fontSize: 7.5, color: p.confidence === "high" ? C.ok : p.confidence === "medium" ? C.brand : C.dim, border: `1px solid ${C.border}`, borderRadius: 3, padding: "0 4px" }}>{p.pattern}</span>)}
        </div>
      )}
    </div>
  );
}
// the per-block line inside a doc-card — SELF (the block alone) and, when the block
// interacts, its NEIGHBORHOOD score (interaction outranks isolation: final = 0.4/0.6).
function BlockConLine({ d, con, nb }: { d: Decorator; con?: BlockCon; nb?: NbBlock }) {
  const a = blockAxes(d, con);
  const violations = con?.violations ?? [];
  const cause = a.structure != null && a.structure < 65 ? "complexity" : null;
  const axPart = (k: string, v: number | null) => v == null ? null : <span key={k} style={{ color: C.dim }}>{k} <b style={{ color: conTone(v) }}>{v}</b></span>;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
      <span style={{ fontFamily: mono, fontSize: 8, color: C.brand, textTransform: "uppercase", letterSpacing: 0.5 }}>§ block</span>
      <b style={{ fontFamily: mono, fontSize: 10, color: conTone(nb?.final ?? a.health), fontVariantNumeric: "tabular-nums" }} title={nb?.neigh != null ? "the block IN CONTEXT — 0.4×self + 0.6×neighborhood (interaction outranks isolation)" : "block score — this function/class scored in isolation on its code axes (compliance · structure)"}>{nb?.final ?? a.health}</b>
      {nb?.neigh != null && (
        <span title={`self ${nb.self} (the block alone) · neighborhood ${nb.neigh} (the mean of the ${nb.in + nb.out} block(s) it exchanges with${nb.cyc ? " — in an intra-file CYCLE, −15" : ""})`}
          style={{ fontFamily: mono, fontSize: 8, color: C.dim, fontVariantNumeric: "tabular-nums" }}>self {nb.self} · nbhd <b style={{ color: conTone(nb.neigh) }}>{nb.neigh}</b>{nb.cyc ? <span style={{ color: C.warn }}> ⟳</span> : null}</span>
      )}
      <span style={{ display: "flex", gap: 7, fontFamily: mono, fontSize: 8.5 }}>
        {axPart("compliance", a.compliance)}{axPart("structure", a.structure)}
        {a.cx != null && <span style={{ color: C.muted }}>cx {a.cx}</span>}
      </span>
      {violations.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {violations.slice(0, 6).map((v, i) => (
            <span key={i} title={`${v.title ?? v.law_key} · ${v.severity}${v.fix ? `\n✎ fix: ${v.fix}` : ""}`} style={{ fontFamily: mono, fontSize: 8.5, color: SEV_TONE[v.severity] ?? C.warn, border: `1px solid color-mix(in oklab, ${SEV_TONE[v.severity] ?? C.warn} 45%, ${C.border})`, borderRadius: 3, padding: "0 4px" }}>{v.law_key}{v.line != null ? `:${v.line}` : ""}</span>
          ))}
        </div>
      )}
      {!violations.length && (cause
        ? <span style={{ fontFamily: mono, fontSize: 8.5, color: C.warn }}>obeys the laws — held down by {cause}</span>
        : <span style={{ fontFamily: mono, fontSize: 8.5, color: C.ok }}>clean</span>)}
    </div>
  );
}

const KIND_ICON: Record<string, string> = {
  component: "⬡", hook: "⎈", function: "ƒ", class: "◆", method: "◇", getter: "◇", setter: "◇",
  interface: "⬚", enum: "≣", type: "τ", const: "▪",
};
// role hues — aligned with the diagram's role colors (ui=ember · state=violet · data=cyan · logic=dim · external=muted · type=steel)
const ROLE_COLOR: Record<string, string> = {
  ui: "oklch(0.64 0.11 38)", state: "oklch(0.72 0.13 300)", data: "oklch(0.72 0.12 200)",
  logic: "oklch(0.74 0.02 250)", external: "oklch(0.6 0.02 250)", type: "oklch(0.66 0.05 250)",
};
const roleColor = (r: string) => ROLE_COLOR[r] ?? C.dim;
// logic-trace step colors — branches amber, loops ember, returns green, throws red, callbacks (fn) violet, the rest dim
const STEP_COLOR: Record<string, string> = {
  branch: "oklch(0.78 0.12 80)", switch: "oklch(0.78 0.12 80)", case: "oklch(0.7 0.08 80)",
  loop: "oklch(0.64 0.11 38)", return: "oklch(0.74 0.13 150)", throw: "oklch(0.68 0.16 25)",
  catch: "oklch(0.68 0.16 25)", try: C.muted, finally: C.muted, set: C.dim, do: C.fg,
  fn: "oklch(0.72 0.13 300)",
};
const blockSnippet = (source: string, d: Decorator) => source.split("\n").slice(Math.max(0, d.line - 1), d.end_line ?? d.line).join("\n");

function Chips({ label, items, color }: { label: string; items: string[]; color?: string }) {
  if (!items?.length) return null;
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "baseline", flexWrap: "wrap", marginTop: 2 }}>
      <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, minWidth: 34 }}>{label}</span>
      {items.map((s, i) => (
        <span key={i} style={{ fontFamily: mono, fontSize: 9.5, color: color ?? C.dim, border: `1px solid ${C.border}`, borderRadius: 3, padding: "0 4px", background: C.bg }}>{s}</span>
      ))}
    </div>
  );
}

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 1 }}>
    <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, minWidth: 34 }}>{k}</span>
    <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{children}</span>
  </div>
);

// The full doc-card for one block. `source` (optional) lets [explain] slice the snippet locally; else it
// lazily reads the file. Deterministic content always renders; explain is opt-in.
export function DecoratorCard({ d, path, source, con, conActive, nb }: { d: Decorator; path: string; source?: string | null; con?: BlockCon; conActive?: boolean; nb?: NbBlock }) {
  const [exp, setExp] = React.useState<{ loading?: boolean; text?: string; err?: string } | null>(null);
  const col = roleColor(d.role);
  async function explain() {
    setExp({ loading: true });
    let src = source;
    if (src == null) { const s = await fileRead({ path }); src = s?.content ?? ""; }
    const snippet = blockSnippet(src, d);
    const r = await explainSnippet({ snippet, path, lines: `L${d.line}` });
    setExp(r?.ok && r.explanation ? { text: r.explanation } : { err: r?.error ?? "explain unavailable (provider / key)" });
  }
  return (
    <div style={{ borderLeft: `2px solid ${col}`, background: C.panel2, borderRadius: 4, padding: "5px 9px", margin: "1px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ color: col, fontSize: 12 }}>{KIND_ICON[d.kind] ?? "▪"}</span>
        <code style={{ fontFamily: mono, fontSize: 11, color: C.fg, fontWeight: 600 }}>{d.signature}</code>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: mono, fontSize: 8.5, color: col, textTransform: "uppercase", letterSpacing: 0.5 }}>{d.role}</span>
        <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>L{d.line}</span>
      </div>
      <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 3, lineHeight: 1.45 }}>{d.summary}</div>
      {d.inputs?.length ? <Row k="in">{d.inputs.map((i) => i.name).join(", ")}</Row> : null}
      {d.output?.label && d.output.label !== "void" ? <Row k="out">{d.output.label}</Row> : null}
      {/* the LOGIC TRACE — the deterministic narration of what the body does (branches/loops/sets/returns) */}
      {d.steps?.length ? (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 1 }}>logic</div>
          {d.steps.map((s, i) => (
            <div key={i} title={s.kind} style={{ fontFamily: mono, fontSize: 9.5, lineHeight: 1.5, paddingLeft: 6 + s.depth * 13, color: STEP_COLOR[s.kind] ?? C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.text}</div>
          ))}
        </div>
      ) : null}
      <Chips label="calls" items={d.calls} />
      <Chips label="uses" items={d.uses} color={C.brand} />
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3, alignItems: "center" }}>
        {d.flags.map((f) => <span key={f} style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 3, padding: "0 4px" }}>{f}</span>)}
        <span style={{ fontFamily: mono, fontSize: 8.5, color: d.complexity > 6 ? C.warn : C.muted }}>cx {d.complexity}</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => void explain()} disabled={exp?.loading}
          style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 3, cursor: exp?.loading ? "wait" : "pointer", background: C.bg, border: `1px solid ${C.border}`, color: exp?.loading ? C.muted : col }}>
          {exp?.loading ? "explaining…" : "✦ explain"}
        </button>
      </div>
      {conActive && <BlockConLine d={d} con={con} nb={nb} />}
      {(exp?.text || exp?.err) && (
        <div style={{ marginTop: 5, padding: "5px 7px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 10, color: exp?.text ? C.fg : C.muted, fontFamily: exp?.text ? undefined : mono, lineHeight: 1.45 }}>{exp?.text ?? exp?.err}</div>
      )}
    </div>
  );
}

// Collapsible strip for the editor overlay: a slim one-liner that expands to the full card on click.
export function DecoratorStrip({ d, path, source, con, conActive, nb }: { d: Decorator; path: string; source?: string | null; con?: BlockCon; conActive?: boolean; nb?: NbBlock }) {
  const [open, setOpen] = React.useState(false);
  const col = roleColor(d.role);
  if (open) return <div style={{ margin: "2px 0 2px 56px" }}><div onClick={() => setOpen(false)} style={{ cursor: "pointer" }}><DecoratorCard d={d} path={path} source={source} con={con} conActive={conActive} nb={nb} /></div></div>;
  // when a snapshot exists, a compact § badge carries the BLOCK's own score (code axes, in isolation).
  const a = conActive ? blockAxes(d, con) : null;
  return (
    <div onClick={() => setOpen(true)} title="click to expand the doc-card"
      style={{ margin: "2px 0 0 56px", display: "flex", alignItems: "baseline", gap: 6, cursor: "pointer", borderLeft: `2px solid ${col}`, paddingLeft: 7, opacity: 0.92 }}>
      <span style={{ color: col, fontSize: 10 }}>{KIND_ICON[d.kind] ?? "▪"}</span>
      <code style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, fontWeight: 600 }}>{d.name}</code>
      <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>— {d.summary}</span>
      {a != null && <span title={`block score ${a.health} — compliance ${a.compliance}${a.structure != null ? ` · structure ${a.structure}` : ""}${con ? ` · breaks ${con.violations.length} law(s)` : ""}`} style={{ fontFamily: mono, fontSize: 8, color: conTone(a.health), border: `1px solid color-mix(in oklab, ${conTone(a.health)} 45%, ${C.border})`, borderRadius: 3, padding: "0 4px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>§ {a.health}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DocsView — the ACTIVE FILE's documentation (live decorators). The whole-codebase docs are the ⛶ expand site.
// the docs DASHBOARD rides the tab itself when no file is selected (operator 2026-07-27) — the
// SAME Dashboard the ⛶ site shows, on the shared per-origin cache: whichever surface loads first
// pays the build; the other opens instantly.
function DocsDashboardPane({ origin }: { origin: string }) {
  const [site, setSite] = React.useState<any | null>(null);
  const [state, setState] = React.useState<"loading" | "failed" | "ok">("loading");
  const [atlas, setAtlas] = React.useState<any>(null);
  const loadSite = React.useCallback((force: boolean) => {
    setState("loading");
    void getDocsSiteCached(origin, force).then((s0) => { setSite(s0); setState(s0?.found ? "ok" : "failed"); });
  }, [origin]);
  React.useEffect(() => {
    loadSite(false);
    let on = true;
    void getAtlas({}).then((a: any) => { if (on) setAtlas(a); }).catch(() => { /* graph optional */ });
    return () => { on = false; };
  }, [loadSite]);
  if (state === "loading") return <div style={{ padding: 14, fontFamily: mono, fontSize: 11, color: C.muted }}>building the docs dashboard…</div>;
  if (state === "failed") return (
    <div style={{ padding: 14, fontFamily: mono, fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
      the documentation payload didn't arrive — a big site can run long or exceed the transport (this is NOT missing docs).
      <button onClick={() => loadSite(true)} style={{ marginLeft: 8, fontFamily: mono, fontSize: 10, padding: "2px 10px", borderRadius: 4, cursor: "pointer", background: C.bg, border: `1px solid ${C.border}`, color: C.brand }}>↻ retry</button>
    </div>
  );
  return <div style={{ padding: "10px 14px" }}><DocsSiteDashboard site={site} origin={origin} atlas={atlas} /></div>;
}

export function DocsView({ origin = "atlas", path = null }: { origin?: string; path?: string | null }) {
  const [decs, setDecs] = React.useState<any[] | null>(null);
  const [fileCon, setFileCon] = React.useState<FileCon | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [siteOpen, setSiteOpen] = React.useState(false);
  React.useEffect(() => {
    if (!path) { setDecs(null); setFileCon(null); return; }
    let alive = true; setLoading(true); setFileCon(null);
    decorateFile({ path }).then((r: any) => { if (alive) setDecs(r?.ok ? (r.decorators ?? []) : []); }).finally(() => { if (alive) setLoading(false); });
    fetchFileCon(path).then((c) => { if (alive) setFileCon(c); });
    return () => { alive = false; };
  }, [path]);
  const conByLine = React.useMemo(() => bucketConstitution((decs ?? []) as Decorator[], fileCon), [decs, fileCon]);
  const nbByLine = React.useMemo(() => new Map((fileCon?.blocks ?? []).map((b) => [b.line, b])), [fileCon]);
  const conActive = !!fileCon?.found;
  const ql = q.trim().toLowerCase();
  const shown = (decs ?? []).filter((d: any) => !ql || d.name?.toLowerCase().includes(ql) || d.summary?.toLowerCase().includes(ql));
  const fileName = path ? (path.split(/[\\/]/).pop() || path) : null;
  return (
    <div style={{ height: "100%", overflow: "auto", background: C.bg }}>
      <div style={{ position: "sticky", top: 0, background: C.panel2, borderBottom: `1px solid ${C.border}`, padding: "6px 12px", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: mono, fontSize: 10, color: C.dim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path ? `${fileName} · ${decs?.length ?? 0} blocks` : "documentation · the dashboard"}</span>
          <button onClick={() => setSiteOpen(true)} title="open the full codebase documentation — dashboard, folder + file pages, cross-links, AI overview"
            style={{ fontFamily: mono, fontSize: 10, padding: "2px 8px", borderRadius: 4, cursor: "pointer", background: C.bg, border: `1px solid ${C.border}`, color: C.fg }}>⛶ expand</button>
        </div>
        {path ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter blocks…"
              style={{ flex: 1, fontFamily: mono, fontSize: 10, padding: "2px 6px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.fg }} />
          </div>
        ) : null}
      </div>
      {!path ? (
        <DocsDashboardPane origin={origin} />
      ) : loading ? (
        <div style={{ padding: 14, fontFamily: mono, fontSize: 11, color: C.muted }}>loading…</div>
      ) : !shown.length ? (
        <div style={{ padding: 14, fontFamily: mono, fontSize: 11, color: C.muted }}>No documented blocks in this file{ql ? " match the filter" : ""}.</div>
      ) : (
        <div style={{ padding: "8px 10px" }}>
          {/* the sidebar docs carries JUST the snapshot (operator 2026-07-18) — the full
              review lives in the modal (click the health) and in the ⛶ expanded docs site. */}
          <FileConstitutionOverview con={fileCon} />
          {shown.map((d: any, i: number) => <DecoratorCard key={i} d={d} path={path} con={conByLine.get(d.line)} conActive={conActive} nb={nbByLine.get(d.line)} />)}
        </div>
      )}
      {siteOpen && <DocsSiteOverlay origin={origin} onClose={() => setSiteOpen(false)} />}
    </div>
  );
}
