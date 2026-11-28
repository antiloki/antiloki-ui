// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
vi.mock("@/loki/api/client", () => ({ apiGet: async () => ({ ok: true, prompts: [
  { base: "goal.task", name: "Task", purpose: "what a task is told", tier: "mid", version: "1", template_md: "You are task {{id}}" },
  { base: "agent.antiloki_intro", name: "Intro", purpose: "what an agent is told first", tier: "low", version: "2", template_md: "YOU ARE NOT A PLAIN CLI AGENT" }] }) }));
import { PromptsWindow, parsePrompts, areaOf, found } from "./PromptsWindow";

afterEach(() => cleanup());
describe("the built-in prompts window", () => {
  it("reads the catalog, groups it and searches the words", () => {
    const l = parsePrompts({ ok: true, prompts: [{ base: "goal.task", template_md: "abc" }] })!; expect(l[0].name).toBe("goal.task"); expect(parsePrompts(null)).toBeNull();
    expect([areaOf("goal.task"), areaOf("agent.x"), areaOf("zz.y")]).toEqual(["Planned runs", "Agents in panes", "Other"]); expect(found(l, "ABC").length).toBe(1); expect(found(l, "nothing").length).toBe(0);
  });
  it("shows a prompt's words, switches, searches and closes", async () => {
    const close = vi.fn(); render(<PromptsWindow onClose={close} />);
    await waitFor(() => expect(screen.getByTestId("prompts-text").textContent).toBe("You are task {{id}}"));
    fireEvent.click(screen.getByTestId("prompt-agent.antiloki_intro")); expect(screen.getByTestId("prompts-text").textContent).toContain("NOT A PLAIN");
    fireEvent.change(screen.getByTestId("prompts-search"), { target: { value: "task" } }); expect(screen.queryByTestId("prompt-agent.antiloki_intro")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" }); expect(close).toHaveBeenCalled();
  });
});
