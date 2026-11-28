// CLASS CINEMA (operator 2026-07-26: "fullscreen, beautiful, didactic — subtitles like someone
// talking, widgets that draw themselves, text writing itself, play/pause/stop/reset, cuts like a
// 24fps movie"). A CINEMATIC silent-movie player for the antiDocs deck shape:
//   { title, slides: [{ topic, bullets?, speech?, widget? }] }
// Everything is CSS-animation driven (char-reveal spans, pathLength stroke draws, staged pops) so
// ONE class (.cine-paused) freezes the whole film mid-frame; a tiny event scheduler advances the
// subtitles and the cut. Letterbox bars, film grain, flicker and push-in cuts carry the 24fps mood.
import React from "react";
import { C, mono, nav } from "@/loki/theme";
import { TokLine } from "./highlight";
import { slidePlay, slidePause, slideResume, slideStop, subscribeNarration, getNarrationJob, setCinemaHold, armAudio, setNarrationMuted, getPlayback, segRemainingTokens, jobRemainingTokens } from "@/loki/widgets/narration-jobs";

const CSS_ID = "loki-cinema-css";
function ensureCss() {
  if (typeof document === "undefined") return;
  let s = document.getElementById(CSS_ID) as HTMLStyleElement | null;
  if (!s) { s = document.createElement("style"); s.id = CSS_ID; document.head.appendChild(s); }
  s.textContent =
    `@keyframes cineCh{to{opacity:1}}` +
    `@keyframes cineFade{from{opacity:0}to{opacity:1}}` +
    `@keyframes cineRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}` +
    `@keyframes cinePop{0%{opacity:0;transform:scale(.55) rotate(-2deg)}70%{transform:scale(1.06) rotate(.6deg)}100%{opacity:1;transform:scale(1) rotate(0)}}` +
    `@keyframes cineDrop{from{opacity:0;transform:translateY(-20px) rotate(-1deg)}to{opacity:1;transform:none}}` +
    `@keyframes cineDraw{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}` +
    `@keyframes cineWipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}` +
    `@keyframes cineGrowX{from{transform:scaleX(0)}to{transform:scaleX(1)}}` +
    `@keyframes cineIn{from{opacity:0;transform:scale(.965);filter:blur(5px)}to{opacity:1;transform:scale(1);filter:blur(0)}}` +
    `@keyframes cineOut{to{opacity:0;transform:scale(1.05);filter:blur(7px)}}` +
    `@keyframes cineKen{from{transform:scale(1)}to{transform:scale(1.035)}}` +
    `@keyframes cineFlicker{0%,100%{opacity:.055}50%{opacity:.028}}` +
    `@keyframes cineRock{0%{transform:rotate(1.1deg)}55%{transform:rotate(-.7deg)}100%{transform:rotate(0)}}` +
    `@keyframes cineCaret{0%,49%{opacity:1}50%,100%{opacity:0}}` +
    `@keyframes cineProg{from{width:0}to{width:100%}}` +
    // the END CARD — the wordmark condenses out of the blur, calm and smooth; the brand dot lands last.
    `@keyframes cineLogo{0%{opacity:0;filter:blur(16px);transform:scale(1.08);letter-spacing:.22em}55%{opacity:1}100%{opacity:1;filter:blur(0);transform:scale(1);letter-spacing:.015em}}` +
    `@keyframes cineLogoDot{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}` +
    `@keyframes cineLogoGlow{0%{text-shadow:none}45%{text-shadow:0 0 42px color-mix(in oklab, var(--c-brand, #e08a3c) 45%, transparent)}100%{text-shadow:0 0 16px color-mix(in oklab, var(--c-brand, #e08a3c) 22%, transparent)}}` +
    `.cine-paused *{animation-play-state:paused!important}.cine-paused .cine-fin *,.cine-fin *{animation-play-state:running!important}`;
}

// film grain — a tiny inline turbulence tile, repeated
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/><feColorMatrix type='saturate' values='0'/></filter><rect width='140' height='140' filter='url(%23n)' opacity='0.55'/></svg>")`;

// ── text that WRITES ITSELF — chars reveal on their own delays, but wrapping happens ONLY at word
// boundaries (operator 2026-07-26: "the subtitles are breaking some lines"): each word is an
// inline-block, so a half-typed word never splits across lines. mode "char" keeps raw char flow
// for code (pre-formatted, never wraps).
function Write({ text, delay = 0, cps = 30, style, caret = false, mode = "word" }: { text: string; delay?: number; cps?: number; style?: React.CSSProperties; caret?: boolean; mode?: "word" | "char" }) {
  const s = String(text ?? "");
  const total = s.length;
  const ch = (c: string, at: number, key: React.Key) => (
    <span key={key} style={{ opacity: 0, animation: "cineCh .01s steps(1) forwards", animationDelay: `${(delay + at / cps).toFixed(3)}s` }}>{c}</span>
  );
  const caretEl = caret ? <span style={{ opacity: 0, animation: `cineCh .01s steps(1) forwards, cineCaret 1s steps(2) infinite`, animationDelay: `${(delay + total / cps).toFixed(3)}s, ${(delay + total / cps).toFixed(3)}s`, color: C.brand }}>▍</span> : null;
  if (mode === "char") return <span style={style}>{[...s].map((c, i) => ch(c, i, i))}{caretEl}</span>;
  const words = s.split(" ");
  let idx = 0;
  return (
    <span style={style}>
      {words.map((wd, wi) => {
        const start = idx; idx += wd.length + 1;
        return (
          // WORD-batched reveal (operator 2026-07-26: sporadic "disappearing letters" — hundreds of
          // simultaneous per-char animations get silently dropped by the compositor under load; ONE
          // animation per word is ~8x fewer layers and cannot lose single characters).
          <span key={wi} style={{ display: "inline-block", whiteSpace: "pre-wrap", opacity: 0, animation: "cineCh .13s ease forwards", animationDelay: `${(delay + start / cps).toFixed(3)}s` }}>
            {wd}{wi < words.length - 1 ? " " : ""}
          </span>
        );
      })}
      {caretEl}
    </span>
  );
}
const writeDur = (t: string, cps = 30) => (String(t ?? "").length / cps);

// speech → subtitle chunks (sentence-ish, ≤ 92 chars — the cadence of someone talking)
function chunksOf(speech?: string): string[] {
  const s = String(speech ?? "").trim();
  if (!s) return [];
  const parts = s.split(/(?<=[.!?;])\s+/).flatMap((p) => {
    if (p.length <= 78) return [p];
    const out: string[] = []; let cur = "";
    for (const w of p.split(" ")) { if ((cur + " " + w).trim().length > 78) { out.push(cur.trim()); cur = w; } else cur = `${cur} ${w}`; }
    if (cur.trim()) out.push(cur.trim());
    return out;
  });
  return parts.filter(Boolean);
}
// SLOW, didactic cadence (operator 2026-07-26: "the subtitles should explain in a simple manner,
// with details, and be slower") — generous reading time per chunk; the film breathes.
const subDur = (c: string) => Math.max(2.4, c.length / 21 + 1.2);
const SUB_CPS = 26; // subtitle typing speed — someone talking calmly, not a teleprompter

// ── each widget type draws ITSELF, excalidraw-voiced, with its OWN animation ────────────────────
export function widgetDur(w: any): number {
  if (!w) return 0;
  const p = w.payload ?? {};
  switch (w.type) {
    case "flow": return 0.4 + Math.min(7, (p.steps ?? []).length) * 0.55;
    case "balance": return 2.6;
    case "timeline": return 0.6 + Math.min(8, (p.events ?? []).length) * 0.5;
    case "graph-focus": return 0.7 + Math.min(7, (p.files ?? []).length) * 0.45;
    case "layers": return 0.5 + Math.min(6, (p.layers ?? []).length) * 0.42 + (p.breach ? 0.8 : 0);
    case "root-cause-tree": return 0.4 + writeDur(String(p.root ?? ""), 46) + (p.branches ?? []).slice(0, 5).reduce((a: number, b: any) => a + writeDur(String(b), 46) + 0.15, 0);
    case "repair-order": return 0.4 + (p.steps ?? []).slice(0, 6).reduce((a: number, b: any) => a + writeDur(String(b), 46) + 0.18, 0);
    case "before-after": return 3.4;
    case "code-exhibit": return 0.5 + Math.min(9, (p.lines ?? []).length) * 0.42 + 1.6;
    case "axes": return 0.5 + Math.min(7, (p.axes ?? []).length) * 0.45;
    default: return 1.2;
  }
}

// ── FOLEY (operator 2026-07-26: "discrete sound effects for all animations") — synthesized with
// WebAudio, no assets: a soft pop when something lands, a pencil hiss when a stroke draws, a tick
// when text types, a whoosh + thump on every cut. Low gains — felt, not heard.
function makeFoley(ac: AudioContext, out: AudioNode) {
  // SMOOTH & DISCRETE (operator 2026-07-26 v2): everything sine or low-passed noise, soft attacks,
  // low gains, and a gentle master low-pass so nothing ever clicks or rasps — felt, not heard.
  const soften = ac.createBiquadFilter(); soften.type = "lowpass"; soften.frequency.value = 2400; soften.Q.value = 0.4;
  const master = ac.createGain(); master.gain.value = 0.8; master.connect(soften); soften.connect(out);
  const noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
  { const d = noise.getChannelData(0); for (let q = 0; q < d.length; q += 1) d[q] = Math.random() * 2 - 1; }
  const env = (g: GainNode, when: number, a: number, dur: number, peak: number) => { g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(peak, when + a); g.gain.exponentialRampToValueAtTime(0.0001, when + dur); };
  const tone = (f0: number, f1: number, dur: number, peak: number, when: number, attack = 0.02) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine";
    o.frequency.setValueAtTime(f0, when); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), when + dur);
    env(g, when, attack, dur, peak); o.connect(g); g.connect(master); o.start(when); o.stop(when + dur + 0.08);
  };
  const air = (when: number, dur: number, peak: number, f0: number, f1: number, attack = 0.06) => {
    const s = ac.createBufferSource(); s.buffer = noise;
    const f = ac.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 0.5;
    f.frequency.setValueAtTime(f0, when); f.frequency.exponentialRampToValueAtTime(f1, when + dur);
    const g = ac.createGain(); env(g, when, attack, dur, peak);
    s.connect(f); f.connect(g); g.connect(master); s.start(when); s.stop(when + dur + 0.08);
  };
  return {
    master,
    at(kind: string, when: number) {
      if (kind === "pop") tone(330, 520, 0.14, 0.03, when, 0.025);          // a round, quiet "plup"
      else if (kind === "tick") tone(840, 660, 0.06, 0.012, when, 0.012);    // a soft fingertip tap
      else if (kind === "draw") air(when, 0.3, 0.018, 700, 420, 0.08);       // pencil on paper, far away
      else if (kind === "swoosh") air(when, 0.42, 0.03, 500, 950, 0.1);      // a breath of air, not wind
      else if (kind === "thump") tone(95, 52, 0.24, 0.045, when, 0.018);     // a felt-mallet landing
    },
  };
}
// every animation's cue, derived from the SAME timings the visuals use — player and mp4 share it.
function foleyCues(pl: { sl: any; t0: number; evs: { t: number; k: number }[]; end: number }): { t: number; kind: string }[] {
  if (pl.sl?.__logo) return [{ t: 0.2, kind: "swoosh" }, { t: 1.75, kind: "thump" }, { t: 2.65, kind: "tick" }];
  const cues: { t: number; kind: string }[] = [{ t: 0.32, kind: "tick" }];
  const w = pl.sl?.widget; const p = w?.payload ?? {}; const t0 = pl.t0;
  if (w) {
    if (w.type === "flow") (p.steps ?? []).slice(0, 7).forEach((_: any, q: number) => { cues.push({ t: t0 + q * 0.55, kind: "pop" }, { t: t0 + q * 0.55 + 0.4, kind: "draw" }); });
    else if (w.type === "balance") cues.push({ t: t0, kind: "draw" }, { t: t0 + 0.55, kind: "pop" }, { t: t0 + 1.05, kind: "pop" }, { t: t0 + 1.75, kind: "tick" });
    else if (w.type === "timeline") { cues.push({ t: t0, kind: "draw" }); (p.events ?? []).slice(0, 8).forEach((_: any, q: number) => cues.push({ t: t0 + 0.5 + q * 0.5, kind: "pop" })); }
    else if (w.type === "graph-focus") { cues.push({ t: t0, kind: "draw" }); (p.files ?? []).slice(0, 7).forEach((_: any, q: number) => cues.push({ t: t0 + 0.55 + q * 0.45, kind: "draw" }, { t: t0 + 0.83 + q * 0.45, kind: "pop" })); }
    else if (w.type === "layers") (p.layers ?? []).slice(0, 6).forEach((_: any, q: number) => cues.push({ t: t0 + q * 0.42, kind: "pop" }));
    else if (w.type === "root-cause-tree" || w.type === "repair-order") { const n2 = 1 + Math.min(6, (p.branches ?? p.steps ?? []).length); for (let q = 0; q < n2; q += 1) cues.push({ t: t0 + q * 0.5, kind: "tick" }); }
    else if (w.type === "axes") (p.axes ?? []).slice(0, 7).forEach((_: any, q: number) => cues.push({ t: t0 + 0.3 + q * 0.45, kind: "draw" }));
    else if (w.type === "before-after") cues.push({ t: t0, kind: "draw" }, { t: t0 + 1.1, kind: "draw" }, { t: t0 + 1.8, kind: "draw" });
    else if (w.type === "code-exhibit") { (p.lines ?? []).slice(0, 9).forEach((_: any, q: number) => { if (q % 2 === 0) cues.push({ t: t0 + 0.3 + q * 0.42, kind: "tick" }); }); cues.push({ t: t0 + 0.5 + Math.min(9, (p.lines ?? []).length) * 0.42, kind: "draw" }); }
  }
  ((pl.sl?.bullets ?? []) as any[]).forEach((_, j) => cues.push({ t: t0 + widgetDur(w) + 0.35 + j * 0.5, kind: "pop" }));
  pl.evs.forEach((e) => cues.push({ t: e.t, kind: "tick" }));
  cues.push({ t: pl.end, kind: "swoosh" }, { t: pl.end + 0.66, kind: "thump" });
  return cues.sort((a, b) => a.t - b.t);
}

