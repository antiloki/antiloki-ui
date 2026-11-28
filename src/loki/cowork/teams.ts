// TEAMS, FROM THE SERVE (operator 2026-11-10): who is linked as a planner, a worker and a QA, and the runs that go through them. The serve holds the truth (`teams.json`, the sagas); this reads it and says what to do.
import { apiPost } from "@/loki/api/client";
import * as React from "react";
import type { TeamRole } from "./layout";
import type { TeamDef } from "./team-layout";

export type TeamMember = { role: TeamRole; pane: number; agent?: string | null; engine?: string | null; /** a planner or QA box held read-only */ held?: boolean; /** it already had changes when it was held: they are its baseline, not violations */ baseline_dirty?: boolean };
export type Violation = { t?: number; role?: string; pane?: number; files?: string[]; moved_head?: boolean };
export type TeamRow = { id: string; name: string; /** a PAIR: two agents, one plans and also judges, the other works (operator 2026-11-13) */ pair?: boolean; members: TeamMember[]; ready: boolean; /** how many times a planner or a QA changed code and was reverted */ violations?: number; last_violation?: Violation | null };
export type Criterion = { id: string; ok: boolean; evidence: string };
export type Verdict = { passed: boolean; results: Criterion[]; summary: string };
export type TeamRun = {
  run_id: string; team: string; task: string; saga?: number; started_ms?: number; ended?: boolean; outcome?: "done" | "blocked"; blocked?: string;
  run?: { phase?: string; attempt?: number; max_attempts?: number; criteria?: number; verdicts?: number; spent_usd?: number; budget_usd?: number | null; has_planner?: boolean; has_qa?: boolean };
  verdicts?: Verdict[]; plan?: { summary?: string; steps?: string[]; criteria?: { id: string; text: string }[] } | null;
};
export type TeamState = { teams: TeamRow[]; live: TeamRun[]; runs: TeamRun[] };

export async function loadTeams(): Promise<TeamState | null> {
  const r: any = await apiPost("/api/v1/cockpit/teams", { op: "list" }, { timeoutMs: 8000 });
  if (!r || r.ok === false || !Array.isArray(r.teams)) return null;
  return { teams: r.teams, live: Array.isArray(r.live) ? r.live.filter((x: any) => x && x.run_id) : [], runs: Array.isArray(r.runs) ? r.runs : [] };
}
export async function teamOp(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const r: any = await apiPost("/api/v1/cockpit/teams", body, { timeoutMs: 20_000 });
  return r && typeof r === "object" ? r : { ok: false, error: "the serve did not answer" };
}
/** The teams as the layout wants them. Pure. */
export const defsOf = (teams: TeamRow[]): TeamDef[] => teams.map((c) => ({ id: c.id, name: c.name, members: c.members.map((m) => ({ role: m.role, pane: m.pane })) }));
/** The run to show for a team: the one going, else the newest the serve kept. Pure. */
export function runOf(state: TeamState | null, team: string): TeamRun | null {
  if (!state) return null;
  const going = state.live.filter((r) => r.team === team && !r.ended).sort((a, b) => (b.started_ms ?? 0) - (a.started_ms ?? 0))[0];
  return going ?? state.live.filter((r) => r.team === team).concat(state.runs.filter((r) => r.team === team)).sort((a, b) => (b.started_ms ?? 0) - (a.started_ms ?? 0))[0] ?? null;
}
/** The roles a pane may take in a team: the ones nobody has. Pure. */
export const freeRoles = (team: TeamRow | undefined): TeamRole[] => team?.pair ? [] : (["planner", "worker", "qa"] as TeamRole[]).filter((r) => !team?.members.some((m) => m.role === r));

/** Which panes to unlink when `pane` is closed: closing one of a PAIR unlinks both (the one left is a normal agent again, operator 2026-11-23); in any other team only the closed one leaves; a pane in no team needs nothing. Pure. */
export const unlinkOnClose = (team: TeamRow | undefined, pane: number, hasRole: boolean): number[] => team?.pair ? team.members.map((m) => m.pane) : hasRole ? [pane] : [];

