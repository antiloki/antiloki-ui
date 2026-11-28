// @vitest-environment jsdom
// THE CONNECTORS PANE (RFC 0022): empty at the start, a card per proposed connector, a connection screen with the steps and the inputs, secrets only ever sent.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const apiGet = vi.fn(); const apiPost = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...a), apiPost: (...a: any[]) => apiPost(...a), BE_URL: "http://be" }));
import { ConnectorsPane } from "./ConnectorsPane";
import { monogram, parseConnector, requestOpenConnector, statusWord } from "./connectors-api";
import { parseCommand } from "./commands";

const row = (over: any = {}) => ({
  slug: "mock-api", title: "Mock API", status: "draft", note: "", kind: "api", auth: "key", access: "read-only", site: "", summary: "reads the mock", missing: ["token"], yaml: "slug: mock-api\n", has_logo: false, updated_at: 1,
  recipe: { steps: ["Open settings", "Copy the token"], inputs: [{ id: "token", label: "Token", secret: true, help: "in settings", link: "https://x.example/settings", filled: false }] }, ...over,
});
const list = (rows: any[]) => ({ ok: true, connectors: rows });
beforeEach(() => { apiGet.mockReset(); apiPost.mockReset(); });
afterEach(() => cleanup());

describe("the connectors pane", () => {
  it("starts empty and tells the person how to get a connector", async () => {
    apiGet.mockResolvedValue(list([])); render(<ConnectorsPane every={60000} />);
    expect(await screen.findByTestId("connectors-empty")).toHaveTextContent("No connectors yet"); expect(screen.getByTestId("connectors-empty")).toHaveTextContent("Ask any agent");
  });
  it("draws a card for each connector an agent proposed, with its status in words", async () => {
    apiGet.mockResolvedValue(list([row(), row({ slug: "drive", title: "Drive", status: "connected", missing: [] })])); render(<ConnectorsPane every={60000} />);
    const a = await screen.findByTestId("connector-card-mock-api"); expect(a.getAttribute("title")).toBe("Mock API · to set up"); expect(screen.getByTestId("connector-card-drive").getAttribute("title")).toBe("Drive · connected");
    expect(a.textContent).toBe("M");   // an icon tile, not a line of text: the name is on hover
    expect(screen.queryByTestId("connectors-empty")).toBeNull();
  });
  it("opens the connection screen: the tutorial, a masked field per secret, a link to where the key lives", async () => {
    apiGet.mockResolvedValue(list([row()])); render(<ConnectorsPane every={60000} />);
    fireEvent.click(await screen.findByTestId("connector-card-mock-api"));
    expect(screen.getByTestId("connector-steps")).toHaveTextContent("Open settings"); expect(screen.getByTestId("connector-steps")).toHaveTextContent("Copy the token");
    expect((screen.getByTestId("input-token") as HTMLInputElement).getAttribute("data-secret")).toBe("true"); expect((screen.getByTestId("input-token") as HTMLInputElement).type).toBe("text");   // masked by style, so the browser does not offer to save it as a login
    expect(screen.getByText(/where do I find this/).getAttribute("href")).toBe("https://x.example/settings");
    expect(screen.getByText(/never change anything/)).toBeTruthy();
  });
  it("sends only what was typed, shows the answer, and never shows the value back", async () => {
    apiGet.mockResolvedValue(list([row()]));
    apiPost.mockResolvedValue({ ok: true, message: "connected: HTTP 200", connector: row({ status: "connected", missing: [], recipe: { steps: [], inputs: [{ id: "token", label: "Token", secret: true, filled: true }] } }) });
    render(<ConnectorsPane every={60000} />); fireEvent.click(await screen.findByTestId("connector-card-mock-api"));
    expect((screen.getByTestId("connector-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("input-token"), { target: { value: "sk-live-123" } }); fireEvent.click(screen.getByTestId("connector-save"));
    expect(await screen.findByTestId("connector-message")).toHaveTextContent("connected: HTTP 200");
    expect(apiPost).toHaveBeenCalledWith("/api/v1/connectors/save", { slug: "mock-api", inputs: { token: "sk-live-123" } }, expect.anything());
    expect(screen.getByTestId("filled-token")).toHaveTextContent("saved"); expect(screen.getByTestId("connector-status")).toHaveTextContent("connected");
    expect(document.body.innerHTML).not.toContain("sk-live-123");
  });
  it("shows why a test failed, in the service's words", async () => {
    apiGet.mockResolvedValue(list([row()])); apiPost.mockResolvedValue({ ok: false, error: "the service answered HTTP 401: bad key", connector: row({ status: "error", note: "the service answered HTTP 401: bad key", missing: [] }) });
    render(<ConnectorsPane every={60000} />); fireEvent.click(await screen.findByTestId("connector-card-mock-api"));
    fireEvent.change(screen.getByTestId("input-token"), { target: { value: "x" } }); fireEvent.click(screen.getByTestId("connector-save"));
    expect(await screen.findByTestId("connector-message")).toHaveTextContent("HTTP 401"); expect(screen.getByTestId("connector-error")).toHaveTextContent("bad key");
  });
  it("a sign-in that needs no setup is one Connect button and nothing to paste; the person can still use their own client", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    apiGet.mockImplementation(async (p: string) => p.startsWith("/api/v1/connectors/oauth/start") ? { ok: true, url: "https://accounts.example.com/auth?x=2" } : list([row({ slug: "drive", title: "Google Drive", auth: "oauth", missing: [], oauth_ready: true, recipe: { steps: ["a long tutorial"], inputs: [{ id: "client_id", label: "Client ID", secret: false, filled: false }] } })]));
    render(<ConnectorsPane every={60000} />); fireEvent.click(await screen.findByTestId("connector-card-drive"));
    expect(screen.getByTestId("connector-oneclick")).toHaveTextContent("nothing to copy or paste"); expect(screen.queryByTestId("input-client_id")).toBeNull(); expect(screen.queryByTestId("connector-steps")).toBeNull(); expect(screen.queryByTestId("connector-save")).toBeNull();
    fireEvent.click(screen.getByTestId("connector-connect")); await waitFor(() => expect(open).toHaveBeenCalledWith("https://accounts.example.com/auth?x=2", "_blank", "noopener")); open.mockRestore();
    fireEvent.click(screen.getByTestId("connector-manual")); expect(screen.getByTestId("input-client_id")).toBeTruthy();
  });
  it("an OAuth connector has a Connect button that opens the service's own sign-in in a new tab", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    apiGet.mockImplementation(async (p: string) => p.startsWith("/api/v1/connectors/oauth/start") ? { ok: true, url: "https://accounts.example.com/auth?x=1" } : list([row({ auth: "oauth", missing: [], redirect_uri: "http://127.0.0.1:41999/api/v1/connectors/oauth/callback" })]));
    render(<ConnectorsPane every={60000} />); fireEvent.click(await screen.findByTestId("connector-card-mock-api")); expect(screen.getByTestId("connector-redirect")).toHaveTextContent("/api/v1/connectors/oauth/callback"); fireEvent.click(screen.getByTestId("connector-connect"));
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://accounts.example.com/auth?x=1", "_blank", "noopener")); open.mockRestore();
  });
  it("shows the recipe as YAML, and removing takes two clicks", async () => {
    apiGet.mockResolvedValue(list([row()])); apiPost.mockResolvedValue({ ok: true });
    render(<ConnectorsPane every={60000} />); fireEvent.click(await screen.findByTestId("connector-card-mock-api"));
    fireEvent.click(screen.getByTestId("connector-yaml-toggle")); expect(screen.getByTestId("connector-yaml")).toHaveTextContent("slug: mock-api");
    fireEvent.click(screen.getByTestId("connector-remove")); expect(apiPost).not.toHaveBeenCalled(); fireEvent.click(screen.getByTestId("connector-remove-yes"));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/api/v1/connectors/remove", { slug: "mock-api" })); await waitFor(() => expect(screen.queryByTestId("connector-detail-mock-api")).toBeNull());
  });
});

describe("what agents may do", () => {
  it("is look-only until the person allows more, and allowing more asks first", async () => {
    apiGet.mockResolvedValue(list([row({ access: "read-only" })]));
    apiPost.mockResolvedValue({ ok: true, connector: row({ access: "read-write" }) });
    render(<ConnectorsPane every={60000} />); fireEvent.click(await screen.findByTestId("connector-card-mock-api"));
    expect(screen.getByTestId("access-read-only").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("access-read-write")); expect(screen.getByTestId("access-confirm")).toHaveTextContent("create, change and delete"); expect(apiPost).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("access-no")); expect(screen.queryByTestId("access-confirm")).toBeNull(); expect(apiPost).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("access-read-write")); fireEvent.click(screen.getByTestId("access-yes"));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/api/v1/connectors/access", { slug: "mock-api", access: "read-write" }));
    await waitFor(() => expect(screen.getByTestId("access-read-write").getAttribute("aria-pressed")).toBe("true"));
  });
});

