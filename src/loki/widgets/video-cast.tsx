/**
 * VIDEO CAST (operator 2026-07-27): "a mix of video class and podcast" — the reasoning session's
 * two-voice audio drives a film: slides pressed at compile time (one per audio section), live
 * subtitles COLORED PER HOST, and two orb-hosts overlaying the slide — colored border + shadow
 * breathing with the REAL waveform (AnalyserNode), like an AI presence, though nothing here is
 * AI at play time. A NEW surface: the CinematicPlayer is untouched; this reuses the podcast
 * (reasoning IR + sectional press + per-say timing) and the jobs engine underneath.
 */
import React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import { apiPost } from "@/loki/api/client";
import {
  getNarrationJob, subscribeNarration, slidePlay, slidePause, slideResume, slideStop,
  setCinemaHold, getPlayback, getAudioLevel, getAudioSpectrum, jobRemainingTokens, segRemainingTokens,
} from "./narration-jobs";

const un = (r: any) => r?.result?.result ?? r?.result ?? r;
// voice id → orb identity; the session's OWN voices decide which two hosts appear
const VOICE_META: Record<string, { name: string; color: string }> = {
  af_heart: { name: "Heart", color: "#e8a0b4" },
  af_bella: { name: "Bella", color: "#f0b08a" },
  af_nicole: { name: "Nicole", color: "#c5a8e8" },
  am_adam: { name: "Adam", color: "#8ea8e8" },
  am_michael: { name: "Michael", color: "#9db4c8" },
  bf_emma: { name: "Emma", color: "#e8c98a" },
  bm_george: { name: "George", color: "#7fd1c8" },
  bm_lewis: { name: "Lewis", color: "#9fd18f" },
};
const HOST_FALLBACK_A = { name: "Guide", color: "#e8a0b4" };
const HOST_FALLBACK_B = { name: "Reasoner", color: "#7fd1c8" };
const fmtTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.max(0, Math.round(n))));

let castCss = false;
function ensureCastCss() {
  if (castCss || typeof document === "undefined") return;
  castCss = true;
  const s = document.createElement("style");
  s.id = "loki-video-cast-css";
  s.textContent = [
    "@keyframes vcIn{from{opacity:0}to{opacity:1}}",
    "@keyframes vcSlideUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}",
    "@keyframes vcPulse{0%,100%{opacity:1}50%{opacity:.5}}",
    "@keyframes vcIdle{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}",
  ].join("");
  document.head.appendChild(s);
}

type Slide = { topic: string; big: string; bullets: string[]; widget?: { type: string; payload: any } | null };

