// THE DOCK (operator 2026-07-20, the tabs shell): the chat text field follows you
// to EVERY screen. At rest it is a GHOST — barely there until the mouse arrives —
// and it is DRAGGABLE: grab the grip and drop it on an edge to SPLIT the screen
// (left / right / top / bottom) into a NEW chat panel grown from this field (its
// own light transcript over the same /api/v1/turn — deliberately NOT the old
// drawer code). Enter on the floating field opens the right split and sends.
// Pure UI: no BE, no new logic; the panel is resizable within limits.
import { fetchAutoContext, withAutoContext, readContextPrefs, setContextPref, writeContextPrefs, UsedChips } from "@/loki/chat/auto-context";
import React from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { C, mono, nav } from "@/loki/theme";
import { Markdown } from "@/loki/components/Markdown";
import { sendChatTurn } from "@/loki/api/dispatch";
import { composeScreenManifest, screenActionsFor } from "@/loki/chat/screen-manifest";
import { executeUiCommands, describeUiCommand, type UiCommand } from "@/loki/chat/ui-bus";
import { onboardStart } from "@/loki/api/codebase";

// REBUILD from the text field (operator 2026-07-23): one click starts the background rebuild and
// jumps to the code screen, where the wizard auto-adopts the live job. Guarded against double-fire.
function RebuildQuick() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try { await onboardStart({}); } catch { /* the code screen surfaces BE errors */ }
    setBusy(false);
    router.navigate({ to: "/" });
  };
  // DISCRETE (operator 2026-07-23): a bare glyph like the dock's other quiet controls — no border,
  // no label, muted until hovered. The title carries the explanation.
  return (
    <button onClick={() => void go()} disabled={busy} title="rebuild the codebase atlas (background) — opens the wizard"
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.fg; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.muted; }}
      style={{ background: "transparent", border: "none", color: C.muted, cursor: busy ? "wait" : "pointer", fontFamily: mono, fontSize: 13, padding: "2px 4px", lineHeight: 1 }}>
      {busy ? "…" : "↻"}
    </button>
  );
}
import { getFeSession } from "@/loki/api/client";
import { dockStore, useDock, dockMsgs, dockPending, setDockPending, type DockSide, type DockSurface } from "./dock-store";
import { MenuCircle } from "./corner-menu";
import { appendContext, isContextDrag, readContextDrop } from "./drag-context";
import { Logo } from "./logo";

export const DOCK_MODE_KEY = "antiloki:dock-mode";
export const DOCK_DRAFT_KEY = "antiloki:dock-draft";
const EDGE = 110; // px from a viewport edge that counts as "drop to split there"

const sideAt = (x: number, y: number): DockSide => {
  const w = window.innerWidth, h = window.innerHeight;
  if (x < EDGE) return "left";
  if (x > w - EDGE) return "right";
  if (y < EDGE) return "top";
  if (y > h - EDGE) return "bottom";
  return null;
};

// where the docked panel may ride (operator 2026-07-20): every screen except
// settings, X-ray and the AGENT chat — vibe/research modes DO get it. The floating
// field follows the same rule: on "/" it hides only for the AGENT composer —
// on vibe/research it IS the composer (the surfaces register their submit).
// X-RAY HAS NO CHAT (operator 2026-09-29: "remove the chat from X-ray"): /operations/atlas is the code-analysis
// screen, and the ghost field + the docked panel + the collapsed ✦ pill are all this one predicate.
// SAGAS HAS NO CHAT EITHER (operator 2026-10-11: "there is a floating chat input on sagas, remove that"): it is a list and a record to read and edit, and the field floating over it covered the last rows.
export const panelHiddenHere = (p: string, chatMode: string) => p.startsWith("/operations/atlas") || p.startsWith("/sagas") || (p === "/" && (chatMode === "agent" || chatMode === "threads"));
/** The room the docked chat takes on its edge — NONE since 2026-09-19 (operator: "the file review has not
 *  much space when the antiChat is docked on the right — make the chat overflow, translucent, appearing on
 *  mouse over"): the panel floats over the screen as a ghost and the page keeps its full width. Kept as a
 *  function so a screen can still ask; it answers {} for every state now. (Earlier, 2026-09-18: "fix the antiChat on the right" — it
 *  covered the screen; a docked chat is a COLUMN now, the screen reflows). Pure — tested. */
