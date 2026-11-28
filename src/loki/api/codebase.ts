// EPIC-CODEBASE-ATLAS: the brownfield code map client. Reads the atlas — the
// {nodes, edges} graph the BE renders out of code.sqlite — and runs the two
// query/mutation companions:
//   • getAtlas      → POST /api/v1/codebase/get     (render the graph)
//   • blastRadius   → POST /api/v1/codebase/blast   ("what breaks if I change this")
//   • ingestCodebase→ POST /api/v1/codebase/ingest  ((re)build the atlas of a root)
// All three dispatch system.codebase.* server-side; action-run may hand the
// skill result back directly or nested under .result, so each unwraps both.
// Mirrors the blueprint.ts client style (typed responses + a null-safe unwrap).
import { apiPost, isNotWired, engineError, getRequestWorkspace } from "./client";

// A node in the code graph. For a file node, id === path. Defs (functions,
// classes, components, hooks…) carry a parent_id pointing at their file node.
export type CodeNode = {
  id: string;
  origin: string;
  path: string;
  type: string;            // file | function | class | method | component | hook | …
  name: string | null;
  signature: string | null;
  intent: string | null;
  parent_id: string | null;
  became: string | null;
  from_blueprint: number | null;
  tokens?: number | null;  // file nodes only, when getAtlas({with_tokens}) — estimated ~bytes/4
};

// A directed edge between two nodes (imports | calls | uses | …).
export type CodeEdge = {
  from_node: string;
  to_node: string;
  type: string;
  /** imports only: value | type | dynamic | reexport — type-only edges are erased at compile time and excluded from coupling */
  kind?: string | null;
};

// POST /api/v1/codebase/get → the atlas graph for an origin.
export type AtlasResponse = {
  origin: string;
  nodes: CodeNode[];
  edges: CodeEdge[];
  node_count: number;
  edge_count: number;
  file_tokens?: Record<string, number>;  // path → estimated tokens (with_tokens)
  total_tokens?: number;                  // whole-codebase estimate
  file_count?: number;
};

// POST /api/v1/codebase/blast → reverse-dependency closure of the seeds.
export type BlastResponse = {
  seeds: string[];
  affected: string[];
  affected_tests: string[];
  count: number;
};

// POST /api/v1/codebase/ingest → counts from a (re)build of a checked-out root.
export type IngestError = { path: string; error: string };
export type IngestResponse = {
  root: string;
  files: number;
  nodes: number;
  edges: number;
  call_edges: number;
  unresolved: number;
  errors: IngestError[];
};

// POST /api/v1/codebase/onboard → onboard an existing codebase as a native project
// (scope → ingest → metrics → test-map → digest, + a durable 'reference' memory).
export type FileRank = { path: string; fan_in: number };
export type OnboardProfile = {
  root: string;
  languages: Record<string, number>;
  files: number;
  nodes: number;
  edges: number;
  call_edges: number;
  unresolved_imports: number;
  parse_errors: number;
  top_central: FileRank[];
  top_risky: FileRank[];
  top_churn?: { path: string; churn: number }[];
  top_complex?: { path: string; complexity: number }[];
  coverage: { covered: number; uncovered: number; tests: number };
  entry_points: { route: number; ui: number; data: number } | null;
  // the CONSTITUTION verdict of this rebuild (deterministic) + the specialists it derived
  constitution?: { snapshot_id?: number; health?: number; violations?: number; judged?: number; carried?: number; error?: string } | null;
  agents?: { count: number; by_category: Record<string, number>; languages: string[]; frameworks: string[]; error?: string } | null;
  digest_md: string | null;
};
export type OnboardResponse = { root: string; profile: OnboardProfile; memory_id: number | null };

// Background onboarding is a JOB: start it → poll its phase → read the profile when done.
export type OnboardPhase = "queued" | "scope" | "ingest" | "metrics" | "testmap" | "entrypoints" | "constitution" | "agents" | "digest" | "report" | "rag" | "memory" | "register" | "done";
export const ONBOARD_PHASES: OnboardPhase[] = ["scope", "ingest", "metrics", "testmap", "entrypoints", "constitution", "agents", "digest", "report", "rag", "memory", "register", "done"];

