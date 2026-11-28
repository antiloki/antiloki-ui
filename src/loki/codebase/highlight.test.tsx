// The highlighter is hand-rolled precisely so the IDE surfaces don't pull in Shiki, which means the
// tokenizer's carry state (a block comment or a template literal that spans lines) has no grammar
// behind it — if the carry leaks, every line after an unterminated /* renders as code and the
// preview looks corrupt. The editor's key handling is the other half: it rewrites the operator's
// buffer on every bracket, so a wrong branch silently eats characters as they type.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { TokLine, TokCode, Highlighted, CodeEditor, autoEditKeydown } from "./highlight";

// The rendered spans, as [text, colour] — the tokenizer's observable output.
const spansOf = (el: HTMLElement) =>
  Array.from(el.querySelectorAll("span")).map((s) => [s.textContent, s.style.color] as const);
const colourOf = (el: HTMLElement, text: string) =>
  spansOf(el).find(([t]) => t === text)?.[1] ?? null;

describe("TokLine colours the pieces of one line differently", () => {
  it("gives keywords, strings, numbers and identifiers distinct colours", () => {
    const { container } = render(<TokLine text={'const x = "hi" + 42'} />);
    const kw = colourOf(container, "const");
    const str = colourOf(container, '"hi"');
    const num = colourOf(container, "42");
    expect(kw).toBeTruthy();
    expect(new Set([kw, str, num]).size).toBe(3);
  });

  it("colours a call site differently from a bare identifier", () => {
    const { container } = render(<TokLine text={"doThing(value)"} />);
    expect(colourOf(container, "doThing")).not.toBe(colourOf(container, "value"));
  });

  it("treats a Capitalised word as a type", () => {
    const { container } = render(<TokLine text={"let a: MyType = b"} />);
    expect(colourOf(container, "MyType")).not.toBe(colourOf(container, "b"));
  });

  it("takes the rest of the line as a comment when the comment opens the token", () => {
    const { container } = render(<TokLine text={"// const is not a keyword here"} />);
    expect(spansOf(container)[0][0]).toBe("// const is not a keyword here");
    const { container: py } = render(<TokLine text={"# a python comment with def in it"} />);
    expect(spansOf(py)[0][0]).toBe("# a python comment with def in it");
  });

  it("does NOT catch a trailing comment that follows code on the same line", () => {
    // Characterisation, not endorsement: the punctuation rule is greedy over non-word characters, so
    // the leading " //" is consumed as punctuation and the comment body is tokenised as code —
    // `const` after a trailing `//` still renders keyword-coloured. Cosmetic only (no text is lost,
    // as the round-trip test above proves); this is where a fix would be pinned if one is wanted.
    const { container } = render(<TokLine text={"a = 1 // const here"} />);
    const kw = colourOf(container, "const");
    const { container: plain } = render(<TokLine text={"const a = 1"} />);
    expect(kw).toBe(colourOf(plain, "const"));
  });

  it("recognises keywords from several languages, not just JS", () => {
    const { container } = render(<TokLine text={"def go impl elif func"} />);
    const kwColour = colourOf(container, "def");
    for (const w of ["go", "impl", "elif", "func"]) expect(colourOf(container, w), w).toBe(kwColour);
  });

  it("renders empty and nullish input without throwing", () => {
    expect(() => render(<TokLine text={""} />)).not.toThrow();
    expect(() => render(<TokLine text={undefined as any} />)).not.toThrow();
  });

  it("never drops characters — the spans rejoin into the original line", () => {
    for (const line of [
      'const s = "a b" ; x(1,2) // end',
      "a['k'] = `t` + 0x1F",
      "if (x >= 2) { return null; }",
      "   indented(); ",
    ]) {
      const { container } = render(<TokLine text={line} />);
      expect(spansOf(container).map(([t]) => t).join(""), line).toBe(line);
    }
  });
});

describe("carry state across lines", () => {
  const lineTexts = (c: HTMLElement) => Array.from(c.querySelectorAll(":scope > div")).map((d) => d.textContent);

  it("keeps an unterminated block comment comment-coloured until it closes", () => {
    const { container } = render(<TokCode code={"/* open\nstill comment\nclose */ const a = 1"} />);
    const divs = Array.from(container.querySelectorAll(":scope > div"));
    const colour = (d: Element) => (d.querySelector("span") as HTMLElement).style.color;
    expect(colour(divs[0])).toBe(colour(divs[1]));           // line 2 inherited the comment
    // after the closer, `const` is a keyword again — a different colour from the comment
    const kw = Array.from(divs[2].querySelectorAll("span")).find((s) => s.textContent === "const") as HTMLElement;
    expect(kw.style.color).not.toBe(colour(divs[0]));
  });

  it("carries an open template literal across lines and ends it at the backtick", () => {
    const { container } = render(<TokCode code={"const t = `line one\nstill string`\nconst done = 1"} />);
    const divs = Array.from(container.querySelectorAll(":scope > div"));
    const second = Array.from(divs[1].querySelectorAll("span")) as HTMLElement[];
    expect(second[0].textContent).toBe("still string`");
    const third = Array.from(divs[2].querySelectorAll("span")) as HTMLElement[];
    expect(third[0].textContent).toBe("const");
    expect(third[0].style.color).not.toBe(second[0].style.color);
  });

  it("renders a blank line as a non-collapsing space so the gutter stays aligned", () => {
    const { container } = render(<TokCode code={"a\n\nb"} />);
    expect(lineTexts(container)).toEqual(["a", " ", "b"]); // NBSP, not a collapsible space
  });

  it("emits exactly one row per source line", () => {
    const { container } = render(<TokCode code={"1\n2\n3\n4"} />);
    expect(container.querySelectorAll(":scope > div")).toHaveLength(4);
  });
});

