// GRAVITY MAP (operator 2026-07-23) — the finviz-style treemap of the WHOLE codebase at once:
// every box a file, AREA = gravity (the file's mass: size + total complexity + coupling pull),
// COLOR = health (green = perfect → red = terrible), both computed deterministically by the
// rebuild's metrics pass and DECOMPOSED (the tooltip names the exact signals: size, complexity,
// coupling, density, churn, untested). Click a box → open the file in the reader.
import React from "react";
import { C, mono } from "@/loki/theme";
import { getMetrics, coverageGet, type FileMetric } from "@/loki/api/codebase";

const norm = (p: string) => String(p ?? "").replace(/\\/g, "/");

export type Box = { m: FileMetric; x: number; y: number; w: number; h: number };

// squarified treemap (Bruls et al.) — keeps boxes near-square so the map reads like the S&P heat map.
export function squarify(items: FileMetric[], x: number, y: number, w: number, h: number): Box[] {
  const total = items.reduce((a, m) => a + Math.max(1, m.gravity ?? 1), 0);
  const scale = (w * h) / total;
  const areas = items.map((m) => Math.max(1, m.gravity ?? 1) * scale);
  const out: Box[] = [];
  let i = 0;
  let cx = x, cy = y, cw = w, ch = h;
  while (i < areas.length) {
    // grow the current row while the worst aspect ratio improves
    const side = Math.min(cw, ch);
    let rowArea = areas[i];
    let end = i + 1;
    let worst = worstRatio(areas.slice(i, end), rowArea, side);
    while (end < areas.length) {
      const nextArea = rowArea + areas[end];
      const nextWorst = worstRatio(areas.slice(i, end + 1), nextArea, side);
      if (nextWorst > worst) break;
      rowArea = nextArea; worst = nextWorst; end++;
    }
    // lay the row along the shorter side
    const thick = rowArea / side;
    let off = 0;
    for (let k = i; k < end; k++) {
      const len = areas[k] / thick;
      if (cw >= ch) out.push({ m: items[k], x: cx, y: cy + off, w: thick, h: len });
      else out.push({ m: items[k], x: cx + off, y: cy, w: len, h: thick });
      off += len;
    }
    if (cw >= ch) { cx += thick; cw -= thick; } else { cy += thick; ch -= thick; }
    i = end;
  }
  return out;
}
function worstRatio(rowAreas: number[], rowArea: number, side: number): number {
  const thick = rowArea / side;
  let worst = 0;
  for (const a of rowAreas) { const len = a / thick; const r = Math.max(thick / len, len / thick); if (r > worst) worst = r; }
  return worst;
}

// progressive green → yellow → red on badness 0..1
export function heat(badness: number): string {
  const b = Math.max(0, Math.min(1, badness));
  const hue = 130 - b * 130; // 130 (green) → 0 (red)
  return `hsl(${hue}, 62%, ${38 - b * 6}%)`;
}

