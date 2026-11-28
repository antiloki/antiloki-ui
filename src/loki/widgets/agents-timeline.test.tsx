import { describe, it, expect } from "vitest";
import { daySummary, type TimelineFrame } from "./agents-timeline";

const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
const f = (op: string, text: string, agent = "claude", hours = 10, tone: TimelineFrame["tone"] = "fg"): TimelineFrame => ({ t: at(hours), agent, glyph: "·", op, text, tone });

describe("daySummary — the audit as one quote (2026-09-18)", () => {
  it("counts only today and reads like a sentence", () => {
    const yesterday: TimelineFrame = { ...f("wrote", "old.ts"), t: at(10) - 36 * 3600 * 1000 };
    const frames = [f("wrote", "src/App.tsx", "claude", 14), f("refused", "package.json", "codex", 13), f("read", "src/cart.ts", "claude", 12), f("PASS", "task 1", "claude", 12, "ok"), f("PASS", "task 2", "claude", 12, "ok"), f("join", "delivered", "claude", 11), f("widget", "kanban", "you", 9), yesterday].sort((a, b) => b.t - a.t);
    const s = daySummary(frames, 2);
    expect(s.startsWith("today · 2 agents · 1 write · 1 refused · 1 read · 2 pass · 0 fail · 1 goal step · 1 widget")).toBe(true);
    expect(s).toContain("— last: claude wrote src/App.tsx");
    expect(s).not.toContain("old.ts");
  });
  it("says so when nothing happened yet", () => {
    expect(daySummary([], 0)).toBe("nothing on the record yet today");
    expect(daySummary([], 1)).toBe("1 agent · nothing on the record yet today");
  });
  it("truncates a long last item", () => {
    const s = daySummary([f("wrote", "a/very/long/path/that/goes/on/and/on/forever.ts", "claude", 9)], 1);
    expect(s).toMatch(/— last: claude wrote a\/very\/long\/path\/that\/goes\/…$/);
  });
});

// THE MEANING OF A ROW (2026-09-19): every op has one plain sentence; the window shows a legend and each
// row carries its sentence as a tooltip.
import { describeFrame, OP_LEGEND } from "./agents-timeline";
describe("describeFrame — one sentence per row", () => {
  it("names who did what and what it means, for agent ops, goal runs and the operator's own events", () => {
    expect(describeFrame({ t: 0, agent: "✦ #1", glyph: "✎", op: "wrote", text: "src/a.ts · 3f2a", tone: "warn" })).toBe("✦ #1 wrote src/a.ts · 3f2a — the agent changed a file — the sha is the content it left; click to review");
    expect(describeFrame({ t: 0, agent: "✦ #1", glyph: "⋔", op: "goal#4 reject t2", text: "tests red", tone: "bad" })).toContain("— a goal run: start · pass · reject · join");
    expect(describeFrame({ t: 0, agent: "you", glyph: "◆", op: "opened", text: "design capture · 3 screens", tone: "fg" })).toBe("you opened design capture · 3 screens — you opened a widget, a file or a capture");
    expect(describeFrame({ t: 0, agent: "✦ #2", glyph: "…", op: "unknown-op", text: "x", tone: "dim" })).toBe("✦ #2 unknown-op x");
  });
  it("the legend covers every op mergeTimeline can emit", () => {
    for (const op of ["read", "pack", "grep", "wrote", "refused", "ran", "goal", "opened", "saved", "widget", "artefact"]) expect(OP_LEGEND.some((l) => l.op === op)).toBe(true);
  });
});

import { mergeTimeline } from "./agents-timeline";
describe("mergeTimeline — the sub-agents' tools ride the timeline", () => {
  it("each task's CLI tools become frames on the sub-agent's own lane, spread over its running time", () => {
    const run: any = { id: 7, events: [{ t: 1000, kind: "start", text: "wave 1", task: "t1" }], tasks: [{ id: "t1", started: 1000, ended: 5000, trace: { tools: [{ name: "Read", target: "src/a.ts" }, { name: "Grep", target: "foo" }, { name: "Edit", target: "src/a.ts" }] } }, { id: "t2", started: null, trace: { tools: [{ name: "Read", target: "x" }] } }] };
    const frames = mergeTimeline([{ id: 9, kind: "claude-code", idx: 0 }], {}, { 9: [run] });
    const sub = frames.filter((f) => f.agent.endsWith("⋔ t1"));
    expect(sub.map((f) => f.op)).toEqual(["wrote", "grep", "read"]);
    expect(sub.map((f) => f.t)).toEqual([4000, 3000, 2000]);
    expect(frames.some((f) => f.agent.endsWith("⋔ t2"))).toBe(false);
    expect(frames.find((f) => f.op === "goal#7 start t1")).toBeTruthy();
  });
});

import { groupByAgent, historyLine } from "./agents-timeline";
describe("groupByAgent — the agents' history", () => {
  const f = (agent: string, op: string, t: number, tone: TimelineFrame["tone"] = "fg"): TimelineFrame => ({ t, agent, op, glyph: "·", text: op, tone });
  it("one history per agent, newest first, with the counts and the worst tone", () => {
    const hs = groupByAgent([f("Claude #1", "read", 1), f("Codex #2", "wrote", 5, "ok"), f("Claude #1", "refused", 3, "bad"), f("Claude #1", "ran", 2), f("you", "opened", 4)]);
    expect(hs.map((h) => h.agent)).toEqual(["Codex #2", "you", "Claude #1"]);
    const c = hs.find((h) => h.agent === "Claude #1")!;
    expect(c.frames.map((x) => x.t)).toEqual([3, 2, 1]);
    expect(c.counts).toEqual({ reads: 1, writes: 0, refused: 1, ran: 1, goals: 0, other: 0 });
    expect(c.worst).toBe("bad");
    expect(historyLine(c)).toBe("1 read · 1 refused · 1 shell");
    expect(historyLine(hs.find((h) => h.agent === "you")!)).toBe("1 other");
    expect(groupByAgent([])).toEqual([]);
  });
});
