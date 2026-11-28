// This module is ~50 thin wrappers over one POST, and the interesting behaviour is entirely in the
// edges they all share: which body they send, which timeout they allow, and how they tell a real
// result apart from action-run's {result:…} envelope, the not-wired sentinel and an engine error.
// Two of those edges have already caused live incidents (a 5s atlas read aborting into a fake
// "can't reach BE"; a NOT_FOUND job polled forever because "gone" collapsed into null), so they are
// pinned individually below.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiPost = vi.fn();
vi.mock("./client", () => ({
  apiPost: (...a: any[]) => apiPost(...a),
  isNotWired: (v: any) => !!(v && typeof v === "object" && v.__not_wired === true),
  engineError: (v: any) => (v && typeof v === "object" && v.__engine_error ? v.__engine_error : null),
}));

import * as cb from "./codebase";

beforeEach(() => { apiPost.mockReset(); apiPost.mockResolvedValue(null); });

const call = () => apiPost.mock.calls[0];
const body = () => apiPost.mock.calls[0][1];
const timeout = () => apiPost.mock.calls[0][2]?.timeoutMs;

// ── the shared unwrap contract ────────────────────────────────────────
// Each row: [name, invoke, the field that proves a real result].
const WRAPPERS: Array<[string, (fn: any) => Promise<any>, string]> = [
  ["descriptionGet", (f) => f({ path: "a.ts" }), "path"],
  ["typecheckStatus", (f) => f(), "languages"],
  ["typecheckRun", (f) => f({ scope: "all" }), "checked"],
  ["lintStatus", (f) => f(), "linters"],
  ["lintRun", (f) => f(), "ran"],
  ["parseHealth", (f) => f(), "total_files"],
  ["getAtlas", (f) => f(), "node_count"],
  ["blastRadius", (f) => f({ node_ids: ["n1"] }), "affected"],
  ["ingestCodebase", (f) => f(), "nodes"],
  ["scopeGet", (f) => f(), "supported_exts"],
  ["findSymbol", (f) => f({ query: "x" }), "matches"],
  ["getMetrics", (f) => f(), "metrics_by_file"],
  ["historyGet", (f) => f(), "points"],
  ["reviewHistoryGet", (f) => f(), "timeline"],
  ["fileHistory", (f) => f({ path: "a.ts" }), "revisions"],
  ["authorsGet", (f) => f(), "authors"],
  ["telemetryGet", (f) => f(), "ai"],
  ["coverageGet", (f) => f(), "files"],
  ["getTestMap", (f) => f(), "coverage_by_source"],
  ["runReport", (f) => f(), "project"],
  ["depsAudit", (f) => f(), "vulns"],
  ["latestReport", (f) => f(), "project"],
  ["smellToCard", (f) => f({ smell: {} as any }), "card_slug"],
  ["fileRead", (f) => f({ path: "a.ts" }), "content"],
  ["fileSnapshotGet", (f) => f({ path: "a.ts" }), "path"],
  ["snapshotAll", (f) => f(), "total"],
  ["digestLatest", (f) => f(), "ok"],
  ["decoratorsDoc", (f) => f(), "ok"],
  ["storyList", (f) => f(), "stories"],
  ["storyGet", (f) => f({ id: 1 }), "hops"],
  ["storyAdd", (f) => f({ name: "s", hops: [] }), "id"],
  ["storyDelete", (f) => f({ id: 1 }), "deleted"],
  ["storyPropose", (f) => f(), "proposals"],
  ["storyTrace", (f) => f(), "proposals"],
  ["storyToCard", (f) => f({ id: 1 }), "story_id"],
];

describe("every read wrapper survives the four shapes the BE can hand back", () => {
  it.each(WRAPPERS)("%s", async (name, invoke, key) => {
    const fn = (cb as any)[name];
    expect(fn, `${name} is exported`).toBeTypeOf("function");

    // (1) the skill result handed back flat
    apiPost.mockResolvedValue({ [key]: key === "ok" ? true : 7, marker: "flat" });
    expect((await invoke(fn))?.marker, "flat").toBe("flat");

    // (2) the same result nested under action-run's .result envelope
    apiPost.mockResolvedValue({ result: { [key]: key === "ok" ? true : 7, marker: "nested" } });
    expect((await invoke(fn))?.marker, "nested").toBe("nested");

    // (3) transient failure and (4) a route that isn't wired — both collapse to null so no screen
    // ever renders {__not_wired:true} as data.
    apiPost.mockResolvedValue(null);
    expect(await invoke(fn), "null").toBeNull();
    apiPost.mockResolvedValue({ __not_wired: true, path: "/x" });
    expect(await invoke(fn), "not_wired").toBeNull();
  });

  it("rejects a body that is missing the field proving it is a real result", async () => {
    apiPost.mockResolvedValue({ something_else: 1 });
    expect(await cb.getMetrics()).toBeNull();
    apiPost.mockResolvedValue({ result: { something_else: 1 } });
    expect(await cb.getMetrics()).toBeNull();
  });

  it("keeps a falsy-but-present ok:false result instead of nulling it — the error lives inside", async () => {
    apiPost.mockResolvedValue({ ok: false, error: "no digest" });
    expect(await cb.digestLatest()).toEqual({ ok: false, error: "no digest" });
  });
});

