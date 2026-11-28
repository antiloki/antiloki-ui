// PACK PICKER (2026-09-16, operator: "nothing should need writing — chips and categories of chips
// for the antiIDE functionalities"; the edit SCOPE itself stays the cockpit's checkbox file tree).
//
// PackChips — the context pack's custom items as chips: source kinds grouped by category (reviews ·
// structure · tests & health · git · docs), and the paths the scope covers (its folders and files)
// as the second row. Click a kind, then click the paths it should apply to; path-less kinds add on
// click; the AST kind drills one level further into a file's definitions for a partial AST.
//
// useAtlasEntries — the WHOLE repo tree (code/tree), shared by the scope tree and the pack chips.
// ScopeChips — a chip-based scope browser, kept for callers that prefer it; not used by the pane.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiPost } from "@/loki/api/client";
import type { Entry } from "@/loki/cockpit/cockpit-view";
import { itemKey, KIND_GLYPH, type PackItem, type PackSource } from "./context-pack";
import { libraryCall } from "./context-library";

const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;

/** The repo's file tree once per mount (the WHOLE tree — `codebase/get` caps at 2000 nodes and
 *  mixes symbols in, which used to show a scope picker ~130 files of a 4500-file repo). */
export function useAtlasEntries(): { entries: Entry[]; loading: boolean; tokens: Record<string, number> } {
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [tokens, setTokens] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const d = unwrap(await apiPost(`/api/v1/code/tree`, {}, { timeoutMs: 30_000 }));
        let list = d?.tree ? entriesFromTree(d.tree) : [];
        if (!list.length) {
          const a = unwrap(await apiPost(`/api/v1/codebase/get`, { origin: "atlas", limit: 10000 }, { timeoutMs: 30_000 }));
          list = entriesFromNodes(a?.nodes ?? a?.atlas?.nodes ?? []);
        }
        if (live) setEntries(list);
      } catch { /* no atlas — pickers stay empty and say so */ }
      if (live) setLoading(false);
      // TOKENS ON THE SCOPE (operator 2026-09-16): per-file ≈tokens (bytes/4) so the tree and the
      // "covers N files" line say what the scope costs to read. Separate call: it stats every file.
      try {
        const tk = unwrap(await apiPost(`/api/v1/codebase/get`, { origin: "atlas", with_tokens: true, limit: 1 }, { timeoutMs: 60_000 }));
        const map = tk?.file_tokens ?? tk?.atlas?.file_tokens;
        if (live && map && typeof map === "object") setTokens(map as Record<string, number>);
      } catch { /* sizes are a convenience */ }
    })();
    return () => { live = false; };
  }, []);
  return { entries, loading, tokens };
}
/** ≈tokens of the files a scope covers. */
export function tokensInScope(entries: Entry[], scope: string[], tokens: Record<string, number>): number {
  let sum = 0;
  for (const f of filesInScope(entries, scope)) sum += tokens[f] ?? 0;
  return sum;
}
export const fmtTok = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

