// AN INSTALLED WEB APP, IN ITS PANE. Many sites (Linear, GitHub, Stripe ...) forbid being shown inside another page, and the browser then draws "refused to connect" with no way for the page to know why (operator 2026-11-11: "linear.app
// refused to connect"). So the serve reads the site's frame headers first: a site that allows it is shown in a frame; one that forbids it gets a card that says so and opens the app in a window of its own (a popup that keeps its sign-in,
// beside this one) or in a tab. What an agent does with the app is through its MCP server, installed and told to every agent's box either way.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { checkFrame, launchAppWindow } from "./api";
import type { WebAppRef } from "./layout";
import { AppTools } from "./AppTools";

/** A window of its own for the app: sized like an app, named so a second click focuses it instead of opening another. */
export function openAppWindow(app: WebAppRef): boolean {
  try { const w = window.open(app.url, `antiloki-app-${app.id}`, "popup=yes,width=1180,height=820,noopener=no"); if (w) { w.focus?.(); return true; } } catch { /* a blocked popup */ }
  return false;
}
const btn = (primary: boolean): React.CSSProperties => ({ background: primary ? C.brand : "transparent", color: primary ? "#fff" : C.fg, border: `1px solid ${primary ? C.brand : C.border}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: nav, fontSize: 13, fontWeight: primary ? 600 : 400 });

export function WebAppPane({ app }: { app: WebAppRef }) {
  const [verdict, setVerdict] = React.useState<{ frameable: boolean | "unknown"; why: string } | null>(null); const [blocked, setBlocked] = React.useState(false); const [note, setNote] = React.useState("");
  // THE REAL SITE AS AN APP WINDOW: the serve starts a Chromium-family browser in app mode with a profile of its own for this app (its sign-in is kept). Without one, or when the serve cannot, the browser's own pop-up window is the fallback.
  const openWindow = async () => { setNote(""); setBlocked(false); const r = await launchAppWindow(app); if (r.ok) { setNote(`${app.name} is open in its own window`); return; } setNote(r.error ?? ""); if (!openAppWindow(app)) setBlocked(true); };
  React.useEffect(() => { let stop = false; setVerdict(null); void checkFrame(app.url).then((v) => { if (!stop) setVerdict(v); }); return () => { stop = true; }; }, [app.url]);
  const head = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: `1px solid ${C.border}`, minWidth: 0 }}>
      <span data-testid="webapp-url" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: mono, fontSize: 11, color: C.muted }}>{app.url}</span>
      <button data-testid="webapp-window" onClick={() => void openWindow()} style={{ ...btn(false), padding: "2px 8px", fontSize: 11.5 }}>open in a window</button>
      <a data-testid="webapp-external" href={app.url} target="_blank" rel="noreferrer" style={{ color: C.brand, fontSize: 12 }}>open in a tab ↗</a>
    </div>
  );
  return (
    <div data-testid="webapp-pane" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", fontFamily: nav, color: C.fg, fontSize: 12.5 }}>
      {head}
      {verdict === null ? <div data-testid="webapp-checking" style={{ padding: 14, color: C.muted }}>asking {app.name} whether it can be shown here…</div>
        : verdict.frameable === false ? (
          <div data-testid="webapp-refuses" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{app.name} does not allow being shown inside another app</div>
            <div data-testid="webapp-why" style={{ color: C.muted, maxWidth: 420, lineHeight: 1.5 }}>{verdict.why ? `${verdict.why}. ` : ""}That is the site's own rule, for your safety: no app can get around it. Open it as a window of its own beside this one: antiloki starts it as an app window with a profile of its own, so you sign in once and it stays. Your agents still use {app.name} through its MCP server.</div>
            <div style={{ display: "flex", gap: 8 }}><button data-testid="webapp-window-main" onClick={() => void openWindow()} style={btn(true)}>Open {app.name} in a window</button></div>
            {note && <div data-testid="webapp-note" style={{ color: C.muted, maxWidth: 440, lineHeight: 1.45 }}>{note}</div>}
            {blocked && <div data-testid="webapp-popup-blocked" style={{ color: C.warn }}>the browser blocked the window: allow pop-ups for this page, or use “open in a tab”.</div>}
          </div>
        ) : <iframe data-testid="webapp-frame" title={app.name} src={app.url} referrerPolicy="no-referrer" sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-downloads" style={{ flex: 1, minHeight: 0, border: "none", background: "#fff" }} />}
      <AppTools app={app} />
    </div>
  );
}
