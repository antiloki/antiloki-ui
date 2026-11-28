// THE REPO DASHBOARD (operator 2026-09-18: "an integrated dashboard, not a shortcut screen" — the
// reference was a usage-analytics page: a KPI row, then charts that CARRY the data, with tooltips).
// The repo scope as one analytics page you read top to bottom:
//   KPI row      health (hero) · risk · files · coverage · solo-owned · vulnerable deps
//   over time    health and risk per snapshot — area + line, crosshair tooltip
//   the map      every file a box: area = mass, color = health (the squarified treemap) — the hallmark
//   hotspots     churn × mass scatter (top-right = the files to stabilise)
//   activity     commits per day over the past year (calendar heatmap)
//   laws         mass per broken law (bars) · coverage distribution (histogram) · ownership (bars + bus factor)
//   movers       regressed / improved since the previous snapshot (diverging bars)
//   then          every other analysis as a section of the same page (operator: "add all the features,
//                 don't create boxes — an integrated layout"): the system diagram, the import graph, the
import { devOnly } from "@/loki/dev-only";
//                 data stories, the constitution, the books, the architecture history, the review history,
//                 the diff, the git graph, the live signals, the docs — handed in as `extra` sections by
//                 the IDE and rendered when scrolled into view.
// Every chart is the real analysis in place; `⤢` opens its full panel. All reads deterministic, in
// parallel; a missing one says what to do, never blanks the page. No boxes: sections with a heading
// and a hairline. Single-series marks, status colors only for states (the health ramp IS a state).
import React from "react";
import { C, mono, nav } from "@/loki/theme";
import { apiPost } from "@/loki/api/client";
import { type ProjectReport, type ReviewHistory, type Coverage, type Authors, type CodeHistory, type FileMetric, type MetricsResponse } from "@/loki/api/codebase";

// THE READS (2026-09-18): the client's 5 s default timeout is too short here — a big repo's metrics
// take seconds and, on the Node dev server, the reads queue behind each other; a timed-out report
// used to render as "no analysis yet". 60 s each, and null only for a real "not there".
const post = async <T,>(path: string, body: any, key: keyof T): Promise<T | null> => {
  const r: any = await apiPost(path, body, { timeoutMs: 60_000 });
  if (!r) return null;
  if (r[key] != null) return r as T;
  if (r.result && r.result[key] != null) return r.result as T;
  return null;
};
const latestReport = () => post<ProjectReport>("/api/v1/codebase/report/latest", {}, "project");
const reviewHistoryGet = (a: { limit?: number; top?: number }) => post<ReviewHistory>("/api/v1/codebase/review-history", a, "timeline");
const historyGet = (a: { limit?: number }) => post<CodeHistory>("/api/v1/codebase/history", a, "points");
const coverageGet = () => post<Coverage>("/api/v1/codebase/coverage", {}, "files");
const authorsGet = (a: { top_authors?: number }) => post<Authors>("/api/v1/code/authors", a, "authors");
const getMetrics = () => post<MetricsResponse>("/api/v1/codebase/metrics", {}, "metrics_by_file");
import { squarify, heat, HeatScatter, partWhy, CascadeLiquidationMap, OwnershipBubbles, DebtBars, CoverageSunburst } from "./gravity-map";
import { startContextDrag, textOf } from "@/loki/shell/drag-context";
import { reportScreenPage, clearScreenState } from "@/loki/chat/screen-manifest";
import { HeartPulse, TriangleAlert, Files, FlaskConical, UserRound, ShieldAlert, GripVertical } from "lucide-react";

export type OpenKey = "insights" | "constitution" | "coverage" | "graph" | "diagram" | "gravity" | "stories" | "review" | "history" | "diff" | "gitgraph" | "authors" | "telemetry";

async function constitutionReport(): Promise<any | null> {
  try { const r: any = await apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.report", input: {} }, { timeoutMs: 30_000 }); const d = r?.result?.result ?? r?.result ?? r; return d && typeof d === "object" && "constitution" in d ? d : null; } catch { return null; }
}
type Commit = { sha: string; author: string; date: string; subject: string; at?: string };
/** The commit's day: the ISO `at` (2026-09-18) — the `date` is git's relative text ("11 days ago"). */
const commitDay = (c: { at?: string; date: string }) => c.at && c.at.length >= 10 ? c.at : c.date;
async function gitCommits(): Promise<{ commits: Commit[]; branch: string | null } | null> {
  try { const r: any = await apiPost(`/api/v1/code/git`, { limit: 600 }, { timeoutMs: 20_000 }); const d = r?.result ?? r; if (!d?.is_git) return null; return { commits: Array.isArray(d.commits) ? d.commits : [], branch: d.branch ?? null }; } catch { return null; }
}

// ── the pure half (tested) ──────────────────────────────────────────────────────────────────────
export const compact = (n: number | null | undefined): string => (n == null || Number.isNaN(n) ? "—" : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`);
export const tone = (v: number | null | undefined) => (v == null ? C.dim : v >= 80 ? C.ok : v >= 50 ? C.warn : C.bad);
/** A sparkline path over 0..100 values, nulls skipped. Pure. */
export function sparkPath(series: (number | null)[], w = 96, h = 24): string {
  const pts = series.slice(-12).map((v, i, a) => (v == null ? null : { x: (i / Math.max(1, a.length - 1)) * w, y: h - (Math.max(0, Math.min(100, v)) / 100) * h }));
  let d = ""; let pen = false;
  for (const p of pts) { if (!p) { pen = false; continue; } d += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`; pen = true; }
  return d;
}
export function deltaText(series: (number | null)[]): { text: string; dir: "up" | "down" | "flat" } | null {
  const vals = series.filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const d = vals[vals.length - 1] - vals[vals.length - 2];
  return { text: `${d > 0 ? "+" : ""}${Math.round(d)} vs previous snapshot`, dir: d > 0 ? "up" : d < 0 ? "down" : "flat" };
}
/** Commits → a 53-week × 7-day calendar ending today: cells with their count, plus the max. Pure. */
export function calendar(dates: string[], today = new Date()): { cells: { day: number; week: number; date: string; n: number }[]; max: number; months: { week: number; label: string }[] } {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end); start.setUTCDate(end.getUTCDate() - (52 * 7 + end.getUTCDay()));
  const counts = new Map<string, number>();
  for (const d of dates) { const k = String(d).slice(0, 10); counts.set(k, (counts.get(k) ?? 0) + 1); }
  const cells = []; let max = 0; const months: { week: number; label: string }[] = [];
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let i = 0; ; i++) {
    const d = new Date(start); d.setUTCDate(start.getUTCDate() + i);
    if (d > end) break;
    const key = d.toISOString().slice(0, 10); const n = counts.get(key) ?? 0; max = Math.max(max, n);
    const week = Math.floor(i / 7);
    if (d.getUTCDate() === 1 || (i === 0)) months.push({ week, label: names[d.getUTCMonth()] });
    cells.push({ day: d.getUTCDay(), week, date: key, n });
  }
  return { cells, max, months: months.filter((m, i, a) => i === 0 || a[i - 1].label !== m.label) };
}
/** Coverage % per file → five buckets (0–20 … 80–100). Pure. */
export function coverageBuckets(pcts: number[]): { label: string; n: number }[] {
  const b = [0, 0, 0, 0, 0];
  for (const p of pcts) b[Math.min(4, Math.max(0, Math.floor(p / 20)))]++;
  return ["0–20%", "20–40%", "40–60%", "60–80%", "80–100%"].map((label, i) => ({ label, n: b[i] }));
}

