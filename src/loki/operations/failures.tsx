// Failures — the unified failure feed (operator 2026-07-05: "it shows none of the
// failures; it should show all, very organized and pretty, with functionalities for
// learning/training"). The old screen watched brain.diagnoses — a dead table — while
// the real failures live in five: driver ticks, build-gate REDs, court/lint judgment
// fails, AI call errors, warn/error notifications (+ memory.error_events when used).
//
// Two lenses over one feed:
//   patterns — recurrence groups by deterministic pattern_key. THE learning surface:
//              a pattern that recurs is a candidate for a failure-advice rule, a lint
//              dimension, or a law. Copy-as-lesson + teach-the-advisor built in.
//   timeline — the flat chronological stream with severity, kind, remedies inline.
import * as React from "react";
import { apiGet, apiPost, isNotWired, unwrapResult as unwrap } from "@/loki/api/client";
import { C } from "@/loki/theme";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
const padded: React.CSSProperties = { padding: "20px 14px", color: C.muted, fontStyle: "italic", fontFamily: mono, fontSize: 12 };
const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: "3px 10px", borderRadius: 5 };

const KIND_META: Record<string, { label: string; color: string }> = {
  build_gate: { label: "build", color: C.bad },
  lint_gate: { label: "lint", color: "oklch(0.70 0.17 20)" },
  tick: { label: "tick", color: C.warn },
  judgment: { label: "court", color: C.brand },
  ai_call: { label: "ai", color: C.dim },
  notification: { label: "notif", color: C.warn },
  error_event: { label: "event", color: C.bad },
};
const kindBadge = (kind: string) => {
  const m = KIND_META[kind] ?? { label: kind, color: C.muted };
  return <span style={{ fontFamily: mono, fontSize: 8.5, color: m.color, border: `1px solid ${m.color}`, borderRadius: 4, padding: "1px 5px" }}>{m.label}</span>;
};
const sevDot = (sev: string) => (
  <span style={{ width: 7, height: 7, borderRadius: 4, display: "inline-block", background: sev === "error" ? C.bad : C.warn }} />
);

const lessonMd = (r: any) => [
  `## Failure lesson — ${r.pattern_key}`,
  ``,
  `- **when**: ${r.ts}${r.card_slug ? `  ·  card ${r.card_slug}` : ""}${r.contract_slug ? `  ·  contract ${r.contract_slug}` : ""}`,
  `- **kind**: ${r.kind}  ·  severity ${r.severity}`,
  `- **what**: ${r.title}`,
  ``,
  "```",
  r.detail ?? "(no detail)",
  "```",
  r.remedy_md ? `\n**How to proceed**: ${r.remedy_md}` : "",
  ``,
  `_Recurring? Teach it: a failure-advice rule (one regex + one remedy), a lint dimension, or a law._`,
].join("\n");

const adviceRuleSnippet = (r: any) => `// teach failure-advice.mjs — new class from ${r.ts}
{
  class: 'NAME-THIS-CLASS',
  re: /PASTE-A-STABLE-SUBSTRING-FROM-THE-EVIDENCE/i,
  remedy: 'What the operator/re-author should DO when this class hits. Evidence sample:\\n// ${String(r.detail ?? "").slice(0, 160).replace(/\n/g, " ")}',
},`;

function Sparkline({ byDay, days }: { byDay: Record<string, number>; days: number }) {
  const keys = Object.keys(byDay).sort();
  const last = keys.slice(-Math.min(days, 21));
  if (!last.length) return null;
  const max = Math.max(...last.map((k) => byDay[k]));
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "flex-end", height: 18 }} title={last.map((k) => `${k}: ${byDay[k]}`).join("\n")}>
      {last.map((k) => (
        <span key={k} style={{ width: 5, height: Math.max(2, Math.round((byDay[k] / max) * 18)), background: byDay[k] >= max * 0.7 ? C.bad : C.brand, borderRadius: 1, opacity: 0.85 }} />
      ))}
    </span>
  );
}

