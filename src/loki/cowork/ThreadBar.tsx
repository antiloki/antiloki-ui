// THE THREAD'S TOP BAR: WHERE IT WORKS (operator 2026-11-27: worktrees belong to threads, never to agents; the person makes one, an agent may only suggest it, and two threads in the project folder get a warning).
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import type { Thread } from "./api";

export type ThreadBarProps = {
  project: string; thread: Thread; /** an action is running */ busy?: boolean;
  /** other threads that also have agents in the project folder, said once when an agent joins them */ crowded?: string[];
  /** a team thread in a project without Git: a team cannot run until it has it */ teamNeedsGit?: boolean; onStartGit?: () => void;
  onCreate: () => void; onNotNow: () => void; onMerge: () => void; onDiscard: () => void; onDismissCrowded: () => void;
};

const btn = (strong?: boolean): React.CSSProperties => ({ fontFamily: nav, fontSize: 11.5, lineHeight: "16px", padding: "2px 9px", borderRadius: 6, cursor: "pointer", background: "transparent", border: `1px solid ${strong ? C.brand : C.border}`, color: strong ? C.brand : C.fg, whiteSpace: "nowrap" });
const row: React.CSSProperties = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "4px 12px", minWidth: 0, borderBottom: `1px solid ${C.border}`, fontSize: 12, fontFamily: nav };

export function ThreadBar({ project, thread, busy, crowded, teamNeedsGit, onStartGit, onCreate, onNotNow, onMerge, onDiscard, onDismissCrowded }: ThreadBarProps) {
  const [sure, setSure] = React.useState(false);
  React.useEffect(() => { setSure(false); }, [thread.id]);
  const main = thread.id === "main"; const tree = thread.tree ?? null;
  const asked = !tree && !main ? thread.suggest ?? null : null;
  const asker = asked ? thread.panes.find((p) => p.paneId === asked.paneId)?.title ?? "An agent" : "";
  return (
    <>
      <div data-testid="thread-bar" style={row}>
        <span aria-hidden style={{ color: tree ? C.brand : C.dim, fontFamily: mono }}>{tree ? "⑂" : "▤"}</span>
        <span data-testid="thread-bar-where" title={tree ? `its own worktree: ${tree.worktree} (branch ${tree.branch})` : "its agents work in the project folder itself"} style={{ color: C.fg, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {project} <span style={{ color: C.dim }}>·</span> {tree ? `${thread.name} worktree` : "project folder"}
        </span>
        {tree && <span style={{ color: tree.ahead || tree.dirty ? C.warn : C.dim, fontFamily: mono, fontSize: 11 }}>{[tree.ahead ? `${tree.ahead} commit${tree.ahead === 1 ? "" : "s"} to merge` : "", tree.dirty ? "uncommitted work" : ""].filter(Boolean).join(" + ") || "nothing to merge"}</span>}
        {!!thread.copies?.length && <span data-testid="thread-bar-copies" title={`${thread.copies.join(", ")}: ${thread.copies.length === 1 ? "works in a copy of its own" : "work in copies of their own"}, not in this folder (a team member, or opened before 2026-11-27)`} style={{ color: C.warn, fontSize: 11.5, whiteSpace: "nowrap" }}>{thread.copies.length} agent{thread.copies.length === 1 ? " has its" : "s have their"} own copy</span>}
        <span style={{ flex: 1 }} />
        {busy ? <span data-testid="thread-bar-busy" style={{ color: C.muted }}>working…</span> : tree ? (
          sure ? (
            <>
              <span style={{ color: C.warn }}>{tree.ahead || tree.dirty ? "Throw away this worktree’s unmerged work? A copy goes to the archive." : "Remove this worktree? Its agents go back to the project folder."}</span>
              <button data-testid="thread-bar-discard-yes" onClick={() => { setSure(false); onDiscard(); }} style={{ ...btn(), borderColor: C.warn, color: C.warn }}>Discard</button>
              <button onClick={() => setSure(false)} style={btn()}>Cancel</button>
            </>
          ) : (
            <>
              <button data-testid="thread-bar-merge" onClick={onMerge} title="commit what is in the worktree and merge it into the project folder; only when the project folder has nothing uncommitted" style={btn(true)}>Merge into project</button>
              <button data-testid="thread-bar-discard" onClick={() => setSure(true)} title="its agents go back to the project folder" style={btn()}>Discard…</button>
            </>
          )
        ) : main || teamNeedsGit ? null : (
          <button data-testid="thread-bar-create" onClick={onCreate} title="give this thread its own branch and folder; its agents move into it and keep their conversations" style={btn()}>⑂ Create worktree</button>
        )}
      </div>
      {teamNeedsGit && !busy && (
        <div data-testid="thread-bar-team-git" role="status" style={{ ...row, background: `color-mix(in srgb, ${C.warn} 10%, transparent)` }}>
          <span style={{ color: C.fg, minWidth: 0, flex: "1 1 240px" }}>This team cannot run yet: each of its workers needs a copy of the project, and that needs Git.</span>
          <button data-testid="thread-bar-start-git" onClick={onStartGit} style={btn(true)}>Start Git…</button>
        </div>
      )}
      {asked && !busy && (
        <div data-testid="thread-bar-suggest" role="status" style={{ ...row, background: `color-mix(in srgb, ${C.brand} 9%, transparent)` }}>
          <span style={{ color: C.fg, minWidth: 0, flex: "1 1 240px", overflowWrap: "anywhere" }}><b style={{ fontWeight: 600 }}>{asker}</b> suggests a worktree for this thread: {asked.reason}</span>
          <button data-testid="thread-bar-suggest-yes" onClick={onCreate} style={btn(true)}>Create</button>
          <button data-testid="thread-bar-suggest-no" onClick={onNotNow} style={btn()}>Not now</button>
        </div>
      )}
      {crowded && crowded.length > 0 && !tree && !busy && (
        <div data-testid="thread-bar-crowded" role="status" style={{ ...row, background: `color-mix(in srgb, ${C.warn} 10%, transparent)` }}>
          <span style={{ color: C.fg, minWidth: 0, flex: "1 1 240px" }}>{crowded.join(", ")} {crowded.length === 1 ? "also has" : "also have"} agents in the project folder, so their edits can overwrite each other.{main ? ` A worktree for ${crowded.length === 1 ? "that thread" : "one of those threads"} keeps them apart.` : ""}</span>
          {!main && <button data-testid="thread-bar-crowded-yes" onClick={onCreate} style={btn(true)}>Create worktree here</button>}
          <button data-testid="thread-bar-crowded-no" onClick={onDismissCrowded} style={btn()}>Keep sharing</button>
        </div>
      )}
    </>
  );
}