// ── routes that outlive the 5s default ────────────────────────────────
describe("heavy routes are given a timeout that matches the work", () => {
  it.each([
    ["getAtlas", () => cb.getAtlas(), 30_000],
    ["ingestCodebase", () => cb.ingestCodebase(), 120_000],
    ["typecheckRun", () => cb.typecheckRun({ scope: "all" }), 120_000],
    ["typecheckInstall", () => cb.typecheckInstall({ checker: "tsc" }), 120_000],
    ["lintRun", () => cb.lintRun(), 120_000],
    ["symbolExplain", () => cb.symbolExplain({ node_id: "n" }), 120_000],
    ["explainSnippet", () => cb.explainSnippet({ snippet: "x" }), 120_000],
    ["docsBuild", () => cb.docsBuild(), 60_000],
    ["docsOverview", () => cb.docsOverview(), 60_000],
    ["snapshotAll", () => cb.snapshotAll(), 60_000],
    ["digestSnapshot", () => cb.digestSnapshot(), 60_000],
    ["runReport", () => cb.runReport(), 60_000],
    ["insightsReview", () => cb.insightsReview(), 60_000],
    ["regenerateBlock", () => cb.regenerateBlock({ path: "a", start_line: 1, end_line: 2 }), 60_000],
  ])("%s allows at least %#", async (_name, invoke, atLeast) => {
    await invoke();
    expect(timeout()).toBeGreaterThanOrEqual(atLeast as number);
  });

  it("local-model explains match the provider's own 300s ceiling rather than undercutting it", async () => {
    // Undercutting produced a null the UI showed as a misleading "(provider / key)" error.
    await cb.symbolExplain({ node_id: "n" });
    expect(timeout()).toBe(300_000);
    apiPost.mockClear();
    await cb.explainSnippet({ snippet: "s" });
    expect(timeout()).toBe(300_000);
  });
});

// ── request bodies ────────────────────────────────────────────────────
describe("what actually goes on the wire", () => {
  it("getAtlas omits every argument it was not given", async () => {
    await cb.getAtlas();
    expect(body()).toEqual({});
    apiPost.mockClear();
    await cb.getAtlas({ origin: "atlas", path: "a.ts", limit: 5, with_tokens: true });
    expect(body()).toEqual({ origin: "atlas", path: "a.ts", limit: 5, with_tokens: true });
  });

  it("getAtlas drops with_tokens when false rather than sending it", async () => {
    await cb.getAtlas({ with_tokens: false, limit: 0 });
    expect(body()).toEqual({ limit: 0 });
  });

  it("blastRadius sends only the seed ids", async () => {
    await cb.blastRadius({ node_ids: ["a", "b"] });
    expect(call()[0]).toBe("/api/v1/codebase/blast");
    expect(body()).toEqual({ node_ids: ["a", "b"] });
  });

  it("lintRun defaults to the whole codebase when called bare", async () => {
    await cb.lintRun();
    expect(body()).toEqual({ scope: "all" });
  });

  it("the batch/sweep routes carry their explicit switch so the BE does not guess", async () => {
    await cb.decorateAll();
    expect(body()).toMatchObject({ all: true });
    apiPost.mockClear();
    await cb.docsBuild();
    expect(body()).toMatchObject({ build: true });
    apiPost.mockClear();
    await cb.docsExport();
    expect(body()).toMatchObject({ export: true });
  });

  it("each wrapper posts to its own route — no two share one path", async () => {
    const paths = new Set<string>();
    for (const [name, invoke] of WRAPPERS) {
      apiPost.mockClear();
      await invoke((cb as any)[name]);
      paths.add(apiPost.mock.calls[0][0]);
    }
    // latestReport/runReport differ, story* differ, etc. Duplicate paths would mean a copy-paste bug.
    expect(paths.size).toBe(WRAPPERS.length);
  });
});

