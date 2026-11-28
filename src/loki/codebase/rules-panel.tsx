// THE RULES (operator 2026-09-18: "Quality is like a QA server, right? make it easier to understand and
// edit the rules"). The Quality tab's front door: every law the repo is judged against as ONE plain
// row — a switch (on/off), what it checks in words, how many places break it right now, how much a hit
// costs — and two verbs: edit (forks it into the law builder) and + new rule. The ConstitutionPanel
// below it stays the deep lens (map · dossiers · packs); this is the switchboard.
import * as React from "react";
import { apiPost } from "@/loki/api/client";
import { C } from "@/loki/theme";
import { LawBuilder } from "./law-builder";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
const SEV_TONE: Record<string, string> = { critical: C.bad, error: C.bad, warn: C.warn, info: C.dim };
const SCOPE_TONE: Record<string, string> = { business: C.brand, architecture: C.warn, project: C.ok, code: C.ok, framework: C.muted, language: C.dim };
const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 9.5, padding: "1px 8px", color: C.muted };

async function dispatch(action: string, input: any, timeoutMs = 30000): Promise<any> {
  const r: any = await apiPost(`/api/v1/dispatch`, { action_name: action, input }, { timeoutMs });
  return r?.result?.result ?? r?.result ?? r;
}

export type Rule = { key: string; title: string; rule_md?: string; scope?: string; severity?: string; weight?: number; status?: string; detector?: string; config?: any; category?: string; applies?: any; hits: number };

/** the report → one row per law (candidates excluded — they are proposals, not rules yet) */
export function rulesOf(report: any): Rule[] {
  const hits = new Map<string, number>();
  for (const l of report?.by_law ?? []) hits.set(String(l.law_key), Number(l.n) || 0);
  const laws: any[] = report?.constitution?.laws ?? report?.laws ?? [];
  return laws.filter((l) => l && l.status !== "candidate" && l.status !== "dismissed").map((l) => ({
    key: String(l.key), title: String(l.title ?? l.key), rule_md: l.rule_md, scope: l.scope, severity: l.severity, weight: l.weight, status: l.status,
    detector: l.detector, config: l.config, category: l.category, applies: l.applies, hits: hits.get(String(l.key)) ?? 0,
  })).sort((a, b) => (b.hits - a.hits) || (a.status === "suspended" ? 1 : 0) - (b.status === "suspended" ? 1 : 0) || a.title.localeCompare(b.title));
}

export function Switch({ on, busy, onClick, title }: { on: boolean; busy?: boolean; onClick: () => void; title?: string }) {
  return (
    <button role="switch" aria-checked={on} disabled={busy} onClick={onClick} title={title}
      style={{ width: 26, height: 14, borderRadius: 7, border: "none", cursor: "pointer", padding: 0, position: "relative", flexShrink: 0, opacity: busy ? 0.5 : 1,
        background: on ? C.ok : `color-mix(in oklab, ${C.border} 80%, ${C.muted})`, transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 14 : 2, width: 10, height: 10, borderRadius: 5, background: "#fff", transition: "left .15s" }} />
    </button>
  );
}

