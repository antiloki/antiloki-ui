import { describe, it, expect } from "vitest";
import { canClose, boardMove, columnOf, visibleColumns, episodesToMove, type Status } from "./model";
import { parseView, hashOf } from "./sagas-screen";
import { group, progress, fmtMs, fmtUsd, fmtTokens, actorLabel, ago, nextStatus, ordered, originWord, episodeRows, filterTrail, kindLook, trailCounts, type Ev, type Saga, type Episode, type Rollup } from "./model";

const r = (o: Partial<Rollup> = {}): Rollup => ({ episodes: 0, todo: 0, doing: 0, done: 0, failed: 0, canceled: 0, ms: 0, usd: 0, tokens: 0, seats: {}, ...o });
const saga = (id: number, status: Saga["status"]): Saga => ({ id, title: `s${id}`, objective: "", status, origin: "you", plan_ref: null, confidence: "", delivered: 0, created_ms: 0, updated_ms: 0, rollup: r() });
const episode = (id: number, status: Episode["status"], position: number): Episode => ({ id, saga_id: 1, parent_id: null, title: `t${id}`, body: "", status, assignee: "", created_by: "you", position, engine: "", model: "", ms_total: 0, usd_total: 0, tokens: 0, created_ms: 0, updated_ms: 0, started_ms: null, done_ms: null });

describe("sagas model", () => {
  it("groups what is being worked on first and what is finished last, dropping empty groups", () => {
    const g = group([saga(1, "done"), saga(2, "doing"), saga(3, "todo"), saga(4, "doing")]);
    expect(g.map((x) => x.status)).toEqual(["doing", "todo", "done"]);
    expect(g[0].items.map((s) => s.id)).toEqual([2, 4]);
  });
  it("progress is finished over everything that was meant to be done", () => {
    expect(progress(r({ episodes: 5, done: 3 }))).toBe("3/5");
    expect(progress(r({ episodes: 5, done: 3, canceled: 1 }))).toBe("3/4");
    expect(progress(r())).toBe("—"); expect(progress(undefined)).toBe("—");
  });
  it("time, cost and tokens read as a person says them, and nothing measured is a dash", () => {
    expect([fmtMs(0), fmtMs(450), fmtMs(12_000), fmtMs(200_000), fmtMs(3_900_000)]).toEqual(["—", "450 ms", "12s", "3m 20s", "1h 05m"]);
    expect([fmtUsd(0), fmtUsd(0.004), fmtUsd(0.034)]).toEqual(["—", "<$0.01", "$0.03"]);
    expect([fmtTokens(0), fmtTokens(950), fmtTokens(12_300), fmtTokens(2_500_000)]).toEqual(["—", "950", "12.3k", "2.5M"]);
  });
  it("names an actor and its origin", () => {
    expect(actorLabel("cursor:composer")).toBe("cursor · composer"); expect(actorLabel("you")).toBe("you"); expect(actorLabel("")).toBe("—");
    expect([originWord("you"), originWord("heimdall"), originWord("frontender")]).toEqual(["written by you", "planned by Heimdall", "by frontender"]);
  });
  it("says how long ago", () => {
    const now = 1_000_000_000_000;
    expect([ago(now - 5_000, now), ago(now - 5 * 60_000, now), ago(now - 3 * 3_600_000, now), ago(now - 2 * 86_400_000, now)]).toEqual(["just now", "5m ago", "3h ago", "2d ago"]);
  });
  it("a click on an episode's circle cycles todo, doing, done", () => {
    expect([nextStatus("todo"), nextStatus("doing"), nextStatus("done"), nextStatus("failed")]).toEqual(["doing", "done", "todo", "todo"]);
  });
  it("open episodes come first, finished after, each in its own order", () => {
    expect(ordered([episode(1, "done", 1), episode(2, "todo", 2), episode(3, "doing", 3), episode(4, "todo", 1)]).map((t) => t.id)).toEqual([3, 4, 2, 1]);
  });
  it("a view round-trips through the URL hash, and nonsense is the list", () => {
    expect(parseView("#saga/3")).toEqual({ kind: "saga", id: 3 });
    expect(parseView("#episode/10/3")).toEqual({ kind: "episode", id: 10, saga: 3 });
    expect(hashOf({ kind: "episode", id: 10, saga: 3 })).toBe("#episode/10/3"); expect(hashOf({ kind: "list" })).toBe("");
    for (const bad of ["", "#", "#saga/", "#saga/x", "#episode/10", "#nope/1"]) expect(parseView(bad)).toEqual({ kind: "list" });
  });
  it("only an open saga can be canceled or deleted", () => {
    expect((["todo", "doing", "done", "failed", "canceled"] as const).map(canClose)).toEqual([true, true, false, false, false]);
  });
});

