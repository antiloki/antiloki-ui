// THE AGENTS TIMELINE (operator 2026-09-17: "timeline is all the agents' audit stack trace"). One
// merged, newest-first trace across every code-agent pane in the open cockpit sessions: reads,
// writes (with sha), refused writes, shell commands, and the goal-run events (start · pass · reject ·
// join). Rendered like a stack trace — time · agent · op · target — in a ghost panel on the right.
import React from "react";
import { createPortal } from "react-dom";
import { C, mono } from "@/loki/theme";
import { History } from "lucide-react";
import { popoverStyle } from "@/loki/cockpit/fuel-mini";
import { apiGet, apiPost } from "@/loki/api/client";
import { fetchAudit, type AuditEvent } from "./context-pack";
import { listGoalRuns, type GoalRun } from "./subagents";
import { CLI_KINDS } from "./agent-close";
import { paneDisplay } from "./types";

const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;
export type TimelineFrame = { t: number; agent: string; glyph: string; op: string; text: string; tone: "ok" | "warn" | "bad" | "dim" | "fg"; open?: () => void };
/** An instrument (a generated widget / artefact) as a timeline node the operator can open. */
export type Instrument = { t: number; label: string; kind: string; open: () => void };

const tsMs = (s: any): number => { const v = Date.parse(String(s ?? "")); return Number.isFinite(v) ? v : 0; };

// OPERATOR EVENTS on the same timeline (operator 2026-09-17: a widget opened from the sidebar shows
// "just on the timeline", not as a tile in the chat): a tiny in-memory feed the shell notes into.
const NOTES: TimelineFrame[] = [];
const noteListeners = new Set<() => void>();
export function noteTimeline(op: string, text: string, tone: TimelineFrame["tone"] = "fg", glyph = "◆") {
  NOTES.unshift({ t: Date.now(), agent: "you", glyph, op, text, tone });
  if (NOTES.length > 100) NOTES.length = 100;
  for (const l of noteListeners) l();
}
export const readNotes = () => NOTES.slice();
export function subscribeNotes(l: () => void) { noteListeners.add(l); return () => { noteListeners.delete(l); }; }

// WHAT THE ROWS MEAN (operator 2026-09-19: "I'm seeing some logs there, which is nice, but I don't
// understand what they mean"): every op has one plain sentence — shown as a legend in the window and
// as the tooltip of each row. The op word stays short; the meaning is one hover away.
export const OP_LEGEND: { op: string; glyph: string; means: string }[] = [
  { op: "read", glyph: "·", means: "the agent opened a source file to reason about it" },
  { op: "pack", glyph: "·", means: "the agent read its context pack (the notes antiloki wrote for it)" },
  { op: "grep", glyph: "?", means: "the agent searched the code for a pattern" },
  { op: "wrote", glyph: "✎", means: "the agent changed a file — the sha is the content it left; click to review" },
  { op: "refused", glyph: "⛔", means: "the agent tried to write outside its scope; antiloki's hook blocked it" },
  { op: "ran", glyph: "$", means: "the agent ran a shell command" },
  { op: "goal", glyph: "⋔", means: "a goal run: start · pass · reject · join — the delegated tasks and their verdicts" },
  { op: "opened", glyph: "◆", means: "you opened a widget, a file or a capture" },
  { op: "saved", glyph: "◆", means: "you saved something — a snapshot, a frame, an artefact" },
  { op: "widget", glyph: "▤", means: "a widget generated on this thread — click to open it" },
  { op: "artefact", glyph: "▤", means: "an artefact produced on this thread — click to open it" },
];
/** One plain sentence for a frame — "Claude #1 wrote src/a.ts · 3f2a — the agent changed a file …". Pure. */
export function describeFrame(f: TimelineFrame): string {
  const key = f.op.startsWith("goal#") ? "goal" : f.op;
  const l = OP_LEGEND.find((x) => x.op === key);
  const who = f.agent === "you" ? "you" : f.agent;
  return `${who} ${f.op} ${f.text}`.trim() + (l ? ` — ${l.means}` : "");
}

/** THE AGENTS' HISTORY (operator 2026-09-19: "the audits should be grouped on the timeline as agents
 *  history, each agent, on click expands"): the frames per agent, newest first, with the counts that
 *  summarise what the agent did — reads · writes · refused · shell · goals. Pure, tested. */