// the LIQUIDATION-ZONE ramp — matched to a real financial liquidation heatmap (Coinglass): deep purple
// (low density) → purple → green → orange → bright yellow (the highest-concentration "magnet" zones).
// The cascade lens is NOT a health map; it's a blast-radius liquidation map (see CascadeLiquidationMap).
const LIQ_STOPS: [number, number, number][] = [
  [26, 16, 54], [70, 40, 130], [36, 120, 110], [150, 178, 60], [242, 158, 44], [255, 236, 130],
];
function liquidation(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (LIQ_STOPS.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = LIQ_STOPS[i], b = LIQ_STOPS[Math.min(LIQ_STOPS.length - 1, i + 1)];
  const c = (j: number) => Math.round(a[j] + (b[j] - a[j]) * f);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}

// ── CASCADE LIQUIDATION MAP — reproduces the Coinglass liquidation heatmap for code. Instead of a
// treemap, blast-radius LEVELS are stacked like price levels (highest at top). Each level is a glowing
// horizontal "leverage bar": its LENGTH = the total code mass sitting at that blast radius, its files
// drawn as bright segments (brightness = each file's mass). A long, bright top band is a magnet zone —
// break any file there and a large downstream liquidates. cascade count = m.cascade (transitive importers).
const CASCADE_BUCKETS = [
  { lo: 61, hi: Infinity, label: "60+" },
  { lo: 26, hi: 60, label: "26–60" },
  { lo: 11, hi: 25, label: "11–25" },
  { lo: 6, hi: 10, label: "6–10" },
  { lo: 3, hi: 5, label: "3–5" },
  { lo: 1, hi: 2, label: "1–2" },
];
export function CascadeLiquidationMap({ metrics, width, onOpen }: { metrics: FileMetric[]; width: number; onOpen?: (p: string) => void }) {
  const [hover, setHover] = React.useState<{ path: string; cascade: number; gravity: number } | null>(null);
  const rows = React.useMemo(() => {
    const buckets = CASCADE_BUCKETS.map((b) => ({ ...b, files: [] as { path: string; cascade: number; gravity: number }[], mass: 0 }));
    for (const m of metrics) {
      const cas = m.cascade ?? 0; if (cas < 1) continue;
      const bk = buckets.find((b) => cas >= b.lo && cas <= b.hi); if (!bk) continue;
      const g = Math.max(1, m.gravity ?? 1);
      bk.files.push({ path: m.path, cascade: cas, gravity: g }); bk.mass += g;
    }
    for (const b of buckets) b.files.sort((p, q) => q.gravity - p.gravity);
    return buckets;
  }, [metrics]);

  const maxMass = Math.max(1, ...rows.map((r) => r.mass));
  const gMax = Math.max(1, ...metrics.map((m) => m.gravity ?? 1));
  const W = Math.max(360, width);
  const PL = 60, PR = 14, ROW = 40, GAP = 8, TOP = 8;
  const plotW = W - PL - PR;
  const H = TOP + rows.length * (ROW + GAP) + 20;
  const magnetIdx = rows.reduce((best, r, i) => (r.mass > rows[best].mass ? i : best), 0);
  const isolated = metrics.filter((m) => (m.cascade ?? 0) < 1).length;

  return (
    <div>
      <svg width={W} height={H} style={{ display: "block", background: C.bg, borderRadius: 8 }}>
        {rows.map((r, ri) => {
          const y = TOP + ri * (ROW + GAP);
          const barW = Math.max(2, (r.mass / maxMass) * plotW);
          const intensity = r.mass / maxMass;
          let cx = PL;
          return (
            <g key={ri}>
              <text x={PL - 8} y={y + ROW / 2 + 3} textAnchor="end" style={{ fontFamily: mono, fontSize: 9, fill: r.files.length ? liquidation(0.4 + intensity * 0.6) : "#3a3550" }}>{r.label}</text>
              <rect x={PL} y={y} width={barW} height={ROW} rx={3} fill={liquidation(intensity)} opacity={0.16} />
              {r.files.map((f, fi) => {
                const w = (f.gravity / r.mass) * barW; const seg = (
                  <rect key={fi} x={cx} y={y + 3} width={Math.max(1, w - 0.6)} height={ROW - 6} rx={1.5}
                    fill={liquidation(0.28 + (f.gravity / gMax) * 0.72)} opacity={hover && hover.path !== f.path ? 0.5 : 0.94}
                    stroke={hover?.path === f.path ? "#fff" : "none"} strokeWidth={hover?.path === f.path ? 1 : 0}
                    style={{ cursor: "pointer" }} onMouseEnter={() => setHover(f)} onMouseLeave={() => setHover(null)} onClick={() => onOpen?.(f.path)}>
                    <title>{`${f.path}\nbreaks ${f.cascade} files if it fails · gravity ${f.gravity}`}</title>
                  </rect>
                );
                cx += w; return seg;
              })}
              {ri === magnetIdx && r.mass > 0 && <text x={PL + barW + 6} y={y + ROW / 2 + 3} style={{ fontFamily: mono, fontSize: 8.5, fill: liquidation(1) }}>⚡ magnet</text>}
            </g>
          );
        })}
        <text x={PL - 8} y={H - 5} textAnchor="end" style={{ fontFamily: mono, fontSize: 8, fill: "#5a5470" }}>blast radius</text>
        <text x={PL} y={H - 5} style={{ fontFamily: mono, fontSize: 8, fill: "#5a5470" }}>bar length + glow = code mass that liquidates if this level breaks →</text>
      </svg>
      <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginTop: 6, lineHeight: 1.6, wordBreak: "break-all", minHeight: 14 }}>
        {hover
          ? <><span style={{ color: C.fg }}>{hover.path}</span> — breaking it cascades into <b style={{ color: liquidation(1) }}>{hover.cascade}</b> file{hover.cascade === 1 ? "" : "s"} · gravity {hover.gravity} — click to open</>
          : <>{isolated} isolated file{isolated === 1 ? "" : "s"} (blast radius 0) aren&apos;t plotted — a break there stays local. Top bands are the liquidation magnets.</>}
      </div>
    </div>
  );
}

