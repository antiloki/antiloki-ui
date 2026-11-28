// Types mirroring antiloki BE responses (v1 + v2).

export type Signal = "green" | "yellow" | "red" | "idle";
export type Tier = "low" | "mid" | "high";

export interface FixOption {
  id: string;
  label: string;
  action: string;
  card_slug?: string;
  contract_slug?: string;
  notification_id?: number;
  intent?: string;
  status?: string;
}

export interface FocusBlocker {
  kind: string;
  detail?: Record<string, unknown>;
  reason_md: string;
  severity?: "yellow" | "red";
  surfaces_in?: string[];
  fix_options?: FixOption[];
}

export interface FocusSignal {
  signal: Signal;
  can_play: boolean;
  blocked_reasons: string[];
  red_descendant_count: number;
  blocked_by?: FocusBlocker[];
  card_title?: string | null;
}

export interface FocusResponse {
  focus: {
    card_slug: string;
    card_title: string | null;
    status: string;
    intent: string;
    current_phase: string;
    can_progress: boolean;
    blocked_by: FocusBlocker[];
    next_action: string | null;
    next_agent: string | null;
    reason_md: string;
  } | null;
  signals: Record<string, FocusSignal>;
}

export interface Card {
  id?: number;            // integer PK — stable reference number; populated by BE
  slug: string;
  title: string;
  status: string;
  body_json: string | null;
  risk: number | null;
  complexity: number | null;
  priority: number | null;
  score: number | null;
  // FEAT-CARD-ACCURACY-SCORE: PL's 0..100 confidence the card is complete +
  // correct enough to execute. accuracy_detail_json carries the per-field
  // breakdown ({ field_scores, summary, programmatic_issues }).
  accuracy_score: number | null;
  accuracy_detail_json: string | null;
  accuracy_computed_at: string | null;
  parent_slug: string | null;
  driver_intent: string;
  // FEAT-DRIVER-PR-GATE: 1 = merge the worktree immediately at QA-green;
  // 0 (default) = ship a pull request and wait for the operator's merge.
  auto_merge?: number;
  created_at: string;
  updated_at: string;
  // FIX-THRASH-VISIBILITY: the latest non-superseded contract's recorded
  // stage failure — drives the '⚠ failing' badge on list tiles.
  last_failure_kind?: string | null;
  last_failure_at?: string | null;
}

// What /api/v1/cards?slim=1 returns: the Card row minus the two fat TEXT
// columns. List surfaces (Board, breadcrumb, chat @-picker) only need this;
// the card detail keeps fetching the full Card via /cards/:slug.
export type CardSlim = Omit<Card, "body_json" | "accuracy_detail_json">;

// FIX-THRASH-VISIBILITY: shared predicate — a card is 'failing' when its
// latest contract recorded a stage failure within the last 30 minutes and
// the card hasn't already escalated to blocked (blocked has its own badge).
export function isRecentlyFailing(c: { status: string; last_failure_at?: string | null }): boolean {
  if (!c.last_failure_at || c.status === "blocked") return false;
  const t = Date.parse(c.last_failure_at.includes("T") ? c.last_failure_at : c.last_failure_at.replace(" ", "T") + "Z");
  return Number.isFinite(t) && Date.now() - t < 30 * 60 * 1000;
}

export interface EpicRollup {
  slug: string;
  title: string;
  status: string;
  total_children: number;
  done_children: number;
  doing_children: number;
  backlog_children: number;
  progress_pct: number;
}

export interface InFlight {
  contract_slug: string;
  card_slug: string;
  card_title: string;
  status: string;
  size: string;
}

export interface BoardEvaluation {
  counts: { backlog: number; doing: number; done: number; archived: number; total: number };
  epics: EpicRollup[];
  free_cards: Card[];
  stale_cards: Card[];
  in_flight: InFlight[];
  recent_done: Card[];
  velocity_7d: number;
  open_red_notifications: number;
  top_recommendation: { title: string; hint: string; severity: "go" | "warn" | "idle"; target?: { kind: string; slug?: string } };
}

