// @vitest-environment jsdom
// ONE FLOW OF TEXT (operator 2026-10-08): the agent's side of the chat is one organised text; Heimdall's prompt is a task view; everything under an
// answer is a single dim line that previews on hover, pins on click and is open by default only at the end of everything.
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
vi.mock("@/loki/api/client", () => ({ apiGet: vi.fn(async () => ({})), apiPost: vi.fn(async () => ({})) }));
import { FlowBlock, FlowReply, TaskCard, ReplyMeta, metaOf, sumMeta, metaLine, totalLine } from "./chat-flow";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("metaOf / metaLine — the numbers behind the one line", () => {
  const audit = (cost: number, ms: number, tokens = 100) => ({ chan: "wire", audit: { cost, ms, tokens } });
  const saving = (cost: number, baseline: number) => ({ chan: "saving", saving: { cost, baseline } });

  it("reads cost and time from the serve's audit and the saving from the saving note: $0.011 · saved 90% · 4.1 s", () => {
    const m = metaOf({ tools: [], notes: [audit(0.011, 4100), saving(0.011, 0.112)] });
    expect(metaLine(m)).toBe("$0.011 · saved 90% · 4.1 s");
  });
  it("falls back to the result event when no audit was written, and adds the tool count", () => {
    const m = metaOf({ tools: [{}, { error: true }, {}], notes: [], result: { cost: 0.5, ms: 900 } });
    expect(metaLine(m)).toBe("$0.50 · 900 ms · 3 tools (1 failed)");
  });
  it("says nothing it does not know, and never claims a saving against itself", () => {
    expect(metaLine(metaOf({ tools: [], notes: [] }))).toBe("");
    expect(metaLine(metaOf({ tools: [], notes: [audit(0.04, 1000), saving(0.04, 0.036)] }))).toBe("$0.040 · 1.0 s");   // costs more than the yardstick: nothing saved
  });
  it("a failed turn says failed first", () => {
    expect(metaLine(metaOf({ tools: [], notes: [], result: { cost: 0.01, ms: 2000, error: "boom" } })).startsWith("failed")).toBe(true);
  });
  it("the thread's total adds costs, times and savings, and counts the turns that cost anything", () => {
    const a = metaOf({ tools: [], notes: [audit(0.01, 2000), saving(0.01, 0.1)] });
    const b = metaOf({ tools: [], notes: [audit(0.03, 3000), saving(0.03, 0.1)] });
    const none = metaOf({ tools: [], notes: [] });
    const t = sumMeta([a, b, none]);
    expect(t.turns).toBe(2);
    expect(totalLine(t)).toBe("total · 2 turns · $0.040 · saved 80% · 5.0 s");
    expect(totalLine(sumMeta([a]))).toBe("total · 1 turn · $0.010 · saved 90% · 2.0 s");
  });
});

describe("FlowBlock — the agent's side of the thread is one text", () => {
  it("is a small mono label, a shared left rule and ONE body size - no bubble background", () => {
    render(<FlowBlock kind="agent" label="agent" meta="claude-code · sonnet" testId="b">hello</FlowBlock>);
    const b = screen.getByTestId("b");
    expect(b.getAttribute("data-flow")).toBe("agent");
    expect(b.textContent).toContain("agent"); expect(b.textContent).toContain("claude-code · sonnet"); expect(b.textContent).toContain("hello");
    expect(b.style.borderLeft).toContain("2px solid"); expect(b.style.background).toBe("");
    const a = render(<FlowBlock kind="result" label="result" testId="r">x</FlowBlock>);
    expect((a.getByTestId("r") as HTMLElement).style.background).toBe("");
    // the body of every kind reads at the same size
    const sizes = [...document.querySelectorAll('[data-flow] > div:last-child')].map((e) => (e as HTMLElement).style.fontSize);
    expect(new Set(sizes).size).toBe(1);
  });
  it("a reply is the same markdown the bubble drew, as flowing text", () => {
    render(<FlowReply text={"**bold** answer"} engine="claude-code" model="sonnet" ts="10:01" />);
    const r = screen.getByTestId("flow-reply");
    expect(r.querySelector("strong")?.textContent).toBe("bold");
    expect(r.textContent).toContain("claude-code · sonnet · 10:01");
  });
});

describe("TaskCard — Heimdall's prompt as a task view, not a second 'you'", () => {
  it("is left-aligned and boxed, headed ⚡ Heimdall · task, with the plan's tasks as a checklist", () => {
    render(<TaskCard meta="⚡ 2 sub-agents · tier mid" ts="10:00" tasks={[{ id: "t1", title: "add the button", status: "done" }, { id: "t2", title: "wire the tests", status: "running" }]}>organised prompt</TaskCard>);
    const c = screen.getByTestId("task-card");
    expect(screen.getByTestId("task-card-head").textContent).toBe("⚡ Heimdall · task");
    expect(c.style.alignSelf).toBe("flex-start"); expect(c.style.borderTop).toContain("1px solid"); expect(c.style.borderLeft).toContain("3px solid");
    expect(c.textContent).toContain("⚡ 2 sub-agents · tier mid");
    const list = screen.getByTestId("task-card-list").textContent ?? "";
    expect(list).toContain("✓add the button"); expect(list).toContain("◐wire the tests");
  });
  it("no checklist without a plan, and a long task folds behind ▸ the whole task", () => {
    render(<TaskCard long>{"line\n".repeat(30)}</TaskCard>);
    expect(screen.queryByTestId("task-card-list")).toBeNull();
    expect(screen.getByTestId("task-card-body").getAttribute("data-folded")).toBe("1");
    fireEvent.click(screen.getByTestId("task-card-more"));
    expect(screen.getByTestId("task-card-body").getAttribute("data-folded")).toBe("0");
  });
});

