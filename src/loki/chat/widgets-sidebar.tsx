// SESSION WIDGETS RAIL — a right sidebar listing every generated widget in this chat session (Studio
// results + pasted antiIDE/antiVibe panels), gathered from each turn via deriveWidgets + the live
// localWidgets. Clicking one opens it in a focused window (a modal over the thread). Control widgets
// (confirm / screening / offers / sources / answer) are chat-flow, not "generated", so they're hidden.
import React from "react";
import { createPortal } from "react-dom";
import { C, mono } from "@/loki/theme";
import { deriveWidgets } from "@/loki/widgets/derive";
import { WidgetHost, WidgetPreviewCard } from "@/loki/widgets/widget-host";
import type { Widget } from "@/loki/widgets/types";

const HIDDEN = new Set(["confirm", "screening", "offers", "sources", "answer"]);
const KIND_META: Record<string, { glyph: string; label: string }> = {
  "atlas-review": { glyph: "§", label: "File review" },
  "atlas-graph": { glyph: "◉", label: "Code graph" },
  "atlas-diagram": { glyph: "▦", label: "System design" },
  "atlas-authors": { glyph: "@", label: "Authors" },
  "atlas-xray": { glyph: "◔", label: "X-ray" },
  "atlas-docs": { glyph: "❡", label: "Docs" },
  "atlas-constitution": { glyph: "⚖", label: "Constitution" },
  "vibe-todo": { glyph: "☑", label: "Todo" },
  "vibe-kanban": { glyph: "▦", label: "Kanban" },
  "vibe-issues": { glyph: "◎", label: "Issues" },
  "vibe-notes": { glyph: "✐", label: "Notes" },
  "vibe-sketch": { glyph: "✎", label: "Sketch" },
  "automation": { glyph: "⟳", label: "Automation" },
  diagram: { glyph: "◫", label: "Diagram" },
  graph: { glyph: "◉", label: "Graph" },
  code: { glyph: "⌨", label: "Code" },
  "code-sample": { glyph: "⌨", label: "Code" },
  improvements: { glyph: "✦", label: "Improvements" },
  "logic-spec": { glyph: "⚙", label: "Logic" },
  table: { glyph: "▤", label: "Table" },
  summary: { glyph: "▸", label: "Summary" },
  artifact: { glyph: "◆", label: "Artifact" },
  diff: { glyph: "±", label: "Diff" },
  "card-detail": { glyph: "▢", label: "Card" },
  board: { glyph: "▦", label: "Board" },
  tabs: { glyph: "▤", label: "Tabs" },
};
const metaFor = (k: string) => KIND_META[k] ?? { glyph: "▪", label: k };
// the generic cockpit pane carries its real kind in the payload — label it by that, not "vibe-pane".
const metaOf = (w: Widget) =>
  w.kind === "vibe-pane" ? { glyph: "❯", label: String((w.payload as any)?.paneKind ?? "pane") }
  : w.kind === "artifact" ? { glyph: "◆", label: String((w.payload as any)?.item?.title ?? "artefact") }
  : metaFor(w.kind);

type Item = { widget: Widget; turnId: number | null };

