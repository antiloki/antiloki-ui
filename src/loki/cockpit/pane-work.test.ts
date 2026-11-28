// THIS PANE'S OWN WORK (operator 2026-09-25: "on the sidebar right of the agent pane should have the icon to
// see the diff done on that pane, and another to see the commits done on that pane. Only on that pane").
import { describe, it, expect } from "vitest";
import { whenShort, workLine, type PaneWork, type Commit } from "./pane-work";

const commit = (p: Partial<Commit> = {}): Commit => ({ sha: "a1b2c3", when: "2026-09-25 14:02", who: "dane", subject: "a change", ...p });
const work = (p: Partial<PaneWork> = {}): PaneWork => ({ ok: true, cwd: "/box", changed: 0, diff: { files: [], note: "" }, commits: [], ...p });

describe("a pane's own work", () => {
  it("shows a time for today and a date for anything older", () => {
    const today = new Date(2026, 8, 25);          // month is 0-based: September
    expect(whenShort("2026-09-25 14:02", today)).toBe("14:02");
    expect(whenShort("2026-09-17 09:41", today)).toBe("17/09 09:41");
    expect(whenShort("not a date", today)).toBe("not a date");   // passed through, never invented
  });

  it("tells a clean box from an unread one — they are different facts", () => {
    // NOTHING YET vs NOTHING CHANGED: a blank panel makes the operator guess which, and the whole point of
    // this rail is to answer without being asked.
    expect(workLine(undefined, "diff")).toBe("reading this box…");
    expect(workLine(work(), "diff")).toBe("nothing changed since the last commit");
    expect(workLine(work({ changed: 1 }), "diff")).toBe("1 file changed and not yet committed");
    expect(workLine(work({ changed: 4 }), "diff")).toBe("4 files changed and not yet committed");
  });

  it("counts commits on this agent's branch, and says so when there are none", () => {
    expect(workLine(work(), "commits")).toBe("no commits on this branch yet");
    expect(workLine(work({ commits: [commit()] }), "commits")).toBe("1 commit on this agent's branch");
    expect(workLine(work({ commits: [commit(), commit({ sha: "d4e5f6" })] }), "commits")).toBe("2 commits on this agent's branch");
  });

  it("a failed read is not a clean box", () => {
    expect(workLine(null, "diff")).toBe("reading this box…");
  });
});
