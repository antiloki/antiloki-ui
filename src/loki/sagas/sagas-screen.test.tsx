// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";

const get = vi.fn(); const post = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => get(...a), apiPost: (...a: any[]) => post(...a) }));
import { SagasScreen, fitHeight, forgetSeen } from "./sagas-screen";

const r0 = { episodes: 0, todo: 0, doing: 0, done: 0, failed: 0, canceled: 0, ms: 0, usd: 0, tokens: 0, seats: {} };
const sagaRow = (o: any = {}) => ({ id: 1, title: "Add Stripe checkout", objective: "", status: "doing", origin: "heimdall", plan_ref: "run:1", confidence: "high", delivered: 0, created_ms: Date.now() - 3600_000, updated_ms: Date.now() - 60_000, rollup: { ...r0, episodes: 2, done: 1, doing: 1, usd: 0.05, ms: 12_000, seats: { cursor: 2 } }, ...o });
const episodeRow = (o: any = {}) => ({ id: 10, saga_id: 1, parent_id: null, title: "the form", body: "", status: "doing", assignee: "cursor:composer", created_by: "planner", position: 1, engine: "cursor", model: "composer", ms_total: 4000, usd_total: 0.02, tokens: 100, created_ms: 1, updated_ms: 1, started_ms: 1, done_ms: null, steps: [], rollup: r0, ...o });
const detail = (o: any = {}) => ({ ok: true, saga: sagaRow(), episodes: [episodeRow({ steps: [episodeRow({ id: 11, parent_id: 10, title: "validate the card", status: "todo", assignee: "" })] }), episodeRow({ id: 12, title: "the webhook", status: "done" })], rollup: { ...r0, episodes: 3, done: 1, doing: 1, todo: 1, usd: 0.05, ms: 12000, seats: { cursor: 2 } },
  events: [{ id: 1, task_id: null, t_ms: Date.now() - 5000, actor: "heimdall", kind: "created", text: "planned this saga from your ask" }, { id: 2, task_id: 10, t_ms: Date.now() - 2000, actor: "cursor:composer", kind: "status", text: "todo → doing" }], ...o });