/** `code/tree` → flat entries (dirs + files), sorted by path. */
export function entriesFromTree(tree: any): Entry[] {
  const out: Entry[] = [];
  const walk = (n: any) => {
    if (!n) return;
    const p = String(n.path ?? "").replace(/\\/g, "/");
    if (p) out.push({ path: p, dir: n.type === "dir" });
    for (const c of Array.isArray(n.children) ? n.children : []) walk(c);
  };
  walk(tree);
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

export function entriesFromNodes(nodes: any[]): Entry[] {
  const folders = new Set<string>(); const files: string[] = [];
  for (const n of nodes) {
    if (n?.type !== "file" || !n?.path) continue;
    const path = String(n.path).replace(/\\/g, "/"); files.push(path);
    const parts = path.split("/"); parts.pop();
    let acc = ""; for (const part of parts) { acc = acc ? `${acc}/${part}` : part; folders.add(acc); }
  }
  const all: Entry[] = [...[...folders].map((f) => ({ path: f, dir: true })), ...files.map((f) => ({ path: f, dir: false }))];
  all.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return all;
}

/** What sits directly under `dir` ("" = root): folders (with the file count below them) then files. */
export function childrenOf(entries: Entry[], dir: string): { folders: { path: string; name: string; files: number }[]; files: { path: string; name: string }[] } {
  const prefix = dir ? `${dir}/` : "";
  const folders: { path: string; name: string; files: number }[] = [];
  const files: { path: string; name: string }[] = [];
  for (const e of entries) {
    if (!e.path.startsWith(prefix) || e.path === dir) continue;
    const rest = e.path.slice(prefix.length);
    if (rest.includes("/")) continue;
    if (e.dir) folders.push({ path: e.path, name: rest, files: entries.filter((x) => !x.dir && x.path.startsWith(`${e.path}/`)).length });
    else files.push({ path: e.path, name: rest });
  }
  folders.sort((a, b) => b.files - a.files || a.name.localeCompare(b.name));
  return { folders, files };
}

export const globFor = (e: { path: string; dir: boolean }) => (e.dir ? `${e.path}/**` : e.path);
/** THE WHOLE PROJECT (operator 2026-10-11: "the scope default should be full scope selected on settings agents"): the glob that means every file. A scope with nothing declared starts as this, shown with everything ticked;
 *  the user narrows it by unticking. It is what the pane brief has always called the default (`**`). */
export const FULL_SCOPE = "**";
export const withDefaultScope = (scope: string[] | undefined | null): string[] => (scope && scope.length ? scope : [FULL_SCOPE]);
const dirBase = (g: string) => (g.endsWith("/**") ? g.slice(0, -2) : null);
/** Is this path covered by the scope (its own glob, or a parent folder's)? */
export function covered(scope: string[], path: string, dir: boolean): boolean {
  const own = dir ? `${path}/**` : path;
  return scope.includes(FULL_SCOPE) || scope.includes(own) || scope.some((g) => { const b = dirBase(g); return b != null && (path + "/").startsWith(b); });
}
/** Files under the scope, from the atlas. */
export function filesInScope(entries: Entry[], scope: string[]): string[] {
  return entries.filter((e) => !e.dir && covered(scope, e.path, false)).map((e) => e.path);
}
/** The distinct folders the scope names (a file's folder counts). */
export function foldersInScope(scope: string[]): string[] {
  const out: string[] = [];
  for (const g of scope) {
    if (g === FULL_SCOPE) continue;   // the whole project names no one folder
    const d = dirBase(g)?.replace(/\/$/, "") ?? g.split("/").slice(0, -1).join("/");
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

const chipBase: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1px 8px", fontFamily: mono, fontSize: 9.5, cursor: "pointer", whiteSpace: "nowrap", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", userSelect: "none" };

export function Chip({ on, tone, title, onClick, onRemove, children, dim }: { on?: boolean; tone?: string; title?: string; onClick?: () => void; onRemove?: () => void; children: React.ReactNode; dim?: boolean }) {
  const color = tone ?? C.brand;
  return (
    <span title={title} onClick={onClick}
      style={{ ...chipBase, color: on ? color : dim ? C.muted : C.dim, borderColor: on ? color : C.border, background: on ? `color-mix(in oklab, ${color} 12%, transparent)` : "transparent", cursor: onClick ? "pointer" : "default" }}
      onMouseEnter={(e) => { if (!on) (e.currentTarget as HTMLElement).style.borderColor = color; }}
      onMouseLeave={(e) => { if (!on) (e.currentTarget as HTMLElement).style.borderColor = C.border; }}>
      {children}
      {onRemove && <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="remove" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 9, padding: 0, lineHeight: 1 }}>✕</button>}
    </span>
  );
}

const Row = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
    <span title={hint} style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, minWidth: 54, flexShrink: 0 }}>{label}</span>
    {children}
  </div>
);

