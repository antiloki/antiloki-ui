// The files section as a VSCode-style IDE: a collapsible folder TREE (left) + a real code EDITOR (right,
// CodeMirror; operator 2026-10-11) that opens the clicked file's source for editing and saving straight to the
// workspace, with its blast radius (importers / affected tests) right there — so the blast panel lives with the file.
// A saved edit marks the X-ray's analysis stale (`code-edits.ts`) until the next rebuild.
import React from "react";
import { reportScreenState, clearScreenState, reportScreenPage } from "@/loki/chat/screen-manifest";
import { consumePendingIdeView } from "@/loki/chat/ui-bus";
import { C, mono, nav } from "@/loki/theme";
import { fmtTokens } from "@/loki/util/tokens";
import type { FileSource } from "@/loki/api/codebase";
import { fileRead, fileSave, entryPointsGet, findSymbol, decorateFile, gitInit, coverageGet } from "@/loki/api/codebase";
import { useCodeGit } from "@/loki/api/hooks";
import { CodeEditor, type CodeEditorHandle } from "./code-editor";
import { markEdited } from "./code-edits";
import { extColor, FilePanel, fileDetail, AtlasGraphMini, DiagramView } from "./atlas-graph";
import { ConstitutionPanel } from "./constitution-panel";
import { RepoDashboard, DASH_TABS, isSoon, type DashTab } from "./repo-dashboard";
import { SoonBlur } from "@/loki/components/soon-blur";
import { LayoutDashboard, CodeXml, Palette, ShieldCheck, Network, History as HistoryIcon, Sparkles, type LucideIcon } from "lucide-react";
import { devOnly } from "@/loki/dev-only";
import { useNarrow } from "@/loki/cowork/use-narrow";
import { DesignView } from "./design-view";
import { RulesPanel } from "./rules-panel";
import { PaperCreatorInline } from "./constitution-agents";
import { useWorkspaces } from "@/loki/api/hooks";
import { XraySpaceContext } from "./xray-space";
import { startContextDrag, textOf } from "@/loki/shell/drag-context";
import { DescriptionView } from "./atlas-description";
import { DecoratorStrip, DocsView, ViolationStrip, bucketConstitution, fetchFileCon, conTone, FileScoreModal, FileReviewBody, FolderStageBody, AXIS_HINT, fileDossier, type FileCon } from "./atlas-decorators";
import { GravityMap } from "./gravity-map";
import { DataStoriesPanel } from "./data-stories-panel";
import { HistoryPanel } from "./history-panel";
import { SubstratePanel } from "./substrate-panel";
import { ReviewHistoryPanel } from "./review-history-panel";
import { AuthorsPanel } from "./authors-panel";
import { CoveragePanel } from "./coverage-panel";
import { FileHistoryReplay } from "./file-history-replay";
import { ExportButtons } from "@/loki/util/export-view";
import { registerHere, type StoreItem } from "@/loki/shell/command-store-registry";

/** THE ICON OF EACH X-RAY SECTION, in the right sidebar (operator 2026-10-11: "add pretty icons to each item, pretty minimalist"): one thin line icon per section, in the colour of its label. */
export const TAB_ICON: Record<string, LucideIcon> = { overview: LayoutDashboard, code: CodeXml, design: Palette, hurt: ShieldCheck, breaks: Network, happened: HistoryIcon, ultra: Sparkles };
const baseName = (p: string) => { const a = String(p).split(/[/\\]/).filter(Boolean); return a[a.length - 1] || String(p); };

import { buildTree, sortKids, TreeRow, type TreeNode } from "./file-tree";

/** UNSAVED TEXT OF FILES THE PERSON CLICKED AWAY FROM, by path, with the version of the file it was written against. In memory only: it survives switching files, not closing the app. */
const DRAFTS = new Map<string, { text: string; base: string }>();

