import { describe, expect, it } from "vitest";
import { chatOf, contextOf, ledgerOf, sequenceOf, stepsOf, treemap, windowOf, agoWords, hourBuckets, runningNow, axisTicks, waterKindOf, spanWords, waterfallOf, sameTeam, counts, entriesOf, flowOrder, layoutGraph, loopBody, loopFrame, loopFrames, loopProgress, nodeState, parkedAt, statusWords, wirePath, iconOf, modelLine, sublabel } from "./model";
import type { Graph, Run } from "./types";

const E = (from: string, port: string, to: string) => ({ from, port, to });
const bugfix = (): Graph => ({ team: "fix", schema: 1, branch: "team/fix", budget_usd: 2, start: ["loop"], nodes: {
  leader: { node: "leader" }, loop: { node: "loop", max_iterations: 4, cap_usd: 1.6 }, tests: { node: "use_tool", tool: { type: "skill", name: "run-tests" }, allow: { effects: ["read", "exec"] } },
  green: { node: "if", cond: "tests.exit == 0" }, fix: { node: "role", role: "debugger", owns: ["src/**"] }, me: { node: "human", gate: "merge" }, deliver: { node: "deliver" } },
  edges: [E("loop", "body", "tests"), E("tests", "out", "green"), E("green", "then", "me"), E("green", "else", "fix"), E("fix", "out", "loop"), E("loop", "done", "me"), E("loop", "exhausted", "me"), E("me", "approved", "deliver")] });
const run = (over: Partial<Run["state"]> = {}, events: Run["events"] = []): Run => ({ id: "r1", team: "fix", thread: "fix", ask: "x", engine: "", graph: bugfix(), live: true, budget_usd: 2, spent_usd: 0, worst_usd: 1, team_saga: 1, pack: {}, episodes: {}, transcripts: {}, park_info: {}, events,
  state: { status: { status: "running" }, started_ms: 0, now_ms: 0, active: {}, values: {}, spent_usd: 0, node_cost: {}, queued: [], ...over } });

