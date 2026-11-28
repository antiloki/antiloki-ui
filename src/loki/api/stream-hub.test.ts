import { describe, it, expect } from "vitest";
import { StreamHub, type HubFrame } from "./stream-hub";

type Src = { url: string; on: (t: string, d: string) => void; onState: (s: "open" | "error", rs: number) => void; closed: boolean };
function harness() {
  const sources: Src[] = []; const posts: any[] = []; let now = 1000;
  const hub = new StreamHub((url, on, onState) => { const s: Src = { url, on, onState, closed: false }; sources.push(s); return { close: () => { s.closed = true; } }; }, async (_be, body) => { posts.push(body); }, () => now, "sub-1");
  const port = () => { const frames: HubFrame[] = []; return { postMessage: (m: HubFrame) => frames.push(m), frames }; };
  return { hub, sources, posts, port, tick: (ms: number) => { now += ms; } };
}

describe("the stream hub (2026-09-21): one browser, one set of streams, every tab a port", () => {
  it("opens the events stream once for any number of tabs, fans the frames out, and closes it with the last tab", () => {
    const { hub, sources, port } = harness();
    const a = port(); const b = port();
    hub.attach(a); hub.attach(b); hub.handle(a, { op: "init", be: "http://be" });
    hub.handle(a, { op: "open", key: "events" }); hub.handle(b, { op: "open", key: "events" });
    expect(sources.length).toBe(1); expect(sources[0].url).toBe("http://be/api/v1/events");
    sources[0].onState("open", 1); sources[0].on("message", '{"t":"change"}');
    expect(a.frames.map((f) => f.type)).toEqual(["open", "message"]); expect(b.frames.length).toBe(2); expect(b.frames[1].data).toBe('{"t":"change"}');
    hub.handle(a, { op: "close", key: "events" }); expect(sources[0].closed).toBe(false);
    hub.handle(b, { op: "close", key: "events" }); expect(sources[0].closed).toBe(true);
    expect(hub.state().events).toBe(false);
  });
  it("the pane stream: one subscription id, follows refcounted across tabs, adds posted once from the earliest point, removes only when nobody follows", async () => {
    const { hub, sources, posts, port } = harness();
    const a = port(); const b = port(); hub.attach(a); hub.attach(b); hub.handle(a, { op: "init", be: "http://be" });
    hub.handle(a, { op: "follow", pane: 5, after: 40 });
    expect(sources.length).toBe(1); expect(sources[0].url).toContain("/api/v1/cockpit/pty/streams?sub=sub-1");
    expect(posts.length).toBe(0); // nothing is posted before the serve says hello
    hub.handle(b, { op: "follow", pane: 5, after: 10 }); hub.handle(b, { op: "follow", pane: 7, after: 0, agent: true });
    sources[0].on("hello", ""); await Promise.resolve();
    expect(posts).toEqual([{ sub: "sub-1", add: [{ pane_id: 5, after: 10, agent: undefined }, { pane_id: 7, after: 0, agent: true }], remove: [] }]);
    expect(a.frames.map((f) => f.type)).toEqual(["hello"]); expect(a.frames[0].subId).toBe("sub-1");
    // a follow after hello is posted at once; a pane frame reaches every tab on the stream
    hub.handle(a, { op: "follow", pane: 9, after: 3 }); await Promise.resolve();
    expect(posts[1]).toEqual({ sub: "sub-1", add: [{ pane_id: 9, after: 3, agent: undefined }], remove: [] });
    sources[0].on("pane", '{"pane":5,"kind":"chunk","id":41,"data":"x"}');
    expect(a.frames.at(-1)?.data).toContain('"pane":5'); expect(b.frames.at(-1)?.data).toContain('"pane":5');
    // tab a stops following 5 — b still does: no remove; b stops too: removed
    hub.handle(a, { op: "unfollow", pane: 5 }); await Promise.resolve(); expect(posts.length).toBe(2);
    hub.handle(b, { op: "unfollow", pane: 5 }); await Promise.resolve(); expect(posts[2]).toEqual({ sub: "sub-1", add: [], remove: [5] });
    // the agent kind and the pty kind of one pane are one pane for the serve: removed when both are gone
    hub.handle(b, { op: "follow", pane: 7, after: 0 }); await Promise.resolve();
    hub.handle(b, { op: "unfollow", pane: 7, agent: true }); await Promise.resolve(); expect(posts.at(-1)?.remove ?? []).not.toContain(7);
    hub.handle(b, { op: "unfollow", pane: 7 }); await Promise.resolve(); expect(posts.at(-1)).toEqual({ sub: "sub-1", add: [], remove: [7] });
    expect(hub.state().follows).toEqual(["p:9"]);
    // a reconnect lands on an empty subscription: hello re-adds everything still followed
    sources[0].onState("error", 0); sources[0].on("hello", ""); await Promise.resolve();
    expect(posts.at(-1)).toEqual({ sub: "sub-1", add: [{ pane_id: 9, after: 3, agent: undefined }], remove: [] });
  });
  it("a tab that vanishes without a word is swept, and its follows with it; `bye` is the polite version", async () => {
    const { hub, sources, posts, port, tick } = harness();
    const a = port(); const b = port(); hub.attach(a); hub.attach(b); hub.handle(a, { op: "init", be: "http://be" });
    hub.handle(a, { op: "follow", pane: 1, after: 0 }); hub.handle(b, { op: "follow", pane: 2, after: 0 });
    sources[0].on("hello", ""); await Promise.resolve();
    tick(20_000); hub.handle(b, { op: "ping" }); tick(30_000); // a silent for 50s, b pinged 30s ago
    hub.sweep(); await Promise.resolve();
    expect(hub.state().clients).toBe(1); expect(hub.state().follows).toEqual(["p:2"]); expect(posts.at(-1)).toEqual({ sub: "sub-1", add: [], remove: [1] });
    hub.handle(b, { op: "bye" }); await Promise.resolve();
    expect(hub.state()).toMatchObject({ clients: 0, pty: false, follows: [] }); expect(sources[0].closed).toBe(true);
  });
});

