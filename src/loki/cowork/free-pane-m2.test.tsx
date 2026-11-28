// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import * as React from "react";
vi.mock("@/loki/api/client", () => ({ BE_URL: "http://be" }));
const api = vi.hoisted(() => ({ panesOp: vi.fn() }));
vi.mock("./api", () => api);
import { FreePane } from "./FreePane";
import { liveFreePane, cleanDescription, routeAct, asSnapshot } from "./freepaneview";
import { writeWords, openable, noticeOk, KIT_JS, BRIDGE_TYPES } from "./free-pane-kit";

const manifest = { schema: "antiloki-pane/1", id: "demo", title: "Demo", version: "1.0.0", entry: "index.html", apps: [{ app: "linear", read: ["list_issues"], write: ["save_issue", "delete_issue"] }], notes: "x", made_by: "person" };
const folder = (o: any = {}) => ({ ok: true, manifest, files: { "index.html": "<p>hi</p>" }, assets: {}, hash: "sha256:" + "a".repeat(64), approved: true, problems: [], ...o });
const setup = async (impl: (b: any) => any, props: any = {}) => {
  api.panesOp.mockReset(); api.panesOp.mockImplementation(async (b: any) => (b.op === "read" ? folder() : impl(b)));
  render(<FreePane id="demo" {...props} />); const frame = (await waitFor(() => screen.getByTestId("free-pane-frame"))) as HTMLIFrameElement; await act(async () => { await Promise.resolve(); });
  const own = frame.contentWindow as Window; const post = vi.spyOn(own, "postMessage").mockImplementation(() => {});
  const speak = async (msg: any) => { await act(async () => { window.dispatchEvent(new MessageEvent("message", { data: { __antiloki: 1, ...msg }, source: own })); }); await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
  const last = () => post.mock.calls.at(-1)![0] as any; return { speak, last, post };
};
afterEach(() => cleanup());

describe("a free pane writes only on the person's click, on a card the host draws", () => {
  beforeEach(() => { api.panesOp.mockReset(); });
  it("asks the serve what kind of write it is, shows every argument, calls only after the click, and tells the page the result", async () => {
    const { speak, last } = await setup((b) => (b.op === "risk" ? { ok: true, risk: "write" } : b.op === "write" ? { ok: true, result: { is_error: false, text: '{"id":"DAN-9"}' } } : { ok: false }));
    await speak({ id: 1, type: "write", payload: { app: "linear", tool: "save_issue", args: { title: "Buy milk", team: "Danjindev" }, label: "Add the note" } });
    await waitFor(() => screen.getByTestId("pane-confirm")); expect(screen.getByTestId("pane-confirm").parentElement).toBe(screen.getByTestId("free-pane"));   // outside the frame
    expect(screen.getAllByTestId("pane-confirm-arg").map((x) => x.textContent)).toEqual(["title: Buy milk", "team: Danjindev"]); expect(screen.getByTestId("pane-confirm-label").textContent).toBe("Add the note");
    expect(api.panesOp.mock.calls.some((c) => c[0].op === "write")).toBe(false);   // nothing left without the click
    fireEvent.click(screen.getByTestId("pane-confirm-yes")); await waitFor(() => expect(api.panesOp).toHaveBeenCalledWith({ op: "write", id: "demo", app: "linear", tool: "save_issue", args: { title: "Buy milk", team: "Danjindev" }, confirm: true, confirm2: false }));
    await waitFor(() => expect(last()).toMatchObject({ id: 1, ok: true, result: { id: "DAN-9" } })); expect(screen.queryByTestId("pane-confirm")).toBeNull(); expect(screen.getByTestId("pane-calls").textContent).toContain("1 call · last write");
  });
  it("declining tells the page `declined` and never calls the app", async () => {
    const { speak, last } = await setup((b) => (b.op === "risk" ? { ok: true, risk: "write" } : { ok: false }));
    await speak({ id: 2, type: "write", payload: { app: "linear", tool: "save_issue", args: {} } }); fireEvent.click(await waitFor(() => screen.getByTestId("pane-confirm-no")));
    await waitFor(() => expect(last()).toMatchObject({ id: 2, ok: false, error: "declined" })); expect(api.panesOp.mock.calls.some((c) => c[0].op === "write")).toBe(false);
  });
  it("a destructive tool needs the second tick, and says why the button is off", async () => {
    const { speak } = await setup((b) => (b.op === "risk" ? { ok: true, risk: "destructive" } : b.op === "write" ? { ok: true, result: { is_error: false, text: "{}" } } : { ok: false }));
    await speak({ id: 3, type: "write", payload: { app: "linear", tool: "delete_issue", args: { id: "DAN-1" } } }); await waitFor(() => screen.getByTestId("pane-confirm"));
    const yes = screen.getByTestId("pane-confirm-yes") as HTMLButtonElement; expect(yes.disabled).toBe(true); expect(yes.title).toContain("Tick the box"); expect(screen.getByTestId("pane-confirm").textContent).toContain("DELETE");
    fireEvent.click(screen.getByTestId("pane-confirm-tick")); expect(yes.disabled).toBe(false); fireEvent.click(yes);
    await waitFor(() => expect(api.panesOp).toHaveBeenCalledWith(expect.objectContaining({ op: "write", confirm: true, confirm2: true })));
  });
  it("refuses a write from a draft or when the serve says the tool is not listed, without drawing a card; and one card at a time", async () => {
    const a = await setup((b) => (b.op === "risk" ? { ok: false, error: "the pane did not ask to write `save_issue` of `linear`" } : { ok: false }));
    await a.speak({ id: 4, type: "write", payload: { app: "linear", tool: "save_issue", args: {} } }); expect(a.last()).toMatchObject({ id: 4, ok: false }); expect(a.last().error).toContain("did not ask to write"); expect(screen.queryByTestId("pane-confirm")).toBeNull(); cleanup();
    api.panesOp.mockReset(); api.panesOp.mockImplementation(async (b: any) => (b.op === "read" ? folder({ approved: false }) : { ok: true, risk: "write" }));
    render(<FreePane id="demo" />); const f = (await waitFor(() => screen.getByTestId("free-pane-frame"))) as HTMLIFrameElement; await act(async () => { await Promise.resolve(); }); const post = vi.spyOn(f.contentWindow as Window, "postMessage").mockImplementation(() => {});
    await act(async () => { window.dispatchEvent(new MessageEvent("message", { data: { __antiloki: 1, id: 5, type: "write", payload: { app: "linear", tool: "save_issue" } }, source: f.contentWindow as Window })); }); expect((post.mock.calls.at(-1)![0] as any).error).toContain("draft"); expect(screen.queryByTestId("pane-confirm")).toBeNull(); cleanup();
    const b = await setup((x) => (x.op === "risk" ? { ok: true, risk: "write" } : { ok: false }));
    await b.speak({ id: 6, type: "write", payload: { app: "linear", tool: "save_issue", args: {} } }); await waitFor(() => screen.getByTestId("pane-confirm")); await b.speak({ id: 7, type: "write", payload: { app: "linear", tool: "save_issue", args: {} } }); expect(b.last()).toMatchObject({ id: 7, ok: false }); expect(b.last().error).toContain("waiting");
  });
});

describe("state, notices, links and what the page says about itself", () => {
  it("keeps the pane's memory through the serve, shows a rate-limited notice, and asks once per domain before opening a link", async () => {
    let st: any = null; const opened = vi.spyOn(window, "open").mockImplementation(() => null);
    const { speak, last } = await setup((b) => (b.op === "state_set" ? ((st = b.state), { ok: true }) : b.op === "state_get" ? { ok: true, state: st } : { ok: false }));
    await speak({ id: 1, type: "state.set", payload: { state: { n: 2 } } }); await speak({ id: 2, type: "state.get" }); expect(last()).toMatchObject({ id: 2, ok: true, result: { n: 2 } });
    await speak({ id: 3, type: "notice", payload: { text: "Saved" } }); expect(screen.getByTestId("pane-notice").textContent).toBe("Saved"); await speak({ id: 4, type: "notice", payload: { text: "again" } }); expect(last()).toMatchObject({ id: 4, ok: false });
    await speak({ id: 5, type: "open", payload: { url: "javascript:alert(1)" } }); expect(last()).toMatchObject({ ok: false }); expect(opened).not.toHaveBeenCalled();
    await speak({ id: 6, type: "open", payload: { url: "https://linear.app/x" } }); await waitFor(() => screen.getByTestId("pane-confirm")); expect(screen.getByTestId("pane-confirm").textContent).toContain("linear.app"); expect(opened).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("pane-confirm-yes")); expect(opened).toHaveBeenCalledWith("https://linear.app/x", "_blank", "noopener,noreferrer");
    await speak({ id: 7, type: "open", payload: { url: "https://linear.app/y" } }); expect(opened).toHaveBeenCalledTimes(2); expect(screen.queryByTestId("pane-confirm")).toBeNull();   // the domain was allowed once
    opened.mockRestore();
  });
  it("a draft gets no memory and no link, but may say what it shows", async () => {
    api.panesOp.mockReset(); api.panesOp.mockImplementation(async (b: any) => (b.op === "read" ? folder({ approved: false }) : { ok: true }));
    render(<FreePane id="demo" />); const f = (await waitFor(() => screen.getByTestId("free-pane-frame"))) as HTMLIFrameElement; await act(async () => { await Promise.resolve(); }); const post = vi.spyOn(f.contentWindow as Window, "postMessage").mockImplementation(() => {});
    const speak = async (msg: any) => { await act(async () => { window.dispatchEvent(new MessageEvent("message", { data: { __antiloki: 1, ...msg }, source: f.contentWindow as Window })); }); await act(async () => { await Promise.resolve(); }); };
    await speak({ id: 1, type: "state.get" }); expect((post.mock.calls.at(-1)![0] as any).error).toContain("draft"); await speak({ id: 2, type: "open", payload: { url: "https://a.b" } }); expect((post.mock.calls.at(-1)![0] as any).error).toContain("draft");
    await speak({ id: 3, type: "describe", payload: { tree: { title: "t", text: "x", controls: [] } } }); expect(post.mock.calls.at(-1)![0]).toMatchObject({ id: 3, ok: true });
  });
  it("an agent reads what the page said and acts by meaning: the page's handler runs and its answer comes back", async () => {
    const { speak, post } = await setup(() => ({ ok: false }), { paneKey: "free-demo-1" });
    await speak({ id: 1, type: "describe", payload: { tree: { title: "Quick capture", text: "A form", controls: [{ ref: "title", label: "Title", kind: "field", value: "" }, { ref: "send", label: "Add", kind: "button" }] } } });
    const live = liveFreePane("free-demo-1")!; expect(live.description()!.controls.map((c) => c.ref)).toEqual(["title", "send"]);
    const p = live.act("title", "Buy milk", "type"); await act(async () => { await Promise.resolve(); });
    const sent = post.mock.calls.map((c) => c[0] as any).find((m) => m.type === "act"); expect(sent).toMatchObject({ ref: "title", value: "Buy milk", action: "type" });
    await speak({ id: sent.id, type: "act_result", payload: { ok: true, detail: "typed" } }); expect(await p).toEqual({ ok: true, detail: "typed" });
    cleanup(); expect(liveFreePane("free-demo-1")).toBeUndefined();   // closed panes are forgotten
  });
});

