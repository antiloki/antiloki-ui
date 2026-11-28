// @vitest-environment jsdom
// THE NEW-WORKSPACE WINDOW (operator 2026-09-30): "on clicking to select the folder the dropdown menu collapses and i have to try again from start".
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const addWorkspace = vi.fn(); const activateWorkspace = vi.fn(); const pickWorkspaceFolder = vi.fn();
vi.mock("@/loki/api/dispatch", () => ({ addWorkspace: (...a: any[]) => addWorkspace(...a), activateWorkspace: (...a: any[]) => activateWorkspace(...a), pickWorkspaceFolder: () => pickWorkspaceFolder(), removeWorkspace: vi.fn(), pickFolder: vi.fn() }));
vi.mock("@/loki/api/hooks", () => ({ WORKSPACES_CHANGED: "antiloki:workspaces-changed", useWorkspaces: () => ({ data: { active: null, workspaces: [] }, refetch: vi.fn() }) }));
vi.mock("./folder-browser", () => ({ FolderBrowser: ({ onPick, onClose }: any) => <div data-testid="folder-browser"><button data-testid="fb-pick" onClick={() => { onPick("/browsed/My Project"); onClose(); }}>pick</button></div> }));
import { NewWorkspaceDialogHost, openNewWorkspace, closeNewWorkspace, isNewWorkspaceOpen, suggestName, formProblem, newWorkspaceForm } from "./new-workspace-dialog";

beforeEach(() => { addWorkspace.mockReset().mockResolvedValue({ ok: true, name: "x" }); activateWorkspace.mockReset().mockResolvedValue({ ok: true }); pickWorkspaceFolder.mockReset().mockResolvedValue({ path: "/chosen/my-app", supported: true }); closeNewWorkspace(); });
afterEach(() => closeNewWorkspace());

describe("pure helpers", () => {
  it("makes a slug from a folder, on either kind of path", () => {
    expect(suggestName("/home/me/projects/My Project/")).toBe("my-project");
    expect(suggestName("C:\\dev\\Shop_Front")).toBe("shop_front");
    expect(suggestName("/x/.hidden-thing")).toBe("hidden-thing");
    expect(suggestName("")).toBe("");
  });
  it("says what is wrong with the form", () => {
    expect(formProblem("a", "")).toMatch(/choose the project folder/);
    expect(formProblem("not a slug", "/p")).toMatch(/slug/);
    expect(formProblem("ok-1", "/p")).toBeNull();
  });
});

