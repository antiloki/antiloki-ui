// @vitest-environment jsdom
// THE RAIL'S THREE VIEWS (2026-09-20): each answers one question and nothing else.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const ops: any[] = [];
vi.mock("./subagents", async (orig) => ({ ...(await orig<any>()), goalOp: vi.fn(async (...a: any[]) => { ops.push(a); return { ok: true }; }) }));
vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn(async () => null), apiGet: vi.fn(async () => null) }));
import { RouteView, ScreenView, PlanView, verdictLine, verdictState, plainVerdict, plainSaving } from "./heimdall-rail";
import type { GoalRun, GoalTask } from "./subagents";

const task = (over: Partial<GoalTask> = {}): GoalTask => ({ id: "t1", title: "survey", prompt: "do", owns: ["a/**"], needs: [], acceptance: ["x"], tier: "low", status: "ready", wave: 0, attempts: 0, started: null, ended: null, report: null, verdict: null, error: null, ...over } as GoalTask);
const run = (over: Partial<GoalRun> = {}): GoalRun => ({ id: 4, parent: "p", goal: "make the heap faster", engine: "claude-code", cwd: "/w", write: true, concurrency: 3, status: "awaiting-approval", created: 10, started: null, ended: null, tasks: [task(), task({ id: "t2", title: "fix", tier: "high", wave: 1 })], blackboard: [], events: [], report: null, delivered: false, error: null, route: { tier: "mid", delegate: true, why: "two parts", bias: [], verify_tier: "mid", join_tier: "high", confidence: "medium" }, ...over } as GoalRun);

