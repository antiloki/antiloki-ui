// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryButton, memoryOf } from "./MemoryButton";
import type { AgentSaga } from "./api";

const saga = (o: Partial<AgentSaga>): AgentSaga => ({ id: 1, title: "t", summary: "", status: "done", open: false, pane: "p", paneId: 7, engine: "claude", model: "", turns: 3, usd: 0.004, tokens: 0, updated: 1, source: "agent", ...o });
const sg = vi.hoisted(() => ({ listSagas: vi.fn() }));
vi.mock("@/loki/sagas/api", () => sg);
const ep = vi.hoisted(() => ({ listSagaEpisodes: vi.fn() }));
vi.mock("./api", () => ep);
afterEach(cleanup);
describe("the memory button", () => {
  it("shows what is inside a saga: its newest episodes, newest first, with how many came before", async () => {
    ep.listSagaEpisodes.mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ id: 100 + i, title: `answer ${i + 1}`, status: i === 7 ? "doing" : "done", usd: 0.001, ms: 1000 })));
    render(<MemoryButton paneId={7} episodes={[saga({ id: 11, title: "Plan the week" })]} onOpen={() => {}} />);
    fireEvent.click(screen.getByTestId("memory-button-7"));
    const box = await screen.findByTestId("memory-episodes-11"); expect(ep.listSagaEpisodes).toHaveBeenCalledWith(11);
    expect(box.textContent).toContain("3 earlier"); expect(box.textContent).toContain("answer 8"); expect(box.textContent).toContain("answer 4"); expect(box.textContent).not.toContain("answer 3");
    const rows = box.querySelectorAll("[data-testid^='memory-episode-']"); expect(rows[0].textContent).toBe("answer 8");   // newest first
  });
  it("shows no episode list for a saga with none", async () => {
    ep.listSagaEpisodes.mockResolvedValue([]); render(<MemoryButton paneId={7} episodes={[saga({ id: 12 })]} onOpen={() => {}} />); fireEvent.click(screen.getByTestId("memory-button-7"));
    await waitFor(() => expect(ep.listSagaEpisodes).toHaveBeenCalled()); expect(screen.queryByTestId("memory-episodes-12")).toBeNull();
  });
  it("lists this pane's sagas only, the open one first, then the newest", () => {
    const l = memoryOf([saga({ id: 1, updated: 5 }), saga({ id: 2, updated: 9 }), saga({ id: 3, paneId: 8 }), saga({ id: 4, open: true, updated: 1 })], 7);
    expect(l.map((e) => e.id)).toEqual([4, 2, 1]); expect(memoryOf(Array.from({ length: 20 }, (_, i) => saga({ id: i })), 7, 5)).toHaveLength(5);
  });
  it("shows a count, opens a list, and opens the saga that was clicked", () => {
    const onOpen = vi.fn(); render(<MemoryButton paneId={7} episodes={[saga({ id: 11, title: "Fix login", summary: "two files", usd: 0.0038 }), saga({ id: 12, paneId: 9 })]} onOpen={onOpen} />);
    expect(screen.getByTestId("memory-count-7")).toHaveTextContent("1"); expect(screen.queryByTestId("memory-list-7")).toBeNull();
    fireEvent.click(screen.getByTestId("memory-button-7")); expect(screen.getByTestId("memory-list-7")).toHaveTextContent("Fix login"); expect(screen.getByTestId("memory-list-7")).toHaveTextContent("$0.004");
    fireEvent.click(screen.getByTestId("memory-saga-11")); expect(onOpen).toHaveBeenCalledWith(11); expect(screen.queryByTestId("memory-list-7")).toBeNull();
  });
  it("the list closes on Escape and on a click anywhere else", () => {
    render(<div><span data-testid="elsewhere">x</span><MemoryButton paneId={7} episodes={[saga({ id: 11, title: "Fix login" })]} onOpen={() => {}} /></div>);
    fireEvent.click(screen.getByTestId("memory-button-7")); expect(screen.getByTestId("memory-list-7")).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" }); expect(screen.queryByTestId("memory-list-7")).toBeNull();
    fireEvent.click(screen.getByTestId("memory-button-7")); fireEvent.pointerDown(screen.getByTestId("elsewhere")); expect(screen.queryByTestId("memory-list-7")).toBeNull();
  });
  it("says what an agent belongs to: its thread, its pair or team and role, the team it leads", async () => {
    const { memberWords } = await import("./MemoryButton"); expect(memberWords({ kind: "leader", name: "marketing" })).toEqual({ icon: "spark", text: "Leader of marketing" }); expect(memberWords({ kind: "pair", name: "Pair 2", role: "planner" }).text).toBe("pair Pair 2 · planner"); expect(memberWords({ kind: "thread", name: "Main" }).text).toBe("thread Main");
    render(<MemoryButton paneId={7} episodes={[saga({ id: 5, title: "Brief", member: [{ kind: "leader", name: "marketing" }, { kind: "thread", name: "Marketing" }] })]} onOpen={vi.fn()} />); fireEvent.click(screen.getByTestId("memory-button-7")); expect(screen.getByTestId("memory-member-5")).toHaveTextContent("Leader of marketing"); expect(screen.getByTestId("memory-member-5")).toHaveTextContent("thread Marketing");
  });
  it("says there is nothing yet when the pane has no saga", () => {
    render(<MemoryButton paneId={7} episodes={[]} onOpen={vi.fn()} />); expect(screen.queryByTestId("memory-count-7")).toBeNull(); fireEvent.click(screen.getByTestId("memory-button-7")); expect(screen.getByTestId("memory-list-7")).toHaveTextContent("Nothing yet");
  });
  it("a Leader's button lists the team's own saga first, then the sagas of its pack", async () => {
    const { teamMemoryOf } = await import("./MemoryButton"); const all: any[] = [{ id: 111, title: "ministore-video · team", meta: { kind: "team", team: "ministore-video" }, rollup: { episodes: 3, done: 0 } }, { id: 120, title: "Scene one", meta: { kind: "pack", team: "ministore-video" }, rollup: { episodes: 1, done: 1 } }, { id: 130, title: "other", meta: { kind: "pack", team: "other" } }];
    expect(teamMemoryOf(all, "ministore-video")).toEqual([{ id: 111, title: "The team's record", line: "3 episodes · 0 done", own: true }, { id: 120, title: "Scene one", line: "1 episode · 1 done", own: false }]); expect(teamMemoryOf(all, "Ministore Video").length).toBe(2); expect(teamMemoryOf([], "x")).toEqual([]);
    sg.listSagas.mockResolvedValue(all); const onOpen = vi.fn(); render(<MemoryButton paneId={7} episodes={[]} onOpen={onOpen} team="ministore-video" />);
    await waitFor(() => expect(screen.getByTestId("memory-count-7")).toHaveTextContent("2")); fireEvent.click(screen.getByTestId("memory-button-7")); fireEvent.click(await screen.findByTestId("memory-team-111")); expect(onOpen).toHaveBeenCalledWith(111);
  });
});
