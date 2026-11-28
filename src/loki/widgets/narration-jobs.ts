/**
 * NARRATION JOBS — the global background press (operator 2026-07-27: "a loading on the corner
 * bottom right overlaying and running in background so we can switch screens and still will be
 * working"). Everything lives at MODULE level, outside React: navigating away never kills a
 * press, and the audio keeps playing across screens. The dock (narration-player.tsx) is a thin
 * view over this store; the CinematicPlayer drives per-slide audio through slidePlay().
 *
 * One playback at a time (bar mode = the stitched linear listen; slide mode = the video class
 * playing exactly one section and reporting its end). Presses are serial per job — one CPU, one
 * queue, honest pacing.
 */
import { apiPost, BE_URL } from "@/loki/api/client";

// THIS MODULE IS A STATEFUL SINGLETON (jobs Map, listeners, the AudioContext). Under Vite HMR a
// hot swap SPLITS it — buttons write jobs into the new instance while the boot-mounted dock still
// watches the old one: "clicked generate and no pill appeared". Never hot-swap; force a full
// reload instead, so there is exactly one jobs universe per page.
if (import.meta.hot) import.meta.hot.accept(() => { import.meta.hot!.invalidate(); });

export type NarrSeg = {
  ord: number; title: string; est_ms: number; units: number; tokens_est: number;
  status: "queued" | "pressing" | "ready" | "error";
  render_id?: number; buffer?: AudioBuffer; dur?: number;
  prog?: { done: number; total: number };
  timing?: Array<{ i: number; role: string | null; t: number; d: number }>; // per-say clock (Video Cast)
  duration_ms?: number | null; // from the persistent receipt row — the shelf slicer cuts by this
};

/** Live render countdown: tokens still to press, per segment and for the whole job. */
export function segRemainingTokens(s: NarrSeg): number {
  if (s.status === "ready") return 0;
  if (s.status === "pressing" && s.prog && s.prog.total > 0) {
    return Math.max(0, Math.round(s.tokens_est * (1 - s.prog.done / s.prog.total)));
  }
  return s.tokens_est ?? 0;
}
export function jobRemainingTokens(job: NarrJob): number {
  return job.segs.reduce((n, s) => n + segRemainingTokens(s), 0);
}
export type NarrJob = {
  id: number; title: string; voice: string; kind: string;
  phase: "picking" | "pressing" | "ready" | "error";
  segs: NarrSeg[]; error?: string; pressStarted: boolean;
  artifact?: { file: string; duration_ms?: number }; // the permanent shelf copy, once finalized
  meta?: { sessionId?: number; deck?: any }; // cast needs its session; a video-class film needs its deck
};

/** Playback is gated on COMPLETENESS (operator changed course 2026-07-27: "render in the
 *  background everything BEFORE permitting reproduction"). */
export const jobComplete = (j: NarrJob) => j.segs.length > 0 && j.segs.every((s) => !!s.buffer);

const jobs = new Map<number, NarrJob>();
const listeners = new Set<() => void>();
const emit = () => { for (const l of [...listeners]) { try { l(); } catch { /* listener's problem */ } } };
export const subscribeNarration = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const getNarrationJobs = (): NarrJob[] => [...jobs.values()];
export const getNarrationJob = (id: number) => jobs.get(id);

// While the video class plays a narration, IT is the audio surface — the corner dock hides
// (operator: "when playing the video, the audio player doesn't need to appear — it's a video feeling").
let cinemaHold = false;
export function setCinemaHold(v: boolean) { cinemaHold = v; emit(); }
export function getCinemaHold() { return cinemaHold; }

let ctx: AudioContext | null = null;
let master: GainNode | null = null; // every narration source routes here — the film's mute is real
let analyser: AnalyserNode | null = null; // the Video Cast orbs read the live waveform from here
const ensureCtx = () => {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    master.connect(analyser);
    analyser.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};
/** Live frequency spectrum, downsampled to `bins` values 0..1 — the orbs' radial bars dance on this. */
export function getAudioSpectrum(bins = 28): number[] {
  if (!analyser) return new Array(bins).fill(0);
  const raw = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(raw);
  const usable = Math.floor(raw.length * 0.72); // the top of the band is silence at 24k — trim it
  const out = new Array(bins).fill(0);
  for (let b = 0; b < bins; b += 1) {
    const from = Math.floor((b / bins) * usable);
    const to = Math.max(from + 1, Math.floor(((b + 1) / bins) * usable));
    let acc = 0;
    for (let i = from; i < to; i += 1) acc += raw[i];
    out[b] = Math.min(1, acc / (to - from) / 200);
  }
  return out;
}