export function dockInset(_state: { side: DockSide; size: number; collapsed: boolean; full: boolean; chatMode: string }, _pathname: string): React.CSSProperties {
  return {};
}
const fieldHiddenHere = panelHiddenHere;

// a screen claims the floating field for its own function (vibe concierge,
// notebook learn/ask). Registered on mount, cleared on unmount — memo the
// surface object at the caller so this effect doesn't churn.
export function useDockSurface(surface: DockSurface | null) {
  React.useEffect(() => {
    dockStore.set({ surface });
    return () => { if (dockStore.get().surface === surface) dockStore.set({ surface: null }); };
  }, [surface]);
}

// ── shared drag visuals (the floating field + every GlassBar grip) ───────────
const zoneStyle = (s: Exclude<DockSide, null>, active: boolean): React.CSSProperties => ({
  position: "fixed", zIndex: 300, pointerEvents: "none", transition: "opacity .15s ease",
  opacity: active ? 1 : 0.25,
  background: active ? `color-mix(in oklab, ${C.brand} 16%, transparent)` : "transparent",
  border: `1px dashed color-mix(in oklab, ${C.brand} ${active ? 70 : 30}%, transparent)`,
  ...(s === "left" ? { left: 6, top: 6, bottom: 6, width: EDGE - 12 } : s === "right" ? { right: 6, top: 6, bottom: 6, width: EDGE - 12 } : s === "top" ? { top: 6, left: 6, right: 6, height: EDGE - 12 } : { bottom: 6, left: 6, right: 6, height: EDGE - 12 }),
  borderRadius: 12,
});
const footprintStyle = (s: Exclude<DockSide, null>, size: number): React.CSSProperties => ({
  position: "fixed", zIndex: 299, pointerEvents: "none", borderRadius: 10,
  background: `color-mix(in oklab, ${C.panel} 45%, transparent)`,
  border: `1px dashed color-mix(in oklab, ${C.brand} 65%, transparent)`,
  backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
  ...(s === "right" ? { right: 0, top: 0, bottom: 0, width: size } : s === "left" ? { left: 0, top: 0, bottom: 0, width: size } : s === "top" ? { top: 0, left: 0, right: 0, height: size } : { bottom: 0, left: 0, right: 0, height: size }),
});
const ghostStyle = (pos: { x: number; y: number }): React.CSSProperties => ({
  position: "fixed", left: pos.x - 110, top: pos.y - 16, width: 220, height: 32, zIndex: 301, pointerEvents: "none",
  borderRadius: 12, background: `color-mix(in oklab, ${C.panel} 55%, transparent)`,
  border: `1px solid color-mix(in oklab, ${C.brand} 50%, ${C.border})`,
  backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
  display: "flex", alignItems: "center", padding: "0 12px", fontFamily: nav, fontSize: 11.5, color: C.dim, opacity: 0.85,
});

// ── THE GLASS BAR — the new field's skin, for ANY composer (vibe, research…) ──
// semi-transparent ghost at rest, nitid on hover/focus; pure wrapper.
export function GlassBar({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const [hot, setHot] = React.useState(false);
  return (
    <div onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)} onFocusCapture={() => setHot(true)}
      style={{ background: `color-mix(in oklab, ${C.panel} ${hot ? 74 : 34}%, transparent)`, backdropFilter: hot ? "blur(14px)" : "blur(6px)", WebkitBackdropFilter: hot ? "blur(14px)" : "blur(6px)", border: `1px solid color-mix(in oklab, ${C.border} ${hot ? 95 : 55}%, transparent)`, borderRadius: 16, padding: "8px 12px 7px", boxShadow: hot ? "0 10px 34px rgba(0,0,0,.35)" : "0 6px 20px rgba(0,0,0,.18)", opacity: hot ? 1 : 0.5, transition: "all .22s ease", ...style }}>
      {children}
    </div>
  );
}