describe("the window", () => {
  it("is centered over everything, and only exists once opened", () => {
    render(<NewWorkspaceDialogHost />);
    expect(screen.queryByTestId("new-workspace-dialog")).toBeNull();
    act(() => openNewWorkspace());
    const o = screen.getByTestId("new-workspace-overlay");
    expect(o.style.position).toBe("fixed"); expect(o.style.display).toBe("flex"); expect(o.style.alignItems).toBe("center"); expect(o.style.justifyContent).toBe("center");
    expect(screen.getByTestId("new-workspace-dialog").getAttribute("role")).toBe("dialog");
  });

  it("THE BUG: closing the dropdown that opened it, or any unmount of the menu, loses nothing - the form lives in the store", () => {
    // the dropdown is a different tree (a hover menu); the host is mounted once at the root
    const menu = render(<button data-testid="menu-item" onClick={() => openNewWorkspace()}>new workspace…</button>);
    const host = render(<NewWorkspaceDialogHost />);
    fireEvent.click(screen.getByTestId("menu-item"));
    fireEvent.change(screen.getByTestId("new-workspace-path"), { target: { value: "/home/me/shop" } });
    fireEvent.change(screen.getByTestId("new-workspace-name"), { target: { value: "my-shop" } });
    menu.unmount();                                                       // the pointer left the menu, it closed: this used to destroy the form
    expect((screen.getByTestId("new-workspace-path") as HTMLInputElement).value).toBe("/home/me/shop");
    expect((screen.getByTestId("new-workspace-name") as HTMLInputElement).value).toBe("my-shop");
    // and even the HOST re-mounting (a route change) keeps what was typed, because the store holds it
    host.unmount(); render(<NewWorkspaceDialogHost />);
    expect((screen.getByTestId("new-workspace-path") as HTMLInputElement).value).toBe("/home/me/shop");
    expect(newWorkspaceForm().name).toBe("my-shop");
  });

  it("choosing a folder fills the path AND suggests the name, until the operator types a name of their own", async () => {
    render(<NewWorkspaceDialogHost />); act(() => openNewWorkspace());
    fireEvent.click(screen.getByTestId("new-workspace-choose"));
    await waitFor(() => expect((screen.getByTestId("new-workspace-path") as HTMLInputElement).value).toBe("/chosen/my-app"));
    expect((screen.getByTestId("new-workspace-name") as HTMLInputElement).value).toBe("my-app");
    fireEvent.change(screen.getByTestId("new-workspace-name"), { target: { value: "mine" } });
    fireEvent.change(screen.getByTestId("new-workspace-path"), { target: { value: "/other/place" } });
    expect((screen.getByTestId("new-workspace-name") as HTMLInputElement).value).toBe("mine");          // their name is not overwritten
  });

  it("a host with no native dialog gets the browser right inside the window", async () => {
    pickWorkspaceFolder.mockResolvedValue({ path: null, supported: false });
    render(<NewWorkspaceDialogHost />); act(() => openNewWorkspace());
    fireEvent.click(screen.getByTestId("new-workspace-choose"));
    await waitFor(() => expect(screen.getByTestId("folder-browser")).toBeTruthy());
    fireEvent.click(screen.getByTestId("fb-pick"));
    expect((screen.getByTestId("new-workspace-path") as HTMLInputElement).value).toBe("/browsed/My Project");
    expect((screen.getByTestId("new-workspace-name") as HTMLInputElement).value).toBe("my-project");
  });

  it("refuses an incomplete form without touching the serve", () => {
    render(<NewWorkspaceDialogHost />); act(() => openNewWorkspace());
    fireEvent.click(screen.getByTestId("new-workspace-create"));
    expect(screen.getByTestId("new-workspace-error").textContent).toMatch(/choose the project folder/);
    fireEvent.change(screen.getByTestId("new-workspace-path"), { target: { value: "/p" } });
    fireEvent.change(screen.getByTestId("new-workspace-name"), { target: { value: "not a slug" } });
    fireEvent.click(screen.getByTestId("new-workspace-create"));
    expect(screen.getByTestId("new-workspace-error").textContent).toMatch(/slug/);
    expect(addWorkspace).not.toHaveBeenCalled();
  });

  it("creates the workspace, switches to it by default, tells the list to refresh, and closes", async () => {
    const changed = vi.fn(); window.addEventListener("antiloki:workspaces-changed", changed);
    render(<NewWorkspaceDialogHost />); act(() => openNewWorkspace());
    fireEvent.change(screen.getByTestId("new-workspace-path"), { target: { value: "/home/me/shop" } });
    fireEvent.click(screen.getByTestId("new-workspace-create"));
    await waitFor(() => expect(addWorkspace).toHaveBeenCalledWith("shop", "/home/me/shop"));
    await waitFor(() => expect(activateWorkspace).toHaveBeenCalledWith("shop"));
    await waitFor(() => expect(isNewWorkspaceOpen()).toBe(false));
    expect(changed).toHaveBeenCalled();
    window.removeEventListener("antiloki:workspaces-changed", changed);
  });

  it("does not switch when 'switch to it now' is unticked", async () => {
    render(<NewWorkspaceDialogHost />); act(() => openNewWorkspace());
    fireEvent.change(screen.getByTestId("new-workspace-path"), { target: { value: "/home/me/shop" } });
    fireEvent.click(screen.getByTestId("new-workspace-switch"));
    fireEvent.click(screen.getByTestId("new-workspace-create"));
    await waitFor(() => expect(addWorkspace).toHaveBeenCalled());
    await waitFor(() => expect(isNewWorkspaceOpen()).toBe(false));
    expect(activateWorkspace).not.toHaveBeenCalled();
  });

  it("stays open and says why when the serve refuses, keeping everything typed", async () => {
    addWorkspace.mockResolvedValue({ ok: false, error: "path is not a git repo" });
    render(<NewWorkspaceDialogHost />); act(() => openNewWorkspace());
    fireEvent.change(screen.getByTestId("new-workspace-path"), { target: { value: "/home/me/shop" } });
    fireEvent.click(screen.getByTestId("new-workspace-create"));
    await waitFor(() => expect(screen.getByTestId("new-workspace-error").textContent).toContain("path is not a git repo"));
    expect((screen.getByTestId("new-workspace-path") as HTMLInputElement).value).toBe("/home/me/shop");
  });

  it("closes with Escape, the close button, cancel and a click outside - never while it is working", () => {
    render(<NewWorkspaceDialogHost />);
    act(() => openNewWorkspace()); fireEvent.keyDown(window, { key: "Escape" }); expect(isNewWorkspaceOpen()).toBe(false);
    act(() => openNewWorkspace()); fireEvent.click(screen.getByTestId("new-workspace-close")); expect(isNewWorkspaceOpen()).toBe(false);
    act(() => openNewWorkspace()); fireEvent.click(screen.getByTestId("new-workspace-cancel")); expect(isNewWorkspaceOpen()).toBe(false);
    act(() => openNewWorkspace()); fireEvent.mouseDown(screen.getByTestId("new-workspace-overlay")); expect(isNewWorkspaceOpen()).toBe(false);
    act(() => openNewWorkspace()); fireEvent.mouseDown(screen.getByTestId("new-workspace-dialog")); expect(isNewWorkspaceOpen()).toBe(true);      // a click INSIDE keeps it
  });

  it("Escape inside the folder browser closes only the browser; a second Escape closes the window (audit 2026-10-01)", async () => {
    pickWorkspaceFolder.mockResolvedValue({ path: null, supported: false });
    render(<NewWorkspaceDialogHost />); act(() => openNewWorkspace());
    fireEvent.click(screen.getByTestId("new-workspace-choose"));
    await waitFor(() => expect(screen.getByTestId("folder-browser")).toBeTruthy());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("folder-browser")).toBeNull();
    expect(isNewWorkspaceOpen()).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(isNewWorkspaceOpen()).toBe(false);
  });

  it("while the native folder dialog is open the window cannot be closed - not by the X and not by cancel - so its late answer never lands in a closed form", async () => {
    let answer!: (v: any) => void; pickWorkspaceFolder.mockReturnValue(new Promise((r) => { answer = r; }));
    render(<NewWorkspaceDialogHost />); act(() => openNewWorkspace());
    fireEvent.click(screen.getByTestId("new-workspace-choose"));
    await waitFor(() => expect((screen.getByTestId("new-workspace-choose") as HTMLButtonElement).textContent).toContain("waiting"));
    expect((screen.getByTestId("new-workspace-close") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("new-workspace-cancel") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("new-workspace-close")); fireEvent.click(screen.getByTestId("new-workspace-cancel"));
    expect(isNewWorkspaceOpen()).toBe(true);
    await act(async () => { answer({ path: "/late/answer", supported: true }); });
    expect((screen.getByTestId("new-workspace-path") as HTMLInputElement).value).toBe("/late/answer");
    expect((screen.getByTestId("new-workspace-close") as HTMLButtonElement).disabled).toBe(false);
  });
});
