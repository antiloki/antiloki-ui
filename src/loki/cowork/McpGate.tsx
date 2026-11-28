// AN AGENT IS NOT WRITTEN TO BEFORE ANTILOKI'S TOOLS ARE CONNECTED (operator 2026-11-23: "I could use an agent without the antiloki MCP connected, and connected just after. It should be blocked until the MCP connects, and should be able to reconnect on click if it fails").
//
// The tool helper each agent starts says "up" to the serve when the agent initialises it; this reads that and, until it comes, lays a glass cover over the pane so nothing can be typed. If it does not come in 20 seconds the cover says so and offers
// Reconnect (the agent is started again; it resumes its conversation). An agent that is NOT SIGNED IN can never connect, and signing in happens in the pane: it alone may be uncovered to do that (2026-11-27). A serve that does not know the route (an older one) answers an error, and then nothing is covered.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";
import { listEngines } from "./api";

/** The agents that connect to antiloki's tools through the helper at start. */
export const MCP_ENGINES = ["claude-code", "codex", "opencode"];
export const MCP_WAIT_MS = 20_000;

export function McpGate({ paneId, engine, onReconnect, waitMs = MCP_WAIT_MS, everyMs = 800 }: { paneId: number; engine?: string; onReconnect: () => void; waitMs?: number; everyMs?: number }) {
  const needs = MCP_ENGINES.includes(engine ?? "");
  const [up, setUp] = React.useState<boolean | null>(null);   // null: not known (an older serve): nothing is covered
  const [ask, setAsk] = React.useState(false);   // the agent is asking its own question (trust this folder): never cover that
  const [late, setLate] = React.useState(false); 
  React.useEffect(() => {
    if (!needs) return; let stop = false; let t: ReturnType<typeof setTimeout>; let since = Date.now();
    const tick = async () => {
      let r: any = null; try { r = await apiGet(`/api/v1/cockpit/pane/mcp?pane_id=${paneId}`); } catch { r = null; }
      if (stop) return; const d = r?.result ?? r;
      if (!d || d.ok !== true) { setUp(null); return; }
      setUp(d.mcp === true); setAsk(d.ask === true); if (d.ask === true) { since = Date.now(); setLate(false); }   // the wait starts again after the question is answered
      if (d.mcp !== true && Date.now() - since >= waitMs) setLate(true);
      if (d.mcp === true) return;
      t = setTimeout(tick, everyMs);
    };
    void tick();
    return () => { stop = true; clearTimeout(t); };
  }, [paneId, needs, waitMs, everyMs]);
  // NOT SIGNED IN IS THE AGENT'S OWN QUESTION TOO (2026-11-27, a Windows PC: OpenCode installed, never signed in, the pane locked behind "did not connect" with no way to sign in)
  const [signedOut, setSignedOut] = React.useState<{ label: string; missing: string } | null>(null);
  const [signing, setSigning] = React.useState(false);
  React.useEffect(() => {
    if (!late || up !== false) return; let stop = false;
    void listEngines().then((l) => { const e = l.find((x) => x.key === engine); if (!stop) setSignedOut(e && e.seat === false ? { label: e.label, missing: e.missing ?? "" } : null); }).catch(() => {});
    return () => { stop = true; };
  }, [late, up, engine]);
  const covered = needs && up === false && !ask && !(signing && signedOut);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { if (covered) { (document.activeElement as HTMLElement | null)?.blur?.(); ref.current?.focus(); } }, [covered]);
  if (!covered) return null;
  const btn: React.CSSProperties = { fontFamily: nav, fontSize: 12.5, padding: "6px 14px", borderRadius: 8, cursor: "pointer", background: "transparent" };
  return (
    <div ref={ref} tabIndex={-1} data-testid="mcp-gate" data-late={late ? "1" : "0"} onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
      style={{ position: "absolute", inset: 0, zIndex: 30, display: "grid", placeItems: "center", background: "rgba(10,9,8,.5)", backdropFilter: "blur(10px) saturate(1.3)", WebkitBackdropFilter: "blur(10px) saturate(1.3)", outline: "none", color: C.fg, fontFamily: nav }}>
      <div style={{ textAlign: "center", maxWidth: 340, padding: "0 16px" }}>
        {!late ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Connecting antiloki's tools…</div>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>You can write to the agent as soon as they are connected.</div>
          </>
        ) : signedOut ? (
          <>
            <div data-testid="mcp-signed-out" style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{signedOut.label} is not signed in</div>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, marginBottom: 12, userSelect: "text" }}>{signedOut.missing || "Sign in to it, then reconnect."} After signing in, press Reconnect.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button data-testid="mcp-sign-in" onClick={() => setSigning(true)} style={{ ...btn, border: `1px solid ${C.brand}`, color: C.brand }}>Use the terminal to sign in</button>
              <button data-testid="mcp-reconnect" onClick={onReconnect} style={{ ...btn, border: `1px solid ${C.border}`, color: C.fg }}>Reconnect</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>antiloki's tools did not connect</div>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>Reconnecting starts the agent again and picks up its conversation.</div>
            <button data-testid="mcp-reconnect" onClick={onReconnect} style={{ ...btn, border: `1px solid ${C.brand}`, color: C.brand }}>Reconnect</button>
          </>
        )}
      </div>
    </div>
  );
}
