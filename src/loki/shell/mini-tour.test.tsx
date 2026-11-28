// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { render, fireEvent, screen, act } from "@testing-library/react";
import { MiniTour, ProgressiveTour, TOURS, placeCard, tourFor, tourKey, nextTour, unlockTour, useTourUnlock, resetTours, type TourId } from "./mini-tour";
import { screenOptions, pathFor } from "./screen-switch";

let pathname = "/";
vi.mock("@tanstack/react-router", () => ({ useLocation: () => ({ pathname }) }));

describe("the progressive tour (2026-09-20): three steps per section, unlocked on its first access, never one upfront walkthrough", () => {
  beforeEach(() => { localStorage.clear(); pathname = "/"; });
  it("every section has exactly three steps that name a benefit; anchors are data-tour / data-testid selectors", () => {
    const ids = Object.keys(TOURS) as TourId[];
    expect(ids.length).toBeGreaterThanOrEqual(13);  // + "hire": creating an agent (operator 2026-09-24)
    for (const id of ids) {
      expect(TOURS[id].steps.length).toBe(3); expect(TOURS[id].label.length).toBeGreaterThan(2);
      for (const s of TOURS[id].steps) { expect(s.title.length).toBeGreaterThan(3); expect(s.text.length).toBeGreaterThan(60); if (s.anchor) expect(s.anchor).toMatch(/^\[data-(tour|testid)=/); }
    }
    // NOT "THREADS" (operator 2026-09-24, from a Windows install: "some parts of the tour are still talking
    // about threads wich is outdated"). The surface was renamed to Agents and the tour kept narrating the old
    // one, down to a step anchored on a tab that no longer exists. No step may say it again.
    // Cowork threads are real now (the sidebar's + new thread): the ban was about the old agent threads
    for (const id of ids.filter((i) => i !== "desk")) for (const s of TOURS[id].steps) expect(`${s.title} ${s.text}`.toLowerCase()).not.toContain("thread");
    // the screens unlock by route; the surfaces inside them (studio, agent, goal-run, heimdall, agents-float, context) by mount
    expect(tourFor("/")).toBe("desk"); expect(tourFor("/operations/atlas")).toBe("ide"); expect(tourFor("/operations/design")).toBe("design");
    expect(tourFor("/operations/pulls")).toBe("pulls"); expect(tourFor("/settings/byok")).toBeNull(); expect(tourFor("/knowledge")).toBe("knowledge"); expect(tourFor("/kanban")).toBeNull();
    expect(nextTour(["desk", "studio"], (id) => id === "desk")).toBe("studio"); expect(nextTour(["desk"], () => true)).toBeNull();
  });
  it("one section: walks its three steps, outlines the anchor when it exists, and is never shown again after 'got it'", () => {
    const onDone = vi.fn();
    render(<div><div data-tour="desk-sidebar" data-testid="cowork-sidebar" style={{ width: 200, height: 100 }} /><MiniTour id="desk" onDone={onDone} /></div>);
    expect(screen.getByTestId("tour-desk")).toBeTruthy();
    expect(screen.getByTestId("tour-label").textContent).toBe("Cowork · 1/3");
    // the desk's first step names the ONE agent and its episodes — the roster it used to describe is gone
    // (operator 2026-09-27: "keep just one agent … the old version is outdated")
    expect(screen.getByTestId("tour-title").textContent).toBe("Spaces, threads, one agent");
    expect(screen.getByTestId("tour-spot")).toBeTruthy(); // the sidebar anchor is on the page
    fireEvent.click(screen.getByTestId("tour-next")); fireEvent.click(screen.getByTestId("tour-next"));
    expect(screen.getByTestId("tour-title").textContent).toBe("Money and limits, at the bottom");
    expect(screen.getByTestId("tour-next").textContent).toBe("got it");
    fireEvent.click(screen.getByTestId("tour-next"));
    expect(localStorage.getItem(tourKey("desk"))).toBe("seen"); expect(onDone).toHaveBeenCalledWith(true);
  });
  it("✕ skips and remembers; the card sits right of the anchor when there is room, else below, else bottom-right", () => {
    render(<MiniTour id="ide" />);
    fireEvent.click(screen.getByTestId("tour-skip"));
    expect(localStorage.getItem(tourKey("ide"))).toBe("seen");
    expect(placeCard({ left: 10, top: 20, width: 200, height: 300 }, 1400, 800)).toEqual({ left: 224, top: 20 });
    expect(placeCard({ left: 1100, top: 20, width: 280, height: 40 }, 1400, 800)).toEqual({ left: 1052, top: 74 });
    expect(placeCard(null, 1400, 800)).toEqual({ left: 1042, top: 582 });
  });
  it("the host: the screen's section on arrival, a surface's section when it unlocks — one at a time, a beat apart, each once", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<ProgressiveTour />);
      expect(screen.queryByTestId("tour-desk")).toBeNull(); // a beat later, never on the same frame as the screen
      act(() => { vi.advanceTimersByTime(700); });
      expect(screen.getByTestId("tour-desk")).toBeTruthy();
      // a chat pane mounts while the desk tour is up: it queues, it does not stack
      act(() => { unlockTour("agent"); });
      expect(screen.queryByTestId("tour-agent")).toBeNull();
      fireEvent.click(screen.getByTestId("tour-skip"));
      expect(screen.queryByTestId("tour-desk")).toBeNull();
      act(() => { vi.advanceTimersByTime(700); });
      expect(screen.getByTestId("tour-agent")).toBeTruthy();
      fireEvent.click(screen.getByTestId("tour-skip"));
      // seen sections stay quiet on their next access
      act(() => { unlockTour("agent"); }); act(() => { vi.advanceTimersByTime(700); });
      expect(screen.queryByTestId("tour-agent")).toBeNull();
      unmount();
      render(<ProgressiveTour />); act(() => { vi.advanceTimersByTime(700); });
      expect(screen.queryByTestId("tour-desk")).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it("leaving the screen mid-tour puts the section back (not marked); 'Welcome tour' forgets every section", () => {
    vi.useFakeTimers();
    try {
      const view = render(<ProgressiveTour />);
      act(() => { vi.advanceTimersByTime(700); });
      expect(screen.getByTestId("tour-desk")).toBeTruthy();
      pathname = "/kanban"; view.rerender(<ProgressiveTour />);
      expect(screen.queryByTestId("tour-desk")).toBeNull(); expect(localStorage.getItem(tourKey("desk"))).toBeNull();
      pathname = "/operations/pulls"; view.rerender(<ProgressiveTour />); act(() => { vi.advanceTimersByTime(700); });
      expect(screen.getByTestId("tour-pulls")).toBeTruthy();
      fireEvent.click(screen.getByTestId("tour-skip"));
      act(() => { resetTours(); }); act(() => { vi.advanceTimersByTime(700); });
      expect(localStorage.getItem(tourKey("pulls"))).toBeNull(); expect(screen.getByTestId("tour-pulls")).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });
  it("useTourUnlock fires on mount when its condition holds, and is a no-op once the section was seen", () => {
    const seen: string[] = [];
    window.addEventListener("antiloki:tour-unlock", (e) => seen.push((e as CustomEvent).detail.id));
    function Surface({ when }: { when: boolean }) { useTourUnlock("studio", when); return null; }
    const v = render(<Surface when={false} />);
    expect(seen).toEqual([]);
    v.rerender(<Surface when={true} />);
    expect(seen).toEqual(["studio"]);
    localStorage.setItem(tourKey("context"), "seen"); unlockTour("context");
    expect(seen).toEqual(["studio"]);
  });
});

describe("the screen switch (2026-09-18): antiDesk · antiIDE — Code · Design on antiIDE", () => {
  it("names the entries per path and lights the current one", () => {
    // COWORK, not Agents (operator 2026-09-26): "Agents" names the rows in the sidebar, not the screen they sit on.
    // The KEY is unchanged — a rename that moved `desk` would move routes and storage with it.
    expect(screenOptions("/")).toEqual({ options: [{ key: "desk", label: "Cowork" }, { key: "ide", label: "X-ray" }, { key: "sagas", label: "Sagas" }], view: "desk" });
    // SAGAS (2026-10-11): the third screen, lit on its own path
    expect(screenOptions("/sagas").view).toBe("sagas"); expect(screenOptions("/sagas/anything").view).toBe("sagas"); expect(pathFor("sagas")).toBe("/sagas");
    expect(screenOptions("/operations/atlas").view).toBe("ide");
    expect(screenOptions("/operations/design").view).toBe("ide");
    expect(pathFor("ide")).toBe("/operations/atlas"); expect(pathFor("design")).toBe("/operations/design"); expect(pathFor("desk")).toBe("/");
  });
});
