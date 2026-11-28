// FILE HISTORY REPLAY (operator 2026-07-24: "replay a file's history, cinematic, see the pieces
// replaced over time inside the file — a semicircle button I can drag"). Scrub a file's own git
// revisions with a draggable SEMICIRCLE DIAL; the code morphs to that revision and the lines that
// were replaced glow. git only — local, deterministic, no third party.
import React from "react";
import { C, mono } from "@/loki/theme";
import { Highlighted } from "./highlight";
import { fileHistory, type FileHistory } from "@/loki/api/codebase";

const baseName = (p: string) => String(p ?? "").split(/[/\\]/).filter(Boolean).pop() || String(p);

// lines in `cur` that are NEW/modified vs `prev` (0-based). Multiset heuristic — fast, precomputable,
// and good enough for the cinematic "what just appeared" glow (ignores pure line moves).
function diffNewLines(prev: string, cur: string): Set<number> {
  const p = new Map<string, number>();
  for (const l of prev.split("\n")) { const k = l.trim(); p.set(k, (p.get(k) ?? 0) + 1); }
  const out = new Set<number>();
  cur.split("\n").forEach((l, i) => { const k = l.trim(); const c = p.get(k); if (c && c > 0) p.set(k, c - 1); else if (k !== "") out.add(i); });
  return out;
}

// THE SEMICIRCLE DIAL — a draggable half-circle scrubber (oldest ⟶ newest along the arc).
// Sampled polylines instead of SVG arc flags, so the geometry is always correct.
export function ArcDial({ count, index, onChange, size = 132 }: { count: number; index: number; onChange: (i: number) => void; size?: number }) {
  const R = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2 + R * 0.42;
  const H = Math.round(cy + 12);
  const ref = React.useRef<SVGSVGElement | null>(null);
  const t = count > 1 ? index / (count - 1) : 0;
  const pt = (tt: number): [number, number] => { const th = Math.PI * (1 - tt); return [cx + R * Math.cos(th), cy - R * Math.sin(th)]; };
  const sample = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => pt(a + (b - a) * (i / n)).join(",")).join(" ");
  const track = sample(0, 1, 30);
  const prog = sample(0, t, Math.max(1, Math.round(t * 30)));
  const [kx, ky] = pt(t);
  const setFrom = (clientX: number, clientY: number) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const dx = clientX - r.left - cx, dy = cy - (clientY - r.top);
    let th = Math.atan2(dy, dx); if (th < 0) th = 0; if (th > Math.PI) th = Math.PI;
    onChange(Math.round((1 - th / Math.PI) * (count - 1)));
  };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setFrom(e.clientX, e.clientY);
    const mv = (ev: PointerEvent) => setFrom(ev.clientX, ev.clientY);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  return (
    <svg ref={ref} width={size} height={H} onPointerDown={onDown} style={{ touchAction: "none", cursor: "grab", display: "block" }}>
      {/* end caps = oldest / newest */}
      <circle cx={pt(0)[0]} cy={pt(0)[1]} r={2.5} fill={C.dim} />
      <circle cx={pt(1)[0]} cy={pt(1)[1]} r={2.5} fill={C.brand} />
      <polyline points={track} fill="none" stroke={C.border} strokeWidth={3.5} strokeLinecap="round" />
      <polyline points={prog} fill="none" stroke={C.brand} strokeWidth={3.5} strokeLinecap="round" />
      <circle cx={kx} cy={ky} r={16} fill="transparent" />{/* fat hit area */}
      <circle cx={kx} cy={ky} r={8} fill={C.brand} stroke={C.bg} strokeWidth={2.5} />
      <text x={pt(0)[0]} y={pt(0)[1] + 13} textAnchor="middle" fontFamily={mono} fontSize={7} fill={C.dim}>oldest</text>
      <text x={pt(1)[0]} y={pt(1)[1] + 13} textAnchor="middle" fontFamily={mono} fontSize={7} fill={C.dim}>now</text>
    </svg>
  );
}

