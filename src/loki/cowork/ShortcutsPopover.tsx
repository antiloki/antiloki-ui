// THE SHORTCUTS EDITOR (operator 2026-11-10: "all editable"): every action with its chord. Click a chord, press the keys you want, and it is yours; Backspace clears it, Escape leaves
// it as it was. A chord another action holds is refused by name, with a button to take it from them. Nothing here is saved anywhere but this browser.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { ACTIONS, chordOf, labelOf, showChord, type ActionGroup, type ActionId, type Bindings, type Overrides, type SetResult } from "./shortcuts";

const GROUPS: ActionGroup[] = ["Panes", "Threads", "Focus", "Move", "Workspaces", "View", "Look"];

export function ShortcutsPopover({ bindings, overrides, onSet, onClear, onReset, onResetAll, onClose, leader, onLeader }: {
  /** the leader chord: what every shortcut starts with */ leader?: string; onLeader?: (chord: string) => string | null;
  bindings: Bindings; overrides: Overrides; onSet: (id: ActionId, chord: string, take?: boolean) => SetResult; onClear: (id: ActionId) => void; onReset: (id: ActionId) => void; onResetAll: () => void; onClose: () => void;
}) {
  const [recording, setRecording] = React.useState<ActionId | null>(null); const [recordingLeader, setRecordingLeader] = React.useState(false); const [leaderError, setLeaderError] = React.useState("");
  const [problem, setProblem] = React.useState<{ id: ActionId; error: string; holder?: ActionId; chord: string } | null>(null);
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const record = (id: ActionId, e: React.KeyboardEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.key === "Escape") { setRecording(null); setProblem(null); return; }
    if ((e.key === "Backspace" || e.key === "Delete") && !e.altKey && !e.ctrlKey && !e.metaKey) { onClear(id); setRecording(null); setProblem(null); return; }
    const chord = chordOf(e.nativeEvent); if (!chord) return;           // a modifier on its own: keep waiting for the key
    const r = onSet(id, chord);
    if (r.ok) { setRecording(null); setProblem(null); } else setProblem({ id, error: r.error, holder: r.holder, chord });
  };
  const head: React.CSSProperties = { fontFamily: nav, fontSize: 10.5, letterSpacing: "0.05em", color: C.muted, textTransform: "uppercase", padding: "10px 0 4px" };
  const small: React.CSSProperties = { background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: nav, fontSize: 11, padding: "0 4px" };
  return (
    <>
      <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 998 }} />
      <div role="dialog" aria-label="keyboard shortcuts" data-testid="shortcuts" style={{ position: "fixed", right: 12, bottom: 40, zIndex: 999, width: 380, maxHeight: "calc(100vh - 80px)", overflowY: "auto", padding: "6px 14px 12px", borderRadius: 12, border: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.panel2} 92%, transparent)`, backdropFilter: "blur(14px)", boxShadow: "0 18px 50px -12px rgba(0,0,0,.65)", color: C.fg, fontFamily: nav }}>
        {leader && onLeader && (
          <div data-testid="leader" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "2px 0 6px" }}>
            <span style={{ flex: 1 }}>The leader key<span style={{ display: "block", color: C.muted, fontSize: 11 }}>press it, then one key below. Choose one nothing else uses</span></span>
            <button data-testid="leader-chord" data-shortcut-recorder="1" aria-label="the leader key" autoFocus={recordingLeader}
              onClick={() => { setRecordingLeader((o) => !o); setLeaderError(""); }} onKeyDown={recordingLeader ? (e) => { e.preventDefault(); e.stopPropagation(); if (e.key === "Escape") { setRecordingLeader(false); return; } const c = chordOf(e.nativeEvent); if (!c) return; const bad = onLeader(c); if (bad) setLeaderError(bad); else { setRecordingLeader(false); setLeaderError(""); } } : undefined} onBlur={() => setRecordingLeader(false)}
              style={{ minWidth: 92, textAlign: "center", fontFamily: mono, fontSize: 11, padding: "2px 8px", borderRadius: 6, cursor: "pointer", color: recordingLeader ? C.brand : C.fg, background: "transparent", border: "none" }}>{recordingLeader ? "press keys…" : showChord(leader)}</button>
          </div>)}
        {leaderError && <div data-testid="leader-problem" style={{ fontSize: 11, color: C.warn, padding: "0 0 6px" }}>{leaderError}.</div>}
        {GROUPS.map((g) => (
          <div key={g}>
            <div style={head}>{g}</div>
            {ACTIONS.filter((a) => a.group === g).map((a) => {
              const on = recording === a.id; const changed = overrides[a.id] !== undefined; const p = problem?.id === a.id ? problem : null;
              return (
                <div key={a.id} data-testid={`row-${a.id}`} style={{ padding: "2px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{a.label}</span>
                    <button data-testid={`shortcut-${a.id}`} data-shortcut-recorder="1" aria-label={`shortcut for ${a.label}`} autoFocus={on}
                      onClick={() => { setRecording(on ? null : a.id); setProblem(null); }} onKeyDown={on ? (e) => record(a.id, e) : undefined} onBlur={() => { if (recording === a.id) setRecording(null); }}
                      style={{ minWidth: 92, textAlign: "center", fontFamily: mono, fontSize: 11, padding: "2px 8px", borderRadius: 6, cursor: "pointer", color: on ? C.brand : bindings[a.id] ? C.fg : C.muted, border: `1px solid ${on ? C.brand : C.border}`, background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent" }}>
                      {on ? "press keys…" : showChord(bindings[a.id])}
                    </button>
                    <button aria-label={`reset ${a.label}`} title="back to the default" disabled={!changed} onClick={() => { onReset(a.id); setProblem(null); }} style={{ ...small, opacity: changed ? 1 : 0.25, cursor: changed ? "pointer" : "default" }}>↺</button>
                  </div>
                  {p && (
                    <div data-testid="shortcut-problem" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.warn, padding: "2px 0 4px" }}>
                      <span style={{ flex: 1 }}>{p.error}.</span>
                      {p.holder && <button data-testid="shortcut-take" onClick={() => { const r = onSet(a.id, p.chord, true); if (r.ok) { setRecording(null); setProblem(null); } }} style={{ ...small, color: C.brand }}>take it from {labelOf(p.holder)}</button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12, borderTop: `1px solid ${C.border}`, marginTop: 10, fontSize: 11, color: C.muted, lineHeight: 1.45 }}>
          <span style={{ flex: 1 }}>Each key below is pressed after the leader. Click one, then press the key. Backspace clears it, Escape leaves it. Saved in this browser only.</span>
          <button data-testid="shortcuts-reset-all" onClick={onResetAll} disabled={Object.keys(overrides).length === 0} style={{ ...small, color: C.brand, opacity: Object.keys(overrides).length ? 1 : 0.35 }}>restore all</button>
        </div>
      </div>
    </>
  );
}
