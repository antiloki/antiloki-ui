// EPIC-CODEBASE-DOCS-SITE — the professional documentation screen: a full-screen overlay opened from the
// Docs tab's ⛶ Expand button. 3 panes (folder tree · page · on-this-page), rendered 100% from the
// DETERMINISTIC doc model (code-docs-build): folder overviews + file pages with per-block reference, real
// code samples, colorful role/effect coding, clickable cross-links (uses ⇄ used-by), and per-part [explain]
// (the only AI, opt-in). Self-contained (no import from atlas-decorators) to avoid a render cycle.
import { getRequestWorkspace } from "@/loki/api/client";
import React from "react";
import { createPortal } from "react-dom";
import { C, mono } from "@/loki/theme";
import { docsBuild, docsPage, docsExport, docsOverview, fileRead, explainSnippet, getAtlas } from "@/loki/api/codebase";
import { fmtTokens } from "@/loki/util/tokens";
// the existing diagram + graph, lazy-loaded (a dynamic import breaks the static cycle docs-site ↔ atlas-decorators).
const LazyDiagram = React.lazy(() => import("./atlas-graph").then((m) => ({ default: m.DiagramView })));
const LazyGraph = React.lazy(() => import("./atlas-graph").then((m) => ({ default: m.AtlasGraphMini })));
const LazyGraphOverlay = React.lazy(() => import("./atlas-graph").then((m) => ({ default: m.AtlasGraphOverlay })));
import { Highlighted } from "./highlight";
import { FileReviewBody, fetchFileCon, conTone, type FileCon } from "./atlas-decorators";

// § THE REVIEW — the complete constitution review (the 👁 visual mode by default),
// embedded in the EXPANDED docs site for files AND folders (operator 2026-07-18).
function ConstitutionReview({ path }: { path: string }) {
  const [con, setCon] = React.useState<FileCon | null>(null);
  React.useEffect(() => { let alive = true; setCon(null); if (path) void fetchFileCon(path).then((c) => { if (alive) setCon(c); }); return () => { alive = false; }; }, [path]);
  if (!con?.found) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={sectionH}>§ the {con.is_folder ? "folder" : "file"} review <span style={{ color: conTone(con.health) }}>· health {con.health}</span></div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.panel }}>
        <FileReviewBody con={con} />
      </div>
    </div>
  );
}

const KIND_ICON: Record<string, string> = { component: "⬡", hook: "⎈", function: "ƒ", class: "◆", method: "◇", getter: "◇", setter: "◇", interface: "⬚", enum: "≣", type: "τ", const: "▪" };
const ROLE_COLOR: Record<string, string> = { ui: "oklch(0.64 0.11 38)", state: "oklch(0.72 0.13 300)", data: "oklch(0.72 0.12 200)", logic: "oklch(0.74 0.02 250)", external: "oklch(0.6 0.02 250)", type: "oklch(0.66 0.05 250)" };
const roleColor = (r: string) => ROLE_COLOR[r] ?? C.dim;
const STEP_COLOR: Record<string, string> = { branch: "oklch(0.78 0.12 80)", switch: "oklch(0.78 0.12 80)", case: "oklch(0.7 0.08 80)", loop: "oklch(0.64 0.11 38)", return: "oklch(0.74 0.13 150)", throw: "oklch(0.68 0.16 25)", catch: "oklch(0.68 0.16 25)", try: C.muted, finally: C.muted, set: C.dim, do: C.fg, fn: "oklch(0.72 0.13 300)" };
const baseOf = (p: string) => (p || "").split("/").filter(Boolean).pop() || "/";
// the system theme is mono EVERYWHERE (no react-docs sans-serif) — we keep the structural elegance, not the font.
const sans = mono;

// a clickable cross-reference chip row (uses → / used by →)
function XRefs({ label, links, onNav, color }: any) {
  if (!links?.length) return null;
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "baseline", flexWrap: "wrap", marginTop: 3 }}>
      <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, minWidth: 48 }}>{label}</span>
      {links.map((l: any, i: number) => (
        <button key={i} onClick={() => l.target && onNav(l.target)} disabled={!l.target} title={l.target || "external"}
          style={{ fontFamily: mono, fontSize: 9.5, color: l.target ? (color ?? C.brand) : C.muted, border: `1px solid ${C.border}`, borderRadius: 3, padding: "0 5px", background: C.bg, cursor: l.target ? "pointer" : "default" }}>{l.name}</button>
      ))}
    </div>
  );
}

// one block's full doc entry: header · summary · in/out · effects · logic trace · cross-links · code sample · [explain]
function DocBlock({ d, path, onNav, srcCache }: any) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [showCode, setShowCode] = React.useState(false);
  const [exp, setExp] = React.useState<any>(null);
  const col = roleColor(d.role);
  const sample = async () => {
    setShowCode((s) => !s);
    if (src != null) return;
    let s = srcCache.current.get(path);
    if (s == null) { const r = await fileRead({ path }); s = r?.content ?? ""; srcCache.current.set(path, s); }
    setSrc(s.split("\n").slice(Math.max(0, d.line - 1), d.end_line ?? d.line).join("\n"));
  };
  const explain = async () => {
    setExp({ loading: true });
    let s = srcCache.current.get(path);
    if (s == null) { const r = await fileRead({ path }); s = r?.content ?? ""; srcCache.current.set(path, s); }
    const snippet = s.split("\n").slice(Math.max(0, d.line - 1), d.end_line ?? d.line).join("\n");
    const r = await explainSnippet({ snippet, path, lines: `L${d.line}` });
    setExp(r?.ok && r.explanation ? { text: r.explanation } : { err: r?.error ?? "explain unavailable (provider / key)" });
  };
  return (
    <div id={`blk-${d.name}`} style={{ borderLeft: `3px solid ${col}`, background: C.panel2, borderRadius: "0 8px 8px 0", padding: "12px 17px", margin: "14px 0", scrollMarginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ color: col, fontSize: 13 }}>{KIND_ICON[d.kind] ?? "▪"}</span>
        <code style={{ fontFamily: mono, fontSize: 13, color: C.fg, fontWeight: 600 }}>{d.signature}</code>
        <span style={{ flex: 1 }} />
        {d.flags?.includes("exported") && <span style={{ fontFamily: mono, fontSize: 8, color: C.ok, border: `1px solid ${C.ok}`, borderRadius: 3, padding: "0 4px" }}>public</span>}
        <span style={{ fontFamily: mono, fontSize: 8.5, color: col, textTransform: "uppercase", letterSpacing: 0.5 }}>{d.role}</span>
        <button onClick={() => { try { navigator.clipboard.writeText(`${path}#${d.name}`); } catch (e) { /* */ } }} title="copy a permalink to this block" style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>L{d.line}</button>
      </div>
      <div style={{ fontFamily: sans, fontSize: 12, color: C.dim, marginTop: 5, lineHeight: 1.55 }}>{d.summary}</div>
      {d.inputs?.length ? <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginTop: 2 }}><b style={{ color: C.dim }}>in</b> {d.inputs.map((i: any) => i.name).join(", ")}</div> : null}
      {d.output?.label && d.output.label !== "void" && d.output.kind !== "methods" ? <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginTop: 1 }}><b style={{ color: C.dim }}>out</b> {d.output.label}</div> : null}
      {d.effects?.length ? (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
          {d.effects.map((e: string) => <span key={e} style={{ fontFamily: mono, fontSize: 8.5, color: "oklch(0.78 0.12 80)", border: "1px solid oklch(0.78 0.12 80 / 0.4)", borderRadius: 3, padding: "0 5px" }}>{e}</span>)}
        </div>
      ) : null}
      {d.steps?.length ? (
        <div style={{ marginTop: 5, borderTop: `1px solid ${C.border}`, paddingTop: 4 }}>
          {d.steps.map((s: any, i: number) => (
            <div key={i} title={s.kind} style={{ fontFamily: mono, fontSize: 9.5, lineHeight: 1.55, paddingLeft: 4 + s.depth * 14, color: STEP_COLOR[s.kind] ?? C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.text}</div>
          ))}
        </div>
      ) : null}
      <XRefs label="uses →" links={d.uses} onNav={onNav} color={C.brand} />
      <XRefs label="used by →" links={d.usedBy} onNav={onNav} color={col} />
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button onClick={() => void sample()} style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 3, cursor: "pointer", background: C.bg, border: `1px solid ${C.border}`, color: C.dim }}>{showCode ? "hide code" : "</> code"}</button>
        <button onClick={() => void explain()} disabled={exp?.loading} style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 3, cursor: exp?.loading ? "wait" : "pointer", background: C.bg, border: `1px solid ${C.border}`, color: exp?.loading ? C.muted : col }}>{exp?.loading ? "explaining…" : "✦ explain"}</button>
      </div>
      {showCode && src != null && (
        <div style={{ marginTop: 7, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", background: C.bg }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 10px", background: C.panel, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>{baseOf(path)} · L{d.line}–{d.end_line ?? d.line}</span>
            <span style={{ flex: 1 }} />
            <button onClick={() => { try { navigator.clipboard.writeText(src); } catch (e) { /* */ } }} style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, background: "none", border: "none", cursor: "pointer" }}>copy</button>
          </div>
          <div style={{ padding: "8px 4px", overflow: "auto", maxHeight: 360 }}><Highlighted code={src} fontSize={11} lineHeight={1.6} lineNumW={42} pad={12} /></div>
        </div>
      )}
      {(exp?.text || exp?.err) && <div style={{ marginTop: 5, padding: "6px 9px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 10.5, color: exp?.text ? C.fg : C.muted, fontFamily: exp?.text ? undefined : mono, lineHeight: 1.5 }}>{exp?.text ?? exp?.err}</div>}
    </div>
  );
}

const Crumbs = ({ page, onNav }: any) => (
  <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginBottom: 6 }}>
    <button onClick={() => onNav("dir:")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: 0 }}>/</button>
    {page.breadcrumb?.map((c: any, i: number) => (
      <span key={i}>{" › "}<button onClick={() => onNav(i === page.breadcrumb.length - 1 && page.kind === "file" ? page.path : "dir:" + c.path)} style={{ background: "none", border: "none", color: i === page.breadcrumb.length - 1 ? C.dim : C.muted, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: 0 }}>{c.seg}</button></span>
    ))}
  </div>
);

