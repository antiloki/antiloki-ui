// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as React from "react";
vi.mock("./api", () => ({ listArtifacts: vi.fn(async () => [{ name: "doc.md", format: "md", bytes: 1, node: "a", kind: "made", t_ms: 1 }]), listMedia: vi.fn(async () => []), getArtifact: vi.fn(async () => ({ ok: true, text: "hello" })), mediaUrl: () => "" }));
import { AgentGraph } from "./AgentGraph";

const graph: any = { team: "t", schema: 1, branch: "", budget_usd: 1, start: ["a"], nodes: { leader: { node: "leader" }, a: { node: "role", role: "agent", agent: { title: "A", responsibility: "r", brief: "b", context: [], skills: [], mcp: [], effects: ["read"] } }, b: { node: "role", role: "agent", agent: { title: "B", responsibility: "r", brief: "b", context: [], skills: [], mcp: [], effects: ["read"] } } }, edges: [{ from: "a", port: "out", to: "b" }] };
describe("the team graph", () => {
  afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* */ } });
  it("lets a node be dragged to a new place, and keeps it there", () => {
    render(<AgentGraph graph={graph} run={null} selected={null} onSelect={() => {}} />);
    const tile = () => screen.getByTestId("ag-node-a").querySelector("rect.ag-tile") as SVGRectElement; const x0 = Number(tile().getAttribute("x")), y0 = Number(tile().getAttribute("y"));
    const node = screen.getByTestId("ag-node-a"); const svg = node.closest("svg") as SVGSVGElement;
    fireEvent.pointerDown(node, { button: 0, clientX: 100, clientY: 100, pointerId: 1 }); fireEvent.pointerMove(svg, { clientX: 160, clientY: 140, pointerId: 1 }); fireEvent.pointerMove(svg, { clientX: 200, clientY: 170, pointerId: 1 }); fireEvent.pointerUp(svg, { clientX: 200, clientY: 170, pointerId: 1 });
    const x1 = Number(tile().getAttribute("x")), y1 = Number(tile().getAttribute("y")); expect(Math.abs(x1 - x0) + Math.abs(y1 - y0)).toBeGreaterThan(20);
  });
  it("has no edge: a node can be dragged far above where the drawing starts", () => {
    render(<AgentGraph graph={graph} run={null} selected={null} onSelect={() => {}} />);
    const node = screen.getByTestId("ag-node-a"); const svg = node.closest("svg") as SVGSVGElement; const tile = () => node.querySelector("rect.ag-tile") as SVGRectElement;
    fireEvent.pointerDown(node, { button: 0, clientX: 100, clientY: 100, pointerId: 1 }); fireEvent.pointerMove(svg, { clientX: 100, clientY: -300, pointerId: 1 }); fireEvent.pointerMove(svg, { clientX: 100, clientY: -600, pointerId: 1 }); fireEvent.pointerUp(svg, { pointerId: 1 });
    expect(Number(tile().getAttribute("y"))).toBeLessThan(-200);   // it used to stop at the old top limit
  });
  it("lets a preview box be dragged too, and a drag is not a click", async () => {
    const g2: any = { ...graph, nodes: { ...graph.nodes, doc: { node: "artifact", name: "doc", format: "md", from: "a" } }, edges: [...graph.edges, { from: "a", port: "out", to: "doc" }] };
    const run: any = { id: "r1", live: false, graph: g2, state: { status: { status: "done" }, values: {} } };
    render(<AgentGraph graph={g2} run={run} selected={null} onSelect={() => {}} />);
    const spot = await screen.findByTestId("ag-previewspot-doc"); const fo = () => spot.querySelector("foreignObject") as SVGForeignObjectElement; const x0 = Number(fo().getAttribute("x")), y0 = Number(fo().getAttribute("y"));
    const svg = spot.closest("svg") as SVGSVGElement; const box = screen.getByTestId("ag-preview-pv_doc_0");
    fireEvent.pointerDown(box, { button: 0, clientX: 300, clientY: 300, pointerId: 1 }); fireEvent.pointerMove(svg, { clientX: 340, clientY: 330, pointerId: 1 }); fireEvent.pointerMove(svg, { clientX: 380, clientY: 360, pointerId: 1 }); fireEvent.pointerUp(svg, { clientX: 380, clientY: 360, pointerId: 1 });
    expect(Math.abs(Number(fo().getAttribute("x")) - x0) + Math.abs(Number(fo().getAttribute("y")) - y0)).toBeGreaterThan(20);
    fireEvent.click(box); expect(screen.queryByTestId("glass-view")).toBeNull();
  });
});
