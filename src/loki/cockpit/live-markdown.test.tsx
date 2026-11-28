// @vitest-environment jsdom
// A LIVE MARKDOWN PAGE, LIKE OBSIDIAN'S (operator 2026-10-11): markdown is drawn as it is written, and the raw syntax is shown only on the line the cursor is on.
import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import { render, act, waitFor, configure } from "@testing-library/react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { liveDecorations, activeLines, LiveMarkdown, type LiveMarkdownHandle } from "./live-markdown";

configure({ asyncUtilTimeout: 6000 });
beforeAll(() => {   // jsdom has no layout: CodeMirror measures text with Range rects
  const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) } as DOMRect;
  (Range.prototype as any).getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
  (Range.prototype as any).getBoundingClientRect = () => rect;
  (document as any).elementFromPoint = () => null;
});

type D = { from: number; to: number; cls?: string; widget?: string; replace: boolean };
/** the decorations of `doc` with the cursor at `at` (the end of the doc by default), as plain records */
function decos(doc: string, at: number = doc.length): D[] {
  const state = EditorState.create({ doc, selection: { anchor: at }, extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })] });
  const out: D[] = [];
  liveDecorations(state).between(0, doc.length, (from, to, v) => { out.push({ from, to, cls: (v.spec as any).class, widget: (v.spec as any).widget?.constructor?.name, replace: to > from && !(v.spec as any).class && !(v.spec as any).widget }); });
  return out;
}
const hidden = (d: D[]) => d.filter((x) => x.replace).map((x) => [x.from, x.to]);
const has = (d: D[], cls: string, from?: number, to?: number) => d.some((x) => x.cls === cls && (from === undefined || x.from === from) && (to === undefined || x.to === to));

describe("which lines show the raw markdown", () => {
  it("the lines the cursor or the selection touches, and no others", () => {
    const s = (anchor: number, head: number) => activeLines(EditorState.create({ doc: "a\nb\nc\nd", selection: { anchor, head } }));
    expect([...s(0, 0)]).toEqual([1]); expect([...s(2, 4)]).toEqual([2, 3]); expect([...s(7, 7)]).toEqual([4]);
  });
});

describe("what is drawn over the markdown", () => {
  it("a # line is a title at once; its marks are hidden until the cursor comes to the line", () => {
    const doc = "# Title\n\nplain";
    const away = decos(doc);                                   // cursor at the end: line 3
    expect(has(away, "cm-md-h1", 0, 0)).toBe(true); expect(hidden(away)).toEqual([[0, 2]]);   // "# " is hidden
    const on = decos(doc, 3);                                  // cursor inside the title: the raw "#" is back, dimmed
    expect(has(on, "cm-md-h1", 0, 0)).toBe(true); expect(hidden(on)).toEqual([]); expect(has(on, "cm-md-mark", 0, 2)).toBe(true);   // the "# " is dimmed, not gone
    expect(has(decos("## Two\n\nx"), "cm-md-h2")).toBe(true); expect(has(decos("###### Six\n\nx"), "cm-md-h6")).toBe(true);
  });
  it("bold, italic, strike and inline code are styled, with their marks hidden off the line", () => {
    const d = decos("x\n**bold** and *it* and ~~gone~~ and `code`\ny");
    expect(has(d, "cm-md-strong")).toBe(true); expect(has(d, "cm-md-em")).toBe(true); expect(has(d, "cm-md-strike")).toBe(true); expect(has(d, "cm-md-icode")).toBe(true);
    expect(hidden(d).length).toBe(8);                          // two marks each, for four spans
    expect(hidden(decos("x\n**bold**", 3))).toEqual([]);       // the cursor is on that line: raw again
  });
  it("a link shows only its text, as a link; the brackets and the address come back on the line", () => {
    const doc = "x\n[l](http://x)\ny";
    const away = decos(doc, doc.length);
    expect(has(away, "cm-md-link", 3, 4)).toBe(true); expect(hidden(away)).toEqual([[2, 3], [4, 15]]);
    expect(hidden(decos(doc, 3))).toEqual([]);
  });
  it("a bullet is a dot, a number stays a number, a task is a checkbox, and a done task is struck through", () => {
    const d = decos("- a\n- b\n\n1. one\n\n- [ ] todo\n- [x] done\nz");
    expect(d.filter((x) => x.widget === "BulletWidget").length).toBe(2); expect(has(d, "cm-md-listnum")).toBe(true);   // the two plain items; a task has its checkbox instead of a bullet
    expect(d.filter((x) => x.widget === "CheckWidget").length).toBe(2); expect(has(d, "cm-md-done")).toBe(true);
    expect(decos("- a\n- b", 1).filter((x) => x.widget === "BulletWidget").length).toBe(1);   // the bullet on the cursor's line is raw
  });
  it("a quote has its bar and loses the > off the line; a fenced block is code, with its fences dimmed", () => {
    const q = decos("> quoted\nz"); expect(has(q, "cm-md-quote", 0, 0)).toBe(true); expect(hidden(q)).toEqual([[0, 2]]);
    const f = decos("```js\nlet a = 1\n```\nz");
    expect(f.filter((x) => x.cls === "cm-md-fence").length).toBe(3); expect(f.filter((x) => x.cls === "cm-md-fence-edge").length).toBe(2); expect(has(f, "cm-md-mark")).toBe(true);
  });
  it("a rule is drawn as a line away from the cursor", () => {
    const d = decos("a\n\n---\nb"); expect(d.some((x) => x.widget === "RuleWidget")).toBe(true);
    expect(decos("a\n\n---\nb", 4).some((x) => x.widget === "RuleWidget")).toBe(false);
  });
  it("plain text and an empty page draw nothing", () => { expect(decos("just words\nmore words")).toEqual([]); expect(decos("")).toEqual([]); });
});

