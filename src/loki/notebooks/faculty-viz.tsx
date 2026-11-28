// FACULTY VIZ — the Observatory's shared renderers + THE FACULTY MAGAZINE
// (expeditions v4, operator 2026-07-15: "one single magazine per faculty —
// deterministic infos × web search × AI on click"). The viz primitives
// (radar/quadrant/strata/gauges/treemap) still render structured JSON from
// grounded asks; MagazineView is each faculty's front page — the observation
// (substrate × keyless cached web) renders instantly and free, and the one
// ⚡ press button per issue is the faculty's only AI door.
import * as React from "react";
import { apiPost, unwrapResult } from "@/loki/api/client";
import { C, mono, nav } from "@/loki/theme";
import { CourseOverlay, PressModal } from "./faculty-course";

// ── the JSON salvage — an ask's answer → the instrument's payload ────────────
export function parseViz(md: string): any | null {
  try {
    const m = String(md ?? "").replace(/```[a-z]*\n?|```/g, "").match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

const clamp = (v: any, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || 0));

// ── RADAR — series compared across axes (rivals, options, criteria) ──────────
export function VizRadar({ data, tint }: { data: any; tint: string }) {
  const axes: any[] = (data?.axes ?? []).slice(0, 8);
  const series: any[] = (data?.series ?? []).slice(0, 4);
  const [hot, setHot] = React.useState<number | null>(null);
  if (!axes.length || !series.length) return null;
  const CXY = 260; const R = 190;
  const pt = (ai: number, v: number) => {
    const ang = (ai / axes.length) * 2 * Math.PI - Math.PI / 2;
    const r = (clamp(v, 0, 10) / 10) * R;
    return [CXY + Math.cos(ang) * r, CXY + Math.sin(ang) * r];
  };
  const palette = [tint, C.ok, C.warn, "oklch(0.78 0.13 300)"];
  return (
    <div style={{ display: "flex", gap: 26, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
      <svg viewBox="0 0 520 520" style={{ width: "min(560px, 82vw)", height: "auto" }}>
        {[0.25, 0.5, 0.75, 1].map((k) => (
          <polygon key={k} points={axes.map((_, ai) => pt(ai, k * 10).join(",")).join(" ")} fill="none" stroke={C.border} opacity={0.7} />
        ))}
        {axes.map((a, ai) => {
          const [x, y] = pt(ai, 11.6);
          return (<g key={ai}>
            <line x1={CXY} y1={CXY} x2={pt(ai, 10)[0]} y2={pt(ai, 10)[1]} stroke={C.border} />
            <text x={x} y={y} textAnchor="middle" fontSize="12" fill={C.muted} fontFamily={mono}>{String(a?.label ?? "").slice(0, 18)}</text>
          </g>);
        })}
        {series.map((s, si) => (
          <polygon key={si} points={axes.map((a, ai) => pt(ai, (a?.values ?? [])[si]).join(",")).join(" ")}
            fill={palette[si % 4]} fillOpacity={hot === si ? 0.34 : 0.14} stroke={palette[si % 4]} strokeWidth={hot === si ? 3 : 1.8}
            style={{ cursor: "pointer", transition: "fill-opacity .15s" }} onMouseEnter={() => setHot(si)} onMouseLeave={() => setHot(null)} />
        ))}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {series.map((s, si) => (
          <button key={si} onMouseEnter={() => setHot(si)} onMouseLeave={() => setHot(null)}
            style={{ display: "flex", alignItems: "center", gap: 8, background: hot === si ? `color-mix(in oklab, ${palette[si % 4]} 10%, transparent)` : "transparent", border: `1px solid ${hot === si ? palette[si % 4] : C.border}`, borderRadius: 9, padding: "6px 12px", cursor: "pointer" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: palette[si % 4] }} />
            <span style={{ fontFamily: mono, fontSize: 11.5, color: C.fg }}>{String(s?.name ?? `series ${si + 1}`)}</span>
          </button>
        ))}
        {data?.note && <div style={{ maxWidth: 240, fontFamily: nav, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{String(data.note)}</div>}
      </div>
    </div>
  );
}

// ── QUADRANT — items scattered on two forces (effort × payoff, risk × reach) ─
export function VizQuadrant({ data, tint }: { data: any; tint: string }) {
  const items: any[] = (data?.items ?? []).slice(0, 24);
  const [hot, setHot] = React.useState<number | null>(null);
  if (!items.length) return null;
  const W = 640; const H = 480; const M = 54;
  const px = (v: number) => M + (clamp(v, 0, 10) / 10) * (W - 2 * M);
  const py = (v: number) => H - M - (clamp(v, 0, 10) / 10) * (H - 2 * M);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "min(760px, 88vw)", height: "auto" }}>
        <rect x={M} y={M} width={W - 2 * M} height={H - 2 * M} fill="none" stroke={C.border} />
        <line x1={W / 2} y1={M} x2={W / 2} y2={H - M} stroke={C.border} strokeDasharray="4 4" />
        <line x1={M} y1={H / 2} x2={W - M} y2={H / 2} stroke={C.border} strokeDasharray="4 4" />
        <text x={W - M} y={H - M + 26} textAnchor="end" fontSize="12" fill={C.dim} fontFamily={mono}>{String(data?.x ?? "x")} →</text>
        <text x={M - 8} y={M - 10} fontSize="12" fill={C.dim} fontFamily={mono}>↑ {String(data?.y ?? "y")}</text>
        {(data?.quadrants ?? []).slice(0, 4).map((qq: any, qi: number) => {
          const qx = qi % 2 === 0 ? M + 10 : W / 2 + 10; const qy = qi < 2 ? M + 20 : H / 2 + 20;
          return <text key={qi} x={qx} y={qy} fontSize="10.5" fill={C.dim} fontFamily={mono} opacity="0.8">{String(qq).slice(0, 26)}</text>;
        })}
        {items.map((it, i) => (
          <g key={i} style={{ cursor: "pointer" }} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)}>
            <circle cx={px(it?.x)} cy={py(it?.y)} r={hot === i ? 11 : 7 + clamp(it?.size ?? 3, 1, 8)} fill={tint} fillOpacity={hot === i ? 0.9 : 0.55} stroke={tint} />
            <text x={px(it?.x)} y={py(it?.y) - 14} textAnchor="middle" fontSize="11" fontFamily={mono}
              fill={hot === i ? C.fg : C.muted} fontWeight={hot === i ? 700 : 400}>{String(it?.label ?? "").slice(0, 22)}</text>
          </g>
        ))}
      </svg>
      <div style={{ minHeight: 34, fontFamily: nav, fontSize: 12, color: C.muted, maxWidth: 640, textAlign: "center" }}>
        {hot != null ? (items[hot]?.note ?? items[hot]?.label ?? "") : "hover a dot — size is weight, corners are strategies"}
      </div>
    </div>
  );
}

