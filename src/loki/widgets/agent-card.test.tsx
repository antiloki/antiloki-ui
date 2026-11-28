// THE AGENT CARD — engine · scope · ask → one thread (operator 2026-09-16).
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn(async () => ({ result: {} })), apiGet: vi.fn(async () => ({ result: {} })) }));
vi.mock("./scope-picker", () => ({ useAtlasEntries: () => ({ entries: [], loading: false, tokens: {} }), filesInScope: () => [], tokensInScope: () => 0, fmtTok: (n: number) => String(n), PackChips: ({ onToggle }: any) => <button data-testid="pack-chip-laws" onClick={() => onToggle({ kind: "laws" })}>laws</button> }));
vi.mock("./context-pack", async (importOriginal) => ({ ...(await importOriginal<any>()), fetchSources: vi.fn(async () => []) }));
vi.mock("@/loki/cockpit/cockpit-view", () => ({ FileTree: ({ value, onChange }: any) => <input data-testid="scope-input" value={value} onChange={(e) => onChange(e.target.value)} /> }));
import { AgentCard, titleFromAsk, agentCardEngine } from "./agent-card";
import { apiGet } from "@/loki/api/client";
import { forgetSeats } from "@/loki/api/seats";

describe("titleFromAsk", () => {
  it("takes the first meaningful line, strips markdown, caps at 48 chars", () => {
    expect(titleFromAsk("# fix the flaky playground tests\n\nkeep the API stable", "claude-code")).toBe("fix the flaky playground tests");
    expect(titleFromAsk("- " + "a".repeat(60), "codex")).toBe("a".repeat(47) + "…");
    expect(titleFromAsk("   ", "opencode")).toBe("OpenCode");
  });
});

describe("AgentCard", () => {
  // the engine chooser lists the seats the serve reports (none until the read lands), so the machine is named
  beforeEach(() => { forgetSeats(); (apiGet as any).mockImplementation(async (u: string) => (String(u).includes("settings/providers") ? MACHINE : { result: {} })); });
  it("needs both an ask and a scope; start hands back engine · scope · ask · title", async () => {
    const onStart = vi.fn();
    render(<AgentCard onStart={onStart} onClose={() => {}} />);
    const start = screen.getByTestId("agent-start") as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("agent-ask"), { target: { value: "fix the flaky playground tests" } });
    expect(start.disabled).toBe(true);
    fireEvent.click(await screen.findByTestId("engine-codex"));   // no engine is assumed: until one is named (or the serve's pick is read) nothing starts
    fireEvent.change(screen.getByTestId("scope-input"), { target: { value: "compiler/apps/playground/**" } });
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ engine: "codex", scope: ["compiler/apps/playground/**"], ask: "fix the flaky playground tests", title: "fix the flaky playground tests" }));
    // ticking an antiIDE chip turns the pack custom and rides on the start
    fireEvent.click(screen.getByTestId("pack-chip-laws"));
    fireEvent.click(start);
    expect(onStart).toHaveBeenLastCalledWith(expect.objectContaining({ pack: { preset: "custom", items: [{ kind: "laws" }], live: true, budget_chars: 200_000 } }));
  });
  it("opened from an engine's own tile (fixed): no chooser, the ask is optional, only the scope gates start", () => {
    const onStart = vi.fn();
    render(<AgentCard engine="claude-code" fixed onStart={onStart} onClose={() => {}} />);
    expect(screen.queryByTestId("engine-codex")).toBeNull();
    expect(screen.getByText("✦ Claude Code")).toBeTruthy();
    const start = screen.getByTestId("agent-start") as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("scope-input"), { target: { value: "packages/scheduler/**" } });
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ engine: "claude-code", scope: ["packages/scheduler/**"], ask: "", title: "Claude Code" }));
  });
  it("a prefilled ask (from a widget) is the card's ask; the scope still gates start", () => {
    const onStart = vi.fn();
    render(<AgentCard engine="codex" initialAsk="Implement the design change" initialScope={["src/routes/index.tsx"]} onStart={onStart} onClose={() => {}} />);
    expect((screen.getByTestId("agent-ask") as HTMLTextAreaElement).value).toBe("Implement the design change");
    expect((screen.getByTestId("agent-start") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("agent-start"));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ engine: "codex", scope: ["src/routes/index.tsx"], ask: "Implement the design change" }));
  });
});

// REVIEW 2026-10-01 of "Engine config also": the ultra review's "→ agent" sent Gemini, Cursor or Grok and the card opened on Claude Code (three engines were
// known, the rest fell back to claude-code) - on a machine whose Claude subscription had ended. THE MACHINE: Claude switched off, Cursor is what Heimdall plans on.
const MACHINE = { engines: [
  { key: "claude-code", name: "Claude", usable: false, on: false }, { key: "codex", name: "Codex", usable: true, on: true }, { key: "gemini", name: "Gemini", usable: true, on: true },
  { key: "grok", name: "Grok", usable: true, on: true }, { key: "cursor", name: "Cursor", usable: true, on: true }, { key: "opencode", name: "OpenCode", usable: false, on: true }], heimdall: { effective: "cursor" } };
describe("the agent card knows every seat and never falls back to Claude", () => {
  beforeEach(() => { forgetSeats(); (apiGet as any).mockImplementation(async (u: string) => (String(u).includes("settings/providers") ? MACHINE : { result: {} })); });
  it("a widget's engine is any seat of the product, else nothing", () => {
    for (const k of ["claude-code", "codex", "gemini", "grok", "cursor", "opencode"]) expect(agentCardEngine(k)).toBe(k);
    expect(agentCardEngine("auto")).toBeUndefined();
    expect(agentCardEngine(undefined)).toBeUndefined();
    expect(agentCardEngine("gpt")).toBeUndefined();
  });
  it("opened on Gemini (the ultra review's hand-off) it starts a Gemini agent", () => {
    const onStart = vi.fn();
    render(<AgentCard engine="gemini" fixed initialScope={["src/db.ts"]} onStart={onStart} onClose={() => {}} />);
    expect(screen.getByText("✧ Antigravity")).toBeTruthy();
    fireEvent.click(screen.getByTestId("agent-start"));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ engine: "gemini", scope: ["src/db.ts"] }));
  });
  it("opened on no engine (the review ran on auto) it opens on the seat the serve plans on, not on Claude", async () => {
    const onStart = vi.fn();
    render(<AgentCard fixed initialScope={["src/db.ts"]} onStart={onStart} onClose={() => {}} />);
    await waitFor(() => expect((screen.getByTestId("agent-start") as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText("▣ Cursor")).toBeTruthy();
    fireEvent.click(screen.getByTestId("agent-start"));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ engine: "cursor" }));
    expect(onStart).not.toHaveBeenCalledWith(expect.objectContaining({ engine: "claude-code" }));
  });
  it("the chooser offers Gemini, Grok and Cursor, and not the switched-off Claude", async () => {
    const onStart = vi.fn();
    render(<AgentCard initialAsk="fix it" initialScope={["a/**"]} onStart={onStart} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("engine-gemini")).toBeTruthy());
    expect(screen.getByTestId("engine-grok")).toBeTruthy();
    expect(screen.getByTestId("engine-cursor")).toBeTruthy();
    expect(screen.getByTestId("engine-codex")).toBeTruthy();
    expect(screen.queryByTestId("engine-claude-code")).toBeNull();
    fireEvent.click(screen.getByTestId("engine-grok"));
    fireEvent.click(screen.getByTestId("agent-start"));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ engine: "grok" }));
  });
});