// ── THE GRIP — self-contained draggable dot-grid: drag to an edge, the chat
// panel docks there. Drop-zone hints + the future-panel footprint + a cursor
// ghost, exactly like the floating field's own grip.
export function DockGrip() {
  const [dragging, setDragging] = React.useState(false);
  const [dragSide, setDragSide] = React.useState<DockSide>(null);
  const [dragPos, setDragPos] = React.useState<{ x: number; y: number } | null>(null);
  const onGrip = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    setDragPos({ x: e.clientX, y: e.clientY });
    const move = (ev: PointerEvent) => { setDragPos({ x: ev.clientX, y: ev.clientY }); setDragSide(sideAt(ev.clientX, ev.clientY)); };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const s = sideAt(ev.clientX, ev.clientY);
      setDragging(false); setDragSide(null); setDragPos(null);
      if (s) dockStore.set({ side: s, collapsed: false });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <>
      <span onPointerDown={onGrip} title="drag to an edge — the chat docks there (left · right · top · bottom)"
        style={{ cursor: "grab", color: C.dim, fontSize: 12, padding: "0 2px", userSelect: "none", touchAction: "none" }}>⠿</span>
      {dragging && (["left", "right", "top", "bottom"] as const).filter((s) => s !== dragSide).map((s) => <div key={s} style={zoneStyle(s, false)} />)}
      {dragging && dragSide && <div style={footprintStyle(dragSide, dockStore.get().size)} />}
      {dragging && dragPos && <div style={ghostStyle(dragPos)}>Message antiloki…</div>}
    </>
  );
}

// the brand mark, bottom-left of the dock (operator 2026-07-24): the monogram "a." at rest, expanding
// to the full "antiLoki." (camelCase) on hover — text + the ember dot, nothing else.
function DockBrand() {
  const [hover, setHover] = React.useState(false);
  return (
    <span onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title="antiLoki"
      style={{ fontFamily: nav, fontWeight: 700, fontSize: 14, letterSpacing: -0.3, color: C.fg, userSelect: "none", whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1, cursor: "default", transition: "color .15s ease" }}>
      {hover ? "antiLoki" : "a"}<span style={{ color: C.brand }}>.</span>
    </span>
  );
}

