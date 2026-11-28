// RETIRED AS A SURFACE (operator 2026-09-23: "remove the agents running indication on the right bottom, the mini
// window"). AgentsFloat is no longer mounted — cockpit/agents-icon.tsx carries the state in the switcher and opens
// the full window. What is still live here are the pure readings every surface shares: lineOf, fillOf, placeOf.
//
// The original note, kept because it is why any of this exists:
// THE AGENTS, WHEREVER YOU ARE (operator 2026-09-20: "I'd like to leave the agent screen and keep it
// running, and have a loading bar and preview floating at the bottom right so I can go anywhere, like
// X-ray, and still see all my agents work — and click to be taken to them"). A small stack at the
// bottom-right corner of every screen: one card per CLI agent of the workspace — its icon, its name,
// a bar (indeterminate while the agent is thinking, tasks-settled / tasks while a plan runs), and one
// line of what it is on. The agents run on the serve; this only watches. Click → the thread that holds
// the pane, focused on it.
import React from "react";
import { useTourUnlock } from "@/loki/shell/mini-tour";
import { useLocation, useRouter } from "@tanstack/react-router";
import { apiGet } from "@/loki/api/client";
import { useWorkspaces } from "@/loki/api/hooks";
import { C, mono, nav } from "@/loki/theme";
import { paneDisplay } from "@/loki/widgets/types";

export type LiveAgent = {
  pane_id: number; session_id: number; session_name: string; key: string; kind: string; worktree: string; ui: string;
  icon: string | null; name: string | null; max: boolean; running: boolean; busy: boolean; model: string | null; cost_usd: number | null;
  quota: { text: string; t: number } | null;
  preview: { text: string; tool: string; tool_open: boolean; t: number };
  run: { id: number; status: string; goal: string; done: number; running: number; total: number; created: number; ended: number | null; questions: number } | null;
  last_activity: string | null;
  /** THE DETERMINISTIC CHECKS IN FLIGHT (2026-09-24): "test" · "build" · "lint" while the box proves a claim */
  checks?: string[];
  /** WHAT IT IS COSTING IN MEMORY (2026-09-24): the RSS of its whole process tree, and whether the watchdog
   *  has it stopped because the machine was about to thrash */
  rss?: number; paused?: boolean;
};