const ENTRY_LABEL: Record<string, string> = { route: "Routes", data: "Data access", ui: "UI surface" };
const ENTRY_HUE: Record<string, string> = { route: "oklch(0.72 0.12 200)", data: "oklch(0.74 0.13 150)", ui: "oklch(0.64 0.11 38)" };
// the deterministic didactic sections — semantic intro · external surface · data structures · data flows
// an "Overview" callout (the React-docs YouWillLearn box) — the page's deterministic TL;DR
const Intro = ({ text }: any) => (text ? <div style={{ background: C.panel2, borderLeft: `3px solid ${C.brand}`, borderRadius: "0 8px 8px 0", padding: "10px 15px", margin: "2px 0 18px", maxWidth: 740 }}><div style={{ fontFamily: mono, fontSize: 8, color: C.brand, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 5 }}>Overview</div><div style={{ fontFamily: sans, fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>{text}</div></div> : null);
// at-a-glance concept mix (State / I/O / Rendering / Pure logic / Types) — a scannable chip row
const CONCEPT_HUE: Record<string, string> = { Rendering: "oklch(0.64 0.11 38)", State: "oklch(0.72 0.13 300)", "Data / I/O": "oklch(0.72 0.12 200)", "Pure logic": C.muted, Logic: C.dim, Types: "oklch(0.66 0.05 250)" };
const Concepts = ({ concepts }: any) => { const e = Object.entries(concepts || {}).filter(([, n]: any) => n).sort((a: any, b: any) => (b[1] as number) - (a[1] as number)); return e.length ? <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 16 }}>{e.map(([k, n]: any) => <span key={k} style={{ fontFamily: mono, fontSize: 9, color: CONCEPT_HUE[k] || C.dim, border: `1px solid ${CONCEPT_HUE[k] || C.border}`, borderRadius: 10, padding: "1px 9px" }}>{k} · {n}</span>)}</div> : null; };
function Surface({ entryPoints }: any) {
  if (!entryPoints?.length) return null;
  const byKind: any = {}; for (const e of entryPoints) (byKind[e.kind] = byKind[e.kind] || []).push(e);
  return (<><div style={sectionH}>External surface</div><div style={{ marginBottom: 14 }}>
    {Object.entries(byKind).map(([k, list]: any) => (
      <div key={k} style={{ marginBottom: 9 }}>
        <div style={{ fontFamily: mono, fontSize: 9, color: ENTRY_HUE[k] || C.fg, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.6 }}>{ENTRY_LABEL[k] || k} · {list.length}</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {list.slice(0, 24).map((e: any, i: number) => <span key={i} style={{ fontFamily: mono, fontSize: 9, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 3, padding: "1px 6px", background: C.bg }}>{e.http_method ? <b style={{ color: ENTRY_HUE[k] || C.brand }}>{e.http_method} </b> : null}{e.label}</span>)}
          {list.length > 24 ? <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, alignSelf: "center" }}>+{list.length - 24}</span> : null}
        </div>
      </div>
    ))}
  </div></>);
}
function DataStructures({ items, onNav }: any) {
  if (!items?.length) return null;
  return (<><div style={sectionH}>Data structures</div><div style={{ marginBottom: 14 }}>
    {items.map((t: any, i: number) => <button key={i} onClick={() => onNav(t.target)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, padding: "5px 2px", cursor: "pointer" }}><code style={{ fontFamily: mono, fontSize: 10.5, color: "oklch(0.66 0.05 250)" }}>{KIND_ICON[t.kind] ?? "τ"} {t.name}</code> <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>{t.shape}</span></button>)}
  </div></>);
}
function Flows({ stories }: any) {
  const [open, setOpen] = React.useState(false);
  if (!stories?.length) return null;
  return (<><CollapHead open={open} set={setOpen} title="Data flows" sub={stories.length} />{open ? <div style={{ marginTop: 8, marginBottom: 14 }}>
    {stories.map((s: any, i: number) => <div key={i} style={{ marginBottom: 7 }}><div style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{s.name}{s.direction ? <span style={{ color: C.muted }}> · {s.direction}</span> : null}</div>{s.hops?.length ? <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, marginTop: 1 }}>{s.hops.join(" → ")}</div> : null}{s.description ? <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, marginTop: 1 }}>{s.description}</div> : null}</div>)}
  </div> : null}</>);
}

// Architecture — depends-on / used-by (clickable) + the reading order. Reused on folder AND file pages.
function Arch({ dependsOn, usedBy, readingOrder, onNav }: any) {
  if (!dependsOn?.length && !usedBy?.length && !readingOrder?.length) return null;
  const navTo = (d: string) => (/\.[a-zA-Z]+$/.test(d) ? d : "dir:" + d.replace("(root)", ""));
  const chips = (arr: string[], color: string) => arr.slice(0, 16).map((d, i) => <button key={i} onClick={() => onNav(navTo(d))} title={d} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color, cursor: "pointer", fontFamily: mono, fontSize: 9.5, padding: "0 6px", margin: "0 3px 3px 0" }}>{baseOf(d) || "root"}</button>);
  return (<><div style={sectionH}>Architecture</div><div style={{ marginBottom: 14, fontFamily: mono, fontSize: 10 }}>
    {dependsOn?.length ? <div style={{ marginBottom: 5 }}><span style={{ color: C.muted, marginRight: 4 }}>depends on</span>{chips(dependsOn, C.brand)}</div> : null}
    {usedBy?.length ? <div style={{ marginBottom: 5 }}><span style={{ color: C.muted, marginRight: 4 }}>used by</span>{chips(usedBy, "oklch(0.74 0.13 150)")}</div> : null}
    {readingOrder?.length ? <div><span style={{ color: C.muted, marginRight: 4 }}>read in order</span>{readingOrder.slice(0, 10).map((r: any, i: number) => <React.Fragment key={i}>{i ? <span style={{ color: C.border }}> → </span> : null}<button onClick={() => onNav(r.path)} style={{ background: "none", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: 0 }}>{r.name}</button></React.Fragment>)}</div> : null}
  </div></>);
}