// Atlas Insights (EPIC atlas-insights): the graded x-ray — score + structural smells + vulns.
export type Smell = { kind: string; severity: "high" | "medium" | "low"; nodes: string[]; detail: string };
export type RiskFile = { path: string; risk: number; health: number; factors: { fan_in: number; complexity: number; churn: number; uncovered: number } };
// Wave C — a known-CVE dependency finding (lockfile → OSV).
export type VulnSeverity = "critical" | "high" | "moderate" | "low" | "unknown";
export type Vuln = {
  ecosystem: string; package: string; version: string;
  cve: string; osv_id: string; severity: VulnSeverity;
  fixed_in: string | null; summary: string | null;
};
export type VulnCounts = { critical: number; high: number; moderate: number; low: number; unknown: number; total: number };
export type DepsAudit = { vulns: Vuln[]; scanned: number; sources: string[]; online: boolean; counts: VulnCounts };
export type ProjectReport = {
  report_id: number | null;
  origin: string;
  project: { health: number; risk: number };
  scores?: { project: { health: number; risk: number }; top_risk: RiskFile[] };
  top_risk?: RiskFile[];
  smells: Smell[];
  vulns?: Vuln[] | null;
  review_md?: string | null; // Wave D — the AI project review (null until summarize:true)
  counts?: { files: number; health: number; risk: number; smells: Record<string, number>; vulns?: VulnCounts };
  created_at?: string;
  trend?: { health: number; risk: number; smells: number; vulns?: number; created_at: string }[];
};
// Wave D — the AI project review grounded in score + smells (+ vulns).
export type InsightsReview = { review_md: string | null; ok: boolean; error?: string; grounded: { files: number; smells: number; vulns: number | null; spine?: number } };
export type OnboardStart = { job_id: string; root: string; phase: "queued"; status: "running" };
// Live ingest map-reduce progress (one folder-family at a time, stitched at the end).
// stage 'map' = parsing family_index/families_total; 'stitch' = binding (step names the stage:
// imports → symbols → calls → flow → write); 'paused' = stopping at the family boundary.
export type OnboardStep = {
  stage: "map" | "stitch" | "paused";
  step?: "imports" | "symbols" | "calls" | "flow" | "write" | null;
  families_total: number;
  family_index: number;
  folder: string | null;
  family_files: number;
  files_done: number;
  files_total: number;
  nodes: number;
  file?: string | null; // the file being parsed at the last flush (pinpoints a stall)
  families_reused?: number; // resume: checkpointed families reloaded without reparsing
  slow_file?: string; // a single file that ate >1.5s — named the moment it finishes
  slow_ms?: number;
};
// One named piece of a phase: run → ok|fail (with duration + the error), or skip (with why).
// This is how the wizard shows WHICH piece of a phase broke, never just the phase name.
export type OnboardSubStep = { name: string; status: "run" | "ok" | "fail" | "skip"; ms?: number; error?: string; info?: string; progress?: { done: number; total?: number } };
// One completed folder-family of the partitioned ingest — the per-family half of the pipeline.
export type OnboardFamilyRow = { ix: number; folder: string; files: number; nodes: number; ms: number; errors: number; reused: boolean; slowest?: { file: string; ms: number } | null; entries?: number; tokens?: number; comps?: number; signals?: number };
// REBUILD-WIZARD detail — the one structured object the onboard maintains on the job row:
// the live current step, the families summary, a bounded rolling log, per-phase durations,
// and the per-phase sub-steps.
export type OnboardDetail = {
  current: OnboardStep | { phase: string } | null;
  families: { total: number; done: number; reused: number } | null;
  family_list?: OnboardFamilyRow[];
  log: Array<{ t: string; line: string }>;
  phase_ms: Record<string, number>;
  steps?: Record<string, OnboardSubStep[]>;
  // the constitution DOCKET — the deterministic court case: which laws govern this repo and why
  docket?: { frameworks: string[]; laws_total: number; laws_scoring: number; exceptions: number; laws: Array<{ key: string; title: string; scope: string; detector: string; weight: number; why: string; active: boolean }> } | null;
  // waves B/C/D — the deterministic signal rollup (safety · debt · history · i18n)
  signals?: { total: number; counts: { high: number; medium: number; low: number }; by_category: Record<string, Record<string, Record<string, number>>>; rows?: Array<{ category: string; kind: string; severity: string; path: string; line: number | null; detail: string }> } | null;
  tokens?: { total: number; done: number } | null; // regressive token countdown (ingest consumes them family by family)
  metrics_signals?: Record<string, { top: string; unit: string }> | null; // the ONE metrics pass, decomposed into its signals
  specialists?: Array<{ title: string; category: string }> | null; // the derived reviewer roster (for the circle animation)
  resumed?: boolean;
};
export type OnboardJob = {
  job_id: string;
  root: string;
  phase: OnboardPhase;
  status: "running" | "done" | "error" | "failed" | "paused" | "pause_requested";
  profile: OnboardProfile | null;
  error: string | null;
  detail?: OnboardDetail | null;
  created_at?: string;
  updated_at?: string;
};

// POST /api/v1/codebase/find → resolve a name / path fragment to node(s) + neighbors.
export type SymbolNeighbor = { id: string; path: string; name: string | null; type: string };
export type SymbolMatch = { node: CodeNode; neighbors: SymbolNeighbor[] };
export type FindResponse = { query: string; origin: string; count: number; matches: SymbolMatch[] };

// POST /api/v1/codebase/metrics → per-file fan-in/out + central / risky.
export type FileMetric = {
  path: string; fan_in: number; fan_out: number; loc: number;
  symbol_count: number; is_test: boolean; covered: boolean;
  complexity?: number; churn?: number | null;
  // GRAVITY: decomposed complexity → two indices. gravity = mass (box AREA on the map);
  // badness = health 0..1 (box COLOR, green→red); gravity_parts = the named signals (the WHY).
  gravity?: number; badness?: number;
  gravity_parts?: { size: number; complexity: number; coupling: number; density: number; churn: number; untested: number };
  // LENSES (the finviz mode switch): same boxes, alternate 0..1 color channels + their raw drivers.
  cascade?: number;        // files that break (transitively) if this one breaks
  authors?: number | null; // distinct recent authors (git); null = no history
  debt?: number;           // TODO/HACK/unused markers in this file
  lens?: { health: number; cascade: number; ownership: number; debt: number; heat: number };
};
export type MetricsResponse = {
  origin: string; file_count: number;
  metrics_by_file: Record<string, Omit<FileMetric, "path">>;
  top_central: FileMetric[]; top_risky: FileMetric[];
  top_churn?: FileMetric[]; top_complex?: FileMetric[]; top_gravity?: FileMetric[];
};

// POST /api/v1/codebase/testmap → test→source coverage (+ the inverse).
export type TestMapResponse = {
  origin: string; test_count: number; source_count: number;
  covered_count: number; uncovered_count: number;
  tests: { path: string; covers: string[] }[];
  coverage_by_source: Record<string, string[]>;
};

// action-run hands the skill result back either directly or nested under
// .result; `key` is a field guaranteed present on a real result so we can tell
// the two apart (and reject the not-wired sentinel / transient null).
function unwrap<T>(r: any, key: keyof T): T | null {
  if (!r || isNotWired(r)) return null;
  if (r[key] != null) return r as T;
  if (r.result && r.result[key] != null) return r.result as T;
  return null;
}

// EPIC-CODE-DESCRIPTIONS: a file's conceptual description — deterministic facts (gathered on rebuild)
// + a LOW-AI essay (on-demand + cached). `stale` = the file changed since the facts were gathered.
export type FileDescription = {
  path: string; origin: string;
  facts: { role?: string; symbols?: Array<{ name?: string; kind?: string; signature?: string; summary?: string }>; imports?: string[]; dependents?: string[]; n_symbols?: number } | null;
  summary_md: string | null; has_essay: boolean; stale: boolean; model_id?: string | null; generated_at?: string | null;
};
export async function descriptionGet(args: { path: string; origin?: string }): Promise<FileDescription | null> {
  const r = await apiPost(`/api/v1/codebase/describe/get`, { ...args });
  return unwrap<FileDescription>(r, "path");
}
export async function describeFile(args: { path: string; origin?: string; force?: boolean }): Promise<{ path: string; summary_md: string | null; facts: any; cached: boolean } | null> {
  const r = await apiPost(`/api/v1/codebase/describe`, { ...args }, { timeoutMs: 60_000 });
  return unwrap<{ path: string; summary_md: string | null; facts: any; cached: boolean }>(r, "path");
}

