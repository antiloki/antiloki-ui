// @vitest-environment jsdom
// ADD AGENT = A MODEL MERGE (2026-09-23): the recipe wizard's "who" step offers a brain and hands from named models
// (Claude · Codex · DeepSeek · Kimi · Qwen — never "OpenCode"), the provider follows the brain, and the label says
// "X × Y — X decides, Y produces".
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
// THE MACHINE OF 2026-10-01: Claude switched off, Codex is what Heimdall plans on (review of "Engine config also": a new agent opened on Claude x DeepSeek)
const MACHINE = vi.hoisted(() => ({ engines: [{ key: "claude-code", name: "Claude", usable: false, on: false }, { key: "codex", name: "Codex", usable: true, on: true }, { key: "gemini", name: "Gemini", usable: true, on: true },
  { key: "opencode", name: "OpenCode", usable: true, on: true }], heimdall: { effective: "codex" } }));
vi.mock("@/loki/api/client", () => ({ apiGet: vi.fn(async (u: string) => (String(u).includes("settings/providers") ? MACHINE : {})), apiPost: vi.fn(async () => ({ ok: true })) }));
import { MERGE_MODELS, mergeKeyOf, mergeLabel, sideOf, blankRecipe } from "./agent-recipes";
import { AgentRecipeWizard } from "./agent-recipe-wizard";

describe("the recipe merge", () => {
  it("names the seats and three models, none of them a pipe, and labels a pair by family", () => {
    expect(MERGE_MODELS.map((m) => m.label)).toEqual(["Claude", "Codex", "Antigravity", "Grok", "Cursor", "DeepSeek", "Kimi", "Qwen"]);
    expect(MERGE_MODELS.some((m) => /opencode/i.test(m.label))).toBe(false);
    expect(mergeLabel(blankRecipe("codex").pair)).toBe("solo");   // no pair until one is picked - never a placeholder Claude x DeepSeek
    expect(mergeKeyOf(undefined)).toBe(""); expect(mergeKeyOf({ engine: "gemini" })).toBe("gemini"); expect(mergeKeyOf({ engine: "claude-code" })).toBe("claude");
    expect(mergeKeyOf(sideOf("qwen"))).toBe("qwen"); expect(sideOf("qwen").model).toBe("opencode/qwen3.6-plus");
    expect(mergeKeyOf({ engine: "opencode" })).toBe("deepseek");
  });
  it("picking hands or brain changes the pair; the provider is the brain's engine", async () => {
    render(<AgentRecipeWizard onClose={() => {}} onCreated={() => {}} />);
    // a new agent opens on the seat the serve plans on, solo; the switched-off Claude is not offered
    await waitFor(() => expect(screen.getByTestId("recipe-brain-codex")).toHaveAttribute("data-on", "1"));
    expect(screen.getByTestId("recipe-merge-label").textContent).toContain("solo");
    expect(screen.queryByTestId("recipe-brain-claude")).toBeNull();
    expect(screen.getByTestId("recipe-brain-gemini")).toBeTruthy();
    fireEvent.click(screen.getByTestId("recipe-hands-qwen"));
    expect(screen.getByTestId("recipe-merge-label").textContent).toContain("Codex × Qwen");
    expect(screen.getByTestId("recipe-hands-qwen")).toHaveAttribute("data-on", "1");
    fireEvent.click(screen.getByTestId("recipe-brain-deepseek"));
    expect(screen.getByTestId("recipe-merge-label").textContent).toContain("DeepSeek × Qwen — DeepSeek decides, Qwen produces");
    expect(screen.queryByText(/OpenCode/)).toBeNull();
  });
});
