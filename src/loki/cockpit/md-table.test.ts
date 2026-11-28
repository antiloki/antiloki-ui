// @vitest-environment jsdom
import { describe, expect, it, beforeAll } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { parseTable, splitRow, inlineParts, inlineNodes, safeHref, tableElement } from "./md-table";
import { tableDecorations } from "./live-markdown";

const TBL = "| Name | Qty | Note |\n|:-----|----:|:----:|\n| apple | 3 | **fresh** |\n| pear | 12 | `old` |";
describe("tables in the notes", () => {
  it("splits a row on unescaped pipes only", () => { expect(splitRow("| a | b \\| c | d |")).toEqual(["a", "b | c", "d"]); expect(splitRow("a | b")).toEqual(["a", "b"]); });
  it("reads a GFM table: header, alignment and rows padded to the header's width", () => {
    const t = parseTable(TBL)!; expect(t.head).toEqual(["Name", "Qty", "Note"]); expect(t.align).toEqual(["left", "right", "center"]); expect(t.rows).toEqual([["apple", "3", "**fresh**"], ["pear", "12", "`old`"]]);
    expect(parseTable("| a | b |\n|---|---|\n| 1 |")!.rows).toEqual([["1", ""]]); expect(parseTable("just text | here")).toBeNull(); expect(parseTable("| a |\n| not a delimiter |")).toBeNull();
  });
  it("reads inline markdown in a cell", () => {
    expect(inlineParts("a **b** `c` [d](https://x.io) ~~e~~ *f*").map((p) => p.kind)).toEqual(["text", "strong", "text", "code", "text", "link", "text", "strike", "text", "em"]);
    expect(inlineParts("see https://x.io/a now").find((p) => p.kind === "link")!.href).toBe("https://x.io/a");
  });
  it("only opens safe addresses, and builds elements, never markup from text", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull(); expect(safeHref("https://x.io")).toBe("https://x.io"); expect(safeHref("mailto:a@b.c")).toBe("mailto:a@b.c");
    const el = tableElement(document, parseTable("| h |\n|---|\n| <img src=x onerror=alert(1)> [x](javascript:alert(1)) |")!); expect(el.querySelector("img")).toBeNull(); expect(el.querySelector("a")!.getAttribute("href")).toBeNull();
    const t = tableElement(document, parseTable(TBL)!); expect(t.querySelectorAll("th").length).toBe(3); expect(t.querySelectorAll("tbody tr").length).toBe(2); expect((t.querySelector("td:nth-child(2)") as HTMLElement).style.textAlign).toBe("right"); expect(t.querySelector("strong")!.textContent).toBe("fresh");
  });
  it("draws the table as a table while the cursor is outside it, and leaves the raw rows while it is inside", () => {
    const doc = `intro\n\n${TBL}\n\nafter`; const mk = (at: number) => EditorState.create({ doc, selection: { anchor: at }, extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })] });
    let n = 0; tableDecorations(mk(0)).between(0, doc.length, () => { n++; }); expect(n).toBe(1);
    let m = 0; tableDecorations(mk(doc.indexOf("apple"))).between(0, doc.length, () => { m++; }); expect(m).toBe(0);
  });
});
