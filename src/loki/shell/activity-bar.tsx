// IDE-shell reskin (2026-06-24): a flush LEFT activity bar (VSCode-style) that replaces the floating
// top word-menu — the operator brief is "wrap the whole app in the read-only IDE feel; screens don't
// change, the chat is just one of the icons." So: the same destinations + cluster as TopTabs, as a
// vertical icon rail with an ember active-rail and hover tooltips. Chat stays a first-class peer icon
// (this is mission-control-with-a-conversation, not an editor) — and nothing here implies a save button.
import React, { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useShell } from "./slug-context";
import { C, nav } from "@/loki/theme";
import { DoingCardsDropdown } from "./topbar";
import { WorkspaceSwitcher } from "./sidebar";
import { openDocs } from "@/loki/desktop/shell";
import { useWorkspaces } from "@/loki/api/hooks";
import { Logo } from "./logo";

// stroke icons (inherit currentColor → active/hover tint). 24-grid, rounded.
const svgProps: React.SVGProps<SVGSVGElement> = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
const ICONS = {
  chat: (<svg {...svgProps}><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v6A2.5 2.5 0 0 1 17.5 15H9l-4 3.5V15H6.5A2.5 2.5 0 0 1 4 12.5z" /></svg>),
  board: (<svg {...svgProps}><rect x="3.5" y="4" width="4.6" height="16" rx="1.2" /><rect x="9.7" y="4" width="4.6" height="10.5" rx="1.2" /><rect x="15.9" y="4" width="4.6" height="13.5" rx="1.2" /></svg>),
  code: (<svg {...svgProps}><path d="M9 8l-4 4 4 4" /><path d="M15 8l4 4-4 4" /></svg>),
  timeline: (<svg {...svgProps}><circle cx="12" cy="12" r="8" /><path d="M12 8.4V12l2.6 1.6" /></svg>),
  failures: (<svg {...svgProps}><path d="M12 4 3 19h18z" /><path d="M12 10v4" /><path d="M12 16.6v.4" /></svg>),
  design: (<svg {...svgProps}><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><circle cx="16.5" cy="16.5" r="3.4" /></svg>),
  tests: (<svg {...svgProps}><path d="M9 3h6" /><path d="M10 3v6l-4.5 8.5A2 2 0 0 0 7.3 21h9.4a2 2 0 0 0 1.8-3.5L14 9V3" /></svg>),
  pulls: (<svg {...svgProps}><path d="M7 8h10" /><path d="M14 5l3 3-3 3" /><path d="M17 16H7" /><path d="M10 13l-3 3 3 3" /></svg>),
  tagging: (<svg {...svgProps}><path d="M20.6 12.6 13 20.2a2 2 0 0 1-2.8 0L4 14V4h10l6.6 6.6a2 2 0 0 1 0 2z" /><circle cx="8.5" cy="8.5" r="1.5" /></svg>),
  // ULTRA REVIEW — an observatory dial: the territory-appraisal workspace.
  ultra: (<svg {...svgProps}><circle cx="12" cy="12" r="8.5" /><path d="M12 12l4.6-4.6" /><circle cx="12" cy="12" r="1.5" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2" /></svg>),
  // BUG FINDER — a bug in a ring: the bench's defect-gate control center.
  bug: (<svg {...svgProps}><ellipse cx="12" cy="13" rx="4.5" ry="5.5" /><path d="M12 7.5V19M7.5 10 5 8.5M7.5 13H4.5M7.5 16 5 17.5M16.5 10 19 8.5M16.5 13h3M16.5 16 19 17.5" /><circle cx="12" cy="6" r="1.6" /></svg>),
  // CONSTITUTION — the tablet of laws: the code judged against its own rules.
  constitution: (<svg {...svgProps}><path d="M6 3.5h9l3 3V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z" /><path d="M14.5 3.5V7h3.5" /><path d="M9 11h6M9 14h6M9 17h3.5" /></svg>),
};
// NAV SIMPLIFICATION (operator 2026-07-05): five items. Design lives inside Code (below
// the IDE); Failures + Timeline became Settings tabs. All old routes stay deep-linkable.
const TABS = [
  { to: "/", icon: ICONS.chat, label: "Agent", match: (p: string) => p === "/" },
  { to: "/operations", icon: ICONS.board, label: "Harness", match: (p: string) => p === "/operations" || p.startsWith("/operations/pipeline") || p.startsWith("/operations/waterfall") },
  { to: "/operations/pulls", icon: ICONS.pulls, label: "Pulls & Tests", match: (p: string) => p.startsWith("/operations/pulls") || p.startsWith("/operations/tests") },
  { to: "/operations/atlas", icon: ICONS.code, label: "Code", match: (p: string) => p.startsWith("/operations/atlas") || p.startsWith("/operations/design") },
  { to: "/ultra-review", icon: ICONS.ultra, label: "Ultra Review", match: (p: string) => p.startsWith("/ultra-review") },
  { to: "/bug-finder", icon: ICONS.bug, label: "Bug Finder", match: (p: string) => p.startsWith("/bug-finder") },
  { to: "/tagging", icon: ICONS.tagging, label: "Tagging", match: (p: string) => p.startsWith("/tagging") },
];

function Tip({ label }: { label: string }) {
  return <span style={{ position: "absolute", left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)", whiteSpace: "nowrap", background: C.panel, border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "3px 8px", fontFamily: nav, fontSize: 11, boxShadow: "0 6px 18px -8px rgba(0,0,0,.6)", zIndex: 60, pointerEvents: "none" }}>{label}</span>;
}
const cell = (active: boolean, hover: boolean): React.CSSProperties => ({
  position: "relative", width: 38, height: 38, borderRadius: 9, display: "grid", placeItems: "center",
  textDecoration: "none", border: "none", cursor: "pointer", fontSize: 15,
  color: active ? C.brand : (hover ? C.fg : C.muted),
  background: active ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : (hover ? C.panel2 : "transparent"),
  transition: "background .12s, color .12s",
});
function Rail({ active }: { active: boolean }) { return active ? <span style={{ position: "absolute", left: -8, top: 9, bottom: 9, width: 2, borderRadius: 2, background: C.brand }} /> : null; }

function RailLink({ to, icon, label, active, collapsed }: { to: string; icon: React.ReactNode; label: string; active: boolean; collapsed?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <Link to={to} title={label} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", display: "flex", alignItems: "center", gap: 10,
        padding: collapsed ? "7px 0" : "7px 10px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 8,
        textDecoration: "none", cursor: "pointer",
        color: active ? C.brand : (hover ? C.fg : C.muted),
        background: active ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : (hover ? C.panel2 : "transparent"),
        transition: "background .12s, color .12s",
      }}>
      <span style={{ width: 18, height: 17, display: "grid", placeItems: "center", flexShrink: 0 }}>{icon}</span>
      {!collapsed && <span style={{ fontFamily: nav, fontSize: 12.5, letterSpacing: .2 }}>{label}</span>}
      {collapsed && hover && <Tip label={label} />}
      <Rail active={active} />
    </Link>
  );
}
function RailBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} title={title} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={cell(false, hover)}>
      {children}{hover && <Tip label={title} />}
    </button>
  );
}

