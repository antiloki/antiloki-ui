// NEW TEAM (RFC 0008 §4.15, §4.16): the sidebar's "New team". Say in your own words what the team is for, pick the Leader's model, and the Leader (a terminal) asks what it needs to know, then builds the whole team through the MCP:
// its agents, control flow, skills and tools. Nothing is chosen from a menu; a starter template is only a hint you may ask for instead. A team always has a thread of its own, made here with its branch and its saga.

export const TEMPLATES: { key: string; label: string; hint: string }[] = [
  { key: "feature", label: "Feature team", hint: "plan → for each saga: work, tests, QA, audit (advice) → you merge" },
  { key: "bugfix", label: "Bugfix loop", hint: "tests red → debugger → tests, bounded → you merge" },
  { key: "review", label: "Review loop", hint: "QA, a second QA and audit side by side, joined → you merge" },
  { key: "pair", label: "Pair + QA", hint: "a driver writes, a navigator reviews each change, tests run, then an independent QA that never saw them judges → you merge" },
  { key: "strict", label: "Strict", hint: "like the feature team, but audit is a gate: a flag or a block comes to you" },
];
/** A team name from the goal when the person left it empty: the first words, capitalised. Pure. */
export function nameFromGoal(goal: string): string { const w = goal.replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 3).join(" "); return w ? w.charAt(0).toUpperCase() + w.slice(1) : ""; }
/** What the Leader's seat is told to start with, kept for the thread to read once its terminal is up (see CoworkTerminals). */
export const pendingKey = (thread: string) => `antiloki.team.pending.${thread}`;
/** THE LEADER IS ALWAYS A FRONTIER MODEL (operator 2026-11-13): it screens, designs and judges the team, so it is never on a small or local seat. Those are for steps (RFC 0010 §4.5). OpenCode can run any model, local ones included, so it is not offered for the Leader. */
export const LEADER_SEATS = ["claude-code", "codex", "gemini", "grok", "cursor"];
export const leaderSeats = <T extends { key: string }>(l: T[]): T[] => l.filter((e) => LEADER_SEATS.includes(e.key));
export type Pending = { brief: string; engine: string };
