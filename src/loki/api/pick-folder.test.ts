// THE FOLDER PICKER ON LINUX (operator 2026-09-24, from the installed build: "the binary has a bug on click open
// project doesnt open the file explorer to choose a folder" … "folder pick bug was on linux").
//
// Choosing a project folder went to the serve, whose picker is a PowerShell/COM dialog guarded by
// `if !cfg!(windows) { return None }`. On Linux it therefore answered `{"path": null}` with no `supported` field,
// and the caller's default for a missing field is `supported: true` — so a platform with no dialog at all was
// indistinguishable from the operator pressing Cancel. The button opened nothing and said nothing.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const post = vi.fn();
const pickFolder = vi.fn();
const isDesktop = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiPost: (...a: any[]) => post(...a), apiGet: vi.fn(), unwrapResult: (x: any) => x }));
vi.mock("@/loki/desktop/shell", () => ({ pickFolderStrict: () => pickFolder(), isDesktop: () => isDesktop() }));

let pickWorkspaceFolder: typeof import("./dispatch")["pickWorkspaceFolder"];
beforeEach(async () => {
  vi.clearAllMocks();
  pickWorkspaceFolder = (await import("./dispatch")).pickWorkspaceFolder;
});
afterEach(() => vi.resetModules());

describe("picking the project folder", () => {
  it("inside the app it is the shell's own dialog, which exists on every platform", async () => {
    isDesktop.mockReturnValue(true);
    pickFolder.mockResolvedValue("/home/me/dev/my-project");
    expect(await pickWorkspaceFolder()).toEqual({ path: "/home/me/dev/my-project", supported: true });
    expect(post).not.toHaveBeenCalled();  // the Windows-only serve picker is not consulted at all
  });

  it("a cancel in that dialog is a cancel, not a missing dialog", async () => {
    isDesktop.mockReturnValue(true);
    pickFolder.mockResolvedValue(null);
    // supported stays TRUE so the caller says nothing — the operator meant to dismiss it
    expect(await pickWorkspaceFolder()).toEqual({ path: null, supported: true });
  });

  it("if the app's own dialog cannot open, the serve (on the same machine) is asked next, so the person still gets a native window", async () => {
    isDesktop.mockReturnValue(true);
    pickFolder.mockRejectedValue(new Error("no dialog plugin"));
    post.mockResolvedValue({ path: "/home/me/proj", supported: true });
    expect(await pickWorkspaceFolder()).toEqual({ path: "/home/me/proj", supported: true });
    expect(post).toHaveBeenCalledWith("/api/v1/workspaces/pick-folder", {}, { timeoutMs: 300_000 });
  });

  it("in a browser tab it still asks the serve, and believes what the serve says", async () => {
    isDesktop.mockReturnValue(false);
    post.mockResolvedValue({ path: null, supported: false });
    expect(await pickWorkspaceFolder()).toEqual({ path: null, supported: false });
    expect(post).toHaveBeenCalledWith("/api/v1/workspaces/pick-folder", {}, { timeoutMs: 300_000 });

    post.mockResolvedValue({ path: "C:/dev/thing", supported: true });
    expect(await pickWorkspaceFolder()).toEqual({ path: "C:/dev/thing", supported: true });
  });

  it("an older serve that omits `supported` is still read as a cancel, not as a broken machine", async () => {
    isDesktop.mockReturnValue(false);
    post.mockResolvedValue({ path: null });
    expect(await pickWorkspaceFolder()).toEqual({ path: null, supported: true });
  });
});
