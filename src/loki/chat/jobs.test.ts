// THE MERGE NAMES (operator 2026-09-23: "give names for the merges, each agent a special name based on its composition
// and role") and the job codes of the discreet stamp.
import { describe, it, expect } from "vitest";
import { JOB_ORDER, JOB_CODE, JOB_ROLE, jobCode, mergeWord, mergeName, brandOf } from "./jobs";
import { isWinnerRecipe, winnerJobOf, winnerRecipeOf } from "./agents-tab";

describe("merge names", () => {
  it("composition = the brain's brand + the hands' suffix as one word; one brand when both sides match or one is raw", () => {
    expect(mergeWord("claude-code:opus", "opencode:opencode/deepseek-v4-flash")).toBe("ClaudeSeek");
    expect(mergeWord("opencode:opencode/kimi-k2.7-code", "opencode:opencode/deepseek-v4-flash")).toBe("KimiSeek");
    expect(mergeWord("claude-code:sonnet", "opencode:opencode/qwen3.6-plus")).toBe("ClaudeQwen");
    expect(mergeWord("codex:medium", "opencode:opencode/deepseek-v4-pro")).toBe("CodexSeek");
    expect(mergeWord("opencode:opencode/deepseek-v4-pro", "opencode:opencode/deepseek-v4-flash")).toBe("DeepSeek");
    expect(mergeWord("raw", "opencode:opencode/qwen3.6-plus")).toBe("Qwen");
    expect(mergeWord("claude-code:opus", "-")).toBe("Claude");
    expect(mergeWord("raw", "-")).toBe("—");
    expect(brandOf("opencode:opencode/glm-5")).toBe("GLM");
  });
  it("role = the job's title: KimiSeek Builder, Qwen Tinker, ClaudeSeek Architect", () => {
    expect(mergeName("editor-l", "opencode:opencode/kimi-k2.7-code", "opencode:opencode/deepseek-v4-flash")).toBe("KimiSeek Builder");
    expect(mergeName("editor-s", "raw", "opencode:opencode/qwen3.6-plus")).toBe("Qwen Tinker");
    expect(mergeName("planner", "claude-code:opus", "opencode:opencode/deepseek-v4-flash")).toBe("ClaudeSeek Architect");
    for (const j of JOB_ORDER) { expect(JOB_ROLE[j]).toBeTruthy(); expect(JOB_CODE[j]).toMatch(/^[A-Z]{2}$/); }
    expect(new Set(Object.values(JOB_CODE)).size).toBe(JOB_ORDER.length);
    expect(jobCode("qa-gate")).toBe("QA"); expect(jobCode("weird")).toBe("WE");
  });
  it("a winner recipe is known by its ★ and its description, whatever its name", () => {
    const rc = { slug: "kimiseek-builder", name: "KimiSeek Builder", icon: "★", description: "The editor-l winner of the benchmarks: Kimi × DeepSeek Flash — 145 s · $0.008 per run." } as any;
    expect(winnerJobOf(rc)).toBe("editor-l"); expect(isWinnerRecipe(rc)).toBe(true);
    expect(isWinnerRecipe({ icon: "★", description: "my own star agent" })).toBe(false);
    expect(isWinnerRecipe({ icon: "🔭", description: "The editor-l winner of the benchmarks" })).toBe(false);
    expect(winnerRecipeOf("editor-l", [rc])).toBe(rc); expect(winnerRecipeOf("planner", [rc])).toBeUndefined();
  });
});

describe("provider + model, always both (operator 2026-09-23)", () => {
  it("names every side with its provider AND its model — never one alone", async () => {
    const { sideName, compositionName, modelName } = await import("./jobs");
    expect(sideName("claude-code:sonnet")).toBe("Claude Sonnet");
    expect(sideName("opencode:opencode/deepseek-v4-flash")).toBe("OpenCode DeepSeek v4 Flash");
    expect(sideName("opencode:opencode/qwen3.6-plus")).toBe("OpenCode Qwen 3.6 Plus");
    expect(sideName("opencode:opencode/kimi-k2.7-code")).toBe("OpenCode Kimi K2.7 Code");
    // a model is never shown without the provider that serves it
    expect(sideName("opencode:opencode/kimi-k2.7-code").startsWith("Kimi")).toBe(false);
    // …and a provider is never shown without a model: when the job picks it, the name says that
    expect(sideName("claude-code")).toBe("Claude · the job's model");
    expect(sideName("codex")).toBe("Codex · the job's model");
    // Codex is a provider: model and effort are separate things
    expect(sideName("codex:gpt-5.6-terra@medium")).toBe("Codex gpt-5.6-terra · medium");
    expect(sideName("codex:gpt-5.6-sol")).toBe("Codex gpt-5.6-sol");
    expect(sideName("codex:high")).toBe("Codex · the account's model · high");
    expect(sideName("raw")).toBe("raw session"); expect(sideName("-")).toBe("—");
    expect(compositionName("codex:gpt-5.6-terra@medium", "opencode:opencode/qwen3.6-plus")).toBe("Codex gpt-5.6-terra · medium × OpenCode Qwen 3.6 Plus");
    expect(compositionName("raw", "opencode:opencode/qwen3.6-plus")).toBe("raw session × OpenCode Qwen 3.6 Plus");
    expect(modelName("opencode/glm-5.3")).toBe("GLM 5.3");
  });
});
