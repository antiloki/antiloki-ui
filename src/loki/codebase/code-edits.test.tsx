// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { markEdited, clearEditedBefore, editedPaths, resetEdits, useEditedPaths } from "./code-edits";
import { jobStartMs } from "./rebuild-panel";

beforeEach(() => { localStorage.clear(); resetEdits(); });

describe("the files edited since the last rebuild (operator 2026-10-11: a direct edit flags that a rebuild is needed)", () => {
  it("remembers each saved path once, per workspace, sorted", () => {
    markEdited("/w/a", "src/z.ts"); markEdited("/w/a", "src/a.ts"); markEdited("/w/a", "src/a.ts"); markEdited("/w/b", "other.ts");
    expect(editedPaths("/w/a")).toEqual(["src/a.ts", "src/z.ts"]); expect(editedPaths("/w/b")).toEqual(["other.ts"]); expect(editedPaths("/w/none")).toEqual([]);
  });
  it("a rebuild that STARTED at t clears what was saved at or before t, and keeps what was saved while it ran", () => {
    markEdited("/w", "old.ts", 1000); markEdited("/w", "during.ts", 5000);
    clearEditedBefore("/w", 3000);
    expect(editedPaths("/w")).toEqual(["during.ts"]);
    clearEditedBefore("/w", 9000); expect(editedPaths("/w")).toEqual([]);
    clearEditedBefore("/nowhere", 9000);   // nothing to clear is not an error
  });
  it("survives a reload: the flag is kept in localStorage", () => {
    markEdited("/w", "a.ts", 1);
    expect(JSON.parse(localStorage.getItem("antiloki.code-edits")!)).toEqual({ "/w": { "a.ts": 1 } });
  });
  it("re-renders a component when a file is saved and again when a rebuild clears it", () => {
    function Probe() { const p = useEditedPaths("/w"); return <div data-testid="p">{p.join(",") || "none"}</div>; }
    render(<Probe />);
    expect(screen.getByTestId("p").textContent).toBe("none");
    act(() => { markEdited("/w", "x.ts", 10); }); expect(screen.getByTestId("p").textContent).toBe("x.ts");
    act(() => { clearEditedBefore("/w", 10); }); expect(screen.getByTestId("p").textContent).toBe("none");
  });
  it("reads a job's start from an ISO time or SQLite's UTC text, and from nothing means now", () => {
    expect(jobStartMs("2026-10-11T10:00:00Z")).toBe(Date.UTC(2026, 9, 11, 10, 0, 0));
    expect(jobStartMs("2026-10-11 10:00:00")).toBe(Date.UTC(2026, 9, 11, 10, 0, 0));
    const before = Date.now(); expect(jobStartMs(undefined)).toBeGreaterThanOrEqual(before); expect(jobStartMs("garbage")).toBeGreaterThanOrEqual(before);
  });
});
