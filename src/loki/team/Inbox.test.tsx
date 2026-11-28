import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as api from "./api";
import { Inbox, gatesOf, stack } from "./Inbox";

describe("the inbox and the gate stack", () => {
  it("a run's parked nodes are its gates, named by the node's label; the stack is oldest first", () => {
    const run: any = { id: "r1", team: "T", graph: { nodes: { pub: { label: "Publish the video" } } }, park_info: { pub: "waits for your yes", other: "x" } };
    const g = gatesOf(run, 5); expect(g.map((x) => x.title)).toEqual(["Publish the video", "other"]); expect(g[0].run).toBe("r1");
    expect(stack([{ since_ms: 9 } as any, { since_ms: 2 } as any]).map((x) => x.since_ms)).toEqual([2, 9]);
  });
  it("says nothing when nothing waits", async () => {
    vi.spyOn(api, "listTeams").mockResolvedValue({ graphs: [], runs: [], live: [] }); const { container } = render(<Inbox pollMs={100000} />); await waitFor(() => expect(api.listTeams).toHaveBeenCalled()); expect(container.textContent).toBe("");
  });
  it("lists a gate and an open request, and a click on Allow answers the run", async () => {
    vi.spyOn(api, "listTeams").mockResolvedValue({ graphs: [{ team: "T", id: "t", nodes: 1, budget_usd: 1, valid: true, worst_usd: 0 }], runs: [{ id: "r1", team: "T", ask: "a", status: "parked", spent_usd: 0, started_ms: 1000, needs_you: true } as any], live: [] });
    vi.spyOn(api, "runStatus").mockResolvedValue({ id: "r1", team: "T", graph: { nodes: { pub: { label: "Publish the video" } } }, park_info: { pub: "waits" } } as any);
    vi.spyOn(api, "listRequests").mockResolvedValue([{ n: 3, status: "open", problem: "lower the reviewer tier", opened_ms: 2000 } as any]);
    const ans = vi.spyOn(api, "answerAt").mockResolvedValue({ ok: true } as any); const onOpen = vi.fn();
    render(<Inbox onOpenTeam={onOpen} pollMs={100000} />);
    expect((await screen.findByTestId("inbox-count")).textContent).toBe("2"); fireEvent.click(screen.getByTestId("inbox-pill"));
    fireEvent.click(await screen.findByTestId("allow-gate-r1-pub")); await waitFor(() => expect(ans).toHaveBeenCalledWith("r1", "pub", true));
    fireEvent.click(screen.getByTestId("open-req-T-3")); expect(onOpen).toHaveBeenCalledWith("T");
  });
});

describe("an inner team's approval (2026-11-21)", () => {
  it("is listed in the parent's stack under the inner team's name, and answered on the child's own run", async () => {
    const { gatesOf } = await import("./Inbox");
    const child: any = { id: "c1", team: "pane-webapp", park_info: { approve: "Is this the pane?" }, graph: { nodes: { approve: { label: "Is this the pane?" } } } };
    const seen = gatesOf(child, 5, "launch-kit"); expect(seen[0].title).toBe("pane-webapp · Is this the pane?"); expect(seen[0].sub).toContain("inner team"); expect(seen[0].run).toBe("c1"); expect(seen[0].node).toBe("approve");
    const own = gatesOf(child, 5, "pane-webapp"); expect(own[0].title).toBe("Is this the pane?"); expect(own[0].sub).not.toContain("inner team"); expect(gatesOf(child, 5)[0].title).toBe("Is this the pane?");
  });
});
