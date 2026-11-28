// CONTEXT PACK (2026-09-14) — the per-pane selection of antiloki's measured context that a code
// agent (Claude Code · Codex · OpenCode · agent) reads before it explores. Pure helpers over the
// shape shared with the Rust side (`cockpit/_helpers/context-pack.rs`); the bake itself and the
// default derivation live in the engine — this module only edits the selection and reads results.
import { apiGet, apiPost } from "@/loki/api/client";

// any catalog source key (the engine's context-catalog.rs is the authority) plus the cockpit's `doc`
export type PackKind = string;
export type PackPreset = "scope" | "custom" | "none";
export type PackItem = { kind: PackKind; path?: string; id?: number; args?: Record<string, unknown> };
/** One row of the engine's source catalog (`antiloki_sources`). */
export type PackSource = { key: string; label: string; description: string; args: { name: string; description: string }[]; packable: boolean; ai: boolean };
export type ContextPack = { preset: PackPreset; items: PackItem[]; live: boolean; budget_chars: number };

/** One line of a bake result / manifest — what the engine wrote (or skipped) for one item. */
export type PackManifestItem = PackItem & { file: string; summary: string; chars: number; written: boolean; snapshot_id?: number };
export type PackBake = {
  ok: boolean; skipped?: boolean; removed?: boolean; pending?: boolean; error?: string;
  hash?: string; live?: boolean; chars?: number; generated?: string | null;
  items?: PackManifestItem[]; skipped_items?: PackManifestItem[]; warnings?: string[]; files?: string[];
};

/** The kinds known before the catalog is fetched — the built-ins the default pack uses. */
export const PACK_KINDS: PackKind[] = ["laws", "folder", "file", "graph", "tests", "blast", "doc"];
export const DEFAULT_BUDGET_CHARS = 200_000;
/** The engine's default rule, repeated here so the modal can print it without a round-trip. */
export const DEFAULT_RULE = "laws · one folder review per scope directory (max 8) · file reviews for in-scope files with health < 80, worst first (max 20) · import graph + test map per scope folder · the session's context docs";

const GLYPHS: Record<string, string> = { pack: "◆", laws: "§", folder: "📁", file: "📐", graph: "⇄", tests: "✓", blast: "◉", doc: "🧠", ast: "⟨⟩", git: "⎇", file_history: "⏱", authors: "👤", history: "⏱", imports: "→", subgraph: "⇄", neighborhood: "◎", diagram: "⌘", tree: "🌲", metrics: "#", smells: "☁", entry_points: "⚑", signals: "⚡", coverage: "▦", report: "📋", atlas_report: "📋", digest: "≡", decorators: "✎", review_history: "⏱", docs: "📄", paper: "📰", source: "𝄆" };
const LABELS: Record<string, string> = { pack: "context pack", laws: "the ratified laws", folder: "folder review", file: "file review", graph: "import graph", tests: "test map", blast: "blast radius", doc: "context doc" };
export const KIND_GLYPH: Record<string, string> = new Proxy(GLYPHS, { get: (o, k: string) => o[k] ?? "•" });
export const KIND_LABEL: Record<string, string> = new Proxy(LABELS, { get: (o, k: string) => o[k] ?? String(k).replace(/_/g, " ") });

const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;

/** `settings_json` → the pack block, normalised the way the engine normalises it (absent → scope default). */
export function parsePack(settingsJson: string | null | undefined | Record<string, unknown>): ContextPack {
  let settings: any = settingsJson;
  if (typeof settingsJson === "string") { try { settings = JSON.parse(settingsJson); } catch { settings = null; } }
  const cp = settings?.context_pack ?? {};
  const preset: PackPreset = cp.preset === "custom" || cp.preset === "none" ? cp.preset : "scope";
  const items: PackItem[] = Array.isArray(cp.items) ? cp.items.filter(isItem).map(normItem) : [];
  const live = typeof cp.live === "boolean" ? cp.live : true;
  const budget = Number.isFinite(Number(cp.budget_chars)) && Number(cp.budget_chars) > 0 ? Number(cp.budget_chars) : DEFAULT_BUDGET_CHARS;
  return { preset, items, live, budget_chars: budget };
}