export interface DriverStatus {
  pid: number | null;
  alive: boolean;
  pid_file_exists: boolean;
  halt_file_exists: boolean;
  last_tick_at: string | null;
  ticks_5m: number;
  ticks_1h: number;
  cost_usd_1h: number;
  outcomes_5m: Record<string, number>;
  be_tick_running: boolean;
  tick_in_progress?: boolean;
  red_notifications_pending: number;
  // PIPELINE-V2: the driver is running the blueprint pipeline (ANTILOKI_PIPELINE_V2).
  // The waterfall swaps its ladder + classifier on this.
  pipeline_v2?: boolean;
}

export interface InboxMessage {
  id: number;
  title: string;
  body_md?: string;
  read: boolean;
  archived: boolean;
  ts: string;
  severity?: string;
}

export interface Contract {
  slug: string;
  card_slug: string;
  status: string;
  size: string;
  tier?: string;
  files_touched_json?: string | string[];
  acceptance_json?: string | any[];
  microtasks_json?: string | any[];
  briefing_md?: string;
  // FEAT-SLICED-RETRIES: re-author provenance, one entry per tl.refine pass.
  refine_history?: Array<{
    attempt: number;
    ts: string;
    mode: "first" | "full" | "sliced";
    trigger: string;
    qa_run_id: number | null;
    kept_ids: string[];
    replaced_ids: string[];
    failing_ac_indices: number[];
    why: string;
  }>;
  [k: string]: any;
}

export interface Session {
  id: number;
  started_at: string;
  last_turn_at?: string;
  title?: string;
}

export interface Turn {
  id: number;
  role: "human" | "agent" | string;
  content_md: string;
  ts: string;
  // persisted on interviewer_turns — the chat echo-dedup matches the last
  // turn's user_text against the optimistic pending bubble.
  user_text?: string;
  suggested_actions?: Array<{ label: string; action_name: string; input?: any }>;
  // FEAT-INTERVIEWER-CONFIDENCE-SCREENING: how sure the classifier was (0–1),
  // and the low-confidence screening fork (question + A/B/C options). Persisted
  // on the turn row so a reloaded session re-renders both.
  classification_confidence?: number;
  clarify_questionnaire_json?: string;
  clarify_questionnaire?: {
    should_render?: boolean;
    own_confidence?: number;
    question_md?: string;
    options?: Array<{ key: string; label: string }>;
  };
  // Per-turn AI telemetry (the triage call) — backs the per-reply badge + the
  // session cost/token strip. NULL on AI-less turns.
  model_id?: string | null;
  ai_tier?: string | null;
  ai_cost_usd?: number | null;
  ai_tokens_in?: number | null;
  ai_tokens_out?: number | null;
}

export interface ActionRow {
  name: string;
  description?: string;
  owner_agent?: string;
  input_schema?: any;
  [k: string]: any;
}

export interface SkillCatalogEntry {
  name: string;
  description: string | null;
  uses_ai: boolean;
  prompt_names: string[];
}

// ─── v2 ───────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: number;
  ts: string;
  actor: string;
  operation: string;
  entity_type: string;
  entity_id: string;
  digital_print: string;
  diff_summary: { added: string[]; modified: string[]; removed: string[] } | null;
  parent_event_id: number | null;
  cognition?: {
    tier: Tier;
    model_id: string;
    cost_usd: number;
    duration_ms: number;
    prompt_template?: string;
    ai_call_id?: number;
  };
}

// EVENT-SOURCED-AUDIT (Phase 4): a live, unsealed staged-trail row (the driver
// accumulates these per run and seals them per phase into sacred_timeline).
export interface StagedAuditRow {
  id: number;
  ts: string;
  actor: string;
  operation: string;
  entity_type: string;
  entity_id: string;
  session_id: string | null;
  phase: string | null;
  tick_id: number | null;
}

export interface AuditTimelineResponse {
  entries: AuditEntry[];
  total: number;
  oldest_id_returned: number | null;
  has_more: boolean;
  staged?: StagedAuditRow[];
}

