// THE ISSUES WIDGET (operator 2026-10-11: "the todo and kanban should be one widget called issues and have a linear like design").
// One tracker instead of two: the checklist and the board are the same thing seen two ways, so this is ONE list of issues with a status (Backlog · Todo · In Progress · Done · Canceled) and a priority, shown as a LIST grouped by
// status or as a BOARD of columns. Linear's look: dense hairline rows, a status circle you click to change, priority bars, a muted ISS-n id, nothing loud.
// Storage: pane-scoped blackboard rows (kind 'issue', body = JSON), like the boards it replaces - they live with the session and are never sent to an agent. What those boards already held is MOVED in the first time this opens:
// a todo ("[ ] text" / "[x] text") becomes a Todo / Done issue, a kanban card ({col,text}) becomes the issue of its column, and the old rows are removed, so nothing shows twice and nothing is lost.
import * as React from "react";
import { apiPost, unwrapResult as unwrap } from "@/loki/api/client";
import { C, mono, nav } from "@/loki/theme";
import { startBlockDrag } from "@/loki/widgets/agent-interact";
import { isIssueRow, isPrefRow } from "./tool-rows";

// ── the model (pure, tested) ──────────────────────────────────────────────────────────────────────────────────
export type Status = "backlog" | "todo" | "doing" | "done" | "canceled";
export type Priority = 0 | 1 | 2 | 3 | 4;   // none · urgent · high · medium · low, Linear's order
export type Issue = { id: number; n: number; title: string; status: Status; priority: Priority; created_at?: string };

export const STATUSES: ReadonlyArray<{ key: Status; label: string }> = [
  { key: "backlog", label: "Backlog" }, { key: "todo", label: "Todo" }, { key: "doing", label: "In Progress" }, { key: "done", label: "Done" }, { key: "canceled", label: "Canceled" },
];
export const PRIORITIES: ReadonlyArray<{ key: Priority; label: string }> = [
  { key: 0, label: "No priority" }, { key: 1, label: "Urgent" }, { key: 2, label: "High" }, { key: 3, label: "Medium" }, { key: 4, label: "Low" },
];
export const statusLabel = (s: Status) => STATUSES.find((x) => x.key === s)?.label ?? s;
export const issueCode = (n: number) => `ISS-${n}`;

const isStatus = (v: any): v is Status => STATUSES.some((s) => s.key === v);
const asPriority = (v: any): Priority => (v === 1 || v === 2 || v === 3 || v === 4 ? v : 0);

/** a blackboard row of kind 'issue' -> an Issue; anything unreadable is not an issue. Pure. */
export function parseIssue(row: { id: number; body_md?: string; created_at?: string }): Issue | null {
  try {
    const j = JSON.parse(String(row.body_md ?? ""));
    const title = String(j?.title ?? "").trim(); if (!title) return null;
    return { id: row.id, n: Number.isFinite(j?.n) ? Number(j.n) : row.id, title, status: isStatus(j?.status) ? j.status : "todo", priority: asPriority(j?.priority), created_at: row.created_at };
  } catch { return null; }
}
export const serializeIssue = (i: { n: number; title: string; status: Status; priority: Priority }): string => JSON.stringify({ n: i.n, title: i.title, status: i.status, priority: i.priority });

/** what the old checklist held: "[x] text" is Done, "[ ] text" (or anything else) is Todo. Pure. */
export function fromLegacyTodo(body: string): { title: string; status: Status } {
  const b = String(body ?? ""); const done = /^\[x\]/i.test(b);
  return { title: b.replace(/^\[[ xX]\]\s?/, "").trim(), status: done ? "done" : "todo" };
}
/** what the old board held: a card in the To do / Doing / Done column; a bare string is a Todo. Pure. */
export function fromLegacyKanban(body: string): { title: string; status: Status } {
  try { const j = JSON.parse(String(body)); const col = String(j?.col ?? "todo"); return { title: String(j?.text ?? "").trim(), status: col === "doing" ? "doing" : col === "done" ? "done" : col === "backlog" ? "backlog" : "todo" }; }
  catch { return { title: String(body ?? "").trim(), status: "todo" }; }
}
export const nextNumber = (issues: ReadonlyArray<{ n: number }>): number => issues.reduce((m, i) => Math.max(m, i.n), 0) + 1;
/** EVERY ISSUE HAS ITS OWN NUMBER (operator 2026-10-11: "all issues on the issues widget should have a unique id"). Two issues can come to share one (two added in quick succession, a board from before this rule, a number that was missing and fell back
 *  to a row id). The one made first keeps its number; each later one takes the next free number, in the order they were made. Returns what to change; nothing when every number is already its own. Pure - tested. */
