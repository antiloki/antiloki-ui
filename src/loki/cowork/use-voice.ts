// THE MICROPHONE'S CONTROLLER (operator 2026-11-11): one recording at a time, for one agent. Click the mic: it records (the sound bar shows the wave) and KEEPS recording, however long the pauses, until the Send button (or a second click on the mic) ends it; only then is it transcribed on this machine, and the words are
// typed into that agent and sent. Everything that can go wrong says so in the bar.
import * as React from "react";
import { sendToAgent, transcribe, voiceStatus } from "./api";
import { micError, Recorder } from "./voice";
import type { VoicePhase } from "./VoiceBar";

export type VoiceState = { phase: VoicePhase; paneKey: string; paneId: number; who: string; message?: string };
export const SENT_SHOWN_MS = 5000; export const ERROR_SHOWN_MS = 7000;
/** The sentence after a send. Pure. */
export function sentLine(who: string, text: string): string { const t = text.length > 70 ? `${text.slice(0, 69)}…` : text; return `sent to ${who}: “${t}”`; }

export function useVoice(): { voice: VoiceState | null; source: { levels: number[] }; toggle: (pane: { key: string; paneId: number; who: string }) => void; send: () => void; cancel: () => void } {
  const [voice, setVoice] = React.useState<VoiceState | null>(null);
  const source = React.useRef<{ levels: number[] }>({ levels: [] }).current;
  const rec = React.useRef<Recorder | null>(null); const target = React.useRef<VoiceState | null>(null); const hide = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (v: VoiceState | null, ms = 0) => { target.current = v; setVoice(v); if (hide.current) clearTimeout(hide.current); if (v && ms) hide.current = setTimeout(() => { if (target.current === v) { target.current = null; setVoice(null); } }, ms); };
  React.useEffect(() => () => { rec.current?.cancel(); if (hide.current) clearTimeout(hide.current); }, []);

  const finish = React.useCallback(async () => {
    const r = rec.current; const t = target.current; if (!r || !t) return; rec.current = null;
    const got = await r.stop(); if (!got) { show(null); return; }
    // THE SPEECH MODEL DECIDES WHETHER THERE WERE WORDS, NOT THE METER (operator 2026-11-26: "i speak and it never listens"): a quiet microphone stayed under the meter's line and the recording was thrown away unread
    if (got.ms < 500) { show({ ...t, phase: "error", message: "too short: click the microphone, speak, then send" }, ERROR_SHOWN_MS); return; }
    show({ ...t, phase: "transcribing" });
    const text = await transcribe(got.blob);
    if (!text.ok) { show({ ...t, phase: "error", message: text.error }, ERROR_SHOWN_MS); return; }
    if (!text.text.trim()) { show({ ...t, phase: "error", message: got.heard ? "I could not make out any words" : "I did not hear anything: check which microphone the browser is using and its volume" }, ERROR_SHOWN_MS); return; }
    const sent = await sendToAgent(t.paneId, text.text);
    show(sent.ok ? { ...t, phase: "sent", message: sentLine(t.who, text.text) } : { ...t, phase: "error", message: sent.error ?? "could not send it" }, sent.ok ? SENT_SHOWN_MS : ERROR_SHOWN_MS);
  }, []);

  const start = React.useCallback(async (pane: { key: string; paneId: number; who: string }) => {
    const st = await voiceStatus();
    if (!st.available) { show({ phase: "error", paneKey: pane.key, paneId: pane.paneId, who: pane.who, message: st.hint ?? "there is no speech-to-text on this machine" }, ERROR_SHOWN_MS); return; }
    source.levels = []; const t: VoiceState = { phase: "listening", paneKey: pane.key, paneId: pane.paneId, who: pane.who };
    const r = new Recorder((l) => { source.levels.push(l); if (source.levels.length > 120) source.levels.splice(0, source.levels.length - 120); }, () => void finish());
    rec.current = r; show(t);
    try { await r.start(); } catch (e: any) { rec.current = null; show({ ...t, phase: "error", message: micError(e, typeof window !== "undefined" ? window.isSecureContext : true) }, ERROR_SHOWN_MS); }
  }, [finish, source]);

  const toggle = React.useCallback((pane: { key: string; paneId: number; who: string }) => {
    const cur = target.current;
    if (cur?.phase === "listening") { if (cur.paneKey === pane.key) void finish(); else { rec.current?.cancel(); rec.current = null; void start(pane); } return; }
    if (cur?.phase === "transcribing") return;
    void start(pane);
  }, [finish, start]);
  const cancel = React.useCallback(() => { rec.current?.cancel(); rec.current = null; show(null); }, []);
  return { voice, source, toggle, send: () => void finish(), cancel };
}