// ── INTRO + DAILY DIGEST per dashboard (operator 2026-09-18) ────────────────────────────────────
// Each tab opens with two short blocks: what this dashboard is, with its live numbers; and TODAY —
// what changed in the last 24 h / since the previous snapshot. Deterministic, from the data the page
// already holds; no model call. Pure — tested.
export type DigestInput = {
  report?: ProjectReport | null; hist?: ReviewHistory | null; arch?: CodeHistory | null; laws?: any | null;
  cov?: Coverage | null; authors?: Authors | null; commits?: { sha: string; author: string; date: string; subject: string }[] | null; metrics?: FileMetric[] | null;
  now?: Date;
};
export function digestFor(tab: DashTab, d: DigestInput): { intro: string; today: string[] } {
  const now = d.now ?? new Date();
  const dayAgo = now.getTime() - 24 * 3600 * 1000;
  const recent = (d.commits ?? []).filter((c) => new Date(commitDay(c)).getTime() >= dayAgo);
  const byAuthor = new Map<string, number>(); for (const c of recent) byAuthor.set(c.author, (byAuthor.get(c.author) ?? 0) + 1);
  const authorsLine = byAuthor.size ? ` by ${Array.from(byAuthor.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, n]) => `${a} (${n})`).join(", ")}` : "";
  const commitsLine = recent.length ? `${recent.length} commit${recent.length === 1 ? "" : "s"} in the last 24 h${authorsLine}` : d.commits ? "no commits in the last 24 h" : "";
  const pts = (d.arch?.points ?? []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const last = pts[pts.length - 1]; const prev = pts[pts.length - 2];
  const delta = (k: "health" | "risk" | "coverage" | "cycles" | "smells" | "files"): number | null => (last && prev && last[k] != null && prev[k] != null ? (last[k] as number) - (prev[k] as number) : null);
  const signed = (v: number | null, unit = "") => (v == null ? "" : `${v > 0 ? "+" : ""}${Math.round(v)}${unit}`);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const health = d.report?.project?.health ?? last?.health ?? null; const risk = d.report?.project?.risk ?? last?.risk ?? null;
  const files = d.report?.counts?.files ?? last?.files ?? d.metrics?.length ?? null;
  const smells = d.report?.smells ?? []; const vulns = d.report?.vulns ?? [];
  const regressed = d.hist?.movers?.regressed ?? []; const improved = d.hist?.movers?.improved ?? [];
  const byLaw: any[] = d.laws?.by_law ?? [];
  let intro = ""; const today: string[] = [];
  switch (tab) {
    case "overview": {
      intro = files == null
        ? "The repository's verdict: health, risk, the codebase as a map, its hotspots and its activity. Rebuild the atlas to fill it."
        : `${plural(files, "file")} judged · health ${health ?? "—"}${delta("health") != null ? ` (${signed(delta("health"))} since the previous snapshot)` : ""} · risk ${risk ?? "—"} · ${plural(smells.length, "smell")}${vulns.length ? ` · ${plural(vulns.length, "vulnerable dep")}` : ""}. The map is every file by mass and health; the hotspots are what changes most and weighs most.`;
      if (commitsLine) today.push(commitsLine);
      if (delta("health") != null) today.push(`health ${signed(delta("health"))} · risk ${signed(delta("risk"))} since snapshot #${prev?.id ?? "?"}`);
      if (regressed[0]) today.push(`most regressed: ${regressed[0].path} (${Math.round(regressed[0].from)} → ${Math.round(regressed[0].to)})`);
      if (improved[0]) today.push(`most improved: ${improved[0].path} (${Math.round(improved[0].from)} → ${Math.round(improved[0].to)})`);
      break;
    }
    case "hurt": {
      const total = byLaw.reduce((n, l) => n + (Number(l.n) || 0), 0);
      intro = `Where the code breaks its own rules and what the tests never reach. ${byLaw.length ? `${plural(total, "violation")} across ${plural(byLaw.length, "law")} — heaviest: ${byLaw[0]?.law_key}.` : "No constitution snapshot yet."}${d.cov?.total_pct != null ? ` Coverage ${Math.round(d.cov.total_pct)}% of executed lines.` : ""}`;
      if (d.laws?.deltas?.health != null) today.push(`law-score health ${signed(d.laws.deltas.health)} since snapshot #${d.laws.deltas.from_snapshot ?? "?"}`);
      if (Array.isArray(d.laws?.deltas?.worse) && d.laws.deltas.worse.length) today.push(`worse: ${d.laws.deltas.worse.slice(0, 3).map((w: any) => w.path ?? w.law_key ?? String(w)).join(", ")}`);
      if (delta("coverage") != null && delta("coverage") !== 0) today.push(`coverage ${signed(delta("coverage"), " pts")}`);
      if (delta("smells") != null && delta("smells") !== 0) today.push(`smells ${signed(delta("smells"))}`);
      if (vulns.length) today.push(`${plural(vulns.length, "vulnerable dependency").replace("dependencys", "dependencies")} open`);
      break;
    }
    case "breaks": {
      const cycles = last?.cycles ?? null;
      const top = (d.metrics ?? []).slice().sort((a, b) => (b.fan_in ?? 0) - (a.fan_in ?? 0))[0];
      intro = `What breaks if you touch it: the system diagram, the import graph and its blast radius, the data stories.${cycles != null ? ` ${plural(cycles, "import cycle")}.` : ""}${top ? ` The most depended-on file is ${top.path} (fan-in ${top.fan_in}).` : ""}`;
      if (delta("cycles") != null && delta("cycles") !== 0) today.push(`import cycles ${signed(delta("cycles"))}`);
      if (delta("files") != null && delta("files") !== 0) today.push(`files ${signed(delta("files"))}`);
      if (d.arch?.incident) today.push(`${d.arch.incident.severity}: ${d.arch.incident.summary}`);
      if (commitsLine) today.push(commitsLine);
      break;
    }
    case "happened": {
      intro = `The review over time, the working tree, the git graph and who wrote what.${d.hist?.snapshot_count ? ` ${plural(d.hist.snapshot_count, "snapshot")}.` : ""}${d.authors ? ` ${plural(d.authors.author_count, "author")}, ${plural(d.authors.commit_count, "commit")}${d.authors.bus_factor ? `, ${d.authors.bus_factor.solo_files} of ${d.authors.bus_factor.total_files} files with a single author` : ""}.` : ""}`;
      if (commitsLine) today.push(commitsLine);
      for (const c of recent.slice(0, 3)) today.push(`${String(c.sha).slice(0, 7)} ${c.subject}`);
      if (regressed.length || improved.length) today.push(`${regressed.length} regressed · ${improved.length} improved since the previous snapshot`);
      break;
    }
    case "ultra": {
      intro = "A mission → a swarm → the paper: pick a mission the X-ray's evidence derives (or write one), bind a crew from the specialists on the right, and generate the paper — the study, the class, the audio.";
      if (commitsLine) today.push(commitsLine);
      break;
    }
    default: return { intro: "", today: [] };
  }
  return { intro, today: today.length ? today : ["nothing changed since the previous snapshot"] };
}

/** THE X-RAY BRIEF (operator 2026-09-19: "make the antiChat see the screen on the left and know every
 *  info of X-ray"): everything the dashboard knows, as one deterministic markdown page the chat reads on
 *  every turn — the open tab and its digest first, then the verdict, the riskiest files, the hotspots by
 *  mass, the laws broken most, the movers, the architecture, the authors, the activity. Numbers, not
 *  prose; capped by the manifest. */
export function xrayBrief(tab: DashTab, d: DigestInput, sections: string[] = []): string {
  const L: string[] = [];
  const label = DASH_TABS.find((x) => x.key === tab)?.label ?? tab;
  const { intro, today } = digestFor(tab, d);
  L.push(`X-ray (the code analysis screen, LEFT of the chat) — open tab: ${label}`);
  if (sections.length) L.push(`sections on this tab, top to bottom: ${sections.join(" · ")}`);
  if (intro) L.push(`${label}: ${intro}`);
  for (const l of today) L.push(`today: ${l}`);
  const r = d.report; const pts = (d.arch?.points ?? []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at))); const last = pts[pts.length - 1];
  const health = r?.project?.health ?? last?.health ?? null; const risk = r?.project?.risk ?? last?.risk ?? null;
  const files = r?.counts?.files ?? last?.files ?? d.metrics?.length ?? null;
  if (files != null || health != null) L.push(`verdict: ${files ?? "?"} files · health ${health ?? "—"} · risk ${risk ?? "—"} · ${(r?.smells ?? []).length} smells · ${(r?.vulns ?? []).length} vulnerable deps · coverage ${d.cov?.total_pct != null ? `${Math.round(d.cov.total_pct)}%` : d.cov?.ran === false ? "not run" : "—"}${last?.cycles != null ? ` · ${last.cycles} import cycles` : ""}`);
  const top = (r?.top_risk ?? r?.scores?.top_risk ?? []).slice(0, 8);
  if (top.length) L.push(`riskiest files: ${top.map((f) => `${f.path} (risk ${Math.round(f.risk)}, health ${Math.round(f.health)})`).join("; ")}`);
  const heavy = (d.metrics ?? []).filter((m) => m.gravity != null).sort((a, b) => (b.gravity ?? 0) - (a.gravity ?? 0)).slice(0, 8);
  if (heavy.length) L.push(`heaviest files (mass = size·complexity·coupling): ${heavy.map((m) => `${m.path} (loc ${m.loc}, cx ${m.complexity ?? "?"}, in ${m.fan_in}/out ${m.fan_out}${m.covered ? "" : ", untested"})`).join("; ")}`);
  const hubs = (d.metrics ?? []).slice().sort((a, b) => b.fan_in - a.fan_in).slice(0, 5);
  if (hubs.length) L.push(`most depended-on: ${hubs.map((m) => `${m.path} (${m.fan_in} importers)`).join("; ")}`);
  const byLaw: any[] = d.laws?.by_law ?? [];
  if (byLaw.length) L.push(`laws broken most: ${byLaw.slice(0, 10).map((l) => `${l.law_key} ×${l.n}`).join(", ")}`);
  const smells = (r?.smells ?? []).slice(0, 6);
  if (smells.length) L.push(`smells: ${smells.map((s) => `${s.kind} [${s.severity}] ${s.detail}`.slice(0, 120)).join("; ")}`);
  const vulns = (r?.vulns ?? []).slice(0, 6);
  if (vulns.length) L.push(`vulnerable deps: ${vulns.map((v) => `${v.package}@${v.version} ${v.cve} [${v.severity}]${v.fixed_in ? ` → ${v.fixed_in}` : ""}`).join("; ")}`);
  const reg = (d.hist?.movers?.regressed ?? []).slice(0, 5); const imp = (d.hist?.movers?.improved ?? []).slice(0, 5);
  if (reg.length) L.push(`regressed since the previous snapshot: ${reg.map((m) => `${m.path} ${Math.round(m.from)}→${Math.round(m.to)}`).join(", ")}`);
  if (imp.length) L.push(`improved: ${imp.map((m) => `${m.path} ${Math.round(m.from)}→${Math.round(m.to)}`).join(", ")}`);
  if (d.hist?.snapshot_count) L.push(`review history: ${d.hist.snapshot_count} snapshots · ${d.hist.file_count} files judged${(d.hist.axes_drift ?? []).length ? ` · axis drift: ${d.hist.axes_drift.map((a) => `${a.axis} ${a.delta > 0 ? "+" : ""}${Math.round(a.delta)}`).join(", ")}` : ""}`);
  if (d.arch?.incident) L.push(`latest structural incident [${d.arch.incident.severity}] ${d.arch.incident.at}: ${d.arch.incident.summary}`.slice(0, 240));
  if (pts.length > 1) L.push(`health over time: ${pts.slice(-8).map((p) => `${String(p.at).slice(0, 10)} ${p.health ?? "—"}`).join(" → ")}`);
  const au = d.authors;
  if (au && (au.author_count || au.authors?.length)) L.push(`authors: ${au.author_count} over ${au.commit_count} commits${au.authors?.length ? ` · top ${au.authors.slice(0, 5).map((a) => `${a.name} (${a.commits} commits, ${a.files} files)`).join(", ")}` : ""}${au.bus_factor ? ` · bus factor: ${au.bus_factor.solo_files}/${au.bus_factor.total_files} files solo-owned` : ""}`);
  const cs = d.commits ?? [];
  if (cs.length) L.push(`activity: ${cs.length} commits in the window · latest: ${cs.slice(0, 5).map((c) => `${c.sha.slice(0, 7)} ${c.subject.slice(0, 60)} (${c.author}, ${String(c.date)})`).join("; ")}`);
  const covLow = (d.cov?.files ?? []).filter((f) => f.pct < 50).sort((a, b) => a.pct - b.pct).slice(0, 5);
  if (covLow.length) L.push(`least covered: ${covLow.map((f) => `${f.path} ${Math.round(f.pct)}%`).join(", ")}`);
  return L.join("\n");
}