describe("ReplyMeta — folded to one line, previewed on hover, pinned on click, open only at the end", () => {
  const body = <div data-testid="the-details">buttons · trace · price</div>;

  it("is ONE dim line by default and the details are not on screen", () => {
    render(<ReplyMeta line="$0.011 · saved 90% · 4.1 s">{body}</ReplyMeta>);
    expect(screen.getByTestId("reply-meta").getAttribute("data-open")).toBe("0");
    expect(screen.getByTestId("reply-meta-toggle").textContent).toBe("⋯ $0.011 · saved 90% · 4.1 s");
    expect(screen.queryByTestId("the-details")).toBeNull();
    expect(screen.queryByTestId("reply-meta-preview")).toBeNull();
  });

  it("expands on mouse-over as a window (portalled to the body), and folds again when the pointer leaves", () => {
    vi.useFakeTimers();
    render(<ReplyMeta line="$0.011">{body}</ReplyMeta>);
    fireEvent.mouseEnter(screen.getByTestId("reply-meta"));
    const win = screen.getByTestId("reply-meta-preview");
    expect(win.parentElement).toBe(document.body);               // not clipped by the pane
    expect(win.textContent).toContain("buttons · trace · price");
    expect(screen.getByTestId("reply-meta").getAttribute("data-open")).toBe("0");   // still one line in the flow
    fireEvent.mouseLeave(screen.getByTestId("reply-meta"));
    expect(screen.getByTestId("reply-meta-preview")).toBeTruthy();   // a short grace so the pointer can cross into the window
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.queryByTestId("reply-meta-preview")).toBeNull();
  });

  it("moving into the window is not leaving", () => {
    vi.useFakeTimers();
    render(<ReplyMeta line="$0.011">{body}</ReplyMeta>);
    fireEvent.mouseEnter(screen.getByTestId("reply-meta"));
    fireEvent.mouseLeave(screen.getByTestId("reply-meta"));
    fireEvent.mouseEnter(screen.getByTestId("reply-meta"));          // …back (or into the portal child) inside the grace
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByTestId("reply-meta-preview")).toBeTruthy();
  });

  it("a click pins it open in place; another click folds it", () => {
    render(<ReplyMeta line="$0.011">{body}</ReplyMeta>);
    fireEvent.click(screen.getByTestId("reply-meta-toggle"));
    expect(screen.getByTestId("reply-meta").getAttribute("data-open")).toBe("1");
    expect(screen.getByTestId("reply-meta-body").textContent).toContain("buttons · trace · price");
    expect(screen.queryByTestId("reply-meta-preview")).toBeNull();   // no window over a block that is already open
    fireEvent.click(screen.getByTestId("reply-meta-toggle"));
    expect(screen.getByTestId("reply-meta").getAttribute("data-open")).toBe("0");
  });

  it("is open by default only when final, and then its line is the TOTAL with this turn's own line under it", () => {
    render(<ReplyMeta line="$0.011 · 4.1 s" totalLine="total · 3 turns · $0.043 · saved 88%" final>{body}</ReplyMeta>);
    expect(screen.getByTestId("reply-meta").getAttribute("data-open")).toBe("1");
    expect(screen.getByTestId("reply-meta").getAttribute("data-final")).toBe("1");
    expect(screen.getByTestId("reply-meta-line").textContent).toBe("total · 3 turns · $0.043 · saved 88%");
    expect(screen.getByTestId("reply-meta-last").textContent).toContain("$0.011 · 4.1 s");
    expect(screen.getByTestId("the-details")).toBeTruthy();
    // …and the operator may still fold it
    fireEvent.click(screen.getByTestId("reply-meta-toggle"));
    expect(screen.queryByTestId("the-details")).toBeNull();
  });

  it("follows `final` when it changes (a new exchange arrives: the old last block folds), until the operator chooses", () => {
    const { rerender } = render(<ReplyMeta line="a" final>{body}</ReplyMeta>);
    expect(screen.getByTestId("reply-meta").getAttribute("data-open")).toBe("1");
    rerender(<ReplyMeta line="a" final={false}>{body}</ReplyMeta>);
    expect(screen.getByTestId("reply-meta").getAttribute("data-open")).toBe("0");
    fireEvent.click(screen.getByTestId("reply-meta-toggle"));
    rerender(<ReplyMeta line="a" final={false}>{body}</ReplyMeta>);
    expect(screen.getByTestId("reply-meta").getAttribute("data-open")).toBe("1");   // pinned by the operator, so it stays
  });
});
