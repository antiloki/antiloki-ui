// THE MICROPHONE'S RULES AND ITS RECORDER (operator 2026-11-11: "a microphone on the agent: click, talk, it is transcribed with a local whisper and sent; a sound wave in the middle of the screen that vibrates when I talk").
// The recorder makes the sound into an audio blob and a stream of levels (for the wave); the pure parts decide when someone has finished talking and how tall each bar of the wave is.

/** The loudness of a block of samples (an analyser's time-domain bytes, 128 = silence), 0..1. Pure. */
export function levelOf(bytes: ArrayLike<number>): number {
  if (!bytes.length) return 0; let s = 0; for (let i = 0; i < bytes.length; i++) { const d = (bytes[i] - 128) / 128; s += d * d; }
  return Math.min(1, Math.sqrt(s / bytes.length) * 3.2);   // a speaking voice sits around 0.1-0.3 of full scale: lifted so the wave moves
}
/** THE RECORDING ENDS WHEN THE PERSON SAYS SO (operator 2026-11-11: "voice mode shouldn't be automatic: a send button; while it is not clicked keep recording, use whisper at the end"). No pause detection, no giving up on silence: only a ceiling, so a forgotten
 *  recording does not grow without end (it is stopped and sent at that point). `heard` still notes whether there was any speech, to tell "I did not hear anything" from a transcript that came back empty. Pure state machine - tested. */
export const SPEECH_LEVEL = 0.12; export const MAX_MS = 10 * 60_000;
export type Vad = { heardAt: number | null; startedAt: number };
export const vadStart = (now: number): Vad => ({ heardAt: null, startedAt: now });
export function vadStep(v: Vad, level: number, now: number): { vad: Vad; stop: "max" | null } {
  const vad: Vad = { startedAt: v.startedAt, heardAt: v.heardAt ?? (level >= SPEECH_LEVEL ? now : null) };
  return { vad, stop: now - v.startedAt >= MAX_MS ? "max" : null };
}
/** The wave: the last `n` levels as bar heights in 0..1, oldest on the left, padded with silence; a floor so a quiet bar is still a dot. Pure. */
export function barsFrom(levels: readonly number[], n: number): number[] { const tail = levels.slice(-n); const pad = Array(Math.max(0, n - tail.length)).fill(0); return [...pad, ...tail].map((l) => Math.max(0.06, Math.min(1, l))); }
/** The recording format this browser can make, best first. Pure over what it supports. */
export function pickMime(supports: (m: string) => boolean): string | null { return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find(supports) ?? null; }
/** What to tell the person when the microphone could not be used. Pure. */
export function micError(e: { name?: string; message?: string } | null | undefined, secure: boolean): string {
  if (!secure) return "the browser only lets a page use the microphone on https or localhost: open antiloki through the tunnel (https) or on this machine";
  const n = e?.name ?? "";
  if (n === "NotAllowedError" || n === "SecurityError") return "the microphone is blocked for this page: allow it in the browser's site settings";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "no microphone was found";
  if (n === "NotReadableError") return "the microphone is in use by another program";
  return `could not use the microphone${e?.message ? `: ${e.message}` : ""}`;
}

export type Recording = { blob: Blob; ms: number; heard: boolean };
/** One recording: starts the microphone, calls `onLevel` about 30 times a second, ends by `stop()` (the Send button) or at the ceiling, and resolves with the audio. */
export class Recorder {
  private stream: MediaStream | null = null; private rec: MediaRecorder | null = null; private ctx: AudioContext | null = null; private raf = 0; private chunks: BlobPart[] = [];
  private vad = vadStart(0); private done: ((r: Recording | null) => void) | null = null; private cancelled = false; private startedAt = 0;
  constructor(private onLevel: (l: number) => void, private onAutoStop: (why: "max") => void) {}
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = pickMime((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined); this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.onstop = () => { const heard = this.vad.heardAt !== null; const r = this.cancelled ? null : { blob: new Blob(this.chunks, { type: this.rec?.mimeType || "audio/webm" }), ms: Date.now() - this.startedAt, heard }; this.cleanup(); this.done?.(r); };
    const AC: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext; this.ctx = new AC(); void this.ctx.resume?.().catch(() => {});   /* a context made after an await can start suspended, and then the meter reads pure silence */ const src = this.ctx.createMediaStreamSource(this.stream); const an = this.ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
    const buf = new Uint8Array(an.fftSize); this.startedAt = Date.now(); this.vad = vadStart(this.startedAt); this.rec.start(250);
    const tick = () => { an.getByteTimeDomainData(buf); const l = levelOf(buf); this.onLevel(l); const r = vadStep(this.vad, l, Date.now()); this.vad = r.vad; if (r.stop) { this.onAutoStop(r.stop); return; } this.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
  }
  /** Stop and hand over the audio (null if cancelled). */
  stop(): Promise<Recording | null> { return new Promise((res) => { this.done = res; cancelAnimationFrame(this.raf); if (this.rec && this.rec.state !== "inactive") this.rec.stop(); else { this.cleanup(); res(null); } }); }
  cancel(): void { this.cancelled = true; void this.stop(); }
  private cleanup() { cancelAnimationFrame(this.raf); this.stream?.getTracks().forEach((t) => t.stop()); void this.ctx?.close().catch(() => {}); this.stream = null; this.ctx = null; }
}
