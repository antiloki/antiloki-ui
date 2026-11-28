// The widget registry: maps a WidgetKind to its renderer. deriveWidgets (chat-
// turn driven) and the slash palette (operator-summoned) both resolve through
// here, so adding a widget is one entry — no edits to the chat thread.
// NO @ts-nocheck (2026-07-11): the Record<WidgetKind, WidgetComponent> type is
// the exhaustiveness check — add a WidgetKind without a renderer here and tsc
// errors, instead of the widget resolving to undefined and crashing at runtime.
// This is the one file where nocheck actively hid bugs (the 'sources' gap).
import * as React from "react";
import type { WidgetComponent, WidgetKind } from "./types";
import { ConfirmWidget } from "./confirm-widget";
import { EpisodeArticleWidget } from "./episode-article-widget";
import { ScreeningWidget } from "./screening-widget";
import { OffersWidget } from "./offers-widget";
import {
  BoardWidget, CardDetailWidget, TableWidget, CodeWidget, CodeSampleWidget,
  AnswerWidget, ArtifactWidget, DiffWidget, GraphWidget, DiagramWidget, LogicSpecWidget, SummaryWidget, ImprovementsWidget, TabsWidget,
  DriverQueueWidget, PipelineWidget, CostWidget,
  AuditTimelineWidget, MemorySearchWidget, SourcesWidget,
} from "./view-widgets";
import { VibeTodoWidget, VibeKanbanWidget, VibeIssuesWidget, VibeNotesWidget, VibeSketchWidget, VibePaneWidget } from "./vibe-widgets";
import { SkillLibraryWidget } from "./skill-library-widget";
import { SharedDiffWidget } from "./shared-diff-widget";
import { AutomationWidget } from "./automation-widget";

// The atlas widgets reuse the real antiIDE panels, so a static import here put the
// whole antiIDE (22k lines, 17 panels) into the ENTRY bundle — this registry is
// reached from the chat drawer, which mounts on every route. They load on first
// render instead, as one shared chunk (they have the same dependencies anyway).
// Each stays a plain WidgetComponent so the Record exhaustiveness check below and
// every render site keep working untouched.
const atlasModule = () => import("./atlas-widgets");
const designModule = () => import("./design-widgets");
function lazyDesign(pick: (m: Awaited<ReturnType<typeof designModule>>) => WidgetComponent): WidgetComponent {
  const Inner = React.lazy(() => designModule().then((m) => ({ default: pick(m) })));
  return (props) => (
    <React.Suspense fallback={<div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, opacity: 0.5, padding: 8 }}>loading…</div>}>
      <Inner {...props} />
    </React.Suspense>
  );
}
function lazyAtlas(pick: (m: Awaited<ReturnType<typeof atlasModule>>) => WidgetComponent): WidgetComponent {
  const Inner = React.lazy(() => atlasModule().then((m) => ({ default: pick(m) })));
  return (props) => (
    <React.Suspense fallback={<div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, opacity: 0.5, padding: 8 }}>loading…</div>}>
      <Inner {...props} />
    </React.Suspense>
  );
}

export const WIDGET_REGISTRY: Record<WidgetKind, WidgetComponent> = {
  confirm: ConfirmWidget,
  screening: ScreeningWidget,
  board: BoardWidget,
  "card-detail": CardDetailWidget,
  table: TableWidget,
  code: CodeWidget,
  "code-sample": CodeSampleWidget,
  answer: AnswerWidget,
  diff: DiffWidget,
  graph: GraphWidget,
  diagram: DiagramWidget,
  "logic-spec": LogicSpecWidget,
  summary: SummaryWidget,
  improvements: ImprovementsWidget,
  tabs: TabsWidget,
  "driver-queue": DriverQueueWidget,
  pipeline: PipelineWidget,
  cost: CostWidget,
  "audit-timeline": AuditTimelineWidget,
  "memory-search": MemorySearchWidget,
  sources: SourcesWidget,
  artifact: ArtifactWidget,
  offers: OffersWidget,
  // ANTIIDE-IN-CHAT — reuse the real antiIDE components inline, deterministic + $0
  "atlas-review": lazyAtlas((m) => m.AtlasReviewWidget),
  "atlas-graph": lazyAtlas((m) => m.AtlasGraphWidget),
  "design-view": lazyDesign((m) => m.DesignViewWidget),
  "design-frames": lazyDesign((m) => m.DesignFramesWidget),
  "atlas-diagram": lazyAtlas((m) => m.AtlasDiagramWidget),
  "atlas-authors": lazyAtlas((m) => m.AtlasAuthorsWidget),
  "atlas-docs": lazyAtlas((m) => m.AtlasDocsWidget),
  "atlas-constitution": lazyAtlas((m) => m.AtlasConstitutionWidget),
  "skill-library": SkillLibraryWidget,
  "shared-diff": SharedDiffWidget,
  automation: AutomationWidget,
  "atlas-xray": lazyAtlas((m) => m.AtlasXrayWidget),
  "atlas-code": lazyAtlas((m) => m.AtlasCodeWidget),
  "episode-article": EpisodeArticleWidget,
  "atlas-git": lazyAtlas((m) => m.AtlasGitWidget),
  "vibe-todo": VibeTodoWidget,
  "vibe-kanban": VibeKanbanWidget,
  "vibe-issues": VibeIssuesWidget,
  "vibe-notes": VibeNotesWidget,
  "vibe-sketch": VibeSketchWidget,
  "vibe-pane": VibePaneWidget,
};
