// EPIC-VIBE-COCKPIT extra pane kinds (operator 2026-07-06): the GIT GRAPH pane (all
// worktrees, live), the CONTEXT pane (the session's shared memory — mission + docs every
// agent receives), and the CLOSE-WORKTREE warning modal (merge or discard, full info).
import { ContextLibraryWindow } from "@/loki/widgets/context-library";
import type { Pane } from "@/loki/api/types";
import * as React from "react";
import { apiPost, apiGet, unwrapResult as unwrap } from "@/loki/api/client";
import { C } from "@/loki/theme";
import { buildTree, topKids, buildTokenMap, TreeNode } from "@/loki/codebase/checkbox-tree";
import { paneSettings } from "./cockpit-panes-tools";
import { startBlockDrag } from "@/loki/widgets/agent-interact";
import { CopyButton } from "@/loki/widgets/view-widgets";
import { Frame } from "@/loki/widgets/window-frame";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 11, padding: "3px 10px", borderRadius: 5 };
const inp: React.CSSProperties = { background: C.bg, border: `1px solid ${C.border}`, color: C.fg, fontFamily: mono, fontSize: 11, padding: "4px 8px", borderRadius: 5, outline: "none" };
const padded: React.CSSProperties = { padding: "16px 10px", color: C.muted, fontStyle: "italic", fontFamily: mono, fontSize: 11 };

