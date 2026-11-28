// @vitest-environment jsdom
// THE CHAT OF A GOAL RUN, AS ONE ORGANISED FLOW (operator 2026-10-08): Heimdall's prompt is a task view and not a second "you"; the details under every
// answer are one dim line (hover previews, click pins) and open by default only on the last block of an idle thread, where the line is the total; the QA
// is not in the chat. The pane is mounted for real and fed the serve's events, in both skins.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, cleanup, within } from "@testing-library/react";

const h = vi.hoisted(() => ({ status: { running: true, busy: false } as any, feed: null as any }));
vi.mock("@/loki/api/client", () => ({
  apiGet: vi.fn(async (url: string) => (String(url).includes("/agent/status") ? { result: h.status } : {})),
  apiPost: vi.fn(async () => ({})), BE_URL: "http://be.test", isNotWired: () => false,
}));
vi.mock("./pty-streams", () => ({ subscribeAgent: (_id: number, _after: number, handlers: any) => { h.feed = handlers; return () => {}; } }));
vi.mock("@/loki/api/engine", async (importOriginal) => ({ ...(await importOriginal<any>()), askEngine: vi.fn(async () => ({})) }));
vi.mock("@/loki/api/dispatch", () => ({ uploadFile: vi.fn(async () => ({})) }));
vi.mock("@/loki/desktop/shell", () => ({ isDesktop: () => false, pickFile: vi.fn() }));
vi.mock("@/loki/shell/mini-tour", () => ({ useTourUnlock: () => () => {} }));
import { AgentChatPane, groupExchanges, applyEvent, looksLikeTask, routeForText, taskLines } from "./agent-chat-pane";

const TASK = "Goal: fix the nav bar so the Log in button sits left of the avatar.\n\nAcceptance:\n- the button renders\n- the tests pass";
const T0 = Date.now() - 60_000;
const ev = (e: any) => e;
const user = (text: string, source?: string) => ev({ type: "antiloki", subtype: "user", text, ...(source ? { source } : {}) });
const audit = (cost: number, ms: number, baseline_usd: number) => ev({ type: "antiloki", subtype: "audit", model: "sonnet", ms, tokens: 1200, cost, baseline_usd, baseline: "claude · opus" });
const reply = (text: string) => ev({ type: "assistant", message: { model: "claude-sonnet", content: [{ type: "text", text }] } });
const result = (cost: number, ms: number) => ev({ type: "result", total_cost_usd: cost, duration_ms: ms, num_turns: 1 });
const THREAD = (source: string | undefined = "heimdall") => [
  user("fix the nav bar"), user(TASK, source), ev({ type: "antiloki", subtype: "run", run: 5 }), reply("Done: the nav is fixed."), audit(0.011, 4100, 0.112), result(0.011, 4100),
  user("and the footer?"), reply("The footer is done too."), audit(0.02, 3000, 0.1), result(0.02, 3000),
];
const feed = (events: any[]) => act(() => { events.forEach((e, i) => h.feed.event(i + 1, { seq: i + 1, t: T0 + i * 1000, ev: e })); });
const run = (over: any = {}): any => ({ id: 5, parent: "p", goal: TASK, engine: "claude-code", status: "done", created: T0, started: T0, ended: T0 + 30_000, report: "Fixed the nav. The Log in button now sits left of the avatar.", delivered: true, error: null,
  route: { tier: "mid", delegate: true, why: "", bias: [], verify_tier: "mid", join_tier: "high" }, tasks: [{ id: "t1", title: "move the button", status: "done" }, { id: "t2", title: "update the tests", status: "running" }], events: [], blackboard: [], ...over });
// `chat` = antiChat's own skin (an ordinary claude-code pane would wear the Claude Code TUI theme); the last block mounts the themed ones
const props = (over: any = {}) => ({ p: { id: 7, pane_kind: "claude-code", subagent_name: "a", worktree_path: "/tmp/wt", settings_json: "{}" }, chat: true, heimdallOn: true, onSide: vi.fn(), ...over });
const mount = async (events: any[], over: any = {}) => { render(<AgentChatPane {...props(over)} />); await act(async () => { await Promise.resolve(); }); feed(events); await act(async () => { await Promise.resolve(); }); };

