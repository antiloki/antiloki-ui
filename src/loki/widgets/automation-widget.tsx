// AUTOMATION (operator 2026-09-21: "create a new widget called automation and make this pane be the
// antiFlow screen"). antiFlow is the card-driven pipeline PL → TL → DEV → QA → MAN → GIT run by the
// driver; its screen is Operations › Pipeline — the driver's queue (the next card, why the others
// wait) over the phase columns of every active card, live. This widget is that screen as a thread
// cell: the same two components, no new data plumbing, $0 to watch.
import React from "react";
import { DriverQueuePanel } from "@/loki/driver-queue-panel";
import { KanbanPipelineLive } from "@/loki/kanban-live";
import { C, mono } from "@/loki/theme";
import type { WidgetProps } from "./types";

export function AutomationWidget(_p: WidgetProps) {
  return (
    <div data-testid="automation-widget" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 420, background: C.bg, fontFamily: mono }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.muted }}>
        <span style={{ color: C.brand, letterSpacing: 1, textTransform: "uppercase", fontSize: 9.5 }}>antiFlow</span>
        <span>PL → TL → DEV → QA → MAN → GIT · the driver's queue and every active card, live</span>
      </div>
      <div style={{ padding: "10px 14px 0", flexShrink: 0 }}><DriverQueuePanel /></div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}><KanbanPipelineLive /></div>
    </div>
  );
}
