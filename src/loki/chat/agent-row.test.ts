// THE ROW (operator 2026-09-23: "the agents on the sidebar left should be avatar, name and role below. And the base
// agents of the merge discretely" · "all agents should have a role").
import { describe, it, expect } from "vitest";
import { roleName, baseModels } from "./agents-tab";

describe("a role as a person reads it", () => {
  it("turns the key into words", () => {
    expect(roleName("backender")).toBe("Backender");
    expect(roleName("backend-database")).toBe("Backend database");
    expect(roleName("product_owner")).toBe("Product owner");
  });
  it("says so plainly when there is none, rather than showing an empty line", () => {
    expect(roleName("")).toBe("no role");
    expect(roleName(null)).toBe("no role");
    expect(roleName(undefined)).toBe("no role");
  });
});

describe("the base models, discreetly", () => {
  it("keeps the two providers and drops the model names", () => {
    expect(baseModels("Claude · the job's model × OpenCode · the job's model")).toBe("Claude × OpenCode");
    expect(baseModels("Claude · Sonnet × DeepSeek · v4 Flash")).toBe("Claude × DeepSeek");
  });
  it("says nothing for a solo agent, which has no merge to describe", () => {
    expect(baseModels("solo")).toBe("");
    expect(baseModels("")).toBe("");
    expect(baseModels(null)).toBe("");
  });
  it("does not repeat one provider twice", () => {
    expect(baseModels("Claude · Sonnet × Claude · Haiku")).toBe("Claude");
  });
});
