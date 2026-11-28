// @vitest-environment jsdom
// THE RUN'S STATS DETAIL STAYS INLINE (operator 2026-10-08: "don't drop the stats detail inline detail, that was right").
// Everything else under an answer folds to one dim line; the run's story block (headline, stages, summary) must not: it is in the thread
// while every meta line is collapsed, and it is not inside the meta's own box.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act, cleanup, within, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ feed: null as any }));
vi.mock("@/loki/api/client", () => ({
  apiGet: vi.fn(async (url: string) => (String(url).includes("/agent/status") ? { result: { running: true, busy: false } } : {})),
  apiPost: vi.fn(async () => ({})), BE_URL: "http://be.test", isNotWired: () => false,
}));
vi.mock("./pty-streams", () => ({ subscribeAgent: (_id: number, _after: number, handlers: any) => { h.feed = handlers; return () => {}; } }));
vi.mock("@/loki/api/engine", async (importOriginal) => ({ ...(await importOriginal<any>()), askEngine: vi.fn(async () => ({})) }));
vi.mock("@/loki/api/dispatch", () => ({ uploadFile: vi.fn(async () => ({})) }));
vi.mock("@/loki/desktop/shell", () => ({ isDesktop: () => false, pickFile: vi.fn() }));
vi.mock("@/loki/shell/mini-tour", () => ({ useTourUnlock: () => () => {} }));
// the story itself: a stand-in with a test id, so the test is about WHERE it is drawn and not about its contents
vi.mock("@/loki/chat/work-story", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  fetchStory: vi.fn(async (run: number) => ({ run, status: "done", headline: "stats detail" })),
  WorkStory: ({ story }: any) => <div data-testid="work-story-stub">{story.headline}</div>,
}));
import { AgentChatPane } from "./agent-chat-pane";

const T0 = Date.now() - 60_000;
const ev = (e: any) => e;
const feed = (events: any[]) => act(() => { events.forEach((e, i) => h.feed.event(i + 1, { seq: i + 1, t: T0 + i * 1000, ev: e })); });
beforeEach(() => { h.feed = null; try { localStorage.clear(); } catch { /* fine */ } });
afterEach(() => { cleanup(); });

describe("the run's stats detail is inline, not folded", () => {
  it("is in the thread while an earlier answer's meta line is collapsed, and not inside any meta box", async () => {
    render(<AgentChatPane p={{ id: 7, pane_kind: "claude-code", subagent_name: "a", worktree_path: "/tmp/wt", settings_json: "{}" } as any} chat heimdallOn onSide={vi.fn()} />);
    await act(async () => { await Promise.resolve(); });
    feed([
      ev({ type: "antiloki", subtype: "user", text: "fix the nav bar" }), ev({ type: "antiloki", subtype: "run", run: 5 }),
      ev({ type: "assistant", message: { model: "claude-sonnet", content: [{ type: "text", text: "Done." }] } }),
      ev({ type: "antiloki", subtype: "audit", model: "sonnet", ms: 4100, tokens: 1200, cost: 0.011, baseline_usd: 0.112, baseline: "claude · opus" }),
      ev({ type: "result", total_cost_usd: 0.011, duration_ms: 4100, num_turns: 1 }),
      ev({ type: "antiloki", subtype: "user", text: "and the footer?" }),
      ev({ type: "assistant", message: { model: "claude-sonnet", content: [{ type: "text", text: "Footer done." }] } }),
    ]);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const metas = screen.getAllByTestId("reply-meta");
    expect(metas.length).toBeGreaterThan(0);
    expect(metas[0].getAttribute("data-open")).toBe("0");                                             // the earlier answer's details are folded (only the thread's last block opens by default)…
    const story = await screen.findByTestId("work-story-stub");                                       // …and the stats detail is still drawn
    expect(story.textContent).toBe("stats detail");
    for (const m of metas) expect(within(m).queryByTestId("work-story-stub")).toBeNull();            // not inside any meta box
  });
  it("Heimdall's rewrite is not drawn as a message once the story (where its plan lives) is on screen", async () => {
    render(<AgentChatPane p={{ id: 8, pane_kind: "claude-code", subagent_name: "a", worktree_path: "/tmp/wt", settings_json: "{}" } as any} chat heimdallOn onSide={vi.fn()} />);
    await act(async () => { await Promise.resolve(); });
    feed([
      ev({ type: "antiloki", subtype: "user", text: "fix the nav bar" }),
      ev({ type: "antiloki", subtype: "user", text: "Goal: fix the nav bar so the Log in button sits left of the avatar.\n\nAcceptance:\n- the button renders", source: "heimdall" }),
      ev({ type: "antiloki", subtype: "run", run: 9 }),
      ev({ type: "assistant", message: { model: "claude-sonnet", content: [{ type: "text", text: "Done." }] } }),
    ]);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(await screen.findByTestId("work-story-stub")).toBeTruthy();                                // the story loaded…
    await waitFor(() => expect(screen.queryByTestId("task-card")).toBeNull());                         // …so the rewrite is no longer a block of its own
    expect(screen.getByText("fix the nav bar")).toBeTruthy();                                         // the human's own words stay
  });
});
