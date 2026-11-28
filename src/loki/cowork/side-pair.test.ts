import { describe, expect, it } from "vitest";
import { MIN_PANE_W, SIDE_MIN_W, minWidthOf, pairWraps } from "./PaneTree";
import type { Node, PaneRef } from "./layout";

const agent: PaneRef = { id: "claude-1", kind: "engine", engine: "claude", paneId: 1 } as PaneRef;
const side: PaneRef = { id: "claude-2", kind: "engine", engine: "claude", paneId: 2, side: 1 } as PaneRef;
const pair: Node = { type: "split", dir: "row", team: "side:1", sizes: [0.5, 0.5], children: [{ type: "leaf", pane: agent }, { type: "leaf", pane: side }] } as Node;

describe("an agent and its side question", () => {
  it("needs less room than two full agents, so they fit side by side on an ordinary screen", () => {
    const need = minWidthOf(pair, 8, false);
    expect(need).toBe(MIN_PANE_W + SIDE_MIN_W + 8);
    expect(need).toBeLessThan(2 * MIN_PANE_W);
  });
  it("go below one another only when the room is smaller than their two minimums added up", () => {
    const mins = [MIN_PANE_W, SIDE_MIN_W];
    expect(pairWraps(1200, mins)).toBe(false);
    expect(pairWraps(MIN_PANE_W + SIDE_MIN_W + 8, mins)).toBe(false);
    expect(pairWraps(MIN_PANE_W + SIDE_MIN_W + 7, mins)).toBe(true);
    expect(pairWraps(0, mins)).toBe(false);   // not measured yet
  });
});
