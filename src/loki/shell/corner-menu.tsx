// THE CORNER (tabs shell 2026-07-20): with the left rail hidden, ONE discrete
// circle at the top right is the whole system chrome — settings, workspace,
// profile, docs, the palette. It is the rail's WorkspaceMenu relocated: same
// rows, same switcher, opening down-and-left instead of up-and-right.
import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { C, nav } from "@/loki/theme";
import { useShell } from "./slug-context";
import { useWorkspaces } from "@/loki/api/hooks";
import { WorkspaceSwitcher } from "./sidebar";
import { openDocs } from "@/loki/desktop/shell";

const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", textDecoration: "none" };
const rowIcon: React.CSSProperties = { width: 16, textAlign: "center", fontSize: 12, color: C.muted, flexShrink: 0 };
const rowLabel: React.CSSProperties = { fontFamily: nav, fontSize: 12.5, color: C.fg };

function Row({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={rowStyle}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.panel2; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
      <span style={rowIcon}>{icon}</span><span style={rowLabel}>{label}</span>
    </button>
  );
}
function RowLink({ icon, label, to, onClick }: { icon: string; label: string; to: string; onClick: () => void }) {
  return (
    <Link to={to as any} onClick={onClick} style={rowStyle}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.panel2; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
      <span style={rowIcon}>{icon}</span><span style={rowLabel}>{label}</span>
    </Link>
  );
}

// the circle + its menu, reusable ANYWHERE (the fixed corner, the dock field —
// operator 2026-07-20: "add the menu icon to the chat text field too").
// `up` flips the popover above the button for bottom-anchored hosts.
export function MenuCircle({ up = false, size = 28 }: { up?: boolean; size?: number }) {
  const { setPaletteOpen, chatOpen, setChatOpen } = useShell();
  const { data } = useWorkspaces();
  const [open, setOpen] = useState(false);
  const active = data?.active ?? null;
  const letter = (active?.name ?? "?").slice(0, 1).toUpperCase();
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button onClick={() => setOpen((v) => !v)} title={active ? `${active.name} — settings · workspace · profile` : "settings · workspace · profile"}
        style={{ width: size, height: size, borderRadius: "50%", cursor: "pointer", background: open ? C.brand : `color-mix(in oklab, ${C.panel} 72%, transparent)`, backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: `1px solid ${open ? C.brand : C.border}`, color: open ? C.bg : C.muted, fontFamily: nav, fontSize: Math.round(size * 0.4), fontWeight: 600, display: "grid", placeItems: "center" }}>{letter}</button>
      {open && (<>
        <div style={{ position: "fixed", inset: 0, zIndex: 150 }} onClick={() => setOpen(false)} />
        <div style={{ position: "absolute", ...(up ? { bottom: "calc(100% + 8px)" } : { top: "calc(100% + 8px)" }), right: 0, zIndex: 160, width: 236, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 16px 40px -10px rgba(0,0,0,.6)", overflow: "hidden", paddingTop: 4 }}>
          <Row icon="🔍" label="Search · jump · run" onClick={() => { setPaletteOpen(true); setOpen(false); }} />
          <Row icon="◨" label="Side chat" onClick={() => { setChatOpen(!chatOpen); setOpen(false); }} />
          <Row icon="▤" label="Docs" onClick={() => { void openDocs(); setOpen(false); }} />
          <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
          <WorkspaceSwitcher />
        </div>
      </>)}
    </div>
  );
}

export function CornerMenu() {
  return (
    <div style={{ position: "fixed", top: 12, right: 14, zIndex: 150 }}>
      <MenuCircle />
    </div>
  );
}