// EPIC-TYPECHECK: which typecheckers are relevant to the codebase + installed; download one; run them.
export type TypecheckLang = { id: string; label: string; pkg: string; exts: string[]; file_count: number; present: boolean; installed: boolean };
export type TypecheckStatus = { tools_dir: string; languages: TypecheckLang[] };
export type TypecheckFinding = { file: string; line: number; col: number; code: string; message: string };
export type TypecheckRun = { ok: boolean; checked: string[]; skipped: Array<{ path: string; reason: string }>; capped: number; findings: TypecheckFinding[]; by_checker: Record<string, { checked: number; findings: number }> };

export async function typecheckStatus(): Promise<TypecheckStatus | null> {
  const r = await apiPost(`/api/v1/codebase/typecheck/status`, {});
  return unwrap<TypecheckStatus>(r, "languages");
}
export async function typecheckInstall(args: { checker: string }): Promise<{ checker: string; installed: boolean; ok: boolean; log: string } | null> {
  // npm install — slow (~15–40s); give it room.
  const r = await apiPost(`/api/v1/codebase/typecheck/install`, { ...args }, { timeoutMs: 300_000 });
  return unwrap<{ checker: string; installed: boolean; ok: boolean; log: string }>(r, "checker");
}
export async function typecheckRun(args: { files?: Array<{ path: string; source?: string }>; scope?: "all" }): Promise<TypecheckRun | null> {
  const r = await apiPost(`/api/v1/codebase/typecheck/run`, { ...args }, { timeoutMs: 300_000 });
  return unwrap<TypecheckRun>(r, "checked");
}

// EPIC-TYPECHECK: style linters (eslint via npm, ruff via PATH) — relevant + available; download; run.
export type LinterInfo = { id: string; label: string; via: "npm" | "path"; pkg: string | null; exts: string[]; file_count: number; present: boolean; installed: boolean };
export type LintStatus = { tools_dir: string; linters: LinterInfo[] };
export type LintRun = { ok: boolean; ran: string[]; checked: string[]; skipped: Array<{ path?: string; linter?: string; reason: string }>; findings: TypecheckFinding[]; by_linter: Record<string, { checked: number; findings: number }> };

export async function lintStatus(): Promise<LintStatus | null> {
  const r = await apiPost(`/api/v1/codebase/lint/status`, {});
  return unwrap<LintStatus>(r, "linters");
}
export async function lintInstall(args: { linter: string }): Promise<{ linter: string; installed: boolean; ok: boolean; via?: string; reason?: string; log?: string } | null> {
  const r = await apiPost(`/api/v1/codebase/lint/install`, { ...args }, { timeoutMs: 300_000 });
  return unwrap<{ linter: string; installed: boolean; ok: boolean }>(r, "linter");
}
export async function lintRun(args: { scope?: "all"; files?: Array<{ path: string }> } = { scope: "all" }): Promise<LintRun | null> {
  const r = await apiPost(`/api/v1/codebase/lint/run`, { ...args }, { timeoutMs: 300_000 });
  return unwrap<LintRun>(r, "ran");
}

// EPIC-TYPECHECK P2: the rebuild parse-health snapshot — files that should parse but didn't.
export type ParseHealthFile = { path: string; lang: string | null; status: "fail" | "degraded" | "skipped"; detail: string };
export type ParseHealth = { origin: string; total_files: number; clean: number; fail: number; degraded: number; skipped: number; files: ParseHealthFile[] };
export async function parseHealth(args: { origin?: string } = {}): Promise<ParseHealth | null> {
  const r = await apiPost(`/api/v1/codebase/parse-health`, { ...args });
  return unwrap<ParseHealth>(r, "total_files");
}

export type GetAtlasArgs = { origin?: string; path?: string; limit?: number; with_tokens?: boolean };

// The atlas graph for an origin (defaults to 'atlas', the existing code's map).
// Pass `path` to restrict to one file's nodes + the edges touching them.
export async function getAtlas(args: GetAtlasArgs = {}): Promise<AtlasResponse | null> {
  const r = await apiPost(`/api/v1/codebase/get`, {
    ...(args.origin ? { origin: args.origin } : {}),
    ...(args.path ? { path: args.path } : {}),
    ...(args.limit != null ? { limit: args.limit } : {}),
    ...(args.with_tokens ? { with_tokens: true } : {}),
  }, { timeoutMs: 45000 }); // a big atlas outlives the 5s default (live: 5.27s read → abort → fake "can&apos;t reach")
  return unwrap<AtlasResponse>(r, "node_count");
}

// Reverse-dependency blast radius: "if I change these nodes, what depends on
// them?" — the transitive closure of everything pointing AT the seeds, plus the
// affected test files.
export async function blastRadius(args: { node_ids: string[] }): Promise<BlastResponse | null> {
  const r = await apiPost(`/api/v1/codebase/blast`, { node_ids: args.node_ids });
  return unwrap<BlastResponse>(r, "affected");
}

// (Re)build the atlas of a checked-out folder. Walks `root` (skipping
// node_modules/build/…), parses each source file, and writes the linked graph.
// A whole-repo parse is heavy server-side, so allow well past the 5s default.
// root optional — omitted → the BE defaults to the active workspace's root_path (the workspace IS the codebase).
export async function ingestCodebase(args: { root?: string } = {}): Promise<IngestResponse | null> {
  const r = await apiPost(`/api/v1/codebase/ingest`, { root: args.root }, { timeoutMs: 300_000 });
  return unwrap<IngestResponse>(r, "nodes");
}

// codebase-refresh: the "code changed -> keep the derived world coherent" orchestrator. detect_only
// returns the change set (arrays) without mutating — the drift banner; a full run returns counts.
export type CodebaseRefresh = {
  detect_only: boolean;
  changed: string[] | number; added?: string[] | number; deleted?: string[] | number; dirty?: number;
  reparsed?: number; closure_added?: number; edges?: number; flow_edges?: number;
  entry_points?: { route: number; ui: number; data: number; added: number; removed: number } | null;
  stories?: { ok: number; broken: number; broken_ids: number[] };
  snapshots_stale?: number;
};
export async function refreshCodebase(args: { detect_only?: boolean; mode?: string } = {}): Promise<CodebaseRefresh | null> {
  const r = await apiPost(`/api/v1/codebase/refresh`, { ...args }, { timeoutMs: 120_000 });
  return unwrap<CodebaseRefresh>(r, "snapshots_stale");
}