// Codebase health — the digest + insights (whole-codebase, language-agnostic), shown on the root overview.
function Digest({ d, ins }: any) {
  if (!d) return null;
  const num = (v: any) => (v == null ? "—" : v);
  const score = (v: number) => (v >= 70 ? C.ok : v >= 45 ? C.warn : "oklch(0.68 0.16 25)");
  const langs = d.languages && typeof d.languages === "object" ? Object.entries(d.languages).sort((a: any, b: any) => (b[1] as number) - (a[1] as number)) : [];
  const list = (arr: any[], label: string) => (arr?.length ? <div style={{ marginTop: 6 }}><span style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span> <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{arr.slice(0, 8).map((x: any) => x?.name || (typeof x?.path === "string" ? x.path.split("/").pop() : null) || x?.label || String(x)).join(", ")}</span></div> : null);
  return (<><div style={sectionH}>Codebase health</div><div style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontFamily: mono, fontSize: 11, alignItems: "baseline" }}>
      <span style={{ color: C.muted }}>health <b style={{ color: score(d.health), fontSize: 15 }}>{num(d.health)}</b></span>
      <span style={{ color: C.muted }}>risk <b style={{ color: score(100 - (d.risk ?? 0)), fontSize: 15 }}>{num(d.risk)}</b></span>
      <span style={{ color: C.dim }}>{num(d.files)} files</span><span style={{ color: C.dim }}>{num(d.loc)} LOC</span>
      <span style={{ color: C.dim }}>coverage {num(d.coverage_pct)}%</span><span style={{ color: C.dim }}>{num(d.cycles)} cycles</span><span style={{ color: C.dim }}>{num(d.smells_total)} smells</span>
    </div>
    {langs.length ? <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 7 }}>{langs.map(([k, n]: any) => <span key={k} style={{ fontFamily: mono, fontSize: 9, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 3, padding: "0 6px" }}>{k} {n}</span>)}</div> : null}
    {list(d.hubs, "hubs")}
    {list(d.top_complex, "most complex")}
    {ins?.vulns?.length ? <div style={{ marginTop: 6, fontFamily: mono, fontSize: 10, color: "oklch(0.68 0.16 25)" }}>⚠ {ins.vulns.length} vulnerabilit{ins.vulns.length === 1 ? "y" : "ies"}</div> : null}
    {d.narrative ? <div style={{ marginTop: 8 }}><MD text={d.narrative} /></div> : null}
    {ins?.review ? <div style={{ marginTop: 8 }}><MD text={ins.review} /></div> : null}
  </div></>);
}
// Blast radius — the DETERMINISTIC reverse-dependency impact, computed with the doc (no click). Rendered inline.
function BlastInfo({ blast }: any) {
  if (!blast || !blast.count) return null;
  return (<><div style={sectionH}>Blast radius</div><div style={{ marginBottom: 14, fontFamily: mono, fontSize: 10, color: C.dim }}>
    Changing this affects <b style={{ color: C.warn }}>{blast.count}</b> file{blast.count === 1 ? "" : "s"} (transitively).
    {blast.files?.length ? <div style={{ marginTop: 4, color: C.muted, fontSize: 9.5 }}>{blast.files.slice(0, 16).map((p: string) => baseOf(p)).join(", ")}{blast.count > Math.min(16, blast.files.length) ? ` +${blast.count - Math.min(16, blast.files.length)}` : ""}</div> : null}
  </div></>);
}

// design patterns (file = detected list w/ evidence on hover · folder = census) + the codebase identity & standards.
function Patterns({ patterns, census }: any) {
  const [open, setOpen] = React.useState(false);
  const items = patterns?.length ? patterns.map((p: any) => ({ label: p.pattern, n: null as any, title: `${p.confidence} · ${p.evidence}` }))
    : (census && Object.keys(census).length ? Object.entries(census).sort((a: any, b: any) => (b[1] as number) - (a[1] as number)).map(([p, n]: any) => ({ label: p, n, title: "" })) : []);
  if (!items.length) return null;
  return (<><CollapHead open={open} set={setOpen} title="Design patterns" sub={items.length} />{open ? <div style={{ display: "flex", gap: 5, flexWrap: "wrap", margin: "8px 0 14px" }}>
    {items.map((it: any, i: number) => <span key={i} title={it.title} style={{ fontFamily: mono, fontSize: 9.5, color: "oklch(0.72 0.13 300)", border: "1px solid oklch(0.72 0.13 300 / 0.4)", borderRadius: 10, padding: "1px 9px", cursor: it.title ? "help" : "default" }}>{it.label}{it.n ? ` ×${it.n}` : ""}</span>)}
  </div> : null}</>);
}
function CodeIdentity({ page }: any) {
  const [open, setOpen] = React.useState(false);
  if (!page?.identity && !page?.conventions?.naming?.length) return null;
  return (<>
    <CollapHead open={open} set={setOpen} title="Code identity & standards" sub={page.conventions?.naming?.length ? `${page.conventions.naming.length} conventions` : ""} />
    {open ? <div style={{ marginTop: 8 }}>
    {page.identity ? <div style={{ fontFamily: sans, fontSize: 13, color: C.dim, lineHeight: 1.7, marginBottom: 12, maxWidth: 740 }}>{page.identity}</div> : null}
    {page.conventions?.naming?.length ? <div style={{ marginBottom: 12 }}>{page.conventions.naming.map((n: any, i: number) => <div key={i} style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginBottom: 2 }}><span style={{ color: C.muted, display: "inline-block", width: 94 }}>{n.subject}</span><b style={{ color: C.fg }}>{n.convention}</b> <span style={{ color: n.adherence >= 80 ? C.ok : C.warn }}>{n.adherence}%</span>{n.mix?.length > 1 ? <span style={{ color: C.muted }}> · {n.mix.join(", ")}</span> : null}</div>)}</div> : null}
    </div> : null}
  </>);
}

// the RIGHT SIDEBAR (3rd column): on-this-page nav + Public API + Data structures, each with a plain-English note.
function RailSection({ title, note, children }: any) {
  return <div style={{ marginBottom: 16 }}>
    <div style={{ fontFamily: mono, fontSize: 8.5, color: C.brand, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3, fontWeight: 600 }}>{title}</div>
    {note ? <div style={{ fontFamily: sans, fontSize: 9.5, color: C.muted, lineHeight: 1.45, marginBottom: 6 }}>{note}</div> : null}
    {children}
  </div>;
}
function RightRail({ page, onNav }: any) {
  if (!page) return null;
  const onPage = page.kind === "file" && page.toc?.length;
  if (!onPage && !page.publicSurface?.length && !page.dataStructures?.length) return null;
  const link = (color: string) => ({ display: "block", width: "100%", textAlign: "left" as const, background: "none", border: "none", padding: "2px 0", cursor: "pointer", fontFamily: mono, fontSize: 9.5, color, whiteSpace: "nowrap" as const, overflow: "hidden" as const, textOverflow: "ellipsis" as const });
  return (
    <div style={{ width: 212, borderLeft: `1px solid ${C.border}`, overflow: "auto", background: C.panel, padding: "16px 12px" }}>
      {onPage ? <RailSection title="on this page">{page.toc.map((sec: any) => <div key={sec.group} style={{ marginBottom: 6 }}><div style={{ fontFamily: mono, fontSize: 9, color: C.dim, marginBottom: 2 }}>{sec.group}</div>{sec.items.map((it: any) => <button key={it.name} onClick={() => document.getElementById(`blk-${it.name}`)?.scrollIntoView({ behavior: "smooth", block: "start" })} style={link(C.muted)}>{it.name}</button>)}</div>)}</RailSection> : null}
      {page.publicSurface?.length ? <RailSection title="Public API" note="What this exposes for the rest of the code to import.">{page.publicSurface.slice(0, 50).map((s: any, i: number) => <button key={i} onClick={() => onNav(s.target)} title={s.summary} style={link(C.brand)}>{KIND_ICON[s.kind] ?? "▪"} {s.name}</button>)}</RailSection> : null}
      {page.dataStructures?.length ? <RailSection title="Data structures" note="The data shapes — interfaces / types / enums — defined here. Click for the full shape.">{page.dataStructures.slice(0, 50).map((t: any, i: number) => <button key={i} onClick={() => onNav(t.target)} title={t.shape} style={link("oklch(0.66 0.05 250)")}>{KIND_ICON[t.kind] ?? "τ"} {t.name}</button>)}</RailSection> : null}
    </div>
  );
}

