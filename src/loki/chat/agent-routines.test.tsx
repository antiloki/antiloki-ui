// @vitest-environment jsdom
// ROUTINES under an agent (2026-09-23): the list for that agent only, ＋ routine saves {agent, name, brief, every_min}
// and closes, the toggle re-saves with enabled flipped, ▶ now fires the run endpoint, ✕ deletes.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const posts: any[] = [];
let routines: any[] = []; let refuse = false;
vi.mock("@/loki/api/client", () => ({
  apiGet: vi.fn(async () => ({ routines })),
  apiPost: vi.fn(async (p: string, b: any) => { posts.push({ p, b }); if (refuse) return null; if (p.endsWith("/routines") && !b.id) routines = [...routines, { id: 9, ...b, enabled: 1, last_run: 0, next_run: Date.now(), last_note: "" }]; return { ok: true }; }),
}));
vi.mock("./chats-tab", () => ({ ago: (t: number) => `${Math.round((Date.now() - t) / 60000)}m ago`, useChatsTab: () => ({ side: null, stage: null, chat: null }) }));
vi.mock("@/loki/widgets/cockpit-pane-body", () => ({ CockpitPaneBody: () => null }));
vi.mock("./widget-dock", () => ({ Slide: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/loki/api/hooks", () => ({ usePoll: () => ({ data: null, refetch: () => {} }) }));
import { Routines } from "./agents-tab";

const agent = { slug: "scout", name: "X trend scout", icon: "🔭", provider: "opencode", pane_id: 9, engine: "opencode", pair: "solo", status: "idle", tone: "idle", saved: 0, saved_est: 0, episodes: [], live: false, runs: 0 } as any;
beforeEach(() => { posts.length = 0; refuse = false; routines = [
  { id: 1, agent: "scout", name: "Rank the threads", brief: "rank 3 threads by signal", every_min: 60, enabled: 1, last_run: 0, next_run: 0, last_note: "" },
  { id: 2, agent: "other", name: "not mine", brief: "x", every_min: 60, enabled: 1, last_run: 0, next_run: 0, last_note: "" },
]; });

describe("routines under an agent", () => {
  it("lists only this agent's routines and fires run / toggle / delete", async () => {
    render(<Routines agent={agent} />);
    await waitFor(() => expect(screen.getByTestId("routine-1")).toBeTruthy());
    expect(screen.queryByTestId("routine-2")).toBeNull();
    expect(screen.getByTestId("routine-1").textContent).toContain("every 1 h");
    fireEvent.click(screen.getByTestId("routine-1-run"));
    await waitFor(() => expect(posts.some((x) => x.p.endsWith("/routines/run") && x.b.id === 1)).toBe(true));
    fireEvent.click(screen.getByTestId("routine-1-toggle"));
    await waitFor(() => expect(posts.some((x) => x.p.endsWith("/routines") && x.b.id === 1 && x.b.enabled === false)).toBe(true));
    fireEvent.click(screen.getByTestId("routine-1-delete"));
    await waitFor(() => expect(posts.some((x) => x.p.endsWith("/routines/delete") && x.b.id === 1)).toBe(true));
  });
  it("＋ routine saves the brief with its cadence for this agent and closes", async () => {
    render(<Routines agent={agent} />);
    await waitFor(() => expect(screen.getByTestId("routine-new")).toBeTruthy());
    fireEvent.click(screen.getByTestId("routine-new"));
    fireEvent.change(screen.getByTestId("routine-brief"), { target: { value: "find leads for the launch" } });
    fireEvent.change(screen.getByTestId("routine-every"), { target: { value: "1440" } });
    fireEvent.click(screen.getByTestId("routine-save"));
    // the team always carries its members — the agent whose row it is, plus anyone tapped in
    await waitFor(() => expect(posts[0]).toEqual({ p: "/api/v1/cockpit/agents/routines", b: { agent: "scout", name: "", brief: "find leads for the launch", every_min: 1440, members: ["scout"] } }));
    await waitFor(() => expect(screen.queryByTestId("routine-form")).toBeNull());
    await waitFor(() => expect(screen.getByTestId("routine-9")).toBeTruthy());
  });
  it("a routine action the serve did not take shows why instead of reloading as if it had (apiPost answers null)", async () => {
    refuse = true;
    render(<Routines agent={agent} />);
    await waitFor(() => expect(screen.getByTestId("routine-1")).toBeTruthy());
    fireEvent.click(screen.getByTestId("routine-1-run"));
    await waitFor(() => expect(screen.getByTestId("agent-routines").textContent).toContain("did not answer"));
  });
});
