// DESIGN WIDGETS (operator 2026-09-17: "a new category: Design, with the design widgets from antiIDE —
// all design features — and a figma-like pixel-perfect representation of the screens").
// `design-view` mounts antiIDE's Design screen on one tab (system · components · frames);
// `design-frames` is the editor over the captured screens.
import React from "react";
import { DesignView, designTabOf } from "@/loki/codebase/design-view";
import { DesignFrames } from "@/loki/design/frames";
import type { WidgetProps } from "./types";

export function DesignViewWidget({ payload }: WidgetProps) {
  return <div style={{ flex: 1, minHeight: 0, height: "100%", overflow: "auto" }}><DesignView initialTab={designTabOf(payload?.tab)} /></div>;
}
export function DesignFramesWidget({ payload }: WidgetProps) {
  return <DesignFrames payload={payload} />;
}
