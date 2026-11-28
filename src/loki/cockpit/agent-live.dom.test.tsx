import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const goalOp = vi.fn(async () => ({ ok: true }));
const apiPost = vi.fn(async () => ({ ok: true }));
vi.mock("@/loki/widgets/subagents", async (orig) => ({ ...(await orig<any>()), goalOp: (...a: any[]) => (goalOp as any)(...a) }));
vi.mock("@/loki/api/client", async (orig) => ({ ...(await orig<any>()), apiPost: (...a: any[]) => (apiPost as any)(...a) }));

import { ScreeningCard, LiveLine, RunResult } from "./agent-live";

const run = (over: any = {}): any => ({ id: 9, status: "awaiting-answers", created: Date.now() - 5000, started: null, ended: null, tasks: [], events: [], report: null,
  questions: [{ id: "d1", text: "“add a button” — anything particular in mind?", options: ["keep it minimal"], default: "antiloki decides the details", certainty: "blocking", answer: null }], ...over });

describe("the card QA raises when its send-backs are spent", () => {
  it("says QA needs a direction, keeps the line breaks, and the chips and typed words go to the run as the answer", async () => {
    goalOp.mockClear();
    const onChanged = vi.fn();
    const q = { id: "qa1", kind: "qa-direction", text: "QA sent this run back 2 time(s) and it is still not right. Still unmet:\n- the search is gone", options: ["keep trying with the same feedback", "accept it as it is"], default: "accept it as it is", certainty: "blocking", answer: null };
    render(<ScreeningCard run={run({ questions: [q] })} paneId={4} onChanged={onChanged} />);
    expect(screen.getByText(/QA needs your direction/)).toBeTruthy();
    expect(screen.getByText(/Still unmet/).getAttribute("style")).toContain("pre-wrap");
    fireEvent.change(screen.getByTestId("screening-answer-qa1"), { target: { value: "remove it from the header too" } });
    fireEvent.click(screen.getByTestId("screening-go"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(goalOp).toHaveBeenCalledWith("answer", { id: 9, answers: { qa1: "remove it from the header too" } });
    expect(screen.getByTestId("screening-defaults").textContent).toBe("accept as it is");
  });
});

describe("the live part of the chat", () => {
  beforeEach(() => { goalOp.mockClear(); apiPost.mockClear(); });

  it("the screening card shows the question and, on the defaults, answers the run and leaves the answer in the thread", async () => {
    const onChanged = vi.fn();
    render(<ScreeningCard run={run()} paneId={4} onChanged={onChanged} />);
    expect(screen.getByText(/anything particular in mind/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("screening-defaults"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(goalOp).toHaveBeenCalledWith("answer", { id: 9, answers: {} });
    const note = (apiPost.mock.calls as any[]).find((c) => c[0] === "/api/v1/cockpit/agent/note");
    expect(note[1]).toMatchObject({ pane_id: 4, tone: "ok" });
    expect(note[1].text).toContain("you answered");
    expect(note[1].text).toContain("antiloki decides the details (the default)");
  });

  it("a typed answer goes to the run and into the thread as typed", async () => {
    render(<ScreeningCard run={run()} paneId={4} />);
    fireEvent.change(screen.getByTestId("screening-answer-d1"), { target: { value: "a blue Buy now" } });
    fireEvent.click(screen.getByTestId("screening-go"));
    await waitFor(() => expect(goalOp).toHaveBeenCalledWith("answer", { id: 9, answers: { d1: "a blue Buy now" } }));
    await waitFor(() => expect((apiPost.mock.calls as any[]).some((c) => String(c[1]?.text).includes("— a blue Buy now"))).toBe(true));
  });

  it("the card is gone once the run is past the question", () => {
    const { container } = render(<ScreeningCard run={run({ status: "running" })} paneId={4} />);
    expect(container.textContent).toBe("");
  });

  it("the live line names the verb, the elapsed time and the sub-agent", () => {
    render(<LiveLine since={Date.now() - 12_000} agentBusy={false}
      run={run({ status: "running", started: Date.now() - 12_000, tasks: [{ id: "t1", title: "add a button", status: "running" }], pair: { name: "n", brain: "claude-code", hands: "cursor", hands_model: "composer-2.5" } })} />);
    const el = screen.getByTestId("live-line");
    expect(el.textContent).toMatch(/…/);
    expect(el.textContent).toMatch(/12s|13s/);
    expect(el.textContent).toContain("composer-2.5");
    expect(el.textContent).toContain("writing “add a button”");
  });

  it("the live line is silent when nothing is running", () => {
    const { container } = render(<LiveLine run={null} since={Date.now()} agentBusy={false} />);
    expect(container.textContent).toBe("");
  });

  it("a finished run puts its result in the chat, without the diff", () => {
    render(<RunResult run={run({ status: "done", report: "Added the Log in button to the nav.\n```diff\n+x\n```" })} />);
    fireEvent.click(screen.getByTestId("run-result-toggle"));
    expect(screen.getByTestId("run-result").textContent).toContain("Added the Log in button");
    expect(screen.getByTestId("run-result").textContent).not.toContain("+x");
  });

  // operator 2026-10-08: "the report should be 1 line with an expand button"
  it("the report is ONE line until it is opened: result · run # · its first sentence", () => {
    render(<RunResult run={run({ status: "done", report: "Added the Log in button to the nav. It sits left of the avatar and opens the sign-in sheet.\n\nThen I wired the tests." })} />);
    const box = screen.getByTestId("run-result");
    expect(box.getAttribute("data-open")).toBe("0");
    expect(screen.getByTestId("run-result-toggle").textContent).toContain("▸");
    expect(screen.getByTestId("run-result-toggle").textContent).toContain("result · run #9");
    expect(screen.getByTestId("run-result-line").textContent).toContain("Added the Log in button to the nav.");
    expect(box.textContent).not.toContain("sign-in sheet");        // the rest of the report is not on screen
    expect(box.querySelector('[data-flow="result"]')).toBeNull();
    fireEvent.click(screen.getByTestId("run-result-toggle"));
    expect(box.getAttribute("data-open")).toBe("1");
    expect(box.textContent).toContain("sign-in sheet");
    expect(box.textContent).toContain("Then I wired the tests.");
    expect(screen.queryByTestId("run-result-line")).toBeNull();     // the line gives way to the report
    fireEvent.click(screen.getByTestId("run-result-toggle"));
    expect(box.textContent).not.toContain("sign-in sheet");
  });
  it("a failed run says so in its one line", () => {
    render(<RunResult run={run({ status: "failed", report: "Could not finish: the build is red." })} />);
    expect(screen.getByTestId("run-result-toggle").textContent).toContain("run failed · run #9");
  });

  // operator 2026-09-29: "should have an expand button to see the full report inline" (inside the opened report since 2026-10-08)
  it("a long report shows its start and a button for the rest, inline", () => {
    const long = Array.from({ length: 120 }, (_, i) => `Suggestion ${i + 1}: something worth doing in the store.`).join("\n");
    render(<RunResult run={run({ status: "done", report: long })} />);
    expect(screen.queryByTestId("run-result-expand")).toBeNull();   // folded to the line: nothing to expand yet
    fireEvent.click(screen.getByTestId("run-result-toggle"));
    const before = screen.getByTestId("run-result").textContent ?? "";
    expect(before).toContain("Suggestion 1:"); expect(before).not.toContain("Suggestion 120:");
    fireEvent.click(screen.getByTestId("run-result-expand"));
    expect(screen.getByTestId("run-result").textContent).toContain("Suggestion 120:");
    fireEvent.click(screen.getByTestId("run-result-expand"));
    expect(screen.getByTestId("run-result").textContent).not.toContain("Suggestion 120:");
  });
  it("a short report has no expand button", () => {
    render(<RunResult run={run({ status: "done", report: "Added the Log in button to the nav." })} />);
    fireEvent.click(screen.getByTestId("run-result-toggle"));
    expect(screen.queryByTestId("run-result-expand")).toBeNull();
  });
});