describe("an agent proposed a connector: the pane opens on its connection screen", () => {
  it("a pane that opens after the request starts on that connector", async () => {
    apiGet.mockResolvedValue(list([row(), row({ slug: "drive", title: "Google Drive" })])); requestOpenConnector("drive"); render(<ConnectorsPane every={60000} />);
    expect(await screen.findByTestId("connector-detail-drive")).toBeTruthy();
  });
  it("a pane that is already open switches to it, and the command is understood", async () => {
    apiGet.mockResolvedValue(list([row(), row({ slug: "drive", title: "Google Drive" })])); render(<ConnectorsPane every={60000} />);
    fireEvent.click(await screen.findByTestId("connector-card-mock-api")); expect(screen.getByTestId("connector-detail-mock-api")).toBeTruthy();
    requestOpenConnector("drive"); expect(await screen.findByTestId("connector-detail-drive")).toBeTruthy();
    expect(parseCommand({ id: 4, op: "connector_open", args: { slug: "drive" } })).toEqual({ id: 4, op: "connector_open", slug: "drive" }); expect(parseCommand({ id: 5, op: "connector_open", args: {} })).toEqual({ id: 5, op: "connector_open", slug: "" });   // no slug: just open the pane
  });
});

describe("the connector helpers", () => {
  it("reads a row defensively and names the status in words", () => {
    expect(parseConnector(null)).toBeNull(); expect(parseConnector({ title: "x" })).toBeNull();
    const c = parseConnector(row())!; expect(c.inputs[0].secret).toBe(true); expect(c.steps).toHaveLength(2); expect(statusWord(c)).toBe("to set up");
    expect(statusWord({ status: "draft", missing: [], auth: "oauth" })).toBe("ready to sign in"); expect(statusWord({ status: "draft", missing: [], auth: "key" })).toBe("ready to test"); expect(statusWord({ status: "error", missing: [], auth: "key" })).toBe("needs another look");
    expect(monogram("  drive")).toBe("D"); expect(monogram("")).toBe("?");
  });
});
