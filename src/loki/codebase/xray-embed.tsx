// X-RAY, ONE PART AT A TIME (operator 2026-11-10: "open a pane with exactly the part, if it is a visual one like the diagram, graphs"). This is the page the Cowork pane frames (`/embed/xray?view=&space=&path=`): X-ray's own
// components, the same ones the X-ray page draws, one of them filling the page. It is a page of its own so the SPACE it is about is its own: it names the space on its requests (`setRequestWorkspace`) without touching
// the screen that framed it.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { apiPost, getRequestWorkspace, setRequestWorkspace } from "@/loki/api/client";
import { fetchWorkspaces } from "@/loki/api/dispatch";
import { getAtlas, fileRead, type AtlasResponse } from "@/loki/api/codebase";
import { AtlasGraphMini, DiagramView, atlasToFolderDiagram, folderScopedAtlas } from "./atlas-graph";
import { RepoDashboard } from "./repo-dashboard";
import { RulesPanel } from "./rules-panel";
import { ConstitutionPanel } from "./constitution-panel";
import { CoveragePanel } from "./coverage-panel";
import { HistoryPanel } from "./history-panel";
import { ReviewHistoryPanel } from "./review-history-panel";
import { AuthorsPanel } from "./authors-panel";
import { DataStoriesPanel } from "./data-stories-panel";
import { SubstratePanel } from "./substrate-panel";
import { DesignView } from "./design-view";
import { EditorPane, FileReviewStage, FolderStage, GitGraphPanel } from "./atlas-files-ide";
import { Highlighted } from "./highlight";
import { XrayBoard } from "./xray-board";
import { SlotFrame } from "./xray-slot";
import { AtlasView } from "./atlas-view";
import { TreeFiles } from "./tree-files";
import { DocsSiteOverlay, getDocsSiteCached } from "./docs-site";
import { RebuildPanel } from "./rebuild-panel";
import { FileHistoryReplay } from "./file-history-replay";
import { FileDocs } from "@/loki/team/FileDocs";

export type EmbedQuery = { view: string; space: string; path: string; symbol: string; depth: number; source: string; /** framed by the Editor view: none of X-ray's own chrome (the ⋯ menu of replacing a part by a widget) */ bare?: boolean };

/** The page's address, read. Pure over a query string. */
export function readEmbedQuery(search: string): EmbedQuery {
  const q = new URLSearchParams(search);
  const depth = Number(q.get("depth")); const g = (k: string, n = 500) => (q.get(k) ?? "").slice(0, n);
  return { view: g("view", 40), space: g("space", 300), path: g("path").replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""), symbol: g("symbol", 200), depth: Number.isFinite(depth) && depth > 0 ? depth : 0, source: g("source", 60), bare: q.get("bare") === "1" };
}

/** Which space the requests are about: the root of the registered space named (any case) by name or root, when it is not the one the serve has open; null for the open one. Pure over the list. */
export function spaceRoot(list: { name: string; root_path: string; is_active: number }[], want: string): { root: string | null; found: boolean } {
  const w = want.trim().replace(/[\\/]+$/, "");
  if (!w) return { root: null, found: true };
  const hit = list.find((x) => x.name.toLowerCase() === w.toLowerCase() || x.root_path === w);
  // a folder that is not registered but is named by its path is a TREE of a thread (the work of a team, which is the codebase being worked on): the serve says whether it is one
  if (!hit) return /^([a-zA-Z]:)?[\\/]/.test(w) ? { root: w, found: true } : { root: null, found: false };
  return { root: hit.is_active === 1 ? null : hit.root_path, found: true };
}

/** Said once per page: the rebuild panel calls `onDone` on every render while its job reads done. */
const told = { once: false };
/** A stable function: the panel's effect depends on `onDone`, and a new one on every render made it run, set state and render again, without end. */
function tellRebuilt() { if (told.once) return; told.once = true; try { window.parent.postMessage({ antilokiRebuilt: true }, "*"); } catch { /* not framed */ } }
/** The rebuild window opens ready: its button is pressed once, so the wizard (phases, progress, log) is what the person sees. */
function AutoRebuild({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { let n = 0; const h = setInterval(() => { const b = ref.current?.querySelector<HTMLButtonElement>('[data-testid="rebuild-button"]'); if (b && !b.disabled) { clearInterval(h); b.click(); } else if (++n > 40) clearInterval(h); }, 150); return () => clearInterval(h); }, []);
  // the window is X-ray's own wizard (a full-page modal inside this frame): when it closes, the page that framed this one is told, so there is one window and one way out
  React.useEffect(() => { let seen = false; const h = setInterval(() => { const open = !!document.querySelector('div[style*="z-index: 60"]'); if (open) seen = true; else if (seen) { seen = false; try { window.parent.postMessage({ antilokiRebuildClosed: true }, "*"); } catch { /* not framed */ } } }, 200); return () => clearInterval(h); }, []);
  return <div ref={ref} style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>{children}</div>;   // the small panel under the wizard stays out of sight: the wizard is the window
}
/** X-ray's docs page for a file or folder; where X-ray has no page for it (a page, a report, a table, a project that is one file) the file's own documentation, read from the file, so the icon is never an empty page. */
function DocsOrGenerated({ q }: { q: EmbedQuery }) {
  const [site, setSite] = React.useState<any | undefined>(undefined);
  React.useEffect(() => { let on = true; void getDocsSiteCached("atlas").then((x) => { if (on) setSite(x ?? null); }); return () => { on = false; }; }, []);
  if (site === undefined) return <Msg text="reading the docs…" />;
  const key = q.path ? (q.source === "dir" ? `dir:${q.path}` : q.path) : ""; const has = !q.path || !!site?.pages?.[key];
  if (has) return <div data-testid="xray-docs" style={{ flex: 1, minHeight: 0, position: "relative", background: C.bg }}><DocsSiteOverlay initial={key || undefined} onClose={() => undefined} /></div>;
  return <div data-testid="xray-docs-generated" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.bg }}><div style={{ padding: "8px 22px 0", fontFamily: nav, fontSize: 11.5, color: C.dim }}>X-ray has no documentation page for this file: this is generated from the file itself.</div><FileDocs dir={q.space} path={q.path} /></div>;
}
const Msg = ({ text }: { text: string }) => <div style={{ padding: 16, fontFamily: mono, fontSize: 11.5, color: C.muted }}>{text}</div>;

