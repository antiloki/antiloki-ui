// @vitest-environment jsdom
// THE ROUTER IN THE PANEL (2026-09-19): the route line, the tier of every sub-agent (editable in the plan),
// the one-job run that ends inline.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const ops: any[] = [];
vi.mock("./subagents", async (orig) => ({ ...(await orig<any>()), planGoalRun: vi.fn(async () => null), goalOp: vi.fn(async (...a: any[]) => { ops.push(a); return { ok: true }; }) }));
vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn(async () => null) }));
import { GoalRunPanel, routeLine } from "./goal-run-panel";
import type { GoalRun, GoalTask } from "./subagents";

const task = (over: Partial<GoalTask> = {}): GoalTask => ({ id: "t1", title: "one", prompt: "do", owns: ["a/**"], needs: [], acceptance: ["x"], tier: "low", status: "ready", wave: 0, attempts: 0, started: null, ended: null, report: null, verdict: null, error: null, trace: null, changed: [], ...over });
const run = (over: Partial<GoalRun> = {}): GoalRun => ({ id: 4, parent: "p", goal: "g", engine: "claude-code", cwd: "/w", write: false, concurrency: 3, status: "awaiting-approval", created: 0, started: null, ended: null, tasks: [task(), task({ id: "t2", title: "two", tier: "high", owns: ["b/**"] })], blackboard: [], events: [], report: null, delivered: false, error: null, route: { tier: "high", delegate: true, why: "two parts", bias: ["t1: low→mid (codex rejected first-attempt at low in 3 of the last 6 runs)"], verify_tier: "high", join_tier: "high" }, ...over });

describe("routeLine — pure", () => {
  it("says the tier, the sub-agents with their tiers, the review and join tiers, the why and the bias", () => {
    expect(routeLine(run())).toBe("router: tier high · 2 sub-agents (t1 low, t2 high) · verify ≥ high · join high — two parts · heimdall: t1: low→mid (codex rejected first-attempt at low in 3 of the last 6 runs)");
    expect(routeLine(run({ route: { tier: "low", delegate: false, why: "", bias: [], verify_tier: "mid", join_tier: "high" }, tasks: [] }))).toBe("router: tier low · no delegation — one job for this terminal · verify ≥ mid · join high");
    expect(routeLine(run({ route: null }))).toBeNull();
  });
});

