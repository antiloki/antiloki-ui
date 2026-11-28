// MINI FUEL — three lines, always, aggregated per engine (operator 2026-09-16).
import { describe, it, expect, vi } from "vitest";
vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn(async () => ({ result: { sessions: [] } })) }));
import { engineLines, lineText, linesFromFuel, type Fuel } from "./fuel-mini";

describe("engineLines", () => {
  it("always yields one line per seat, dim when nothing runs", () => {
    const l = engineLines([]);
    expect(l.map((x) => x.key)).toEqual(["claude", "codex", "opencode", "gemini", "cursor", "grok"]);
    expect(l.every((x) => x.tone === "dim" && x.panes === 0)).toBe(true);
    expect(lineText(l[0])).toBe("not running");
  });
  // the two claude panes carry DIFFERENT sources because the meter is written per pane (2026-09-24) — two agents
  // are two meters and add up. Two panes reading one global store are covered by the source-dedup test below.
  it("sums tokens + cost over panes, takes the worst window, hides codex cost", () => {
    const l = engineLines([
      { kind: "claude-code", usage: { engine: "claude-code", source: ".antiloki/usage-1.json", session: { tokens_total: 12_300 }, cost_usd: 0.2, limits: [{ label: "5h", used_pct: 5 }, { label: "week", used_pct: 33 }] } },
      { kind: "claude-code", usage: { engine: "claude-code", source: ".antiloki/usage-2.json", session: { tokens_total: 700 }, cost_usd: 0.05, limits: [{ label: "5h", used_pct: 81 }, { label: "week", used_pct: 10 }] } },
      { kind: "codex", usage: { engine: "codex", source: "rollout", session: { tokens_total: 5000 }, cost_usd: 1, limits: [{ label: "5h", used_pct: 12 }, { label: "week", used_pct: 40 }] } },
      { kind: "opencode", usage: { engine: "opencode", source: "db", session: { tokens_total: 900 }, proxy: { cost_usd: 0.01 }, weekly_local: { tokens: 44_000 } } },
    ]);
    expect(lineText(l[0])).toBe("13k tok · $0.25 · 5h 81% · wk 33%");
    expect(l[0].tone).toBe("warn");
    expect(lineText(l[1])).toBe("5.0k tok · 5h 12% · wk 40%");
    expect(lineText(l[2])).toBe("900 tok · $0.01 · 5h — · wk 44k");
    expect(l[2].tone).toBe("ok");
  });
  it("a pane whose engine reported nothing yet still counts as running", () => {
    const l = engineLines([{ kind: "claude-code", usage: { engine: "claude-code", source: "none", reason: "no usage yet" } }]);
    expect(l[0].panes).toBe(1);
    expect(lineText(l[0])).toBe("— tok · $ — · 5h — · wk —");
    expect(l[0].tone).toBe("dim");
  });
});

describe("the donut at rest (2026-09-18)", () => {
  it("cuts each ring into one sector per engine and fills it by used %", async () => {
    const { ringSectors, arcPath, engineLines } = await import("./fuel-mini");
    const lines = engineLines([]).map((l, i) => ({ ...l, panes: i === 0 ? 1 : 0, week: i === 0 ? 50 : null, fiveH: i === 0 ? 100 : null }));
    const week = ringSectors(lines, (l) => l.week);
    expect(week.map((s) => s.key)).toEqual(["claude", "codex", "opencode", "gemini", "cursor", "grok"]);
    expect(week[0].a0).toBe(3); expect(week[0].a1).toBe(57);             // 60° sectors (six seats) with a 6° gap
    expect(week[0].usedTo).toBe(3 + (57 - 3) * 0.5);                     // half of its sector
    expect(week[1].usedTo).toBe(week[1].a0);                              // not reported → empty
    expect(week[1].live).toBe(false);
    const five = ringSectors(lines, (l) => l.fiveH);
    expect(five[0].usedTo).toBe(five[0].a1);                              // 100 % fills the sector
    expect(ringSectors(lines, () => 250)[0].usedTo).toBe(57);             // clamped
    expect(arcPath(23, 23, 19, 0, 0)).toBe("");
    expect(arcPath(23, 23, 19, 0, 90)).toMatch(/^M 23\.00 4\.00 A 19 19 0 0 1 42\.00 23\.00$/);
    expect(arcPath(23, 23, 19, 0, 270)).toContain(" 0 1 1 ");               // large-arc flag past 180°
  });
});

