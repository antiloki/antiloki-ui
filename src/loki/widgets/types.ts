// EPIC-CHAT-WIDGETS: a Widget is an inline interactive view rendered inside a
// chat turn — it reads / edits / displays / acts on substrate data. The two
// pre-existing ad-hoc views (the screening questionnaire and the propose/apply
// confirm row) are the first two official widgets; everything else is a read
// view over an existing hook.
import type * as React from "react";
import type { useNavigate } from "@tanstack/react-router";

export type WidgetKind =
  | "episode-article"
  | "confirm"
  | "screening"
  | "board"
  | "card-detail"
  | "table"
  | "code"
  | "code-sample"
  | "answer"
  | "diff"
  | "graph"
  | "diagram"
  | "logic-spec"
  | "summary"
  | "improvements"
  | "tabs"
  | "driver-queue"
  | "pipeline"
  | "cost"
  | "audit-timeline"
  | "memory-search"
  | "sources"
  | "artifact"
  | "offers"
  // ANTIIDE-IN-CHAT: the antiIDE intelligence as inline widgets (deterministic, $0, reuse the real component)
  | "atlas-review"
  | "atlas-graph"
  | "atlas-diagram"
  | "atlas-authors"
  | "atlas-docs"
  | "atlas-constitution"
  | "skill-library"
  | "shared-diff"
  // AUTOMATION (operator 2026-09-21): antiFlow's screen — the driver queue and the cards through PL → TL → DEV → QA → MAN → GIT — as a thread widget
  | "automation"
  | "atlas-xray"
  | "atlas-code"
  | "atlas-git"
  // DESIGN (2026-09-17): antiIDE's design screen by tab, and the figma-like frames editor
  | "design-view"
  | "design-frames"
  // ANTIVIBE-IN-CHAT: the standalone session tools (todo/kanban/notes/sketch), inline + durable
  | "vibe-todo"
  | "vibe-kanban"
  | "vibe-issues"
  | "vibe-notes"
  | "vibe-sketch"
  | "vibe-pane";

export interface Widget {
  kind: WidgetKind;
  key: string;
  payload: any;
}

// Handlers a widget may need to act on the substrate. Threaded from the chat
// thread; display-only widgets ignore most of them.
// the AGENT'S OWN NAME + logo glyph (operator 2026-07-25: a pane titled "pane" is wrong — it's Claude).
// Same glyphs as the cockpit's pane gallery, so the identity is consistent everywhere a pane is titled.
export const AGENT_META: Record<string, { glyph: string; name: string }> = {
  "claude-code": { glyph: "✦", name: "Claude Code" },
  codex: { glyph: "◇", name: "Codex" },
  gemini: { glyph: "✧", name: "Antigravity" },
  grok: { glyph: "✕", name: "Grok" },
  cursor: { glyph: "▣", name: "Cursor" },
  opencode: { glyph: "❯", name: "OpenCode" },
  "opencode-direct": { glyph: "❯", name: "OpenCode · OpenAI" },
};
// tool panes with a PRODUCT name (operator 2026-07-26: the shape pane is titled "RFC Drawer" everywhere).
const TOOL_META: Record<string, { glyph: string; name: string }> = {
  shape: { glyph: "🧩", name: "RFC Drawer" },
  terminal: { glyph: "❯", name: "Terminal" },
  intent: { glyph: "🧠", name: "Brainstorm" },
};
export const paneDisplay = (kind: string): { glyph: string; name: string } =>
  AGENT_META[kind] ?? TOOL_META[kind] ?? { glyph: "❯", name: kind ? kind.replace(/-/g, " ") : "pane" };

export interface WidgetCtx {
  turnId?: number;
  isLast?: boolean;
  confirming?: boolean;
  error?: string | null;
  variant?: "drawer" | "page";
  // when true (the chat thread), a generated widget auto-collapses to a small card a few seconds after
  // the mouse leaves and expands on hover. Left unset in the full-page sidebar window (opened to be read).
  collapsible?: boolean;
  onConfirm?: (turnId: number, confirmationText: string) => void;
  onPickOption?: (text: string) => void;
  // send a NEW message as the user (e.g. a widget's "generate card" button → the interviewer proposes it).
  onAsk?: (text: string) => void;
  onWriteMyself?: () => void;
  onRephrase?: () => void;
  // ✂ Simplify / ⤢ Expand under a reply → system.turn.rewrite; the thread swaps the bubble in place.
  onRewrite?: (turnId: number, operation: "simplify" | "expand") => void;
  // which rewrite is in flight, e.g. "12:simplify" — lets the row show a busy state.
  rewriteBusy?: string | null;
  // ◇ Propose under a reply → the /features design wizard, seeded with the response text.
  // the reply text as currently DISPLAYED (rewrite-aware) — what ⧉ Copy copies.
  shownReply?: string;
  // persist a Studio result onto its turn (chat-history durability). Resolves true when saved
  // (the thread refetches and re-renders it); false → the caller falls back to ephemeral display.
  onPersistStudioResult?: (turnId: number, result: any) => Promise<boolean>;
  // save a widget's output as an artefact into the session (→ the artefacts rail). Available on
  // EVERY widget everywhere (thread, sidebar, summoned) — persists to the session's last turn, else
  // falls back to the thread-bottom rail. `item` = { title, body_md, … } → rendered by ArtifactWidget.
  onSaveArtifact?: (item: any) => void;
  // drag a widget card to a screen side (⠿ grip) → it docks as a resizable sidebar (chat page, max 2 —
  // one per side). Same UX as the antiIDE chat dock (ghost + drop spots + footprint).
  onDockWidget?: (side: "left" | "right", widget: Widget) => void;
  // the ACTIVE CHAT SESSION + its short brief — CLI panes (opencode/claude-code/codex) provision their
  // cockpit box keyed to it and receive the brief as the pane's context.
  chatSessionId?: number | null;
  /** the cockpit session a pane of the Cowork screen belongs to (the Diff pane reads the agents' boxes of it) */
  cockpitSessionId?: number | null;
  sessionBrief?: string | null;
  navigate?: ReturnType<typeof useNavigate>;
}

export interface WidgetProps {
  payload: any;
  ctx: WidgetCtx;
}

export type WidgetComponent = React.FC<WidgetProps>;
