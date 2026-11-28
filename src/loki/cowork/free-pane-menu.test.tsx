// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
const api = vi.hoisted(() => ({ panesOp: vi.fn(), loadWebApps: vi.fn(async () => ({ catalog: [], installed: [] })) }));
vi.mock("./api", () => api);
import { AddPaneMenu } from "./AddPaneMenu";
import { parseLayout, serializeLayout } from "./layout";

describe("your panes in the new-pane menu", () => {
  afterEach(() => cleanup());
  it("lists the project's pane folders with their state and picks one as a free pane", async () => {
    api.panesOp.mockResolvedValue({ ok: true, panes: [{ id: "my-issues", title: "My issues", approved: true, problems: [] }, { id: "draft-one", title: "Draft one", approved: false, problems: [] }, { id: "broken", title: "Broken", approved: false, problems: ["`pane.json` is missing"] }] });
    const onPick = vi.fn(); render(<AddPaneMenu engines={[]} anchor={{ left: 0, top: 0 }} atLimit={null} onPick={onPick} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("pick-free-menu")); await waitFor(() => screen.getByTestId("pick-free-my-issues"));
    expect(screen.getByTestId("pick-free-my-issues").textContent).toContain("approved"); expect(screen.getByTestId("pick-free-draft-one").textContent).toContain("draft"); expect(screen.getByTestId("pick-free-broken").textContent).toContain("problem"); expect(screen.getByTestId("pick-free-broken").getAttribute("title")).toContain("pane.json");
    fireEvent.click(screen.getByTestId("pick-free-my-issues")); expect(onPick).toHaveBeenCalledWith({ kind: "free", id: "my-issues", title: "My issues" }, expect.anything());
  });
  it("says so when there are none", async () => { api.panesOp.mockResolvedValue({ ok: true, panes: [] }); render(<AddPaneMenu engines={[]} anchor={{ left: 0, top: 0 }} atLimit={null} onPick={() => {}} onClose={() => {}} />); fireEvent.click(screen.getByTestId("pick-free-menu")); await waitFor(() => screen.getByTestId("free-none")); });
  it("keeps a free pane's folder through a save and a load of the layout, and drops a name that is not one", () => {
    const l: any = { root: { type: "leaf", pane: { id: "free-x-1", kind: "tool", tool: "free", title: "X", free: { id: "my-issues" } } }, focus: null, zoom: null };
    const back = parseLayout(JSON.parse(serializeLayout(l))) as any; const pane = (n: any): any => (n?.type === "leaf" ? n.pane : null); expect(pane(back.root)?.free).toEqual({ id: "my-issues" });
    const bad = parseLayout(JSON.parse(JSON.stringify({ root: { type: "leaf", pane: { id: "free-y-1", kind: "tool", tool: "free", free: { id: "../etc" } } }, focus: null, zoom: null }))) as any; expect(pane(bad.root)?.free).toBeUndefined();
  });
});