export function uniqueNumbers(issues: ReadonlyArray<Issue>): Array<{ id: number; n: number }> {
  const seen = new Set<number>(); let next = nextNumber(issues); const out: Array<{ id: number; n: number }> = [];
  for (const it of [...issues].sort((a, b) => a.id - b.id)) { if (seen.has(it.n)) { out.push({ id: it.id, n: next }); seen.add(next); next++; } else seen.add(it.n); }
  return out;
}

/** urgent first, then high, medium, low, and no priority last; the oldest first within a priority. Pure. */
export function byPriority(a: Issue, b: Issue): number { const k = (p: Priority) => (p === 0 ? 9 : p); return k(a.priority) - k(b.priority) || a.n - b.n; }
export function groupByStatus(issues: ReadonlyArray<Issue>): Record<Status, Issue[]> {
  const out: Record<Status, Issue[]> = { backlog: [], todo: [], doing: [], done: [], canceled: [] };
  for (const i of issues) out[i.status].push(i);
  for (const s of STATUSES) out[s.key].sort(byPriority);
  return out;
}
/** how long ago, in Linear's terse way: now · 5m · 3h · 2d · 6w. Pure. */
export function ageLabel(created: string | undefined, now: number = Date.now()): string {
  if (!created) return "";
  const t = Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(created) ? created.replace(" ", "T") + "Z" : created);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : s < 7 * 86400 ? `${Math.floor(s / 86400)}d` : `${Math.floor(s / (7 * 86400))}w`;
}

// ── small pieces ──────────────────────────────────────────────────────────────────────────────────────────────
const STATUS_TONE: Record<Status, string> = { backlog: C.dim, todo: C.muted, doing: C.warn, done: C.ok, canceled: C.dim };
export function StatusIcon({ s, size = 14 }: { s: Status; size?: number }) {
  const tone = STATUS_TONE[s];
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden style={{ display: "block", flexShrink: 0 }} data-status={s}>
      {s === "backlog" && <circle cx="7" cy="7" r="5.5" fill="none" stroke={tone} strokeWidth="1.4" strokeDasharray="2 2" />}
      {s === "todo" && <circle cx="7" cy="7" r="5.5" fill="none" stroke={tone} strokeWidth="1.4" />}
      {s === "doing" && <><circle cx="7" cy="7" r="5.5" fill="none" stroke={tone} strokeWidth="1.4" /><path d="M7 3.6 A3.4 3.4 0 0 1 7 10.4 Z" fill={tone} /></>}
      {s === "done" && <><circle cx="7" cy="7" r="6.2" fill={tone} /><path d="M4.4 7.2 6.2 9 9.6 5.2" fill="none" stroke={C.bg} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></>}
      {s === "canceled" && <><circle cx="7" cy="7" r="5.5" fill="none" stroke={tone} strokeWidth="1.4" /><path d="M5 5 9 9M9 5 5 9" stroke={tone} strokeWidth="1.4" strokeLinecap="round" /></>}
    </svg>
  );
}
export function PriorityIcon({ p, size = 14 }: { p: Priority; size?: number }) {
  if (p === 0) return <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden data-priority={0} style={{ display: "block" }}><path d="M2.5 7h2M6 7h2M9.5 7h2" stroke={C.dim} strokeWidth="1.4" strokeLinecap="round" /></svg>;
  if (p === 1) return <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden data-priority={1} style={{ display: "block" }}><rect x="1.5" y="1.5" width="11" height="11" rx="3" fill={C.warn} /><path d="M7 4.2v3.6" stroke={C.bg} strokeWidth="1.6" strokeLinecap="round" /><circle cx="7" cy="10" r=".9" fill={C.bg} /></svg>;
  const lit = p === 2 ? 3 : p === 3 ? 2 : 1;   // high = three bars, medium = two, low = one
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden data-priority={p} style={{ display: "block" }}>
      {[0, 1, 2].map((i) => <rect key={i} x={2 + i * 4} y={9 - i * 3} width="2.4" height={3 + i * 3} rx=".8" fill={i < lit ? C.fg : C.border} />)}
    </svg>
  );
}

