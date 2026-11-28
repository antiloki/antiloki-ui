import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Graph, Run } from "./types";

const api = vi.hoisted(() => ({
  listTemplates: vi.fn(async (): Promise<any[]> => []), startFromTemplate: vi.fn(async (..._a: any[]): Promise<any> => ({})), teamOp: vi.fn(), appsPreflight: vi.fn(async () => null), rootCause: vi.fn(async () => null), conflictsNow: vi.fn(async () => ({ trees: [], conflicts: [] })), runCheckpoints: vi.fn(async () => []), listRequests: vi.fn(async () => []), threadList: vi.fn(async () => []), threadFork: vi.fn(), threadOpen: vi.fn(), benchmarkOf: vi.fn(async () => null), getTeamReading: vi.fn(), workspaceState: vi.fn(), stashWorkspace: vi.fn(), unstashWorkspace: vi.fn(), listMedia: vi.fn(), mediaUrl: vi.fn(), webhookToken: vi.fn(), awayDigest: vi.fn(), teamProof: vi.fn(), steerRun: vi.fn(), loadCatalog: vi.fn(), listTeams: vi.fn(), getTeam: vi.fn(), saveGraph: vi.fn(), createTeam: vi.fn(), runTeam: vi.fn(), runStatus: vi.fn(), nodeView: vi.fn(), controlRun: vi.fn(),
  answerAt: vi.fn(), improverConfig: vi.fn(), improverReview: vi.fn(), improverProposals: vi.fn(), improverDecide: vi.fn(), editNode: vi.fn(), moveBudget: vi.fn(), simulateTeam: vi.fn(), validateGraph: vi.fn(), deleteTeam: vi.fn(), listSkills: vi.fn(), approveSkill: vi.fn(), deleteSkill: vi.fn(), listArtifacts: vi.fn(), getArtifact: vi.fn(), getResult: vi.fn(), makeResultPage: vi.fn(), nodeBench: vi.fn(), triggerStatus: vi.fn(), setTriggers: vi.fn(), consentTriggers: vi.fn(), fireTrigger: vi.fn(),
}));
const cowork = vi.hoisted(() => ({ listEngines: vi.fn(async () => [] as any[]), localModels: vi.fn(async () => ({ reachable: false, base: "", models: [] as any[] })), appSignIn: vi.fn(), specialistsOpenable: vi.fn(async () => []) }));
vi.mock("@/loki/cowork/api", () => cowork);
vi.mock("./api", () => api);
const sagas = vi.hoisted(() => ({ listSagas: vi.fn(), getSaga: vi.fn() }));
vi.mock("@/loki/sagas/api", () => sagas);

import { Board } from "./Board";
import { NodeDrawer } from "./NodeDrawer";
import { PackList, groupByStatus, packOf } from "./PackList";
import { TeamEdit } from "./TeamEdit";
import { TeamPane, pickRun } from "./TeamPane";
import { ViewBarSlot } from "./viewbar-slot";
import { TeamRun } from "./TeamRun";

const E = (from: string, port: string, to: string) => ({ from, port, to });
const bugfix = (): Graph => ({ team: "Fix", schema: 1, branch: "team/fix", budget_usd: 2, start: ["loop"], nodes: {
  leader: { node: "leader" }, loop: { node: "loop", max_iterations: 4, cap_usd: 1.6 }, tests: { node: "use_tool", tool: { type: "skill", name: "run-tests" }, allow: { effects: ["read", "exec"] }, outputs: { exit: "int" } },
  green: { node: "if", cond: "tests.exit == 0" }, fix: { node: "role", role: "debugger", owns: ["src/**"], cap_usd: 0.3 }, me: { node: "human", gate: "merge" }, deliver: { node: "deliver" } },
  edges: [E("loop", "body", "tests"), E("tests", "out", "green"), E("green", "then", "me"), E("green", "else", "fix"), E("fix", "out", "loop"), E("loop", "done", "me"), E("loop", "exhausted", "me"), E("me", "approved", "deliver")] });
const mkRun = (over: Partial<Run["state"]> = {}, events: Run["events"] = [], extra: Partial<Run> = {}): Run => ({ id: "fix-1", team: "fix", thread: "fix", ask: "x", engine: "", graph: bugfix(), live: true, budget_usd: 2, spent_usd: 0.4, worst_usd: 1, team_saga: 1, pack: {}, episodes: {}, transcripts: { fix: ["fix-1.txt"] }, park_info: {}, events,
  state: { status: { status: "running" }, started_ms: 0, now_ms: 0, active: {}, values: {}, spent_usd: 0.4, node_cost: { fix: 0.1 }, queued: [], ...over }, ...extra });

beforeEach(() => {
  for (const f of Object.values(api)) (f as any).mockReset(); sagas.listSagas.mockReset(); sagas.getSaga.mockReset(); try { localStorage.clear(); } catch { /* */ } try { localStorage.setItem("antiloki.team.agentTheme.v2", "microchip"); } catch { /* */ }
  api.controlRun.mockResolvedValue({ ok: true }); api.answerAt.mockResolvedValue({ ok: true }); api.editNode.mockResolvedValue({ ok: true, node: {}, report: { errors: [], warnings: [], worst_usd: 1, budget_usd: 2 } });
  api.nodeView.mockResolvedValue({ node: "fix", attempts: [{ file: "fix-1.txt", text: "── prompt ──\nfix it\n── reply ──\nI patched it" }, { file: "fix-2.txt", text: "second try text" }], output: { patched: true }, cost_usd: 0.1, active: false });
  sagas.listSagas.mockResolvedValue([]); sagas.getSaga.mockResolvedValue({ saga: {}, episodes: [], events: [] }); api.listSkills.mockResolvedValue([]); api.listArtifacts.mockResolvedValue([]); api.listMedia.mockResolvedValue([]); api.getTeamReading.mockImplementation(async (t: string) => { const g = await api.getTeam(t); return { found: g ?? null, missing: !g }; }); api.workspaceState.mockResolvedValue({ dirty: [], stashed: false }); api.getResult.mockResolvedValue({ ok: false, error: "none" }); api.nodeBench.mockReset(); api.nodeBench.mockResolvedValue([]); api.makeResultPage.mockReset(); api.triggerStatus.mockResolvedValue(null); cowork.listEngines.mockReset(); cowork.listEngines.mockResolvedValue([{ key: "claude-code", label: "Claude Code" }, { key: "codex", label: "Codex" }]);
});
afterEach(cleanup);

beforeEach(() => { try { localStorage.setItem("antiloki.team.view", "canvas"); localStorage.setItem("antiloki.team.edit.mode", "board"); } catch { /* none */ } });   // the old tests look at the editable canvas; the Graph has its own
/** the run's decision is one slim notice; the tests that judge the full card open it first */
const renderT = (ui: React.ReactElement) => { const r = render(ui); const b = screen.queryByTestId("decision-open"); if (b) fireEvent.click(b); return r; };
describe("the circuit board", () => {
  beforeEach(() => { setAgentTheme("microchip"); });   // the microchip look is the one these tests draw; the cards look has its own describe below
  it("draws every node by its shape, the loop's frame, the LEDs and a pulse on the wire that carries work, and selects on a click", () => {
    const onSelect = vi.fn(); const run = mkRun({ active: { tests: 1 }, values: { loop: { count: 2, max: 4 } } }, [{ id: 1, saga_id: 1, task_id: null, t_ms: 1, actor: "loop", kind: "done", text: "" }]);
    render(<Board graph={bugfix()} run={run} onSelect={onSelect} />);
    expect(screen.getByTestId("node-fix")).toHaveAttribute("data-shape", "chip"); expect(screen.getByTestId("node-tests")).toHaveAttribute("data-shape", "tool"); expect(screen.getByTestId("node-green")).toHaveAttribute("data-shape", "icon");
    expect(screen.getByTestId("node-tests")).toHaveAttribute("data-state", "working"); expect(within(screen.getByTestId("node-tests")).getByTestId("led")).toHaveAttribute("data-state", "working"); expect(within(screen.getByTestId("node-tests")).getByText(/no model/)).toBeTruthy();
    expect(screen.getByTestId("loop-frame-loop")).toHaveTextContent("pass 2 of 4"); expect(screen.getByTestId("loop-frame-loop")).toHaveTextContent("cap $1.60");
    fireEvent.click(screen.getByTestId("node-fix")); expect(onSelect).toHaveBeenCalledWith("fix");
  });
  it("is read-only in a run and, in the editor, gives each node a pin to draw a wire from", () => {
    const { unmount } = render(<Board graph={bugfix()} run={null} />); expect(screen.queryByTestId("pin-tests")).toBeNull(); unmount();
    render(<Board graph={bugfix()} editable />); expect(screen.getByTestId("pin-tests")).toBeTruthy(); expect(screen.queryByTestId("pin-leader")).toBeNull(); expect(screen.queryByTestId("pin-deliver")).toBeNull();
  });
});

describe("the saga pack", () => {
  const saga = (id: number, title: string, status: string, meta: any, rollup: any = { episodes: 2, done: 1, canceled: 0, doing: 1, usd: 0.5, ms: 90_000 }) => ({ id, title, objective: "", status, meta, rollup }) as any;
  it("finds the team's own saga and its pack, and groups the pack the way a person reads it", () => {
    const list = [saga(1, "Fix · team", "doing", { kind: "team", team: "fix" }), saga(2, "A", "todo", { kind: "pack", team: "fix", run: "r1", unit: "a" }), saga(3, "B", "doing", { kind: "pack", team: "fix", run: "r1", unit: "b" }), saga(4, "Other", "doing", { kind: "pack", team: "other" })];
    const p = packOf(list, "fix", "r1"); expect(p.own?.id).toBe(1); expect(p.pack.map((s) => s.id)).toEqual([2, 3]); expect(groupByStatus(p.pack).map((g) => g.status)).toEqual(["doing", "todo"]);
  });
  it("lists the team saga first, then the groups, and opens a saga into its episodes with their tags", async () => {
    sagas.listSagas.mockResolvedValue([saga(1, "Fix · team", "doing", { kind: "team", team: "fix" }), saga(2, "The cart", "doing", { kind: "pack", team: "fix", run: "r1", unit: "cart" })]);
    sagas.getSaga.mockImplementation(async (id: number) => ({ saga: {}, events: [], episodes: id === 1 ? [{ id: 10, title: "Pass 1 · cart", status: "failed", usd_total: 0.2, ms_total: 5000, meta: { path: "cart › loop pass 1" } }, { id: 11, title: "Pass 2 · cart", status: "doing", usd_total: 0, ms_total: 0, meta: { retry_of: 10, produced_by: null } }] : [{ id: 20, title: "Pass 1", status: "done", usd_total: 0.1, ms_total: 1000, meta: { produced_by: 10 } }] }));
    render(<PackList team="fix" run="r1" />);
    await screen.findByTestId("pack-row-1"); expect(screen.getByTestId("pack-row-1")).toHaveTextContent("team saga"); expect(screen.getByTestId("pack-row-2")).toHaveTextContent("The cart");
    await screen.findByTestId("episode-row-11"); expect(screen.getByTestId("episode-row-11")).toHaveTextContent("retry"); expect(screen.getByTestId("episode-row-10")).toHaveTextContent("cart › loop pass 1");
    fireEvent.click(screen.getByTestId("pack-row-2").firstElementChild!); await screen.findByTestId("episode-row-20"); expect(screen.getByTestId("tag-produced")).toBeTruthy();
  });
});

