// CONTEXT PACK helpers — the selection model the pane edit modal and the config chip share.
import { describe, it, expect, vi } from "vitest";
vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn() }));
import { quotaState, handoffTargets, handoffAsk, parsePack, itemKey, itemLabel, toggleItem, packChipLabel, packChipTitle, withPack, normPath, readsChipLabel, readsChipTitle, usageChipLabel, usageChipTitle, usageTone, expandOptions, plansChipLabel, planDecisionMessage, DEFAULT_BUDGET_CHARS, auditVerdict } from "./context-pack";

describe("parsePack", () => {
  it("defaults to the scope preset with live tools when the pane never chose", () => {
    expect(parsePack(null)).toEqual({ preset: "scope", items: [], live: true, budget_chars: DEFAULT_BUDGET_CHARS });
    expect(parsePack("{not json")).toEqual({ preset: "scope", items: [], live: true, budget_chars: DEFAULT_BUDGET_CHARS });
    expect(parsePack('{"skills":["a"]}').preset).toBe("scope");
  });
  it("keeps a custom selection, drops malformed items, normalises paths", () => {
    const p = parsePack(JSON.stringify({ context_pack: { preset: "custom", items: [{ kind: "laws" }, { kind: "file", path: "./src/a.ts/" }, { kind: "" }, { kind: "folder" }, { kind: "doc", id: "4" }, { kind: "ast", path: "src/a.ts", args: { symbol: "go" } }, { kind: "git" }], live: false, budget_chars: 10 } }));
    expect(p).toEqual({ preset: "custom", items: [{ kind: "laws" }, { kind: "file", path: "src/a.ts" }, { kind: "doc", id: 4 }, { kind: "ast", path: "src/a.ts", args: { symbol: "go" } }, { kind: "git" }], live: false, budget_chars: 10 });
    expect(normPath("\\src\\x\\")).toBe("src/x");
  });
});

describe("items", () => {
  it("keys and labels are stable and toggling flips membership", () => {
    const a = { kind: "file" as const, path: "src/a.ts" };
    expect(itemKey(a)).toBe("file:src/a.ts");
    expect(itemKey({ kind: "laws" })).toBe("laws");
    expect(itemKey({ kind: "doc", id: 3 })).toBe("doc:3");
    expect(itemLabel(a)).toBe("file review · src/a.ts");
    expect(itemKey({ kind: "ast", path: "src/a.ts", args: { symbol: "go" } })).toBe("ast:src/a.ts:symbol=go");
    expect(itemLabel({ kind: "ast", path: "src/a.ts", args: { lines: "1-9" } })).toBe("ast · src/a.ts (lines 1-9)");
    expect(itemLabel({ kind: "file_history", path: "x" })).toBe("file history · x");
    expect(itemLabel({ kind: "git" })).toBe("git");
    const items = [{ kind: "laws" as const }, a];
    expect(toggleItem(items, a)).toEqual([{ kind: "laws" }]);
    expect(toggleItem([{ kind: "laws" }], a)).toEqual([{ kind: "laws" }, a]);
  });
});

describe("chip", () => {
  const bake = { ok: true, live: true, chars: 38_400, generated: "2026-09-14T10:00:00.000Z", items: [
    { kind: "laws" as const, file: "laws.md", summary: "17 ratified laws", chars: 9000, written: true },
    { kind: "file" as const, path: "src/a.ts", file: "files/src__a.ts.md", summary: "file review 42/100", chars: 3000, written: true },
    { kind: "file" as const, path: "src/b.ts", file: "files/src__b.ts.md", summary: "", chars: 3000, written: false },
  ] };
  it("says preset · written files · size · live, and lists the cut ones in the tooltip", () => {
    const pack = parsePack(null);
    expect(packChipLabel(pack, bake)).toBe("📦 ctx scope · 2 files (1 cut) · 38k · live");
    const title = packChipTitle(pack, bake);
    expect(title).toContain("rule: laws · one folder review");
    expect(title).toContain("• .antiloki/context/files/src__a.ts.md — file review 42/100");
    expect(title).toContain("✗ file review · src/b.ts (budget)");
    expect(title).toContain("baked 2026-09-14 10:00:00");
  });
  it("handles none / pending / not-baked without a bake result", () => {
    expect(packChipLabel({ preset: "none", items: [], live: false, budget_chars: 1 }, null)).toBe("📦 ctx none");
    expect(packChipLabel({ preset: "none", items: [], live: true, budget_chars: 1 }, null)).toBe("📦 ctx none · live tools");
    expect(packChipLabel(parsePack(null), { ok: false, pending: true })).toBe("📦 ctx scope · pending");
    expect(packChipLabel(parsePack(null), { ok: false, error: "x" })).toBe("📦 ctx scope · ⚠");
    expect(packChipLabel(parsePack(null), null)).toBe("📦 ctx scope");
  });
});