/** Sources that need no path (the engine drops a path-less item of any other kind). */
const PATHLESS = new Set(["laws", "tree", "docs", "coverage", "paper", "pack", "metrics", "smells", "entry_points", "signals", "report", "atlas_report", "digest", "git", "authors", "history"]);
function isItem(it: any): boolean {
  if (!it || typeof it.kind !== "string" || !it.kind) return false;
  if (it.kind === "doc") return Number.isInteger(Number(it.id));
  if (PATHLESS.has(it.kind)) return true;
  return typeof it.path === "string" && it.path.trim() !== "";
}
function normItem(it: any): PackItem {
  if (it.kind === "doc") return { kind: "doc", id: Number(it.id) };
  const args = it.args && typeof it.args === "object" && !Array.isArray(it.args) && Object.keys(it.args).length ? { args: it.args } : {};
  const path = typeof it.path === "string" && it.path.trim() ? { path: normPath(String(it.path)) } : {};
  return { kind: it.kind, ...path, ...args };
}
export function normPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
}

/** Identity of an item — what "the same item" means when toggling or de-duplicating. */
export function itemKey(it: PackItem): string {
  const args = it.args && Object.keys(it.args).length ? `:${Object.keys(it.args).sort().map((k) => `${k}=${String((it.args as any)[k])}`).join(",")}` : "";
  return it.kind === "doc" ? `doc:${it.id}` : `${it.kind}${it.path ? `:${it.path}` : ""}${args}`;
}
export function itemLabel(it: PackItem): string {
  if (it.kind === "doc") return `context doc #${it.id}`;
  const args = it.args && Object.keys(it.args).length ? ` (${Object.keys(it.args).sort().map((k) => `${k} ${String((it.args as any)[k])}`).join(", ")})` : "";
  return `${KIND_LABEL[it.kind]}${it.path ? ` · ${it.path}` : ""}${args}`;
}

/** The catalog, live from the engine (falls back to the built-ins when the BE is unreachable). */
export async function fetchSources(paneId: number): Promise<PackSource[]> {
  try {
    const r = unwrap(await apiPost(`/api/v1/cockpit/pane/context/tool`, { pane_id: paneId, tool: "antiloki_sources", args: {} }, { timeoutMs: 15_000 }));
    if (Array.isArray(r?.sources)) return r.sources as PackSource[];
  } catch { /* fall through */ }
  return PACK_KINDS.filter((k) => k !== "doc").map((k) => ({ key: k, label: KIND_LABEL[k], description: "", args: k === "laws" ? [] : [{ name: "path", description: "" }], packable: true, ai: false }));
}

/** Turn a resolved (scope-derived) list into a custom selection with one item removed or added. */
export function toggleItem(items: PackItem[], it: PackItem): PackItem[] {
  const k = itemKey(it);
  return items.some((x) => itemKey(x) === k) ? items.filter((x) => itemKey(x) !== k) : [...items, it];
}

/** The chip on the pane's config line: `📦 ctx scope · 6 files · 38k` / `📦 ctx none` / `📦 ctx custom · 2 files (1 cut)`. */
export function packChipLabel(pack: ContextPack, bake: PackBake | null | undefined): string {
  if (pack.preset === "none") return pack.live ? "📦 ctx none · live tools" : "📦 ctx none";
  if (!bake || !bake.ok) return `📦 ctx ${pack.preset}${bake?.pending ? " · pending" : bake && bake.error ? " · ⚠" : ""}`;
  const items = Array.isArray(bake.items) ? bake.items : [];
  const written = items.filter((i) => i.written).length;
  const cut = items.length - written;
  const k = Number(bake.chars ?? 0);
  const size = k >= 1000 ? `${Math.round(k / 1000)}k` : `${k}`;
  return `📦 ctx ${pack.preset} · ${written} file${written === 1 ? "" : "s"}${cut ? ` (${cut} cut)` : ""} · ${size}${bake.live ? " · live" : ""}`;
}

