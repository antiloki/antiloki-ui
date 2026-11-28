// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { setThreadRefables, getThreadRefables, useThreadRefables, threadCellOf, widgetTokens, displayText, setGhostHost, ghostCell } from "./thread-refables";

describe("the thread's referable widgets (2026-09-20): the dock publishes, the agent's composer lists, the ask carries", () => {
  it("publishes the active thread's cells once per change, and the hook follows", () => {
    const { result } = renderHook(() => useThreadRefables());
    expect(result.current).toEqual([]);
    act(() => setThreadRefables([{ refId: "kanban-1", label: "Kanban", kind: "kanban", type: "widget" }, { refId: "pane-7", label: "Claude", kind: "vibe-pane:claude-code", type: "widget" }]));
    expect(result.current.map((r) => r.label)).toEqual(["Kanban", "Claude"]);
    const before = getThreadRefables();
    act(() => setThreadRefables([{ refId: "kanban-1", label: "Kanban", kind: "kanban", type: "widget" }, { refId: "pane-7", label: "Claude", kind: "vibe-pane:claude-code", type: "widget" }]));
    expect(getThreadRefables()).toBe(before); // the same list is not a change
    act(() => setThreadRefables([]));
    expect(result.current).toEqual([]);
  });
  it("finds a cell by the split's own attribute, reads the composer's # tokens once each, and shows them as #Label", () => {
    document.body.innerHTML = `<div data-thread-cell="kanban-1"><h3>Kanban</h3></div>`;
    expect(threadCellOf("kanban-1")?.textContent).toBe("Kanban"); expect(threadCellOf("nope")).toBeNull();
    expect(widgetTokens("look at #kanban-1 (Kanban) and #diff-2 (Diff), then #kanban-1 (Kanban) again")).toEqual([{ refId: "kanban-1", label: "Kanban" }, { refId: "diff-2", label: "Diff" }]);
    expect(widgetTokens("no widgets here, #hashtag alone")).toEqual([]);
    expect(displayText("look at #kanban-1 (Kanban) please")).toBe("look at #Kanban please");
  });
  // THE GHOST (2026-09-21): an off-screen widget is mounted hidden, waited for until its text settles, released
  it("ghostCell waits for a hidden mount to settle and releases it; nothing without a host", async () => {
    setGhostHost(null);
    expect(await ghostCell("uw-9", { waitMs: 50 })).toBeNull();
    const ops: string[] = [];
    let clock = 0; const now = () => clock; const sleep = async (ms: number) => { clock += ms; await new Promise((r) => setTimeout(r, 0)); };
    const host = document.createElement("div"); document.body.appendChild(host);
    setGhostHost((op, id) => { ops.push(`${op}:${id}`); if (op === "add") { const el = document.createElement("div"); el.setAttribute("data-ghost-cell", id); el.textContent = "loading"; host.appendChild(el); setTimeout(() => { el.textContent = "loaded: 42 rows"; }, 0); } else host.innerHTML = ""; });
    const got = await ghostCell("uw-9", { waitMs: 5000, settleMs: 300, now, sleep });
    expect(got?.el.textContent).toBe("loaded: 42 rows");
    got?.release();
    expect(ops).toEqual(["add:uw-9", "remove:uw-9"]);
    // on screen already → the real cell, no ghost
    const cell = document.createElement("div"); cell.setAttribute("data-thread-cell", "uw-1"); document.body.appendChild(cell);
    expect((await ghostCell("uw-1", { now, sleep }))?.el).toBe(cell);
    expect(ops.length).toBe(2);
    setGhostHost(null);
  });
});
