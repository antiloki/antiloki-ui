// X-RAY V2 (RFC 0015, the operator 2026-11-18): a board of widgets you arrange, add to, install and ask an agent to change. EVERY WIDGET IS A DECLARATION (a source that costs no AI call, typed arguments, one of a closed list of renderers):
// the serve validates and draws the data; this page only draws it with a fixed renderer. Nothing here runs code from a widget. Every layout change is a saved version (undo), and a named view is a saved layout.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { apiGet, apiPost } from "@/loki/api/client";
import { mediaUrl } from "@/loki/team/api";

export type Widget = { id: string; title: string; source: string; view: string; args?: Record<string, unknown>; options?: Record<string, unknown>; base?: boolean; package?: string; custom?: boolean };
export type Cell = { widget: string; x: number; y: number; w: number; h: number };
export type Layout = { screen: string; n: number; by: string; note?: string; grid: Cell[] };
export type Drawn = { ok: boolean; error?: string; id?: string; title?: string; view?: string; summary?: string; data?: any };
const COLS = 12; const ROW_H = 76;

export const x2 = async <T = any,>(space: string, op: string, body: Record<string, unknown> = {}): Promise<T & { ok: boolean; error?: string }> => {
  try { const r: any = await apiPost("/api/v1/xray/v2", { op, ...(space ? { space } : {}), ...body }); return (r?.ok === undefined ? { ok: false, error: "the serve did not answer" } : r) as any; } catch (e: any) { return { ok: false, error: String(e?.message ?? e) } as any; }
};
/** A cell moved or resized by a pointer: the pixels become whole columns and rows, kept inside the 12 columns. Pure. */
export function snap(cell: Cell, dxPx: number, dyPx: number, colW: number, mode: "move" | "resize"): Cell {
  const dc = Math.round(dxPx / Math.max(1, colW)), dr = Math.round(dyPx / ROW_H);
  if (mode === "move") return { ...cell, x: Math.max(0, Math.min(COLS - cell.w, cell.x + dc)), y: Math.max(0, cell.y + dr) };
  return { ...cell, w: Math.max(1, Math.min(COLS - cell.x, cell.w + dc)), h: Math.max(1, Math.min(12, cell.h + dr)) };
}
const pill = (color: string): React.CSSProperties => ({ fontFamily: mono, fontSize: 10.5, color, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`, borderRadius: 999, padding: "0 8px" });

/** A built-in part of X-ray, drawn by its own component (loaded when needed: the embed imports this board, so it is not imported here up front). */
const EmbedView = React.lazy(() => import("./xray-embed").then((m) => ({ default: m.XrayView })));
function BuiltIn({ name }: { name: string }) {
  return <div data-testid={`builtin-${name}`} style={{ position: "relative", height: "100%", minHeight: 320, display: "flex", flexDirection: "column", overflow: "auto" }}><React.Suspense fallback={<span style={{ color: C.dim, fontSize: 12 }}>loading {name}…</span>}><EmbedView q={{ view: name, space: "", path: "", symbol: "", depth: 0, source: "" }} /></React.Suspense></div>;
}
/** One renderer from the closed list, drawing the data the serve shaped for it. */
export function WidgetView({ res }: { res: Drawn }) {
  const d = res.data; if (!res.ok) return <div style={{ color: "var(--c-bad)", fontSize: 12 }}>{res.error}</div>;
  switch (res.view) {
    case "text": return <pre style={{ margin: 0, fontFamily: mono, fontSize: 11.5, whiteSpace: "pre-wrap", color: C.fg }}>{d.text}</pre>;
    case "list": return <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, display: "grid", gap: 2 }}>{(d.items as string[]).map((t, i) => <li key={i} style={{ overflowWrap: "anywhere" }}>{t}</li>)}</ul>;
    case "number": return <div style={{ display: "grid", placeItems: "center", height: "100%" }}><div style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-.02em" }}>{Number(d.value).toLocaleString()}</div>{d.label && <div style={{ color: C.muted, fontSize: 12 }}>{d.label}</div>}</div>;
    case "table": return <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}><thead><tr>{(d.columns as string[]).map((c) => <th key={c} style={{ textAlign: "left", color: C.muted, fontWeight: 500, borderBottom: `1px solid ${C.border}`, padding: "2px 6px" }}>{c}</th>)}</tr></thead><tbody>{(d.rows as string[][]).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} style={{ padding: "2px 6px", borderBottom: `1px solid ${C.border}`, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</td>)}</tr>)}</tbody></table>;
    case "bar": { const max = Math.max(1, ...(d.bars as any[]).map((b) => b.value)); return <div style={{ display: "grid", gap: 4 }}>{(d.bars as any[]).map((b, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr 54px", gap: 8, alignItems: "center", fontSize: 12 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.muted }}>{b.label}</span><i style={{ display: "block", height: 8, borderRadius: 4, width: `${Math.max(2, (b.value / max) * 100)}%`, background: "#4d8dff" }} /><span style={{ fontFamily: mono, textAlign: "right" }}>{b.value}</span></div>)}</div>; }
    case "line": { const pts = d.points as { x: any; y: number }[]; const ys = pts.map((p) => p.y); const lo = Math.min(...ys), hi = Math.max(...ys); const X = (i: number) => 6 + (i / Math.max(1, pts.length - 1)) * 288, Y = (v: number) => 74 - ((v - lo) / Math.max(1e-9, hi - lo)) * 64;
      return <svg viewBox="0 0 300 80" style={{ width: "100%", height: "100%" }} role="img" aria-label="line"><polyline fill="none" stroke="#3ecf8e" strokeWidth={1.8} points={pts.map((p, i) => `${X(i)},${Y(p.y)}`).join(" ")} /></svg>; }
    case "timeline": return <div style={{ display: "grid", gap: 6, fontSize: 12 }}>{(d.events as any[]).map((e, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "10px 120px 1fr", gap: 8, alignItems: "baseline" }}><i style={{ width: 7, height: 7, borderRadius: 4, background: "#4d8dff" }} /><span style={{ fontFamily: mono, color: C.muted }}>{e.t}</span><span>{e.label}</span></div>)}</div>;
    case "treemap": { const cells = d.cells as any[]; const total = cells.reduce((a, c) => a + c.value, 0) || 1; return <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>{cells.map((c, i) => <div key={i} title={`${c.label}: ${c.value}`} style={{ flex: `${Math.max(1, (c.value / total) * 100)} 1 70px`, minHeight: 34, background: "color-mix(in srgb, #4d8dff 18%, transparent)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "3px 6px", fontSize: 11.5, overflow: "hidden" }}>{c.label}</div>)}</div>; }
    case "graph": return <div style={{ display: "grid", gap: 2, fontFamily: mono, fontSize: 11.5 }}>{(d.edges as any[]).map((e, i) => <div key={i}>{e.from} <span style={{ color: C.dim }}>→</span> {e.to}</div>)}</div>;
    case "component": return <BuiltIn name={d.name} />;
    case "media": return <div data-testid="media-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>{(d.items as { run: string; kind: string; name: string; file: string }[]).map((m, i) => { const u = mediaUrl(m.run, m.file); return <div key={i} style={{ display: "grid", gap: 4, minWidth: 0 }}>
      {m.kind === "video" ? <video controls preload="metadata" src={u} style={{ width: "100%", maxHeight: 220, background: "#000", borderRadius: 10 }} /> : m.kind === "page" ? <iframe title={m.name} sandbox="allow-scripts" src={u} style={{ width: "100%", aspectRatio: "16 / 9", border: `1px solid ${C.border}`, borderRadius: 10, background: "#000" }} /> : m.kind === "sound" ? <audio controls src={u} style={{ width: "100%" }} /> : <img alt={m.name} src={u} style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 10 }} />}
      <span style={{ fontFamily: mono, fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name} · {m.run}</span></div>; })}</div>;
    case "diff": return <pre style={{ margin: 0, fontFamily: mono, fontSize: 11.5 }}>{(d.lines as any[]).map((l, i) => <div key={i} style={{ color: l.kind === "add" ? "#3ecf8e" : l.kind === "del" ? "#f04e4e" : l.kind === "hunk" ? "#4d8dff" : C.muted }}>{l.text}</div>)}</pre>;
    default: return <div style={{ color: "var(--c-bad)", fontSize: 12 }}>unknown renderer {res.view}</div>;
  }
}

function Tile({ w, cell, space, editing, colW, onChange, onDragEnd }: { w: Widget | undefined; cell: Cell; space: string; editing: boolean; colW: number; onChange: (c: Cell) => void; onDragEnd: (c: Cell) => void }) {
  const [res, setRes] = React.useState<Drawn | null>(null); const [live, setLive] = React.useState<Cell | null>(null); const drag = React.useRef<{ mode: "move" | "resize"; sx: number; sy: number } | null>(null);
  React.useEffect(() => { let stop = false; setRes(null); void x2<Drawn>(space, "data", { id: cell.widget }).then((r) => { if (!stop) setRes(r); }); return () => { stop = true; }; }, [space, cell.widget, w?.source, JSON.stringify(w?.args), w?.view]);
  const shown = live ?? cell;
  const down = (mode: "move" | "resize") => (e: React.PointerEvent) => { if (!editing) return; e.preventDefault(); e.stopPropagation(); drag.current = { mode, sx: e.clientX, sy: e.clientY }; (e.currentTarget as Element).setPointerCapture?.(e.pointerId); };
  const move = (e: React.PointerEvent) => { const g = drag.current; if (g) setLive(snap(cell, e.clientX - g.sx, e.clientY - g.sy, colW, g.mode)); };
  const up = () => { const g = drag.current; drag.current = null; if (g && live) { onDragEnd(live); } setLive(null); };
  return (
    <div data-testid={`board-cell-${cell.widget}`} style={{ gridColumn: `${shown.x + 1} / span ${shown.w}`, gridRow: `${shown.y + 1} / span ${shown.h}`, position: "relative", display: "flex", flexDirection: "column", minWidth: 0, border: `1px solid ${live ? "#4d8dff" : C.border}`, borderRadius: 14, background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 82%, transparent)", backdropFilter: "blur(10px)", overflow: "hidden" }}>
      <div onPointerDown={down("move")} onPointerMove={move} onPointerUp={up} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: `1px solid ${C.border}`, cursor: editing ? "grab" : "default", touchAction: "none", userSelect: "none" }}>
        <b style={{ fontSize: 12.5, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w?.title ?? cell.widget}</b>
        {w && <span style={pill(w.base ? "#8b95a1" : w.package ? "#e08fd0" : "#4d8dff")}>{w.base ? "base" : w.package ?? "yours"}</span>}<span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>{w?.source}</span>
        {editing && <button aria-label={`take ${cell.widget} off the board`} onClick={() => onChange({ ...cell, w: 0 })} style={{ border: "none", background: "none", color: C.muted, cursor: "pointer" }}>✕</button>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: res?.view === "component" ? "hidden" : "auto", padding: res?.view === "component" ? 0 : 10 }}>{res ? <WidgetView res={res} /> : <span style={{ color: C.dim, fontSize: 12 }}>reading…</span>}</div>
      {editing && <i data-testid={`resize-${cell.widget}`} onPointerDown={down("resize")} onPointerMove={move} onPointerUp={up} style={{ position: "absolute", right: 2, bottom: 2, width: 16, height: 16, cursor: "nwse-resize", touchAction: "none", background: "linear-gradient(135deg, transparent 50%, var(--c-muted) 50%)", borderRadius: 3, opacity: 0.6 }} />}
    </div>
  );
}

export function XrayBoard({ space = "", screen: screenProp, lockScreen, screens }: { space?: string; /** the screens of this board as tabs (a team has Overview, Parts and Data) */ screens?: { screen: string; label: string }[]; /** the screen this board shows (a team has its own: `team-<name>`) */ screen?: string; /** no screen picker: the board belongs to one place */ lockScreen?: boolean }) {
  const [widgets, setWidgets] = React.useState<Widget[]>([]); const [layout, setLayout] = React.useState<Layout | null>(null); const [screen, setScreen] = React.useState(screenProp ?? "home"); const [editing, setEditing] = React.useState(false);
  const [store, setStore] = React.useState<{ packages: any[]; proposals: any[] }>({ packages: [], proposals: [] }); const [views, setViews] = React.useState<{ screen: string; name: string }[]>([]); const [msg, setMsg] = React.useState<{ text: string; bad?: boolean } | null>(null);
  const [palette, setPalette] = React.useState<{ sources: any[]; renderers: string[] } | null>(null); const [open, setOpen] = React.useState<"" | "add" | "store">(""); const [draft, setDraft] = React.useState({ id: "", title: "", source: "git", view: "text", args: "{}" }); const [pkgText, setPkgText] = React.useState(""); const [themes, setThemes] = React.useState<{ id: string; name: string; source: string }[]>([]); const [theme, setTheme] = React.useState("");
  const grid = React.useRef<HTMLDivElement>(null); const [colW, setColW] = React.useState(80);
  const load = React.useCallback(async () => {
    const [w, l, v] = await Promise.all([x2<any>(space, "widgets"), x2<any>(space, "layout", { screen }), x2<any>(space, "views")]);
    if (w.ok) { setWidgets(w.widgets); setStore({ packages: w.packages ?? [], proposals: w.proposals ?? [] }); } if (l.ok) setLayout(l as any); if (v.ok) setViews(v.views ?? []);
  }, [space, screen]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => { const el = grid.current; if (!el || typeof ResizeObserver === "undefined") return; const ro = new ResizeObserver((es) => setColW(es[0].contentRect.width / COLS)); ro.observe(el); return () => ro.disconnect(); }, [layout?.screen]);
  const say = (text: string, bad = false) => setMsg({ text, bad });
  const save = async (next: Cell[], note = "") => { const r = await x2<any>(space, "layout_set", { screen, grid: next, note }); if (r.ok) { setLayout(r.layout); say(`saved version ${r.layout.n}`); } else say(r.error ?? "not saved", true); await load(); };
  const change = (c: Cell) => { const rest = (layout?.grid ?? []).filter((x) => x.widget !== c.widget); void save(c.w === 0 ? rest : [...rest, c].sort((a, b) => a.y - b.y || a.x - b.x), c.w === 0 ? `took ${c.widget} off` : `moved ${c.widget}`); };
  const byId = new Map(widgets.map((w) => [w.id, w])); const placed = new Set((layout?.grid ?? []).map((c) => c.widget)); const free = widgets.filter((w) => !placed.has(w.id));
  const openAdd = async () => { setOpen(open === "add" ? "" : "add"); if (!palette) { const p = await x2<any>(space, "sources"); if (p.ok) setPalette(p); } };
  const parseArgs = () => { try { const a = JSON.parse(draft.args || "{}"); return a && typeof a === "object" && !Array.isArray(a) ? a : null; } catch { return null; } };
  const decl = () => ({ id: draft.id.trim(), title: draft.title.trim() || draft.id.trim(), source: draft.source, view: draft.view, args: parseArgs() ?? {}, options: {} });
  const [preview, setPreview] = React.useState<Drawn | null>(null);
  return (
    <div data-testid="xray-board" style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: nav, color: C.fg, background: "transparent" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5 }}>X-ray board</b><span style={pill("#8b95a1")}>{layout ? `${layout.screen} · v${layout.n} · ${layout.by}` : "…"}</span>
        {screens && <div role="tablist" aria-label="board screens" style={{ display: "inline-flex", gap: 2, padding: 2, border: `1px solid ${C.border}`, borderRadius: 999 }}>{screens.map((x) => <button key={x.screen} role="tab" aria-selected={screen === x.screen} data-testid={`board-screen-${x.label.toLowerCase()}`} onClick={() => setScreen(x.screen)} style={{ fontFamily: "inherit", fontSize: 12, padding: "3px 14px", borderRadius: 999, border: "none", cursor: "pointer", background: screen === x.screen ? "var(--c-panel)" : "transparent", color: screen === x.screen ? "var(--c-fg, inherit)" : "var(--c-muted)" }}>{x.label}</button>)}</div>}
        {!lockScreen && !screens && <select aria-label="screen" value={screen} onChange={(e) => setScreen(e.target.value)} style={{ background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "2px 6px", fontSize: 12 }}><option value="home">home</option>{views.map((v) => <option key={v.screen} value={v.screen}>view: {v.name}</option>)}</select>}
        <span style={{ flex: 1 }} />
        <button data-testid="board-arrange" aria-pressed={editing} onClick={() => setEditing((e) => !e)} style={btn(editing)}>{editing ? "Done" : "Arrange"}</button>
        <button data-testid="board-undo" onClick={async () => { const r = await x2<any>(space, "layout_undo", { screen }); if (r.ok) { setLayout(r.layout); say(`back to the layout before (saved as version ${r.layout.n})`); } else say(r.error ?? "nothing to undo", true); }} style={btn(false)}>Undo</button>
        <button data-testid="board-save-view" onClick={async () => { const name = window.prompt("Name this view") ?? ""; if (!name.trim()) return; const r = await x2<any>(space, "view_save", { name: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"), from: screen }); r.ok ? say(`saved the view ${name}`) : say(r.error ?? "not saved", true); await load(); }} style={btn(false)}>Save view</button>
        <button data-testid="board-add" aria-pressed={open === "add"} onClick={() => void openAdd()} style={btn(open === "add")}>Add widget</button>
        <button data-testid="board-store" aria-pressed={open === "store"} onClick={() => setOpen(open === "store" ? "" : "store")} style={btn(open === "store")}>Store{store.proposals.length ? ` · ${store.proposals.length} proposed` : ""}</button>
      </div>
      {msg && <div data-testid="board-msg" style={{ padding: "5px 12px", fontSize: 12, color: msg.bad ? "var(--c-bad)" : C.muted }}>{msg.text}</div>}
      {open === "add" && <div data-testid="board-add-panel" style={{ display: "grid", gap: 8, padding: 12, borderBottom: `1px solid ${C.border}`, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <input aria-label="id" placeholder="id (a-z, 0-9, -)" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} style={inp} /><input aria-label="title" placeholder="title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={inp} />
        <select aria-label="source" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} style={inp}>{(palette?.sources ?? []).map((s) => <option key={s.key} value={s.key}>{s.key} · {s.label}</option>)}</select>
        <select aria-label="renderer" value={draft.view} onChange={(e) => setDraft({ ...draft, view: e.target.value })} style={inp}>{(palette?.renderers ?? ["text"]).map((r) => <option key={r} value={r}>{r}</option>)}</select>
        <input aria-label="args" placeholder='args as JSON, e.g. {"limit": 20}' value={draft.args} onChange={(e) => setDraft({ ...draft, args: e.target.value })} style={{ ...inp, gridColumn: "span 2" }} />
        <button data-testid="board-preview" style={btn(false)} onClick={async () => { if (!parseArgs()) { say("the args must be a JSON object", true); return; } const r = await x2<Drawn>(space, "preview", { widget: decl() }); setPreview(r); r.ok ? say("drawn, not saved") : say(r.error ?? "cannot be drawn", true); }}>Preview</button>
        <button data-testid="board-save-widget" style={btn(true)} onClick={async () => { if (!parseArgs()) { say("the args must be a JSON object", true); return; } const r = await x2<any>(space, "widget_save", { widget: decl() }); if (!r.ok) { say(r.error ?? "not saved", true); return; } const p = await x2<any>(space, "layout_place", { screen, widget: decl().id }); p.ok ? say(`${decl().id} saved and put on the board`) : say(p.error ?? "saved, not placed", true); setPreview(null); await load(); }}>Save and place</button>
        {preview && <div style={{ gridColumn: "1 / -1", border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, maxHeight: 200, overflow: "auto" }}><WidgetView res={preview} /></div>}
      </div>}
      {open === "store" && <div data-testid="board-store-panel" style={{ display: "grid", gap: 8, padding: 12, borderBottom: `1px solid ${C.border}`, fontSize: 12.5 }}>
        {store.proposals.map((p) => <div key={p.name} data-testid={`proposal-${p.name}`} style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={pill("#f5a524")}>proposed</span><b>{p.name}</b><span style={{ color: C.muted }}>{p.widgets} widgets · v{p.version}</span><span style={{ flex: 1 }} /><button onClick={async () => { const r = await x2<any>(space, "install", { proposal: p.name }); r.ok ? say(`installed ${p.name}`) : say(r.error ?? "not installed", true); await load(); }} style={btn(true)}>Install</button><button onClick={async () => { await x2(space, "discard", { name: p.name }); await load(); }} style={btn(false)}>Discard</button></div>)}
        {store.packages.map((p) => <div key={p.name} data-testid={`package-${p.name}`} style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={pill("#e08fd0")}>installed</span><b>{p.name}</b><span style={{ color: C.muted }}>{p.widgets} widgets · v{p.version}</span><span style={{ flex: 1 }} /><button onClick={async () => { const r = await x2<any>(space, "remove", { name: p.name }); r.ok ? say(`removed ${p.name}`) : say(r.error ?? "not removed", true); await load(); }} style={btn(false)}>Remove</button></div>)}
        {!store.proposals.length && !store.packages.length && <span style={{ color: C.muted }}>No package is installed or proposed. A package is a list of widget declarations (nothing that runs); paste one below, or ask an agent to propose one.</span>}
        <div data-testid="board-theme-shape" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
          <span style={{ color: C.muted }}>The shape of X-ray (widgets, replaced parts, screens) travels in a theme as <code style={{ fontFamily: mono }}>xray.yaml</code>:</span>
          <select aria-label="theme" value={theme} onFocus={async () => { if (!themes.length) { try { const r: any = await apiGet("/api/v1/themes/omarchy"); setThemes((r?.themes ?? []).map((t: any) => ({ id: t.id, name: t.name, source: t.source }))); } catch { /* none */ } } }} onChange={(e) => setTheme(e.target.value)} style={inp}><option value="">choose a theme</option>{themes.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.source}</option>)}</select>
          <button data-testid="board-shape-save" disabled={!theme} onClick={async () => { const r = await x2<any>(space, "shape_export", { theme }); r.ok ? say(`saved into the theme ${theme} (xray.yaml)`) : say(r.error ?? "not saved", true); }} style={btn(false)}>Save into theme</button>
          <button data-testid="board-shape-load" disabled={!theme} onClick={async () => { const r = await x2<any>(space, "shape_import", { theme }); if (r.ok) { say(`loaded ${r.imported} parts from the theme ${theme}`); await load(); } else say(r.error ?? "not loaded", true); }} style={btn(false)}>Load from theme</button>
        </div>
        <textarea aria-label="package" value={pkgText} onChange={(e) => setPkgText(e.target.value)} placeholder='{"name": "health", "version": "1", "widgets": [ {"id": "log", "title": "Log", "source": "history", "view": "list"} ]}' rows={3} style={{ ...inp, fontFamily: mono, resize: "vertical" }} />
        <div><button data-testid="board-install-json" onClick={async () => { let p: any; try { p = JSON.parse(pkgText); } catch { say("that is not JSON", true); return; } const r = await x2<any>(space, "install", { package: p }); if (r.ok) { say(`installed ${r.installed}`); setPkgText(""); } else say(r.error ?? "not installed", true); await load(); }} style={btn(true)}>Install this package</button></div>
      </div>}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12 }}>
        {layout && layout.grid.length === 0 && <div data-testid="board-empty" style={{ color: C.muted, fontSize: 13 }}>This screen has no widgets yet. Add one, or ask an agent to arrange it.</div>}
        <div ref={grid} data-testid="board-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gridAutoRows: ROW_H, gap: 8 }}>
          {(layout?.grid ?? []).map((c) => <Tile key={c.widget} w={byId.get(c.widget)} cell={c} space={space} editing={editing} colW={colW + 0} onChange={change} onDragEnd={(n) => change(n)} />)}
        </div>
        {editing && free.length > 0 && <div data-testid="board-free" style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: C.muted }}>Not on the board:{free.map((w) => <button key={w.id} onClick={async () => { const r = await x2<any>(space, "layout_place", { screen, widget: w.id }); r.ok ? say(`${w.id} added`) : say(r.error ?? "not added", true); await load(); }} style={btn(false)}>+ {w.title}</button>)}</div>}
      </div>
    </div>
  );
}
const inp: React.CSSProperties = { background: "transparent", color: "var(--c-fg, inherit)", border: "1px solid var(--c-border)", borderRadius: 8, padding: "4px 8px", fontSize: 12.5, fontFamily: "inherit", minWidth: 0 };
const btn = (on: boolean): React.CSSProperties => ({ fontFamily: "inherit", fontSize: 12, padding: "3px 11px", borderRadius: 999, cursor: "pointer", background: on ? "color-mix(in srgb, #4d8dff 16%, transparent)" : "transparent", color: on ? "#4d8dff" : "var(--c-fg, inherit)", border: `1px solid ${on ? "color-mix(in srgb, #4d8dff 45%, transparent)" : "var(--c-border)"}` });
