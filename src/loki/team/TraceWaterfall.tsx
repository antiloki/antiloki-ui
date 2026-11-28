// ONE WATERFALL FOR A RUN (the operator's wish 2026-11-15: the trace and the cost waterfall are one thing, a tab on the team, as beautiful as the AffectUI one). A framed card: a header with the ask and a live pill, a strip of the numbers
// that matter (duration, cost, steps, model calls, tool calls, errors), then a nested timeline: a loop or for-each is a parent that folds its steps, every row has an icon badge, a name and what it is, a translucent bar coloured by
// kind, its time and cost at the bar's end, a SLOWEST tag, a spinner while it works and a "now" line the running bars grow into. By time (the tree) or by cost (most expensive first). Reads only what the run already holds.
// The look follows the idea of AffectUI's Trace Waterfall (seen rendered; its source is not public); the build is ours.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { Icon } from "./icons";
import { axisTicks, money, spanWords, waterfallOf, type WaterKind, type WaterRow } from "./model";
import type { Run } from "./types";

const KIND: Record<WaterKind, { color: string; label: string }> = { agent: { color: "#a78bfa", label: "agent" }, llm: { color: "#8b7cf6", label: "model call" }, tool: { color: "#2dd4bf", label: "tool" }, control: { color: "#94a3b8", label: "control" }, human: { color: "#f5b942", label: "you" }, other: { color: "#94a3b8", label: "step" } };
const FAIL = "#f87171"; const AMBER = "#f5b942";
const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
const css = `
.wf-spin{width:11px;height:11px;border-radius:50%;border:1.6px solid color-mix(in srgb,currentColor 25%,transparent);border-top-color:currentColor;animation:wf-rot .9s linear infinite}
@keyframes wf-rot{to{transform:rotate(360deg)}}
@keyframes wf-in{from{transform:scaleX(.02);opacity:0}to{transform:none;opacity:1}}
.wf-pulse{animation:wf-pulse 1.6s ease-in-out infinite}
@keyframes wf-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.wf-bar{transform-origin:left center;animation:wf-in .55s cubic-bezier(.2,.7,.2,1) both;transition:width .5s cubic-bezier(.2,.7,.2,1),left .5s cubic-bezier(.2,.7,.2,1)}
.wf-row:hover .wf-name{text-decoration:underline;text-decoration-color:color-mix(in srgb,currentColor 35%,transparent)}
@media (prefers-reduced-motion:reduce){.wf-spin,.wf-pulse,.wf-bar{animation:none}.wf-bar{transition:none}}`;

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return <div style={{ padding: "10px 16px", borderRight: `1px solid ${C.border}`, minWidth: 0 }}>
    <div style={{ fontSize: 10, letterSpacing: "0.09em", color: C.dim, textTransform: "uppercase", fontWeight: 500 }}>{label}</div>
    <div style={{ fontSize: 17, fontWeight: 500, marginTop: 2, fontVariantNumeric: "tabular-nums", color: tone ?? C.fg }}>{value}</div></div>;
}

