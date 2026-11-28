// THE LIMITS, AS A GRAPH YOU CAN SEE WITHOUT OPENING ANYTHING (operator 2026-09-26: "about tokens and limits
// create a new window and replace the icon of PR with a mini graph of the limits we have and what we expended,
// add also a mini preview on mouse over on this icon").
//
// WHY THIS EARNS THE SLOT THE PULL REQUESTS LOST. A PR list was a mirror of something GitHub renders better and
// where you cannot act anyway. A limit is the opposite: nobody else knows it, you cannot see it in the terminal,
// and it is the thing that stops your work mid-task. For somebody living on Pro seats it is the most urgent
// number in the product — more urgent than the saving, because the saving is comparative and a limit is absolute.
//
// It reads the SAME payload the fuel does (`fetchFuel`), so the two can never disagree about a window.
import React from "react";
import { fitRef } from "./fit-popover";
import { C, mono } from "@/loki/theme";
import { ENGINE_COLORS, linesFromFuel, useFuelLive, type EngineLine, type Fuel } from "./fuel-mini";

/** one engine's two windows, as fractions of full. `null` is "this engine never said" — which is not 0%. */
export type Bar = { key: string; label: string; session: number | null; week: number | null; /** `month` when the long window is 30 days */ longName?: "week" | "month"; live: boolean; tone: EngineLine["tone"];
  /** the seat said it is out of quota (no window to draw): shown as that, never as a number */ out: boolean };

/** the bars, from the fuel's own engine lines. Pure — tested. */
export function limitBars(lines: EngineLine[]): Bar[] {
  // `used_pct` IS A PERCENTAGE, ALWAYS (audit 2026-09-28). The `v > 1 ? v/100 : v` guess was meant to accept
  // either shape, and it got the one real case exactly backwards: a window at 1% or less is not a fraction, it
  // is one percent — so the bar drew FULL and red while the fuel popover one hover away read "5h 1%". Two
  // numbers from the same payload, disagreeing on screen. Serve sends 0–100 (`fuel-mini` prints it as such).
  const pct = (v: number | null) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : null);
  return lines.map((l) => ({ key: l.key, label: l.label, session: pct(l.fiveH), week: pct(l.week), longName: l.longName, live: l.panes > 0, tone: l.tone, out: !!l.out }));
}

/** THE WORST WINDOW ANYWHERE — what the icon is really saying at a glance. `null` when nothing reported, which
 *  the icon draws as empty rather than as "plenty left". Pure — tested. */
export function tightest(bars: Bar[]): { key: string; pct: number; which: "session" | "week" } | null {
  let worst: { key: string; pct: number; which: "session" | "week" } | null = null;
  for (const b of bars) {
    for (const which of ["session", "week"] as const) {
      const v = b[which];
      if (v == null) continue;
      if (!worst || v > worst.pct) worst = { key: b.key, pct: v, which };
    }
  }
  return worst;
}

/** the sentence for the icon's tooltip and the preview's head. Pure — tested. */
export function limitsLine(bars: Bar[]): string {
  const t = tightest(bars);
  const out = bars.filter((b) => b.out).map((b) => b.key);
  const outText = out.length ? `${out.join(", ")} out of quota` : "";
  if (!t) return outText || "no engine has reported a window yet";
  const left = Math.round((1 - t.pct) * 100);
  return `${outText ? `${outText} · ` : ""}${left}% of ${t.key}'s ${t.which === "session" ? "session" : "week"} left`;
}

const toneOf = (p: number | null) => (p == null ? C.dim : p >= 0.9 ? C.bad : p >= 0.7 ? C.warn : C.ok);

