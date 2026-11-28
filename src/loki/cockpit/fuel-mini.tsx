// MINI FUEL (operator 2026-09-16: "a mini version, discreet, overflow on top right, semi-transparent,
// just showing token usage · cost · session and weekly limit of claude, codex and opencode — 3 lines").
// One line per engine, always three lines, aggregated over every code-agent pane in the open cockpit
// sessions (a pane's meter comes from the pack's antiloki_usage tool — status line / rollout / db).
// Ghost at rest, solid on hover; click opens the full Fuel pane.
import React from "react";
import { fitRef } from "./fit-popover";
import { C, mono } from "@/loki/theme";
import { apiPost } from "@/loki/api/client";
import { type PackUsage } from "@/loki/widgets/context-pack";
import { apiGet } from "@/loki/api/client";
import { CLI_KINDS } from "@/loki/widgets/agent-close";
import type { Pane } from "@/loki/api/types";

// the fuel graphs (a large panel) are fetched when the fuel window opens; the small helpers of this file (limits icon, saved chip) are on every screen
const FuelPane = React.lazy(() => import("./cockpit-panes-tools").then((m) => ({ default: m.FuelPane })));

const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;

export const ENGINES: { key: string; kinds: string[]; glyph: string; label: string }[] = [
  { key: "claude", kinds: ["claude-code"], glyph: "✦", label: "claude" },
  { key: "codex", kinds: ["codex"], glyph: "◇", label: "codex" },
  { key: "opencode", kinds: ["opencode", "opencode-direct"], glyph: "○", label: "opencode" },
  // THE OTHER SEATS (operator 2026-09-30: "where is cursor, gemini, grok limits etc?"): they make calls and run out of quota like the first three
  { key: "gemini", kinds: ["gemini"], glyph: "✧", label: "gemini" },
  { key: "cursor", kinds: ["cursor"], glyph: "▤", label: "cursor" },
  { key: "grok", kinds: ["grok"], glyph: "✕", label: "grok" },
];

export type EngineLine = { key: string; glyph: string; label: string; panes: number; tokens: number | null; cost: number | null; fiveH: number | null; week: number | null; /** the long window's name: `week`, or `month` for a 30-day window */ longName?: "week" | "month"; weekTokens: number | null; tone: "dim" | "ok" | "warn" | "bad"; /** set when the seat said it is out of quota: the sentence to show instead of the numbers */ limited?: string;
  /** the seat said "limit" (out of quota) - kept apart from `fiveH` on purpose (audit 2026-10-01): it used to be written into `fiveH` as 100, so the Limits window printed "session 100%" for a seat whose CLI never reported a window */
  out?: boolean;
  /** WHAT ANTILOKI SENT A SEAT THAT PUBLISHES NO QUOTA (Cursor, Gemini, Grok; 2026-10-01): its own record of calls and tokens in the last 5h and 7d. A count, never a share of an allowance. */
  own?: OwnUse;
  /** the week as antiloki ESTIMATES it against the allowance the operator declared for a seat that publishes no window: `used` dollars of `of` (2026-10-09) */
  weekEstimate?: { used: number; of: number };
  /** Cursor's OWN meters, read from its CLI's `/usage` (cursor_usage.rs, 2026-10-10): the share of the plan's included usage, of the Auto pool and of the API pool, and when the plan resets (unix s). `week` carries the fullest of them. */
  measured?: { included: number | null; auto: number | null; api: number | null; resets: number | null } };
export type OwnUse = { calls5h: number; tokens5h: number; calls7d: number; tokens7d: number };

/** `5h: 3 calls / 4.1k tok · 7d: 12 calls / 20k tok (no quota data from this CLI)` - what antiloki sent, said as exactly that. Pure - tested. */
export function ownText(o: OwnUse): string {
  const part = (label: string, calls: number, tokens: number) => `${label}: ${Math.round(calls)} ${Math.round(calls) === 1 ? "call" : "calls"} / ${fmtK(tokens)} tok`;
  // says what to DO about it (operator 2026-10-09: "still nothing on tokens and limits about the cursor"): the CLI publishes no figure, but a weekly allowance set in Settings > Seats turns these counts into "wk ~N%"
  return `${part("5h", o.calls5h, o.tokens5h)} · ${part("7d", o.calls7d, o.tokens7d)} (no quota data from this CLI - set a weekly allowance in Settings › Seats)`;
}

const fmtK = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `${Math.round(n)}`);

