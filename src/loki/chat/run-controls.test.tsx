// @vitest-environment jsdom
// PAUSE / STOP AND THE QA'S VERDICT, IN THE OPEN (operator 2026-09-30: "a button to pause or stop an execution, so we dont be locked on a wrong execution" · "failed on qa? this should be more explicit ...
// i didnt see anywhere that was happening a second round, also why did it fail?").
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const ops: any[] = []; let fail: string | null = null;
vi.mock("@/loki/api/client", () => ({ apiGet: vi.fn(async () => ({})), BE_URL: "http://be.test" }));
vi.mock("@/loki/widgets/subagents", () => ({ goalOpStrict: vi.fn(async (op: string, body: any) => { ops.push([op, body]); if (fail) throw new Error(fail); return { ok: true }; }) }));
import { RunControls, QaVerdict, qaLine, fetchStory, type Story, type StoryQa } from "./work-story";

const story = (o: Partial<Story>): Story => ({ run: 272, goal: "g", status: "running", headline: "h", ...o } as any);
beforeEach(() => { ops.length = 0; fail = null; });
afterEach(() => { vi.useRealTimers(); });

describe("pause and stop", () => {
  it("offers pause and stop while a run works, and stop posts a cancel for that run", async () => {
    render(<RunControls story={story({ controls: { can_stop: true, can_pause: true, can_resume: false, stop_label: "stop" } })} />);
    expect(screen.getByTestId("run-pause")).toBeTruthy(); expect(screen.queryByTestId("run-resume")).toBeNull();
    fireEvent.click(screen.getByTestId("run-stop"));                                  // the first click only asks: workers are killed
    expect(ops).toEqual([]);
    expect(screen.getByTestId("run-stop").textContent).toContain("confirm stop");
    fireEvent.click(screen.getByTestId("run-stop"));
    await waitFor(() => expect(ops).toEqual([["cancel", { id: 272 }]]));
    await waitFor(() => expect(screen.getByTestId("run-controls-msg").textContent).toBe("stopped"));
  });
  it("stop confirm survives unmount between the two clicks", async () => {
    const a = render(<RunControls story={story({ controls: { can_stop: true, can_pause: true, can_resume: false, stop_label: "stop" } })} />);
    fireEvent.click(screen.getByTestId("run-stop"));
    expect(ops).toEqual([]);
    a.unmount();
    render(<RunControls story={story({ controls: { can_stop: true, can_pause: true, can_resume: false, stop_label: "stop" } })} />);
    expect(screen.getByTestId("run-stop").textContent).toContain("confirm stop");
    fireEvent.click(screen.getByTestId("run-stop"));
    await waitFor(() => expect(ops).toEqual([["cancel", { id: 272 }]]));
  });
  it("the stop question lapses by itself, so a stray first click leaves nothing loaded", () => {
    vi.useFakeTimers();
    render(<RunControls story={story({ controls: { can_stop: true, can_pause: true, can_resume: false, stop_label: "stop" } })} />);
    fireEvent.click(screen.getByTestId("run-stop"));
    expect(screen.getByTestId("run-stop").textContent).toContain("confirm stop");
    act(() => { vi.advanceTimersByTime(4100); });
    expect(screen.getByTestId("run-stop").textContent).not.toContain("confirm stop");
    expect(ops).toEqual([]);
  });
  it("a stop the serve refused says so and does not say 'stopped' (goalOp used to swallow the failure)", async () => {
    fail = "the serve did not answer (offline, or it took too long)";
    render(<RunControls story={story({ controls: { can_stop: true, can_pause: true, can_resume: false, stop_label: "stop" } })} />);
    fireEvent.click(screen.getByTestId("run-stop")); fireEvent.click(screen.getByTestId("run-stop"));
    await waitFor(() => expect(screen.getByTestId("run-controls-msg").textContent).toBe("could not stop: the serve did not answer (offline, or it took too long)"));
    expect(screen.getByTestId("run-controls-msg").textContent).not.toContain("stopped");
    expect((screen.getByTestId("run-stop") as HTMLButtonElement).disabled).toBe(false);    // still there to try again
    expect(screen.getByTestId("run-pause")).toBeTruthy();
  });
  it("a pause or resume the serve refused does not claim it happened", async () => {
    fail = "run 272 is not running";
    const a = render(<RunControls story={story({ controls: { can_stop: true, can_pause: true, can_resume: false, stop_label: "stop" } })} />);
    fireEvent.click(screen.getByTestId("run-pause"));
    await waitFor(() => expect(screen.getByTestId("run-controls-msg").textContent).toBe("could not pause: run 272 is not running"));
    a.unmount();
    render(<RunControls story={story({ status: "paused", controls: { can_stop: true, can_pause: false, can_resume: true, stop_label: "stop" } })} />);
    fireEvent.click(screen.getByTestId("run-resume"));
    await waitFor(() => expect(screen.getByTestId("run-controls-msg").textContent).toBe("could not resume: run 272 is not running"));
  });
  it("pause posts a pause for that run and says what pausing does", async () => {
    render(<RunControls story={story({ controls: { can_stop: true, can_pause: true, can_resume: false, stop_label: "stop" } })} />);
    fireEvent.click(screen.getByTestId("run-pause"));
    await waitFor(() => expect(ops).toEqual([["pause", { id: 272 }]]));
    await waitFor(() => expect(screen.getByTestId("run-controls-msg").textContent).toBe("paused — running tasks finish, nothing new starts"));
  });
  it("offers resume (not pause) on a paused run", async () => {
    render(<RunControls story={story({ status: "paused", controls: { can_stop: true, can_pause: false, can_resume: true, stop_label: "stop" } })} />);
    expect(screen.queryByTestId("run-pause")).toBeNull();
    fireEvent.click(screen.getByTestId("run-resume"));
    await waitFor(() => expect(ops).toEqual([["resume", { id: 272 }]]));
  });
  it("on a run that is done but being judged, the button says it stops the QA and keeps the work", async () => {
    render(<RunControls story={story({ status: "done", controls: { can_stop: true, can_pause: false, can_resume: false, stop_label: "stop the QA" } })} />);
    expect(screen.getByTestId("run-stop").textContent).toContain("stop the QA");
    fireEvent.click(screen.getByTestId("run-stop"));
    await waitFor(() => expect(screen.getByTestId("run-controls-msg").textContent).toContain("the work stands"));
  });
  it("shows nothing for a run that is over, and nothing for an older serve that sends no controls", () => {
    const a = render(<RunControls story={story({ status: "done", controls: { can_stop: false, can_pause: false, can_resume: false, stop_label: "stop" } })} />);
    expect(a.container.innerHTML).toBe("");
    const b = render(<RunControls story={story({})} />); expect(b.container.innerHTML).toBe("");
  });
});