/** one small bar: the used part, bottom-up. */
function MiniBar({ b, h = 14, w = 4 }: { b: Bar; h?: number; w?: number }) {
  const used = Math.max(b.session ?? 0, b.week ?? 0);
  const known = b.session != null || b.week != null;
  const outOnly = b.out && !known;
  return (
    <span data-testid={`limit-bar-${b.key}`} title={`${b.label}: ${known ? `${Math.round(used * 100)}% used` : outOnly ? "out of quota" : "no window reported"}`}
      style={{ position: "relative", width: w, height: h, borderRadius: 2, background: `color-mix(in oklab, ${C.border} 70%, transparent)`, display: "inline-block", overflow: "hidden", opacity: b.live ? 1 : 0.55 }}>
      {known && <i style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${Math.round(used * 100)}%`, background: toneOf(used), display: "block" }} />}
      {outOnly && <i data-testid={`limit-bar-out-${b.key}`} style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(135deg, ${C.bad} 0 2px, transparent 2px 4px)`, display: "block" }} />}
    </span>
  );
}

export function LimitsIcon({ onOpen }: { onOpen?: () => void }) {
  const fuel = useFuelLive();
  const [hot, setHot] = React.useState(false);
  const bars = React.useMemo(() => limitBars(linesFromFuel(fuel)), [fuel]);
  return (
    <div data-testid="limits-icon" onClick={onOpen} title={`${limitsLine(bars)} — hover for every window, click for tokens and limits`}
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      // CENTRED, NOT BOTTOM-ALIGNED (operator 2026-09-26: "the icon on the token limit on the top header switcher is
      // not aligned correctly"). `flex-end` sat the bars in the bottom of a 22px box while the money and the pill
      // beside them are centred, so they rode low. The bars are all one height, so centring the row keeps the
      // shared baseline they need to be readable as a graph.
      style={{ position: "relative", display: "flex", alignItems: "center", gap: 2, height: 22, padding: "0 3px", cursor: onOpen ? "pointer" : "default", opacity: hot ? 1 : 0.85, transition: "opacity .18s ease" }}>
      {bars.map((b) => <MiniBar key={b.key} b={b} />)}
      {hot && (
        <div data-testid="limits-popover" ref={fitRef} style={{ position: "absolute", top: 26, right: 0, zIndex: 200, minWidth: 250, maxWidth: "calc(100vw - 24px)", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontFamily: mono, fontSize: 9.5, lineHeight: 1.6, boxShadow: "0 12px 40px rgba(0,0,0,.45)", display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ color: C.fg, fontWeight: 700 }}>{limitsLine(bars)}</div>
          {bars.map((b) => (
            <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: 7, background: ENGINE_COLORS[b.key], flexShrink: 0, opacity: b.live ? 1 : 0.4 }} />
              <span style={{ color: b.live ? C.fg : C.dim, width: 62 }}>{b.label}</span>
              <span style={{ color: b.out && b.session == null ? C.bad : C.muted }}>{b.session != null ? `session ${Math.round(b.session * 100)}%` : b.out ? "out of quota" : "session —"}</span>
              <span style={{ color: C.muted, marginLeft: "auto" }}>{b.week == null ? "week —" : `week ${Math.round(b.week * 100)}%`}</span>
            </div>
          ))}
          <div style={{ color: C.dim }}>click → tokens and limits</div>
        </div>
      )}
    </div>
  );
}

// ── THE WINDOW ─────────────────────────────────────────────────────────────────────────────────────────────────
// Tokens and limits in one place (operator 2026-09-26: "fuel should show AI limits, session and weekly, show
// tokens sum all analytics. Better, about tokens and limits create a new window").
//
// It is a SECOND window rather than more of the Fuel one on purpose: the money and the capacity are two different
// questions asked at two different moments. The saving is read when you are deciding whether this is worth it;
// the window is read when you are deciding whether you can finish today.
const fmtTok = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `${Math.round(n)}`);

