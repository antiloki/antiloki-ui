import { describe, expect, it } from "vitest";
import { toastsFrom } from "./TeamToasts";
const row = (id: string, status: string, over: Record<string, unknown> = {}) => ({ id, team: "Video editing", ask: "make a promo", status: { status }, spent_usd: 1.5, started_ms: 1, ...over }) as any;

describe("what the notification stack says", () => {
  it("says nothing on the first look, a decision for a run that needs you, and a notice for a run that moved to failed or done", () => {
    expect(toastsFrom(null, [row("a", "blocked"), row("b", "done")], 1)).toEqual([]);
    expect(toastsFrom(null, [row("c", "paused", { needs_you: true })], 1).map((t) => t.kind)).toEqual(["decision"]);
    const seen = new Map([["a", "running"], ["b", "running"], ["c", "done"]]);
    const t = toastsFrom(seen, [row("a", "blocked"), row("b", "done"), row("c", "done")], 1);
    expect(t.map((x) => x.kind)).toEqual(["failed", "done"]); expect(t[0].text).toContain("the Leader was told"); expect(t[1].text).toContain("$1.50");
  });
  it("does not repeat a run whose status did not move, nor announce one it never saw", () => {
    expect(toastsFrom(new Map([["a", "blocked"]]), [row("a", "blocked"), row("z", "done")], 1)).toEqual([]);
  });
});
