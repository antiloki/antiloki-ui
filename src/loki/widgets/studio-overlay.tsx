// StudioOverlay — the in-chat "Studio" as a polished WINDOW OVERLAY (operator: organized + beautiful).
// SUBTLE sources rail · a GALLERY of generator cards (from studio-kit: sample thumbnail + name + collapsible
// "what it does" + spinning loading border). On generate the result PASTES into the chat (onResult) and the
// overlay closes. Everything runs against a HIDDEN scratch notebook — no visible notebook, no navigation.
import React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import { apiPost, unwrapResult as unwrap } from "@/loki/api/client";
import { widgetGenerate } from "@/loki/api/codebase";
import { STUDIO_CSS, GenCard } from "./studio-kit";
import { BASE_AGENTS, type BaseAgent } from "./base-agents";
import { tokenLabel, fmtTokens } from "@/loki/util/tokens";
import { buildTree, topKids, buildTokenMap, TreeNode } from "@/loki/codebase/checkbox-tree";

const api = (p: string, body: any, ms?: number) => apiPost(`/api/v1/notebook/${p}`, body, ms ? { timeoutMs: ms } : undefined);

// exported: the chat @ Context wizard renders the SAME source catalog (operator 2026-07-15:
// "the chips, code, work, knowledge that exist in studio should also be in context studio").
// Knowledge carries the faculty magazines (expeditions v4) — same kinds the vibe Context Studio
// offers; notebook-corpus/gather resolves them to the latest pressed issue.
export const SOURCE_GROUPS: { group: string; items: [string, string][] }[] = [
  { group: "Code", items: [["ast", "AST"], ["descriptions", "Descriptions"], ["digest", "Digest"], ["entrypoints", "Entry points"], ["data_stories", "Data stories"], ["design", "Design"], ["tests", "Tests"], ["git", "Git"], ["docs", "Generated docs"]] },
  { group: "Work", items: [["cards", "Cards"], ["contracts", "Contracts"], ["failures", "Failures"], ["decisions", "Decisions"], ["timeline", "Timeline"]] },
  { group: "Knowledge", items: [["memory", "Memory"], ["faculty_arch", "Stack Gazette"], ["faculty_product", "Market Herald"]] },
];
const regKind = (k: string) => (k === "code" ? "code-sample" : k === "logic" ? "logic-spec" : k);
const ART_ENDPOINT: Record<string, string> = { mindmap: "mindmap", quiz: "quiz", flashcards: "flashcards" };
// ANTIIDE — deterministic panels ($0): each reuses the real antiIDE component and reads the atlas the
// rebuild already computed. Clicking one PASTES it into the chat instantly — no intent, no Generate, no
// model call. (The graph RAG already holds this data, so a pasted panel is also grounding the AI sees.)
export const ATLAS_IDE: { kind: string; label: string; needsPath?: boolean }[] = [
  // (operator 2026-09-16) File review, Docs page and Import book left the gallery — the pack and the
  // live tools give the agents those; the operator reads them in antiIDE.
  { kind: "atlas-graph", label: "Code graph" },
  { kind: "atlas-diagram", label: "System design" },
  { kind: "atlas-authors", label: "Authors" },
  { kind: "atlas-xray", label: "X-ray" },
  { kind: "atlas-constitution", label: "Constitution" },
  { kind: "skill-library", label: "Skill library" },
  { kind: "atlas-code", label: "Code" },
  { kind: "atlas-git", label: "Git graph" },
];
// AGENTS (operator 2026-09-16: "OpenCode, Claude Code and Codex should have a category called Agents,
// and it should be the first"). Each pastes a CLI pane: scope gate → worktree → context pack → boot.
// DESIGN (2026-09-17): antiIDE's design features as widgets + the frames editor. `kind` carries the
// tab after a colon so one widget kind serves every Design tab.
export const ATLAS_DESIGN: { kind: string; label: string; payload?: any }[] = [
  { kind: "design-frames", label: "Frames" },
  { kind: "design-view:system", label: "Design system", payload: { tab: "system" } },
  // "Components" is not a widget of its own any more (operator 2026-10-11: "drop the components widget, it is already on the design system widget"): it is a tab of Design system.
];
export const AGENTS: { kind: string; label: string; base: BaseAgent }[] = BASE_AGENTS.map((b) => ({ kind: b.engine, label: b.label, base: b }));
// ANTIVIBE — the standalone session tools (no agents/worktrees). Clicking PASTES them inline with a fresh
// (session, pane) key, so each keeps its own durable board.
export const ATLAS_VIBE: { kind: string; label: string }[] = [
  // ONE tracker instead of a checklist and a board (operator 2026-10-11: "the todo and kanban should be one widget called issues"); the old two stay registered for the threads that hold them.
  { kind: "vibe-issues", label: "Issues" },
  { kind: "vibe-notes", label: "Notes" },
  // "Sketch" is no longer offered here (operator 2026-10-11: "drop the context widget too on tools and the sketch tool"); the widget stays registered for threads that already have one.
  { kind: "shared-diff", label: "Shared diff" },
  // "Automation" is no longer offered here (operator 2026-10-11: "drop the automation widget on tools"). The widget itself is still registered (`widgets/registry.tsx`), so a thread that already has one still shows it.
];
// ANTIVIBE execution + pipeline panes — rendered INLINE via the generic cockpit-pane widget (durable,
// on the rail). Merged 2026-09-16: shell · run preview · scripts = ONE terminal pane (tabs);
// intent · RFC drawer · judgment = ONE intent pane (tabs). The native agent and the bare "scripts
// run" launcher are gone — the Agents above are the agents, scripts live in the terminal.
// Fuel is no longer a docked widget (operator 2026-09-16): the floating mini fuel (top-right) opens it.
export const VIBE_PANES: { kind: string; label: string }[] = [
  { kind: "terminal", label: "Terminal · shell / run / scripts" },
  { kind: "design", label: "Design canvas" },
  { kind: "intent", label: "Brainstorm · RFC / judgment" },
  // "Context" and "Standup" are no longer offered here (operator 2026-10-11: "drop the context widget", "drop standup widget"); their panes still open where a thread already has one.
  { kind: "diff", label: "Diff / review" },
];

