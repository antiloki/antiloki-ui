// THE RUNS OF A TEAM (the operator 2026-11-20): a drop-down over the graph with every run of the team, each with the state it ended in (or is in); picking one shows that run's graph, picking "Latest" goes back to following the live run.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import type { RunRow } from "./types";

const DOT: Record<string, string> = { running: "#4d8dff", paused: "#f5a524", done: "#3ecf8e", blocked: "#f5a524", stopped: "#8b8b94", idle: "#8b8b94" };
/** How long ago a run began, in a word. Pure. */
export function whenOf(ms: number, now = Date.now()): string { if (now - ms < 45_000) return "just now"; const m = Math.max(1, Math.round((now - ms) / 60000)); if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 36) return `${h} h ago`; return `${Math.round(h / 24)} d ago`; }
/** One run as a line of the list: its place in the order (newest first), when, what it ended as, what it cost. Pure. */
export function runLine(r: RunRow, i: number, total: number, now = Date.now()): string {
  const st = r.status?.status ?? "idle"; return `Run ${total - i} · ${whenOf(r.started_ms, now)} · ${st}${r.needs_you ? " (needs you)" : ""}${r.spent_usd ? ` · $${r.spent_usd.toFixed(2)}` : ""}`;
}
export function RunPicker({ rows, live, shown, pinned, onPick, slotRef }: { rows: RunRow[]; live: string[]; shown: string | null; pinned: string | null; onPick: (id: string | null) => void; /** the place to the right of the dropdown where the view bar is drawn */ slotRef?: (el: HTMLElement | null) => void }) {
  const cur = rows.find((r) => r.id === shown); const st = cur?.status?.status ?? "idle"; const following = pinned === null;
  return (
    <div data-testid="run-picker" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px 4px", fontFamily: nav, fontSize: 12, color: C.muted }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: DOT[st] ?? "#8b8b94", boxShadow: live.includes(shown ?? "") ? `0 0 0 3px ${DOT[st]}33` : "none", flexShrink: 0 }} />
      <select data-testid="run-picker-select" aria-label="which run the graph shows" value={following ? "" : pinned ?? ""} onChange={(e) => onPick(e.target.value || null)} style={{ background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, height: 26, padding: "0 8px", fontFamily: nav, fontSize: 12, maxWidth: 360, cursor: "pointer" }}>
        <option value="">{live.length ? "Live run (follows it)" : "Latest run"}{cur && following ? ` · ${runLine(cur, rows.indexOf(cur), rows.length)}` : ""}</option>
        {rows.map((r, i) => <option key={r.id} value={r.id}>{runLine(r, i, rows.length)}</option>)}
      </select>
      {!following && <button data-testid="run-picker-latest" onClick={() => onPick(null)} style={{ background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, height: 26, padding: "0 10px", cursor: "pointer", fontFamily: nav, fontSize: 12 }}>Back to {live.length ? "the live run" : "latest"}</button>}
      <span ref={slotRef} data-testid="run-bar-slot" style={{ marginLeft: "auto", display: "flex", alignItems: "center", minWidth: 0 }} />
    </div>
  );
}
