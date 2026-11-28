import { describe, it, expect } from "vitest";
import { unlinkOnClose, type TeamRow } from "./teams";

const team = (pair: boolean, panes: number[]): TeamRow => ({ id: "t", name: "t", pair, ready: true, members: panes.map((p, i) => ({ role: (["planner", "worker", "qa"] as const)[i], pane: p })) } as TeamRow);

describe("closing an agent that is linked", () => {
  it("unlinks the whole PAIR when either side closes, so the other is a normal agent again", () => {
    expect(unlinkOnClose(team(true, [11, 12]), 11, true)).toEqual([11, 12]);
    expect(unlinkOnClose(team(true, [11, 12]), 12, true)).toEqual([11, 12]);
  });
  it("lets a bigger team keep its other members: only the closed one leaves", () => {
    expect(unlinkOnClose(team(false, [11, 12, 13]), 12, true)).toEqual([12]);
  });
  it("does nothing for an agent that was in no team", () => {
    expect(unlinkOnClose(undefined, 5, false)).toEqual([]);
  });
});