export type AgentHistory = { agent: string; frames: TimelineFrame[]; last: number; counts: { reads: number; writes: number; refused: number; ran: number; goals: number; other: number }; worst: TimelineFrame["tone"] };
export function groupByAgent(frames: TimelineFrame[]): AgentHistory[] {
  const by = new Map<string, TimelineFrame[]>();
  for (const f of frames) { const arr = by.get(f.agent) ?? []; arr.push(f); by.set(f.agent, arr); }
  const rank = { bad: 3, warn: 2, ok: 1, fg: 0, dim: 0 } as const;
  return [...by.entries()].map(([agent, fs]) => {
    const sorted = [...fs].sort((a, b) => b.t - a.t);
    const counts = { reads: 0, writes: 0, refused: 0, ran: 0, goals: 0, other: 0 };
    for (const f of sorted) {
      if (f.op === "read" || f.op === "pack" || f.op === "grep") counts.reads += 1;
      else if (f.op === "wrote") counts.writes += 1;
      else if (f.op === "refused") counts.refused += 1;
      else if (f.op === "ran") counts.ran += 1;
      else if (f.op.startsWith("goal")) counts.goals += 1;
      else counts.other += 1;
    }
    const worst = sorted.reduce<TimelineFrame["tone"]>((w, f) => (rank[f.tone] > rank[w] ? f.tone : w), "dim");
    return { agent, frames: sorted, last: sorted[0]?.t ?? 0, counts, worst };
  }).sort((a, b) => b.last - a.last);
}
/** "12 reads · 2 writes · 1 refused · 3 shell" — the agent's line. Pure. */
export function historyLine(h: AgentHistory): string {
  const parts: string[] = [];
  if (h.counts.reads) parts.push(`${h.counts.reads} read${h.counts.reads === 1 ? "" : "s"}`);
  if (h.counts.writes) parts.push(`${h.counts.writes} write${h.counts.writes === 1 ? "" : "s"}`);
  if (h.counts.refused) parts.push(`${h.counts.refused} refused`);
  if (h.counts.ran) parts.push(`${h.counts.ran} shell`);
  if (h.counts.goals) parts.push(`${h.counts.goals} goal event${h.counts.goals === 1 ? "" : "s"}`);
  if (h.counts.other) parts.push(`${h.counts.other} other`);
  return parts.join(" · ") || "nothing yet";
}

/** Audit events + goal-run events of every agent → one newest-first trace. Pure, tested. */
export function mergeTimeline(panes: { id: number; kind: string; idx: number }[], audits: Record<number, AuditEvent[]>, runs: Record<number, GoalRun[]>, limit = 240): TimelineFrame[] {
  const out: TimelineFrame[] = [];
  for (const p of panes) {
    const agent = `${paneDisplay(p.kind).glyph} #${p.idx + 1}`;
    for (const e of audits[p.id] ?? []) {
      const path = String(e.path ?? "");
      if (e.kind === "written") out.push({ t: tsMs(e.t), agent, glyph: "✎", op: "wrote", text: `${path}${e.sha ? ` · ${e.sha}` : ""}`, tone: "warn" });
      else if (e.kind === "blocked") out.push({ t: tsMs(e.t), agent, glyph: "⛔", op: "refused", text: path, tone: "bad" });
      else if (e.op === "exec") out.push({ t: tsMs(e.t), agent, glyph: "$", op: "ran", text: path.slice(0, 90), tone: "dim" });
      else if (e.op === "read" && (e.kind === "source" || e.kind === "pack")) out.push({ t: tsMs(e.t), agent, glyph: "·", op: e.kind === "pack" ? "pack" : "read", text: path, tone: "dim" });
      else if (e.op === "search") out.push({ t: tsMs(e.t), agent, glyph: "?", op: "grep", text: path.slice(0, 60), tone: "dim" });
    }
    for (const r of runs[p.id] ?? []) {
      for (const ev of r.events) {
        const tone = ev.kind === "pass" || ev.kind === "done" ? "ok" : ev.kind === "reject" || ev.kind === "fail" || ev.kind === "blocked" || ev.kind === "error" ? "bad" : ev.kind === "start" || ev.kind === "join" ? "warn" : "dim";
        out.push({ t: ev.t, agent, glyph: "⋔", op: `goal#${r.id} ${ev.kind}${ev.task ? ` ${ev.task}` : ""}`, text: ev.text.slice(0, 90), tone });
      }
      // THE SUB-AGENTS' OWN TOOLS (operator 2026-09-19: "the timeline is not getting all events the
      // agents and subagents are doing"): each task's CLI trace lists the tools it ran — one lane per
      // sub-agent (`✦ #1 ⋔ t2`), the calls spread over the task's running time in order
      for (const t of r.tasks ?? []) {
        const tools = t.trace?.tools ?? [];
        if (!tools.length || !t.started) continue;
        const span = Math.max(1, (t.ended ?? t.started + (t.trace?.ms ?? 0)) - t.started);
        const sub = `${agent} ⋔ ${t.id}`;
        tools.forEach((tool, i) => {
          const at = t.started! + Math.round((span * (i + 1)) / (tools.length + 1));
          const name = tool.name.toLowerCase();
          const op = name === "edit" || name === "write" || name === "multiedit" ? "wrote" : name === "bash" || name === "shell" ? "ran" : name === "grep" || name === "glob" ? "grep" : "read";
          out.push({ t: at, agent: sub, glyph: op === "wrote" ? "✎" : op === "ran" ? "$" : op === "grep" ? "?" : "·", op, text: `${tool.target || tool.name}`.slice(0, 90), tone: op === "wrote" ? "warn" : "dim" });
        });
      }
    }
  }
  return out.sort((a, b) => b.t - a.t).slice(0, limit);
}