/** Aggregate the per-pane meters into one line per engine — pure, so it is testable. */
export function engineLines(usages: { kind: string; usage: PackUsage | null }[]): EngineLine[] {
  return ENGINES.map((e) => {
    const mine = usages.filter((u) => e.kinds.includes(u.kind));
    // ONE METER PER SOURCE (2026-09-24). Claude writes a file per pane, so six claude agents are six meters and
    // they add up. Codex and OpenCode do not: both read one global store, so every pane of that engine hands back
    // the SAME numbers — adding them multiplied one session's spend by the pane count, and the header's figure
    // jumped when a pane opened rather than when anybody worked. Distinct `source`, then sum.
    const seen = new Set<string>();
    const live = mine.map((u) => u.usage).filter((u): u is PackUsage => !!u && u.source !== "none")
      .filter((u) => seen.size !== seen.add(String(u.source ?? "")).size);
    const sum = (f: (u: PackUsage) => number | null | undefined) => { const xs = live.map(f).filter((x): x is number => typeof x === "number" && Number.isFinite(x)); return xs.length ? xs.reduce((a, b) => a + b, 0) : null; };
    const maxLimit = (label: string) => { const xs = live.flatMap((u) => (u.limits ?? []).filter((l) => l.label === label).map((l) => Number(l.used_pct))).filter(Number.isFinite); return xs.length ? Math.max(...xs) : null; };
    const tokens = sum((u) => u.session?.tokens_total ?? null);
    const cost = e.key === "codex" ? null : sum((u) => (u.cost_usd ?? u.proxy?.cost_usd) ?? null);
    const fiveH = maxLimit("5h");
    const week = maxLimit("week");
    const weekTokens = week == null ? sum((u) => u.weekly_local?.tokens ?? null) : null;
    const worst = Math.max(fiveH ?? 0, week ?? 0);
    const tone: EngineLine["tone"] = !live.length ? "dim" : worst >= 95 ? "bad" : worst >= 80 ? "warn" : "ok";
    return { key: e.key, glyph: e.glyph, label: e.label, panes: mine.length, tokens, cost, fiveH, week, weekTokens, tone };
  });
}

/** WHAT THE ROUTER SAVED, and how the window compares with the one before it (operator 2026-09-24: "fuel should
 *  show complete info about saved tokens and money by using antiloki heimdall" · "on fuel add comparations and
 *  analyzis"). Two sentences under the three lines — the money Heimdall did not spend, and what moved. */
export function FuelBrief({ f }: { f: Fuel | null }) {
  if (!f) return null;
  const up = f.compare.filter((c) => c.trend !== "flat" && (c.cost > 0 || c.was > 0));
  return (
    <div data-testid="fuel-brief" style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 5, paddingTop: 5, borderTop: `1px solid ${C.border}` }}>
      {f.saved.saved > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ color: C.ok, fontWeight: 700 }}>⑂ ${f.saved.saved.toFixed(2)} kept</span>
          <span style={{ color: C.dim }}>{f.saved.pct.toFixed(0)}% · {f.saved.runs} run{f.saved.runs === 1 ? "" : "s"} · ${f.saved.actual.toFixed(2)} of ${f.saved.baseline.toFixed(2)}</span>
        </div>
      )}
      <span style={{ color: C.muted, whiteSpace: "normal", lineHeight: 1.5 }}>{f.analysis}</span>
      {!!up.length && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", color: C.dim }}>
          {up.map((c) => (
            <span key={c.house} data-testid={`fuel-trend-${c.house}`} style={{ whiteSpace: "nowrap", color: c.trend === "up" ? C.warn : C.ok }}>
              {c.trend === "up" ? "▲" : "▼"} {c.house} ${c.cost.toFixed(2)} <span style={{ color: C.dim }}>was ${c.was.toFixed(2)}</span>
            </span>
          ))}
        </div>
      )}
      <span style={{ color: C.dim, fontSize: 8.5 }}>API-equivalent prices — a subscription pays $0 metered.</span>
    </div>
  );
}

