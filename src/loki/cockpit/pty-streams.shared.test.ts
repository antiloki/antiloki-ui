// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// the shared worker is there: the module must not open an EventSource of its own — it follows through the hub
const sent: any[] = []; let listener: ((type: string, data: string) => void) | null = null;
vi.mock("@/loki/api/shared-stream", () => ({ sharedAvailable: () => true, sharedSend: (m: any) => sent.push(m), sharedListen: (_k: string, h: any) => { listener = h; return () => { listener = null; }; } }));

describe("the pane stream over the shared worker (2026-09-21)", () => {
  beforeEach(() => { sent.length = 0; listener = null; });
  it("follows and unfollows through the worker, never opens an EventSource, and hands the frames to the pane", async () => {
    const ES = vi.fn(); (globalThis as any).EventSource = ES;
    const { subscribePane, subscribeAgent, streamFollowers } = await import("./pty-streams");
    const chunks: string[] = []; const events: any[] = [];
    const offPane = subscribePane(5, 40, { chunk: (_id, d) => chunks.push(d), ready: () => {}, exit: () => {} });
    const offAgent = subscribeAgent(5, 2, { event: (_s, d) => events.push(d), ready: () => {} });
    expect(ES).not.toHaveBeenCalled();
    expect(sent).toEqual([{ op: "open", key: "pty" }, { op: "follow", pane: 5, after: 40 }, { op: "follow", pane: 5, after: 2, agent: true }]);
    expect(streamFollowers()).toBe(2);
    listener!("hello", ""); listener!("pane", JSON.stringify({ pane: 5, kind: "chunk", id: 41, data: "hi" })); listener!("pane", JSON.stringify({ pane: 5, kind: "chunk", id: 41, data: "dup" }));
    listener!("pane", JSON.stringify({ pane: 5, kind: "agent", seq: 3, data: { type: "result" } }));
    expect(chunks).toEqual(["hi"]); expect(events).toEqual([{ type: "result" }]);
    offPane(); expect(sent.at(-1)).toEqual({ op: "unfollow", pane: 5 });
    offAgent(); expect(sent.at(-2)).toEqual({ op: "unfollow", pane: 5, agent: true }); expect(sent.at(-1)).toEqual({ op: "close", key: "pty" });
    expect(listener).toBeNull();
  });
});
