// Blueprint tab (pipeline v2) — the TL's design rendered as a block diagram:
//   each top-level file block → a glowing NUCLEUS circle; its child code blocks
//   orbit on a ring (filled = authored, hollow = pending); typed I/O bindings
//   are curved BINDINGS from one file block's child to another's.
// Deterministic layout: file blocks flow left→right by binding dependency (longest
// path layering); child blocks sit at even angles on each nucleus's orbit. A
// full-screen overlay (⤢, like the workflow Eye) gives big designs room.
import * as React from "react";
import { C, mono } from "@/loki/theme";
import { Empty } from "@/loki/waterfall/shared";
import { usePoll } from "@/loki/api/hooks";
import { getBlueprint, describeBlueprint, type Blueprint, type Block, type BlueprintJudgment, type StubFile, type CourtClaim } from "@/loki/api/blueprint";
import { getAtlas, fileRead, type AtlasResponse } from "@/loki/api/codebase";
import { AtlasGraphMini } from "@/loki/codebase/atlas-graph";
import { Box, Maximize2, X as XIcon } from "lucide-react";
import { DiagramWidget, DiffWidget } from "@/loki/widgets/view-widgets";

// Blueprint structure view: the WHOLE codebase (the atlas graph + folder zones) with the design's
// touched files highlighted (added=green, changed=amber, the rest dimmed). The added files (not yet in
// the atlas) are injected as nodes; the file-level status comes from the planned delta.
export function fileStatusMap(mol: Blueprint): Record<string, string> {
  const planned = mol.planned_nodes ?? [];
  const byId = mol.delta?.by_id ?? {};
  const out: Record<string, string> = {};
  for (const f of planned) {
    if (f.type !== "file") continue;
    const path = (f.path ?? f.id) as string;
    const own = byId[f.id];
    const kids = planned.filter((n) => n.type !== "file" && n.path === path).map((n) => byId[n.id]);
    out[path] = own === "added" ? "added" : (kids.some((s) => s === "added" || s === "changed") ? "changed" : "touched");
  }
  return out;
}
export function mergeAtlas(atlas: AtlasResponse, mol: Blueprint): AtlasResponse {
  const planned = mol.planned_nodes ?? [];
  const existing = new Set(atlas.nodes.map((n) => n.id));
  const addNodes = planned.filter((n) => n.type === "file" && !existing.has(n.id)).map((n) => ({ id: n.id, path: (n.path ?? n.id) as string, type: "file", name: n.name ?? n.id } as any));
  const fileIds = new Set([...atlas.nodes.filter((n) => n.type === "file").map((n) => n.id), ...addNodes.map((n) => n.id)]);
  const addEdges = (mol.planned_edges ?? []).filter((e) => fileIds.has(e.from_node) && fileIds.has(e.to_node) && e.from_node !== e.to_node).map((e) => ({ from_node: e.from_node, to_node: e.to_node, type: "imports" } as any));
  return { ...atlas, nodes: [...atlas.nodes, ...addNodes], edges: [...atlas.edges, ...addEdges] };
}

// Blueprint → the SAME diagram the code screen uses (DiagramWidget): blocks become role-coloured boxes,
// typed bindings become captioned edges, laid out left→right by dependency. One visual language across
// the code screen and the blueprint (operator: "the blueprint should use the same system of graph + diagram").
const ROLE_BY_KIND: Record<string, string> = {
  type: "data", interface: "data", const: "data", enum: "data",
  hook: "state", class: "state", store: "state", state: "state",
  module: "external", export: "external", import: "external",
};
const roleOfKind = (k: string | null): string => (k && ROLE_BY_KIND[k]) || "logic";