// ── LENSES (the finviz mode switch, operator 2026-07-23): same boxes (area = gravity, the mass),
// five COLOR channels — like switching a market heatmap between price/volume/flows. All computed
// deterministically by the metrics pass; each lens says what its red actually means.
type LensKey = "health" | "cascade" | "ownership" | "debt" | "heat" | "runtime";
const LENSES: { key: LensKey; label: string; lo: string; hi: string; desc: string }[] = [
  { key: "health", label: "health", lo: "perfect", hi: "terrible", desc: "the sickness view: dense branching + untested-under-load + churn" },
  { key: "cascade", label: "cascade", lo: "isolated", hi: "breaks everything", desc: "liquidation zones: if this file breaks, how many break with it (reverse import closure)" },
  { key: "ownership", label: "ownership", lo: "shared", hi: "one owner", desc: "whale/bus-factor: recent commits concentrated in a single author — knowledge risk" },
  { key: "debt", label: "debt", lo: "clean", hi: "marker-heavy", desc: "queued intent: TODO/HACK/unused markers waiting in the code (10+ = full red)" },
  { key: "heat", label: "heat", lo: "cold", hi: "hot", desc: "recent churn: how often it changed in the last-500-commits window" },
  { key: "runtime", label: "runtime", lo: "all executed", hi: "never runs", desc: "runtime × architecture: the SAME structure recolored by what your tests actually executed (live coverage) — grey = no runtime signal" },
];
const lensVal = (m: FileMetric, k: LensKey): number => (k === "health" ? (m.lens?.health ?? m.badness ?? 0) : k === "runtime" ? 0 : (m.lens?.[k] ?? 0));

export const partWhy = (m: FileMetric): string => {
  const p = m.gravity_parts;
  if (!p) return "";
  const parts: string[] = [];
  if (p.size > 0.8) parts.push(`big (${m.loc} LOC, top ${Math.round((1 - p.size) * 100)}%)`);
  if (p.complexity > 0.8) parts.push(`heavy branching (cyclomatic ${m.complexity ?? "?"})`);
  if (p.density > 0.8) parts.push("DENSE — many branches per line (the real complexity smell)");
  if (p.coupling > 0.8) parts.push(`hard-coupled (fan-in ${m.fan_in} · fan-out ${m.fan_out})`);
  if (p.churn > 0.8) parts.push("changing constantly (churn hotspot)");
  if (p.untested === 1) parts.push("no test touches it");
  return parts.length ? parts.join(" · ") : "healthy proportions";
};

// the WHY line per lens — names the raw driver behind the color, never just the score
const lensWhy = (m: FileMetric, k: LensKey): string => {
  if (k === "health") return partWhy(m);
  if (k === "cascade") return (m.cascade ?? 0) > 0 ? `breaking it ripples into ${m.cascade} file${m.cascade === 1 ? "" : "s"} (transitive importers)` : "nothing imports it — a break stays local";
  if (k === "ownership") return m.authors == null ? "no recent git history for this file" : m.authors === 0 ? "not touched in the recent window" : `${m.authors} author${m.authors === 1 ? "" : "s"} in recent history${m.authors === 1 ? " — single point of knowledge" : ""}`;
  if (k === "debt") return (m.debt ?? 0) > 0 ? `${m.debt} TODO/HACK/unused marker${m.debt === 1 ? "" : "s"} queued inside` : "no debt markers";
  return (m.churn ?? 0) > 0 ? `changed ×${m.churn} in the last 500 commits` : "cold — untouched recently";
};

