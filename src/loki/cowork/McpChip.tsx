// THE MCP MARK ON AN AGENT'S TOP BAR, THE PANE'S REAL STATE (operator 2026-11-24: "the icon should be there and show the real state. If it is not connected we should not be able to write on any agent till it connects, and when disconnected a click retries the connection").
// The antiloki mark "a.": green and turning when this pane's tools helper has said "up" to the serve, red and breathing when it has not (a click starts the agent again, which connects it afresh). Quiet while the agent asks its own question
// (trust this folder). It reads the pane's own state (`/cockpit/pane/mcp`, kept in memory by the serve): no `mcp list`, nothing to pile up. The gate (McpGate) is what stops typing while it is red. A serve too old to answer shows a grey mark that says so (a hidden mark looks like a missing one).
import * as React from "react";
import { C, nav } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";

export type McpState = "up" | "down" | "asking" | "unknown";
/** The state from the serve's answer. Pure. `unknown`: an older serve that cannot say (a grey mark). */
export function stateOf(r: any): McpState {
  const d = r?.result ?? r; if (!d || d.ok !== true || d.running !== true) return "unknown";
  return d.mcp === true ? "up" : d.ask === true ? "asking" : "down";
}

/** THE MARK IS ALIVE WHEN IT IS CONNECTED (the operator 2026-11-18): a box around "a." whose border is a ring of colour turning round it, nothing inside the box (no background), the letters white. Disconnected, the border is red and breathes. Still when less motion is asked for. */
const MCP_CSS = `@property --mcp-ang{syntax:"<angle>";initial-value:0deg;inherits:false}
@keyframes mcp-turn{to{--mcp-ang:360deg}}@keyframes mcp-breath{0%,100%{opacity:.5}50%{opacity:1}}
.mcp-box{position:relative;border-radius:9px}
.mcp-box::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.5px;pointer-events:none;background:conic-gradient(from var(--mcp-ang),#3ecf8e,#4d8dff,#e08fd0,#f5a524,#3ecf8e);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.mcp-alive::before{animation:mcp-turn 3.2s linear infinite}
.mcp-off::before{background:#f04e4e;animation:mcp-breath 2.4s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.mcp-alive::before,.mcp-off::before{animation:none}}`;
export function McpChip({ paneId, engine, onReconnect, busy = false, everyMs = 2000 }: { paneId?: number; engine?: string; onReconnect: () => void; /** the agent is in the middle of a turn: a reconnect would cut it off */ busy?: boolean; everyMs?: number }) {
  const [st, setSt] = React.useState<McpState>("unknown");
  const [flash, setFlash] = React.useState("");
  const read = async (): Promise<McpState> => { let r: any = null; try { r = await apiGet(`/api/v1/cockpit/pane/mcp?pane_id=${paneId}`); } catch { r = null; } return stateOf(r); };
  // A CLICK ON THE CONNECTED MARK TESTS IT (operator 2026-11-24): the state is read again now, and the answer is said beside the mark for a moment
  const test = async () => { setFlash("checking…"); const n = await read(); setSt(n); setFlash(n === "up" ? "✓ connected" : n === "asking" ? "waiting for your answer" : n === "unknown" ? "cannot tell (older server)" : "✗ not connected"); window.setTimeout(() => setFlash(""), 3000); };
  // A CLICK ON THE CONNECTED MARK RECONNECTS (operator 2026-11-25: "the a. logo should already do the reconnect"): the agent is started again with its conversation, so it loads antiloki's tools and brief afresh
  // (after an update, or when a tool it should have is missing). Never in the middle of a turn: that would cut the answer off.
  const reconnect = () => { if (busy) { setFlash("the agent is working: reconnect when it stops"); window.setTimeout(() => setFlash(""), 3500); return; } setFlash("reconnecting…"); window.setTimeout(() => setFlash(""), 4000); onReconnect(); };
  const needs = !!paneId && ["claude-code", "codex", "opencode", "gemini", "cursor"].includes(engine ?? "");   // Antigravity too (2026-11-26): its panes now get antiloki's tools
  React.useEffect(() => {
    if (!needs) return; let stop = false; let t: ReturnType<typeof setTimeout>;
    const tick = async () => { const n = await read(); if (stop) return; setSt(n); t = setTimeout(tick, everyMs); };
    void tick(); return () => { stop = true; clearTimeout(t); };
  }, [paneId, needs, everyMs]);
  if (!needs) return null;
  const on = st === "up";
  return (<>
    <style>{MCP_CSS}</style>
    <button data-testid="mcp-chip" className={`mcp-box ${on ? "mcp-alive" : st === "down" ? "mcp-off" : ""}`} data-connected={on ? "1" : "0"} data-state={st}       aria-label={on ? "antiloki's tools are connected to this agent" : st === "unknown" ? "this antiloki server cannot report the tools connection" : st === "asking" ? "the agent is asking you something first" : "antiloki's tools are not connected: click to retry"} onClick={() => {
        if (st === "down") { setFlash("reconnecting…"); window.setTimeout(() => setFlash(""), 4000); onReconnect(); }
        else if (st === "up") reconnect();
        // never a dead button (2026-11-27: "the a. button didn't work" on Cursor's own approval question): it says where the answer is given
        else if (st === "asking") { setFlash("it is asking you something: answer in the terminal"); window.setTimeout(() => setFlash(""), 6000); }
        else void test(); }}
      title={on ? "antiloki's tools are connected to this agent. Click to reconnect them: the agent starts again with its conversation and loads antiloki's tools and brief afresh (use it after an update, or when a tool is missing)" : st === "unknown" ? "this antiloki server is older and cannot report whether the tools are connected: restart antiloki on the new build" : st === "asking" ? "the agent is asking its own question first: answer it in the terminal" : "antiloki's tools are NOT connected to this agent, so it cannot be written to. Click to retry the connection"}
      style={{ flexShrink: 0, background: "transparent", border: "none", padding: "0 7px", cursor: "pointer", fontFamily: nav, fontWeight: 700, fontSize: 14, letterSpacing: -0.5, lineHeight: "20px", color: "#fff" }}>
      a.</button>{flash && <span data-testid="mcp-flash" style={{ fontFamily: nav, fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>{flash}</span>}</>
  );
}
