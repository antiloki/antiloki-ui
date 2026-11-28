// THE INTERCEPT (2026-09-20): what the operator types is tracked so Enter can hand the line to Heimdall.
import { describe, it, expect } from "vitest";
import { trackLine, worthRouting } from "./opencode-pane";

describe("trackLine", () => {
  it("accumulates text, backspaces, and says when Enter comes", () => {
    let s = trackLine("", "m"); s = trackLine(s.buf, "ake"); s = trackLine(s.buf, " it fastr"); s = trackLine(s.buf, "\x7f"); s = trackLine(s.buf, "er");
    expect(s.buf).toBe("make it faster"); expect(s.enter).toBe(false); expect(s.tracked).toBe(true);
    expect(trackLine(s.buf, "\r")).toEqual({ buf: "make it faster", enter: true, tracked: true });
  });
  it("a pasted block loses its bracketed-paste markers; an escape sequence gives up tracking", () => {
    expect(trackLine("", "\x1b[200~gate it behind the flag\x1b[201~").buf).toBe("gate it behind the flag");
    expect(trackLine("abc", "\x1b[A")).toEqual({ buf: "", enter: false, tracked: false }); // ↑ = the CLI's history
    expect(trackLine("abc", "\x03")).toEqual({ buf: "", enter: false, tracked: true }); // ctrl+c / ctrl+u: an empty composer, tracking resumes
    expect(trackLine("abc", "\x1b[I")).toEqual({ buf: "abc", enter: false, tracked: true }); // a focus event is not a keystroke
    expect(trackLine("abc", "\t").tracked).toBe(false);
  });
});
describe("worthRouting", () => {
  it("routes an ask; leaves slash commands, y/n and menu picks to the CLI", () => {
    expect(worthRouting("make the heap faster")).toBe(true);
    expect(worthRouting("/model sonnet")).toBe(false);
    // operator 2026-09-29: "add filters" (11 characters) never reached Heimdall and the chat model did the work itself
    expect(worthRouting("add filters")).toBe(true);
    expect(worthRouting("fix login")).toBe(true);
    expect(worthRouting("go")).toBe(false);          // resolved by the serve's front against what is pending
    expect(worthRouting("yes")).toBe(false);
    expect(worthRouting("filters")).toBe(false);     // one word is not an ask
    expect(worthRouting("what next")).toBe(false);   // short and not an imperative: the chat answers
    expect(worthRouting("y")).toBe(false);
    expect(worthRouting("2")).toBe(false);
    expect(worthRouting("!ls -la")).toBe(false);
    expect(worthRouting("pineapple")).toBe(false);
  });
});
