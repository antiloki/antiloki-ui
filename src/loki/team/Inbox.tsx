// THE INBOX (UI-4) and THE GATE STACK (UI-2), one list: everything that waits for the person, oldest first. Gates (a run parked at a human step) are answered in place; an open improvement request opens its team.
// In the sidebar it spans every team (a count, and a list when opened); on a team's pane (`team` given) it is that team's stack. It says nothing when nothing waits.
import * as React from "react";
import { C, nav } from "@/loki/theme";
import { Icon } from "./icons";
import { answerAt, listRequests, listTeams, runStatus } from "./api";
import type { Run } from "./types";

export type InboxItem = { key: string; kind: "gate" | "request"; team: string; title: string; sub: string; since_ms: number; run?: string; node?: string; n?: number };
const ago = (ms: number) => { const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
/** The gates a run holds open: each node it is parked at, with what the node says. Pure. */
export function gatesOf(run: Run, since_ms: number, viewedFrom = ""): InboxItem[] {
  // seen from the PARENT's team the gate says whose it is: "inner team <child> · <step>"
  const inner = viewedFrom && viewedFrom.toLowerCase() !== run.team.toLowerCase();
  return Object.entries(run.park_info ?? {}).map(([node, note]) => ({ key: `gate-${run.id}-${node}`, kind: "gate" as const, team: run.team, title: `${inner ? `${run.team} · ` : ""}${run.graph?.nodes?.[node]?.label || node}`, sub: `${inner ? "inner team · " : ""}${String(note || "waits for you")}`, since_ms, run: run.id, node }));
}
/** Oldest first. Pure. */
export const stack = (items: InboxItem[]) => [...items].sort((a, b) => a.since_ms - b.since_ms);

async function collect(team?: string): Promise<InboxItem[]> {
  const l = await listTeams(); if (l.failed) return []; const out: InboxItem[] = [];
  const same = (t: string) => !team || t.toLowerCase() === team.toLowerCase();
  // a team's stack also holds the approvals of the inner teams its runs started (an inner-team node parks its child at a human step: the person answers it from the parent's team)
  for (const r of l.runs.filter((x) => x.needs_you && (same(x.team) || (!!x.parent && same(x.parent.team)))).slice(0, 12)) { const run = await runStatus(r.id); if (run) out.push(...gatesOf(run, r.started_ms, team ?? "")); }
  for (const g of l.graphs.filter((x) => same(x.team)).slice(0, 12)) for (const q of await listRequests(g.team)) if (q.status === "open") out.push({ key: `req-${g.team}-${q.n}`, kind: "request", team: g.team, title: `Request #${q.n} · ${q.problem.slice(0, 70)}`, sub: g.team, since_ms: q.opened_ms, n: q.n });
  return stack(out);
}

export function Inbox({ team, onOpenTeam, pollMs = 10000 }: { team?: string; onOpenTeam?: (team: string) => void; pollMs?: number }) {
  const [items, setItems] = React.useState<InboxItem[]>([]); const [open, setOpen] = React.useState(!!team); const [busy, setBusy] = React.useState<string | null>(null); const [err, setErr] = React.useState<string | null>(null);
  const load = React.useCallback(async () => { if (typeof document !== "undefined" && document.hidden) return; try { setItems(await collect(team)); } catch { /* the serve is busy: keep what is shown */ } }, [team]);
  React.useEffect(() => { void load(); const t = setInterval(load, pollMs); return () => clearInterval(t); }, [load, pollMs]);
  if (!items.length) return null;
  const answer = async (it: InboxItem, approve: boolean) => { setBusy(it.key); setErr(null); const r = await answerAt(it.run!, it.node!, approve); setBusy(null); if (!r.ok) setErr(r.error ?? "the answer did not go through"); await load(); };
  const btn: React.CSSProperties = { height: 24, padding: "0 10px", borderRadius: 5, border: `1px solid ${C.border}`, background: "none", color: C.fg, cursor: "pointer", font: "inherit", fontSize: 12 };
  return (
    <div data-testid={team ? "gate-stack" : "inbox"} style={{ fontFamily: nav, fontSize: 12.5, color: C.fg, padding: team ? "8px 12px" : "0 8px 6px" }}>
      {!team && <button data-testid="inbox-pill" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, height: 30, padding: "0 10px", background: "none", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", font: "inherit" }}><Icon name="hand" size={14} /><span>Inbox</span><span data-testid="inbox-count" style={{ marginLeft: "auto", minWidth: 16, textAlign: "center", fontSize: 11, borderRadius: 8, padding: "0 5px", background: "var(--c-brand, #8a8fff)", color: "#0e0f11", fontWeight: 600 }}>{items.length}</span></button>}
      {open && <div data-testid="inbox-list" style={{ marginTop: team ? 0 : 4, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {team && <div style={{ padding: "6px 14px", color: C.dim, fontSize: 11, letterSpacing: ".04em" }}>WAITING FOR YOU · {items.length}</div>}
        {items.map((it) => (
          <div key={it.key} data-testid={`inbox-${it.key}`} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 34, padding: "6px 14px", borderTop: `1px solid ${C.border}` }}>
            <Icon name={it.kind === "gate" ? "hand" : "branch"} size={14} />
            <span style={{ minWidth: 0, flex: 1 }}><span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span><span style={{ color: C.muted, fontSize: 11.5 }}>{team ? it.sub : it.team} · {ago(it.since_ms)}</span></span>
            {it.kind === "gate" ? <><button style={btn} disabled={busy === it.key} data-testid={`refuse-${it.key}`} onClick={() => answer(it, false)}>Refuse</button><button style={{ ...btn, background: "var(--c-brand, #8a8fff)", borderColor: "var(--c-brand, #8a8fff)", color: "#0e0f11" }} disabled={busy === it.key} data-testid={`allow-${it.key}`} onClick={() => answer(it, true)}>Allow</button></>
              : <button style={btn} data-testid={`open-${it.key}`} onClick={() => onOpenTeam?.(it.team)}>Open</button>}
          </div>))}
        {err && <div data-testid="inbox-error" style={{ padding: "6px 14px", color: "var(--c-bad)" }}>{err}</div>}
      </div>}
    </div>
  );
}