// BUG 5 (operator 2026-09-24: "at the header fuel didn't change"). Two halves. On the serve side the claude
// meter was per-WORKTREE, so agents sharing a box overwrote each other's file; here the aggregate added the
// same global store once per pane, so the figure tracked how many panes were open rather than who was working.
describe("one meter per source (2026-09-24)", () => {
  it("adds claude's per-pane meters but never double-counts one global store", async () => {
    const { engineLines, lineText } = await import("./fuel-mini");
    const claude = (src: string, tok: number, cost: number) => ({ kind: "claude-code", usage: { engine: "claude-code", source: src, session: { tokens_total: tok }, cost_usd: cost } as any });
    // two OpenCode panes on one machine read the SAME database — that is one meter, not two
    const oc = { kind: "opencode", usage: { engine: "opencode", source: "/home/x/.local/share/opencode/opencode.db", session: { tokens_total: 70_000 }, cost_usd: 0.04 } as any };
    const l = engineLines([claude(".antiloki/usage-19.json", 100, 0.10), claude(".antiloki/usage-22.json", 200, 0.20), oc, { ...oc }]);
    expect(l[0].tokens).toBe(300);          // two agents, two files, genuinely additive
    expect(l[0].cost).toBeCloseTo(0.30);
    expect(l[2].tokens).toBe(70_000);       // one database counted once, however many panes point at it
    expect(l[2].cost).toBeCloseTo(0.04);
    expect(l[2].panes).toBe(2);             // the pane count is still what it is
    expect(lineText(l[2])).toContain("70k tok");
  });
});


// FUEL FROM THE RECORD (operator 2026-09-24: "fuel still not working, also fuel should show complete info about
// saved tokens and money by using antiloki heimdall"). It asked every pane for a meter file the CLI writes only
// after an agent has spoken, so an idle claude agent made the whole gauge read `— tok · $ —`.
describe("the lines come from brain.ai_calls, not from a meter file that may not exist", () => {
  const fuel = (o: Partial<Fuel> = {}): Fuel => ({
    days: 7,
    houses: [
      { house: "claude", calls: 294, cost: 34.05, tokens_in: 11_000_000, tokens_out: 1_216_880, tokens: 12_216_880, failed: 5, models: 3 },
      { house: "codex", calls: 32, cost: 0, tokens_in: 1_000_000, tokens_out: 40_241, tokens: 1_040_241, failed: 0, models: 1 },
      { house: "opencode", calls: 0, cost: 0, tokens_in: 0, tokens_out: 0, tokens: 0, failed: 0, models: 0 },
    ],
    models: [], limits: [{ house: "claude", label: "5h", used_pct: 9 }, { house: "claude", label: "week", used_pct: 96 }],
    saved: { runs: 82, routed: 82, actual: 25.8, baseline: 100, saved: 74.2, pct: 74, tokens: 9_600_000, line: "Heimdall kept $74.20", proof: [] },
    compare: [], analysis: "612 call(s), $37.95.", ...o,
  });

  it("an engine that ran shows its real numbers, and one that did not says nothing rather than zero", () => {
    const l = linesFromFuel(fuel());
    expect(lineText(l[0])).toBe("12.2M tok · $34.05 · 5h 9% · wk 96%");
    expect(l[0].tone).toBe("bad");                    // 96% of the week is the thing to see
    expect(lineText(l[1])).toContain("1.0M tok");     // codex reports tokens even with no cost
    expect(lineText(l[2])).toBe("not running");       // no calls in the window — not "$0.00"
    expect(l[2].tone).toBe("dim");
  });

  it("a seat that hit its usage limit is shown out of quota until the time it named, and Cursor / Gemini / Grok have lines too (operator 2026-09-30)", () => {
    const resets = Math.floor(new Date(2026, 8, 30, 16, 44).getTime() / 1000);
    const f = fuel({
      houses: [...fuel().houses, { house: "cursor", calls: 28, cost: 0, tokens_in: 10, tokens_out: 5, tokens: 15, failed: 0, models: 2 }, { house: "gemini", calls: 8, cost: 0.1, tokens_in: 10, tokens_out: 5, tokens: 15, failed: 0, models: 2 }],
      limits: [{ house: "codex", label: "5h", used_pct: 100, resets_at: resets }, { house: "codex", label: "week", used_pct: 78 }, { house: "gemini", label: "limit", used_pct: 100, resets_at: resets, note: "quota exceeded" }],
    });
    const l = linesFromFuel(f), by = (k: string) => l.find((x) => x.key === k)!;
    expect(lineText(by("codex"))).toContain("5h 100%");          // the window Codex itself reported
    expect(by("codex").tone).toBe("bad");
    expect(by("gemini").tone).toBe("bad");
    expect(lineText(by("gemini"))).toMatch(/^out of quota until ~.*4:44.* — routed around$/);
    expect(lineText(by("cursor"))).toBe("15 tok · $0.00");       // no windows reported, so no dashes pretending to be windows
    expect(by("grok").tone).toBe("dim");
  });

  it("no serve, no invention", () => {
    const l = linesFromFuel(null);
    expect(l.map((x) => x.key)).toEqual(["claude", "codex", "opencode", "gemini", "cursor", "grok"]);
    expect(l.every((x) => x.tokens === null && x.cost === null && x.tone === "dim")).toBe(true);
  });
});

