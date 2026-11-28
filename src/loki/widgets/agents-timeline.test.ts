// THE AGENTS TIMELINE — every agent's audit + goal-run events as one newest-first trace.
import { describe, it, expect, vi } from "vitest";
vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn(), apiGet: vi.fn() }));
import { mergeTimeline } from "./agents-timeline";

describe("mergeTimeline", () => {
  it("merges reads, writes, refusals, commands and goal events across agents, newest first", () => {
    const panes = [{ id: 6, kind: "claude-code", idx: 0 }, { id: 8, kind: "codex", idx: 2 }];
    const audits: any = {
      6: [
        { t: "2026-09-17T10:00:00Z", tool: "Edit", path: "src/a.ts", kind: "written", op: "write", sha: "ab12" },
        { t: "2026-09-17T10:00:05Z", tool: "Bash", path: "packages/react/x.ts", kind: "blocked", op: "write" },
        { t: "2026-09-17T09:59:00Z", tool: "Read", path: ".antiloki/context/INDEX.md", kind: "pack", op: "read" },
      ],
      8: [{ t: "2026-09-17T10:00:03Z", tool: "shell", path: "npm test", kind: "exec", op: "exec" }],
    };
    const runs: any = { 6: [{ id: 2, events: [{ t: Date.parse("2026-09-17T10:00:04Z"), kind: "pass", task: "t1", text: "met" }] }], 8: [] };
    const f = mergeTimeline(panes, audits, runs);
    expect(f.map((x) => `${x.agent} ${x.op}`)).toEqual(["✦ #1 refused", "✦ #1 goal#2 pass t1", "◇ #3 ran", "✦ #1 wrote", "✦ #1 pack"]);
    expect(f[0].tone).toBe("bad");
    expect(f[3].text).toBe("src/a.ts · ab12");
    expect(mergeTimeline([], {}, {})).toEqual([]);
  });
});

import { laneOf, noteTimeline, readNotes } from "./agents-timeline";
describe("git-graph lanes + operator notes", () => {
  it("you is lane 0, agents get lanes in order of appearance", () => {
    const f = (agent: string): any => ({ t: 1, agent, glyph: "", op: "", text: "", tone: "dim" });
    const { lanes, lane } = laneOf([f("◇ #3"), f("✦ #1"), f("◇ #3")]);
    expect(lanes).toEqual(["you", "◇ #3", "✦ #1"]);
    expect(lane(f("✦ #1"))).toBe(2);
    expect(lane(f("you"))).toBe(0);
  });
  it("noteTimeline records what the operator did, newest first", () => {
    noteTimeline("opened", "graph");
    noteTimeline("saved", "RFC");
    expect(readNotes().slice(0, 2).map((n) => `${n.agent} ${n.op} ${n.text}`)).toEqual(["you saved RFC", "you opened graph"]);
  });
});
