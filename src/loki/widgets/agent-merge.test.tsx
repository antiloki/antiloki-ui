// @vitest-environment jsdom
// THE MERGE IN STUDIO › AGENTS (2026-09-22): a pair is two engines making one agent — brain × hands — saved as
// settings.pair. What must hold: the built-ins render with their measurement notes, choosing one writes the pair
// with its sides, solo writes "solo", the label names the families (Kimi by its model), a custom pair saves both sides.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const posts: any[] = [];
// THE MACHINE OF 2026-10-01: Claude switched off, Codex is what Heimdall plans on - the custom merge opens on it, not on Claude x OpenCode (review of "Engine config also")
const MACHINE = vi.hoisted(() => ({ engines: [{ key: "claude-code", name: "Claude", usable: false, on: false }, { key: "codex", name: "Codex", usable: true, on: true }, { key: "opencode", name: "OpenCode", usable: true, on: true }], heimdall: { effective: "codex" } }));
vi.mock("@/loki/api/client", () => ({
  apiPost: vi.fn(async (_p: string, b: any) => { posts.push(b); return { result: { pane: { id: 7, settings_json: JSON.stringify(b.settings) } } }; }),
  apiGet: vi.fn(async (u: string) => (String(u).includes("settings/providers") ? MACHINE : {})),
  unwrapResult: (r: any) => r?.result ?? r,
}));
import { MergeConfig, readPair, pairLabel, PAIR_BUILTINS } from "./agent-wizard";

const pane = (settings: any) => ({ id: 7, pane_kind: "claude-code", settings_json: JSON.stringify(settings) } as any);
beforeEach(() => { posts.length = 0; });

describe("the merge", () => {
  it("reads a name, a shape, or solo — and labels by family", () => {
    expect(readPair({})).toBeNull();
    expect(readPair({ pair: "solo" })).toBeNull();
    expect(pairLabel(readPair({ pair: "claude-deepseek" }))).toBe("Claude × DeepSeek");
    expect(pairLabel(readPair({ pair: "kimi-deepseek" }))).toBe("Kimi × DeepSeek"); // Kimi is a brain (2026-09-23): as hands every arm 404d
    expect(pairLabel(readPair({ pair: { name: "mine", brain: { engine: "codex", model: "high" }, hands: { engine: "opencode", model: "opencode/glm-5.3" } } }))).toBe("Codex × GLM");
    expect(PAIR_BUILTINS.every((b) => b.note.length > 20)).toBe(true);
  });

  it("choosing a built-in writes the pair with its sides; solo writes solo", async () => {
    const onSaved = vi.fn();
    render(<MergeConfig pane={pane({})} onSaved={onSaved} />);
    expect(screen.getByTestId("merge-now").textContent).toBe("solo");
    fireEvent.click(screen.getByTestId("merge-claude-deepseek"));
    await waitFor(() => expect(posts[0].settings.pair).toEqual({ name: "claude-deepseek", brain: { engine: "claude-code" }, hands: { engine: "opencode" } }));
    expect(onSaved).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("merge-solo"));
    await waitFor(() => expect(posts[1].settings.pair).toBe("solo"));
  });

  it("a custom pair saves the brain and the hands the operator picked", async () => {
    render(<MergeConfig pane={pane({ pair: "claude-deepseek" })} onSaved={() => {}} />);
    expect(screen.getByTestId("merge-now").textContent).toBe("Claude × DeepSeek");
    fireEvent.click(screen.getByTestId("merge-custom"));
    // both halves open on the seat the serve plans on; the hands are changed to OpenCode on purpose
    await waitFor(() => expect((screen.getByTestId("merge-brain-engine") as HTMLSelectElement).value).toBe("codex"));
    expect((screen.getByTestId("merge-hands-engine") as HTMLSelectElement).value).toBe("codex");
    fireEvent.change(screen.getByTestId("merge-hands-engine"), { target: { value: "opencode" } });
    fireEvent.change(screen.getByTestId("merge-hands-model"), { target: { value: "opencode/kimi-k2.7-code" } });
    fireEvent.click(screen.getByTestId("merge-custom-save"));
    await waitFor(() => expect(posts[0].settings.pair).toEqual({ name: "custom", brain: { engine: "codex" }, hands: { engine: "opencode", model: "opencode/kimi-k2.7-code" } }));
  });
});

describe("never two frontier models (operator 2026-09-23)", () => {
  it("names the pairs it refuses and lets every other one through", async () => {
    const { pairProblem, isFrontierKey, MERGE_MODELS } = await import("./agent-recipes");
    expect(isFrontierKey("claude")).toBe(true); expect(isFrontierKey("codex")).toBe(true);
    for (const k of ["gemini", "grok", "cursor"]) expect(isFrontierKey(k)).toBe(true);
    for (const k of ["deepseek", "kimi", "qwen"]) expect(isFrontierKey(k)).toBe(false);
    expect(pairProblem("claude", "codex")).toMatch(/both frontier/);
    expect(pairProblem("codex", "claude")).toMatch(/both frontier/);
    expect(pairProblem("claude", "deepseek")).toBeNull();   // the shape a merge is meant to have
    expect(pairProblem("codex", "qwen")).toBeNull();
    expect(pairProblem("deepseek", "qwen")).toBeNull();     // two cheap ones is allowed
    expect(MERGE_MODELS.filter((m) => m.frontier).map((m) => m.key)).toEqual(["claude", "codex", "gemini", "grok", "cursor"]);
  });
});

describe("pairLabel never calls an unknown seat Claude (audit 2026-10-01)", () => {
  it("names the engine it was given, capitalised, and Claude only for Claude", () => {
    expect(pairLabel({ name: "x", brain: { engine: "claude-code" }, hands: { engine: "cursor" } } as any)).toBe("Claude × Cursor");
    expect(pairLabel({ name: "x", brain: { engine: "futurecli" as any }, hands: { engine: "codex" } })).toBe("Futurecli × Codex");
  });
});
