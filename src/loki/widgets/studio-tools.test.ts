// THE TOOLS LIST (operator 2026-10-11: "drop the automation widget on tools"): not offered any more, still renderable where a thread already has one.
import { describe, it, expect } from "vitest";
import { ATLAS_VIBE, VIBE_PANES, ATLAS_DESIGN } from "./studio-overlay";
import { WIDGET_REGISTRY } from "./registry";

describe("the tools list", () => {
  it("no longer offers Automation, Context, Sketch or Standup, and still offers the rest", () => {
    const kinds = [...ATLAS_VIBE, ...VIBE_PANES].map((w) => w.kind);
    for (const gone of ["automation", "context", "vibe-sketch", "standup"]) expect(kinds, gone).not.toContain(gone);
    for (const k of ["vibe-issues", "vibe-notes", "shared-diff", "terminal", "design", "intent", "diff"]) expect(kinds, k).toContain(k);
    for (const k of ["vibe-todo", "vibe-kanban"]) expect(kinds, `${k} is one tool now: Issues`).not.toContain(k);
  });
  it("keeps the widgets themselves, so a thread that already has one still shows it", () => {
    expect((WIDGET_REGISTRY as any).automation).toBeTruthy(); expect((WIDGET_REGISTRY as any)["vibe-sketch"]).toBeTruthy();
    expect((WIDGET_REGISTRY as any)["vibe-todo"]).toBeTruthy(); expect((WIDGET_REGISTRY as any)["vibe-kanban"]).toBeTruthy();   // the old two still open, as the Issues tracker
  });
  it("lists Frames and Design system but not Components (it is a tab of Design system)", () => {
    const kinds = ATLAS_DESIGN.map((w) => w.kind);
    expect(kinds).toContain("design-frames"); expect(kinds).toContain("design-view:system"); expect(kinds).not.toContain("design-view:components");
  });
});
