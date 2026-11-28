// THE QUESTION CARD (RFC 0007 §17.6): what the person sees when the engine's prompt hook is waiting on a pre-check question, and what goes back to it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({ answerAsk: vi.fn() }));
vi.mock("./api", () => ({ answerAsk: (...a: unknown[]) => api.answerAsk(...a) }));
import { AskCard } from "./AskCard";
import type { OpenAsk } from "./api";

const ask: OpenAsk = { id: 42, paneId: 7, text: "fix the picker in src/nowhere/gone.tsx", verdict: { verdict: "ask", notes: ["reads as: a small change"], questions: [
  { id: "q1", text: "`src/nowhere/gone.tsx` is not in this box", options: ["create it", "find the closest file"] }, { id: "q2", text: "which folder?", options: ["src", "lib"] }] } };
beforeEach(() => { api.answerAsk.mockReset().mockResolvedValue(true); });

describe("the question card", () => {
  it("shows every question with its options and the agent-is-waiting line, and Continue waits for each to be answered or deferred", () => {
    render(<AskCard ask={ask} />);
    expect(screen.getByTestId("precheck-card").textContent).toMatch(/the agent is waiting for you/);
    expect(screen.getByTestId("question-q1").textContent).toMatch(/not in this box/); expect(screen.getByTestId("answer-q1-1").textContent).toBe("find the closest file");
    expect((screen.getByTestId("precheck-send") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("precheck-send").textContent).toBe("Continue");
  });
  it("Continue hands each chosen option back to the hook, leaves out a deferred question, and the card goes", async () => {
    const done = vi.fn();
    render(<AskCard ask={ask} onDone={done} />);
    fireEvent.click(screen.getByTestId("answer-q1-0")); fireEvent.click(screen.getByTestId("defer-q2"));
    fireEvent.click(screen.getByTestId("precheck-send"));
    await waitFor(() => expect(api.answerAsk).toHaveBeenCalledWith(42, { q1: "create it" }, false));
    expect(screen.queryByTestId("precheck-card")).toBeNull(); await waitFor(() => expect(done).toHaveBeenCalled());
  });
  it("the X dismisses it, which tells the hook to stop waiting, once", async () => {
    render(<AskCard ask={ask} />);
    fireEvent.click(screen.getByLabelText("dismiss the pre-check"));
    await waitFor(() => expect(api.answerAsk).toHaveBeenCalledWith(42, {}, true));
    expect(api.answerAsk).toHaveBeenCalledTimes(1); expect(screen.queryByTestId("precheck-card")).toBeNull();
  });
  it("Escape dismisses it the same way and leaves the keyboard to the terminal", async () => {
    render(<AskCard ask={ask} />);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(api.answerAsk).toHaveBeenCalledWith(42, {}, true));
  });
  it("Escape pressed in the terminal is the card's: it dismisses and goes no further, so the agent is not interrupted", async () => {
    const reachedTerminal = vi.fn();
    render(<div><AskCard ask={ask} /><textarea data-testid="xterm-helper" onKeyDown={reachedTerminal} /></div>);
    fireEvent.keyDown(screen.getByTestId("xterm-helper"), { key: "Escape" });
    await waitFor(() => expect(api.answerAsk).toHaveBeenCalledWith(42, {}, true));
    expect(reachedTerminal).not.toHaveBeenCalled();
  });
  it("answering twice (a double click) sends one answer", async () => {
    render(<AskCard ask={ask} />);
    fireEvent.click(screen.getByTestId("answer-q1-0")); fireEvent.click(screen.getByTestId("answer-q2-1"));
    const send = screen.getByTestId("precheck-send"); fireEvent.click(send); fireEvent.click(send);
    await waitFor(() => expect(api.answerAsk).toHaveBeenCalledTimes(1));
    expect(api.answerAsk).toHaveBeenCalledWith(42, { q1: "create it", q2: "lib" }, false);
  });
});
