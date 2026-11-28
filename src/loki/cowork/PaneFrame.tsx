// THE PANE CARD (board v3): a rounded card with a thin header, the way herdr draws every pane. The header carries the engine and model,
// the folder, the router's label for the work (engine panes), and the split, zoom and close controls. The body is whatever the pane is.
import { canBeApp, openAsApp } from "./pane-app";
import { SpecialistEditor } from "./SpecialistEditor";
import { usePixelStyle } from "./use-appearance";
import { AvatarPicker, SpecialistAvatar, SpecialistShadow, SpecialistTag, specialistColor } from "./SpecialistAvatar";
import * as React from "react";
import { MailBar, PauseButton, PausedBar, LongLocalBar } from "@/loki/cockpit/pane-watch";
import { QueueButton, TaskQueuePanel } from "./TaskQueue";
import { GroupButton, GroupStyle, useGroupRing } from "./Groups";
import { C, mono, nav } from "@/loki/theme";
import type { PaneRef, Side } from "./layout";
import { zoneAt, zoneBox, type Zone } from "./drag";
import { PaneDragContext } from "./drag-context";
import { InlineName } from "./InlineName";
import { ROLE_COLOR } from "./TeamBar";
import { ROLE_LABEL } from "./team-layout";
import { HeimdallToggle } from "./HeimdallToggle";
import { CollapseContext } from "./collapse-context";
import { HeaderSlot } from "./header-slot";

/** THE FLOATING SWITCH AND PILL TAKE NO SPACE (operator 2026-11-10), so they sit on top of whatever pane is under them. A pane header keeps its own title and buttons clear of them: how far in from each side it must pad, measured from where they really are. Pure. */
export function overlayInsets(header: DOMRect, floats: DOMRect[]): { l: number; r: number } {
  let l = 0; let r = 0;
  for (const b of floats) {
    if (b.width === 0 || b.height === 0 || !(b.bottom > header.top && b.top < header.bottom) || !(b.right > header.left && b.left < header.right)) continue;
    if (b.left + b.width / 2 > header.left + header.width / 2) r = Math.max(r, Math.round(header.right - b.left + 8)); else l = Math.max(l, Math.round(b.right - header.left + 8));
  }
  return { l, r };
}
/** WHICH HEADER CONTROLS FIT (operator 2026-11-11: "when an agent gets too small the controls above disappear: make a way for this never to happen, even if you have to turn more into icons or fold them. The close button always visible"). The items are in the order they are worth keeping inline; the first
 *  that no longer fits and everything after it go into the menu. The close button and the menu button are not in this list: they are always there. Pure - tested. */
export function fitControls(room: number, items: readonly { id: string; cost: number }[]): Set<string> {
  const keep = new Set<string>(); let left = room;
  for (const it of items) { if (it.cost > left) break; keep.add(it.id); left -= it.cost; }
  return keep;
}
export const TITLE_MIN = 70;
/** The room a header leaves for its controls: its width less the padding, the title's minimum, and the two buttons that are always there. Pure. */
export function controlRoom(headerWidth: number, insetL: number, insetR: number): number { return Math.max(0, headerWidth - (12 + insetL) - (8 + insetR) - TITLE_MIN - 2 * 26); }
const FLOATS = ['[data-testid="instruments-pill"]', '[data-testid="screen-switch"]'];
/** The event that asks a pane to start renaming itself (the shortcut for it): `detail` is the pane's id. */
export const RENAME_PANE = "cowork:rename-pane";
/** How long the pointer rests on a pane before it takes the focus. */
export const HOVER_FOCUS_MS = 120;
export type Dot = "working" | "blocked" | "done" | "idle" | "none";
const dotColor = (d: Dot) => (d === "working" ? C.brand : d === "blocked" ? C.warn : d === "done" ? C.ok : C.muted);
const SIDES: ReadonlyArray<{ side: Side; label: string }> = [{ side: "right", label: "split right" }, { side: "below", label: "split below" }, { side: "left", label: "split left" }, { side: "above", label: "split above" }];