// ── the pieces ──────────────────────────────────────────────────────────────────────────────────
const card: React.CSSProperties = { display: "flex", flexDirection: "column", minWidth: 0 };
/** An extra analysis the IDE hands the page — rendered as a section when scrolled into view. */
export type DashTab = "overview" | "code" | "design" | "hurt" | "breaks" | "happened" | "ultra";
// "code" is the IDE's own tab (the tree + the file stage, operator 2026-09-18: "the file tree is also a tab called Code")
// ULTRA REVIEW IS "SOON" UNTIL IT IS FIXED (operator 2026-10-11: first "hide it", then, better: "replace the page for a soon, keep the button, make the whole page there but blurred"). The tab stays and
// opens the page behind a blur (`SoonBlur`); the dev build opens it for real. `isSoon` is the one place that says which tabs are not ready.
export const SOON_TABS: DashTab[] = ["ultra"];
export function isSoon(tab: DashTab, dev: boolean): boolean { return !dev && SOON_TABS.includes(tab); }
export const DASH_TABS: { key: DashTab; label: string }[] = [{ key: "overview", label: "Overview" }, { key: "code", label: "Code" }, { key: "design", label: "Design" }, { key: "hurt", label: "Quality" }, { key: "breaks", label: "Architecture" }, { key: "happened", label: "History" }, { key: "ultra", label: "Ultra review" }];
export type ExtraSection = { key: string; title: string; sub?: string; open?: OpenKey; node: () => React.ReactNode; height?: number; tab: DashTab; wide?: boolean; eager?: boolean };
const nums: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };
const openBtn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 };

