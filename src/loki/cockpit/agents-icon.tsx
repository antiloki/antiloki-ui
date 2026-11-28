// THE AGENTS ICON (operator 2026-09-23: "remove the agents running indication on the right bottom, the mini window.
// Keep the agent running in background at a notification icon on the switcher top center. Add a notification icon
// that the border is coloured when some agent is running, discrete. On click open a full window with all
// notifications and agents stats").
//
// The old floating stack sat over the bottom-right corner of every screen — over the Studio's buttons on one tab
// and the composer's chips on another — to say something a dot can say. Here it is one icon in the switcher: a bell
// whose BORDER carries the state, nothing else. Amber when an agent needs an answer, brand while one is working,
// quiet otherwise. Clicking opens the whole picture: what each agent is on, what it has spent, and the workspace's
// notifications.
import * as React from "react";
import { createPortal } from "react-dom";
import { Bell } from "lucide-react";
import { apiGet } from "@/loki/api/client";
import { useNotifications } from "@/loki/api/hooks";
import { C, mono, nav } from "@/loki/theme";
import { paneDisplay } from "@/loki/widgets/types";
import { lineOf, fillOf, type LiveAgent } from "./agents-float";
import { groupNotices, agentGroups, timeAgo, type Notice, type NoticeGroup } from "./notice-story";

/** What the border says, and therefore what the operator is being told. Pure — tested. */
export type AgentsTone = "ask" | "busy" | "quiet";
export function toneOf(agents: LiveAgent[]): AgentsTone {
  if (agents.some((a) => a.run && (a.run.status === "awaiting-answers" || a.run.status === "awaiting-approval"))) return "ask";
  if (agents.some((a) => a.busy || (a.run && (a.run.status === "running" || a.run.status === "planning")))) return "busy";
  return "quiet";
}
/** The agents worth showing: one that has actually done something, never a pane merely provisioned. Pure. */
export function liveOnes(agents: LiveAgent[]): LiveAgent[] {
  return agents.filter((a) => a.running || a.busy || a.preview.text || a.preview.tool || a.run);
}
/** THE MACHINES, NOT THE MODELS (operator 2026-09-24: "we have a loading for subagents on the top, add on the
 *  side for QA, build, test, lint etc so we see live running processes"). A build takes minutes and used to spend
 *  them invisibly — the agent looked idle while the box was busy proving its claim. Each distinct check once,
 *  with a count when several agents are running the same one. Pure — tested. */
/** `1.4 GB` · `812 MB` · "" for an agent holding nothing. The serve computes the same string; this is here so a
 *  row can render without waiting for one. Pure — tested. */
export function ram(bytes: number | undefined): string {
  const b = Number(bytes) || 0;
  if (b <= 0) return "";
  const G = 1024 ** 3;
  return b >= G ? `${(b / G).toFixed(1)} GB` : `${Math.round(b / (1024 * 1024))} MB`;
}
/** The machine's own line, when it is worth saying. An easy box says nothing — a number that is always there is
 *  a number nobody reads. Pure — tested. */
export function machineLine(m: { available?: number; pressure?: string } | null | undefined): { text: string; tone: "warn" | "bad" } | null {
  if (!m || !m.pressure || m.pressure === "easy") return null;
  const left = ram(m.available) || "almost nothing";
  return m.pressure === "critical"
    ? { text: `${left} of memory left — antiloki will pause an agent before the machine freezes`, tone: "bad" }
    : { text: `${left} of memory left`, tone: "warn" };
}

/** HOW FULL THE MACHINE'S MEMORY IS, 0..1 (operator 2026-09-25: "the ram preview on the notification icon
 *  should be more discrete, inside notification window ok show the numbers and everything, but at notification
 *  icon it should show like the icon be filled with like water but at the main color of the theme").
 *
 *  It was a bordered chip reading "1.2 GB ram" that appeared only under pressure — a number shouting next to an
 *  icon. As a fill it can be there always without asking to be read: you see the level, and the figures are one
 *  click away in the window. An unreadable machine has no level at all rather than a misleading empty glass.
 *  Pure — tested. */
export function fillLevel(m: { total?: number; available?: number } | null | undefined): number | null {
  const total = Number(m?.total) || 0;
  const available = Number(m?.available) || 0;
  if (total <= 0 || available <= 0 || available > total) return null;
  return Math.min(1, Math.max(0, (total - available) / total));
}

