// AN EPISODE IS A CONSOLIDATION, NOT A ROW (operator 2026-09-25: "the episodes under the agent now is a flat
// list, ok, but before the episodes had a better design and showed like summaries like a consolidation").
// The serve always sent the whole thing; the list rendered three fields of it.
import { describe, it, expect } from "vitest";
import { episodeSummary } from "./agents-tab";

describe("an episode as a consolidation", () => {
  it("leads with its name, and falls back to the ask it opened on", () => {
    expect(episodeSummary({ n: 1, title: "the login fix", first_ask: "please fix login" }).head).toBe("the login fix");
    // an episode nobody named is not "episode" — it is what was asked
    expect(episodeSummary({ n: 1, first_ask: "please fix the login page\nand the header" }).head).toBe("please fix the login page");
    expect(episodeSummary({ n: 1 }).head).toBe("episode");
  });

  it("carries the consolidation's own line, and the engine's story when there is no subtitle", () => {
    expect(episodeSummary({ n: 1, subtitle: "three files, the gate green" }).body).toBe("three files, the gate green");
    // the story is trimmed to its first sentence — a paragraph in a sidebar row is not a summary
    expect(episodeSummary({ n: 1, story: "Rewrote the totals. Then ran the tests. Then stopped." }).body).toBe("Rewrote the totals.");
    expect(episodeSummary({ n: 1 }).body).toBe("");
  });

  it("says what it cost in turns, replies and which engine ran it", () => {
    expect(episodeSummary({ n: 1, turns: 1, replies: 1, engine: "codex" }).meta).toBe("1 turn · 1 reply · codex");
    expect(episodeSummary({ n: 1, turns: 4, replies: 3 }).meta).toBe("4 turns · 3 replies");
    // a fresh episode has nothing to report and says nothing, rather than "0 turns · 0 replies"
    expect(episodeSummary({ n: 2 }).meta).toBe("");
  });

  it("a long ask is cut, not allowed to push the row apart", () => {
    const long = "x".repeat(200);
    expect(episodeSummary({ n: 1, first_ask: long }).head).toHaveLength(70);
  });
});
