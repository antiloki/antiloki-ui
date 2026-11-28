// THE FILES EDITED DIRECTLY SINCE THE LAST REBUILD (operator 2026-10-11: "any part of the code edited directly will flag that needs to rebuild").
// The X-ray's analysis (graph, scores, reviews, docs) is derived from the code at the last rebuild; the moment the Code tab saves a change, that derivation is out of date for those files. This is the one place that says so:
// the editor calls `markEdited` after a successful save, the rebuild button shows the count, and a finished rebuild calls `clearEditedBefore(root, startedAt)` - an edit saved WHILE the rebuild ran is newer than
// it and stays flagged. Per workspace (a path means nothing without its folder), and kept in localStorage so a reload does not forget that the analysis is stale. Pure store + one hook - tested.
import React from "react";

const LS = "antiloki.code-edits";
type Book = Record<string, Record<string, number>>;   // root -> path -> time of the last saved edit

function load(): Book { try { const v = JSON.parse(localStorage.getItem(LS) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } }
let book: Book = load();
let version = 0;
const listeners = new Set<() => void>();
function commit() { version++; try { localStorage.setItem(LS, JSON.stringify(book)); } catch { /* private window: the flag lives in memory only */ } listeners.forEach((l) => l()); }

/** a saved edit of `path` in the workspace at `root` */
export function markEdited(root: string, path: string, at: number = Date.now()): void { (book[root] ??= {})[path] = at; commit(); }
/** a rebuild that STARTED at `t` has re-read every file as of then: edits saved at or before `t` are no longer stale */
export function clearEditedBefore(root: string, t: number): void {
  const b = book[root]; if (!b) return; let changed = false;
  for (const p of Object.keys(b)) if (b[p] <= t) { delete b[p]; changed = true; }
  if (!Object.keys(b).length) delete book[root];
  if (changed) commit();
}
export function editedPaths(root: string): string[] { return Object.keys(book[root] ?? {}).sort(); }
/** test helper: forget everything */
export function resetEdits(): void { book = {}; commit(); }

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** the paths edited since the last rebuild in this workspace; re-renders when one is saved or a rebuild clears them */
export function useEditedPaths(root: string | null | undefined): string[] {
  const v = React.useSyncExternalStore(subscribe, () => version, () => 0);
  return React.useMemo(() => (root ? editedPaths(root) : []), [root, v]);   // eslint-disable-line react-hooks/exhaustive-deps
}
