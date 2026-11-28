// MULTIPLEX, THE SMALL WINDOW (the installed app, or any tab on `/multiplex`): the same cards as the desktop's corner mark, and a PIN that puts them in a floating window kept above the others (the browser's document
// picture-in-picture: Chrome, Edge and recent desktop Firefox; whether the desktop keeps it on top is the desktop's own choice). The pinned window lives as long as this one does.
import * as React from "react";
import { createPortal } from "react-dom";
import { MULTIPLEX_CSS, MultiplexMark, MultiplexPanel, isRunning, useMultiplex } from "./ClosedAvatar";
import { PALETTE_VARS } from "@/loki/cowork/appearance";
import { drawMark, useMultiplexInstall } from "./multiplex-app";

const WINDOW_CSS = `.mx-fill{min-height:100vh;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:10px;background:#0b0d0e;color:#dfe2dd;font:13px Geist,Inter,system-ui,sans-serif}
.mx-fill .mx-panel{width:100%;max-width:360px}.mx-fill .mx-panel>div:nth-child(3){max-height:60vh !important}
.mx-fill .mx-mark{flex:none;background-color:#0d1012}
.mx-side{display:flex;gap:6px;margin-top:6px}.mx-side button{flex:1}`;
const pipApi = (): any => (typeof window !== "undefined" ? (window as any).documentPictureInPicture : undefined);

export function MultiplexWindow({ pollMs = 5000 }: { pollMs?: number }) {
  const [pin, setPin] = React.useState<Window | null>(null); const [why, setWhy] = React.useState("");
  const { rows, gates, state, answered } = useMultiplex(pollMs, pin); const { install } = useMultiplexInstall();
  React.useEffect(() => { const was = document.title; document.title = "Multiplex"; if (window.matchMedia?.("(display-mode: standalone)").matches) { try { window.resizeTo(360, 520); } catch { /* the desktop decides */ } } return () => { document.title = was; }; }, []);
  React.useEffect(() => () => { pin?.close(); }, [pin]);
  // the tab's own icon says it too: a border in all colours while agents run, in the theme's colour otherwise
  const running = isRunning(rows); const waiting = state === "wait";
  React.useEffect(() => { const href = drawMark(64, running, undefined, waiting); if (!href) return; const l = document.createElement("link"); l.rel = "icon"; l.href = href; document.head.append(l); return () => l.remove(); }, [running, waiting]);
  const doPin = async () => {
    try {
      const w: Window = await pipApi().requestWindow({ width: 340, height: 460 });
      document.querySelectorAll('link[href*="fonts.googleapis"]').forEach((l) => w.document.head.append(l.cloneNode()));
      const worn = getComputedStyle(document.documentElement); for (const k of PALETTE_VARS) { const v = worn.getPropertyValue(k); if (v) w.document.documentElement.style.setProperty(k, v); }
      w.document.body.style.margin = "0"; w.document.title = "Multiplex"; w.addEventListener("pagehide", () => setPin(null)); setWhy(""); setPin(w);
    } catch { setWhy("the browser did not open the pinned window"); }
  };
  const openApp = () => { if (!window.open("/", "_blank")) setWhy("open antiloki from your browser: the new tab was blocked"); };
  const view = (pinned: boolean) => (
    <div className="mx-fill" data-testid={pinned ? "multiplex-pinned" : "multiplex-window"}>
      <style>{MULTIPLEX_CSS + WINDOW_CSS}</style>
      {answered !== false && <MultiplexMark rows={rows} gates={gates} state={state} />}
      {answered === false ? <div data-testid="multiplex-down" style={{ color: "#838a85", textAlign: "center" }}>antiloki is not answering.<br />Start it, and this window fills by itself.</div>
        : <MultiplexPanel rows={rows} gates={gates} onOpen={openApp} extra={
          <div className="mx-side">
            {pipApi() && <button data-testid="multiplex-pin" className="mx-go" onClick={() => (pinned ? pin?.close() : void doPin())}>{pinned ? "Unpin" : "Pin on top"}</button>}
            {!pinned && install && <button data-testid="multiplex-install" className="mx-go" onClick={install}>Install</button>}
          </div>} />}
      {why && <div role="status" style={{ color: "#f2994a", fontSize: 12 }}>{why}</div>}
    </div>
  );
  if (pin) return (<>
    <div className="mx-fill" data-testid="multiplex-away"><style>{MULTIPLEX_CSS + WINDOW_CSS}</style><div style={{ color: "#838a85", textAlign: "center" }}>Pinned in its own window.<br />Keep this one open (minimised is fine).</div><button className="mx-go" style={{ maxWidth: 200 }} onClick={() => pin.close()}>Unpin</button></div>
    {createPortal(view(true), pin.document.body)}
  </>);
  return view(false);
}