// the active workspace's initial; click → switcher popover (opens to the RIGHT, since we're a left rail).
function WorkspaceAvatar() {
  const { data } = useWorkspaces();
  const [open, setOpen] = useState(false);
  const active = data?.active ?? null;
  const letter = (active?.name ?? "?").slice(0, 1).toUpperCase();
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} title={active ? `workspace · ${active.name}` : "workspace"}
        style={{ width: 30, height: 30, borderRadius: "50%", cursor: "pointer", background: C.panel2, border: `1px solid ${C.border}`, color: C.fg, fontFamily: nav, fontSize: 12, fontWeight: 600, display: "grid", placeItems: "center" }}>{letter}</button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 70 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 80, width: 248, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 16px 40px -10px rgba(0,0,0,.6)", overflow: "hidden" }}>
            <WorkspaceSwitcher />
          </div>
        </>
      )}
    </div>
  );
}

// the left rail = the ONLY persistent chrome: destination icons at the top, the workspace menu pinned
// at the bottom. There is no top header — the rail spans the full viewport height on every screen.
export function ActivityBar() {
  const { pathname } = useLocation();
  // vibe (2026-07-12): the pane grid asks for icons-only — every horizontal
  // pixel goes to the agents. Width animates so the collapse feels deliberate.
  const { railCollapsed } = useShell();
  return (
    <aside style={{
      width: railCollapsed ? 54 : 168, flexShrink: 0, height: "100%", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 2,
      background: C.panel, borderRight: `1px solid ${C.border}`, padding: "10px 8px", zIndex: 40,
      transition: "width .18s ease",
    }}>
      <Link to="/" style={{ textDecoration: "none", padding: railCollapsed ? "2px 0 10px" : "2px 8px 10px", display: "flex", justifyContent: railCollapsed ? "center" : "flex-start" }}>
        <Logo size={16} compact={railCollapsed} />
      </Link>
      {TABS.map((t) => <RailLink key={t.to} to={t.to} icon={t.icon} label={t.label} active={t.match(pathname)} collapsed={railCollapsed} />)}
      <div style={{ flex: 1 }} />
      <WorkspaceMenu />
    </aside>
  );
}

