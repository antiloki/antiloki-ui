import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiGet = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...(a as [])) }));

import { FolderBrowser, listFolder } from "./folder-browser";

const listing = (path: string, parent: string | null, dirs: any[]) => ({ ok: true, path, parent, dirs, error: null });

// NO NATIVE DIALOG IS NOT A DEAD END (operator 2026-09-28: "i tried to add a new workspace and got this: no native
// folder dialog on this machine — type the path instead"). The serve runs on the operator's machine and can list it.
describe("the browser-tab folder chooser", () => {
  beforeEach(() => apiGet.mockReset());

  it("lists folders, marks the git repos, and offers the way back up", async () => {
    apiGet.mockResolvedValue(listing("/home/user", "/home", [
      { name: "dev", path: "/home/user/dev", repo: false },
      { name: "ministore", path: "/home/user/ministore", repo: true },
    ]));
    render(<FolderBrowser onPick={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("folder-row-dev")).toBeTruthy());
    expect(screen.getByTestId("folder-row-..")).toBeTruthy();          // parent
    expect(screen.getByTestId("folder-row-ministore").textContent).toContain("git");
    expect(screen.getByTestId("folder-browser-at").textContent).toBe("/home/user");
  });

  it("walks into a folder, and picks the one it is standing in", async () => {
    apiGet.mockResolvedValueOnce(listing("/home/user", "/home", [{ name: "dev", path: "/home/user/dev" }]));
    apiGet.mockResolvedValueOnce(listing("/home/user/dev", "/home/user", []));
    const picked: string[] = [];
    render(<FolderBrowser onPick={(p) => picked.push(p)} onClose={() => {}} />);
    fireEvent.click(await screen.findByTestId("folder-row-dev"));
    await waitFor(() => expect(screen.getByTestId("folder-browser-at").textContent).toBe("/home/user/dev"));
    // an empty folder is still a choosable folder — that is why picking is separate from walking
    expect(screen.getByText(/no folders in here/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId("folder-browser-pick"));
    expect(picked).toEqual(["/home/user/dev"]);
  });

  it("says what went wrong instead of showing an empty list", async () => {
    apiGet.mockResolvedValue({ ok: false, path: "/nope", parent: null, dirs: [], error: "No such file or directory" });
    render(<FolderBrowser start="/nope" onPick={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/No such file or directory/)).toBeTruthy());
    expect((screen.getByTestId("folder-browser-pick") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a thrown request is an error on screen, not a crash", async () => {
    // keyed on the path, and everything else still resolves: an effect left in flight by the previous test's
    // unmount would otherwise pick up a blanket rejection and report it unhandled before anyone caught it
    apiGet.mockImplementation(async (url: string) =>
      String(url).includes("%2Fx") ? Promise.reject(new Error("offline")) : listing("/", null, []));
    const r = await listFolder("/x");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("offline");
    expect(r.dirs).toEqual([]);
  });
});