/** A catalog source of the space, as the serve renders it: the AST, a diagram, any source with no widget of its own. */
function SourceText({ source, args, space }: { source: string; args: Record<string, unknown>; space: string }) {
  const [r, setR] = React.useState<{ ok: boolean; summary?: string; content?: string; error?: string } | null>(null);
  const key = JSON.stringify([source, args, space]);
  React.useEffect(() => { let on = true; setR(null); void apiPost<any>("/api/v1/xray/query", { space, source, args }).then((x) => { if (on) setR(x ?? { ok: false, error: "the serve did not answer" }); }); return () => { on = false; }; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <Msg text={`reading ${source}…`} />;
  if (!r.ok) return <Msg text={r.error ?? "could not read"} />;
  return <div data-testid="xray-source" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "10px 14px" }}><div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginBottom: 8 }}>{r.summary}</div><pre style={{ margin: 0, fontFamily: mono, fontSize: 11, lineHeight: 1.5, color: C.fg, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.content}</pre></div>;
}

function useAtlas(): AtlasResponse | null | undefined {
  const [a, setA] = React.useState<AtlasResponse | null | undefined>(undefined);
  React.useEffect(() => { let on = true; void getAtlas({ with_tokens: false }).then((r) => { if (on) setA(r ?? null); }).catch(() => { if (on) setA(null); }); return () => { on = false; }; }, []);
  return a;
}

function Code({ path }: { path: string }) {
  const [src, setSrc] = React.useState<{ content?: string } | null | undefined>(undefined);
  React.useEffect(() => { let on = true; void fileRead({ path }).then((r) => { if (on) setSrc(r as any); }); return () => { on = false; }; }, [path]);
  if (src === undefined) return <Msg text="reading the file…" />;
  if (!src?.content && src?.content !== "") return <Msg text={`no such file in this space: ${path}`} />;
  return <div data-testid="xray-code" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 10 }}><Highlighted code={src.content ?? ""} /></div>;
}

/** The X-ray page of a space: the atlas when there is code to index; the plain files when there is not. */
function AtlasOrFiles({ space }: { space: string }) {
  const [empty, setEmpty] = React.useState(false);
  if (empty) return <TreeFiles space={space} />;
  return <AtlasView autoRebuild onEmpty={() => setEmpty(true)} />;
}

function SystemDiagram({ path, depth }: { path: string; depth: number }) {
  const atlas = useAtlas();
  if (atlas === undefined) return <Msg text="reading the atlas…" />;
  if (!atlas?.nodes?.length) return <Msg text="no atlas yet — rebuild this space first" />;
  const scoped = path ? folderScopedAtlas(atlas, path) : atlas;
  void atlasToFolderDiagram; void depth;
  return <div data-testid="xray-system-diagram" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 8 }}><DiagramView atlas={scoped} height={Math.max(360, window.innerHeight - 40)} initialDir={path || undefined} /></div>;
}

function ImportGraph({ path }: { path: string }) {
  const atlas = useAtlas();
  if (atlas === undefined) return <Msg text="reading the atlas…" />;
  if (!atlas?.nodes?.length) return <Msg text="no atlas yet — rebuild this space first" />;
  return <div data-testid="xray-import-graph" style={{ flex: 1, minHeight: 0, padding: 6 }}><AtlasGraphMini atlas={path ? folderScopedAtlas(atlas, path) : atlas} height={Math.max(320, window.innerHeight - 20)} controls /></div>;
}

