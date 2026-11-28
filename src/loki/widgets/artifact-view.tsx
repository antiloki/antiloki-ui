// artifact-view — the notebook artifacts rendered excalidraw-style (slides deck,
// hand timeline, tilted info table, radial mind map, diagram pack, quiz cards).
// Shared by the constitution paper (Appendix B) and the notebooks screen.
import React from "react";
import { C } from "@/loki/theme";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
const FS = { small: 10.5, base: 11.5, title: 13 };
// ── a shared hand-drawn TIMELINE (the AI widget and the notebook artifact both use it) ──
export function TimelineSketch({ events }: { events: Array<{ label: string; at?: string | null }> }) {
  const ev = events.slice(0, 9);
  if (!ev.length) return null;
  const W = 860, H = 150, x = (i: number) => 50 + (i + 0.5) * ((W - 100) / ev.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 880, display: "block" }}>
      <path d={`M 30 ${H / 2} C ${W * 0.3} ${H / 2 - 4}, ${W * 0.7} ${H / 2 + 4}, ${W - 30} ${H / 2}`} fill="none" stroke={C.dim} strokeWidth={1.3} />
      <path d={`M ${W - 38} ${H / 2 - 5} L ${W - 28} ${H / 2} L ${W - 38} ${H / 2 + 5}`} fill="none" stroke={C.dim} strokeWidth={1.3} strokeLinejoin="round" />
      {ev.map((e, i) => { const up = i % 2 === 0; const y0 = H / 2; return (
        <g key={i} transform={`rotate(${i % 2 ? 0.8 : -0.8} ${x(i)} ${y0})`}>
          <circle cx={x(i)} cy={y0} r={4} fill={C.panel} stroke={C.warn} strokeWidth={1.4} />
          <line x1={x(i)} y1={y0 + (up ? -8 : 8)} x2={x(i)} y2={y0 + (up ? -22 : 22)} stroke={`color-mix(in oklab, ${C.dim} 60%, transparent)`} />
          <text x={x(i)} y={y0 + (up ? -30 : 36)} textAnchor="middle" fill={C.fg} style={{ fontFamily: mono, fontSize: 10.5 }}>{String(e.label).slice(0, 22)}</text>
          {e.at && <text x={x(i)} y={y0 + (up ? -44 : 50)} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 10 }}>{String(e.at).slice(0, 16)}</text>}
        </g>
      ); })}
    </svg>
  );
}

// a quiz question that reveals its answer on click — the artifact's own little stage
export function QAcard({ q, a }: { q: string; a: string | null }) {
  const [openA, setOpenA] = React.useState(false);
  return (
    <div onClick={() => setOpenA((v) => !v)} role="button"
      style={{ border: `1px solid ${C.border}`, borderRadius: 9, background: C.panel2, padding: "6px 11px", cursor: "pointer", maxWidth: 380, transform: `rotate(${(q.length % 2) ? 0.5 : -0.5}deg)`, fontFamily: mono }}>
      <div style={{ fontSize: FS.base, color: C.fg, lineHeight: 1.5 }}>? {q}</div>
      {a && <div style={{ fontSize: FS.small, color: openA ? C.ok : C.dim, lineHeight: 1.55, marginTop: 3 }}>{openA ? a : "click to reveal"}</div>}
    </div>
  );
}

