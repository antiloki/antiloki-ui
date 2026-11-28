// The trace is the chat's honesty layer: it says what antiloki actually did — which searches ran,
// which skills fired, what the answer cost. The live poller's ACCUMULATE rule is the subtle part: a
// transient empty or failed poll must leave the visible steps alone, because a trail that flickers
// empty mid-answer reads as "it lost my request".
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const apiPost = vi.fn();
const apiGet = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiPost: (...a: any[]) => apiPost(...a), apiGet: (...a: any[]) => apiGet(...a) }));

import { TraceTrail, captureTraceBaseline, buildFrames, cliBinOf } from "./chat-trace";

const ev = (over: any = {}) => ({ id: 1, source: "chat", actor: "interviewer", skill: "rag", outcome: "ok", context_json: "{}", ...over });
const events = (list: any[]) => ({ events: list });

beforeEach(() => { apiPost.mockReset().mockResolvedValue(events([])); apiGet.mockReset().mockResolvedValue(null); });
afterEach(() => vi.useRealTimers());

describe("a finished turn", () => {
  it("stays collapsed and fetches nothing until it is opened", () => {
    render(<TraceTrail turnId={7} />);
    expect(screen.getByText(/▸ reasoning/)).toBeTruthy();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("fetches the whole turn by its goal id on expand", async () => {
    apiPost.mockResolvedValue(events([ev({ id: 2, skill: "present", context_json: JSON.stringify({ model: "vendor/big", tokens_in: 100, tokens_out: 50, cost_usd: 0.0123 }) })]));
    render(<TraceTrail turnId={7} />);
    fireEvent.click(screen.getByText(/▸ reasoning/));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/api/v1/runtime/events", { user_goal_id: 7, limit: 100 }, { timeoutMs: 15_000 }));
    await waitFor(() => expect(screen.getByText("answer ready")).toBeTruthy());
    expect(screen.getByText(/big · 150 tok · \$0.0123/)).toBeTruthy();
  });

  it("does not refetch on a second expand", async () => {
    apiPost.mockResolvedValue(events([ev()]));
    render(<TraceTrail turnId={7} />);
    fireEvent.click(screen.getByText(/▸ reasoning/));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText(/▾ reasoning/));
    fireEvent.click(screen.getByText(/▸ reasoning/));
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it("says plainly when nothing was recorded", async () => {
    render(<TraceTrail turnId={7} />);
    fireEvent.click(screen.getByText(/▸ reasoning/));
    await waitFor(() => expect(screen.getByText("no trace recorded.")).toBeTruthy());
  });

  it("survives a failed fetch without breaking the turn", async () => {
    apiPost.mockRejectedValue(new Error("down"));
    render(<TraceTrail turnId={7} />);
    fireEvent.click(screen.getByText(/▸ reasoning/));
    await waitFor(() => expect(screen.getByText("no trace recorded.")).toBeTruthy());
  });

  it("unwraps the dispatch envelope", async () => {
    apiPost.mockResolvedValue({ result: events([ev({ skill: "present" })]) });
    render(<TraceTrail turnId={7} />);
    fireEvent.click(screen.getByText(/▸ reasoning/));
    await waitFor(() => expect(screen.getByText("answer ready")).toBeTruthy());
  });
});

describe("naming each step in the operator's language", () => {
  const step = async (e: any) => {
    apiPost.mockResolvedValue(events([e]));
    render(<TraceTrail turnId={1} />);
    fireEvent.click(screen.getAllByText(/▸ reasoning/)[0]);
    await waitFor(() => expect(apiPost).toHaveBeenCalled());
  };

  it("distinguishes a cached triage from a paid one", async () => {
    const { unmount } = render(<div />); unmount();
    await step(ev({ skill: "triage", context_json: JSON.stringify({ cached: true }) }));
    expect(screen.getByText(/understood your request \(cached — instant\)/)).toBeTruthy();
  });

  it("counts what a codebase search found, and quotes the query", async () => {
    await step(ev({ skill: "rag", context_json: JSON.stringify({ files: 3, query: "auth guard" }) }));
    expect(screen.getByText(/searched the codebase → 3 files/)).toBeTruthy();
    expect(screen.getByText('"auth guard"')).toBeTruthy();
  });

  it("uses the singular for one hit", async () => {
    await step(ev({ skill: "rag-recall", context_json: JSON.stringify({ hits: 1 }) }));
    expect(screen.getByText(/semantic search → 1 hit$/)).toBeTruthy();
  });

  it("names the docs it read and the scope", async () => {
    await step(ev({ skill: "docs-gather", context_json: JSON.stringify({ pages: 2, scope: "src/auth", files: ["a/b.md", "c/d.md"] }) }));
    expect(screen.getByText(/read 2 docs · src\/auth/)).toBeTruthy();
    expect(screen.getByText("b.md, d.md")).toBeTruthy();
  });

  it("marks a failed step", async () => {
    await step(ev({ skill: "whatever", outcome: "error", action: "man.card.add" }));
    const row = screen.getByText("man.card.add") as HTMLElement;
    expect(row.style.color).toBeTruthy();
    expect(screen.getByText("failed")).toBeTruthy();
  });

  it("falls back to the action or skill name for an unrecognised step", async () => {
    await step(ev({ skill: null, action: null }));
    expect(screen.getByText("step")).toBeTruthy();
  });
});

describe("a live turn", () => {
  it("shows that it is thinking straight away, with no toggle", () => {
    render(<TraceTrail live />);
    expect(screen.getByText(/⚙ thinking…/)).toBeTruthy();
    expect(screen.queryByText(/reasoning/)).toBeNull();
  });

  it("takes a baseline first, then polls only for what came after it", async () => {
    vi.useFakeTimers();
    apiPost.mockResolvedValue(events([ev({ id: 40 })]));
    render(<TraceTrail live />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(apiPost).toHaveBeenCalledWith("/api/v1/runtime/events", { limit: 1 }, expect.anything());

    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(apiPost).toHaveBeenCalledWith("/api/v1/runtime/events", { after_id: 40, limit: 40 }, expect.anything());
  });

  it("ACCUMULATES steps and never shrinks on an empty or failed poll", async () => {
    vi.useFakeTimers();
    apiPost.mockResolvedValueOnce(events([ev({ id: 10 })]))                                   // baseline
      .mockResolvedValueOnce(events([ev({ id: 11, skill: "rag", context_json: JSON.stringify({ files: 1 }) })]))
      .mockResolvedValueOnce(events([]))                                                      // empty poll
      .mockRejectedValueOnce(new Error("blip"))                                               // failed poll
      .mockResolvedValue(events([ev({ id: 12, skill: "present", context_json: "{}" })]));
    render(<TraceTrail live />);
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(screen.getByText(/searched the codebase → 1 file/)).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(1800); });
    expect(screen.getByText(/searched the codebase → 1 file/)).toBeTruthy();   // survived both bad polls

    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(screen.getByText("answer ready")).toBeTruthy();
    expect(screen.getByText(/searched the codebase → 1 file/)).toBeTruthy();
  });

  it("ignores events that are not from this chat", async () => {
    vi.useFakeTimers();
    apiPost.mockResolvedValueOnce(events([ev({ id: 1 })]))
      .mockResolvedValue(events([ev({ id: 2, source: "driver", actor: "dev", skill: "present" })]));
    render(<TraceTrail live />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1800); });
    expect(screen.queryByText("answer ready")).toBeNull();
  });

  it("stops polling once the turn unmounts", async () => {
    vi.useFakeTimers();
    apiPost.mockResolvedValue(events([ev({ id: 1 })]));
    const { unmount } = render(<TraceTrail live />);
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    const before = apiPost.mock.calls.length;
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(apiPost.mock.calls.length).toBe(before);
  });
});

