// RUNNING NOW (AffectUI's idea, the operator's yes 2026-11-15: "the design is already correct, it is Linear"): one quiet pill over EVERY team, "3 running · 2 need you"; open it for the runs, the ones that wait for you first, each
// with its team, what it was asked and the spend, and a click opens that team. Flat, 1px lines, small labels. Polls the serve's run list; says nothing when nothing runs.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";
import { Icon } from "./icons";
import { listTeams } from "./api";
import { money, runningNow } from "./model";
import type { RunRow } from "./types";

const AMBER = "#f5b942"; const BLUE = "#60a5fa";
/** What waits for you besides team runs: the runs Heimdall holds for an answer. Pure. */
export function asksOf(runs: { id: number; goal: string; status: string; questions?: { answer?: string }[] }[]): { id: number; goal: string }[] {
  return runs.filter((r) => r.status === "awaiting-answers" && (r.questions ?? []).some((q) => !q.answer)).map((r) => ({ id: r.id, goal: r.goal }));
}
export function RunningNow({ onOpenTeam, pollMs = 8000 }: { onOpenTeam?: (team: string) => void; pollMs?: number }) {
  const [data, setData] = React.useState<{ runs: RunRow[]; live: string[] }>({ runs: [], live: [] }); const [open, setOpen] = React.useState(false); const [asks, setAsks] = React.useState<{ id: number; goal: string }[]>([]);
  React.useEffect(() => { let stop = false; const go = async () => { if (typeof document !== "undefined" && document.hidden) return; try { const l = await listTeams(); if (!stop) setData({ runs: l.runs ?? [], live: l.live ?? [] }); } catch { /* the serve is busy: keep what was shown */ }
    try { const g: any = await apiGet("/api/v1/cockpit/goals?scope=workspace", { timeoutMs: 10_000 }); const x = g?.runs ?? g?.data?.runs; if (!stop && Array.isArray(x)) setAsks(asksOf(x)); } catch { /* no questions to show */ } }; void go(); const t = setInterval(go, pollMs); return () => { stop = true; clearInterval(t); }; }, [pollMs]);
  const n = React.useMemo(() => runningNow(data.runs, data.live), [data]);
  if (!n.running && !asks.length) return null;
  const needs = n.needs_you + asks.length; const tone = needs ? AMBER : BLUE;
  const label = n.running ? `${n.running} running${needs ? ` · ${needs} need${needs === 1 ? "s" : ""} you` : ""}` : `${needs} need${needs === 1 ? "s" : ""} you`;
  return (
    <div data-testid="running-now" style={{ fontFamily: nav, fontSize: 12.5, color: C.fg, padding: "0 8px 6px" }}>
      <button data-testid="running-now-pill" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "color-mix(in srgb, currentColor 5%, transparent)", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontFamily: nav, fontSize: 12.5, textAlign: "left" }}>
        <span style={{ color: tone, display: "inline-flex", flex: "none" }}><Icon name={needs ? "hand" : "spark"} size={14} /></span><span data-testid="running-now-label">{label}</span><span style={{ marginLeft: "auto", color: C.dim, display: "inline-flex", transform: open ? "rotate(180deg)" : "none" }}><Icon name="chev" size={13} /></span>
      </button>
      {open && <div data-testid="running-now-list" style={{ marginTop: 4, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {asks.map((a) => <button key={`ask-${a.id}`} data-testid={`ask-${a.id}`} onClick={() => { window.dispatchEvent(new CustomEvent("antiloki:screening-open", { detail: a.id })); setOpen(false); }} style={{ display: "grid", gridTemplateColumns: "14px 1fr auto", gap: 8, alignItems: "center", width: "100%", background: "transparent", color: C.fg, border: "none", borderBottom: `1px solid ${C.border}`, padding: "6px 10px", cursor: "pointer", textAlign: "left", fontFamily: nav, fontSize: 12.5 }}>
          <span style={{ color: AMBER, display: "inline-flex" }}><Icon name="hand" size={13} /></span>
          <span style={{ minWidth: 0 }}><span style={{ display: "block", fontWeight: 500 }}>Heimdall asks</span><span style={{ display: "block", color: C.muted, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.goal}</span></span>
          <span style={{ fontSize: 11.5, color: AMBER }}>answer</span></button>)}
        {n.rows.map((r) => <button key={r.id} data-testid={`running-${r.id}`} onClick={() => { onOpenTeam?.(r.team); setOpen(false); }} style={{ display: "grid", gridTemplateColumns: "14px 1fr auto", gap: 8, alignItems: "center", width: "100%", background: "transparent", color: C.fg, border: "none", borderBottom: `1px solid ${C.border}`, padding: "6px 10px", cursor: "pointer", textAlign: "left", fontFamily: nav, fontSize: 12.5 }}>
          <span style={{ color: r.waiting ? AMBER : r.paused ? C.muted : BLUE, display: "inline-flex" }}><Icon name={r.waiting ? "hand" : r.paused ? "pause" : "spark"} size={13} /></span>
          <span style={{ minWidth: 0 }}><span style={{ display: "block", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.team}</span><span style={{ display: "block", color: C.muted, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ask}</span></span>
          <span style={{ textAlign: "right", fontSize: 11.5, color: r.waiting ? AMBER : C.muted }}>{r.waiting ? "needs you" : r.paused ? "paused" : "running"}<span style={{ display: "block", fontFamily: mono, color: C.dim }}>{money(r.spent_usd)}</span></span>
        </button>)}
      </div>}
    </div>
  );
}
