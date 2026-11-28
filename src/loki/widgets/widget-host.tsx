// WidgetHost dispatches a Widget to its registered renderer. Unknown kinds render a small "retired"
// card (the preview box renders nothing) so a turn referencing a dropped or not-yet-shipped widget
// degrades gracefully instead of throwing.
//
// In the chat thread (ctx.collapsible), a WIDGET renders as its NAME on a compact reflex PILL that opens
// the widget fullscreen on click — never inline (operator 2026-07-26; the frosted preview BOXES moved to
// the instruments rail via WidgetPreviewCard). ARTIFACTS are the exception: they render inline (they're
// papers, meant to be read in the flow). In the full-page sidebar window (no ctx.collapsible) everything
// renders inline. Every inline view carries the ⊕ save (report widgets) + ⬇ md·html·pdf toolbar.
import React from "react";
import { createPortal } from "react-dom";
import { WIDGET_REGISTRY } from "./registry";
import { paneDisplay, type Widget, type WidgetCtx } from "./types";
import { ExportButtons } from "@/loki/util/export-view";
import { composeArtefact } from "./artefact-compose";
import { WidgetDragGrip } from "@/loki/chat/widget-dock";
import { AgentActionButton } from "./agent-action-button";
import { feedAgent } from "./agent-interact";
import { reportScreenState, clearScreenState } from "@/loki/chat/screen-manifest";
import { C, mono, nav } from "@/loki/theme";

// chat-flow controls + tiny reply adornments render inline, never as a card and never with a toolbar.
const NO_EXPORT = new Set(["confirm", "screening", "offers", "sources", "summary"]);
// only report/article-style widgets get "⊕ save" (a deterministic paper); the rest are live views, not papers.
const SAVEABLE = new Set(["atlas-xray", "atlas-constitution"]);

