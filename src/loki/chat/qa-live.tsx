// THE QA, LIVE AND CINEMATIC (operator 2026-09-30: "show in real time the QA happening ... something cinematic"). When the QA gate looks at a change you can SEE, deterministic
// tools drive a headless browser through the QA's own step plan; the serve streams what that browser shows (GET /api/v1/cockpit/goals/live). This is the viewer: a browser
// frame with the live picture, a cursor that glides to whatever the next step is about to touch with a ring around it, subtitles for each step, and - once the run is over -
// a replay of the kept film. It decides nothing and changes nothing about what the judge is given; it only shows it. Renders nothing for a run the QA never looked at.
import React from "react";
import { C, mono } from "@/loki/theme";
import { BE_URL, apiGet } from "@/loki/api/client";
import { useQaExpanded } from "./qa-focus";

export type LiveEv = { type: string; [k: string]: any };
export type StepInfo = { n: number; of: number; kind: string; text: string; rect: [number, number, number, number] | null; viewport: [number, number] };
export type Exchange = { n: number; method: string; path: string; status: number; ms: number; body: string; request_body?: string | null };
export type LiveState = {
  status: "connecting" | "live" | "over" | "none";
  frame: string | null;            // data URL of the newest live frame
  step: StepInfo | null;           // the step being (or last) played
  results: { n: number; ok: boolean; message: string }[];
  film: LiveEv[] | null;           // the kept film's timeline (replay)
  shots: string[];
  /** the BACKEND's film (operator 2026-09-30): every step played so far and every request/answer, for the terminal */
  steps: StepInfo[];
  exchanges: Exchange[];
};
export const initialLive: LiveState = { status: "connecting", frame: null, step: null, results: [], film: null, shots: [], steps: [], exchanges: [] };
const dataUrl = (jpeg: string) => `data:image/jpeg;base64,${jpeg}`;

/** one event -> the next state. Pure - tested. */
export function reduceLive(s: LiveState, e: LiveEv): LiveState {
  switch (e.type) {
    case "snapshot": {
      let next: LiveState = { ...initialLive, status: e.done ? "over" : "live", film: Array.isArray(e.film) ? e.film : null, frame: e.last_frame?.jpeg ? dataUrl(e.last_frame.jpeg) : s.frame };
      for (const t of (e.timeline ?? []) as LiveEv[]) next = reduceLive({ ...next, status: next.status }, t);
      return { ...next, status: e.done ? "over" : "live" };
    }
    case "frame": return { ...s, status: s.status === "over" ? "over" : "live", frame: dataUrl(e.jpeg) };
    case "step": { const st: StepInfo = { n: e.n, of: e.of, kind: e.kind, text: e.text, rect: e.rect ?? null, viewport: e.viewport ?? [1280, 800] }; return { ...s, status: "live", step: st, steps: [...s.steps.filter((x) => x.n !== st.n), st] }; }
    case "exchange": return { ...s, status: s.status === "over" ? "over" : "live", exchanges: [...s.exchanges.filter((x) => x.n !== e.n), { n: e.n, method: String(e.method), path: String(e.path), status: Number(e.status), ms: Number(e.ms ?? 0), body: String(e.body ?? ""), request_body: e.request_body ?? null }] };
    case "step-done": return { ...s, results: [...s.results.filter((r) => r.n !== e.n), { n: e.n, ok: !!e.ok, message: String(e.message ?? "") }] };
    case "shot": return { ...s, shots: [...s.shots, String(e.name)] };
    case "done": return { ...s, status: "over" };
    default: return s;
  }
}

/** where the cursor and the ring go, as percentages of the viewport - pure, tested. `null` when the step has no target on screen. */
export function targetBox(step: StepInfo | null): { cx: number; cy: number; x: number; y: number; w: number; h: number } | null {
  if (!step?.rect) return null;
  const [rx, ry, rw, rh] = step.rect, [vw, vh] = step.viewport;
  if (!(vw > 0 && vh > 0 && rw >= 0 && rh >= 0)) return null;
  const p = (v: number, of: number) => Math.max(0, Math.min(100, (100 * v) / of));
  return { cx: p(rx + rw / 2, vw), cy: p(ry + rh / 2, vh), x: p(rx, vw), y: p(ry, vh), w: p(rw, vw), h: p(rh, vh) };
}