// ── OWNERSHIP → circle-packing (CodeScene knowledge-map style): each file a bubble, size = mass,
// colour = ownership concentration (red = one owner / bus-factor → green = shared knowledge).
export function OwnershipBubbles({ metrics, width, onOpen }: { metrics: FileMetric[]; width: number; onOpen?: (p: string) => void }) {
  const [hover, setHover] = React.useState<FileMetric | null>(null);
  const W = Math.max(360, width);
  const { placed, H } = React.useMemo(() => {
    const list = [...metrics].filter((m) => (m.gravity ?? 0) > 0).sort((a, b) => (b.gravity ?? 0) - (a.gravity ?? 0)).slice(0, 150);
    const gMax = Math.max(1, ...list.map((m) => m.gravity ?? 1));
    const out: { m: FileMetric; x: number; y: number; r: number }[] = [];
    const pad = 10, gap = 3; let x = pad, y = pad, rowH = 0;
    for (const m of list) {
      const r = 5 + Math.sqrt((m.gravity ?? 1) / gMax) * 26;
      if (x + 2 * r > W - pad) { x = pad; y += rowH + gap; rowH = 0; }
      out.push({ m, x: x + r, y: y + r, r }); x += 2 * r + gap; rowH = Math.max(rowH, 2 * r);
    }
    return { placed: out, H: y + rowH + pad };
  }, [metrics, W]);
  const own = (m: FileMetric) => m.lens?.ownership ?? 0;
  return (
    <div>
      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginBottom: 6 }}>each file a bubble · size = mass · red = one owner (bus-factor) → green = shared knowledge</div>
      <svg width={W} height={H} style={{ display: "block", background: C.bg, borderRadius: 8 }}>
        {placed.map((b, i) => (
          <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={heat(own(b.m))} stroke={hover?.path === b.m.path ? C.fg : "rgba(0,0,0,0.35)"} strokeWidth={hover?.path === b.m.path ? 1.5 : 0.5}
            style={{ cursor: "pointer" }} onMouseEnter={() => setHover(b.m)} onMouseLeave={() => setHover(null)} onClick={() => onOpen?.(b.m.path)}>
            <title>{`${b.m.path}\n${b.m.authors == null ? "no recent git history" : b.m.authors === 1 ? "SOLE-OWNED — bus-factor risk" : `${b.m.authors} authors`} · mass ${b.m.gravity}`}</title>
          </circle>
        ))}
      </svg>
      {hover && <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginTop: 6, wordBreak: "break-all" }}><span style={{ color: C.fg }}>{hover.path}</span> — {hover.authors == null ? "no recent git history" : hover.authors === 1 ? "sole-owned (bus-factor)" : `${hover.authors} authors`} · mass {hover.gravity} — click to open</div>}
    </div>
  );
}

