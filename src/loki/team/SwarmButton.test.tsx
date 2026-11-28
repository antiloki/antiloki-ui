// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
const sess = (o: any = {}) => ({ status: "idle", goal: "cost", min_gain_pct: 20, max_trials: 4, budget_usd: 5, spent_usd: 0, started_ms: 0, ended_ms: 0, trials: [], report: "", note: "", ...o });
const state = (o: any = {}) => ({ ok: true, swarm: { width: 4, concurrency: 3 }, config: { goal: "cost", min_gain_pct: 20, max_trials: 4, budget_usd: 5, repeats: 3, seat: "claude-code:haiku" }, session: sess(), running: false, tune: 2, heldout: 3, ...o });
const api = vi.hoisted(() => ({ swarmStatus: vi.fn(), swarmSet: vi.fn(), swarmStart: vi.fn(), swarmStop: vi.fn() }));
vi.mock("./api", () => api);
import { SwarmButton, cellsOf, SWARM_COLOR } from "./SwarmButton";
const t = (n: number, outcome: string, o: any = {}) => ({ n, kind: "model", hypothesis: `idea ${n}`, request: n, outcome, gain_pct: 0, spent_usd: 0.1, why: "", ...o });
beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); });

describe("the swarm button", () => {
  it("is an icon with no words; Setup has the sockets, the squares and the machine bar; it saves what changed and starts", async () => {
    api.swarmStatus.mockResolvedValue(state({ machine: { running: 0, paused: 0, why: "", view: { free_gb: 9.9, total_gb: 15.4, cores: 8, load1: 1.2, pause_under_gb: 2.5, continue_over_gb: 4 } } })); api.swarmSet.mockResolvedValue({ ok: true }); api.swarmStart.mockResolvedValue({ ok: true });
    render(<SwarmButton team="T" />); const b = await screen.findByTestId("swarm-button"); expect(b.getAttribute("data-running")).toBe("0"); expect(b.textContent).toBe(""); fireEvent.click(b);
    expect(screen.getByTestId("swarm-concurrency-value").textContent).toBe("3"); expect(screen.getByTestId("swarm-width-value").textContent).toBe("4"); expect(screen.getByTestId("swarm-machine").textContent).toContain("free 9.9 of"); expect(screen.getByTestId("swarm-note").textContent).toContain("fits");
    fireEvent.click(screen.getByTestId("swarm-concurrency").querySelectorAll("button")[1]); expect(screen.getByTestId("swarm-concurrency-value").textContent).toBe("2"); fireEvent.click(screen.getByTestId("swarm-width").querySelectorAll("button")[5]); expect(screen.getByTestId("swarm-width-value").textContent).toBe("6");
    fireEvent.click(screen.getByTestId("swarm-start")); await waitFor(() => expect(api.swarmStart).toHaveBeenCalledWith("T")); expect(api.swarmSet).toHaveBeenCalledWith("T", { width: 6, concurrency: 2 });
  });
  it("warns when more run at once than the machine holds, and when memory is already short", async () => {
    const view = (free: number) => ({ running: 0, paused: 0, why: "", view: { free_gb: free, total_gb: 15.4, cores: 8, load1: 1, pause_under_gb: 2.5, continue_over_gb: 4 } }); api.swarmStatus.mockResolvedValue(state({ machine: view(6) })); const a = render(<SwarmButton team="T" />); fireEvent.click(await screen.findByTestId("swarm-button"));
    fireEvent.click(screen.getByTestId("swarm-concurrency").querySelectorAll("button")[5]); expect(screen.getByTestId("swarm-note").textContent).toContain("will often hit the memory limit"); a.unmount();
    api.swarmStatus.mockResolvedValue(state({ machine: view(2.1) })); render(<SwarmButton team="T" />); fireEvent.click(await screen.findByTestId("swarm-button")); expect(screen.getByTestId("swarm-note").textContent).toContain("Only 2.1 GB free");
  });
  it("will not start without tests, and says why", async () => {
    api.swarmStatus.mockResolvedValue(state({ tune: 0, heldout: 0 })); render(<SwarmButton team="T" />); fireEvent.click(await screen.findByTestId("swarm-button"));
    expect(screen.getByTestId("swarm-bank").textContent).toContain("at least 1 practice"); expect((screen.getByTestId("swarm-start") as HTMLButtonElement).disabled).toBe(true);
  });
  it("while it runs: the Results page has the sockets with what runs in each, the waiting ones, the paused notice, the bracket and the winner; Stop stops", async () => {
    const cand = (n: number, passed: number) => ({ stage: "full", candidate: { n, passed } });
    api.swarmStatus.mockResolvedValue(state({ running: true, machine: { running: 1, paused: 1, why: "only 2.1 GB of memory is free", view: null }, session: sess({ status: "running", trials: [t(1, "admitted", { experiment: cand(5, 4), gain_pct: 31, why: "gain 31%" }), t(2, "running"), t(3, "waiting"), t(4, "screened_out", { experiment: { stage: "screened_out", candidate: { n: 1, passed: 0 } } })] }) })); api.swarmStop.mockResolvedValue({ ok: true });
    render(<SwarmButton team="T" />); const b = await screen.findByTestId("swarm-button"); expect(b.getAttribute("data-running")).toBe("1"); expect(b.getAttribute("style")).toContain("rgb(242, 194, 48)"); fireEvent.click(b);
    expect(screen.getByTestId("swarm-slots").textContent).toContain("idea 2"); expect(screen.getByTestId("swarm-slots").textContent).toContain("||"); expect(screen.getByTestId("swarm-queue").textContent).toContain("idea 3"); expect(screen.getByTestId("swarm-paused").textContent).toContain("only 2.1 GB");
    const cells = (n: number) => Array.from(screen.getByTestId(`swarm-row-${n}`).querySelectorAll("[data-cell]")).map((e) => e.getAttribute("data-cell")); expect(cells(2)).toEqual(["run"]); expect(cells(3)).toEqual(["wait"]); expect(cells(4)).toEqual(["fail"]);
    expect(screen.getByTestId("swarm-grid").textContent).toContain("winner"); expect(screen.getByTestId("swarm-grid").textContent).toContain("pass fell"); fireEvent.click(screen.getByTestId("swarm-stop")); await waitFor(() => expect(api.swarmStop).toHaveBeenCalledWith("T"));
  });
  it("cellsOf: passed first, then failed; capped; an error is one red square; nothing for an empty one", () => {
    expect(cellsOf({ outcome: "not_admitted", experiment: { candidate: { n: 3, passed: 1 } } })).toEqual(["pass", "fail", "fail"]); expect(cellsOf({ outcome: "not_admitted", experiment: { candidate: { n: 999, passed: 999 } } }).length).toBe(60);
    expect(cellsOf({ outcome: "error" })).toEqual(["fail"]); expect(cellsOf({ outcome: "proposed" })).toEqual([]); expect(SWARM_COLOR).toBe("#f2c230");
  });
  it("renders nothing when the serve is too old to know swarms", async () => { api.swarmStatus.mockResolvedValue({ ok: false }); const r = render(<SwarmButton team="T" />); await new Promise((x) => setTimeout(x, 30)); expect(r.container.textContent).toBe(""); });
});
