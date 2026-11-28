// THE AUDIT (operator 2026-09-23: "every AI answer or action from the agents is audited — cost (a deterministic
// calculator based on model vs tokens), time (a deterministic timer), tokens (a deterministic count)"). One row per
// call — a chat turn, a planner, a fill, the verifier, the QA gate, a reader — priced by the serve from the tokens the
// engine reported, timed by the serve's clock; the engine's own dollar figure beside it, never used for the sums.
// Every row also became a sample in the Merges table. Read-only.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";

export type AuditCall = { t: number; kind: string; job: string; engine: string; model: string; pane_id: number; run_id: number; ms: number; tokens_in: number; tokens_out: number; cache_read: number; cache_write: number; cost: number; cost_reported: number | null; ok: boolean };
export type AuditReport = { calls: AuditCall[]; by_model: { engine: string; model: string; calls: number; ms: number; tokens: number; cost: number; cost_reported: number; ok: number }[]; by_job: { job: string; calls: number; ms: number; cost: number }[]; total: { calls: number; cost: number; ms: number }; file?: string };
export const fmtMs = (ms: number) => ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
export const fmtTok = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
export const fmtUsd = (v: number) => `$${v < 0.01 ? v.toFixed(4) : v.toFixed(3)}`;
export function AuditScreen() {
  const [r, setR] = React.useState<AuditReport | null>(null);
  const [err, setErr] = React.useState("");
  React.useEffect(() => { void (async () => {
    try {
      const x: any = await apiGet("/api/v1/settings/audit?limit=300"); const d = x?.result ?? x;
      // a serve without this route answers with a body that has no `total` (2026-09-23: the screen crashed on it)
      if (!d || !d.total || !Array.isArray(d.calls)) { setErr(d?.error ?? d?.message ?? "the serve did not answer with an audit — restart it on the current build"); return; }
      setR(d as AuditReport);
    } catch (e: any) { setErr(e?.message || "could not read the audit"); }
  })(); }, []);
  const th: React.CSSProperties = { textAlign: "left", padding: "3px 6px", whiteSpace: "nowrap", fontFamily: mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 1 };
  const td: React.CSSProperties = { padding: "4px 6px", fontFamily: mono, fontSize: 10.5, whiteSpace: "nowrap" };
  return (
    <div data-testid="audit-screen" style={{ padding: "20px 24px", fontFamily: '-apple-system, system-ui, sans-serif', maxWidth: 1040 }}>
      <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>the audit · every call, priced by the serve</div>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px" }}>What every model did, how long it took, what it cost</h2>
      <p style={{ fontSize: 12, color: C.dim, margin: "0 0 12px", lineHeight: 1.5, maxWidth: 760 }}>
        One row per call — chat turns, planners, fills, verifiers, the QA gate, readers. <b>cost</b> is the deterministic price: the tokens the engine
        reported × the model's list price (cache reads at a tenth, cache writes at 1.25×). The engine's own figure is shown beside it and never summed.
        Time is the serve's own timer. Every row is also a sample in Merges.
      </p>
      {err && <div style={{ fontFamily: mono, fontSize: 11, color: C.bad }}>{err}</div>}
      {r && (<>
        <div data-testid="audit-total" style={{ display: "flex", gap: 18, fontFamily: mono, fontSize: 11, color: C.fg, marginBottom: 14 }}>
          <span>{r.total.calls} calls</span><span>{fmtMs(r.total.ms)} of model time</span><span style={{ color: C.brand, fontWeight: 700 }}>{fmtUsd(r.total.cost)} deterministic</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
          <div><div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>per model</div>
            <table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr>{["model", "calls", "ok", "time", "tokens", "cost", "engine said"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{r.by_model.map((m) => <tr key={`${m.engine}:${m.model}`} data-testid={`audit-model-${m.model.replace(/\//g, "-")}`} style={{ borderTop: `1px solid ${C.border}` }}><td style={td}>{m.engine} · {m.model.replace("opencode/", "") || "default"}</td><td style={td}>{m.calls}</td><td style={{ ...td, color: m.ok < m.calls ? C.warn : C.dim }}>{m.ok}/{m.calls}</td><td style={td}>{fmtMs(m.ms)}</td><td style={td}>{fmtTok(m.tokens)}</td><td style={{ ...td, color: C.brand }}>{fmtUsd(m.cost)}</td><td style={{ ...td, color: C.dim }}>{m.cost_reported ? fmtUsd(m.cost_reported) : "—"}</td></tr>)}</tbody></table></div>
          <div><div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>per job</div>
            <table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr>{["job", "calls", "time", "cost"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{r.by_job.map((j) => <tr key={j.job} style={{ borderTop: `1px solid ${C.border}` }}><td style={td}>{j.job}</td><td style={td}>{j.calls}</td><td style={td}>{fmtMs(j.ms)}</td><td style={{ ...td, color: C.brand }}>{fmtUsd(j.cost)}</td></tr>)}</tbody></table></div>
        </div>
        <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>the calls, newest first</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr>{["when", "kind", "job", "model", "pane / run", "time", "in", "out", "cache", "cost", "engine said", "ok"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{r.calls.map((c, i) => <tr key={`${c.t}-${i}`} data-testid={`audit-call-${i}`} style={{ borderTop: `1px solid ${C.border}`, color: c.ok ? C.fg : C.bad }}>
              <td style={td}>{new Date(c.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td><td style={td}>{c.kind}</td><td style={td}>{c.job}</td><td style={td}>{c.engine} · {c.model.replace("opencode/", "") || "default"}</td>
              <td style={{ ...td, color: C.dim }}>{c.pane_id ? `pane ${c.pane_id}` : ""}{c.run_id ? ` run ${c.run_id}` : ""}</td><td style={td}>{fmtMs(c.ms)}</td><td style={td}>{fmtTok(c.tokens_in)}</td><td style={td}>{fmtTok(c.tokens_out)}</td><td style={{ ...td, color: C.dim }}>{fmtTok(c.cache_read + c.cache_write)}</td>
              <td style={{ ...td, color: C.brand }}>{fmtUsd(c.cost)}</td><td style={{ ...td, color: C.dim }}>{c.cost_reported != null ? fmtUsd(c.cost_reported) : "—"}</td><td style={td}>{c.ok ? "✓" : "✗"}</td></tr>)}</tbody></table>
        </div>
        {r.file && <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginTop: 8 }}>{r.file}</div>}
      </>)}
    </div>
  );
}