describe("Highlighted", () => {
  const CODE = "const a = 1\nconst b = 2\nconst c = 3";

  it("numbers every line from 1 in a non-selectable gutter", () => {
    const { container } = render(<Highlighted code={CODE} />);
    const gutter = Array.from(container.querySelectorAll(":scope > div > span:first-child")) as HTMLElement[];
    expect(gutter.map((s) => s.textContent)).toEqual(["1", "2", "3"]);
    expect(gutter[0].style.userSelect).toBe("none"); // copying code must not drag the numbers along
  });

  it("tints the selected range and leaves the rest alone", () => {
    const { container } = render(<Highlighted code={CODE} sel={{ a: 0, b: 1 }} />);
    const rows = Array.from(container.querySelectorAll(":scope > div")) as HTMLElement[];
    expect(rows[0].style.background).toBeTruthy();
    expect(rows[1].style.background).toBe(rows[0].style.background);
    expect(rows[2].style.background).toBe("");
  });

  it("accepts a selection given backwards (drag upward)", () => {
    const { container } = render(<Highlighted code={CODE} sel={{ a: 2, b: 1 }} />);
    const rows = Array.from(container.querySelectorAll(":scope > div")) as HTMLElement[];
    expect(rows[0].style.background).toBe("");
    expect(rows[2].style.background).toBeTruthy();
  });

  it("reports the clicked line and whether shift was held — only when selectable", () => {
    const onLineDown = vi.fn();
    const { container, rerender } = render(<Highlighted code={CODE} selectable onLineDown={onLineDown} />);
    const rows = () => Array.from(container.querySelectorAll(":scope > div")) as HTMLElement[];
    fireEvent.mouseDown(rows()[1], { shiftKey: true });
    expect(onLineDown).toHaveBeenCalledWith(1, true);

    onLineDown.mockClear();
    rerender(<Highlighted code={CODE} onLineDown={onLineDown} />);
    fireEvent.mouseDown(rows()[1]);
    expect(onLineDown).not.toHaveBeenCalled();
  });

  it("tints changed lines and marks their gutter number", () => {
    const { container } = render(<Highlighted code={CODE} changedLines={new Set([1])} />);
    const rows = Array.from(container.querySelectorAll(":scope > div")) as HTMLElement[];
    expect(rows[1].style.background).toContain("color-mix");
    expect((rows[1].querySelector("span") as HTMLElement).style.color)
      .not.toBe((rows[0].querySelector("span") as HTMLElement).style.color);
  });

  it("lets a coverage heat colour win over the changed-line tint", () => {
    const { container } = render(
      <Highlighted code={CODE} changedLines={new Set([0])} heatLines={new Map([[0, "rgb(1, 2, 3)"]])} />);
    const row = container.querySelector(":scope > div") as HTMLElement;
    expect(row.style.background).toBe("rgb(1, 2, 3)");
  });

  it("renders a decoration ABOVE the line it annotates", () => {
    const deco = new Map<number, React.ReactNode>([[1, <b key="d">note</b>]]);
    const { container } = render(<Highlighted code={CODE} decorations={deco} />);
    const kids = Array.from(container.children).map((c) => c.textContent);
    expect(kids[1]).toBe("note");
    expect(kids[2]).toContain("const b");
  });

  it("scrolls the blinking line into view and replays the pulse on a new nonce", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container, rerender } = render(<Highlighted code={CODE} blink={{ line: 2, nonce: 1 }} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    const row = (container.querySelectorAll(":scope > div")[2] as HTMLElement);
    expect(row.style.animation).toContain("loki-line-blink");

    rerender(<Highlighted code={CODE} blink={{ line: 2, nonce: 2 }} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(2); // same line, clicked again → re-centred
  });

  it("installs the pulse keyframes exactly once no matter how many previews mount", () => {
    render(<Highlighted code={CODE} blink={{ line: 0, nonce: 1 }} />);
    render(<Highlighted code={CODE} blink={{ line: 0, nonce: 1 }} />);
    const sheets = Array.from(document.head.querySelectorAll("style"))
      .filter((s) => s.textContent?.includes("loki-line-blink"));
    expect(sheets).toHaveLength(1);
  });
});