describe("the team board", () => {
  it("starts where the graph says, else at the nodes nothing leads into", () => {
    expect(entriesOf(bugfix())).toEqual(["loop"]); const g = bugfix(); g.start = [];
    expect(entriesOf({ ...g, edges: [E("tests", "out", "green")], nodes: { tests: g.nodes.tests, green: g.nodes.green, leader: g.nodes.leader } })).toEqual(["tests"]);
  });
  it("lays the flow out in columns, the back wire not pushing anything right and the leader on a line of its own", () => {
    const l = layoutGraph(bugfix()); const x = (id: string) => l.boxes[id].x;
    expect(x("loop")).toBeLessThan(x("tests")); expect(x("tests")).toBeLessThan(x("green")); expect(x("green")).toBeLessThan(x("fix")); expect(x("fix")).toBeGreaterThan(x("green")); expect(x("me")).toBeGreaterThan(x("green"));
    expect(l.back.has("fix|out|loop")).toBe(true); expect(l.boxes.leader.y).toBeGreaterThan(Math.max(...["loop", "tests", "green", "fix", "me", "deliver"].map((k) => l.boxes[k].y)));
    for (const a of Object.keys(l.boxes)) for (const b of Object.keys(l.boxes)) if (a < b) { const A = l.boxes[a], B = l.boxes[b]; expect(A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h, `${a} and ${b} overlap`).toBe(false); }
  });
  it("wraps the board into lines when the pane is narrow, never sideways, and does not frame a loop that wraps", () => {
    const wide = layoutGraph(bugfix()); const narrow = layoutGraph(bugfix(), 2);
    expect(narrow.width).toBeLessThanOrEqual(2 * 214 + 60); expect(narrow.width).toBeLessThan(wide.width); expect(narrow.height).toBeGreaterThan(wide.height);
    expect(new Set(Object.values(narrow.band)).size).toBeGreaterThan(2); for (const a of Object.keys(narrow.boxes)) for (const b of Object.keys(narrow.boxes)) if (a < b) { const A = narrow.boxes[a], B = narrow.boxes[b]; expect(A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h, `${a} and ${b} overlap`).toBe(false); }
    expect(loopFrames(bugfix(), narrow, "loop").length).toBeGreaterThan(1); expect(loopFrame(bugfix(), wide, "loop")).not.toBeNull();
  });
  it("keeps a node where the person put it", () => { const g = bugfix(); g.nodes.fix.pos = [500, 400]; const l = layoutGraph(g); expect([l.boxes.fix.x, l.boxes.fix.y]).toEqual([500, 400]); expect(l.width).toBeGreaterThan(500); });
  it("frames a loop round the nodes that go round with it, not the ones after it", () => {
    const g = bugfix(); expect(new Set(loopBody(g, "loop"))).toEqual(new Set(["tests", "green", "fix"]));
    const l = layoutGraph(g); const f = loopFrame(g, l, "loop")!; for (const k of ["tests", "green", "fix"]) { const b = l.boxes[k]; expect(b.x).toBeGreaterThanOrEqual(f.x); expect(b.x + b.w).toBeLessThanOrEqual(f.x + f.w); }
    expect(loopFrame(g, l, "tests")).toBeNull();
  });
  it("draws a wire with right angles, and a wire that goes back runs round underneath", () => {
    const a = { x: 0, y: 0, w: 100, h: 50 }, b = { x: 300, y: 100, w: 100, h: 50 };
    expect(wirePath(a, b, false, 0, 200).d).toMatch(/^M100 25 H\d+ V125 H300$/); const back = wirePath(b, a, true, 1, 200); expect(back.d).toContain("V223"); expect(back.d.endsWith("H0")).toBe(true);
  });
  it("tells a node's state from the run: working, waiting at a human or a timer, done, failed", () => {
    const g = bugfix(); expect(nodeState(g, null, "tests")).toBe("idle");
    const r1 = run({ active: { tests: 1, me: 2 } }); expect(nodeState(g, r1, "tests")).toBe("working"); expect(nodeState(g, r1, "me")).toBe("waiting"); expect(parkedAt(g, r1)).toBe("me");
    const r2 = run({ values: { tests: { exit: 0 } } }, [{ id: 1, saga_id: 1, task_id: null, t_ms: 1, actor: "tests", kind: "done", text: "" }]); expect(nodeState(g, r2, "tests")).toBe("done");
    const r3 = run({}, [{ id: 2, saga_id: 1, task_id: null, t_ms: 2, actor: "fix", kind: "failed", text: "" }]); expect(nodeState(g, r3, "fix")).toBe("failed");
    expect(counts(g, r1)).toEqual({ working: 1, waiting: 1, done: 0, failed: 0 });
  });
  it("reads a loop's pass counter and says the run's status in words", () => {
    expect(loopProgress(run({ values: { loop: { count: 2, max: 4 } } }), "loop")).toEqual({ n: 2, max: 4 }); expect(loopProgress(run(), "loop")).toBeNull();
    expect(statusWords({ status: "blocked", why: "the budget is spent" })).toBe("handed to you: the budget is spent"); expect(statusWords({ status: "done" })).toBe("delivered");
  });
  it("names a node's icon, model line and sublabel", () => {
    const g = bugfix(); expect(iconOf(g.nodes.green)).toBe("ifelse"); expect(iconOf(g.nodes.tests)).toBe("wrench"); expect(iconOf(g.nodes.fix)).toBe("debugger"); expect(sublabel(g.nodes.green)).toBe("tests.exit == 0"); expect(sublabel(g.nodes.loop)).toBe("≤ 4");
    expect(modelLine(g.nodes.fix)).toBe("haiku-class · low"); expect(modelLine({ node: "role", role: "planner" })).toBe("sonnet-class · mid"); expect(modelLine({ node: "role", role: "worker", model: "claude-haiku-5-5" })).toBe("claude-haiku-5-5 · low");
    expect(flowOrder(g).slice(0, 2)).toEqual(["leader", "loop"]);   // the leader first, as the collapsed strip shows it
  });
});