export function WidgetsSidebar({ turns, localWidgets, onSaveArtifact, only, frameless, chatSessionId, sessionBrief }: {
  turns: any[]; localWidgets: { id: string; widget: Widget }[]; onSaveArtifact?: (item: any) => void;
  // EVERYTHING-IS-A-WIDGET (operator 2026-07-25): the rail can render ONE section (widgets OR artefacts)
  // so each is its own dockable; frameless drops the fixed width/border (the dock panel provides them).
  only?: "widgets" | "artifacts";
  frameless?: boolean;
  // CLI panes opened from the rail provision their box keyed to the chat session (+ its brief).
  chatSessionId?: number | null;
  sessionBrief?: string | null;
}) {
  const [open, setOpen] = React.useState<Item | null>(null);
  const items: Item[] = React.useMemo(() => {
    const out: Item[] = [];
    for (const t of turns ?? []) for (const w of deriveWidgets(t, false)) if (!HIDDEN.has(w.kind)) out.push({ widget: w, turnId: (t?.id as number) ?? null });
    for (const lw of localWidgets ?? []) if (lw?.widget && !HIDDEN.has(lw.widget.kind)) out.push({ widget: lw.widget, turnId: null });
    return out;
  }, [turns, localWidgets]);
  const widgets = only === "artifacts" ? [] : items.filter((it) => it.widget.kind !== "artifact");
  const artefacts = only === "widgets" ? [] : items.filter((it) => it.widget.kind === "artifact");
  const shown = widgets.length + artefacts.length;

  const Row = (it: Item, i: number) => { const m = metaOf(it.widget); return (
    <button key={`${it.widget.key}-${i}`} onClick={() => setOpen(it)} title={`open ${m.label}`}
      style={{ display: "flex", alignItems: "center", gap: 7, textAlign: "left", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 7px", cursor: "pointer", color: C.fg }}>
      <span style={{ fontFamily: mono, fontSize: 11, color: C.brand, width: 14, textAlign: "center", flexShrink: 0 }}>{m.glyph}</span>
      <span style={{ fontFamily: mono, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{m.label}</span>
      {it.turnId != null && <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, flexShrink: 0 }}>#{it.turnId}</span>}
    </button>
  ); };

  const secLabel: React.CSSProperties = { fontFamily: mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.dim, padding: "3px 4px 2px" };

  return (
    <div style={frameless
      ? { display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }
      : { width: 178, flexShrink: 0, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", minHeight: 0, background: C.bg }}>
      {!frameless && <div style={{ padding: "11px 12px 7px", fontFamily: mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.dim, flexShrink: 0 }}>◳ session · {items.length}</div>}
      <div style={{ flex: 1, overflowY: "auto", padding: frameless ? "6px 2px" : "0 8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {!shown
          ? <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, padding: "6px 4px", lineHeight: 1.6 }}>nothing {only === "artifacts" ? "saved" : "generated"} yet — open <b style={{ color: C.dim }}>⊞ Studio</b> in the composer{only === "artifacts" ? ", then ⊕ save a report widget" : ", or type "}<b style={{ color: C.dim }}>{only === "artifacts" ? "" : "/graph"}</b>.</div>
          : <>
              {widgets.length > 0 && only !== "widgets" && <div style={secLabel}>◳ widgets · {widgets.length}</div>}
              {/* the preview BOXES live here now (operator 2026-07-26: out of the chat flow) — 2-up, small */}
              {widgets.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {widgets.map((it, i) => <WidgetPreviewCard key={`${it.widget.key}-${i}`} widget={it.widget} onOpen={() => setOpen(it)} />)}
                </div>
              )}
              {artefacts.length > 0 && only !== "artifacts" && <div style={{ ...secLabel, marginTop: only ? 0 : 6, color: C.brand }}>◆ artefacts · {artefacts.length}</div>}
              {artefacts.map(Row)}
            </>}
      </div>
      {open && createPortal(
        <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1000px, 94vw)", maxHeight: "90vh", overflow: "auto", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 20px 70px rgba(0,0,0,.5)" }}>
            <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.panel }}>
              <span style={{ fontFamily: mono, fontSize: 12, color: C.fg }}>{metaOf(open.widget).glyph} {metaOf(open.widget).label}</span>
              {open.turnId != null && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>turn #{open.turnId}</span>}
              <button onClick={() => setOpen(null)} style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 6, width: 26, height: 26, cursor: "pointer", fontSize: 14 }}>×</button>
            </div>
            <div style={{ padding: 14 }}><WidgetHost widget={open.widget} ctx={{ variant: "page", onSaveArtifact, chatSessionId, sessionBrief }} /></div>
          </div>
        </div>, document.body)}
    </div>
  );
}
