// THE BASE AGENTS (operator 2026-09-23: "take out opencode option from agents studio, add a model name. We have 3 now:
// DeepSeek, Kimi and Qwen"): five tiles — Claude Code, Codex, then the three OpenCode models, each with its theme.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BASE_AGENTS, baseAgent, baseAgentOf } from "./base-agents";
import { AGENTS } from "./studio-overlay";
import { AgentCard } from "./agent-card";

// the providers read, answered at once: with nothing read no seat is offered (a switched-off Claude must not appear while the read is in flight), so a picker test names the machine it runs on
vi.mock("@/loki/api/seats", async () => { const real: any = await vi.importActual("@/loki/api/seats"); const s = real.seatsOf({ engines: ["claude-code", "codex", "gemini", "grok", "cursor", "opencode"].map((key) => ({ key, name: key, usable: true, on: true })), heimdall: { effective: "codex" } }); return { ...real, useSeats: () => s }; });
vi.mock("./scope-picker", async (orig) => ({ ...(await orig<any>()), useAtlasEntries: () => ({ entries: [], loading: false, tokens: {} }) }));
vi.mock("./context-pack", async (orig) => ({ ...(await orig<any>()), fetchSources: async () => [] }));
vi.mock("@/loki/cockpit/cockpit-view", () => ({ FileTree: ({ onChange }: any) => <button data-testid="pick-scope" onClick={() => onChange("src/**")}>scope</button> }));

describe("the base agents", () => {
  it("are Claude Code, Codex, DeepSeek, Kimi, Qwen — no bare OpenCode tile; the three models run the opencode engine on a qualified model", () => {
    expect(BASE_AGENTS.map((b) => b.id)).toEqual(["claude-code", "codex", "deepseek", "kimi", "qwen"]);
    expect(AGENTS.map((a) => a.label)).toEqual(["Claude Code", "Codex", "DeepSeek", "Kimi", "Qwen"]);
    expect(AGENTS.some((a) => a.label === "OpenCode")).toBe(false);
    for (const b of BASE_AGENTS.slice(2)) { expect(b.engine).toBe("opencode"); expect(b.model).toMatch(/^opencode\//); expect(b.theme).toBe(b.id); }
    expect(baseAgent("kimi")?.model).toBe("opencode/kimi-k2.7-code");
    expect(baseAgentOf("opencode", "opencode/qwen3.6-plus")?.id).toBe("qwen");
    expect(baseAgentOf("opencode", "opencode/glm-5")).toBeUndefined();
    expect(baseAgentOf("codex")?.id).toBe("codex");
  });
  it("the agent card chooses a base agent and hands it back on start — the engine follows it, the model rides with it", () => {
    const onStart = vi.fn();
    render(<AgentCard onStart={onStart} onClose={() => {}} />);
    for (const id of ["claude-code", "codex", "deepseek", "kimi", "qwen"]) expect(screen.getByTestId(`engine-${id}`)).toBeTruthy();
    expect(screen.queryByTestId("engine-opencode")).toBeNull();
    fireEvent.click(screen.getByTestId("engine-kimi"));
    fireEvent.change(screen.getByTestId("agent-ask"), { target: { value: "rank the threads" } });
    fireEvent.click(screen.getByTestId("pick-scope"));
    fireEvent.click(screen.getByTestId("agent-start"));
    expect(onStart).toHaveBeenCalledTimes(1);
    const s = onStart.mock.calls[0][0];
    expect(s.engine).toBe("opencode"); expect(s.base.id).toBe("kimi"); expect(s.base.model).toBe("opencode/kimi-k2.7-code"); expect(s.base.theme).toBe("kimi");
  });
  it("a fixed card from a tile is titled by the base agent, not the engine", () => {
    render(<AgentCard base={baseAgent("deepseek")} fixed onStart={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId("agent-card").textContent).toContain("DeepSeek");
    expect(screen.getByTestId("agent-card").textContent).not.toContain("OpenCode");
  });
});