export function EditorPane({ file, fileNode, blink, zoom = 0, bare = false }: { file: string | null; fileNode: any; blink?: { path: string; line: number; nonce: number } | null; zoom?: number; /** the Editor view's way: no header of buttons and no doc cards (the path is in its tab bar, saving is Ctrl/Cmd+S); only what is wrong with a line stays above it */ bare?: boolean }) {
  const [source, setSource] = React.useState<FileSource | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // THE EDITOR (operator 2026-10-11): the text is editable and saved straight to the workspace. `initial` is what the editor opens with (the file, or an unsaved draft left behind earlier), `expected` is the version
  // of the file the next save is based on (the server refuses when the disk moved on), `docKey` rebuilds the editor for a new document, and a save never changes it, so the cursor and the undo history survive.
  const root = useWorkspaces().data?.active?.root_path ?? "";
  const edRef = React.useRef<CodeEditorHandle | null>(null);
  const [initial, setInitial] = React.useState("");
  const [expected, setExpected] = React.useState("");
  const [docKey, setDocKey] = React.useState("");
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [note, setNote] = React.useState<{ kind: "ok" | "err" | "conflict"; text: string } | null>(null);
  const [reloadTick, setReloadTick] = React.useState(0);
  // every document the editor has been given, by its docKey: the file it is, the version it is based on, and whether it is being thrown away. Looked up by KEY when the editor leaves a document, because by then
  // `file` and the state may already be the next file's (React swaps a fast load in without unmounting).
  const docs = React.useRef(new Map<string, { path: string; base: string; discard?: boolean }>());
  const loadN = React.useRef(0);
  const [decs, setDecs] = React.useState<any[]>([]);
  const [fileCon, setFileCon] = React.useState<FileCon | null>(null);
  const [scoreModal, setScoreModal] = React.useState(false);
  const [showDecs, setShowDecs] = React.useState(true);
  const [histOpen, setHistOpen] = React.useState(false); // ◷ cinematic file-history replay overlay
  const [covOpen, setCovOpen] = React.useState(false);   // ✓ executed-line coverage heatmap
  const [covHeat, setCovHeat] = React.useState<Map<number, string> | null>(null);
  const [covPct, setCovPct] = React.useState<number | null>(null);
  React.useEffect(() => { setHistOpen(false); setCovOpen(false); }, [file]); // a new file closes both overlays
  // fetch the file's per-line hit counts → tint each line by how often the tests ran it (red = never)
  React.useEffect(() => {
    if (!covOpen || !file) { setCovHeat(null); setCovPct(null); return; }
    let alive = true;
    void coverageGet({ path: file }).then((r) => {
      if (!alive) return;
      const lh = (r?.line_hits ?? {}) as Record<string, number>;
      const counts = Object.values(lh).map(Number);
      const max = Math.max(1, ...counts);
      const m = new Map<number, string>(); let hit = 0, tot = 0;
      for (const [ln, c] of Object.entries(lh)) {
        const idx = Number(ln) - 1, cn = Number(c); tot += 1;
        if (cn > 0) { hit += 1; const inten = Math.log(cn + 1) / Math.log(max + 1); m.set(idx, `color-mix(in oklab, ${C.ok} ${Math.round(9 + inten * 20)}%, transparent)`); }
        else m.set(idx, `color-mix(in oklab, ${C.bad} 15%, transparent)`);
      }
      setCovHeat(m); setCovPct(tot ? Math.round((hit / tot) * 100) : null);
    });
    return () => { alive = false; };
  }, [covOpen, file]);

  // VIRTUAL decorators for the open file (deterministic doc-cards; never written to source).
  React.useEffect(() => {
    if (!file) { setDecs([]); setFileCon(null); return; }
    let cancelled = false;
    setFileCon(null);
    decorateFile({ path: file }).then((r) => { if (!cancelled) setDecs(r?.ok ? (r.decorators ?? []) : []); });
    fetchFileCon(file).then((c) => { if (!cancelled) setFileCon(c); }); // per-block + file constitution (moved into the docs)
    return () => { cancelled = true; };
  }, [file]);
  const conByLine = React.useMemo(() => bucketConstitution(decs as any, fileCon), [decs, fileCon]);
  const nbByLine = React.useMemo(() => new Map((fileCon?.blocks ?? []).map((b: any) => [b.line, b])), [fileCon]);
  const conActive = !!fileCon?.found;
  const decorations = React.useMemo(() => {
    if (!file) return null;
    const m = new Map<number, React.ReactNode>();
    if (showDecs && !bare && decs.length) {
      for (const d of decs) m.set(Math.max(0, d.line - 1), <DecoratorStrip key={`${d.name}:${d.line}`} d={d} path={file} source={source?.content ?? null} con={conByLine.get(d.line)} conActive={conActive} nb={nbByLine.get(d.line)} />);
    }
    // VIOLATION strips — one per offending LINE, always shown when a snapshot exists
    // (independent of the ◆docs toggle: a wrong line must be visible). File-level
    // violations (no line — metric/graph/absent) anchor above line 1.
    if (conActive && fileCon?.violations?.length) {
      const byLine = new Map<number, any[]>();
      for (const v of fileCon.violations) {
        const k = v.line != null ? Math.max(0, v.line - 1) : 0;
        if (!byLine.has(k)) byLine.set(k, []);
        byLine.get(k)!.push(v);
      }
      for (const [k, vs] of byLine) {
        const prev = m.get(k);
        m.set(k, (
          <React.Fragment key={`v${k}`}>
            {prev}
            <ViolationStrip vs={vs} onSelectLine={() => edRef.current?.goToLine(k + 1)} />
          </React.Fragment>
        ));
      }
    }
    return m.size ? m : null;
  }, [decs, showDecs, source, file, conByLine, conActive, fileCon]);

  React.useEffect(() => {
    setNote(null);
    if (!file) { setSource(null); setErr(null); return; }
    setSource(null); setErr(null); setBusy(true);
    let cancelled = false;
    (async () => {
      const s = await fileRead({ path: file });
      if (cancelled) return;
      setBusy(false);
      if (!s) { setErr("could not read this file (off-workspace / binary)"); return; }
      // an UNSAVED DRAFT left behind when another file was opened comes back with the file (nothing typed is ever lost by clicking away); if the disk moved on meanwhile, say so
      const draft = DRAFTS.get(file);
      if (draft) DRAFTS.delete(file);
      const key = `${file}#${++loadN.current}`, base = draft ? draft.base : s.sha256;
      docs.current.set(key, { path: file, base });
      setSource(s); setInitial(draft ? draft.text : s.content); setExpected(base);
      setDocKey(key);
      if (draft && draft.base !== s.sha256) setNote({ kind: "conflict", text: "this file changed on disk while you were away. Your unsaved text is back; reload to drop it, or save anyway to overwrite the disk copy." });
    })();
    return () => { cancelled = true; };
  }, [file, reloadTick]);

  // closing the window with unsaved text asks first
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // the editor is being torn down (another file, a reload, the pane closing): keep what was typed as a draft for that file
  const onLeave = React.useCallback((text: string, wasDirty: boolean, key: string) => {
    const m = docs.current.get(key); docs.current.delete(key); if (!m) return;
    if (m.discard || !wasDirty) { DRAFTS.delete(m.path); return; }
    DRAFTS.set(m.path, { text, base: m.base });
  }, []);

  async function save(base?: string) {
    if (!file || !source || saving || !edRef.current) return;
    const text = edRef.current.getText();
    setSaving(true); setNote(null);
    const r = await fileSave({ path: file, content: text, expected_sha256: base ?? expected });
    setSaving(false);
    if (r.ok) {
      edRef.current?.markSaved(text);
      setSource((cur) => (cur ? { ...cur, content: text, sha256: r.sha256, bytes: r.bytes, lines: r.lines } : cur));
      setExpected(r.sha256); const d = docs.current.get(docKey); if (d) d.base = r.sha256; DRAFTS.delete(file);
      markEdited(root, file);   // the X-ray's analysis of this file is now out of date: the rebuild button says so
      setNote({ kind: "ok", text: "saved to the workspace" });
    } else setNote({ kind: r.conflict ? "conflict" : "err", text: r.error });
  }
  /** drop the unsaved text and read the file from disk again */
  function reload() { const d = docs.current.get(docKey); if (d) d.discard = true; DRAFTS.delete(file ?? ""); setNote(null); setReloadTick((n) => n + 1); }
  /** the disk copy changed under the editor and the person chose their text over it: read the new version's hash, then save over it */
  async function saveAnyway() { if (!file) return; const cur = await fileRead({ path: file }); if (cur) await save(cur.sha256); else setNote({ kind: "err", text: "could not read the file to compare" }); }
  function revert() { if (source) edRef.current?.setText(source.content); setNote(null); }

  if (!file) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.muted, fontFamily: mono, fontSize: 11 }}>select a file from the tree</div>;

  const fontPx = 11.5 + (zoom || 0);  // editor zoom (shared with the tree)

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative" }}>
      {/* ◷ CINEMATIC REPLAY — scrub this file's own git revisions with the draggable semicircle dial */}
      {histOpen && file && <FileHistoryReplay path={file} onClose={() => setHistOpen(false)} />}
      {bare ? (dirty && <div data-testid="code-unsaved" style={{ padding: "3px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 10.5, color: C.warn, flexShrink: 0 }}>unsaved · Ctrl/Cmd+S saves</div>) : <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: 8, background: extColor(file) }} />
        <code style={{ fontFamily: mono, fontSize: 11.5, color: C.fg, fontWeight: 600, wordBreak: "break-all" }}>{file}</code>
        <span style={{ flex: 1 }} />
        {conActive && fileCon && (
          <button onClick={() => setScoreModal(true)} title="click for the full breakdown — why this file scores what it does"
            style={{ background: "transparent", fontFamily: mono, fontSize: 9.5, color: conTone(fileCon.health), border: `1px solid color-mix(in oklab, ${conTone(fileCon.health)} 45%, ${C.border})`, borderRadius: 4, padding: "0 6px", cursor: "pointer", fontVariantNumeric: "tabular-nums" }}>§ {fileCon.health}{(fileCon.violations ?? []).length ? ` · ${fileCon.violations!.length}⚠` : ""}</button>
        )}
        {/* no snapshot → the entry point stays visible (dashed) and explains itself instead of vanishing */}
        {file && fileCon && !fileCon.found && (
          <button onClick={() => setScoreModal(true)} title="the file review needs a constitution snapshot — click to see how to regenerate it"
            style={{ background: "transparent", fontFamily: mono, fontSize: 9.5, color: C.dim, border: `1px dashed ${C.border}`, borderRadius: 4, padding: "0 6px", cursor: "pointer" }}>§ review</button>
        )}
        {scoreModal && fileCon && <FileScoreModal con={fileCon} onClose={() => setScoreModal(false)} />}
        {source && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{source.lines} lines{source.truncated ? " · truncated" : ""}</span>}
        {source && source.truncated && <span title="the file is larger than 500 KB: only a cut copy was opened, so it is shown read-only" style={{ fontFamily: mono, fontSize: 9.5, color: C.warn }}>read-only · too large to edit</span>}
        {source && !source.truncated && dirty && <span data-testid="code-unsaved" title="you have changes that are not saved to the file yet" style={{ fontFamily: mono, fontSize: 9.5, color: C.warn }}>● unsaved</span>}
        {source && !source.truncated && <>
          <button data-testid="code-save" disabled={!dirty || saving} onClick={() => void save()} title="save to the workspace (Ctrl/Cmd+S)"
            style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 4, cursor: !dirty || saving ? "default" : "pointer", background: dirty ? C.brand : C.bg, border: `1px solid ${dirty ? C.brand : C.border}`, color: dirty ? C.bg : C.dim, opacity: !dirty || saving ? 0.7 : 1 }}>{saving ? "saving…" : "save"}</button>
          <button data-testid="code-revert" disabled={!dirty || saving} onClick={revert} title="throw away the unsaved changes (undoable)"
            style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 4, cursor: !dirty ? "default" : "pointer", background: C.bg, border: `1px solid ${C.border}`, color: C.dim, opacity: !dirty ? 0.5 : 1 }}>revert</button>
        </>}
        {file && <button onClick={() => setHistOpen(true)} title="◷ replay this file's history — scrub its git revisions with the dial, watch the pieces get replaced"
          style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 4, cursor: "pointer", background: C.bg, border: `1px solid ${C.border}`, color: C.dim }}>◷ replay</button>}
        {file && <button onClick={() => setCovOpen((v) => !v)} title="coverage heatmap — tint each line by how many times your tests executed it (red = never run). Needs a coverage run (the ✓ coverage rail panel)."
          style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 4, cursor: "pointer", background: covOpen ? C.ok : C.bg, border: `1px solid ${covOpen ? C.ok : C.border}`, color: covOpen ? C.bg : C.dim }}>✓ coverage{covOpen && covPct != null ? ` ${covPct}%` : ""}</button>}
        <button onClick={() => setShowDecs((v) => !v)} title="virtual doc-cards above each block — deterministic, NOT written to the file"
          style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 4, cursor: "pointer", background: showDecs ? C.brand : C.bg, border: `1px solid ${showDecs ? C.brand : C.border}`, color: showDecs ? C.bg : C.dim }}>◆ docs{decs.length ? ` ${decs.length}` : ""}</button>
      </div>}

      {note && (
        <div data-testid="code-save-note" role="status" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "5px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 10.5,
          color: note.kind === "ok" ? C.ok : note.kind === "conflict" ? C.warn : C.bad, background: C.panel }}>
          <span>{note.kind === "ok" ? "✓ " : note.kind === "conflict" ? "⚠ " : "✕ "}{note.text}</span>
          {note.kind === "ok" && <span data-testid="code-stale-note" style={{ color: C.warn }}>· the X-ray analysis of this file is out of date: rebuild to refresh it</span>}
          {note.kind === "conflict" && <>
            <button data-testid="code-reload" onClick={reload} style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 4, cursor: "pointer", background: C.bg, border: `1px solid ${C.border}`, color: C.fg }}>reload from disk</button>
            <button data-testid="code-save-anyway" onClick={() => void saveAnyway()} style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 4, cursor: "pointer", background: C.bg, border: `1px solid ${C.warn}`, color: C.warn }}>save anyway</button>
          </>}
          <span style={{ flex: 1 }} />
          <button onClick={() => setNote(null)} title="dismiss" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 11 }}>✕</button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 120, position: "relative", display: "flex", flexDirection: "column", fontFamily: mono }}>
        {busy && <div style={{ color: C.muted, fontFamily: mono, fontSize: 11, padding: "8px 12px" }}>loading…</div>}
        {err && <div style={{ color: C.muted, fontFamily: mono, fontSize: 11, padding: "8px 12px" }}>{err}</div>}
        {source && docKey && (
          <CodeEditor ref={edRef} docKey={docKey} path={file} initial={initial} saved={source.content} fontSize={fontPx} readOnly={source.truncated}
            decorations={decorations} heatLines={covOpen ? covHeat : null}
            blink={blink && blink.path === file ? { line: blink.line - 1, nonce: blink.nonce } : null}
            onDirty={setDirty} onSave={() => void save()} onLeave={onLeave} />
        )}
      </div>
    </div>
  );
}

