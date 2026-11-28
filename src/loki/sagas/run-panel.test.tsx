// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
import { runState, type Saga, type Episode } from "./model";
vi.mock("@/loki/cowork/api", () => ({ listEngines: async () => [{ key: "claude-code", label: "Claude Code", installed: true, seat: true }, { key: "codex", label: "Codex", installed: true, seat: true }, { key: "grok", label: "Grok", installed: false, seat: false }] }));
import { RunPanel } from "./run-panel";

const saga = (o: Partial<Saga> = {}): Saga => ({ id: 1, title: "S", objective: "", status: "todo", origin: "you", plan_ref: null, confidence: "", delivered: 0, created_ms: 0, updated_ms: 0, rollup: {} as any, ...o } as Saga);
const episode = (id: number, status: Episode["status"] = "todo"): Episode => ({ id, saga_id: 1, parent_id: null, title: `t${id}`, body: "", status, assignee: "", created_by: "you", position: id, engine: "", model: "", ms_total: 0, usd_total: 0, tokens: 0, created_ms: 0, updated_ms: 0, started_ms: null, done_ms: null, steps: [] } as unknown as Episode);

describe("when a saga can be run", () => {
  it("needs an open episode, at most eight, is not run twice and says why not", () => {
    expect(runState(saga(), [])).toMatchObject({ can: false, open: 0 }); expect(runState(saga(), [])).toMatchObject({ why: expect.stringContaining("add an episode") });
    expect(runState(saga(), [episode(1), episode(2, "done")])).toEqual({ can: true, running: false, why: "", open: 1 });
    expect(runState(saga(), Array.from({ length: 9 }, (_, i) => episode(i + 1))).why).toContain("8 episodes at most");
    expect(runState(saga({ status: "doing", plan_ref: "run:4" }), [episode(1, "doing")])).toMatchObject({ can: false, running: true });
    expect(runState(saga({ status: "todo", plan_ref: "run:4" }), [episode(1, "failed")]).can).toBe(true);   // a failed run can be run again over what is left
    expect(runState(saga({ status: "canceled" }), [episode(1)]).can).toBe(false); expect(runState(saga({ plan_ref: "plan:x" }), [episode(1)]).can).toBe(false);
  });
});
describe("the run panel", () => {
  afterEach(() => cleanup());
  it("offers the installed seats, keeps the model and the budget, and runs or stops", async () => {
    const onSet = vi.fn(), onRun = vi.fn(), onStop = vi.fn();
    const { rerender } = render(<RunPanel saga={saga()} episodes={[episode(1), episode(2)]} busy={false} onSet={onSet} onRun={onRun} onStop={onStop} />);
    await waitFor(() => expect(screen.getByTestId("run-engine").querySelectorAll("option").length).toBe(3));   // the default + the two installed ones
    expect((screen.getByTestId("run-model") as HTMLInputElement).disabled).toBe(true);   // choose a seat first
    fireEvent.change(screen.getByTestId("run-engine"), { target: { value: "claude-code" } }); expect(onSet).toHaveBeenCalledWith({ engine: "claude-code", model: "" });
    rerender(<RunPanel saga={saga({ run: { engine: "claude-code" } })} episodes={[episode(1), episode(2)]} busy={false} onSet={onSet} onRun={onRun} onStop={onStop} />);
    fireEvent.change(screen.getByTestId("run-model"), { target: { value: "haiku" } }); fireEvent.blur(screen.getByTestId("run-model")); expect(onSet).toHaveBeenLastCalledWith({ model: "haiku" });
    fireEvent.change(screen.getByTestId("run-budget"), { target: { value: "2,5" } }); fireEvent.blur(screen.getByTestId("run-budget")); expect(onSet).toHaveBeenLastCalledWith({ budget_usd: 2.5 });
    rerender(<RunPanel saga={saga({ run: { engine: "claude-code", model: "haiku", budget_usd: 2.5 } })} episodes={[episode(1), episode(2)]} busy={false} onSet={onSet} onRun={onRun} onStop={onStop} />);
    fireEvent.change(screen.getByTestId("run-budget"), { target: { value: "" } }); fireEvent.blur(screen.getByTestId("run-budget")); expect(onSet).toHaveBeenLastCalledWith({ budget_usd: 0 });
    fireEvent.click(screen.getByTestId("run-start")); expect(onRun).toHaveBeenCalledTimes(1); expect(screen.getByTestId("run-start").textContent).toBe("Run 2 episodes");
    rerender(<RunPanel saga={saga({ status: "doing", plan_ref: "run:3" })} episodes={[episode(1, "doing"), episode(2)]} busy={false} onSet={onSet} onRun={onRun} onStop={onStop} />);
    expect(screen.queryByTestId("run-start")).toBeNull(); expect((screen.getByTestId("run-engine") as HTMLSelectElement).disabled).toBe(true); fireEvent.click(screen.getByTestId("run-stop")); expect(onStop).toHaveBeenCalledTimes(1);
  });
  it("with nothing to run the button is off and says why", async () => {
    render(<RunPanel saga={saga()} episodes={[]} busy={false} onSet={() => {}} onRun={() => {}} onStop={() => {}} />);
    expect((screen.getByTestId("run-start") as HTMLButtonElement).disabled).toBe(true); expect(screen.getByTestId("run-why").textContent).toContain("add an episode");
  });
});
