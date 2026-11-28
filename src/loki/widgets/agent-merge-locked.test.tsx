// @vitest-environment jsdom
// THE LOCKED PAIR TILES ARE FOLDED (2026-10-10: "the Claude x ... pair tiles are still listed when Claude is off"): the picker lists the pairs this machine can use; the ones that need a switched-off seat
// sit behind one count button, and the pair the agent already has stays visible whatever its state.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

const MACHINE = vi.hoisted(() => ({
  engines: [{ key: "claude-code", name: "Claude", usable: false, on: false }, { key: "codex", name: "Codex", usable: true, on: true }],
  advice: null,
  merges: [
    { planner: "codex", worker: "codex", label: "Codex × Codex", engines: ["codex"], runs: 9, rows: 1, quality: 0.98, usd: 0.1, s: 60, jobs: [], domains: [], ready: true, missing: [] },
    { planner: "claude-code", worker: "codex", label: "Claude × Codex", engines: ["claude-code", "codex"], runs: 5, rows: 1, quality: 0.99, usd: 0.2, s: 90, jobs: [], domains: [], ready: false, missing: ["Claude"] },
  ],
}));
vi.mock("@/loki/api/client", () => ({
  apiPost: vi.fn(async () => ({ result: {} })),
  apiGet: vi.fn(async (u: string) => (String(u).includes("/api/v1/engines") ? MACHINE : {})),
  unwrapResult: (r: any) => r?.result ?? r,
}));
import { MergeConfig } from "./agent-wizard";

const pane = (settings: any) => ({ id: 7, pane_kind: "claude-code", settings_json: JSON.stringify(settings) } as any);

describe("the picker folds the pairs this machine cannot use", () => {
  it("shows the usable pair and one count button; the count button reveals the locked one and hides it again", async () => {
    render(<MergeConfig pane={pane({})} onSaved={vi.fn()} />);
    expect(await screen.findByTestId("merge-codex|codex")).toBeTruthy();
    expect(screen.queryByTestId("merge-claude-code|codex")).toBeNull();
    const t = screen.getByTestId("merge-locked-toggle"); expect(t.textContent).toContain("1 unavailable");
    fireEvent.click(t);
    expect(screen.getByTestId("merge-claude-code|codex")).toBeTruthy();
    expect(screen.getByTestId("merge-locked-toggle").textContent).toContain("hide");
  });
  it("the pair the agent already has stays visible even when its seat is off, and then nothing is folded", async () => {
    render(<MergeConfig pane={pane({ pair: { name: "claude-code|codex", brain: { engine: "claude-code" }, hands: { engine: "codex" } } })} onSaved={vi.fn()} />);
    expect(await screen.findByTestId("merge-claude-code|codex")).toBeTruthy();
    expect(screen.queryByTestId("merge-locked-toggle")).toBeNull();
  });
});