export function TraceWaterfall({ run, onSelect, bare }: { run: Run; onSelect?: (id: string) => void; /** drawn inside a window that is already the box (the time and cost window): no margin, border or background of its own */ bare?: boolean }) {
  const [by, setBy] = React.useState<"time" | "cost">("time"); const [folded, setFolded] = React.useState<Set<string>>(new Set());
  const w = React.useMemo(() => waterfallOf(run), [run]);
  if (!w.rows.length) return <div data-testid="waterfall-empty" style={{ padding: 16, color: C.muted, fontFamily: nav, fontSize: 13 }}>Nothing has run yet. When the team runs, every step appears here with its time and cost.</div>;
  const live = w.rows.some((r) => r.state === "working"); const status = run.state.status?.status;
  const span = Math.max(1, w.total_ms); const ticks = axisTicks(span); const maxCost = Math.max(0.0001, ...w.rows.map((r) => r.cost));
  const visible: WaterRow[] = by === "cost" ? [...w.rows].filter((r) => r.children === 0).sort((a, b) => b.cost - a.cost || a.start - b.start) : w.rows.filter((r) => !r.parent || !folded.has(r.parent));
  const toggle = (id: string) => setFolded((f) => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pill = live ? { t: "Live", c: "#60a5fa" } : status === "done" ? { t: "Done", c: "#34d399" } : status === "blocked" ? { t: "Stopped", c: FAIL } : status === "stopped" ? { t: "Stopped", c: C.muted } : { t: String(status ?? ""), c: C.muted };
  return (
    <div data-testid="waterfall" style={{ ...(bare ? { margin: 0, border: "none", borderRadius: 0, background: "transparent" } : { margin: "14px 16px 18px", border: `1px solid ${C.border}`, borderRadius: 14, background: C.panel }), fontFamily: nav, fontSize: 13, color: C.fg, overflow: "hidden", ["--wf-live" as any]: "#60a5fa" }}>
      <style>{css}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ color: "#60a5fa", display: "inline-flex" }}><Icon name="spark" size={15} /></span><b style={{ fontWeight: 600 }}>Trace</b>
        <span data-testid="waterfall-ask" style={{ color: C.muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{run.ask}</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
          <span role="group" aria-label="sort the bars" style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            {(["time", "cost"] as const).map((k) => <button key={k} data-testid={`waterfall-by-${k}`} aria-pressed={by === k} onClick={() => setBy(k)} style={{ fontFamily: nav, fontSize: 11.5, background: by === k ? mix("currentColor", 14) : "transparent", color: by === k ? C.fg : C.muted, border: "none", padding: "3px 10px", cursor: "pointer" }}>{k === "time" ? "By time" : "By cost"}</button>)}
          </span>
          {pill.t && <span data-testid="waterfall-pill" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: pill.c, background: mix(pill.c, 14), border: `1px solid ${mix(pill.c, 35)}`, borderRadius: 999, padding: "2px 10px" }}><i className={live ? "wf-pulse" : undefined} style={{ width: 6, height: 6, borderRadius: "50%", background: pill.c, display: "inline-block" }} />{pill.t}</span>}
        </span>
      </div>
      <div data-testid="waterfall-stats" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", borderBottom: `1px solid ${C.border}` }}>
        <Stat label="Duration" value={spanWords(w.total_ms)} /><span data-testid="waterfall-total" style={{ display: "none" }}>{spanWords(w.total_ms)} · {money(w.total_cost)}</span>
        <Stat label="Cost" value={money(w.total_cost)} /><Stat label="Steps" value={w.stats.steps} /><Stat label="Model calls" value={w.stats.model_calls} /><Stat label="Tool calls" value={w.stats.tool_calls} /><Stat label="Errors" value={w.stats.errors} tone={w.stats.errors ? FAIL : undefined} />
      </div>
      <div style={{ overflowX: "auto" }}><div style={{ minWidth: 640 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 34%) 1fr", borderBottom: `1px solid ${C.border}`, fontSize: 10, letterSpacing: "0.09em", textTransform: "uppercase", color: C.dim }}>
          <span style={{ padding: "8px 16px" }}>Step</span>
          <span data-testid="waterfall-axis" style={{ position: "relative", height: 28, borderLeft: `1px solid ${C.border}` }}>
            {by === "time" ? ticks.map((t) => <span key={t} style={{ position: "absolute", left: `calc(${(t / span) * 96}% + 8px)`, top: 8, fontFamily: mono, textTransform: "none", letterSpacing: 0 }}>{spanWords(t)}</span>) : <span style={{ position: "absolute", left: 8, top: 8 }}>Cost</span>}
            {live && by === "time" && <i className="wf-pulse" data-testid="waterfall-now" style={{ position: "absolute", left: "calc(96% + 5px)", bottom: -3, width: 7, height: 7, borderRadius: "50%", background: "#60a5fa", zIndex: 2 }} />}
          </span>
        </div>
        <div style={{ position: "relative" }}>
          {visible.map((r) => {
            const K = r.state === "failed" ? FAIL : KIND[r.kind].color; const parent = r.children > 0;
            const left = by === "time" ? (r.start / span) * 96 : 0; const width = by === "time" ? Math.max(0.9, ((r.end - r.start) / span) * 96) : Math.max(r.cost > 0 ? 1.2 : 0.6, (r.cost / maxCost) * 70);
            const inside = left + width > 74; const roomLeft = left > 24; const label = `${spanWords(r.ms)}${r.cost > 0 ? ` · ${money(r.cost)}` : ""}`;
            return (
              <div key={r.id} className="wf-row" data-testid={`wf-${r.id}`} data-state={r.state} data-kind={r.kind} data-depth={r.depth} onClick={() => onSelect?.(r.id)} style={{ display: "grid", gridTemplateColumns: "minmax(200px, 34%) 1fr", alignItems: "center", minHeight: 32, cursor: onSelect ? "pointer" : "default", borderBottom: `1px solid ${mix("currentColor", 4)}` }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, padding: `4px 12px 4px ${16 + r.depth * 18}px`, minWidth: 0 }}>
                  {parent && by === "time" ? <button data-testid={`wf-fold-${r.id}`} aria-label={folded.has(r.id) ? "unfold" : "fold"} aria-expanded={!folded.has(r.id)} onClick={(e) => { e.stopPropagation(); toggle(r.id); }} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", padding: 0, width: 14, display: "inline-flex", transform: folded.has(r.id) ? "rotate(-90deg)" : "none", transition: "transform .15s" }}><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button> : <span style={{ width: 14 }} />}
                  <span style={{ width: 22, height: 22, borderRadius: 7, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", color: K, background: mix(K, 15), border: `1px solid ${mix(K, 30)}` }}><Icon name={r.icon} size={13} /></span>
                  <span style={{ minWidth: 0, display: "flex", gap: 6, alignItems: "baseline" }}><span className="wf-name" style={{ fontWeight: parent ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.title}>{r.title}</span>{r.sub && <span style={{ color: C.dim, fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</span>}</span>
                  {r.state === "working" && <span className="wf-spin" aria-label="working" style={{ color: "#60a5fa", marginLeft: "auto", flex: "none" }} />}
                </span>
                <span style={{ position: "relative", height: 32, borderLeft: `1px solid ${C.border}` }}>
                  {by === "time" && ticks.slice(1).map((t) => <i key={t} style={{ position: "absolute", left: `calc(${(t / span) * 96}% + 8px)`, top: 0, bottom: 0, width: 1, background: mix("currentColor", 7) }} />)}
                  {live && by === "time" && <i aria-hidden style={{ position: "absolute", left: "calc(96% + 8px)", top: 0, bottom: 0, width: 1, background: "#60a5fa", opacity: 0.8 }} />}
                  <span data-testid={`wf-bar-${r.id}`} className="wf-bar" style={{ animationDelay: `${Math.min(visible.indexOf(r), 14) * 35}ms`, position: "absolute", left: `calc(${left}% + 8px)`, width: `${width}%`, top: parent ? 9 : 8, height: parent ? 14 : 16, borderRadius: parent ? 7 : 5, boxSizing: "border-box",
                    background: parent ? mix("#94a3b8", r.state === "working" ? 14 : 22) : mix(K, 28), border: parent ? `1px solid ${mix("#94a3b8", 30)}` : `1px solid ${mix(K, 50)}`, opacity: r.state === "ran" ? 0.75 : 1 }} />
                  <span style={{ position: "absolute", top: 0, height: 32, display: "flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 11.5, color: C.muted, whiteSpace: "nowrap", ...(inside ? (roomLeft ? { right: `calc(100% - ${left}% - 2px)` } : { right: `calc(${Math.max(0, 100 - left - width)}% + 14px)` }) : { left: `calc(${left + width}% + 14px)` }) }}>
                    <span>{label}</span>
                    {r.slowest && <span data-testid={`wf-slowest-${r.id}`} style={{ fontFamily: nav, fontSize: 9.5, letterSpacing: "0.06em", color: AMBER, background: mix(AMBER, 14), border: `1px solid ${mix(AMBER, 40)}`, borderRadius: 4, padding: "0 5px" }}>SLOWEST</span>}
                    {r.dearest && <span data-testid={`wf-dearest-${r.id}`} style={{ fontFamily: nav, fontSize: 9.5, letterSpacing: "0.06em", color: "#a78bfa", background: mix("#a78bfa", 14), border: `1px solid ${mix("#a78bfa", 40)}`, borderRadius: 4, padding: "0 5px" }}>DEAREST</span>}
                  </span>
                </span>
              </div>);
          })}
        </div>
      </div></div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "8px 16px", borderTop: `1px solid ${C.border}`, color: C.dim, fontSize: 11.5 }}>
        {(["agent", "llm", "tool", "control", "human"] as WaterKind[]).filter((k) => w.rows.some((r) => r.kind === k)).map((k) => <span key={k} style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><i style={{ width: 9, height: 9, borderRadius: 3, background: mix(KIND[k].color, 55), border: `1px solid ${KIND[k].color}`, display: "inline-block" }} />{KIND[k].label}</span>)}
        {w.stats.errors > 0 && <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><i style={{ width: 9, height: 9, borderRadius: 3, background: mix(FAIL, 55), border: `1px solid ${FAIL}`, display: "inline-block" }} />failed</span>}
      </div>
    </div>
  );
}