// Per-workspace SCOPE config: excluded folders + in-scope file globs (the extension allowlist). A
// rebuild applies the saved scope, so this defines what the atlas indexes. supported_exts = the
// parseable extensions the FE renders as toggles.
export type ScopeConfig = { origin: string; exclude: string[]; include: string[]; supported_exts: string[] };

export async function scopeGet(args: { origin?: string } = {}): Promise<ScopeConfig | null> {
  const r = await apiPost(`/api/v1/codebase/scope/get`, { ...args });
  return unwrap<ScopeConfig>(r, "supported_exts");
}

export async function scopeSet(
  args: { exclude?: string[]; include?: string[]; origin?: string },
): Promise<{ origin: string; exclude: string[]; include: string[] } | null> {
  const r = await apiPost(`/api/v1/codebase/scope/set`, { ...args });
  return unwrap<{ origin: string; exclude: string[]; include: string[] }>(r, "include");
}

// Entry points: the codebase external surface (routes/db/ui). Recomputed on rebuild; read here,
// optionally scoped to one file (path) or one folder (prefix). latest_snapshot carries drift.
export type EntryPoint = {
  kind: "route" | "ui" | "data"; subtype: string; node_id: string | null; path: string;
  label: string; http_method: string | null; detail: string | null; confidence: number;
  line: number | null; framework: string | null;
};
export type EntryPointsResult = {
  origin: string; total: number; counts: { route: number; ui: number; data: number };
  by_kind: Record<"route" | "ui" | "data", EntryPoint[]>;
  by_path: Record<string, EntryPoint[]>;
  items: EntryPoint[];
  latest_snapshot: { captured_at: string; counts: Record<string, number>; diff: { added: any[]; removed: any[] } | null } | null;
};

export async function entryPointsGet(args: { origin?: string; path?: string; prefix?: string } = {}): Promise<EntryPointsResult | null> {
  const r = await apiPost(`/api/v1/codebase/entrypoints/get`, { ...args });
  return unwrap<EntryPointsResult>(r, "by_kind");
}

// Kick off a NON-BLOCKING background onboarding of an existing codebase (scope → ingest →
// metrics → test-map → digest, + a durable memory). Returns a job id IMMEDIATELY; the heavy
// analysis runs server-side while the user keeps using the app. Poll onboardStatus(job_id)
// for live per-phase progress, and read the profile when phase === 'done'.
// root optional — omitted → the BE defaults to the active workspace's root_path (the workspace IS
// the codebase). include/exclude carry the scope filter (which folders/extensions are in scope).
export async function onboardStart(args: {
  root?: string; include?: string[]; exclude?: string[]; summarize?: boolean;
  resume_job_id?: string; // REBUILD-WIZARD: re-fire an interrupted job from its family checkpoints
} = {}): Promise<OnboardStart | null> {
  // a page about another space (a team's tree) indexes THAT folder: the serve's own default is the workspace it has open
  const named = args.root ?? (typeof getRequestWorkspace === "function" ? getRequestWorkspace() ?? undefined : undefined);
  const r = await apiPost(`/api/v1/codebase/onboard/start`, { ...args, ...(named ? { root: named } : {}) });
  return unwrap<OnboardStart>(r, "job_id");
}

// REBUILD-WIZARD: the most recent job whoever started it (FE click, auto-onboard, resumed child
// process) — the wizard ADOPTS a live one instead of watching a stale persisted id.
export async function onboardLatest(): Promise<Pick<OnboardJob, "job_id" | "status" | "phase"> | null> {
  return apiPost(`/api/v1/dispatch`, { action_name: "system.codebase.onboard.latest", input: {} });
}

// REBUILD-WIZARD: ask a running rebuild to pause at the next family boundary (completed families
// stay checkpointed; resume re-loads them without reparsing). Via the generic action dispatch.
export async function onboardPause(jobId: string): Promise<{ job_id: string; status: string } | null> {
  return apiPost(`/api/v1/dispatch`, { action_name: "system.codebase.onboard.control", input: { job_id: jobId, op: "pause" } });
}

/**
 * Poll a background onboarding job: its live phase, status, and (once done) the project profile.
 *
 * THREE OUTCOMES, and the third is why this is not just `T | null`:
 *   OnboardJob — the job answered.
 *   null       — a TRANSIENT miss (timeout, BE mid-heavy-phase). Keep polling; the job is alive.
 *   "gone"     — the engine said NOT_FOUND. That is TERMINAL: this id will never resolve, no
 *                matter how long anyone waits.
 *
 * Collapsing "gone" into null is what produced an infinite NOT_FOUND loop: the job id is persisted
 * across restarts, so after code_onboard_jobs moved schemas the remembered id resolved to nothing
 * and the poller — correctly refusing to abandon a job over a transient miss — retried forever and
 * filled the log. A caller cannot make the right call on a distinction it never receives.
 */
export type OnboardStatusResult = OnboardJob | null | "gone";

export async function onboardStatus(args: { job_id: string }): Promise<OnboardStatusResult> {
  const r = await apiPost(`/api/v1/codebase/onboard/status`, { job_id: args.job_id }, { timeoutMs: 20_000 });
  if (engineError(r)?.code === "NOT_FOUND") return "gone";
  return unwrap<OnboardJob>(r, "phase");
}

// Resolve a name / partial name / path fragment → ranked node(s) + neighbors (the
// citation primitive; powers the atlas search box).
export async function findSymbol(args: { query: string; limit?: number; origin?: string }): Promise<FindResponse | null> {
  const r = await apiPost(`/api/v1/codebase/find`, { ...args });
  return unwrap<FindResponse>(r, "matches");
}

// Per-file fan-in/out + central/risky signals.
export async function getMetrics(args: { origin?: string; top?: number } = {}): Promise<MetricsResponse | null> {
  const r = await apiPost(`/api/v1/codebase/metrics`, { ...args });
  return unwrap<MetricsResponse>(r, "metrics_by_file");
}

// ARCHITECTURE OVER TIME — the health/cycles/coverage timeline + latest structural incident, from
// the append-only digest snapshots (local, deterministic, no runtime telemetry).
export type HistoryPoint = { id: number; at: string; files: number | null; health: number | null; risk: number | null; cycles: number | null; coverage: number | null; smells: number | null; fan_in: number | null; d_health?: number | null; d_cycles?: number | null; d_coverage?: number | null };
export type HistoryTrendPt = { health: number; at: string; delta: number };
export type HistoryIncident = { severity: "high" | "medium" | "improved" | "info"; at: string; from_at: string; summary: string; d_health: number | null; d_cycles: number | null; d_coverage: number | null; d_files: number | null; d_smells: number | null; new_risky: string[]; entry_points: { added: number; removed: number } | null };
export type CodeHistory = { origin: string; count: number; points: HistoryPoint[]; trend: { now: number | null; month: HistoryTrendPt | null; quarter: HistoryTrendPt | null }; incident: HistoryIncident | null };
export async function historyGet(args: { origin?: string; limit?: number } = {}): Promise<CodeHistory | null> {
  const r = await apiPost(`/api/v1/codebase/history`, { ...args });
  return unwrap<CodeHistory>(r, "points");
}

