import { describe, it, expect } from "vitest";
import { fmtTokens, summaryParts, savedSentence, shouldShow, stripReduce, live, timerFraction, money, secs, DEFAULT_SETTINGS, type Usage, type Item } from "./strip-model";
import { metaLine } from "../cockpit/chat-flow";

const U: Usage = { tokensIn: 42_100, tokensOut: 3_800, cost: 0.31, baseline: 3.1, ms: 294_800, turns: 19, tools: 6, failed: 0, against: "claude · opus" };
const item = (pane = "p1", u: Usage = U): Item => ({ usage: u, pane });

describe("wording", () => {
  it("formats tokens", () => {
    expect([fmtTokens(950), fmtTokens(3800), fmtTokens(42_100), fmtTokens(1_200_000), fmtTokens(10_000), fmtTokens(undefined), fmtTokens(-1)]).toEqual(["950", "3.8k", "42.1k", "1.2M", "10k", "—", "—"]);
  });
  it("reads the same as the chat's own line for the same numbers", () => {
    const chat = metaLine({ cost: 0.31, ms: 294_800, tokens: 45_900, baseline: 3.1, saved: 2.79, tools: 0, failed: 0, error: false, any: true } as never);
    const parts = summaryParts(U).join(" · ");
    expect(chat).toContain(money(0.31)); expect(parts).toContain(money(0.31));
    expect(chat).toContain("saved 90%"); expect(parts).toContain("saved 90%");
    expect(chat).toContain(secs(294_800)); expect(parts).toContain(secs(294_800));
  });
  it("lists the parts in order", () => {
    expect(summaryParts(U)).toEqual(["19 turns · 294.8 s", "sent 42.1k · received 3.8k", "cost ≈ $0.31", "saved 90% vs claude · opus", "6 tools"]);
    expect(summaryParts({ ...U, costSource: "engine" })).toContain("cost $0.31");   // the engine's own meter is not an estimate
    expect(summaryParts({ ...U, costSource: "table" })).toContain("cost ≈ $0.31");
  });
  it("shows — for what the CLI did not report, and never invents a saving", () => {
    expect(summaryParts({ ms: 12_000 })).toEqual(["12.0 s", "sent — · received —", "cost —"]);
    expect(summaryParts({ cost: 0.5, ms: 11_000 }).some((p) => p.startsWith("saved"))).toBe(false);
  });
  it("names failed tools and pluralises", () => {
    expect(summaryParts({ turns: 1, tools: 1, failed: 1, ms: 20_000 })).toContain("1 tool (1 failed)");
    expect(summaryParts({ turns: 1, ms: 20_000 })[0]).toBe("1 turn · 20.0 s");
  });
  it("the details sentence is the chat's, and honest when nothing was saved or there is no baseline", () => {
    expect(savedSentence(U)).toBe("≈ saved $2.79 (90%) vs claude · opus — $0.31 instead of $3.10 for the same tokens");
    expect(savedSentence({ cost: 1, baseline: 1, against: "claude" })).toMatch(/nothing saved/); expect(savedSentence({ cost: 1 })).toBe("");
  });
});

describe("when it shows", () => {
  it("only after a long run or a goal run, and never when switched off", () => {
    expect(shouldShow({ ms: 9_999 })).toBe(false); expect(shouldShow({ ms: 10_000 })).toBe(true); expect(shouldShow({ ms: 100, goalRun: true })).toBe(true);
    expect(shouldShow(U, { ...DEFAULT_SETTINGS, enabled: false })).toBe(false);
  });
});

describe("the timing", () => {
  it("shows for the hold time, then goes back to live", () => {
    let s = stripReduce(live(), { type: "finished", item: item(), now: 0 });
    expect(s.mode).toBe("summary"); expect(timerFraction(s)).toBe(1);
    s = stripReduce(s, { type: "tick", now: 3_000 }); expect(s.mode).toBe("summary"); expect(timerFraction(s)).toBeCloseTo(0.5, 5);
    s = stripReduce(s, { type: "tick", now: 6_000 }); expect(s).toEqual(live());
  });
  it("a quick run leaves the strip alone", () => {
    expect(stripReduce(live(), { type: "finished", item: item("p", { ms: 500 }), now: 0 })).toEqual(live());
  });
  it("hovering pauses the timer, and leaving resumes it from where it was", () => {
    let s = stripReduce(live(), { type: "finished", item: item(), now: 0 });
    s = stripReduce(s, { type: "tick", now: 2_000 }); s = stripReduce(s, { type: "hover", now: 2_000 });
    s = stripReduce(s, { type: "tick", now: 60_000 }); expect(s.mode).toBe("summary");
    s = stripReduce(s, { type: "leave", now: 60_000 }); s = stripReduce(s, { type: "tick", now: 63_000 }); expect(s.mode).toBe("summary");
    s = stripReduce(s, { type: "tick", now: 64_000 }); expect(s.mode).toBe("live");
  });
  it("dismissing returns to live at once; Esc on live does nothing", () => {
    const s = stripReduce(live(), { type: "finished", item: item(), now: 0 });
    expect(stripReduce(s, { type: "dismiss", now: 1 })).toEqual(live()); expect(stripReduce(live(), { type: "dismiss", now: 1 })).toEqual(live());
  });
  it("several panes finishing are shown one after another, in order, at most five waiting", () => {
    let s = stripReduce(live(), { type: "finished", item: item("a"), now: 0 });
    for (const p of ["b", "c", "d", "e", "f", "g", "h"]) s = stripReduce(s, { type: "finished", item: item(p), now: 1 });
    expect((s as any).queue.map((i: Item) => i.pane)).toEqual(["d", "e", "f", "g", "h"]);
    s = stripReduce(s, { type: "dismiss", now: 2 }); expect((s as any).item.pane).toBe("d"); expect(timerFraction(s)).toBe(1);
  });
  it("a tick with the clock going backwards never adds time", () => {
    let s = stripReduce(live(), { type: "finished", item: item(), now: 5_000 });
    s = stripReduce(s, { type: "tick", now: 1_000 }); expect((s as any).remaining).toBe(6_000);
  });
});
