// @vitest-environment jsdom
// THE GATE (operator 2026-11-23): with no workspace there is no start page. The shell is drawn behind, untouchable, and ONE glassy button
// in the middle chooses a folder; choosing it creates and opens the workspace. Nothing else is asked.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const hooks: { data: any; loading: boolean; refetch: ReturnType<typeof vi.fn> } = { data: null, loading: false, refetch: vi.fn() };
const addWorkspace = vi.fn(); const activateWorkspace = vi.fn(); const pickWorkspaceFolder = vi.fn();
vi.mock("@/loki/api/hooks", () => ({ useWorkspaces: () => hooks }));
vi.mock("@/loki/api/dispatch", () => ({ addWorkspace: (...a: any[]) => addWorkspace(...a), activateWorkspace: (...a: any[]) => activateWorkspace(...a), removeWorkspace: vi.fn(), pickWorkspaceFolder: (...a: any[]) => pickWorkspaceFolder(...a) }));
vi.mock("@/loki/api/client", () => ({ apiGet: vi.fn(async () => ({ ok: true, path: "/home/u", parent: null, dirs: [{ name: "proj", path: "/home/u/proj" }], error: null })) }));
import { WorkspaceGate } from "./workspace-gate";

const ws = (name: string, over: any = {}) => ({ id: name.length, name, root_path: `/p/${name}`, db_dir: `/p/${name}/.antiloki/db`, is_active: 0, ...over });
const gate = (child: React.ReactNode = <div data-testid="shell">the shell</div>) => render(<WorkspaceGate>{child}</WorkspaceGate>);
beforeEach(() => {
  hooks.data = { active: null, workspaces: [] }; hooks.loading = false; hooks.refetch = vi.fn();
  addWorkspace.mockReset(); activateWorkspace.mockReset(); pickWorkspaceFolder.mockReset();
});

describe("what the gate shows", () => {
  it("a quiet splash while the first answer is on its way", () => {
    hooks.data = null; hooks.loading = true;
    gate();
    expect(screen.getByText("connecting to the substrate…")).toBeTruthy();
    expect(screen.queryByTestId("gate-choose")).toBeNull();
  });
  it("the shell alone once a workspace is active", () => {
    hooks.data = { active: ws("main", { is_active: 1 }), workspaces: [ws("main", { is_active: 1 })] };
    gate();
    expect(screen.getByTestId("shell")).toBeTruthy();
    expect(screen.queryByTestId("gate-choose")).toBeNull();
  });
  it("with nothing active: the same picture and layout as an empty thread, one button that says Start here, no old start page", () => {
    gate();
    expect(screen.getByTestId("gate-choose").textContent).toBe("Start here");
    expect(screen.getByTestId("gate-card").textContent).toContain("No folder yet");
    expect(screen.queryByTestId("shell")).toBeNull();
    expect(screen.queryByText("choose a workspace")).toBeNull();
    expect(screen.queryByText(/Create a new workspace/)).toBeNull();
    expect(screen.queryByTestId("gate-path")).toBeNull();
  });
  it("offers the registered workspaces as small chips, not the self-hosting one, the active one or a missing folder", () => {
    hooks.data = { active: null, workspaces: [ws("alpha"), ws("beta"), ws("self", { db_dir: null }), ws("gone", { missing: true })] };
    gate();
    expect(screen.getByText("▣ alpha")).toBeTruthy(); expect(screen.getByText("▣ beta")).toBeTruthy();
    expect(screen.queryByText("▣ self")).toBeNull(); expect(screen.queryByText("▣ gone")).toBeNull();
  });
});

describe("choosing a folder", () => {
  it("the native dialog's folder becomes a workspace named after it, is opened, and the gate looks again", async () => {
    pickWorkspaceFolder.mockResolvedValue({ path: "/work/My App", supported: true });
    addWorkspace.mockResolvedValue({ ok: true }); activateWorkspace.mockResolvedValue({ ok: true });
    gate();
    fireEvent.click(screen.getByTestId("gate-choose"));
    await waitFor(() => expect(hooks.refetch).toHaveBeenCalled());
    expect(addWorkspace).toHaveBeenCalledWith("my-app", "/work/My App");
    expect(activateWorkspace).toHaveBeenCalledWith("my-app");
  });
  it("a Windows path is named by its last segment too", async () => {
    pickWorkspaceFolder.mockResolvedValue({ path: "C:\\dev\\site", supported: true });
    addWorkspace.mockResolvedValue({ ok: true }); activateWorkspace.mockResolvedValue({ ok: true });
    gate(); fireEvent.click(screen.getByTestId("gate-choose"));
    await waitFor(() => expect(addWorkspace).toHaveBeenCalledWith("site", "C:\\dev\\site"));
  });
  it("a cancelled dialog is silent: no error, no folder browser", async () => {
    pickWorkspaceFolder.mockResolvedValue({ path: null, supported: true });
    gate(); fireEvent.click(screen.getByTestId("gate-choose"));
    await waitFor(() => expect(pickWorkspaceFolder).toHaveBeenCalled());
    expect(screen.queryByTestId("gate-error")).toBeNull(); expect(screen.queryByTestId("folder-browser")).toBeNull(); expect(addWorkspace).not.toHaveBeenCalled();
  });
  it("on Linux antiloki's own folder window opens at once (the system dialogs differ and start in a random folder); nothing is asked of the serve's dialog", async () => {
    const was = Object.getOwnPropertyDescriptor(Navigator.prototype, "platform");
    Object.defineProperty(navigator, "platform", { value: "Linux x86_64", configurable: true });
    try { gate(); fireEvent.click(screen.getByTestId("gate-choose")); expect(await screen.findByTestId("folder-browser")).toBeTruthy(); expect(pickWorkspaceFolder).not.toHaveBeenCalled(); }
    finally { delete (navigator as any).platform; if (was) Object.defineProperty(Navigator.prototype, "platform", was); }
  });
  it("a host with no dialog opens the in-app folder browser instead", async () => {
    pickWorkspaceFolder.mockResolvedValue({ path: null, supported: false });
    gate(); fireEvent.click(screen.getByTestId("gate-choose"));
    expect(await screen.findByTestId("folder-browser")).toBeTruthy();
  });
  it("says the serve's own reason when the workspace cannot be added, and does not activate it", async () => {
    pickWorkspaceFolder.mockResolvedValue({ path: "/work/app", supported: true });
    addWorkspace.mockResolvedValue({ ok: false, error: "that folder is already a workspace named other" });
    gate(); fireEvent.click(screen.getByTestId("gate-choose"));
    expect((await screen.findByTestId("gate-error")).textContent).toContain("already a workspace named other");
    expect(activateWorkspace).not.toHaveBeenCalled();
  });
  it("opens a registered workspace from its chip, and says why when it cannot", async () => {
    hooks.data = { active: null, workspaces: [ws("alpha")] };
    activateWorkspace.mockResolvedValueOnce({ ok: false, error: "folder is locked" }).mockResolvedValueOnce({ ok: true });
    gate(); fireEvent.click(screen.getByText("▣ alpha"));
    expect((await screen.findByTestId("gate-error")).textContent).toContain("folder is locked");
    fireEvent.click(screen.getByText("▣ alpha"));
    await waitFor(() => expect(hooks.refetch).toHaveBeenCalled());
    expect(activateWorkspace).toHaveBeenLastCalledWith("alpha");
  });
});
