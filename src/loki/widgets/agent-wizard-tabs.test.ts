import { describe, it, expect } from "vitest";
import { visibleWizardTabs, WIZARD_TABS } from "./agent-wizard";

describe("the agent settings rail (operator 2026-10-11: merge and sub-agents are automatic, not for the user)", () => {
  it("hides 'merge & subagents' for a user, shows it in the developer build", () => {
    const user = visibleWizardTabs("overview", false).map((t) => t.key);
    expect(user).not.toContain("subagents");
    expect(user).toEqual(["overview", "role", "scope", "context", "audit", "plans", "checkpoints"]);
    expect(visibleWizardTabs("overview", true).map((t) => t.key)).toContain("subagents");
    expect(visibleWizardTabs("overview", true).length).toBe(WIZARD_TABS.length);
  });
  it("keeps it while it is the open tab: a run that needs an answer or an approval opens it", () => {
    expect(visibleWizardTabs("subagents", false).map((t) => t.key)).toContain("subagents");
  });
  it("the role tab no longer advertises a merge", () => {
    expect(WIZARD_TABS.find((t) => t.key === "role")!.hint).not.toMatch(/its merge/);
  });
});
