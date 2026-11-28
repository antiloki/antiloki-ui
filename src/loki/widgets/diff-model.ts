// THE DIFF PANE'S MODEL: what the serve says an agent's box changed (`/api/v1/diff`: git against the commit the box was cut from, uncommitted and new files included, no model) and the lines of a patch,
// read defensively. Pure.
export type DiffFile = { path: string; status: string; add: number; del: number; binary: boolean };
export type DiffSummary = { base: string; ahead: number; files: DiffFile[]; hidden: number };
export type PatchLine = { kind: "add" | "del" | "ctx" | "hunk" | "meta"; text: string; old?: number; now?: number };
const str = (v: unknown, n = 400) => (typeof v === "string" ? v.slice(0, n) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
export function parseDiffSummary(raw: unknown): DiffSummary | null {
  const r = raw as any; if (!r || r.ok !== true || !Array.isArray(r.files)) return null;
  return { base: str(r.base, 12), ahead: num(r.ahead), hidden: num(r.hidden), files: r.files.filter((f: any) => f && typeof f.path === "string").map((f: any) => ({ path: str(f.path, 500), status: str(f.status, 2) || "M", add: num(f.add), del: num(f.del), binary: f.binary === true })) };
}
export const STATUS_WORD: Record<string, string> = { M: "modified", A: "added", D: "deleted", R: "renamed", "?": "new", C: "copied", T: "type changed" };
export const totals = (fs: readonly DiffFile[]) => ({ files: fs.length, add: fs.reduce((n, f) => n + f.add, 0), del: fs.reduce((n, f) => n + f.del, 0) });
/** A unified diff as lines, with the line numbers of the old and new side where they apply. The header lines before the first hunk are `meta`. Pure - tested. */
export function parsePatch(text: string): PatchLine[] {
  const out: PatchLine[] = []; let o = 0, n = 0, inHunk = false;
  for (const l of text.replace(/\n$/, "").split("\n")) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) { o = Number(h[1]); n = Number(h[2]); inHunk = true; out.push({ kind: "hunk", text: l }); continue; }
    if (!inHunk) { out.push({ kind: "meta", text: l }); continue; }
    if (l.startsWith("+")) out.push({ kind: "add", text: l.slice(1), now: n++ }); else if (l.startsWith("-")) out.push({ kind: "del", text: l.slice(1), old: o++ });
    else if (l.startsWith("\\")) out.push({ kind: "meta", text: l }); else { out.push({ kind: "ctx", text: l.slice(1), old: o++, now: n++ }); }
  }
  return out;
}
