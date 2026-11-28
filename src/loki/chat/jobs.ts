// THE JOBS of the router (cli::Job) as the frontend names them — the order the winners are listed in, a two-letter
// code for the discreet stamp (operator 2026-09-23: "a circle icon like a job ID"), and the ROLE a merge takes when it
// wins a job, so every winner agent has a name of its own: composition + role ("KimiSeek Builder"). Pure — tested.
export const JOB_ORDER = ["editor-s", "editor-l", "planner", "verifier", "qa-gate", "test-writer", "lookup", "synthesis", "screening", "report"] as const;
export type JobName = (typeof JOB_ORDER)[number];
export const JOB_CODE: Record<JobName, string> = { "editor-s": "ES", "editor-l": "EL", planner: "PL", verifier: "VF", "qa-gate": "QA", "test-writer": "TW", lookup: "LK", synthesis: "SY", screening: "SC", report: "RP" };
export const JOB_ROLE: Record<JobName, string> = { "editor-s": "Tinker", "editor-l": "Builder", planner: "Architect", verifier: "Inspector", "qa-gate": "Judge", "test-writer": "Tester", lookup: "Scout", synthesis: "Scribe", screening: "Gatekeeper", report: "Herald" };
export function jobCode(job: string): string { return JOB_CODE[job as JobName] ?? job.slice(0, 2).toUpperCase(); }
export function jobRole(job: string): string { return JOB_ROLE[job as JobName] ?? job; }

/** the brand of a merge side key (`engine:model`) — Claude · Codex · DeepSeek · Kimi · Qwen · GLM; "" for none/raw */
export function brandOf(k: string): string {
  if (!k || k === "-" || k === "raw") return "";
  const m = k.split(":").slice(1).join(":").toLowerCase();
  if (k.startsWith("claude-code")) return "Claude";
  if (k.startsWith("codex")) return "Codex";
  if (m.includes("kimi")) return "Kimi"; if (m.includes("qwen")) return "Qwen"; if (m.includes("glm")) return "GLM"; if (m.includes("minimax")) return "MiniMax";
  return "DeepSeek";
}
const SUFFIX: Record<string, string> = { DeepSeek: "Seek", Claude: "Claude", Codex: "Codex", Kimi: "Kimi", Qwen: "Qwen", GLM: "GLM", MiniMax: "Max" };
/** THE MERGE WORD (operator: "Claude Seek, Kimi Codex…"): the brain's brand and the hands' as one word — ClaudeSeek,
 *  KimiSeek, ClaudeQwen; one brand when both sides are the same or one side is raw/none. Pure. */
export function mergeWord(planner: string, worker: string): string {
  const a = brandOf(planner), b = brandOf(worker);
  if (!a) return b || "—"; if (!b || a === b) return a;
  return `${a}${SUFFIX[b] ?? b}`;
}
/** A WINNER'S NAME — composition + role: "KimiSeek Builder", "Qwen Tinker", "ClaudeSeek Architect". Pure. */
export function mergeName(job: string, planner: string, worker: string): string { return `${mergeWord(planner, worker)} ${jobRole(job)}`; }

/** why a job may have no winner of its own: screening rides inside the planner's call (one call screens and plans);
 *  test-writer only runs in blueprint mode; report only on a multi-task run (a single task's report stands). Pure. */
export const JOB_NOTE: Partial<Record<JobName, string>> = {
  screening: "rides inside the planner's call — its winner is the planner's",
  "test-writer": "only a blueprint run writes tests — run bench/merges/jobs2.sh",
  report: "only a multi-task run consolidates — run bench/merges/jobs2.sh",
};
export function jobNote(job: string): string { return JOB_NOTE[job as JobName] ?? "the bench decides — run bench/merges on this job"; }

/** THE PROVIDER'S OWN NAME — never the bare engine key. Pure. */
export const PROVIDER_NAME: Record<string, string> = { "claude-code": "Claude", codex: "Codex", opencode: "OpenCode" };
/** A MODEL, WRITTEN THE WAY ITS MAKER WRITES IT — never the raw id. Pure. */
export function modelName(model: string): string {
  const m = String(model ?? "").replace(/^opencode\//, "").trim();
  if (!m || m === "default") return "";
  const at = m.split("@");                                   // codex: `gpt-5.6-terra@high`
  const base = at[0], effort = at[1];
  const pretty =
    /^deepseek-v4-flash$/.test(base) ? "DeepSeek v4 Flash" :
    /^deepseek-v4-pro$/.test(base) ? "DeepSeek v4 Pro" :
    /^deepseek/.test(base) ? `DeepSeek ${base.replace("deepseek-", "")}` :
    /^qwen/.test(base) ? base.replace(/^qwen([\d.]+)-?/, "Qwen $1 ").replace(/\bplus\b/, "Plus").trim() :
    /^kimi/.test(base) ? base.replace(/^kimi-?/, "Kimi ").replace("k2.7-code", "K2.7 Code").trim() :
    /^glm/.test(base) ? base.replace(/^glm-?/, "GLM ").trim() :
    /^(opus|sonnet|haiku)$/.test(base) ? base[0].toUpperCase() + base.slice(1) :
    base;
  return effort ? `${pretty} · ${effort}` : pretty;
}
/** THE NAME OF ONE SIDE OF A MERGE: the provider AND the model, always both (operator 2026-09-23: "all merges call the
 *  name of the provider + model — never just provider, never just model"). A side whose model the job decides says so
 *  rather than pretending to be a model. `raw` is not a side, it is the absence of one. Pure — tested. */
export function sideName(key: string): string {
  const k = String(key ?? "").trim();
  if (!k || k === "-") return "—";
  if (k === "raw") return "raw session";
  const [engine, ...rest] = k.split(":");
  const provider = PROVIDER_NAME[engine] ?? engine;
  const raw = rest.join(":");
  if (engine === "codex") {
    // Codex is a provider: the binding may carry a model, an effort, or both
    const [a, b] = raw.split("@");
    const efforts = ["low", "medium", "high"];
    const model = efforts.includes(a) ? "" : a, effort = b || (efforts.includes(a) ? a : "");
    if (model) return effort ? `Codex ${model} · ${effort}` : `Codex ${model}`;
    return effort ? `Codex · the account's model · ${effort}` : "Codex · the job's model";
  }
  const model = modelName(raw);
  return model ? `${provider} ${model}` : `${provider} · the job's model`;
}
/** Both sides of a measured row, provider and model on each. Pure. */
export function compositionName(planner: string, worker: string): string {
  const a = sideName(planner), b = sideName(worker);
  if (a === "—") return b; if (b === "—") return a;
  return `${a} × ${b}`;
}
