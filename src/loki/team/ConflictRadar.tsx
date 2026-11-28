// THE CONFLICT RADAR (UI-15): parallel worktrees that changed the same file, checked from git with no model, before anything is joined. Quiet when nothing overlaps. Lines that meet are a likely merge conflict (amber); the same file in other places is a heads-up.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { Icon } from "./icons";
import { conflictsNow, type FileConflict } from "./api";

/** The files with the trees that touch each, lines-meeting first. Pure. */
export function byFile(c: FileConflict[]): { path: string; trees: string[]; same_lines: boolean }[] {
  const m = new Map<string, { path: string; trees: Set<string>; same_lines: boolean }>();
  for (const k of c) { const e = m.get(k.path) ?? { path: k.path, trees: new Set<string>(), same_lines: false }; e.trees.add(k.a); e.trees.add(k.b); e.same_lines ||= k.same_lines; m.set(k.path, e); }
  return [...m.values()].map((e) => ({ path: e.path, trees: [...e.trees], same_lines: e.same_lines })).sort((a, b) => Number(b.same_lines) - Number(a.same_lines) || a.path.localeCompare(b.path));
}
export function ConflictRadar({ pollMs = 15000 }: { pollMs?: number }) {
  const [rows, setRows] = React.useState<ReturnType<typeof byFile>>([]); const [open, setOpen] = React.useState(false);
  React.useEffect(() => { let on = true; const go = () => { if (typeof document !== "undefined" && document.hidden) return; void conflictsNow().then((r) => on && setRows(byFile(r.conflicts))); }; go(); const t = setInterval(go, pollMs); return () => { on = false; clearInterval(t); }; }, [pollMs]);
  if (!rows.length) return null;
  const hot = rows.filter((r) => r.same_lines).length;
  return (
    <div data-testid="conflict-radar" style={{ padding: "6px 12px", fontFamily: nav, fontSize: 12.5, color: C.fg }}>
      <button data-testid="conflict-pill" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ display: "flex", alignItems: "center", gap: 8, height: 28, padding: "0 10px", width: "100%", background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.fg, cursor: "pointer", font: "inherit" }}>
        <span style={{ color: hot ? "#f5b942" : C.muted, display: "inline-flex" }}><Icon name="fork" size={14} /></span>{rows.length} file{rows.length === 1 ? "" : "s"} changed in more than one tree{hot ? ` · ${hot} on the same lines` : ""}
      </button>
      {open && <div data-testid="conflict-list" style={{ marginTop: 4, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {rows.map((r) => <div key={r.path} style={{ display: "flex", gap: 10, padding: "6px 14px", borderTop: `1px solid ${C.border}`, alignItems: "center" }}><span style={{ fontFamily: mono, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.path}</span><span style={{ color: C.muted }}>{r.trees.join(" · ")}</span><span style={{ color: r.same_lines ? "#f5b942" : C.dim, fontSize: 11.5 }}>{r.same_lines ? "same lines" : "other lines"}</span></div>)}
      </div>}
    </div>
  );
}