async function collectPanes(): Promise<{ id: number; kind: string; idx: number; key: string }[]> {
  const list = unwrap(await apiPost(`/api/v1/cockpit/session/get`, {}, { timeoutMs: 15_000 }));
  const sessions = (Array.isArray(list?.sessions) ? list.sessions : []).filter((s: any) => s?.status !== "closed");
  const panes: { id: number; kind: string; idx: number; key: string }[] = [];
  for (const s of sessions) {
    try {
      const got = unwrap(await apiPost(`/api/v1/cockpit/session/get`, { id: s.id }, { timeoutMs: 15_000 }));
      for (const p of (Array.isArray(got?.panes) ? got.panes : [])) if (CLI_KINDS.has(String(p?.pane_kind ?? "")) && p?.worktree_path) panes.push({ id: p.id, kind: String(p.pane_kind), idx: Number(p.idx) || 0, key: String(p.subagent_name ?? "").replace(/^chat-/, "") });
    } catch { /* one session unreadable */ }
  }
  return panes;
}

const hhmmss = (t: number) => (t ? new Date(t).toLocaleTimeString([], { hour12: false }) : "—");

// GIT-GRAPH LANES (operator 2026-09-17: "make the timeline like a git graph"): one lane per actor —
// you first, then each agent in order of appearance — a continuous line per lane, a node on the
// actor's lane for every event. Pure, tested.
/** THE DAY IN ONE LINE (operator 2026-09-18: "for the audit, a summary consolidation in one quote of
 *  the day's work") — counted from the frames since local midnight. Pure — tested. */
export function daySummary(frames: TimelineFrame[], agents: number, now = Date.now()): string {
  const d = new Date(now); d.setHours(0, 0, 0, 0); const since = d.getTime();
  const today = frames.filter((f) => f.t >= since);
  if (!today.length) return agents ? `${agents} agent${agents === 1 ? "" : "s"} · nothing on the record yet today` : "nothing on the record yet today";
  const n = (pred: (f: TimelineFrame) => boolean) => today.filter(pred).length;
  const wrote = n((f) => f.op === "wrote"); const refused = n((f) => f.op === "refused"); const read = n((f) => f.op === "read" || f.op === "pack");
  const pass = n((f) => /pass|done|delivered/i.test(f.op)); const fail = n((f) => /fail|reject|error|blocked/i.test(f.op) && f.op !== "refused");
  const goals = n((f) => /goal|plan|join|verify/i.test(f.op)); const widgets = n((f) => f.op === "widget" || f.op === "artefact" || f.op === "opened" || f.op === "saved");
  const parts: string[] = [];
  if (agents) parts.push(`${agents} agent${agents === 1 ? "" : "s"}`);
  if (wrote) parts.push(`${wrote} write${wrote === 1 ? "" : "s"}`);
  if (refused) parts.push(`${refused} refused`);
  if (read) parts.push(`${read} read${read === 1 ? "" : "s"}`);
  if (pass || fail) parts.push(`${pass} pass · ${fail} fail`);
  if (goals) parts.push(`${goals} goal step${goals === 1 ? "" : "s"}`);
  if (widgets) parts.push(`${widgets} widget${widgets === 1 ? "" : "s"}`);
  const last = today[0];
  return `today · ${parts.join(" · ") || `${today.length} events`}${last ? ` — last: ${last.agent} ${last.op}${last.text ? ` ${last.text.length > 28 ? last.text.slice(0, 27) + "…" : last.text}` : ""}` : ""}`;
}

