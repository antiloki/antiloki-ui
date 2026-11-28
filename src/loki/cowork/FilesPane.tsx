// THE FILES PANE (the operator 2026-11-22: "a files pane, a files explorer of your computer"): any folder of this machine, read only. The places on the left, the folder in the middle, a preview of the file you click on the right. Nothing here changes a file.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { listFolder, type FileEntry, type FileListing } from "./api";
import { FileView } from "./FileView";
import { startFileDrag } from "./file-drag";

export const fmtSize = (n: number | null): string => (n === null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`);
export const fmtDay = (ms: number | null): string => (ms === null ? "" : new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }));
/** The folders of a path as clickable steps, from the root. Pure. */
export function crumbs(path: string): { name: string; path: string }[] {
  const win = /^[A-Za-z]:[\\/]/.test(path); const sep = win ? "\\" : "/"; const parts = path.split(/[\\/]/).filter(Boolean); const out: { name: string; path: string }[] = [{ name: win ? parts[0] ?? "" : "/", path: win ? `${parts[0]}${sep}` : "/" }];
  let acc = win ? `${parts[0]}${sep}` : ""; for (const p of win ? parts.slice(1) : parts) { acc = win ? `${acc}${p}${sep}` : `${acc}/${p}`; out.push({ name: p, path: acc }); } return win ? out : out.slice(win ? 0 : 0);
}
const iconPath = { dir: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", file: "M6 3h8l5 5v13H6zM14 3v5h5" };
const Ico = ({ kind, color }: { kind: "dir" | "file"; color: string }) => <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden style={{ stroke: color, fill: "none", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", flex: "none" }}><path d={iconPath[kind]} /></svg>;

/** Where each files pane was, kept while the screen lives: a pane opened beside it rebuilds it, and it must not jump back home (found 2026-11-26). */
const WHERE = new Map<string, { path: string; sel: { path: string; size: string } | null }>();
export function FilesPane({ id = "" }: { id?: string } = {}) {
  const was = id ? WHERE.get(id) : undefined;
  const [dir, setDir] = React.useState<FileListing | null>(null); const [path, setPath] = React.useState(was?.path ?? ""); const [draft, setDraft] = React.useState(""); const [err, setErr] = React.useState(""); const [hidden, setHidden] = React.useState(false); const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState<{ path: string; size: string } | null>(was?.sel ?? null);
  React.useEffect(() => { if (id) WHERE.set(id, { path, sel }); }, [id, path, sel]);
  const first = React.useRef(true);
  React.useEffect(() => { let on = true; setErr(""); void listFolder(path).then((r) => { if (!on) return; if (!r) { setErr("the serve did not answer (it may be older than this pane: restart it)"); return; } if (!r.ok) { setErr(r.error ?? "cannot open that folder"); return; } setDir(r); setDraft(r.path); if (!first.current) setSel(null); first.current = false; setQ(""); }); return () => { on = false; }; }, [path]);
  const open = (e: FileEntry) => { if (!dir) return; const full = `${dir.path.replace(/[\\/]$/, "")}${/^[A-Za-z]:/.test(dir.path) ? "\\" : "/"}${e.name}`; if (e.kind === "dir") setPath(full); else setSel({ path: full, size: fmtSize(e.size) }); };
  const shown = (dir?.entries ?? []).filter((e) => (hidden || !e.hidden) && (!q || e.name.toLowerCase().includes(q.toLowerCase())));
  const ghost: React.CSSProperties = { background: "transparent", border: "none", color: C.fg, cursor: "pointer", fontFamily: nav, fontSize: 12, padding: "3px 8px", borderRadius: 7 };
  return (
    <div data-testid="files-pane" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", fontFamily: nav, color: C.fg, fontSize: 12.5 }}>
      <form onSubmit={(e) => { e.preventDefault(); setSel(null); setPath(draft); }} style={{ display: sel ? "none" : "flex", alignItems: "center", gap: 6, padding: "6px 10px" }}>
        <button type="button" data-testid="files-up" aria-label="up one folder" title="up one folder" disabled={!dir?.parent} onClick={() => dir?.parent && setPath(dir.parent)} style={{ ...ghost, opacity: dir?.parent ? 1 : 0.35 }}>↑</button>
        <input data-testid="files-path" value={draft} onKeyDown={(e) => { /* two boxes and no button: a browser does not send the form on Enter by itself (found 2026-11-26) */ if (e.key === "Enter") { e.preventDefault(); setSel(null); setPath(draft.trim()); } }} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label="folder" style={{ flex: 1, minWidth: 0, background: "color-mix(in srgb, var(--c-fg) 6%, transparent)", border: "none", borderRadius: 999, color: C.fg, padding: "5px 12px", fontFamily: mono, fontSize: 11.5, outline: "none" }} />
        <input data-testid="files-filter" value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter" aria-label="filter this folder" style={{ width: 110, background: "transparent", border: "none", borderBottom: `1px solid color-mix(in srgb, var(--c-fg) 18%, transparent)`, color: C.fg, padding: "3px 4px", fontFamily: nav, fontSize: 12, outline: "none" }} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.muted, fontSize: 11.5, cursor: "pointer" }}><input data-testid="files-hidden" type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />hidden</label>
      </form>
      {err && <div data-testid="files-error" style={{ padding: "6px 14px", color: "var(--c-bad)" }}>{err}</div>}
      {sel && <FileView path={sel.path} size={sel.size} onBack={() => setSel(null)} />}
      <div style={{ flex: 1, minHeight: 0, display: sel ? "none" : "flex" }}>   {/* hidden, not gone: coming back keeps the place in the list */}
        <nav aria-label="places" style={{ width: 128, flex: "none", padding: "4px 6px", display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
          {(dir?.places ?? []).map((p) => <button key={p.path} data-testid={`place-${p.name}`} onClick={() => setPath(p.path)} style={{ ...ghost, textAlign: "left", color: dir?.path === p.path ? C.brand : C.fg }}>{p.name}</button>)}
        </nav>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div data-testid="files-crumbs" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, padding: "2px 8px 6px", color: C.muted, fontSize: 11.5 }}>{dir && crumbs(dir.path).map((c, i) => <React.Fragment key={c.path}>{i > 0 && <span>›</span>}<button onClick={() => setPath(c.path)} style={{ ...ghost, padding: "1px 5px", color: C.muted }}>{c.name}</button></React.Fragment>)}</div>
          <div data-testid="files-list" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 6px 8px" }}>
            {dir?.private && <div style={{ padding: "6px 8px", color: C.warn }}>This folder holds keys or secrets: you can see the names, not the contents.</div>}
            {dir && shown.length === 0 && <div data-testid="files-empty" style={{ padding: "14px 10px", color: C.muted }}>{q ? "nothing matches" : "this folder is empty"}</div>}
            {shown.map((e) => { const full = `${dir!.path.replace(/[\\/]$/, "")}/${e.name}`; return (
              <button key={e.name} data-testid={`file-${e.name}`} draggable onDragStart={(ev) => startFileDrag(ev.dataTransfer, full)} onClick={() => open(e)} style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "5px 8px", borderRadius: 8, cursor: "pointer", background: sel?.path === full ? "color-mix(in srgb, var(--c-fg) 9%, transparent)" : "transparent", opacity: e.hidden ? 0.6 : 1 }}>
                <Ico kind={e.kind} color={e.kind === "dir" ? C.brand : C.muted} /><span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}{e.link ? " ↗" : ""}</span>
                <span style={{ color: C.dim, fontFamily: mono, fontSize: 10.5, width: 64, textAlign: "right" }}>{e.kind === "file" ? fmtSize(e.size) : ""}</span><span style={{ color: C.dim, fontSize: 11, width: 74, textAlign: "right" }}>{fmtDay(e.mtime)}</span>
              </button>); })}
            {dir?.more && <div style={{ padding: "6px 10px", color: C.muted }}>only the first 3000 are shown: use the filter</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