describe("a tab joining a pane that is already followed (2026-09-28: Main's thread blank after a reload)", () => {
  it("is handed the pane's history alone, and nobody else is sent it twice", async () => {
    const sources: any[] = []; const posts: any[] = []; const asked: any[] = [];
    const replayer = async (_be: string, pane: number, after: number) => { asked.push({ pane, after }); return [{ key: "pty" as const, type: "pane", data: JSON.stringify({ pane, kind: "agent", seq: 5, data: {} }) }]; };
    const hub = new StreamHub((url, on, onState) => { const s = { url, on, onState }; sources.push(s); return { close() {} }; }, async (_be, body) => { posts.push(body); }, () => 1000, "sub-1", replayer);
    const mk = () => { const frames: HubFrame[] = []; return { postMessage: (m: HubFrame) => frames.push(m), frames }; };
    const first = mk(); const second = mk();
    hub.attach(first); hub.attach(second);
    hub.handle(first, { op: "init", be: "http://be" });
    hub.handle(first, { op: "follow", pane: 25, after: 0, agent: true });
    expect(asked).toEqual([]);                                    // the first follower is served by the serve's own replay
    hub.handle(second, { op: "follow", pane: 25, after: 0, agent: true });
    await Promise.resolve(); await Promise.resolve();
    expect(asked).toEqual([{ pane: 25, after: 0 }]);
    expect(second.frames.filter((f) => f.type === "pane").length).toBe(1);
    expect(first.frames.filter((f) => f.type === "pane").length).toBe(0);
  });
});


describe("a tab the hub swept comes back (operator 2026-10-09: a background cockpit tab went stale for good)", () => {
  it("re-adopts a port that speaks again, so its open and follows work after the sweep", async () => {
    const { hub, sources, port, tick, posts } = harness();
    const a = port(); hub.attach(a); hub.handle(a, { op: "init", be: "http://be" });
    hub.handle(a, { op: "open", key: "events" }); hub.handle(a, { op: "follow", pane: 7, after: 3, agent: true });
    tick(60_000); hub.sweep(); await Promise.resolve();                          // its timers were throttled: the ping never came
    expect(hub.state().clients).toBe(0); expect(hub.state().follows).toEqual([]);   // swept - nothing followed any more
    // the tab is back on screen and says what it wants again
    hub.handle(a, { op: "init", be: "http://be" }); hub.handle(a, { op: "open", key: "events" }); hub.handle(a, { op: "follow", pane: 7, after: 3, agent: true });
    expect(hub.state().clients).toBe(1); expect(hub.state().follows).toEqual(["a:7"]);
    const ev = sources.find((s) => s.url.endsWith("/api/v1/events") && !s.closed)!; ev.onState("open", 1); ev.on("message", "x");
    expect(a.frames.some((f) => f.key === "events" && f.type === "message")).toBe(true);   // frames flow to it again
    void posts;
  });
  it("a goodbye from a port the hub never held does not adopt it", () => {
    const { hub, port } = harness(); const a = port();
    hub.handle(a, { op: "bye" });
    expect(hub.state().clients).toBe(0);
  });
});