describe("verdictLine — pure", () => {
  // tier low delivers HAIKU since 2026-09-28 — the front end mapped it to sonnet, so a low route bought nothing
  it("says one job with the model, or the sub-agents and waves", () => {
    expect(verdictLine(run({ status: "inline", tasks: [], route: { tier: "low", delegate: false, why: "", bias: [], verify_tier: "mid", join_tier: "high" } }), "claude-code")).toBe("one job — this terminal · tier low · haiku");
    expect(verdictLine(run(), "claude-code")).toBe("2 sub-agents in 2 waves · tier mid");
    expect(verdictLine(run({ status: "awaiting-answers", questions: [{ id: "q1", text: "?", options: [], default: "", certainty: "blocking", answer: null }] }), "codex")).toBe("asking 1 question first");
    expect(verdictState(run({ status: "inline", delivered: true })).text).toBe("typed into the terminal");
  });
});
describe("RouteView — minimal", () => {
  it("one card per ask: the goal, a plain verdict, how sure, the saving; the log is folded", () => {
    const events = [{ t: 1, kind: "route", text: "tier mid · no delegation" }, { t: 3, kind: "report", text: "1503 chars" }];
    render(<RouteView runs={[run({ events }), run({ id: 3, created: 1, status: "inline", tasks: [], goal: "older", delivered: true, route: { tier: "low", delegate: false, why: "", bias: [], verify_tier: "mid", join_tier: "high", confidence: "high" } })]} engine="claude-code" busy={null} onOpenAsk={vi.fn()} />);
    const a = screen.getByTestId("route-run-4"); const b = screen.getByTestId("route-run-3");
    expect(a.textContent).toContain("Split into 2 sub-agents"); expect(a.textContent).toContain("waiting for your ✓ in ⋔"); expect(a.textContent).toContain("medium sure"); expect(a.textContent).toContain("two parts");
    expect(b.textContent).toContain("Do it here · sonnet"); expect(b.textContent).toContain("sent to the agent"); expect(b.textContent).toContain("~5× cheaper than opus"); expect(b.textContent).toContain("high sure");
    expect(screen.queryByTestId("route-log")).toBeNull();
    fireEvent.click(screen.getAllByText("▸ details")[0]);
    expect(screen.getByTestId("route-log").textContent).toContain("tier mid · no delegation");
    expect(screen.getByTestId("route-log").textContent).not.toContain("1503 chars");
  });
  it("shows an event's id as a dim suffix only when the event has one", () => {
    const events = [{ t: 1, kind: "route", text: "old event" }, { t: 2, kind: "error", text: "gate refused", id: "W1a2b-003" }];
    render(<RouteView runs={[run({ events })]} engine="claude-code" busy={null} onOpenAsk={vi.fn()} />);
    fireEvent.click(screen.getAllByText("▸ details")[0]);
    const ids = screen.getAllByTestId("event-id");
    expect(ids).toHaveLength(1);
    expect(ids[0].textContent).toBe("W1a2b-003");
    expect(ids[0].getAttribute("title")).toContain("quote this");
  });
  it("plainVerdict speaks every state in plain words", () => {
    expect(plainVerdict(run({ status: "awaiting-answers", questions: [{ id: "q1", text: "?", options: [], default: "", certainty: "blocking", answer: null }] }), "claude-code").headline).toBe("Needs 1 answer first");
    expect(plainVerdict(run({ status: "running", tasks: [task({ status: "done" }), task({ id: "t2" })] }), "claude-code")).toMatchObject({ headline: "Split into 2 sub-agents", sub: "1/2 done · see ⋔" });
    expect(plainVerdict(run({ status: "failed", error: "timed out", route: undefined, tasks: [] } as any), "claude-code")).toMatchObject({ headline: "Couldn't decide", sub: "timed out" });
    // a run that HAD a route and a plan and then died in the work is not "couldn't decide" - it names the failure (2026-09-30: a Gemini worker hit its quota)
    const v = plainVerdict(run({ status: "failed", error: null, tasks: [{ id: "t1", status: "failed", error: "Individual quota reached. Resets in 38m" }], events: [{ kind: "fail", text: "Individual quota reached. Resets in 38m21s." }] } as any), "claude-code");
    expect(v.headline).toBe("Decided, then the run failed · 0/1 done"); expect(v.sub).toContain("Individual quota reached");
    expect(plainVerdict(run({ status: "inline", tasks: [], route: { tier: "high", delegate: false, why: "", bias: [], verify_tier: "high", join_tier: "high" } }), "claude-code").headline).toBe("Do it here · opus");
    expect(plainSaving(run({ status: "inline", tasks: [], route: { tier: "high", delegate: false, why: "", bias: [], verify_tier: "high", join_tier: "high" } }))).toBeNull();
  });
});
describe("ScreenView", () => {
  it("shows only the questions while asking; the answers (or defaults) go to the answer op", async () => {
    ops.length = 0;
    const q = { id: "q1", text: "Which layer?", options: ["REST", "GraphQL"], default: "REST", certainty: "blocking" as const, answer: null };
    render(<ScreenView runs={[run({ status: "awaiting-answers", tasks: [], questions: [q] })]} onRefresh={vi.fn()} />);
    expect(screen.getByTestId("screen-asking").textContent).toContain("Which layer?");
    expect(screen.queryByTestId("plan-run")).toBeNull();
    fireEvent.click(screen.getByText("GraphQL")); fireEvent.click(screen.getByTestId("screen-answer"));
    await waitFor(() => expect(ops.find((a) => a[0] === "answer")?.[1]).toEqual({ id: 4, answers: { q1: "GraphQL" } }));
  });
  it("otherwise says there are no open questions and lists what was assumed", () => {
    render(<ScreenView runs={[run({ assumptions: ["the scheduler package"] })]} onRefresh={vi.fn()} />);
    expect(screen.getByText(/none — heimdall was sure enough/)).toBeTruthy();
    expect(screen.getByTestId("screen-assumed").textContent).toContain("the scheduler package");
  });
});
describe("PlanView", () => {
  it("shows the tasks by wave with approve, and nothing about routing or questions", async () => {
    ops.length = 0;
    render(<PlanView runs={[run()]} onRefresh={vi.fn()} />);
    expect(screen.getByTestId("plan-run").textContent).toContain("2 tasks · 2 waves");
    expect(screen.getByTestId("plan-task-t2").textContent).toContain("fix");
    expect(screen.queryByText(/confidence/)).toBeNull();
    fireEvent.click(screen.getByTestId("plan-approve"));
    await waitFor(() => expect(ops.some((a) => a[0] === "approve")).toBe(true));
  });
  it("lists the earlier plans under the current one, and opens one on click", () => {
    render(<PlanView runs={[run(), run({ id: 2, created: 1, status: "done", goal: "older plan", tasks: [task({ status: "done" })] }), run({ id: 1, created: 0, status: "inline", tasks: [] })]} onRefresh={vi.fn()} />);
    expect(screen.getByTestId("plan-run").textContent).toContain("current plan · #4");
    expect(screen.getByTestId("plan-earlier-2").textContent).toContain("1 tasks · done · 1/1 passed — older plan");
    expect(screen.queryByTestId("plan-earlier-1")).toBeNull(); // a one-job route is not a plan
    fireEvent.click(screen.getByTestId("plan-earlier-2"));
    expect(screen.getByTestId("plan-run").textContent).toContain("plan · #2");
  });
});

