// ARCHITECTURE OVER TIME (operator 2026-07-24 — the Grafana/OTel ideas, stolen LOCALLY): the whole
// time-travel cluster on ONE right-rail panel, built from the append-only digest snapshots we already
// keep (one row per rebuild) + git. NO runtime telemetry, no third party — every metric is structural
// and deterministic. Delivers:
//   #6 health history · #5 timeline · #7 structural incidents · #2 structural diff (per step) ·
//   #1 time-travel (scrub the slider → the readout morphs to that rebuild) · #9 replay (▶ walk it) ·
//   #15 causal debugger (why is health N — the structural drivers + what introduced them).
import React from "react";
import { C, mono } from "@/loki/theme";
import { historyGet, type CodeHistory, type HistoryPoint } from "@/loki/api/codebase";
import { SubstratePanel } from "./substrate-panel";

// the ◷ history rail panel: two tabs — architecture over time, and the substrate observing itself.
export function HistoryTabs({ onOpen }: { onOpen?: (path: string) => void }) {
  const [tab, setTab] = React.useState<"arch" | "substrate">("arch");
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 14, padding: "6px 12px 0", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {([["arch", "◷ architecture"], ["substrate", "◉ substrate"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ background: "transparent", border: "none", borderBottom: `1px solid ${tab === k ? C.brand : "transparent"}`, marginBottom: -1, color: tab === k ? C.brand : C.dim, padding: "2px 1px 5px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>{l}</button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {tab === "substrate" ? <SubstratePanel /> : <HistoryPanel onOpen={onOpen} />}
      </div>
    </div>
  );
}

const sevTone = (s: string) => (s === "high" ? C.bad : s === "medium" ? C.warn : s === "improved" ? C.ok : C.dim);
const hTone = (v: number | null | undefined) => (v == null ? C.dim : v >= 75 ? C.ok : v >= 50 ? C.warn : C.bad);
const shortDate = (at?: string) => (at ? String(at).slice(0, 10) : "");
const deltaEl = (d: number | null | undefined, unit = "", goodUp = true) => {
  if (d == null || d === 0) return <span style={{ color: C.dim }}>·</span>;
  const good = goodUp ? d > 0 : d < 0;
  return <span style={{ color: good ? C.ok : C.bad, fontFamily: mono }}>{d > 0 ? "▲ +" : "▼ "}{d}{unit}</span>;
};

function Spark({ pts, tone, sel }: { pts: (number | null)[]; tone: string; sel: number }) {
  const vals = pts.map((v) => (v == null ? 0 : v));
  if (vals.length < 2) return null;
  const w = 240, h = 40, lo = Math.min(...vals), hi = Math.max(...vals), sp = Math.max(1, hi - lo);
  const X = (i: number) => (i / (vals.length - 1)) * (w - 2) + 1;
  const Y = (v: number) => h - 3 - ((v - lo) / sp) * (h - 6);
  const xy = vals.map((v, i) => `${X(i)},${Y(v)}`);
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={xy.join(" ")} fill="none" stroke={tone} strokeWidth={1.4} opacity={0.9} />
      {/* the time-travel cursor */}
      <line x1={X(sel)} y1={0} x2={X(sel)} y2={h} stroke={C.brand} strokeWidth={1} opacity={0.5} />
      <circle cx={X(sel)} cy={Y(vals[sel])} r={3} fill={C.brand} />
    </svg>
  );
}

// #15 — the structural drivers behind a rebuild's health, as a causal chain (honest: from the
// stored digest facts; the incident supplies what INTRODUCED the change).
function whyChain(p: HistoryPoint): { label: string; tone: string }[] {
  const out: { label: string; tone: string }[] = [];
  if ((p.cycles ?? 0) > 0) out.push({ label: `${p.cycles} import cycle${p.cycles === 1 ? "" : "s"} — no clean build order`, tone: C.bad });
  if (p.coverage != null && p.coverage < 60) out.push({ label: `coverage ${Math.round(p.coverage)}% — untested paths carry risk`, tone: C.warn });
  if ((p.smells ?? 0) > 0) out.push({ label: `${p.smells} structural smell${p.smells === 1 ? "" : "s"} (god-files, dead exports, islands)`, tone: C.warn });
  if ((p.fan_in ?? 0) >= 3) out.push({ label: `avg fan-in ${p.fan_in} — heavily-shared modules ripple widely`, tone: C.dim });
  return out;
}

export function HistoryPanel({ onOpen }: { onOpen?: (path: string) => void }) {
  const [h, setH] = React.useState<CodeHistory | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState(0);          // #1 time-travel cursor (index into points)
  const [playing, setPlaying] = React.useState(false);
  const timer = React.useRef<any>(null);

  React.useEffect(() => {
    void (async () => { setLoading(true); try { const r = await historyGet({ limit: 60 }); setH(r); if (r?.points?.length) setSel(r.points.length - 1); } finally { setLoading(false); } })();
  }, []);
  React.useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const points = h?.points ?? [];
  const stopPlay = () => { if (timer.current) clearInterval(timer.current); setPlaying(false); };
  const replay = () => { // #9 — walk the timeline
    if (timer.current) clearInterval(timer.current);
    if (points.length < 2) return;
    setSel(0); setPlaying(true);
    let i = 0;
    timer.current = setInterval(() => { i += 1; if (i >= points.length) { clearInterval(timer.current); setPlaying(false); setSel(points.length - 1); return; } setSel(i); }, 700);
  };

  if (loading && !h) return <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, padding: 16 }}>reading the architecture timeline…</div>;
  if (!h || points.length < 1) return (
    <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, padding: 16, lineHeight: 1.7 }}>
      no history yet — the timeline is built from the digest snapshot taken on each rebuild.<br />
      <span style={{ color: C.dim }}>Rebuild (↻) a couple of times and the health trend, deltas, structural incidents and time-travel appear here — local, deterministic, no telemetry.</span>
    </div>
  );

  const cur = points[Math.min(sel, points.length - 1)];
  const atLatest = sel === points.length - 1;
  const inc = h.incident;
  const why = whyChain(cur);

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "8px 12px", boxSizing: "border-box" }}>
      <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>architecture over time</div>
      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginBottom: 8 }}>health · cycles · coverage across your rebuilds — structural, deterministic, $0 · no telemetry</div>

      {/* headline morphs to the SELECTED rebuild (#1 time-travel) */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{ fontFamily: mono, fontSize: 30, fontWeight: 700, color: hTone(cur.health) }}>{cur.health ?? "—"}</span>
            <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{atLatest ? "health now" : `health · ${shortDate(cur.at)}`}</span>
          </div>
          <div style={{ fontFamily: mono, fontSize: 9.5, marginTop: 3, display: "flex", flexDirection: "column", gap: 1 }}>
            {atLatest ? (<>
              {h.trend.month && <span>{deltaEl(h.trend.month.delta)} <span style={{ color: C.dim }}>this month</span></span>}
              {h.trend.quarter && <span>{deltaEl(h.trend.quarter.delta)} <span style={{ color: C.dim }}>this quarter</span></span>}
              {!h.trend.month && !h.trend.quarter && <span style={{ color: C.dim }}>{h.count} rebuild{h.count === 1 ? "" : "s"} recorded</span>}
            </>) : (
              <span>{deltaEl(cur.d_health)} <span style={{ color: C.dim }}>vs the rebuild before · {points.length - 1 - sel} back from now</span></span>
            )}
          </div>
        </div>
        <div style={{ marginTop: 2 }}>
          <Spark pts={points.map((p) => p.health)} tone={hTone(cur.health)} sel={sel} />
        </div>
      </div>

      {/* #1 the time-travel slider + #9 replay */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button onClick={() => (playing ? stopPlay() : replay())} disabled={points.length < 2}
          style={{ fontFamily: mono, fontSize: 9.5, background: "transparent", border: `1px solid ${C.border}`, color: playing ? C.ok : C.muted, borderRadius: 5, padding: "1px 8px", cursor: points.length < 2 ? "default" : "pointer" }}>{playing ? "◼ stop" : "▶ replay"}</button>
        <input type="range" min={0} max={points.length - 1} value={sel} onChange={(e) => { stopPlay(); setSel(Number(e.target.value)); }}
          style={{ flex: 1, accentColor: C.brand as any, cursor: "pointer" }} />
        <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, minWidth: 66, textAlign: "right" }}>{shortDate(cur.at)}</span>
      </div>

      {/* the selected rebuild's structural facts (morph with the slider) + #2 per-step diff */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[
          { k: "cycles", v: cur.cycles, d: cur.d_cycles, goodUp: false, suf: "" },
          { k: "coverage", v: cur.coverage == null ? null : Math.round(cur.coverage), d: cur.d_coverage, goodUp: true, suf: "%" },
          { k: "smells", v: cur.smells, d: null as any, goodUp: false, suf: "" },
          { k: "files", v: cur.files, d: null as any, goodUp: true, suf: "" },
        ].map((m) => (
          <div key={m.k} style={{ border: `1px solid ${C.border}`, borderRadius: 6, background: C.panel2, padding: "3px 8px", minWidth: 62 }}>
            <div style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, textTransform: "uppercase", letterSpacing: 0.4 }}>{m.k}</div>
            <div style={{ fontFamily: mono, fontSize: 12, color: C.fg }}>{m.v ?? "—"}{m.v != null ? m.suf : ""} {m.d ? <span style={{ fontSize: 8 }}>{deltaEl(m.d, "", m.goodUp)}</span> : null}</div>
          </div>
        ))}
      </div>

      {/* #15 causal debugger — why is THIS rebuild's health where it is */}
      {why.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>why health is {cur.health ?? "—"} — the structural drivers</div>
          {why.map((w2, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "baseline", fontFamily: mono, fontSize: 9.5, padding: "1px 0" }}>
              <span style={{ color: w2.tone }}>{i === 0 ? "↳" : "·"}</span><span style={{ color: C.dim }}>{w2.label}</span>
            </div>
          ))}
          {atLatest && inc && inc.severity !== "improved" && inc.severity !== "info" && <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginTop: 3 }}>↳ what moved it last: {inc.summary.replace(/^since the last rebuild: /, "")}</div>}
        </div>
      )}

      {/* #7 the latest STRUCTURAL INCIDENT (only meaningful at 'now') */}
      {atLatest && inc && (
        <div style={{ border: `1px solid color-mix(in oklab, ${sevTone(inc.severity)} 45%, ${C.border})`, borderRadius: 9, background: `color-mix(in oklab, ${sevTone(inc.severity)} 7%, ${C.panel2})`, padding: "8px 11px", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{ fontFamily: mono, fontSize: 8, color: sevTone(inc.severity), border: `1px solid ${sevTone(inc.severity)}`, borderRadius: 8, padding: "0 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {inc.severity === "improved" ? "✓ improvement" : inc.severity === "info" ? "no change" : `${inc.severity} — structural incident`}
            </span>
            <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>{shortDate(inc.from_at)} → {shortDate(inc.at)}</span>
          </div>
          <div style={{ fontFamily: mono, fontSize: 11, color: C.fg, lineHeight: 1.5 }}>{inc.summary}</div>
          {inc.new_risky.length > 0 && (
            <div style={{ marginTop: 5 }}>
              <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>entered the riskiest set</div>
              {inc.new_risky.map((p) => (
                <div key={p} onClick={() => onOpen?.(p)} title={`open ${p}`} style={{ fontFamily: mono, fontSize: 10, color: C.warn, cursor: "pointer", padding: "1px 0" }}>↗ {p}</div>
              ))}
            </div>
          )}
          <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, marginTop: 5 }}>the diff between your last two rebuilds — no runtime data, just the graph over time</div>
        </div>
      )}

      {/* the per-rebuild timeline — click a row to time-travel there */}
      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>timeline · click a rebuild to travel</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {points.map((p, i) => (i)).reverse().map((idx, k, arr) => {
          const p = points[idx]; const on = idx === sel; const first = k === 0;
          return (
            <div key={p.id} onClick={() => { stopPlay(); setSel(idx); }} style={{ display: "grid", gridTemplateColumns: "16px 1fr", columnGap: 8, cursor: "pointer", background: on ? `color-mix(in oklab, ${C.brand} 8%, transparent)` : "transparent", borderRadius: 5 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 2, flex: 1, minHeight: 4, background: first ? "transparent" : C.border }} />
                <div style={{ width: on ? 9 : 7, height: on ? 9 : 7, borderRadius: 9, background: on ? C.brand : C.dim, flexShrink: 0 }} />
                <div style={{ width: 2, flex: 1, minHeight: 4, background: k === arr.length - 1 ? "transparent" : C.border }} />
              </div>
              <div style={{ padding: "3px 4px 8px 0" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{shortDate(p.at)}</span>
                  <span style={{ fontFamily: mono, fontSize: 10.5, color: on ? C.fg : C.muted }}>health <b style={{ color: hTone(p.health) }}>{p.health ?? "—"}</b></span>
                  {deltaEl(p.d_health)}
                  {p.cycles != null && <span style={{ fontFamily: mono, fontSize: 9, color: p.cycles > 0 ? C.warn : C.dim }}>{p.cycles} cycle{p.cycles === 1 ? "" : "s"}{p.d_cycles ? <span style={{ color: p.d_cycles > 0 ? C.bad : C.ok }}> ({p.d_cycles > 0 ? "+" : ""}{p.d_cycles})</span> : null}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
