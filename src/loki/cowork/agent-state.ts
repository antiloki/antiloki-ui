// THE AGENTS LIST, THE HERDR WAY (RFC 0007 §5.6, board v3): four sections by urgency, a parent takes its most urgent
// sub-agent's place, and a finished agent you looked at stays in Done until you move on. Pure and tested.

export type AgentStatus = "blocked" | "done" | "working" | "idle";
export type AgentRole = "planner" | "worker" | "qa";
export type AgentRow = { id: string; name: string; status: AgentStatus; /** the engine: its sprite is the row's icon */ engine?: string; detail?: string; parent?: string | null; /** its place in a team, and which team (id and the name shown) */ role?: AgentRole; /** a side question: read-only, bound to another agent */ side?: boolean; team?: string; teamName?: string };
export const RANK: Record<AgentStatus, number> = { blocked: 4, done: 3, working: 2, idle: 1 };
export const SECTION_LABEL: Record<AgentStatus, string> = { blocked: "Needs you", done: "Done", working: "Working", idle: "Idle" };
export const SECTION_ORDER: AgentStatus[] = ["blocked", "done", "working", "idle"];

/** Which finished agents the person has already looked at. */
export type Seen = ReadonlySet<string>;

/** Record that a finished agent is being looked at; forget one that went back to work or was never done. */
export function noteViewing(seen: Seen, rows: AgentRow[], focusedId: string | null): Seen {
  const next = new Set<string>();
  for (const r of rows) {
    if (r.status !== "done") continue; // working, blocked or idle again: its next "done" is news
    if (seen.has(r.id) || r.id === focusedId) next.add(r.id);
  }
  return next.size === seen.size && [...next].every((i) => seen.has(i)) ? seen : next;
}

/** A finished agent that was seen turns idle once you leave it. Looking at it does not: it stays in Done while focused. */
export function ownStatus(r: AgentRow, seen: Seen, focusedId: string | null): AgentStatus {
  return r.status === "done" && seen.has(r.id) && r.id !== focusedId ? "idle" : r.status;
}

/** A sub-agent is never "done": it reports to its parent, and the parent's done is the news. An error counts as blocked. */
const kidStatus = (s: AgentStatus): AgentStatus => (s === "done" ? "idle" : s);

/** The status each row is shown with: its own, or its most urgent sub-agent's if that is more urgent. */
export function effectiveStatuses(rows: AgentRow[], seen: Seen, focusedId: string | null): Map<string, AgentStatus> {
  const own = new Map(rows.map((r) => [r.id, ownStatus(r, seen, focusedId)] as const));
  const out = new Map(own);
  for (const r of rows) {
    if (!r.parent || !own.has(r.parent)) continue;
    const kid = kidStatus(own.get(r.id)!);
    const cur = out.get(r.parent)!;
    if (RANK[kid] > RANK[cur]) out.set(r.parent, kid);
  }
  return out;
}

export type Section = { status: AgentStatus; label: string; rows: AgentRow[] };
/** The sidebar's sections, urgent first; empty ones are left out; sub-agents sit under their parent, not in a section of their own. */
export function sections(rows: AgentRow[], seen: Seen, focusedId: string | null): Section[] {
  const eff = effectiveStatuses(rows, seen, focusedId);
  const known = new Set(rows.map((r) => r.id));
  const tops = rows.filter((r) => (!r.parent || !known.has(r.parent)) && !r.team);   // a team's members have their own subsection
  return SECTION_ORDER
    .map((status) => ({ status, label: SECTION_LABEL[status], rows: tops.filter((r) => eff.get(r.id) === status) }))
    .filter((s) => s.rows.length > 0);
}
export const kidsOf = (rows: AgentRow[], id: string): AgentRow[] => rows.filter((r) => r.parent === id);
/** A folded group says how many it holds and the most urgent state in it. */
export function foldSummary(rows: AgentRow[], seen: Seen, focusedId: string | null): { count: number; top: AgentStatus } {
  const eff = effectiveStatuses(rows, seen, focusedId);
  let top: AgentStatus = "idle";
  for (const r of rows) { const s = eff.get(r.id) ?? "idle"; if (RANK[s] > RANK[top]) top = s; }
  return { count: rows.length, top };
}

/** THE TEAM SUBSECTIONS (operator 2026-11-10: "team flags and a subsection for the team on the agents"): each team's members, planner first, then worker, then QA, each keeping its own status. Teams with no member open are left out. Pure. */
export type TeamGroup = { team: string; name: string; rows: AgentRow[]; top: AgentStatus };
const ROLE_ORDER: Record<AgentRole, number> = { planner: 0, worker: 1, qa: 2 };
export function teamGroups(rows: AgentRow[], seen: Seen, focusedId: string | null): TeamGroup[] {
  const eff = effectiveStatuses(rows, seen, focusedId); const by = new Map<string, TeamGroup>();
  for (const r of rows) { if (!r.team) continue; const g = by.get(r.team) ?? { team: r.team, name: r.teamName || r.team, rows: [], top: "idle" as AgentStatus }; g.rows.push(r); by.set(r.team, g); }
  return [...by.values()].map((g) => { g.rows.sort((a, b) => (ROLE_ORDER[a.role ?? "worker"] ?? 9) - (ROLE_ORDER[b.role ?? "worker"] ?? 9)); for (const r of g.rows) { const st = eff.get(r.id) ?? "idle"; if (RANK[st] > RANK[g.top]) g.top = st; } return g; });
}