export interface DriverTick {
  id: number;
  started_at: string;
  ended_at: string | null;
  card_slug: string | null;
  decided_agent: string | null;
  decided_action: string | null;
  decided_reason: string | null;
  outcome: "fired" | "idle" | "failed" | "escalated" | "halt_requested" | "running";
  cost_usd: number;
  duration_ms: number | null;
  error_message: string | null;
  fired_event_id: number | null;
}

export interface Notification {
  id: number;
  ts: string;
  severity: "error" | "warning" | "info";
  kind: string;
  message_md: string;
  card_slug: string | null;
  contract_slug: string | null;
  payload_json: string | null;
  dismissed_at: string | null;
}

export interface PersonaActivity {
  agent: string;
  archetype: string;
  glyph?: string;
  default_tier: Tier;
  prompt_summary: string;
  tools_count: number;
  tools: string[];
  kb_tags: string[];
  cost_7d_usd: number;
  call_count_7d: number;
  cli_share_pct: number;
  recent_fires: Array<{
    slug: string;
    ts: string;
    verdict: "success" | "failed" | "escalated";
    cost_usd: number;
    duration_ms: number;
  }>;
}

export interface PersonasDashboardResponse {
  personas: PersonaActivity[];
  total_cost_7d_usd: number;
  window_hours: number;
}

export interface AICallSummary {
  id: number;
  ts: string;
  prompt_name: string;
  prompt_version: number;
  agent: string;
  tier: Tier;
  temperature: "freezed" | "cold" | "warm" | "hot" | "hell";
  provider: string;
  model_id: string;
  cost_usd: number;
  duration_ms: number;
  tokens_in: number;
  tokens_out: number;
  outcome: "success" | "validation_failed" | "cached" | "error";
  cached_from_id: number | null;
}

export interface AICallDetail {
  call: AICallSummary & { reason_call_id?: number | null };
  rendered_prompt: string;
  // EPIC-AI-BEHAVIOR-STUDY: 'persisted' = provider-witnessed bytes from
  // ai_call_rendered (env-gated); 'reconstructed' = rebuilt at read time
  // from template_md + persisted inputs.
  rendered_source?: "persisted" | "reconstructed" | null;
  system_md?: string | null;
  input_kv: Array<{ key: string; value: string }>;
  output_kv: Array<{
    id: number;
    field_name: string;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
    order_index: number;
    parent_output_id: number | null;
  }>;
  validation_errors: string[] | null;
  // Heimdall trace attached when the call was judged/tagged (modal Heimdall tab).
  heimdall?: any;
  retry_attempts: AICallSummary[];
  raw_output_on_failure?: string | null;
  attempts?: Array<{
    attempt_no: number;
    ts: string;
    outcome: "success" | "validation_failed" | "error";
    correction_md: string | null;
    raw_output_md: string | null;
    validation_errors?: string[] | null;
  }>;
  pair?: { reason_call_id: number | null; format_call_ids: number[] };
  report?: {
    id: number;
    ts: string;
    trigger: string;
    failure_class: string;
    severity: string;
    diagnosis_md: string;
    narrative_md?: string | null;
    recommendation_md?: string | null;
  } | null;
  // EPIC-CONTEXT-BUNDLE (docs/context-bundle.md §9): the bone+sliced context assembled for this call.
  // null when the call didn't route through the resolver. Rendered by the modal's Context tab.
  context_bundle?: {
    ai_call_id: number;
    agent: string | null;
    phase: string | null;
    bone_tokens: number;
    sliced_tokens: number;
    total_tokens: number;
    budget: number | null;
    over_budget: boolean;
    items: Array<{ id: string; tier: "bone" | "sliced"; type: string; source: string; tokens: number; relevance: number | null; freshness: string | null; text: string }>;
    dropped: Array<{ id: string; type?: string; tokens: number; reason: string }>;
    skipped: Array<{ id: string; tier: string; reason: string }>;
    item_count: number;
    created_at: string;
  } | null;
}

