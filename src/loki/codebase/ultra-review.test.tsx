// @vitest-environment jsdom
// ULTRA REVIEW (2026-09-19): the prompt is the brief, the parse is strict, the findings are kept per
// workspace, each one drags into the chat or goes to an agent.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

let reply: any;
const asks: any[] = [];
vi.mock("@/loki/api/engine", () => ({ askEngine: vi.fn(async (p: string, o: any) => { asks.push({ p, o }); return reply; }), pinnedEngine: () => null, ENGINE_KEYS: ["claude-code", "codex", "gemini", "grok", "cursor", "opencode"] }));
// THE MACHINE OF 2026-10-01: Claude switched off; Codex + Cursor + Gemini signed in
vi.mock("@/loki/api/seats", async () => { const real: any = await vi.importActual("@/loki/api/seats"); return { ...real, useSeats: () => real.seatsOf({ engines: [
  { key: "gemini", name: "Gemini", usable: true, on: true }, { key: "claude-code", name: "Claude", usable: false, on: false }, { key: "codex", name: "Codex", usable: true, on: true },
  { key: "grok", name: "Grok", usable: false, on: true }, { key: "cursor", name: "Cursor", usable: true, on: true }, { key: "opencode", name: "OpenCode", usable: false, on: true }], heimdall: { effective: "gemini" } }) }; });
vi.mock("@/loki/widgets/agents-timeline", () => ({ noteTimeline: vi.fn() }));
import { UltraReview, ultraAsk, parseFindings, readRun, findingText, engineMap } from "./ultra-review";

beforeEach(() => { localStorage.clear(); asks.length = 0; reply = { ok: true, json: { summary: "Mostly sound.", findings: [
  { severity: "low", file: "./src/a.ts", line: 3, title: "unused flag", detail: "d", fix: "f", confidence: 0.4 },
  { severity: "critical", file: "src/db.ts", line: 88, title: "rows lost on retry", detail: "the retry drops the batch", fix: "keep the batch", confidence: 0.9 },
  { severity: "bogus", file: "src/x.ts", title: "odd severity", confidence: 3 },
  { title: "no file" },
] }, text: "", engine: "claude-code", ms: 1200 }; });

describe("the prompt and the parse — pure", () => {
  it("the call names the catalog template with the brief and the focus; findings are shaped, sorted, capped", () => {
    // the text lives in the serve's prompt catalog (xray.ultra_review); the FE sends the brief and the focus
    expect(ultraAsk("verdict: 10 files", " the auth flow ")).toEqual({ template: "xray.ultra_review", vars: { brief: "verdict: 10 files", focus: "the auth flow" } });
    expect(ultraAsk("b").vars.focus).toBe("");
    const { summary, findings } = parseFindings(reply.json);
    expect(summary).toBe("Mostly sound.");
    expect(findings.map((f) => [f.severity, f.file, f.line, f.confidence])).toEqual([["critical", "src/db.ts", 88, 0.9], ["medium", "src/x.ts", null, 1], ["low", "src/a.ts", 3, 0.4]]);
    expect(parseFindings(null).findings).toEqual([]);
    expect(parseFindings(Array.from({ length: 20 }, (_, i) => ({ file: `f${i}`, title: "t" })).map((x) => x)).findings.length).toBe(12);
    expect(findingText(findings[0])).toBe("[critical] src/db.ts:88 — rows lost on retry\nthe retry drops the batch\nFix: keep the batch");
    // the survey's worst units lead the engine's map (2026-09-19: the ultra review as it was, then the engine)
    expect(engineMap("brief", "src/a.ts (health 12)")).toBe("brief\n\n=== ULTRA SURVEY · WORST UNITS (start here) ===\nsrc/a.ts (health 12)");
    expect(engineMap("brief", "  ")).toBe("brief");
  });
});