function RowDetail({ r }: { r: any }) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const copy = async (label: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard denied */ }
  };
  return (
    <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}`, background: C.bg, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontFamily: mono, fontSize: 10, color: C.muted, alignItems: "center" }}>
        <span>{r.ts}</span>
        {r.card_slug && <span>card {r.card_slug}</span>}
        {r.contract_slug && <span>contract {String(r.contract_slug).slice(0, 44)}</span>}
        <span>ref {r.ref_id}</span>
        {r.recovered && <span style={{ color: C.ok }}>✓ recovered</span>}
        {r.dismissed && <span style={{ color: C.dim }}>dismissed</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {r.kind === "ai_call" && typeof (window as any).antilokiOpenAICall === "function" && (
            <button style={btn} onClick={() => (window as any).antilokiOpenAICall(r.ref_id)}>open call #{r.ref_id}</button>
          )}
          <button style={btn} onClick={() => copy("lesson", lessonMd(r))}>{copied === "lesson" ? "✓ copied" : "⧉ copy as lesson"}</button>
          <button style={{ ...btn, color: C.ok, borderColor: C.ok }} title="mint a RISK TAG from this failure — its prevention gets injected into future matching cards' design BEFORE they author. Refine the signature on the Tagging → risk tab."
            onClick={async () => {
              const slug = String(r.pattern_key || "risk").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60);
              const langs = [...new Set(String(`${r.detail} ${r.title}`).match(/\.(jsx|tsx|ts|js|scss|css|py)\b/g)?.map((x: string) => x.slice(1)) ?? [])];
              try {
                await apiPost("/api/v1/risk-tags", { slug, prevention_md: (r.remedy_md || String(r.detail || "").slice(0, 400)), retryability: classify(r).retry, source_pattern_key: r.pattern_key, applies_to: { globs: [], langs } });
                setCopied("taught");
              } catch { setCopied("teach-failed"); }
              setTimeout(() => setCopied(null), 2000);
            }}>{copied === "taught" ? "✓ risk tag minted" : copied === "teach-failed" ? "✗ failed" : "🏷 teach as risk tag"}</button>
          {r.kind === "build_gate" && /unclassified/.test(r.pattern_key) && (
            <button style={{ ...btn, color: C.warn }} onClick={() => copy("teach", adviceRuleSnippet(r))} title="copies a prefilled failure-advice RULES entry — paste it into failure-advice.mjs and name the class">
              {copied === "teach" ? "✓ copied" : "🧪 teach failure-advice"}
            </button>
          )}
        </span>
      </div>
      {r.detail && (
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: mono, fontSize: 10.5, color: C.fg, maxHeight: 300, overflow: "auto", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>{r.detail}</pre>
      )}
      {r.remedy_md && (
        <div style={{ padding: "8px 10px", border: `1px solid ${C.brand}`, borderRadius: 6, fontFamily: mono, fontSize: 10.5, color: C.fg, lineHeight: 1.5 }}>
          <span style={{ color: C.brand, fontWeight: 700 }}>HOW TO PROCEED — </span>{r.remedy_md}
        </div>
      )}
    </div>
  );
}

// ── CONTROL CENTER (operator 2026-07-08): maps, heat maps, graphs — make errors VISIBLE ──
// Every failure carries dimensions; the visuals surface the patterns a list hides. Pure
// client-side derivation over the feed the BE already returns (rows + groups + by_day).
const dayOf = (ts: string) => String(ts || "").slice(0, 10);
const CAT_META: Record<string, { color: string }> = {
  CODE: { color: C.bad }, INFRA: { color: C.warn }, JUDGE: { color: C.brand },
  ORCH: { color: "oklch(0.72 0.15 300)" }, ESCALATION: { color: "oklch(0.78 0.14 60)" }, OTHER: { color: C.dim },
};
// kind + pattern → (cause category, retryability). The load-bearing axis: structural failures
// (re-authoring can't fix) vs retryable vs transient-infra vs needs-a-human.
function classify(r: any): { cat: string; retry: "structural" | "retryable" | "transient" | "human" } {
  const p = String(r?.pattern_key ?? "");
  if (r.kind === "ai_call" || /provider|timeout|timed|locked|ECONN|EAI|socket/i.test(p)) return { cat: "INFRA", retry: "transient" };
  if (r.kind === "judgment" && /:court/.test(p)) return { cat: "JUDGE", retry: "structural" };
  if (r.kind === "judgment" && /:lint/.test(p)) return { cat: "CODE", retry: "structural" };
  if (r.kind === "lint_gate") return { cat: "CODE", retry: "structural" };
  if (r.kind === "build_gate") return { cat: "CODE", retry: "retryable" };
  if (r.kind === "tick") return { cat: "ORCH", retry: "structural" };
  if (r.kind === "notification") return { cat: "ESCALATION", retry: "human" };
  if (r.kind === "error_event") return { cat: "INFRA", retry: "transient" };
  return { cat: "OTHER", retry: "retryable" };
}
const RETRY_META: Record<string, { label: string; color: string }> = {
  structural: { label: "structural (needs a code/design change)", color: C.bad },
  retryable: { label: "retryable (a re-author may fix it)", color: C.warn },
  transient: { label: "transient infra (self-heals on retry)", color: C.dim },
  human: { label: "escalated to a human", color: "oklch(0.78 0.14 60)" },
};

function StatCard({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div style={{ flex: "1 1 120px", minWidth: 110, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 11px" }}>
      <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: color ?? C.fg, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// horizontal proportion bar — one segment per key, width = share.
function ShareBar({ parts }: { parts: { key: string; n: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.n, 0) || 1;
  return (
    <div style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden", border: `1px solid ${C.border}` }}>
      {parts.filter((p) => p.n > 0).map((p) => (
        <div key={p.key} title={`${p.key}: ${p.n} (${Math.round((p.n / total) * 100)}%)`} style={{ width: `${(p.n / total) * 100}%`, background: p.color, opacity: 0.82 }} />
      ))}
    </div>
  );
}

function ControlCenter({ rows, groups, onPick }: { rows: any[]; groups: any[]; onPick: (patternKey: string) => void }) {
  // dimensions
  const byCat: Record<string, number> = {}; const byRetry: Record<string, number> = {};
  const cards = new Set<string>();
  for (const r of rows) { const c = classify(r); byCat[c.cat] = (byCat[c.cat] ?? 0) + 1; byRetry[c.retry] = (byRetry[c.retry] ?? 0) + 1; if (r.card_slug) cards.add(r.card_slug); }
  const structural = byRetry.structural ?? 0;

  // heatmap: top recurring patterns (rows) × day (cols). A pattern that goes DARK after a
  // date = a fix landed. This is the single most useful "are we winning?" view.
  const topPatterns = groups.slice().sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, 12);
  const dayKeys = [...new Set(rows.map((r) => dayOf(r.ts)).filter(Boolean))].sort().slice(-21);
  const cell: Record<string, number> = {};
  for (const r of rows) cell[`${r.pattern_key}|${dayOf(r.ts)}`] = (cell[`${r.pattern_key}|${dayOf(r.ts)}`] ?? 0) + 1;
  const maxCell = Math.max(1, ...Object.values(cell));
  const patColor = (pk: string) => CAT_META[classify({ pattern_key: pk, kind: (groups.find((g) => g.pattern_key === pk) || {}).kind }).cat]?.color ?? C.dim;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* dimension stat row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <StatCard label="failures (window)" value={rows.length} />
        <StatCard label="structural" sub="re-author can't fix — needs code/design" value={structural} color={structural ? C.bad : C.ok} />
        <StatCard label="distinct patterns" sub="each a candidate lesson / tag" value={groups.length} />
        <StatCard label="cards touched" value={cards.size} />
        <StatCard label="top recurrence" sub={topPatterns[0]?.pattern_key?.slice(0, 26)} value={`×${topPatterns[0]?.count ?? 0}`} color={C.warn} />
      </div>

      {/* category + retryability share bars */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px" }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginBottom: 6 }}>by cause category</div>
          <ShareBar parts={Object.keys(byCat).map((k) => ({ key: k, n: byCat[k], color: CAT_META[k]?.color ?? C.dim }))} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).map((k) => (
              <span key={k} style={{ fontFamily: mono, fontSize: 9, color: CAT_META[k]?.color ?? C.dim }}>■ {k} {byCat[k]}</span>
            ))}
          </div>
        </div>
        <div style={{ flex: "1 1 260px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px" }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginBottom: 6 }}>by retryability — the load-bearing axis</div>
          <ShareBar parts={Object.keys(byRetry).map((k) => ({ key: k, n: byRetry[k], color: RETRY_META[k]?.color ?? C.dim }))} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {Object.keys(byRetry).sort((a, b) => byRetry[b] - byRetry[a]).map((k) => (
              <span key={k} style={{ fontFamily: mono, fontSize: 9, color: RETRY_META[k]?.color ?? C.dim }} title={RETRY_META[k]?.label}>■ {k} {byRetry[k]}</span>
            ))}
          </div>
        </div>
      </div>

      {/* HEATMAP: pattern × day */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px" }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginBottom: 8 }}>recurrence heat map — top patterns × day  <span style={{ color: C.dim }}>(a row that goes dark after a date = a fix landed)</span></div>
        {dayKeys.length === 0 ? <div style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>no dated failures in this window.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {topPatterns.map((g) => (
              <div key={g.pattern_key} style={{ display: "flex", gap: 3, alignItems: "center", cursor: "pointer" }} onClick={() => onPick(g.pattern_key)} title={`${g.pattern_key} — ×${g.count}`}>
                <span style={{ width: 150, flex: "none", fontFamily: mono, fontSize: 8.5, color: patColor(g.pattern_key), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.pattern_key}</span>
                {dayKeys.map((d) => {
                  const n = cell[`${g.pattern_key}|${d}`] ?? 0;
                  return <span key={d} title={`${d}: ${n}`} style={{ flex: 1, height: 13, borderRadius: 2, background: n ? patColor(g.pattern_key) : "transparent", opacity: n ? 0.25 + 0.75 * (n / maxCell) : 1, border: n ? "none" : `1px solid ${C.border}` }} />;
                })}
                <span style={{ width: 26, flex: "none", textAlign: "right", fontFamily: mono, fontSize: 8.5, color: C.muted }}>×{g.count}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
              <span style={{ width: 150, flex: "none" }} />
              {dayKeys.map((d) => <span key={d} style={{ flex: 1, textAlign: "center", fontFamily: mono, fontSize: 7, color: C.dim, whiteSpace: "nowrap", overflow: "hidden" }}>{d.slice(5)}</span>)}
              <span style={{ width: 26, flex: "none" }} />
            </div>
          </div>
        )}
      </div>

      {/* top recurrence bars */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px" }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginBottom: 8 }}>top patterns by recurrence — the learning queue</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {topPatterns.map((g) => {
            const max = topPatterns[0]?.count ?? 1;
            return (
              <div key={g.pattern_key} onClick={() => onPick(g.pattern_key)} style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                <span style={{ width: 200, flex: "none", fontFamily: mono, fontSize: 9, color: C.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.pattern_key}</span>
                <div style={{ flex: 1, height: 12, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(3, (g.count / max) * 100)}%`, height: "100%", background: patColor(g.pattern_key), opacity: 0.8 }} />
                </div>
                <span style={{ width: 30, flex: "none", textAlign: "right", fontFamily: mono, fontSize: 9, color: C.muted }}>×{g.count}</span>
                <span style={{ width: 44, flex: "none", textAlign: "right", fontFamily: mono, fontSize: 8, color: C.dim }}>{(g.cards ?? []).length || 1} card</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function FailuresScreen() {
  const [data, setData] = React.useState<any>(null);
  const [status, setStatus] = React.useState<"loading" | "ok" | "notwired" | "error">("loading");
  const [days, setDays] = React.useState(30);
  const [view, setView] = React.useState<"map" | "patterns" | "timeline">("map");
  const [kindFilter, setKindFilter] = React.useState<string | null>(null);
  const [openPattern, setOpenPattern] = React.useState<string | null>(null);
  const [openRow, setOpenRow] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setStatus("loading");
    try {
      const raw = await apiGet(`/api/v1/failures/feed?days=${days}&limit=500`);
      if (isNotWired(raw)) { setStatus("notwired"); return; }
      const d = unwrap(raw);
      if (!d || !Array.isArray(d.rows)) { setStatus("error"); return; }
      setData(d); setStatus("ok");
    } catch { setStatus("error"); }
  }, [days]);
  React.useEffect(() => { load(); }, [load]);

  const rows: any[] = (data?.rows ?? []).filter((r: any) => !kindFilter || r.kind === kindFilter);
  const groups: any[] = (data?.groups ?? []).filter((g: any) => !kindFilter || g.kind === kindFilter);
  const rowKey = (r: any) => `${r.kind}:${r.ref_id}`;

  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 13, color: C.fg, fontWeight: 600 }}>Failures</span>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: C.muted }}>every failure the substrate records — grouped for learning</span>
        {data && <Sparkline byDay={data.stats.by_day} days={days} />}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} style={{ ...btn, color: days === d ? C.fg : C.muted, borderColor: days === d ? C.brand : C.border }}>{d}d</button>
          ))}
          <button onClick={load} style={{ ...btn, color: C.muted }}>↻</button>
        </span>
      </div>

      {status === "notwired" && <div style={padded}>the /api/v1/failures/feed route isn't wired yet — restart the BE to pick up system.failure.feed, then reload.</div>}
      {status === "error" && <div style={padded}>can't reach /api/v1/failures/feed — an older BE build, or the request failed. Restart the BE and retry with ↻.</div>}
      {status === "loading" && <div style={padded}>aggregating ticks · build gates · judgments · AI calls · notifications…</div>}
      {status === "ok" && rows.length === 0 && !kindFilter && <div style={padded}>a clean {days}-day window — no recorded failures. (Sources: driver ticks, build gates, judgment courts, AI calls, notifications, error events.)</div>}

      {status === "ok" && data && (
        <>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => setKindFilter(null)} style={{ ...btn, color: !kindFilter ? C.fg : C.muted, borderColor: !kindFilter ? C.brand : C.border }}>
              all {data.stats.total}
            </button>
            {Object.entries(data.stats.by_kind).map(([k, n]: any) => (
              <button key={k} onClick={() => setKindFilter(kindFilter === k ? null : k)}
                style={{ ...btn, color: kindFilter === k ? C.fg : (KIND_META[k]?.color ?? C.muted), borderColor: kindFilter === k ? C.brand : C.border }}>
                {KIND_META[k]?.label ?? k} {n}
              </button>
            ))}
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button onClick={() => setView("map")} style={{ ...btn, color: view === "map" ? C.fg : C.muted, borderColor: view === "map" ? C.brand : C.border }}>▦ map</button>
              <button onClick={() => setView("patterns")} style={{ ...btn, color: view === "patterns" ? C.fg : C.muted, borderColor: view === "patterns" ? C.brand : C.border }}>⧉ patterns</button>
              <button onClick={() => setView("timeline")} style={{ ...btn, color: view === "timeline" ? C.fg : C.muted, borderColor: view === "timeline" ? C.brand : C.border }}>≡ timeline</button>
            </span>
          </div>

          {view === "map" && (
            <ControlCenter rows={rows} groups={groups} onPick={(pk) => { setView("patterns"); setOpenPattern(pk); }} />
          )}

          {view === "patterns" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {groups.map((g: any) => {
                const isOpen = openPattern === g.pattern_key;
                const members = rows.filter((r: any) => r.pattern_key === g.pattern_key);
                return (
                  <div key={g.pattern_key} style={{ background: C.panel, border: `1px solid ${g.count >= 5 ? C.bad : g.count >= 3 ? C.warn : C.border}`, borderRadius: 8, overflow: "hidden" }}>
                    <div onClick={() => setOpenPattern(isOpen ? null : g.pattern_key)}
                      style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", cursor: "pointer", background: isOpen ? C.panel2 : "transparent" }}>
                      <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: g.count >= 5 ? C.bad : g.count >= 3 ? C.warn : C.fg, minWidth: 34, textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 10, padding: "1px 6px" }}>{g.count}×</span>
                      {kindBadge(g.kind)}
                      <span style={{ fontFamily: mono, fontSize: 11, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={g.sample_title}>{g.pattern_key}</span>
                      {g.count >= 3 && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.warn, border: `1px dashed ${C.warn}`, borderRadius: 4, padding: "1px 6px" }} title="a recurring pattern is a candidate for a failure-advice rule, a lint dimension, or a law">recurring — teach it</span>}
                      <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{String(g.first_ts ?? "").slice(5, 16)} → {String(g.last_ts ?? "").slice(5, 16)}</span>
                    </div>
                    {isOpen && (
                      <div>
                        {g.cards?.length > 0 && (
                          <div style={{ padding: "4px 12px", fontFamily: mono, fontSize: 9, color: C.muted, borderTop: `1px solid ${C.border}` }}>cards: {g.cards.join(" · ")}</div>
                        )}
                        {members.map((r: any) => (
                          <div key={rowKey(r)}>
                            <div onClick={() => setOpenRow(openRow === rowKey(r) ? null : rowKey(r))}
                              style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 12px", borderTop: `1px solid ${C.border}`, cursor: "pointer", fontFamily: mono, fontSize: 10.5, color: C.fg }}>
                              {sevDot(r.severity)}
                              <span style={{ color: C.dim, fontSize: 9 }}>{String(r.ts ?? "").slice(5, 16)}</span>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{r.title}</span>
                              {r.card_slug && <span style={{ color: C.muted, fontSize: 9 }}>{String(r.card_slug).slice(0, 28)}</span>}
                            </div>
                            {openRow === rowKey(r) && <RowDetail r={r} />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {view === "timeline" && (
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              {rows.map((r: any) => (
                <div key={rowKey(r)}>
                  <div onClick={() => setOpenRow(openRow === rowKey(r) ? null : rowKey(r))}
                    style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 12px", borderTop: `1px solid ${C.border}`, cursor: "pointer", fontFamily: mono, fontSize: 10.5, color: C.fg, background: openRow === rowKey(r) ? C.panel2 : "transparent" }}>
                    {sevDot(r.severity)}
                    <span style={{ color: C.dim, fontSize: 9, minWidth: 74 }}>{String(r.ts ?? "").slice(5, 16)}</span>
                    {kindBadge(r.kind)}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={r.title}>{r.title}</span>
                    {r.card_slug && <span style={{ color: C.muted, fontSize: 9 }}>{String(r.card_slug).slice(0, 30)}</span>}
                  </div>
                  {openRow === rowKey(r) && <RowDetail r={r} />}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