/** The scope as clickable chips. `value` = globs. */
export function ScopeChips({ value, onChange, entries, loading }: { value: string[]; onChange: (globs: string[]) => void; entries: Entry[]; loading?: boolean }) {
  const [dir, setDir] = React.useState("");
  const [filter, setFilter] = React.useState("");
  const { folders, files } = React.useMemo(() => childrenOf(entries, dir), [entries, dir]);
  const toggle = (g: string) => onChange(value.includes(g) ? value.filter((x) => x !== g) : [...value, g]);
  const crumbs = dir ? dir.split("/") : [];
  const shownFolders = filter ? entries.filter((e) => e.dir && e.path.toLowerCase().includes(filter.toLowerCase())).slice(0, 40).map((e) => ({ path: e.path, name: e.path, files: 0 })) : folders.slice(0, 40);
  const shownFiles = filter ? entries.filter((e) => !e.dir && e.path.toLowerCase().includes(filter.toLowerCase())).slice(0, 40).map((e) => ({ path: e.path, name: e.path })) : files.slice(0, 40);
  const inScope = filesInScope(entries, value).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 9px" }}>
      <Row label="scope" hint="what this agent may WRITE — ✕ drops a chip">
        {value.length === 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>none yet — click folders or files below</span>}
        {value.map((g) => <Chip key={g} on tone={C.ok} title={g} onRemove={() => toggle(g)}>{g.endsWith("/**") ? "📁 " : "📐 "}{g.replace(/\/\*\*$/, "")}</Chip>)}
        {value.length > 0 && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>· {inScope} file{inScope === 1 ? "" : "s"}</span>}
      </Row>
      <Row label="browse" hint="click a folder to drill in; the ✓ chip adds the folder you are in">
        <Chip on={dir === ""} onClick={() => setDir("")} title="repo root">/</Chip>
        {crumbs.map((c, i) => { const p = crumbs.slice(0, i + 1).join("/"); return <Chip key={p} on={i === crumbs.length - 1} onClick={() => setDir(p)} title={p}>{c}/</Chip>; })}
        {dir && <Chip tone={C.ok} on={covered(value, dir, true)} onClick={() => toggle(`${dir}/**`)} title={`add ${dir}/** to the scope`}>✓ this folder</Chip>}
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter (optional)" style={{ background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "1px 7px", fontFamily: mono, fontSize: 9, outline: "none", width: 120 }} />
      </Row>
      {loading && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>loading the atlas…</span>}
      {!loading && entries.length === 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>no atlas for this workspace yet — rebuild the codebase in antiIDE to pick from files</span>}
      {shownFolders.length > 0 && (
        <Row label="folders" hint="click the name to drill in · click ✓ to add the folder">
          {shownFolders.map((f) => (
            <span key={f.path} style={{ display: "inline-flex" }}>
              <Chip on={covered(value, f.path, true)} title={`${f.path} · ${f.files} files — click to open`} onClick={() => { setDir(f.path); setFilter(""); }}>📁 {f.name}{f.files ? <span style={{ color: C.muted }}> {f.files}</span> : null}</Chip>
              <button onClick={() => toggle(`${f.path}/**`)} title={covered(value, f.path, true) ? `drop ${f.path}/**` : `add ${f.path}/** to the scope`} style={{ background: "transparent", border: `1px solid ${C.border}`, borderLeft: "none", borderRadius: "0 10px 10px 0", marginLeft: -6, color: covered(value, f.path, true) ? C.ok : C.dim, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: "0 6px" }}>{covered(value, f.path, true) ? "✓" : "+"}</button>
            </span>
          ))}
        </Row>
      )}
      {shownFiles.length > 0 && (
        <Row label="files" hint="click to add one file">
          {shownFiles.map((f) => <Chip key={f.path} on={covered(value, f.path, false)} title={f.path} onClick={() => toggle(f.path)}>📐 {f.name}</Chip>)}
          {!filter && files.length > 40 && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>+{files.length - 40} more — filter</span>}
        </Row>
      )}
    </div>
  );
}

/** Catalog sources grouped for the chip rows. Unknown keys fall into "more". */
export const SOURCE_CATEGORIES: { label: string; keys: string[] }[] = [
  { label: "reviews", keys: ["file", "folder", "laws", "review_history", "report"] },
  { label: "structure", keys: ["ast", "imports", "graph", "subgraph", "neighborhood", "diagram", "tree", "decorators"] },
  { label: "tests & health", keys: ["tests", "blast", "coverage", "metrics", "smells", "entry_points", "signals", "atlas_report", "digest"] },
  { label: "git", keys: ["git", "file_history", "authors", "history"] },
  { label: "docs", keys: ["pack", "docs", "paper", "source"] },
];

export function categorize(sources: PackSource[]): { label: string; sources: PackSource[] }[] {
  const packable = sources.filter((s) => s.packable);
  const placed = new Set<string>();
  const out = SOURCE_CATEGORIES.map((c) => ({ label: c.label, sources: c.keys.map((k) => packable.find((s) => s.key === k)).filter(Boolean).map((s) => { placed.add(s!.key); return s!; }) })).filter((c) => c.sources.length);
  const rest = packable.filter((s) => !placed.has(s.key));
  if (rest.length) out.push({ label: "more", sources: rest });
  return out;
}

