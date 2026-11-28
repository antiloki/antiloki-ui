// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import * as React from "react";
vi.mock("@/loki/api/client", () => ({ BE_URL: "http://be" }));
const api = vi.hoisted(() => ({ panesOp: vi.fn() }));
vi.mock("./api", () => api);
import { asBridge, buildSrcDoc, policyFor, themeTokens } from "./free-pane-kit";
import { FreePane } from "./FreePane";

const manifest = { schema: "antiloki-pane/1", id: "demo", title: "Demo", version: "1.0.0", entry: "index.html", apps: [{ app: "linear", read: ["list_issues"], write: ["save_comment"] }], notes: "shows issues", made_by: "agent:leader" };
const folder = (o: any = {}) => ({ ok: true, manifest, files: { "index.html": '<html><head><link rel="stylesheet" href="style.css"></head><body><img src="logo.png"><script src="app.js"></script><p>hi</p></body></html>', "style.css": "p{color:red}", "app.js": "window.x=1" }, assets: { "logo.png": "data:image/png;base64,AAA" }, hash: "sha256:" + "a".repeat(64), approved: false, problems: [], ...o });

describe("a free pane's page", () => {
  it("is assembled from the folder with the policy first, the files inlined and the pictures as data, and nothing remote reaches it", () => {
    const f = folder(); const doc = buildSrcDoc(f as any, "http://be", { "--c-fg": "#fff" });
    expect(doc.indexOf("Content-Security-Policy")).toBeGreaterThan(-1); expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("<p>hi</p>")); expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("window.x=1"));
    expect(doc).toContain("p{color:red}"); expect(doc).toContain("window.x=1"); expect(doc).toContain('src="data:image/png;base64,AAA"'); expect(doc).not.toContain('href="style.css"'); expect(doc).toContain("--c-fg:#fff");
    const policy = policyFor("http://be"); expect(policy).toContain("connect-src 'none'"); expect(policy).toContain("default-src 'none'"); expect(policy).toContain("frame-src 'none'"); expect(policy).toContain("form-action 'none'"); expect(policy).toContain("img-src data: blob: http://be/api/v1/panes/asset");
    expect(buildSrcDoc({ manifest, files: { "index.html": "<p>bare</p>" }, assets: {} }, "http://be")).toMatch(/^<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"/);
    expect(buildSrcDoc({ manifest, files: { "index.html": '<script src="https://evil.example/x.js"></script>' }, assets: {} }, "http://be")).toContain("https://evil.example/x.js");   // left as written: the policy refuses it
  });
  it("takes only messages of the bridge's shape, and reads the theme from the host", () => {
    expect(asBridge({ __antiloki: 1, id: 1, type: "hello" })).toEqual({ __antiloki: 1, id: 1, type: "hello", payload: {} }); for (const bad of [null, "x", {}, { __antiloki: 1, id: 0, type: "hello" }, { __antiloki: 1, id: 1.5, type: "hello" }, { __antiloki: 1, id: 1, type: "x".repeat(41) }, { __antiloki: 1, id: 1, type: "hello", payload: [] }, { id: 1, type: "hello" }]) expect(asBridge(bad)).toBeNull();
    expect(themeTokens((n) => (n === "--c-fg" ? " #fff " : ""))).toEqual({ "--c-fg": "#fff" });
  });
});
describe("the free pane", () => {
  beforeEach(() => { api.panesOp.mockReset(); });
  afterEach(() => cleanup());
  it("shows a draft card with what the pane may do, approves exactly the hash shown, and then the card goes", async () => {
    let approved = false; api.panesOp.mockImplementation(async (b: any) => (b.op === "read" ? folder({ approved }) : b.op === "approve" ? ((approved = true), { ok: true }) : { ok: false }));
    render(<FreePane id="demo" />); await waitFor(() => screen.getByTestId("pane-draft-line")); expect(screen.queryByTestId("pane-draft")).toBeNull();   // a draft is a thin line: the card only when asked for
    expect(screen.queryByTestId("pane-export")).toBeNull();   // and the export is an icon on the pane's top bar, not in the pane
    fireEvent.click(screen.getByTestId("pane-details")); await waitFor(() => screen.getByTestId("pane-draft"));
    expect(screen.getByTestId("pane-notes").textContent).toBe("shows issues"); expect(screen.getByTestId("pane-app-linear").textContent).toContain("list_issues"); expect(screen.getByTestId("pane-app-linear").textContent).toContain("save_comment"); expect(screen.getByTestId("pane-app-linear").textContent).toContain("asks you first");
    const f = screen.getByTestId("free-pane-frame"); expect(f.getAttribute("sandbox")).toBe("allow-scripts"); expect(f.getAttribute("srcdoc")).toContain("Content-Security-Policy");
    fireEvent.click(screen.getByTestId("pane-approve")); await waitFor(() => expect(api.panesOp).toHaveBeenCalledWith({ op: "approve", id: "demo", hash: "sha256:" + "a".repeat(64) })); await waitFor(() => expect(screen.queryByTestId("pane-draft")).toBeNull()); expect(screen.getByTestId("free-pane").getAttribute("data-approved")).toBe("1");
  });
  it("reloads itself when an agent rewrites the pane while it is open, and not when nothing changed", async () => {
    let stamp = "2:100:50"; let html = "<p>one</p>"; let reads = 0;
    api.panesOp.mockImplementation(async (b: any) => (b.op === "stamp" ? { ok: true, stamp } : b.op === "read" ? (reads++, folder({ files: { "index.html": html }, approved: false })) : { ok: false }));
    render(<FreePane id="demo" pollMs={15} />); await waitFor(() => expect(screen.getByTestId("free-pane-frame").getAttribute("srcdoc")).toContain("<p>one</p>"));
    await new Promise((r) => setTimeout(r, 80)); expect(reads).toBe(1);   // nothing changed: no second read
    html = "<p>two</p>"; stamp = "2:200:60";   // an agent wrote the pane
    await waitFor(() => expect(screen.getByTestId("free-pane-frame").getAttribute("srcdoc")).toContain("<p>two</p>")); expect(reads).toBe(2);
  });
  it("says why a pane cannot open, and shows the serve's refusal of an approval", async () => {
    api.panesOp.mockResolvedValueOnce(folder({ problems: ["`pane.json` is missing"], manifest: null })); const { unmount } = render(<FreePane id="demo" />); await waitFor(() => screen.getByTestId("pane-problem")); expect(screen.getByTestId("pane-problem").textContent).toContain("pane.json"); expect(screen.queryByTestId("free-pane-frame")).toBeNull(); unmount();
    api.panesOp.mockImplementation(async (b: any) => (b.op === "read" ? folder() : { ok: false, error: "the pane changed since it was shown: look at it again" })); render(<FreePane id="demo" />); fireEvent.click(await waitFor(() => screen.getByTestId("pane-details"))); fireEvent.click(await waitFor(() => screen.getByTestId("pane-approve"))); await waitFor(() => expect(screen.getByTestId("pane-approve-error").textContent).toContain("changed since"));
  });
  it("answers `hello` from its own frame only, with the theme and the manifest, and refuses a type that is not built yet", async () => {
    api.panesOp.mockResolvedValue(folder({ approved: true })); render(<FreePane id="demo" />); const frame = (await waitFor(() => screen.getByTestId("free-pane-frame"))) as HTMLIFrameElement;
    await act(async () => { await Promise.resolve(); });   // the host attaches its listener in an effect: let it run before the page "speaks"
    const own = frame.contentWindow as Window; const post = vi.spyOn(own, "postMessage").mockImplementation(() => {});
    await act(async () => { window.dispatchEvent(new MessageEvent("message", { data: { __antiloki: 1, id: 7, type: "hello" }, source: own })); });
    expect(post).toHaveBeenCalledTimes(1); expect(post.mock.calls[0][0]).toMatchObject({ __antiloki: 1, id: 7, ok: true, result: { approved: true, kit: 2, manifest: { id: "demo" } } });
    await act(async () => { window.dispatchEvent(new MessageEvent("message", { data: { __antiloki: 1, id: 8, type: "launch", payload: {} }, source: own })); }); expect(post.mock.calls[1][0]).toMatchObject({ id: 8, ok: false }); expect((post.mock.calls[1][0] as any).error).toContain("not a message of the bridge");
    // a message from any other window (the host's own, another frame) is not answered
    await act(async () => { window.dispatchEvent(new MessageEvent("message", { data: { __antiloki: 1, id: 9, type: "hello" }, source: window })); }); expect(post).toHaveBeenCalledTimes(2);
    await act(async () => { window.dispatchEvent(new MessageEvent("message", { data: { nothing: true }, source: own })); }); expect(post).toHaveBeenCalledTimes(2);
  });
  const speak = async (frame: HTMLIFrameElement, msg: any) => { const own = frame.contentWindow as Window; await act(async () => { window.dispatchEvent(new MessageEvent("message", { data: { __antiloki: 1, ...msg }, source: own })); }); await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
  it("reads an app for an approved pane: the serve is asked (manifest and hash are its to check) and the app's own JSON comes back", async () => {
    api.panesOp.mockReset(); api.panesOp.mockImplementation(async (b: any) => (b.op === "call" ? { ok: true, result: { is_error: false, text: '{"issues":[{"id":"DAN-1"}]}' } } : folder({ approved: true })));
    render(<FreePane id="demo" />); const frame = (await waitFor(() => screen.getByTestId("free-pane-frame"))) as HTMLIFrameElement; await act(async () => { await Promise.resolve(); }); const post = vi.spyOn(frame.contentWindow as Window, "postMessage").mockImplementation(() => {});
    await speak(frame, { id: 3, type: "read", payload: { app: "linear", tool: "list_issues", args: { team: "DAN" } } });
    expect(api.panesOp).toHaveBeenCalledWith({ op: "call", id: "demo", app: "linear", tool: "list_issues", args: { team: "DAN" } }); expect(post.mock.calls.at(-1)![0]).toMatchObject({ id: 3, ok: true, result: { issues: [{ id: "DAN-1" }] } });
  });
  it("refuses a read from a draft without asking the serve, refuses a badly shaped one, and passes the serve's refusal on in words", async () => {
    api.panesOp.mockReset(); api.panesOp.mockImplementation(async (b: any) => (b.op === "call" ? { ok: false, error: "the pane did not ask to read `get_issue` of `linear`" } : folder({ approved: false })));
    const a = render(<FreePane id="demo" />); const f1 = (await waitFor(() => screen.getByTestId("free-pane-frame"))) as HTMLIFrameElement; await act(async () => { await Promise.resolve(); }); const p1 = vi.spyOn(f1.contentWindow as Window, "postMessage").mockImplementation(() => {});
    await speak(f1, { id: 4, type: "read", payload: { app: "linear", tool: "list_issues" } }); expect(p1.mock.calls.at(-1)![0]).toMatchObject({ id: 4, ok: false }); expect((p1.mock.calls.at(-1)![0] as any).error).toContain("draft"); expect(api.panesOp.mock.calls.some((c) => c[0].op === "call")).toBe(false); a.unmount();
    api.panesOp.mockImplementation(async (b: any) => (b.op === "call" ? { ok: false, error: "the pane did not ask to read `get_issue` of `linear`" } : folder({ approved: true })));
    render(<FreePane id="demo" />); const f2 = (await waitFor(() => screen.getByTestId("free-pane-frame"))) as HTMLIFrameElement; await act(async () => { await Promise.resolve(); }); const p2 = vi.spyOn(f2.contentWindow as Window, "postMessage").mockImplementation(() => {});
    await speak(f2, { id: 5, type: "read", payload: { app: 7, tool: "x" } }); expect((p2.mock.calls.at(-1)![0] as any).error).toContain("names"); await speak(f2, { id: 6, type: "read", payload: { app: "linear", tool: "get_issue" } }); expect((p2.mock.calls.at(-1)![0] as any).error).toContain("did not ask to read");
  });
});