export function checksRunning(agents: LiveAgent[]): { what: string; n: number }[] {
  const seen = new Map<string, number>();
  for (const a of agents) for (const c of a.checks ?? []) { const k = String(c).trim(); if (k) seen.set(k, (seen.get(k) ?? 0) + 1); }
  return [...seen.entries()].map(([what, n]) => ({ what, n })).sort((a, b) => a.what.localeCompare(b.what));
}
const BORDER: Record<AgentsTone, string> = { ask: C.warn, busy: C.brand, quiet: C.border };
const money = (n: number | null | undefined) => (n == null ? "—" : `$${Number(n).toFixed(Number(n) < 0.1 ? 3 : 2)}`);

export function AgentsIcon({ pollMs = 3_000 }: { pollMs?: number }) {
  const [agents, setAgents] = React.useState<LiveAgent[]>([]);
  const [machine, setMachine] = React.useState<{ available?: number; pressure?: string; human?: string } | null>(null);
  const [open, setOpen] = React.useState(false);
  const [hot, setHot] = React.useState(false);
  React.useEffect(() => {
    let stop = false;
    const tick = async () => { try { const r = await apiGet(`/api/v1/cockpit/agents/live`, { timeoutMs: 8_000 } as any); if (!stop && Array.isArray((r as any)?.agents)) { setAgents((r as any).agents); setMachine((r as any).machine ?? null); } } catch { /* serve away — keep the last */ } };
    void tick();
    const t = setInterval(() => void tick(), pollMs);
    return () => { stop = true; clearInterval(t); };
  }, [pollMs]);
  React.useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open]);
  const shown = liveOnes(agents);
  const tone = toneOf(shown);
  const busyN = shown.filter((a) => a.busy || (a.run && (a.run.status === "running" || a.run.status === "planning"))).length;
  const askN = shown.filter((a) => a.run && (a.run.status === "awaiting-answers" || a.run.status === "awaiting-approval")).length;
  const checks = checksRunning(agents);
  const mline = machineLine(machine);
  const level = fillLevel(machine);
  return (
    <>
      <div data-testid="agents-icon" data-tone={tone} onClick={() => setOpen(true)}
        onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
        title={`${shown.length} agent${shown.length === 1 ? "" : "s"}${busyN ? ` · ${busyN} working` : ""}${askN ? ` · ${askN} waiting on you` : ""}${level != null ? ` · memory ${Math.round(level * 100)}% used, ${ram(machine?.available)} free` : ""} — click for notifications and stats`}
        style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 22, borderRadius: 6, cursor: "pointer",
          border: `1px solid ${BORDER[tone]}`, background: hot ? `color-mix(in oklab, ${C.brand} 10%, transparent)` : "transparent", transition: "background .15s ease, border-color .3s ease" }}>
        {/* the water line: it rises with what the machine is using, in the theme's own colour, behind the bell.
            No number, no border — the figures live in the window this opens. */}
        {level != null && (
          <span data-testid="agents-icon-ram" data-level={Math.round(level * 100)} aria-hidden
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${Math.round(level * 100)}%`,
              background: `color-mix(in oklab, ${mline?.tone === "bad" ? C.bad : C.brand} ${mline?.tone === "bad" ? 34 : 22}%, transparent)`,
              borderRadius: "0 0 5px 5px", transition: "height .6s ease, background .6s ease", pointerEvents: "none" }} />
        )}
        <Bell size={12} strokeWidth={1.75} color={hot ? C.brand : tone === "quiet" ? C.muted : C.fg} aria-hidden style={{ position: "relative" }} />
        {tone === "busy" && <span data-testid="agents-icon-pulse" aria-hidden style={{ position: "absolute", inset: -1, borderRadius: 7, border: `1px solid ${C.brand}`, animation: "antilokiPulse 1.4s ease-in-out infinite", pointerEvents: "none" }} />}
      </div>
      {!!checks.length && (
        <div data-testid="agents-checks" title={`the project's own commands, running now: ${checks.map((c) => c.what).join(" · ")} — a gate is proving an agent's claim`}
          onClick={() => setOpen(true)} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          {checks.map((c) => (
            <span key={c.what} data-testid={`agents-check-${c.what}`}
              style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 0.6, textTransform: "uppercase", color: C.warn, border: `1px solid ${C.warn}`, borderRadius: 5, padding: "0 5px", whiteSpace: "nowrap", animation: "antilokiPulse 1.4s ease-in-out infinite" }}>
              {c.what}{c.n > 1 ? ` ×${c.n}` : ""}
            </span>
          ))}
        </div>
      )}
      {open && createPortal(<AgentsWindow agents={shown} machine={machine} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

/** One notification: the sentence, when it happened, how many times, and the original text one click away — the
 *  raw line is the record and is never thrown away, it is just no longer the first thing anybody reads. */
function Note({ n }: { n: Notice }) {
  const [raw, setRaw] = React.useState(false);
  const tint = n.tone === "bad" ? C.bad : n.tone === "warn" ? C.warn : C.fg;
  return (
    <div data-testid={`agents-note-${n.id}`} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "5px 0", borderTop: `1px dashed ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: tint, lineHeight: 1.45, wordBreak: "break-word", flex: 1, minWidth: 0 }}>{n.text}</span>
        {n.count > 1 && <span data-testid={`agents-note-count-${n.id}`} title="filed more than once — the same event, not several" style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 5px", whiteSpace: "nowrap" }}>×{n.count}</span>}
        <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, whiteSpace: "nowrap" }}>{n.ago}</span>
      </div>
      {n.raw !== n.text && (
        <button onClick={() => setRaw((r) => !r)} style={{ alignSelf: "flex-start", background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: 0 }}>
          {raw ? "▾ hide the original" : "▸ the original line"}
        </button>
      )}
      {raw && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, lineHeight: 1.5, wordBreak: "break-word", borderLeft: `2px solid ${C.border}`, paddingLeft: 7 }}>{n.raw}</span>}
    </div>
  );
}

