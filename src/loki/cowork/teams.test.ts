import { describe, expect, it } from "vitest";
import { defsOf, freeRoles, runOf, todoOf, violationNote, type TeamRow, type TeamRun, type TeamState } from "./teams";
import { runLine } from "./TeamBar";

const row: TeamRow = { id: "k", name: "K", ready: true, members: [{ role: "worker", pane: 2 }, { role: "qa", pane: 3 }] };
describe("teams as the screen reads them", () => {
  it("offers a pane the roles nobody has", () => { expect(freeRoles(row)).toEqual(["planner"]); expect(freeRoles(undefined)).toEqual(["planner", "worker", "qa"]); });
  it("offers a pair no role: it is two agents and no more", () => { expect(freeRoles({ id: "p", name: "Pair", pair: true, ready: true, members: [{ role: "planner", pane: 2 }, { role: "worker", pane: 3 }] })).toEqual([]); });
  it("hands the layout the roles and the cockpit panes", () => { expect(defsOf([row])).toEqual([{ id: "k", name: "K", members: [{ role: "worker", pane: 2 }, { role: "qa", pane: 3 }] }]); });
  it("shows the run that is going, else the newest", () => {
    const s: TeamState = { teams: [row], live: [{ run_id: "a", team: "k", task: "t", started_ms: 5, ended: true, outcome: "done" }, { run_id: "b", team: "k", task: "t", started_ms: 9 }], runs: [{ run_id: "old", team: "k", task: "t", started_ms: 1, ended: true }] };
    expect(runOf(s, "k")?.run_id).toBe("b");
    expect(runOf({ ...s, live: [s.live[0]] }, "k")?.run_id).toBe("a"); expect(runOf(s, "other")).toBeNull(); expect(runOf(null, "k")).toBeNull();
  });
  it("says where a run is in words", () => {
    expect(runLine(null)).toEqual({ text: "talk to the planner to start", tone: "idle" });
    expect(runLine({ run_id: "r", team: "k", task: "t", run: { phase: "working", attempt: 2, max_attempts: 3 } })).toEqual({ text: "working · attempt 2 of 3", tone: "working" });
    expect(runLine({ run_id: "r", team: "k", task: "t", run: { phase: "verifying", attempt: 1, max_attempts: 3 } }).text).toBe("QA · attempt 1 of 3");
    expect(runLine({ run_id: "r", team: "k", task: "t", ended: true, outcome: "done", run: { attempt: 2 } })).toEqual({ text: "done · 2 attempts", tone: "ok" });
    expect(runLine({ run_id: "r", team: "k", task: "t", ended: true, outcome: "blocked" })).toEqual({ text: "needs you", tone: "bad" });
  });
});

describe("the run as a to-do list", () => {
  const plan = { summary: "s", steps: ["read it", "fix it"], criteria: [{ id: "c1", text: "opens" }, { id: "c2", text: "no errors" }] };
  const base = (o: Partial<TeamRun>): TeamRun => ({ run_id: "r", team: "k", task: "t", plan, ...o });
  const states = (xs: { state: string }[]) => xs.map((x) => x.state);
  it("is empty before a run, and shows the plan being made first", () => {
    expect(todoOf(null)).toEqual({ pipeline: [], steps: [], criteria: [] });
    const t = todoOf({ run_id: "r", team: "k", task: "t", plan: null, run: { phase: "planning", attempt: 0, has_qa: true, has_planner: true } }); expect(t.pipeline).toEqual([{ label: "plan", state: "doing" }]);
  });
  it("ticks as the run goes: the worker is doing the steps, then the QA is checking the criteria", () => {
    const w = todoOf(base({ run: { phase: "working", attempt: 1, has_qa: true, has_planner: true } }));
    expect(w.pipeline).toEqual([{ label: "plan", state: "done" }, { label: "work 1", state: "doing" }, { label: "QA 1", state: "pending" }]); expect(states(w.steps)).toEqual(["doing", "doing"]); expect(states(w.criteria)).toEqual(["pending", "pending"]);
    const q = todoOf(base({ run: { phase: "verifying", attempt: 1, has_qa: true, has_planner: true } }));
    expect(q.pipeline.map((p) => p.state)).toEqual(["done", "done", "doing"]); expect(states(q.steps)).toEqual(["checking", "checking"]); expect(states(q.criteria)).toEqual(["checking", "checking"]);
  });
  it("shows what the QA found, retries with the failing criterion marked, and finishes everything when it is accepted", () => {
    const bad = { passed: false, summary: "c2 fails", results: [{ id: "c1", ok: true, evidence: "" }, { id: "c2", ok: false, evidence: "TypeError" }] };
    const retry = todoOf(base({ verdicts: [bad], run: { phase: "working", attempt: 2, has_qa: true, has_planner: true } }));
    expect(retry.pipeline.map((p) => `${p.label}:${p.state}`)).toEqual(["plan:done", "work 1:done", "QA 1:failed", "work 2:doing", "QA 2:pending"]); expect(states(retry.criteria)).toEqual(["done", "failed"]); expect(retry.criteria[1].note).toBe("TypeError");
    const ok = { passed: true, summary: "", results: [{ id: "c1", ok: true, evidence: "" }, { id: "c2", ok: true, evidence: "" }] };
    const fin = todoOf(base({ ended: true, outcome: "done", verdicts: [bad, ok], run: { phase: "done", attempt: 2, has_qa: true, has_planner: true } }));
    expect(fin.pipeline.every((p) => p.state === "done" || p.state === "failed")).toBe(true); expect(fin.pipeline.map((p) => p.state)).toEqual(["done", "done", "failed", "done", "done"]); expect(states(fin.steps)).toEqual(["done", "done"]); expect(states(fin.criteria)).toEqual(["done", "done"]);
  });
  it("marks a blocked run's work as failed and leaves out the QA when the team has none", () => {
    const b = todoOf(base({ ended: true, outcome: "blocked", run: { phase: "blocked", attempt: 1, has_qa: false, has_planner: true } }));
    expect(b.pipeline.map((p) => p.label)).toEqual(["plan", "work 1"]); expect(states(b.steps)).toEqual(["failed", "failed"]);
  });
});

describe("the badge for a read-only role that changed code", () => {
  it("is absent for a clean team and says how many and what for a team that was reverted", () => {
    expect(violationNote({ violations: 0 })).toBeNull(); expect(violationNote({})).toBeNull();
    const n = violationNote({ violations: 2, last_violation: { role: "planner", files: ["a.ts", "b.ts"], moved_head: true } })!;
    expect(n.text).toBe("⚠ 2 reverted"); expect(n.title).toContain("the planner changed a.ts, b.ts and moved the commit"); expect(n.title).toContain("Only the worker edits");
    expect(violationNote({ violations: 1, last_violation: { role: "qa", files: [] } })!.title).toContain("the QA");
  });
});
