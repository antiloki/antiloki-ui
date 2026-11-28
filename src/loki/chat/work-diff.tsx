// THE DIFF, SIDE BY SIDE (operator 2026-09-24: "at the beautiful box i just mentioned didnt appeared the diff
// also side by side to the old version of all touched files").
//
// The serve hands over both texts (serve/src/work_diff.rs); the alignment is done here because it is a rendering
// decision, and doing it in the browser keeps the payload two strings instead of a hunk format nobody else needs.
// It carries the serve's note about what "old" means — the last commit, not a per-turn snapshot — because a diff
// that silently folds in other turns is worse than no diff.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";

const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;

export type FilePair = { path: string; old: string; new: string; added: boolean; deleted: boolean; same: boolean; truncated: boolean };
export type WorkDiff = { files: FilePair[]; note: string };

export async function fetchDiff(runId: number): Promise<WorkDiff | null> {
  try { const r = unwrap(await apiGet(`/api/v1/cockpit/goals/diff?id=${runId}`, { timeoutMs: 30_000 } as any)); return Array.isArray(r?.files) ? { files: r.files, note: String(r.note ?? "") } : null; }
  catch { return null; }
}

export type Row = { kind: "same" | "add" | "del" | "gap"; oldN: number | null; newN: number | null; oldText: string; newText: string; hidden?: number };

/** The longest common subsequence of two line lists, as index pairs. Plain O(n·m) — the files a turn touches are
 *  source files, and a smarter algorithm here would be complexity nobody is paying for. Pure. */
