import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as api from "./api";
import { Checkpoints, labelOf } from "./Checkpoints";

describe("checkpoints", () => {
  it("a checkpoint is named by the nodes that finished at it", () => { expect(labelOf({ k: 2, nodes: ["plan", "build"] } as any, { plan: "Plan agreed" })).toBe("Plan agreed, build"); expect(labelOf({ k: 3, nodes: [] } as any)).toBe("step 3"); });
  it("says nothing without checkpoints; a rewind asks first, then starts a new run", async () => {
    vi.spyOn(api, "runCheckpoints").mockResolvedValueOnce([]); const { container, unmount } = render(<Checkpoints run="r1" />); await waitFor(() => expect(api.runCheckpoints).toHaveBeenCalled()); expect(container.textContent).toBe(""); unmount();
    vi.spyOn(api, "runCheckpoints").mockResolvedValue([{ k: 1, nodes: ["plan"], spent_usd: 0.1, t_ms: 1, runs: [] }, { k: 2, nodes: ["build"], spent_usd: 0.3, t_ms: 2, runs: ["r1-r1"] }]);
    const rw = vi.spyOn(api, "runRewind").mockResolvedValue({ ok: true, run: "r1-r2" } as any); const done = vi.fn();
    render(<Checkpoints run="r1" onRewound={done} />); fireEvent.click(await screen.findByTestId("rewind-1")); expect(rw).not.toHaveBeenCalled();
    expect(screen.getByTestId("rewind-ask-1").textContent).toContain("This one stays"); expect(screen.getByTestId("checkpoint-2").textContent).toContain("r1-r1");
    fireEvent.click(screen.getByTestId("rewind-go-1")); await waitFor(() => expect(rw).toHaveBeenCalledWith("r1", 1)); await waitFor(() => expect(done).toHaveBeenCalledWith("r1-r2"));
  });
  it("a refused rewind shows why", async () => {
    vi.spyOn(api, "runCheckpoints").mockResolvedValue([{ k: 1, nodes: ["a"], spent_usd: 0, t_ms: 1, runs: [] }]); vi.spyOn(api, "runRewind").mockResolvedValue({ ok: false, error: "nothing to take up" } as any);
    render(<Checkpoints run="r1" />); fireEvent.click(await screen.findByTestId("rewind-1")); fireEvent.click(screen.getByTestId("rewind-go-1")); expect((await screen.findByTestId("checkpoint-error")).textContent).toContain("nothing to take up");
  });
});
