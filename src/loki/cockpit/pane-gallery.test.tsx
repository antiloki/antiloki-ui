// PANE GALLERY (2026-07-12): the add-pane wizard gallery — a card per pane
// kind with a mini-image + info popover, agents and tools grouped, new panes
// discoverable, "soon" panes disabled.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PANE_KINDS, PaneCard, VIBE_AGENTS } from "./pane-gallery";

describe("pane gallery", () => {
  it("covers every pane kind incl. the wave-2 tools, grouped agents/tools", () => {
    const keys = PANE_KINDS.map((m) => m.key);
    for (const k of ["agent", "opencode", "claude-code", "codex", "script", "git", "context", "notes", "state", "run", "gate",
      "code", "diagram", "graph", "kanban", "standup", "shell", "review", "todo", "race", "timeline", "design", "docs", "sketch", "fuel", "notebook", "radar", "bfw1", "bfw2", "bfw3", "ultraplan", "judgment", "intent", "swarm", "col-ultra-dev", "col-bug-hunt", "col-bug-finder", "col-bake-off", "col-design-studio", "col-understanding-lab", "col-release-check"]) {
      expect(keys, `missing pane kind ${k}`).toContain(k);
    }
    // the VIBE ROSTER: personalized agents (avatar + full name + persona), all dev-granted
    expect(VIBE_AGENTS.map((v) => v.key)).toEqual(["forge", "muse", "patch", "prism", "sage", "metro"]);
    for (const v of VIBE_AGENTS) { expect(v.persona.length).toBeGreaterThan(80); expect(v.base).toBe("dev"); expect(v.avatar).toBeTruthy(); }
    // every tool carries a category (the add wizard groups them)
    for (const m of PANE_KINDS.filter((x) => x.group === "tools")) expect(m.cat, `tool ${m.key} needs a cat`).toBeTruthy();
    expect(PANE_KINDS.filter((m) => m.group === "agents").map((m) => m.key)).toContain("claude-code");
    expect(PANE_KINDS.filter((m) => m.group === "tools").map((m) => m.key)).toEqual(
      expect.arrayContaining(["notes", "state", "review", "race", "timeline"]),
    );
    // everything in the gallery is live — nothing flagged "soon"
    expect(PANE_KINDS.filter((m) => m.soon)).toEqual([]);
  });

  it("a card selects on click, shows its mini-image + info; a disabled card does not select", () => {
    const onSelect = vi.fn();
    const notes = PANE_KINDS.find((m) => m.key === "notes")!;
    const { rerender } = render(<PaneCard meta={notes} selected={false} onSelect={onSelect} />);
    // mini-image (an svg) renders in the card
    expect(document.querySelector(`[data-testid="pane-card-notes"] svg`)).toBeTruthy();
    fireEvent.click(screen.getByTestId("pane-card-notes"));
    expect(onSelect).toHaveBeenCalled();
    // info popover reveals the description
    fireEvent.click(screen.getByTitle("what it does"));
    expect(screen.getByText(/private annotation pad/)).toBeTruthy();

    const run = PANE_KINDS.find((m) => m.key === "run")!;
    const onRun = vi.fn();
    rerender(<PaneCard meta={run} selected={false} disabled onSelect={onRun} />);
    fireEvent.click(screen.getByTestId("pane-card-run"));
    expect(onRun).not.toHaveBeenCalled();  // a disabled card is not selectable
  });
});
