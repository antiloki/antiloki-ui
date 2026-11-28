// @vitest-environment jsdom
// The Ultra review's run-on choice + the estimate before the run (operator 2026-09-19): a tier
// per role (agents mid · editor high), an optional engine pin, and tokens/calls/cost computed
// from the sampled prompts and the selected route's pricing — the subscription shows $0 metered
// with the API-equivalent beside it.
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// the providers read, answered at once: with nothing read no seat is offered (a switched-off Claude must not appear while the read is in flight), so a picker test names the machine it runs on
vi.mock("@/loki/api/seats", async () => { const real: any = await vi.importActual("@/loki/api/seats"); const s = real.seatsOf({ engines: ["claude-code", "codex", "gemini", "grok", "cursor", "opencode"].map((key) => ({ key, name: key, usable: true, on: true })), heimdall: { effective: "codex" } }); return { ...real, useSeats: () => s }; });
vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn(async (_u: string, body: any) => {
  if (body?.action_name === "system.constitution.paper" && body.input?.op === "list") return { result: { ok: true, papers: [{ id: 5, title: "The Compiler Owns Every Cycle", label: "Architecture Audit · compiler", discovery: "all cycles in compiler/", created_at: "2026-09-19 14:02:11", agents: 3, files: 6, cost_usd: 0 }] } };
  if (body?.action_name === "system.constitution.paper" && body.input?.op === "get") return { result: { ok: true, paper: { id: 5, title: "The Compiler Owns Every Cycle", label: "Architecture Audit · compiler", session: { results: [{ agent: "a" }] } } } };
  return { ok: false };
}), unwrapResult: (r: any) => r?.result ?? r, BE_URL: "" }));

import { missionEstimate, readRunOn, RUN_ON_DEFAULT, RunOnField, EstimateCard, SpecialistsRail, traceLine, RunLogPanel, PaperShelf } from "./constitution-agents";

beforeEach(() => { localStorage.clear(); });

const sub = (model: string, tin: number, tout: number) => ({ ok: true, estimate: true, est_tokens_in: 4000, max_output_tokens: 2200, model, billing: "subscription", usd_in_per_mtok: tin, usd_out_per_mtok: tout });

describe("missionEstimate — pure", () => {
  it("scales the sampled prompt by the cases and the crew, prices the agents' route and the editor's route separately", () => {
    const est = missionEstimate([sub("claude-code · sonnet", 3, 15), { ...sub("claude-code · sonnet", 3, 15), est_tokens_in: 6000 }], sub("claude-code · opus", 15, 75), 2, 3, true);
    expect(est.agents.calls).toBe(6);
    expect(est.agents.tokens_in).toBe(5000 * 2 * 3);
    expect(est.agents.tokens_out).toBe(2200 * 6);
    expect(est.agents.billing).toBe("subscription"); expect(est.agents.usd).toBe(0);
    expect(est.agents.equiv).toBeCloseTo((30000 / 1e6) * 3 + (13200 / 1e6) * 15, 6);
    expect(est.editor?.tokens_in).toBe(900 * 6 + 3000);
    expect(est.editor?.model).toBe("claude-code · opus");
    expect(est.editor?.equiv).toBeCloseTo((8400 / 1e6) * 15 + (4000 / 1e6) * 75, 6);
    expect(est.usd).toBe(0);
    expect(est.equiv).toBeCloseTo(est.agents.equiv! + est.editor!.equiv!, 6);
    expect(est.tokens_in).toBe(30000 + 8400);
  });
  it("a metered route prices itself; a route with no provider has no number; no editor when it is off", () => {
    const metered = { ok: true, estimate: true, est_tokens_in: 1000, max_output_tokens: 2200, model: "some-model", billing: "metered", usd_in_per_mtok: 1, usd_out_per_mtok: 5 };
    const est = missionEstimate([metered], null, 1, 1, false);
    expect(est.editor).toBeNull();
    expect(est.agents.usd).toBeCloseTo((1000 / 1e6) * 1 + (2200 / 1e6) * 5, 9);
    expect(est.equiv).toBeNull();
    const none = missionEstimate([{ ok: true, estimate: true, est_tokens_in: 1000, billing: "none" }], null, 1, 1, false);
    expect(none.agents.usd).toBeNull(); expect(none.usd).toBeNull();
  });
});

describe("readRunOn", () => {
  it("defaults to agents mid · editor high · routed, and reads a saved choice back, dropping junk", () => {
    expect(readRunOn()).toEqual(RUN_ON_DEFAULT);
    localStorage.setItem("antiloki:ultra:run-on", JSON.stringify({ agentsTier: "low", agentsEngine: "codex", editorTier: "nope", editorEngine: "gpt" }));
    expect(readRunOn()).toEqual({ agentsTier: "low", agentsEngine: "codex", editorTier: "high", editorEngine: "routed" });
  });
});