describe("autoEditKeydown — the editor rewrites the buffer as the operator types", () => {
  // A controlled harness: exactly how CodeEditor drives it, so the assertions are on real behaviour.
  function Harness({ initial = "", onValue }: { initial?: string; onValue?: (v: string) => void }) {
    const [v, setV] = React.useState(initial);
    return (
      <textarea
        aria-label="code"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => autoEditKeydown(e, v, (nv) => { setV(nv); onValue?.(nv); })}
      />
    );
  }
  const at = (ta: HTMLTextAreaElement, a: number, b = a) => { ta.selectionStart = a; ta.selectionEnd = b; };
  // Scoped to its own container so a loop of scenarios doesn't leave ambiguous textareas behind.
  const box = (initial = "") => {
    const { container } = render(<Harness initial={initial} />);
    return container.querySelector("textarea") as HTMLTextAreaElement;
  };

  it("inserts two spaces for Tab instead of leaving the field", () => {
    const ta = box("ab");
    at(ta, 1);
    fireEvent.keyDown(ta, { key: "Tab" });
    expect(ta.value).toBe("a  b");
  });

  it("auto-closes every bracket and quote pair", () => {
    for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"], ['"', '"'], ["'", "'"], ["`", "`"]]) {
      const ta = box("");
      at(ta, 0);
      fireEvent.keyDown(ta, { key: open });
      expect(ta.value, open).toBe(open + close);
    }
  });

  it("wraps a selection rather than replacing it", () => {
    const ta = box("hello");
    at(ta, 0, 5);
    fireEvent.keyDown(ta, { key: "(" });
    expect(ta.value).toBe("(hello)");
  });

  it("steps over a closer instead of doubling it", () => {
    const ta = box("()");
    at(ta, 1);
    fireEvent.keyDown(ta, { key: ")" });
    expect(ta.value).toBe("()"); // unchanged — the caret just moved past it
  });

  it("backspace removes a whole empty pair", () => {
    const ta = box("()");
    at(ta, 1);
    fireEvent.keyDown(ta, { key: "Backspace" });
    expect(ta.value).toBe("");
  });

  it("backspace in the middle of text is left to the browser", () => {
    const ta = box("abc");
    at(ta, 2); // between b and c — not an empty pair
    fireEvent.keyDown(ta, { key: "Backspace" });
    expect(ta.value).toBe("abc"); // handler declined; the native edit is what changes it
  });

  it("backspace at the very end deletes exactly one character, same as the browser would", () => {
    // The pair check compares two undefineds past the end of the buffer, so the handler takes this
    // case — it must stay equivalent to a plain backspace or the last character would vanish twice.
    const ta = box("ab");
    at(ta, 2);
    fireEvent.keyDown(ta, { key: "Backspace" });
    expect(ta.value).toBe("a");
  });

  it("Enter inside a brace pair opens an indented block that keeps the current indent", () => {
    const ta = box("  if (x) {}");
    at(ta, 10); // between { and }
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(ta.value).toBe("  if (x) {\n    \n  }");
  });

  it("Enter that is not inside a pair is left alone", () => {
    const ta = box("abc");
    at(ta, 3);
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(ta.value).toBe("abc");
  });

  it("an ordinary character is left to the browser", () => {
    const ta = box("");
    at(ta, 0);
    fireEvent.keyDown(ta, { key: "a" });
    expect(ta.value).toBe("");
  });
});

describe("CodeEditor overlays a transparent textarea on the highlighted render", () => {
  it("shows the value twice: once coloured, once as the real (invisible) input", () => {
    const onChange = vi.fn();
    const { container } = render(<CodeEditor value={"const a = 1"} onChange={onChange} />);
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta.value).toBe("const a = 1");
    expect(ta.style.color).toBe("transparent");     // the colour comes from the layer beneath
    expect(ta.style.caretColor).toBeTruthy();       // but the caret must stay visible
    expect(container.querySelector("[aria-hidden]")).toBeTruthy(); // the paint layer is not read out
  });

  it("reports edits to its owner", () => {
    const onChange = vi.fn();
    const { container } = render(<CodeEditor value={"a"} onChange={onChange} />);
    fireEvent.change(container.querySelector("textarea")!, { target: { value: "ab" } });
    expect(onChange).toHaveBeenCalledWith("ab");
  });

  it("keeps the paint layer scrolled with the input", () => {
    const { container } = render(<CodeEditor value={"a\nb\nc"} onChange={() => {}} />);
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    const paint = container.querySelector("[aria-hidden]") as HTMLElement;
    ta.scrollTop = 40; ta.scrollLeft = 12;
    fireEvent.scroll(ta);
    expect(paint.scrollTop).toBe(40);
    expect(paint.scrollLeft).toBe(12);
  });

  it("renders a placeholder space for an empty buffer so the gutter still draws", () => {
    const { container } = render(<CodeEditor value={""} onChange={() => {}} />);
    expect(container.querySelector("[aria-hidden] span, [aria-hidden] code")).toBeTruthy();
  });
});