describe("withPack", () => {
  it("replaces only the context_pack block and keeps the other settings", () => {
    const out = withPack('{"skills":["a"],"context_chips":[{"uid":"u"}],"context_pack_hash":"h"}', { preset: "custom", items: [{ kind: "laws" }], live: false, budget_chars: 5 });
    expect(out).toEqual({ skills: ["a"], context_chips: [{ uid: "u" }], context_pack_hash: "h", context_pack: { preset: "custom", items: [{ kind: "laws" }], live: false, budget_chars: 5 } });
    expect(withPack(undefined, parsePack(null)).context_pack).toEqual({ preset: "scope", items: [], live: true, budget_chars: DEFAULT_BUDGET_CHARS });
  });
});

describe("reads chip", () => {
  it("shows the pack/source ratio and warns when the pack is ignored", () => {
    expect(readsChipLabel(null)).toBeNull();
    expect(readsChipLabel({ total: 0, pack: 0, source: 0, search: 0, tool: 0, brief: 0, other: 0, nudged: 0, index_read: false })).toBeNull();
    const r = { total: 9, pack: 5, source: 2, search: 1, tool: 1, brief: 0, other: 0, nudged: 1, index_read: true };
    expect(readsChipLabel(r)).toBe("📖 pack 5 · src 2 · grep 1 · tools 1");
    expect(readsChipTitle(r)).toContain("INDEX.md read: yes · nudges handed out: 1");
    expect(readsChipTitle({ ...r, pack: 1, source: 8 })).toContain("⚠ mostly source");
  });
});

describe("usage chip", () => {
  it("renders claude, codex and opencode shapes and stays silent before the first report", () => {
    expect(usageChipLabel(null)).toBeNull();
    expect(usageChipLabel({ engine: "claude-code", source: "none", reason: "x" })).toBeNull();
    const claude = { engine: "claude-code", source: "f", model: "Opus 5", context: { used_pct: 12.4, size: 200000, input_tokens: 15500, output_tokens: 1200 }, cost_usd: 0.4213, limits: [{ label: "5h", used_pct: 23.5, resets_at: 1 }, { label: "week", used_pct: 41.2 }] };
    expect(usageChipLabel(claude)).toBe("⌁ ctx 12% · $0.42 · 5h 24% · wk 41%");
    expect(usageChipTitle(claude)).toContain("weekly window: 41% used");
    expect(usageTone(claude)).toBe("ok");
    expect(usageTone({ ...claude, limits: [{ label: "week", used_pct: 96 }] })).toBe("bad");
    const codex = { engine: "codex", source: "f", context: { used_pct: 25.8 }, session: { tokens_total: 989636, turns: 3 }, cost_usd: null, limits: [{ label: "5h", used_pct: 22 }, { label: "week", used_pct: 41.5 }] };
    expect(usageChipLabel(codex)).toBe("⌁ ctx 26% · 5h 22% · wk 42%");
    const oc = { engine: "opencode", source: "db", session: { tokens_total: 41607, messages: 3 }, cost_usd: 0, limits: [], weekly_local: { tokens: 120000, cost_usd: 1.2 }, proxy: { cost_usd: 0.01, calls: 2 } };
    expect(usageChipLabel(oc)).toBe("⌁ 42k tok · $0.00 · wk 120k tok");
    expect(usageChipTitle(oc)).toContain("antiloki proxy meter: $0.0100 · 2 calls");
  });
  it("offers the file and its folder when a write was blocked", () => {
    expect(expandOptions("src/lib/x.ts")).toEqual({ file: "src/lib/x.ts", folder: "src/lib/**" });
    expect(expandOptions("README.md")).toEqual({ file: "README.md", folder: null });
  });
});

describe("plans", () => {
  it("labels the chip and words the decision for the agent", () => {
    expect(plansChipLabel([])).toBeNull();
    expect(plansChipLabel([{ file: "f", title: "t", chars: 1, status: "pending" }])).toBe("📋 plan · pending");
    expect(plansChipLabel([{ file: "f", title: "t", chars: 1, status: "accepted" }, { file: "g", title: "u", chars: 1, status: "pending" }])).toBe("📋 2 plans · 1 pending");
    expect(planDecisionMessage("accepted", "Ship it")).toContain('Plan accepted by the operator: "Ship it". Proceed');
    expect(planDecisionMessage("rejected", "Ship it", "too big")).toContain("Reason: too big.");
  });
});

