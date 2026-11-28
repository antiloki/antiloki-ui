// WHAT THE TEAM CHANGED, AS IT HAPPENED (approved mockup 2026-11-18, from the idea of AffectUI's Diff Timeline; drawn by us): files touched over the run's time as an area (green) with what was put back as a line (red), a scrubber to go to any moment, one bar per file.
// A step's NET lines (the lines of its files after minus before) are counted by the serve when the step ends; the chart draws files, and the lines as numbers beside them when any step was counted. Pure `timelineOf` builds the series from the ledger.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { ledgerOf } from "./model";
import type { Run } from "./types";

export type TLPoint = { t: number; files: number; put_back: number; step: string; /** net lines added and removed so far (only steps the serve counted) */ added: number; removed: number };
export type TLFile = { name: string; first: number; steps: string[]; put_back: boolean };
/** The run's changes in time order: cumulative files touched and put back after each step, and per file the steps that touched it. Pure over the run. */
export function timelineOf(run: Run): { points: TLPoint[]; files: TLFile[]; span_ms: number } {
  const rows = [...ledgerOf(run).rows].sort((a, b) => a.at_ms - b.at_ms); const t0 = run.state.started_ms || (rows[0]?.at_ms ?? 0);
  const seen = new Map<string, TLFile>(); const points: TLPoint[] = [{ t: 0, files: 0, put_back: 0, step: "", added: 0, removed: 0 }]; let pb = 0; let add = 0, rem = 0;
  for (const r of rows) { for (const f of r.files) { const e = seen.get(f) ?? { name: f, first: r.at_ms - t0, steps: [], put_back: false }; e.steps.push(r.title); seen.set(f, e); } for (const f of r.put_back) { const e = seen.get(f) ?? { name: f, first: r.at_ms - t0, steps: [], put_back: true }; e.put_back = true; e.steps.push(r.title); seen.set(f, e); pb++; }
    add += r.lines?.added ?? 0; rem += r.lines?.removed ?? 0; points.push({ t: Math.max(0, r.at_ms - t0), files: seen.size, put_back: pb, step: r.title, added: add, removed: rem }); }
  const span = Math.max(1000, points[points.length - 1].t); return { points, files: [...seen.values()], span_ms: span };
}
const clock = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export function DiffTimeline({ run }: { run: Run }) {
  const tl = React.useMemo(() => timelineOf(run), [run]); const [at, setAt] = React.useState<number | null>(null);   // null = follow the end
  if (tl.points.length < 2) return null;
  const t = at ?? tl.span_ms; const W = 640, H = 170, L = 30, B = 22, maxY = Math.max(2, ...tl.points.map((p) => p.files));
  const X = (v: number) => L + (v / tl.span_ms) * (W - L - 8), Y = (v: number) => H - B - (v / maxY) * (H - B - 12);
  const upto = tl.points.filter((p) => p.t <= t); const last = upto[upto.length - 1] ?? tl.points[0];
  const path = (k: "files" | "put_back") => upto.map((p, i) => `${i ? "L" : "M"}${X(p.t)} ${Y(p[k])}`).join(" ") + ` L${X(t)} ${Y(last[k])}`;
  const touched = tl.files.filter((f) => f.first <= t);
  return (
    <div data-testid="diff-timeline" style={{ margin: "14px 16px 0", border: `1px solid ${C.border}`, borderRadius: 16, background: "color-mix(in srgb, var(--c-panel) 80%, transparent)", padding: "14px 16px", fontFamily: nav, color: C.fg }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontWeight: 600 }}>Changes</b><span style={{ color: C.muted, fontSize: 12.5 }}>{last.step ? `latest: ${last.step}` : "at the start"}</span><span style={{ flex: 1 }} />
        <span data-testid="dt-files" style={{ ...pill("#3ecf8e"), fontFamily: mono }}>{last.files} file{last.files === 1 ? "" : "s"}</span>{(last.added > 0 || last.removed > 0) && <span data-testid="dt-lines" title="net lines the steps added and removed in their files" style={{ ...pill("#4d8dff"), fontFamily: mono }}>+{last.added} −{last.removed} lines</span>}{last.put_back > 0 && <span data-testid="dt-putback" style={{ ...pill("#f04e4e"), fontFamily: mono }}>{last.put_back} put back</span>}<span style={{ fontFamily: mono, fontSize: 12, color: C.dim }}>{clock(t)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="files touched over the run" style={{ width: "100%", height: "auto", display: "block", marginTop: 6 }}>
        <defs><linearGradient id="dt-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3ecf8e" stopOpacity=".28" /><stop offset="1" stopColor="#3ecf8e" stopOpacity="0" /></linearGradient></defs>
        {[0, Math.ceil(maxY / 2), maxY].map((v) => <g key={v}><line x1={L} x2={W - 8} y1={Y(v)} y2={Y(v)} stroke="var(--c-border)" strokeDasharray="2 5" /><text x={L - 8} y={Y(v) + 4} textAnchor="end" fontSize={10.5} fill={C.dim} fontFamily={mono}>{v}</text></g>)}
        {[0, 0.5, 1].map((u) => <text key={u} x={X(u * tl.span_ms)} y={H - 5} textAnchor="middle" fontSize={10.5} fill={C.dim} fontFamily={mono}>{clock(u * tl.span_ms)}</text>)}
        <path d={`${path("files")} L${X(t)} ${Y(0)} L${X(0)} ${Y(0)}Z`} fill="url(#dt-g)" /><path d={path("files")} fill="none" stroke="#3ecf8e" strokeWidth={1.7} />
        {last.put_back > 0 && <path d={path("put_back")} fill="none" stroke="#f04e4e" strokeWidth={1.7} />}
        <line x1={X(t)} x2={X(t)} y1={10} y2={H - B} stroke={C.dim} strokeDasharray="2 4" /><circle cx={X(t)} cy={Y(last.files)} r={4} fill="#3ecf8e" stroke="var(--c-panel)" strokeWidth={2} />
      </svg>
      <input data-testid="dt-range" type="range" min={0} max={tl.span_ms} value={t} onChange={(e) => setAt(+e.target.value >= tl.span_ms ? null : +e.target.value)} aria-label="time" style={{ width: "100%", accentColor: "#4d8dff" }} />
      <div style={{ display: "grid", gap: 2, marginTop: 6 }}>
        {touched.slice(0, 10).map((f) => <div key={f.name} data-testid={`dt-file-${f.name}`} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 40%) minmax(0, 1fr)", gap: 10, alignItems: "center", fontSize: 12.5, padding: "3px 0" }}>
          <span style={{ fontFamily: mono, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.name}>{f.name}</span>
          <span aria-hidden style={{ height: 6, borderRadius: 3, background: "var(--c-border)", overflow: "hidden", display: "flex" }}><i style={{ width: `${Math.min(100, 28 * f.steps.length)}%`, background: f.put_back ? "#f04e4e" : "#3ecf8e" }} /></span></div>)}
        {touched.length > 10 && <div style={{ color: C.dim, fontSize: 11.5 }}>+{touched.length - 10} more</div>}
      </div>
      <div style={{ color: C.dim, fontSize: 11.5, marginTop: 8 }}>Counts files, not lines: the run does not record line counts yet.</div>
    </div>
  );
}
const pill = (c: string): React.CSSProperties => ({ fontSize: 11.5, lineHeight: "20px", padding: "0 9px", borderRadius: 999, color: c, border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`, background: `color-mix(in srgb, ${c} 10%, transparent)` });