/** the film's timeline -> what to show at time `t` ms: the newest film frame at or before it, and the step being played. Pure - tested. */
export function stateAt(film: LiveEv[], t: number): { file: string | null; step: StepInfo | null; ok: boolean | null; total: number } {
  let file: string | null = null, step: StepInfo | null = null, ok: boolean | null = null;
  for (const e of film) {
    if ((e.t ?? 0) > t) break;
    if (e.type === "film") file = e.file;
    else if (e.type === "step") { step = { n: e.n, of: e.of, kind: e.kind, text: e.text, rect: e.rect ?? null, viewport: e.viewport ?? [1280, 800] }; ok = null; }
    else if (e.type === "step-done" && step && e.n === step.n) ok = !!e.ok;
  }
  return { file, step, ok, total: film.length ? Math.max(...film.map((e) => e.t ?? 0)) : 0 };
}

/** THE TERMINAL (the backend's film): one line per step with its outcome, and under a request the answer it got. Pure - tested. */
export type TermLine = { n: number; kind: string; text: string; ok: boolean | null; exchange: Exchange | null };
export function terminalLines(steps: StepInfo[], results: { n: number; ok: boolean }[], exchanges: Exchange[]): TermLine[] {
  return [...steps].sort((a, b) => a.n - b.n).map((st) => ({ n: st.n, kind: st.kind, text: st.text, ok: results.find((r) => r.n === st.n)?.ok ?? null, exchange: exchanges.find((x) => x.n === st.n) ?? null }));
}
/** the film up to `t` ms as steps, outcomes and exchanges - so a replay of a server test rebuilds the terminal. Pure - tested. */
export function eventsUpTo(film: LiveEv[], t: number): { steps: StepInfo[]; results: { n: number; ok: boolean }[]; exchanges: Exchange[] } {
  let st: LiveState = initialLive;
  for (const e of film) { if ((e.t ?? 0) > t) break; if (e.type === "step" || e.type === "exchange") st = reduceLive(st, e); else if (e.type === "step-done") st = reduceLive(st, e); }
  return { steps: st.steps, results: st.results, exchanges: st.exchanges };
}
export const isServerFilm = (steps: StepInfo[], exchanges: Exchange[]): boolean => exchanges.length > 0 || steps.some((x) => x.kind === "request");

const frameUrl = (run: number, file: string) => `${BE_URL}/api/v1/cockpit/goals/evidence?id=${run}&film=${encodeURIComponent(file)}`;

/** may the viewer keep asking? The QA starts AFTER the run's work (the story appears at the start of the run), so "nothing yet" is normal while the run is moving and for a short while after it. */
export const RETRY_MS = 3000, GRACE_MS = 90_000, RETRY_MAX_MS = 30_000;
/** the wait before the next ask after `fails` answers of "nothing yet": 3 s, 6 s, 12 s, 24 s, then 30 s - a run that is slow to start its QA must not be asked every 3 s for as long as it moves (each ask is a 404 in the console and a connection against the browser's cap). Pure - tested. */
export const retryDelay = (fails: number): number => Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** Math.max(0, Math.min(fails, 10)));
export const runIsMoving = (status?: string): boolean => !!status && !["done", "failed", "cancelled", "inline"].includes(status);