// horizontal icon for the top header
function TopIcon({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  return <button onClick={onClick} title={title} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    style={{ width: 30, height: 30, borderRadius: 8, cursor: "pointer", display: "grid", placeItems: "center", background: hover ? C.panel2 : "transparent", border: "none", color: hover ? C.fg : C.muted, fontSize: 15, transition: "background .12s, color .12s" }}>{children}</button>;
}
function TopLink({ to, title, active, children }: { to: string; title: string; active: boolean; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  return <Link to={to} title={title} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    style={{ width: 30, height: 30, borderRadius: 8, cursor: "pointer", textDecoration: "none", display: "grid", placeItems: "center", background: hover ? C.panel2 : "transparent", color: active ? C.brand : (hover ? C.fg : C.muted), fontSize: 14, transition: "background .12s, color .12s" }}>{children}</Link>;
}

// a row inside the collapsed header menu
function MenuRow({ icon, label, onClick }: any) {
  const [h, setH] = useState(false);
  return <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "7px 12px", background: h ? C.panel2 : "transparent", border: "none", cursor: "pointer", color: C.fg, fontFamily: nav, fontSize: 12, textAlign: "left" }}>
    <span style={{ width: 16, textAlign: "center", color: C.muted, fontSize: 13 }}>{icon}</span>{label}
  </button>;
}
function MenuRowLink({ icon, label, to, onClick }: any) {
  const [h, setH] = useState(false);
  return <Link to={to} onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", textDecoration: "none", background: h ? C.panel2 : "transparent", color: C.fg, fontFamily: nav, fontSize: 12 }}>
    <span style={{ width: 16, textAlign: "center", color: C.muted, fontSize: 13 }}>{icon}</span>{label}
  </Link>;
}

// the workspace icon — EVERYTHING collapsed into it (a dropdown menu). Pinned at the BOTTOM of the rail;
// the menu opens up-and-to-the-right. This + the rail tabs are the only persistent chrome (no top header).
function WorkspaceMenu() {
  const { setPaletteOpen, chatOpen, setChatOpen } = useShell();
  const { data } = useWorkspaces();
  const [open, setOpen] = useState(false);
  const active = data?.active ?? null;
  const letter = (active?.name ?? "?").slice(0, 1).toUpperCase();
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} title={active ? `${active.name} — menu` : "menu"}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "7px 10px", borderRadius: 8, cursor: "pointer", background: open ? C.panel2 : "transparent", border: "none", textAlign: "left" }}>
        <span style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, background: open ? C.brand : C.panel2, border: `1px solid ${open ? C.brand : C.border}`, color: open ? C.bg : C.fg, fontFamily: nav, fontSize: 11, fontWeight: 600, display: "grid", placeItems: "center" }}>{letter}</span>
        <span style={{ fontFamily: nav, fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{active?.name ?? "workspace"}</span>
      </button>
      {open && (<>
        <div style={{ position: "fixed", inset: 0, zIndex: 70 }} onClick={() => setOpen(false)} />
        <div style={{ position: "absolute", bottom: 0, left: "calc(100% + 10px)", zIndex: 80, width: 232, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 16px 40px -10px rgba(0,0,0,.6)", overflow: "hidden", paddingTop: 4 }}>
          <MenuRow icon="🔍" label="Search · jump · run" onClick={() => { setPaletteOpen(true); setOpen(false); }} />
          <MenuRow icon="◨" label="Side chat" onClick={() => { setChatOpen(!chatOpen); setOpen(false); }} />
          <MenuRow icon="▤" label="Docs" onClick={() => { void openDocs(); setOpen(false); }} />
          <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
          <WorkspaceSwitcher />
        </div>
      </>)}
    </div>
  );
}
