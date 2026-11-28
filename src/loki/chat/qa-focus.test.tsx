// @vitest-environment jsdom
// WHICH QA BOX IS OPEN, ACROSS WORKSPACES (audit 2026-10-01): the operator's open/close clicks were keyed by run number only, and run numbers restart in every workspace's database.
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useQaExpanded, resetQaFocus, isQaExpanded, toggleQa } from "./qa-focus";

beforeEach(() => resetQaFocus());

describe("the QA focus", () => {
  it("the newest run with a film is open, an older one is not, and a click overrides both", () => {
    const a = renderHook(() => useQaExpanded(5, true)); const b = renderHook(() => useQaExpanded(9, true));
    expect(b.result.current.expanded).toBe(true); expect(a.result.current.expanded).toBe(false);
    act(() => a.result.current.toggle());
    expect(a.result.current.expanded).toBe(true);
  });
  it("a workspace change forgets the operator's clicks: run 5 of the next project starts from the default again", () => {
    const h = renderHook(() => useQaExpanded(5, true));
    expect(h.result.current.expanded).toBe(true);                       // the only run: the newest
    act(() => h.result.current.toggle());
    expect(h.result.current.expanded).toBe(false);                      // the operator collapsed it
    act(() => { window.dispatchEvent(new Event("antiloki:workspace-changed")); });
    expect(h.result.current.expanded).toBe(true);
    expect(isQaExpanded(5)).toBe(true);
  });
  it("the listener goes with the component", () => {
    const h = renderHook(() => useQaExpanded(5, true));
    h.unmount();
    toggleQa(5, false);
    window.dispatchEvent(new Event("antiloki:workspace-changed"));
    expect(isQaExpanded(5)).toBe(false);                                // nobody was listening: the choice stands until someone mounts
  });
});