/** `12.3k tok · $0.20 · 5h 5% · wk 33%` — dashes where the engine has not reported. */
export function lineText(l: EngineLine): string {
  if (l.limited) return l.limited;
  // THE WINDOWS ARE THE ACCOUNT'S, NOT THIS WORKSPACE'S (operator 2026-09-30: the limits showed only Codex): a subscription with 83% of its week gone says so even when this project has made no call
  if (!l.panes) {
    const w: string[] = [];
    if (l.fiveH != null) w.push(`5h ${Math.round(l.fiveH)}%`);
    if (l.week != null) w.push(`wk ${Math.round(l.week)}%`); else if (l.weekTokens != null) w.push(`wk ${fmtK(l.weekTokens)}`);
    return w.length ? ["no calls here", ...w].join(" · ") : "not running";
  }
  // A SEAT THAT PUBLISHES NO WINDOW says what was sent to it instead of nothing (2026-10-01) - and says it is a count, so no percentage appears that nobody reported
  const counted = l.own && l.fiveH == null && (l.week == null || !!l.weekEstimate) && !l.measured;
  const bits = counted ? [] : [l.tokens != null ? `${fmtK(l.tokens)} tok` : "— tok"];
  if (l.key !== "codex") bits.push(l.cost != null ? `$${l.cost.toFixed(2)}` : "$ —");
  if (counted) bits.push(ownText(l.own!));
  // the three subscriptions that report windows always print them (a dash says "not reported"); the others print them only when they did
  const windows = ["claude", "codex", "opencode"].includes(l.key);
  if (windows || l.fiveH != null) bits.push(l.fiveH != null ? `5h ${Math.round(l.fiveH)}%` : "5h —");
  // an ESTIMATED week says so (~ and "est."): it is antiloki's own arithmetic against the allowance the operator declared, never the seat's figure
  if (l.measured) {
    const m = l.measured, pc = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
    bits.push(`plan ${pc(m.included)} used (auto ${pc(m.auto)} · api ${pc(m.api)})${m.resets ? ` · resets ${new Date(m.resets * 1000).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}`);
  } else if (windows || l.week != null || l.weekTokens != null) bits.push(l.week != null ? (l.weekEstimate ? `wk ~${Math.round(l.week)}% est. ($${l.weekEstimate.used.toFixed(0)} of $${l.weekEstimate.of.toFixed(0)})` : `wk ${Math.round(l.week)}%`) : l.weekTokens != null ? `wk ${fmtK(l.weekTokens)}` : "wk —");
  return bits.join(" · ");
}

// THE DONUT (operator 2026-09-18: "on mouse leave, a visual: a discreet pie for the session and week
// limits, different colours per provider, one single graph"). Two rings — outer = weekly limit,
// inner = the 5-hour window — each cut into one sector per provider; the sector fills with that
// provider's used %. A provider that is not running keeps a faint empty sector, so the shape never
// changes and the eye learns where each one lives.
export const ENGINE_COLORS: Record<string, string> = { claude: "#c97c5c", codex: "#7fb7e6", opencode: "#8fd0c0", gemini: "#b79cf0", cursor: "#e3c16f", grok: "#d98fa8" };
const polar = (cx: number, cy: number, r: number, deg: number) => { const a = ((deg - 90) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const; };
/** An SVG arc path from a0° to a1° (clockwise, 0° at 12 o'clock). Pure — tested. */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const span = Math.max(0, Math.min(359.999, a1 - a0));
  if (span <= 0) return "";
  const [x0, y0] = polar(cx, cy, r, a0); const [x1, y1] = polar(cx, cy, r, a0 + span);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
/** The sectors of one ring: for each engine, the track arc and the used arc (used % of its sector). Pure — tested. */
export function ringSectors(lines: EngineLine[], pick: (l: EngineLine) => number | null, gapDeg = 6): { key: string; a0: number; a1: number; usedTo: number; pct: number | null; live: boolean; out: boolean }[] {
  const n = lines.length || 1; const sector = 360 / n;
  return lines.map((l, i) => { const a0 = i * sector + gapDeg / 2; const a1 = (i + 1) * sector - gapDeg / 2; const pct = pick(l); const used = pct == null ? 0 : Math.max(0, Math.min(100, pct)) / 100; return { key: l.key, a0, a1, usedTo: a0 + (a1 - a0) * used, pct, live: l.panes > 0, out: !!l.out }; });
}
export function FuelDonut({ lines, size = 46 }: { lines: EngineLine[]; size?: number }) {
  // proportional geometry so the same donut reads at 46 (the ghost) and at 16 (the switch icon)
  const c = size / 2; const w = size / 9.2; const outerR = c - w * 0.8; const innerR = outerR - w * 1.4;
  const rings: { r: number; pick: (l: EngineLine) => number | null; title: string }[] = [{ r: outerR, pick: (l) => l.week, title: "weekly" }, { r: innerR, pick: (l) => l.fiveH, title: "5-hour" }];
  return (
    <svg data-testid="fuel-donut" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      {rings.map((ring) => ringSectors(lines, ring.pick).map((s) => (
        <g key={`${ring.title}-${s.key}`}>
          {/* A SEAT OUT OF QUOTA, WITH NO WINDOW REPORTED, is said as that: its track in red - never a made-up share of an allowance (audit 2026-10-01) */}
          <path d={arcPath(c, c, ring.r, s.a0, s.a1)} stroke={s.out && s.pct == null ? "#d9705a" : ENGINE_COLORS[s.key] ?? "#888"} strokeOpacity={s.out && s.pct == null ? 0.7 : s.live ? 0.22 : 0.1} strokeWidth={w} fill="none" strokeLinecap="butt">{s.out && s.pct == null && <title>{`${s.key} · out of quota`}</title>}</path>
          {s.usedTo > s.a0 && <path d={arcPath(c, c, ring.r, s.a0, s.usedTo)} stroke={s.pct != null && s.pct >= 95 ? "#d9705a" : ENGINE_COLORS[s.key] ?? "#888"} strokeWidth={w} fill="none" strokeLinecap="butt"><title>{`${s.key} · ${ring.title} ${Math.round(s.pct ?? 0)}%`}</title></path>}
        </g>
      )))}
    </svg>
  );
}

/** FUEL FROM THE RECORD (operator 2026-09-24: "fuel still not working, also fuel should show complete info about
 *  saved tokens and money by using antiloki heimdall"). It used to ask every pane for its meter — a file the CLI
 *  writes only after an agent has spoken, so an idle claude agent reported `— tok · $ —` and the whole gauge read
 *  empty. `brain.ai_calls` has every call the workspace ever made and cannot read empty because nobody is typing.
 *  One request instead of a session-get per session plus a tool call per pane. */
export type Fuel = {
  days: number;
  houses: { house: string; calls: number; cost: number; tokens_in: number; tokens_out: number; tokens: number; failed: number; models: number }[];
  models: { model: string; house: string; tier: string; calls: number; cost: number; tokens: number; tokens_in?: number; tokens_out?: number; failed: number; ms: number; /** the same tokens at OpenRouter's list price (per 1M in / out, and the cost); null when the model is not on the list */ or_in?: number | null; or_out?: number | null; or_cost?: number | null }[];
  /** every model's tokens priced at OpenRouter (the team runs excluded) */ or_cost?: number; /** the same for the period before this window (0 when there is none) */ or_prev?: number; /** one point per day of the window: cost at OpenRouter's prices plus what team runs spent */ daily?: { day: string; cost: number }[];
  /** `label: "own"` rows (Cursor, Gemini, Grok) carry the calls/tokens antiloki itself sent and NO `used_pct`: those CLIs publish no quota window. */
  limits: { house: string; label: string; used_pct?: number; tokens?: number; resets_at?: number | null; note?: string; calls_5h?: number; tokens_5h?: number; calls_7d?: number; tokens_7d?: number; /** antiloki's own estimate against an allowance the operator declared (a seat with no published window) */ estimated?: boolean; used_usd?: number; of_usd?: number; /** the seat's own meter, read by the serve (not an estimate) */ measured?: boolean }[];
  saved: { runs: number; routed: number; actual: number; baseline: number; saved: number; pct: number; tokens: number; line: string;
    /** THE PROOF (2026-09-24): the rows the total is made of — one per settled run */
    proof: { id: number; goal: string; actual: number; baseline: number; saved: number; pct: number; tokens: number; against: string; tiers: string[]; router: boolean }[] };
  compare: { house: string; cost: number; was: number; delta_pct: number; trend: "up" | "down" | "flat" }[];
  analysis: string;
};
/** THE LAST GOOD ANSWER, PER WINDOW (operator 2026-09-25: "everytime fuel preview or window close, it looses
 *  its state and have to recall it. Dont loose state, recall updates, but never gets empty").
 *
 *  Every fuel surface held its reading in component state, so closing the window threw it away and reopening
 *  started at `undefined` — the reading-the-record placeholder, every single time, for a number that had been
 *  on screen a second earlier. The record only moves when an agent makes a call; showing the last one while
 *  the next is fetched is not staleness, it is the same number arriving without a blank frame in front of it.
 *  Module scope, so it survives unmount and every component shares one answer. */
const LAST = new Map<number, Fuel>();
export function lastFuel(days = 7): Fuel | null { return LAST.get(days) ?? null; }

/** …BUT NOT ACROSS A WORKSPACE (audit 2026-09-28). The note above is true within one project and false between two:
 *  the serve re-mounts another project's whole DB set on activation, so after a switch this map holds the PREVIOUS
 *  workspace's fuel and every surface drew it instantly, with confidence, as this workspace's number. `usePoll` has
 *  dropped its data for exactly this reason since 2026-09-25 — "while we do not know, showing nothing is honest and
 *  showing the other project is not" — and a module-scope cache has to obey the same rule or it quietly undoes it.
 *
 *  Exported so a test can call it without a window, and so the rule is a function with a name rather than a listener
 *  nobody can find. */
export function forgetFuel() { GEN++; LAST.clear(); }
/** WHICH WORKSPACE A REPLY BELONGS TO (audit 2026-10-01). Bumped by `forgetFuel`; a fetch remembers the number it started under and writes the cache only if it is still current - otherwise a reply that
 *  was in flight for the OLD workspace landed in `LAST` after the switch cleared it, and the next surface to mount drew the previous project's money. */
let GEN = 0;

/** `refresh`: the person opened the usage window, so the serve scans again; otherwise it answers from a scan at most an hour old. */
export async function fetchFuel(days = 7, refresh = false): Promise<Fuel | null> {
  const gen = GEN;
  const tz = -new Date().getTimezoneOffset();
  try {
    const r: any = unwrap(await apiGet(`/api/v1/cockpit/fuel?tz=${tz}&days=${days}${refresh ? "&refresh=1" : ""}`, { timeoutMs: 20_000 } as any));
    if (!r?.houses) return null;
    if (gen === GEN) LAST.set(days, r as Fuel);           // a reply for the workspace we have left is not remembered
    return r as Fuel;
  }
  catch { return null; }
}
/** The three lines, from the record. An engine with no calls in the window says so instead of printing zeroes
 *  that look like a broken gauge. Pure — tested. */
export function linesFromFuel(f: Fuel | null): EngineLine[] {
  return ENGINES.map((e) => {
    const h = f?.houses.find((x) => x.house === e.key);
    const lim = (label: string) => f?.limits.find((l) => l.house === e.key && l.label === label)?.used_pct ?? null;
    const calls = h?.calls ?? 0;
    // the seat's OWN meters, when the serve read them (Cursor's `/usage`): the plan is monthly, so the fullest meter stands in for the long window
    const ms = f?.limits.filter((l) => l.house === e.key && l.measured && Number.isFinite(Number(l.used_pct))) ?? [];
    const meter = (label: string) => { const m = ms.find((x) => x.label === label); return m ? Number(m.used_pct) : null; };
    const measured = ms.length ? { included: meter("included"), auto: meter("auto"), api: meter("api"), resets: ms[0].resets_at ? Number(ms[0].resets_at) : null } : undefined;
    const longName: "week" | "month" = !measured && lim("week") == null && lim("month") != null ? "month" : "week";   // a seat whose long window is 30 days (Codex here) says so, it is not drawn as a week
    const week = measured ? Math.max(...ms.map((m) => Number(m.used_pct))) : (lim("week") ?? lim("month"));
    // a seat that answered "you've hit your usage limit" is out until the time it named - shown as such, in red, whatever else it reports
    const out = f?.limits.find((l) => l.house === e.key && l.label === "limit");
    const until = out?.resets_at ? new Date(Number(out.resets_at) * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    const worst = Math.max(lim("5h") ?? 0, week ?? 0, out ? 100 : 0);
    const o = f?.limits.find((l) => l.house === e.key && l.label === "own");
    const own: OwnUse | undefined = o && calls ? { calls5h: o.calls_5h ?? 0, tokens5h: o.tokens_5h ?? 0, calls7d: o.calls_7d ?? 0, tokens7d: o.tokens_7d ?? 0 } : undefined;
    return {
      key: e.key, glyph: e.glyph, label: e.label, panes: calls,
      tokens: calls ? h!.tokens : null, cost: calls ? h!.cost : null,
      fiveH: lim("5h"), week, longName, weekTokens: week == null ? (f?.limits.find((l) => l.house === e.key && l.label === "week")?.tokens ?? null) : null,
      tone: !calls && !out ? "dim" : worst >= 95 ? "bad" : worst >= 80 ? "warn" : "ok",
      limited: out ? `out of quota${until ? ` until ~${until}` : ""} — routed around` : measured && (week ?? 0) >= 95 ? `out of quota (Cursor's own meter: plan ${Math.round(measured.included ?? week ?? 0)}% used · auto ${measured.auto == null ? "—" : Math.round(measured.auto) + "%"} · api ${measured.api == null ? "—" : Math.round(measured.api) + "%"})${measured.resets ? ` until ${new Date(measured.resets * 1000).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""} — routed around` : undefined, out: !!out || !!(measured && (week ?? 0) >= 95) || undefined, own, measured,
      weekEstimate: (() => { const w = f?.limits.find((l) => l.house === e.key && l.label === "week" && l.estimated); return w && w.of_usd ? { used: w.used_usd ?? 0, of: w.of_usd } : undefined; })(),
    };
  });
}

