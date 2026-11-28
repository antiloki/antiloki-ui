// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { sharedSend, replayWanted, _resetShared } from "./shared-stream";

describe("a tab remembers what it asked the hub for, to say it again when it is back on screen", () => {
  beforeEach(() => { _resetShared(); (globalThis as any).__ANTILOKI_NO_SHARED_WORKER__ = true; });
  it("replays init, the open streams and the followed panes - and not what was closed or unfollowed", () => {
    sharedSend({ op: "open", key: "events" }); sharedSend({ op: "open", key: "pty" });
    sharedSend({ op: "follow", pane: 1, after: 10, agent: true }); sharedSend({ op: "follow", pane: 2, after: 0 }); sharedSend({ op: "follow", pane: 3, after: 5, agent: true });
    sharedSend({ op: "close", key: "pty" }); sharedSend({ op: "unfollow", pane: 2 }); sharedSend({ op: "unfollow", pane: 3, agent: true });
    const sent: any[] = []; replayWanted((m) => sent.push(m));
    expect(sent.map((m) => m.op)).toEqual(["init", "open", "follow"]);
    expect(sent[1]).toEqual({ op: "open", key: "events" });
    expect(sent[2]).toMatchObject({ op: "follow", pane: 1, agent: true });
  });
  it("a second follow of one pane replaces the first (the latest `after` wins)", () => {
    sharedSend({ op: "follow", pane: 9, after: 1, agent: true }); sharedSend({ op: "follow", pane: 9, after: 40, agent: true });
    const sent: any[] = []; replayWanted((m) => sent.push(m));
    expect(sent.filter((m) => m.op === "follow")).toHaveLength(1); expect(sent.find((m) => m.op === "follow").after).toBe(40);
  });
});
