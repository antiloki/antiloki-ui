// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { McpChip, stateOf } from "./McpChip";

const apiGet = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...a) }));
beforeEach(() => apiGet.mockReset()); afterEach(() => cleanup());

describe("the MCP mark on an agent's top bar (the pane's real state)", () => {
  it("reads the serve's answer: up, down, asking its own question, or unknown (an older serve)", () => {
    expect(stateOf({ ok: true, running: true, mcp: true })).toBe("up"); expect(stateOf({ ok: true, running: true, mcp: false })).toBe("down");
    expect(stateOf({ ok: true, running: true, mcp: false, ask: true })).toBe("asking"); expect(stateOf({ ok: false })).toBe("unknown"); expect(stateOf({ ok: true, running: false, mcp: false })).toBe("unknown"); expect(stateOf(null)).toBe("unknown");
  });
  it("is the turning mark when the tools are connected", async () => {
    apiGet.mockResolvedValue({ ok: true, running: true, mcp: true }); render(<McpChip paneId={7} engine="claude-code" onReconnect={() => {}} everyMs={20} />);
    await waitFor(() => expect(screen.getByTestId("mcp-chip").getAttribute("data-state")).toBe("up")); expect(screen.getByTestId("mcp-chip").className).toContain("mcp-alive");
  });
  it("is the red mark when they are not, and a click retries the connection (the agent is started again)", async () => {
    const onReconnect = vi.fn(); apiGet.mockResolvedValue({ ok: true, running: true, mcp: false }); render(<McpChip paneId={7} engine="claude-code" onReconnect={onReconnect} everyMs={20} />);
    await waitFor(() => expect(screen.getByTestId("mcp-chip").getAttribute("data-state")).toBe("down")); expect(screen.getByTestId("mcp-chip").className).toContain("mcp-off");
    fireEvent.click(screen.getByTestId("mcp-chip")); expect(onReconnect).toHaveBeenCalledTimes(1);
  });
  it("a click on the connected mark RECONNECTS (the agent starts again and loads the tools and brief afresh), and says so", async () => {
    const onReconnect = vi.fn(); apiGet.mockResolvedValue({ ok: true, running: true, mcp: true }); render(<McpChip paneId={7} engine="claude-code" onReconnect={onReconnect} everyMs={5000} />);
    await waitFor(() => expect(screen.getByTestId("mcp-chip").getAttribute("data-state")).toBe("up"));
    fireEvent.click(screen.getByTestId("mcp-chip")); expect(onReconnect).toHaveBeenCalledTimes(1); expect(screen.getByTestId("mcp-flash").textContent).toBe("reconnecting…");
  });
  it("but not in the middle of a turn: a working agent is left alone and the mark says why", async () => {
    const onReconnect = vi.fn(); apiGet.mockResolvedValue({ ok: true, running: true, mcp: true }); render(<McpChip paneId={7} engine="claude-code" onReconnect={onReconnect} busy everyMs={5000} />);
    await waitFor(() => expect(screen.getByTestId("mcp-chip").getAttribute("data-state")).toBe("up"));
    fireEvent.click(screen.getByTestId("mcp-chip")); expect(onReconnect).not.toHaveBeenCalled(); expect(screen.getByTestId("mcp-flash").textContent).toContain("working");
  });
  it("does not offer a retry while the agent asks its own question, and turns green when the tools come", async () => {
    const onReconnect = vi.fn(); apiGet.mockResolvedValue({ ok: true, running: true, mcp: false, ask: true }); render(<McpChip paneId={7} engine="claude-code" onReconnect={onReconnect} everyMs={20} />);
    await waitFor(() => expect(screen.getByTestId("mcp-chip").getAttribute("data-state")).toBe("asking")); fireEvent.click(screen.getByTestId("mcp-chip")); expect(onReconnect).not.toHaveBeenCalled(); expect(screen.getByTestId("mcp-flash").textContent).toContain("answer in the terminal");
    apiGet.mockResolvedValue({ ok: true, running: true, mcp: true }); await waitFor(() => expect(screen.getByTestId("mcp-chip").getAttribute("data-state")).toBe("up"));
  });
  it("draws nothing for an agent with no tools helper, and a grey mark (not nothing) for a serve that cannot say", async () => {
    apiGet.mockResolvedValue({ ok: true, running: true, mcp: false }); const { container, rerender } = render(<McpChip paneId={7} engine="grok" onReconnect={() => {}} everyMs={20} />);
    await new Promise((r) => setTimeout(r, 60)); expect(container.textContent).toBe("");
    apiGet.mockResolvedValue({ message: "Not Found" }); rerender(<McpChip paneId={7} engine="claude-code" onReconnect={() => {}} everyMs={20} />); await new Promise((r) => setTimeout(r, 60)); expect(container.querySelector('[data-state="unknown"]')).toBeTruthy();
  });
});
