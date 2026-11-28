// THE TEAM GRAPH'S CALLS (RFC 0008 §4.11): one door, `POST /api/v1/cockpit/team-graph {op, ...}`. Every reply is read defensively; a call never throws into the React tree.
import { apiPost, isNotWired, BE_URL } from "@/loki/api/client";
import type { ImproverConfig, ImproverState, Proposal, ReviewOutcome, Trigger, TriggerStatus, Artifact, Skill, Catalog, Graph, NodeBench, NodeView, Report, Run, RunRow, Sim } from "./types";

const un = (r: any) => (r && typeof r === "object" && r.result && typeof r.result === "object" && !Array.isArray(r.result) && !("ok" in r) ? r.result : r);
export type Reply<T = any> = { ok: boolean; error?: string } & T;
export async function teamOp<T = any>(op: string, body: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<Reply<T>> {
  try { const r: any = un(await apiPost("/api/v1/cockpit/team-graph", { op, ...body }, { timeoutMs })); if (isNotWired(r)) return { ok: false, error: "this antiloki serve is older than the team graph: restart the serve so it runs the same version as this screen" } as Reply<T>; if (!r || typeof r !== "object") return { ok: false, error: "the serve did not answer" } as Reply<T>; return r as Reply<T>; }
  catch (e: any) { return { ok: false, error: String(e?.message ?? e) } as Reply<T>; }
}
const arr = <T>(v: any): T[] => (Array.isArray(v) ? v : []);
export const loadCatalog = async (): Promise<Catalog | null> => { const r = await teamOp<Catalog>("catalog"); return r.ok && Array.isArray(r.nodes) ? r : null; };
export const listTeams = async (): Promise<{ /** the serve did not answer (it is busy): the lists are empty because nothing came, not because nothing is there */ failed?: boolean; graphs: { team: string; id: string; nodes: number; budget_usd: number; valid: boolean; worst_usd: number }[]; runs: RunRow[]; live: string[] }> => { const r = await teamOp("list"); return { graphs: arr(r.graphs), runs: arr(r.runs), live: arr(r.live), failed: !r.ok }; };
export const getTeam = async (team: string): Promise<{ graph: Graph; report: Report; runs: RunRow[] } | null> => { const r = await teamOp("get", { team }); return r.ok && r.graph ? { graph: r.graph, report: r.report, runs: arr(r.runs) } : null; };
/** The same, and what a miss means: `missing` is the serve saying there is no such team; anything else (a timeout, a serve that is busy) is a miss that says nothing about the team (found 2026-11-15: a slow serve made a team that was there "not exist"). */
export const getTeamReading = async (team: string): Promise<{ found: { graph: Graph; report: Report; runs: RunRow[] } | null; missing: boolean }> => { const r = await teamOp("get", { team }); if (r.ok && r.graph) return { found: { graph: r.graph, report: r.report, runs: arr(r.runs) }, missing: false }; return { found: null, missing: /no team graph called|no such team/i.test(String((r as any).error ?? "")) }; };
export const saveGraph = (graph: Graph) => teamOp<{ graph: Graph; report: Report; diff: any; created: boolean }>("save", { graph });
export const createTeam = (name: string, template: string, budget_usd: number, goal?: string) => teamOp<{ graph: Graph; report: Report; thread: string; brief: string | null }>("create", { name, template, budget_usd, ...(goal ? { goal } : {}) }, 60_000);
/** The team's own skills (RFC 0008 §4.16): the Leader writes them as drafts, only the person approves. */
export const listSkills = async (team: string): Promise<Skill[]> => { const r = await teamOp<{ skills: Skill[] }>("skill_list", { team }); return r.ok && Array.isArray(r.skills) ? r.skills : []; };
export const listArtifacts = async (run: string): Promise<Artifact[]> => { const r = await teamOp<{ artifacts: Artifact[] }>("artifacts", { run }); return r.ok && Array.isArray(r.artifacts) ? r.artifacts : []; };
/** The Leader's terminal is bound to its team, so the audit of a run that went badly can be typed into it (and kept in its inbox when it is closed). */
export const bindLeader = (team: string, pane: number) => teamOp<{ bound: number; delivered: number }>("leader_bind", { team, pane });
export const nodeBench = async (team: string): Promise<NodeBench[]> => { const r = await teamOp<{ nodes: NodeBench[] }>("node_bench", { team }); return r.ok && Array.isArray(r.nodes) ? r.nodes : []; };
export const getResult = (run: string) => teamOp<{ name: string; format: string; text: string }>("result", { run });
export const makeResultPage = (run: string) => teamOp<{ name: string }>("compose_auto", { run });
export const getArtifact = (run: string, name: string, node?: string | null) => teamOp<{ name: string; format: string; text: string }>("artifact", { run, name, ...(node ? { node } : {}) });
export const triggerStatus = async (team: string): Promise<TriggerStatus | null> => { const r = await teamOp<TriggerStatus>("trigger_status", { team }); return r.ok && Array.isArray(r.triggers) ? r : null; };
export const setTriggers = (team: string, triggers: Trigger[], limits?: { max_runs_per_day?: number; max_usd_per_day?: number }) => teamOp<TriggerStatus>("triggers_set", { team, triggers, ...(limits ? { limits } : {}) });
export const improverConfig = async (team: string, patch?: Partial<ImproverConfig>): Promise<{ config: ImproverConfig; hit_rate: number; state: ImproverState } | null> => { const r = await teamOp<any>("improve_config", { team, ...(patch ?? {}) }); return r.ok && r.config ? { config: r.config, hit_rate: Number(r.hit_rate ?? 0), state: r.state } : null; };
export const improverReview = (team: string) => teamOp<ReviewOutcome>("improve_review", { team }, 240_000);
export const improverProposals = async (team: string): Promise<Proposal[]> => { const r = await teamOp<any>("improve_proposals", { team }); return r.ok && Array.isArray(r.proposals) ? r.proposals : []; };
export const improverDecide = (team: string, id: number, accept: boolean) => teamOp<any>("improve_decide", { team, id, accept });
/** a new token for a webhook trigger: shown ONCE, the graph keeps only its hash; the person must approve the trigger again */
export const webhookToken = (team: string, trigger: string) => teamOp<{ token: string; path: string; note: string }>("webhook_token", { team, trigger });
/** the team's proof card (B2); null when the serve cannot say */
export const teamProof = async (team: string): Promise<import("./types").ProofCardData | null> => { const r = await teamOp<any>("proof", { team }); return r.ok && typeof r.verdict === "string" ? (r as any) : null; };
/** what the teams did since `since` (ms; default the last 24 hours); null when the serve cannot say */
export const awayDigest = async (since?: number, team?: string): Promise<import("./types").Digest | null> => { const r = await teamOp<any>("away_digest", { ...(since ? { since_ms: since } : {}), ...(team ? { team } : {}) }); return r.ok && typeof r.words === "string" ? (r as any) : null; };
/** a note to a running team (steering): every agent call that starts after it is told it; the person only */
export const steerRun = (run: string, text: string) => teamOp<{ notes: number }>("run_note", { run, text });
export const consentTriggers = (team: string, on: boolean) => teamOp<TriggerStatus>("trigger_consent", { team, on });
export const fireTrigger = (team: string, trigger: string) => teamOp<{ run: string }>("trigger_fire", { team, trigger });
export const approveSkill = (team: string, name: string) => teamOp<{ skill: Skill }>("skill_approve", { team, name });
export const deleteSkill = (team: string, name: string) => teamOp("skill_delete", { team, name });
export const runTeam = (team: string, ask: string, budget_usd?: number) => teamOp<{ run: string; thread: string }>("run", { team, ask, ...(budget_usd ? { budget_usd } : {}) }, 60_000);
export const runStatus = async (run: string): Promise<Run | null> => { const r = await teamOp("status", { run }); return r.ok && r.run ? (r.run as Run) : null; };
/** The videos, pictures and sounds a run left in its working folders (the operator 2026-11-15: "the video cannot be seen on the preview"). */
export type Media = { file: string; name: string; path: string; kind: "video" | "image" | "audio" | "page" | "file"; bytes: number };
export const listMedia = async (run: string): Promise<Media[]> => { const r = await teamOp<{ media: Media[] }>("media", { run }); return r.ok && Array.isArray(r.media) ? r.media : []; };
export const mediaUrl = (run: string, file: string) => `${BE_URL}/api/v1/cockpit/team-graph/media?run=${encodeURIComponent(run)}&file=${encodeURIComponent(file)}`;
export const nodeView = async (run: string, node: string): Promise<NodeView | null> => { const r = await teamOp<NodeView>("node", { run, node }); return r.ok ? r : null; };
export const controlRun = (run: string, action: "pause" | "resume" | "stop") => teamOp("control", { run, action });
/** What would stop a merge from landing (the person's own uncommitted files), and whether this run already set them aside; the stash and the put-back are the person's clicks. */
export type WorkspaceState = { dirty: string[]; stashed: boolean };
export const workspaceState = async (run: string): Promise<WorkspaceState | null> => { const r = await teamOp<WorkspaceState>("workspace", { run }); return r.ok ? { dirty: arr(r.dirty), stashed: !!r.stashed } : null; };
export const stashWorkspace = (run: string) => teamOp("stash", { run }, 60_000);
export const unstashWorkspace = (run: string) => teamOp("unstash", { run }, 60_000);
export const answerAt = (run: string, node: string, approve: boolean) => teamOp("answer", { run, node, approve }, 120_000);
export const editNode = (target: { run?: string; team?: string }, node: string, patch: Record<string, unknown>) => teamOp<{ node: any; report: Report }>("edit", { ...target, node, patch });
export const moveBudget = (target: { run?: string; team?: string }, moves: { from: string; to: string; usd: number }[], ceiling_usd?: number) => teamOp("budget", { ...target, moves, ...(ceiling_usd ? { ceiling_usd } : {}) });
export const simulateTeam = (body: { team?: string; graph?: Graph; stubs?: Record<string, unknown[]> }) => teamOp<{ sim: Sim; report: Report }>("simulate", body);
export const validateGraph = (graph: Graph) => teamOp<{ report: Report; words: string[] }>("validate", { graph });
export const deleteTeam = (team: string) => teamOp("delete", { team });

// RFC 0013: the team's own git, its improvement requests, its benchmark and its travel (export / import).
export type ReqChange = { node: string; what: string; risk: string };
export type ReqArm = { n: number; passed: number; rate: number; lower: number; avg_cost_usd: number; avg_wall_ms: number; gate_stops: number };
export type ReqExperiment = { stage: string; current: ReqArm; candidate: ReqArm; regressions: string[]; spent_usd: number; budget_hit: boolean; admitted: boolean; why: string };
export type TeamRequest = { n: number; status: "open" | "approved" | "refused" | "retry"; branch: string; problem: string; run_ids: string[]; changes: ReqChange[]; risk: string; experiment: ReqExperiment | null; reason: string; opened_ms: number };
export type VersionRow = { id: string; n: number; message: string; ts: number; models: Record<string, string>; measured: boolean; pass_rate: number | null; lower: number | null; avg_cost_usd: number | null; avg_wall_ms: number | null; last_run_ms: number | null };
export const listRequests = async (team: string): Promise<TeamRequest[]> => { const r = await teamOp<{ requests: TeamRequest[] }>("request_list", { team }); return r.ok && Array.isArray(r.requests) ? r.requests : []; };
export const decideRequest = (team: string, n: number, action: "approve" | "refuse" | "retry", reason = "") => teamOp<{ request: TeamRequest }>("request_decide", { team, n, action, reason });
export const benchmarkOf = async (team: string): Promise<{ versions: VersionRow[]; imported_not_measured_here: boolean; regression_left: number } | null> => { const r = await teamOp<any>("benchmark", { team }); return r.ok && Array.isArray(r.versions) ? r : null; };
export const restoreVersion = (team: string, id: string) => teamOp("restore", { team, id });
export const replayList = async (team: string): Promise<{ tune: number; heldout: number }> => { const r = await teamOp<any>("replay_list", { team }); return r.ok ? { tune: r.tune ?? 0, heldout: r.heldout ?? 0 } : { tune: 0, heldout: 0 }; };
/** THE TEMPLATE LIBRARY (RFC 0017): whole teams as YAML files, shipped with antiloki or made by Share as template. */
export type TemplateCard = { name: string; version: string; description: string; category: string; status: "verified" | "draft" | "community"; source: "shipped" | "yours"; valid: boolean; error: string; hash: string; needs: string[]; cost_note: string; ask: string };
const TSTATUS = ["verified", "draft", "community"];
export function parseTemplates(d: unknown): TemplateCard[] {
  const list = Array.isArray((d as any)?.templates) ? (d as any).templates : []; const str = (v: unknown, n = 300) => (typeof v === "string" ? v.slice(0, n) : "");
  return list.map((t: any): TemplateCard | null => { const name = str(t?.name, 60); if (!name) return null; return { name, version: str(t.version, 20), description: str(t.description, 400), category: str(t.category, 30) || "other", status: TSTATUS.includes(t.status) ? t.status : "draft", source: t.source === "yours" ? "yours" : "shipped", valid: t.valid !== false, error: str(t.error), hash: str(t.hash, 80), needs: Array.isArray(t.needs) ? t.needs.map((n: unknown) => str(n, 40)).filter(Boolean) : [], cost_note: str(t.cost_note), ask: str(t.ask) }; }).filter((t: TemplateCard | null): t is TemplateCard => t !== null);
}
export const listTemplates = async (): Promise<TemplateCard[] | null> => { const r = await teamOp<any>("template_list"); return r.ok ? parseTemplates(r) : null; };
export const startFromTemplate = (template: string, team: string, budget_usd: number) => teamOp<{ team: string; thread: string; hint: string }>("template_use", { template, team, budget_usd }, 60_000);
export const shareTemplate = (team: string, name: string, description: string, category: string) => teamOp<{ name: string; status: string; reset: string[]; scanned: string[]; path: string }>("template_share", { team, name, description, category }, 60_000);
export const exportTeam = (team: string, tasks: string[] = []) => teamOp<{ file: string }>("export", { team, tasks });
export const importReview = (file: string) => teamOp<any>("import_review", { file });
export const importTeam = (file: string, name: string) => teamOp<{ team: string; tasks_added: number }>("import", { file, name, confirmed: true });
export type ReplayRule = { id: string; kind: string; max?: number; pattern?: string; require?: string[] };
export const replayAdd = (team: string, ask: string, checks: ReplayRule[], run = "") => teamOp<{ task: { id: string; split: string } }>("replay_add", { team, ask, checks, run });
export const runExperiment = (team: string, n: number, budget_usd: number, repeats = 3) => teamOp("experiment_run", { team, n, budget_usd, repeats });
export const experimentStatus = (team: string, n: number) => teamOp<{ state: string; admitted?: boolean; why?: string; spent_usd?: number; error?: string; auto_merged?: boolean }>("experiment_status", { team, n });
export const requestConfig = async (team: string, auto?: boolean): Promise<boolean> => { const r = await teamOp<{ auto_merge_low: boolean }>("request_config", { team, ...(auto == null ? {} : { auto_merge_low: auto }) }); return !!r.auto_merge_low; };
export const improvePrompt = (team: string) => teamOp<{ prompt: string }>("improve_prompt", { team });
export type ThreadRow = { name: string; head: string; engine: string; team: string };
export const threadList = async (team: string): Promise<ThreadRow[]> => { const r = await teamOp<{ threads: ThreadRow[] }>("thread_list", { team }); return r.ok && Array.isArray(r.threads) ? r.threads : []; };
export const threadFork = (team: string, name: string, engine: string) => teamOp<{ thread: { name: string; llm_left: number } }>("thread_fork", { team, name, engine });
export const threadOpen = (team: string, name: string) => teamOp<{ team: string }>("thread_open", { team, name });
export type Checkpoint = { k: number; nodes: string[]; spent_usd: number; t_ms: number; runs: string[] };
export const runCheckpoints = async (run: string): Promise<Checkpoint[]> => { const r = await teamOp<{ checkpoints: Checkpoint[] }>("run_checkpoints", { run }); return r.ok && Array.isArray(r.checkpoints) ? r.checkpoints : []; };
export const runRewind = (run: string, k: number) => teamOp<{ run: string }>("run_rewind", { run, k, confirmed: true });
export type FileConflict = { a: string; b: string; path: string; same_lines: boolean };
export const conflictsNow = async (): Promise<{ trees: string[]; conflicts: FileConflict[] }> => { const r = await teamOp<{ trees: string[]; conflicts: FileConflict[] }>("conflicts"); return r.ok ? { trees: r.trees ?? [], conflicts: r.conflicts ?? [] } : { trees: [], conflicts: [] }; };
export type Hypothesis = { claim: string; status: "confirmed" | "ruled_out"; evidence: string; fix: string };
export type RootCause = { run: string; node: string; kind: string; error: string; failures: number; hypotheses: Hypothesis[]; finding: string };
export const rootCause = async (run: string): Promise<RootCause | null> => { const r = await teamOp<{ root_cause: RootCause }>("root_cause", { run }); return r.ok && r.root_cause?.finding ? r.root_cause : null; };
export type ReplayTask = { id: string; ask: string; split: string; oracle?: { text: string; pass: boolean }[] };
export const replayTasks = async (team: string): Promise<ReplayTask[]> => { const r = await teamOp<{ tasks: ReplayTask[] }>("replay_list", { team }); return r.ok && Array.isArray(r.tasks) ? r.tasks : []; };
export const replayOracle = (team: string, id: string, text: string, pass: boolean) => teamOp("replay_oracle", { team, id, text, pass });

/** What a team needs from its web apps before a run: per app, installed / answers / needs sign-in / unreachable (serve op apps_preflight). */
export type AppItem = { app: string; name: string; state: string; nodes: string[]; outward: boolean };
export type AppsPreflight = { used: number; ready: boolean; items: AppItem[]; human: string[] };
export async function appsPreflight(team: string): Promise<AppsPreflight | null> {
  const r: any = await teamOp("apps_preflight", { team }, 20_000);
  if (!r?.ok || typeof r.apps_used !== "number") return null;
  const items: AppItem[] = (Array.isArray(r.items) ? r.items : []).filter((i: any) => i && typeof i.app === "string").map((i: any) => ({ app: String(i.app).slice(0, 60), name: typeof i.name === "string" ? i.name.slice(0, 80) : String(i.app), state: typeof i.state === "string" ? i.state : "unreachable", nodes: Array.isArray(i.nodes) ? i.nodes.map(String) : [], outward: i.outward === true }));
  return { used: r.apps_used, ready: r.ready === true, items, human: Array.isArray(r.only_the_person_can) ? r.only_the_person_can.map((x: any) => String(x).slice(0, 300)) : [] };
}

// SELF-EVOLUTION (the operator 2026-11-22): a goal, a least gain, a most number of trials and a budget; a session that ends with a report.
export type EvolveCfg = { goal: "cost" | "time" | "quality"; min_gain_pct: number; max_trials: number; budget_usd: number; repeats: number; seat: string };
export type EvolveTrial = { n: number; kind: string; hypothesis: string; request: number | null; outcome: string; gain_pct: number; /** the gain once run-to-run noise is counted */ sure_pct?: number; spent_usd: number; why: string; experiment?: any };
export type EvolveSession = { status: string; goal: string; min_gain_pct: number; max_trials: number; budget_usd: number; spent_usd: number; started_ms: number; ended_ms: number; trials: EvolveTrial[]; report: string; note: string };
export type MachineInfo = { running: number; paused: number; why: string; view?: { free_gb: number; total_gb: number; cores: number; load1: number | null; pause_under_gb: number; continue_over_gb: number } | null };
export type EvolveState = { config: EvolveCfg; session: EvolveSession; running: boolean; tune: number; heldout: number; machine?: MachineInfo };
export const evolveStatus = (team: string) => teamOp<EvolveState>("evolve_status", { team });
export const evolveSet = (team: string, patch: Partial<EvolveCfg>) => teamOp<{ config: EvolveCfg }>("evolve_config", { team, patch });
export const evolveStart = (team: string) => teamOp<{ session: EvolveSession }>("evolve_start", { team });
export const evolveStop = (team: string) => teamOp("evolve_stop", { team });
// THE SWARM (RFC 0019): several ideas tested at the same time; its session is the evolve session shape with a trial per idea (waiting, running, then its outcome).
export type SwarmCfg = { width: number; concurrency: number };
export type SwarmState = { swarm: SwarmCfg; config: EvolveCfg; session: EvolveSession & { trials: (EvolveTrial & { experiment?: any })[] }; running: boolean; tune: number; heldout: number; /** the machine watcher: background runs paused because the person's computer is busy */ machine?: MachineInfo };
export const swarmStatus = (team: string) => teamOp<SwarmState>("swarm_status", { team });
export const swarmSet = (team: string, patch: Partial<SwarmCfg>) => teamOp<{ config: SwarmCfg }>("swarm_config", { team, patch });
export const swarmStart = (team: string) => teamOp<{ session: EvolveSession }>("swarm_start", { team });
export const swarmStop = (team: string) => teamOp("swarm_stop", { team });
