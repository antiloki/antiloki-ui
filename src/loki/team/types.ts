// THE TEAM GRAPH, AS THE SERVE SENDS IT (RFC 0008; serve/src/team_graph.rs). A node is an object tagged by `node`; a wire leaves a named port. Nothing here is trusted: `api.ts` reads every reply defensively.
export type Tier = "low" | "mid" | "high";
export type RoleKey = "planner" | "worker" | "qa" | "debugger" | "audit" | "agent";
/** A custom agent (RFC 0008 §4.16): the Leader's own creation, one responsibility with its brief, context, skills, MCP allow-list and the effects it may have. */
export type AgentSpec = { title: string; responsibility: string; brief: string; context?: string[]; skills?: string[]; mcp?: string[]; effects?: string[]; /** a specialist's id: the node runs as that specialist and the graph draws its avatar */ specialist?: string };
export type Skill = { name: string; purpose: string; effects: string[]; status: "draft" | "approved"; body: string };
export type Allow = { paths?: string[]; panes?: string[]; skills?: string[]; mcp?: string[]; effects?: string[] };
export type ToolRef = { type: string; name: string; args?: unknown };
/** why a node is there (RFC 0010 §4.1): a reason of a closed list and a sentence */
export type Why = { kind: string; note?: string };
export const WHY_KINDS = ["parallel", "independent_check", "tool", "cost", "gate", "schedule", "memory", "sense"] as const;
/** a model node (RFC 0010 §4.4): one call to a seat, a typed answer, free checks, a ladder upwards */
export type LlmSpec = { seat: string; prompt: string; answer: Record<string, unknown>; fallback?: string[]; verify?: { in_source?: string[]; source?: string }; agree_with?: string[]; max_tokens?: number | null; timeout_s?: number | null };
/** one rule of a check (RFC 0010 §4.6): data, never code */
export type CheckRule = { id?: string; kind: string; message?: string; pattern?: string; section?: string; min?: number; max?: number; require?: string[]; forbid?: string[]; hosts?: string[]; ordered?: boolean };
type Common = { /** the autonomy dial: `ask` = asks the person once per run before it starts, `always` = every time; none = runs on its own */ autonomy?: "auto" | "ask" | "always" | null; /** an approval: the risk of the step behind a human node and what will happen, shown on its card */ approval?: { risk: "low" | "medium" | "high" | ""; note: string } | null; label?: string | null; why?: Why | null; timeout_s?: number | null; cap_usd?: number | null; /** where the editor drew it: x, y */ pos?: [number, number] | null };
export type Kind =
  | { node: "leader" }
  | { node: "role"; role: RoleKey; tier?: Tier | null; model?: string | null; readonly?: boolean | null; fresh_context?: boolean | null; parallel?: number | null; owns?: string[]; agent?: AgentSpec | null }
  | { node: "if"; cond: string }
  | { node: "switch"; on: string }
  | { node: "loop"; max_iterations: number; until?: string | null }
  | { node: "for_each"; over: string; parallel?: number | null; batch?: number | null; on_error?: "collect" | "stop" | null }
  | { node: "timer"; mode: "delay" | "timeout" | "schedule"; seconds?: number; cron?: string | null; wraps?: string | null }
  | { node: "fork" }
  | { node: "join"; policy: "all" | "any" | "quorum" | "consensus"; quorum?: number | null }
  | { node: "retry"; max: number; backoff_s?: number; open_after?: number | null; cooldown_s?: number | null }
  | { node: "budget_gate"; stop_at: number; ask_at?: number | null }
  | { node: "human"; gate: string; on_timeout?: string | null }
  | { node: "use_tool"; tool: ToolRef; allow?: Allow; starts_model?: boolean; outputs?: Record<string, string> }
  | { node: "artifact"; name: string; format: string; from?: string | null; title?: string | null; compose?: MasterPage | null }
  | { node: "check"; on: string; rules: CheckRule[] }
  | ({ node: "llm" } & LlmSpec & LlmExtras)
  /** the sandboxed escape hatch (RFC 0011 §11): a Rhai program, JSON in and out, with the examples it must pass at save */
  | { node: "code"; source: string; examples?: { input: unknown; output: unknown }[]; from?: string | null; limits?: { time_limit_ms?: number; op_limit?: number } | null }
  /** deterministic data shaping with no model (RFC 0011 §12): one mode */
  | { node: "transform"; mode: string; from?: string | null; config?: unknown }
  /** ends the run with a message to the person (RFC 0011 §15) */
  | { node: "stop"; message: string }
  /** another team run as one step (RFC 0011 §14) */
  | { node: "sub_team"; team: string; ask?: string; outputs?: Record<string, string>; budget_share?: number | null; max_depth?: number | null }
  | { node: "deliver" };
