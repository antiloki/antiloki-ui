// THE STRIP'S RUN SUMMARY (RFC 0007 §5.9). The bottom strip carries the live numbers; when a run ends it shows the
// run's summary for a few seconds, then goes back. This is the timing and the wording, pure, with the clock injected.

export type Usage = {
  tokensIn?: number; tokensOut?: number; cost?: number; baseline?: number; ms?: number;
  turns?: number; tools?: number; failed?: number; engine?: string; against?: string; goalRun?: boolean;
  /** "engine": the engine's own meter said so; anything else is the tokens priced from the list, so it reads as an estimate */ costSource?: string;
};
export type Settings = { enabled: boolean; minMs: number; holdMs: number };
export const DEFAULT_SETTINGS: Settings = { enabled: true, minMs: 10_000, holdMs: 6_000 };

export function fmtTokens(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 2 : 1).replace(/\.?0+$/, "")}k`;
  return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
}
// the same money and time words the chat uses today (chat-flow.tsx metaLine), so a number reads the same
export const money = (n: number): string => `$${n < 0.01 ? n.toFixed(4) : n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;
export const secs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

/** Only a long run, or a goal run, is worth the strip's attention; a quick turn leaves it alone. */
export function shouldShow(u: Usage, s: Settings = DEFAULT_SETTINGS): boolean {
  if (!s.enabled) return false;
  return !!u.goalRun || (u.ms ?? 0) >= s.minMs;
}

/** The summary as the strip's parts, left to right. A field the CLI did not report is `—` or left out, never guessed. */
export function summaryParts(u: Usage): string[] {
  const parts: string[] = [];
  const when = [u.turns ? `${u.turns} turn${u.turns === 1 ? "" : "s"}` : "", u.ms && u.ms > 0 ? secs(u.ms) : ""].filter(Boolean).join(" · ");
  if (when) parts.push(when);
  parts.push(`sent ${fmtTokens(u.tokensIn)} · received ${fmtTokens(u.tokensOut)}`);
  parts.push(u.cost !== undefined && u.cost > 0 ? `cost ${u.costSource === "engine" ? "" : "≈ "}${money(u.cost)}` : "cost —");
  if (u.cost !== undefined && u.baseline !== undefined && u.baseline > 0 && u.baseline - u.cost >= 0.00005) {
    parts.push(`saved ${Math.round(((u.baseline - u.cost) / u.baseline) * 100)}%${u.against ? ` vs ${u.against}` : ""}`);
  }
  if (u.tools && u.tools > 0) parts.push(`${u.tools} tool${u.tools === 1 ? "" : "s"}${u.failed ? ` (${u.failed} failed)` : ""}`);
  return parts;
}
/** The full sentence for the details tooltip. Empty when there is no baseline to compare with. */
export function savedSentence(u: Usage): string {
  if (u.cost === undefined || u.baseline === undefined || u.baseline <= 0) return "";
  const saved = Math.max(0, u.baseline - u.cost);
  const against = u.against ?? "the yardstick";
  if (saved < 0.00005) return `≈ this run cost ${money(u.cost)} — the same as ${against}, so nothing saved`;
  return `≈ saved ${money(saved)} (${Math.round((saved / u.baseline) * 100)}%) vs ${against} — ${money(u.cost)} instead of ${money(u.baseline)} for the same tokens`;
}

// ── the timing ───────────────────────────────────────────────────────────────────────────────────────────────────
export type Item = { usage: Usage; pane: string; paneName?: string };
export type StripState =
  | { mode: "live"; queue: Item[] }
  | { mode: "summary"; item: Item; queue: Item[]; remaining: number; lastTick: number; paused: boolean };

export const live = (): StripState => ({ mode: "live", queue: [] });
export type StripAction =
  | { type: "finished"; item: Item; now: number; settings?: Settings }
  | { type: "tick"; now: number; settings?: Settings }
  | { type: "hover"; now: number }
  | { type: "leave"; now: number }
  | { type: "dismiss"; now: number; settings?: Settings };

function show(item: Item, queue: Item[], now: number, s: Settings): StripState {
  return { mode: "summary", item, queue, remaining: s.holdMs, lastTick: now, paused: false };
}
function advance(st: Extract<StripState, { mode: "summary" }>, now: number, s: Settings): StripState {
  const [next, ...rest] = st.queue;
  return next ? show(next, rest, now, s) : { mode: "live", queue: [] };
}
export function stripReduce(st: StripState, a: StripAction): StripState {
  const s = ("settings" in a && a.settings) || DEFAULT_SETTINGS;
  switch (a.type) {
    case "finished": {
      if (!shouldShow(a.item.usage, s)) return st;
      if (st.mode === "live") return show(a.item, [], a.now, s);
      return { ...st, queue: [...st.queue, a.item].slice(-5) }; // several panes finishing: one after another, at most five waiting
    }
    case "tick": {
      if (st.mode !== "summary") return st;
      if (st.paused) return { ...st, lastTick: a.now };
      const remaining = st.remaining - Math.max(0, a.now - st.lastTick);
      return remaining <= 0 ? advance(st, a.now, s) : { ...st, remaining, lastTick: a.now };
    }
    case "hover": return st.mode === "summary" ? { ...st, paused: true, lastTick: a.now } : st;
    case "leave": return st.mode === "summary" ? { ...st, paused: false, lastTick: a.now } : st;
    case "dismiss": return st.mode === "summary" ? advance(st, a.now, s) : st;
  }
}
/** How much of the timer line is left, 0..1, for the thin line along the strip's edge. */
export const timerFraction = (st: StripState, s: Settings = DEFAULT_SETTINGS): number => (st.mode === "summary" ? Math.max(0, Math.min(1, st.remaining / s.holdMs)) : 0);
