// THE PANES AS PAGES (a phone): the pane shown fills the screen, a horizontal drag anywhere on it switches to the next or the previous, with a short slide, and a strip of dots (tap one to jump) says where you are.
// The real layout is never changed by this: only which pane has the focus. A desktop does not use it.
import * as React from "react";
import { C, mono } from "@/loki/theme";
import { startsInSideScroll, stepTo, swipeStep } from "./swipe";

export type PagerPane = { id: string; title: string };
export function PanePager({ panes, focusId, onFocus, children }: { panes: PagerPane[]; focusId: string | null; onFocus: (id: string) => void; children: React.ReactNode }) {
  const root = React.useRef<HTMLDivElement>(null); const page = React.useRef<HTMLDivElement>(null);
  const from = React.useRef<{ x: number; y: number; blocked: boolean } | null>(null); const [slide, setSlide] = React.useState<"" | "next" | "prev">("");
  const ids = panes.map((p) => p.id);
  // The latest of everything the native listeners need, read through a ref (they are attached once).
  const live = React.useRef({ ids, focusId, onFocus }); live.current = { ids, focusId, onFocus };
  const go = (step: 1 | -1) => { const to = stepTo(live.current.ids, live.current.focusId, step); if (to) { setSlide(step === 1 ? "next" : "prev"); live.current.onFocus(to); } };
  // NATIVE LISTENERS IN THE CAPTURE PHASE (operator 2026-11-12: "on the phone I can't switch panes by dragging sideways"): a terminal, an editor or a frame inside a pane takes its own touches and may stop them from bubbling, so a handler on the way UP never hears them. Capturing sees every touch first and never stops one.
  React.useEffect(() => {
    const el = root.current; if (!el) return;
    const down = (e: TouchEvent) => { const t = e.touches[0]; if (!t || e.touches.length > 1) { from.current = null; return; } from.current = { x: t.clientX, y: t.clientY, blocked: startsInSideScroll(e.target as Element, el) }; };
    const move = (e: TouchEvent) => { const f = from.current, t = e.touches[0]; if (!f || f.blocked || !t || !page.current) return; const dx = t.clientX - f.x, dy = t.clientY - f.y; if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) { page.current.style.transition = "none"; page.current.style.transform = `translateX(${Math.max(-90, Math.min(90, dx * 0.35))}px)`; } };
    const up = (e: TouchEvent) => { const f = from.current; from.current = null; if (page.current) { page.current.style.transition = "transform .18s ease"; page.current.style.transform = ""; } const t = e.changedTouches[0]; if (!f || f.blocked || !t) return; const step = swipeStep(t.clientX - f.x, t.clientY - f.y); if (step) go(step); };
    const cancel = () => { from.current = null; if (page.current) page.current.style.transform = ""; };
    const o = { capture: true, passive: true } as const;
    el.addEventListener("touchstart", down, o); el.addEventListener("touchmove", move, o); el.addEventListener("touchend", up, o); el.addEventListener("touchcancel", cancel, o);
    return () => { el.removeEventListener("touchstart", down, o); el.removeEventListener("touchmove", move, o); el.removeEventListener("touchend", up, o); el.removeEventListener("touchcancel", cancel, o); };
  }, []);
  return (
    <div ref={root} data-testid="pane-pager" style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column", touchAction: "pan-y pinch-zoom" }}>
      <style>{`@keyframes cw-in-next{from{opacity:.4;transform:translateX(36px)}to{opacity:1;transform:none}}@keyframes cw-in-prev{from{opacity:.4;transform:translateX(-36px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){[data-pager-page]{animation:none!important}}`}</style>
      <div ref={page} key={focusId ?? "none"} data-pager-page data-slide={slide} style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", padding: 8, animation: slide ? `cw-in-${slide} .2s ease-out` : undefined }}>{children}</div>
      {panes.length > 1 && <div data-testid="pager-dots" role="tablist" aria-label="panes" style={{ flexShrink: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "4px 12px 6px", overflowX: "auto" }}>
        {panes.map((p) => { const on = p.id === focusId; return <button key={p.id} role="tab" aria-selected={on} data-testid={`pager-dot-${p.id}`} title={p.title} aria-label={p.title} onClick={() => { const a = ids.indexOf(focusId ?? ""), b = ids.indexOf(p.id); setSlide(b >= a ? "next" : "prev"); onFocus(p.id); }}
          style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "transparent", color: on ? C.fg : C.dim, fontFamily: mono, fontSize: 10, padding: "3px 4px", cursor: "pointer" }}>
          <i style={{ width: on ? 16 : 7, height: 7, borderRadius: 4, background: on ? C.brand : C.border, display: "inline-block", transition: "width .15s" }} />{on && <span style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>}</button>; })}
      </div>}
    </div>
  );
}