/** the wrapper: decides whether this run's QA is OPEN (the newest one, or one the operator clicked) or a one-line bar, and opens no stream for a bar. */
export function QaLive(props: { run: number; status?: string }) {
  // KEYED BY THE RUN (audit 2026-10-01): `has`, the retry state, the replay clock and `hidden` belonged to the run that was on screen and survived a new `run` prop
  return <QaLiveFor key={props.run} {...props} />;
}
function QaLiveFor({ run, status }: { run: number; status?: string }) {
  const [has, setHas] = React.useState(false);                    // this run is known to have a QA film
  const { expanded, toggle } = useQaExpanded(run, has);
  const moving = runIsMoving(status);
  // a run that JUST settled may still be about to start its QA (it follows the work): the box gets the grace period to find it, as before
  // (only a run this component WATCHED settle gets it - an old run loaded from history must not open a stream)
  const [recent, setRecent] = React.useState(false);
  const wasMoving = React.useRef(moving);
  React.useEffect(() => { if (moving) { wasMoving.current = true; setRecent(false); return; } if (!wasMoving.current) return; setRecent(true); const h = setTimeout(() => setRecent(false), GRACE_MS); return () => clearTimeout(h); }, [moving]);
  // one cheap question per settled run: was a QA film kept? (no stream, no frames)
  const [pictures, setPictures] = React.useState(0);
  React.useEffect(() => {
    if (moving) return; let live = true;
    void Promise.resolve().then(() => apiGet<any>(`/api/v1/cockpit/goals/evidence?id=${run}`)).then((r: any) => { const d = r?.result?.result ?? r?.result ?? r; if (live && (d?.film || d?.live || (d?.images ?? []).length > 0)) { setHas(true); setPictures((d?.images ?? []).filter((i: any) => i.side === "after").length); } }).catch(() => {});
    return () => { live = false; };
  }, [run, moving]);
  if (expanded && (moving || recent || has)) return <QaLiveBox run={run} status={status} onShown={() => setHas(true)} onCollapse={has && !moving ? toggle : undefined} />;
  if (!has || moving) return moving || recent ? <QaLiveBox run={run} status={status} onShown={() => setHas(true)} /> : null;
  return (
    <button data-testid="qa-live-collapsed" onClick={toggle} title="open this run's QA"
      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", maxWidth: 720, textAlign: "left", cursor: "pointer", background: "#050505", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", fontFamily: mono, fontSize: 10, color: C.muted }}>
      <span>🎬</span><span>the QA looked at run #{run}</span>{pictures > 0 && <span style={{ color: C.dim }}>· {pictures} picture{pictures === 1 ? "" : "s"}</span>}
      <span style={{ flex: 1 }} /><span style={{ color: C.brand }}>▸ open</span>
    </button>
  );
}

