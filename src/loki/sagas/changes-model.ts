// WHAT A SAGA CHANGED (operator 2026-11-10: "inside a saga when the code is changed add diff for that saga"). The serve keeps a snapshot of the agent's box in the saga's sqlite; this reads one for the screen. Pure.
export type ChangeFile = { path: string; status: "modified" | "added" | "deleted" | "renamed"; added: number; removed: number };
export type Change = { id: number; saga_id: number; task_id: number | null; t_ms: number; actor: string; files: ChangeFile[]; added: number; removed: number; truncated: boolean; patch?: string };
export type Line = { kind: "hunk" | "add" | "del" | "ctx" | "meta"; text: string };
export type FileDiff = { path: string; status: ChangeFile["status"]; lines: Line[]; binary: boolean };

/** A unified diff as files with coloured lines. Header noise (index, mode, ---/+++) is kept as `meta` so nothing is hidden, and a binary file is flagged instead of drawn. */
export function parsePatch(patch: string): FileDiff[] {
  const out: FileDiff[] = []; let cur: FileDiff | null = null; let inHunk = false;
  for (const l of patch.split("\n")) {
    if (l.startsWith("diff --git ")) { cur = { path: l.slice(11).split(" b/").pop() ?? "", status: "modified", lines: [], binary: false }; out.push(cur); inHunk = false; continue; }
    if (!cur) continue;
    if (!inHunk) {
      if (l.startsWith("new file mode")) cur.status = "added"; else if (l.startsWith("deleted file mode")) cur.status = "deleted"; else if (l.startsWith("rename to ")) { cur.status = "renamed"; cur.path = l.slice(10); }
      else if (l.startsWith("Binary files") || l.startsWith("GIT binary patch")) cur.binary = true;
      if (l.startsWith("@@")) { inHunk = true; cur.lines.push({ kind: "hunk", text: l }); } else if (l) cur.lines.push({ kind: "meta", text: l });
      continue;
    }
    if (l.startsWith("@@")) cur.lines.push({ kind: "hunk", text: l });
    else if (l.startsWith("+")) cur.lines.push({ kind: "add", text: l.slice(1) });
    else if (l.startsWith("-")) cur.lines.push({ kind: "del", text: l.slice(1) });
    else if (l.startsWith("\\")) cur.lines.push({ kind: "meta", text: l });
    else if (l !== "" || cur.lines.length) cur.lines.push({ kind: "ctx", text: l.startsWith(" ") ? l.slice(1) : l });
  }
  for (const f of out) { while (f.lines.length && f.lines[f.lines.length - 1].kind === "ctx" && f.lines[f.lines.length - 1].text === "") f.lines.pop(); }
  return out;
}
/** The one line a snapshot is listed as. */
export function changeLine(c: Pick<Change, "files" | "added" | "removed">): string {
  const n = c.files.length; const first = c.files.slice(0, 2).map((f) => f.path).join(", ");
  return `${n} file${n === 1 ? "" : "s"} · +${c.added} −${c.removed} · ${first}${n > 2 ? ` and ${n - 2} more` : ""}`;
}
