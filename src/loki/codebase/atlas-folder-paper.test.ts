// The folder paper's readings — each rule a pure function; the audit cases as fixtures.
import { describe, it, expect } from "vitest";
import { kindOf, emptyCounts, profileOf, pickCharge, pickExhibit, rankCharges, classifyTarget, boundaryReading, trajectoryReading, rosterLine, testsAxisNote, axisFix } from "./atlas-folder-paper";

describe("composition", () => {
  it("buckets atlas kinds and keeps data out of the profile", () => {
    expect(kindOf({ type: "component", name: "Header" })).toBe("comp");
    expect(kindOf({ type: "hook", name: "useStore" })).toBe("hook");
    expect(kindOf({ type: "function", name: "useThing" })).toBe("hook");
    expect(kindOf({ type: "method", name: "render" })).toBe("cls");
    expect(kindOf({ type: "const", name: "CAP" })).toBe("data");
    expect(kindOf({ type: "type", name: "Props" })).toBe("data");
    expect(kindOf({ type: "function", name: "tabify" })).toBe("fn");
  });
  it("calls a React components folder a presentation layer even with many constants", () => {
    const c = emptyCounts();
    c.comp = 9; c.hook = 2; c.fn = 6; c.data = 20; // the audit folder after the React reading
    expect(profileOf(c)).toMatch(/presentation layer/);
    const p = emptyCounts(); p.fn = 20;
    expect(profileOf(p)).toMatch(/procedural library/);
    const d = emptyCounts(); d.data = 3;
    expect(profileOf(d)).toMatch(/data surface/);
  });
});

describe("the heaviest charge", () => {
  const outputAxes = {
    compliance: { score: 84, parts: {} }, defects: { score: 100, parts: {} },
    tests: { score: 13, parts: { covered: 0, pct_fan_in: 0.93, basis: "static-import" } },
    structure: { score: 15, parts: { worst_block: "tabify", worst_line: 87, worst_cognitive: 26, max_nesting: 4, nested_loops: 2, god_file: 1 } },
    coupling: { score: 25, parts: {} }, cohesion: { score: 63, parts: {} }, change: { score: 23, parts: {} },
  };
  it("ranks Output.tsx's charges by health cost — the four `!= null` come last", () => {
    const vios = [106, 116, 358, 382].map((line) => ({ law_key: "no-loose-equality", line, weight: 4, confidence: 1 }));
    const ranked = rankCharges(vios, outputAxes);
    const order = ranked.map((c) => (c.kind === "axis" ? c.ax : c.law_key));
    // tests (100−13)×0.16 = 13.9 · structure (100−15)×0.15 = 12.75 · coupling 75×0.12 = 9 · change 77×0.08 = 6.2 · the law 16×0.25 = 4 · cohesion 37×0.06 = 2.2
    expect(order).toEqual(["tests", "structure", "coupling", "change", "no-loose-equality", "cohesion"]);
    const heaviest = pickCharge(vios, outputAxes)!;
    expect(heaviest.kind === "axis" && heaviest.ax).toBe("tests");
    expect(heaviest.cost).toBeCloseTo(13.92, 1);
  });
  it("exhibits the structure of Output.tsx — the heaviest charge WITH a line — not its `!= null`", () => {
    const vios = [106, 116, 358, 382].map((line) => ({ law_key: "no-loose-equality", line, weight: 4, confidence: 1 }));
    const ch = pickExhibit(vios, outputAxes)!;
    expect(ch.kind).toBe("axis");
    if (ch.kind === "axis") {
      expect(ch.ax).toBe("structure");
      expect(ch.block).toBe("tabify");
      expect(ch.line).toBe(87);
      expect(ch.because).toMatch(/cognitive 26/);
      expect(ch.fix).toMatch(/split `tabify`/);
      expect(ch.cost).toBeCloseTo(12.75, 1);
    }
  });
  it("exhibits the law when the law is what costs", () => {
    const vios = Array.from({ length: 12 }, (_, i) => ({ law_key: "no-swallowed-error", line: i + 1, weight: 8, confidence: 1 }));
    const axes = { compliance: { score: 10 }, defects: { score: 100 }, structure: { score: 90 } };
    const ch = pickCharge(vios, axes)!;
    expect(ch.kind).toBe("law");
    if (ch.kind === "law") { expect(ch.law_key).toBe("no-swallowed-error"); expect(ch.hits).toBe(12); }
  });
  it("does not exhibit a healthy block", () => {
    // StoreContext.tsx: the drag is tests (no line) and cohesion (no line); structure is 93.
    // Exhibiting "structure 93 — flatten the deepest block" would be the paper inventing a case.
    const axes = { compliance: { score: 100 }, defects: { score: 100 }, tests: { score: 15, parts: {} }, structure: { score: 93, parts: { worst_block: "StoreProvider", worst_line: 35 } }, coupling: { score: 36 }, cohesion: { score: 0 }, change: { score: 68 } };
    expect(pickCharge([], axes)!.kind === "axis" && (pickCharge([], axes) as any).ax).toBe("tests");
    expect(pickExhibit([], axes)).toBeNull();
  });
  it("is null when nothing costs anything", () => {
    expect(pickCharge([], { compliance: { score: 100 }, structure: { score: 100 } })).toBeNull();
  });
  it("keys the fix by the dominant part", () => {
    expect(axisFix("structure", { worst_cognitive: 18, max_nesting: 2 })).toMatch(/extract the branches/);
    expect(axisFix("structure", { god_file: 1 })).toMatch(/god-file/);
    expect(axisFix("tests", { covered: 0 })).toMatch(/imports this file/);
  });
});

