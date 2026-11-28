// THE CONTEXT LIBRARY (operator 2026-09-19: "Claude has his own memory saved somewhere on the machine,
// codex and opencode might have too. I want access (read-only) to those AI memories at the context
// widget. Also all contexts from antiloki. The context widget should be a tool to manage all contexts
// shared between panes, threads, AIs, and antiloki itself. A complete wizard with all. … consolidate
// chunks of context and also group them into context packs. Those context artefacts should be
// reachable across all context selections").
//
// Three columns: WHO (the owners and their sources, with counts) → THE CHUNKS of the chosen source
// (search, preview, read, add to the pack) → THE PACKS (the one being built: name · notes · chunks in
// order; the saved ones: open · use · delete). A saved pack is `pack:<slug>` in every scope picker and
// mission, `context_pack` in notebooks, `pack` in the agents' catalog (`antiloki_query`). The AI stores
// are read-only here — nothing is ever written back to them.
import * as React from "react";
import { useTourUnlock } from "@/loki/shell/mini-tour";
import { createPortal } from "react-dom";
import { apiPost, unwrapResult as unwrap } from "@/loki/api/client";
import { C } from "@/loki/theme";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';

export type Chunk = { source: string; id: string; title: string; meta: string; bytes: number; preview: string; body?: string };
export type SourceGroup = { key: string; owner: string; label: string; note: string; read_only: boolean; chunks: Chunk[] };
export type Pack = { id: number; slug: string; name: string; notes_md: string; chunks: { source: string; id: string; title: string; bytes?: number }[]; bytes?: number; created_at: string; updated_at: string; body_md?: string };

export const OWNERS: { key: string; label: string; glyph: string; note: string }[] = [
  { key: "claude", label: "Claude", glyph: "✦", note: "Claude Code's own memory and rules — read-only" },
  { key: "codex", label: "Codex", glyph: "◇", note: "Codex's memory and the AGENTS.md it reads — read-only" },
  { key: "opencode", label: "OpenCode", glyph: "○", note: "OpenCode's sessions on this project — read-only" },
  { key: "antiloki", label: "antiloki", glyph: "◆", note: "memory · session docs · papers · worktree packs · skills · the packs you build here" },
];

export async function libraryCall(input: Record<string, unknown>, timeoutMs = 60_000): Promise<any> {
  try { return unwrap(await apiPost("/api/v1/context/library", input, { timeoutMs })); } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}

