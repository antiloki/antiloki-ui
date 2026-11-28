// SAGAS - the screen's model (operator 2026-10-11): a saga is a titled goal (an AI plan is one), it holds episodes, an episode holds steps. The team is the user and their agents.
// Everything here is pure; the screen only draws what these return.

export type Status = "todo" | "doing" | "done" | "failed" | "canceled";
export const STATUSES: Status[] = ["todo", "doing", "done", "failed", "canceled"];
export const STATUS_WORD: Record<Status, string> = { todo: "todo", doing: "in progress", done: "done", failed: "failed", canceled: "canceled" };

export type Rollup = { episodes: number; todo: number; doing: number; done: number; failed: number; canceled: number; ms: number; usd: number; tokens: number; seats: Record<string, number>; agents?: Record<string, { n: number; failed: number }> };
export type Episode = {
  id: number; saga_id: number; parent_id: number | null; title: string; body: string; status: Status; assignee: string; created_by: string; position: number;
  engine: string; model: string; ms_total: number; usd_total: number; tokens: number; created_ms: number; updated_ms: number; started_ms: number | null; done_ms: number | null;
  steps?: Episode[]; rollup?: Rollup;
  /** what made it (a team's pass: the run, the path, the episode it retries, the team episode that produced it); empty for the rest */ meta?: { run?: string; path?: string; pass?: number; unit_pass?: number; retry_of?: number | string | null; produced_by?: number | null; unit?: string; node?: string } | null;
};
export type Saga = { id: number; title: string; objective: string; status: Status; origin: string; plan_ref: string | null; /** how a hand-made saga runs: the seat, the model and the most it may cost (USD); each only when chosen */ run?: { engine?: string; model?: string; budget_usd?: number }; confidence: string; delivered: number; created_ms: number; updated_ms: number; rollup: Rollup , /** which workspace it is in (the list across workspaces) */ workspace?: string; /** an agent episode's deterministic metadata: pane, model, meter, tools, files */ meta?: Record<string, any> | null};
/** HOW EACH KIND OF LINE IN A TRAIL READS (the saga is the timeline of record: what was asked, how it was screened, what the model said, every call it made, antiloki's own tools among them, what was refused, how it concluded, what it cost). The first five kinds are what hooks and MCP leave; the rest is the existing story. */
export type KindLook = { tag: string; tone: "brand" | "ok" | "bad" | "warn" | "muted" | "fg"; mono?: boolean; quote?: boolean };
export const KIND_LOOK: Record<string, KindLook> = {
  asked: { tag: "asked", tone: "fg" }, screen: { tag: "screened", tone: "brand" }, said: { tag: "said", tone: "muted", quote: true }, tool: { tag: "tool", tone: "muted", mono: true },
  mcp: { tag: "antiloki", tone: "brand", mono: true }, refused: { tag: "refused", tone: "bad", mono: true }, answered: { tag: "concluded", tone: "ok" }, usage: { tag: "meter", tone: "muted", mono: true },
};
export const kindLook = (kind: string): KindLook | null => KIND_LOOK[kind] ?? null;
/** The filters over a trail: each is a set of kinds. `all` shows everything; the others cut the noise (a long tool trace buries the conversation). */
export const TRAIL_FILTERS: { key: string; label: string; kinds: string[] | null }[] = [
  { key: "all", label: "all", kinds: null },
  { key: "talk", label: "conversation", kinds: ["asked", "screen", "said", "answered", "refused"] },
  { key: "tools", label: "tools", kinds: ["tool", "mcp", "refused"] },
  { key: "antiloki", label: "antiloki", kinds: ["screen", "mcp", "refused"] },
  { key: "meter", label: "meter", kinds: ["usage", "answered"] },
];
/** The events a filter keeps. A line that is none of the new kinds (a status change, a plan note) is kept by `all` and by nothing else. Pure. */
export function filterTrail(events: Ev[], key: string): Ev[] {
  const f = TRAIL_FILTERS.find((x) => x.key === key); if (!f || !f.kinds) return events;
  return events.filter((e) => f.kinds!.includes(e.kind));
}
/** How many of each kind a trail holds, for the filter chips. */
export function trailCounts(events: Ev[]): Record<string, number> {
  const out: Record<string, number> = { all: events.length };
  for (const f of TRAIL_FILTERS) if (f.kinds) out[f.key] = events.filter((e) => f.kinds!.includes(e.kind)).length;
  return out;
}
export type Ev = { id: number; task_id: number | null; t_ms: number; actor: string; kind: string; text: string };

