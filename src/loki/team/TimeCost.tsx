// TIME AND COST OF THE TEAM, WHERE YOU LOOK (the operator 2026-11-22): a small discreet reading on the bottom bar, after the icons (how long the run has gone and what it has cost); one click opens the full "Time and cost" (the waterfall) as a glass window in the middle of the screen.
// It replaces the Activity tab, whose other views (recap, report, plan, chat, files, context) are dropped.
import * as React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import { useStripSlot } from "@/loki/cowork/strip-slot";
import { TraceWaterfall } from "./TraceWaterfall";
import type { Run } from "./types";

/** "m:ss" (or "h:mm:ss") for a span in ms. Pure. */
export function clock(ms: number): string { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; }
export const usd = (v: number) => (v > 0 && v < 0.01 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`);
/** What the run has taken and cost so far: the clock of a live run keeps counting, a finished one stops at its own `now_ms`. Pure. */
export function readingOf(run: Run | null, nowMs?: number): { time: string; cost: string; live: boolean } | null {
  if (!run) return null; const end = run.live ? (nowMs ?? run.state.now_ms) : run.state.now_ms; return { time: clock(end - run.state.started_ms), cost: usd(run.state.spent_usd ?? run.spent_usd ?? 0), live: !!run.live };
}
export function TimeCostMini({ run }: { run: Run | null }) {
  const slot = useStripSlot(); const [open, setOpen] = React.useState(false); const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { if (!run?.live) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [run?.live]);
  React.useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open]);
  const r = readingOf(run, run?.live ? now : undefined);
  const mini = slot ? createPortal(
    <button data-testid="timecost-mini" aria-haspopup="dialog" aria-expanded={open} title={r ? "Time and cost of this team: click for the waterfall" : "No run yet: time and cost show here"} disabled={!r} onClick={() => setOpen((o) => !o)}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "transparent", border: "none", padding: "0 6px", cursor: r ? "pointer" : "default", color: r ? C.dim : C.muted, fontFamily: mono, fontSize: 11, opacity: r ? 1 : 0.55 }}>
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.8, strokeLinecap: "round" }}><circle cx="12" cy="13" r="7.5" /><path d="M12 13V8.5M9.5 3.5h5" /></svg>
      <span data-testid="timecost-time">{r?.time ?? "—"}</span><span aria-hidden style={{ opacity: 0.4 }}>·</span><span data-testid="timecost-cost">{r?.cost ?? "—"}</span>{r?.live && <i aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: "var(--c-ok)", animation: "tg-blink .9s steps(2,jump-none) infinite" }} />}</button>, slot) : null;
  return <>{mini}{open && run && createPortal(
    <div data-testid="timecost-scrim" onMouseDown={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 2147482000, display: "grid", placeItems: "center", background: "color-mix(in srgb, #000 28%, transparent)" }}>
      <div role="dialog" aria-label="Time and cost" data-testid="timecost-window" onMouseDown={(e) => e.stopPropagation()} style={{ width: "min(900px, calc(100vw - 48px))", maxHeight: "calc(100vh - 96px)", overflow: "auto", padding: "14px 16px 18px", fontFamily: nav, color: C.fg }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}><b style={{ fontSize: 14 }}>Time and cost</b><span style={{ color: C.muted, fontFamily: mono, fontSize: 11.5 }}>{r?.time} · {r?.cost}{run.live ? " · running" : ""}</span><span style={{ flex: 1 }} /><button data-testid="timecost-close" aria-label="close" onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>✕</button></div>
        <TraceWaterfall run={run} bare /></div></div>, document.body)}</>;
}