/** what a model node may carry beyond its seat and prompt (RFC 0011 §8, §10): a preset, a router policy, memory examples */
export type LlmExtras = { preset?: { kind: string; categories?: string[]; example?: unknown; threshold?: number | null } | null; router?: { candidates: { seat: string; max_input_chars?: number | null; cost_usd?: number | null }[]; floor: string; explore?: number | null; min_ok?: number | null; cost_cap_usd?: number | null } | null; examples_from?: { task_class: string; k?: number } | null };
export type GNode = Kind & Common;
export type Edge = { from: string; port: string; to: string };
export type Graph = { team: string; schema: number; branch: string; budget_usd: number; start?: string[]; nodes: Record<string, GNode>; edges: Edge[]; /** what each node is expected to hold (RFC 0011 §7); the person's */ setpoints?: Record<string, { min_ok_rate?: number | null; max_p95_ms?: number | null; max_cost_per_ok?: number | null }> };

/** A schedule (RFC 0010 §4.9): a cron, the ask the team is given, a run budget. */
/** the master page (RFC 0010 §4.16): sections of widgets, data and never code; the run builds one html page from them */
export type MasterPage = { title?: string; sections: { title: string; widgets: Record<string, unknown>[] }[] };
/** one node's benchmark (RFC 0010 §4.20): every figure has its n; under five runs it is "too few runs" */
export type NodeStats = { n: number; ok_rate: number; retry_rate: number; climb_rate: number; cost_median: number; cost_mean: number; ms_median: number; last_t: number };
export type NodeBench = { node: string; kind: string; title: string; cfg: string; seat: string; stats: NodeStats; enough_runs: boolean; cost_share: number; cost_rank: number | null; reliability_rank: number | null; cost_per_ok: number | null;
  vs_previous_cfg: { verdict: string; reading: string; old_seat: string; old: NodeStats; new: NodeStats } | null; versions: { cfg: string; seat: string; stats: NodeStats }[] };
