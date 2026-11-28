// CODE BLUEPRINT — the pipeline's blueprint, court-scoped (operator 2026-07-16:
// "look into the pipeline how it generates its blueprint, learn from there").
// ⚡ design runs the pipeline flow: a SKELETON call draws the minimal file spine
// (2-6 files — a small feature is a small spine), one LOW call per file writes a
// real CODE STUB, and blueprint-parse turns the stubs into the atlas-native
// PLANNED graph + a DELTA vs the current atlas. This pane then renders it with
// the SAME components the pipeline blueprint tab uses: structure (the whole
// codebase graph with the delta highlighted | the planned diagram), docs
// (per-file intents + planned symbols), digest (the delta counts), and a stub
// viewer on click. The design persists on the ULTRA PLAN (the lineage).
import * as React from "react";
import { apiPost, unwrapResult as unwrap } from "@/loki/api/client";
import { C, mono, nav } from "@/loki/theme";
import { AtlasGraphMini } from "@/loki/codebase/atlas-graph";
import { getAtlas, type AtlasResponse } from "@/loki/api/codebase";
import { DiagramWidget } from "@/loki/widgets/view-widgets";
import { plannedToDiagram, mergeAtlas, fileStatusMap } from "@/loki/waterfall/blueprint-tab";
import type { Blueprint } from "@/loki/api/blueprint";

const head: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, color: "inherit", textTransform: "uppercase", letterSpacing: 0.8 };
const D_TONE: Record<string, string> = { added: C.ok, changed: C.brand, unchanged: C.dim, removed: C.bad };

