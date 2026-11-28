import { describe, it, expect, vi, beforeEach } from "vitest";
const calls: any[] = [];
let reply: any;
vi.mock("./client", () => ({ apiPost: vi.fn(async (url: string, body: any) => { calls.push({ url, body }); return reply; }) }));
import { askEngine, extractJson, pinnedEngine } from "./engine";

beforeEach(() => { calls.length = 0; localStorage.clear(); reply = { choices: [{ message: { content: "hi" } }] }; });

describe("extractJson — the JSON inside a chatty reply", () => {
  it("bare, fenced, or surrounded by prose; null when none", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson("Here you go:\n```json\n[1,2]\n```\nthanks")).toEqual([1, 2]);
    expect(extractJson("Sure — {\"k\": [1]} — done")).toEqual({ k: [1] });
    expect(extractJson("no json here")).toBeNull();
  });
});
describe("askEngine", () => {
  it("rides the pinned engine (the serve picks when nothing is pinned), folds the system prompt, asks for JSON when told, and parses it", async () => {
    reply = { choices: [{ message: { content: '{"findings":[]}' } }] };
    const r = await askEngine("review", { system: "be terse", json: true, maxTurns: 60 });
    expect(calls[0].body.max_turns).toBe(60);
    expect(calls[0].url).toBe("/api/v1/cli-llm/chat/completions");
    expect(calls[0].body.model).toBe("cli:auto");   // nothing pinned: no seat is named, and none is assumed
    expect(calls[0].body.messages).toEqual([{ role: "system", content: "be terse" }, { role: "user", content: "review" }]);
    expect(calls[0].body.response_format).toEqual({ type: "json_object" });
    expect(r.ok && r.json).toEqual({ findings: [] });
    localStorage.setItem("antiloki:chat-engine", "cli:opencode");
    expect(pinnedEngine()).toBe("opencode");
    await askEngine("x"); expect(calls[1].body.model).toBe("cli:opencode");
  });
  it("a catalog call sends the template base + vars and the tier — no prompt text leaves the FE", async () => {
    reply = { choices: [{ message: { content: "{}" } }] };
    await askEngine({ template: "xray.ultra_review", vars: { brief: "B", focus: "" } }, { json: true, tier: "high" });
    expect(calls[0].body).toMatchObject({ template: "xray.ultra_review", vars: { brief: "B", focus: "" }, tier: "high", messages: [] });
  });
  it("an empty or errored reply is a failure with the engine's message", async () => {
    reply = { error: { message: "opencode returned no text" } };
    const r = await askEngine("x");
    expect(r.ok).toBe(false); expect(!r.ok && r.error).toBe("opencode returned no text");
  });
});

describe("the one list of engines a pane can be", () => {
  it("is the seats and the gateway, once, and knows which pane kinds are engine panes", async () => {
    const { CHAT_ENGINES, ENGINE_KEYS, isEnginePaneKind, isSubscriptionPaneKind } = await import("./engine");
    expect(CHAT_ENGINES).toBe(ENGINE_KEYS);
    for (const k of ["claude-code", "codex", "gemini", "grok", "cursor", "opencode", "opencode-direct"]) expect(isEnginePaneKind(k)).toBe(true);
    for (const k of ["agent", "script", "git", "context", "", undefined, 3]) expect(isEnginePaneKind(k)).toBe(false);
    expect(["cursor", "gemini", "grok", "codex", "claude-code"].every(isSubscriptionPaneKind)).toBe(true);
    expect(isSubscriptionPaneKind("opencode")).toBe(false); expect(isSubscriptionPaneKind("opencode-direct")).toBe(false);
  });
});