describe("the live editor", () => {
  const mount = (initial: string, over: Partial<React.ComponentProps<typeof LiveMarkdown>> = {}) => {
    const ref = React.createRef<LiveMarkdownHandle>(); const onChange = vi.fn();
    const utils = render(<LiveMarkdown ref={ref} initial={initial} placeholderText="just write…" onChange={onChange} {...over} />);
    const view = () => EditorView.findFromDOM(utils.container.querySelector(".cm-editor") as HTMLElement)!;
    return { ref, onChange, view, ...utils };
  };
  it("shows the placeholder on an empty page", () => { const { container } = mount(""); expect(container.querySelector(".cm-placeholder")?.textContent).toBe("just write…"); });
  it("turns a typed # into a title as it is typed, and shows the raw markdown again on that line", async () => {
    const { view, container, onChange } = mount("first\n\n");
    act(() => view().dispatch({ changes: { from: view().state.doc.length, insert: "# Plan" }, selection: { anchor: view().state.doc.length + 6 } }));
    expect(onChange).toHaveBeenLastCalledWith("first\n\n# Plan");
    // the cursor is on the title line: raw "# Plan" with its class
    const lines = () => [...container.querySelectorAll(".cm-line")];
    await waitFor(() => expect(lines().some((l) => l.classList.contains("cm-md-h1"))).toBe(true));
    expect(lines().find((l) => l.classList.contains("cm-md-h1"))!.textContent).toBe("# Plan");
    // the cursor leaves: the # goes away and the line reads as a title
    act(() => view().dispatch({ selection: { anchor: 0 } }));
    await waitFor(() => expect(lines().find((l) => l.classList.contains("cm-md-h1"))!.textContent).toBe("Plan"));
  });
  it("draws bold as bold with the asterisks gone, away from the cursor", async () => {
    const { container, view } = mount("hello **world**\nnext");
    act(() => view().dispatch({ selection: { anchor: view().state.doc.length } }));
    await waitFor(() => expect(container.querySelector(".cm-md-strong")?.textContent).toBe("world"));
    expect(container.querySelector(".cm-content")!.textContent).toContain("hello world"); expect(container.querySelector(".cm-content")!.textContent).not.toContain("**");
  });
  it("a click on a task's checkbox rewrites the text", async () => {
    const { container, view, onChange } = mount("- [ ] buy milk\nnext");
    act(() => view().dispatch({ selection: { anchor: view().state.doc.length } }));
    const box = await waitFor(() => { const b = container.querySelector("input.cm-md-check") as HTMLInputElement; expect(b).toBeTruthy(); return b; });
    expect(box.checked).toBe(false);
    act(() => { box.click(); });
    expect(view().state.doc.toString()).toBe("- [x] buy milk\nnext"); expect(onChange).toHaveBeenLastCalledWith("- [x] buy milk\nnext");
    await waitFor(() => expect((container.querySelector("input.cm-md-check") as HTMLInputElement).checked).toBe(true));
  });
  it("keeps the text as plain markdown: what was typed is what is saved", () => {
    const { ref } = mount("# Title\n\n**bold** and [a](http://b)");
    expect(ref.current!.getText()).toBe("# Title\n\n**bold** and [a](http://b)");
    act(() => ref.current!.setText("# New")); expect(ref.current!.getText()).toBe("# New");
  });
  it("calls onBlur when the page loses focus", () => {
    const onBlur = vi.fn(); const { view } = mount("x", { onBlur });
    act(() => { view().contentDOM.dispatchEvent(new FocusEvent("blur")); }); expect(onBlur).toHaveBeenCalled();
  });
});
