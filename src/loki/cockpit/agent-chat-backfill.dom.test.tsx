// @vitest-environment jsdom
// Grokbot QA 2026-10-12, items 7 and 6, on the pane mounted for real.
//   7: "after a prompt the episode shows 3 replies, the card preview shows the agent's text, but the chat pane stays blank". The pane used to learn its turns ONLY from the live stream (a SharedWorker a webview may start
//      without it ever delivering a frame). The history is on disk, the status says how far it goes, and the pane now reads the gap itself.
//   6: "no way to change an existing agent's engine": the provider switch was drawn nowhere.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";

const h = vi.hoisted(() => ({ status: { running: true, busy: false, last_seq: 0 } as any, events: [] as any[], eventCalls: [] as string[], feed: null as any }));
vi.mock("@/loki/api/client", () => ({
  apiGet: vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/agent/status")) return { result: h.status };
    if (u.includes("/agent/events")) { h.eventCalls.push(u); const after = Number(/after=(\d+)/.exec(u)?.[1] ?? 0); return { ok: true, events: h.events.filter((e) => e.seq > after), last_seq: h.events.length }; }
    return {};
  }),
  apiPost: vi.fn(async () => ({})), BE_URL: "http://be.test", isNotWired: () => false,
}));
vi.mock("./pty-streams", () => ({ subscribeAgent: (_id: number, _after: number, handlers: any) => { h.feed = handlers; return () => {}; } }));
vi.mock("@/loki/api/engine", async (importOriginal) => ({ ...(await importOriginal<any>()), askEngine: vi.fn(async () => ({})) }));
vi.mock("@/loki/api/dispatch", () => ({ uploadFile: vi.fn(async () => ({})) }));
vi.mock("@/loki/desktop/shell", () => ({ isDesktop: () => false, pickFile: vi.fn() }));
vi.mock("@/loki/shell/mini-tour", () => ({ useTourUnlock: () => () => {} }));
import { AgentChatPane } from "./agent-chat-pane";

const T0 = Date.now() - 60_000;
const user = (text: string) => ({ type: "antiloki", subtype: "user", text });
const reply = (text: string) => ({ type: "assistant", message: { model: "codex", content: [{ type: "text", text }] } });
const wrap = (i: number, e: any) => ({ seq: i, t: T0 + i * 1000, ev: e });
const props = (over: any = {}) => ({ p: { id: 9, pane_kind: "codex", subagent_name: "a", worktree_path: "/tmp/wt", settings_json: "{}" }, chat: true, heimdallOn: false, onSide: vi.fn(), ...over });

beforeEach(() => { h.status = { running: true, busy: false, last_seq: 0 }; h.events = []; h.eventCalls = []; h.feed = null; try { localStorage.clear(); } catch { /* fine */ } });
afterEach(() => { cleanup(); });

describe("the thread does not depend on the live stream alone", () => {
  it("fills in the history from the events route when the stream never delivers a frame", async () => {
    h.events = [wrap(1, user("hello")), wrap(2, reply("Hi, I am the agent.")), wrap(3, { type: "result", total_cost_usd: 0.01, duration_ms: 900, num_turns: 1 })];
    h.status = { running: true, busy: false, last_seq: 3 };
    render(<AgentChatPane {...props()} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(screen.queryByText("Hi, I am the agent.")).toBeTruthy();
    expect(h.eventCalls.length).toBeGreaterThan(0);
    expect(h.eventCalls[0]).toContain("after=0");
  });
  it("shows a turn once when the stream and the backfill both deliver it", async () => {
    h.events = [wrap(1, user("hello")), wrap(2, reply("Only once please."))];
    h.status = { running: true, busy: false, last_seq: 2 };
    render(<AgentChatPane {...props()} />);
    await act(async () => { await Promise.resolve(); });
    act(() => { h.feed.event(1, wrap(1, user("hello"))); h.feed.event(2, wrap(2, reply("Only once please."))); });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(screen.getAllByText("Only once please.")).toHaveLength(1);
  });
  it("asks only for what it has not shown yet", async () => {
    h.events = [wrap(1, user("hello")), wrap(2, reply("one")), wrap(3, reply("two"))];
    h.status = { running: true, busy: false, last_seq: 3 };
    render(<AgentChatPane {...props()} />);
    await act(async () => { await Promise.resolve(); });
    act(() => { h.feed.event(1, wrap(1, user("hello"))); h.feed.event(2, wrap(2, reply("one"))); });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(screen.queryByText("two")).toBeTruthy();
  });
});

describe("an agent that cannot start says why (item 5)", () => {
  it("shows the serve's reason instead of spinning for ever", async () => {
    const client: any = await import("@/loki/api/client");
    client.apiPost.mockImplementation(async (url: string) => (String(url).includes("/agent/start") ? { ok: false, error: "claude is not installed" } : {}));
    h.status = { running: false, busy: false, last_seq: 0 };
    render(<AgentChatPane {...props({ p: { id: 11, pane_kind: "claude-code", subagent_name: "agent-main", worktree_path: "/tmp/wt", settings_json: "{}" } })} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    const e = await screen.findByTestId("agent-link-error");
    expect(e.textContent).toContain("claude is not installed");
    client.apiPost.mockImplementation(async () => ({}));
  });
});

describe("the engine switch", () => {
  it("is drawn on an agent that has one, and its menu lists the engines", async () => {
    const pick = vi.fn();
    render(<AgentChatPane {...props({ chatSwitch: { engines: ["codex", "cursor"], busy: false, pick } })} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByTestId("chat-provider"));
    fireEvent.click(await screen.findByTestId("chat-provider-cursor"));
    expect(pick).toHaveBeenCalledWith("cursor");
  });
  it("is not drawn when the pane has none", async () => {
    render(<AgentChatPane {...props()} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByTestId("chat-provider")).toBeNull();
  });
});

// Grokbot QA round 2, bug 5: a mouse click on the Heimdall toggles must not move the keyboard onto them.
describe("a click on the Heimdall toggles does not take focus", () => {
  it("mousedown on the chip is default-prevented, so a space typed afterwards cannot re-press it", async () => {
    render(<AgentChatPane {...props({ heimdallOn: true, onToggleHeimdall: vi.fn() })} />);
    await act(async () => { await Promise.resolve(); });
    const chip = screen.getByTestId("agent-heimdall-chip").querySelector("button") ?? screen.getByTestId("agent-heimdall-chip");
    const notPrevented = fireEvent.mouseDown(chip as Element);          // false = the default was prevented
    expect(notPrevented).toBe(false);
  });
});