/** Tooltip for the chip: every written file with its summary, then the cut ones. */
export function packChipTitle(pack: ContextPack, bake: PackBake | null | undefined): string {
  const head = pack.preset === "scope" ? `context pack · preset scope\nrule: ${DEFAULT_RULE}` : `context pack · preset ${pack.preset}`;
  if (!bake || !bake.ok) return `${head}\n${bake?.error ?? (bake?.pending ? "worktree pending — nothing baked yet" : "not baked yet")}`;
  const items = Array.isArray(bake.items) ? bake.items : [];
  const lines = items.filter((i) => i.written).map((i) => `• .antiloki/context/${i.file} — ${i.summary}`);
  const cut = items.filter((i) => !i.written).map((i) => `✗ ${itemLabel(i)} (budget)`);
  const gen = bake.generated ? `\nbaked ${String(bake.generated).slice(0, 19).replace("T", " ")}` : "";
  return [head, ...lines, ...cut, gen, bake.live ? "live MCP tools: on" : "live MCP tools: off"].filter(Boolean).join("\n");
}

/** Bake (or re-bake) a pane's pack; the engine hash-skips when nothing changed. */
export async function bakeContextPack(paneId: number, force = false): Promise<PackBake> {
  const r = unwrap(await apiPost(`/api/v1/cockpit/pane/context/bake`, { pane_id: paneId, force }, { timeoutMs: 60_000 }));
  return (r && typeof r === "object" ? r : { ok: false, error: "bake returned nothing" }) as PackBake;
}

/** Settings object with the pack block replaced (every other key kept — skills, chips, layout). */
export function withPack(settingsJson: string | null | undefined | Record<string, unknown>, pack: ContextPack): Record<string, unknown> {
  let settings: any = settingsJson;
  if (typeof settingsJson === "string") { try { settings = JSON.parse(settingsJson); } catch { settings = null; } }
  const base = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  return { ...base, context_pack: { preset: pack.preset, items: pack.items, live: pack.live, budget_chars: pack.budget_chars } };
}

/** The hook's measurement for one pane: reads from the pack vs from source, searches, live tool calls, nudges. */
export type PackBlocked = { path: string; tool?: string | null; t?: string | null };
export type PackReads = { total: number; pack: number; source: number; search: number; tool: number; brief: number; other: number; written?: number; exec?: number; nudged: number; index_read: boolean; blocked?: PackBlocked[]; last?: unknown[] };

export async function fetchReads(paneId: number): Promise<PackReads | null> {
  try {
    const r = unwrap(await apiPost(`/api/v1/cockpit/pane/context/tool`, { pane_id: paneId, tool: "antiloki_reads", args: {} }, { timeoutMs: 10_000 }));
    return r?.reads && typeof r.reads === "object" ? (r.reads as PackReads) : null;
  } catch { return null; }
}

/** `📖 pack 5 · src 2 · tools 3` — shown once anything was read; the ratio is the point. */
export function readsChipLabel(r: PackReads | null | undefined): string | null {
  if (!r || !r.total) return null;
  const bits = [`pack ${r.pack}`, `src ${r.source}`];
  if (r.search) bits.push(`grep ${r.search}`);
  if (r.tool) bits.push(`tools ${r.tool}`);
  if (r.written) bits.push(`wrote ${r.written}`);
  if (r.blocked?.length) bits.push(`refused ${r.blocked.length}`);
  return `📖 ${bits.join(" · ")}`;
}
export function readsChipTitle(r: PackReads | null | undefined): string {
  if (!r || !r.total) return "reads: nothing yet — the Claude hook logs every Read/Grep/tool call here";
  return [
    `what the agent has read (Claude Code hook, this worktree)`,
    `pack files: ${r.pack} · source files: ${r.source} · searches: ${r.search} · live tools: ${r.tool} · brief/skills: ${r.brief}`,
    `INDEX.md read: ${r.index_read ? "yes" : "NO"} · nudges handed out: ${r.nudged}`,
    r.source > r.pack * 3 && r.total > 6 ? "⚠ mostly source — the pack is not being used; check the scope/preset" : "",
  ].filter(Boolean).join("\n");
}

