// @vitest-environment jsdom
// AN AGENT IS NOT WRITTEN TO BEFORE ANTILOKI'S TOOLS ARE CONNECTED (operator 2026-11-23).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const apiGet = vi.fn();
const listEngines = vi.fn(async (): Promise<any[]> => []);
vi.mock("./api", () => ({ listEngines: () => listEngines() }));
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...a) }));
import { McpGate } from "./McpGate";

beforeEach(() => { apiGet.mockReset(); listEngines.mockReset().mockResolvedValue([]); });
afterEach(() => cleanup());
const gate = (props: any = {}) => render(<McpGate paneId={7} engine="claude-code" onReconnect={() => {}} everyMs={20} waitMs={150} {...props} />);

describe("the connection gate", () => {
  it("never covers the agent's own question (the trust-this-folder prompt comes before it loads any tool), and covers again once it is answered", async () => {
    apiGet.mockResolvedValue({ ok: true, running: true, mcp: false, ask: true });
    gate(); await new Promise((r) => setTimeout(r, 120)); expect(screen.queryByTestId("mcp-gate")).toBeNull();
    apiGet.mockResolvedValue({ ok: true, running: true, mcp: false, ask: false });
    expect(await screen.findByTestId("mcp-gate")).toBeTruthy();
  });
  it("covers the pane while antiloki's tools are not connected, and lifts the moment they are", async () => {
    apiGet.mockResolvedValue({ ok: true, running: true, mcp: false });
    gate(); expect(await screen.findByTestId("mcp-gate")).toBeTruthy(); expect(screen.getByText(/Connecting antiloki's tools/)).toBeTruthy();
    apiGet.mockResolvedValue({ ok: true, running: true, mcp: true });
    await waitFor(() => expect(screen.queryByTestId("mcp-gate")).toBeNull());
    expect(apiGet).toHaveBeenCalledWith("/api/v1/cockpit/pane/mcp?pane_id=7");
  });
  it("after the wait it says the tools did not connect and offers Reconnect, which asks for a restart", async () => {
    apiGet.mockResolvedValue({ ok: true, running: true, mcp: false }); const onReconnect = vi.fn(); gate({ onReconnect });
    await waitFor(() => expect(screen.getByTestId("mcp-gate").getAttribute("data-late")).toBe("1"));
    expect(screen.getByText(/did not connect/)).toBeTruthy(); fireEvent.click(screen.getByTestId("mcp-reconnect")); expect(onReconnect).toHaveBeenCalledTimes(1);
  });
  it("there is no way round it: no 'use the agent without them', only Reconnect", async () => {
    apiGet.mockResolvedValue({ ok: true, running: true, mcp: false }); gate();
    await waitFor(() => expect(screen.getByTestId("mcp-gate").getAttribute("data-late")).toBe("1")); expect(screen.queryByTestId("mcp-skip")).toBeNull(); expect(screen.getByTestId("mcp-reconnect")).toBeTruthy();
  });
  it("covers nothing for a serve that does not know the route, for an agent with no helper, or for a pane that is already connected", async () => {
    apiGet.mockRejectedValue(new Error("404")); const a = gate(); await waitFor(() => expect(apiGet).toHaveBeenCalled()); expect(screen.queryByTestId("mcp-gate")).toBeNull(); a.unmount();
    apiGet.mockReset(); apiGet.mockResolvedValue({ ok: true, running: true, mcp: false }); const b = gate({ engine: "cursor" }); await new Promise((r) => setTimeout(r, 60)); expect(screen.queryByTestId("mcp-gate")).toBeNull(); expect(apiGet).not.toHaveBeenCalled(); b.unmount();
    apiGet.mockResolvedValue({ ok: true, running: true, mcp: true }); gate(); await waitFor(() => expect(apiGet).toHaveBeenCalled()); expect(screen.queryByTestId("mcp-gate")).toBeNull();
  });
  it("an agent that is not signed in says so and can be uncovered to sign in; a signed-in one cannot", async () => {
    apiGet.mockResolvedValue({ ok: true, running: true, mcp: false });
    listEngines.mockResolvedValue([{ key: "opencode", label: "OpenCode", seat: false, missing: "`opencode` is installed but not signed in" }]);
    gate({ engine: "opencode" }); expect((await screen.findByTestId("mcp-signed-out")).textContent).toContain("OpenCode is not signed in"); expect(screen.getByTestId("mcp-reconnect")).toBeTruthy();
    fireEvent.click(screen.getByTestId("mcp-sign-in")); await waitFor(() => expect(screen.queryByTestId("mcp-gate")).toBeNull());
  });
  it("covers while the terminal has not started yet", async () => {
    apiGet.mockResolvedValue({ ok: true, running: false, mcp: false }); gate(); expect(await screen.findByTestId("mcp-gate")).toBeTruthy();
  });
});
