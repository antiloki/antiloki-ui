// THE TEAM'S WEEK (approved mockup 2026-11-18, from the idea of AffectUI's Scheduled Runs; drawn by us): the runs its schedules will start over the next seven days, a column per day with a card per run at its time, the next one marked, and how much of today's allowance is used.
// Read from the cron lines the person already set; to change one, use the form below. Pure `cronMinutes` / `weekPlan` do the reading (a cron field is a number, *, */n, a-b, a-b/n or a list of those).
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { cronWords } from "./TeamTriggers";

const expand = (f: string, lo: number, hi: number): Set<number> | null => {
  const out = new Set<number>();
  for (const part of f.split(",")) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part.trim()); if (!m) return null; const step = m[2] ? +m[2] : 1; if (step < 1) return null;
    let a = lo, b = hi; if (m[1] !== "*") { const [x, y] = m[1].split("-").map(Number); a = x; b = y ?? (m[2] ? hi : x); }
    if (a < lo || b > hi || a > b) return null; for (let v = a; v <= b; v += step) out.add(v);
  }
  return out;
};
/** The minutes of the day (0..1439) a cron line fires on `day`; empty when the line is not one this view can read, or the day does not match. Pure. */
export function cronMinutes(cron: string, day: Date): number[] {
  const p = cron.trim().split(/\s+/); if (p.length !== 5) return [];
  const mi = expand(p[0], 0, 59), ho = expand(p[1], 0, 23), dom = expand(p[2], 1, 31), mo = expand(p[3], 1, 12), dow = expand(p[4].replace(/7/g, "0"), 0, 6); if (!mi || !ho || !dom || !mo || !dow) return [];
  if (!dom.has(day.getDate()) || !mo.has(day.getMonth() + 1) || !dow.has(day.getDay())) return [];
  const out: number[] = []; for (const h of [...ho].sort((a, b) => a - b)) for (const m of [...mi].sort((a, b) => a - b)) out.push(h * 60 + m); return out;
}
/** The cron after one run moved from the weekday `from` to `to` (0 = Sunday): that weekday leaves the day-of-week field and the new one joins it. Null when the line cannot be read, has a day of the month or a month fixed, or the move changes nothing (an every-day line). Pure. */
export function moveCron(cron: string, from: number, to: number): string | null {
  const p = cron.trim().split(/\s+/); if (p.length !== 5 || p[2] !== "*" || p[3] !== "*" || p[4] === "*") return null; const d = expand(p[4].replace(/7/g, "0"), 0, 6); if (!d || !d.has(from) || from === to) return null;
  d.delete(from); d.add(to); if (d.size === 7) return null; return `${p[0]} ${p[1]} * * ${[...d].sort((a, b) => a - b).join(",")}`;
}
export type PlanCard = { trigger: string; ask: string; label: string; at: number; count: number };
/** The seven days from `from`: for each, the cards in time order. A trigger that fires more than three times a day is one card ("24 runs"). Pure. */
export function weekPlan(triggers: { id?: string; kind?: string; cron?: string; ask?: string }[], from: Date): { date: Date; cards: PlanCard[] }[] {
  return Array.from({ length: 7 }, (_, i) => { const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i); const cards: PlanCard[] = [];
    for (const t of triggers) { if ((t.kind ?? "schedule") !== "schedule" || !t.cron) continue; const mins = cronMinutes(t.cron, date); if (!mins.length) continue;
      if (mins.length > 3) cards.push({ trigger: t.id ?? t.cron, ask: t.ask ?? "", label: cronWords(t.cron), at: mins[0], count: mins.length }); else for (const m of mins) cards.push({ trigger: t.id ?? t.cron, ask: t.ask ?? "", label: cronWords(t.cron), at: m, count: 1 }); }
    return { date, cards: cards.sort((a, b) => a.at - b.at) }; });
}
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function ScheduleWeek({ triggers, now = new Date(), usedToday, maxToday, onMove }: { /** a run was dragged to another day: the trigger and its new cron line (the person says yes again, as for any change of schedule) */ onMove?: (trigger: string, cron: string) => void; triggers: { id?: string; kind?: string; cron?: string; ask?: string }[]; now?: Date; usedToday?: number; maxToday?: number }) {
  const plan = React.useMemo(() => weekPlan(triggers, now), [triggers, now.getDate()]); const [over, setOver] = React.useState<number | null>(null);   // eslint-disable-line react-hooks/exhaustive-deps
  const total = plan.reduce((a, d) => a + d.cards.reduce((x, c) => x + c.count, 0), 0); if (total === 0) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes(); const next = plan[0].cards.find((c) => c.at > nowMin) ?? plan.slice(1).find((d) => d.cards.length)?.cards[0];
  return (
    <div data-testid="schedule-week" style={{ margin: "4px 16px 12px", border: `1px solid ${C.border}`, borderRadius: 16, padding: "12px 14px", background: "color-mix(in srgb, var(--c-panel) 80%, transparent)", fontFamily: nav, color: C.fg }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}><b style={{ fontWeight: 600 }}>This week</b><span style={{ color: C.muted, fontSize: 12.5 }}>{total} run{total === 1 ? "" : "s"} planned</span><span style={{ flex: 1 }} />
        {maxToday ? <span data-testid="week-allowance" style={{ fontSize: 12, color: C.muted }}>today <b style={{ color: C.fg, fontWeight: 500 }}>{usedToday ?? 0}</b> of {maxToday} runs<span aria-hidden style={{ display: "inline-block", width: 70, height: 4, borderRadius: 2, background: "var(--c-border)", marginLeft: 8, verticalAlign: "middle", overflow: "hidden" }}><i style={{ display: "block", width: `${Math.min(100, ((usedToday ?? 0) / maxToday) * 100)}%`, height: "100%", background: "#4d8dff" }} /></span></span> : null}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(110px, 1fr))", gap: 6, overflowX: "auto" }}>
        {plan.map((d, i) => <div key={i} data-testid={`week-day-${i}`} onDragOver={(e) => { if (onMove) { e.preventDefault(); setOver(i); } }} onDragLeave={() => setOver((o) => (o === i ? null : o))} onDrop={(e) => { setOver(null); const raw = e.dataTransfer.getData("text/plain"); const [trig, fromDow] = raw.split("|"); if (!onMove || !trig) return; const t = triggers.find((x) => (x.id ?? x.cron) === trig); const c = t?.cron ? moveCron(t.cron, Number(fromDow), d.date.getDay()) : null; if (c) { e.preventDefault(); onMove(trig, c); } }} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 5, borderRadius: 10, outline: over === i ? "1px dashed #4d8dff" : "none", outlineOffset: 2 }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: i === 0 ? C.fg : C.dim, textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 8, padding: "3px 4px" }}>{d.date.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()} {d.date.getDate()}</div>
          {d.cards.map((c, k) => { const isNext = next === c; return <div key={k} data-testid={`week-card-${i}-${k}`} data-next={isNext ? "1" : "0"} draggable={!!onMove && c.count === 1} onDragStart={(e) => { e.dataTransfer.setData("text/plain", `${c.trigger}|${d.date.getDay()}`); e.dataTransfer.effectAllowed = "move"; }} title={onMove && c.count === 1 ? `${c.ask}\n(drag to another day to move this run)` : c.ask} style={{ border: `1px solid ${isNext ? "color-mix(in srgb, #3ecf8e 55%, var(--c-border))" : "var(--c-border)"}`, borderRadius: 11, padding: "6px 8px", fontSize: 12, background: "var(--c-panel2, var(--c-panel))", minWidth: 0 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}><b style={{ fontFamily: mono, fontWeight: 500 }}>{c.count > 1 ? `${c.count} runs` : hhmm(c.at)}</b>{isNext && <span style={{ color: "#3ecf8e", fontSize: 10.5 }}>next</span>}</div>
            <div style={{ color: C.muted, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.ask || c.label}</div></div>; })}
        </div>)}
      </div>
    </div>
  );
}
