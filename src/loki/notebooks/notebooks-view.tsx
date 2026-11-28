// Notebooks — EPIC-NOTEBOOKS. The central research workspace, living in the chat DeepSearch tab. A NotebookLM
// for the codebase: SOURCES (a rich multi-kind grounded corpus) · ASK (grounded thread) · STUDIO (one-click
// artifacts). High-tier AI by default, switchable. Talks system.notebook.* over the dedicated `nb` DB.
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { BE_URL, apiPost, unwrapResult as unwrap } from "@/loki/api/client";
import { listSources, uploadFile, type Source } from "@/loki/api/dispatch";
import { C, mono, nav } from "@/loki/theme";
import { Markdown } from "@/loki/components/Markdown";
import { ModeSwitch } from "@/loki/chat/chat-modes";
import { AICallChip } from "@/loki/components/AICallChip";
import { ArtifactView } from "@/loki/widgets/artifact-view";
import { ClassPlayer, CommandCenter, useRegistry } from "@/loki/codebase/constitution-agents";
import { useShell } from "@/loki/shell/slug-context";
import { deriveWidgets } from "@/loki/widgets/derive";
import { WidgetHost } from "@/loki/widgets/widget-host";
import { STUDIO_CSS, GenCard } from "@/loki/widgets/studio-kit";
import { fmtTokens } from "@/loki/util/tokens";
import { buildTokenMap } from "@/loki/codebase/checkbox-tree";
import { parseViz, pressPaperHtml, MagazineView } from "./faculty-viz";
import { dlText, exportHtml, exportMp3, exportPngFromSvg, fileSlug, mdTableToCsv, printPdf } from "./artifact-export";
import { useDockSurface } from "@/loki/shell/dock";
import { markSurfaceMounted, clearSurfaceMounted } from "@/loki/demo/demo-mode";

const api = (p: string, body: any, ms?: number) => apiPost(`/api/v1/notebook/${p}`, body, ms ? { timeoutMs: ms } : undefined);

// workspace-derived sources, grouped. Toggling adds/enables a notebook_source row that feeds the corpus.
const SOURCE_GROUPS: { group: string; items: { kind: string; label: string }[] }[] = [
  { group: "Code", items: [
    { kind: "ast", label: "AST · signatures" }, { kind: "descriptions", label: "File descriptions" },
    { kind: "digest", label: "Code digest" }, { kind: "entrypoints", label: "Entry points" },
    { kind: "data_stories", label: "Data stories" }, { kind: "design", label: "Design system" },
    { kind: "tests", label: "Tests" }, { kind: "blueprint", label: "Blueprint stubs" },
    { kind: "user_stories", label: "User stories" }, { kind: "git", label: "Git history" },
  ] },
  { group: "Work", items: [
    { kind: "cards", label: "Cards" }, { kind: "contracts", label: "Contracts" },
    { kind: "failures", label: "Failures" }, { kind: "court", label: "Court verdicts" },
    { kind: "decisions", label: "Decisions" }, { kind: "timeline", label: "Timeline" },
    { kind: "runtime", label: "Runtime" },
  ] },
  { group: "Knowledge", items: [{ kind: "memory", label: "Memory" }] },
];

// Studio generators, grouped. kinds match notebook-generate KINDS.
const STUDIO: { group: string; kinds: [string, string][] }[] = [
  { group: "Documents", kinds: [["overview", "Overview"], ["briefing", "Briefing"], ["walkthrough", "Walkthrough"], ["onboarding", "Onboarding"], ["faq", "FAQ"], ["glossary", "Glossary"], ["runbook", "Runbook"], ["adr", "ADR"], ["testplan", "Test plan"]] },
  { group: "Study", kinds: [["eli5", "ELI5"]] },
  { group: "Visual", kinds: [["table", "Info table"], ["slides", "Slides"], ["timeline", "Timeline"]] },
  { group: "Critical", kinds: [["questions", "Open questions"], ["risks", "Risks"], ["critique", "Critique"]] },
];

const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 11, padding: "5px 11px", borderRadius: 6 };
const kindColor = (k: string) => (k === "artifact" ? C.brand : k === "ask" ? C.ok : C.muted);
const cap: React.CSSProperties = { fontFamily: mono, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 1 };

