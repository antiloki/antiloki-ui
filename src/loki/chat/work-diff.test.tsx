// THE DIFF, SIDE BY SIDE (operator 2026-09-24: "at the beautiful box i just mentioned didnt appeared the diff
// also side by side to the old version of all touched files").
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const apiGet = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...a) }));
import { WorkDiffView, alignLines, collapse, countsOf, inlineRows, type FilePair } from "./work-diff";

const file = (o: Partial<FilePair>): FilePair => ({ path: "src/a.ts", old: "", new: "", added: false, deleted: false, same: false, truncated: false, ...o });
beforeEach(() => { apiGet.mockReset(); });

describe("lining the two sides up", () => {
  it("keeps the unchanged lines opposite each other and marks what moved", () => {
    const rows = alignLines("a\nb\nc\n", "a\nB\nc\n");
    expect(rows.map((r) => [r.kind, r.oldN, r.newN, r.oldText, r.newText])).toEqual([
      ["same", 1, 1, "a", "a"],
      ["del", 2, 2, "b", "B"],     // a replaced line shows BOTH sides on one row — that is the point of side by side
      ["same", 3, 3, "c", "c"],
    ]);
    expect(countsOf(rows)).toEqual({ added: 1, removed: 1 });
  });

  it("a pure insertion leaves the old side blank, and a deletion the new side", () => {
    expect(alignLines("a\n", "a\nb\n").map((r) => [r.oldN, r.newN])).toEqual([[1, 1], [null, 2]]);
    expect(alignLines("a\nb\n", "a\n").map((r) => [r.oldN, r.newN])).toEqual([[1, 1], [2, null]]);
  });

  it("a created file is all new, and a deleted one all old", () => {
    expect(alignLines("", "x\ny\n").every((r) => r.oldN == null)).toBe(true);
    expect(alignLines("x\ny\n", "").every((r) => r.newN == null)).toBe(true);
    expect(alignLines("", "")).toEqual([]);
  });

  it("collapses long unchanged stretches so a two-line change in a long file reads as one", () => {
    const oldText = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const newText = oldText.replace("line 20", "LINE 20");
    const rows = alignLines(oldText, newText, 2);
    const gaps = rows.filter((r) => r.kind === "gap");
    expect(gaps.length).toBe(2);
    expect(gaps[0].hidden).toBe(18);                       // the 18 lines before the context window
    expect(rows.filter((r) => r.kind !== "gap").length).toBe(5);  // 2 context + the change + 2 context
    // an unchanged file is never collapsed — there is nothing to hide behind a gap
    expect(collapse(alignLines(oldText, oldText, 2), 2).some((r) => r.kind === "gap")).toBe(false);
  });
});

// operator 2026-09-24: "the diff is ugly, doesnt seems like a diff of code, also, hasnt enough space to show
// side by side changes, so make a single diff trail… the default show inline diff".
describe("the inline trail", () => {
  it("prints a replaced line as a removal then an addition, the way git does", () => {
    const rows = inlineRows(alignLines("a\nb\nc\n", "a\nB\nc\n"));
    expect(rows.map((r) => [r.kind, r.oldN, r.newN, r.text])).toEqual([
      ["same", 1, 1, "a"],
      ["del", 2, null, "b"],
      ["add", null, 2, "B"],
      ["same", 3, 3, "c"],
    ]);
  });
  it("keeps a pure insertion and a pure deletion as one line each, and carries the gaps through", () => {
    expect(inlineRows(alignLines("a\n", "a\nb\n")).map((r) => r.kind)).toEqual(["same", "add"]);
    expect(inlineRows(alignLines("a\nb\n", "a\n")).map((r) => r.kind)).toEqual(["same", "del"]);
    const long = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const g = inlineRows(alignLines(long, long.replace("line 20", "LINE 20"), 2));
    expect(g.filter((r) => r.kind === "gap").length).toBe(2);
    expect(g.find((r) => r.kind === "gap")!.hidden).toBe(18);
  });
});

describe("the view", () => {
  it("fetches only when opened, and repeats what the old side actually is", async () => {
    apiGet.mockResolvedValue({ files: [file({ old: "a\n", new: "b\n" })], note: "the old side is the last commit" });
    render(<WorkDiffView run={132} />);
    expect(apiGet).not.toHaveBeenCalled();               // a diff nobody opened costs nothing

    await act(async () => { fireEvent.click(screen.getByTestId("work-diff-toggle")); });
    await waitFor(() => expect(screen.getByTestId("diff-file")).toBeTruthy());
    expect(apiGet.mock.calls[0][0]).toBe("/api/v1/cockpit/goals/diff?id=132");
    expect(screen.getByTestId("work-diff").textContent).toContain("the old side is the last commit");

    // the rows only render once the file itself is opened
    fireEvent.click(screen.getByTestId("diff-file").firstChild as Element);
    const t = screen.getByTestId("diff-file").textContent ?? "";
    expect(t).toContain("+1");
    expect(t).toContain("−1");
    // …and it opens INLINE, offering the flip rather than starting in it
    expect(screen.getByTestId("diff-flip").textContent).toContain("side by side");
    fireEvent.click(screen.getByTestId("diff-flip"));
    expect(screen.getByTestId("diff-flip").textContent).toContain("inline");
    localStorage.removeItem("antiloki:diff-view");
  });

  it("says a run that wrote nothing has nothing to compare, rather than showing an empty frame", async () => {
    apiGet.mockResolvedValue({ files: [], note: "n/a" });
    render(<WorkDiffView run={1} />);
    await act(async () => { fireEvent.click(screen.getByTestId("work-diff-toggle")); });
    await waitFor(() => expect(screen.getByTestId("work-diff").textContent).toContain("nothing to compare"));
  });

  it("a box that is gone says so instead of pretending the run wrote nothing", async () => {
    apiGet.mockRejectedValue(new Error("gone"));
    render(<WorkDiffView run={1} />);
    await act(async () => { fireEvent.click(screen.getByTestId("work-diff-toggle")); });
    await waitFor(() => expect(screen.getByTestId("work-diff").textContent).toContain("may have been removed"));
  });
});