export const needsPath = (s: PackSource | undefined) => !!s?.args.some((a) => a.name === "path");
export const wantsFolder = (s: PackSource | undefined) => !!s?.args.find((a) => a.name === "path")?.description.includes("folder");
export const wantsFile = (s: PackSource | undefined) => !!s?.args.find((a) => a.name === "path")?.description.includes("file path");

/** The definitions of one file, from the atlas — symbol chips for a partial AST. */
async function symbolsOf(path: string): Promise<{ name: string; type: string; line: number | null }[]> {
  try {
    const d = unwrap(await apiPost(`/api/v1/codebase/get`, { origin: "atlas", path, limit: 500 }, { timeoutMs: 15_000 }));
    const nodes: any[] = d?.nodes ?? d?.atlas?.nodes ?? [];
    return nodes.filter((n) => n?.path === path && n?.type !== "file" && n?.name).map((n) => ({ name: String(n.name), type: String(n.type), line: n?.span?.start_line ?? null }));
  } catch { return []; }
}

/** Pack items as chips. A kind chip (row 1) adds that kind for EVERY path of the scope at once —
 *  file review of each file, folder paper of each folder (operator 2026-09-19: "selecting file
 *  review should automatically select the file reviews of the scope; and multiple kinds, not just
 *  one"); a second click removes them all; ▸ refine opens the per-path row. Path-less kinds add at once. */
