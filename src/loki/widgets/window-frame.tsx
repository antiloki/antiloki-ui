// THE WINDOW FRAME (2026-09-19, the ⚙ agent wizard): every pane window — edit · context · subagents ·
// audit — renders inside the wizard as a tab (embedded: a plain column, no overlay, no ✕) or, as
// before, as its own modal. One wrapper, so the windows keep their bodies untouched.
import React from "react";
import { C, mono } from "@/loki/theme";

export function Frame({ embedded, onClose, testId, width = "min(860px, 96vw)", height = "min(88vh, 720px)", children }: { embedded?: boolean; onClose: () => void; testId?: string; width?: string; height?: string; children: React.ReactNode }) {
  if (embedded) return <div data-testid={testId} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>{children}</div>;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} data-testid={testId} style={{ width, height, maxHeight: "90vh", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>{children}</div>
    </div>
  );
}
/** the ✕ of a window header — absent when the window is a wizard tab */
export const CloseX = ({ embedded, onClose }: { embedded?: boolean; onClose: () => void }) => embedded ? null : <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>;
