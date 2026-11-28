// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
const api = vi.hoisted(() => ({ appTools: vi.fn(), appSignIn: vi.fn(), appCall: vi.fn(), loadWebApps: vi.fn(async (): Promise<any> => null), webAppSignIn: vi.fn() }));
vi.mock("./api", () => api);
import { AppTools, argsTemplate } from "./AppTools";
const app = { id: "linear", name: "Linear" };
const tools = () => [{ name: "list_issues", description: "List issues", risk: "read", input_schema: { type: "object", properties: { team: { type: "string" }, limit: { type: "integer" } }, required: ["team"] } }, { name: "delete_issue", description: "Delete an issue", risk: "destructive", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } }];
describe("a web app through its tools", () => {
  beforeEach(() => { api.appTools.mockReset(); api.appSignIn.mockReset(); api.appCall.mockReset(); }); afterEach(() => cleanup());
  it("writes the arguments a schema asks for", () => { expect(JSON.parse(argsTemplate(tools()[0].input_schema))).toEqual({ team: "" }); expect(JSON.parse(argsTemplate({ properties: { n: { type: "number" }, f: { type: "boolean" } }, required: ["n", "f"] }))).toEqual({ n: 0, f: false }); expect(argsTemplate(null)).toBe("{}"); });
  it("lists the tools with their risk and calls a read with the filled-in arguments", async () => {
    api.appTools.mockResolvedValue({ ok: true, tools: tools(), signed_in: true, needs_signin: false }); api.appCall.mockResolvedValue({ ok: true, text: "3 issues", is_error: false, ms: 5 });
    render(<AppTools app={app} />); expect(await screen.findByTestId("apptool-list_issues")).toBeTruthy(); expect(screen.getByTestId("apptool-risk-list_issues")).toHaveTextContent("reads"); expect(screen.getByTestId("apptool-risk-delete_issue")).toHaveTextContent("destroys");
    fireEvent.click(screen.getByTestId("apptool-open-list_issues")); fireEvent.change(screen.getByTestId("apptool-args"), { target: { value: '{"team":"ENG"}' } }); fireEvent.click(screen.getByTestId("apptool-call"));
    await waitFor(() => expect(api.appCall).toHaveBeenCalledWith("linear", "list_issues", { team: "ENG" }, false)); expect(await screen.findByTestId("apptool-out")).toHaveTextContent("3 issues");
  });
  it("makes the person confirm a destructive tool and refuses broken JSON before any call", async () => {
    api.appTools.mockResolvedValue({ ok: true, tools: tools(), signed_in: true, needs_signin: false }); api.appCall.mockResolvedValue({ ok: true, text: "deleted" });
    render(<AppTools app={app} />); fireEvent.click(await screen.findByTestId("apptool-open-delete_issue")); const call = screen.getByTestId("apptool-call") as HTMLButtonElement; expect(call.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("apptool-args"), { target: { value: "{nope" } }); fireEvent.click(screen.getByTestId("apptool-confirm")); fireEvent.click(call); expect(await screen.findByTestId("apptool-out")).toHaveTextContent("not valid JSON"); expect(api.appCall).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("apptool-args"), { target: { value: '{"id":"A-1"}' } }); fireEvent.click(call); await waitFor(() => expect(api.appCall).toHaveBeenCalledWith("linear", "delete_issue", { id: "A-1" }, true));
  });
  it("asks for the token when the app wants a sign-in, sends it once and forgets it", async () => {
    api.appTools.mockResolvedValueOnce({ ok: false, error: "sign in", tools: [], signed_in: false, needs_signin: true }).mockResolvedValue({ ok: true, tools: tools(), signed_in: true, needs_signin: false }); api.appSignIn.mockResolvedValue({ ok: true, signed_in: true });
    render(<AppTools app={app} />); const box = await screen.findByTestId("apptools-signin"); expect(box).toHaveTextContent("never shown again");
    fireEvent.change(screen.getByTestId("apptools-token"), { target: { value: "tok_123" } }); fireEvent.click(screen.getByTestId("apptools-save"));
    await waitFor(() => expect(api.appSignIn).toHaveBeenCalledWith("linear", "tok_123")); await screen.findByTestId("apptool-list_issues"); expect(screen.queryByTestId("apptools-token")).toBeNull();
  });
  it("says so when an app has no tools to use", async () => { api.appTools.mockResolvedValue({ ok: false, error: "`linear` has no MCP address", tools: [], signed_in: false, needs_signin: false }); render(<AppTools app={app} />); expect(await screen.findByTestId("apptools-none")).toHaveTextContent("no tools to use here"); });
  it("when the app asks for sign-in it offers the app's own sign-in, a link to the app and a link to its docs on getting a token", async () => {
    api.appTools.mockResolvedValueOnce({ ok: false, error: "sign in", tools: [], signed_in: false, needs_signin: true }).mockResolvedValue({ ok: true, tools: tools(), signed_in: true, needs_signin: false });
    api.loadWebApps.mockResolvedValue({ catalog: [], installed: [{ id: "notion", name: "Notion", kind: "official", app_url: "https://www.notion.so", mcp_url: "https://mcp.notion.com/mcp", auth: "oauth", color: "#fff", tools: 0, docs: "https://developers.notion.com/docs/mcp" }] });
    api.webAppSignIn.mockResolvedValue({ ok: true, error: "", url: null }); vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AppTools app={{ id: "notion", name: "Notion" }} />); await waitFor(() => screen.getByTestId("apptools-signin"));
    await waitFor(() => expect(screen.getByTestId("apptools-app-link").getAttribute("href")).toBe("https://www.notion.so")); expect(screen.getByTestId("apptools-docs-link").getAttribute("href")).toBe("https://developers.notion.com/docs/mcp"); expect(screen.getByTestId("apptools-docs-link").textContent).toContain("Notion docs");
    fireEvent.click(screen.getByTestId("apptools-connect")); await waitFor(() => expect(api.webAppSignIn).toHaveBeenCalledWith("notion")); await vi.advanceTimersByTimeAsync(2100); await waitFor(() => expect(screen.queryByTestId("apptools-signin")).toBeNull()); vi.useRealTimers();
  });
});
