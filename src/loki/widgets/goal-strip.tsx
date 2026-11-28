// THE ORCHESTRATION STRIP (operator 2026-09-17: "many beautiful animations that make obvious what is
// happening … the agent orchestrates, not the user … absolutely minimalist"). One thin line inside
// the agent pane, only while a goal run exists: one dot per task, laid out by wave, that MOVES with
// the run — a slow breath while running, a sweep while the verifier reads it, a pop when it passes,
// a shake when it is rejected, a dim when it is blocked; a thread flows from the planner to wave 1,
// wave to wave, and finally down into the terminal when the joined report lands. No labels beyond
// one phrase on the right (`t2 verifying · 1m12s`). Hover a dot for its title; click for the detail.
import React from "react";
import { useTourUnlock } from "@/loki/shell/mini-tour";
import { C, mono } from "@/loki/theme";
import type { GoalRun, GoalTask } from "./subagents";

const KEYFRAMES = `
@keyframes lokiBreathe { 0%,100% { transform: scale(1); box-shadow: 0 0 0 0 color-mix(in oklab, var(--dot) 55%, transparent); } 50% { transform: scale(1.18); box-shadow: 0 0 0 5px transparent; } }
@keyframes lokiSweep { 0% { background-position: -40px 0; } 100% { background-position: 40px 0; } }
@keyframes lokiPop { 0% { transform: scale(.6); opacity: .4; } 60% { transform: scale(1.35); opacity: 1; } 100% { transform: scale(1); } }
@keyframes lokiShake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-3px); } 40% { transform: translateX(3px); } 60% { transform: translateX(-2px); } 80% { transform: translateX(2px); } }
@keyframes lokiFlow { 0% { background-position: 0 0; } 100% { background-position: 24px 0; } }
@keyframes lokiFlowDown { 0% { background-position: 0 0; } 100% { background-position: 0 24px; } }
@keyframes lokiRise { 0% { transform: translateY(6px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
@keyframes lokiSettle { 0% { opacity: 1; } 100% { opacity: .55; } }
`;
if (typeof document !== "undefined" && !document.getElementById("loki-goal-anim")) {
  const s = document.createElement("style"); s.id = "loki-goal-anim"; s.textContent = KEYFRAMES; document.head.appendChild(s);
}

const tone = (t: GoalTask) => (t.status === "done" ? C.ok : t.status === "failed" || t.status === "blocked" ? C.bad : t.status === "running" || t.status === "verifying" ? C.warn : t.status === "skipped" ? C.dim : C.muted);
const elapsed = (t: GoalTask) => (t.started ? `${Math.max(0, Math.round(((t.ended ?? Date.now()) - t.started) / 1000))}s` : "");

/** The one phrase on the right — what is happening now. Pure, tested. */
export function stripPhrase(r: GoalRun): string {
  const running = r.tasks.filter((t) => t.status === "running");
  const verifying = r.tasks.filter((t) => t.status === "verifying");
  const done = r.tasks.filter((t) => t.status === "done").length;
  if (r.status === "planning") return "planning…";
  if (r.status === "awaiting-approval") return "plan ready";
  if (r.status === "paused") return "paused";
  if (r.status === "joining") return "joining the reports…";
  if (r.status === "done") return `${done}/${r.tasks.length} · report delivered`;
  if (r.status === "failed") return `${done}/${r.tasks.length} · ${r.tasks.filter((t) => t.status === "failed" || t.status === "blocked").map((t) => t.id).join(", ")} open`;
  if (r.status === "cancelled") return "cancelled";
  if (verifying.length) return `${verifying[0].id} verifying${verifying[0].attempts > 1 ? " · retry" : ""}`;
  if (running.length) return `${running.map((t) => t.id).join(" ")} working · ${elapsed(running[0])}`;
  return `${done}/${r.tasks.length}`;
}

function Dot({ t, onClick }: { t: GoalTask; onClick: () => void }) {
  const c = tone(t);
  const anim = t.status === "running" ? "lokiBreathe 1.6s ease-in-out infinite" : t.status === "verifying" ? "lokiSweep .9s linear infinite" : t.status === "done" ? "lokiPop .5s ease-out" : t.status === "failed" || t.status === "blocked" ? "lokiShake .5s ease-in-out" : t.status === "skipped" ? "lokiSettle .4s ease-out forwards" : "none";
  const rejected = t.attempts > 1 && (t.status === "running" || t.status === "ready");
  return (
    <span data-testid={`goal-dot-${t.id}`} data-state={t.status} onClick={onClick} title={`${t.id} · ${t.title} — ${t.status}${t.attempts > 1 ? ` (attempt ${t.attempts})` : ""}${t.verdict ? `\n⚖ ${t.verdict.reasons.join(" · ")}` : ""}`}
      style={{ ["--dot" as any]: c, width: 9, height: 9, borderRadius: 9, flexShrink: 0, cursor: "pointer", display: "inline-block",
        background: t.status === "verifying" ? `linear-gradient(90deg, ${C.warn}, ${C.bg} 50%, ${C.warn})` : t.status === "pending" || t.status === "ready" ? "transparent" : c,
        backgroundSize: t.status === "verifying" ? "80px 100%" : undefined,
        border: `1.5px solid ${rejected ? C.bad : c}`, animation: anim, transition: "background .3s ease, border-color .3s ease" }} />
  );
}