/** Engine usage as the pane shows it: context · session tokens · cost · plan windows. */
export type PackUsage = {
  engine: string; t?: string; source?: string; reason?: string; model?: string | null;
  context?: { used_pct?: number | null; input_tokens?: number | null; output_tokens?: number | null; size?: number | null };
  session?: { tokens_total?: number | null; messages?: number | null; turns?: number | null };
  cost_usd?: number | null;
  limits?: { label: string; used_pct: number; resets_at?: number | null }[];
  weekly_local?: { tokens?: number | null; cost_usd?: number | null };
  proxy?: { cost_usd?: number | null; calls?: number | null };
};

export async function fetchUsage(paneId: number): Promise<PackUsage | null> {
  try {
    const r = unwrap(await apiPost(`/api/v1/cockpit/pane/context/tool`, { pane_id: paneId, tool: "antiloki_usage", args: {} }, { timeoutMs: 10_000 }));
    return r?.usage && typeof r.usage === "object" ? (r.usage as PackUsage) : null;
  } catch { return null; }
}

const fmtK = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`);
const pct = (n: number | null | undefined) => (n == null ? null : `${Math.round(Number(n))}%`);

/** `⌁ ctx 12% · $0.42 · 5h 24% · wk 41%` — null until the engine has reported anything. */
export function usageChipLabel(u: PackUsage | null | undefined): string | null {
  if (!u || u.source === "none") return null;
  const bits: string[] = [];
  const ctx = pct(u.context?.used_pct);
  if (ctx) bits.push(`ctx ${ctx}`);
  else if (u.session?.tokens_total != null) bits.push(`${fmtK(Number(u.session.tokens_total))} tok`);
  if (u.cost_usd != null && (u.engine !== "codex")) bits.push(`$${Number(u.cost_usd).toFixed(2)}`);
  for (const l of u.limits ?? []) bits.push(`${l.label === "week" ? "wk" : l.label} ${pct(l.used_pct)}`);
  if (u.weekly_local && u.weekly_local.tokens != null) bits.push(`wk ${fmtK(Number(u.weekly_local.tokens))} tok`);
  return bits.length ? `⌁ ${bits.join(" · ")}` : null;
}
/** THE QUICK STATS (operator 2026-09-19: "just the settings icon and some quick stats — tokens,
 *  context, cost, time — very discrete, simple icons"): each one an icon + a short value, with the
 *  sentence behind it as a tooltip. Pure. */
export type QuickStat = { icon: string; value: string; title: string; tone?: "ok" | "warn" | "bad" };
export function quickStats(u: PackUsage | null | undefined, extra?: { metered?: { cost: number; calls: number }; startedAt?: number | null; now?: number }): QuickStat[] {
  const out: QuickStat[] = [];
  const ctx = u?.context?.used_pct;
  if (ctx != null) out.push({ icon: "◔", value: `${Math.round(Number(ctx))}%`, title: `context window used: ${Math.round(Number(ctx))}%${u?.context?.size ? ` of ${fmtK(Number(u.context.size))}` : ""}`, tone: Number(ctx) >= 90 ? "bad" : Number(ctx) >= 70 ? "warn" : undefined });
  const tok = u?.session?.tokens_total ?? (u?.context?.input_tokens != null ? Number(u.context.input_tokens) + Number(u.context.output_tokens ?? 0) : null);
  if (tok != null) out.push({ icon: "Σ", value: `${fmtK(Number(tok))}`, title: `tokens this session: ${Number(tok).toLocaleString()}${u?.session?.turns != null ? ` · ${u.session.turns} turns` : ""}` });
  if (u?.cost_usd != null && u.engine !== "codex") out.push({ icon: "$", value: Number(u.cost_usd).toFixed(2), title: `the engine's own cost figure — on a subscription this is the API-equivalent, not a bill` });
  if (extra?.metered && extra.metered.calls > 0) out.push({ icon: "$", value: extra.metered.cost.toFixed(3), title: `metered AI calls through the proxy: ${extra.metered.calls} · $${extra.metered.cost.toFixed(4)}`, tone: "warn" });
  for (const l of u?.limits ?? []) out.push({ icon: l.label === "week" ? "▦" : "⏱", value: `${Math.round(Number(l.used_pct))}%`, title: `${l.label} limit used: ${Math.round(Number(l.used_pct))}%${l.resets_at ? ` · resets ${new Date(Number(l.resets_at) * (Number(l.resets_at) < 1e12 ? 1000 : 1)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`, tone: Number(l.used_pct) >= 90 ? "bad" : Number(l.used_pct) >= 75 ? "warn" : undefined });
  if (extra?.startedAt) { const m = Math.max(0, Math.round(((extra.now ?? Date.now()) - extra.startedAt) / 60000)); out.push({ icon: "◷", value: m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`, title: `running for ${m} minute${m === 1 ? "" : "s"}` }); }
  return out;
}
export function usageChipTitle(u: PackUsage | null | undefined): string {
  if (!u) return "usage: not reported yet";
  if (u.source === "none") return `usage (${u.engine}): ${u.reason ?? "nothing reported yet"}`;
  const lines: string[] = [`${u.engine}${u.model ? ` · ${u.model}` : ""}`];
  if (u.context?.used_pct != null) lines.push(`context window: ${Math.round(u.context.used_pct)}% used${u.context.size ? ` of ${fmtK(Number(u.context.size))}` : ""}${u.context.input_tokens != null ? ` (in ${fmtK(Number(u.context.input_tokens))} · out ${fmtK(Number(u.context.output_tokens ?? 0))})` : ""}`);
  if (u.session?.tokens_total != null) lines.push(`session: ${fmtK(Number(u.session.tokens_total))} tokens${u.session.messages != null ? ` · ${u.session.messages} messages` : u.session.turns != null ? ` · ${u.session.turns} turns` : ""}`);
  if (u.cost_usd != null) lines.push(`session cost: $${Number(u.cost_usd).toFixed(4)}`);
  for (const l of u.limits ?? []) {
    const reset = l.resets_at ? ` · resets ${new Date(Number(l.resets_at) * 1000).toLocaleString()}` : "";
    lines.push(`${l.label === "5h" ? "session window (5h)" : l.label === "week" ? "weekly window" : `${l.label} window`}: ${Math.round(l.used_pct)}% used${reset}`);
  }
  if (u.weekly_local) lines.push(`last 7 days on this machine: ${fmtK(Number(u.weekly_local.tokens ?? 0))} tokens · $${Number(u.weekly_local.cost_usd ?? 0).toFixed(2)}`);
  if (u.proxy) lines.push(`antiloki proxy meter: $${Number(u.proxy.cost_usd ?? 0).toFixed(4)} · ${u.proxy.calls ?? 0} calls`);
  if (u.source) lines.push(`source: ${u.source}`);
  return lines.join("\n");
}
/** Amber at 80% of any window, red at 95%. */
export function usageTone(u: PackUsage | null | undefined): "ok" | "warn" | "bad" {
  const worst = Math.max(0, ...((u?.limits ?? []).map((l) => Number(l.used_pct) || 0)), Number(u?.context?.used_pct ?? 0));
  return worst >= 95 ? "bad" : worst >= 80 ? "warn" : "ok";
}

