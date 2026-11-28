// THE AGENT'S QUEUE (operator 2026-11-26: "a queue icon: floating on the right, glassy over the chat or terminal, the tasks done, doing and todo; not kanban, a simple list"). The agent's own list first (what it
// keeps, or its CLI's), then what the person asked of it. Read only while the window is open.
import * as React from "react";
import { apiGet } from "@/loki/api/client";
import { C, nav } from "@/loki/theme";

export type QueueState = "done" | "doing" | "todo";
export type QueueItem = { text: string; state: QueueState };
export type Queue = { plan: QueueItem[]; asks: QueueItem[] };
const items = (x: unknown): QueueItem[] => (Array.isArray(x) ? x : []).filter((i: any) => i && typeof i.text === "string").map((i: any) => ({ text: i.text, state: i.state === "done" || i.state === "doing" ? i.state : "todo" }));
/** The serve's answer, or null when it cannot say. Pure. */
export function parseQueue(r: any): Queue | null { const d = r?.result ?? r; return d?.ok === true ? { plan: items(d.plan), asks: items(d.asks) } : null; }
/** What is being done and what is left come first to the eye; the finished stay above them in order, the oldest dropped past eight. Pure. */
export function trimDone(list: QueueItem[], keep = 8): { shown: QueueItem[]; hidden: number } {
  const done = list.filter((i) => i.state === "done"); const hidden = Math.max(0, done.length - keep); let skip = hidden;
  return { shown: list.filter((i) => !(i.state === "done" && skip-- > 0)), hidden };
}

