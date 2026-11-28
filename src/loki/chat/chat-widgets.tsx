// A WIDGET OPENS BESIDE THE CHAT (operator 2026-09-23). This began as cards in the transcript with a `split`
// button on each; the operator tried it and cut it back — "do not show them in the chat inside", "was suppose to
// open in split screen … at least 1 per time", "split screen i mean vertically splited". So there is no card and no
// button: a pick from the Studio IS the split, and it takes the right half of the conversation's row.
//
// The rule that keeps this from becoming threads again: ONE widget at a time. There is no layout, no zones, no
// composition to name. Picking a second replaces the first, and closing it gives the width back.
import React from "react";
import { paneKey } from "@/loki/api/workspace-scope";
import { createPortal } from "react-dom";
import { C, mono } from "@/loki/theme";
import { WidgetHost } from "@/loki/widgets/widget-host";
import type { Widget } from "@/loki/widgets/types";

/** A widget the conversation produced: which one, what it was called, and the turn it belongs to. */
export type ChatWidget = { id: string; seq: number; t: number; title: string; widget: Widget; why?: string };

/** The widget currently split beside a chat, remembered per pane so it survives a re-render. Pure. */
export function splitKey(paneId: number): string { return paneKey("antiloki:split-widget", paneId); }
export function readSplit(paneId: number): string | null {
  try { return localStorage.getItem(splitKey(paneId)); } catch { return null; }
}
export function writeSplit(paneId: number, id: string | null) {
  try { if (id) localStorage.setItem(splitKey(paneId), id); else localStorage.removeItem(splitKey(paneId)); } catch { /* fine */ }
}

/** the widget kinds a chat can raise by itself, and the word each one goes by in the transcript. Pure. */
export const CHAT_WIDGETS: Record<string, string> = {
  "shared-diff": "the diff", "atlas-xray": "the review", "atlas-graph": "the graph", "atlas-code": "the code",
  "vibe-todo": "the issues", "vibe-kanban": "the issues", "vibe-issues": "the issues", "design-frames": "the frames", "atlas-constitution": "the laws",
  "atlas-git": "the history", run: "the run", terminal: "the terminal",
};
export const widgetWord = (kind: string) => CHAT_WIDGETS[kind] ?? kind.replace(/^(atlas|design|vibe)-/, "").replace(/-/g, " ");

/** The right half of the split. NO CHROME OF ITS OWN (operator 2026-09-23: "the widget headers take out, the
 *  rounded header is not needed, already has header, integrate them into the page on the splitted section"): the
 *  widget renders as the page it is, edge to edge. Two controls sit in a gutter down the left, where no widget
 *  draws: ✕ closes it, and ⤢ takes it FULL SCREEN over the desk (operator: "to all widgets on the pane add an
 *  expand button to the whole screen show the widget") — ⤡ or Escape brings it back beside the chat. */
export function SplitPane({ w, onClose, chatSessionId }: { w: ChatWidget; onClose: () => void; chatSessionId?: number | null }) {
  const [full, setFull] = React.useState(false);
  React.useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [full]);
  const gutter: React.CSSProperties = { position: "absolute", left: 3, zIndex: 3, fontFamily: mono, fontSize: 10,
    lineHeight: "16px", background: "transparent", border: "none", color: C.dim, padding: "0 4px", cursor: "pointer" };
  const body = (
    <div data-testid="split-pane" data-full={full ? "1" : undefined}
      style={full
        ? { position: "fixed", inset: 0, zIndex: 4000, display: "flex", flexDirection: "column", background: C.bg }
        : { display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, flex: 1, borderLeft: `1px solid ${C.border}`, position: "relative" }}>
      <button data-testid="split-close" onClick={onClose} title={`close ${w.title} — the conversation takes the whole width again`}
        style={{ ...gutter, top: full ? 8 : 38 }}>✕</button>
      <button data-testid="split-full" onClick={() => setFull((f) => !f)}
        title={full ? "back beside the conversation" : `${w.title} over the whole screen`}
        style={{ ...gutter, top: full ? 30 : 60 }}>{full ? "⤡" : "⤢"}</button>
      {/* the top strip is reserved while it sits beside the chat: the desk floats its own chrome (the view toggle,
          the agents pill) across the whole width, and the widget's first line landed underneath it. Full screen is
          over all of that, so it only needs room for the two buttons. */}
      <div className="lwx-flat" style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", paddingLeft: 22, paddingTop: full ? 8 : 34 }}>
        <WidgetHost widget={w.widget} ctx={{ variant: "page", collapsible: false, chatSessionId }} />
      </div>
    </div>
  );
  // FULL SCREEN GOES TO THE BODY. The desk animates its panels with transforms, and a transformed ancestor becomes
  // the containing block for `position: fixed` — so the "full screen" pane was fixed to its own column, 1113px of a
  // 1387px window. A portal is the only way out of that.
  return full ? createPortal(body, document.body) : body;
}
