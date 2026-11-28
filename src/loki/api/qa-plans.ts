// THE QA'S PLAN AS A REGRESSION TEST (item 8d, 2026-10-01): the door to the serve's saved plans. A run's QA writes a deterministic step plan; one that passed can be kept
// beside the code (`.antiloki/qa/<slug>.json`) and replayed later by the same runner - no model, no pictures to read, a verdict. There is no screen for it yet: this is the hook one will
// stand on. Every call says the serve's own reason when it refuses (a plan that did not pass, or that decided nothing, is not kept).
import { apiGet, apiPost } from "@/loki/api/client";

export type QaPlanRow = { slug: string; kind: "ui" | "api"; ask: string; run_id: number; saved_at: number; checks: number; steps: number };
export type QaReplay = {
  slug: string; kind: "ui" | "api"; passed: boolean; /** why it did not pass, one sentence each */ why: string[]; app: string; source: string; ms: number;
  checks_passed: number; checks_failed: number; failed_steps: number; console_errors: string[]; checks: { asked: string; passed: boolean; had: string }[]; log: string[];
};
const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;
const refusal = (e: any) => String(e?.message ?? e).replace(/^POST [^ ]+ → \d{3}:?\s*/, "");

/** the plans saved in a folder (the active workspace when none is given), newest first. Empty when the serve cannot say. */
export async function listQaPlans(cwd?: string): Promise<QaPlanRow[]> {
  try { const r = unwrap(await apiGet(`/api/v1/cockpit/qa/plans${cwd ? `?cwd=${encodeURIComponent(cwd)}` : ""}`)); return Array.isArray(r?.plans) ? r.plans : []; } catch { return []; }
}
/** keep the plan a run ran (its slug defaults to the words of the ask). `cwd` is the folder the serve kept it in (the workspace root, not the run's box): pass it back to `listQaPlans`, `replayQaPlan` and `removeQaPlan` when the plan is not in the active workspace. */
export async function saveQaPlan(runId: number, slug?: string): Promise<{ ok: true; plan: { slug: string }; cwd?: string } | { ok: false; error: string }> {
  try { const r = unwrap(await apiPost("/api/v1/cockpit/qa/plans", { run_id: runId, ...(slug ? { slug } : {}) }, { timeoutMs: 20_000, throwOnError: true })); return r?.plan ? { ok: true, plan: r.plan, ...(typeof r.cwd === "string" && r.cwd ? { cwd: r.cwd } : {}) } : { ok: false, error: "the serve did not keep the plan" }; }
  catch (e) { return { ok: false, error: refusal(e) }; }
}
export async function removeQaPlan(slug: string, cwd?: string): Promise<{ ok: boolean; error?: string }> {
  try { await apiPost("/api/v1/cockpit/qa/plans", { slug, remove: true, ...(cwd ? { cwd } : {}) }, { timeoutMs: 20_000, throwOnError: true }); return { ok: true }; } catch (e) { return { ok: false, error: refusal(e) }; }
}
/** run a saved plan again, now. A browser or a server is started for it, so give it time. */
export async function replayQaPlan(slug: string, opts: { cwd?: string; app?: string } = {}): Promise<{ ok: true; replay: QaReplay } | { ok: false; error: string }> {
  try { const r = unwrap(await apiPost("/api/v1/cockpit/qa/replay", { slug, ...opts }, { timeoutMs: 300_000, throwOnError: true })); return r && typeof r.passed === "boolean" ? { ok: true, replay: r as QaReplay } : { ok: false, error: "the serve gave no verdict" }; }
  catch (e) { return { ok: false, error: refusal(e) }; }
}
/** the one line a screen would print under a replay. Pure - tested. */
export function replayLine(r: QaReplay): string {
  if (r.passed) return `still passes - ${r.checks_passed} check${r.checks_passed === 1 ? "" : "s"} on ${r.source}`;
  return `no longer passes - ${r.why[0] ?? "a check failed"}${r.why.length > 1 ? ` (and ${r.why.length - 1} more)` : ""}`;
}