/** The order the list shows its groups in: what is being worked on first, what is finished last. */
export const GROUP_ORDER: Status[] = ["doing", "todo", "failed", "done", "canceled"];
export function group(sagas: Saga[]): { status: Status; items: Saga[] }[] {
  return GROUP_ORDER.map((status) => ({ status, items: sagas.filter((s) => s.status === status) })).filter((g) => g.items.length > 0);
}
/** "3/5" - finished over all (canceled ones do not count against it). */
export function progress(r: Rollup | undefined): string {
  if (!r || !r.episodes) return "—";
  return `${r.done}/${r.episodes - r.canceled}`;
}
export function fmtMs(ms: number): string {
  if (!ms || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
export function fmtUsd(usd: number): string {
  if (!usd || usd <= 0) return "—";
  return usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`;
}
export function fmtTokens(n: number): string { return !n ? "—" : n < 1000 ? String(n) : n < 1_000_000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1_000_000).toFixed(1)}M`; }
/** An actor as a person reads it: `cursor:composer` is "cursor · composer". */
export function actorLabel(a: string): string { return a.includes(":") ? a.replace(":", " · ") : a || "—"; }
export function isHuman(a: string): boolean { return a === "you"; }
export function ago(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}
/** Where a saga came from, in words. */
export function originWord(o: string): string { return o === "you" ? "written by you" : o === "heimdall" ? "planned by Heimdall" : `by ${o}`; }
/** The next status a click on an episode's circle moves it to (Linear's cycle, without 'failed' - that one is a run's verdict). */
export function nextStatus(s: Status): Status { return s === "todo" ? "doing" : s === "doing" ? "done" : s === "done" ? "todo" : "todo"; }
/** Episodes of a saga in the order a person reads them: open ones first, finished ones after, each by position. Pure. */
export function ordered(episodes: Episode[]): Episode[] {
  const rank = (s: Status) => (s === "doing" ? 0 : s === "todo" ? 1 : s === "failed" ? 2 : s === "done" ? 3 : 4);
  return [...episodes].sort((a, b) => rank(a.status) - rank(b.status) || a.position - b.position || a.id - b.id);
}
/** Can a saga still be canceled or deleted? Only while it is open: a finished one (done, failed, canceled) is part of the record. Mirrors the serve's rule (`work::is_open`). */
export function canClose(status: Status): boolean { return status === "todo" || status === "doing"; }

/** An agent episode's deterministic metadata as the property rows the saga page shows (an episode is a saga): who, on what, how much, which tools, which files, who wrote the summary. Pure. */
export function episodeRows(meta: Record<string, any> | null | undefined): { k: string; v: string }[] {
  if (!meta || meta.kind !== "episode") return [];
  const tok = meta.tokens ?? {}; const top = (o: unknown, n = 6) => { const e = Object.entries((o && typeof o === "object" ? o : {}) as Record<string, number>).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); return e.slice(0, n).map(([k, x]) => `${k}×${x}`).join(", ") + (e.length > n ? `, +${e.length - n} more` : ""); };
  const files: string[] = Array.isArray(meta.files) ? meta.files.map(String) : [];
  const rows: { k: string; v: string }[] = [
    { k: "pane", v: `${meta.pane || "agent"}${meta.pane_id ? ` (#${meta.pane_id})` : ""}` },
    { k: "ran on", v: [meta.engine, meta.model].filter(Boolean).join(" · ") || "—" },
    { k: "episode", v: `#${meta.n}${meta.open ? " · open, still being worked on" : meta.closed_by === "pane-close" ? " · closed when the pane was closed" : " · closed"}` },
    { k: "prompts", v: String(meta.turns ?? 0) },
    { k: "tokens", v: `${fmtTokens(tok.in ?? 0)} in · ${fmtTokens(tok.out ?? 0)} out · ${fmtTokens((tok.cache_read ?? 0) + (tok.cache_write ?? 0))} cached` },
  ];
  const tools = top(meta.tools); if (tools) rows.push({ k: "tools used", v: tools });
  const mcp = top(meta.mcp); if (mcp) rows.push({ k: "antiloki tools", v: mcp });
  if (files.length) rows.push({ k: "files changed", v: files.slice(0, 6).join(", ") + (files.length > 6 ? `, +${files.length - 6} more` : "") });
  if (meta.refused) rows.push({ k: "refused", v: `${meta.refused} call${meta.refused === 1 ? "" : "s"} outside the scope` });
  if (meta.errors) rows.push({ k: "failed calls", v: String(meta.errors) });
  if (!meta.open) rows.push({ k: "summary by", v: meta.summary_source === "model" ? `${meta.summary_model || "a model"}` : "a plain summary (no model answered)" });
  return rows;
}

// THE BOARD (operator 2026-11-10: "on sagas I told you to add a board view"): sagas as cards in columns by status, on the page and in the pane. A saga's status FOLLOWS ITS TASKS (the serve says so: only todo and canceled are set on a saga),
// so a drag cannot just write a status: it does what the gesture means to the saga's episodes, and the rules for that are here, pure.
export const BOARD_COLUMNS: Status[] = ["todo", "doing", "done", "failed", "canceled"];
export type BoardMove = { ok: true; kind: "cancel" | "reopen" | "start" | "finish"; says: string } | { ok: false; why: string };
/** What dropping a saga of status `from` on the column `to` does, or why it cannot. `hasEpisodes`: the saga has episodes to start or finish. */
export function boardMove(from: Status, to: Status, hasEpisodes: boolean): BoardMove {
  if (from === to) return { ok: false, why: "it is already there" };
  if (to === "failed") return { ok: false, why: "failed is a run's verdict: it is not set by hand" };
  if (to === "canceled") return canClose(from) ? { ok: true, kind: "cancel", says: "cancels the saga" } : { ok: false, why: "a finished saga is part of the record: it cannot be canceled" };
  if (to === "todo") return from === "canceled" ? { ok: true, kind: "reopen", says: "reopens the saga" } : { ok: false, why: "work that has started does not go back to to do" };
  if (to === "doing") {
    if (from !== "todo") return { ok: false, why: from === "canceled" ? "reopen it first (drop it on to do)" : "a saga is in progress while its episodes are" };
    return hasEpisodes ? { ok: true, kind: "start", says: "starts its first episode" } : { ok: false, why: "it has no episodes to start: add one first" };
  }
  // done
  if (from === "canceled" || from === "failed") return { ok: false, why: from === "canceled" ? "reopen it first (drop it on to do)" : "a failed saga stays failed: it is a run's verdict" };
  return hasEpisodes ? { ok: true, kind: "finish", says: "marks its open episodes done" } : { ok: false, why: "it has no episodes to finish: add one first" };
}
/** The sagas of one column, newest activity first. Pure. */
export function columnOf(sagas: Saga[], status: Status): Saga[] { return sagas.filter((s) => s.status === status).sort((a, b) => b.updated_ms - a.updated_ms || b.id - a.id); }
/** The columns a board shows: the four a person works with, and `failed` only while something is in it. Pure. */
export function visibleColumns(sagas: Saga[]): Status[] { return BOARD_COLUMNS.filter((c) => c !== "failed" || sagas.some((s) => s.status === "failed")); }
/** The episode ids a move touches: `start` the first open episode (by position), `finish` every episode not yet done or canceled. Pure over the saga's top-level episodes. */
export function episodesToMove(kind: "start" | "finish", episodes: Episode[]): number[] {
  const open = ordered(episodes.filter((t) => t.parent_id === null)).filter((t) => t.status === "todo" || t.status === "doing" || t.status === "failed");
  if (kind === "start") { const first = open.filter((t) => t.status === "todo").sort((a, b) => a.position - b.position || a.id - b.id)[0]; return first ? [first.id] : []; }
  return open.map((t) => t.id);
}

/** Can this saga be run now, and if not, why not? A run is made from the open episodes (done and canceled ones are not run again), at most eight; one that is already going is not started twice. Pure - tested. */
export function runState(saga: Pick<Saga, "status" | "plan_ref">, episodes: readonly Episode[]): { can: boolean; running: boolean; why: string; open: number } {
  const openEpisodes = episodes.filter((t) => t.status !== "done" && t.status !== "canceled").length;
  const running = !!saga.plan_ref?.startsWith("run:") && (saga.status === "doing" || episodes.some((t) => t.status === "doing"));
  if (saga.status === "canceled") return { can: false, running: false, why: "this saga is canceled: reopen it first", open: openEpisodes };
  if (running) return { can: false, running: true, why: "", open: openEpisodes };
  if (saga.plan_ref && !saga.plan_ref.startsWith("run:")) return { can: false, running: false, why: "this saga is not one you can run", open: openEpisodes };
  if (openEpisodes === 0) return { can: false, running: false, why: "add an episode first: done and canceled ones are not run again", open: 0 };
  if (openEpisodes > 8) return { can: false, running: false, why: `a run holds 8 episodes at most and this saga has ${openEpisodes} open: split it, or finish some first`, open: openEpisodes };
  return { can: true, running: false, why: "", open: openEpisodes };
}
