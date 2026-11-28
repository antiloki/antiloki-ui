// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as React from "react";
vi.mock("./api", () => ({ listArtifacts: vi.fn(async () => []), listMedia: vi.fn(async () => []), getArtifact: vi.fn(async () => ({ ok: true, text: "" })), getResult: vi.fn(async () => null) }));
import { AgentGraph, avatarState, faceOf, hasFace, leaderIdOf, specialistOf } from "./AgentGraph";

const agent = (specialist?: string) => ({ node: "role", role: "agent", agent: { title: "Copy", responsibility: "r", brief: "b", context: [], ...(specialist ? { specialist } : {}) } });
const graph: any = { team: "t", schema: 1, branch: "", budget_usd: 1, start: ["a"], nodes: { leader: { node: "leader" }, a: agent("copy-chief"), b: agent() }, edges: [{ from: "a", port: "ok", to: "b" }] };

describe("specialists on the team graph", () => {
  afterEach(() => cleanup());
  it("draws the specialist's avatar on an agent node that runs as one, and a face of its own on the other agents", () => {
    render(<AgentGraph graph={graph} run={null} selected={null} onSelect={() => {}} specialists={{ "copy-chief": { shape: "cat", color: "pink" } }} />);
    const spec = screen.getByTestId("ag-spec-a");
    const av = spec.querySelector('[data-testid="specialist-avatar"]');
    expect(av?.getAttribute("data-specialist")).toBe("copy-chief");
    // an agent with no specialist still gets a face, picked from its own id, so every agent node has one
    expect(screen.getByTestId("ag-spec-b").querySelector('[data-testid="specialist-avatar"]')?.getAttribute("data-specialist")).toBe("b");
  });
  it("reads the specialist off the node and maps a failed node to a blocked avatar", () => {
    expect(specialistOf(graph.nodes.a)).toBe("copy-chief"); expect(specialistOf(graph.nodes.b)).toBeNull(); expect(specialistOf(undefined)).toBeNull();
    expect(faceOf("a", graph.nodes.a)).toBe("copy-chief"); expect(faceOf("b", graph.nodes.b)).toBe("b");
    expect(hasFace(graph.nodes.a)).toBe(true); expect(hasFace({ node: "code" } as any)).toBe(false); expect(hasFace({ node: "leader" } as any)).toBe(false);
    expect(avatarState("failed")).toBe("blocked"); expect(avatarState("working")).toBe("working"); expect(avatarState("done")).toBe("done"); expect(avatarState("idle")).toBe("idle");
  });
  it("draws the team's Leader avatar on the hub, the same specialist the top bar wears", () => {
    render(<AgentGraph graph={graph} run={null} selected={null} onSelect={() => {}} specialists={{ "leader-t": { shape: "bunny", color: "violet" } }} />);
    const av = screen.getByTestId("ag-leader-face").querySelector('[data-testid="specialist-avatar"]');
    expect(av?.getAttribute("data-specialist")).toBe("leader-t"); expect(av?.getAttribute("data-shape")).toBe("bunny");
  });
  it("spells the Leader's id like the serve", () => {
    expect(leaderIdOf("Landing Page!")).toBe("leader-landing-page"); expect(leaderIdOf("a")).toBe("leader-a"); expect(leaderIdOf("--")).toBe("leader-team"); expect(leaderIdOf("x".repeat(60))).toBe("leader-" + "x".repeat(40));
  });
});
