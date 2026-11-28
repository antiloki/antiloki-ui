// GROUPS (RFC 0025, operator 2026-11-26): the button on an agent's bar (off by default; only then may it propose a group), the card where the person approves or refuses with the estimate in front of them, and
// the group's pane: the conversation, read-only, inside the coloured border.
import * as React from "react";
import { apiGet } from "@/loki/api/client";
import { C, mono, nav } from "@/loki/theme";
import { Markdown } from "@/loki/components/Markdown";
import { SpecialistAvatar } from "./SpecialistAvatar";
import { answer, parseGroup, useWatch, type Estimate, type GroupRow } from "@/loki/cockpit/pane-watch";

export const OPEN_GROUP = "antiloki:open-group";
const COLORS = ["#3ecf8e", "#4d8dff", "#e08fd0", "#f5a524"];
const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const money = (n: number) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;
const mins = (s: number) => (s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);
/** The estimate in words: a range, never one number. Pure. */
export const estimateWords = (e: Estimate): string => `about ${k(e.tokensLow)} to ${k(e.tokensHigh)} tokens · ${money(e.usdLow)} to ${money(e.usdHigh)} at list price · ${mins(e.secsLow)} to ${mins(e.secsHigh)}`;

const CSS = `@keyframes grp-hop{0%,70%,100%{opacity:.35;transform:scale(.8)}25%{opacity:1;transform:scale(1.25)}}
@keyframes grp-orbit{to{transform:rotate(360deg)}}@property --grp-ang{syntax:"<angle>";initial-value:0deg;inherits:false}@keyframes grp-turn{to{--grp-ang:360deg}}
.grp-on .grp-dot{transform-origin:center;transform-box:fill-box;animation:grp-hop 1.8s ease-in-out infinite}
.grp-on .grp-orbit{transform-origin:12px 12px;animation:grp-orbit 9s linear infinite}.grp-busy .grp-dot{animation-duration:.9s}.grp-busy .grp-orbit{animation-duration:2.4s}
.grp-ring::before{content:"";position:absolute;inset:0;z-index:50;border-radius:inherit;padding:2px;pointer-events:none;background:conic-gradient(from var(--grp-ang),#3ecf8e,#4d8dff,#e08fd0,#f5a524,#3ecf8e);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.grp-ring.grp-live::before{animation:grp-turn 3.2s linear infinite}
@media (prefers-reduced-motion:reduce){.grp-on .grp-dot,.grp-on .grp-orbit,.grp-ring.grp-live::before{animation:none}}`;

/** Three agents on an orbit: grey and still when groups are off; they take turns lighting up when on, faster while a group runs. */
export function GroupIcon({ on, busy }: { on: boolean; busy?: boolean }) {
  const dots = [[12, 4], [19, 16], [5, 16]] as const;
  return (
    <svg className={on ? `grp-on${busy ? " grp-busy" : ""}` : ""} viewBox="0 0 24 24" width="15" height="15" aria-hidden style={{ display: "block", overflow: "visible" }}>
      <circle className="grp-orbit" cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3.5 4.9" opacity={on ? 0.8 : 0.5} />
      {dots.map(([x, y], i) => <circle key={i} className="grp-dot" cx={x} cy={y} r="3.2" fill={on ? COLORS[i] : "currentColor"} style={{ animationDelay: `${i * 0.6}s` }} />)}
    </svg>);
}
export function GroupButton({ paneId, style }: { paneId: number; style: React.CSSProperties }) {
  const w = useWatch(); const on = w.groupsOn.includes(paneId); const g = w.groups.find((x) => x.paneId === paneId); const busy = g?.status === "active";
  const showable = on && !!g && g.status !== "proposed" && g.status !== "denied";
  const label = !on ? "groups are off: click to let this agent propose a group" : showable ? "open the group's conversation" : "groups are on: click to turn them off";
  // A CLICK NEVER ENDS A GROUP (2026-11-26: a running group was turned off from its button): with a conversation to show it only opens it; off is in that pane
  const toggle = () => void answer("/api/v1/cockpit/groups", { op: on ? "off" : "on", pane_id: paneId });
  return (<>
    <style>{CSS}</style>
    <button data-testid="group-button" data-on={on ? "1" : "0"} aria-label={label} aria-pressed={on} title={label} style={{ ...style, color: on ? C.fg : C.muted }}
      onClick={(e) => { e.stopPropagation(); if (showable) window.dispatchEvent(new CustomEvent(OPEN_GROUP, { detail: { paneId, group: g!.id } })); else toggle(); }}><GroupIcon on={on} busy={busy} /></button>
  </>);
}