// every score is self-explaining: CRITERIA (what it measures + the formula + the grade bands) + PROOF (the actual
// values that produced this score, step by step). No opaque grades — for the human AND for AI reading the doc.
function ScoreProof({ e, grade }: any) {
  if (!e) return null;
  return <div style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: "11px 13px", marginBottom: 14, background: C.panel, maxWidth: 760 }}>
    <div style={{ fontFamily: mono, fontSize: 9, color: C.brand, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Criteria — {e.metric}</div>
    {e.criteria ? <div style={{ fontFamily: sans, fontSize: 11.5, color: C.dim, lineHeight: 1.5, marginBottom: 6 }}>{e.criteria}</div> : null}
    <div style={{ fontFamily: mono, fontSize: 10, color: C.fg, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "5px 8px", marginBottom: 9 }}>{e.formula}</div>
    <div style={{ fontFamily: mono, fontSize: 9, color: C.brand, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Proof — measured from this {e.scope}</div>
    <div style={{ marginBottom: 9 }}>{(e.steps || []).map((s: string, i: number) => <div key={i} style={{ fontFamily: mono, fontSize: 10, color: i === e.steps.length - 1 ? C.fg : C.dim, paddingLeft: 8 }}>{i === e.steps.length - 1 ? "→ " : "· "}{s}</div>)}</div>
    <div style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, marginBottom: 9 }}>{e.verdict}</div>
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{(e.bands || []).map((b: any) => <span key={b.grade} title={b.label} style={{ fontFamily: mono, fontSize: 8.5, padding: "1px 7px", borderRadius: 8, border: `1px solid ${b.grade === grade ? C.brand : C.border}`, color: b.grade === grade ? C.brand : C.muted, background: b.grade === grade ? C.panel2 : "transparent", fontWeight: b.grade === grade ? 700 : 400 }}>{b.grade} ≥ {b.min} · {b.label}</span>)}</div>
  </div>;
}

// deterministic SCORE + STATS for a file/folder: SEI Maintainability Index → letter grade, + raw stats.
function Metrics({ m, blast }: any) {
  const [why, setWhy] = React.useState(false);
  if (!m) return null;
  const gColor = m.grade === "A" ? C.ok : m.grade === "B" ? "oklch(0.74 0.13 150)" : m.grade === "C" ? C.warn : "oklch(0.68 0.16 25)";
  const stat = (label: string, val: any) => <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}><span style={{ color: C.muted }}>{label}</span> {val}</span>;
  return (<><div style={sectionH}>Metrics &amp; score</div><div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline", marginBottom: why ? 6 : 14 }}>
    <span style={{ fontFamily: mono, fontSize: 11, color: C.muted }} title="Maintainability Index (cyclomatic complexity + size) → letter grade — deterministic">maintainability <b style={{ color: gColor, fontSize: 16 }}>{m.grade}</b> <span style={{ color: gColor }}>{m.mi}/100</span></span>
    {m.scoreExplain ? <button onClick={() => setWhy((w) => !w)} title="show the criteria + the values that produced this score" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: mono, fontSize: 9.5, color: C.brand, padding: 0 }}>{why ? "▾ hide criteria" : "▸ why this score?"}</button> : null}
    {m.files != null ? stat("files", m.files) : null}
    {stat("LOC", m.loc)}{stat("blocks", m.blocks)}
    {stat("complexity", `${m.avgComplexity} avg · ${m.maxComplexity} max`)}
    {m.fanIn != null ? stat("fan-in", m.fanIn) : null}{m.fanOut != null ? stat("fan-out", m.fanOut) : null}
    {blast?.count ? stat("blast", blast.count) : null}{stat("exported", m.exported)}
  </div>{why && m.scoreExplain ? <ScoreProof e={m.scoreExplain} grade={m.grade} /> : null}</>);
}

// a file's REAL diagram (its INTERNALS via focusPath) + the graph of its folder NEIGHBORHOOD.
function FileViews({ atlas, path }: any) {
  const [view, setView] = React.useState<"diagram" | "graph">("diagram");
  const [expanded, setExpanded] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  if (!atlas?.nodes?.length) return null;
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const tab = (on: boolean): React.CSSProperties => ({ fontFamily: mono, fontSize: 9.5, padding: "2px 9px", borderRadius: 4, cursor: "pointer", background: on ? C.panel2 : C.bg, border: `1px solid ${on ? C.brand : C.border}`, color: on ? C.brand : C.dim });
  return (<><CollapHead open={open} set={setOpen} title="Diagram & graph" sub="internals + neighborhood" />
    {open ? <>
    <div style={{ display: "flex", gap: 5, margin: "8px 0 6px" }}>
      <button onClick={() => setView("diagram")} style={tab(view === "diagram")}>diagram (internals)</button>
      <button onClick={() => setView("graph")} style={tab(view === "graph")}>graph (neighborhood)</button>
    </div>
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", marginBottom: 14, background: C.bg }}>
      <React.Suspense fallback={<div style={{ padding: 18, fontFamily: mono, fontSize: 11, color: C.muted }}>loading view…</div>}>
        {view === "diagram" ? <LazyDiagram atlas={atlas} focusPath={path} height={440} /> : <LazyGraph atlas={atlas} initialDir={dir} height={440} controls onMaximize={() => setExpanded(true)} />}
      </React.Suspense>
    </div>
    {expanded ? <React.Suspense fallback={null}><LazyGraphOverlay atlas={atlas} initialDir={dir} onClose={() => setExpanded(false)} /></React.Suspense> : null}
    </> : null}
  </>);
}

// the REAL diagram + graph (reused as-is, scoped to this folder via initialDir) — same drill/marquee/zoom.
function FolderViews({ atlas, dir }: any) {
  const [view, setView] = React.useState<"diagram" | "graph">("diagram");
  const [expanded, setExpanded] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  if (!atlas?.nodes?.length) return null;
  const tab = (on: boolean): React.CSSProperties => ({ fontFamily: mono, fontSize: 9.5, padding: "2px 9px", borderRadius: 4, cursor: "pointer", background: on ? C.panel2 : C.bg, border: `1px solid ${on ? C.brand : C.border}`, color: on ? C.brand : C.dim });
  return (<><CollapHead open={open} set={setOpen} title="Diagram & graph" />
    {open ? <>
    <div style={{ display: "flex", gap: 5, margin: "8px 0 6px" }}>
      <button onClick={() => setView("diagram")} style={tab(view === "diagram")}>diagram</button>
      <button onClick={() => setView("graph")} style={tab(view === "graph")}>graph</button>
    </div>
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", marginBottom: 14, background: C.bg }}>
      <React.Suspense fallback={<div style={{ padding: 18, fontFamily: mono, fontSize: 11, color: C.muted }}>loading view…</div>}>
        {view === "diagram" ? <LazyDiagram atlas={atlas} initialDir={dir} height={440} /> : <LazyGraph atlas={atlas} initialDir={dir} height={440} controls onMaximize={() => setExpanded(true)} />}
      </React.Suspense>
    </div>
    {expanded ? <React.Suspense fallback={null}><LazyGraphOverlay atlas={atlas} initialDir={dir} onClose={() => setExpanded(false)} /></React.Suspense> : null}
    </> : null}
  </>);
}