/** The timeline's stats view is the SAME component the Fuel window shows (fuel-mini.tsx) — one set of graphs
 *  over one source, so the two can never disagree about what a day cost. */
/** THE TIMELINE'S OWN INTELLIGENCE (operator 2026-09-24: "stats on timeline and stats on fuel is not the same
 *  thing, are different stats, on the fuel is ok, but on the timeline should be another kind of deterministic
 *  inteligence be creative").
 *
 *  Fuel answers "where did the money go". This one answers "how does the work actually GO": does it land first
 *  time, where does it keep going back to, what did the gates catch, how much looking per change, and when in the
 *  day it happens. Every number counted from rows the run ledger already holds. */
export type WorkStats = {
  first_try: { first: number; retried: number; failed: number; settled: number; pct: number; note: string; by_engine: { engine: string; first: number; tasks: number; pct: number }[] };
  gates: { tests: { passed: number; failed: number }; baseline_already_red: number; judge: { passed: number; failed: number }; verifier: { rejected: number; retried: number }; note: string };
  looking: { reads: number; writes: number; ratio: number; note: string };
  hotspots: { path: string; runs: number; retries: number }[];
  rhythm: number[];
  verdict: string;
};
export function TimelineStats({ stats }: { stats: WorkStats | null }) {
  if (!stats) return <span style={{ color: C.dim }}>reading the run ledger…</span>;
  const { first_try: ft, gates: g, looking: lk, hotspots: hs, rhythm } = stats;
  const peak = Math.max(...rhythm, 1);
  const section = (title: string, note: string, body: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
      <span style={{ fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.muted }}>{title}</span>
      <span style={{ fontSize: 9, color: C.dim, marginBottom: 2 }}>{note}</span>
      {body}
    </div>
  );
  const row = (label: string, value: string, frac: number, tint: string, key: string, sub?: string) => (
    <div key={key} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 260px) 1fr 84px", gap: 8, alignItems: "center", minHeight: 18 }}>
      <span title={label} style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ position: "relative", height: 7, background: `color-mix(in oklab, ${C.border} 60%, transparent)`, borderRadius: 4 }}>
        <span style={{ position: "absolute", inset: 0, width: `${Math.max(1.5, frac * 100)}%`, background: tint, borderRadius: 4 }} />
      </span>
      <span style={{ color: C.fg, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}{sub && <span style={{ color: C.dim }}> {sub}</span>}</span>
    </div>
  );
  return (
    <div data-testid="timeline-stats" style={{ display: "flex", flexDirection: "column" }}>
      <div data-testid="timeline-verdict" style={{ fontSize: 10.5, color: C.fg, lineHeight: 1.6, border: `1px solid ${C.border}`, borderLeft: `2px solid ${C.brand}`, borderRadius: 7, padding: "7px 10px", marginBottom: 14 }}>{stats.verdict}</div>

      {section("does the work land first time", ft.note || "of the tasks that finished, how many needed no second go — paid for twice when they do",
        <>
          {row("first attempt", String(ft.first), ft.settled ? ft.first / ft.settled : 0, C.ok, "first", `of ${ft.settled}`)}
          {row("needed a retry", String(ft.retried), ft.settled ? ft.retried / ft.settled : 0, C.warn, "retried")}
          {ft.failed > 0 && row("never landed", String(ft.failed), ft.settled ? ft.failed / Math.max(ft.settled, 1) : 0, C.bad, "failed")}
          {ft.by_engine.map((e) => row(`↳ ${e.engine}`, `${e.pct.toFixed(0)}%`, e.pct / 100, C.dim, e.engine, `of ${e.tasks}`))}
        </>)}

      {section("what the gates caught", g.note || "a gate is worth its cost only if it has ever said no",
        <>
          {row("the verifier sent work back", String(g.verifier.rejected), Math.min(1, g.verifier.rejected / Math.max(ft.settled, 1)), C.brand, "rej")}
          {row("tests passed / failed", `${g.tests.passed} / ${g.tests.failed}`, g.tests.passed + g.tests.failed ? g.tests.failed / (g.tests.passed + g.tests.failed) : 0, C.bad, "tests")}
          {g.baseline_already_red > 0 && row("suite was ALREADY red before the change", String(g.baseline_already_red), 1, C.warn, "base")}
          {(g.judge.passed + g.judge.failed) > 0 && row("the judge passed / failed", `${g.judge.passed} / ${g.judge.failed}`, g.judge.failed / Math.max(g.judge.passed + g.judge.failed, 1), C.bad, "judge")}
        </>)}

      {!!hs.length && section("where the work keeps going back", "churn as the AGENTS felt it — not git's churn, the map of where this codebase is hard",
        hs.map((h) => row(h.path, String(h.runs), h.runs / Math.max(hs[0].runs, 1), C.warn, h.path, h.retries ? `· ${h.retries} retried` : "")))}

      {section("how much looking per change", lk.note || "a high ratio is an agent hunting; a low one knew where to go — the clearest signal the context pack works",
        row(`${lk.reads} lookups · ${lk.writes} changes`, `${lk.ratio.toFixed(1)}×`, Math.min(1, lk.ratio / 10), C.brand, "ratio"))}

      {section("when the work happens", "your own rhythm, from the clock",
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 46 }}>
          {rhythm.map((v, h) => (
            <span key={h} title={`${String(h).padStart(2, "0")}:00 — ${v} call${v === 1 ? "" : "s"}`}
              style={{ flex: 1, height: `${Math.max(2, (v / peak) * 100)}%`, background: v ? C.brand : C.border, opacity: v ? 0.85 : 0.35, borderRadius: 2 }} />
          ))}
        </div>)}
      <div style={{ display: "flex", justifyContent: "space-between", color: C.dim, fontSize: 8.5, marginTop: -8 }}><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
    </div>
  );
}

