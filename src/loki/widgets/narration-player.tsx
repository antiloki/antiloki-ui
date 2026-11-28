/**
 * THE GENERATION QUEUE — the bottom-right corner surface (operator 2026-07-27: "the corner
 * player should be a LIST of queued artefacts, all running at the same time in parallel, like
 * NotebookLM"). One translucent panel, one row per artifact — podcast, video cast, video class,
 * reads — each with its own live progress, all pressing CONCURRENTLY (every job runs its own
 * press loop; the CPU is the only shared resource). Playback stays gated on completeness; a
 * finished video-cast expands to the film from its row. Collapsed: a one-line census pill.
 *
 * Mounted ONCE at the app root; a thin view over narration-jobs.ts (the stateful singleton).
 */
import React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import {
  subscribeNarration, getNarrationJobs, beginPress, requestAutoplay, playBar, pausePlayback,
  seekBar, removeNarrationJob, getPlayback, segDuration, getCinemaHold, armAudio,
  jobRemainingTokens, jobComplete, getExpandSeq, consumeCastRequest, consumeClassRequest, requestClassWhenReady, type NarrJob,
} from "./narration-jobs";
import { VideoCastPlayer } from "./video-cast";

const CinematicPlayerLazy = React.lazy(() => import("../codebase/class-cinema").then((m) => ({ default: m.CinematicPlayer })));

const VOICES: Array<{ id: string; label: string }> = [
  { id: "af_heart", label: "Heart · US ♀ warm" },
  { id: "af_bella", label: "Bella · US ♀ bright" },
  { id: "af_nicole", label: "Nicole · US ♀ soft" },
  { id: "am_adam", label: "Adam · US ♂ deep" },
  { id: "am_michael", label: "Michael · US ♂ even" },
  { id: "bf_emma", label: "Emma · UK ♀ documentary" },
  { id: "bm_george", label: "George · UK ♂ professor" },
  { id: "bm_lewis", label: "Lewis · UK ♂ crisp" },
];
const KIND_ICON: Record<string, string> = { podcast: "⛶", "video-cast": "🎬", "video-class": "▶", "paper-read": "♪", "module-read": "♪", "chat-reply": "💬", narration: "♪" };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
const fmtTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.max(0, Math.round(n))));