export function blueprintToDiagram(mol: Blueprint): { title: string; nodes: any[]; edges: any[] } {
  const nodes: any[] = [];
  const seen = new Set<string>();
  for (const fb of mol.blocks ?? []) {
    if (!fb.path) continue;
    const flat = flattenBlocks(fb.children);
    if (flat.length === 0) {
      if (!seen.has(fb.path)) { seen.add(fb.path); nodes.push({ id: fb.path, label: baseName(fb.path), role: "logic", file: fb.path }); }
      continue;
    }
    for (const e of flat) {
      if (!e.id || seen.has(e.id)) continue;
      seen.add(e.id);
      nodes.push({ id: e.id, label: shortId(e.id), role: roleOfKind(e.kind), file: fb.path });
    }
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges: any[] = [];
  for (const b of mol.bindings ?? []) {
    const from = b.output != null ? String(b.output) : "";
    const to = b.input != null ? String(b.input) : "";
    if (from !== to && ids.has(from) && ids.has(to)) edges.push({ from, to, label: b.type ? String(b.type) : "" });
  }
  return { title: `${nodes.length} block${nodes.length === 1 ? "" : "s"} · ${edges.length} binding${edges.length === 1 ? "" : "s"}`, nodes, edges };
}

// AST-skeleton (P4): the PLANNED graph parsed from the design stubs (blueprint-parse), rendered as
// the SAME diagram with the DELTA highlighted — the touched (added/changed) nodes at full opacity,
// the unchanged neighborhood dimmed. Returns null for a pre-stub design → the tab falls back to the
// blocks diagram (blueprintToDiagram). "Neighborhood + dimmed rest", the operator's chosen scope.
const PLANNED_ROLE_BY_TYPE: Record<string, string> = {
  file: "external", function: "logic", method: "logic", class: "state", hook: "state",
  const: "data", variable: "data", type: "data", interface: "data", enum: "data",
  import: "external", export: "external",
};
const roleOfType = (t: string | null | undefined) => (t && PLANNED_ROLE_BY_TYPE[t]) || "logic";

export function plannedToDiagram(mol: Blueprint): { title: string; caption?: string; nodes: any[]; edges: any[] } | null {
  const pn = mol.planned_nodes ?? [];
  if (pn.length < 2) return null;
  const byId = mol.delta?.by_id ?? {};
  // touched = added|changed (full opacity). No delta entry (e.g. no baseline atlas) ⇒ treat as
  // touched, so a greenfield "pure after" shows everything bright.
  const touched = (id: string) => { const s = byId[id]; return s !== "unchanged" && s !== "removed"; };
  const nodes = pn.map((n) => ({
    id: n.id,
    label: n.name ? shortId(String(n.name)) : baseName(String(n.id)),
    role: roleOfType(n.type),
    file: n.path ?? undefined,
    dim: !touched(n.id),
    status: byId[n.id],
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (mol.planned_edges ?? [])
    .filter((e) => ids.has(e.from_node) && ids.has(e.to_node))
    .map((e) => ({ from: e.from_node, to: e.to_node, label: e.type && e.type !== "imports" ? String(e.type) : "" }));
  const c = mol.delta?.counts;
  const caption = c
    ? `**${c.added}** added · **${c.changed}** changed · ${c.unchanged} unchanged${c.removed ? ` · ${c.removed} removed` : ""} — vs the current codebase`
    : undefined;
  return { title: `planned architecture · ${nodes.length} node${nodes.length === 1 ? "" : "s"}`, caption, nodes, edges };
}

export type FlatBlock = { id: string; kind: string | null; microprompt: string | null; authored: boolean; depth: number };

// Flatten the child blocks of a file block (the canvas renders them as orbiting
// nodes; map the Block fields onto the visual's kind/microprompt).
export function flattenBlocks(blocks: Block[] | undefined, depth = 0, out: FlatBlock[] = []): FlatBlock[] {
  for (const b of blocks ?? []) {
    if (b && b.id) out.push({ id: b.id, kind: b.type, microprompt: b.intent, authored: !!b.authored, depth });
    if (b?.children?.length) flattenBlocks(b.children, depth + 1, out);
  }
  return out;
}

// block ids look like "src/filter.ts.filterUsers" — show the trailing segment.
export function shortId(id: string): string {
  const parts = String(id).split(/[./]/).filter(Boolean);
  return parts[parts.length - 1] || String(id);
}

// path is a file path "src/api/users.ts" → basename for the nucleus label.
function baseName(p: string): string {
  const parts = String(p).split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || String(p);
}
function dirName(p: string): string {
  const parts = String(p).split(/[/\\]/).filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : "";
}

// Child blocks get a hue by kind so the design reads at a glance.
const KIND_HUE: Record<string, string> = {
  module: "#7aa2f7", function: "#9ece6a", type: "#bb9af7",
  const: "#e0af68", class: "#f7768e", hook: "#2ac3de", export: "#73daca",
};
const kindColor = (k: string | null) => (k && KIND_HUE[k]) || C.brand;

const NUCLEUS_R = 30, BLOCK_R = 7, ORBIT_GAP = 26, COL_GAP = 96, ROW_GAP = 54, PAD = 56, LABEL_H = 30;

type LaidBlock = FlatBlock & { ex: number; ey: number };
type LaidFileBlock = { path: string; intent: string | null; cx: number; cy: number; orbitR: number; children: LaidBlock[]; authored: number; total: number };
type Binding = { path: string; type?: string; lx: number; ly: number };
export type BlockLayout = { fileBlocks: LaidFileBlock[]; bindings: Binding[]; width: number; height: number; cellR: number };

// Pure: blueprint → positioned nuclei + orbiting child blocks + binding curves.
// Exported for unit testing.
export function computeBlockLayout(mol: Blueprint | null): BlockLayout | null {
  // Top-level file blocks become the nuclei; their child blocks orbit around them.
  const rawFileBlocks = mol?.blocks?.filter((b) => b.path) ?? [];
  if (rawFileBlocks.length === 0) return null;
  const flat = rawFileBlocks.map((b) => ({ path: b.path as string, intent: b.intent, els: flattenBlocks(b.children) }));

  const elLoc = new Map<string, { ai: number }>();
  flat.forEach((a, ai) => a.els.forEach((e) => elLoc.set(e.id, { ai })));

  const bindings = Array.isArray(mol?.bindings) ? mol!.bindings : [];
  const preds = flat.map(() => new Set<number>());
  for (const b of bindings) {
    const s = b.output ? elLoc.get(String(b.output)) : undefined;
    const t = b.input ? elLoc.get(String(b.input)) : undefined;
    if (s && t && s.ai !== t.ai) preds[t.ai].add(s.ai);
  }
  // longest-path layer (cycle-guarded so a stray back-edge can't loop forever).
  const layerOf = (ai: number, seen: Set<number>): number => {
    if (seen.has(ai)) return 0;
    seen.add(ai);
    let m = 0;
    for (const p of preds[ai]) m = Math.max(m, layerOf(p, seen) + 1);
    seen.delete(ai);
    return m;
  };
  const layer = flat.map((_, ai) => layerOf(ai, new Set()));

  // each nucleus's orbit grows so its child blocks never overlap.
  const orbitR = flat.map((a) => {
    const n = a.els.length;
    const minR = n > 0 ? (n * (2 * BLOCK_R + 9)) / (2 * Math.PI) : 0;
    return Math.max(NUCLEUS_R + ORBIT_GAP, minR);
  });
  const cellR = Math.max(NUCLEUS_R + ORBIT_GAP + BLOCK_R, ...orbitR.map((r) => r + BLOCK_R));

  const rowInLayer = new Map<number, number>();
  const fileBlocks: LaidFileBlock[] = flat.map((a, ai) => {
    const lay = layer[ai];
    const row = rowInLayer.get(lay) ?? 0;
    rowInLayer.set(lay, row + 1);
    const cx = PAD + cellR + lay * (2 * cellR + COL_GAP);
    const cy = PAD + cellR + row * (2 * cellR + ROW_GAP + LABEL_H);
    const n = a.els.length;
    const children: LaidBlock[] = a.els.map((e, ei) => {
      const ang = -Math.PI / 2 + (n > 0 ? (ei * 2 * Math.PI) / n : 0);
      return { ...e, ex: cx + orbitR[ai] * Math.cos(ang), ey: cy + orbitR[ai] * Math.sin(ang) };
    });
    return { path: a.path, intent: a.intent, cx, cy, orbitR: orbitR[ai], children, authored: children.filter((e) => e.authored).length, total: n };
  });

  const elPos = new Map<string, { x: number; y: number }>();
  fileBlocks.forEach((a) => a.children.forEach((e) => { if (e.id) elPos.set(e.id, { x: e.ex, y: e.ey }); }));
  const bindingCurves: Binding[] = [];
  for (const b of bindings) {
    const s = b.output ? elPos.get(String(b.output)) : undefined;
    const t = b.input ? elPos.get(String(b.input)) : undefined;
    if (!s || !t) continue;
    const dx = t.x - s.x, dy = t.y - s.y, k = 0.16;
    const c1 = { x: s.x + dx * 0.32 - dy * k, y: s.y + dy * 0.32 + dx * k };
    const c2 = { x: s.x + dx * 0.68 - dy * k, y: s.y + dy * 0.68 + dx * k };
    bindingCurves.push({ path: `M ${s.x} ${s.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${t.x} ${t.y}`, type: b.type ? String(b.type) : undefined, lx: (s.x + t.x) / 2, ly: (s.y + t.y) / 2 - 4 });
  }

  const width = Math.max(...fileBlocks.map((a) => a.cx + cellR)) + PAD;
  const height = Math.max(...fileBlocks.map((a) => a.cy + cellR + LABEL_H)) + PAD;
  return { fileBlocks, bindings: bindingCurves, width, height, cellR };
}

// The pure SVG render — shared by the inline tab and the full-screen overlay.
function BlockCanvas({ layout }: { layout: BlockLayout }) {
  const { fileBlocks, bindings, width, height } = layout;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="blueprint block diagram" style={{ display: "block" }}>
      <defs>
        <radialGradient id="mol-nucleus" cx="38%" cy="34%" r="72%">
          <stop offset="0%" stopColor={`color-mix(in oklab, ${C.brand} 80%, white)`} />
          <stop offset="55%" stopColor={C.brand} />
          <stop offset="100%" stopColor={`color-mix(in oklab, ${C.brand} 45%, black)`} />
        </radialGradient>
        <filter id="mol-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <marker id="mol-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">
          <path d="M0,0 L9,4.5 L0,9 Z" fill={`color-mix(in oklab, ${C.brand} 70%, transparent)`} />
        </marker>
      </defs>

      {/* bindings behind the file blocks */}
      {bindings.map((b, i) => (
        <g key={i}>
          <path d={b.path} fill="none" stroke={`color-mix(in oklab, ${C.brand} 55%, transparent)`} strokeWidth={1.6} markerEnd="url(#mol-arrow)" />
          {b.type && (
            <text x={b.lx} y={b.ly} fill={C.dim} fontFamily={mono} fontSize={9} textAnchor="middle"
              style={{ paintOrder: "stroke", stroke: C.bg, strokeWidth: 4 }}>{b.type}</text>
          )}
        </g>
      ))}

      {/* file blocks */}
      {fileBlocks.map((a) => {
        const frac = a.total > 0 ? a.authored / a.total : 0;
        const ringC = 2 * Math.PI * (NUCLEUS_R + 5);
        return (
          <g key={a.path}>
            {/* orbit ring */}
            <circle cx={a.cx} cy={a.cy} r={a.orbitR} fill="none" stroke={C.border} strokeWidth={1} strokeDasharray="2 5" opacity={0.7} />
            {/* authored-progress arc around the nucleus */}
            {a.total > 0 && (
              <circle cx={a.cx} cy={a.cy} r={NUCLEUS_R + 5} fill="none" stroke={C.ok} strokeWidth={2.5} strokeLinecap="round"
                strokeDasharray={`${frac * ringC} ${ringC}`} transform={`rotate(-90 ${a.cx} ${a.cy})`} opacity={0.9} />
            )}
            {/* nucleus */}
            <circle cx={a.cx} cy={a.cy} r={NUCLEUS_R} fill="url(#mol-nucleus)" filter="url(#mol-glow)" />
            <circle cx={a.cx} cy={a.cy} r={NUCLEUS_R} fill="none" stroke={`color-mix(in oklab, ${C.brand} 90%, white)`} strokeWidth={1} opacity={0.5} />
            {/* child blocks on the orbit */}
            {a.children.map((e) => (
              <g key={e.id}>
                <line x1={a.cx} y1={a.cy} x2={e.ex} y2={e.ey} stroke={C.border} strokeWidth={0.75} opacity={0.4} />
                <circle cx={e.ex} cy={e.ey} r={BLOCK_R}
                  fill={e.authored ? kindColor(e.kind) : C.panel}
                  stroke={e.authored ? "white" : kindColor(e.kind)}
                  strokeWidth={e.authored ? 1 : 1.5}
                  filter={e.authored ? "url(#mol-glow)" : undefined}
                  opacity={e.authored ? 1 : 0.85}>
                  <title>{`${shortId(e.id)}${e.kind ? ` · ${e.kind}` : ""} — ${e.authored ? "authored" : "pending"}${e.microprompt ? `\n${e.microprompt}` : ""}`}</title>
                </circle>
              </g>
            ))}
            {/* file label below the nucleus */}
            <text x={a.cx} y={a.cy + a.orbitR + 16} textAnchor="middle" fontFamily={mono} fontSize={11} fontWeight={600} fill={C.fg}>
              {baseName(a.path)}
            </text>
            <text x={a.cx} y={a.cy + a.orbitR + 28} textAnchor="middle" fontFamily={mono} fontSize={8.5} fill={C.muted}>
              {dirName(a.path)}<tspan fill={C.dim}> {a.authored}/{a.total}</tspan>
            </text>
            <title>{`${a.path}${a.intent ? `\n${a.intent}` : ""}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

const verdictColor = (v?: string | null) => (v === "pass" ? C.ok : v === "fail" ? C.bad : C.muted);

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontFamily: mono, fontSize: 9.5, color, border: `1px solid ${color}`, borderRadius: 3, padding: "1px 6px", letterSpacing: 0.4, textTransform: "uppercase" }}>
      {label}
    </span>
  );
}

function BlueprintMeta({ mol, layout, onExpand }: { mol: Blueprint; layout: BlockLayout; onExpand?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 11, color: C.dim, flexWrap: "wrap" }}>
      <Box size={14} color={C.brand} />
      <span style={{ color: C.fg }}>blueprint v{mol.version}</span>
      <span>· {mol.blocks!.length} files · {layout.bindings.length} bindings · {mol.authored_count ?? 0} authored</span>
      <span style={{ flex: 1, minWidth: 12 }} />
      <Badge label={`lint ${mol.lint_passed ? "✓" : "✗"}`} color={mol.lint_passed ? C.ok : C.bad} />
      <Badge label={`design ${mol.judgments?.design?.verdict ?? "—"}`} color={verdictColor(mol.judgments?.design?.verdict)} />
      <Badge label={`code ${mol.judgments?.code?.verdict ?? "—"}`} color={verdictColor(mol.judgments?.code?.verdict)} />
      {onExpand && (
        <button onClick={onExpand} title="Open the blueprint full-screen"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", color: C.dim, fontFamily: mono, fontSize: 10 }}>
          <Maximize2 size={12} /> full
        </button>
      )}
    </div>
  );
}

const pct = (n?: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

// One court's trail for a judged mode: the DETERMINISTIC evidence-gather step
// (the research that ran BEFORE the debate, with its persisted JSON bundle) then
// the verdict + the judge's per-side accuracy grade. Mirrors the substrate order.
function CourtRow({ title, j }: { title: string; j: BlueprintJudgment }) {
  const [open, setOpen] = React.useState(false);
  if (!j) return null;
  const ev = j.evidence ?? null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: mono, fontSize: 10.5, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 9px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>{title} court</span>
        <Badge label={`verdict ${j.verdict ?? "—"}`} color={verdictColor(j.verdict)} />
        <span style={{ color: C.dim }}>def acc {pct(j.defender_accuracy)} · pros acc {pct(j.prosecutor_accuracy)}</span>
      </div>
      {ev ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", color: C.dim }}>
          <span title="The deterministic court-evidence-gather step ran before the debate and persisted this bundle">📋 evidence gathered</span>
          <span>card {ev.has_card ? "✓" : "✗"} · blueprint {ev.has_blueprint ? "✓" : "✗"} · screening {ev.has_screening ? "✓" : "✗"}</span>
          <span>{ev.n_blocks ?? 0} blocks · {ev.n_nested_blocks ?? 0} child blocks · {ev.n_acceptance ?? 0} acceptance · {ev.n_microtasks ?? 0} microtasks</span>
          {ev.evidence_md && (
            <button onClick={() => setOpen((o) => !o)}
              style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, padding: "1px 6px", cursor: "pointer", color: C.dim, fontFamily: mono, fontSize: 9.5 }}>
              {open ? "hide bundle" : "view bundle"}
            </button>
          )}
        </div>
      ) : (
        <span style={{ color: C.muted }}>no evidence gathered yet</span>
      )}
      {open && ev?.evidence_md && (
        <pre style={{ margin: 0, maxHeight: 280, overflow: "auto", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, fontFamily: mono, fontSize: 9.5, color: C.fg, whiteSpace: "pre-wrap" }}>{ev.evidence_md}</pre>
      )}
    </div>
  );
}

// The QA court summary for the blueprint: design + code judgments, each opening
// with the evidence the gather step researched (per the operator: a deterministic
// research skill runs BEFORE the prosecutor, and the judge grades vs that evidence).
function CourtPanel({ mol }: { mol: Blueprint }) {
  const design = mol.judgments?.design ?? null;
  const code = mol.judgments?.code ?? null;
  if (!design && !code) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <CourtRow title="design" j={design} />
      <CourtRow title="code" j={code} />
    </div>
  );
}

// ── P4 design-digest (the "snapshot" split): compact metrics from the planned graph + delta. ──
const STATUS_COLOR: Record<string, string> = { added: C.ok, changed: C.brand, removed: C.bad, unchanged: C.muted };

function DesignDigestPanel({ digest }: { digest: NonNullable<Blueprint["design_digest"]> }) {
  const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, minWidth: 72 }}>
      <span style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: C.fg }}>{value}</span>
      <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "2px 2px 8px" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Stat label="files" value={digest.files} />
        <Stat label="symbols" value={digest.symbols} />
        <Stat label="edges" value={digest.edges} />
        <Stat label="acc covered" value={`${digest.acceptance_covered}/${digest.acceptance_total}`} />
        <Stat label="coverage" value={digest.coverage_pct == null ? "—" : `${Math.round(digest.coverage_pct * 100)}%`} />
      </div>
      {Object.keys(digest.by_kind).length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>by kind</span>
          {Object.entries(digest.by_kind).map(([k, n]) => (
            <span key={k} style={{ fontFamily: mono, fontSize: 10, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 7px" }}>{k} <b style={{ color: C.fg }}>{n}</b></span>
          ))}
        </div>
      )}
      {digest.delta && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>vs codebase</span>
          <Badge label={`+${digest.delta.added} added`} color={C.ok} />
          <Badge label={`~${digest.delta.changed} changed`} color={C.brand} />
          <Badge label={`${digest.delta.unchanged} unchanged`} color={C.muted} />
          {digest.delta.removed > 0 && <Badge label={`−${digest.delta.removed} removed`} color={C.bad} />}
        </div>
      )}
    </div>
  );
}

// ── P4 design-docs (the ❡ split): one doc-card per planned symbol — signature + the block intent
// it came from + which acceptance it covers + its delta status. (The logic-step trace fills once
// bodies land — P3.) ──
function DesignDocsPanel({ docs }: { docs: NonNullable<Blueprint["design_docs"]> }) {
  if (!docs.length) return <Empty msg="No symbols in the design yet." />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {docs.map((d) => (
        <div key={d.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <code style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 600 }}>{d.name}{d.signature ?? ""}</code>
            {d.kind && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{d.kind}</span>}
            <span style={{ flex: 1 }} />
            {d.status && <Badge label={d.status} color={STATUS_COLOR[d.status] ?? C.muted} />}
          </div>
          {d.path && <div style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{d.path}</div>}
          {d.intent && <div style={{ fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 12, color: C.dim, lineHeight: 1.5 }}>{d.intent}</div>}
          {d.covers && d.covers.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>covers</span>
              {d.covers.map((c) => <span key={c} style={{ fontFamily: mono, fontSize: 9, color: C.brand, border: `1px solid color-mix(in oklab, ${C.brand} 40%, transparent)`, borderRadius: 4, padding: "0 5px" }}>{c}</span>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Click a diagram node → a DIFF of its current source → the design's stub (what the design changes:
// +added / −removed / changed lines). An added file diffs against empty (all +); a node from the
// existing codebase that the design doesn't touch has no stub and says so.
function StubPanel({ node, stubFiles, onClose }: { node: any; stubFiles?: StubFile[]; onClose: () => void }) {
  const file = node?.file ?? null;
  const stub = (stubFiles ?? []).find((s) => s.path === file);
  const [current, setCurrent] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (!file || !stub) { setCurrent(null); return; }
    if (node?.status === "added") { setCurrent(""); setLoading(false); return; } // new file → no current source, skip the read
    let live = true; setLoading(true); setCurrent(null);
    fileRead({ path: file }).then((r) => { if (live) setCurrent(r?.content ?? ""); }).catch(() => { if (live) setCurrent(""); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [file, stub, node?.status]);
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: `1px solid ${C.border}`, background: C.panel }}>
        <code style={{ fontFamily: mono, fontSize: 11.5, color: C.fg, fontWeight: 600 }}>{node?.label}</code>
        {file && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{file}</span>}
        {node?.status && <span style={{ fontFamily: mono, fontSize: 9, color: STATUS_COLOR[node.status] ?? C.muted }}>{node.status}</span>}
        <span style={{ flex: 1 }} />
        <button onClick={onClose} title="close" style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, padding: "1px 7px", cursor: "pointer", color: C.dim, fontFamily: mono, fontSize: 10 }}>close</button>
      </div>
      {stub ? (
        loading ? <div style={{ padding: 12, fontSize: 11, color: C.muted }}>loading current source…</div>
          : <DiffWidget payload={{ before: current ?? "", after: stub.source, file }} ctx={{} as any} />
      ) : (
        <div style={{ padding: 12, fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>This node is part of the existing codebase (not a touched file in this design) — it has no stub; open it on the code screen for its current source.</div>
      )}
    </div>
  );
}

// One file's diff (current source → the design's new version), collapsible. Fetches the current
// source lazily; an added file diffs against empty (all +).
function FileDiff({ path, after, status }: { path: string; after: string; status?: string }) {
  const [current, setCurrent] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (!open || current != null) return;
    if (status === "added") { setCurrent(""); return; } // a NEW file has no current source — don't read it (avoids a BE file-not-found error)
    let live = true;
    fileRead({ path }).then((r) => { if (live) setCurrent(r?.content ?? ""); }).catch(() => { if (live) setCurrent(""); });
    return () => { live = false; };
  }, [open, path, current, status]);
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: C.panel, border: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{open ? "▾" : "▸"}</span>
        <code style={{ fontFamily: mono, fontSize: 11, color: C.fg }}>{path}</code>
        {status && <span style={{ fontFamily: mono, fontSize: 9, color: STATUS_COLOR[status] ?? C.muted }}>{status}</span>}
      </button>
      {open && (current == null
        ? <div style={{ padding: 10, fontSize: 11, color: C.muted }}>loading current source…</div>
        : <DiffWidget payload={{ before: current, after, file: path }} ctx={{} as any} />)}
    </div>
  );
}

// Waterfall DIFF tab — two phases: STUBS diff (current source → the design's stub) and SNIPPETS diff
// (current source → the authored snippets composed). Each shows +added / −removed / changed lines.
export function BlueprintDiffTab({ contractSlug }: { contractSlug?: string | null }) {
  const q = usePoll<Blueprint>(
    () => (contractSlug ? getBlueprint(contractSlug) : Promise.resolve(null)),
    5000, !!contractSlug, { topics: contractSlug ? [`contract:${contractSlug}`] : [] },
  );
  const mol = q.data;
  const [phase, setPhase] = React.useState<"stubs" | "snippets">("stubs");
  if (!contractSlug) return <Empty msg="No contract yet." />;
  if (q.loading && !mol) return <Empty msg="Loading…" />;
  if (!mol || mol.blueprint === null) return <Empty msg="No blueprint designed yet — no diff to show." />;
  const stubFiles = mol.stub_files ?? [];
  const composedFiles = mol.composed_files ?? [];
  const status = fileStatusMap(mol);
  const files = phase === "stubs" ? stubFiles : composedFiles;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {(["stubs", "snippets"] as const).map((p) => (
          <button key={p} onClick={() => setPhase(p)} style={{
            fontFamily: mono, fontSize: 10.5, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
            background: phase === p ? `color-mix(in oklab, ${C.brand} 16%, ${C.bg})` : "transparent",
            border: `1px solid ${phase === p ? C.brand : C.border}`, color: phase === p ? C.fg : C.dim,
          }}>{p === "stubs" ? "stubs diff" : "snippets diff"} ({p === "stubs" ? stubFiles.length : composedFiles.length})</button>
        ))}
      </div>
      {files.length === 0
        ? <Empty msg={phase === "stubs" ? "No stubs yet — the design hasn't emitted them." : "No authored snippets yet — BUILD hasn't run."} />
        : files.map((f) => <FileDiff key={f.path} path={f.path} after={f.source} status={status[f.path]} />)}
    </div>
  );
}

// ── BLUEPRINT DESCRIPTION TAB — a description of the CHANGE: an overall summary + per touched file
// what it does (intent), what it defines (symbols), and which acceptance it addresses. Deterministic
// (from the design data); an AI narrative rides on top when generated. ──
export function BlueprintDescriptionTab({ contractSlug }: { contractSlug?: string | null }) {
  const q = usePoll<Blueprint>(
    () => (contractSlug ? getBlueprint(contractSlug) : Promise.resolve(null)),
    5000, !!contractSlug, { topics: contractSlug ? [`contract:${contractSlug}`] : [] },
  );
  const mol = q.data;
  const [narrative, setNarrative] = React.useState<string | null>(null);
  const [gen, setGen] = React.useState(false);
  React.useEffect(() => { setNarrative(mol?.change_description ?? null); }, [mol?.change_description]);
  const generate = async () => {
    if (!contractSlug || gen) return;
    setGen(true);
    const r = await describeBlueprint(contractSlug, !!narrative);
    if (r?.summary_md) setNarrative(r.summary_md);
    setGen(false);
  };
  if (!contractSlug) return <Empty msg="No contract yet." />;
  if (q.loading && !mol) return <Empty msg="Loading…" />;
  if (!mol || mol.blueprint === null) return <Empty msg="No blueprint designed yet — no change to describe." />;
  const docs = mol.design_docs ?? [];
  const status = fileStatusMap(mol);
  const intentOf = (path: string) => (mol.blocks ?? []).find((b) => b.path === path)?.intent ?? null;
  const byFile: Record<string, typeof docs> = {};
  for (const d of docs) { const p = (d.path ?? "(unknown)") as string; (byFile[p] ??= []).push(d); }
  const files = Object.keys(byFile).sort();
  const c = mol.delta?.counts;
  const chip = (text: string, color: string) => <span style={{ fontFamily: mono, fontSize: 9.5, color, border: `1px solid color-mix(in oklab, ${color} 40%, transparent)`, borderRadius: 4, padding: "0 6px" }}>{text}</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: narrative ? 7 : 0 }}>
          <div style={{ flex: 1, fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>
            This change spans <b style={{ color: C.fg }}>{files.length}</b> file{files.length === 1 ? "" : "s"}
            {c ? <> — <b style={{ color: C.ok }}>{c.added}</b> new, <b style={{ color: C.brand }}>{c.changed}</b> changed, {c.unchanged} untouched{c.removed ? <>, <b style={{ color: C.bad }}>{c.removed}</b> removed</> : null}</> : null}.
          </div>
          <button onClick={generate} disabled={gen} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 9px", cursor: gen ? "default" : "pointer", color: C.brand, fontFamily: mono, fontSize: 10, opacity: gen ? 0.6 : 1 }}>{gen ? "writing…" : (narrative ? "regenerate" : "✦ narrative")}</button>
        </div>
        {narrative && <div style={{ fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 13, color: C.fg, lineHeight: 1.6 }}>{narrative}</div>}
      </div>
      {files.length === 0 && <Empty msg="No designed files yet." />}
      {files.map((path) => {
        const syms = byFile[path];
        const st = status[path];
        const intent = intentOf(path);
        const covers = [...new Set(syms.flatMap((s) => s.covers ?? []))];
        return (
          <div key={path} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <code style={{ fontFamily: mono, fontSize: 11.5, color: C.fg, fontWeight: 600 }}>{path}</code>
              {st && <Badge label={st} color={STATUS_COLOR[st] ?? C.muted} />}
            </div>
            {intent && <div style={{ fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>{intent}</div>}
            {syms.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>defines</span>
                {syms.map((s) => <code key={s.id} style={{ fontFamily: mono, fontSize: 10, color: C.fg }}>{s.name}{s.signature ?? ""}</code>)}
              </div>
            )}
            {covers.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>addresses</span>
                {covers.map((cv) => <React.Fragment key={cv}>{chip(cv, C.brand)}</React.Fragment>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── QA COURT TAB — the two court sessions (design + code), explained per claim, in plain language. ──
// One claim row: the statement + what the judge ruled, said simply (a prosecutor's true = a real
// defect = bad for the card; a defender's true = sufficiency holds = good).
function ClaimRow({ claim, side }: { claim: CourtClaim; side: "prosecutor" | "defender" }) {
  const ruling = !claim.grounded
    ? { label: "discarded", color: C.muted, note: "the cited evidence didn't resolve — not counted" }
    : side === "prosecutor"
      ? (claim.value ? { label: "upheld", color: C.bad, note: "the judge agreed this is a real problem" } : { label: "rejected", color: C.ok, note: "the judge didn't find this a real problem" })
      : (claim.value ? { label: "upheld", color: C.ok, note: "the judge agreed" } : { label: "rejected", color: C.bad, note: "the judge wasn't convinced" });
  return (
    <div style={{ borderLeft: `3px solid ${ruling.color}`, paddingLeft: 9, marginBottom: 9 }}>
      <div style={{ fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 12.5, color: C.fg, lineHeight: 1.45 }}>{claim.statement}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "baseline", marginTop: 3 }}>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: ruling.color, fontWeight: 700, textTransform: "uppercase" }}>{ruling.label}</span>
        <span style={{ fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 11, color: C.dim }}>— {ruling.note}{claim.why ? `: “${claim.why}”` : ""}</span>
        {claim.grounded && claim.accuracy != null && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>· {Math.round(claim.accuracy * 100)}% evidence-backed</span>}
      </div>
    </div>
  );
}

// A collapsible side of the court (prosecution / defense): a clickable title + count summary,
// expanding to its claims on click.
function ClaimGroup({ title, side, claims, color }: { title: string; side: "prosecutor" | "defender"; claims: CourtClaim[]; color: string }) {
  const [open, setOpen] = React.useState(false);
  if (!claims.length) return null;
  const upheld = claims.filter((c) => c.grounded && c.value).length;
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: "3px 0", textAlign: "left" }}>
        <span style={{ fontFamily: mono, fontSize: 10, color }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontFamily: mono, fontSize: 9.5, color, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>{title}</span>
        <span style={{ fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 10.5, color: C.muted }}>
          {claims.length} claim{claims.length === 1 ? "" : "s"} · <b style={{ color }}>{upheld}</b> {side === "prosecutor" ? "upheld" : "held"}
        </span>
      </button>
      {open && <div style={{ marginTop: 6 }}>{claims.map((c) => <ClaimRow key={c.item_id} claim={c} side={side} />)}</div>}
    </div>
  );
}

// A friendly summary of what the court gathered (the corpus it argued from) — icons + counts.
function EvidenceSummary({ ev }: { ev: any }) {
  const item = (on: boolean, label: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono, fontSize: 10, color: on ? C.fg : C.muted }}>
      <span style={{ color: on ? C.ok : C.muted }}>{on ? "✓" : "○"}</span>{label}
    </span>
  );
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", padding: "7px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
      <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>the court read</span>
      {item(!!ev.has_card, "the card")}
      {item(!!ev.has_blueprint, `the blueprint${ev.n_blocks ? ` · ${ev.n_blocks} blocks` : ""}${ev.n_nested_blocks ? ` · ${ev.n_nested_blocks} child` : ""}`)}
      {item(!!ev.has_screening, "the PL screening")}
      {item((ev.n_acceptance ?? 0) > 0, `${ev.n_acceptance ?? 0} acceptance line${(ev.n_acceptance ?? 0) === 1 ? "" : "s"}`)}
      {(ev.n_microtasks ?? 0) > 0 ? item(true, `${ev.n_microtasks} microtasks`) : null}
    </div>
  );
}

function CourtSession({ title, sub, j }: { title: string; sub: string; j: BlueprintJudgment }) {
  const [showEv, setShowEv] = React.useState(false);
  if (!j) return (
    <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: 12, opacity: 0.7, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontFamily: mono, fontSize: 12, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</span>
      <Badge label="not run yet" color={C.muted} />
      <span style={{ flex: 1 }} />
      <span style={{ fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 11, color: C.muted }}>{sub}</span>
    </div>
  );
  const pros = j.items?.prosecutor ?? [];
  const def = j.items?.defender ?? [];
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</span>
        <Badge label={j.verdict ?? "—"} color={verdictColor(j.verdict)} />
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 11, color: C.muted }}>{sub}</span>
      </div>
      {j.goal_line && <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>judged against: <span style={{ color: C.muted }}>{j.goal_line}</span></div>}
      <div style={{ fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 12, color: C.dim, lineHeight: 1.5, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
        The judge upheld <b style={{ color: C.bad }}>{j.prosecutor_trues ?? 0}</b> defect{(j.prosecutor_trues ?? 0) === 1 ? "" : "s"} and <b style={{ color: C.ok }}>{j.defender_trues ?? 0}</b> of {j.n_items ?? 3} sufficiency claim{(j.n_items ?? 3) === 1 ? "" : "s"} → <b style={{ color: verdictColor(j.verdict) }}>{(j.verdict ?? "—").toUpperCase()}</b>. It counts true/false (it doesn't weigh) — {(j.prosecutor_trues ?? 0) > 0
          ? "a single upheld defect blocks."
          : j.verdict === "pass"
            ? "the defects were rejected and sufficiency held."
            : "no defect was upheld; it fails because the defender didn't establish enough sufficiency."}
      </div>
      {j.evidence && <EvidenceSummary ev={j.evidence} />}
      <ClaimGroup title="prosecution — argues it FAILS" side="prosecutor" claims={pros} color={C.bad} />
      <ClaimGroup title="defense — argues it PASSES" side="defender" claims={def} color={C.ok} />
      {pros.length === 0 && def.length === 0 && <div style={{ fontSize: 11.5, color: C.muted }}>No individual claims recorded — this session was decided by the deterministic gate (lint / conformance), not the debate.</div>}
      {j.evidence?.evidence_md && (
        <div>
          <button onClick={() => setShowEv((s) => !s)} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 8px", cursor: "pointer", color: C.dim, fontFamily: mono, fontSize: 9.5 }}>{showEv ? "hide" : "view"} the raw evidence bundle</button>
          {showEv && <pre style={{ margin: "6px 0 0", maxHeight: 300, overflow: "auto", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, fontFamily: mono, fontSize: 9.5, color: C.fg, whiteSpace: "pre-wrap" }}>{j.evidence.evidence_md}</pre>}
        </div>
      )}
    </div>
  );
}

export function CourtTab({ contractSlug }: { contractSlug?: string | null }) {
  const q = usePoll<Blueprint>(
    () => (contractSlug ? getBlueprint(contractSlug) : Promise.resolve(null)),
    5000, !!contractSlug, { topics: contractSlug ? [`contract:${contractSlug}`] : [] },
  );
  const mol = q.data;
  if (!contractSlug) return <Empty msg="No contract yet." />;
  if (q.loading && !mol) return <Empty msg="Loading…" />;
  if (mol && mol.blueprint === null) return <Empty msg="No blueprint designed yet — the QA courts run on the plan, then on the built code." />;
  // 2 court sessions per run: the design court + the code court — ALWAYS both, pending until each runs.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 12, color: C.dim, lineHeight: 1.55 }}>
        Each run has <b>two</b> QA courts. In each, a <b style={{ color: C.bad }}>prosecutor</b> argues it FAILS and a <b style={{ color: C.ok }}>defender</b> argues it PASSES; a judge rules every claim true/false against the goal, then the verdict is decided by <b>counting</b> — a single upheld defect blocks.
      </div>
      <CourtSession title="design court" sub="is the plan sound + complete?" j={mol?.judgments?.design ?? null} />
      <CourtSession title="code court" sub="does the built code satisfy it?" j={mol?.judgments?.code ?? null} />
    </div>
  );
}

// Subtle radial-vignette stage the file blocks float on (in front: the canvas).
function Stage({ children, full }: { children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{
      position: "relative", overflow: "auto", flex: full ? 1 : undefined,
      width: "100%", height: full ? "100%" : undefined,
      borderRadius: 10, border: `1px solid ${C.border}`,
      background: `radial-gradient(120% 120% at 30% 0%, color-mix(in oklab, ${C.brand} 7%, ${C.bg}), ${C.bg} 70%)`,
    }}>
      <div style={{ padding: 8, minWidth: "min-content" }}>{children}</div>
    </div>
  );
}

function BlueprintOverlay({ mol, layout, slug, mergedAtlas, statusMap, structMode, onClose }: { mol: Blueprint; layout: BlockLayout; slug?: string | null; mergedAtlas?: AtlasResponse | null; statusMap?: Record<string, string>; structMode?: "graph" | "diagram"; onClose: () => void }) {
  const [sel, setSel] = React.useState<any>(null);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (sel) setSel(null); else onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sel]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Blueprint full-screen" style={{ position: "fixed", inset: 0, zIndex: 200, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${C.border}` }}>
        <Box size={15} color={C.brand} />
        <span style={{ fontFamily: mono, fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>blueprint</span>
        {slug && <code style={{ fontFamily: mono, fontSize: 12, color: C.fg }}>{slug}</code>}
        <span style={{ flex: 1 }} />
        <BlueprintMeta mol={mol} layout={layout} />
        <button onClick={onClose} title="Close (Esc)"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer", color: C.dim, fontFamily: mono, fontSize: 11 }}>
          <XIcon size={14} /> close
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 16, display: "flex", gap: 12 }}>
        {mergedAtlas && mergedAtlas.nodes?.length && structMode !== "diagram" ? (
          // graph mode → the whole-codebase graph fullscreen
          <div style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.bg }}>
            <AtlasGraphMini atlas={mergedAtlas} height={typeof window !== "undefined" ? window.innerHeight - 120 : 700} highlight={statusMap} controls
              onPick={(id: string) => setSel({ file: id, label: baseName(id), status: statusMap?.[id] })} />
          </div>
        ) : (
          // diagram mode (or no atlas) → the design's boxes diagram fullscreen
          <Stage full><DiagramWidget payload={{ diagram: plannedToDiagram(mol) ?? blueprintToDiagram(mol), folderZones: true, onNodeClick: (_id: string, n: any) => setSel(n) }} ctx={{} as any} /></Stage>
        )}
        {sel && <div style={{ width: 440, minWidth: 320, overflowY: "auto" }}><StubPanel node={sel} stubFiles={mol.stub_files} onClose={() => setSel(null)} /></div>}
      </div>
    </div>
  );
}

export function BlueprintTab({ contractSlug }: { contractSlug?: string | null }) {
  const q = usePoll<Blueprint>(
    () => (contractSlug ? getBlueprint(contractSlug) : Promise.resolve(null)),
    5000,
    !!contractSlug,
    { topics: contractSlug ? [`contract:${contractSlug}`] : [] },
  );
  const mol = q.data;
  const layout = React.useMemo(() => computeBlockLayout(mol), [mol]);
  // Prefer the AST-skeleton planned graph (with the delta highlighted) when the design carried
  // stubs; fall back to the blocks diagram for a pre-stub design.
  const planned = React.useMemo(() => (mol ? plannedToDiagram(mol) : null), [mol]);
  const [expanded, setExpanded] = React.useState(false);
  const [view, setView] = React.useState<"structure" | "docs" | "digest">("structure");
  const [selNode, setSelNode] = React.useState<any>(null); // clicked diagram node → its stub
  const [structMode, setStructMode] = React.useState<"graph" | "diagram">("graph"); // graph = whole codebase; diagram = the design's boxes
  // the whole codebase (atlas) for the structure view — fetched once (it's stable across polls).
  const [atlas, setAtlas] = React.useState<AtlasResponse | null>(null);
  React.useEffect(() => { let live = true; getAtlas({}).then((a) => { if (live) setAtlas(a); }).catch(() => {}); return () => { live = false; }; }, []);
  const statusMap = React.useMemo(() => (mol ? fileStatusMap(mol) : {}), [mol]);
  const mergedAtlas = React.useMemo(() => (atlas && mol ? mergeAtlas(atlas, mol) : null), [atlas, mol]);

  if (!contractSlug) return <Empty msg="No contract yet." />;
  if (q.loading && !mol) return <Empty msg="Loading blueprint…" />;
  if (!mol || mol.blueprint === null || !layout) {
    return <Empty msg="No blueprint designed yet. In pipeline v2 the TL designs the blueprint (file blocks, child code blocks, bindings = typed I/O edges) after the contract is ratified." />;
  }

  // the docs/digest splits only exist once the design carried AST-skeleton stubs (P2).
  const hasPlan = !!(mol.planned_nodes && mol.planned_nodes.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <BlueprintMeta mol={mol} layout={layout} />
      <CourtPanel mol={mol} />
      {/* P4: the three code-screen splits on the blueprint — only when the design carried stubs. */}
      {hasPlan && (
        <div style={{ display: "flex", gap: 6 }}>
          {(["structure", "docs", "digest"] as const).map((k) => (
            <button key={k} onClick={() => setView(k)} style={{
              fontFamily: mono, fontSize: 10.5, padding: "4px 12px", borderRadius: 6, cursor: "pointer", textTransform: "lowercase",
              background: view === k ? `color-mix(in oklab, ${C.brand} 16%, ${C.bg})` : "transparent",
              border: `1px solid ${view === k ? C.brand : C.border}`, color: view === k ? C.fg : C.dim,
            }}>{k === "structure" ? "≡ structure" : k === "docs" ? "❡ docs" : "▣ digest"}</button>
          ))}
        </div>
      )}
      {(!hasPlan || view === "structure") && (
        <>
          {/* graph (whole codebase) ↔ diagram (the design's boxes) — both available. */}
          {hasPlan && mergedAtlas && mergedAtlas.nodes?.length ? (
            <div style={{ display: "flex", gap: 6 }}>
              {(["graph", "diagram"] as const).map((m) => (
                <button key={m} onClick={() => setStructMode(m)} style={{
                  fontFamily: mono, fontSize: 10, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                  background: structMode === m ? `color-mix(in oklab, ${C.brand} 14%, ${C.bg})` : "transparent",
                  border: `1px solid ${structMode === m ? C.brand : C.border}`, color: structMode === m ? C.fg : C.dim,
                }}>{m === "graph" ? "◴ graph" : "▦ diagram"}</button>
              ))}
            </div>
          ) : null}
          {hasPlan && mergedAtlas && mergedAtlas.nodes?.length && structMode === "graph" ? (
            // the WHOLE codebase + folder zones, touched files highlighted (the rest dimmed)
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.bg }}>
              <AtlasGraphMini atlas={mergedAtlas} height={460} highlight={statusMap} controls onMaximize={() => setExpanded(true)}
                onPick={(id: string) => setSelNode({ file: id, label: baseName(id), status: statusMap[id] })} />
            </div>
          ) : (
            // the design's boxes diagram (folder-grouped) — also the fallback for a pre-onboard repo
            <Stage><DiagramWidget payload={{ diagram: planned ?? blueprintToDiagram(mol), folderZones: true, onNodeClick: (_id: string, n: any) => setSelNode(n), onExpand: () => setExpanded(true) }} ctx={{} as any} /></Stage>
          )}
          {selNode && <StubPanel node={selNode} stubFiles={mol.stub_files} onClose={() => setSelNode(null)} />}
        </>
      )}
      {hasPlan && view === "docs" && mol.design_docs && <DesignDocsPanel docs={mol.design_docs} />}
      {hasPlan && view === "digest" && mol.design_digest && <DesignDigestPanel digest={mol.design_digest} />}
      {expanded && <BlueprintOverlay mol={mol} layout={layout} slug={contractSlug} mergedAtlas={mergedAtlas} statusMap={statusMap} structMode={structMode} onClose={() => setExpanded(false)} />}
    </div>
  );
}
