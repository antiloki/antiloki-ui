// PAUSE AND CONTINUE (operator 2026-11-26): the serve's watcher pauses a working agent when RAM or VRAM is nearly full (the numbers of the machine window) and continues it when there is room; the person can do
// both by hand. One poll for the whole screen, however many panes ask (the browser's six connections).
import * as React from "react";
import { apiGet, apiPost } from "@/loki/api/client";
import { C, nav } from "@/loki/theme";

export type PausedAgent = { paneId: number; by: "person" | "watcher"; why: string };
/** The serve's answer; anything unreadable is "nothing paused". Pure. */
export function parsePaused(r: any): PausedAgent[] {
  const d = r?.result ?? r; if (!d || d.ok !== true || !Array.isArray(d.paused)) return [];
  return d.paused.filter((p: any) => p && Number(p.pane_id) > 0).map((p: any) => ({ paneId: Number(p.pane_id), by: p.by === "person" ? "person" : "watcher", why: String(p.why ?? "") }));
}

export type Mail = { id: number; from: string; fromPane: number; to: string; paneId: number; text: string };
export type BrowserAsk = { id: number; host: string; what: string };
export type Estimate = { tokensLow: number; tokensHigh: number; usdLow: number; usdHigh: number; secsLow: number; secsHigh: number };
export type GroupRow = { id: number; paneId: number; status: string; goal: string; why: string; members: string[]; /** member -> the files it may change */ write: Record<string, string[]>; /** websites the members may read */ sites: string[]; /** how far a scope may later be widened */ limit?: string[]; turns: number; turnsUsed: number; tokens: number; usd: number; estimate: Estimate };
export type Watch = { paused: PausedAgent[]; mail: Mail[]; asks: BrowserAsk[]; control: { profile: string; hosts: string[] }[]; groupsOn: number[]; groups: GroupRow[]; long?: { paneId: number; minutes: number; model: string }[] };
const NOTHING: Watch = { paused: [], mail: [], asks: [], control: [], groupsOn: [], groups: [] };
/** One group as the serve tells it. Pure. */
export function parseGroup(g: any): GroupRow {
  const e = g?.estimate ?? {}; const n = (x: unknown) => Number(x) || 0;
  return { id: n(g?.id), paneId: n(g?.pane_id), status: String(g?.status ?? ""), goal: String(g?.goal ?? ""), why: String(g?.why ?? ""), members: Array.isArray(g?.members) ? g.members.map(String) : [], sites: Array.isArray(g?.sites) ? g.sites.map(String) : [], limit: Array.isArray(g?.limit) ? g.limit.map(String) : [],
    write: Object.fromEntries(Object.entries(g?.write && typeof g.write === "object" ? g.write : {}).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : []]).filter(([, v]) => v.length > 0)), turns: n(g?.turns), turnsUsed: n(g?.turns_used), tokens: n(g?.tokens), usd: n(g?.usd),
    estimate: { tokensLow: n(e.tokens_low), tokensHigh: n(e.tokens_high), usdLow: n(e.usd_low), usdHigh: n(e.usd_high), secsLow: n(e.secs_low), secsHigh: n(e.secs_high) } };
}
/** Everything the one poll brings; anything unreadable is nothing. Pure. */
export function parseWatch(r: any): Watch {
  const d = r?.result ?? r; if (!d || d.ok !== true) return NOTHING; const list = (x: unknown): any[] => (Array.isArray(x) ? x.filter(Boolean) : []);
  return { paused: parsePaused(d),
    mail: list(d.mail).filter((m) => Number(m.id) > 0).map((m) => ({ id: Number(m.id), from: String(m.from ?? ""), fromPane: Number(m.from_pane) || 0, to: String(m.to ?? ""), paneId: Number(m.pane_id) || 0, text: String(m.text ?? "") })),
    asks: list(d.browser_asks).filter((a) => Number(a.id) > 0).map((a) => ({ id: Number(a.id), host: String(a.host ?? ""), what: String(a.what ?? "") })),
    control: list(d.browser_control).map((c) => ({ profile: String(c.profile ?? ""), hosts: list(c.hosts).map(String) })),
    groupsOn: list(d.groups?.on).map(Number), groups: list(d.groups?.list).map(parseGroup).filter((g) => g.id > 0),
    long: list(d.long_local).map((x) => ({ paneId: Number(x.pane_id) || 0, minutes: Number(x.minutes) || 0, model: String(x.model ?? "") })).filter((x) => x.paneId > 0) };
}

