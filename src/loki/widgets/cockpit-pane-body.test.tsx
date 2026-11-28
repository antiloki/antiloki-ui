// @vitest-environment jsdom
// The first ask is typed only once the CLI's composer is up (serve `ready`), with honest fallbacks.
import { describe, it, expect } from "vitest";
import { worthRouting, firstAskBeat, readPolicy, routerSavings } from "./cockpit-pane-body";
import { minSavings } from "./subagents";

describe("firstAskBeat", () => {
  it("waits for ready, falls back to the 5s beat on an older serve or after ~40s", () => {
    expect(firstAskBeat(false, undefined, 0)).toBeNull();
    expect(firstAskBeat(true, false, 3)).toBeNull();
    expect(firstAskBeat(true, true, 0)).toBe(800);
    expect(firstAskBeat(true, undefined, 0)).toBe(5_000);
    expect(firstAskBeat(true, false, 20)).toBe(5_000);
  });
});

describe("the strip's policy toggles — pure", () => {
  it("reads router and sub-agents from the settings (on by default) and sums the router's savings over routed runs only", () => {
    expect(readPolicy({})).toEqual({ router: true, subagents: true });
    expect(readPolicy({ router: { enabled: false }, delegate: { enabled: false } })).toEqual({ router: false, subagents: false });
    // the SAME rule as the header chip (goals/ledger): a run counts only when the router was on for it - a run with no `router` field is not routed ($4.24 in the menu vs $4.11 on the chip, 2026-10-09)
    expect(routerSavings([{ router: true, savings: { saved_usd: 1, baseline_usd: 3 } }, { router: false, savings: { saved_usd: 9, baseline_usd: 9 } }, { savings: null }, { savings: { saved_usd: 0.5, baseline_usd: 1 } }])).toEqual({ saved: 1, baseline: 3, runs: 1 });
  });
});

describe("MIN's column (2026-09-21)", () => {
  it("MIN turns are their own sum and never count as the router's", () => {
    const runs = [{ router: true, savings: { saved_usd: 1, baseline_usd: 3, actual_usd: 2 } }, { router: false, min: true, savings: { saved_usd: 0.4, baseline_usd: 0.8, actual_usd: 0.4 } }, { min: true, savings: null }, { min: true, savings: { saved_usd: 0.1, baseline_usd: 0.2, actual_usd: 0.1 } }];
    expect(minSavings(runs)).toEqual({ saved: 0.5, actual: 0.5, turns: 2 });
    expect(routerSavings(runs)).toEqual({ saved: 1, baseline: 3, runs: 1 });
  });
});

describe("what is worth routing (found 2026-09-28: \"say exactly: ready\" was screened and the run parked)", () => {
  it("does not route talk", () => {
    for (const s of ["say exactly: ready", "hi there how are you", "thanks a lot for that", "ok sounds good to me", "repeat that back please"])
      expect(worthRouting(s)).toBe(false);
  });
  it("routes work, however it is phrased", () => {
    for (const s of ["add a product to the store", "why does the build fail", "fix src/products.ts", "refactor the cart component", "explain how checkout works"])
      expect(worthRouting(s)).toBe(true);
  });
  // the audit of 2026-09-28: a pleasantry at the FRONT of a real ask used to drop the whole thing, and a bug
  // reported as a symptom had no verb at all
  it("routes work that opens with a pleasantry, and work described as a symptom", () => {
    for (const s of ["thanks — now delete the old table", "ok now fix the parser", "hi there, can you fix the auth bug?",
                     "the login page crashes when I click submit", "the tests are still red", "the button is broken"])
      expect(worthRouting(s)).toBe(true);
  });
  it("does not drop a line it cannot read: another script or accented letters route (the serve's front and the voice decide)", () => {
    for (const s of ["adicione filtros por tag ao catálogo", "añade un filtro por precio", "フッターを追加してください", "добавь фильтры в каталог"])
      expect(worthRouting(s)).toBe(true);
  });
  it("keeps the old cheap rules", () => {
    expect(worthRouting("/model sonnet")).toBe(false);
    expect(worthRouting("short")).toBe(false);
    // operator 2026-09-29: "add filters" is 11 characters and never reached Heimdall - the chat model did the work itself, with no run and no stats
    for (const ask of ["add filters", "fix login", "add a sort", "rename foo bar"]) expect(worthRouting(ask), ask).toBe(true);
    for (const t of ["go", "yes", "ok", "hello there", "what next", "thanks a lot"]) expect(worthRouting(t), t).toBe(false);
    expect(worthRouting("")).toBe(false);
  });
  it("a long ask is work by weight of words, even with no keyword", () => {
    expect(worthRouting("the thing in the corner of the page keeps doing that odd jump whenever the list gets longer than about ten rows")).toBe(true);
  });
});