// per-slide timing — shared by the on-screen player AND the background compiler, so the mp4 is the
// same film to the frame: title writes → widget draws + bullets rise, subtitles speak in parallel.
export function buildPlan(sl: any) {
  if (sl?.__logo) return { sl, t0: 0, chunks: [] as string[], evs: [] as { t: number; k: number }[], end: 5 };
  const t0 = 0.35 + writeDur(String(sl?.topic ?? ""), 20) + 0.45;
  const chunks = chunksOf(sl?.speech);
  const visual = t0 + widgetDur(sl?.widget) + ((sl?.bullets ?? []).length ? 0.4 + (sl?.bullets ?? []).length * 0.5 : 0);
  const evs: { t: number; k: number }[] = [];
  let t = t0;
  chunks.forEach((c, k) => { evs.push({ t, k }); t += subDur(c); });
  const end = Math.max(t, visual) + 1.4;
  return { sl: sl ?? {}, t0, chunks, evs, end };
}

function CineWidget({ w, delay }: { w: any; delay: number }) {
  const p = w?.payload ?? {};
  const head = w?.title ? (
    <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, opacity: 0, animation: "cineFade .5s ease forwards", animationDelay: `${delay}s` }}>{w.title}</div>
  ) : null;

  if (w.type === "flow") {
    const steps = (Array.isArray(p.steps) ? p.steps : []).slice(0, 7).map(String);
    return (
      <div>{head}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          {steps.map((st: string, i: number) => (
            <React.Fragment key={i}>
              <span style={{ border: `1.4px solid ${C.border}`, borderRadius: 11, background: C.panel2, padding: "6px 14px", fontFamily: mono, fontSize: 13, color: C.fg, transform: `rotate(${i % 2 ? 0.7 : -0.7}deg)`, maxWidth: 240, opacity: 0, animation: "cinePop .55s cubic-bezier(.34,1.56,.64,1) forwards", animationDelay: `${delay + i * 0.55}s` }}>{st}</span>
              {i < steps.length - 1 && (
                <svg width="34" height="18" style={{ overflow: "visible" }}>
                  <path d="M 2 9 C 12 5, 22 13, 30 9" fill="none" stroke={C.dim} strokeWidth="1.6" pathLength={100} strokeDasharray={100} strokeDashoffset={100} style={{ animation: "cineDraw .4s ease forwards", animationDelay: `${delay + i * 0.55 + 0.4}s` }} />
                  <path d="M 24 4 L 31 9 L 24 14" fill="none" stroke={C.dim} strokeWidth="1.5" strokeLinejoin="round" pathLength={100} strokeDasharray={100} strokeDashoffset={100} style={{ animation: "cineDraw .25s ease forwards", animationDelay: `${delay + i * 0.55 + 0.7}s` }} />
                </svg>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }
  if (w.type === "balance") {
    const side = (S: any, rot: number, d2: number) => (
      <div style={{ flex: 1, minWidth: 0, border: `1.4px solid ${C.border}`, borderRadius: 12, background: C.panel2, padding: "9px 14px", transform: `rotate(${rot}deg)`, fontFamily: mono, opacity: 0, animation: "cineDrop .6s cubic-bezier(.34,1.56,.64,1) forwards", animationDelay: `${d2}s` }}>
        <b style={{ fontSize: 13, color: C.fg }}>{S?.label ?? "—"}</b>
        {(S?.items ?? []).slice(0, 4).map((it: any, i: number) => <div key={i} style={{ fontSize: 11, color: C.muted, lineHeight: 1.7, opacity: 0, animation: "cineFade .4s ease forwards", animationDelay: `${d2 + 0.25 + i * 0.18}s` }}>– {String(it)}</div>)}
      </div>
    );
    return (
      <div>{head}
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", maxWidth: 760, margin: "0 auto", animation: "cineRock 1.1s ease both", animationDelay: `${delay + 1.7}s` }}>
          {side(p.left ?? {}, -1.1, delay + 0.55)}
          <svg width="48" height="62" style={{ flexShrink: 0, marginTop: 10, overflow: "visible" }}>
            <line x1="5" y1="17" x2="43" y2="24" stroke={C.dim} strokeWidth="1.7" pathLength={100} strokeDasharray={100} strokeDashoffset={100} style={{ animation: "cineDraw .5s ease forwards", animationDelay: `${delay}s` }} />
            <path d="M 17 48 L 31 48 L 24 24 Z" fill="none" stroke={C.dim} strokeWidth="1.5" strokeLinejoin="round" pathLength={100} strokeDasharray={100} strokeDashoffset={100} style={{ animation: "cineDraw .6s ease forwards", animationDelay: `${delay + 0.25}s` }} />
          </svg>
          {side(p.right ?? {}, 1.1, delay + 1.05)}
        </div>
        {p.verdict && <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, marginTop: 10, textAlign: "center", opacity: 0, animation: "cineFade .6s ease forwards", animationDelay: `${delay + 2.1}s` }}>⚖ {String(p.verdict)}</div>}
      </div>
    );
  }
  if (w.type === "timeline") {
    const events = (Array.isArray(p.events) ? p.events : []).map((e: any) => (typeof e === "string" ? { label: e } : e)).filter((e: any) => e?.label).slice(0, 8);
    return (
      <div>{head}
        <div style={{ position: "relative", maxWidth: 760, margin: "14px auto 0", height: 74 }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 20, height: 2, background: C.border, transformOrigin: "left", animation: "cineGrowX .8s ease both", animationDelay: `${delay}s` }} />
          {events.map((e: any, i: number) => {
            const x = events.length === 1 ? 50 : (i / (events.length - 1)) * 92 + 4;
            const d2 = delay + 0.5 + i * 0.5;
            return (
              <div key={i} style={{ position: "absolute", left: `${x}%`, top: 12, transform: "translateX(-50%)", textAlign: "center", opacity: 0, animation: "cinePop .5s cubic-bezier(.34,1.56,.64,1) forwards", animationDelay: `${d2}s` }}>
                <div style={{ width: 15, height: 15, borderRadius: "50%", border: `2px solid ${i === events.length - 1 ? C.brand : C.dim}`, background: C.panel, margin: "0 auto" }} />
                <div style={{ fontFamily: mono, fontSize: 10.5, color: i === events.length - 1 ? C.fg : C.muted, marginTop: 7, whiteSpace: "nowrap", transform: `rotate(${i % 2 ? 1 : -1}deg)` }}>{String(e.label)}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (w.type === "graph-focus") {
    const files = (Array.isArray(p.files) ? p.files : []).slice(0, 7).map(String);
    const W2 = 720, H2 = 150 + Math.ceil(files.length / 3) * 54, cx = W2 / 2, cy = H2 / 2;
    return (
      <div>{head}
        <svg viewBox={`0 0 ${W2} ${H2}`} style={{ width: "100%", maxWidth: 760, display: "block", overflow: "visible" }}>
          <ellipse cx={cx} cy={cy} rx={64} ry={20} fill={`color-mix(in oklab, ${C.brand} 12%, ${C.panel})`} stroke={C.brand} strokeWidth={1.6} pathLength={100} strokeDasharray={100} strokeDashoffset={100} style={{ animation: "cineDraw .7s ease forwards", animationDelay: `${delay}s` }} />
          <text x={cx} y={cy + 4} textAnchor="middle" fill={C.fg} style={{ fontFamily: mono, fontSize: 12, opacity: 0, animation: "cineFade .4s ease forwards", animationDelay: `${delay + 0.4}s` }}>{String(p.note ?? "the subject").slice(0, 34)}</text>
          {files.map((f2: string, i: number) => {
            const ang = (i / files.length) * Math.PI * 2 - Math.PI / 2;
            const x = cx + Math.cos(ang) * (W2 / 2 - 110);
            const yv = cy + Math.sin(ang) * (cy - 34);
            const nm = f2.split("/").pop() ?? f2;
            const d2 = delay + 0.55 + i * 0.45;
            return (
              <g key={i}>
                <path d={`M ${cx} ${cy} Q ${(cx + x) / 2 + (i % 2 ? 18 : -18)} ${(cy + yv) / 2} ${x} ${yv}`} fill="none" stroke={`color-mix(in oklab, ${C.brand} 45%, transparent)`} strokeWidth={1.4} pathLength={100} strokeDasharray={100} strokeDashoffset={100} style={{ animation: "cineDraw .45s ease forwards", animationDelay: `${d2}s` }} />
                <g style={{ opacity: 0, animation: "cinePop .45s cubic-bezier(.34,1.56,.64,1) forwards", animationDelay: `${d2 + 0.28}s`, transformBox: "fill-box", transformOrigin: "center" } as any}>
                  <ellipse cx={x} cy={yv} rx={Math.max(38, nm.length * 4 + 12)} ry={15} fill={C.panel} stroke={C.dim} strokeWidth={1.2} transform={`rotate(${i % 2 ? 1.2 : -1.2} ${x} ${yv})`} />
                  <text x={x} y={yv + 4} textAnchor="middle" fill={C.fg} style={{ fontFamily: mono, fontSize: 11.5 }}>{nm}</text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }
  if (w.type === "layers") {
    const layers = (Array.isArray(p.layers) ? p.layers : []).slice(0, 6).map(String);
    return (
      <div>{head}
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          {layers.map((l: string, i: number) => (
            <div key={i} style={{ border: `1.4px solid ${C.border}`, borderRadius: 10, background: C.panel2, padding: "7px 14px", margin: "0 0 7px", transform: `rotate(${i % 2 ? 0.5 : -0.5}deg)`, fontFamily: mono, fontSize: 12.5, color: C.fg, opacity: 0, animation: "cineDrop .5s cubic-bezier(.34,1.56,.64,1) forwards", animationDelay: `${delay + i * 0.42}s` }}>{l}</div>
          ))}
          {p.breach && <div style={{ fontFamily: mono, fontSize: 11, color: C.bad, marginTop: 4, opacity: 0, animation: "cineFade .6s ease forwards", animationDelay: `${delay + layers.length * 0.42 + 0.3}s` }}>⤫ breach: {String(p.breach)}</div>}
        </div>
      </div>
    );
  }
  if (w.type === "axes") {
    // the SEVEN AXES, properly: bars that grow one by one, tinted by their score (operator
    // 2026-07-26: the borrowed why-tree renderer was fading the lower lines into the dark).
    const axes = (Array.isArray(p.axes) ? p.axes : []).slice(0, 7);
    const tone = (s2: number) => (s2 >= 80 ? C.ok : s2 >= 60 ? C.warn : C.bad);
    return (
      <div>{head}
        <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 9, textAlign: "left" }}>
          {axes.map((a2: any, ai: number) => {
            const d2 = delay + 0.3 + ai * 0.45;
            return (
              <div key={ai} style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0, animation: "cineFade .4s ease forwards", animationDelay: `${d2}s` }}>
                <span style={{ width: 110, fontFamily: mono, fontSize: 13, color: C.muted, flexShrink: 0 }}>{String(a2.ax)}</span>
                <div style={{ flex: 1, height: 9, background: `color-mix(in oklab, ${C.border} 55%, transparent)`, borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(2, Math.min(100, Number(a2.s) || 0))}%`, height: "100%", background: tone(Number(a2.s) || 0), transformOrigin: "left", animation: "cineGrowX .7s cubic-bezier(.25,.8,.35,1) both", animationDelay: `${d2 + 0.1}s` }} />
                </div>
                <b style={{ width: 34, fontFamily: mono, fontSize: 14, color: tone(Number(a2.s) || 0), fontVariantNumeric: "tabular-nums", textAlign: "right", opacity: 0, animation: "cineFade .35s ease forwards", animationDelay: `${d2 + 0.55}s` } as any}>{a2.s}</b>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (w.type === "root-cause-tree" || w.type === "repair-order") {
    const isWhy = w.type === "root-cause-tree";
    const lines = isWhy
      ? [`// WHY — ${String(p.root ?? "").slice(0, 76)}`, ...(Array.isArray(p.branches) ? p.branches : []).slice(0, 5).map((b: any) => `//  ↳ ${String(b).slice(0, 74)}`)]
      : [`// FIX, in order:`, ...(Array.isArray(p.steps) ? p.steps : []).slice(0, 6).map((s2: any, j: number) => `//  ${j + 1}. ${String(s2).slice(0, 74)}`)];
    let acc = delay;
    return (
      <div>{head}
        <div style={{ border: `1.4px solid ${C.border}`, borderRadius: 10, background: C.panel, padding: "10px 16px", fontFamily: mono, fontSize: 12.5, lineHeight: 2, maxWidth: 760, margin: "0 auto", textAlign: "left" }}>
          {lines.map((ln, i) => { const d2 = acc; acc += writeDur(ln, 46) + 0.16; return (
            // floor at 55% so late lines never fade into the dark
            <div key={i} style={{ color: i === 0 ? C.ok : `color-mix(in oklab, ${C.ok} ${Math.max(55, 74 - i * 5)}%, ${C.fg})` }}><Write text={ln} delay={d2} cps={46} /></div>
          ); })}
        </div>
      </div>
    );
  }
  if (w.type === "code-exhibit") {
    // the PROOF widget (operator 2026-07-26: "when make the allegation, prove it") — real source
    // lines type themselves, the sick line burns, and a hand-drawn arrow drags the charge onto it.
    const lines = (Array.isArray(p.lines) ? p.lines : []).slice(0, 9);
    const sick = p.sick;
    const rows = lines.map((r: any, ri: number) => ({ ...r, d0: delay + 0.3 + ri * 0.42 }));
    const sickIdx = rows.findIndex((r: any) => r.ln === sick);
    const noteDelay = delay + 0.5 + lines.length * 0.42;
    return (
      <div>{head}
        <div style={{ position: "relative", maxWidth: 760, margin: "0 auto", textAlign: "left", paddingTop: sickIdx >= 0 ? 34 : 0 }}>
          <div style={{ border: `1.4px solid ${C.border}`, borderRadius: 10, overflow: "hidden", fontFamily: mono, fontSize: 12.5, background: C.panel }}>
            {rows.map((r: any, ri: number) => (
              <div key={ri} style={{ display: "flex", minHeight: 21, background: r.ln === sick ? `color-mix(in oklab, ${C.bad} 10%, transparent)` : "transparent", opacity: 0, animation: "cineFade .3s ease forwards", animationDelay: `${r.d0}s` }}>
                <span style={{ width: 46, flexShrink: 0, textAlign: "right", paddingRight: 8, color: r.ln === sick ? C.bad : C.dim, borderRight: `1px solid ${C.border}`, lineHeight: "21px", fontSize: 11 }}>{r.ln}</span>
                <code style={{ whiteSpace: "pre", overflow: "hidden", padding: "0 9px", lineHeight: "21px", color: C.fg, opacity: r.ln === sick ? 1 : 0.72, flex: 1, minWidth: 0 }}>
                  {/* ONE wipe per line, steps() = the typewriter — per-char spans got dropped by the compositor */}
                  <span style={{ display: "inline-block", clipPath: "inset(0 100% 0 0)", animation: `cineWipe ${Math.max(0.2, String(r.text).slice(0, 88).length / 64).toFixed(2)}s steps(${Math.max(4, String(r.text).slice(0, 88).length)}) forwards`, animationDelay: `${r.d0}s` }}>{String(r.text).slice(0, 88) || " "}</span>
                </code>
              </div>
            ))}
          </div>
          {sickIdx >= 0 && (<>
            <div style={{ position: "absolute", right: 6, top: -6, maxWidth: 300, transform: "rotate(1.1deg)", background: `color-mix(in oklab, ${C.bad} 8%, ${C.panel2})`, border: `1.4px dashed color-mix(in oklab, ${C.bad} 55%, ${C.border})`, borderRadius: 9, padding: "4px 10px", fontFamily: mono, fontSize: 10.5, color: C.fg, opacity: 0, animation: "cineFade .45s ease forwards", animationDelay: `${noteDelay}s` }}>
              ⚖ {String(p.label ?? "the charge")}{p.note ? <span style={{ color: C.muted }}> — {String(p.note).slice(0, 80)}</span> : null}
            </div>
            <svg width="90" height="60" viewBox="0 0 90 60" style={{ position: "absolute", right: 150, top: Math.max(14, 34 + sickIdx * 21 - 34), overflow: "visible", pointerEvents: "none" }}>
              <path d={`M 84 4 Q 40 6 14 ${Math.min(52, 20 + sickIdx * 4)}`} fill="none" stroke={C.bad} strokeWidth="1.7" pathLength={100} strokeDasharray={100} strokeDashoffset={100} style={{ animation: "cineDraw .55s ease forwards", animationDelay: `${noteDelay + 0.15}s` }} />
              <path d={`M 26 ${Math.min(44, 14 + sickIdx * 4)} L 13 ${Math.min(53, 21 + sickIdx * 4)} L 29 ${Math.min(56, 26 + sickIdx * 4)}`} fill="none" stroke={C.bad} strokeWidth="1.6" pathLength={100} strokeDasharray={100} strokeDashoffset={100} style={{ animation: "cineDraw .3s ease forwards", animationDelay: `${noteDelay + 0.6}s` }} />
            </svg>
          </>)}
        </div>
      </div>
    );
  }
  if (w.type === "before-after") {
    const badLines = String(p.bad ?? "").split("\n").slice(0, 6);
    const goodLines = String(p.good ?? "").split("\n").slice(0, 6);
    return (
      <div>{head}
        <div style={{ maxWidth: 760, margin: "0 auto", border: `1.4px solid ${C.border}`, borderRadius: 10, overflow: "hidden", fontFamily: mono, fontSize: 12, textAlign: "left" }}>
          <div style={{ background: `color-mix(in oklab, ${C.bad} 8%, transparent)`, padding: "6px 12px", animation: "cineWipe .9s ease both", animationDelay: `${delay}s` }}>
            <div style={{ fontSize: 10, color: C.bad, marginBottom: 2 }}>− before</div>
            {badLines.map((ln, i) => <div key={i}><code style={{ whiteSpace: "pre-wrap", opacity: 0.9 }}><TokLine text={ln} /></code></div>)}
          </div>
          <svg width="100%" height="22" style={{ display: "block", background: C.panel }}>
            <path d="M 40 4 C 60 16, 90 16, 110 8" fill="none" stroke={C.dim} strokeWidth="1.5" pathLength={100} strokeDasharray={100} strokeDashoffset={100} style={{ animation: "cineDraw .5s ease forwards", animationDelay: `${delay + 1.1}s` }} />
            <path d="M 102 3 L 111 8 L 101 13" fill="none" stroke={C.dim} strokeWidth="1.4" pathLength={100} strokeDasharray={100} strokeDashoffset={100} style={{ animation: "cineDraw .3s ease forwards", animationDelay: `${delay + 1.5}s` }} />
          </svg>
          <div style={{ background: `color-mix(in oklab, ${C.ok} 8%, transparent)`, padding: "6px 12px", animation: "cineWipe 1s ease both", animationDelay: `${delay + 1.8}s` }}>
            <div style={{ fontSize: 10, color: C.ok, marginBottom: 2 }}>+ after — same logic, restructured</div>
            {goodLines.map((ln, i) => <div key={i}><code style={{ whiteSpace: "pre-wrap" }}><TokLine text={ln} /></code></div>)}
          </div>
        </div>
      </div>
    );
  }
  return head;
}

// ── THE PLAYER ──────────────────────────────────────────────────────────────────────────────────
const fmtTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.max(0, Math.round(n))));

export function CinematicPlayer({ deck, onClose, narrationId }: { deck: any; onClose: () => void; narrationId?: number | null }) {
  // the film always ends on the LOGO SLIDE — a real slide with its own cut, not an overlay
  const slides = React.useMemo(() => [...((deck?.slides ?? []) as any[]), { __logo: true }], [deck]);
  const [i, setI] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [sub, setSub] = React.useState(-1);       // current subtitle chunk of this slide
  const [cut, setCut] = React.useState<"in" | "out" | "black" | null>("in");
  const [nonce, setNonce] = React.useState(0);    // re-keys the stage → restarts every CSS animation
  const [fin, setFin] = React.useState(false);
  React.useEffect(() => { ensureCss(); }, []);

  // per-slide timing — the same buildPlan the background compiler renders from.
  const plan = React.useMemo(() => buildPlan(slides[i] ?? {}), [slides, i]);

  // FOLEY — lazy AudioContext (born on a user gesture), one master mute.
  const [muted, setMuted] = React.useState(false);
  const mutedRef = React.useRef(muted); mutedRef.current = muted;
  const acRef = React.useRef<AudioContext | null>(null);
  const foleyRef = React.useRef<ReturnType<typeof makeFoley> | null>(null);
  const cue = React.useCallback((kind: string) => {
    if (mutedRef.current) return;
    try {
      if (!acRef.current) { acRef.current = new AudioContext(); foleyRef.current = makeFoley(acRef.current, acRef.current.destination); }
      if (acRef.current.state === "suspended") void acRef.current.resume();
      foleyRef.current?.at(kind, acRef.current.currentTime + 0.001);
    } catch { /* audio unavailable */ }
  }, []);
  React.useEffect(() => () => { try { void acRef.current?.close(); } catch { /* */ } }, []);

  // the scheduler — ONE merged timeline (subtitles + foley cues + the cut), timeout-chained;
  // pause banks the elapsed offset, resume replays from it.
  const line = React.useRef<{ t: number; fn: () => void }[]>([]);
  const ptr = React.useRef(0); const off = React.useRef(0); const started = React.useRef(0); const tm = React.useRef<any>(null);
  const playingRef = React.useRef(playing); playingRef.current = playing;
  const advance = React.useCallback(() => {
    if (i >= slides.length - 1) { setPlaying(false); setFin(true); return; }
    setCut("out");
    setTimeout(() => { setCut("black"); setTimeout(() => { setI((x) => x + 1); }, 120); }, 640);
  }, [i, slides.length]);
  const buildLine = React.useCallback(() => {
    const sc = audioScaleRef.current; // 1 when silent; speech-time when the voice track is known
    const evs: { t: number; fn: () => void }[] = [
      ...plan.evs.map((e) => ({ t: e.t * sc, fn: () => setSub(e.k) })),
      ...foleyCues(plan).map((c) => ({ t: c.t * sc, fn: () => cue(c.kind) })),
    ].sort((a, b) => a.t - b.t);
    line.current = evs;
  }, [plan, cue]);
  // ♪ THE VOICE TRACK (operator 2026-07-27: "you did the video audio, the subtitles — wire both"):
  // when a narration job exists, each slide's CUT is driven by its SECTION's audio ending, not the
  // silent plan clock — sections and slides are 1:1 by construction (one `## topic` per slide).
  const audioActiveRef = React.useRef(false);
  const audioScaleRef = React.useRef(1); // subtitle clock ×scale = the SPEECH clock (sync, not drift)
  const [audioWait, setAudioWait] = React.useState(false);
  const [pressProg, setPressProg] = React.useState<{ done: number; total: number } | null>(null);
  const [audioNonce, setAudioNonce] = React.useState(0); // bump = replay this slide's section from 0 (cached — no re-render)
  const [, forceNarr] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => { // live token countdown while the press runs behind the film
    if (narrationId == null) return;
    return subscribeNarration(() => forceNarr());
  }, [narrationId]);
  React.useEffect(() => { // the film owns the audio surface — the corner dock steps aside
    if (narrationId == null) return;
    setCinemaHold(true);
    return () => setCinemaHold(false);
  }, [narrationId]);
  const runNext = React.useCallback(() => {
    clearTimeout(tm.current);
    const evs = line.current; const k = ptr.current;
    const nextT = k < evs.length ? evs[k].t : plan.end * audioScaleRef.current + 0.02;
    started.current = Date.now();
    tm.current = setTimeout(() => {
      off.current = nextT;
      if (k < evs.length) { ptr.current = k + 1; evs[k].fn(); runNext(); }
      else if (!audioActiveRef.current) advance(); // with a voice track, the audio's end owns the cut
    }, Math.max(0, (nextT - off.current) * 1000));
  }, [plan, advance]);
  // slide entry — reset the clock, restart the film for this slide
  React.useEffect(() => {
    buildLine();
    ptr.current = 0; off.current = 0; setSub(-1); setFin(false);
    setNonce((n) => n + 1);
    setCut("in"); const t2 = setTimeout(() => setCut(null), 700);
    // ONE film (operator: "the video should seem one with the audio"): when this scene has a voice
    // track that is not pressed yet, the clock does NOT start — no silent subtitles. The audio
    // effect below starts subtitles + voice TOGETHER (rescaled) the moment the section lands.
    const voicePending = narrationId != null && i < slides.length - 1
      && !!getNarrationJob(narrationId) && !getNarrationJob(narrationId)!.segs[i]?.buffer;
    if (playingRef.current && !voicePending) runNext();
    return () => { clearTimeout(t2); clearTimeout(tm.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, slides]);
  // the section audio for THIS slide — plays when pressed, waits honestly when not
  React.useEffect(() => {
    if (narrationId == null || !getNarrationJob(narrationId) || i >= slides.length - 1) {
      audioActiveRef.current = false;
      setAudioWait(false);
      return;
    }
    audioActiveRef.current = true;
    const onEnded = () => { if (playingRef.current) advance(); };
    const tryPlay = () => {
      const ok = slidePlay(narrationId, i, onEnded);
      setAudioWait(!ok);
      if (ok) {
        setPressProg(null);
        // SYNC (operator: "the video should seem ONE with the audio"): the real speech duration is
        // known the moment the section plays — restart this slide's subtitle clock scaled to it, so
        // voice and chunks begin together and land across the SPOKEN sentences. This is also what
        // STARTS the clock after a voice-pending hold (the entry effect deliberately did not).
        const dur = getNarrationJob(narrationId)?.segs[i]?.dur;
        audioScaleRef.current = dur && dur > 0.5 && plan.end > 0.5 ? dur / plan.end : 1;
        clearTimeout(tm.current);
        ptr.current = 0; off.current = 0; setSub(-1);
        buildLine();
        if (playingRef.current) runNext();
      }
      return ok;
    };
    let un: null | (() => void) = null;
    if (!tryPlay()) {
      un = subscribeNarration(() => {
        const seg = getNarrationJob(narrationId)?.segs[i];
        setPressProg(seg?.prog ? { done: seg.prog.done, total: seg.prog.total } : null);
        if (playingRef.current && tryPlay() && un) { un(); un = null; }
      });
    }
    return () => { if (un) un(); slideStop(); audioScaleRef.current = 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, narrationId, slides.length, audioNonce]);
  const pause = () => { if (!playingRef.current) return; clearTimeout(tm.current); off.current += (Date.now() - started.current) / 1000; setPlaying(false); if (audioActiveRef.current) slidePause(); };
  const play = () => {
    armAudio(); // gesture — unlock the narration context for every background start after this
    if (playingRef.current) return;
    if (fin) { setFin(false); if (i === slides.length - 1 && off.current >= plan.end - 0.01) { stop(); } }
    setPlaying(true); setTimeout(runNext, 0);
    if (audioActiveRef.current) {
      // resume mid-section; if the voice is DEAD (after ⏹ or a finished section) replay it from 0
      if (getPlayback()?.mode === "slide") slideResume();
      else setAudioNonce((n) => n + 1);
    }
  };
  const stop = () => { clearTimeout(tm.current); ptr.current = 0; off.current = 0; setSub(-1); setPlaying(false); setFin(false); setNonce((n) => n + 1); if (audioActiveRef.current) slideStop(); };
  const reset = () => {
    armAudio();
    clearTimeout(tm.current); setPlaying(true); setFin(false);
    if (audioActiveRef.current || narrationId != null) slideStop();
    if (i === 0) { ptr.current = 0; off.current = 0; setSub(-1); setNonce((n) => n + 1); setAudioNonce((n) => n + 1); setTimeout(runNext, 0); } // the effect replays the cached section — restart, never re-render
    else setI(0);
  };
  const seek = (di: number) => { armAudio(); const n2 = Math.max(0, Math.min(slides.length - 1, i + di)); if (n2 !== i) setI(n2); }; // slide + voice move together (the entry/audio effects own both)
  // ⇣ COMPILE (operator 2026-07-26: "compile the mp4 in the BACKGROUND, loading bar bottom-right,
  // download when done"): the film re-renders frame-accurately onto an offscreen canvas from the
  // same buildPlan — no screen share, no watching; keep working while the bar fills.
  const compile = () => { compileFilm(deck, { portrait }); };
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") { e.preventDefault(); playingRef.current ? pause() : play(); }
      if (e.key === "ArrowRight") seek(1);
      if (e.key === "ArrowLeft") seek(-1);
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, slides.length, onClose, plan]);

  const sl = plan.sl;
  // ▯ PHONE VIEW (operator 2026-07-26: "a cellphone vertical view so we can download for a phone"):
  // the whole film composes inside a centered 9:16 frame with black pillars — record in this mode
  // and the mp4 plays portrait on a phone (players zoom the pillars away).
  const [portrait, setPortrait] = React.useState(false);
  const btn: React.CSSProperties = { background: "transparent", border: `1px solid color-mix(in oklab, ${C.fg} 22%, transparent)`, color: C.fg, borderRadius: 7, padding: "3px 13px", cursor: "pointer", fontFamily: mono, fontSize: 12, opacity: 0.85 };
  const BAR = 58; // the letterbox
  const frameW = portrait ? `min(92vw, calc((100vh - ${BAR * 2}px) * 0.5625))` : "1020px";
  return (
    <div className={playing ? undefined : "cine-paused"} style={{ position: "fixed", inset: 0, zIndex: 1500, background: "#0a0a0c", overflow: "hidden", fontFamily: nav, animation: "cineIn .55s ease both", ["--cine-fw" as any]: frameW }}>
      {/* the FILM LOOK — grain, flicker, vignette */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: GRAIN, opacity: 0.05, pointerEvents: "none", zIndex: 3, animation: "cineFlicker .35s steps(3) infinite" }} />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2, background: "radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,.5) 100%)" }} />
      {/* the CUT — a true black frame between slides */}
      {cut === "black" && <div style={{ position: "absolute", inset: 0, background: "#000", zIndex: 6 }} />}
      {/* ♪ the voice for this scene is still pressing — the film HOLDS as one (no silent subtitles) */}
      {audioWait && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "rgba(8,8,10,.88)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: mono, fontSize: 13, color: C.warn, animation: "cineFlicker 1.3s ease-in-out infinite" }}>⏳ pressing the voice — scene {i + 1}</span>
            {(() => { const j2 = narrationId != null ? getNarrationJob(narrationId) : null; const sg = j2?.segs[i]; return j2 ? (
              <span style={{ fontFamily: mono, fontSize: 10, color: C.dim, fontVariantNumeric: "tabular-nums" }}>
                {sg ? `${fmtTok(segRemainingTokens(sg))} tok this scene` : ""}{sg?.prog ? ` (${sg.prog.done}/${sg.prog.total} units)` : ""} · {fmtTok(jobRemainingTokens(j2))} tok whole film
              </span>) : pressProg ? <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{pressProg.done}/{pressProg.total} units</span> : null; })()}
            <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>the film starts the moment the voice is ready — audio and subtitles as one</span>
          </div>
        </div>
      )}
      {/* ▯ phone pillars — everything composes inside the 9:16 frame */}
      {portrait && (<>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `calc(50% - var(--cine-fw) / 2)`, background: "#000", zIndex: 2 }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: `calc(50% - var(--cine-fw) / 2)`, background: "#000", zIndex: 2 }} />
      </>)}
      {/* LETTERBOX bars — they pinch slightly during a cut, like the projector breathing */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: cut ? BAR + 12 : BAR, background: "#000", zIndex: 4, transition: "height .5s ease" }}>
        <div style={{ display: "flex", alignItems: "center", height: "100%", padding: "0 18px", gap: 12 }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: `color-mix(in oklab, ${C.fg} 55%, transparent)` }}>▶ {deck?.title ?? "video class"}</span>
          <span style={{ flex: 1 }} />
          {(() => { const j2 = narrationId != null ? getNarrationJob(narrationId) : null; const rem = j2 ? jobRemainingTokens(j2) : 0; return j2 && rem > 0 ? (
            <span title="the press runs behind the film — sections land ahead of the projector" style={{ fontFamily: mono, fontSize: 10, color: `color-mix(in oklab, ${C.warn} 75%, transparent)`, fontVariantNumeric: "tabular-nums" }}>⏳ pressing · {fmtTok(rem)} tok left</span>) : null; })()}
          <span style={{ fontFamily: mono, fontSize: 11, color: `color-mix(in oklab, ${C.fg} 45%, transparent)`, fontVariantNumeric: "tabular-nums" }}>{i + 1} / {slides.length}</span>
          <button onClick={onClose} title="close (Esc)" style={{ ...btn, padding: "1px 10px" }}>✕</button>
        </div>
        {/* the film-strip progress — one segment per slide; the current one runs on the slide's own clock */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", gap: 3, padding: "0 18px 5px" }}>
          {slides.map((_, k) => (
            <div key={k} style={{ flex: 1, height: 2.5, background: `color-mix(in oklab, ${C.fg} 14%, transparent)`, borderRadius: 2, overflow: "hidden" }}>
              {k < i && <div style={{ width: "100%", height: "100%", background: C.brand }} />}
              {k === i && <div key={nonce} style={{ height: "100%", background: C.brand, width: 0, animation: `cineProg ${plan.end}s linear forwards` }} />}
            </div>
          ))}
        </div>
      </div>
      {/* THE STAGE */}
      <div key={`${i}-${nonce}`} style={{ position: "absolute", left: 0, right: 0, top: BAR, bottom: BAR, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, animation: cut === "out" ? "cineOut .64s ease both" : "cineIn .7s ease both" }}>
        <div style={{ maxWidth: "var(--cine-fw)", width: portrait ? "var(--cine-fw)" : "94%", maxHeight: "100%", overflow: "hidden", textAlign: "center", animation: `cineKen ${Math.max(6, plan.end)}s linear both`, padding: portrait ? "0 10px" : 0 }}>
          {sl.__logo ? (
            <div>
              <div style={{ fontFamily: nav, fontWeight: 700, fontSize: portrait ? 40 : 56, color: C.fg, animation: "cineLogo 2.6s cubic-bezier(.22,.9,.3,1) both, cineLogoGlow 3.2s ease both" }}>
                antiloki<span style={{ color: C.brand, display: "inline-block", animation: "cineLogoDot .9s ease both", animationDelay: "1.7s" }}>.</span>
              </div>
              <div style={{ fontFamily: nav, fontSize: portrait ? 13 : 15, color: C.muted, marginTop: 14, opacity: 0, animation: "cineRise .8s ease forwards", animationDelay: "2s" }}>Generated for free from antiloki.</div>
              <div style={{ fontFamily: nav, fontSize: portrait ? 11.5 : 13, color: C.dim, fontStyle: "italic", marginTop: 5, opacity: 0, animation: "cineRise .8s ease forwards", animationDelay: "2.6s" }}>No AI interpretation — raw data into intelligence.</div>
            </div>
          ) : (<>
          {/* the TITLE writes itself */}
          <div style={{ fontSize: portrait ? 21 : 30, fontWeight: 700, color: C.fg, lineHeight: 1.3, marginBottom: portrait ? 14 : 22, letterSpacing: 0.2 }}>
            <Write text={String(sl.topic ?? "")} delay={0.35} cps={20} caret />
          </div>
          {/* the WIDGET gains life — in the phone frame it scales down so nothing overflows */}
          {sl.widget && <div style={{ margin: "0 auto 18px", ...(portrait ? { transform: "scale(.8)", transformOrigin: "top center" } : {}) }}><CineWidget w={sl.widget} delay={plan.t0} /></div>}
          {/* the BULLETS rise one by one */}
          {(sl.bullets ?? []).length > 0 && (
            <div style={{ maxWidth: portrait ? "100%" : 680, margin: "0 auto" }}>
              {(sl.bullets as string[]).map((b2, j) => (
                <div key={j} style={{ fontSize: portrait ? 13 : 15, color: C.muted, lineHeight: 1.9, opacity: 0, animation: "cineRise .55s ease forwards", animationDelay: `${plan.t0 + widgetDur(sl.widget) + 0.35 + j * 0.5}s` }}>– {b2}</div>
              ))}
            </div>
          )}
          </>)}
        </div>
      </div>
      {/* SUBTITLES — someone is talking */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: BAR + 14, zIndex: 5, display: "flex", justifyContent: "center", pointerEvents: "none", minHeight: 54 }}>
        {sub >= 0 && plan.chunks[sub] && (
          <div key={`${i}-${sub}-${nonce}`} style={{ maxWidth: portrait ? "calc(var(--cine-fw) - 16px)" : 780, padding: "6px 18px", background: "rgba(0,0,0,.55)", borderRadius: 9, fontSize: portrait ? 14 : 16.5, lineHeight: 1.55, color: "#f2f2f4", textShadow: "0 2px 6px rgba(0,0,0,.9)", fontFamily: nav }}>
            <Write text={plan.chunks[sub]} delay={0.05} cps={SUB_CPS} />
          </div>
        )}
      </div>
      {/* the BOTTOM bar — transport controls (a lone ◉ while the tape runs, so the chrome stays out of the film) */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: cut ? BAR + 12 : BAR, background: "#000", zIndex: 4, transition: "height .5s ease", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
        <button onClick={reset} title="reset — the film from the top" style={btn}>⟲</button>
        <button onClick={() => seek(-1)} disabled={i === 0} title="previous slide (←)" style={{ ...btn, opacity: i === 0 ? 0.3 : 0.85 }}>‹</button>
        <button onClick={() => (playing ? pause() : play())} title="play / pause (space)" style={{ ...btn, borderColor: C.brand, color: C.brand, padding: "3px 19px", fontSize: 13 }}>{playing ? "⏸" : "▶"}</button>
        <button onClick={stop} title="stop — freeze at this slide's first frame" style={btn}>⏹</button>
        <button onClick={() => seek(1)} disabled={i === slides.length - 1} title="next slide (→)" style={{ ...btn, opacity: i === slides.length - 1 ? 0.3 : 0.85 }}>›</button>
        <span style={{ width: 10 }} />
        <button onClick={() => setMuted((v) => { const nv = !v; if (narrationId != null) setNarrationMuted(nv); return nv; })} title="sound on/off — the voice track and the foley together" style={{ ...btn, color: muted ? C.dim : C.fg }}>{muted ? "🔇" : "🔊"}</button>
        <button onClick={() => setPortrait((v) => !v)} title="compose for a phone — a 9:16 vertical frame; compile in this mode for a portrait video" style={{ ...btn, borderColor: portrait ? C.brand : undefined, color: portrait ? C.brand : C.fg }}>{portrait ? "▭ wide" : "▯ phone"}</button>
        <button onClick={() => downloadDeck(deck, "md")} title="the class as markdown notes" style={{ ...btn, padding: "3px 9px", fontSize: 11 }}>md</button>
        <button onClick={() => downloadDeck(deck, "html")} title="the class as a standalone HTML slide deck — arrow keys navigate, self-contained" style={{ ...btn, padding: "3px 9px", fontSize: 11 }}>html</button>
        <button onClick={() => downloadDeck(deck, "pdf")} title="the slides as PDF — a print window opens, save as PDF there" style={{ ...btn, padding: "3px 9px", fontSize: 11 }}>pdf</button>
        <button onClick={compile} title="compile the film to a video file IN THE BACKGROUND — a progress bar appears bottom-right; keep working, the download offers itself when done (.mp4 where the browser encodes it, .webm otherwise)" style={{ ...btn, borderColor: `color-mix(in oklab, ${C.ok} 55%, transparent)`, color: C.ok }}>⇣ mp4</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE BACKGROUND COMPILER (operator 2026-07-26: "compile the mp4 in the background and show when
// it is done to download; during, a loading bar bottom-right, overlaying"). The film re-renders
// frame-accurately onto an OFFSCREEN canvas from the same buildPlan timings, canvas.captureStream(24)
// feeds a MediaRecorder, and a vanilla-DOM overlay (independent of the player — close it, keep
// working) shows the bar and offers the file when the tape ends. .mp4 where the browser encodes it
// (Chrome 126+), .webm otherwise — the filename says which. Real-time render: a 3-minute class
// takes 3 minutes in the background; the overlay says to keep the tab visible (browsers throttle
// hidden tabs' frames).
// ════════════════════════════════════════════════════════════════════════════════════════════════
type Pal = { bg: string; fg: string; dim: string; muted: string; border: string; brand: string; ok: string; warn: string; bad: string; panel: string; panel2: string };
// canvas can't parse var()/color-mix() — resolve every theme token to a computed rgb() by painting
// it on a probe element (operator 2026-07-26: the first compile's background proved this the hard way).
function resolveTheme(): Pal {
  const probe = document.createElement("span");
  probe.style.display = "none"; document.body.appendChild(probe);
  const rv = (v: string, fb: string) => {
    try { probe.style.color = ""; probe.style.color = String(v); const out = getComputedStyle(probe).color; return out && out !== "rgba(0, 0, 0, 0)" ? out : fb; } catch { return fb; }
  };
  const pal = { bg: rv(C.bg, "#0e0e11"), fg: rv(C.fg, "#e7e7ea"), dim: rv(C.dim, "#8a8a92"), muted: rv(C.muted, "#b9b9c0"), border: rv(C.border, "#2a2a30"), brand: rv(C.brand, "#e08a3c"), ok: rv(C.ok, "#57b97a"), warn: rv(C.warn, "#d9a13c"), bad: rv(C.bad, "#d96a5f"), panel: rv(C.panel, "#17171b"), panel2: rv(C.panel2, "#1d1d22") };
  probe.remove();
  return pal;
}
const cl01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const oBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1, u = cl01(t) - 1; return 1 + c3 * u * u * u + c1 * u * u; };
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = String(text ?? "").split(/\s+/); const out: string[] = []; let cur = "";
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  return out;
}
function partialCurve(ctx: CanvasRenderingContext2D, x0: number, y0: number, xc: number, yc: number, x1: number, y1: number, p: number) {
  const n = 24, m = Math.max(0, Math.min(n, Math.floor(cl01(p) * n)));
  if (m < 1) return;
  ctx.beginPath();
  for (let q = 0; q <= m; q += 1) { const t = q / n, a = 1 - t; const x = a * a * x0 + 2 * a * t * xc + t * t * x1, y = a * a * y0 + 2 * a * t * yc + t * t * y1; if (q === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.stroke();
}
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); (ctx as any).roundRect(x, y, w, h, r); }
function noiseTile(): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = 140; c.height = 140;
  const x = c.getContext("2d")!; const img = x.createImageData(140, 140);
  for (let q = 0; q < img.data.length; q += 4) { const v = Math.floor(Math.random() * 255); img.data[q] = v; img.data[q + 1] = v; img.data[q + 2] = v; img.data[q + 3] = 255; }
  x.putImageData(img, 0, 0);
  return c;
}

// one widget frame at local time tw, centered at cx within maxW — the canvas twin of CineWidget,
// same choreography per type, so the compiled film matches the on-screen one.
function drawWidgetFrame(ctx: CanvasRenderingContext2D, P: Pal, w: any, tw: number, cx: number, y: number, maxW: number, k: number) {
  if (!w || tw < 0) return;
  const p = w.payload ?? {};
  const monoF = (s: number) => `${Math.round(s * k)}px ${mono}`;
  if (w.title) { const a0 = ctx.globalAlpha; ctx.font = monoF(15); ctx.fillStyle = P.dim; ctx.textAlign = "center"; ctx.globalAlpha = a0 * cl01(tw / 0.5); ctx.fillText(String(w.title).toUpperCase().slice(0, 70), cx, y); ctx.globalAlpha = a0; }
  const top = y + 26 * k;
  const cap = Math.max(30, Math.floor(maxW / (8.2 * k))); // char clamp so text never escapes the frame (phone!)
  if (w.type === "flow") {
    const steps = (p.steps ?? []).slice(0, 7).map(String);
    ctx.font = monoF(17);
    const ws = steps.map((s: string) => Math.min(300 * k, ctx.measureText(s).width + 34 * k));
    const gap = 40 * k; const totalW = ws.reduce((a: number, b: number) => a + b, 0) + gap * (steps.length - 1);
    const sc0 = totalW > maxW ? maxW / totalW : 1;
    let x = cx - (totalW * sc0) / 2;
    steps.forEach((s: string, si: number) => {
      const pop = cl01((tw - si * 0.55) / 0.55);
      const bw = ws[si] * sc0, bh = 44 * k * sc0;
      if (pop > 0) {
        const sc = oBack(pop);
        ctx.save(); ctx.translate(x + bw / 2, top + bh / 2); ctx.rotate(si % 2 ? 0.012 : -0.012); ctx.scale(sc, sc); ctx.globalAlpha = pop;
        ctx.fillStyle = P.panel2; ctx.strokeStyle = P.border; ctx.lineWidth = 1.5; rrect(ctx, -bw / 2, -bh / 2, bw, bh, 11); ctx.fill(); ctx.stroke();
        ctx.fillStyle = P.fg; ctx.font = `${Math.round(16 * k * sc0)}px ${mono}`; ctx.textAlign = "center"; ctx.fillText(s.slice(0, 34), 0, 5); ctx.restore();
        if (si < steps.length - 1) { const ap = cl01((tw - si * 0.55 - 0.4) / 0.4); if (ap > 0) { ctx.strokeStyle = P.dim; ctx.lineWidth = 1.8; partialCurve(ctx, x + bw + 4, top + bh / 2 - 4, x + bw + (gap * sc0) / 2, top + bh / 2 + 7, x + bw + gap * sc0 - 6, top + bh / 2 - 2, ap); } }
      }
      x += bw + gap * sc0;
    });
  } else if (w.type === "balance") {
    const bw = Math.min(300 * k, (maxW - 80 * k) / 2), bh = 100 * k;
    const beam = cl01(tw / 0.5), tri = cl01((tw - 0.25) / 0.6);
    const rock = tw > 1.7 ? Math.sin(cl01((tw - 1.7) / 1.1) * Math.PI) * 0.018 : 0;
    ctx.save(); ctx.translate(cx, top + 34 * k); ctx.rotate(rock);
    if (beam > 0) { ctx.strokeStyle = P.dim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-26 * k * beam, -6 * k); ctx.lineTo(26 * k * beam, 2 * k); ctx.stroke(); }
    if (tri > 0) { ctx.strokeStyle = P.dim; ctx.lineWidth = 1.6; ctx.globalAlpha = tri; ctx.beginPath(); ctx.moveTo(-9 * k, 34 * k); ctx.lineTo(9 * k, 34 * k); ctx.lineTo(0, 0); ctx.closePath(); ctx.stroke(); ctx.globalAlpha = 1; }
    const side = (S: any, dir: number, d0: number) => {
      const pp = cl01((tw - d0) / 0.6); if (pp <= 0) return;
      const bx = dir * (bw / 2 + 46 * k), by = 8 * k - 20 * k * (1 - pp);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(dir * 0.019); ctx.globalAlpha = pp;
      ctx.fillStyle = P.panel2; ctx.strokeStyle = P.border; ctx.lineWidth = 1.5; rrect(ctx, -bw / 2, -bh / 2, bw, bh, 12); ctx.fill(); ctx.stroke();
      ctx.textAlign = "left"; ctx.fillStyle = P.fg; ctx.font = `700 ${Math.round(15 * k)}px ${mono}`; ctx.fillText(String(S?.label ?? "—").slice(0, 26), -bw / 2 + 12 * k, -bh / 2 + 22 * k);
      ctx.font = monoF(12); ctx.fillStyle = P.muted;
      (S?.items ?? []).slice(0, 4).forEach((it: any, ii: number) => { if (tw > d0 + 0.25 + ii * 0.18) ctx.fillText(`– ${String(it).slice(0, 34)}`, -bw / 2 + 12 * k, -bh / 2 + (40 + ii * 17) * k); });
      ctx.restore();
    };
    side(p.left ?? {}, -1, 0.55); side(p.right ?? {}, 1, 1.05);
    ctx.restore();
    if (p.verdict && tw > 2.1) { ctx.globalAlpha = cl01((tw - 2.1) / 0.5); ctx.font = monoF(13); ctx.fillStyle = P.muted; ctx.textAlign = "center"; ctx.fillText(`⚖ ${String(p.verdict).slice(0, 80)}`, cx, top + 34 * k + bh + 20 * k); ctx.globalAlpha = 1; }
  } else if (w.type === "timeline") {
    const evs = (p.events ?? []).map((e: any) => (typeof e === "string" ? { label: e } : e)).filter((e: any) => e?.label).slice(0, 8);
    const lw = maxW * 0.92, lx = cx - lw / 2, ly = top + 22 * k;
    ctx.strokeStyle = P.border; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + lw * cl01(tw / 0.8), ly); ctx.stroke();
    evs.forEach((e: any, ei: number) => {
      const pp = cl01((tw - 0.5 - ei * 0.5) / 0.5); if (pp <= 0) return;
      const x = evs.length === 1 ? cx : lx + (ei / (evs.length - 1)) * lw;
      ctx.globalAlpha = pp; ctx.fillStyle = P.panel; ctx.strokeStyle = ei === evs.length - 1 ? P.brand : P.dim; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(x, ly, 8 * k * oBack(pp), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ei === evs.length - 1 ? P.fg : P.muted; ctx.font = monoF(12); ctx.textAlign = "center"; ctx.fillText(String(e.label).slice(0, 22), x, ly + 28 * k); ctx.globalAlpha = 1;
    });
  } else if (w.type === "graph-focus") {
    const files = (p.files ?? []).slice(0, 7).map(String);
    const cy = top + 90 * k, rx2 = Math.min(maxW / 2 - 40 * k, 330 * k);
    const hub = cl01(tw / 0.7);
    if (hub > 0.04) {
      ctx.strokeStyle = P.brand; ctx.lineWidth = 2; ctx.fillStyle = P.panel2;
      ctx.beginPath(); ctx.ellipse(cx, cy, 80 * k, 25 * k, 0, 0, Math.PI * 2 * hub); ctx.fill(); ctx.stroke();
    }
    if (tw > 0.4) { ctx.globalAlpha = cl01((tw - 0.4) / 0.4); ctx.fillStyle = P.fg; ctx.font = monoF(13); ctx.textAlign = "center"; ctx.fillText(String(p.note ?? "the subject").slice(0, 30), cx, cy + 5 * k); ctx.globalAlpha = 1; }
    files.forEach((f: string, fi: number) => {
      const d0 = 0.55 + fi * 0.45, dp = cl01((tw - d0) / 0.45), np = cl01((tw - d0 - 0.28) / 0.45);
      if (dp <= 0) return;
      const ang = (fi / files.length) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(ang) * rx2, yv = cy + Math.sin(ang) * 82 * k;
      ctx.strokeStyle = P.brand; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.6;
      partialCurve(ctx, cx, cy, (cx + x) / 2 + (fi % 2 ? 20 : -20), (cy + yv) / 2, x, yv, dp); ctx.globalAlpha = 1;
      if (np > 0) {
        const nm = f.split("/").pop() ?? f; ctx.font = monoF(13); const ew = Math.max(46 * k, ctx.measureText(nm).width / 2 + 16 * k);
        ctx.save(); ctx.translate(x, yv); ctx.rotate(fi % 2 ? 0.02 : -0.02); const sc = oBack(np); ctx.scale(sc, sc); ctx.globalAlpha = np;
        ctx.fillStyle = P.panel; ctx.strokeStyle = P.dim; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(0, 0, ew, 17 * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = P.fg; ctx.textAlign = "center"; ctx.fillText(nm.slice(0, 26), 0, 5 * k); ctx.restore();
      }
    });
  } else if (w.type === "layers") {
    const layers = (p.layers ?? []).slice(0, 6).map(String);
    const bw = Math.min(430 * k, maxW * 0.8);
    layers.forEach((l: string, li: number) => {
      const pp = cl01((tw - li * 0.42) / 0.5); if (pp <= 0) return;
      const yv = top + li * 42 * k - 20 * k * (1 - pp);
      ctx.save(); ctx.translate(cx, yv + 16 * k); ctx.rotate(li % 2 ? 0.009 : -0.009); ctx.globalAlpha = pp;
      ctx.fillStyle = P.panel2; ctx.strokeStyle = P.border; ctx.lineWidth = 1.5; rrect(ctx, -bw / 2, -16 * k, bw, 32 * k, 9); ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.fg; ctx.font = monoF(14); ctx.textAlign = "center"; ctx.fillText(l.slice(0, 44), 0, 5 * k); ctx.restore();
    });
    if (p.breach && tw > layers.length * 0.42 + 0.3) { ctx.fillStyle = P.bad; ctx.font = monoF(12); ctx.textAlign = "center"; ctx.fillText(`⤫ breach: ${String(p.breach).slice(0, 60)}`, cx, top + layers.length * 42 * k + 16 * k); }
  } else if (w.type === "root-cause-tree" || w.type === "repair-order") {
    const isWhy = w.type === "root-cause-tree";
    const lines = isWhy
      ? [`// WHY — ${String(p.root ?? "").slice(0, 72)}`, ...(p.branches ?? []).slice(0, 5).map((b: any) => `//  ↳ ${String(b).slice(0, 70)}`)]
      : [`// FIX, in order:`, ...(p.steps ?? []).slice(0, 6).map((s2: any, j: number) => `//  ${j + 1}. ${String(s2).slice(0, 70)}`)];
    const bw = Math.min(maxW * 0.94, 900 * k);
    ctx.fillStyle = P.panel; ctx.strokeStyle = P.border; ctx.lineWidth = 1.4; rrect(ctx, cx - bw / 2, top, bw, lines.length * 27 * k + 22 * k, 10); ctx.fill(); ctx.stroke();
    let acc2 = 0;
    ctx.textAlign = "left"; ctx.font = monoF(14);
    lines.forEach((ln, li) => {
      const chars = Math.floor(Math.max(0, tw - acc2) * 46);
      acc2 += ln.length / 46 + 0.16;
      if (chars <= 0) return;
      ctx.fillStyle = li === 0 ? P.ok : P.muted;
      ctx.fillText(ln.slice(0, Math.min(chars, cap)), cx - bw / 2 + 16 * k, top + 27 * k + li * 27 * k);
    });
  } else if (w.type === "axes") {
    const axes = (p.axes ?? []).slice(0, 7);
    const bw = Math.min(maxW * 0.86, 640 * k);
    const tone = (s2: number) => (s2 >= 80 ? P.ok : s2 >= 60 ? P.warn : P.bad);
    axes.forEach((a2: any, ai: number) => {
      const d0 = 0.3 + ai * 0.45, pp = cl01((tw - d0) / 0.4); if (pp <= 0) return;
      const yv = top + ai * 34 * k;
      const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * pp;
      ctx.textAlign = "left"; ctx.fillStyle = P.muted; ctx.font = monoF(14);
      ctx.fillText(String(a2.ax).slice(0, 12), cx - bw / 2, yv + 5 * k);
      const tx = cx - bw / 2 + 128 * k, tw3 = bw - 180 * k;
      ctx.fillStyle = "rgba(255,255,255,.08)"; rrect(ctx, tx, yv - 5 * k, tw3, 10 * k, 5); ctx.fill();
      const grow = cl01((tw - d0 - 0.1) / 0.7);
      const frac = Math.max(0.02, Math.min(1, (Number(a2.s) || 0) / 100)) * grow;
      if (frac > 0.01) { ctx.fillStyle = tone(Number(a2.s) || 0); rrect(ctx, tx, yv - 5 * k, tw3 * frac, 10 * k, 5); ctx.fill(); }
      if (tw > d0 + 0.55) { ctx.textAlign = "right"; ctx.fillStyle = tone(Number(a2.s) || 0); ctx.font = monoF(15); ctx.fillText(String(a2.s), cx + bw / 2, yv + 5 * k); }
      ctx.globalAlpha = a0;
    });
  } else if (w.type === "code-exhibit") {
    // the PROOF on tape: source lines land one by one, the sick line burns, the charge label + a
    // hand arrow draw in after — allegations always arrive with their code.
    const lines = (p.lines ?? []).slice(0, 9);
    const sick = p.sick;
    const bw = Math.min(maxW * 0.96, 880 * k), lh = 24 * k;
    const boxTop = top + 26 * k;
    ctx.fillStyle = P.panel; ctx.strokeStyle = P.border; ctx.lineWidth = 1.4; rrect(ctx, cx - bw / 2, boxTop, bw, lines.length * lh + 14 * k, 10); ctx.fill(); ctx.stroke();
    let sickY = -1;
    lines.forEach((r: any, li: number) => {
      const d0 = 0.3 + li * 0.42, pp = cl01((tw - d0) / 0.3); if (pp <= 0) return;
      const yv = boxTop + 10 * k + li * lh;
      const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * pp;
      if (r.ln === sick) { ctx.fillStyle = "rgba(217,106,95,.12)"; ctx.fillRect(cx - bw / 2 + 1, yv - 14 * k, bw - 2, lh); sickY = yv; }
      ctx.textAlign = "right"; ctx.fillStyle = r.ln === sick ? P.bad : P.dim; ctx.font = monoF(11); ctx.fillText(String(r.ln), cx - bw / 2 + 40 * k, yv);
      ctx.textAlign = "left"; ctx.fillStyle = P.fg; ctx.font = monoF(13);
      const chars = Math.floor(Math.max(0, tw - d0) * 64);
      ctx.globalAlpha = a0 * pp * (r.ln === sick ? 1 : 0.75);
      ctx.fillText(String(r.text).slice(0, Math.min(chars, cap)), cx - bw / 2 + 52 * k, yv);
      ctx.globalAlpha = a0;
    });
    const noteAt = 0.5 + lines.length * 0.42;
    if (tw > noteAt && sickY > 0) {
      const np = cl01((tw - noteAt) / 0.5);
      const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * np;
      const label = `⚖ ${String(p.label ?? "the charge")}${p.note ? ` — ${String(p.note).slice(0, Math.max(20, cap - 30))}` : ""}`;
      ctx.font = monoF(12); const lw2 = Math.min(bw * 0.8, ctx.measureText(label).width + 26 * k);
      const lx = cx + bw / 2 - lw2, ly2 = top - 6 * k;
      ctx.save(); ctx.translate(lx + lw2 / 2, ly2); ctx.rotate(0.02);
      ctx.fillStyle = "rgba(217,106,95,.10)"; ctx.strokeStyle = P.bad; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]); rrect(ctx, -lw2 / 2, -13 * k, lw2, 26 * k, 8); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = P.fg; ctx.textAlign = "center"; ctx.fillText(label, 0, 4 * k); ctx.restore();
      ctx.strokeStyle = P.bad; ctx.lineWidth = 1.7;
      partialCurve(ctx, lx + 8 * k, ly2 + 12 * k, lx - 60 * k, (ly2 + sickY) / 2, cx - bw / 2 + 60 * k, sickY - 5 * k, cl01((tw - noteAt - 0.2) / 0.55));
      ctx.globalAlpha = a0;
    }
  } else if (w.type === "before-after") {
    const bad = String(p.bad ?? "").split("\n").slice(0, 5), good = String(p.good ?? "").split("\n").slice(0, 5);
    const bw = Math.min(maxW * 0.94, 900 * k), lh = 23 * k;
    const wipe1 = cl01(tw / 0.9), arrow = cl01((tw - 1.1) / 0.5), wipe2 = cl01((tw - 1.8) / 1);
    const h1 = bad.length * lh + 32 * k, h2 = good.length * lh + 32 * k;
    if (wipe1 > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(cx - bw / 2, top, bw * wipe1, h1); ctx.clip();
      ctx.fillStyle = "rgba(217,106,95,.10)"; ctx.fillRect(cx - bw / 2, top, bw, h1);
      ctx.fillStyle = P.bad; ctx.font = monoF(11); ctx.textAlign = "left"; ctx.fillText("− before", cx - bw / 2 + 12 * k, top + 17 * k);
      ctx.fillStyle = P.fg; ctx.font = monoF(13); bad.forEach((ln, li) => ctx.fillText(ln.slice(0, Math.min(92, cap)), cx - bw / 2 + 12 * k, top + 36 * k + li * lh));
      ctx.restore();
    }
    if (arrow > 0) { ctx.strokeStyle = P.dim; ctx.lineWidth = 1.8; partialCurve(ctx, cx - 40 * k, top + h1 + 4, cx, top + h1 + 16 * k, cx + 40 * k, top + h1 + 8, arrow); }
    const gy = top + h1 + 24 * k;
    if (wipe2 > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(cx - bw / 2, gy, bw * wipe2, h2); ctx.clip();
      ctx.fillStyle = "rgba(87,185,122,.10)"; ctx.fillRect(cx - bw / 2, gy, bw, h2);
      ctx.fillStyle = P.ok; ctx.font = monoF(11); ctx.textAlign = "left"; ctx.fillText("+ after — same logic, restructured", cx - bw / 2 + 12 * k, gy + 17 * k);
      ctx.fillStyle = P.fg; ctx.font = monoF(13); good.forEach((ln, li) => ctx.fillText(ln.slice(0, Math.min(92, cap)), cx - bw / 2 + 12 * k, gy + 36 * k + li * lh));
      ctx.restore();
    }
  }
}

let activeCompile: { cancel: () => void } | null = null;
export function compileFilm(deck: any, opts: { portrait: boolean }) {
  if (activeCompile) return; // one tape at a time — the overlay is already up
  const P = resolveTheme();
  const slides = [...((deck?.slides ?? []) as any[]), { __logo: true }];
  if (slides.length < 2) return;
  const plans = slides.map(buildPlan);
  const CUT = 0.76;
  const starts: number[] = []; let total0 = 0;
  plans.forEach((pl) => { starts.push(total0); total0 += pl.end + CUT; });
  const total = total0 + 0.6;
  const W = opts.portrait ? 1080 : 1920, H = opts.portrait ? 1920 : 1080;
  const k = opts.portrait ? 1 : 1.15;
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const grain = noiseTile();
  const grainPat = ctx.createPattern(grain, "repeat") as CanvasPattern;
  const BARC = Math.round(H * 0.055);

  // the OVERLAY — vanilla DOM, bottom-right, survives the player closing
  const box = document.createElement("div");
  box.style.cssText = `position:fixed;right:18px;bottom:18px;z-index:4000;width:274px;background:${P.panel};border:1px solid ${P.border};border-radius:12px;padding:11px 14px;font-family:${mono};font-size:11px;color:${P.muted};box-shadow:0 14px 44px rgba(0,0,0,.55)`;
  box.innerHTML =
    `<div style="display:flex;gap:8px;align-items:center"><span>🎬</span><b style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${P.fg}">${String(deck?.title ?? "video class").replace(/[<>&]/g, "")}</b><button data-x style="background:transparent;border:1px solid ${P.border};color:${P.dim};border-radius:5px;padding:0 7px;cursor:pointer;font-family:inherit;font-size:11px">✕</button></div>` +
    `<div data-msg style="color:${P.dim};margin-top:7px;line-height:1.5">compiling the film in the background… keep this tab visible.</div>` +
    `<div style="height:5px;background:${P.border};border-radius:3px;margin-top:7px;overflow:hidden"><div data-bar style="height:100%;width:0%;background:${P.brand};transition:width .3s linear"></div></div>` +
    `<div data-dl style="margin-top:8px;display:none"></div>`;
  document.body.appendChild(box);
  const msg = box.querySelector("[data-msg]") as HTMLElement, bar = box.querySelector("[data-bar]") as HTMLElement, dl = box.querySelector("[data-dl]") as HTMLElement;

  const stream: MediaStream = (canvas as any).captureStream(24);
  // FOLEY on the tape (operator 2026-07-26): the same cue list the player fires, scheduled onto a
  // silent MediaStream destination — the mp4 carries the pops/draws/cuts without playing them aloud.
  let ac: AudioContext | null = null;
  try {
    ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    const foley = makeFoley(ac, dest);
    const base = ac.currentTime + 0.15;
    plans.forEach((pl2, q2) => foleyCues(pl2).forEach((c2) => foley.at(c2.kind, base + starts[q2] + c2.t)));
    const at = dest.stream.getAudioTracks()[0];
    if (at) stream.addTrack(at);
    void ac.resume();
  } catch { ac = null; }
  const mime = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp9", "video/webm"].find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) ?? "video/webm";
  let mr: MediaRecorder;
  try { mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 11_000_000 }); }
  catch { stream.getAudioTracks().forEach((tr) => stream.removeTrack(tr)); mr = new MediaRecorder(stream, { mimeType: mime.split(",")[0].replace(/;codecs=.*$/, ""), videoBitsPerSecond: 11_000_000 }); }
  const parts: BlobPart[] = [];
  mr.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  let cancelled = false; let raf = 0;
  mr.onstop = () => {
    activeCompile = null;
    try { void ac?.close(); } catch { /* */ }
    if (cancelled) { box.remove(); return; }
    const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
    const blob = new Blob(parts, { type: mime });
    const url = URL.createObjectURL(blob);
    bar.style.width = "100%";
    msg.textContent = `🎬 the film is ready — ${(blob.size / 1e6).toFixed(1)} MB · ${ext}${opts.portrait ? " · phone 9:16" : ""}`;
    dl.style.display = "block";
    dl.innerHTML = `<a download="${String(deck?.title ?? "video-class").replace(/[^\w-]+/g, "_").slice(0, 70)}.${ext}" href="${url}" style="display:inline-block;background:${P.brand};color:${P.bg};border-radius:7px;padding:4px 14px;text-decoration:none;font-family:inherit;font-size:11px;font-weight:700">⇣ download the video</a>`;
    (box.querySelector("[data-x]") as HTMLElement).onclick = () => { URL.revokeObjectURL(url); box.remove(); };
  };
  (box.querySelector("[data-x]") as HTMLElement).onclick = () => { cancelled = true; cancelAnimationFrame(raf); try { mr.stop(); } catch { box.remove(); activeCompile = null; } };

  const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, "0")}`;
  const t0 = performance.now();
  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#0a0a0c"; ctx.fillRect(0, 0, W, H);
    // locate the slide
    let si = slides.length - 1;
    for (let q = 0; q < starts.length; q += 1) if (t >= starts[q] && (q === starts.length - 1 || t < starts[q + 1])) { si = q; break; }
    const tau = t - starts[si]; const pl = plans[si]; const sl = slides[si];
    const inCut = tau > pl.end; const outP = inCut ? cl01((tau - pl.end) / 0.64) : 0; const black = inCut && tau > pl.end + 0.64;
    if (!black && t < total0) {
      const inP = cl01(tau / 0.7);
      const ken = 1 + 0.035 * cl01(tau / pl.end);
      const alpha = inCut ? 1 - outP : 0.15 + 0.85 * inP;
      const scale = (inCut ? 1 + 0.05 * outP : 0.965 + 0.035 * inP) * ken;
      ctx.save(); ctx.globalAlpha = cl01(alpha);
      ctx.translate(W / 2, H / 2); ctx.scale(scale, scale); ctx.translate(-W / 2, -H / 2);
      const cx = W / 2, maxW = opts.portrait ? W - 90 : Math.min(1500, W - 240);
      if ((sl as any).__logo) {
        const ft = tau;
        const a2 = cl01(ft / 1.5);
        const blur = Math.max(0, 15 * (1 - cl01(ft / 2.2)));
        const sc3 = 1.08 - 0.08 * cl01(ft / 2.4);
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(sc3, sc3);
        try { (ctx as any).filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : "none"; } catch { /* */ }
        ctx.globalAlpha = cl01(alpha) * a2; ctx.textBaseline = "middle"; ctx.textAlign = "center";
        ctx.font = `700 ${Math.round(62 * k)}px ${nav}`;
        ctx.shadowColor = P.brand; ctx.shadowBlur = 34 * Math.sin(Math.min(Math.PI, ft * 1.1)) + 10;
        const wWord = ctx.measureText("antiloki").width, wDot = ctx.measureText(".").width;
        ctx.fillStyle = P.fg; ctx.fillText("antiloki", -wDot / 2, 0);
        ctx.globalAlpha = cl01(alpha) * a2 * cl01((ft - 1.5) / 0.8);
        ctx.fillStyle = P.brand; ctx.fillText(".", wWord / 2, 0);
        try { (ctx as any).filter = "none"; } catch { /* */ }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = cl01(alpha) * cl01((ft - 2) / 0.8);
        ctx.font = `${Math.round(19 * k)}px ${nav}`; ctx.fillStyle = P.muted;
        ctx.fillText("Generated for free from antiloki.", 0, 58 * k);
        ctx.globalAlpha = cl01(alpha) * cl01((ft - 2.6) / 0.8);
        ctx.font = `italic ${Math.round(16 * k)}px ${nav}`; ctx.fillStyle = P.dim;
        ctx.fillText("No AI interpretation — raw data into intelligence.", 0, 86 * k);
        ctx.restore(); ctx.globalAlpha = 1; ctx.textBaseline = "alphabetic";
        ctx.restore();
      } else {
      // TITLE typewriter
      ctx.font = `700 ${Math.round((opts.portrait ? 40 : 52) * k)}px ${nav}`; ctx.textAlign = "center";
      const chars = Math.max(0, Math.floor((tau - 0.35) * 20));
      const tl = wrapLines(ctx, String(sl.topic ?? ""), maxW);
      let used = 0; const titleTop = BARC + (opts.portrait ? 130 : 110) * k;
      tl.forEach((ln, li) => { const take = Math.max(0, Math.min(ln.length, chars - used)); used += ln.length + 1; if (take > 0) { ctx.fillStyle = P.fg; ctx.fillText(ln.slice(0, take), cx, titleTop + li * (opts.portrait ? 52 : 64) * k); } });
      let yv = titleTop + tl.length * (opts.portrait ? 52 : 64) * k + 28 * k;
      // WIDGET
      if (sl.widget) { drawWidgetFrame(ctx, P, sl.widget, tau - pl.t0, cx, yv, maxW, k); yv += (opts.portrait ? 340 : 310) * k; }
      // BULLETS
      const bl = (sl.bullets ?? []) as string[];
      ctx.font = `${Math.round(19 * k)}px ${nav}`; ctx.textAlign = "center";
      bl.forEach((b2, j) => {
        const d0 = pl.t0 + widgetDur(sl.widget) + 0.35 + j * 0.5, pp = cl01((tau - d0) / 0.55);
        if (pp <= 0) return;
        ctx.globalAlpha = cl01(alpha) * pp; ctx.fillStyle = P.muted;
        ctx.fillText(`– ${b2.slice(0, 90)}`, cx, yv + j * 31 * k + 14 * (1 - pp));
      });
      ctx.globalAlpha = cl01(alpha);
      // SUBTITLES — someone is talking
      let sk = -1; for (const ev of pl.evs) if (tau >= ev.t) sk = ev.k;
      if (sk >= 0 && pl.chunks[sk] && !inCut) {
        const ev = pl.evs.find((e) => e.k === sk)!;
        const sc2 = Math.max(0, Math.floor((tau - ev.t - 0.05) * SUB_CPS));
        const text = pl.chunks[sk].slice(0, sc2);
        if (text) {
          let fs = Math.round(21 * k);
          ctx.font = `${fs}px ${nav}`;
          const fullW = ctx.measureText(pl.chunks[sk]).width;
          if (fullW > maxW - 50) { fs = Math.max(13, Math.floor(fs * (maxW - 50) / fullW)); ctx.font = `${fs}px ${nav}`; }
          const tw2 = ctx.measureText(pl.chunks[sk]).width + 44 * k;
          const sy = H - BARC - 70 * k;
          ctx.fillStyle = "rgba(0,0,0,.55)"; rrect(ctx, cx - tw2 / 2, sy - 27 * k, tw2, 42 * k, 10); ctx.fill();
          ctx.fillStyle = "#f2f2f4"; ctx.textAlign = "center"; ctx.fillText(text, cx, sy);
        }
      }
      }
      ctx.restore();
    }
    // letterbox + film chrome (no buttons — a clean print)
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, BARC); ctx.fillRect(0, H - BARC, W, BARC);
    ctx.fillStyle = P.dim; ctx.font = `${Math.round(15 * k)}px ${mono}`; ctx.textAlign = "left";
    ctx.fillText(`▶ ${String(deck?.title ?? "video class").slice(0, 60)}`, 22, BARC / 2 + 5);
    ctx.textAlign = "right"; ctx.fillText(`${si + 1} / ${slides.length}`, W - 22, BARC / 2 + 5);
    const segW = (W - 44 - (slides.length - 1) * 4) / slides.length;
    slides.forEach((_, q) => {
      const x = 22 + q * (segW + 4);
      ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.fillRect(x, BARC - 7, segW, 3);
      const f = q < si ? 1 : q === si ? cl01(tau / (pl.end + CUT)) : 0;
      if (f > 0) { ctx.fillStyle = P.brand; ctx.fillRect(x, BARC - 7, segW * f, 3); }
    });
    // grain on tape: STATIC and whisper-quiet (operator 2026-07-26: moving noise + video encoding
    // reads like an old TV — a static texture compresses clean and matches the app's subtle look)
    ctx.globalAlpha = 0.016;
    ctx.fillStyle = grainPat; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.5)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    bar.style.width = `${Math.min(100, (t / (total + 0.4)) * 100)}%`;
    msg.textContent = `compiling… ${Math.min(99, Math.round((t / (total + 0.4)) * 100))}% · ~${fmtT(total + 0.4 - t)} left · keep this tab visible`;
    if (t >= total + 0.4) { try { mr.stop(); } catch { /* already stopped */ } return; }
    raf = requestAnimationFrame(draw);
  };
  mr.start(500);
  raf = requestAnimationFrame(draw);
  activeCompile = { cancel: () => { cancelled = true; cancelAnimationFrame(raf); try { mr.stop(); } catch { /* */ } } };
}

// ── DECK EXPORTS (operator 2026-07-26: "download in md, html slides, or pdf") — the same deck the
// film plays, pressed into documents: markdown notes, a standalone HTML slide deck (arrow keys, one
// slide per screen, self-contained), and a print window whose page breaks make the PDF.
function widgetMd(w: any): string[] {
  const p = w?.payload ?? {};
  const t = w?.title ? [`**${String(w.title)}**`, ""] : [];
  if (w.type === "flow") return [...t, "`" + (p.steps ?? []).join("  →  ") + "`"];
  if (w.type === "layers") return [...t, ...(p.layers ?? []).map((l: string) => `- ${l}`)];
  if (w.type === "balance") return [...t, `- ${p.left?.label ?? ""}: ${(p.left?.items ?? []).join(" · ")}`, `- ${p.right?.label ?? ""}: ${(p.right?.items ?? []).join(" · ")}`, ...(p.verdict ? [`- ⚖ ${p.verdict}`] : [])];
  if (w.type === "timeline") return [...t, "`" + (p.events ?? []).map((e: any) => (typeof e === "string" ? e : e.label)).join("  →  ") + "`"];
  if (w.type === "graph-focus") return [...t, ...(p.files ?? []).map((f: string) => `- ${f}`), ...(p.note ? [`- _${p.note}_`] : [])];
  if (w.type === "repair-order") return [...t, ...(p.steps ?? []).map((st: string, i: number) => `${i + 1}. ${st}`)];
  if (w.type === "root-cause-tree") return [...t, `WHY — ${p.root ?? ""}`, ...(p.branches ?? []).map((b: string) => `- ↳ ${b}`)];
  if (w.type === "axes") return [...t, ...(p.axes ?? []).map((a: any) => `- ${a.ax}: **${a.s}**`)];
  if (w.type === "code-exhibit") return [...t, "```", ...(p.lines ?? []).map((r: any) => `${String(r.ln).padStart(4)}  ${r.text}`), "```", `⚖ ${p.label ?? ""}${p.note ? ` — ${p.note}` : ""}`];
  if (w.type === "before-after") return [...t, "```diff", ...String(p.bad ?? "").split("\n").map((l: string) => `- ${l}`), ...String(p.good ?? "").split("\n").map((l: string) => `+ ${l}`), "```"];
  return t;
}
export function deckToMd(deck: any): string {
  const L: string[] = [`# ${deck?.title ?? "video class"}`, "", `> Generated for free from antiloki. — No AI interpretation, raw data into intelligence.`, ""];
  (deck?.slides ?? []).forEach((sl: any, i: number) => {
    L.push(`## ${i + 1} · ${sl.topic ?? ""}`, "");
    if (sl.widget) { L.push(...widgetMd(sl.widget), ""); }
    (sl.bullets ?? []).forEach((b: string) => L.push(`- ${b}`));
    if ((sl.bullets ?? []).length) L.push("");
    if (sl.speech) L.push(String(sl.speech), "");
  });
  return L.join("\n");
}
const escH = (x: any) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
function widgetHtml(w: any, P: Pal): string {
  const p = w?.payload ?? {};
  const t = w?.title ? `<div class="wt">${escH(w.title)}</div>` : "";
  const chip = (x: string) => `<span class="chip">${escH(x)}</span>`;
  if (w.type === "flow") return `${t}<div class="flow">${(p.steps ?? []).map((x: string) => chip(x)).join('<span class="arr">→</span>')}</div>`;
  if (w.type === "layers") return `${t}<ul>${(p.layers ?? []).map((l: string) => `<li>${escH(l)}</li>`).join("")}</ul>`;
  if (w.type === "balance") return `${t}<div class="cols"><div><b>${escH(p.left?.label)}</b><ul>${(p.left?.items ?? []).map((x: string) => `<li>${escH(x)}</li>`).join("")}</ul></div><div><b>${escH(p.right?.label)}</b><ul>${(p.right?.items ?? []).map((x: string) => `<li>${escH(x)}</li>`).join("")}</ul></div></div>${p.verdict ? `<div class="dim">⚖ ${escH(p.verdict)}</div>` : ""}`;
  if (w.type === "timeline") return `${t}<div class="flow">${(p.events ?? []).map((e: any) => chip(typeof e === "string" ? e : e.label)).join('<span class="arr">→</span>')}</div>`;
  if (w.type === "graph-focus") return `${t}<div class="flow">${(p.files ?? []).map((f: string) => chip(f)).join(" ")}</div>${p.note ? `<div class="dim">${escH(p.note)}</div>` : ""}`;
  if (w.type === "repair-order") return `${t}<ol>${(p.steps ?? []).map((x: string) => `<li>${escH(x)}</li>`).join("")}</ol>`;
  if (w.type === "root-cause-tree") return `${t}<div class="code"><div style="color:${P.ok}">// WHY — ${escH(p.root)}</div>${(p.branches ?? []).map((b: string) => `<div>//  ↳ ${escH(b)}</div>`).join("")}</div>`;
  if (w.type === "axes") return `${t}${(p.axes ?? []).map((a: any) => `<div class="axis"><span>${escH(a.ax)}</span><div class="track"><div class="fill" style="width:${Math.min(100, Number(a.s) || 0)}%"></div></div><b>${escH(a.s)}</b></div>`).join("")}`;
  if (w.type === "code-exhibit") return `${t}<div class="code">${(p.lines ?? []).map((r: any) => `<div${r.ln === p.sick ? ' class="sick"' : ""}><span class="ln">${escH(r.ln)}</span>${escH(r.text)}</div>`).join("")}</div><div class="dim">⚖ ${escH(p.label)}${p.note ? ` — ${escH(p.note)}` : ""}</div>`;
  if (w.type === "before-after") return `${t}<div class="code">${String(p.bad ?? "").split("\n").map((l: string) => `<div class="minus">- ${escH(l)}</div>`).join("")}${String(p.good ?? "").split("\n").map((l: string) => `<div class="plus">+ ${escH(l)}</div>`).join("")}</div>`;
  return t;
}
export function deckToHtml(deck: any): string {
  const P = resolveTheme();
  const slides = (deck?.slides ?? []) as any[];
  const body = slides.map((sl, i) => `
  <section>
    <div class="n">${i + 1} / ${slides.length}</div>
    <h2>${escH(sl.topic)}</h2>
    ${sl.widget ? `<div class="w">${widgetHtml(sl.widget, P)}</div>` : ""}
    ${(sl.bullets ?? []).length ? `<ul class="b">${(sl.bullets as string[]).map((b) => `<li>${escH(b)}</li>`).join("")}</ul>` : ""}
    ${sl.speech ? `<p class="s">${escH(sl.speech)}</p>` : ""}
  </section>`).join("\n") + `
  <section class="fin"><h1>antiloki<span style="color:${P.brand}">.</span></h1><p>Generated for free from antiloki.</p><p class="dim"><i>No AI interpretation — raw data into intelligence.</i></p></section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escH(deck?.title ?? "video class")}</title><style>
  *{box-sizing:border-box} body{margin:0;background:#0a0a0c;color:${P.fg};font-family:ui-sans-serif,system-ui,sans-serif}
  section{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:7vh 8vw;scroll-snap-align:start;page-break-after:always;text-align:center;border-bottom:1px solid ${P.border}}
  html{scroll-snap-type:y mandatory}
  h2{font-size:2rem;margin:0 0 22px;max-width:900px} h1{font-size:3.4rem;margin:0 0 14px}
  .n{position:absolute;margin-top:-38vh;font:11px ui-monospace,monospace;color:${P.dim}}
  .w{max-width:860px;width:100%;font:13px ui-monospace,monospace;color:${P.muted};text-align:left}
  .wt{text-transform:uppercase;letter-spacing:1px;font-size:11px;color:${P.dim};margin-bottom:8px;text-align:center}
  .chip{display:inline-block;border:1.4px solid ${P.border};background:${P.panel2};border-radius:10px;padding:5px 12px;margin:3px;color:${P.fg}}
  .arr{margin:0 6px;color:${P.dim}} .cols{display:flex;gap:24px;justify-content:center} .cols>div{flex:1;max-width:340px;border:1.4px solid ${P.border};border-radius:12px;padding:10px 14px}
  ul,ol{text-align:left;line-height:1.9;margin:8px auto;max-width:640px} .b{color:${P.muted}}
  .s{max-width:720px;font-size:1.02rem;line-height:1.85;color:${P.muted};text-align:justify;border-left:2px solid ${P.border};padding-left:14px}
  .code{background:${P.panel};border:1px solid ${P.border};border-radius:10px;padding:10px 14px;text-align:left;white-space:pre;overflow-x:auto;line-height:1.8}
  .code .ln{display:inline-block;width:44px;color:${P.dim};text-align:right;margin-right:12px}
  .sick{background:rgba(217,106,95,.12)} .minus{color:${P.bad}} .plus{color:${P.ok}} .dim{color:${P.dim};font-size:.85rem;margin-top:8px}
  .axis{display:flex;align-items:center;gap:10px;margin:5px 0} .axis span{width:110px} .track{flex:1;height:8px;background:${P.border};border-radius:4px;overflow:hidden} .fill{height:100%;background:${P.brand}}
  .fin p{margin:4px 0;color:${P.muted}}
  @media print{ body{background:#fff;color:#111} section{border:none;min-height:auto;height:96vh} .chip{background:#f2f2ee;color:#111} .code{background:#f7f7f4;color:#111} .s,.b{color:#333} }
  </style></head><body>${body}
  <script>document.addEventListener("keydown",(e)=>{const h=innerHeight;if(e.key==="ArrowRight"||e.key==="PageDown")scrollBy({top:h,behavior:"smooth"});if(e.key==="ArrowLeft"||e.key==="PageUp")scrollBy({top:-h,behavior:"smooth"});});</script>
  </body></html>`;
}
export function downloadDeck(deck: any, kind: "md" | "html" | "pdf") {
  const name = String(deck?.title ?? "video-class").replace(/[^\w-]+/g, "_").slice(0, 70);
  if (kind === "md") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([deckToMd(deck)], { type: "text/markdown" }));
    a.download = `${name}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    return;
  }
  const html = deckToHtml(deck);
  if (kind === "html") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = `${name}-slides.html`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    return;
  }
  const w2 = window.open("", "_blank"); if (!w2) return;
  w2.document.write(html); w2.document.close(); w2.focus();
  setTimeout(() => { try { w2.print(); } catch { /* the tab stays open — print manually */ } }, 350);
}
