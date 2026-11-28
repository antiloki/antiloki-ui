// The one property that makes a tool's data survive: opening the same kind twice must land on the same board.
import { describe, it, expect } from "vitest";
import { widgetIds, stableHash } from "./widget-ids";

describe("where a widget kind opens", () => {
  it("gives a kind the same board every time — this is what keeps the cards", () => {
    expect(widgetIds("vibe-kanban")).toEqual(widgetIds("vibe-kanban"));
    expect(widgetIds("vibe-notes")).toEqual(widgetIds("vibe-notes"));
  });

  it("gives different kinds different boards, so notes never land in the kanban", () => {
    const kinds = ["vibe-kanban", "vibe-notes", "vibe-todo", "vibe-sketch", "vibe-pane:terminal", "vibe-pane:diff"];
    const panes = kinds.map((k) => widgetIds(k).paneId);
    expect(new Set(panes).size).toBe(kinds.length);
  });

  it("keeps the session fallback clear of real session rows", () => {
    for (const k of ["vibe-kanban", "a", ""]) expect(widgetIds(k).sessionId).toBeGreaterThan(1_000_000_000_000);
  });

  it("stays inside the id range the panes expect", () => {
    for (const k of ["vibe-kanban", "vibe-pane:design", "x".repeat(200)]) {
      const { paneId } = widgetIds(k);
      expect(paneId).toBeGreaterThanOrEqual(0);
      expect(paneId).toBeLessThan(1_000_000_000);
      expect(Number.isInteger(paneId)).toBe(true);
    }
  });

  it("hashes without collapsing on similar seeds", () => {
    expect(stableHash("p:vibe-kanban")).not.toBe(stableHash("s:vibe-kanban"));
    expect(stableHash("")).toBe(2166136261);
  });
});
