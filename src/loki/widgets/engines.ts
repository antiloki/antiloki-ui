// WHAT THIS MACHINE CAN ACTUALLY RUN (operator 2026-09-24, from a Windows install: "at the beggining it asks me
// to choose between the AIs planner and worker wich is good. But it should also check if i have those AIs
// available … the system of creating agents, should adapt to the faster, cheaper and best options AVAILABLE in
// the user machine and suggest the user to add more options to unlock merges").
//
// The merge catalogue lives with the wizard that shows it; the serve answers only for the machine — which CLIs
// are on the PATH and which models each offers here. This is where the two meet: a merge the machine cannot run
// is shown as locked, with the engine to install, rather than offered and then failing on the first turn.
import React from "react";
import { apiGet, unwrapResult as unwrap } from "@/loki/api/client";
import { ENGINE_KEYS, type EngineKey } from "@/loki/api/engine";

export type EngineInfo = { key: string; label: string; bin: string; installed: boolean; path: string | null; models: string[]; install: string;
  /** the operator switched this seat off (Settings › Seats) - installed, and still not a seat. Absent on an older serve. */ off?: boolean;
  /** `false` = installed but not signed in; `null`/absent = unknown (Antigravity keeps its login in the OS keyring) */ seat?: boolean | null };
export type UnlockArg = { engine: string; unlocks: string; why: string };
export type Advice = { headline: string; can_merge: boolean; installed: number; unlock: UnlockArg[] };
/** A merge the RECORD has measured, joined to what this machine can run (serve: engines::offerable). */
export type MeasuredMerge = {
  planner: string; worker: string; label: string; engines: string[];
  runs: number; rows: number; quality: number | null; usd: number; s: number;
  jobs: string[]; domains: string[]; ready: boolean; missing: string[];
};
export type Machine = { engines: EngineInfo[]; advice: Advice | null; merges: MeasuredMerge[] };

export const EMPTY: Machine = { engines: [], advice: null, merges: [] };

/** A side of a merge, as the catalogue writes it. */
export type Side = { engine: string; model?: string };

/**
 * Can this machine run that pair, and if not, what is missing?
 *
 * `missing` names ENGINES, never models: a model this listing does not know about is not proof of absence —
 * OpenCode's catalogue moves, and an empty `models` means the listing could not be read at all, not that the
 * engine has none. Blocking on that would lock every merge on a machine that can run all of them. Pure.
 */
export function readiness(pair: { brain: Side; hands: Side }, engines: EngineInfo[]): { ready: boolean; missing: string[]; why: string } {
  if (!engines.length) return { ready: true, missing: [], why: "" };   // nothing probed yet — never lock on ignorance
  const has = (k: string) => engines.some((e) => e.key === k && usable(e));
  const missing = [...new Set([pair.brain.engine, pair.hands.engine].filter((k) => !has(k)))];
  if (!missing.length) return { ready: true, missing: [], why: "" };
  const label = (k: string) => engines.find((e) => e.key === k)?.label ?? k;
  const first = engines.find((e) => e.key === missing[0]);
  // installed but switched off or signed out is a different repair from a missing binary (2026-10-01)
  const reason = first?.installed ? (first.off ? "switched off in Settings › Seats" : "not signed in") : "not installed on this machine";
  const how = first && !first.installed ? first.install : "";
  return { ready: false, missing, why: `needs ${missing.map(label).join(" and ")} — ${reason}${how ? `. ${how}` : ""}` };
}

/** The models one engine offers here, for the custom picker's suggestions. Pure. */
export function modelsOf(engines: EngineInfo[], key: string): string[] { return engines.find((e) => e.key === key)?.models ?? []; }

/** A SEAT THE ROUTER MAY USE: installed, signed in (or not knowably signed out) and not switched off by the operator. Installed is not enough -
 *  "Running on Claude Code" was printed on a machine whose Claude subscription had ended and was switched off (operator 2026-10-01, "Engine config also"). Pure. */
export function usable(e: EngineInfo): boolean { return e.installed && !e.off && e.seat !== false; }
/** The seats this machine can run on, in the order the catalogue names them. Pure. */
export function installed(engines: EngineInfo[]): EngineInfo[] { return engines.filter(usable); }

