import * as React from "react";
import { C } from "@/loki/theme";
import { actorLabel, ago, filterTrail, fmtMs, fmtTokens, fmtUsd, isHuman, kindLook, nextStatus, STATUS_WORD, TRAIL_FILTERS, trailCounts, type Ev, type Rollup, type Status } from "./model";
import { ModelIcon, Who, isSeat } from "./model-icon";

export const font = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const COLOR: Record<Status, string> = { todo: C.muted, doing: C.warn, done: C.ok, failed: C.bad, canceled: C.muted };

/** Linear's circle for a status: empty, half, checked, crossed, struck. */
export function StatusIcon({ status, size = 16, onClick, title }: { status: Status; size?: number; onClick?: () => void; title?: string }) {
  const col = COLOR[status];
  // A CLICKABLE ICON SAYS WHERE THE CLICK GOES, EVERYWHERE IT IS DRAWN (Grokbot QA round 2, item 11: only the episode row's icon had it; the steps and the episode page showed the current status alone)
  const word = onClick ? `${STATUS_WORD[status]} → ${STATUS_WORD[nextStatus(status)]} (click)` : STATUS_WORD[status];
  return (
    <svg data-testid={`status-${status}`} width={size} height={size} viewBox="0 0 16 16" onClick={onClick} role={onClick ? "button" : "img"} aria-label={title ?? word}
      style={{ flex: "0 0 auto", cursor: onClick ? "pointer" : "default" }}>
      <title>{title ?? word}</title>
      <circle cx="8" cy="8" r="6.2" fill="none" stroke={col} strokeWidth="1.6" strokeDasharray={status === "todo" ? "2.2 2.2" : undefined} />
      {status === "doing" && <path d="M8 8 L8 3.2 A4.8 4.8 0 0 1 8 12.8 Z" fill={col} />}
      {status === "done" && <><circle cx="8" cy="8" r="6.2" fill={col} /><path d="M5 8.2l2 2 4-4.2" fill="none" stroke="var(--c-bg, #111)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></>}
      {status === "failed" && <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke={col} strokeWidth="1.6" strokeLinecap="round" />}
      {status === "canceled" && <path d="M5 11L11 5" stroke={col} strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

/** A small round mark for whoever did or owns something: the first letter, human or agent told apart by colour. */
export function Actor({ name, size = 18 }: { name: string; size?: number }) {
  const who = name || "";
  const human = isHuman(who);
  return (
    <span title={actorLabel(who)} style={{ display: "inline-grid", placeItems: "center", width: size, height: size, borderRadius: human ? "50%" : 5, background: who ? (human ? C.brand : C.panel2) : "transparent", border: who ? "none" : `1px dashed ${C.border}`, color: human ? "#fff" : C.fg, fontSize: size * 0.55, fontWeight: 600, flex: "0 0 auto" }}>
      {who ? who.slice(0, 1).toUpperCase() : ""}
    </span>
  );
}

export function Meter({ r }: { r: Rollup | undefined }) {
  if (!r) return null;
  return (
    <div data-testid="telemetry" style={{ display: "grid", gap: 8 }}>
      <Row k="time" v={fmtMs(r.ms)} /><Row k="cost" v={fmtUsd(r.usd)} /><Row k="tokens" v={fmtTokens(r.tokens)} />
      <Row k="models">{Object.keys(r.seats).length ? <Seats seats={r.seats} /> : "—"}</Row>
    </div>
  );
}
export function Row({ k, v, children }: { k: string; v?: React.ReactNode; children?: React.ReactNode }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}><span style={{ color: C.muted }}>{k}</span><span style={{ color: C.fg, textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{children ?? v}</span></div>;
}

/** WHO DID WHAT, in order (newest first). Every line names its actor; an agent's line carries the seat it ran on. */
export function Trail({ events, episodeTitles }: { events: Ev[]; episodeTitles?: Record<number, string> }) {
  const [filter, setFilter] = React.useState("all");
  const [open, setOpen] = React.useState<Set<number>>(new Set());
  if (!events.length) return <div style={{ color: C.muted, fontSize: 13 }}>nothing has happened yet.</div>;
  const counts = trailCounts(events);
  // the filter chips appear once a trail holds what hooks and MCP leave (a trail of plain statuses has nothing to filter)
  const rich = TRAIL_FILTERS.some((f) => f.kinds && counts[f.key] > 0);
  const shown = filterTrail(events, filter);
  const tone = (t: string) => ({ brand: C.brand, ok: C.ok, bad: C.bad, warn: C.warn, muted: C.muted, fg: C.fg } as Record<string, string>)[t] ?? C.muted;
  return (
    <>
      {rich && (
        <div data-testid="trail-filters" style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "-4px 0 12px" }}>
          {TRAIL_FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0).map((f) => (
            <button key={f.key} data-testid={`trail-filter-${f.key}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
              style={{ ...btn, padding: "2px 9px", fontSize: 12, borderColor: filter === f.key ? C.brand : C.border, color: filter === f.key ? C.brand : C.muted }}>{f.label} <span style={{ opacity: 0.7 }}>{counts[f.key]}</span></button>
          ))}
        </div>
      )}
      <ol data-testid="trail" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {shown.map((e) => {
          const look = kindLook(e.kind);
          const long = look?.quote && e.text.length > 220; const expanded = open.has(e.id);
          return (
            <li key={e.id} data-kind={e.kind} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13 }}>
              {isSeat(e.actor) ? <Who assignee={e.actor} status={/→ failed|failed/.test(e.text) ? "failed" : "done"} size={18} /> : <Actor name={e.actor} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                {look ? (
                  <>
                    <span data-testid="trail-tag" style={{ fontSize: 10.5, letterSpacing: "0.04em", textTransform: "uppercase", color: tone(look.tone), border: `1px solid ${tone(look.tone)}`, borderRadius: 4, padding: "0 5px", marginRight: 7, opacity: 0.9 }}>{look.tag}</span>
                    <span style={{ color: look.tone === "bad" ? C.bad : look.quote ? C.dim : C.fg, fontFamily: look.mono ? 'ui-monospace, "JetBrains Mono", monospace' : undefined, fontSize: look.mono ? 12 : 13, fontStyle: look.quote ? "italic" : undefined, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                      {long && !expanded ? `${e.text.slice(0, 220)}…` : e.text}
                    </span>
                    {long && <button onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })} style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontSize: 12, padding: "0 6px" }}>{expanded ? "less" : "more"}</button>}
                  </>
                ) : (
                  <>
                    <span style={{ color: C.fg, fontWeight: 500 }}>{actorLabel(e.actor)}</span>{" "}
                    <span style={{ color: C.dim }}>{e.text}</span>
                  </>
                )}
                {e.task_id != null && episodeTitles?.[e.task_id] && !String(e.text).includes(episodeTitles[e.task_id]) && <span style={{ color: C.muted }}> · {episodeTitles[e.task_id]}</span>}
              </div>
              <span title={new Date(e.t_ms).toLocaleString()} style={{ color: C.muted, fontSize: 12, whiteSpace: "nowrap" }}>{ago(e.t_ms)}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** The models that did the work of a set of episodes: one icon each, with how many episodes it took (`engine:model` keys, as the serve rolls them up). */
export function Seats({ seats, size = 18 }: { seats: Record<string, number>; size?: number }) {
  return (
    <span data-testid="seats" style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {Object.entries(seats).map(([s, n]) => <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><ModelIcon seat={s} size={size} />{n > 1 && <span style={{ fontSize: 11, color: C.muted }}>×{n}</span>}</span>)}
    </span>
  );
}

export const btn: React.CSSProperties = { fontFamily: font, fontSize: 13, background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 7, padding: "4px 11px", cursor: "pointer" };
export const primary: React.CSSProperties = { ...btn, background: C.brand, borderColor: C.brand, color: "#fff" };
export const input: React.CSSProperties = { fontFamily: font, fontSize: 14, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 10px", outline: "none", width: "100%" };