/** a button that opens a small menu under it and closes on an outside click or a choice */
function Pop({ trigger, title, testId, children }: { trigger: React.ReactNode; title?: string; testId?: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLSpanElement | null>(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" data-testid={testId} title={title} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{ background: "transparent", border: "none", padding: 3, borderRadius: 5, cursor: "pointer", display: "inline-flex", alignItems: "center" }}>{trigger}</button>
      {open && <div role="menu" style={{ position: "absolute", top: "100%", left: 0, zIndex: 40, minWidth: 156, marginTop: 4, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.4)", padding: 4 }}>{children(() => setOpen(false))}</div>}
    </span>
  );
}
function MenuItem({ icon, label, on, onClick, testId }: { icon: React.ReactNode; label: string; on?: boolean; onClick: () => void; testId?: string }) {
  return (
    <button type="button" role="menuitem" data-testid={testId} onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 5, padding: "5px 8px", cursor: "pointer", color: C.fg, fontFamily: nav, fontSize: 12 }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.hover; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
      <span style={{ display: "inline-flex", width: 16, justifyContent: "center" }}>{icon}</span><span style={{ flex: 1 }}>{label}</span>{on && <span style={{ color: C.brand, fontSize: 11 }}>✓</span>}
    </button>
  );
}

// ── storage ───────────────────────────────────────────────────────────────────────────────────────────────────
const POST = "/api/v1/cockpit/blackboard/post", READ = "/api/v1/cockpit/blackboard/read";
const readPane = async (sessionId: number, paneId: number): Promise<any[]> => {
  const d: any = unwrap(await apiPost(READ, { session_id: sessionId, pane_id: paneId }, { timeoutMs: 20000 }));
  return (d?.scratch ?? []) as any[];
};
const post = (body: any) => apiPost(POST, body, { timeoutMs: 20000 });
// a move that runs twice at once (two mounts of the same widget) would create every issue twice: one at a time per pane
const moving = new Map<string, Promise<void>>();
/** Move the old boards' rows into this pane as issues, once; the old rows are deleted as they are converted. */
export function migrateLegacy(sessionId: number, paneId: number, legacyPaneIds: number[]): Promise<void> {
  const key = `${sessionId}:${paneId}`;
  const run = (moving.get(key) ?? Promise.resolve()).then(async () => {
    const mine = (await readPane(sessionId, paneId)).filter(isIssueRow).map((r) => parseIssue(r)).filter((x): x is Issue => !!x);
    let n = nextNumber(mine) - 1;
    for (const pid of legacyPaneIds) {
      const rows = (await readPane(sessionId, pid)).filter((r) => r.kind === "todo" || r.kind === "kanban").sort((a, b) => a.id - b.id);
      for (const r of rows) {
        const it = r.kind === "todo" ? fromLegacyTodo(r.body_md) : fromLegacyKanban(r.body_md);
        if (it.title) { const ok = await post({ session_id: sessionId, pane_id: paneId, kind: "issue", body_md: serializeIssue({ n: ++n, title: it.title, status: it.status, priority: 0 }) }); if (ok == null) return; }
        await post({ op: "delete", id: r.id });
      }
    }
  }).catch(() => { /* the move is retried the next time the widget opens */ });
  moving.set(key, run); return run;
}

// ── the widget ────────────────────────────────────────────────────────────────────────────────────────────────
export function IssuesPane({ sessionId, paneId, legacyPaneIds }: { sessionId: number; paneId: number; legacyPaneIds?: number[] }) {
  const [issues, setIssues] = React.useState<Issue[]>([]);
  const [ready, setReady] = React.useState(false);
  const [view, setViewState] = React.useState<"list" | "board">("list");
  const prefApplied = React.useRef(false);
  const [draft, setDraft] = React.useState("");
  const [draftStatus, setDraftStatus] = React.useState<Status>("todo");
  const [editId, setEditId] = React.useState<number | null>(null);
  const [editText, setEditText] = React.useState("");
  const [collapsed, setCollapsed] = React.useState<Set<Status>>(new Set());
  const [overCol, setOverCol] = React.useState<Status | null>(null);
  const dragId = React.useRef<number | null>(null);
  const createQ = React.useRef<Promise<void>>(Promise.resolve());   // new issues are made one after another, each numbered from what is stored NOW, so two quick ones never share a number
  const tempId = React.useRef(0);
  const repairing = React.useRef(false);
  const legacy = React.useMemo(() => legacyPaneIds ?? [paneId], [legacyPaneIds, paneId]);
  // THE LIST / BOARD CHOICE IS DATA TOO (operator 2026-10-11: everything the tools hold goes to the workspace database): one 'pref' row, updated in place, in the same table as the issues
  const prefChain = React.useRef<Promise<void>>(Promise.resolve());
  const setView = (v: "list" | "board") => {
    setViewState(v);
    prefChain.current = prefChain.current.then(async () => {
      try {
        const body = JSON.stringify({ view: v });
        const row = (await readPane(sessionId, paneId)).filter(isPrefRow).pop();
        if (row) await post({ op: "update", id: row.id, body_md: body }); else await post({ session_id: sessionId, pane_id: paneId, kind: "pref", body_md: body });
      } catch { /* the next change saves it */ }
    });
  };

  const load = React.useCallback(async () => {
    const rows = await readPane(sessionId, paneId);
    const parsed = rows.filter(isIssueRow).map((r) => parseIssue(r)).filter((x): x is Issue => !!x);
    setIssues(parsed);
    const fix = uniqueNumbers(parsed);   // a board that already holds two issues with one number is put right
    if (fix.length && !repairing.current) {
      repairing.current = true;
      try {
        const renumbered = parsed.map((it) => { const f = fix.find((x) => x.id === it.id); return f ? { ...it, n: f.n } : it; });
        for (const f of fix) { const it = renumbered.find((x) => x.id === f.id)!; await post({ op: "update", id: f.id, body_md: serializeIssue(it) }); }
        setIssues(renumbered);
      } catch { /* tried again at the next load */ }
      repairing.current = false;
    }
    if (!prefApplied.current) {
      prefApplied.current = true;
      try { const j = JSON.parse(String(rows.filter(isPrefRow).pop()?.body_md ?? "{}")); if (j?.view === "board") setViewState("board"); } catch { /* the default stands */ }
    }
  }, [sessionId, paneId]);
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try { await load(); } catch { /* shown empty until the next change */ }
      if (alive) setReady(true);
      try { await migrateLegacy(sessionId, paneId, legacy); if (alive) await load(); } catch { /* */ }
    })();
    return () => { alive = false; };
  }, [sessionId, paneId, legacy, load]);

  const patch = async (it: Issue, change: Partial<Pick<Issue, "title" | "status" | "priority">>) => {
    const next = { ...it, ...change };
    setIssues((all) => all.map((x) => (x.id === it.id ? next : x)));   // at once, then the server
    const ok = await post({ op: "update", id: it.id, body_md: serializeIssue(next) });
    if (ok == null) await load();
  };
  const create = (title: string, status: Status): Promise<void> => {
    const t = title.trim(); if (!t) return Promise.resolve();
    createQ.current = createQ.current.then(async () => {
      let stored: Issue[] = issues;
      try { stored = (await readPane(sessionId, paneId)).filter(isIssueRow).map((r) => parseIssue(r)).filter((x): x is Issue => !!x); } catch { /* the screen's own list is the fallback */ }
      const n = nextNumber(stored);
      setIssues((all) => [...all, { id: -(++tempId.current), n, title: t, status, priority: 0 }]);
      await post({ session_id: sessionId, pane_id: paneId, kind: "issue", body_md: serializeIssue({ n, title: t, status, priority: 0 }) });
      await load();
    }).catch(() => { /* the next change shows what was saved */ });
    return createQ.current;
  };
  const remove = async (id: number) => { setIssues((all) => all.filter((x) => x.id !== id)); await post({ op: "delete", id }); await load(); };
  const drop = async (s: Status) => { const id = dragId.current; dragId.current = null; setOverCol(null); const it = issues.find((x) => x.id === id); if (it && it.status !== s) await patch(it, { status: s }); };

  const groups = React.useMemo(() => groupByStatus(issues), [issues]);
  const open = issues.filter((i) => i.status !== "done" && i.status !== "canceled").length;
  const dragStart = (e: React.DragEvent, it: Issue) => { dragId.current = it.id; startBlockDrag(e, { label: it.title.slice(0, 40), uid: `issue-${it.id}`, source: "session issues", content: `Issue ${issueCode(it.n)} (${statusLabel(it.status)}): ${it.title}` } as any); };

  const statusMenu = (it: Issue) => (
    <Pop testId={`issue-status-${it.id}`} title={statusLabel(it.status)} trigger={<StatusIcon s={it.status} />}>
      {(close) => STATUSES.map((s) => <MenuItem key={s.key} testId={`set-status-${s.key}`} icon={<StatusIcon s={s.key} />} label={s.label} on={it.status === s.key} onClick={() => { close(); void patch(it, { status: s.key }); }} />)}
    </Pop>
  );
  const priorityMenu = (it: Issue) => (
    <Pop testId={`issue-priority-${it.id}`} title={PRIORITIES.find((p) => p.key === it.priority)?.label} trigger={<PriorityIcon p={it.priority} />}>
      {(close) => PRIORITIES.map((p) => <MenuItem key={p.key} testId={`set-priority-${p.key}`} icon={<PriorityIcon p={p.key} />} label={p.label} on={it.priority === p.key} onClick={() => { close(); void patch(it, { priority: p.key }); }} />)}
    </Pop>
  );
  const titleOf = (it: Issue) => editId === it.id ? (
    <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} data-testid="issue-title-input"
      onBlur={() => { const t = editText.trim(); setEditId(null); if (t && t !== it.title) void patch(it, { title: t }); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setEditText(it.title); setEditId(null); } }}
      style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", borderBottom: `1px solid ${C.brand}`, outline: "none", color: C.fg, fontFamily: nav, fontSize: 13, padding: "1px 0" }} />
  ) : (
    <span data-testid="issue-title" onClick={() => { setEditId(it.id); setEditText(it.title); }} title="click to rename"
      style={{ flex: 1, minWidth: 0, color: it.status === "done" || it.status === "canceled" ? C.dim : C.fg, textDecoration: it.status === "canceled" ? "line-through" : "none", fontFamily: nav, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "text" }}>{it.title}</span>
  );

  const headerBtn = (on: boolean): React.CSSProperties => ({ background: on ? C.hover : "transparent", border: "none", color: on ? C.fg : C.muted, borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontFamily: nav, fontSize: 12 });

  return (
    <div data-testid="issues-pane" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.bg, color: C.fg, fontFamily: nav }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Issues</span>
        <span data-testid="issues-count" style={{ color: C.dim, fontFamily: mono, fontSize: 10.5 }}>{open} open{issues.length - open ? ` · ${issues.length - open} closed` : ""}</span>
        <span style={{ flex: 1 }} />
        <div role="tablist" style={{ display: "inline-flex", gap: 2 }}>
          <button role="tab" aria-selected={view === "list"} data-testid="issues-view-list" onClick={() => setView("list")} style={headerBtn(view === "list")}>List</button>
          <button role="tab" aria-selected={view === "board"} data-testid="issues-view-board" onClick={() => setView("board")} style={headerBtn(view === "board")}>Board</button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: `1px solid ${C.border}` }}>
        <Pop testId="issue-new-status" title="status of the new issue" trigger={<StatusIcon s={draftStatus} />}>
          {(close) => STATUSES.filter((s) => s.key !== "canceled").map((s) => <MenuItem key={s.key} icon={<StatusIcon s={s.key} />} label={s.label} on={draftStatus === s.key} onClick={() => { close(); setDraftStatus(s.key); }} />)}
        </Pop>
        <input data-testid="issue-new" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New issue…  ↵"
          onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { const t = draft; setDraft(""); void create(t, draftStatus); } }}
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.fg, fontFamily: nav, fontSize: 13 }} />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: view === "list" ? "auto" : "hidden", display: "flex", flexDirection: "column" }}>
        {!ready && <span style={{ padding: "14px 12px", color: C.dim, fontSize: 12 }}>…</span>}
        {ready && issues.length === 0 && <div data-testid="issues-empty" style={{ padding: "18px 14px", color: C.dim, fontSize: 12.5, lineHeight: 1.6 }}>No issues yet. Type a title above and press Enter.</div>}

        {ready && view === "list" && STATUSES.map((s) => {
          const rows = groups[s.key]; if (!rows.length) return null;
          const shut = collapsed.has(s.key);
          return (
            <section key={s.key} data-testid={`issues-group-${s.key}`}>
              <div onClick={() => setCollapsed((c) => { const n = new Set(c); n.has(s.key) ? n.delete(s.key) : n.add(s.key); return n; })}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: C.panel, borderBottom: `1px solid ${C.border}`, cursor: "pointer", position: "sticky", top: 0, zIndex: 2 }}>
                <span style={{ color: C.dim, fontSize: 9, width: 8 }}>{shut ? "▸" : "▾"}</span><StatusIcon s={s.key} /><span style={{ fontSize: 12.5, fontWeight: 500 }}>{s.label}</span>
                <span style={{ color: C.dim, fontFamily: mono, fontSize: 10.5 }}>{rows.length}</span>
              </div>
              {!shut && rows.map((it) => (
                <div key={it.id} data-testid="issue-row" data-status={it.status} draggable onDragStart={(e) => dragStart(e, it)}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.hover; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", height: 34, borderBottom: `1px solid ${C.border}`, cursor: "default" }}>
                  {priorityMenu(it)}
                  <span style={{ width: 52, flexShrink: 0, color: C.dim, fontFamily: mono, fontSize: 10.5 }}>{issueCode(it.n)}</span>
                  {statusMenu(it)}
                  {titleOf(it)}
                  <span style={{ color: C.dim, fontFamily: mono, fontSize: 10.5, flexShrink: 0 }}>{ageLabel(it.created_at)}</span>
                  <button type="button" data-testid="issue-delete" onClick={() => void remove(it.id)} title="delete" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 11, padding: "0 2px" }}>✕</button>
                </div>
              ))}
            </section>
          );
        })}

        {ready && view === "board" && (
          <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 8, padding: 10, overflowX: "auto" }}>
            {STATUSES.filter((s) => s.key !== "canceled" || groups.canceled.length > 0).map((s) => (
              <div key={s.key} data-testid={`issues-col-${s.key}`} onDragOver={(e) => { e.preventDefault(); setOverCol(s.key); }} onDragLeave={() => setOverCol((c) => (c === s.key ? null : c))} onDrop={() => void drop(s.key)}
                style={{ flex: "1 0 170px", minWidth: 170, display: "flex", flexDirection: "column", minHeight: 0, borderRadius: 8, background: overCol === s.key ? C.hover : C.panel, border: `1px solid ${overCol === s.key ? C.brand : C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px" }}>
                  <StatusIcon s={s.key} /><span style={{ fontSize: 12.5, fontWeight: 500 }}>{s.label}</span><span style={{ color: C.dim, fontFamily: mono, fontSize: 10.5 }}>{groups[s.key].length}</span>
                </div>
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {groups[s.key].map((it) => (
                    <div key={it.id} data-testid="issue-card" data-status={it.status} draggable onDragStart={(e) => dragStart(e, it)}
                      style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 9px", display: "flex", flexDirection: "column", gap: 6, cursor: "grab" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: C.dim, fontFamily: mono, fontSize: 10.5, flex: 1 }}>{issueCode(it.n)}</span>
                        {priorityMenu(it)}
                        <button type="button" data-testid="issue-delete" onClick={() => void remove(it.id)} title="delete" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 10, padding: 0 }}>✕</button>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>{statusMenu(it)}<div style={{ flex: 1, minWidth: 0, display: "flex" }}>{titleOf(it)}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
