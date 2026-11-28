// Grokbot QA 2026-10-12, Sagas items 31, 33 and Checkpoints item 40.
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { assigneeOptions } from "./sagas-screen";
import { Trail, StatusIcon } from "./parts";

describe("assignee options (item 31)", () => {
  it("you and heimdall first, then the project's agents by name, no duplicates", () => {
    expect(assigneeOptions([{ slug: "agent-main" }, { slug: "frontender", name: "Frontender" }, { name: "Only Name" }, { slug: "you" }, {}])).toEqual(["you", "heimdall", "agent-main", "frontender", "Only Name"]);
  });
  it("without a roster it is still the two fixed names", () => {
    expect(assigneeOptions(undefined)).toEqual(["you", "heimdall"]);
    expect(assigneeOptions({ not: "an array" })).toEqual(["you", "heimdall"]);
  });
});

describe("the activity trail (item 33)", () => {
  const ev = (id: number, text: string) => ({ id, saga_id: 1, task_id: 7, actor: "you", text, t_ms: Date.now() });
  it("does not repeat an episode's name that the event text already says", () => {
    render(<Trail events={[ev(1, 'added the episode "Write the docs"')] as any} episodeTitles={{ 7: "Write the docs" }} />);
    expect(screen.getByTestId("trail").textContent!.match(/Write the docs/g)).toHaveLength(1);
  });
  it("still names the episode when the text does not", () => {
    render(<Trail events={[ev(2, "moved it to done")] as any} episodeTitles={{ 7: "Write the docs" }} />);
    expect(screen.getByTestId("trail").textContent).toContain("moved it to done");
    expect(screen.getByTestId("trail").textContent).toContain("Write the docs");
  });
});

describe("assignee options include forks (round 2, item 10)", () => {
  it("a fork comes from the live list, under the name the tab strip shows", () => {
    const live = [{ key: "agent-main", name: "Main", forked_from: 0 }, { key: "agent-main-wayward-alibi", name: "wayward alibi", forked_from: 7 }, { key: "agent-main-calm-sage", forked_from: 7 }];
    expect(assigneeOptions([{ slug: "agent-main" }], live)).toEqual(["you", "heimdall", "agent-main", "wayward alibi", "agent-main-calm-sage"]);
  });
});

describe("a clickable status icon says where the click goes (round 2, item 11)", () => {
  it("names the next status; a read-only one names only itself", () => {
    const { container, rerender } = render(<StatusIcon status="doing" onClick={() => {}} />);
    expect(container.querySelector("title")!.textContent).toBe("in progress → done (click)");
    rerender(<StatusIcon status="doing" />);
    expect(container.querySelector("title")!.textContent).toBe("in progress");
  });
});