export interface CostToday {
  spend_usd: number;
  cap_usd: number;
  cap_pct: number;
  top_3_slugs: Array<{ slug: string; cost_usd: number; calls: number }>;
  yesterday_spend_usd: number;
  trend: "rising" | "flat" | "falling";
  // Token + call surface (substrate may run on $0 providers; tokens
  // are the meaningful unit).
  calls_today?: number;
  tokens_in?: number;
  tokens_out?: number;
  tokens_total?: number;
  cached_calls?: number;
  cached_pct?: number;
  // FEAT-CACHE-TELEMETRY: provider-side prompt-cache hits (prefix caching) —
  // distinct from cached_calls (the substrate's exact-identity cache).
  provider_cached_tokens?: number;
  provider_cached_pct?: number;
  // Counterfactual: what these tokens would cost at the Opus baseline.
  // Honest about being an estimate, NOT the operator's actual bill.
  estimated_usd?: number;
}

export interface SubSkillMatrixEntry {
  prompt_name: string;
  tier: Tier;
  model_id: string;
  calls: number;
  cost_actual_usd: number;
  cost_baseline_usd: number;
  savings_usd: number;
  cached_calls: number;
  cached_pct: number;
  tokens_in?: number;
  tokens_out?: number;
  tokens_total?: number;
}

export interface ProviderMixEntry {
  provider: string;
  calls: number;
  cost_usd: number;
  share_pct: number;
  share_calls_pct: number;
}

export interface AgentMixEntry {
  agent: string;
  calls: number;
  cost_usd: number;
  share_pct: number;
  avg_cost_per_call_usd: number;
}

export interface CostSettings {
  daily_cap_usd: number;
  alert_threshold_pct: number;
  hard_stop_pct: number | null;
  // EPIC-BYOK: per-tier daily spend caps (USD). null = unlimited.
  cap_low_usd: number | null;
  cap_mid_usd: number | null;
  cap_high_usd: number | null;
}

export interface ByokModel {
  model_id: string;
  cost_in: number | null;
  cost_out: number | null;
  active: boolean;
}

export interface ByokStatus {
  openrouter_key_present: boolean;
  active: { low: string | null; mid: string | null; high: string | null };
  strategy: "byok" | "subscription" | "mixed";
  models?: { low: ByokModel[]; mid: ByokModel[]; high: ByokModel[] };
}

export interface Law {
  id: number;
  slug: string;
  title: string;
  kind: "constitutional" | "constraint" | "procedural" | "decision" | "principle" | "permission";
  enforcement: "hard" | "soft" | "archived";
  domain: string;
  body_md: string;
  hook?: string;
  active: boolean;
  added_at: string;
  added_by: string;
}

export interface Bypass {
  id: number;
  ts: string;
  kind: "god_dispatch" | "unsafe_skill" | "no_verify" | "law_blocked";
  actor: string;
  action_name: string | null;
  law_slug: string | null;
  reason: string | null;
  outcome: "allowed" | "blocked";
}

export interface PendingDiff {
  id: number;
  contract_slug: string;
  file_path: string;
  operation: "create" | "modify" | "delete";
  agent: string;
  reason_md: string;
  diff_unified: string;
  lines_added: number;
  lines_removed: number;
  created_at: string;
}

export interface MemoryEntry {
  id: number;
  type: "user" | "feedback" | "project" | "reference" | "correction" | "decision";
  title: string;
  summary_md: string;
  body_md: string | null;
  tags: string[];
  added_by: string;
  added_at: string;
  related_memory_ids: number[];
}

export interface NextWorkItem {
  number: number;
  card_slug: string;
  card_title: string;
  severity: "go" | "warn" | "info";
  recommendation: "KEEP" | "MODIFY" | "DEFER" | "ARCHIVE";
  reasoning_md: string;
  estimated_cost_usd: number | null;
  estimated_duration_minutes: number | null;
  ai_eval_at?: string;
  ai_eval_model?: string;
}

export interface TriageRecommendationState {
  card_slug: string;
  state: "keep" | "modify" | "defer" | "archive" | null;
  marked_at: string | null;
  marked_by: string | null;
}

export interface AgentMeta {
  agent: string;
  archetype?: string;
  glyph?: string;
  default_tier?: Tier;
  [k: string]: any;
}