/** THE FUEL, LIVE, FOR EVERY SURFACE THAT DRAWS IT (operator 2026-09-30: "the preview of money saved is holding another workspace's"). The preview, the limits icon and the limits window each kept their own copy in
 *  state; the workspace-switch handler cleared the module cache but never those copies, so the old project's money stayed on screen until the next poll - up to 20 s of another workspace's number drawn as this one's.
 *  One hook: on a switch the reading is dropped at once, the cache is forgotten, and a reply that was already in flight for the OLD workspace is ignored. */
export function useFuelLive(): Fuel | null {
  const [fuel, setFuel] = React.useState<Fuel | null>(() => lastFuel(7));
  React.useEffect(() => {
    let stop = false; let epoch = 0;
    const tick = async () => { const mine = epoch; const f = await fetchFuel(7); if (!stop && mine === epoch && f) setFuel(f); };
    const changed = () => { epoch++; forgetFuel(); setFuel(null); void tick(); };
    void tick();
    const t = setInterval(tick, 60_000);   // cheap: the serve answers from its last scan
    window.addEventListener("antiloki:workspace-changed", changed);
    return () => { stop = true; clearInterval(t); window.removeEventListener("antiloki:workspace-changed", changed); };
  }, []);
  return fuel;
}

// THE POPOVER under the view switch (operator 2026-09-18: "the collapsed mini icons on top center,
// between Threads and Blocks"): the same lines the ghost shows on hover, dropped below the pill.
export const popoverStyle: React.CSSProperties = { position: "absolute", top: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)", width: 200, maxWidth: "calc(100vw - 24px)", padding: "8px 12px", borderRadius: 9, zIndex: 130,
  background: `color-mix(in oklab, ${C.panel} 96%, transparent)`, border: `1px solid ${C.border}`, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", boxShadow: "0 10px 28px rgba(0,0,0,.35)", display: "flex", flexDirection: "column", gap: 2, fontFamily: mono, fontSize: 9.5, color: C.dim, textAlign: "left", cursor: "default" };