// A SEAT THAT PUBLISHES NO QUOTA (2026-10-01, item 6): Cursor, Gemini and Grok have no window anywhere antiloki can read, so the line says what antiloki itself sent them - and says it is a count.
// Never a percentage that nobody reported.
describe("a seat with no quota feed shows what was sent, not a made-up window", () => {
  const base = (): Fuel => ({
    days: 7,
    houses: [
      { house: "cursor", calls: 12, cost: 0, tokens_in: 15_000, tokens_out: 5_000, tokens: 20_000, failed: 0, models: 2 },
      { house: "gemini", calls: 1, cost: 0, tokens_in: 900, tokens_out: 100, tokens: 1000, failed: 0, models: 1 },
    ],
    models: [], limits: [], saved: { runs: 0, routed: 0, actual: 0, baseline: 0, saved: 0, pct: 0, tokens: 0, line: "", proof: [] }, compare: [], analysis: "",
  });
  const own = (house: string, c5: number, t5: number, c7: number, t7: number) => ({ house, label: "own", calls_5h: c5, tokens_5h: t5, calls_7d: c7, tokens_7d: t7, note: "no quota data from this CLI" });

  it("prints calls and tokens for the last 5h and 7d, labelled as having no quota data", () => {
    const l = linesFromFuel({ ...base(), limits: [own("cursor", 3, 4100, 12, 20_000), own("gemini", 1, 1000, 1, 1000)] });
    const by = (k: string) => l.find((x) => x.key === k)!;
    expect(lineText(by("cursor"))).toBe("$0.00 · 5h: 3 calls / 4.1k tok · 7d: 12 calls / 20k tok (no quota data from this CLI - set a weekly allowance in Settings › Seats)");
    expect(lineText(by("gemini"))).toContain("5h: 1 call / 1.0k tok");     // singular, not "1 calls"
    expect(lineText(by("cursor"))).not.toMatch(/\d%/);                      // no percentage anywhere: none was reported
    expect(by("cursor").fiveH).toBeNull(); expect(by("cursor").week).toBeNull();   // the donut gets nothing to fill
  });

  it("a seat with no such row keeps the plain line, and a seat with a real window never prints the count", () => {
    expect(lineText(linesFromFuel(base()).find((x) => x.key === "cursor")!)).toBe("20k tok · $0.00");
    const real = linesFromFuel({ ...base(), limits: [{ house: "cursor", label: "5h", used_pct: 40 }, own("cursor", 3, 4100, 12, 20_000)] }).find((x) => x.key === "cursor")!;
    expect(lineText(real)).toBe("20k tok · $0.00 · 5h 40%");
  });

  it("Cursor's own meters (read from /usage) replace the count: shown as plan %, the fullest stands for the window, and a full one is out of quota", () => {
    const m = (label: string, used_pct: number) => ({ house: "cursor", label, used_pct, resets_at: 1792800000, measured: true });
    const c = linesFromFuel({ ...base(), limits: [own("cursor", 3, 4100, 12, 20_000), m("included", 100), m("auto", 100), m("api", 82)] }).find((x) => x.key === "cursor")!;
    expect(c.measured).toMatchObject({ included: 100, auto: 100, api: 82 });
    expect(c.week).toBe(100); expect(c.out).toBe(true); expect(c.tone).toBe("bad");
    expect(c.limited).toContain("out of quota (Cursor's own meter: plan 100% used · auto 100% · api 82%)");
    expect(lineText(c)).toContain("plan 100% used · auto 100% · api 82%");
    expect(lineText(c)).not.toContain("no quota data");
    const low = linesFromFuel({ ...base(), limits: [m("included", 40), m("auto", 40), m("api", 10)] }).find((x) => x.key === "cursor")!;
    expect(low.out).toBeUndefined(); expect(low.tone).toBe("ok"); expect(low.week).toBe(40);
    expect(lineText(low)).toContain("plan 40% used (auto 40% · api 10%)");
  });

  it("a seat with no calls in the window is still 'not running', whatever the row says", () => {
    const l = linesFromFuel({ ...base(), houses: [], limits: [own("grok", 0, 0, 2, 50)] });
    expect(lineText(l.find((x) => x.key === "grok")!)).toBe("not running");
  });
});
