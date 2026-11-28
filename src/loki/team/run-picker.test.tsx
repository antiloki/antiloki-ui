// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as React from "react";
import { RunPicker, runLine, whenOf } from "./RunPicker";
import { failureOf } from "./model";

const row = (id: string, started_ms: number, status: string, spent = 0, needs = false): any => ({ id, team: "t", ask: "notion", status: { status }, spent_usd: spent, started_ms, needs_you: needs });
const now = 1_000_000_000_000;
describe("the runs of a team", () => {
  afterEach(() => cleanup());
  it("says when and how each run ended, newest first with its number", () => {
    expect(whenOf(now - 30_000, now)).toBe("just now"); expect(whenOf(now - 5 * 60_000, now)).toBe("5 min ago"); expect(whenOf(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(runLine(row("b", now - 60_000, "running", 0.14, true), 0, 2, now)).toBe("Run 2 · 1 min ago · running (needs you) · $0.14"); expect(runLine(row("a", now - 7_200_000, "done"), 1, 2, now)).toBe("Run 1 · 2 h ago · done");
  });
  it("follows the live run by default, lets one be picked, and goes back to following with one click", () => {
    const rows = [row("b", Date.now() - 60_000, "running"), row("a", Date.now() - 7_200_000, "done", 0.5)]; const pick = vi.fn();
    const { rerender } = render(<RunPicker rows={rows} live={["b"]} shown="b" pinned={null} onPick={pick} />);
    const sel = screen.getByTestId("run-picker-select") as HTMLSelectElement; expect(sel.options[0].textContent).toContain("Live run"); expect(screen.queryByTestId("run-picker-latest")).toBeNull(); expect(sel.options.length).toBe(3);
    fireEvent.change(sel, { target: { value: "a" } }); expect(pick).toHaveBeenCalledWith("a");
    rerender(<RunPicker rows={rows} live={["b"]} shown="a" pinned="a" onPick={pick} />); expect((screen.getByTestId("run-picker-select") as HTMLSelectElement).value).toBe("a"); fireEvent.click(screen.getByTestId("run-picker-latest")); expect(pick).toHaveBeenLastCalledWith(null);
  });
});
describe("why a node failed", () => {
  it("reads the words the serve kept, then the log, then says plainly that an old run kept none", () => {
    const run = (values: any, events: any[] = [], why = ""): any => ({ state: { values, status: { status: "blocked", why } }, events });
    expect(failureOf(run({ capture: { failed: true, error: "signed out: https://x (the page is a sign-in wall)", error_kind: "error" } }), "capture")).toEqual({ text: "signed out: https://x (the page is a sign-in wall)", kind: "error" });
    expect(failureOf(run({}, [{ actor: "capture", kind: "failed", text: "capture failed (Error): boom" }]), "capture")).toEqual({ text: "capture failed (Error): boom", kind: "failed" });
    expect(failureOf(run({}, [], "capture did not go to plan"), "capture")?.text).toContain("No error text was kept"); expect(failureOf(null, "x")).toBeNull();
  });
});