describe("the boundary, direction-aware", () => {
  const none = () => 0;
  it("classifies outbound targets", () => {
    const dir = "compiler/apps/playground/components";
    expect(classifyTarget(dir, "compiler/apps/playground/lib/stores.ts", none)).toBe("shared");
    expect(classifyTarget(dir, "compiler/apps/playground/app/page.tsx", none)).toBe("sibling");
    expect(classifyTarget(dir, "compiler/packages/x/y.ts", none)).toBe("shared");
    expect(classifyTarget(dir, "compiler/scripts/build.ts", none)).toBe("app");
    // measured: a folder three top-level folders import into is shared by use, whatever its name
    expect(classifyTarget(dir, "compiler/apps/playground/thing/z.ts", (f) => (f.endsWith("/thing") ? 3 : 0))).toBe("shared");
  });
  it("reads a UI folder that depends on lib/ as layered, not leaky (the audit case)", () => {
    const r = boundaryReading({ internal: 16, inbound: 3, outShared: 14, outSibling: 0, outApp: 0, mutualSibling: false });
    expect(r.cohesion).toBe(48);
    expect(r.label).toBe("layered");
    expect(r.observation).toMatch(/100% of outbound goes down/);
  });
  it("reads sibling crossings as tangled and the rest by cohesion", () => {
    expect(boundaryReading({ internal: 4, inbound: 2, outShared: 2, outSibling: 5, outApp: 0, mutualSibling: false }).label).toBe("tangled");
    expect(boundaryReading({ internal: 4, inbound: 2, outShared: 3, outSibling: 1, outApp: 0, mutualSibling: true }).label).toBe("tangled");
    expect(boundaryReading({ internal: 20, inbound: 2, outShared: 3, outSibling: 0, outApp: 0, mutualSibling: false }).label).toBe("sealed");
    expect(boundaryReading({ internal: 2, inbound: 5, outShared: 1, outSibling: 1, outApp: 6, mutualSibling: false }).label).toBe("leaky");
    expect(boundaryReading(null).label).toBe("unmeasured");
  });
});

describe("the trajectory", () => {
  it("calls a delta across an instrument change a baseline reset", () => {
    const r = trajectoryReading({ prev_snapshot_id: 1, health_delta: -2, comparable: false, prev_engineering_version: "v2", new: [], fixed: [] }, "v3");
    expect(r.kind).toBe("reset");
    expect(r.text).toMatch(/v2 → v3/);
    expect(r.detail).toMatch(/not a trend/);
  });
  it("calls a small comparable delta with no law change cohort drift", () => {
    const r = trajectoryReading({ prev_snapshot_id: 1, health_delta: -2, comparable: true, new: [], fixed: [] }, "v3");
    expect(r.kind).toBe("drift");
  });
  it("still calls a real move improving or regressing", () => {
    expect(trajectoryReading({ prev_snapshot_id: 1, health_delta: -6, comparable: true, new: [], fixed: [] }, "v3").kind).toBe("regressing");
    expect(trajectoryReading({ prev_snapshot_id: 1, health_delta: -1, comparable: true, new: [{}], fixed: [] }, "v3").kind).toBe("regressing");
    expect(trajectoryReading({ prev_snapshot_id: 1, health_delta: 4, comparable: true, new: [], fixed: [] }, "v3").kind).toBe("improving");
    expect(trajectoryReading(null).kind).toBe("none");
  });
});

describe("roster and tests", () => {
  it("prints the archetype split", () => {
    expect(rosterLine({ total: 15, logic: 9, glue: 6, test: 0, unknown: 0, carried: 15 }, 3)).toBe("9 logic · 6 glue · 15 law results carried forward (unchanged content)");
    expect(rosterLine(null)).toBe("—");
  });
  it("says unmeasured when nothing could measure", () => {
    expect(testsAxisNote("unmeasured", null).measured).toBe(false);
    expect(testsAxisNote("static-import", 18).text).toMatch(/e2e spec/);
    expect(testsAxisNote("inline", 70).text).toMatch(/cfg\(test\)/);
  });
});