export function FileHistoryReplay({ path, onClose }: { path: string; onClose: () => void }) {
  const [hist, setHist] = React.useState<FileHistory | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const timer = React.useRef<any>(null);
  const codeRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    void (async () => { setLoading(true); try { const r = await fileHistory({ path, limit: 50 }); setHist(r); if (r?.revisions?.length) setSel(r.revisions.length - 1); } finally { setLoading(false); } })();
  }, [path]);
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  React.useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const revs = hist?.revisions ?? [];
  const changed = React.useMemo(() => revs.map((r, i) => (i === 0 ? new Set<number>() : diffNewLines(revs[i - 1].content, r.content))), [hist]);

  const stop = () => { if (timer.current) clearInterval(timer.current); setPlaying(false); };
  const play = () => {
    if (timer.current) clearInterval(timer.current);
    if (revs.length < 2) return;
    setSel(0); setPlaying(true);
    let i = 0;
    timer.current = setInterval(() => { i += 1; if (i >= revs.length) { clearInterval(timer.current); setPlaying(false); setSel(revs.length - 1); return; } setSel(i); }, 950);
  };
  // cinematic: while playing, scroll to the first replaced block so you SEE the change land
  React.useEffect(() => {
    if (!playing) return;
    const set = changed[sel]; if (!set || !set.size || !codeRef.current) return;
    const first = Math.min(...set);
    const row = codeRef.current.querySelectorAll("div > div")[first] as HTMLElement | undefined;
    if (row) row.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [sel, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = revs[Math.min(sel, revs.length - 1)];

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 20, background: C.bg, display: "flex", flexDirection: "column" }}>
      {/* header — the commit at this point in time */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 9, color: C.brand, textTransform: "uppercase", letterSpacing: 1 }}>◷ replay</span>
        <code style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{baseName(path)}</code>
        {cur && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{cur.short} · {cur.author} · {cur.date} · {cur.subject}</span>}
        <button onClick={onClose} title="close replay (Esc)" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12 }}>✕</button>
      </div>

      {/* the code at this revision — replaced lines glow */}
      <div ref={codeRef} style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}>
        {loading && !hist ? (
          <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, padding: 16 }}>reading this file's history…</div>
        ) : !revs.length ? (
          <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, padding: 16, lineHeight: 1.7 }}>{hist?.error ?? "no git history for this file"} — the replay reads the file's own commits.</div>
        ) : (
          <div style={{ animation: playing ? "loki-fade-hist .5s ease" : undefined }} key={playing ? sel : "static"}>
            <style>{"@keyframes loki-fade-hist{from{opacity:.55}to{opacity:1}}"}</style>
            <Highlighted code={cur?.content ?? ""} fontSize={10.5} changedLines={changed[sel] ?? null} />
          </div>
        )}
      </div>

      {/* THE DIAL — the draggable semicircle scrubber, bottom-right, over the code */}
      {revs.length > 0 && (
        <div style={{ position: "absolute", right: 12, bottom: 12, zIndex: 22, background: `color-mix(in oklab, ${C.panel} 78%, transparent)`, backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: `1px solid ${C.border}`, borderRadius: 14, padding: "6px 10px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <ArcDial count={revs.length} index={sel} onChange={(i) => { stop(); setSel(i); }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: -6 }}>
            <button onClick={() => (playing ? stop() : play())} disabled={revs.length < 2} title={playing ? "pause" : "play the file's evolution"}
              style={{ background: "transparent", border: `1px solid ${C.border}`, color: playing ? C.ok : C.brand, cursor: revs.length < 2 ? "default" : "pointer", fontFamily: mono, fontSize: 11, borderRadius: 6, width: 26, height: 22 }}>{playing ? "❚❚" : "▶"}</button>
            <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, fontVariantNumeric: "tabular-nums", minWidth: 58, textAlign: "center" }}>rev {sel + 1}/{revs.length}{changed[sel]?.size ? ` · ${changed[sel].size} changed` : ""}</span>
          </div>
          <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim }}>drag the dial to travel</span>
        </div>
      )}
    </div>
  );
}
