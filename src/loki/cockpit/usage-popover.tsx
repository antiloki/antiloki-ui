// THE USAGE WINDOW, ONE SCREEN (approved mockup 2026-11-21; AffectUI's Model Router, Model Usage and Usage Meter in one): your asks branch into one line per model, each as wide as its share, with light running along it; stacked bars per company; each seat's limits; every model with OpenRouter's price; the cost per day.
// The money is what the same tokens would cost at OpenRouter's list (subscriptions bill $0 metered), plus what the team runs spent. A card in the middle of the screen, drawn in the body; no "full" window behind it: everything is here.
import * as React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import { useTourUnlock } from "@/loki/shell/mini-tour";
import { ENGINE_COLORS, fetchFuel, linesFromFuel, useFuelLive, type Fuel } from "./fuel-mini";
import { limitBars, tightest } from "./limits-icon";
import { companiesOf, fmtMeasure, fmtPrice, houseLabel, type Measure } from "./usage-model";

const WINDOWS: { days: number; label: string; pill: string }[] = [{ days: 0, label: "Today", pill: "today" }, { days: 7, label: "7 days", pill: "last 7 days" }, { days: 30, label: "30 days", pill: "last 30 days" }];
const MEASURES: { key: Measure; label: string }[] = [{ key: "cost", label: "Cost" }, { key: "tokens", label: "Tokens" }, { key: "requests", label: "Requests" }];
const colorOf = (house: string) => ENGINE_COLORS[house] ?? (house === "teams" ? "#9aa0a6" : "#8b8b94");
const label: React.CSSProperties = { fontSize: 11.5, color: C.dim, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 8 };
const seg = (on: boolean): React.CSSProperties => ({ border: "none", borderRadius: 999, padding: "2px 12px", fontFamily: nav, fontSize: 12, cursor: "pointer", background: on ? `color-mix(in srgb, ${C.brand} 18%, transparent)` : "transparent", color: on ? C.fg : C.muted });
const reduced = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** THE BRANCHES: the gateway on the left splits into a line per model, each as wide as its share; light travels along each (not under reduced motion). */
function Branches({ flat, measure, total }: { flat: { model: string; house: string; value: number; share: number; or_in: number | null; or_out: number | null; priced: boolean }[]; measure: Measure; total: number }) {
  const rows = flat.slice(0, 9); const RH = 36, W = 440, H = rows.length * RH + 8, gx = 62, gy = H / 2, x1 = 190; const calm = reduced();
  const [hot, setHot] = React.useState<number | null>(null);
  return (
    <svg data-testid="usage-branches" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Share of ${measure} by model`} style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}>
      {rows.map((r, i) => {
        const y = i * RH + RH / 2 + 4; const w = Math.max(1.2, Math.min(14, r.share * 16)); const d = `M${gx + 30},${gy} C${gx + 110},${gy} ${x1 - 90},${y} ${x1},${y}`; const n = r.share > 0.2 ? 3 : r.share > 0.06 ? 2 : 1; const col = colorOf(r.house);
        return (
          <g key={`${r.house}-${r.model}`} data-testid={`usage-branch-${i}`} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)} opacity={hot == null || hot === i ? 1 : 0.28}>
            <path d={d} fill="none" stroke={col} strokeWidth={w} strokeLinecap="round" opacity={0.78} style={{ transition: "stroke-width .7s cubic-bezier(.2,.8,.2,1)" }} data-w={w.toFixed(2)} />
            {!calm && Array.from({ length: n }, (_, j) => <circle key={j} r={Math.min(3.2, Math.max(1.6, w / 3))} fill="#fff" opacity={0.9}><animateMotion dur={`${(2.4 + i * 0.18).toFixed(2)}s`} begin={`-${((j * (2.4 + i * 0.18)) / n).toFixed(2)}s`} repeatCount="indefinite" path={d} /></circle>)}
            <circle cx={x1} cy={y} r={3} fill={col} />
            <text x={x1 + 10} y={y - 1} fontSize={12} fill="var(--c-fg)" fontFamily={nav}>{r.model}</text>
            <text x={x1 + 10} y={y + 11} fontSize={11} fill="var(--c-muted)" fontFamily={mono}>{Math.round(r.share * 100)}% · {fmtMeasure(r.value, measure)}{r.or_in != null ? ` · $${fmtPrice(r.or_in)} / $${fmtPrice(r.or_out)}` : r.priced ? "" : " · no price"}</text>
          </g>);
      })}
      <rect x={2} y={gy - 22} width={gx + 30} height={44} rx={10} fill="var(--c-panel2, var(--c-panel))" stroke="var(--c-border)" />
      <text x={gx / 2 + 16} y={gy - 3} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--c-fg)" fontFamily={mono}>your asks</text>
      <text x={gx / 2 + 16} y={gy + 11} textAnchor="middle" fontSize={11} fill="var(--c-muted)" fontFamily={mono}>{fmtMeasure(total, measure)}</text>
    </svg>);
}

export function UsagePopover({ onClose }: { onClose: () => void }) {
  useTourUnlock("usage");
  const [days, setDays] = React.useState(7); const [measure, setMeasure] = React.useState<Measure>("cost"); const live = useFuelLive(); const [other, setOther] = React.useState<Fuel | null>(null); const [tip, setTip] = React.useState<string | null>(null);
  // opening the window (or choosing another span) is the person asking: scan now, then show it
  const [asked, setAsked] = React.useState<Fuel | null>(null);
  React.useEffect(() => { let stop = false; setAsked(null); void fetchFuel(days, true).then((f) => { if (!stop && f) setAsked(f); }); return () => { stop = true; }; }, [days]);
  React.useEffect(() => { if (days === 7) return; let stop = false; setOther(null); const go = async () => { const f = await fetchFuel(days); if (!stop && f) setOther(f); }; void go(); const t = setInterval(go, 20_000); return () => { stop = true; clearInterval(t); }; }, [days]);
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const fuel = asked ?? (days === 7 ? live : other);
  const bars = limitBars(linesFromFuel(fuel)); const worst = tightest(bars); const out = bars.filter((b) => b.out);
  const { companies, total, unpriced } = companiesOf(fuel, measure); const flat = companies.flatMap((c) => c.models); flat.sort((a, b) => b.value - a.value);
  const tokens = companiesOf(fuel, "tokens").total; const calls = companiesOf(fuel, "requests").total; const costTotal = companiesOf(fuel, "cost").total;
  const mx = Math.max(...companies.map((c) => c.value), 0) || 1; const H = 150; const bars5 = companies.slice(0, 5); const daily = fuel?.daily ?? []; const dmx = Math.max(...daily.map((d) => d.cost), 0) || 1;
  const pts = daily.map((d, i) => [daily.length > 1 ? (i * 400) / (daily.length - 1) : 200, 42 - (d.cost / dmx) * 36] as const); const path = pts.length > 1 ? "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L") : "";
  return createPortal(
    <div data-testid="usage-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 14 }}>
      <div data-testid="usage-popover" role="dialog" aria-label="usage" style={{ width: "min(520px, 100%)", maxHeight: "min(92vh, 860px)", overflowY: "auto", borderRadius: 16, fontFamily: nav, color: C.fg, background: C.panel, border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px 0", flexWrap: "wrap" }}>
          <b style={{ fontSize: 14, fontWeight: 600 }}>Usage</b>
          <span data-testid="usage-label" style={{ fontSize: 11.5, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 999, padding: "0 8px" }}>{WINDOWS.find((w) => w.days === days)?.pill}</span><span style={{ flex: 1 }} />
          <div role="radiogroup" aria-label="window" data-testid="usage-windows" style={{ display: "flex", gap: 2, padding: 2, border: `1px solid ${C.border}`, borderRadius: 999 }}>{WINDOWS.map((w) => <button key={w.days} role="radio" aria-checked={days === w.days} data-testid={`usage-window-${w.days}`} onClick={() => setDays(w.days)} style={seg(days === w.days)}>{w.label}</button>)}</div>
          <button aria-label="Close" onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12 }}>✕</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px 0", flexWrap: "wrap" }}>
          <div role="radiogroup" aria-label="measure" data-testid="usage-measures" style={{ display: "flex", gap: 2, padding: 2, border: `1px solid ${C.border}`, borderRadius: 999 }}>{MEASURES.map((m) => <button key={m.key} role="radio" aria-checked={measure === m.key} data-testid={`usage-measure-${m.key}`} onClick={() => setMeasure(m.key)} style={seg(measure === m.key)}>{m.label}</button>)}</div>
          <span style={{ fontSize: 12, color: C.dim }}>cost = tokens × OpenRouter price · lines show $ in / $ out per 1M</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "12px 18px 14px", flexWrap: "wrap" }}>
          <div><b data-testid="usage-spend" style={{ fontFamily: mono, fontSize: 32, letterSpacing: "-.03em", fontWeight: 600 }}>{fmtMeasure(total, measure)}</b><div style={{ fontSize: 12, color: C.dim }}>{fmtMeasure(tokens, "tokens")} tokens · {Math.round(calls).toLocaleString("en-US")} requests</div></div>
          {measure === "cost" && days > 0 && (fuel?.or_prev ?? 0) > 0 && typeof fuel?.or_cost === "number" && (() => { const d = ((fuel.or_cost - fuel.or_prev!) / fuel.or_prev!) * 100; return <span data-testid="usage-delta" style={{ fontSize: 12, color: C.muted }}><b style={{ color: d > 0 ? C.bad : C.ok, fontWeight: 500 }}>{d > 0 ? "+" : ""}{Math.round(d)}%</b> since the period before</span>; })()}
          {measure === "cost" && unpriced > 0 && <span data-testid="usage-unpriced" style={{ fontSize: 12, color: C.warn }}>{unpriced} model{unpriced === 1 ? "" : "s"} not on OpenRouter's list: counted as $0</span>}
        </div>
        {flat.length === 0 ? <div data-testid="usage-empty" style={{ color: C.muted, fontSize: 12.5, padding: "0 18px 16px", borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>{fuel ? "Nothing has run in this window yet." : "Reading the record…"}</div> : <>
          <div style={{ padding: "6px 18px 4px", borderTop: `1px solid ${C.border}` }}><Branches flat={flat} measure={measure} total={total} /></div>
          <div style={{ position: "relative", padding: "14px 18px 6px", borderTop: `1px solid ${C.border}` }}>
            <div data-testid="usage-bars" role="group" aria-label="Usage by company" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, alignItems: "end", height: H + 4, borderBottom: `1px solid ${C.border}` }}>
              {companies.slice(0, 5).map((c) => (
                <button key={c.house} data-testid={`usage-bar-${c.house}`} aria-label={`${c.label} ${fmtMeasure(c.value, measure)}`} onMouseEnter={() => setTip(c.house)} onMouseLeave={() => setTip(null)} onFocus={() => setTip(c.house)} onBlur={() => setTip(null)}
                  style={{ display: "flex", flexDirection: "column-reverse", gap: 2, justifyContent: "flex-start", height: "100%", width: "100%", maxWidth: 72, margin: "0 auto", background: "transparent", border: "none", padding: 0, cursor: "default" }}>
                  {c.models.map((m, i) => <span key={m.model} style={{ display: "block", height: Math.max(3, (m.value / mx) * H), background: colorOf(c.house), opacity: 1 - i * 0.28, borderRadius: 3, transition: "height .55s cubic-bezier(.2,.8,.2,1)" }} />)}
                </button>))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, paddingTop: 6, fontSize: 12, color: C.muted, textAlign: "center" }}>{companies.slice(0, 5).map((c) => <span key={c.house}>{c.label}</span>)}</div>
            {tip && (() => { const c = companies.find((x) => x.house === tip); if (!c) return null; return (
              <div data-testid="usage-tip" style={{ position: "absolute", top: 12, right: 18, width: 250, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", fontSize: 12, pointerEvents: "none" }}>
                <b style={{ fontSize: 12.5 }}>{c.label} · {fmtMeasure(c.value, measure)}</b>
                {c.models.map((m) => <div key={m.model} style={{ marginTop: 5 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>{m.model}</span><span style={{ fontFamily: mono }}>{fmtMeasure(m.value, measure)} · {m.share * 100 < 1 ? "<1" : Math.round(c.value > 0 ? (m.value / c.value) * 100 : 0)}%</span></div>{m.or_in != null && <div style={{ color: C.dim, paddingLeft: 10 }}>OpenRouter ${fmtPrice(m.or_in)} in · ${fmtPrice(m.or_out)} out per 1M</div>}</div>)}
              </div>); })()}
          </div>
        </>}
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}` }}><div style={label}>Limits</div>
          {bars.length === 0 && <div style={{ color: C.muted, fontSize: 12.5 }}>No seat has reported a window yet.</div>}
          {bars.map((b) => { const w = b.week == null ? 0 : Math.round(b.week * 100); const tone = w >= 90 ? C.bad : w >= 70 ? C.warn : colorOf(b.key); return (
            <div key={b.key} data-testid={`usage-limit-${b.key}`} style={{ display: "grid", gridTemplateColumns: "92px 1fr 130px", gap: 10, alignItems: "center", padding: "4px 0", fontSize: 12.5 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><i style={{ width: 8, height: 8, borderRadius: 8, background: colorOf(b.key), display: "inline-block" }} />{b.label}</span>
              <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}><div style={{ height: "100%", width: b.out ? "100%" : `${w}%`, background: b.out ? C.bad : tone, borderRadius: 3, transition: "width .7s cubic-bezier(.2,.8,.2,1)" }} /></div>
              <span style={{ fontFamily: mono, fontSize: 12, textAlign: "right", color: b.out ? C.bad : C.muted }}>{b.out ? "out of quota" : b.week == null ? "—" : `${b.longName ?? "week"} ${w}%${b.session != null ? ` · 5h ${Math.round(b.session * 100)}%` : ""}`}</span>
            </div>); })}
          {(out.length > 0 || (worst && worst.pct >= 0.9)) && <div data-testid="usage-advice" style={{ marginTop: 8, border: "1px solid color-mix(in srgb, #f04e4e 45%, transparent)", background: "color-mix(in srgb, #f04e4e 10%, transparent)", borderRadius: 10, padding: "8px 10px", fontSize: 12.5, lineHeight: 1.45 }}>{out.length > 0 ? `${out.map((o) => o.label).join(", ")} ${out.length === 1 ? "is" : "are"} out of quota. The router sends its work to a seat that still has room.` : `${bars.find((b) => b.key === worst!.key)?.label ?? "A seat"} is nearly out of its ${worst!.which === "week" ? "week" : "5 h window"}.`}</div>}
        </div>
        {flat.length > 0 && <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}` }}><div style={label}>Every model, at OpenRouter's price</div>
          <div style={{ overflowX: "auto" }}><table data-testid="usage-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ color: C.dim, fontSize: 11 }}>{["Model", "$ in / out per 1M", "Tokens", "Reqs", "Cost"].map((h, i) => <th key={h} scope="col" style={{ textAlign: i === 0 ? "left" : "right", fontWeight: 500, padding: "4px 6px", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>{companies.flatMap((c) => c.models).map((m) => <tr key={`${m.house}-${m.model}`} data-testid={`usage-row-${m.model}`} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: "6px", whiteSpace: "nowrap" }}><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: colorOf(m.house), marginRight: 6 }} />{m.model}</td>
              {[m.or_in != null ? `${fmtPrice(m.or_in)} / ${fmtPrice(m.or_out)}` : "—", fmtMeasure(m.tokens, "tokens"), fmtMeasure(m.calls, "requests"), m.or_cost != null ? fmtMeasure(m.or_cost, "cost") : m.house === "teams" ? fmtMeasure(m.value, "cost") : "no price"].map((v, i) => <td key={i} style={{ textAlign: "right", fontFamily: mono, fontSize: 12, padding: "6px", whiteSpace: "nowrap", color: v === "no price" ? C.warn : C.fg }}>{v}</td>)}
            </tr>)}</tbody></table></div></div>}
        {daily.length > 1 && <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}` }}><div style={label}>Per day</div>
          <svg data-testid="usage-daily" viewBox="0 0 400 44" preserveAspectRatio="none" role="img" aria-label="Cost per day" style={{ display: "block", width: "100%", height: 44 }}>
            <path d={`${path} L400,44 L0,44 Z`} fill="var(--c-brand)" opacity={0.16} /><path d={path} fill="none" stroke="var(--c-brand)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
            {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3} fill="var(--c-brand)" />}</svg>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 4 }}><span>{daily[0].day.slice(5)}</span><span>peak {fmtMeasure(dmx, "cost")}</span><span>{daily[daily.length - 1].day.slice(5)} · {fmtMeasure(daily[daily.length - 1].cost, "cost")}</span></div></div>}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px 14px", borderTop: `1px solid ${C.border}`, flexWrap: "wrap" }}>
          <span data-testid="usage-status" style={{ fontSize: 12, color: out.length ? "#f04e4e" : fuel ? C.muted : C.dim }}>{fuel == null ? "Reading the record…" : out.length ? "A seat is out" : "Live"}</span><span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: C.dim }}>Subscriptions bill $0 metered: this is what the same tokens would cost.{costTotal > 0 && measure !== "cost" ? "" : ""}</span>
        </div>
      </div>
    </div>, document.body);
}