const EVERY_MS = 4000;
let seen: Watch = NOTHING;
let timer: ReturnType<typeof setInterval> | null = null;
const subs = new Set<() => void>();
async function read() {
  try {
    const next = parseWatch(await apiGet("/api/v1/cockpit/watch"));
    if (JSON.stringify(next) !== JSON.stringify(seen)) { seen = next; subs.forEach((f) => f()); }
  } catch { /* the serve is restarting: what was shown stays */ }
}
function subscribe(f: () => void) {
  subs.add(f);
  if (!timer) { void read(); timer = setInterval(() => { if (!(typeof document !== "undefined" && document.hidden)) void read(); }, EVERY_MS); }
  return () => { subs.delete(f); if (!subs.size && timer) { clearInterval(timer); timer = null; } };
}
export const useWatch = (): Watch => React.useSyncExternalStore(subscribe, () => seen, () => seen);
export const usePaused = (): PausedAgent[] => useWatch().paused;
export async function answer(path: string, body: unknown): Promise<string> {
  const r: any = await apiPost(path, body).catch(() => null); await read(); const d = r?.result ?? r; return d?.ok ? "" : String(d?.error ?? "the serve could not be reached");
}

const small: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 8, padding: "2px 10px", fontFamily: nav, fontSize: 12, cursor: "pointer", flexShrink: 0 };
/** Messages that wait: for this agent (it is busy), or sent by it to somebody who is not running. */
export function MailBar({ paneId }: { paneId: number }) {
  const mail = useWatch().mail.filter((m) => m.paneId === paneId || (m.paneId === 0 && m.fromPane === paneId)); const [error, setError] = React.useState("");
  if (!mail.length) return null;
  const m = mail[0]; const mine = m.paneId === paneId;
  return (
    <div data-testid={`mail-bar-${paneId}`} role="status" title={m.text} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 10px", fontFamily: nav, fontSize: 12.5, color: C.fg, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
      <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{error || (mine ? `Message from ${m.from} waits until this agent is idle: ${m.text}` : `Your message to ${m.to} waits until it is opened: ${m.text}`)}{mail.length > 1 ? ` (+${mail.length - 1} more)` : ""}</span>
      {mine && <button data-testid={`mail-deliver-${m.id}`} style={small} onClick={(e) => { e.stopPropagation(); void answer("/api/v1/cockpit/mail", { id: m.id, op: "deliver" }).then(setError); }}>Deliver now</button>}
      <button data-testid={`mail-cancel-${m.id}`} style={small} onClick={(e) => { e.stopPropagation(); void answer("/api/v1/cockpit/mail", { id: m.id, op: "cancel" }).then(setError); }}>Discard</button>
    </div>);
}
/** The browser's questions to the person, and the way to stop agents acting in it. */
export function BrowserCards() {
  const { asks, control } = useWatch();
  const card: React.CSSProperties = { background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 92%, transparent)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", fontFamily: nav };
  return (<>
    {asks.map((a) => (
      <div key={a.id} data-testid="toast-browser" role="alertdialog" aria-label={`the browser asks about ${a.host}`} style={card}>
        <div style={{ fontSize: 13, color: C.fg, fontWeight: 600 }}>An agent asks, in the browser</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5, overflowWrap: "anywhere" }}>May it {a.what.replace(/^let agents /, "")}?</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button data-testid="toast-browser-allow" style={{ ...small, color: "#3ecf8e", borderColor: "#3ecf8e55" }} onClick={() => void answer("/api/v1/cockpit/browser", { id: a.id, op: "allow" })}>Allow</button>
          <button data-testid="toast-browser-deny" style={small} onClick={() => void answer("/api/v1/cockpit/browser", { id: a.id, op: "deny" })}>No</button>
        </div>
      </div>))}
    {control.map((c) => (
      <div key={c.profile} data-testid="toast-browser-control" style={{ ...card, display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: C.muted, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>Agents may click and type on {c.hosts.join(", ")}</span>
        <button data-testid="toast-browser-stop" style={small} onClick={() => void answer("/api/v1/cockpit/browser", { op: "stop", profile: c.profile })}>Stop</button>
      </div>))}
  </>);
}

