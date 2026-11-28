// WHAT THIS PANE HAS DONE IN ITS OWN BOX (operator 2026-09-25: "on the sidebar right of the agent pane should
// have the icon to see the diff done on that pane, and another to see the commits done on that pane. Only on
// that pane").
//
// Two rail views over one endpoint. Scoped to the pane deliberately: a rail showing the whole repository would
// be the workspace view that already exists elsewhere, and the ask was for this agent's own work.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiGet, unwrapResult as unwrap } from "@/loki/api/client";
// the SAME file renderer the story's diff uses — one definition of how a change is shown, so the
// rail and the run report cannot drift into two different diffs of the same file
import { FileDiff, type WorkDiff as WorkDiffData } from "@/loki/chat/work-diff";

export type Commit = { sha: string; when: string; who: string; subject: string };
export type PaneWork = { ok: boolean; cwd: string; changed: number; diff: WorkDiffData; commits: Commit[] };

export async function fetchPaneWork(paneId: number): Promise<PaneWork | null> {
  try {
    const r: any = unwrap(await apiGet(`/api/v1/cockpit/pane/work?pane_id=${paneId}`, { timeoutMs: 30_000 } as any));
    return r?.ok ? (r as PaneWork) : null;
  } catch { return null; }
}

/** `2026-09-25 14:02` → `14:02` when it is today, the date otherwise. Pure — tested. */
export function whenShort(when: string, today = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(when.trim());
  if (!m) return when;
  const [, y, mo, d, hm] = m;
  const isToday = today.getFullYear() === Number(y) && today.getMonth() + 1 === Number(mo) && today.getDate() === Number(d);
  return isToday ? hm : `${d}/${mo} ${hm}`;
}

/** What the rail header says under the title. Pure — tested. */
export function workLine(w: PaneWork | null | undefined, kind: "diff" | "commits"): string {
  if (!w) return "reading this box…";
  if (kind === "commits") return w.commits.length ? `${w.commits.length} commit${w.commits.length === 1 ? "" : "s"} on this agent's branch` : "no commits on this branch yet";
  // A CLEAN BOX IS NOT AN EMPTY PANEL. "nothing yet" and "nothing changed" are different facts and the
  // operator should not have to guess which one a blank box means.
  return w.changed ? `${w.changed} file${w.changed === 1 ? "" : "s"} changed and not yet committed` : "nothing changed since the last commit";
}

function Shell({ kind, paneId }: { kind: "diff" | "commits"; paneId: number }) {
  const [w, setW] = React.useState<PaneWork | null | undefined>(undefined);
  // the inline/side-by-side choice is the operator's and is remembered, the same key the story's diff uses so
  // the two surfaces agree rather than each keeping its own idea of how they like diffs
  const [side, setSideRaw] = React.useState<boolean>(() => { try { return localStorage.getItem("antiloki:diff-view") === "side"; } catch { return false; } });
  const setSide = (v: boolean) => { setSideRaw(v); try { localStorage.setItem("antiloki:diff-view", v ? "side" : "inline"); } catch { /* private mode */ } };
  React.useEffect(() => { let live = true; void fetchPaneWork(paneId).then((x) => { if (live) setW(x); }); return () => { live = false; }; }, [paneId]);
  const line = workLine(w ?? null, kind);
  return (
    <div data-testid={`pane-${kind}`} style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
      <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{line}</span>
      {w && kind === "commits" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
          {w.commits.map((c) => (
            <div key={c.sha} style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: mono, fontSize: 10 }}>
              <span style={{ color: C.brand, flexShrink: 0 }}>{c.sha}</span>
              <span style={{ color: C.fg, flex: 1, minWidth: 0, wordBreak: "break-word" }}>{c.subject}</span>
              <span style={{ color: C.dim, flexShrink: 0, fontSize: 9 }}>{whenShort(c.when)}</span>
            </div>
          ))}
        </div>
      )}
      {w && kind === "diff" && !!w.changed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", minHeight: 0 }}>
          {w.diff.files.map((f) => <FileDiff key={f.path} f={f} side={side} onSide={setSide} />)}
        </div>
      )}
    </div>
  );
}

export const PaneDiffView = ({ paneId }: { paneId: number }) => <Shell kind="diff" paneId={paneId} />;
export const PaneCommitsView = ({ paneId }: { paneId: number }) => <Shell kind="commits" paneId={paneId} />;
