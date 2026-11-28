// HISTORY REVIEW (snapshot axis) — the file review scored ACROSS TIME. The repo health timeline, the
// most-improved / most-regressed files (each a sparkline of its score), and the per-axis drift. All
// deterministic: it reads judgments.review_scores (one review pass per rebuild) — no AI, no rebuild.
import React from "react";
import { C, mono } from "@/loki/theme";
import { reviewHistoryGet, type ReviewHistory, type ReviewMover } from "@/loki/api/codebase";

const tone = (h: number | null) => (h == null ? C.dim : h >= 80 ? C.ok : h >= 50 ? C.warn : C.bad);
const base = (p: string) => p.split("/").pop() || p;

function Spark({ series, w = 92, h = 22 }: { series: (number | null)[]; w?: number; h?: number }) {
  const pts = series.map((v, i) => ({ v, i })).filter((p) => p.v != null) as { v: number; i: number }[];
  if (pts.length < 2) return <svg width={w} height={h} />;
  const n = (series.length - 1) || 1;
  const x = (i: number) => (i / n) * (w - 2) + 1;
  const y = (v: number) => h - 2 - (Math.max(0, Math.min(100, v)) / 100) * (h - 4);
  const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={tone(last.v)} strokeWidth={1.3} />
      <circle cx={x(last.i)} cy={y(last.v)} r={1.7} fill={tone(last.v)} />
    </svg>
  );
}

function MoverRow({ m, onOpen }: { m: ReviewMover; onOpen?: (p: string) => void }) {
  const up = m.delta > 0;
  return (
    <div onClick={() => onOpen?.(m.path)} title={`${m.path} · ${m.from} → ${m.to} · click to open`}
      style={{ display: "grid", gridTemplateColumns: "1fr 92px 46px", gap: 8, alignItems: "center", padding: "2px 0", cursor: onOpen ? "pointer" : "default" }}>
      <code style={{ fontFamily: mono, fontSize: 10, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{base(m.path)}</code>
      <Spark series={m.series} />
      <span style={{ fontFamily: mono, fontSize: 10, color: up ? C.ok : C.bad, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{up ? "▲" : "▼"}{Math.abs(m.delta)}</span>
    </div>
  );
}

export function ReviewHistoryPanel({ onOpen }: { onOpen?: (path: string) => void }) {
  const [data, setData] = React.useState<ReviewHistory | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => { let a = true; void reviewHistoryGet({}).then((r) => { if (a) { setData(r); setLoading(false); } }); return () => { a = false; }; }, []);

  if (loading) return <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, padding: "10px 12px" }}>reading the review ledger…</div>;
  if (!data || data.snapshot_count === 0) return <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, padding: 12, lineHeight: 1.7 }}>No review snapshots yet.<br /><span style={{ color: C.dim }}>The file review is scored per rebuild — rebuild the codebase (↻) a couple of times and this timeline fills in.</span></div>;

  const tl = data.timeline;
  const first = tl[0], last = tl[tl.length - 1];
  const repoSeries = tl.map((s) => s.avg_health);
  const repoDelta = (last?.avg_health ?? 0) - (first?.avg_health ?? 0);

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "8px 12px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>history review</span>
        <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>{data.snapshot_count} snapshots · {data.file_count} files · deterministic, from the judgment ledger</span>
      </div>

      {data.insufficient ? (
        <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.7 }}>Only one review snapshot so far — two are needed to chart movement. Rebuild again and the trend appears.</div>
      ) : (
        <>
          {/* repo health timeline */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: C.panel2, borderRadius: 8, marginBottom: 12 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: tone(last.avg_health), fontVariantNumeric: "tabular-nums" }}>{last.avg_health}</span>
              <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6 }}>repo health now</span>
            </div>
            <span style={{ fontFamily: mono, fontSize: 11, color: repoDelta >= 0 ? C.ok : C.bad, fontVariantNumeric: "tabular-nums" }}>{repoDelta >= 0 ? "▲ +" : "▼ "}{repoDelta} over {tl.length} snapshots</span>
            <span style={{ flex: 1 }} />
            <Spark series={repoSeries} w={170} h={34} />
          </div>

          {/* movers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 9, color: C.ok, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>▲ most improved</div>
              {data.movers.improved.length ? data.movers.improved.map((m) => <MoverRow key={m.path} m={m} onOpen={onOpen} />) : <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>none climbed</span>}
            </div>
            <div>
              <div style={{ fontFamily: mono, fontSize: 9, color: C.bad, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>▼ most regressed</div>
              {data.movers.regressed.length ? data.movers.regressed.map((m) => <MoverRow key={m.path} m={m} onOpen={onOpen} />) : <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>none slipped</span>}
            </div>
          </div>

          {/* per-axis drift */}
          {data.axes_drift.length > 0 && (
            <>
              <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>axis drift — first → latest snapshot</div>
              <div>
                {data.axes_drift.map((d) => (
                  <div key={d.axis} style={{ display: "grid", gridTemplateColumns: "88px 1fr 74px", gap: 8, alignItems: "center", padding: "2px 0" }} title={`${d.axis}: ${d.from} → ${d.to}`}>
                    <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.axis}</span>
                    <div style={{ height: 6, background: C.panel2, borderRadius: 3, position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(0, Math.min(100, d.to ?? 0))}%`, background: tone(d.to) }} />
                    </div>
                    <span style={{ fontFamily: mono, fontSize: 9, color: d.delta >= 0 ? C.ok : C.bad, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.from}→{d.to} ({d.delta >= 0 ? "+" : ""}{d.delta})</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