// GIT GRAPH pane: the base branch + one lane per pane worktree — ahead commits, dirty
// files, diffstat — polled live. 📂 opens the worktree folder in the OS explorer.
export function GitGraphPane({ sessionId, panes, onOpenWorktree }: { sessionId: number; panes: Pane[]; onOpenWorktree: (id: number) => void }) {
  const [g, setG] = React.useState<any>(null);
  React.useEffect(() => {
    let stop = false;
    const poll = async () => {
      try { const d = unwrap(await apiPost("/api/v1/cockpit/git-graph", { session_id: sessionId }, { timeoutMs: 30000 })); if (!stop) setG(d); } catch { /* endpoint absent pre-restart */ }
    };
    poll();
    const t = setInterval(poll, 8000);
    return () => { stop = true; clearInterval(t); };
  }, [sessionId, panes.length]);
  if (!g) return <div style={padded}>reading the git graph…</div>;
  if (g.ok === false) return <div style={padded}>{g.error}</div>;
  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "8px 10px", fontFamily: mono, fontSize: 10 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", color: C.fg, marginBottom: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.brand, flex: "none" }} />
        <span style={{ fontWeight: 700 }}>{g.base?.branch}</span>
        <span style={{ color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.base?.head}</span>
      </div>
      {(g.lanes ?? []).map((l: any) => (
        <div key={l.pane_id} style={{ borderLeft: `2px solid ${C.border}`, marginLeft: 4, paddingLeft: 10, paddingBottom: 10 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", color: C.fg }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: l.ok ? C.ok : C.warn, marginLeft: -15, border: `2px solid ${C.panel}`, flex: "none" }} />
            <span style={{ fontWeight: 600 }}>#{l.idx + 1} {l.name}</span>
            <span style={{ color: C.dim }}>{l.branch}</span>
            <span style={{ flex: 1 }} />
            {l.worktree_path && <button onClick={() => onOpenWorktree(l.pane_id)} title={"open in Explorer\n" + l.worktree_path} style={{ ...btn, padding: "0px 5px", fontSize: 9 }}>📂</button>}
          </div>
          {l.ok ? (
            <div style={{ color: C.muted, marginTop: 2 }}>
              <span style={{ color: l.ahead_commits?.length ? C.ok : C.dim }}>{l.ahead_commits?.length ?? 0} commit(s) ahead</span>
              {" · "}<span style={{ color: l.dirty_files ? C.warn : C.dim }}>{l.dirty_files} dirty file(s)</span>
              {l.diffstat ? <span> · {String(l.diffstat).trim()}</span> : null}
              {(l.ahead_commits ?? []).slice(0, 6).map((c: string) => (
                <div key={c} style={{ color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>· {c}</div>
              ))}
            </div>
          ) : <div style={{ color: C.warn }}>{l.reason}</div>}
        </div>
      ))}
      {(g.lanes ?? []).length === 0 && <div style={{ color: C.dim }}>no pane worktrees yet — add a dev agent pane and its worktree appears here.</div>}
    </div>
  );
}

// CONTEXT pane: the session's shared memory — mission editor + context docs
// (add / edit / delete / upload). Every agent receives the docs with its mission.
export function ContextPane({ sessionId, mission, onChanged, onOpenStudio }: { sessionId: number; mission: string; onChanged: () => void; onOpenStudio?: () => void }) {
  // THE CONTEXT WIDGET IS THE WIZARD (operator 2026-09-19: "the context widget should be a tool to manage
  // all contexts shared between panes, threads, AIs, and antiloki itself"): two tabs — this thread's
  // shared memory (mission · inserted context) and THE LIBRARY (every context on the box → packs)
  const [tab, setTab] = React.useState<"thread" | "library">("thread");
  const [docs, setDocs] = React.useState<any[]>([]);
  const [mDraft, setMDraft] = React.useState(mission);
  const [newDoc, setNewDoc] = React.useState("");
  const [editId, setEditId] = React.useState<number | null>(null);
  const [editBody, setEditBody] = React.useState("");
  const [openId, setOpenId] = React.useState<number | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const load = React.useCallback(async () => {
    const d = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: sessionId }, { timeoutMs: 30000 }));
    setDocs(d?.context_docs ?? []);
  }, [sessionId]);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { setMDraft(mission); }, [mission]);
  const saveMission = async () => { await apiPost("/api/v1/cockpit/blackboard/post", { op: "mission", session_id: sessionId, mission_md: mDraft }, { timeoutMs: 30000 }); onChanged(); };
  const addDoc = async (body: string) => { if (!body.trim()) return; await apiPost("/api/v1/cockpit/blackboard/post", { session_id: sessionId, kind: "context", body_md: body }, { timeoutMs: 30000 }); setNewDoc(""); load(); };
  const saveEdit = async () => { if (editId == null) return; await apiPost("/api/v1/cockpit/blackboard/post", { op: "update", id: editId, body_md: editBody }, { timeoutMs: 30000 }); setEditId(null); load(); };
  const delDoc = async (id: number) => { await apiPost("/api/v1/cockpit/blackboard/post", { op: "delete", id }, { timeoutMs: 30000 }); load(); };
  const onUpload = (e: any) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => addDoc("(uploaded: " + f.name + ")\n\n" + String(reader.result ?? "").slice(0, 19000));
    reader.readAsText(f);
    e.target.value = "";
  };
  // DASHBOARD (operator 2026-07-13: "context panel is too simple, make it a dashboard
  // for the inserted context") — the pane version of the studio's control center:
  // stat readout + typed thumbnail rows over the same shared docs.
  const infos = docs.map((d) => ({ d, info: classifyDoc(d.body_md) }));
  const nSources = infos.filter((x) => x.info.kind === "source").length;
  const nFiles = infos.filter((x) => x.info.kind === "files").length;
  const nNotes = infos.length - nSources - nFiles;
  const stat = (glyph: string, n: number | string, label: string, color: string) => (
    <div key={label} title={label} style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 7px", background: C.panel, display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 12 }}>{glyph}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color, fontWeight: 700, lineHeight: 1.1 }}>{n}</div>
        <div style={{ fontSize: 7.5, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      </div>
    </div>
  );
  const tabBtn = (k: "thread" | "library", label: string, title: string) => <button key={k} data-testid={`context-tab-${k}`} onClick={() => setTab(k)} title={title} style={{ background: "transparent", border: "none", borderBottom: `2px solid ${tab === k ? C.brand : "transparent"}`, color: tab === k ? C.fg : C.dim, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: "5px 9px", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</button>;
  const tabs = (
    <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.border}`, padding: "0 6px", flexShrink: 0 }}>
      {tabBtn("thread", "this thread", "the mission and the context every agent of this thread reads")}
      {tabBtn("library", "◆ the library", "every context on this box — Claude · Codex · OpenCode (read-only) · antiloki — consolidated into packs that reach every scope, mission, notebook and agent")}
    </div>
  );
  if (tab === "library") return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {tabs}
      <div style={{ flex: 1, minHeight: 0 }}><ContextLibraryWindow inline onClose={() => setTab("thread")} /></div>
    </div>
  );
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
    {tabs}
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8, fontFamily: mono }}>
      {/* stat readout — what's inserted, at a glance */}
      <div style={{ display: "flex", gap: 6 }}>
        {stat("📄", nNotes, "notes & docs", C.fg)}
        {stat("🔌", nSources, "live sources", C.brand)}
        {stat("📁", nFiles, "focus files", C.warn)}
        {stat("🎯", mission.trim() ? "✓" : "—", "mission", mission.trim() ? C.ok : C.muted)}
      </div>
      <div>
        <div style={{ fontSize: 9, color: C.dim, marginBottom: 3 }}>mission — shared, every agent reads it</div>
        <textarea value={mDraft} onChange={(e) => setMDraft(e.target.value)} style={{ ...inp, width: "100%", minHeight: 40, resize: "vertical", boxSizing: "border-box" }} />
        <button onClick={saveMission} disabled={mDraft === mission} style={{ ...btn, marginTop: 3, fontSize: 10, color: mDraft === mission ? C.muted : C.ok, borderColor: mDraft === mission ? C.border : C.ok }}>save mission</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 9, color: C.dim }}>inserted context — every agent's prompt carries it</span>
        <span style={{ flex: 1 }} />
        {onOpenStudio && <button onClick={onOpenStudio} title="open the full Context Studio (chips · sources · code tree · what each pane sees)" style={{ ...btn, padding: "0 8px", fontSize: 9.5, color: C.brand }}>⤢ studio</button>}
      </div>
      {docs.length === 0 && <span style={{ fontSize: 9.5, color: C.muted, fontStyle: "italic" }}>nothing inserted yet — paste below or open the studio for one-click sources.</span>}
      {infos.map(({ d, info }) => {
        const open = openId === d.id;
        return (
          <div key={d.id} data-testid="ctx-item" style={{ border: `1px solid ${open ? info.color : C.border}`, borderRadius: 7, background: C.panel }}>
            <div onClick={() => setOpenId(open ? null : d.id)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 7px", cursor: "pointer" }}>
              <DocThumb info={info} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 10, color: C.fg, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{info.title}</div>
                <div style={{ fontSize: 8, color: info.color }}>{info.kindLabel}{info.meta ? " · " + info.meta : ""} · {String(d.created_at ?? "").slice(5, 16)}</div>
              </div>
              <span style={{ fontSize: 9.5, color: C.dim }}>{open ? "▾" : "▸"}</span>
            </div>
            {open && (
              <div style={{ borderTop: `1px solid ${C.border}`, padding: "5px 8px" }}>
                {editId === d.id ? (
                  <>
                    <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} style={{ ...inp, width: "100%", minHeight: 70, resize: "vertical", boxSizing: "border-box" }} />
                    <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                      <button onClick={saveEdit} style={{ ...btn, fontSize: 9.5, color: C.ok, borderColor: C.ok }}>save</button>
                      <button onClick={() => setEditId(null)} style={{ ...btn, fontSize: 9.5, color: C.muted }}>cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 10, color: C.muted, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 130, overflow: "auto" }}>{d.body_md}</div>
                    {info.kind === "source" && <SourcePreview label={info.title} />}
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <span style={{ flex: 1 }} />
                      <button onClick={() => { setEditId(d.id); setEditBody(d.body_md); }} style={{ ...btn, padding: "0 6px", fontSize: 9 }}>✎ edit</button>
                      <button onClick={() => delDoc(d.id)} style={{ ...btn, padding: "0 6px", fontSize: 9, color: C.bad, borderColor: C.border }}>✕ retire</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      <textarea value={newDoc} onChange={(e) => setNewDoc(e.target.value)} placeholder="paste new context (docs, requirements, decisions)…" style={{ ...inp, width: "100%", minHeight: 44, resize: "vertical", boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => addDoc(newDoc)} disabled={!newDoc.trim()} style={{ ...btn, fontSize: 10, color: newDoc.trim() ? C.ok : C.muted, borderColor: newDoc.trim() ? C.ok : C.border }}>+ add context</button>
        <button onClick={() => fileRef.current?.click()} style={{ ...btn, fontSize: 10 }}>⇪ upload file</button>
        <input ref={fileRef} type="file" accept=".md,.txt,.json,.js,.ts,.jsx,.tsx,.css,.html,.yml,.yaml" style={{ display: "none" }} onChange={onUpload} />
      </div>
    </div>
    </div>
  );
}

// CLOSE-WORKTREE warning (operator 2026-07-06: "a warning should appear with merge or
// discard buttons and ALL information about the merging").
export function CloseWorktreeModal({ closing, onMerge, onDiscard, onCancel, onOpenWorktree }: {
  closing: any; onMerge: () => void; onDiscard: () => void; onCancel: () => void; onOpenWorktree: (id: number) => void;
}) {
  if (!closing) return null;
  const { pane, info, busy, error } = closing;
  const i = info ?? {};
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 300, display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(620px, 94vw)", maxHeight: "86vh", overflowY: "auto", background: C.bg, border: `1px solid ${C.warn}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 8, fontFamily: mono }}>
        <span style={{ fontSize: 12.5, color: C.warn, fontWeight: 700 }}>⚠ closing pane #{pane.idx + 1} ({pane.subagent_name}) — its worktree must be merged or discarded</span>
        {busy && <span style={{ fontSize: 10.5, color: C.muted }}>gathering merge information…</span>}
        {!busy && (
          <>
            <div style={{ fontSize: 10.5, color: C.fg, display: "grid", gap: 3 }}>
              <span><span style={{ color: C.dim }}>branch · </span>{i.branch ?? pane.branch ?? "?"} <span style={{ color: C.dim }}>→ merges into · </span>{i.base_branch ?? "base"}</span>
              <span><span style={{ color: C.dim }}>worktree · </span>{i.worktree_path ?? pane.worktree_path}
                {" "}<button onClick={() => onOpenWorktree(pane.id)} style={{ ...btn, padding: "0 6px", fontSize: 9 }}>📂 open folder</button></span>
              <span><span style={{ color: C.dim }}>commits ahead · </span>{i.ahead_commits?.length ?? 0}
                <span style={{ color: C.dim }}> · uncommitted changes · </span><span style={{ color: i.dirty_files ? C.warn : C.ok }}>{i.dirty_files ?? 0} file(s)</span></span>
              {i.dirty_stat ? <span style={{ color: C.muted }}>{String(i.dirty_stat).trim()}</span> : null}
              {i.diffstat ? <span><span style={{ color: C.dim }}>committed diff vs base · </span>{String(i.diffstat).trim()}</span> : null}
            </div>
            {(i.ahead_commits ?? []).length > 0 && (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 9px", maxHeight: 130, overflow: "auto" }}>
                {(i.ahead_commits ?? []).map((c: string) => <div key={c} style={{ fontSize: 9.5, color: C.muted }}>· {c}</div>)}
              </div>
            )}
            <div style={{ fontSize: 9.5, color: C.dim, lineHeight: 1.5 }}>
              MERGE commits any uncommitted changes, merges the branch into {i.base_branch ?? "the base"} (--no-ff), then removes the worktree. A conflict ABORTS cleanly — nothing is lost, the pane stays open. DISCARD deletes the worktree and every change in it.
            </div>
            {error && <div style={{ fontSize: 10, color: C.bad, border: `1px solid ${C.bad}`, borderRadius: 5, padding: "5px 8px" }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={onMerge} style={{ ...btn, color: C.ok, borderColor: C.ok }}>⇄ merge &amp; close</button>
              <button onClick={onDiscard} style={{ ...btn, color: C.bad, borderColor: C.bad }}>🗑 discard &amp; close</button>
              <span style={{ flex: 1 }} />
              <button onClick={onCancel} style={{ ...btn, color: C.muted }}>cancel — keep the pane</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── THE SESSION CONTEXT STUDIO (plan S5, operator 2026-07-12) ───────────────
// The shared-memory strip at the bottom of the vibe grid maximizes into this
// full-window wizard: manage the whole session's context + knowledge in one
// place. Lanes side by side — SHARED session memory (mission, context docs,
// coordination/handoffs, claims) and PER-PANE scratch — over the same
// cockpit_blackboard the agents read. Every edit reaches every agent on their
// next turn (context docs) or is coordination they can see.
const laneBox: React.CSSProperties = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" };
const laneHead: React.CSSProperties = { padding: "8px 12px", borderBottom: `1px solid ${C.border}`, background: C.panel2, fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, display: "flex", alignItems: "center", gap: 8 };

// quick-add chips — one click seeds a labeled context doc (the widget-studio /
// notebooks ergonomic, applied to vibe's own context docs).
// the FULL notebook context sidebar, brought into vibe (operator: "I WANT TO
// HAVE ALL THAT OPTIONS"). Same Code / Work / Knowledge groups the notebook
// studio offers; here each chip one-click adds a labeled context doc naming
// that source as required reading (the agents run in the full worktree + have
// the substrate tools to fetch it).
export const SOURCE_GROUPS: { group: string; items: [string, string][] }[] = [ // exported: the goal-box concierge shares this catalog
  { group: "Code", items: [["ast", "AST"], ["descriptions", "Descriptions"], ["digest", "Digest"], ["entrypoints", "Entry points"], ["data_stories", "Data stories"], ["design", "Design"], ["tests", "Tests"], ["git", "Git"], ["docs", "Docs"]] },
  { group: "Work", items: [["cards", "Cards"], ["contracts", "Contracts"], ["failures", "Failures"], ["decisions", "Decisions"], ["timeline", "Timeline"]] },
  { group: "Knowledge", items: [["memory", "Memory"], ["faculty_arch", "Stack Gazette"], ["faculty_product", "Market Herald"]] },
];
const DOC_CHIPS: [string, string][] = [
  ["constraint", "Constraint"], ["decision", "Decision"], ["convention", "Convention"],
  ["api", "API note"], ["gotcha", "Gotcha"], ["todo", "TODO"], ["focus", "Focus"],
];

// ── context thumbnails (operator 2026-07-13: rethink the context studio into a
// "control center … with chips, thumbnails etc") — classify a shared-context doc
// by its body so the studio can render it as a TYPED TILE, the way the widget
// studio shows mini-images. Every branch returns the same shape.
function classifyDoc(body: string): { kind: string; kindLabel: string; title: string; glyph: string; color: string; meta: string } {
  const b = String(body ?? "");
  const first = (b.split("\n")[0] ?? "").trim();
  const src = first.match(/^CONTEXT SOURCE — (.+?):\s*$/);
  if (src) return { kind: "source", kindLabel: "live source", title: src[1], glyph: "🔌", color: C.brand, meta: "required reading" };
  if (/^FOCUS FILES/i.test(first)) {
    const n = b.split("\n").slice(1).filter((l) => l.trim() && !/^\(/.test(l.trim())).length;
    return { kind: "files", kindLabel: "focus files", title: "Focus files", glyph: "📁", color: C.brand, meta: n + " file" + (n === 1 ? "" : "s") };
  }
  const lab = first.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (lab) {
    const label = lab[1];
    const m: Record<string, { glyph: string; color: string }> = {
      Constraint: { glyph: "🔒", color: C.warn },
      Decision: { glyph: "⚖️", color: C.brand },
      Convention: { glyph: "📐", color: C.brand },
      API: { glyph: "{ }", color: C.ok },
      Gotcha: { glyph: "⚠️", color: C.bad },
      TODO: { glyph: "☑️", color: C.muted },
      Focus: { glyph: "🎯", color: C.brand },
    };
    const hit = m[label] ?? { glyph: "🏷️", color: C.brand };
    return { kind: "note", kindLabel: label.toLowerCase(), title: (lab[2] || label).slice(0, 90) || label, glyph: hit.glyph, color: hit.color, meta: "" };
  }
  return { kind: "note", kindLabel: "note", title: (first || "context").slice(0, 90), glyph: "📄", color: C.dim, meta: b.length + " chars" };
}

function DocThumb({ info }: { info: { glyph: string; color: string } }) {
  return (
    <div style={{ width: 34, height: 34, borderRadius: 7, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 14, lineHeight: 1, background: `color-mix(in oklab, ${info.color} 16%, ${C.bg})`, border: `1px solid color-mix(in oklab, ${info.color} 42%, ${C.border})`, color: info.color }}>{info.glyph}</div>
  );
}

// LIVE SOURCE PREVIEW (operator 2026-07-13: "clicking an item i cant see its item
// inside, just a stub") — a source chip stores only a pointer instruction; expanding
// its tile now fetches what that source RESOLVES TO right now (the same grounded
// markdown the notebook corpus feeds the model, via cockpit/context-preview).
const SOURCE_KIND_BY_LABEL: Record<string, string> = Object.fromEntries(SOURCE_GROUPS.flatMap((g) => g.items.map(([k, label]) => [label, k])));
const sourcePreviewCache: Record<string, { text: string; note: string | null }> = {};
function SourcePreview({ label }: { label: string }) {
  const kind = SOURCE_KIND_BY_LABEL[label];
  const [res, setRes] = React.useState<{ text: string; note: string | null } | null>(kind ? sourcePreviewCache[kind] ?? null : { text: "", note: null });
  React.useEffect(() => {
    if (!kind || sourcePreviewCache[kind] != null) { if (kind) setRes(sourcePreviewCache[kind]); return; }
    let stop = false;
    (async () => {
      try {
        const d = unwrap(await apiPost("/api/v1/cockpit/context-preview", { kind }, { timeoutMs: 30000 }));
        // the skill says WHY a source is empty (note) — show that, never a guess
        const r = d?.ok === false
          ? { text: "", note: String(d?.error ?? "preview refused — restart the BE to load the endpoint") }
          : { text: String(d?.text ?? ""), note: d?.note ? String(d.note) : null };
        sourcePreviewCache[kind] = r;
        if (!stop) setRes(r);
      } catch (e: any) { if (!stop) setRes({ text: "", note: e?.message ?? "preview unreachable — restart the BE" }); }
    })();
    return () => { stop = true; };
  }, [kind]);
  if (!kind) return null;
  return (
    <div style={{ marginTop: 6 }} data-testid="source-preview">
      <div style={{ fontFamily: mono, fontSize: 8, color: C.brand, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>live preview · what this source resolves to right now</div>
      {res === null
        ? <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>resolving…</span>
        : res.text
          ? <pre style={{ margin: 0, fontFamily: mono, fontSize: 9.5, lineHeight: 1.5, color: C.fg, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 240, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", background: C.bg }}>{res.text}</pre>
          : <span style={{ fontFamily: mono, fontSize: 9.5, color: C.warn }}>{res.note ?? "this source is empty right now."}</span>}
    </div>
  );
}

// ── context transparency (operator 2026-07-14: "scope is what it can EDIT,
// context is what it can READ — make the distinction, show transparency") ────
const ENGINE_KINDS = new Set(["claude-code", "codex", "gemini", "grok", "cursor", "opencode", "opencode-direct"]);   // every seat, since 2026-09-28
const estTok = (s: any) => Math.ceil(String(s ?? "").length / 4);
const fmtTok = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));
const parseExcludes = (json: any) => { try { const v = JSON.parse(json ?? "[]"); return Array.isArray(v) ? v.map(Number) : []; } catch { return []; } };

// THE PROMPT WINDOW — the exact context slice the next turn sends (cockpit/pane/brief:
// same assembly code as the real turn, sources embedded, no AI call), token-summed.
export function PromptWindow({ paneId, onClose, embedded }: { paneId: number; onClose: () => void; embedded?: boolean }) {
  const [brief, setBrief] = React.useState<any | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<Record<string, boolean>>({ mission: true });
  React.useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const d = unwrap(await apiPost("/api/v1/cockpit/pane/brief", { pane_id: paneId }, { timeoutMs: 60000 }));
        if (stop) return;
        if (d?.ok === false) setErr(d?.error ?? "brief failed"); else setBrief(d);
      } catch (e: any) { if (!stop) setErr(e?.message ?? "brief unreachable — restart the BE"); }
    })();
    return () => { stop = true; };
  }, [paneId]);
  const copyAll = () => {
    const text = (brief?.sections ?? []).map((s: any) => `── ${s.label} ──\n${s.body}`).join("\n\n");
    try { void navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ }
  };
  return (
    <Frame embedded={embedded} onClose={onClose} testId="prompt-window" width="min(880px, 94vw)" height="min(720px, 90vh)">
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.panel }}>
          <span style={{ fontFamily: mono, fontSize: 12.5, color: C.fg, fontWeight: 700 }}>🧾 prompt window</span>
          {brief?.pane && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>#{brief.pane.idx + 1} {brief.pane.subagent_name} · {brief.pane.model_id ? brief.pane.model_id.split("/").pop() : brief.pane.tier}</span>}
          <span style={{ flex: 1 }} />
          {brief?.totals && <span data-testid="prompt-total" style={{ fontFamily: mono, fontSize: 11, color: C.warn, fontWeight: 700, border: `1px solid ${C.warn}`, borderRadius: 12, padding: "2px 10px" }}>Σ ≈{fmtTok(brief.totals.tokens)} tok</span>}
          <button onClick={copyAll} style={{ ...btn, fontSize: 10, color: C.muted }}>⧉ copy</button>
          {!embedded && <button onClick={onClose} style={{ ...btn, color: C.muted }}>✕</button>}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {err && <span style={{ fontFamily: mono, fontSize: 10.5, color: C.warn }}>{err}</span>}
          {!err && !brief && <span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>assembling the exact slice…</span>}
          {(brief?.docs ?? []).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
              <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8 }}>docs in the slice</span>
              {(brief.docs as any[]).map((d) => (
                <span key={d.id} style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 10, border: `1px solid ${d.excluded ? C.border : C.ok}`, color: d.excluded ? C.dim : C.ok, textDecoration: d.excluded ? "line-through" : "none" }}
                  title={d.excluded ? "excluded for this pane" : `≈${fmtTok(d.tokens)} tok`}>{d.source ? "🔌 " : ""}{String(d.label ?? "#" + d.id).slice(0, 22)}</span>
              ))}
            </div>
          )}
          {/* CLI ENGINES (2026-09-16): the delivery + the prompt history the hook/plugin logged, newest first */}
          {brief?.engine && (
            <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.5 }}>
              {brief.note}
              {brief.usage && brief.usage.source !== "none" && (
                <div style={{ marginTop: 4, color: C.fg }}>usage now: {brief.usage.context?.used_pct != null ? `context ${Math.round(brief.usage.context.used_pct)}% · ` : ""}{brief.usage.session?.tokens_total != null ? `session ${fmtTok(Number(brief.usage.session.tokens_total))} tok · ` : ""}{brief.usage.cost_usd != null ? `$${Number(brief.usage.cost_usd).toFixed(2)} · ` : ""}{(brief.usage.limits ?? []).map((l: any) => `${l.label} ${Math.round(l.used_pct)}%`).join(" · ")}</div>
              )}
            </div>
          )}
          {Array.isArray(brief?.prompts) && (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel }}>
              <div onClick={() => setOpen((o) => ({ ...o, prompts: !o.prompts }))} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer" }}>
                <span style={{ fontFamily: mono, fontSize: 10, color: C.fg, fontWeight: 600 }}>{open.prompts ? "▾" : "▸"} prompt history · {brief.prompts.length} submitted</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>≈{fmtTok(brief.prompts.reduce((a: number, p: any) => a + Number(p.tokens || 0), 0))} tok</span>
              </div>
              {open.prompts && (
                <div style={{ borderTop: `1px solid ${C.border}`, maxHeight: 300, overflowY: "auto" }}>
                  {brief.prompts.length === 0 && <div style={{ padding: "6px 10px", fontFamily: mono, fontSize: 9.5, color: C.dim }}>nothing submitted through this pane yet</div>}
                  {brief.prompts.map((p: any, i: number) => (
                    <div key={i} style={{ padding: "5px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, flexShrink: 0, width: 96 }}>{String(p.t ?? "").slice(0, 19).replace("T", " ")}</span>
                      <pre style={{ margin: 0, flex: 1, fontFamily: mono, fontSize: 9.5, color: String(p.prompt ?? "").startsWith("[antiloki]") ? C.dim : C.fg, whiteSpace: "pre-wrap", wordBreak: "break-word" }} title={String(p.prompt ?? "").startsWith("[antiloki]") ? "injected by antiloki on the operator's click, not typed" : undefined}>{String(p.prompt ?? "")}</pre>
                      <CopyButton text={String(p.prompt ?? "")} />
                      <span style={{ fontFamily: mono, fontSize: 8.5, color: C.warn, flexShrink: 0 }}>≈{fmtTok(Number(p.tokens || 0))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {(brief?.sections ?? []).map((s: any) => (
            <div key={s.key} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel }}>
              <div onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer" }}>
                <span style={{ fontFamily: mono, fontSize: 10, color: C.fg, fontWeight: 600 }}>{open[s.key] ? "▾" : "▸"} {s.label}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>≈{fmtTok(s.tokens)} tok</span>
              </div>
              {open[s.key] && <pre style={{ margin: 0, padding: "8px 10px", borderTop: `1px solid ${C.border}`, fontFamily: mono, fontSize: 9.5, lineHeight: 1.5, color: C.muted, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 300, overflowY: "auto" }}>{s.body}</pre>}
            </div>
          ))}
        </div>
        <div style={{ padding: "7px 12px", borderTop: `1px solid ${C.border}`, fontFamily: mono, fontSize: 9, color: C.dim }}>
          {brief?.engine ? "everything antiloki delivered to this CLI (launch flags · brief block · pack files · skills · tools · hooks) plus every prompt submitted in the pane. Tokens ≈ chars/4." : "the EXACT context slice the next turn sends — assembled by the same code as the real prompt (sources embedded live), no AI call. Tokens ≈ chars/4."}
        </div>
      </>
    </Frame>
  );
}

// one agent's read/write card: READS = mission + shared docs (✓ toggles write the
// pane's context_excludes — context is EDITABLE per agent), WRITES = its scope.
function AgentContextCard({ p, docs, scratchCount, onChanged, onPrompt }: { p: any; docs: any[]; scratchCount: number; onChanged: () => void; onPrompt: () => void }) {
  const excludes = parseExcludes(p.context_excludes_json);
  const nReads = docs.filter((d) => !excludes.includes(Number(d.id))).length;
  const toggle = async (docId: number) => {
    const n = excludes.includes(docId) ? excludes.filter((x: number) => x !== docId) : [...excludes, docId];
    await apiPost("/api/v1/cockpit/pane/update", { pane_id: p.id, context_excludes: n }, { timeoutMs: 20000 });
    onChanged();
  };
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.fg, fontWeight: 600 }}>#{p.idx + 1}</span>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{p.subagent_name}</span>
        <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>reads mission + {nReads}/{docs.length} docs · {scratchCount} scratch</span>
        <span style={{ flex: 1 }} />
        <button data-testid="pane-sees" onClick={onPrompt} title="the exact prompt slice the next turn sends + token sums" style={{ ...btn, fontSize: 9.5, padding: "1px 8px", color: C.brand, borderColor: C.brand }}>🧾 prompt</button>
      </div>
      <div style={{ padding: "6px 9px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          <span style={{ fontFamily: mono, fontSize: 8, color: C.ok, textTransform: "uppercase", letterSpacing: 0.8, width: 42 }} title="context — what this agent READS">reads</span>
          <span style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 10, border: `1px solid ${C.ok}`, color: C.ok }} title="the mission is always read">🎯 mission</span>
          {docs.map((d) => {
            const info = classifyDoc(d.body_md);
            const on = !excludes.includes(Number(d.id));
            return (
              <button key={d.id} data-testid="read-toggle" onClick={() => void toggle(Number(d.id))}
                title={(on ? "reads — click to exclude for this pane" : "excluded — click to include") + (info.kind === "source" ? " · live source" : ` · ≈${fmtTok(estTok(d.body_md))} tok`)}
                style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 10, cursor: "pointer", border: `1px solid ${on ? C.ok : C.border}`, background: on ? `color-mix(in oklab, ${C.ok} 10%, transparent)` : "transparent", color: on ? C.ok : C.dim, textDecoration: on ? "none" : "line-through" }}>
                {info.glyph} {String(info.title).slice(0, 16)}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          <span style={{ fontFamily: mono, fontSize: 8, color: C.warn, textTransform: "uppercase", letterSpacing: 0.8, width: 42 }} title="scope — what this agent may WRITE">writes</span>
          {(p.scope ?? []).length
            ? (p.scope as string[]).map((g) => <span key={g} style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 10, border: `1px solid ${C.warn}`, color: C.warn }}>{g}</span>)
            : <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>unrestricted</span>}
        </div>
      </div>
    </div>
  );
}

export function ContextStudio({ sessionId, panes, onClose, onChanged }: { sessionId: number; panes: Pane[]; onClose: () => void; onChanged: () => void }) {
  const [lib, setLib] = React.useState(false); // THE CONTEXT LIBRARY (2026-09-19) — the wizard over every context on the box
  const [mission, setMission] = React.useState("");
  const [docs, setDocs] = React.useState<any[]>([]);
  const [coordination, setCoordination] = React.useState<any[]>([]);
  const [scratchByPane, setScratchByPane] = React.useState<Record<number, any[]>>({});
  const [newDoc, setNewDoc] = React.useState("");
  const [editId, setEditId] = React.useState<number | null>(null);
  const [editBody, setEditBody] = React.useState("");
  const [promptFor, setPromptFor] = React.useState<number | null>(null);
  const [expandDoc, setExpandDoc] = React.useState<number | null>(null);
  // CODE CHECKBOX TREE (operator: "the code checkbox like the examples") — the
  // same atlas-fed file picker the widget studio uses. Checked files become a
  // FOCUS-FILES context doc (agents read the whole repo via S1; this points them).
  const [codePaths, setCodePaths] = React.useState<string[] | null>(null);
  const [fileTokens, setFileTokens] = React.useState<Record<string, number> | null>(null);
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [fileFilter, setFileFilter] = React.useState("");
  const [showFiles, setShowFiles] = React.useState(false);
  const addRef = React.useRef<HTMLTextAreaElement | null>(null);

  const load = React.useCallback(async () => {
    const d = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: sessionId }, { timeoutMs: 30000 }));
    setMission(d?.mission_md ?? "");
    setDocs(d?.context_docs ?? []);
    setCoordination(d?.coordination ?? []);
    const map: Record<number, any[]> = {};
    await Promise.all(panes.map(async (p) => {
      const r = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: sessionId, pane_id: p.id }, { timeoutMs: 20000 }));
      map[p.id] = r?.scratch ?? [];
    }));
    setScratchByPane(map);
  }, [sessionId, panes]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    (async () => {
      try {
        const d = unwrap(await apiPost("/api/v1/codebase/get", { origin: "atlas", limit: 6000, with_tokens: true, types: ["file"] }, { timeoutMs: 30000 }));
        const ps = (d?.nodes || []).filter((n: any) => n.type === "file").map((n: any) => String(n.path)).filter(Boolean);
        setCodePaths([...new Set<string>(ps)].sort());
        setFileTokens(d?.file_tokens || null);
      } catch { setCodePaths([]); }
    })();
  }, []);
  const tokMap = React.useMemo(() => buildTokenMap(fileTokens), [fileTokens]);
  const tok = React.useCallback((pt: string) => tokMap?.[pt] ?? null, [tokMap]);
  const shownFiles = (codePaths || []).filter((pt) => !fileFilter || pt.toLowerCase().includes(fileFilter.toLowerCase()));
  const fileTree = React.useMemo(() => buildTree(shownFiles.slice(0, 4000)), [shownFiles.join("|")]);
  const togglePath = (pt: string) => setChecked((c) => { const n = new Set(c); n.has(pt) ? n.delete(pt) : n.add(pt); return n; });
  const toggleExp = (pt: string) => setExpanded((s2) => { const n = new Set(s2); n.has(pt) ? n.delete(pt) : n.add(pt); return n; });

  const saveMission = async () => { await apiPost("/api/v1/cockpit/blackboard/post", { op: "mission", session_id: sessionId, mission_md: mission }, { timeoutMs: 30000 }); onChanged(); };
  const addDocBody = async (body: string) => { if (!body.trim()) return; await apiPost("/api/v1/cockpit/blackboard/post", { session_id: sessionId, kind: "context", body_md: body }, { timeoutMs: 30000 }); load(); };
  const addDoc = async () => { if (!newDoc.trim()) return; await addDocBody(newDoc); setNewDoc(""); };
  const seedChip = (label: string) => { setNewDoc((d) => (d.trim() ? d + "\n" : "") + "[" + label + "] "); addRef.current?.focus(); };
  const addCheckedFiles = async () => {
    if (checked.size === 0) return;
    await addDocBody("FOCUS FILES (read these first):\n" + [...checked].sort().join("\n"));
    setChecked(new Set()); setShowFiles(false);
  };
  // one-click notebook-style source → a labeled context doc naming it as
  // required reading for this session.
  const srcPrefix = (label: string) => "CONTEXT SOURCE — " + label + ":";
  const sourceDoc = (label: string) => docs.find((d: any) => String(d.body_md).startsWith(srcPrefix(label)));
  const sourceUsed = (label: string) => !!sourceDoc(label);
  // one click adds the source; clicking the active (✓) chip removes it.
  const toggleSource = async (label: string) => {
    const ex = sourceDoc(label);
    if (ex) { await delDoc(ex.id); return; }
    await addDocBody(srcPrefix(label) + "\n(consult the current " + label.toLowerCase() + " for this session before working.)");
  };
  const saveEdit = async () => { if (editId == null) return; await apiPost("/api/v1/cockpit/blackboard/post", { op: "update", id: editId, body_md: editBody }, { timeoutMs: 30000 }); setEditId(null); load(); };
  const delDoc = async (id: number) => { await apiPost("/api/v1/cockpit/blackboard/post", { op: "delete", id }, { timeoutMs: 30000 }); load(); };

  // pane categories (operator 2026-07-14: "each pane sees should have different
  // context slices depending on the type — tools don't need context like agents"):
  const kindOf = (p: any) => String(p.pane_kind ?? "agent");
  const agentPanes = panes.filter((p) => kindOf(p) === "agent");
  const enginePanes = panes.filter((p) => ENGINE_KINDS.has(kindOf(p)));
  const toolPanes = panes.filter((p) => kindOf(p) !== "agent" && !ENGINE_KINDS.has(kindOf(p)));
  const storedTok = estTok(mission) + docs.reduce((t, d) => t + (String(d.body_md).startsWith("CONTEXT SOURCE — ") ? 0 : estTok(d.body_md)), 0);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 220, display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1180px, 96vw)", height: "min(788px, 93vh)", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* HEADER — title + live stat chips (the control-center readout) */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: `1px solid ${C.border}`, background: C.panel }}>
          <span style={{ fontFamily: mono, fontSize: 13, color: C.fg, fontWeight: 700 }}>context studio</span>
          <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>control center · the session's shared memory — every agent reads it</span>
          <span style={{ flex: 1 }} />
          {([
            ["📄", String(docs.length), "context items"],
            ["🔌", String(docs.filter((d) => String(d.body_md).startsWith("CONTEXT SOURCE — ")).length), "live sources (resolve at turn time)"],
            ["🧮", `≈${fmtTok(storedTok)} tok`, "stored context tokens (mission + notes — live sources add theirs at turn time; 🧾 a pane's prompt shows the exact total)"],
            ["👁", String(agentPanes.length), "agents reading"],
          ] as [string, string, string][]).map(([g, n, t]) => (
            <span key={t} title={t} style={{ fontFamily: mono, fontSize: 10, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 20, padding: "2px 9px", background: C.bg }}>{g} {n}</span>
          ))}
          <button data-testid="studio-library-open" onClick={() => setLib(true)} title="the context library — every context on this box (Claude · Codex · OpenCode · antiloki), consolidated into packs" style={{ ...btn, color: C.brand, borderColor: C.brand }}>◆ library</button>
          {lib && <ContextLibraryWindow onClose={() => setLib(false)} />}
          <button onClick={onClose} style={{ ...btn, color: C.muted }}>✕ close</button>
        </div>

        {/* MISSION — the shared goal, as a hero band */}
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, background: C.panel2, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 1, paddingTop: 7, width: 54, flexShrink: 0 }}>Mission</span>
          <textarea value={mission} onChange={(e) => setMission(e.target.value)} placeholder="the shared goal every agent reads first…" style={{ ...inp, flex: 1, minHeight: 34, resize: "vertical", boxSizing: "border-box", background: C.bg }} />
          <button onClick={saveMission} style={{ ...btn, color: C.ok, borderColor: C.ok, flexShrink: 0 }}>save</button>
        </div>

        {/* BODY — LEFT: add + inventory · RIGHT: what each pane sees */}
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1.42fr 1fr" }}>

          {/* LEFT column — add context (chips) then the thumbnail inventory */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, borderRight: `1px solid ${C.border}` }}>

            {/* ADD CONTEXT — the chip rail (one click = one source / note / file set) */}
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>Add context · one click</div>
              {SOURCE_GROUPS.map((g) => (
                <div key={g.group} style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                  <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8, width: 62 }}>{g.group}</span>
                  {g.items.map(([k, label]) => { const on = sourceUsed(label); return (
                    <button key={k} data-testid="source-chip" onClick={() => void toggleSource(label)} title={on ? "click to remove " + label : "add " + label + " as a required context source"}
                      style={{ fontFamily: mono, fontSize: 9.5, padding: "2px 8px", borderRadius: 20, cursor: "pointer", border: `1px solid ${on ? C.ok : C.border}`, background: on ? `color-mix(in oklab, ${C.ok} 14%, transparent)` : C.bg, color: on ? C.ok : C.muted }}>{on ? "✓ " : "+ "}{label}</button>
                  ); })}
                </div>
              ))}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8, width: 62 }}>Note</span>
                {DOC_CHIPS.map(([k, label]) => (
                  <button key={k} data-testid="doc-chip" onClick={() => seedChip(label)} title={"start a " + label + " context doc"}
                    style={{ fontFamily: mono, fontSize: 9.5, padding: "2px 8px", borderRadius: 20, cursor: "pointer", border: `1px solid ${C.border}`, background: C.bg, color: C.muted }}>+ {label}</button>
                ))}
                <span style={{ flex: 1 }} />
                <button data-testid="toggle-files" onClick={() => setShowFiles((v) => !v)} title="add code files as context (atlas checkbox tree)"
                  style={{ fontFamily: mono, fontSize: 9.5, padding: "2px 8px", borderRadius: 20, cursor: "pointer", border: `1px solid ${showFiles ? C.brand : C.border}`, background: showFiles ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : C.bg, color: showFiles ? C.brand : C.muted }}>
                  {showFiles ? "▾" : "▸"} 📁 code files{checked.size ? " · " + checked.size : ""}
                </button>
              </div>
              {showFiles && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <input value={fileFilter} onChange={(e) => setFileFilter(e.target.value)} placeholder="filter files…" style={{ ...inp, width: "100%", boxSizing: "border-box", fontSize: 9.5 }} />
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg, maxHeight: 168, overflow: "auto", padding: "4px 5px" }}>
                    {codePaths === null ? <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>loading atlas…</span>
                      : !codePaths.length ? <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>atlas empty — rebuild it in Code.</span>
                      : topKids(fileTree).map((k: any) => <TreeNode key={k.path} node={k} depth={0} checked={checked} onToggle={togglePath} expanded={expanded} toggleExp={toggleExp} forceOpen={!!fileFilter} ancestorChecked={false} token={tok} />)}
                  </div>
                  <button onClick={addCheckedFiles} disabled={checked.size === 0} style={{ ...btn, alignSelf: "flex-start", fontSize: 10, color: checked.size ? C.ok : C.muted, borderColor: checked.size ? C.ok : C.border }}>+ add {checked.size || ""} file{checked.size === 1 ? "" : "s"} as context</button>
                </div>
              )}
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <textarea ref={addRef} value={newDoc} onChange={(e) => setNewDoc(e.target.value)} placeholder="paste new context (docs · requirements · decisions · knowledge) — or use the chips ↑" style={{ ...inp, flex: 1, minHeight: 36, resize: "vertical", boxSizing: "border-box" }} />
                <button onClick={addDoc} disabled={!newDoc.trim()} style={{ ...btn, fontSize: 10, color: newDoc.trim() ? C.ok : C.muted, borderColor: newDoc.trim() ? C.ok : C.border, flexShrink: 0 }}>+ add context</button>
              </div>
            </div>

            {/* INVENTORY — the thumbnail grid (each context item = a typed tile) */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px" }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Context inventory · {docs.length} · injected into every agent's prompt</div>
              {docs.length === 0 && <span style={padded}>no context yet — click a source chip, seed a note, or add files ↑</span>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(152px, 1fr))", gap: 8 }}>
                {docs.map((d) => { const info = classifyDoc(d.body_md); const open = expandDoc === d.id; return (
                  <div key={d.id} data-testid="studio-doc" onClick={() => setExpandDoc(open ? null : d.id)} title="click to expand"
                    style={{ gridColumn: open ? "1 / -1" : "auto", border: `1px solid ${open ? info.color : C.border}`, borderRadius: 9, padding: 9, background: C.panel, cursor: "pointer", display: "flex", flexDirection: "column", gap: 7 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <DocThumb info={info} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{info.title}</div>
                        <div style={{ fontFamily: mono, fontSize: 8.5, color: info.color }}>{info.kindLabel}{info.meta ? " · " + info.meta : ""} · {info.kind === "source" ? "live" : `≈${fmtTok(estTok(d.body_md))} tok`}</div>
                      </div>
                      <span style={{ fontFamily: mono, fontSize: 10, color: C.dim, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
                    </div>
                    {open && (editId === d.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }} onClick={(e) => e.stopPropagation()}>
                        <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} style={{ ...inp, width: "100%", minHeight: 90, resize: "vertical", boxSizing: "border-box" }} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={saveEdit} style={{ ...btn, fontSize: 10, color: C.ok, borderColor: C.ok }}>save</button>
                          <button onClick={() => setEditId(null)} style={{ ...btn, fontSize: 10, color: C.muted }}>cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div onClick={(e) => e.stopPropagation()}>
                        <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflowY: "auto", borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>{d.body_md}</div>
                        {info.kind === "source" && <SourcePreview label={info.title} />}
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <button onClick={() => { setEditId(d.id); setEditBody(d.body_md); }} style={{ ...btn, fontSize: 9.5, padding: "1px 8px", color: C.muted }}>edit</button>
                          <button onClick={() => delDoc(d.id)} style={{ ...btn, fontSize: 9.5, padding: "1px 8px", color: C.bad, borderColor: C.border }}>retire</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ); })}
              </div>
            </div>
          </div>

          {/* RIGHT column — WHO READS WHAT (the transparency center): agents get the
              full slice with per-doc read toggles + the prompt window; engines read
              via files; tools read nothing. Different panes, different context. */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ padding: "10px 14px 6px", fontFamily: mono, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>
              Who reads what · <span style={{ color: C.ok }}>context = READS</span> · <span style={{ color: C.warn }}>scope = WRITES</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
              {panes.length === 0 && <span style={padded}>no panes in this session yet.</span>}
              {agentPanes.length > 0 && <div style={{ fontFamily: mono, fontSize: 8.5, color: C.brand, textTransform: "uppercase", letterSpacing: 0.8 }}>🤖 agents · full context slice, editable per agent</div>}
              {agentPanes.map((p) => (
                <AgentContextCard key={p.id} p={p} docs={docs} scratchCount={(scratchByPane[p.id] ?? []).length} onChanged={onChanged} onPrompt={() => setPromptFor(p.id)} />
              ))}
              {enginePanes.length > 0 && (<>
                <div style={{ fontFamily: mono, fontSize: 8.5, color: C.brand, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 4 }}>⌨ engines · context via AGENTS.md in their worktrees</div>
                {enginePanes.map((p) => (
                  <div key={p.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, padding: "6px 9px", display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: mono, fontSize: 11, color: C.fg, fontWeight: 600 }}>#{p.idx + 1}</span>
                      <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{p.subagent_name} · {kindOf(p)}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>reads its worktree's AGENTS.md brief (mission + guidance at provision time)</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                      <span style={{ fontFamily: mono, fontSize: 8, color: C.warn, textTransform: "uppercase", letterSpacing: 0.8, width: 42 }}>writes</span>
                      {(p.scope ?? []).length
                        ? (p.scope as string[]).map((g: string) => <span key={g} style={{ fontFamily: mono, fontSize: 9, padding: "1px 7px", borderRadius: 10, border: `1px solid ${C.warn}`, color: C.warn }}>{g}</span>)
                        : <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>unrestricted (gated at merge)</span>}
                    </div>
                  </div>
                ))}
              </>)}
              {toolPanes.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>🛠 tools · read nothing — no AI, no context</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {toolPanes.map((p) => <span key={p.id} style={{ fontFamily: mono, fontSize: 9, padding: "1px 8px", borderRadius: 10, border: `1px solid ${C.border}`, color: C.dim }}>#{p.idx + 1} {p.subagent_name}</span>)}
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.border}`, fontFamily: mono, fontSize: 9, color: C.dim }}>
              🧾 prompt = the EXACT slice the next turn sends (sources embedded live) + token sums. Unchecking a doc excludes it for that agent only.
            </div>
          </div>
        </div>
        {promptFor != null && <PromptWindow paneId={promptFor} onClose={() => setPromptFor(null)} />}

        {/* COORDINATION — the cross-agent ticker (full-width footer) */}
        <div style={{ borderTop: `1px solid ${C.border}`, background: C.panel, padding: "7px 14px", maxHeight: 94, overflowY: "auto" }}>
          <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Coordination · handoffs · claims · {coordination.length}</div>
          {coordination.length === 0 && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>file changes, @handoffs + claims appear here as the agents work.</span>}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {coordination.map((c) => (
              <div key={c.id ?? c.created_at} style={{ fontFamily: mono, fontSize: 10, color: C.muted, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                <span style={{ color: C.dim }}>[{c.kind}] </span>{c.body_md}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── NOTES pane: one note filling the pane, saved automatically (operator 2026-10-11) - see notes-pane.tsx ──
export { NotesPane } from "./notes-pane";

// ── STATE pane (operator: "a state pane, like a mini dashboard — all diffs + info") ──
// A live at-a-glance dashboard for the whole super-session: per-pane worktree
// diffstat + status + cost, session totals, and PR readiness — composed from
// the git-graph data the GitGraphPane already polls, read-only.
export function StatePane({ sessionId, panes }: { sessionId: number; panes: Pane[] }) {
  const [g, setG] = React.useState<any>(null);
  React.useEffect(() => {
    let stop = false;
    const poll = async () => {
      try { const d = unwrap(await apiPost("/api/v1/cockpit/git-graph", { op: "graph", session_id: sessionId }, { timeoutMs: 20000 })); if (!stop) setG(d); } catch { /* */ }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [sessionId]);
  const lanes: any[] = g?.lanes ?? g?.worktrees ?? [];
  const totalChanged = lanes.reduce((a: number, l: any) => a + (l.changed ?? l.dirty ?? 0), 0);
  const totalCost = panes.reduce((a: number, p: any) => a + (p.cost_usd ?? 0), 0);
  const stat = (v: React.ReactNode, k: string, tint: string = C.fg) => (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", minWidth: 78 }}>
      <div style={{ fontFamily: mono, fontSize: 17, color: tint, fontWeight: 700 }}>{v}</div>
      <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, marginTop: 2 }}>{k}</div>
    </div>
  );
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {stat(panes.length, "agents")}
        {stat(totalChanged, "changed files", totalChanged ? C.warn : C.dim)}
        {stat(lanes.filter((l: any) => (l.ahead ?? 0) > 0).length, "ahead branches", C.brand)}
        {stat("$" + totalCost.toFixed(3), "session spend", C.ok)}
      </div>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}`, background: C.panel2, fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>per-agent worktree state</div>
        {panes.length === 0 && <div style={padded}>no agent panes yet.</div>}
        {panes.map((p) => {
          const lane = lanes.find((l: any) => l.pane_id === p.id || l.branch === p.branch);
          const changed = lane?.changed ?? lane?.dirty ?? 0;
          return (
            <div key={p.id} data-testid="state-row" style={{ display: "grid", gridTemplateColumns: "26px 1fr 70px 66px 70px", gap: 8, padding: "6px 10px", borderTop: `1px solid ${C.border}`, fontFamily: mono, fontSize: 10.5, alignItems: "center" }}>
              <span style={{ color: C.fg, fontWeight: 600 }}>#{p.idx + 1}</span>
              <span style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.subagent_name}</span>
              <span style={{ color: changed ? C.warn : C.dim }}>{changed ? `${changed} chg` : "clean"}</span>
              <span style={{ color: (lane?.ahead ?? 0) > 0 ? C.brand : C.dim }}>{lane?.ahead ? `↑${lane.ahead}` : "—"}</span>
              <span style={{ color: C.dim, textAlign: "right" }}>{p.cost_usd ? "$" + p.cost_usd.toFixed(3) : "—"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DEV SCRIPT FIX (operator 2026-09-16: "scripts/run is not working", "design canvas is not
// working"): both booted through pr/preview/start and died on "no dev script set — configure it on
// the Code screen". The fix is inline now: type the dev command, it lands in the scripts registry
// (workspace/scripts {dev}) and the boot retries — no trip to the Code screen.
export const needsDevScript = (log: string | null | undefined) => /no ['"]?dev['"]? script/i.test(String(log ?? ""));
export function DevScriptFix({ onSaved }: { onSaved: () => void }) {
  const [cmd, setCmd] = React.useState("");
  const [detected, setDetected] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    (async () => {
      try { const r: any = await apiGet(`/api/v1/workspace/scripts`); const d = r?.result ?? r; const guess = d?.detected?.dev ?? null; if (guess) { setDetected(String(guess)); setCmd((c) => c || String(guess)); } } catch { /* strip hides */ }
    })();
  }, []);
  const save = async () => {
    if (!cmd.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r: any = await apiPost(`/api/v1/workspace/scripts`, { dev: cmd.trim() }, { timeoutMs: 20000 });
      const d = r?.result ?? r;
      if (d?.ok === false) { setErr(d?.error ?? "could not save"); setBusy(false); return; }
      onSaved();
    } catch (e: any) { setErr(e?.message ?? "could not save"); setBusy(false); }
  };
  return (
    <div data-testid="dev-script-fix" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", borderTop: `1px solid ${C.border}`, background: C.panel }}>
      <span style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>no <b>dev</b> script recorded for this workspace — set it here (saved to the scripts registry) and the boot retries:</span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} placeholder={detected ?? "npm run dev"} spellCheck={false} style={{ ...inp, flex: 1, fontSize: 10.5 }} />
        <button disabled={busy || !cmd.trim()} onClick={() => void save()} style={{ ...btn, padding: "2px 10px", fontSize: 10, color: C.ok, borderColor: C.ok }}>{busy ? "saving…" : "save & boot"}</button>
      </div>
      {detected && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>detected from package.json: <code>{detected}</code></span>}
      {err && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.bad }}>{err}</span>}
    </div>
  );
}

// ── RUN pane (operator 2026-07-13: run/gate "arent working, it says soon") ────
// Boots the workspace's saved `dev` script in a chosen target (the workspace root
// or a sibling pane's worktree) via the SAME preview manager the Pulls screen uses
// (pr/preview/* — resolve, spawn, sniff the URL from the server's own output), then
// flips into the live app in an iframe. ↗ open is the cross-origin fallback.
export function RunPane({ p, panes, onChanged }: { p: Pane; panes: Pane[]; onChanged: () => void }) {
  const wtPanes = panes.filter((x: any) => x.worktree_path && x.id !== p.id);
  // stored target: script_worktree_pane = a sibling pane id, 0/unset = workspace root
  const [target, setTarget] = React.useState<number>(Number(p.script_worktree_pane ?? paneSettings(p).target_pane ?? 0) || 0);
  // …AND IT RE-READS THAT TARGET WHEN THE PROP MOVES (2026-09-28). `useState` only ever reads its initialiser, so
  // once the chat re-pointed the widget at another agent this pane went on polling the old `ref_slug` forever.
  const wanted = Number(p.script_worktree_pane ?? paneSettings(p).target_pane ?? 0) || 0;
  React.useEffect(() => { setTarget((cur) => (cur === wanted ? cur : wanted)); }, [wanted]);
  const [st, setSt] = React.useState<any>({ running: false, url: null, log: "" });
  const [booting, setBooting] = React.useState(false);
  const key = target ? `pane:${target}` : "root";

  const poll = React.useCallback(async () => {
    try { const r: any = await apiGet(`/api/v1/pr/preview/status?ref_slug=${encodeURIComponent(key)}`); const d = r?.result ?? r; setSt(d ?? { running: false, url: null, log: "" }); if (d?.exited != null) setBooting(false); return d; } catch { return null; }
  }, [key]);
  // the LINKED PREVIEW (2026-09-21): a cell the agent's ▶ preview button added — pinned to that agent, boots by itself
  const autoboot = paneSettings(p).autoboot === true;
  const booted = React.useRef(false);
  // a NEW TARGET (the chat re-pointed this widget at another agent) is a new chance to boot: `booted` was the first target's
  React.useEffect(() => { booted.current = false; }, [key]);
  React.useEffect(() => { poll().then((d: any) => { if (d?.running || d?.url) { setBooting(true); booted.current = true; } else if (autoboot && target && !booted.current) { booted.current = true; void boot(); } else setBooting(false); /* re-pointed at a target with nothing running: drop the last target's "booting…" so ▶ boot dev is offered (2026-09-28) */ }); }, [poll]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!booting || st?.url) return; // poll until the URL appears (or the server exits)
    const t = setInterval(poll, 1500); return () => clearInterval(t);
  }, [booting, st?.url, poll]);

  const boot = async () => {
    setBooting(true); setSt({ running: true, url: null, log: "starting…" });
    try {
      const body = target ? { pane_id: target } : { target: "root" };
      const r: any = await apiPost("/api/v1/pr/preview/start", body, { timeoutMs: 30000 });
      const d = r?.result ?? r;
      if (!d?.ok) { setSt({ running: false, url: null, log: d?.error ?? "could not boot the dev server", exited: -1 }); setBooting(false); return; }
      if (target !== Number(p.script_worktree_pane ?? 0)) { await apiPost("/api/v1/cockpit/pane/update", { pane_id: p.id, script_worktree_pane: target }, { timeoutMs: 30000 }); onChanged(); }
      poll();
    } catch (e: any) { setSt({ running: false, url: null, log: e?.message ?? String(e), exited: -1 }); setBooting(false); }
  };
  const stop = async () => { try { await apiPost("/api/v1/pr/preview/stop", { ref_slug: key }, { timeoutMs: 15000 }); } catch { /* */ } setBooting(false); setSt({ running: false, url: null, log: "" }); };

  const url = st?.url;
  const exited = st?.exited != null && !url;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <select value={target} onChange={(e) => setTarget(Number(e.target.value))} disabled={booting || !!url} style={{ ...inp, flex: 1, minWidth: 120, fontSize: 10 }} title="where the dev server runs">
          <option value={0}>workspace root</option>
          {wtPanes.map((x: any) => <option key={x.id} value={x.id}>#{x.idx + 1} {x.subagent_name} · {x.branch ?? "worktree"}</option>)}
        </select>
        {url && <span style={{ fontFamily: mono, fontSize: 9, color: C.ok, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }} title={url}>▶ {url}</span>}
        {!booting && !url && <button onClick={boot} style={{ ...btn, padding: "1px 10px", fontSize: 10, color: C.ok, borderColor: C.ok }}>▶ boot dev</button>}
        {exited && <button onClick={boot} style={{ ...btn, padding: "1px 10px", fontSize: 10, color: C.brand }}>▶ retry</button>}
        {url && <button onClick={() => window.open(url, "_blank")} style={{ ...btn, padding: "1px 8px", fontSize: 10, color: C.muted }} title="open in a browser tab (if the app refuses the iframe)">↗</button>}
        {(booting || url) && <button onClick={stop} style={{ ...btn, padding: "1px 8px", fontSize: 10, color: C.bad, borderColor: C.bad }}>■</button>}
      </div>
      {url
        ? <iframe src={url} title={`run pane ${p.id}`} style={{ flex: 1, width: "100%", minHeight: 0, border: "none", background: "#fff" }} />
        : (booting || exited)
          ? <>
              <pre style={{ flex: 1, margin: 0, padding: "8px 10px", overflow: "auto", minHeight: 0, background: "#0b0f16", fontFamily: mono, fontSize: 9.5, lineHeight: 1.5, color: exited ? "#f0b6b6" : "#c9d4e3", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{st?.log || (exited ? "the dev server exited before a URL appeared — check the dev script + deps in this target" : "booting the dev server… (watching its output for the URL)")}</pre>
              {exited && needsDevScript(st?.log) && <DevScriptFix onSaved={() => void boot()} />}
            </>
          : <div style={{ ...padded, fontSize: 10 }}>▶ boots the workspace's saved <b style={{ color: C.fg }}>dev</b> script in the chosen target and flips into the live app on its detected port.</div>}
    </div>
  );
}

// ── GATE pane (operator 2026-07-13) ──────────────────────────────────────────
// The session's quality gate: runs the scripts-registry build + test commands in a
// chosen sibling worktree (cockpit/script-run — never free text) and renders the
// verdict as PASS/FAIL chips. ▶ gate chains build → test (test only if build passes).
export function GatePane({ p, panes }: { p: Pane; panes: Pane[] }) {
  const wtPanes = panes.filter((x: any) => x.worktree_path && x.id !== p.id);
  const [wtPane, setWtPane] = React.useState<number | null>(p.script_worktree_pane ?? (Number(paneSettings(p).target_pane) || null) ?? wtPanes[0]?.id ?? null);
  const [verdict, setVerdict] = React.useState<Record<string, "running" | "pass" | "fail" | null>>({ build: null, test: null });
  const [out, setOut] = React.useState("");
  const [err2, setErr2] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const phase = React.useRef<"build" | "test" | null>(null);
  const chain = React.useRef(false); // ▶ gate: auto-run test after a green build
  const lastId = React.useRef(0);
  const boxRef = React.useRef<HTMLPreElement | null>(null);

  const fire = React.useCallback(async (kind: "build" | "test") => {
    if (!wtPane) { setErr2("pick a worktree pane first"); return false; }
    setErr2(null); lastId.current = 0; setOut((o) => (o ? o + "\n" : "") + `── ${kind} gate ──\n`); setRunning(true);
    phase.current = kind; setVerdict((v) => ({ ...v, [kind]: "running" }));
    try {
      const r: any = await apiPost("/api/v1/cockpit/script-run", { op: "run", pane_id: p.id, script: kind, worktree_pane_id: wtPane }, { timeoutMs: 30000 });
      const d = r?.result ?? r;
      if (!d?.ok) { setErr2(d?.error ?? "run refused"); setVerdict((v) => ({ ...v, [kind]: null })); setRunning(false); return false; }
      return true;
    } catch (e: any) { setErr2(e?.message ?? "run failed"); setVerdict((v) => ({ ...v, [kind]: null })); setRunning(false); return false; }
  }, [wtPane, p.id]);

  React.useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const r: any = await apiGet(`/api/v1/gate/build-live?contract_slug=${encodeURIComponent(`vibe-pane-${p.id}`)}&after=${lastId.current}`);
        const d = r?.result ?? r;
        if (stop || !d) return;
        let tail = "";
        if (d.chunks?.length) {
          lastId.current = d.last_id;
          tail = d.chunks.map((c: any) => c.chunk ?? "").join("");
          setOut((prev) => (prev + tail).slice(-60000));
          requestAnimationFrame(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; });
        }
        if (d.done && phase.current) {
          const kind = phase.current; phase.current = null;
          const m = /\(exit (\d+|killed)\)\s*$/.exec(tail) ?? /\(exit (\d+|killed)\)\s*$/.exec(out + tail);
          const pass = m?.[1] === "0";
          setVerdict((v) => ({ ...v, [kind]: pass ? "pass" : "fail" }));
          setRunning(false);
          if (chain.current) { chain.current = false; if (kind === "build" && pass) void fire("test"); }
        }
      } catch { /* endpoint absent pre-restart */ }
    };
    poll();
    const t = setInterval(poll, running ? 1000 : 5000);
    return () => { stop = true; clearInterval(t); };
  }, [p.id, running, fire, out]);

  const gateAll = async () => { chain.current = true; setVerdict({ build: null, test: null }); const ok = await fire("build"); if (!ok) chain.current = false; };
  const chip = (kind: "build" | "test") => {
    const v = verdict[kind];
    const col = v === "pass" ? C.ok : v === "fail" ? C.bad : v === "running" ? C.warn : C.muted;
    const glyph = v === "pass" ? "✓" : v === "fail" ? "✗" : v === "running" ? "●" : "○";
    return (
      <span key={kind} data-testid={`gate-${kind}`} style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700, color: col, border: `1px solid ${col}`, borderRadius: 10, padding: "1px 8px", textTransform: "uppercase", letterSpacing: 0.6 }}>{glyph} {kind}</span>
    );
  };
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <select value={wtPane ?? ""} onChange={(e) => setWtPane(e.target.value ? Number(e.target.value) : null)} style={{ ...inp, flex: 1, minWidth: 120, fontSize: 10 }} title="the worktree the gates run in">
          <option value="">— pick the worktree to gate —</option>
          {wtPanes.map((x: any) => <option key={x.id} value={x.id}>#{x.idx + 1} {x.subagent_name} · {x.branch ?? "worktree"}</option>)}
        </select>
        {chip("build")}{chip("test")}
        <button onClick={gateAll} disabled={running} style={{ ...btn, padding: "1px 10px", fontSize: 10, color: running ? C.muted : C.ok, borderColor: running ? C.border : C.ok }} title="build gate, then test gate if the build passes">▶ gate</button>
        <button onClick={() => void fire("build")} disabled={running} style={{ ...btn, padding: "1px 7px", fontSize: 9.5, color: C.muted }}>build</button>
        <button onClick={() => void fire("test")} disabled={running} style={{ ...btn, padding: "1px 7px", fontSize: 9.5, color: C.muted }}>test</button>
        {running && <button onClick={async () => { try { await apiPost("/api/v1/cockpit/script-run", { op: "stop", pane_id: p.id }, { timeoutMs: 15000 }); } catch { /* */ } phase.current = null; chain.current = false; setRunning(false); }} style={{ ...btn, padding: "1px 8px", fontSize: 10, color: C.bad, borderColor: C.bad }}>■</button>}
      </div>
      {err2 && <div style={{ padding: "4px 10px", fontFamily: mono, fontSize: 9.5, color: C.bad }}>{err2}</div>}
      <pre ref={boxRef} style={{ flex: 1, margin: 0, padding: "8px 10px", overflow: "auto", minHeight: 0, background: "#0b0f16", fontFamily: mono, fontSize: 9.5, lineHeight: 1.5, color: "#c9d4e3", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {out || "pick a worktree and hit ▶ gate — build + test from the scripts registry, verdict chips above."}
      </pre>
    </div>
  );
}
