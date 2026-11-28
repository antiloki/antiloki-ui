// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock("@/loki/api/client", () => ({ ...api, BE_URL: "http://x" }));
vi.mock("@/loki/widgets/subagents", () => ({ goalOp: vi.fn(async () => ({ ok: true })) }));
import { FloatingScreening, pendingScreens, paneOfRun } from "./floating-screening";

const run = (id: number, status: string, qs: any[] = [{ id: "q1", text: "Which database?", options: ["sqlite", "postgres"], default: "sqlite" }]): any => ({ id, parent: "3-12", goal: `goal ${id}`, status, questions: qs, tasks: [] });
afterEach(() => { cleanup(); api.apiGet.mockReset(); });
describe("the floating screening card", () => {
  it("picks the runs that wait for an answer and were not put away, and reads the pane from the parent", () => {
    const runs = [run(1, "awaiting-answers"), run(2, "running"), run(3, "awaiting-answers", [{ id: "q", text: "x", answer: "y" }]), run(4, "awaiting-answers")];
    expect(pendingScreens(runs, new Set()).map((r) => r.id)).toEqual([1, 4]); expect(pendingScreens(runs, new Set([1])).map((r) => r.id)).toEqual([4]); expect(paneOfRun({ parent: "3-12" })).toBe(12); expect(paneOfRun({ parent: "" })).toBe(0);
  });
  it("floats the question over the screen, steps between runs, and goes away for a run on Later", { timeout: 100_000 }, async () => {
    api.apiGet.mockResolvedValue({ runs: [run(1, "awaiting-answers"), run(2, "awaiting-answers", [{ id: "q9", text: "Which port?", default: "80" }])] });
    render(<FloatingScreening />); const card = await screen.findByTestId("floating-screening"); await waitFor(() => expect(card).toHaveTextContent("Which database?"), { timeout: 80_000 });   // the answer card is fetched on demand expect(card).toHaveTextContent("1/2");
    fireEvent.click(screen.getByTestId("screening-next")); await waitFor(() => expect(screen.getByTestId("floating-screening")).toHaveTextContent("Which port?"));
    fireEvent.click(screen.getByTestId("screening-later")); await waitFor(() => expect(screen.getByTestId("floating-screening")).toHaveTextContent("Which database?")); expect(screen.queryByTestId("screening-next")).toBeNull();
    fireEvent.click(screen.getByTestId("screening-later")); await waitFor(() => expect(screen.queryByTestId("floating-screening")).toBeNull());
  });
  it("shows nothing when no run waits", async () => {
    api.apiGet.mockResolvedValue({ runs: [run(1, "running")] }); render(<FloatingScreening />); await waitFor(() => expect(api.apiGet).toHaveBeenCalled()); expect(screen.queryByTestId("floating-screening")).toBeNull();
  });
});
