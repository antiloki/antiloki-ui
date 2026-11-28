// @vitest-environment jsdom
// The ⚙ agent wizard: the rail's badges, the merged Context conversation, and "available to this
// agent" — the specialists and skills the operator lets the pane reach.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiPost = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiPost: (...a: any[]) => apiPost(...a), apiGet: vi.fn(), unwrapResult: (r: any) => r?.result ?? r, BE_URL: "" }));
// the providers read, answered at once: with nothing read no seat is offered (a switched-off Claude must not appear while the read is in flight), so a picker test names the machine it runs on
vi.mock("@/loki/api/seats", async () => { const real: any = await vi.importActual("@/loki/api/seats"); const s = real.seatsOf({ engines: ["claude-code", "codex", "gemini", "grok", "cursor", "opencode"].map((key) => ({ key, name: key, usable: true, on: true })), heimdall: { effective: "codex" } }); return { ...real, useSeats: () => s }; });
vi.mock("./cockpit-pane-body", () => ({ PaneEditModal: () => null, AuditWindow: () => null }));
vi.mock("./goal-run-panel", () => ({ GoalRunPanel: () => <div data-testid="goal-run-panel" /> }));
vi.mock("@/loki/codebase/constitution-agents", () => ({ AgentNode: ({ id }: any) => <span data-testid={`node-${id}`} /> }));

import { tabBadge, mergeTurns, withAvailability, AvailableToAgent, readDelegation, DelegationConfig, DELEGATION_DEFAULT, runHistoryLine, ShellPolicy } from "./agent-wizard";
import { compareLines } from "./subagents";

beforeEach(() => { apiPost.mockReset(); });

describe("tabBadge — pure", () => {
  it("plans pending · subagents live / to approve · audit reads · checkpoints", () => {
    const base = { plans: [], subJobs: [], goalRuns: [], reads: null, cps: null } as any;
    expect(tabBadge("plans", { ...base, plans: [{ status: "pending" }, { status: "accepted" }] })).toEqual({ text: "1 pending", tone: "warn" });
    expect(tabBadge("subagents", { ...base, goalRuns: [{ status: "awaiting-approval", tasks: [] }] })).toEqual({ text: "plan to approve", tone: "brand" });
    expect(tabBadge("subagents", { ...base, goalRuns: [{ status: "running", tasks: [{ status: "running" }, { status: "done" }] }] })).toEqual({ text: "1 running", tone: "warn" });
    expect(tabBadge("audit", { ...base, reads: { total: 12, pack: 1, source: 10 } })).toEqual({ text: "12 reads", tone: "warn" });
    expect(tabBadge("checkpoints", { ...base, cps: [{ sha: "a" }] })).toEqual({ text: "1", tone: "dim" });
    expect(tabBadge("overview", base)).toBeNull();
  });
});

describe("mergeTurns — the Context conversation", () => {
  it("interleaves prompts and answers by time; antiloki's own nudges are marked", () => {
    const t = mergeTurns([{ t: "2026-09-19T10:00:00", prompt: "do x", tokens: 3 }, { t: "2026-09-19T10:05:00", prompt: "[antiloki] read the pack" }], [{ t: "2026-09-19T10:01:00", text: "done x" }]);
    expect(t.map((x) => `${x.who}:${x.text}`)).toEqual(["you:do x", "agent:done x", "antiloki:[antiloki] read the pack"]);
    expect(t[1].tokens).toBe(2);
  });
});