function FolderPage({ page, onNav, atlas }: any) {
  const kinds = Object.entries(page.stats.byKind || {}).sort((a: any, b: any) => b[1] - a[1]);
  return (
    <div>
      <Crumbs page={page} onNav={onNav} />
      <h1 style={{ fontFamily: sans, fontWeight: 700, fontSize: 26, color: C.fg, margin: "0 0 6px", letterSpacing: -0.4 }}>{baseOf(page.path)}<span style={{ color: C.muted, fontWeight: 400 }}>/</span></h1>
      <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, marginBottom: 12 }}>{page.stats.files} files · {page.stats.blocks} blocks</div>
      <Intro text={page.intro} />
      <Concepts concepts={page.concepts} />
      {page.description ? <div style={{ fontFamily: sans, fontSize: 13, color: C.dim, lineHeight: 1.7, marginBottom: 16, maxWidth: 720 }}>{page.description}</div> : null}
      <Digest d={page.digest} ins={page.insights} />
      <Snapshot path={page.path} />
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 16 }}>
        {kinds.map(([k, n]: any) => <span key={k} style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 7px" }}><span style={{ color: C.brand }}>{KIND_ICON[k] ?? "▪"}</span> {n} {k}</span>)}
      </div>
      <Metrics m={page.metrics} />
      <Arch dependsOn={page.dependsOn} usedBy={page.usedBy} readingOrder={page.readingOrder} onNav={onNav} />
      <FolderViews atlas={atlas} dir={page.path} />
      <ConstitutionReview path={page.path} />
      <Surface entryPoints={page.entryPoints} />
      <Patterns census={page.patternCensus} />
      <Flows stories={page.stories} />
      <div style={sectionH}>Contents</div>
      {page.subfolders?.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 7, marginBottom: 12 }}>
        {page.subfolders.map((s: any) => <button key={s.path} onClick={() => onNav("dir:" + s.path)} style={{ textAlign: "left", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 5, padding: "7px 10px", cursor: "pointer" }}><div style={{ fontFamily: mono, fontSize: 11, color: C.fg }}>{s.name}/</div><div style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{s.files} files</div></button>)}
      </div> : null}
      {page.files?.length ? <div style={{ marginBottom: 10 }}>{page.files.map((f: any) => <button key={f.path} onClick={() => onNav(f.path)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "3px 2px", cursor: "pointer", fontFamily: mono, fontSize: 10.5, color: C.dim }}>📄 {f.name} <span style={{ color: C.muted }}>· {f.blocks}</span></button>)}</div> : null}
    </div>
  );
}

function FilePage({ page, onNav, srcCache, atlas }: any) {
  return (
    <div>
      <Crumbs page={page} onNav={onNav} />
      <h1 style={{ fontFamily: sans, fontWeight: 700, fontSize: 24, color: C.fg, margin: "0 0 8px", letterSpacing: -0.4 }}>{baseOf(page.path)}</h1>
      <Intro text={page.intro} />
      <Concepts concepts={page.concepts} />
      <Metrics m={page.metrics} blast={page.blastRadius} />
      <div style={{ fontFamily: sans, fontSize: 13.5, color: C.dim, lineHeight: 1.7, marginBottom: 18, whiteSpace: "pre-wrap", maxWidth: 720 }}>{page.narrative.essay || page.narrative.fallback}</div>
      <Surface entryPoints={page.entryPoints} />
      <Patterns patterns={page.patterns} />
      <Arch dependsOn={page.dependsOn} usedBy={page.usedBy} onNav={onNav} />
      <BlastInfo blast={page.blastRadius} />
      <FileViews atlas={atlas} path={page.path} />
      <ConstitutionReview path={page.path} />
      <Snapshot path={page.path} />
      {page.toc.map((sec: any) => (
        <div key={sec.group} id={`sec-${sec.group}`} style={{ marginBottom: 10 }}>
          <div style={sectionH}>{sec.group} <span style={{ color: C.muted }}>· {sec.items.length}</span></div>
          {sec.items.map((it: any) => { const d = page.blocks.find((b: any) => b.name === it.name); return d ? <DocBlock key={it.name} d={d} path={page.path} onNav={onNav} srcCache={srcCache} /> : null; })}
        </div>
      ))}
    </div>
  );
}

const sectionH: React.CSSProperties = { fontFamily: mono, fontSize: 10, color: C.brand, textTransform: "uppercase", letterSpacing: 1.2, margin: "22px 0 10px", borderBottom: `1px solid ${C.border}`, paddingBottom: 4, fontWeight: 600 };
const hdrBtn: React.CSSProperties = { fontFamily: mono, fontSize: 10, padding: "3px 9px", borderRadius: 5, cursor: "pointer", background: C.bg, border: `1px solid ${C.border}`, color: C.dim };
const navBtn = (on: boolean): React.CSSProperties => ({ fontFamily: mono, fontSize: 10.5, padding: "5px 11px", borderRadius: 5, cursor: on ? "pointer" : "default", background: C.panel2, border: `1px solid ${C.border}`, color: on ? C.brand : C.muted });
// a collapsible section header (▸/▾ + title + a count, so a collapsed section still shows its gist). No info dropped.
function CollapHead({ open, set, title, sub }: any) {
  return <button onClick={() => set((o: boolean) => !o)} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, padding: "4px 0", margin: "20px 0 0", cursor: "pointer" }}>
    <span style={{ color: C.muted, fontSize: 9 }}>{open ? "▾" : "▸"}</span>
    <span style={{ fontFamily: mono, fontSize: 10, color: C.brand, textTransform: "uppercase", letterSpacing: 1.1, fontWeight: 600 }}>{title}</span>
    {sub != null && sub !== "" ? <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>· {sub}</span> : null}
  </button>;
}

function TreeNode({ node, sel, onSel, depth }: any) {
  const [open, setOpen] = React.useState(depth < 1);
  if (node.type === "file") {
    const on = sel === node.path;
    return <div onClick={() => onSel(node.path)} style={{ paddingLeft: 8 + depth * 12, fontFamily: mono, fontSize: 10.5, color: on ? C.brand : C.dim, background: on ? C.panel2 : "transparent", cursor: "pointer", padding: "2px 0 2px " + (8 + depth * 12) + "px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📄 {node.name}</div>;
  }
  const on = sel === "dir:" + node.path;
  return (
    <div>
      <div onClick={() => { setOpen(!open); onSel("dir:" + node.path); }} style={{ paddingLeft: 8 + depth * 12, fontFamily: mono, fontSize: 10.5, color: on ? C.brand : C.fg, background: on ? C.panel2 : "transparent", cursor: "pointer", padding: "2px 0 2px " + (8 + depth * 12) + "px", whiteSpace: "nowrap" }}>{open ? "▾" : "▸"} {node.name}</div>
      {open && node.children?.map((c: any, i: number) => <TreeNode key={i} node={c} sel={sel} onSel={onSel} depth={depth + 1} />)}
    </div>
  );
}

// AI SNAPSHOT — a cached code-review overview at any scope (folder/file). Cached-on-open (free), generate-on-click.
function Snapshot({ path, origin = "atlas", label = "AI snapshot" }: any) {
  const [ov, setOv] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  // never cached — always generated fresh on click, so the snapshot is never stale.
  const gen = async () => { setBusy(true); try { const r: any = await docsOverview({ origin, path }); const md = typeof r?.overview_md === "string" ? r.overview_md : (typeof r?.result?.overview_md === "string" ? r.result.overview_md : null); setOv(md ?? { error: r?.error ?? r?.result?.error ?? "no response" }); } finally { setBusy(false); } };
  const md = typeof ov === "string" ? ov : null;
  return (<>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, marginBottom: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>
      <span style={{ fontFamily: mono, fontSize: 10, color: C.brand, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600 }}>{label}</span><span style={{ flex: 1 }} />
      <button onClick={() => void gen()} disabled={busy} style={{ ...hdrBtn, fontSize: 9 }}>{busy ? "generating…" : md ? "↻ regenerate" : "✦ generate"}</button>
    </div>
    {busy && !md ? <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>synthesizing…</div>
      : md ? <MD text={md} />
      : <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted }}>No snapshot yet — <b style={{ color: C.brand }}>✦ generate</b> an AI summary (one cached call).{ov?.error ? <span style={{ color: C.warn }}> ({ov.error})</span> : null}</div>}
  </>);
}

