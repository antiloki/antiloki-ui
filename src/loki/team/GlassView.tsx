// A GLASS WINDOW OVER THE WHOLE PAGE (the operator 2026-11-20: "like a window glassy overflow the whole page"): drawn on the page itself through a portal, so no card, graph or pane around the thing that opens it can hold it in. Esc, ✕ or a click outside closes it.
import * as React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";

export function GlassView({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => { const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on); }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-testid="glass-view" role="dialog" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", background: "rgba(8,9,10,.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
      <div style={{ width: "calc(100vw - 48px)", height: "calc(100vh - 48px)", display: "flex", flexDirection: "column", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,.14)", background: "rgba(24,24,28,.72)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.1)", fontFamily: nav, fontSize: 12.5, color: C.muted }}>
          <b style={{ color: C.fg, fontWeight: 600 }}>{title}</b>{sub && <span style={{ fontFamily: mono, fontSize: 11 }}>{sub}</span>}
          <button data-testid="glass-close" aria-label="close full screen" title="Close (Esc)" onClick={onClose} style={{ marginLeft: "auto", width: 26, height: 26, borderRadius: 8, border: "1px solid rgba(255,255,255,.14)", background: "transparent", color: C.fg, cursor: "pointer", fontSize: 13, padding: 0 }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>{children}</div>
      </div>
    </div>, document.body);
}
