// THE STRIP (RFC 0007 §5.6, §5.9, board v3): one thin bar under the panes. Left: the discreet action icons, always there. Right: the live
// numbers of the focused pane. When a run finishes it cross-fades to the run's summary for a few seconds and back; hovering pauses it.
// The numbers are READ from the pane (usage.json, the hook's files, the transcript): nothing is injected into the CLI, and a field the
// engine did not report is a dash, never a guess.
import * as React from "react";
import { C, mono } from "@/loki/theme";
import { fmtTokens, money, savedSentence, summaryParts, timerFraction, type StripState, type Usage } from "./strip-model";
import type { PaneUsage } from "./api";
import { setStripSlot } from "./strip-slot";

export type StripAction = "commit" | "push" | "browser" | "files" | "terminal";
const svg = (d: React.ReactNode) => <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", verticalAlign: "middle" }}>{d}</svg>;
const ICONS: ReadonlyArray<{ key: StripAction; glyph: React.ReactNode; label: string; tone?: string }> = [
  { key: "commit", glyph: "⎇", label: "Commit — saves what this agent changed in its box as a commit (nothing leaves your machine)", tone: "ok" },
  { key: "push", glyph: "↑", label: "Push — commits what this agent changed and sends it to the remote branch", tone: "ok" },
  { key: "browser", glyph: svg(<><path d="M4 7h16M4 12h16M4 17h10" /><circle cx="19" cy="17" r="1.4" /></>), label: "Light browser — everything running on your ports; click one to see it" },
  { key: "files", glyph: svg(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />), label: "Files — browse the folders of this computer (read only)" },
  { key: "terminal", glyph: ">_", label: "Terminal — opens a new terminal pane" },
];

const mmss = (ms: number): string => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const dim = (c: string) => `color-mix(in oklab, ${c} 70%, transparent)`;