// ⬇ MP3 — encoded CLIENT-side from the decoded buffers; $0, no BE round-trip.
async function downloadMp3(j: NarrJob) {
  const mod: any = await import("lamejs");
  const Mp3Encoder = mod?.Mp3Encoder ?? mod?.default?.Mp3Encoder;
  const enc = new Mp3Encoder(1, 24000, 96);
  const parts: Uint8Array[] = [];
  for (const seg of j.segs) {
    const buf = seg.buffer;
    if (!buf) continue;
    const f32 = buf.getChannelData(0);
    const i16 = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i += 1) i16[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767)));
    for (let off = 0; off < i16.length; off += 1152) {
      const chunk = enc.encodeBuffer(i16.subarray(off, Math.min(off + 1152, i16.length)));
      if (chunk.length) parts.push(new Uint8Array(chunk));
    }
  }
  const tail = enc.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  const blob = new Blob(parts as BlobPart[], { type: "audio/mpeg" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${j.title.replace(/[^\w\d\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "narration"}.mp3`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

let cssDone = false;
function ensureDockCss() {
  if (cssDone || typeof document === "undefined") return;
  cssDone = true;
  const s = document.createElement("style");
  s.id = "loki-narration-dock-css";
  s.textContent = "@keyframes loki-narr-pulse{0%,100%{opacity:1}50%{opacity:.5}}";
  document.head.appendChild(s);
}

export function GlobalNarrationDock() {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const [collapsed, setCollapsed] = React.useState(false);
  const expandSeen = React.useRef(0);
  React.useEffect(() => {
    ensureDockCss();
    return subscribeNarration(() => {
      if (getExpandSeq() !== expandSeen.current) { expandSeen.current = getExpandSeq(); setCollapsed(false); }
      const cr = consumeCastRequest();
      if (cr) setCast(cr);
      const kr = consumeClassRequest();
      if (kr) setKlass(kr);
      force();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [voicePick, setVoicePick] = React.useState("af_heart");
  // 🎬 the video mode — a FINISHED video-cast job expands from its queue row into the film
  const [cast, setCast] = React.useState<{ narrationId: number; sessionId: number; title: string } | null>(null);
  const [klass, setKlass] = React.useState<{ narrationId: number; deck: any; title: string } | null>(null);

  const jobs = getNarrationJobs();
  const play = getPlayback();

  // the readout clock — only while something plays
  React.useEffect(() => {
    if (!play?.playing || play.waiting) return;
    let raf = 0;
    const loop = () => { force(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [play?.playing, play?.waiting, play?.jobId]);

  if (jobs.length === 0 && !cast && !klass) return null;
  const dockHidden = getCinemaHold() && !cast && !klass; // a film owns the surface; our own films render below

  const pressingN = jobs.filter((j) => j.pressStarted && !jobComplete(j) && !j.error).length;
  const readyN = jobs.filter((j) => jobComplete(j)).length;

  // ── one row per artifact — its own progress, its own controls, all pressing concurrently
  const row = (j: NarrJob) => {
    const complete = jobComplete(j);
    const mine = play?.jobId === j.id && play.mode === "bar" ? play : null;
    const total = j.segs.reduce((n, s) => n + segDuration(s), 0);
    const readySegs = j.segs.filter((s) => s.status === "ready").length;
    const pct = j.segs.length ? Math.round((readySegs / j.segs.length) * 100) : 0;
    const icon = KIND_ICON[j.kind] ?? "♪";
    const stateLine = j.error ? j.error
      : j.phase === "picking" ? "pick a voice, then ▶ — presses in the background"
      : !complete ? `pressing §${Math.min(readySegs + 1, j.segs.length)}/${j.segs.length} · ${fmtTok(jobRemainingTokens(j))} tok left`
      : j.artifact ? `⬇ shelved · ${j.artifact.file}`
      : "rendered · shelving…";
    return (
      <div key={j.id} style={{ borderTop: `1px solid color-mix(in oklab, ${C.border} 55%, transparent)`, padding: "8px 2px 7px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 11, color: complete ? C.brand : C.muted, animation: !complete && j.pressStarted && !j.error ? "loki-narr-pulse 1.2s ease-in-out infinite" : undefined }}>{icon}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 9.5, color: C.fg, fontFamily: nav, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={j.title}>{j.title}</span>
          {/* the transport — gated on completeness (nothing plays before the WHOLE render) */}
          {j.phase === "picking" ? (
            <>
              <select value={voicePick} onChange={(e) => setVoicePick(e.target.value)}
                style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: mono, fontSize: 8, padding: "1px 3px", maxWidth: 106 }}>
                {VOICES.map((v) => <option key={v.id} value={v.id} style={{ background: C.panel }}>{v.label}</option>)}
              </select>
              <button onClick={() => { armAudio(); requestAutoplay(j.id); void beginPress(j.id, voicePick); }}
                title="press everything in the background — plays automatically when complete"
                style={{ width: 24, height: 24, borderRadius: "50%", border: `1px solid ${C.brand}`, background: `color-mix(in oklab, ${C.brand} 16%, transparent)`, color: C.brand, cursor: "pointer", fontSize: 10, fontFamily: mono, flexShrink: 0 }}>▶</button>
            </>
          ) : (
            <>
              <button
                onClick={() => { armAudio(); if (!complete) return; if (mine?.playing) pausePlayback(); else playBar(j.id); }}
                disabled={!complete}
                title={complete ? (mine?.playing ? "pause" : "play") : "rendering — playback unlocks when every section is pressed"}
                style={{ width: 24, height: 24, borderRadius: "50%", border: `1px solid ${complete ? C.brand : C.border}`, background: complete ? `color-mix(in oklab, ${C.brand} 16%, transparent)` : "transparent", color: complete ? C.brand : C.dim, cursor: complete ? "pointer" : "default", fontSize: 10, fontFamily: mono, flexShrink: 0 }}>
                {!complete ? "⏳" : mine?.playing ? "⏸" : "▶"}
              </button>
              {j.kind === "video-class" && (
                <button onClick={() => { if (complete && j.meta?.deck != null) { armAudio(); requestClassWhenReady({ narrationId: j.id, deck: j.meta.deck, title: j.title }); } }}
                  disabled={!complete || j.meta?.deck == null}
                  title={j.meta?.deck == null ? "▶ film unavailable — this artifact predates deck shelving; regenerate once" : complete ? "▶ open the film" : "▶ when fully rendered"}
                  style={{ height: 24, borderRadius: 7, border: `1px solid ${complete && j.meta?.deck != null ? C.brand : C.border}`, background: "transparent", color: complete && j.meta?.deck != null ? C.brand : C.dim, cursor: complete && j.meta?.deck != null ? "pointer" : "default", fontSize: 10, fontFamily: mono, flexShrink: 0, padding: "0 7px" }}>▶🎞</button>
              )}
              {j.kind === "video-cast" && (
                <button onClick={() => { if (complete && j.meta?.sessionId != null) { armAudio(); setCast({ narrationId: j.id, sessionId: j.meta.sessionId, title: j.title }); } }}
                  disabled={!complete || j.meta?.sessionId == null}
                  title={complete ? "🎬 expand to the video mode" : "🎬 when fully rendered"}
                  style={{ height: 24, borderRadius: 7, border: `1px solid ${complete ? C.brand : C.border}`, background: "transparent", color: complete ? C.brand : C.dim, cursor: complete ? "pointer" : "default", fontSize: 10, fontFamily: mono, flexShrink: 0, padding: "0 7px" }}>🎬</button>
              )}
              {complete && (
                <button onClick={() => void downloadMp3(j)} title="⬇ download MP3 (encoded right here, $0)"
                  style={{ height: 24, borderRadius: 7, border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 11, fontFamily: mono, flexShrink: 0, padding: "0 3px" }}>⬇</button>
              )}
            </>
          )}
          <button onClick={() => removeNarrationJob(j.id)} title="dismiss from the queue (the shelf copy stays)"
            style={{ height: 24, borderRadius: 7, border: "none", background: "transparent", color: C.dim, cursor: "pointer", fontSize: 10.5, fontFamily: mono, flexShrink: 0, padding: "0 3px" }}>✕</button>
        </div>
        {/* per-artifact progress — every running job shows its own bar, simultaneously */}
        {j.segs.length > 0 && !complete && !j.error && j.phase !== "picking" && (
          <div style={{ height: 4, borderRadius: 3, overflow: "hidden", background: `color-mix(in oklab, ${C.border} 40%, transparent)` }}>
            <div style={{ width: `${pct}%`, height: "100%", background: C.warn, transition: "width .5s ease" }} />
          </div>
        )}
        {/* the seek strip appears only on the artifact that is PLAYING */}
        {mine && complete && (
          <div onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); seekBar(j.id, ((e.clientX - r.left) / r.width) * total); }}
            title="seek" style={{ display: "flex", gap: 2, height: 8, alignItems: "center", cursor: "pointer" }}>
            {j.segs.map((s) => {
              const w = total > 0 ? (segDuration(s) / total) * 100 : 100 / Math.max(1, j.segs.length);
              const segStart = j.segs.slice(0, s.ord).reduce((n, x) => n + segDuration(x), 0);
              const fill = Math.min(100, Math.max(0, (((mine.seconds ?? 0) - segStart) / segDuration(s)) * 100));
              return (
                <div key={s.ord} style={{ width: `${w}%`, height: 4, borderRadius: 2, overflow: "hidden", background: `color-mix(in oklab, ${C.border} 60%, transparent)` }}>
                  <div style={{ width: `${fill}%`, height: "100%", background: C.brand }} />
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <span style={{ flex: 1, fontSize: 8, color: j.error ? C.bad : complete ? C.ok : C.dim, fontFamily: mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }} title={stateLine}>{stateLine}</span>
          {mine && <span style={{ fontSize: 8, color: C.muted, fontFamily: mono, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmt(mine.seconds ?? 0)} / {fmt(total)}</span>}
        </div>
      </div>
    );
  };

  return createPortal(
    <>
      {cast && (
        <VideoCastPlayer narrationId={cast.narrationId} sessionId={cast.sessionId} title={cast.title} onClose={() => setCast(null)} />
      )}
      {klass && (
        <React.Suspense fallback={null}>
          <CinematicPlayerLazy deck={klass.deck} narrationId={klass.narrationId} onClose={() => setKlass(null)} />
        </React.Suspense>
      )}
      {!dockHidden && jobs.length > 0 && (
        <div data-narration-dock style={{ position: "fixed", right: 14, bottom: 14, zIndex: 2600 }}>
          {collapsed ? (
            <button onClick={() => setCollapsed(false)}
              title="open the generation queue"
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 999, background: `color-mix(in oklab, ${C.panel} 70%, transparent)`, backdropFilter: "blur(14px) saturate(1.2)", WebkitBackdropFilter: "blur(14px) saturate(1.2)", border: `1px solid ${C.border}`, cursor: "pointer", fontFamily: mono, boxShadow: "0 8px 26px rgba(0,0,0,.4)" }}>
              <span style={{ fontSize: 10, color: pressingN ? C.warn : C.brand, animation: pressingN ? "loki-narr-pulse 1.2s ease-in-out infinite" : undefined }}>{pressingN ? "⏳" : "♪"}</span>
              <span style={{ fontSize: 8.5, color: C.muted, fontVariantNumeric: "tabular-nums" }}>
                {pressingN ? `${pressingN} pressing` : ""}{pressingN && readyN ? " · " : ""}{readyN ? `${readyN} ready` : ""}{!pressingN && !readyN ? `${jobs.length} queued` : ""}
              </span>
            </button>
          ) : (
            <div style={{
              width: "min(400px, calc(100vw - 28px))", maxHeight: "min(430px, 60vh)", overflowY: "auto",
              borderRadius: 15, padding: "9px 13px 6px",
              background: `color-mix(in oklab, ${C.panel} 64%, transparent)`,
              backdropFilter: "blur(18px) saturate(1.25)", WebkitBackdropFilter: "blur(18px) saturate(1.25)",
              border: `1px solid color-mix(in oklab, ${C.border} 78%, ${C.brand})`,
              boxShadow: "0 16px 44px rgba(0,0,0,.45)", fontFamily: mono,
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, paddingBottom: 5 }}>
                <span style={{ fontSize: 8.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.dim }}>⛶ generation queue</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 8, color: C.dim, fontVariantNumeric: "tabular-nums" }}>{pressingN ? `${pressingN} pressing in parallel · ` : ""}{readyN}/{jobs.length} ready</span>
                <button onClick={() => setCollapsed(true)} title="collapse — everything keeps pressing"
                  style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 11, padding: 0 }}>▁</button>
              </div>
              {jobs.map(row)}
              <div style={{ fontSize: 7.5, color: C.dim, padding: "6px 2px 4px" }}>
                all artifacts press concurrently · playback unlocks per artifact when its render completes · finished pieces land in sources/artefacts
              </div>
            </div>
          )}
        </div>
      )}
    </>,
    document.body,
  );
}
