// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
import { categoriesOf, filterStore, installLine, parseInspection, parseWebApps } from "./webapps";

const store = [
  { id: "linear", name: "Linear", vendor: "Linear", category: "Projects", blurb: "Issues and cycles", app_url: "https://linear.app", mcp_url: "https://mcp.linear.app/sse", transport: "sse", auth: "oauth", color: "#6e56cf", docs: "https://linear.app/docs/mcp" },
  { id: "stripe", name: "Stripe", vendor: "Stripe", category: "Payments", blurb: "Customers and payments", app_url: "https://dashboard.stripe.com", mcp_url: "https://mcp.stripe.com", transport: "http", auth: "oauth", color: "#635bff", docs: "https://docs.stripe.com/mcp" },
];
describe("the web apps model", () => {
  it("reads what the serve sends defensively, filters the store by category and words, and says what an install came to", () => {
    const w = parseWebApps({ catalog: [...store, { nope: 1 }, "x"], installed: [{ id: "x", name: "X", kind: "generated", app_url: "http://x", tools: [1, 2] }, { name: "no id" }] });
    expect(w.catalog.map((a) => a.id)).toEqual(["linear", "stripe"]); expect(w.installed).toHaveLength(1); expect(w.installed[0].tools).toBe(2); expect(parseWebApps(null)).toEqual({ catalog: [], installed: [] });
    expect(categoriesOf(w.catalog)).toEqual(["All", "Projects", "Payments"]); expect(filterStore(w.catalog, "Payments", "").map((a) => a.id)).toEqual(["stripe"]); expect(filterStore(w.catalog, "All", "cycles").map((a) => a.id)).toEqual(["linear"]);
    expect(installLine("Linear", { ok: true, mcp_reach: { ok: true, status: 401 } }).line).toContain("sign in"); expect(installLine("Linear", { ok: true, mcp_reach: { ok: false, error: "timed out" } }).line).toContain("did not answer");
    expect(installLine("Linear", { ok: false, error: "no" })).toEqual({ ok: false, line: "no" });
    expect(parseInspection({ ok: true, spec_url: "https://a/openapi.json", title: "A", count: 2, tools: [{ name: "list", risk: "read" }, { name: "del", risk: "write" }], page: { ok: true } })).toMatchObject({ count: 2, writes: 1, pageOk: true }); expect(parseInspection({ ok: false })).toBeNull();
  });
});