describe("auditVerdict — one line about writes vs git", () => {
  const base = { log: { sha256: "x", lines: 3, first: "", last: "", file: ".antiloki/reads.jsonl" }, files: [], git: { base: "main", changed: [] }, events: [], event_total: 0 };
  it("warns first about a change the hook never saw as a write", () => {
    const v = auditVerdict({ ...base, counts: { reads: 4, writes: 1, blocked: 0, exec: 0, search: 0, tool: 0 }, cross: { matched: ["a.ts"], git_only: ["gen.ts"], hook_only: [] } });
    expect(v.tone).toBe("warn");
    expect(v.text).toContain("gen.ts");
  });
  it("mentions refused writes, else says every change traces to a tool write", () => {
    expect(auditVerdict({ ...base, counts: { reads: 4, writes: 2, blocked: 1, exec: 0, search: 0, tool: 0 }, cross: { matched: ["a.ts"], git_only: [], hook_only: [] } })).toEqual({ tone: "warn", text: "2 writes accounted for · 1 refused outside the scope" });
    expect(auditVerdict({ ...base, counts: { reads: 4, writes: 2, blocked: 0, exec: 0, search: 0, tool: 0 }, cross: { matched: ["a.ts", "b.ts"], git_only: [], hook_only: [] } }).tone).toBe("ok");
    expect(auditVerdict(null).tone).toBe("dim");
  });
});

import { quickStats } from "./context-pack";
describe("quickStats — the status row's discrete numbers", () => {
  it("one icon + value per figure the engine reports, tones on the hot ones, the sentence as the title", () => {
    const st = quickStats({ engine: "claude-code", source: "statusline", context: { used_pct: 91, size: 1_000_000 }, session: { tokens_total: 35500, turns: 3 }, cost_usd: 0.29, limits: [{ label: "5h", used_pct: 39 }, { label: "week", used_pct: 55 }] }, { metered: { cost: 0.0123, calls: 2 }, startedAt: 1_000_000, now: 1_000_000 + 65 * 60_000 });
    expect(st.map((x) => `${x.icon} ${x.value}`)).toEqual(["◔ 91%", "Σ 36k", "$ 0.29", "$ 0.012", "⏱ 39%", "▦ 55%", "◷ 1h05"]);
    expect(st[0].tone).toBe("bad");
    expect(st[0].title).toContain("context window used: 91%");
    expect(st[3].tone).toBe("warn");
    expect(quickStats(null)).toEqual([]);
    expect(quickStats({ engine: "codex", source: "db", cost_usd: 1 })).toEqual([]);
  });
});

// THE QUOTA HANDOFF (2026-09-20)
describe("quotaState", () => {
  const u = { engine: "claude-code", limits: [{ label: "5h", used_pct: 40, resets_at: 1789933800 }, { label: "week", used_pct: 83.4, resets_at: 1790337600 }] } as any;
  it("grades the worst window: ok under 80, warn from 80, limit at 100", () => {
    expect(quotaState({ engine: "codex", limits: [{ label: "5h", used_pct: 12 }] } as any).level).toBe("ok");
    const w = quotaState(u);
    expect(w.level).toBe("warn"); expect(w.window).toBe("week"); expect(w.pct).toBe(83.4); expect(w.resetsAt).toBe(1790337600);
    expect(w.why).toMatch(/^the weekly window is at 83% · resets /);
    expect(quotaState({ engine: "codex", limits: [{ label: "5h", used_pct: 100 }] } as any).level).toBe("limit");
    expect(quotaState(null).level).toBe("ok");
  });
  it("the CLI's own limit line wins over the numbers", () => {
    const q = quotaState(u, { text: "You've hit your usage limit. Upgrade to Plus", t: 1 });
    expect(q.level).toBe("limit"); expect(q.why).toMatch(/^the CLI said: You've hit your usage limit/);
  });
});
describe("handoffTargets + handoffAsk", () => {
  const engines = [{ key: "opencode", installed: true }, { key: "claude-code", installed: true }, { key: "codex", installed: false }, { key: "opencode-direct", installed: true }];
  it("offers only the other installed binaries, once each", () => {
    expect(handoffTargets("claude-code", engines)).toEqual(["opencode"]);
    expect(handoffTargets("opencode", engines)).toEqual(["claude-code"]);
    expect(handoffTargets("codex", [{ key: "codex", installed: true }])).toEqual([]);
  });
  it("the first message names the handoff file and the engine that ran dry", () => {
    expect(handoffAsk("claude-code", ".antiloki/handoff/20260920170102-claude-code.md")).toBe("Read .antiloki/handoff/20260920170102-claude-code.md first — it is the handoff from claude-code, which ran out of its usage quota in this box. Then continue the work exactly from where it stopped: do not redo what is done, do not undo it.");
  });
});
