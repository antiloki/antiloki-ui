// Grokbot QA 2026-10-12, items 23 and 34: a tour must not describe parts of the top bar that no longer exist, and every anchor it names must be something the app renders.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TOURS, placeCard } from "./mini-tour";

describe("tour copy", () => {
  it("the Cowork tour no longer describes a fuel donut or a clock in the centre pill", () => {
    const all = TOURS.desk.steps.map((s) => `${s.title} ${s.text}`).join(" ").toLowerCase();
    expect(all).not.toContain("donut");
    expect(all).not.toContain("clock");
  });
  it("the money step points at the instruments the bottom bar renders, and the Cowork anchors exist", () => {
    const step = TOURS.desk.steps.find((s) => s.title === "Money and limits, at the bottom");
    expect(step?.anchor).toBe("[data-testid='instruments-inline']");
    expect(readFileSync(resolve(__dirname, "screen-switch.tsx"), "utf8")).toContain('"instruments-inline"');
    expect(readFileSync(resolve(__dirname, "../cowork/Sidebar.tsx"), "utf8")).toContain('data-testid="cowork-sidebar"');
    expect(readFileSync(resolve(__dirname, "../cowork/Sidebar.tsx"), "utf8")).toContain('data-testid="add-pane"');
  });
  it("the new tours name things the app renders", () => {
    const src = (f: string) => readFileSync(resolve(__dirname, f), "utf8");
    expect(src("../cowork/NewPaneDialog.tsx")).toContain('data-testid="new-pane-kinds"'); expect(src("../team/TeamEdit.tsx")).toContain('data-testid="template-menu"');   // the template library the tour names: the Templates menu of the team editor
    expect(TOURS.newpane.steps).toHaveLength(3); expect(TOURS.newteam.steps).toHaveLength(3); expect(TOURS.usage.steps).toHaveLength(3);
    expect(TOURS.newteam.steps.map((s) => s.text).join(" ")).not.toMatch(/studio/i);
  });
  it("the X-ray tour names Cowork as the other word on the pill", () => {
    const all = TOURS.ide.steps.map((s) => s.text).join(" ");
    expect(all).toContain("Cowork, the other word on this pill");
    expect(all).not.toContain("Agents, the other word");
  });
  it("every data-tour / data-testid anchor of the Sagas tours exists in the Sagas screen", () => {
    const src = readFileSync(resolve(__dirname, "../sagas/sagas-screen.tsx"), "utf8");
    for (const id of ["sagas", "saga"] as const) for (const st of TOURS[id].steps) {
      const m = st.anchor?.match(/\[data-(tour|testid)="([^"]+)"\]/);
      if (m) expect(src, st.anchor).toContain(`data-${m[1]}="${m[2]}"`);
    }
    expect(src).toMatch(/data-testid="sagas-empty" data-tour="sagas-list"/);   // an empty project still has something to point at
  });
});

describe("a tour card does not cover what a step says to avoid (item 34)", () => {
  const aside = { left: 1100, top: 100, width: 270, height: 500 };              // the Telemetry panel
  const tasks = { left: 20, top: 100, width: 700, height: 400 };                // the wide left column
  it("without `avoid` it places the card exactly as before", () => {
    expect(placeCard(tasks, 1400, 800)).toEqual({ left: 734, top: 100 });
    expect(placeCard(tasks, 1400, 800, 340, 200, null)).toEqual({ left: 734, top: 100 });
  });
  it("moves below the anchor when the right-hand place would cover the panel", () => {
    // right of the column = left 734..1074, which does not reach 1100; make the column wide enough that it does
    const wide = { left: 20, top: 100, width: 1000, height: 400 };
    expect(placeCard(wide, 1400, 800)).toEqual({ left: 1034, top: 100 });        // covers the aside at 1100
    expect(placeCard(wide, 1400, 800, 340, 200, aside)).toEqual({ left: 20, top: 514 });
  });
  it("falls back to the bottom-left corner when nothing else is clear", () => {
    const wide = { left: 20, top: 100, width: 1000, height: 400 };
    const p = placeCard(wide, 1400, 600, 340, 200, aside);                       // no room below either
    expect(p.left).toBe(18);
    expect(p.top).toBe(600 - 200 - 18);
  });
  it("the two saga steps that sit in the wide column name the Telemetry panel as the thing to avoid", () => {
    for (const t of ["Episodes and steps", "Every step has a name on it"]) expect(TOURS.saga.steps.find((s) => s.title === t)?.avoid).toBe('[data-tour="saga-telemetry"]');
  });
});