const api = { load: vi.fn(), op: vi.fn(), inspect: vi.fn(), connect: vi.fn() };
vi.mock("./api", () => ({ loadWebApps: (...a: any[]) => api.load(...a), webAppOp: (...a: any[]) => api.op(...a), inspectWebApp: (...a: any[]) => api.inspect(...a), webAppConnect: (...a: any[]) => api.connect(...a) }));
import { WebAppsPane } from "./WebAppsPane";
describe("the web apps store pane", () => {
  beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); }); afterEach(() => cleanup());
  it("lists the store, installs one app, shows it installed with Open and Remove, and removes it", async () => {
    let installed: any[] = []; api.load.mockImplementation(async () => parseWebApps({ catalog: store, installed }));
    api.op.mockImplementation(async (b: any) => { if (b.op === "install") installed = [{ id: b.store_id, name: "Linear", kind: "official", app_url: "https://linear.app", tools: [] }]; else installed = []; return { ok: true, mcp_reach: { ok: true, status: 200 }, webapps: null }; });
    const open = vi.fn(); render(<WebAppsPane onOpenApp={open} />); await waitFor(() => screen.getByTestId("store-app-linear")); expect(screen.getByTestId("store-app-stripe")).toBeTruthy();
    fireEvent.click(screen.getByTestId("store-cat-Payments")); expect(screen.queryByTestId("store-app-linear")).toBeNull(); fireEvent.click(screen.getByTestId("store-cat-All"));
    fireEvent.click(screen.getByTestId("store-install-linear")); await waitFor(() => screen.getByTestId("store-installed-linear")); expect(api.op).toHaveBeenCalledWith({ op: "install", store_id: "linear" }); expect(screen.getByTestId("webapps-note").textContent).toContain("Linear is installed");
    fireEvent.click(screen.getByTestId("installed-open-linear")); expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: "linear", app_url: "https://linear.app" }));
    fireEvent.click(screen.getByTestId("installed-remove-linear")); await waitFor(() => expect(screen.queryByTestId("installed-linear")).toBeNull()); expect(api.op).toHaveBeenLastCalledWith({ op: "uninstall", id: "linear" });
  });
  it("adds an app of your own: generated (look at it, then install with its tools) or official (needs its MCP address)", async () => {
    api.load.mockResolvedValue(parseWebApps({ catalog: store, installed: [] })); api.op.mockResolvedValue({ ok: true, webapps: null });
    api.inspect.mockResolvedValue({ inspection: parseInspection({ ok: true, spec_url: "https://acme.io/openapi.json", title: "Acme", count: 1, tools: [{ name: "listInvoices", risk: "read" }], page: { ok: true } }) });
    render(<WebAppsPane />); await waitFor(() => screen.getByTestId("webapps-add")); fireEvent.click(screen.getByTestId("webapps-add"));
    expect((screen.getByTestId("own-install") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("own-name"), { target: { value: "Acme" } }); fireEvent.change(screen.getByTestId("own-url"), { target: { value: "https://acme.io" } });
    fireEvent.click(screen.getByTestId("own-inspect")); await waitFor(() => screen.getByTestId("own-inspection")); expect(screen.getByTestId("own-inspection").textContent).toContain("1 tool");
    fireEvent.click(screen.getByTestId("own-install")); await waitFor(() => expect(api.op).toHaveBeenCalledWith(expect.objectContaining({ op: "install", name: "Acme", kind: "generated", app_url: "https://acme.io", tools: [expect.objectContaining({ name: "listInvoices" })] })));
    fireEvent.click(screen.getByTestId("webapps-add")); fireEvent.click(screen.getByTestId("mode-official")); fireEvent.change(screen.getByTestId("own-name"), { target: { value: "Acme" } }); fireEvent.change(screen.getByTestId("own-url"), { target: { value: "https://acme.io" } });
    expect((screen.getByTestId("own-install") as HTMLButtonElement).disabled).toBe(true);   // an official MCP needs its address
    fireEvent.change(screen.getByTestId("own-mcp"), { target: { value: "https://acme.io/mcp" } }); expect((screen.getByTestId("own-install") as HTMLButtonElement).disabled).toBe(false);
  });
  it("says so when the store cannot be read, and tries again", async () => {
    api.load.mockResolvedValueOnce(null).mockResolvedValueOnce(parseWebApps({ catalog: store, installed: [] })); render(<WebAppsPane />);
    await waitFor(() => screen.getByTestId("webapps-error")); fireEvent.click(screen.getByText("Try again")); await waitFor(() => screen.getByTestId("store-app-linear"));
  });
  it("tests an installed app: needs sign-in -> paste a token -> connected with its tools, writes marked", async () => {
    api.load.mockResolvedValue(parseWebApps({ catalog: store, installed: [{ id: "linear", name: "Linear", kind: "official", app_url: "https://linear.app", tools: [] }] }));
    api.connect.mockResolvedValueOnce({ ok: false, needsSignin: true, error: "", signedIn: false, tools: [] })
      .mockResolvedValueOnce({ ok: true, needsSignin: false, error: "", signedIn: true, tools: [] })
      .mockResolvedValueOnce({ ok: true, needsSignin: false, error: "", signedIn: true, tools: [{ name: "list_issues", risk: "read" }, { name: "create_issue", risk: "write" }] });
    render(<WebAppsPane />); await waitFor(() => screen.getByTestId("installed-test-linear")); fireEvent.click(screen.getByTestId("installed-test-linear"));
    await waitFor(() => screen.getByTestId("token-linear")); expect(screen.getByTestId("connect-linear").textContent).toContain("sign in");
    fireEvent.change(screen.getByTestId("token-linear"), { target: { value: "lin_abc" } }); fireEvent.click(screen.getByTestId("token-save-linear"));
    await waitFor(() => expect(screen.getByTestId("connect-linear").textContent).toContain("2 tools, 1 that change things"));
    expect(api.connect).toHaveBeenCalledWith({ op: "token_set", app: "linear", token: "lin_abc" }); expect(api.connect).toHaveBeenLastCalledWith({ op: "tools", app: "linear" });
  });
});
