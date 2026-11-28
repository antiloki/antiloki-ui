// AGENT RECIPES (2026-09-20): the pure parts of the operator's own agents.
import { describe, it, expect, vi } from "vitest";
vi.mock("@/loki/api/client", () => ({ apiGet: vi.fn(async () => null), apiPost: vi.fn(async () => null), unwrapResult: (r: any) => r }));
import { blankRecipe, recipeProblems, recipeSettings, archiveRecipe, sideOf } from "./agent-recipes";
import { recipeSettingsOf } from "./cockpit-pane-body";

describe("recipes", () => {
  it("refuses without a name, a provider and a scope", () => {
    // the provider is the seat the serve plans on (review 2026-10-01: it was a fixed Claude); with none known the recipe says so instead of guessing
    // A NEW AGENT STARTS WITH THE WHOLE PROJECT (operator 2026-10-11): only the name is missing; narrowing is the user's act
    expect(blankRecipe("cursor").scope).toEqual(["**"]);
    expect(recipeProblems(blankRecipe("cursor"))).toEqual(["a name"]);
    expect(recipeProblems({ ...blankRecipe("cursor"), name: "x", scope: [] })).toEqual(["a default scope (the files it may edit)"]);
    expect(blankRecipe("gemini").provider).toBe("gemini");
    expect(recipeProblems(blankRecipe())).toContain("a provider");
    expect(blankRecipe("codex").pair).toBeUndefined();
    expect(recipeProblems({ ...blankRecipe("cursor"), name: "Docs", scope: ["docs/**"] })).toEqual([]);
    expect(recipeProblems({ ...blankRecipe("cursor"), name: "x", scope: ["a"], provider: "gpt" as any })).toEqual(["a provider"]);
  });
  it("becomes pane settings: the theme, the recipe slug, and the availability lists only when narrowed", () => {
    expect(recipeSettings({ ...blankRecipe("cursor"), slug: "docs", name: "Docs", scope: ["docs/**"], theme: "mac" })).toEqual({ recipe: "docs", theme: "mac" });
    expect(recipeSettings({ ...blankRecipe("cursor"), slug: "r", name: "R", scope: ["a"], specialists: ["axis:docs"], skills: ["fix"] })).toEqual({ recipe: "r", specialists: ["axis:docs"], skills: ["fix"] });
    expect(recipeSettingsOf({ slug: "r", name: "R", icon: "🤖", theme: "xp", specialists: [], skills: ["fix"] })).toEqual({ recipe: "r", theme: "xp", skills: ["fix"] });
    expect(recipeSettingsOf(undefined)).toBeUndefined();
  });
});

describe("archiving", () => {
  it("an archive the serve never confirmed (the client answers null on a refusal or a dead serve) is not ok", async () => {
    const r = await archiveRecipe("docs");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

describe("a side that is not a known merge model", () => {
  it("is never Claude: a seat's own key is that seat, anything else is the caller's fallback or the gateway (audit 2026-10-01)", () => {
    expect(sideOf("claude")).toEqual({ engine: "claude-code" });          // a real merge model still resolves
    expect(sideOf("cursor")).toEqual({ engine: "cursor" });
    expect(sideOf("some-future-model").engine).not.toBe("claude-code");
    expect(sideOf("some-future-model", "codex")).toEqual({ engine: "codex" });
  });
});
