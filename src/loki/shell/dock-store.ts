// THE DOCK STORE (operator 2026-07-20): where the everywhere-chat lives — the
// floating ghost field, or SPLIT against the current screen on any side. Tiny
// external store (no context churn) persisted to localStorage; the transcript
// is module-level so a side switch never loses the conversation.
import React from "react";

export type DockSide = "left" | "right" | "top" | "bottom" | null;
export type DockMsg = { role: "you" | "loki"; md: string; pending?: boolean; /** what the retriever attached to this reply (auto-context.ts) */ used?: { kind: string; label: string; ref: string; why: string; chars: number }[] };
// chatMode mirrors the chat screen's current tab so the docked panel can ride
// vibe/research but stay away from the AGENT chat (operator rule) — published
// by chat-thread, session-scoped (persisting it would lie across reloads).
// surface = a screen's OVERRIDE of the floating field (operator 2026-07-20:
// "remove the chat that is there, reuse this one"): vibe's concierge and the
// notebooks' learn/ask register here, so ONE field serves every surface.
export type DockSurface = { placeholder: string; hint?: string; submit: (t: string) => void | Promise<void> };
type DockState = { side: DockSide; size: number; collapsed: boolean; full: boolean; chatMode: string; surface: DockSurface | null };

const KEY = "antiloki:dock";
function load(): DockState {
  const base: DockState = { side: null, size: 420, collapsed: false, full: false, chatMode: "agent", surface: null };
  try { return { ...base, ...JSON.parse(localStorage.getItem(KEY) ?? "{}"), chatMode: "agent", surface: null }; } catch { return base; }
}

let state: DockState = load();
const subs = new Set<() => void>();
export const dockStore = {
  get: (): DockState => state,
  set: (patch: Partial<DockState>) => {
    state = { ...state, ...patch };
    // only the layout survives a reload — never functions, never the live mode
    try { localStorage.setItem(KEY, JSON.stringify({ side: state.side, size: state.size, collapsed: state.collapsed, full: state.full })); } catch { /* */ }
    subs.forEach((f) => f());
  },
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
};
export function useDock(): DockState {
  return React.useSyncExternalStore(dockStore.subscribe, dockStore.get);
}

// the panel conversation — survives remounts (side switches); session-scoped.
export const dockMsgs: DockMsg[] = [];
// a message typed on the FLOATING field before the panel existed — the panel
// consumes it on mount and sends it.
export let dockPending: string | null = null;
export const setDockPending = (t: string | null) => { dockPending = t; };
