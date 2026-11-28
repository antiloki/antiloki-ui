// THE MEMORY BUTTON, next to the model button of every agent pane (the operator 2026-11-14: "a saga button next to the model picker of every model pane"): what this agent remembers is its sagas, an episode for every ask.
// One click opens a short list of this pane's sagas (what it did, how many turns, what it cost); one more opens the saga on the Sagas screen. Flat, an icon with a count; the list is a popover.
import * as React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import { Icon } from "@/loki/team/icons";
import { listSagaEpisodes, type AgentSaga, type Member, type SagaEpisode } from "./api";
import { listSagas } from "@/loki/sagas/api";
import { apiGet } from "@/loki/api/client";
import { packOf } from "@/loki/team/PackList";
import type { Saga } from "@/loki/sagas/model";

/** What a membership says, in words, with the icon that stands for it. Pure. */
export function memberWords(m: Member): { icon: string; text: string } {
  switch (m.kind) { case "leader": return { icon: "spark", text: `Leader of ${m.name}` }; case "pair": return { icon: "agent", text: `pair ${m.name}${m.role ? ` · ${m.role}` : ""}` }; case "team": return { icon: "graph", text: `team ${m.name}${m.role ? ` · ${m.role}` : ""}` }; case "team-thread": return { icon: "graph", text: `team thread ${m.name}` }; default: return { icon: "saga", text: `thread ${m.name}` }; }
}