describe("RunOnField + EstimateCard", () => {
  it("offers a tier and an engine per role and reports the change; the reset appears once off the defaults", () => {
    const onChange = vi.fn();
    const { rerender } = render(<RunOnField value={RUN_ON_DEFAULT} onChange={onChange} withEditor />);
    expect((screen.getByTestId("run-on-agents-tier") as HTMLSelectElement).value).toBe("mid");
    expect((screen.getByTestId("run-on-editor-tier") as HTMLSelectElement).value).toBe("high");
    expect(screen.queryByText(/↺ defaults/)).toBeNull();
    fireEvent.change(screen.getByTestId("run-on-agents-engine"), { target: { value: "codex" } });
    expect(onChange).toHaveBeenCalledWith({ ...RUN_ON_DEFAULT, agentsEngine: "codex" });
    rerender(<RunOnField value={{ ...RUN_ON_DEFAULT, agentsEngine: "codex" }} onChange={onChange} withEditor />);
    fireEvent.click(screen.getByText(/↺ defaults/));
    expect(onChange).toHaveBeenLastCalledWith(RUN_ON_DEFAULT);
  });
  it("the estimate card shows both routes, $0 metered on a subscription and the API-equivalent", () => {
    const est = missionEstimate([sub("claude-code · sonnet", 3, 15)], sub("claude-code · opus", 15, 75), 1, 2, true);
    render(<EstimateCard est={est} calls={2} />);
    const t = screen.getByTestId("mission-estimate").textContent ?? "";
    expect(t).toContain("claude-code · sonnet"); expect(t).toContain("claude-code · opus");
    expect(t).toContain("$0 metered"); expect(t).toContain("API-equivalent");
    render(<EstimateCard est={null} calls={3} />);
    expect(screen.getByText(/measuring the real prompts… \(3 calls\)/)).toBeTruthy();
  });
});

describe("SpecialistsRail", () => {
  const agents: any[] = [
    { id: "axis:compliance", title: "Compliance Reviewer", category: "axis", description: "Reviews the compliance axis.", axes: ["compliance"], laws: ["a", "b"], languages: [], consumes: ["x"], produces: ["y"], required_packs: [], ready: true, readiness: "ready", est_cost: "low", est_runtime_s: 8, capabilities: [], technologies: [], enabled: true },
    { id: "core:security", title: "Security Reviewer", category: "core", description: "Enforces security laws.", axes: ["compliance"], laws: [], languages: ["ts"], consumes: [], produces: [], required_packs: [], ready: false, readiness: "needs the pack", est_cost: "low", est_runtime_s: 8, capabilities: [], technologies: [], enabled: true },
  ];
  it("groups the profiles by category, expands one on click, and binds into the crew only when a mission is armed", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<SpecialistsRail agents={agents} crew={new Set()} onToggle={onToggle} armed={false} />);
    const rail = screen.getByTestId("specialists-rail");
    expect(rail.textContent).toContain("axis"); expect(rail.textContent).toContain("core");
    expect(screen.getAllByTestId("specialist-card").length).toBe(2);
    expect(screen.queryByText("+ crew")).toBeNull();
    fireEvent.click(screen.getByText("Compliance Reviewer"));
    expect(rail.textContent).toContain("2 laws"); expect(rail.textContent).toContain("reads: x");
    rerender(<SpecialistsRail agents={agents} crew={new Set()} onToggle={onToggle} armed />);
    const binds = screen.getAllByText("+ crew");
    expect(binds.length).toBe(2);
    fireEvent.click(binds[0]);
    expect(onToggle).toHaveBeenCalledWith("axis:compliance");
    expect((binds[1] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("find a specialist…"), { target: { value: "security" } });
    expect(screen.getAllByTestId("specialist-card").length).toBe(1);
  });
});

describe("the run log", () => {
  it("turns an engine trace into one honest line: the command, the verdict, the time, the tokens, the tools", () => {
    expect(traceLine({ engine: "claude-code", ok: true, ms: 14873, tokensIn: 35500, tokensOut: 581, tools: [{ name: "Read", target: "src/a.ts" }, { name: "Read", target: "src/b.ts" }, { name: "Grep", target: "" }] }))
      .toBe("claude -p answered in 14.9s · 35500→581 tok · 3 tool calls: Read a.ts, b.ts · Grep");
    expect(traceLine({ engine: "codex", ok: false, ms: 3000, error: "exited 1: no auth" })).toBe("codex exec failed — exited 1: no auth in 3s");
  });
  it("renders the lines with their relative time and who, live while busy, and scrolls to the last", () => {
    const t0 = 1_000_000;
    render(<RunLogPanel lines={[{ t: t0, kind: "run", text: "mission x" }, { t: t0 + 17_100, kind: "done", text: "✓ observation — clean", who: "Defects Reviewer" }, { t: t0 + 104_000, kind: "done", text: "✓ the paper", who: "✒ the editor" }]} busy startedAt={t0} />);
    const el = screen.getByTestId("run-log");
    expect(el.textContent).toContain("● live");
    expect(el.textContent).toContain("17.1s"); expect(el.textContent).toContain("1m44");
    expect(el.textContent).toContain("Defects Reviewer"); expect(el.textContent).toContain("✒ the editor");
    render(<RunLogPanel lines={[]} busy={false} startedAt={t0} />);
    expect(screen.getByText("nothing yet")).toBeTruthy();
  });
});

describe("PaperShelf", () => {
  it("lists every saved study and reopens one as the review session", async () => {
    const onOpen = vi.fn();
    render(<PaperShelf onOpen={onOpen} />);
    await screen.findByTestId("paper-5");
    const shelf = screen.getByTestId("paper-shelf");
    expect(shelf.textContent).toContain("The Compiler Owns Every Cycle"); expect(shelf.textContent).toContain("3 agents · 6 files");
    fireEvent.click(screen.getByTestId("paper-5"));
    await vi.waitFor(() => expect(onOpen).toHaveBeenCalled());
    expect(onOpen.mock.calls[0][0]).toMatchObject({ paper_id: 5, label: "Architecture Audit · compiler" });
  });
});
