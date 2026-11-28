import { describe, it, expect } from "vitest";
import { treeDrift } from "./thread-drift";
const t = (o: Partial<any> = {}): any => ({ worktree: "/w", branch: "b", ahead: 1, dirty: false, behind: 0, age_days: 0, files: 2, lines: 30, ...o });
describe("a thread that drifted from the workspace", () => {
  it("says nothing for a fresh thread, and names each reason when it has drifted", () => {
    expect(treeDrift(t()).warn).toBe(false); expect(treeDrift(null).warn).toBe(false);
    expect(treeDrift(t({ behind: 12 })).line).toContain("12 commits behind"); expect(treeDrift(t({ behind: 3, age_days: 9 })).line).toContain("9 days ago"); expect(treeDrift(t({ age_days: 30 })).warn).toBe(false);   // old but nothing to catch up on
    expect(treeDrift(t({ lines: 900 })).line).toContain("a big change"); expect(treeDrift(t({ files: 41 })).warn).toBe(true);
    expect(treeDrift(t({ behind: 20, age_days: 10, lines: 2000 })).reasons.length).toBe(3);
  });
});
