// THE BOARD (RFC 0025, operator 2026-11-26: "one board for all agents, task states" and routines): every running agent and what it is doing, the tasks they gave each other, and the routines. A simple list, not a kanban.
import * as React from "react";
import { apiGet, apiPost } from "@/loki/api/client";
import { C, mono, nav } from "@/loki/theme";
import { setPaused } from "@/loki/cockpit/pane-watch";
import { specialistsOpenable, type SpecialistRow } from "./api";

export type BoardAgent = { paneId: number; engine: string; specialist: string | null; state: string; why: string; doing: string; todo: number; messages: number; cost: number | null };
export type BoardTask = { id: string; from: string; to: string; task: string; state: string; note: string };
export type Board = { agents: BoardAgent[]; tasks: BoardTask[]; groups: { id: number; status: string; goal: string }[] };
export type Run = { t: number; usd: number; status: string; text: string };
export type Routine = { id: number; name: string; who: string; brief: string; everyMin: number; at: string; budget: number; write: string[]; sites: string[]; on: boolean; by: string; next: number; missed: number; runs: Run[]; running: boolean };

const list = (x: unknown): any[] => (Array.isArray(x) ? x.filter(Boolean) : []);
const body = (r: any) => r?.result ?? r;
/** The serve's board; anything unreadable is nothing. Pure. */
export function parseBoard(r: any): Board | null {
  const d = body(r); if (!d || d.ok !== true) return null;
  return { agents: list(d.agents).map((a) => ({ paneId: Number(a.pane_id) || 0, engine: String(a.engine ?? ""), specialist: a.specialist ? String(a.specialist) : null, state: String(a.state ?? "idle"), why: String(a.why ?? ""), doing: String(a.doing ?? ""), todo: Number(a.todo) || 0, messages: Number(a.messages) || 0, cost: typeof a.session_cost === "number" ? a.session_cost : null })).filter((a) => a.paneId > 0),
    tasks: list(d.tasks).map((t) => ({ id: String(t.id ?? ""), from: String(t.from ?? ""), to: String(t.to ?? ""), task: String(t.task ?? ""), state: String(t.state ?? ""), note: String(t.note ?? "") })),
    groups: list(d.groups).map((g) => ({ id: Number(g.id) || 0, status: String(g.status ?? ""), goal: String(g.goal ?? "") })) };
}
/** The serve's routines. Pure. */
export function parseRoutines(r: any): Routine[] | null {
  const d = body(r); if (!d || d.ok !== true) return null; const busy = list(d.running).map(Number);
  return list(d.routines).map((x) => ({ id: Number(x.id) || 0, name: String(x.name ?? ""), who: String(x.who ?? ""), brief: String(x.brief ?? ""), everyMin: Number(x.every_min) || 0, at: String(x.at ?? ""), budget: Number(x.budget_usd) || 0, write: list(x.write).map(String), sites: list(x.sites).map(String), on: x.on === true, by: String(x.by ?? ""), next: Number(x.next_ms) || 0, missed: Number(x.missed) || 0, running: busy.includes(Number(x.id)),
    runs: list(x.runs).map((u) => ({ t: Number(u.t_ms) || 0, usd: Number(u.usd) || 0, status: String(u.status ?? ""), text: String(u.text ?? "") })) }));
}
/** "every 2 h", "daily at 09:00". Pure. */
export const when = (r: { at: string; everyMin: number }): string => (r.at ? `daily at ${r.at}` : r.everyMin % 1440 === 0 ? `every ${r.everyMin / 1440} d` : r.everyMin % 60 === 0 ? `every ${r.everyMin / 60} h` : `every ${r.everyMin} min`);
const words = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const stamp = (ms: number) => (ms ? new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const TONE: Record<string, string> = { working: "var(--c-ok)", done: "var(--c-ok)", accepted: "var(--c-ok)", paused: "var(--c-warn)", waiting: "var(--c-warn)", waited: "var(--c-warn)", missed: "var(--c-warn)", skipped: "var(--c-warn)", "needs you": "var(--c-warn)", failed: "var(--c-bad)" };
const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 8, padding: "3px 10px", fontFamily: nav, fontSize: 12, cursor: "pointer", flexShrink: 0 };
const row: React.CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: `1px solid color-mix(in srgb, var(--c-fg) 8%, transparent)` };
const Chip = ({ s }: { s: string }) => <span style={{ color: TONE[s] ?? C.muted, fontFamily: mono, fontSize: 10.5, width: 66, flex: "none" }}>{s}</span>;
const field: React.CSSProperties = { background: "color-mix(in srgb, var(--c-fg) 6%, transparent)", border: "none", borderRadius: 8, padding: "6px 9px", color: C.fg, fontFamily: nav, fontSize: 12.5, outline: "none", minWidth: 0 };

