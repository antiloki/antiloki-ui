// The cross-agent git view. Its conflict analysis is DETERMINISTIC (a git merge-tree dry run), and
// the resolver it spawns is a real agent with write access — so the mission it is given must name
// both branches, both intents and the exact conflicting files, and the widget must say plainly that
// the result still passes the normal merge gate. A resolver spawned with a vague mission is how two
// worktrees get merged by discarding one side.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const apiPost = vi.fn();
const sayToAgent = vi.fn();
const listAgents = vi.fn();

// the resolver runs on the seat the serve plans on (review 2026-10-01: a fixed Claude Code) - here Codex, Claude being switched off
vi.mock("@/loki/api/client", () => ({ apiPost: (...a: any[]) => apiPost(...a), apiGet: async () => ({ engines: [{ key: "claude-code", name: "Claude", usable: false, on: false }, { key: "codex", name: "Codex", usable: true, on: true }, { key: "gemini", name: "Gemini", usable: true, on: true }], heimdall: { effective: "codex" } }) }));
vi.mock("./cockpit-pane-body", () => ({ CockpitPaneBody: (p: any) => <div data-testid="pane-body">{p.kind}:{p.paneId}</div> }));
vi.mock("./agent-interact", () => ({
  sayToAgent: (...a: any[]) => sayToAgent(...a),
  listAgents: (...a: any[]) => listAgents(...a),
}));

import { SharedDiffWidget } from "./shared-diff-widget";

const pane = (id: number, kind: string, files: string[], branch = `b-${id}`) => ({ pane_id: id, kind, files, branch });
const view = (over: any = {}) => ({
  ok: true, session_id: 5,
  panes: [pane(1, "claude-code", ["src/a.ts", "src/b.ts"]), pane(2, "codex", ["src/a.ts"])],
  overlaps: [{ path: "src/a.ts", status: "conflict", pane_ids: [1, 2] }],
  conflicts: [{ a: 1, b: 2, files: ["src/a.ts"] }],
  proposal: null,
  ...over,
});

const wire = (body: any) => apiPost.mockImplementation(async (path: string) =>
  path.includes("/shared-diff") ? body : { pane: { id: 99 } });

const mount = async (body: any = view(), ctx: any = { chatSessionId: 3 }) => {
  wire(body);
  const r = render(<SharedDiffWidget payload={{}} ctx={ctx} />);
  await waitFor(() => expect(apiPost).toHaveBeenCalled());
  return r;
};

beforeEach(() => {
  apiPost.mockReset();
  sayToAgent.mockReset().mockResolvedValue({ ok: true });
  listAgents.mockReset().mockResolvedValue([{ id: 1, kind: "claude-code", name: "a" }, { id: 2, kind: "codex", name: "b" }]);
});
afterEach(() => vi.useRealTimers());