// inline markdown: **bold** · `code` · *italic* → React nodes (system mono theme).
function inline(text: string) {
  const out: any[] = []; let rest = String(text); let k = 0;
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/;
  while (rest.length) {
    const m = re.exec(rest);
    if (!m) { out.push(rest); break; }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    if (m[2] != null) out.push(<b key={k++} style={{ color: C.fg, fontWeight: 700 }}>{m[2]}</b>);
    else if (m[3] != null) out.push(<code key={k++} style={{ fontFamily: mono, fontSize: "0.92em", color: C.brand, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, padding: "0 4px" }}>{m[3]}</code>);
    else if (m[4] != null) out.push(<i key={k++} style={{ color: C.fg }}>{m[4]}</i>);
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}
// a proper, beautiful markdown renderer for the AI overview — headers (3 levels) · ordered/unordered lists ·
// inline bold/code/italic · prose. System mono theme, no external deps.
function MD({ text }: any) {
  if (!text) return null;
  const out: any[] = [];
  String(text).split("\n").forEach((ln: string, i: number) => {
    const t = ln.trim();
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      const lvl = h[1].length;
      if (lvl <= 2) out.push(<div key={i} style={{ fontFamily: mono, fontSize: 10, color: C.brand, textTransform: "uppercase", letterSpacing: 1.1, fontWeight: 600, margin: i ? "20px 0 8px" : "2px 0 8px", borderBottom: `1px solid ${C.border}`, paddingBottom: 3 }}>{inline(h[2])}</div>);
      else out.push(<div key={i} style={{ fontFamily: sans, fontSize: 13, color: C.fg, fontWeight: 700, margin: "13px 0 4px" }}>{inline(h[2])}</div>);
      return;
    }
    const ul = /^[-*+]\s+(.*)$/.exec(t);
    if (ul) { out.push(<div key={i} style={{ fontFamily: sans, fontSize: 12.5, color: C.dim, lineHeight: 1.6, paddingLeft: 18, marginBottom: 3, position: "relative" }}><span style={{ position: "absolute", left: 5, color: C.brand }}>•</span>{inline(ul[1])}</div>); return; }
    const ol = /^(\d+)\.\s+(.*)$/.exec(t);
    if (ol) { out.push(<div key={i} style={{ fontFamily: sans, fontSize: 12.5, color: C.dim, lineHeight: 1.6, paddingLeft: 22, marginBottom: 3, position: "relative" }}><span style={{ position: "absolute", left: 2, color: C.brand, fontFamily: mono, fontSize: 10.5 }}>{ol[1]}.</span>{inline(ol[2])}</div>); return; }
    if (!t) { out.push(<div key={i} style={{ height: 8 }} />); return; }
    out.push(<div key={i} style={{ fontFamily: sans, fontSize: 12.5, color: C.dim, lineHeight: 1.65, marginBottom: 4 }}>{inline(t)}</div>);
  });
  return <div style={{ maxWidth: 760 }}>{out}</div>;
}

// the DASHBOARD — the docs landing: deterministic health cards + dimensions + the cached AI code-review overview.
// one site BUILD per origin per app-life — the docs tab's dashboard and the ⛶ site share it, so
// whichever loads first pays and the other opens instantly. force=true refetches (the ↻ retry).
const SITE_CACHE = new Map<string, any>();
const SITE_INFLIGHT = new Map<string, Promise<any | null>>();
// KEYED BY SPACE AS WELL (operator 2026-11-10, X-ray across spaces): the cache said "atlas" for every workspace, so the dashboard of the space left a moment ago was handed to the one just chosen.
export const siteCacheKey = (origin: string, space: string | null = getRequestWorkspace()) => `${space ?? ""}\u0000${origin}`;
export function getDocsSiteCached(origin: string, force = false): Promise<any | null> {
  const key = siteCacheKey(origin);
  if (!force && SITE_CACHE.has(key)) return Promise.resolve(SITE_CACHE.get(key));
  const inflight = SITE_INFLIGHT.get(key);
  if (!force && inflight) return inflight;
  const p = docsBuild({ origin, with_tokens: true })
    .then((site) => { SITE_INFLIGHT.delete(key); if (site) SITE_CACHE.set(key, site); return site; })
    .catch(() => { SITE_INFLIGHT.delete(key); return null; });
  SITE_INFLIGHT.set(key, p);
  return p;
}