// ── THE SKETCHED PROOFS — excalidraw-flavored SVG evidence, deterministic wobble seeded by slide.
// Every line is the claim's own number wearing a hand-drawn coat; no library, no randomness.
function wob(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 4294967296 - 0.5) * 3.2; };
}
function sketchPath(x1: number, y1: number, x2: number, y2: number, w: () => number) {
  const mx = (x1 + x2) / 2 + w();
  const my = (y1 + y2) / 2 + w();
  return `M ${x1 + w()} ${y1 + w()} Q ${mx} ${my} ${x2 + w()} ${y2 + w()}`;
}
function SketchWidget({ widget, seed, tint }: { widget: { type: string; payload: any }; seed: number; tint: string }) {
  const w = wob(seed);
  const p = widget.payload ?? {};
  const line = (x1: number, y1: number, x2: number, y2: number, c = tint, o = 0.9, sw = 2) => (
    <path d={sketchPath(x1, y1, x2, y2, w)} fill="none" stroke={c} strokeWidth={sw} opacity={o} strokeLinecap="round" />
  );
  const box = (x: number, y: number, bw: number, bh: number, c = tint, o = 0.85) => (
    <g opacity={o}>
      {line(x, y, x + bw, y, c, 1, 2)}{line(x + bw, y, x + bw, y + bh, c, 1, 2)}
      {line(x + bw, y + bh, x, y + bh, c, 1, 2)}{line(x, y + bh, x, y, c, 1, 2)}
    </g>
  );
  const label = (x: number, y: number, text: string, size = 11, c = "#cfd2da", anchor: any = "middle", weight = 500) => (
    <text x={x} y={y} fontSize={size} fill={c} textAnchor={anchor} fontFamily='"JetBrains Mono", monospace' fontWeight={weight}>{text}</text>
  );
  const W = 560;
  const H = 240;
  const dim = "color-mix(in oklab, #cfd2da 40%, transparent)";
  let body: React.ReactNode = null;

  if (widget.type === "gauge") {
    const v = Math.max(0, Math.min(1, Number(p.value ?? 0) / Number(p.max ?? 100)));
    const cx = W / 2, cy = 168, R = 108;
    const arc = (from: number, to: number, c: string, sw2: number, o = 1) => {
      const a1 = Math.PI * (1 + from), a2 = Math.PI * (1 + to);
      const x1 = cx + Math.cos(a1) * R, y1 = cy + Math.sin(a1) * R;
      const x2 = cx + Math.cos(a2) * R, y2 = cy + Math.sin(a2) * R;
      return <path d={`M ${x1} ${y1} A ${R} ${R} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2} ${y2}`} fill="none" stroke={c} strokeWidth={sw2} opacity={o} strokeLinecap="round" />;
    };
    const na = Math.PI * (1 + v);
    body = (
      <g>
        {arc(0, 1, dim, 5, 0.5)}
        {arc(0, v, tint, 7)}
        {line(cx, cy, cx + Math.cos(na) * (R - 22), cy + Math.sin(na) * (R - 22), tint, 1, 3)}
        {label(cx, cy - 26, String(p.value ?? ""), 34, "#fff", "middle", 750)}
        {label(cx, cy + 2, String(p.label ?? ""), 11, dim)}
        {p.sub ? label(cx, cy + 22, String(p.sub), 9, dim) : null}
        {label(cx - R, cy + 20, "0", 9, dim)}
        {label(cx + R, cy + 20, String(p.max ?? 100), 9, dim)}
      </g>
    );
  } else if (widget.type === "balance") {
    const gap = Number(p.gap ?? 0);
    const lv = Number(p.left?.value ?? 0), rv = Number(p.right?.value ?? 0);
    const lh = 30 + (lv / 100) * 120, rh = 30 + (rv / 100) * 120;
    body = (
      <g>
        {box(90, 190 - lh, 110, lh, "#e07a6a")}
        {box(360, 190 - rh, 110, rh, "#79c98f")}
        {label(145, 210, String(p.left?.label ?? "left"), 10, dim)}
        {label(415, 210, String(p.right?.label ?? "right"), 10, dim)}
        {label(145, 190 - lh - 10, String(lv), 20, "#e07a6a", "middle", 700)}
        {label(415, 190 - rh - 10, String(rv), 20, "#79c98f", "middle", 700)}
        {line(210, 120, 350, 120, tint, 0.9, 2)}
        {label(280, 108, `${gap} points apart`, 12, tint, "middle", 650)}
        {line(280, 124, 280, 138, tint, 0.6, 2)}
      </g>
    );
  } else if (widget.type === "focus") {
    const n = Math.max(1, Math.min(9, Number(p.count ?? 3)));
    const cx = W / 2, cy = 118;
    body = (
      <g>
        {Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(a) * 150, y = cy + Math.sin(a) * 76;
          return (
            <g key={i}>
              {line(cx, cy, x, y, dim, 0.6, 1.5)}
              {box(x - 26, y - 12, 52, 24, dim, 0.8)}
              {label(x, y + 4, `file ${i + 1}`, 8, dim)}
            </g>
          );
        })}
        {box(cx - 78, cy - 20, 156, 40, tint)}
        {label(cx, cy + 5, String(p.center ?? "").slice(0, 20), 12, "#fff", "middle", 700)}
        {label(cx, 218, String(p.note ?? ""), 11, tint)}
      </g>
    );
  } else if (widget.type === "flow") {
    const steps: string[] = (p.steps ?? []).slice(0, 4);
    const bw = 150, gap2 = (W - steps.length * bw) / (steps.length + 1);
    body = (
      <g>
        {steps.map((s2, i) => {
          const x = gap2 + i * (bw + gap2);
          return (
            <g key={i}>
              {box(x, 92, bw, 52, i === 0 ? tint : dim, i === 0 ? 1 : 0.85)}
              {label(x + bw / 2, 122, s2.slice(0, 22), 10, i === 0 ? "#fff" : "#cfd2da")}
              {i < steps.length - 1 ? line(x + bw + 4, 118, x + bw + gap2 - 6, 118, tint, 0.9, 2.5) : null}
              {i < steps.length - 1 ? label(x + bw + gap2 / 2, 108, "→", 14, tint) : null}
            </g>
          );
        })}
      </g>
    );
  } else if (widget.type === "orbit") {
    const blast = Math.max(0, Math.min(14, Number(p.blast ?? 6)));
    const cx = W / 2, cy = 120;
    body = (
      <g>
        <ellipse cx={cx} cy={cy} rx={170} ry={78} fill="none" stroke={dim} strokeWidth={1.5} strokeDasharray="5 7" opacity={0.7} />
        {Array.from({ length: blast }, (_, i) => {
          const a = (i / blast) * Math.PI * 2;
          const x = cx + Math.cos(a) * 170, y = cy + Math.sin(a) * 78;
          return <circle key={i} cx={x + w()} cy={y + w()} r={5} fill="none" stroke={dim} strokeWidth={1.6} />;
        })}
        {box(cx - 62, cy - 24, 124, 48, tint)}
        {label(cx, cy - 2, `${p.blast ?? "?"} dependents`, 11, "#fff", "middle", 650)}
        {label(cx, cy + 16, `cohesion ${p.cohesion ?? "?"}%`, 10, tint)}
      </g>
    );
  } else if (widget.type === "timeline") {
    const evs: string[] = (p.events ?? []).slice(0, 4);
    body = (
      <g>
        {line(60, 128, W - 60, 128, dim, 0.8, 2)}
        {evs.map((e, i) => {
          const x = 90 + (i * (W - 180)) / Math.max(1, evs.length - 1);
          return (
            <g key={i}>
              <circle cx={x} cy={128} r={7} fill="none" stroke={i === evs.length - 1 ? tint : dim} strokeWidth={2.4} />
              {label(x, i % 2 === 0 ? 100 : 164, e.slice(0, 30), 10, i === evs.length - 1 ? tint : "#cfd2da")}
            </g>
          );
        })}
      </g>
    );
  } else { // 'list' and anything future
    const steps: string[] = (p.steps ?? []).slice(0, 4);
    body = (
      <g>
        {p.title ? label(W / 2, 66, String(p.title), 11, dim) : null}
        {steps.map((s2, i) => (
          <g key={i}>
            {box(70, 84 + i * 40, W - 140, 30, i === 0 ? tint : dim, i === 0 ? 1 : 0.8)}
            {label(W / 2, 104 + i * 40, s2.slice(0, 60), 10.5, i === 0 ? "#fff" : "#cfd2da")}
          </g>
        ))}
      </g>
    );
  }
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "min(620px, 78vw)", height: "auto" }}>{body}</svg>;
}