// a product/Cure section header in the gallery.
function ProductLabel({ glyph, name, note }: { glyph: string; name: string; note?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "6px 0 9px" }}>
      <span style={{ fontFamily: mono, fontSize: 11.5, color: C.fg, fontWeight: 700 }}>{glyph} {name}</span>
      {note && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{note}</span>}
    </div>
  );
}

// preselect — a chat suggestion button opens the Studio with that generator SELECTED (never
// auto-generating; operator 2026-07-15). paths pre-checks the code tree (e.g. an entity offer's
// file); intent pre-fills the footer's intent box (e.g. the question that produced the offer).
export type StudioPreselect = { type: "widget" | "artifact"; kind: string; paths?: string[]; intent?: string } | null;

// focus — the Threads list's "+" on a category opens the Studio scrolled to THAT section, outlined
// (operator 2026-09-16: "add plus button in each category so I can add widgets from that category").
export type StudioFocus = "Agents" | "antiIDE" | "antiVibe" | null;
export function StudioOverlay({ conv, onResult, onClose, onOpenVibe: _onOpenVibe, preselect = null, focus = null }: { conv: any; onResult: (r: any) => void; onClose: () => void; onOpenVibe?: (kind: string) => void; preselect?: StudioPreselect; focus?: StudioFocus }) {
  const focusRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => { if (focus) focusRef.current?.scrollIntoView({ block: "start" }); }, [focus]);
  const section = (name: StudioFocus): React.CSSProperties & { ref?: React.Ref<HTMLDivElement> } =>
    focus === name ? { outline: `1px solid ${C.brand}`, outlineOffset: 6, borderRadius: 8 } : {};
  const [scratchId, setScratchId] = React.useState<number | null>(null);
  const [sources, setSources] = React.useState<any[]>([]);
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  // select → Generate (operator 2026-07-15): clicking a card SELECTS the generator; the footer's
  // Generate button fires it. Lets the operator compose context (sources + code tree) first.
  const [selected, setSelected] = React.useState<{ type: "widget" | "artifact"; kind: string } | null>(
    preselect ? { type: preselect.type, kind: preselect.kind } : null,
  );
  // the INTENT gate (operator 2026-07-15): the context (sources · code scope · the conversation)
  // FEEDS the generation, but WHAT to produce must be stated — Generate stays off until it is.
  const [intent, setIntent] = React.useState(preselect?.intent ?? "");
  // granular CODE/DOCS scope — a folder/file checkbox tree (atlas files + token weights) wired to the scratch
  // notebook's scope.paths; the "Documentation" toggle adds the per-file descriptions on top.
  const [codePaths, setCodePaths] = React.useState<string[] | null>(null);
  const [fileTokens, setFileTokens] = React.useState<Record<string, number> | null>(null);
  const [checked, setChecked] = React.useState<Set<string>>(new Set(preselect?.paths ?? []));
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState("");
  const [corpusTok, setCorpusTok] = React.useState<{ total: number; by: Record<number, number> } | null>(null);

  const loadSources = React.useCallback(async (id: number) => { const d = unwrap(await api("source", { op: "list", notebook_id: id })); setSources(d?.sources || []); }, []);
  React.useEffect(() => {
    (async () => {
      const md = `**Asked:** ${conv?.request || ""}\n\n**Answer:**\n\n${conv?.response || ""}`;
      // priority tiers: the last answer is the focus (top 1), the conversation is the context (top 2).
      const r = unwrap(await api("store", { op: "scratch", conversation_md: md, last_response_md: conv?.response || "" }, 30_000));
      if (r?.notebook?.id) {
        setScratchId(r.notebook.id);
        loadSources(r.notebook.id);
        // a preselect that names files also lands them in the scratch scope (artifacts read it there).
        if (preselect?.paths?.length) void api("store", { op: "update", id: r.notebook.id, scope: { paths: preselect.paths } });
      }
    })();
  }, [conv, loadSources]);
  // mac-genie CLOSE (operator 2026-07-26): ×/Esc/backdrop first play the reverse suck-back into
  // the fab's corner, THEN the real onClose unmounts. closingRef debounces double-triggers.
  const [closing, setClosing] = React.useState(false);
  const closingRef = React.useRef(false);
  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(onClose, 440);
  };
  React.useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]); // eslint-disable-line react-hooks/exhaustive-deps
  // the atlas file list + per-file token weights (with_tokens) for the code/docs picker.
  React.useEffect(() => {
    (async () => {
      try {
        const d = unwrap(await apiPost("/api/v1/codebase/get", { origin: "atlas", limit: 6000, with_tokens: true, types: ["file"] }, { timeoutMs: 30000 }));
        const ps = (d?.nodes || []).filter((n: any) => n.type === "file").map((n: any) => String(n.path)).filter(Boolean);
        setCodePaths([...new Set<string>(ps)].sort());
        setFileTokens(d?.file_tokens || null);
      } catch { setCodePaths([]); }
    })();
  }, []);

  const srcRow = (k: string) => sources.find((s) => s.kind === k);
  const srcOn = (k: string) => { const r = srcRow(k); return r && r.enabled; };
  const toggleSource = async (k: string, label: string) => {
    if (!scratchId) return;
    const ex = srcRow(k);
    if (ex) await api("source", { op: "toggle", id: ex.id }); else await api("source", { op: "add", notebook_id: scratchId, kind: k, label });
    loadSources(scratchId);
  };
  // code/docs scope tree → the scratch notebook's scope.paths (a checked folder includes everything under it).
  const tokMap = React.useMemo(() => buildTokenMap(fileTokens), [fileTokens]);
  const tok = React.useCallback((p: string) => tokMap?.[p] ?? null, [tokMap]);
  const shown = (codePaths || []).filter((p) => !filter || p.toLowerCase().includes(filter.toLowerCase()));
  const tree = React.useMemo(() => buildTree(shown.slice(0, 4000)), [shown.join("|")]);
  const saveScope = (next: Set<string>) => { if (scratchId) void api("store", { op: "update", id: scratchId, scope: { paths: [...next] } }); };
  const togglePath = (p: string) => { const n = new Set(checked); n.has(p) ? n.delete(p) : n.add(p); setChecked(n); saveScope(n); };
  const toggleExp = (p: string) => setExpanded((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  // running token total of the active context (enabled sources + scope) + a per-source breakdown, from the
  // corpus (which measures gathered sources too). Debounced so toggling/checking doesn't spam the gather.
  const checkedKey = [...checked].sort().join("|");
  React.useEffect(() => {
    if (!scratchId) return;
    let alive = true;
    const h = setTimeout(async () => {
      try {
        const d = unwrap(await api("corpus", { id: scratchId }, 60_000));
        if (!alive || !d) return;
        const by: Record<number, number> = {};
        for (const b of (d.blocks || [])) if (b.source_id != null) by[b.source_id] = (by[b.source_id] || 0) + (b.tokens || 0);
        setCorpusTok({ total: d.total_tokens ?? 0, by });
      } catch { /* corpus optional */ }
    }, 500);
    return () => { alive = false; clearTimeout(h); };
  }, [scratchId, sources, checkedKey]);
  // ANTIIDE widgets are DETERMINISTIC — no generation, no intent. Clicking pastes the widget straight into
  // the chat ($0); onResult closes the Studio + anchors it on the turn (it re-renders from the atlas on
  // reload). The checked file (left tree) scopes the ones that take a path (review / docs / constitution).
  const pasteAtlas = (kind: string, needsPath?: boolean) => {
    const path = [...checked][0] ?? null;
    if (needsPath && !path) { setErr("check a file on the left first — this panel needs a file"); return; }
    onResult({ type: "widget", kind, payload: path ? { path } : {} });
  };
  // ANTIVIBE tools paste inline too — a fresh (session, pane) key gives each its own durable blackboard.
  const pasteVibe = (kind: string) => {
    onResult({ type: "widget", kind, payload: { sessionId: Date.now(), paneId: Math.floor(Math.random() * 1e9) } });
  };
  // the generic cockpit pane, inline — payload.paneKind picks which pane; fresh (session, pane) key per instance.
  const pasteVibePane = (paneKind: string) => {
    onResult({ type: "widget", kind: "vibe-pane", payload: { paneKind, sessionId: Date.now(), paneId: Math.floor(Math.random() * 1e9) } });
  };
  const genWidget = async (kind: string, ask: string) => {
    setErr(""); setBusy(kind);
    try {
      // the studio context rides along: the checked code tree pins the widget's file scope
      // (widget-scope-resolve honors explicit paths); the stated INTENT is the ask, the
      // conversation's answer stays the grounding context.
      const r: any = await widgetGenerate({ name: regKind(kind), args: { scope: "conversation", request: ask || conv?.request, response: conv?.response, ...(checked.size ? { paths: [...checked] } : {}) } });
      const k = r?.kind ?? r?.result?.kind; const p = r?.payload ?? r?.result?.payload;
      if (p) { onResult({ type: "widget", kind: k, payload: p }); return; }
      setErr("nothing to render");
    } catch { setErr("generation failed"); }
    setBusy("");
  };
  const genArtifact = async (kind: string, ask: string) => {
    if (!scratchId) return;
    setErr(""); setBusy(kind);
    try {
      const ep = ART_ENDPOINT[kind];
      const focus = ask ? { focus: ask } : {};
      const d = unwrap(ep ? await api(ep, { id: scratchId, tier: "high", ...focus }, 240_000) : await api("generate", { id: scratchId, kind, tier: "high", ...focus }, 240_000));
      if (d?.item) { onResult({ type: "artifact", kind, item: d.item }); return; }
      setErr(d?.error || "generation failed");
    } catch { setErr("generation failed"); }
    setBusy("");
  };
  // the footer's Generate button — fires the SELECTED generator with the stated INTENT.
  const generate = () => {
    const ask = intent.trim();
    if (!selected || busy || !ask) return;
    if (selected.type === "widget") void genWidget(selected.kind, ask);
    else void genArtifact(selected.kind, ask);
  };

  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))", gap: 8 } as any;
  // the SMOOTH zoom (operator 2026-07-26 v3: "didn't like the apple style — the closing one is
  // smoother, make the opening the same"): one trajectory, both directions. Open glides out of the
  // fab's corner with a soft ease-out; close is the SAME path reversed, accelerating back into the
  // corner. No stretch, no clip funnel. On the window element itself — the portal root must never
  // be wrapped/transform-animated from outside (it would eat clicks over the whole screen).
  const GENIE_CSS =
    "@keyframes lokiStudioFade{from{opacity:0}to{opacity:1}}" +
    "@keyframes lokiStudioFadeOut{from{opacity:1}to{opacity:0}}" +
    "@keyframes lokiStudioZoom{0%{opacity:0;transform:translate(40vw,40vh) scale(.05)}55%{opacity:1}100%{opacity:1;transform:none}}" +
    "@keyframes lokiStudioZoomOut{0%{opacity:1;transform:none}45%{opacity:1}100%{opacity:0;transform:translate(40vw,40vh) scale(.05)}}";
  return createPortal(
    <div onClick={requestClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: closing ? "lokiStudioFadeOut .4s ease both" : "lokiStudioFade .28s ease both", pointerEvents: closing ? ("none" as const) : undefined }}>
      <style>{STUDIO_CSS + GENIE_CSS}</style>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(960px, 93vw)", height: "min(780px, 88vh)", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 70px rgba(0,0,0,0.5)", animation: closing ? "lokiStudioZoomOut .42s cubic-bezier(.55,0,.85,.36) both" : "lokiStudioZoom .5s cubic-bezier(.22,1,.3,1) both", willChange: "transform, opacity" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: nav, fontSize: 16, fontWeight: 700, color: C.fg }}>⊞ Studio</span>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={conv?.request}>{conv?.request || "this conversation"}</span>
          {corpusTok && <span style={{ fontFamily: mono, fontSize: 11, color: C.brand, flexShrink: 0 }} title="estimated total tokens of the active context — all enabled sources + the code scope">Σ ~{fmtTokens(corpusTok.total)} tok</span>}
          <button onClick={requestClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 6, width: 26, height: 26, cursor: "pointer", fontSize: 14 }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "186px 1fr" }}>
          {/* SUBTLE sources rail */}
          <div style={{ borderRight: `1px solid ${C.border}`, overflow: "auto", padding: "12px 12px" }}>
            <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Priority</div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.brand, marginBottom: 3, display: "flex", gap: 6 }} title="the last answer is the primary focus of every generation"><span style={{ flex: 1 }}>① Last answer · focus</span><span style={{ color: C.muted, opacity: 0.85 }}>{tokenLabel(conv?.response)}</span></div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.brand, marginBottom: 11, opacity: 0.85, display: "flex", gap: 6 }} title="the conversation is the secondary context"><span style={{ flex: 1 }}>② This conversation</span><span style={{ color: C.muted }}>{tokenLabel(`${conv?.request || ""} ${conv?.response || ""}`)}</span></div>
            <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>③ Context — add sources</div>
            {/* CODE + DOCS: a folder/file checkbox tree (atlas) with per-file/folder token weights. Checking files
                sets the scratch notebook's code scope; the Documentation toggle adds the per-file descriptions. */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, marginBottom: 5, opacity: 0.7, display: "flex" }}>
                <span style={{ flex: 1 }}>Code &amp; docs</span>{checked.size > 0 && <span>{checked.size} sel</span>}
              </div>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter files…"
                style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.fg, fontFamily: mono, fontSize: 9.5, padding: "3px 6px", marginBottom: 4 }} />
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg, maxHeight: 190, overflow: "auto", padding: "4px 5px" }}>
                {codePaths === null ? <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>loading atlas…</span>
                  : !codePaths.length ? <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>atlas empty — rebuild it in Code.</span>
                  : topKids(tree).map((k: any) => <TreeNode key={k.path} node={k} depth={0} checked={checked} onToggle={togglePath} expanded={expanded} toggleExp={toggleExp} forceOpen={!!filter} ancestorChecked={false} token={tok} />)}
              </div>
              <button onClick={() => void toggleSource("descriptions", "Descriptions")} title="include the generated documentation (per-file descriptions) for the checked files"
                style={{ marginTop: 5, fontFamily: mono, fontSize: 9.5, padding: "2px 8px", borderRadius: 10, cursor: "pointer", border: `1px solid ${srcOn("descriptions") ? C.brand : C.border}`, background: srcOn("descriptions") ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent", color: srcOn("descriptions") ? C.brand : C.muted }}>
                {srcOn("descriptions") ? "✓ " : "+ "}Documentation
              </button>
            </div>
            {SOURCE_GROUPS.map((g) => (
              <div key={g.group} style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, marginBottom: 5, opacity: 0.7 }}>{g.group}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {g.items.map(([k, label]) => { const on = srcOn(k); const st = on && corpusTok ? corpusTok.by[srcRow(k)?.id] : null; return (
                    <button key={k} onClick={() => void toggleSource(k, label)} title={on ? "enabled — click to disable" : "add to scope"}
                      style={{ fontFamily: mono, fontSize: 9.5, padding: "2px 7px", borderRadius: 10, cursor: "pointer", border: `1px solid ${on ? C.brand : C.border}`, background: on ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent", color: on ? C.brand : C.muted }}>{label}{st ? ` · ~${fmtTokens(st)}` : ""}</button>
                  ); })}
                </div>
              </div>
            ))}
          </div>
          {/* GALLERY — click SELECTS a generator; the footer's Generate fires it. */}
          <div style={{ overflow: "auto", padding: "14px 16px" }}>
            <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, marginBottom: 14 }}>Agents boot in their own scoped box. antiIDE panels drop in <b style={{ color: C.fg }}>instantly · $0</b> (no model call). Click the <b style={{ color: C.dim }}>i</b> on a card for what it does.</div>

            <div ref={focus === "Agents" ? focusRef : undefined} data-studio-cat="Agents" style={section("Agents")}>
            <ProductLabel glyph="✦" name="Agents" note="a scoped box each · context pack · live tools · usage always visible" />
            <div style={{ ...grid, marginBottom: 20 }}>
              {AGENTS.map((w) => <GenCard key={w.base.id} k={w.kind} label={w.label} busy={false} disabled={!!busy} selected={false} onClick={() => onResult({ type: "agent-card", engine: w.kind, base: w.base })} />)}
            </div>

            </div>
            <div ref={focus === "antiIDE" ? focusRef : undefined} data-studio-cat="antiIDE" style={section("antiIDE")}>
            <ProductLabel glyph="⟨⟩" name="antiIDE" note="deterministic · $0 · reuses the real panel" />
            <div style={{ ...grid, marginBottom: 20 }}>
              {ATLAS_IDE.map((w) => <GenCard key={w.kind} k={w.kind} label={w.label} busy={false} disabled={!!busy} selected={false} onClick={() => pasteAtlas(w.kind, w.needsPath)} />)}
            </div>
            </div>

            <div ref={focus === "antiVibe" ? focusRef : undefined} data-studio-cat="antiVibe" style={section("antiVibe")}>
            <ProductLabel glyph="❯" name="antiVibe" note="session tools + execution panes · inline · durable" />
            <div style={{ ...grid, marginBottom: 6 }}>
              {ATLAS_VIBE.map((w) => <GenCard key={w.kind} k={w.kind} label={w.label} busy={false} disabled={!!busy} selected={false} onClick={() => pasteVibe(w.kind)} />)}
            </div>
            {/* the CONTEXT BOX is optional now (operator 2026-07-25) — not on the screen by default; dock it from here */}
            <button onClick={() => onResult({ type: "dock", dockId: "context" })}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: mono, fontSize: 10, color: C.brand, marginBottom: 8 }}
              title="dock the pinned @ context panel to the left side (it's optional — close it anytime)">◆ Context box — dock the pinned context as a panel</button>
            <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, margin: "2px 0 8px" }}>execution &amp; pipeline — inline · durable · on the rail</div>
            <div style={{ ...grid, marginBottom: 20 }}>
              {VIBE_PANES.map((w) => <GenCard key={w.kind} k={w.kind} label={w.label} busy={false} disabled={!!busy} selected={false} onClick={() => pasteVibePane(w.kind)} />)}
            </div>
            </div>
            {/* antiDocs (the generated papers) and the antiIDE AI generators are hidden from the gallery
                (operator 2026-09-16); a chat offer can still preselect one — the footer's Generate still fires it. */}
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontFamily: mono, fontSize: 10.5, color: err ? C.bad : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {err ? `⚠ ${err}`
              : busy ? `generating ${busy}… (pastes into the chat when done)`
              : selected ? `${selected.type} · ${selected.kind}${checked.size ? ` · ${checked.size} file${checked.size === 1 ? "" : "s"} scoped` : ""}${intent.trim() ? "" : " — state the intent below"}`
              : "select a widget or artifact, then state the intent"}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") generate(); }}
              placeholder="intent — what should it produce or focus on? (the context feeds it; this directs it)"
              style={{ flex: 1, background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 11px", fontSize: 12, fontFamily: "-apple-system, system-ui, sans-serif" }}
            />
            <button
              onClick={generate}
              disabled={!selected || !!busy || !intent.trim() || (selected?.type === "artifact" && !scratchId)}
              title={intent.trim() ? "generate the selected widget/artifact with this intent + the current context" : "state the intent first"}
              style={{
                fontFamily: mono, fontSize: 11.5, borderRadius: 7, padding: "7px 18px", flexShrink: 0,
                cursor: (!selected || busy || !intent.trim()) ? "default" : "pointer",
                border: `1px solid ${(!selected || busy || !intent.trim()) ? C.border : C.brand}`,
                background: (!selected || busy || !intent.trim()) ? "transparent" : `color-mix(in oklab, ${C.brand} 14%, transparent)`,
                color: (!selected || busy || !intent.trim()) ? C.muted : C.brand, fontWeight: 700,
              }}
            >{busy ? "generating…" : "▶ Generate"}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