describe("captureTraceBaseline", () => {
  it("returns the newest event id", async () => {
    apiPost.mockResolvedValue(events([ev({ id: 99 })]));
    expect(await captureTraceBaseline()).toBe(99);
  });

  it("returns 0 rather than throwing when there is nothing, or the read fails", async () => {
    apiPost.mockResolvedValue(events([]));
    expect(await captureTraceBaseline()).toBe(0);
    apiPost.mockRejectedValue(new Error("down"));
    expect(await captureTraceBaseline()).toBe(0);
  });
});

describe("the audit — frames like a stack trace", () => {
  const turn = { id: 12, ts: "2026-09-17 02:10:18.000", session_id: 3, model_id: "cli:claude-code", ai_call_id: 1, ai_duration_ms: 9400, ai_tokens_in: 37359, ai_tokens_out: 388, ai_cost_usd: 0, classified_kind: "answer", classification_confidence: 0.9, user_text: "what does packages/scheduler do?" };
  const evs = [
    { id: 1, ts: "2026-09-17 02:10:18.118", actor: "interviewer", skill: "triage-start", outcome: "success", context_json: JSON.stringify({ phase: "thinking" }) },
    { id: 2, ts: "2026-09-17 02:10:27.478", actor: "interviewer", skill: "triage", outcome: "success", context_json: JSON.stringify({ kind: "answer", model: "claude-code", tier: "mid", tokens_in: 37359, tokens_out: 388, cost_usd: 0 }) },
  ];
  const call = { call: { id: 1, ts: "2026-09-17 02:10:27.477", prompt_name: "interviewer.chat.v27", prompt_version: 1, tier: "mid", temperature: "warm", provider: "cli", model_id: "claude-code", tokens_in: 37359, tokens_out: 388, cost_usd: 0, duration_ms: 9272.22, outcome: "success" } };
  const traces = [{ id: 4, engine: "claude-code", cwd: "/w/react", started: Date.parse("2026-09-17T02:10:18.200Z"), ended: Date.parse("2026-09-17T02:10:27.470Z"), ms: 9270, tools: [{ name: "Read", target: "packages/scheduler/README.md" }, { name: "Grep", target: "unstable_" }], tokensIn: 37359, tokensOut: 388, cost: 0.11, ok: true }];

  it("numbers every frame with its offset and duration, nests the ai-call and the CLI's tools under the step that spent it", () => {
    const f = buildFrames(turn, evs, call, traces);
    expect(f.map((x) => `${x.n}:${x.kind}:${x.depth}:${x.text}`)).toEqual([
      "1:step:0:turn #12", "2:step:1:understanding your request…", "3:step:1:understood your request",
      "4:call:2:ai-call #1", "5:cli:3:claude -p", "6:tool:4:Read", "7:tool:4:Grep", "8:end:0:done",
    ]);
    expect(f[2].offsetMs).toBe(9478);
    expect(f[2].durMs).toBe(9360);
    expect(f[2].meta).toContain("classified answer");
    expect(f[3].note).toBe("interviewer.chat.v27 v1");
    expect(f[3].meta).toBe("cli/claude-code · mid/warm · 37,359→388 tok · $0.0000 · success");
    expect(f[4].meta).toBe("2 tools · 37,359→388 tok · $0.1100 · ok");
    expect(f[5].note).toBe("packages/scheduler/README.md");
    expect(f[7].note).toBe("classified answer · 90% sure");
    expect(f[7].meta).toBe("37,359→388 tok · $0.0000 · 9.4 s");
  });
  it("says when no CLI trace matched, and marks a failed step red", () => {
    const f = buildFrames(turn, [{ ...evs[0], outcome: "error", skill: null, action: "man.card.add" }], call, []);
    expect(f.find((x) => x.kind === "cli")?.note).toMatch(/no CLI trace kept/);
    expect(f[1].error).toBe(true);
  });
  it("fetches the ai-call row and the CLI traces on expand", async () => {
    apiPost.mockResolvedValue(events(evs));
    apiGet.mockImplementation(async (url: string) => (url.startsWith("/api/v1/ai-calls/") ? call : { traces }));
    render(<TraceTrail turnId={12} turn={turn} />);
    fireEvent.click(screen.getByText(/▸ reasoning/));
    await waitFor(() => expect(screen.getByText("ai-call #1")).toBeTruthy());
    expect(apiGet).toHaveBeenCalledWith("/api/v1/ai-calls/1", expect.anything());
    expect(apiGet.mock.calls.some((c: any[]) => String(c[0]).startsWith("/api/v1/cli-llm/traces?since="))).toBe(true);
    expect(screen.getByText("claude -p")).toBeTruthy();
    expect(screen.getByText("packages/scheduler/README.md")).toBeTruthy();
  });
});

describe("the command a trace ran", () => {
  it("names the engine's own CLI - not 'opencode run' for every engine but Claude and Codex (audit 2026-10-01)", () => {
    expect(cliBinOf("claude-code")).toBe("claude -p");
    expect(cliBinOf("codex")).toBe("codex exec");
    expect(cliBinOf("opencode")).toBe("opencode run");
    expect(cliBinOf("cursor")).toBe("cursor-agent -p");
    expect(cliBinOf("grok")).toBe("grok -p");
    expect(cliBinOf("gemini")).toBe("agy");
    expect(cliBinOf("futurecli")).toBe("futurecli");
    expect(cliBinOf(undefined)).toBe("a CLI");
  });
});
