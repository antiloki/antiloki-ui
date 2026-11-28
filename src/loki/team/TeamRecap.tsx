// THE RECAP AND THE AWAY SUMMARY OF A TEAM (the operator 2026-11-15: "a tab for agent recap, a tab for away summary"; ideas from AffectUI's Agent Recap and Away Summary, Linear-flat, our build).
// RECAP: the last day of this team as a small chart (a bar an hour, the peak named) and a board of what needs you, what failed and what is done, one card per run that opens it.
// AWAY: since the person last said "got it" on this team: how long they were gone, what needs them, what failed, what is done, one line each. Both read the serve's away digest for THIS team.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { awayDigest } from "./api";
import { agoWords, hourBuckets, money, spanWords } from "./model";
import type { Digest, DigestRun } from "./types";

const AMBER = "#f5b942"; const RED = "#f87171"; const GREEN = "#34d399"; const BLUE = "#60a5fa";
const markKey = (team: string) => `antiloki.team.away.seen.${team}`;
const getMark = (team: string): number | undefined => { try { const v = Number(localStorage.getItem(markKey(team))); return v > 0 ? v : undefined; } catch { return undefined; } };
const setMark = (team: string, ms: number) => { try { localStorage.setItem(markKey(team), String(ms)); } catch { /* private window */ } };
const mix = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const card: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel, padding: "9px 12px", display: "grid", gap: 3, textAlign: "left", fontFamily: nav, fontSize: 12.5, color: C.fg, cursor: "pointer" };

function RunCard({ r, now, onOpen }: { r: DigestRun; now: number; onOpen?: (run: string) => void }) {
  const tone = r.kind === "failed" ? RED : r.kind === "parked" ? AMBER : r.kind === "finished" ? GREEN : BLUE;
  return <button data-testid={`recap-run-${r.id}`} onClick={() => onOpen?.(r.id)} style={card}>
    <span style={{ display: "flex", gap: 8, alignItems: "center" }}><i style={{ width: 7, height: 7, borderRadius: "50%", background: tone, display: "inline-block", flex: "none" }} /><span style={{ fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ask || r.id}</span></span>
    <span style={{ color: C.muted, fontSize: 11.5 }}>{r.kind === "failed" ? (r.why || "did not finish") : r.kind === "parked" ? "waiting for you" : r.kind === "finished" ? `finished in ${spanWords(r.ended_ms - r.started_ms)}` : r.kind}</span>
    <span style={{ color: C.dim, fontSize: 11, fontFamily: mono }}>{agoWords(r.ended_ms || r.started_ms, now)} · {money(r.spent_usd)}</span></button>;
}
function Column({ title, tone, runs, now, onOpen }: { title: string; tone: string; runs: DigestRun[]; now: number; onOpen?: (run: string) => void }) {
  return <section data-testid={`recap-col-${title.toLowerCase().replace(/\s+/g, "-")}`} style={{ minWidth: 0 }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.dim, margin: "0 2px 6px" }}><i style={{ width: 7, height: 7, borderRadius: "50%", background: tone, display: "inline-block" }} />{title}<span style={{ fontFamily: mono }}>{runs.length}</span></div>
    <div style={{ display: "grid", gap: 6 }}>{runs.length ? runs.map((r) => <RunCard key={r.id} r={r} now={now} onOpen={onOpen} />) : <div style={{ color: C.dim, fontSize: 12, padding: "6px 2px" }}>Nothing.</div>}</div></section>;
}