export function QaLiveBox({ run, status, onShown, onCollapse }: { run: number; status?: string; onShown?: () => void; onCollapse?: () => void }) {
  const [s, setS] = React.useState<LiveState>(initialLive);
  const [retry, setRetry] = React.useState(0);
  const settledAt = React.useRef<number | null>(null);
  if (!runIsMoving(status) && settledAt.current == null) settledAt.current = Date.now();
  if (runIsMoving(status)) settledAt.current = null;
  const [hidden, setHidden] = React.useState(false);
  const [replayAt, setReplayAt] = React.useState<number | null>(null);   // ms into the film while replaying; null = not replaying
  const [speed, setSpeed] = React.useState(1);
  const fails = React.useRef(0);                                  // consecutive "nothing yet" answers: the back-off
  const now = React.useRef(s); now.current = s;                   // what the stream handlers may read without a state updater

  React.useEffect(() => {
    if (typeof EventSource === "undefined") { setS((x) => ({ ...x, status: "none" })); return; }
    const es = new EventSource(`${BE_URL}/api/v1/cockpit/goals/live?id=${run}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    // may the viewer keep asking? while the run moves, and for a grace period after it settled (the QA follows the work)
    const mayAsk = () => settledAt.current == null || Date.now() - settledAt.current < GRACE_MS;
    const giveUp = () => setS((x) => (x.status === "connecting" ? { ...x, status: "none" } : x));
    es.onmessage = (m) => {
      try {
        const ev = JSON.parse(m.data) as LiveEv;
        fails.current = 0;
        setS((x) => reduceLive(x, ev));
        if (ev.type === "done" || (ev.type === "snapshot" && ev.done)) es.close();   // the serve ends the stream after done; a browser would otherwise reconnect
        // the film (for the replay) only comes in a snapshot: after the live "done", ask once more
        if (ev.type === "done") timer = setTimeout(() => setRetry((r) => r + 1), 400);
      } catch { /* a comment / keep-alive */ }
    };
    es.onerror = () => {
      es.close();
      // THE DECISION IS MADE HERE, NOT INSIDE A STATE UPDATER (audit 2026-10-01): the old one set a timer and read Date.now() inside `setS(fn)`, which React may run twice (StrictMode), losing the first timer
      // and leaving it armed after the unmount. "nothing yet" (404) is not "nothing": ask again, with a growing wait, while the run is moving and for a grace period after it settled.
      const st = now.current.status;
      if (st === "live") { setS((x) => (x.status === "live" ? { ...x, status: "over" } : x)); return; }
      if (st !== "connecting") return;
      if (!mayAsk()) { giveUp(); return; }
      timer = setTimeout(() => { if (mayAsk()) setRetry((r) => r + 1); else giveUp(); }, retryDelay(fails.current++));
    };
    return () => { es.close(); if (timer) clearTimeout(timer); };
  }, [run, retry]);

  // the replay clock
  React.useEffect(() => {
    if (replayAt == null || !s.film) return;
    const end = stateAt(s.film, Number.MAX_SAFE_INTEGER).total;
    if (replayAt >= end) { const t = setTimeout(() => setReplayAt(null), 700); return () => clearTimeout(t); }
    const t = setTimeout(() => setReplayAt((x) => (x == null ? x : Math.min(end, x + 100 * speed))), 100);
    return () => clearTimeout(t);
  }, [replayAt, speed, s.film]);

  const showing = !(hidden || s.status === "none" || s.status === "connecting");
  React.useEffect(() => { if (showing) onShown?.(); }, [showing]);          // eslint-disable-line react-hooks/exhaustive-deps
  if (hidden || s.status === "none" || s.status === "connecting") return null;
  const hasFilm = !!s.film && s.film.some((e) => e.type === "film" || e.type === "exchange");
  if (s.status === "over" && !hasFilm && !s.frame && s.steps.length === 0) return null;

  const replaying = replayAt != null && hasFilm;
  const at = replaying ? stateAt(s.film!, replayAt!) : null;
  const step = replaying ? at!.step : s.step;
  // at the very start of the film no frame has been taken yet: show the first one rather than jumping to the poster
  const firstFile = s.film?.find((e) => e.type === "film")?.file ?? null;
  const shown = replaying ? (at!.file ?? firstFile) : null;
  const src = shown ? frameUrl(run, shown) : s.frame;
  const box = targetBox(step);
  const result = replaying ? at!.ok : s.results.find((r) => r.n === step?.n)?.ok ?? null;
  const live = s.status === "live" && !replaying;
  // a SERVER test has no picture: its film is a terminal of requests, answers and checks
  const tv = replaying ? eventsUpTo(s.film!, replayAt!) : { steps: s.steps, results: s.results, exchanges: s.exchanges };
  const serverFilm = isServerFilm(tv.steps, tv.exchanges) || (!!s.film && isServerFilm(eventsUpTo(s.film, Number.MAX_SAFE_INTEGER).steps, []));
  const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 };

  return (
    <div data-testid="qa-live" data-status={replaying ? "replay" : s.status} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", borderRadius: 10, border: `1px solid ${live ? C.brand : C.border}`, background: "#050505" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: live ? C.brand : C.muted }}>{live ? "● the QA, live" : replaying ? "▶ replay" : "🎬 the QA looked at this"}</span>
        <span style={{ flex: 1 }} />
        {hasFilm && !live && <>
          <button data-testid="qa-live-replay" style={btn} onClick={() => setReplayAt(replaying ? null : 0)}>{replaying ? "■ stop" : "▶ replay"}</button>
          <button data-testid="qa-live-speed" style={btn} onClick={() => setSpeed((x) => (x >= 4 ? 1 : x * 2))}>{speed}×</button>
        </>}
        {onCollapse && !live && <button data-testid="qa-live-collapse" style={btn} onClick={onCollapse} title="collapse to one line">▾ collapse</button>}
        {!live && !onCollapse && <button style={btn} onClick={() => setHidden(true)} title="hide">✕</button>}
      </div>
      {serverFilm ? <Terminal lines={terminalLines(tv.steps, tv.results, tv.exchanges)} live={live} /> :
      <div style={{ position: "relative", width: "100%", maxWidth: 720, aspectRatio: "16 / 10", background: "#000", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
        {/* the browser's title bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 22, background: "#15151a", display: "flex", alignItems: "center", gap: 5, padding: "0 8px", zIndex: 3 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => <span key={c} style={{ width: 7, height: 7, borderRadius: 4, background: c }} />)}
          <span data-testid="qa-live-url" style={{ flex: 1, marginLeft: 8, fontFamily: mono, fontSize: 9, color: C.muted, background: "#0b0b0f", borderRadius: 4, padding: "1px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{step ? step.text : "headless browser · deterministic tools"}</span>
        </div>
        {src && <img data-testid="qa-live-frame" src={src} alt="what the QA's browser shows" style={{ position: "absolute", inset: "22px 0 0 0", width: "100%", height: "calc(100% - 22px)", objectFit: "contain", objectPosition: "top left" }} />}
        {/* the ring and the cursor, positioned over the picture (the picture starts under the 22px bar) */}
        <div style={{ position: "absolute", inset: "22px 0 0 0", zIndex: 2, pointerEvents: "none" }}>
          {box && <div data-testid="qa-live-ring" key={`ring-${step?.n}`} style={{ position: "absolute", left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`, border: `2px solid ${result === false ? C.bad : C.brand}`, borderRadius: 6, boxShadow: `0 0 0 4px ${result === false ? C.bad : C.brand}33`, transition: "all .6s cubic-bezier(.22,1,.36,1)" }} />}
          {box && <svg data-testid="qa-live-cursor" width="18" height="18" viewBox="0 0 24 24" style={{ position: "absolute", left: `${box.cx}%`, top: `${box.cy}%`, transform: "translate(-3px,-2px)", transition: "left .7s cubic-bezier(.22,1,.36,1), top .7s cubic-bezier(.22,1,.36,1)", filter: "drop-shadow(0 1px 2px #000c)" }}><path d="M3 2l7 19 3-8 8-3z" fill="#fff" stroke="#000" strokeWidth="1.4" strokeLinejoin="round" /></svg>}
        </div>
        {/* the subtitle, letterboxed */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 3, padding: "16px 12px 7px", background: "linear-gradient(to top, #000d, #0000)", display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{step ? `step ${step.n}/${step.of}` : "starting"}</span>
          <span data-testid="qa-live-caption" key={`cap-${step?.n}`} style={{ fontFamily: mono, fontSize: 12, color: result === false ? C.bad : "#fff", textShadow: "0 1px 3px #000" }}>{step ? step.text : "getting the app ready"}{result === false ? " - it did not work" : ""}</span>
        </div>
      </div>}
    </div>
  );
}