/** Live output level 0..1 (RMS of the time-domain wave) — the host orbs breathe with this. */
export function getAudioLevel(): number {
  if (!analyser) return 0;
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  let acc = 0;
  for (let i = 0; i < buf.length; i += 1) { const v = (buf[i] - 128) / 128; acc += v * v; }
  return Math.min(1, Math.sqrt(acc / buf.length) * 2.6);
}
export function setNarrationMuted(v: boolean) { if (master) master.gain.value = v ? 0 : 1; }
/**
 * MUST be called inside a user-gesture handler (the ♪/▶ clicks). Browsers only unlock audio for
 * contexts created/resumed within a gesture — the press loop runs in async background, so a
 * context born THERE stays suspended and every buffer plays as silence (the "film stuck on the
 * hold" failure). Arming on the click makes all later background starts audible.
 */
export function armAudio() { ensureCtx(); }
const un = (r: any) => r?.result?.result ?? r?.result ?? r;

export async function startNarrationJob(id: number, title: string, opts?: { voice?: string; autostart?: boolean; kind?: string; meta?: { sessionId?: number; deck?: any } }): Promise<void> {
  // OPERATOR INCIDENT ("clicked play podcast and nothing happened"): the compile succeeded but a
  // STALE cinemaHold (film closed uncleanly) kept the dock invisible. A fresh job from any button
  // reclaims the audio surface — the cinema re-asserts its hold on mount if it is truly open.
  setCinemaHold(false);
  // eslint-disable-next-line no-console
  console.info(`[narr] job requested: #${id} "${title}" kind=${opts?.kind ?? "narration"} · listeners=${listeners.size} · jobs=${jobs.size}`);
  if (listeners.size === 0) {
    // eslint-disable-next-line no-console
    console.error("[narr] NO DOCK IS SUBSCRIBED — the jobs module split (stale HMR) or the dock unmounted. Hard-reload the page (Ctrl+Shift+R).");
  }
  if (jobs.has(id)) {
    // the SAME narration can be requested as different surfaces (paper-read vs video-class share
    // one nir) — merge the richer intent into the existing row instead of ignoring the click.
    const j = jobs.get(id)!;
    if (opts?.meta) j.meta = { ...j.meta, ...opts.meta };
    if (opts?.kind && (j.kind === "narration" || (opts.kind === "video-class" && j.kind === "paper-read"))) j.kind = opts.kind;
    if (opts?.autostart && !j.pressStarted) void beginPress(id, opts?.voice);
    // eslint-disable-next-line no-console
    console.info(`[narr] job #${id} already in the queue — focused + upgraded (kind=${j.kind}${j.meta?.deck ? ", deck attached" : ""})`);
    expandSeq += 1;
    emit();
    return;
  }
  const job: NarrJob = { id, title, voice: opts?.voice ?? "af_heart", kind: opts?.kind ?? "narration", phase: "picking", segs: [], pressStarted: false, meta: opts?.meta };
  jobs.set(id, job);
  emit();
  const r = un(await apiPost("/api/v1/narration/render", { op: "sections", narration_id: id }, { timeoutMs: 20000 }).catch(() => null));
  if (!r?.ok) { job.phase = "error"; job.error = "could not read the section map — BE restarted?"; emit(); return; }
  job.segs = r.sections.map((s: any) => ({ ord: s.ord, title: s.title, est_ms: s.est_ms, units: s.units ?? 0, tokens_est: s.tokens_est ?? 0, status: "queued", render_id: s.render_id ?? undefined, duration_ms: s.duration_ms ?? null, timing: Array.isArray(s.timing) && s.timing.length ? s.timing : undefined }));
  emit();
  if (opts?.autostart) void beginPress(id);
}

export function removeNarrationJob(id: number) {
  if (pb?.jobId === id) stopPlayback();
  jobs.delete(id);
  emit();
}

let autoplayWanted: number | null = null; // playBar fires the moment the WHOLE render lands

