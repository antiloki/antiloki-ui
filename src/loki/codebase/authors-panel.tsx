// THE AUTHORS LAYER — four tabs (graph · profile · co-dependency · bus-factor), deterministic from git
// (system.code.authors). AVATARS ARE FULLY LOCAL: a monogram with a hue hashed from the email — zero
// network (the operator's no-3rd-party choice). Framing is knowledge / ownership / bus-factor, never blame.
import React from "react";
import { C, mono } from "@/loki/theme";
import { authorsGet, getMetrics, type Authors, type Author, type FileMetric } from "@/loki/api/codebase";

const hashHue = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 360; };
const initials = (name: string) => { const p = String(name).trim().split(/[\s._@-]+/).filter(Boolean); return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase(); };
function Avatar({ name, email, size = 26 }: { name: string; email?: string; size?: number }) {
  const hue = hashHue((email || name || "?").toLowerCase());
  return <div title={`${name}${email ? ` · ${email}` : ""}`} style={{ width: size, height: size, borderRadius: size, background: `oklch(0.58 0.13 ${hue})`, color: "#fff", display: "grid", placeItems: "center", fontFamily: mono, fontSize: Math.round(size * 0.4), fontWeight: 700, flexShrink: 0, userSelect: "none" }}>{initials(name)}</div>;
}
const base = (p: string) => p.split("/").pop() || p;
function useWidth(def = 560) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [w, setW] = React.useState(def);
  React.useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth || def)); ro.observe(el); return () => ro.disconnect(); }, []);
  return [ref, w] as const;
}

type Tab = "graph" | "profile" | "codep" | "bus";
const TABS: [Tab, string][] = [["graph", "graph"], ["profile", "profile"], ["codep", "co-dependency"], ["bus", "bus-factor"]];

export function AuthorsPanel({ onOpen }: { onOpen?: (path: string) => void }) {
  const [data, setData] = React.useState<Authors | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<Tab>("graph");
  const [wrapRef, W] = useWidth(560);
  React.useEffect(() => { let a = true; void authorsGet({}).then((r) => { if (a) { setData(r); setLoading(false); } }); return () => { a = false; }; }, []);

  return (
    <div ref={wrapRef} style={{ height: "100%", overflow: "auto", padding: "8px 12px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>authors</span>
        {data && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>{data.author_count} authors · {data.commit_count} commits · local avatars, deterministic from git</span>}
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 10, borderBottom: `1px solid color-mix(in oklab, ${C.border} 60%, transparent)` }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ background: "transparent", border: "none", borderBottom: `2px solid ${tab === k ? C.brand : "transparent"}`, marginBottom: -1, color: tab === k ? C.brand : C.muted, padding: "1px 1px 4px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>{label}</button>
        ))}
      </div>

      {loading ? <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>reading git history…</div>
        : !data || data.error || data.author_count === 0 ? <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.7 }}>{data?.error ?? "no authors found."}<br /><span style={{ color: C.dim }}>Needs a git repository with history in the active workspace.</span></div>
        : tab === "graph" ? <GraphTab data={data} width={W} onOpen={onOpen} />
        : tab === "profile" ? <ProfileTab data={data} />
        : tab === "codep" ? <CodepTab data={data} width={W} onOpen={onOpen} />
        : <BusTab data={data} />}
    </div>
  );
}

