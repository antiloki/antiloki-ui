import { describe, expect, it } from "vitest";
import { freeThreadName, onboardKey } from "./new-team";

describe("a new team's own thread", () => {
  it("takes the first name no thread has, whatever the letters' case", () => {
    expect(freeThreadName(["Main"], "New team")).toBe("New team");
    expect(freeThreadName(["Main", "new team", "New team 2"], "New team")).toBe("New team 3");
  });
  it("keeps its note per workspace and thread", () => {
    expect(onboardKey("a", "New team ")).toBe(onboardKey("a", "new team")); expect(onboardKey("a", "New team")).not.toBe(onboardKey("b", "New team"));
  });
});
