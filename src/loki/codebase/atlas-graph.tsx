// EPIC-CODEBASE-ATLAS — the Obsidian-style graph. A fullscreen, force-directed map of the code:
// dots = files (radius by fan-in), colored by file extension; lines = import bindings with
// directional arrows (IN = importers, OUT = imports). Scroll to zoom, drag the background to pan,
// drag a dot to pull it, click a dot to open its file overlay (defs + signatures + bindings).
// Opened on demand from the Atlas screen (a button), never inline — it owns the whole viewport.
import React from "react";
import { C, mono } from "@/loki/theme";
import type { AtlasResponse, FileSource, FileSnapshot, SnapshotGet } from "@/loki/api/codebase";
import { fileRead, fileSnapshot, fileSnapshotGet, snapshotAll, symbolExplain, entryPointsGet, blastRadius, fileDiagram, decorateFile } from "@/loki/api/codebase";
import { Highlighted } from "./highlight";
// atlas-decorators is 4k lines and pulls docs-site + the cinematic player behind it. This card only
// appears once the operator clicks a decorator, so it loads then — a static import here put all of
// it in front of every screen that draws a code graph.
const DecoratorCard = React.lazy(() => import("./atlas-decorators").then((m) => ({ default: m.DecoratorCard })));

import { baseName, clamp, extOf, extColor, isReactExt, isTestPath } from "./ext";
export { extOf, extColor, isReactExt, isTestPath };

const hashHue = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return ((h % 360) + 360) % 360; };
// convex hull (Andrew's monotone chain) — the boundary of a folder's node cloud.
function convexHull(pts: { x: number; y: number }[]) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: any, a: any, b: any) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: any[] = []; for (const pt of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pt) <= 0) lo.pop(); lo.push(pt); }
  const up: any[] = []; for (let i = p.length - 1; i >= 0; i--) { const pt = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], pt) <= 0) up.pop(); up.push(pt); }
  lo.pop(); up.pop(); return lo.concat(up);
}

// Build the file-level graph (dots + directional links). Capped to the most-connected files so the
// sim stays smooth; the cap is generous since this view is fullscreen + zoomable.
function buildGraph(atlas: AtlasResponse, keep?: Set<string>) {
  const nodeFile = new Map<string, string>();
  for (const n of atlas.nodes) nodeFile.set(n.id, n.path);
  let files = atlas.nodes.filter((n) => n.type === "file");

  const fanIn = new Map<string, number>(), fanOut = new Map<string, number>();
  const seen = new Set<string>();
  const rawLinks: { from: string; to: string }[] = [];
  for (const e of atlas.edges) {
    if (e.type !== "imports") continue;
    const a = nodeFile.get(e.from_node), b = nodeFile.get(e.to_node);
    if (!a || !b || a === b) continue;
    const k = a + "\u0001" + b; // pair separator (impossible in a git path) — was a literal invisible 0x01 byte, same char now visible as an escape
    if (seen.has(k)) continue;
    seen.add(k);
    rawLinks.push({ from: a, to: b });
    fanIn.set(b, (fanIn.get(b) ?? 0) + 1);
    fanOut.set(a, (fanOut.get(a) ?? 0) + 1);
  }

  const CAP = 300;
  const total = files.length;
  files = [...files].sort((x, y) =>
    ((fanIn.get(y.path) ?? 0) + (fanOut.get(y.path) ?? 0)) - ((fanIn.get(x.path) ?? 0) + (fanOut.get(x.path) ?? 0)) || x.path.localeCompare(y.path),
  ).slice(0, CAP);
  if (keep && keep.size) { // never cap out a touched file (the blueprint highlight set)
    const have = new Set(files.map((f) => f.path));
    for (const n of atlas.nodes) if (n.type === "file" && keep.has(n.path) && !have.has(n.path)) { files.push(n); have.add(n.path); }
  }

  const idx = new Map<string, number>();
  files.forEach((f, i) => idx.set(f.path, i));
  const maxFan = Math.max(1, ...fanIn.values());
  const N = files.length;
  const nodes = files.map((f, i) => {
    const ang = (i / Math.max(1, N)) * Math.PI * 2;
    const rad = 140 + (i % 7) * 26;
    return {
      id: f.id, path: f.path, intent: f.intent ?? null,
      x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, vx: 0, vy: 0,
      r: 4 + 9 * ((fanIn.get(f.path) ?? 0) / maxFan),
      fanIn: fanIn.get(f.path) ?? 0, fanOut: fanOut.get(f.path) ?? 0,
      color: extColor(f.path),
      // folder-scoped extras (folderScopedAtlas): subfolder nodes drill in; external ghost = a folder the
      // scope connects to (click follows it). isExternal nodes aren't real atlas files.
      isDir: (f as any).isDir ?? false, isExternal: (f as any).isExternal ?? false, count: (f as any).count ?? 0,
    };
  });
  const links = rawLinks
    .filter((l) => idx.has(l.from) && idx.has(l.to))
    .map((l) => ({ s: idx.get(l.from)!, t: idx.get(l.to)! }));

  // adjacency for IN/OUT highlight on select
  const adj = new Map<number, { in: Set<number>; out: Set<number> }>();
  nodes.forEach((_, i) => adj.set(i, { in: new Set(), out: new Set() }));
  for (const l of links) { adj.get(l.t)!.in.add(l.s); adj.get(l.s)!.out.add(l.t); }

  return { nodes, links, adj, capped: total > CAP, total, shown: N };
}

// one settle tick of a compact spring-electrical sim (O(n²) repulsion — fine ≤300 nodes).
function tick(nodes: any[], links: any[]) {
  const REPEL = 2600, SPRING = 0.025, REST = 64, CENTER = 0.012, DAMP = 0.82;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = a.x - b.x; const dy = a.y - b.y;
      let d2 = dx * dx + dy * dy; if (d2 < 0.01) { d2 = 0.01; dx = (i - j) * 0.1 + 0.05; }
      const d = Math.sqrt(d2), f = REPEL / d2, fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
  }
  for (const l of links) {
    const a = nodes[l.s], b = nodes[l.t];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01, f = (d - REST) * SPRING, fx = (dx / d) * f, fy = (dy / d) * f;
    a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
  }
  for (const n of nodes) {
    n.vx += -n.x * CENTER; n.vy += -n.y * CENTER;
    n.vx *= DAMP; n.vy *= DAMP;
    n.x += n.vx; n.y += n.vy;
  }
}

// Folder ZONES — convex hulls around each folder's node cloud (depth 1..maxDepth), padded, with a
// label at the hull's top. Shared by the full overlay + the mini preview so they render identically.
export function computeZones(nodes: any[], maxDepth = 2) {
  const out: any[] = [];
  for (let d = 1; d <= maxDepth; d++) {
    const groups = new Map<string, any[]>();
    for (const n of nodes) {
      const parts = String(n.path).replace(/\\/g, "/").split("/").filter(Boolean);
      if (parts.length <= d) continue;
      const pre = parts.slice(0, d).join("/");
      if (!groups.has(pre)) groups.set(pre, []);
      groups.get(pre)!.push(n);
    }
    for (const [pre, ns] of groups) {
      if (ns.length < 3) continue;
      const pts = ns.map((n) => ({ x: n.x, y: n.y }));
      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
      const pad = 34 - d * 7;
      const hull = convexHull(pts).map((p) => { const dx = p.x - cx, dy = p.y - cy, dd = Math.hypot(dx, dy) || 1; return { x: p.x + (dx / dd) * pad, y: p.y + (dy / dd) * pad }; });
      if (hull.length < 3) continue;
      const top = hull.reduce((a, p) => (p.y < a.y ? p : a), hull[0]);
      out.push({ pre, label: pre.split("/").pop(), depth: d, hull, labelPt: top, hue: hashHue(pre) });
    }
  }
  return out;
}

// A compact, static force-graph that renders the SAME as the full overlay (folder zones + file-name
// labels + import lines + clickable nodes) — same buildGraph + tick layout engine + computeZones,
// settled synchronously + fit to the box. The Atlas screen's graph PREVIEW; nodes open their file,
// the background click / ⛶ button expands the full overlay.
const miniBtn: React.CSSProperties = {
  background: `color-mix(in oklab, ${C.panel} 88%, transparent)`, border: `1px solid ${C.border}`, color: C.dim,
  borderRadius: 5, width: 22, height: 22, fontSize: 12, cursor: "pointer", display: "grid", placeItems: "center", lineHeight: 1,
};