// ── DOCK SIGNALS — the artifact store (or any surface) asks the queue panel to open, and a
// video-cast to expand into the film WHEN its render completes (cache-hit = seconds).
let expandSeq = 0;
export function requestDockExpand() { expandSeq += 1; emit(); }
export function getExpandSeq() { return expandSeq; }
let castWanted: { narrationId: number; sessionId: number; title: string } | null = null;
let castRequest: { narrationId: number; sessionId: number; title: string } | null = null;
export function requestCastWhenReady(x: { narrationId: number; sessionId: number; title: string }) {
  castWanted = x;
  const j = jobs.get(x.narrationId);
  if (j && jobComplete(j)) { castRequest = x; castWanted = null; }
  emit();
}
export function consumeCastRequest() { const r = castRequest; castRequest = null; return r; }
let classWanted: { narrationId: number; deck: any; title: string } | null = null;
let classRequest: { narrationId: number; deck: any; title: string } | null = null;
export function requestClassWhenReady(x: { narrationId: number; deck: any; title: string }) {
  classWanted = x;
  const j = jobs.get(x.narrationId);
  if (j && jobComplete(j)) { classRequest = x; classWanted = null; }
  emit();
}
export function consumeClassRequest() { const r = classRequest; classRequest = null; return r; }

export async function beginPress(id: number, voice?: string) {
  const job = jobs.get(id);
  if (!job || job.pressStarted) return;
  if (voice) job.voice = voice;
  job.pressStarted = true;
  job.phase = "pressing";
  emit();
  for (const seg of job.segs) {
    if (!jobs.has(id)) return; // job removed mid-press — stop orchestrating (the current server press finishes alone)
    if (seg.buffer) continue;
    seg.status = "pressing";
    emit();
    try {
      let rid = seg.render_id ?? null;
      if (rid == null) {
        // A START-REQUEST timeout, and only that. `background: true` now means what it says — the
        // engine validates, registers the job and returns; a press lane runs it off the request
        // thread (measured: this call went 48,300ms -> 277ms for a 10-say section). So 30s is a
        // generous budget for "was the job accepted", not a bet on how long audio takes.
        //
        // It was briefly 600_000 while the engine still pressed inline. That was tape over the
        // warning light: it stopped the false "could not start" for audio that WAS being made, but
        // left the press blocking the whole BE. Raising it again would mean the detach regressed —
        // fix the lane, not the number.
        const s = un(await apiPost("/api/v1/narration/render", { op: "render", narration_id: id, section_ord: seg.ord, background: true, voice: job.voice }, { timeoutMs: 30_000 }).catch(() => null));
        if (!s?.ok) throw new Error("could not start the section press");
        for (;;) {
          if (!jobs.has(id)) return;
          await new Promise((r2) => setTimeout(r2, 1800));
          const p = un(await apiPost("/api/v1/narration/render", { op: "progress", narration_id: id, section_ord: seg.ord }, { timeoutMs: 15000 }).catch(() => null));
          if (!p?.ok) continue;
          if (p.error) throw new Error(String(p.error));
          rid = p.render_id ?? (!p.pressing ? p.last_render_id : null);
          if (rid != null) break;
          seg.prog = { done: p.done ?? 0, total: p.total ?? 0 };
          emit();
        }
      }
      const ab = await fetch(`${BE_URL}/api/v1/narration/audio/${rid}`).then((x) => x.arrayBuffer());
      const buf = await ensureCtx().decodeAudioData(ab);
      seg.render_id = rid!;
      seg.buffer = buf;
      seg.dur = buf.duration;
      try { // the say-clock for subtitle/orb sync — best-effort, the audio never waits for it
        const g = un(await apiPost("/api/v1/narration/render", { op: "render_get", render_id: rid }, { timeoutMs: 15000 }).catch(() => null));
        seg.timing = JSON.parse(g?.render?.timing_json ?? "[]");
      } catch { seg.timing = []; }
      seg.status = "ready";
      emit();
      if (pendingSlide && pendingSlide.jobId === id && pendingSlide.ord === seg.ord) {
        const ps = pendingSlide; pendingSlide = null;
        slidePlay(ps.jobId, ps.ord, ps.onEnded);
      }
      // (bar playback can no longer catch up mid-press — reproduction is gated on completeness)
    } catch (e: any) {
      seg.status = "error";
      job.phase = "error";
      job.error = String(e?.message ?? e).slice(0, 160);
      emit();
      return;
    }
  }
  await finishJob(id, { finalize: true });
}