const EMPTY = { who: "", brief: "", at: "09:00", every: "", budget: "0.5", write: "", sites: "" };
function NewRoutine({ onSaved }: { onSaved: () => void }) {
  const [f, setF] = React.useState(EMPTY); const [who, setWho] = React.useState<SpecialistRow[]>([]); const [err, setErr] = React.useState(""); const [open, setOpen] = React.useState(false);
  React.useEffect(() => { if (open) void specialistsOpenable().then((l) => setWho(l.filter((s) => !s.leader))); }, [open]);
  const put = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const r = body(await apiPost("/api/v1/cockpit/jobs", { op: "save", who: f.who, brief: f.brief, at: f.every ? "" : f.at, every_min: Number(f.every) || 0, tz_min: -new Date().getTimezoneOffset(), budget_usd: Number(f.budget), write: words(f.write), sites: words(f.sites) }).catch(() => null));
    if (r?.ok) { setF(EMPTY); setErr(""); setOpen(false); onSaved(); } else setErr(String(r?.error ?? "the serve could not be reached"));
  };
  if (!open) return <div style={{ padding: 10 }}><button data-testid="routine-new" style={btn} onClick={() => setOpen(true)}>+ new routine</button></div>;
  return (
    <form data-testid="routine-form" onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10 }}>
      <select data-testid="routine-who" aria-label="which specialist" value={f.who} onChange={put("who")} style={field}><option value="">which specialist?</option>{who.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <textarea data-testid="routine-brief" aria-label="what it does" placeholder="what it does, every time" rows={3} value={f.brief} onChange={put("brief")} style={{ ...field, resize: "vertical" }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <label style={{ color: C.muted }}>daily at <input data-testid="routine-at" type="time" value={f.at} onChange={put("at")} disabled={!!f.every} style={field} /></label>
        <label style={{ color: C.muted }}>or every <input data-testid="routine-every" inputMode="numeric" placeholder="min" value={f.every} onChange={put("every")} style={{ ...field, width: 60 }} /> min</label>
        <label style={{ color: C.muted }}>at most $<input data-testid="routine-budget" inputMode="decimal" value={f.budget} onChange={put("budget")} style={{ ...field, width: 60 }} /> a run</label>
      </div>
      <input data-testid="routine-write" aria-label="files it may change" placeholder="files it may change (empty: none), e.g. docs/reports/**" value={f.write} onChange={put("write")} style={field} />
      <input data-testid="routine-sites" aria-label="websites it may read" placeholder="websites it may read (optional), e.g. example.com" value={f.sites} onChange={put("sites")} style={field} />
      {err && <div role="alert" style={{ color: "var(--c-bad)" }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}><button data-testid="routine-save" type="submit" style={{ ...btn, color: C.brand }}>Save, switched off</button><button type="button" style={btn} onClick={() => setOpen(false)}>Cancel</button></div>
    </form>);
}
function Routines({ routines, reload }: { routines: Routine[]; reload: () => void }) {
  const [shown, setShown] = React.useState<number | null>(null); const [sure, setSure] = React.useState<number | null>(null); const [err, setErr] = React.useState("");
  const op = async (id: number, o: string) => { const r = body(await apiPost("/api/v1/cockpit/jobs", { op: o, id }).catch(() => null)); setErr(r?.ok ? "" : String(r?.error ?? "the serve could not be reached")); setSure(null); reload(); };
  return (<>
    <div style={{ padding: "8px 10px", color: C.muted, fontSize: 12, lineHeight: 1.5 }}>A routine runs only while antiloki is open and only after you switch it on. It has no shell and cannot send, buy or publish anything.</div>
    {err && <div role="alert" style={{ color: "var(--c-bad)", padding: "0 10px" }}>{err}</div>}
    {routines.length === 0 && <div data-testid="routines-empty" style={{ padding: "6px 10px", color: C.muted }}>No routines yet. Make one here, or ask an agent to propose one.</div>}
    {routines.map((r) => { const last = r.runs[r.runs.length - 1]; return (
      <div key={r.id} data-testid={`routine-${r.id}`} style={{ ...row, flexDirection: "column", alignItems: "stretch" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button data-testid={`routine-switch-${r.id}`} role="switch" aria-checked={r.on} aria-label={`${r.name} is ${r.on ? "on" : "off"}`} onClick={() => void op(r.id, r.on ? "off" : "on")} style={{ ...btn, color: r.on ? "var(--c-ok)" : C.muted, width: 46 }}>{r.on ? "on" : "off"}</button>
          <button onClick={() => setShown(shown === r.id ? null : r.id)} aria-expanded={shown === r.id} style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 120, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</button>
          <button data-testid={`routine-run-${r.id}`} style={btn} disabled={r.running} onClick={() => void op(r.id, "run")}>{r.running ? "running…" : "Run now"}</button>
          {sure === r.id ? <button data-testid={`routine-remove-yes-${r.id}`} style={{ ...btn, color: "var(--c-bad)" }} onClick={() => void op(r.id, "remove")}>Remove it</button> : <button data-testid={`routine-remove-${r.id}`} style={btn} onClick={() => setSure(r.id)}>Remove…</button>}
        </div>
        <div style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.5, overflowWrap: "anywhere" }}>{r.who} · {when(r)} · at most ${r.budget.toFixed(2)} a run · {r.write.length ? `may change ${r.write.join(", ")}` : "changes no files"}{r.sites.length ? ` · may read ${r.sites.join(", ")}` : ""}{r.by !== "you" ? ` · proposed by ${r.by}` : ""}{r.on && r.next ? ` · next ${stamp(r.next)}` : ""}{r.missed ? ` · ${r.missed} missed` : ""}</div>
        {last && <div data-testid={`routine-last-${r.id}`} style={{ fontSize: 11.5 }}><span style={{ color: TONE[last.status] ?? C.muted }}>{last.status}</span> <span style={{ color: C.dim }}>{stamp(last.t)}{last.usd ? ` · $${last.usd.toFixed(3)}` : ""}</span></div>}
        {shown === r.id && <div style={{ fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}><div style={{ color: C.muted }}>{r.brief}</div>{[...r.runs].reverse().map((u, i) => <div key={i} style={{ marginTop: 8 }}><span style={{ color: TONE[u.status] ?? C.muted, fontFamily: mono, fontSize: 10.5 }}>{u.status} · {stamp(u.t)}</span><br />{u.text}</div>)}</div>}
      </div>); })}
    <NewRoutine onSaved={reload} />
  </>);
}

const EVERY_MS = 5000;
export function BoardPane() {
  const [tab, setTab] = React.useState<"agents" | "tasks" | "routines">("agents"); const [board, setBoard] = React.useState<Board | null | undefined>(undefined); const [routines, setRoutines] = React.useState<Routine[] | null>(null); const [sure, setSure] = React.useState(false); const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    let on = true; let timer = 0;
    // the next look is asked only when this one came back, and nothing is asked while the tab is hidden
    const look = async () => { if (!document.hidden) { if (tab === "routines") { const r = parseRoutines(await apiGet("/api/v1/cockpit/jobs").catch(() => null)); if (on) setRoutines(r); } else { const b = parseBoard(await apiGet("/api/v1/cockpit/board", { timeoutMs: 20_000 }).catch(() => null)); if (on) setBoard(b); } } if (on) timer = window.setTimeout(look, EVERY_MS); };
    void look(); return () => { on = false; window.clearTimeout(timer); };
  }, [tab, tick]);
  const reload = () => setTick((n) => n + 1);
  const stopAll = async () => { setSure(false); for (const a of board?.agents ?? []) if (a.state !== "paused") await setPaused(a.paneId, true); for (const g of board?.groups ?? []) if (g.status === "active") await apiPost("/api/v1/cockpit/groups", { op: "stop", id: g.id }).catch(() => null); reload(); };
  const tabBtn = (k: typeof tab, t: string) => <button key={k} data-testid={`board-tab-${k}`} aria-pressed={tab === k} onClick={() => setTab(k)} style={{ background: "transparent", border: "none", borderBottom: `2px solid ${tab === k ? C.brand : "transparent"}`, color: tab === k ? C.fg : C.muted, cursor: "pointer", fontFamily: nav, fontSize: 12.5, padding: "6px 4px" }}>{t}</button>;
  return (
    <div data-testid="board-pane" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", fontFamily: nav, color: C.fg, fontSize: 12.5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 10px" }}>
        {tabBtn("agents", "Agents")}{tabBtn("tasks", "Tasks")}{tabBtn("routines", "Routines")}
        <span style={{ flex: 1 }} />
        {tab === "agents" && (board?.agents.length ?? 0) > 0 && (sure ? <><button data-testid="board-stop-yes" style={{ ...btn, color: "var(--c-bad)" }} onClick={() => void stopAll()}>Pause every agent and stop groups</button><button style={btn} onClick={() => setSure(false)}>Keep going</button></> : <button data-testid="board-stop" style={btn} onClick={() => setSure(true)}>Stop all…</button>)}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {tab !== "routines" && board === undefined && <div style={{ padding: 10, color: C.muted }}>looking…</div>}
        {tab !== "routines" && board === null && <div data-testid="board-noserve" style={{ padding: 10, color: C.muted }}>The serve did not answer (it may be older than this pane).</div>}
        {tab === "agents" && board && board.agents.length === 0 && <div data-testid="board-empty" style={{ padding: 10, color: C.muted }}>No agent is running.</div>}
        {tab === "agents" && board?.agents.map((a) => (
          <div key={a.paneId} data-testid={`board-agent-${a.paneId}`} style={row}>
            <Chip s={a.state} />
            <button title="go to its pane, when it is on this thread" onClick={() => window.dispatchEvent(new CustomEvent("antiloki:open-pane", { detail: { paneId: a.paneId } }))} style={{ all: "unset", cursor: "pointer", fontWeight: 600 }}>{a.specialist ?? a.engine} <span style={{ color: C.dim, fontFamily: mono, fontSize: 10.5 }}>#{a.paneId}</span></button>
            <span style={{ flex: 1, minWidth: 100, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.why || a.doing}>{a.state === "paused" || a.state === "needs you" ? a.why : a.doing}</span>
            {a.todo > 0 && <span style={{ color: C.dim }}>{a.todo} to do</span>}{a.messages > 0 && <span style={{ color: "var(--c-warn)" }}>{a.messages} waiting</span>}{a.cost !== null && <span style={{ color: C.dim, fontFamily: mono, fontSize: 10.5 }}>${a.cost.toFixed(2)}</span>}
            <button data-testid={`board-pause-${a.paneId}`} style={btn} onClick={() => void setPaused(a.paneId, a.state !== "paused").then(reload)}>{a.state === "paused" ? "Continue" : "Pause"}</button>
          </div>))}
        {tab === "tasks" && board && board.tasks.length === 0 && <div data-testid="tasks-empty" style={{ padding: 10, color: C.muted }}>No tasks between agents yet: they appear when one opens a contract with a specialist.</div>}
        {tab === "tasks" && ["waiting", "working", "done", "accepted"].map((s) => board?.tasks.filter((t) => t.state === s).map((t) => (
          <div key={t.id} data-testid={`board-task-${t.id}`} style={row}><Chip s={t.state} /><span style={{ fontFamily: mono, fontSize: 10.5, color: C.muted }}>{t.from} → {t.to}</span><span style={{ flex: 1, minWidth: 140, overflowWrap: "anywhere" }}>{t.task}{t.note ? <span style={{ color: C.muted }}> — {t.note}</span> : null}</span></div>)))}
        {tab === "routines" && (routines ? <Routines routines={routines} reload={reload} /> : <div style={{ padding: 10, color: C.muted }}>looking…</div>)}
      </div>
    </div>);
}
