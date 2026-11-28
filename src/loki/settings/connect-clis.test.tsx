import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { cliPayloadOf, cliSummary, ConnectClis, ConnectNudge, type CliPayload } from "./connect-clis";

const row = (key: string, installed: boolean, connected: boolean) => ({ key, label: key, cli: key, installed, connected, how: "command", will: `runs \`${key} mcp add antiloki\`` });
let state: CliPayload; const post = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: async () => state }));
vi.mock("@/loki/api/post-strict", () => ({ apiPostStrict: (...a: unknown[]) => post(...a), reasonOf: (e: unknown) => String(e) }));
beforeEach(() => { post.mockReset(); state = { ok: true, why: "why text", providers: [row("claude-code", true, false), row("codex", true, true), row("gemini", false, false)] }; post.mockImplementation(async (_u: string, b: { provider: string; action: string }) => { state = { ...state, providers: state.providers.map((r) => (r.key === b.provider ? { ...r, connected: b.action === "install" } : r)) }; return { ok: true }; }); });

describe("connect antiloki to your CLIs", () => {
  it("shows nothing when the serve has no such route (an older build)", async () => {
    state = { ok: false } as unknown as CliPayload; const { container } = render(<ConnectClis />);
    await waitFor(() => expect(container.querySelector("[data-testid=connect-clis]")).toBeNull());
  });
  it("reads the payload and counts what still waits", () => {
    expect(cliPayloadOf(null)).toBeNull(); expect(cliPayloadOf({ ok: false })).toBeNull();
    const s = cliSummary(state); expect(s.rows.map((r) => r.key)).toEqual(["claude-code", "codex"]); expect(s.open.map((r) => r.key)).toEqual(["claude-code"]);
  });
  it("lists only installed CLIs, and one click connects one", async () => {
    render(<ConnectClis />);
    await waitFor(() => expect(screen.getByTestId("connect-claude-code")).toBeTruthy());
    expect(screen.queryByTestId("connect-gemini")).toBeNull(); expect(screen.getByTestId("connect-codex").getAttribute("data-connected")).toBe("1");
    fireEvent.click(screen.getByTestId("connect-btn-claude-code"));
    await waitFor(() => expect(screen.getByTestId("connect-claude-code").getAttribute("data-connected")).toBe("1"));
    expect(post).toHaveBeenCalledWith("/api/v1/onboarding/mcp", { provider: "claude-code", action: "install" });
  });
  it("shows the server's reason when a connection fails", async () => {
    post.mockImplementation(async () => ({ ok: false, error: "claude did not start" }));
    render(<ConnectClis />); await waitFor(() => screen.getByTestId("connect-btn-claude-code")); fireEvent.click(screen.getByTestId("connect-btn-claude-code"));
    await waitFor(() => expect(screen.getByTestId("connect-err").textContent).toContain("claude did not start"));
  });
  it("the menu card offers to connect what is open, connects them all, and can be dismissed for good", async () => {
    state.providers = [row("claude-code", true, false), row("codex", true, false)]; try { localStorage.removeItem("antiloki.connect.nudge.off"); } catch { /* none */ }
    render(<ConnectNudge />); await waitFor(() => expect(screen.getByTestId("connect-nudge").textContent).toContain("claude-code, codex do not know antiloki"));
    fireEvent.click(screen.getByTestId("nudge-connect")); await waitFor(() => expect(screen.queryByTestId("connect-nudge")).toBeNull()); expect(post).toHaveBeenCalledTimes(2);
  });
  it("not now hides the card", async () => {
    state.providers = [row("claude-code", true, false)]; try { localStorage.removeItem("antiloki.connect.nudge.off"); } catch { /* none */ }
    render(<ConnectNudge />); await waitFor(() => screen.getByTestId("nudge-off")); fireEvent.click(screen.getByTestId("nudge-off")); expect(screen.queryByTestId("connect-nudge")).toBeNull(); expect(localStorage.getItem("antiloki.connect.nudge.off")).toBe("1");
  });
});