describe("the run tab", () => {
  const baseProps = (run: Run | null, over: any = {}) => ({ graph: bugfix(), report: { errors: [], warnings: [], worst_usd: 1, budget_usd: 2 }, run, onEdit: vi.fn(), onRun: vi.fn().mockResolvedValue(null), onChanged: vi.fn(), ...over });
  it("says Needs you at a human node, and approving is the person's click", async () => {
    const run = mkRun({ active: { me: 1 } }, [], { park_info: { me: "merge" } }); const props = baseProps(run); renderT(<TeamRun {...props} />);
    expect(screen.getByTestId("needs-you")).toHaveTextContent("Merge the pack into your workspace"); expect(screen.getByTestId("gate-risk")).toHaveAttribute("data-risk", "high"); fireEvent.click(screen.getByTestId("approve"));
    await waitFor(() => expect(api.answerAt).toHaveBeenCalledWith("fix-1", "me", true)); await waitFor(() => expect(props.onChanged).toHaveBeenCalled()); expect(await screen.findByTestId("run-note")).toHaveTextContent("landed");
  });
  it("shows a refusal to land in words, and a run handed to the person with its reason", async () => {
    api.answerAt.mockResolvedValue({ ok: false, error: "the workspace has uncommitted changes" }); renderT(<TeamRun {...baseProps(mkRun({ active: { me: 1 } }, [], { park_info: { me: "merge" } }))} />); fireEvent.click(screen.getByTestId("approve"));
    expect(await screen.findByTestId("gate-error")).toHaveTextContent("uncommitted changes"); expect(screen.queryByTestId("run-note")).toBeNull(); cleanup();
    renderT(<TeamRun {...baseProps(mkRun({ status: { status: "blocked", why: "the budget is spent" } }, [], { live: false }))} />); expect(screen.getByTestId("handed-over")).toHaveTextContent("the budget is spent"); { const { RunFacts } = await import("./RunFacts"); const r = mkRun({ status: { status: "blocked", why: "the budget is spent" } }, [], { live: false }); render(<RunFacts graph={bugfix()} run={r} />); expect(screen.getByTestId("run-status")).toHaveTextContent("handed to you"); expect(screen.getByTestId("graph-kinds")).toHaveTextContent("agents"); }
  });
  it("the view bar is solid (not faint, not draggable) and is drawn in the run picker's row when the pane offers one, else at the top right of the run", () => {
    renderT(<TeamRun {...baseProps(mkRun({ active: {} }, [], { live: false }))} />);
    const bar = screen.getByTestId("run-header"); expect(bar.style.opacity).toBe(""); expect(screen.queryByTestId("run-header-grip")).toBeNull(); expect(bar.style.position).toBe("absolute"); cleanup();
    const slot = document.createElement("div"); slot.setAttribute("data-testid", "slot"); document.body.appendChild(slot);
    render(<ViewBarSlot.Provider value={slot}><TeamRun {...baseProps(mkRun({ active: {} }, [], { live: false }))} /></ViewBarSlot.Provider>);
    expect(slot.contains(screen.getByTestId("run-header"))).toBe(true); expect(screen.getByTestId("run-header").style.position).toBe(""); expect(screen.getByTestId("view-editor")).toBeTruthy(); slot.remove();
  });
  it("the Run tab asks the serve about the workspace at a merge gate and sets the work aside", async () => {
    api.workspaceState.mockResolvedValue({ dirty: ["a.ts"], stashed: false }); api.stashWorkspace.mockResolvedValue({ ok: true });
    renderT(<TeamRun {...baseProps(mkRun({ active: { me: 1 } }, [], { park_info: { me: "merge" } }))} />); expect(await screen.findByTestId("gate-workspace")).toHaveTextContent("1 uncommitted file");
    api.workspaceState.mockResolvedValue({ dirty: [], stashed: true }); fireEvent.click(screen.getByTestId("gate-stash")); await waitFor(() => expect(api.stashWorkspace).toHaveBeenCalledWith("fix-1")); expect(await screen.findByTestId("gate-workspace")).toHaveTextContent("come back by themselves");
  });
  it("the Graph view: a tile per node around the Leader, the header says who needs you and who failed, a click selects, and the choice of view is remembered", async () => {
    try { localStorage.setItem("antiloki.team.view", "graph"); } catch { /* none */ }
    const { hubLayout, providerOf } = await import("./AgentGraph"); const g = bugfix(); const pos = hubLayout(g);
    expect(Object.keys(pos).sort()).toEqual(Object.keys(g.nodes).sort()); for (const p of Object.values(pos)) { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(900); expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(560); }
    const ps = Object.values(pos); for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y)).toBeGreaterThan(60);   // no two tiles sit on each other
    expect(providerOf({ node: "stop", message: "x" } as any)).toBe("stop"); expect(providerOf({ node: "artifact", name: "a", format: "md" } as any)).toBe("doc"); expect(providerOf({ node: "check", on: "x", rules: [] } as any)).toBe("check"); expect(providerOf({ node: "use_tool", tool: { type: "web", name: "w" } } as any)).toBe("web");
    expect(providerOf({ node: "role", role: "worker", model: "codex:" } as any)).toBe("gpt"); expect(providerOf({ node: "role", role: "worker" } as any)).toBe("claude"); expect(providerOf({ node: "human", gate: "merge" } as any)).toBe("you");
    const picked: string[] = []; const run = mkRun({ active: { fix: 1 } }); const { unmount } = renderT(<TeamRun {...baseProps(run)} />);
    expect(screen.getByTestId("agent-graph")).toBeTruthy(); expect(screen.getByTestId("view-graph")).toHaveAttribute("aria-pressed", "true"); expect(screen.getByTestId("ag-node-fix")).toHaveAttribute("data-state", "working");
    expect(screen.queryByTestId("view-canvas")).toBeNull(); fireEvent.click(screen.getByTestId("view-sequence")); expect(localStorage.getItem("antiloki.team.view")).toBe("sequence"); unmount(); void picked;
  });
  it("the Diff timeline counts files over time from the ledger: cumulative files, what was put back, a scrubber that goes back to any moment", async () => {
    const { timelineOf, DiffTimeline } = await import("./DiffTimeline"); const r = mkRun({}, [], { live: false });
    const [n1, n2] = Object.keys(r.graph.nodes).filter((k) => r.graph.nodes[k].node !== "leader"); (r.state.values as any) = { [n1]: { files: ["src/a.ts", "src/b.ts"], put_back: [] }, [n2]: { files: ["src/b.ts", "src/c.ts"], put_back: ["secret.env"] } };
    (r.events as any) = [{ t_ms: r.state.started_ms + 30_000, actor: n1, kind: "done" }, { t_ms: r.state.started_ms + 90_000, actor: n2, kind: "done" }];
    const tl = timelineOf(r); expect(tl.points.map((p: any) => p.files)).toEqual([0, 2, 4]); expect(tl.points[2].put_back).toBe(1); expect(tl.files.map((f: any) => f.name).sort()).toEqual(["secret.env", "src/a.ts", "src/b.ts", "src/c.ts"]);
    render(<DiffTimeline run={r} />); expect(screen.getByTestId("dt-files")).toHaveTextContent("4 files"); expect(screen.getByTestId("dt-putback")).toHaveTextContent("1 put back");
    fireEvent.change(screen.getByTestId("dt-range"), { target: { value: "40000" } }); expect(screen.getByTestId("dt-files")).toHaveTextContent("2 files"); expect(screen.queryByTestId("dt-putback")).toBeNull(); expect(screen.queryByTestId("dt-file-src/c.ts")).toBeNull();
  });
  it("the week reads cron lines: a day's cards in time order, a trigger that fires often is one card, and an unreadable line is left out", async () => {
    const { cronMinutes, weekPlan, ScheduleWeek } = await import("./ScheduleWeek"); const mon = new Date(2026, 10, 16);   // a Monday
    expect(cronMinutes("0 8 * * *", mon)).toEqual([480]); expect(cronMinutes("0 8 * * 1-5", new Date(2026, 10, 21))).toEqual([]); expect(cronMinutes("30 9,17 * * 1", mon)).toEqual([570, 1050]); expect(cronMinutes("*/15 * * * *", mon).length).toBe(96); expect(cronMinutes("nope", mon)).toEqual([]); expect(cronMinutes("0 25 * * *", mon)).toEqual([]);
    const plan = weekPlan([{ id: "a", kind: "schedule", cron: "0 8 * * *", ask: "daily" }, { id: "b", kind: "schedule", cron: "0 * * * *", ask: "hourly" }, { id: "c", kind: "webhook", ask: "x" }, { id: "d", kind: "schedule", cron: "bad", ask: "bad" }], mon);
    expect(plan.length).toBe(7); expect(plan[0].cards.map((c) => c.trigger)).toEqual(["b", "a"].sort((x, y) => (x === "b" ? 0 : 1) - (y === "b" ? 0 : 1))); expect(plan[0].cards.find((c) => c.trigger === "b")!.count).toBe(24); expect(plan[0].cards.some((c) => c.trigger === "c" || c.trigger === "d")).toBe(false);
    render(<ScheduleWeek triggers={[{ id: "a", kind: "schedule", cron: "0 8 * * *", ask: "daily" }]} now={new Date(2026, 10, 16, 7, 0)} usedToday={1} maxToday={4} />);
    expect(screen.getByTestId("schedule-week")).toHaveTextContent("7 runs planned"); expect(screen.getByTestId("week-card-0-0")).toHaveAttribute("data-next", "1"); expect(screen.getByTestId("week-allowance")).toHaveTextContent("1 of 4");
  });
  it("the live report is a document in the order the steps spoke, a working step has a named cursor, and the files it makes are listed", async () => {
    const { reportOf, LiveReport } = await import("./LiveReport"); const r = mkRun({ active: { fix: 1 } }, [], { live: false });
    const ids = Object.keys(r.graph.nodes).filter((k) => r.graph.nodes[k].node !== "leader"); const [n1, n2] = ids;
    (r.events as any) = [{ id: 1, t_ms: r.state.started_ms + 1000, actor: n1, kind: "done", text: "research is back: 412 words" }, { id: 2, t_ms: r.state.started_ms + 5000, actor: n2, kind: "start", text: "" }];
    (r.state as any).active = { [n2]: 1 }; (r.state.values as any) = { [n1]: { files: ["research.md"], artifacts: ["research.md"] } };
    const parts = reportOf(r); expect(parts.map((p: any) => p.node)).toEqual([n1, n2]); expect(parts[0].text).toContain("research is back"); expect(parts[1].working).toBe(true);
    render(<LiveReport run={r} />); expect(screen.getByTestId(`report-part-${n1}`)).toHaveTextContent("research is back"); expect(screen.getByTestId(`report-cursor-${n2}`)).toBeTruthy(); expect(screen.getByTestId(`report-part-${n2}`)).toHaveTextContent("writing · $0.00"); expect(screen.getByTestId("report-state")).toHaveTextContent("1 writing");
    cleanup(); const e = mkRun({}, [], { live: false }); (e.events as any) = []; (e.state as any).active = {}; render(<LiveReport run={e} />); expect(screen.getByTestId("report-empty")).toBeTruthy();
  });
  it("thinking: a working step has a live panel with its time and the tools it used; a finished one folds to one line that opens again", async () => {
    const { Thinking, thoughtMs, words } = await import("./Thinking"); const r = mkRun({}, [], { live: false }); const ids = Object.keys(r.graph.nodes).filter((k) => r.graph.nodes[k].node !== "leader"); const [a, b] = ids;
    (r.events as any) = [{ id: 1, t_ms: 10_000, actor: a, kind: "start", text: "" }, { id: 2, t_ms: 22_000, actor: a, kind: "done", text: "ok" }, { id: 3, t_ms: 25_000, actor: b, kind: "start", text: "" }];
    (r.state as any).active = { [b]: 1 }; (r.state as any).now_ms = 31_000; (r as any).tools_live = { [a]: [{ tool: "Read", summary: "research.md", t_ms: 11_000 }], [b]: [{ tool: "Write", summary: "promo.md", t_ms: 28_000 }] }; (r.state.values as any) = { [a]: { ok: true } };
    expect(thoughtMs(r, a, 31_000)).toBe(12_000); expect(thoughtMs(r, b, 31_000)).toBe(6_000); expect(words(12_000)).toBe("12 s");
    render(<Thinking graph={r.graph} run={r} />); expect(screen.getByTestId(`thinking-time-${b}`)).toHaveTextContent("6 s"); expect(screen.getByTestId(`thought-${a}`)).toHaveTextContent("thought for 12 s · 1 step");
    fireEvent.click(screen.getByTestId(`thought-toggle-${a}`)); expect(screen.getByTestId(`thought-${a}`)).toHaveTextContent("Read");
  });
  it("opens the inside of a node from the canvas", async () => {
    renderT(<TeamRun {...baseProps(mkRun({ active: { fix: 1 } }))} />); expect(screen.queryByTestId("circuit-toggle")).toBeNull(); fireEvent.click(screen.getByTestId("node-fix")); expect(await screen.findByTestId("node-interior")).toHaveAttribute("data-node", "fix");
  });
  it("has no ask field (the Leader is the only way to talk to a team) and says why a team cannot run", async () => {
    const { unmount } = renderT(<TeamRun {...baseProps(null)} />); expect(screen.queryByTestId("run-ask")).toBeNull(); expect(screen.queryByTestId("run-go")).toBeNull(); unmount();
    renderT(<TeamRun {...baseProps(null, { report: { errors: [{ code: "x", node: null, message: "the loop has no limit" }], warnings: [], worst_usd: 0, budget_usd: 2 } })} />); expect(screen.getByTestId("run-blocked")).toHaveTextContent("the loop has no limit");
  });
  it("pauses, resumes and stops a live run", async () => {
    const props = baseProps(mkRun()); const { unmount } = renderT(<TeamRun {...props} />); fireEvent.click(screen.getByTestId("run-pause")); await waitFor(() => expect(api.controlRun).toHaveBeenCalledWith("fix-1", "pause")); fireEvent.click(screen.getByTestId("run-stop")); await waitFor(() => expect(api.controlRun).toHaveBeenCalledWith("fix-1", "stop")); unmount();
    renderT(<TeamRun {...baseProps(mkRun({ status: { status: "paused" } }))} />); fireEvent.click(screen.getByTestId("run-resume")); await waitFor(() => expect(api.controlRun).toHaveBeenCalledWith("fix-1", "resume"));
  });
});

describe("a node's drawer", () => {
  it("shows a role's read-only terminal with its attempts, changes its model for the next attempt, and sets a cap", async () => {
    render(<NodeDrawer graph={bugfix()} run={mkRun()} id="fix" onClose={vi.fn()} />); expect(screen.getByTestId("drawer-banner")).toHaveTextContent("The team drives this agent");
    await waitFor(() => expect(screen.getByTestId("drawer-terminal")).toHaveTextContent("second try text")); /* the latest attempt shows first */ fireEvent.click(screen.getByTestId("attempt-1")); expect(screen.getByTestId("drawer-terminal")).toHaveTextContent("I patched it");
    fireEvent.change(screen.getByTestId("drawer-model"), { target: { value: "claude-sonnet-5-5" } }); fireEvent.click(screen.getByTestId("drawer-model-next")); await waitFor(() => expect(api.editNode).toHaveBeenCalledWith({ run: "fix-1" }, "fix", { model: "claude-sonnet-5-5" })); expect(await screen.findByTestId("drawer-msg")).toHaveTextContent("next attempt");
    fireEvent.change(screen.getByTestId("drawer-cap"), { target: { value: "0.5" } }); fireEvent.click(screen.getByTestId("drawer-cap-save")); await waitFor(() => expect(api.editNode).toHaveBeenCalledWith({ run: "fix-1" }, "fix", { cap_usd: 0.5 }));
  });
  it("shows a tool's call and typed result with no model and no conversation, and says where a failure goes", async () => {
    api.nodeView.mockResolvedValue({ node: "tests", attempts: [], output: { exit: 1 }, cost_usd: 0, active: false });
    const g = bugfix(); g.edges.push(E("tests", "error", "me")); render(<NodeDrawer graph={g} run={mkRun({ values: { tests: { ok: false, exit: 1, failed: ["cart renders"] } } })} id="tests" onClose={vi.fn()} />);
    expect(screen.getByText(/A tool node has no conversation/)).toBeTruthy(); expect(screen.queryByTestId("drawer-banner")).toBeNull(); expect(screen.getByTestId("drawer-output")).toHaveTextContent("cart renders"); expect(screen.getByText("→ me")).toBeTruthy(); expect(screen.getByText("$0.00 · no model")).toBeTruthy();
  });
  it("takes over by pausing the run and tells the Leader", async () => { render(<NodeDrawer graph={bugfix()} run={mkRun()} id="fix" onClose={vi.fn()} />); fireEvent.click(screen.getByTestId("drawer-takeover")); await waitFor(() => expect(api.controlRun).toHaveBeenCalledWith("fix-1", "pause")); expect(await screen.findByTestId("drawer-msg")).toHaveTextContent("paused"); });
});

