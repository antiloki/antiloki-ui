// THE PANES A TEAM THREAD CANNOT BE WITHOUT (the operator 2026-11-15: "both are obligatory on a team thread"): the team's own pane and the Leader's terminal.
export const leaderKey = (team: string) => `antiloki.team.leader.${team}`;
/** The panes a team thread cannot close: the team's own pane, and the Leader's terminal (the one the thread remembered, else the first terminal in it). Pure over the panes and the stored number. */
export function teamRequired(panes: { id: string; kind: string; tool?: string; paneId?: number; leaderOf?: string }[], team: string | null, stored?: number): Set<string> {
  const out = new Set<string>(); if (!team) return out; let sv = stored; if (sv === undefined) { try { sv = Number(localStorage.getItem(leaderKey(team))) || 0; } catch { sv = 0; } }
  for (const p of panes) if (p.tool === "team") out.add(p.id);
  const engines = panes.filter((p) => p.kind === "engine" && !p.leaderOf); const lead = engines.find((p) => p.paneId === sv) ?? engines[0]; if (lead) out.add(lead.id); return out;
}
/** The Leader's terminal of a team thread (its pane number), the same one `teamRequired` protects. Pure. */
export function leaderPaneOf(panes: { id: string; kind: string; paneId?: number; leaderOf?: string }[], team: string | null, stored?: number): number {
  if (!team) return 0; let sv = stored; if (sv === undefined) { try { sv = Number(localStorage.getItem(leaderKey(team))) || 0; } catch { sv = 0; } }
  const engines = panes.filter((p) => p.kind === "engine" && !p.leaderOf); return (engines.find((p) => p.paneId === sv) ?? engines[0])?.paneId ?? 0;
}