const btnS: React.CSSProperties = { background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace', fontSize: 9, padding: "0 3px", whiteSpace: "nowrap" };
const niceLabel = (s: string) => s.replace(/^atlas-|^vibe-/, "").replace(/-/g, " ");

// the card's strip is a MINI PREVIEW OF THE WIDGET'S INTERNALS (operator 2026-07-25): its section
// topics — a tiny table of contents. Real content names from the payload when it carries structure
// (tab labels, table columns, improvement titles, diagram nodes); else the family's known sections.
// what each family IS — the expanded page's explainer sidebar (deterministic knowledge, no AI).
const FAMILY_ABOUT: Record<string, string> = {
  "atlas-xray": "The codebase x-ray: the riskiest files, the smells the detectors flagged, and the project's health — every number measured from the AST on the last rebuild.",
  "atlas-constitution": "The law book this codebase agreed to live by, and how faithfully the code keeps it — compliance is counted by detectors, not vibes.",
  "atlas-graph": "The import graph of the codebase — who leans on whom, where the hubs are, and how far a change ripples.",
  "atlas-diagram": "The system design — the architecture as boxes and arrows: folders as modules, their dependencies, and a drill-down into any file's internals.",
  "atlas-authors": "The git ownership layer: who owns what, the bus factor, and the co-dependencies between people and files.",
  "atlas-review": "A court-grade review of one file: health, per-axis scores, and each finding with its law and its fix.",
  "atlas-docs": "The self-generated docs for one folder or file — rebuilt from the code, so they can't drift.",
  "atlas-code": "The read-only mini-IDE: the tree and the viewer, straight from the working tree.",
  "design-view": "antiIDE's design screen — the system, snapshots, palette, components and consistency harvested from the real UI.",
  "design-frames": "The screens as frames — pixel-perfect from the captured DOM, editable like Figma, saved as your own snapshots. The code stays untouched.",
  "atlas-git": "The repository's git graph — branches and history as they are on disk.",
  board: "The work board — cards by stage, exactly as the substrate has them.",
  improvements: "The improvement list the presenter derived — each item its own before/after.",
  diagram: "A structural diagram of the answer — nodes and flows, drawn from the data.",
  "memory-search": "What the system remembers that matches — lessons, corrections, decisions.",
  "audit-timeline": "The audit chain: every recorded event, hash-linked and append-only.",
  "driver-queue": "What the driver is doing right now — queued and running work.",
  pipeline: "Where a card sits in the pipeline, stage by stage.",
  "logic-spec": "The designed shape of the logic — steps and edge cases before code.",
  "card-detail": "One card in full: body, acceptance, and its history.",
  artifact: "A deterministic article — reshaped from a widget's real data, reproducible on every rebuild.",
};
const familyAbout = (k: string) => FAMILY_ABOUT[k] ?? "A deterministic view over the substrate — computed from real data, reproducible, no AI in the rendering.";

const FAMILY_TOPICS: Record<string, string[]> = {
  "atlas-xray": ["verdict", "shape", "files to watch", "smells", "vulns", "trend"],
  "atlas-constitution": ["families", "law book", "breaches", "worst spots"],
  "atlas-graph": ["import graph", "hubs", "blast radius"],
  "atlas-diagram": ["modules", "dependencies", "drill-down"],
  "atlas-authors": ["ownership", "profiles", "bus factor"],
  "atlas-review": ["health", "axes", "findings", "signals"],
  "atlas-docs": ["overview", "structure", "api"],
  "atlas-code": ["tree", "viewer"],
  "design-view": ["system", "palette", "components"],
  "design-frames": ["frames", "layers", "properties"],
  "atlas-git": ["branches", "history"],
  board: ["backlog", "doing", "review", "done"],
  improvements: ["summary", "before/after", "moves"],
  diagram: ["nodes", "flows"],
  "memory-search": ["matches", "lessons"],
  "audit-timeline": ["events", "chain"],
  "driver-queue": ["queued", "running"],
  pipeline: ["stages", "progress"],
  "logic-spec": ["shape", "steps", "edge cases"],
  "card-detail": ["body", "acceptance", "history"],
  code: ["source"],
  diff: ["before", "after"],
  table: ["rows"],
};
function cardTopics(kind: string, payload: any): string[] {
  const p = payload || {};
  const names = (arr: any, key: string) => (Array.isArray(arr) ? arr.map((x: any) => String(x?.[key] ?? "").trim()).filter(Boolean) : []);
  // payload-carried structure first — the widget's OWN topics
  let topics: string[] =
    names(p.tabs, "label").length ? names(p.tabs, "label")
    : names(p.improvements, "title").length ? names(p.improvements, "title")
    : Array.isArray(p.columns) && p.columns.length ? p.columns.map(String)
    : names(p.diagram?.nodes, "label").length ? names(p.diagram?.nodes, "label")
    : FAMILY_TOPICS[kind] ?? [];
  if (!topics.length && p.path) { const b = String(p.path).split("/").pop(); if (b) topics = [b]; }
  if (!topics.length && p.slug) topics = [String(p.slug)];
  const out = topics.slice(0, 4).map((t) => (t.length > 22 ? `${t.slice(0, 21)}…` : t));
  if (p._uid) out.unshift(`#${p._uid}`); // the durable identity leads when persisted
  return out.slice(0, 5);
}

// the widget CARD's frosted-glass preview + discrete reflex. Injected once and kept up to date in place
// (so a hot-reload of these styles applies without a hard refresh).
const ANIM_CSS_ID = "loki-widget-card-anim";
function ensureAnimCss() {
  if (typeof document === "undefined") return;
  let s = document.getElementById(ANIM_CSS_ID) as HTMLStyleElement | null;
  if (!s) { s = document.createElement("style"); s.id = ANIM_CSS_ID; document.head.appendChild(s); }
  s.textContent =
    // a bright colorful CIRCULATING border (a conic gradient whose angle spins) + reflex sweep. @property
    // lets the angle animate smoothly (Chrome). The border is a masked ::before ring so only the edge shows.
    `@property --lwc-a{syntax:"<angle>";initial-value:0deg;inherits:false}` +
    `@keyframes lwcSpin{to{--lwc-a:360deg}}` +
    `@keyframes lokiReflex{0%{transform:translateX(-140%)}55%,100%{transform:translateX(360%)}}` +
    // click → the widget EXPANDS into a fullscreen page (operator 2026-07-25): grow + settle, discrete.
    `@keyframes lwcExpand{from{opacity:.35;transform:scale(.93)}to{opacity:1;transform:scale(1)}}` +
    // a compact PREVIEW card — fixed size. Behind a FROSTED GLASS (more transparent now) you see the
    // widget's own content (.lwc-preview), a light edge scrim for label legibility (.lwc-scrim), the label
    // + stats (.lwc-label), the reflex (::after), and the spinning colorful border (::before).
    `.loki-widget-card{position:relative;overflow:hidden;width:280px;height:150px;border:none;border-radius:12px;` +
    `background:${C.panel2};transition:transform .15s,box-shadow .15s}` +
    `.loki-widget-card:hover{transform:translateY(-1px);box-shadow:0 0 16px color-mix(in oklab,${C.brand} 30%,transparent)}` +
    // the border stays the THEME: a quiet border-colored ring with one bright EMBER (brand) segment
    // circulating around it — the app color running through the border, nothing multicolor.
    `.loki-widget-card::before{content:"";position:absolute;inset:0;border-radius:12px;padding:1.4px;z-index:4;pointer-events:none;` +
    `background:conic-gradient(from var(--lwc-a),${C.border} 0deg 264deg,color-mix(in oklab,${C.brand} 55%,${C.border}) 292deg,${C.brand} 322deg,color-mix(in oklab,${C.brand} 55%,${C.border}) 350deg,${C.border} 360deg);` +
    `-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:lwcSpin 4.5s linear infinite}` +
    `.loki-widget-card .lwc-preview{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0;opacity:.96;filter:blur(1.4px) saturate(1)}` +
    `.loki-widget-card .lwc-scrim{position:absolute;inset:0;pointer-events:none;z-index:1;` +
    // mostly clear (see the content); only the top/bottom edges get a soft scrim so labels/stats stay readable.
    `background:linear-gradient(180deg,color-mix(in oklab,${C.bg} 48%,transparent) 0%,transparent 24%,transparent 72%,color-mix(in oklab,${C.bg} 52%,transparent) 100%)}` +
    `.loki-widget-card .lwc-label{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;justify-content:space-between;padding:9px 12px}` +
    `.loki-widget-card::after{content:"";position:absolute;top:0;bottom:0;left:0;width:32%;transform:translateX(-140%);pointer-events:none;z-index:3;` +
    `background:linear-gradient(105deg,transparent,color-mix(in oklab,${C.fg} 9%,transparent),transparent);animation:lokiReflex 7s ease-in-out infinite}` +
    // SMALL box variant — the instruments rail's 2-column grid (operator 2026-07-26).
    `.loki-widget-card.lwc-sm{width:100%;height:96px;border-radius:10px}` +
    `.loki-widget-card.lwc-sm::before{border-radius:10px;padding:1.2px}` +
    // the chat-thread PILL (operator 2026-07-26: "just the name at the chat, but with the box effect"):
    // the widget's NAME only, wearing the same circulating ember ring + reflex as the box.
    `.loki-widget-pill{position:relative;overflow:hidden;display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 12px;border:none;border-radius:9px;` +
    `background:${C.panel2};transition:transform .15s,box-shadow .15s}` +
    `.loki-widget-pill:hover{transform:translateY(-1px);box-shadow:0 0 14px color-mix(in oklab,${C.brand} 28%,transparent)}` +
    `.loki-widget-pill::before{content:"";position:absolute;inset:0;border-radius:9px;padding:1.2px;z-index:4;pointer-events:none;` +
    `background:conic-gradient(from var(--lwc-a),${C.border} 0deg 264deg,color-mix(in oklab,${C.brand} 55%,${C.border}) 292deg,${C.brand} 322deg,color-mix(in oklab,${C.brand} 55%,${C.border}) 350deg,${C.border} 360deg);` +
    `-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:lwcSpin 4.5s linear infinite}` +
    `.loki-widget-pill::after{content:"";position:absolute;top:0;bottom:0;left:0;width:32%;transform:translateX(-140%);pointer-events:none;z-index:3;` +
    `background:linear-gradient(105deg,transparent,color-mix(in oklab,${C.fg} 9%,transparent),transparent);animation:lokiReflex 7s ease-in-out infinite}` +
    // DOCKED + EXPANDED integrate the widget flat (operator 2026-07-25: "part of the screen, not a
    // box"): the frame's box AND its own name-header are stripped — the dock/page header names it.
    `.lwx-flat > div > div > div > div,.lwx-flat > div > div > div{border:none!important;border-radius:0!important;background:transparent!important;margin-top:0!important;box-shadow:none!important}` +
    `.lwx-flat [data-widget-frame]{border:none!important;border-radius:0!important;background:transparent!important;margin-top:0!important;box-shadow:none!important}` +
    `.lwx-flat [data-widget-frame-header]{display:none!important}`;
}

// heavy / interactive kinds (terminals, IDE, cockpit panes needing a live session/blackboard) — too costly
// or stateful to mount as a live preview, so their card shows the frosted glass without live content.
const NO_PREVIEW = new Set([
  "vibe-pane", "opencode", "claude-code", "codex", "shell", "run", "design",
  "intent", "shape", "judgment", "fuel", "context", "standup", "diff",
  "atlas-code", "atlas-git", "state", "gate", "timeline", "design-view", "design-frames",
]);

// a preview must NEVER crash the thread — a widget that throws while rendering blurred behind glass just
// shows the empty frosted card instead.
class PreviewBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  constructor(p: any) { super(p); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}
// a minimal ctx for the preview render — non-interactive, no side effects, never collapses recursively.
const PREVIEW_CTX: any = { isLast: false };

// the PREVIEW BOX, standalone (operator 2026-07-26: the boxes moved OUT of the chat flow and INTO the
// instruments rail as a 2-column grid) — frosted live preview, topic chips, circulating ember border.
export function WidgetPreviewCard({ widget, onOpen }: { widget: Widget; onOpen: () => void }) {
  const Comp = WIDGET_REGISTRY[widget.kind];
  React.useEffect(() => { ensureAnimCss(); }, []);
  if (!Comp) return null;
  const title = widget.kind === "vibe-pane" ? String((widget.payload as any)?.paneKind ?? "pane") : widget.kind;
  const label = widget.kind === "vibe-pane" ? paneDisplay(title).name : niceLabel(title);
  return (
    <div className="loki-widget-card lwc-sm" onClick={onOpen} title={`open ${label}`} style={{ cursor: "pointer", fontFamily: mono }}>
      {!NO_PREVIEW.has(widget.kind) && (
        <div className="lwc-preview" aria-hidden>
          <div style={{ transform: "scale(0.45)", transformOrigin: "top left", width: "222%" }}>
            <PreviewBoundary><Comp payload={widget.payload} ctx={PREVIEW_CTX} /></PreviewBoundary>
          </div>
        </div>
      )}
      <div className="lwc-scrim" />
      <div className="lwc-label" style={{ padding: "6px 8px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <span style={{ color: C.brand, fontSize: 10 }}>◆</span>
            <span style={{ color: C.fg, fontWeight: 700, fontSize: 9.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: `0 1px 6px ${C.bg}, 0 0 3px ${C.bg}` }}>{label}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {cardTopics(widget.kind, widget.payload).slice(0, 3).map((st, i) => (
              <span key={i} style={{ fontSize: 7.5, color: C.dim, background: `color-mix(in oklab, ${C.bg} 62%, transparent)`, border: `1px solid color-mix(in oklab, ${C.border} 70%, transparent)`, borderRadius: 5, padding: "0 4px", lineHeight: 1.7, backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}>{st}</span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", fontSize: 8, color: C.muted }}>
          <span style={{ marginLeft: "auto", color: C.brand, fontWeight: 700, textShadow: `0 1px 6px ${C.bg}` }}>↗</span>
        </div>
      </div>
    </div>
  );
}

export function WidgetHost({ widget, ctx }: { widget: Widget; ctx: WidgetCtx }) {
  const Comp = WIDGET_REGISTRY[widget.kind];
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [xOpen, setXOpen] = React.useState(false); // export controls collapse into one ⬇ icon; hover expands
  React.useEffect(() => { ensureAnimCss(); }, []);
  React.useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  // UI bus: the assistant can open THIS widget fullscreen by its manifest uid.
  React.useEffect(() => {
    const h = (e: any) => {
      const d = e?.detail ?? {};
      const mine = String(d.uid) === String((widget.payload as any)?._uid ?? widget.key);
      if (d.verb === "open_widget" && mine) setOpen(true);
      if (d.verb === "close_widget" && mine) setOpen(false);
    };
    window.addEventListener("antiloki:ui", h as any);
    return () => window.removeEventListener("antiloki:ui", h as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget]);
  // SCREEN MANIFEST: the fullscreen page IS what the user is reading right now — tell the chat.
  React.useEffect(() => {
    const uid = String((widget.payload as any)?._uid ?? widget.key ?? widget.kind);
    if (open) reportScreenState("fullscreen", `fullscreen page OPEN: #${uid} (${widget.kind}) — the user is reading it right now`);
    else clearScreenState("fullscreen");
    return () => clearScreenState("fullscreen");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // a RETIRED kind (a thread saved before the widget was dropped — book-import, 2026-09-18) says so
  // instead of vanishing: the operator can remove the card knowing what it was.
  if (!Comp) return (
    <div data-testid="widget-retired" data-kind={widget.kind} style={{ fontFamily: mono, fontSize: 10, color: C.dim, border: `1px dashed ${C.border}`, borderRadius: 6, padding: "6px 10px" }}>
      ⌫ <b style={{ color: C.muted }}>{niceLabel(widget.kind)}</b> — this widget was retired; the card can be removed.
    </div>
  );
  if (NO_EXPORT.has(widget.kind)) return <Comp payload={widget.payload} ctx={ctx} />;

  const title = widget.kind === "vibe-pane" ? String((widget.payload as any)?.paneKind ?? "pane") : widget.kind;
  // pane widgets are titled by the AGENT'S name (✦ Claude Code), never a generic "pane".
  const label = widget.kind === "vibe-pane" ? paneDisplay(title).name : niceLabel(title);
  const isArtifact = widget.kind === "artifact";
  // WIDGETS in the thread → a card that opens a window; ARTIFACTS → inline. Sidebar window (no collapsible) → inline.
  const asCard = !!ctx.collapsible && !isArtifact;
  const canSave = SAVEABLE.has(widget.kind) && !!ctx.onSaveArtifact;
  const saveArtefact = async () => {
    setSaved(true);
    try {
      const art = await composeArtefact(widget, ref.current); // deterministic → an article, no AI
      ctx.onSaveArtifact!({ ...art, from_widget: widget.kind });
    } catch {
      ctx.onSaveArtifact!({ title: `${title} · artefact`, body_md: (ref.current?.innerText ?? "").trim() || "_(empty)_" });
    }
    setTimeout(() => setSaved(false), 1600);
  };

  // the full widget + its toolbar — rendered inline (artifact / sidebar) OR inside the window (a card
  // widget). The flex column + height chain lets fill-widgets (terminals) take the ENTIRE height of a
  // docked panel / fullscreen page; in normal flow (inline artifacts) the 100% resolves to auto — harmless.
  const fullView = (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div ref={ref} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}><Comp payload={widget.payload} ctx={ctx} /></div>
      {/* export controls live behind ONE ⬇ icon — hover expands to save · md · html · pdf */}
      <div onMouseEnter={() => setXOpen(true)} onMouseLeave={() => setXOpen(false)}
        style={{ position: "absolute", top: 3, right: 5, zIndex: 6, display: "flex", alignItems: "center", gap: 2, background: `color-mix(in oklab, ${C.panel} 85%, transparent)`, border: `1px solid ${C.border}`, borderRadius: 6, padding: "1px 4px", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}>
        {xOpen ? (
          <>
            {canSave && <button onClick={() => void saveArtefact()} title="save as an artefact — a deterministic article reshaped from this widget (→ the artefacts rail)" style={{ ...btnS, color: saved ? C.ok : C.brand }}>{saved ? "✓ saved" : "⊕ save"}</button>}
            {canSave && <span style={{ color: C.dim, opacity: 0.4, fontSize: 9 }}>·</span>}
            {/* ➤ hand this widget's data to an agent: file into its worktree + one line typed into its PTY */}
            <AgentActionButton chatSessionId={ctx.chatSessionId} label="➤ agent" title="feed this widget to an agent — its data lands in the agent's worktree and the terminal is told to read it"
              act={async (a) => {
                const uid = (widget.payload as any)?._uid ?? `${widget.kind}-${Date.now().toString(36)}`;
                const item = (widget.payload as any)?.item;
                const content = item?.body_md
                  ? `# ${item.title ?? title}\n\n${item.body_md}`
                  : `# widget ${title} (#${uid})\n\nkind: ${widget.kind}\n\npayload:\n\n\`\`\`json\n${JSON.stringify(widget.payload ?? {}, null, 2).slice(0, 100000)}\n\`\`\`\n\n(the live view self-fetches from the substrate; this snapshot carries its identity + args)`;
                const path = await feedAgent(a.id, uid, content);
                return path ? `fed → #${a.id}` : null;
              }} />
            <span style={{ color: C.dim, opacity: 0.4, fontSize: 9 }}>·</span>
            <ExportButtons getNode={() => ref.current} title={title} size={9} />
          </>
        ) : (
          <span title="export — hover for save · md · html · pdf" style={{ ...btnS, cursor: "default" }}>⬇</span>
        )}
      </div>
    </div>
  );

  if (!asCard) return fullView;

  return (
    <>
      {/* IN THE CHAT: just the NAME, wearing the box effect (operator 2026-07-26) — the circulating
          ember ring + reflex on a compact pill. The full preview box lives in the instruments rail. */}
      <div className="loki-widget-pill" onClick={() => setOpen(true)} title="open this widget in a window"
        style={{ marginTop: 8, cursor: "pointer", fontFamily: mono }}>
        <span style={{ position: "relative", zIndex: 2, color: C.brand, fontSize: 11 }}>◆</span>
        <span style={{ position: "relative", zIndex: 2, color: C.fg, fontWeight: 700, fontSize: 11, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {(widget.payload as any)?._uid && <span style={{ position: "relative", zIndex: 2, color: C.dim, fontSize: 8.5 }}>#{(widget.payload as any)._uid}</span>}
        {/* ⠿ drag to a screen side → the widget docks as a sidebar (sides only — the zone narrows safely) */}
        {ctx.onDockWidget && <span style={{ position: "relative", zIndex: 2, marginLeft: 2 }} onClick={(e) => e.stopPropagation()}><WidgetDragGrip label={label} onDock={(z) => ctx.onDockWidget!(z as "left" | "right", widget)} /></span>}
        <span style={{ position: "relative", zIndex: 2, color: C.brand, fontSize: 9.5, fontWeight: 700 }}>↗</span>
      </div>
      {open && createPortal(
        // FULLSCREEN PAGE (not a window): the widget owns the whole viewport, entered with a grow
        // animation. ← back / Esc returns. LEFT: the explainer sidebar (what this widget is, its
        // sections, its nature). MAIN: the widget INTEGRATED on the page — its box borders flattened.
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: C.bg, display: "flex", flexDirection: "column", animation: "lwcExpand .18s ease-out", transformOrigin: "center 40%" }}>
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: `1px solid ${C.border}` }}>
            <button onClick={() => setOpen(false)} title="back to the chat (Esc)" style={{ ...btnS, fontSize: 12, color: C.muted }}>← back</button>
            <span style={{ color: C.brand, fontFamily: mono, fontSize: 12 }}>◆</span>
            <span style={{ color: C.fg, fontFamily: mono, fontSize: 12.5, fontWeight: 700 }}>{label}</span>
            {(widget.payload as any)?._uid && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>#{(widget.payload as any)._uid}</span>}
            <button onClick={() => setOpen(false)} title="close (Esc)" style={{ marginLeft: "auto", ...btnS, fontSize: 14, color: C.muted }}>✕</button>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
            {/* the EXPLAINER — what you're looking at, deterministically */}
            <div style={{ width: 232, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflow: "auto", padding: "14px 14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim, marginBottom: 5 }}>about this widget</div>
                <div style={{ fontFamily: nav, fontSize: 12, lineHeight: 1.6, color: C.fg }}>{familyAbout(widget.kind)}</div>
              </div>
              {cardTopics(widget.kind, widget.payload).filter((t) => !t.startsWith("#")).length > 0 && (
                <div>
                  <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim, marginBottom: 5 }}>sections</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {cardTopics(widget.kind, widget.payload).filter((t) => !t.startsWith("#")).map((t, i) => (
                      <div key={i} style={{ fontFamily: mono, fontSize: 10, color: C.dim }}><span style={{ color: C.brand }}>·</span> {t}</div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim, marginBottom: 5 }}>nature</div>
                <div style={{ fontFamily: mono, fontSize: 9.5, lineHeight: 1.7, color: C.muted }}>
                  {widget.kind.startsWith("atlas-") || widget.kind === "artifact" ? <>deterministic · <span style={{ color: C.ok }}>$0</span> · from the atlas<br /></> : null}
                  {(widget.payload as any)?._uid ? <>identity <span style={{ color: C.dim }}>#{(widget.payload as any)._uid}</span><br /></> : null}
                  reference it in the chat with <span style={{ color: C.brand }}>#</span>
                </div>
              </div>
            </div>
            {/* the widget, INTEGRATED — page-flat, box borders stripped (.lwx-flat); the height chain
                holds so fill-widgets (terminals) take the whole page */}
            <div className="lwx-flat" style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "10px 22px 26px" }}>
              <div style={{ maxWidth: 1100, margin: "0 auto", height: "100%", display: "flex", flexDirection: "column" }}>{fullView}</div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