export function FuelMini({ onOpenFull, top, right = 14, variant = "ghost", label }: { onOpenFull?: () => void; top?: number; right?: number; variant?: "ghost" | "icon" | "money"; label?: React.ReactNode }) {
  const fuel = useFuelLive();
  const lines = React.useMemo(() => linesFromFuel(fuel), [fuel]);
  const toneColor = (t: EngineLine["tone"]) => (t === "bad" ? C.bad : t === "warn" ? C.warn : t === "ok" ? C.ok : C.dim);
  // A PREVIEW on the screen (operator 2026-09-17: "not a box, a preview, ⋯ opens the window"). At rest
  // (2026-09-18) it is the donut alone; hovering swaps in the three lines; leaving swaps back.
  const [hot, setHot] = React.useState(false);
  // A NARROW, TALL PREVIEW (operator 2026-10-11: "the fuel preview has a too big width, should be smaller width, use height"): each engine is two lines - its name with its state dot, then what it says
  // under it, wrapping - instead of one long nowrap line. 200 px wide, as tall as it needs.
  const lineRows = lines.map((l) => (
    <div key={l.key} data-testid={`fuel-mini-${l.key}`} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", columnGap: 6, rowGap: 1, alignItems: "center" }}>
      <span style={{ width: 7, height: 7, borderRadius: 7, background: ENGINE_COLORS[l.key], flexShrink: 0, opacity: l.panes ? 1 : 0.4 }} />
      <span style={{ color: l.panes ? C.fg : C.dim }}>{l.label}</span>
      <span style={{ width: 9, height: 9, borderRadius: 9, background: toneColor(l.tone), border: `1.5px solid ${C.bg}`, flexShrink: 0, opacity: l.panes ? 1 : 0.5 }} />
      <span />
      <span style={{ gridColumn: "2 / 4", color: l.panes ? C.muted : C.dim, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.4 }}>{lineText(l)}</span>
    </div>
  ));
  // THE MONEY IS THE BUTTON (operator 2026-09-26: "the saved value, take out the border, and that will be the
  // button to open fuel, so the mini preview is on hover the saved money, drop the fuel icon" · "also take out the
  // word saved").
  //
  // A variant rather than a second component: the hover preview, the engine lines, the brief and the click-through
  // are the fuel's own and would be a second implementation to drift from. The saving simply takes the donut's
  // place as the thing you point at — the benefit on the surface, the limits one hover and one click behind it.
  if (variant === "money") return (
    <div data-testid="fuel-mini" data-variant="money" onClick={onOpenFull} title="the last 7 days at OpenRouter prices (plus team runs) — hover for the windows, click for the usage window"
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{ position: "relative", display: "flex", alignItems: "center", cursor: onOpenFull ? "pointer" : "default",
               fontFamily: mono, fontSize: 11, fontWeight: 700, color: C.ok, letterSpacing: .3, whiteSpace: "nowrap",
               padding: "1px 4px", opacity: hot ? 1 : 0.92, transition: "opacity .18s ease" }}>
      {label}
      {hot && <div data-testid="fuel-popover" ref={fitRef} style={popoverStyle}>{lineRows}<FuelBrief f={fuel} /><div style={{ display: "flex", alignItems: "center", gap: 6, color: C.dim, marginTop: 2 }}><span>fuel · last {fuel?.days ?? 7}d</span><span data-testid="fuel-more" style={{ letterSpacing: 2, fontSize: 12, lineHeight: 1 }}>···</span><span style={{ marginLeft: "auto", color: C.dim }}>click → the Fuel window</span></div></div>}
    </div>
  );
  if (variant === "icon") return (
    <div data-testid="fuel-mini" data-variant="icon" onClick={onOpenFull} title="fuel — hover for the numbers, click for the full Fuel window"
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 22, borderRadius: 6, cursor: onOpenFull ? "pointer" : "default", background: hot ? `color-mix(in oklab, ${C.brand} 10%, transparent)` : "transparent", opacity: hot ? 1 : 0.75, transition: "opacity .18s ease, background .15s ease" }}>
      <FuelDonut lines={lines} size={16} />
      {hot && <div data-testid="fuel-popover" ref={fitRef} style={popoverStyle}>{lineRows}<FuelBrief f={fuel} /><div style={{ display: "flex", alignItems: "center", gap: 6, color: C.dim, marginTop: 2 }}><span>fuel · last {fuel?.days ?? 7}d</span><span data-testid="fuel-more" style={{ letterSpacing: 2, fontSize: 12, lineHeight: 1 }}>···</span><span style={{ marginLeft: "auto", color: C.dim }}>click → the Fuel window</span></div></div>}
    </div>
  );
  return (
    <div data-testid="fuel-mini" onClick={onOpenFull} title="fuel — hover for the numbers, click for the full Fuel window"
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{ ...(top != null ? { position: "fixed", top, right, zIndex: 120 } : { position: "relative" }), pointerEvents: "auto", cursor: onOpenFull ? "pointer" : "default", opacity: hot ? 1 : 0.62, transition: "opacity .18s ease",
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, fontFamily: mono, fontSize: 9.5, lineHeight: 1.5, color: C.dim, userSelect: "none" }}>
      {hot ? <>{lineRows}<FuelBrief f={fuel} /></> : <FuelDonut lines={lines} />}
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.dim }}><span>fuel</span><span data-testid="fuel-more" style={{ letterSpacing: 2, fontSize: 12, lineHeight: 1 }}>···</span></div>
    </div>
  );
}