/** The terminal of a server test: what was asked, what came back, what was checked - the same film as the browser's, for a change that has no screen. */
function Terminal({ lines, live }: { lines: TermLine[]; live: boolean }) {
  const end = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => { end.current?.scrollIntoView?.({ block: "nearest" }); }, [lines.length]);
  const tone = (l: TermLine) => l.ok === false ? C.bad : l.ok === true ? C.ok : C.muted;
  return (
    <div data-testid="qa-live-terminal" style={{ width: "100%", maxWidth: 720, maxHeight: 300, overflowY: "auto", background: "#000", borderRadius: 8, border: `1px solid ${C.border}`, padding: "8px 10px", fontFamily: mono, fontSize: 11, lineHeight: 1.55 }}>
      {lines.length === 0 && <div style={{ color: C.dim }}>starting the server test…</div>}
      {lines.map((l) => (
        <div key={l.n} data-testid="qa-term-line" data-ok={String(l.ok)} style={{ marginBottom: 3 }}>
          <div style={{ color: tone(l) }}>
            <span style={{ color: C.dim }}>{String(l.n).padStart(2, " ")} </span>
            {l.kind === "expect" ? (l.ok === false ? "✗ " : l.ok === true ? "✓ " : "… ") : "› "}{l.text}
          </div>
          {l.exchange && (
            <div data-testid="qa-term-exchange" style={{ marginLeft: 22, color: C.muted }}>
              <span style={{ color: l.exchange.status >= 500 ? C.bad : l.exchange.status >= 400 ? C.warn : C.ok }}>← {l.exchange.status}</span>
              <span style={{ color: C.dim }}> · {l.exchange.ms} ms</span>
              <div style={{ color: "#9aa", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{l.exchange.body}</div>
            </div>
          )}
        </div>
      ))}
      {live && <span style={{ color: C.brand }}>▍</span>}
      <div ref={end} />
    </div>
  );
}