function Tile({ label, value, delta, trend, color, hero, note, testId }: { label: string; value: string; delta?: { text: string; dir: "up" | "down" | "flat" } | null; trend?: (number | null)[]; color?: string; hero?: boolean; note?: string; testId?: string }) {
  const dcol = !delta ? C.dim : delta.dir === "up" ? C.ok : delta.dir === "down" ? C.bad : C.muted;
  const spark = trend && trend.filter((v) => v != null).length >= 2;
  return (
    <div data-testid={testId} style={{ ...card, padding: "2px 12px 2px 0", gap: 3, justifyContent: "center", borderRight: `1px solid ${C.border}` }}>
      <div style={{ fontFamily: nav, fontSize: 10.5, color: C.muted }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
        <span style={{ fontFamily: nav, fontSize: hero ? 26 : 20, fontWeight: 600, lineHeight: 1, color: color ?? C.fg, ...nums }}>{value}</span>
        {spark && (
          <svg width="96" height="24" viewBox="0 0 96 24" aria-hidden style={{ overflow: "visible", marginBottom: 2 }}>
            <path d={sparkPath(trend!)} fill="none" stroke={C.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {(() => { const last = trend!.slice(-12); const v = last[last.length - 1]; return v == null ? null : <circle cx={96} cy={24 - (Math.max(0, Math.min(100, v)) / 100) * 24} r="3" fill={color ?? C.brand} />; })()}
          </svg>
        )}
      </div>
      {delta ? <div style={{ fontFamily: mono, fontSize: 9.5, color: dcol }}>{delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "•"} {delta.text}</div> : note ? <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{note}</div> : null}
    </div>
  );
}
function Panel({ id, t, s, right, children, style, flat, context }: { id: string; t: string; s?: string; right?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties; flat?: boolean; context?: () => string }) {
  const body = React.useRef<HTMLDivElement | null>(null);
  // DRAG TO THE CHAT: the section, by its grip — what it shows travels as text (operator 2026-09-18)
  const onDragStart = (e: React.DragEvent) => startContextDrag(e, { title: s ? `${t} — ${s}` : t, text: context ? context() : textOf(body.current), kind: id });
  return (
    <section id={`repo-${id}`} data-testid={`repo-panel-${id}`} style={{ ...card, paddingTop: flat ? 0 : 10, borderTop: flat ? "none" : `1px solid ${C.border}`, ...style }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 0 6px" }}>
        <span data-testid={`repo-grip-${id}`} draggable onDragStart={onDragStart} title="drag this section into a chat as context" style={{ cursor: "grab", color: C.dim, display: "inline-flex", alignSelf: "center" }}><GripVertical size={12} /></span>
        <span style={{ fontFamily: nav, fontSize: 12.5, fontWeight: 700, color: C.fg, whiteSpace: "nowrap" }}>{t}</span>{s && <span style={{ fontFamily: nav, fontSize: 10.5, color: C.muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{s}</span>}{!s && <span style={{ flex: 1 }} />}
        {right}
      </div>
      <div ref={body} style={{ minWidth: 0 }}>{children}</div>
    </section>
  );
}
/** Renders its child once scrolled near the viewport (the heavy panels), immediately where there is no observer (jsdom). */
function Lazy({ height, children }: { height: number; children: () => React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [on, setOn] = React.useState(typeof IntersectionObserver === "undefined");
  React.useEffect(() => {
    const el = ref.current; if (!el || on) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setOn(true); io.disconnect(); } }, { rootMargin: "400px 0px" });
    io.observe(el); return () => io.disconnect();
  }, [on]);
  return <div ref={ref} data-testid="repo-lazy" data-on={on ? "1" : "0"} style={{ minHeight: on ? undefined : height }}>{on ? children() : null}</div>;
}
const Open = ({ k, onOpen, label = "⤢" }: { k: OpenKey; onOpen: (k: OpenKey) => void; label?: string }) => <button onClick={() => onOpen(k)} style={openBtn} title="the full analysis">{label}</button>;
const two: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20, alignItems: "start" };
const lensLab: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim, padding: "4px 0 4px" };
/** The two blocks that open every dashboard: the intro with its numbers · TODAY. Draggable as one context. */
function TabIntro({ tab, d }: { tab: DashTab; d: DigestInput }) {
  const { intro, today } = digestFor(tab, d);
  if (!intro) return null;
  const label = DASH_TABS.find((x) => x.key === tab)?.label ?? tab;
  return (
    <div data-testid={`tab-intro-${tab}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 20, padding: "8px 0 10px", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontFamily: nav, fontSize: 12, color: C.muted, lineHeight: 1.55, display: "flex", gap: 8 }}>
        <span draggable onDragStart={(e) => startContextDrag(e, { title: `${label} — today`, text: `${intro}\n\nToday:\n${today.map((l) => `- ${l}`).join("\n")}`, kind: "digest" })} title="drag the intro + today into a chat as context" style={{ cursor: "grab", color: C.dim, display: "inline-flex", alignSelf: "flex-start", marginTop: 2 }}><GripVertical size={12} /></span>
        <span><span style={{ color: C.fg, fontWeight: 700 }}>{label}. </span>{intro}</span>
      </div>
      <div>
        <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim, marginBottom: 3 }}>today</div>
        <ul data-testid={`tab-today-${tab}`} style={{ margin: 0, paddingLeft: 14, fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{today.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </div>
    </div>
  );
}
const Note = ({ text }: { text: string }) => <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, padding: "18px 0", textAlign: "center" }}>{text}</div>;

/** Health + risk per snapshot: an area for health, a line for risk — one axis (both 0–100), a crosshair tooltip. */
function OverTime({ points, width }: { points: { at: string; health: number | null; risk: number | null; files: number | null }[]; width: number }) {
  const [hi, setHi] = React.useState<number | null>(null);
  const W = Math.max(320, width), H = 140, PL = 30, PR = 8, PT = 10, PB = 20;
  const plotW = W - PL - PR, plotH = H - PT - PB;
  const n = points.length;
  const x = (i: number) => PL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PT + (1 - Math.max(0, Math.min(100, v)) / 100) * plotH;
  const path = (key: "health" | "risk") => { let d = ""; let pen = false; points.forEach((p, i) => { const v = p[key]; if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; }); return d; };
  const area = (() => { const idx = points.map((p, i) => (p.health == null ? null : i)).filter((i): i is number => i != null); if (!idx.length) return ""; return `M${x(idx[0]).toFixed(1)},${(PT + plotH).toFixed(1)} ` + idx.map((i) => `L${x(i).toFixed(1)},${y(points[i].health!).toFixed(1)}`).join(" ") + ` L${x(idx[idx.length - 1]).toFixed(1)},${(PT + plotH).toFixed(1)} Z`; })();
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); const px = e.clientX - r.left; let best = 0; for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; setHi(best); };
  const tip = hi != null ? points[hi] : null;
  return (
    <div style={{ position: "relative" }}>
      <svg data-testid="over-time" width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "visible" }} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke={C.border} strokeDasharray="2 4" /><text x={PL - 6} y={y(v) + 3} textAnchor="end" style={{ fontFamily: mono, fontSize: 8.5, fill: C.dim }}>{v}</text></g>)}
        <path d={area} fill={C.brand} opacity={0.16} />
        <path d={path("health")} fill="none" stroke={C.brand} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={path("risk")} fill="none" stroke={C.muted} strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (i === 0 || i === n - 1 || i % Math.max(1, Math.ceil(n / 6)) === 0) && <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} style={{ fontFamily: mono, fontSize: 8.5, fill: C.dim }}>{String(p.at).slice(5, 10)}</text>)}
        {hi != null && <g><line x1={x(hi)} x2={x(hi)} y1={PT} y2={PT + plotH} stroke={C.fg} opacity={0.35} />{points[hi].health != null && <circle cx={x(hi)} cy={y(points[hi].health!)} r="4" fill={C.brand} stroke={C.panel} strokeWidth="2" />}{points[hi].risk != null && <circle cx={x(hi)} cy={y(points[hi].risk!)} r="4" fill={C.muted} stroke={C.panel} strokeWidth="2" />}</g>}
      </svg>
      {tip && <div data-testid="over-time-tip" style={{ position: "absolute", left: Math.min(W - 170, x(hi!) + 10), top: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 9px", fontFamily: mono, fontSize: 10, color: C.muted, pointerEvents: "none", boxShadow: "0 8px 20px rgba(0,0,0,.3)" }}>
        <div style={{ color: C.fg, marginBottom: 2 }}>{String(tip.at).slice(0, 16)}</div>
        <div><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 8, background: C.brand, marginRight: 6 }} />health <b style={{ color: C.fg }}>{tip.health == null ? "—" : Math.round(tip.health)}</b></div>
        <div><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 8, background: C.muted, marginRight: 6 }} />risk <b style={{ color: C.fg }}>{tip.risk == null ? "—" : Math.round(tip.risk)}</b>{tip.files != null && <span> · {tip.files} files</span>}</div>
      </div>}
      <div style={{ display: "flex", gap: 14, fontFamily: mono, fontSize: 9.5, color: C.muted, marginTop: 4 }}><span><span style={{ display: "inline-block", width: 10, height: 3, background: C.brand, verticalAlign: "middle", marginRight: 5 }} />health</span><span><span style={{ display: "inline-block", width: 10, height: 0, borderTop: `2px dashed ${C.muted}`, verticalAlign: "middle", marginRight: 5 }} />risk</span></div>
    </div>
  );
}

/** The codebase map: every file a box, area = mass, color = health. Hover names the file and why. */
function Treemap({ metrics, width, height, onOpen }: { metrics: FileMetric[]; width: number; height: number; onOpen: (p: string) => void }) {
  const [hover, setHover] = React.useState<FileMetric | null>(null);
  const boxes = React.useMemo(() => squarify(metrics, 0, 0, Math.max(320, width), height), [metrics, width, height]);
  return (
    <div style={{ position: "relative" }}>
      <svg data-testid="repo-treemap" width={Math.max(320, width)} height={height} style={{ display: "block", borderRadius: 8, background: C.bg }}>
        {boxes.map((b) => (
          <g key={b.m.path} onMouseEnter={() => setHover(b.m)} onMouseLeave={() => setHover(null)} onClick={() => onOpen(b.m.path)} style={{ cursor: "pointer" }}>
            <rect x={b.x + 1} y={b.y + 1} width={Math.max(0, b.w - 2)} height={Math.max(0, b.h - 2)} rx={2} fill={heat(b.m.badness ?? 0)} opacity={hover && hover.path !== b.m.path ? 0.55 : 0.92} stroke={hover?.path === b.m.path ? C.fg : "none"} strokeWidth={1.5} />
            {b.w > 56 && b.h > 16 && <text x={b.x + 5} y={b.y + 12} style={{ fontFamily: mono, fontSize: 9, fill: "#fff", opacity: 0.92, pointerEvents: "none" }}>{b.m.path.split("/").pop()!.slice(0, Math.floor(b.w / 6))}</text>}
          </g>
        ))}
      </svg>
      <div style={{ minHeight: 18, marginTop: 6, fontFamily: mono, fontSize: 10, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {hover ? <><span style={{ color: C.fg }}>{hover.path}</span> · box health <b style={{ color: tone(100 - (hover.badness ?? 0) * 100) }}>{Math.round(100 - (hover.badness ?? 0) * 100)}</b> · {partWhy(hover)}</> : "area = mass (size · complexity · coupling) · color = this file's own health, relative to the rest of the project (not the verdict's number) · hover a box · click opens the file"}
      </div>
    </div>
  );
}

/** Commits per day over the past year. */
function Calendar({ dates, width }: { dates: string[]; width: number }) {
  const cal = React.useMemo(() => calendar(dates), [dates]);
  const cell = Math.max(6, Math.min(10, Math.floor((width - 30) / 53) - 2)); const gap = 2;
  const H = 7 * (cell + gap) + 14;
  const [tip, setTip] = React.useState<{ date: string; n: number } | null>(null);
  return (
    <div>
      <svg data-testid="repo-calendar" width={53 * (cell + gap) + 30} height={H} style={{ display: "block" }}>
        {cal.months.map((m) => <text key={`${m.week}-${m.label}`} x={30 + m.week * (cell + gap)} y={9} style={{ fontFamily: mono, fontSize: 8.5, fill: C.dim }}>{m.label}</text>)}
        {["Mon", "Wed", "Fri"].map((d, i) => <text key={d} x={0} y={14 + (1 + i * 2) * (cell + gap) + cell - 2} style={{ fontFamily: mono, fontSize: 8.5, fill: C.dim }}>{d}</text>)}
        {cal.cells.map((c) => { const t = cal.max ? c.n / cal.max : 0; return (
          <rect key={c.date} x={30 + c.week * (cell + gap)} y={14 + c.day * (cell + gap)} width={cell} height={cell} rx={2} fill={c.n === 0 ? C.border : C.brand} opacity={c.n === 0 ? 0.55 : 0.3 + t * 0.7} onMouseEnter={() => setTip({ date: c.date, n: c.n })} onMouseLeave={() => setTip(null)} />
        ); })}
      </svg>
      <div style={{ marginTop: 6, fontFamily: mono, fontSize: 10, color: C.dim }}>{tip ? <><span style={{ color: C.fg }}>{tip.date}</span> · {tip.n} commit{tip.n === 1 ? "" : "s"}</> : `${dates.length} commits in the window · darker = more`}</div>
    </div>
  );
}

function Bars({ rows, color, testId, onPick }: { rows: { label: string; value: number; sub?: string; color?: string }[]; color: string; testId?: string; onPick?: (label: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div data-testid={testId} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {rows.map((r) => (
        <div key={r.label} onClick={() => onPick?.(r.label)} title={r.label} style={{ display: "grid", gridTemplateColumns: "minmax(0, 120px) 1fr auto", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 10, color: C.muted, cursor: onPick ? "pointer" : "default" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.fg }}>{r.label}</span>
          <span style={{ height: 7, borderRadius: 3, background: `color-mix(in oklab, ${r.color ?? color} 14%, transparent)`, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(r.value / max) * 100}%`, background: r.color ?? color, borderRadius: 3 }} /></span>
          <span style={{ ...nums, color: C.fg, minWidth: 34, textAlign: "right" }}>{r.sub ?? compact(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T | null>(null); const [w, setW] = React.useState(900);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    setW(el.clientWidth || 900);
    if (typeof ResizeObserver === "undefined") return; // jsdom
    const ro = new ResizeObserver(() => setW(el.clientWidth || 900)); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function RepoDashboard({ onOpen, onOpenFile, onRebuild, rebuildNode, extra = [], tab: tabProp, onTab, chrome = true }: { onOpen: (k: OpenKey) => void; onOpenFile: (path: string) => void; onRebuild?: () => void; rebuildNode?: React.ReactNode; extra?: ExtraSection[]; tab?: DashTab; onTab?: (t: DashTab) => void; chrome?: boolean }) {
  // THE TABS (operator 2026-09-18: "the dashboard got giant — divide by tabs"): one dashboard per
  // question; the KPI strip rides every tab. Controlled by the IDE's rail when it hands `tab` in.
  const [tabSelf, setTabSelf] = React.useState<DashTab>(() => { try { return (localStorage.getItem("antiloki:ide-dash-tab") as DashTab) || "overview"; } catch { return "overview"; } });
  const tab = tabProp ?? tabSelf;
  const setTab = (k: DashTab) => { setTabSelf(k); onTab?.(k); try { localStorage.setItem("antiloki:ide-dash-tab", k); } catch { /* fine */ } };
  const [report, setReport] = React.useState<ProjectReport | null | undefined>(undefined);
  const [hist, setHist] = React.useState<ReviewHistory | null>(null);
  const [arch, setArch] = React.useState<CodeHistory | null>(null);
  const [laws, setLaws] = React.useState<any | null>(null);
  const [cov, setCov] = React.useState<Coverage | null>(null);
  const [authors, setAuthors] = React.useState<Authors | null>(null);
  const [metrics, setMetrics] = React.useState<FileMetric[] | null>(null);
  const [git, setGit] = React.useState<{ commits: Commit[]; branch: string | null } | null | undefined>(undefined);
  const [covMap, setCovMap] = React.useState<Map<string, number> | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  React.useEffect(() => {
    let alive = true;
    void latestReport().then((r) => { if (alive) setReport(r); }).catch(() => { /* keep "loading…" — a failed read is not "no analysis" */ });
    void reviewHistoryGet({ limit: 24, top: 6 }).then((r) => { if (alive) setHist(r); }).catch(() => {});
    void historyGet({ limit: 40 }).then((r) => { if (alive) setArch(r); }).catch(() => {});
    void constitutionReport().then((r) => { if (alive) setLaws(r); });
    void coverageGet().then((r) => { if (!alive) return; setCov(r); const m = new Map<string, number>(); for (const f of r?.files ?? []) m.set(String(f.path).replace(/\\/g, "/"), f.pct); setCovMap(m); }).catch(() => {});
    void authorsGet({ top_authors: 6 }).then((r) => { if (alive) setAuthors(r); }).catch(() => {});
    void getMetrics().then((r) => { if (!alive || !r) return; setMetrics(Object.entries(r.metrics_by_file ?? {}).map(([path, m]) => ({ path, ...(m as Omit<FileMetric, "path">) })).filter((m) => !m.is_test && (m.gravity ?? 0) > 0).sort((a, b) => (b.gravity ?? 0) - (a.gravity ?? 0)).slice(0, 600)); }).catch(() => {});
    void gitCommits().then((c) => { if (alive) setGit(c); });
    return () => { alive = false; };
  }, []);
  // THE CHAT SEES THIS SCREEN: publish the brief whenever the tab or the data changes; clear on unmount
  React.useEffect(() => {
    const d: DigestInput = { report, hist, arch, laws, cov, authors, commits: git?.commits ?? (git === null ? null : undefined), metrics };
    reportScreenPage("xray", xrayBrief(tab, d, extra.filter((x) => x.tab === tab).map((x) => x.title)));
  }, [tab, report, hist, arch, laws, cov, authors, git, metrics, extra]);
  React.useEffect(() => () => clearScreenState("xray"), []);
  const health = report?.project?.health ?? null; const risk = report?.project?.risk ?? null;
  const points = (arch?.points ?? []).slice().reverse().map((p) => ({ at: p.at, health: p.health, risk: p.risk, files: p.files }));
  const healthSeries = points.map((p) => p.health);
  const vulns = report?.vulns ?? []; const smells = report?.smells ?? [];
  const byLaw: any[] = (laws?.by_law ?? []).slice(0, 8);
  const bus = authors?.bus_factor ?? null;
  const covPcts = (cov?.files ?? []).map((f: any) => Number(f.pct) || 0);
  const inner = Math.max(320, width - 32);
  const half = Math.max(300, (inner - 20) / 2);
  return (
    <div ref={ref} data-testid="repo-dashboard" style={{ padding: "10px 16px 32px", display: "flex", flexDirection: "column", gap: 10, background: C.bg, minHeight: "100%" }}>
      {/* THE VERDICT — a mini row: icons and numbers only (operator 2026-09-18), draggable as one context */}
      {tab === "overview" && (() => {
        const items: { icon: React.ReactNode; v: string; color?: string; tip: string }[] = [
          { icon: <HeartPulse size={13} />, v: health == null ? "—" : `${Math.round(health)}`, color: tone(health), tip: `health ${health == null ? "—" : Math.round(health)}${deltaText(healthSeries) ? ` · ${deltaText(healthSeries)!.text}` : ""} — structural health: how much code many files depend on, how complex it is, and how much no test reaches (hub files weigh most). It is not the law score of the Quality tab, and not one box's colour on the map.` },
          { icon: <TriangleAlert size={13} />, v: risk == null ? "—" : `${Math.round(risk)}`, color: risk == null ? undefined : risk >= 60 ? C.bad : risk >= 30 ? C.warn : C.ok, tip: "risk — how likely the next change breaks something" },
          { icon: <Files size={13} />, v: compact(report?.counts?.files ?? hist?.file_count ?? metrics?.length ?? null), tip: `files judged (source files; tests are not counted here, so the History totals can be higher)${smells.length ? ` · ${smells.length} smells, ${smells.filter((s) => s.severity === "high").length} high` : ""}` },
          { icon: <FlaskConical size={13} />, v: cov?.total_pct == null ? "—" : `${Math.round(cov.total_pct)}%`, color: cov?.total_pct == null ? undefined : tone(cov.total_pct), tip: cov?.ran ? "test coverage — executed lines" : "test coverage — run the suite to measure" },
          { icon: <UserRound size={13} />, v: bus ? `${Math.round((bus.solo_files / Math.max(1, bus.total_files)) * 100)}%` : "—", color: bus && bus.solo_files / Math.max(1, bus.total_files) > 0.5 ? C.warn : undefined, tip: bus ? `solo-owned files — ${bus.solo_files} of ${bus.total_files} have one author` : "solo-owned files" },
          { icon: <ShieldAlert size={13} />, v: report ? `${vulns.length}` : "—", color: vulns.length ? C.bad : undefined, tip: vulns.length ? `vulnerable dependencies — ${vulns.filter((v: any) => v.severity === "critical" || v.severity === "high").length} critical/high` : "vulnerable dependencies (OSV scan)" },
        ];
        const text = items.map((x) => `${x.tip}: ${x.v}`).join("\n");
        return (
          <div id="repo-verdict" data-testid="repo-verdict" style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: mono, fontSize: 11, color: C.dim, padding: "2px 0 6px", borderBottom: `1px solid ${C.border}` }}>
            <span draggable onDragStart={(e) => startContextDrag(e, { title: "The verdict", text, kind: "verdict" })} title="drag the verdict into a chat as context" style={{ cursor: "grab", color: C.dim, display: "inline-flex" }}><GripVertical size={12} /></span>
            <span style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.muted }}>verdict</span>
            {items.map((x, i) => <span key={i} title={x.tip} data-testid={i === 0 ? "kpi-health" : i === 1 ? "kpi-risk" : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: x.color ?? C.fg }}>{x.icon}<b style={{ ...nums, fontWeight: 600 }}>{x.v}</b></span>)}
            <span style={{ fontSize: 9.5, color: C.dim }}>{report?.created_at ? `· ${String(report.created_at).slice(0, 16)}` : report === null ? "· no analysis yet — rebuild" : ""}{hist?.snapshot_count ? ` · ${hist.snapshot_count} snapshots` : ""}</span>
            <span style={{ flex: 1 }} />
            {onRebuild && <button onClick={onRebuild} style={openBtn} title="re-index the workspace and judge it again">↻ rebuild</button>}
          </div>
        );
      })()}
      {/* the tab bar — the IDE renders its own when chrome is off */}
      {chrome && <div data-testid="dash-tabs" style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.border}` }}>
        {DASH_TABS.map((x) => { const on = tab === x.key; return (
          <button key={x.key} data-testid={`dash-tab-${x.key}`} onClick={() => setTab(x.key)} style={{ background: "transparent", border: "none", borderBottom: `2px solid ${on ? C.brand : "transparent"}`, color: on ? C.fg : C.muted, padding: "6px 12px", cursor: "pointer", fontFamily: nav, fontSize: 12, fontWeight: on ? 700 : 500 }}>{x.label}{isSoon(x.key, devOnly()) && <sup data-testid={`dash-soon-${x.key}`} style={{ marginLeft: 4, fontSize: 8, letterSpacing: .5, textTransform: "uppercase", color: C.warn }}>soon</sup>}</button>
        ); })}
      </div>}
      {/* FIRST RUN (2026-09-18): nothing judged yet → say so once, with the one button that fixes it */}
      {tab === "overview" && report === null && !metrics?.length && (
        <div data-testid="repo-first-run" style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: "16px 18px", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: nav, fontSize: 13, fontWeight: 700, color: C.fg }}>This repository has not been analyzed yet</div>
            <div style={{ fontFamily: nav, fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>One rebuild indexes the code, judges every file against the constitution and draws the map — a few minutes on a large repo, deterministic, no model call. The dashboard fills in as the phases finish.</div>
          </div>
          {rebuildNode ?? (onRebuild && <button onClick={onRebuild} style={{ ...openBtn, color: C.brand, borderColor: C.brand, padding: "8px 14px", fontSize: 11 }}>↻ analyze this repository</button>)}
        </div>
      )}
      <TabIntro tab={tab} d={{ report, hist, arch, laws, cov, authors, commits: git?.commits ?? (git === null ? null : undefined), metrics }} />
      {tab === "overview" && (<>
        <div style={two}>
          <Panel flat id="over-time" t="Health over time" s="health and risk per snapshot" right={<Open k="history" onOpen={onOpen} />}>
            {points.length >= 2 ? <OverTime points={points} width={half} /> : <Note text={points.length === 1 ? "one snapshot so far — the next rebuild starts the line" : arch === null ? "no snapshots yet — rebuild the atlas" : "loading…"} />}
          </Panel>
          <Panel flat id="hotspots" t="Hotspots" right={<Open k="insights" onOpen={onOpen} />}>
            {metrics?.length ? <HeatScatter metrics={metrics.slice(0, 300)} width={half} height={150} onOpen={onOpenFile} /> : <Note text="no metrics yet" />}
          </Panel>
        </div>
        {/* THE CODEBASE — all the gravity lenses at once (operator 2026-09-18: "the overview codebase should have all gravity maps") */}
        <Panel id="map" t="The codebase" s="every file is a box · area = mass (size · complexity · coupling) · the five lenses of the gravity map" right={<Open k="gravity" onOpen={onOpen} />}>
          {!metrics?.length ? <Note text={metrics === null ? "loading…" : "no metrics yet — rebuild the atlas"} /> : (
            <div style={two}>
              <div><div style={lensLab}>health</div><Treemap metrics={metrics} width={half} height={190} onOpen={onOpenFile} /></div>
              <div><div style={lensLab}>cascade — the blast-radius liquidation map</div><CascadeLiquidationMap metrics={metrics} width={half} onOpen={onOpenFile} /></div>
              <div><div style={lensLab}>ownership — distinct recent authors</div><OwnershipBubbles metrics={metrics} width={half} onOpen={onOpenFile} /></div>
              <div><div style={lensLab}>debt — TODO / HACK / unused markers</div><DebtBars metrics={metrics} width={half} onOpen={onOpenFile} /></div>
              <div style={{ gridColumn: "1 / -1" }}><div style={lensLab}>runtime — coverage sunburst (folder → file)</div>{covMap && covMap.size ? <CoverageSunburst metrics={metrics} cov={covMap} width={inner} onOpen={onOpenFile} /> : <Note text="no coverage report yet — run the suite with lcov" />}</div>
            </div>
          )}
        </Panel>
        {/* ACTIVITY — the calendar, the git history, the authors (operator 2026-09-18) */}
        <Panel id="activity" t="Activity" s={git?.branch ? `on ${git.branch}` : "commits · history · authors"} right={<Open k="gitgraph" onOpen={onOpen} />}>
          {git === undefined ? <Note text="loading…" /> : git === null ? <Note text="not a git repository" /> : (
            <div style={two}>
              <div style={{ gridColumn: "1 / -1" }}><Calendar dates={git.commits.map(commitDay)} width={inner} /></div>
              <div>
                <div style={lensLab}>recent commits</div>
                <div data-testid="repo-commits" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {git.commits.slice(0, 8).map((c) => (
                    <div key={c.sha} style={{ display: "grid", gridTemplateColumns: "56px 1fr auto", gap: 8, fontFamily: mono, fontSize: 10, color: C.muted, alignItems: "baseline" }}>
                      <span style={{ color: C.brand }}>{String(c.sha).slice(0, 7)}</span>
                      <span style={{ color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject}</span>
                      <span style={{ color: C.dim, whiteSpace: "nowrap" }}>{c.author} · {c.at ? String(c.at).slice(0, 10) : c.date}</span>
                    </div>
                  ))}
                  {!git.commits.length && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>no commits yet</span>}
                </div>
              </div>
              <div>
                <div style={lensLab}>authors{bus ? ` · bus factor ${bus.solo_files}/${bus.total_files} solo-owned` : ""}</div>
                {authors?.authors?.length ? <Bars testId="repo-authors" color={C.muted} rows={authors.authors.slice(0, 6).map((a) => ({ label: a.name, value: a.commits, sub: `${compact(a.commits)} · ${a.files} files` }))} /> : <Note text={authors?.error ?? "loading…"} />}
              </div>
            </div>
          )}
        </Panel>
        {(hist?.movers?.regressed?.length || hist?.movers?.improved?.length) ? (
          <Panel id="movers" t="Movers since the previous snapshot" s="files whose health moved the most" right={<Open k="review" onOpen={onOpen} />}>
            <div data-testid="repo-movers" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Bars color={C.bad} rows={(hist?.movers?.regressed ?? []).slice(0, 5).map((m) => ({ label: m.path.split("/").slice(-2).join("/"), value: Math.abs(m.delta), sub: `${Math.round(m.from)} → ${Math.round(m.to)}` }))} onPick={(l) => { const m = hist?.movers?.regressed?.find((x) => x.path.endsWith(l)); if (m) onOpenFile(m.path); }} />
              <Bars color={C.ok} rows={(hist?.movers?.improved ?? []).slice(0, 5).map((m) => ({ label: m.path.split("/").slice(-2).join("/"), value: Math.abs(m.delta), sub: `${Math.round(m.from)} → ${Math.round(m.to)}` }))} onPick={(l) => { const m = hist?.movers?.improved?.find((x) => x.path.endsWith(l)); if (m) onOpenFile(m.path); }} />
            </div>
          </Panel>
        ) : null}
      </>)}
      {/* the QA switchboard first (the IDE hands it as the `rules` section) — the charts read against it */}
      {/* EAGER sections (the front door of a tab — the rules, the ultra review) render at once, never lazily */}
      {extra.filter((x) => x.tab === tab && x.eager).map((x) => (
        <Panel key={x.key} id={x.key} t={x.title} s={x.sub} flat>{x.node()}</Panel>
      ))}
      {tab === "hurt" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 20 }}>
          <Panel flat id="laws" t="Laws broken most" s="mass = violations weighted by the law" right={<Open k="constitution" onOpen={onOpen} />}>
            {byLaw.length ? <Bars testId="repo-laws" color={C.brand} rows={byLaw.map((l) => ({ label: l.law_key, value: Number(l.mass) || 0, sub: `${l.n}` }))} /> : <Note text={laws === null ? "loading…" : "no constitution snapshot yet — rebuild the atlas"} />}
            {laws?.deltas?.health != null && <div style={{ fontFamily: mono, fontSize: 9.5, color: laws.deltas.health < 0 ? C.bad : C.ok, marginTop: 8 }}>health {laws.deltas.health > 0 ? "▲ +" : "▼ "}{Math.round(laws.deltas.health)} since snapshot #{laws.deltas.from_snapshot ?? "?"}</div>}
          </Panel>
          <Panel flat id="coverage" t="Coverage distribution" s={cov?.ran ? `files by executed-line coverage · ${cov.cmd ?? ""}` : "files by coverage"} right={<Open k="coverage" onOpen={onOpen} />}>
            {covPcts.length ? <Bars testId="repo-coverage" color={C.ok} rows={coverageBuckets(covPcts).map((b, i) => ({ ...b, value: b.n, label: b.label, color: [C.bad, C.warn, C.warn, C.ok, C.ok][i] }))} /> : <Note text={cov?.error ?? cov?.run_error ?? "no coverage yet — open ⤢ to run the suite"} />}
          </Panel>
        </div>
      )}
      {/* every other analysis, as sections of its tab — two columns, rendered when scrolled to; a `wide` one spans both */}
      {extra.some((x) => x.tab === tab && !x.eager) && (
        <div style={two}>
          {extra.filter((x) => x.tab === tab && !x.eager).map((x, i) => (
            <Panel key={x.key} id={x.key} t={x.title} s={x.sub} flat={i < 2 && (tab === "breaks" || tab === "happened")} style={x.wide ? { gridColumn: "1 / -1" } : undefined} right={x.open ? <Open k={x.open} onOpen={onOpen} /> : undefined}>
              <Lazy height={x.height ?? 260}>{x.node}</Lazy>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
