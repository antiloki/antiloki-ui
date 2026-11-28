import { describe, it, expect } from "vitest";
import { reduce, idle, canSend, finalText, openQuestions, needsCard, parseVerdict, BUDGET_MS, type State, type Verdict } from "./precheck";

const ask: Verdict = { verdict: "ask", notes: [], questions: [
  { id: "q1", text: "keep the no-dialog message on desktop?", options: ["Yes, keep it", "No, remove it"] },
  { id: "q2", text: "which folder?", options: ["src/loki", "src/routes"] }] };
const run = (...as: Parameters<typeof reduce>[1][]) => as.reduce<State>((s, a) => reduce(s, a), idle());

describe("the happy paths", () => {
  it("a clear prompt goes idle → checking → ready(send) → sending → idle", () => {
    let s = run({ type: "submit", text: "  fix the picker  ", now: 0 });
    expect(s).toEqual({ phase: "checking", text: "fix the picker", startedAt: 0 });
    s = reduce(s, { type: "result", verdict: { verdict: "send", notes: [] } });
    expect(s.phase).toBe("ready"); expect(canSend(s)).toBe(true); expect(needsCard(s)).toBe(false);
    s = reduce(s, { type: "sendNow" }); expect(s).toEqual({ phase: "sending", text: "fix the picker", final: "fix the picker" });
    expect(reduce(s, { type: "sent" })).toEqual(idle());
  });
  it("empty text is not submitted, and a second submit while checking is ignored", () => {
    expect(run({ type: "submit", text: "   ", now: 0 })).toEqual(idle());
    const s = run({ type: "submit", text: "a", now: 0 }); expect(reduce(s, { type: "submit", text: "b", now: 1 })).toBe(s);
  });
});

describe("questions", () => {
  const ready = () => run({ type: "submit", text: "fix the picker", now: 0 }, { type: "result", verdict: ask });
  it("cannot send until every question is answered or deferred", () => {
    let s = ready(); expect(needsCard(s)).toBe(true); expect(canSend(s)).toBe(false); expect(openQuestions(s)).toHaveLength(2);
    s = reduce(s, { type: "answer", id: "q1", option: "No, remove it" }); expect(canSend(s)).toBe(false); expect(openQuestions(s)).toHaveLength(1);
    s = reduce(s, { type: "defer", id: "q2" }); expect(canSend(s)).toBe(true);
  });
  it("sendNow is refused while a question is open", () => {
    const s = ready(); expect(reduce(s, { type: "sendNow" })).toBe(s);
  });
  it("answers are appended to the text as visible lines; a deferred question adds nothing", () => {
    let s = ready();
    s = reduce(s, { type: "answer", id: "q1", option: "Yes, keep it" }); s = reduce(s, { type: "defer", id: "q2" });
    expect(finalText(s)).toBe("fix the picker\n\n(decided: keep the no-dialog message on desktop? → Yes, keep it)");
    const sent = reduce(s, { type: "sendNow" }); expect(sent.phase === "sending" && sent.final).toContain("Yes, keep it");
  });
  it("an answer must be one of the options, for a question that exists; changing an answer replaces it", () => {
    let s = ready();
    expect(reduce(s, { type: "answer", id: "q1", option: "something else" })).toBe(s); expect(reduce(s, { type: "answer", id: "nope", option: "x" })).toBe(s);
    s = reduce(s, { type: "answer", id: "q1", option: "Yes, keep it" }); s = reduce(s, { type: "answer", id: "q1", option: "No, remove it" });
    expect((s as any).answers).toEqual({ q1: "No, remove it" });
  });
  it("answering a deferred question un-defers it, and deferring an answered one drops the answer", () => {
    let s = ready(); s = reduce(s, { type: "defer", id: "q1" }); s = reduce(s, { type: "answer", id: "q1", option: "Yes, keep it" });
    expect((s as any).deferred).toEqual([]); s = reduce(s, { type: "defer", id: "q1" }); expect((s as any).answers).toEqual({});
  });
});

describe("it fails open", () => {
  it("a check that takes longer than the budget becomes a skipped verdict, and Send works", () => {
    let s = run({ type: "submit", text: "do the thing", now: 1000 });
    expect(reduce(s, { type: "tick", now: 1000 + BUDGET_MS - 1 })).toBe(s);
    s = reduce(s, { type: "tick", now: 1000 + BUDGET_MS });
    expect(s.phase).toBe("ready"); expect((s as any).verdict.verdict).toBe("skipped"); expect((s as any).verdict.reason).toMatch(/longer than 2 s/);
    expect(needsCard(s)).toBe(true); expect(canSend(s)).toBe(true);
  });
  it("an error becomes a skipped verdict with its reason", () => {
    const s = run({ type: "submit", text: "x y", now: 0 }, { type: "fail", reason: "the serve did not answer" });
    expect((s as any).verdict).toEqual({ verdict: "skipped", notes: [], reason: "the serve did not answer" }); expect(canSend(s)).toBe(true);
  });
  it("a late result after the budget fired is ignored", () => {
    let s = run({ type: "submit", text: "x y", now: 0 }, { type: "tick", now: 5000 });
    const before = s; s = reduce(s, { type: "result", verdict: { verdict: "send", notes: [] } }); expect(s).toBe(before);
  });
});

describe("dismiss", () => {
  it("clears the card and keeps nothing, from checking or ready", () => {
    expect(run({ type: "submit", text: "a b", now: 0 }, { type: "dismiss" })).toEqual(idle());
    expect(run({ type: "submit", text: "a b", now: 0 }, { type: "result", verdict: ask }, { type: "dismiss" })).toEqual(idle());
  });
  it("cannot dismiss a send in flight", () => {
    const s = run({ type: "submit", text: "a b", now: 0 }, { type: "result", verdict: { verdict: "send", notes: [] } }, { type: "sendNow" });
    expect(reduce(s, { type: "dismiss" })).toBe(s);
  });
});

describe("the serve's reply is never trusted", () => {
  it("accepts the four verdicts", () => {
    expect(parseVerdict({ verdict: "send", notes: ["ok"] })).toEqual({ verdict: "send", notes: ["ok"] });
    expect(parseVerdict({ verdict: "route", route: { pane: "p2", engine: "codex" } })).toMatchObject({ verdict: "route", route: { pane: "p2", engine: "codex" } });
    expect(parseVerdict({ verdict: "skipped", reason: "model offline" })).toMatchObject({ verdict: "skipped", reason: "model offline" });
    expect(parseVerdict({ verdict: "ask", questions: [{ id: "a", text: "which?", options: ["x", "y"] }] })).toMatchObject({ verdict: "ask" });
  });
  it("an ask with no usable question is a send; garbage is skipped with a reason", () => {
    expect(parseVerdict({ verdict: "ask", questions: [{ text: "", options: [] }, { text: "no options", options: [] }] }).verdict).toBe("send");
    for (const bad of [null, 3, "x", {}, { verdict: "explode" }]) expect(parseVerdict(bad).verdict).toBe("skipped");
  });
  it("caps questions at four and notes at six, and gives questions ids", () => {
    const v = parseVerdict({ verdict: "ask", notes: Array(20).fill("n"), questions: Array.from({ length: 9 }, (_, i) => ({ text: `q${i}`, options: ["a"] })) }) as any;
    expect(v.questions).toHaveLength(4); expect(v.notes).toHaveLength(6); expect(v.questions[0].id).toBe("q0");
  });
});
