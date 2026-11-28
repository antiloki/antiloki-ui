// WHAT THE SERVER MAKES OF A KIND IT DOES NOT KNOW: the rows come back as notes, and the tools still find theirs by shape.
import { describe, it, expect } from "vitest";
import { isIssueRow, isPrefRow, isBrainstormMsgRow, isBrainstormChipsRow } from "./tool-rows";

const note = (body: unknown) => ({ kind: "note", body_md: typeof body === "string" ? body : JSON.stringify(body) });
describe("tool rows by kind or by shape", () => {
  it("an issue is its own kind, or a note holding exactly an issue", () => {
    expect(isIssueRow({ kind: "issue", body_md: "x" })).toBe(true);
    expect(isIssueRow(note({ n: 1, title: "Fix it", status: "todo", priority: 0 }))).toBe(true);
    expect(isIssueRow(note({ n: 1, title: "Fix it", status: "weird", priority: 0 }))).toBe(false);   // not a status
    expect(isIssueRow(note({ title: "A person's own JSON note", status: "todo" }))).toBe(false);       // missing fields
    expect(isIssueRow(note("a plain prose note"))).toBe(false); expect(isIssueRow({ kind: "todo", body_md: "[ ] x" })).toBe(false);
  });
  it("the list/board choice, a conversation message and the chosen options are recognised the same way", () => {
    expect(isPrefRow(note({ view: "board" }))).toBe(true); expect(isPrefRow(note({ view: "carousel" }))).toBe(false); expect(isPrefRow({ kind: "pref", body_md: "" })).toBe(true);
    expect(isBrainstormMsgRow(note({ role: "you", text: "hi", chips: "fix" }))).toBe(true); expect(isBrainstormMsgRow(note({ role: "robot", text: "hi" }))).toBe(false);
    expect(isBrainstormMsgRow(note({ role: "you", text: "hi", extra: 1 }))).toBe(false); expect(isBrainstormMsgRow({ kind: "brainstorm", body_md: "" })).toBe(true);
    expect(isBrainstormChipsRow(note({ kind: "fix", areas: [], bold: "balanced", musts: [] }))).toBe(true); expect(isBrainstormChipsRow(note({ kind: "fix", areas: "x", bold: "b", musts: [] }))).toBe(false);
  });
  it("never takes a real note of another kind of row for one of theirs", () => {
    for (const fn of [isIssueRow, isPrefRow, isBrainstormMsgRow, isBrainstormChipsRow]) { expect(fn({ kind: "todo", body_md: JSON.stringify({ view: "list" }) })).toBe(false); expect(fn({ kind: "sketch", body_md: "{}" })).toBe(false); }
  });
});