export function laneOf(frames: TimelineFrame[]): { lanes: string[]; lane: (f: TimelineFrame) => number } {
  const lanes: string[] = ["you"];
  for (const f of frames) if (!lanes.includes(f.agent)) lanes.push(f.agent);
  return { lanes, lane: (f) => Math.max(0, lanes.indexOf(f.agent)) };
}
const LANE_COLORS = ["#d08a5a", "#6fb3d6", "#9ad06f", "#c98fd6", "#e0c060", "#d66f8a"];
export const laneColor = (i: number) => LANE_COLORS[i % LANE_COLORS.length];

export function AgentsTimeline({ top, instruments = [], variant = "ghost" }: { top?: number; instruments?: Instrument[]; variant?: "ghost" | "icon" }) {
  const [frames, setFrames] = React.useState<TimelineFrame[]>([]);
  const [agents, setAgents] = React.useState(0);
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => subscribeNotes(bump), []);
  // ONE CALL (operator 2026-09-24: "graph tab on the timeline should show the graph from all active agents
  // timeline like it was before, is just showing my actions" · "fuel takes a lot of time to display"). This used
  // to be a session-get per session plus an audit and a goals read per pane — around sixty requests every fifteen
  // seconds — and when any of them was slow the tick produced nothing, so the graph fell back to the only frames
  // that need no request: the operator's own. The serve merges it now, with per-pane attribution the box's shared
  // reads.jsonl could never give.
  const [stats, setStats] = React.useState<WorkStats | null>(null);
  React.useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const tz = -new Date().getTimezoneOffset();
        const r: any = unwrap(await apiGet(`/api/v1/cockpit/timeline?tz=${tz}&limit=400`, { timeoutMs: 20_000 } as any));
        if (stop || !Array.isArray(r?.frames)) return;
        setFrames(r.frames as TimelineFrame[]);
        setAgents(Number(r.agents) || 0);
        setStats((r.stats ?? null) as WorkStats | null);
      } catch { /* keep the last */ }
    };
    void tick();
    const t = setInterval(tick, 15_000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  // instruments (generated widgets / artefacts) are nodes on YOUR lane, openable from here
  const instrumentFrames = React.useMemo<TimelineFrame[]>(() => instruments.map((w) => ({ t: w.t, agent: "you", glyph: "▤", op: w.kind === "artifact" ? "artefact" : "widget", text: w.label, tone: "fg", open: w.open })), [instruments]);
  const all = React.useMemo(() => [...readNotes(), ...instrumentFrames, ...frames].sort((a, b) => b.t - a.t).slice(0, 400), [frames, instrumentFrames, readNotes().length, readNotes()[0]?.t]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = all[0];
  const summary = `${agents ? `${agents} agent${agents === 1 ? "" : "s"} · ` : ""}${all.length} events${last ? ` · ${last.agent} ${last.op}` : ""}`;
  const tone = (t: TimelineFrame["tone"]) => (t === "ok" ? C.ok : t === "warn" ? C.warn : t === "bad" ? C.bad : t === "fg" ? C.fg : C.dim);
  const { lanes, lane } = laneOf(all);
  const W = 14; const ROW = 22;
  const [open, setOpen] = React.useState(false);
  const [hot, setHot] = React.useState(false);
  const [laneFilter] = React.useState<string | null>(null);   // kept as a hook for row colouring; no chips set it any more
  // the focused window's view: BY AGENT (the audits grouped as each agent's history, click expands — the
  // default, operator 2026-09-19) or the flat GRAPH with a lane per agent
  const [view, setView] = React.useState<"agents" | "graph" | "stats">("agents");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const histories = React.useMemo(() => groupByAgent(all), [all]);
  React.useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open]);
  const shown = laneFilter ? all.filter((f) => f.agent === laneFilter) : all;
  const latestRows = all.slice(0, 3).map((f, i) => { const li = lane(f); return (
    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", lineHeight: 1.5 }}>
      <span style={{ color: C.dim }}>{hhmmss(f.t)}</span>
      <span style={{ color: tone(f.tone), fontWeight: f.tone === "bad" || f.tone === "warn" ? 600 : 400 }}>{f.op}</span>
      <span style={{ color: f.tone === "dim" ? C.muted : C.fg, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{f.text}</span>
      <span style={{ width: 9, height: 9, borderRadius: 9, background: f.tone === "bad" ? C.bad : f.tone === "warn" ? C.warn : f.tone === "ok" ? C.ok : laneColor(li), border: `1.5px solid ${C.bg}`, flexShrink: 0 }} />
    </div>
  ); });
  return (
    <>
      {/* THE ICON in the view switch (operator 2026-09-18): at rest a clock; hover drops the day's quote
          + the three newest nodes under the pill; click opens the graph. */}
      {variant === "icon" && (
        <div data-testid="timeline-preview" data-variant="icon" onClick={() => setOpen(true)} title="the timeline — hover for the latest, click for the full graph"
          onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
          style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 22, borderRadius: 6, cursor: "pointer", background: hot ? `color-mix(in oklab, ${C.brand} 10%, transparent)` : "transparent", opacity: hot ? 1 : 0.75, transition: "opacity .18s ease, background .15s ease" }}>
          <History size={14} strokeWidth={1.75} color={hot ? C.brand : C.muted} aria-hidden />
          {hot && (
            <div data-testid="timeline-popover" style={{ ...popoverStyle, minWidth: 300 }}>
              <div data-testid="timeline-quote" style={{ color: C.muted, fontStyle: "italic", lineHeight: 1.45, whiteSpace: "normal", marginBottom: all.length ? 6 : 0 }}>“{daySummary(all, agents)}”</div>
              {latestRows}
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.dim, marginTop: 2 }}>{agents > 0 && <span>{agents} agent{agents === 1 ? "" : "s"}</span>}<span>timeline</span><span data-testid="timeline-more" style={{ letterSpacing: 2, fontSize: 12, lineHeight: 1 }}>···</span><span style={{ marginLeft: "auto" }}>click → the full graph</span></div>
            </div>
          )}
        </div>
      )}
      {variant === "ghost" && (<>
      {/* THE PREVIEW (operator 2026-09-17: "not a box — already on the screen, a preview; ⋯ opens the
          focused window"). At rest (2026-09-18) one quote for the day; hovering swaps in the three
          newest nodes of the graph; leaving swaps the quote back. */}
      <div data-testid="timeline-preview" onClick={() => setOpen(true)} title="the timeline — hover for the latest, click for the full graph"
        onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
        style={{ ...(top != null ? { position: "fixed", top, right: 14, zIndex: 120 } : { position: "relative" }), pointerEvents: "auto", cursor: "pointer", opacity: hot ? 1 : 0.62, transition: "opacity .18s ease", fontFamily: mono, fontSize: 9.5, color: C.dim, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, userSelect: "none" }}>
        {hot ? latestRows : (
          <div data-testid="timeline-quote" style={{ maxWidth: 320, textAlign: "right", color: C.muted, fontStyle: "italic", lineHeight: 1.45, whiteSpace: "normal" }}>“{daySummary(all, agents)}”</div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.dim }}>
          {hot && !all.length && <span>timeline — nothing yet</span>}
          {hot && agents > 0 && <span>{agents} agent{agents === 1 ? "" : "s"}</span>}
          <span>timeline</span>
          <span data-testid="timeline-more" style={{ letterSpacing: 2, fontSize: 12, lineHeight: 1 }}>···</span>
        </div>
      </div>
      </>)}
      {/* THE FOCUSED WINDOW: the whole graph, all the info — portaled to body: inside the view switch the
          pill's transform would become the containing block and pin the "fixed" overlay to the pill */}
      {open && createPortal(
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", pointerEvents: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} data-testid="timeline-window" style={{ width: "min(960px, 96vw)", height: "min(88vh, 760px)", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 700 }}>⏱ timeline</span>
              <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{summary}</span>
              <span style={{ flex: 1 }} />
              <button data-testid="timeline-view-agents" onClick={() => setView("agents")} style={{ background: view === "agents" ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${view === "agents" ? C.brand : C.border}`, color: view === "agents" ? C.brand : C.muted, borderRadius: 6, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>by agent</button>
              <button data-testid="timeline-view-graph" onClick={() => setView("graph")} style={{ background: view === "graph" ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${view === "graph" ? C.brand : C.border}`, color: view === "graph" ? C.brand : C.muted, borderRadius: 6, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>graph</button>
              {/* THE PER-AGENT CHIPS ARE GONE (operator 2026-09-24: "it is showing on top some tabs per agent,
                  dont need the tabs"). They were a filter nobody asked for, in the one place a header should
                  only say what view you are in — and with a lane per agent already coloured in the graph, the
                  chips restated it. "by agent" is the view for one agent at a time. */}
              <button data-testid="timeline-view-stats" onClick={() => setView("stats")} style={{ background: view === "stats" ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${view === "stats" ? C.brand : C.border}`, color: view === "stats" ? C.brand : C.muted, borderRadius: 6, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>stats</button>
              <button onClick={() => setOpen(false)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>
            </div>
            {/* THE KEY — what a row means; each row also says it as a tooltip */}
            <div data-testid="timeline-legend" style={{ display: "flex", flexWrap: "wrap", gap: "3px 14px", padding: "7px 14px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 9, color: C.dim, background: C.panel }}>
              <span style={{ color: C.muted }}>{view === "agents" ? "each agent's history — click one to expand its audit; hover a row for the meaning:" : view === "stats" ? "every call this workspace made, from its own database — not a sample, not a reconstruction:" : "every event, newest first — what the agents did and what you did; a lane per agent, hover a row for the meaning:"}</span>
              {view !== "stats" && OP_LEGEND.map((l) => <span key={l.op} title={l.means} style={{ whiteSpace: "nowrap" }}><span style={{ color: C.fg }}>{l.glyph} {l.op}</span> <span>— {l.means.split(" — ")[0].replace(/^the agent |^you /, "")}</span></span>)}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 14px", fontFamily: mono, fontSize: 10 }}>
              {view === "stats" && <TimelineStats stats={stats} />}
              {view !== "stats" && !shown.length && <span style={{ color: C.dim }}>nothing yet — what you open or save and what the agents read, write, refuse, run and delegate lands here.</span>}
              {/* BY AGENT — each agent's history as one row; click expands its audit */}
              {view === "agents" && histories.map((h) => { const li = lanes.indexOf(h.agent); const on = expanded.has(h.agent); return (
                <div key={h.agent} data-testid={`agent-history-${h.agent}`} style={{ marginBottom: 4, border: `1px solid ${on ? `color-mix(in oklab, ${laneColor(li)} 45%, ${C.border})` : C.border}`, borderRadius: 8, background: on ? C.panel : "transparent" }}>
                  <div onClick={() => setExpanded((e) => { const n = new Set(e); if (n.has(h.agent)) n.delete(h.agent); else n.add(h.agent); return n; })}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer" }}>
                    <span style={{ color: C.dim, width: 10 }}>{on ? "▾" : "▸"}</span>
                    <span style={{ width: 9, height: 9, borderRadius: 9, background: laneColor(li), display: "inline-block", flexShrink: 0 }} />
                    <span style={{ color: laneColor(li), fontWeight: 600 }}>{h.agent}</span>
                    <span style={{ color: h.worst === "bad" ? C.bad : h.worst === "warn" ? C.warn : C.muted }}>{historyLine(h)}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ color: C.dim }}>{h.frames.length} event{h.frames.length === 1 ? "" : "s"} · last {hhmmss(h.last)}</span>
                    {h.frames[0] && <span style={{ color: C.muted, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{h.frames[0].op} {h.frames[0].text}</span>}
                  </div>
                  {on && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: "4px 10px 6px" }}>
                      {h.frames.map((f, i) => (
                        <div key={i} onClick={f.open} title={describeFrame(f)} style={{ display: "grid", gridTemplateColumns: "66px 12px 110px 1fr", gap: 8, alignItems: "center", whiteSpace: "nowrap", height: ROW, cursor: f.open ? "pointer" : "default" }}>
                          <span style={{ color: C.dim }}>{hhmmss(f.t)}</span>
                          <span style={{ color: tone(f.tone) }}>{f.glyph}</span>
                          <span style={{ color: tone(f.tone), fontWeight: f.tone === "bad" || f.tone === "warn" ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis" }}>{f.op}</span>
                          <span style={{ color: f.tone === "dim" ? C.muted : C.fg, overflow: "hidden", textOverflow: "ellipsis" }}>{f.text}{f.open && <span style={{ color: C.dim }}> ↗</span>}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ); })}
              {view === "graph" && shown.map((f, i) => { const li = lane(f); return (
                <div key={i} data-lane={li} onClick={f.open} title={describeFrame(f)} style={{ display: "grid", gridTemplateColumns: `${lanes.length * W + 4}px 66px 70px 12px 110px 1fr`, gap: 8, alignItems: "center", whiteSpace: "nowrap", height: ROW, cursor: f.open ? "pointer" : "default" }}>
                  <svg width={lanes.length * W + 4} height={ROW} style={{ display: "block", overflow: "visible" }} aria-hidden>
                    {lanes.map((_, k) => <line key={k} x1={k * W + 7} x2={k * W + 7} y1={i === 0 ? ROW / 2 : 0} y2={i === shown.length - 1 ? ROW / 2 : ROW} stroke={laneColor(k)} strokeOpacity={0.35} strokeWidth={1.5} />)}
                    <circle cx={li * W + 7} cy={ROW / 2} r={f.tone === "bad" || f.tone === "warn" ? 4 : 3} fill={f.tone === "bad" ? C.bad : f.tone === "warn" ? C.warn : f.tone === "ok" ? C.ok : laneColor(li)} stroke={C.bg} strokeWidth={1.5} />
                  </svg>
                  <span style={{ color: C.dim }}>{hhmmss(f.t)}</span>
                  <span style={{ color: laneColor(li), overflow: "hidden", textOverflow: "ellipsis" }}>{f.agent}</span>
                  <span style={{ color: tone(f.tone) }}>{f.glyph}</span>
                  <span style={{ color: tone(f.tone), fontWeight: f.tone === "bad" || f.tone === "warn" ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis" }}>{f.op}</span>
                  <span style={{ color: f.tone === "dim" ? C.muted : C.fg, overflow: "hidden", textOverflow: "ellipsis" }}>{f.text}{f.open && <span style={{ color: C.dim }}> ↗</span>}</span>
                </div>
              ); })}
            </div>
          </div>
        </div>
      , document.body)}
    </>
  );
}