describe("the matrix", () => {
  it("counts agents, overlaps and conflicting pairs", async () => {
    await mount();
    await waitFor(() => expect(screen.getByText(/2 agents · 1 overlap · 1 conflict pair · live/)).toBeTruthy());
  });

  it("names each agent by its engine, with its branch and file count", async () => {
    await mount();
    // the name appears in the matrix header AND in the conflict line — take the matrix rows
    const header = (name: string) => screen.getAllByText(new RegExp(name)).map((e) => e.textContent!).find((t) => t.includes("·"))!;
    await waitFor(() => expect(header("Claude Code")).toBeTruthy());
    expect(header("Claude Code")).toContain("b-1 · 2 files");
    expect(header("Codex")).toContain("1 file");
  });

  it("marks a shared file and says who else touched it", async () => {
    await mount();
    await waitFor(() => expect(screen.getAllByTitle(/real conflict/).length).toBeGreaterThan(0));
    expect(screen.getAllByTitle(/also changed by Codex/).length).toBeGreaterThan(0);
  });

  it("distinguishes a clean merge and an uncommitted worktree from a real conflict", async () => {
    await mount(view({
      overlaps: [
        { path: "src/a.ts", status: "conflict", pane_ids: [1, 2] },
        { path: "src/b.ts", status: "clean-merge", pane_ids: [1, 2] },
      ],
    }));
    await waitFor(() => expect(screen.getAllByTitle(/merges clean/).length).toBeGreaterThan(0));
    const conflictChip = screen.getAllByTitle(/real conflict/)[0] as HTMLElement;
    const cleanChip = screen.getAllByTitle(/merges clean/)[0] as HTMLElement;
    expect(conflictChip.style.color).not.toBe(cleanChip.style.color);
  });

  it("says so when no agent has a worktree yet", async () => {
    await mount(view({ panes: [], overlaps: [], conflicts: [] }));
    await waitFor(() => expect(screen.getByText(/no agent worktrees in this session yet/)).toBeTruthy());
  });

  it("surfaces the analyser's own error instead of rendering an empty matrix", async () => {
    await mount({ ok: false, error: "git merge-tree unavailable" });
    await waitFor(() => expect(screen.getByText(/⚠ git merge-tree unavailable/)).toBeTruthy());
  });

  it("re-reads on demand and on a timer", async () => {
    vi.useFakeTimers();
    wire(view());
    render(<SharedDiffWidget payload={{}} ctx={{ chatSessionId: 3 }} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const first = apiPost.mock.calls.filter((c) => String(c[0]).includes("/shared-diff")).length;
    await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
    expect(apiPost.mock.calls.filter((c) => String(c[0]).includes("/shared-diff")).length).toBeGreaterThan(first);
  });
});

describe("spawning the merge resolver", () => {
  const spawn = async () => {
    await mount();
    await waitFor(() => expect(screen.getByText(/spawn merge agent/)).toBeTruthy());
    await waitFor(() => expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("codex"));   // the seat the serve plans on, once read
    fireEvent.click(screen.getByText(/spawn merge agent/));
  };

  it("gives the resolver a mission naming both branches, both intents and the files", async () => {
    await spawn();
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/api/v1/cockpit/pane/add", expect.anything(), expect.anything()));
    const body = apiPost.mock.calls.find((c) => String(c[0]).includes("/pane/add"))![1];
    expect(body.extra_prompt_md).toContain("MERGE MISSION");
    expect(body.extra_prompt_md).toContain("Branch A: b-1 (Claude Code)");
    expect(body.extra_prompt_md).toContain("Branch B: b-2 (Codex)");
    expect(body.extra_prompt_md).toContain("Conflicting files: src/a.ts");
    expect(body.extra_prompt_md).toContain("PRESERVING BOTH INTENTS");
    expect(body.extra_prompt_md).toContain("run the build + relevant tests as PROOF");
  });

  it("scopes the resolver to the conflicting files only", async () => {
    await spawn();
    await waitFor(() => expect(apiPost.mock.calls.some((c) => String(c[0]).includes("/pane/add"))).toBe(true));
    const body = apiPost.mock.calls.find((c) => String(c[0]).includes("/pane/add"))![1];
    expect(body.scope).toEqual(["src/a.ts"]);
    expect(body.session_id).toBe(5);
  });

  it("defaults to the seat the serve plans on and does not offer the switched-off Claude", async () => {
    await mount();
    await waitFor(() => expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("codex"));
    expect(Array.from((screen.getByRole("combobox") as HTMLSelectElement).options).map((o) => o.value)).toEqual(["codex", "gemini"]);
  });

  it("uses the engine the operator picked", async () => {
    await mount();
    await waitFor(() => expect(screen.getByRole("combobox")).toBeTruthy());
    await waitFor(() => expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("codex"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "gemini" } });
    fireEvent.click(screen.getByText(/spawn merge agent/));
    await waitFor(() => expect(apiPost.mock.calls.find((c) => String(c[0]).includes("/pane/add"))![1].pane_kind).toBe("gemini"));
  });

  it("says the result still passes the merge gate", async () => {
    await spawn();
    await waitFor(() => expect(screen.getByText(/its result still passes the merge gate/)).toBeTruthy());
  });

  it("attaches the resolver's terminal so the operator can watch it", async () => {
    await spawn();
    await waitFor(() => expect(screen.getByTestId("pane-body").textContent).toBe("codex:99"));
    fireEvent.click(screen.getByText("hide"));
    expect(screen.queryByTestId("pane-body")).toBeNull();
  });

  it("reports a failed spawn rather than pretending an agent exists", async () => {
    apiPost.mockImplementation(async (path: string) =>
      path.includes("/shared-diff") ? view() : { error: "no worktree host" });
    render(<SharedDiffWidget payload={{}} ctx={{ chatSessionId: 3 }} />);
    await waitFor(() => expect(screen.getByText(/spawn merge agent/)).toBeTruthy());
    await waitFor(() => expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("codex"));
    fireEvent.click(screen.getByText(/spawn merge agent/));
    await waitFor(() => expect(screen.getByText(/⚠ no worktree host/)).toBeTruthy());
    expect(screen.queryByTestId("pane-body")).toBeNull();
  });
});

describe("standup all", () => {
  it("pings every running agent and reports how many", async () => {
    await mount();
    fireEvent.click(screen.getByTitle(/ping EVERY running agent/));
    await waitFor(() => expect(sayToAgent).toHaveBeenCalledTimes(2));
    expect(sayToAgent.mock.calls[0][1]).toContain("done / now / blocked");
    await waitFor(() => expect(screen.getByText(/standup pinged 2 agents/)).toBeTruthy());
  });

  it("says so when there is nobody to ping", async () => {
    listAgents.mockResolvedValue([]);
    await mount();
    fireEvent.click(screen.getByTitle(/ping EVERY running agent/));
    await waitFor(() => expect(screen.getByText(/⚠ no agent panes/)).toBeTruthy());
  });
});

describe("the integration proposal", () => {
  it("shows the deterministic order when there is one", async () => {
    await mount(view({ proposal: { note: "merge the smaller worktree first", order: [2, 1] } }));
    await waitFor(() => expect(screen.getByText(/merge the smaller worktree first/)).toBeTruthy());
    expect(screen.getByText(/order: Codex → Claude Code/)).toBeTruthy();
  });

  it("shows nothing when the analyser proposed nothing", async () => {
    await mount();
    await waitFor(() => expect(screen.getByText(/⇄ shared diff/)).toBeTruthy());
    expect(screen.queryByText(/proposal:/)).toBeNull();
  });
});
