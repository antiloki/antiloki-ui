// ATTACHING TO A RUNNING TERMINAL SAYS ITS SIZE (operator 2026-11-10: "the terminal window is not scrollable" - the TUI was drawn for 149 columns in a 70-column pane).
// A terminal that is already running was started for some other size; nothing resized it, because the fit on mount ran before there was a terminal.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, waitFor } from "@testing-library/react";

const api = { ptyStatus: vi.fn(), ptyResize: vi.fn(), ptyStart: vi.fn(), shellStart: vi.fn(), ptyInput: vi.fn() };
vi.mock("./api", () => ({ attachFile: async () => ({ ok: false, error: "no" }), ptyStatus: (...a: unknown[]) => api.ptyStatus(...a), ptyResize: (...a: unknown[]) => api.ptyResize(...a), ptyStart: (...a: unknown[]) => api.ptyStart(...a), shellStart: (...a: unknown[]) => api.shellStart(...a), ptyInput: (...a: unknown[]) => api.ptyInput(...a) }));
vi.mock("@/loki/cockpit/pty-streams", () => ({ subscribePane: () => () => {} }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
vi.mock("@xterm/xterm", () => ({
  Terminal: class { cols = 71; rows = 29; modes = { mouseTrackingMode: "none" }; buffer = { active: { length: 0, baseY: 0, getLine: () => undefined } }; loadAddon() {} open() {} onData() {} onSelectionChange() {} attachCustomKeyEventHandler() {} hasSelection() { return false; } getSelection() { return ""; } clearSelection() {} write() {} focus() {} dispose() {} },
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));

import { TerminalPane } from "./TerminalPane";

beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} }; });

describe("a terminal pane attaching", () => {
  it("to a terminal that is already running sends it the pane's size and starts nothing", async () => {
    api.ptyStatus.mockResolvedValue({ running: true, ready: true });
    render(<TerminalPane pane={{ id: "p", kind: "engine", engine: "claude-code", paneId: 5 }} focused={false} onFocus={() => {}} />);
    await waitFor(() => expect(api.ptyResize).toHaveBeenCalledWith(5, 71, 29));
    expect(api.ptyStart).not.toHaveBeenCalled();
  });
  it("to one that is not running starts it at the pane's size", async () => {
    api.ptyStatus.mockResolvedValue({ running: false, ready: false });
    api.ptyStart.mockResolvedValue({ ok: true });
    render(<TerminalPane pane={{ id: "p", kind: "engine", engine: "claude-code", paneId: 5 }} focused={false} onFocus={() => {}} />);
    await waitFor(() => expect(api.ptyStart).toHaveBeenCalledWith(5, "claude-code", 71, 29));
  });
});
