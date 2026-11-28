// WHAT A TEAM THREAD HOLDS (operator 2026-11-21: "teams only can have 1 pane"): the team's own pane, with the Leader's terminal as a tab inside it, and nothing else. The menus already lock "new pane" on a team thread; an agent that opens a pane through MCP (a free pane it wrote, a terminal, an X-ray view) used to land beside the team and break its layout (the thread grew without end).
// Pure, so the rule is one place and tested.
/** Why an agent cannot open a pane in this thread, or null when it can. `team` is the thread's team (null on an ordinary thread). */
export function openRefusal(team: string | null | undefined): string | null {
  return team ? `this thread is the team \`${team}\`: it holds only the team's own pane. Open the pane in the Main thread (or another ordinary thread) instead, and tell the person where it is.` : null;
}
