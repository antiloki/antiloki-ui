// THE LOGO MENU (operator 2026-09-20: "at the top left before threads add the antiloki logo 'a.' — on mouse
// over it expands to the full name and the dropdown of workspace, settings, etc. appears, also the rebuild
// button; take those out of antiChat's input field"). The corner circle's rows, hung off the wordmark.
import React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { C, nav } from "@/loki/theme";
import { useShellMaybe } from "./slug-context";
import { useWorkspaces } from "@/loki/api/hooks";
import { WorkspaceSwitcher } from "./sidebar";
import { openDocs } from "@/loki/desktop/shell";
import { PhonePanel } from "./phone-panel";
import { MachinesPanel } from "./machines-panel";

const RebuildPanel = React.lazy(() => import("@/loki/codebase/rebuild-panel").then((m) => ({ default: m.RebuildPanel })));   // a panel of the logo menu: fetched when the menu shows it

const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "7px 12px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", textDecoration: "none" };
const rowIcon: React.CSSProperties = { width: 16, textAlign: "center", fontSize: 12, color: C.muted, flexShrink: 0 };
const rowLabel: React.CSSProperties = { fontFamily: nav, fontSize: 12.5, color: C.fg };
// THE REVEAL (operator 2026-09-20: "on mouse over a beautiful animation should reveal the name and the
// dropdown"): "a." unfolds into "antiloki." — the middle letters slide out from behind the a and the dot
// glides to the end — then the menu drops in with its rows arriving one after another.
if (typeof document !== "undefined" && !document.getElementById("antiloki-logo-menu-anim")) {
  const st = document.createElement("style"); st.id = "antiloki-logo-menu-anim";
  st.textContent =
    "@keyframes antilokiUnfold{from{max-width:0;opacity:0;letter-spacing:-.4em;filter:blur(3px)}60%{opacity:1}to{max-width:7ch;opacity:1;letter-spacing:-.035em;filter:blur(0)}}" +
    "@keyframes antilokiFold{from{max-width:7ch;opacity:1}to{max-width:0;opacity:0;letter-spacing:-.4em}}" +
    "@keyframes antilokiMenuIn{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}" +
    "@keyframes antilokiRowIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}" +
    "@keyframes antilokiDotPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.5)}}";
  document.head.appendChild(st);
}
const hover = { onMouseEnter: (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = C.panel2; }, onMouseLeave: (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "transparent"; } };
/** the nth row arrives a beat after the one before */
const row = (i: number): React.CSSProperties => ({ ...rowStyle, animation: `antilokiRowIn .28s ease both`, animationDelay: `${60 + i * 40}ms` });

/** `wide`: the wordmark stays open (operator 2026-09-23: "now the logo a. on top left can be expanded, it has
 *  space"). The monogram exists for a cramped rail; where there is room, the product says its own name. */
