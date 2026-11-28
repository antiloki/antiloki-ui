// THE DATE, THE TIME AND THE TOKENS ON THE BOTTOM BAR (the operator 2026-11-22): discreet, in the middle. A click on the time opens the full calendar and clock; the figure beside it is every token ever spent, over every project.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { createPortal } from "react-dom";
import { apiGet, unwrapResult as un } from "@/loki/api/client";
import { fmtMeasure } from "@/loki/cockpit/usage-model";

/** The days of a month as weeks of seven (Monday first); `null` pads the first and last week. Pure. */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const first = (new Date(year, month, 1).getDay() + 6) % 7; const days = new Date(year, month + 1, 0).getDate(); const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null); const rows: (number | null)[][] = []; for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7)); return rows;
}
/** `Sun 22 Nov` and `13:05`, in the person's own locale. Pure. */
export const shortDate = (d: Date): string => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
export const shortTime = (d: Date): string => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const ISO_WEEK = (d: Date) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((+t - +y0) / 86400000 + 1) / 7); };

export function useTokensEver(): number | null {
  const [v, setV] = React.useState<number | null>(null);
  React.useEffect(() => { let stop = false; const go = async () => { try { const r: any = un(await apiGet("/api/v1/cockpit/tokens-total")); if (!stop && typeof r?.tokens === "number") setV(r.tokens); } catch { /* the serve is older: nothing shown */ } }; void go(); const t = setInterval(go, 60_000); return () => { stop = true; clearInterval(t); }; }, []);
  return v;
}
export function BarClock() {
  const [now, setNow] = React.useState(() => new Date()); const [open, setOpen] = React.useState(false); const tokens = useTokensEver();
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), open ? 1000 : 20_000); return () => clearInterval(t); }, [open]);
  const dim: React.CSSProperties = { background: "transparent", border: "none", padding: "0 4px", cursor: "pointer", fontFamily: mono, fontSize: 11, color: C.muted };
  return (
    <span data-testid="bar-clock-wrap" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button data-testid="bar-clock" data-tip="Date and time: click for the calendar" onClick={() => setOpen(true)} style={dim}>{shortDate(now)} · {shortTime(now)}</button>
      {tokens !== null && <span data-testid="bar-tokens" title="Every token spent, all projects, all time" style={{ ...dim, cursor: "default" }}>{fmtMeasure(tokens, "tokens")} tokens</span>}
      {open && <CalendarWindow now={now} onClose={() => setOpen(false)} />}
    </span>
  );
}
function CalendarWindow({ now, onClose }: { now: Date; onClose: () => void }) {
  const [ym, setYm] = React.useState({ y: now.getFullYear(), m: now.getMonth() }); const grid = monthGrid(ym.y, ym.m); const label = new Date(ym.y, ym.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; const step = (d: number) => setYm((p) => { const n = new Date(p.y, p.m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });
  const isToday = (d: number | null) => d !== null && ym.y === now.getFullYear() && ym.m === now.getMonth() && d === now.getDate();
  return (
    <CalendarShell tz={tz} onClose={onClose}>
      <div data-testid="calendar" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "4px 8px 4px", fontFamily: nav, color: "var(--c-fg)" }}>
        <div style={{ textAlign: "center" }}>
          <div data-testid="calendar-time" style={{ fontSize: 38, fontWeight: 300, letterSpacing: 1, fontVariantNumeric: "tabular-nums" }}>{now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
          <div style={{ color: "var(--c-muted)", fontSize: 13 }}>{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · week {ISO_WEEK(now)}</div></div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button data-testid="cal-prev" aria-label="previous month" onClick={() => step(-1)} style={{ ...navBtn }}>‹</button><b style={{ minWidth: 150, textAlign: "center", fontWeight: 600, fontSize: 14, textTransform: "capitalize" }}>{label}</b><button data-testid="cal-next" aria-label="next month" onClick={() => step(1)} style={navBtn}>›</button>
          <button data-testid="cal-today" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })} style={{ ...navBtn, width: "auto", padding: "0 10px", fontSize: 12 }}>today</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 38px)", gap: 2, textAlign: "center", fontSize: 12.5 }}>
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} style={{ color: "var(--c-dim)", fontSize: 11 }}>{d}</span>)}
          {grid.flat().map((d, i) => <span key={i} data-today={isToday(d) ? "1" : undefined} style={{ height: 34, lineHeight: "34px", borderRadius: "50%", background: isToday(d) ? "var(--c-brand)" : "transparent", color: isToday(d) ? "#fff" : "var(--c-fg)", fontWeight: isToday(d) ? 700 : 400, opacity: d === null ? 0 : 1 }}>{d ?? ""}</span>)}
        </div>
      </div>
    </CalendarShell>
  );
}
/** The calendar's window: small, in the middle, the shell dresses the box. A click outside or Esc closes it. */
function CalendarShell({ tz, onClose, children }: { tz: string; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => { const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on); }, [onClose]);
  return createPortal(
    <div data-testid="calendar-scrim" data-no-shell onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", background: "rgba(8,9,10,.25)" }}>
      <div role="dialog" aria-label="calendar" style={{ width: 330, maxWidth: "calc(100vw - 32px)", display: "flex", flexDirection: "column", color: "var(--c-fg)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px 4px", fontFamily: nav, fontSize: 12, color: "var(--c-muted)" }}><b style={{ color: "var(--c-fg)", fontWeight: 600, fontSize: 12.5 }}>Calendar</b><span>{tz}</span><button aria-label="close" data-testid="calendar-close" onClick={onClose} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--c-muted)", cursor: "pointer", fontSize: 13 }}>✕</button></div>
        <div style={{ padding: "4px 14px 16px" }}>{children}</div>
      </div>
    </div>, document.body);
}
const navBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer", background: "color-mix(in srgb, var(--c-fg) 9%, transparent)", color: "var(--c-fg)", fontSize: 16, lineHeight: 1 };