const small: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 8, padding: "4px 12px", fontFamily: nav, fontSize: 12, cursor: "pointer" };
/** THE BORDER IS THE PANE'S OWN, around its bar too (operator 2026-11-26: "has that border, but is internal, should be external"), turning while the group runs. */
export function useGroupRing(group: number | undefined): { className: string; style: React.CSSProperties } | null {
  const w = useWatch(); if (!group) return null;
  const live = w.groups.some((g) => g.id === group && g.status === "active");
  return { className: `grp-ring${live ? " grp-live" : ""}`, style: { border: "none", padding: 0 } };
}
export const GroupStyle = () => <style>{CSS}</style>;
/** The question to the person: who, why, and what it will cost. Nothing starts before Create. */
export function GroupCards() {
  const asks = useWatch().groups.filter((g) => g.status === "proposed"); const [error, setError] = React.useState("");
  return (<>
    {asks.map((g) => (
      <div key={g.id} data-testid="toast-group" role="alertdialog" aria-label="create a group?" style={{ background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 94%, transparent)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", fontFamily: nav }}>
        <div style={{ fontSize: 13, color: C.fg, fontWeight: 600 }}>Create a group?</div>
        <div style={{ fontSize: 12.5, color: C.fg, marginTop: 4, lineHeight: 1.5, overflowWrap: "anywhere" }}>{g.goal}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>Why: {g.why}<br />With {g.members.join(", ")} · at most {g.turns} {g.turns === 1 ? "turn" : "turns"}</div>
        {/* WHAT THE YES ALLOWS, said before it (operator 2026-11-26: a scope for each one; the person may name websites) */}
        <div data-testid="group-may" style={{ fontSize: 12, color: C.fg, marginTop: 6, lineHeight: 1.5, overflowWrap: "anywhere" }}>
          {Object.keys(g.write ?? {}).length === 0 ? <div>Members only read the project: they change no files.</div> : Object.entries(g.write).map(([who, globs]) => <div key={who}><b style={{ fontWeight: 600 }}>{who}</b> may change <span style={{ fontFamily: mono }}>{globs.join(", ")}</span></div>)}
          {(g.limit ?? []).length > 0 && <div>The orchestrator may later add files within <span style={{ fontFamily: mono }}>{g.limit!.join(", ")}</span></div>}
          {(g.sites ?? []).length > 0 && <div>Members may read <span style={{ fontFamily: mono }}>{g.sites.join(", ")}</span> <span style={{ color: C.muted }}>(Claude members are held to these; other providers keep their own web access)</span></div>}
        </div>
        <div data-testid="toast-group-estimate" style={{ fontSize: 12, color: C.warn, marginTop: 6, lineHeight: 1.5, fontFamily: mono }}>{estimateWords(g.estimate)}</div>
        <div style={{ fontSize: 11.5, color: C.dim, marginTop: 4 }}>An estimate, not a promise. On a subscription it counts against your limits.</div>
        {error && <div style={{ fontSize: 12, color: C.bad, marginTop: 4 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button data-testid="toast-group-approve" style={{ ...small, color: "#3ecf8e", borderColor: "#3ecf8e55" }} onClick={() => void answer("/api/v1/cockpit/groups", { op: "approve", id: g.id }).then(setError)}>Create the group</button>
          <button data-testid="toast-group-deny" style={small} onClick={() => void answer("/api/v1/cockpit/groups", { op: "deny", id: g.id }).then(setError)}>No, do it without a group</button>
        </div>
      </div>))}
  </>);
}

export type GroupLine = { t: number; from: string; to: string; kind: string; text: string };
/** The group and its record from the serve, or null. Pure. */
export function parseRecord(r: any): { group: GroupRow; log: GroupLine[] } | null {
  const d = r?.result ?? r; if (d?.ok !== true || !d.group) return null;
  return { group: parseGroup(d.group), log: (Array.isArray(d.group.log) ? d.group.log : []).map((l: any) => ({ t: Number(l.t_ms) || 0, from: String(l.from ?? ""), to: String(l.to ?? ""), kind: String(l.kind ?? ""), text: String(l.text ?? "") })) };
}
/** A long answer is folded to this height until the person opens it. */
const FOLD_PX = 260;
const FOLD_CHARS = 900;
function Bubble({ name, id, color, mine, time, text, kind, to }: { name: string; id: string; color: string; mine: boolean; time: string; text: string; kind: string; to?: string }) {
  const long = text.length > FOLD_CHARS; const [open, setOpen] = React.useState(false);
  return (
    <div data-testid="group-line" data-kind={kind} data-side={mine ? "right" : "left"} style={{ display: "flex", flexDirection: mine ? "row-reverse" : "row", gap: 8, alignItems: "flex-start", marginBottom: 14 }}>
      <span aria-hidden style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, display: "grid", placeItems: "center", background: `color-mix(in srgb, ${color} 18%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 45%, transparent)` }}>
        {mine ? <GroupIcon on /> : <SpecialistAvatar id={id} size={20} />}
      </span>
      <div style={{ minWidth: 0, maxWidth: "calc(100% - 44px)", display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", gap: 3 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color }}>{name}{to ? <span style={{ color: C.muted, fontWeight: 400 }}> to {to}</span> : null}<span style={{ color: C.dim, fontWeight: 400, marginLeft: 8, fontFamily: mono, fontSize: 10.5 }}>{time}</span></div>
        <div style={{ position: "relative", maxWidth: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: mine ? "14px 4px 14px 14px" : "4px 14px 14px 14px", background: `color-mix(in srgb, ${color} ${mine ? 14 : 8}%, ${C.panel})`, border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`, color: kind === "error" ? C.bad : C.fg, fontSize: 13, lineHeight: 1.55, overflowWrap: "anywhere" }}>
          <div style={{ maxHeight: long && !open ? FOLD_PX : undefined, overflow: long && !open ? "hidden" : "auto", ...(long && !open ? { WebkitMaskImage: "linear-gradient(#000 70%, transparent)", maskImage: "linear-gradient(#000 70%, transparent)" } : {}) }}><Markdown text={text} /></div>
          {long && <button data-testid="group-more" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ background: "transparent", border: "none", color, cursor: "pointer", fontFamily: nav, fontSize: 12, fontWeight: 600, padding: "6px 0 0" }}>{open ? "show less" : "show all"}</button>}
        </div>
      </div>
    </div>);
}
const DECIDED: Record<string, string> = { active: "You created the group", denied: "You refused the group", stopped: "You stopped the group" };
/** The group's pane: read only, each agent in its own box, the orchestrator on the right. */
export function GroupView({ group, everyMs = 2500 }: { group: number; everyMs?: number }) {
  const [data, setData] = React.useState<ReturnType<typeof parseRecord>>(null);
  React.useEffect(() => {
    let stop = false; let t: ReturnType<typeof setTimeout>;
    const tick = async () => { if (!(typeof document !== "undefined" && document.hidden)) { try { const r = parseRecord(await apiGet(`/api/v1/cockpit/groups?id=${group}`)); if (!stop && r) setData((old) => (JSON.stringify(old) === JSON.stringify(r) ? old : r)); } catch { /* the last one stays */ } } if (!stop) t = setTimeout(() => void tick(), everyMs); };
    void tick(); return () => { stop = true; clearTimeout(t); };
  }, [group, everyMs]);
  const g = data?.group; const live = g?.status === "active"; const log = data?.log ?? [];
  const boss = `pane-${g?.paneId}`;
  const who = (n: string) => (n === boss ? "orchestrator" : n);
  const color = (n: string) => (n === boss ? C.brand : COLORS[Math.max(0, g?.members.indexOf(n) ?? 0) % COLORS.length]);
  const last = log[log.length - 1]; const waitingFor = live && last?.kind === "ask" ? last.to : "";
  // follow the newest only when the person is already at the end
  const box = React.useRef<HTMLDivElement>(null); const stick = React.useRef(true);
  React.useEffect(() => { const e = box.current; if (e && stick.current) e.scrollTop = e.scrollHeight; }, [log.length, waitingFor]);
  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div data-testid="group-view" style={{ height: "100%", boxSizing: "border-box", padding: "0 2px 2px", display: "flex", flexDirection: "column", minHeight: 0, fontFamily: nav, color: C.fg }}>
      <style>{CSS}</style>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "6px 10px", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
        <GroupIcon on={!!g} busy={live} /><span data-testid="group-status">{g ? `${g.status} · ${g.turnsUsed}/${g.turns} turns · ${k(g.tokens)} tokens · ${money(g.usd)}` : "reading…"}</span><span style={{ flex: 1 }} />
        {live && <button data-testid="group-stop" style={{ ...small, color: C.bad }} onClick={() => void answer("/api/v1/cockpit/groups", { op: "stop", id: group })}>Stop</button>}
        {g && <button data-testid="group-off" title="no more groups from this agent until you turn the button on again" style={{ ...small, color: C.muted }} onClick={() => void answer("/api/v1/cockpit/groups", { op: "off", pane_id: g.paneId })}>Turn groups off</button>}
      </div>
      <div ref={box} onScroll={() => { const e = box.current; if (e) stick.current = e.scrollHeight - e.scrollTop - e.clientHeight < 80; }} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 12px 4px" }}>
        {log.map((l, i) => {
          if (l.kind === "goal") return <div key={i} data-testid="group-line" data-kind="goal" style={{ margin: "0 auto 14px", maxWidth: 520, padding: "10px 14px", borderRadius: 12, border: `1px solid ${C.border}`, textAlign: "center", fontSize: 13, lineHeight: 1.5 }}><div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Goal</div>{l.text}</div>;
          if (l.kind === "changed") return <div key={i} data-testid="group-line" data-kind="changed" style={{ textAlign: "center", margin: "0 0 14px", fontSize: 11.5, color: C.muted, overflowWrap: "anywhere" }}>{who(l.from)} changed <span style={{ fontFamily: mono }}>{l.text}</span> · {time(l.t)}</div>;
          if (l.kind === "grant") return <div key={i} data-testid="group-line" data-kind="grant" style={{ textAlign: "center", margin: "0 0 14px", fontSize: 11.5, color: C.muted, overflowWrap: "anywhere" }}>{l.to} may now also change <span style={{ fontFamily: mono }}>{l.text}</span> · {time(l.t)}</div>;
          if (l.kind === "decision") return <div key={i} data-testid="group-line" data-kind="decision" style={{ textAlign: "center", margin: "0 0 14px", fontSize: 11.5, color: C.muted }}>{DECIDED[l.text] ?? l.text} · {time(l.t)}</div>;
          const mine = l.from === boss;
          return <Bubble key={i} name={who(l.from)} id={l.from} color={color(l.from)} mine={mine} time={time(l.t)} text={l.text} kind={l.kind} to={mine && l.to ? who(l.to) : l.kind === "result" ? "you" : undefined} />;
        })}
        {waitingFor && (
          <div data-testid="group-typing" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <SpecialistAvatar id={waitingFor} size={20} state="working" /><span style={{ fontSize: 12, color: color(waitingFor), fontWeight: 600 }}>{waitingFor}</span>
            <GroupIcon on busy /><span style={{ fontSize: 12, color: C.muted }}>is working</span>
          </div>)}
      </div>
    </div>);
}
