// A REAL TICK (the operator 2026-11-22: "should be really a tick"): not a beep. A few milliseconds of filtered noise with a tiny low knock under it, the click of a ratchet or a watch. Made with WebAudio, so there is no file; quiet; the context is made on the first use (a key press counts as the gesture).
let ctx: AudioContext | null = null; let click: AudioBuffer | null = null;
/** The samples of one tick: `ms` of noise that dies away at once. Pure given the random source. */
export function tickSamples(rate: number, ms = 14, rnd: () => number = Math.random): Float32Array {
  const n = Math.max(1, Math.round((rate * ms) / 1000)); const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const env = Math.exp((-6 * i) / n); out[i] = (rnd() * 2 - 1) * env; }
  return out;
}
export function playTick(volume = 0.22) {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AC) return;
    ctx = ctx ?? new AC(); if (ctx.state === "suspended") void ctx.resume();
    if (!click) { click = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.014), ctx.sampleRate); click.copyToChannel(tickSamples(ctx.sampleRate) as Float32Array<ArrayBuffer>, 0); }
    const t = ctx.currentTime; const src = ctx.createBufferSource(); src.buffer = click; const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3800; bp.Q.value = 0.9; const g = ctx.createGain(); g.gain.value = volume;
    src.connect(bp).connect(g).connect(ctx.destination); src.start(t);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.012); og.gain.setValueAtTime(volume * 0.5, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.014); o.connect(og).connect(ctx.destination); o.start(t); o.stop(t + 0.02);
  } catch { /* no sound where audio is not allowed */ }
}