export function NotebooksView({ mode, setMode }: any = {}) {
  // demo-mode surface announce — render-time, so the mount fetches see it
  markSurfaceMounted("hub");
  React.useEffect(() => () => clearSurfaceMounted("hub"), []);
  const [list, setList] = React.useState<any>(null);
  const [sel, setSel] = React.useState<number | null>(null);
  const [nb, setNb] = React.useState<any>(null);
  const [scopeInfo, setScopeInfo] = React.useState<any>(null);
  const [sources, setSources] = React.useState<any[]>([]);
  const [ask, setAsk] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const tier = "high"; // notebooks always run the deepest tier
  const [modal, setModal] = React.useState<any>(null);
  const [idxMsg, setIdxMsg] = React.useState("");
  const [tutorMode, setTutorMode] = React.useState(false);
  const { setAiCallId } = useShell();
  const [fsItem, setFsItem] = React.useState<any>(null);
  const [exportOpen, setExportOpen] = React.useState<number | null>(null);
  const [classOpen, setClassOpen] = React.useState<{ deck: any; mode: "video" | "slides" } | null>(null);
  const [forge, setForge] = React.useState<{ mode: "video" | "slides" | "audio" | null } | null>(null);
  // the CLASS CARDS open a PAPER CHOOSER (operator 2026-07-19): pick an existing
  // paper to feed the class, or create a new paper via the Paper wizard.
  // THE ARTIFACT DOORS (operator 2026-07-20 correction: REUSE the Paper Creator
  // window, never a new one) — video/slides/audio all open the CommandCenter with
  // the artifact focus armed; its gallery carries the shelf + the preview/script.
  const reg = useRegistry();
  const sourceMissions = React.useMemo(() => {
    const agents: any[] = reg?.agents ?? [];
    if (!agents.length) return [];
    const pick = (cats: string[], axes: string[]) => {
      const out: any[] = [];
      for (const c2 of cats) {
        const core = agents.find((a) => a.id === `category:${c2}` && a.ready); if (core) out.push(core.id);
        for (const sp of agents.filter((a) => a.category === "specialist" && a.id.startsWith(`${c2}:`) && a.ready).slice(0, 2)) out.push(sp.id);
      }
      for (const ax of axes) { const a = agents.find((x) => x.id === `axis:${ax}` && x.ready); if (a) out.push(a.id); }
      return [...new Set(out)].slice(0, 5);
    };
    const srcNote = (sources ?? []).slice(0, 3).map((sc: any) => `«${String(sc.label ?? sc.kind).slice(0, 24)}»`).join(" ");
    return [
      { id: "nb-design", title: "Teach the design", reason: `self-generated from your sources ${srcNote} — structure, boundaries, patterns`, crew: pick(["architecture", "patterns"], ["coupling"]), mass: 9.6e8 },
      { id: "nb-risks", title: "Teach the risks", reason: `self-generated from your sources ${srcNote} — what can break, untested spots`, crew: pick(["security", "testing"], ["defects"]), mass: 9.5e8 },
      { id: "nb-story", title: "Teach the data story", reason: `self-generated from your sources ${srcNote} — where the data enters, travels, lands`, crew: pick(["architecture"], ["coupling", "change"]), mass: 9.4e8 },
    ].filter((m) => m.crew.length);
  }, [reg, sources]);
  React.useEffect(() => { if (!fsItem) return; const h = (e: KeyboardEvent) => { if (e.key === "Escape") setFsItem(null); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [fsItem]);

  const loadList = React.useCallback(async () => { setList(unwrap(await api("store", { op: "list" }))); }, []);
  const loadScope = React.useCallback(async (id: number) => { try { setScopeInfo(unwrap(await api("scope", { id }))); } catch { setScopeInfo(null); } }, []);
  const loadSources = React.useCallback(async (id: number) => { const d = unwrap(await api("source", { op: "list", notebook_id: id })); setSources(d?.sources || []); }, []);
  const loadNb = React.useCallback(async (id: number) => { const d = unwrap(await api("store", { op: "get", id })); setNb(d?.notebook ? d : null); loadScope(id); loadSources(id); }, [loadScope, loadSources]);

  React.useEffect(() => { loadList(); }, [loadList]);
  React.useEffect(() => { if (sel) loadNb(sel); else { setNb(null); setScopeInfo(null); setSources([]); } }, [sel, loadNb]);

  const notebooks = list?.notebooks || [];
  const items = nb?.items || [];
  const pins = items.filter((i: any) => i.pinned);


  const doCreate = async (title: string, scope: any) => { const d = unwrap(await api("store", { op: "create", title, scope })); setModal(null); await loadList(); if (d?.notebook?.id) setSel(d.notebook.id); };
  // THE LEARN BAR (operator 2026-07-14: research = a notebooks dashboard with
  // the same composer as chat/vibe — "What do you want to learn?"): one
  // question creates a personalized notebook (title = the question, whole-
  // workspace scope) and opens it; refine scope + sources inside.
  // THE OBSERVATORY BACKING (operator 2026-07-14: "faculties are NOT
  // notebooks — stop creating notebooks or wiring notebooks with them"):
  // opening a faculty creates NOTHING. All faculties share ONE hidden storage
  // row (scope.observatory, excluded from the library) created lazily on the
  // first expedition/storm/dispatch; faculty data is namespaced by a «key»
  // title prefix. The faculty UI is its own surface, not the notebook tool.
  const [facKey, setFacKey] = React.useState<string | null>(null);
  const [obs, setObs] = React.useState<{ id: number; items: any[]; sources: any[] } | null>(null);
  const obsRowId = () => (list?.notebooks ?? []).find((n2: any) => n2.scope?.observatory)?.id ?? null;
  const loadObs = React.useCallback(async (id: number) => {
    const d = unwrap(await api("store", { op: "get", id }));
    const sc = unwrap(await api("source", { op: "list", notebook_id: id }));
    setObs({ id, items: d?.items ?? [], sources: sc?.sources ?? [] });
  }, []);
  React.useEffect(() => { const id = obsRowId(); if (facKey && id && (!obs || obs.id !== id)) void loadObs(id); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [facKey, list]);
  const ensureObs = async (): Promise<number | null> => {
    const ex = obsRowId(); if (ex) return ex;
    const d = unwrap(await api("store", { op: "create", title: "· observatory ·", scope: { paths: [], deps: false, dependents: false, observatory: true } }));
    await loadList();
    return d?.notebook?.id ? Number(d.notebook.id) : null;
  };
  const facFire = async (q: string) => {
    if (!facKey || busy) return; setBusy("ask");
    try { const id = await ensureObs(); if (!id) return; const d = unwrap(await api("ask", { id, question: `«${facKey}» ${q}`, tier }, 240000)); if (d && d.ok === false) alert(d.error || "ask failed"); await loadObs(id); } finally { setBusy(""); }
  };
  const facGenerate = async (kind: string) => {
    if (!facKey || busy) return; setBusy(kind);
    try { const id = await ensureObs(); if (!id) return; const d = unwrap(await api("generate", { id, kind, tier }, 240000)); if (d && d.ok === false) alert(d.error || "generate failed"); await loadObs(id); } finally { setBusy(""); }
  };
  const facPin = async (itemId: number, pinned: number) => { const id = obsRowId(); if (!id) return; await api("store", { op: "pin", item_id: itemId, pinned: !pinned }); await loadObs(id); };
  const facAddSource = async (kind: string, label: string, body: string, ref?: string) => { const id = await ensureObs(); if (!id) return; await api("source", { op: "add", notebook_id: id, kind, label: `«${facKey}» ${label}`, body_md: body, ref }); await loadObs(id); };
  // ARCHIVE: the flag rides the notebook scope JSON — restored (the
  // observatory splice swallowed it)
  const toggleArchive = async (nRow: any) => { await api("store", { op: "update", id: nRow.id, scope: { ...(nRow.scope ?? {}), archived: !nRow.scope?.archived } }); if (sel === nRow.id) setSel(null); loadList(); };
  const [nbOpen, setNbOpen] = React.useState(false);
  const [learn, setLearn] = React.useState("");
  const createFromLearn = async (qArg?: string) => {
    const qn = (qArg ?? learn).trim(); if (!qn || busy) return;
    setBusy("learn");
    try {
      const d = unwrap(await api("store", { op: "create", title: qn.slice(0, 80), scope: { paths: [], deps: false, dependents: false } }));
      await loadList();
      if (d?.notebook?.id) setSel(d.notebook.id);
      setLearn("");
    } finally { setBusy(""); }
  };
  const doScope = async (scope: any) => { await api("store", { op: "update", id: sel, scope }); setModal(null); if (sel) loadNb(sel); };
  const saveScope = async (scope: any) => { if (!sel) return; await api("store", { op: "update", id: sel, scope }); loadScope(sel); };
  const doAsk = async (qArg?: string) => { const q = (qArg ?? ask).trim(); if (!q || !sel || busy) return; setBusy("ask"); const d = unwrap(await api("ask", { id: sel, question: q, tier, mode: tutorMode ? "tutor" : undefined }, 240000)); setBusy(""); if (d && d.ok === false) { alert(d.error || "ask failed"); return; } setAsk(""); loadNb(sel); };
  // THE DOCK FIELD is the research composer (operator 2026-07-20: the old bars
  // are gone): dashboard = "what do you want to learn?" → a personalized
  // notebook; inside a notebook = the grounded ask (tutor-aware).
  useDockSurface(React.useMemo(() => (sel == null ? {
    placeholder: "what do you want to learn?",
    hint: "⏎ creates a personalized notebook · drag ⠿ to dock the chat",
    submit: (t: string) => { void createFromLearn(t); },
  } : {
    placeholder: tutorMode ? "Ask your tutor — it teaches + asks back…" : "Ask this notebook — grounded in its sources…",
    hint: "⏎ asks this notebook · drag ⠿ to dock the chat",
    submit: (t: string) => { void doAsk(t); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sel, tutorMode, busy]));
  // direct ask (the course player fires lectures + office-hours questions
  // programmatically — no ask-bar state involved)
  const fireAsk = async (q: string) => { if (!q || !sel || busy) return; setBusy("ask"); const d = unwrap(await api("ask", { id: sel, question: q, tier }, 240000)); setBusy(""); if (d && d.ok === false) { alert(d.error || "ask failed"); return; } loadNb(sel); };
  const doGenerate = async (kind: string) => { if (!sel || busy) return; setBusy(kind); const d = unwrap(await api("generate", { id: sel, kind, tier }, 240000)); setBusy(""); if (d && d.ok === false) { alert(d.error || "generate failed"); return; } loadNb(sel); };
  const doPin = async (itemId: number, pinned: number) => { await api("store", { op: "pin", item_id: itemId, pinned: !pinned }); if (sel) loadNb(sel); };
  const doDelete = async (id: number) => { if (!confirm("Delete this notebook and its items?")) return; await api("store", { op: "delete", id }); setSel(null); loadList(); };
  const openPromote = async (itemId?: number) => { setBusy("promote"); const d = unwrap(await api("promote", { id: sel, item_id: itemId, draft: true }, 60000)); setBusy(""); if (d?.draft) setModal({ mode: "promote", title: d.title, body: d.body }); };
  const confirmPromote = async (title: string, body: string) => { const r = unwrap(await api("promote", { id: sel, title, body })); setModal(null); if (r?.slug) alert(`Created backlog card ${r.slug}`); if (sel) loadNb(sel); };
  const indexCode = async () => { setBusy("index"); setIdxMsg(""); try { const d = unwrap(await apiPost("/api/v1/rag/sweep", { tables: ["code.code_nodes", "code.code_descriptions", "code.code_data_stories"], limit_per_table: 8000 }, { timeoutMs: 600000 })); setIdxMsg(d ? `indexed ${d.embedded ?? 0} new · ${d.total_chunks ?? "?"} chunks` : "index failed"); } catch (e: any) { setIdxMsg(e?.message || "index failed"); } setBusy(""); };
  const doDiagram = async () => { if (!sel || busy) return; setBusy("diagram"); const d = unwrap(await api("diagram", { id: sel }, 120000)); setBusy(""); if (d && d.ok === false) { alert(d.error || "no diagrams"); return; } loadNb(sel); };
  const doCompare = async (otherId: number) => { setModal(null); if (!sel || !otherId) return; setBusy("compare"); const d = unwrap(await api("compare", { id_a: sel, id_b: otherId, tier }, 240000)); setBusy(""); if (d && d.ok === false) { alert(d.error || "compare failed"); return; } loadNb(sel); };
  const doMindmap = async () => { if (!sel || busy) return; setBusy("mindmap"); const d = unwrap(await api("mindmap", { id: sel, tier }, 180000)); setBusy(""); if (d && d.ok === false) { alert(d.error || "mind map failed"); return; } loadNb(sel); };
  const doQuiz = async () => { if (!sel || busy) return; setBusy("quiz"); const d = unwrap(await api("quiz", { id: sel, tier }, 180000)); setBusy(""); if (d && d.ok === false) { alert(d.error || "quiz failed"); return; } loadNb(sel); };
  // one deck, two doors: "Video class" narrates it, "Presentation" opens it silent —
  // the SAME generation (one call), the player just starts in the chosen mode.
  // Every door opens THE COMMAND CENTER (operator 2026-07-20: reuse the paper
  // creator window): its shelf teaches/narrates an existing paper, its missions
  // create a new one — the artifact is always a projection of a paper.
  const doClass = (mode2: "video" | "slides" | "audio") => { if (!sel) return; setForge({ mode: mode2 }); };
  const doPaper = () => { if (!sel) return; setForge({ mode: null }); };
  const doFlashcards = async () => { if (!sel || busy) return; setBusy("flashcards"); const d = unwrap(await api("flashcards", { id: sel, tier }, 180000)); setBusy(""); if (d && d.ok === false) { alert(d.error || "flashcards failed"); return; } loadNb(sel); };

  // Exports v1 (research architecture plan, 2026-07-20): each artifact leaves in its
  // natural file type — deterministic, client-side (artifact-export.ts).
  const exportOptionsFor = (it: any) => {
    const opts: Array<{ k: string; label: string }> = [{ k: "md", label: "⬇ .md" }];
    if (mdTableToCsv(it.body_md || "")) opts.push({ k: "csv", label: "⬇ .csv" });
    opts.push({ k: "html", label: "⬇ .html" }, { k: "pdf", label: "🖨 print · pdf" });
    if (it.kind === "mindmap" || it.kind === "diagram") opts.push({ k: "png", label: "⬇ .png" });
    if (it.meta?.artifact_kind === "soliloquy" && it.meta?.file) opts.push({ k: "mp3", label: "⬇ .mp3" });
    return opts;
  };
  // the .notebook portable file — export this notebook / import one (snapshot semantics, S4)
  const bundleRef = React.useRef<HTMLInputElement>(null);
  const doExportBundle = async () => {
    if (!sel) return;
    const d = unwrap(await api("bundle", { op: "export", id: sel }, 60000));
    if (d?.ok && d.bundle) dlText(`${fileSlug(d.bundle.title || "notebook")}.notebook`, JSON.stringify(d.bundle, null, 2), "application/json");
    else alert(d?.error || "export failed");
    setNbOpen(false);
  };
  const onImportBundle = (e: any) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        const b = JSON.parse(String(r.result || ""));
        const d = unwrap(await api("bundle", { op: "import", bundle: b }, 60000));
        if (d?.ok) { setNbOpen(false); await loadList(); setSel(d.notebook_id); }
        else alert(d?.error || "import failed");
      } catch { alert("not a valid .notebook file"); }
    };
    r.readAsText(f); e.target.value = "";
  };

  const doExport = async (it: any, k: string, e: React.MouseEvent) => {
    // the PNG door needs the card's DOM before any await (currentTarget is only valid synchronously)
    const card = k === "png" ? ((e.currentTarget as HTMLElement).closest("[data-nb-item]") as HTMLElement | null) : null;
    setExportOpen(null);
    const title = String(it.title || it.kind || "artifact");
    try {
      if (k === "md") dlText(`${fileSlug(title)}.md`, it.body_md || "", "text/markdown;charset=utf-8");
      else if (k === "csv") { const csv = mdTableToCsv(it.body_md || ""); if (csv) dlText(`${fileSlug(title)}.csv`, csv, "text/csv;charset=utf-8"); }
      else if (k === "html") exportHtml(title, it.body_md || "");
      else if (k === "pdf") printPdf(title, it.body_md || "");
      else if (k === "png") { if (!card || !(await exportPngFromSvg(card, fileSlug(title)))) alert("no rendered SVG on this item to rasterize"); }
      else if (k === "mp3") await exportMp3(it.id, title);
    } catch (e2: any) { alert(String(e2?.message ?? "export failed").slice(0, 140)); }
  };

  // sources
  const srcByKind = (k: string) => sources.find((s) => s.kind === k);
  const toggleKind = async (k: string, label: string) => { if (!sel) return; const ex = srcByKind(k); if (ex) await api("source", { op: "toggle", id: ex.id }); else await api("source", { op: "add", notebook_id: sel, kind: k, label }); loadSources(sel); };
  const addImport = async (kind: string, label: string, body_md: string, ref?: string) => { if (!sel) return; await api("source", { op: "add", notebook_id: sel, kind, label, body_md, ref }); setModal(null); loadSources(sel); };
  const doIngest = async (op: string, params: any) => { if (!sel) return; setBusy("ingest"); const d = unwrap(await api("ingest", { op, notebook_id: sel, ...params }, 120000)); setBusy(""); if (d && d.ok === false) { alert(d.error || "ingest failed"); return; } setModal(null); loadSources(sel); };
  const removeSource = async (id: number) => { await api("source", { op: "remove", id }); if (sel) loadSources(sel); };
  // import a workspace-wide source (knowledge.sources, by src-id) into this notebook's corpus (snapshot copy).
  const importSource = async (source_id: string) => { if (!sel) return; await api("source", { op: "import", notebook_id: sel, source_id }); setModal(null); loadSources(sel); };
  // papers become research resources (research architecture plan, 2026-07-20): attach a published
  // study by ref (slug) — the corpus gathers its markdown at ask/generate time, so cumulative research
  // (many papers, one notebook) needs no copies.
  const addPaperSource = async (p: any) => { if (!sel) return; await api("source", { op: "add", notebook_id: sel, kind: "paper", ref: String(p.slug ?? p.id), label: `📜 ${p.title}` }); setModal(null); loadSources(sel); };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden", fontFamily: nav, background: C.bg }}>
      {/* header */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "9px 14px" }}>
        <span style={{ fontFamily: nav, fontSize: 13, color: C.fg, fontWeight: 600 }}>Research</span>
        {sel != null && <span style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {(notebooks.find((n2: any) => n2.id === sel)?.title ?? "")}</span>}
        <span style={{ flex: 1 }} />
      </div>
      {/* THE NOTEBOOK HUB — a floating bottom-right pill, twin of vibe's ❖:
          [📓 hub icon] + (in a notebook) the mode tabs. Its upward popover
          carries the beautiful notebook list, ⏏ leave and ＋ new. */}
      <div style={{ position: "fixed", bottom: 18, right: 18, zIndex: 150, display: "flex", gap: 8, alignItems: "center", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, padding: "4px 7px", boxShadow: "0 3px 14px rgba(0,0,0,.3)" }}>
        <div style={{ position: "relative" }}>
          <button onClick={() => setNbOpen((o) => !o)} title={sel ? `notebook: ${notebooks.find((n2: any) => n2.id === sel)?.title ?? sel} — notebooks & actions` : "notebooks & actions"}
            style={{ position: "relative", width: 30, height: 30, borderRadius: 8, cursor: "pointer", display: "grid", placeItems: "center", fontSize: 14, color: sel != null ? C.warn : C.muted, border: `1px solid ${nbOpen ? C.warn : C.border}`, background: nbOpen ? `color-mix(in oklab, ${C.warn} 10%, transparent)` : "transparent" }}>
            📓
            {sel != null && <span style={{ position: "absolute", top: 3, right: 3, width: 6, height: 6, borderRadius: "50%", background: C.warn }} />}
          </button>
          {nbOpen && (
            <div onMouseLeave={() => setNbOpen(false)} style={{ position: "absolute", bottom: "calc(100% + 10px)", right: 0, zIndex: 120, width: 276, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 7, boxShadow: "0 12px 38px rgba(0,0,0,.5)", display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, letterSpacing: 1.2, textTransform: "uppercase", padding: "3px 8px 1px" }}>notebooks</span>
              <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {!notebooks.filter((n2: any) => !n2.scope?.observatory).length && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim, padding: "6px 10px" }}>no notebooks yet</span>}
                {notebooks.filter((n2: any) => !n2.scope?.observatory).map((n2: any) => {
                  const on = n2.id === sel;
                  return (
                    <button key={n2.id} onClick={() => { setSel(n2.id); setNbOpen(false); }}
                      style={{ textAlign: "left", cursor: "pointer", border: `1px solid ${on ? C.warn : "transparent"}`, background: on ? `color-mix(in oklab, ${C.warn} 9%, transparent)` : "transparent", borderRadius: 8, padding: "7px 10px", display: "flex", alignItems: "center", gap: 9 }}
                      onMouseEnter={(e) => { if (!on) (e.currentTarget as HTMLElement).style.background = `color-mix(in oklab, ${C.fg} 5%, transparent)`; }}
                      onMouseLeave={(e) => { if (!on) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: n2.scope?.archived ? C.dim : C.warn }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "block", fontFamily: mono, fontSize: 11, color: on ? C.fg : C.muted, fontWeight: on ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n2.title}</span>
                        <span style={{ display: "block", fontFamily: mono, fontSize: 8.5, color: C.dim }}>{n2.item_count} item{n2.item_count === 1 ? "" : "s"}{n2.pin_count ? ` · ★${n2.pin_count}` : ""}</span>
                      </span>
                      {on && <span style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>✓</span>}
                    </button>
                  );
                })}
              </div>
              {sel != null && (
                <button onClick={() => { setSel(null); setNbOpen(false); }} style={{ ...btn, fontSize: 9.5, color: C.muted, borderColor: "transparent", textAlign: "left" }}>⏏ leave (the hub)</button>
              )}
              {sel != null && (
                <button onClick={() => void doExportBundle()} title="download this whole notebook as a portable .notebook file — sources snapshotted, papers embedded"
                  style={{ ...btn, fontSize: 9.5, color: C.warn, borderColor: "transparent", textAlign: "left" }}>⇪ export .notebook</button>
              )}
              <span style={{ height: 1, background: C.border, margin: "3px 2px" }} />
              <button onClick={() => { setNbOpen(false); setModal({ mode: "edit", create: true, title: "", paths: "", deps: false, dependents: false }); }}
                style={{ textAlign: "left", cursor: "pointer", border: "1px solid transparent", background: "transparent", borderRadius: 8, padding: "7px 10px", fontFamily: mono, fontSize: 10.5, color: C.ok, display: "flex", alignItems: "center", gap: 8 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `color-mix(in oklab, ${C.ok} 7%, transparent)`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>＋ new scoped notebook</button>
              <button onClick={() => bundleRef.current?.click()} title="import a .notebook file exported from another project — a fresh notebook, rows only"
                style={{ textAlign: "left", cursor: "pointer", border: "1px solid transparent", background: "transparent", borderRadius: 8, padding: "7px 10px", fontFamily: mono, fontSize: 10.5, color: C.warn, display: "flex", alignItems: "center", gap: 8 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `color-mix(in oklab, ${C.warn} 7%, transparent)`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>⇩ import .notebook</button>
              <input ref={bundleRef} type="file" accept=".notebook,.json" onChange={onImportBundle} style={{ display: "none" }} />
            </div>
          )}
        </div>
        {sel != null && <span style={{ width: 1, height: 16, background: C.border }} />}
        {sel != null && (
          <button onClick={() => setTutorMode((v) => !v)} title="Socratic tutor mode — teaches + asks guiding questions (colors the dock field's ask)"
            style={{ background: tutorMode ? C.brand : "transparent", color: tutorMode ? C.bg : C.muted, border: `1px solid ${tutorMode ? C.brand : C.border}`, borderRadius: 7, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: "4px 8px" }}>🎓</button>
        )}
        {setMode && sel != null && <ModeSwitch mode={mode} setMode={setMode} />}
      </div>

      {facKey ? (() => {
        const f2 = FACULTIES.find((x) => x.key === facKey)!;
        const strip = (t: any) => String(t ?? "").replace(`«${facKey}» `, "");
        const fItems = (obs?.items ?? []).filter((it: any) => String(it.title ?? "").startsWith(`«${facKey}»`)).map((it: any) => ({ ...it, title: strip(it.title) }));
        const fSrc = (obs?.sources ?? []).filter((sc: any) => String(sc.label ?? "").startsWith(`«${facKey}»`)).map((sc: any) => ({ ...sc, label: strip(sc.label) }));
        return <FacultyHub f={f2} nb={null} items={fItems} sources={fSrc} busy={busy} fireAsk={facFire} onGenerate={facGenerate} onPin={facPin} onAddSource={facAddSource} onBack={() => setFacKey(null)} />;
      })() : !sel ? (<>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <Dashboard notebooks={notebooks} onOpen={setSel} onNew={() => setModal({ mode: "edit", create: true, title: "", paths: "", deps: false, dependents: false })}
            onFaculty={(f3: any) => setFacKey(f3.key)} onArchive={toggleArchive} />
        </div>
        {/* THE LEARN BAR IS GONE (operator 2026-07-20): the DOCK FIELD is the
            research composer — registered above via useDockSurface. */}
        {busy === "learn" && <div style={{ flexShrink: 0, padding: "4px 14px 12px", textAlign: "center", fontFamily: mono, fontSize: 10.5, color: C.dim }}>✦ creating your notebook…</div>}
      </>) : (
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", overflow: "hidden" }}>
        {/* ── SOURCES ── */}
        <div style={{ width: 228, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflowY: "auto", overflowX: "hidden", padding: 12, display: "flex", flexDirection: "column", gap: 14 }}>
          {!nb ? <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, fontStyle: "italic" }}>Pick or create a notebook, then build its sources here — code scope + workspace signals + imported files.</div> : (
            <SourcesPanel
              nb={nb} scopeInfo={scopeInfo} sources={sources}
              srcByKind={srcByKind} toggleKind={toggleKind} removeSource={removeSource}
              onScopeChange={saveScope}
              onImport={(kind: string) => setModal({ mode: "import", kind })}
              onPickSource={() => setModal({ mode: "pick-source" })}
              onPickPaper={() => setModal({ mode: "pick-paper" })}
              onImportFile={addImport}
              onIndexCode={indexCode} indexing={busy === "index"} idxMsg={idxMsg}
              onDelete={() => doDelete(nb.notebook.id)}
            />
          )}
        </div>

        {/* ── ASK ── (grid: scrollable thread + pinned ask bar; minmax(0,1fr) makes the thread actually scroll) */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "minmax(0, 1fr) auto", overflow: "hidden" }}>
          {!nb ? <div style={{ display: "grid", placeItems: "center", fontFamily: mono, fontSize: 12, color: C.muted, fontStyle: "italic" }}>select a notebook to research</div> : (
            <>
              <div style={{ minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                {!items.length && <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, fontStyle: "italic" }}>Ask a question below, or generate an artifact from the Studio →. Answers are grounded only in this notebook's sources.</div>}
                {items.map((it: any) => (
                  <div key={it.id} data-nb-item={it.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel, flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontFamily: mono, fontSize: 8.5, color: kindColor(it.kind), border: `1px solid ${kindColor(it.kind)}`, borderRadius: 3, padding: "0 4px", textTransform: "uppercase", letterSpacing: 0.5 }}>{it.kind}</span>
                      <span style={{ fontFamily: nav, fontSize: 12, color: C.fg, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
                      {it.meta?.tier && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>{it.meta.tier}</span>}
                      {(it.kind === "mindmap" || it.kind === "diagram") && <button onClick={() => setFsItem(it)} title="open fullscreen" style={{ ...btn, color: C.muted, borderColor: C.border, padding: "2px 7px", fontSize: 10 }}>⛶</button>}
                      {it.kind !== "note" && <button onClick={() => openPromote(it.id)} title="promote to a backlog card" style={{ ...btn, color: C.muted, borderColor: C.border, padding: "2px 7px", fontSize: 9 }}>→ card</button>}
                      <span style={{ position: "relative" }}>
                        <button onClick={() => setExportOpen(exportOpen === it.id ? null : it.id)} title="export this artifact to its file type" style={{ ...btn, color: exportOpen === it.id ? C.brand : C.muted, borderColor: exportOpen === it.id ? C.brand : C.border, padding: "2px 7px", fontSize: 10 }}>⬇</button>
                        {exportOpen === it.id && (
                          <span onMouseLeave={() => setExportOpen(null)} style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 60, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 4, display: "flex", flexDirection: "column", gap: 2, boxShadow: "0 8px 22px rgba(0,0,0,.45)", minWidth: 122 }}>
                            {exportOptionsFor(it).map((o) => (
                              <button key={o.k} onClick={(e) => void doExport(it, o.k, e)}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `color-mix(in oklab, ${C.fg} 7%, transparent)`; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                                style={{ background: "transparent", border: "none", color: C.fg, cursor: "pointer", fontFamily: mono, fontSize: 10.5, padding: "4px 9px", textAlign: "left", borderRadius: 5 }}>{o.label}</button>
                            ))}
                          </span>
                        )}
                      </span>
                      <button onClick={() => doPin(it.id, it.pinned)} title={it.pinned ? "unpin" : "pin"} style={{ background: "transparent", border: "none", cursor: "pointer", color: it.pinned ? C.brand : C.dim, fontSize: 12 }}>{it.pinned ? "★" : "☆"}</button>
                    </div>
                    <PreviewBox max={it.kind === "mindmap" || it.kind === "diagram" || String(it.kind).startsWith("widget:") ? 360 : 300}>
                      {String(it.kind || "").startsWith("widget:") && it.meta?.payload ? (
                        // a saved chat widget → re-render it LIVE from its payload (artifact⇄widget bridge, reverse).
                        // `code` (the producer kind) renders via CodeSampleWidget, which the registry keys as 'code-sample'.
                        <div style={{ padding: "8px 12px" }}>
                          <WidgetHost widget={{ kind: (it.kind.slice(7) === "code" ? "code-sample" : it.kind.slice(7)), key: `nb-w-${it.id}`, payload: it.meta.payload } as any} ctx={{ variant: "page" } as any} />
                        </div>
                      ) : (<>
                        {["slides", "timeline", "table"].includes(String(it.meta?.artifact_kind)) ? <div style={{ padding: "8px 12px" }}><ArtifactView item={it} /></div> : <div style={{ padding: "8px 12px" }}><Markdown text={it.body_md || ""} /></div>}
                        {it.kind === "diagram" && it.meta?.diagrams?.length > 0 && <div style={{ padding: "0 12px 8px" }}><DiagramPack diagrams={it.meta.diagrams} /></div>}
                        {it.kind === "mindmap" && it.meta?.mindmap && <div style={{ padding: "0 12px 8px" }}><MindMap tree={it.meta.mindmap} /></div>}
                      </>)}
                    </PreviewBox>
                    {(() => { const ws = deriveWidgets({ id: it.id, view_intent: it.meta?.view_intent, view_data: it.meta?.view_data, dispatch_results: it.meta?.dispatch_results }, false); return ws.length ? <div style={{ padding: "0 12px 8px", display: "flex", flexDirection: "column", gap: 8 }}>{ws.map((w: any) => <WidgetHost key={w.key} widget={w} ctx={{ variant: "page" } as any} />)}</div> : null; })()}
                    {it.kind === "class" && it.meta?.deck && (
                      <div style={{ padding: "6px 12px", display: "flex", gap: 8 }}>
                        <button onClick={() => setClassOpen({ deck: it.meta.deck, mode: "video" })} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "2px 11px", cursor: "pointer", fontFamily: mono, fontSize: 11 }}>▶ video class</button>
                        <button onClick={() => setClassOpen({ deck: it.meta.deck, mode: "slides" })} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "2px 11px", cursor: "pointer", fontFamily: mono, fontSize: 11 }}>⧉ presentation</button>
                      </div>
                    )}
                    {it.meta?.artifact_kind === "soliloquy" && it.meta?.file && <SoliloquyPlayer item={it} />}
                    {it.kind === "quiz" && it.meta?.quiz?.length > 0 && <Quiz questions={it.meta.quiz} />}
                    {it.kind === "flashcards" && it.meta?.cards?.length > 0 && <Flashcards cards={it.meta.cards} />}
                    {it.kind === "ask" && (it.meta?.impact || it.meta?.coverage) && <ImpactStrip impact={it.meta.impact} coverage={it.meta.coverage} />}
                    {it.kind === "ask" && it.meta?.followups?.length > 0 && <Followups items={it.meta.followups} onPick={(q: string) => setAsk(q)} />}
                    {it.meta?.citations?.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 12px 9px" }}>
                        {it.meta.citations.slice(0, 14).map((c: any, i: number) => (<Link key={i} to={c.kind === "code" ? "/operations/atlas" : "/"} title={`${c.node_id || c.ref} — open ${c.kind === "code" ? "Code" : "Knowledge"}`} style={{ textDecoration: "none", fontFamily: mono, fontSize: 8.5, color: c.kind === "code" ? C.brand : C.warn, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 6px" }}>{c.kind === "code" ? "▢" : "◆"} {c.ref}</Link>))}
                      </div>
                    )}
                    {it.meta?.ai_call_id != null && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "5px 12px", borderTop: `1px solid ${C.border}` }}>
                        <AICallChip id={it.meta.ai_call_id} tier={it.meta.tier || "high"} model={it.meta.model} cost={it.meta.cost_usd} durationMs={it.meta.duration_ms} />
                        {(it.meta.tokens_in != null || it.meta.tokens_out != null) && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }} title="prompt tokens in · completion tokens out">{(it.meta.tokens_in || 0)}↑ {(it.meta.tokens_out || 0)}↓ tok</span>}
                        <span style={{ flex: 1 }} />
                        <button onClick={() => setAiCallId(it.meta.ai_call_id)} title="open the prompt · input · output window" style={{ ...btn, fontSize: 9, padding: "2px 8px", color: C.muted, borderColor: C.border }}>prompt · i/o ▸</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* THE ASK BAR IS GONE (operator 2026-07-20): the DOCK FIELD asks this
                  notebook — registered via useDockSurface; 🎓 Tutor lives on the hub pill. */}
              {busy === "ask" && <div style={{ padding: "6px 18px 12px", fontFamily: mono, fontSize: 10.5, color: C.dim }}>⌕ thinking…</div>}
            </>
          )}
        </div>

        {/* ── STUDIO ── */}
        {nb && (
          <div style={{ width: 250, flexShrink: 0, borderLeft: `1px solid ${C.border}`, overflowY: "auto", overflowX: "hidden", padding: 13, display: "flex", flexDirection: "column", gap: 16 }}>
            <style>{STUDIO_CSS}</style>
            {STUDIO.map((grp) => (
              <div key={grp.group}>
                <div style={{ ...cap, marginBottom: 7 }}>{grp.group}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6 }}>
                  {grp.kinds.map(([k, label]) => (
                    <GenCard key={k} k={k} label={label} busy={busy === k} disabled={!!busy && busy !== k} onClick={() => doGenerate(k)} />
                  ))}
                </div>
              </div>
            ))}
            <div>
              <div style={{ ...cap, marginBottom: 7 }}>Build</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6 }}>
                <GenCard k="paper" label="Paper" busy={false} disabled={false} onClick={doPaper} />
                <GenCard k="class" label="Video class" busy={busy === "class"} disabled={!!busy && busy !== "class"} onClick={() => doClass("video")} />
                <GenCard k="presentation" label="Presentation" busy={busy === "class"} disabled={!!busy && busy !== "class"} onClick={() => doClass("slides")} />
                <GenCard k="soliloquy" label="Soliloquy" busy={false} disabled={!!busy} onClick={() => doClass("audio")} />
                {(() => {
                  const classes = (items ?? []).filter((it: any) => it.kind === "class" && it.meta?.deck);
                  if (!classes.length) return null;
                  const last = classes[classes.length - 1];
                  return (
                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", fontFamily: mono, fontSize: 10.5, color: C.dim, padding: "2px 2px 0" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>last: {String(last.title ?? "class").slice(0, 34)}</span>
                      <button onClick={() => setClassOpen({ deck: last.meta.deck, mode: "video" })} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 5, padding: "0 8px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>▶ open</button>
                      <button onClick={() => setClassOpen({ deck: last.meta.deck, mode: "slides" })} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "0 8px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>⧉ slides</button>
                      {classes.length > 1 && <span>+{classes.length - 1} more in the feed</span>}
                    </div>
                  );
                })()}
                <GenCard k="mindmap" label="Mind map" busy={busy === "mindmap"} disabled={!!busy && busy !== "mindmap"} onClick={doMindmap} />
                <GenCard k="quiz" label="Quiz" busy={busy === "quiz"} disabled={!!busy && busy !== "quiz"} onClick={doQuiz} />
                <GenCard k="flashcards" label="Flashcards" busy={busy === "flashcards"} disabled={!!busy && busy !== "flashcards"} onClick={doFlashcards} />
                <GenCard k="diagram" label="Diagrams" busy={busy === "diagram"} disabled={!!busy && busy !== "diagram"} onClick={doDiagram} />
                <GenCard k="compare" label="Compare" busy={busy === "compare"} disabled={!!busy && busy !== "compare"} onClick={() => setModal({ mode: "compare" })} />
              </div>
            </div>
            <div>
              <div style={{ ...cap, marginBottom: 6 }}>Develop</div>
              <button onClick={() => openPromote()} disabled={!!busy} style={{ ...btn, width: "100%", color: C.ok, borderColor: C.ok }}>{busy === "promote" ? "drafting…" : "→ Promote to card"}</button>
            </div>
            {pins.length > 0 && (
              <div>
                <div style={{ ...cap, marginBottom: 6 }}>Pinned ({pins.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {pins.map((p: any) => <div key={p.id} style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>★ {p.title}</div>)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {modal?.mode === "edit" && <EditModal modal={modal} onCancel={() => setModal(null)} onSave={(title: string, scope: any) => (modal.create ? doCreate(title, scope) : doScope(scope))} />}
      {modal?.mode === "promote" && <PromoteModal modal={modal} onCancel={() => setModal(null)} onConfirm={confirmPromote} />}
      {modal?.mode === "import" && <ImportModal kind={modal.kind} onCancel={() => setModal(null)} onAdd={addImport} onIngest={doIngest} />}
      {modal?.mode === "pick-source" && <SourcePickerModal onCancel={() => setModal(null)} onPick={importSource} />}
      {modal?.mode === "pick-paper" && <PaperPickerModal onCancel={() => setModal(null)} onPick={addPaperSource} />}
      {modal?.mode === "compare" && <CompareModal notebooks={notebooks.filter((n: any) => n.id !== sel)} onCancel={() => setModal(null)} onCompare={doCompare} />}
      {fsItem && <FullscreenArtifact item={fsItem} onClose={() => setFsItem(null)} />}
      {classOpen && <ClassPlayer deck={classOpen.deck} mode={classOpen.mode} onClose={() => setClassOpen(null)} />}
      {forge && sel != null && reg && <CommandCenter reg={reg} filePath={null} initialScope={(nb?.scope?.paths ?? []).filter((p: any) => typeof p === "string").slice(0, 6)} extraMissions={sourceMissions} classMode={forge.mode} originNotebookId={sel} onClose={() => { setForge(null); loadNb(sel); }} />}
    </div>
  );
}

// the soliloquy player (research architecture plan, 2026-07-20) — ONE narrator's mp3
// streamed from the BE, with chapter chips that seek to their byte-derived offsets.
function SoliloquyPlayer({ item }: any) {
  const ref = React.useRef<HTMLAudioElement>(null);
  const chapters: any[] = item.meta?.chapters ?? [];
  return (
    <div style={{ padding: "4px 12px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
      <audio ref={ref} controls preload="metadata" src={`${BE_URL}/api/v1/notebook/audio/${item.id}`} style={{ width: "100%", height: 32 }} />
      {chapters.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {chapters.map((c: any, i: number) => (
            <button key={i} onClick={() => { const a = ref.current; if (a) { a.currentTime = Number(c.start_s || 0); void a.play(); } }}
              title={`${c.title} — ~${Math.round(Number(c.dur_s ?? 0))}s`}
              style={{ fontFamily: mono, fontSize: 9.5, padding: "2px 8px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer" }}>
              {i + 1} · {c.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// interactive multiple-choice quiz — pick an option → reveal right (green) / wrong (red) + the why.
function Quiz({ questions }: any) {
  const [picked, setPicked] = React.useState<Record<number, number>>({});
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "10px 12px 12px" }}>
      {questions.map((q: any, qi: number) => {
        const sel = picked[qi]; const answered = sel != null;
        return (
          <div key={qi}>
            <div style={{ fontFamily: nav, fontSize: 12.5, color: C.fg, fontWeight: 600, marginBottom: 6 }}>{qi + 1}. {q.q}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {q.options.map((opt: string, oi: number) => {
                const isCorrect = oi === q.answer; const isPicked = sel === oi;
                let bg: string = "transparent"; let bd: string = C.border; let col: string = C.fg;
                if (answered && isCorrect) { bg = `color-mix(in oklab, ${C.ok} 15%, transparent)`; bd = C.ok; col = C.ok; }
                else if (answered && isPicked) { bg = `color-mix(in oklab, ${C.bad} 15%, transparent)`; bd = C.bad; col = C.bad; }
                return (
                  <button key={oi} onClick={() => !answered && setPicked((p) => ({ ...p, [qi]: oi }))} disabled={answered} style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 9, border: `1px solid ${bd}`, background: bg, color: col, borderRadius: 8, padding: "7px 10px", cursor: answered ? "default" : "pointer", fontFamily: nav, fontSize: 12 }}>
                    <span style={{ width: 17, height: 17, borderRadius: "50%", border: `1.5px solid ${bd}`, display: "grid", placeItems: "center", fontSize: 9.5, flexShrink: 0, fontFamily: mono }}>{answered && isCorrect ? "✓" : answered && isPicked ? "✕" : String.fromCharCode(97 + oi)}</span>
                    {opt}
                  </button>
                );
              })}
            </div>
            {answered && q.why && <div style={{ fontFamily: mono, fontSize: 10, color: sel === q.answer ? C.ok : C.muted, marginTop: 5 }}>{sel === q.answer ? "✓ correct — " : "✗ — "}{q.why}</div>}
          </div>
        );
      })}
    </div>
  );
}

// NotebookLM-style flashcards — click the card to flip front↔back; ‹ prev / next › through the deck.
function Flashcards({ cards }: any) {
  const [i, setI] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const c = cards[Math.min(i, cards.length - 1)] || {};
  const go = (d: number) => { setI((x) => (x + d + cards.length) % cards.length); setFlipped(false); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: "10px 12px 12px" }}>
      <div onClick={() => setFlipped((f) => !f)} style={{ minHeight: 128, border: `1px solid ${flipped ? C.brand : C.border}`, borderRadius: 12, background: flipped ? `color-mix(in oklab, ${C.brand} 9%, ${C.panel})` : C.panel, display: "grid", placeItems: "center", padding: 18, cursor: "pointer", textAlign: "center", transition: "background .15s, border-color .15s" }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 9 }}>{flipped ? "back" : "front"} · tap to flip</div>
          <div style={{ fontFamily: nav, fontSize: flipped ? 13 : 15, color: C.fg, lineHeight: 1.45 }}>{flipped ? c.back : c.front}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
        <button onClick={() => go(-1)} style={{ ...btn, color: C.muted, padding: "4px 10px" }}>‹ prev</button>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{Math.min(i, cards.length - 1) + 1} / {cards.length}</span>
        <button onClick={() => go(1)} style={{ ...btn, color: C.muted, padding: "4px 10px" }}>next ›</button>
      </div>
    </div>
  );
}

// fixed-height preview with a fade at the bottom; click to expand inline (only shows the affordance when it overflows).
function PreviewBox({ children, max = 300 }: any) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [over, setOver] = React.useState(false);
  React.useEffect(() => { const el = ref.current; if (el) setOver(el.scrollHeight > max + 12); });
  return (
    <div style={{ position: "relative" }}>
      <div ref={ref} style={{ maxHeight: open ? "none" : max, overflow: "hidden" }}>{children}</div>
      {over && !open && (
        <div onClick={() => setOpen(true)} title="expand" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 66, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 7, cursor: "pointer", background: `linear-gradient(transparent, ${C.panel})` }}>
          <span style={{ fontFamily: mono, fontSize: 9.5, color: C.brand, border: `1px solid ${C.border}`, background: C.bg, borderRadius: 999, padding: "2px 12px" }}>⌄ expand</span>
        </div>
      )}
      {over && open && (
        <div style={{ display: "flex", justifyContent: "center", padding: "2px 0 8px" }}>
          <span onClick={() => setOpen(false)} style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 12px", cursor: "pointer" }}>⌃ collapse</span>
        </div>
      )}
    </div>
  );
}

// full-viewport view of an artifact (mind map / diagram / doc) — like the Code screen's graph/diagram fullscreen.
function FullscreenArtifact({ item, onClose }: any) {
  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: 300, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${C.border}`, background: C.panel }}>
        <span style={{ fontFamily: nav, fontSize: 13, color: C.fg, fontWeight: 600 }}>{item.title}</span>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>esc to close</span>
        <span style={{ flex: 1 }} />
        <button onClick={onClose} style={{ ...btn, color: C.muted }}>✕ close</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 20, minHeight: 0 }}>
        {item.kind === "mindmap" && item.meta?.mindmap ? <MindMap tree={item.meta.mindmap} />
          : item.kind === "diagram" && item.meta?.diagrams ? <DiagramPack diagrams={item.meta.diagrams} />
            : <Markdown text={item.body_md || ""} />}
      </div>
    </div>
  );
}

// what-if impact + coverage strip under an answer.
function ImpactStrip({ impact, coverage }: any) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "0 12px 8px", fontFamily: mono, fontSize: 9.5, color: C.muted }}>
      {impact && <span><span style={{ color: C.dim }}>impact · </span>{impact.scope} files → <span style={{ color: impact.affected ? C.warn : C.muted }}>{impact.affected} dependents</span> · {impact.tests} tests</span>}
      {coverage && <span><span style={{ color: C.dim }}>grounded · </span>{coverage.sources} sources · {coverage.hits} hits</span>}
    </div>
  );
}

// suggested follow-up questions → click to fill the Ask box.
function Followups({ items, onPick }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "0 12px 9px" }}>
      {items.map((q: string, i: number) => <button key={i} onClick={() => onPick(q)} style={{ ...btn, fontSize: 9.5, padding: "3px 8px", color: C.brand, borderColor: C.border, textAlign: "left", borderRadius: 6 }}>↳ {q}</button>)}
    </div>
  );
}

// interactive mind map — a collapsible horizontal tidy-tree (click a node with children to fold/unfold).
function MindMap({ tree }: any) {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const NODE_W = 124, NODE_H = 22, X_GAP = 38, Y_GAP = 9;
  const nodes: any[] = []; const edges: [string, string][] = [];
  let yCursor = 0;
  const layout = (n: any, depth: number, path: string): any => {
    const isCol = collapsed.has(path);
    const kids = (!isCol && Array.isArray(n.children)) ? n.children : [];
    let y: number;
    if (!kids.length) { y = yCursor; yCursor += NODE_H + Y_GAP; }
    else { const cn = kids.map((c: any, i: number) => layout(c, depth + 1, `${path}/${i}`)); y = (cn[0].y + cn[cn.length - 1].y) / 2; cn.forEach((c: any) => edges.push([path, c.id])); }
    const node = { id: path, label: n.label, depth, x: depth * (NODE_W + X_GAP), y, hasKids: Array.isArray(n.children) && n.children.length > 0, collapsed: isCol };
    nodes.push(node);
    return node;
  };
  layout(tree, 0, "r");
  const byId: any = {}; nodes.forEach((n) => { byId[n.id] = n; });
  const maxDepth = Math.max(0, ...nodes.map((n) => n.depth));
  const W = (maxDepth + 1) * (NODE_W + X_GAP), H = Math.max(NODE_H, yCursor);
  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const dcol = (d: number) => [C.brand, C.ok, C.warn, "#c678dd", C.brand][d % 5];
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg }}>
      <svg width={W + 16} height={H + 16} style={{ display: "block" }}>
        <g transform="translate(8,8)">
          {edges.map(([f, t], i) => { const a = byId[f], b = byId[t]; if (!a || !b) return null; const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2, mx = (x1 + x2) / 2; return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={C.border} strokeWidth={1.2} />; })}
          {nodes.map((n, i) => (
            <g key={i} transform={`translate(${n.x},${n.y})`} style={{ cursor: n.hasKids ? "pointer" : "default" }} onClick={() => n.hasKids && toggle(n.id)}>
              <rect width={NODE_W} height={NODE_H} rx={6} fill={n.depth === 0 ? dcol(0) : C.panel} stroke={dcol(n.depth)} strokeWidth={1.2} />
              <text x={9} y={NODE_H / 2 + 3.5} fontFamily={mono} fontSize={10} fill={n.depth === 0 ? C.bg : C.fg}>{String(n.label).slice(0, 17)}</text>
              {n.hasKids && <text x={NODE_W - 13} y={NODE_H / 2 + 4} fontFamily={mono} fontSize={11} fill={dcol(n.depth)}>{n.collapsed ? "+" : "−"}</text>}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

// diagram pack — render each {nodes,edges} spec as a layered SVG (by role).
const ROLE_COL: Record<string, number> = { external: 0, "data in": 0, ui: 1, state: 2, logic: 2, data: 3, "data out": 3 };
const ROLE_COLOR: Record<string, string> = { external: C.warn, ui: C.brand, state: "#c678dd", logic: C.fg, data: C.ok };
function DiagramPack({ diagrams }: any) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{diagrams.map((d: any, i: number) => <DiagramSvg key={i} d={d} />)}</div>;
}
function DiagramSvg({ d }: any) {
  const nodes: any[] = d.nodes || []; const edges: any[] = d.edges || [];
  const BW = 100, COLW = 132, BH = 26, GY = 12, PX = 8;
  const cols: Record<number, any[]> = {};
  nodes.forEach((n) => { const c = ROLE_COL[String(n.role || "logic").toLowerCase()] ?? 2; (cols[c] = cols[c] || []).push(n); });
  const pos: Record<string, { x: number; y: number }> = {};
  Object.keys(cols).forEach((c) => cols[Number(c)].forEach((n, idx) => { pos[n.id] = { x: PX + Number(c) * COLW, y: 12 + idx * (BH + GY) }; }));
  const rows = Math.max(1, ...Object.values(cols).map((a) => a.length));
  const W = PX + 4 * COLW, H = 12 + rows * (BH + GY);
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, padding: 8, overflowX: "auto" }}>
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, marginBottom: 4 }}>{d.title || d.file}</div>
      <svg width={W} height={H} style={{ display: "block" }}>
        <defs><marker id="nbarr" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill={C.muted} /></marker></defs>
        {edges.map((e, i) => { const a = pos[e.from], b = pos[e.to]; if (!a || !b) return null; return <line key={i} x1={a.x + BW} y1={a.y + BH / 2} x2={b.x} y2={b.y + BH / 2} stroke={C.border} strokeWidth={1} markerEnd="url(#nbarr)" />; })}
        {nodes.map((n, i) => { const p = pos[n.id]; if (!p) return null; const col = ROLE_COLOR[String(n.role || "logic").toLowerCase()] || C.fg; return (
          <g key={i}>
            <rect x={p.x} y={p.y} width={BW} height={BH} rx={5} fill={C.panel} stroke={col} />
            <text x={p.x + 6} y={p.y + BH / 2 + 3.5} fontFamily={mono} fontSize={9} fill={C.fg}>{String(n.label || n.id).slice(0, 15)}</text>
          </g>
        ); })}
      </svg>
    </div>
  );
}

// pick a second notebook to compare against.
function CompareModal({ notebooks, onCancel, onCompare }: any) {
  return (
    <Overlay onCancel={onCancel}>
      <span style={{ fontFamily: nav, fontSize: 13, color: C.fg, fontWeight: 600 }}>Compare with…</span>
      <span style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>a high-tier grounded matrix of the two scopes — stored on this notebook.</span>
      {!notebooks.length ? <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>create another notebook first.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflow: "auto" }}>
          {notebooks.map((n: any) => <button key={n.id} onClick={() => onCompare(n.id)} style={{ ...btn, textAlign: "left", color: C.fg }}>{n.title}<span style={{ color: C.dim, fontSize: 9 }}>  · {n.item_count} items</span></button>)}
        </div>
      )}
      <button onClick={onCancel} style={{ ...btn, color: C.muted, alignSelf: "flex-start" }}>cancel</button>
    </Overlay>
  );
}

// the SOURCES panel: code scope (with the folder-tree editor) + workspace-signal toggles + imported files.
// no-notebook dashboard — a box per notebook (click to open), like the Vibe session dashboard.
// THE KNOWLEDGE HUB (operator 2026-07-14: "a knowledge hub, almost like a
// UNIVERSITY of the project — go beyond the code: the technologies, the idea,
// the features, even the competition and the market. A research, a paper
// creator tool"). Faculties are one-click notebook mints; the library below
// holds every notebook; the learn bar underneath takes free questions.
// THE FACULTY MAGAZINE (operator 2026-07-15, expeditions v4: "one single
// magazine per faculty — deterministic infos × web search × AI on click").
// The instrument menu is gone: each faculty's page IS its publication
// (MagazineView in faculty-viz), assembled server-side by
// system.research.magazine.observe (substrate × keyless cached web, zero AI)
// and editorialized only when the operator presses an issue
// (system.research.magazine.press — ONE AI call per edition, archived
// immutably in knowledge.magazine_issues). The paper faculty keeps the
// monograph press inline until THE JOURNAL lands.
const FACULTIES: Array<{ key: string; icon: string; tint: string; title: string; desc: string; mint: string; motto: string; mag: string; sources: [string, string][]; recommended: [string, string][]; draw: (t: string) => React.ReactNode }> = [
  { key: "arch", icon: "🏛", tint: C.brand, title: "Architecture & stack", desc: "how the system is built AND what it is built from — modules, flows, materials, dependencies", mint: "🏛 Architecture & stack",
    motto: "read the building, know the bricks",
    mag: "THE STACK GAZETTE",
    sources: [["ast", "AST · signatures"], ["digest", "Code digest"], ["entrypoints", "Entry points"], ["design", "Design system"], ["tests", "Tests"], ["git", "Git history"]],
    recommended: [["overview", "Overview"], ["walkthrough", "Walkthrough"], ["adr", "ADR"], ["risks", "Risks"]],
    draw: (t) => (<svg viewBox="0 0 120 44" style={{ width: "100%", height: 40 }}><line x1="20" y1="36" x2="100" y2="36" stroke={t} /><line x1="24" y1="12" x2="96" y2="12" stroke={t} /><path d="M60 3 L98 12 L22 12 Z" fill="none" stroke={t} />{[32, 48, 64, 80].map((x) => <line key={x} x1={x} y1="14" x2={x} y2="34" stroke={t} opacity="0.6" />)}</svg>) },
  { key: "product", icon: "🧭", tint: C.ok, title: "Product & market", desc: "what this project IS, who it serves, the landscape it fights in, and how it reaches them", mint: "🧭 Product & market",
    motto: "the code is the how; this is the why — and the world decides",
    mag: "THE MARKET HERALD",
    sources: [["user_stories", "User stories"], ["cards", "Cards"], ["data_stories", "Data stories"], ["entrypoints", "Entry points"]],
    recommended: [["briefing", "Briefing"], ["slides", "Slides"], ["table", "Info table"], ["critique", "Critique"]],
    draw: (t) => (<svg viewBox="0 0 120 44" style={{ width: "100%", height: 40 }}><circle cx="60" cy="22" r="15" fill="none" stroke={t} /><ellipse cx="60" cy="22" rx="7" ry="15" fill="none" stroke={t} opacity="0.6" /><polyline points="30,38 48,30 66,33 88,20 102,14" fill="none" stroke={t} opacity="0.8" /><circle cx="88" cy="20" r="2.5" fill={t} /></svg>) },
  { key: "paper", icon: "📜", tint: C.dim, title: "Paper lab", desc: "turn research into a formal paper — thesis to draft", mint: "📜 Paper — ",
    motto: "pin the findings; the paper assembles itself",
    mag: "THE JOURNAL",
    sources: [["digest", "Code digest"]],
    recommended: [["briefing", "Briefing"], ["slides", "Slides"], ["adr", "ADR"], ["critique", "Critique"]],
    draw: (t) => (<svg viewBox="0 0 120 44" style={{ width: "100%", height: 40 }}><path d="M40 6 L74 6 L82 14 L82 38 L40 38 Z" fill="none" stroke={t} /><path d="M74 6 L74 14 L82 14" fill="none" stroke={t} /><rect x="46" y="18" width="24" height="4" rx="2" fill={t} opacity="0.7" /><rect x="46" y="26" width="30" height="4" rx="2" fill={t} opacity="0.45" /></svg>) },
];
// THE FACULTY OBSERVATORY (operator 2026-07-14, third iteration: "each
// expedition = a different interactible artifact in FULLSCREEN; scientific
// method; blog-like with a wire the AI can curate; a scientist tool").
// Anatomy: cover + METHOD RAIL (observe → hypothesize → experiment → conclude
// → publish) · EXPEDITIONS (each opens its INSTRUMENT fullscreen — treemap on
// pure atlas data, radar/quadrant/strata/gauges on structured grounded
// answers) · THE WIRE (your dispatches + AI-curated reading) · brainstorm +
// free ask · the FINDINGS WALL · the PAPER PRESS.
// THE PRODUCT DOSSIER form (operator 2026-07-15: "the operator IS the
// registry" — intention captured ONCE as a structured desk doc; every HERALD
// section derives from it deterministically). Saving supersedes: the observe
// pipeline reads the newest «product dossier» doc.
function DossierForm({ f, initial, onSave, onClose }: any) {
  const [one, setOne] = React.useState(initial.one ?? "");
  const [aud, setAud] = React.useState(initial.aud ?? "");
  const [prob, setProb] = React.useState(initial.prob ?? "");
  const [rivals, setRivals] = React.useState(initial.rivals ?? "");
  const [kws, setKws] = React.useState(initial.kws ?? "");
  const [site, setSite] = React.useState(initial.site ?? "");
  const inp2: React.CSSProperties = { background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", fontFamily: nav, fontSize: 12, outline: "none" };
  const lab = (t: string, hint: string) => (
    <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
      <span style={{ fontFamily: mono, fontSize: 8.5, color: f.tint, letterSpacing: 1, textTransform: "uppercase" }}>{t}</span>
      <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{hint}</span>
    </span>
  );
  const save = () => {
    const body = [
      "PRODUCT DOSSIER — the operator's declared intention",
      `one-liner: ${one.trim()}`,
      `audience: ${aud.trim()}`,
      `problem: ${prob.trim()}`,
      `rivals: ${rivals.split("\n").map((s: string) => s.trim()).filter(Boolean).join(" | ")}`,
      `keywords: ${kws.trim()}`,
      `site: ${site.trim()}`,
    ].join("\n");
    onSave(body);
    onClose();
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 340, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 92vw)", background: C.panel, border: `1px solid color-mix(in oklab, ${f.tint} 40%, ${C.border})`, borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: nav, fontSize: 13.5, fontWeight: 800, color: C.fg, flex: 1 }}>📋 the product dossier</span>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9.5, padding: "3px 10px", borderRadius: 8 }}>✕</button>
        </div>
        <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, lineHeight: 1.5 }}>ten minutes of judgment, captured once — the HERALD's searches, rivals and cover story derive from this deterministically. Save again anytime; the newest wins.</span>
        {lab("one-liner", "what is it, in one sentence")}
        <input value={one} onChange={(e) => setOne(e.target.value)} style={inp2} placeholder="the AI-native project substrate that manages external codebases…" />
        {lab("audience", "who it's for")}
        <input value={aud} onChange={(e) => setAud(e.target.value)} style={inp2} placeholder="solo builders and small teams running AI agents on real repos" />
        {lab("problem", "the problem it kills")}
        <input value={prob} onChange={(e) => setProb(e.target.value)} style={inp2} placeholder="AI coding without audit, determinism or memory" />
        {lab("rivals", "one per line: Name — https://their-site")}
        <textarea value={rivals} onChange={(e) => setRivals(e.target.value)} rows={3} style={{ ...inp2, resize: "vertical", fontFamily: mono, fontSize: 10.5 }} placeholder={"Devin — https://devin.ai\nCursor — https://cursor.com"} />
        {lab("keywords", "the words your MARKET uses, comma-separated")}
        <input value={kws} onChange={(e) => setKws(e.target.value)} style={inp2} placeholder="ai coding agent, autonomous developer, code audit" />
        {lab("site", "your product's own page (its claims join the comparison)")}
        <input value={site} onChange={(e) => setSite(e.target.value)} style={{ ...inp2, fontFamily: mono, fontSize: 10.5 }} placeholder="https://…" />
        <button onClick={save} style={{ alignSelf: "flex-end", background: `linear-gradient(120deg, ${f.tint}, color-mix(in oklab, ${f.tint} 60%, ${C.brand}))`, border: "none", color: C.bg, cursor: "pointer", fontFamily: mono, fontSize: 10.5, fontWeight: 700, padding: "7px 18px", borderRadius: 9 }}>save the dossier</button>
      </div>
    </div>
  );
}

function FacultyHub({ f, nb, items, sources, busy, fireAsk, onGenerate, onPin, onAddSource, onBack }: any) {
  const [wireIn, setWireIn] = React.useState("");
  const [issueNo, setIssueNo] = React.useState(0);
  const wireFeeds: string[] = (sources ?? []).filter((sc: any) => sc.kind === "feed" && /^https:\/\//i.test(String(sc.ref ?? "")) && !String(sc.label ?? "").startsWith("rival:")).map((sc: any) => String(sc.ref));
  const wireRivals: Array<{ name: string; url: string }> = (sources ?? []).filter((sc: any) => String(sc.label ?? "").startsWith("rival:") && /^https:\/\//i.test(String(sc.ref ?? ""))).map((sc: any) => ({ name: String(sc.label).slice(6).trim() || "rival", url: String(sc.ref) }));
  // the desk as SOURCE CONTEXT HUB: docs/mds/notes ground every press
  const deskDocs = (sources ?? [])
    .filter((sc: any) => sc.kind === "doc" || (sc.kind === "feed" && sc.body_md && !sc.ref))
    .map((sc: any) => ({ label: String(sc.label ?? "note").replace(/^«[^»]*»\s*/, "").slice(0, 80), body: String(sc.body_md ?? "") }))
    .filter((d: any) => d.body);
  // the PRODUCT DOSSIER (product faculty): intention as data, newest wins
  const [dossierOpen, setDossierOpen] = React.useState(false);
  const dossierSrc = [...(sources ?? [])].reverse().find((sc: any) => sc.kind === "doc" && /product dossier/i.test(String(sc.label ?? "")));
  const dossierInit = (() => {
    const body = String(dossierSrc?.body_md ?? "");
    const line = (key: string) => (body.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, "im")) ?? [])[1]?.trim() ?? "";
    return { one: line("one-liner"), aud: line("audience"), prob: line("problem"), rivals: line("rivals").split("|").map((s) => s.trim()).filter(Boolean).join("\n"), kws: line("keywords"), site: line("site") };
  })();
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const onDeskFile = async (e: any) => {
    const file: File | undefined = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (/\.(md|txt|markdown|json|csv)$/i.test(file.name)) {
      const text = await file.text();
      await onAddSource("doc", file.name.slice(0, 40), text.slice(0, 20000));
    } else {
      // pdf & friends ride the existing vault ingest (knowledge.documents)
      const up = await uploadFile(file);
      if (up) await onAddSource("doc", String(up.title || file.name).slice(0, 40), String((up as any).summary ?? ""), `doc:${up.document_id}`);
      else alert("upload failed — is the BE running?");
    }
  };
  const pinned = items.filter((it: any) => it.pinned).length;
  const storms = items.filter((it: any) => String(it.title ?? "").startsWith("🌩")).length;
  const papers = items.filter((it: any) => it.kind === "artifact").length;
  const feeds = (sources ?? []).filter((sc: any) => sc.kind === "feed");
  const wireCur = items.find((it: any) => String(it.title ?? "").startsWith("🗞"));
  const wireCurated = wireCur ? (parseViz(wireCur.body_md)?.items ?? []) : [];
  const dispatch = () => { const t = wireIn.trim(); if (!t) return; const isUrl = /^https?:\/\//i.test(t); onAddSource("feed", isUrl ? t.replace(/^https?:\/\//i, "").slice(0, 40) : t.slice(0, 40), t, isUrl ? t : undefined); setWireIn(""); };
  const curate = () => { if (busy) return; fireAsk(`🗞 the wire — curate a reading list for the ${f.title} desk of this project: 6 things worth studying next (papers, docs, rival products, concepts). Respond with ONLY one JSON object: {"items":[{"title":"…","why":"one line","url":"best-guess URL or empty"}]}`); };
  const kindChip = (k: string) => (String(k ?? "").startsWith("🌩") ? "storm" : k);
  const rail = [
    ["1 observe", `${(sources ?? []).length} sources`], ["2 hypothesize", `${storms} storms`],
    ["3 experiment", f.key === "paper" ? "the press" : issueNo ? `issue Nº${issueNo}` : "unpressed"], ["4 conclude", `${pinned} pinned`], ["5 publish", `${papers} artifacts`],
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: `radial-gradient(1100px 340px at 50% -80px, color-mix(in oklab, ${f.tint} 15%, transparent), transparent), ${C.bg}` }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "22px 22px 44px", display: "flex", flexDirection: "column", gap: 14 }}>
        <style>{`@keyframes hubRise { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }`}</style>
        <button onClick={onBack} style={{ alignSelf: "flex-start", background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 10 }}>← the hub</button>
        {/* COVER + METHOD RAIL */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, animation: "hubRise .35s cubic-bezier(.2,.9,.3,1.2) backwards" }}>
          <div style={{ width: 66, height: 66, flex: "none", borderRadius: 18, display: "grid", placeItems: "center", fontSize: 30, background: `linear-gradient(140deg, color-mix(in oklab, ${f.tint} 22%, ${C.panel}), ${C.panel})`, border: `1px solid color-mix(in oklab, ${f.tint} 45%, ${C.border})` }}>{f.icon}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: nav, fontSize: 21, fontWeight: 800, background: `linear-gradient(90deg, ${C.fg}, ${f.tint})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{f.title} observatory</div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, fontStyle: "italic", marginTop: 2 }}>“{f.motto}”</div>
          </div>

        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", animation: "hubRise .35s .04s cubic-bezier(.2,.9,.3,1.2) backwards" }}>
          {rail.map(([step, val]) => (
            <span key={step} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, padding: "3px 11px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.panel }}>
              <span style={{ fontFamily: mono, fontSize: 8, color: f.tint, letterSpacing: 0.8, textTransform: "uppercase" }}>{step}</span>
              <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{val}</span>
            </span>
          ))}
        </div>
        {/* THE MAGAZINE — the faculty's publication (the press, for the paper
            lab). The «feed the desk» dispatch box rides INTO the magazine as
            its desk slot, so the wire department sits beside it (operator:
            "the wire on the side of the wire-feed-the-desk"). */}
        {(() => {
          const wireDesk = (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: f.tint, letterSpacing: 1.2, textTransform: "uppercase" }}>🗞 feed the desk</span>
                <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>the source hub — links · notes · files (md, txt, pdf) · every section presses from here</span>
                <span style={{ flex: 1 }} />
                <button onClick={curate} disabled={!!busy} style={{ ...btn, fontSize: 9.5, color: f.tint, borderColor: f.tint, opacity: busy ? 0.5 : 1 }}>{busy === "ask" ? "…" : "✦ AI curates"}</button>
              </div>
              <div style={{ display: "flex", gap: 7 }}>
                <input value={wireIn} onChange={(e) => setWireIn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") dispatch(); }}
                  placeholder="paste a URL or drop a note onto the wire…"
                  style={{ flex: 1, minWidth: 0, background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", fontFamily: nav, fontSize: 11.5, outline: "none" }} />
                <button onClick={dispatch} disabled={!wireIn.trim()} style={{ ...btn, color: C.muted, opacity: wireIn.trim() ? 1 : 0.5 }}>＋ dispatch</button>
                <input ref={fileRef} type="file" accept=".md,.txt,.markdown,.json,.csv,.pdf" style={{ display: "none" }} onChange={onDeskFile} />
                <button onClick={() => fileRef.current?.click()} title="add a document to the desk — md/txt land verbatim, pdf via the vault" style={{ ...btn, color: C.muted }}>📎 file</button>
                {f.key === "product" && (
                  <button onClick={() => setDossierOpen(true)} title="the PRODUCT DOSSIER — declare the intention once; the HERALD derives from it"
                    style={{ ...btn, color: dossierSrc ? f.tint : C.warn, borderColor: dossierSrc ? C.border : C.warn }}>📋 dossier</button>
                )}
              </div>
              {((sources ?? []).some((sc: any) => sc.kind === "feed" || sc.kind === "doc") || wireCurated.length > 0) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {wireCurated.slice(0, 6).map((w: any, wi: number) => (
                    <div key={"c" + wi} style={{ border: `1px dashed color-mix(in oklab, ${f.tint} 45%, ${C.border})`, borderRadius: 9, padding: "7px 10px" }}>
                      <div style={{ fontFamily: nav, fontSize: 11, fontWeight: 700, color: C.fg }}>✦ {String(w?.title ?? "")}</div>
                      <div style={{ fontFamily: nav, fontSize: 9.5, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{String(w?.why ?? "")}</div>
                      {w?.url && <a href={String(w.url)} target="_blank" rel="noreferrer" style={{ fontFamily: mono, fontSize: 8.5, color: f.tint }}>{String(w.url).slice(0, 44)}</a>}
                    </div>
                  ))}
                  {(sources ?? []).filter((sc: any) => sc.kind === "feed" || sc.kind === "doc").map((sc: any) => (
                    <div key={sc.id} style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: "7px 10px" }}>
                      <div style={{ fontFamily: nav, fontSize: 11, fontWeight: 700, color: C.fg }}>{sc.kind === "doc" ? "📄 " : ""}{String(sc.label ?? "dispatch")}</div>
                      {sc.ref && !String(sc.ref).startsWith("doc:") ? <a href={String(sc.ref)} target="_blank" rel="noreferrer" style={{ fontFamily: mono, fontSize: 8.5, color: f.tint }}>{String(sc.ref).slice(0, 44)}</a>
                        : <div style={{ fontFamily: nav, fontSize: 9.5, color: C.muted, marginTop: 2 }}>{String(sc.body_md ?? "").slice(0, 90) || (String(sc.ref ?? "").startsWith("doc:") ? "in the vault · grounds the presses" : "")}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
          return (
            <div style={{ animation: "hubRise .35s .07s cubic-bezier(.2,.9,.3,1.2) backwards" }}>
              {f.key === "paper" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ borderTop: `2px solid ${C.fg}`, borderBottom: `1px solid ${C.border}`, padding: "8px 2px", display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: nav, fontSize: 17, fontWeight: 800, letterSpacing: 1.5, color: C.fg }}>{f.mag}</span>
                    <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>the monograph press — pressed papers become this journal's issues</span>
                  </div>
                  <MonographPress f={f} items={items} busy={busy} fireAsk={fireAsk} onAddSource={onAddSource} />
                  {wireDesk}
                </div>
              ) : (
                <MagazineView f={f} feeds={wireFeeds} rivals={wireRivals} docs={deskDocs} onIssue={setIssueNo} desk={wireDesk} onOpenDossier={() => setDossierOpen(true)} />
              )}
            </div>
          );
        })()}
        {/* the faculty COMPOSER is gone (operator 2026-07-15: free-asking a
            faculty belongs to the COMMON CHAT — the faculties are context
            sources now: Knowledge → Stack Gazette / Market Herald). */}
        {dossierOpen && <DossierForm f={f} initial={dossierInit} onClose={() => setDossierOpen(false)}
          onSave={(body: string) => { void onAddSource("doc", "product dossier", body); }} />}
        {/* MINTS */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", animation: "hubRise .35s .16s cubic-bezier(.2,.9,.3,1.2) backwards" }}>
          <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>mint from everything learned</span>
          {f.recommended.map(([k, label]: [string, string]) => (
            <button key={k} onClick={() => onGenerate(k)} disabled={!!busy} title={`generate the ${label} artifact from this faculty's corpus`}
              style={{ fontFamily: mono, fontSize: 9, padding: "3px 10px", borderRadius: 20, cursor: busy ? "wait" : "pointer", border: `1px dashed color-mix(in oklab, ${f.tint} 50%, ${C.border})`, background: "transparent", color: f.tint, opacity: busy && busy !== k ? 0.5 : 1 }}>{busy === k ? "…" : `✦ ${label}`}</button>
          ))}
        </div>
        {/* THE FINDINGS WALL */}
        <div style={{ animation: "hubRise .35s .19s cubic-bezier(.2,.9,.3,1.2) backwards" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 7 }}>
            <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1.4 }}>the findings wall</span>
            <span style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          {!items.length ? (
            <div style={{ border: `1px dashed ${C.border}`, borderRadius: 11, padding: "26px 16px", textAlign: "center", fontFamily: mono, fontSize: 10.5, color: C.dim }}>
              the wall is bare — press an issue, storm a topic, or pin what you learn
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 9 }}>
              {items.map((it: any, fi2: number) => (
                <details key={it.id} style={{ border: `1px solid ${it.pinned ? `color-mix(in oklab, ${f.tint} 50%, ${C.border})` : C.border}`, borderRadius: 10, background: C.panel, overflow: "hidden", animation: `hubRise .3s ${Math.min(fi2, 10) * 0.03}s cubic-bezier(.2,.9,.3,1.2) backwards` }}>
                  <summary style={{ listStyle: "none", cursor: "pointer", padding: "8px 11px", display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontFamily: mono, fontSize: 7.5, color: kindColor(it.kind), border: `1px solid ${kindColor(it.kind)}`, borderRadius: 3, padding: "0 4px", textTransform: "uppercase", flex: "none" }}>{kindChip(it.kind)}</span>
                    <span style={{ fontFamily: nav, fontSize: 11, color: C.fg, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(it.title ?? "").replace(/^§\d+ · /, "")}</span>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPin(it.id, it.pinned); }} title={it.pinned ? "unpin" : "pin this finding — pinned findings weigh most in the paper press"}
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: it.pinned ? f.tint : C.dim, fontSize: 11, flex: "none" }}>{it.pinned ? "★" : "☆"}</button>
                  </summary>
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: "6px 12px", maxHeight: 300, overflowY: "auto" }}>
                    <Markdown text={it.body_md || ""} />
                    {it.kind === "quiz" && it.meta?.quiz?.length > 0 && <Quiz questions={it.meta.quiz} />}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// THE MONOGRAPH PRESS (operator: "make the paper generation an expedition
// that generates an html standalone paper"): a 3-step journey — thesis (yours
// or ✦ proposed) → pick the sections from pinned findings → PRESS. Assembly is
// DETERMINISTIC (md→html client-side); the pressed paper is stored as a DB row
// (observatory source, kind 'paper') and downloaded as a standalone .html.
function MonographPress({ f, items, busy, fireAsk, onAddSource }: any) {
  const [thesis, setThesis] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [picked, setPicked] = React.useState<Set<number>>(new Set());
  const [pressed, setPressed] = React.useState(false);
  const pinnedItems = items.filter((it: any) => it.pinned);
  const pool = pinnedItems.length ? pinnedItems : items.slice(0, 8);
  const proposal = items.find((it: any) => String(it.title ?? "").startsWith("📜 thesis"));
  const toggle = (id: number) => setPicked((pk) => { const np = new Set(pk); if (np.has(id)) np.delete(id); else np.add(id); return np; });
  const press = () => {
    const secs = pool.filter((it: any) => picked.has(it.id)).map((it: any) => ({ heading: String(it.title ?? "finding").replace(/^§\d+ · /, "").slice(0, 90), md: String(it.body_md ?? "") }));
    if (!secs.length) return;
    const html = pressPaperHtml({ title: title.trim() || `A study from the ${f.title} faculty`, thesis: thesis.trim() || "(thesis pending)", faculty: f.title, motto: f.motto, tint: f.tint, sections: secs });
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `paper-${(title.trim() || f.key).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.html`;
    a.click(); URL.revokeObjectURL(a.href);
    onAddSource("paper", `📜 ${title.trim() || "untitled paper"}`, html);
    setPressed(true);
  };
  const step = (nr: string, label: string, done: boolean) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999, border: `1px solid ${done ? f.tint : C.border}`, color: done ? f.tint : C.muted, fontFamily: mono, fontSize: 9.5 }}>{done ? "✓" : nr} {label}</span>
  );
  return (
    <div style={{ width: "min(760px, 92vw)", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {step("1", "the thesis", !!thesis.trim())}
        {step("2", `the sections (${picked.size} picked)`, picked.size > 0)}
        {step("3", "press & download", pressed)}
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.panel, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 8.5, color: f.tint, letterSpacing: 1.2, textTransform: "uppercase" }}>1 · the thesis</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="the paper's title…"
          style={{ background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 9, padding: "8px 11px", fontFamily: nav, fontSize: 13, outline: "none" }} />
        <textarea value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="the claim this paper defends — two sentences…"
          style={{ background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 9, padding: "8px 11px", fontFamily: nav, fontSize: 12.5, outline: "none", minHeight: 54, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => fireAsk(`📜 thesis — propose 3 candidate theses for a paper from the ${f.title} faculty, grounded in its findings; each two sentences, numbered.`)} disabled={!!busy}
            style={{ ...btn, fontSize: 9.5, color: f.tint, borderColor: f.tint, opacity: busy ? 0.5 : 1 }}>{busy === "ask" ? "…" : "✦ propose 3 theses"}</button>
          {proposal && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>proposals landed on the findings wall — copy one in</span>}
        </div>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.panel, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 8.5, color: f.tint, letterSpacing: 1.2, textTransform: "uppercase" }}>2 · the sections — {pinnedItems.length ? "your pinned findings" : "no pins yet: the latest findings"}</span>
        {!pool.length && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>the faculty has no findings yet — run expeditions first, pin the best</span>}
        {pool.map((it: any) => (
          <label key={it.id} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "5px 8px", borderRadius: 8, border: `1px solid ${picked.has(it.id) ? f.tint : "transparent"}`, background: picked.has(it.id) ? `color-mix(in oklab, ${f.tint} 7%, transparent)` : "transparent" }}>
            <input type="checkbox" checked={picked.has(it.id)} onChange={() => toggle(it.id)} />
            <span style={{ fontFamily: nav, fontSize: 11.5, color: C.fg, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(it.title ?? "").replace(/^§\d+ · /, "")}</span>
            {!!it.pinned && <span style={{ color: f.tint, fontSize: 10 }}>★</span>}
          </label>
        ))}
      </div>
      <button onClick={press} disabled={!picked.size}
        style={{ alignSelf: "center", padding: "11px 30px", borderRadius: 12, border: "none", cursor: picked.size ? "pointer" : "default", fontFamily: mono, fontSize: 12.5, fontWeight: 700, color: C.bg, background: `linear-gradient(120deg, ${f.tint}, color-mix(in oklab, ${f.tint} 55%, ${C.brand}))`, opacity: picked.size ? 1 : 0.45 }}>
        {pressed ? "✓ pressed — downloaded + stored · press again" : `📜 press the paper (${picked.size} section${picked.size === 1 ? "" : "s"})`}
      </button>
    </div>
  );
}