export const fmtBytes = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)} k` : `${n} B`);
/** ~4 chars per token — the same rough rule the rest of the app uses for a context budget */
export const fmtTok = (bytes: number) => { const t = Math.round(bytes / 4); return t >= 1000 ? `${(t / 1000).toFixed(t >= 10_000 ? 0 : 1)}k tok` : `${t} tok`; };

/** The pack draft: chunks in order, no duplicates; a pasted note is a chunk with its own body. Pure — tested. */
export function addToDraft(draft: Chunk[], c: Chunk): Chunk[] { return draft.some((x) => x.source === c.source && x.id === c.id) ? draft : [...draft, c]; }
export function moveInDraft(draft: Chunk[], i: number, dir: -1 | 1): Chunk[] { const j = i + dir; if (j < 0 || j >= draft.length) return draft; const n = draft.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; }
export function draftBytes(draft: Chunk[]): number { return draft.reduce((a, c) => a + (c.body ? c.body.length : c.bytes), 0); }

export function ContextLibraryWindow({ onClose, onUsePack, inline = false }: { onClose: () => void; onUsePack?: (pack: Pack) => void; inline?: boolean }) {
  const [groups, setGroups] = React.useState<SourceGroup[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [owner, setOwner] = React.useState<string>("antiloki");
  useTourUnlock("context"); // the progressive tour: the first time the library opens
  const [source, setSource] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [reading, setReading] = React.useState<{ chunk: Chunk; body: string | null } | null>(null);
  const [packs, setPacks] = React.useState<Pack[] | null>(null);
  const [draft, setDraft] = React.useState<Chunk[]>([]);
  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [editingSlug, setEditingSlug] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [paste, setPaste] = React.useState<{ title: string; body: string } | null>(null);
  const [openPack, setOpenPack] = React.useState<Pack | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const loadSources = React.useCallback(async () => {
    const d = await libraryCall({ op: "sources" }, 120_000);
    if (d?.ok && Array.isArray(d.sources)) { setGroups(d.sources); setErr(null); } else setErr(d?.error ?? "the library did not answer");
  }, []);
  const loadPacks = React.useCallback(async () => { const d = await libraryCall({ op: "packs" }); setPacks(d?.ok && Array.isArray(d.packs) ? d.packs : []); }, []);
  React.useEffect(() => { void loadSources(); void loadPacks(); }, [loadSources, loadPacks]);
  React.useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (reading || openPack || paste) { setReading(null); setOpenPack(null); setPaste(null); } else onClose(); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose, reading, openPack, paste]);

  const ownerGroups = (groups ?? []).filter((g) => g.owner === owner);
  React.useEffect(() => { if (!source || !ownerGroups.some((g) => g.key === source)) setSource(ownerGroups[0]?.key ?? null); }, [owner, groups]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = (groups ?? []).find((g) => g.key === source) ?? null;
  const ql = q.trim().toLowerCase();
  const shown = (cur?.chunks ?? []).filter((c) => !ql || `${c.title} ${c.meta} ${c.preview}`.toLowerCase().includes(ql));
  const countOf = (o: string) => (groups ?? []).filter((g) => g.owner === o).reduce((a, g) => a + g.chunks.length, 0);

  const read = async (c: Chunk) => {
    setReading({ chunk: c, body: c.body ?? null });
    if (c.body) return;
    const d = await libraryCall({ op: "read", source: c.source, id: c.id });
    setReading((r) => (r && r.chunk.id === c.id ? { chunk: c, body: d?.ok ? String(d.body ?? "") : `✗ ${d?.error ?? "could not read"}` } : r));
  };
  const add = (c: Chunk) => { setDraft((d) => addToDraft(d, c)); setNote(`+ ${c.title}`); if (inline) setDrawerOpen(true); };
  const addPaste = () => { if (!paste || !paste.body.trim()) return; const id = `note-${Date.now().toString(36)}`; add({ source: "paste", id, title: paste.title.trim() || "a note", meta: "pasted here", bytes: paste.body.length, preview: paste.body.slice(0, 200), body: paste.body }); setPaste(null); };
  const save = async () => {
    if (!name.trim() || !draft.length) return;
    setSaving(true);
    const d = await libraryCall({ op: "pack.save", name: name.trim(), slug: editingSlug ?? undefined, notes_md: notes, chunks: draft.map((c) => ({ source: c.source, id: c.id, title: c.title, ...(c.body ? { body: c.body } : {}) })) }, 120_000);
    setSaving(false);
    if (d?.ok) { setNote(`saved · ${d.pack?.slug} · ~${fmtTok(Number(d.chars ?? 0))}`); setDraft([]); setName(""); setNotes(""); setEditingSlug(null); await loadPacks(); await loadSources(); }
    else setNote(`✗ ${d?.error ?? "could not save"}`);
  };
  const edit = async (p: Pack) => {
    const d = await libraryCall({ op: "pack.get", slug: p.slug });
    const full: Pack = d?.ok ? d.pack : p;
    setEditingSlug(p.slug); setName(p.name); setNotes(full.notes_md ?? ""); setDraft(full.chunks.map((c) => ({ source: c.source, id: c.id, title: c.title, meta: "", bytes: c.bytes ?? 0, preview: "" })));
    setNote(`editing ${p.slug} — the referenced chunks are re-read on save (a pack is a snapshot)`);
  };
  const del = async (p: Pack) => { const d = await libraryCall({ op: "pack.delete", slug: p.slug }); if (d?.ok) { setNote(`deleted ${p.slug}`); await loadPacks(); await loadSources(); } };
  const view = async (p: Pack) => { const d = await libraryCall({ op: "pack.get", slug: p.slug }); setOpenPack(d?.ok ? d.pack : { ...p, body_md: "(could not read)" }); };

  const col: React.CSSProperties = { display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" };
  const head: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim, padding: "8px 12px 4px" };
  const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 };
  const totalBytes = draftBytes(draft);

  // INLINE (the context pane) or a window (the thread's context box, the studio): the same wizard
  const frame = (
      <div onClick={(e) => e.stopPropagation()} data-testid="context-library" style={inline ? { position: "relative", width: "100%", height: "100%", minHeight: 0, minWidth: 0, background: C.bg, display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden" } : { position: "relative", width: "96vw", height: "94vh", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: inline ? "6px 10px" : "8px 14px", borderBottom: `1px solid ${C.border}`, minWidth: 0, overflow: "hidden" }}>
          <span style={{ fontFamily: mono, fontSize: inline ? 10.5 : 12, color: C.fg, fontWeight: 700, whiteSpace: "nowrap" }}>◆ the context library</span>
          <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>every context on this box — the AIs' own memories (read-only) and antiloki's — consolidated into packs that reach every scope, mission, notebook and agent</span>
          <span style={{ flex: 1 }} />
          {note && <span data-testid="library-note" title={note} style={{ fontFamily: mono, fontSize: 9.5, color: note.startsWith("✗") ? C.bad : C.ok, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: inline ? 180 : 420, flexShrink: 0 }}>{note}</span>}
          <button onClick={() => { void loadSources(); void loadPacks(); }} style={btn} title="re-read every source">↻</button>
          {!inline && <button onClick={onClose} style={btn} title="close (Esc)">✕</button>}
        </div>
        <div style={inline ? { display: "grid", gridTemplateRows: "auto 1fr auto", minHeight: 0, minWidth: 0, overflow: "hidden" } : { display: "grid", gridTemplateColumns: "230px 1fr 340px", minHeight: 0 }}>
          {/* WHO — a column in the window, two chip rows in a pane */}
          {inline ? (
            <div style={{ borderBottom: `1px solid ${C.border}`, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {OWNERS.map((o) => <button key={o.key} data-testid={`owner-${o.key}`} onClick={() => setOwner(o.key)} title={o.note} style={{ ...btn, color: owner === o.key ? C.fg : C.muted, borderColor: owner === o.key ? C.brand : C.border, background: owner === o.key ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent" }}>{o.glyph} {o.label} <span style={{ color: C.dim }}>{groups ? countOf(o.key) : "…"}</span></button>)}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {ownerGroups.map((g) => <button key={g.key} data-testid={`source-${g.key}`} onClick={() => setSource(g.key)} title={g.note} style={{ ...btn, fontSize: 9, color: source === g.key ? C.fg : C.dim, borderColor: source === g.key ? C.brand : C.border }}>{g.label}{g.read_only ? " 🔒" : ""} <span style={{ color: C.dim }}>{g.chunks.length}</span></button>)}
                {err && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>{err}</span>}
              </div>
            </div>
          ) : (
          <div style={{ ...col, borderRight: `1px solid ${C.border}`, overflowY: "auto" }}>
            <div style={head}>who holds context</div>
            {OWNERS.map((o) => (
              <button key={o.key} data-testid={`owner-${o.key}`} onClick={() => setOwner(o.key)} title={o.note} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: owner === o.key ? C.panel2 : "transparent", border: "none", borderLeft: `2px solid ${owner === o.key ? C.brand : "transparent"}`, color: owner === o.key ? C.fg : C.muted, padding: "6px 12px", cursor: "pointer", fontFamily: mono, fontSize: 11 }}>
                <span style={{ color: C.brand }}>{o.glyph}</span><span style={{ flex: 1 }}>{o.label}</span><span style={{ color: C.dim, fontSize: 9.5 }}>{groups ? countOf(o.key) : "…"}</span>
              </button>
            ))}
            <div style={head}>{OWNERS.find((o) => o.key === owner)?.label}'s sources</div>
            {groups === null && <div style={{ padding: "4px 12px", fontFamily: mono, fontSize: 10, color: C.dim }}>reading the stores…</div>}
            {err && <div style={{ padding: "4px 12px", fontFamily: mono, fontSize: 10, color: C.warn }}>{err}</div>}
            {ownerGroups.map((g) => (
              <button key={g.key} data-testid={`source-${g.key}`} onClick={() => setSource(g.key)} title={g.note} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: source === g.key ? C.panel2 : "transparent", border: "none", borderLeft: `2px solid ${source === g.key ? C.brand : "transparent"}`, color: source === g.key ? C.fg : C.muted, padding: "5px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
                {g.read_only && <span style={{ fontSize: 8, color: C.dim }} title="read-only — never written back">🔒</span>}
                <span style={{ color: C.dim, fontSize: 9.5 }}>{g.chunks.length}</span>
              </button>
            ))}
            {cur && <div style={{ padding: "6px 12px", fontFamily: mono, fontSize: 9, color: C.dim, lineHeight: 1.5 }}>{cur.note}</div>}
          </div>
          )}
          {/* THE CHUNKS */}
          <div style={{ ...col, borderRight: inline ? "none" : `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 700 }}>{cur?.label ?? "—"}</span>
              <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{shown.length} chunk{shown.length === 1 ? "" : "s"}</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="find a chunk…" data-testid="chunk-search" style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.fg, padding: "2px 7px", width: 200 }} />
              <button onClick={() => setPaste({ title: "", body: "" })} style={{ ...btn, color: C.brand, borderColor: C.brand }} title="a chunk of your own — pasted text becomes part of the pack">＋ paste a note</button>
              {shown.length > 0 && <button onClick={() => { for (const c of shown) add(c); setNote(`+ ${shown.length} chunks`); }} style={btn} title="add every chunk shown to the pack">add all</button>}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              {cur && shown.length === 0 && <div style={{ padding: 14, fontFamily: mono, fontSize: 10, color: C.dim, fontStyle: "italic" }}>{cur.chunks.length ? "nothing matches" : "nothing here on this box"}</div>}
              {shown.map((c) => { const inDraft = draft.some((x) => x.source === c.source && x.id === c.id); return (
                <div key={`${c.source}:${c.id}`} data-testid="chunk" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "2px 10px", padding: "7px 12px", minWidth: 0, borderBottom: `1px solid ${C.border}`, background: inDraft ? `color-mix(in oklab, ${C.brand} 6%, transparent)` : "transparent" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", minWidth: 0 }}>
                      <button onClick={() => void read(c)} title="read the whole chunk" style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: mono, fontSize: 11, color: C.fg, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left", flex: 1, minWidth: 0 }}>{c.title}</button>
                      <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, minWidth: 0, maxWidth: "45%" }} title={c.meta}>{c.meta}{c.bytes ? ` · ~${fmtTok(c.bytes)}` : ""}</span>
                    </div>
                    {c.preview && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, lineHeight: 1.4 }}>{c.preview}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "flex-start" }}>
                    <button onClick={() => void read(c)} style={btn} title="read">▸</button>
                    <button data-testid={`add-${c.id}`} onClick={() => add(c)} disabled={inDraft} style={{ ...btn, color: inDraft ? C.ok : C.brand, borderColor: inDraft ? C.ok : C.brand }} title={inDraft ? "in the pack" : "add to the pack"}>{inDraft ? "✓" : "＋"}</button>
                  </div>
                </div>
              ); })}
            </div>
          </div>
          {/* THE PACKS — a column in the window, a drawer at the bottom of a pane */}
          <div style={inline ? { ...col, borderTop: `1px solid ${C.border}`, maxHeight: drawerOpen ? "55%" : undefined, overflowY: "auto" } : { ...col, overflowY: "auto" }}>
            {inline && (
              <div data-testid="pack-drawer" onClick={() => setDrawerOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", background: C.panel2 }}>
                <span style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, fontWeight: 700 }}>◆ the pack</span>
                <span style={{ fontFamily: mono, fontSize: 9.5, color: draft.length ? C.brand : C.dim }}>{draft.length} chunk{draft.length === 1 ? "" : "s"} · ~{fmtTok(totalBytes)}</span>
                <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>· {packs?.length ?? "…"} saved</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{drawerOpen ? "▾" : "▴"}</span>
              </div>
            )}
            {(!inline || drawerOpen) && (<>
            <div style={head}>{editingSlug ? `the pack · editing ${editingSlug}` : "the pack you are building"}</div>
            <div style={{ padding: "0 12px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="pack name — e.g. team rules · what every agent must know" data-testid="pack-name" style={{ fontFamily: mono, fontSize: 10.5, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.fg, padding: "4px 7px" }} />
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="notes — the pack's own words, on top of the chunks (optional)" rows={2} style={{ fontFamily: mono, fontSize: 10, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.fg, padding: "4px 7px", resize: "vertical" }} />
              {draft.length === 0 && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, fontStyle: "italic", lineHeight: 1.5 }}>pick chunks on the left — they land here in order; a pack is a snapshot of their bodies, consolidated under one name</div>}
              {draft.map((c, i) => (
                <div key={`${c.source}:${c.id}`} data-testid="draft-chunk" style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 6px", background: C.panel }}>
                  <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, width: 14 }}>{i + 1}</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: C.fg, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${c.source} · ${c.id}`}>{c.title}</span>
                  <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>{c.source.split(".")[0]}</span>
                  <button onClick={() => setDraft((d) => moveInDraft(d, i, -1))} style={{ ...btn, padding: "0 4px" }} title="up">↑</button>
                  <button onClick={() => setDraft((d) => moveInDraft(d, i, 1))} style={{ ...btn, padding: "0 4px" }} title="down">↓</button>
                  <button onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} style={{ ...btn, padding: "0 4px", color: C.bad }} title="remove">✕</button>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{draft.length} chunk{draft.length === 1 ? "" : "s"} · ~{fmtTok(totalBytes)}</span>
                <span style={{ flex: 1 }} />
                {editingSlug && <button onClick={() => { setEditingSlug(null); setDraft([]); setName(""); setNotes(""); }} style={btn}>cancel</button>}
                <button data-testid="pack-save" onClick={() => void save()} disabled={saving || !name.trim() || !draft.length} style={{ ...btn, color: C.ok, borderColor: C.ok }} title="consolidate the chunks into one pack — reachable from every scope picker, mission, notebook and agent">{saving ? "saving…" : editingSlug ? "✓ save the pack" : "✓ consolidate into a pack"}</button>
              </div>
            </div>
            <div style={head}>saved packs · {packs?.length ?? "…"}</div>
            <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {packs?.length === 0 && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, fontStyle: "italic" }}>none yet</div>}
              {(packs ?? []).map((p) => (
                <div key={p.slug} data-testid={`pack-${p.slug}`} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", background: C.panel }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{p.chunks.length} · ~{fmtTok(Number(p.bytes ?? 0))}</span>
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>pack:{p.slug} · {String(p.updated_at ?? "").slice(0, 16)}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    <button onClick={() => void view(p)} style={btn} title="read the pack">▸ read</button>
                    <button onClick={() => void edit(p)} style={btn} title="edit — name, notes, chunks">✎</button>
                    {onUsePack && <button onClick={() => onUsePack(p)} style={{ ...btn, color: C.brand, borderColor: C.brand }} title="use this pack here">use</button>}
                    <span style={{ flex: 1 }} />
                    <button onClick={() => void del(p)} style={{ ...btn, color: C.bad }} title="delete the pack (the chunks stay where they live)">✕</button>
                  </div>
                </div>
              ))}
            </div>
            </>)}
          </div>
        </div>
        {/* THE READER — a chunk or a pack, whole */}
        {(reading || openPack) && (
          <div onClick={() => { setReading(null); setOpenPack(null); }} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center" }}>
            <div onClick={(e) => e.stopPropagation()} data-testid="chunk-reader" style={{ width: "min(900px, 90%)", height: "84%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: mono, fontSize: 11, color: C.fg, fontWeight: 700 }}>{openPack ? `pack:${openPack.slug}` : reading?.chunk.title}</span>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{openPack ? `${openPack.chunks.length} chunks` : `${reading?.chunk.source} · ${reading?.chunk.meta}`}</span>
                <span style={{ flex: 1 }} />
                {reading && <button onClick={() => { add(reading.chunk); }} style={{ ...btn, color: C.brand, borderColor: C.brand }}>＋ add to the pack</button>}
                <button onClick={() => { setReading(null); setOpenPack(null); }} style={btn}>✕</button>
              </div>
              <pre style={{ flex: 1, minHeight: 0, overflow: "auto", margin: 0, padding: 14, fontFamily: mono, fontSize: 10.5, color: C.fg, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{openPack ? (openPack.body_md ?? "") : (reading?.body ?? "reading…")}</pre>
            </div>
          </div>
        )}
        {paste && (
          <div onClick={() => setPaste(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center" }}>
            <div onClick={(e) => e.stopPropagation()} data-testid="paste-note" style={{ width: "min(720px, 90%)", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontFamily: mono, fontSize: 11, color: C.fg, fontWeight: 700 }}>＋ a note of your own</span>
              <input autoFocus value={paste.title} onChange={(e) => setPaste({ ...paste, title: e.target.value })} placeholder="title" data-testid="paste-title" style={{ fontFamily: mono, fontSize: 10.5, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.fg, padding: "4px 7px" }} />
              <textarea value={paste.body} onChange={(e) => setPaste({ ...paste, body: e.target.value })} placeholder="the text — rules, decisions, a snippet, anything every agent should know" rows={10} data-testid="paste-body" style={{ fontFamily: mono, fontSize: 10, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.fg, padding: "4px 7px", resize: "vertical" }} />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><button onClick={() => setPaste(null)} style={btn}>cancel</button><button data-testid="paste-add" onClick={addPaste} disabled={!paste.body.trim()} style={{ ...btn, color: C.brand, borderColor: C.brand }}>＋ add to the pack</button></div>
            </div>
          </div>
        )}
      </div>
  );
  if (inline) return frame;
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", pointerEvents: "auto" }}>{frame}</div>, document.body);
}
