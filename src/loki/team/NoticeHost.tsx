// WHERE A TEAM'S NOTICES FLOAT (the operator 2026-11-18: "drop the notifications from the top bar of teams, place them floating where the reasoning was"): the team pane makes one glass stack at its bottom right and hands the element to whatever below it has a notice to show; with no host (a test, another screen) a notice is drawn where it stands.
import * as React from "react";
import { createPortal } from "react-dom";
export const NoticeHost = React.createContext<HTMLElement | null>(null);
/** Draw `node` in the floating stack when there is one, else in place. */
export function useNotice(): (node: React.ReactNode) => React.ReactNode { const host = React.useContext(NoticeHost); return (node) => (host && node ? createPortal(<NoticeCard>{node}</NoticeCard>, host) : node); }
/** A glass card for a notice that draws itself or draws nothing: an empty one takes no room. */
export function NoticeCard({ children }: { children: React.ReactNode }) {
  const [gone, setGone] = React.useState(false);
  if (gone) return null;
  // the × is the card's own and discreet; a card that holds only the × (its notice drew nothing) is hidden by the pane's style (`.tn-card:not(:has(> :not(.tn-x)))`)
  return (
    <div className="tn-card" style={{ position: "relative", flexShrink: 0, pointerEvents: "auto", borderRadius: 14, overflow: "hidden", background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 84%, transparent)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid var(--c-border)", boxShadow: "0 8px 28px rgba(0,0,0,.28)" }}>
      {children}
      <button className="tn-x" data-testid="notice-close" aria-label="dismiss" title="dismiss" onClick={() => setGone(true)} style={{ position: "absolute", top: 4, right: 6, width: 18, height: 18, lineHeight: "16px", padding: 0, border: "none", background: "transparent", color: "var(--c-muted, #8b8b94)", opacity: 0.55, cursor: "pointer", fontSize: 12, borderRadius: 5 }}>✕</button>
    </div>
  );
}