/** The sagas of one pane, the ones still open first, then the newest. At most `max`. Pure. */
export function memoryOf(episodes: AgentSaga[], paneId: number, max = 8, /** a specialist's other panes: its memory is all of them */ also: number[] = []): AgentSaga[] {
  return episodes.filter((e) => e.paneId === paneId || also.includes(e.paneId)).sort((a, b) => Number(b.open) - Number(a.open) || b.updated - a.updated).slice(0, max);
}
/** how many of a saga's newest episodes the list shows */
const EPISODES_SHOWN = 5;
const money = (v: number) => (v > 0 && v < 0.01 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`);

/** The team a terminal leads, as its sagas: the team's own saga (its record, an episode for every run) first, then the sagas of the pack its planner made. A Leader's memory IS this (the operator 2026-11-16: "we should be able to see the sagas of the team because it is a leader"). Pure. */
export function teamMemoryOf(sagas: Saga[], team: string): { id: number; title: string; line: string; own: boolean }[] {
  const { own, pack } = packOf(sagas, team.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  const row = (s: Saga, isOwn: boolean) => { const r: any = (s as any).rollup; const n = r?.episodes ?? 0; return { id: s.id, title: isOwn ? "The team's record" : s.title || "saga", line: `${n} episode${n === 1 ? "" : "s"}${r ? ` · ${r.done ?? 0} done` : ""}`, own: isOwn }; };
  return [...(own ? [row(own, true)] : []), ...pack.map((s) => row(s, false))];
}

export function MemoryButton({ paneId, episodes, onOpen, team }: { paneId: number; episodes: AgentSaga[]; onOpen: (id: number) => void; /** the team this terminal is the Leader of: its sagas are listed too */ team?: string | null }) {
  const [open, setOpen] = React.useState(false);
  // A SPECIALIST REMEMBERS PAST THIS SESSION (operator 2026-11-26): the sagas of every pane it has had; a pane that is no specialist answers with none
  const [mine, setMine] = React.useState<number[]>([]); const [every, setEvery] = React.useState(false);
  React.useEffect(() => { let stop = false; void Promise.resolve().then(() => apiGet(`/api/v1/cockpit/specialist/panes?pane_id=${paneId}`)).then((r: any) => { const l = (r?.result ?? r)?.panes; if (!stop && Array.isArray(l) && l.length) setMine(l.map(Number)); }).catch(() => {}); return () => { stop = true; }; }, [paneId, open]);
  const all = memoryOf(episodes, paneId, 1000, mine); const list = every ? all : all.slice(0, 8); const anchor = React.useRef<HTMLSpanElement>(null);
  // WHAT IS INSIDE EACH SAGA (operator 2026-11-25: "if each agent has one saga, the list should at least show its episodes"): fetched when the list opens, for the first few sagas
  const [eps, setEps] = React.useState<Record<number, SagaEpisode[]>>({});
  React.useEffect(() => { if (!open) return; let stop = false; for (const e of list.slice(0, 3)) void listSagaEpisodes(e.id).then((r) => { if (!stop) setEps((o) => ({ ...o, [e.id]: r })); }); return () => { stop = true; }; }, [open, list.map((e) => `${e.id}:${e.turns}`).join(",")]);   // eslint-disable-line react-hooks/exhaustive-deps
  // THE LIST IS DRAWN IN THE PAGE, NOT IN THE PANE (2026-11-24: on the leader's bar it opened under the chat): a fixed panel under the button, above everything
  const at = open && anchor.current ? anchor.current.getBoundingClientRect() : null;
  // Escape or a click anywhere else closes the list (it stayed open over the pane, seen in the browser 2026-11-25)
  React.useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { const t = e.target as Element | null; if (t && (anchor.current?.contains(t) || t.closest?.("[role=dialog]"))) return; setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc, true); };
  }, [open]);
  const [teamSagas, setTeamSagas] = React.useState<Saga[]>([]);
  React.useEffect(() => { if (!team) return; let stop = false; void listSagas().then((l) => { if (!stop && l) setTeamSagas(l); }); return () => { stop = true; }; }, [team, open]);
  const tm = team ? teamMemoryOf(teamSagas, team) : [];
  return (
    <span ref={anchor} style={{ position: "relative", display: "inline-flex" }} onMouseDown={(e) => e.stopPropagation()}>
      <button data-testid={`memory-button-${paneId}`} aria-haspopup="dialog" aria-expanded={open} title={list.length + tm.length ? `what this agent remembers: ${list.length + tm.length} saga${list.length + tm.length === 1 ? "" : "s"}` : "this agent has no saga yet"} onClick={() => setOpen((o) => !o)} draggable={false}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: `1px solid ${C.border}`, color: list.length + tm.length ? C.fg : C.dim, borderRadius: 999, padding: "0 8px", cursor: "pointer", fontFamily: mono, fontSize: 10.5, lineHeight: "18px", whiteSpace: "nowrap" }}>
        <Icon name="saga" size={12} />{list.length + tm.length > 0 && <span data-testid={`memory-count-${paneId}`}>{all.length + tm.length}</span>}</button>
      {open && at && createPortal(
        <div role="dialog" aria-label="what this agent remembers" data-testid={`memory-list-${paneId}`} style={{ position: "fixed", left: at.left, top: at.bottom + 4, zIndex: 9990, width: 300, maxHeight: 340, overflowY: "auto", padding: 4, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, fontFamily: nav }}>
          {tm.length > 0 && <div style={{ padding: "6px 10px 2px", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: C.dim }}>team {team}</div>}
          {tm.map((t) => <button key={`t${t.id}`} data-testid={`memory-team-${t.id}`} onClick={() => { setOpen(false); onOpen(t.id); }} title="open this saga" style={{ display: "grid", gap: 2, width: "100%", textAlign: "left", background: "transparent", border: "none", color: C.fg, cursor: "pointer", padding: "7px 10px", borderRadius: 8 }}><span style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ color: t.own ? C.brand : C.dim, display: "inline-flex" }}><Icon name={t.own ? "graph" : "saga"} size={12} /></span><span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span></span><span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>{t.line}</span></button>)}
          {tm.length > 0 && list.length > 0 && <div style={{ padding: "6px 10px 2px", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: C.dim }}>this agent</div>}
          {list.length + tm.length === 0 && <div style={{ padding: "8px 10px", color: C.muted, fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}><Icon name="saga" size={14} />Nothing yet. Its work appears here as a saga, an episode for every ask.</div>}
          {list.map((e) => <button key={e.id} data-testid={`memory-saga-${e.id}`} onClick={() => { setOpen(false); onOpen(e.id); }} title="open this saga"
            style={{ display: "grid", gap: 2, width: "100%", textAlign: "left", background: "transparent", border: "none", color: C.fg, cursor: "pointer", padding: "7px 10px", borderRadius: 8 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}><span style={{ color: e.open ? C.brand : C.dim, display: "inline-flex" }}><Icon name={e.open ? "spark" : "tick"} size={12} /></span><span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title || "untitled"}</span></span>
            {e.summary && <span style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.summary}</span>}
            {(e.member ?? []).length > 0 && <span data-testid={`memory-member-${e.id}`} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{(e.member ?? []).map((m, i) => { const w = memberWords(m); return <span key={i} style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 10.5, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "0 7px" }}><Icon name={w.icon} size={10} />{w.text}</span>; })}</span>}
            <span style={{ display: "flex", gap: 10, fontFamily: mono, fontSize: 10.5, color: C.dim }}><span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}><Icon name="chat" size={10} />{e.turns}</span><span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}><Icon name="coin" size={10} />{money(e.usd)}</span></span>
            {(eps[e.id] ?? []).length > 0 && <span data-testid={`memory-episodes-${e.id}`} style={{ display: "grid", gap: 2, marginTop: 3, paddingLeft: 8, borderLeft: `1px solid ${C.border}` }}>
              {(eps[e.id] ?? []).length > EPISODES_SHOWN && <span style={{ fontSize: 10.5, color: C.dim }}>{(eps[e.id] ?? []).length - EPISODES_SHOWN} earlier</span>}
              {[...(eps[e.id] ?? [])].slice(-EPISODES_SHOWN).reverse().map((x) => <span key={x.id} data-testid={`memory-episode-${x.id}`} style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0, fontSize: 11.5, color: C.muted }}><span style={{ color: x.status === "done" ? C.ok : x.status === "failed" ? C.bad : C.brand, display: "inline-flex" }}><Icon name={x.status === "done" ? "tick" : "spark"} size={10} /></span><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.title || "an answer"}</span></span>)}
            </span>}
          </button>)}
          {all.length > list.length && <button data-testid={`memory-more-${paneId}`} onClick={() => setEvery(true)} style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", color: C.muted, cursor: "pointer", padding: "7px 10px", fontSize: 12 }}>… {all.length - list.length} more</button>}
        </div>, document.body)}
    </span>
  );
}
