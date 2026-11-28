// THE EPISODE ARTICLE as a WIDGET (operator 2026-07-27: clicking a timeline beat "did nothing" —
// the old in-chat stitch mounted inside the chat overlay's body, which is usually collapsed; the
// dock queue is ALWAYS on stage). A timeline click docks this at the end of the queue, open.
// The article itself is the sentinel RECORD in the papers idiom — masthead → abstract (prose
// assembled from arithmetic, never a model) → §1 the conversation → §2 the production → §3 the
// ledger (cost bars) → sources, with the raw record one toggle away. Deterministic, $0.
import React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";
import type { WidgetProps } from "./types";

export function EpisodeArticleWidget({ payload }: WidgetProps) {
  const sessionId = Number((payload as any)?.session_id);
  const [eturns, setEturns] = React.useState<any[] | null>(null);
  const [erows, setErows] = React.useState<any[] | null>(null);
  const [raw, setRaw] = React.useState(false);
  React.useEffect(() => {
    if (!Number.isFinite(sessionId)) return;
    let on = true;
    void Promise.all([
      apiGet<any[]>(`/api/v1/sessions/${sessionId}/turns`),
      apiGet<any[]>(`/api/v1/sessions/${sessionId}/widgets`),
    ]).then(([t, w]) => { if (on) { setEturns(Array.isArray(t) ? t : []); setErows(Array.isArray(w) ? w : []); } });
    return () => { on = false; };
  }, [sessionId]);
  const d = React.useMemo(() => {
    if (!eturns) return null;
    const parseTs = (x: any) => { let v = String(x ?? "").trim().replace(" ", "T"); if (v && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(v)) v += "Z"; return new Date(v); };
    const hm = (x: any) => { const dd = parseTs(x); return Number.isFinite(dd.getTime()) ? dd.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }) : ""; };
    let cost = 0, dispatched = 0;
    const models = new Set<string>();
    const beats: { ts: string; q: string; a: string; cost: number }[] = [];
    for (const t of eturns as any[]) {
      const c = Number(t?.ai_cost_usd ?? 0) || 0;
      cost += c;
      const md = String(t?.model_id ?? "").split("/").pop();
      if (md) models.add(md);
      try { const dj = JSON.parse(t?.dispatched_action_ids_json ?? "null"); if (Array.isArray(dj) && dj.length) dispatched += 1; } catch { /* old row */ }
      beats.push({ ts: hm(t?.ts), q: String(t?.user_text ?? "").replace(/\s+/g, " ").trim(), a: String(t?.interviewer_response_md ?? "").replace(/\s+/g, " ").trim(), cost: c });
    }
    let meta: any = null, report: any = null, widgets = 0, artifacts = 0;
    const prod: { kind: string; uid: string | null; type: string }[] = [];
    for (const w of (erows ?? []) as any[]) {
      if (w?.kind === "episode-meta") { try { meta = JSON.parse(w.payload_json ?? "null"); } catch { /* */ } continue; }
      if (w?.kind === "episode-report") { try { report = JSON.parse(w.payload_json ?? "null"); } catch { /* */ } continue; }
      if (w?.kind === "session-context") continue;
      const type = w?.type === "artifact" ? "artefact" : "widget";
      if (type === "artefact") artifacts += 1; else widgets += 1;
      prod.push({ kind: String(w?.kind ?? "widget"), uid: w?.id != null ? `${String(w?.kind ?? "w").replace(/[^\w]+/g, "-")}-w${w.id}` : null, type });
    }
    const t0 = parseTs((eturns as any[])[0]?.ts).getTime();
    const t1 = parseTs((eturns as any[])[eturns.length - 1]?.ts).getTime();
    const mins = Number.isFinite(t0) && Number.isFinite(t1) ? Math.max(1, Math.round((t1 - t0) / 60000)) : null;
    const range = eturns.length ? `${hm((eturns as any[])[0]?.ts)}–${hm((eturns as any[])[eturns.length - 1]?.ts)}` : "";
    const maxCost = Math.max(0.000001, ...beats.map((b) => b.cost));
    const cost4 = Math.round(cost * 10000) / 10000;
    // the abstract is DATA (one string) — the on-screen article and the export render the same sentence.
    const abstract = `${meta?.reason ? `This episode opened because ${String(meta.reason)}. ` : ""}It ran ${range || "in one sitting"}${mins != null ? ` (${mins} minute${mins === 1 ? "" : "s"})` : ""}, carrying ${beats.length} turn${beats.length === 1 ? "" : "s"}${cost4 ? ` for $${cost4}` : " at no model cost"}${models.size ? ` across ${[...models].join(", ")}` : ""}. It produced ${widgets} widget${widgets === 1 ? "" : "s"} and ${artifacts} artefact${artifacts === 1 ? "" : "s"}, and dispatched ${dispatched} substrate action${dispatched === 1 ? "" : "s"}.${beats[0]?.q ? ` It began with: “${beats[0].q.slice(0, 110)}”.` : ""}`;
    return { beats, cost: cost4, models: [...models], dispatched, meta, report, widgets, artifacts, prod, mins, range, maxCost, abstract };
  }, [eturns, erows]);
  const S = (n: number) => (n === 1 ? "" : "s");
  const secHead: React.CSSProperties = { fontFamily: mono, fontSize: 9, color: C.dim, letterSpacing: 1.6, textTransform: "uppercase", margin: "14px 0 6px", textAlign: "center" };
  // ⛶ expand — the record as a full page (portal; Esc or backdrop returns)
  const [full, setFull] = React.useState(false);
  React.useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [full]);
  // ⇣ export — compile the SAME record into one self-contained .html (print it for a PDF)
  const exportHtml = () => {
    if (!d) return;
    const esc = (x: string) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const bars = d.beats.map((b) => `<div style="display:inline-block;width:8px;margin-right:2px;background:${b.cost ? "#c9784a" : "#3a3a3a"};height:${Math.max(4, Math.round((b.cost / d.maxCost) * 40))}px"></div>`).join("");
    const beats = d.beats.map((b) => `<div class="beat"><span class="ts">${esc(b.ts)}</span> ${esc(b.q)}${b.a ? `<div class="a">→ ${esc(b.a)}</div>` : ""}</div>`).join("");
    const prod = d.prod.length ? d.prod.map((p) => `<div class="mono">◆ ${esc(p.type)} · ${esc(p.kind)}${p.uid ? ` · #${esc(p.uid)}` : ""}</div>`).join("") : `<div class="mono">nothing was produced — a talking chapter.</div>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>episode #${sessionId} — the record</title><style>
body{background:#131313;color:#ddd;font:14px/1.6 system-ui,sans-serif;max-width:820px;margin:40px auto;padding:0 20px}
h1{font:700 15px/1.4 ui-monospace,monospace;letter-spacing:2px;text-transform:uppercase;text-align:center;border-bottom:1px solid #333;padding-bottom:10px}
.dl{font:10px ui-monospace,monospace;color:#888;text-align:center;margin-bottom:18px}
.sec{font:10px ui-monospace,monospace;color:#888;letter-spacing:2px;text-transform:uppercase;text-align:center;margin:22px 0 10px}
.abstract{text-align:justify}
.beat{border-left:2px solid #333;padding-left:10px;margin-bottom:9px}
.beat .ts{font:9px ui-monospace,monospace;color:#777}
.beat .a{color:#999;font-size:13px}
.mono{font:11px ui-monospace,monospace;color:#999;margin-bottom:4px}
.src{border-top:1px solid #333;margin-top:18px;padding-top:8px;font:9.5px ui-monospace,monospace;color:#777}
@media print{body{background:#fff;color:#111}.beat{border-color:#ccc}.beat .a{color:#555}}
</style></head><body>
<h1>✦ Episode #${sessionId} — the record</h1>
<div class="dl">${esc(d.range)}${d.mins != null ? ` · ${d.mins} min` : ""} · ${d.beats.length} turns · consolidated deterministically</div>
<p class="abstract">${esc(d.abstract)}</p>
<div class="sec">§1 · the conversation</div>${beats}
<div class="sec">§2 · the production</div>${prod}
<div class="sec">§3 · the ledger</div><div style="display:flex;align-items:flex-end;height:44px">${bars}</div><div class="mono">total $${d.cost}${d.models.length ? ` · models: ${d.models.join(", ")}` : ""} · ${d.dispatched} dispatch${d.dispatched === 1 ? "" : "es"}</div>
<div class="src">sources: interviewer_turns ×${d.beats.length} · session widgets ×${d.prod.length} — every number is arithmetic over these rows. Generated for free from antiloki.</div>
</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `episode-${sessionId}-record.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const hbtn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 6, padding: "1px 7px", cursor: "pointer", fontFamily: mono, fontSize: 10, lineHeight: 1.6 };
  const record = (
    <div data-widget-frame style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 12, background: C.panel, padding: "14px 18px 10px", position: "relative" }}>
      {d && (
        <div style={{ position: "absolute", top: 10, right: 12, display: "flex", gap: 6, zIndex: 2 }}>
          <button onClick={exportHtml} title="export the record — one self-contained .html (print it for a PDF)" style={hbtn}>⇣</button>
          <button onClick={() => setFull((v) => !v)} title={full ? "close the full page (Esc)" : "expand — the record as a full page"} style={hbtn}>⛶</button>
        </div>
      )}
      {!d ? (
        <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, textAlign: "center" }}>consolidating the record…</div>
      ) : (
        <>
          {/* masthead — the papers idiom: centered small caps, a dateline, hairlines */}
          <div style={{ textAlign: "center", borderBottom: `1px solid ${C.border}`, paddingBottom: 9, marginBottom: 10 }}>
            <div style={{ fontFamily: mono, fontSize: 11.5, color: C.fg, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>✦ Episode #{sessionId} — the record</div>
            <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, marginTop: 3 }}>
              {d.range}{d.mins != null ? ` · ${d.mins} min` : ""} · {d.beats.length} turn{S(d.beats.length)} · consolidated deterministically · $0 to read
            </div>
          </div>

          {/* ABSTRACT — prose assembled from arithmetic; every clause traces to a row */}
          <p style={{ fontFamily: nav, fontSize: 12.5, lineHeight: 1.6, color: C.fg, textAlign: "justify", margin: "0 0 2px" }}>{d.abstract}</p>

          {/* ⛨ THE SENTINEL'S ACCOUNT — the authored layer (one gated call at close), quoted from
              the episode-report row; the flags beneath are the deterministic watch, thresholds printed */}
          {d.report?.narrative_md && (
            <>
              <div style={secHead}>⛨ the sentinel's account</div>
              <p style={{ fontFamily: nav, fontSize: 12.5, lineHeight: 1.6, color: C.fg, textAlign: "justify", margin: "0 0 2px" }}>{String(d.report.narrative_md)}</p>
              <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, marginTop: 3 }}>
                authored by the sentinel at close{d.report.sentinel_cost_usd ? ` · $${d.report.sentinel_cost_usd}` : ""} — grounded on the arithmetic above
              </div>
            </>
          )}
          {Array.isArray(d.report?.flags) && d.report.flags.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {d.report.flags.map((f: any, i: number) => (
                <div key={i} style={{ fontFamily: mono, fontSize: 9.5, color: f?.sev === "warn" ? C.warn : C.muted }}>⚑ {String(f?.text ?? "")}</div>
              ))}
            </div>
          )}

          {/* §1 the conversation — the beats, each with its receipt */}
          <div style={secHead}>§1 · the conversation</div>
          {d.beats.slice(0, 30).map((b, i) => (
            <div key={i} style={{ margin: "0 0 7px", paddingLeft: 10, borderLeft: `2px solid ${C.border}` }}>
              <div style={{ fontFamily: nav, fontSize: 12, color: C.fg, lineHeight: 1.45 }}>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>{b.ts}</span>{"  "}{b.q.slice(0, 160)}{b.q.length > 160 ? "…" : ""}
              </div>
              {b.a && <div style={{ fontFamily: nav, fontSize: 11.5, color: C.muted, lineHeight: 1.45, marginTop: 1 }}>→ {b.a.slice(0, 180)}{b.a.length > 180 ? "…" : ""}</div>}
            </div>
          ))}
          {d.beats.length > 30 && <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, marginBottom: 6 }}>… +{d.beats.length - 30} more turns (open the raw record below)</div>}

          {/* §2 the production — what this chapter left on the desk */}
          <div style={secHead}>§2 · the production</div>
          {d.prod.length === 0 ? (
            <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginBottom: 4 }}>nothing was produced — a talking chapter.</div>
          ) : d.prod.map((p, i) => (
            <div key={i} style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginBottom: 3 }}>
              ◆ {p.type} · {p.kind.replace(/^atlas-|^vibe-/, "")}{p.uid ? <span style={{ color: C.muted }}> · #{p.uid}</span> : null}
            </div>
          ))}

          {/* §3 the ledger — cost per beat, drawn (Fig. 1), models, dispatches */}
          <div style={secHead}>§3 · the ledger</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 34, marginBottom: 3 }}>
            {d.beats.map((b, i) => (
              <div key={i} title={`turn ${i + 1} · $${b.cost}`} style={{ flex: 1, maxWidth: 16, height: `${Math.max(6, Math.round((b.cost / d.maxCost) * 100))}%`, background: b.cost ? `color-mix(in oklab, ${C.brand} 55%, ${C.border})` : C.border, borderRadius: 2 }} />
            ))}
          </div>
          <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, marginBottom: 4 }}>
            Fig. 1 — cost per turn (tallest = ${Math.round(d.maxCost * 10000) / 10000}). Total ${d.cost}{d.models.length ? ` · models: ${d.models.join(", ")}` : ""} · {d.dispatched} dispatch{d.dispatched === 1 ? "" : "es"}.
          </div>

          {/* sources — the receipts line, then the raw record one toggle away */}
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, flex: 1 }}>
              sources: interviewer_turns ×{d.beats.length} · session widgets ×{d.prod.length} · every number is arithmetic over these rows
            </span>
            <button onClick={() => setRaw((v) => !v)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 6, padding: "2px 10px", cursor: "pointer", fontFamily: mono, fontSize: 9 }}>
              {raw ? "⌃ close the raw record" : "⌄ the raw record"}
            </button>
          </div>
          {raw && eturns && (
            <div style={{ marginTop: 10 }}>
              {eturns.map((t: any, i: number) => (
                <div key={t.id ?? i} style={{ marginBottom: 10 }}>
                  {t.user_text ? (
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <div style={{ maxWidth: "88%", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 11px", fontFamily: nav, fontSize: 12, color: C.fg, whiteSpace: "pre-wrap" }}>{String(t.user_text)}</div>
                    </div>
                  ) : null}
                  {t.interviewer_response_md ? (
                    <div style={{ maxWidth: "96%", fontFamily: nav, fontSize: 12, color: C.dim, whiteSpace: "pre-wrap", marginTop: 6 }}>{String(t.interviewer_response_md)}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
  return (
    <>
      {record}
      {full && createPortal(
        <div onClick={() => setFull(false)} style={{ position: "fixed", inset: 0, zIndex: 400, background: `color-mix(in oklab, ${C.bg} 92%, transparent)`, backdropFilter: "blur(4px)", overflow: "auto", animation: "lokiZoneFade .2s ease" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860, margin: "26px auto 60px", padding: "0 22px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
              <button onClick={() => setFull(false)} title="close (Esc)" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 13 }}>✕</button>
            </div>
            {record}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