// ── STRATA — layered history / stack (decisions over time, dependency layers) ─
export function VizStrata({ data, tint }: { data: any; tint: string }) {
  const layers: any[] = (data?.layers ?? []).slice(0, 12);
  const [open, setOpen] = React.useState<number | null>(0);
  if (!layers.length) return null;
  return (
    <div style={{ width: "min(720px, 88vw)", display: "flex", flexDirection: "column", gap: 4 }}>
      {layers.map((l, i) => {
        const w = 34 + (clamp(l?.weight ?? 5, 0, 10) / 10) * 66;
        const on = open === i;
        return (
          <div key={i} onClick={() => setOpen(on ? null : i)}
            style={{ cursor: "pointer", borderRadius: 9, overflow: "hidden", border: `1px solid ${on ? tint : C.border}`, transition: "border-color .15s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", background: `linear-gradient(90deg, color-mix(in oklab, ${tint} ${14 + i * 2}%, ${C.panel}) ${w}%, ${C.panel} ${w}%)` }}>
              <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, width: 64, flex: "none" }}>{String(l?.period ?? `layer ${i + 1}`)}</span>
              <span style={{ fontFamily: nav, fontSize: 12.5, color: C.fg, fontWeight: 600, flex: 1 }}>{String(l?.title ?? "")}</span>
              <span style={{ fontFamily: mono, fontSize: 10, color: on ? tint : C.dim }}>{on ? "▾" : "▸"}</span>
            </div>
            {on && l?.note && <div style={{ padding: "9px 14px", fontFamily: nav, fontSize: 11.5, color: C.muted, lineHeight: 1.55, borderTop: `1px solid ${C.border}`, background: C.bg }}>{String(l.note)}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── GAUGES — pressure board (risk scores, stress points) ─────────────────────
export function VizGauges({ data, tint }: { data: any; tint: string }) {
  const gauges: any[] = (data?.gauges ?? []).slice(0, 12);
  if (!gauges.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, width: "min(780px, 88vw)" }}>
      {gauges.map((g, i) => {
        const v = clamp(g?.value, 0, 100);
        const col = v > 66 ? "oklch(0.66 0.19 25)" : v > 33 ? C.warn : C.ok;
        const ang = -180 + (v / 100) * 180;
        return (
          <div key={i} title={String(g?.note ?? "")} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 12px 10px", background: C.panel, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <svg viewBox="0 0 120 66" style={{ width: 120, height: 66 }}>
              <path d="M12 60 A48 48 0 0 1 108 60" fill="none" stroke={C.border} strokeWidth="8" strokeLinecap="round" />
              <path d="M12 60 A48 48 0 0 1 108 60" fill="none" stroke={col} strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${(v / 100) * 151} 151`} />
              <line x1="60" y1="60" x2={60 + 40 * Math.cos((ang * Math.PI) / 180)} y2={60 + 40 * Math.sin((ang * Math.PI) / 180)} stroke={C.fg} strokeWidth="2.5" />
              <circle cx="60" cy="60" r="4" fill={C.fg} />
            </svg>
            <span style={{ fontFamily: mono, fontSize: 15, fontWeight: 700, color: col }}>{v}</span>
            <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, textAlign: "center", lineHeight: 1.35 }}>{String(g?.label ?? "")}</span>
            {g?.note && <span style={{ fontFamily: nav, fontSize: 9.5, color: C.dim, textAlign: "center", lineHeight: 1.4 }}>{String(g.note).slice(0, 90)}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── TREEMAP — the city map of the codebase, PURE substrate data (zero AI):
//    folders sized by token mass from the atlas; click descends, breadcrumb
//    climbs back. The proof that expeditions run on deterministic capability. ─
export function VizTreemap({ fileTok, tint, onPick }: { fileTok: Record<string, number>; tint: string; onPick?: (path: string) => void }) {
  const [root, setRoot] = React.useState<string>("");
  const entries = Object.entries(fileTok ?? {});
  const children = React.useMemo(() => {
    const acc: Record<string, { tok: number; files: number; leaf: boolean }> = {};
    const prefix = root ? root + "/" : "";
    for (const [path, tok] of entries) {
      if (root && !path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const seg = rest.split("/")[0];
      if (!seg) continue;
      const leaf = !rest.includes("/");
      acc[seg] = acc[seg] ?? { tok: 0, files: 0, leaf };
      acc[seg].tok += Number(tok) || 0; acc[seg].files += 1;
      if (!leaf) acc[seg].leaf = false;
    }
    return Object.entries(acc).sort((a, b) => b[1].tok - a[1].tok).slice(0, 30);
  }, [entries.length, root]);
  const total = children.reduce((s, [, v]) => s + v.tok, 0) || 1;
  const crumbs = root ? root.split("/") : [];
  return (
    <div style={{ width: "min(860px, 90vw)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => setRoot("")} style={{ background: "transparent", border: "none", color: root ? tint : C.fg, cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>⌂ the city</button>
        {crumbs.map((cr, i) => (
          <React.Fragment key={i}>
            <span style={{ color: C.dim, fontSize: 10 }}>/</span>
            <button onClick={() => setRoot(crumbs.slice(0, i + 1).join("/"))} style={{ background: "transparent", border: "none", color: i === crumbs.length - 1 ? C.fg : tint, cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>{cr}</button>
          </React.Fragment>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{children.length} districts · sized by token mass · zero AI</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignContent: "flex-start" }}>
        {children.map(([seg, v]) => {
          const share = v.tok / total;
          const px2 = Math.max(84, Math.round(Math.sqrt(share) * 560));
          return (
            <div key={seg} onClick={() => { const full = root ? `${root}/${seg}` : seg; if (onPick) onPick(full); if (!v.leaf) setRoot(full); }} title={`${seg} — ${v.files} file${v.files === 1 ? "" : "s"} · ${Math.round(v.tok / 1000)}k tokens`}
              style={{ width: px2, height: Math.max(58, Math.round(px2 * 0.62)), borderRadius: 9, padding: "8px 10px", cursor: v.leaf ? "default" : "pointer", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "space-between", border: `1px solid color-mix(in oklab, ${tint} ${20 + share * 60}%, ${C.border})`, background: `linear-gradient(150deg, color-mix(in oklab, ${tint} ${6 + share * 34}%, ${C.panel}), ${C.panel})`, transition: "transform .12s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}>
              <span style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 700, color: C.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.leaf ? "▤ " : "▦ "}{seg}</span>
              <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>{Math.round(v.tok / 1000)}k tok · {v.files}f</span>
            </div>
          );
        })}
        {!children.length && <span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>the atlas has no token map yet — rebuild the codebase on the Code screen</span>}
      </div>
    </div>
  );
}

// ── the monograph press survives the v4 sweep (it keeps pressing papers until
//    THE JOURNAL lands): deterministic md→html + the standalone paper HTML. ──
export function md2html(md: string): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return String(md ?? "").split(/\n{2,}/).map((blk) => {
    const b = blk.trim(); if (!b) return "";
    if (/^#{1,4} /.test(b)) { const lvl = (b.match(/^#+/) ?? ["#"])[0].length; return `<h${lvl + 1}>${esc(b.replace(/^#+ /, ""))}</h${lvl + 1}>`; }
    if (/^\|.*\|$/m.test(b)) {
      // markdown table block → a real <table> (the Info-table artifact exports as a page)
      const rows = b.split(/\n/).map((l) => l.trim()).filter((l) => /^\|.*\|$/.test(l) && !/^\|[\s:|-]+\|$/.test(l))
        .map((l) => l.slice(1, -1).split("|").map((c) => c.trim()));
      if (rows.length) return `<table>${rows.map((r, i) => `<tr>${r.map((c) => `<t${i === 0 ? "h" : "d"}>${esc(c).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>")}</t${i === 0 ? "h" : "d"}>`).join("")}</tr>`).join("")}</table>`;
    }
    if (/^[-*] /m.test(b)) return `<ul>${b.split(/\n/).filter((l) => /^[-*] /.test(l.trim())).map((l) => `<li>${esc(l.trim().slice(2)).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")}</li>`).join("")}</ul>`;
    return `<p>${esc(b).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\n/g, "<br/>")}</p>`;
  }).join("\n");
}

export function pressPaperHtml(opts: { title: string; thesis: string; faculty: string; motto: string; tint: string; sections: Array<{ heading: string; md: string }> }): string {
  const date = new Intl.DateTimeFormat("en-CA").format(new Date());
  return [
    `<!doctype html><html><head><meta charset="utf-8"/><title>${opts.title}</title><style>`,
    `body{margin:0;background:#101216;color:#e8eaef;font:15px/1.7 Georgia,serif}`,
    `.cover{padding:90px 24px 60px;text-align:center;background:radial-gradient(700px 320px at 50% -60px,${opts.tint}33,transparent)}`,
    `.cover h1{font-size:34px;margin:0 0 10px}`,
    `.cover .thesis{max-width:640px;margin:0 auto;font-style:italic;color:#aab}`,
    `.cover .seal{display:inline-block;margin-top:26px;padding:6px 18px;border:1px solid ${opts.tint};border-radius:999px;color:${opts.tint};font:11px monospace}`,
    `main{max-width:720px;margin:0 auto;padding:30px 22px 90px}`,
    `h2{font-size:21px;border-bottom:1px solid #2a2e39;padding-bottom:6px;margin-top:44px;color:${opts.tint}}`,
    `h3{font-size:17px}code{background:#1a1d25;padding:1px 6px;border-radius:4px;font-size:13px}`,
    `ul{padding-left:22px}footer{max-width:720px;margin:0 auto;padding:20px;border-top:1px solid #2a2e39;font:10px monospace;color:#778}`,
    `</style></head><body>`,
    `<div class="cover"><div style="font-size:34px">📜</div><h1>${opts.title}</h1><div class="thesis">${opts.thesis}</div>`,
    `<div class="seal">${opts.faculty} faculty · the Knowledge Hub · ${date}</div></div><main>`,
    opts.sections.map((s) => `<h2>${s.heading}</h2>${md2html(s.md)}`).join("\n"),
    `</main><footer>pressed by the ${opts.faculty} observatory · "${opts.motto}" · ${date} · antiloki</footer></body></html>`,
  ].join("\n");
}

// tiny renderer so the viz module doesn't import the app Markdown component
function MarkdownLite({ text }: { text: string }) {
  return <div style={{ fontFamily: nav, fontSize: 11.5, color: C.muted, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: md2html(text) }} />;
}

// ═══ THE FACULTY MAGAZINE (expeditions v4, layout v2) ════════════════════════
// One publication per faculty. Round 2 (operator 2026-07-15): a REAL magazine
// — editorial grid (lead story + rail, departments on a 6-column modular
// grid), serif display type, articles that read like articles (byline, drop
// cap, measure), the tech press panel, the data spread, and a transparent
// press: every AI call shows its model, tokens and price. Layout principles
// per the editorial-design canon: grid, hierarchy, white space, consistency.
const serif = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";
// MAIN carries the reading (articles); the RAIL carries compact reference
// data (operator: "the ledger on the right — not much space"); DESK depts sit
// side by side with the «feed the desk» dispatch box at the bottom (operator:
// "the wire on the side of the wire-feed-the-desk").
const MAG_DEPTS: Record<string, Array<{ key: string; title: string; hint: string; col: "main" | "rail" | "desk" }>> = {
  arch: [
    { key: "press", title: "the tech press", hint: "the stack's own blogs, scraped to full articles", col: "main" },
    { key: "ledger", title: "the dependency ledger", hint: "npm × osv.dev", col: "rail" },
    { key: "horizon", title: "the horizon", hint: "endoflife.date", col: "rail" },
    { key: "notices", title: "structural notices", hint: "the atlas: giants + hubs", col: "rail" },
    { key: "wire", title: "the wire", hint: "releases derived from your own deps + dispatches", col: "desk" },
  ],
  product: [
    { key: "product", title: "the product on paper", hint: "what the code proves × what you declare × what your site claims", col: "main" },
    { key: "rivals", title: "the rival pages", hint: "dossiers per rival — from your PRODUCT DOSSIER + «rival:» dispatches", col: "main" },
    { key: "dispatches", title: "dispatches from the field", hint: "HN on the dossier's vocabulary (manifest fallback) + your feeds", col: "desk" },
  ],
};

const dline: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, color: C.dim, letterSpacing: 1.2, textTransform: "uppercase" };
const RED = "oklch(0.66 0.19 25)";
const KIND_GLYPH: Record<string, string> = { post: "¶", video: "▶", podcast: "♪" };

function Byline({ it, tint }: any) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
      <span style={{ fontFamily: mono, fontSize: 7.5, color: tint, border: `1px solid color-mix(in oklab, ${tint} 40%, transparent)`, borderRadius: 999, padding: "1px 7px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {KIND_GLYPH[it.kind] ?? "¶"} {it.source}
      </span>
      {it.date && <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{it.date}</span>}
    </span>
  );
}

// a real magazine article: byline rule, serif headline, drop cap, measure.
// Content is PLAIN TEXT from the server extractor — scraped HTML never
// reaches the DOM (the XSS boundary).
function ArticleReader({ it, tint }: any) {
  const paras = String(it.content ?? "").split(/\n{2,}|\n(?=·)/).map((p: string) => p.trim()).filter(Boolean);
  const [first, ...rest] = paras;
  return (
    <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 9 }}>
      <Byline it={it} tint={tint} />
      <div style={{ fontFamily: serif, fontSize: 19, fontWeight: 700, color: C.fg, lineHeight: 1.25, maxWidth: "34ch" }}>{it.title}</div>
      <div style={{ height: 1, background: `linear-gradient(90deg, ${tint}, transparent)`, opacity: 0.6 }} />
      <div style={{ maxWidth: "64ch", maxHeight: 360, overflowY: "auto", paddingRight: 6 }}>
        {first && (
          <p style={{ fontFamily: serif, fontSize: 12.5, color: C.fg, lineHeight: 1.75, margin: "0 0 8px" }}>
            <span style={{ float: "left", fontFamily: serif, fontSize: 36, lineHeight: 0.85, paddingRight: 7, paddingTop: 3, color: tint, fontWeight: 700 }}>{first.slice(0, 1)}</span>
            {first.slice(1)}
          </p>
        )}
        {rest.map((p: string, i: number) => (
          <p key={i} style={{ fontFamily: serif, fontSize: 12, color: C.muted, lineHeight: 1.7, margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{p}</p>
        ))}
      </div>
      <a href={it.link || undefined} target="_blank" rel="noreferrer" style={{ fontFamily: mono, fontSize: 8.5, color: tint, textDecoration: "none" }}>read the original ↗</a>
    </div>
  );
}

function ArticleRow({ it, tint, open, onToggle }: any) {
  const hasBody = !!(it.content && String(it.content).trim().length > 40);
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${open ? `color-mix(in oklab, ${tint} 45%, ${C.border})` : C.border}`, overflow: "hidden" }}>
      <div onClick={() => hasBody && onToggle()}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 9px", cursor: hasBody ? "pointer" : "default", background: open ? `color-mix(in oklab, ${tint} 6%, transparent)` : "transparent" }}>
        <span style={{ fontFamily: mono, fontSize: 7.5, color: tint, border: `1px solid color-mix(in oklab, ${tint} 40%, transparent)`, borderRadius: 999, padding: "1px 7px", flex: "none", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{KIND_GLYPH[it.kind] ?? "¶"} {it.source}</span>
        <span style={{ fontFamily: serif, fontSize: 12, color: C.fg, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
        {it.date && <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, flex: "none" }}>{it.date}</span>}
        {hasBody && <span style={{ fontFamily: mono, fontSize: 8.5, color: open ? tint : C.dim, flex: "none" }}>{open ? "▾" : "¶"}</span>}
        <a href={it.link || undefined} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
          style={{ fontFamily: mono, fontSize: 9, color: C.dim, flex: "none", textDecoration: "none" }}>↗</a>
      </div>
      {open && hasBody && <div style={{ borderTop: `1px solid ${C.border}` }}><ArticleReader it={it} tint={tint} /></div>}
    </div>
  );
}

function DeptFrame({ d, title, hint, headline, caption, tint, children }: any) {
  return (
    <div style={{ minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 12, background: C.panel, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
        <span style={{ ...dline, color: tint }}>{title}</span>
        <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{hint}</span>
      </div>
      {headline && <div style={{ fontFamily: serif, fontSize: 15, fontWeight: 700, color: C.fg, lineHeight: 1.3, textWrap: "balance" as any }}>{headline}</div>}
      {caption && <div style={{ fontFamily: serif, fontSize: 11, color: C.muted, fontStyle: "italic", marginTop: -3 }}>{caption}</div>}
      {d?.error ? <span style={{ fontFamily: mono, fontSize: 9.5, color: C.warn }}>department unavailable — {d.error}</span>
        : !d ? <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>no data in this department yet</span>
        : children}
    </div>
  );
}

// compact by design — a slim rail list, riskiest first, one line per dep
function DeptLedger({ d, tint }: any) {
  const deps: any[] = d?.deps ?? [];
  const nBehind = deps.filter((x) => x.behind > 0).length;
  const nAdv = deps.reduce((s2, x) => s2 + (x.advisories?.length ?? 0), 0);
  const shown = deps.slice(0, 12);
  if (!deps.length) return <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>no package.json found under the workspace root</span>;
  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontFamily: mono, fontSize: 8.5, color: C.muted }}>
        <span><b style={{ color: tint }}>{deps.length}</b> deps</span>
        <span><b style={{ color: nBehind ? C.warn : C.ok }}>{nBehind}</b> behind</span>
        <span><b style={{ color: nAdv ? RED : C.ok }}>{nAdv}</b> advisories</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {shown.map((x) => (
          <a key={x.name} href={`https://www.npmjs.com/package/${encodeURIComponent(x.name)}`} target="_blank" rel="noreferrer"
            title={`${x.name} — ${x.current}${x.latest && x.latest !== x.current ? ` → ${x.latest}` : " · latest"}${x.advisories?.length ? ` · ${x.advisories.length} advisor${x.advisories.length === 1 ? "y" : "ies"}` : ""}`}
            style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: 2, padding: "4px 7px", borderRadius: 7, background: C.bg, border: `1px solid ${x.advisories?.length ? `color-mix(in oklab, ${RED} 55%, ${C.border})` : C.border}` }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, color: C.fg, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
              {!!x.advisories?.length && <span style={{ fontFamily: mono, fontSize: 7, color: C.bg, background: RED, borderRadius: 999, padding: "0 5px", flex: "none" }}>{x.advisories.length}</span>}
              {x.dev && <span style={{ fontFamily: mono, fontSize: 6.5, color: C.dim, flex: "none" }}>dev</span>}
              <span style={{ fontFamily: mono, fontSize: 7.5, color: x.behind >= 40 ? C.warn : C.dim, flex: "none" }}>{x.latest && x.latest !== x.current ? `→ ${x.latest}` : "latest"}</span>
            </span>
            <span style={{ height: 2, borderRadius: 1, background: `color-mix(in oklab, ${C.border} 60%, transparent)`, overflow: "hidden", display: "block" }}>
              <span style={{ display: "block", height: "100%", width: `${Math.max(2, x.behind ?? 0)}%`, background: x.behind >= 40 ? C.warn : x.behind > 0 ? tint : C.ok, borderRadius: 1 }} />
            </span>
          </a>
        ))}
      </div>
      {deps.length > shown.length && <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>＋{deps.length - shown.length} more, quieter — sorted by risk</span>}
    </>
  );
}

function DeptHorizon({ d }: any) {
  const rows: any[] = d?.products ?? [];
  if (!rows.length) return <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>none of the stack's products are tracked by endoflife.date</span>;
  const pill = (p: any) => {
    if (typeof p.eol === "string") {
      const days = p.runway_days;
      const col = days != null && days < 180 ? RED : days != null && days < 420 ? C.warn : C.ok;
      return <span style={{ fontFamily: mono, fontSize: 8.5, color: col }}>EOL {p.eol}{days != null ? ` · ${days}d` : ""}</span>;
    }
    return p.eol === false
      ? <span style={{ fontFamily: mono, fontSize: 8.5, color: C.ok }}>no EOL announced</span>
      : <span style={{ fontFamily: mono, fontSize: 8.5, color: RED }}>cycle ended</span>;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {rows.map((p) => (
        <div key={p.product} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "5px 9px", borderRadius: 8, border: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 700, color: C.fg }}>{p.product}</span>
          <span style={{ fontFamily: mono, fontSize: 8, color: C.muted }}>cycle {p.cycle}{p.current ? ` · using ${p.current}` : ""}</span>
          {pill(p)}
        </div>
      ))}
    </div>
  );
}

function DeptWireList({ d, tint, empty }: any) {
  const items: any[] = d?.items ?? [];
  const [open, setOpen] = React.useState<number | null>(null);
  if (!items.length) return <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{empty}</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {items.slice(0, 12).map((it, i) => (
        <ArticleRow key={i} it={it} tint={tint} open={open === i} onToggle={() => setOpen(open === i ? null : i)} />
      ))}
    </div>
  );
}

// THE TECH PRESS — the articles panel: the stack's own blogs as magazine
// cards; a click opens the full article reader in place.
function DeptPress({ d, tint }: any) {
  const items: any[] = d?.items ?? [];
  const [sel, setSel] = React.useState<number | null>(null);
  if (!items.length) return <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>no blogs discovered for this stack yet — first observe fetches them</span>;
  const cur = sel != null ? items[sel] : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {cur && (
        <div style={{ border: `1px solid color-mix(in oklab, ${tint} 45%, ${C.border})`, borderRadius: 10, background: C.bg }}>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 8px 0" }}>
            <button onClick={() => setSel(null)} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 9 }}>close ✕</button>
          </div>
          <ArticleReader it={cur} tint={tint} />
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 7 }}>
        {items.slice(0, 8).map((it, i) => (
          <div key={i} onClick={() => setSel(sel === i ? null : i)}
            style={{ border: `1px solid ${sel === i ? tint : C.border}`, borderRadius: 10, background: C.bg, padding: "9px 11px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 5 }}>
            <Byline it={it} tint={tint} />
            <span style={{ fontFamily: serif, fontSize: 12.5, fontWeight: 700, color: C.fg, lineHeight: 1.3 }}>{it.title}</span>
            {it.content && <span style={{ fontFamily: serif, fontSize: 10, color: C.dim, lineHeight: 1.5, fontStyle: "italic" }}>{String(it.content).replace(/\n+/g, " ").slice(0, 110)}…</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DeptNotices({ d, tint }: any) {
  const col = (label: string, rows: any[], fmt: (r: any) => [string, string]) => (
    <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={dline}>{label}</span>
      {rows.map((r) => { const [a, b] = fmt(r); return (
        <div key={a} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontFamily: mono, fontSize: 9 }}>
          <span style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a}</span>
          <span style={{ color: tint, flex: "none" }}>{b}</span>
        </div>
      ); })}
      {!rows.length && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>—</span>}
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {col("the giants — heaviest files", (d?.giants ?? []).slice(0, 6), (g) => [g.path, g.tokens >= 1000 ? Math.round(g.tokens / 1000) + "k tok" : g.tokens + " tok"])}
      {col("the hubs — most depended-on", (d?.hubs ?? []).slice(0, 6), (h) => [h.path, h.dependents + " deps"])}
    </div>
  );
}

// the deterministic floor of business knowledge: the atlas's feature
// inventory (what the code PROVES) + the dossier (what the operator DECLARES)
// + the product's own site (what it CLAIMS)
function DeptProduct({ d, tint }: any) {
  const dossier = d?.dossier;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {dossier ? (
        <div style={{ border: `1px solid color-mix(in oklab, ${tint} 40%, ${C.border})`, borderRadius: 10, background: C.bg, padding: "9px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ ...dline, color: tint }}>the declared intention — from your dossier</span>
          {dossier.one_liner && <span style={{ fontFamily: serif, fontSize: 13.5, fontWeight: 700, color: C.fg, lineHeight: 1.4 }}>{dossier.one_liner}</span>}
          <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {dossier.audience && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 8px" }}>for: {dossier.audience}</span>}
            {dossier.problem && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 8px" }}>kills: {dossier.problem}</span>}
          </span>
        </div>
      ) : (
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: "10px 12px", fontFamily: mono, fontSize: 9.5, color: C.dim }}>
          no PRODUCT DOSSIER yet — the operator is the registry: declare the intention at the desk (📋 dossier) and every section below starts speaking the market's language
        </div>
      )}
      {!!(d?.features ?? []).length && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={dline}>what the code proves — {d.entry_points} entry points · {d.stories} journeys{d.gaps ? ` · ${d.gaps} unnamed surfaces` : ""}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {d.features.map((f: any, i: number) => (
              <span key={i} style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "2px 8px" }}>
                {f.label}{f.stories ? <span style={{ color: tint }}> · {f.stories}⛓</span> : null}
              </span>
            ))}
          </div>
        </div>
      )}
      {d?.self && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={dline}>what your site claims</span>
          <span style={{ fontFamily: serif, fontSize: 11, color: C.muted, fontStyle: "italic" }}>{d.self.title}</span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {(d.self.claims ?? []).slice(0, 5).map((c2: string, ci: number) => (
              <span key={ci} style={{ fontFamily: mono, fontSize: 7.5, color: tint, border: `1px solid color-mix(in oklab, ${tint} 35%, transparent)`, borderRadius: 999, padding: "1px 7px" }}>{c2}</span>
            ))}
          </span>
        </div>
      )}
      {!(d?.features ?? []).length && !d?.self && dossier && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>the atlas has no feature inventory for this workspace yet — rebuild the codebase to prove the features</span>}
    </div>
  );
}

