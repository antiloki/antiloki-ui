import { apiGet } from "@/loki/api/client";
import { apiPostStrict } from "@/loki/api/post-strict";
import type { Ev, Rollup, Saga, Episode } from "./model";
import type { Change } from "./changes-model";

const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;
export type SagaDetail = { ok: boolean; saga: Saga; episodes: Episode[]; rollup: Rollup; events: Ev[]; /** snapshots of what the saga changed in the code, newest first (no patches) */ changes?: Change[] };
export type EpisodeDetail = { ok: boolean; episode: Episode; saga: { id: number; title: string }; steps: Episode[]; rollup: Rollup; events: Ev[] };

const wsq = (ws?: string) => (ws ? `&workspace=${encodeURIComponent(ws)}` : "");
/** The sagas of the open workspace, or (`all`) of every workspace, each saga saying which one it is in (`workspace`). */
export async function listSagas(all = false, ws?: string): Promise<Saga[] | null> {
  try { const d = unwrap(await apiGet(`/api/v1/sagas?${all ? "all=1" : "all=0"}${wsq(ws)}`)); return Array.isArray(d?.sagas) ? d.sagas : null; } catch { return null; }
}
export async function getSaga(id: number, ws?: string): Promise<SagaDetail | null> {
  try { const d = unwrap(await apiGet(`/api/v1/sagas/detail?id=${id}${wsq(ws)}`)); return d?.saga ? d : null; } catch { return null; }
}
export async function getEpisode(id: number, ws?: string): Promise<EpisodeDetail | null> {
  try { const d = unwrap(await apiGet(`/api/v1/sagas/episode?id=${id}${wsq(ws)}`)); return d?.episode ? d : null; } catch { return null; }
}
/** A write (in the workspace `ws`, else the open one). Throws the serve's own sentence when it refuses. */
export async function write<T = any>(op: "create" | "update" | "delete" | "episode-create" | "episode-update" | "episode-delete", body: Record<string, unknown>, ws?: string): Promise<T> {
  return unwrap(await apiPostStrict(`/api/v1/sagas/${op}`, ws ? { ...body, workspace: ws } : body)) as T;
}

/** Run the saga's open episodes (a goal run made from them), or stop its run. Throws the serve's own sentence when it refuses. */
export async function runSaga(id: number, ws?: string, op: "start" | "stop" = "start"): Promise<{ run?: number; episodes?: number }> {
  const r: any = unwrap(await apiPostStrict("/api/v1/sagas/run", { id, op, ...(ws ? { workspace: ws } : {}) }));
  if (r?.ok === false) throw new Error(typeof r.error === "string" ? r.error : "the run was not accepted");   // the serve answers a refusal with ok:false (a 200): it is said, never swallowed
  return r as { run?: number; episodes?: number };
}