/** One line for a header: what is here, plainly. Pure. */
export function machineLine(engines: EngineInfo[]): string {
  if (!engines.length) return "";
  const on = installed(engines);
  if (!on.length) return "no agent CLI found on this machine";
  return `${on.map((e) => e.label).join(" · ")} — found here`;
}

let cache: Machine | null = null;
/** The probe, once per page load: the answer changes when the user installs something, not while they click. */
export async function fetchMachine(): Promise<Machine> {
  if (cache) return cache;
  // A FAILED PROBE IS NOT AN ANSWER (audit 2026-09-28). `apiGet` resolves `null` on any failure, so one
  // transient miss at startup — exactly what a burst on serve's single writer connection causes — was cached as
  // "no engines" for the life of the page. Main's welcome then said "No agent CLI found on this machine yet"
  // with every CLI installed, and the hire wizard offered nothing. Only a reload recovered it.
  // Nothing is cached unless the probe actually answered; the next caller simply asks again.
  const r = unwrap(await apiGet(`/api/v1/engines`, { timeoutMs: 20_000 }));
  if (!r || !Array.isArray(r.engines)) return EMPTY;
  cache = { engines: r.engines, advice: r?.advice ?? null, merges: Array.isArray(r?.merges) ? r.merges : [] };
  return cache;
}
/** Forget the probe — after the user says they installed something. */
export function forgetMachine() { cache = null; }

export function useMachine(): Machine {
  const [m, setM] = React.useState<Machine>(() => cache ?? EMPTY);
  React.useEffect(() => { let live = true; void fetchMachine().then((x) => { if (live) setM(x); }); return () => { live = false; }; }, []);
  return m;
}

/**
 * THE CATALOGUE IS THE EVIDENCE (operator 2026-09-25: "you should be able to merge any model to any model").
 *
 * The wizard shipped six hardcoded pairs — Claude×DeepSeek, Kimi×DeepSeek, and four more — all of them a
 * frontier model over a cheap one. The record was never that narrow: it already held Chinese×Chinese and
 * Claude×Claude, and it will hold Claude×Codex the moment one is run. This prefers the served list, and falls
 * back to the constants only when the serve is old or unreachable, so the picker is never empty.
 *
 * A pair with fewer than `minRuns` runs is still shown, because hiding it would hide exactly the pairs the
 * operator most needs to try — but the run count rides along so nothing is offered as though it were proven.
 * Pure — tested.
 */
export function mergeOptions(m: Machine, minRuns = 1): MeasuredMerge[] {
  return m.merges.filter((x) => x.runs >= minRuns);
}

/** What to say under a merge: the evidence, or plainly that there is not much of it yet. Pure — tested. */
export function mergeNote(x: MeasuredMerge): string {
  if (!x.ready) return `needs ${x.missing.join(" and ")} — not installed on this machine`;
  const money = x.usd >= 0.01 ? `$${x.usd.toFixed(2)}` : `$${x.usd.toFixed(3)}`;
  const time = x.s >= 60 ? `${Math.round(x.s / 60)} min` : `${Math.round(x.s)} s`;
  const q = x.quality == null ? "nothing audited it yet" : `${Math.round(x.quality * 100)}% of checks`;
  const where = x.domains.length ? ` · measured on ${x.domains.join(", ")}` : "";
  // THE SAMPLE SIZE RIDES WITH THE NUMBER. A mean over two runs and a mean over ninety look identical on
  // screen, and only one of them is a measurement.
  const n = x.runs === 1 ? "1 run" : `${x.runs} runs`;
  return `${n} · ${q} · ${money} · ${time}${where}`;
}

/** `"opencode:opencode/deepseek-v4-flash"` → the shape a pane stores. The record writes a side as one string;
 *  a pane's settings want the two halves. `default` means "the job's measured model", which is no model at
 *  all. Pure — tested. */
export type { EngineKey };
export { ENGINE_KEYS };

export function sideOf(key: string): { engine: EngineKey; model?: string } {
  const [head, ...rest] = key.split(":");
  const model = rest.join(":");
  // AN UNKNOWN ENGINE IS NOT A CRASH. The record is written by benches and by runs, and a row from a future
  // engine must not take the picker down — it falls back to opencode, which is the gateway that carries
  // everything that is not one of the seats.
  const engine = (ENGINE_KEYS as readonly string[]).includes(head) ? (head as EngineKey) : "opencode";
  return { engine, ...(model && model !== "default" ? { model } : {}) };
}