function DeptRivals({ d, tint }: any) {
  const rivals: any[] = d?.rivals ?? [];
  if (!rivals.length) return <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>no rivals tracked — dispatch «rival: Name» plus their https URL onto the wire below</span>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
      {rivals.map((r) => (
        <a key={r.name} href={r.url} target="_blank" rel="noreferrer"
          style={{ textDecoration: "none", border: `1px solid ${r.ok ? C.border : RED}`, borderRadius: 11, background: C.bg, padding: "9px 11px", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontFamily: serif, fontSize: 13, fontWeight: 700, color: C.fg, flex: 1 }}>{r.name}</span>
            {!r.ok && <span style={{ fontFamily: mono, fontSize: 8, color: "oklch(0.72 0.17 25)" }}>unreachable</span>}
          </span>
          {r.title && <span style={{ fontFamily: serif, fontSize: 10.5, color: C.muted, lineHeight: 1.4, fontStyle: "italic" }}>{r.title}</span>}
          {r.description && <span style={{ fontFamily: nav, fontSize: 9, color: C.dim, lineHeight: 1.4 }}>{String(r.description).slice(0, 110)}</span>}
          <span style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {(r.claims ?? []).slice(0, 4).map((c2: string, ci: number) => (
              <span key={ci} style={{ fontFamily: mono, fontSize: 7.5, color: tint, border: `1px solid color-mix(in oklab, ${tint} 35%, transparent)`, borderRadius: 999, padding: "1px 7px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 190 }}>{c2}</span>
            ))}
            {(r.claims ?? []).length > 4 && <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim }}>+{r.claims.length - 4}</span>}
          </span>
        </a>
      ))}
    </div>
  );
}

