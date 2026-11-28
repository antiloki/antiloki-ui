// HOW FAR A THREAD HAS DRIFTED FROM THE WORKSPACE (the operator 2026-11-22: a warning when a team develops for too long, its diff grows too big, or its worktree gets too old, to merge with main: keep it up to date, never delete it, update it). Pure.
import type { ThreadTree } from "./api";
export const DRIFT = { behind: 10, days: 7, lines: 800, files: 40 } as const;
export type Drift = { warn: boolean; reasons: string[]; line: string };
export function treeDrift(t: ThreadTree | null | undefined): Drift {
  if (!t) return { warn: false, reasons: [], line: "" }; const r: string[] = [];
  const behind = t.behind ?? 0, days = t.age_days ?? 0, lines = t.lines ?? 0, files = t.files ?? 0;
  if (behind >= DRIFT.behind) r.push(`${behind} commits behind the workspace`);
  if (days >= DRIFT.days && behind > 0) r.push(`last updated from the workspace ${days} days ago`);
  if (lines >= DRIFT.lines || files >= DRIFT.files) r.push(`a big change: ${files} files, ${lines} lines`);
  return { warn: r.length > 0, reasons: r, line: r.join("; ") };
}