// the completion ceremony — shared by the press loop and the shelf hydration
async function finishJob(id: number, opts: { finalize: boolean; shelfFile?: string }) {
  const done = jobs.get(id);
  if (!done) return;
  done.phase = "ready";
  emit();
  if (autoplayWanted === id) { autoplayWanted = null; playBar(id); } // reproduction begins only now
  if (castWanted && castWanted.narrationId === id) { castRequest = castWanted; castWanted = null; emit(); }
  if (classWanted && classWanted.narrationId === id) { classRequest = classWanted; classWanted = null; emit(); }
  if (opts.shelfFile) { done.artifact = { file: opts.shelfFile }; emit(); return; } // came FROM the shelf — no re-finalize
  // THE PERMANENT SHELF: every completed generation finalizes into .antiloki/sources/artefacts.
  if (opts.finalize) {
    try {
      const f = un(await apiPost("/api/v1/narration/render", { op: "finalize", narration_id: id, kind: done.kind, title: done.title, deck: done.meta?.deck ?? undefined }, { timeoutMs: 60000 }).catch(() => null));
      if (f?.ok) { done.artifact = { file: f.file, duration_ms: f.duration_ms }; emit(); }
    } catch { /* the listen already works from cache; the shelf copy retries on the next full press */ }
  }
}

/**
 * SHELF HYDRATION (operator: "if the artifact is saved, why is rendering taking so long?"):
 * the shelf holds the final concatenation; the receipt rows hold each section's duration and
 * say-clock. Download the artifact ONCE, slice it back into section buffers by those receipts —
 * seconds instead of a re-press. Returns false when receipts are incomplete (pre-timing
 * artifacts) so the caller can fall back to pressing.
 */
export async function hydrateJobFromArtifact(id: number, file: string): Promise<boolean> {
  const job = jobs.get(id);
  if (!job || job.segs.length === 0) return false;
  if (!job.segs.every((s) => s.duration_ms != null && s.duration_ms > 0)) return false;
  try {
    const ab = await fetch(`${BE_URL}/api/v1/artefacts/audio/${encodeURIComponent(file)}`).then((x) => { if (!x.ok) throw new Error(`artefact fetch ${x.status}`); return x.arrayBuffer(); });
    const full = await ensureCtx().decodeAudioData(ab);
    const rate = full.sampleRate;
    const data = full.getChannelData(0);
    let cursor = 0;
    for (const seg of job.segs) {
      const frames = seg === job.segs[job.segs.length - 1]
        ? data.length - cursor // the last slice absorbs rounding drift
        : Math.min(data.length - cursor, Math.round(((seg.duration_ms ?? 0) / 1000) * rate));
      const buf = ctx!.createBuffer(1, Math.max(1, frames), rate);
      buf.getChannelData(0).set(data.subarray(cursor, cursor + frames));
      cursor += frames;
      seg.buffer = buf;
      seg.dur = buf.duration;
      seg.status = "ready";
    }
    // eslint-disable-next-line no-console
    console.info(`[narr] job #${id} hydrated from the shelf (${file}) — no re-press needed`);
    emit();
    await finishJob(id, { finalize: false, shelfFile: file });
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[narr] shelf hydration failed for #${id} (${String((e as any)?.message ?? e)}) — falling back to pressing`);
    return false;
  }
}

export function requestAutoplay(id: number) { autoplayWanted = id; }

// ── PLAYBACK — one source at a time; bar mode chains sections, slide mode reports its end.
type Pb = {
  jobId: number; mode: "bar" | "slide"; idx: number; offset: number; startedAt: number;
  src: AudioBufferSourceNode | null; playing: boolean; waiting: boolean; onSlideEnded?: () => void;
};
let pb: Pb | null = null;
let pendingSlide: { jobId: number; ord: number; onEnded: () => void } | null = null;

const durOf = (s: NarrSeg) => s.dur ?? s.est_ms / 1000;