/** The teams, read every couple of seconds (a run moves faster than a safety-net poll would show) and at once when asked. A failed read keeps what was last seen. */
export function useTeams(everyMs = 2000) {
  const [state, setState] = React.useState<TeamState | null>(null);
  const alive = React.useRef(true);
  const refresh = React.useCallback(() => { void loadTeams().then((r) => { if (alive.current && r) setState(r); }); }, []);
  React.useEffect(() => { alive.current = true; refresh(); const t = setInterval(refresh, everyMs); return () => { alive.current = false; clearInterval(t); }; }, [refresh, everyMs]);
  return { state, refresh };
}

// THE RUN AS A TO-DO LIST (operator 2026-11-10: "a real time task bar when a plan starts, like a todolist, and during the worker's and QA's work the tasks get finished in real time, visually"). Derived from what the serve says of the run, so
// it moves as the run does: the pipeline (plan, each attempt's work and QA), the planner's steps, and the acceptance criteria as the QA has judged them. Pure.
export type TodoState = "pending" | "doing" | "checking" | "done" | "failed";
export type TodoItem = { id: string; text: string; state: TodoState; note?: string };
export type Pipe = { label: string; state: "pending" | "doing" | "done" | "failed" };
export function todoOf(r: TeamRun | null): { pipeline: Pipe[]; steps: TodoItem[]; criteria: TodoItem[] } {
  if (!r) return { pipeline: [], steps: [], criteria: [] };
  const run = r.run ?? {}; const phase = run.phase ?? "planning"; const attempt = run.attempt ?? 0; const verdicts = r.verdicts ?? []; const ended = !!r.ended; const done = ended && r.outcome === "done"; const blocked = ended && r.outcome === "blocked";
  const hasQa = run.has_qa !== false; const hasPlan = !!r.plan && ((r.plan.criteria?.length ?? 0) > 0);
  const pipeline: Pipe[] = [];
  if (run.has_planner !== false) pipeline.push({ label: "plan", state: hasPlan ? "done" : blocked ? "failed" : "doing" });
  for (let i = 1; i <= Math.max(attempt, hasPlan ? 1 : 0); i += 1) {
    const v = verdicts[i - 1];
    const workState: Pipe["state"] = i < attempt || (i === attempt && (phase === "verifying" || done || (blocked && v))) ? "done" : i === attempt ? (phase === "working" ? "doing" : blocked ? "failed" : "pending") : "pending";
    pipeline.push({ label: `work ${i}`, state: workState });
    if (hasQa) pipeline.push({ label: `QA ${i}`, state: v ? (v.passed ? "done" : "failed") : i === attempt && phase === "verifying" ? "doing" : "pending" });
  }
  const last = verdicts[verdicts.length - 1];
  const stepState: TodoState = done ? "done" : blocked ? "failed" : phase === "working" ? "doing" : phase === "verifying" ? "checking" : "pending";
  const steps = (r.plan?.steps ?? []).map((t, i) => ({ id: `s${i + 1}`, text: t, state: stepState }));
  const criteria: TodoItem[] = (r.plan?.criteria ?? []).map((c) => {
    const res = last?.results.find((x) => x.id === c.id);
    const state: TodoState = res ? (res.ok ? "done" : "failed") : phase === "verifying" ? "checking" : done ? "done" : "pending";
    return { id: c.id, text: c.text, state, note: res && !res.ok ? res.evidence : undefined };
  });
  return { pipeline, steps, criteria };
}

/** The badge on a team's bar when a read-only role has changed code: how many times, and the last one in words. `null` when there is nothing to say. Pure. */
export function violationNote(c: Pick<TeamRow, "violations" | "last_violation">): { text: string; title: string } | null {
  const n = c.violations ?? 0; if (n <= 0) return null;
  const l = c.last_violation; const files = (l?.files ?? []).slice(0, 4).join(", ");
  return { text: `⚠ ${n} reverted`, title: `${n} time${n === 1 ? "" : "s"} a planner or a QA changed code and it was put back. Last: the ${l?.role === "qa" ? "QA" : l?.role ?? "agent"}${files ? ` changed ${files}` : ""}${l?.moved_head ? " and moved the commit" : ""}. Only the worker edits.` };
}