/** the totals under the bars — every call this workspace has made, not a sample. Pure — tested. */
export function tokenTotals(f: Fuel | null): { tokens: number; tokens_in: number; tokens_out: number; calls: number; failed: number; cost: number } {
  const h = f?.houses ?? [];
  const sum = (pick: (x: (typeof h)[number]) => number) => h.reduce((a, x) => a + (pick(x) || 0), 0);
  return { tokens: sum((x) => x.tokens), tokens_in: sum((x) => x.tokens_in), tokens_out: sum((x) => x.tokens_out),
           calls: sum((x) => x.calls), failed: sum((x) => x.failed), cost: sum((x) => x.cost) };
}

function Row({ b }: { b: Bar }) {
  const bar = (p: number | null, label: string, out = false) => (
    <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, minWidth: 0 }}>
      <span style={{ color: C.dim, width: 46, fontSize: 9.5 }}>{label}</span>
      <span style={{ position: "relative", flex: 1, height: 7, borderRadius: 4, background: `color-mix(in oklab, ${C.border} 70%, transparent)`, overflow: "hidden" }}>
        {p != null && <i style={{ position: "absolute", inset: 0, width: `${Math.round(p * 100)}%`, background: toneOf(p), display: "block" }} />}
      </span>
      <span style={{ color: out ? C.bad : p == null ? C.dim : C.muted, width: out ? 74 : 42, textAlign: "right", fontSize: 9.5 }}>{p != null ? `${Math.round(p * 100)}%` : out ? "out of quota" : "—"}</span>
    </div>
  );
  return (
    <div data-testid={`limits-row-${b.key}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: `1px solid ${C.border}` }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, width: 96, flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: 8, background: ENGINE_COLORS[b.key], opacity: b.live ? 1 : 0.4 }} />
        <span style={{ color: b.live ? C.fg : C.dim }}>{b.label}</span>
      </span>
      {bar(b.session, "session", b.out && b.session == null)}
      {bar(b.week, "week")}
    </div>
  );
}

export function LimitsWindow({ onClose }: { onClose: () => void }) {
  const fuel = useFuelLive();
  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const bars = limitBars(linesFromFuel(fuel));
  const t = tokenTotals(fuel);
  const Stat = ({ n, l }: { n: string; l: string }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ color: C.fg, fontSize: 13, fontWeight: 700 }}>{n}</span>
      <span style={{ color: C.dim, fontSize: 9.5 }}>{l}</span>
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} data-testid="limits-window"
        style={{ width: "min(720px, 92vw)", maxHeight: "86vh", overflowY: "auto", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", fontFamily: mono, fontSize: 11, boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 14, color: C.fg, fontWeight: 700 }}>Tokens and limits</span>
          <span style={{ color: C.dim, fontSize: 10 }}>{limitsLine(bars)}</span>
          <button onClick={onClose} title="close (Esc)" style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>
        </div>
        <p style={{ color: C.dim, fontSize: 10, lineHeight: 1.6, margin: "0 0 10px" }}>
          The windows each engine reports, and everything this workspace has spent inside them. A window nobody
          reported reads <b>—</b>, never 0%: an engine that will not say how much is left is not an engine with
          plenty left.
        </p>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", padding: "8px 0 12px" }}>
          <Stat n={fmtTok(t.tokens)} l="tokens, all engines" />
          <Stat n={fmtTok(t.tokens_in)} l="in" />
          <Stat n={fmtTok(t.tokens_out)} l="out" />
          <Stat n={`${t.calls}`} l={`calls${t.failed ? ` · ${t.failed} failed` : ""}`} />
          <Stat n={`$${t.cost.toFixed(2)}`} l="API-equivalent spent" />
          {fuel?.saved && <Stat n={`$${Number(fuel.saved.saved ?? 0).toFixed(2)}`} l="saved by the router" />}
        </div>
        {bars.map((b) => <Row key={b.key} b={b} />)}
        {fuel?.analysis && <p data-testid="limits-analysis" style={{ color: C.muted, fontSize: 10, lineHeight: 1.6, marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>{fuel.analysis}</p>}
      </div>
    </div>
  );
}
