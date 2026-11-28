// A STUDIO WIDGET AS A PANE (operator 2026-11-10): the Studio's tools, hosted as they are, in a pane of the Cowork layout. The widget is the Studio's own (the same registry entry, the same
// payload), so what it shows is what the Studio shows.
import * as React from "react";
import { C, nav } from "@/loki/theme";
import { ensureSession } from "./api";
import { WidgetHost } from "@/loki/widgets/widget-host";
import { VibePaneWidget } from "@/loki/widgets/vibe-widgets";
import type { WidgetKind } from "@/loki/widgets/types";
import { SkillsharePane } from "./SkillsharePane";
import { WebAppsPane } from "./WebAppsPane";
import type { InstalledApp } from "./webapps";
import { SagasScreen } from "@/loki/sagas/sagas-screen";
import type { StudioPane } from "./studio-panes";
import type { PaneRef } from "./layout";

export function StudioWidgetPane({ sp, pane, onOpenApp }: { sp: StudioPane; pane: PaneRef; /** the store's Open on an installed app: it opens in a pane of its own */ onOpenApp?: (a: InstalledApp) => void }) {
  if (sp.via === "webapps") return <WebAppsPane onOpenApp={onOpenApp} />;
  if (sp.via === "skillshare") return <SkillsharePane />;
  // the workspace's sagas, in a pane: the Sagas screen embedded (the page is the one with every workspace)
  if (sp.via === "sagas") return <SagasScreen embedded />;
  // a session pane (the design canvas, brainstorm, diff) is a cockpit pane of that kind, shown by the Studio's own pane widget
  if (sp.via === "session") {
    if (!pane.sessionId || !pane.paneId) return <div style={{ padding: 12, color: C.muted, fontFamily: nav }}>this pane lost its session: close it and open it again</div>;
    return <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" }}><VibePaneWidget payload={{ paneKind: sp.paneKind, sessionId: pane.sessionId, paneId: pane.paneId, title: pane.title }} ctx={{ variant: "page" }} /></div>;
  }
  if (!sp.widget) return null;
  return <WidgetInCowork sp={sp} pane={pane} />;
}

/** A Studio widget in a Cowork pane. It is told which cockpit session the screen's agents belong to (the Diff pane lists THEIR boxes: without it it said "no agent worktrees" with agents open). */
function WidgetInCowork({ sp, pane }: { sp: StudioPane; pane: PaneRef }) {
  const [sid, setSid] = React.useState<number | null>(pane.sessionId ?? null);
  React.useEffect(() => { if (sid || sp.widget !== "shared-diff") return; let stop = false; void ensureSession().then((s) => { if (!stop && s) setSid(s); }); return () => { stop = true; }; }, [sid, sp.widget]);
  return <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}><WidgetHost widget={{ kind: sp.widget as WidgetKind, key: `cowork:${pane.id}`, payload: sp.payload ?? {} }} ctx={{ variant: "page", ...(sid ? { cockpitSessionId: sid } : {}) }} /></div>;
}
