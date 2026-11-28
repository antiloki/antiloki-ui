import React, { useEffect, useMemo, useState } from "react";
import { useShell } from "@/loki/shell/slug-context";
import { useAICallDetail } from "@/loki/api/hooks";
import { BE_URL } from "@/loki/api/client";
import { CognitionBadge, type CognitionKind } from "@/loki/shell/cognition-badge";
import { HeimdallFlag } from "@/loki/components/HeimdallFlag";
import { C } from "@/loki/theme";


const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
const TIER_MAP: Record<string, CognitionKind> = { low: "script", mid: "narrow", high: "broad" };

type Tab = "stats" | "swarm" | "prompt" | "input" | "output" | "context" | "heimdall" | "retries";

export function AICallModalRoot() {
  const { aiCallId, setAiCallId } = useShell();
  // THE GLOBAL CHIP NAVIGATOR (operator report 2026-07-05: "clicking shows nothing").
  // Every cross-call chip in the app — cached-from #, reason #, format #, retry siblings,
  // Settings→Heimdall judge-call links — fires window.antilokiOpenAICall?.(id)… which was
  // NEVER REGISTERED anywhere, so the whole navigation class silently no-op'd. The modal
  // root is mounted globally (__root), so this is the one true place to bind it.
  useEffect(() => {
    (window as any).antilokiOpenAICall = (id: number) => { const n = Number(id); if (Number.isFinite(n) && n > 0) setAiCallId(n); };
    return () => { delete (window as any).antilokiOpenAICall; };
  }, [setAiCallId]);
  if (aiCallId == null) return null;
  return <Modal id={aiCallId} onClose={() => setAiCallId(null)} />;
}