describe("Sagas screen", () => {
  beforeEach(() => { forgetSeen(); history.replaceState(null, "", "/sagas"); get.mockReset(); post.mockReset(); get.mockImplementation(async (u: string) => u.includes("/detail") ? detail() : u.includes("/episode?") ? { ok: true, episode: episodeRow(), saga: { id: 1, title: "Add Stripe checkout" }, steps: [episodeRow({ id: 11, parent_id: 10, title: "validate the card", status: "todo", assignee: "" })], rollup: r0, events: detail().events } : { ok: true, sagas: [sagaRow(), sagaRow({ id: 2, title: "Redesign onboarding", status: "done", origin: "you", rollup: { ...r0, episodes: 3, done: 3 } })] }); });
  afterEach(() => cleanup());

  it("lists sagas grouped by status, with progress and who planned them, and opens one", async () => {
    render(<SagasScreen />);
    await waitFor(() => screen.getByTestId("saga-row-1"));
    expect(screen.getByTestId("saga-progress-1").textContent).toBe("1/2");
    expect(screen.getByTestId("saga-row-2")).toBeTruthy();
    expect(screen.getByText("plan")).toBeTruthy();   // Heimdall's saga is marked
    fireEvent.click(screen.getByTestId("saga-row-1"));
    await waitFor(() => screen.getByTestId("episode-row-10"));
    expect(screen.getByTestId("episode-row-11").textContent).toContain("validate the card");   // the step sits under its episode
    expect(screen.getByTestId("trail").textContent).toMatch(/heimdall.*planned this saga/);
    expect(screen.getByTestId("trail").textContent).toMatch(/cursor · composer.*todo → doing/);   // the trail names the seat
    expect(screen.getByTestId("telemetry").textContent).toMatch(/\$0\.05/);
  });

  it("shows the empty state, and creates a saga from a title", async () => {
    get.mockImplementation(async (u: string) => u.includes("/detail") ? detail({ saga: sagaRow({ id: 5, title: "New work" }), episodes: [], events: [] }) : { ok: true, sagas: [] });
    post.mockResolvedValue({ ok: true, saga: sagaRow({ id: 5, title: "New work" }) });
    render(<SagasScreen />);
    await waitFor(() => screen.getByTestId("sagas-empty"));
    fireEvent.click(screen.getByTestId("saga-new"));
    fireEvent.change(screen.getByTestId("saga-new-title"), { target: { value: "New work" } });
    fireEvent.click(screen.getByTestId("saga-create"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe("/api/v1/sagas/create");
    expect(post.mock.calls[0][1]).toEqual({ title: "New work" });
    await waitFor(() => screen.getByTestId("saga-title"));   // it opens the new saga
  });

  it("adds an episode with Enter and moves one on with a click on its circle", async () => {
    post.mockResolvedValue({ ok: true });
    render(<SagasScreen />);
    await waitFor(() => screen.getByTestId("saga-row-1")); fireEvent.click(screen.getByTestId("saga-row-1"));
    await waitFor(() => screen.getByTestId("episode-new-title"));
    fireEvent.change(screen.getByTestId("episode-new-title"), { target: { value: "write the docs" } });
    fireEvent.keyDown(screen.getByTestId("episode-new-title"), { key: "Enter" });
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sagas/episode-create", { saga_id: 1, title: "write the docs" }, expect.anything()));
    // the circle of "the form" (doing) moves it to done
    fireEvent.click(screen.getByTestId("episode-status-10").querySelector("svg")!);
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sagas/episode-update", { id: 10, status: "done" }, expect.anything()));
  });

  it("opens an episode, edits its description and assignee, and adds a step", async () => {
    post.mockResolvedValue({ ok: true });
    render(<SagasScreen />);
    await waitFor(() => screen.getByTestId("saga-row-1")); fireEvent.click(screen.getByTestId("saga-row-1"));
    await waitFor(() => screen.getByTestId("episode-row-10")); fireEvent.click(screen.getByText("the form"));
    await waitFor(() => screen.getByTestId("episode-title"));
    fireEvent.change(screen.getByTestId("episode-body"), { target: { value: "use the hosted fields" } }); fireEvent.blur(screen.getByTestId("episode-body"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sagas/episode-update", { id: 10, body: "use the hosted fields" }, expect.anything()));
    fireEvent.change(screen.getByTestId("episode-assignee"), { target: { value: "frontender" } }); fireEvent.blur(screen.getByTestId("episode-assignee"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sagas/episode-update", { id: 10, assignee: "frontender" }, expect.anything()));
    fireEvent.change(screen.getByTestId("step-new-title"), { target: { value: "handle 3-D secure" } }); fireEvent.keyDown(screen.getByTestId("step-new-title"), { key: "Enter" });
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sagas/episode-create", { saga_id: 1, parent_id: 10, title: "handle 3-D secure" }, expect.anything()));
  });

  it("says the serve's own reason when it refuses a write", async () => {
    post.mockRejectedValue(new Error("POST /api/v1/sagas/episode-create → 400: a step cannot have steps"));
    render(<SagasScreen />);
    await waitFor(() => screen.getByTestId("saga-row-1")); fireEvent.click(screen.getByTestId("saga-row-1"));
    await waitFor(() => screen.getByTestId("episode-new-title"));
    fireEvent.change(screen.getByTestId("episode-new-title"), { target: { value: "x" } }); fireEvent.keyDown(screen.getByTestId("episode-new-title"), { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("a step cannot have steps"));
  });

  it("deleting a saga takes two clicks", async () => {
    post.mockResolvedValue({ ok: true });
    render(<SagasScreen />);
    await waitFor(() => screen.getByTestId("saga-row-1")); fireEvent.click(screen.getByTestId("saga-row-1"));
    await waitFor(() => screen.getByTestId("saga-delete")); fireEvent.click(screen.getByTestId("saga-delete"));
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("saga-delete-yes"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sagas/delete", { id: 1 }, expect.anything()));
  });

  it("a finished saga shows neither Cancel nor Delete; a canceled one only Reopen", async () => {
    for (const [status, reopen] of [["done", false], ["failed", false], ["canceled", true]] as const) {
      cleanup(); history.replaceState(null, "", "/sagas");
      get.mockImplementation(async (u: string) => u.includes("/detail") ? detail({ saga: sagaRow({ status }) }) : { ok: true, sagas: [sagaRow({ status })] });
      render(<SagasScreen />);
      await waitFor(() => screen.getByTestId("saga-row-1")); fireEvent.click(screen.getByTestId("saga-row-1"));
      await waitFor(() => screen.getByTestId("saga-title"));
      expect(screen.queryByTestId("saga-cancel"), status).toBeNull();
      expect(screen.queryByTestId("saga-delete"), status).toBeNull();
      expect(!!screen.queryByTestId("saga-reopen"), status).toBe(reopen);
    }
  });

  it("the description grows with its text, and the title wraps instead of being cut off", async () => {
    get.mockImplementation(async (u: string) => u.includes("/detail") ? detail({ saga: sagaRow({ objective: "line\n".repeat(9) + "end", title: "A very long title ".repeat(8) }) }) : { ok: true, sagas: [sagaRow()] });
    // jsdom does no layout: say what the browser would, a taller box for more text
    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", { configurable: true, get() { return 20 * ((this as HTMLTextAreaElement).value.split("\n").length + Math.floor((this as HTMLTextAreaElement).value.length / 80)); } });
    render(<SagasScreen />);
    await waitFor(() => screen.getByTestId("saga-row-1")); fireEvent.click(screen.getByTestId("saga-row-1"));
    await waitFor(() => screen.getByTestId("saga-objective"));
    const obj = screen.getByTestId("saga-objective") as HTMLTextAreaElement;
    expect(parseInt(obj.style.height)).toBeGreaterThan(180);   // ten lines of text: a tall box, not three rows
    expect(obj.style.resize).toBe("none");
    fireEvent.change(obj, { target: { value: "short" } });
    await waitFor(() => expect(parseInt(obj.style.height)).toBeLessThan(60));       // and it shrinks back
    expect(screen.getByTestId("saga-title").tagName).toBe("TEXTAREA");   // a title can wrap
    expect(typeof fitHeight).toBe("function");
  });

  it("has a back button inside a saga and inside an episode", async () => {
    render(<SagasScreen />);
    await waitFor(() => screen.getByTestId("saga-row-1")); fireEvent.click(screen.getByTestId("saga-row-1"));
    await waitFor(() => screen.getByTestId("episode-row-10"));
    expect(screen.getByTestId("back").textContent).toMatch(/Sagas/);
    fireEvent.click(screen.getByText("the form"));
    await waitFor(() => screen.getByTestId("episode-title"));
    expect(screen.getByTestId("back").textContent).toMatch(/Add Stripe checkout/);   // from an episode: back to its saga
    fireEvent.click(screen.getByTestId("back"));
    await waitFor(() => screen.getByTestId("saga-title"));
    fireEvent.click(screen.getByTestId("back"));
    await waitFor(() => screen.getByTestId("saga-row-1"));   // and from the saga: back to the list
  });

  it("shows the agents' faces on the list rows", async () => {
    get.mockImplementation(async () => ({ ok: true, sagas: [sagaRow({ rollup: { ...r0, episodes: 2, done: 1, failed: 1, agents: { "cursor:composer": { n: 2, failed: 1 } }, seats: { "cursor:composer": 2 } } })] }));
    render(<SagasScreen />);
    await waitFor(() => screen.getByTestId("saga-row-1"));
    expect(screen.getByTestId("faces")).toBeTruthy();
    expect(screen.getByTestId("who-failed")).toBeTruthy();
    expect(screen.getByTestId("model-icon-cursor")).toBeTruthy();
  });
});

describe("a disabled Create says why (Grokbot QA 2026-10-12, item 39)", () => {
  beforeEach(() => { history.replaceState(null, "", "/sagas"); get.mockReset(); post.mockReset(); get.mockImplementation(async () => ({ ok: true, sagas: [] })); });
  afterEach(() => cleanup());
  it("the button explains itself, and Enter on an empty title answers instead of doing nothing", async () => {
    render(<SagasScreen />);
    fireEvent.click(await screen.findByTestId("saga-new"));
    const create = screen.getByTestId("saga-create") as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(create.title).toMatch(/title first/);
    fireEvent.keyDown(screen.getByTestId("saga-new-title"), { key: "Enter" });
    expect((await screen.findByRole("alert")).textContent).toMatch(/title first/);
    fireEvent.change(screen.getByTestId("saga-new-title"), { target: { value: "Ship it" } });
    expect((screen.getByTestId("saga-create") as HTMLButtonElement).title).toBe("");   // no stale tooltip once there is a title (round 2, item 11)
  });
});

// THE TRAIL AS THE TIMELINE OF RECORD: what hooks and MCP leave reads as its own kind of line, and a filter cuts the noise
describe("the activity trail of a saga a terminal agent worked on", () => {
  it("draws asked, screened, said, tool, antiloki, refused, concluded and meter lines each with its tag, and the filters narrow them", async () => {
    const { render, screen, fireEvent } = await import("@testing-library/react");
    const { Trail } = await import("./parts");
    const ev = (id: number, kind: string, text: string) => ({ id, task_id: null, t_ms: 1000 + id, actor: "Claude Code", kind, text });
    const long = "x".repeat(300);
    render(<Trail events={[ev(1, "asked", "asked: add a candle"), ev(2, "screen", "pre-check: clear enough, sent as written"), ev(3, "said", long), ev(4, "tool", "Read src/App.tsx"), ev(5, "mcp", "antiloki.antiloki_check src/App.tsx"), ev(6, "refused", "Write .env  [refused: outside the scope]"), ev(7, "answered", "concluded: the candle is in"), ev(8, "usage", "claude-sonnet-5-5 · 1.5k in · 780 out · $0.0412 · 31.0s"), ev(9, "status", "todo → doing")]} />);
    expect(screen.getAllByTestId("trail-tag").map((t) => t.textContent)).toEqual(["asked", "screened", "said", "tool", "antiloki", "refused", "concluded", "meter"]);
    expect(screen.getByText(/pre-check: clear enough/)).toBeTruthy(); expect(screen.getByText(/todo → doing/)).toBeTruthy();   // an old kind still reads as before
    // a long thing the model said is cut, and opens
    expect(screen.getByText(/x{200}…/)).toBeTruthy(); fireEvent.click(screen.getByText("more")); expect(screen.getByText(long)).toBeTruthy();
    // filters
    expect(screen.getByTestId("trail-filter-all").textContent).toContain("9");
    fireEvent.click(screen.getByTestId("trail-filter-tools")); expect(screen.getAllByTestId("trail-tag").map((t) => t.textContent)).toEqual(["tool", "antiloki", "refused"]);
    fireEvent.click(screen.getByTestId("trail-filter-meter")); expect(screen.getAllByTestId("trail-tag").map((t) => t.textContent)).toEqual(["concluded", "meter"]);
  });
  it("a trail of plain statuses has no filters to offer", async () => {
    const { render, screen } = await import("@testing-library/react");
    const { Trail } = await import("./parts");
    render(<Trail events={[{ id: 1, task_id: null, t_ms: 1, actor: "you", kind: "status", text: "todo → doing" }]} />);
    expect(screen.queryByTestId("trail-filters")).toBeNull();
  });
});


// SAGAS FROM ALL WORKSPACES, AND THE PANE (operator 2026-11-10): the page lists every workspace's sagas, each marked with its workspace; the pane inside Cowork shows the open one's
describe("Sagas across workspaces and the embedded pane", () => {
  const ws = (name: string, id: number, title: string) => sagaRow({ id, title, workspace: name, plan_ref: `run:${id}` });
  beforeEach(() => { history.replaceState(null, "", "/sagas"); get.mockReset(); post.mockReset(); });
  afterEach(() => cleanup());
  it("the hash carries the workspace a saga is in, and old links without one still work", async () => {
    const { parseView, hashOf } = await import("./sagas-screen");
    expect(hashOf({ kind: "saga", id: 12, ws: "mini store" })).toBe("#saga/12/mini%20store"); expect(parseView("#saga/12/mini%20store")).toEqual({ kind: "saga", id: 12, ws: "mini store" }); expect(parseView("#saga/12")).toEqual({ kind: "saga", id: 12 });
    expect(hashOf({ kind: "episode", id: 4, saga: 12, ws: "a" })).toBe("#episode/4/12/a"); expect(parseView("#episode/4/12/a")).toEqual({ kind: "episode", id: 4, saga: 12, ws: "a" }); expect(parseView("#episode/4/12")).toEqual({ kind: "episode", id: 4, saga: 12 }); expect(parseView("#saga/12/%E0%A4%A")).toMatchObject({ kind: "saga", id: 12 });
  });
  it("the page asks for every workspace's sagas, marks each with its workspace, filters by one, and opens a saga from the workspace it is in", async () => {
    get.mockImplementation(async (u: string) => u.includes("/detail") ? detail({ saga: ws("wantyos", 7, "Ship the agency pitch") }) : { ok: true, sagas: [ws("ministore", 1, "Add a candle"), ws("wantyos", 7, "Ship the agency pitch")] });
    render(<SagasScreen />);
    await waitFor(() => screen.getByTestId("saga-row-7")); expect(get.mock.calls.some((c) => String(c[0]).includes("/api/v1/sagas?all=1"))).toBe(true);
    expect(screen.getByTestId("saga-row-1").textContent).toContain("ministore"); expect(screen.getByTestId("saga-row-7").textContent).toContain("wantyos"); expect(screen.getByTestId("saga-ws-all").textContent).toContain("2");
    fireEvent.click(screen.getByTestId("saga-ws-wantyos")); expect(screen.queryByTestId("saga-row-1")).toBeNull(); expect(screen.getByTestId("saga-row-7")).toBeTruthy();
    fireEvent.click(screen.getByTestId("saga-row-7")); await waitFor(() => screen.getByTestId("saga-title"));
    expect(get.mock.calls.some((c) => String(c[0]).includes("/api/v1/sagas/detail?id=7&workspace=wantyos"))).toBe(true); expect(location.hash).toBe("#saga/7/wantyos");
    expect(screen.getByTestId("saga-title")).toBeTruthy();
  });
  it("a write in a saga goes to the workspace that saga is in", async () => {
    get.mockImplementation(async (u: string) => u.includes("/detail") ? detail({ saga: ws("wantyos", 7, "Ship the pitch"), episodes: [] }) : { ok: true, sagas: [ws("wantyos", 7, "Ship the pitch"), ws("ministore", 1, "x")] });
    post.mockResolvedValue({ ok: true, episode: episodeRow({ id: 99, saga_id: 7, title: "outline" }) });
    render(<SagasScreen />); await waitFor(() => screen.getByTestId("saga-row-7")); fireEvent.click(screen.getByTestId("saga-row-7")); await waitFor(() => screen.getByTestId("episode-new-title"));
    fireEvent.change(screen.getByTestId("episode-new-title"), { target: { value: "outline" } }); fireEvent.keyDown(screen.getByTestId("episode-new-title"), { key: "Enter" });
    await waitFor(() => expect(post).toHaveBeenCalled()); expect(JSON.stringify(post.mock.calls[0])).toContain("\"workspace\":\"wantyos\"");
  });
  it("the pane inside Cowork shows the open workspace only: no all-workspaces call, no URL, no workspace chips", async () => {
    get.mockImplementation(async () => ({ ok: true, sagas: [sagaRow({ id: 3, title: "Only here" })] }));
    render(<SagasScreen embedded />);
    await waitFor(() => screen.getByTestId("saga-row-3")); expect(screen.getByTestId("sagas-pane")).toBeTruthy(); expect(screen.getByTestId("sagas-pane").getAttribute("style") ?? "").toMatch(/color-mix|blur/); expect(screen.queryByTestId("sagas-screen")).toBeNull();
    expect(get.mock.calls.every((c) => !String(c[0]).includes("all=1"))).toBe(true); expect(screen.queryByTestId("saga-workspaces")).toBeNull();
    get.mockImplementation(async (u: string) => u.includes("/detail") ? detail({ saga: sagaRow({ id: 3, title: "Only here" }) }) : { ok: true, sagas: [sagaRow({ id: 3, title: "Only here" })] });
    fireEvent.click(screen.getByTestId("saga-row-3")); await waitFor(() => screen.getByTestId("saga-title")); expect(location.hash).toBe("");
  });
  it("an agent episode shows its metadata among the saga's properties, and its pane on the list", async () => {
    const meta = { kind: "episode", n: 1, pane: "Backender", pane_id: 7, engine: "claude-code", model: "claude-haiku-5-5", turns: 2, open: false, tokens: { in: 10, out: 20, cache_read: 0, cache_write: 0 }, tools: { Read: 3 }, mcp: {}, files: ["a.ts"], summary_source: "model", summary_model: "claude-haiku-5-5" };
    get.mockImplementation(async (u: string) => u.includes("/detail") ? detail({ saga: sagaRow({ id: 9, title: "Mapped the app", objective: "It read the app.", meta, origin: "Backender" }) }) : { ok: true, sagas: [sagaRow({ id: 9, title: "Mapped the app", meta, origin: "Backender" })] });
    render(<SagasScreen />); await waitFor(() => screen.getByTestId("saga-row-9")); expect(screen.getByTestId("saga-episode-chip").textContent).toBe("Backender");
    fireEvent.click(screen.getByTestId("saga-row-9")); await waitFor(() => screen.getByTestId("saga-title"));
    const txt = document.body.textContent ?? ""; expect(txt).toContain("Backender (#7)"); expect(txt).toContain("claude-code · claude-haiku-5-5"); expect(txt).toContain("Read×3"); expect(txt).toContain("a.ts"); expect((screen.getByTestId("saga-objective") as HTMLTextAreaElement).value).toBe("It read the app.");
  });
});
