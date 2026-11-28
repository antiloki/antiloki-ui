// ConstitutionPanel — the ENGINEERING INTELLIGENCE surface, a SPLIT PANEL inside
// the Code & Design rebuild (operator 2026-07-17: "do all the things at this
// screen", consolidating the retired ultra screen's analysis here). The
// deterministic engine runs as a rebuild phase; this reads the snapshot:
//   MODEL   engineering health + axes + determinism + AI-readability (counted).
//   LAWS    violations by law, worst spots decomposed to the laws they break,
//           the dossier (axes + provenance + on-demand AI insight).
//   MAP     the knowledge map (hotspots · bus-factor · god modules · islands ·
//           hidden complexity), hidden couplings, duplication, cross-analysis.
//   BOOK    the 6-scope law book (ratify · suspend · author).
// The AI (brief + per-spot insights) is on-demand, never a rebuild side effect.
import * as React from "react";
import { apiPost } from "@/loki/api/client";
import { C } from "@/loki/theme";
import { useShellMaybe } from "@/loki/shell/slug-context";
import { ScoringGuideButton } from "./atlas-decorators";
import { LawBuilder } from "./law-builder";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
const SCOPES = ["business", "architecture", "project", "framework", "community", "language"] as const;
const SCOPE_TONE: Record<string, string> = { business: C.bad, architecture: C.brand, project: C.ok, framework: C.warn, community: C.brand, language: C.dim, code: C.ok };
const SEV_TONE: Record<string, string> = { critical: C.bad, error: C.bad, warn: C.warn, info: C.dim };
const AXES = ["compliance", "defects", "tests", "structure", "coupling", "cohesion", "change"] as const;
const EFFORT_TONE: Record<string, string> = { S: C.ok, M: C.warn, L: C.bad };
const tnum: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };
const lbl: React.CSSProperties = { fontFamily: mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: C.dim, margin: "0 0 6px" };
const card: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, padding: "10px 12px" };
const chip: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: "1px 7px" };

