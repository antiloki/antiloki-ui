// @vitest-environment jsdom
// THE OUTBOX (operator 2026-10-09: "when sending more messages while in the middle of an execution it should queue my tasks"). A message sent while the agent is busy is HELD (shown as
// "queued N of M", nothing sent), and goes, in order, the moment the pane is free. The composer's contentEditable is replaced by a plain textarea; the pane around it is the real one.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ status: { running: true, busy: true } as any, feed: null as any, posts: [] as string[] }));
vi.mock("@/loki/api/client", () => ({
  apiGet: vi.fn(async (url: string) => (String(url).includes("/agent/status") ? { result: h.status } : {})),
  apiPost: vi.fn(async (url: string, body: any) => { h.posts.push(`${url}|${body?.text ?? ""}`); return {}; }), BE_URL: "http://be.test", isNotWired: () => false,
}));
vi.mock("./pty-streams", () => ({ subscribeAgent: (_id: number, _after: number, handlers: any) => { h.feed = handlers; return () => {}; } }));
vi.mock("@/loki/api/engine", async (importOriginal) => ({ ...(await importOriginal<any>()), askEngine: vi.fn(async () => ({})) }));
vi.mock("@/loki/api/dispatch", () => ({ uploadFile: vi.fn(async () => ({})) }));
vi.mock("@/loki/desktop/shell", () => ({ isDesktop: () => false, pickFile: vi.fn() }));
vi.mock("@/loki/shell/mini-tour", () => ({ useTourUnlock: () => () => {} }));
vi.mock("@/loki/chat/mention-input", () => ({
  MentionInput: ({ value, onChange, onEnter }: any) => <textarea data-testid="mock-input" value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onEnter(value); }} />,
}));
import { AgentChatPane, outboxWithout, outboxMoved } from "./agent-chat-pane";

const sends = () => h.posts.filter((p) => p.startsWith("/api/v1/cockpit/agent/send|"));
const type = (text: string) => { const el = screen.getByTestId("mock-input") as HTMLTextAreaElement; fireEvent.change(el, { target: { value: text } }); fireEvent.keyDown(el, { key: "Enter" }); };
const mount = async () => { render(<AgentChatPane p={{ id: 7, pane_kind: "claude-code", subagent_name: "a", worktree_path: "/tmp/wt", settings_json: "{}" } as any} chat heimdallOn onSide={vi.fn()} />); await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
beforeEach(() => { h.status = { running: true, busy: true }; h.feed = null; h.posts = []; try { localStorage.clear(); } catch { /* fine */ } });
afterEach(() => { cleanup(); });

describe("messages sent while the agent is busy are queued", () => {
  it("holds them in order, shows them as queued, sends nothing, and sends each when the pane is free", async () => {
    await mount();
    await waitFor(() => expect(h.posts.length).toBeGreaterThanOrEqual(0));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    type("first follow-up"); type("second follow-up");
    expect(await screen.findByTestId("outbox-0")).toBeTruthy();
    expect(screen.getByTestId("outbox-1").textContent).toContain("second follow-up");
    expect(screen.getByTestId("outbox-0").textContent).toContain("queued 1 of 2");
    expect(sends()).toHaveLength(0);                                            // held, not sent into a busy engine
    expect((screen.getByTestId("mock-input") as HTMLTextAreaElement).value).toBe("");   // the draft is cleared: the message is safe in the queue
    h.status = { running: true, busy: false };                                  // the agent finishes: the next status poll frees the pane
    await waitFor(() => expect(sends().length).toBeGreaterThanOrEqual(1), { timeout: 8000 });
    expect(sends()[0]).toContain("first follow-up");                            // in the order they were sent
    await waitFor(() => expect(sends()).toHaveLength(2), { timeout: 8000 });
    expect(sends()[1]).toContain("second follow-up");
    await waitFor(() => expect(screen.queryByTestId("outbox")).toBeNull(), { timeout: 4000 });
  }, 30000);
  it("sends at once when nothing is running", async () => {
    h.status = { running: true, busy: false };
    await mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    type("hello");
    await waitFor(() => expect(sends()).toHaveLength(1), { timeout: 4000 });
    expect(screen.queryByTestId("outbox")).toBeNull();
  }, 15000);
  it("a queued message can be taken back or moved, and what is left goes in the new order", async () => {
    await mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    type("alpha"); type("bravo"); type("charlie");
    expect((await screen.findByTestId("outbox-2")).textContent).toContain("charlie");
    expect((screen.getByTestId("outbox-up-0") as HTMLButtonElement).disabled).toBe(true);            // the first cannot go earlier
    expect((screen.getByTestId("outbox-down-2") as HTMLButtonElement).disabled).toBe(true);          // the last cannot go later
    fireEvent.click(screen.getByTestId("outbox-up-2"));                                              // charlie ahead of bravo: alpha, charlie, bravo
    expect(screen.getByTestId("outbox-1").textContent).toContain("charlie");
    fireEvent.click(screen.getByTestId("outbox-cancel-0"));                                          // alpha taken back: charlie, bravo
    expect(screen.getByTestId("outbox-0").textContent).toContain("charlie");
    expect(screen.getByTestId("outbox-0").textContent).toContain("queued 1 of 2");
    expect(sends()).toHaveLength(0);
    h.status = { running: true, busy: false };
    await waitFor(() => expect(sends()).toHaveLength(2), { timeout: 12000 });
    expect(sends()[0]).toContain("charlie"); expect(sends()[1]).toContain("bravo");
    expect(sends().some((x) => x.includes("alpha"))).toBe(false);                                    // the cancelled message was never sent
  }, 40000);
  it("the two edits are pure", () => {
    expect(outboxWithout(["a", "b", "c"], 1)).toEqual(["a", "c"]);
    expect(outboxMoved(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(outboxMoved(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);                            // off the top: unchanged
    expect(outboxMoved(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);                             // off the bottom: unchanged
  });
});
