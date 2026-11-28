// These are the verbs that put text into a real agent's terminal. Two behaviours here were LEARNED
// from the CLI TUIs and are invisible from the code alone, so they are the ones most likely to be
// "simplified" away by a future edit:
//   1. sayToAgent writes the body and the \r as TWO separate writes with a pause. One combined
//      write is paste-detected and the \r becomes a soft newline — the text lands in the composer
//      and nothing is ever submitted.
//   2. typeToAgent must strip newlines entirely, because it must NOT submit.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiPost = vi.fn();
const apiGet = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiPost: (...a: any[]) => apiPost(...a), apiGet: (...a: any[]) => apiGet(...a), BE_URL: "http://be" }));

const { listAgents, sayToAgent, typeToAgent, feedAgent, startBlockDrag, readBlockDrag, hasBlockDrag, BLOCK_MIME } =
  await import("./agent-interact");

// Block bodies: a concise arrow would return the Mock and vitest would run it as a teardown hook.
beforeEach(() => { apiPost.mockReset(); vi.useFakeTimers(); });

/** sayToAgent sleeps 350ms between its two writes; drive that deterministically. */
async function runWithTimers<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return p;
}

const inputs = () => apiPost.mock.calls.filter((c) => c[0] === "/api/v1/cockpit/pty/input").map((c) => c[1]);

describe("sayToAgent — the two-write submit protocol", () => {
  it("sends the body and the carriage return as SEPARATE writes, body first", async () => {
    apiPost.mockResolvedValue({});
    expect(await runWithTimers(sayToAgent(7, "run the tests"))).toBe(true);
    expect(inputs()).toEqual([
      { pane_id: 7, data: "run the tests" },
      { pane_id: 7, data: "\r" },
    ]);
  });

  it("strips the caller's trailing newline so the \\r is the ONLY submit", async () => {
    apiPost.mockResolvedValue({});
    await runWithTimers(sayToAgent(7, "hello\n\r\n"));
    expect(inputs()[0].data).toBe("hello");
    expect(inputs()).toHaveLength(2);
  });

  it("still sends the bare Enter when the body is empty (an intentional submit)", async () => {
    apiPost.mockResolvedValue({});
    await runWithTimers(sayToAgent(7, "\n"));
    expect(inputs()).toEqual([{ pane_id: 7, data: "\r" }]);
  });

  it("keeps INTERNAL newlines — only the trailing ones are stripped", async () => {
    apiPost.mockResolvedValue({});
    await runWithTimers(sayToAgent(7, "line one\nline two\n"));
    expect(inputs()[0].data).toBe("line one\nline two");
  });

  it("reports false instead of throwing when the PTY write fails", async () => {
    apiPost.mockRejectedValue(new Error("pane gone"));
    expect(await runWithTimers(sayToAgent(7, "hi"))).toBe(false);
  });
});

describe("typeToAgent — fills the field WITHOUT submitting", () => {
  it("sends exactly one write and no carriage return", async () => {
    apiPost.mockResolvedValue({});
    expect(await typeToAgent(7, "a draft")).toBe(true);
    expect(inputs()).toEqual([{ pane_id: 7, data: "a draft" }]);
  });

  it("flattens every newline to a space so nothing can submit accidentally", async () => {
    apiPost.mockResolvedValue({});
    await typeToAgent(7, "first\nsecond\r\nthird");
    expect(inputs()[0].data).toBe("first second  third");
    expect(inputs()[0].data).not.toMatch(/[\r\n]/);
  });

  it("reports false on failure", async () => {
    apiPost.mockRejectedValue(new Error("down"));
    expect(await typeToAgent(7, "x")).toBe(false);
  });
});

describe("feedAgent", () => {
  it("writes the file first, then tells the agent to read it at the returned path", async () => {
    apiPost.mockImplementation((url: string) =>
      url === "/api/v1/pane/feed" ? Promise.resolve({ path: "wt/notes.md" }) : Promise.resolve({}));
    const path = await runWithTimers(feedAgent(7, "notes.md", "body"));
    expect(path).toBe("wt/notes.md");
    expect(apiPost.mock.calls[0][0]).toBe("/api/v1/pane/feed");
    expect(inputs()[0].data).toContain("wt/notes.md");
  });

  it("uses the caller's line verbatim when one is supplied", async () => {
    apiPost.mockImplementation((url: string) =>
      url === "/api/v1/pane/feed" ? Promise.resolve({ path: "p" }) : Promise.resolve({}));
    await runWithTimers(feedAgent(7, "n", "c", "look at this"));
    expect(inputs()[0].data).toBe("look at this");
  });

  it("null means SILENT — the file lands but the terminal is never touched", async () => {
    apiPost.mockImplementation((url: string) =>
      url === "/api/v1/pane/feed" ? Promise.resolve({ path: "p" }) : Promise.resolve({}));
    expect(await runWithTimers(feedAgent(7, "n", "c", null))).toBe("p");
    expect(inputs()).toHaveLength(0);
  });

  it("says nothing when the file write returned no path", async () => {
    apiPost.mockResolvedValue({});
    expect(await runWithTimers(feedAgent(7, "n", "c"))).toBeNull();
    expect(inputs()).toHaveLength(0);
  });
});

