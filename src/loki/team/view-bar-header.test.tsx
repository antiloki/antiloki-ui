// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
vi.mock("./api", async (orig) => ({ ...(await orig<any>()), listRequests: vi.fn(async () => []), listSkills: vi.fn(async () => []), controlRun: vi.fn(), answerAt: vi.fn(), workspaceState: vi.fn(async () => null), stashWorkspace: vi.fn(), runTeam: vi.fn() }));
import { TeamRun } from "./TeamRun";
import { HeaderSlot } from "@/loki/cowork/header-slot";

const graph: any = { team: "t", schema: 1, branch: "", budget_usd: 1, start: ["a"], nodes: { a: { node: "leader" } }, edges: [] };
const report: any = { errors: [], warnings: [], worst_usd: 0, budget_usd: 1 };

describe("the Chat / Graph / Editor / Sequence switch of the leader", () => {
  afterEach(() => cleanup());
  it("sits on the pane's top bar (not floating over the chat), as icons only, with the name on hover", async () => {
    const host = document.createElement("div"); host.setAttribute("data-testid", "pane-header"); document.body.appendChild(host);
    const onChat = vi.fn();
    render(<HeaderSlot.Provider value={host}><TeamRun graph={graph} report={report} run={null} chat onChat={onChat} onLeaveChat={() => {}} onEdit={() => {}} onRun={vi.fn()} onChanged={() => {}} /></HeaderSlot.Provider>);
    await waitFor(() => expect(host.querySelector('[data-testid="view-graph"]')).toBeTruthy());
    for (const k of ["chat", "graph", "editor", "sequence"]) expect(host.querySelector(`[data-testid="view-${k}"]`), k).toBeTruthy();   // all four are on the bar
    const bar = host.querySelector('[data-testid="run-header"]') as HTMLElement; expect(bar.style.position).not.toBe("absolute");   // not the floating pill
    const graphBtn = screen.getByTestId("view-graph"); expect(graphBtn.textContent).toBe("");   // an icon, no word beside it
    expect(screen.queryByTestId("view-graph-name")).toBeNull(); fireEvent.mouseEnter(graphBtn);
    expect(screen.getByTestId("view-graph-name").textContent).toBe("Graph"); fireEvent.mouseLeave(graphBtn); expect(screen.queryByTestId("view-graph-name")).toBeNull();
    expect(screen.getByTestId("view-chat").getAttribute("aria-pressed")).toBe("true"); host.remove();
  });
  it("shows the graph's zoom and fit buttons only on the Graph tab, never in the leader's chat", async () => {
    const host = document.createElement("div"); document.body.appendChild(host);
    const mk = (chat: boolean) => <HeaderSlot.Provider value={host}><TeamRun graph={graph} report={report} run={null} chat={chat} onChat={vi.fn()} onLeaveChat={() => {}} onEdit={() => {}} onRun={vi.fn()} onChanged={() => {}} /></HeaderSlot.Provider>;
    const { rerender } = render(mk(true));
    await waitFor(() => expect(host.querySelector('[data-testid="view-graph"]')).toBeTruthy());
    expect(host.querySelector('[data-testid="graph-zoom"]')).toBeNull();   // in the chat: none
    rerender(mk(false));
    await waitFor(() => expect(host.querySelector('[data-testid="graph-zoom"]')).toBeTruthy());   // on the Graph tab: there
    host.remove();
  });
});
