// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AllowanceField } from "./ai-engines";
import { lineText, linesFromFuel } from "@/loki/cockpit/fuel-mini";

afterEach(cleanup);
describe("the weekly allowance of a seat with no published window (operator 2026-10-09)", () => {
  it("offers a save only for a valid, changed number, and clears with an empty box", () => {
    const save = vi.fn();
    render(<AllowanceField seat="cursor" usd={null} onSave={save} />);
    const input = screen.getByTestId("allowance-input-cursor") as HTMLInputElement;
    expect(screen.queryByTestId("allowance-save-cursor")).toBeNull();                 // nothing changed yet
    fireEvent.change(input, { target: { value: "abc" } }); expect(screen.queryByTestId("allowance-save-cursor")).toBeNull();   // not a number
    fireEvent.change(input, { target: { value: "-3" } }); expect(screen.queryByTestId("allowance-save-cursor")).toBeNull();    // not positive
    fireEvent.change(input, { target: { value: "25" } }); fireEvent.click(screen.getByTestId("allowance-save-cursor"));
    expect(save).toHaveBeenCalledWith(25);
    cleanup(); save.mockClear();
    render(<AllowanceField seat="cursor" usd={25} onSave={save} />);
    fireEvent.change(screen.getByTestId("allowance-input-cursor"), { target: { value: "" } }); fireEvent.click(screen.getByTestId("allowance-save-cursor"));
    expect(save).toHaveBeenCalledWith(null);                                           // an empty box clears it
  });
  it("ONE number: the dashboard's percentage alone is offered as a calibration, and a bad one is not", () => {
    const cal = vi.fn();
    render(<AllowanceField seat="cursor" name="Cursor" usd={null} onSave={vi.fn()} onCalibrate={cal} />);
    expect(screen.getByText(/Cursor's dashboard says/)).toBeTruthy();
    const input = screen.getByTestId("calibrate-input-cursor");
    for (const bad of ["abc", "0", "-5", "120"]) { fireEvent.change(input, { target: { value: bad } }); expect(screen.queryByTestId("calibrate-save-cursor")).toBeNull(); }
    fireEvent.change(input, { target: { value: "90" } }); fireEvent.click(screen.getByTestId("calibrate-save-cursor"));
    expect(cal).toHaveBeenCalledWith(90);
    expect((screen.getByTestId("calibrate-input-cursor") as HTMLInputElement).value).toBe("");     // cleared once sent
  });
  it("the preview says '~' and 'est.' for an estimated week and keeps the seat's own counts", () => {
    const f: any = { houses: [{ house: "cursor", calls: 400, cost: 23.13, tokens: 1.0e7, tokens_in: 0, tokens_out: 0, failed: 0, models: 1 }], limits: [
      { house: "cursor", label: "own", calls_5h: 12, tokens_5h: 350000, calls_7d: 393, tokens_7d: 10200000 },
      { house: "cursor", label: "week", used_pct: 92.5, estimated: true, used_usd: 23.13, of_usd: 25 }], models: [], saved: {}, compare: [], panes: [], analysis: "" };
    const l = linesFromFuel(f).find((x) => x.key === "cursor")!;
    expect(l.week).toBe(92.5); expect(l.weekEstimate).toEqual({ used: 23.13, of: 25 });
    const t = lineText(l);
    expect(t).toContain("wk ~93% est. ($23 of $25)");
    expect(t).toContain("7d: 393 calls");                                             // the own counts are still there
    expect(l.tone).toBe("warn");                                                       // 80 % and up: flagged
  });
  it("a published window is printed as before", () => {
    const f: any = { houses: [{ house: "codex", calls: 5, cost: 1, tokens: 1000, tokens_in: 0, tokens_out: 0, failed: 0, models: 1 }], limits: [{ house: "codex", label: "5h", used_pct: 1 }, { house: "codex", label: "week", used_pct: 50 }], models: [], saved: {}, compare: [], panes: [], analysis: "" };
    expect(lineText(linesFromFuel(f).find((x) => x.key === "codex")!)).toContain("wk 50%");
  });
});