describe("listAgents", () => {
  const session = (over: any = {}) => ({ id: 3, name: "antichat#9", status: "open", ...over });
  const pane = (over: any = {}) => ({ id: 1, pane_kind: "claude-code", worktree_path: "/wt", subagent_name: "alpha", branch: "b", ...over });

  const route = (sessions: any[], panes: any[]) =>
    apiPost.mockImplementation((_u: string, body: any) =>
      Promise.resolve(body?.id ? { panes } : { sessions }));

  it("finds the chat's own session and returns its CLI panes", async () => {
    route([session()], [pane()]);
    expect(await listAgents(9)).toEqual([{ id: 1, kind: "claude-code", name: "alpha", branch: "b" }]);
  });

  it("keeps only CLI panes that have a worktree", async () => {
    route([session()], [
      pane({ id: 1, pane_kind: "claude-code" }),
      pane({ id: 2, pane_kind: "browser" }),            // not a CLI
      pane({ id: 3, pane_kind: "codex", worktree_path: null }), // no worktree
    ]);
    expect((await listAgents(9)).map((a) => a.id)).toEqual([1]);
  });

  it("ignores closed sessions and other chats' sessions", async () => {
    route([session({ id: 1, status: "closed" }), session({ id: 2, name: "antichat#4" })], [pane()]);
    expect(await listAgents(9)).toEqual([]);
  });

  it("uses the 'solo' session name when there is no chat id", async () => {
    route([session({ name: "antichat#solo" })], [pane()]);
    expect(await listAgents(null)).toHaveLength(1);
  });

  it("picks the LOWEST session id when a chat somehow has two", async () => {
    apiPost.mockImplementation((_u: string, body: any) =>
      Promise.resolve(body?.id ? { panes: [pane({ id: body.id * 10 })] } : { sessions: [session({ id: 8 }), session({ id: 3 })] }));
    expect((await listAgents(9))[0].id).toBe(30);
  });

  it("returns an empty list — never throws — when the BE is unreachable", async () => {
    apiPost.mockRejectedValue(new Error("down"));
    expect(await listAgents(9)).toEqual([]);
  });

  it("survives a malformed response", async () => {
    apiPost.mockResolvedValue({ sessions: "not an array" });
    expect(await listAgents(9)).toEqual([]);
  });
});

describe("block drag — deliberate, provenance-labelled injection", () => {
  const dt = () => {
    const store: Record<string, string> = {};
    return {
      types: [] as string[],
      effectAllowed: "",
      setData(k: string, v: string) { store[k] = v; this.types.push(k); },
      getData(k: string) { return store[k] ?? ""; },
    };
  };
  const block = { label: "card", uid: "u1", source: "kanban", content: "the card body" };

  it("carries the block on the private MIME and a plain-text fallback for the outside world", () => {
    const e: any = { dataTransfer: dt() };
    startBlockDrag(e, block);
    expect(JSON.parse(e.dataTransfer.getData(BLOCK_MIME))).toEqual(block);
    expect(e.dataTransfer.getData("text/plain")).toBe("the card body");
    expect(e.dataTransfer.effectAllowed).toBe("copy");
  });

  it("truncates the plain-text fallback at 2000 chars but keeps the block content whole", () => {
    const e: any = { dataTransfer: dt() };
    startBlockDrag(e, { ...block, content: "x".repeat(5000) });
    expect(e.dataTransfer.getData("text/plain")).toHaveLength(2000);
    expect(JSON.parse(e.dataTransfer.getData(BLOCK_MIME)).content).toHaveLength(5000);
  });

  it("round-trips through readBlockDrag", () => {
    const e: any = { dataTransfer: dt() };
    startBlockDrag(e, block);
    expect(readBlockDrag(e)).toEqual(block);
    expect(hasBlockDrag(e)).toBe(true);
  });

  it("reads null for a foreign drag rather than inventing a block", () => {
    const e: any = { dataTransfer: dt() };
    expect(readBlockDrag(e)).toBeNull();
    expect(hasBlockDrag(e)).toBe(false);
  });

  it("rejects a block with no content — there would be nothing to inject", () => {
    const e: any = { dataTransfer: dt() };
    e.dataTransfer.setData(BLOCK_MIME, JSON.stringify({ ...block, content: "" }));
    expect(readBlockDrag(e)).toBeNull();
  });

  it("survives malformed payloads and a missing dataTransfer", () => {
    const e: any = { dataTransfer: dt() };
    e.dataTransfer.setData(BLOCK_MIME, "{not json");
    expect(readBlockDrag(e)).toBeNull();
    expect(() => startBlockDrag({} as any, block)).not.toThrow();
    expect(hasBlockDrag({} as any)).toBe(false);
  });
});

describe("a stopped terminal starts before a chip is typed (2026-09-21)", () => {
  it("ensurePtyRunning: running → nothing; stopped → pty/start, then waits for the composer", async () => {
    vi.useRealTimers();
    const { ensurePtyRunning } = await import("./agent-interact");
    apiPost.mockClear(); apiGet.mockReset();
    apiGet.mockResolvedValueOnce({ running: true, ready: true });
    expect(await ensurePtyRunning(9)).toBe(true); expect(apiPost).not.toHaveBeenCalled();
    apiGet.mockResolvedValueOnce({ running: false }).mockResolvedValue({ running: true, ready: true }); apiPost.mockResolvedValue({ ok: true });
    expect(await ensurePtyRunning(9)).toBe(true);
    expect(apiPost).toHaveBeenCalledWith("/api/v1/cockpit/pty/start", { pane_id: 9, cols: 110, rows: 32 }, expect.anything());
  });
});