/** Returns why it could not, or "" when it did. */
export async function setPaused(paneId: number, pause: boolean): Promise<string> {
  return answer("/api/v1/cockpit/watch", { pane_id: paneId, op: pause ? "pause" : "resume" });
}

export function PauseButton({ paneId, style }: { paneId: number; style: React.CSSProperties }) {
  const on = usePaused().some((p) => p.paneId === paneId); const label = on ? "continue this agent" : "pause this agent";
  return (
    <button data-testid={`pause-${paneId}`} aria-label={label} aria-pressed={on} title={label} onClick={(e) => { e.stopPropagation(); void setPaused(paneId, !on); }} style={{ ...style, color: on ? C.warn : C.muted }}>
      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden style={{ display: "block" }} fill="currentColor">{on ? <path d="M7 4l13 8-13 8z" /> : <path d="M6 4h4v16H6zM14 4h4v16h-4z" />}</svg>
    </button>);
}
/** A local model writing for a long time: said on its pane, with the way to stop it. "Leave it" hides the line for this run. */
export function LongLocalBar({ paneId }: { paneId: number }) {
  const w = useWatch(); const hit = (w.long ?? []).find((x) => x.paneId === paneId); const paused = w.paused.some((p) => p.paneId === paneId); const [left, setLeft] = React.useState(false);
  React.useEffect(() => { if (!hit) setLeft(false); }, [hit]);
  if (!hit || paused || left) return null;
  return (
    <div data-testid={`long-bar-${paneId}`} role="status" style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 10px", fontFamily: nav, fontSize: 12.5, color: C.fg, borderBottom: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.warn} 12%, transparent)`, flexShrink: 0 }}>
      <span style={{ minWidth: 0, flex: 1 }}>The local model {hit.model} has been working for {hit.minutes} minutes.</span>
      <button data-testid={`long-pause-${paneId}`} style={small} onClick={(e) => { e.stopPropagation(); void setPaused(paneId, true); }}>Pause it</button>
      <button data-testid={`long-leave-${paneId}`} style={small} onClick={(e) => { e.stopPropagation(); setLeft(true); }}>Leave it</button>
    </div>);
}
/** The line under a paused pane's bar: why, and the way on. */
export function PausedBar({ paneId, name }: { paneId: number; name?: string }) {
  const p = usePaused().find((x) => x.paneId === paneId); const [error, setError] = React.useState("");
  if (!p) return null;
  return (
    <div data-testid={`paused-bar-${paneId}`} role="status" style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 10px", fontFamily: nav, fontSize: 12.5, color: C.fg, borderBottom: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.warn} 12%, transparent)`, flexShrink: 0 }}>
      <span style={{ minWidth: 0, flex: 1 }}>{name ? <b style={{ fontWeight: 600 }}>{name}: </b> : null}{error || (p.by === "person" ? "Paused by you." : `Paused: ${p.why}. It continues by itself when there is room.`)}</span>
      <button data-testid={`paused-continue-${paneId}`} onClick={(e) => { e.stopPropagation(); void setPaused(paneId, false).then(setError); }} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 8, padding: "2px 10px", fontFamily: nav, fontSize: 12, cursor: "pointer" }}>Continue</button>
    </div>);
}
