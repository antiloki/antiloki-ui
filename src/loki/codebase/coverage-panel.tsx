// TEST COVERAGE X-RAY — the coverage tab is a full diagnostic, not just a list. It joins the executed-
// line signal (lcov) with the gravity metrics (mass · coupling · complexity) so the ranking answers the
// REAL question: which untested files will hurt most if they break. Sections: a grade strip, the
// coverage distribution, a gravity×coverage risk scatter (danger zone = heavy + untested), the riskiest
// gaps ranked by mass×(1−coverage), and the blind spots — high-mass files no test ever executes.
// "read" (default) is instant/safe; "▶ run" executes your project's coverage tool in the sandbox first.
import React from "react";
import { C, mono } from "@/loki/theme";
import { coverageGet, getMetrics, type Coverage, type CoverageFile, type FileMetric } from "@/loki/api/codebase";

const norm = (p: string) => String(p ?? "").replace(/\\/g, "/");
const baseName = (p: string) => norm(p).split("/").pop() || p;
const tone = (pct: number) => (pct >= 80 ? C.ok : pct >= 50 ? C.warn : C.bad);
const grade = (p: number) => (p >= 90 ? "A" : p >= 75 ? "B" : p >= 60 ? "C" : p >= 40 ? "D" : "F");

type Metric = Omit<FileMetric, "path">;
type Gap = CoverageFile & { gravity: number; fan_in: number; loc: number; complexity: number | null; riskRaw: number };
type Blind = { path: string; gravity: number; fan_in: number; loc: number };

