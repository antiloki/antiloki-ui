// Read / display widgets. Each is a thin view over an existing hook or over the
// presenter's view_data payload — no new data plumbing. They render inside a
// chat turn (driven by the presenter's view_intent) or are summoned as a local
// widget message via the slash palette.
import React from "react";
import { Link } from "@tanstack/react-router";
import {
  useCard, useCards, usePipeline, useCostToday,
  useAuditTimeline, useMemoryList,
} from "@/loki/api/hooks";
import { DriverQueuePanel } from "@/loki/driver-queue-panel";
import { AtlasGraphMini, AtlasGraphOverlay } from "@/loki/codebase/atlas-graph";
import { explainSnippet, getAtlas } from "@/loki/api/codebase";
import { C, mono } from "@/loki/theme";
import { Markdown } from "@/loki/components/Markdown";
import { fetchPlans, decidePlan, planDecisionMessage } from "./context-pack";
import { sayToAgent } from "./agent-interact";
import { XrayArticle } from "./xray-article";
import { ConstitutionArticle } from "./constitution-article";
import { fetchArticleData } from "./artefact-compose";
import type { WidgetProps } from "./types";

function Frame({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 6, border: `1px solid ${C.border}`, borderRadius: 10,
      background: C.panel, overflow: "hidden", fontFamily: mono,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "7px 12px",
        borderBottom: `1px solid ${C.border}`, background: C.panel2,
      }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: C.dim }}>{label}</span>
        {hint && <span style={{ fontSize: 10, color: C.muted, marginLeft: "auto" }}>{hint}</span>}
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  doing: C.warn, done: C.ok, blocked: C.bad, backlog: C.dim, archived: C.muted,
};