describe("GoalRunPanel", () => {
  it("shows the route, lets the plan's tiers be edited, and sends them with the approval", async () => {
    render(<GoalRunPanel parentKey="p" engine="claude-code" worktree="/w" runs={[run()]} onRefresh={vi.fn()} onSay={vi.fn()} />);
    expect(screen.getByTestId("goal-route").textContent).toContain("2 sub-agents (t1 low, t2 high)");
    fireEvent.change(screen.getByTestId("goal-tier-t1"), { target: { value: "mid" } });
    expect((screen.getByTestId("goal-tier-t1") as HTMLSelectElement).value).toBe("mid");
    fireEvent.click(screen.getByTestId("goal-approve"));
    await waitFor(() => expect(ops.some((a) => a[0] === "approve")).toBe(true));
    const setPlan = ops.find((a) => a[0] === "setPlan");
    expect(setPlan?.[1]?.tasks?.map((t: any) => t.tier)).toEqual(["mid", "high"]);
  });
  it("an inline run says 'one job' and offers to do it in this terminal at the tier", () => {
    const onSay = vi.fn();
    render(<GoalRunPanel parentKey="p" engine="claude-code" worktree="/w" runs={[run({ status: "inline", tasks: [], route: { tier: "low", delegate: false, why: "one file", bias: [], verify_tier: "mid", join_tier: "high" } })]} onRefresh={vi.fn()} onSay={onSay} />);
    expect(screen.getByTestId("goal-inline").textContent).toContain("tier low — one file");
    fireEvent.click(screen.getByText("→ do it in this terminal"));
    expect(onSay.mock.calls[0][0]).toContain("one job, tier low");
  });
  it("a finished write run says what changed and where the PR is born (closing the agent), and shows the PR once it has one", async () => {
    const onRefresh = vi.fn();
    const done = run({ status: "done", write: true, ended: 1, started: 0, tasks: [task({ status: "done", changed: ["a/x.js"] }), task({ id: "t2", status: "done", changed: ["b/y.js"], owns: ["b/**"] })] });
    const { rerender } = render(<GoalRunPanel parentKey="p" engine="claude-code" worktree="/w" runs={[done]} onRefresh={onRefresh} onSay={vi.fn()} />);
    expect(screen.getByTestId("goal-pr").textContent).toContain("2 files changed in the box");
    // THE PR IS BORN ON CLOSE (2026-09-21): no button opens it from here
    expect(screen.queryByText("⎇ open PR")).toBeNull();
    expect(screen.getByTestId("goal-pr").textContent).toContain("opens when you close the agent");
    expect(ops.some((a) => a[0] === "pr")).toBe(false);
    rerender(<GoalRunPanel parentKey="p" engine="claude-code" worktree="/w" runs={[{ ...done, pr: 7 }]} onRefresh={onRefresh} onSay={vi.fn()} />);
    expect(screen.getByTestId("goal-pr").textContent).toContain("PR #7");
    // a read-only run has nothing to open
    rerender(<GoalRunPanel parentKey="p" engine="claude-code" worktree="/w" runs={[run({ status: "done", write: false, ended: 1, started: 0 })]} onRefresh={onRefresh} onSay={vi.fn()} />);
    expect(screen.queryByTestId("goal-pr")).toBeNull();
  });
  it("a settled run shows what the router saved, and says so when the router was off", () => {
    const sv = { tokens_in: 150000, tokens_out: 15000, actual_usd: 1.575, baseline_usd: 3.375, saved_usd: 1.8, saved_pct: 53.3, baseline: "claude-code · opus", tiers: ["t1:low", "t2:high"] };
    const { rerender } = render(<GoalRunPanel parentKey="p" engine="claude-code" worktree="/w" runs={[run({ status: "done", ended: 1, started: 0, savings: sv, router: true })]} onRefresh={vi.fn()} onSay={vi.fn()} />);
    expect(screen.getByTestId("goal-savings").textContent).toContain("the router saved $1.80 (53%) — $1.57 vs $3.38 at claude-code · opus, 165k tokens");
    rerender(<GoalRunPanel parentKey="p" engine="claude-code" worktree="/w" runs={[run({ status: "done", ended: 1, started: 0, savings: sv, router: false })]} onRefresh={vi.fn()} onSay={vi.fn()} />);
    expect(screen.getByTestId("goal-savings").textContent).toContain("router off — $1.57 at the pane's tier");
  });
  // WHERE SCREENING ACTUALLY LANDS (measured 2026-09-26, HumanEvalComm n=25 pairs): the planner asked in 0 of 50
  // calls, but named its reading as an assumption on 88% of underspecified asks against 48% of clear ones. So the
  // assumption is the screening output, and an assumption nobody can contradict is just a log line.
  it("an assumption can be contradicted — clicking one starts the correction in the agent's ask", () => {
    const onSay = vi.fn();
    render(<GoalRunPanel parentKey="p" engine="claude-code" worktree="/w"
      runs={[run({ status: "running", tasks: [], route: null, questions: [], assumptions: ["put it in serve/candidate.py"] })]}
      onRefresh={vi.fn()} onSay={onSay} />);
    fireEvent.click(screen.getByTestId("goal-assumption-0"));
    const said = onSay.mock.calls[0][0] as string;
    expect(said).toContain("put it in serve/candidate.py");
    expect(said).toContain("is wrong");            // it opens the correction, it does not merely quote it
    expect(said.endsWith("Instead: ")).toBe(true); // …and leaves the operator's sentence unfinished, for them
  });

  it("says nothing to correct when the planner named no assumption — never that it was 'sure enough to plan'", () => {
    // that older line implied asking was on the table; measured, the planner asks in under 6% of cases, so it
    // described every run and comforted nobody
    render(<GoalRunPanel parentKey="p" engine="claude-code" worktree="/w" section="screen"
      runs={[run({ status: "running", tasks: [], route: null, questions: [], assumptions: [] })]}
      onRefresh={vi.fn()} onSay={vi.fn()} />);
    const quiet = screen.getByTestId("goal-screen-quiet").textContent ?? "";
    expect(quiet).toContain("nothing to correct");
    expect(quiet).not.toContain("sure enough");
  });

  it("the screening gate: a blocking question waits with its options and default; the answer (or the defaults) goes to the answer op; assumptions are listed", async () => {
    ops.length = 0;
    const q = { id: "q1", text: "Which layer?", options: ["REST", "GraphQL"], default: "REST", certainty: "blocking" as const, answer: null };
    render(<GoalRunPanel parentKey="p" engine="claude-code" worktree="/w" runs={[run({ status: "awaiting-answers", tasks: [], route: null, questions: [q], assumptions: ["Keep the name? → yes"] })]} onRefresh={vi.fn()} onSay={vi.fn()} />);
    expect(screen.getByTestId("goal-screen").textContent).toContain("Which layer?");
    expect((screen.getByTestId("goal-answer-q1") as HTMLInputElement).placeholder).toBe("default: REST");
    expect(screen.getByTestId("goal-assumptions").textContent).toContain("assumed · Keep the name? → yes");
    expect(screen.queryByTestId("goal-approve")).toBeNull();
    fireEvent.click(screen.getByText("GraphQL"));
    fireEvent.click(screen.getByTestId("goal-answer"));
    await waitFor(() => expect(ops.some((a) => a[0] === "answer")).toBe(true));
    expect(ops.find((a) => a[0] === "answer")?.[1]).toEqual({ id: 4, answers: { q1: "GraphQL" } });
    ops.length = 0;
    fireEvent.click(screen.getByTestId("goal-answer-defaults"));
    await waitFor(() => expect(ops.find((a) => a[0] === "answer")?.[1]).toEqual({ id: 4, answers: {} }));
  });
  it("the rail's views (2026-09-20): screen shows only the questions/assumptions, plan only the plan — never the ask form", () => {
    const q = { id: "q1", text: "Which layer?", options: ["REST"], default: "REST", certainty: "blocking" as const, answer: null };
    const { unmount } = render(<GoalRunPanel parentKey="p" engine="claude-code" worktree="/w" runs={[run({ status: "awaiting-answers", tasks: [], questions: [q], assumptions: ["x → y"] })]} onRefresh={vi.fn()} onSay={vi.fn()} paneId={4} section="screen" />);
    expect(screen.getByTestId("goal-screen")).toBeTruthy(); expect(screen.getByTestId("goal-assumptions")).toBeTruthy();
    expect(screen.queryByTestId("goal-plan")).toBeNull(); expect(screen.queryByTestId("goal-route")).toBeNull();
    unmount();
    render(<GoalRunPanel parentKey="p" engine="claude-code" worktree="/w" runs={[run()]} onRefresh={vi.fn()} onSay={vi.fn()} paneId={4} section="plan" />);
    expect(screen.getByTestId("goal-approve")).toBeTruthy(); expect(screen.getByTestId("goal-route")).toBeTruthy();
    expect(screen.queryByTestId("goal-plan")).toBeNull(); expect(screen.queryByTestId("goal-assumptions")).toBeNull();
  });
  it("the board shows each sub-agent's tier", () => {
    render(<GoalRunPanel parentKey="p" engine="claude-code" worktree="/w" runs={[run({ status: "running", tasks: [task({ status: "running", started: Date.now() }), task({ id: "t2", tier: "high", status: "done", ended: 1, started: 0 })] })]} onRefresh={vi.fn()} onSay={vi.fn()} />);
    expect(screen.getByTestId("goal-board-tier-t1").textContent).toBe("low"); expect(screen.getByTestId("goal-board-tier-t2").textContent).toBe("high");
  });
});
