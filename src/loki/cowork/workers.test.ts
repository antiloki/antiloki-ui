import { describe, it, expect } from "vitest";
import { parseWorkers, visibleWorkers, withWorkers, workerTitle, statusLine, workerPanes, HOLD_MS, type WorkerTask } from "./workers";
import { addPane, leaves, type Layout, type PaneRef, type Split } from "./layout";

const raw = (o: object = {}) => ({ run_id: 12, task: "t1", title: "fix the picker", status: "running", run_status: "running", wave: 0, attempts: 1, engine: "cursor", model: "composer-2.5", brain: "claude-code", merge: "claude-cursor", why: "one worker", started: 1000, ended: null, tools: null, tokens_in: null, tokens_out: null, cost: null, changed: [], verdict: null, error: null, report: "", events: [{ t: 1, kind: "worker", text: "worker cursor composer-2.5" }], ...o });
const w = (o: object = {}): WorkerTask => parseWorkers({ workers: [raw(o)] })[0];
const E = (id: string): PaneRef => ({ id, kind: "engine", engine: "claude-code", paneId: 1 });

describe("what the serve says about the workers", () => {
  it("parses a task defensively and drops what is not one", () => {
    const [a, ...rest] = parseWorkers({ workers: [raw(), { task: "no run" }, null, 7, raw({ task: "" })] });
    expect(rest).toEqual([]);
    expect(a).toMatchObject({ key: "12:t1", runId: 12, engine: "cursor", model: "composer-2.5", merge: "claude-cursor", status: "running", tools: [], events: [{ kind: "worker" }] });
    expect(parseWorkers(null)).toEqual([]); expect(parseWorkers({ workers: "x" })).toEqual([]); expect(parseWorkers({ result: { workers: [raw()] } })).toHaveLength(1);
  });
  it("reads a finished task's tools, files, numbers and verdict", () => {
    const f = w({ status: "done", ended: 9000, tools: [{ name: "edit", target: "src/a.tsx" }, { nope: 1 }], tokens_in: 11000, tokens_out: 400, cost: 0.02, changed: ["src/a.tsx", 5], verdict: { passed: true, reasons: ["met", 3] } });
    expect(f).toMatchObject({ tools: [{ name: "edit", target: "src/a.tsx" }], tokensIn: 11000, cost: 0.02, changed: ["src/a.tsx"], verdict: { passed: true, reasons: ["met"] } });
  });
  it("titles the pane by who does the work", () => { expect(workerTitle(w())).toBe("cursor · composer-2.5"); expect(workerTitle(w({ engine: null, model: null }))).toBe("worker"); });
});

describe("which tasks have a pane now", () => {
  it("working ones always; a passed one for the hold; a failed one until it is dismissed", () => {
    const run = w({ status: "running" }), verifying = w({ task: "t2", status: "verifying" });
    const passed = w({ task: "t3", status: "done", started: 1000, ended: 5000, verdict: { passed: true, reasons: [] } });
    const failed = w({ task: "t4", status: "failed", ended: 5000, error: "rejected twice" });
    const waiting = w({ task: "t5", status: "pending" });
    const all = [run, verifying, passed, failed, waiting];
    const keys = (now: number, d: string[] = []) => visibleWorkers(all, new Set(d), now).map((x) => x.task);
    expect(keys(6000)).toEqual(["t1", "t2", "t3", "t4"]);
    expect(keys(5000 + HOLD_MS + 1)).toEqual(["t1", "t2", "t4"]);   // the passed one closes by itself; the failed one does not
    expect(keys(10 * 60_000)).toEqual(["t1", "t2", "t4"]);
    expect(keys(6000, ["12:t4", "12:t1"])).toEqual(["t2", "t3"]);    // a dismissal hides it
  });
  it("a task whose verifier said FAIL counts as failed even though it finished", () => {
    const f = w({ status: "done", ended: 1, verdict: { passed: false, reasons: ["no"] } });
    expect(visibleWorkers([f], new Set(), 99_999_999)).toHaveLength(1);
    expect(statusLine(f, 5)).toMatch(/did not pass/);
  });
  it("says where a task is in plain words", () => {
    expect(statusLine(w({ started: 1000 }), 5200)).toBe("working 4.2 s");
    expect(statusLine(w({ status: "verifying" }), 0)).toBe("checking the result");
    expect(statusLine(w({ status: "done", started: 1000, ended: 4000, verdict: { passed: true, reasons: [] } }), 9)).toBe("passed in 3.0 s");
    expect(statusLine(w({ status: "blocked" }), 0)).toBe("blocked");
  });
});

describe("where the worker panes go", () => {
  const base = (): Layout => addPane(addPane(addPane({ root: null, focus: null, zoom: null }, E("a")), E("b")), E("c"));
  it("the first worker sits below its parent, the next to its right, and the parent keeps most of the room", () => {
    const l = withWorkers(base(), [{ parentId: "b", workers: [w(), w({ task: "t2" })] }]);
    expect(leaves(l.root).map((p) => p.id)).toEqual(["a", "b", "worker-12:t1", "worker-12:t2", "c"]);
    const col = (l.root as Split).children[1] as Split;
    expect(col.dir).toBe("col"); expect(col.sizes[0]).toBeCloseTo(0.7, 5);
    expect(workerPanes(l).map((p) => p.worker)).toEqual(["12:t1", "12:t2"]);
  });
  it("is for drawing only: the focus and zoom stay the person's, and the base layout is untouched", () => {
    const b = { ...base(), focus: "a", zoom: null as string | null };
    const l = withWorkers(b, [{ parentId: "b", workers: [w()] }]);
    expect(l.focus).toBe("a"); expect(leaves(b.root).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(withWorkers(b, [])).toEqual(b);
  });
  it("a parent that is not there, or a full screen, draws nothing rather than failing", () => {
    expect(workerPanes(withWorkers(base(), [{ parentId: "ghost", workers: [w()] }]))).toEqual([]);
    let full: Layout = { root: null, focus: null, zoom: null }; for (let i = 0; i < 12; i += 1) full = addPane(full, E(`p${i}`));
    expect(workerPanes(withWorkers(full, [{ parentId: "p0", workers: [w()] }]))).toEqual([]);
  });
});
