// THE SOUND BAR (operator 2026-11-11: "a sound wave animation in the centre of the screen that vibrates when I talk ... floating, a fixed size, centre bottom, not the size of the agent"). A small glass bar, always the same size, at the bottom centre of the screen: the wave of what the microphone hears, what is
// happening (listening, transcribing, what was sent or what went wrong), and the buttons to send now or throw it away.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { barsFrom } from "./voice";

export type VoicePhase = "listening" | "transcribing" | "sent" | "error";
export const BAR_W = 340; export const BAR_H = 64; const BARS = 28;

/** `source` is read about twenty times a second by the bar itself, so the screen around it is not redrawn for every beat of the wave. */
export function VoiceBar({ phase, who, source, message, onSend, onCancel }: { phase: VoicePhase; who: string; source: { levels: readonly number[] }; message?: string; onSend: () => void; onCancel: () => void }) {
  const [, tick] = React.useState(0);
  React.useEffect(() => { if (phase !== "listening") return; const t = setInterval(() => tick((n) => n + 1), 50); return () => clearInterval(t); }, [phase]);
  const bars = barsFrom(source.levels, BARS); const live = phase === "listening";
  const line = phase === "listening" ? `recording for ${who} · it keeps going until you press Send` : phase === "transcribing" ? "transcribing on this machine…" : phase === "sent" ? (message ?? "sent") : (message ?? "something went wrong");
  const tone = phase === "error" ? C.bad : phase === "sent" ? C.ok : C.fg;
  return (
    <div data-testid="voice-bar" data-phase={phase} role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: 64, transform: "translateX(-50%)", zIndex: 350, width: BAR_W, height: BAR_H, boxSizing: "border-box", padding: "8px 12px", borderRadius: 16, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4,
      background: `color-mix(in oklab, ${C.panel} 82%, transparent)`, border: `1px solid color-mix(in oklab, ${live ? C.brand : C.border} 70%, transparent)`, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", boxShadow: "0 14px 40px -12px rgba(0,0,0,.6)", fontFamily: nav }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 30 }}>
        <span aria-hidden style={{ width: 9, height: 9, borderRadius: 5, flexShrink: 0, background: live ? C.bad : phase === "transcribing" ? C.warn : tone, animation: live ? "antilokiDotPulse 1s ease-in-out infinite" : "none" }} />
        <div data-testid="voice-wave" aria-hidden style={{ flex: 1, height: 28, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          {bars.map((b, i) => <span key={i} style={{ width: 3, borderRadius: 2, height: `${live ? Math.round(b * 100) : phase === "transcribing" ? 18 + ((i * 7) % 5) * 6 : 10}%`, background: live ? C.brand : C.muted, opacity: live ? 0.5 + 0.5 * b : 0.5, transition: "height 60ms linear" }} />)}
        </div>
        {live && <button data-testid="voice-send" aria-label="send" title="stop recording, transcribe on this machine and send" onClick={onSend} style={{ height: 26, borderRadius: 13, border: "none", background: C.brand, color: "#fff", cursor: "pointer", fontFamily: nav, fontSize: 12, fontWeight: 600, padding: "0 12px", lineHeight: 1 }}>Send</button>}
        {(live || phase === "error") && <button data-testid="voice-cancel" aria-label="cancel" title="cancel" onClick={onCancel} style={{ width: 26, height: 26, borderRadius: 13, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 11, lineHeight: 1 }}>✕</button>}
      </div>
      <div data-testid="voice-line" style={{ fontSize: 11.5, color: tone, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line}</div>
    </div>
  );
}
