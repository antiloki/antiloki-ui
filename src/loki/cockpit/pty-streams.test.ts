// THE MULTIPLEXED PTY STREAM (2026-09-20): one EventSource for every pane, re-added on each hello.
import { describe, it, expect, vi, beforeEach } from "vitest";

const posts: any[] = [];
vi.mock("@/loki/api/client", () => ({ BE_URL: "http://be", apiPost: vi.fn(async (path: string, body: any) => { posts.push([path, body]); return { ok: true }; }) }));

class FakeES {
  static instances: FakeES[] = [];
  url: string; listeners: Record<string, ((ev: any) => void)[]> = {}; closed = false; onerror: null | (() => void) = null;
  constructor(url: string) { this.url = url; FakeES.instances.push(this); }
  addEventListener(name: string, fn: (ev: any) => void) { (this.listeners[name] ??= []).push(fn); }
  emit(name: string, data: string) { for (const fn of this.listeners[name] ?? []) fn({ data }); }
  close() { this.closed = true; }
}

describe("pty-streams", () => {
  beforeEach(() => { posts.length = 0; FakeES.instances.length = 0; (globalThis as any).EventSource = FakeES; });
  it("opens one stream for many panes, adds them all on hello, routes chunks by pane, closes with the last one", async () => {
    const { subscribePane, streamFollowers, parsePaneEvent } = await import("./pty-streams");
    const a: string[] = []; const b: string[] = []; let readyA = -1; let exitB = "";
    const offA = subscribePane(9, 5, { chunk: (_id, d) => a.push(d), ready: (n) => { readyA = n; }, exit: () => {} });
    const offB = subscribePane(13, 0, { chunk: (_id, d) => b.push(d), ready: () => {}, exit: (d) => { exitB = d; } });
    expect(FakeES.instances.length).toBe(1);
    expect(FakeES.instances[0].url).toMatch(/\/api\/v1\/cockpit\/pty\/streams\?sub=/);
    expect(posts.length).toBe(0); // nothing is posted before the serve says hello
    FakeES.instances[0].emit("hello", "x");
    await Promise.resolve();
    expect(posts[0][0]).toBe("/api/v1/cockpit/pty/streams/sub");
    expect(posts[0][1].add).toEqual([{ pane_id: 9, after: 5 }, { pane_id: 13, after: 0 }]);
    const es = FakeES.instances[0];
    es.emit("pane", JSON.stringify({ pane: 9, kind: "chunk", id: 6, data: "hi" }));
    es.emit("pane", JSON.stringify({ pane: 9, kind: "chunk", id: 6, data: "dup" })); // an id already written is ignored
    es.emit("pane", JSON.stringify({ pane: 9, kind: "chunk", seq: 1, data: "live" })); // a live chunk's seq restarts at 1 — never a duplicate
    es.emit("pane", JSON.stringify({ pane: 13, kind: "chunk", id: 1, data: "yo" }));
    es.emit("pane", JSON.stringify({ pane: 9, kind: "ready", id: 6 }));
    es.emit("pane", JSON.stringify({ pane: 13, kind: "exit", data: "\r\n(exit 0)\r\n" }));
    es.emit("pane", JSON.stringify({ pane: 99, kind: "chunk", id: 1, data: "nobody" }));
    expect(a).toEqual(["hi", "live"]); expect(b).toEqual(["yo"]); expect(readyA).toBe(6); expect(exitB).toContain("exit 0");
    // a late subscriber is added on its own; a reconnect's hello re-adds everyone from where they are
    subscribePane(14, 0, { chunk: () => {}, ready: () => {}, exit: () => {} })();
    await Promise.resolve();
    expect(posts.some((p) => p[1].add?.[0]?.pane_id === 14)).toBe(true);
    expect(posts.some((p) => p[1].remove?.[0] === 14)).toBe(true);
    es.emit("hello", "x"); await Promise.resolve();
    expect(posts[posts.length - 1][1].add).toEqual([{ pane_id: 9, after: 6 }, { pane_id: 13, after: 1 }]);
    offA(); expect(es.closed).toBe(false); offB(); expect(es.closed).toBe(true); expect(streamFollowers()).toBe(0);
    expect(parsePaneEvent("not json")).toBeNull(); expect(parsePaneEvent("{\"pane\":\"x\"}")).toBeNull();
  });
  it("a stream that never connects tells every pane to poll instead", async () => {
    vi.resetModules();
    const { subscribePane } = await import("./pty-streams");
    let polled = 0;
    subscribePane(9, 0, { chunk: () => {}, ready: () => {}, exit: () => {}, unavailable: () => { polled++; } });
    FakeES.instances[FakeES.instances.length - 1].onerror?.();
    expect(polled).toBe(1);
  });
});