// HISTORY REVIEW (snapshot axis) — the file review scored across time, from judgments.review_scores.
export type ReviewSnap = { id: number; at: string; files: number; avg_health: number | null; avg_score: number | null };
export type ReviewMover = { path: string; from: number; to: number; delta: number; series: (number | null)[] };
export type AxisDrift = { axis: string; from: number | null; to: number | null; delta: number };
export type ReviewHistory = { snapshot_count: number; file_count: number; timeline: ReviewSnap[]; movers: { improved: ReviewMover[]; regressed: ReviewMover[] }; axes_drift: AxisDrift[]; insufficient?: boolean };
export async function reviewHistoryGet(args: { limit?: number; top?: number } = {}): Promise<ReviewHistory | null> {
  const r = await apiPost(`/api/v1/codebase/review-history`, { ...args });
  return unwrap<ReviewHistory>(r, "timeline");
}

// HISTORY REVIEW OF ONE FILE — per-snapshot health/axes + review comments + the ratchet (for the tab).
export type ReviewComment = { line: number | null; law_key: string; law_scope?: string; severity?: string; weight?: number; confidence?: number; symbol?: string; evidence?: string; category?: string | null };
export type FileReviewSnap = { id: number; at: string; health: number | null; score: number | null; axes: Record<string, number>; violations: ReviewComment[]; added: string[]; fixed: string[]; sha: string | null; content: string | null; lines: number; engineering_version?: string | null; constitution_hash?: string | null };
export type FileReviewHistory = { path: string; snapshot_count: number; snapshots: FileReviewSnap[] };
// discriminated result so the tab can say WHY it's empty (not-wired BE vs engine error vs genuinely no snapshots)
export type FileReviewHistoryResult = FileReviewHistory | { unavailable: "not_wired" | "engine_error"; detail?: string } | null;
export async function fileReviewHistoryGet(args: { path: string; limit?: number }): Promise<FileReviewHistoryResult> {
  const r = await apiPost(`/api/v1/codebase/file-review-history`, { ...args });
  if (isNotWired(r)) return { unavailable: "not_wired" };
  const eng = engineError(r);
  if (eng) return { unavailable: "engine_error", detail: eng.cause || eng.code };
  return unwrap<FileReviewHistory>(r, "snapshots");
}

// PER-FILE cinematic replay — a file's git revisions + its content at each, to scrub in the reader.
export type FileRevision = { sha: string; short: string; author: string; date: string; subject: string; content: string; lines: number; violations?: ReviewComment[] };
export type FileHistory = { path: string; count: number; revisions: FileRevision[]; error?: string };
export async function fileHistory(args: { path: string; limit?: number }): Promise<FileHistory | null> {
  const r = await apiPost(`/api/v1/code/file/history`, { ...args });
  // A real engine error (bad workspace root, git unavailable) is NOT "restart the
  // BE" — surface its cause. Only the not-wired sentinel collapses to null (→ the
  // caller's "action not live; restart the BE" message, which is then accurate).
  const eng = engineError(r);
  if (eng) return { path: args.path, count: 0, revisions: [], error: `engine error: ${eng.cause || eng.code}` };
  return unwrap<FileHistory>(r, "revisions");
}

// THE AUTHORS LAYER — author↔file graph, co-dependency, bus-factor, deterministic from git. Avatars local.
export type Author = { id: string; name: string; email: string; commits: number; files: number; first: string; last: string; solo: number; files_list: string[] };
export type AuthorFileNode = { path: string; authors: number; touches: number };
export type AuthorEdge = { author: string; path: string; touches: number };
export type CodepPair = { a: string; b: string; shared: number };
export type BusFactor = { total_files: number; solo_files: number; top_solo: { id: string; name: string; solo: number }[] };
export type Authors = { root: string | null; commit_count: number; author_count: number; authors: Author[]; files: AuthorFileNode[]; edges: AuthorEdge[]; codep: CodepPair[]; bus_factor: BusFactor | null; error?: string };
export async function authorsGet(args: { limit?: number; top_authors?: number; files_per_author?: number } = {}): Promise<Authors | null> {
  const r = await apiPost(`/api/v1/code/authors`, { ...args });
  return unwrap<Authors>(r, "authors");
}

// SUBSTRATE SELF-OBSERVABILITY — "Grafana for antiloki itself": AI cost/latency + rebuild phase
// timings, first-party (brain.ai_calls + the rebuild phase_ms), no telemetry vendor.
export type TelemetrySeries = { day: string; calls: number; cost: number; avg_ms: number | null };
export type SubstrateTelemetry = {
  window_hours: number;
  ai: {
    calls: number; cost_usd: number; tokens_in: number; tokens_out: number; cache_hit_pct: number | null; avg_ms: number | null;
    series: TelemetrySeries[];
    by_prompt: { name: string; calls: number; cost: number; avg_ms: number | null }[];
    by_provider: { provider: string; calls: number; cost: number }[];
    by_tier: { tier: string; calls: number; cost: number }[];
  };
  rebuild: { runs: number; phases: { phase: string; avg_ms: number; last_ms: number }[]; series: { at: string; total_ms: number }[] };
};
export async function telemetryGet(args: { window_hours?: number } = {}): Promise<SubstrateTelemetry | null> {
  const r = await apiPost(`/api/v1/codebase/telemetry`, { ...args });
  return unwrap<SubstrateTelemetry>(r, "ai");
}

// OWNED-SURFACE RUNTIME — the real executed-line signal from YOUR test suite (lcov), local.
export type CoverageFile = { path: string; pct: number; hit: number; total: number };
export type Coverage = { total_pct: number | null; count: number; ran: boolean; cmd?: string; run_error?: string; files: CoverageFile[]; line_hits?: Record<number, number>; error?: string };
export async function coverageGet(args: { run?: boolean; cmd?: string; path?: string; timeout_ms?: number } = {}): Promise<Coverage | null> {
  const r = await apiPost(`/api/v1/codebase/coverage`, { ...args });
  return unwrap<Coverage>(r, "files");
}