export function Dashboard({ site, origin, atlas }: any) {
  const root = site?.pages?.["dir:"] || {};
  const g = root.digest || {};
  const num = (v: any) => (v == null ? "—" : v);
  const score = (v: number) => (v >= 70 ? C.ok : v >= 45 ? C.warn : "oklch(0.68 0.16 25)");
  const langs = g.languages && typeof g.languages === "object" ? Object.entries(g.languages).sort((a: any, b: any) => (b[1] as number) - (a[1] as number)) : [];
  const components = (site?.index || []).filter((e: any) => e.kind === "component").slice(0, 18);
  const [ov, setOv] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const loadOv = React.useCallback(async () => { setBusy(true); try { const r: any = await docsOverview({ origin }); setOv(typeof r?.overview_md === "string" ? r.overview_md : (typeof r?.result?.overview_md === "string" ? r.result.overview_md : { error: r?.error ?? r?.result?.error ?? null })); } finally { setBusy(false); } }, [origin]);
  const ovMd = typeof ov === "string" ? ov : null;
  const ins = root.insights || {};
  const dlist = (label: string, arr: any[]) => (arr?.length ? <div key={label} style={{ marginBottom: 4 }}><span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span> <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{arr.slice(0, 10).map((x: any) => x?.name || (typeof x?.path === "string" ? x.path.split(/[\\/]/).pop() : null) || x?.label || String(x)).join(", ")}</span></div> : null);
  const Card = ({ label, value, color }: any) => <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px", minWidth: 88 }}><div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div><div style={{ fontFamily: mono, fontSize: 18, color: color || C.fg, fontWeight: 700 }}>{value}</div></div>;
  return (
    <div>
      <h1 style={{ fontFamily: sans, fontWeight: 700, fontSize: 26, color: C.fg, margin: "0 0 4px", letterSpacing: -0.4 }}>Codebase overview</h1>
      <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, marginBottom: 16 }}>{site?.totals?.files} files · {site?.totals?.blocks} symbols · {site?.totals?.folders} folders{site?.totals?.tokens != null ? ` · ~${fmtTokens(site.totals.tokens)} tok` : ""}</div>
      {g.health != null ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Card label="health" value={num(g.health)} color={score(g.health)} />
        <Card label="risk" value={num(g.risk)} color={score(100 - (g.risk ?? 0))} />
        <Card label="files" value={num(g.files)} /><Card label="LOC" value={num(g.loc)} />
        <Card label="coverage" value={(g.coverage_pct ?? "—") + "%"} /><Card label="cycles" value={num(g.cycles)} color={g.cycles ? C.warn : C.ok} /><Card label="smells" value={num(g.smells_total)} />
      </div> : null}
      {langs.length ? <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>{langs.map(([k, n]: any) => <span key={k} style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 3, padding: "1px 7px" }}>{k} {n}</span>)}</div> : null}
      {g.tested_files != null ? <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginBottom: 6 }}>tested <b style={{ color: C.ok }}>{g.tested_files}</b> · untested <b style={{ color: C.warn }}>{g.untested_files}</b> · test files {g.test_files} · fan-in {g.avg_fan_in ?? "—"} / fan-out {g.avg_fan_out ?? "—"} · depth {g.max_depth ?? "—"}{ins?.vulns?.length ? <span style={{ color: "oklch(0.68 0.16 25)" }}> · ⚠ {ins.vulns.length} vulns</span> : null}</div> : null}
      {g.smells_by_kind && Object.keys(g.smells_by_kind).length ? <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>{Object.entries(g.smells_by_kind).sort((a: any, b: any) => (b[1] as number) - (a[1] as number)).map(([k, n]: any) => <span key={k} style={{ fontFamily: mono, fontSize: 9, color: C.warn, border: `1px solid ${C.border}`, borderRadius: 3, padding: "0 6px" }}>{k} {n}</span>)}</div> : null}
      <div style={{ marginBottom: 10 }}>
        {dlist("hubs", g.hubs)}{dlist("most central", g.top_central)}{dlist("most risky", g.top_risky)}{dlist("most complex", g.top_complex)}{dlist("largest", g.largest_files)}{dlist("most churn", g.top_churn)}{dlist("orphans", g.orphans)}
      </div>
      {ins?.review ? <><div style={sectionH}>Insights review</div><MD text={ins.review} /></> : null}
      <Metrics m={root.metrics} />
      <CodeIdentity page={root} />
      <Patterns census={root.patternCensus} />
      <FolderViews atlas={atlas} dir="" />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, marginBottom: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.brand, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600 }}>AI overview</span><span style={{ flex: 1 }} />
        <button onClick={() => void loadOv()} disabled={busy} style={{ ...hdrBtn, fontSize: 9 }}>{busy ? "generating…" : ovMd ? "↻ regenerate" : "✦ generate"}</button>
      </div>
      {busy && !ovMd ? <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>synthesizing the overview…</div>
        : ovMd ? <MD text={ovMd} />
        : <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>No AI overview yet — click <b style={{ color: C.brand }}>✦ generate</b> for a code-review-style synthesis of the dimensions above (one cached call).{ov?.error ? <div style={{ color: C.warn, marginTop: 5 }}>{ov.error}</div> : null}</div>}
      {root.subfolders?.length ? <><div style={sectionH}>Sub-systems</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6, marginBottom: 14 }}>{root.subfolders.map((s: any) => <span key={s.path} style={{ fontFamily: mono, fontSize: 10, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 8px" }}>{s.name}/ <span style={{ color: C.muted }}>· {s.files}</span></span>)}</div></> : null}
      {components.length ? <><div style={sectionH}>Key components</div><div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>{components.map((c: any, i: number) => <span key={i} style={{ fontFamily: mono, fontSize: 9.5, color: "oklch(0.64 0.11 38)", border: `1px solid ${C.border}`, borderRadius: 3, padding: "1px 7px" }}>⬡ {c.name}</span>)}</div></> : null}
    </div>
  );
}

// ── PDF export: a folder-scope picker + a print-only stacked doc. Client-side: reuses the on-screen
// MD styles + the diagram, then window.print() → "Save as PDF". See docs/docs-pdf-export-plan.md.
// The print content is portaled to <body> and flows STATICALLY in print so the browser paginates it
// across pages (a position:fixed/absolute root pins it to one page → only the first page printed).
const PRINT_CSS = `@media print {
  body > *:not(.docs-print-portal) { display: none !important; }
  .docs-print-portal { display: block !important; position: static !important; inset: auto !important; height: auto !important; overflow: visible !important; }
  .docs-print-page { break-after: page; break-inside: auto; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}`;
const pickRow: React.CSSProperties = { display: "flex", gap: 6, alignItems: "center", fontFamily: mono, fontSize: 11, color: C.dim, padding: "2px 0", cursor: "pointer" };

function PdfPicker({ pages, onCancel, onExport }: any) {
  const dirs = React.useMemo(() => Object.keys(pages || {}).filter((k) => k.startsWith("dir:")).map((k) => k.slice(4)).sort(), [pages]);
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [all, setAll] = React.useState(true);
  const [diag, setDiag] = React.useState(true);
  const toggle = (d: string) => setSel((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n; });
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 60, display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxHeight: "80vh", display: "flex", flexDirection: "column", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
        <div style={{ fontFamily: mono, fontSize: 13, color: C.fg, fontWeight: 600, marginBottom: 4 }}>Export to PDF</div>
        <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, marginBottom: 8 }}>Opens your browser's print dialog — choose "Save as PDF".</div>
        <label style={pickRow}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All folders</label>
        <label style={pickRow}><input type="checkbox" checked={diag} onChange={(e) => setDiag(e.target.checked)} /> Include diagram</label>
        {!all ? (
          <div style={{ overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 5, padding: 6, margin: "6px 0", maxHeight: 300 }}>
            {dirs.length ? dirs.map((d) => <label key={d} style={pickRow}><input type="checkbox" checked={sel.has(d)} onChange={() => toggle(d)} /> {d === "" ? "/ (root)" : d}</label>) : <div style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>no folders</div>}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button style={hdrBtn} onClick={onCancel}>Cancel</button>
          <button style={{ ...hdrBtn, color: C.brand, borderColor: C.brand, opacity: (!all && sel.size === 0) ? 0.5 : 1 }} disabled={!all && sel.size === 0} onClick={() => onExport(all ? ["__all__"] : [...sel], diag)}>Export PDF</button>
        </div>
      </div>
    </div>
  );
}

function PrintDoc({ job, atlas }: any) {
  if (!job) return null;
  return createPortal((
    <div className="docs-print-portal" style={{ position: "fixed", inset: 0, background: C.bg, color: C.fg, overflow: "auto", zIndex: 100, padding: "30px 42px" }}>
      <h1 style={{ fontFamily: sans, fontWeight: 700, fontSize: 26, color: C.fg, margin: "0 0 4px" }}>{job.title}</h1>
      <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginBottom: 18 }}>Generated from the antiloki codebase documentation.</div>
      {job.includeDiagram && atlas?.nodes?.length ? (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: "visible", marginBottom: 22, background: C.bg, breakInside: "avoid" }}>
          <React.Suspense fallback={null}><LazyDiagram atlas={atlas} initialDir={job.dir || ""} height={680} /></React.Suspense>
        </div>
      ) : null}
      {job.sections.map((s: any, i: number) => <div key={i} className="docs-print-page" style={{ marginBottom: 30 }}><MD text={s.md} /></div>)}
    </div>
  ), document.body);
}