function Modal({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, loading, notWired, error } = useAICallDetail(id);
  const [tab, setTab] = useState<Tab>("stats");
  const [showRaw, setShowRaw] = useState(false);

  const call = data?.call;
  const outputTree = useMemo(() => buildTree(data?.output_kv ?? []), [data]);

  return (
    <div
      onClick={onClose}
      data-testid="ai-call-modal"
      /* z 9999: the AI-call window is the app's TOP overlay — it must hover
         above every cockpit surface (fullscreen panes 260, shape/course
         overlays 320, dossier 340, press modal 400) so it's never buried
         (operator 2026-07-15). It's mounted at __root, so this wins outright. */
      style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.55)", zIndex: 9999, display: "grid", placeItems: "center", padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(900px, 96vw)", maxHeight: "92vh",
          background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12,
          display: "flex", flexDirection: "column", overflow: "hidden",
          fontFamily: '-apple-system, system-ui, sans-serif', color: C.fg,
        }}
      >
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>AI call</span>
          <span style={{ fontFamily: mono, fontSize: 13, color: C.fg }}>#{id}</span>
          {call && (
            <>
              <span style={{ color: C.muted }}>·</span>
              <span style={{ fontSize: 12 }}>{call.prompt_name}</span>
              <span style={{ color: C.muted }}>·</span>
              <span style={{ fontSize: 12, color: C.dim }}>{call.agent}</span>
              <CognitionBadge kind={TIER_MAP[call.tier]} detail={call.model_id} cost={call.cost_usd} latency={`${(call.duration_ms / 1000).toFixed(2)}s`} compact />
              <span style={{ marginLeft: "auto" }} />
              {call.cached_from_id && (
                <button onClick={() => (call.cached_from_id != null) && (window as any).antilokiOpenAICall?.(call.cached_from_id)}
                  style={chipBtn}>cached from #{call.cached_from_id}</button>
              )}
              {/* EPIC-AI-BEHAVIOR-STUDY: two-phase pair navigation (same
                  pattern as the cached-from chip). */}
              {call.reason_call_id != null && (
                <button onClick={() => (window as any).antilokiOpenAICall?.(call.reason_call_id)}
                  style={chipBtn}>reason #{call.reason_call_id}</button>
              )}
              {(data?.pair?.format_call_ids ?? []).map((fid: number) => (
                <button key={fid} onClick={() => (window as any).antilokiOpenAICall?.(fid)}
                  style={chipBtn}>format #{fid}</button>
              ))}
            </>
          )}
          <button onClick={onClose} style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {data?.validation_errors?.length ? (
          <div style={{ padding: 12, background: `color-mix(in oklab, ${C.bad} 14%, transparent)`, borderBottom: `1px solid ${C.border}`, color: C.bad, fontSize: 12, fontFamily: mono }}>
            <div style={{ marginBottom: 4, fontWeight: 600 }}>validation_failed</div>
            {data.validation_errors.map((e: string, i: number) => <div key={i}>· {e}</div>)}
            {data.raw_output_on_failure && (
              <button onClick={() => setShowRaw(s => !s)} style={{ marginTop: 6, ...chipBtn }}>{showRaw ? "hide" : "show"} raw output</button>
            )}
            {showRaw && (
              <pre style={{ marginTop: 8, background: C.bg, padding: 10, borderRadius: 6, color: C.fg, overflow: "auto" }}>
{data.raw_output_on_failure}
              </pre>
            )}
          </div>
        ) : null}

        {/* EPIC-AI-BEHAVIOR-STUDY: postmortem diagnosis attached to the call. */}
        {data?.report ? (
          <div style={{ padding: 12, borderBottom: `1px solid ${C.border}`, fontSize: 12, fontFamily: mono }}>
            <div style={{ marginBottom: 4, color: C.muted, textTransform: "uppercase", letterSpacing: 1, fontSize: 10 }}>
              diagnosis · {data.report.failure_class} · {data.report.severity}
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: C.fg }}>{data.report.diagnosis_md}</pre>
            {data.report.narrative_md && (
              <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", color: C.dim }}>{data.report.narrative_md}</pre>
            )}
            {data.report.recommendation_md && (
              <div style={{ marginTop: 8, padding: "6px 8px", border: `1px dashed ${C.brand}`, borderRadius: 6, color: C.brand }}>
                ⚑ {data.report.recommendation_md}
              </div>
            )}
          </div>
        ) : null}

        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "0 16px", gap: 4 }}>
          {(["stats", ...((data as any)?.swarm ? ["swarm"] : []), "prompt", "input", "output", ...(data?.context_bundle ? ["context"] : []), ...(data?.heimdall ? ["heimdall"] : []), "retries"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: "transparent", border: "none", borderBottom: tab === t ? `2px solid ${C.brand}` : "2px solid transparent",
              color: tab === t ? C.fg : C.dim, padding: "10px 12px", cursor: "pointer", fontFamily: mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1,
            }}>{t}{t === "retries" ? ` (${data?.retry_attempts?.length ?? 0})` : t === "context" ? ` (${data?.context_bundle?.item_count ?? 0})` : t === "swarm" ? ` (${(data as any)?.swarm?.totals?.calls ?? 0})` : ""}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          {loading && <Loading />}
          {error && !data && <div style={{ color: C.bad }}>Failed to load call detail.</div>}
          {notWired && <div style={{ color: C.muted, fontFamily: mono, fontSize: 12 }}>BE endpoint <code>/api/v1/ai-calls/:id</code> not yet wired.</div>}

          {data && tab === "stats" && (() => {
            const c = data.call;
            const tin = c.tokens_in ?? 0, tout = c.tokens_out ?? 0;
            const cb = data.context_bundle;
            const cached = c.outcome === "cached" || c.cached_from_id != null;
            const money = (v: number) => "$" + (v ?? 0).toFixed(5);
            const tile = (label: string, value: React.ReactNode, tone: string = C.fg) => (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg, padding: "11px 13px", minWidth: 0 }}>
                <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: tone, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{value}</div>
                <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginTop: 3 }}>{label}</div>
              </div>
            );
            const row = (k: string, v: React.ReactNode) => (
              <tr>
                <td style={{ ...tdKey, whiteSpace: "nowrap" }}>{k}</td>
                <td style={{ ...tdVal, fontFamily: mono, fontSize: 12 }}>{v}</td>
              </tr>
            );
            const outColor = c.outcome === "success" ? C.ok : c.outcome === "cached" ? C.brand : C.bad;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* headline tiles */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                  {tile("cost", cached ? "$0" : money(c.cost_usd), cached ? C.brand : (c.cost_usd ?? 0) > 0 ? C.warn : C.ok)}
                  {tile("tokens total", (tin + tout).toLocaleString(), C.fg)}
                  {tile("duration", `${(c.duration_ms / 1000).toFixed(2)}s`, C.fg)}
                  {tile("outcome", c.outcome, outColor)}
                </div>
                {/* the detail table — the information received from the provider */}
                <table style={{ ...tableStyle, tableLayout: "fixed" }}>
                  <tbody>
                    {row("AI used", <span>{c.provider ?? "—"} · <b style={{ color: C.fg }}>{c.model_id ?? "—"}</b></span>)}
                    {row("tier · temperature", `${c.tier} · ${c.temperature}`)}
                    {row("tokens in → out", `${tin.toLocaleString()} → ${tout.toLocaleString()}  (Σ ${(tin + tout).toLocaleString()})`)}
                    {row("cost", cached ? <span style={{ color: C.brand }}>$0 · cache replay{c.cached_from_id != null ? ` from #${c.cached_from_id}` : ""}</span> : money(c.cost_usd))}
                    {row("duration", `${c.duration_ms.toLocaleString()} ms  (${(c.duration_ms / 1000).toFixed(2)}s)`)}
                    {row("when", c.ts)}
                    {row("outcome", <span style={{ color: outColor }}>{c.outcome}</span>)}
                    {row("prompt", `${c.prompt_name} · v${c.prompt_version}`)}
                    {row("agent", c.agent || "—")}
                    {(c.reason_call_id != null || (data.pair?.format_call_ids?.length ?? 0) > 0) && row("two-phase", `${c.reason_call_id != null ? `reason #${c.reason_call_id}` : ""}${(data.pair?.format_call_ids?.length ?? 0) ? ` · format ${(data.pair!.format_call_ids).map((f) => "#" + f).join(", ")}` : ""}`)}
                    {(data.retry_attempts?.length ?? 0) > 0 && row("retries", `${data.retry_attempts.length}`)}
                    {cb && row("context assembled", `${cb.total_tokens.toLocaleString()} tok · ${cb.item_count} items (${cb.bone_tokens.toLocaleString()} bone + ${cb.sliced_tokens.toLocaleString()} sliced)${cb.budget != null ? ` · budget ${cb.budget.toLocaleString()}${cb.over_budget ? " · OVER" : ""}` : ""}`)}
                  </tbody>
                </table>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>every number is what the provider reported for this exact call · metered through ai-call</span>
              </div>
            );
          })()}
          {data && tab === "swarm" && (() => {
            // THE SWARM LEDGER (operator 2026-07-19): this call rode a shared
            // session — sum the whole crew: tokens, money, compute vs wall time.
            const sw = (data as any).swarm;
            if (!sw) return null;
            const t2 = sw.totals;
            const money = (v: number) => "$" + (v ?? 0).toFixed(5);
            const secs = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`);
            const tile = (label: string, value: React.ReactNode, tone: string = C.fg) => (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg, padding: "11px 13px", minWidth: 0 }}>
                <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: tone, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{value}</div>
                <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginTop: 3 }}>{label}</div>
              </div>
            );
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>
                  swarm <span style={{ color: C.fg }}>{sw.session_id}</span> — {t2.calls} calls fired as one crew; this window's call is one of them
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                  {tile("total cost", money(t2.cost_usd), t2.cost_usd > 0 ? C.warn : C.ok)}
                  {tile("tokens in → out", `${t2.tokens_in.toLocaleString()} → ${t2.tokens_out.toLocaleString()}`)}
                  {tile("compute time", secs(t2.compute_ms))}
                  {tile("wall time", secs(t2.wall_ms), C.brand)}
                  {tile("outcomes", `${t2.success}✓ ${t2.cached}⚡ ${t2.failed}✕`, t2.failed ? C.bad : C.ok)}
                </div>
                {t2.wall_ms != null && t2.compute_ms > 0 && t2.wall_ms > 0 && (
                  <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>
                    parallelism {Math.max(1, t2.compute_ms / t2.wall_ms).toFixed(1)}× — {secs(t2.compute_ms)} of model time compressed into {secs(t2.wall_ms)} of waiting{t2.tokens_cached > 0 ? ` · ${t2.tokens_cached.toLocaleString()} input tokens served from the provider's cache` : ""}
                  </div>
                )}
                <table style={{ ...tableStyle }}>
                  <thead><tr>
                    {["call", "model", "tokens in→out", "cost", "duration", "outcome"].map((hd) => (
                      <th key={hd} style={{ textAlign: "left", padding: "4px 10px", color: C.muted, fontFamily: mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1, borderBottom: `1px solid ${C.border}` }}>{hd}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {sw.calls.map((r: any) => (
                      <tr key={r.id} style={{ background: r.id === id ? `color-mix(in oklab, ${C.brand} 8%, transparent)` : "transparent" }}>
                        <td style={{ padding: "4px 10px", borderBottom: `1px solid ${C.border}` }}>
                          <button onClick={() => (window as any).antilokiOpenAICall?.(r.id)} style={chipBtn}>#{r.id}{r.id === id ? " ◀" : ""}</button>
                        </td>
                        <td style={{ padding: "4px 10px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 11, color: C.fg }}>{r.model_id ?? r.tier}</td>
                        <td style={{ padding: "4px 10px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 11, color: C.fg, fontVariantNumeric: "tabular-nums" }}>{(r.tokens_in ?? 0).toLocaleString()} → {(r.tokens_out ?? 0).toLocaleString()}</td>
                        <td style={{ padding: "4px 10px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 11, color: r.cached ? C.brand : C.fg }}>{r.cached ? "$0 ⚡" : money(r.cost_usd)}</td>
                        <td style={{ padding: "4px 10px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 11, color: C.fg }}>{((r.duration_ms ?? 0) / 1000).toFixed(2)}s</td>
                        <td style={{ padding: "4px 10px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 11, color: r.outcome === "success" ? C.ok : C.bad }}>{r.outcome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>every row is an ai_calls record sharing this swarm's session_id · sums are the provider-reported numbers, nothing estimated</span>
              </div>
            );
          })()}
          {data && tab === "prompt" && (
            <>
              {data.rendered_source && (
                <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginBottom: 6 }}>
                  {data.rendered_source === "persisted"
                    ? "provider-witnessed (persisted at dispatch)"
                    : "reconstructed from template + persisted inputs"}
                  {" · "}{(data.rendered_prompt?.length ?? 0).toLocaleString()} chars · complete, nothing clipped
                </div>
              )}
              {data.system_md && (
                <>
                  <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, margin: "0 0 4px" }}>SYSTEM</div>
                  <pre style={{ ...preStyle, marginBottom: 10, color: C.dim }}>{data.system_md}</pre>
                  <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, margin: "0 0 4px" }}>PROMPT</div>
                </>
              )}
              <pre style={preStyle}>{data.rendered_prompt || "(no rendered prompt)"}</pre>
            </>
          )}
          {data && tab === "input" && (
            <table style={tableStyle}>
              <tbody>
                {data.input_kv.map((kv, i) => (
                  <tr key={i}>
                    <td style={tdKey}>{kv.key}</td>
                    <td style={tdVal}><pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: mono, fontSize: 11 }}>{kv.value}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data && tab === "output" && (
            <OutputTree nodes={outputTree} depth={0} />
          )}
          {data && tab === "context" && (
            <ContextBundleView bundle={data.context_bundle} />
          )}
          {data && tab === "heimdall" && (
            <>
              {/* the PER-SURFACE routing flag — this template's every future call obeys it */}
              {data.call?.prompt_name && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>routing for {data.call.prompt_name}</span>
                  <HeimdallFlag template={data.call.prompt_name} />
                </div>
              )}
              <HeimdallTraceView h={data.heimdall} callId={id} />
            </>
          )}
          {data && tab === "retries" && (
            <>
              {/* EPIC-AI-BEHAVIOR-STUDY: the in-call retry ladder — each
                  attempt with its correction banner and raw output. */}
              {(data.attempts?.length ?? 0) > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                    in-call attempts ({data.attempts?.length ?? 0})
                  </div>
                  {(data.attempts ?? []).map((a: any) => (
                    <div key={a.attempt_no} style={{ marginBottom: 10, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                      <div style={{ fontFamily: mono, fontSize: 11, marginBottom: 6 }}>
                        <span style={{ color: a.outcome === "success" ? "oklch(0.75 0.15 150)" : C.bad }}>
                          attempt #{a.attempt_no} · {a.outcome}
                        </span>
                        <span style={{ color: C.muted }}> · {a.ts}</span>
                      </div>
                      {a.validation_errors?.length ? (
                        <div style={{ fontFamily: mono, fontSize: 11, color: C.bad, marginBottom: 6 }}>
                          {a.validation_errors.map((e: string, i: number) => <div key={i}>· {e}</div>)}
                        </div>
                      ) : null}
                      {a.correction_md && (
                        <details style={{ marginBottom: 6 }}>
                          <summary style={{ cursor: "pointer", fontFamily: mono, fontSize: 11, color: C.brand }}>correction sent before this attempt</summary>
                          <pre style={{ ...preStyle, marginTop: 6 }}>{a.correction_md}</pre>
                        </details>
                      )}
                      {a.raw_output_md && (
                        <details>
                          <summary style={{ cursor: "pointer", fontFamily: mono, fontSize: 11, color: C.dim }}>raw output of this attempt</summary>
                          <pre style={{ ...preStyle, marginTop: 6 }}>{a.raw_output_md}</pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                sibling calls (same template + inputs)
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {(data.retry_attempts || []).map(r => (
                  <li key={r.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                    <button onClick={() => { (window as any).antilokiOpenAICall?.(r.id); }} style={{ ...chipBtn, marginRight: 8 }}>#{r.id}</button>
                    <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{r.outcome} · {r.tier} · ${r.cost_usd.toFixed(4)} · {(r.duration_ms/1000).toFixed(2)}s</span>
                  </li>
                ))}
                {!data.retry_attempts?.length && <li style={{ color: C.muted, fontFamily: mono, fontSize: 12 }}>no retries</li>}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const chipBtn = { background: "transparent", border: "1px solid oklch(0.28 0.01 250)", color: "oklch(0.78 0.16 295)", fontFamily: mono, fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer" };
const preStyle = { margin: 0, whiteSpace: "pre-wrap" as const, fontFamily: mono, fontSize: 12, color: C.fg, background: C.bg, padding: 12, borderRadius: 6, border: `1px solid ${C.border}` };
const tableStyle = { width: "100%", borderCollapse: "collapse" as const, fontSize: 12 };
const tdKey = { padding: "6px 10px", border: `1px solid ${C.border}`, fontFamily: mono, color: C.brand, verticalAlign: "top" as const, width: 200 };
const tdVal = { padding: "6px 10px", border: `1px solid ${C.border}`, color: C.fg };

function Loading() {
  return <div style={{ color: C.muted, fontFamily: mono, fontSize: 12 }}>loading…</div>;
}

function buildTree(rows: any[]): any[] {
  const byParent: Record<string, any[]> = {};
  rows.forEach(r => {
    const k = r.parent_output_id == null ? "root" : String(r.parent_output_id);
    (byParent[k] = byParent[k] || []).push(r);
  });
  const build = (parent: string): any[] =>
    (byParent[parent] || [])
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map(r => ({ ...r, children: build(String(r.id)) }));
  return build("root");
}

function OutputTree({ nodes, depth }: { nodes: any[]; depth: number }) {
  if (!nodes.length && depth === 0) return <div style={{ color: C.muted, fontFamily: mono, fontSize: 12 }}>(empty output)</div>;
  return (
    <ul style={{ listStyle: "none", paddingLeft: depth === 0 ? 0 : 14, margin: 0 }}>
      {nodes.map((n, i) => {
        const val =
          n.value_text != null ? n.value_text :
          n.value_number != null ? String(n.value_number) :
          n.value_boolean != null ? String(n.value_boolean) :
          null;
        return (
          <li key={n.id ?? i} style={{ padding: "4px 0", borderLeft: depth > 0 ? `1px solid ${C.border}` : "none", paddingLeft: depth > 0 ? 12 : 0 }}>
            <span style={{ fontFamily: mono, fontSize: 11, color: C.brand }}>{n.field_name}</span>
            {val !== null && <span style={{ marginLeft: 8, fontFamily: mono, fontSize: 11, color: C.fg, whiteSpace: "pre-wrap" }}>{val}</span>}
            {n.children?.length ? <OutputTree nodes={n.children} depth={depth + 1} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

// HUMAN TAGGING (plan §0 #13) — the operator's verdict on THIS answer, the strongest
// evidence tier (provenance 'human', trust 1.0). Four verdicts, no neutral. One click =
// one evidence row; re-tagging replaces (latest word wins). The optional reason rides the
// tag row. Sparse clicks can never flip a casting alone — smoothing + sample floors govern.
const TAG_OPTS = [
  { v: -2, label: "−2 wrong", color: "oklch(0.68 0.19 25)" },
  { v: -1, label: "−1 weak", color: "oklch(0.75 0.14 60)" },
  { v: 1, label: "+1 good", color: "oklch(0.75 0.15 150)" },
  { v: 2, label: "+2 excellent", color: "oklch(0.78 0.16 295)" },
];
function HumanTagBar({ callId, existing }: { callId: number; existing?: { verdict: number; reason_md?: string | null } | null }) {
  const [current, setCurrent] = useState<number | null>(existing?.verdict ?? null);
  const [reason, setReason] = useState<string>(existing?.reason_md ?? "");
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const send = async (verdict: number) => {
    setBusy(verdict); setErr(false);
    try {
      const r = await fetch(`${BE_URL}/api/v1/heimdall/tag`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_call_id: callId, verdict, reason_md: reason.trim() || undefined, surface: "castings" }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setCurrent(verdict); setSavedAt(Date.now());
    } catch { setErr(true); } finally { setBusy(null); }
  };

  return (
    <div style={{ marginTop: 12, padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
          your verdict on this answer
        </span>
        {TAG_OPTS.map((o) => {
          const active = current === o.v;
          return (
            <button key={o.v} onClick={() => send(o.v)} disabled={busy != null}
              title={active ? "your current tag — click another to replace" : "tag this answer (feeds Heimdall's ledger at trust 1.0)"}
              style={{
                background: active ? `color-mix(in oklab, ${o.color} 18%, transparent)` : "transparent",
                border: `1px solid ${active ? o.color : C.border}`,
                color: active ? o.color : C.dim, borderRadius: 5, padding: "3px 10px",
                fontFamily: mono, fontSize: 11, cursor: "pointer",
              }}>{busy === o.v ? "…" : o.label}</button>
          );
        })}
        {savedAt && <span style={{ fontFamily: mono, fontSize: 10, color: "oklch(0.75 0.15 150)" }}>✓ recorded</span>}
        {err && <span style={{ fontFamily: mono, fontSize: 10, color: "oklch(0.68 0.19 25)" }}>✗ failed — BE restarted?</span>}
      </div>
      <input value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="optional: why? (rides the tag; helps the next run)"
        style={{ marginTop: 8, width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.fg, fontFamily: mono, fontSize: 11, padding: "5px 8px" }} />
    </div>
  );
}

// HEIMDALL §5.7-bis — the "process & proofs" tab. Renders the DECISION TRACE the router
// persisted for this call: classification, the gate floor, every ladder rung consulted
// with its live sample counts, hard filters, the score table with the evidence
// aggregates behind every number, and the final decision + reason. Nothing here is
// model-generated prose — every line is a row or a number, replayable from the ledger.
function HeimdallTraceView({ h, callId }: { h: any; callId: number }) {
  if (!h || !h.trace) {
    return (
      <div>
        <HumanTagBar callId={callId} existing={h?.human_tag} />
        <div style={{ color: C.muted, fontFamily: mono, fontSize: 12, marginTop: 10 }}>No casting recorded for this call (pre-Heimdall row, or the recorder was off).</div>
      </div>
    );
  }
  const t = h.trace;
  const sect = { fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase" as const, letterSpacing: 1, margin: "14px 0 6px" };
  const chip = (txt: string, color: string) => (
    <span style={{ fontFamily: mono, fontSize: 9.5, color, border: `1px solid ${color}`, borderRadius: 4, padding: "1px 7px", letterSpacing: 0.5 }}>{txt}</span>
  );
  const reasonColor = h.reason === "observe" ? C.muted : h.reason === "override" ? C.warn : C.brand;
  return (
    <div>
      {/* headline: who cast whom, and on what authority */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontFamily: mono, fontSize: 12 }}>
        <span style={{ color: C.brand, fontWeight: 700, letterSpacing: 1 }}>⚡ HEIMDALL</span>
        <span style={{ color: C.muted }}>→</span>
        <span style={{ color: C.fg }}>{h.effective_model ?? "(none)"}</span>
        {chip(h.reason, reasonColor)}
        {chip(h.category, C.brand)}
        <span style={{ color: C.dim, fontSize: 10.5 }}>{h.template_base} · tier floor {h.requested_tier}</span>
        {h.from_call_id != null && h.from_call_id !== callId && (
          <span style={{ color: C.muted, fontSize: 10 }}>· casting of source call #{h.from_call_id} (this row was a cache hit)</span>
        )}
      </div>
      {h.reason === "observe" && (
        <div style={{ marginTop: 8, padding: "6px 10px", border: `1px dashed ${C.border}`, borderRadius: 6, fontFamily: mono, fontSize: 10.5, color: C.muted }}>
          OBSERVE MODE — the provider default dispatched this call. Heimdall recorded the full resolution
          it WOULD have used, so you can audit its readiness before casting ever goes live.
        </div>
      )}

      <HumanTagBar callId={callId} existing={h.human_tag} />

      <div style={sect}>1 · classify (deterministic lookup)</div>
      <div style={{ fontFamily: mono, fontSize: 11.5, color: C.fg }}>
        {t.classify?.template_base ?? "?"} → <span style={{ color: C.brand }}>{t.classify?.category}</span>
        <span style={{ color: C.dim }}> ({t.classify?.family})</span>
        <span style={{ color: C.muted }}> · source: {t.classify?.source} · confidence {t.classify?.confidence}</span>
        {t.classify?.source === "unmapped" && <span style={{ color: C.bad }}> · UNMAPPED — heimdall.validate flags this</span>}
      </div>

      <div style={sect}>2 · gate floor (spend intent — per gate, in tier units)</div>
      <div style={{ fontFamily: mono, fontSize: 11.5, color: C.fg }}>
        requested tier <span style={{ color: C.brand }}>{t.floor?.requested_tier}</span>
        <span style={{ color: C.muted }}> · resolved by {t.floor?.resolved_by}</span>
        <span style={{ color: C.dim }}> — casting may seat above this floor, never below</span>
      </div>

      <div style={sect}>3 · ladder walk (specificity: template → category → family → global)</div>
      <table style={{ width: "100%", borderCollapse: "collapse" as const, fontFamily: mono, fontSize: 11 }}>
        <thead><tr>
          {["rung", "scope", "candidates", "may speak?"].map((hd) => (
            <th key={hd} style={{ textAlign: "left", padding: "4px 8px", color: C.muted, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1, borderBottom: `1px solid ${C.border}` }}>{hd}</th>
          ))}
        </tr></thead>
        <tbody>
          {(t.ladder ?? []).map((r: any, i: number) => {
            const resolvedHere = t.decision?.rung === r.rung;
            return (
              <tr key={i} style={{ background: resolvedHere ? `color-mix(in oklab, ${C.brand} 10%, transparent)` : "transparent" }}>
                <td style={{ padding: "4px 8px", color: resolvedHere ? C.brand : C.fg, borderBottom: `1px solid ${C.border}` }}>{r.rung}{resolvedHere ? " ◀ resolved" : ""}</td>
                <td style={{ padding: "4px 8px", color: C.dim, borderBottom: `1px solid ${C.border}` }}>{r.scope_ref}</td>
                <td style={{ padding: "4px 8px", color: C.fg, borderBottom: `1px solid ${C.border}` }}>{r.candidates}</td>
                <td style={{ padding: "4px 8px", color: r.sample_ok ? C.ok : C.muted, borderBottom: `1px solid ${C.border}` }}>{r.sample_ok ? "✓ sample_ok" : "— not enough evidence"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!t.decision?.rung && (
        <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, marginTop: 4 }}>
          no rung has statistical footing yet → passthrough to the tier's provider default (the honest cold-start state)
        </div>
      )}

      <div style={sect}>4 · hard filters (never in the score blend)</div>
      {(t.filters ?? []).length === 0
        ? <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>(none applied)</div>
        : (t.filters ?? []).map((f: any, i: number) => (
            <div key={i} style={{ fontFamily: mono, fontSize: 11, color: C.fg }}>
              {f.filter}: removed <span style={{ color: C.bad }}>{(f.removed ?? []).join(", ")}</span>
              {f.detail ? <span style={{ color: C.muted }}> — {f.detail}</span> : null}
            </div>
          ))}

      <div style={sect}>5 · scores — the proofs (evidence aggregates behind each number)</div>
      {(t.scores ?? []).length === 0
        ? <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>(no scored candidates yet — the ledger is still accruing evidence for this scope)</div>
        : (
          <table style={{ width: "100%", borderCollapse: "collapse" as const, fontFamily: mono, fontSize: 11 }}>
            <thead><tr>
              {["model", "score", "calls", "clean", "fails", "burns", "ships", "window"].map((hd) => (
                <th key={hd} style={{ textAlign: "left", padding: "4px 8px", color: C.muted, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1, borderBottom: `1px solid ${C.border}` }}>{hd}</th>
              ))}
            </tr></thead>
            <tbody>
              {(t.scores ?? []).map((s: any, i: number) => (
                <tr key={i} style={{ background: i === 0 ? `color-mix(in oklab, ${C.ok} 8%, transparent)` : "transparent" }}>
                  <td style={{ padding: "4px 8px", color: C.fg, borderBottom: `1px solid ${C.border}` }}>{s.model}</td>
                  <td style={{ padding: "4px 8px", color: C.brand, borderBottom: `1px solid ${C.border}` }}>{s.blended?.toFixed?.(4) ?? s.blended}</td>
                  <td style={{ padding: "4px 8px", color: C.fg, borderBottom: `1px solid ${C.border}` }}>{s.evidence?.calls ?? 0}</td>
                  <td style={{ padding: "4px 8px", color: C.ok, borderBottom: `1px solid ${C.border}` }}>{s.evidence?.clean ?? 0}</td>
                  <td style={{ padding: "4px 8px", color: C.bad, borderBottom: `1px solid ${C.border}` }}>{s.evidence?.fails ?? 0}</td>
                  <td style={{ padding: "4px 8px", color: C.warn, borderBottom: `1px solid ${C.border}` }}>{s.evidence?.burns ?? 0}</td>
                  <td style={{ padding: "4px 8px", color: C.ok, borderBottom: `1px solid ${C.border}` }}>{s.evidence?.ships ?? 0}</td>
                  <td style={{ padding: "4px 8px", color: C.muted, borderBottom: `1px solid ${C.border}` }}>{s.evidence?.window_days ?? 30}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

      <div style={sect}>6 · decision</div>
      <div style={{ fontFamily: mono, fontSize: 11.5, color: C.fg }}>
        {t.decision?.effective_model ?? "(provider default)"}
        <span style={{ color: C.muted }}> · reason: </span><span style={{ color: reasonColor }}>{t.decision?.reason}</span>
        {t.decision?.rung && <span style={{ color: C.muted }}> · resolved at the <span style={{ color: C.brand }}>{t.decision.rung}</span> rung</span>}
        {t.explore?.probe && <span style={{ color: C.warn }}> · probe diversion</span>}
        {t.explore?.quarantine && <span style={{ color: C.warn }}> · quarantine traffic</span>}
      </div>
    </div>
  );
}

// EPIC-CONTEXT-BUNDLE (docs/context-bundle.md §9): the glass-box Context tab. Renders the bone+sliced
// bundle assembled for this call — the Σ-vs-budget bar, each item expandable to its real text (bone in
// brand, sliced dim), plus what was dropped (over budget) and skipped (producer deferred/empty). Turns
// the prompt window into a glass box: exactly what context the AI got, and why it isn't more.
function ContextBundleView({ bundle }: { bundle: any }) {
  if (!bundle) return <div style={{ color: C.muted, fontFamily: mono, fontSize: 12 }}>This call did not route through the context-bundle resolver — no bone/sliced bundle recorded.</div>;
  const items = bundle.items ?? [];
  const dropped = bundle.dropped ?? [];
  const skipped = bundle.skipped ?? [];
  const total = bundle.total_tokens ?? 0;
  const budget = bundle.budget ?? 0;
  const pct = budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : 0;
  return (
    <div>
      <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, marginBottom: 8 }}>
        {bundle.agent || "?"}·{bundle.phase || "?"} · bone {bundle.bone_tokens ?? 0} + sliced {bundle.sliced_tokens ?? 0} = <span style={{ color: C.fg }}>~{total.toLocaleString()} tokens</span>
        {budget ? ` / ${budget.toLocaleString()} budget` : ""}
        {bundle.over_budget ? <span style={{ color: C.bad }}> · OVER BUDGET</span> : null}
      </div>
      {budget > 0 && (
        <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden", marginBottom: 12, border: `1px solid ${C.border}` }}>
          <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? C.bad : C.brand }} />
        </div>
      )}
      {items.map((it: any, i: number) => (
        <details key={i} style={{ marginBottom: 6, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px" }}>
          <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 11 }}>
            <span style={{ color: it.tier === "bone" ? C.brand : C.dim, textTransform: "uppercase", fontSize: 9, letterSpacing: 1, minWidth: 44 }}>{it.tier}</span>
            <span style={{ color: C.fg }}>{it.id}</span>
            <span style={{ color: C.muted }}>{it.type}{it.source ? ` · ${it.source}` : ""}</span>
            <span style={{ marginLeft: "auto", color: C.muted }}>
              ~{(it.tokens ?? 0).toLocaleString()} tok{it.relevance != null ? ` · rel ${it.relevance}` : ""}{it.freshness ? ` · ${it.freshness}` : ""}
            </span>
          </summary>
          <pre style={{ ...preStyle, marginTop: 6, maxHeight: 320, overflow: "auto" }}>{it.text || "(no text)"}</pre>
        </details>
      ))}
      {!items.length && <div style={{ color: C.muted, fontFamily: mono, fontSize: 12 }}>(no items in this bundle)</div>}
      {dropped.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.bad, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>dropped — over budget ({dropped.length})</div>
          {dropped.map((d: any, i: number) => <div key={i} style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>· {d.id} (~{d.tokens} tok) — {d.reason}</div>)}
        </div>
      )}
      {skipped.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>skipped — deferred / empty ({skipped.length})</div>
          {skipped.map((s: any, i: number) => <div key={i} style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>· {s.id} ({s.tier}) — {s.reason}</div>)}
        </div>
      )}
    </div>
  );
}
