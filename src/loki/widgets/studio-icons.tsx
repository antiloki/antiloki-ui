import React from "react";
import {
  Sparkles, Bot, SquareTerminal,
  Terminal, Palette, Crosshair, Brain, Megaphone, GitCompareArrows,
  ListChecks, SquareKanban, CircleDot, NotebookPen, PenTool,
  Frame, SwatchBook, Camera, Component, Ruler,
  Waypoints, Workflow, Users, ScanSearch, Scale, BookOpen, FileCode2, GitBranch,
  Compass, MessagesSquare, Box, type LucideIcon,
} from "lucide-react";
import { C } from "@/loki/theme";

// THE STUDIO ICONS (operator 2026-09-18: "the mini icons are ugly and generic, they mean nothing").
// One pictogram per kind that SAYS what the widget is — a terminal is a terminal, the kanban is
// columns, x-ray is a scan — and one tint per catalog category so the grid reads as four families.
const KIND_ICON: Record<string, LucideIcon> = {
  // agents
  chat: MessagesSquare,
  "claude-code": Sparkles,
  codex: Bot,
  opencode: SquareTerminal,
  "opencode-direct": SquareTerminal,
  // tools · panes
  terminal: Terminal,
  design: Palette,
  intent: Crosshair,
  context: Brain,
  standup: Megaphone,
  diff: GitCompareArrows,
  // tools · session boards
  "vibe-todo": ListChecks,
  "vibe-kanban": SquareKanban,
  "vibe-issues": CircleDot,
  "vibe-notes": NotebookPen,
  "vibe-sketch": PenTool,
  "shared-diff": GitCompareArrows,
  // design
  "design-frames": Frame,
  "design-view:system": SwatchBook,
  "design-view:components": Component,
  // codebase
  "atlas-graph": Waypoints,
  "atlas-diagram": Workflow,
  "atlas-authors": Users,
  "atlas-xray": ScanSearch,
  "atlas-constitution": Scale,
  "skill-library": BookOpen,
  "atlas-code": FileCode2,
  "atlas-git": GitBranch,
};
export const CATEGORY_TINT: Record<string, string> = { chats: C.fg, agents: C.brand, tools: C.ok, design: C.warn, codebase: C.muted };

/** The catalog key may be prefixed (`vibe-pane:terminal`) — the icon is keyed by the bare kind. */
export function studioIconFor(kind: string): LucideIcon {
  const bare = kind.startsWith("vibe-pane:") ? kind.slice("vibe-pane:".length) : kind;
  return KIND_ICON[bare] ?? KIND_ICON[bare.split(":")[0]] ?? Box;
}

export function StudioIcon({ kind, category, size = 18, active }: { kind: string; category?: string; size?: number; active?: boolean }) {
  const Icon = studioIconFor(kind);
  const tint = CATEGORY_TINT[category ?? ""] ?? C.dim;
  return <Icon size={size} strokeWidth={1.75} color={active ? C.brand : tint} style={{ flex: "none" }} aria-hidden data-studio-icon={kind} />;
}