import { diffLines, freshId, operandsOf, withWire, withoutNode, writesOf } from "./model";
describe("editing a graph", () => {
  it("knows what each node writes, so a condition offers only values that exist", () => {
    const g = bugfix(); expect(writesOf(g.nodes.tests).map((w) => w.field)).toEqual(["ok"]); g.nodes.tests = { ...g.nodes.tests, outputs: { exit: "int", failed: "list" } } as any;
    expect(operandsOf(g).map((o) => o.name)).toEqual(expect.arrayContaining(["tests.ok", "tests.exit", "tests.failed", "fix.patched", "loop.count", "me.approved", "budget.left", "elapsed"]));
  });
  it("makes a fresh id, keeps one wire to a port (but many to a fork), and takes a node's wires with it", () => {
    const g = bugfix(); expect(freshId(g, "fix")).toBe("fix2"); expect(freshId(g, "tool_wrench")).toBe("wrench");
    const w = withWire(g, "green", "then", "fix"); expect(w.edges.filter((e) => e.from === "green" && e.port === "then")).toEqual([{ from: "green", port: "then", to: "fix" }]);
    const f = withWire(withWire(g, "x", "branch", "a"), "x", "branch", "b"); expect(f.edges.filter((e) => e.from === "x").length).toBe(2);
    const n = withoutNode(g, "fix"); expect(n.nodes.fix).toBeUndefined(); expect(n.edges.some((e) => e.from === "fix" || e.to === "fix")).toBe(false);
  });
  it("says in lines what the Leader changed", () => {
    const a = bugfix(); const b = withoutNode(withWire(a, "tests", "error", "me"), "fix"); b.budget_usd = 3;
    expect(diffLines(a, b)).toEqual(expect.arrayContaining(["- node fix", "+ wire tests.error → me", "- wire green.else → fix", "~ budget $2 → $3"])); expect(diffLines(a, a)).toEqual([]);
  });
  it("knows the nodes of RFC 0011: an icon, a sublabel and the values each one writes", () => {
    const code: any = { node: "code", source: "#{ a: 1 }", examples: [{ input: {}, output: { a: 1 } }] }; const tr: any = { node: "transform", mode: "filter" }; const stop: any = { node: "stop", message: "pricing gate failed" }; const sub: any = { node: "sub_team", team: "Pricing" };
    expect([iconOf(code), iconOf(tr), iconOf(stop), iconOf(sub)]).toEqual(["code", "transform", "stop", "subteam"]);
    expect([sublabel(code), sublabel(tr), sublabel(stop), sublabel(sub)]).toEqual(["code · 1 example", "filter", "pricing gate failed", "team Pricing"]);
    expect(writesOf(code)).toEqual([{ field: "ok", type: "bool" }, { field: "output", type: "object" }]); expect(writesOf(tr).map((w) => w.field)).toEqual(["ok", "output"]); expect(writesOf(stop)).toEqual([]);
    expect(writesOf(sub).map((w) => w.field)).toEqual(["ok", "child_run", "team", "outputs"]);
    for (const type of ["db", "file", "saga"]) expect(iconOf({ node: "use_tool", tool: { type, name: "x" } } as any)).toBe(type);
    expect(sublabel({ node: "retry", max: 3, open_after: 2 } as any)).toBe("≤ 3 · breaker 2"); expect(sublabel({ node: "retry", max: 3 } as any)).toBe("≤ 3");
    expect(sublabel({ node: "llm", seat: "endpoint:a:m", prompt: "p", answer: {}, preset: { kind: "classify" } } as any)).toBe("classify · endpoint:a:m"); expect(sublabel({ node: "join", policy: "consensus" } as any)).toBe("consensus");
    // an operand of a graph with a code node can be read by a condition
    const g: Graph = { team: "T", schema: 1, branch: "", budget_usd: 1, nodes: { leader: { node: "leader" }, mk: code }, edges: [] }; expect(operandsOf(g).map((o) => o.name)).toContain("mk.output");
  });
  it("tells a rewritten team from the same team moved around on the board", () => {
    const a = bugfix(); const b: Graph = JSON.parse(JSON.stringify(a));
    expect(sameTeam(a, b)).toBe(true);
    (b.nodes.fix as any).pos = [10, 20]; b.branch = "team/other"; expect(sameTeam(a, b)).toBe(true);   // where the editor drew it is not the team
    expect(sameTeam(a, withoutNode(a, "fix"))).toBe(false); expect(sameTeam(a, withWire(a, "tests", "error", "me"))).toBe(false);
    const c: Graph = JSON.parse(JSON.stringify(a)); c.budget_usd = 9; expect(sameTeam(a, c)).toBe(false);
    expect(sameTeam(null, null)).toBe(true); expect(sameTeam(a, null)).toBe(false);
  });
  it("draws a run as bars with a loop as the parent of its body, the numbers on top, the slowest and the dearest marked", () => {
    const g: any = { team: "T", budget_usd: 2, start: ["plan"], nodes: { leader: { node: "leader" }, plan: { node: "role", role: "planner" }, docs: { node: "use_tool", tool: { type: "web", name: "docs" }, allow: { effects: [] } }, loop: { node: "loop", max_iterations: 3 }, work: { node: "role", role: "worker" }, tests: { node: "use_tool", tool: { type: "skill", name: "run-tests" }, allow: { effects: [] } }, deliver: { node: "deliver" } },
      edges: [{ from: "plan", port: "out", to: "docs" }, { from: "docs", port: "out", to: "loop" }, { from: "loop", port: "body", to: "work" }, { from: "work", port: "out", to: "tests" }, { from: "tests", port: "out", to: "loop" }, { from: "loop", port: "done", to: "deliver" }] };
    const run: any = { graph: g, state: { started_ms: 1000, now_ms: 61_000, active: { tests: 40_000 }, node_cost: { plan: 0.01, docs: 0, work: 0.5, tests: 0.1 } },
      events: [{ t_ms: 1000, actor: "plan", kind: "start" }, { t_ms: 6000, actor: "plan", kind: "done" }, { t_ms: 6000, actor: "docs", kind: "start" }, { t_ms: 9000, actor: "docs", kind: "done" }, { t_ms: 9000, actor: "loop", kind: "start" }, { t_ms: 9000, actor: "work", kind: "start" }, { t_ms: 30_000, actor: "work", kind: "failed" }, { t_ms: 40_000, actor: "tests", kind: "start" }, { t_ms: 5, actor: "ghost", kind: "start" }, { t_ms: 7, actor: "team", kind: "x" }] };
    const w = waterfallOf(run); expect(w.rows.map((r) => r.id)).toEqual(["plan", "docs", "loop", "work", "tests"]);   // the loop is followed by the steps of its body
    expect(w.rows[0]).toMatchObject({ start: 0, end: 5000, ms: 5000, state: "done", cost: 0.01, parent: null, kind: "agent", icon: "planner" });
    expect(w.rows[2]).toMatchObject({ id: "loop", children: 2, depth: 0, kind: "control", start: 8000, end: 60_000 }); expect(w.rows[3]).toMatchObject({ id: "work", parent: "loop", depth: 1, state: "failed", slowest: true, dearest: true }); expect(w.rows[4]).toMatchObject({ id: "tests", parent: "loop", state: "working", end: 60_000, sub: "skill run-tests" });
    expect(w.total_ms).toBe(60_000); expect(w.total_cost).toBeCloseTo(0.61, 5); expect(w.stats).toEqual({ steps: 5, model_calls: 2, tool_calls: 2, errors: 1 }); expect(w.rows.some((r) => r.id === "ghost")).toBe(false);
    expect(waterfallOf({ ...run, events: [], state: { ...run.state, active: {} } }).rows).toEqual([]);
    expect([spanWords(400), spanWords(12_000), spanWords(185_000), spanWords(7_800_000)]).toEqual(["0.4 s", "12 s", "3 min 5 s", "2 h 10 min"]);
  });
  it("colours a node by what it is and lays out round time ticks", () => {
    const k = (n: any) => waterKindOf(n); expect([k({ node: "role" }), k({ node: "llm" }), k({ node: "use_tool" }), k({ node: "check" }), k({ node: "loop" }), k({ node: "human" }), k({ node: "deliver" })]).toEqual(["agent", "llm", "tool", "tool", "control", "human", "other"]);
    expect(axisTicks(0)).toEqual([0]); expect(axisTicks(40_000)).toEqual([0, 10_000, 20_000, 30_000, 40_000]); expect(axisTicks(600_000)).toEqual([0, 300_000, 600_000]); expect(axisTicks(3_000)[1]).toBe(1000);
  });
  it("counts the runs that are going over every team, the ones that wait for you first", () => {
    const row = (id: string, team: string, status: string, started: number, needs?: boolean): any => ({ id, team, ask: `ask ${id}`, status: { status }, spent_usd: 0.1, started_ms: started, needs_you: needs });
    const n = runningNow([row("a", "t1", "running", 100), row("b", "t2", "running", 300, true), row("c", "t3", "paused", 200), row("d", "t4", "done", 400), row("e", "t5", "running", 500)], ["a", "b", "c", "d"]);   // e is not live: its serve stopped
    expect(n.rows.map((r) => r.id)).toEqual(["b", "c", "a"]); expect(n.running).toBe(3); expect(n.needs_you).toBe(1); expect(n.label).toBe("3 running · 1 needs you"); expect(runningNow([], []).label).toBe("");
    expect(runningNow([row("x", "t", "running", 1, true), row("y", "t", "running", 2, true)], ["x", "y"]).label).toBe("2 running · 2 need you");
  });
  it("buckets a day by the hour with its peak, and says how long ago in words", () => {
    const H = 3_600_000; const now = 100 * H; const runs = [{ started_ms: now - 2 * H, ended_ms: now - 2 * H + 600_000, kind: "finished" }, { started_ms: now - 2 * H + 1000, ended_ms: now - H, kind: "finished" }, { started_ms: now - 30 * H, ended_ms: now - 29 * H, kind: "finished" }, { started_ms: now - 10_000, ended_ms: now, kind: "running" }];
    const b = hourBuckets(runs, now, 24); expect(b.counts).toHaveLength(24); expect(b.counts[22]).toBe(3); expect(b.counts[23]).toBe(2); expect(b.peak).toBe(3); expect(b.peak_at).toBe(22); expect(b.counts.reduce((a, c) => a + c, 0)).toBe(5);   // the run of 30 hours ago is outside; a running one counts its start only
    expect(hourBuckets([], now).peak_at).toBe(-1); expect([agoWords(now - 20_000, now), agoWords(now - 5 * 60_000, now), agoWords(now - 3 * H, now), agoWords(now - 30 * H, now), agoWords(now - 80 * H, now)]).toEqual(["just now", "5 min ago", "3 h ago", "yesterday", "3 days ago"]);
  });
  const batchRun = (): any => { const g: any = { team: "T", budget_usd: 2, start: ["plan"], nodes: { leader: { node: "leader" }, plan: { node: "role", role: "planner" }, work: { node: "role", role: "worker" }, qa: { node: "role", role: "qa" }, me: { node: "human", gate: "merge" }, deliver: { node: "deliver" } }, edges: [{ from: "plan", port: "out", to: "work" }, { from: "work", port: "out", to: "qa" }, { from: "qa", port: "out", to: "me" }, { from: "me", port: "approved", to: "deliver" }] };
    const ev = (id: number, actor: string, kind: string, text: string, t: number) => ({ id, saga_id: 1, task_id: null, t_ms: t, actor, kind, text });
    return { id: "r", ask: "x", live: false, graph: g, state: { status: { status: "running" }, started_ms: 0, now_ms: 100_000, active: { me: 1 }, node_cost: { plan: 0.1, work: 0.4 }, values: { plan: { sagas: ["a", "b"] }, work: { files: ["src/a.rs", "src/b.rs"], put_back: ["Cargo.toml"], artifacts: [{ name: "report.md" }], said: "x".repeat(4000) }, qa: { pass: true } } },
      events: [ev(1, "plan", "start", "planning", 1000), ev(2, "plan", "done", "planned 2 sagas", 5000), ev(3, "work", "start", "writing", 5000), ev(4, "work", "done", "wrote 2 files", 40_000), ev(5, "qa", "failed", "a check failed", 50_000), ev(6, "me", "human", "waiting for the person (merge)", 60_000)], tools_live: { work: [{ t_ms: 39_000, tool: "Edit", target: "src/a.rs" }, { t_ms: 30_000, tool: "Read", target: "src/a.rs" }] }, park_info: { me: "merge" } }; };
  it("lists what the steps changed, newest first, with what was put back and what they made", () => {
    const l = ledgerOf(batchRun()); expect(l.rows.map((r) => r.node)).toEqual(["work"]); expect(l.rows[0]).toMatchObject({ files: ["src/a.rs", "src/b.rs"], put_back: ["Cargo.toml"], artifacts: ["report.md"], cost: 0.4, failed: false, at_ms: 40_000 }); expect([l.files, l.put_back]).toEqual([2, 1]);
  });
  it("sizes what each step wrote, tiles a box exactly, and measures one step's window", () => {
    const r = batchRun(); const c = contextOf(r); expect(c.items[0].id).toBe("work"); expect(c.items[0].tokens).toBeGreaterThan(1000); const plan = c.items.find((i) => i.id === "plan")!; expect(plan.readers).toEqual(["work"]); expect(plan.reads).toEqual([]);
    const b = treemap(c.items.map((i) => ({ id: i.id, weight: i.tokens })), 1000, 300); expect(b).toHaveLength(3); expect(Math.round(b.reduce((a, x) => a + x.w * x.h, 0))).toBe(300_000); for (const x of b) { expect(x.x).toBeGreaterThanOrEqual(0); expect(x.x + x.w).toBeLessThanOrEqual(1000.0001); expect(x.y + x.h).toBeLessThanOrEqual(300.0001); }
    expect(treemap([], 10, 10)).toEqual([]); expect(treemap([{ id: "a", weight: 0 }], 10, 10)).toEqual([]);
    const w = windowOf(r, "work"); expect(w.parts.map((p) => p.id)).toEqual(["plan"]); expect(w.used).toBe(800 + c.items.find((i) => i.id === "plan")!.tokens); expect(w.share).toBeLessThan(0.01);
  });
  it("tells the run as a chat and as a sequence", () => {
    const r = batchRun(); const m = chatOf(r); expect(m.map((x) => x.kind)).toEqual(["start", "handoff", "start", "handoff", "failed", "question"]); expect(m[1]).toMatchObject({ from: "plan", to: ["work"], text: "planned 2 sagas" }); expect(m[5].to).toEqual([]);
    const s = sequenceOf(r); expect(s.lanes.map((l) => l.id)).toEqual(["plan", "work", "qa", "me", "person"]); expect(s.arrows.map((a) => [a.from, a.to, a.kind])).toEqual([[0, 1, "handoff"], [1, 2, "handoff"], [2, 2, "failed"], [3, 4, "question"]]);
    expect(stepsOf("work", r, 100_000).map((x) => [x.icon, x.text, x.ago])).toEqual([["code", "Edit · src/a.rs", "1 min ago"], ["doc", "Read · src/a.rs", "1 min ago"]]); expect(stepsOf("plan", r, 1)).toEqual([]);
  });
});

describe("the deterministic flag (2026-11-21)", () => {
  it("is on for nodes that call no model, and off for agents, models and sub-teams", async () => {
    const { isDeterministic } = await import("./model");
    const n = (o: any) => o as any;
    for (const x of [{ node: "if" }, { node: "join" }, { node: "human" }, { node: "check" }, { node: "artifact" }, { node: "deliver" }, { node: "test" }, { node: "code" }, { node: "transform" }, { node: "use_tool", starts_model: false, tool: { type: "skill", name: "lint" } }]) expect(isDeterministic(n(x)), x.node).toBe(true);
    for (const x of [{ node: "leader" }, { node: "role", role: "agent" }, { node: "llm" }, { node: "decompose" }, { node: "sub_team" }, { node: "use_tool", starts_model: true, tool: { type: "web", name: "search" } }]) expect(isDeterministic(n(x)), x.node).toBe(false);
  });
});