// ── the shared bottom row: the field + the product tabs ──────────────────────
function DockField({ value, onChange, onEnter, placeholder, hint, right, onDropContext }: any) {
  const { full } = useDock();
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}
        onDragOver={(e: any) => { if (onDropContext && isContextDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
        onDrop={(e: any) => { if (!onDropContext) return; const block = readContextDrop(e); if (block) { e.preventDefault(); onDropContext(block); } }}>
        {/* a TEXTAREA (2026-09-18): a dropped context block keeps its lines; ⏎ sends, ⇧⏎ is a newline; grows to 8 rows */}
        <textarea
          value={value}
          rows={1}
          onChange={(e: any) => { onChange(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(8 * 20, e.target.scrollHeight)}px`; }}
          onKeyDown={(e: any) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEnter(); e.currentTarget.style.height = "auto"; } }}
          placeholder={placeholder}
          style={{ flex: 1, background: "transparent", color: C.fg, border: "none", outline: "none", padding: "2px 2px", fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 13.5, resize: "none", lineHeight: "20px", maxHeight: 160, overflowY: "auto" }}
        />
        {right}
        {/* ⛶ FULLSCREEN (operator 2026-07-27: "at the chat textfield, an expand button") — the
            chat takes the whole viewport; ⇲ (or Esc) hands the screen back. Rides the shared
            store, so it works from the ghost field, the mini panel, and antiDesk's overlay alike. */}
        <button
          onClick={() => { const s0 = dockStore.get(); dockStore.set({ full: !s0.full, collapsed: false, side: s0.side ?? "right" }); }}
          title={full ? "shrink — back to the docked panel (Esc)" : "expand — the chat takes the whole screen"}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, fontSize: 13, fontFamily: mono, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>
          {full ? "⇲" : "⛶"}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* the wordmark bottom-left; the product tabs (antiDesk / antiIDE) left this row on 2026-09-19 —
            the top-center switcher (Threads · X-ray) is the one navigation */}
        <DockBrand />
        <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{hint}</span>
        <span style={{ flex: 1 }} />
        <RebuildQuick />
        <MenuCircle up size={22} />
      </div>
    </>
  );
}

// ── THE DOCK SHELL — the glass chrome, SHARED (operator 2026-07-26: "don't duplicate — mirror"):
// the same anchor/ghost/divider/header serves the shell's mini panel AND antiChat's full-thread
// dock. One dockStore drives both, so side/size/collapse follow you across screens.
export function DockShell({ children, boost = false, label = "chat" }: { children: React.ReactNode; boost?: boolean; label?: string }) {
  const { side, size, collapsed, full } = useDock();
  const [hot, setHot] = React.useState(false);
  React.useEffect(() => { // Esc leaves fullscreen — the fastest way back to the screen underneath
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") dockStore.set({ full: false }); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [full]);
  const horizontal = side === "left" || side === "right";
  const onDivider = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const w = window.innerWidth, h = window.innerHeight;
      let next = size;
      if (side === "right") next = w - ev.clientX;
      else if (side === "left") next = ev.clientX;
      else if (side === "bottom") next = h - ev.clientY;
      else if (side === "top") next = ev.clientY;
      const max = horizontal ? Math.min(680, Math.round(w * 0.6)) : Math.round(h * 0.55);
      const min = horizontal ? 320 : 220;
      dockStore.set({ size: Math.max(min, Math.min(max, Math.round(next))) });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  if (!side || collapsed) return null;
  const nitid = hot || boost || full;
  // THE GHOST (operator 2026-09-19): at rest the docked chat is a translucent overlay — the screen under it
  // stays readable and keeps its full width; the pointer over it (or focus inside) makes it solid.
  const ghost = !nitid;
  const dividerStyle: React.CSSProperties = horizontal ? { width: 5, cursor: "col-resize" } : { height: 5, cursor: "row-resize" };
  // AN OVERLAY AGAIN (2026-09-19; the 2026-09-18 column cost the file review its width): the panel sits
  // over its edge; ghost at rest, solid on hover/focus. dockInset answers {} so <main> spans the window.
  const anchor: React.CSSProperties = full
    ? { top: 0, bottom: 0, left: 0, right: 0 }
    : side === "right"
    ? { top: 0, bottom: 0, right: 0, width: size }
    : side === "left" ? { top: 0, bottom: 0, left: 0, width: size }
    : side === "top" ? { top: 0, left: 0, right: 0, height: size }
    : { bottom: 0, left: 0, right: 0, height: size };
  return (
    <div onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)} onFocusCapture={() => setHot(true)}
      style={{ position: "fixed", zIndex: full ? 380 : 130, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, ...anchor,
        background: ghost ? `color-mix(in oklab, ${C.bg} 62%, transparent)` : C.bg,
        backdropFilter: ghost ? "blur(2px)" : "blur(10px)", WebkitBackdropFilter: ghost ? "blur(2px)" : "blur(10px)",
        opacity: ghost ? 0.55 : 1, transition: "opacity .22s ease, background .22s ease",
        boxShadow: nitid ? "0 10px 40px rgba(0,0,0,.35)" : "0 6px 22px rgba(0,0,0,.18)",
        [side === "right" ? "borderLeft" : side === "left" ? "borderRight" : side === "bottom" ? "borderTop" : "borderBottom"]: `1px solid color-mix(in oklab, ${C.border} ${nitid ? 100 : 60}%, transparent)` } as any}>
      {!full && <div onPointerDown={onDivider} title="drag to resize"
        style={{ ...dividerStyle, position: "absolute", zIndex: 5, background: "transparent", ...(side === "right" ? { left: -2, top: 0, bottom: 0 } : side === "left" ? { right: -2, top: 0, bottom: 0 } : side === "bottom" ? { top: -2, left: 0, right: 0 } : { bottom: -2, left: 0, right: 0 }) } as any} />}
      {/* header — quiet: where it is docked + the ways out */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>{label} · {full ? "fullscreen" : `docked ${side}`}</span>
        <span style={{ flex: 1 }} />
        {!full && (["left", "top", "bottom", "right"] as const).filter((s) => s !== side).map((s) => (
          <button key={s} onClick={() => dockStore.set({ side: s })} title={`dock ${s}`}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, fontSize: 10, fontFamily: mono, padding: "0 2px" }}>{s === "left" ? "⇤" : s === "right" ? "⇥" : s === "top" ? "⤒" : "⤓"}</button>
        ))}
        <button onClick={() => dockStore.set({ full: !full })} title={full ? "shrink — back to the docked panel (Esc)" : "expand — the chat takes the whole screen"}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, fontSize: 11, fontFamily: mono, padding: "0 2px", lineHeight: 1 }}>{full ? "⇲" : "⛶"}</button>
        {!full && <button onClick={() => dockStore.set({ side: null })} title="float again — back to the ghost field"
          style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted, fontSize: 11, fontFamily: mono, padding: "0 2px" }}>◱</button>}
        <button onClick={() => dockStore.set({ collapsed: true, full: false })} title="collapse to the pill (the dock stays on this side)"
          style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, fontSize: 11, fontFamily: mono, padding: "0 2px", lineHeight: 1 }}>▾</button>
      </div>
      {children}
    </div>
  );
}

// ── THE PANEL — the shell's mini chat, now just DockShell + its light transcript ──
export function DockPanel() {
  const { side, collapsed, chatMode } = useDock();
  const { pathname } = useLocation();
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  const [sending, setSending] = React.useState(false);
  // the AI's screen commands await the ✓ here too (the consent gate rides every screen's chat).
  const [pendingUi, setPendingUi] = React.useState<UiCommand[] | null>(null);
  const scroller = React.useRef<HTMLDivElement | null>(null);

  const [ctxPrefs, setCtxPrefs] = React.useState(() => readContextPrefs(null));
  const send = React.useCallback(async (raw: string) => {
    const t = raw.trim();
    if (!t || sending) return;
    dockMsgs.push({ role: "you", md: t });
    dockMsgs.push({ role: "loki", md: "…", pending: true });
    setSending(true); setPendingUi(null); bump();
    try {
      // THE SCREEN'S EYES (operator 2026-07-26: "each screen should have a navigation map"): the
      // mini chat sends the SAME manifest the stage sends — the live lines every screen reports
      // (route, antiIDE selection, agent panes) plus THIS screen's local action map.
      const screenMd = (() => { try { return composeScreenManifest({ extra: screenActionsFor(pathname) }); } catch { return ""; } })();
      // THE SAME ENGINE AS THE THREAD (2026-09-19): the operator's CLI pin (claude / codex / opencode) rides
      // this chat too — before, the docked chat always went to the interviewer's default tier.
      const model = (() => { try { const v = localStorage.getItem("antiloki:chat-engine"); return v && v.startsWith("cli:") ? v : null; } catch { return null; } })();
      // the same automatic context as the thread's chat (auto-context.ts): the picks ride in front of the manifest
      const auto = await fetchAutoContext(t, null);
      const r: any = await sendChatTurn(t, getFeSession(), undefined, undefined, model, undefined, withAutoContext(screenMd, auto.md));
      const d = r?.result ?? r;
      // the turn answers in `response_md` (the interviewer's reply); the older keys stay as fallbacks
      const md = d?.response_md ?? d?.interviewer_response_md ?? d?.presentation_md ?? d?.content_md ?? d?.response ?? "(no reply)";
      const last = dockMsgs[dockMsgs.length - 1];
      if (last?.pending) { last.md = String(md); last.pending = false; if (auto.used.length) last.used = auto.used; }
      if (Array.isArray(d?.ui_commands) && d.ui_commands.length) setPendingUi(d.ui_commands.slice(0, 4));
    } catch (e: any) {
      const last = dockMsgs[dockMsgs.length - 1];
      if (last?.pending) { last.md = `error: ${String(e?.message ?? "the turn failed").slice(0, 160)}`; last.pending = false; }
    } finally { setSending(false); bump(); }
  }, [sending, pathname]);

  // a message typed on the floating field before this panel existed — send it now
  React.useEffect(() => {
    if (dockPending) { const t = dockPending; setDockPending(null); void send(t); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; });

  if (!side || collapsed || panelHiddenHere(pathname, chatMode)) return null;
  return (
    <DockShell boost={sending}>
      {/* the transcript — light on purpose: you, the reply, nothing else */}
      <div ref={scroller} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {dockMsgs.length === 0 && <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, fontStyle: "italic" }}>this chat rides beside your screen — ask while you work.</div>}
        {dockMsgs.map((m, i) => m.role === "you" ? (
          <div key={i} style={{ alignSelf: "flex-end", maxWidth: "88%", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 11px", fontFamily: nav, fontSize: 12.5, color: C.fg }}>{m.md}</div>
        ) : (
          <div key={i} style={{ maxWidth: "96%", fontSize: 13, opacity: m.pending ? 0.55 : 1 }}><Markdown text={m.md} />{m.used?.length ? <UsedChips used={m.used} prefs={ctxPrefs} onPref={(ref, st) => { const next = setContextPref(ctxPrefs, ref, st); setCtxPrefs(next); writeContextPrefs(null, next); }} /> : null}</div>
        ))}
      </div>
      {/* the UI CONSENT GATE — the assistant's screen commands run only on the ✓ click ($0 verbs). */}
      {pendingUi && pendingUi.length > 0 && (
        <div style={{ flexShrink: 0, margin: "0 12px 6px", border: `1px solid color-mix(in oklab, ${C.brand} 45%, ${C.border})`, background: `color-mix(in oklab, ${C.brand} 7%, ${C.panel})`, borderRadius: 9, padding: "5px 10px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: mono, fontSize: 8.5, color: C.brand, textTransform: "uppercase", letterSpacing: 0.8, flexShrink: 0 }}>⚡ wants to</span>
          <span style={{ fontFamily: mono, fontSize: 10, color: C.fg, flex: 1, minWidth: 120 }}>{pendingUi.map(describeUiCommand).join("  ·  ")}</span>
          <button onClick={() => { executeUiCommands(pendingUi); setPendingUi(null); }}
            style={{ background: C.brand, border: "none", color: C.bg, borderRadius: 6, padding: "2px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 700 }}>✓ do it</button>
          <button onClick={() => setPendingUi(null)}
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>
        </div>
      )}
      {/* the SAME field, at home in its panel */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, padding: "8px 12px 7px", display: "flex", flexDirection: "column", gap: 7 }}>
        <DockField value={text} onChange={setText} placeholder={sending ? "thinking…" : "Message antiloki…"} onDropContext={(block: string) => setText((v: string) => appendContext(v, block))}
          hint="⏎ sends here" onEnter={() => { const t = text; setText(""); void send(t); }}
          onTab={(m: string) => { try { sessionStorage.setItem(DOCK_MODE_KEY, m); } catch { /* */ } router.navigate({ to: "/" }); }} />
      </div>
    </DockShell>
  );
}

// ── THE FLOATING FIELD — ghost at rest, draggable to a split. Extracted so antiChat reuses the
// EXACT same field/pill/drag (operator 2026-07-26: "mirror, don't duplicate"); onSend overrides
// where Enter delivers the text (the full chat thread on "/", the mini panel elsewhere).
export function DockGhostField({ onSend }: { onSend?: (t: string) => void }) {

  const { pathname } = useLocation();
  const router = useRouter();
  const { side, collapsed, surface } = useDock();
  const [text, setText] = React.useState("");
  const [hot, setHot] = React.useState(false);
  const [dragSide, setDragSide] = React.useState<DockSide>(null);
  const [dragging, setDragging] = React.useState(false);
  const [dragPos, setDragPos] = React.useState<{ x: number; y: number } | null>(null);
  const setCollapsed = (v: boolean) => dockStore.set({ collapsed: v });
  // collapsed = ONE ghost pill, whether the chat floats or is docked — expanding
  // restores whichever it was.
  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)} title={side ? `open the chat (docked ${side})` : "open the chat dock"}
        onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
        style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 12, zIndex: 140, width: 34, height: 24, borderRadius: 12, cursor: "pointer", display: "grid", placeItems: "center", background: `color-mix(in oklab, ${C.panel} ${hot ? 78 : 22}%, transparent)`, backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: `1px solid color-mix(in oklab, ${C.border} ${hot ? 100 : 35}%, transparent)`, color: hot ? C.brand : C.dim, fontSize: 11, opacity: hot ? 1 : 0.38, transition: "all .2s ease" }}>✦</button>
    );
  }
  if (side) return null; // docked = the panel's job

  // Enter: a registered SURFACE (vibe concierge, notebook learn/ask) takes the
  // text; otherwise SEND to the chat panel (opens right by default) — either
  // way you STAY on your screen.
  const sendToPanel = () => {
    const t = text.trim(); if (!t) return;
    setText("");
    // antiChat wires the FULL thread here — same field, different mouth (mirror, not a fork)
    if (onSend) { onSend(t); dockStore.set({ side: dockStore.get().side ?? "right", collapsed: false }); return; }
    if (surface) { void surface.submit(t); return; }
    setDockPending(t);
    dockStore.set({ side: "right" });
  };
  // a tab click SWITCHES the product surface: live when already on "/", via
  // navigation (+ storage handoff) from anywhere else.
  const go = (mode?: string) => {
    if (pathname === "/") {
      if (mode) window.dispatchEvent(new CustomEvent("antiloki:chat-mode", { detail: mode }));
      return;
    }
    try {
      if (mode) sessionStorage.setItem(DOCK_MODE_KEY, mode);
      if (text.trim()) sessionStorage.setItem(DOCK_DRAFT_KEY, text.trim());
    } catch { /* storage unavailable — the navigation still works */ }
    setText("");
    router.navigate({ to: "/" });
  };
  // the grip: drag toward an edge — a ghost of the field follows the cursor and
  // the hovered spot previews the FUTURE PANEL semi-transparently; release SPLITS.
  const onGrip = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    setDragPos({ x: e.clientX, y: e.clientY });
    const move = (ev: PointerEvent) => { setDragPos({ x: ev.clientX, y: ev.clientY }); setDragSide(sideAt(ev.clientX, ev.clientY)); };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const s = sideAt(ev.clientX, ev.clientY);
      setDragging(false); setDragSide(null); setDragPos(null);
      if (s) dockStore.set({ side: s });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <>
      {dragging && (["left", "right", "top", "bottom"] as const).filter((s) => s !== dragSide).map((s) => <div key={s} style={zoneStyle(s, false)} />)}
      {dragging && dragSide && <div style={footprintStyle(dragSide, dockStore.get().size)} />}
      {dragging && dragPos && <div style={ghostStyle(dragPos)}>Message antiloki…</div>}
      <div onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
        style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 14, zIndex: 140, width: "min(640px, 92vw)", opacity: dragging ? 0.9 : hot ? 1 : 0.42, transition: "opacity .22s ease" }}>
        <div style={{ background: `color-mix(in oklab, ${C.panel} ${hot ? 74 : 34}%, transparent)`, backdropFilter: hot ? "blur(14px)" : "blur(6px)", WebkitBackdropFilter: hot ? "blur(14px)" : "blur(6px)", border: `1px solid color-mix(in oklab, ${C.border} ${hot ? 95 : 55}%, transparent)`, borderRadius: 16, padding: "8px 12px 7px", boxShadow: hot ? "0 10px 34px rgba(0,0,0,.35)" : "0 6px 20px rgba(0,0,0,.18)", display: "flex", flexDirection: "column", gap: 7, transition: "all .22s ease" }}>
          <DockField value={text} onChange={setText} onEnter={sendToPanel} onTab={(m: string) => go(m)}
            onDropContext={(block: string) => setText((v: string) => appendContext(v, block))}
            placeholder={surface?.placeholder ?? "Message antiloki — from anywhere…"}
            hint={surface?.hint ?? "⏎ sends — the chat splits in beside you · drag ⠿ to pick the side"}
            right={<>
              <span onPointerDown={onGrip} title="drag to an edge — the chat docks there (left · right · top · bottom)"
                style={{ cursor: "grab", color: C.dim, fontSize: 12, padding: "0 2px", userSelect: "none", touchAction: "none" }}>⠿</span>
              <button onClick={() => setCollapsed(true)} title="collapse the dock (it stays as a small pill)"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, fontSize: 11, padding: "0 2px", lineHeight: 1 }}>▾</button>
            </>} />
        </div>
      </div>
    </>
  );
}

// the shell's mount: the ghost field everywhere EXCEPT where a full chat owns the screen.
export function Dock() {
  const { pathname } = useLocation();
  const { chatMode } = useDock();
  if (fieldHiddenHere(pathname, chatMode)) return null; // agent chat + settings keep full attention
  return <DockGhostField />;
}