function useWidth(def = 520) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [w, setW] = React.useState(def);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || def));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const Stat = ({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
    <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: color ?? C.fg, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</span>
  </div>
);

export function CoveragePanel({ onOpen }: { onOpen?: (path: string) => void }) {
  const [cov, setCov] = React.useState<Coverage | null>(null);
  const [mets, setMets] = React.useState<Record<string, Metric> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [cmd, setCmd] = React.useState("npx c8 --reporter=lcovonly npm test");
  const [wrapRef, W] = useWidth(520);

  const load = React.useCallback(async () => {
    setLoading(true);
    try { const [c, m] = await Promise.all([coverageGet({}), getMetrics({})]); setCov(c); setMets(m?.metrics_by_file ?? null); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  const run = async () => { setRunning(true); try { setCov(await coverageGet({ run: true, cmd, timeout_ms: 300000 })); } finally { setRunning(false); } };

  // ── the join: coverage × gravity. exact normalized path, else longest-suffix match (both directions).
  const x = React.useMemo(() => {
    const files = cov?.files ?? [];
    const metEntries = Object.entries(mets ?? {}).map(([p, m]) => [norm(p), m] as const);
    const metExact = new Map(metEntries);
    const metFor = (p: string): Metric | null => {
      const n = norm(p);
      if (metExact.has(n)) return metExact.get(n)!;
      for (const [k, m] of metEntries) if (k.endsWith("/" + n) || n.endsWith("/" + k)) return m;
      return null;
    };
    const covExact = new Map(files.map((f) => [norm(f.path), f.pct] as const));
    const covKeys = [...covExact.keys()];
    const covFor = (p: string): number | null => {
      const n = norm(p);
      if (covExact.has(n)) return covExact.get(n)!;
      for (const k of covKeys) if (k.endsWith("/" + n) || n.endsWith("/" + k)) return covExact.get(k)!;
      return null;
    };

    const gaps: Gap[] = files.filter((f) => f.pct < 100).map((f) => {
      const m = metFor(f.path); const gravity = m?.gravity ?? 0;
      // risk = mass × (1 − coverage). No metric? fall back to mass=1 so the list still ranks by coverage.
      return { ...f, gravity, fan_in: m?.fan_in ?? 0, loc: m?.loc ?? f.total, complexity: (m?.complexity ?? null) as number | null, riskRaw: (gravity || 1) * (1 - f.pct / 100) };
    }).sort((a, b) => b.riskRaw - a.riskRaw);

    // blind spots: heavy, non-test files the suite NEVER executes (absent from the report, or exactly 0%)
    const blind: Blind[] = Object.entries(mets ?? {})
      .filter(([, m]) => !m.is_test && (m.gravity ?? 0) > 0)
      .filter(([p]) => { const c = covFor(p); return c == null || c === 0; })
      .map(([p, m]) => ({ path: p, gravity: m.gravity ?? 0, fan_in: m.fan_in ?? 0, loc: m.loc ?? 0 }))
      .sort((a, b) => b.gravity - a.gravity).slice(0, 8);

    const pts = files.map((f) => { const m = metFor(f.path); return m ? { path: f.path, pct: f.pct, gravity: m.gravity ?? 0, fan_in: m.fan_in ?? 0 } : null; })
      .filter(Boolean) as { path: string; pct: number; gravity: number; fan_in: number }[];

    const bands = [0, 0, 0, 0, 0, 0];
    for (const f of files) bands[f.pct <= 0 ? 0 : f.pct < 25 ? 1 : f.pct < 50 ? 2 : f.pct < 75 ? 3 : f.pct < 100 ? 4 : 5] += 1;

    const hit = files.reduce((a, f) => a + f.hit, 0);
    const total = files.reduce((a, f) => a + f.total, 0);
    const untested = files.filter((f) => f.pct <= 0).length;
    const full = files.filter((f) => f.pct >= 100).length;
    return { gaps, blind, pts, bands, hit, total, untested, full, gMax: Math.max(1, ...pts.map((p) => p.gravity)), riskMax: Math.max(1, ...gaps.map((g) => g.riskRaw)) };
  }, [cov, mets]);

  const totalPct = cov?.total_pct ?? null;
  const hasReport = !!cov?.files && cov.files.length > 0;

  // ── scatter geometry
  const SW = Math.max(320, W), SH = 188, PL = 34, PR = 8, PT = 10, PB = 24;
  const plotW = SW - PL - PR, plotH = SH - PT - PB;
  const sx = (g: number) => PL + Math.sqrt(g / x.gMax) * plotW;         // sqrt spreads the mass axis
  const sy = (p: number) => PT + (1 - p / 100) * plotH;                 // 100% at top, 0% at floor
  const BANDS = [{ l: "0%", c: C.bad }, { l: "<25", c: C.bad }, { l: "<50", c: C.warn }, { l: "<75", c: C.warn }, { l: "<100", c: C.ok }, { l: "100%", c: C.ok }];
  const bandMax = Math.max(1, ...x.bands);

  return (
    <div ref={wrapRef} style={{ height: "100%", overflow: "auto", padding: "8px 12px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>coverage x-ray</span>
        {cov?.count ? <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>{cov.count} files · executed-line signal × gravity mass</span> : null}
      </div>

      {/* capture control */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "6px 0 10px" }}>
        <input value={cmd} onChange={(e) => setCmd(e.target.value)} spellCheck={false} disabled={running}
          title="your project's coverage command — it must emit coverage/lcov.info"
          style={{ flex: 1, minWidth: 0, background: C.bg, border: `1px solid ${C.border}`, color: C.fg, fontFamily: mono, fontSize: 9, padding: "3px 7px", borderRadius: 5, outline: "none" }} />
        <button onClick={() => void run()} disabled={running || !cmd.trim()} title="run your coverage tool in the workspace sandbox, then read the result"
          style={{ fontFamily: mono, fontSize: 9.5, background: "transparent", border: `1px solid ${running ? C.warn : C.brand}`, color: running ? C.warn : C.brand, borderRadius: 5, padding: "3px 9px", cursor: running ? "wait" : "pointer", whiteSpace: "nowrap" }}>{running ? "running…" : "▶ run"}</button>
        <button onClick={() => void load()} disabled={running} title="re-read coverage/lcov.info + gravity metrics" style={{ fontFamily: mono, fontSize: 11, background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 5, padding: "2px 7px", cursor: "pointer" }}>↻</button>
      </div>

      {running && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.warn, marginBottom: 8 }}>◆ running your coverage command in the sandbox… (this runs the real suite, it can take a while)</div>}
      {cov?.run_error && <div style={{ fontFamily: mono, fontSize: 9, color: C.bad, marginBottom: 8, wordBreak: "break-all" }}>run: {cov.run_error}</div>}

      {loading && !cov ? (
        <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>reading coverage…</div>
      ) : !hasReport ? (
        <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.7 }}>{cov?.error ?? "no coverage report yet."}<br /><span style={{ color: C.dim }}>Set your coverage command above and press ▶ run — anything that emits <code>coverage/lcov.info</code> (c8, nyc, jest --coverage, vitest --coverage, coverage.py→lcov).</span></div>
      ) : (
        <>
          {/* ── GRADE STRIP */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 12px", background: C.panel2, borderRadius: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 42, height: 42, borderRadius: 8, display: "grid", placeItems: "center", background: C.bg, border: `2px solid ${tone(totalPct ?? 0)}` }}>
                <span style={{ fontFamily: mono, fontSize: 22, fontWeight: 800, color: tone(totalPct ?? 0) }}>{totalPct != null ? grade(totalPct) : "—"}</span>
              </div>
              <Stat label="line coverage" value={totalPct != null ? `${totalPct}%` : "—"} color={tone(totalPct ?? 0)} />
            </div>
            <div style={{ width: 1, height: 30, background: C.border }} />
            <Stat label="lines run / total" value={`${x.hit.toLocaleString()} / ${x.total.toLocaleString()}`} />
            <Stat label="files" value={cov?.count ?? 0} />
            <Stat label="fully covered" value={x.full} color={C.ok} />
            <Stat label="0% files" value={x.untested} color={x.untested ? C.bad : C.dim} />
            <Stat label="blind spots" value={x.blind.length} color={x.blind.length ? C.bad : C.dim} />
          </div>

          {/* ── DISTRIBUTION */}
          <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>distribution — files per coverage band</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 66, marginBottom: 14 }}>
            {x.bands.map((n, i) => (
              <div key={i} title={`${n} file${n === 1 ? "" : "s"} at ${BANDS[i].l} coverage`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: n ? C.fg : C.dim }}>{n}</span>
                <div style={{ width: "100%", height: Math.max(2, (n / bandMax) * 44), background: BANDS[i].c, opacity: n ? 0.85 : 0.25, borderRadius: "2px 2px 0 0" }} />
                <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{BANDS[i].l}</span>
              </div>
            ))}
          </div>

          {/* ── RISK SCATTER: gravity (mass) × coverage. bottom-right = heavy + untested = danger. */}
          {x.pts.length > 0 && (
            <>
              <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>risk map — mass × coverage</div>
              <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginBottom: 4 }}>each dot a file · size = gravity mass · ↓right = heavy &amp; untested = the danger zone</div>
              <svg width={SW} height={SH} style={{ display: "block", background: C.bg, borderRadius: 8, marginBottom: 14 }}>
                {/* danger zone: high mass (right half) + low coverage (bottom half) */}
                <rect x={sx(x.gMax * 0.25)} y={sy(50)} width={SW - PR - sx(x.gMax * 0.25)} height={sy(0) - sy(50)} fill={C.bad} opacity={0.07} />
                <text x={SW - PR - 4} y={sy(0) - 5} textAnchor="end" style={{ fontFamily: mono, fontSize: 8, fill: C.bad, opacity: 0.7 }}>danger</text>
                {/* axes */}
                <line x1={PL} y1={PT} x2={PL} y2={PT + plotH} stroke={C.border} strokeWidth={1} />
                <line x1={PL} y1={PT + plotH} x2={SW - PR} y2={PT + plotH} stroke={C.border} strokeWidth={1} />
                <line x1={PL} y1={sy(50)} x2={SW - PR} y2={sy(50)} stroke={C.border} strokeWidth={0.5} strokeDasharray="2 3" opacity={0.5} />
                <text x={2} y={sy(100) + 3} style={{ fontFamily: mono, fontSize: 8, fill: C.dim }}>100%</text>
                <text x={2} y={sy(0) + 2} style={{ fontFamily: mono, fontSize: 8, fill: C.dim }}>0%</text>
                <text x={PL + 2} y={PT + plotH + 15} style={{ fontFamily: mono, fontSize: 8, fill: C.dim }}>light</text>
                <text x={SW - PR} y={PT + plotH + 15} textAnchor="end" style={{ fontFamily: mono, fontSize: 8, fill: C.dim }}>heavy mass →</text>
                {x.pts.map((p, i) => {
                  const risk = Math.sqrt(p.gravity / x.gMax) * (1 - p.pct / 100);
                  const col = risk > 0.42 ? C.bad : risk > 0.2 ? C.warn : C.ok;
                  const r = 2.4 + Math.sqrt(p.gravity / x.gMax) * 5.5;
                  return (
                    <circle key={i} cx={sx(p.gravity)} cy={sy(p.pct)} r={r} fill={col} opacity={0.62} stroke={col} strokeWidth={0.5}
                      style={{ cursor: onOpen ? "pointer" : "default" }} onClick={() => onOpen?.(p.path)}>
                      <title>{`${p.path}\n${p.pct}% covered · gravity ${p.gravity} · fan-in ${p.fan_in}`}</title>
                    </circle>
                  );
                })}
              </svg>
            </>
          )}

          {/* ── RISKIEST GAPS: ranked by mass×(1−coverage) — the untested code that hurts most */}
          <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>riskiest gaps — heavy &amp; undertested</div>
          <div style={{ marginBottom: 14 }}>
            {x.gaps.slice(0, 15).map((g, i) => (
              <div key={g.path} onClick={() => onOpen?.(g.path)} title={`${g.path} — ${g.hit}/${g.total} lines · click to open`}
                style={{ display: "grid", gridTemplateColumns: "16px 1fr 96px 40px", gap: 8, alignItems: "center", padding: "2px 0", cursor: onOpen ? "pointer" : "default" }}>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textAlign: "right" }}>{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <code style={{ fontFamily: mono, fontSize: 10, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{baseName(g.path)}</code>
                  <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                    {[g.fan_in >= 3 ? `${g.fan_in} import it` : null, g.complexity && g.complexity >= 10 ? `cyclomatic ${g.complexity}` : null, `${g.loc} LOC`].filter(Boolean).join(" · ")}
                  </span>
                </div>
                {/* risk bar (relative to the worst gap) */}
                <div title={`risk = mass × (1 − coverage)`} style={{ height: 5, background: C.panel2, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(4, (g.riskRaw / x.riskMax) * 100)}%`, height: "100%", background: C.bad }} />
                </div>
                <span style={{ fontFamily: mono, fontSize: 10, color: tone(g.pct), textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{g.pct}%</span>
              </div>
            ))}
            {x.gaps.length === 0 && <div style={{ fontFamily: mono, fontSize: 10, color: C.ok }}>no gaps — every reported file is fully covered.</div>}
          </div>

          {/* ── BLIND SPOTS: heavy files the suite never executes (invisible to coverage) */}
          {x.blind.length > 0 && (
            <>
              <div style={{ fontFamily: mono, fontSize: 9, color: C.bad, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>⚠ blind spots — heavy code no test ever runs</div>
              <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginBottom: 4 }}>high-mass files absent from the coverage report entirely — the suite never touches them</div>
              <div>
                {x.blind.map((b) => (
                  <div key={b.path} onClick={() => onOpen?.(b.path)} title={`${b.path} · gravity ${b.gravity} · fan-in ${b.fan_in} · click to open`}
                    style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: "2px 0", cursor: onOpen ? "pointer" : "default" }}>
                    <code style={{ fontFamily: mono, fontSize: 10, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{baseName(b.path)}</code>
                    <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, whiteSpace: "nowrap" }}>gravity {b.gravity} · {b.fan_in} import it</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {!mets && <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginTop: 8 }}>gravity metrics unavailable — ranking by coverage only (rebuild the atlas for the mass×coverage risk join)</div>}
        </>
      )}
    </div>
  );
}