export function PackChips({ items, onToggle, onSetMany, sources, scope, entries }: { items: PackItem[]; onToggle: (it: PackItem) => void; onSetMany?: (items: PackItem[], on: boolean) => void; sources: PackSource[]; scope: string[]; entries: Entry[] }) {
  const [kind, setKind] = React.useState<string | null>(null);
  const src = kind ? sources.find((s) => s.key === kind) : undefined;
  const groups = React.useMemo(() => categorize(sources), [sources]);
  const folders = React.useMemo(() => foldersInScope(scope), [scope]);
  const files = React.useMemo(() => filesInScope(entries, scope).slice(0, 60), [entries, scope]);
  const has = (it: PackItem) => items.some((x) => itemKey(x) === itemKey(it));
  /** every path a kind applies to inside the scope */
  const pathsFor = (sk: PackSource) => (wantsFolder(sk) ? folders : wantsFile(sk) ? files : [...folders, ...files]);
  const countOf = (key: string) => items.filter((x) => x.kind === key).length;
  const setAll = (sk: PackSource, on: boolean) => {
    const its = pathsFor(sk).map((path) => ({ kind: sk.key, path }));
    if (onSetMany) onSetMany(its, on);
    else for (const it of its) { if (has(it) !== on) onToggle(it); }
  };
  // THE CONTEXT PACKS (2026-09-19): the library's packs as chips — `pack` items carry the slug in args
  const [libPacks, setLibPacks] = React.useState<{ slug: string; name: string; bytes?: number }[] | null>(null);
  React.useEffect(() => { if (kind !== "pack" || libPacks !== null) return; void libraryCall({ op: "packs" }).then((d) => setLibPacks(d?.ok && Array.isArray(d.packs) ? d.packs : [])); }, [kind, libPacks]);
  // partial AST: pick the file, then its definitions appear as chips (whole file · each symbol)
  const [astFile, setAstFile] = React.useState<string | null>(null);
  const [symbols, setSymbols] = React.useState<{ name: string; type: string; line: number | null }[] | null>(null);
  React.useEffect(() => { setSymbols(null); if (kind === "ast" && astFile) { void symbolsOf(astFile).then(setSymbols); } }, [kind, astFile]);
  const pathChip = (path: string, isDir: boolean) => {
    const it: PackItem = { kind: kind ?? "file", path };
    const partials = kind === "ast" ? items.filter((x) => x.kind === "ast" && x.path === path && x.args?.symbol).length : 0;
    const on = has(it) || partials > 0;
    if (kind === "ast" && !isDir) {
      return <Chip key={path} on={on || astFile === path} title={`${path} — click to pick its definitions`} onClick={() => setAstFile(astFile === path ? null : path)}>📐 {path.split("/").pop()}{partials ? <span style={{ color: C.muted }}> {partials}</span> : null} ▸</Chip>;
    }
    return <Chip key={path} on={on} title={`${src?.label ?? kind} · ${path}`} onClick={() => onToggle(it)}>{isDir ? "📁 " : "📐 "}{path.split("/").pop()}</Chip>;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {groups.map((g) => (
        <Row key={g.label} label={g.label}>
          {g.sources.map((s) => {
            const pathless = !needsPath(s) && s.key !== "pack";
            const n = pathless ? 0 : countOf(s.key);
            const all = !pathless && pathsFor(s).length > 0 && pathsFor(s).every((path) => has({ kind: s.key, path }));
            const on = pathless ? has({ kind: s.key }) : n > 0;
            return (
              <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                <Chip on={on} tone={pathless ? C.ok : C.brand} title={`${s.description}${pathless ? " — click to add" : all ? ` — every ${wantsFolder(s) ? "folder" : wantsFile(s) ? "file" : "path"} of the scope (${n}); click to remove them all` : ` — click to add it for every ${wantsFolder(s) ? "folder" : wantsFile(s) ? "file" : "path"} of the scope (${pathsFor(s).length})`}`}
                  onClick={() => (pathless ? onToggle({ kind: s.key }) : s.key === "pack" ? setKind(kind === "pack" ? null : "pack") : setAll(s, !all))}>
                  {KIND_GLYPH[s.key]} {s.label}{n > 0 ? <span style={{ color: C.muted }}> {n}</span> : null}
                </Chip>
                {!pathless && <button data-testid={`refine-${s.key}`} onClick={() => setKind(kind === s.key ? null : s.key)} title={`pick the ${wantsFolder(s) ? "folders" : "files"} one by one`}
                  style={{ background: "transparent", border: "none", color: kind === s.key ? C.brand : C.dim, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: "0 2px" }}>{kind === s.key ? "▾" : "▸"}</button>}
              </span>
            );
          })}
        </Row>
      ))}
      {kind === "pack" && (
        <Row label="context packs" hint="consolidated in the context library (◆ Context) — the pack's whole body rides with the agent">
          {libPacks === null && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>reading the library…</span>}
          {libPacks?.length === 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>no packs yet — build one in the context library</span>}
          {(libPacks ?? []).map((p) => { const it: PackItem = { kind: "pack", args: { slug: p.slug } }; return <Chip key={p.slug} on={has(it)} tone={C.ok} title={`pack:${p.slug}${p.bytes ? ` · ~${Math.round(p.bytes / 4)} tok` : ""}`} onClick={() => onToggle(it)}>◆ {p.name}</Chip>; })}
        </Row>
      )}
      {src && needsPath(src) && (
        <>
          <Row label={`${src.label} of`} hint={src.description}>
            {(wantsFolder(src) ? folders : wantsFile(src) ? files : [...folders, ...files]).length === 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>no scope yet — define the scope above and its folders/files appear here</span>}
            {!wantsFile(src) && folders.map((f) => pathChip(f, true))}
            {!wantsFolder(src) && files.map((f) => pathChip(f, false))}
          </Row>
          {kind === "ast" && astFile && (
            <Row label="definitions" hint="whole file, or one definition — a partial AST includes its syntax tree">
              <Chip on={has({ kind: "ast", path: astFile })} tone={C.ok} title={`the whole AST of ${astFile}`} onClick={() => onToggle({ kind: "ast", path: astFile })}>⟨⟩ whole file</Chip>
              {symbols === null && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>loading definitions…</span>}
              {symbols?.length === 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>no definitions in the atlas for this file</span>}
              {(symbols ?? []).slice(0, 40).map((sy) => { const it: PackItem = { kind: "ast", path: astFile, args: { symbol: sy.name } }; return <Chip key={sy.name} on={has(it)} title={`${sy.type} ${sy.name}${sy.line ? ` · L${sy.line}` : ""}`} onClick={() => onToggle(it)}>{sy.type === "component" ? "⚛" : sy.type === "hook" ? "🪝" : sy.type === "class" ? "◇" : "ƒ"} {sy.name}</Chip>; })}
            </Row>
          )}
        </>
      )}
    </div>
  );
}