export type Trigger = { id?: string; kind: "schedule" | "file_watch" | "on_error" | "webhook"; engine?: string; cron?: string; ask: string; budget_usd?: number | null; missed?: "skip" | "run_once"; watch?: string; debounce_s?: number; team?: string; token_hash?: string };
export type TriggerStatus = { /** every trigger exactly as the graph holds it: a save sends these back, so a panel that only knows schedules never turns a file watch or a webhook into something else */ raw?: Trigger[]; service: boolean; consented: boolean; triggers: { id: string; kind?: string; watch?: string; team?: string; engine?: string; cron: string; ask: string; budget_usd?: number | null; missed: string; next_ms: number | null; last?: { at_ms: number; run: string } | null }[]; limits: { max_runs_per_day: number; max_usd_per_day: number }; today: { date: string; runs: number }; log: { t_ms: number; trigger: string; what: string; why: string; run?: string | null }[] };
/** the proof card (B2): the pre-registered verdict for the team against one agent */
export type ProofCardData = { recorded: boolean; verdict: string; words: string; n: number; fixtures?: number; stale?: boolean; baseline?: string; next_step?: string; w?: number; w_lo?: number; w_hi?: number; dq?: number; rho_cost?: number | null; rho_time?: number | null };
/** while you were away (BL-8) */
export type DigestRun = { id: string; team: string; ask: string; kind: "finished" | "failed" | "parked" | "running" | "stopped" | "other"; why: string; started_ms: number; ended_ms: number; spent_usd: number };
export type Digest = { runs?: DigestRun[]; since_ms: number; now_ms: number; started: number; finished: number; failed: number; parked: number; running: number; stopped: number; skipped: number; spent_usd: number; needs_you: string[]; skips: { team: string; trigger: string; t_ms: number; why: string }[]; words: string; quiet: boolean };
/** the Improver (RFC 0011 §18): a read-only proposer; the person (or the Leader) decides */
export type ImproverConfig = { mode: "off" | "suggest" | "auto_low_risk"; freeze: boolean; frozen_nodes: string[]; cooldown_s: number; every_n_runs: number; seat: string; budget_usd: number; max_auto_per_cycle: number };
export type ImproverState = { last_review_ms: number; runs_since_review: number; proposed: number; accepted: number; helped: number; hurt: number };
export type Proposal = { id: number; node: string; kind: string; patch: Record<string, unknown>[]; hypothesis: string; metric: string; expected: string; evidence: string; risk: string; status: "pending" | "applied" | "rejected" | string; requires_person: boolean };
export type ReviewOutcome = { ok: boolean; reason?: string; proposed?: number[]; rejected?: [string, string][]; auto_applied?: number[]; cost_usd?: number; over_budget?: boolean; error?: string };
export type Issue = { code: string; node: string | null; message: string };
export type Report = { errors: Issue[]; warnings: Issue[]; worst_usd: number; budget_usd: number };

export type CatalogItem = { id: string; family: "role" | "control" | "tool" | (string & {}); label: string; hint: string; icon: string; default: GNode; ports: string[]; required: string[]; failure_ports: string[]; writes: { field: string; type: string }[]; tier: Tier | null };
export type Artifact = { name: string; format: string; bytes: number; node: string | null; kind: "made" | "draft"; t_ms: number };
export type Catalog = { nodes: CatalogItem[]; artifact_formats?: string[]; templates: string[]; tiers: Tier[]; effects: string[]; tool_types: string[]; failure_ports: string[]; roles: { role: RoleKey; tier: Tier; edits: boolean }[] };

export type RunStatus = { status: "idle" | "running" | "paused" | "done" | "blocked" | "stopped"; why?: string };
export type TraceEvent = { id: number; saga_id: number; task_id: number | null; t_ms: number; actor: string; kind: string; text: string };
export type Run = {
  id: string; team: string; thread: string; ask: string; engine: string; graph: Graph; live: boolean; budget_usd: number; spent_usd: number; worst_usd: number;
  state: { status: RunStatus; started_ms: number; now_ms: number; active: Record<string, number>; values: Record<string, any>; spent_usd: number; node_cost: Record<string, number>; queued: string[]; wake_at?: Record<string, number> };
  /** the last tools each node's agent started, newest first (streamed live from its CLI) */ tools_live?: Record<string, { t_ms: number; tool: string; target: string }[]>;
  team_saga: number; pack: Record<string, number>; episodes: Record<string, number>; transcripts: Record<string, string[]>; park_info: Record<string, string>; events: TraceEvent[];
};
export type RunRow = { id: string; team: string; ask: string; status: RunStatus; spent_usd: number; started_ms: number; /** a human gate is open: the run waits for the person */ needs_you?: boolean; /** this run is the child of an inner-team node of another run */ parent?: { run: string; team: string; node: string }; /** this run waits for the person inside its inner team (the child's run and team) */ waiting_on_child?: { run: string; team: string } };
export type NodeView = { node: string; attempts: { file: string; text: string }[]; output: any; cost_usd: number; active: boolean };
export type Sim = { path: string[]; passes: Record<string, number>; outcome: string; spent_usd: number; worst_usd: number; trace: { t_ms: number; node: string; kind: string; text: string }[] };
