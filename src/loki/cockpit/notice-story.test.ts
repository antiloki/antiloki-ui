// THE NOTIFICATION WINDOW (operator 2026-09-24: "the notification window is completely confuse i dont understand
// anything there"). The real data explains why: the same message filed twice a second apart, raw crash text with
// a `[route-error]` prefix nobody outside the code would recognise, and wall-clock strings.
import { describe, it, expect } from "vitest";
import { groupNotices, readNotice, timeAgo, parseTs, agentGroups } from "./notice-story";

const NOW = new Date(2026, 8, 24, 12, 0, 0).getTime();
const at = (h: number, m: number, s = 0) => `2026-09-24 ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

describe("when it happened", () => {
  it("parses the serve's own format — which new Date() does not, on Safari", () => {
    expect(parseTs("2026-09-24 11:52:41")).toBe(new Date(2026, 8, 24, 11, 52, 41).getTime());
    expect(parseTs("2026-09-24T11:52:41Z")).toBe(new Date(2026, 8, 24, 11, 52, 41).getTime());
    expect(parseTs("nonsense")).toBeNull();
    expect(timeAgo(undefined, NOW)).toBe("");
  });
  it("says it the way a person would", () => {
    expect(timeAgo(at(11, 59, 40), NOW)).toBe("just now");
    expect(timeAgo(at(11, 52), NOW)).toBe("8 min ago");
    expect(timeAgo(at(9, 0), NOW)).toBe("3 h ago");
    // under a day stays in hours — "16 h ago" tells the operator more than "yesterday" does
    expect(timeAgo("2026-09-23 20:00:00", NOW)).toBe("16 h ago");
    expect(timeAgo("2026-09-23 06:00:00", NOW)).toBe("yesterday");
    // older than two days falls back to the date, in whatever order the viewer's locale writes one
    expect(timeAgo("2026-09-20 20:00:00", NOW)).toBe(new Date(2026, 8, 20, 20).toLocaleDateString([], { day: "numeric", month: "short" }));
  });
});

describe("what a row actually means", () => {
  it("names antiloki's own crash as antiloki's, because an operator cannot know that from a stack trace", () => {
    const n = readNotice({ id: 121, ts: at(11, 52, 41), severity: "warn", message_md: "[route-error] baseModels is not defined" }, NOW);
    expect(n.group).toBe("antiloki");
    expect(n.text).toBe("antiloki's own interface hit an error: baseModels is not defined");
    expect(n.raw).toBe("[route-error] baseModels is not defined");   // the original is never thrown away
    expect(n.tone).toBe("warn");
  });
  it("a question waiting on the operator is filed as such", () => {
    expect(readNotice({ message_md: "a plan of 9 tasks waits for your approval" }, NOW).group).toBe("you");
    expect(readNotice({ message_md: "2 questions waiting for you" }, NOW).group).toBe("you");
    expect(readNotice({ message_md: "run #75 finished" }, NOW).group).toBe("work");
    expect(readNotice({ severity: "error", message_md: "x" }, NOW).tone).toBe("bad");
  });
});

describe("the window's content", () => {
  it("folds a message the serve filed twice into one row with a count", () => {
    const g = groupNotices([
      { id: 121, ts: at(11, 52, 41), severity: "warn", message_md: "[route-error] baseModels is not defined" },
      { id: 120, ts: at(11, 52, 41), severity: "warn", message_md: "[route-error] baseModels is not defined" },
      { id: 119, ts: at(11, 30, 0), severity: "warn", message_md: "[route-error] Episodes is not defined" },
    ], NOW);
    expect(g.map((x) => x.key)).toEqual(["antiloki"]);
    expect(g[0].items.length).toBe(2);
    expect(g[0].items[0].count).toBe(2);
    expect(g[0].items[1].count).toBe(1);
    expect(g[0].blurb).toContain("not in your code");
  });

  it("puts what needs an answer above what merely happened, and antiloki's own faults last", () => {
    const g = groupNotices([
      { id: 1, ts: at(9, 0), message_md: "[route-error] boom" },
      { id: 2, ts: at(10, 0), message_md: "run #75 finished" },
      { id: 3, ts: at(8, 0), message_md: "a plan of 9 tasks waits for your approval" },
    ], NOW);
    expect(g.map((x) => x.key)).toEqual(["you", "work", "antiloki"]);
    expect(g[0].heading).toBe("waiting on you");
    expect(g[0].items[0].ago).toBe("4 h ago");
  });

  it("the same text an hour apart is two events, not one", () => {
    const g = groupNotices([
      { id: 1, ts: at(11, 0), message_md: "the build failed" },
      { id: 2, ts: at(10, 0), message_md: "the build failed" },
    ], NOW);
    expect(g[0].items.length).toBe(2);
    expect(g[0].items.every((i) => i.count === 1)).toBe(true);
  });

  it("an empty list produces no headings at all", () => { expect(groupNotices([], NOW)).toEqual([]); });
});

describe("the agents column asks the same question", () => {
  it("splits by what each agent wants from the operator, and drops the empty groups", () => {
    const a = (o: any) => o;
    const g = agentGroups([
      a({ run: { status: "awaiting-approval" } }),
      a({ busy: true }),
      a({ run: { status: "running" } }),
      a({ running: true }),
      a({ run: { status: "done" } }),
    ]);
    expect(g.map((x) => [x.key, x.items.length])).toEqual([["ask", 1], ["busy", 2], ["quiet", 2]]);
    expect(agentGroups([]).length).toBe(0);
    // an agent that is busy AND asking belongs in "waiting on you" — the answer is what unblocks it
    expect(agentGroups([a({ busy: true, run: { status: "awaiting-answers" } })]).map((x) => x.key)).toEqual(["ask"]);
  });
});