export function LogoMenu({ wide = false, align = "left" }: { wide?: boolean; /** which edge its menu hangs from: `right` for a logo at the right edge of the screen, so the menu opens leftward and never runs off it */ align?: "left" | "right" } = {}) {
  const navigate = useNavigate();
  const shell = useShellMaybe();
  const { data } = useWorkspaces();
  const [hot, setHot] = React.useState(false);   // the pointer is over the logo or the menu
  const [pinned, setPinned] = React.useState(false); // clicked: stays open until a click elsewhere
  const [machinesOpen, setMachinesOpen] = React.useState(false);
  const [phone, setPhone] = React.useState(false);   // the phone panel (QR, devices, tunnel)
  const open = hot || pinned;
  const spelled = open || wide;   // the letters are out — because the menu is open, or because there is room
  const leave = React.useRef<any>(null);
  const enter = () => { if (leave.current) clearTimeout(leave.current); setHot(true); };
  const out = () => { if (leave.current) clearTimeout(leave.current); leave.current = setTimeout(() => setHot(false), 180); };
  const close = () => { setPinned(false); setHot(false); };
  const active = data?.active ?? null;
  return (
    <div data-testid="logo-menu" onMouseEnter={enter} onMouseLeave={out} style={{ position: "relative", display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
      <button onClick={() => setPinned((v) => !v)} title={active ? `${active.name} — workspace · settings · rebuild` : "workspace · settings · rebuild"}
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0 2px", display: "inline-flex", alignItems: "center", height: 20 }}>
        <span style={{ fontFamily: nav, fontWeight: 700, fontSize: 15, letterSpacing: -0.5, lineHeight: 1, color: C.fg, display: "inline-flex", alignItems: "baseline", userSelect: "none", whiteSpace: "nowrap" }}>
          a<span aria-hidden style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom", maxWidth: spelled ? "7ch" : 0, opacity: spelled ? 1 : 0, animation: wide ? undefined : open ? "antilokiUnfold .42s cubic-bezier(.2,.8,.2,1) both" : "antilokiFold .25s ease both" }}>ntiloki</span><span style={{ color: C.brand, display: "inline-block", animation: open && !wide ? "antilokiDotPulse .5s ease .3s 1" : undefined }}>.</span>
        </span>
      </button>
      {open && (<>
        {pinned && <div style={{ position: "fixed", inset: 0, zIndex: 150 }} onClick={close} />}
        <div data-testid="logo-menu-panel" onMouseEnter={enter} onMouseLeave={out}
          style={{ position: "absolute", top: "calc(100% + 6px)", ...(align === "right" ? { right: 0 } : { left: 0 }), zIndex: 160, width: 240, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,.4)", padding: "4px 0", display: "flex", flexDirection: "column", transformOrigin: "top left", animation: "antilokiMenuIn .26s cubic-bezier(.2,.8,.2,1) both" }}>
          <div style={{ padding: "6px 12px 4px", fontFamily: nav, fontSize: 10.5, color: C.dim }}>{active?.name ?? "antiloki"}</div>
          {shell && <button onClick={() => { shell.setPaletteOpen(true); close(); }} style={row(0)} {...hover}><span style={rowIcon}>🔍</span><span style={rowLabel}>Search · jump · run</span></button>}
          <button data-testid="logo-menu-phone" onClick={() => { setPhone(true); close(); }} style={row(3)} {...hover}><span style={rowIcon}>▯</span><span style={rowLabel}>Phone · QR</span></button>
          <button data-testid="logo-menu-machines" onClick={() => { setMachinesOpen(true); close(); }} style={row(4)} {...hover}><span style={rowIcon}>⌘</span><span style={rowLabel}>Machines · SSH</span></button>
          <button onClick={() => { void openDocs(); close(); }} style={row(5)} {...hover}><span style={rowIcon}>▤</span><span style={rowLabel}>Docs</span></button>
          <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
          <div style={{ padding: "2px 12px 6px", display: "flex", alignItems: "center", gap: 8, animation: "antilokiRowIn .28s ease both", animationDelay: "260ms" }}><span style={rowIcon}>↻</span><React.Suspense fallback={null}><RebuildPanel onDone={() => {}} wizard={false} onOpenWizard={() => void navigate({ to: "/operations/atlas" })} /></React.Suspense></div>
          <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
          <WorkspaceSwitcher />
        </div>
      </>)}
      {phone && <PhonePanel onClose={() => setPhone(false)} />}
      {machinesOpen && <MachinesPanel onClose={() => setMachinesOpen(false)} />}
    </div>
  );
}

/** THE LOGO WITHOUT A MENU (operator 2026-11-10: "the antiloki logo just the 'a.'; on mouse over, the same animation as the bottom icon expands the name; no submenu anymore"). "a." that unfolds into "antiloki." while the pointer is over it, and folds back. */
export function LogoMark({ overlay = false, vertical = false }: { /** the name unfolds DOWNWARD, letter by letter (the logo alone in a slim column: the operator 2026-11-22) */ vertical?: boolean; /** the name opens OVER what is beside it instead of pushing it (the sidebar's header, where the switch sits next to the logo) */ overlay?: boolean }) {
  const [hot, setHot] = React.useState(false);
  if (vertical) return (
    <span data-testid="logo-mark" data-open={hot ? "1" : "0"} data-vertical="1" onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)} style={{ position: "relative", display: "inline-block", width: 24, height: 24, cursor: "pointer", flexShrink: 0, userSelect: "none" }}>
      <style>{"@keyframes antilokiUnfoldV{from{max-height:0;opacity:0}to{max-height:8em;opacity:1}}@keyframes antilokiFoldV{from{max-height:8em;opacity:1}to{max-height:0;opacity:0}}"}</style>
      {/* the same unfold as the horizontal name, downward: a on top, the rest of the name opens under it, the dot at the end of it */}
      <span style={{ position: "absolute", left: 0, right: 0, top: 0, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: nav, fontWeight: 700, fontSize: 17, lineHeight: "17px", color: C.fg }}>
        <span>a</span>
        <span aria-hidden data-testid="logo-mark-letters" style={{ display: "flex", flexDirection: "column", alignItems: "center", overflow: "hidden", maxHeight: hot ? "8em" : 0, opacity: hot ? 1 : 0, fontSize: 15, lineHeight: "15px", animation: hot ? "antilokiUnfoldV .42s cubic-bezier(.2,.8,.2,1) both" : "antilokiFoldV .25s ease both" }}>{[..."ntiloki"].map((ch, i) => <span key={i}>{ch}</span>)}</span>
        <span style={{ color: C.brand, animation: hot ? "antilokiDotPulse .6s ease 1" : "none" }}>.</span>
      </span>
    </span>
  );
  const body = (
    <span style={{ fontFamily: nav, fontWeight: 700, fontSize: 17, letterSpacing: -0.5, lineHeight: 1, color: C.fg, display: "inline-flex", alignItems: "baseline", userSelect: "none", whiteSpace: "nowrap" }}>
      a<span aria-hidden data-testid="logo-mark-letters" style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom", maxWidth: hot ? "7ch" : 0, opacity: hot ? 1 : 0, animation: hot ? "antilokiUnfold .42s cubic-bezier(.2,.8,.2,1) both" : "antilokiFold .25s ease both" }}>ntiloki</span>
      <span style={{ color: C.brand, display: "inline-block", animation: hot ? "antilokiDotPulse .6s ease 1" : "none" }}>.</span>
    </span>
  );
  return (
    <span data-testid="logo-mark" data-open={hot ? "1" : "0"} onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)} style={{ position: "relative", display: "inline-flex", alignItems: "center", height: 24, cursor: "default", flexShrink: 0, ...(overlay ? { width: 22 } : {}) }}>
      {overlay ? <span style={{ position: "absolute", left: 0, zIndex: 20, display: "inline-flex", alignItems: "center", height: 24, paddingRight: hot ? 8 : 0, background: "transparent" }}>{body}</span> : body}
    </span>
  );
}