// Test→source coverage (+ the inverse).
export async function getTestMap(args: { origin?: string } = {}): Promise<TestMapResponse | null> {
  const r = await apiPost(`/api/v1/codebase/testmap`, { ...args });
  return unwrap<TestMapResponse>(r, "coverage_by_source");
}

// Atlas Insights: run + persist the graded x-ray (score + smells [+ a deps vuln scan] [+ an AI
// review]) → a ProjectReport snapshot. deps:true → OSV dependency scan; summarize:true → the
// mid-tier AI project review (a paid provider call). Both default off (offline-safe).
export async function runReport(args: { origin?: string; root?: string; deps?: boolean; summarize?: boolean } = {}): Promise<ProjectReport | null> {
  const r = await apiPost(`/api/v1/codebase/report`, { ...args }, { timeoutMs: 120_000 });
  return unwrap<ProjectReport>(r, "project");
}

// Wave C: scan the project's lockfile(s) for known-CVE dependencies via OSV (display-only — no
// snapshot). Root defaults server-side to the active workspace. Degrades cleanly offline.
export async function depsAudit(args: { root?: string; origin?: string } = {}): Promise<DepsAudit | null> {
  const r = await apiPost(`/api/v1/codebase/deps/audit`, { ...args }, { timeoutMs: 60_000 });
  return unwrap<DepsAudit>(r, "vulns");
}

// Read the newest snapshot + a trend (no recompute). null when nothing has been run yet.
export async function latestReport(args: { origin?: string } = {}): Promise<ProjectReport | null> {
  const r = await apiPost(`/api/v1/codebase/report/latest`, { ...args });
  return unwrap<ProjectReport>(r, "project");
}

// Turn a structural smell into a backlog card (Insights → work generator for the driver).
export async function smellToCard(args: { smell: Smell }): Promise<{ card_slug: string; title: string } | null> {
  const r = await apiPost(`/api/v1/codebase/smell/card`, { smell: args.smell });
  return unwrap<{ card_slug: string; title: string }>(r, "card_slug");
}

// Wave D: a short advisory AI project review grounded in score + smells (+ optional vulns). Mid-
// tier (a paid provider call); advisory + non-gating. Degrades gracefully (ok:false) on failure.
export async function insightsReview(args: { origin?: string; root?: string; vulns?: Vuln[] } = {}): Promise<InsightsReview | null> {
  const r = await apiPost(`/api/v1/codebase/insights/review`, { ...args }, { timeoutMs: 120_000 });
  return unwrap<InsightsReview>(r, "ok");
}

// ── per-file intelligence zoom: raw source preview + a persisted AI snapshot ──
export type FileSource = { path: string; content: string; lines: number; bytes: number; truncated: boolean; sha256: string };
export type FileVuln = { severity: "critical" | "high" | "moderate" | "low"; issue: string; where: string };
export type FileSnapshot = {
  description: string; health: number; complexity: "low" | "medium" | "high";
  responsibilities: string[]; insights: string[]; vulnerabilities: FileVuln[]; smells: string[]; suggestions: string[];
};
export type SnapshotResult = { ok: boolean; path: string; snapshot?: FileSnapshot; snapshot_id?: number; model_id?: string; error?: string };
export type SnapshotGet = { path: string; snapshot: FileSnapshot | null; snapshot_id?: number; model_id?: string; created_at?: string; stale?: boolean };

// Read one file's source (workspace-rooted, path-safe) for the code preview.
export async function fileRead(args: { path: string; root?: string; max_bytes?: number }): Promise<FileSource | null> {
  const r = await apiPost(`/api/v1/codebase/file/read`, { ...args }, { timeoutMs: 30_000 });
  return unwrap<FileSource>(r, "content");
}

// SAVE FROM THE CODE EDITOR (operator 2026-10-11). `expected_sha256` is the version the editor loaded: the serve refuses (409) when the file has changed on disk since, so an agent's or git's edit is never overwritten
// unseen. Never throws: a refusal comes back as `{ ok: false, error }`, with `conflict: true` for the 409.
export type FileSaveResult = { ok: true; path: string; sha256: string; bytes: number; lines: number } | { ok: false; conflict?: boolean; error: string };
export async function fileSave(args: { path: string; content: string; expected_sha256: string }): Promise<FileSaveResult> {
  try {
    const r: any = await apiPost(`/api/v1/codebase/file/save`, { ...args }, { timeoutMs: 30_000, throwOnError: true });
    if (r && isNotWired(r)) return { ok: false, error: "this antiloki-serve does not have the editor's save yet - restart it" };
    if (r?.ok === true && typeof r.sha256 === "string") return r as FileSaveResult;
    return { ok: false, error: String(r?.error ?? "the save did not go through") };
  } catch (e: any) {
    const m = String(e?.message ?? e);
    return { ok: false, conflict: m.includes("→ 409"), error: m.replace(/^POST \S+ → \d+:?\s*/, "") || "the save failed" };
  }
}

// Generate + persist the per-file AI snapshot (fixed-template analysis). A paid mid-tier call.
export async function fileSnapshot(args: { path: string; origin?: string; root?: string }): Promise<SnapshotResult | null> {
  const r = await apiPost(`/api/v1/codebase/file/snapshot`, { ...args }, { timeoutMs: 120_000 });
  return unwrap<SnapshotResult>(r, "ok");
}

// Read the latest persisted snapshot for a file (+ stale flag). No AI.
export async function fileSnapshotGet(args: { path: string; origin?: string }): Promise<SnapshotGet | null> {
  const r = await apiPost(`/api/v1/codebase/file/snapshot/get`, { ...args });
  return unwrap<SnapshotGet>(r, "path");
}

// A bounded batch of file snapshots — the FE loops this until remaining=0 ("snapshot all"). Paid per file.
export type SnapshotBatch = { generated: number; failed: number; batch: number; total: number; with_snapshot: number; remaining: number };
export async function snapshotAll(args: { origin?: string; root?: string; limit?: number; force?: boolean } = {}): Promise<SnapshotBatch | null> {
  const r = await apiPost(`/api/v1/codebase/snapshot/all`, { ...args }, { timeoutMs: 180_000 });
  return unwrap<SnapshotBatch>(r, "total");
}

