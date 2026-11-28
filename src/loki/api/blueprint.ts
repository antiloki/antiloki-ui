// Blueprint client (pipeline v2). Reads a contract's active blueprint — the
// blocks (files) / nested code blocks / bindings (typed I/O edges) the TL
// designed — annotated with per-block authored status + the design/code
// judgment verdicts. Powers the waterfall Blueprint tab's SVG graph.
//
// Dedicated read route: POST /api/v1/blueprint/get → system.blueprint.get (a pure
// BE read, allowlisted, non-god). action-run may hand the skill result back
// directly or nested under .result.
import { apiPost, isNotWired } from "./client";

// A Block — a node that can contain other Blocks (recursive). Typed by code
// vocabulary (file | function | class | condition | …); a file block carries a path.
export type Block = {
  id: string | null;
  type: string | null;       // code vocab — 'file' for the top-level file blocks
  path?: string | null;      // file blocks only (the block's identity)
  intent: string | null;     // what the block is/does (the per-block intent)
  authored?: boolean;
  children: Block[];
};
// A typed I/O edge (Binding): the output of one block is the input of another.
export type Binding = {
  from?: string;             // source block id
  to?: string;               // target block id
  output?: string;           // value leaving the source
  input?: string;            // value entering the target
  type?: string;             // the value/edge kind flowing across
  [k: string]: unknown;
};
// The deterministic gather step's persisted JSON-bundle summary (court_evidence) —
// what the court researched BEFORE the debate, surfaced before the verdict.
export type CourtEvidence = {
  n_acceptance?: number;
  n_microtasks?: number;
  n_blocks?: number;
  n_nested_blocks?: number;
  has_card?: boolean;
  has_blueprint?: boolean;
  has_screening?: boolean;
  evidence_md?: string | null;   // the rendered, citable evidence the debaters read
  created_at?: string;
};
// One claim in a court session: a side's statement + the judge's verdict on it.
export type CourtClaim = {
  item_id: string;
  statement: string;
  grounded: boolean;          // its cited evidence resolved (else discarded, not counted)
  value: boolean;             // the judge's true/false (prosecutor true = a real defect; defender true = sufficiency holds)
  accuracy: number | null;    // 0–1, how well the evidence backs the claim
  why: string;                // the judge's ≤15-word reason
};
export type BlueprintJudgment = {
  verdict: string | null;    // 'pass' | 'fail' | 'invalid' | null
  goal_line?: string | null; // the measurable bar the claims were judged against
  n_items?: number;
  defender_trues?: number;   // sufficiency claims the judge upheld
  prosecutor_trues?: number; // defects the judge upheld
  defender_rate?: number;
  prosecutor_rate?: number;
  defender_accuracy?: number | null;    // MID judge's mean claim-vs-evidence grade (0–1)
  prosecutor_accuracy?: number | null;
  evidence?: CourtEvidence | null;       // the gather step (research) for this judgment
  items?: { prosecutor: CourtClaim[]; defender: CourtClaim[] };  // the complete session
} | null;

// AST-skeleton (P2/P4): the atlas-native PLANNED graph parsed from the design stubs +
// the delta vs the current atlas. Empty for a pre-stub design (the tab falls back to blocks).
export type PlannedNode = { id: string; type?: string | null; name?: string | null; path?: string | null; signature?: string | null };
export type PlannedEdge = { from_node: string; to_node: string; type?: string | null };
export type StubFile = { path: string; source: string };  // the design's code stub per file (click-a-node → see it)
// P4 design-digest (the "snapshot" split) + per-symbol design-docs — sourced from the design data
// (planned graph + delta + coverage + block intents), not the code_nodes projection.
export type DesignDigest = {
  files: number; symbols: number; edges: number;
  by_kind: Record<string, number>;
  acceptance_total: number; acceptance_covered: number; coverage_pct: number | null;
  delta: { added: number; changed: number; unchanged: number; removed: number } | null;
} | null;
export type DesignDoc = {
  id: string; name: string; kind?: string | null; signature?: string | null; path?: string | null;
  status?: "added" | "changed" | "unchanged" | "removed" | null;
  intent?: string | null; covers?: string[];
};
export type BlueprintDelta = {
  added?: string[]; changed?: string[]; unchanged?: string[]; removed?: string[];
  by_id?: Record<string, "added" | "changed" | "unchanged" | "removed">;
  counts?: { added: number; changed: number; unchanged: number; removed: number };
} | null;

export type Blueprint = {
  contract_slug: string;
  blueprint?: null;          // present + null ⇒ no blueprint yet (v1 / undesigned)
  blueprint_id?: number;
  version?: number;
  blocks?: Block[];          // the recursive Block tree (top level = file blocks)
  bindings?: Binding[];
  coverage?: Array<{ acceptance_id?: string; maps_to_blocks?: string[] }>;
  planned_nodes?: PlannedNode[];   // the AST-skeleton planned graph (atlas-native)
  planned_edges?: PlannedEdge[];
  delta?: BlueprintDelta;          // planned vs current atlas, keyed by node id
  stub_files?: StubFile[];         // the code stub per file (for the node-click code view + stubs diff)
  composed_files?: StubFile[];     // the authored snippets composed per file (for the snippets diff)
  change_description?: string | null; // the cached LOW-AI change narrative (blueprint-describe)
  design_digest?: DesignDigest;    // the design "snapshot" metrics
  design_docs?: DesignDoc[];       // per-symbol design doc-cards
  authored_count?: number;
  judgments?: { design: BlueprintJudgment; code: BlueprintJudgment };
  lint_passed?: boolean;
};

function unwrap(r: any): Blueprint | null {
  if (!r || isNotWired(r)) return null;
  if (r.contract_slug != null) return r as Blueprint;
  if (r.result && r.result.contract_slug != null) return r.result as Blueprint;
  return null;
}

// The active blueprint for a CONTRACT slug, or null on a transient/unwired read.
// A designed-but-empty contract returns { blueprint: null } (the tab shows Empty).
export async function getBlueprint(contractSlug: string): Promise<Blueprint | null> {
  const r = await apiPost(`/api/v1/blueprint/get`, { contract_slug: contractSlug });
  return unwrap(r);
}

// Generate (or return cached) the CHANGE narrative — a LOW-AI essay of what the change does.
export async function describeBlueprint(contractSlug: string, force = false): Promise<{ summary_md: string | null; cached: boolean } | null> {
  const r = await apiPost(`/api/v1/blueprint/describe`, { contract_slug: contractSlug, force }, { timeoutMs: 60_000 });
  if (!r || isNotWired(r)) return null;
  const v = r.summary_md != null || r.cached != null ? r : (r.result ?? null);
  return v ? { summary_md: v.summary_md ?? null, cached: !!v.cached } : null;
}