// ── DEBT → the ledger (ranked horizontal bars): files by queued TODO/HACK/unused markers.
export function DebtBars({ metrics, width, onOpen }: { metrics: FileMetric[]; width: number; onOpen?: (p: string) => void }) {
  const W = Math.max(360, width);
  const items = [...metrics].filter((m) => (m.debt ?? 0) > 0).sort((a, b) => (b.debt ?? 0) - (a.debt ?? 0)).slice(0, 24);
  const max = Math.max(1, ...items.map((m) => m.debt ?? 0));
  if (!items.length) return <div style={{ fontFamily: mono, fontSize: 10, color: C.ok, padding: 16 }}>✓ no debt markers (TODO/HACK/unused) anywhere in the atlas.</div>;
  return (
    <div>
      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginBottom: 6 }}>the debt ledger — files ranked by queued TODO/HACK/unused markers</div>
      <div style={{ width: W }}>
        {items.map((m) => (
          <div key={m.path} onClick={() => onOpen?.(m.path)} title={`${m.path} — ${m.debt} markers`} style={{ display: "grid", gridTemplateColumns: "150px 1fr 26px", gap: 8, alignItems: "center", padding: "1px 0", cursor: "pointer" }}>
            <code style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.path.split("/").pop()}</code>
            <div style={{ height: 11, background: C.panel2, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${((m.debt ?? 0) / max) * 100}%`, height: "100%", background: heat(lensVal(m, "debt")) }} /></div>
            <span style={{ fontFamily: mono, fontSize: 9.5, color: C.warn, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.debt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HEAT → churn × mass hotspot scatter: top-right = big & constantly changing = stabilise first.
export function HeatScatter({ metrics, width, height = 340, onOpen }: { metrics: FileMetric[]; width: number; height?: number; onOpen?: (p: string) => void }) {
  const [hover, setHover] = React.useState<FileMetric | null>(null);
  const W = Math.max(300, width), H = height, PL = 40, PR = 14, PT = 12, PB = 28;
  const pts = metrics.filter((m) => (m.gravity ?? 0) > 0);
  const gMax = Math.max(1, ...pts.map((m) => m.gravity ?? 1)), cMax = Math.max(1, ...pts.map((m) => m.churn ?? 0));
  const plotW = W - PL - PR, plotH = H - PT - PB;
  const sx = (m: FileMetric) => PL + Math.sqrt((m.gravity ?? 1) / gMax) * plotW;
  const sy = (m: FileMetric) => PT + (1 - (m.churn ?? 0) / cMax) * plotH;
  return (
    <div>
      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginBottom: 4 }}>recent churn × mass · top-right = big &amp; constantly changing = the hotspots to stabilise</div>
      <svg width={W} height={H} style={{ display: "block", background: C.bg, borderRadius: 8 }}>
        <rect x={PL + plotW * 0.5} y={PT} width={plotW * 0.5} height={plotH * 0.5} fill={C.bad} opacity={0.06} />
        <text x={W - PR - 4} y={PT + 12} textAnchor="end" style={{ fontFamily: mono, fontSize: 8, fill: C.bad, opacity: 0.7 }}>hotspots</text>
        <line x1={PL} y1={PT} x2={PL} y2={PT + plotH} stroke={C.border} strokeWidth={1} />
        <line x1={PL} y1={PT + plotH} x2={W - PR} y2={PT + plotH} stroke={C.border} strokeWidth={1} />
        <text x={2} y={PT + 8} style={{ fontFamily: mono, fontSize: 8, fill: C.dim }}>churn</text>
        <text x={W - PR} y={PT + plotH + 14} textAnchor="end" style={{ fontFamily: mono, fontSize: 8, fill: C.dim }}>heavy mass →</text>
        {pts.map((m, i) => { const on = !hover || hover.path === m.path; const hv = (m.churn ?? 0) / cMax; return (
          <circle key={i} cx={sx(m)} cy={sy(m)} r={3 + Math.sqrt((m.gravity ?? 1) / gMax) * 4} fill={heat(0.3 + hv * 0.7)} opacity={on ? 0.72 : 0.18} stroke={hover?.path === m.path ? C.fg : "none"} strokeWidth={1}
            style={{ cursor: "pointer" }} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)} onClick={() => onOpen?.(m.path)}><title>{`${m.path}\nchanged ×${m.churn ?? 0} · mass ${m.gravity}`}</title></circle>
        ); })}
      </svg>
      {hover && <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginTop: 6, wordBreak: "break-all" }}><span style={{ color: C.fg }}>{hover.path}</span> — changed ×{hover.churn ?? 0} recently · mass {hover.gravity} — click to open</div>}
    </div>
  );
}

// ── RUNTIME → coverage SUNBURST (Istanbul style): folder (inner ring) → file (outer), coloured by coverage.
export function CoverageSunburst({ metrics, cov, width, onOpen }: { metrics: FileMetric[]; cov: Map<string, number>; width: number; onOpen?: (p: string) => void }) {
  const [hover, setHover] = React.useState<string | null>(null);
  const S = Math.min(Math.max(320, width), 540), cx = S / 2, cy = S / 2;
  const tree = React.useMemo(() => {
    const folders = new Map<string, FileMetric[]>();
    for (const m of metrics) { if ((m.gravity ?? 0) <= 0) continue; const top = m.path.split("/")[0] || "."; const arr = folders.get(top) ?? []; arr.push(m); folders.set(top, arr); }
    return [...folders.entries()].map(([name, files]) => ({ name, files })).sort((a, b) => b.files.length - a.files.length);
  }, [metrics]);
  const totalFiles = tree.reduce((s, f) => s + f.files.length, 0) || 1;
  const covPct = (m: FileMetric): number | null => { const n = m.path.replace(/\\/g, "/"); if (cov.has(n)) return cov.get(n)!; for (const [k, v] of cov) if (k.endsWith("/" + n) || n.endsWith("/" + k)) return v; return null; };
  const covColor = (p: number | null) => (p == null ? "hsl(240,5%,24%)" : `hsl(${(p / 100) * 130}, 60%, 42%)`);
  const arc = (r0: number, r1: number, a0: number, a1: number) => {
    const pt = (r: number, an: number) => `${(cx + r * Math.cos(an)).toFixed(2)} ${(cy + r * Math.sin(an)).toFixed(2)}`;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${pt(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${pt(r0, a0)} Z`;
  };
  const r0 = S * 0.15, r1 = S * 0.30, r2 = S * 0.46;
  let a = -Math.PI / 2;
  const segs: React.ReactNode[] = [];
  tree.forEach((folder, fi) => {
    const span = (folder.files.length / totalFiles) * Math.PI * 2, fa0 = a;
    const covs = folder.files.map(covPct).filter((v): v is number => v != null);
    const favg = covs.length ? covs.reduce((s, v) => s + v, 0) / covs.length : null;
    segs.push(<path key={`f${fi}`} d={arc(r0, r1, fa0, fa0 + span)} fill={covColor(favg)} stroke={C.bg} strokeWidth={1} opacity={0.85}><title>{`${folder.name}/ — ${favg == null ? "no coverage" : Math.round(favg) + "% avg"} · ${folder.files.length} files`}</title></path>);
    let fa = fa0;
    for (const m of folder.files) { const fspan = span / folder.files.length; const p = covPct(m);
      segs.push(<path key={m.path} d={arc(r1, r2, fa, fa + fspan)} fill={covColor(p)} stroke={C.bg} strokeWidth={0.4} opacity={hover && hover !== m.path ? 0.35 : 0.95}
        style={{ cursor: "pointer" }} onMouseEnter={() => setHover(m.path)} onMouseLeave={() => setHover(null)} onClick={() => onOpen?.(m.path)}><title>{`${m.path}\n${p == null ? "not in coverage report" : p + "% covered"}`}</title></path>);
      fa += fspan; }
    a = fa0 + span;
  });
  return (
    <div>
      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginBottom: 4 }}>coverage by folder (inner ring) → file (outer) · red = untested → green = covered · grey = no report</div>
      {cov.size === 0 && <div style={{ fontFamily: mono, fontSize: 9, color: C.warn, marginBottom: 4 }}>no coverage report yet — run it in the ✓ coverage panel, then this lights up</div>}
      <svg width={S} height={S} style={{ display: "block", margin: "0 auto" }}>{segs}</svg>
      {hover && <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginTop: 6, textAlign: "center", wordBreak: "break-all" }}><span style={{ color: C.fg }}>{hover}</span></div>}
    </div>
  );
}

