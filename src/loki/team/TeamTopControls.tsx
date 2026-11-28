// WHAT THE TEAM DRAWS ON ITS TOP BAR (the operator 2026-11-22): a Fork button that opens the threads window. It replaces the floating right-hand menu of the team, which is gone. (The Leader is the first view of the view bar, Chat: see TeamRun.)
import * as React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import { Icon } from "./icons";

/** The Fork button: the threads of the team (the same team forked, with a recipe of its own) in a glass window under the button. */
export function ForkButton({ open, onOpen, branch, children }: { open: boolean; onOpen: (o: boolean) => void; branch?: string; children: React.ReactNode }) {
  const btn = React.useRef<HTMLButtonElement>(null); const [at, setAt] = React.useState({ right: 12, top: 40 });
  React.useEffect(() => { if (open && btn.current) { const r = btn.current.getBoundingClientRect(); setAt({ right: Math.max(8, window.innerWidth - r.right), top: r.bottom + 8 }); } }, [open]);
  React.useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") onOpen(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open, onOpen]);
  return <span style={{ position: "relative", display: "inline-flex" }} onMouseDown={(e) => e.stopPropagation()}>
    <button ref={btn} data-testid="team-fork" aria-haspopup="dialog" aria-expanded={open} title="Fork: the same team on another engine, and the threads you have" aria-label="Fork and threads" onClick={() => onOpen(!open)} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 24, padding: "0 8px", borderRadius: 7, border: `1px solid ${open ? C.brand : C.border}`, background: "transparent", color: open ? C.fg : C.muted, cursor: "pointer", fontFamily: mono, fontSize: 11 }}><Icon name="branch" size={13} /></button>
    {/* kept mounted while closed: the thread list is read already when it opens */}
    {createPortal(<div role="dialog" aria-label="Threads of the team" data-testid="team-fork-window" style={{ display: open ? "block" : "none", position: "fixed", right: at.right, top: at.top, zIndex: 2147482000, width: 300, maxHeight: "calc(100vh - 120px)", overflowY: "auto", padding: 4, fontFamily: nav }}>
      {branch && <div title="the team's own branch: its work is merged here, and into your workspace only when you approve" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 11, color: C.muted }}><Icon name="branch" size={12} />{branch}</div>}
      {children}</div>, document.body)}</span>;
}
