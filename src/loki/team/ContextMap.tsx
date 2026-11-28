// THE CONTEXT MAP AND THE CONTEXT WINDOW (the operator 2026-11-15, from AffectUI's Context Map and Context Window: "the map is a tab on Teams; the window is a small component that can show over the canvas when expanded").
// THE MAP: what the steps wrote into the run, as tiles sized by their (estimated) tokens, coloured by what the step is; pick a tile to see who reads it. THE WINDOW: one step's context, its brief plus what the steps before it wrote, against its model's window.
// The sizes are estimates (about four characters to a token) and the card says so. Flat, no shadows.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { contextOf, treemap, windowOf, type WaterKind } from "./model";
import type { Run } from "./types";

const KIND: Record<WaterKind, string> = { agent: "#a78bfa", llm: "#8b7cf6", tool: "#2dd4bf", control: "#94a3b8", human: "#f5b942", other: "#94a3b8" };
const mix = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

export function ContextMap({ run, onSelect }: { run: Run; onSelect?: (id: string) => void }) {
  const c = React.useMemo(() => contextOf(run), [run]); const [pick, setPick] = React.useState<string | null>(null);
  if (!c.items.length) return <div data-testid="ctx-empty" style={{ padding: 16, color: C.muted, fontFamily: nav, fontSize: 13 }}>Nothing is in the run's context yet. As steps write their results, they appear here as tiles.</div>;
  const W = 1000, H = 300; const boxes = treemap(c.items.map((i) => ({ id: i.id, weight: i.tokens })), W, H); const by = new Map(c.items.map((i) => [i.id, i] as const)); const sel = pick ? by.get(pick) ?? null : null;
  const related = new Set<string>(sel ? [sel.id, ...sel.readers, ...sel.reads] : []);
  return (
    <div data-testid="ctx-map" style={{ margin: "14px 16px 18px", border: `1px solid ${C.border}`, borderRadius: 14, background: C.panel, fontFamily: nav, fontSize: 13, color: C.fg, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "12px 16px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}><b style={{ fontWeight: 600 }}>Context map</b><span data-testid="ctx-total" style={{ color: C.muted }}>about {k(c.total)} tokens across {c.items.length} step{c.items.length === 1 ? "" : "s"}</span><span style={{ marginLeft: "auto", color: C.dim, fontSize: 11.5 }}>estimated: a token is about four characters</span></div>
      <div style={{ position: "relative", margin: 12, height: 300 }}>
        {boxes.map((b) => { const it = by.get(b.id)!; const col = KIND[it.kind]; const dim = sel && !related.has(b.id); return (
          <button key={b.id} data-testid={`ctx-tile-${b.id}`} aria-pressed={pick === b.id} onClick={() => { setPick(pick === b.id ? null : b.id); onSelect?.(b.id); }} style={{ position: "absolute", left: `${(b.x / W) * 100}%`, top: `${(b.y / H) * 100}%`, width: `calc(${(b.w / W) * 100}% - 3px)`, height: `calc(${(b.h / H) * 100}% - 3px)`, boxSizing: "border-box", textAlign: "left", cursor: "pointer", overflow: "hidden", padding: "7px 9px", borderRadius: 8, fontFamily: nav, color: C.fg, background: mix(col, pick === b.id ? 30 : 16), border: `1px solid ${mix(col, pick === b.id ? 80 : 40)}`, opacity: dim ? 0.35 : 1, transition: "opacity .2s, background .2s" }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</span><span style={{ display: "block", fontFamily: mono, fontSize: 10.5, color: C.muted }}>{k(it.tokens)}</span></button>); })}
      </div>
      <div data-testid="ctx-note" style={{ padding: "0 16px 12px", color: C.muted, fontSize: 12, minHeight: 18 }}>{sel ? `${sel.title} is read by ${sel.readers.length ? sel.readers.map((r) => by.get(r)?.title ?? r).join(", ") : "nobody yet"}${sel.reads.length ? ` and reads ${sel.reads.map((r) => by.get(r)?.title ?? r).join(", ")}` : ""}.` : "Pick a tile to see who reads what it wrote."}</div>
      {sel && <pre data-testid={`ctx-value-${sel.id}`} style={{ margin: "0 12px 14px", fontFamily: mono, fontSize: 11.5, color: C.fg, background: mix("currentColor", 5), borderRadius: 8, padding: "9px 11px", maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{valueText(run.state.values?.[sel.id])}</pre>}
    </div>
  );
}
/** What a step wrote, as text a person can read: its report or words if it has them, else the JSON. Cut at 4 000 characters. Pure. */
export function valueText(v: unknown): string {
  const o: any = v; const t = typeof v === "string" ? v : o && typeof o === "object" && (o.report || o.said) ? String(o.report ?? o.said) : JSON.stringify(v ?? null, null, 2);
  return t.length > 4000 ? `${t.slice(0, 3999)}…` : t;
}

/** One step's context window as a small pill that opens a panel over what is behind it: the brief and each earlier step's share against the window. */
export function ContextWindow({ run, id, limit = 200_000 }: { run: Run; id: string; limit?: number }) {
  const [open, setOpen] = React.useState(false); const w = React.useMemo(() => windowOf(run, id, limit), [run, id, limit]); const pct = Math.round(w.share * 1000) / 10;
  return (
    <div data-testid={`ctx-window-${id}`} style={{ position: "relative", fontFamily: nav, fontSize: 12, color: C.fg }}>
      <button data-testid="ctx-window-pill" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ display: "inline-flex", gap: 8, alignItems: "center", background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 10px", cursor: "pointer", fontFamily: nav, fontSize: 12 }}>
        <span style={{ width: 46, height: 3, borderRadius: 2, background: mix("currentColor", 12), overflow: "hidden", display: "inline-block" }}><i style={{ display: "block", height: "100%", width: `${Math.max(2, w.share * 100)}%`, background: w.share > 0.8 ? "#f87171" : "#60a5fa" }} /></span><span style={{ fontFamily: mono, fontSize: 11 }}>{k(w.used)} / {k(w.limit)}</span></button>
      {open && <div data-testid="ctx-window-panel" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30, width: 260, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><b style={{ fontWeight: 500 }}>Context window</b><span style={{ fontFamily: mono, color: C.muted }}>{pct}%</span></div>
        <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: mix("currentColor", 8), marginBottom: 8 }}><i title="its brief" style={{ width: `${(800 / w.limit) * 100}%`, background: "#94a3b8" }} />{w.parts.map((p, i) => <i key={p.id} title={`${p.id}: ${k(p.tokens)}`} style={{ width: `${(p.tokens / w.limit) * 100}%`, background: ["#a78bfa", "#2dd4bf", "#60a5fa", "#f5b942"][i % 4] }} />)}</div>
        <div style={{ color: C.muted, display: "grid", gap: 2 }}><span>its brief · about 800</span>{w.parts.map((p) => <span key={p.id}>{p.id} · {k(p.tokens)}</span>)}{!w.parts.length && <span>no earlier step wrote anything for it</span>}</div>
        <div style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>estimated against {k(w.limit)} tokens</div></div>}
    </div>
  );
}
