// RECORDED STREAMS (PLAN-THE-TESTS phase 4, 2026-10-01): the chat's reducer fed with what the REAL serve wrote, not with events a test author imagined. The four fixtures in ./fixtures are the
// pane's event log (`GET cockpit/agent/events`, the same lines the SharedWorker replays) captured from the serve's scripted-seat journeys - a plain reply, a failed turn, a delegated run that
// passed, a delegated run that ends asking the operator for a direction - plus, for the last two, the goal run itself as `GET cockpit/goals` gave it. If the serve changes the shape of a line
// the thread depends on (the user echo, the result, the run marker), these fail here instead of in the operator's browser.
import { describe, it, expect } from "vitest";
import { applyEvent, groupExchanges, type Turn } from "./agent-chat-pane";
import { liveRunOf, liveWords, resultHomes, resultProse, answerNote } from "./agent-live";
import reply from "./fixtures/events-reply.json";
import failed from "./fixtures/events-failed.json";
import ranEvents from "./fixtures/events-run.json";
import runs from "./fixtures/runs-run.json";
import directionEvents from "./fixtures/events-direction.json";
import directionRuns from "./fixtures/runs-direction.json";

const fold = (events: any[]): Turn[] => events.reduce((turns: Turn[], e: any) => applyEvent(turns, e.seq, e), [] as Turn[]);
const kinds = (t: Turn[]) => t.map((x) => x.kind);

describe("a plain reply, as the serve logged it", () => {
  const turns = fold(reply as any[]);
  it("puts the operator's words first, then the answer, then the result - in the order of the log, never the answer above its question", () => {
    const iUser = turns.findIndex((t) => t.kind === "user"), iReply = turns.findIndex((t) => t.kind === "assistant"), iResult = turns.findIndex((t) => t.kind === "result");
    expect(iUser).toBeGreaterThanOrEqual(0);
    expect(iUser).toBeLessThan(iReply); expect(iReply).toBeLessThan(iResult);
    expect((turns[iUser] as any).text).toBe("hello fixture");
    expect((turns[iReply] as any).text).toMatch(/^ack: .*hello fixture$/s);
    const seqs = turns.map((t) => t.seq).filter((s) => s > 0);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });
  it("is one exchange: the ask, one reply, a clean result and the story of the run behind it", () => {
    const ex = groupExchanges(turns).filter((e) => e.user);              // (the log opens with the session's own bookkeeping, which groups into an exchange with no ask)
    expect(ex).toHaveLength(1);
    expect(ex[0].user?.text).toBe("hello fixture");
    expect(ex[0].replies).toHaveLength(1);
    expect(ex[0].result && !ex[0].result.error).toBe(true);
    expect(ex[0].stories).toEqual([1]);                                   // the `savings` marker names run #1, so the thread fetches its story
  });
  it("says what the turn cost and what it saved, under the answer, in the operator's words", () => {
    const text = turns.filter((t) => t.kind === "note").map((t: any) => t.text).join("\n");
    expect(text).toContain("✦ fake-sonnet · 10 ms · 120 tokens · $0.0006");
    expect(text).toMatch(/≈ saved \$0\.0004 \(40%\) vs claude · opus/);
  });
  it("keeps the session bookkeeping out of the conversation (it is on the wire channel)", () => {
    const wire = turns.filter((t: any) => t.kind === "note" && t.chan === "wire").map((t: any) => t.text);
    expect(wire.some((w) => w.startsWith("session started"))).toBe(true);
    expect(wire.some((w) => w.startsWith("role · Backender"))).toBe(true);   // nothing the serve says is thrown away: an event nobody wrote a line for prints as itself
    expect(wire.some((w) => w.includes("nothing changed in the box this turn") || w.includes("gates"))).toBe(true);
  });
  it("replaying the log from the start gives the same thread (what a reload or a joining tab does)", () => {
    expect(fold(reply as any[])).toEqual(turns);
    expect(kinds(fold([...(reply as any[])]))).toEqual(kinds(turns));
  });
});

describe("a failed turn", () => {
  const turns = fold(failed as any[]);
  it("carries the seat's own reason on the result, and no answer is invented", () => {
    const ex = groupExchanges(turns).filter((e) => e.user);
    expect(ex).toHaveLength(1);
    expect(ex[0].user?.text).toBe("FAKE:error please fail");
    expect(ex[0].replies).toHaveLength(0);
    expect(ex[0].result?.error).toBe("the fake seat failed on purpose");
  });
  it("still tells the operator what the retriever looked up for it", () => {
    const wire = turns.filter((t: any) => t.kind === "note").map((t: any) => t.text).join("\n");
    expect(wire).toContain("looked up:");
  });
});

describe("a delegated run that passed", () => {
  const turns = fold(ranEvents as any[]);
  const storyRun = (turns[1] as any).run as number;
  const run = (runs as any[]).find((r) => r.id === storyRun)!;
  it("the pane's log holds the ask and a marker naming the run - the story itself is the run's", () => {
    expect(kinds(turns)).toEqual(["user", "story"]);
    expect(run, "the marker names a run the serve has").toBeTruthy();
    expect(String(run.goal)).toContain("fx-run");
  });
  it("the run, as the serve stored it, is done, QA is over, and its report is what the thread prints", () => {
    expect(run.status).toBe("done");
    expect(run.qa_pending).toBe(false);
    expect(run.tasks.every((t: any) => t.status === "done")).toBe(true);
    expect(resultProse(String(run.report ?? "")).text).toContain("created out/n.txt");
  });
  it("a finished run is no longer 'live', and its result is homed under the exchange that asked", () => {
    expect(liveRunOf(runs as any[])).toBeNull();
    const ex = groupExchanges(turns);
    const homes = resultHomes(ex.map((e) => ({ user: e.user, stories: e.stories })), (runs as any[]).map((r) => ({ id: r.id, ended: r.ended })));
    expect([...homes.entries()]).toEqual([[0, [run.id]]]);
  });
});

describe("a delegated run that ends asking for a direction", () => {
  const run = (directionRuns as any[]).find((r) => String(r.goal).includes("fx-direction"))!;
  it("is waiting for an answer, which is not 'working': the live line stops and the card asks", () => {
    expect(String(run.status).replace(/[-_]/g, "").toLowerCase()).toBe("awaitinganswers");
    expect(liveRunOf(directionRuns as any[])).toBeNull();
    expect(liveWords(null).sub).toBeNull();
    expect(run.qa_rounds).toBeGreaterThanOrEqual(2);                       // the direction card only exists after QA sent the work back twice
  });
  it("carries the question QA asks and the four ways out, which the card turns into its chips", () => {
    const q = run.questions[0];
    expect(q.text).toMatch(/^QA sent this run back 2 time\(s\) and it is still not right\. Still unmet:/);
    expect(q.options).toEqual(["keep trying with the same feedback", "accept it as it is", "undo everything this run changed", "cancel the run"]);
    expect(q.options).toContain(q.default);
    expect(answerNote(q.text, q.options[1], false)).toBe(`↳ you answered “${q.text.slice(0, 120)}” — accept it as it is`);
    expect(answerNote(q.text, q.default, true)).toContain("(the default)");
  });
  it("the pane's log is the same two lines as for any run: the ask and the marker", () => {
    expect(kinds(fold(directionEvents as any[]))).toEqual(["user", "story"]);
  });
});
