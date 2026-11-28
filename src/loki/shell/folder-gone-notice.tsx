// THE ACTIVE FOLDER VANISHED, AND THE DESK STAYED SILENT (QA report BUG-006, 2026-10-06).
// When the folder of the ACTIVE workspace is deleted or unmounted the serve heals: it rebinds to another registered workspace (workspace self-heal) and
// flags the lost one `missing`. That is the right repair and the wrong silence - the desk then looks like a healthy project, and a person who has
// just lost a folder is looking at a different one without being told. The switcher marked the lost row, but only the row.
// So: remember which workspace was active; when the list comes back with that one `missing` and a different one (or none) active, say so once.
import React from "react";
import { C, mono } from "@/loki/theme";
import { useWorkspaces } from "@/loki/api/hooks";
import type { WorkspaceList } from "@/loki/api/dispatch";

export type FolderGone = { gone: string; path: string; now: string | null };

/** The notice the change from `prev` to `next` calls for, or null. A switch the person made (the previous workspace still has its folder) never qualifies. Pure. */
export function folderGoneNotice(prev: WorkspaceList | null | undefined, next: WorkspaceList | null | undefined): FolderGone | null {
  const was = prev?.active;
  if (!was || !next) return null;
  if (next.active?.id === was.id) return null;                               // still on it
  const row = next.workspaces?.find((w) => w.id === was.id);
  if (!row || row.missing !== true) return null;                              // removed on purpose, or switched away with the folder intact
  return { gone: was.name, path: was.root_path, now: next.active?.name ?? null };
}

export function FolderGoneNotice() {
  const { data } = useWorkspaces();
  const last = React.useRef<WorkspaceList | null>(null);
  const [notice, setNotice] = React.useState<FolderGone | null>(null);
  React.useEffect(() => {
    if (!data) return;                                                         // a switch drops the poll's data for a moment: keep what we last saw
    const n = folderGoneNotice(last.current, data);
    if (n) setNotice(n);
    last.current = data;
  }, [data]);
  if (!notice) return null;
  return (
    <div role="alert" data-testid="folder-gone-notice"
      style={{ position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 450, maxWidth: "min(720px, calc(100vw - 32px))", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", fontFamily: mono, fontSize: 11.5, color: C.fg, background: C.panel, border: `1px solid ${C.warn}`, borderRadius: 10, boxShadow: "0 8px 30px rgba(0,0,0,.35)" }}>
      <span style={{ color: C.warn }}>◆</span>
      <span style={{ flex: 1 }}>
        The folder for <b>{notice.gone}</b> is gone ({notice.path}), so antiloki {notice.now ? <>switched to <b>{notice.now}</b></> : "has no active workspace now"}. Nothing was deleted — put the folder back and it returns to the list.
      </span>
      <button data-testid="folder-gone-dismiss" onClick={() => setNotice(null)} aria-label="Dismiss"
        style={{ background: "transparent", color: C.dim, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontFamily: mono, fontSize: 11 }}>dismiss</button>
    </div>
  );
}