import { TOURS, tourFor } from "@/loki/shell/mini-tour";
describe("the Sagas tours (operator 2026-10-11)", () => {
  it("the screen has a three-step tour, a saga page has another, and /sagas unlocks the first", () => {
    expect(TOURS.sagas.steps.length).toBe(3); expect(TOURS.saga.steps.length).toBe(3);
    expect(tourFor("/sagas")).toBe("sagas"); expect(tourFor("/sagas/anything")).toBe("sagas");
    for (const s of [...TOURS.sagas.steps, ...TOURS.saga.steps]) expect(s.anchor && s.text.length > 40, s.title).toBeTruthy();
  });
});

describe("the trail's kinds and filters", () => {
  const ev = (id: number, kind: string): Ev => ({ id, task_id: 1, t_ms: id, actor: "Claude Code", kind, text: `${kind} ${id}` });
  const trail = [ev(1, "asked"), ev(2, "screen"), ev(3, "said"), ev(4, "tool"), ev(5, "mcp"), ev(6, "refused"), ev(7, "answered"), ev(8, "usage"), ev(9, "status")];
  it("every kind hooks and MCP leave has a look; the old kinds have none, so they read as before", () => {
    for (const k of ["asked", "screen", "said", "tool", "mcp", "refused", "answered", "usage"]) expect(kindLook(k), k).toBeTruthy();
    expect(kindLook("status")).toBeNull(); expect(kindLook("created")).toBeNull(); expect(kindLook("mcp")?.tag).toBe("antiloki"); expect(kindLook("refused")?.tone).toBe("bad");
  });
  it("a filter keeps the kinds it names; all keeps everything, a plain status survives only all", () => {
    expect(filterTrail(trail, "all")).toHaveLength(9);
    expect(filterTrail(trail, "talk").map((e) => e.kind)).toEqual(["asked", "screen", "said", "refused", "answered"]);
    expect(filterTrail(trail, "tools").map((e) => e.kind)).toEqual(["tool", "mcp", "refused"]);
    expect(filterTrail(trail, "antiloki").map((e) => e.kind)).toEqual(["screen", "mcp", "refused"]);
    expect(filterTrail(trail, "meter").map((e) => e.kind)).toEqual(["answered", "usage"]);
    expect(filterTrail(trail, "nonsense")).toHaveLength(9);
  });
  it("counts what each filter would show", () => { expect(trailCounts(trail)).toEqual({ all: 9, talk: 5, tools: 3, antiloki: 3, meter: 2 }); expect(trailCounts([ev(1, "status")]).tools).toBe(0); });
});

describe("an episode's properties", () => {
  const meta = { kind: "episode", n: 2, pane: "Backender", pane_id: 7, engine: "claude-code", model: "claude-haiku-5-5", turns: 3, open: false, closed_by: "pane-close", tokens: { in: 1500, out: 780, cache_read: 9000, cache_write: 500 },
    tools: { Read: 4, Edit: 2, Bash: 1 }, mcp: { "antiloki.antiloki_check": 2 }, files: ["a.ts", "b.ts"], refused: 1, errors: 0, summary_source: "model", summary_model: "claude-haiku-5-5" };
  it("reads as pane, model, episode, prompts, tokens, tools, antiloki tools, files, refusals and who wrote the summary", () => {
    const r = Object.fromEntries(episodeRows(meta).map((x) => [x.k, x.v]));
    expect(r.pane).toBe("Backender (#7)"); expect(r["ran on"]).toBe("claude-code · claude-haiku-5-5"); expect(r.episode).toBe("#2 · closed when the pane was closed"); expect(r.prompts).toBe("3");
    expect(r.tokens).toBe("1.5k in · 780 out · 9.5k cached"); expect(r["tools used"]).toBe("Read×4, Edit×2, Bash×1"); expect(r["antiloki tools"]).toBe("antiloki.antiloki_check×2"); expect(r["files changed"]).toBe("a.ts, b.ts");
    expect(r.refused).toBe("1 call outside the scope"); expect(r["summary by"]).toBe("claude-haiku-5-5"); expect("failed calls" in r).toBe(false);
  });
  it("an open episode says so and has no summary author yet; a plain summary says it is not a model's; anything that is not an episode has no rows", () => {
    expect(Object.fromEntries(episodeRows({ ...meta, open: true }).map((x) => [x.k, x.v])).episode).toBe("#2 · open, still being worked on"); expect(episodeRows({ ...meta, open: true }).some((x) => x.k === "summary by")).toBe(false);
    expect(episodeRows({ ...meta, summary_source: "deterministic" }).find((x) => x.k === "summary by")?.v).toBe("a plain summary (no model answered)");
    expect(episodeRows(null)).toEqual([]); expect(episodeRows({ kind: "goal-run" })).toEqual([]); expect(episodeRows({ ...meta, tools: { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 } }).find((x) => x.k === "tools used")?.v).toContain("+1 more");
  });
});