function startSeg(job: NarrJob, idx: number, offset: number, mode: "bar" | "slide", onSlideEnded?: () => void) {
  const seg = job.segs[idx];
  const ac = ensureCtx();
  try { if (pb?.src) { pb.src.onended = null; pb.src.stop(); } } catch { /* already dead */ }
  if (!seg?.buffer) {
    pb = { jobId: job.id, mode, idx, offset, startedAt: 0, src: null, playing: true, waiting: true, onSlideEnded };
    emit();
    return;
  }
  const src = ac.createBufferSource();
  src.buffer = seg.buffer;
  src.connect(master ?? ac.destination);
  const me: Pb = { jobId: job.id, mode, idx, offset, startedAt: ac.currentTime - offset, src, playing: true, waiting: false, onSlideEnded };
  src.onended = () => {
    if (pb !== me || !me.playing) return;
    if (mode === "slide") { me.playing = false; emit(); onSlideEnded?.(); return; }
    const next = idx + 1;
    if (next >= job.segs.length) { pb = null; emit(); return; }
    startSeg(job, next, 0, "bar");
  };
  pb = me;
  src.start(0, offset);
  emit();
}

export function playBar(jobId: number, at?: { idx: number; offset: number }) {
  const job = jobs.get(jobId);
  if (!job) return;
  if (!jobComplete(job)) return; // the gate: no reproduction until the WHOLE render is done
  const from = at ?? (pb?.jobId === jobId && pb.mode === "bar" ? { idx: pb.idx, offset: pb.offset } : { idx: 0, offset: 0 });
  startSeg(job, from.idx, from.offset, "bar");
}

export function pausePlayback() {
  if (!pb || !pb.playing) return;
  if (pb.src && ctx) pb.offset = Math.max(0, ctx.currentTime - pb.startedAt);
  try { if (pb.src) { pb.src.onended = null; pb.src.stop(); } } catch { /* */ }
  pb.playing = false;
  pb.src = null;
  emit();
}

export function stopPlayback() {
  try { if (pb?.src) { pb.src.onended = null; pb.src.stop(); } } catch { /* */ }
  pb = null;
  emit();
}

export function seekBar(jobId: number, seconds: number) {
  const job = jobs.get(jobId);
  if (!job) return;
  let t = Math.max(0, seconds);
  for (const seg of job.segs) {
    const d = durOf(seg);
    if (t <= d) {
      if (!seg.buffer) return; // dim region — still pressing
      const wasPlaying = pb?.jobId === jobId ? pb.playing : true;
      if (wasPlaying) startSeg(job, seg.ord, t, "bar");
      else pb = { jobId, mode: "bar", idx: seg.ord, offset: t, startedAt: 0, src: null, playing: false, waiting: false };
      emit();
      return;
    }
    t -= d;
  }
}

export function slidePlay(jobId: number, ord: number, onEnded: () => void): boolean {
  const job = jobs.get(jobId);
  const seg = job?.segs[ord];
  if (!job) return false;
  if (!seg?.buffer) { pendingSlide = { jobId, ord, onEnded }; return false; }
  pendingSlide = null;
  startSeg(job, ord, 0, "slide", onEnded);
  return true;
}
export function slidePause() { pausePlayback(); }
export function slideResume() {
  if (!pb || pb.mode !== "slide") return;
  const job = jobs.get(pb.jobId);
  if (job) startSeg(job, pb.idx, pb.offset, "slide", pb.onSlideEnded);
}
export function slideStop() { pendingSlide = null; stopPlayback(); }

export function getPlayback() {
  if (!pb) return null;
  const job = jobs.get(pb.jobId);
  if (!job) return null;
  const inSeg = pb.playing && !pb.waiting && ctx ? Math.max(0, ctx.currentTime - pb.startedAt) : pb.offset;
  const before = job.segs.slice(0, pb.idx).reduce((n, s) => n + durOf(s), 0);
  return {
    jobId: pb.jobId, mode: pb.mode, idx: pb.idx, playing: pb.playing, waiting: pb.waiting,
    seconds: before + Math.min(inSeg, durOf(job.segs[pb.idx] ?? ({ est_ms: 0 } as NarrSeg))),
    segSeconds: Math.min(inSeg, durOf(job.segs[pb.idx] ?? ({ est_ms: 0 } as NarrSeg))),
  };
}
export const segDuration = durOf;