// The right rail: icon-only switches (label on hover) that split the editor.
// graph gets a real node-edge mark (a text glyph can't say "network"); monochrome via currentColor.
const GRAPH_GLYPH = (
  <svg width="13" height="13" viewBox="0 0 13 13" style={{ display: "block", margin: "0 auto" }}>
    <g stroke="currentColor" strokeWidth="1.1">
      <line x1="3" y1="9.9" x2="6.5" y2="3.3" /><line x1="6.5" y1="3.3" x2="10" y2="9.9" /><line x1="3" y1="9.9" x2="10" y2="9.9" />
    </g>
    <circle cx="6.5" cy="2.9" r="1.8" fill="currentColor" />
    <circle cx="2.7" cy="10.1" r="1.8" fill="currentColor" />
    <circle cx="10.3" cy="10.1" r="1.8" fill="currentColor" />
  </svg>
);
// THE RAIL IS THREE QUESTIONS (operator 2026-09-18: "antiIDE is a code-analysis tool — the rail's seven
// nouns hid the value"). A reader asks: where does it hurt · what breaks if I touch it · what happened.
// Plus THIS FILE — the review beside the source is the default companion of every open file, with the
// file's docs / description / structure / snapshot as its tabs. Execution (runner) and the agents'
// court left the rail: that is antiDesk's job. `split` stays the active MEMBER key; null = the companion.
type SplitKey = "filereview" | "graph" | "gravity" | "stories" | "history" | "coverage" | "diagram" | "docs" | "describe" | "structure" | "snapshot" | "insights" | "constitution" | "review" | "diff" | "gitgraph" | "telemetry" | "authors";
type Member = { key: SplitKey; glyph: React.ReactNode; label: string };
type Group = { key: string; glyph: string; label: string; hint: string; members: readonly Member[] };
const GROUPS: readonly Group[] = [
  { key: "file", glyph: "◧", label: "This file", hint: "the review beside the source — the default companion of every open file", members: [
    { key: "filereview", glyph: "◧", label: "code review" },
    { key: "docs", glyph: "❡", label: "docs" },
  ] },
  { key: "hurt", glyph: "◔", label: "Where does it hurt?", hint: "the riskiest files ranked, the laws the code breaks, what the tests never reach", members: [
    { key: "insights", glyph: "◔", label: "x-ray" },
    { key: "constitution", glyph: "§", label: "laws" },
    { key: "coverage", glyph: "✓", label: "coverage" },
  ] },
  { key: "breaks", glyph: "⬡", label: "What breaks if I touch it?", hint: "the import graph and its blast radius, the system diagram, gravity, the data stories", members: [
    { key: "graph", glyph: GRAPH_GLYPH, label: "graph" },
    { key: "diagram", glyph: "▦", label: "diagram" },
    { key: "gravity", glyph: "▩", label: "gravity" },
    { key: "stories", glyph: "⇢", label: "stories" },
  ] },
  { key: "happened", glyph: "⧗", label: "What happened?", hint: "the review over time, the diff, the git graph, who wrote what, the live signals", members: [
    { key: "review", glyph: "≋", label: "review history" },
    { key: "history", glyph: "◷", label: "history" },
    { key: "diff", glyph: "±", label: "diff" },
    { key: "gitgraph", glyph: "⎇", label: "git" },
    { key: "authors", glyph: "@", label: "authors" },
    { key: "telemetry", glyph: "⌁", label: "telemetry" },
  ] },
];
const MEMBERS: readonly Member[] = GROUPS.flatMap((g) => g.members);
const groupOf = (k: string | null) => (k ? GROUPS.find((g) => g.members.some((m) => m.key === k)) ?? null : null);

