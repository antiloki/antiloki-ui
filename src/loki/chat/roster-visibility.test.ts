// ONE AGENT IS NOT A LIST (operator 2026-09-26: "people chose chatgpt, claude etc because is simple. They ask
// there and forget"). The roster is driven by state, not by a setting — which is the whole point: a new operator
// meets a conversation, not a column asking them to pick from one thing.
import { describe, it, expect } from "vitest";
import { showRoster } from "./widget-dock";

// SUPERSEDED THE SAME DAY, and the history is the point: this began as "hide at one, switcher at two", shipped as
// half of that, and then the design moved past it — Heimdall routes the role, so there is ONE agent and no roster
// at all. `showRoster` survives for the threads surface, and because "a list of one is not a list" is a rule worth
// keeping named.
describe("when the agents roster is on screen", () => {
  it("is absent for nobody and for one — there is no choice to put in front of anyone", () => {
    expect(showRoster(0)).toBe(false);
    expect(showRoster(1)).toBe(false);
  });
  it("returns the moment there are two, with no setting to find", () => {
    expect(showRoster(2)).toBe(true);
    expect(showRoster(9)).toBe(true);
  });
});

// AND "NOBODY SAID" IS NOT "NOBODY IS THERE". The DockZone prop is optional; a caller that has not been taught to
// count keeps its sidebar, because silently removing a surface from an un-updated caller is the worse failure.
describe("an uncounted caller", () => {
  it("is not treated as an empty one", () => {
    const hidden = (count: number | undefined) => count != null && !showRoster(count);
    expect(hidden(undefined)).toBe(false);   // unknown → the column stays
    expect(hidden(1)).toBe(true);            // counted one → it goes
    expect(hidden(0)).toBe(true);
    expect(hidden(3)).toBe(false);
  });
});