export interface AgentGrantedAction {
  name: string;
  description: string | null;
  kind: string | null;
  owner_agent: string | null;
  granted_at: string | null;
  granted_by: string | null;
  skills: string[];
}

export interface AgentDetail {
  agent: string;
  description: string | null;
  archetype: string;
  model: string | null;
  core: {
    role: string | null;
    north_star: string | null;
    principles: string[];
  };
  custom_prompt_md: string | null;
  // EPIC-SUBAGENT: the agent's place in the specialization tree + its children.
  subagent?: {
    parent_agent: string | null;
    specialization_md: string | null;
    applies_to: { globs?: string[]; langs?: string[]; tags?: string[] } | null;
    is_abstract: boolean;
    children: Array<{ name: string; description: string | null; is_abstract: boolean }>;
  };
  actions: AgentGrantedAction[];
  prompts?: AgentPrompt[];
  usage?: AgentUsage;
  stats?: AgentStats;
  driver?: AgentDriverRole;
  decomposition?: AgentDecompCard[];
}

export interface AgentDriverRole {
  stages: Array<{
    stage_name: string;
    order_index: number;
    description_md: string;
    entry_signal: string | null;
    exit_signal: string | null;
    actions: Array<{
      action_name: string;
      order_index: number;
      is_optional: number;
      invocation_pattern: "always" | "conditional" | "manual";
      rationale_md: string | null;
    }>;
  }>;
  ticks_by_action: Array<{
    action: string;
    ticks: number;
    fired: number;
    failed: number;
    cost_usd: number;
    last_at: string | null;
  }>;
  tick_outcomes: Array<{ bucket: string; n: number }>;
}

export interface AgentPrompt {
  name: string;
  version: number;
  default_tier: Tier;
  default_temperature: "freezed" | "cold" | "warm" | "hot" | "hell";
  max_output_tokens: number;
  template_md: string;
}

export interface AgentUsage {
  call_count: number;
  total_cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  last_fired_at: string | null;
  cards_touched: number;
  avg_cost_per_call: number;
  avg_tokens_per_call: number;
  avg_duration_ms: number;
  cache_hit_pct: number;
  success_pct: number;
}

export interface AgentStats {
  daily: Array<{ day: string; calls: number; cost_usd: number; tokens_in: number; tokens_out: number }>;
  by_outcome: Array<{ bucket: string; n: number }>;
  by_tier: Array<{ tier: Tier; calls: number; cost_usd: number }>;
  by_prompt: Array<{ prompt_name: string; calls: number; cost_usd: number; tokens: number; avg_ms: number }>;
}

export interface AgentDecompCard {
  card_slug: string;
  card_title: string | null;
  last_tick: string | null;
  contracts: Array<{
    id: number;
    slug: string;
    title: string;
    status: string;
    microtasks: Array<{
      id: string | number | null;
      summary: string | null;
      patches: Array<{ file: string | null; op: string | null; rationale_md: string | null }>;
    }>;
  }>;
}

// Sentinel for endpoints not yet wired on the BE.
export const NOT_WIRED = Symbol("not_wired");
export type NotWired = { __not_wired: true; path: string };

// ─── cockpit (multi-agent session board) ────────────────────────────────
// The pane row as the cockpit screens consume it (formerly a module-local
// type in cockpit-view.tsx). Optional fields are typed from FE usage — the
// BE row carries more; add here as screens start reading them.
export interface Pane {
  id: number;
  idx: number;
  session_id?: number;
  subagent_name: string;
  scope: string[];
  grants: string[];
  status: string;
  worktree_path: string | null;
  branch: string | null;
  tier: string;
  base_agent?: string | null;
  model_id?: string | null;
  extra_prompt_md?: string | null;
  cost_usd?: number;
  calls?: number;
  auto_apply?: number;
  pending_edits_json?: string | null;
  pane_kind?: string;
  settings_json?: string | null;
  script_kind?: string | null;
  script_worktree_pane?: number | null;
  chat_session_id?: number | null;
}