describe("UltraReview", () => {
  it("runs with the chosen engine and focus, shows the findings, keeps them per workspace, opens files, hands a finding to an agent", async () => {
    const onOpen = vi.fn(); const agent = vi.fn();
    window.addEventListener("antiloki:agent-card", agent as any);
    render(<UltraReview workspace="w" brief="verdict: 10 files" worst="src/db.ts (health 12)" onOpenFile={onOpen} />);
    expect(screen.getByText("no run yet")).toBeTruthy();
    fireEvent.change(screen.getByTestId("ultra-engine"), { target: { value: "codex" } });
    fireEvent.change(screen.getByTestId("ultra-focus"), { target: { value: "retries" } });
    fireEvent.click(screen.getByTestId("ultra-run"));
    await waitFor(() => expect(screen.getByTestId("ultra-result")).toBeTruthy());
    expect(asks[0].o).toMatchObject({ json: true, engine: "codex" }); expect(asks[0].p.template).toBe("xray.ultra_review"); expect(asks[0].p.vars.focus).toBe("retries"); expect(asks[0].p.vars.brief).toContain("WORST UNITS (start here) ===\nsrc/db.ts (health 12)");
    expect(screen.getByTestId("ultra-summary").textContent).toBe("Mostly sound.");
    expect(screen.getByTestId("ultra-finding-0").textContent).toContain("rows lost on retry");
    expect(readRun("w")?.findings.length).toBe(3);
    fireEvent.click(screen.getByText("src/db.ts:88 ↗"));
    expect(onOpen).toHaveBeenCalledWith("src/db.ts", 88);
    fireEvent.click(screen.getByTestId("ultra-agent-0"));
    expect(agent.mock.calls[0][0].detail).toMatchObject({ engine: "codex", scope: ["src/db.ts"], thread: "new" });
    expect(agent.mock.calls[0][0].detail.ask).toContain("[critical] src/db.ts:88");
    window.removeEventListener("antiloki:agent-card", agent as any);
  });
  it("pins no Claude: the default is auto (the serve picks), and a switched-off seat is not in the list", async () => {
    render(<UltraReview workspace="w2" brief="b" onOpenFile={vi.fn()} />);
    const sel = screen.getByTestId("ultra-engine") as HTMLSelectElement;
    expect(sel.value).toBe("auto");
    const options = Array.from(sel.options).map((o) => o.value);
    expect(options).toEqual(["auto", "gemini", "codex", "cursor"]);
    expect(options).not.toContain("claude-code");
    expect(sel.options[0].textContent).toBe("Auto · Gemini");
    fireEvent.click(screen.getByTestId("ultra-run"));
    await waitFor(() => expect(screen.getByTestId("ultra-result")).toBeTruthy());
    expect(asks[0].o.engine).toBe("auto");
  });
  it("\"→ agent\" on auto hands the card the serve's seat (Gemini) and the card's listener keeps it - Claude, switched off, is never the fallback", async () => {
    const { agentCardEngine } = await import("@/loki/widgets/agent-card");
    const agent = vi.fn();
    window.addEventListener("antiloki:agent-card", agent as any);
    render(<UltraReview workspace="w3" brief="b" onOpenFile={vi.fn()} />);
    fireEvent.click(screen.getByTestId("ultra-run"));
    await waitFor(() => expect(screen.getByTestId("ultra-result")).toBeTruthy());
    fireEvent.click(screen.getByTestId("ultra-agent-0"));
    expect(agent.mock.calls[0][0].detail.engine).toBe("gemini");
    expect(agentCardEngine(agent.mock.calls[0][0].detail.engine)).toBe("gemini");
    // and a seat picked by hand that the old three-engine list did not know
    fireEvent.change(screen.getByTestId("ultra-engine"), { target: { value: "cursor" } });
    fireEvent.click(screen.getByTestId("ultra-agent-0"));
    expect(agentCardEngine(agent.mock.calls[1][0].detail.engine)).toBe("cursor");
    window.removeEventListener("antiloki:agent-card", agent as any);
  }, 30_000);   // the first import of the agent card pulls the whole cockpit in
  it("a failed run shows the engine's error and keeps the previous run", async () => {
    localStorage.setItem("antiloki:ultra:w", JSON.stringify({ at: "2026-09-19T00:00:00Z", engine: "claude-code", ms: 1, findings: [], summary: "old", brief_lines: 1 }));
    reply = { ok: false, error: "opencode returned no text", engine: "opencode", ms: 5 };
    render(<UltraReview workspace="w" brief="b" onOpenFile={vi.fn()} />);
    expect(screen.getByTestId("ultra-summary").textContent).toBe("old");
    fireEvent.click(screen.getByTestId("ultra-run"));
    await waitFor(() => expect(screen.getByTestId("ultra-error").textContent).toContain("opencode returned no text"));
    expect(screen.getByTestId("ultra-summary").textContent).toBe("old");
  });
});