export function DocsSiteOverlay({ origin = "atlas", onClose, initial }: { origin?: string; onClose: () => void; /** the page it opens on: a file's path, or `dir:<folder>` (the Editor view opens a file's own page) */ initial?: string }) {
  const [site, setSite] = React.useState<any>(null);
  const [atlas, setAtlas] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<string>(initial || "__dashboard__");
  const [q, setQ] = React.useState("");
  const srcCache = React.useRef(new Map<string, string>());
  const pageRef = React.useRef<HTMLDivElement>(null);
  const [pdfOpen, setPdfOpen] = React.useState(false);
  const [printJob, setPrintJob] = React.useState<any>(null);

  const [failed, setFailed] = React.useState(false); // fetch returned NULL (timeout/transport) — a DIFFERENT truth than "no docs"
  React.useEffect(() => { (async () => { setLoading(true); setFailed(false); try { const s0 = await getDocsSiteCached(origin); setSite(s0); setFailed(s0 == null); } finally { setLoading(false); } })(); }, [origin]);
  React.useEffect(() => { getAtlas({ origin }).then((a: any) => setAtlas(a)).catch(() => { /* graph optional */ }); }, [origin]);

  const nav = (target: string) => {
    const [p, anchor] = target.split("#");
    setSel(p || "dir:");
    if (pageRef.current) pageRef.current.scrollTop = 0;
    if (anchor) setTimeout(() => document.getElementById(`blk-${anchor}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const page = site?.pages?.[sel] ?? site?.pages?.["dir:"] ?? null;
  const fileOrder = React.useMemo(() => { const acc: string[] = []; const walk = (n: any) => { if (!n) return; if (n.type === "file") acc.push(n.path); else n.children?.forEach(walk); }; walk(site?.tree); return acc; }, [site]);
  const fi = page?.kind === "file" ? fileOrder.indexOf(page.path) : -1;
  const prev = fi > 0 ? fileOrder[fi - 1] : null;
  const next = fi >= 0 && fi < fileOrder.length - 1 ? fileOrder[fi + 1] : null;
  const copyMd = async () => { const r: any = await docsPage({ page: sel, format: "md" }); const md = r?.markdown ?? r?.result?.markdown; if (md) { try { await navigator.clipboard.writeText(md); } catch (e) { /* */ } } };
  const exportMd = async () => { const r: any = await docsExport({ origin }); const md = r?.combined_md ?? r?.result?.combined_md; if (!md) return; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" })); a.download = `${origin}-docs.md`; a.click(); };
  const startPrint = async (dirs: string[], includeDiagram: boolean) => {
    setPdfOpen(false);
    const all = dirs.includes("__all__");
    // ONE export call returns EVERY page's md (the per-file API-call storm timed out + dropped most
    // pages → only 1 rendered). Filter it to the chosen folders client-side instead.
    const ex: any = await docsExport({ origin });
    const files: any[] = ex?.files ?? ex?.result?.files ?? [];
    const inScope = (p: string) => all || dirs.some((d) => d === "" || p === d || p.startsWith(d + "/"));
    const fileSecs = files.filter((f) => inScope(f.path)).map((f) => ({ key: f.path, md: f.markdown }));
    // folder overview pages: fetch ONLY the selected folders (small N — no request storm).
    const dirList = all ? [""] : dirs;
    const dirSecs = (await Promise.all(dirList.map(async (d) => { const r: any = await docsPage({ page: "dir:" + d, format: "md" }); return { key: "dir:" + d, md: r?.markdown ?? r?.result?.markdown ?? "" }; }))).filter((s) => s.md);
    const sections = [...dirSecs, ...fileSecs].filter((s) => s.md);
    if (!sections.length) return;
    setPrintJob({ title: `${origin} documentation`, sections, includeDiagram, dir: all ? "" : (dirs[0] || "") });
    const done = () => { setPrintJob(null); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(() => window.print(), includeDiagram ? 1600 : 500);
  };
  const hits = q.trim() ? (site?.index ?? []).filter((e: any) => (e.name + " " + e.signature + " " + e.path + " " + (e.summary || "") + " " + (e.role || "") + " " + (e.kind || "")).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60) : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: 50, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", borderBottom: `1px solid ${C.border}`, background: C.panel }}>
        <span style={{ fontFamily: mono, fontSize: 13, color: C.fg, fontWeight: 600 }}>📚 Documentation</span>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>{site?.totals ? `${site.totals.blocks} blocks · ${site.totals.files} files · ${site.totals.folders} folders${site.totals.tokens != null ? ` · ~${fmtTokens(site.totals.tokens)} tok` : ""}` : ""}</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search docs — name, signature, summary…" style={{ marginLeft: "auto", width: 280, fontFamily: mono, fontSize: 10.5, padding: "3px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.fg }} />
        <button onClick={() => void copyMd()} title="copy this page as Markdown — paste into an AI prompt / notebook" style={hdrBtn}>⧉ copy md</button>
        <button onClick={() => void exportMd()} title="download the whole documentation as one Markdown file (docs-as-code)" style={hdrBtn}>⬇ export</button>
        <button onClick={() => setPdfOpen(true)} title="export the docs (all or selected folders) to PDF — opens the print dialog" style={hdrBtn}>🖨 pdf</button>
        <button onClick={onClose} title="close" style={{ fontFamily: mono, fontSize: 12, padding: "2px 9px", borderRadius: 4, cursor: "pointer", background: C.bg, border: `1px solid ${C.border}`, color: C.dim }}>✕</button>
      </div>
      {loading ? <div style={{ padding: 20, fontFamily: mono, fontSize: 11, color: C.muted }}>building documentation…</div> : failed ? (
        <div style={{ padding: 20, fontFamily: mono, fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
          the documentation payload didn't arrive — on a big codebase the site build can run long or exceed the transport. This is NOT missing docs.
          <button onClick={() => { setLoading(true); setFailed(false); void getDocsSiteCached(origin, true).then((s0) => { setSite(s0); setFailed(s0 == null); }).finally(() => setLoading(false)); }}
            style={{ marginLeft: 10, fontFamily: mono, fontSize: 10, padding: "2px 10px", borderRadius: 4, cursor: "pointer", background: C.bg, border: `1px solid ${C.border}`, color: C.brand }}>↻ retry</button>
        </div>
      ) : !site?.found ? (
        <div style={{ padding: 20, fontFamily: mono, fontSize: 11, color: C.muted }}>No documentation yet — rebuild the codebase (↻) to generate it.{site?.error ? <div style={{ color: C.warn, marginTop: 6 }}>{site.error}</div> : null}</div>
      ) : (
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ width: 250, borderRight: `1px solid ${C.border}`, overflow: "auto", background: C.panel, padding: "6px 0" }}>
            <button onClick={() => setSel("__dashboard__")} style={{ display: "block", width: "100%", textAlign: "left", background: sel === "__dashboard__" ? C.panel2 : "transparent", border: "none", borderBottom: `1px solid ${C.border}`, padding: "6px 10px", cursor: "pointer", fontFamily: mono, fontSize: 11, color: sel === "__dashboard__" ? C.brand : C.fg, fontWeight: 600 }}>▣ Dashboard</button>
            {hits ? hits.map((e: any, i: number) => (
              <button key={i} onClick={() => nav(`${e.path}#${e.anchor}`)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "2px 10px", cursor: "pointer" }}><code style={{ fontFamily: mono, fontSize: 10, color: C.brand }}>{KIND_ICON[e.kind] ?? "▪"} {e.name}</code><div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.path}</div></button>
            )) : site.tree?.children?.map((c: any, i: number) => <TreeNode key={i} node={c} sel={sel} onSel={setSel} depth={0} />)}
          </div>
          <div ref={pageRef} style={{ flex: 1, overflow: "auto", padding: "22px 34px", maxWidth: 900 }}>
            {sel === "__dashboard__" ? <Dashboard site={site} origin={origin} atlas={atlas} /> : page ? (page.kind === "folder" ? <FolderPage page={page} onNav={nav} atlas={atlas} /> : <FilePage page={page} onNav={nav} srcCache={srcCache} atlas={atlas} />) : <div style={{ fontFamily: mono, color: C.muted }}>select a page</div>}
            {page?.kind === "file" && (prev || next) ? (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <button onClick={() => prev && nav(prev)} disabled={!prev} style={navBtn(!!prev)}>{prev ? `← ${baseOf(prev)}` : ""}</button>
                <button onClick={() => next && nav(next)} disabled={!next} style={navBtn(!!next)}>{next ? `${baseOf(next)} →` : ""}</button>
              </div>
            ) : null}
          </div>
          {sel !== "__dashboard__" ? <RightRail page={page} onNav={nav} /> : null}
        </div>
      )}
      <style>{PRINT_CSS}</style>
      {pdfOpen && site?.pages ? <PdfPicker pages={site.pages} onCancel={() => setPdfOpen(false)} onExport={startPrint} /> : null}
      <PrintDoc job={printJob} atlas={atlas} />
    </div>
  );
}
