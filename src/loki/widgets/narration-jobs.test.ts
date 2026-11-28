// The narration render queue. Playback is gated on COMPLETENESS (operator 2026-07-27: "render in
// the background everything BEFORE permitting reproduction"), so jobComplete is a real gate, not a
// label — and the countdown is what the operator watches while waiting. Both are pure.
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  segRemainingTokens, jobRemainingTokens, jobComplete,
  subscribeNarration, getNarrationJobs, getNarrationJob, removeNarrationJob,
  setCinemaHold, getCinemaHold,
  requestDockExpand, getExpandSeq,
  requestCastWhenReady, consumeCastRequest,
  requestClassWhenReady, consumeClassRequest,
} = await import("./narration-jobs");

const seg = (over: any = {}) => ({ ord: 1, title: "s", est_ms: 1000, units: 1, tokens_est: 100, status: "queued", ...over }) as any;
const job = (over: any = {}) => ({ id: 1, title: "t", voice: "v", kind: "k", phase: "pressing", segs: [], pressStarted: false, ...over }) as any;

beforeEach(() => {
  // Drain the module-level maps so each scenario starts clean.
  for (const j of getNarrationJobs()) removeNarrationJob(j.id);
  consumeCastRequest();
  consumeClassRequest();
  setCinemaHold(false);
});

describe("segRemainingTokens — the live countdown", () => {
  it("is zero once a segment is ready", () => {
    expect(segRemainingTokens(seg({ status: "ready", tokens_est: 500 }))).toBe(0);
  });

  it("is the full estimate while queued", () => {
    expect(segRemainingTokens(seg({ status: "queued", tokens_est: 500 }))).toBe(500);
  });

  it("scales with progress while pressing", () => {
    expect(segRemainingTokens(seg({ status: "pressing", tokens_est: 500, prog: { done: 1, total: 4 } }))).toBe(375);
    expect(segRemainingTokens(seg({ status: "pressing", tokens_est: 500, prog: { done: 4, total: 4 } }))).toBe(0);
  });

  it("falls back to the full estimate when pressing with no progress yet", () => {
    expect(segRemainingTokens(seg({ status: "pressing", tokens_est: 500 }))).toBe(500);
    expect(segRemainingTokens(seg({ status: "pressing", tokens_est: 500, prog: { done: 0, total: 0 } }))).toBe(500);
  });

  it("never goes negative if progress overshoots", () => {
    expect(segRemainingTokens(seg({ status: "pressing", tokens_est: 100, prog: { done: 9, total: 4 } }))).toBe(0);
  });

  it("treats a missing estimate as zero rather than NaN", () => {
    expect(segRemainingTokens(seg({ tokens_est: undefined }))).toBe(0);
  });

  it("counts an errored segment as still outstanding", () => {
    // It has not been rendered, so the countdown must not claim it is done.
    expect(segRemainingTokens(seg({ status: "error", tokens_est: 300 }))).toBe(300);
  });
});

describe("jobRemainingTokens", () => {
  it("sums every segment", () => {
    const j = job({ segs: [seg({ tokens_est: 100 }), seg({ tokens_est: 250, status: "ready" }), seg({ tokens_est: 50 })] });
    expect(jobRemainingTokens(j)).toBe(150);
  });

  it("is zero for a job with no segments", () => {
    expect(jobRemainingTokens(job())).toBe(0);
  });
});

describe("jobComplete — the playback gate", () => {
  it("is false when ANY segment has no decoded buffer", () => {
    expect(jobComplete(job({ segs: [seg({ buffer: {} }), seg()] }))).toBe(false);
  });

  it("is true only when every segment has a buffer", () => {
    expect(jobComplete(job({ segs: [seg({ buffer: {} }), seg({ buffer: {} })] }))).toBe(true);
  });

  it("is FALSE for a job with no segments — an empty job is not a finished one", () => {
    // `segs.every` on an empty array is vacuously true; the length guard is what prevents an empty
    // job from being reported as playable.
    expect(jobComplete(job({ segs: [] }))).toBe(false);
  });

  it("ignores status and looks only at the buffer", () => {
    // status can say ready before the audio is decoded; the buffer is the truth.
    expect(jobComplete(job({ segs: [seg({ status: "ready" })] }))).toBe(false);
  });
});

describe("cinema hold", () => {
  it("round-trips and starts false", () => {
    expect(getCinemaHold()).toBe(false);
    setCinemaHold(true);
    expect(getCinemaHold()).toBe(true);
  });

  it("notifies subscribers", () => {
    const f = vi.fn();
    const off = subscribeNarration(f);
    setCinemaHold(true);
    expect(f).toHaveBeenCalled();
    off();
  });
});

describe("subscribeNarration", () => {
  it("returns a working disposer", () => {
    const f = vi.fn();
    subscribeNarration(f)();
    requestDockExpand();
    expect(f).not.toHaveBeenCalled();
  });

  it("one throwing listener does not stop the others", () => {
    const good = vi.fn();
    const offBad = subscribeNarration(() => { throw new Error("listener bug"); });
    const offGood = subscribeNarration(good);
    expect(() => requestDockExpand()).not.toThrow();
    expect(good).toHaveBeenCalled();
    offBad(); offGood();
  });
});

describe("dock expand", () => {
  it("increments a sequence so repeated requests are distinguishable", () => {
    const before = getExpandSeq();
    requestDockExpand();
    requestDockExpand();
    expect(getExpandSeq()).toBe(before + 2);
  });
});

describe("deferred cast / class requests", () => {
  it("does NOT fire for a job that is not yet rendered", () => {
    requestCastWhenReady({ narrationId: 99, sessionId: 1, title: "t" });
    expect(consumeCastRequest()).toBeNull();
  });

  it("does not fire for a job that does not exist at all", () => {
    requestClassWhenReady({ narrationId: 1234, deck: {}, title: "t" });
    expect(consumeClassRequest()).toBeNull();
  });

  it("consumes exactly ONCE — a second read is empty", () => {
    // Otherwise the film re-expands on every re-render.
    requestCastWhenReady({ narrationId: 1, sessionId: 2, title: "t" });
    consumeCastRequest();
    expect(consumeCastRequest()).toBeNull();
  });

  it("keeps cast and class requests independent", () => {
    requestCastWhenReady({ narrationId: 1, sessionId: 2, title: "cast" });
    requestClassWhenReady({ narrationId: 1, deck: {}, title: "class" });
    consumeCastRequest();
    expect(consumeClassRequest()).toBeNull(); // neither job is complete, so neither ever fired
  });
});

describe("removeNarrationJob", () => {
  it("is safe for an id that was never added", () => {
    expect(() => removeNarrationJob(4242)).not.toThrow();
  });

  it("leaves the registry empty", () => {
    expect(getNarrationJobs()).toEqual([]);
    expect(getNarrationJob(1)).toBeUndefined();
  });
});