export function GravityMap({ onOpen }: { onOpen?: (path: string) => void }) {
  const [metrics, setMetrics] = React.useState<FileMetric[] | null>(null);
  const [hover, setHover] = React.useState<FileMetric | null>(null);
  const [lens, setLens] = React.useState<LensKey>("health");
  const [full, setFull] = React.useState(false); // ⛶ — the map as a full-viewport overlay
  const [size, setSize] = React.useState({ w: 900, h: 480 });
  const [cov, setCov] = React.useState<Map<string, number> | null>(null); // path → coverage %, loaded lazily when the runtime lens is first opened
  const holderRef = React.useRef<HTMLDivElement | null>(null);
  const L = LENSES.find((x) => x.key === lens)!;
  React.useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [full]);

  React.useEffect(() => {
    void (async () => {
      const r = await getMetrics({});
      if (!r) return;
      const list = Object.entries(r.metrics_by_file ?? {})
        .map(([path, m]) => ({ path, ...(m as Omit<FileMetric, "path">) }))
        .filter((m) => !m.is_test && (m.gravity ?? 0) > 0)
        .sort((a, b) => (b.gravity ?? 0) - (a.gravity ?? 0))
        .slice(0, 1200); // every meaningful file; beyond this the boxes are sub-pixel anyway
      setMetrics(list);
    })();
  }, []);
  React.useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({
      w: el.clientWidth || 900,
      h: full ? Math.max(420, window.innerHeight - 170) : Math.max(420, (el.clientWidth || 900) * 0.52),
    }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [full]);

  const boxes = React.useMemo(() => (metrics ? squarify(metrics, 0, 0, size.w, size.h) : []), [metrics, size]);

  React.useEffect(() => { setHover(null); }, [lens]); // a lens switch clears the treemap hover (cascade has its own)
  // runtime lens: read the coverage report lazily (only once, the first time the lens is opened — a file read, no test run)
  React.useEffect(() => {
    if (lens !== "runtime" || cov) return;
    void coverageGet({}).then((r) => {
      const m = new Map<string, number>();
      for (const f of r?.files ?? []) m.set(norm(f.path), f.pct);
      setCov(m);
    });
  }, [lens, cov]);
  // join coverage → the atlas files once per data change (exact normalized path, else longest-suffix match)
  const covJoin = React.useMemo(() => {
    const out = new Map<string, number>();
    if (!cov || !metrics) return out;
    for (const m of metrics) {
      const p = norm(m.path);
      if (cov.has(p)) { out.set(m.path, cov.get(p)!); continue; }
      for (const [k, v] of cov) { if (k.endsWith("/" + p) || p.endsWith("/" + k)) { out.set(m.path, v); break; } }
    }
    return out;
  }, [cov, metrics]);

  // lens-aware color / score / why — the runtime lens is driven by coverage, every other lens by the metrics pass
  const ramp = lens === "cascade" ? liquidation : heat; // drives the legend gradient (cascade = liquidation ramp)
  const fill = (m: FileMetric): string => {
    if (lens === "runtime") { const p = covJoin.get(m.path); return p == null ? "hsl(240,5%,23%)" : heat(1 - p / 100); }
    return heat(lensVal(m, lens)); // cascade renders its own liquidation map, so the treemap fill is always the health ramp here
  };
  const scoreLabel = (m: FileMetric): string => {
    if (lens === "runtime") { const p = covJoin.get(m.path); return p == null ? "no runtime signal" : `${p}% executed`; }
    return `${L.label} ${Math.round(lensVal(m, lens) * 100)}/100`;
  };
  const whyFor = (m: FileMetric): string => {
    if (lens === "runtime") { const p = covJoin.get(m.path); return p == null ? "not in the coverage report — the suite never executed it (or it isn't instrumented)" : `${p}% of its lines ran under the test suite`; }
    return lensWhy(m, lens);
  };

  return (
    <div ref={holderRef} style={full
      ? { position: "fixed", inset: 0, zIndex: 300, background: C.bg, padding: "10px 16px", overflow: "auto", boxSizing: "border-box" }
      : { padding: "4px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>gravity map</span>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{lens === "health" ? "area = mass (size · complexity · coupling) · color = health" : L.desc}</span>
        <span style={{ flex: 1 }} />
        {/* the color legend applies to the ramp-based lenses; the sunburst/scatter carry their own captions */}
        {lens !== "runtime" && lens !== "debt" && (
          <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: ramp(0) }} /> {L.lo}
            <span style={{ width: 46, height: 8, borderRadius: 2, background: `linear-gradient(90deg, ${ramp(0)}, ${ramp(0.5)}, ${ramp(1)})` }} />
            {L.hi} <span style={{ width: 10, height: 10, borderRadius: 2, background: ramp(1) }} />
          </span>
        )}
        <button onClick={() => setFull((f) => !f)} title={full ? "exit fullscreen (Esc)" : "expand the map to the whole screen"}
          style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: mono, fontSize: 13, color: full ? C.brand : C.dim }}>{full ? "🗗" : "⛶"}</button>
      </div>
      {/* the lens switcher — same boxes, five color channels (finviz-style) */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
        {LENSES.map((x) => (
          <button key={x.key} onClick={() => setLens(x.key)} title={x.desc}
            style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 8, cursor: "pointer",
              background: lens === x.key ? C.panel2 : "transparent",
              border: `1px solid ${lens === x.key ? C.brand : C.border}`,
              color: lens === x.key ? C.brand : C.muted }}>{x.label}</button>
        ))}
        <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginLeft: 4 }}>{L.desc}</span>
      </div>
      {lens === "runtime" && !cov && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, marginBottom: 4 }}>reading coverage report…</div>}
      {lens === "runtime" && cov && covJoin.size === 0 && <div style={{ fontFamily: mono, fontSize: 9, color: C.warn, marginBottom: 4 }}>no runtime signal yet — open the ✓ coverage panel and press ▶ run to capture what actually executes, then this lens lights up</div>}
      {lens === "runtime" && covJoin.size > 0 && <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginBottom: 4 }}>{covJoin.size} files carry a runtime signal · grey boxes never ran under the suite</div>}
      {!metrics && <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, padding: 20 }}>computing gravity… (deterministic — read live from the atlas graph, no rebuild needed)</div>}
      {metrics && metrics.length === 0 && <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, padding: 20 }}>no files with mass yet — the atlas looks empty; run a rebuild to index this workspace</div>}
      {/* EACH LENS IS ITS OWN WIDGET (operator 2026-07-24): health = treemap, cascade = liquidation bands,
          ownership = circle-packing, debt = ledger bars, heat = churn×mass scatter, runtime = coverage sunburst */}
      {metrics && metrics.length > 0 && lens === "cascade" && <CascadeLiquidationMap metrics={metrics} width={size.w} onOpen={onOpen} />}
      {metrics && metrics.length > 0 && lens === "ownership" && <OwnershipBubbles metrics={metrics} width={size.w} onOpen={onOpen} />}
      {metrics && metrics.length > 0 && lens === "debt" && <DebtBars metrics={metrics} width={size.w} onOpen={onOpen} />}
      {metrics && metrics.length > 0 && lens === "heat" && <HeatScatter metrics={metrics} width={size.w} onOpen={onOpen} />}
      {metrics && metrics.length > 0 && lens === "runtime" && <CoverageSunburst metrics={metrics} cov={covJoin} width={size.w} onOpen={onOpen} />}
      {lens === "health" && boxes.length > 0 && (
        <svg width={size.w} height={size.h} style={{ display: "block", borderRadius: 8, background: C.bg }}>
          {boxes.map((b, i) => (
            <g key={i} onClick={() => onOpen?.(b.m.path)} onMouseEnter={() => setHover(b.m)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              <rect x={b.x + 0.5} y={b.y + 0.5} width={Math.max(0.5, b.w - 1)} height={Math.max(0.5, b.h - 1)} fill={fill(b.m)}
                stroke={hover?.path === b.m.path ? C.fg : C.bg} strokeWidth={hover?.path === b.m.path ? 1.5 : 0.5} rx={1.5}>
                <title>{`${b.m.path}\ngravity ${b.m.gravity} · ${scoreLabel(b.m)}\n${whyFor(b.m)}\n${b.m.loc} LOC · cyclomatic ${b.m.complexity ?? "?"} · fan-in ${b.m.fan_in} · fan-out ${b.m.fan_out}${b.m.covered ? " · tested" : " · NO TESTS"}`}</title>
              </rect>
              {b.w > 58 && b.h > 15 && (
                <text x={b.x + 4} y={b.y + 12} fill="rgba(255,255,255,0.92)" style={{ fontFamily: mono, fontSize: Math.min(10, b.h / 3), pointerEvents: "none" }}>
                  {b.m.path.split("/").pop()!.slice(0, Math.floor(b.w / 6))}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
      {lens === "health" && hover && (
        <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginTop: 6, lineHeight: 1.6, wordBreak: "break-all" }}>
          <span style={{ color: C.fg }}>{hover.path}</span> · gravity {hover.gravity} · <span style={{ color: fill(hover) }}>{scoreLabel(hover)}</span>
          <br />{whyFor(hover)}{partWhy(hover) ? ` · ${partWhy(hover)}` : ""} — click to open
        </div>
      )}
    </div>
  );
}