beforeEach(() => { h.status = { running: true, busy: false }; h.feed = null; try { localStorage.clear(); } catch { /* fine */ } });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Heimdall's prompt is a task view, not a second human bubble", () => {
  it("the reducer marks the echo the serve tags source:heimdall, and does not adopt it as the human's pending ask", () => {
    let turns = applyEvent([], 1, { seq: 1, t: 1, ev: user("fix the nav bar") });
    turns = applyEvent(turns, 2, { seq: 2, t: 2, ev: user(TASK, "heimdall") });
    expect(turns.map((t: any) => [t.kind, t.from ?? null])).toEqual([["user", null], ["user", "heimdall"]]);
    // the optimistic bubble is still adopted by the human's own echo, and only by it
    const pending = [{ kind: "user" as const, seq: 0.5, t: 0, text: TASK, pending: true }];
    expect(applyEvent(pending, 1, { seq: 1, t: 1, ev: user(TASK, "heimdall") }).length).toBe(2);
    expect(applyEvent(pending, 1, { seq: 1, t: 1, ev: user(TASK) }).length).toBe(1);
  });
  it("folds the task into the human's exchange; without the field, a run's goal right after a user turn is the fallback", () => {
    const tagged = groupExchanges([{ kind: "user", seq: 1, t: 1, text: "fix the nav bar" }, { kind: "user", seq: 2, t: 2, text: TASK, from: "heimdall" }]);
    expect(tagged).toHaveLength(1); expect(tagged[0].user?.text).toBe("fix the nav bar"); expect(tagged[0].task?.text).toBe(TASK);
    const bare = [{ kind: "user" as const, seq: 1, t: 1, text: "fix the nav bar" }, { kind: "user" as const, seq: 2, t: 2, text: TASK }];
    expect(groupExchanges(bare)).toHaveLength(2);                                                    // nothing says it is a task…
    const viaGoal = groupExchanges(bare, looksLikeTask([run()]));                                    // …until a run's goal says so
    expect(viaGoal).toHaveLength(1); expect(viaGoal[0].task?.from).toBe("heimdall");
    // a user turn that merely repeats nothing, or follows an answer, stays the human's
    expect(groupExchanges([{ kind: "user", seq: 1, t: 1, text: "hello" }, { kind: "assistant", seq: 2, t: 2, text: "hi" }, { kind: "user", seq: 3, t: 3, text: TASK }], looksLikeTask([run()]))).toHaveLength(2);
    // a task with no human ask before it stands alone as the exchange's user
    expect(groupExchanges([{ kind: "user", seq: 1, t: 1, text: TASK, from: "heimdall" }])[0].user?.from).toBe("heimdall");
    expect(routeForText([run()], TASK)?.id).toBe(5); expect(taskLines(run()).map((t) => t.title)).toEqual(["move the button", "update the tests"]);
  });

  it("draws the human's words as a right-hand bubble and Heimdall's as a boxed task card with the plan's checklist", async () => {
    await mount(THREAD(), { routes: [run()] });
    const cards = screen.getAllByTestId("task-card");
    expect(cards).toHaveLength(1);                                                                   // one task, once
    expect(within(cards[0]).getByTestId("task-card-head").textContent).toBe("⚡ Heimdall · task");
    expect(cards[0].textContent).toContain("fix the nav bar so the Log in button sits left");
    expect(within(cards[0]).getByTestId("task-card-list").textContent).toContain("move the button");
    expect(cards[0].style.alignSelf).toBe("flex-start");
    // the human's own ask is the only 'you' bubble of that exchange, and Heimdall's text is not drawn a second time as one
    expect(screen.getAllByText("fix the nav bar")).toHaveLength(1);
    expect(screen.getAllByText(/Goal: fix the nav bar/)).toHaveLength(1);
  });
  it("with a serve that does not tag the echo, the run's goal makes the same card", async () => {
    await mount(THREAD(undefined), { routes: [run()] });
    expect(screen.getAllByTestId("task-card")).toHaveLength(1);
    expect(screen.getAllByText(/Goal: fix the nav bar/)).toHaveLength(1);
  });
  it("a thread without Heimdall's prompt has no task card", async () => {
    await mount([user("hello"), reply("hi there"), audit(0.001, 900, 0.01), result(0.001, 900)]);
    expect(screen.queryByTestId("task-card")).toBeNull();
  });
});

describe("the agent's side reads as one flow", () => {
  it("each reply is drawn once, in the engine's own transcript, with its model on the folded line", async () => {
    await mount(THREAD(), { routes: [run()] });
    expect(screen.getByTestId("agent-chat").getAttribute("data-theme")).toBe("claude");           // the engine's own look: there is no house theme
    expect(screen.getAllByText(/Done: the nav is fixed\./)).toHaveLength(1);
    expect(screen.getAllByTestId("reply-meta").length).toBe(2);
  });
  it("the report is ONE line in the thread until it is opened", async () => {
    await mount(THREAD(), { routes: [run()] });
    const res = screen.getByTestId("run-result");
    expect(res.getAttribute("data-open")).toBe("0");
    expect(screen.getByTestId("run-result-line").textContent).toContain("Fixed the nav.");
    expect(res.textContent).not.toContain("sits left of the avatar");
    fireEvent.click(screen.getByTestId("run-result-toggle"));
    expect(screen.getByTestId("run-result").textContent).toContain("sits left of the avatar");
  });
});

