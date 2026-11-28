import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
const sess = (o: any = {}) => ({ status: "idle", goal: "cost", min_gain_pct: 20, max_trials: 5, budget_usd: 2, spent_usd: 0, started_ms: 0, ended_ms: 0, trials: [], report: "", note: "", ...o });
const state = (o: any = {}) => ({ ok: true, config: { goal: "cost", min_gain_pct: 20, max_trials: 5, budget_usd: 2, repeats: 3, seat: "claude-code:haiku" }, session: sess(), running: false, tune: 2, heldout: 3, ...o });
const api = vi.hoisted(() => ({ evolveStatus: vi.fn(), evolveSet: vi.fn(), evolveStart: vi.fn(), evolveStop: vi.fn(), benchmarkOf: vi.fn() }));
vi.mock("./api", () => api);
import { EvolveButton, EVOLVE_COLOR } from "./EvolveButton";

describe("the evolve button", () => {
  it("shows a DNA button; the Setup page has the goal cards, the gain (20), the ideas (5), the budget ($2) and starts a session with what was changed", async () => {
    api.benchmarkOf.mockResolvedValue(null); api.evolveStatus.mockResolvedValue(state()); api.evolveSet.mockResolvedValue({ ok: true, config: {} }); api.evolveStart.mockResolvedValue({ ok: true });
    render(<EvolveButton team="T" />); const b = await screen.findByTestId("evolve-button"); expect(b.getAttribute("data-running")).toBe("0"); expect(b.textContent).toBe(""); fireEvent.click(b);
    expect(screen.getByTestId("evolve-gain-value").textContent).toBe("20"); expect(screen.getByTestId("evolve-trials-value").textContent).toBe("5"); expect(screen.getByTestId("evolve-budget-value").textContent).toBe("2.00"); expect(screen.getByTestId("evolve-mean-word").textContent).toBe("−20%");
    fireEvent.change(screen.getByTestId("evolve-gain"), { target: { value: "30" } }); expect(screen.getByTestId("evolve-mean-word").textContent).toBe("−30%"); fireEvent.click(screen.getByTestId("evolve-goal-time")); expect(screen.getByTestId("evolve-goal-time").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("evolve-trials").querySelectorAll("button")[7]); expect(screen.getByTestId("evolve-trials-value").textContent).toBe("8"); fireEvent.change(screen.getByTestId("evolve-budget"), { target: { value: "500" } }); expect(screen.getByTestId("evolve-budget-value").textContent).toBe("5.00");
    fireEvent.click(screen.getByTestId("evolve-start")); await waitFor(() => expect(api.evolveStart).toHaveBeenCalledWith("T")); expect(api.evolveSet).toHaveBeenCalledWith("T", { goal: "time", min_gain_pct: 30, max_trials: 8, budget_usd: 5 });
  });
  it("says when the budget does not cover the ideas, and blocks Start when it covers none; warns when the bank is empty", async () => {
    api.benchmarkOf.mockResolvedValue(null); api.evolveStatus.mockResolvedValue(state({ tune: 0, heldout: 0 })); const a = render(<EvolveButton team="T" />); fireEvent.click(await screen.findByTestId("evolve-button")); expect(screen.getByTestId("evolve-bank-warn").textContent).toContain("at least 1 practice"); expect((screen.getByTestId("evolve-start") as HTMLButtonElement).disabled).toBe(true); a.unmount();
    api.evolveStatus.mockResolvedValue(state()); render(<EvolveButton team="T" />); fireEvent.click(await screen.findByTestId("evolve-button")); fireEvent.change(screen.getByTestId("evolve-budget"), { target: { value: "75" } });
    expect(screen.getByTestId("evolve-afford").textContent).toContain("2"); expect(screen.getByTestId("evolve-afford-warn").textContent).toContain("Stops after about 2"); fireEvent.change(screen.getByTestId("evolve-budget"), { target: { value: "25" } }); expect(screen.getByTestId("evolve-afford-warn").textContent).toContain("Not even one idea fits"); expect((screen.getByTestId("evolve-start") as HTMLButtonElement).disabled).toBe(true);
  });
  it("while it runs the button is lit, the Results page opens with a gain meter and its noise, and Stop stops", async () => {
    api.benchmarkOf.mockResolvedValue({ versions: [{ id: "a", n: 1 }, { id: "b", n: 2 }, { id: "c", n: 3 }] }); api.evolveStop.mockResolvedValue({ ok: true });
    api.evolveStatus.mockResolvedValue(state({ running: true, session: sess({ status: "running", spent_usd: 0.4, trials: [{ n: 1, kind: "model", hypothesis: "cheaper tier", request: 1, outcome: "not_admitted", gain_pct: 24, sure_pct: 10, spent_usd: 0.1, why: "24% but the noise reaches 10%" }, { n: 2, kind: "x", hypothesis: "second", request: 2, outcome: "running", gain_pct: 0, spent_usd: 0, why: "" }] }) })); render(<EvolveButton team="T" />);
    const b = await screen.findByTestId("evolve-button"); expect(b.getAttribute("data-running")).toBe("1"); expect(b.textContent).toContain("2/5"); fireEvent.click(b);
    expect(screen.getByTestId("evolve-trials-list").textContent).toContain("cheaper tier"); expect(screen.getByTestId("evolve-whisker-1")).toBeTruthy(); expect(screen.getByTestId("evolve-why").textContent).toContain("noise reaches 10%"); expect(screen.getByTestId("evolve-stage").getAttribute("data-stage")).toBe("2");
    await waitFor(() => expect(screen.getByTestId("evolve-lineage").textContent).toContain("v3")); fireEvent.click(screen.getByTestId("evolve-stop")); await waitFor(() => expect(api.evolveStop).toHaveBeenCalledWith("T")); expect(EVOLVE_COLOR).toBe("#d97757");
  });
});
