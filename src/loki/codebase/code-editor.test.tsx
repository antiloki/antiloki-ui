// @vitest-environment jsdom
// THE CODE EDITOR (operator 2026-10-11): editable, saved with Ctrl/Cmd+S, dirty tracking against the saved text, the cards above blocks kept, and what is typed handed back when the editor goes away.
import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import { CodeEditor, lf, indentOf, isDarkBackground, clampLines, type CodeEditorHandle } from "./code-editor";

// jsdom has no layout: CodeMirror measures text with Range rects
beforeAll(() => {
  const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) } as DOMRect;
  (Range.prototype as any).getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
  (Range.prototype as any).getBoundingClientRect = () => rect;
  (document as any).elementFromPoint = () => null;
});

describe("pure helpers", () => {
  it("works in LF whatever the file's line endings", () => { expect(lf("a\r\nb\rc\nd")).toBe("a\nb\nc\nd"); });
  it("keeps the indentation the file already uses", () => {
    expect(indentOf("function a() {\n    return 1;\n}\n")).toBe("    ");
    expect(indentOf("a:\n  b: 1\n  c:\n    d: 2\n")).toBe("  ");
    expect(indentOf("x {\n\ty;\n\tz;\n}\n")).toBe("\t");
    expect(indentOf("no indentation at all\n")).toBe("  ");
  });
  it("reads a dark theme from the background's lightness", () => {
    expect(isDarkBackground("oklch(0.17 0.01 55)")).toBe(true); expect(isDarkBackground("oklch(96% 0.01 80)")).toBe(false); expect(isDarkBackground("oklch(0.97 0.01 80)")).toBe(false); expect(isDarkBackground("")).toBe(true);
  });
  it("puts cards on real lines, in order, once each", () => {
    expect(clampLines([4, 0, 4, 99, -3, NaN], 10)).toEqual([1, 5, 10]); expect(clampLines([], 10)).toEqual([]); expect(clampLines([0], 0)).toEqual([1]);
  });
});

function mount(over: Partial<React.ComponentProps<typeof CodeEditor>> = {}) {
  const ref = React.createRef<CodeEditorHandle>();
  const onDirty = vi.fn(), onSave = vi.fn(), onLeave = vi.fn();
  const utils = render(<CodeEditor ref={ref} docKey="a#1" path="src/a.ts" initial={"const a = 1;\nexport default a;\n"} fontSize={12} onDirty={onDirty} onSave={onSave} onLeave={onLeave} {...over} />);
  return { ref, onDirty, onSave, onLeave, ...utils };
}

describe("the editor", () => {
  it("shows the file's text, editable, with line numbers", async () => {
    const { ref, container } = mount();
    expect(ref.current!.getText()).toBe("const a = 1;\nexport default a;\n");
    expect(container.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("true");
    expect(container.querySelector(".cm-lineNumbers")).toBeTruthy();
    expect(container.querySelector(".cm-content")!.textContent).toContain("export default a;");
  });
  it("is dirty when the text differs from what is on disk, and clean again once that text is saved", () => {
    const { ref, onDirty } = mount();
    expect(onDirty).toHaveBeenLastCalledWith(false);
    act(() => ref.current!.setText("const a = 2;\n")); expect(onDirty).toHaveBeenLastCalledWith(true);
    act(() => ref.current!.markSaved("const a = 2;\n")); expect(onDirty).toHaveBeenLastCalledWith(false);
    act(() => ref.current!.setText("const a = 1;\n")); expect(onDirty).toHaveBeenLastCalledWith(true);   // measured against the NEW saved text
  });
  it("a CRLF file opens as LF and is not dirty for it", () => {
    const { ref, onDirty } = mount({ initial: "a\r\nb\r\n", saved: "a\r\nb\r\n" });
    expect(ref.current!.getText()).toBe("a\nb\n"); expect(onDirty).toHaveBeenLastCalledWith(false);
  });
  it("an unsaved draft opens dirty against the saved text", () => {
    const { onDirty } = mount({ initial: "draft\n", saved: "disk\n" });
    expect(onDirty).toHaveBeenLastCalledWith(true);
  });
  it("Ctrl+S saves instead of the browser's own handling", () => {
    const { container, onSave } = mount();
    const content = container.querySelector(".cm-content")!;
    const ev = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { content.dispatchEvent(ev); });
    expect(onSave).toHaveBeenCalledTimes(1); expect(ev.defaultPrevented).toBe(true);
  });
  it("a read-only file (too large to open whole) cannot be typed into", () => {
    const { container } = mount({ readOnly: true });
    expect(container.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("false");
  });
  it("hands back what was typed when it goes away, so the pane can keep it as a draft", () => {
    const { ref, unmount, onLeave } = mount();
    act(() => ref.current!.setText("typed but not saved\n"));
    unmount();
    expect(onLeave).toHaveBeenCalledWith("typed but not saved\n", true, "a#1");   // and WHICH document it was
  });
  it("a document that was not touched is handed back clean", () => {
    const { unmount, onLeave } = mount(); unmount();
    expect(onLeave).toHaveBeenCalledWith("const a = 1;\nexport default a;\n", false, "a#1");
  });
  it("renders the doc cards above their blocks, through portals, and moves them to the next load", async () => {
    const cards = new Map<number, React.ReactNode>([[0, <span data-testid="card0">card for line 1</span>], [1, <span data-testid="card1">card for line 2</span>]]);
    const { container } = mount({ decorations: cards });
    await waitFor(() => expect(screen.getByTestId("card0")).toBeTruthy());
    expect(container.querySelectorAll(".cm-react-block").length).toBe(2);
    expect(screen.getByTestId("card1").textContent).toBe("card for line 2");
  });
  it("tints the lines the coverage view colours", () => {
    const { container } = mount({ heatLines: new Map([[0, "rgb(1, 2, 3)"]]) });
    const line = container.querySelector(".cm-line") as HTMLElement;
    expect(line.getAttribute("style") ?? "").toContain("rgb(1, 2, 3)");
  });
  it("jumps to a line and pulses it", () => {
    const { container } = mount({ blink: { line: 1, nonce: 1 } });
    expect(container.querySelector(".cm-blink-line")).toBeTruthy();
  });
  it("goToLine puts the cursor on that line", () => {
    const { ref } = mount();
    act(() => ref.current!.goToLine(2));
    expect(ref.current!.getText().split("\n")[1]).toBe("export default a;");
  });
});