describe("✓ QA (2026-09-21): the isolated judge's verdicts", () => {
  it("says the state of each judged run and lists the findings by task; off, it says how to turn it on", async () => {
    const { QaView } = await import("./heimdall-rail");
    const { qaLine } = await import("./subagents");
    const base: any = { parent: "p", goal: "ship the cart", engine: "claude-code", cwd: ".", write: true, concurrency: 1, created: 1, started: 1, ended: 2, blackboard: [], events: [], report: "r", delivered: true, error: null, tasks: [{ id: "t1", title: "a", prompt: "", owns: [], needs: [], acceptance: [], status: "done", wave: 0, attempts: 1 }] };
    const judged: any = { ...base, id: 1, status: "done", qa_review_wanted: true, qa_review: { passed: false, score: 60, summary: "t2 drifted.", findings: [{ task: "t2", kind: "drift", text: "b/x.ts edited" }, { task: null, kind: "ok", text: "t1 met" }], by: "engine", t: 2 } };
    const judging: any = { ...base, id: 2, created: 3, status: "done", qa_review_wanted: true, qa_review: null };
    const waiting: any = { ...base, id: 3, created: 4, status: "running", qa_review_wanted: true, qa_review: null };
    const off: any = { ...base, id: 4, created: 5, status: "done" };
    expect(qaLine(judged)).toBe("FAILED · score 60 · 2 findings"); expect(qaLine(judging)).toBe("judging…"); expect(qaLine(waiting)).toBe("QA waits for the join"); expect(qaLine(off)).toBe("");
    expect(qaLine({ status: "done", qa_review_wanted: true, qa_review: { passed: true, score: 100, summary: "", findings: [], by: "e", t: 1, error: "boom" } })).toBe("judge error — ");
    const { getByTestId, queryByTestId, getByText } = render(<QaView runs={[judged, judging, waiting, off]} on={true} />);
    expect(getByTestId("qa-verdict-1").textContent).toBe("FAILED · score 60 · 2 findings"); expect(getByTestId("qa-verdict-2").textContent).toBe("judging…");
    expect(getByText("b/x.ts edited")).toBeTruthy(); expect(getByText("t2 drifted.")).toBeTruthy(); expect(queryByTestId("qa-run-4")).toBeNull();
    const offView = render(<QaView runs={[]} on={false} />);
    expect(offView.container.textContent).toContain("QA is off");
  });
});

describe("the screening answer is a choice, not a composition (operator 2026-09-28)", () => {
  it("shows a chip per option plus 'write it yourself', and no input until that chip is clicked", async () => {
    const q = { id: "d1", text: "“add a new product” — anything particular in mind?", certainty: "blocking" as const,
                options: ["antiloki decides the details", "keep it minimal"], default: "antiloki decides the details", answer: null };
    render(<ScreenView runs={[run({ status: "awaiting-answers", tasks: [], questions: [q] })]} onRefresh={vi.fn()} />);
    expect(document.querySelectorAll('[data-chip="d1"]')).toHaveLength(2);
    expect(screen.queryByTestId("screen-answer-d1")).toBeNull();
    fireEvent.click(screen.getByTestId("screen-write-d1"));
    expect(screen.getByTestId("screen-answer-d1")).toBeTruthy();
  });
  it("never asks about the code", () => {
    const q = { id: "d1", text: "“add a new product” — anything particular in mind, or shall antiloki decide the details?",
                certainty: "blocking" as const, options: ["antiloki decides the details"], default: "antiloki decides the details", answer: null };
    render(<ScreenView runs={[run({ status: "awaiting-answers", tasks: [], questions: [q] })]} onRefresh={vi.fn()} />);
    const asked = screen.getByTestId("screen-asking").textContent ?? "";
    for (const banned of ["which files", "how will we know"]) expect(asked.toLowerCase()).not.toContain(banned);
  });
});
