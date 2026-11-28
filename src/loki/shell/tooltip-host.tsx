// TOOLTIPS EVERYWHERE (approved mockup 2026-11-18, from the idea of AffectUI's Tooltip; drawn by us): one host for the whole app. Any control that has a `title` (or `data-tip`) shows a small card after a short wait, instead of the browser's plain one: the words, and the shortcut when it
// has `data-keys` ("Mod K" shows as Ctrl K or ⌘ K from the platform, spelled out for screen readers). It never flickers (a wait before it shows, none between two controls), goes away on leave, focus out, Escape or scroll, and leaves the control's title as it was. While ours is up the control wears an EMPTY title: removing it made the browser show an ancestor's card over ours (2026-11-27).
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";

export const SHOW_MS = 350;
/** The words and keys of a control, or null when it has none. `data-tip` wins over `title`. Pure over the element's attributes. */
export function tipOf(el: Element | null): { text: string; keys: string[] } | null {
  for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
    const text = (e.getAttribute("data-tip") || e.getAttribute("title") || e.getAttribute("data-title") || "").trim(); if (!text) continue;
    return { text, keys: (e.getAttribute("data-keys") ?? "").split(" ").filter(Boolean) };
  }
  return null;
}
/** `Mod` is the platform's own key. Pure. */
export const keyLabel = (k: string, mac: boolean): string => (k === "Mod" ? (mac ? "⌘" : "Ctrl") : k);
const isMac = () => typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");

export function TooltipHost() {
  const [tip, setTip] = React.useState<{ text: string; keys: string[]; x: number; y: number; above: number | null } | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null); const held = React.useRef<{ el: Element; title: string | null } | null>(null); const shown = React.useRef(false);
  React.useEffect(() => {
    const restore = () => { const h = held.current; if (h) { if (h.title === null) h.el.removeAttribute("title"); else h.el.setAttribute("title", h.title); h.el.removeAttribute("data-title"); held.current = null; } };
    const hide = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } restore(); shown.current = false; setTip(null); };
    const over = (e: Event) => {
      const t = e.target as Element | null; if (!t || !(t as Element).closest) return; const src = t.closest("[title],[data-tip],[data-title]"); if (!src) { hide(); return; }
      if (held.current?.el === src) return; hide(); const raw = src.getAttribute("title"); held.current = { el: src, title: raw }; if (raw) src.setAttribute("data-title", raw); src.setAttribute("title", "");   // the browser's own card must not show beside ours, nor an ancestor's
      const info = tipOf(src); if (!info) return; const go = () => { const r = src.getBoundingClientRect(); shown.current = true; setTip({ ...info, x: r.left + r.width / 2, y: r.bottom + 8, above: r.bottom + 90 > window.innerHeight ? window.innerHeight - r.top + 8 : null }); };   // a control at the bottom edge: the card goes above it
      if (shown.current) go(); else timer.current = setTimeout(go, SHOW_MS);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("mouseover", over); document.addEventListener("focusin", over); document.addEventListener("mouseleave", hide); document.addEventListener("focusout", hide); document.addEventListener("keydown", key); document.addEventListener("scroll", hide, true); document.addEventListener("mousedown", hide);
    return () => { document.removeEventListener("mouseover", over); document.removeEventListener("focusin", over); document.removeEventListener("mouseleave", hide); document.removeEventListener("focusout", hide); document.removeEventListener("keydown", key); document.removeEventListener("scroll", hide, true); document.removeEventListener("mousedown", hide); hide(); };
  }, []);
  if (!tip) return null; const mac = isMac();
  const w = 250; const left = Math.max(8, Math.min((typeof window !== "undefined" ? window.innerWidth : 1200) - w - 8, tip.x - w / 2));
  return (
    <div data-testid="tooltip" role="tooltip" style={{ position: "fixed", left, ...(tip.above === null ? { top: tip.y } : { bottom: tip.above }), zIndex: 2000, maxWidth: w, pointerEvents: "none", padding: "6px 9px", borderRadius: 9, fontFamily: nav, fontSize: 12, lineHeight: 1.4, color: C.fg, background: C.panel, border: `1px solid ${C.border}` }}>
      {tip.text}
      {tip.keys.length > 0 && <span style={{ display: "flex", gap: 4, marginTop: 5 }}>{tip.keys.map((k, i) => <kbd key={i} style={{ fontFamily: mono, fontSize: 10.5, border: `1px solid ${C.border}`, borderRadius: 4, padding: "0 5px", color: C.muted }}>{keyLabel(k, mac)}</kbd>)}<span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{tip.keys.map((k) => (k === "Mod" ? (mac ? "Command" : "Control") : k)).join(" ")}</span></span>}
    </div>
  );
}