describe("withAvailability + AvailableToAgent", () => {
  it("absent = all; a list narrows; saving writes the settings and materialises the skills", async () => {
    expect(withAvailability({ a: 1, specialists: ["x"] }, null, ["s"])).toEqual({ a: 1, skills: ["s"] });
    apiPost.mockImplementation(async (url: string, body: any) => {
      if (url === "/api/v1/dispatch" && body?.action_name === "system.constitution.agents") return { ok: true, agents: [
        { id: "axis:defects", title: "Defects Reviewer", category: "axis", description: "d", ready: true, readiness: "ready" },
        { id: "core:security", title: "Security Reviewer", category: "core", description: "s", ready: false, readiness: "needs a pack" },
      ] };
      if (url === "/api/v1/skilllib/manage") return { skills: [{ slug: "tdd", name: "TDD", description: "", enabled: 1 }, { slug: "docs", name: "Docs", description: "", enabled: 0 }] };
      if (url === "/api/v1/cockpit/pane/update") return { pane: { id: 7, settings_json: JSON.stringify(body.settings) } };
      return {};
    });
    const onSaved = vi.fn();
    render(<AvailableToAgent pane={{ id: 7, settings_json: "{}" } as any} onSaved={onSaved} />);
    await waitFor(() => expect(screen.getByTestId("spec-axis:defects")).toBeTruthy());
    expect(screen.getByText(/1\/1 specialists · 1\/2 skills/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("spec-axis:defects")); // all → explicit set without it
    fireEvent.click(screen.getByTestId("skill-docs"));
    fireEvent.click(screen.getByTestId("availability-save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const upd = apiPost.mock.calls.find((c) => c[0] === "/api/v1/cockpit/pane/update")![1];
    expect(upd.settings).toEqual({ specialists: [], skills: ["tdd", "docs"] });
    expect(apiPost.mock.calls.some((c) => c[0] === "/api/v1/skilllib/materialize" && c[1].slugs.join() === "tdd,docs")).toBe(true);
  });
});

describe("DelegationConfig — the policy, not a launcher", () => {
  it("reads the pane's policy with defaults, and saves on/off · max · engine · tier onto the settings", async () => {
    expect(readDelegation({})).toEqual(DELEGATION_DEFAULT);
    expect(readDelegation({ delegate: { enabled: false, max: 99, engine: "codex", tier: "high", approve: "ask" } })).toEqual({ enabled: false, max: 8, engine: "codex", tier: "high", approve: "ask" });
    apiPost.mockImplementation(async (url: string, body: any) => url === "/api/v1/cockpit/pane/update" ? { pane: { id: 7, settings_json: JSON.stringify(body.settings) } } : {});
    const onSaved = vi.fn();
    render(<DelegationConfig pane={{ id: 7, settings_json: JSON.stringify({ x: 1 }) } as any} engine="claude-code" onSaved={onSaved} />);
    expect(screen.queryByTestId("delegation-save")).toBeNull();
    fireEvent.click(screen.getByText("off"));
    fireEvent.click(screen.getByText("8"));
    fireEvent.click(screen.getByText(/Codex/));
    fireEvent.click(screen.getByText("high"));
    fireEvent.click(screen.getByTestId("delegation-save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const upd = apiPost.mock.calls.find((c) => c[0] === "/api/v1/cockpit/pane/update")![1];
    expect(upd.settings).toEqual({ x: 1, delegate: { enabled: false, max: 8, engine: "codex", tier: "high", approve: "auto" } });
  });
  it("the specialists wear their icons", async () => {
    apiPost.mockImplementation(async (url: string, body: any) => {
      if (url === "/api/v1/dispatch" && body?.action_name === "system.constitution.agents") return { ok: true, agents: [{ id: "axis:defects", title: "Defects Reviewer", category: "axis", description: "d", ready: true, readiness: "ready" }] };
      return { skills: [] };
    });
    render(<AvailableToAgent pane={{ id: 7, settings_json: "{}" } as any} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("node-axis:defects")).toBeTruthy());
  });
});

describe("the history line and the comparison lines — pure", () => {
  it("say what a run was and what raw vs antiloki cost", () => {
    const r: any = { id: 3, goal: "g", status: "done", created: Date.UTC(2026, 8, 19, 12, 0), ended: Date.UTC(2026, 8, 19, 12, 2), engine: "claude-code", write: false, route: { tier: "high", delegate: true }, tasks: [{ status: "done" }, { status: "failed" }], compare: null };
    const line = runHistoryLine(r);
    expect(line).toContain("done · tier high · 1/2 passed · 120s · claude-code · read-only");
    const c: any = { engine: "claude-code", tier: "mid", ms: 30_000, tools: 2, chars: 800, tokens_in: 1000, tokens_out: 200, run_ms: 240_000, run_calls: 6, run_tools: 20, run_tokens_in: 90_000, run_tokens_out: 3_000, run_chars: 12_000, run_passed: 2, run_tasks: 2 };
    const lines = compareLines(c);
    expect(lines.find((l) => l.label === "time")).toEqual({ label: "time", raw: "30s", run: "240s" });
    expect(lines.find((l) => l.label === "verified")!.run).toBe("2/2 tasks passed a strict verifier");
  });
});

describe("ShellPolicy — an OpenCode pane's shell commands", () => {
  it("defaults to ask, and 'allow in this box' writes settings.shell on the pane", async () => {
    apiPost.mockImplementation(async (url: string, body: any) => url === "/api/v1/cockpit/pane/update" ? { pane: { id: 14, settings_json: JSON.stringify(body.settings) } } : {});
    const onSaved = vi.fn();
    render(<ShellPolicy pane={{ id: 14, settings_json: JSON.stringify({ delegate: { enabled: true } }) } as any} onSaved={onSaved} />);
    fireEvent.click(screen.getByTestId("shell-allow"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const upd = apiPost.mock.calls.find((c) => c[0] === "/api/v1/cockpit/pane/update")![1];
    expect(upd).toEqual({ pane_id: 14, settings: { delegate: { enabled: true }, shell: "allow" } });
  });
});

describe("the context tab's stats (2026-09-21)", () => {
  it("window · session · cost · pack delivered · conversation · pack share, each from what is known; a placeholder when nothing is", async () => {
    const { contextStats } = await import("./agent-wizard");
    const u: any = { engine: "claude-code", context: { used_pct: 72.4, size: 1_000_000, input_tokens: 724_000 }, session: { tokens_total: 900_000, messages: 12 }, cost_usd: 3.456 };
    const turns = [{ who: "you", tokens: 100 }, { who: "agent", tokens: 900 }, { who: "antiloki", tokens: 50 }];
    const s = contextStats(u, 120_000, turns);
    expect(s.map((x) => x.label)).toEqual(["context window", "session", "cost", "pack delivered", "conversation", "pack share"]);
    expect(s[0].value).toBe("72%"); expect(s[0].tone).toBe("warn"); expect(s[1].sub).toBe("12 messages"); expect(s[2].value).toBe("$3.46"); expect(s[4].sub).toBe("1 asks · 1 answers"); expect(s[5].value).toBe("12%");
    expect(contextStats(null, 0, [])[0]).toMatchObject({ label: "context", value: "—" });
    expect(contextStats({ engine: "codex", context: { input_tokens: 5000 } } as any, 0, [])[0].label).toBe("context now");
  });
});

// operator 2026-09-24: "the merge and subagents on settings of my agent is still showing the wrong configuration
// not based on truth. And is also outdated, on agent creation it has skills specialists chosen, providers AI and
// etc. That is what it should show on the merge tab."
describe("the merge tab reads the pair the serve actually wrote", () => {
  it("parses the FLAT shape, which is the one on every real pane", async () => {
    const { readPair, pairLabel } = await import("./agent-wizard");
    // straight off pane 11 of the operator's own workspace
    const flat = readPair({ pair: { name: "winner", brain: "opencode", hands: "opencode",
      brain_model: "opencode/kimi-k2.7-code", hands_model: "opencode/deepseek-v4-flash" } });
    expect(flat).not.toBeNull();
    expect(flat!.brain).toEqual({ engine: "opencode", model: "opencode/kimi-k2.7-code" });
    expect(flat!.hands).toEqual({ engine: "opencode", model: "opencode/deepseek-v4-flash" });
    expect(pairLabel(flat)).toBe("Kimi × DeepSeek");

    // a flat pair whose NAME collides with a built-in must not show the built-in's models
    const collide = readPair({ pair: { name: "claude-deepseek", brain: "claude-code", hands: "opencode",
      brain_model: "claude-sonnet-5", hands_model: "opencode/qwen-3.6-plus" } });
    expect(collide!.hands.model).toBe("opencode/qwen-3.6-plus");
  });

  it("still parses the nested shape the wizard writes, and still knows what solo is", async () => {
    const { readPair } = await import("./agent-wizard");
    const nested = readPair({ pair: { name: "x", brain: { engine: "claude-code", model: "sonnet" }, hands: { engine: "opencode" } } });
    expect(nested!.brain.model).toBe("sonnet");
    expect(nested!.hands.model).toBeUndefined();
    expect(readPair({ pair: "solo" })).toBeNull();
    expect(readPair({})).toBeNull();
    expect(readPair({ pair: { name: "n", brain: "nonsense", hands: "opencode" } })).toBeNull();
  });
});
