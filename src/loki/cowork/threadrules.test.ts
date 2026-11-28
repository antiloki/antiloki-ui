import { describe, it, expect } from "vitest";
import { openRefusal } from "./threadrules";
describe("a team thread holds only the team", () => {
  it("refuses a pane an agent opens there, and says where to open it; an ordinary thread allows it", () => {
    expect(openRefusal("draft-pane-webapp")).toMatch(/holds only the team's own pane.*Main thread/); expect(openRefusal("draft-pane-webapp")).toContain("draft-pane-webapp");
    for (const none of [null, undefined, ""]) expect(openRefusal(none)).toBeNull();
  });
});