/** A group of notifications. Antiloki's own faults and its plumbing are FOLDED: on the operator's own box every
 *  one of the fifty rows was internal, and a window whose whole content is antiloki talking about itself has, as
 *  they put it, "no information at all of notifications". Folded, not deleted — the count is still visible and
 *  one click still opens it. */
function NoticeGroupView({ g }: { g: NoticeGroup }) {
  const [open, setOpen] = React.useState(!g.fold);
  return (
    <div data-testid={`notices-${g.key}`} style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: g.key === "you" ? C.warn : C.dim }}>{g.heading} · {g.items.length}</span>
        <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && <>
        <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, lineHeight: 1.5, marginBottom: 2 }}>{g.blurb}</span>
        {g.items.map((n) => <Note key={n.id} n={n} />)}
      </>}
    </div>
  );
}

/** WHAT THE AGENTS ACTUALLY DID (operator 2026-09-24). The notifications table holds antiloki's internals and
 *  nothing else, so the window had nothing to say about the work. This is the timeline's own merged feed — the
 *  asks, the writes, the gates, the turns — which is the thing a person opens this window hoping to find. */
function Activity() {
  const [frames, setFrames] = React.useState<{ t: number; agent: string; glyph: string; op: string; text: string; tone: string }[] | null>(null);
  React.useEffect(() => {
    let stop = false;
    void (async () => {
      try {
        const tz = -new Date().getTimezoneOffset();
        const r: any = await apiGet(`/api/v1/cockpit/timeline?tz=${tz}&limit=40`, { timeoutMs: 15_000 } as any);
        const d = r?.result ?? r;
        if (!stop && Array.isArray(d?.frames)) setFrames(d.frames);
      } catch { if (!stop) setFrames([]); }
    })();
    return () => { stop = true; };
  }, []);
  const tint = (t: string) => (t === "bad" ? C.bad : t === "warn" ? C.warn : t === "ok" ? C.ok : t === "fg" ? C.fg : C.dim);
  return (
    <div data-testid="notices-activity" style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
      <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.fg }}>what your agents did</span>
      {frames === null && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>reading…</span>}
      {frames?.length === 0 && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>nothing yet — an agent's first ask shows up here.</span>}
      {frames?.slice(0, 14).map((f, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "12px 86px 1fr 52px", gap: 6, alignItems: "baseline", fontFamily: mono, fontSize: 9.5 }}>
          <span style={{ color: tint(f.tone) }}>{f.glyph}</span>
          <span title={f.agent} style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.agent}</span>
          <span title={`${f.op} · ${f.text}`} style={{ color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.text || f.op}</span>
          <span style={{ color: C.dim, textAlign: "right" }}>{timeAgo(new Date(f.t).toISOString().replace("T", " ").slice(0, 19))}</span>
        </div>
      ))}
    </div>
  );
}