// ═══ THE DATA SPREAD (operator: "instead of the centerfold, a hub with all
// graphs and info stats from the instrument we are") — every number and chart
// derives from the observation; forms per the dataviz canon: stat tiles for
// headlines, single-hue bars (VizStrata) for magnitude, dials (VizGauges) for
// 0-100 shares; status colors reserved for state. Zero AI. ══════════════════
const byDay = (items: any[]) => {
  const acc: Record<string, number> = {};
  for (const it of items ?? []) { const d2 = String(it.date ?? "").slice(0, 10); if (d2) acc[d2] = (acc[d2] ?? 0) + 1; }
  const days = Object.entries(acc).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10);
  const mx = Math.max(1, ...days.map(([, v]) => v));
  return { layers: days.map(([d2, v]) => ({ period: d2.slice(5), title: `${v} stor${v === 1 ? "y" : "ies"}`, note: "published that day", weight: (10 * v) / mx })) };
};

const fmtN = (v: any) => (v == null ? "—" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : String(v));

// four-week download trend, drawn thin with the endpoint emphasized
function TrendRow({ t, tint }: any) {
  const vals: number[] = t.trend ?? [];
  if (vals.length < 2) return null;
  const W = 120; const H = 26;
  const mx = Math.max(...vals); const mn = Math.min(...vals);
  const pt = (v: number, i: number) => [3 + (i / (vals.length - 1)) * (W - 8), H - 4 - ((v - mn) / Math.max(1, mx - mn)) * (H - 8)];
  const pts = vals.map((v, i) => pt(v, i).join(",")).join(" ");
  const [ex, ey] = pt(vals[vals.length - 1], vals.length - 1);
  const d = vals[0] ? Math.round(((vals[vals.length - 1] - vals[0]) / vals[0]) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", borderBottom: `1px dashed ${C.border}` }}>
      <span style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700, color: C.fg, width: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, flex: "none" }}>
        <polyline points={pts} fill="none" stroke={tint} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={ex} cy={ey} r={3} fill={tint} />
      </svg>
      <span style={{ fontFamily: mono, fontSize: 9, color: d > 0 ? C.ok : d < 0 ? C.warn : C.dim, fontVariantNumeric: "tabular-nums", width: 46 }}>{d > 0 ? "+" : ""}{d}%</span>
      <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, fontVariantNumeric: "tabular-nums" }}>{fmtN(t.weekly)}/wk</span>
    </div>
  );
}

