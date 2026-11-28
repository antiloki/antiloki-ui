// ANTICHAT'S AUTOMATIC CONTEXT (operator 2026-09-21: "each chat is a session, read-only, has access to all the
// context from all agents, automatically chooses and finds the context needed for the answer"). Before a turn the
// serve's deterministic retriever (`POST chat/auto_context`) picks what to attach — the agents' chats, the runs,
// the codebase intel — capped, nothing when nothing matches. The picks come back named (`used`) and are shown
// under the reply as chips the operator can PIN (always ride) or DROP (never ride) for the session. Shared by
// the thread's chat and the dock's mini chat. Pure storage helpers — tested.
import React from "react";
import { C } from "@/loki/theme";
import { apiPost } from "@/loki/api/client";

export type UsedPick = { kind: string; label: string; ref: string; why: string; chars: number };
const usedKey = (session: number | null) => `antiloki:chat-used:${session ?? "fresh"}`;
const prefsKey = (session: number | null) => `antiloki:chat-context:${session ?? "fresh"}`;
export function readUsed(session: number | null): Record<string, UsedPick[]> { try { return JSON.parse(localStorage.getItem(usedKey(session)) ?? "{}") ?? {}; } catch { return {}; } }
export function noteUsed(session: number | null, turnId: number | string, used: UsedPick[]) { try { const m = readUsed(session); m[String(turnId)] = used; const ids = Object.keys(m); for (const k of ids.slice(0, Math.max(0, ids.length - 80))) delete m[k]; localStorage.setItem(usedKey(session), JSON.stringify(m)); } catch { /* full */ } }
export function readContextPrefs(session: number | null): { pins: string[]; drops: string[] } { try { const p = JSON.parse(localStorage.getItem(prefsKey(session)) ?? "{}") ?? {}; return { pins: Array.isArray(p.pins) ? p.pins : [], drops: Array.isArray(p.drops) ? p.drops : [] }; } catch { return { pins: [], drops: [] }; } }
/** pin: always ride (and never dropped); drop: never ride (and unpinned); off: neither. Pure over the stored prefs. */
export function setContextPref(prefs: { pins: string[]; drops: string[] }, ref: string, state: "pin" | "drop" | "off"): { pins: string[]; drops: string[] } {
  const pins = prefs.pins.filter((x) => x !== ref), drops = prefs.drops.filter((x) => x !== ref);
  return { pins: state === "pin" ? [...pins, ref] : pins, drops: state === "drop" ? [...drops, ref] : drops };
}
export function writeContextPrefs(session: number | null, prefs: { pins: string[]; drops: string[] }) { try { localStorage.setItem(prefsKey(session), JSON.stringify(prefs)); } catch { /* full */ } }

/** the serve's picks for an ask: the markdown to ride in front of the screen manifest, and the chips. Never throws. */
export async function fetchAutoContext(ask: string, session: number | null, cap = 8000): Promise<{ md: string; used: UsedPick[] }> {
  try {
    const prefs = readContextPrefs(session);
    const r: any = await apiPost(`/api/v1/chat/auto_context`, { ask, cap, pins: prefs.pins, drops: prefs.drops }, { timeoutMs: 20_000 });
    const d = r?.result ?? r;
    return { md: typeof d?.md === "string" ? d.md : "", used: Array.isArray(d?.used) ? d.used : [] };
  } catch { return { md: "", used: [] }; }
}
/** the screen manifest with the looked-up context in front (the interviewer reads the head first). Pure. */
export function withAutoContext(screenMd: string, autoMd: string): string { return autoMd.trim() ? `${autoMd.trim()}\n\n---\n\n${screenMd}` : screenMd; }

/** the chips under a reply: what rode, pinned first. */
export function UsedChips({ used, prefs, onPref }: { used: UsedPick[]; prefs: { pins: string[]; drops: string[] }; onPref: (ref: string, state: "pin" | "drop" | "off") => void }) {
  if (!used.length) return null;
  const glyph = (k: string) => (k === "agent" ? "◆" : k === "intel" ? "◈" : "⟳");
  return (
    <div data-testid="chat-used" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", margin: "2px 0 6px", fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: C.dim }}>
      <span>used:</span>
      {used.map((u) => { const pinned = prefs.pins.includes(u.ref); return (
        <span key={u.ref} title={`${u.label} · ${u.why} · ${u.chars} chars${pinned ? " · pinned: always rides in this session" : ""}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, border: `1px solid ${pinned ? C.brand : C.border}`, borderRadius: 999, padding: "1px 7px", color: pinned ? C.brand : C.dim }}>
          <span>{glyph(u.kind)} {u.label.replace(/^the chat of the agent /, "").replace(/^the /, "")}</span>
          <button onClick={() => onPref(u.ref, pinned ? "off" : "pin")} title={pinned ? "unpin" : "pin — always include in this session"} style={{ background: "transparent", border: "none", color: pinned ? C.brand : C.muted, cursor: "pointer", padding: 0, fontSize: 10 }}>{pinned ? "★" : "☆"}</button>
          <button onClick={() => onPref(u.ref, "drop")} title="drop — never include in this session" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", padding: 0, fontSize: 10 }}>✕</button>
        </span>); })}
    </div>
  );
}