// ── GRAPH: a LIVE atlas-style force graph. authors ● and files ○ are nodes, arrows = "touched". The sim
//    runs in a rAF loop that COOLS to rest and RE-HEATS on interaction, so nodes drift & reorganise. Drag a
//    node to pull it, click an author to DRILL IN (isolate their world), click a file to open it. Pan/zoom.
type GNode = { id: string; kind: "author" | "file"; label: string; path?: string; commits?: number; x: number; y: number; vx: number; vy: number; r: number; hue: number; fx: number | null; fy: number | null };
function GraphTab({ data, width, onOpen }: { data: Authors; width: number; onOpen?: (p: string) => void }) {
  const [full, setFull] = React.useState(false);
  const [focus, setFocus] = React.useState<string | null>(null); // drilled-in author id
  const [hover, setHover] = React.useState<string | null>(null);
  const [view, setView] = React.useState({ x: 0, y: 0, k: 0.55 });
  const [, setFrame] = React.useState(0);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const nodesRef = React.useRef<GNode[]>([]);
  const linksRef = React.useRef<{ s: number; t: number; w?: number }[]>([]);
  const movedRef = React.useRef(false);
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") { if (focus) setFocus(null); else if (full) setFull(false); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [full, focus]);
  const W = Math.max(420, full ? (typeof window !== "undefined" ? window.innerWidth - 40 : 1200) : width);
  const H = full ? (typeof window !== "undefined" ? window.innerHeight - 90 : 640) : Math.max(400, Math.round(W * 0.62));

  // STATIC graph (like the atlas): build + SETTLE SYNCHRONOUSLY here, then render fixed positions — no rAF,
  // no per-frame reconciliation, no drift, no gravity-clump-over-time. HIERARCHICAL: no focus → only the
  // AUTHORS (linked by shared-file collaboration); click an author → drill into JUST their files. Small graphs.
  React.useEffect(() => {
    const idx = new Map<string, number>();
    const ns: GNode[] = [];
    const add = (id: string, kind: "author" | "file", label: string, r: number, hue: number, path?: string, commits?: number) => {
      const ang = ns.length * 2.399, rad = 50 + ns.length * 8;
      idx.set(id, ns.length); ns.push({ id, kind, label, path, commits, x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, vx: 0, vy: 0, r, hue, fx: null, fy: null });
    };
    const ls: { s: number; t: number; w?: number }[] = [];
    if (focus) {
      const x = data.authors.find((au) => `a:${au.id}` === focus); // focus is the NODE id (a:<authorId>), not the raw id
      if (x) {
        add(`a:${x.id}`, "author", x.name, 14 + Math.min(18, x.commits / 12), hashHue(x.id), undefined, x.commits);
        const xNode = idx.get(`a:${x.id}`)!;
        const xFiles = x.files_list.slice(0, full ? 120 : 64);
        const xFileSet = new Set(xFiles);
        for (const p of xFiles) { add(`f:${p}`, "file", base(p), 6, 0, p); ls.push({ s: xNode, t: idx.get(`f:${p}`)! }); }
        // the INDIRECT connections: OTHER authors who also touched X's files (from the edges) → smaller nodes,
        // linked to the shared file. Click one to hop into their world.
        const byId = new Map(data.authors.map((au) => [au.id, au]));
        for (const e of data.edges) {
          if (e.author === x.id || !xFileSet.has(e.path)) continue;
          const co = byId.get(e.author); const fnode = idx.get(`f:${e.path}`); if (!co || fnode == null) continue;
          if (!idx.has(`a:${co.id}`)) add(`a:${co.id}`, "author", co.name, 8 + Math.min(11, co.commits / 16), hashHue(co.id), undefined, co.commits);
          ls.push({ s: idx.get(`a:${co.id}`)!, t: fnode });
        }
      }
    } else {
      const authors = data.authors.slice(0, full ? 48 : 28);
      authors.forEach((a) => add(`a:${a.id}`, "author", a.name, 8 + Math.min(18, a.commits / 12), hashHue(a.id), undefined, a.commits));
      // only the STRONGER collaborations (else everyone links to everyone → the graph clumps into a ball)
      for (const c of data.codep.filter((x) => x.shared >= 2).slice(0, 40)) { const s = idx.get(`a:${c.a}`), t = idx.get(`a:${c.b}`); if (s != null && t != null) ls.push({ s, t, w: c.shared }); }
    }
    // spring-electrical settle, cools over the iterations; the centroid is re-centred each step (a rigid
    // translation — it keeps the graph on-screen WITHOUT pulling nodes together, so no gravity clumping).
    let al = 1;
    for (let it = 0; it < 400 && ns.length; it++) {
      for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) { const a = ns[i], b = ns[j]; const dx = a.x - b.x, dy = a.y - b.y; const d2 = Math.max(dx * dx + dy * dy, 64), dd = Math.sqrt(d2), f = (4600 / d2) * al; a.vx += (dx / dd) * f; a.vy += (dy / dd) * f; b.vx -= (dx / dd) * f; b.vy -= (dy / dd) * f; }
      for (const l of ls) { const a = ns[l.s], b = ns[l.t]; if (!a || !b) continue; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, f = (d - 130) * 0.006 * al; a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f; }
      for (const n of ns) { n.vx = (n.vx - n.x * 0.0012 * al) * 0.86; n.vy = (n.vy - n.y * 0.0012 * al) * 0.86; n.x += n.vx; n.y += n.vy; }
      let mx = 0, my = 0; for (const n of ns) { mx += n.x; my += n.y; } mx /= ns.length; my /= ns.length;
      for (const n of ns) { n.x -= mx; n.y -= my; }
      al *= 0.99;
    }
    nodesRef.current = ns; linksRef.current = ls; setFrame((f) => f + 1);
  }, [data, full, focus]);

  React.useEffect(() => { setView({ x: W / 2, y: H / 2, k: full ? 0.62 : 0.5 }); }, [full, focus]); // re-center on drill in/out
  const toGraph = (cx: number, cy: number) => { const r = svgRef.current?.getBoundingClientRect(); if (!r) return null; return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }; };
  // NATIVE non-passive wheel listener so preventDefault actually works (React onWheel is passive → the
  // page scrolled). Zooms the canvas only. Re-attaches on fullscreen toggle (the svg element re-mounts).
  React.useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setView((v) => { const k = Math.max(0.15, Math.min(4, v.k * f)); return { k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) }; });
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [full]);
  const onBgDown = (e: React.PointerEvent) => { if (e.button !== 0) return; movedRef.current = false; const sx = e.clientX, sy = e.clientY, v0 = view; const mv = (ev: PointerEvent) => { if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) movedRef.current = true; setView({ k: v0.k, x: v0.x + (ev.clientX - sx), y: v0.y + (ev.clientY - sy) }); }; const up = () => { if (!movedRef.current && focus) setFocus(null); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); };
  // static drag: move the node directly and leave it there (no springs to pull it back)
  const onNodeDown = (e: React.PointerEvent, i: number) => { e.stopPropagation(); movedRef.current = false; const mv = (ev: PointerEvent) => { movedRef.current = true; const g = toGraph(ev.clientX, ev.clientY); if (g) { nodesRef.current[i].x = g.x; nodesRef.current[i].y = g.y; setFrame((f) => f + 1); } }; const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); };

  const nodes = nodesRef.current, links = linksRef.current;
  // hover lights the node + its direct neighbours (works for the default and the drilled co-author view)
  const hoverAdj = React.useMemo(() => { if (!hover) return null; const s = new Set<string>([hover]); for (const l of links) { const a = nodes[l.s]?.id, b = nodes[l.t]?.id; if (a === hover && b) s.add(b); if (b === hover && a) s.add(a); } return s; }, [hover, nodes, links]);
  const lit = (id?: string) => id == null ? false : (!hover ? true : (hoverAdj?.has(id) ?? false));
  const focusName = focus ? nodes.find((n) => n.id === focus)?.label : null;

  const graph = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>{focusName ? <>▸ <b style={{ color: C.fg }}>{focusName}</b>&apos;s files + the authors who share them · click another author to hop · click a file to open · empty space to exit</> : <>the team — authors, linked where they share files · <b style={{ color: C.muted }}>click an author to drill into their files</b> · scroll to zoom</>}</span>
        <span style={{ flex: 1 }} />
        {focus && <button onClick={() => setFocus(null)} title="exit drill-in" style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 11 }}>✕ exit</button>}
        <button onClick={() => setView({ x: W / 2, y: H / 2, k: full ? 0.62 : 0.5 })} title="reset view" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 12 }}>⟳</button>
        <button onClick={() => setFull((f) => !f)} title={full ? "exit fullscreen (Esc)" : "expand to a full-screen canvas"} style={{ background: "transparent", border: "none", color: full ? C.brand : C.dim, cursor: "pointer", fontFamily: mono, fontSize: 13 }}>{full ? "🗗" : "⛶"}</button>
      </div>
      <svg ref={svgRef} width={W} height={H} onPointerDown={onBgDown} style={{ display: "block", background: "#08080d", borderRadius: 8, cursor: "grab", touchAction: "none" }}>
        <defs><marker id="arw" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill={C.border} /></marker></defs>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {links.map((l, i) => { const a = nodes[l.s], b = nodes[l.t]; if (!a || !b) return null; const on = lit(a.id) && lit(b.id); const arrow = b.kind === "file"; return (
            <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on ? `oklch(0.58 0.13 ${a.hue})` : C.border} strokeWidth={on ? (arrow ? 0.8 : 0.4 + Math.min(2.4, (l.w ?? 1) / 3)) : 0.4} opacity={on ? (arrow ? 0.4 : 0.3) : 0.05} markerEnd={on && arrow ? "url(#arw)" : undefined} />
          ); })}
          {nodes.map((n, i) => { if (n.kind !== "file") return null; const on = lit(n.id); return (
            <g key={n.id} onPointerDown={(e) => onNodeDown(e, i)} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={() => { if (!movedRef.current && n.path) onOpen?.(n.path); }} style={{ cursor: onOpen ? "pointer" : "default" }}>
              <circle cx={n.x} cy={n.y} r={n.r} fill={on ? C.brand : C.border} opacity={on ? 0.9 : 0.22}><title>{n.path}</title></circle>
              <text x={n.x + n.r + 3} y={n.y + 3} style={{ fontFamily: mono, fontSize: 9, fill: on ? C.muted : C.dim, opacity: on ? 1 : 0.55, pointerEvents: "none" }}>{n.label.slice(0, 22)}</text>
            </g>
          ); })}
          {nodes.map((n, i) => { if (n.kind !== "author") return null; const on = lit(n.id); return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`} onPointerDown={(e) => onNodeDown(e, i)} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={() => { if (!movedRef.current) setFocus((f) => f === n.id ? null : n.id); }} style={{ cursor: "pointer" }}>
              <circle r={n.r + 6} fill={`oklch(0.58 0.13 ${n.hue})`} opacity={on ? 0.18 : 0.05} />
              <circle r={n.r} fill={`oklch(0.5 0.13 ${n.hue})`} stroke={focus === n.id ? "#fff" : "#fff"} strokeWidth={focus === n.id ? 1.5 : 0.5} opacity={on ? 1 : 0.25}><title>{`${n.label} · ${n.commits} commits`}</title></circle>
              <text textAnchor="middle" y={3.5} style={{ fontFamily: mono, fontSize: n.r * 0.7, fontWeight: 700, fill: "#fff", pointerEvents: "none" }}>{initials(n.label)}</text>
              <text textAnchor="middle" y={n.r + 11} style={{ fontFamily: mono, fontSize: 8, fill: on ? C.fg : C.dim, pointerEvents: "none" }}>{n.label.slice(0, 14)}</text>
            </g>
          ); })}
        </g>
      </svg>
    </>
  );
  return full ? <div style={{ position: "fixed", inset: 0, zIndex: 320, background: C.bg, padding: "10px 16px", boxSizing: "border-box" }}>{graph}</div> : <div>{graph}</div>;
}

// ── PROFILE (merged x-ray + deterministic profile): git stats AND what the atlas metrics say about them.
type Metric = Omit<FileMetric, "path">;
function ProfileTab({ data }: { data: Authors }) {
  const [metrics, setMetrics] = React.useState<Record<string, Metric> | null>(null);
  const [sel, setSel] = React.useState(data.authors[0]?.id ?? "");
  React.useEffect(() => { let a = true; void getMetrics({}).then((r) => { if (a) setMetrics(r?.metrics_by_file ?? null); }); return () => { a = false; }; }, []);
  const a = data.authors.find((x) => x.id === sel) ?? data.authors[0];
  const maxC = Math.max(1, ...data.authors.map((x) => x.commits));
  const nameOf = (id: string) => data.authors.find((x) => x.id === id)?.name ?? id;
  const emailOf = (id: string) => data.authors.find((x) => x.id === id)?.email ?? "";
  const collabs = data.codep.filter((c) => c.a === a?.id || c.b === a?.id).map((c) => ({ id: c.a === a?.id ? c.b : c.a, shared: c.shared })).slice(0, 5);

  const metMap = React.useMemo(() => { const m = new Map<string, Metric>(); for (const [p, v] of Object.entries(metrics ?? {})) m.set(p.replace(/\\/g, "/"), v); return m; }, [metrics]);
  const prof = React.useMemo(() => {
    if (!a || !metrics) return null;
    const metFor = (p: string): Metric | null => { const n = p.replace(/\\/g, "/"); if (metMap.has(n)) return metMap.get(n)!; for (const [k, v] of metMap) if (k.endsWith("/" + n) || n.endsWith("/" + k)) return v; return null; };
    const files = a.files_list.map((p) => ({ p, m: metFor(p) })).filter((x): x is { p: string; m: Metric } => !!x.m);
    const n = files.length; if (!n) return { n: 0 } as any;
    const mean = (f: (m: Metric) => number) => files.reduce((s, x) => s + (f(x.m) || 0), 0) / n;
    const avgComplexity = mean((m) => m.complexity ?? 0), avgFanIn = mean((m) => m.fan_in), avgLoc = mean((m) => m.loc);
    const totalChurn = files.reduce((s, x) => s + (x.m.churn ?? 0), 0);
    const pctCovered = Math.round((files.filter((x) => x.m.covered).length / n) * 100);
    const avgHealth = Math.round(mean((m) => 100 - (m.badness ?? 0) * 100));
    const massSum = Math.round(files.reduce((s, x) => s + (x.m.gravity ?? 0), 0));
    const folders = new Map<string, number>();
    for (const x of files) { const dir = x.p.replace(/\\/g, "/").split("/").slice(0, -1).slice(-2).join("/") || "root"; folders.set(dir, (folders.get(dir) ?? 0) + 1); }
    const topFolders = [...folders.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4);
    const breadth = new Set(files.map((x) => x.p.replace(/\\/g, "/").split("/")[0])).size;
    const archetype =
      pctCovered >= 60 ? { name: "The Guardian", why: "tests most of what they touch" } :
      avgFanIn >= 5 ? { name: "The Keystone", why: "works in load-bearing, heavily-imported code" } :
      totalChurn >= 40 ? { name: "The Firefighter", why: "lives in the churn hotspots" } :
      avgComplexity >= 15 ? { name: "The Deep Diver", why: "takes on the gnarly, complex files" } :
      a.solo >= 10 ? { name: "The Lone Keeper", why: `sole owner of ${a.solo} files — a bus-factor` } :
      breadth >= 5 ? { name: "The Generalist", why: "ranges broadly across the codebase" } :
      { name: "The Builder", why: "a steady, focused contributor" };
    const reads: string[] = [];
    if (pctCovered >= 50) reads.push(`Ships tested code — ${pctCovered}% of their files are covered`);
    else if (pctCovered < 25 && n > 5) reads.push(`Thin test coverage on their files (${pctCovered}%)`);
    if (avgFanIn >= 4) reads.push(`Works in load-bearing code — avg fan-in ${avgFanIn.toFixed(1)}`);
    if (avgComplexity >= 12) reads.push(`Comfortable with complexity — avg cyclomatic ${avgComplexity.toFixed(0)}`);
    if (totalChurn >= 30) reads.push(`Frequently in the churn hotspots`);
    if (avgHealth >= 75) reads.push(`Their files run healthy — avg ${avgHealth}/100`);
    else if (avgHealth < 50) reads.push(`Their files carry weight — avg health ${avgHealth}/100 (often the hard code)`);
    return { n, avgComplexity, avgFanIn, avgLoc, totalChurn, pctCovered, avgHealth, massSum, topFolders, breadth, archetype, reads };
  }, [a, metrics, metMap]);

  if (!a) return null;
  const Stat = ({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) => (
    <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontFamily: mono, fontSize: 15, fontWeight: 700, color: color ?? C.fg, fontVariantNumeric: "tabular-nums" }}>{value}</span><span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span></div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 14 }}>
      <div style={{ maxHeight: "64vh", overflow: "auto" }}>
        {data.authors.slice(0, 60).map((x) => (
          <div key={x.id} onClick={() => setSel(x.id)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 5px", borderRadius: 5, cursor: "pointer", background: x.id === a.id ? C.panel2 : "transparent" }}>
            <Avatar name={x.name} email={x.email} size={20} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: mono, fontSize: 9.5, color: x.id === a.id ? C.fg : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</div>
              <div style={{ height: 2, background: C.brand, opacity: 0.5, width: `${(x.commits / maxC) * 100}%` }} />
            </div>
            <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{x.commits}</span>
          </div>
        ))}
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <Avatar name={a.name} email={a.email} size={46} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: mono, fontSize: 13, color: C.fg, fontWeight: 700 }}>{a.name}</div>
            <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>{a.email}</div>
            {prof && prof.n > 0 && <div style={{ fontFamily: mono, fontSize: 14, color: C.brand, fontWeight: 700, marginTop: 2 }}>{prof.archetype.name} <span style={{ fontSize: 9, color: C.dim, fontWeight: 400 }}>— {prof.archetype.why}</span></div>}
          </div>
        </div>
        {/* git stats (x-ray) */}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
          <Stat label="commits" value={a.commits} />
          <Stat label="files touched" value={a.files} />
          <Stat label="solely owns" value={a.solo} color={a.solo > 0 ? C.warn : C.fg} />
          <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>{a.first} → {a.last}</span><span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>tenure</span></div>
        </div>
        {a.solo > 0 && <div style={{ fontFamily: mono, fontSize: 9, color: C.warn, marginBottom: 12 }}>⚠ bus-factor: {a.solo} file{a.solo === 1 ? "" : "s"} only this person has touched.</div>}
        {/* the atlas signature (profile) */}
        {!prof || prof.n === 0 ? (
          <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, marginBottom: 12 }}>{metrics ? "none of their files are in the current atlas — rebuild for the code signature." : "reading the atlas intelligence for their code signature…"}</div>
        ) : (
          <>
            <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>what their code says <span style={{ textTransform: "none", letterSpacing: 0, color: C.dim }}>— deterministic, from the atlas metrics of {prof.n} files</span></div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "9px 12px", background: C.panel2, borderRadius: 8, marginBottom: 10 }}>
              <Stat label="avg health" value={prof.avgHealth} color={prof.avgHealth >= 75 ? C.ok : prof.avgHealth >= 50 ? C.warn : C.bad} />
              <Stat label="coverage" value={`${prof.pctCovered}%`} color={prof.pctCovered >= 60 ? C.ok : prof.pctCovered >= 30 ? C.warn : C.bad} />
              <Stat label="avg cyclomatic" value={prof.avgComplexity.toFixed(0)} />
              <Stat label="avg fan-in" value={prof.avgFanIn.toFixed(1)} />
              <Stat label="code mass" value={prof.massSum} />
            </div>
            {prof.reads.map((r: string, i: number) => <div key={i} style={{ fontFamily: mono, fontSize: 10, color: C.fg, padding: "1px 0" }}>· {r}</div>)}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {prof.topFolders.map(([dir, k]: [string, number]) => <span key={dir} style={{ fontFamily: mono, fontSize: 9, color: C.dim, background: C.panel2, borderRadius: 4, padding: "1px 7px" }}>{dir} <b style={{ color: C.muted }}>{k}</b></span>)}
            </div>
          </>
        )}
        {/* closest collaborators (who they share files with) */}
        {collabs.length > 0 && (
          <>
            <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 1, margin: "12px 0 5px" }}>closest collaborators</div>
            {collabs.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 0" }}>
                <Avatar name={nameOf(c.id)} email={emailOf(c.id)} size={18} />
                <span style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, flex: 1 }}>{nameOf(c.id)}</span>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>{c.shared} shared file{c.shared === 1 ? "" : "s"}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── CO-DEPENDENCY: the AUTHOR ↔ FILE dependency matrix — who a file depends on. Cell = commits touching it.
function CodepTab({ data, width, onOpen }: { data: Authors; width: number; onOpen?: (p: string) => void }) {
  const authors = data.authors.slice(0, 12);
  const aIdx = new Map(authors.map((a, i) => [a.id, i]));
  const aSet = new Set(authors.map((a) => a.id));
  const files = [...new Set(data.edges.filter((e) => aSet.has(e.author)).map((e) => e.path))].slice(0, 26);
  const touch = new Map<string, number>(); // `${fi}:${ai}` → touches
  let max = 1;
  for (const e of data.edges) { const ai = aIdx.get(e.author), fi = files.indexOf(e.path); if (ai == null || fi < 0) continue; touch.set(`${fi}:${ai}`, e.touches); if (e.touches > max) max = e.touches; }
  const gutter = 150, cell = Math.max(15, Math.min(26, Math.floor((Math.max(360, width) - gutter) / Math.max(1, authors.length))));
  const heat = (v: number) => v === 0 ? "transparent" : `color-mix(in oklab, ${C.brand} ${Math.round(20 + (v / max) * 70)}%, transparent)`;
  if (!files.length) return <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, padding: 12 }}>no author↔file data.</div>;
  return (
    <div style={{ overflow: "auto" }}>
      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginBottom: 8 }}>which authors each FILE depends on · cell = commits that author made to it · a single bright cell in a row = bus-factor</div>
      <div style={{ display: "grid", gridTemplateColumns: `${gutter}px repeat(${authors.length}, ${cell}px)` }}>
        <div />
        {authors.map((a) => <div key={a.id} title={a.name} style={{ display: "grid", placeItems: "center", height: 26 }}><Avatar name={a.name} email={a.email} size={17} /></div>)}
        {files.map((p, fi) => (
          <React.Fragment key={p}>
            <div onClick={() => onOpen?.(p)} title={p} style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6, cursor: onOpen ? "pointer" : "default", overflow: "hidden" }}>
              <code style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{base(p)}</code>
            </div>
            {authors.map((a, ai) => { const v = touch.get(`${fi}:${ai}`) ?? 0; return (
              <div key={a.id} title={`${base(p)} ⟵ ${a.name}: ${v} commit${v === 1 ? "" : "s"}`} style={{ width: cell, height: cell, background: heat(v), border: `1px solid ${C.bg}`, display: "grid", placeItems: "center", fontFamily: mono, fontSize: 7.5, color: v / max > 0.5 ? "#fff" : C.dim }}>{v || ""}</div>
            ); })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── BUS-FACTOR: single-owner risk
function BusTab({ data }: { data: Authors }) {
  const bf = data.bus_factor;
  if (!bf) return <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>no bus-factor data.</span>;
  const pct = bf.total_files ? Math.round((bf.solo_files / bf.total_files) * 100) : 0;
  const maxSolo = Math.max(1, ...bf.top_solo.map((x) => x.solo));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 14px", background: C.panel2, borderRadius: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: pct > 50 ? C.bad : pct > 25 ? C.warn : C.ok, fontVariantNumeric: "tabular-nums" }}>{pct}%</span><span style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6 }}>single-owner files</span></div>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>{bf.solo_files} of {bf.total_files} files have been touched by exactly one person — if they leave, that knowledge goes with them.</span>
      </div>
      <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>knowledge concentration — who solely owns the most</div>
      {bf.top_solo.length ? bf.top_solo.map((s) => (
        <div key={s.id} style={{ display: "grid", gridTemplateColumns: "26px 1fr 46px", gap: 8, alignItems: "center", padding: "3px 0" }}>
          <Avatar name={s.name} email={s.id} size={22} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
            <div style={{ height: 5, background: C.panel2, borderRadius: 3, overflow: "hidden", marginTop: 1 }}><div style={{ width: `${(s.solo / maxSolo) * 100}%`, height: "100%", background: C.warn }} /></div>
          </div>
          <span style={{ fontFamily: mono, fontSize: 10, color: C.warn, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.solo}</span>
        </div>
      )) : <span style={{ fontFamily: mono, fontSize: 9.5, color: C.ok }}>no single-owner concentration — knowledge is well shared.</span>}
    </div>
  );
}