// quiet ranking rows: label · thin baseline bar · value. Small and elegant by
// construction — thin marks, direct labels, no chrome.
function MiniBars({ rows, tint }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {(rows ?? []).map((r: any) => (
        <div key={r.label} title={r.sub ?? r.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, width: 104, flex: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
          <span style={{ flex: 1, height: 4, borderRadius: 2, background: `color-mix(in oklab, ${C.border} 55%, transparent)`, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${Math.max(2, r.pct ?? 0)}%`, background: tint, borderRadius: 2 }} />
          </span>
          <span style={{ fontFamily: mono, fontSize: 8.5, color: C.fg, width: 44, flex: "none", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function spread(f: any, D: any) {
  if (f.key === "arch") {
    // the WORLD's numbers on this stack — npm × GitHub × endoflife.date.
    // Nothing here is internal code knowledge (operator 2026-07-15).
    const techs: any[] = D.stats?.techs ?? [];
    const sum = (k: string) => techs.reduce((s, t) => s + (Number(t[k]) || 0), 0);
    const runways = techs.map((t) => t.runway_days).filter((v: any) => v != null).sort((a: number, b: number) => a - b);
    const medianRunway = runways.length ? runways[Math.floor(runways.length / 2)] : null;
    const mxDl = Math.max(1, ...techs.map((t) => t.weekly ?? 0));
    const mxSt = Math.max(1, ...techs.map((t) => t.stars ?? 0));
    const mxRel = Math.max(1, ...techs.map((t) => t.releases_90d ?? 0));
    const short = (n: string) => (n.includes("/") ? n.split("/").pop() : n);
    return {
      trends: techs.filter((t) => (t.trend ?? []).length >= 2).slice(0, 6),
      tiles: [
        { label: "weekly downloads", value: fmtN(sum("weekly")), tone: "tint" },
        { label: "github stars", value: fmtN(sum("stars")), tone: "tint" },
        { label: "releases · 90d", value: sum("releases_90d"), tone: "ok" },
        { label: "median runway", value: medianRunway != null ? `${medianRunway}d` : "—", tone: medianRunway != null && medianRunway < 420 ? "warn" : "ok" },
      ],
      charts: [
        { title: "popularity — dl/week", rows: [...techs].sort((a, b) => (b.weekly ?? 0) - (a.weekly ?? 0)).map((t) => ({ label: short(t.name), value: fmtN(t.weekly), pct: (100 * (t.weekly ?? 0)) / mxDl, sub: `${t.name} — ${fmtN(t.stars)} stars` })) },
        { title: "momentum — stars", rows: [...techs].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0)).map((t) => ({ label: short(t.name), value: fmtN(t.stars), pct: (100 * (t.stars ?? 0)) / mxSt, sub: `${fmtN(t.open_issues)} open issues${t.pushed_at ? ` · pushed ${t.pushed_at}` : ""}` })) },
        { title: "cadence — releases · 90d", rows: [...techs].sort((a, b) => (b.releases_90d ?? 0) - (a.releases_90d ?? 0)).map((t) => ({ label: short(t.name), value: String(t.releases_90d ?? 0), pct: (100 * (t.releases_90d ?? 0)) / mxRel, sub: `${t.releases_90d ?? 0} releases in 90 days` })) },
      ],
    };
  }
  const rivals: any[] = D.rivals?.rivals ?? [];
  const items: any[] = D.dispatches?.items ?? [];
  const mxC = Math.max(1, ...rivals.map((r) => (r.claims ?? []).length));
  return {
    trends: [],
    tiles: [
      { label: "rivals tracked", value: rivals.length, tone: "tint" },
      { label: "reachable", value: rivals.filter((r) => r.ok).length, tone: "ok" },
      { label: "search keys", value: (D.dispatches?.keywords ?? []).length, tone: "tint" },
      { label: "field dispatches", value: items.length, tone: "tint" },
    ],
    charts: [
      { title: "claims per rival", rows: rivals.map((r) => ({ label: r.name, value: String((r.claims ?? []).length), pct: (100 * (r.claims ?? []).length) / mxC, sub: r.title || r.url })) },
      { title: "the field, day by day", rows: byDay(items).layers.map((l: any) => ({ label: l.period, value: l.title.split(" ")[0], pct: l.weight * 10, sub: l.title })) },
    ],
  };
}

// in-flow (operator: "doesn't need a new screen; two columns; simple, small,
// elegant") — a tile row, then a strict two-column grid of quiet panels:
// popularity | momentum · cadence | trends
function SpreadBody({ f, obs }: any) {
  const tint = f.tint;
  const { tiles, charts, trends } = React.useMemo(() => spread(f, obs?.departments ?? {}), [f, obs]);
  const toneColor: Record<string, string> = { tint, ok: C.ok, warn: C.warn, bad: RED };
  const panel = (title: string, body: React.ReactNode) => (
    <div key={title} style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg, padding: "9px 11px", display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
      <span style={{ ...dline, color: tint }}>{title}</span>
      {body}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))", gap: 7 }}>
        {tiles.map((t: any) => (
          <div key={t.label} style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg, padding: "8px 10px" }}>
            <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: toneColor[t.tone] ?? tint, fontVariantNumeric: "tabular-nums" }}>{t.value}</div>
            <div style={{ ...dline, marginTop: 2, fontSize: 7.5 }}>{t.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {charts.map((c: any) => panel(c.title, <MiniBars rows={c.rows} tint={tint} />))}
        {!!(trends ?? []).length && panel("trends — four weeks of downloads", <div style={{ display: "flex", flexDirection: "column" }}>{trends.map((t: any) => <TrendRow key={t.name} t={t} tint={tint} />)}</div>)}
      </div>
    </div>
  );
}

export function MagazineView({ f, feeds, rivals, docs, onIssue, desk, onOpenDossier }: any) {
  const tint = f.tint;
  const [obs, setObs] = React.useState<any | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [press, setPress] = React.useState<any | null>(null); // {phase, note, ai}
  const [note, setNote] = React.useState("");
  const [courseOpen, setCourseOpen] = React.useState(false);
const unwrap = unwrapResult;
  const reqBody = () => ({ faculty: f.key, feeds, rivals, desk: docs });
  const load = async (refresh?: boolean) => {
    setBusy(true);
    try {
      const d = unwrap(await apiPost("/api/v1/research/magazine/observe", { ...reqBody(), ...(refresh ? { refresh: true } : {}) }, { timeoutMs: 180000 }).catch(() => null));
      if (d?.ok) { setObs(d); onIssue?.(d.last_issue?.issue_no ?? 0); }
      else if (!d) setNote("the observatory did not answer — is the BE restarted with the magazine skills?");
    } finally { setBusy(false); }
  };
  React.useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [f.key, feeds.length, (rivals ?? []).length, (docs ?? []).length]);
  const doPress = async () => {
    if (press?.phase === "pressing") return;
    setPress({ phase: "pressing" });
    const d = unwrap(await apiPost("/api/v1/research/magazine/press", reqBody(), { timeoutMs: 240000 }).catch(() => null));
    if (d?.ok) { setPress({ phase: "done", note: `issue Nº${d.issue?.issue_no} pressed`, ai: d.ai ?? null }); await load(); }
    else if (d?.reason === "nothing-new") setPress({ phase: "refused", note: "nothing new to print — the observation hasn't changed since the last issue" });
    else setPress({ phase: "failed", note: `press failed${d?.error ? ` — ${d.error}` : " — did the BE answer?"}` });
  };
  const issue = obs?.last_issue ?? null;
  const ed = issue?.editorial ?? null;
  const stale = !!(issue && obs && issue.observation_hash !== obs.hash);
  // the HERALD prints nothing before the operator declares (2026-07-15:
  // "before the desk dossier is complete, only show this") — the dossier IS
  // the faculty's registry; without it every section would be guesswork
  const needsDossier = f.key === "product" && !!obs && !obs.departments?.product?.dossier;
  const depts = MAG_DEPTS[f.key] ?? [];
  const edd = (key: string) => (ed?.departments ?? []).find((x: any) => x.key === key) ?? null;
  const chip = (txt: React.ReactNode, color: string = C.dim) => <span style={{ fontFamily: mono, fontSize: 8.5, color }}>{txt}</span>;
  const btn2 = (label: string, onClick: any, opts: { disabled?: boolean; title?: string } = {}) => (
    <button onClick={onClick} disabled={opts.disabled} title={opts.title}
      style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: "3px 10px", borderRadius: 8, opacity: opts.disabled ? 0.5 : 1 }}>{label}</button>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* masthead */}
      <div style={{ borderTop: `2px solid ${C.fg}`, borderBottom: `1px solid ${C.border}`, padding: "8px 2px", display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: serif, fontSize: 20, fontWeight: 800, letterSpacing: 1.2, color: C.fg }}>{f.mag}</span>
        {chip(issue ? `issue Nº${issue.issue_no} · pressed ${String(issue.pressed_at ?? "").slice(0, 10)}` : "unpressed — the observation below is live")}
        {stale && chip("the world moved since this issue", C.warn)}
        {obs && chip(`web: ${obs.cached_hits} cached · ${obs.fetched} fetched`)}
        <span style={{ flex: 1 }} />
        {!needsDossier && btn2("🎓 course", () => setCourseOpen(true), { title: "the faculty teaches — the technologies, from their own live docs" })}
        {btn2(busy ? "…" : "↻ re-observe", () => void load(true), { disabled: busy })}
        {!needsDossier && (
          <button onClick={() => void doPress()} disabled={press?.phase === "pressing" || busy || !obs}
            title={issue && !stale ? "nothing new to print — the observation hasn't changed" : "press this issue — ONE transparent AI call, archived immutably"}
            style={{ background: `linear-gradient(120deg, ${tint}, color-mix(in oklab, ${tint} 60%, ${C.brand}))`, border: "none", color: C.bg, cursor: "pointer", fontFamily: mono, fontSize: 9.5, fontWeight: 700, padding: "4px 13px", borderRadius: 8, opacity: press?.phase === "pressing" || !obs ? 0.55 : 1 }}>
            {press?.phase === "pressing" ? "pressing…" : `⚡ press issue Nº${(issue?.issue_no ?? 0) + 1}`}
          </button>
        )}
      </div>
      {/* the dossier gate — the HERALD's whole front until the operator declares */}
      {needsDossier && (
        <div style={{ border: `1px dashed color-mix(in oklab, ${tint} 45%, ${C.border})`, borderRadius: 14, padding: "44px 24px", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center" }}>
          <span style={{ fontSize: 30 }}>📋</span>
          <span style={{ fontFamily: serif, fontSize: 19, fontWeight: 700, color: C.fg, lineHeight: 1.3, maxWidth: "34ch" }}>The HERALD prints nothing it can't ground.</span>
          <span style={{ fontFamily: serif, fontSize: 12, color: C.muted, fontStyle: "italic", lineHeight: 1.6, maxWidth: "52ch" }}>
            For the tech, the world keeps the registries. For the product, <b style={{ color: tint, fontStyle: "normal" }}>you are the registry</b> — ten minutes of declared intention (what it is, for whom, against what, in your market's words) and every section derives from it deterministically.
          </span>
          <button onClick={() => onOpenDossier?.()}
            style={{ background: `linear-gradient(120deg, ${tint}, color-mix(in oklab, ${tint} 60%, ${C.brand}))`, border: "none", color: C.bg, cursor: "pointer", fontFamily: mono, fontSize: 11, fontWeight: 700, padding: "9px 22px", borderRadius: 10 }}>📋 declare the product dossier</button>
        </div>
      )}
      {note && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{note}</span>}
      {!obs && busy && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>observing — the first pull fetches the web; every later open replays from the cache…</span>}
      {/* the front page: the cover only exists once pressed (operator:
          the unpressed placeholder was useless); the rail cards render
          whenever they have something to say */}
      {obs && !needsDossier && (ed?.cover?.headline || (obs?.delta ?? []).length > 0 || (obs?.issues ?? []).length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: ed?.cover?.headline ? "minmax(0, 2.1fr) minmax(0, 1fr)" : "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, alignItems: "start" }}>
          {ed?.cover?.headline && (
            <div style={{ border: `1px solid color-mix(in oklab, ${tint} 40%, ${C.border})`, borderRadius: 12, background: C.panel, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <span style={{ ...dline, color: tint }}>cover story · pressed ⚡{ed.cover.department ? ` · from ${ed.cover.department}` : ""}{stale ? " · aging" : ""}</span>
              <span style={{ fontFamily: serif, fontSize: 24, fontWeight: 800, color: C.fg, lineHeight: 1.2, textWrap: "balance" as any }}>{ed.cover.headline}</span>
              {ed.cover.standfirst && <span style={{ fontFamily: serif, fontSize: 12.5, color: C.muted, fontStyle: "italic", lineHeight: 1.5 }}>{ed.cover.standfirst}</span>}
              {ed.letter_md && (
                <>
                  <div style={{ height: 1, background: `linear-gradient(90deg, ${tint}, transparent)`, opacity: 0.6, margin: "2px 0" }} />
                  <span style={dline}>the editor's letter</span>
                  <div style={{ fontFamily: serif, fontSize: 12, color: C.muted, lineHeight: 1.7, maxWidth: "66ch" }}>{ed.letter_md}</div>
                </>
              )}
            </div>
          )}
          {(!!(obs?.delta ?? []).length || !!(obs?.issues ?? []).length) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              {!!(obs?.delta ?? []).length && (
                <div style={{ border: `1px dashed color-mix(in oklab, ${tint} 45%, ${C.border})`, borderRadius: 10, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ ...dline, color: tint }}>since the last issue</span>
                  {obs.delta.map((l: string, i: number) => <span key={i} style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>· {l}</span>)}
                </div>
              )}
              {!!(obs?.issues ?? []).length && (
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={dline}>back issues</span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {obs.issues.map((it: any) => (
                      <span key={it.issue_no} style={{ fontFamily: mono, fontSize: 8.5, color: it.issue_no === issue?.issue_no ? tint : C.dim, border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 8px" }}>Nº{it.issue_no} · {String(it.pressed_at ?? "").slice(5, 10)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* departments — the reading in the MAIN column, the reference data on
          the compact right RAIL (the ledger lives there, small by request) */}
      {obs && !needsDossier && (() => {
        const render = (dd: any) => {
          const e2 = edd(dd.key);
          const D = obs.departments?.[dd.key];
          return (
            <DeptFrame key={dd.key} d={D} title={dd.title} hint={dd.hint} headline={e2?.headline} caption={e2?.caption} tint={tint}>
              {dd.key === "ledger" ? <DeptLedger d={D} tint={tint} />
                : dd.key === "press" ? <DeptPress d={D} tint={tint} />
                : dd.key === "horizon" ? <DeptHorizon d={D} />
                : dd.key === "wire" ? <DeptWireList d={D} tint={tint} empty="the wire is silent — no derivable release feeds yet; dispatch RSS URLs from the hub below" />
                : dd.key === "notices" ? <DeptNotices d={D} tint={tint} />
                : dd.key === "product" ? <DeptProduct d={D} tint={tint} />
                : dd.key === "rivals" ? <DeptRivals d={D} tint={tint} />
                : <DeptWireList d={D} tint={tint} empty="no field dispatches — declare keywords in the dossier (📋 at the desk) or dispatch feeds" />}
            </DeptFrame>
          );
        };
        const mains = depts.filter((dd) => dd.col === "main");
        const rails = depts.filter((dd) => dd.col === "rail");
        const desks = depts.filter((dd) => dd.col === "desk");
        const spreadD = f.key === "arch" ? obs.departments?.stats : (obs.departments?.rivals ?? obs.departments?.dispatches);
        const e2s = edd("stats");
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: rails.length ? "minmax(0, 2.4fr) minmax(0, 1fr)" : "minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
              {/* main column: the data spread on top, the tech press below */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                <DeptFrame d={spreadD} title="the data spread" hint="the world's numbers on this stack — npm × github × endoflife.date" headline={e2s?.headline} caption={e2s?.caption} tint={tint}>
                  <SpreadBody f={f} obs={obs} />
                </DeptFrame>
                {mains.map(render)}
              </div>
              {rails.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>{rails.map(render)}</div>}
            </div>
            {/* the desk row: the wire beside «feed the desk» */}
            {(desks.length > 0 || desk) && (
              <div style={{ display: "grid", gridTemplateColumns: desks.length && desk ? "minmax(0, 1.4fr) minmax(0, 1fr)" : "minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
                {desks.map(render)}
                {desk && <div style={{ minWidth: 0 }}>{desk}</div>}
              </div>
            )}
          </>
        );
      })()}
      {courseOpen && <CourseOverlay f={f} feeds={feeds} rivals={rivals} docs={docs}
        topics={(() => {
          const D = obs?.departments ?? {};
          const out: string[] = [];
          const push = (n: any) => { const s = String(n ?? "").toLowerCase(); if (s && !out.includes(s)) out.push(s); };
          for (const b of D.press?.blogs ?? []) push(b.tech);
          for (const p of D.horizon?.products ?? []) push(p.product);
          for (const t of D.stats?.techs ?? []) push(t.name?.includes("/") ? t.name.split("/").pop() : t.name);
          for (const r of D.rivals?.rivals ?? []) push(r.name);
          return out.slice(0, 8);
        })()}
        onClose={() => setCourseOpen(false)} />}
      <PressModal open={!!press} title={`🗞 pressing ${f.mag}`} tint={tint} phase={press?.phase} note={press?.note} ai={press?.ai} onClose={() => setPress(null)} />
    </div>
  );
}
