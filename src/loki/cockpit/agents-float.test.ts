import { describe, it, expect } from "vitest";
import { placeOf, lineOf, fillOf, type LiveAgent } from "./agents-float";

const base: LiveAgent = { pane_id: 4, session_id: 5, session_name: "antichat#4", key: "chat-1789948182636-233373452", kind: "claude-code", worktree: "/w", ui: "chat", icon: null, name: null, max: false, running: true, busy: false, model: "claude-sonnet-5", cost_usd: 0.3, quota: null, preview: { text: "", tool: "", tool_open: false, t: 0 }, run: null, last_activity: null };

describe("the floating agents bar", () => {
  it("finds the pane's thread and widget on the stage from the pane key", () => {
    const stage = { activeThread: "th-2", threads: [{ id: "th-1", name: "one", items: ["uw-1"] }, { id: "th-2", name: "two", items: ["uw-2", "uw-3"] }], userDocked: { "uw-2": { kind: "vibe-pane", payload: { sessionId: 1789948182636, paneId: 233373452 } }, "uw-3": { kind: "vibe-pane", payload: { sessionId: 1, paneId: 2 } } } };
    expect(placeOf(stage, "chat-1789948182636-233373452")).toEqual({ thread: "th-2", item: "uw-2", threadName: "two" });
    expect(placeOf(stage, "chat-9-9")).toBeNull();
    expect(placeOf(null, "chat-1-2")).toBeNull();
  });
  it("says what the agent is on, decisions first", () => {
    expect(lineOf({ ...base, busy: true, preview: { text: "x", tool: "Read src/a.ts", tool_open: true, t: 1 } })).toEqual({ text: "Read src/a.ts", tone: "busy" });
    expect(lineOf({ ...base, busy: true, preview: { text: "Looking", tool: "Read a", tool_open: false, t: 1 } })).toEqual({ text: "Looking", tone: "busy" });
    expect(lineOf({ ...base, run: { id: 1, status: "awaiting-answers", goal: "g", done: 0, running: 0, total: 0, created: 1, ended: null, questions: 2 } })).toEqual({ text: "2 questions waiting for you", tone: "ask" });
    expect(lineOf({ ...base, run: { id: 1, status: "running", goal: "fix the scheduler", done: 1, running: 2, total: 4, created: 1, ended: null, questions: 0 } })).toEqual({ text: "1/4 tasks · fix the scheduler", tone: "busy" });
    expect(lineOf({ ...base, running: false, preview: { text: "Done.", tool: "", tool_open: false, t: 1 } })).toEqual({ text: "Done.", tone: "done" });
    expect(lineOf(base)).toEqual({ text: "ready", tone: "idle" });
  });
  it("fills the bar only for a running plan", () => {
    expect(fillOf(base)).toBeNull();
    expect(fillOf({ ...base, run: { id: 1, status: "running", goal: "g", done: 2, running: 1, total: 4, created: 1, ended: null, questions: 0 } })).toBe(0.5);
    expect(fillOf({ ...base, run: { id: 1, status: "running", goal: "g", done: 0, running: 1, total: 4, created: 1, ended: null, questions: 0 } })).toBe(0.04);
  });
});
