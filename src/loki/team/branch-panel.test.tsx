// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
const api = vi.hoisted(() => ({ teamOp: vi.fn(), getTeam: vi.fn() })); vi.mock("./api", () => api);
import { BranchPanel, withEverythingAfter, branchName } from "./BranchPanel";

const g: any = { team: "t", nodes: { a: { node: "role" }, b: { node: "check" }, c: { node: "deliver" }, z: { node: "stop" } }, edges: [{ from: "a", port: "out", to: "b" }, { from: "b", port: "out", to: "c" }] };
afterEach(() => cleanup()); beforeEach(() => { api.teamOp.mockReset(); api.getTeam.mockReset(); });
describe("branches in the editor", () => {
  it("finds a node and everything reachable after it, and names a branch the way the library wants", () => {
    expect(withEverythingAfter(g, "a")).toEqual(["a", "b", "c"]); expect(withEverythingAfter(g, "c")).toEqual(["c"]); expect(withEverythingAfter(g, "nope")).toEqual([]); expect(branchName("  Fetch & Check!! ")).toBe("fetch-check"); expect(branchName("***")).toBe("");
  });
  it("lists the library, adds a branch as a clone and reloads the team", async () => {
    api.teamOp.mockImplementation(async (op: string) => (op === "branch_list" ? { ok: true, branches: [{ name: "fetch-and-check", version: "1.0.0", valid: true }, { file: "bad.yaml", valid: false, error: "hash" }] } : op === "branch_use" ? { ok: true } : { ok: false }));
    api.getTeam.mockResolvedValue({ graph: { ...g, nodes: { ...g.nodes, extra: { node: "code" } } } }); const onGraph = vi.fn();
    render(<BranchPanel team="t" graph={g} selected={null} onGraph={onGraph} />); await waitFor(() => screen.getByTestId("branch-fetch-and-check"));
    fireEvent.click(screen.getByTestId("branch-use-fetch-and-check")); await waitFor(() => expect(api.teamOp).toHaveBeenCalledWith("branch_use", { team: "t", name: "fetch-and-check", mode: "clone", prefix: "fetch-and-check" })); await waitFor(() => expect(onGraph).toHaveBeenCalled()); expect(screen.getByTestId("branch-msg").textContent).toContain("own copy");
  });
  it("saves the selected node with everything after it, says why it cannot before a node is selected, and shows the serve's refusal", async () => {
    api.teamOp.mockImplementation(async (op: string) => (op === "branch_list" ? { ok: true, branches: [] } : { ok: false, error: "a branch needs an input it does not have" }));
    const a = render(<BranchPanel team="t" graph={g} selected={null} onGraph={() => {}} />); await waitFor(() => screen.getByTestId("branch-none")); const save = screen.getByTestId("branch-save") as HTMLButtonElement; expect(save.disabled).toBe(true); expect(save.title).toMatch(/Select a node/); a.unmount();
    render(<BranchPanel team="t" graph={g} selected="a" onGraph={() => {}} />); await waitFor(() => screen.getByTestId("branch-none")); const s2 = screen.getByTestId("branch-save") as HTMLButtonElement; expect(s2.disabled).toBe(true); expect(s2.title).toMatch(/name/); expect(s2.textContent).toContain("3 nodes");
    fireEvent.change(screen.getByTestId("branch-name"), { target: { value: "My Branch" } }); expect(s2.disabled).toBe(false); fireEvent.click(s2);
    await waitFor(() => expect(api.teamOp).toHaveBeenCalledWith("branch_export", expect.objectContaining({ team: "t", nodes: ["a", "b", "c"], meta: expect.objectContaining({ name: "my-branch" }) }))); await waitFor(() => expect(screen.getByTestId("branch-msg").textContent).toContain("needs an input"));
    fireEvent.click(screen.getByTestId("branch-after")); expect(s2.textContent).toContain("1 node");
  });
});