// ── THE QUOTA HANDOFF (operator 2026-09-20: "a handler for quota limit, and for approaching it — warn,
// and on the limit export the full artefact of that chat for another engine") ──────────────────────
export type PtyQuota = { text: string; t: number; exited?: boolean } | null | undefined;
export type QuotaState = { level: "ok" | "warn" | "limit"; pct: number; window: string; resetsAt: number | null; why: string };
/** The worst plan window decides: warn from 80 %, limit at 100 % — the CLI's own limit line (from the
 *  PTY) wins over the numbers, which lag a turn. Pure. */
export function quotaState(u: PackUsage | null | undefined, pty?: PtyQuota): QuotaState {
  let worst: { pct: number; window: string; resetsAt: number | null } | null = null;
  for (const l of u?.limits ?? []) { const pct = Number(l.used_pct) || 0; if (!worst || pct > worst.pct) worst = { pct, window: l.label, resetsAt: l.resets_at != null ? Number(l.resets_at) : null }; }
  const w = worst ?? { pct: 0, window: "", resetsAt: null };
  const hit = pty?.text?.trim();
  const level: QuotaState["level"] = hit || w.pct >= 100 ? "limit" : w.pct >= 80 ? "warn" : "ok";
  const winName = w.window === "5h" ? "5-hour window" : w.window === "week" ? "weekly window" : w.window ? `${w.window} window` : "plan window";
  const reset = w.resetsAt ? ` · resets ${new Date(w.resetsAt * 1000).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : "";
  const why = level === "limit" ? (hit ? `the CLI said: ${hit.slice(0, 160)}${reset}` : `the ${winName} is spent (${Math.round(w.pct)}%)${reset}`) : level === "warn" ? `the ${winName} is at ${Math.round(w.pct)}%${reset}` : "";
  return { level, pct: w.pct, window: w.window, resetsAt: w.resetsAt, why };
}
/** The engines a pane can hand off to: installed, and not the one it runs (opencode-direct is the same binary as opencode). */
export function handoffTargets(current: string, engines: { key: string; installed?: boolean }[]): string[] {
  const bin = (k: string) => (k.startsWith("opencode") ? "opencode" : k);
  const seen = new Set<string>();
  return engines.filter((e) => e.installed && bin(e.key) !== bin(current)).map((e) => bin(e.key)).filter((k) => (seen.has(k) ? false : (seen.add(k), true)));
}
/** The first message the new engine gets after the handoff. Pure. */
export function handoffAsk(from: string, file: string): string {
  return `Read ${file} first — it is the handoff from ${from}, which ran out of its usage quota in this box. Then continue the work exactly from where it stopped: do not redo what is done, do not undo it.`;
}
export async function fetchPtyQuota(paneId: number): Promise<PtyQuota> {
  try { const s: any = await apiGet(`/api/v1/cockpit/pty/status?pane_id=${paneId}`); const st = s?.result ?? s; return st?.quota ?? null; } catch { return null; }
}
export async function writeHandoff(paneId: number, to: string, reason: string): Promise<{ ok: boolean; file?: string; latest?: string; turns?: number; error?: string } | null> {
  try { return unwrap(await apiPost(`/api/v1/cockpit/pane/context/tool`, { pane_id: paneId, tool: "antiloki_handoff", args: { to, reason } }, { timeoutMs: 30_000 })); } catch { return null; }
}

/** A blocked path → the two scope additions the banner offers. */
export function expandOptions(path: string): { file: string; folder: string | null } {
  const dir = path.includes("/") ? path.split("/").slice(0, -1).join("/") : null;
  return { file: path, folder: dir ? `${dir}/**` : null };
}

// ── PLANS AS ARTEFACTS + COPIABLE ANSWERS (2026-09-16) ──────────────────────────────────────────
export type PackPlan = { file: string; title: string; chars: number; t?: string | null; status: "pending" | "accepted" | "rejected" | string; reason?: string | null; decided_at?: string | null; body_md?: string };
export type PackAnswer = { t?: string | null; text: string; id?: string; session_id?: string | null };

export async function fetchPlans(paneId: number, file?: string): Promise<PackPlan[]> {
  try {
    const r = unwrap(await apiPost(`/api/v1/cockpit/pane/context/tool`, { pane_id: paneId, tool: "antiloki_plans", args: file ? { file } : {} }, { timeoutMs: 15_000 }));
    return Array.isArray(r?.plans) ? (r.plans as PackPlan[]) : [];
  } catch { return []; }
}
export async function decidePlan(paneId: number, file: string, decision: "accepted" | "rejected", reason?: string): Promise<boolean> {
  try {
    const r = unwrap(await apiPost(`/api/v1/cockpit/pane/context/tool`, { pane_id: paneId, tool: "antiloki_plan_decide", args: { file, decision, reason: reason ?? null } }, { timeoutMs: 15_000 }));
    return r?.ok === true;
  } catch { return false; }
}
// AUDIT (operator 2026-09-16: "each file that an agent reads or writes — how to ensure auditability?")
export type AuditEvent = { t?: string; tool?: string; path?: string; kind?: string; op: string; sha?: string | null; bytes?: number | null; exit?: number | null; outside?: string[]; nudged?: string | null };
export type AuditFile = { path: string; reads: number; writes: number; blocked: number; first: string; last: string; sha?: string | null; bytes?: number | null };
export type PackAudit = {
  log: { sha256: string; lines: number; first: string; last: string; file: string };
  counts: { reads: number; writes: number; blocked: number; exec: number; search: number; tool: number };
  files: AuditFile[];
  git: { base: string; changed: string[] };
  cross: { matched: string[]; git_only: string[]; hook_only: string[] };
  events: AuditEvent[]; event_total: number;
};
export async function fetchAudit(paneId: number, args: { op?: string; path?: string; limit?: number } = {}): Promise<PackAudit | null> {
  try {
    const r = unwrap(await apiPost(`/api/v1/cockpit/pane/context/tool`, { pane_id: paneId, tool: "antiloki_audit", args }, { timeoutMs: 20_000 }));
    return r?.audit && typeof r.audit === "object" ? (r.audit as PackAudit) : null;
  } catch { return null; }
}
/** One line the operator can read: what the box's audit says about writes vs git — pure, testable. */
export function auditVerdict(a: PackAudit | null | undefined): { tone: "ok" | "warn" | "dim"; text: string } {
  if (!a) return { tone: "dim", text: "no audit yet" };
  const c = a.counts;
  const g = a.cross.git_only.length;
  if (g) return { tone: "warn", text: `${g} file${g === 1 ? "" : "s"} changed in the box that no tool write explains — ${a.cross.git_only.slice(0, 3).join(", ")}${g > 3 ? "…" : ""}` };
  if (c.blocked) return { tone: "warn", text: `${c.writes} write${c.writes === 1 ? "" : "s"} accounted for · ${c.blocked} refused outside the scope` };
  return { tone: "ok", text: c.writes ? `every changed file traces to a tool write (${c.writes})` : `no writes yet · ${c.reads} reads` };
}

export async function fetchAnswers(paneId: number, limit = 30): Promise<PackAnswer[]> {
  try {
    const r = unwrap(await apiPost(`/api/v1/cockpit/pane/context/tool`, { pane_id: paneId, tool: "antiloki_answers", args: { limit } }, { timeoutMs: 15_000 }));
    return Array.isArray(r?.answers) ? (r.answers as PackAnswer[]) : [];
  } catch { return []; }
}
/** `📋 plan pending` / `📋 2 plans · 1 pending` — null when the agent never produced one. */
export function plansChipLabel(plans: PackPlan[] | null | undefined): string | null {
  if (!plans || !plans.length) return null;
  const pending = plans.filter((p) => p.status === "pending").length;
  if (plans.length === 1) return pending ? "📋 plan · pending" : `📋 plan · ${plans[0].status}`;
  return `📋 ${plans.length} plans${pending ? ` · ${pending} pending` : ""}`;
}
/** The message the agent gets when the operator decides. */
export function planDecisionMessage(decision: "accepted" | "rejected", title: string, reason?: string): string {
  return decision === "accepted"
    ? `[antiloki] Plan accepted by the operator: "${title}". Proceed exactly as written; report when each step is done.`
    : `[antiloki] Plan rejected by the operator: "${title}".${reason ? ` Reason: ${reason}.` : ""} Revise the plan and present it again before touching any file.`;
}