// THE FULL FUEL as an overlay window (operator 2026-09-16: "clicking the floating mini fuel opens a
// window with the full fuel widget" — Fuel left the widget list). The chat's cockpit session is the
// one audited (antichat#<id>); its panes are polled so the per-agent rows stay live.
/** THE GRAPHS (operator 2026-09-24: "should have also Stats with some differen graphs and analyzis" · "on fuel
 *  add comparations and analyzis"). Shown by BOTH the Fuel window and the timeline's stats view, because two
 *  renderings of one question is how they end up disagreeing about what a day cost.
 *
 *  Not another reading of the event feed — the workspace's own `brain.ai_calls`, every call it ever made with its
 *  model, tier, tokens, cost, duration and outcome. Three things worth a graph: where the money went, where the
 *  TIME went (which is a different ranking and the one nobody looks at), and what failed. Plus what Heimdall kept,
 *  and a sentence naming whatever dominates.
 */
export function FuelStats({ compact = false }: { compact?: boolean }) {
  const [days, setDays] = React.useState(7);
  // opens on the last reading rather than on a placeholder; `undefined` now means "never read in this session"
  const [f, setF] = React.useState<Fuel | null | undefined>(() => lastFuel(7) ?? undefined);
  const [proof, setProof] = React.useState(false);
  const [rev, setRev] = React.useState(0);       // bumped by a workspace switch: the old project's reading is dropped and read again
  React.useEffect(() => {
    const h = () => { forgetFuel(); setF(undefined); setRev((n) => n + 1); };
    window.addEventListener("antiloki:workspace-changed", h);
    return () => window.removeEventListener("antiloki:workspace-changed", h);
  }, []);
  React.useEffect(() => {
    let live = true;
    const known = lastFuel(days);
    if (known) setF(known);          // a window we have read before draws immediately…
    void fetchFuel(days).then((x) => { if (live && x) setF(x); });   // …and is replaced only by a real answer
    return () => { live = false; };
  }, [days, rev]);
  if (f === undefined) return <span style={{ color: C.dim }}>reading the workspace's own record…</span>;
  if (!f || !f.models.length) return <span style={{ color: C.dim }}>this workspace has not made a call in the last {days} days.</span>;

  const usd = (n: number) => (n >= 0.01 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toFixed(4)}` : "$0");
  const tok = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
  const mins = (ms: number) => (ms >= 60_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 1000)} s`);
  const bar = (label: string, value: string, frac: number, tint: string, key: string) => (
    <div key={key} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 210px) 1fr 74px", gap: 8, alignItems: "center", height: 18 }}>
      <span title={label} style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ position: "relative", height: 7, background: `color-mix(in oklab, ${C.border} 60%, transparent)`, borderRadius: 4 }}>
        <span style={{ position: "absolute", inset: 0, width: `${Math.max(1.5, frac * 100)}%`, background: tint, borderRadius: 4 }} />
      </span>
      <span style={{ color: C.fg, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
  const section = (title: string, note: string, rows: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
      <span style={{ fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.muted }}>{title}</span>
      <span style={{ fontSize: 9, color: C.dim, marginBottom: 2 }}>{note}</span>
      {rows}
    </div>
  );
  const byCost = [...f.models].sort((a, b) => b.cost - a.cost).slice(0, 8);
  const byTime = [...f.models].sort((a, b) => b.ms - a.ms).slice(0, 8);
  const failed = f.models.filter((m) => m.failed > 0).sort((a, b) => b.failed - a.failed).slice(0, 6);
  const maxC = Math.max(...byCost.map((m) => m.cost), 1e-9);
  const maxT = Math.max(...byTime.map((m) => m.ms), 1);
  const maxF = Math.max(...failed.map((m) => m.failed), 1);

  return (
    <div data-testid="fuel-stats" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        {[1, 7, 30, 0].map((d) => (
          <button key={d} data-testid={`stats-days-${d}`} onClick={() => setDays(d)}
            style={{ background: days === d ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${days === d ? C.brand : C.border}`, color: days === d ? C.brand : C.muted, borderRadius: 6, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>
            {d === 0 ? "all time" : d === 1 ? "24h" : `${d}d`}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ color: C.dim, fontSize: 9 }}>{f.models.reduce((s, m) => s + m.calls, 0)} calls</span>
      </div>

      {/* WHAT HEIMDALL SAVED, FIRST AND PROVEN (operator 2026-09-24: "the fuel window most important info is to
          show comparations how its been save in tokens and money by using heimdall router with real proof
          based"). The headline, the two bars it is a ratio of, and then the runs it is made of — a total nobody
          can open is an assertion, not proof. */}
      {f.saved.baseline > 0 && (
        <div data-testid="fuel-saved" style={{ border: `1px solid ${C.ok}`, borderRadius: 9, padding: "10px 12px", marginBottom: 14, background: `color-mix(in oklab, ${C.ok} 6%, transparent)` }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 22, color: C.ok, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{usd(f.saved.saved)}</span>
            <span style={{ fontSize: 11, color: C.fg }}>kept by the router — <b>{f.saved.pct.toFixed(0)}%</b> of the bill</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 9.5, color: C.dim }}>{f.saved.runs} settled run{f.saved.runs === 1 ? "" : "s"} · {tok(f.saved.tokens)} tokens</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 8 }}>
            {bar("what antiloki actually paid", usd(f.saved.actual), f.saved.actual / Math.max(f.saved.baseline, 1e-9), C.ok, "actual")}
            {bar("one frontier agent, same tokens", usd(f.saved.baseline), 1, C.bad, "baseline")}
          </div>
          <div style={{ fontSize: 9, color: C.dim, marginTop: 6, lineHeight: 1.55 }}>
            Both sides priced at published API rates on the same token counts — a subscription pays $0 metered, so
            this is the ratio, not a bill. The baseline is every one of those tokens done by one high-tier model.
          </div>
          {!!f.saved.proof.length && (
            <div style={{ marginTop: 8 }}>
              <button data-testid="fuel-proof" onClick={() => setProof((x) => !x)} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9.5, padding: 0 }}>
                {proof ? "▾" : "▸"} the {f.saved.proof.length} run{f.saved.proof.length === 1 ? "" : "s"} this total is made of
              </button>
              {proof && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 5 }}>
                  {f.saved.proof.map((r) => (
                    <div key={r.id} data-testid={`fuel-proof-${r.id}`} style={{ display: "grid", gridTemplateColumns: "34px 1fr 62px 62px 52px", gap: 8, alignItems: "baseline", fontSize: 9.5 }}>
                      <span style={{ color: C.dim }}>#{r.id}</span>
                      <span title={`${r.goal} · against ${r.against} · tiers ${r.tiers.join(" ")}`} style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.goal}</span>
                      <span style={{ color: C.fg, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{usd(r.actual)}</span>
                      <span style={{ color: C.dim, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{usd(r.baseline)}</span>
                      <span style={{ color: C.ok, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>−{r.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div data-testid="stats-analysis" style={{ fontSize: 10.5, color: C.fg, lineHeight: 1.6, border: `1px solid ${C.border}`, borderLeft: `2px solid ${C.brand}`, borderRadius: 7, padding: "7px 10px", marginBottom: 14 }}>
        {f.analysis}
      </div>

      {section("where the money went", "every call priced at list — a subscription pays $0 metered",
        byCost.map((m) => bar(`${m.model} · ${m.tier}`, usd(m.cost), m.cost / maxC, C.brand, m.model + m.tier)))}

      {section("where the TIME went", "a different ranking from the money, and the one nobody looks at",
        byTime.map((m) => bar(`${m.model} · ${m.calls} call${m.calls === 1 ? "" : "s"}`, mins(m.ms), m.ms / maxT, C.ok, m.model + m.tier)))}

      {!!failed.length && section("calls that did not succeed", "these cost money and produced nothing",
        failed.map((m) => bar(m.model, String(m.failed), m.failed / maxF, C.bad, m.model + m.tier)))}

      {section("per house, against the window before it", "a number with no yesterday beside it cannot be acted on",
        f.compare.filter((c) => c.cost > 0 || c.was > 0).map((c) => (
          <div key={c.house} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 210px) 1fr 74px", gap: 8, alignItems: "center", height: 18 }}>
            <span style={{ color: C.muted }}>{c.house}</span>
            <span style={{ color: c.trend === "up" ? C.warn : c.trend === "down" ? C.ok : C.dim }}>
              {c.trend === "up" ? "▲" : c.trend === "down" ? "▼" : "—"} {c.was > 0 ? `${Math.abs(c.delta_pct).toFixed(0)}% vs ${usd(c.was)}` : "new this window"}
            </span>
            <span style={{ color: C.fg, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{usd(c.cost)}</span>
          </div>
        )))}

      {section("tokens", "in and out, per house",
        f.houses.filter((h) => h.tokens > 0).map((h) => bar(`${h.house} · ${h.models} model${h.models === 1 ? "" : "s"}`, tok(h.tokens), h.tokens / Math.max(...f.houses.map((x) => x.tokens), 1), C.muted, h.house)))}
    </div>
  );
}


export function FuelOverlay({ chatSessionId, onClose }: { chatSessionId: number | null | undefined; onClose: () => void }) {
  const [tab, setTab] = React.useState<"record" | "panes">("record");
  const [session, setSession] = React.useState<{ id: number; name: string } | null | undefined>(undefined);
  const [panes, setPanes] = React.useState<Pane[]>([]);
  React.useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const list = unwrap(await apiPost(`/api/v1/cockpit/session/get`, {}, { timeoutMs: 15_000 }));
        const open = (Array.isArray(list?.sessions) ? list.sessions : []).filter((s: any) => s?.status !== "closed");
        const name = `antichat#${chatSessionId ?? "solo"}`;
        const cs = open.filter((s: any) => s?.name === name).sort((a: any, b: any) => a.id - b.id)[0] ?? open.sort((a: any, b: any) => b.id - a.id)[0] ?? null;
        if (stop) return;
        setSession(cs ? { id: cs.id, name: cs.name } : null);
        if (cs) { const got = unwrap(await apiPost(`/api/v1/cockpit/session/get`, { id: cs.id }, { timeoutMs: 15_000 })); if (!stop && Array.isArray(got?.panes)) setPanes(got.panes); }
      } catch { if (!stop) setSession((s) => s ?? null); }
    };
    void tick();
    const t = setInterval(tick, 10_000);
    return () => { stop = true; clearInterval(t); };
  }, [chatSessionId]);
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const synth = (sid: number): Pane => ({ id: -1, idx: 0, session_id: sid, subagent_name: "fuel", scope: [], grants: [], status: "idle", worktree_path: null, branch: null, tier: "mid", pane_kind: "fuel", settings_json: "{}", synthetic: true } as unknown as Pane);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} data-testid="fuel-overlay" style={{ width: "min(820px, 94vw)", height: "min(86vh, 700px)", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 700 }}>⛽ fuel</span>
          <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{session ? `${session.name} · session #${session.id}` : session === null ? "no cockpit session yet" : "…"}</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>
        </div>
        {/* THE WINDOW LEADS WITH THE RECORD (operator 2026-09-24: "my fuel shows 0 where it should show values,
            and i still dont see stats and graphs there on fuel window"). It used to render FuelPane alone, which
            asks the session audit and each pane's meter — a file the CLI writes only once an agent has spoken, so
            an idle workspace showed zeroes everywhere. brain.ai_calls has every call and cannot read empty. The
            per-pane view is still here, one tab over, because live context and quota windows only exist there. */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 14px", borderBottom: `1px solid ${C.border}` }}>
          {(["record", "panes"] as const).map((k) => (
            <button key={k} data-testid={`fuel-tab-${k}`} onClick={() => setTab(k)}
              title={k === "record" ? "every call this workspace made, from its own database" : "the live panes: context window, quota, per-agent meters"}
              style={{ background: tab === k ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${tab === k ? C.brand : C.border}`, color: tab === k ? C.brand : C.dim, borderRadius: 6, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>
              {k === "record" ? "the record · stats" : "live panes"}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {tab === "record" ? <div style={{ padding: "10px 14px", fontFamily: mono, fontSize: 10 }}><FuelStats /></div>
            : session ? <React.Suspense fallback={<div style={{ padding: 16, opacity: 0.6, fontSize: 13 }}>loading…</div>}><FuelPane p={synth(session.id)} panes={panes} sessionId={session.id} /></React.Suspense>
            : <span style={{ padding: 14, fontFamily: mono, fontSize: 10, color: C.dim }}>{session === null ? "start an agent first — the live panes are the cockpit session behind this chat" : "loading…"}</span>}
        </div>
      </div>
    </div>
  );
}
