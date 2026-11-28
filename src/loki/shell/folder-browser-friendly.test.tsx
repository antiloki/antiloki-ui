// @vitest-environment jsdom
// THE FRIENDLY FOLDER WINDOW (operator 2026-11-23): starts at home, quick places, a clickable path, hidden folders off unless asked, and a New folder button.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiGet = vi.fn(); const apiPost = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...(a as [])), apiPost: (...a: any[]) => apiPost(...(a as [])) }));
import { FolderBrowser, crumbsOf } from "./folder-browser";

const home = { ok: true, path: "/home/u", parent: "/home", error: null, dirs: [{ name: "dev", path: "/home/u/dev" }, { name: "notes", path: "/home/u/notes" }],
  places: [{ name: "Home", path: "/home/u" }, { name: "Desktop", path: "/home/u/Desktop" }, { name: "dev", path: "/home/u/dev" }] };
beforeEach(() => { apiGet.mockReset(); apiPost.mockReset(); });

describe("the path as clickable pieces", () => {
  it("splits a Linux path and a Windows path", () => {
    expect(crumbsOf("/home/u/dev")).toEqual([{ label: "/", path: "/" }, { label: "home", path: "/home" }, { label: "u", path: "/home/u" }, { label: "dev", path: "/home/u/dev" }]);
    expect(crumbsOf("C:\\dev\\site")).toEqual([{ label: "C:", path: "C:\\" }, { label: "dev", path: "C:\\dev" }, { label: "site", path: "C:\\dev\\site" }]);
    expect(crumbsOf("")).toEqual([]);
  });
});

describe("the folder window", () => {
  it("opens at home (it asks for no path), offers the quick places, and a click on one goes there", async () => {
    apiGet.mockResolvedValue(home);
    render(<FolderBrowser onPick={() => {}} onClose={() => {}} />);
    await screen.findByTestId("folder-row-dev");
    expect(apiGet.mock.calls[0][0]).toBe("/api/v1/workspaces/browse");   // no path: the serve starts at the home folder
    expect(screen.getByTestId("folder-place-Desktop")).toBeTruthy();
    apiGet.mockResolvedValue({ ...home, path: "/home/u/Desktop", parent: "/home/u", dirs: [] });
    fireEvent.click(screen.getByTestId("folder-place-Desktop"));
    await waitFor(() => expect(apiGet.mock.calls.at(-1)![0]).toContain("path=%2Fhome%2Fu%2FDesktop"));
  });
  it("hides hidden folders and shows them only when asked", async () => {
    apiGet.mockResolvedValue(home);
    render(<FolderBrowser onPick={() => {}} onClose={() => {}} />);
    await screen.findByTestId("folder-row-dev");
    expect(apiGet.mock.calls[0][0]).not.toContain("hidden");
    fireEvent.click(screen.getByTestId("folder-show-hidden"));
    await waitFor(() => expect(apiGet.mock.calls.at(-1)![0]).toContain("hidden=1"));
  });
  it("makes a new folder inside the one it is standing in, walks into it, and says the serve's reason when it cannot", async () => {
    apiGet.mockResolvedValue(home);
    render(<FolderBrowser onPick={() => {}} onClose={() => {}} />);
    await screen.findByTestId("folder-row-dev");
    fireEvent.click(screen.getByTestId("folder-new"));
    const input = screen.getByTestId("folder-new-name") as HTMLInputElement;
    apiPost.mockResolvedValueOnce({ ok: false, error: "dev already exists here" });
    fireEvent.change(input, { target: { value: "dev" } }); fireEvent.click(screen.getByTestId("folder-new-make"));
    expect((await screen.findByTestId("folder-new-error")).textContent).toContain("already exists");
    apiPost.mockResolvedValueOnce({ ok: true, path: "/home/u/my-app" });
    apiGet.mockResolvedValue({ ok: true, path: "/home/u/my-app", parent: "/home/u", dirs: [], error: null, places: home.places });
    fireEvent.change(input, { target: { value: "my-app" } }); fireEvent.click(screen.getByTestId("folder-new-make"));
    await waitFor(() => expect(apiPost).toHaveBeenLastCalledWith("/api/v1/workspaces/mkdir", { parent: "/home/u", name: "my-app" }, expect.anything()));
    await waitFor(() => expect(screen.getByTestId("folder-browser-at").textContent).toContain("my-app"));
  });
  it("picks the folder it is standing in", async () => {
    apiGet.mockResolvedValue(home); const onPick = vi.fn(); const onClose = vi.fn();
    render(<FolderBrowser onPick={onPick} onClose={onClose} />);
    await screen.findByTestId("folder-row-dev");
    fireEvent.click(screen.getByTestId("folder-browser-pick"));
    expect(onPick).toHaveBeenCalledWith("/home/u"); expect(onClose).toHaveBeenCalled();
  });
});
