import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = { ptyStatus: vi.fn(), ptyResize: vi.fn(), ptyStart: vi.fn(), shellStart: vi.fn(), ptyInput: vi.fn() };
vi.mock("./api", () => ({ attachFile: async () => ({ ok: false, error: "no" }), ptyStatus: (...a: unknown[]) => api.ptyStatus(...a), ptyResize: (...a: unknown[]) => api.ptyResize(...a), ptyStart: (...a: unknown[]) => api.ptyStart(...a), shellStart: (...a: unknown[]) => api.shellStart(...a), ptyInput: (...a: unknown[]) => api.ptyInput(...a) }));
vi.mock("@/loki/cockpit/pty-streams", () => ({ subscribePane: () => () => {} }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
vi.mock("@xterm/xterm", () => ({
  Terminal: class { cols = 71; rows = 29; modes = { mouseTrackingMode: "none" }; buffer = { active: { length: 0, baseY: 0, getLine: () => undefined } }; loadAddon() {} open() {} onData() {} onSelectionChange() {} attachCustomKeyEventHandler() {} hasSelection() { return false; } getSelection() { return ""; } clearSelection() {} write() {} focus() {} dispose() {} },
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));

import { TerminalPane } from "./TerminalPane";

beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); api.ptyStatus.mockResolvedValue({ running: false, ready: false }); api.ptyStart.mockResolvedValue({ ok: true }); (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} }; });
afterEach(() => cleanup());
const pane = { id: "p", kind: "engine" as const, engine: "claude-code", paneId: 5, held: true };
describe("a held pane", () => {
  it("starts nothing until the person clicks start, then says it is running", async () => {
    const onStarted = vi.fn(); render(<TerminalPane pane={pane} focused={false} onFocus={() => {}} onStarted={onStarted} />);
    await waitFor(() => expect(screen.getByTestId("terminal-held")).toBeTruthy()); expect(api.ptyStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("terminal-start")); await waitFor(() => expect(onStarted).toHaveBeenCalled()); expect(api.ptyStart).toHaveBeenCalledTimes(1); expect(screen.queryByTestId("terminal-held")).toBeNull();
  });
});
