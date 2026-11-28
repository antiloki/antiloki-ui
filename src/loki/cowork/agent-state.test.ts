import { describe, it, expect } from "vitest";
import { sections, noteViewing, ownStatus, effectiveStatuses, foldSummary, kidsOf, teamGroups, RANK, type AgentRow, type AgentStatus } from "./agent-state";

const R = (id: string, status: AgentRow["status"], parent?: string): AgentRow => ({ id, name: id, status, parent });
const none = new Set<string>();

describe("sections", () => {
  it("orders by urgency and leaves empty sections out", () => {
    const s = sections([R("a", "idle"), R("b", "working"), R("c", "blocked")], none, null);
    expect(s.map((x) => x.label)).toEqual(["Needs you", "Working", "Idle"]);
  });
  it("puts Done between Needs you and Working", () => {
    expect(sections([R("a", "working"), R("b", "done"), R("c", "blocked")], none, null).map((x) => x.status)).toEqual(["blocked", "done", "working"]);
  });
  it("an empty list has no sections", () => { expect(sections([], none, null)).toEqual([]); });
  it("keeps the order rows came in within a section", () => {
    const s = sections([R("x", "working"), R("y", "working")], none, null);
    expect(s[0].rows.map((r) => r.id)).toEqual(["x", "y"]);
  });
});

describe("a parent takes its most urgent sub-agent's place", () => {
  it("a blocked sub-agent makes its parent Needs you, and the sub-agent is not a row of its own", () => {
    const rows = [R("backender", "working"), R("migrate", "blocked", "backender")];
    const s = sections(rows, none, null);
    expect(s).toHaveLength(1); expect(s[0].status).toBe("blocked"); expect(s[0].rows.map((r) => r.id)).toEqual(["backender"]);
    expect(kidsOf(rows, "backender").map((r) => r.id)).toEqual(["migrate"]);
  });
  it("a sub-agent is never done: its done is idle, and the parent's own state stands", () => {
    const eff = effectiveStatuses([R("p", "working"), R("k", "done", "p")], none, null);
    expect(eff.get("p")).toBe("working");
  });
  it("a working sub-agent lifts an idle parent to Working", () => {
    expect(effectiveStatuses([R("p", "idle"), R("k", "working", "p")], none, null).get("p")).toBe("working");
  });
  it("a sub-agent whose parent is not listed is shown on its own", () => {
    expect(sections([R("k", "working", "ghost")], none, null)[0].rows.map((r) => r.id)).toEqual(["k"]);
  });
});

describe("a finished agent you looked at stays in Done until you leave it", () => {
  it("unseen done stays Done", () => { expect(ownStatus(R("a", "done"), none, null)).toBe("done"); });
  it("while focused, a seen done agent stays in Done", () => {
    const seen = noteViewing(none, [R("a", "done")], "a");
    expect(ownStatus(R("a", "done"), seen, "a")).toBe("done");
    expect(sections([R("a", "done")], seen, "a")[0].status).toBe("done");
  });
  it("once focus moves on, it turns idle", () => {
    const seen = noteViewing(none, [R("a", "done"), R("b", "idle")], "a");
    expect(sections([R("a", "done"), R("b", "idle")], seen, "b").map((s) => s.status)).toEqual(["idle"]);
  });
  it("an agent that goes back to work is forgotten, so its next done is news again", () => {
    let seen = noteViewing(none, [R("a", "done")], "a");
    seen = noteViewing(seen, [R("a", "working")], "b");
    expect(seen.has("a")).toBe(false);
    expect(ownStatus(R("a", "done"), seen, "b")).toBe("done");
  });
  it("noteViewing returns the same set when nothing changed", () => {
    const seen = noteViewing(none, [R("a", "done")], "a");
    expect(noteViewing(seen, [R("a", "done")], "a")).toBe(seen);
  });
});

describe("folded groups", () => {
  it("say how many and the most urgent state", () => {
    expect(foldSummary([R("a", "idle"), R("b", "blocked"), R("c", "working")], none, null)).toEqual({ count: 3, top: "blocked" });
    expect(foldSummary([], none, null)).toEqual({ count: 0, top: "idle" });
  });
  it("ranks blocked over done over working over idle", () => { expect(RANK.blocked > RANK.done && RANK.done > RANK.working && RANK.working > RANK.idle).toBe(true); });
});

describe("the team subsections", () => {
  const row = (id: string, status: AgentStatus, o: Partial<AgentRow> = {}): AgentRow => ({ id, name: id, status, ...o });
  it("take a team's members out of the status sections, planner first, each keeping its own status, with the most urgent on the header", () => {
    const rows = [row("q", "idle", { team: "k", teamName: "Night shift", role: "qa" }), row("w", "working", { team: "k", teamName: "Night shift", role: "worker" }), row("p", "blocked", { team: "k", teamName: "Night shift", role: "planner" }), row("x", "idle")];
    const g = teamGroups(rows, new Set(), null); expect(g).toHaveLength(1); expect(g[0].name).toBe("Night shift"); expect(g[0].rows.map((r) => r.id)).toEqual(["p", "w", "q"]); expect(g[0].top).toBe("blocked");
    expect(sections(rows, new Set(), null).flatMap((s) => s.rows.map((r) => r.id))).toEqual(["x"]);
    expect(teamGroups([row("x", "idle")], new Set(), null)).toEqual([]);
  });
});