describe("the board's drop rules", () => {
  const mk = (id: number, status: Status, updated = id): Saga => ({ id, title: `s${id}`, objective: "", status, origin: "you", plan_ref: null, confidence: "", delivered: 0, created_ms: 0, updated_ms: updated, rollup: { episodes: 0, todo: 0, doing: 0, done: 0, failed: 0, canceled: 0, ms: 0, usd: 0, tokens: 0, seats: {} } } as Saga);
  const ok = (m: ReturnType<typeof boardMove>) => (m.ok ? m.kind : m.why);
  it("cancels an open saga, reopens a canceled one, starts the first episode of a to-do saga and finishes the open episodes of an open one", () => {
    expect(ok(boardMove("todo", "canceled", true))).toBe("cancel"); expect(ok(boardMove("doing", "canceled", true))).toBe("cancel");
    expect(ok(boardMove("canceled", "todo", false))).toBe("reopen");
    expect(ok(boardMove("todo", "doing", true))).toBe("start"); expect(ok(boardMove("todo", "done", true))).toBe("finish"); expect(ok(boardMove("doing", "done", true))).toBe("finish");
  });
  it("refuses what a saga's status cannot be told to be, and says why", () => {
    expect(ok(boardMove("done", "canceled", true))).toContain("part of the record"); expect(ok(boardMove("failed", "canceled", true))).toContain("part of the record");
    expect(ok(boardMove("doing", "todo", true))).toContain("does not go back"); expect(ok(boardMove("done", "todo", true))).toContain("does not go back");
    expect(ok(boardMove("todo", "failed", true))).toContain("run's verdict"); expect(ok(boardMove("todo", "todo", true))).toContain("already there");
    expect(ok(boardMove("canceled", "doing", true))).toContain("reopen it first"); expect(ok(boardMove("canceled", "done", true))).toContain("reopen it first"); expect(ok(boardMove("failed", "done", true))).toContain("stays failed");
    expect(ok(boardMove("todo", "doing", false))).toContain("no episodes to start"); expect(ok(boardMove("doing", "done", false))).toContain("no episodes to finish");
  });
  it("sorts a column by recent activity and shows the failed column only when something failed", () => {
    const s = [mk(1, "todo", 5), mk(2, "todo", 9), mk(3, "done", 1)];
    expect(columnOf(s, "todo").map((x) => x.id)).toEqual([2, 1]); expect(visibleColumns(s)).toEqual(["todo", "doing", "done", "canceled"]); expect(visibleColumns([...s, mk(4, "failed")])).toContain("failed");
  });
  it("moves the first open episode to start, and every open top-level episode to finish (never a step, a done or a canceled one)", () => {
    const t = (id: number, status: Status, position: number, parent: number | null = null): Episode => ({ id, saga_id: 1, parent_id: parent, title: `t${id}`, body: "", status, assignee: "", created_by: "you", position, engine: "", model: "", ms_total: 0, usd_total: 0, tokens: 0, created_ms: 0, updated_ms: 0, started_ms: null, done_ms: null });
    const episodes = [t(1, "done", 1), t(2, "todo", 3), t(3, "todo", 2), t(4, "doing", 4), t(5, "canceled", 5), t(6, "todo", 1, 3)];
    expect(episodesToMove("start", episodes)).toEqual([3]); expect(episodesToMove("finish", episodes).sort()).toEqual([2, 3, 4]); expect(episodesToMove("start", [t(1, "done", 1)])).toEqual([]);
  });
});