// ── ARTIFACT VIEW (operator 2026-07-19): the notebook artifacts rendered
// excalidraw-style — slides deck, hand timeline, tilted info table, radial mind
// map, diagram pack — each parsed from body_md/meta, honest fallback to prose. ──
export function ArtifactView({ item }: { item: any }) {
  const kind = String(item?.meta?.artifact_kind ?? item?.kind ?? "");
  const body = String(item?.body_md ?? "");
  try {
    if (item?.meta?.quiz && Array.isArray(item.meta.quiz)) {
      return (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          {item.meta.quiz.slice(0, 10).map((qz: any, i: number) => (
            <QAcard key={i} q={String(qz.q ?? qz.question ?? qz)} a={qz.a != null || qz.answer != null ? String(qz.a ?? qz.answer) : null} />
          ))}
        </div>
      );
    }
    if (item?.meta?.mindmap) {
      const tree = item.meta.mindmap;
      const lab = (nd: any) => String(nd?.label ?? nd?.name ?? nd?.title ?? "").slice(0, 24);
      const kids = (Array.isArray(tree?.children) ? tree.children : []).slice(0, 8);
      if (kids.length) {
        const W = 760, H = 300, cx0 = W / 2, cy0 = H / 2;
        return (
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 780, display: "block" }}>
            {kids.map((k: any, i: number) => {
              const ang = (i / kids.length) * Math.PI * 2 - Math.PI / 2;
              const x = cx0 + Math.cos(ang) * (W / 2 - 110), y = cy0 + Math.sin(ang) * (cy0 - 40);
              const sub = (Array.isArray(k?.children) ? k.children : []).length;
              return (
                <g key={i}>
                  <path d={`M ${cx0} ${cy0} Q ${(cx0 + x) / 2 + (i % 2 ? 16 : -16)} ${(cy0 + y) / 2} ${x} ${y}`} fill="none" stroke={`color-mix(in oklab, ${C.brand} 45%, transparent)`} strokeWidth={1.2} />
                  <ellipse cx={x} cy={y} rx={Math.max(34, lab(k).length * 3.5 + 12)} ry={14} fill={C.panel2} stroke={C.dim} strokeWidth={1.1} transform={`rotate(${i % 2 ? 1 : -1} ${x} ${y})`} />
                  <text x={x} y={y + 3.5} textAnchor="middle" fill={C.fg} style={{ fontFamily: mono, fontSize: 10.5 }}>{lab(k)}</text>
                  {sub > 0 && <text x={x} y={y + 22} textAnchor="middle" fill={C.dim} style={{ fontFamily: mono, fontSize: 10 }}>+{sub}</text>}
                </g>
              );
            })}
            <g transform={`rotate(-1 ${cx0} ${cy0})`}>
              <ellipse cx={cx0} cy={cy0} rx={Math.max(60, lab(tree).length * 4 + 18)} ry={20} fill={C.panel2} stroke={C.fg} strokeWidth={1.4} />
              <text x={cx0} y={cy0 + 4} textAnchor="middle" fill={C.fg} style={{ fontFamily: mono, fontSize: 11.5, fontWeight: 700 }}>{lab(tree) || "the map"}</text>
            </g>
          </svg>
        );
      }
    }
    if (item?.meta?.diagrams?.length) {
      const d = item.meta.diagrams[0];
      const nodes = (Array.isArray(d?.nodes) ? d.nodes : []).slice(0, 10);
      const idOf = (nd: any, i: number) => String(nd?.id ?? nd?.name ?? nd?.label ?? i);
      const labN = (nd: any) => String(nd?.label ?? nd?.name ?? nd?.id ?? "").slice(0, 20);
      if (nodes.length) {
        const cols = 2, rw = 320, rh = 46;
        const px2 = (i: number) => 40 + (i % cols) * rw;
        const py2 = (i: number) => 26 + Math.floor(i / cols) * rh;
        const idx = new Map(nodes.map((nd: any, i: number) => [idOf(nd, i), i]));
        const edges = (Array.isArray(d?.edges) ? d.edges : []).slice(0, 14)
          .map((e: any) => ({ a: idx.get(String(e.from ?? e.source ?? "")), b: idx.get(String(e.to ?? e.target ?? "")) }))
          .filter((e: any) => e.a != null && e.b != null);
        const H3 = 40 + Math.ceil(nodes.length / cols) * rh;
        return (
          <svg viewBox={`0 0 720 ${H3}`} style={{ width: "100%", maxWidth: 740, display: "block" }}>
            {edges.map((e: any, i: number) => (
              <path key={i} d={`M ${px2(e.a) + 120} ${py2(e.a)} C ${px2(e.a) + 190} ${py2(e.a)}, ${px2(e.b) - 70} ${py2(e.b)}, ${px2(e.b) + 8} ${py2(e.b)}`} fill="none" stroke={`color-mix(in oklab, ${C.brand} 40%, transparent)`} strokeWidth={1.1} />
            ))}
            {nodes.map((nd: any, i: number) => (
              <g key={i} transform={`rotate(${i % 2 ? 0.6 : -0.6} ${px2(i) + 60} ${py2(i)})`}>
                <rect x={px2(i)} y={py2(i) - 13} width={240} height={26} rx={8} fill={C.panel2} stroke={C.dim} strokeWidth={1.1} />
                <text x={px2(i) + 120} y={py2(i) + 4} textAnchor="middle" fill={C.fg} style={{ fontFamily: mono, fontSize: 10.5 }}>{labN(nd)}</text>
              </g>
            ))}
          </svg>
        );
      }
    }
    if (kind === "slides" || /\n---\n/.test(body)) {
      const slides = body.split(/\n---\n/).map((t) => t.trim()).filter(Boolean).slice(0, 10);
      if (slides.length > 1) return (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          {slides.map((sl, i) => {
            const lines = sl.split("\n").filter(Boolean);
            return (
              <div key={i} style={{ width: 252, border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel2, padding: "8px 12px", transform: `rotate(${i % 2 ? 0.7 : -0.7}deg)`, boxShadow: "0 3px 10px -6px rgba(0,0,0,.5)", fontFamily: mono }}>
                <div style={{ fontSize: FS.small, color: C.dim }}>slide {i + 1}</div>
                <b style={{ fontSize: FS.base, color: C.fg, lineHeight: 1.4 }}>{lines[0]?.replace(/^#+\s*/, "")}</b>
                {lines.slice(1, 6).map((l, j) => <div key={j} style={{ fontSize: FS.small, color: C.muted, lineHeight: 1.5 }}>{l.replace(/^[-*]\s*/, "– ")}</div>)}
              </div>
            );
          })}
        </div>
      );
    }
    if (kind === "timeline") {
      const ev = body.split("\n").filter((l) => /^[-*]\s/.test(l)).map((l) => l.replace(/^[-*]\s*/, "")).slice(0, 9)
        .map((l) => { const m = l.match(/^(\d{4}[-/][^\s:—-]*|\w+ \d{4})\s*[—:-]\s*(.+)$/); return m ? { at: m[1], label: m[2] } : { label: l }; });
      if (ev.length) return <TimelineSketch events={ev} />;
    }
    if (kind === "table" || /^\|/m.test(body)) {
      const rows = body.split("\n").filter((l) => l.trim().startsWith("|"))
        .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
        .filter((r) => r.length && !r.every((c) => /^:?-+:?$/.test(c)));
      if (rows.length >= 2) {
        const [headR, ...bodyR] = rows;
        return (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontFamily: mono, fontSize: FS.small, transform: "rotate(-0.25deg)" }}>
              <thead><tr>{headR.map((c, i) => <th key={i} style={{ textAlign: "left", color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, fontSize: 10, padding: "3px 10px", borderBottom: `1.4px dashed ${C.border}` }}>{c}</th>)}</tr></thead>
              <tbody>{bodyR.slice(0, 20).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: "3px 10px", borderBottom: `1px dashed color-mix(in oklab, ${C.border} 60%, transparent)`, color: j === 0 ? C.fg : C.muted, verticalAlign: "top" }}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      }
    }
  } catch { /* a strange payload falls back to honest prose below */ }
  return <pre style={{ whiteSpace: "pre-wrap", fontFamily: mono, fontSize: FS.base, lineHeight: 1.7, color: C.muted, margin: "3px 0 0", borderLeft: `2px solid ${C.border}`, paddingLeft: 10 }}>{body}</pre>;
}

