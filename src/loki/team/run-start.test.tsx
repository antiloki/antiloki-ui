// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
vi.mock("./api", async (orig) => ({ ...(await orig<any>()), listRequests: vi.fn(async () => []), listSkills: vi.fn(async () => []), controlRun: vi.fn(), answerAt: vi.fn(), workspaceState: vi.fn(async () => null), stashWorkspace: vi.fn(), runTeam: vi.fn() }));
import { TeamRun } from "./TeamRun";

const graph: any = { team: "t", schema: 1, branch: "", budget_usd: 1, start: ["a"], nodes: { a: { node: "leader" } }, edges: [] };
const report: any = { errors: [], warnings: [], worst_usd: 0, budget_usd: 1 };
describe("the team's play button", () => {
  afterEach(() => cleanup());
  it("runs at once with the team name when there is no earlier run", async () => {
    const onRun = vi.fn().mockResolvedValueOnce("the team did not start").mockResolvedValue(null);
    render(<TeamRun graph={graph} report={report} run={null} onEdit={() => {}} onRun={onRun} onChanged={() => {}} />);
    fireEvent.click(screen.getByTestId("run-start")); await waitFor(() => screen.getByTestId("run-note"));
    expect(onRun).toHaveBeenCalledWith("t"); expect(screen.getByTestId("run-note").textContent).toContain("did not start");
    expect(screen.queryByTestId("run-ask-toggle")).toBeNull(); expect(screen.queryByTestId("run-ask")).toBeNull();
  });
  it("runs again with the same ask as the last run", async () => {
    const onRun = vi.fn().mockResolvedValue(null);
    render(<TeamRun graph={graph} report={report} run={{ id: "r1", ask: "Recreate the Linear pane", live: false, state: { status: "done", active: [], done: [], failed: [], nodes: {} }, status: { status: "done" } } as any} onEdit={() => {}} onRun={onRun} onChanged={() => {}} />);
    fireEvent.click(screen.getByTestId("run-start")); await waitFor(() => expect(onRun).toHaveBeenLastCalledWith("Recreate the Linear pane"));
  });
  it("a team that takes the ask needs direction: ▶ opens the Leader instead of running", async () => {
    const onRun = vi.fn().mockResolvedValue(null); const onLead = vi.fn(); const directed: any = { ...graph, nodes: { a: { node: "leader" }, f: { node: "use_tool", tool: { type: "web", name: "fetch", args: { url: "{ask}" } } } } };
    render(<TeamRun graph={directed} report={report} run={null} onEdit={() => {}} onRun={onRun} onChanged={() => {}} onLead={onLead} />);
    fireEvent.click(screen.getByTestId("run-start")); expect(onLead).toHaveBeenCalledTimes(1); expect(onRun).not.toHaveBeenCalled(); expect(screen.queryByTestId("run-ask-toggle")).toBeNull();
  });
});
