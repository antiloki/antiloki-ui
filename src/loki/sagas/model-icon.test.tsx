// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as React from "react";
import { seatOf, familyOf, isSeat, modelLabel, accentOf, moodOf, ModelIcon, Who, Faces } from "./model-icon";

afterEach(() => cleanup());
describe("model icons", () => {
  it("splits a seat into its engine and model", () => {
    expect(seatOf("cursor:composer-2.5")).toEqual({ engine: "cursor", model: "composer-2.5" });
    expect(seatOf("opencode:opencode/kimi-k2.7-code")).toEqual({ engine: "opencode", model: "opencode/kimi-k2.7-code" });
    expect(seatOf("frontender")).toEqual({ engine: "frontender", model: "" });
  });
  it("knows the family of every engine, and tells OpenCode's hosted models apart by name", () => {
    expect([["claude-code", ""], ["codex", "gpt-5.6"], ["cursor", "composer"], ["gemini", ""], ["agy", ""], ["grok", ""]].map(([e, m]) => familyOf(e, m))).toEqual(["claude", "codex", "cursor", "gemini", "gemini", "grok"]);
    expect([["opencode", "opencode/kimi-k2.7-code"], ["opencode", "opencode/deepseek-v4"], ["opencode", "qwen3-coder"], ["opencode", "claude-sonnet"], ["opencode", ""], ["nobody", ""]].map(([e, m]) => familyOf(e, m))).toEqual(["kimi", "deepseek", "qwen", "claude", "opencode", "other"]);
  });
  it("tells a seat from an agent's name", () => {
    expect([isSeat("cursor:composer"), isSeat("claude-code"), isSeat("opencode"), isSeat("frontender"), isSeat("you")]).toEqual([true, true, true, false, false]);
  });
  it("labels a model briefly and gives two models two accents", () => {
    expect(modelLabel("opencode/kimi-k2.7-code")).toBe("kimi-k2.7-code"); expect(modelLabel("gpt-5.6-terra@high")).toBe("gpt-5.6-terra");
    expect(accentOf("composer-2.5")).not.toBe(accentOf("composer-2")); expect(accentOf("composer-2.5")).toBe(accentOf("composer-2.5"));
  });
  it("an episode's status is the agent's mood", () => { expect((["failed", "doing", "done", "todo", "canceled"] as const).map(moodOf)).toEqual(["failed", "working", "live", "idle", "idle"]); });
  it("draws the family's own icon with the exact model in its tooltip", () => {
    render(<><ModelIcon seat="cursor:composer-2.5" /><ModelIcon engine="claude-code" model="sonnet" /></>);
    expect(screen.getByTestId("model-icon-cursor").getAttribute("title")).toBe("Cursor · composer-2.5");
    expect(screen.getByTestId("model-icon-claude").getAttribute("data-model")).toBe("sonnet");
  });
  it("shows the agent's face and the model's icon, with a red ring when it failed, and a dashed mark when nobody did it", () => {
    render(<><Who assignee="cursor:composer" status="failed" /><Who assignee="" status="todo" /></>);
    const who = screen.getAllByTestId("who");
    expect(who.length).toBe(1);   // the unassigned one is a mark, not a face
    expect(who[0].getAttribute("data-status")).toBe("failed");
    expect(screen.getByTestId("model-icon-cursor")).toBeTruthy();
    expect(screen.getByTitle("cursor:composer - failed")).toBeTruthy();
    expect(screen.getByTitle("not assigned")).toBeTruthy();
  });
  it("a failed agent wears a small red mark on its corner, not a ring round the face", () => {
    render(<><Who assignee="frontender" status="failed" /><Who assignee="qa" status="done" /></>);
    expect(screen.getAllByTestId("who-failed").length).toBe(1);
    const failed = screen.getAllByTestId("who")[0];
    expect((failed.firstElementChild as HTMLElement).style.boxShadow).toBe("");   // nothing circled
  });
  it("the list row shows the faces of the agents behind a saga, most episodes first, +n for the rest", () => {
    render(<Faces agents={{ a: { n: 1, failed: 0 }, b: { n: 5, failed: 2 }, c: { n: 3, failed: 0 }, d: { n: 2, failed: 0 } }} max={3} />);
    const who = screen.getAllByTestId("who");
    expect(who.length).toBe(3);
    expect(who[0].querySelector("[title='b - failed']")).toBeTruthy();   // b did the most and failed some
    expect(screen.getByText("+1")).toBeTruthy();
    cleanup(); const { container } = render(<Faces agents={{}} />); expect(container.innerHTML).toBe("");
  });
});