// Pull a card array out of either the presenter's view_data or raw
// dispatch_results (the shape the presenter would have grouped).
function extractCards(payload: any): any[] {
  if (Array.isArray(payload)) {
    if (payload.length && payload[0]?.slug) return payload;
    for (const dr of payload) {
      if (dr?.ok && Array.isArray(dr.result) && dr.result[0]?.slug) return dr.result;
    }
    return [];
  }
  if (Array.isArray(payload?.cards)) return payload.cards;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

export function BoardWidget({ payload }: WidgetProps) {
  // Presenter-driven turns pass a card array in payload; a "/board" summon
  // passes null and falls back to the live cards list.
  const fromPayload = extractCards(payload);
  const cardsQ = useCards();
  const cards = fromPayload.length ? fromPayload : (cardsQ.data ?? []);
  if (cards.length === 0) return <Frame label="board"><Muted>no cards to show.</Muted></Frame>;
  const groups: Record<string, any[]> = {};
  for (const c of cards) (groups[c.status ?? "backlog"] ??= []).push(c);
  const order = ["doing", "blocked", "backlog", "done", "archived"];
  const keys = Object.keys(groups).sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return (
    <Frame label="board" hint={`${cards.length} cards`}>
      <div style={{ display: "flex", gap: 10, overflowX: "auto" }}>
        {keys.map((k) => (
          <div key={k} style={{ minWidth: 150, flex: 1 }}>
            <div style={{ fontSize: 10, color: STATUS_COLOR[k] ?? C.dim, textTransform: "uppercase", marginBottom: 6 }}>
              {k} · {groups[k].length}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {groups[k].slice(0, 12).map((c) => (
                <Link
                  key={c.slug}
                  to="/"
                  style={{
                    display: "block", textDecoration: "none", color: C.fg,
                    background: C.panel2, border: `1px solid ${C.border}`,
                    borderRadius: 6, padding: "6px 8px", fontSize: 11,
                  }}
                >
                  <div style={{ color: C.dim, fontSize: 10 }}>{c.slug}</div>
                  <div style={{ marginTop: 2 }}>{c.title}</div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function CardDetailWidget({ payload }: WidgetProps) {
  const slug = payload?.slug ?? null;
  const q = useCard(slug);
  const c = q.data;
  if (!slug) return <Frame label="card"><Muted>no card slug.</Muted></Frame>;
  return (
    <Frame label="card" hint={slug}>
      {q.loading && !c ? <Muted>loading…</Muted> : !c ? <Muted>card not found.</Muted> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: C.fg }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[c.status] ?? C.dim }} />
            <strong>{c.title}</strong>
            <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted }}>{c.status}</span>
          </div>
          <Field k="risk" v={c.risk} /><Field k="complexity" v={c.complexity} />
          <Field k="priority" v={c.priority} /><Field k="accuracy" v={c.accuracy_score} />
          <Link
            to="/"
            style={{ color: C.brand, fontSize: 11, textDecoration: "none", marginTop: 4 }}
          >open card →</Link>
        </div>
      )}
    </Frame>
  );
}

function Field({ k, v }: { k: string; v: any }) {
  if (v == null) return null;
  return <div style={{ fontSize: 11, color: C.dim }}>{k}: <span style={{ color: C.fg }}>{String(v)}</span></div>;
}

export function TableWidget({ payload }: WidgetProps) {
  const columns: string[] = payload?.columns ?? [];
  const rows: any[][] = payload?.rows ?? [];
  if (!columns.length || !rows.length) return <Frame label="table"><Muted>no rows.</Muted></Frame>;
  return (
    <Frame label="table" hint={`${rows.length} rows`}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11, color: C.fg, width: "100%" }}>
          <thead>
            <tr>{columns.map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "4px 8px", borderBottom: `1px solid ${C.border}`, color: C.dim }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map((r, i) => (
              <tr key={i}>{r.map((cell, j) => (
                <td key={j} style={{ padding: "4px 8px", borderBottom: `1px solid ${C.border}` }}>{String(cell)}</td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

export function CodeWidget({ payload }: WidgetProps) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return (
    <Frame label="code">
      <pre style={{
        margin: 0, maxHeight: 360, overflow: "auto", fontFamily: mono, fontSize: 11,
        color: C.fg, whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>{text}</pre>
    </Frame>
  );
}

// ── COMPOSABLE ANSWER WIDGETS (session #19) ──────────────────────────────────────────────────────
// A response emits a QUEUE of widgets (view_intent='tabs', view_data.tabs=[{label,kind,payload|split}]);
// each is a tab. A tab may be `split` → the SAME widget rendered twice side-by-side (before|after) for
// comparison. The widgets are distinct + frameless (TabsWidget supplies the one frame): answer ·
// code-sample (PLAIN code) · diff (the +/− change view — NOT the same as code-sample) · graph.

// LCS line diff → UNIFIED (stacked) rows. Unchanged lines plain; within a change hunk the − removed and
// + added lines are INTERLEAVED line-by-line (−old / +new / −old / +new), not all-dels-then-all-adds, so
// each changed line sits directly above its replacement (operator's pick).
function unifiedDiff(before: string, after: string) {
  const A = String(before).replace(/\n$/, "").split("\n");
  const B = String(after).replace(/\n$/, "").split("\n");
  const m = A.length, n = B.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const raw: any[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) { raw.push({ line: A[i], num: i + 1, t: "same" }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { raw.push({ line: A[i], num: i + 1, t: "del" }); i++; }
    else { raw.push({ line: B[j], num: j + 1, t: "add" }); j++; }
  }
  while (i < m) { raw.push({ line: A[i], num: i + 1, t: "del" }); i++; }
  while (j < n) { raw.push({ line: B[j], num: j + 1, t: "add" }); j++; }
  // interleave each contiguous del-run + add-run into −/+ pairs (leftovers trail at the end).
  const rows: any[] = [];
  let k = 0;
  while (k < raw.length) {
    if (raw[k].t === "del" || raw[k].t === "add") {
      const dels: any[] = [], adds: any[] = [];
      while (k < raw.length && (raw[k].t === "del" || raw[k].t === "add")) { (raw[k].t === "del" ? dels : adds).push(raw[k]); k++; }
      for (let x = 0; x < Math.max(dels.length, adds.length); x++) { if (x < dels.length) rows.push(dels[x]); if (x < adds.length) rows.push(adds[x]); }
    } else { rows.push(raw[k]); k++; }
  }
  return rows;
}

// per-line explain (the code-screen explain balloon), shared by the code-sample + diff widgets.
function useLineExplain(file?: string) {
  const [ex, setEx] = React.useState<Record<string, any>>({});
  const explain = async (key: string, snippet: string) => {
    if (!snippet || !String(snippet).trim()) return;
    setEx((m) => ({ ...m, [key]: { loading: true } }));
    const r = await explainSnippet({ snippet, path: file });
    setEx((m) => ({ ...m, [key]: r?.ok && r.explanation ? { text: r.explanation } : { err: r?.error ?? "no explanation returned" } }));
  };
  return { ex, explain };
}
function ExplainRow({ st }: { st: any }) {
  if (!st) return null;
  return (
    <div style={{ padding: "6px 10px", background: C.panel, borderBottom: `1px solid ${C.border}`, fontSize: 11, color: st.err ? C.bad : C.dim, lineHeight: 1.5, fontFamily: "-apple-system, system-ui, sans-serif" }}>
      {st.loading ? "explaining…" : (st.err ? `explain failed: ${st.err}` : st.text)}
    </div>
  );
}

// ARTIFACT widget — a Studio-generated document (overview / briefing / runbook / …) pasted into the
// chat: title + markdown body. payload: { item: { title?, body_md } } (a notebook-item shape).
export function ArtifactWidget({ payload }: WidgetProps) {
  const item = payload?.item ?? payload ?? {};
  // a bespoke ARTICLE artefact renders its designed component (deterministic, excalidraw figures).
  // Persisted rows carry only the RECIPE (article name, no data — the full report burst the payload
  // cap); the data re-derives from the substrate on render, $0, always current. A data snapshot
  // (legacy rows, fresh composes) renders directly. Everything else is a markdown paper.
  const isArticle = item.article === "xray" || item.article === "constitution";
  const [data, setData] = React.useState<any>(item.data ?? null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    if (!isArticle || item.data || data) return;
    let live = true;
    void fetchArticleData(item.article).then((d) => { if (live) { d ? setData(d) : setFailed(true); } });
    return () => { live = false; };
  }, [isArticle, item.article, item.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (isArticle) {
    if (!data) return (
      <div style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", background: C.bg, fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, color: failed ? C.warn : C.muted }}>
        {failed ? "the substrate didn't answer — rebuild the codebase, then reopen this artefact." : "regenerating from the substrate… ($0 · deterministic)"}
      </div>
    );
    return (
      <div style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", background: C.bg }}>
        {item.article === "xray" ? <XrayArticle data={data} /> : <ConstitutionArticle data={data} />}
      </div>
    );
  }
  // A PLAN ARTEFACT (2026-09-16): a plan an agent pane produced, rendered here with accept / reject.
  // The decision is recorded on the pane (.antiloki/plans/decisions.jsonl) and typed into the agent's
  // terminal, so the agent either proceeds or revises. Every artefact body is copiable.
  if (item.plan && item.plan.pane_id) return <PlanArtefact item={item} />;
  return (
    <div style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        {item.title && <div style={{ fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 13.5, fontWeight: 700, color: C.fg, marginBottom: 6, flex: 1 }}>{item.title}</div>}
        <CopyButton text={String(item.body_md ?? "")} />
      </div>
      <Markdown text={item.body_md || "_(empty)_"} />
    </div>
  );
}

/** ⧉ copy — any AI output, one click, with a two-second "copied" confirmation. */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* clipboard unavailable */ } }}
      title="copy to clipboard" style={{ background: "transparent", border: `1px solid ${done ? C.ok : C.border}`, color: done ? C.ok : C.muted, borderRadius: 5, padding: "1px 8px", cursor: "pointer", fontFamily: '"JetBrains Mono", monospace', fontSize: 9.5, flexShrink: 0 }}>
      {done ? "✓ copied" : `⧉ ${label ?? "copy"}`}
    </button>
  );
}

function PlanArtefact({ item }: { item: any }) {
  const plan = item.plan as { pane_id: number; file: string; engine?: string; title?: string };
  const [status, setStatus] = React.useState<{ status: string; reason?: string | null; decided_at?: string | null } | null>(null);
  const [body, setBody] = React.useState<string>(String(item.body_md ?? ""));
  const [reason, setReason] = React.useState("");
  const [rejecting, setRejecting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const refresh = React.useCallback(async () => {
    const [p] = await fetchPlans(plan.pane_id, plan.file);
    if (p) { setStatus({ status: p.status, reason: p.reason ?? null, decided_at: p.decided_at ?? null }); if (p.body_md) setBody(p.body_md); }
  }, [plan.pane_id, plan.file]);
  React.useEffect(() => { void refresh(); }, [refresh]);
  const decide = async (decision: "accepted" | "rejected") => {
    setBusy(true);
    try {
      const ok = await decidePlan(plan.pane_id, plan.file, decision, decision === "rejected" ? reason.trim() || undefined : undefined);
      if (ok) { await sayToAgent(plan.pane_id, planDecisionMessage(decision, item.title ?? plan.title ?? "plan", reason.trim() || undefined)); setRejecting(false); setReason(""); await refresh(); }
    } finally { setBusy(false); }
  };
  const tone = status?.status === "accepted" ? C.ok : status?.status === "rejected" ? C.bad : C.warn;
  const mono = '"JetBrains Mono", monospace';
  return (
    <div style={{ marginTop: 8, border: `1px solid ${tone}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontFamily: mono, fontSize: 9, color: tone, border: `1px solid ${tone}`, borderRadius: 10, padding: "0 8px", textTransform: "uppercase", letterSpacing: 0.6 }}>📋 plan · {status?.status ?? "…"}</span>
        <span style={{ fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 13.5, fontWeight: 700, color: C.fg, flex: 1 }}>{item.title}</span>
        <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{plan.engine ?? "agent"} · pane #{plan.pane_id}</span>
        <CopyButton text={body} />
      </div>
      {status?.status === "pending" && !rejecting && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button disabled={busy} onClick={() => void decide("accepted")} title="record the acceptance and tell the agent to proceed" style={{ background: C.ok, border: "none", color: C.bg, borderRadius: 6, padding: "3px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10.5, fontWeight: 700 }}>✓ accept</button>
          <button disabled={busy} onClick={() => setRejecting(true)} title="reject with a reason — the agent revises" style={{ background: "transparent", border: `1px solid ${C.bad}`, color: C.bad, borderRadius: 6, padding: "3px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>✕ reject</button>
        </div>
      )}
      {status?.status === "pending" && rejecting && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void decide("rejected"); if (e.key === "Escape") setRejecting(false); }} placeholder="why — the agent revises with this" style={{ flex: 1, background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 8px", fontFamily: mono, fontSize: 10.5, outline: "none" }} />
          <button disabled={busy} onClick={() => void decide("rejected")} style={{ background: C.bad, border: "none", color: C.bg, borderRadius: 6, padding: "3px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10.5, fontWeight: 700 }}>send rejection</button>
          <button onClick={() => setRejecting(false)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>cancel</button>
        </div>
      )}
      {status && status.status !== "pending" && (
        <div style={{ fontFamily: mono, fontSize: 9.5, color: tone, marginBottom: 8 }}>{status.status} {status.decided_at ? `· ${String(status.decided_at).slice(0, 19).replace("T", " ")}` : ""}{status.reason ? ` · ${status.reason}` : ""} — the agent was told{status.status === "rejected" ? "; a revised plan will show as pending again" : ""}</div>
      )}
      <Markdown text={body || "_(empty)_"} />
    </div>
  );
}

// ANSWER widget — the natural-language reply (target headline + rationale prose).
export function AnswerWidget({ payload }: WidgetProps) {
  const p = payload ?? {};
  return (
    <div style={{ paddingTop: 6 }}>
      {p.target && <div style={{ fontSize: 12.5, color: C.fg, marginBottom: 6, fontWeight: 600 }}>{p.target}</div>}
      <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, fontFamily: "-apple-system, system-ui, sans-serif" }}>{p.rationale ?? p.text ?? "(no content)"}</div>
    </div>
  );
}

// CODE-SAMPLE widget — PLAIN code (one snippet): line numbers + per-line explain. NOT a diff. To compare
// two snippets, render this twice via a split tab. payload: { code, language?, file? }.
export function CodeSampleWidget({ payload }: WidgetProps) {
  const p = typeof payload === "string" ? { code: payload } : (payload ?? {});
  const code = String(p.code ?? p.source ?? "");
  const { ex, explain } = useLineExplain(p.file);
  const lines = code.replace(/\n$/, "").split("\n");
  if (!code.trim()) return <div style={{ padding: 12, fontSize: 11, color: C.muted }}>no code.</div>;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginTop: 8 }}>
      <div style={{ maxHeight: 360, overflow: "auto" }}>
        {lines.map((ln, k) => {
          const key = `c${k}`; const st = ex[key];
          return (
            <div key={key}>
              <div style={{ display: "flex", alignItems: "flex-start", position: "relative", minHeight: 18 }}>
                <span style={{ width: 30, flexShrink: 0, textAlign: "right", padding: "1px 8px 0 0", color: C.muted, fontSize: 10, userSelect: "none" }}>{k + 1}</span>
                <code style={{ flex: 1, fontFamily: mono, fontSize: 11, color: C.fg, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5, padding: "0 16px 0 0" }}>{ln}</code>
                {ln.trim() && <button onClick={() => explain(key, ln)} title="explain this line" disabled={st?.loading}
                  style={{ position: "absolute", right: 2, top: 1, width: 15, height: 15, borderRadius: 4, border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 10, opacity: 0.65 }}>{st?.loading ? "…" : "?"}</button>}
              </div>
              <ExplainRow st={st} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// DIFF widget — the +/− change view (distinct from code-sample). VSCode-style side-by-side, LCS-aligned,
// per-line explain. payload: { before, after, file?, language? }.
export function DiffWidget({ payload }: WidgetProps) {
  const p = payload ?? {};
  const rows = React.useMemo(() => unifiedDiff(String(p.before ?? ""), String(p.after ?? "")), [p.before, p.after]);
  const { ex, explain } = useLineExplain(p.file);
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginTop: 8 }}>
      <div style={{ maxHeight: 360, overflow: "auto" }}>
        {rows.map((row, k) => {
          const key = `r${k}`; const st = ex[key];
          const sign = row.t === "del" ? "−" : row.t === "add" ? "+" : " ";
          const signColor = row.t === "del" ? C.bad : row.t === "add" ? C.ok : C.muted;
          const tint = row.t === "del" ? `color-mix(in oklab, ${C.bad} 11%, transparent)`
            : row.t === "add" ? `color-mix(in oklab, ${C.ok} 11%, transparent)` : "transparent";
          return (
            <div key={key}>
              <div style={{ display: "flex", alignItems: "flex-start", background: tint, position: "relative", minHeight: 18 }}>
                <span style={{ width: 30, flexShrink: 0, textAlign: "right", padding: "1px 6px 0 0", color: C.muted, fontSize: 10, userSelect: "none" }}>{row.num ?? ""}</span>
                <span style={{ width: 10, flexShrink: 0, color: signColor, fontSize: 11, userSelect: "none", textAlign: "center" }}>{sign}</span>
                <code style={{ flex: 1, fontFamily: mono, fontSize: 11, color: C.fg, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5, padding: "0 18px 0 2px" }}>{row.line}</code>
                {String(row.line).trim() && (
                  <button onClick={() => explain(key, row.line)} title="explain this line" disabled={st?.loading}
                    style={{ position: "absolute", right: 2, top: 1, width: 15, height: 15, borderRadius: 4, border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 10, opacity: 0.65 }}>{st?.loading ? "…" : "?"}</button>
                )}
              </div>
              <ExplainRow st={st} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// GRAPH widget — scoped atlas subgraph: flow pulse, zoom controls, ⛶ maximize → the full Atlas overlay.
// payload: { graph:{nodes,edges,flow} } or the graph object directly.
export function GraphWidget({ payload }: WidgetProps) {
  const graph = payload?.graph ?? payload;
  const [maximized, setMaximized] = React.useState(false);
  const [fullAtlas, setFullAtlas] = React.useState<any>(null);
  if (!graph?.nodes?.length) return <div style={{ padding: 14, fontSize: 11, color: C.muted, fontFamily: mono }}>no graph.</div>;
  const openFull = async () => {
    setMaximized(true);
    if (!fullAtlas) { try { const r = await getAtlas({}); if (r) setFullAtlas(r); } catch { /* keep the scoped graph */ } }
  };
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 9.5, color: C.dim, fontFamily: mono, marginBottom: 3 }}>
        {graph.nodes.length} relevant files{graph.flow ? " · ▶ flow" : ""} · scroll to zoom · ⛶ expand
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, overflow: "hidden" }}>
        <AtlasGraphMini atlas={graph} height={240} flow={graph.flow ?? undefined} controls onMaximize={openFull} />
      </div>
      {maximized && <AtlasGraphOverlay atlas={fullAtlas ?? graph} onClose={() => setMaximized(false)} />}
    </div>
  );
}

// SUMMARY / OVERVIEW widget — a distinct accented card at the TOP of a structured answer, giving the
// overall gist (the AI's 2-3 sentence framing) as markdown before the detail widgets below it.
export function SummaryWidget({ payload }: WidgetProps) {
  const text = typeof payload?.summary === "string" ? payload.summary : (typeof payload === "string" ? payload : "");
  if (!text.trim()) return null;
  return (
    <div style={{ marginTop: 6, marginBottom: 10, background: `color-mix(in oklab, ${C.brand} 7%, ${C.panel})`, border: `1px solid color-mix(in oklab, ${C.brand} 30%, ${C.border})`, borderLeft: `3px solid ${C.brand}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ color: C.brand, fontSize: 11 }}>✦</span>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.brand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Overview</span>
      </div>
      <div style={{ color: C.fg, fontSize: 13, lineHeight: 1.65 }}><Markdown text={text} compact /></div>
    </div>
  );
}

// IMPROVEMENTS widget — a LIST of suggested before/after improvements (answer to "what improvements do you
// suggest"). Each item is a collapsible card → its rationale + its own unified diff (reuses DiffWidget).
const CAT_COLOR: Record<string, string> = {
  "data-flow": "oklch(0.80 0.14 70)", structure: "oklch(0.74 0.13 300)", logic: "oklch(0.80 0.15 150)", standard: C.muted,
};
export function ImprovementsWidget({ payload, ctx }: WidgetProps) {
  const items = Array.isArray(payload?.improvements) ? payload.improvements : [];
  // ARTICLE: each rationale (markdown) reads top-to-bottom; the before/after diffs are COLLAPSED by default so
  // you skim and expand only the changes you care about. (The overall summary is its own SummaryWidget above.)
  const [open, setOpen] = React.useState<Set<number>>(() => new Set());
  const [carded, setCarded] = React.useState<Record<number, boolean>>({});
  const [cardedAll, setCardedAll] = React.useState(false);
  if (!items.length) return <div style={{ padding: 12, fontSize: 11, color: C.muted }}>No improvements were produced.</div>;
  const toggle = (i: number) => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  // "generate card": send a card-creation message as the user → the interviewer proposes board-keeper.card.add
  // (proper slug + schema-valid body + the law-hook trust the confirmed flow carries), then you confirm it.
  const makeCard = (imp: any, i: number) => {
    if (!ctx?.onAsk) return;
    const file = String(imp.file ?? "");
    ctx.onAsk(`Create a card to ${imp.target ?? "apply this improvement"} in \`${file}\`.\n\n${imp.rationale ?? ""}\n\nfiles_touched: ${file}`.trim());
    setCarded((m) => ({ ...m, [i]: true }));
  };
  // one card for the WHOLE response — all suggestions captured together.
  const makeAllCard = () => {
    if (!ctx?.onAsk) return;
    const files = [...new Set(items.map((it: any) => String(it.file ?? "")).filter(Boolean))];
    const list = items.map((it: any, i: number) => `${i + 1}. ${it.target ?? "improvement"} (${String(it.file ?? "")})`).join("\n");
    ctx.onAsk(`Create a card to apply these ${items.length} improvements:\n${list}\n\nfiles_touched: ${files.join(", ")}`);
    setCardedAll(true);
  };
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "0 2px" }}>
        <span style={{ fontSize: 10, color: C.muted, fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.6 }}>{items.length} improvement{items.length === 1 ? "" : "s"}</span>
        {ctx?.onAsk && (
          <button onClick={makeAllCard} disabled={cardedAll} title="file ALL of these as one card (you'll confirm it)"
            style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, border: `1px solid ${cardedAll ? C.border : C.brand}`, background: cardedAll ? "transparent" : `color-mix(in oklab, ${C.brand} 12%, transparent)`, color: cardedAll ? C.muted : C.brand, borderRadius: 5, padding: "3px 9px", cursor: cardedAll ? "default" : "pointer" }}>
            {cardedAll ? "✓ sent" : "+ card (all)"}
          </button>
        )}
      </div>
      {items.map((imp: any, i: number) => {
        const isOpen = open.has(i);
        // FULL path in the header (folders shown — two files can share a name): dim the dirs, emphasize the file.
        const p = String(imp.file ?? "");
        const slash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
        const dir = slash >= 0 ? p.slice(0, slash + 1) : "";
        const base = slash >= 0 ? p.slice(slash + 1) : p;
        return (
          <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 8, overflow: "hidden" }}>
            <div style={{ padding: "8px 10px 6px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, fontFamily: "-apple-system, system-ui, sans-serif", color: C.fg }}>{i + 1}. {imp.target ?? "improvement"}</span>
                {imp.category && (
                  <span title={`${imp.category} change`} style={{ flexShrink: 0, fontSize: 9, fontFamily: mono, color: CAT_COLOR[imp.category] ?? C.muted, border: `1px solid color-mix(in oklab, ${CAT_COLOR[imp.category] ?? C.muted} 55%, transparent)`, borderRadius: 4, padding: "1px 5px" }}>{imp.category}</span>
                )}
                {ctx?.onAsk && (
                  <button onClick={() => makeCard(imp, i)} disabled={carded[i]} title="file this as a card (you'll confirm it)"
                    style={{ flexShrink: 0, fontFamily: mono, fontSize: 10, border: `1px solid ${carded[i] ? C.border : C.brand}`, background: "transparent", color: carded[i] ? C.muted : C.brand, borderRadius: 5, padding: "2px 7px", cursor: carded[i] ? "default" : "pointer" }}>
                    {carded[i] ? "✓ sent" : "+ card"}
                  </button>
                )}
              </div>
              {p && (
                <div title={p} style={{ fontFamily: mono, fontSize: 9.5, marginTop: 3, wordBreak: "break-all", lineHeight: 1.4 }}>
                  <span style={{ color: C.muted }}>{dir}</span><span style={{ color: C.dim, fontWeight: 600 }}>{base}</span>
                </div>
              )}
            </div>
            {imp.rationale && <div style={{ padding: "0 10px 2px", color: C.dim, fontSize: 12, lineHeight: 1.6 }}><Markdown text={imp.rationale} compact /></div>}
            {/* The before/after expand only exists when the producer carried real code (the AI-shaped path).
                Structural findings (cycles / orphans / low-maintainability) are file-level — rationale only,
                no empty diff to expand into. */}
            {(imp.before || imp.after) && (
              <div style={{ padding: "4px 10px 8px" }}>
                <button onClick={() => toggle(i)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, background: isOpen ? C.panel2 : "transparent", border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", color: isOpen ? C.brand : C.dim, fontFamily: mono, fontSize: 10, padding: "3px 9px" }}>
                  <span>{isOpen ? "▾" : "▸"}</span> before &amp; after
                </button>
                {isOpen && <div style={{ marginTop: 6 }}><DiffWidget payload={{ before: imp.before, after: imp.after, file: imp.file, language: imp.language }} ctx={{} as any} /></div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// SOURCES widget (c1) — a collapsible list of the files/docs the answer was grounded in, each clickable.
export function SourcesWidget({ payload }: WidgetProps) {
  const sources: any[] = Array.isArray(payload?.sources) ? payload.sources : [];
  const [open, setOpen] = React.useState(false);
  if (!sources.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen((o) => !o)} title="the files & docs this answer was grounded in"
        style={{ fontFamily: mono, fontSize: 10, padding: "2px 0", border: "none", background: "transparent", color: C.muted, cursor: "pointer" }}>
        {open ? "▾" : "▸"} Sources · {sources.length}
      </button>
      {open && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
          {sources.map((s, i) => (s.kind === "file" && s.path) ? (
            <Link key={i} to="/operations/atlas" title={s.path}
              style={{ textDecoration: "none", fontFamily: mono, fontSize: 10, color: C.brand, wordBreak: "break-all" }}>▢ {s.path}</Link>
          ) : (
            <span key={i} style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>◆ {s.kind === "overview" ? "Codebase overview" : (s.path || s.kind)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// DIAGRAM widget — an Excalidraw-style architecture / data-flow explanation (the chat's "graph", replacing
// the AST force-graph). The AI authored a SEMANTIC spec {title, nodes:[{id,label,role}], edges:[{from,to,
// label}]}; here a deterministic LAYERED layout positions it (left→right by longest-path depth) and a clean
// SVG draws labeled boxes (coloured by role) + captioned arrows. The model never positions anything.
const ROLE_COLOR: Record<string, string> = {
  ui: "oklch(0.80 0.13 250)", state: "oklch(0.74 0.13 300)", logic: "oklch(0.80 0.15 150)",
  data: "oklch(0.82 0.13 70)", external: "oklch(0.70 0.03 250)",
};
const dgDir = (f: any) => { const s = String(f ?? "").replace(/\\/g, "/"); const i = s.lastIndexOf("/"); return i > 0 ? s.slice(0, i) : ""; };
const dgHue = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return ((h % 360) + 360) % 360; };

export function DiagramWidget({ payload }: WidgetProps) {
  const d = payload?.diagram ?? payload;
  // optional, passed via payload so the shared widget signature stays unchanged: click a node + an
  // in-diagram expand button (the blueprint tab uses both; plain diagrams pass neither → no-op).
  const onNodeClick = (payload as any)?.onNodeClick as ((id: string, n: any) => void) | undefined;
  const onExpand = (payload as any)?.onExpand as (() => void) | undefined;
  // folderZones (opt-in): cluster same-folder boxes + draw a labeled hull behind each folder, so the
  // diagram shows WHICH folder each file belongs to (the blueprint + code diagrams pass it; chat doesn't).
  const showFolders = !!(payload as any)?.folderZones;
  const nodes: any[] = Array.isArray(d?.nodes) ? d.nodes : [];
  const edges: any[] = Array.isArray(d?.edges) ? d.edges : [];
  const layout = React.useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const layer = new Map<string, number>(nodes.map((n) => [n.id, 0]));
    let changed = true, guard = 0;
    while (changed && guard++ < nodes.length + 2) {           // longest-path layering (cycle-safe via guard)
      changed = false;
      for (const e of edges) {
        if (!byId.has(e.from) || !byId.has(e.to)) continue;
        const nl = (layer.get(e.from) ?? 0) + 1;
        if (nl > (layer.get(e.to) ?? 0)) { layer.set(e.to, nl); changed = true; }
      }
    }
    const layers: Record<number, any[]> = {};
    for (const n of nodes) (layers[layer.get(n.id) ?? 0] ??= []).push(n);
    const maxLayer = Math.max(0, ...Object.keys(layers).map(Number));
    const BOXW = 138, BOXH = 56, GAPX = 60, GAPY = 22, FGAP = 16; // FGAP = extra gap between folder groups
    const pos = new Map<string, any>();
    for (let l = 0; l <= maxLayer; l++) {
      let row = layers[l] ?? [];
      // folder mode: cluster same-folder boxes within a column so their hull is contiguous.
      if (showFolders) row = [...row].sort((a, b) => dgDir(a.file).localeCompare(dgDir(b.file)) || String(a.label).localeCompare(String(b.label)));
      let y = 0, prevDir: string | null = null;
      row.forEach((n) => { const dir = dgDir(n.file); if (showFolders && prevDir != null && dir !== prevDir) y += FGAP; prevDir = dir; pos.set(n.id, { x: l * (BOXW + GAPX), y, w: BOXW, h: BOXH }); y += BOXH + GAPY; });
    }
    // folder hulls (bounding box per folder of its positioned boxes).
    const zones: any[] = [];
    if (showFolders) {
      const g = new Map<string, any>();
      for (const n of nodes) { const p = pos.get(n.id); const dir = dgDir(n.file); if (!p || !dir) continue; const z = g.get(dir) ?? { minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9 }; z.minX = Math.min(z.minX, p.x); z.minY = Math.min(z.minY, p.y); z.maxX = Math.max(z.maxX, p.x + p.w); z.maxY = Math.max(z.maxY, p.y + p.h); g.set(dir, z); }
      for (const [dir, z] of g) zones.push({ dir, label: dir.split("/").pop() || dir, x: z.minX - 8, y: z.minY - 20, w: z.maxX - z.minX + 16, h: z.maxY - z.minY + 28, hue: dgHue(dir) });
    }
    const allY = [...pos.values()].map((p) => p.y + p.h);
    return { pos, zones, W: Math.max(BOXW, (maxLayer + 1) * (BOXW + GAPX) - GAPX) + 8, H: Math.max(BOXH, ...allY) + 8 };
  }, [d, showFolders]);
  if (nodes.length < 2) return <div style={{ padding: 12, fontSize: 11, color: C.muted }}>no diagram.</div>;
  const { pos, zones, W, H } = layout as any;
  const pad = 16;
  // delta-dimming (AST-skeleton blueprint): a node carrying dim:true is the unchanged
  // neighborhood — faded so the touched (added/changed) nodes read at full opacity. An
  // edge touching a dimmed node fades with it. Plain diagrams (no dim flag) are unaffected.
  const dimSet = new Set(nodes.filter((n) => n.dim).map((n) => n.id));
  return (
    <Frame label="architecture" hint={d?.title ?? undefined}>
      {(d?.title || d?.caption) && (
        <div style={{ margin: "0 2px 8px" }}>
          {d?.title && <div style={{ fontSize: 12.5, fontWeight: 600, color: C.fg, fontFamily: "-apple-system, system-ui, sans-serif", marginBottom: 3 }}>{d.title}</div>}
          {d?.caption && <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.6 }}><Markdown text={String(d.caption)} compact /></div>}
        </div>
      )}
      <div style={{ position: "relative", overflow: "auto", maxHeight: 380, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
        {onExpand && (
          <button onClick={onExpand} title="Expand the diagram" style={{ position: "absolute", top: 6, right: 6, zIndex: 2, display: "inline-flex", alignItems: "center", gap: 4, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 7px", cursor: "pointer", color: C.dim, fontFamily: mono, fontSize: 10 }}>
            ⤢ expand
          </button>
        )}
        <svg width={W + pad * 2} height={H + pad * 2} style={{ display: "block", minWidth: "100%" }}>
          <defs><marker id="diag-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill={C.dim} /></marker></defs>
          <g transform={`translate(${pad},${pad})`}>
            {(zones ?? []).map((z: any) => (
              <g key={"fz" + z.dir}>
                <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={10} fill={`oklch(0.6 0.12 ${z.hue})`} fillOpacity={0.05} stroke={`oklch(0.62 0.12 ${z.hue})`} strokeOpacity={0.28} strokeWidth={1} strokeDasharray="3 3" />
                <text x={z.x + 8} y={z.y + 13} fontFamily={mono} fontSize={9.5} fill={`oklch(0.74 0.1 ${z.hue})`} opacity={0.75}>{z.label}/</text>
              </g>
            ))}
            {edges.map((e, i) => {
              const a = pos.get(e.from), b = pos.get(e.to); if (!a || !b) return null;
              const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
              const eDim = dimSet.has(e.from) || dimSet.has(e.to);
              return (
                <g key={i} opacity={eDim ? 0.25 : 1}>
                  <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 3},${y2}`} fill="none" stroke={C.dim} strokeWidth={1.3} opacity={0.7} markerEnd="url(#diag-arrow)" />
                  {e.label && <text x={mx} y={(y1 + y2) / 2 - 3} textAnchor="middle" fontFamily={mono} fontSize={8.5} fill={C.muted} paintOrder="stroke" stroke={C.bg} strokeWidth={3} strokeLinejoin="round">{String(e.label).slice(0, 20)}</text>}
                </g>
              );
            })}
            {nodes.map((n) => {
              const p = pos.get(n.id); if (!p) return null;
              const col = ROLE_COLOR[n.role] ?? ROLE_COLOR.logic;
              return (
                <g key={n.id} transform={`translate(${p.x},${p.y})`} opacity={n.dim ? 0.32 : 1}
                  onClick={onNodeClick ? () => onNodeClick(n.id, n) : undefined}
                  style={onNodeClick ? { cursor: "pointer" } : undefined}>
                  <rect width={p.w} height={p.h} rx={9} fill={`color-mix(in oklab, ${col} 14%, ${C.panel})`} stroke={col} strokeWidth={1.5} />
                  <text x={p.w / 2} y={17} textAnchor="middle" fontFamily={mono} fontSize={11} fontWeight={600} fill={C.fg}>{String(n.label).slice(0, 20)}</text>
                  {n.file
                    ? <text x={p.w / 2} y={31} textAnchor="middle" fontFamily={mono} fontSize={8} fill={C.dim}>{String(n.file).split(/[\\/]/).filter(Boolean).slice(-2).join("/").slice(0, 24)}</text>
                    : null}
                  <text x={p.w / 2} y={p.h - 7} textAnchor="middle" fontFamily={mono} fontSize={7.5} fill={col} opacity={0.85}>{n.role}</text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </Frame>
  );
}

// LOGIC-SPEC widget — the structured "design before code" (mini-AST): inputs → ordered steps (action +
// data transform) → outputs → calls. The shape of the logic, reviewable before any code exists; "→ write
// the code" sends it on to be turned into a snippet.
export function LogicSpecWidget({ payload, ctx }: WidgetProps) {
  const s = payload?.spec ?? payload;
  const [sent, setSent] = React.useState(false);
  if (!s || !Array.isArray(s.steps) || !s.steps.length) return <div style={{ padding: 12, fontSize: 11, color: C.muted }}>no logic design.</div>;
  const chip = (label: string, col: string) => <span style={{ fontFamily: mono, fontSize: 9.5, color: col, border: `1px solid color-mix(in oklab, ${col} 45%, transparent)`, borderRadius: 4, padding: "1px 6px" }}>{label}</span>;
  const writeCode = () => {
    if (!ctx?.onAsk) return;
    const lines = s.steps.map((st: any) => `${st.n}. ${st.action}${st.detail ? ` — ${st.detail}` : ""}`).join("\n");
    const io = (xs: any[]) => (xs ?? []).map((x: any) => `${x.name}${x.type ? `:${x.type}` : ""}`).join(", ") || "—";
    ctx.onAsk(`Write the code for this logic design${s.name ? ` (${s.name})` : ""}${s.file ? ` in \`${s.file}\`` : ""}:\n\ninputs: ${io(s.inputs)}\nsteps:\n${lines}\noutputs: ${io(s.outputs)}`);
    setSent(true);
  };
  const ioRow = (label: string, xs: any[], col: string) => (xs?.length > 0 ? (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginTop: 8 }}>
      <span style={{ fontSize: 9.5, color: C.muted, fontFamily: mono, marginRight: 2 }}>{label}</span>
      {xs.map((x: any, k: number) => <React.Fragment key={k}>{chip(`${x.name}${x.type ? ` : ${x.type}` : ""}`, col)}</React.Fragment>)}
    </div>
  ) : null);
  return (
    <div style={{ marginTop: 6, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, background: C.panel2, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.fg, flex: 1, fontFamily: mono }}>{s.name ?? "logic design"}</span>
        {ctx?.onAsk && <button onClick={writeCode} disabled={sent} title="turn this design into a code snippet"
          style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, border: `1px solid ${sent ? C.border : C.brand}`, background: sent ? "transparent" : `color-mix(in oklab, ${C.brand} 12%, transparent)`, color: sent ? C.muted : C.brand, borderRadius: 5, padding: "3px 9px", cursor: sent ? "default" : "pointer" }}>{sent ? "✓ sent" : "→ write the code"}</button>}
      </div>
      <div style={{ padding: 10 }}>
        {s.summary && <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5, marginBottom: 8, fontFamily: "-apple-system, system-ui, sans-serif" }}>{s.summary}</div>}
        {ioRow("in", s.inputs, "oklch(0.80 0.13 250)")}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
          {s.steps.map((st: any, k: number) => (
            <div key={k} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 9, background: `color-mix(in oklab, ${C.brand} 18%, transparent)`, color: C.brand, fontFamily: mono, fontSize: 10, display: "grid", placeItems: "center" }}>{st.n}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: C.fg, fontFamily: "-apple-system, system-ui, sans-serif" }}>{st.action}</div>
                {st.detail && <div style={{ fontSize: 11, color: C.muted, fontFamily: mono, marginTop: 1 }}>{st.detail}</div>}
              </div>
            </div>
          ))}
        </div>
        {ioRow("out", s.outputs, "oklch(0.80 0.15 150)")}
        {s.calls?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginTop: 6 }}>
            <span style={{ fontSize: 9.5, color: C.muted, fontFamily: mono, marginRight: 2 }}>calls</span>
            {s.calls.map((c: string, k: number) => <React.Fragment key={k}>{chip(c, C.muted)}</React.Fragment>)}
          </div>
        )}
      </div>
    </div>
  );
}

// TABS container — a response emits a QUEUE of widgets (payload.tabs); each is a tab. A tab can be
// `split` → the SAME widget rendered twice side-by-side (before | after) for comparison. Inner kinds
// resolve from a LOCAL map (same module → no registry circular import).
const TAB_KIND: Record<string, React.FC<WidgetProps>> = {
  answer: AnswerWidget, "code-sample": CodeSampleWidget, diff: DiffWidget, graph: GraphWidget, summary: SummaryWidget, improvements: ImprovementsWidget, diagram: DiagramWidget, "logic-spec": LogicSpecWidget,
};
export function TabsWidget({ payload, ctx }: WidgetProps) {
  const tabs = Array.isArray(payload?.tabs) ? payload.tabs : [];
  const [active, setActive] = React.useState(0);
  if (!tabs.length) return null;
  const cur = tabs[Math.min(active, tabs.length - 1)] ?? tabs[0];
  const Comp = TAB_KIND[cur.kind];
  return (
    <Frame label={payload?.label ?? "answer"} hint={payload?.hint}>
      <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.border}` }}>
        {tabs.map((t: any, i: number) => (
          <button key={i} onClick={() => setActive(i)}
            style={{ background: "transparent", border: "none", borderBottom: `2px solid ${i === active ? C.brand : "transparent"}`,
              color: i === active ? C.fg : C.muted, cursor: "pointer", fontFamily: mono, fontSize: 11, padding: "4px 11px", marginBottom: -1 }}>{t.label ?? t.kind}</button>
        ))}
      </div>
      {!Comp ? <div style={{ padding: 12, fontSize: 11, color: C.muted }}>unknown widget: {String(cur.kind)}</div>
        : cur.split ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1, color: C.bad, margin: "6px 0 -2px" }}>{cur.split.leftLabel ?? "before"}</div>
              <Comp payload={cur.split.left} ctx={ctx} />
            </div>
            <div>
              <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1, color: C.ok, margin: "6px 0 -2px" }}>{cur.split.rightLabel ?? "after"}</div>
              <Comp payload={cur.split.right} ctx={ctx} />
            </div>
          </div>
        ) : <Comp payload={cur.payload} ctx={ctx} />}
    </Frame>
  );
}

export function DriverQueueWidget() {
  return <div style={{ marginTop: 6 }}><DriverQueuePanel /></div>;
}

export function PipelineWidget({ payload }: WidgetProps) {
  const q = usePipeline();
  const stages = q.data?.stages ?? [];
  const slug = payload?.slug;
  if (q.data?.needs_migration) return <Frame label="pipeline"><Muted>pipeline needs migration.</Muted></Frame>;
  const byGroup: Record<string, any[]> = {};
  for (const s of stages) (byGroup[s.fe_group ?? "other"] ??= []).push(s);
  return (
    <Frame label="pipeline" hint={slug ? slug : `${stages.length} stages`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.entries(byGroup).map(([g, list]) => (
          <div key={g}>
            <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{g}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {list.map((s) => (
                <span key={s.stage_name} title={s.description ?? s.action_name ?? ""} style={{
                  fontSize: 10, color: C.fg, background: C.panel2,
                  border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 7px",
                }}>{s.stage_name}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      {slug && (
        <Link to="/" style={{ color: C.brand, fontSize: 11, textDecoration: "none", display: "inline-block", marginTop: 8 }}>
          open waterfall →
        </Link>
      )}
    </Frame>
  );
}

export function CostWidget() {
  const q = useCostToday();
  const d = q.data;
  return (
    <Frame label="cost" hint="today">
      {!d ? <Muted>loading…</Muted> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 24, fontWeight: 600, color: C.fg }}>${(d.spend_usd ?? 0).toFixed(2)}</div>
          <div style={{ fontSize: 11, color: C.muted }}>
            cap ${(d.cap_usd ?? 0).toFixed(2)} · {Math.round(d.cap_pct ?? 0)}% · {d.trend}
          </div>
          {(d.top_3_slugs ?? []).map((t) => (
            <div key={t.slug} style={{ fontSize: 11, color: C.dim, display: "flex", gap: 8 }}>
              <span style={{ flex: 1, color: C.fg }}>{t.slug}</span>
              <span>${t.cost_usd.toFixed(3)}</span>
              <span style={{ color: C.muted }}>{t.calls} calls</span>
            </div>
          ))}
        </div>
      )}
    </Frame>
  );
}

export function AuditTimelineWidget({ payload }: WidgetProps) {
  const filters = payload?.entity_id ? { entity_id: payload.entity_id, limit: 30 } : { limit: 30 };
  const q = useAuditTimeline(filters);
  const entries = q.data?.entries ?? [];
  return (
    <Frame label="audit" hint={payload?.entity_id ?? `${entries.length} events`}>
      {entries.length === 0 ? <Muted>no audit events.</Muted> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {entries.slice(0, 30).map((e) => (
            <div key={e.id} style={{ fontSize: 11, display: "flex", gap: 8 }}>
              <span style={{ color: C.muted, minWidth: 90 }}>{e.ts}</span>
              <span style={{ color: C.brand, minWidth: 70 }}>{e.actor}</span>
              <span style={{ color: C.fg, flex: 1 }}>{e.operation}</span>
              <span style={{ color: C.dim }}>{e.entity_id}</span>
            </div>
          ))}
        </div>
      )}
    </Frame>
  );
}

export function MemorySearchWidget({ payload }: WidgetProps) {
  const q = useMemoryList(payload?.query ? { q: payload.query } : {});
  // prefer the DETERMINISTIC payload (from widget.generate) when present; else self-fetch (slash / legacy).
  const items = Array.isArray(payload?.hits)
    ? payload.hits.map((h: any, i: number) => ({ id: i, type: h.type, title: h.title, summary_md: h.snippet }))
    : (q.data ?? []);
  return (
    <Frame label="memory" hint={payload?.query ? `“${payload.query}”` : `${items.length}`}>
      {items.length === 0 ? <Muted>no memories.</Muted> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.slice(0, 20).map((m: any) => (
            <div key={m.id} style={{ fontSize: 11 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ color: C.brand, textTransform: "uppercase", fontSize: 10 }}>{m.type}</span>
                <span style={{ color: C.fg }}>{m.title}</span>
              </div>
              <div style={{ color: C.dim, marginTop: 1 }}>{m.summary_md}</div>
            </div>
          ))}
        </div>
      )}
    </Frame>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: C.muted }}>{children}</div>;
}