export function RulesPanel() {
  const [report, setReport] = React.useState<any | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [showOff, setShowOff] = React.useState(true);
  const [builder, setBuilder] = React.useState<null | { initial?: any }>(null);
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    try { const d = await dispatch("system.constitution.report", {}); if (!d || !("constitution" in d)) throw new Error(d?.message ?? "no report yet — rebuild the analysis"); setReport(d); setError(null); }
    catch (e: any) { setError(String(e?.message ?? "failed").slice(0, 200)); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  const act = async (k: string, fn: () => Promise<any>) => { setBusy(k); try { await fn(); await load(); } catch { /* the row shows the old state */ } finally { setBusy(null); } };

  const rules = React.useMemo(() => rulesOf(report), [report]);
  const shown = rules.filter((r) => (showOff || r.status !== "suspended") && (!q.trim() || `${r.title} ${r.rule_md ?? ""} ${r.key} ${r.scope ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const on = rules.filter((r) => r.status !== "suspended").length;
  const broken = rules.filter((r) => r.hits > 0).length;

  return (
    <div data-testid="rules-panel" style={{ fontFamily: mono }}>
      <div style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.5, marginBottom: 8 }}>
        Quality is the repository's QA server: every rule below scans the code on each ↻ rebuild; a hit is a violation, and each violation costs the file points on its <b style={{ color: C.fg }}>compliance</b> axis — weight × severity. A lit card is on; click it to switch the rule off (it stops counting) — ▸ shows the whole rule, edit, remove.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: C.fg }}><b>{on}</b><span style={{ color: C.dim }}>/{rules.length} rules on</span> · <b style={{ color: broken ? C.warn : C.ok }}>{broken}</b><span style={{ color: C.dim }}> currently hit</span></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="find a rule…" style={{ fontFamily: mono, fontSize: 10, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.fg, padding: "2px 7px", width: 180 }} />
        <label style={{ fontSize: 9.5, color: C.dim, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> show off rules</label>
        <span style={{ flex: 1 }} />
        <button data-testid="rules-new" onClick={() => setBuilder({})} style={{ ...btn, color: C.brand, borderColor: C.brand }}>＋ new rule</button>
        <button onClick={() => void load()} style={btn} title="re-read the report">↻</button>
      </div>
      {error && <div style={{ fontSize: 10, color: C.warn, fontStyle: "italic", padding: "6px 0" }}>{error}</div>}
      {!error && !report && <div style={{ fontSize: 10, color: C.dim, fontStyle: "italic", padding: "6px 0" }}>reading the rules…</div>}
      {report && !rules.length && (
        <div style={{ fontSize: 10, color: C.dim, padding: "6px 0" }}>no rules yet — <button onClick={() => void act("seed", () => dispatch("system.constitution.law", { op: "seed" }))} style={{ ...btn, color: C.ok }}>{busy === "seed" ? "…" : "seed the defaults"}</button> then ↻ rebuild</div>
      )}
      {/* THE CARDS (operator 2026-09-19: "cards with just intro and onclick expand with details, and instead
          of a switch button, they be selected with a border"): a lit border is ON, a dim one OFF — the card
          itself toggles (role=switch for the reader); ▸ opens the details (the full rule, hits, edit, remove). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
        {shown.map((r) => { const off = r.status === "suspended"; const isOpen = openKey === r.key; const tone = SCOPE_TONE[r.scope ?? ""] ?? C.dim; return (
          <div key={r.key} data-testid={`rule-${r.key}`} role="switch" aria-checked={!off} tabIndex={0}
            onClick={() => void act(`t-${r.key}`, () => dispatch("system.constitution.law", { op: off ? "unsuspend" : "suspend", key: r.key }))}
            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); void act(`t-${r.key}`, () => dispatch("system.constitution.law", { op: off ? "unsuspend" : "suspend", key: r.key })); } }}
            title={off ? "off — click to turn this rule on" : "on — click to turn this rule off"}
            style={{ gridColumn: isOpen ? "1 / -1" : undefined, background: off ? "transparent" : `color-mix(in oklab, ${C.brand} 7%, ${C.panel})`, border: `1.5px solid ${off ? C.border : C.brand}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", opacity: off ? 0.6 : busy === `t-${r.key}` ? 0.5 : 1, transition: "border-color .15s, background .15s", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 7, alignItems: "baseline", minWidth: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: tone, flexShrink: 0, alignSelf: "center" }} title={`${r.scope ?? "?"} rule`} />
              <b style={{ fontSize: 10.5, color: C.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>{r.title}</b>
              <span style={{ fontSize: 8, color: SEV_TONE[r.severity ?? ""] ?? C.dim, textTransform: "uppercase" }}>{r.severity ?? ""}</span>
              <span style={{ fontSize: 10, color: r.hits ? C.warn : C.dim, fontVariantNumeric: "tabular-nums" }} title="places breaking this rule in the last analysis">{r.hits ? `${r.hits} hit${r.hits === 1 ? "" : "s"}` : "clean"}</span>
              <button data-testid={`rule-open-${r.key}`} onClick={(e) => { e.stopPropagation(); setOpenKey(isOpen ? null : r.key); }} title={isOpen ? "collapse" : "details — the full rule, edit, remove"} style={{ ...btn, padding: "0 5px", fontSize: 10, color: isOpen ? C.brand : C.dim, borderColor: isOpen ? C.brand : C.border }}>{isOpen ? "▾" : "▸"}</button>
            </div>
            {r.rule_md && !isOpen && <div style={{ fontSize: 9.5, color: C.muted, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, lineHeight: 1.4 }}>{r.rule_md}</div>}
            {isOpen && (
              <div data-testid={`rule-details-${r.key}`} onClick={(e) => e.stopPropagation()} style={{ cursor: "default", borderTop: `1px solid ${C.border}`, paddingTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 10, color: C.fg, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{r.rule_md || "(no rule text)"}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 9.5, color: C.dim }}>
                  <span>key · <span style={{ color: C.muted }}>{r.key}</span></span>
                  <span>scope · <span style={{ color: tone }}>{r.scope ?? "?"}</span></span>
                  <span>weight · <span style={{ color: C.muted }}>{r.weight ?? "?"}</span></span>
                  {r.detector && <span>detector · <span style={{ color: C.muted }}>{r.detector}</span></span>}
                  {r.applies?.languages?.length ? <span>languages · <span style={{ color: C.muted }}>{r.applies.languages.join(", ")}</span></span> : null}
                  <span>{off ? "off — not counted" : "on — each hit costs weight × severity on the file's compliance axis"}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setBuilder({ initial: { detector: r.detector, config: r.config ?? {}, title: r.title, rule_md: r.rule_md, scope: r.scope === "code" ? "project" : r.scope, weight: r.weight, severity: r.severity, languages: r.applies?.languages ?? [] } })}
                    title="edit — opens a copy of this rule in the builder; save it as your own version, then switch the original off" style={btn}>✎ edit</button>
                  <button onClick={() => void act(`x-${r.key}`, () => dispatch("system.constitution.law", { op: "dismiss", key: r.key }))} title="remove this rule" style={{ ...btn, color: C.bad }}>✕ remove</button>
                </div>
              </div>
            )}
          </div>
        ); })}
      </div>
      {builder && <LawBuilder initial={builder.initial} onClose={() => setBuilder(null)} onCreated={() => void load()} />}
    </div>
  );
}