const statusColor = (s: string) => /A|\?/.test(s) ? C.ok : /D/.test(s) ? C.bad : /R/.test(s) ? C.brand : C.warn;
function FileRow({ status, path }: { status: string; path: string }) {
  return (
    <div title={path} style={{ display: "flex", gap: 8, padding: "1px 0", fontFamily: mono, fontSize: 10.5, overflow: "hidden" }}>
      <span style={{ color: statusColor(status), width: 18, flexShrink: 0 }}>{status}</span>
      <span style={{ color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</span>
    </div>
  );
}
const PanelMsg = ({ text }: { text: string }) => <div style={{ padding: 12, color: C.muted, fontFamily: mono, fontSize: 11, lineHeight: 1.5 }}>{text}</div>;
// honest state: distinguish loading / not-wired (BE restart) / error / non-git, instead of perpetual "loading".
function gitState(q: any): string | null {
  if (q.notWired) return "git endpoint not wired yet — restart the BE to enable it";
  if (!q.data && q.loading) return "loading…";
  if (!q.data && q.error) return "can't reach /api/v1/code/git — retrying…";
  if (!q.data) return "no git data";
  if (!q.data.is_git) return "this workspace isn't a git repo — open a git-tracked workspace to see diffs/history";
  return null;
}
// P0 of the regenerate-block epic: a one-click "Initialize git" for ZIP-download workspaces (no .git),
// so the diff/history/worktree-sandbox features can run. Non-destructive (no-ops if already a repo).
function GitInitNotice({ refetch }: { refetch: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const init = async () => {
    setBusy(true); setErr(null);
    const r = await gitInit();
    setBusy(false);
    if (r?.ok || r?.result?.ok) refetch();
    else setErr(r?.error ?? r?.result?.error ?? "git init failed");
  };
  return (
    <div style={{ padding: 14, fontFamily: mono, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
      This folder isn't a git repository yet.<br />
      Initialize git here to enable diffs, history, and the worktree sandbox (regenerate / merge).
      <div style={{ marginTop: 9 }}>
        <button onClick={init} disabled={busy} style={{ fontFamily: mono, fontSize: 10.5, padding: "3px 11px", borderRadius: 4, cursor: busy ? "wait" : "pointer", background: C.brand, border: "none", color: C.bg }}>{busy ? "initializing…" : "⎇ Initialize git"}</button>
      </div>
      <div style={{ marginTop: 7, color: C.dim, fontSize: 9.5 }}>Creates a repo + initial commit in the workspace (node_modules ignored). Non-destructive — no-ops if already a repo.</div>
      {err ? <div style={{ marginTop: 6, color: C.bad }}>{err}</div> : null}
    </div>
  );
}
function DiffPanel() {
  const q = useCodeGit();
  const msg = gitState(q);
  if (q.data && !q.data.is_git) return <GitInitNotice refetch={q.refetch} />;
  if (msg) return <PanelMsg text={msg} />;
  const d: any = q.data;
  return (
    <div style={{ height: "100%", overflow: "auto", padding: 10 }}>
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>working tree · {d.status.length} changed</div>
      {d.status.length === 0 ? <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>✓ clean</div> : d.status.map((f: any, i: number) => <FileRow key={i} status={f.status} path={f.path} />)}
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 1, margin: "12px 0 4px" }}>last commit · {d.last_commit_files.length} files</div>
      {d.last_commit_files.map((f: any, i: number) => <FileRow key={i} status={f.status} path={f.path} />)}
    </div>
  );
}
export function GitGraphPanel() {
  const q = useCodeGit();
  const [sel, setSel] = React.useState(0);
  const msg = gitState(q);
  if (q.data && !q.data.is_git) return <GitInitNotice refetch={q.refetch} />;
  if (msg) return <PanelMsg text={msg} />;
  const d: any = q.data;
  // every git repo in the workspace (root + nested) — each its own structure; fall back to the single
  // top-level snapshot if the engine didn't send the list.
  const repos: any[] = (Array.isArray(d.repos) && d.repos.length)
    ? d.repos
    : [{ rel_path: ".", label: "repo", root: d.root, branch: d.branch, commits: d.commits }];
  const repo = repos[Math.min(sel, repos.length - 1)] ?? repos[0];
  return (
    <div style={{ height: "100%", overflow: "auto", padding: 10 }}>
      {repos.length > 1 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
          {repos.map((r: any, i: number) => (
            <button key={r.rel_path} onClick={() => setSel(i)} title={r.root}
              style={{ fontFamily: mono, fontSize: 9.5, padding: "2px 8px", borderRadius: 5, cursor: "pointer",
                color: i === sel ? C.bg : C.dim, background: i === sel ? C.brand : "transparent", border: `1px solid ${i === sel ? C.brand : C.border}` }}>
              {r.label}{r.branch ? ` · ${r.branch}` : ""}
            </button>
          ))}
        </div>
      )}
      {repos.length <= 1 && repo.branch && (
        <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, marginBottom: 8 }}>{repo.branch}</div>
      )}
      {repo.commits.map((c: any, i: number) => (
        <div key={c.sha} style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <div style={{ width: 12, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ color: c.parents.length > 1 ? C.warn : C.brand, fontSize: 11, lineHeight: "14px" }}>●</span>
            {i < repo.commits.length - 1 && <span style={{ flex: 1, width: 1, background: C.border }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 8 }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject}</div>
            <div style={{ fontFamily: mono, fontSize: 9, color: C.muted }}><span style={{ color: C.dim }}>{c.sha}</span> · {c.author} · {c.date}{c.parents.length > 1 ? " · merge" : ""}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── THE RUNNER — one terminal, 3 tabs (dev · test · build), each a live PTY over
// the workspace root (reuses PtyTerminal, the BE PTY host). The DEV tab flips
// (rotateY, iframe-safe — the PR-preview technique) between the terminal and the
// running app on its port. All three faces stay mounted (display-swap), so a
// running dev server survives tab/flip switches.

/** THE FILE REVIEW, DOCKED (operator 2026-09-18: "the file review window on click — not a modal, in the
 *  editor"): the same court-grade review the score modal opens (FileReviewBody over fetchFileCon), as the
 *  stage of the open file. The health and the path ride a slim header; the body keeps its own tabs. */
/** THE FOLDER STAGE: the folder paper (roster, members, laws) then its neighborhood — one page. */
export function FolderStage({ path, onOpenFile }: { path: string; onOpenFile: (p: string) => void }) {
  const [con, setCon] = React.useState<FileCon | null | undefined>(undefined);
  React.useEffect(() => { let alive = true; setCon(undefined); void fetchFileCon(path).then((c) => { if (alive) setCon(c); }); return () => { alive = false; }; }, [path]);
  React.useEffect(() => { if (con?.found) reportScreenPage("xray-folder", fileDossier(con)); return () => clearScreenState("xray-folder"); }, [con]);
  if (con === undefined) return <PanelMsg text="judging the folder…" />;
  if (!con || !con.found) return <PanelMsg text="this folder has no review yet — rebuild the analysis" />;
  return <div data-testid="ide-folder-stage" style={{ flex: 1, minHeight: 0, overflow: "auto", background: C.panel }}><FolderStageBody con={con} onOpenFile={onOpenFile} /></div>;
}

/** THE DOCS OF A FILE (operator 2026-09-18: "docs, describe, structure, snapshot merged into one tab docs"):
 *  the generated docs, the conceptual description, then the structure and the snapshot — stacked. */
function FileDocsStage({ path, fnode, detail }: { path: string; fnode: any; detail: any }) {
  const H = ({ t }: { t: string }) => <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim, padding: "10px 14px 4px", borderTop: `1px solid ${C.border}` }}>{t}</div>;
  return (
    <div data-testid="file-docs-stage" style={{ minHeight: "100%", background: C.panel }}>
      <DocsView origin="atlas" path={path} />
      <H t="¶ describe — what this file is for" />
      <DescriptionView path={path} />
      <H t="≡ structure — the shape of the file" />
      {fnode && detail ? <FilePanel key={`s-${fnode.path}`} node={fnode} detail={detail} hideCode defaultTab="info" /> : <PanelMsg text="no atlas node for this file" />}
      <H t="◈ snapshot — the file as the last analysis saw it" />
      {fnode && detail ? <FilePanel key={`n-${fnode.path}`} node={fnode} detail={detail} hideCode defaultTab="snap" /> : null}
    </div>
  );
}

export function FileReviewStage({ path }: { path: string }) {
  const [con, setCon] = React.useState<FileCon | null | undefined>(undefined);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => { let alive = true; setCon(undefined); void fetchFileCon(path).then((c) => { if (alive) setCon(c); }); return () => { alive = false; }; }, [path]);
  // the chat reads the same dossier the operator reads (screen manifest page)
  React.useEffect(() => { if (con?.found) reportScreenPage("xray-file", fileDossier(con)); return () => clearScreenState("xray-file"); }, [con]);
  if (con === undefined) return <PanelMsg text="judging…" />;
  if (!con) return <PanelMsg text="the review is unavailable — restart the BE" />;
  const health = con.health ?? 100;
  // WHY NOT 100 (operator 2026-09-18: "any file that is not 100 should have feedback why"): every axis
  // under 100, worst first, with the points it costs and what the axis measures — the score, explained.
  const why = con.found && health < 100 ? Object.entries(con.axes ?? {}).filter(([, a]) => a && a.score < 100).map(([k, a]) => ({ axis: k, score: a!.score, hint: AXIS_HINT[k] ?? "" })).sort((a, b) => a.score - b.score) : [];
  const nViol = (con.violations ?? []).length;
  return (
    <div data-testid="file-review-stage" ref={bodyRef} style={{ minHeight: "100%", background: C.panel }}>
      <div draggable onDragStart={(e) => startContextDrag(e, { title: `File review — ${con.path}`, text: textOf(bodyRef.current), kind: "file-review" })} title="drag the review into a chat as context"
        style={{ position: "sticky", top: 0, zIndex: 2, background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "8px 14px", display: "flex", alignItems: "center", gap: 9, cursor: "grab" }}>
        <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: C.fg }}>File review</span>
        {con.found && <b data-testid="file-review-stage-health" style={{ fontFamily: mono, fontSize: 20, color: conTone(health), fontVariantNumeric: "tabular-nums" }}>{health}</b>}
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{con.path}</span>
      </div>
      {why.length > 0 && (
        <div data-testid="file-review-why" style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, background: `color-mix(in oklab, ${conTone(health)} 6%, ${C.panel})`, fontFamily: mono, fontSize: 10.5, color: C.fg }}>
          <div style={{ fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim, marginBottom: 4 }}>why not 100</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
            {why.map((w) => (
              <span key={w.axis} title={w.hint} style={{ whiteSpace: "nowrap" }}>
                <b style={{ color: conTone(w.score) }}>{w.axis}</b> <span style={{ color: C.muted }}>{w.score}</span>
                <span style={{ color: C.dim }}> · −{100 - w.score}{w.hint ? ` — ${w.hint}` : ""}</span>
              </span>
            ))}
            {nViol > 0 && <span style={{ color: C.dim }}>{nViol} law violation{nViol === 1 ? "" : "s"} below, each with its fix</span>}
          </div>
        </div>
      )}
      {con.found ? <FileReviewBody con={con} /> : (
        <div style={{ padding: "22px 18px", fontFamily: mono, fontSize: 11.5, color: C.muted, lineHeight: 1.75 }}>
          <div style={{ color: C.warn, marginBottom: 8 }}>No review snapshot for this file yet.</div>
          The file review is deterministic — it reads a constitution/judgment snapshot of the atlas. Rebuild the codebase (↻ in the tree header) and the review appears here.
        </div>
      )}
    </div>
  );
}