/** The view, drawn: a part of X-ray is a slot, drawn by its built-in component unless a widget has been put in its place. */
export function XrayView({ q }: { q: EmbedQuery }) {
  if (q.view === "board" || !q.view || q.bare) return <BuiltInView q={q} />;
  return <SlotFrame slot={q.view} space={q.space}><BuiltInView q={q} /></SlotFrame>;
}
function BuiltInView({ q }: { q: EmbedQuery }) {
  const open = () => { /* a pane shows one part: opening another file is the person's or the agent's next ask */ };
  const wrap = (n: React.ReactNode) => <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: C.bg, display: "flex", flexDirection: "column" }}>{n}</div>;
  switch (q.view) {
    case "board": return <XrayBoard space={q.space} />;
    case "atlas": return <div data-testid="xray-atlas" style={{ flex: 1, minHeight: 0, overflow: "hidden", background: C.bg, position: "relative", display: "flex", flexDirection: "column" }}><AtlasOrFiles space={q.space} /></div>;
    case "overview": return wrap(<RepoDashboard chrome={false} tab="overview" onOpen={open} onOpenFile={open} />);
    case "file": return wrap(<FileReviewStage path={q.path} />);
    case "folder": return wrap(<FolderStage path={q.path} onOpenFile={open} />);
    case "code": return <Code path={q.path} />;
    case "ast": return <SourceText source="ast" space={q.space} args={{ path: q.path, ...(q.symbol ? { symbol: q.symbol } : {}), sexp: true }} />;
    case "file-diagram": return <SourceText source="diagram" space={q.space} args={{ path: q.path }} />;
    case "system-diagram": return <SystemDiagram path={q.path} depth={q.depth} />;
    case "import-graph": return <ImportGraph path={q.path} />;
    case "data-stories": return wrap(<DataStoriesPanel onOpen={open} />);
    case "rules": return wrap(<div style={{ padding: 12 }}><RulesPanel /></div>);
    case "constitution": return wrap(<div style={{ padding: 12 }}><ConstitutionPanel /></div>);
    case "coverage": return wrap(<div style={{ padding: 12 }}><CoveragePanel onOpen={open} /></div>);
    case "health-over-time": return wrap(<div style={{ padding: 12 }}><HistoryPanel onOpen={open} /></div>);
    case "review-history": return wrap(<div style={{ padding: 12 }}><ReviewHistoryPanel onOpen={open} /></div>);
    case "working-tree": return wrap(<RepoDashboard chrome={false} tab="happened" onOpen={open} onOpenFile={open} />);
    case "git-graph": return wrap(<div style={{ padding: 12 }}><GitGraphPanel /></div>);
    case "authors": return wrap(<div style={{ padding: 12 }}><AuthorsPanel onOpen={open} /></div>);
    // THE REBUILD WINDOW OF X-RAY, for this space (the Editor view opens it over the code); it tells the page that framed it when a rebuild finished
    case "rebuild": return wrap(<AutoRebuild><RebuildPanel onDone={tellRebuilt} /></AutoRebuild>);
    // A FILE'S GIT HISTORY, REPLAYED (X-ray's own)
    case "history": return q.path ? <div style={{ flex: 1, minHeight: 0, position: "relative", background: C.bg }}><FileHistoryReplay path={q.path} onClose={() => undefined} /></div> : <Msg text="open a file to replay its history" />;
    case "design": return wrap(<DesignView only="showcase" />);
    case "design-frames": return wrap(<DesignView only="frames" />);
    // THE DOCS SITE GENERATED FROM THE CODE (no model): the same site the X-ray docs tab builds, filling the page
    case "docs": return <DocsOrGenerated q={q} />;
    // X-RAY'S OWN FILE EDITOR, one file (the doc cards above the blocks, the violation strips, coverage, history, save): what the Editor view shows when the agents are done
    case "code-edit": return q.path ? <div data-testid="xray-code-edit" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.bg }}><EditorPane file={q.path} fileNode={{ path: q.path }} bare /></div> : <Msg text="open a file to edit it" />;
    case "telemetry": return wrap(<div style={{ padding: 12 }}><SubstratePanel /></div>);
    case "source": return <SourceText source={q.source} space={q.space} args={{ path: q.path }} />;
    default: return <Msg text={`this X-ray view does not exist: ${q.view || "(none)"}`} />;
  }
}

/** THE PAGE: names its space, then draws its view. Nothing is drawn (so nothing is asked) before the space is known. */
export function XrayEmbed() {
  const q = React.useMemo(() => readEmbedQuery(window.location.search), []);
  const [state, setState] = React.useState<"naming" | "ready" | "no-space">("naming");
  React.useEffect(() => {
    let on = true;
    void fetchWorkspaces().then((l) => {
      if (!on) return;
      const { root, found } = spaceRoot(l?.workspaces ?? [], q.space);
      if (!found) { setState("no-space"); return; }
      setRequestWorkspace(root);
      void fetchWorkspaces().then(() => { if (on) setState("ready"); });   // read again so the page's own idea of "the workspace" is the named one
    });
    return () => { on = false; };
  }, [q.space]);
  return (
    <div data-testid="xray-embed" data-view={q.view} data-space={q.space} data-state={state} data-request-space={getRequestWorkspace() ?? ""} style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: C.bg, color: C.fg, fontFamily: nav }}>
      {state === "naming" && <Msg text="opening the space…" />}
      {state === "no-space" && <Msg text={`there is no space called "${q.space}"`} />}
      {state === "ready" && <XrayView q={q} />}
    </div>
  );
}