describe("the QA's verdict is said plainly", () => {
  const qa = (o: Partial<StoryQa>): StoryQa => ({ state: "unmet", pending: false, rounds: 1, sent_back: 1, met: 0, unmet_n: 1, unproven: 0, unmet: [], timeline: [], ...o });
  it("names the verdict, the unmet claim with its reason, and that it went back for another round", () => {
    render(<QaVerdict qa={qa({ unmet: [{ claim: "the ask is done as written", why: "5 of the avatar checks failed", by: "opus" }], timeline: [{ kind: "qa-send-back", text: "[Q272.1] QA sent 1 task(s) back to their workers", t: 1 }] })} />);
    expect(screen.getByTestId("qa-verdict").getAttribute("data-state")).toBe("unmet");
    expect(screen.getByTestId("qa-verdict").textContent).toContain("QA: NOT MET — sent back to the worker 1 time");
    expect(screen.getByTestId("qa-unmet").textContent).toContain("why: 5 of the avatar checks failed — judged by opus");
    expect(screen.getByTestId("qa-sent-back").textContent).toContain("sent 1 task(s) back");
  });
  it("reads right in every state", () => {
    expect(qaLine(qa({ state: "judging", sent_back: 0 })).text).toBe("QA is judging…");
    expect(qaLine(qa({ state: "judging", sent_back: 1 })).text).toBe("QA is judging round 2…");
    expect(qaLine(qa({ state: "met", sent_back: 0 })).text).toBe("QA passed — no unmet claim blocks a pull request");
    expect(qaLine(qa({ state: "met", sent_back: 2 })).text).toBe("QA passed after 2 send-backs — no unmet claim blocks a pull request");
    expect(qaLine(qa({ state: "stopped" })).text).toContain("stopped by you");
  });
  it("says what the verdict means for a pull request (QA report BUG-011) - and never claims more than QA checked", () => {
    expect(qaLine(qa({ state: "met", sent_back: 0 })).text).toContain("pull request");
    expect(qaLine(qa({ state: "met", sent_back: 0 })).text).not.toMatch(/safe to merge|no bugs|bug-free/i);
    expect(qaLine(qa({ state: "unmet", sent_back: 0, unmet: [], unmet_n: 3 })).text).toBe("QA: NOT MET — 3 claims unmet — not ready for a pull request");
    expect(qaLine(qa({ state: "unmet", sent_back: 1 })).text).toContain("not ready for a pull request");
    expect(qaLine(qa({ state: "stopped" })).text).toContain("read it before you open a pull request");
    expect(qaLine(qa({ state: "judging", sent_back: 0 })).text).not.toContain("pull request");   // nothing to say until it has judged
  });
  it("renders nothing when the QA had nothing to say", () => {
    const a = render(<QaVerdict qa={{ ...qa({}), state: "none", timeline: [], unmet: [] }} />); expect(a.container.innerHTML).toBe("");
    const b = render(<QaVerdict qa={undefined} />); expect(b.container.innerHTML).toBe("");
  });
});

describe("the pieces around the verdict", () => {
  it("a QA that has not said anything draws no line, and a stopped one says the work was not verified", () => {
    expect(qaLine({ state: "none", pending: false, rounds: 0, sent_back: 0, met: 0, unmet_n: 0, unproven: 0, unmet: [], timeline: [] })).toEqual({ text: "", tone: "dim" });
    expect(qaLine({ state: "stopped", pending: false, rounds: 1, sent_back: 0, met: 0, unmet_n: 0, unproven: 0, unmet: [], timeline: [] }).text).toBe("QA stopped by you — the work stands as written, not verified; read it before you open a pull request");
  });
  it("a story that cannot be read is null - the thread shows no box rather than a broken one", async () => {
    const { apiGet } = await import("@/loki/api/client");
    (apiGet as any).mockRejectedValueOnce(new Error("offline"));
    expect(await fetchStory(272)).toBeNull();
    (apiGet as any).mockResolvedValueOnce({ result: { story: null } });
    expect(await fetchStory(272)).toBeNull();
  });
});