/** CLEARED BY THE PERSON (2026-11-27: "a button to clear, to hide the current tasks"): how many of each text were on screen then, per section. Nothing is deleted: the agent's own list is its own. */
export type Cleared = Record<string, number>;
const keyOf = (section: "plan" | "asks", text: string) => `${section}|${text}`;
/** What the queue shows after a clear: the first so-many of each text are left out, so one asked again later is seen. Pure. */
export function uncleared(q: Queue, cleared: Cleared): { queue: Queue; hidden: number } {
  let hidden = 0; const pick = (section: "plan" | "asks") => { const left: Cleared = { ...cleared }; return q[section].filter((i) => { const k = keyOf(section, i.text); if ((left[k] ?? 0) > 0) { left[k] -= 1; hidden += 1; return false; } return true; }); };
  return { queue: { plan: pick("plan"), asks: pick("asks") }, hidden };
}
/** Everything listed now, as cleared. Pure. */
export function clearAll(q: Queue): Cleared { const out: Cleared = {}; for (const section of ["plan", "asks"] as const) for (const i of q[section]) { const k = keyOf(section, i.text); out[k] = (out[k] ?? 0) + 1; } return out; }
const clearedKey = (paneId: number) => `antiloki.queue.cleared.${paneId}`;
const readCleared = (paneId: number): Cleared => { try { const v = JSON.parse(localStorage.getItem(clearedKey(paneId)) ?? "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; } };
function Mark({ state }: { state: QueueState }) {
  const color = state === "done" ? C.ok : state === "doing" ? C.brand : C.muted;
  return (
    <svg data-state={state} viewBox="0 0 16 16" width="13" height="13" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label={state === "todo" ? "to do" : state} role="img" style={{ flexShrink: 0, marginTop: 2, animation: state === "doing" ? "antilokiDotPulse 1.2s ease-in-out infinite" : "none" }}>
      {state === "done" ? <path d="M3 8.5l3.2 3L13 4.5" /> : state === "doing" ? <><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2" fill={color} /></> : <circle cx="8" cy="8" r="5.5" />}
    </svg>);
}
function Section({ title, list }: { title: string; list: QueueItem[] }) {
  const [all, setAll] = React.useState(false); const { shown, hidden } = all ? { shown: list, hidden: 0 } : trimDone(list);
  if (!list.length) return null;
  return (
    <section style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{title} · {list.filter((i) => i.state === "done").length}/{list.length}</div>
      {hidden > 0 && <button data-testid="queue-earlier" onClick={() => setAll(true)} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: nav, fontSize: 11.5, padding: "2px 0" }}>{hidden} earlier done</button>}
      {shown.map((i, n) => (
        <div key={n} data-testid="queue-item" data-state={i.state} title={i.text} style={{ display: "flex", gap: 8, padding: "3px 0", alignItems: "flex-start", color: i.state === "done" ? C.muted : C.fg, fontWeight: i.state === "doing" ? 600 : 400 }}>
          <Mark state={i.state} /><span style={{ minWidth: 0, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{i.text}</span>
        </div>))}
    </section>);
}

export function TaskQueuePanel({ paneId, onClose, everyMs = 3000 }: { paneId: number; onClose: () => void; everyMs?: number }) {
  const [q, setQ] = React.useState<Queue | null>(null); const [asked, setAsked] = React.useState(false);
  const [cleared, setCleared] = React.useState<Cleared>(() => readCleared(paneId));
  const keep = (c: Cleared) => { setCleared(c); try { localStorage.setItem(clearedKey(paneId), JSON.stringify(c)); } catch { /* it stays cleared while the window is open */ } };
  const seen = q ? uncleared(q, cleared) : null;
  const link: React.CSSProperties = { background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: nav, fontSize: 11.5, padding: "2px 6px" };
  React.useEffect(() => {
    let stop = false; let t: ReturnType<typeof setTimeout>;
    const tick = async () => { if (!(typeof document !== "undefined" && document.hidden)) { let next: Queue | null = null; try { next = parseQueue(await apiGet(`/api/v1/cockpit/pane/queue?pane_id=${paneId}`)); } catch { next = null; } if (stop) return; if (next) setQ(next); setAsked(true); } t = setTimeout(() => void tick(), everyMs); };
    void tick(); return () => { stop = true; clearTimeout(t); };
  }, [paneId, everyMs]);
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div data-testid={`queue-panel-${paneId}`} role="dialog" aria-label="the queue of this agent" onMouseDown={(e) => e.stopPropagation()}
      style={{ position: "absolute", top: 36, right: 8, zIndex: 30, width: 300, maxWidth: "calc(100% - 16px)", maxHeight: "calc(100% - 48px)", overflowY: "auto", boxSizing: "border-box", padding: "8px 12px 10px", borderRadius: 12, border: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.panel} 72%, transparent)`, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", fontFamily: nav, fontSize: 12.5, lineHeight: 1.45, cursor: "default" }}>
      <div style={{ display: "flex", alignItems: "center" }}><b style={{ fontWeight: 600, color: C.fg }}>Queue</b><span style={{ flex: 1 }} />{q && seen && seen.queue.plan.length + seen.queue.asks.length > 0 && <button data-testid="queue-clear" title="hide the tasks shown now; new ones still appear" onClick={() => keep(clearAll(q))} style={link}>Clear</button>}<button data-testid="queue-close" aria-label="close the queue" onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 12 }}>✕</button></div>
      {!q && <div style={{ color: C.muted, marginTop: 6 }}>{asked ? "The queue cannot be read right now." : "reading…"}</div>}
      {seen && !seen.queue.plan.length && !seen.queue.asks.length && <div data-testid="queue-empty" style={{ color: C.muted, marginTop: 6 }}>{seen.hidden ? "Cleared." : "Nothing asked yet."}</div>}
      {seen && <><Section title="Plan" list={seen.queue.plan} /><Section title="Your asks" list={seen.queue.asks} /></>}
      {seen && seen.hidden > 0 && <button data-testid="queue-show-cleared" onClick={() => keep({})} style={{ ...link, padding: "8px 0 0" }}>show {seen.hidden} cleared</button>}
    </div>);
}
export function QueueButton({ open, onToggle, style }: { open: boolean; onToggle: () => void; style: React.CSSProperties }) {
  const label = open ? "close the queue" : "show the queue";
  return (
    <button data-testid="queue-button" aria-label={label} aria-pressed={open} title={label} onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ ...style, color: open ? C.fg : C.muted }}>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "block" }}><path d="M3 6l1.5 1.5L7 5M3 12.5L4.5 14 7 11.5M3.5 19h2M11 6h10M11 12.5h10M11 19h10" /></svg>
    </button>);
}
