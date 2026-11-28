// The file review's fix generators, checked against the real file the audit was run on
// (react's playground Output.tsx, copied as a fixture).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pickTestTarget, defaultExportName, nestedLoops, nestedLoopsNote, enclosingRegion, realisticGain, ordinal, testBody, importPath, rewriteLine, descendDominant } from "./atlas-file-fixes";

const SRC = readFileSync(resolve(__dirname, "__fixtures__/react-playground-Output.tsx.txt"), "utf8").split("\n");
// the decorators the atlas produces for it (kind · line · cx), none exported by declaration
const BLOCKS = [
  { name: "tabify", kind: "function", line: 87, end_line: 220, complexity: 16, flags: [] },
  { name: "OutputContent", kind: "component", line: 261, end_line: 336, complexity: 10, flags: [] },
  { name: "TextTabContent", kind: "component", line: 338, end_line: 422, complexity: 7, flags: [] },
  { name: "MemoizedOutput", kind: "component", line: 44, end_line: 44, complexity: 1, flags: [] },
];

describe("the test target", () => {
  it("never imports a module-private function — Output.tsx exposes only its default export", () => {
    const t = pickTestTarget(BLOCKS, SRC, "Output");
    expect(t.kind).toBe("default");
    if (t.kind === "default") { expect(t.importLine).toBe("import MemoizedOutput from './Output';"); expect(t.why).toMatch(/default export/); }
    expect(defaultExportName(SRC)).toEqual({ name: "MemoizedOutput", line: 46 });
  });
  it("prefers the most complex exported symbol when there is one", () => {
    const t = pickTestTarget([{ name: "helper", kind: "function", complexity: 9, flags: [] }, { name: "run", kind: "function", complexity: 3, flags: ["exported"] }], null, "svc");
    expect(t.kind).toBe("named");
    if (t.kind === "named") expect(t.importLine).toBe("import { run } from './svc';");
  });
  it("an exported block that IS the default export gets a default import, and a component renders (AccordionWindow.tsx)", () => {
    const src = ["export default function AccordionWindow(props) {", "  return <div/>;", "}", "function AccordionWindowItem() {}"];
    const blocks = [{ name: "AccordionWindow", kind: "component", complexity: 1, flags: ["exported"] }, { name: "AccordionWindowItem", kind: "component", complexity: 6, flags: [] }];
    const t = pickTestTarget(blocks, src, "AccordionWindow");
    expect(t.kind).toBe("default");
    if (t.kind === "default") expect(t.importLine).toBe("import AccordionWindow from './AccordionWindow';");
    expect(testBody(t, blocks)).toMatch(/render\(<AccordionWindow/);
    expect(testBody({ kind: "named", name: "sum", importLine: "", why: "" }, [{ name: "sum", kind: "function" }])).toMatch(/sum\(typicalInput\)/);
  });
  it("reads `export default function Name`", () => {
    expect(defaultExportName(["export default function Header() {", "}"])).toEqual({ name: "Header", line: 1 });
    expect(defaultExportName(["export default memo(X);"])).toEqual({ name: "memo", line: 1 });
    expect(defaultExportName(["const a = 1;"])).toBeNull();
    expect(pickTestTarget([], null, "x").kind).toBe("none");
  });
});

describe("nested loops", () => {
  it("sees tabify's inner loop as a partition walk, not N×N", () => {
    const nests = nestedLoops(SRC, 87, 220);
    expect(nests.length).toBeGreaterThan(0);
    const first = nests[0];
    expect(first.outerHead).toMatch(/for \(const \[passName, results\] of compilerOutput\.results\)/);
    expect(first.innerHead).toMatch(/for \(const result of results\)/);
    expect(first.partition).toBe(true);
    expect(nestedLoopsNote(nests)).toMatch(/one pass over the data, not N×N/);
  });
  it("keeps the N×N warning for independent collections", () => {
    const src = ["for (const a of xs) {", "  for (const b of ys) {", "    if (a.id === b.id) hit(a, b);", "  }", "}"];
    const nests = nestedLoops(src, 1, 5);
    expect(nests[0].partition).toBe(false);
    expect(nestedLoopsNote(nests)).toMatch(/1,000,000/);
    expect(nestedLoopsNote([])).toBeNull();
  });
});

describe("the dense region", () => {
  it("anchors tabify's exhibit at the loop that holds the nesting, not the ok/err arms", () => {
    // the judge: worst_line 87, max_nesting_line 106
    const r = enclosingRegion(SRC, 106, 87, 220)!;
    expect(r).not.toBeNull();
    expect(r.kind).toBe("switch");
    expect(r.head).toMatch(/switch \(result\.kind\)/);
    expect(r.start).toBeLessThan(106);
    expect(r.end).toBeGreaterThanOrEqual(106);
  });
});

describe("co-change pairs", () => {
  it("finds the indirect import path so a 2-hop pair is not called hidden", () => {
    const edges = [
      { from: "c/AccordionWindow.tsx", to: "lib/t.ts", kind: "import" },
      { from: "c/Editor/Output.tsx", to: "c/AccordionWindow.tsx", kind: "import" },
      { from: "c/Editor/EditorImpl.tsx", to: "c/Editor/Output.tsx", kind: "import" },
      { from: "c/AccordionWindow.tsx", to: "c/Editor/EditorImpl.tsx", kind: "co_change" },
    ];
    expect(importPath(edges, "c/AccordionWindow.tsx", "c/Editor/EditorImpl.tsx")).toEqual(["c/AccordionWindow.tsx", "c/Editor/Output.tsx", "c/Editor/EditorImpl.tsx"]);
    expect(importPath(edges, "c/AccordionWindow.tsx", "nowhere.ts")).toBeNull();
  });
});

describe("the + line for a law comment", () => {
  it("rewrites the real line for mechanical laws, null for judgement calls", () => {
    expect(rewriteLine("no-loose-equality", "          kind == InstructionKind.HoistedConst ||")).toBe("          kind === InstructionKind.HoistedConst ||");
    expect(rewriteLine("no-loose-equality", "if (a != b && c === d)")).toBe("if (a !== b && c === d)");
    expect(rewriteLine("no-loose-equality", "if (a === b)")).toBeNull();
    expect(rewriteLine("ts-no-any", "  debug(): any {")).toMatch(/: unknown/);
    expect(rewriteLine("js-no-console", "    console.log(x);")).toMatch(/^\/\/ console\.log\(x\);/);
    expect(rewriteLine("no-swallowed-error", "} catch (e) {}")).toBeNull();
  });
});

describe("dominant-arm descent", () => {
  it("follows a function that is one big switch down to its cases", () => {
    const top = [{ ln: 681, to: 683, text: "if (DEBUG)" }, { ln: 684, to: 1307, text: "switch (effect.kind)" }];
    const cases = [{ ln: 685, to: 700, text: "case 'Freeze':" }, { ln: 701, to: 900, text: "case 'Mutate':" }, { ln: 901, to: 1307, text: "case 'Alias':" }];
    const out = descendDominant(null, top, (a, b) => (a === 684 && b === 1307 ? cases : null));
    expect(out).toBe(cases);
  });
  it("stays put when the arms are balanced", () => {
    const top = [{ ln: 1, to: 50, text: "if (x)" }, { ln: 51, to: 100, text: "} else if (y)" }];
    expect(descendDominant(null, top, () => null)).toBe(top);
  });
});

describe("realistic gains", () => {
  it("tests is binary, structure keeps its god-file part, coupling without a lever is zero, change is history", () => {
    expect(realisticGain("tests", 27).gain).toBe(12);
    const s = realisticGain("structure", 24, { godFile: true });
    expect(s.gain).toBeLessThan(realisticGain("structure", 24, {}).gain);
    expect(s.gain).toBe(7); // (100−24) × 0.6 × 0.15
    expect(s.ceiling).toBe(70);
    expect(realisticGain("coupling", 45, {}).gain).toBe(0);
    expect(realisticGain("coupling", 45, { facade: true }).gain).toBe(2);
    expect(realisticGain("change", 41).gain).toBe(0);
  });
  it("ordinals", () => {
    expect(ordinal(62)).toBe("62nd"); expect(ordinal(11)).toBe("11th"); expect(ordinal(93)).toBe("93rd"); expect(ordinal(1)).toBe("1st");
  });
});
