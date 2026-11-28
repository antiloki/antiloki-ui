// THE DOOR TO THE SAVED QA PLANS (item 8d, 2026-10-01): what the serve refuses is said in the serve's words, a pass and a fail read differently, and a failing serve is never a thrown error.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiGet = vi.fn(); const apiPost = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...(a as [])), apiPost: (...a: any[]) => apiPost(...(a as [])) }));
import { listQaPlans, saveQaPlan, removeQaPlan, replayQaPlan, replayLine, type QaReplay } from "./qa-plans";

beforeEach(() => { apiGet.mockReset(); apiPost.mockReset(); });
const replay = (o: Partial<QaReplay>): QaReplay => ({ slug: "s", kind: "ui", passed: true, why: [], app: "http://localhost:5173/", source: "the preview running on this folder", ms: 900, checks_passed: 2, checks_failed: 0, failed_steps: 0, console_errors: [], checks: [], log: [], ...o });

describe("saved QA plans", () => {
  it("lists a folder's plans, asking for the right folder, and lists nothing when the serve cannot say", async () => {
    apiGet.mockResolvedValueOnce({ ok: true, plans: [{ slug: "a", kind: "ui", checks: 2, steps: 5, ask: "x", run_id: 1, saved_at: 2 }] });
    expect((await listQaPlans("/work/shop"))[0].slug).toBe("a");
    expect(apiGet).toHaveBeenCalledWith("/api/v1/cockpit/qa/plans?cwd=%2Fwork%2Fshop");
    apiGet.mockResolvedValueOnce({ ok: true, plans: [] }); await listQaPlans(); expect(apiGet).toHaveBeenLastCalledWith("/api/v1/cockpit/qa/plans");
    apiGet.mockRejectedValueOnce(new Error("offline")); expect(await listQaPlans()).toEqual([]);
    apiGet.mockResolvedValueOnce({ message: "Not Found", statusCode: 404 }); expect(await listQaPlans()).toEqual([]);
  });
  it("keeps a plan by the run that ran it, and says the serve's own reason when it refuses", async () => {
    apiPost.mockResolvedValueOnce({ ok: true, plan: { slug: "sort-dropdown" }, cwd: "/work/shop" });
    // the folder the serve kept the plan in rides back (review 2026-10-01: a run in a box or a sub-folder saved elsewhere than the default list looks)
    expect(await saveQaPlan(41, "sort-dropdown")).toEqual({ ok: true, plan: { slug: "sort-dropdown" }, cwd: "/work/shop" });
    apiPost.mockResolvedValueOnce({ ok: true, plan: { slug: "older-serve" } });
    expect(await saveQaPlan(40, "older-serve")).toEqual({ ok: true, plan: { slug: "older-serve" } });   // a serve that does not say: no cwd invented
    expect(apiPost).toHaveBeenCalledWith("/api/v1/cockpit/qa/plans", { run_id: 41, slug: "sort-dropdown" }, expect.objectContaining({ throwOnError: true }));
    apiPost.mockRejectedValueOnce(new Error("POST /api/v1/cockpit/qa/plans → 400: this plan did not pass - a failing plan is a bug report, not a regression test, so it is not kept"));
    const r = await saveQaPlan(42);
    expect(r).toEqual({ ok: false, error: "this plan did not pass - a failing plan is a bug report, not a regression test, so it is not kept" });
    expect(apiPost).toHaveBeenLastCalledWith("/api/v1/cockpit/qa/plans", { run_id: 42 }, expect.anything());   // no slug sent: the serve names it from the ask
  });
  it("removes a plan and replays one, and a missing verdict is an error rather than a pass", async () => {
    apiPost.mockResolvedValueOnce({ ok: true }); expect(await removeQaPlan("old", "/work/shop")).toEqual({ ok: true });
    expect(apiPost).toHaveBeenLastCalledWith("/api/v1/cockpit/qa/plans", { slug: "old", remove: true, cwd: "/work/shop" }, expect.anything());
    apiPost.mockResolvedValueOnce({ ok: true, ...replay({ passed: false, why: ["check failed: x"] }) });
    const r = await replayQaPlan("s", { app: "http://localhost:5173/" });
    expect(r.ok && r.replay.passed).toBe(false);
    expect(apiPost).toHaveBeenLastCalledWith("/api/v1/cockpit/qa/replay", { slug: "s", app: "http://localhost:5173/" }, expect.objectContaining({ timeoutMs: 300_000 }));
    apiPost.mockResolvedValueOnce({ ok: true }); expect(await replayQaPlan("s")).toEqual({ ok: false, error: "the serve gave no verdict" });
    apiPost.mockRejectedValueOnce(new Error("POST /api/v1/cockpit/qa/replay → 400: no saved QA plan \"s\" in this workspace"));
    expect(await replayQaPlan("s")).toEqual({ ok: false, error: "no saved QA plan \"s\" in this workspace" });
  });
  it("reads a pass and a fail in one line each", () => {
    expect(replayLine(replay({}))).toBe("still passes - 2 checks on the preview running on this folder");
    expect(replayLine(replay({ checks_passed: 1 }))).toBe("still passes - 1 check on the preview running on this folder");
    expect(replayLine(replay({ passed: false, why: ["check failed: the page does say \"Add to cart\" - the page had: a page about shoes", "1 step(s) could not be done"] })))
      .toBe("no longer passes - check failed: the page does say \"Add to cart\" - the page had: a page about shoes (and 1 more)");
    expect(replayLine(replay({ passed: false, why: [] }))).toBe("no longer passes - a check failed");
  });
});