export function TeamRecap({ team, mode, onOpenRun }: { team: string; mode: "recap" | "away"; onOpenRun?: (run: string) => void }) {
  const [d, setD] = React.useState<Digest | null | undefined>(undefined); const [gone, setGone] = React.useState(false);
  React.useEffect(() => { let stop = false; setD(undefined); setGone(false); void Promise.resolve(awayDigest(mode === "away" ? getMark(team) : Date.now() - 24 * 3_600_000, team)).then((x) => { if (!stop) setD(x ?? null); }); return () => { stop = true; }; }, [team, mode]);
  if (d === undefined) return <div data-testid="recap-loading" style={{ padding: 16, color: C.muted, fontFamily: nav, fontSize: 13 }}>Reading what the team did…</div>;
  if (d === null) return <div data-testid="recap-error" style={{ padding: 16, color: C.muted, fontFamily: nav, fontSize: 13 }}>The serve could not say what the team did. If this antiloki is newer than the serve it talks to (a serve started before 15 November does not know this question), restart the serve with the current build.</div>;
  const runs = d.runs ?? []; const now = d.now_ms;
  if (mode === "away") {
    if (gone || d.quiet) return <div data-testid="away-quiet" style={{ padding: 16, color: C.muted, fontFamily: nav, fontSize: 13 }}>{gone ? "Got it. Nothing new since." : "Nothing happened while you were away."}</div>;
    return <div data-testid="away-summary" style={{ padding: "14px 16px", fontFamily: nav, fontSize: 13, color: C.fg, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}><b style={{ fontWeight: 600, fontSize: 14 }}>While you were away</b><span style={{ color: C.muted }}>{spanWords(Math.max(0, d.now_ms - d.since_ms))}</span><span data-testid="away-words" style={{ color: C.muted, flex: "1 1 260px" }}>{d.words}</span>
        <button data-testid="away-gotit" onClick={() => { setMark(team, d.now_ms); setGone(true); }} style={{ fontFamily: nav, fontSize: 12, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 10px", cursor: "pointer" }}>Got it</button></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <Column title="Needs you" tone={AMBER} runs={runs.filter((r) => r.kind === "parked")} now={now} onOpen={onOpenRun} /><Column title="Failed" tone={RED} runs={runs.filter((r) => r.kind === "failed")} now={now} onOpen={onOpenRun} /><Column title="Done" tone={GREEN} runs={runs.filter((r) => r.kind === "finished")} now={now} onOpen={onOpenRun} /></div>
      {d.skips.length > 0 && <div style={{ color: C.muted, fontSize: 12 }}>Skipped by a limit: {d.skips.map((s) => s.why).join("; ")}</div>}
    </div>;
  }
  const b = hourBuckets(runs, now, 24); const hourOf = (i: number) => new Date(now - (24 - i) * 3_600_000).getHours();
  return <div data-testid="recap" style={{ padding: "14px 16px", fontFamily: nav, fontSize: 13, color: C.fg, display: "grid", gap: 14 }}>
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}><b style={{ fontWeight: 600, fontSize: 14 }}>The last 24 hours</b><span data-testid="recap-words" style={{ color: C.muted }}>{runs.length ? d.words : "Nothing ran in the last day."}</span></div>
    {runs.length > 0 && <div data-testid="recap-chart" style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 54 }}>{b.counts.map((c, i) => <i key={i} data-testid={`recap-bar-${i}`} title={`${c} at ${String(hourOf(i)).padStart(2, "0")}:00`} style={{ flex: 1, height: `${c ? Math.max(8, (c / b.peak) * 100) : 3}%`, background: c ? (i === b.peak_at ? BLUE : mix(BLUE, 45)) : mix("currentColor", 10), borderRadius: 2 }} />)}</div>
      <div style={{ display: "flex", justifyContent: "space-between", color: C.dim, fontSize: 10.5, fontFamily: mono, marginTop: 4 }}><span>24 h ago</span>{b.peak > 0 && <span data-testid="recap-peak" style={{ color: C.muted }}>peak {b.peak} at {String(hourOf(b.peak_at)).padStart(2, "0")}:00</span>}<span>now</span></div></div>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
      <Column title="Needs you" tone={AMBER} runs={runs.filter((r) => r.kind === "parked")} now={now} onOpen={onOpenRun} /><Column title="Failed" tone={RED} runs={runs.filter((r) => r.kind === "failed")} now={now} onOpen={onOpenRun} /><Column title="Done" tone={GREEN} runs={runs.filter((r) => r.kind === "finished")} now={now} onOpen={onOpenRun} /></div>
  </div>;
}