export function FilesIDE({ groups, atlas, selected, onSelect, onPick, renderInsights, onExpandGraph, rebuild, scopeView }: { groups: any[]; atlas: any; selected: { path: string; fileNode: any } | null; onSelect: (n: { path: string; fileNode: any }) => void; onPick?: (id: string) => void; renderInsights?: () => React.ReactNode; onExpandGraph?: () => void; rebuild?: React.ReactNode; scopeView?: React.ReactNode }) {
  // VSCode-style aside modes — the tree header icons switch the left panel between files / search / scope.
  const [aside, setAside] = React.useState<"files" | "search" | "scope">("files");
  const [railOpen, setRailOpen] = React.useState(false); // the right rail: icons only ⟷ icon + name
  const [zoom, setZoom] = React.useState(0); // shared font-size delta for the tree + the editor (zoom in/out)
  const [split, setSplit] = React.useState<null | SplitKey>(null);
  // the companion: with a file open and no rail pick, the review is the split (operator 2026-09-18)
  // UI bus: the assistant opens a sidebar view (and optionally selects a file) — $0, just surfaces.
  React.useEffect(() => {
    const apply = () => {
      const req = consumePendingIdeView();
      if (!req) return;
      if (req.view) setSplit(req.view as SplitKey);
      if (req.path) { try { onSelect({ path: req.path, fileNode: fileNodeFor(req.path) }); } catch { /* unknown path — view still opens */ } }
    };
    apply(); // arriving via navigation — the request was parked before mount
    const h = () => apply();
    window.addEventListener("antiloki:ui", h as any);
    return () => window.removeEventListener("antiloki:ui", h as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [groupMember, setGroupMember] = React.useState<Record<string, string>>({}); // per-group last-open member, so re-opening a group returns to your tab
  const splitBodyRef = React.useRef<HTMLDivElement | null>(null); // export target for the active split panel
  // diagram → editor bridge: clicking a file node opens it here; clicking a block node blinks its line.
  const [blink, setBlink] = React.useState<{ path: string; line: number; nonce: number } | null>(null);
  const nonceRef = React.useRef(0);
  const fileNodeFor = (path: string) => atlas?.nodes?.find((x: any) => x.type === "file" && x.path === path);
  const openFromDiagram = (path: string) => onSelect({ path, fileNode: fileNodeFor(path) });
  const manySpaces = (React.useContext(XraySpaceContext)?.spaces.length ?? 0) > 1;   // the space filter is the page's own band then (xray-space-bar.tsx)
  const wsName = String(useWorkspaces().data?.active?.name ?? "default"); // the ultra review keeps its last run per workspace
  // THE ⌘K "HERE" SECTION for the Explorer (operator 2026-07-24: "we already have a command palette,
  // personalized per screen — the Explorer just isn't showing its stuff"). The Architecture Command
  // Palette: navigate the SYSTEM, not files — each verb opens the split/lens that already answers it.
  React.useEffect(() => {
    const here = (k: typeof split) => () => setSplit(k);
    const f = selected ? baseName(selected.path) : null;
    const items: StoreItem[] = [
      { icon: "▩", tint: C.brand, label: "gravity heatmap — the worst subsystem, at a glance", hint: "health · cascade · ownership · debt · heat", run: here("gravity") },
      { icon: "⇢", tint: C.brand, label: "data stories — draw a data flow end-to-end", hint: "entry → every file it crosses → death point", run: here("stories") },
      { icon: "◷", tint: C.brand, label: "architecture over time — health trend + what changed", hint: "the timeline + the latest structural incident", run: here("history") },
      { icon: "✓", label: "test coverage — the real executed-line signal", hint: "run your suite → per-file coverage", run: here("coverage") },
      { icon: "◔", label: "x-ray — riskiest files, smells, why", run: here("insights") },
      { icon: "◉", label: "dependency graph", run: here("graph") },
      { icon: "▦", label: f ? `diagram — ${f}` : "architecture diagram", run: here("diagram") },
      { icon: "§", label: f ? `review — why ${f}'s score` : "constitution — the house laws", run: here("constitution") },
      { icon: "¶", label: f ? `describe ${f}` : "describe the open file", run: here("describe") },
      { icon: "❡", label: "docs — the self-generated documentation", run: here("docs") },
      { icon: "◧", label: f ? `review — ${f} beside the source` : "the file review", run: here("filereview") },
      { icon: "◈", label: f ? `snapshot ${f}` : "file snapshot", run: here("snapshot") },
    ];
    return registerHere("AntiIDE · explorer", items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.path]);
  const revealLine = (path: string, line: number) => {
    if (selected?.path !== path) onSelect({ path, fileNode: fileNodeFor(path) });
    setBlink({ path, line, nonce: ++nonceRef.current });
  };
  // THE FILE VIEW (operator 2026-09-18: "on click the default view is the file review, not a window
  // docked in the editor; an eye icon to see the code"): the review takes the stage; 👁 flips to the
  // source and back. The "This file" members (docs · describe · structure · snapshot) are its tabs.
  const dashRef = React.useRef<HTMLDivElement | null>(null);
  // the rail as the dashboard's table of contents: a group scrolls to its first section
  const TOC: Record<string, DashTab> = { hurt: "hurt", breaks: "breaks", happened: "happened" };
  const [dashTab, setDashTabRaw] = React.useState<DashTab>(() => { try { return (localStorage.getItem("antiloki:ide-dash-tab") as DashTab) || "overview"; } catch { return "overview"; } });
  const setDashTab = (k: DashTab) => { setDashTabRaw(k); try { localStorage.setItem("antiloki:ide-dash-tab", k); } catch { /* fine */ } };
  // THE CODE IS THE FRONT FACE (operator 2026-09-18: "code should be the default view and review on click
  // with a flip animation"): the stage is a card; ◧ review flips it (rotateY) to the review, 👁 code flips back.
  const [fileView, setFileView] = React.useState<"review" | "code">("code");
  const [fileTab, setFileTab] = React.useState<SplitKey>("filereview");
  const [flipped, setFlipped] = React.useState(false); // the review face has been shown at least once → keep it mounted
  // a folder picked by NAME in the tree (the arrow only expands) → the folder stage (paper + neighborhood)
  const [folderPick, setFolderPick] = React.useState<string | null>(null);
  React.useEffect(() => { setFileView("code"); setFileTab("filereview"); setFlipped(false); if (selected) { setFolderPick(null); setDashTab("code"); setSplit(null); } }, [selected?.path]); // eslint-disable-line react-hooks/exhaustive-deps
  const FILE_TABS: SplitKey[] = ["filereview", "docs"];
  // SCREEN MANIFEST: antiIDE tells the chat which file is selected and which analysis view is open.
  React.useEffect(() => {
    const tabLabel = DASH_TABS.find((x) => x.key === dashTab)?.label ?? dashTab;
    const stage = dashTab !== "code" ? `the ${tabLabel} dashboard` : folderPick ? `folder review of ${folderPick} (paper + neighborhood)` : selected?.path ? `file ${selected.path} — showing the ${fileView === "code" ? "code" : fileTab === "docs" ? "docs (generated docs · describe · structure · snapshot)" : "code review (annotated review · beyond the lines · history)"}` : "the repository docs (no file picked)";
    reportScreenState("xray-screen", `X-ray — tab ${tabLabel} · ${stage}${split ? ` · full view: ${split}` : ""}`);
    return () => clearScreenState("xray-screen");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.path, split, dashTab, folderPick, fileView, fileTab]);
  const effSplit: SplitKey | null = split && !FILE_TABS.includes(split) ? split : null;
  // REAL fullscreen (the browser Fullscreen API, F11-like) of the ENTIRE code view — not a CSS overlay.
  const ideRef = React.useRef<HTMLDivElement | null>(null);
  // A PHONE (operator 2026-11-12: "on a small screen the X-ray page is bad because the right sidebar is not collapsed"): the file tree and the sections menu are 382 px of a 390 px screen. Under the narrow width both fold away and open over the page from a bar of its own.
  const narrow = useNarrow(); const [menuOpen, setMenuOpen] = React.useState(false); const [treeOpen, setTreeOpen] = React.useState(false);
  React.useEffect(() => { setTreeOpen(false); }, [selected?.path]);   // a file was picked: the tree gets out of the way
  const [fsActive, setFsActive] = React.useState(false);
  React.useEffect(() => {
    const onFs = () => setFsActive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen?.(); else ideRef.current?.requestFullscreen?.(); };
  const tree = React.useMemo(() => buildTree(groups.map((g) => ({ path: g.path, fileNode: g.fileNode }))), [groups]);
  const [openMap, setOpenMap] = React.useState<Record<string, boolean>>({});
  const setOpen = React.useCallback((p: string, v: boolean) => setOpenMap((m) => ({ ...m, [p]: v })), []);

  // entry-point counts per path — each file's count + cumulative on every ancestor folder, so a
  // folder row shows how much external surface lives under it. Reloads when the atlas changes.
  const [epCounts, setEpCounts] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await entryPointsGet({});
      if (!alive || !r) return;
      const m: Record<string, number> = {};
      for (const [path, items] of Object.entries(r.by_path)) {
        const n = (items as any[]).length;
        m[path] = (m[path] ?? 0) + n;
        const parts = path.split("/");
        for (let i = 1; i < parts.length; i++) { const pre = parts.slice(0, i).join("/"); m[pre] = (m[pre] ?? 0) + n; }
      }
      setEpCounts(m);
    })();
    return () => { alive = false; };
  }, [atlas?.node_count]);
  const epCount = React.useCallback((p: string) => epCounts[p] ?? 0, [epCounts]);

  // token estimate per path — each file's count + cumulative on every ancestor folder (mirrors epCounts), so a
  // folder row shows the token weight under it. From atlas.file_tokens (getAtlas({with_tokens})).
  const tokCounts = React.useMemo(() => {
    const ft = atlas?.file_tokens; if (!ft) return null;
    const m: Record<string, number> = {};
    for (const [path, n] of Object.entries(ft)) {
      m[path] = (m[path] ?? 0) + (n as number);
      const parts = String(path).split("/");
      for (let i = 1; i < parts.length; i++) { const pre = parts.slice(0, i).join("/"); m[pre] = (m[pre] ?? 0) + (n as number); }
    }
    return m;
  }, [atlas?.file_tokens]);
  const tokCount = React.useCallback((p: string) => tokCounts?.[p] ?? null, [tokCounts]);

  // VSCode-style symbol search at the top of the tree: type → results replace the tree; click → open.
  const [searchQ, setSearchQ] = React.useState("");
  const [searchRes, setSearchRes] = React.useState<any>(null);
  async function runSearch() {
    const q = searchQ.trim();
    if (!q) { setSearchRes(null); return; }
    setSearchRes(await findSymbol({ query: q, limit: 30 }));
  }
  const openId = (id: string, path: string) => {
    if (onPick) onPick(id);
    else onSelect({ path, fileNode: atlas?.nodes?.find((x: any) => x.type === "file" && x.path === path) });
  };

  // the same sidebar as the graph's file overlay (structure + 🧠 snapshot) — minus the code tab,
  // since the editor IS the code here. Built from the atlas like the graph does.
  const detail = selected && atlas ? fileDetail(atlas, selected.path) : null;
  const fnode = selected && detail
    ? { path: selected.path, color: extColor(selected.path), fanIn: detail.importers.length, fanOut: detail.imports.length, intent: detail.fileNode?.intent }
    : null;

  return (
    <div ref={ideRef} style={fsActive
      ? { display: "flex", height: "100vh", overflow: "hidden", background: C.panel, position: "relative" }
      : { display: "flex", flex: 1, minHeight: 0, overflow: "hidden", background: C.panel, position: "relative" }}>
      {narrow && (menuOpen || treeOpen) && <div data-testid="ide-scrim" onClick={() => { setMenuOpen(false); setTreeOpen(false); }} style={{ position: "absolute", inset: 0, zIndex: 29, background: "rgba(0,0,0,.45)" }} />}
      {/* THE TREE — only on the Code tab (operator 2026-09-18: "take out the file tree, only on the Code tab") */}
      {dashTab === "code" && <div data-testid="ide-tree" style={narrow ? { position: "absolute", left: 0, top: 0, bottom: 0, width: "min(280px, 86vw)", zIndex: 30, borderRight: `1px solid ${C.border}`, display: treeOpen ? "flex" : "none", flexDirection: "column", background: C.bg, boxShadow: "8px 0 24px rgba(0,0,0,.4)" } : { width: 210, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", background: C.bg, flexShrink: 0 }}>
        {/* VSCode-style icon header — search · scope (the rebuild lives on the page header now) */}
        {/* AT THE RIGHT, NOT THE LEFT (operator 2026-10-11: "the search icon and the settings of this tab are behind the antiloki logo, place them at the right top of the section"). The expanded logo floats fixed over the
            top-left corner of every screen (`screen-switch.tsx`), which is exactly where these icons started; the spacer now comes first, so they sit at this column's top right, clear of it. */}
        <div data-testid="ide-tree-icons" style={{ display: "flex", gap: 2, alignItems: "center", padding: "5px 6px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ flex: 1 }} />
          <button title="search symbols" onClick={() => setAside((a) => (a === "search" ? "files" : "search"))} style={{ width: 26, height: 24, borderRadius: 5, border: "none", cursor: "pointer", background: aside === "search" ? C.panel2 : "transparent", color: aside === "search" ? C.brand : C.muted, fontSize: 12 }}>🔍</button>
          {scopeView && <button title="scope — folders & extensions the atlas indexes" onClick={() => setAside((a) => (a === "scope" ? "files" : "scope"))} style={{ width: 26, height: 24, borderRadius: 5, border: "none", cursor: "pointer", background: aside === "scope" ? C.panel2 : "transparent", color: aside === "scope" ? C.brand : C.muted, fontSize: 13 }}>⚙</button>}
          {aside !== "files" && <button title="files" onClick={() => setAside("files")} style={{ width: 26, height: 24, borderRadius: 5, border: "none", cursor: "pointer", background: "transparent", color: C.muted, fontSize: 12 }}>🗂</button>}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "6px 0", minHeight: 0 }}>
          {aside === "scope" && scopeView}
          {aside === "search" && (
            <div style={{ fontFamily: mono, fontSize: 10.5 }}>
              <div style={{ padding: "2px 8px 6px" }}>
                <input autoFocus value={searchQ} spellCheck={false}
                  onChange={(e) => { setSearchQ(e.target.value); if (!e.target.value.trim()) setSearchRes(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); if (e.key === "Escape") { setSearchQ(""); setSearchRes(null); setAside("files"); } }}
                  placeholder="search symbols…  ↵"
                  style={{ width: "100%", boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, color: C.fg, fontFamily: mono, fontSize: 10.5, padding: "4px 7px" }} />
              </div>
              {searchRes != null && (<>
                <div style={{ color: C.dim, padding: "2px 10px 4px" }}>{searchRes.count ?? 0} match{(searchRes.count ?? 0) === 1 ? "" : "es"}</div>
                {(searchRes.matches ?? []).map((m: any) => (
                  <div key={m.node.id} onClick={() => openId(m.node.id, m.node.path)} title={m.node.id}
                    style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "1.5px 10px", cursor: "pointer", color: C.muted }}>
                    <span style={{ fontSize: 8, color: C.dim, textTransform: "uppercase", minWidth: 40, flexShrink: 0 }}>{m.node.type}</span>
                    <span style={{ color: C.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.node.name ?? baseName(m.node.path)}</span>
                  </div>
                ))}
              </>)}
            </div>
          )}
          {aside === "files" && sortKids(tree).map((c) => (
            <TreeRow key={c.path} node={c} depth={0} selected={folderPick ?? selected?.path ?? null}
              onPick={(n: TreeNode) => onSelect({ path: n.path, fileNode: n.fileNode })}
              onPickFolder={(n: TreeNode) => { setFolderPick((cur) => (cur === n.path ? null : n.path)); setDashTab("code"); setSplit(null); }}
              openMap={openMap} setOpen={setOpen} epCount={epCount} tokCount={tokCount} fontPx={10.5 + zoom} />
          ))}
        </div>
      </div>}
      <div data-tour="ide-editor" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {narrow && <div data-testid="ide-narrow-bar" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
          <button data-testid="ide-menu-toggle" aria-expanded={menuOpen} aria-label="X-ray sections" onClick={() => { setMenuOpen((o) => !o); setTreeOpen(false); }} style={{ fontFamily: mono, fontSize: 12, color: C.fg, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>☰ {DASH_TABS.find((x) => x.key === dashTab)?.label ?? "Sections"}</button>
          {dashTab === "code" && <button data-testid="ide-tree-toggle" aria-expanded={treeOpen} aria-label="files" onClick={() => { setTreeOpen((o) => !o); setMenuOpen(false); }} style={{ fontFamily: mono, fontSize: 12, color: C.fg, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Files</button>}
        </div>}
        {/* THE PAGE HEADER BAND: the strip the floating logo, screen switch and instruments sit in, so nothing sits under them. The menu is NOT here any more (operator 2026-10-11: "find another solution for the menu of X-ray,
            make it a sidebar right"): it is the sidebar at the right of the page, below this strip. */}
        <div data-testid="ide-chrome" style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 38, padding: "0 12px 0 96px",   /* room for the wide logo at the top-left (operator 2026-10-11: always expanded here) */ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
          <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, whiteSpace: "nowrap" }}>{manySpaces ? "" : "the repository"}</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* the file toolbar (Code tab): the path, 👁 code / ◧ review, zoom, fullscreen */}
        {dashTab === "code" && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 10px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
          <span style={{ flex: 1, fontFamily: mono, fontSize: 10, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folderPick ? `📁 ${folderPick}` : selected?.path ?? "the repository docs — pick a file in the tree for its code, a folder name for its review"}</span>
          {folderPick && <button data-testid="ide-folder-close" onClick={() => setFolderPick(null)} title="close the folder review" style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", fontFamily: mono, fontSize: 10, color: C.muted, padding: "1px 7px" }}>✕ folder</button>}
          {selected && !folderPick && fileView === "review" && FILE_TABS.map((k) => { const m = MEMBERS.find((x) => x.key === k)!; const on = fileTab === k; return (
            <button key={k} data-testid={`file-tab-${k}`} onClick={() => setFileTab(k)} style={{ fontFamily: mono, fontSize: 9.5, padding: "1px 7px", cursor: "pointer", background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${on ? C.brand : "transparent"}`, borderRadius: 5, color: on ? C.brand : C.muted }}>{m.label}</button>
          ); })}
          {selected && !folderPick && <button data-testid="ide-eye" onClick={() => { setFlipped(true); setFileView((v) => (v === "review" ? "code" : "review")); }} title={fileView === "review" ? "see the code" : "back to the review"}
            style={{ background: fileView === "code" ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${fileView === "code" ? C.brand : C.border}`, borderRadius: 5, cursor: "pointer", fontFamily: mono, fontSize: 11, color: fileView === "code" ? C.brand : C.muted, padding: "1px 7px" }}>{fileView === "review" ? "👁 code" : "◧ review"}</button>}
          <button onClick={() => setZoom((z) => Math.max(-4, z - 1))} title="zoom out — smaller text (tree + code)" style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: mono, fontSize: 12, color: C.dim }}>A−</button>
          <button onClick={() => setZoom(0)} title="reset zoom" style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: mono, fontSize: 9.5, color: C.dim, minWidth: 32 }}>{Math.round((11.5 + zoom) / 11.5 * 100)}%</button>
          <button onClick={() => setZoom((z) => Math.min(16, z + 1))} title="zoom in — larger text (tree + code)" style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: mono, fontSize: 13, color: C.dim }}>A+</button>
          <span style={{ width: 1, height: 14, background: C.border, margin: "0 2px" }} />
          <button onClick={toggleFs} title={fsActive ? "exit fullscreen (Esc)" : "fullscreen the whole code view (F11-like)"}
            style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: mono, fontSize: 12, color: fsActive ? C.brand : C.dim }}>{fsActive ? "🗗" : "⛶"}</button>
        </div>}
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {/* THE REPO DASHBOARD (operator 2026-09-18): no file open → the repo scope as one analytics page —
              every analysis on it, the heavy ones as sections rendered when scrolled to; the rail is its
              table of contents. `⤢` takes the stage with the full panel (← dashboard returns). */}
          {dashTab === "design" && <div data-testid="ide-design" style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", background: C.bg }}><DesignView /></div>}
          {dashTab !== "code" && dashTab !== "design" && !split && (
            <div ref={dashRef} data-testid="ide-front-page" data-tour="ide-front-page" style={{ flex: 1, minWidth: 0, overflow: "auto", background: C.bg }}>
              <RepoDashboard chrome={false} onOpen={(k) => setSplit(k)} onOpenFile={openFromDiagram} rebuildNode={rebuild} tab={dashTab} onTab={setDashTab} extra={[
                { key: "diagram", tab: "breaks", title: "System diagram", sub: "boxes and labeled arrows, folder by folder — click a box to drill in", open: "diagram", height: 420, node: () => <DiagramView atlas={atlas} focusPath={null} height={400} onPick={onPick} onOpenFile={openFromDiagram} onRevealLine={revealLine} /> },
                { key: "graph", tab: "breaks", title: "Import graph", sub: "every file and connection — pick a node for its blast radius", open: "graph", height: 320, node: () => <AtlasGraphMini atlas={atlas} height={300} onPick={onPick} /> },
                { key: "stories", tab: "breaks", title: "Data stories", sub: "entry → every file crossed → death point", open: "stories", wide: true, node: () => <DataStoriesPanel atlas={atlas} onOpen={openFromDiagram} /> },
                { key: "rules", tab: "hurt", title: "The rules", sub: "every rule the QA server checks — switch, edit, add", wide: true, eager: true, node: () => <RulesPanel /> },
                // THE ULTRA REVIEW IS THE PAPER CREATOR (operator 2026-09-19: "the paper creator is the ultra review — not a
                // part, is what I call ultra review"): a mission derived from the evidence → a swarm of specialists → the paper
                // (the study, the class, the audio); the specialists ride as its right rail, profiles by category — nothing
                // else on the tab (operator: "remove everything below"; "the sidebar left take out, the missions already
                // have scope; place the specialists as a sidebar right like a profile of them divided by category").
                { key: "papers", tab: "ultra", title: "Ultra review", sub: "the missions · the console · the papers — the specialists on the right", wide: true, eager: true, node: () => <SoonBlur on={isSoon("ultra", devOnly())} title="Ultra review is coming soon"><PaperCreatorInline filePath={selected?.path ?? null} /></SoonBlur> },
                { key: "constitution", tab: "hurt", title: "The constitution", sub: "the laws the code is judged against — model · laws · map · book", open: "constitution", node: () => <ConstitutionPanel filePath={null} /> },
                { key: "history", tab: "happened", title: "Architecture over time", sub: "health trend and the latest structural incident", open: "history", node: () => <HistoryPanel onOpen={openFromDiagram} /> },
                { key: "review", tab: "happened", title: "Review history", sub: "the file reviews scored across snapshots — movers and axis drift", open: "review", node: () => <ReviewHistoryPanel onOpen={openFromDiagram} /> },
                { key: "diff", tab: "happened", title: "Working tree diff", sub: "what is changed and not yet committed", open: "diff", node: () => <DiffPanel /> },
                { key: "gitgraph", tab: "happened", title: "Git graph", sub: "branches and history", open: "gitgraph", node: () => <GitGraphPanel /> },
                { key: "coverage-full", tab: "hurt", title: "Coverage", sub: "the executed-line signal per file", open: "coverage", node: () => <CoveragePanel onOpen={openFromDiagram} /> },
                { key: "authors-full", tab: "happened", title: "Authors", sub: "the author ↔ file graph, co-dependency, bus factor", open: "authors", node: () => <AuthorsPanel onOpen={openFromDiagram} /> },
                { key: "telemetry", tab: "happened", title: "Live signals", sub: "AI spend · latency · cache · the rebuild waterfall", open: "telemetry", node: () => <SubstratePanel /> },
              ]} />
            </div>
          )}
          {/* THE FOLDER STAGE — the folder paper + its neighborhood (operator: folder NAME click) */}
          {dashTab === "code" && folderPick && <FolderStage key={folderPick} path={folderPick} onOpenFile={(p) => { const g = groups.find((x) => x.path === p); onSelect({ path: p, fileNode: g?.fileNode }); }} />}
          {/* NOTHING PICKED → the repository's own docs live here (operator: "add docs to the docs on code tab") */}
          {dashTab === "code" && !folderPick && !selected && <div data-testid="ide-repo-docs" style={{ flex: 1, minHeight: 0, overflow: "auto" }}><DocsView origin="atlas" path={null} /></div>}
          {dashTab === "code" && !folderPick && selected && (
          <div data-testid="ide-file-stage" data-face={fileView} style={{ flex: 1, minWidth: 0, overflow: "hidden", perspective: 1600 }}>
            {/* the card: code on the front, the review on the back — rotateY flips between them */}
            <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transition: "transform .45s cubic-bezier(.4,0,.2,1)", transform: fileView === "review" ? "rotateY(180deg)" : "rotateY(0deg)" }}>
              <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <EditorPane file={selected.path} fileNode={selected.fileNode} blink={blink} zoom={zoom} />
              </div>
              {(flipped || fileView === "review") && (
              <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)", overflow: "auto", background: C.panel }}>
                {fileTab === "filereview" && <FileReviewStage path={selected.path} />}
                {fileTab === "docs" && <FileDocsStage path={selected.path} fnode={fnode} detail={detail} />}
              </div>
              )}
            </div>
          </div>
          )}
          {effSplit && dashTab !== "code" && dashTab !== "design" && (
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", borderBottom: `1px solid ${C.border}` }}>
                {(() => { const ag = groupOf(effSplit); return ag && (
                  <>
                    <span title={ag.hint} style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, flexShrink: 0 }}>{ag.label}</span>
                    <div style={{ display: ag.members.length > 1 ? "flex" : "none", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
                      {ag.members.map((m) => { const on = effSplit === m.key; return (
                        <button key={m.key} onClick={() => { setSplit(m.key); setGroupMember((p) => ({ ...p, [ag.key]: m.key })); }} title={m.label}
                          style={{ fontFamily: mono, fontSize: 9.5, padding: "1px 1px 3px", cursor: "pointer", background: "transparent",
                            border: "none", borderBottom: `2px solid ${on ? C.brand : "transparent"}`, color: on ? C.brand : C.muted }}>
                          {m.label}
                        </button>
                      ); })}
                    </div>
                  </>
                ); })()}
                <span style={{ flex: 1 }} />
                {<button data-testid="ide-back-dashboard" onClick={() => setSplit(null)} title="back to the dashboard" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>← dashboard</button>}
                <ExportButtons getNode={() => splitBodyRef.current} title={`${selected?.path ? selected.path.split("/").pop() : "atlas"} · ${MEMBERS.find((s) => s.key === effSplit)?.label ?? effSplit}`} />
                {split === "graph" && onExpandGraph && <button onClick={onExpandGraph} title="expand the full graph" style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 11, marginLeft: 6 }}>⛶</button>}
                <button onClick={() => setSplit(null)} title="close split" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12, marginLeft: 6 }}>✕</button>
              </div>
              <div ref={splitBodyRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                {split === "graph" && <AtlasGraphMini atlas={atlas} height={500} onPick={onPick} />}
                {/* DIAGRAM — the architecture/data-flow as layered boxes (same atlas data as the graph).
                    A selected file → its internals; no file → the whole-system diagram. */}
                {/* GRAVITY — the finviz-style heat map: every file a box, area = gravity (complexity mass), color = health. */}
                {split === "gravity" && <div style={{ height: "100%", overflow: "auto", padding: "6px 10px" }}><GravityMap onOpen={openFromDiagram} /></div>}
                {/* HISTORY — architecture over time: health/cycles/coverage trend + latest structural incident (local, no telemetry). */}
                {split === "history" && <HistoryPanel onOpen={openFromDiagram} />}
                {/* REVIEW — history review: the file review scored across time (repo timeline + movers + axis drift). */}
                {split === "review" && <ReviewHistoryPanel onOpen={openFromDiagram} />}
                {/* COVERAGE — the real executed-line signal from your test suite (lcov), first-party. */}
                {split === "coverage" && <CoveragePanel onOpen={openFromDiagram} />}
                {/* TELEMETRY — the substrate's live dashboard: AI spend/latency/cache + rebuild phase waterfall. */}
                {split === "telemetry" && <SubstratePanel />}
                {/* AUTHORS — the git ownership layer: author↔file graph, co-dependency, x-ray, bus-factor (local avatars). */}
                {split === "authors" && <AuthorsPanel onOpen={openFromDiagram} />}
                {/* STORIES — the data journeys: entry → every file crossed → death point, told as a timeline */}
                {split === "stories" && <DataStoriesPanel atlas={atlas} onOpen={openFromDiagram} />}
                {split === "diagram" && <DiagramView atlas={atlas} focusPath={selected?.path ?? null} height={500} onPick={onPick} onOpenFile={openFromDiagram} onRevealLine={revealLine} />}
                {/* DIGEST — merged into Insights (the deterministic code_digests review is folded into the
                    one Insights panel; its AI brief is on-demand). No separate digest split anymore. */}
                {/* DOCS — the whole-codebase documentation generated from the virtual decorators (deterministic). */}
                {/* DESCRIBE — the selected file's conceptual description (deterministic facts + LOW-AI essay). */}
                {split === "insights" && (renderInsights ? <div style={{ height: "100%", overflow: "auto", padding: "8px 12px" }}>{renderInsights()}</div> : null)}
                {split === "constitution" && <ConstitutionPanel filePath={selected?.path ?? null} />}
                {/* BOOKS — the Import Technical Book control center (moved home from antiDesk). */}
                {split === "diff" && <DiffPanel />}
                {split === "gitgraph" && <GitGraphPanel />}
              </div>
            </div>
          )}
        </div>
        </div>
        {/* THE X-RAY MENU, AS A SIDEBAR ON THE RIGHT (operator 2026-10-11): the sections, one under another, and the rebuild at its foot. It sits below the band the floating chrome uses, so it is never under the switchers. */}
        <nav data-testid="ide-menu" data-collapsed={narrow && !menuOpen ? "true" : undefined} aria-label="X-ray sections" style={narrow ? { position: "absolute", right: 0, top: 0, bottom: 0, width: "min(220px, 80vw)", zIndex: 30, borderLeft: `1px solid ${C.border}`, background: C.bg, display: menuOpen ? "flex" : "none", flexDirection: "column", padding: "10px 0 12px", overflowY: "auto", boxShadow: "-8px 0 24px rgba(0,0,0,.4)" } : { width: 172, flexShrink: 0, borderLeft: `1px solid ${C.border}`, background: C.bg, display: "flex", flexDirection: "column", padding: "10px 0 12px", overflowY: "auto" }}>
          <div data-testid="dash-tabs" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {DASH_TABS.map((x) => { const on = dashTab === x.key; return (
              <button key={x.key} data-testid={`dash-tab-${x.key}`} aria-current={on ? "page" : undefined} onClick={() => { setDashTab(x.key); setSplit(null); setMenuOpen(false); }}
                style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 10, background: on ? `color-mix(in oklab, ${C.brand} 10%, transparent)` : "transparent", border: "none", borderRight: `2px solid ${on ? C.brand : "transparent"}`, color: on ? C.fg : C.muted, padding: "8px 14px", cursor: "pointer", fontFamily: nav, fontSize: 11.5, fontWeight: on ? 700 : 500 }}>
                {(() => { const Icon = TAB_ICON[x.key]; return Icon ? <Icon size={15} strokeWidth={1.6} aria-hidden data-testid={`dash-icon-${x.key}`} style={{ flexShrink: 0, color: on ? C.brand : "currentColor", opacity: on ? 1 : 0.8 }} /> : null; })()}
                {x.label}{isSoon(x.key, devOnly()) && <sup data-testid={`dash-soon-${x.key}`} style={{ marginLeft: 2, fontSize: 8, letterSpacing: .5, textTransform: "uppercase", color: C.warn }}>soon</sup>}
              </button>
            ); })}
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ padding: "10px 12px 0", borderTop: `1px solid ${C.border}`, marginTop: 10 }}>{rebuild}</div>
        </nav>
        </div>
      </div>
    </div>
  );
}