// A short AI explanation of ONE def (function/class/method). Low-tier; transient (not persisted).
export type SymbolExplain = { node_id: string; name: string | null; explanation: string | null; ok: boolean; error?: string };
export async function symbolExplain(args: { node_id: string; origin?: string }): Promise<SymbolExplain | null> {
  // 300s: a local Ollama low-tier model on CPU can take minutes for a few hundred tokens (the
  // adapter's own ceiling is 300s). A 60s cap aborted the fetch before the model answered and the
  // null surfaced as a misleading "(provider / key)" — so match the provider, don't undercut it.
  const r = await apiPost(`/api/v1/codebase/symbol/explain`, { ...args }, { timeoutMs: 300_000 });
  return unwrap<SymbolExplain>(r, "ok");
}

// A short AI explanation of an arbitrary code snippet (selected lines). Low-tier; transient.
export type SnippetExplain = { explanation: string | null; ok: boolean; error?: string };
export async function explainSnippet(args: { snippet: string; path?: string; lines?: string }): Promise<SnippetExplain | null> {
  // 300s — same local-CPU latency reality as symbolExplain above.
  const r = await apiPost(`/api/v1/codebase/explain/snippet`, { ...args }, { timeoutMs: 300_000 });
  return unwrap<SnippetExplain>(r, "ok");
}

// file-diagram = the blocks + logic INSIDE one file, generated DETERMINISTICALLY from its AST (no AI; fast).
export type FileDiagram = { ok: boolean; file?: string; diagram?: { title?: string; nodes: any[]; edges: any[] }; error?: string };
export async function fileDiagram(args: { path: string }): Promise<FileDiagram | null> {
  const r = await apiPost(`/api/v1/codebase/file-diagram`, { ...args }, { timeoutMs: 30_000 });
  return unwrap<FileDiagram>(r, "ok");
}

// codebase DIGEST = the deterministic full code-review snapshot (code_digests). The sections are
// reflected straight from the table columns (kind encoded in the column-name suffix), so the FE renders
// them generically — no hardcoded section list. snapshot = recompute + persist; latest = read newest.
export type DigestSection = { col: string; label: string; group: string; kind: "num" | "pct" | "json" | "md" | "text"; value: any };
export type CodeDigest = { ok: boolean; found?: boolean; digest_id?: number; created_at?: string; origin?: string; sections?: DigestSection[]; groups?: string[]; error?: string };
export async function digestLatest(args: { origin?: string } = {}): Promise<CodeDigest | null> {
  const r = await apiPost(`/api/v1/codebase/digest/latest`, { ...args });
  return unwrap<CodeDigest>(r, "ok");
}
export async function digestSnapshot(args: { origin?: string; skip_narrative?: boolean } = {}): Promise<CodeDigest | null> {
  const r = await apiPost(`/api/v1/codebase/digest/snapshot`, { ...args }, { timeoutMs: 180_000 });
  return unwrap<CodeDigest>(r, "ok");
}

// VIRTUAL decorators — deterministic doc-cards per code block (never written to source). One file = live;
// /decorators/doc = the persisted whole-codebase documentation; /decorate/all = re-sweep + persist.
export type Decorator = {
  name: string; kind: string; role: string; line: number; end_line?: number; signature: string;
  inputs: { name: string; kind: string }[]; output: { kind: string; label: string; detail?: string | null } | null;
  effects: string[]; calls: string[]; uses: string[]; complexity: number; flags: string[]; summary: string;
  steps?: { depth: number; kind: string; text: string }[]; // the deterministic logic trace
};
export type FileDecorators = { ok: boolean; file?: string; decorators?: Decorator[]; error?: string };
export type DecoratorsDoc = { ok: boolean; found?: boolean; files?: { path: string; decorators: Decorator[] }[]; by_role?: Record<string, number>; by_kind?: Record<string, number>; totals?: { files: number; blocks: number }; error?: string };
export async function decorateFile(args: { path: string }): Promise<FileDecorators | null> {
  const r = await apiPost(`/api/v1/codebase/decorate`, { ...args }, { timeoutMs: 30_000 });
  return unwrap<FileDecorators>(r, "ok");
}
export async function decoratorsDoc(args: { origin?: string } = {}): Promise<DecoratorsDoc | null> {
  const r = await apiPost(`/api/v1/codebase/decorators/doc`, { ...args });
  return unwrap<DecoratorsDoc>(r, "ok");
}
export async function decorateAll(args: { origin?: string } = {}): Promise<any> {
  return apiPost(`/api/v1/codebase/decorate/all`, { all: true, ...args }, { timeoutMs: 120_000 });
}

// EPIC-CODEBASE-DOCS-SITE: the deterministic documentation site — the whole model (tree + folder/file pages +
// cross-links + search index), composed from the persisted decorators + describe essays. No AI in the core.
// docsBuild → the FE renders the whole model client-side; docsPage({format:'md'}) → the didactic Markdown a
// machine (driver / vibe / notebooks / RAG) reads instead of raw source.
export type DocsSite = { ok: boolean; found?: boolean; tree?: any; pages?: Record<string, any>; index?: any[]; totals?: { files: number; folders: number; blocks: number }; error?: string };
export async function docsBuild(args: { origin?: string; with_tokens?: boolean } = {}): Promise<DocsSite | null> {
  // 180s: the whole-site payload (every page + blocks + tokens) is heavy on a big codebase — a
  // 30s abort returned null and the site view LIED "No documentation yet" (operator 2026-07-27).
  const r = await apiPost(`/api/v1/codebase/docs/build`, { build: true, ...args }, { timeoutMs: 180_000 });
  return unwrap<DocsSite>(r, "ok");
}
export async function docsPage(args: { page: string; origin?: string; format?: "json" | "md" }): Promise<any> {
  return apiPost(`/api/v1/codebase/docs/page`, { ...args }, { timeoutMs: 30_000 });
}
// a context pack (didactic Markdown of N files/folders) for a machine consumer; export = the whole site as Markdown.
export async function docsContext(args: { context: string[]; origin?: string }): Promise<any> {
  return apiPost(`/api/v1/codebase/docs/context`, { ...args }, { timeoutMs: 30_000 });
}
export async function docsExport(args: { origin?: string } = {}): Promise<any> {
  return apiPost(`/api/v1/codebase/docs/export`, { export: true, ...args }, { timeoutMs: 60_000 });
}
// WIDGET-COMMANDS: produce a widget's payload deterministically ({name, args?}) — the one path a widget
// button calls instead of re-asking the interviewer. Pure-DB widgets return instantly; the AI-shaped ones
// (code-sample) do a mid AI call + an optional diagram, so the timeout is generous (local tiers are slow).
export async function widgetGenerate(body: { name: string; args?: any }): Promise<any> {
  return apiPost(`/api/v1/widget/generate`, { ...body }, { timeoutMs: 180_000 });
}
// WIDGET⇄ARTIFACT: persist a generated widget into a notebook (defaults to a "Chat captures" notebook).
export async function widgetSave(body: { kind: string; payload: any; scope?: any; title?: string; request?: string; notebook_title?: string }): Promise<any> {
  return apiPost(`/api/v1/widget/save`, { ...body }, { timeoutMs: 30_000 });
}
// the AI codebase overview for the Dashboard (one cached LOW-AI call; long timeout — local low tier is slow).
export async function docsOverview(args: { origin?: string; path?: string; force?: boolean; cached_only?: boolean } = {}): Promise<any> {
  return apiPost(`/api/v1/codebase/docs/overview`, { ...args }, { timeoutMs: 240_000 });
}

