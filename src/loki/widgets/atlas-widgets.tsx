// ANTIIDE-IN-CHAT: the antiIDE intelligence, rendered as inline chat widgets. Every one of these is
// DETERMINISTIC and $0 — it reuses the real antiIDE component and reads the atlas the codebase rebuild
// already computed, so it appears instantly with no model call. Summoned from the slash palette
// (/review, /graph, /authors, /docs, /constitution) or emitted by a turn; registered in registry.tsx.
//
// The components are reused verbatim — the graph, the authors panel, the docs, the constitution book,
// the file review modal — so the chat is a natural-language remote for every panel.
import React from "react";
import { buildTree, sortKids, TreeRow, type TreeNode } from "@/loki/codebase/file-tree";
import { Highlighted } from "@/loki/codebase/highlight";
import { C, mono, nav } from "@/loki/theme";
import { getAtlas, fileRead, type FileSource } from "@/loki/api/codebase";
import { AtlasGraphMini, AtlasGraphOverlay, DiagramView } from "@/loki/codebase/atlas-graph";
import { AuthorsPanel } from "@/loki/codebase/authors-panel";
import { DocsView, fetchFileCon, FileScoreModal, type FileCon } from "@/loki/codebase/atlas-decorators";
import { ConstitutionPanel } from "@/loki/codebase/constitution-panel";
import { InsightsPanel } from "@/loki/codebase/atlas-view";
import { GitGraphPanel } from "@/loki/codebase/atlas-files-ide";
import type { WidgetProps } from "./types";
import { AgentActionButton } from "./agent-action-button";
import { sayToAgent, startBlockDrag } from "./agent-interact";

const healthTone = (h: number | null) => (h == null ? C.dim : h >= 80 ? C.ok : h >= 50 ? C.warn : C.bad);

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 14, fontFamily: mono, fontSize: 10.5, color: C.muted }}>{children}</div>;
}

// the shared shell — the "$0 · from the atlas" badge is the whole point: deterministic, instant, no model call.
function AtlasFrame({ label, hint, children }: { label: string; hint?: string | null; children: React.ReactNode }) {
  return (
    <div data-widget-frame style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg, overflow: "hidden" }}>
      <div data-widget-frame-header style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: `1px solid ${C.border}`, background: C.panel2 }}>
        <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", color: C.dim }}>◆ {label}</span>
        {hint && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{hint}</span>}
        <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 8.5, color: C.ok, whiteSpace: "nowrap" }}>$0 · from the atlas</span>
      </div>
      <div style={{ minWidth: 0, fontFamily: nav, fontSize: 12.5, lineHeight: 1.45, letterSpacing: "normal", color: C.fg }}>{children}</div>
    </div>
  );
}

