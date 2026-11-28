// THE FLOATING SCREENING CARD (the operator 2026-11-14: "a decision card that floats when Heimdall needs an answer"): when a run waits for answers it appears over whatever screen you are on, with the same card the chat shows, so a question never sits unseen in a pane you are not looking at.
// "Later" puts it away for that run until the page loads again; the pill keeps the count. Polls every 5 s and stops while the tab is hidden.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { Icon } from "@/loki/team/icons";
import { apiGet } from "@/loki/api/client";
import type { GoalRun } from "@/loki/widgets/subagents";

// the card is the chat's answer card, and importing it up front pulled the old chat screen (notebooks, the cockpit, atlas…) into every first load: it is fetched when a question is there to answer
const ScreeningCard = React.lazy(() => import("./agent-live").then((m) => ({ default: m.ScreeningCard })));

/** The runs that wait for an answer and have not been put away. Pure. */
export function pendingScreens(runs: GoalRun[], later: Set<number>): GoalRun[] {
  return runs.filter((r) => r.status === "awaiting-answers" && (r.questions ?? []).some((q) => !q.answer) && !later.has(r.id));
}
/** The pane a run was asked from: its `parent` is "<session>-<pane>". Pure. */
export const paneOfRun = (r: Pick<GoalRun, "parent">): number => Number(String(r.parent ?? "").split("-")[1]) || 0;

export function FloatingScreening() {
  const [runs, setRuns] = React.useState<GoalRun[]>([]); const [later, setLater] = React.useState<Set<number>>(new Set()); const [at, setAt] = React.useState(0);
  const load = React.useCallback(async () => { if (typeof document !== "undefined" && document.hidden) return; try { const r: any = await apiGet("/api/v1/cockpit/goals?scope=workspace", { timeoutMs: 10_000 }); const x = r?.runs ?? r?.data?.runs; if (Array.isArray(x)) setRuns(x); } catch { /* the next poll tries again */ } }, []);
  React.useEffect(() => { void load(); const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [load]);
  // the sidebar list sends "answer" here: bring that run's card back
  React.useEffect(() => { const on = (e: Event) => { const id = Number((e as CustomEvent).detail); setLater((s) => { const n = new Set(s); n.delete(id); return n; }); void load(); }; window.addEventListener("antiloki:screening-open", on); return () => window.removeEventListener("antiloki:screening-open", on); }, [load]);
  const waiting = pendingScreens(runs, later); if (!waiting.length) return null;
  const run = waiting[Math.min(at, waiting.length - 1)];
  return (
    <div data-testid="floating-screening" role="dialog" aria-label="Heimdall needs an answer" style={{ position: "fixed", right: 16, bottom: 16, zIndex: 130, width: 380, maxWidth: "calc(100vw - 32px)", maxHeight: "70vh", overflowY: "auto", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, fontFamily: nav, color: C.fg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 12.5 }}>
        <span style={{ color: C.warn, display: "inline-flex" }}><Icon name="hand" size={15} /></span><span style={{ fontWeight: 500 }}>Needs an answer</span>
        <span title={run.goal} style={{ color: C.muted, minWidth: 0, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{run.goal}</span>
        {waiting.length > 1 && <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontFamily: mono, fontSize: 11, color: C.dim }}>
          <button data-testid="screening-prev" aria-label="previous question" onClick={() => setAt((a) => (a + waiting.length - 1) % waiting.length)} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", transform: "rotate(90deg)", display: "inline-flex" }}><Icon name="chev" size={13} /></button>{at % waiting.length + 1}/{waiting.length}
          <button data-testid="screening-next" aria-label="next question" onClick={() => setAt((a) => (a + 1) % waiting.length)} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", transform: "rotate(-90deg)", display: "inline-flex" }}><Icon name="chev" size={13} /></button></span>}
        <button data-testid="screening-later" title="later: put it away until the page loads again" aria-label="later" onClick={() => setLater((s) => new Set(s).add(run.id))} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", display: "inline-flex" }}><Icon name="x" size={14} /></button>
      </div>
      <div style={{ padding: "0 8px" }}><React.Suspense fallback={<div style={{ padding: 12, color: C.muted, fontSize: 12 }}>loading the question…</div>}><ScreeningCard run={run} paneId={paneOfRun(run)} onChanged={() => void load()} /></React.Suspense></div>
    </div>
  );
}
