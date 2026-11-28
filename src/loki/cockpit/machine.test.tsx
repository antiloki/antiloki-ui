// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() })); vi.mock("@/loki/api/client", () => api);
import { parseMachine, toneOf, adviceOf, gb } from "./machine";
import { MachineIcon } from "./MachineIcon";

const raw = (o: any = {}) => ({ ok: true, t_ms: 1, cpu: { pct: 34.2, cores: 12 }, ram: { used_mb: 18800, total_mb: 32768, pct: 57.4 }, vram: { used_mb: 10600, total_mb: 12288, pct: 86.3 }, tone: "loaded", procs: [{ pid: 1, name: "ollama", kind: "local model", cpu: 12, ram_kb: 5_900_000 }, { pid: 2, name: "claude", kind: "agent", cpu: 4, ram_kb: 1_400_000 }, { nope: 1 }], ...o });
afterEach(() => cleanup());
describe("the machine, shaped", () => {
  it("reads the serve's answer and keeps what it could not read as null, never zero", () => {
    const m = parseMachine(raw({ vram: null, cpu: { pct: null, cores: 8 } }))!; expect(m.vram).toBeNull(); expect(m.cpu.pct).toBeNull(); expect(m.procs.map((p) => p.name)).toEqual(["ollama", "claude"]); expect(parseMachine(null)).toBeNull(); expect(parseMachine({ ok: false })).toBeNull();
  });
  it("turns amber at 80 and red at 92, and the advice names the heaviest and what to stop", () => {
    expect(toneOf(79.9)).toBe("calm"); expect(toneOf(80)).toBe("loaded"); expect(toneOf(92)).toBe("danger"); expect(toneOf(null)).toBe("calm"); expect(gb(10240)).toBe("10.0 GB");
    const loaded = adviceOf(parseMachine(raw())!); expect(loaded.tone).toBe("loaded"); expect(loaded.text).toContain("VRAM is at 86%"); expect(loaded.text).toContain("ollama");
    const danger = adviceOf(parseMachine(raw({ vram: { used_mb: 12000, total_mb: 12288, pct: 97.7 } }))!); expect(danger.tone).toBe("danger"); expect(danger.text).toMatch(/about to freeze.*Stop ollama/);
    expect(adviceOf(parseMachine(raw({ ram: { used_mb: 1, total_mb: 10, pct: 10 }, vram: null }))!).tone).toBe("calm");
  });
});
describe("the machine icon and window", () => {
  it("shows three bars coloured by their own tone, and opens the window with rings, advice and processes", async () => {
    api.apiGet.mockResolvedValue(raw()); render(<MachineIcon />); await waitFor(() => expect(screen.getByTestId("machine-icon").getAttribute("data-tone")).toBe("loaded"));
    expect(screen.getByTestId("machine-icon").title).toContain("VRAM 86%"); expect(screen.getByTestId("machine-bar-2").style.height).toMatch(/13\.8/); expect(screen.getByTestId("machine-icon").textContent).toContain("86%");
    fireEvent.click(screen.getByTestId("machine-icon")); await waitFor(() => screen.getByTestId("machine-window"));
    expect(screen.getByTestId("machine-vram-pct").textContent).toBe("86%"); expect(screen.getByTestId("machine-vram").getAttribute("data-tone")).toBe("loaded"); expect(screen.getByTestId("machine-cpu-pct").textContent).toBe("34%"); expect(screen.getByTestId("machine-advice").textContent).toContain("ollama");
    expect(screen.getAllByTestId("machine-proc")).toHaveLength(2); expect(screen.getByTestId("machine-scrim").style.placeItems).toBe("center");
    fireEvent.keyDown(window, { key: "Escape" }); await waitFor(() => expect(screen.queryByTestId("machine-window")).toBeNull());
  });
  it("says a GPU was not found instead of drawing zero, and a click outside closes it", async () => {
    api.apiGet.mockResolvedValue(raw({ vram: null, tone: "calm", ram: { used_mb: 8000, total_mb: 32768, pct: 24 } })); render(<MachineIcon />); await waitFor(() => screen.getByTestId("machine-icon")); fireEvent.click(screen.getByTestId("machine-icon")); await waitFor(() => screen.getByTestId("machine-vram"));
    expect(screen.getByTestId("machine-vram-pct").textContent).toBe("—"); expect(screen.getByTestId("machine-vram").textContent).toContain("no GPU found"); fireEvent.mouseDown(screen.getByTestId("machine-scrim")); await waitFor(() => expect(screen.queryByTestId("machine-window")).toBeNull());
  });
  it("offers to unload local models only when one is loaded, asks first, and says what it did", async () => {
    api.apiGet.mockResolvedValue(raw()); api.apiPost.mockResolvedValue({ ok: true, unloaded: ["qwen3-coder:30b"] }); render(<MachineIcon />); await waitFor(() => screen.getByTestId("machine-icon")); fireEvent.click(screen.getByTestId("machine-icon")); await waitFor(() => screen.getByTestId("machine-unload"));
    fireEvent.click(screen.getByTestId("machine-unload")); expect(api.apiPost).not.toHaveBeenCalled(); fireEvent.click(screen.getByTestId("machine-unload-yes")); await waitFor(() => expect(screen.getByTestId("machine-unload-msg").textContent).toContain("Unloaded qwen3-coder:30b")); expect(api.apiPost).toHaveBeenCalledWith("/api/v1/machine/unload", {});
    cleanup(); api.apiGet.mockResolvedValue(raw({ procs: [{ pid: 2, name: "claude", kind: "agent", cpu: 1, ram_kb: 1000 }] })); render(<MachineIcon />); await waitFor(() => screen.getByTestId("machine-icon")); fireEvent.click(screen.getByTestId("machine-icon")); await waitFor(() => screen.getByTestId("machine-window")); expect(screen.queryByTestId("machine-unload")).toBeNull();
  });
});
