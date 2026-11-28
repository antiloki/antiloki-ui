import { describe, it, expect } from "vitest";
import { appliedNote, modelLabel, pickList } from "./model-pick";

const M = [{ id: "haiku", label: "haiku" }, { id: "sonnet", label: "sonnet" }, { id: "opus", label: "opus" }, { id: "claude-sonnet-5-5", label: "claude-sonnet-5-5" }];
describe("the model button's rules", () => {
  it("says the chosen model, else the running one, else 'model', and shortens a long id", () => {
    expect(modelLabel("haiku", "Sonnet 5.5")).toBe("haiku"); expect(modelLabel("", "Sonnet 5.5")).toBe("Sonnet 5.5"); expect(modelLabel("", undefined)).toBe("model");
    expect(modelLabel("deepseek/deepseek-v4-pro-with-a-very-long-tail", "")).toMatch(/^deepseek\/deeps….{9}$/);
  });
  it("narrows the list by what is typed and offers a typed id that is not in it", () => {
    expect(pickList(M, "").choices).toHaveLength(4); expect(pickList(M, "").custom).toBeNull();
    expect(pickList(M, "son").choices.map((m) => m.id)).toEqual(["sonnet", "claude-sonnet-5-5"]);
    expect(pickList(M, "gpt-5.6").custom).toBe("gpt-5.6"); expect(pickList(M, "HAIKU").custom).toBeNull();
    expect(pickList(M, "rm -rf /").custom).toBeNull();   // not a model id: never offered, never typed into a terminal
  });
  it("tells what happened after the pick", () => {
    expect(appliedNote("live", "haiku")).toContain("switched to haiku"); expect(appliedNote("restart", "gpt-5.6")).toContain("restarting"); expect(appliedNote("next start", "")).toContain("engine's default");
  });
});
