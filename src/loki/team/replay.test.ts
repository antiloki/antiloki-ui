import { describe, it, expect } from "vitest";
import { buildSchedule, stateAt, charTimes, shown, rng, type RunEvent } from "./replay";

const ev = (i: number, t: number, node: string, o: Partial<RunEvent>): RunEvent => ({ i, t_ms: 1000 + t * 1000, node, kind: "write", ...o } as RunEvent);
const A = "const a = 1;\nconst b = 2;\n"; const B = "export const x = 1;\n";
const events: RunEvent[] = [ev(0, 0, "front", { kind: "write", file: "src/a.ts", text: A }), ev(1, 0.2, "back", { kind: "write", file: "srv/b.js", text: B }), ev(2, 5, "front", { kind: "edit", file: "src/a.ts", old: "const a = 1;", new: "const a = 42;" }), ev(3, 6, "back", { kind: "run", cmd: "npm test" }), ev(4, 6.5, "front", { kind: "read", file: "srv/b.js" })];

describe("the replay of what agents wrote", () => {
  it("is a pure function of the events: the same events always give the same schedule and the same typing", () => {
    const a = buildSchedule(events); const b = buildSchedule([...events].reverse()); expect(JSON.stringify(a.steps)).toBe(JSON.stringify(b.steps)); expect(charTimes("hello\nworld", 3)).toEqual(charTimes("hello\nworld", 3)); expect(charTimes("hello", 3)).not.toEqual(charTimes("hello", 4));
    const c = charTimes("a\nb(c)", 9); expect(c[c.length - 1]).toBeCloseTo(1, 9); expect(c.every((x, i) => i === 0 || x >= c[i - 1])).toBe(true); expect(shown(c, 0)).toBe(0); expect(shown(c, 1)).toBe(6); expect(shown(c, 0.5)).toBeGreaterThan(0); expect(rng(5)()).toBe(rng(5)());
  });
  it("adding later events never moves an earlier one (a live run is stable as events arrive)", () => {
    const part = buildSchedule(events.slice(0, 3)); const all = buildSchedule(events); for (const s of part.steps) { const m = all.steps.find((x) => x.id === s.id)!; expect([m.start, m.end]).toEqual([s.start, s.end]); }
  });
  it("types a new file character by character, creating it first, and the pointer is at the end of what was typed", () => {
    const sc = buildSchedule(events); const create = sc.steps.find((s) => s.k === "create" && s.node === "front")!; const type = sc.steps.find((s) => s.k === "type" && s.node === "front")!;
    let st = stateAt(sc, create.start + 0.01); expect(st.files["src/a.ts"]).toBe(""); expect(st.tabs).toContain("src/a.ts"); expect(st.agents.front.doing).toBe("creating");
    st = stateAt(sc, (type.start + type.end) / 2); const half = st.files["src/a.ts"]; expect(half.length).toBeGreaterThan(0); expect(half.length).toBeLessThan(A.length); expect(A.startsWith(half)).toBe(true); expect(st.agents.front.typing).toBe(true); expect(st.agents.front.doing).toBe("writing");
    st = stateAt(sc, type.end + 0.01); expect(st.files["src/a.ts"]).toBe(A);
  });
  it("two agents write different files at the same time (parallel), each with its own pointer", () => {
    const sc = buildSchedule(events); const st = stateAt(sc, 0.8); expect(st.agents.front.file).toBe("src/a.ts"); expect(st.agents.back.file).toBe("srv/b.js"); expect(st.agents.front.doing).toBe("writing"); expect(st.agents.back.doing).toBe("writing"); expect(st.tabs).toEqual(expect.arrayContaining(["src/a.ts", "srv/b.js"]));
  });
  it("selects the old text, then retypes the new one in place, and the file ends as the edit says", () => {
    const sc = buildSchedule(events); const sel = sc.steps.find((s) => s.k === "select")!; const rep = sc.steps.find((s) => s.k === "replace")!;
    const s1 = stateAt(sc, (sel.start + sel.end) / 2); expect(s1.agents.front.doing).toBe("selecting"); expect(s1.agents.front.sel).toMatchObject({ file: "src/a.ts", from: 0 }); expect(s1.files["src/a.ts"]).toBe(A);
    const s2 = stateAt(sc, rep.start + (rep.end - rep.start) * 0.6); expect(s2.agents.front.doing).toBe("fixing"); expect(s2.files["src/a.ts"]).toContain("const b = 2;"); expect(s2.files["src/a.ts"].startsWith("const")).toBe(true); expect(s2.files["src/a.ts"].length).toBeLessThan("const a = 42;\nconst b = 2;\n".length);
    expect(stateAt(sc, rep.end + 5).files["src/a.ts"]).toBe("const a = 42;\nconst b = 2;\n");
  });
  it("closes the tab of a file an agent has moved on from, lists commands, and says everything is done at the end", () => {
    const sc = buildSchedule(events); const close = sc.steps.find((s) => s.k === "close" && s.node === "front" && s.file === "src/a.ts")!; expect(close).toBeTruthy();
    expect(stateAt(sc, close.start).tabs).toContain("src/a.ts"); expect(stateAt(sc, close.end + 0.01).tabs).not.toContain("src/a.ts");
    const last = stateAt(sc, sc.end + 1); expect(last.running).toBe(false); expect(last.term).toEqual([{ node: "back", cmd: "npm test", done: true }]); expect(Object.values(last.agents).every((a) => a.doing === "done")).toBe(true);
    expect(stateAt(sc, 0.1).running).toBe(true);
  });
  it("uses a file's content from before the run for edits and reads, and shows nothing for no events", () => {
    const sc = buildSchedule([ev(0, 0, "n", { kind: "edit", file: "x.ts", old: "let a", new: "const a" })], { "x.ts": "let a = 1;\n" }); expect(stateAt(sc, sc.end + 1).files["x.ts"]).toBe("const a = 1;\n");
    const none = buildSchedule([]); expect(none.steps).toEqual([]); expect(stateAt(none, 5)).toMatchObject({ tabs: [], running: false });
  });
});

import { typedChars, counterOf } from "./replay";
describe("the pointer's counter", () => {
  it("counts characters as they are typed, and turns them into tokens and a share of the cost", () => {
    const sc = buildSchedule(events); const type = sc.steps.find((s) => s.k === "type" && s.node === "front")!;
    const early = typedChars(sc, type.start + 0.01, "front"); const mid = typedChars(sc, (type.start + type.end) / 2, "front"); const late = typedChars(sc, sc.end + 1, "front");
    expect(early.now).toBeLessThan(mid.now); expect(mid.now).toBeLessThan(late.now); expect(late.now).toBe(late.all); expect(late.all).toBeGreaterThan(A.length);
    expect(counterOf({ now: 400, all: 800 }, 0.2)).toEqual({ tokens: 100, usd: 0.1 }); expect(counterOf({ now: 400, all: 800 }).usd).toBeNull();
  });
});