function Dashboard({ notebooks, onOpen, onNew, onFaculty, onArchive }: any) {
  const live = notebooks.filter((n: any) => !n.scope?.archived && !n.scope?.observatory);
  const archived = notebooks.filter((n: any) => !!n.scope?.archived && !n.scope?.observatory);
  const totalItems = live.reduce((s: number, n: any) => s + (n.item_count || 0), 0);
  const totalPins = live.reduce((s: number, n: any) => s + (n.pin_count || 0), 0);
  const enrolled = new Set(live.map((n: any) => n.scope?.faculty).filter(Boolean));
  const stat = (v: any, l: string, t: string = C.brand) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "6px 13px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.panel }}>
      <span style={{ fontFamily: mono, fontSize: 15, fontWeight: 700, color: t }}>{v}</span>
      <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{l}</span>
    </div>
  );
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "24px 26px" }}>
      <style>{`@keyframes hubRise { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } } ${STUDIO_CSS}`}</style>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* the hall */}
        <div style={{ textAlign: "center", padding: "10px 0 2px", animation: "hubRise .35s cubic-bezier(.2,.9,.3,1.2) backwards" }}>
          <div style={{ fontFamily: nav, fontSize: 24, fontWeight: 800, letterSpacing: 0.2, background: `linear-gradient(90deg, ${C.fg}, ${C.brand})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>🏛 The Knowledge Hub</div>
          <div style={{ fontFamily: nav, fontSize: 12.5, color: C.muted, marginTop: 5 }}>the university of this project — study the code, the product, the market · mint papers from what you learn</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 13 }}>
            {stat(live.length, "notebooks")}
            {stat(totalItems, "artifacts & asks", C.ok)}
            {stat(totalPins, "pinned findings", C.warn)}
            {stat(`${enrolled.size}/${FACULTIES.length}`, "faculties enrolled", C.brand)}
          </div>
        </div>
        {/* FACULTIES — one click enrolls: a notebook minted for that lens */}
        <div>
          <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 8 }}>faculties — enroll with one click</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(172px, 1fr))", gap: 10 }}>
            {FACULTIES.map((f, fi) => (
              <div key={f.key} className="studio-card" onClick={() => onFaculty(f)}
                title={`${f.title} — an observatory: its magazine («${f.mag}»), the wire, the paper press`}
                style={{ border: `1px solid ${enrolled.has(f.key) ? `color-mix(in oklab, ${f.tint} 45%, ${C.border})` : C.border}`, borderRadius: 11, overflow: "hidden", background: C.bg, cursor: "pointer", animation: `hubRise .35s ${fi * 0.05}s cubic-bezier(.2,.9,.3,1.2) backwards` }}>
                <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "center", padding: "2px 10px", background: C.panel2, borderBottom: `1px solid ${C.border}` }}>{f.draw(f.tint)}</div>
                <div style={{ padding: "7px 10px 9px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: nav, fontSize: 12, color: C.fg, fontWeight: 700, flex: 1 }}>{f.icon} {f.title}</span>
                    {enrolled.has(f.key) && <span style={{ fontFamily: mono, fontSize: 8, color: f.tint }}>✓</span>}
                  </div>
                  <div style={{ fontFamily: nav, fontSize: 10, color: C.muted, marginTop: 3, lineHeight: 1.45 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* THE LIBRARY — every notebook */}
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
            <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1.4 }}>the library</span>
            <span style={{ flex: 1, height: 1, background: C.border }} />
            <button onClick={onNew} style={{ ...btn, fontSize: 10, padding: "3px 10px", color: C.ok, borderColor: C.ok }}>+ scoped notebook</button>
          </div>
          {!live.length ? (
            <div style={{ border: `1px dashed ${C.border}`, borderRadius: 12, padding: "30px 20px", textAlign: "center", fontFamily: mono, fontSize: 11, color: C.dim }}>
              the shelves are empty — enroll in a faculty above, or ask the learn bar below
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(152px, 1fr))", gap: 12 }}>
              {live.map((n: any, ni: number) => (
                <div key={n.id} style={{ animation: `hubRise .3s ${Math.min(ni, 10) * 0.04}s cubic-bezier(.2,.9,.3,1.2) backwards` }}>
                  <DashCard n={n} onOpen={onOpen} onArchive={onArchive} />
                </div>
              ))}
            </div>
          )}
          {archived.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", fontFamily: mono, fontSize: 9, color: C.dim, letterSpacing: 1, textTransform: "uppercase" }}>🗄 archive ({archived.length})</summary>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(152px, 1fr))", gap: 10, marginTop: 8, opacity: 0.75 }}>
                {archived.map((n2: any) => <DashCard key={n2.id} n={n2} onOpen={onOpen} onArchive={onArchive} />)}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

// DASHCARD v3 (operator 2026-07-15: "more like NOTEBOOKS — beautiful
// notebooks, not horizontal boxes"): a portrait book object — tinted cloth
// cover with a stitched SPINE, faint ruled paper, a seeded constellation
// emblem, a hanging pin RIBBON, and page edges. Tint + emblem are a stable
// hash of the notebook's identity.
function DashCard({ n, onOpen, onArchive }: any) {
  const [hover, setHover] = React.useState(false);
  const paths = n.scope?.paths || [];
  const { tint2, dots } = React.useMemo(() => {
    let h = 2166136261 >>> 0;
    const seedStr = `${n.id}·${n.title ?? ""}`;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
    const palette = [C.brand, C.ok, C.warn, "oklch(0.78 0.13 300)", "oklch(0.75 0.14 65)"];
    const t = palette[Math.floor(rnd() * palette.length)];
    return { tint2: t, dots: Array.from({ length: 6 }, () => ({ x: 20 + rnd() * 70, y: 12 + rnd() * 30, r: 0.9 + rnd() * 1.6 })) };
  }, [n.id, n.title]);
  return (
    <div onClick={() => onOpen(n.id)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      title={n.title}
      style={{ position: "relative", aspectRatio: "3 / 4.1", borderRadius: "5px 11px 11px 5px", cursor: "pointer", overflow: "hidden", display: "flex", flexDirection: "column", border: `1px solid ${hover ? tint2 : C.border}`, background: `linear-gradient(155deg, color-mix(in oklab, ${tint2} 24%, ${C.panel}) 0%, color-mix(in oklab, ${tint2} 9%, ${C.panel}) 55%, ${C.panel} 100%)`, boxShadow: hover ? `6px 8px 22px -10px color-mix(in oklab, ${tint2} 55%, transparent)` : "3px 4px 12px -8px rgba(0,0,0,.5)", transform: hover ? "translateY(-4px) rotate(-0.8deg)" : undefined, transition: "transform .16s, box-shadow .16s, border-color .16s" }}>
      {/* the SPINE — cloth band with stitching */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 13, background: `linear-gradient(180deg, color-mix(in oklab, ${tint2} 50%, ${C.bg}), color-mix(in oklab, ${tint2} 28%, ${C.bg}))`, borderRight: `1px solid color-mix(in oklab, ${C.bg} 45%, transparent)` }}>
        {[18, 50, 82].map((pc) => <span key={pc} style={{ position: "absolute", top: `${pc}%`, left: 4, width: 5, height: 5, borderRadius: "50%", border: `1px solid color-mix(in oklab, ${C.bg} 55%, ${tint2})`, background: "transparent" }} />)}
      </div>
      {/* ruled paper + the emblem constellation */}
      <svg viewBox="0 0 100 140" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        {[38, 52, 66, 80, 94, 108].map((y) => <line key={y} x1="20" y1={y} x2="92" y2={y} stroke={tint2} strokeWidth="0.35" opacity="0.22" />)}
        {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={tint2} opacity="0.5" />)}
        {dots.slice(0, 5).map((d, i) => { const e = dots[i + 1]; return e ? <line key={"l" + i} x1={d.x} y1={d.y} x2={e.x} y2={e.y} stroke={tint2} strokeWidth="0.3" opacity="0.3" /> : null; })}
      </svg>
      {/* the pin RIBBON, hanging over the cover */}
      {n.pin_count > 0 && (
        <div style={{ position: "absolute", top: -1, right: 12, width: 17, height: 34, background: `linear-gradient(180deg, ${tint2}, color-mix(in oklab, ${tint2} 70%, ${C.bg}))`, clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 4, fontFamily: mono, fontSize: 8.5, fontWeight: 700, color: C.bg }}>{n.pin_count}</div>
      )}
      {/* the TITLE PLATE */}
      <div style={{ margin: "22px 14px 0 24px", padding: "7px 9px", borderRadius: 6, background: `color-mix(in oklab, ${C.bg} 55%, transparent)`, border: `1px solid color-mix(in oklab, ${tint2} 30%, transparent)` }}>
        <span style={{ fontFamily: nav, fontSize: 12, color: C.fg, fontWeight: 700, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{n.title}</span>
      </div>
      {/* the FOOT of the cover */}
      <div style={{ marginTop: "auto", padding: "0 12px 9px 24px", display: "flex", alignItems: "flex-end", gap: 6 }}>
        <span style={{ fontFamily: mono, fontSize: 8.5, color: `color-mix(in oklab, ${C.fg} 70%, ${tint2})` }}>▤ {n.item_count}</span>
        <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{paths.length ? `⌲ ${paths.length} path${paths.length === 1 ? "" : "s"}` : "⌲ whole workspace"}</span>
        {onArchive && <button onClick={(e) => { e.stopPropagation(); onArchive(n); }} title={n.scope?.archived ? "restore from the archive" : "archive this notebook"}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, fontSize: 11, padding: 0, lineHeight: 1, opacity: hover ? 1 : 0, transition: "opacity .15s", flex: "none" }}>{n.scope?.archived ? "⤴" : "🗄"}</button>}
      </div>
      {/* page edges peeking bottom-right */}
      <div style={{ position: "absolute", right: 2, bottom: 2, width: 26, height: 8, pointerEvents: "none" }}>
        {[0, 3, 6].map((o) => <span key={o} style={{ position: "absolute", right: 0, bottom: o, width: 24 - o * 3, height: 1, background: `color-mix(in oklab, ${C.fg} 30%, transparent)` }} />)}
      </div>
    </div>
  );
}

function SourcesPanel({ nb, scopeInfo, sources, srcByKind, toggleKind, removeSource, onScopeChange, onImport, onPickSource, onPickPaper, onImportFile, onIndexCode, indexing, idxMsg, onDelete }: any) {
  const nbId = nb.notebook.id;
  const fileRef = React.useRef<HTMLInputElement>(null);
  const imported = sources.filter((s: any) => s.kind === "text" || s.kind === "file" || s.kind === "url" || s.kind === "source" || s.kind === "paper");
  const onFile = (e: any) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => onImportFile("file", f.name, String(r.result || "").slice(0, 200000)); r.readAsText(f); e.target.value = ""; };
  const row = (on: boolean) => ({ display: "flex", alignItems: "center", gap: 7, padding: "5px 7px", borderRadius: 6, cursor: "pointer", background: on ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent", border: `1px solid ${on ? C.brand : "transparent"}` } as React.CSSProperties);
  const box = (b: boolean) => ({ width: 13, height: 13, flexShrink: 0, borderRadius: 3, border: `1.5px solid ${b ? C.brand : C.muted}`, background: b ? C.brand : "transparent", display: "grid", placeItems: "center", color: C.bg, fontSize: 9 } as React.CSSProperties);

  // inline atlas scope explorer — a checkbox file-tree (like the Code read-only explorer) that saves live.
  const [atlasPaths, setAtlasPaths] = React.useState<string[] | null>(null);
  const [fileTokens, setFileTokens] = React.useState<Record<string, number> | null>(null);
  const [corpusTok, setCorpusTok] = React.useState<{ total: number; by: Record<number, number> } | null>(null);
  const [checked, setChecked] = React.useState<Set<string>>(new Set((nb.notebook.scope || {}).paths || []));
  const [deps, setDeps] = React.useState(!!(nb.notebook.scope || {}).deps);
  const [dependents, setDependents] = React.useState(!!(nb.notebook.scope || {}).dependents);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState("");
  const [autoQ, setAutoQ] = React.useState("");
  const [autoBusy, setAutoBusy] = React.useState(false);
  React.useEffect(() => { (async () => { try { const d = unwrap(await apiPost("/api/v1/codebase/get", { origin: "atlas", limit: 6000, with_tokens: true, types: ["file"] }, { timeoutMs: 30000 })); const ps = (d?.nodes || []).filter((n: any) => n.type === "file").map((n: any) => String(n.path)).filter(Boolean); setAtlasPaths([...new Set<string>(ps)].sort()); setFileTokens(d?.file_tokens || null); } catch { setAtlasPaths([]); } })(); }, []);
  React.useEffect(() => { const sc = nb.notebook.scope || {}; setChecked(new Set(sc.paths || [])); setDeps(!!sc.deps); setDependents(!!sc.dependents); }, [nbId]);
  // running token total of the active context (enabled sources + scope) + a per-source breakdown, from the
  // corpus (which measures gathered sources too). Debounced so toggling/checking doesn't spam the gather.
  const checkedKeyC = [...checked].sort().join("|");
  React.useEffect(() => {
    if (!nbId) return; let alive = true;
    const h = setTimeout(async () => {
      try {
        const d = unwrap(await api("corpus", { id: nbId }, 60_000));
        if (!alive || !d) return;
        const by: Record<number, number> = {};
        for (const b of (d.blocks || [])) if (b.source_id != null) by[b.source_id] = (by[b.source_id] || 0) + (b.tokens || 0);
        setCorpusTok({ total: d.total_tokens ?? 0, by });
      } catch { /* corpus optional */ }
    }, 600);
    return () => { alive = false; clearTimeout(h); };
  }, [nbId, sources, checkedKeyC]);

  const save = (next: Set<string>, dp = deps, dpd = dependents) => onScopeChange({ paths: [...next], deps: dp, dependents: dpd });
  const toggle = (p: string) => { const n = new Set(checked); n.has(p) ? n.delete(p) : n.add(p); setChecked(n); save(n); };
  const toggleExp = (p: string) => setExpanded((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const doAuto = async () => { const q = autoQ.trim(); if (!q) return; setAutoBusy(true); try { const d = unwrap(await apiPost("/api/v1/notebook/autoscope", { question: q })); const ps = d?.paths || []; if (ps.length) { const n = new Set([...checked, ...ps]); setChecked(n); save(n); } } catch { /* */ } setAutoBusy(false); setAutoQ(""); };
  const tokMap = React.useMemo(() => buildTokenMap(fileTokens), [fileTokens]);
  const tok = (p: string) => tokMap?.[p] ?? null;
  const shown = (atlasPaths || []).filter((p) => !filter || p.toLowerCase().includes(filter.toLowerCase()));
  const tree = buildTree(shown.slice(0, 4000));
  const topKids: any[] = Object.values(tree.children || {}).sort((a: any, b: any) => (a.isFile ? 1 : 0) - (b.isFile ? 1 : 0) || a.name.localeCompare(b.name));

  return (
    <>
      {corpusTok != null && <div style={{ display: "flex", alignItems: "center", fontFamily: mono, fontSize: 9.5, color: C.brand, marginBottom: 2 }}><span style={{ flex: 1, textTransform: "uppercase", letterSpacing: 1, fontSize: 8.5, color: C.dim }}>Context total</span><span title="estimated total tokens of all enabled sources + the code scope">Σ ~{fmtTokens(corpusTok.total)} tok</span></div>}
      {/* code scope — inline checkbox explorer */}
      <div>
        <div style={{ ...cap, marginBottom: 5, display: "flex", alignItems: "center" }}>Code scope<span style={{ flex: 1 }} /><span style={{ color: C.dim, textTransform: "none", letterSpacing: 0, fontSize: 9 }}>{checked.size} sel{scopeInfo?.nodes ? ` · ${scopeInfo.nodes.length} in scope` : ""}</span></div>
        <input value={autoQ} onChange={(e) => setAutoQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doAuto(); } }} placeholder="✨ auto-scope from a question…" style={{ ...inp, fontFamily: mono, fontSize: 10.5, padding: "5px 8px" }} />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter paths…" style={{ ...inp, fontFamily: mono, fontSize: 10.5, padding: "5px 8px", marginTop: 4 }} />
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 7, background: C.panel, maxHeight: 240, overflow: "auto", padding: "5px 6px", marginTop: 4 }}>
          {atlasPaths === null ? <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>loading atlas…</span>
            : !atlasPaths.length ? <span style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>atlas empty — rebuild it in Code.</span>
            : autoBusy ? <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>finding files…</span>
            : topKids.map((k) => <TreeNode key={k.path} node={k} depth={0} checked={checked} onToggle={toggle} expanded={expanded} toggleExp={toggleExp} forceOpen={!!filter} ancestorChecked={false} token={tok} />)}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 5 }}>
          <div style={chk} onClick={() => { const v = !deps; setDeps(v); save(checked, v, dependents); }}><Check on={deps} /> deps</div>
          <div style={chk} onClick={() => { const v = !dependents; setDependents(v); save(checked, deps, v); }}><Check on={dependents} /> dependents</div>
        </div>
      </div>

      {/* workspace signals, grouped — pretty chip toggles (match the Studio wizard) */}
      {SOURCE_GROUPS.map((grp) => (
        <div key={grp.group}>
          <div style={{ ...cap, marginBottom: 6 }}>{grp.group} signals</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {grp.items.map((s) => { const ex = srcByKind(s.kind); const on = !!ex && !!ex.enabled; const st = on && corpusTok ? corpusTok.by[ex?.id] : null; return (
              <button key={s.kind} onClick={() => toggleKind(s.kind, s.label)} title={on ? "enabled — click to disable" : "add to scope"}
                style={{ fontFamily: mono, fontSize: 10, padding: "3px 9px", borderRadius: 12, cursor: "pointer", border: `1px solid ${on ? C.brand : C.border}`, background: on ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent", color: on ? C.brand : C.muted }}>
                {on ? "✓ " : ""}{s.label}{st ? ` · ~${fmtTokens(st)}` : ""}
              </button>
            ); })}
          </div>
        </div>
      ))}

      {/* imported */}
      <div>
        <div style={{ ...cap, marginBottom: 6, display: "flex", alignItems: "center" }}>Imported<span style={{ flex: 1 }} /></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
          <button onClick={() => onImport("text")} style={{ ...btn, padding: "3px 8px", fontSize: 10 }}>+ Text</button>
          <button onClick={onPickSource} title="import a workspace source (Knowledge → sources) by id" style={{ ...btn, padding: "3px 8px", fontSize: 10, color: C.brand, borderColor: C.brand }}>+ Sources</button>
          <button onClick={onPickPaper} title="ground this notebook in a saved research paper — the study's markdown feeds every ask/generate" style={{ ...btn, padding: "3px 8px", fontSize: 10, color: C.warn, borderColor: C.warn }}>+ Paper</button>
          <button onClick={() => fileRef.current?.click()} style={{ ...btn, padding: "3px 8px", fontSize: 10 }}>+ File</button>
          <button onClick={() => onImport("url")} style={{ ...btn, padding: "3px 8px", fontSize: 10 }}>+ URL</button>
          <button onClick={() => onImport("docs")} style={{ ...btn, padding: "3px 8px", fontSize: 10 }}>+ Docs</button>
          <button onClick={() => onImport("github")} style={{ ...btn, padding: "3px 8px", fontSize: 10 }}>+ GitHub</button>
          <input ref={fileRef} type="file" accept=".md,.txt,.json,.csv,.log,.yml,.yaml" onChange={onFile} style={{ display: "none" }} />
        </div>
        {imported.length === 0 ? <div style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>.md / .txt / .json / .csv · paste text · a url</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {imported.map((s: any) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 9.5, color: s.enabled ? C.fg : C.dim, border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 7px" }}>
                <span style={{ color: C.warn }}>{s.kind === "url" ? "🔗" : s.kind === "file" ? "▤" : s.kind === "source" ? "◆" : s.kind === "paper" ? "📜" : "✎"}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                {s.tokens != null && <TokChip n={s.tokens} />}
                <span onClick={() => removeSource(s.id)} style={{ cursor: "pointer", color: C.dim }}>✕</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginTop: 4 }}>+ File is text-only; for PDFs add them in Knowledge → sources, then + Sources here (text extracted).</div>
      </div>

      {/* code index + delete */}
      <div style={{ marginTop: "auto", paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
        <button onClick={onIndexCode} disabled={indexing} title="embed the atlas so Ask can semantically retrieve in-scope code" style={{ ...btn, width: "100%", color: C.muted, borderColor: C.border, fontSize: 10 }}>{indexing ? "indexing…" : "↻ Index code for search"}</button>
        {idxMsg && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, marginTop: 4 }}>{idxMsg}</div>}
        <button onClick={onDelete} style={{ ...btn, width: "100%", color: C.dim, borderColor: "transparent", fontSize: 9.5, marginTop: 4 }}>delete notebook</button>
      </div>
    </>
  );
}

// import: text (client-side) · url / docs / github (server-side ingest with text extracted)
function ImportModal({ kind, onCancel, onAdd, onIngest }: any) {
  const [label, setLabel] = React.useState("");
  const [body, setBody] = React.useState(kind === "docs" ? "docs" : "");
  const [ghKind, setGhKind] = React.useState("issues");
  const TITLES: any = { text: "Add a text source", url: "Add a URL — fetched + extracted", docs: "Import a docs folder", github: "Import GitHub issues / PRs" };
  const PH: any = { url: "https://…", docs: "path under the workspace root (e.g. docs)", github: "owner/name" };
  const canSubmit = kind === "docs" ? true : !!body.trim();
  const submit = () => {
    if (kind === "text") return onAdd("text", label.trim() || "Text note", body, undefined);
    if (kind === "url") return onIngest("url", { url: body.trim(), label: label.trim() || undefined });
    if (kind === "docs") return onIngest("docs", { path: body.trim() || "docs", label: label.trim() || undefined });
    if (kind === "github") return onIngest("github", { repo: body.trim(), gh_kind: ghKind, label: label.trim() || undefined });
  };
  return (
    <Overlay onCancel={onCancel}>
      <span style={{ fontFamily: nav, fontSize: 13, color: C.fg, fontWeight: 600 }}>{TITLES[kind] || "Add source"}</span>
      <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label (optional)" style={inp} />
      {kind === "text"
        ? <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="paste text / markdown…" rows={8} style={{ ...inp, resize: "vertical", fontFamily: mono, fontSize: 11 }} />
        : <input value={body} onChange={(e) => setBody(e.target.value)} placeholder={PH[kind]} style={{ ...inp, fontFamily: mono, fontSize: 12 }} />}
      {kind === "github" && <div style={{ display: "flex", gap: 6 }}>{["issues", "pulls"].map((k) => <button key={k} onClick={() => setGhKind(k)} style={{ ...btn, padding: "3px 10px", color: ghKind === k ? C.bg : C.muted, background: ghKind === k ? C.brand : "transparent", border: `1px solid ${ghKind === k ? C.brand : C.border}` }}>{k}</button>)}</div>}
      {kind !== "text" && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>fetched server-side, text extracted before storing.{kind === "github" ? " public repos (unauthenticated)." : ""}{kind === "url" ? " PDF needs a parser (deferred)." : ""}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={submit} disabled={!canSubmit} style={{ ...btn, color: C.ok, borderColor: C.ok, opacity: canSubmit ? 1 : 0.5 }}>{kind === "text" ? "Add source" : "Fetch + add"}</button>
        <button onClick={onCancel} style={{ ...btn, color: C.muted }}>cancel</button>
      </div>
    </Overlay>
  );
}

// pick a workspace-wide source (Knowledge → sources) to import into this notebook's corpus (snapshot copy).
function SourcePickerModal({ onCancel, onPick }: any) {
  const [all, setAll] = React.useState<Source[] | null>(null);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  React.useEffect(() => { (async () => { try { setAll((await listSources()).sources); } catch { setAll([]); } })(); }, []);
  const shown = (all || []).filter((s) => !q || (s.title || s.filename || "").toLowerCase().includes(q.toLowerCase()) || s.id.includes(q));
  const pick = async (id: string) => { if (busy) return; setBusy(id); await onPick(id); };
  return (
    <Overlay onCancel={onCancel}>
      <span style={{ fontFamily: nav, fontSize: 13, color: C.fg, fontWeight: 600 }}>Import a workspace source</span>
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>Files added in Knowledge → sources. The text is snapshotted into this notebook's grounded corpus.</div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter by name or id…" style={{ ...inp, fontFamily: mono, fontSize: 11 }} />
      <div style={{ maxHeight: 320, overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 7, background: C.panel }}>
        {all === null ? <div style={{ padding: 12, fontFamily: mono, fontSize: 10.5, color: C.dim }}>loading…</div>
          : !shown.length ? <div style={{ padding: 12, fontFamily: mono, fontSize: 10.5, color: C.dim }}>{all.length ? "no match." : "No sources yet — add files in Knowledge → sources."}</div>
          : shown.map((s) => (
            <div key={s.id} onClick={() => pick(s.id)} style={{ padding: "7px 10px", borderBottom: `1px solid ${C.border}`, cursor: busy ? "default" : "pointer", opacity: busy && busy !== s.id ? 0.4 : 1 }}>
              <div style={{ fontFamily: nav, fontSize: 12, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{busy === s.id ? "importing… " : ""}{s.title || s.filename}</div>
              <div style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{s.id} · {s.mime}{s.has_text ? "" : " · no text"}</div>
            </div>
          ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onCancel} style={{ ...btn, color: C.muted }}>close</button>
      </div>
    </Overlay>
  );
}

// papers become research resources (research architecture plan, 2026-07-20): the shelf of
// published studies — attach one so this notebook's ask/generate grounds on its findings.
function PaperPickerModal({ onCancel, onPick }: any) {
  const [all, setAll] = React.useState<any[] | null>(null);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState<number | null>(null);
  React.useEffect(() => { (async () => {
    try { const r: any = await apiPost("/api/v1/dispatch", { action_name: "system.constitution.paper", input: { op: "list", limit: 50 } }, { timeoutMs: 30_000 } as any); const d = r?.result?.result ?? r?.result ?? r; setAll(Array.isArray(d?.papers) ? d.papers : []); }
    catch { setAll([]); }
  })(); }, []);
  const shown = (all || []).filter((p) => !q || String(p.title || "").toLowerCase().includes(q.toLowerCase()) || String(p.slug || "").includes(q.toLowerCase()));
  const pick = async (p: any) => { if (busy) return; setBusy(p.id); await onPick(p); };
  return (
    <Overlay onCancel={onCancel}>
      <span style={{ fontFamily: nav, fontSize: 13, color: C.fg, fontWeight: 600 }}>📜 Attach a research paper</span>
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>Published studies from the shelf. The paper's markdown feeds this notebook's grounded corpus — attach several for cumulative research.</div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter by title or slug…" style={{ ...inp, fontFamily: mono, fontSize: 11 }} />
      <div style={{ maxHeight: 320, overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 7, background: C.panel }}>
        {all === null ? <div style={{ padding: 12, fontFamily: mono, fontSize: 10.5, color: C.dim }}>loading the shelf…</div>
          : !shown.length ? <div style={{ padding: 12, fontFamily: mono, fontSize: 10.5, color: C.dim }}>{all.length ? "no match." : "no papers on the shelf yet — run a mission from the Studio's Paper wizard."}</div>
          : shown.map((p) => (
            <div key={p.id} onClick={() => pick(p)} style={{ padding: "7px 10px", borderBottom: `1px solid ${C.border}`, cursor: busy ? "default" : "pointer", opacity: busy && busy !== p.id ? 0.4 : 1 }}>
              <div style={{ fontFamily: nav, fontSize: 12, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{busy === p.id ? "attaching… " : ""}{p.title}</div>
              <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.slug}{p.discovery ? ` · ${p.discovery}` : ""}</div>
            </div>
          ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onCancel} style={{ ...btn, color: C.muted }}>close</button>
      </div>
    </Overlay>
  );
}

// ── folder-tree scope picker (atlas) ──
function buildTree(paths: string[]) {
  const root: any = { children: {} };
  for (const p of paths) {
    const parts = String(p).split("/").filter(Boolean);
    let node = root;
    parts.forEach((seg, i) => {
      node.children[seg] = node.children[seg] || { name: seg, path: parts.slice(0, i + 1).join("/"), isFile: i === parts.length - 1, children: {} };
      node = node.children[seg];
    });
  }
  return root;
}

const TokChip = ({ n }: { n: number | null }) => (n != null && n > 0 ? <span style={{ fontFamily: mono, fontSize: 8, color: C.muted, opacity: 0.7, flexShrink: 0 }} title={`≈ ${n.toLocaleString()} tokens (estimate)`}>~{fmtTokens(n)}</span> : null);
function TreeNode({ node, depth, checked, onToggle, expanded, toggleExp, forceOpen, ancestorChecked, token }: any) {
  const kids: any[] = Object.values(node.children || {}).sort((a: any, b: any) => (a.isFile ? 1 : 0) - (b.isFile ? 1 : 0) || a.name.localeCompare(b.name));
  const hasKids = kids.length > 0;
  const on = ancestorChecked || checked.has(node.path);
  const open = forceOpen || expanded.has(node.path);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: depth * 12 }}>
        <span onClick={() => hasKids && toggleExp(node.path)} style={{ width: 10, cursor: hasKids ? "pointer" : "default", color: C.dim, fontSize: 9, textAlign: "center" }}>{hasKids ? (open ? "▾" : "▸") : ""}</span>
        <span onClick={(e) => { e.stopPropagation(); if (!ancestorChecked) onToggle(node.path); }} style={{ cursor: ancestorChecked ? "default" : "pointer", display: "grid", placeItems: "center" }}><Check on={on} dim={ancestorChecked} /></span>
        <span onClick={() => (hasKids ? toggleExp(node.path) : onToggle(node.path))} style={{ fontFamily: mono, fontSize: 10.5, color: node.isFile ? C.fg : C.brand, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{node.name}{node.isFile ? "" : "/"}</span>
        {token && <TokChip n={token(node.path)} />}
      </div>
      {open && hasKids && kids.map((k) => <TreeNode key={k.path} node={k} depth={depth + 1} checked={checked} onToggle={onToggle} expanded={expanded} toggleExp={toggleExp} forceOpen={forceOpen} ancestorChecked={on} token={token} />)}
    </div>
  );
}

function EditModal({ modal, onCancel, onSave }: any) {
  const [title, setTitle] = React.useState(modal.title || "");
  const [checked, setChecked] = React.useState<Set<string>>(() => new Set(String(modal.paths || "").split("\n").map((s: string) => s.trim()).filter(Boolean)));
  const [extra, setExtra] = React.useState("");
  const [deps, setDeps] = React.useState(!!modal.deps);
  const [dependents, setDependents] = React.useState(!!modal.dependents);
  const [preview, setPreview] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [atlasPaths, setAtlasPaths] = React.useState<string[] | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState("");
  const [autoQ, setAutoQ] = React.useState("");
  const [autoBusy, setAutoBusy] = React.useState(false);
  const [autoMsg, setAutoMsg] = React.useState("");

  React.useEffect(() => { (async () => { try { const d = unwrap(await apiPost("/api/v1/codebase/get", { origin: "atlas", limit: 6000, types: ["file"] }, { timeoutMs: 30000 })); const ps = (d?.nodes || []).filter((n: any) => n.type === "file").map((n: any) => String(n.path)).filter(Boolean); setAtlasPaths([...new Set<string>(ps)].sort()); } catch { setAtlasPaths([]); } })(); }, []);

  const toggle = (p: string) => setChecked((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const toggleExp = (p: string) => setExpanded((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const scope = () => ({ paths: [...new Set([...checked, ...extra.split("\n").map((s: string) => s.trim()).filter(Boolean)])], deps, dependents });
  const doPreview = async () => { setBusy(true); try { setPreview(unwrap(await api("scope", { scope: scope() }))); } finally { setBusy(false); } };
  const doAuto = async () => { const q = autoQ.trim(); if (!q) return; setAutoBusy(true); setAutoMsg(""); try { const d = unwrap(await apiPost("/api/v1/notebook/autoscope", { question: q })); const ps = d?.paths || []; if (ps.length) { setChecked((s) => new Set([...s, ...ps])); setAutoMsg(`+${ps.length} files from ${d.from || "atlas"}`); } else setAutoMsg("nothing matched — index code or rebuild the atlas"); } catch { setAutoMsg("failed"); } setAutoBusy(false); };

  const shown = (atlasPaths || []).filter((p) => !filter || p.toLowerCase().includes(filter.toLowerCase()));
  const tree = React.useMemo(() => buildTree(shown.slice(0, 4000)), [shown.join("|")]);
  const topKids: any[] = Object.values(tree.children || {}).sort((a: any, b: any) => (a.isFile ? 1 : 0) - (b.isFile ? 1 : 0) || a.name.localeCompare(b.name));

  return (
    <Overlay onCancel={onCancel}>
      <span style={{ fontFamily: nav, fontSize: 13, color: C.fg, fontWeight: 600 }}>{modal.create ? "New notebook" : "Edit code scope"}</span>
      {modal.create && <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Notebook title — e.g. “Auth subsystem”" style={inp} />}
      <div style={{ display: "flex", gap: 6 }}>
        <input value={autoQ} onChange={(e) => setAutoQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doAuto(); } }} placeholder="✨ auto-scope from a question…" style={{ ...inp, flex: 1, fontSize: 12 }} />
        <button onClick={doAuto} disabled={autoBusy || !autoQ.trim()} style={{ ...btn, color: C.brand }}>{autoBusy ? "…" : "Suggest"}</button>
      </div>
      {autoMsg && <div style={{ fontFamily: mono, fontSize: 9, color: C.brand }}>{autoMsg}</div>}
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>Check folders or files from the atlas. A folder includes everything under it.</div>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter paths…" style={{ ...inp, fontFamily: mono, fontSize: 11, padding: "5px 9px" }} />
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 7, background: C.panel, maxHeight: 220, overflow: "auto", padding: "6px 8px" }}>
        {atlasPaths === null ? <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>loading atlas…</span>
          : !atlasPaths.length ? <span style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>atlas empty — rebuild it in Code, or add paths below.</span>
          : topKids.map((k) => <TreeNode key={k.path} node={k} depth={0} checked={checked} onToggle={toggle} expanded={expanded} toggleExp={toggleExp} forceOpen={!!filter} ancestorChecked={false} />)}
      </div>
      {checked.size > 0 && <div style={{ fontFamily: mono, fontSize: 9, color: C.brand, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{checked.size} selected · {[...checked].slice(0, 4).join(", ")}{checked.size > 4 ? " …" : ""}</div>}
      <textarea value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={"extra paths (one per line) — files not yet in the atlas"} rows={2} style={{ ...inp, resize: "vertical", fontFamily: mono, fontSize: 11 }} />
      <div style={{ display: "flex", gap: 14 }}>
        <div style={chk} onClick={() => setDeps((v: boolean) => !v)}><Check on={deps} /> include dependencies</div>
        <div style={chk} onClick={() => setDependents((v: boolean) => !v)}><Check on={dependents} /> include dependents</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={doPreview} disabled={busy} style={{ ...btn, color: C.muted, borderColor: C.border }}>{busy ? "resolving…" : "Resolve preview"}</button>
        {preview && <span style={{ fontFamily: mono, fontSize: 10, color: preview.nodes?.length ? C.ok : C.warn }}>{preview.nodes?.length ?? 0} nodes · {preview.paths?.length || 0} files{preview.nodes?.length ? "" : " — nothing matched"}</span>}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        <button onClick={() => onSave(title.trim() || "Untitled notebook", scope())} disabled={modal.create && !title.trim()} style={{ ...btn, color: C.ok, borderColor: C.ok, opacity: modal.create && !title.trim() ? 0.5 : 1 }}>{modal.create ? "Create" : "Save scope"}</button>
        <button onClick={onCancel} style={{ ...btn, color: C.muted }}>cancel</button>
      </div>
    </Overlay>
  );
}

function PromoteModal({ modal, onCancel, onConfirm }: any) {
  const [title, setTitle] = React.useState(modal.title || "");
  const [body, setBody] = React.useState(modal.body || "");
  return (
    <Overlay onCancel={onCancel}>
      <span style={{ fontFamily: nav, fontSize: 13, color: C.fg, fontWeight: 600 }}>Promote to a backlog card</span>
      <span style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>edit the draft — the scope is baked into the body as a ## Scope block for refine.</span>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="card title" style={inp} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} style={{ ...inp, resize: "vertical", fontFamily: mono, fontSize: 11 }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => onConfirm(title.trim() || "Untitled", body)} disabled={!title.trim()} style={{ ...btn, color: C.ok, borderColor: C.ok, opacity: title.trim() ? 1 : 0.5 }}>✓ Create card</button>
        <button onClick={onCancel} style={{ ...btn, color: C.muted }}>cancel</button>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onCancel }: any) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 200, display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 94vw)", maxHeight: "88vh", overflowY: "auto", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

// themed checkbox box (matches the workspace-signal style) — used for the scope tree + deps/dependents.
function Check({ on, dim }: any) {
  return <span style={{ width: 13, height: 13, flexShrink: 0, borderRadius: 3, border: `1.5px solid ${on ? C.brand : C.muted}`, background: on ? C.brand : "transparent", display: "grid", placeItems: "center", color: C.bg, fontSize: 9, opacity: dim ? 0.55 : 1 }}>{on ? "✓" : ""}</span>;
}

const inp: React.CSSProperties = { background: C.panel, border: `1px solid ${C.border}`, color: C.fg, borderRadius: 7, padding: "8px 11px", fontFamily: nav, fontSize: 13, outline: "none" };
const chk: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 10.5, color: C.muted, cursor: "pointer" };
