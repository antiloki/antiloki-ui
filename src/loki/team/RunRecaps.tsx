// THE RECAP, ONE ROW PER RUN (the operator 2026-11-15: "recap should be a consolidation of each run, with a deterministic summary and an AI summary"): the team's runs, newest first; the latest is open. Open one for what it recorded in sentences made only from the run's own record
// (how long, how much, how many steps, which files, who was asked), and below it the AI summary: written once on a click from those same facts and the steps' reports, kept on this machine so it is not paid for twice.
import * as React from "react";
import { C, nav } from "@/loki/theme";
import { askEngine } from "@/loki/api/engine";
import { listTeams, runStatus } from "./api";
import { Icon } from "./icons";
import { agoWords, money, runDigest, type RunDigest } from "./model";
import type { Run, RunRow } from "./types";

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }; const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
const GLYPH: Record<string, { icon: string; color: string }> = { done: { icon: "tick", color: "#34d399" }, blocked: { icon: "hand", color: "#f5b942" }, stopped: { icon: "x", color: "#f87171" }, running: { icon: "spark", color: "#60a5fa" }, paused: { icon: "pause", color: "#94a3b8" } };
/** The words the AI is given: the facts, then what each step said. Pure. */
export function summaryPrompt(ask: string, d: RunDigest): string {
  return `A team of AI agents ran this ask: "${ask}".\nWhat the run recorded:\n${d.lines.join("\n")}\n\nWhat each step reported:\n${d.evidence || "(nothing written)"}\n\nIn at most three short sentences, plain words: what was done, and the one thing the person should check. Do not invent anything that is not above.`;
}
export const recapKey = (run: string) => `antiloki.team.recap.${run}`;

function RunRecap({ row, now, start }: { row: RunRow; now: number; start: boolean }) {
  const [open, setOpen] = React.useState(start); const [run, setRun] = React.useState<Run | null>(() => SEEN_RUN.get(row.id) ?? null); const [ai, setAi] = React.useState<string | null>(() => lsGet(recapKey(row.id))); const [busy, setBusy] = React.useState(false); const [err, setErr] = React.useState("");
  React.useEffect(() => { let stop = false; if (open && !run) void runStatus(row.id).then((r) => { if (!stop && r) { SEEN_RUN.set(row.id, r); setRun(r); } }); return () => { stop = true; }; }, [open, row.id, run]);
  const d = React.useMemo(() => (run ? runDigest(run) : null), [run]); const g = GLYPH[row.status.status] ?? GLYPH.running;
  const write = async () => { if (!d) return; setBusy(true); setErr(""); const r = await askEngine(summaryPrompt(row.ask, d), { tier: "low" } as any); setBusy(false); if (r.ok && r.text) { setAi(r.text.trim()); lsSet(recapKey(row.id), r.text.trim()); } else setErr(("error" in r && (r as any).error) || "the engine did not answer"); };
  return (
    <div data-testid={`recap-run-${row.id}`} style={{ borderBottom: `1px solid ${C.border}` }}>
      <button data-testid={`recap-toggle-${row.id}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ display: "grid", gridTemplateColumns: "20px 1fr auto 18px", alignItems: "center", gap: 12, width: "100%", background: "transparent", color: C.fg, border: "none", padding: "11px 16px", cursor: "pointer", textAlign: "left", fontFamily: nav, fontSize: 13 }}>
        <span style={{ color: g.color, display: "inline-flex" }}><Icon name={g.icon} size={15} /></span>
        <span style={{ minWidth: 0 }}><span style={{ display: "block", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.ask || "(no ask)"}</span><span style={{ display: "block", color: C.dim, fontSize: 11.5 }}>{agoWords(row.started_ms, now)}</span></span>
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center", color: C.muted, fontSize: 12 }}><Icon name="coin" size={12} />{money(row.spent_usd)}</span>
        <span style={{ color: C.dim, display: "inline-flex", transform: open ? "rotate(180deg)" : "none" }}><Icon name="chev" size={13} /></span>
      </button>
      {open && <div style={{ padding: "0 16px 14px 48px", display: "grid", gap: 10, fontSize: 13 }}>
        {!d && <span style={{ color: C.muted }}>reading the run…</span>}
        {d && <div data-testid={`recap-facts-${row.id}`} style={{ display: "grid", gap: 4 }}>{d.lines.map((l, i) => <span key={i} style={{ color: i === 0 ? C.fg : C.muted, lineHeight: 1.5 }}>{l}</span>)}</div>}
        {d && <div data-testid={`recap-ai-${row.id}`} style={{ display: "grid", gap: 6 }}>
          {ai ? <span style={{ display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.55 }}><span style={{ color: C.brand, display: "inline-flex", marginTop: 2 }}><Icon name="spark" size={14} /></span><span style={{ whiteSpace: "pre-wrap" }}>{ai}</span></span>
            : <span><button data-testid={`recap-write-${row.id}`} disabled={busy} onClick={() => void write()} title="one short call to your AI subscription, kept on this machine" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: nav, fontSize: 12.5, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 11px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}><Icon name="spark" size={13} />{busy ? "writing…" : "Summarize with AI"}</button></span>}
          {err && <span style={{ color: "var(--c-bad)", fontSize: 12 }}>{err}</span>}
        </div>}
      </div>}
    </div>
  );
}

/** What the recap showed last, for the life of the page: opening it paints this at once and the fresh answer replaces it (the operator 2026-11-18: "recap is slow to open"). */
const SEEN_ROWS = new Map<string, RunRow[]>(); const SEEN_RUN = new Map<string, Run>();
export function RunRecaps({ team }: { team: string }) {
  const [rows, setRows] = React.useState<RunRow[] | null>(() => SEEN_ROWS.get(slug(team)) ?? null); const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => { let stop = false; const go = async () => { if (typeof document !== "undefined" && document.hidden) return; try { const l = await listTeams(); if (!stop) { if (l.failed) return; const mine = (l.runs ?? []).filter((r) => slug(r.team) === slug(team)).sort((a, b) => b.started_ms - a.started_ms).slice(0, 12); SEEN_ROWS.set(slug(team), mine); setRows(mine); setNow(Date.now()); } } catch { /* try again */ } }; void go(); const t = setInterval(go, 8000); return () => { stop = true; clearInterval(t); }; }, [team]);
  if (rows === null) return <div style={{ padding: 16, color: C.muted, fontFamily: nav, fontSize: 13 }}>reading the runs…</div>;
  if (!rows.length) return <div data-testid="recap-empty" style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, color: C.muted, fontFamily: nav, fontSize: 13 }}><Icon name="flag" size={16} />No run yet. Each run is summed up here when it has run.</div>;
  return <div data-testid="run-recaps">{rows.map((r, i) => <RunRecap key={r.id} row={r} now={now} start={i === 0} />)}</div>;
}