export function PaneFrame({ splitLocked, leaderLook, leader, onFork, onAvatar, skin, onSkin, pane, title, subtitle, route, dot, focused, zoomed, onFocus, onSplit, onZoom, onClose, onRename, onFlip, onCloseDecide, required, extra, stats, badge, onSide, sideOpen, onMic, mic, agentPaneId, onCollapse, children }: {
  /** the team pane's header wears its Leader's look (the Leader's terminal is drawn inside the team pane, so the bar is the team pane's) */ leaderLook?: { id: string; shape?: string; color?: string };
  /** this pane is the Leader of that team: it wears the specialist look, tagged LEADER */ leader?: string;
  /** a specialist was forked from this pane's window: open the new one */ onFork?: (id: string) => void;
  /** a specialist's pane: the person chose another avatar (shape, colour) */ onAvatar?: (shape: string, color: string) => void;
  /** the pane's current drawing and the switch between the terminal and the chat (agent panes whose engine can be read) */ skin?: "terminal" | "chat"; onSkin?: () => void;
  pane: PaneRef; title: string; subtitle?: string; route?: string; /** what the agent is using (tokens, context, cost): drawn in the header when there is room */ stats?: React.ReactNode; /** a small mark right after the title that always shows (the antiloki connection) */ badge?: React.ReactNode; dot: Dot; focused: boolean; zoomed: boolean;
  /** the pane a team thread cannot be without (the team's own pane and its Leader's terminal): it has no close button and no "close…" in its menu */ required?: boolean; /** a team thread holds only the team's own pane: no split buttons, no "new pane beside" in the menu */ splitLocked?: boolean; onFocus: () => void; onSplit: (side: Side, anchor: HTMLElement) => void; onZoom: () => void; onClose: () => void; onRename?: (name: string) => void; onFlip?: () => void; /** engine panes: close it and decide what happens to its changes (merge, discard, keep) */ onCloseDecide?: () => void; /** fold this pane into a strip with its name (and open it again from there) */ onCollapse?: () => void; /** engine panes: talk to this agent (the microphone): `mic` says whether it is listening to this one now */ onMic?: () => void; mic?: "idle" | "listening" | "busy"; /** an engine pane's cockpit pane number: its menu then offers the Heimdall switch */ agentPaneId?: number; /** this agent already has a side question open: the ? closes it instead of opening another */ sideOpen?: boolean; /** engine panes: open a side question about this agent (a read-only helper bound to it) */ onSide?: () => void; /** sits in the header after the title (an engine pane's model button) */ extra?: React.ReactNode; children: React.ReactNode;
}) {
  const [menu, setMenu] = React.useState(false); const [queueOpen, setQueueOpen] = React.useState(false); const ring = useGroupRing(pane.tool === "group" ? pane.group : undefined); const [slot, setSlot] = React.useState<HTMLElement | null>(null);
  const splitDir = React.useContext(CollapseContext);
  const drag = React.useContext(PaneDragContext);
  const [zone, setZone] = React.useState<Zone | null>(null);
  const movable = pane.kind !== "worker";
  const target = movable && ((drag.dragging !== null && drag.dragging !== pane.id) || (!!drag.block && !drag.inBlock?.(pane.id)));
  // FOCUS FOLLOWS THE POINTER (operator 2026-11-10): resting on a pane focuses it, after a moment so crossing panes on the way somewhere does not flicker the focus, and never mid-drag
  const hover = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverOut = () => { if (hover.current) { clearTimeout(hover.current); hover.current = null; } };
  const hoverIn = () => { hoverOut(); if (focused || drag.dragging !== null) return; hover.current = setTimeout(() => { hover.current = null; if (!focused) onFocus(); }, HOVER_FOCUS_MS); };
  React.useEffect(() => hoverOut, []);
  const headerRef = React.useRef<HTMLDivElement | null>(null);
  const [inset, setInset] = React.useState({ l: 0, r: 0 });
  React.useLayoutEffect(() => {
    const measure = () => {
      const h = headerRef.current; if (!h) return;
      const next = overlayInsets(h.getBoundingClientRect(), FLOATS.map((q) => document.querySelector(q)).filter((e): e is Element => !!e).map((e) => e.getBoundingClientRect()));
      setInset((p) => (p.l === next.l && p.r === next.r ? p : next));
    };
    measure(); window.addEventListener("resize", measure); const t = setInterval(measure, 1000);
    return () => { window.removeEventListener("resize", measure); clearInterval(t); };
  }, []);   // on mount, on resize and every second: never on every render (a measure that sets state on every render oscillated once the header's own contents depended on it)
  const [hw, setHw] = React.useState(10_000);
  React.useLayoutEffect(() => { const h = headerRef.current; if (!h || typeof ResizeObserver === "undefined") return; const ro = new ResizeObserver(() => setHw(h.clientWidth || 10_000)); ro.observe(h); setHw(h.clientWidth || 10_000); return () => ro.disconnect(); }, []);
  const moreRef = React.useRef<HTMLButtonElement | null>(null);
  const pixelStyle = usePixelStyle();
  const who = pane.specialist ? { ...pane.specialist, isLeader: pane.specialist.leader === true } : leaderLook ? { ...leaderLook, isLeader: true } : leader ? { id: `leader-${leader}`, shape: pane.look?.shape, color: pane.look?.color, isLeader: true } : null;
  const [renameTick, setRenameTick] = React.useState(0); const [avatarOpen, setAvatarOpen] = React.useState(false); const [editorOpen, setEditorOpen] = React.useState(false);
  React.useEffect(() => { const on = (e: Event) => { if ((e as CustomEvent).detail === pane.id) setRenameTick((n) => n + 1); }; window.addEventListener(RENAME_PANE, on); return () => window.removeEventListener(RENAME_PANE, on); }, [pane.id]);
  // FOLDED: a glass strip with the pane's name (tall and thin in a row, low and wide in a column); a click anywhere on it opens the pane again
  if (pane.collapsed && !zoomed && onCollapse) {
    const row = splitDir === "row";
    return (
      <button data-testid={`pane-collapsed-${pane.id}`} data-state={dot} aria-label={`open ${title}`} title={`${title}${subtitle ? ` · ${subtitle}` : ""} — click to open`} onClick={onCollapse} onMouseDown={onFocus}
        style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: row ? "column" : "row", alignItems: "center", gap: 10, padding: row ? "10px 0" : "0 12px", cursor: "pointer", overflow: "hidden", borderRadius: 10, boxSizing: "border-box", fontFamily: nav, fontSize: 12, color: C.fg,
          background: `color-mix(in srgb, ${C.panel} min(var(--cw-pane, 100%), 70%), transparent)`, border: `1px solid ${focused ? (who ? specialistColor(who.id, who.color) : C.brand) : who && pixelStyle === "minimal" ? `color-mix(in srgb, ${specialistColor(who.id, who.color)} 60%, ${C.border})` : C.border}`, ...(focused && who ? { boxShadow: `0 0 0 3px color-mix(in srgb, ${specialistColor(who.id, who.color)} 22%, transparent)` } : {}), backdropFilter: "blur(var(--cw-blur, 10px))", WebkitBackdropFilter: "blur(var(--cw-blur, 10px))" }}>
        <span aria-hidden style={{ color: C.muted, fontFamily: mono, fontSize: 12, flexShrink: 0 }}>{row ? "»" : "▾"}</span>
        {dot !== "none" && <span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, background: dotColor(dot), flexShrink: 0, boxShadow: dot === "working" ? `0 0 0 3px color-mix(in oklab, ${C.brand} 30%, transparent)` : "none" }} />}
        <span data-testid={`pane-collapsed-name-${pane.id}`} style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minHeight: 0, minWidth: 0, ...(row ? { writingMode: "vertical-rl" as const, transform: "rotate(180deg)" } : {}) }}>{title}</span>
      </button>
    );
  }
  const btn: React.CSSProperties = { background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: "0 5px", lineHeight: "20px", borderRadius: 4 };
  // THE CONTROLS, in the order they are worth keeping inline (full screen, the mic, fold, side question, the two splits, then the model button); the ones that do not fit go into the menu
  const worker = pane.kind === "worker";
  const ctrl: { id: string; cost: number; node: React.ReactNode; label: string; run: (anchor: HTMLElement) => void }[] = worker ? [] : [
    ...(pane.tool !== "team" ? [{ id: "full", cost: 24, label: zoomed ? "exit full screen" : "full screen", run: () => onZoom(), node: <button data-testid={`fullscreen-${pane.id}`} aria-label={zoomed ? "exit full screen" : "full screen"} aria-pressed={zoomed} title={zoomed ? "exit full screen (Esc)" : "full screen: this pane fills the screen"} onClick={onZoom} style={{ ...btn, color: zoomed ? C.brand : C.muted }}>{zoomed ? "⤡" : "⛶"}</button> }] : []),   // a team thread has one pane, already as large as it can be: no full-screen button
    ...(pane.kind === "engine" && pane.paneId ? [{ id: "group", cost: 24, label: "groups: let this agent propose a group", run: () => {}, node: <GroupButton paneId={pane.paneId} style={btn} /> }] : []),
    ...(pane.kind === "engine" && pane.paneId ? [{ id: "queue", cost: 24, label: "the queue: done, doing, to do", run: () => setQueueOpen((o) => !o), node: <QueueButton open={queueOpen} onToggle={() => setQueueOpen((o) => !o)} style={btn} /> }] : []),
    ...(pane.kind === "engine" && pane.paneId ? [{ id: "pause", cost: 24, label: "pause or continue this agent", run: () => {}, node: <PauseButton paneId={pane.paneId} style={btn} /> }] : []),
    ...(canBeApp(pane) ? [{ id: "app", cost: 24, label: "open as its own app", run: () => openAsApp(pane), node: <button data-testid={`as-app-${pane.id}`} aria-label="open as its own app" data-tip="Open as its own app — then install it from the new window" onClick={() => openAsApp(pane)} style={btn}><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden style={{ display: "block", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }}><path d="M13 5h6v6M19 5l-8 8M10 5H5v14h14v-5" /></svg></button> }] : []),
    ...(onMic ? [{ id: "mic", cost: 24, label: mic === "listening" ? "send what you said" : "talk to this agent (microphone)", run: () => onMic(), node: <button data-testid={`mic-${pane.id}`} data-state={mic ?? "idle"} aria-label={mic === "listening" ? "send what you said" : "talk to this agent"} aria-pressed={mic === "listening"} title={mic === "listening" ? "stop recording and send what you said" : mic === "busy" ? "transcribing…" : "talk to this agent: click, speak as long as you like, press Send: it is transcribed by a local whisper and sent"} onClick={onMic} disabled={mic === "busy"}
          style={{ ...btn, color: mic === "listening" ? C.bad : C.muted, animation: mic === "listening" ? "antilokiDotPulse 1s ease-in-out infinite" : "none" }}><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden style={{ display: "block" }}><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button> }] : []),
    ...(onCollapse && pane.tool !== "team" ? [{ id: "fold", cost: 24, label: "fold into a strip", run: () => onCollapse(), node: pane.kind !== "worker" && <button data-testid={`collapse-${pane.id}`} aria-label="fold into a strip" title="fold this pane into a strip with its name" onClick={onCollapse} style={btn}><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden style={{ display: "block" }}><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M20 4v16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg></button> }] : []),
    ...(onSide ? [{ id: "side", cost: 24, label: sideOpen ? "close the side question" : "ask a side question", run: () => onSide(), node: !pane.side && <button data-testid={`side-question-${pane.id}`} aria-label={sideOpen ? "close the side question" : "ask a side question"} aria-pressed={sideOpen} title={sideOpen ? "close this agent's side question" : "side question: open a read-only helper about this agent (it never changes code)"} onClick={onSide} style={{ ...btn, color: sideOpen ? C.brand : C.muted }}>?</button> }] : []),
    ...(onSkin ? [{ id: "skin", cost: 24, label: skin === "chat" ? "show the terminal" : "show as chat", run: () => onSkin(), node: <button data-testid={`skin-${pane.id}`} aria-label={skin === "chat" ? "show the terminal" : "show as chat"} aria-pressed={skin === "chat"} title={skin === "chat" ? "Terminal: the real terminal (the same agent)" : "Chat: the same agent drawn as a conversation"} onClick={onSkin} style={{ ...btn, color: skin === "chat" ? C.brand : C.muted }}>{skin === "chat" ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 8 10 12 5 16" /><line x1="12" y1="17" x2="19" y2="17" /></svg> : <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" /></svg>}</button> }] : []),
    ...(splitLocked ? [] : [{ id: "splitr", cost: 24, label: "split right", run: (a: HTMLElement) => onSplit("right", a), node: <button aria-label="split right" title="split right" onClick={(e) => onSplit("right", e.currentTarget)} style={btn}>⊞</button> },
    { id: "splitb", cost: 24, label: "split below", run: (a: HTMLElement) => onSplit("below", a), node: <button aria-label="split below" title="split below" onClick={(e) => onSplit("below", e.currentTarget)} style={btn}>⊟</button>  }]),
    ...(extra ? [{ id: "model", cost: 118, label: "model", run: () => {}, node: extra }] : []),
  ];
  // SPLIT RIGHT / SPLIT BELOW ARE NOT ON THE BAR (operator 2026-11-18: "drop them, just dragging and the three dots is enough"): they stay in the three dots; the bar keeps the rest
  const inline = fitControls(controlRoom(hw, inset.l, inset.r), ctrl.filter((c) => c.id !== "splitr" && c.id !== "splitb"));
  const folded = ctrl.some((c) => !inline.has(c.id) && c.id !== "splitr" && c.id !== "splitb");
  const visual = ["model", "group", "queue", "pause", "app", "mic", "side", "splitr", "splitb", "skin", "fold", "full"];   // left to right, on the header. The chat/terminal switch stays beside the right-hand buttons: it is at the same place in both views (issue 28)
  return (
    <div data-testid={`pane-${pane.id}`} className={ring?.className} data-focused={focused ? "1" : "0"} onMouseDown={onFocus} onMouseEnter={hoverIn} onMouseLeave={(e) => { hoverOut(); /* the pointer left: this pane stops taking keys, even when the pane it went to has no input of its own (the operator 2026-11-22) */ const a = document.activeElement as HTMLElement | null; if (a && a !== document.body && e.currentTarget.contains(a) && drag.dragging === null && (a.tagName === "TEXTAREA" || a.tagName === "INPUT" || a.isContentEditable || a.closest("[data-chat-input],.xterm"))) a.blur(); }}
      style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", borderRadius: 10, border: `1px solid ${focused ? (who ? specialistColor(who.id, who.color) : C.brand) : who && pixelStyle === "minimal" ? `color-mix(in srgb, ${specialistColor(who.id, who.color)} 60%, ${C.border})` : C.border}`, ...(focused && who ? { boxShadow: `0 0 0 3px color-mix(in srgb, ${specialistColor(who.id, who.color)} 22%, transparent)` } : {}), background: "transparent", backdropFilter: "blur(var(--cw-blur, 0px))", WebkitBackdropFilter: "blur(var(--cw-blur, 0px))", overflow: "hidden", position: "relative", ...(ring?.style ?? {}) }}>
      {ring ? <GroupStyle /> : null}
      {target && (
        <div data-testid={`drop-${pane.id}`} data-zone={zone ?? ""}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setZone(zoneAt(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())); }}
          onDragLeave={() => setZone(null)}
          onDrop={(e) => { e.preventDefault(); const z = zoneAt(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()); setZone(null); drag.drop(pane.id, z); }}
          style={{ position: "absolute", inset: 0, zIndex: 40, background: "transparent" }}>
          {zone && <div style={{ position: "absolute", ...zoneBox(zone), background: `color-mix(in srgb, ${C.brand} 22%, transparent)`, border: `2px solid ${C.brand}`, borderRadius: 8, boxSizing: "border-box", pointerEvents: "none", display: "grid", placeItems: "center", color: C.fg, fontSize: 12, fontWeight: 600 }}>{drag.label?.(pane.id, zone) ?? (zone === "swap" ? "swap places" : `put ${zone === "above" ? "above" : zone === "below" ? "below" : `on the ${zone}`}`)}</div>}
        </div>
      )}
      <div ref={headerRef} className={who ? "sp-hdr" : undefined} draggable={movable} onDragStart={(e) => { if (!movable) return; e.dataTransfer.setData("text/plain", pane.id); e.dataTransfer.effectAllowed = "move"; drag.start(pane.id); }} onDragEnd={() => { setZone(null); drag.end(); }}
        title={movable ? "drag the header to move this pane" : undefined} data-testid={`pane-header-${pane.id}`}
        onContextMenu={(e) => { /* an agent's bar has the menu only when a button did not fit: without it the button was out of reach (2026-11-27) */ if (pane.kind === "worker" || (pane.kind === "engine" && !folded)) return; e.preventDefault(); setMenu((m) => !m); }} style={{ cursor: movable ? "grab" : "default", height: 30, boxSizing: "border-box", padding: `0 ${8 + inset.r}px 0 ${12 + inset.l}px`, display: "flex", alignItems: "center", gap: 9, borderBottom: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.panel} var(--cw-pane, 100%), transparent)`, fontFamily: nav, fontSize: 12, flexShrink: 0, position: "relative", zIndex: 10 }}>
        {who && skin === "chat" && <SpecialistShadow id={who.id} shape={who.shape} color={who.color} working={dot === "working"} />}
        {who && <span style={{ position: "relative", display: "inline-flex" }}><button data-testid="specialist-avatar-btn" aria-label="choose this specialist's avatar" title="Choose another avatar" onClick={(e) => { e.stopPropagation(); setAvatarOpen((o) => !o); }} onMouseDown={(e) => e.stopPropagation()} draggable={false} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "inline-flex" }}>
          <SpecialistAvatar id={who.id} pixel={skin === "chat"} size={24} shape={who.shape} color={who.color} state={dot === "working" ? "working" : dot === "blocked" ? "blocked" : dot === "done" ? "done" : "idle"} /></button>
          {avatarOpen && onAvatar && <AvatarPicker id={who.id} shape={who.shape} color={who.color} onPick={onAvatar} onClose={() => setAvatarOpen(false)} />}</span>}
        {dot !== "none" && <span data-testid="pane-dot" data-state={dot} title={dot} style={{ width: 7, height: 7, borderRadius: 4, background: dotColor(dot), flexShrink: 0, boxShadow: dot === "working" ? `0 0 0 3px color-mix(in oklab, ${C.brand} 30%, transparent)` : "none" }} />}
        {onRename ? <InlineName value={title} label="rename this pane" max={80} onCommit={onRename} editRequest={renameTick} style={{ color: C.fg, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: "0 1 auto", display: "block" }} /> : <span style={{ color: C.fg, fontWeight: 600, whiteSpace: "nowrap" }}>{title}</span>}
        {who && <SpecialistTag narrow={hw < 560} id={who.id} color={who.color} label={who.isLeader ? "Leader" : "Specialist"} onClick={() => setEditorOpen(true)} />}
        {who && (pane.specialist || leaderLook) && <button data-testid="specialist-edit-btn" aria-label="edit this specialist" title="Edit this specialist (its purpose, skills, tools, seat)" onClick={(e) => { e.stopPropagation(); setEditorOpen(true); }} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 12, padding: "0 4px" }}>✎</button>}
        {who && (pane.specialist || leaderLook) && editorOpen && <SpecialistEditor id={who.id} onClose={() => setEditorOpen(false)} onLook={onAvatar} onFork={onFork} />}
        {pane.side && hw > 300 && <span data-testid="pane-side" title="a side question: read-only, it answers about the agent it is bound to and never changes code" style={{ color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 999, padding: "0 7px", fontSize: 10.5, whiteSpace: "nowrap" }}>side question</span>}
        {pane.role && <span data-testid="pane-role" data-role={pane.role} title={`this pane is the team's ${ROLE_LABEL[pane.role]}`} style={{ color: ROLE_COLOR[pane.role], border: `1px solid ${ROLE_COLOR[pane.role]}`, borderRadius: 999, padding: "0 7px", fontSize: 10.5, whiteSpace: "nowrap" }}>{ROLE_LABEL[pane.role]}</span>}
        {extra && inline.has("model") ? extra : null}
        {badge && <span data-testid="pane-badge" style={{ display: "inline-flex", flexShrink: 0 }}>{badge}</span>}
        {stats && hw > 560 && <span data-testid="pane-stats" style={{ minWidth: 0, overflow: "hidden", display: "inline-flex" }}>{stats}</span>}
        {subtitle && !extra && hw > 420 && <span style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{subtitle}</span>}
        <div style={{ flex: 1 }} />
        <span ref={setSlot} data-testid={`pane-slot-${pane.id}`} style={{ display: "inline-flex", flexShrink: 0 }} />
        {route && hw > 520 && <span data-testid="pane-route" style={{ color: C.ok, fontSize: 11, whiteSpace: "nowrap" }}>{route}</span>}
        {/* a worker's pane is temporary and the backend's: it only closes (which dismisses it) */}
        {[...ctrl].sort((a, b) => visual.indexOf(a.id) - visual.indexOf(b.id)).filter((c) => c.id !== "model" && inline.has(c.id)).map((c) => <React.Fragment key={c.id}>{c.node}</React.Fragment>)}
        {/* no ⋯ button (the operator 2026-11-22); what it held opens with a right click on the bar */}
        {!required && <button data-testid={`close-${pane.id}`} aria-label={pane.kind === "worker" ? "dismiss worker pane" : "close pane"} title={pane.kind === "worker" ? "dismiss" : "close pane"} onClick={onClose} style={{ ...btn, flexShrink: 0 }}>✕</button>}
        {menu && (
          <div role="menu" data-testid="pane-menu" onMouseLeave={() => setMenu(false)} style={{ position: "absolute", right: 8, top: 28, zIndex: 30, minWidth: 140, padding: 4, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 12px 30px -10px rgba(0,0,0,.6)" }}>
            {ctrl.filter((c) => !inline.has(c.id) && c.id !== "model").map((c) => c.id === "group" || c.id === "pause" ? <div key={c.id} data-testid={`menu-${c.id}-${pane.id}`} style={{ display: "flex", alignItems: "center", gap: 6, color: C.fg, lineHeight: "26px", padding: "0 3px" }}>{c.node}<span>{c.label}</span></div> : <button key={c.id} role="menuitem" data-testid={`menu-${c.id}-${pane.id}`} onClick={(e) => { setMenu(false); c.run(moreRef.current ?? e.currentTarget); }} style={{ ...btn, display: "block", width: "100%", textAlign: "left", lineHeight: "26px", color: C.fg }}>{c.label}</button>)}
            {extra && !inline.has("model") ? <div data-testid={`menu-model-${pane.id}`} style={{ padding: "3px 6px" }}>{extra}</div> : null}
            {!splitLocked && SIDES.filter((s) => s.side === "left" || s.side === "above").map((s) => <button key={s.side} role="menuitem" onClick={(e) => { setMenu(false); onSplit(s.side, e.currentTarget.closest("[role=menu]")?.parentElement?.querySelector("button[aria-label=\"more pane actions\"]") as HTMLElement ?? e.currentTarget); }} style={{ ...btn, display: "block", width: "100%", textAlign: "left", lineHeight: "26px", color: C.fg }}>{s.label}</button>)}
            {agentPaneId ? <HeimdallToggle paneId={agentPaneId} onDone={() => setMenu(false)} /> : null}
            {onCloseDecide && !required && <button role="menuitem" data-testid="close-decide" onClick={() => { setMenu(false); onCloseDecide(); }} style={{ ...btn, display: "block", width: "100%", textAlign: "left", lineHeight: "26px", color: C.fg }}>close… keep, merge or discard its changes</button>}
            {onFlip && <button role="menuitem" onClick={() => { setMenu(false); onFlip(); }} style={{ ...btn, display: "block", width: "100%", textAlign: "left", lineHeight: "26px", color: C.fg }}>flip side by side / stacked</button>}
            <button role="menuitem" data-testid="browser-fullscreen" onClick={() => { setMenu(false); const el = document.querySelector<HTMLElement>(`[data-testid="pane-${pane.id}"]`); void (document.fullscreenElement ? document.exitFullscreen() : el?.requestFullscreen?.()); }} style={{ ...btn, display: "block", width: "100%", textAlign: "left", lineHeight: "26px", color: C.fg }}>browser full screen</button>
            <button role="menuitem" onClick={() => { setMenu(false); onZoom(); }} style={{ ...btn, display: "block", width: "100%", textAlign: "left", lineHeight: "26px", color: C.fg }}>{zoomed ? "unzoom" : "zoom"}</button>
          </div>
        )}
      </div>
      {queueOpen && pane.kind === "engine" && pane.paneId ? <TaskQueuePanel paneId={pane.paneId} onClose={() => setQueueOpen(false)} /> : null}
      {pane.kind === "engine" && pane.paneId ? <><PausedBar paneId={pane.paneId} /><LongLocalBar paneId={pane.paneId} /><MailBar paneId={pane.paneId} /></> : null}
      <HeaderSlot.Provider value={slot}>
      <div data-testid={`pane-body-${pane.id}`} style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column", background: `color-mix(in srgb, ${C.panel} var(--cw-term, 100%), transparent)`, borderRadius: "0 0 9px 9px" }}>{children}</div>
      </HeaderSlot.Provider>
    </div>
  );
}
