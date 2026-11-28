import { describe, expect, it } from "vitest";
import { shown, faceOf, wordsOf, type AgentRow } from "./AvatarDock";
import { lookOf } from "./Avatar";
const r = (o: Partial<AgentRow>): AgentRow => ({ pane_id: 1, name: "", role: "", kind: "claude", state: "idle", ...o });
describe("avatars", () => {
  it("ended and shell panes get no avatar", () => { expect(shown([r({ state: "ended" }), r({ kind: "shell" }), r({ pane_id: 2 })]).map((x) => x.pane_id)).toEqual([2]); });
  it("a state maps to its motion and words", () => { expect(faceOf("wait")).toBe("wait"); expect(wordsOf(r({ idle_min: 12 }))).toBe("idle 12 min"); expect(wordsOf(r({ state: "sleep" }))).toBe("asleep"); });
  it("a known role has its look, an unknown one a stable look", () => { expect(lookOf("leader", 9).shape).toBe("tri"); expect(lookOf("zzz", 7)).toEqual(lookOf("zzz", 7)); });
});
