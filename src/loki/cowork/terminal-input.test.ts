import { describe, it, expect } from "vitest";
import { bufferLines, copyChord, fileRef, givableFile, newlineFor, type KeyLike } from "./terminal-input";

const k = (o: Partial<KeyLike>): KeyLike => ({ type: "keydown", key: "Enter", shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...o });
describe("at an agent's terminal", () => {
  it("Shift+Enter is a new line (only going down, only Shift), plain Enter is not", () => {
    expect(newlineFor(k({ shiftKey: true }))).toBe("\n"); expect(newlineFor(k({}))).toBeNull(); expect(newlineFor(k({ shiftKey: true, type: "keyup" }))).toBeNull(); expect(newlineFor(k({ shiftKey: true, ctrlKey: true }))).toBeNull(); expect(newlineFor(k({ key: "a", shiftKey: true }))).toBeNull();
  });
  it("copies on Ctrl+Shift+C, Cmd+C, and Ctrl+C only while something is selected (otherwise it is the interrupt)", () => {
    expect(copyChord(k({ key: "C", ctrlKey: true, shiftKey: true }), false)).toBe(true); expect(copyChord(k({ key: "c", metaKey: true }), false)).toBe(true);
    expect(copyChord(k({ key: "c", ctrlKey: true }), true)).toBe(true); expect(copyChord(k({ key: "c", ctrlKey: true }), false)).toBe(false); expect(copyChord(k({ key: "x", ctrlKey: true, shiftKey: true }), true)).toBe(false); expect(copyChord(k({ key: "c", ctrlKey: true, type: "keyup" }), true)).toBe(false);
  });
  it("names a file to an agent as @path and picks the first file it can be given", () => {
    expect(fileRef(".antiloki/attachments/1-shot.png")).toBe("@.antiloki/attachments/1-shot.png "); expect(fileRef("a b/c.png")).toBe("@a\\ b/c.png ");
    const f = (type: string, name = "x") => new File(["x"], name, { type });
    expect(givableFile([f("application/zip"), f("image/png", "p.png")])?.name).toBe("p.png"); expect(givableFile([f("application/x-sh")])).toBeNull(); expect(givableFile(null)).toBeNull(); expect(givableFile([f("application/pdf", "a.pdf")])?.name).toBe("a.pdf");
  });
  it("reads a buffer the way a person copies it: no trailing spaces, no trailing empty lines, a range", () => {
    const lines = ["hello   ", "world", "", "   ", ""]; const at = (i: number) => lines[i];
    expect(bufferLines(lines.length, at)).toBe("hello\nworld"); expect(bufferLines(lines.length, at, 1, 2)).toBe("world"); expect(bufferLines(0, at)).toBe("");
  });
});