// ── the three-outcome poll ────────────────────────────────────────────
describe("onboardStatus keeps 'gone' distinguishable from a transient miss", () => {
  it("returns the job when the engine answers", async () => {
    apiPost.mockResolvedValue({ job_id: "j1", phase: "ingest", status: "running" });
    expect(await cb.onboardStatus({ job_id: "j1" })).toMatchObject({ phase: "ingest" });
  });

  it("returns null on a transient miss — the poller must keep going", async () => {
    apiPost.mockResolvedValue(null);
    expect(await cb.onboardStatus({ job_id: "j1" })).toBeNull();
  });

  it("returns 'gone' on NOT_FOUND — terminal, because retrying that id never resolves", async () => {
    apiPost.mockResolvedValue({ __engine_error: { code: "NOT_FOUND", cause: "no such job" } });
    expect(await cb.onboardStatus({ job_id: "j1" })).toBe("gone");
  });

  it("does not treat a different engine error as terminal", async () => {
    apiPost.mockResolvedValue({ __engine_error: { code: "DB_LOCKED" } });
    expect(await cb.onboardStatus({ job_id: "j1" })).toBeNull();
  });

  it("polls with room for a heavy phase", async () => {
    await cb.onboardStatus({ job_id: "j1" });
    expect(timeout()).toBeGreaterThanOrEqual(20_000);
  });
});

describe("onboard control goes through the generic dispatch with a named action", () => {
  it("latest adopts whoever started the job", async () => {
    await cb.onboardLatest();
    expect(call()[0]).toBe("/api/v1/dispatch");
    expect(body()).toEqual({ action_name: "system.codebase.onboard.latest", input: {} });
  });

  it("pause names the job and the op", async () => {
    await cb.onboardPause("j7");
    expect(body()).toEqual({ action_name: "system.codebase.onboard.control", input: { job_id: "j7", op: "pause" } });
  });
});

// ── results that say WHY they are empty ───────────────────────────────
describe("fileReviewHistoryGet distinguishes the three empty reasons", () => {
  it("labels an unwired route", async () => {
    apiPost.mockResolvedValue({ __not_wired: true });
    expect(await cb.fileReviewHistoryGet({ path: "a.ts" })).toEqual({ unavailable: "not_wired" });
  });

  it("labels an engine error and carries its cause for the operator", async () => {
    apiPost.mockResolvedValue({ __engine_error: { code: "BAD_ROOT", cause: "git missing" } });
    expect(await cb.fileReviewHistoryGet({ path: "a.ts" })).toEqual({ unavailable: "engine_error", detail: "git missing" });
  });

  it("falls back to the error code when there is no cause", async () => {
    apiPost.mockResolvedValue({ __engine_error: { code: "BAD_ROOT" } });
    expect(await cb.fileReviewHistoryGet({ path: "a.ts" })).toEqual({ unavailable: "engine_error", detail: "BAD_ROOT" });
  });

  it("passes a genuine (possibly empty) history straight through", async () => {
    apiPost.mockResolvedValue({ path: "a.ts", snapshot_count: 0, snapshots: [] });
    expect(await cb.fileReviewHistoryGet({ path: "a.ts" })).toMatchObject({ snapshots: [] });
  });
});

describe("fileHistory turns an engine error into a renderable, not a null", () => {
  it("keeps the path and explains the failure instead of saying 'restart the BE'", async () => {
    apiPost.mockResolvedValue({ __engine_error: { code: "GIT_MISSING", cause: "git not on PATH" } });
    expect(await cb.fileHistory({ path: "a.ts" })).toEqual({
      path: "a.ts", count: 0, revisions: [], error: "engine error: git not on PATH",
    });
  });

  it("still collapses the not-wired sentinel to null", async () => {
    apiPost.mockResolvedValue({ __not_wired: true });
    expect(await cb.fileHistory({ path: "a.ts" })).toBeNull();
  });
});

describe("ONBOARD_PHASES", () => {
  it("starts at scope and ends at done, with no duplicates", () => {
    expect(cb.ONBOARD_PHASES[0]).toBe("scope");
    expect(cb.ONBOARD_PHASES[cb.ONBOARD_PHASES.length - 1]).toBe("done");
    expect(new Set(cb.ONBOARD_PHASES).size).toBe(cb.ONBOARD_PHASES.length);
  });
});
