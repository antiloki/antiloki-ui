// SIDE QUESTIONS (operator 2026-09-24: "simplify, expand and summary buttons shouldn't run in the same agent
// pane, it should spawn a sidebar mini agent like a parallel subtask … Add also a button Side question there").
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const askEngine = vi.fn();
vi.mock("@/loki/api/engine", () => ({ askEngine: (...a: any[]) => askEngine(...a), ENGINE_KEYS: ["claude-code", "codex", "gemini", "grok", "cursor", "opencode"] }));
vi.mock("@/loki/components/Markdown", () => ({ Markdown: ({ text }: { text: string }) => <div data-testid="md">{text}</div> }));
import { SideQuestionsRail, useSideQuestions, sidePrompt, sideTitle, SIDE_OPS } from "./side-questions";

function Harness({ engine = "claude-code" }: { engine?: string }) {
  const s = useSideQuestions(engine);
  return <>
    <button data-testid="do-simplify" onClick={() => s.ask("simplify", "THE REPLY TEXT")}>simplify</button>
    <span data-testid="running">{s.running}</span>
    <SideQuestionsRail items={s.items} onAsk={(q) => s.ask("ask", "THE REPLY TEXT", q)} onRetry={s.retry} onDismiss={s.dismiss} />
  </>;
}

// a BLOCK body on purpose: `() => askEngine.mockReset()` returns the mock, and vitest registers a function
// returned from a hook as that hook's teardown — it then calls the mock, gets back whatever mockImplementation
// is left over from the previous test (here: a promise nobody resolves) and waits ten seconds for it.
beforeEach(() => { askEngine.mockReset(); });

describe("the prompts", () => {
  it("keeps the reply verbatim, and a bare question stays a bare question", () => {
    expect(SIDE_OPS.map((o) => o.kind)).toEqual(["simplify", "expand", "summary", "ask"]);
    expect(sidePrompt("summary", "hello")).toContain("--- THE REPLY ---\nhello");
    expect(sidePrompt("ask", "", "what is a worktree?")).toBe("what is a worktree?");
    expect(sideTitle({ kind: "ask", ask: "  why?  " } as any)).toBe("why?");
    expect(sideTitle({ kind: "simplify", ask: "" } as any)).toBe("simplify");
  });
});

describe("the rail", () => {
  it("runs the question on the cheap tier and shows the answer, never touching the conversation", async () => {
    askEngine.mockResolvedValue({ ok: true, text: "shorter.", ms: 900 });
    render(<Harness />);
    expect(screen.getByTestId("side-questions").textContent).toContain("The conversation above stays exactly as it is");

    await act(async () => { fireEvent.click(screen.getByTestId("do-simplify")); });
    await waitFor(() => expect(screen.getByTestId("md").textContent).toBe("shorter."));

    const [prompt, opts] = askEngine.mock.calls[0];
    expect(prompt).toContain("--- THE REPLY ---\nTHE REPLY TEXT");
    expect(opts).toMatchObject({ tier: "low", maxTurns: 1 });   // a side question is cheap and one-shot
    expect(screen.getByTestId("side-question").textContent).toContain("low tier · 0.9s");
  });

  it("asks the pane's own seat - any of the five - and names none when the pane has none (never a fixed Claude)", async () => {
    askEngine.mockResolvedValue({ ok: true, text: "ok", ms: 1 });
    for (const [pane, sent] of [["gemini", "gemini"], ["cursor", "cursor"], ["codex", "codex"], ["", "auto"], ["opencode-direct", "auto"]] as const) {
      askEngine.mockClear();
      const { unmount } = render(<Harness engine={pane} />);
      await act(async () => { fireEvent.click(screen.getByTestId("do-simplify")); });
      await waitFor(() => expect(askEngine).toHaveBeenCalled());
      expect(askEngine.mock.calls[0][1].engine, `a pane on "${pane}"`).toBe(sent);
      unmount();
    }
  });

  it("several run at once — one is not a queue behind another", async () => {
    const settle: ((v: any) => void)[] = [];
    askEngine.mockImplementation(() => new Promise((r) => { settle.push(r); }));
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByTestId("do-simplify")); fireEvent.click(screen.getByTestId("do-simplify")); });
    // both went out immediately: a side question is a one-shot call, so nothing waits its turn behind anything
    expect(askEngine).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("running").textContent).toBe("2");
    await act(async () => { settle.splice(0).forEach((r) => r({ ok: true, text: "done", ms: 1 })); await Promise.resolve(); });
    await waitFor(() => expect(screen.getByTestId("running").textContent).toBe("0"));
  });

  it("a failure says so and offers another go; ✕ drops the card", async () => {
    askEngine.mockResolvedValue({ ok: false, error: "the engine returned no text", ms: 10 });
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByTestId("do-simplify")); });
    await waitFor(() => expect(screen.getByTestId("side-question").textContent).toContain("the engine returned no text"));

    askEngine.mockResolvedValue({ ok: true, text: "second time lucky", ms: 20 });
    await act(async () => { fireEvent.click(screen.getByTestId("side-retry")); });
    await waitFor(() => expect(screen.getByTestId("md").textContent).toBe("second time lucky"));
  });

  it("the ask box asks a free question about the same reply", async () => {
    askEngine.mockResolvedValue({ ok: true, text: "because.", ms: 5 });
    render(<Harness />);
    fireEvent.change(screen.getByTestId("side-ask-input"), { target: { value: "why that file?" } });
    await act(async () => { fireEvent.click(screen.getByTestId("side-ask-send")); });
    await waitFor(() => expect(screen.getByTestId("md").textContent).toBe("because."));
    expect(askEngine.mock.calls[0][0]).toContain("why that file?");
    expect(screen.getByTestId("side-question").textContent).toContain("why that file?");
    expect((screen.getByTestId("side-ask-input") as HTMLInputElement).value).toBe("");
  });
});