// CODE GRAPH — the whole import graph, reusing the atlas graph component (scroll to zoom · ⛶ expand).
export function AtlasGraphWidget({ payload }: WidgetProps) {
  const [atlas, setAtlas] = React.useState<any>(payload?.graph ?? payload?.atlas ?? null);
  const [loading, setLoading] = React.useState(!atlas);
  const [max, setMax] = React.useState(false);
  React.useEffect(() => {
    if (atlas) return;
    let live = true;
    void getAtlas({}).then((r) => { if (live) { setAtlas(r); setLoading(false); } }).catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AtlasFrame label="code graph" hint={atlas?.nodes ? `${atlas.nodes.length} nodes · ${atlas.edges?.length ?? 0} edges` : null}>
      {loading ? <Muted>reading the atlas…</Muted> : !atlas?.nodes?.length ? <Muted>no atlas yet — rebuild the codebase first.</Muted> : (
        <div style={{ padding: 6 }}>
          <AtlasGraphMini atlas={atlas} height={280} controls onMaximize={() => setMax(true)} />
          {max && <AtlasGraphOverlay atlas={atlas} onClose={() => setMax(false)} />}
        </div>
      )}
    </AtlasFrame>
  );
}

// SYSTEM DESIGN — the antiIDE architecture diagram (boxes + arrows, folder navigation, drill into a
// file's internals), reused inline. Deterministic, $0 — drawn from the atlas the rebuild computed.
export function AtlasDiagramWidget({ payload }: WidgetProps) {
  const [atlas, setAtlas] = React.useState<any>(payload?.atlas ?? null);
  const [loading, setLoading] = React.useState(!atlas);
  React.useEffect(() => {
    if (atlas) return;
    let live = true;
    void getAtlas({}).then((r) => { if (live) { setAtlas(r); setLoading(false); } }).catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AtlasFrame label="system design" hint={atlas?.nodes ? `architecture diagram · ${atlas.nodes.length} files` : null}>
      {loading ? <Muted>reading the atlas…</Muted> : !atlas?.nodes?.length ? <Muted>no atlas yet — rebuild the codebase first.</Muted> : (
        <div style={{ padding: 6 }}><DiagramView atlas={atlas} height={480} initialDir={payload?.dir ?? payload?.path ?? undefined} /></div>
      )}
    </AtlasFrame>
  );
}

// AUTHORS — the git ownership layer (graph · profile · co-dependency · bus-factor), self-fetching, local avatars.
export function AtlasAuthorsWidget() {
  return (
    <AtlasFrame label="authors" hint="ownership · graph · profile · bus-factor">
      <div style={{ padding: 6, minHeight: 340 }}><AuthorsPanel /></div>
    </AtlasFrame>
  );
}

// DOCS — the self-generated docs for ONE page (a folder or a file), rebuilt from the code so it can't drift.
export function AtlasDocsWidget({ payload }: WidgetProps) {
  const path: string | null = payload?.path ?? null;
  return (
    <AtlasFrame label="docs" hint={path ?? "choose a folder or file"}>
      {path
        ? <div style={{ padding: 6, maxHeight: 540, overflow: "auto" }}><DocsView origin="atlas" path={path} /></div>
        : <div style={{ padding: 16, fontFamily: mono, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>Choose a scope — the docs render for one <b style={{ color: C.dim }}>folder or file</b>. Open <b style={{ color: C.dim }}>⊞ Studio</b>, check a file in the tree, then pick Docs page — or type <b style={{ color: C.dim }}>/docs src/…</b>.</div>}
    </AtlasFrame>
  );
}

// CONSTITUTION — the laws book, optionally scoped to the laws that touch one file.
export function AtlasConstitutionWidget({ payload }: WidgetProps) {
  const path: string | null = payload?.path ?? null;
  return (
    <AtlasFrame label="constitution" hint={path ?? "the laws"}>
      <div style={{ padding: 6, maxHeight: 540, overflow: "auto" }}><ConstitutionPanel filePath={path} /></div>
    </AtlasFrame>
  );
}

// X-RAY — the deterministic riskiest-files + smells + digest panel (reuses the atlas InsightsPanel).
export function AtlasXrayWidget() {
  return (
    <AtlasFrame label="x-ray" hint="riskiest files · smells · digest">
      <div style={{ padding: 6, maxHeight: 560, overflow: "auto" }}><InsightsPanel onPick={() => { /* navigation is a no-op inside the chat */ }} /></div>
    </AtlasFrame>
  );
}

// CODE — ONE FILE at a time (operator 2026-07-27: "per file widget… no sidebar with the file
// tree, just the readonly file and a search with autocomplete deterministic"). Paths come from the
// atlas; ranking is plain substring scoring (basename-prefix > basename > full path, shorter
// wins); content is the real file, read-only, $0 — no tree, no model.
export function AtlasCodeWidget({ payload }: WidgetProps) {
  // THE WHOLE CODE — files and tree only (operator 2026-09-17: "just the files and tree, not antiIDE
  // capabilities"): the same tree rows and the same highlighted viewer antiIDE uses, with none of the
  // analysis — no scores, no insights, no replay/coverage/docs, no rail. A `path` on the payload opens first.
  const [paths, setPaths] = React.useState<string[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [sel, setSel] = React.useState<string | null>((payload as any)?.path ? String((payload as any).path) : null);
  const [openMap, setOpenMap] = React.useState<Record<string, boolean>>({});
  const setOpen = React.useCallback((p: string, v: boolean) => setOpenMap((m) => ({ ...m, [p]: v })), []);
  React.useEffect(() => {
    let live = true;
    void getAtlas({}).then((r: any) => {
      if (!live) return;
      if (!r) { setErr("no atlas — rebuild the codebase in antiIDE"); return; }
      setPaths((r.nodes ?? []).filter((x: any) => x.type === "file" && x.path).map((x: any) => String(x.path)));
    }).catch((e: any) => { if (live) setErr(String(e?.message ?? "atlas unreachable")); });
    return () => { live = false; };
  }, []);
  const tree = React.useMemo(() => buildTree((paths ?? []).map((path) => ({ path, fileNode: null }))), [paths]);
  // the file's folders unfold when a path arrives pre-selected
  React.useEffect(() => {
    if (!sel) return;
    const parts = sel.split("/"); const m: Record<string, boolean> = {};
    for (let i = 1; i < parts.length; i++) m[parts.slice(0, i).join("/")] = true;
    setOpenMap((cur) => ({ ...m, ...cur }));
  }, [sel]);
  if (err) return <div style={{ padding: 12, fontFamily: mono, fontSize: 10, color: C.warn }}>{err}</div>;
  if (!paths) return <div style={{ padding: 12, fontFamily: mono, fontSize: 10, color: C.dim }}>loading the file tree…</div>;
  if (!paths.length) return <div style={{ padding: 12, fontFamily: mono, fontSize: 10, color: C.dim }}>the atlas is empty — rebuild the codebase in antiIDE.</div>;
  return (
    <div data-testid="atlas-code-ide" style={{ flex: 1, minHeight: 0, height: "100%", display: "flex", overflow: "hidden", background: C.panel }}>
      <div data-testid="atlas-code-tree" style={{ width: 210, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: C.bg, overflow: "auto", padding: "6px 0" }}>
        {sortKids(tree).map((c) => <TreeRow key={c.path} node={c} depth={0} selected={sel} onPick={(n: TreeNode) => setSel(n.path)} openMap={openMap} setOpen={setOpen} />)}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "4px 10px", borderBottom: `1px solid ${C.border}`, background: C.bg, fontFamily: mono, fontSize: 10, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel ?? "no file open"}</div>
        <PlainViewer path={sel} />
      </div>
    </div>
  );
}

/** The viewer without antiIDE — the file's source, highlighted, nothing else. */
function PlainViewer({ path }: { path: string | null }) {
  const [src, setSrc] = React.useState<FileSource | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    setSrc(null); setErr(null);
    if (!path) return;
    let live = true;
    void fileRead({ path }).then((r) => { if (!live) return; if (r) setSrc(r); else setErr("could not read the file"); }).catch((e: any) => { if (live) setErr(String(e?.message ?? "read failed")); });
    return () => { live = false; };
  }, [path]);
  if (!path) return <div style={{ flex: 1, display: "grid", placeItems: "center", fontFamily: mono, fontSize: 10.5, color: C.dim }}>select a file from the tree</div>;
  if (err) return <div style={{ padding: 12, fontFamily: mono, fontSize: 10, color: C.warn }}>{err}</div>;
  if (!src) return <div style={{ padding: 12, fontFamily: mono, fontSize: 10, color: C.dim }}>reading…</div>;
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      <Highlighted code={src.content} />
      {src.truncated && <div style={{ padding: "4px 10px", fontFamily: mono, fontSize: 9, color: C.dim }}>truncated · {src.lines} lines</div>}
    </div>
  );
}

export function AtlasGitWidget() {
  return (
    <AtlasFrame label="git" hint="branches · history">
      <div style={{ padding: 6, maxHeight: 480, overflow: "auto" }}><GitGraphPanel /></div>
    </AtlasFrame>
  );
}

// FILE REVIEW — the court-grade review of one file, inline: health + the top findings; ⛶ opens the full modal.
export function AtlasReviewWidget({ payload, ctx }: WidgetProps) {
  const path: string | null = payload?.path ?? null;
  const [con, setCon] = React.useState<FileCon | null>(null);
  const [loading, setLoading] = React.useState(!!path);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (!path) return;
    let live = true; setLoading(true);
    void fetchFileCon(path).then((c) => { if (live) { setCon(c); setLoading(false); } }).catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [path]);
  if (!path) return <AtlasFrame label="file review"><Muted>need a file path — try <code>/review src/foo.ts</code></Muted></AtlasFrame>;
  const health = (con?.health ?? null) as number | null;
  const vios: any[] = (con?.violations as any[]) ?? [];
  return (
    <AtlasFrame label="file review" hint={path}>
      {loading ? <Muted>reviewing…</Muted> : !con ? <Muted>no review for this file — rebuild its review first.</Muted> : (
        <div style={{ padding: "8px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <b style={{ fontFamily: mono, fontSize: 20, color: healthTone(health), fontVariantNumeric: "tabular-nums" }}>{health ?? "—"}</b>
            <span style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>health</span>
            {vios.length > 0 && <span style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>{vios.length} problem{vios.length === 1 ? "" : "s"}</span>}
            <button onClick={() => setOpen(true)} style={{ marginLeft: "auto", fontFamily: mono, fontSize: 9, background: "transparent", border: `1px solid ${C.border}`, color: C.brand, borderRadius: 5, padding: "2px 8px", cursor: "pointer" }}>⛶ full review</button>
          </div>
          {vios.slice(0, 5).map((v, i) => (
            <div key={i} draggable onDragStart={(e) => startBlockDrag(e, { label: String(v.law_key ?? v.title ?? "finding").slice(0, 40), uid: `finding-${(v.law_key ?? "f")}-${v.line ?? i}`, source: `file review of ${path}`, content: `Review finding in ${path}${v.line != null ? ` at L${v.line}` : ""}: § ${v.law_key ?? v.title ?? "finding"} (${v.severity ?? ""})\n${String(v.rule_md ?? v.evidence ?? "")}${v.fix ? `\nSuggested fix: ${v.fix}` : ""}` })}
              style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, marginTop: 3, lineHeight: 1.5, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", cursor: "grab" }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ color: C.warn }}>§ {v.law_key ?? v.title ?? "finding"}</span>{v.line != null ? ` · L${v.line}` : ""}
                {(v.rule_md ?? v.evidence) ? <span style={{ color: C.muted }}> — {String(v.rule_md ?? v.evidence).slice(0, 90)}</span> : null}
              </span>
              {/* ➤ dispatch THIS finding as a scoped mission into an agent's terminal */}
              <AgentActionButton chatSessionId={ctx?.chatSessionId} label="➤ fix" title="send this finding to an agent as a surgical mission"
                act={async (a) => (await sayToAgent(a.id,
                  `MISSION: fix ONE finding in ${path}${v.line != null ? ` at line ${v.line}` : ""} — ${v.law_key ?? v.title ?? "finding"}${v.fix ? `. Suggested fix: ${String(v.fix).slice(0, 300)}` : ""}. Change nothing else; show the diff when done.`)
                  ? `sent → #${a.id}` : null)} />
            </div>
          ))}
          {open && <FileScoreModal con={con} onClose={() => setOpen(false)} />}
        </div>
      )}
    </AtlasFrame>
  );
}