// git/init — initialize git in the workspace (P0 of the regenerate-block epic). Idempotent + non-destructive.
export async function gitInit(args: { root?: string } = {}): Promise<any> {
  return apiPost(`/api/v1/codebase/git/init`, { ...args }, { timeoutMs: 120_000 });
}

// regenerate — P1: propose an AI rewrite of a selected block (PROPOSAL only; never writes the file).
export type RegenResult = { ok: boolean; path?: string; start_line?: number; end_line?: number; original?: string; proposed?: string; rationale?: string | null; error?: string };
export async function regenerateBlock(args: { path: string; start_line: number; end_line: number; instruction?: string }): Promise<RegenResult | null> {
  const r = await apiPost(`/api/v1/codebase/regenerate`, { ...args }, { timeoutMs: 180_000 });
  return unwrap<RegenResult>(r, "ok");
}
// P2 stage (sandbox, no real write) + P3 merge (gated apply, or {abandon} to discard). Raw response — caller checks ok.
export async function regenerateStage(args: { path: string; start_line: number; end_line: number; proposed: string; session_id: string }): Promise<any> {
  return apiPost(`/api/v1/codebase/regenerate/stage`, { ...args }, { timeoutMs: 120_000 });
}
export async function regenerateMerge(args: { session_id: string; path?: string; summary?: string; abandon?: boolean }): Promise<any> {
  return apiPost(`/api/v1/codebase/regenerate/merge`, { ...args }, { timeoutMs: 120_000 });
}
// run a code chunk ephemerally (playground): fixture `input` + optional `expected`. Nothing written.
export async function runChunk(args: { code: string; input?: string; expected?: string }): Promise<any> {
  return apiPost(`/api/v1/codebase/run`, { ...args }, { timeoutMs: 30_000 });
}
// deterministic parse-only lint of a chunk (playground).
export async function lintChunk(args: { code: string }): Promise<any> {
  return apiPost(`/api/v1/codebase/lint`, { ...args });
}
// driver snippet human-gate (get/set/pending/detail/approve/reject/edit).
export async function snippetGate(args: { mode: string; enabled?: boolean; contract_slug?: string; microtask_index?: number; patch_index?: number; block_id?: string; code?: string }): Promise<any> {
  return apiPost(`/api/v1/driver/snippet-gate`, { ...args });
}

// ── data stories: animated E2E data-flow journeys on the graph (levels 1-3) ──
export type StoryHop = {
  node_id: string; label?: string; sample_data?: any; branch?: boolean;
  meta?: { id: string; name: string | null; path: string; type: string } | null; exists?: boolean; edge_ok?: boolean | null;
};
export type DataStory = {
  id: number; name: string; description?: string | null; direction: "forward" | "backward"; linked_test?: string | null;
  hops: StoryHop[]; status: "ok" | "broken" | "empty"; broken: number; missing: number; test_covered?: { linked_test: string; exists: boolean } | null;
};
export type StoryListItem = { id: number; name: string; description?: string | null; direction: string; hop_count: number; linked_test?: string | null; updated_at?: string };
export type StoryProposal = { name: string; description: string; direction: string; hops: { node_id: string; label?: string }[] };

export async function storyList(args: { origin?: string } = {}): Promise<{ stories: StoryListItem[]; count: number } | null> {
  const r = await apiPost(`/api/v1/codebase/story/list`, { ...args });
  return unwrap<{ stories: StoryListItem[]; count: number }>(r, "stories");
}
export async function storyGet(args: { id: number; origin?: string }): Promise<DataStory | null> {
  const r = await apiPost(`/api/v1/codebase/story/get`, { ...args });
  return unwrap<DataStory>(r, "hops");
}
export async function storyAdd(args: { name: string; description?: string; direction?: string; hops: any[]; linked_test?: string }): Promise<{ id: number } | null> {
  const r = await apiPost(`/api/v1/codebase/story/add`, { ...args });
  return unwrap<{ id: number }>(r, "id");
}
export async function storyDelete(args: { id: number }): Promise<{ deleted: boolean } | null> {
  const r = await apiPost(`/api/v1/codebase/story/delete`, { ...args });
  return unwrap<{ deleted: boolean }>(r, "deleted");
}
export async function storyPropose(args: { direction?: string; limit?: number; goal?: string } = {}): Promise<{ proposals: StoryProposal[]; count: number; error?: string; deterministic?: boolean; note?: string } | null> {
  const r = await apiPost(`/api/v1/codebase/story/propose`, { ...args }, { timeoutMs: 120_000 });
  return unwrap<{ proposals: StoryProposal[]; count: number }>(r, "proposals");
}
// DETERMINISTIC trace (entry→data over real edges; no AI unless ai_fill). Fast + grounded.
export async function storyTrace(args: { goal?: string; limit?: number; max_hops?: number; ai_fill?: boolean } = {}): Promise<{ proposals: StoryProposal[]; count: number; deterministic?: boolean } | null> {
  const r = await apiPost(`/api/v1/codebase/story/trace`, { ...args }, { timeoutMs: 60_000 });
  return unwrap<{ proposals: StoryProposal[]; count: number }>(r, "proposals");
}
export async function storyToCard(args: { id: number }): Promise<{ card_slug?: string; ok?: boolean; reason?: string; story_id: number } | null> {
  const r = await apiPost(`/api/v1/codebase/story/card`, { ...args });
  return unwrap<{ card_slug?: string; story_id: number }>(r, "story_id");
}