// ── THE SPECTRUM ORB — a glowing ring crowned with radial bars riding the live frequency data
// (operator's reference: the audio-spectrum ring; our palette, their language).
function SpectrumOrb({ color, name, active }: { color: string; name: string; active: boolean }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const phase = React.useRef(0);
  React.useEffect(() => {
    let raf = 0;
    const cv = ref.current;
    if (!cv) return;
    const ctx2 = cv.getContext("2d");
    if (!ctx2) return;
    const S = 170;
    cv.width = S * 2; cv.height = S * 2; // retina
    ctx2.scale(2, 2);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      phase.current += 0.02;
      const spec = active ? getAudioSpectrum(36) : [];
      const lvl = active ? getAudioLevel() : 0;
      ctx2.clearRect(0, 0, S, S);
      const cx = S / 2, cy = S / 2, R = 42;
      // the core — bloom scaled by level (or a slow idle breath)
      const breathe = active ? lvl : 0.08 + 0.05 * Math.sin(phase.current * 1.4);
      const g = ctx2.createRadialGradient(cx, cy, 2, cx, cy, R + 26 + breathe * 30);
      g.addColorStop(0, color + "cc");
      g.addColorStop(0.35, color + "44");
      g.addColorStop(1, "transparent");
      ctx2.fillStyle = g;
      ctx2.beginPath(); ctx2.arc(cx, cy, R + 26 + breathe * 30, 0, Math.PI * 2); ctx2.fill();
      // the ring
      ctx2.strokeStyle = color;
      ctx2.lineWidth = 2.2;
      ctx2.shadowColor = color;
      ctx2.shadowBlur = 10 + breathe * 26;
      ctx2.beginPath(); ctx2.arc(cx, cy, R, 0, Math.PI * 2); ctx2.stroke();
      // the radial bars — the spectrum, mirrored for symmetry; idle = a soft sine crown
      const N = 36;
      ctx2.lineWidth = 2.6;
      ctx2.lineCap = "round";
      for (let i = 0; i < N; i += 1) {
        const a = (i / N) * Math.PI * 2 - Math.PI / 2;
        const v = active
          ? (spec[i % spec.length] ?? 0)
          : 0.06 + 0.04 * Math.sin(phase.current * 2 + i * 0.7);
        const len = 4 + v * 34;
        const x1 = cx + Math.cos(a) * (R + 4), y1 = cy + Math.sin(a) * (R + 4);
        const x2 = cx + Math.cos(a) * (R + 4 + len), y2 = cy + Math.sin(a) * (R + 4 + len);
        ctx2.globalAlpha = active ? 0.55 + v * 0.45 : 0.35;
        ctx2.beginPath(); ctx2.moveTo(x1, y1); ctx2.lineTo(x2, y2); ctx2.stroke();
      }
      ctx2.globalAlpha = 1;
      ctx2.shadowBlur = 0;
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [active, color]);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: active ? 1 : 0.6, transition: "opacity .5s ease" }}>
      <canvas ref={ref} style={{ width: 170, height: 170 }} />
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: active ? color : `color-mix(in oklab, ${color} 45%, transparent)` }}>{name}</span>
    </div>
  );
}

