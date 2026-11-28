// ONE PANE, ALONE IN ITS WINDOW (the installable app of a pane, pane-app.ts). It draws what its address names and WRITES NOTHING to the layout: the main window stays the only place that arranges panes.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { NotesPane } from "@/loki/cockpit/notes-pane";
import { TerminalPane } from "./TerminalPane";
import { ChatSkin } from "./ChatSkin";
import { AskCard } from "./AskCard";
import { FilesPane } from "./FilesPane";
import { BrowserPane } from "./BrowserPane";
import { BoardPane } from "./Board";
import { ConnectorsPane } from "./ConnectorsPane";
import { GroupView } from "./Groups";
import { useAsks, usePaneUsages } from "./use-cowork";
import { useAppearance } from "./use-appearance";
import { specialistColor } from "./SpecialistAvatar";
import { panePct } from "./appearance";
import { appManifest, appName, drawIcon, unpackPane } from "./pane-app";
import type { PaneRef } from "./layout";

const GLASS = ".xterm .xterm-viewport{background-color:transparent !important}.xterm .xterm-screen canvas{background:transparent}";
const CHAT_ENGINES = ["claude-code", "codex", "cursor", "opencode", "gemini"];

/** Puts the pane's manifest and title on the page, and keeps the browser's offer to install, for a button. */
function useInstall(pane: PaneRef | null): (() => void) | null {
  const [offer, setOffer] = React.useState<any>(null);
  React.useEffect(() => {
    if (!pane) return;
    const on = (e: Event) => { e.preventDefault(); setOffer(e); }; const done = () => setOffer(null);
    window.addEventListener("beforeinstallprompt", on); window.addEventListener("appinstalled", done);
    const color = pane.specialist ? specialistColor(pane.specialist.id, pane.specialist.color) : "#9acb3a";
    const hex = color.startsWith("var(") ? getComputedStyle(document.documentElement).getPropertyValue(color.slice(4, -1)).trim() || "#9acb3a" : color;
    const icons = [192, 512].map((n) => ({ src: drawIcon(appName(pane)[0] ?? "a", hex, n), sizes: `${n}x${n}` })).filter((i) => i.src);
    const link = document.createElement("link"); link.rel = "manifest"; link.href = `data:application/manifest+json,${encodeURIComponent(JSON.stringify(appManifest(pane, window.location.origin, icons)))}`;
    const icon = document.createElement("link"); icon.rel = "icon"; icon.href = icons[0]?.src ?? "data:,";
    const was = document.title; document.title = appName(pane); document.head.append(link, icon);
    return () => { window.removeEventListener("beforeinstallprompt", on); window.removeEventListener("appinstalled", done); link.remove(); icon.remove(); document.title = was; };
  }, [pane]);
  return offer ? () => { void offer.prompt(); setOffer(null); } : null;
}

export function SoloPane({ packed }: { packed: string }) {
  const pane = React.useMemo(() => unpackPane(packed), [packed]);
  const panes = React.useMemo(() => (pane ? [pane] : []), [pane]);
  const usage = usePaneUsages(panes)[pane?.paneId ?? 0]; const asks = useAsks(); const look = useAppearance(); const install = useInstall(pane);
  const chatable = pane?.kind === "engine";
  const [skin, setSkin] = React.useState<"terminal" | "chat">(() => (chatable ? pane!.skin ?? (CHAT_ENGINES.includes(pane!.engine ?? "") ? look.ap.agentSkin : "terminal") : "terminal"));
  const installed = typeof window !== "undefined" && !!window.matchMedia?.("(display-mode: standalone)").matches;
  const chip: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 7, padding: "2px 10px", fontFamily: nav, fontSize: 11.5, cursor: "pointer" };
  if (!pane) return <div data-testid="solo-unknown" style={{ height: "100vh", display: "grid", placeItems: "center", background: C.bg, color: C.muted, fontFamily: nav, fontSize: 13 }}><span>This address does not name a pane. <a href="/" style={{ color: C.brand }}>Open antiloki</a></span></div>;
  const body = (): React.ReactNode => {
    if (pane.kind === "engine" || pane.kind === "shell") return (
      <>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {skin === "chat" && pane.paneId
            ? <ChatSkin paneId={pane.paneId} engine={pane.engine} who={appName(pane)} blocked={usage?.blocked ?? null} notice={usage?.notice} working={!!usage?.working} focused accent={pane.specialist ? specialistColor(pane.specialist.id, pane.specialist.color) : undefined} />
            : <TerminalPane pane={pane} focused onFocus={() => {}} />}
        </div>
        {pane.kind === "engine" && asks.filter((a) => a.paneId === pane.paneId).slice(0, 1).map((a) => <AskCard key={a.id} ask={a} />)}
      </>);
    if (pane.tool === "notes") return <NotesPane sessionId={pane.sessionId ?? 0} paneId={pane.paneId ?? 0} focused />;
    if (pane.tool === "files") return <FilesPane id={pane.id} />;
    if (pane.tool === "browser") return <BrowserPane />;
    if (pane.tool === "board") return <BoardPane />;
    if (pane.tool === "connectors") return <ConnectorsPane />;
    return <GroupView group={pane.group!} />;
  };
  return (
    <div data-testid="solo-pane" style={{ height: "100vh", display: "flex", flexDirection: "column", background: C.bg, color: C.fg, fontFamily: nav, ["--antiloki-glass" as string]: "52%", ["--cw-pane" as string]: panePct(look.ap.paneOpacity), ["--cw-term" as string]: panePct(look.ap.termOpacity), ["--cw-blur" as string]: "0px" }}>
      <style>{GLASS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 32, padding: "0 12px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, fontSize: 12 }}>
        <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{appName(pane)}</span>
        {usage?.working && <span style={{ fontFamily: mono, fontSize: 11, color: C.ok }}>working</span>}
        <span style={{ flex: 1 }} />
        {chatable && <button data-testid="solo-skin" onClick={() => setSkin((s) => (s === "chat" ? "terminal" : "chat"))} style={chip}>{skin === "chat" ? "Terminal" : "Chat"}</button>}
        {install && <button data-testid="solo-install" onClick={install} style={{ ...chip, borderColor: C.brand }}>Install as app</button>}
        {!install && !installed && <span data-testid="solo-hint" style={{ color: C.muted, fontSize: 11, whiteSpace: "nowrap" }}>to install: your browser's menu</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>{body()}</div>
    </div>
  );
}