export function CodeBlueprint({ sessionId }: { sessionId: number }) {
  const [design, setDesign] = React.useState<any | null>(null);
  const [busy, setBusy] = React.useState<"" | "load" | "design">("");
  const [note, setNote] = React.useState("");
  const [needsDesign, setNeedsDesign] = React.useState(false);
  const [view, setView] = React.useState<"structure" | "docs" | "digest">("structure");
  const [structMode, setStructMode] = React.useState<"graph" | "diagram">("diagram");
  const [selStub, setSelStub] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false); // ⛶ fullscreen graph/diagram
  const [atlas, setAtlas] = React.useState<AtlasResponse | null>(null);
  const [atlasNote, setAtlasNote] = React.useState("");
  React.useEffect(() => {
    let live = true;
    getAtlas({})
      .then((a) => { if (!live) return; setAtlas(a); if (!a?.nodes?.length) setAtlasNote("the code atlas is empty — onboard the codebase (Code screen) to light the ◴ graph view"); })
      .catch((e) => { if (live) setAtlasNote(`the code atlas could not load (${e?.message ?? "unreachable"}) — the ◴ graph view needs it`); });
    return () => { live = false; };
  }, []);
  React.useEffect(() => {
    if (!expanded) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [expanded]);

  const load = React.useCallback(async () => {
    setBusy("load"); setNote("");
    const d = unwrap(await apiPost("/api/v1/cockpit/plan/judge", { session_id: sessionId, mode: "tribunal-blueprint" }, { timeoutMs: 30000 }).catch(() => null));
    setBusy("");
    if (!d?.ok) { setNote("could not load the blueprint — is the BE restarted?"); return; }
    if (d.design) { setDesign(d.design); setNeedsDesign(false); }
    else { setNeedsDesign(!!d.needs_design); if (d.note) setNote(d.note); }
  }, [sessionId]);
  React.useEffect(() => { void load(); }, [load]);

  const runDesign = async () => {
    if (busy) return;
    setBusy("design"); setNote("");
    const d = unwrap(await apiPost("/api/v1/cockpit/plan/judge", { session_id: sessionId, mode: "tribunal-design" }, { timeoutMs: 300000 }).catch(() => null));
    setBusy("");
    if (!d?.ok) { setNote(d?.error ?? "the design failed — is the BE restarted?"); return; }
    setDesign(d.design); setNeedsDesign(false); setSelStub(null);
  };

  // the design in the pipeline Blueprint shape — feeds the SAME renderers
  const molLike = React.useMemo(() => (design ? ({ planned_nodes: design.planned_nodes ?? [], planned_edges: design.planned_edges ?? [], delta: design.delta ?? undefined, stub_files: design.stub_files ?? [] } as unknown as Blueprint) : null), [design]);
  const planned = React.useMemo(() => (molLike ? plannedToDiagram(molLike) : null), [molLike]);
  const statusMap = React.useMemo(() => (molLike ? fileStatusMap(molLike) : {}), [molLike]);
  const mergedAtlas = React.useMemo(() => (atlas && molLike ? mergeAtlas(atlas, molLike) : null), [atlas, molLike]);
  const counts = design?.delta?.counts ?? null;
  const stubOf = (path: string) => (design?.stub_files ?? []).find((s: any) => s.path === path || path.startsWith(s.path))?.source ?? null;
  const symbolsOf = (path: string) => (design?.planned_nodes ?? []).filter((n: any) => n.path === path && n.type !== "file");
  const chip = (on: boolean): React.CSSProperties => ({ fontFamily: mono, fontSize: 9.5, padding: "2px 10px", borderRadius: 6, cursor: "pointer", textTransform: "lowercase", background: on ? `color-mix(in oklab, ${C.brand} 16%, ${C.bg})` : "transparent", border: `1px solid ${on ? C.brand : C.border}`, color: on ? C.fg : C.dim });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ ...head, color: C.brand }}>🖼 code blueprint · the future code, simulated</span>
        <span style={{ flex: 1 }} />
        {design && counts && <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{design.files?.length ?? 0} files · <span style={{ color: C.ok }}>+{counts.added ?? 0}</span> <span style={{ color: C.brand }}>~{counts.changed ?? 0}</span> <span style={{ color: C.dim }}>={counts.unchanged ?? 0}</span> <span style={{ color: C.bad }}>−{counts.removed ?? 0}</span> nodes</span>}
        <button onClick={() => void runDesign()} disabled={!!busy}
          title="the pipeline's blueprint flow — 1 mid skeleton (the smallest file spine) + 1 low code stub per file, parsed into the planned graph + delta"
          style={{ background: busy === "design" ? "transparent" : `linear-gradient(120deg, ${C.brand}, color-mix(in oklab, ${C.brand} 60%, ${C.ok}))`, border: busy === "design" ? `1px solid ${C.warn}` : "none", color: busy === "design" ? C.warn : C.bg, cursor: busy ? "default" : "pointer", fontFamily: mono, fontSize: 8.5, fontWeight: 800, padding: "3px 12px", borderRadius: 8 }}>
          {busy === "design" ? "⏳ the architect is drawing…" : design ? "⚡ re-design" : "⚡ design (1 mid + N low)"}</button>
      </div>
      {note && <span style={{ fontFamily: mono, fontSize: 8, color: needsDesign ? C.dim : C.warn }}>{note}</span>}

      {design && (<>
        {/* the pipeline tab's own splits: structure · docs · digest */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          {(["structure", "docs", "digest"] as const).map((k) => (
            <button key={k} onClick={() => setView(k)} style={chip(view === k)}>{k === "structure" ? "≡ structure" : k === "docs" ? "❡ docs" : "▣ digest"}</button>
          ))}
          {view === "structure" && (
            <>
              <span style={{ width: 8 }} />
              {(["diagram", "graph"] as const).map((m) => (
                <button key={m} onClick={() => setStructMode(m)}
                  title={m === "graph" ? "the WHOLE codebase with the design's delta highlighted (needs the atlas)" : "the planned architecture — the design's own boxes"}
                  style={{ ...chip(structMode === m), fontSize: 8.5 }}>{m === "graph" ? "◴ graph" : "▦ diagram"}</button>
              ))}
              <button onClick={() => setExpanded(true)} title="expand fullscreen (Esc closes)" style={{ ...chip(false), fontSize: 8.5 }}>⛶ expand</button>
            </>
          )}
        </div>

        {view === "structure" && structMode === "graph" ? (
          mergedAtlas?.nodes?.length ? (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.bg }}>
              <AtlasGraphMini atlas={mergedAtlas} height={360} highlight={statusMap} controls onMaximize={() => setExpanded(true)} onPick={(id: string) => setSelStub(id)} />
            </div>
          ) : (
            <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: "14px 16px", fontFamily: mono, fontSize: 8.5, color: C.warn, lineHeight: 1.6 }}>
              ◴ {atlasNote || "loading the code atlas…"}<br />
              <span style={{ color: C.dim }}>meanwhile the ▦ diagram shows the planned architecture on its own.</span>
            </div>
          )
        ) : view === "structure" ? (
          planned ? (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.bg, minHeight: 300 }}>
              <DiagramWidget payload={{ diagram: planned, folderZones: true, onNodeClick: (id: string) => setSelStub(id), onExpand: () => setExpanded(true) }} ctx={{} as any} />
            </div>
          ) : <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, fontStyle: "italic" }}>the stubs parsed into no planned nodes — ⚡ re-design</span>
        ) : null}

        {view === "docs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(design.files ?? []).map((f: any, i: number) => {
              const syms = symbolsOf(f.path);
              return (
                <div key={i} style={{ borderLeft: `2.5px solid ${f.action === "create" ? C.ok : C.brand}`, paddingLeft: 9, display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: mono, fontSize: 7, fontWeight: 800, color: C.bg, background: f.action === "create" ? C.ok : C.brand, borderRadius: 999, padding: "1px 7px", textTransform: "uppercase" }}>{f.action}</span>
                    <b style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, wordBreak: "break-all" }}>{f.path}</b>
                    <span style={{ flex: 1 }} />
                    {stubOf(f.path) != null && <button onClick={() => setSelStub(f.path)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 7.5, padding: "1px 7px", borderRadius: 999 }}>⌗ stub</button>}
                  </div>
                  {f.intent && <span style={{ fontFamily: nav, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{f.intent}</span>}
                  {syms.slice(0, 8).map((s: any, si: number) => (
                    <div key={si} style={{ fontFamily: mono, fontSize: 8, color: C.dim, display: "flex", gap: 5, alignItems: "baseline" }}>
                      <span style={{ color: D_TONE[design.delta?.by_id?.[s.id]] ?? C.dim }}>●</span>
                      <span><span style={{ color: C.brand }}>{s.type}</span> <span style={{ color: C.fg }}>{s.name}</span>{s.signature ? <span style={{ color: C.dim }}> {String(s.signature).slice(0, 90)}</span> : null}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {view === "digest" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["added", "changed", "unchanged", "removed"] as const).map((k) => (
                <div key={k} style={{ flex: "1 1 80px", minWidth: 78, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 9px" }}>
                  <div style={{ fontFamily: mono, fontSize: 7, color: C.dim, textTransform: "uppercase" }}>{k}</div>
                  <div style={{ fontFamily: mono, fontSize: 14, fontWeight: 800, color: D_TONE[k] }}>{counts?.[k] ?? 0}</div>
                </div>
              ))}
            </div>
            <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>the delta = every planned node keyed against the current atlas (the pipeline's blueprint-parse) · designed {design.designed_at ? new Date(design.designed_at).toLocaleString() : ""}</span>
            {(design.parse_errors ?? []).length > 0 && (
              <div style={{ fontFamily: mono, fontSize: 8, color: C.warn, lineHeight: 1.6 }}>⚠ stubs that did not parse (they stand as bare files): {design.parse_errors.map((e: any) => e.path).join(", ")}</div>
            )}
          </div>
        )}

        {/* ⛶ FULLSCREEN — the graph/diagram writ large (Esc closes) */}
        {expanded && (
          <div style={{ position: "fixed", inset: 0, zIndex: 460, background: `color-mix(in oklab, ${C.bg} 88%, transparent)`, backdropFilter: "blur(3px)", display: "flex", flexDirection: "column", padding: 14, gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ ...head, color: C.brand }}>🖼 code blueprint · {structMode === "graph" && mergedAtlas?.nodes?.length ? "the codebase with the delta" : "the planned architecture"}</span>
              {(["diagram", "graph"] as const).map((m) => (
                <button key={m} onClick={() => setStructMode(m)} style={{ ...chip(structMode === m), fontSize: 8.5 }}>{m === "graph" ? "◴ graph" : "▦ diagram"}</button>
              ))}
              <span style={{ flex: 1 }} />
              <button onClick={() => setExpanded(false)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: "2px 12px", borderRadius: 7 }}>✕ close (Esc)</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", background: C.bg }}>
              {structMode === "graph" && mergedAtlas?.nodes?.length ? (
                <AtlasGraphMini atlas={mergedAtlas} height={Math.max(420, window.innerHeight - 110)} highlight={statusMap} controls onPick={(id: string) => { setSelStub(id); setExpanded(false); }} />
              ) : planned ? (
                <DiagramWidget payload={{ diagram: planned, folderZones: true, onNodeClick: (id: string) => { setSelStub(id); setExpanded(false); } }} ctx={{} as any} />
              ) : <div style={{ padding: 20, fontFamily: mono, fontSize: 9, color: C.dim }}>nothing to draw yet — ⚡ design first.</div>}
            </div>
          </div>
        )}

        {/* the STUB viewer — the simulated future code of a clicked file */}
        {selStub && stubOf(selStub) != null && (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, background: C.bg, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 9px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: mono, fontSize: 8.5, color: C.brand }}>⌗ {selStub}</span>
              <span style={{ fontFamily: mono, fontSize: 7, color: C.dim }}>the stub — signatures real, bodies TODO</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => setSelStub(null)} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>
            </div>
            <pre style={{ margin: 0, padding: "8px 11px", fontFamily: mono, fontSize: 9, color: C.fg, lineHeight: 1.55, maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap" }}>{stubOf(selStub)}</pre>
          </div>
        )}
      </>)}
    </div>
  );
}