function AgentsWindow({ agents, machine, onClose }: { agents: LiveAgent[]; machine?: { available?: number; pressure?: string } | null; onClose: () => void }) {
  const notes = useNotifications();
  const rows = Array.isArray(notes.data) ? notes.data : [];
  const spent = agents.reduce((s, a) => s + (Number(a.cost_usd) || 0), 0);
  const head: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} data-testid="agents-window"
        style={{ position: "relative", width: "min(1100px, 92vw)", height: "min(760px, 88vh)", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: nav, fontSize: 14, color: C.fg, fontWeight: 700 }}>Agents</span>
          <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{agents.length} running in the background · {money(spent)} so far</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} title="close (Esc)" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {/* WHAT EACH ONE IS ON — the stack that used to float, given room to say it */}
          <div data-testid="agents-window-stats" style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
            {!agents.length && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>nothing running — an agent appears here the moment it starts</span>}
            {agentGroups(agents).map((g) => <React.Fragment key={g.key}>
              <span data-testid={`agents-group-${g.key}`} style={{ ...head, color: g.key === "ask" ? C.warn : C.dim, marginTop: 4 }}>{g.heading} · {g.items.length}</span>
              {g.items.map((a) => {
              const line = lineOf(a); const fill = fillOf(a); const d = paneDisplay(a.kind);
              const tint = line.tone === "ask" ? C.warn : line.tone === "busy" ? C.brand : line.tone === "done" ? C.dim : C.ok;
              return (
                <div key={a.pane_id} data-testid={`agents-window-${a.pane_id}`} style={{ display: "flex", flexDirection: "column", gap: 5, padding: "8px 10px", border: `1px solid ${line.tone === "ask" ? C.warn : C.border}`, borderRadius: 9 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <span style={{ fontFamily: nav, fontSize: 12, color: C.fg, fontWeight: 600, minWidth: 0, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name ?? d.name}</span>
                    {a.max && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.warn, border: `1px solid ${C.warn}`, borderRadius: 4, padding: "0 3px" }}>MAX</span>}
                    <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, whiteSpace: "nowrap" }}>{a.model ?? d.name} · {money(a.cost_usd)}{ram(a.rss) ? ` · ${ram(a.rss)}` : ""}</span>
                    {a.paused && <span data-testid={`agents-paused-${a.pane_id}`} title="stopped by antiloki because the machine was about to run out of memory — it resumes by itself" style={{ fontFamily: mono, fontSize: 8.5, color: C.warn, border: `1px solid ${C.warn}`, borderRadius: 4, padding: "0 4px" }}>⏸ paused</span>}
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: tint, flexShrink: 0 }} />
                  </div>
                  <div style={{ position: "relative", height: 3, borderRadius: 2, background: C.panel2, overflow: "hidden" }}>
                    {fill != null && <div style={{ position: "absolute", inset: 0, width: `${Math.round(fill * 100)}%`, background: C.brand, borderRadius: 2, transition: "width .4s ease" }} />}
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 10, color: line.tone === "ask" ? C.warn : C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line.text}</span>
                  {!!a.checks?.length && <span data-testid={`agents-window-checks-${a.pane_id}`} style={{ fontFamily: mono, fontSize: 9.5, color: C.warn }}>
                    ◌ running the project's own {a.checks.join(" and ")} on this agent's claim
                  </span>}
                </div>
              );
              })}
            </React.Fragment>)}
          </div>
          {/* THE NOTIFICATIONS — the workspace's, beside the agents that caused most of them */}
          <div data-testid="agents-window-notes" style={{ width: 460, flexShrink: 0, borderLeft: `1px solid ${C.border}`, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            {!rows.length && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>nothing waiting</span>}
            <Activity />
            {groupNotices(rows).map((g) => <NoticeGroupView key={g.key} g={g} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
