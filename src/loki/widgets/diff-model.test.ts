import { describe, it, expect } from "vitest";
import { parseDiffSummary, parsePatch, totals } from "./diff-model";

describe("the Diff pane's model", () => {
  it("reads the serve's files defensively and adds them up", () => {
    const s = parseDiffSummary({ ok: true, base: "abc1234567", ahead: 2, hidden: 3, files: [{ path: "a.ts", status: "M", add: 4, del: 1 }, { path: "img.png", status: "A", add: 0, del: 0, binary: true }, { nope: 1 }] })!;
    expect(s.files.map((f) => f.path)).toEqual(["a.ts", "img.png"]); expect(totals(s.files)).toEqual({ files: 2, add: 4, del: 1 }); expect(s.hidden).toBe(3); expect(s.files[1].binary).toBe(true);
    expect(parseDiffSummary({ ok: false, error: "x" })).toBeNull(); expect(parseDiffSummary(null)).toBeNull();
  });
  it("numbers the lines of a unified diff on both sides, and keeps the header apart", () => {
    const p = parsePatch("diff --git a/a.txt b/a.txt\nindex 1..2 100644\n--- a/a.txt\n+++ b/a.txt\n@@ -1,3 +1,4 @@\n one\n-two\n+TWO\n+three\n four\n\\ No newline at end of file\n");
    expect(p.slice(0, 4).every((l) => l.kind === "meta")).toBe(true); expect(p[4]).toMatchObject({ kind: "hunk" });
    expect(p.filter((l) => l.kind !== "meta" && l.kind !== "hunk").map((l) => `${l.kind}:${l.old ?? "-"}:${l.now ?? "-"}:${l.text}`)).toEqual(["ctx:1:1:one", "del:2:-:two", "add:-:2:TWO", "add:-:3:three", "ctx:3:4:four"]);
    expect(p[p.length - 1].kind).toBe("meta");
  });
});
