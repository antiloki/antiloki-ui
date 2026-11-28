// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
vi.mock("@/loki/api/client", () => ({ BE_URL: "http://be" }));
const api = vi.hoisted(() => ({ panesOp: vi.fn(), loadWebApps: vi.fn(async () => ({ catalog: [], installed: [] })) }));
vi.mock("./api", () => api);
import { AddPaneMenu } from "./AddPaneMenu";
import { FreePane } from "./FreePane";
import { FreePaneExportButton } from "./FreePaneExportButton";
import { fileNameFor, parseImport } from "./panebundle";

afterEach(() => cleanup());
describe("a pane as one file", () => {
  it("names the file after the pane and reads only a pane's export or a team's bundle", () => {
    expect(fileNameFor("my-issues")).toBe("antiloki-pane-my-issues.json"); expect(fileNameFor("a/../b")).toBe("antiloki-pane-a----b.json");
    expect(parseImport(JSON.stringify({ schema: "antiloki-pane/1", kind: "export", id: "x" }))).toMatchObject({ op: "import" }); expect(parseImport(JSON.stringify({ id: "x", manifest: {}, files: {} }))).toMatchObject({ op: "install" });
    for (const bad of ["nope", "[]", "{}", JSON.stringify({ schema: "antiloki-pane/1" }), "x".repeat(3 * 1024 * 1024 + 1)]) expect(typeof parseImport(bad)).toBe("string");
  });
});
describe("importing and exporting from the screen", () => {
  beforeEach(() => { api.panesOp.mockReset(); });
  const file = (o: any) => new File([JSON.stringify(o)], "p.json", { type: "application/json" });
  it("the Your panes menu imports a file as a draft and says so, and says why when the serve refuses", async () => {
    api.panesOp.mockImplementation(async (b: any) => (b.op === "list" ? { ok: true, panes: [] } : b.op === "import" ? { ok: true, id: "copy" } : { ok: false, error: "x" }));
    render(<AddPaneMenu engines={[]} anchor={{ left: 0, top: 0 }} atLimit={null} onPick={() => {}} onClose={() => {}} />); fireEvent.click(screen.getByTestId("pick-free-menu")); await waitFor(() => screen.getByTestId("free-import"));
    fireEvent.change(screen.getByTestId("free-import-file"), { target: { files: [file({ schema: "antiloki-pane/1", kind: "export", id: "copy", manifest: {}, files: {}, hash: "h" })] } });
    await waitFor(() => screen.getByTestId("free-import-msg")); expect(screen.getByTestId("free-import-msg").textContent).toContain("a draft"); expect(screen.getByTestId("free-import-msg").textContent).toContain("copy"); expect(api.panesOp).toHaveBeenCalledWith(expect.objectContaining({ op: "import" }));
    api.panesOp.mockImplementation(async (b: any) => (b.op === "list" ? { ok: true, panes: [] } : { ok: false, error: "a pane called `copy` is already here: import it under another name" }));
    fireEvent.change(screen.getByTestId("free-import-file"), { target: { files: [file({ schema: "antiloki-pane/1", kind: "export", id: "copy", manifest: {}, files: {}, hash: "h" })] } }); await waitFor(() => expect(screen.getByTestId("free-import-msg").textContent).toContain("already here"));
    fireEvent.change(screen.getByTestId("free-import-file"), { target: { files: [new File(["not json"], "p.json")] } }); await waitFor(() => expect(screen.getByTestId("free-import-msg").textContent).toContain("not JSON"));
  });
  it("a team's bundle is installed as a draft through the install op", async () => {
    api.panesOp.mockImplementation(async (b: any) => (b.op === "list" ? { ok: true, panes: [] } : b.op === "install" ? { ok: true, id: "notion-lite" } : { ok: false }));
    render(<AddPaneMenu engines={[]} anchor={{ left: 0, top: 0 }} atLimit={null} onPick={() => {}} onClose={() => {}} />); fireEvent.click(screen.getByTestId("pick-free-menu")); await waitFor(() => screen.getByTestId("free-import"));
    fireEvent.change(screen.getByTestId("free-import-file"), { target: { files: [file({ id: "notion-lite", manifest: { title: "N" }, files: { "index.html": "<p>" } })] } }); await waitFor(() => expect(api.panesOp).toHaveBeenCalledWith({ op: "install", bundle: expect.objectContaining({ id: "notion-lite" }) }));
  });
  it("Export asks the serve for the pane and offers it as a file named after it", async () => {
    const manifest = { schema: "antiloki-pane/1", id: "demo", title: "Demo", version: "1.0.0", entry: "index.html", apps: [], notes: "", made_by: "p" };
    api.panesOp.mockImplementation(async (b: any) => (b.op === "read" ? { ok: true, manifest, files: { "index.html": "<p>hi</p>" }, assets: {}, hash: "sha256:" + "a".repeat(64), approved: true, problems: [] } : b.op === "export" ? { ok: true, export: { schema: "antiloki-pane/1", kind: "export", id: "demo" } } : { ok: false }));
    (URL as any).createObjectURL = vi.fn(() => "blob:x"); (URL as any).revokeObjectURL = vi.fn(); const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}); let name = ""; const orig = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((t: string, o?: any) => { const el = orig(t, o); if (t === "a") Object.defineProperty(el, "download", { set(v) { name = v; }, get() { return name; } }); return el; });
    render(<FreePaneExportButton id="demo" />); fireEvent.click(screen.getByTestId("pane-export")); await waitFor(() => expect(click).toHaveBeenCalled()); expect(api.panesOp).toHaveBeenCalledWith({ op: "export", id: "demo" }); expect(name).toBe("antiloki-pane-demo.json");
    vi.restoreAllMocks();
  });
});