export function VideoCastPlayer({ narrationId, sessionId, title, onClose }: {
  narrationId: number; sessionId: number; title: string; onClose: () => void;
}) {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const [slides, setSlides] = React.useState<Slide[]>([]);
  const [hostA, setHostA] = React.useState(HOST_FALLBACK_A);
  const [hostB, setHostB] = React.useState(HOST_FALLBACK_B);
  const [units, setUnits] = React.useState<any[]>([]);
  const [idx, setIdx] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [wait, setWait] = React.useState(false);
  const [castNonce, setCastNonce] = React.useState(0); // bump = replay the scene's audio (cached)
  const playingRef = React.useRef(true);
  playingRef.current = playing;
  const idxRef = React.useRef(0);
  idxRef.current = idx;
  const aliveRef = React.useRef(true);

  // the film owns the audio surface; the corner dock steps aside (same contract as the cinema)
  React.useEffect(() => { ensureCastCss(); setCinemaHold(true); return () => { setCinemaHold(false); slideStop(); }; }, []);
  React.useEffect(() => subscribeNarration(() => force()), []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") jump(1);
      if (e.key === "ArrowLeft") jump(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the session's pressed slides + the narration's units (subtitle text + roles by unit index)
  React.useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      const sRes = un(await apiPost("/api/v1/reasoning/manage", { op: "get", session_id: sessionId }, { timeoutMs: 20000 }).catch(() => null));
      const nRes = un(await apiPost("/api/v1/narration/manage", { op: "get", narration_id: narrationId }, { timeoutMs: 20000 }).catch(() => null));
      if (!aliveRef.current) return;
      setSlides(sRes?.session?.ir?.slides ?? []);
      setUnits(nRes?.narration?.ir?.units ?? []);
      const v = sRes?.session?.ir?.voices ?? {};
      setHostA(VOICE_META[v.a] ?? HOST_FALLBACK_A);
      setHostB(VOICE_META[v.b] ?? HOST_FALLBACK_B);
    })();
    return () => { aliveRef.current = false; };
  }, [sessionId, narrationId]);

  // per-scene audio: play the section; hold honestly while it presses; its end advances the film
  React.useEffect(() => {
    const job = getNarrationJob(narrationId);
    if (!job) return;
    const onEnded = () => {
      if (!playingRef.current || !aliveRef.current) return;
      if (idxRef.current < (getNarrationJob(narrationId)?.segs.length ?? 1) - 1) setIdx((x) => x + 1);
      else setPlaying(false);
    };
    const tryPlay = () => { const ok = slidePlay(narrationId, idx, onEnded); setWait(!ok); return ok; };
    let unsub: null | (() => void) = null;
    if (!tryPlay()) unsub = subscribeNarration(() => { if (playingRef.current && tryPlay() && unsub) { unsub(); unsub = null; } });
    return () => { if (unsub) unsub(); slideStop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, narrationId, castNonce]);

  // the clock — subtitle + orb activity ride the real playback position and the real waveform
  const [, tick] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    let raf = 0;
    const loop = () => { tick(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const job = getNarrationJob(narrationId);
  const seg = job?.segs[idx];
  const pl = getPlayback();
  const ms = pl && pl.mode === "slide" && pl.jobId === narrationId ? pl.segSeconds * 1000 : 0;
  const entry = (seg?.timing ?? []).filter((e) => e.t <= ms).pop() ?? null;
  const speaking = entry && ms < entry.t + entry.d ? entry : null;
  const subUnit = speaking ? units[speaking.i] : null;
  const level = speaking ? getAudioLevel() : 0;
  const activeRole = speaking?.role ?? null;
  const slide = slides.find((s) => s.topic === (seg?.title ?? "")) ?? slides[idx] ?? null;

  const jump = (di: number) => {
    const n = Math.max(0, Math.min((job?.segs.length ?? 1) - 1, idxRef.current + di));
    if (n !== idxRef.current) { setIdx(n); setPlaying(true); }
  };

  const orb = (host: { color: string; name: string }, role: "a" | "b", side: "left" | "right") => (
    <div style={{ position: "absolute", [side]: "4.5%", bottom: "22%", zIndex: 5 } as React.CSSProperties}>
      <SpectrumOrb color={host.color} name={host.name} active={activeRole === role} />
    </div>
  );

  const BAR = 52;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1500, background: "#0a0a0c", fontFamily: nav, animation: "vcIn .5s ease both", overflow: "hidden" }}>
      {/* letterbox top: title · press countdown · counter · close */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: BAR, background: "#000", zIndex: 6, display: "flex", alignItems: "center", padding: "0 18px", gap: 12 }}>
        <span style={{ fontFamily: mono, fontSize: 11, color: `color-mix(in oklab, ${C.fg} 60%, transparent)` }}>🎬 {title}</span>
        <span style={{ flex: 1 }} />
        {job && jobRemainingTokens(job) > 0 && (
          <span style={{ fontFamily: mono, fontSize: 10, color: `color-mix(in oklab, ${C.warn} 75%, transparent)`, fontVariantNumeric: "tabular-nums" }}>⏳ pressing · {fmtTok(jobRemainingTokens(job))} tok left</span>
        )}
        <span style={{ fontFamily: mono, fontSize: 11, color: `color-mix(in oklab, ${C.fg} 45%, transparent)`, fontVariantNumeric: "tabular-nums" }}>{idx + 1} / {job?.segs.length ?? "—"}</span>
        <button onClick={onClose} title="close (Esc)" style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${C.fg} 22%, transparent)`, color: C.fg, borderRadius: 7, padding: "2px 11px", cursor: "pointer", fontFamily: mono, fontSize: 11, opacity: 0.85 }}>✕</button>
      </div>
      {/* the film-strip progress — one segment per scene */}
      <div style={{ position: "absolute", left: 0, right: 0, top: BAR - 6, display: "flex", gap: 3, padding: "0 18px", zIndex: 7 }}>
        {(job?.segs ?? []).map((s, k) => (
          <div key={k} style={{ flex: 1, height: 2.5, background: `color-mix(in oklab, ${C.fg} 14%, transparent)`, borderRadius: 2, overflow: "hidden" }}>
            {k < idx && <div style={{ width: "100%", height: "100%", background: C.brand }} />}
            {k === idx && seg?.dur != null && <div style={{ width: `${Math.min(100, (ms / (seg.dur * 1000)) * 100)}%`, height: "100%", background: C.brand }} />}
          </div>
        ))}
      </div>

      {/* THE STAGE — the slide with its DRAWN PROOF, entered fresh per scene */}
      <div key={idx} style={{ position: "absolute", inset: `${BAR + 10}px 0 ${BAR + 58}px`, display: "grid", placeItems: "center", zIndex: 2 }}>
        <div style={{ maxWidth: 820, width: "88%", textAlign: "center" }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: `color-mix(in oklab, ${C.fg} 45%, transparent)`, animation: "vcSlideUp .5s ease both" }}>
            {slide?.topic ?? seg?.title ?? "…"}
          </div>
          <div style={{ fontSize: slide?.widget ? 22 : 34, fontWeight: 750, color: C.fg, lineHeight: 1.3, margin: slide?.widget ? "10px 0 8px" : "16px 0 20px", animation: "vcSlideUp .6s ease .08s both" }}>
            {slide?.big ?? ""}
          </div>
          {slide?.widget && (
            <div style={{ display: "grid", placeItems: "center", animation: "vcSlideUp .6s ease .16s both" }}>
              <SketchWidget widget={slide.widget} seed={idx + 1} tint={activeRole === "b" ? hostB.color : hostA.color} />
            </div>
          )}
          {(slide?.bullets ?? []).filter(Boolean).map((b, i2) => (
            <div key={i2} style={{ fontFamily: mono, fontSize: 11.5, color: `color-mix(in oklab, ${C.fg} 58%, transparent)`, margin: "6px 0", animation: `vcSlideUp .5s ease ${0.26 + i2 * 0.12}s both` }}>
              {b}
            </div>
          ))}
        </div>
      </div>

      {/* THE HOSTS — two orbs breathing with the real waveform */}
      {orb(hostA, "a", "left")}
      {orb(hostB, "b", "right")}

      {/* the veil — a scene whose voice is still pressing holds the film honestly */}
      {wait && (
        <div style={{ position: "absolute", inset: 0, zIndex: 8, background: "rgba(8,8,10,.88)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: mono, fontSize: 13, color: C.warn, animation: "vcPulse 1.3s ease-in-out infinite" }}>⏳ pressing the voices — scene {idx + 1}</span>
            {seg && <span style={{ fontFamily: mono, fontSize: 10, color: `color-mix(in oklab, ${C.fg} 45%, transparent)`, fontVariantNumeric: "tabular-nums" }}>{fmtTok(segRemainingTokens(seg))} tok this scene{seg.prog ? ` (${seg.prog.done}/${seg.prog.total} units)` : ""}{job ? ` · ${fmtTok(jobRemainingTokens(job))} tok whole cast` : ""}</span>}
            <span style={{ fontFamily: mono, fontSize: 9, color: `color-mix(in oklab, ${C.fg} 35%, transparent)` }}>the cast starts the moment both voices are ready</span>
          </div>
        </div>
      )}

      {/* SUBTITLES — colored per host, riding the per-say clock from the press receipt */}
      <div style={{ position: "absolute", left: "50%", bottom: BAR + 14, transform: "translateX(-50%)", width: "min(720px, 88vw)", zIndex: 6, textAlign: "center", minHeight: 44 }}>
        {subUnit && (
          <span style={{
            display: "inline-block", padding: "7px 16px", borderRadius: 10,
            background: "rgba(6,6,9,.78)", backdropFilter: "blur(8px)",
            fontFamily: nav, fontSize: 15.5, lineHeight: 1.5, fontWeight: 550,
            color: activeRole === "a" ? hostA.color : activeRole === "b" ? hostB.color : C.fg,
            border: `1px solid color-mix(in oklab, ${activeRole === "a" ? hostA.color : hostB.color} 30%, transparent)`,
          }}>
            {String(subUnit.text ?? "")}
          </span>
        )}
      </div>

      {/* letterbox bottom: transport */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: BAR, background: "#000", zIndex: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <button onClick={() => jump(-1)} disabled={idx === 0} title="previous scene (←)" style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${C.fg} 22%, transparent)`, color: C.fg, borderRadius: 7, padding: "3px 13px", cursor: "pointer", fontFamily: mono, fontSize: 12, opacity: idx === 0 ? 0.3 : 0.85 }}>‹</button>
        <button
          onClick={() => {
            if (playing) { setPlaying(false); slidePause(); }
            else { setPlaying(true); if (getPlayback()?.mode === "slide") slideResume(); else setCastNonce((n) => n + 1); }
          }}
          style={{ background: "transparent", border: `1px solid ${C.brand}`, color: C.brand, borderRadius: 7, padding: "3px 16px", cursor: "pointer", fontFamily: mono, fontSize: 12 }}>
          {playing ? "⏸" : "▶"}
        </button>
        <button onClick={() => jump(1)} disabled={idx >= (job?.segs.length ?? 1) - 1} title="next scene (→)" style={{ background: "transparent", border: `1px solid color-mix(in oklab, ${C.fg} 22%, transparent)`, color: C.fg, borderRadius: 7, padding: "3px 13px", cursor: "pointer", fontFamily: mono, fontSize: 12, opacity: idx >= (job?.segs.length ?? 1) - 1 ? 0.3 : 0.85 }}>›</button>
      </div>
    </div>,
    document.body,
  );
}