async function dispatch(action: string, input: any, timeoutMs = 30000): Promise<any> {
  const r: any = await apiPost(`/api/v1/dispatch`, { action_name: action, input }, { timeoutMs });
  return r?.result?.result ?? r?.result ?? r;
}
function tone(v: number | null | undefined): string {
  if (v == null) return C.dim;
  if (v >= 70) return `color-mix(in oklab, ${C.ok} ${Math.round(((v - 70) / 30) * 100)}%, ${C.warn})`;
  return `color-mix(in oklab, ${C.warn} ${Math.round((v / 70) * 100)}%, ${C.bad})`;
}
const short = (p: string) => p.split("/").slice(-2).join("/");
function AxisBar({ ax, v }: { ax: string; v: number | null | undefined }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: mono, fontSize: 9, padding: "1px 0" }}>
      <span style={{ width: 72, color: C.dim }}>{ax}</span>
      <div style={{ flex: 1, height: 6, background: `color-mix(in oklab, ${C.border} 45%, transparent)`, borderRadius: 3, overflow: "hidden" }} title={v == null ? `${ax}: no signal` : `${ax}: ${v}/100`}>{v != null && <div style={{ width: `${v}%`, height: "100%", background: tone(v) }} />}</div>
      <b style={{ width: 22, textAlign: "right", color: v == null ? C.dim : C.fg, ...tnum }}>{v ?? "—"}</b>
    </div>
  );
}
const kicker: React.CSSProperties = { fontFamily: mono, fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 2px" };

export function ConstitutionPanel({ filePath = null }: { filePath?: string | null }) {
  const [report, setReport] = React.useState<any | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [book, setBook] = React.useState(false); // the law book — a modal control center (tabs dropped 2026-07-18)
  React.useEffect(() => { if (!book) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setBook(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [book]);
  const [sel, setSel] = React.useState<string | null>(null);
  const [prov, setProv] = React.useState<any | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const setAiCallId = useShellMaybe()?.setAiCallId ?? (() => {});   // framed on its own (the X-ray embed has no shell around it), the panel just does not report its AI call

  const load = React.useCallback(async () => {
    try {
      const d = await dispatch("system.constitution.report", {});
      if (!d || !("constitution" in d)) throw new Error(d?.message ?? "unavailable — rebuild the codebase (the constitution judges as a rebuild phase)");
      setReport(d); setError(null);
    } catch (e: any) { setError(String(e?.message ?? "failed").slice(0, 200)); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    let alive = true; setProv(null);
    if (!sel) return;
    void (async () => { try { const d = await dispatch("system.constitution.provenance", { path: sel }); if (alive && d?.path) setProv(d); } catch { /* advisory */ } })();
    return () => { alive = false; };
  }, [sel]);

  const act = async (k: string, fn: () => Promise<any>) => {
    if (busy) return; setBusy(k);
    try { await fn(); await load(); } catch (e: any) { setError(String(e?.message ?? "failed").slice(0, 200)); }
    setBusy(null);
  };
  // AI actions: run, OPEN the AI-call window (envelope), and surface the result (count · cost · error).
  const actAI = async (k: string, label: string, fn: () => Promise<any>) => {
    if (busy) return; setBusy(k); setNote(null);
    try {
      const r = await fn();
      if (r?.ai_call_id != null) setAiCallId(r.ai_call_id);
      const bits: string[] = [];
      if (r?.proposed != null) bits.push(`${r.proposed} ${label}${r.proposed === 1 ? "" : "s"} proposed`);
      if (r?.made != null) bits.push(`${r.made} insight${r.made === 1 ? "" : "s"}`);
      if (r?.ok === true && r?.proposed == null) bits.push("brief ready");
      if (r?.cost_usd) bits.push(`$${Number(r.cost_usd).toFixed(4)}`);
      if (r?.error) bits.push(`⚠ ${r.error}`);
      else if (r?.proposed === 0) bits.push("— the model returned no usable laws; open the call to see why, then retry");
      setNote(`◆ ${bits.join(" · ") || "done"}`);
      await load();
    } catch (e: any) { setError(String(e?.message ?? "failed").slice(0, 200)); }
    setBusy(null);
  };

  const s = report?.summary;
  const con = report?.constitution;
  const worst: any[] = (report?.worst ?? []).filter((w: any) => w.kind === "file");
  const insights: Record<string, any> = report?.insights ?? {};
  const selW = sel ? worst.find((w) => w.path === sel) ?? null : null;

  // ONE clean flow (operator 2026-07-18: no tabs, no boxes) — sections divided by
  // hairline kickers; the law BOOK is a modal control center behind ⚖.
  const secH: React.CSSProperties = { fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1.1, borderBottom: `1px solid ${C.border}`, paddingBottom: 3, margin: "6px 0 6px", display: "flex", alignItems: "center", gap: 6 };
  return (
    <div style={{ height: "100%", overflow: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.brand, fontWeight: 700 }}>§ constitution</span>
        <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>counted, advisory</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setBook(true)} style={{ ...chip, color: C.brand, borderColor: C.brand }} title="the law book — packs · catalog · candidates · custom laws · linters">⚖ book</button>
        <button onClick={() => void load()} style={{ ...chip, color: C.muted }}>↻</button>
      </div>

      {error && <div style={{ fontFamily: mono, fontSize: 10, color: C.bad }}>{error}</div>}
      {con && (con.counts?.ratified ?? 0) === 0 && !error && (
        <div style={{ fontFamily: mono, fontSize: 10, color: C.warn, display: "flex", gap: 8, alignItems: "center" }}>
          no laws yet — <button onClick={() => void act("seed", () => dispatch("system.constitution.law", { op: "seed" }))} style={{ ...chip, color: C.ok }}>{busy === "seed" ? "…" : "seed"}</button> then rebuild
        </div>
      )}
      {!s && !error && <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, fontStyle: "italic" }}>no snapshot yet — ↻ rebuild the codebase; the constitution judges as a rebuild phase.</span>}
      {note && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.brand, display: "flex", gap: 8, alignItems: "center" }}>{note}<span style={{ flex: 1 }} /><button onClick={() => setNote(null)} style={{ ...chip, fontSize: 8, color: C.muted, border: "none" }}>✕</button></div>}

      {/* the headline — one quiet line, not tiles */}
      {s && (
        <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline", ...tnum }}>
          <span title="the average of the judge's per-file law-compliance scores; the Overview's health is a different, structural measure">law health <b style={{ color: tone(s.health), fontSize: 15 }}>{s.health ?? "—"}</b></span>
          <span>compliance <b style={{ color: tone(s.compliance) }}>{s.compliance ?? "—"}</b></span>
          <span>determinism <b style={{ color: tone(s.determinism) }}>{s.determinism != null ? `${s.determinism}%` : "—"}</b></span>
          <span>ai-read <b style={{ color: tone(s.ai_readability) }}>{s.ai_readability ?? "—"}</b></span>
          <span>violations <b style={{ color: s.violations ? C.warn : C.ok }}>{s.violations}</b></span>
          <span>{s.files} files · {s.carried} cached</span>
        </div>
      )}

      {/* ── ONE FLOW: axes → deltas → brief → laws → worst → map ── */}
      {s && (
        <>
          <div style={secH}><span>axes — two kinds</span><span style={{ flex: 1 }} /><ScoringGuideButton /></div>
          <div>
            <div style={{ ...kicker, color: C.brand }}>⚖ law-based</div>
            <AxisBar ax="compliance" v={s.axes_avg?.compliance} />
            {(report.by_category ?? []).length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "3px 0 7px 80px" }}>
                {report.by_category.map((c: any) => (
                  <span key={c.category} title={`${c.active_laws} law${c.active_laws === 1 ? "" : "s"} · ${c.violations} violation${c.violations === 1 ? "" : "s"}`}
                    style={{ fontFamily: mono, fontSize: 7.5, color: tone(c.score), border: `1px solid color-mix(in oklab, ${tone(c.score)} 40%, ${C.border})`, borderRadius: 3, padding: "0 4px", ...tnum }}>{c.category} {c.score}</span>
                ))}
              </div>
            )}
            <div style={{ ...kicker, color: C.dim, marginTop: 3 }}>📊 measured</div>
            {AXES.filter((ax) => ax !== "compliance").map((ax) => <AxisBar key={ax} ax={ax} v={s.axes_avg?.[ax]} />)}
          </div>
          {report.deltas && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontFamily: mono, fontSize: 9 }}>
              <span style={{ color: C.dim }}>since #{report.deltas.from_snapshot}</span>
              {report.deltas.health != null && <b style={{ color: report.deltas.health > 0 ? C.ok : report.deltas.health < 0 ? C.bad : C.dim }}>{report.deltas.health > 0 ? "▲ +" : report.deltas.health < 0 ? "▼ " : "= "}{report.deltas.health !== 0 ? report.deltas.health : "no change"}</b>}
              {(report.deltas.worse ?? []).slice(0, 3).map((d: any) => <button key={d.path} onClick={() => setSel(d.path)} style={{ ...chip, fontSize: 8, color: C.bad, borderColor: `color-mix(in oklab, ${C.bad} 40%, ${C.border})` }}>{short(d.path)} {d.from}→{d.to}</button>)}
            </div>
          )}
          <div>
            <div style={{ ...secH, display: "flex", alignItems: "center" }}>the brief
              <span style={{ flex: 1 }} />
              <button onClick={() => void actAI("brief", "", () => dispatch("system.constitution.brief", {}, 600000))} style={{ ...chip, color: C.brand, borderColor: C.brand, textTransform: "none", letterSpacing: 0 }} title="ONE high-tier synthesis over the whole model — spends AI, on-demand; opens the AI-call window">{busy === "brief" ? "◆ synthesizing…" : "◆ generate"}</button>
            </div>
            {report.brief ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ display: "inline-flex", width: "fit-content", fontFamily: mono, fontSize: 7, fontWeight: 700, textTransform: "uppercase", color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 3, padding: "0 4px" }} title={`grounded claim — ${report.brief.model}`}>grounded claim {String(report.brief.model ?? "").split("/").pop()}</span>
                <div style={{ fontFamily: '"Iowan Old Style", Georgia, serif', fontSize: 13, color: C.fg }}>{report.brief.headline}</div>
                <div style={{ fontFamily: mono, fontSize: 9, lineHeight: 1.6, color: C.muted }}>{report.brief.state_md}</div>
                {(report.brief.moves ?? []).map((m: any, i: number) => (
                  <div key={i} style={{ borderLeft: `2px solid ${EFFORT_TONE[m.effort] ?? C.dim}`, paddingLeft: 7 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                      <b style={{ fontFamily: mono, fontSize: 9.5, color: C.fg }}>{i + 1}. {m.title}</b>
                      <span style={{ fontFamily: mono, fontSize: 7, color: EFFORT_TONE[m.effort] ?? C.dim, border: `1px solid ${EFFORT_TONE[m.effort] ?? C.border}`, borderRadius: 2, padding: "0 4px" }}>{m.effort}</span>
                      <span style={{ fontFamily: mono, fontSize: 8, color: C.brand }}>{m.gain}</span>
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>{m.why}</div>
                  </div>
                ))}
              </div>
            ) : <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, fontStyle: "italic" }}>generate the executive brief — one synthesis over the whole deterministic model (headline · state · ranked moves).</span>}
          </div>

          <div>
            <div style={secH}>violations by law <span style={{ textTransform: "none", letterSpacing: 0, color: C.muted }}>— weight × count</span></div>
            {(report.by_law ?? []).length ? (report.by_law ?? []).slice(0, 12).map((l: any) => {
              const max = Math.max(1, ...(report.by_law ?? []).map((x: any) => x.mass));
              return (
                <div key={l.law_key} title={l.title} style={{ display: "flex", gap: 7, alignItems: "center", fontFamily: mono, fontSize: 9, padding: "1px 0" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: SCOPE_TONE[l.scope] ?? C.dim, flexShrink: 0 }} />
                  <span style={{ width: 150, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.law_key}</span>
                  <div style={{ flex: 1, height: 6, background: `color-mix(in oklab, ${C.border} 45%, transparent)`, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${(l.mass / max) * 100}%`, height: "100%", background: SCOPE_TONE[l.scope] ?? C.brand }} /></div>
                  <b style={{ width: 22, textAlign: "right", color: C.fg, ...tnum }}>{l.n}</b>
                </div>
              );
            }) : <span style={{ fontFamily: mono, fontSize: 10, color: C.ok, fontStyle: "italic" }}>zero violations — the codebase obeys its constitution.</span>}
          </div>
          <div>
            <div style={{ ...secH, display: "flex", alignItems: "center" }}>worst spots <span style={{ textTransform: "none", letterSpacing: 0, color: C.muted }}>— by health × blast radius</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => void actAI("ins", "", () => dispatch("system.constitution.insights", { max_spots: 12, escalate_top: 3 }, 600000))} style={{ ...chip, color: C.brand, borderColor: C.brand, textTransform: "none", letterSpacing: 0 }} title="one low-tier agent per worst spot — on-demand (each grounded, parse-or-drop)">{busy === "ins" ? "◆ …" : "◆ AI insights"}</button>
            </div>
            {worst.length ? worst.slice(0, 18).map((w) => (
              <div key={w.path} onClick={() => setSel(w.path === sel ? null : w.path)} style={{ display: "flex", gap: 7, alignItems: "baseline", fontFamily: mono, fontSize: 9, padding: "2px 0", cursor: "pointer", borderBottom: `1px solid color-mix(in oklab, ${C.border} 40%, transparent)`, background: sel === w.path ? `color-mix(in oklab, ${C.brand} 7%, transparent)` : "transparent" }}>
                <b style={{ color: tone(w.health), width: 18, ...tnum }} title="engineering health">{w.health}</b>
                <span style={{ color: w.score < 100 ? C.warn : C.dim, width: 18, ...tnum }} title="law compliance">{w.score}</span>
                {insights[w.path] && <span style={{ color: C.brand, fontSize: 7 }}>◆</span>}
                {w.archetype === "glue" && <span style={{ color: C.dim, fontSize: 6.5, border: `1px solid ${C.border}`, borderRadius: 2, padding: "0 3px" }} title="glue (re-export/constants/types) — scored only on laws + defects">glue</span>}
                <span style={{ color: C.muted, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", textAlign: "left" }} title={w.path}>{w.path}</span>
                <span style={{ color: C.dim, fontSize: 8 }}>{Object.keys(w.breakdown ?? {}).length} laws</span>
              </div>
            )) : <span style={{ fontFamily: mono, fontSize: 10, color: C.ok, fontStyle: "italic" }}>every file passes.</span>}
          </div>
          {selW && <Dossier w={selW} prov={prov} insight={insights[selW.path]} act={act} />}

          <Knowledge k={s.knowledge} onPick={(p: string) => setSel(p)} />
          {(s.co_change ?? []).length > 0 && (
            <div>
              <div style={secH}>hidden couplings <span style={{ textTransform: "none", letterSpacing: 0, color: C.muted }}>— co-change, no import edge</span></div>
              {s.co_change.slice(0, 8).map((c: any, i: number) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "baseline", fontFamily: mono, fontSize: 8.5, padding: "1px 0" }} title={`changed together ${c.count}× with no import between them`}>
                  <b style={{ color: C.warn, width: 20, ...tnum }}>×{c.count}</b>
                  <span style={{ color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{short(c.a)} ↔ {short(c.b)}</span>
                </div>
              ))}
            </div>
          )}
          {(report.duplication ?? []).length > 0 && (
            <div>
              <div style={secH}>duplication <span style={{ textTransform: "none", letterSpacing: 0, color: C.muted }}>— high symbol overlap, $0</span></div>
              {report.duplication.slice(0, 8).map((d: any, i: number) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "baseline", fontFamily: mono, fontSize: 8.5, padding: "1px 0" }} title={`${d.shared} shared symbols · Jaccard ${d.jaccard}`}>
                  <b style={{ color: C.brand, width: 30, ...tnum }}>{Math.round(d.jaccard * 100)}%</b>
                  <span style={{ color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{short(d.a)} ≈ {short(d.b)}</span>
                </div>
              ))}
            </div>
          )}
          {(report.cross ?? []).length > 0 && (
            <div>
              <div style={secH}>cross-analysis <span style={{ textTransform: "none", letterSpacing: 0, color: C.muted }}>— correlations, n shown</span></div>
              {report.cross.map((c: any, i: number) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "baseline", fontFamily: mono, fontSize: 8.5, padding: "1px 0" }} title={c.note}>
                  <b style={{ width: 40, color: Math.abs(c.r) >= 0.5 ? C.warn : C.dim, ...tnum }}>r={c.r}</b>
                  <span style={{ color: C.muted, flex: 1 }}>{c.name}</span>
                  <span style={{ color: C.dim }}>n={c.n}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ⚖ THE LAW BOOK — a modal control center (packs · linters · catalog · candidates · custom laws) */}
      {book && con && (
        <div onClick={() => setBook(false)} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(880px, 96vw)", maxHeight: "90vh", overflow: "auto", background: C.panel, border: `1px solid color-mix(in oklab, ${C.brand} 22%, ${C.border})`, borderRadius: 15, boxShadow: "0 24px 70px -12px rgba(0,0,0,.7)" }}>
            <div style={{ position: "sticky", top: 0, zIndex: 2, background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 700, color: C.fg }}>⚖ The law book</span>
              <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{con.counts?.ratified ?? 0} ratified · {con.counts?.candidate ?? 0} candidate · {con.counts?.suspended ?? 0} suspended</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => void act("reseed", () => dispatch("system.constitution.law", { op: "seed" }))} title="restore the default seed laws — re-inserts any that were removed (never touches your own laws)"
                style={{ ...chip, color: C.ok, borderColor: `color-mix(in oklab, ${C.ok} 40%, ${C.border})`, textTransform: "none", letterSpacing: 0 }}>{busy === "reseed" ? "…" : "⟲ seed defaults"}</button>
              <button onClick={() => setBook(false)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 11 }}>✕ esc</button>
            </div>
            <div style={{ padding: "12px 16px" }}>
              <LawBook con={con} act={act} actAI={actAI} busy={busy} linters={report?.linters ?? []} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Knowledge({ k, onPick }: { k: any; onPick: (p: string) => void }) {
  if (!k) return null;
  const row = (name: string, items: any[], fmt: (x: any) => string, pick: (x: any) => string, tint: string = C.fg) => items?.length ? (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, marginBottom: 1 }}>{name}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{items.slice(0, 6).map((x, i) => <button key={i} onClick={() => onPick(pick(x))} style={{ ...chip, color: tint, fontSize: 8, padding: "0 5px" }}>{fmt(x)}</button>)}</div>
    </div>
  ) : null;
  return (
    <div style={card}>
      <div style={lbl}>the knowledge map</div>
      {row("hotspots (churn × complexity)", k.hotspots, (h) => short(h.path), (h) => h.path, C.warn)}
      {row("bus-factor 1 (single author, depended-on)", k.bus_factor, (b) => short(b.path), (b) => b.path, C.bad)}
      {row("god modules", (k.god_modules ?? []).map((p: string) => ({ path: p })), (g) => short(g.path), (g) => g.path, C.warn)}
      {row("islands (disconnected)", (k.islands ?? []).map((p: string) => ({ path: p })), (g) => short(g.path), (g) => g.path, C.dim)}
      {row("hidden complexity (simple-looking, deep deps)", k.hidden_complexity, (h) => `${short(h.path)} →${h.transitive}`, (h) => h.path, C.brand)}
      {!(k.hotspots?.length || k.bus_factor?.length || k.god_modules?.length || k.islands?.length || k.hidden_complexity?.length) && <span style={{ fontFamily: mono, fontSize: 9, color: C.ok, fontStyle: "italic" }}>no concentration or hidden-complexity risks detected.</span>}
    </div>
  );
}

function Dossier({ w, prov, insight, act }: { w: any; prov: any; insight: any; act: any }) {
  return (
    <div style={{ ...card, borderColor: `color-mix(in oklab, ${C.brand} 35%, ${C.border})` }}>
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.brand, wordBreak: "break-all", marginBottom: 4 }}>{w.path} <span style={{ color: tone(w.health) }}>· health {w.health}</span> <span style={{ color: w.score < 100 ? C.warn : C.dim }}>· compliance {w.score}</span></div>
      {/* the engineering axes for THIS unit */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 5 }}>
        {AXES.map((ax) => { const a = w.axes?.[ax]; return a ? <span key={ax} style={{ fontFamily: mono, fontSize: 7.5, color: C.dim }}>{ax} <b style={{ color: tone(a.score) }}>{a.score}</b></span> : null; })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3, fontFamily: mono, fontSize: 7.5, color: C.muted, ...tnum, marginBottom: 5 }}>
        <span>loc {w.loc ?? "—"}</span><span>cx {w.complexity ?? "—"}</span><span>fan-in {w.fan_in ?? "—"}</span>
        <span>transitive {w.transitive ?? "—"}</span><span>churn {w.churn ?? "—"}</span><span>authors {w.authors ?? "—"}</span>
      </div>
      {/* the law violations — the proof chain */}
      {(w.violations ?? []).map((v: any, i: number) => (
        <div key={i} style={{ borderLeft: `2px solid ${SCOPE_TONE[v.law_scope] ?? C.dim}`, paddingLeft: 7, marginBottom: 3 }} title={`evidence → ${v.law_key} (${v.law_scope}) → w${v.weight}×conf${v.confidence ?? 1} → penalty`}>
          <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap", fontFamily: mono, fontSize: 8.5 }}>
            {v.severity && <span style={{ color: SEV_TONE[v.severity] ?? C.dim, fontSize: 7 }}>{v.severity}</span>}
            <b style={{ color: C.fg }}>{v.law_key}</b>
            <span style={{ color: C.dim, fontSize: 7.5 }}>{v.law_scope} · w{v.weight}{v.confidence != null && v.confidence < 1 ? `×${v.confidence}` : ""}{v.line != null ? ` · L${v.line}` : ""}</span>
            <span style={{ flex: 1 }} />
            {(["fixed", "dismissed", "known"] as const).map((cl) => (
              <button key={cl} onClick={() => void act(`c-${i}-${cl}`, () => dispatch("system.constitution.classify", { op: "classify", law_key: v.law_key, path: w.path, class: cl }))} title={`classify ${cl} — feeds learned weights`} style={{ ...chip, padding: "0 4px", fontSize: 7, color: cl === "fixed" ? C.ok : cl === "dismissed" ? C.dim : C.muted }}>{cl[0]}</button>
            ))}
          </div>
          {v.evidence && <div style={{ fontFamily: mono, fontSize: 7.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>«{v.evidence}»</div>}
        </div>
      ))}
      {/* the AI insight */}
      {insight && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 5, marginTop: 3 }}>
          <span style={{ display: "inline-flex", fontFamily: mono, fontSize: 7, fontWeight: 700, textTransform: "uppercase", color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 2, padding: "0 4px", marginBottom: 3 }} title={`grounded claim — ${insight.model}`}>grounded claim</span>
          <div style={{ fontFamily: mono, fontSize: 8.5, lineHeight: 1.5, color: C.fg }}>{insight.insight}</div>
          {insight.fix_sketch && <div style={{ fontFamily: mono, fontSize: 8, lineHeight: 1.5, color: C.brand }}>→ {insight.fix_sketch}</div>}
        </div>
      )}
      {/* the provenance chain — root cause as data */}
      {prov && (prov.cards?.length > 0 || prov.commits?.length > 0) && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 5, marginTop: 3 }}>
          <div style={{ fontFamily: mono, fontSize: 7.5, textTransform: "uppercase", letterSpacing: 1, color: C.dim, marginBottom: 2 }}>how it got this way</div>
          {(prov.cards ?? []).map((c: any) => (
            <div key={c.slug} style={{ borderLeft: `2px solid ${C.brand}`, paddingLeft: 6, marginBottom: 2 }}>
              <div style={{ fontFamily: mono, fontSize: 8, color: C.brand }}>{c.slug} <span style={{ color: C.dim }}>· {c.status}</span></div>
              {c.why && <div style={{ fontFamily: mono, fontSize: 7.5, color: C.muted }}>why: {c.why}</div>}
            </div>
          ))}
          {(prov.commits ?? []).slice(0, 3).map((c: any) => (
            <div key={c.sha} style={{ display: "flex", gap: 5, fontFamily: mono, fontSize: 7.5, color: C.dim }}>
              <span style={tnum}>{c.sha}</span><span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject}</span>
            </div>
          ))}
          {!(prov.cards ?? []).length && <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, fontStyle: "italic" }}>no card slug in these commits — the chain starts at the commit</span>}
        </div>
      )}
    </div>
  );
}

function LawBook({ con, act, actAI, busy, linters }: { con: any; act: any; actAI: any; busy: string | null; linters?: any[] }) {
  const laws: any[] = con.laws ?? [];
  const candidates = laws.filter((l) => l.status === "candidate");
  const [catalog, setCatalog] = React.useState<any[] | null>(null);
  const [builder, setBuilder] = React.useState(false);
  const [fork, setFork] = React.useState<any | null>(null); // clone-of-a-law → the editor opens prefilled; the original stays intact
  const [packs, setPacks] = React.useState<any[] | null>(null);
  const [tech, setTech] = React.useState("");
  const loadPacks = React.useCallback(async () => { try { const d = await dispatch("system.constitution.packs", { op: "list" }); setPacks(d.packs ?? []); } catch { /* */ } }, []);
  React.useEffect(() => { void loadPacks(); }, [loadPacks]);
  const openCatalog = async () => { try { const d = await dispatch("system.constitution.law", { op: "catalog" }); setCatalog(d.catalog ?? []); } catch { /* */ } };
  const catByScope = (sc: string) => (catalog ?? []).filter((c) => c.scope === sc || (sc === "project" && c.scope === "code"));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {(builder || fork) && <LawBuilder key={fork ? `fork-${fork.title}` : "new"} initial={fork ?? undefined} onClose={() => { setBuilder(false); setFork(null); }} onCreated={() => void act("custom", async () => {})} />}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => void act("mine", () => dispatch("system.constitution.mine", { folder: "." }, 120000))} style={{ ...chip, color: C.warn, borderColor: C.warn }}>{busy === "mine" ? "⛏ mining…" : "⛏ mine house rules"}</button>
        <button onClick={() => (catalog ? setCatalog(null) : void openCatalog())} style={{ ...chip, color: catalog ? C.brand : C.muted, borderColor: catalog ? C.brand : C.border }}>{catalog ? "✕ close catalog" : "＋ add from catalog"}</button>
        <button onClick={() => setBuilder(true)} style={{ ...chip, color: C.brand, borderColor: C.brand }}>✎ build a custom law</button>
      </div>

      {/* ENGINEERING PACKS — named law collections that auto-activate from the workspace stack */}
      {packs && packs.length > 0 && (
        <div style={card}>
          <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 6 }}><span>engineering packs <span style={{ textTransform: "none", letterSpacing: 0, color: C.muted }}>— named law collections</span></span><span style={{ flex: 1 }} />
            {/* IDEMPOTENT-POSITIVE: enables every inactive pack, NEVER toggles an active one off
                (the toggle trap deleted the seed laws — active packs read "disable" and "enable all" clicks removed them) */}
            <button onClick={() => void act("pk-all", async () => { for (const p of (packs ?? []).filter((x: any) => !x.active)) await dispatch("system.constitution.packs", { op: "enable", id: p.id }); await loadPacks(); })}
              style={{ ...chip, fontSize: 7.5, color: C.ok, borderColor: `color-mix(in oklab, ${C.ok} 40%, ${C.border})`, textTransform: "none", letterSpacing: 0 }} title="enable every pack that is off — never disables anything">{busy === "pk-all" ? "…" : "enable all"}</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 4 }}>
            {packs.map((p) => {
              const on = p.active > 0;
              const busyKey = `pk-${p.id}`;
              return (
                <div key={p.id} title={`${p.desc}${p.auto ? ` · auto-activates (${p.trigger})` : ""} — ${p.active} active${p.inactive ? ` · ${p.inactive} off` : ""}${p.available ? ` · ${p.available} available` : ""}`}
                  style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${on ? `color-mix(in oklab, ${C.ok} 30%, ${C.border})` : C.border}`, borderRadius: 5, padding: "2px 7px", minWidth: 0 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 5, background: on ? C.ok : p.compatible ? C.brand : C.dim, flexShrink: 0 }} />
                  <b style={{ fontFamily: mono, fontSize: 8.5, color: C.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</b>
                  {p.auto && <span style={{ fontFamily: mono, fontSize: 6.5, color: C.brand, flexShrink: 0 }}>auto</span>}
                  <span style={{ fontFamily: mono, fontSize: 7, color: C.dim, flexShrink: 0, ...tnum }}>{p.active}/{p.total}</span>
                  <span style={{ flex: 1 }} />
                  {/* STATE and ACTION are separate (the toggle trap): active = a state word + a
                      small explicit ✕remove; inactive = a clear enable. Never an ambiguous toggle. */}
                  {on ? (<>
                    <span style={{ fontFamily: mono, fontSize: 7, color: C.ok, flexShrink: 0 }}>active</span>
                    <button disabled={!!busy} onClick={() => void act(busyKey, async () => { await dispatch("system.constitution.packs", { op: "disable", id: p.id }); await loadPacks(); })}
                      title="⚠ removes this pack's laws from the book (re-enable restores them; laws YOU authored are kept, suspended)"
                      style={{ ...chip, fontSize: 7, padding: "0 4px", color: C.dim, border: "none", opacity: busy && busy !== busyKey ? 0.35 : 0.8, flexShrink: 0 }}>{busy === busyKey ? "…" : "✕"}</button>
                  </>) : (
                    <button disabled={!!busy} onClick={() => void act(busyKey, async () => { await dispatch("system.constitution.packs", { op: "enable", id: p.id }); await loadPacks(); })}
                      title="enable — installs + activates this pack's laws"
                      style={{ ...chip, fontSize: 7, padding: "0 5px", color: C.ok, opacity: busy && busy !== busyKey ? 0.35 : 1, flexShrink: 0 }}>{busy === busyKey ? "…" : "enable"}</button>
                  )}
                </div>
              );
            })}
          </div>
          {/* TECH-PACK GENERATION — the AI authors a batch of laws for a named technology */}
          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input value={tech} onChange={(e) => setTech(e.target.value)} placeholder="a technology — e.g. Prisma · FastAPI · TanStack Query" spellCheck={false}
              onKeyDown={(e) => { if (e.key === "Enter" && tech.trim()) void actAI("packgen", "law", () => dispatch("system.constitution.pack.gen", { tech: tech.trim() }, 600000)); }}
              style={{ flex: "1 1 200px", background: C.bg, border: `1px solid ${C.border}`, color: C.fg, fontFamily: mono, fontSize: 10, padding: "3px 7px", borderRadius: 5, outline: "none" }} />
            <button disabled={!tech.trim() || busy === "packgen"} onClick={() => void actAI("packgen", "law", () => dispatch("system.constitution.pack.gen", { tech: tech.trim() }, 600000))}
              style={{ ...chip, color: C.brand, borderColor: C.brand, textTransform: "none", letterSpacing: 0, opacity: tech.trim() ? 1 : 0.5 }} title="the AI authors deterministic laws for this tech as candidates to ratify — opens the AI-call window">{busy === "packgen" ? "◆ generating…" : "◆ generate a tech pack"}</button>
          </div>
        </div>
      )}

      {/* LINTER RUNNERS — the project's OWN linters (agnostic); findings become violations via the lint-clean law */}
      {(linters ?? []).length > 0 && (
        <div style={card}>
          <div style={lbl}>linter runners <span style={{ textTransform: "none", letterSpacing: 0, color: C.muted }}>— the project's own eslint/ruff, from its config; findings → violations via <code>lint-clean</code></span></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {linters!.map((l) => (
              <div key={l.id} title={l.active ? "the lint-clean law is ratified → this runs on every rebuild" : "enable/ratify the lint-clean law to wire this in"} style={{ display: "flex", gap: 5, alignItems: "center", fontFamily: mono, fontSize: 9, border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 8px" }}>
                <span style={{ width: 6, height: 6, borderRadius: 6, background: l.active ? (l.installed === false ? C.warn : C.ok) : C.dim, flexShrink: 0 }} />
                <b style={{ color: C.fg }}>{l.label}</b>
                <span style={{ color: C.dim, ...tnum }}>{l.file_count} file{l.file_count === 1 ? "" : "s"}</span>
                {l.installed === false && <span style={{ color: C.warn, fontSize: 7.5 }}>not installed</span>}
                {l.installed === null && <span style={{ color: C.dim, fontSize: 7.5 }}>runs if on PATH</span>}
                <span style={{ color: l.active ? C.ok : C.dim, fontSize: 7.5 }}>{l.active ? "active" : "lint-clean off"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* the OPTIONAL law library — dozens of pre-defined laws, each with a real detector */}
      {catalog && (
        <div style={{ ...card, borderColor: C.brand }}>
          <div style={lbl}>law catalog <span style={{ textTransform: "none", letterSpacing: 0, color: C.muted }}>— optional; each SCANS on rebuild (not hands-free). enable what fits.</span></div>
          {SCOPES.map((sc) => { const rows = catByScope(sc); const off = rows.filter((c) => !c.installed); return rows.length ? (
            <div key={sc} style={{ marginBottom: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 1 }}>
                <span style={{ fontFamily: mono, fontSize: 8, color: SCOPE_TONE[sc] }}>{sc}</span>
                {off.length > 0 && <button onClick={() => void act(`enall-${sc}`, async () => { await dispatch("system.constitution.law", { op: "enable", keys: off.map((c) => c.key) }); await openCatalog(); })} style={{ ...chip, fontSize: 7, color: C.ok, padding: "0 5px", borderColor: `color-mix(in oklab, ${C.ok} 40%, ${C.border})` }} title={`install all ${off.length} in this section`}>{busy === `enall-${sc}` ? "…" : `＋ enable all (${off.length})`}</button>}
              </div>
              {rows.map((c) => (
                <div key={c.key} title={c.rule_md} style={{ display: "flex", gap: 6, alignItems: "baseline", fontFamily: mono, fontSize: 8.5, padding: "1px 0", opacity: c.installed ? 0.5 : 1, flexWrap: "wrap" }}>
                  <span style={{ width: 18, color: C.dim, ...tnum }}>w{c.weight}</span>
                  <span style={{ width: 36, color: SEV_TONE[c.severity] ?? C.dim, fontSize: 7.5 }}>{c.severity}</span>
                  <b style={{ color: C.fg }}>{c.title}</b><span style={{ color: C.dim, fontSize: 7.5 }}>{c.detector}</span>
                  {c.source && <span title={`recognized source — the detector is ours (agnostic), this is provenance`} style={{ color: C.brand, fontSize: 7, border: `1px solid color-mix(in oklab, ${C.brand} 40%, ${C.border})`, borderRadius: 2, padding: "0 3px" }}>{c.source}</span>}
                  <span style={{ flex: 1 }} />
                  {c.installed ? <span style={{ color: C.ok, fontSize: 7.5 }}>installed</span>
                    : <button onClick={() => void act(`en-${c.key}`, async () => { await dispatch("system.constitution.law", { op: "enable", key: c.key }); await openCatalog(); })} style={{ ...chip, fontSize: 7.5, color: C.ok }}>enable</button>}
                </div>
              ))}
            </div>
          ) : null; })}
          <div style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, marginTop: 4 }}>enabled laws scan on the next ↻ rebuild.</div>
        </div>
      )}
      {candidates.length > 0 && (
        <div style={{ ...card, borderColor: C.warn }}>
          <div style={lbl}>candidates — mined; you ratify (a dominant pattern can be a dominant mistake)</div>
          {candidates.map((l) => (
            <div key={l.key} style={{ display: "flex", gap: 6, alignItems: "baseline", fontFamily: mono, fontSize: 9, padding: "3px 0" }}>
              <b style={{ color: C.fg }}>{l.title}</b>{l.evidence?.pct != null && <span style={{ color: C.ok }}>{Math.round(l.evidence.pct * 100)}%</span>}
              <span style={{ flex: 1 }} />
              <button onClick={() => void act(`r-${l.key}`, () => dispatch("system.constitution.law", { op: "ratify", key: l.key }))} style={{ ...chip, color: C.ok }}>ratify</button>
              <button onClick={() => void act(`d-${l.key}`, () => dispatch("system.constitution.law", { op: "dismiss", key: l.key }))} style={{ ...chip, color: C.bad }}>dismiss</button>
            </div>
          ))}
        </div>
      )}
      {SCOPES.map((sc) => {
        const rows = laws.filter((l) => (l.scope === sc || (sc === "project" && l.scope === "code")) && l.status !== "candidate");
        if (!rows.length && sc !== "business") return null;
        const hint = sc === "business" ? "authored (domain invariants — can't be mined)" : sc === "architecture" ? "shared — dependency direction, layering, cycles" : sc === "project" ? "mined from THIS repo (house way overrides)" : sc === "framework" ? "ecosystem-specific" : sc === "language" ? "syntax/semantics (tree-sitter, agnostic)" : "universal best practice";
        return (
          <div key={sc} style={card}>
            <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: SCOPE_TONE[sc] }} /> {sc} laws <span style={{ textTransform: "none", letterSpacing: 0, color: C.muted }}>— {hint}</span>
              <span style={{ flex: 1 }} />
              {(() => { const susp = rows.filter((l: any) => l.status === "suspended"); return susp.length > 0 && <button onClick={() => void act(`onall-${sc}`, () => Promise.allSettled(susp.map((l: any) => dispatch("system.constitution.law", { op: "unsuspend", key: l.key }))))} style={{ ...chip, fontSize: 7.5, color: C.ok, borderColor: `color-mix(in oklab, ${C.ok} 40%, ${C.border})` }} title={`turn on all ${susp.length} suspended law(s) in this section`}>{busy === `onall-${sc}` ? "…" : `activate all (${susp.length})`}</button>; })()}
              {sc === "business" && <button onClick={() => void actAI("bizgen", "law", () => dispatch("system.constitution.business.gen", {}, 600000))} style={{ ...chip, color: C.brand, borderColor: C.brand, textTransform: "none", letterSpacing: 0 }} title="AI reads the codebase context (entry points · vocabulary · decisions) and proposes domain laws as candidates — opens the AI-call window">{busy === "bizgen" ? "◆ generating…" : "◆ generate with AI"}</button>}
            </div>
            {rows.length ? rows.map((l: any) => (
              <div key={l.key} title={l.rule_md} style={{ display: "flex", gap: 6, alignItems: "baseline", fontFamily: mono, fontSize: 9, padding: "2px 0", opacity: l.status === "suspended" ? 0.5 : 1 }}>
                <span style={{ width: 20, color: C.dim, ...tnum }}>w{l.weight}</span>
                <span style={{ width: 40, color: SEV_TONE[l.severity] ?? C.dim, fontSize: 7.5 }}>{l.severity}</span>
                <b style={{ color: C.fg }}>{l.title}</b>
                <span style={{ color: C.dim, fontSize: 8 }}>{l.detector}{l.confidence != null && l.confidence < 1 ? ` ·${Math.round(l.confidence * 100)}%` : ""}</span>
                {l.category && <span title={`concern — feeds the ${l.category} compliance sub-score`} style={{ color: C.muted, fontSize: 6.5, border: `1px solid ${C.border}`, borderRadius: 2, padding: "0 3px" }}>{l.category}</span>}
                {l.evidence?.source && <span title="recognized source — provenance (the detector is ours)" style={{ color: C.brand, fontSize: 7, opacity: 0.85 }}>{l.evidence.source}</span>}
                <span style={{ flex: 1 }} />
                {/* STATE (dot + word) and ACTION (verb) are separate — the old single "on/off" chip
                    showed the ACTION, so an activated section read as "off" (operator: "doing the opposite"). */}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: mono, fontSize: 7, color: l.status === "suspended" ? C.dim : C.ok, flexShrink: 0 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 5, background: l.status === "suspended" ? C.dim : C.ok }} />{l.status === "suspended" ? "suspended" : "active"}
                </span>
                <button onClick={() => setFork({ detector: l.detector, config: l.config ?? {}, title: l.title, rule_md: l.rule_md, scope: l.scope === "code" ? "project" : l.scope, weight: l.weight, severity: l.severity, languages: l.applies?.languages ?? [] })}
                  title="fork — clone this law into the editor and tweak the copy; the system law stays intact" style={{ ...chip, fontSize: 7.5, color: C.brand }}>⑂ fork</button>
                <button onClick={() => void act(`s-${l.key}`, () => dispatch("system.constitution.law", { op: l.status === "suspended" ? "unsuspend" : "suspend", key: l.key }))} style={{ ...chip, fontSize: 7.5, color: l.status === "suspended" ? C.ok : C.muted }}>{l.status === "suspended" ? "activate" : "suspend"}</button>
              </div>
            )) : <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, fontStyle: "italic" }}>none yet — author a business law with system.constitution.law op:add.</span>}
          </div>
        );
      })}
    </div>
  );
}
