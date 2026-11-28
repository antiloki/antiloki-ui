// @vitest-environment jsdom
// JOB WINNERS (2026-09-23): per job, the first-place merge from the benchmarks, stamped with the job; a job without a
// winner still has its row; "＋ agent" makes a recipe with the winner's pair.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
const saved: any[] = [];
vi.mock("@/loki/widgets/agent-recipes", () => ({ saveRecipe: vi.fn(async (r: any) => { saved.push(r); return { ok: true, recipe: { ...r, slug: "kimi-x-deepseek-flash-editor-l" } }; }) }));
vi.mock("@/loki/api/client", () => ({ apiGet: vi.fn(async () => ({})), apiPost: vi.fn(async () => ({})) }));
vi.mock("@/loki/api/hooks", () => ({ usePoll: () => ({ data: null, refetch: () => {} }) }));
vi.mock("@/loki/widgets/cockpit-pane-body", () => ({ CockpitPaneBody: () => null }));
vi.mock("./widget-dock", () => ({ Slide: ({ children }: any) => <div>{children}</div> }));
vi.mock("./chats-tab", () => ({ ago: () => "now", useChatsTab: () => ({ side: null, stage: null, chat: null }) }));
import { JobWinners, jobWinners, winnerLabel, sideFromKey, sizeWord, JOB_ORDER } from "./agents-tab";

const row = (o: any) => ({ job: "editor-l", size: "l", planner: "opencode:opencode/kimi-k2.7-code", worker: "opencode:opencode/deepseek-v4-flash", qa: "", n: 1, audit: 1, s: 163, usd: 0.04, weight: 0.63, source: "bench", ...o });

describe("job winners", () => {
  it("picks the first place per job across sizes, never a per-call row, and leaves unmeasured jobs empty", () => {
    const rows = [row({}), row({ planner: "claude-code:opus", weight: 0.61 }), row({ size: "xxl", planner: "claude-code:sonnet", weight: 0.72 }), row({ job: "editor-s", size: "call", weight: 0.99 })];
    const w = jobWinners(rows);
    expect(w.map((x) => x.job)).toEqual([...JOB_ORDER]);
    expect(w.find((x) => x.job === "editor-l")!.row!.planner).toBe("claude-code:sonnet"); // the xxl row weighs most
    expect(w.find((x) => x.job === "editor-s")!.row).toBeNull();                         // `call` rows are not winners
    expect(winnerLabel(row({}))).toBe("OpenCode Kimi K2.7 Code × OpenCode DeepSeek v4 Flash"); // provider + model, both sides (2026-09-23)
    expect(winnerLabel(row({ planner: "raw", worker: "claude-code:sonnet" }))).toBe("raw session × Claude Sonnet");
    expect(sideFromKey("opencode:opencode/qwen3.6-plus")).toEqual({ engine: "opencode", model: "opencode/qwen3.6-plus" });
    expect(sideFromKey("raw")).toBeNull();
  });
  it("names every job and makes an agent out of a winner", async () => {
    const onMade = vi.fn();
    const { container } = render(<JobWinners rows={[row({})]} onMade={onMade} busy={false} />);
    // THE STAMP CAME OFF THE FACE (2026-09-23: "they are ugly") — the job reads as a word in the line beneath,
    // and nothing is drawn on top of the avatar
    expect(screen.getByTestId("winner-editor-l").textContent).toContain("EL");
    expect(container.querySelector("[data-testid='winner-editor-l'] svg")).toBeTruthy();
    expect(screen.getByTestId("winner-lookup").getAttribute("data-measured")).toBe("0");
    expect(screen.getByTestId("winner-lookup").textContent).toContain("no winner yet");
    fireEvent.click(screen.getByTestId("winner-editor-l-make"));
    await waitFor(() => expect(saved[0].pair).toEqual({ name: "winner", brain: { engine: "opencode", model: "opencode/kimi-k2.7-code" }, hands: { engine: "opencode", model: "opencode/deepseek-v4-flash" } }));
    expect(saved[0].name).toBe("KimiSeek Builder"); expect(saved[0].description).toMatch(/^The editor-l winner of the benchmarks/);
    expect(onMade).toHaveBeenCalledWith("kimi-x-deepseek-flash-editor-l");
  });
});

describe("winners fall back to audited calls (2026-09-23: 'some winners have no data — make the experiments')", () => {
  it("a job without a sized row takes its best audited-call row with n ≥ 2; one call is not a winner", () => {
    const base = { qa: "", audit: null, s: 10, usd: 0.01, source: "run" } as any;
    const rows = [
      { ...base, job: "verifier", size: "call", planner: "claude-code:sonnet", worker: "-", n: 3, weight: 0.7 },
      { ...base, job: "verifier", size: "call", planner: "opencode:opencode/deepseek-v4-pro", worker: "-", n: 5, weight: 0.6 },
      { ...base, job: "qa-gate", size: "call", planner: "claude-code:opus", worker: "-", n: 1, weight: 0.9 },
      { ...base, job: "planner", size: "l", planner: "claude-code:opus", worker: "opencode:opencode/deepseek-v4-flash", n: 1, weight: 0.3 },
      { ...base, job: "planner", size: "call", planner: "claude-code:sonnet", worker: "-", n: 9, weight: 0.95 },
    ];
    const w = Object.fromEntries(jobWinners(rows).map(({ job, row }) => [job, row]));
    expect(w.verifier?.planner).toBe("claude-code:sonnet"); expect(w.verifier?.size).toBe("call");
    expect(w["qa-gate"]).toBeNull();
    expect(w.planner?.size).toBe("l"); // a sized row outranks any call row
    expect(sizeWord("call")).toBe("audited calls"); expect(sizeWord("l")).toBe("l");
  });
});