describe("the pure rules", () => {
  it("shows arguments in words and cuts long ones", () => { expect(writeWords({ a: "x", b: { c: 1 } })).toEqual([{ name: "a", value: "x" }, { name: "b", value: '{"c":1}' }]); expect(writeWords({ a: "y".repeat(500) })[0].value).toContain("500 characters"); });
  it("opens only http(s) without credentials", () => { expect(openable("https://a.b/c")?.host).toBe("a.b"); for (const bad of ["javascript:1", "file:///x", "https://u:p@a.b", 5, "x".repeat(2001), "nope"]) expect(openable(bad)).toBeNull(); });
  it("rate limits and trims notices", () => { expect(noticeOk("  hi ", 0, 10000)).toBe("hi"); expect(noticeOk("hi", 9000, 10000)).toBeNull(); expect(noticeOk("", 0, 10000)).toBeNull(); expect(noticeOk("x".repeat(300), 0, 10000)!.length).toBe(200); });
  it("cleans a description to its limits and refuses a bad one in words", () => {
    expect(cleanDescription({ title: "T", text: "x".repeat(9000), controls: [{ ref: "a", label: "A" }] })).toMatchObject({ controls: [{ ref: "a", kind: "button" }] }); expect((cleanDescription({ text: "x".repeat(9000) }) as any).text.length).toBe(6000);
    expect(cleanDescription({ controls: [{ ref: "A b" }] })).toContain("lower case"); expect(cleanDescription({ controls: [{ ref: "a" }, { ref: "a" }] })).toContain("two controls"); expect(cleanDescription({ controls: Array.from({ length: 61 }, (_, i) => ({ ref: `c${i}` })) })).toContain("at most 60"); expect(cleanDescription("x")).toContain("object");
  });
  it("routes an agent's act only to a control that takes it", () => {
    const d = cleanDescription({ controls: [{ ref: "t", label: "Title", kind: "field" }, { ref: "go", label: "Add", kind: "button" }, { ref: "pr", label: "Priority", kind: "choice", options: ["low", "high"] }] }) as any;
    expect(routeAct(d, { action: "type", ref: "t", value: "x" })).toEqual({ ref: "t", value: "x" }); expect(routeAct(d, { action: "click", ref: "go" })).toEqual({ ref: "go" });
    expect(routeAct(d, { action: "type", ref: "go", value: "x" })).toContain("is a button"); expect(routeAct(d, { action: "type", ref: "t" })).toContain("needs a value"); expect(routeAct(d, { action: "click", ref: "zz" })).toContain("no control"); expect(routeAct(null, { action: "click", ref: "a" })).toContain("not said");
    expect(asSnapshot(d).elements.map((e) => e.role)).toEqual(["textbox", "button", "combobox"]);
  });
  it("the kit and the host agree on the bridge's messages", () => { for (const t of BRIDGE_TYPES.filter((x) => x !== "act_result")) expect(KIT_JS).toContain(t.includes(".") ? t.split(".")[1] : t); expect(KIT_JS).not.toContain("fetch(") ; });
});
