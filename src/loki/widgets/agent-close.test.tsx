import { describe, it, expect, vi, beforeEach } from "vitest";
const calls: any[] = [];
let reply: any;
vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn(async (url: string, body: any) => { calls.push({ url, body }); return reply; }) }));
import { statusSummary, CLI_KINDS, openPaneReview, prScreenHref } from "./agent-close";

beforeEach(() => { calls.length = 0; });

describe("agent close", () => {
  it("summarises the box honestly", () => {
    expect(statusSummary({ ok: false, error: "boom" })).toBe("boom");
    expect(statusSummary({ ok: true, uncommitted: 0, ahead: 0 })).toBe("the box is clean — nothing to merge");
    expect(statusSummary({ ok: true, uncommitted: 2, ahead: 1, base: "main" })).toBe("2 uncommitted files · 1 commit ahead of main");
    expect(statusSummary({ ok: true, uncommitted: 1, ahead: 0 })).toBe("1 uncommitted file");
    // every seat since 2026-09-28 — closing a Cursor or Gemini box is the same act as closing a Claude one
    expect([...CLI_KINDS]).toEqual(["claude-code", "codex", "gemini", "grok", "cursor", "opencode", "opencode-direct"]);
  });

  // THE PR SCREEN IS THE WAY TO A MERGE (2026-09-19): "merge" opens the pane's PR and lands on it
  it("review & merge opens the pane's PR and points at the PR screen; an out-of-scope box is refused with the files", async () => {
    // QA v2 (2026-09-21): the pane route — the serve wraps the engine's answer in `result` and puts the box's
    // QA verdicts on the PR body; the plain shape still parses
    reply = { ok: true, result: { ok: true, opened: [7], skipped: [] } };
    const r = await openPaneReview(3);
    expect(calls[0]).toEqual({ url: "/api/v1/cockpit/pane/pr", body: { pane_id: 3 } });
    expect(r).toEqual({ ok: true, prId: 7 });
    reply = { ok: true, opened: [7], skipped: [] };
    expect((await openPaneReview(3)).prId).toBe(7);
    // THE SEAL: a failed latest verdict refuses the PR with the verdict; `force` asks anyway
    reply = { ok: false, sealed: true, qa: { passed: false, score: 40, summary: "t2 skipped its tests", findings: [{ task: "t2", kind: "unmet", text: "no test" }] }, error: { message: "sealed — the QA judge failed the latest run (40/100): t2 skipped its tests" } };
    const sealed = await openPaneReview(3);
    expect(sealed.ok).toBe(false); expect(sealed.sealed?.score).toBe(40); expect(sealed.error).toContain("sealed");
    reply = { ok: true, result: { opened: [8], skipped: [] } };
    expect((await openPaneReview(3, true)).prId).toBe(8);
    expect(calls[calls.length - 1]).toEqual({ url: "/api/v1/cockpit/pane/pr", body: { pane_id: 3, force: true } });
    expect(prScreenHref(7)).toBe("/operations/pulls?pr=7");
    reply = { ok: true, opened: [], skipped: [{ idx: 2, reason: "out_of_scope", files: ["src/x.ts", "src/y.ts"] }] };
    const s = await openPaneReview(3);
    expect(s.ok).toBe(false); expect(s.error).toContain("out of scope: src/x.ts, src/y.ts"); expect(s.error).toContain("discard or re-scope");
    reply = { ok: true, opened: [], skipped: [{ idx: 2, reason: "no worktree" }] };
    expect((await openPaneReview(3)).error).toBe("no worktree");
  });
});
