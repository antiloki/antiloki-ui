import { describe, it, expect } from "vitest";
import { savedLine } from "./agent-chat-pane";
import { elapsedLabel, liveRunOf, liveWords, answerNote, resultProse, resultHomes, firstSentence, threadIdle } from "./agent-live";

const run = (over: any = {}): any => ({ id: 7, status: "running", created: 1000, started: 2000, tasks: [], events: [], ...over });

describe("agent-live", () => {
  it("elapsedLabel reads seconds, then minutes", () => {
    expect(elapsedLabel(12_400)).toBe("12s");
    expect(elapsedLabel(64_000)).toBe("1m 04s");
    expect(elapsedLabel(-5)).toBe("0s");
  });
  it("liveRunOf picks the newest moving run and ignores settled ones", () => {
    expect(liveRunOf([run({ id: 1, status: "done" }), run({ id: 2, status: "failed" })])).toBeNull();
    expect(liveRunOf([run({ id: 1, created: 10 }), run({ id: 2, created: 20, status: "planning" }), run({ id: 3, created: 30, status: "awaiting-answers" })])?.id).toBe(2);
  });
  it("liveWords names the stage, the seat and the running task", () => {
    expect(liveWords(null).sub).toBeNull();
    const w = liveWords(run({ tasks: [{ id: "t1", title: "add a button", status: "running" }], pair: { name: "x", brain: "claude-code", hands: "cursor", hands_model: "composer-2.5" }, events: [{ t: 1, kind: "start", text: "wave 1 · attempt 1" }] }));
    expect(w.sub).toContain("cursor · composer-2.5");
    expect(w.sub).toContain("writing “add a button”");
    expect(w.sub).toContain("0/1 done");
    expect(w.last).toBe("wave 1 · attempt 1");
    expect(liveWords(run({ status: "planning" })).verbs).toContain("Planning");
    expect(liveWords(run({ status: "joining", tasks: [{ id: "t1", title: "x", status: "done" }] })).sub).toBe("1/1 tasks done");
  });
  it("answerNote keeps the question and the answer, and says when it was the default", () => {
    expect(answerNote("add a button — anything particular?", "antiloki decides", true)).toBe("↳ you answered “add a button — anything particular?” — antiloki decides (the default)");
    expect(answerNote("q", "blue", false)).toBe("↳ you answered “q” — blue");
  });
  it("resultProse keeps the prose and drops the pasted diff", () => {
    const r = "1. Added a Log in button to the nav bar.\n2. Styled it with the pill outline. ⏎ ```diff\n--- a/x\n+++ b/x\n```";
    const out = resultProse(r);
    expect(out.cut).toBe(true);
    expect(out.text).toBe("1. Added a Log in button to the nav bar.\n2. Styled it with the pill outline.");
    expect(resultProse("```diff\n+x\n```")).toEqual({ text: "```diff\n+x\n```", cut: false });
    expect(resultProse("plain report, no diff at all")).toEqual({ text: "plain report, no diff at all", cut: false });
  });
  it("savedLine is arithmetic and never claims a saving against itself", () => {
    expect(savedLine(0.005, 0.036, "claude · opus")).toBe("≈ saved $0.031 (86%) vs claude · opus — $0.0050 instead of $0.036 for the same tokens");
    expect(savedLine(0.036, 0.036, "claude · opus")).toContain("nothing saved");
    expect(savedLine(0.04, 0.036, "codex · gpt-5")).toContain("nothing saved");
  });

  // operator 2026-10-08: "the report should be 1 line with an expand button"
  it("firstSentence is the report's first sentence, markdown marks off, ellipsized", () => {
    expect(firstSentence("Added the Log in button to the nav. It sits left of the avatar.")).toBe("Added the Log in button to the nav.");
    expect(firstSentence("## Summary\n\n**Added** the `Log in` button\nand more")).toBe("Summary");
    expect(firstSentence("1. Added a Log in button to the nav bar.\n2. Styled it.")).toBe("Added a Log in button to the nav bar.");
    expect(firstSentence("```diff\n+x\n```\nthe real first line")).toBe("the real first line");
    const long = firstSentence(`${"word ".repeat(60)}end`, 40);
    expect(long.length).toBe(40); expect(long.endsWith("…")).toBe(true);
    expect(firstSentence("")).toBe("");
  });

  // operator 2026-10-08: the details under an answer are open by default only at the END of everything
  it("threadIdle is true only when nothing in the thread is moving - agent, send, a run, or a run's QA", () => {
    const idle = { busy: false, sending: false, routes: [run({ id: 1, status: "done" }), run({ id: 2, status: "failed" }), run({ id: 3, status: "inline" }), run({ id: 4, status: "cancelled" })] };
    expect(threadIdle(idle)).toBe(true);
    expect(threadIdle({ ...idle, routes: [] })).toBe(true);
    expect(threadIdle({ ...idle, busy: true })).toBe(false);
    expect(threadIdle({ ...idle, sending: true })).toBe(false);
    for (const status of ["planning", "running", "joining", "awaiting-approval", "awaiting-answers", "paused"]) expect(threadIdle({ ...idle, routes: [run({ status })] })).toBe(false);
    // the run is done but QA is still judging it, or has sent it back to be fixed
    expect(threadIdle({ ...idle, routes: [run({ id: 5, status: "done", qa_pending: true })] })).toBe(false);
  });

  // operator 2026-09-29: the report of run #258 was drawn ABOVE the answer that produced it. A run's result belongs after the last thing the
  // operator said before it landed.
  it("draws a result after the answer that came before it landed, and at home when nothing came between", () => {
    const ex = [{ user: { t: 1000 }, stories: [258] }, { user: { t: 5000 }, stories: [] }, { user: { t: 9000 }, stories: [] }];
    // the run asked at t=1000 ended at t=6000: after the answer at 5000, before the message at 9000
    expect([...resultHomes(ex, [{ id: 258, ended: 6000 }]).entries()]).toEqual([[1, [258]]]);
    // it ended before anything else was said: it stays in the exchange that started it
    expect([...resultHomes(ex, [{ id: 258, ended: 4000 }]).entries()]).toEqual([[0, [258]]]);
    // not ended yet, or unknown: home
    expect([...resultHomes(ex, [{ id: 258, ended: null }]).entries()]).toEqual([[0, [258]]]);
    expect([...resultHomes(ex, []).entries()]).toEqual([[0, [258]]]);
    // two runs, two homes
    const two = [{ user: { t: 1000 }, stories: [1] }, { user: { t: 3000 }, stories: [2] }];
    expect(resultHomes(two, [{ id: 1, ended: 3500 }, { id: 2, ended: 4000 }]).get(1)).toEqual([1, 2]);
  });
});
