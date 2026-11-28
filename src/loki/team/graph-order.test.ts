import { describe, it, expect } from "vitest";
import { branchColor, branchOf, edgeKey, stepNumbers } from "./graph-order";
const g = (nodes: string[], edges: [string, string, string?][]) => ({ team: "t", schema: 1, branch: "", budget_usd: 1, nodes: Object.fromEntries(nodes.map((n) => [n, { node: "role" }])), edges: edges.map(([from, to, port]) => ({ from, to, port: port ?? "ok" })) }) as any;
describe("the order and the branches of a graph", () => {
  it("steps are numbered in the order they run; parallel steps follow one another; the hub is left out", () => {
    const x = g(["lead", "plan", "a", "b", "join", "qa"], [["lead", "plan"], ["plan", "a"], ["plan", "b"], ["a", "join"], ["b", "join"], ["join", "qa"]]);
    expect(stepNumbers(x)).toEqual({ lead: 1, plan: 2, a: 3, b: 4, join: 5, qa: 6 }); expect(stepNumbers(x, ["lead"])).toEqual({ plan: 1, a: 2, b: 3, join: 4, qa: 5 });
  });
  it("a node is numbered after everything that reaches it, even when it is listed first; a loop and trouble lines do not break it", () => {
    const x = g(["end", "mid", "start"], [["start", "mid"], ["mid", "end"], ["mid", "start", "failed"], ["end", "mid"]]); expect(stepNumbers(x)).toEqual({ start: 1, mid: 2, end: 3 });
    const loop = g(["a", "b"], [["a", "b"], ["b", "a"]]); expect(Object.values(stepNumbers(loop)).sort()).toEqual([1, 2]);
  });
  it("a fork gives each way forward its own branch, the lines after it keep it, and a join takes the main line back", () => {
    const x = g(["s", "f", "a", "a2", "b", "j", "e"], [["s", "f"], ["f", "a"], ["f", "b"], ["a", "a2"], ["a2", "j"], ["b", "j"], ["j", "e"]]); const b = branchOf(x);
    expect(b[edgeKey({ from: "s", port: "ok", to: "f" })]).toBe(0); expect(b[edgeKey({ from: "f", port: "ok", to: "a" })]).toBe(1); expect(b[edgeKey({ from: "f", port: "ok", to: "b" })]).toBe(2);
    expect(b[edgeKey({ from: "a", port: "ok", to: "a2" })]).toBe(1); expect(b[edgeKey({ from: "a2", port: "ok", to: "j" })]).toBe(1); expect(b[edgeKey({ from: "b", port: "ok", to: "j" })]).toBe(2); expect(b[edgeKey({ from: "j", port: "ok", to: "e" })]).toBe(0);
  });
  it("a straight line is all main; trouble lines have no branch; colours cycle and the main line has none", () => {
    const x = g(["a", "b", "c"], [["a", "b"], ["b", "c"], ["b", "a", "failed"]]); expect(Object.values(branchOf(x))).toEqual([0, 0]); expect(Object.keys(branchOf(x)).some((k) => k.includes("failed"))).toBe(false);
    expect(branchColor(0)).toBeNull(); expect(branchColor(1)).toBe("#e8825a"); expect(branchColor(7)).toBe("#e8825a"); expect(branchColor(2)).not.toBe(branchColor(1));
  });
});