export function AtlasGraphMini({ atlas, height = 280, onPick, flow, controls, onMaximize, highlight, initialDir }: { atlas: AtlasResponse; height?: number; onPick?: (id: string) => void; flow?: any[] | null; controls?: boolean; onMaximize?: () => void; highlight?: Record<string, string>; initialDir?: string }) {
  // highlight = path → status ('added'|'changed'|'touched'). When present, the whole codebase shows
  // dimmed and the touched files read at full opacity with a status ring (the blueprint structure view).
  const keep = React.useMemo(() => (highlight ? new Set(Object.keys(highlight)) : undefined), [highlight]);
  // FOLDER-LEVEL navigation: scope the graph to ONE folder's children at a time (subfolders drill in) instead
  // of dumping all files. Off when a blueprint highlight or a flow story drives the view (those want the full graph).
  const [dirNav, setDirNav] = React.useState(initialDir ?? "");
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null); // hover a node → light up its in/out connections (like the expanded)
  const folderNav = !highlight && !(Array.isArray(flow) && flow.length);
  const g = React.useMemo(() => {
    const gg = buildGraph(folderNav ? folderScopedAtlas(atlas, dirNav) : atlas, keep);
    for (let i = 0; i < 200; i++) tick(gg.nodes, gg.links); // settle the same sim, statically
    return gg;
  }, [atlas, keep, folderNav, dirNav]);
  const zones = React.useMemo(() => (folderNav ? [] : computeZones(g.nodes, 2)), [g, folderNav]);
  // FLOW STORY (chat code-sample): an ordered list of hops {path, sample?} → a pulse walks it, revealing
  // each file's name + the data SHAPE it exports (the sample, grounded in atlas defs) as a moving caption,
  // like the expanded graph's flow. Play/pause · speed · restart via the control bar. Inert with no flow.
  const flowHops = React.useMemo(
    () => (Array.isArray(flow) ? flow.map((h: any) => (typeof h === "string" ? { path: h } : h)).filter((h: any) => h && h.path) : []),
    [flow],
  );
  const flowIdx = React.useMemo(() => {
    if (flowHops.length < 2) return [];
    const byPath = new Map<string, number>();
    g.nodes.forEach((n, i) => { if (!byPath.has(n.path)) byPath.set(n.path, i); });
    return flowHops.map((h: any) => byPath.get(h.path)).filter((i): i is number => i != null);
  }, [flowHops, g]);
  const pulseRef = React.useRef(0);
  const [, setPulseFrame] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [speed, setSpeed] = React.useState(1);
  const speedRef = React.useRef(1); speedRef.current = speed;
  const playRef = React.useRef(true); playRef.current = playing;
  React.useEffect(() => {
    if (flowIdx.length < 2) return;
    pulseRef.current = 0; setPlaying(true);
    const segs = flowIdx.length - 1;
    let raf = 0, last = 0;
    const loop = (t: number) => {
      if (!last) last = t;
      if (playRef.current) {
        pulseRef.current = Math.min(segs, pulseRef.current + ((t - last) / 1000) * 0.7 * speedRef.current);
        if (pulseRef.current >= segs) { playRef.current = false; setPlaying(false); } // stop at the end
      }
      last = t;
      setPulseFrame((f) => (f + 1) % 1e9);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [flowIdx]);
  const restartFlow = () => { pulseRef.current = 0; setPlaying(true); };
  const togglePlay = () => { if (pulseRef.current >= flowIdx.length - 1) pulseRef.current = 0; setPlaying((p) => !p); };
  const pulse = (() => {
    if (flowIdx.length < 2) return null;
    const tmax = flowIdx.length - 1;
    const t = Math.min(pulseRef.current, tmax);
    const i = Math.floor(t), frac = t - i;
    const a = g.nodes[flowIdx[i]], b = g.nodes[flowIdx[Math.min(i + 1, tmax)]];
    return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac, reached: Math.floor(t) + 1, hop: Math.round(t) };
  })();
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [view, setView] = React.useState({ scale: 1, tx: 0, ty: 0 });
  React.useEffect(() => { setView({ scale: 1, tx: 0, ty: 0 }); }, [dirNav]); // re-center when drilling folders
  const moved = React.useRef(false);
  const drag = React.useRef<any>(null);

  const bounds = React.useMemo(() => {
    if (!g.nodes.length) return null;
    return graphBounds([...g.nodes.map((n) => ({ x: n.x, y: n.y })), ...zones.flatMap((z) => z.hull)]);
  }, [g, zones]);

  // container px → viewBox coords (accounts for preserveAspectRatio="meet" letterboxing).
  const toVB = (cx: number, cy: number) => {
    const b = bounds!, rect = wrapRef.current!.getBoundingClientRect();
    const sf = Math.min(rect.width / b.w, rect.height / b.h);
    const offX = (rect.width - b.w * sf) / 2, offY = (rect.height - b.h * sf) / 2;
    return { x: b.minX + (cx - rect.left - offX) / sf, y: b.minY + (cy - rect.top - offY) / sf, sf };
  };
  const zoomAt = (cx: number, cy: number, factor: number) => {
    if (!bounds) return;
    const { x: vbX, y: vbY } = toVB(cx, cy);
    setView((v) => {
      const ns = clamp(v.scale * factor, 1, 12);
      const gx = (vbX - v.tx) / v.scale, gy = (vbY - v.ty) / v.scale;
      return { scale: ns, tx: vbX - gx * ns, ty: vbY - gy * ns };
    });
  };
  React.useEffect(() => {
    const el = wrapRef.current; if (!el || !bounds) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [bounds]);

  if (!g.nodes.length || !bounds) {
    return <div style={{ height, display: "grid", placeItems: "center", color: C.muted, fontFamily: mono, fontSize: 11 }}>no graph yet</div>;
  }
  const { minX, minY, w, h } = bounds;
  const onDown = (e: React.MouseEvent) => { moved.current = false; drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; };
  const onMove = (e: React.MouseEvent) => {
    // Capture the drag origin into a local: the setView updater below runs on a later render, by which
    // time onUp (or an unmount) may have nulled drag.current — reading drag.current.tx there crashed
    // "Cannot read properties of null (reading 'tx')", made reliable by the flow's per-frame re-renders.
    const d = drag.current;
    if (!d || !wrapRef.current) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) moved.current = true;
    const { sf } = toVB(e.clientX, e.clientY);
    setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.x) / sf, ty: d.ty + (e.clientY - d.y) / sf }));
  };
  const onUp = () => { drag.current = null; };
  return (
    <div ref={wrapRef} style={{ height, overflow: "hidden", cursor: drag.current ? "grabbing" : "grab", position: "relative" }}
      onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
      onDoubleClick={(e) => zoomAt(e.clientX, e.clientY, 1.8)} title="scroll to zoom · double-click to zoom in · drag to pan">
    <svg width="100%" height={height} viewBox={`${minX} ${minY} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
      <defs>
        <marker id="mini-in" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill={C.ok} /></marker>
        <marker id="mini-out" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill={C.warn} /></marker>
      </defs>
      <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
      {zones.map((z) => (
        <g key={"z" + z.pre} style={{ pointerEvents: "none" }}>
          <polygon points={z.hull.map((p: any) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
            fill={`oklch(0.6 0.13 ${z.hue})`} fillOpacity={0.035 + z.depth * 0.012} stroke={`oklch(0.62 0.13 ${z.hue})`} strokeOpacity={0.14 + z.depth * 0.06} strokeWidth={1} strokeLinejoin="round" />
          <text x={z.labelPt.x} y={z.labelPt.y - 3} fontFamily={mono} fontSize={z.depth === 1 ? 12 : 10.5} fill={`oklch(0.74 0.11 ${z.hue})`} opacity={0.5} textAnchor="middle" fontWeight={z.depth === 1 ? 600 : 400}>{z.label}/</text>
        </g>
      ))}
      {g.links.map((l, i) => {
        const a = g.nodes[l.s], b = g.nodes[l.t];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        const tx = b.x - (dx / d) * (b.r + 2.5), ty = b.y - (dy / d) * (b.r + 2.5);
        let stroke: string = C.border, op = 0.4, sw = 0.8, marker: string | undefined;
        if (hoverIdx != null) {
          if (l.t === hoverIdx) { stroke = C.ok; op = 0.95; sw = 1.5; marker = "url(#mini-in)"; }       // imports INTO the hovered node
          else if (l.s === hoverIdx) { stroke = C.warn; op = 0.95; sw = 1.5; marker = "url(#mini-out)"; } // the hovered node imports OUT
          else op = 0.06;
        }
        return <line key={i} x1={a.x} y1={a.y} x2={tx} y2={ty} stroke={stroke} strokeWidth={sw} opacity={op} markerEnd={marker} />;
      })}
      {g.nodes.map((n, i) => {
        // blueprint highlight: touched files at full opacity + a status ring, the rest dimmed.
        const hs = highlight ? highlight[n.path] : undefined;
        const dimmed = !!highlight && !hs;
        const ring = hs === "added" ? "#9ece6a" : hs === "changed" ? "#e0af68" : hs ? C.brand : null;
        const rr = n.isExternal ? Math.max(4, n.r) : n.isDir ? Math.max(7, n.r) : Math.max(2.5, n.r);
        const clickable = n.isDir || n.isExternal || !!onPick;
        const af = hoverIdx != null ? g.adj.get(hoverIdx) : null;
        const faded = hoverIdx != null && i !== hoverIdx && !(af?.in.has(i) || af?.out.has(i));
        return (
          <g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={dimmed ? 0.26 : faded ? 0.2 : 1}
            style={{ cursor: clickable ? "pointer" : "default" }}
            onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx((h) => (h === i ? null : h))}
            onClick={(e) => { e.stopPropagation(); if (moved.current) return; if (n.isDir || n.isExternal) setDirNav(n.path); else onPick?.(n.id); }}>
            {ring && <circle r={rr + 3.5} fill="none" stroke={ring} strokeWidth={1.8} />}
            {i === hoverIdx && <circle r={rr + 2.5} fill="none" stroke={C.fg} strokeWidth={1} opacity={0.7} />}
            <circle r={rr} fill={n.isExternal ? "transparent" : n.isDir ? C.brand : n.color} stroke={n.isExternal ? C.muted : undefined} strokeWidth={n.isExternal ? 1 : undefined} strokeDasharray={n.isExternal ? "2 2" : undefined} opacity={n.isExternal ? 0.8 : 0.95} />
            <text x={rr + 4} y={3} fontFamily={mono} fontSize={9} fontWeight={n.isDir ? 600 : 400} fill={dimmed ? C.muted : n.isExternal ? C.muted : (hs || n.isDir ? C.fg : C.dim)} style={{ pointerEvents: "none" }}>{n.isExternal ? "↗ " + baseName(n.path) : n.isDir ? baseName(n.path) + "/" : baseName(n.path).slice(0, 22)}</text>
          </g>
        );
      })}
      {/* flow-story pulse: the journey path lights up green as the pulse passes, hop names revealed */}
      {flowIdx.length >= 2 && pulse && (
        <g style={{ pointerEvents: "none" }}>
          {flowIdx.slice(1).map((idx, k) => {
            const a = g.nodes[flowIdx[k]], b = g.nodes[idx];
            const lit = k < pulse.reached;
            return <line key={"fe" + k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C.brand} strokeWidth={lit ? 2.4 : 1} opacity={lit ? 0.95 : 0.3} />;
          })}
          {flowIdx.map((idx, k) => (k < pulse.reached ? (
            <text key={"ft" + k} x={g.nodes[idx].x} y={g.nodes[idx].y - (g.nodes[idx].r + 5)} textAnchor="middle"
              fontFamily={mono} fontSize={8.5} fontWeight={600} fill={C.brand}
              paintOrder="stroke" stroke={C.bg} strokeWidth={2.5} strokeLinejoin="round">{baseName(g.nodes[idx].path).slice(0, 16)}</text>
          ) : null))}
          <circle cx={pulse.x} cy={pulse.y} r={9} fill="none" stroke={C.brand} strokeWidth={1} opacity={0.4} />
          <circle cx={pulse.x} cy={pulse.y} r={5.5} fill={C.brand} opacity={0.95} />
          {/* the data shape flowing — the arriving file's export surface, e.g. {reducer, Context, …} */}
          {flowHops[pulse.hop]?.sample && (
            <text x={pulse.x} y={pulse.y + 15} textAnchor="middle" fontFamily={mono} fontSize={8} fill={C.brand}
              paintOrder="stroke" stroke={C.bg} strokeWidth={2.5} strokeLinejoin="round">{flowHops[pulse.hop].sample}</text>
          )}
        </g>
      )}
      </g>
    </svg>
    {folderNav && (
      <div style={{ position: "absolute", top: 6, left: 6, display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap", maxWidth: "72%", background: `color-mix(in oklab, ${C.panel} 88%, transparent)`, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 7px" }}>
        {dirCrumbs(dirNav).map((c, i, arr) => (
          <React.Fragment key={c.path}>
            {i > 0 && <span style={{ color: C.muted, fontFamily: mono, fontSize: 9 }}>/</span>}
            <button onClick={() => setDirNav(c.path)} disabled={i === arr.length - 1}
              style={{ background: "transparent", border: "none", padding: 0, cursor: i === arr.length - 1 ? "default" : "pointer", color: i === arr.length - 1 ? C.fg : C.brand, fontFamily: mono, fontSize: 9.5 }}>{c.label}</button>
          </React.Fragment>
        ))}
      </div>
    )}
    {(controls || onMaximize) && (
      <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 4 }}>
        {controls && <button onClick={() => { const el = wrapRef.current; if (el) { const r = el.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25); } }} title="zoom in" style={miniBtn}>+</button>}
        {controls && <button onClick={() => { const el = wrapRef.current; if (el) { const r = el.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.25); } }} title="zoom out" style={miniBtn}>−</button>}
        {controls && <button onClick={() => { setView({ scale: 1, tx: 0, ty: 0 }); setDirNav(initialDir ?? ""); }} title="reset — re-center + back to this folder/file" style={miniBtn}>⟳</button>}
        {onMaximize && <button onClick={onMaximize} title="expand to the full graph" style={{ ...miniBtn, color: C.brand }}>⛶</button>}
      </div>
    )}
    {flowIdx.length >= 2 && (
      <div style={{ position: "absolute", left: 6, bottom: 6, display: "flex", alignItems: "center", gap: 3, background: `color-mix(in oklab, ${C.panel} 88%, transparent)`, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 4px" }}>
        <button onClick={togglePlay} title={playing ? "pause" : "play the flow"} style={miniBtn}>{playing ? "❚❚" : "▶"}</button>
        <button onClick={restartFlow} title="restart flow" style={miniBtn}>⟲</button>
        {[0.5, 1, 2].map((s) => (
          <button key={s} onClick={() => setSpeed(s)} title={`${s}× speed`} style={{ ...miniBtn, width: "auto", minWidth: 20, padding: "0 4px", color: speed === s ? C.brand : C.dim }}>{s}×</button>
        ))}
      </div>
    )}
    </div>
  );
}

// ── DETERMINISTIC architecture/data-flow DIAGRAM — the SAME atlas data as the graph, laid out as layered
// boxes+arrows instead of a force-graph (graph EXPLORES, diagram EXPLAINS). Whole codebase (files+imports)
// or, with focusPath, one file's internals (its symbols + calls). Role inferred from the path. Zoom/pan. ──
export const DIAG_ROLE: Record<string, string> = {
  ui: "oklch(0.80 0.13 250)", state: "oklch(0.74 0.13 300)", logic: "oklch(0.80 0.15 150)",
  data: "oklch(0.82 0.13 70)", external: "oklch(0.70 0.03 250)",
};
export function roleOfPath(p: string): string {
  const s = String(p).toLowerCase();
  if (/(^|\/)(components?|ui|views?|pages?|screens?)(\/|$)/.test(s) || /\.(jsx|tsx|vue|svelte)$/.test(s)) return "ui";
  if (/(^|\/)(stores?|state|redux|context|reducers?|atoms?)(\/|$)/.test(s)) return "state";
  if (/(^|\/)(models?|schemas?|entities|entity|db|data)(\/|$)/.test(s)) return "data";
  if (/(^|\/)(utils?|helpers?|lib|libs|services?|api|apis|middlewares?|hooks?)(\/|$)/.test(s)) return "logic";
  return "logic";
}
export function atlasToDiagram(atlas: AtlasResponse, focusPath?: string | null) {
  if (focusPath) {
    const syms = atlas.nodes.filter((n: any) => n.path === focusPath && n.type !== "file").slice(0, 40);
    const ids = new Set(syms.map((s: any) => s.id));
    const nodes = syms.map((s: any) => ({ id: s.id, label: s.name ?? baseName(s.id), role: "logic", file: focusPath }));
    const edges = atlas.edges.filter((e: any) => /call|use|dispatch/.test(e.type) && ids.has(e.from_node) && ids.has(e.to_node))
      .map((e: any) => ({ from: e.from_node, to: e.to_node, label: e.type }));
    return { title: baseName(focusPath), nodes, edges };
  }
  let files = atlas.nodes.filter((n: any) => n.type === "file");
  const fan = new Map<string, number>();
  for (const e of atlas.edges) { if (e.type !== "imports") continue; fan.set(e.to_node, (fan.get(e.to_node) ?? 0) + 1); fan.set(e.from_node, (fan.get(e.from_node) ?? 0) + 1); }
  // EVERY file is a node — the folder-zone layout organizes them, pan/zoom navigates. The fan sort only
  // sets draw order (and, past a high perf ceiling for pathological repos, which nodes survive); the
  // diagram is the WHOLE deterministic AST graph, not a top-N summary.
  files = [...files].sort((a: any, b: any) => (fan.get(b.path) ?? 0) - (fan.get(a.path) ?? 0)).slice(0, 1500);
  const ids = new Set(files.map((f: any) => f.id));
  const nodes = files.map((f: any) => ({ id: f.id, label: baseName(f.path), role: roleOfPath(f.path), file: f.path }));
  const seen = new Set<string>(); const edges: any[] = [];
  for (const e of atlas.edges) {
    if (e.type !== "imports" || !ids.has(e.from_node) || !ids.has(e.to_node) || e.from_node === e.to_node) continue;
    const k = e.from_node + "|" + e.to_node; if (seen.has(k)) continue; seen.add(k);
    edges.push({ from: e.from_node, to: e.to_node, label: "" });
  }
  return { title: "codebase", nodes, edges };
}
// Navigate the folder STRUCTURE as a diagram: at `dir` ("" = repo root), each immediate child — a
// SUBFOLDER (aggregated, sized by its file count) or a FILE sitting directly in `dir` — is a node; edges
// are the real imports between those children (a file's import is attributed to whichever child contains
// it). Deterministic, straight from the AST graph. Drilling a folder node re-runs this one level deeper.
function childUnder(rawPath: string, dir: string): { kind: "file" | "dir"; name: string; path: string } | null {
  const p = String(rawPath).replace(/\\/g, "/");
  const d = dir ? dir.replace(/\\/g, "/").replace(/\/+$/, "") : "";
  if (d && p !== d && !p.startsWith(d + "/")) return null;
  const rest = d ? p.slice(d.length + 1) : p;
  if (!rest) return null;
  const slash = rest.indexOf("/");
  if (slash < 0) return { kind: "file", name: rest, path: p };
  const name = rest.slice(0, slash);
  return { kind: "dir", name, path: (d ? d + "/" : "") + name };
}
export function atlasToFolderDiagram(atlas: AtlasResponse, dir: string) {
  const files = atlas.nodes.filter((n: any) => n.type === "file");
  const children = new Map<string, any>();        // childPath → {kind,name,path,count}
  const fileToChild = new Map<string, string>();  // file path (posix) → its child-under-dir
  for (const f of files) {
    const c = childUnder(f.path, dir);
    if (!c) continue;
    fileToChild.set(String(f.path).replace(/\\/g, "/"), c.path);
    const ex = children.get(c.path) ?? { ...c, count: 0 };
    ex.count += 1; children.set(c.path, ex);
  }
  // a FILE node keeps its real id (= its path) so id-based handlers (onPick → open the read-only editor)
  // resolve it; only a folder node gets a synthetic "dir:" id (it drills — it isn't a real atlas node).
  const idOf = (cp: string) => (children.get(cp)?.kind === "dir" ? "dir:" + cp : cp);
  const nodes: any[] = [...children.values()]
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1))
    .map((c) => ({
      id: idOf(c.path),
      label: c.kind === "dir" ? `${c.name}/ ${c.count}` : c.name,
      role: roleOfPath(c.path),
      file: c.kind === "file" ? c.path : null,
      dir: c.kind === "dir" ? c.path : null,
    }));
  // cross-folder connections (same as the graph): an import leaving the folder draws an edge to a dashed
  // "↗ folder" ghost; clicking it follows there. Capped so it never clutters.
  const norm = (s: string) => String(s).replace(/\\/g, "/");
  const extDir = (p: string) => { const i = p.lastIndexOf("/"); return i > 0 ? p.slice(0, i) : p; };
  const ghosts = new Map<string, number>(); const ghostEdges: { from: string; to: string }[] = [];
  const seen = new Set<string>(); const edges: any[] = [];
  for (const e of atlas.edges) {
    if (e.type !== "imports") continue;
    const fp = norm(e.from_node), tp = norm(e.to_node);
    const fc = fileToChild.get(fp), tc = fileToChild.get(tp);
    if (fc && tc) { if (fc === tc) continue; const k = idOf(fc) + "|" + idOf(tc); if (!seen.has(k)) { seen.add(k); edges.push({ from: idOf(fc), to: idOf(tc), label: "" }); } }
    else if (fc && !tc) { const gf = extDir(tp); ghosts.set(gf, (ghosts.get(gf) ?? 0) + 1); ghostEdges.push({ from: idOf(fc), to: "ext:" + gf }); }
    else if (!fc && tc) { const gf = extDir(fp); ghosts.set(gf, (ghosts.get(gf) ?? 0) + 1); ghostEdges.push({ from: "ext:" + gf, to: idOf(tc) }); }
  }
  const keepG = new Set([...ghosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g]) => "ext:" + g));
  for (const [gf] of ghosts) if (keepG.has("ext:" + gf)) nodes.push({ id: "ext:" + gf, label: "↗ " + (gf.split("/").pop() || gf), role: roleOfPath(gf), file: null, dir: gf, isExternal: true });
  const dgE = new Set<string>();
  for (const ge of ghostEdges) { if (!keepG.has(ge.from) && !keepG.has(ge.to)) continue; const k = ge.from + "|" + ge.to; if (dgE.has(k)) continue; dgE.add(k); edges.push({ from: ge.from, to: ge.to, label: "" }); }
  return { title: dir || "codebase", nodes, edges, dir };
}
// MULTI-FOLDER for the diagram (marquee select): every file within the selected folders (down to maxLevels)
// becomes a diagram node, laid out WITH folder-zone grouping (layoutDiagram folders=true), like the original.
export function multiFolderDiagram(atlas: AtlasResponse, selectedDirs: Set<string>, maxLevels = 3) {
  const dirs = [...selectedDirs].map((d) => String(d).replace(/\\/g, "/").replace(/\/+$/, ""));
  const within = (raw: string) => {
    const p = String(raw).replace(/\\/g, "/");
    for (const d of dirs) { if (p === d) return true; if (p.startsWith(d + "/") && p.slice(d.length + 1).split("/").length - 1 <= maxLevels) return true; }
    return false;
  };
  const fileNodes = (atlas.nodes as any[]).filter((n) => n.type === "file" && within(n.path));
  const keep = new Set(fileNodes.map((n) => String(n.path).replace(/\\/g, "/")));
  const nodes = fileNodes.map((f) => ({ id: f.path, label: baseName(f.path), role: roleOfPath(f.path), file: f.path, dir: null }));
  const seen = new Set<string>(); const edges: any[] = [];
  for (const e of atlas.edges as any[]) {
    if (e.type !== "imports") continue;
    const f = String(e.from_node).replace(/\\/g, "/"), t = String(e.to_node).replace(/\\/g, "/");
    if (!keep.has(f) || !keep.has(t) || f === t) continue;
    const k = f + "|" + t; if (seen.has(k)) continue; seen.add(k);
    edges.push({ from: e.from_node, to: e.to_node, label: "" });
  }
  return { title: "selection", nodes, edges };
}
// breadcrumb segments for a folder path: codebase / a / a/b …
function dirCrumbs(dir: string): { label: string; path: string }[] {
  const out = [{ label: "codebase", path: "" }];
  if (!dir) return out;
  let acc = "";
  for (const s of dir.replace(/\\/g, "/").split("/").filter(Boolean)) { acc = acc ? acc + "/" + s : s; out.push({ label: s, path: acc }); }
  return out;
}
// Folder-scoped GRAPH data: the CHILDREN of `dir` (subfolders aggregated + files directly in dir) as
// pseudo file-nodes buildGraph consumes as-is, intra-scope imports as edges, and per-node counts of imports
// that LEAVE the scope (extOut) or enter it (extIn) — so a connection crossing the folder boundary stays
// visible (rendered as a small ↗/↙ badge) instead of dragging in the whole codebase.
export function folderScopedAtlas(atlas: AtlasResponse, dir: string) {
  const childOf = new Map<string, string>();   // file path (posix) → its child-under-dir path
  const children = new Map<string, any>();      // childPath → {kind,name,path,count}
  for (const n of atlas.nodes as any[]) {
    if (n.type !== "file") continue;
    const c = childUnder(n.path, dir);
    if (!c) continue;
    childOf.set(String(n.path).replace(/\\/g, "/"), c.path);
    const e = children.get(c.path) ?? { ...c, count: 0 };
    e.count += 1; children.set(c.path, e);
  }
  // a FILE node keeps its real id (= its path) so id-based handlers (onPick → open the read-only editor)
  // resolve it; only a folder node gets a synthetic "dir:" id (it drills — it isn't a real atlas node).
  const idOf = (cp: string) => (children.get(cp)?.kind === "dir" ? "dir:" + cp : cp);
  // cross-folder connections: an import to/from a file OUTSIDE the current folder becomes a real edge to a
  // GHOST node for that external folder — so the connection LEAVING the scope stays visible, and clicking
  // the ghost FOLLOWS it (navigates there). Capped to the most-connected externals so it never clutters.
  const norm = (s: string) => String(s).replace(/\\/g, "/");
  const extDir = (p: string) => { const i = p.lastIndexOf("/"); return i > 0 ? p.slice(0, i) : p; };
  const ghosts = new Map<string, { id: string; path: string; count: number }>();
  const ghostEdges: { from: string; to: string }[] = [];
  const seen = new Set<string>(); const edges: any[] = [];
  for (const e of atlas.edges as any[]) {
    if (e.type !== "imports") continue;
    const fp = norm(e.from_node), tp = norm(e.to_node);
    const fc = childOf.get(fp), tc = childOf.get(tp);
    if (fc && tc) { if (fc === tc) continue; const k = idOf(fc) + ">" + idOf(tc); if (!seen.has(k)) { seen.add(k); edges.push({ from_node: idOf(fc), to_node: idOf(tc), type: "imports" }); } }
    else if (fc && !tc) { const gf = extDir(tp); if (!ghosts.has(gf)) ghosts.set(gf, { id: "ext:" + gf, path: gf, count: 0 }); ghosts.get(gf)!.count++; ghostEdges.push({ from: idOf(fc), to: "ext:" + gf }); }
    else if (!fc && tc) { const gf = extDir(fp); if (!ghosts.has(gf)) ghosts.set(gf, { id: "ext:" + gf, path: gf, count: 0 }); ghosts.get(gf)!.count++; ghostEdges.push({ from: "ext:" + gf, to: idOf(tc) }); }
  }
  const nodes: any[] = [...children.values()].map((c) => ({
    id: idOf(c.path), path: c.path, type: "file", intent: null, isDir: c.kind === "dir", isExternal: false, count: c.count,
  }));
  const keep = new Set([...ghosts.values()].sort((a, b) => b.count - a.count).slice(0, 10).map((g) => g.id));
  for (const g of ghosts.values()) if (keep.has(g.id)) nodes.push({ id: g.id, path: g.path, type: "file", intent: null, isDir: false, isExternal: true, count: g.count });
  const dg = new Set<string>();
  for (const ge of ghostEdges) { if (!keep.has(ge.from) && !keep.has(ge.to)) continue; const k = ge.from + ">" + ge.to; if (dg.has(k)) continue; dg.add(k); edges.push({ from_node: ge.from, to_node: ge.to, type: "imports" }); }
  return { nodes, edges, dir } as any;
}
// MULTI-FOLDER (marquee selection): show several selected folders together — every file WITHIN any selected
// folder, down to `maxLevels` of nesting — as REAL file nodes (real ids → clicks open the editor), with the
// real imports among them. buildGraph + computeZones then render it with the folder ZONE hulls, like the
// original whole-codebase view, but scoped to exactly the folders you boxed.
export function multiFolderAtlas(atlas: AtlasResponse, selectedDirs: Set<string>, maxLevels = 3) {
  const dirs = [...selectedDirs].map((d) => String(d).replace(/\\/g, "/").replace(/\/+$/, ""));
  const within = (raw: string) => {
    const p = String(raw).replace(/\\/g, "/");
    for (const d of dirs) {
      if (p === d) return true;
      if (p.startsWith(d + "/") && p.slice(d.length + 1).split("/").length - 1 <= maxLevels) return true;
    }
    return false;
  };
  const nodes = (atlas.nodes as any[]).filter((n) => n.type === "file" && within(n.path));
  const keep = new Set(nodes.map((n) => String(n.path).replace(/\\/g, "/")));
  const seen = new Set<string>(); const edges: any[] = [];
  for (const e of atlas.edges as any[]) {
    if (e.type !== "imports") continue;
    const f = String(e.from_node).replace(/\\/g, "/"), t = String(e.to_node).replace(/\\/g, "/");
    if (!keep.has(f) || !keep.has(t) || f === t) continue;
    const k = f + ">" + t; if (seen.has(k)) continue; seen.add(k);
    edges.push({ from_node: e.from_node, to_node: e.to_node, type: "imports" });
  }
  return { nodes, edges } as any;
}
const dvDir = (f: any) => { const s = String(f ?? "").replace(/\\/g, "/"); const i = s.lastIndexOf("/"); return i > 0 ? s.slice(0, i) : ""; };
// Import graphs have CYCLES (NestJS modules especially). Longest-path layering inflates a cycle's layers
// unboundedly — BE/src measured 23 nodes spread over 50 layers from ONE circular dep, giving a giant
// horizontal edge. Drop the DFS back-edges so layering runs on a DAG with the real bounded depth
// (BE/src: 50 → 5 layers). Back-edges still RENDER; with bounded layers they're short too. Iterative DFS.
function breakCycles(nodes: any[], edges: any[]): any[] {
  const adj = new Map<string, any[]>(); for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) if (adj.has(e.from)) adj.get(e.from)!.push(e);
  const color = new Map<string, number>(nodes.map((n) => [n.id, 0])); // 0 white · 1 gray (on stack) · 2 black
  const back = new Set<any>();
  for (const start of nodes) {
    if (color.get(start.id) !== 0) continue;
    const stack: { u: string; i: number }[] = [{ u: start.id, i: 0 }]; color.set(start.id, 1);
    while (stack.length) {
      const top = stack[stack.length - 1]; const es = adj.get(top.u) ?? [];
      if (top.i < es.length) { const e = es[top.i++]; const c = color.get(e.to) ?? 0; if (c === 1) back.add(e); else if (c === 0) { color.set(e.to, 1); stack.push({ u: e.to, i: 0 }); } }
      else { color.set(top.u, 2); stack.pop(); }
    }
  }
  return back.size ? edges.filter((e) => !back.has(e)) : edges;
}
export function layoutDiagram(nodes: any[], edges: any[], folders?: boolean) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const dag = breakCycles(nodes, edges); // layer on a DAG — a cycle would otherwise blow the width up
  const layer = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  let changed = true, guard = 0;
  while (changed && guard++ < nodes.length + 2) {
    changed = false;
    for (const e of dag) { if (!byId.has(e.from) || !byId.has(e.to)) continue; const nl = (layer.get(e.from) ?? 0) + 1; if (nl > (layer.get(e.to) ?? 0)) { layer.set(e.to, nl); changed = true; } }
  }
  // Tighten: longest-path puts a node at its EARLIEST layer, so a node used only "late" sits far left with
  // a giant edge for no reason. Pull each node right to just before its earliest consumer — edges span as
  // few columns as possible (the layout stays exactly as wide as it needs to be, not giant).
  let pull = true, pg = 0;
  while (pull && pg++ < nodes.length + 2) {
    pull = false;
    const minConsumer = new Map<string, number>();
    for (const e of dag) { if (!byId.has(e.from) || !byId.has(e.to)) continue; const cl = layer.get(e.to) ?? 0; const cur = minConsumer.get(e.from); if (cur == null || cl < cur) minConsumer.set(e.from, cl); }
    for (const n of nodes) { const mc = minConsumer.get(n.id); if (mc != null && mc - 1 > (layer.get(n.id) ?? 0)) { layer.set(n.id, mc - 1); pull = true; } }
  }
  const layers: Record<number, any[]> = {};
  for (const n of nodes) (layers[layer.get(n.id) ?? 0] ??= []).push(n);
  const maxLayer = Math.max(0, ...Object.keys(layers).map(Number));
  const BOXW = 130, BOXH = 50, GAPX = 64, GAPY = 18, FGAP = 16;
  const pos = new Map<string, any>();
  for (let l = 0; l <= maxLayer; l++) {
    let row = layers[l] ?? [];
    if (folders) row = [...row].sort((a, b) => dvDir(a.file).localeCompare(dvDir(b.file)) || String(a.label).localeCompare(String(b.label)));
    let y = 0, prev: string | null = null;
    row.forEach((n) => { const dd = dvDir(n.file); if (folders && prev != null && dd !== prev) y += FGAP; prev = dd; pos.set(n.id, { x: l * (BOXW + GAPX), y, w: BOXW, h: BOXH }); y += BOXH + GAPY; });
  }
  const zones: any[] = [];
  if (folders) {
    const g = new Map<string, any>();
    for (const n of nodes) { const p = pos.get(n.id); const dd = dvDir(n.file); if (!p || !dd) continue; const z = g.get(dd) ?? { minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9 }; z.minX = Math.min(z.minX, p.x); z.minY = Math.min(z.minY, p.y); z.maxX = Math.max(z.maxX, p.x + p.w); z.maxY = Math.max(z.maxY, p.y + p.h); g.set(dd, z); }
    for (const [dd, z] of g) zones.push({ dir: dd, label: dd.split("/").pop() || dd, x: z.minX - 8, y: z.minY - 20, w: z.maxX - z.minX + 16, h: z.maxY - z.minY + 28, hue: hashHue(dd) });
  }
  const allY = [...pos.values()].map((p) => p.y + p.h);
  return { pos, zones, W: Math.max(BOXW, (maxLayer + 1) * (BOXW + GAPX) - GAPX) + 8, H: Math.max(BOXH, ...allY) + 8 };
}
export function DiagramView({ atlas, height = 320, focusPath, onPick, onOpenFile, onRevealLine, initialDir }: { atlas: AtlasResponse; height?: number; focusPath?: string | null; onPick?: (id: string) => void; onOpenFile?: (path: string) => void; onRevealLine?: (path: string, line: number) => void; initialDir?: string }) {
  // tri-state: undefined = follow the tree selection (focusPath) · null = forced whole-codebase (back clicked) · string = drilled into a file
  const [drill, setDrill] = React.useState<string | null | undefined>(undefined);
  const [dirNav, setDirNav] = React.useState(initialDir ?? ""); // current folder when navigating the structure ("" = root)
  const [selectedDirs, setSelectedDirs] = React.useState<Set<string>>(new Set()); // marquee-selected folders → multi-folder view
  const [marquee, setMarquee] = React.useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [ast, setAst] = React.useState<{ forPath: string; diagram: any } | null>(null);
  const [full, setFull] = React.useState(false);
  React.useEffect(() => { setDrill(undefined); }, [focusPath]); // a new tree selection takes over the override
  const focus = drill !== undefined ? drill : (focusPath ?? null);
  // Fetch the AST internal diagram for the focused file (deterministic blocks + logic — richer than the
  // atlas's sparse symbols). Falls back to the atlas-derived view while loading or if the route's absent.
  React.useEffect(() => {
    let alive = true;
    if (!focus) { setAst(null); return; }
    setAst(null);
    void fileDiagram({ path: focus }).then((r) => { if (alive && r?.ok && r.diagram) setAst({ forPath: focus, diagram: r.diagram }); });
    return () => { alive = false; };
  }, [focus]);
  // virtual decorators for the focused file — clicking a block node pops its doc-card here.
  const [decs, setDecs] = React.useState<any[]>([]);
  const [pickedDec, setPickedDec] = React.useState<any>(null);
  React.useEffect(() => {
    setPickedDec(null);
    if (!focus) { setDecs([]); return; }
    let alive = true;
    void decorateFile({ path: focus }).then((r) => { if (alive) setDecs(r?.ok ? (r.decorators ?? []) : []); });
    return () => { alive = false; };
  }, [focus]);
  const spec: any = React.useMemo(() => {
    if (focus) return (ast?.forPath === focus ? ast.diagram : null) ?? atlasToDiagram(atlas, focus);
    if (selectedDirs.size) return multiFolderDiagram(atlas, selectedDirs, 3); // marquee-selected folders together
    return atlasToFolderDiagram(atlas, dirNav); // navigate the folder structure as a diagram
  }, [atlas, focus, ast, dirNav, selectedDirs]);
  // folder-zone hulls only in the multi-folder view (group the selected folders' files).
  const lay = React.useMemo(() => layoutDiagram(spec.nodes ?? [], spec.edges ?? [], selectedDirs.size > 0), [spec, selectedDirs]);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [view, setView] = React.useState({ scale: 1, tx: 0, ty: 0 });
  const drag = React.useRef<any>(null);
  React.useEffect(() => { setView({ scale: 1, tx: 0, ty: 0 }); }, [focus, full, dirNav, selectedDirs]);
  React.useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); setView((v) => ({ ...v, scale: clamp(v.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.3, 6) })); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [full]);
  // screen px → layout coords (the same space as lay.pos), for marquee hit-testing.
  const s2g = (cx: number, cy: number) => { const r = wrapRef.current!.getBoundingClientRect(); return { x: (cx - r.left - view.tx - 18) / view.scale, y: (cy - r.top - view.ty - 18) / view.scale }; };
  const onDown = (e: React.MouseEvent) => {
    if (e.shiftKey && !focus) { const p = s2g(e.clientX, e.clientY); setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); drag.current = null; return; } // SHIFT-drag → marquee-select folders
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
  };
  const onMove = (e: React.MouseEvent) => {
    if (marquee) { const p = s2g(e.clientX, e.clientY); setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : null)); return; }
    const d = drag.current; if (!d) return; if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true; setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) }));
  };
  const onUp = () => {
    if (marquee) {
      const m = marquee, lx = Math.min(m.x0, m.x1), hx = Math.max(m.x0, m.x1), ly = Math.min(m.y0, m.y1), hy = Math.max(m.y0, m.y1);
      const picked = new Set<string>();
      for (const n of spec.nodes ?? []) { if (n.dir == null) continue; const p = lay.pos.get(n.id); if (!p) continue; const cx = p.x + p.w / 2, cy = p.y + p.h / 2; if (cx >= lx && cx <= hx && cy >= ly && cy <= hy) picked.add(n.dir); }
      if (picked.size) setSelectedDirs(picked);
      setMarquee(null); return;
    }
    drag.current = null;
  };
  const clickNode = (n: any) => {
    if (drag.current?.moved) return;
    if (!focus && n.dir != null) { setDirNav(n.dir); return; }                 // folder level: drill INTO the subfolder
    if (!focus && n.file) { setDrill(n.file); onOpenFile?.(n.file); return; }  // a file: drill into its internals + open it
    if (focus && n.line != null) { onRevealLine?.(focus, n.line); setPickedDec(decs.find((x: any) => x.line === n.line) ?? null); return; } // file level: blink line + doc-card
    if (n.file && onPick) onPick(n.id);
  };
  const { pos, zones } = lay; const pad = 18;
  const svgH = full ? Math.max(360, (typeof window !== "undefined" ? window.innerHeight : 700) - 90) : height - 28;
  const body = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: C.panel2 }}>
        {focus ? (
          <>
            <button onClick={() => setDrill(null)} title="back to the folder view" style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 11 }}>← back</button>
            <span style={{ flex: 1, fontFamily: mono, fontSize: 10, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{baseName(focus)} · blocks + logic</span>
          </>
        ) : selectedDirs.size > 0 ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontFamily: mono, fontSize: 10, color: C.brand }}>▦ {selectedDirs.size} folder{selectedDirs.size === 1 ? "" : "s"} · ≤3 levels</span>
            <button onClick={() => setSelectedDirs(new Set())} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 8px", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>✕ clear</button>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap", minWidth: 0 }}>
            {dirCrumbs(dirNav).map((c, i, arr) => (
              <React.Fragment key={c.path}>
                {i > 0 && <span style={{ color: C.muted, fontFamily: mono, fontSize: 10 }}>/</span>}
                <button onClick={() => setDirNav(c.path)} disabled={i === arr.length - 1}
                  style={{ background: "transparent", border: "none", padding: 0, cursor: i === arr.length - 1 ? "default" : "pointer", color: i === arr.length - 1 ? C.fg : C.brand, fontFamily: mono, fontSize: 10 }}>{c.label}</button>
              </React.Fragment>
            ))}
            <span style={{ color: C.muted, fontFamily: mono, fontSize: 9, marginLeft: 4 }}>· shift-drag to box-select folders</span>
          </div>
        )}
        <button onClick={() => { setView({ scale: 1, tx: 0, ty: 0 }); setDirNav(initialDir ?? ""); setDrill(undefined); setSelectedDirs(new Set()); }} title="reset — re-center + back to this folder/file" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 12 }}>⟳</button>
        <button onClick={() => setFull((f) => !f)} title={full ? "collapse" : "expand to fullscreen"} style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 12 }}>{full ? "✕" : "⛶"}</button>
      </div>
      {!spec.nodes?.length ? (
        <div style={{ flex: 1, display: "grid", placeItems: "center", color: C.muted, fontFamily: mono, fontSize: 11 }}>{focus ? "no blocks to diagram in this file (or not JS/ESM)" : "nothing to diagram here"}</div>
      ) : (
        <div ref={wrapRef} style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative", cursor: drag.current ? "grabbing" : "grab", background: C.bg }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} title="scroll to zoom · drag to pan · click a folder to drill in · a file → its internals">
          <svg width="100%" height={svgH} style={{ display: "block" }}>
            <defs><marker id="dv-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill={C.dim} /></marker></defs>
            <g transform={`translate(${view.tx + pad},${view.ty + pad}) scale(${view.scale})`}>
              {marquee && (
                <rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)}
                  width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)}
                  fill={C.brand} fillOpacity={0.1} stroke={C.brand} strokeWidth={1 / view.scale} strokeDasharray={`${4 / view.scale} ${3 / view.scale}`} style={{ pointerEvents: "none" }} />
              )}
              {(zones ?? []).map((z: any) => (
                <g key={"dvz" + z.dir} style={{ pointerEvents: "none" }}>
                  <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={10} fill={`oklch(0.6 0.12 ${z.hue})`} fillOpacity={0.05} stroke={`oklch(0.62 0.12 ${z.hue})`} strokeOpacity={0.28} strokeWidth={1} strokeDasharray="3 3" />
                  <text x={z.x + 8} y={z.y + 13} fontFamily={mono} fontSize={9.5} fill={`oklch(0.74 0.1 ${z.hue})`} opacity={0.75}>{z.label}/</text>
                </g>
              ))}
              {spec.edges.map((e: any, i: number) => {
                const a = pos.get(e.from), b = pos.get(e.to); if (!a || !b) return null;
                const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
                // A "shortcut" edge (a node importing both a near neighbor and a far descendant) spans many
                // columns at the same height → it draws as one stark horizontal line across the whole diagram.
                // Bow those into a clean ARC over the nodes; short / diagonal edges keep the gentle S-curve.
                const dx = x2 - x1, span = dx / 194;
                const arc = span > 1.6 && Math.abs(y2 - y1) < 30;
                const cy = Math.max(-14, Math.min(y1, y2) - Math.min(70, 16 + span * 9)); // bow up, but never above the top row (no clipping)
                const d = arc
                  ? `M${x1},${y1} C${x1 + dx * 0.25},${cy} ${x2 - dx * 0.25},${cy} ${x2 - 3},${y2}`
                  : `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 3},${y2}`;
                return <g key={i}>
                  <path d={d} fill="none" stroke={C.dim} strokeWidth={1.2} opacity={arc ? 0.4 : 0.6} markerEnd="url(#dv-arrow)" />
                  {e.label && <text x={mx} y={(arc ? cy : (y1 + y2) / 2) - 3} textAnchor="middle" fontFamily={mono} fontSize={8} fill={C.muted} paintOrder="stroke" stroke={C.bg} strokeWidth={3} strokeLinejoin="round">{String(e.label).slice(0, 16)}</text>}
                </g>;
              })}
              {spec.nodes.map((n: any) => {
                const p = pos.get(n.id); if (!p) return null; const col = DIAG_ROLE[n.role] ?? DIAG_ROLE.logic;
                const clickable = (!focus && (n.dir != null || n.file)) || (n.file && onPick);
                return <g key={n.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: clickable ? "pointer" : "default" }}
                  onClick={(ev) => { ev.stopPropagation(); clickNode(n); }}>
                  <rect width={p.w} height={p.h} rx={9} fill={n.isExternal ? "transparent" : `color-mix(in oklab, ${col} 14%, ${C.panel})`} stroke={n.isExternal ? C.muted : col} strokeWidth={1.5} strokeDasharray={n.isExternal ? "3 3" : undefined} />
                  <text x={p.w / 2} y={n.isExternal ? p.h / 2 + 3 : p.h / 2 - 1} textAnchor="middle" fontFamily={mono} fontSize={10.5} fontWeight={600} fill={n.isExternal ? C.muted : C.fg}>{String(n.label).slice(0, 18)}</text>
                  {!n.isExternal && <text x={p.w / 2} y={p.h / 2 + 12} textAnchor="middle" fontFamily={mono} fontSize={7.5} fill={col} opacity={0.85}>{n.role}</text>}
                </g>;
              })}
            </g>
          </svg>
        </div>
      )}
      {pickedDec && (
        <div style={{ position: "absolute", top: 36, right: 10, width: 300, maxHeight: "72%", overflow: "auto", zIndex: 8, borderRadius: 5, boxShadow: "0 4px 16px oklch(0 0 0 / 0.5)" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", background: C.panel2, borderTopLeftRadius: 5, borderTopRightRadius: 5 }}>
            <button onClick={() => setPickedDec(null)} title="close" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: "2px 7px" }}>✕</button>
          </div>
          <React.Suspense fallback={<div style={{ background: C.panel, color: C.muted, fontFamily: mono, fontSize: 10, padding: 10 }}>loading…</div>}>
            <DecoratorCard d={pickedDec} path={focus ?? ""} />
          </React.Suspense>
        </div>
      )}
    </>
  );
  if (full) return <div style={{ position: "fixed", inset: 0, zIndex: 60, background: C.bg, display: "flex", flexDirection: "column" }}>{body}</div>;
  return <div style={{ height, display: "flex", flexDirection: "column", background: C.bg, position: "relative" }}>{body}</div>;
}

// the file overlay: defs (name + signature = I/O) + outbound/inbound bindings, from atlas data.
export function fileDetail(atlas: AtlasResponse, path: string) {
  const defs = atlas.nodes.filter((n) => n.path === path && n.type !== "file");
  const fileNode = atlas.nodes.find((n) => n.path === path && n.type === "file") ?? null;
  const idToPath = new Map(atlas.nodes.map((n) => [n.id, n.path]));
  const out = new Set<string>(), inn = new Set<string>();
  for (const e of atlas.edges) {
    if (e.type !== "imports") continue;
    const fp = idToPath.get(e.from_node), tp = idToPath.get(e.to_node);
    if (fp === path && tp && tp !== path) out.add(tp);
    if (tp === path && fp && fp !== path) inn.add(fp);
  }
  return { fileNode, defs, imports: [...out], importers: [...inn] };
}

export function AtlasGraphOverlay({ atlas, onClose, initialDir }: { atlas: AtlasResponse; onClose: () => void; initialDir?: string }) {
  const [dirNav, setDirNav] = React.useState(initialDir ?? "");
  const [selectedDirs, setSelectedDirs] = React.useState<Set<string>>(new Set());
  const [marquee, setMarquee] = React.useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // VIEW MODES: folders marquee-selected (shift-drag) → those folders' files TOGETHER with zone hulls
  // (multi-folder). Else → one folder's children, drill in (folderNav). Folder zones are off only in the
  // single-folder drill view. (Data-story flow moved to its own panel — the graph is purely structural now.)
  const folderNav = selectedDirs.size === 0;
  const g = React.useMemo(
    () => buildGraph(selectedDirs.size ? multiFolderAtlas(atlas, selectedDirs, 3) : folderScopedAtlas(atlas, dirNav)),
    [atlas, selectedDirs, dirNav],
  );
  const nodesRef = React.useRef(g.nodes);
  nodesRef.current = g.nodes;
  const [, setFrame] = React.useState(0);
  const [view, setView] = React.useState({ scale: 1, tx: 0, ty: 0 });
  const [sel, setSel] = React.useState<number | null>(null);
  const [hover, setHover] = React.useState<number | null>(null);
  const [batch, setBatch] = React.useState<{ running: boolean; done: number; total: number } | null>(null);

  // entry-point badges: which file paths carry an external-surface entry (route/db/ui), + the count.
  const [epByPath, setEpByPath] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    let alive = true;
    void entryPointsGet({}).then((r) => {
      if (!alive || !r) return;
      const m: Record<string, number> = {};
      for (const [p, items] of Object.entries(r.by_path)) m[p] = (items as any[]).length;
      setEpByPath(m);
    });
    return () => { alive = false; };
  }, [atlas.node_count]);

  // "snapshot all": loop the bounded batch until every file has a fresh snapshot (or a batch makes
  // no progress — so a persistent provider failure can't spin forever). Each batch is a paid AI pass.
  async function snapshotAllLoop() {
    setBatch({ running: true, done: 0, total: 0 });
    for (let guard = 0; guard < 500; guard++) {
      const r = await snapshotAll({ limit: 6 });
      if (!r) break;
      setBatch({ running: true, done: r.with_snapshot, total: r.total });
      if (r.remaining <= 0 || r.generated === 0) break;
    }
    setBatch((b) => (b ? { ...b, running: false } : null));
  }

  // (data-story flow lives in its own panel now — see data-stories-panel.tsx)
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const alphaRef = React.useRef(1);
  const runningRef = React.useRef(false);
  const rafRef = React.useRef(0);

  const startLoop = React.useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    const loop = () => {
      tick(nodesRef.current, g.links);
      setFrame((f) => (f + 1) % 1e9);
      alphaRef.current *= 0.965;
      if (alphaRef.current > 0.03) rafRef.current = requestAnimationFrame(loop);
      else runningRef.current = false;
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [g.links]);
  const kick = React.useCallback((a = 0.4) => { alphaRef.current = Math.max(alphaRef.current, a); startLoop(); }, [startLoop]);

  // center the viewport + run the initial settle when the graph (re)builds.
  React.useEffect(() => {
    const el = wrapRef.current;
    const w = el?.clientWidth ?? 900, h = el?.clientHeight ?? 600;
    setView({ scale: 1, tx: w / 2, ty: h / 2 });
    alphaRef.current = 1; startLoop();
    return () => { runningRef.current = false; cancelAnimationFrame(rafRef.current); };
  }, [g, startLoop]);

  // esc to close
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const screenToGraph = (clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - view.tx) / view.scale, y: (clientY - rect.top - view.ty) / view.scale };
  };

  // Zoom the CANVAS only. React's onWheel is a PASSIVE listener, so e.preventDefault() there is
  // ignored and the browser zooms/scrolls the whole page. Attach a native NON-passive wheel
  // listener so preventDefault sticks and only the graph scales (zoom toward the cursor).
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setView((v) => {
        const ns = clamp(v.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.15, 4.5);
        const gx = (mx - v.tx) / v.scale, gy = (my - v.ty) / v.scale;
        return { scale: ns, tx: mx - gx * ns, ty: my - gy * ns };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // drag: background → pan; node → move that node (and select if it didn't really move).
  const dragRef = React.useRef<any>(null);
  const onDown = (e: React.MouseEvent, nodeIdx: number | null) => {
    e.preventDefault();
    // SHIFT-drag on empty canvas → marquee-select folders into the multi-folder view (plain drag = pan).
    if (nodeIdx == null && e.shiftKey) {
      const s = screenToGraph(e.clientX, e.clientY);
      setMarquee({ x0: s.x, y0: s.y, x1: s.x, y1: s.y });
      const mMove = (ev: MouseEvent) => { const p = screenToGraph(ev.clientX, ev.clientY); setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : null)); };
      const mUp = () => {
        window.removeEventListener("mousemove", mMove);
        window.removeEventListener("mouseup", mUp);
        setMarquee((m) => {
          if (m) {
            const lx = Math.min(m.x0, m.x1), hx = Math.max(m.x0, m.x1), ly = Math.min(m.y0, m.y1), hy = Math.max(m.y0, m.y1);
            const picked = new Set<string>();
            for (const n of nodesRef.current) if (n.isDir && n.x >= lx && n.x <= hx && n.y >= ly && n.y <= hy) picked.add(n.path);
            if (picked.size) setSelectedDirs(picked);
          }
          return null;
        });
      };
      window.addEventListener("mousemove", mMove);
      window.addEventListener("mouseup", mUp);
      return;
    }
    dragRef.current = { nodeIdx, sx: e.clientX, sy: e.clientY, tx0: view.tx, ty0: view.ty, moved: 0, view };
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      d.moved += Math.abs(ev.clientX - d.sx) + Math.abs(ev.clientY - d.sy);
      if (d.nodeIdx == null) {
        setView({ scale: d.view.scale, tx: d.tx0 + (ev.clientX - d.sx), ty: d.ty0 + (ev.clientY - d.sy) });
      } else {
        const gp = screenToGraph(ev.clientX, ev.clientY);
        const n = nodesRef.current[d.nodeIdx]; n.x = gp.x; n.y = gp.y; n.vx = 0; n.vy = 0;
        kick(0.25); setFrame((f) => f + 1);
      }
    };
    const onUp = (ev: MouseEvent) => {
      const d = dragRef.current; dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (d && d.nodeIdx != null && d.moved < 4) { const node = nodesRef.current[d.nodeIdx]; if (node?.isDir || node?.isExternal) setDirNav(node.path); else setSel(d.nodeIdx); } // click: a folder / external ref navigates, a file opens
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const nodes = nodesRef.current;
  // folder zones with ZOOM-DRIVEN level-of-detail: zoomed out → only the top-level folder hulls
  // (everything grouped as one); zoom in → deeper sub-folder hulls nest inside, revealing the
  // organization level by level. A zone is the hull of every file UNDER a folder prefix (≥3 nodes).
  const maxDepth = view.scale < 0.65 ? 1 : view.scale < 1.3 ? 2 : view.scale < 2.4 ? 3 : 4;
  const zones = folderNav ? [] : computeZones(nodes, maxDepth);
  React.useEffect(() => { setSel(null); }, [dirNav, selectedDirs]); // drilling / (de)selecting folders clears a stale node selection
  const focus = sel ?? hover;
  const adjF = focus != null ? g.adj.get(focus) : null;
  const detail = sel != null ? fileDetail(atlas, nodes[sel].path) : null;

  const edgeState = (l: { s: number; t: number }) => {
    if (focus == null) return "idle";
    if (l.t === focus) return "in";   // an importer points AT the focus = inbound flow
    if (l.s === focus) return "out";  // the focus points out = outbound flow
    return "dim";
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: C.bg, display: "flex", flexDirection: "column" }}>
      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" }}>
        <div style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 600 }}>atlas graph</div>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{g.shown} {folderNav ? "items" : "files"} · {g.links.length} bindings{g.capped ? ` (top ${g.shown} of ${g.total})` : ""}</span>
        {folderNav && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
            {dirCrumbs(dirNav).map((c, i, arr) => (
              <React.Fragment key={c.path}>
                {i > 0 && <span style={{ color: C.muted, fontFamily: mono, fontSize: 10 }}>/</span>}
                <button onClick={() => setDirNav(c.path)} disabled={i === arr.length - 1}
                  style={{ background: "transparent", border: "none", padding: 0, cursor: i === arr.length - 1 ? "default" : "pointer", color: i === arr.length - 1 ? C.fg : C.brand, fontFamily: mono, fontSize: 10.5 }}>{c.label}</button>
              </React.Fragment>
            ))}
            <span style={{ color: C.muted, fontFamily: mono, fontSize: 9, marginLeft: 6 }}>· shift-drag to box-select folders</span>
          </div>
        )}
        {selectedDirs.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: mono, fontSize: 10, color: C.brand }}>▦ {selectedDirs.size} folder{selectedDirs.size === 1 ? "" : "s"} · ≤3 levels</span>
            <button onClick={() => setSelectedDirs(new Set())} style={{ ...zbtn, color: C.muted, padding: "1px 8px" }}>✕ clear</button>
          </div>
        )}
        <span style={{ flex: 1 }} />
        <button style={{ ...zbtn, color: batch?.running ? C.warn : C.fg }} onClick={() => void snapshotAllLoop()} disabled={batch?.running}
          title="generate an AI snapshot for every file (paid; loops in bounded batches)">
          {batch?.running ? `snapshotting ${batch.done}/${batch.total}…` : "🧠 snapshot all"}
        </button>
        <button style={zbtn} onClick={() => setView((v) => ({ ...v, scale: clamp(v.scale / 1.2, 0.15, 4.5) }))} title="zoom out">−</button>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, minWidth: 38, textAlign: "center" }}>{Math.round(view.scale * 100)}%</span>
        <button style={zbtn} onClick={() => setView((v) => ({ ...v, scale: clamp(v.scale * 1.2, 0.15, 4.5) }))} title="zoom in">+</button>
        <button style={zbtn} onClick={() => { kick(1); const el = wrapRef.current; setView({ scale: 1, tx: (el?.clientWidth ?? 900) / 2, ty: (el?.clientHeight ?? 600) / 2 }); }} title="re-center + re-layout">⟳</button>
        <button style={{ ...zbtn, color: C.fg }} onClick={onClose} title="close (esc)">✕</button>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* canvas */}
        <div ref={wrapRef} onMouseDown={(e) => onDown(e, null)}
          style={{ flex: 1, position: "relative", overflow: "hidden", cursor: "grab" }}>
          <svg width="100%" height="100%" style={{ display: "block" }}>
            <defs>
              <marker id="ag-in" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill={C.ok} /></marker>
              <marker id="ag-out" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill={C.warn} /></marker>
              <marker id="ag-idle" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill={C.border} /></marker>
            </defs>
            <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
              {marquee && (
                <rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)}
                  width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)}
                  fill={C.brand} fillOpacity={0.1} stroke={C.brand} strokeWidth={1 / view.scale} strokeDasharray={`${4 / view.scale} ${3 / view.scale}`} style={{ pointerEvents: "none" }} />
              )}
              {zones.map((z) => (
                <g key={"z" + z.pre} style={{ pointerEvents: "none" }}>
                  <polygon points={z.hull.map((p: any) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                    fill={`oklch(0.6 0.13 ${z.hue})`} fillOpacity={0.035 + z.depth * 0.012} stroke={`oklch(0.62 0.13 ${z.hue})`} strokeOpacity={0.14 + z.depth * 0.06} strokeWidth={1} strokeLinejoin="round" />
                  <text x={z.labelPt.x} y={z.labelPt.y - 3} fontFamily={mono} fontSize={z.depth === 1 ? 12 : 10.5} fill={`oklch(0.74 0.11 ${z.hue})`} opacity={0.5} textAnchor="middle" fontWeight={z.depth === 1 ? 600 : 400}>{z.label}/</text>
                </g>
              ))}
              {g.links.map((l, i) => {
                const a = nodes[l.s], b = nodes[l.t];
                const st = edgeState(l);
                const stroke = st === "in" ? C.ok : st === "out" ? C.warn : C.border;
                const op = focus == null ? 0.22 : st === "dim" ? 0.05 : 0.85;
                const marker = st === "in" ? "url(#ag-in)" : st === "out" ? "url(#ag-out)" : "url(#ag-idle)";
                // shorten the line to the target dot edge so the arrow sits at the rim
                const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
                const tx = b.x - (dx / d) * (b.r + 2.5), ty = b.y - (dy / d) * (b.r + 2.5);
                return <line key={i} x1={a.x} y1={a.y} x2={tx} y2={ty} stroke={stroke} strokeWidth={st === "dim" || st === "idle" ? 0.6 : 1.4} opacity={op} markerEnd={marker} />;
              })}
              {nodes.map((n, i) => {
                const isFocus = i === focus;
                const related = adjF ? adjF.in.has(i) || adjF.out.has(i) : false;
                const faded = (focus != null && !isFocus && !related);
                return (
                  <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: "pointer" }}
                    onMouseDown={(e) => { e.stopPropagation(); onDown(e, i); }}
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((h) => (h === i ? null : h))}>
                    <circle r={n.r + (isFocus ? 2.5 : 0)} fill={n.isExternal ? "transparent" : n.isDir ? C.brand : n.color} opacity={faded ? 0.2 : 1}
                      stroke={n.isExternal ? C.muted : isFocus ? C.fg : sel != null && related ? (adjF!.in.has(i) ? C.ok : C.warn) : "transparent"} strokeWidth={isFocus ? 2 : 1.5} strokeDasharray={n.isExternal ? "2 2" : undefined} />
                    {epByPath[n.path] > 0 && !faded && (
                      <>
                        <circle r={2.6} cx={n.r * 0.72} cy={-n.r * 0.72} fill={C.brand} stroke={C.bg} strokeWidth={0.7}>
                          <title>{epByPath[n.path]} entry point{epByPath[n.path] === 1 ? "" : "s"} (routes / db / ui)</title>
                        </circle>
                        {(isFocus || view.scale > 1.8) && (
                          <text x={n.r * 0.72 + 3.5} y={-n.r * 0.72 + 2.5} fontFamily={mono} fontSize={7} fill={C.brand} style={{ pointerEvents: "none" }}>{epByPath[n.path]}</text>
                        )}
                      </>
                    )}
                    {(n.isDir || n.isExternal || view.scale > 1.4 || isFocus || related) && !faded && (
                      <text x={n.r + 4} y={3} fontFamily={mono} fontSize={9 / Math.max(0.7, view.scale > 2 ? 1.3 : 1)} fontWeight={n.isDir ? 600 : 400} fill={n.isExternal ? C.muted : n.isDir ? C.fg : C.dim} style={{ pointerEvents: "none" }}>{n.isExternal ? "↗ " + baseName(n.path) : n.isDir ? baseName(n.path) + "/" : baseName(n.path).slice(0, 22)}</text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* legend */}
          <div style={{ position: "absolute", left: 12, bottom: 12, display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 360, background: `color-mix(in oklab, ${C.panel} 88%, transparent)`, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px" }}>
            {legendExts(nodes).map((ext) => (
              <span key={ext} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono, fontSize: 9, color: C.muted }}>
                <span style={{ width: 8, height: 8, borderRadius: 8, background: extColor("x." + ext) }} />.{ext}
              </span>
            ))}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono, fontSize: 9, color: C.muted }}>
              <span style={{ width: 10, height: 2, background: C.ok }} />IN
              <span style={{ width: 10, height: 2, background: C.warn, marginLeft: 6 }} />OUT
            </span>
          </div>
        </div>

        {/* right panel: the clicked file's overlay */}
        {sel != null && detail ? (
          <FilePanel node={nodes[sel]} detail={detail} onClose={() => setSel(null)} />
        ) : null}
      </div>
    </div>
  );
}

const zbtn: React.CSSProperties = { fontFamily: mono, fontSize: 12, padding: "2px 9px", borderRadius: 5, cursor: "pointer", background: "transparent", border: "none", color: C.muted };
const li = (hue: string): React.CSSProperties => ({ fontFamily: mono, fontSize: 10, color: hue, padding: "1px 0", listStyle: "none", borderLeft: `2px solid ${hue}`, paddingLeft: 8, marginBottom: 2 });
function Sect({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{label}</div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 200, overflow: "auto" }}>{children}</ul>
    </div>
  );
}
const Dash = () => <li style={{ fontFamily: mono, fontSize: 10, color: C.muted, listStyle: "none" }}>—</li>;
function legendExts(nodes: { path: string }[]) {
  const c = new Map<string, number>();
  for (const n of nodes) { const e = extOf(n.path); if (e) c.set(e, (c.get(e) ?? 0) + 1); }
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([e]) => e);
}

// ── the file panel: tabs — structure (defs + bindings) · code (preview + expand) · 🧠 snapshot ──
// Reused by the files IDE with hideCode (the editor IS the code there) + no close button.
export function FilePanel({ node, detail, onClose, hideCode, defaultTab, fill }: { node: any; detail: any; onClose?: () => void; hideCode?: boolean; defaultTab?: "info" | "code" | "snap"; fill?: boolean }) {
  const path = node.path;
  const [tab, setTab] = React.useState<"info" | "code" | "snap">(defaultTab ?? "info");
  const [source, setSource] = React.useState<FileSource | null>(null);
  const [srcBusy, setSrcBusy] = React.useState(false);
  const [srcErr, setSrcErr] = React.useState<string | null>(null);
  const [snap, setSnap] = React.useState<SnapshotGet | null>(null);
  const [snapBusy, setSnapBusy] = React.useState(false);
  const [snapErr, setSnapErr] = React.useState<string | null>(null);
  const [codeOpen, setCodeOpen] = React.useState(false);
  const [explains, setExplains] = React.useState<Record<string, { loading?: boolean; text?: string; err?: string }>>({});
  const [eps, setEps] = React.useState<any>(null);
  const [blast, setBlast] = React.useState<any>(null);

  React.useEffect(() => {
    setTab(defaultTab ?? "info"); setSource(null); setSrcErr(null); setSnap(null); setSnapErr(null); setCodeOpen(false); setExplains({}); setEps(null); setBlast(null);
    let cancelled = false;
    fileSnapshotGet({ path }).then((r) => { if (!cancelled) setSnap(r); });
    entryPointsGet({ path }).then((r) => { if (!cancelled) setEps(r); }); // this file's external surface
    const fid = detail?.fileNode?.id;
    if (fid) blastRadius({ node_ids: [fid] }).then((r) => { if (!cancelled) setBlast(r); }); // reverse-dep closure
    return () => { cancelled = true; };
  }, [path]);

  // when the caller flips the split icon (structure ↔ snapshot) on the SAME open file, follow the
  // requested tab without re-running the data effect above (path is unchanged, so it wouldn't fire).
  React.useEffect(() => { if (defaultTab) setTab(defaultTab); }, [defaultTab]);

  async function explainDef(d: any) {
    setExplains((m) => ({ ...m, [d.id]: { loading: true } }));
    const r = await symbolExplain({ node_id: d.id });
    // r.error = the real engine message (e.g. Ollama unreachable / model not pulled). A NULL r means
    // the request was aborted or the BE errored — on a local CPU model that's almost always "too slow"
    // (a 7B can take minutes), NOT a missing key. Don't misattribute it.
    setExplains((m) => ({ ...m, [d.id]: r?.ok && r.explanation ? { text: r.explanation } : { err: r?.error ?? "explain didn't return — a local model can take minutes on CPU. Give it a moment, or use a smaller/faster model (Settings → Local AI)." } }));
  }

  const loadSource = React.useCallback(async () => {
    if (source || srcBusy) return;
    setSrcBusy(true); setSrcErr(null);
    const r = await fileRead({ path });
    setSrcBusy(false);
    if (r) setSource(r); else setSrcErr("could not read this file (off-workspace, binary, or unreadable)");
  }, [path, source, srcBusy]);

  async function analyze() {
    setSnapBusy(true); setSnapErr(null);
    const r = await fileSnapshot({ path });
    setSnapBusy(false);
    if (r?.ok && r.snapshot) setSnap({ path, snapshot: r.snapshot, model_id: r.model_id, stale: false });
    else setSnapErr(r?.error ?? "the analysis is unavailable (provider / key).");
  }

  const tabBtn = (k: "info" | "code" | "snap", label: string) => (
    <button key={k} onClick={() => { setTab(k); if (k === "code") void loadSource(); }}
      style={{ ...zbtn, color: tab === k ? C.fg : C.muted, borderColor: tab === k ? C.brand : C.border, background: tab === k ? `color-mix(in oklab, ${C.brand} 22%, ${C.panel})` : C.panel }}>{label}</button>
  );

  return (
    <div style={{ width: fill ? "100%" : (hideCode ? 250 : 380), height: fill ? "100%" : undefined, flexShrink: 0, borderLeft: fill ? "none" : `1px solid ${C.border}`, background: C.panel, overflow: "auto", padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ width: 9, height: 9, borderRadius: 9, background: node.color, display: "inline-block" }} />
        <code style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 600, wordBreak: "break-all" }}>{node.path}</code>
        <span style={{ flex: 1 }} />
        {onClose && <button style={zbtn} onClick={onClose}>✕</button>}
      </div>
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, margin: "4px 0 8px" }}>{node.fanIn} importers · {node.fanOut} imports · {detail.defs.length} defs</div>

      {/* in a split (fill), the editor-header icons ARE the structure/snapshot navigation — no inner tabs. */}
      {!fill && <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>{tabBtn("info", "structure")}{!hideCode && tabBtn("code", "code")}{tabBtn("snap", "🧠 snapshot")}</div>}

      {tab === "info" && (
        <>
          {detail.fileNode?.intent && <div style={{ color: C.dim, fontSize: 11, marginBottom: 8 }}>{detail.fileNode.intent}</div>}
          {eps && eps.total > 0 && (
            <Sect label={`entry points (${eps.total}) · the external surface`}>
              {eps.items.map((e: any, i: number) => (
                <li key={i} style={{ padding: "1px 0", listStyle: "none", display: "flex", gap: 6, alignItems: "baseline" }} title={`${e.subtype}${e.detail ? " · " + e.detail : ""} (${Math.round(e.confidence * 100)}%)`}>
                  <span style={{ fontFamily: mono, fontSize: 8, textTransform: "uppercase", minWidth: 32, color: e.kind === "route" ? C.brand : e.kind === "ui" ? C.ok : C.warn }}>{e.http_method ?? e.kind}</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{e.label}</span>
                  <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>:{e.line}</span>
                </li>
              ))}
            </Sect>
          )}
          <Sect label="defs · name + signature (I/O) · explain">
            {detail.defs.length === 0 ? <Dash /> : detail.defs.map((d: any) => {
              const ex = explains[d.id];
              return (
                <li key={d.id} style={{ padding: "2px 0", listStyle: "none" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                    <span style={{ fontFamily: mono, fontSize: 8, color: C.muted, textTransform: "uppercase", minWidth: 46 }}>{d.type}</span>
                    <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{d.name ?? baseName(d.id)}</span>
                    {d.signature && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>{d.signature}</span>}
                    <span style={{ flex: 1 }} />
                    <button style={{ ...zbtn, padding: "0 5px", fontSize: 8.5 }} onClick={() => void explainDef(d)} disabled={ex?.loading}>{ex?.loading ? "…" : ex?.text ? "↻" : "explain"}</button>
                  </div>
                  {ex?.text && <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.35, margin: "2px 0 4px 52px", borderLeft: `2px solid ${C.brand}`, paddingLeft: 8 }}>{ex.text}</div>}
                  {ex?.err && <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, margin: "2px 0 4px 52px" }}>{ex.err}</div>}
                </li>
              );
            })}
          </Sect>
          <Sect label={`OUT bindings · imports (${detail.imports.length})`}>
            {detail.imports.length === 0 ? <Dash /> : detail.imports.map((p: string) => <li key={p} style={li(C.warn)}>{baseName(p)}</li>)}
          </Sect>
          <Sect label={`IN bindings · importers (${detail.importers.length})`}>
            {detail.importers.length === 0 ? <Dash /> : detail.importers.map((p: string) => <li key={p} style={li(C.ok)}>{baseName(p)}</li>)}
          </Sect>
          <Sect label={`blast radius · changing this breaks ${blast?.count ?? 0}${blast?.affected_tests?.length ? ` · ${blast.affected_tests.length} tests` : ""}`}>
            {!blast ? <Dash /> : blast.count === 0
              ? <li style={{ listStyle: "none", fontFamily: mono, fontSize: 10, color: C.ok, padding: "2px 0" }}>nothing depends on it — safe to change.</li>
              : blast.affected.slice(0, 40).map((id: string) => <li key={id} style={li(C.warn)}>{baseName(id)}</li>)}
          </Sect>
        </>
      )}

      {tab === "code" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>{source ? `${source.lines} lines${source.truncated ? " · truncated" : ""}` : srcBusy ? "loading…" : "code"}</span>
            <span style={{ flex: 1 }} />
            {source && <button style={zbtn} onClick={() => setCodeOpen(true)}>⛶ expand</button>}
          </div>
          {srcErr && <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted }}>{srcErr}</div>}
          {source && <CodePreview source={source} lines={42} />}
        </div>
      )}

      {tab === "snap" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <button style={{ ...zbtn, color: C.fg, borderColor: C.brand }} onClick={() => void analyze()} disabled={snapBusy}>
              {snapBusy ? "analyzing…" : snap?.snapshot ? "re-analyze" : "🧠 analyze file"}
            </button>
            {snap?.stale && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>stale — file changed</span>}
            {snap?.created_at && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{String(snap.created_at).slice(0, 16)}</span>}
          </div>
          {snapErr && <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted }}>{snapErr}</div>}
          {snap?.snapshot ? <SnapshotView s={snap.snapshot} /> : (!snapBusy && !snapErr && (
            <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, lineHeight: 1.4 }}>No snapshot yet — run the analysis (a mid-tier AI pass over the source + atlas signals, saved as a re-readable artifact).</div>
          ))}
        </div>
      )}

      {codeOpen && source && <CodeModal source={source} color={node.color} onClose={() => setCodeOpen(false)} />}
    </div>
  );
}

function CodePreview({ source, lines }: { source: FileSource; lines: number }) {
  const all = source.content.split("\n");
  const shown = all.slice(0, lines).join("\n");
  return (
    <pre style={{ margin: 0, fontFamily: mono, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 0", overflow: "auto", maxHeight: 360 }}>
      <Highlighted code={shown} fontSize={10.5} lineHeight={1.45} lineNumW={34} pad={10} />
      {all.length > lines && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, paddingLeft: 42, paddingTop: 4 }}>… {all.length - lines} more — ⛶ expand</div>}
    </pre>
  );
}

function CodeModal({ source, color, onClose }: { source: FileSource; color: string; onClose: () => void }) {
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ width: 9, height: 9, borderRadius: 9, background: color }} />
        <code style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 600 }}>{source.path}</code>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{source.lines} lines · {(source.bytes / 1024).toFixed(1)}KB{source.truncated ? " · truncated" : ""}</span>
        <span style={{ flex: 1 }} />
        <button style={{ ...zbtn, color: C.fg }} onClick={onClose}>✕ esc</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "8px 0", fontFamily: mono }}>
        <Highlighted code={source.content} fontSize={12} lineHeight={1.5} lineNumW={52} pad={16} />
      </div>
    </div>
  );
}

const SEV_HUE = (s: string) => (s === "critical" || s === "high" ? C.bad : s === "moderate" || s === "medium" ? C.warn : C.dim);
function SnapList({ label, items, hue }: { label: string; items: string[]; hue: string }) {
  if (!items || items.length === 0) return null;
  return (
    <Sect label={label}>
      {items.map((x, i) => <li key={i} style={{ fontSize: 10.5, color: hue, padding: "1px 0", borderLeft: `2px solid ${C.border}`, paddingLeft: 8, marginBottom: 2, listStyle: "none" }}>{x}</li>)}
    </Sect>
  );
}
function SnapshotView({ s }: { s: FileSnapshot }) {
  return (
    <div>
      {s.description && <div style={{ fontSize: 11.5, color: C.fg, lineHeight: 1.4, marginBottom: 8 }}>{s.description}</div>}
      <div style={{ display: "flex", gap: 14, alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: s.health >= 67 ? C.ok : s.health >= 34 ? C.warn : C.bad }}>{s.health}</span>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>/100 health</span>
        </span>
        <span style={{ fontFamily: mono, fontSize: 10, color: s.complexity === "high" ? C.bad : s.complexity === "medium" ? C.warn : C.ok }}>{s.complexity} complexity</span>
      </div>
      <SnapList label="responsibilities" items={s.responsibilities} hue={C.dim} />
      <SnapList label="insights" items={s.insights} hue={C.fg} />
      {s.vulnerabilities && s.vulnerabilities.length > 0 && (
        <Sect label={`vulnerabilities (${s.vulnerabilities.length})`}>
          {s.vulnerabilities.map((v, i) => (
            <li key={i} style={{ padding: "2px 0", borderLeft: `2px solid ${SEV_HUE(v.severity)}`, paddingLeft: 8, marginBottom: 3, listStyle: "none" }}>
              <span style={{ fontFamily: mono, fontSize: 8, color: SEV_HUE(v.severity), textTransform: "uppercase" }}>{v.severity}</span>
              <span style={{ fontSize: 10.5, color: C.fg, marginLeft: 6 }}>{v.issue}</span>
              {v.where && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, marginLeft: 4 }}>@ {v.where}</span>}
            </li>
          ))}
        </Sect>
      )}
      <SnapList label="smells" items={s.smells} hue={C.warn} />
      <SnapList label="suggestions" items={s.suggestions} hue={C.ok} />
    </div>
  );
}

/** THE VIEW BOX OF A GRAPH, NEVER TIGHTER THAN A MINIMUM WORLD (Grokbot QA 2026-10-12, item 25: "the nodes `server/` and `client/` render huge and clipped; reset and zoom out do not fix it").
 *  The box used to be the nodes' bounding box plus 30 units, so a project with two folder nodes had a box of ~100 x 60 units and the browser scaled it up several times: nodes the size of the screen,
 *  labels (drawn to the right of a node, outside the box) clipped. The box is now at least MIN_W x MIN_H, centred on what is drawn, with room on the right for labels. Pure - tested. */
export const GRAPH_MIN_W = 360, GRAPH_MIN_H = 240, GRAPH_LABEL_ROOM = 90;
export function graphBounds(pts: { x: number; y: number }[], pad = 30): { minX: number; minY: number; w: number; h: number } {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  let minX = Math.min(...xs) - pad; const maxX = Math.max(...xs) + pad + GRAPH_LABEL_ROOM;
  let minY = Math.min(...ys) - pad; const maxY = Math.max(...ys) + pad;
  const w = Math.max(GRAPH_MIN_W, maxX - minX), h = Math.max(GRAPH_MIN_H, maxY - minY);
  minX -= (w - (maxX - minX)) / 2; minY -= (h - (maxY - minY)) / 2;
  return { minX, minY, w, h };
}