/** the pane's place on the stage: the thread that holds its widget, and the widget — from the per-workspace stage. Pure. */
export function placeOf(stage: any, key: string): { thread: string; item: string; threadName: string } | null {
  const uw = stage?.userDocked && typeof stage.userDocked === "object" ? stage.userDocked : {};
  const item = Object.keys(uw).find((id) => { const p = uw[id]?.payload ?? {}; return `chat-${p.sessionId}-${p.paneId}`.slice(0, 80) === key; });
  if (!item) return null;
  const threads: any[] = Array.isArray(stage?.threads) ? stage.threads : [];
  const th = threads.find((t) => Array.isArray(t?.items) && t.items.includes(item)) ?? threads.find((t) => t.id === stage?.activeThread);
  return th ? { thread: th.id, item, threadName: th.name } : null;
}
export function readStage(ws: string | null): any {
  if (!ws) return null;
  try { const raw = localStorage.getItem(`antiloki:stage.v1:${ws}`); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
/** what the bar says under the name: the tool the agent is on, else the last thing it said, else the plan. Pure. */
export function lineOf(a: LiveAgent): { text: string; tone: "busy" | "idle" | "ask" | "done" } {
  if (a.run && a.run.status === "awaiting-answers") return { text: `${a.run.questions} question${a.run.questions === 1 ? "" : "s"} waiting for you`, tone: "ask" };
  if (a.run && a.run.status === "awaiting-approval") return { text: `a plan of ${a.run.total} tasks waits for your approval`, tone: "ask" };
  if (a.busy && a.preview.tool_open && a.preview.tool) return { text: a.preview.tool, tone: "busy" };
  if (a.run && (a.run.status === "running" || a.run.status === "joining")) return { text: `${a.run.done}/${a.run.total} tasks · ${a.run.goal}`, tone: "busy" };
  if (a.busy) return { text: a.preview.text || "thinking…", tone: "busy" };
  if (a.preview.text) return { text: a.preview.text, tone: a.running ? "idle" : "done" };
  return { text: a.running ? "ready" : "stopped", tone: a.running ? "idle" : "done" };
}
/** the bar's fill: a plan's settled share, or null for the shimmer / nothing. Pure. */
export function fillOf(a: LiveAgent): number | null {
  if (a.run && (a.run.status === "running" || a.run.status === "joining") && a.run.total > 0) return Math.max(0.04, a.run.done / a.run.total);
  return null;
}

if (typeof document !== "undefined" && !document.getElementById("antiloki-agents-float-anim")) {
  const st = document.createElement("style"); st.id = "antiloki-agents-float-anim";
  st.textContent = "@keyframes antilokiShimmer{from{transform:translateX(-100%)}to{transform:translateX(300%)}}@keyframes antilokiFloatIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}";
  document.head.appendChild(st);
}

export function AgentsFloat() {
  const [agents, setAgents] = React.useState<LiveAgent[]>([]);
  const [folded, setFolded] = React.useState<boolean>(() => { try { return localStorage.getItem("antiloki:agents-float") === "folded"; } catch { return false; } });
  const { data: ws } = useWorkspaces();
  const wsName = ws?.active?.name ?? null;
  const router = useRouter();
  const { pathname } = useLocation();
  const [deskTab, setDeskTab] = React.useState<string | undefined>(() => (typeof document === "undefined" ? undefined : document.documentElement.dataset.deskTab));
  React.useEffect(() => { const mo = new MutationObserver(() => setDeskTab(document.documentElement.dataset.deskTab)); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-desk-tab"] }); setDeskTab(document.documentElement.dataset.deskTab); return () => mo.disconnect(); }, []); // read once too: the desk stamps it before this observer exists
  React.useEffect(() => {
    let stop = false;
    const tick = async () => { try { const r = await apiGet(`/api/v1/cockpit/agents/live`, { timeoutMs: 8_000 } as any); if (!stop && Array.isArray(r?.agents)) setAgents(r.agents); } catch { /* serve away — keep the last */ } };
    void tick();
    const t = setInterval(tick, 3_000);
    return () => { stop = true; clearInterval(t); };
  }, [wsName]);
  // only the agents that ever ran: a pane provisioned but never started is noise here
  const shown = agents.filter((a) => a.running || a.busy || a.preview.text || a.preview.tool || a.run);
  useTourUnlock("agents-float", shown.length > 0); // the progressive tour: the first time an agent shows up here
  if (!shown.length) return null;
  const jump = (a: LiveAgent) => {
    const place = placeOf(readStage(wsName), a.key);
    try { sessionStorage.setItem("antiloki:dock-mode", "threads"); if (place) sessionStorage.setItem("antiloki:open-thread", JSON.stringify(place)); } catch { /* storage blocked */ }
    if (pathname !== "/") void router.navigate({ to: "/" as any });
    window.dispatchEvent(new CustomEvent("antiloki:chat-mode", { detail: "threads" }));
    if (place) window.dispatchEvent(new CustomEvent("antiloki:open-thread", { detail: place }));
  };
  const setFold = (v: boolean) => { setFolded(v); try { localStorage.setItem("antiloki:agents-float", v ? "folded" : "open"); } catch { /* fine */ } };
  const stage = readStage(wsName);
  const busyN = shown.filter((a) => a.busy || (a.run && (a.run.status === "running" || a.run.status === "planning"))).length;
  const askN = shown.filter((a) => a.run && (a.run.status === "awaiting-answers" || a.run.status === "awaiting-approval")).length;
  // on the threads screen the agents are on the stage already — only the pill, and it must not sit on
  // the Studio's action buttons (bottom-right), so it hugs the corner tighter and smaller
  const onStage = pathname === "/";
  // on the chats tab (chat-thread.tsx stamps `data-desk-tab`) the corner is the composer's chips — the pill
  // takes the chat header's free right end instead
  const onChats = onStage && deskTab === "chats";
  if (folded || onStage) {
    return (
      <button data-testid="agents-float-pill" onClick={() => { if (onStage) { const a = shown.find((x) => x.run && (x.run.status === "awaiting-answers" || x.run.status === "awaiting-approval")) ?? shown.find((x) => x.busy) ?? shown[0]; if (a) jump(a); } else setFold(false); }} title={onStage ? "your agents — click to go to the one that needs you" : "your agents — click to open"}
        style={{ position: "fixed", right: onStage ? 6 : 14, ...(onChats ? { top: 7 } : { bottom: onStage ? 6 : 14 }), zIndex: 120, display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, border: `1px solid ${askN ? C.warn : C.border}`, background: `color-mix(in oklab, ${C.panel} 94%, transparent)`, backdropFilter: "blur(8px)", color: C.fg, cursor: "pointer", fontFamily: nav, fontSize: 11.5, boxShadow: "0 8px 24px rgba(0,0,0,.3)", animation: "antilokiFloatIn .2s ease both" }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: askN ? C.warn : busyN ? C.brand : C.ok, animation: busyN ? "antilokiPulse 1.2s ease-in-out infinite" : undefined }} />
        {shown.length} agent{shown.length === 1 ? "" : "s"}{busyN ? ` · ${busyN} working` : ""}{askN ? ` · ${askN} waiting on you` : ""}
      </button>
    );
  }
  return (
    <div data-testid="agents-float" style={{ position: "fixed", right: 14, bottom: 14, zIndex: 120, width: 268, display: "flex", flexDirection: "column", gap: 6, animation: "antilokiFloatIn .2s ease both" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
        <span style={{ fontFamily: nav, fontSize: 10.5, color: C.dim, letterSpacing: ".04em", textTransform: "uppercase" }}>agents{busyN ? ` · ${busyN} working` : ""}</span>
        <button onClick={() => setFold(true)} title="fold to a pill" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 12, padding: "0 4px", lineHeight: 1 }}>▾</button>
      </div>
      {shown.slice(0, 8).map((a) => {
        const line = lineOf(a); const fill = fillOf(a);
        const d = paneDisplay(a.kind);
        const tone = line.tone === "ask" ? C.warn : line.tone === "busy" ? C.brand : line.tone === "done" ? C.dim : C.ok;
        // the name the operator knows: the recipe's, else the thread on the stage, else the engine
        const title = a.name ?? placeOf(stage, a.key)?.threadName ?? d.name;
        return (
          <button key={a.pane_id} data-testid={`agents-float-${a.pane_id}`} onClick={() => jump(a)} title={`${title} · ${d.name}${a.model ? ` · ${a.model}` : ""}${a.cost_usd != null ? ` · $${Number(a.cost_usd).toFixed(2)}` : ""} — click to go there`}
            style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 5, padding: "8px 10px", borderRadius: 10, border: `1px solid ${line.tone === "ask" ? C.warn : C.border}`, background: `color-mix(in oklab, ${C.panel} 94%, transparent)`, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", boxShadow: "0 8px 24px rgba(0,0,0,.28)", cursor: "pointer", color: C.fg }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <span style={{ fontSize: 13, width: 16, textAlign: "center", flexShrink: 0 }}>{a.icon ?? d.glyph}</span>
              <span style={{ fontFamily: nav, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{title}</span>
              {a.max && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.warn, border: `1px solid ${C.warn}`, borderRadius: 4, padding: "0 3px" }}>MAX</span>}
              <span style={{ width: 7, height: 7, borderRadius: 99, background: tone, flexShrink: 0, animation: line.tone === "busy" ? "antilokiPulse 1.2s ease-in-out infinite" : undefined }} />
            </div>
            {/* THE BAR: a plan's progress when one runs, a shimmer while the agent thinks, quiet otherwise */}
            <div style={{ position: "relative", height: 3, borderRadius: 2, background: C.panel2, overflow: "hidden" }}>
              {fill != null ? <div style={{ position: "absolute", inset: 0, width: `${Math.round(fill * 100)}%`, background: C.brand, borderRadius: 2, transition: "width .4s ease" }} />
                : line.tone === "busy" ? <div style={{ position: "absolute", top: 0, bottom: 0, width: "34%", background: `linear-gradient(90deg, transparent, ${C.brand}, transparent)`, animation: "antilokiShimmer 1.3s linear infinite" }} />
                : null}
            </div>
            <div style={{ fontFamily: mono, fontSize: 10, color: line.tone === "ask" ? C.warn : C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line.text}</div>
          </button>
        );
      })}
    </div>
  );
}
