// @vitest-environment jsdom
// THE NOTES PANE (operator 2026-10-11): one note fills the pane, saved by itself - no save button, no list, no add.
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act, configure } from "@testing-library/react";
import { EditorView } from "@codemirror/view";

configure({ asyncUtilTimeout: 6000 });
beforeAll(() => {   // jsdom has no layout: CodeMirror measures text with Range rects
  const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) } as DOMRect;
  (Range.prototype as any).getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
  (Range.prototype as any).getBoundingClientRect = () => rect;
  (document as any).elementFromPoint = () => null;
});
vi.setConfig({ testTimeout: 30_000 });

const bb = vi.hoisted(() => ({ rows: [] as any[], next: 1, calls: [] as any[], failNext: 0 }));
vi.mock("@/loki/api/client", () => ({
  unwrapResult: (r: any) => r,
  apiPost: vi.fn(async (path: string, body: any) => {
    bb.calls.push({ path, body });
    if (path.endsWith("/blackboard/read")) return { scratch: bb.rows.map((r) => ({ ...r })) };
    if (path.endsWith("/blackboard/post")) {
      if (bb.failNext > 0) { bb.failNext--; return null; }
      if (body.op === "update") { const r = bb.rows.find((x) => x.id === body.id); if (r) r.body_md = body.body_md; return { ok: true }; }
      if (body.op === "delete") { bb.rows = bb.rows.filter((x) => x.id !== body.id); return { ok: true }; }
      const row = { id: bb.next++, kind: body.kind, body_md: body.body_md, pane_id: body.pane_id }; bb.rows.push(row); return { ok: true, id: row.id };
    }
    return null;
  }),
}));
import { NotesPane, mergeNotes } from "./notes-pane";

const writes = () => bb.calls.filter((c) => c.path.endsWith("/blackboard/post")).map((c) => c.body);
// the page is a live markdown editor now: it is driven through its CodeMirror view
const editor = () => EditorView.findFromDOM(screen.getByTestId("note-page").querySelector(".cm-editor") as HTMLElement)!;
const text = () => editor().state.doc.toString();
const type = (v: string) => act(() => { const e = editor(); e.dispatch({ changes: { from: 0, to: e.state.doc.length, insert: v } }); });
const blur = () => act(() => { editor().contentDOM.dispatchEvent(new FocusEvent("blur")); });
const box = editor;
beforeEach(() => { bb.rows = []; bb.next = 1; bb.calls = []; bb.failNext = 0; });

describe("mergeNotes (pure)", () => {
  it("joins every note oldest first, keeps the first one's id, and lists the others to fold", () => {
    expect(mergeNotes([{ id: 5, body_md: "second\n" }, { id: 2, body_md: "first" }, { id: 9, body_md: "" }])).toEqual({ text: "first\n\nsecond", id: 2, extra: [5, 9] });
    expect(mergeNotes([])).toEqual({ text: "", id: null, extra: [] });
  });
});

describe("the notes pane", () => {
  it("is one page to write on: no save button, no list, no add", async () => {
    render(<NotesPane sessionId={1} paneId={2} saveMs={10} />);
    await waitFor(() => expect(document.querySelector(".cm-placeholder")?.textContent).toBe("just write…"));
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.body.textContent).not.toMatch(/save|\+ note|edit/i);
  });
  it("saves by itself after typing stops: one note created, then that note updated - never a second one", async () => {
    render(<NotesPane sessionId={1} paneId={2} saveMs={20} />);
    await waitFor(() => box());
    type("h"); type("hello");   // two quick edits are one save
    await waitFor(() => expect(writes()).toEqual([{ session_id: 1, pane_id: 2, kind: "note", body_md: "hello" }]));
    type("hello world");
    await waitFor(() => expect(writes().length).toBe(2));
    expect(writes()[1]).toEqual({ op: "update", id: 1, body_md: "hello world" });
    expect(bb.rows.length).toBe(1);
  });
  it("saves the moment the box loses focus", async () => {
    render(<NotesPane sessionId={1} paneId={2} saveMs={60_000} />);
    await waitFor(() => box());
    type("quick thought");
    expect(writes()).toEqual([]);
    blur();
    await waitFor(() => expect(bb.rows[0]?.body_md).toBe("quick thought"));
  });
  it("saves what is pending when the pane goes away", async () => {
    const { unmount } = render(<NotesPane sessionId={1} paneId={2} saveMs={60_000} />);
    await waitFor(() => box());
    type("do not lose me");
    unmount();
    await waitFor(() => expect(bb.rows[0]?.body_md).toBe("do not lose me"));
  });
  it("opens with the note that is there and keeps updating that one", async () => {
    bb.rows = [{ id: 7, kind: "note", body_md: "already here", pane_id: 2 }];
    render(<NotesPane sessionId={1} paneId={2} saveMs={20} />);
    await waitFor(() => expect(text()).toBe("already here"));
    type("already here, and more");
    await waitFor(() => expect(bb.rows[0].body_md).toBe("already here, and more"));
    expect(writes()).toEqual([{ op: "update", id: 7, body_md: "already here, and more" }]);
  });
  it("folds the notes an older version made into the one page, without losing any of them", async () => {
    bb.rows = [{ id: 3, kind: "note", body_md: "first", pane_id: 2 }, { id: 4, kind: "note", body_md: "second", pane_id: 2 }, { id: 5, kind: "other", body_md: "not a note", pane_id: 2 }];
    render(<NotesPane sessionId={1} paneId={2} saveMs={20} />);
    await waitFor(() => expect(text()).toBe("first\n\nsecond"));
    type("first\n\nsecond\n\nthird");
    await waitFor(() => expect(bb.rows.filter((r) => r.kind === "note").length).toBe(1));
    expect(bb.rows.find((r) => r.id === 3)!.body_md).toBe("first\n\nsecond\n\nthird");
    expect(bb.rows.some((r) => r.id === 5)).toBe(true);   // what was not a note is untouched
  });
  it("clearing the page removes the note, and writing again starts a new one", async () => {
    bb.rows = [{ id: 1, kind: "note", body_md: "x", pane_id: 2 }];
    render(<NotesPane sessionId={1} paneId={2} saveMs={20} />);
    await waitFor(() => expect(text()).toBe("x"));
    type("");
    await waitFor(() => expect(bb.rows.length).toBe(0));
    type("again");
    await waitFor(() => expect(bb.rows[0]?.body_md).toBe("again"));
  });
  it("says so when a save did not go through, and the next edit goes through", async () => {
    render(<NotesPane sessionId={1} paneId={2} saveMs={10} />);
    await waitFor(() => box());
    bb.failNext = 1;
    type("first try");
    await waitFor(() => expect(screen.getByTestId("note-unsaved")).toBeTruthy());
    expect(text()).toBe("first try");                   // what was typed is still on the page
    type("second try");
    await waitFor(() => expect(bb.rows[0]?.body_md).toBe("second try"));
    await waitFor(() => expect(screen.queryByTestId("note-unsaved")).toBeNull());
  });
});