function Thread({ live, vertical }: { live: boolean; vertical?: boolean }) {
  return <span aria-hidden style={{ display: "inline-block", flexShrink: 0, ...(vertical ? { width: 2, height: 10, backgroundSize: "2px 8px", background: `repeating-linear-gradient(180deg, ${live ? C.warn : C.border} 0 4px, transparent 4px 8px)`, animation: live ? "lokiFlowDown .6s linear infinite" : "none" } : { width: 18, height: 2, backgroundSize: "8px 2px", background: `repeating-linear-gradient(90deg, ${live ? C.warn : C.border} 0 4px, transparent 4px 8px)`, animation: live ? "lokiFlow .6s linear infinite" : "none" }) }} />;
}

export function GoalStrip({ runs, onOpen }: { runs: GoalRun[]; onOpen: () => void }) {
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  const run = runs.filter((r) => r.status !== "cancelled").slice(-1)[0] ?? null;
  const live = !!run && (run.status === "running" || run.status === "joining" || run.status === "planning" || run.status === "paused");
  React.useEffect(() => { if (!live) return; const t = setInterval(tick, 1000); return () => clearInterval(t); }, [live]);
  useTourUnlock("goal-run", !!run); // the progressive tour: the first goal run the user sees
  // fade the finished strip out after a while — the chip keeps the count
  const [hidden, setHidden] = React.useState(false);
  React.useEffect(() => { setHidden(false); if (!run || live) return; const t = setTimeout(() => setHidden(true), 90_000); return () => clearTimeout(t); }, [run?.id, run?.status, live]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!run || hidden) return null;
  const waves = Array.from(new Set(run.tasks.map((t) => t.wave))).sort((a, b) => a - b);
  const waveLive = (w: number) => run.tasks.some((t) => t.wave === w && (t.status === "running" || t.status === "verifying"));
  const waveDone = (w: number) => run.tasks.filter((t) => t.wave === w).every((t) => t.status === "done" || t.status === "skipped");
  const delivering = run.status === "done" || run.status === "failed";
  return (
    <div data-testid="goal-strip" onClick={onOpen} title="the agent's delegated run — click for the detail"
      style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", animation: "lokiRise .3s ease-out", fontFamily: mono, fontSize: 9, color: C.dim, userSelect: "none" }}>
      <span style={{ color: live ? C.warn : run.status === "done" ? C.ok : C.dim, fontSize: 10, animation: run.status === "planning" ? "lokiBreathe 1.2s ease-in-out infinite" : "none" }}>⋔</span>
      <Thread live={run.status === "running" && waveLive(waves[0] ?? 0)} />
      {waves.map((w, i) => (
        <React.Fragment key={w}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {run.tasks.filter((t) => t.wave === w).map((t) => <Dot key={t.id} t={t} onClick={onOpen} />)}
          </span>
          {i < waves.length - 1 && <Thread live={waveDone(w) && waveLive(waves[i + 1])} />}
        </React.Fragment>
      ))}
      <Thread live={run.status === "joining"} />
      <span data-testid="goal-join" style={{ width: 7, height: 7, borderRadius: 2, background: delivering ? (run.status === "done" ? C.ok : C.bad) : run.status === "joining" ? C.warn : "transparent", border: `1.5px solid ${delivering ? (run.status === "done" ? C.ok : C.bad) : run.status === "joining" ? C.warn : C.border}`, animation: run.status === "joining" ? "lokiBreathe 1s ease-in-out infinite" : delivering ? "lokiPop .5s ease-out" : "none", flexShrink: 0 }} />
      {delivering && <Thread live={!run.delivered} vertical />}
      <span style={{ flex: 1 }} />
      <span data-testid="goal-phrase" style={{ color: live ? C.fg : C.dim, whiteSpace: "nowrap" }}>{stripPhrase(run)}</span>
    </div>
  );
}
