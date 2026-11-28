// SUBSTRATE SELF-OBSERVABILITY — "Grafana for antiloki itself" (operator 2026-07-24). First-party
// runtime the substrate already writes: brain.ai_calls (AI cost/latency/tokens per prompt·provider·
// tier) + the rebuild's own phase timings. The "we observe ourselves" cut — no telemetry vendor.
import React from "react";
import { C, mono } from "@/loki/theme";
import { telemetryGet, type SubstrateTelemetry } from "@/loki/api/codebase";

const usd = (n: number | null | undefined) => (n == null ? "—" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const ms = (n: number | null | undefined) => (n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`);
const WINDOWS = [{ h: 168, l: "7d" }, { h: 720, l: "30d" }, { h: 2160, l: "90d" }];

function Spark({ vals, tone, w = 210, h = 34 }: { vals: number[]; tone: string; w?: number; h?: number }) {
  if (vals.length < 2) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals), sp = Math.max(1e-9, hi - lo);
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * (w - 2) + 1},${h - 2 - ((v - lo) / sp) * (h - 4)}`);
  return <svg width={w} height={h} style={{ display: "block" }}><polyline points={pts.join(" ")} fill="none" stroke={tone} strokeWidth={1.4} /><circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]} r={2.4} fill={tone} /></svg>;
}
const Stat = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) => (
  <div style={{ minWidth: 78 }}>
    <div style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    <div style={{ fontFamily: mono, fontSize: 16, color: tone ?? C.fg, fontVariantNumeric: "tabular-nums" }}>{value}</div>
  </div>
);

export function SubstratePanel() {
  const [t, setT] = React.useState<SubstrateTelemetry | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [win, setWin] = React.useState(720);
  const load = React.useCallback(async (h: number) => { setLoading(true); try { setT(await telemetryGet({ window_hours: h })); } finally { setLoading(false); } }, []);
  React.useEffect(() => { void load(win); }, [win, load]);

  if (loading && !t) return <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, padding: 16 }}>reading the substrate's own telemetry…</div>;
  if (!t) return <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, padding: 16 }}>telemetry unavailable — is the BE running?</div>;
  const ai = t.ai, rb = t.rebuild;
  const maxPhase = Math.max(1, ...rb.phases.map((p) => p.avg_ms));

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "8px 12px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>substrate telemetry</span>
        <span style={{ flex: 1 }} />
        {WINDOWS.map((w) => (
          <button key={w.h} onClick={() => setWin(w.h)} style={{ fontFamily: mono, fontSize: 8.5, border: `1px solid ${win === w.h ? C.brand : C.border}`, color: win === w.h ? C.brand : C.dim, background: win === w.h ? C.panel2 : "transparent", borderRadius: 5, padding: "0 6px", cursor: "pointer" }}>{w.l}</button>
        ))}
      </div>
      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginBottom: 10 }}>the tool observing itself — AI cost/latency + rebuild timings you already write · first-party, no vendor</div>

      {/* AI RUNTIME */}
      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>AI runtime · brain.ai_calls</div>
      {ai.calls === 0 ? (
        <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, padding: "4px 0 12px" }}>no AI calls in this window yet — the substrate runs deterministic/$0 by default; spend appears here when the AI is used.</div>
      ) : (<>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 10 }}>
          <Stat label="spend" value={usd(ai.cost_usd)} tone={C.brand} />
          <Stat label="calls" value={ai.calls} />
          <Stat label="avg latency" value={ms(ai.avg_ms)} />
          <Stat label="cache hit" value={ai.cache_hit_pct == null ? "—" : `${ai.cache_hit_pct}%`} tone={C.ok} />
          <Stat label="tokens" value={`${((ai.tokens_in + ai.tokens_out) / 1000).toFixed(0)}k`} />
          {ai.series.length > 1 && <div><div style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, textTransform: "uppercase" }}>cost / day</div><Spark vals={ai.series.map((s) => s.cost)} tone={C.brand} w={180} /></div>}
        </div>
        {ai.by_prompt.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>cost by prompt / skill</div>
            {ai.by_prompt.map((p) => (
              <div key={p.name} style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: mono, fontSize: 9.5, padding: "1px 0" }}>
                <code style={{ flex: 1, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{p.name}</code>
                <span style={{ color: C.dim }}>{p.calls}×</span>
                <span style={{ color: C.dim }}>{ms(p.avg_ms)}</span>
                <span style={{ color: C.brand, minWidth: 52, textAlign: "right" }}>{usd(p.cost)}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {ai.by_provider.map((p) => <span key={p.provider} style={{ fontFamily: mono, fontSize: 8.5, border: `1px solid ${C.border}`, borderRadius: 6, padding: "1px 7px", color: C.dim }}>{p.provider} <b style={{ color: C.brand }}>{usd(p.cost)}</b> · {p.calls}×</span>)}
          {ai.by_tier.map((p) => <span key={p.tier} style={{ fontFamily: mono, fontSize: 8.5, border: `1px solid ${C.border}`, borderRadius: 6, padding: "1px 7px", color: C.dim }}>{p.tier} <b style={{ color: C.muted }}>{p.calls}×</b></span>)}
        </div>
      </>)}

      {/* REBUILD PERFORMANCE */}
      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>rebuild performance · phase timings</div>
      {rb.runs === 0 ? (
        <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, padding: "4px 0" }}>no rebuild timings recorded yet — each rebuild from this version on records how long every phase took, and the phase waterfall (scope→ingest→metrics→…) appears after the next one. History lists every rebuild, timed or not.</div>
      ) : (<>
        <div style={{ display: "flex", gap: 12, alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{rb.runs} rebuild{rb.runs === 1 ? "" : "s"}</span>
          {rb.series.length > 1 && <div><span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, textTransform: "uppercase" }}>total time / rebuild </span><Spark vals={rb.series.map((s) => s.total_ms)} tone={C.warn} w={150} h={26} /></div>}
        </div>
        {rb.phases.map((p) => (
          <div key={p.phase} style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: mono, fontSize: 9.5, padding: "1px 0" }}>
            <span style={{ width: 92, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.phase}</span>
            <div style={{ flex: 1, height: 6, background: C.panel2, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${(p.avg_ms / maxPhase) * 100}%`, height: "100%", background: C.warn }} />
            </div>
            <span style={{ color: C.dim, minWidth: 42, textAlign: "right" }}>{ms(p.avg_ms)}</span>
          </div>
        ))}
        <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, marginTop: 6 }}>bar = average across recent rebuilds · watch a phase creep to catch "ingest got 2× slower this month"</div>
      </>)}
    </div>
  );
}