describe("everything under an answer is one folded line, open only at the end of everything", () => {
  it("an idle thread: every block is a dim line except the LAST, which is open and carries the thread's total", async () => {
    await mount(THREAD(), { routes: [run({ tasks: [] })] });
    const metas = screen.getAllByTestId("reply-meta");
    expect(metas).toHaveLength(2);
    expect(metas[0].getAttribute("data-open")).toBe("0");
    expect(within(metas[0]).getByTestId("reply-meta-toggle").textContent).toBe("⋯ $0.011 · saved 90% · 4.1 s");
    expect(metas[1].getAttribute("data-open")).toBe("1"); expect(metas[1].getAttribute("data-final")).toBe("1");
    expect(within(metas[1]).getByTestId("reply-meta-line").textContent).toBe("total · 2 turns · $0.031 · saved 85% · 7.1 s");
    // the first exchange's repeated price sentence and buttons are not on screen; the last one's are
    expect(screen.queryByText(/≈ saved \$0\.101/)).toBeNull();
    expect(screen.getByText(/≈ saved \$0\.080/)).toBeTruthy();
    expect(screen.getAllByTestId("reply-actions")).toHaveLength(1);
  });
  it("while the agent is busy nothing is open — not even the last block", async () => {
    h.status = { running: true, busy: true };
    await mount(THREAD(), { routes: [run({ tasks: [] })] });
    for (const m of screen.getAllByTestId("reply-meta")) { expect(m.getAttribute("data-open")).toBe("0"); expect(m.getAttribute("data-final")).toBe("0"); }
    expect(screen.queryByTestId("reply-actions")).toBeNull();
  });
  it("nor while a run is moving, or its QA is still judging", async () => {
    await mount(THREAD(), { routes: [run({ tasks: [], status: "running" })] });
    expect(screen.getAllByTestId("reply-meta").every((m) => m.getAttribute("data-open") === "0")).toBe(true);
    cleanup();
    await mount(THREAD(), { routes: [run({ tasks: [], status: "done", qa_pending: true })] });
    expect(screen.getAllByTestId("reply-meta").every((m) => m.getAttribute("data-open") === "0")).toBe(true);
  });
  it("hovering a folded line opens a window with the buttons and the full price sentence; leaving closes it; a click pins it in the flow", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    h.status = { running: true, busy: true };
    await mount(THREAD(), { routes: [run({ tasks: [] })] });
    const first = screen.getAllByTestId("reply-meta")[0];
    fireEvent.mouseEnter(first);
    const win = screen.getByTestId("reply-meta-preview");
    expect(within(win).getByTestId("reply-actions")).toBeTruthy();
    expect(win.textContent).toContain("≈ saved $0.101 (90%) vs claude · opus — $0.011 instead of $0.112 for the same tokens");
    fireEvent.mouseLeave(first);
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.queryByTestId("reply-meta-preview")).toBeNull();
    fireEvent.click(within(first).getByTestId("reply-meta-toggle"));
    expect(first.getAttribute("data-open")).toBe("1");
    expect(within(first).getByTestId("reply-meta-body").textContent).toContain("≈ saved $0.101");
  });
});

describe("the QA is not in the chat", () => {
  it("a run's story box keeps one word of QA at most - no verdict card, no live QA, no pictures among the messages", async () => {
    await mount(THREAD(), { routes: [run({ tasks: [] })] });
    for (const id of ["qa-verdict", "qa-live", "qa-live-collapsed", "story-evidence", "story-evidence-collapsed"]) expect(screen.queryByTestId(id)).toBeNull();
  });
});

describe("both skins", () => {
  for (const theme of ["windows", "claude"]) {
    it(`the ${theme} skin has the task card, the folded line and the open total at the end`, async () => {
      await mount(THREAD(), { chat: false, routes: [run({ tasks: [] })], p: { id: 8, pane_kind: "claude-code", subagent_name: "a", worktree_path: "/tmp/wt", settings_json: JSON.stringify({ theme }) } });
      expect(screen.getByTestId("agent-chat").getAttribute("data-theme")).toBe(theme);
      expect(screen.getAllByTestId("task-card")).toHaveLength(1);
      expect(screen.getAllByText("fix the nav bar")).toHaveLength(1);
      const metas = screen.getAllByTestId("reply-meta");
      expect(metas[0].getAttribute("data-open")).toBe("0");
      expect(within(metas[0]).getByTestId("reply-meta-toggle").textContent).toContain("$0.011 · saved 90%");
      expect(metas[1].getAttribute("data-open")).toBe("1");
      expect(within(metas[1]).getByTestId("reply-meta-line").textContent).toContain("total · 2 turns");
      expect(screen.getAllByTestId("reply-actions")).toHaveLength(1);
    });
  }
});