export function Strip({ usage, engineLabel, routeLabel, state, now, reduceMotion, disabled, note, onHover, onLeave, onDismiss, onAction, onAppearance, onShortcuts, onPrompts, trailing, center }: {
  usage: PaneUsage | null; engineLabel: string; routeLabel?: string; state: StripState; now: number; reduceMotion: boolean;
  /** icons that cannot act now, with the reason (e.g. no agent pane is focused) */ disabled?: Partial<Record<StripAction, string>>;
  /** what the last action did, said plainly, for a moment */ note?: { text: string; bad?: boolean } | null;
  onHover: () => void; onLeave: () => void; onDismiss: () => void; onAction: (a: StripAction) => void; /** opens the shortcuts editor */ onShortcuts?: () => void; /** opens the built-in prompts, to read */ onPrompts?: () => void; /** what sits in the middle of the bar (the three screens) */ center?: React.ReactNode; /** what sits at the right end of the bar: the instruments (licence, agents, money, limits, the logo menu) */ trailing?: React.ReactNode; /** opens the appearance popover (opacity, background, themes) */ onAppearance?: () => void;
}) {
  const summary = state.mode === "summary";
  const u: Usage | null = summary ? state.item.usage : usage?.run ?? null;
  const fade: React.CSSProperties = { position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 14, paddingRight: 10, whiteSpace: "nowrap", overflow: "hidden", transition: reduceMotion ? "none" : "opacity .28s ease" };
  const elapsed = usage?.working && usage.run ? now - Date.parse(usage.run.startedT) : null;
  const text = summary ? [state.item.paneName ? `${state.item.paneName}:` : "", "Run finished", ...summaryParts(state.item.usage)].filter(Boolean).join(" · ") : "";
  return (
    <div data-testid="strip" data-mode={state.mode} onMouseEnter={onHover} onMouseLeave={onLeave} onKeyDown={(e) => { if (e.key === "Escape" && summary) onDismiss(); }}
      style={{ position: "relative", height: 30, boxSizing: "border-box", padding: "0 10px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0, fontFamily: mono, fontSize: 11, color: C.muted,
        borderTop: `1px solid ${summary ? C.ok : C.border}`, background: summary ? `color-mix(in oklab, ${C.ok} 9%, ${C.bg})` : `color-mix(in srgb, ${C.panel} min(var(--cw-pane, 100%), 70%), transparent)`, backdropFilter: "blur(var(--cw-blur, 10px))", WebkitBackdropFilter: "blur(var(--cw-blur, 10px))", transition: reduceMotion ? "none" : "background .28s ease, border-color .28s ease" }}>
      {summary && <div data-testid="strip-timer" style={{ position: "absolute", left: 0, top: 0, height: 2, width: `${timerFraction(state) * 100}%`, background: C.ok }} />}
      {/* the run summary has the whole bar: the clock in the middle was drawn over it (2026-11-26) */}
      {center && !note && !summary && <div data-testid="strip-center" style={{ position: "absolute", left: "50%", top: 0, bottom: 0, transform: "translateX(-50%)", display: "flex", alignItems: "center", zIndex: 3 }}>{center}</div>}
      <span role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{text}</span>
      {ICONS.map((i) => (
        <button key={i.key} data-testid={`strip-${i.key}`} aria-label={i.label} data-tip={disabled?.[i.key] ?? i.label} disabled={!!disabled?.[i.key]} onClick={() => onAction(i.key)}
          style={{ background: "transparent", border: "none", padding: "0 3px", cursor: disabled?.[i.key] ? "default" : "pointer", fontFamily: mono, fontSize: 13, lineHeight: "24px", color: disabled?.[i.key] ? dim(C.muted) : i.tone === "ok" ? C.ok : i.tone === "brand" ? C.brand : C.muted, opacity: disabled?.[i.key] ? 0.5 : 1 }}>{i.glyph}</button>
      ))}
      <span style={{ width: 1, height: 14, background: C.border, flexShrink: 0 }} />
      <span ref={setStripSlot} data-testid="strip-team-slot" style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }} />   {/* the team on screen draws its time and cost here (strip-slot.ts) */}
      <div style={{ position: "relative", flex: 1, height: "100%", minWidth: 0 }}>
        {/* the live numbers */}
        <div data-testid="strip-live" aria-hidden={summary} style={{ ...fade, opacity: summary ? 0 : 1, pointerEvents: summary ? "none" : "auto" }}>
          {note && !note.bad && <span data-testid="strip-note" style={{ color: C.ok }}>{note.text}</span>}
        </div>
        {/* a failure is a box above the bar, whole and selectable: one cut line at the bottom reads as "nothing happened" (2026-11-27) */}
        {note?.bad && <div data-testid="strip-note" role="alert" style={{ position: "absolute", left: 0, bottom: "calc(100% + 8px)", width: "max-content", maxWidth: "min(560px, 80vw)", whiteSpace: "normal", wordBreak: "break-word", userSelect: "text", padding: "8px 12px", borderRadius: 8, background: C.panel2, border: `1px solid ${C.bad}`, color: C.bad, fontSize: 12, lineHeight: 1.45, zIndex: 70 }}>{note.text}</div>}
        {/* the run summary */}
        <div data-testid="strip-summary" aria-hidden={!summary} style={{ ...fade, opacity: summary ? 1 : 0, pointerEvents: summary ? "auto" : "none" }}>
          {summary && (
            <>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: C.ok, fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: C.ok }} />{state.item.paneName ? `${state.item.paneName} · ` : ""}Run finished</span>
              {summaryParts(state.item.usage).map((p, i) => <span key={i} style={{ color: p.startsWith("saved") ? C.ok : C.fg }}>{p}</span>)}
              <div style={{ flex: 1 }} />
              {usage?.known && usage.sessionCost !== null && <span style={{ color: C.fg }}>session {money(usage.sessionCost)}</span>}
              <span title={savedSentence(state.item.usage) || "no yardstick for this run"} style={{ color: C.brand }}>details</span>
              <button aria-label="dismiss the summary" data-testid="strip-dismiss" onClick={onDismiss} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 11 }}>✕</button>
            </>
          )}
        </div>
      </div>
      {onPrompts && <button data-testid="strip-prompts" aria-label="built-in prompts" data-tip="Built-in prompts — everything antiloki tells a model, to read" onClick={onPrompts} style={{ background: "transparent", border: "none", padding: "0 3px", cursor: "pointer", fontFamily: mono, fontSize: 13, lineHeight: "24px", color: C.muted }}>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden style={{ display: "block", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" }}><path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3" /></svg>
      </button>}
      {onShortcuts && <button data-testid="strip-shortcuts" aria-label="keyboard shortcuts" data-tip="Keyboard shortcuts — see and change every key binding" onClick={onShortcuts} style={{ background: "transparent", border: "none", padding: "0 3px", cursor: "pointer", fontFamily: mono, fontSize: 14, lineHeight: "24px", color: C.muted }}>⌨</button>}
      {onAppearance && <button data-testid="strip-appearance" aria-label="appearance: opacity, background and themes" data-tip="Appearance — look (pixel, shadow, liquid, minimal), opacity, background and themes" onClick={onAppearance} style={{ background: "transparent", border: "none", padding: "0 3px", cursor: "pointer", fontFamily: mono, fontSize: 14, lineHeight: "24px", color: C.muted }}>◐</button>}
      {trailing && <><span aria-hidden style={{ width: 1, height: 14, background: C.border, flexShrink: 0 }} /><span data-testid="strip-trailing" style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>{trailing}</span></>}
    </div>
  );
}