describe("the editor", () => {
  const catalog = () => ({ templates: ["feature", "bugfix"], tiers: ["low", "mid", "high"], effects: [], tool_types: [], failure_ports: [], roles: [], nodes: [
    { id: "worker", family: "role", label: "Worker", hint: "does an episode", icon: "worker", default: { node: "role", role: "worker", owns: ["src/**"] }, ports: ["out"], required: ["out"], failure_ports: [], writes: [], tier: "low" },
    { id: "timer", family: "control", label: "timer", hint: "delay", icon: "timer", default: { node: "timer", mode: "delay", seconds: 60 }, ports: ["out"], required: ["out"], failure_ports: [], writes: [], tier: null },
    { id: "tool_webapp", family: "tool", label: "web app", hint: "later", icon: "globe", default: { node: "use_tool", tool: { type: "webapp", name: "linear" } }, ports: ["out"], required: [], failure_ports: [], writes: [], tier: null }] });
  beforeEach(() => { api.loadCatalog.mockResolvedValue(catalog()); api.validateGraph.mockResolvedValue({ ok: true, report: { errors: [], warnings: [{ code: "silent_failure_edge", node: "tests", message: "if tests fails, nothing catches it" }], worst_usd: 1.2, budget_usd: 2 }, words: [] }); api.getTeam.mockResolvedValue({ graph: bugfix(), report: null, runs: [] }); api.saveGraph.mockImplementation(async (g: Graph) => ({ ok: true, graph: g, report: { errors: [], warnings: [], worst_usd: 1, budget_usd: 2 }, diff: null, created: false })); });
  it("adds a BLANK node (an agent with nothing written in it) and turns any node into another kind from the inspector, keeping its place", async () => {
    const c: any = catalog(); c.nodes.push({ id: "agent", family: "role", label: "Agent", hint: "a custom agent", icon: "agent", default: { node: "role", role: "agent", agent: { title: "Agent", responsibility: "x", brief: "y", mcp: [] }, readonly: true }, ports: ["out"], required: ["out"], failure_ports: [], writes: [] }); api.loadCatalog.mockResolvedValue(c);
    render(<TeamEdit team="fix" graph={bugfix()} onSaved={vi.fn()} onBack={vi.fn()} />); await screen.findByTestId("palette-blank"); fireEvent.click(screen.getByTestId("palette-blank"));
    const id = Object.keys((await screen.findByTestId("edit-json")).textContent ? JSON.parse(screen.getByTestId("edit-json").textContent!).nodes : {}).find((k) => k.startsWith("blank")); expect(id).toBeTruthy();
    expect(screen.getByTestId("edit-json").textContent).toContain('"title": "Blank node"'); expect(screen.getByTestId("edit-json").textContent).not.toContain('"brief": "y"');
    const turn = await screen.findByTestId("turn-into") as HTMLSelectElement; fireEvent.change(turn, { target: { value: "timer" } }); const after = JSON.parse(screen.getByTestId("edit-json").textContent!).nodes[id!]; expect(after.node).toBe("timer"); expect(after.seconds).toBe(60);
  });
  it("adds a node from the palette, marks the draft, validates in plain words, undoes, and saves", async () => {
    const onSaved = vi.fn(); render(<TeamEdit team="fix" graph={bugfix()} onSaved={onSaved} onBack={vi.fn()} />);
    await screen.findByTestId("palette-timer"); expect(screen.getByTestId("palette-tool_webapp")).toHaveAttribute("draggable", "true"); expect(screen.getByTestId("edit-state")).toHaveTextContent("saved");
    fireEvent.click(screen.getByTestId("palette-timer")); expect(screen.getByTestId("edit-state")).toHaveTextContent("draft"); expect(screen.getByTestId("node-timer")).toBeTruthy(); expect(screen.getByTestId("inspector")).toHaveAttribute("data-node", "timer");
    await screen.findByText(/nothing catches it/); expect(screen.getByTestId("worst")).toHaveTextContent("$1.20"); expect(screen.getByTestId("edit-json")).toHaveTextContent('"timer"');
    fireEvent.click(screen.getByTestId("edit-undo")); expect(screen.queryByTestId("node-timer")).toBeNull(); fireEvent.click(screen.getByTestId("palette-worker")); expect(screen.getByTestId("node-worker")).toBeTruthy();
    fireEvent.click(screen.getByTestId("edit-save")); await waitFor(() => expect(api.saveGraph).toHaveBeenCalled()); expect((api.saveGraph.mock.calls[0][0] as Graph).nodes.worker).toBeTruthy(); await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
  it("offers every family the serve sends, and edits the nodes of RFC 0011 through the inspector", async () => {
    const cat = catalog(); (cat.nodes as any[]).push(
      { id: "code", family: "transform", label: "code", hint: "Rhai sandbox", icon: "code", default: { node: "code", source: "#{}", examples: [{ input: {}, output: {} }] }, ports: ["out"], required: ["out"], failure_ports: [], writes: [], tier: null },
      { id: "for_each", family: "control", label: "for each", hint: "each item", icon: "foreach", default: { node: "for_each", over: "plan.sagas" }, ports: ["body", "done"], required: ["body", "done"], failure_ports: [], writes: [], tier: null },
      { id: "sub_team", family: "flow", label: "sub-team", hint: "runs another team", icon: "subteam", default: { node: "sub_team", team: "other-team", ask: "{ask}", outputs: {} }, ports: ["out"], required: ["out"], failure_ports: [], writes: [], tier: null });
    api.loadCatalog.mockResolvedValue(cat);
    render(<TeamEdit team="fix" graph={bugfix()} onSaved={vi.fn()} onBack={vi.fn()} />);
    await screen.findByTestId("palette-code"); expect(screen.getByTestId("palette-sub_team")).toBeTruthy();   // a family the editor did not know has its own group, not a hole
    fireEvent.click(screen.getByTestId("palette-code")); expect(screen.getByTestId("inspector")).toHaveAttribute("data-node", "code");
    fireEvent.change(screen.getByTestId("ins-code-source"), { target: { value: "#{ price: 18 }" } }); expect(screen.getByTestId("edit-json")).toHaveTextContent("price: 18");
    fireEvent.change(screen.getByTestId("ins-code-examples"), { target: { value: "[{ nope" } }); expect(screen.getByTestId("ins-code-examples-bad")).toBeTruthy();   // the node keeps its last good examples
    fireEvent.change(screen.getByTestId("ins-code-examples"), { target: { value: '[{"input":{},"output":{"price":18}}]' } }); expect(screen.queryByTestId("ins-code-examples-bad")).toBeNull();
    fireEvent.click(screen.getByTestId("palette-sub_team")); expect(screen.getByTestId("inspector")).toHaveAttribute("data-node", "sub_team");
    fireEvent.change(screen.getByTestId("ins-subteam-team"), { target: { value: "Pricing" } }); fireEvent.change(screen.getByTestId("ins-subteam-share"), { target: { value: "0.4" } });
    expect(screen.getByTestId("edit-json")).toHaveTextContent('"team": "Pricing"'); expect(screen.getByTestId("edit-json")).toHaveTextContent('"budget_share": 0.4');
    // the data tools: the type is one of the options and its call is edited as JSON
    fireEvent.click(screen.getByTestId("palette-tool_webapp")); expect(screen.getByTestId("ins-tool-type")).toHaveValue("webapp"); const opts = Array.from(screen.getByTestId("ins-tool-type").querySelectorAll("option")).map((o) => o.getAttribute("value")); expect(opts).toEqual(expect.arrayContaining(["db", "file", "saga", "webapp"]));
    fireEvent.change(screen.getByTestId("ins-tool-type"), { target: { value: "db" } }); fireEvent.change(screen.getByTestId("ins-tool-args"), { target: { value: '{"kind":"sqlite","op":"query","sql":"SELECT 1 WHERE ? = ?","params":[1,1]}' } });
    expect(screen.getByTestId("edit-json")).toHaveTextContent('"type": "db"'); expect(screen.getByTestId("edit-json")).toHaveTextContent('"op": "query"');
    // the new kinds of tools: MCP by address, an http API, git, and Telegram with its token stored by name
    expect(opts).toEqual(expect.arrayContaining(["mcp_url", "api", "git", "telegram"]));
    fireEvent.change(screen.getByTestId("ins-tool-type"), { target: { value: "telegram" } }); fireEvent.change(screen.getByTestId("ins-tg-chat"), { target: { value: "-100123" } }); fireEvent.change(screen.getByTestId("ins-tg-text"), { target: { value: "Ready: {ask}" } }); fireEvent.change(screen.getByTestId("ins-tg-token"), { target: { value: "my-bot" } });
    expect(screen.getByTestId("edit-json")).toHaveTextContent('"type": "telegram"'); expect(screen.getByTestId("edit-json")).toHaveTextContent('"token": "my-bot"'); expect(screen.getByTestId("edit-json")).toHaveTextContent('"name": "send"');
    cowork.appSignIn.mockResolvedValue({ ok: true, signed_in: true }); fireEvent.change(screen.getByTestId("ins-tg-token-value"), { target: { value: "123:SECRET" } }); fireEvent.click(screen.getByTestId("ins-tg-token-save"));
    await waitFor(() => expect(cowork.appSignIn).toHaveBeenCalledWith("my-bot", "123:SECRET")); expect(await screen.findByTestId("ins-tg-token-msg")).toHaveTextContent("stored"); expect((screen.getByTestId("ins-tg-token-value") as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("edit-json")).not.toHaveTextContent("SECRET");   // the token is never part of the team
    // the loop-like nodes got their new settings
    fireEvent.click(screen.getByTestId("palette-for_each")); expect(screen.getByTestId("ins-batch")).toBeTruthy(); fireEvent.change(screen.getByTestId("ins-batch"), { target: { value: "5" } }); fireEvent.change(screen.getByTestId("ins-on-error"), { target: { value: "collect" } });
    expect(screen.getByTestId("edit-json")).toHaveTextContent('"batch": 5'); expect(screen.getByTestId("edit-json")).toHaveTextContent('"on_error": "collect"');
  });
  it("edits a node's fields through the inspector and the tool's allow-list, with the destructive effect flagged", async () => {
    render(<TeamEdit team="fix" graph={bugfix()} onSaved={vi.fn()} onBack={vi.fn()} />); await screen.findByTestId("palette-timer"); fireEvent.click(screen.getByTestId("node-loop"), {}); fireEvent.pointerDown(screen.getByTestId("node-loop").firstElementChild!, { clientX: 1, clientY: 1 }); fireEvent.pointerUp(screen.getByTestId("board"));
    expect(await screen.findByTestId("inspector")).toHaveAttribute("data-node", "loop"); fireEvent.change(screen.getByTestId("ins-max"), { target: { value: "6" } }); expect(screen.getByTestId("edit-json")).toHaveTextContent('"max_iterations": 6');
    fireEvent.pointerDown(screen.getByTestId("node-tests").firstElementChild!, { clientX: 1, clientY: 1 }); fireEvent.pointerUp(screen.getByTestId("board")); await waitFor(() => expect(screen.getByTestId("inspector")).toHaveAttribute("data-node", "tests"));
    expect(screen.getByTestId("effect-destructive")).toHaveTextContent("⚑"); fireEvent.click(screen.getByTestId("effect-write")); expect(screen.getByTestId("edit-json")).toHaveTextContent('"write"');
  });
  it("simulates with stubs and shows the path, the passes and the worst case; refuses to simulate an invalid graph", async () => {
    api.simulateTeam.mockResolvedValue({ ok: true, sim: { path: ["loop", "tests", "deliver"], passes: { loop: 2 }, outcome: "delivered", spent_usd: 0, worst_usd: 1.2, trace: [] }, report: { errors: [], warnings: [], worst_usd: 1, budget_usd: 2 } });
    render(<TeamEdit team="fix" graph={bugfix()} onSaved={vi.fn()} onBack={vi.fn()} />); await screen.findByTestId("palette-timer"); fireEvent.change(screen.getByTestId("sim-stubs"), { target: { value: '{"tests": [{"exit": 1}, {"exit": 0}]}' } }); await screen.findByText(/nothing catches it/); fireEvent.click(screen.getByTestId("sim-run"));
    await waitFor(() => expect(api.simulateTeam).toHaveBeenCalled()); expect(api.simulateTeam.mock.calls[0][0].stubs).toEqual({ tests: [{ exit: 1 }, { exit: 0 }] }); expect(await screen.findByTestId("sim-outcome")).toHaveTextContent("delivered"); expect(screen.getByTestId("sim-result")).toHaveTextContent("loop: 2 passes"); expect(screen.getByTestId("sim-result")).toHaveTextContent("worst case $1.20");
    api.validateGraph.mockResolvedValue({ ok: true, report: { errors: [{ code: "loop_unbounded", node: "loop", message: "the loop loop has no limit" }], warnings: [], worst_usd: 0, budget_usd: 2 }, words: [] }); fireEvent.click(screen.getByTestId("palette-worker")); await screen.findByText(/has no limit/); expect(screen.getByTestId("sim-run")).toBeDisabled();
  });
});

describe("the team pane", () => {
  it("picks the run that is going, else the latest of this team", () => {
    const rows = [{ id: "a", team: "fix", started_ms: 1 }, { id: "b", team: "fix", started_ms: 3 }, { id: "c", team: "other", started_ms: 9 }]; expect(pickRun(rows, ["a"], "Fix")).toBe("a"); expect(pickRun(rows, [], "fix")).toBe("b"); expect(pickRun(rows, [], "none")).toBeNull(); expect(pickRun([{ id: "n", team: "Checkout pack", started_ms: 1 }], [], "checkout-pack")).toBe("n");   // the door names a run's team as the graph does, with its capitals and spaces
  });
  it("the team's top bar has the Fork button that opens the threads window; Chat is the first view of the view bar and shows the Leader; the floating menu and the other tabs are gone", async () => {
    try { localStorage.setItem("antiloki.team.tab.fix", "run"); localStorage.setItem("antiloki.team.view", "graph"); } catch { /* none */ }
    api.getTeam.mockResolvedValue({ graph: bugfix(), report: { errors: [], warnings: [], worst_usd: 1, budget_usd: 2 }, runs: [] }); api.listTeams.mockResolvedValue({ graphs: [], runs: [], live: [] });
    const { unmount } = render(<TeamPane team="fix" leader={<div data-testid="leader-term" />} />); await screen.findByTestId("team-run");
    expect(screen.queryByTestId("team-menu")).toBeNull(); expect(screen.queryByTestId("team-switch")).toBeNull(); for (const k of ["activity", "edit", "result", "sagas", "xray", "run", "leader"]) expect(screen.queryByTestId(`tab-${k}`)).toBeNull();
    const views = within(screen.getByRole("group", { name: "view of the run" })).getAllByRole("button").map((b) => b.getAttribute("data-testid")); expect(views).toEqual(["view-chat", "view-graph", "view-editor", "view-sequence"]);
    expect(screen.getByTestId("view-graph")).toHaveAttribute("aria-pressed", "true"); expect(screen.getByTestId("view-chat")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("team-fork-window").style.display).toBe("none"); fireEvent.click(screen.getByTestId("team-fork")); expect(screen.getByTestId("team-fork-window").style.display).toBe("block");
    fireEvent.click(screen.getByTestId("view-chat")); expect(screen.getByTestId("view-chat")).toHaveAttribute("aria-pressed", "true"); expect(screen.getByTestId("view-graph")).toHaveAttribute("aria-pressed", "false"); expect(localStorage.getItem("antiloki.team.tab.fix")).toBe("leader"); expect(screen.queryByTestId("team-run")).toBeNull();
    fireEvent.click(screen.getByTestId("view-graph")); expect(localStorage.getItem("antiloki.team.tab.fix")).toBe("run"); expect(await screen.findByTestId("team-run")).toBeTruthy(); unmount();
  });

  it("the approval is the decision card: the question and its risk on the left, the answers as numbered branches, keys 1 and 2 (and A / D) answer", async () => {
    const { ApprovalCard } = await import("./ApprovalCard"); const answers: boolean[] = [];
    render(<ApprovalCard gate="merge" node="accept" onAnswer={(a) => { answers.push(a); }} />);
    expect(screen.getByTestId("gate-risk")).toHaveAttribute("data-risk", "high"); expect(screen.getByTestId("approve")).toHaveTextContent("1"); expect(screen.getByTestId("deny")).toHaveTextContent("2");
    fireEvent.keyDown(window, { key: "1" }); fireEvent.keyDown(window, { key: "2" }); expect(answers).toEqual([true, false]);
    fireEvent.click(screen.getByTestId("deny")); expect(answers).toEqual([true, false, false]); cleanup();
    const quiet: boolean[] = []; render(<ApprovalCard gate="merge" node="accept" busy onAnswer={(a) => { quiet.push(a); }} />); fireEvent.keyDown(window, { key: "1" }); expect(quiet).toEqual([]);
  });
  it("the editor opens on the Flow: steps in order, a + on each line adds a step there (the rest of the line goes through it), the Board is one click away", async () => {
    const { insertAfter } = await import("./model"); const g = bugfix(); const order = Object.keys(g.nodes);
    const from = g.edges.find((e) => g.nodes[e.from] && !["failed", "error", "timeout", "cap", "budget", "human"].includes(e.port))!; const next = insertAfter(g, from.from, "newstep", { node: "stop", message: "x" } as any);
    expect(next.nodes.newstep).toBeTruthy(); expect(next.edges.some((e) => e.from === from.from && e.to === "newstep")).toBe(true); expect(next.edges.some((e) => e.from === from.from && e.to === from.to)).toBe(false); expect(next.edges.some((e) => e.from === "newstep" && e.to === from.to)).toBe(true); expect(Object.keys(g.nodes)).toEqual(order);
    try { localStorage.setItem("antiloki.team.edit.mode", "flow"); } catch { /* none */ }
    api.getTeam.mockResolvedValue({ graph: g, report: { errors: [], warnings: [], worst_usd: 1, budget_usd: 2 }, runs: [] }); api.listTeams.mockResolvedValue({ graphs: [], runs: [], live: [] });
    api.loadCatalog.mockResolvedValue({ templates: [], tiers: ["low", "mid", "high"], effects: [], tool_types: [], failure_ports: [], roles: [], nodes: [{ id: "stop", family: "control", label: "Stop", hint: "", icon: "stop", default: { node: "stop", message: "done" }, ports: [], required: [], failure_ports: [], writes: [] }] });
    const { TeamEdit } = await import("./TeamEdit"); const { unmount } = render(<TeamEdit team="fix" graph={g} onSaved={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByTestId("flow-editor")).toBeTruthy(); const firstAdd = screen.getAllByTestId(/^flow-add-/)[0]; fireEvent.click(firstAdd); fireEvent.click(await screen.findByTestId("flow-new-stop"));
    await waitFor(() => expect(screen.getByTestId("edit-state")).toHaveTextContent("draft")); fireEvent.click(screen.getByTestId("edit-mode-board")); expect(await screen.findByTestId("board")).toBeTruthy(); unmount();
  });
  it("the Chat option shows a dot when the Leader asks for you or works, but only while you are on another view", async () => {
    try { localStorage.setItem("antiloki.team.tab.fix", "run"); localStorage.setItem("antiloki.team.view", "graph"); } catch { /* none */ }
    api.getTeam.mockResolvedValue({ graph: bugfix(), report: { errors: [], warnings: [], worst_usd: 1, budget_usd: 2 }, runs: [] }); api.listTeams.mockResolvedValue({ graphs: [], runs: [], live: [] });
    const { unmount } = render(<TeamPane team="fix" leader={<div data-testid="leader-term">term</div>} leaderDot="blocked" />); await screen.findByTestId("team-run");
    expect(screen.getByTestId("leader-dot-blocked")).toBeTruthy(); fireEvent.click(screen.getByTestId("view-chat")); expect(screen.queryByTestId("leader-dot-blocked")).toBeNull(); expect(screen.getByTestId("leader-term")).toBeTruthy(); unmount();
  });
  it("opens on the graph, shows the team's branch in the fork window, and says a team is not there", async () => {
    api.getTeam.mockResolvedValue({ graph: bugfix(), report: { errors: [], warnings: [], worst_usd: 1, budget_usd: 2 }, runs: [] }); api.listTeams.mockResolvedValue({ graphs: [], runs: [], live: [] });
    const { unmount } = render(<TeamPane team="fix" />); await screen.findByTestId("team-run"); expect(screen.getByTestId("team-fork-window")).toHaveTextContent("team/fix"); unmount(); cleanup();
    api.getTeam.mockResolvedValue(null); render(<TeamPane team="ghost" />); expect(await screen.findByTestId("team-error")).toHaveTextContent("no team called ghost");
  });
});


// ── RFC 0008 §4.16 and the agent themes ──
import { AgentFace, DEFAULT_THEME, THEMES, faceSvg, getAgentTheme, setAgentTheme } from "./themes";
import { TeamSkills, draftsOf } from "./TeamSkills";
import { nameFromGoal, pendingKey } from "./NewTeam";
import { codeOf, faceOf, leaderOf, letterOf, titleOf } from "./model";

const agentGraph = (): Graph => ({ team: "Marketing", schema: 1, branch: "team/marketing", budget_usd: 4, nodes: { leader: { node: "leader" }, copy: { node: "role", role: "agent", owns: ["content/**"], agent: { title: "Copywriter", responsibility: "write the posts", brief: "plain and warm", skills: ["voice"], mcp: ["antiloki_panes"], effects: ["read", "write", "outward"] } }, me: { node: "human", gate: "merge" }, deliver: { node: "deliver" } }, edges: [E("copy", "out", "me"), E("me", "approved", "deliver")] });

describe("a custom agent", () => {
  beforeEach(() => { setAgentTheme("microchip"); });
  it("wears its title: the name, the three-letter code, the letter, and one of the drawn characters by its id", () => {
    const g = agentGraph(); const n = g.nodes.copy;
    expect(titleOf("copy", n)).toBe("Copywriter"); expect(codeOf(n)).toBe("COP"); expect(letterOf(n)).toBe("C"); expect(faceOf("copy", n)).toBe(faceOf("copy", n)); expect(["worker", "planner", "qa", "debugger", "audit"]).toContain(faceOf("copy", n));
    expect(codeOf(g.nodes.leader)).toBe("LDR");
  });
  it("is drawn on the board with its title and its job shows in the drawer in plain words, with the outward effect marked", () => {
    const g = agentGraph(); const { unmount } = render(<Board graph={g} run={null} />); expect(screen.getByTestId("node-copy")).toHaveTextContent("COP"); expect(screen.getByTestId("node-copy")).toHaveTextContent("Copywriter"); unmount();
    render(<NodeDrawer graph={g} run={null} id="copy" onClose={vi.fn()} />); const job = screen.getByTestId("agent-job"); expect(job).toHaveTextContent("write the posts"); expect(job).toHaveTextContent("plain and warm"); expect(job).toHaveTextContent("voice"); expect(job).toHaveTextContent("posts, sends or publishes: only after you approve");
  });
  it("is edited in the inspector: its title, its one responsibility and its effects", async () => {
    api.loadCatalog.mockResolvedValue({ nodes: [], templates: [], tiers: [], effects: [], tool_types: [], failure_ports: [], roles: [] }); api.validateGraph.mockResolvedValue({ ok: true, report: { errors: [], warnings: [], worst_usd: 1, budget_usd: 4 }, words: [] });
    render(<TeamEdit team="marketing" graph={agentGraph()} onSaved={vi.fn()} onBack={vi.fn()} />); fireEvent.pointerDown((await screen.findByTestId("node-copy")).firstElementChild!, { clientX: 1, clientY: 1 }); fireEvent.pointerUp(screen.getByTestId("board"));
    const title = await screen.findByTestId("ins-agent-title"); expect(title).toHaveValue("Copywriter"); fireEvent.change(title, { target: { value: "Poster" } }); expect(screen.getByTestId("ins-agent-title")).toHaveValue("Poster");
    expect(screen.getByTestId("ins-agent-resp")).toHaveValue("write the posts"); fireEvent.click(screen.getByTestId("agent-effect-money")); expect(within(screen.getByTestId("agent-fields")).getByText(/human node in front/)).toBeTruthy();
  });
});

describe("the agent themes", () => {
  it("draws every theme for every role and state, escapes a name, and the choice is kept and read back", () => {
    for (const t of THEMES) for (const face of ["leader", "planner", "worker", "qa", "debugger", "audit"] as const) for (const state of ["idle", "working", "waiting", "done", "failed"] as const) { const svg = faceSvg({ theme: t.key, face, code: "WRK", letter: "W", name: "work", state }); expect(svg.startsWith("<svg") && svg.endsWith("</svg>"), `${t.key} ${face} ${state}`).toBe(true); }
    expect(faceSvg({ theme: "prompt", face: "worker", code: "X", letter: "X", name: "<img src=x onerror=1>", state: "idle" })).not.toContain("<img");
    expect(faceSvg({ theme: "dots", face: "worker", code: "C", letter: "C", name: "c", state: "working" })).toContain("tgf-wave"); expect(faceSvg({ theme: "pixel", face: "worker", code: "W", letter: "W", name: "w", state: "working" })).toContain("tgf-bob");
    try { localStorage.removeItem("antiloki.team.agentTheme.v2"); } catch { /* */ } expect(getAgentTheme()).toBe(DEFAULT_THEME); setAgentTheme("pixel"); expect(getAgentTheme()).toBe("pixel"); setAgentTheme("microchip");
  });
  it("redraws the board's agents in the chosen theme: a face and the name beside it, not the package", () => {
    setAgentTheme("pixel"); const { unmount } = render(<Board graph={agentGraph()} run={null} />); const card = screen.getByTestId("node-copy"); expect(within(card).getByTestId("agent-face")).toHaveAttribute("data-face-theme", "pixel"); expect(card).toHaveTextContent("Copywriter"); unmount(); setAgentTheme("microchip");
    render(<AgentFace theme="glyph" face="qa" code="QA" letter="Q" name="qa" state="done" size={30} />); expect(screen.getByTestId("agent-face")).toHaveAttribute("data-face-state", "done");
  });
});

describe("the team's skills", () => {
  const sk = (name: string, status: "draft" | "approved", effects: string[] = ["read"]) => ({ name, purpose: `how to ${name}`, effects, status, body: `1. ${name}\n2. done` });
  it("lists the Leader's drafts with what they let an agent do, and only a click approves one", async () => {
    api.listSkills.mockResolvedValue([sk("voice", "approved"), sk("poster", "draft", ["outward"])]); api.approveSkill.mockResolvedValue({ ok: true });
    const changed = vi.fn(); render(<TeamSkills team="marketing" onChanged={changed} />);
    expect(await screen.findByTestId("team-skills")).toHaveTextContent("1 waits for you"); expect(screen.getByTestId("skill-status-poster")).toHaveTextContent("draft"); expect(screen.getByTestId("skill-status-voice")).toHaveTextContent("approved"); expect(screen.queryByTestId("skill-approve-voice")).toBeNull();
    fireEvent.click(within(screen.getByTestId("skill-poster")).getAllByRole("button")[0]); expect(await screen.findByTestId("skill-body-poster")).toHaveTextContent("1. poster"); expect(screen.getByTestId("skill-poster")).toHaveTextContent("posts, sends or publishes");
    fireEvent.click(screen.getByTestId("skill-approve-poster")); await waitFor(() => expect(api.approveSkill).toHaveBeenCalledWith("marketing", "poster")); await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(draftsOf([sk("a", "draft"), sk("b", "approved")]).map((s) => s.name)).toEqual(["a"]);
  });
  it("says so when there are none, and the run tab holds the run back until the drafts are read", async () => {
    api.listSkills.mockResolvedValueOnce([]); const { unmount } = render(<TeamSkills team="x" />); expect(await screen.findByTestId("team-skills-empty")).toBeTruthy(); unmount();
    api.listSkills.mockResolvedValue([sk("poster", "draft", ["outward"])]); const onEdit = vi.fn();
    renderT(<TeamRun graph={agentGraph()} report={{ errors: [], warnings: [], worst_usd: 1, budget_usd: 4 }} run={null} onEdit={onEdit} onRun={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByTestId("skills-wait")).toHaveTextContent("poster"); fireEvent.click(screen.getByTestId("skills-review")); expect(await screen.findByTestId("skill-panel")).toHaveTextContent("poster"); void onEdit;
  });
});


describe("artifacts", () => {
  const art = (over: Record<string, unknown> = {}) => ({ name: "findings.md", format: "md", bytes: 2048, node: null, kind: "made", t_ms: 1, ...over });
  const withArtifact = (): Graph => { const g = agentGraph(); g.nodes.doc = { node: "artifact", name: "findings", format: "md", from: "copy", title: "Findings" }; return g; };
  it("is a node on the board that names its document, and is edited with a name, a format and the node it comes from", async () => {
    const g = withArtifact(); const { unmount } = render(<Board graph={g} run={null} />); expect(screen.getByTestId("node-doc")).toHaveTextContent("findings.md"); unmount();
    api.loadCatalog.mockResolvedValue({ nodes: [], templates: [], tiers: [], effects: [], tool_types: [], failure_ports: [], roles: [] }); api.validateGraph.mockResolvedValue({ ok: true, report: { errors: [], warnings: [], worst_usd: 1, budget_usd: 4 }, words: [] });
    render(<TeamEdit team="marketing" graph={g} onSaved={vi.fn()} onBack={vi.fn()} />); fireEvent.pointerDown((await screen.findByTestId("node-doc")).firstElementChild!, { clientX: 1, clientY: 1 }); fireEvent.pointerUp(screen.getByTestId("board"));
    expect(await screen.findByTestId("ins-art-name")).toHaveValue("findings"); fireEvent.change(screen.getByTestId("ins-art-name"), { target: { value: "launch plan" } }); expect(screen.getByTestId("ins-art-name")).toHaveValue("launch-plan");
    fireEvent.change(screen.getByTestId("ins-art-format"), { target: { value: "html" } }); expect(screen.getByTestId("ins-art-format")).toHaveValue("html"); expect(screen.getByTestId("ins-art-from")).toHaveValue("copy");
  });
});

describe("the master page", () => {
  it("is a master-page node in the editor: the title and the sections as JSON, kept while the JSON is not valid", async () => {
    const g = agentGraph(); g.nodes.page = { node: "artifact", name: "result", format: "html", compose: { title: "T", sections: [{ title: "Numbers", widgets: [{ type: "kpis", items: [] }] }] } } as any;
    api.loadCatalog.mockResolvedValue({ nodes: [], templates: [], tiers: [], effects: [], tool_types: [], failure_ports: [], roles: [] }); api.validateGraph.mockResolvedValue({ ok: true, report: { errors: [], warnings: [], worst_usd: 1, budget_usd: 4 }, words: [] });
    render(<TeamEdit team="marketing" graph={g} onSaved={vi.fn()} onBack={vi.fn()} />); fireEvent.pointerDown((await screen.findByTestId("node-page")).firstElementChild!, { clientX: 1, clientY: 1 }); fireEvent.pointerUp(screen.getByTestId("board"));
    expect(await screen.findByTestId("ins-page-title")).toHaveValue("T"); expect(screen.queryByTestId("ins-art-from")).toBeNull();
    fireEvent.change(screen.getByTestId("ins-page-sections"), { target: { value: "[{" } }); expect(await screen.findByTestId("ins-page-bad")).toBeTruthy();
    fireEvent.change(screen.getByTestId("ins-page-sections"), { target: { value: "[{\"title\":\"A\",\"widgets\":[]}]" } }); await waitFor(() => expect(screen.queryByTestId("ins-page-bad")).toBeNull());
  });
});

describe("the check node and the why", () => {
  it("is a node on the board named by its rules, edited as what it checks and its rules as JSON, kept while the JSON is not valid", async () => {
    const g = agentGraph(); g.nodes.chk = { node: "check", on: "artifact:report.md", rules: [{ id: "no-offers", kind: "forbid", pattern: "discount" }], why: { kind: "independent_check", note: "no offers" } } as any;
    api.loadCatalog.mockResolvedValue({ nodes: [], templates: [], tiers: [], effects: [], tool_types: [], failure_ports: [], roles: [] }); api.validateGraph.mockResolvedValue({ ok: true, report: { errors: [], warnings: [], worst_usd: 1, budget_usd: 4 }, words: [] });
    render(<TeamEdit team="marketing" graph={g} onSaved={vi.fn()} onBack={vi.fn()} />); expect(await screen.findByTestId("node-chk")).toHaveTextContent("1 rule");
    fireEvent.pointerDown(screen.getByTestId("node-chk").firstElementChild!, { clientX: 1, clientY: 1 }); fireEvent.pointerUp(screen.getByTestId("board"));
    expect(await screen.findByTestId("ins-check-on")).toHaveValue("artifact:report.md"); expect(screen.getByTestId("ins-why")).toHaveValue("independent_check"); expect(screen.getByTestId("ins-why-note")).toHaveValue("no offers");
    fireEvent.change(screen.getByTestId("ins-check-rules"), { target: { value: "[{" } }); expect(await screen.findByTestId("ins-check-bad")).toBeTruthy();
    fireEvent.change(screen.getByTestId("ins-check-rules"), { target: { value: "[]" } }); await waitFor(() => expect(screen.queryByTestId("ins-check-bad")).toBeNull());
    fireEvent.change(screen.getByTestId("ins-why"), { target: { value: "" } }); await waitFor(() => expect(screen.queryByTestId("ins-why-note")).toBeNull());
  });
});

describe("the benchmark of a node", () => {
  const st = (o: object = {}) => ({ n: 8, ok_rate: 0.75, retry_rate: 0.25, climb_rate: 0, cost_median: 0.02, cost_mean: 0.02, ms_median: 11800, last_t: 1, ...o });
  it("shows the node's own record in its drawer: success, retries, cost and its share, time, and what its last change did", async () => {
    api.nodeBench.mockResolvedValue([{ node: "fix", kind: "worker", title: "fix", cfg: "a", seat: "claude-code:low", stats: st(), enough_runs: true, cost_share: 0.62, cost_rank: 1, reliability_rank: 2, cost_per_ok: 0.027, vs_previous_cfg: { verdict: "better", reading: "", old_seat: "x", old: st({ n: 6, ok_rate: 0.5 }), new: st({ n: 8, ok_rate: 0.75 }) }, versions: [] }]);
    render(<NodeDrawer graph={bugfix()} run={null} id="fix" onClose={vi.fn()} />); const b = await screen.findByTestId("node-bench");
    expect(b).toHaveTextContent("75% of 8 runs"); expect(b).toHaveTextContent("62% of the team"); expect(b).toHaveTextContent("#1 by cost"); expect(b).toHaveTextContent("11.8 s"); expect(screen.getByTestId("bench-change")).toHaveTextContent("better (50% over 6 runs before, 75% over 8 since)");
  });
  it("says too few runs under five and shows no block for a node with no record", async () => {
    api.nodeBench.mockResolvedValue([{ node: "fix", kind: "worker", title: "fix", cfg: "a", seat: "s", stats: st({ n: 3 }), enough_runs: false, cost_share: 0, cost_rank: 1, reliability_rank: 1, cost_per_ok: null, vs_previous_cfg: null, versions: [] }]);
    const a = render(<NodeDrawer graph={bugfix()} run={null} id="fix" onClose={vi.fn()} />); expect(await screen.findByTestId("bench-few")).toHaveTextContent("Too few runs to say (3 of 5)"); a.unmount();
    api.nodeBench.mockResolvedValue([]); render(<NodeDrawer graph={bugfix()} run={null} id="fix" onClose={vi.fn()} />); await waitFor(() => expect(api.nodeBench).toHaveBeenCalledTimes(2)); expect(screen.queryByTestId("node-bench")).toBeNull();
  });
});

describe("the model node", () => {
  it("is named by its seat on the board and edited as seat, prompt, typed answer, ladder and safeguards", async () => {
    const g = agentGraph(); g.nodes.pick = { node: "llm", seat: "endpoint:lfm3", prompt: "Classify {ask}", answer: { kind: { enum: ["a", "b"] } }, fallback: ["claude-code:haiku"], verify: { in_source: ["kind"], source: "{ask}" }, agree_with: ["local:qwen3:4b"] } as any;
    api.loadCatalog.mockResolvedValue({ nodes: [], templates: [], tiers: [], effects: [], tool_types: [], failure_ports: [], roles: [] }); api.validateGraph.mockResolvedValue({ ok: true, report: { errors: [], warnings: [], worst_usd: 1, budget_usd: 4 }, words: [] });
    render(<TeamEdit team="marketing" graph={g} onSaved={vi.fn()} onBack={vi.fn()} />); expect(await screen.findByTestId("node-pick")).toHaveTextContent("endpoint:lfm3");
    fireEvent.pointerDown(screen.getByTestId("node-pick").firstElementChild!, { clientX: 1, clientY: 1 }); fireEvent.pointerUp(screen.getByTestId("board"));
    expect(await screen.findByTestId("ins-llm-seat")).toHaveValue("endpoint:lfm3"); expect(screen.getByTestId("ins-llm-fallback")).toHaveValue("claude-code:haiku"); expect(screen.getByTestId("ins-llm-agree")).toHaveValue("local:qwen3:4b"); expect(screen.getByTestId("ins-llm-insource")).toHaveValue("kind");
    fireEvent.change(screen.getByTestId("ins-llm-answer"), { target: { value: "{" } }); expect(await screen.findByTestId("ins-llm-bad")).toBeTruthy(); fireEvent.change(screen.getByTestId("ins-llm-answer"), { target: { value: "{\"n\":\"number\"}" } }); await waitFor(() => expect(screen.queryByTestId("ins-llm-bad")).toBeNull());
  });
});

describe("the Leader is a frontier model", () => {
  it("offers only frontier seats for the Leader (never OpenCode, which can run a local model) and defaults to Claude Code", async () => {
    const { leaderSeats, LEADER_SEATS } = await import("./NewTeam");
    expect(leaderSeats([{ key: "opencode" }, { key: "claude-code" }, { key: "codex" }, { key: "ollama" }, { key: "gemini" }]).map((e) => e.key)).toEqual(["claude-code", "codex", "gemini"]);
    expect(LEADER_SEATS).toContain("claude-code"); expect(LEADER_SEATS).not.toContain("opencode");
  });
});

describe("the web node", () => {
  it("is a globe on the board, named by what it does, and edited with what to look for", async () => {
    const g = agentGraph(); g.nodes.web = { node: "use_tool", tool: { type: "web", name: "search", args: { query: "{ask} coffee" } }, allow: { effects: ["network"] }, starts_model: true };
    const { unmount } = render(<Board graph={g} run={null} />); expect(screen.getByTestId("node-web")).toHaveTextContent("search"); unmount();
    api.loadCatalog.mockResolvedValue({ nodes: [], templates: [], tiers: [], effects: [], tool_types: [], failure_ports: [], roles: [] }); api.validateGraph.mockResolvedValue({ ok: true, report: { errors: [], warnings: [], worst_usd: 1, budget_usd: 4 }, words: [] });
    render(<TeamEdit team="marketing" graph={g} onSaved={vi.fn()} onBack={vi.fn()} />); fireEvent.pointerDown((await screen.findByTestId("node-web")).firstElementChild!, { clientX: 1, clientY: 1 }); fireEvent.pointerUp(screen.getByTestId("board"));
    const q = await screen.findByTestId("ins-web-arg"); expect(q).toHaveValue("{ask} coffee"); fireEvent.change(q, { target: { value: "{ask} news" } }); expect(screen.getByTestId("ins-web-arg")).toHaveValue("{ask} news"); expect(screen.getByTestId("effect-network")).toBeTruthy();
  });
});

describe("the Leader's chip follows the run", () => {
  it("watches while a run goes, is done when it is, and says so when it is handed to the person", () => {
    const run = (status: string, live = true) => mkRun({ status: { status } as any }, [], { live });
    expect(leaderOf(null)).toEqual({ state: "idle", word: "idle" }); expect(leaderOf(run("running"))).toEqual({ state: "working", word: "watching" }); expect(leaderOf(run("running", false)).state).toBe("idle");
    expect(leaderOf(run("paused"))).toEqual({ state: "waiting", word: "paused" }); expect(leaderOf(run("done", false))).toEqual({ state: "done", word: "done" }); expect(leaderOf(run("blocked")).state).toBe("failed"); expect(leaderOf(run("stopped")).word).toBe("stopped");
    const g = agentGraph(); render(<Board graph={g} run={mkRun({ status: { status: "done" } as any }, [], { live: false, graph: g })} />); expect(screen.getByTestId("node-leader")).toHaveTextContent("done"); expect(screen.getByTestId("node-leader")).not.toHaveTextContent("talking");
  });
});

import { TeamTriggers, cronWords, when } from "./TeamTriggers";
describe("a team on its own schedule", () => {
  const status = (over: Record<string, unknown> = {}) => ({ service: false, consented: false, triggers: [{ id: "weekly", cron: "0 8 * * 1", ask: "Weekly note for {date}", budget_usd: 1, missed: "run_once", next_ms: 1_800_000_000_000, last: null }], limits: { max_runs_per_day: 6, max_usd_per_day: 5 }, today: { date: "2026-11-16", runs: 0 }, log: [], ...over });
  it("reads a cron in words, shows the next run, says the background service is off and how to turn it on", async () => {
    expect(cronWords("0 8 * * 1")).toBe("Mondays at 08:00"); expect(cronWords("5 4 * * *")).toBe("5 4 * * *"); expect(when(null)).toBe("never");
    api.triggerStatus.mockResolvedValue(status()); render(<TeamTriggers team="weekly" />);
    expect(await screen.findByTestId("trigger-weekly")).toHaveTextContent("Mondays at 08:00"); expect(screen.getByTestId("service-state")).toHaveTextContent("off"); expect(screen.getByTestId("service-hint")).toHaveTextContent("antiloki-main --service --yes");
  });
  it("consent is a click, a schedule is added from a preset, and Run now starts the team", async () => {
    api.triggerStatus.mockResolvedValue(status({ service: true })); api.consentTriggers.mockResolvedValue({ ok: true, ...status({ service: true, consented: true }) }); api.setTriggers.mockResolvedValue({ ok: true, ...status({ service: true }) }); api.fireTrigger.mockResolvedValue({ ok: true, run: "weekly-1" });
    render(<TeamTriggers team="weekly" />); expect(await screen.findByTestId("service-state")).toHaveTextContent("on"); expect(screen.queryByTestId("service-hint")).toBeNull();
    fireEvent.click(screen.getByTestId("trigger-consent")); await waitFor(() => expect(api.consentTriggers).toHaveBeenCalledWith("weekly", true)); await waitFor(() => expect((screen.getByTestId("trigger-consent") as HTMLInputElement).checked).toBe(true));
    fireEvent.change(screen.getByTestId("trigger-ask"), { target: { value: "Daily brief {date}" } }); fireEvent.change(screen.getByTestId("trigger-preset"), { target: { value: "weekdays" } }); fireEvent.click(screen.getByTestId("trigger-add"));
    await waitFor(() => expect(api.setTriggers).toHaveBeenCalled()); const sent = api.setTriggers.mock.calls[0][1]; expect(sent.map((t: any) => t.cron)).toEqual(["0 8 * * 1", "0 8 * * 1-5"]); expect(sent[1].ask).toBe("Daily brief {date}");
    fireEvent.click(screen.getByTestId("trigger-fire-weekly")); await waitFor(() => expect(api.fireTrigger).toHaveBeenCalledWith("weekly", "weekly"));
  });
  it("says why a schedule was refused", async () => { api.triggerStatus.mockResolvedValue(status()); api.setTriggers.mockResolvedValue({ ok: false, error: "a cron has five fields" }); render(<TeamTriggers team="weekly" />); fireEvent.change(await screen.findByTestId("trigger-ask"), { target: { value: "x" } }); fireEvent.change(screen.getByTestId("trigger-preset"), { target: { value: "custom" } }); fireEvent.change(screen.getByTestId("trigger-cron"), { target: { value: "nope" } }); fireEvent.click(screen.getByTestId("trigger-add")); expect(await screen.findByText(/five fields/)).toBeTruthy(); });

describe("a webhook trigger, and a save that keeps every kind of trigger", () => {
  const withRaw = () => { const raw = [{ id: "docs", kind: "file_watch", watch: "docs/**/*.md", ask: "Review", budget_usd: 0.5 }, { id: "hook1", kind: "webhook", ask: "Handle it", token_hash: "a".repeat(64) }];
    return { service: true, consented: false, raw, triggers: [{ id: "docs", kind: "file_watch", watch: "docs/**/*.md", cron: "", ask: "Review", missed: "run_once", next_ms: null, last: null }, { id: "hook1", kind: "webhook", cron: "", ask: "Handle it", missed: "run_once", next_ms: null, last: null }], limits: { max_runs_per_day: 6, max_usd_per_day: 5 }, today: { date: "2026-11-16", runs: 0 }, log: [] }; };
  it("names what each trigger waits for and sends every trigger back untouched when one is removed", async () => {
    api.triggerStatus.mockResolvedValue(withRaw()); api.setTriggers.mockResolvedValue({ ok: true, ...withRaw() });
    render(<TeamTriggers team="hooked" />); expect(await screen.findByTestId("trigger-docs")).toHaveTextContent("files docs/**/*.md"); expect(screen.getByTestId("trigger-hook1")).toHaveTextContent("webhook hook1");
    fireEvent.click(screen.getByTestId("trigger-remove-docs")); await waitFor(() => expect(api.setTriggers).toHaveBeenCalled());
    expect(api.setTriggers.mock.calls[0][1]).toEqual([{ id: "hook1", kind: "webhook", ask: "Handle it", token_hash: "a".repeat(64) }]);   // the webhook keeps its kind and its token hash
  });
  it("adds a webhook, makes its token, shows it once with the address and the header", async () => {
    api.triggerStatus.mockResolvedValue({ ...withRaw(), raw: [], triggers: [] }); api.setTriggers.mockResolvedValue({ ok: true, ...withRaw() }); api.webhookToken.mockResolvedValue({ ok: true, token: "alh_secret123", path: "/api/v1/hooks/team/hooked/hook1", note: "" });
    render(<TeamTriggers team="hooked" />); fireEvent.change(await screen.findByTestId("trigger-ask"), { target: { value: "Handle the form" } }); fireEvent.click(screen.getByTestId("trigger-add-webhook"));
    await waitFor(() => expect(api.webhookToken).toHaveBeenCalledWith("hooked", "hook1")); const sent = api.setTriggers.mock.calls[0][1]; expect(sent[0]).toMatchObject({ id: "hook1", kind: "webhook", ask: "Handle the form" });
    const box = await screen.findByTestId("webhook-token"); expect(box).toHaveTextContent("alh_secret123"); expect(box).toHaveTextContent("X-Antiloki-Token"); expect(box).toHaveTextContent("/api/v1/hooks/team/hooked/hook1");
    fireEvent.click(screen.getByTestId("webhook-token-close")); expect(screen.queryByTestId("webhook-token")).toBeNull();
  });
});

describe("the recap and the away tabs of a team", () => {
  const dig = (over: Record<string, unknown> = {}) => { const H = 3_600_000; const now = 50 * H; return { since_ms: now - 24 * H, now_ms: now, started: 3, finished: 1, failed: 1, parked: 1, running: 0, stopped: 0, skipped: 1, spent_usd: 0.4, needs_you: ["x"], skips: [{ team: "t", trigger: "t1", t_ms: 1, why: "the day's limit is reached" }], words: "While you were away: 3 runs started, 1 finished, 1 failed, 1 waiting for you. Spent $0.40.", quiet: false,
    runs: [{ id: "t-3", team: "t", ask: "cut the reel", kind: "parked", why: "", started_ms: now - 3 * H, ended_ms: now - 3 * H, spent_usd: 0.1 }, { id: "t-2", team: "t", ask: "price the shelf", kind: "failed", why: "composer did not go to plan", started_ms: now - 5 * H, ended_ms: now - 4 * H, spent_usd: 0.05 }, { id: "t-1", team: "t", ask: "weekly note", kind: "finished", why: "", started_ms: now - 9 * H, ended_ms: now - 9 * H + 125_000, spent_usd: 0.25 }], ...over }; };
  it("the recap: a chart of the day with its peak, and a board of what needs you, what failed and what is done", async () => {
    const { TeamRecap } = await import("./TeamRecap"); api.awayDigest.mockResolvedValue(dig()); const opened: string[] = []; render(<TeamRecap team="t" mode="recap" onOpenRun={(r) => opened.push(r)} />);
    expect(await screen.findByTestId("recap-chart")).toBeTruthy(); expect(screen.getAllByTestId(/^recap-bar-/)).toHaveLength(24); expect(screen.getByTestId("recap-peak")).toHaveTextContent("peak 2"); expect(api.awayDigest).toHaveBeenCalledWith(expect.any(Number), "t");
    expect(screen.getByTestId("recap-col-needs-you")).toHaveTextContent("cut the reel"); expect(screen.getByTestId("recap-col-failed")).toHaveTextContent("composer did not go to plan"); expect(screen.getByTestId("recap-col-done")).toHaveTextContent("finished in 2 min 5 s"); expect(screen.getByTestId("recap-run-t-1")).toHaveTextContent("$0.25");
    fireEvent.click(screen.getByTestId("recap-run-t-2")); expect(opened).toEqual(["t-2"]);
    cleanup(); api.awayDigest.mockResolvedValue(dig({ runs: [], words: "" })); render(<TeamRecap team="t" mode="recap" />); expect(await screen.findByTestId("recap-words")).toHaveTextContent("Nothing ran in the last day.");
  });
  it("the away summary: since you last said got it, one line each, and Got it moves the mark for this team only", async () => {
    const { TeamRecap } = await import("./TeamRecap"); try { localStorage.removeItem("antiloki.team.away.seen.t"); } catch { /* */ } api.awayDigest.mockResolvedValue(dig());
    render(<TeamRecap team="t" mode="away" />); expect(await screen.findByTestId("away-summary")).toHaveTextContent("While you were away"); expect(screen.getByTestId("away-words")).toHaveTextContent("3 runs started"); expect(screen.getByTestId("away-summary")).toHaveTextContent("Skipped by a limit"); expect(api.awayDigest).toHaveBeenCalledWith(undefined, "t");
    fireEvent.click(screen.getByTestId("away-gotit")); expect(await screen.findByTestId("away-quiet")).toHaveTextContent("Got it"); expect(localStorage.getItem("antiloki.team.away.seen.t")).toBe(String(50 * 3_600_000)); expect(localStorage.getItem("antiloki.team.away.seen.other")).toBeNull();
    cleanup(); api.awayDigest.mockResolvedValue(dig({ quiet: true })); render(<TeamRecap team="t" mode="away" />); expect(await screen.findByTestId("away-quiet")).toHaveTextContent("Nothing happened");
    cleanup(); api.awayDigest.mockResolvedValue(null); render(<TeamRecap team="t" mode="recap" />); expect(await screen.findByTestId("recap-error")).toBeTruthy();
  });
});

describe("running now", () => {
  it("shows one pill over every team, opens a list with the runs that wait for you first, and opens a team on a click", async () => {
    const { RunningNow } = await import("./RunningNow"); api.listTeams.mockResolvedValue({ graphs: [], live: ["a", "b"], runs: [{ id: "a", team: "shop", ask: "price it", status: { status: "running" }, spent_usd: 0.05, started_ms: 1 }, { id: "b", team: "video", ask: "cut the reel", status: { status: "running" }, spent_usd: 0.2, started_ms: 2, needs_you: true }] });
    const opened: string[] = []; render(<RunningNow onOpenTeam={(t) => opened.push(t)} pollMs={60_000} />);
    expect(await screen.findByTestId("running-now-label")).toHaveTextContent("2 running · 1 needs you"); expect(screen.queryByTestId("running-now-list")).toBeNull();
    fireEvent.click(screen.getByTestId("running-now-pill")); const list = screen.getByTestId("running-now-list"); expect(list.firstElementChild).toHaveAttribute("data-testid", "running-b"); expect(screen.getByTestId("running-b")).toHaveTextContent("needs you");
    fireEvent.click(screen.getByTestId("running-a")); expect(opened).toEqual(["shop"]); expect(screen.queryByTestId("running-now-list")).toBeNull();
    cleanup(); api.listTeams.mockResolvedValue({ graphs: [], live: [], runs: [] }); render(<RunningNow pollMs={60_000} />); await waitFor(() => expect(api.listTeams).toHaveBeenCalledTimes(2)); expect(screen.queryByTestId("running-now")).toBeNull();
  });
});

describe("the batch of views: ledger, context, chat, sequence, a node's live drawer and steps", () => {
  const mk = (): any => { const g: any = { team: "T", budget_usd: 2, start: ["plan"], nodes: { leader: { node: "leader" }, plan: { node: "role", role: "planner" }, work: { node: "role", role: "agent", agent: { title: "Builder", responsibility: "build", brief: "b", effects: ["web", "document"], mcp: ["app-notion"], skills: ["docs"] } }, me: { node: "human", gate: "merge" }, deliver: { node: "deliver" } }, edges: [{ from: "plan", port: "out", to: "work" }, { from: "work", port: "out", to: "me" }, { from: "me", port: "approved", to: "deliver" }] };
    const ev = (id: number, actor: string, kind: string, text: string, t: number) => ({ id, saga_id: 1, task_id: null, t_ms: t, actor, kind, text });
    return { id: "r1", team: "t", thread: "t", ask: "x", engine: "", live: true, budget_usd: 2, spent_usd: 0.3, worst_usd: 1, graph: g, state: { status: { status: "running" }, started_ms: 0, now_ms: 100_000, active: { work: 60_000, me: 0 }, node_cost: { plan: 0.1, work: 0.2 }, values: { plan: { sagas: ["a"] }, work: { files: ["src/a.rs"], put_back: ["Cargo.toml"] } }, queued: [] },
      events: [ev(1, "plan", "start", "planning", 1000), ev(2, "plan", "done", "planned 1 saga", 5000), ev(3, "work", "start", "building", 6000), ev(4, "me", "human", "waiting (merge)", 90_000)], tools_live: { work: [{ t_ms: 99_000, tool: "Bash", target: "npx hyperframes render" }, { t_ms: 98_000, tool: "Read", target: "docs/intro.md" }] }, park_info: { me: "merge" }, team_saga: 0, pack: {}, episodes: {}, transcripts: {}, trace_seq: 0 }; };
  it("the ledger lists the files a step changed and what was put back", async () => {
    const { LedgerView } = await import("./LedgerView"); const picked: string[] = []; render(<LedgerView run={mk()} onSelect={(i) => picked.push(i)} />);
    expect(screen.getByTestId("ledger-totals")).toHaveTextContent("1 file changed · 1 put back"); expect(screen.getByTestId("ledger-files-work")).toHaveTextContent("src/a.rs"); expect(screen.getByTestId("ledger-putback-work")).toHaveTextContent("Cargo.toml"); fireEvent.click(screen.getByTestId("ledger-row-work")); expect(picked).toEqual(["work"]);
    cleanup(); const r = mk(); r.state.values = {}; render(<LedgerView run={r} />); expect(screen.getByTestId("ledger-empty")).toBeTruthy();
  });
  it("the context map is the tile map, a click on a tile shows who reads it and what it wrote, and the window opens over the card", async () => {
    const { ContextMap, ContextWindow } = await import("./ContextMap"); render(<ContextMap run={mk()} />); expect(screen.getByTestId("ctx-total")).toHaveTextContent("across 2 steps"); expect(screen.queryByTestId("ctx-value-plan")).toBeNull();
    fireEvent.click(screen.getByTestId("ctx-tile-plan")); expect(screen.getByTestId("ctx-note")).toHaveTextContent("read by Builder"); expect(screen.getByTestId("ctx-value-plan").textContent!.length).toBeGreaterThan(0); fireEvent.click(screen.getByTestId("ctx-tile-plan")); expect(screen.queryByTestId("ctx-value-plan")).toBeNull();
    cleanup(); render(<ContextWindow run={mk()} id="work" />); expect(screen.queryByTestId("ctx-window-panel")).toBeNull(); fireEvent.click(screen.getByTestId("ctx-window-pill")); expect(screen.getByTestId("ctx-window-panel")).toHaveTextContent("plan"); expect(screen.getByTestId("ctx-window-panel")).toHaveTextContent("estimated");
    cleanup(); const e = mk(); e.state.values = {}; render(<ContextMap run={e} />); expect(screen.getByTestId("ctx-empty")).toBeTruthy();
  });
  it("the recap sums a run up in sentences from its own record and builds the AI prompt from the same facts", async () => {
    const { runDigest } = await import("./model"); const r = mk(); const d = runDigest(r);
    expect(d.lines[0]).toMatch(/^(Finished|Stopped|Still)/); expect(d.lines.join(" ")).toMatch(/step/); expect(typeof d.evidence).toBe("string");
    const { summaryPrompt, recapKey } = await import("./RunRecaps"); const p = summaryPrompt("Launch it", d); expect(p).toContain("Launch it"); expect(p).toContain(d.lines[0]); expect(p).toContain("Do not invent"); expect(recapKey("r1")).toBe("antiloki.team.recap.r1");
  });
  it("the team chat tells the run as messages, filters them, shows the approval inside and answers it", async () => {
    const { TeamChat } = await import("./TeamChat"); api.answerAt.mockResolvedValue({ ok: true }); const r = mk(); const changed = vi.fn(); render(<TeamChat graph={r.graph} run={r} onChanged={changed} />);
    expect(screen.getByTestId("chat-msg-2")).toHaveTextContent("plan"); expect(screen.getByTestId("chat-msg-2")).toHaveTextContent("planned 1 saga"); expect(screen.getByTestId("chat-msg-2")).toHaveAttribute("data-kind", "handoff"); expect(screen.getAllByTestId(/^chat-msg-/).length).toBeLessThan(4); expect(screen.getByTestId("chat-ask")).toBeTruthy(); fireEvent.click(screen.getByTestId("chat-verbose")); expect(screen.getAllByTestId(/^chat-msg-/)).toHaveLength(4); fireEvent.change(screen.getByTestId("chat-who"), { target: { value: "work" } }); expect(screen.getAllByTestId(/^chat-msg-/).length).toBe(2);   // the one that leads to work and work's own
    fireEvent.click(screen.getByTestId("chat-msg-3")); expect(screen.getByTestId("chat-card-3")).toHaveTextContent("step work");
    fireEvent.click(screen.getByTestId("approve")); await waitFor(() => expect(api.answerAt).toHaveBeenCalledWith("r1", "me", true)); await waitFor(() => expect(changed).toHaveBeenCalled());
  });
  it("the sequence draws the graph's own nodes (a lane and a card each), opens a popover on a click, and the run tab switches to it", async () => {
    const { SequenceView } = await import("./SequenceView"); const picked: string[] = []; render(<SequenceView run={mk()} onSelect={(i) => picked.push(i)} />); expect(screen.getByTestId("seq-lane-plan")).toBeTruthy(); expect(screen.getByTestId("seq-lane-work")).toBeTruthy(); expect(screen.getByTestId("seq-node-plan")).toHaveAttribute("data-state"); fireEvent.click(screen.getByTestId("seq-node-plan")); expect(picked).toEqual([]);   // the popover is the sequence's own detail; the graph's step is not opened from here
    cleanup(); const r = mk(); renderT(<TeamRun graph={r.graph} report={null} run={r} onEdit={vi.fn()} onRun={vi.fn()} onChanged={vi.fn()} />); fireEvent.click(screen.getByTestId("view-sequence")); expect(screen.getByTestId("sequence")).toBeTruthy(); fireEvent.click(screen.getByTestId("view-graph")); expect(screen.queryByTestId("sequence")).toBeNull();
    cleanup(); render(<SequenceView run={mk()} />); fireEvent.click(screen.getByTestId("seq-node-plan")); expect(screen.getByTestId("seq-detail")).toHaveTextContent("Step"); fireEvent.click(screen.getByTestId("seq-close")); expect(screen.queryByTestId("seq-detail")).toBeNull();
    cleanup(); const e = mk(); e.graph = { ...e.graph, nodes: {}, edges: [] }; render(<SequenceView run={e} />); expect(screen.getByTestId("seq-empty")).toBeTruthy();
  });
  it("a retry is drawn as a loop back to the earlier step", async () => {
    const { SequenceView } = await import("./SequenceView"); const r = mk(); r.graph = { ...r.graph, nodes: { leader: { node: "leader" }, plan: { node: "role", role: "planner" }, work: { node: "role", role: "worker" }, check: { node: "check", on: "work", rules: [] } }, edges: [{ from: "plan", port: "out", to: "work" }, { from: "work", port: "out", to: "check" }, { from: "check", port: "failed", to: "work" }] };
    const { container } = render(<SequenceView run={r} />); expect(container.innerHTML).toContain("↻"); expect(container.innerHTML).toContain("stroke-dasharray=\"3.5 3.5\"");
  });
  it("the drawer says what the step does now: the monitor, the trail, the access map with the tool in use lit, the controls", async () => {
    const { DrawerLive, accessOf } = await import("./DrawerLive"); api.controlRun.mockResolvedValue({ ok: true }); const r = mk(); r.state.active.work = Date.now() - 40_000; const changed = vi.fn(); render(<DrawerLive graph={r.graph} run={r} id="work" onChanged={changed} />);
    expect(screen.getByTestId("monitor")).toHaveTextContent("Working"); expect(screen.getByTestId("monitor-clock")).toHaveTextContent(/^4[01] s$/); expect(screen.getByTestId("monitor-now")).toHaveTextContent("Bash · npx hyperframes render"); expect(screen.getByTestId("trail").children).toHaveLength(2);
    expect(accessOf(r.graph, r, "work").map((a) => [a.name, a.lit])).toEqual([["app-notion", false], ["docs", false], ["WebSearch", false], ["Write", false], ["Bash", true], ["Read", false]]); expect(screen.getByTestId("access-Bash")).toHaveAttribute("data-lit", "1"); expect(screen.getByTestId("ctx-window-work")).toBeTruthy();
    fireEvent.click(screen.getByTestId("drawer-pause")); await waitFor(() => expect(api.controlRun).toHaveBeenCalledWith("r1", "pause")); fireEvent.click(screen.getByTestId("drawer-stop")); await waitFor(() => expect(api.controlRun).toHaveBeenCalledWith("r1", "stop")); expect(screen.getByTestId("steer")).toBeTruthy();
    cleanup(); const done = mk(); done.live = false; render(<DrawerLive graph={done.graph} run={done} id="plan" />); expect(screen.queryByTestId("drawer-pause")).toBeNull(); expect(screen.queryByTestId("access-map")).toBeNull(); expect(screen.getByTestId("monitor")).toHaveTextContent("Done");
  });
  it("a card expands its steps under it without opening the agent", () => {
    setAgentTheme("cards"); const r = mk(); render(<Board graph={r.graph} run={r} />); expect(screen.queryByTestId("card-steps-work")).toBeNull(); expect(screen.queryByTestId("card-steps-toggle-plan")).toBeNull();   // nothing to show for a step with no tools
    fireEvent.click(screen.getByTestId("card-steps-toggle-work")); expect(screen.getByTestId("card-steps-work")).toHaveTextContent("Bash · npx hyperframes render"); expect(screen.getByTestId("card-steps-work")).toHaveTextContent("Read · docs/intro.md"); fireEvent.click(screen.getByTestId("card-steps-toggle-work")); expect(screen.queryByTestId("card-steps-work")).toBeNull();
  });
  it("a tab stored by an older pane still opens the right place: the Leader stays, everything else is the graph", async () => {
    const { tabOf } = await import("./TeamPane"); for (const old of ["ledger", "away", "recap", "report", "waterfall", "chat", "context", "plan", "saga", "improve", "requests", "edit", "activity", "result", "sagas", "xray", "run", null]) expect(tabOf(old as any)).toEqual({ tab: "run" }); expect(tabOf("leader")).toEqual({ tab: "leader" });
  });
  it("the Leader is a tab of the team: a remembered choice is kept, and the tab has a place only when a Leader terminal is handed in", async () => {
    const { tabOf } = await import("./TeamPane"); expect(tabOf("leader")).toEqual({ tab: "leader" }); expect(tabOf(null)).toEqual({ tab: "run" });
  });
  it("the team pane has the graph and the Leader only: time and cost are on the bottom bar, not a tab", async () => {
    const r = mk(); api.getTeam.mockResolvedValue({ graph: r.graph, report: { errors: [], warnings: [], worst_usd: 1, budget_usd: 2 }, runs: [] }); api.listTeams.mockResolvedValue({ graphs: [], runs: [], live: [] });
    render(<TeamPane team="t" />); await screen.findByTestId("team-run"); for (const k of ["activity", "edit", "result", "sagas", "xray", "board"]) expect(screen.queryByTestId(`tab-${k}`)).toBeNull(); expect(screen.queryByTestId("lens-chat")).toBeNull();
  });
});

describe("the autonomy dial", () => {
  it("has three stops, moves with the arrow keys, and a card shows that it asks first", async () => {
    const { AutonomyDial, stopOf } = await import("./AutonomyDial"); expect([stopOf(null), stopOf("ask"), stopOf("always"), stopOf("junk")]).toEqual(["auto", "ask", "always", "auto"]);
    const seen: string[] = []; const { rerender } = render(<AutonomyDial value={null} onChange={(v) => seen.push(v)} />); const dial = screen.getByTestId("autonomy-dial"); expect(dial).toHaveAttribute("data-stop", "auto");
    fireEvent.keyDown(dial, { key: "ArrowRight" }); fireEvent.click(screen.getByTestId("autonomy-always")); expect(seen).toEqual(["ask", "always"]);
    rerender(<AutonomyDial value="always" onChange={(v) => seen.push(v)} />); expect(screen.getByTestId("autonomy-dial")).toHaveAttribute("aria-valuetext", "Asks every time"); fireEvent.keyDown(screen.getByTestId("autonomy-dial"), { key: "ArrowRight" }); expect(seen).toHaveLength(2);   // already at the end
    fireEvent.keyDown(screen.getByTestId("autonomy-dial"), { key: "ArrowLeft" }); expect(seen[2]).toBe("ask");
    cleanup(); setAgentTheme("cards"); const graph = bugfix(); (graph.nodes.fix as any).autonomy = "ask"; render(<Board graph={graph} run={null} />); expect(screen.getByTestId("card-asks-fix")).toBeTruthy(); expect(screen.queryByTestId("card-asks-tests")).toBeNull();
  });
  it("parks a step that asks at the approval card, worded as a permission", async () => {
    const { parkedAt } = await import("./model"); const g = bugfix(); (g.nodes.fix as any).autonomy = "always"; const run = mkRun({ active: { fix: 1 } }, [], { park_info: { fix: "permission" }, graph: g });
    expect(parkedAt(g, run)).toBe("fix"); expect(parkedAt(g, mkRun({ active: { fix: 1 } }, [], { graph: g }))).toBeNull();   // working, not asking
    renderT(<TeamRun graph={g} report={null} run={run} onEdit={vi.fn()} onRun={vi.fn()} onChanged={vi.fn()} />); expect(screen.getByTestId("gate-risk")).toHaveTextContent("asks first"); expect(screen.getByTestId("gate-what")).toHaveTextContent("set to ask before it starts"); expect(screen.getByTestId("approve")).toHaveTextContent("Allow");
  });
});

describe("an approval node", () => {
  it("fills the note from the run, takes the risk it names and says it on the card", async () => {
    const { fillNote } = await import("./ApprovalCard"); expect(fillNote("Publish {ask}: {mk.price} items {x.y} {nope}", "the shelf", { mk: { price: 18 }, x: { y: "ok" } })).toBe("Publish the shelf: 18 items ok {nope}");
    const g = bugfix(); (g.nodes.me as any).approval = { risk: "high", note: "Merges {ask} into your branch" }; const run = mkRun({ active: { me: 1 } }, [], { park_info: { me: "review" }, ask: "the cart", graph: g });
    renderT(<TeamRun graph={g} report={null} run={run} onEdit={vi.fn()} onRun={vi.fn()} onChanged={vi.fn()} />); expect(screen.getByTestId("gate-risk")).toHaveAttribute("data-risk", "high"); expect(screen.getByTestId("gate-risk")).toHaveTextContent("high risk"); expect(screen.getByTestId("gate-what")).toHaveTextContent("Merges the cart into your branch");
  });
});

describe("steering a running team", () => {
  it("adds a note while the run goes, lists it, and says why when it is refused", async () => {
    const { SteerBox } = await import("./SteerBox"); api.steerRun.mockResolvedValueOnce({ ok: true, notes: 1 }).mockResolvedValueOnce({ ok: false, error: "a run takes at most 20 notes" });
    render(<SteerBox run="r1" />); expect((screen.getByTestId("steer-send") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("steer-text"), { target: { value: "keep it under 10 seconds" } }); fireEvent.click(screen.getByTestId("steer-send"));
    await waitFor(() => expect(api.steerRun).toHaveBeenCalledWith("r1", "keep it under 10 seconds")); expect(await screen.findByTestId("steer-sent")).toHaveTextContent("keep it under 10 seconds"); expect((screen.getByTestId("steer-text") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByTestId("steer-text"), { target: { value: "again" } }); fireEvent.keyDown(screen.getByTestId("steer-text"), { key: "Enter" }); expect(await screen.findByTestId("steer-error")).toHaveTextContent("at most 20");
  });
});

describe("the approval card", () => {
  it("words each kind of gate, and answers from the keyboard unless a text field has the focus", async () => {
    const { ApprovalCard, gateInfo } = await import("./ApprovalCard");
    expect([gateInfo("merge").risk, gateInfo("blocked").risk, gateInfo("review").risk]).toEqual(["high", "medium", "medium"]); expect(gateInfo("blocked").approve).toBe("Accept what it has"); expect(gateInfo("review").badge).toBe("gate: review");
    const answers: boolean[] = []; render(<div><input data-testid="box" /><ApprovalCard gate="blocked" node="me" onAnswer={(a) => { answers.push(a); }} /></div>);
    expect(screen.getByTestId("needs-you")).toHaveTextContent("The team could not deliver"); expect(screen.getByTestId("needs-you")).toHaveTextContent("at me");
    fireEvent.keyDown(window, { key: "a" }); fireEvent.keyDown(window, { key: "D" }); expect(answers).toEqual([true, false]);
    const box = screen.getByTestId("box"); fireEvent.keyDown(box, { key: "a" }); expect(answers).toEqual([true, false]);   // typing in a field never answers
    fireEvent.keyDown(window, { key: "a", ctrlKey: true }); expect(answers).toHaveLength(2);
    cleanup(); const quiet: boolean[] = []; render(<ApprovalCard gate="merge" node="me" busy onAnswer={(a) => { quiet.push(a); }} />); fireEvent.keyDown(window, { key: "a" }); expect(quiet).toEqual([]); expect((screen.getByTestId("approve") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the waterfall of a run", () => {
  const mk = (): any => { const g: any = { team: "T", budget_usd: 2, start: ["plan"], nodes: { leader: { node: "leader" }, plan: { node: "role", role: "planner" }, loop: { node: "loop", max_iterations: 3 }, work: { node: "role", role: "worker" }, deliver: { node: "deliver" } }, edges: [{ from: "plan", port: "out", to: "loop" }, { from: "loop", port: "body", to: "work" }, { from: "work", port: "out", to: "loop" }, { from: "loop", port: "done", to: "deliver" }] };
    return { id: "r1", ask: "Launch it", live: false, graph: g, state: { status: { status: "done" }, started_ms: 0, now_ms: 30_000, active: {}, node_cost: { plan: 0.01, work: 0.4 } }, events: [{ t_ms: 0, actor: "plan", kind: "start" }, { t_ms: 5000, actor: "plan", kind: "done" }, { t_ms: 5000, actor: "loop", kind: "start" }, { t_ms: 5000, actor: "work", kind: "start" }, { t_ms: 25_000, actor: "work", kind: "done" }] }; };
  it("shows the numbers, a nested timeline with a foldable loop, the slowest and dearest, and sorts by cost on request", async () => {
    const { TraceWaterfall } = await import("./TraceWaterfall"); const picked: string[] = []; render(<TraceWaterfall run={mk()} onSelect={(id) => picked.push(id)} />);
    expect(screen.getByTestId("waterfall-ask")).toHaveTextContent("Launch it"); expect(screen.getByTestId("waterfall-pill")).toHaveTextContent("Done"); expect(screen.getByTestId("waterfall-stats")).toHaveTextContent("Duration"); expect(screen.getByTestId("waterfall-stats")).toHaveTextContent("$0.41"); expect(screen.getByTestId("waterfall-total")).toHaveTextContent("25 s · $0.41");
    expect(screen.getByTestId("wf-work")).toHaveAttribute("data-depth", "1"); expect(screen.getByTestId("wf-slowest-work")).toBeTruthy(); expect(screen.getByTestId("wf-dearest-work")).toBeTruthy(); expect(screen.getByTestId("waterfall-axis")).toHaveTextContent("0 s");
    fireEvent.click(screen.getByTestId("wf-fold-loop")); expect(screen.queryByTestId("wf-work")).toBeNull(); fireEvent.click(screen.getByTestId("wf-fold-loop")); expect(screen.getByTestId("wf-work")).toBeTruthy();
    fireEvent.click(screen.getByTestId("waterfall-by-cost")); const rows = screen.getAllByTestId(/^wf-(plan|work|loop)$/); expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["wf-work", "wf-plan"]);   // by cost: the steps, dearest first, no parents
    fireEvent.click(screen.getByTestId("wf-work")); expect(picked).toEqual(["work"]);
  });
  it("is live while a step works, and says so plainly when nothing has run", async () => {
    const { TraceWaterfall } = await import("./TraceWaterfall"); const r = mk(); r.live = true; r.state = { ...r.state, status: { status: "running" }, active: { work: 5000 } }; r.events = r.events.filter((e: any) => e.kind !== "done" || e.actor !== "work");
    render(<TraceWaterfall run={r} />); expect(screen.getByTestId("waterfall-pill")).toHaveTextContent("Live"); expect(screen.getByTestId("waterfall-now")).toBeTruthy(); expect(screen.getByTestId("wf-work")).toHaveAttribute("data-state", "working");
    cleanup(); render(<TraceWaterfall run={{ ...mk(), events: [], state: { ...mk().state, node_cost: {} } }} />); expect(screen.getByTestId("waterfall-empty")).toBeTruthy();
  });
});

describe("the approval card", () => {
  it("words each kind of gate, and answers from the keyboard unless a text field has the focus", async () => {
    const { ApprovalCard, gateInfo } = await import("./ApprovalCard");
    expect([gateInfo("merge").risk, gateInfo("blocked").risk, gateInfo("review").risk]).toEqual(["high", "medium", "medium"]); expect(gateInfo("blocked").approve).toBe("Accept what it has"); expect(gateInfo("review").badge).toBe("gate: review");
    const answers: boolean[] = []; render(<div><input data-testid="box" /><ApprovalCard gate="blocked" node="me" onAnswer={(a) => { answers.push(a); }} /></div>);
    expect(screen.getByTestId("needs-you")).toHaveTextContent("The team could not deliver"); expect(screen.getByTestId("needs-you")).toHaveTextContent("at me");
    fireEvent.keyDown(window, { key: "a" }); fireEvent.keyDown(window, { key: "D" }); expect(answers).toEqual([true, false]);
    const box = screen.getByTestId("box"); fireEvent.keyDown(box, { key: "a" }); expect(answers).toEqual([true, false]);   // typing in a field never answers
    fireEvent.keyDown(window, { key: "a", ctrlKey: true }); expect(answers).toHaveLength(2);
    cleanup(); const quiet: boolean[] = []; render(<ApprovalCard gate="merge" node="me" busy onAnswer={(a) => { quiet.push(a); }} />); fireEvent.keyDown(window, { key: "a" }); expect(quiet).toEqual([]); expect((screen.getByTestId("approve") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the node cards", () => {
  beforeEach(() => { setAgentTheme("cards"); });
  const g = (): any => ({ team: "T", budget_usd: 2, start: ["plan"], nodes: { leader: { node: "leader" }, plan: { node: "role", role: "planner", cap_usd: 0.4 }, research: { node: "role", role: "agent", cap_usd: 0.5, agent: { title: "Researcher", responsibility: "Find the docs", brief: "b", effects: ["web", "document"], mcp: ["app-notion"], skills: ["docs"] } }, docs: { node: "use_tool", tool: { type: "web", name: "docs", args: {} }, allow: { effects: ["network"] } }, loop: { node: "loop", max_iterations: 3 }, me: { node: "human", gate: "merge" }, deliver: { node: "deliver" } }, edges: [{ from: "plan", port: "out", to: "research" }, { from: "research", port: "out", to: "docs" }, { from: "docs", port: "out", to: "loop" }, { from: "loop", port: "done", to: "me" }, { from: "me", port: "approved", to: "deliver" }] });
  it("is the default look: an agent is a full card with its pill, what it does now, its spend against its cap and its tools; a tool or control step is a small card", () => {
    const graph = g(); const run = mkRun({ active: { research: 1 }, node_cost: { plan: 0.12, research: 0.4 } }, [{ id: 3, saga_id: 1, task_id: null, t_ms: 3, actor: "research", kind: "start", text: "reading the hyperframes docs" }, { id: 2, saga_id: 1, task_id: null, t_ms: 2, actor: "plan", kind: "done", text: "planned 3 steps" }], { graph, tools_live: { research: [{ t_ms: 9, tool: "Grep", target: "fn render" }, { t_ms: 8, tool: "Read", target: "docs/intro.md" }] } });
    render(<Board graph={graph} run={run} />);
    expect(getAgentTheme()).toBe("cards"); expect(DEFAULT_THEME).toBe("cards"); const r = screen.getByTestId("node-research"); expect(within(r).getByTestId("card-pill-research")).toBeTruthy(); expect(r.querySelector("[data-card=big]")).toBeTruthy();
    expect(screen.getByTestId("card-pill-research")).toHaveTextContent("Working"); expect(screen.getByTestId("live-now-research")).toHaveTextContent("Grep · fn render"); expect(screen.getByTestId("live-before-research")).toHaveTextContent("Read · docs/intro.md"); expect(screen.getByTestId("card-bar-research").style.width).toBe("80%");
    expect(screen.getByTestId("live-icons-research").querySelectorAll("svg").length).toBe(2); expect(screen.getByTestId("live-icons-research").querySelector("[data-lit='1']")).toBeTruthy();   // the tool in use is lit
    expect(screen.getByTestId("card-tools-research").querySelectorAll("svg").length).toBe(4);
    expect(screen.getByTestId("card-pill-plan")).toHaveTextContent("Done"); expect(screen.getByTestId("live-now-plan")).toHaveTextContent("planned 3 steps");
    expect(screen.getByTestId("node-docs").querySelector("[data-card=small]")).toBeTruthy(); expect(screen.getByTestId("node-me").querySelector("[data-card=small]")).toBeTruthy(); expect(screen.getByTestId("node-loop").querySelector("[data-card=small]")).toBeTruthy();
  });
  it("shows the live strip in EVERY look: under the node when the look has no room, and says nothing for an idle node", () => {
    setAgentTheme("microchip"); const graph = g(); const run = mkRun({ active: { research: 1 } }, [], { graph, tools_live: { research: [{ t_ms: 9, tool: "Bash", target: "npx hyperframes render --fps 30 out/very/long/path/clip.mp4" }, { t_ms: 8, tool: "WebFetch", target: "https://x.dev/docs" }] } });
    render(<Board graph={graph} run={run} />); expect(screen.getByTestId("node-research").querySelector("[data-card]")).toBeNull();   // not the card look
    expect(screen.getByTestId("live-now-research")).toHaveTextContent("Bash · npx hyperframes render --fps 30"); expect(screen.getByTestId("live-now-research").textContent).toMatch(/…$/); expect(screen.getByTestId("live-before-research")).toHaveTextContent("WebFetch · https://x.dev/docs"); expect(screen.queryByTestId("live-plan")).toBeNull(); expect(screen.queryByTestId("live-docs")).toBeNull();
    for (const k of ["dots", "pixel"] as const) { cleanup(); setAgentTheme(k); render(<Board graph={graph} run={run} />); expect(screen.getByTestId("live-now-research")).toBeTruthy(); }
  });
  it("tells the tools apart by icon and cuts a long path from the left", async () => {
    const { toolIcon, toolPhrase, liveOf } = await import("./model"); expect(["Read", "Grep", "Glob", "Bash", "Edit", "WebSearch", "mcp__notion__x", "Task", "Foo"].map(toolIcon)).toEqual(["doc", "search", "search", "term", "code", "globe", "plug", "agent", "wrench"]);
    expect(toolPhrase({ tool: "Read", target: "src/a.rs" })).toBe("Read · src/a.rs"); expect(toolPhrase({ tool: "Read", target: "x".repeat(60) }, 20)).toBe(`Read · …${"x".repeat(19)}`); { const { chatText, money } = await import("./model"); expect(chatText("writer finished (done=false, report=Did it, said=Did it)", "handoff")).toBe("Did it"); expect(chatText("plan finished (planned 1 saga)", "handoff")).toBe("planned 1 saga"); expect(chatText("x".repeat(700), "note").length).toBe(600); expect(chatText("  ", "handoff")).toBe("done"); expect(money(0.0038)).toBe("$0.004"); expect(money(0)).toBe("$0.00"); expect(money(1.5)).toBe("$1.50"); } expect(toolPhrase({ tool: "Task", target: "" })).toBe("Task"); expect(toolPhrase({ tool: "Bash", target: "\n  cat > poem.md <<'EOF'\nline two" }, 30)).toBe("Bash · cat > poem.md <<'EOF'"); expect(toolPhrase({ tool: "Bash", target: "x".repeat(50) }, 10)).toBe(`Bash · ${"x".repeat(9)}…`);
    const graph = g(); const idle = liveOf("research", graph.nodes.research, "idle", null); expect(idle.shown).toBe(false); expect(liveOf("leader", graph.nodes.leader, "working", mkRun({}, [], { graph })).shown).toBe(false);
  });
  it("lays the cards out without overlap and keeps them inside the board", async () => {
    const { layoutGraph, CARD, PAD } = await import("./model"); const l = layoutGraph(g(), 99, true); const ids = Object.keys(l.boxes);
    for (const id of ids) { expect(l.boxes[id].x).toBeGreaterThanOrEqual(PAD - 1); expect(l.boxes[id].y).toBeGreaterThanOrEqual(0); expect(l.boxes[id].x + l.boxes[id].w).toBeLessThanOrEqual(l.width); }
    for (const a of ids) for (const b of ids) { if (a >= b) continue; const A = l.boxes[a], B = l.boxes[b]; expect(A.x + A.w <= B.x || B.x + B.w <= A.x || A.y + A.h <= B.y || B.y + B.h <= A.y).toBe(true); }
    expect(l.boxes.plan.w).toBe(CARD.chip.w); expect(l.boxes.docs.w).toBe(CARD.small.w);
  });
  it("words what a card says: now, waiting, failed, done, idle; and the tools an agent may reach", async () => {
    const { cardLine, cardTools, cardSpend } = await import("./model"); const graph = g(); const n = graph.nodes.research;
    expect(cardLine("research", n, "idle", null)).toBe("Find the docs"); expect(cardLine("plan", graph.nodes.plan, "idle", null)).toBe("Waiting for work"); expect(cardLine("me", graph.nodes.me, "waiting", null)).toBe("Waiting for you"); expect(cardLine("research", n, "working", null)).toBe("Working"); expect(cardLine("research", n, "failed", null)).toBe("Failed");
    expect(cardTools(n)).toEqual({ icons: ["globe", "doc", "plug", "wrench"], more: 0 }); expect(cardTools(graph.nodes.plan)).toEqual({ icons: [], more: 0 });
    expect(cardSpend(n, 0.25)).toEqual({ share: 0.5, words: "$0.25 / $0.50" }); expect(cardSpend({ node: "role", role: "worker" } as any, 0.1)).toEqual({ share: null, words: "$0.10" }); expect(cardSpend({ node: "role", role: "worker" } as any, 0)).toEqual({ share: null, words: "" });
  });
});

describe("the proof card", () => {
  it("says there is no proof yet, shows a verdict with its numbers, and marks a changed team as stale", async () => {
    const { ProofCard } = await import("./ProofCard");
    api.teamProof.mockResolvedValue({ recorded: false, verdict: "none", words: "No proof yet: nobody has run this team against one agent.", n: 0 }); render(<ProofCard team="t" />);
    expect(await screen.findByTestId("proof-verdict")).toHaveTextContent("no proof yet"); expect(screen.queryByTestId("proof-numbers")).toBeNull(); cleanup();
    api.teamProof.mockResolvedValue({ recorded: true, verdict: "earns it on cost", words: "The team is as good as a raw agent at 33% of its cost.", n: 18, fixtures: 3, stale: true, w: 0.5, w_lo: 0.4, w_hi: 0.6, rho_cost: 0.33, rho_time: 2 }); render(<ProofCard team="t" />);
    expect(await screen.findByTestId("proof-verdict")).toHaveTextContent("earns it on cost"); expect(screen.getByTestId("proof-numbers")).toHaveTextContent("18 pairs · 3 fixtures · wins 50% (40%–60%) · cost 0.33x · time 2.00x"); expect(screen.getByTestId("proof-stale")).toBeTruthy();
    cleanup(); api.teamProof.mockResolvedValue(null); render(<ProofCard team="t" />); await waitFor(() => expect(api.teamProof).toHaveBeenCalledTimes(3)); expect(screen.queryByTestId("proof-card")).toBeNull();
  });
});

describe("while you were away", () => {
  const digest = (over: Record<string, unknown> = {}) => ({ since_ms: 1, now_ms: 5000, started: 2, finished: 1, failed: 1, parked: 0, running: 0, stopped: 0, skipped: 1, spent_usd: 0.4, needs_you: ["Editor Vid · run editor-vid-1 did not finish: composer did not go to plan"], skips: [{ team: "Editor Vid", trigger: "t1", t_ms: 3, why: "the day's limit is reached" }], words: "While you were away: 2 runs started, 1 finished, 1 failed. Spent $0.40.", quiet: false, ...over });
  it("tells what happened, names what needs the person, and moves the mark when dismissed", async () => {
    const { AwayDigest } = await import("./AwayDigest"); try { localStorage.removeItem("antiloki.team.away.seen"); } catch { /* */ }
    api.awayDigest.mockResolvedValue(digest()); render(<AwayDigest />);
    expect(await screen.findByTestId("away-words")).toHaveTextContent("2 runs started"); fireEvent.click(screen.getByTestId("away-more")); expect(screen.getByTestId("away-needs")).toHaveTextContent("composer did not go to plan"); expect(api.awayDigest).toHaveBeenCalledWith(undefined);
    fireEvent.click(screen.getByTestId("away-dismiss")); expect(screen.queryByTestId("away-digest")).toBeNull(); expect(localStorage.getItem("antiloki.team.away.seen")).toBe("5000");
    cleanup(); api.awayDigest.mockClear(); render(<AwayDigest />); await waitFor(() => expect(api.awayDigest).toHaveBeenCalledWith(5000));   // the next look starts from the mark
  });
  it("says nothing when nothing happened or the serve cannot say", async () => {
    const { AwayDigest } = await import("./AwayDigest"); api.awayDigest.mockResolvedValue(digest({ quiet: true, words: "Nothing happened while you were away." })); render(<AwayDigest />); await waitFor(() => expect(api.awayDigest).toHaveBeenCalled()); expect(screen.queryByTestId("away-digest")).toBeNull();
    cleanup(); api.awayDigest.mockResolvedValue(null); render(<AwayDigest />); await waitFor(() => expect(api.awayDigest).toHaveBeenCalledTimes(2)); expect(screen.queryByTestId("away-digest")).toBeNull();
  });
});

});

describe("a run keeps the team it started with", () => {
  afterEach(cleanup);
  const rewritten = (): Graph => { const g = bugfix(); delete (g.nodes as any).fix; g.edges = g.edges.filter((e) => e.from !== "fix" && e.to !== "fix"); g.nodes.render = { node: "use_tool", tool: { type: "skill", name: "render" }, allow: { effects: ["read"] } } as any; return g; };
  it("shows the team as it is now when it was rewritten since a run that is not going, and says so", () => {
    const now = rewritten(); const run = mkRun({}, [], { live: false, graph: bugfix() });
    renderT(<TeamRun graph={now} report={null} run={run} onEdit={vi.fn()} onRun={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByTestId("team-changed")).toHaveTextContent("The team has been changed since run fix-1"); expect(screen.getByTestId("node-render")).toBeTruthy(); expect(screen.queryByTestId("node-fix")).toBeNull();
    fireEvent.click(screen.getByTestId("team-changed-toggle")); expect(screen.getByTestId("team-changed")).toHaveTextContent("as run fix-1 started it"); expect(screen.getByTestId("node-fix")).toBeTruthy(); expect(screen.queryByTestId("node-render")).toBeNull();
    fireEvent.click(screen.getByTestId("team-changed-toggle")); expect(screen.getByTestId("node-render")).toBeTruthy();
  });
  it("says nothing when the team is the same, and never swaps the circuit of a run that is going", () => {
    renderT(<TeamRun graph={bugfix()} report={null} run={mkRun({}, [], { live: false, graph: bugfix() })} onEdit={vi.fn()} onRun={vi.fn()} onChanged={vi.fn()} />); expect(screen.queryByTestId("team-changed")).toBeNull(); cleanup();
    renderT(<TeamRun graph={rewritten()} report={null} run={mkRun({ status: { status: "running" } }, [], { live: true, graph: bugfix() })} onEdit={vi.fn()} onRun={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.queryByTestId("team-changed")).toBeNull(); expect(screen.getByTestId("node-fix")).toBeTruthy();   // a live run is drawn as it is running
  });
});

describe("the inbox in Running Now", () => {
  it("lists what Heimdall waits to ask next to the team runs", async () => {
    const { asksOf } = await import("./RunningNow");
    expect(asksOf([{ id: 1, goal: "a", status: "awaiting-answers", questions: [{}] }, { id: 2, goal: "b", status: "running" }, { id: 3, goal: "c", status: "awaiting-answers", questions: [{ answer: "x" }] }])).toEqual([{ id: 1, goal: "a" }]);
  });
});


describe("inside a node", () => {
  it("lays a lane to every part, opens a part with its controls, and goes back on Esc and on the arrow", async () => {
    const { NodeInterior, interiorOf, roundedPath, laneTo } = await import("./NodeInterior"); const g = bugfix(); const r = mkRun(); const onClose = vi.fn();
    const keys = interiorOf(g, r, "fix").map((s) => s.key); expect(keys).toEqual(expect.arrayContaining(["model", "cap", "out", "trail", "brief"])); expect(interiorOf(g, r, "tests").map((s) => s.key)).not.toContain("model");
    render(<NodeInterior graph={g} run={r} id="fix" onClose={onClose} />); expect(screen.getByTestId("node-interior")).toHaveAttribute("data-node", "fix"); expect(screen.getByTestId("interior-hub")).toBeTruthy(); expect(screen.queryByTestId("interior-detail")).toBeNull();
    fireEvent.click(screen.getByTestId("interior-model")); expect(screen.getByTestId("interior-detail")).toHaveAttribute("data-part", "model"); expect(screen.getByTestId("drawer-model")).toBeTruthy(); expect(screen.queryByTestId("drawer-cap")).toBeNull();
    fireEvent.click(screen.getByTestId("interior-cap")); expect(screen.getByTestId("drawer-cap")).toBeTruthy(); expect(screen.queryByTestId("drawer-model")).toBeNull(); fireEvent.click(screen.getByTestId("interior-cap")); expect(screen.queryByTestId("interior-detail")).toBeNull();
    fireEvent.click(screen.getByTestId("interior-model")); fireEvent.keyDown(window, { key: "Escape" }); expect(onClose).not.toHaveBeenCalled(); expect(screen.queryByTestId("interior-detail")).toBeNull();   // Esc closes the open part first, once
    fireEvent.keyDown(window, { key: "Escape" }); expect(onClose).toHaveBeenCalledTimes(1); fireEvent.click(screen.getByTestId("interior-back")); expect(onClose).toHaveBeenCalledTimes(2);
    expect(roundedPath([{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 40, y: 40 }], 10)).toBe("M0 0 L0 30 Q0 40 10 40 L40 40"); expect(roundedPath([{ x: 0, y: 0 }], 10)).toBe("");
    const rc = (l: number, t: number, w: number, h: number) => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h }) as DOMRect; const o = rc(0, 0, 600, 400);
    expect(laneTo(rc(250, 150, 100, 60), rc(250, 20, 100, 50), 0, o)).toEqual([{ x: 300, y: 150 }, { x: 300, y: 70 }]); expect(laneTo(rc(250, 150, 100, 60), rc(500, 150, 80, 50), 2, o)).toEqual([{ x: 350, y: 180 }, { x: 500, y: 180 }]);
    const corner = laneTo(rc(250, 150, 100, 60), rc(40, 20, 100, 50), 7, o); expect(corner).toHaveLength(4); expect(corner[3]).toEqual({ x: 90, y: 70 });
  });
  it("the sequence tells the time of a message from the run's start", async () => {
    const { clock } = await import("./SequenceView"); expect(clock(61_000, 0)).toBe("1:01"); expect(clock(5_000, 4_000)).toBe("0:01"); expect(clock(0, 9_000)).toBe("0:00");
  });
});

describe("plan and actual", () => {
  it("sets what a step usually takes beside what it took, and says nothing where there is no history", async () => {
    const { planVsActual } = await import("./model"); const { diffWords } = await import("./PlanActual");
    const row = (id: string, ms: number, cost: number, kind = "agent"): any => ({ id, kind, icon: "agent", title: id, sub: "", start: 0, end: ms, ms, cost, state: "done", slowest: false, dearest: false, parent: null, depth: 0, children: 0 });
    const b = (node: string, n: number, ms: number, cost: number): any => ({ node, stats: { n, ms_median: ms, cost_median: cost } });
    const p = planVsActual({ total_ms: 0, total_cost: 0, rows: [row("a", 15_000, 0.02), row("b", 1_000, 0.001), row("c", 9_000, 0, "human"), row("d", 5, 0)], stats: { steps: 4, model_calls: 0, tool_calls: 0, errors: 0 } }, [b("a", 5, 10_000, 0.01), b("b", 1, 1000, 0.001), b("c", 4, 100, 0)]);
    expect(p.rows.find((r) => r.id === "a")).toMatchObject({ usual_ms: 10_000, d_ms: 0.5, d_cost: 1 }); expect(p.rows.find((r) => r.id === "b")!.usual_ms).toBeNull(); expect(p.rows.find((r) => r.id === "c")!.usual_ms).toBeNull(); expect(p.rows.find((r) => r.id === "d")!.n).toBe(0); expect(p.known).toBe(1); expect(p.usual_cost).toBeCloseTo(0.01);
    expect(diffWords(0.5)).toEqual({ text: "+50%", tone: "warn" }); expect(diffWords(-0.4)).toEqual({ text: "−40%", tone: "ok" }); expect(diffWords(0.1).tone).toBe("same"); expect(diffWords(null).tone).toBe("none");
  });
});

describe("a page in a frame", () => {
  it("pins the page's own address and handles links to its parts, so a click does not send the frame to the app", async () => {
    const { frameDoc } = await import("./frameDoc"); const a = frameDoc("<!doctype html><html><head><title>x</title></head><body><a href=\"#s1\">go</a></body></html>"); expect(a).toContain('<base href="about:srcdoc">'); expect(a.indexOf("<base")).toBeLessThan(a.indexOf("<title>")); expect(a).toContain("scrollIntoView");
    expect(frameDoc("<html><body>x</body></html>")).toContain("<head><base"); expect(frameDoc("plain")).toMatch(/^<base href="about:srcdoc">/);
  });
  it("an approval that was refused says why inside the card, and says what to do about uncommitted changes", async () => {
    const { ApprovalCard } = await import("./ApprovalCard"); render(<ApprovalCard gate="merge" node="accept" onAnswer={vi.fn()} error="the workspace has uncommitted changes: commit or stash them, then land" />);
    expect(screen.getByTestId("gate-error")).toHaveTextContent("Not approved yet"); expect(screen.getByTestId("gate-error")).toHaveTextContent("Commit or stash the changes"); cleanup(); render(<ApprovalCard gate="merge" node="accept" onAnswer={vi.fn()} />); expect(screen.queryByTestId("gate-error")).toBeNull();
  });
});


describe("the merge card and the workspace", () => {
  it("says before the click what would stop the land, sets the work aside on a click and says it comes back", async () => {
    const { ApprovalCard } = await import("./ApprovalCard"); const stash = vi.fn(); const { rerender } = render(<ApprovalCard gate="merge" node="accept" onAnswer={vi.fn()} workspace={{ dirty: ["OPENBOT.md", "src/shopStore.ts"], stashed: false }} onStash={stash} />);
    expect(screen.getByTestId("gate-workspace")).toHaveTextContent("2 uncommitted files"); expect(screen.getByTestId("gate-workspace")).toHaveTextContent("OPENBOT.md"); fireEvent.click(screen.getByTestId("gate-stash")); expect(stash).toHaveBeenCalled();
    rerender(<ApprovalCard gate="merge" node="accept" onAnswer={vi.fn()} workspace={{ dirty: [], stashed: true }} onStash={stash} />); expect(screen.getByTestId("gate-workspace")).toHaveTextContent("come back by themselves"); expect(screen.queryByTestId("gate-stash")).toBeNull();
    rerender(<ApprovalCard gate="merge" node="accept" onAnswer={vi.fn()} workspace={{ dirty: [], stashed: false }} />); expect(screen.queryByTestId("gate-workspace")).toBeNull(); rerender(<ApprovalCard gate="blocked" node="accept" onAnswer={vi.fn()} workspace={{ dirty: ["x"], stashed: false }} />); expect(screen.queryByTestId("gate-workspace")).toBeNull();
  });
});

describe("a team changed under a live run", () => {
  it("says so while the run goes on and shows the team as it is on a click", async () => {
    const r = mkRun(); const g = bugfix(); (g.nodes as any).video = { node: "artifact", name: "test", format: "mp4", from: "fix" }; const props = { graph: g, report: null, run: { ...r, live: true, state: { ...r.state, status: { status: "running" } } } as any, onEdit: vi.fn(), onRun: vi.fn(), onChanged: vi.fn() };
    renderT(<TeamRun {...props} />); expect(screen.getByTestId("team-changed-live")).toHaveTextContent("started with"); expect(screen.queryByTestId("node-video")).toBeNull();
    fireEvent.click(screen.getByTestId("team-changed-live-toggle")); expect(screen.getByTestId("node-video")).toBeTruthy(); expect(screen.getByTestId("team-changed-live")).toHaveTextContent("team as it is now");
    fireEvent.click(screen.getByTestId("team-changed-live-toggle")); expect(screen.queryByTestId("node-video")).toBeNull();
  });
});

describe("a page that is not heavy", () => {
  it("a refresh that changed only the clock is not a change, and a result page names the serve in its media addresses", async () => {
    const { sameRun } = await import("./TeamPane"); const r = mkRun(); const later = { ...r, state: { ...r.state, now_ms: r.state.now_ms + 5000 } } as any; expect(sameRun(r, later)).toBe(true); expect(sameRun(r, { ...r, state: { ...r.state, spent_usd: 9 } } as any)).toBe(false); expect(sameRun(null, null)).toBe(true); expect(sameRun(r, null)).toBe(false);
    const { frameDoc } = await import("./frameDoc"); const page = frameDoc("<html><head></head><body><video src=\"__ANTILOKI_BASE__/api/v1/x\"></video></body></html>", "http://127.0.0.1:41999"); expect(page).toContain('src="http://127.0.0.1:41999/api/v1/x"'); expect(page).not.toContain("__ANTILOKI_BASE__");
  });
});

describe("a busy serve is not a missing team", () => {
  it("a team that cannot be read right now is not reported as missing, and one the serve says is missing is", async () => {
    const { TeamPane } = await import("./TeamPane"); api.getTeamReading.mockResolvedValue({ found: null, missing: false }); api.listTeams.mockResolvedValue({ graphs: [], runs: [], live: [] });
    const { unmount } = render(<TeamPane team="slow" />); await new Promise((r) => setTimeout(r, 300)); expect(screen.queryByTestId("team-error")).toBeNull(); unmount();
    api.getTeamReading.mockResolvedValue({ found: null, missing: true }); render(<TeamPane team="gone" />); expect(await screen.findByTestId("team-error")).toHaveTextContent("no team called gone");
  });
});

describe("the fallback chain of a model node", () => {
  it("orders the seats as they are tried and says which answered, which were climbed past and which were never needed", async () => {
    const { chainOf } = await import("./NodeInterior"); const n = { node: "llm", seat: "local:qwen", agree_with: ["endpoint:mid"], fallback: ["claude-code:haiku"] };
    expect(chainOf(n, undefined).map((c) => [c.seat, c.state])).toEqual([["local:qwen", "first"], ["endpoint:mid", "unused"], ["claude-code:haiku", "unused"]]);
    expect(chainOf(n, { seat_used: "claude-code:haiku", why_escalated: "guard failed" }).map((c) => c.state)).toEqual(["climbed", "climbed", "answered"]); expect(chainOf(n, { seat_used: "claude-code:haiku", why_escalated: "guard failed" })[0].why).toBe("guard failed");
    expect(chainOf(n, { seat_used: "local:qwen" }).map((c) => c.state)).toEqual(["answered", "unused", "unused"]); expect(chainOf({ node: "llm" }, {})).toEqual([]);
  });
});

describe("what a step is credited with", () => {
  it("leaves tool caches out of the ledger, reads a stored time of 0 as unknown, and plays a media artifact in its own node", async () => {
    const { isToolCache, planVsActual } = await import("./model"); expect(isToolCache("video/.hyperframes/cache/check.json")).toBe(true); expect(isToolCache("node_modules/x/a.js")).toBe(true); expect(isToolCache(".github/ci.yml")).toBe(false); expect(isToolCache("video/index.html")).toBe(false);
    const row = (id: string): any => ({ id, kind: "agent", icon: "agent", title: id, sub: "", start: 0, end: 5, ms: 5000, cost: 0.01, state: "done", slowest: false, dearest: false, parent: null, depth: 0, children: 0 });
    const p = planVsActual({ total_ms: 0, total_cost: 0, rows: [row("a")], stats: { steps: 1, model_calls: 0, tool_calls: 0, errors: 0 } }, [{ node: "a", stats: { n: 3, ms_median: 0, cost_median: 0.01 } } as any]); expect(p.rows[0].usual_ms).toBeNull(); expect(p.rows[0].usual_cost).toBe(0.01); expect(p.known).toBe(1);
    api.mediaUrl.mockImplementation((r2: string, f: string) => `/m?run=${r2}&file=${f}`); const { NodeInterior } = await import("./NodeInterior"); const r = mkRun(); const g: any = { ...r.graph, nodes: { ...r.graph.nodes, video: { node: "artifact", name: "test", format: "mp4", from: "fix" } } }; const run: any = { ...r, graph: g, state: { ...r.state, values: { ...r.state.values, video: { ok: true, name: "test", format: "mp4", path: "media/test.mp4", bytes: 54646, media: true } } } };
    render(<NodeInterior graph={g} run={run} id="video" onClose={vi.fn()} />); fireEvent.click(screen.getByTestId("interior-out")); const v = screen.getByTestId("interior-video"); expect(v.getAttribute("src")).toBe(`/m?run=${run.id}&file=kept/test.mp4`); expect(v).toHaveAttribute("controls");
  });
});

describe("what the deliver node previews", () => {
  it("prefers a video, then a composition page, then a picture", async () => {
    const { previewOf } = await import("./DeliveredPreview"); const m = (kind: string, name: string) => ({ file: `kept/${name}`, name, path: name, kind, bytes: 1 }) as any;
    expect(previewOf([m("image", "a.png"), m("page", "index.html"), m("video", "v.mp4")])?.name).toBe("v.mp4"); expect(previewOf([m("image", "a.png"), m("page", "index.html")])?.name).toBe("index.html"); expect(previewOf([m("file", "x.bin")])).toBeNull();
  });
});

describe("the graph as a surface", () => {
  it("zooms around the pointer, within limits, and the view box follows", async () => {
    const { zoomAt, camBox } = await import("./AgentGraph"); const c0 = { k: 1, x: 0, y: 0 };
    const z = zoomAt(c0, 2, 0.5, 0.5, 900, 560); expect(z.k).toBe(2); expect(camBox(z, 900, 560)).toEqual({ x: 225, y: 140, w: 450, h: 280 });
    expect(zoomAt({ k: 4, x: 0, y: 0 }, 2, 0.5, 0.5, 900, 560).k).toBe(4); expect(zoomAt({ k: 0.4, x: 0, y: 0 }, 0.5, 0.5, 0.5, 900, 560).k).toBe(0.4);
  });
});

describe("moving a planned run to another day", () => {
  it("changes only the weekday of the cron line, and refuses what it cannot move", async () => {
    const { moveCron } = await import("./ScheduleWeek");
    expect(moveCron("0 8 * * 1", 1, 3)).toBe("0 8 * * 3"); expect(moveCron("0 8 * * 1-5", 2, 6)).toBe("0 8 * * 1,3,4,5,6");
    expect(moveCron("0 8 * * *", 2, 3)).toBeNull(); expect(moveCron("0 8 15 * 1", 1, 3)).toBeNull(); expect(moveCron("0 8 * * 1", 1, 1)).toBeNull(); expect(moveCron("0 8 * * 1", 2, 3)).toBeNull(); expect(moveCron("nonsense", 1, 3)).toBeNull();
  });
  it("counts a step's net lines into the timeline", async () => {
    const { timelineOf } = await import("./DiffTimeline"); const r = mkRun(); (r.state.values as any).fix = { files: ["a.ts"], lines: { added: 12, removed: 3 } };
    const t = timelineOf(r); expect(t.points[t.points.length - 1]).toMatchObject({ added: 12, removed: 3 });
  });
});

describe("where the parts of a node sit", () => {
  it("keeps each category in its own group, apart from the others, and a part on its own spot", async () => {
    const { placeParts, catOf, CATS } = await import("./NodeInterior"); const keys = ["model", "auto", "cap", "tools", "out", "trail", "brief", "ctx"]; const at = placeParts(keys);
    for (const k of keys) { const c = CATS[catOf(k)]; expect(at[k].x).toBe(c.at[0]); expect(at[k].y).toBe(c.at[1]); }
    const spots = keys.map((k) => `${at[k].x}/${at[k].dx}/${at[k].y}/${at[k].dy}`); expect(new Set(spots).size).toBe(keys.length);   // no two parts on one spot
    expect(catOf("model")).toBe("who"); expect(catOf("out")).toBe("work"); expect(catOf("ctx")).toBe("knows");
  });
});

