import { describe, it, expect } from "vitest";
import { traceOf, dur, oneLine, verbOf } from "./turn-trace";

const base = { tools: [], replies: [], notes: [] };
const ask = { t: 1000, text: "fix the totals\nand the header" };

describe("a turn's stack trace", () => {
  it("reads in the order it happened", () => {
    const t = traceOf({
      ...base, user: ask,
      notes: [{ t: 2, text: "model → sonnet" }, { t: 3, text: "test gate green", tone: "ok" }],
      tools: [{ name: "Edit" }, { name: "Read" }],
      replies: [{ t: 4, model: "sonnet" }],
      result: { t: 5, cost: 0.0312, ms: 41_000, turns: 1 },
    }, "⚡ one job · tier mid · 75% measured");
    expect(t.map((l) => l.text)).toEqual([
      "you asked", "heimdall routed it", "answered by", "2 tool calls", "test gate green", "done",
    ]);
    expect(t[0].detail).toBe("fix the totals");          // one line, never the whole ask
    expect(t[1].detail).toBe("one job · tier mid · 75% measured");
    expect(t[2].detail).toBe("sonnet");
    expect(t[5].detail).toBe("41.0s · $0.03");
    // …and a sub-cent turn keeps four decimals, because "$0.00" reads as free and a cheap merge is the point
    const cheap = traceOf({ ...base, user: ask, result: { t: 5, cost: 0.0004, ms: 1200, turns: 1 } }, null);
    expect(cheap[cheap.length - 1].detail).toBe("1.2s · $0.0004");
    expect(t[5].tone).toBe("ok");
  });

  it("says routing while it is routing, and working while it works", () => {
    const t = traceOf({ ...base, user: ask }, null, true);
    expect(t.map((l) => l.text)).toEqual(["you asked", "heimdall is reading the ask…", "working"]);
  });

  it("counts failed tool calls separately, because they are the interesting half", () => {
    const t = traceOf({ ...base, user: ask, tools: [{ name: "Edit" }, { name: "Edit", error: true }] }, null);
    expect(t.find((l) => l.text === "1 of them failed")?.tone).toBe("warn");
    expect(t.find((l) => l.text === "2 tool calls")?.tone).toBe("warn");
  });

  it("says when the same thing was asked again, before it judges this turn", () => {
    const t = traceOf({
      ...base, user: ask,
      notes: [{ t: 2, text: "asked again (91% like the ask 2 turns ago) — the first answer may not have held", tone: "warn" },
              { t: 3, text: "test gate green", tone: "ok" }],
      result: { t: 4, cost: 0.01, ms: 1000, turns: 1 },
    }, null);
    const texts = t.map((l) => l.text);
    // it is about the PREVIOUS turn, so it comes before this turn's verdicts
    expect(texts.indexOf("asked again (91% like the ask 2 turns ago) — the first answer may not have held"))
      .toBeLessThan(texts.indexOf("test gate green"));
    expect(t.find((l) => l.glyph === "↻")?.tone).toBe("warn");
    // and it is not printed twice by the gate loop
    expect(texts.filter((x) => x.startsWith("asked again"))).toHaveLength(1);
  });

  it("a failure is not dressed as a success", () => {
    const t = traceOf({ ...base, user: ask, result: { t: 2, cost: 0, ms: 900, turns: 1, error: "the engine exited" } }, null);
    const last = t[t.length - 1];
    expect(last.text).toBe("failed");
    expect(last.tone).toBe("bad");
    expect(last.detail).toBe("900ms");     // no price invented for a turn that bought nothing
  });

  it("invents no stage that is not in the log", () => {
    // no model announced, no tools, no gates, no result: three honest lines
    expect(traceOf({ ...base, user: ask }, null).map((l) => l.text)).toEqual(["you asked"]);
    expect(traceOf({ ...base }, "⚡ one job")).toEqual([]);   // no ask, no trace
  });

  it("formats durations the way a person reads them", () => {
    expect(dur(410)).toBe("410ms"); expect(dur(1400)).toBe("1.4s");
    expect(dur(125_000)).toBe("2m 05s"); expect(dur(0)).toBe("");
  });
});

// ── ONE LINE PER TURN (the operator's "read instead of watch") ──────────────────────────────────────────────────────
describe("oneLine", () => {
  const turn = (o: Partial<any> = {}) => ({ user: { t: 1, text: "do it" }, tools: [], replies: [], notes: [], ...o });

  it("counts what the turn actually did, in verbs a person recognises", () => {
    const line = oneLine(turn({
      tools: [{ name: "Read" }, { name: "Read" }, { name: "Edit" }, { name: "Bash" }],
      result: { t: 2, cost: 0.0213, ms: 1400, turns: 1 },
    }));
    expect(line).toBe("read ×2 · wrote ×1 · ran ×1 · 1.4s · $0.02");
    // and under a cent it keeps four decimals, the same rule the full trace uses
    expect(oneLine(turn({ tools: [{ name: "Read" }], result: { t: 2, cost: 0.0009, ms: 500, turns: 1 } }))).toContain("$0.0009");
  });

  it("names a tool it cannot classify instead of forcing it into a bucket", () => {
    expect(verbOf("mcp__antiloki__xray_atlas")).toBe("xray_atlas");
    expect(verbOf("MultiEdit")).toBe("wrote");
    expect(verbOf("Glob")).toBe("searched");
  });

  it("carries the gates' own words, and says FAILED first when the turn failed", () => {
    const withGate = oneLine(turn({ notes: [{ t: 2, text: "test 18 passed — the project's own runner" }], result: { t: 3, cost: 0, ms: 900, turns: 1 } }));
    expect(withGate).toContain("test 18 passed");
    const failed = oneLine(turn({ tools: [{ name: "Edit" }], result: { t: 3, cost: 0.01, ms: 900, turns: 1, error: "the engine died" } }));
    expect(failed.startsWith("failed")).toBe(true);
    expect(failed).not.toContain("$");
  });

  it("says nothing about a stage the turn does not have", () => {
    expect(oneLine(turn())).toBe("");
    expect(oneLine(turn({ tools: [{ name: "Read" }] }))).toBe("read ×1");
  });

  it("counts failed tool calls apart, because the failures are the interesting half", () => {
    expect(oneLine(turn({ tools: [{ name: "Bash" }, { name: "Bash", error: true }] }))).toBe("ran ×2 · 1 failed");
  });
});