function lcs(a: string[], b: string[]): [number, number][] {
  if (!a.length || !b.length) return [];
  // guard: a pathological pair (a minified bundle) is not worth 100M cells — fall back to no common lines
  if (a.length * b.length > 4_000_000) return [];
  const t: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out: [number, number][] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push([i, j]); i++; j++; }
    else if (t[i + 1][j] >= t[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/** Old and new lines, aligned into rows. Unchanged stretches longer than `context * 2 + 1` collapse into one
 *  "gap" row carrying how many lines it stands for — a 900-line file with a two-line change should read as a
 *  two-line change. Pure — tested. */
export function alignLines(oldText: string, newText: string, context = 3): Row[] {
  const a = oldText === "" ? [] : oldText.replace(/\n$/, "").split("\n");
  const b = newText === "" ? [] : newText.replace(/\n$/, "").split("\n");
  const common = lcs(a, b);
  const rows: Row[] = [];
  let i = 0, j = 0, k = 0;
  const pushSame = (ai: number, bi: number) => rows.push({ kind: "same", oldN: ai + 1, newN: bi + 1, oldText: a[ai], newText: b[bi] });
  while (i < a.length || j < b.length) {
    const next = common[k];
    if (next && next[0] === i && next[1] === j) { pushSame(i, j); i++; j++; k++; continue; }
    const stopA = next ? next[0] : a.length;
    const stopB = next ? next[1] : b.length;
    while (i < stopA || j < stopB) {
      const del = i < stopA ? a[i] : null;
      const add = j < stopB ? b[j] : null;
      rows.push({ kind: del != null && add != null ? "del" : del != null ? "del" : "add",
        oldN: del != null ? i + 1 : null, newN: add != null ? j + 1 : null,
        oldText: del ?? "", newText: add ?? "" });
      if (del != null && add != null) rows[rows.length - 1].kind = "del";   // a replaced line shows both sides
      if (del != null) i++;
      if (add != null) j++;
    }
  }
  return collapse(rows, context);
}
/** Fold long runs of unchanged rows into a single gap. Pure — tested. */
export function collapse(rows: Row[], context: number): Row[] {
  const keep = new Array(rows.length).fill(false);
  rows.forEach((r, i) => {
    if (r.kind === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) keep[k] = true;
  });
  if (!rows.some((r) => r.kind !== "same")) return rows;   // an unchanged file shows whole; there is nothing to hide
  const out: Row[] = [];
  let run = 0;
  rows.forEach((r, i) => {
    if (keep[i]) { if (run) { out.push({ kind: "gap", oldN: null, newN: null, oldText: "", newText: "", hidden: run }); run = 0; } out.push(r); }
    else run++;
  });
  if (run) out.push({ kind: "gap", oldN: null, newN: null, oldText: "", newText: "", hidden: run });
  return out;
}

/** THE UNIFIED VIEW (operator 2026-09-24: "the diff is ugly, doesnt seems like a diff of code, also, hasnt
 *  enough space to show side by side changes, so make a single diff trail… the default show inline diff").
 *
 *  Side by side needs two full-width columns, and the story box is half a screen — every line wrapped or clipped,
 *  which is why it did not read as code. One column, the way `git diff` prints it: the removed line, then the
 *  added one, each with the number from its own side. Pure — tested. */
export type InlineRow = { kind: "same" | "add" | "del" | "gap"; oldN: number | null; newN: number | null; text: string; hidden?: number };
export function inlineRows(rows: Row[]): InlineRow[] {
  const out: InlineRow[] = [];
  for (const r of rows) {
    if (r.kind === "gap") { out.push({ kind: "gap", oldN: null, newN: null, text: "", hidden: r.hidden }); continue; }
    if (r.kind === "same") { out.push({ kind: "same", oldN: r.oldN, newN: r.newN, text: r.oldText }); continue; }
    // a replaced line is two lines here — that is what makes it read as a diff rather than as a table
    if (r.oldN != null) out.push({ kind: "del", oldN: r.oldN, newN: null, text: r.oldText });
    if (r.newN != null) out.push({ kind: "add", oldN: null, newN: r.newN, text: r.newText });
  }
  return out;
}

/** "3 added · 1 removed" — what the header says about a file without anybody counting lines by eye. Pure. */
export function countsOf(rows: Row[]): { added: number; removed: number } {
  return { added: rows.filter((r) => r.newN != null && r.kind !== "same").length, removed: rows.filter((r) => r.oldN != null && r.kind !== "same").length };
}

const cell: React.CSSProperties = { fontFamily: mono, fontSize: 9.5, lineHeight: 1.55, whiteSpace: "pre", padding: "0 7px", verticalAlign: "top" };
const num: React.CSSProperties = { ...cell, color: C.dim, textAlign: "right", userSelect: "none", width: 34, minWidth: 34 };

export function FileDiff({ f, side, onSide }: { f: FilePair; side: boolean; onSide: (v: boolean) => void }) {
  const [open, setOpen] = React.useState(false);
  const rows = React.useMemo(() => (open ? alignLines(f.old, f.new) : []), [open, f.old, f.new]);
  const lines = React.useMemo(() => (open && !side ? inlineRows(rows) : []), [open, side, rows]);
  const counts = React.useMemo(() => countsOf(rows), [rows]);
  const tag = f.added ? "new file" : f.deleted ? "deleted" : f.same ? "unchanged" : "";
  const bg = (k: InlineRow["kind"]) => (k === "add" ? `color-mix(in oklab, ${C.ok} 13%, transparent)` : k === "del" ? `color-mix(in oklab, ${C.bad} 13%, transparent)` : "transparent");
  return (
    <div data-testid="diff-file" style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 9px", cursor: "pointer", background: `color-mix(in oklab, ${C.panel} 55%, transparent)` }}>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{f.path}</span>
        {tag && <span style={{ fontFamily: mono, fontSize: 8.5, color: f.deleted ? C.bad : f.added ? C.ok : C.dim, border: `1px solid ${C.border}`, borderRadius: 5, padding: "0 5px" }}>{tag}</span>}
        {open && !f.same && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}><b style={{ color: C.ok }}>+{counts.added}</b> <b style={{ color: C.bad }}>−{counts.removed}</b></span>}
        {open && <button data-testid="diff-flip" onClick={(e) => { e.stopPropagation(); onSide(!side); }} title={side ? "show it as one column, the way git prints it" : "show the old and the new side by side"}
          style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "0 6px", cursor: "pointer", fontFamily: mono, fontSize: 8.5 }}>{side ? "⇥ inline" : "⇹ side by side"}</button>}
      </div>
      {open && (
        <div style={{ overflowX: "auto" }}>
          {f.truncated && <div style={{ fontFamily: mono, fontSize: 9, color: C.warn, padding: "3px 9px" }}>⚠ this file is too long to show whole — the text below is cut</div>}
          {side ? (
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup><col style={{ width: 34 }} /><col style={{ width: "50%" }} /><col style={{ width: 34 }} /><col style={{ width: "50%" }} /></colgroup>
              <tbody>
                {rows.map((r, i) => r.kind === "gap" ? (
                  <tr key={i}><td colSpan={4} style={{ ...cell, color: C.dim, textAlign: "center", background: `color-mix(in oklab, ${C.panel} 35%, transparent)` }}>⋯ {r.hidden} unchanged line{r.hidden === 1 ? "" : "s"}</td></tr>
                ) : (
                  <tr key={i}>
                    <td style={num}>{r.oldN ?? ""}</td>
                    <td style={{ ...cell, color: r.oldN != null && r.kind !== "same" ? C.fg : C.muted, background: r.oldN != null && r.kind !== "same" ? bg("del") : "transparent" }}>{r.oldText}</td>
                    <td style={num}>{r.newN ?? ""}</td>
                    <td style={{ ...cell, color: r.newN != null && r.kind !== "same" ? C.fg : C.muted, background: r.newN != null && r.kind !== "same" ? bg("add") : "transparent" }}>{r.newText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {lines.map((r, i) => r.kind === "gap" ? (
                  <tr key={i}><td colSpan={3} style={{ ...cell, color: C.dim, textAlign: "center", background: `color-mix(in oklab, ${C.panel} 35%, transparent)` }}>⋯ {r.hidden} unchanged line{r.hidden === 1 ? "" : "s"}</td></tr>
                ) : (
                  <tr key={i} style={{ background: bg(r.kind) }}>
                    <td style={num}>{r.oldN ?? ""}</td>
                    <td style={num}>{r.newN ?? ""}</td>
                    <td style={{ ...cell, color: r.kind === "same" ? C.muted : C.fg, width: "100%" }}>
                      <span style={{ color: r.kind === "add" ? C.ok : r.kind === "del" ? C.bad : C.dim, userSelect: "none" }}>{r.kind === "add" ? "+" : r.kind === "del" ? "−" : " "} </span>{r.text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkDiffView({ run }: { run: number }) {
  const [d, setD] = React.useState<WorkDiff | null | undefined>(undefined);
  const [open, setOpen] = React.useState(false);
  // INLINE BY DEFAULT (2026-09-24). Side by side is the one the operator flips TO, and the choice is remembered
  // for the session so flipping once does not have to be flipped again on every file.
  const [side, setSideRaw] = React.useState<boolean>(() => { try { return localStorage.getItem("antiloki:diff-view") === "side"; } catch { return false; } });
  const setSide = (v: boolean) => { setSideRaw(v); try { localStorage.setItem("antiloki:diff-view", v ? "side" : "inline"); } catch { /* private mode */ } };
  React.useEffect(() => { if (!open || d !== undefined) return; let live = true; void fetchDiff(run).then((x) => { if (live) setD(x); }); return () => { live = false; }; }, [open, run, d]);
  return (
    <div data-testid="work-diff" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button data-testid="work-diff-toggle" onClick={() => setOpen((o) => !o)} style={{ alignSelf: "flex-start", background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: 0 }}>
        {open ? "▾" : "▸"} the diff, beside the old version
      </button>
      {open && d === undefined && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>reading the box…</span>}
      {open && d === null && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.warn }}>the box could not be read — it may have been removed since this run</span>}
      {open && d && <>
        {!d.files.length && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>this run wrote nothing, so there is nothing to compare</span>}
        {d.files.map((f) => <FileDiff key={f.path} f={f} side={side} onSide={setSide} />)}
        {!!d.files.length && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, lineHeight: 1.6 }}>{d.note}</span>}
      </>}
    </div>
  );
}
