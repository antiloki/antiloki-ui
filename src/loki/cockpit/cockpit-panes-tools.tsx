// VIBE TOOL PANES, wave 2 (operator 2026-07-13): the read-only CODE IDE, the code
// DIAGRAMS + GRAPH (the code screen's own components, reused), KANBAN (the board
// beside the agents), STANDUP (one click → every turn-capable agent reports),
// SHELL (a real PTY in the root or any worktree), REVIEW (ALL panes' diffs in one
// seat — per-pane diff buttons retired), TODO (a checkable session todolist),
// RACE (same brief to N agents, referee + crown), and SESSION TIMELINE (this
// session's audit: skills fired, AI calls, sacred_timeline rows).
import type { Pane } from "@/loki/api/types";
import { paneDisplay } from "@/loki/widgets/types";
import { placeOf, readStage } from "@/loki/cockpit/agents-float";
import { useWorkspaces } from "@/loki/api/hooks";
import * as React from "react";
import { apiPost, apiGet, unwrapResult as unwrap } from "@/loki/api/client";
import { startBlockDrag } from "@/loki/widgets/agent-interact";
import { C, nav } from "@/loki/theme";
import { useShell } from "@/loki/shell/slug-context";
import { AtlasGraphMini, DiagramView } from "@/loki/codebase/atlas-graph";
import { getAtlas, type AtlasResponse } from "@/loki/api/codebase";
import { buildTree, sortKids, TreeRow } from "@/loki/codebase/file-tree";
import { Highlighted } from "@/loki/codebase/highlight";
import { PtyTerminal } from "@/loki/settings/env-terminal";
import { VIBE_AGENTS, KIND_IDENT } from "./pane-gallery";
import { DevScriptFix, needsDevScript } from "./cockpit-panes-extra";
import { fetchUsage, usageChipTitle, type PackUsage } from "@/loki/widgets/context-pack";
import { CLI_KINDS } from "@/loki/widgets/agent-close";
import { fetchAnswers } from "@/loki/widgets/context-pack";
import { sayToAgent } from "@/loki/widgets/agent-interact";
import { CodeBlueprint } from "./code-blueprint";
import { CanvasBoard, type BoardCard, type BoardEdge } from "./canvas-board";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
// per-pane tool settings (settings_json — set in the add wizard, read here)
export const paneSettings = (p: any) => { try { return JSON.parse(p?.settings_json ?? "{}") ?? {}; } catch { return {}; } };
const fmtTok = (x: number) => (x >= 1000 ? (x / 1000).toFixed(1) + "k" : String(x));
const VIBE_PERSONAS: Record<string, string> = Object.fromEntries(VIBE_AGENTS.map((v) => [v.key, v.persona]));
const VIBE_AVATARS: Record<string, string> = Object.fromEntries(VIBE_AGENTS.map((v) => [v.key, v.avatar]));
const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 11, padding: "3px 10px", borderRadius: 5 };
const inp: React.CSSProperties = { background: C.bg, border: `1px solid ${C.border}`, color: C.fg, fontFamily: mono, fontSize: 11, padding: "4px 8px", borderRadius: 5, outline: "none" };
const padded: React.CSSProperties = { padding: "16px 10px", color: C.muted, fontStyle: "italic", fontFamily: mono, fontSize: 11 };
const head: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8 };

// one atlas fetch shared by the graph + diagram panes (module cache, ↻ refetches)
let atlasCache: AtlasResponse | null | undefined;
export function useAtlas(): [AtlasResponse | null | undefined, () => void] {
  const [atlas, setAtlas] = React.useState<AtlasResponse | null | undefined>(atlasCache);
  const load = React.useCallback(() => {
    atlasCache = undefined; setAtlas(undefined);
    getAtlas({ origin: "atlas", limit: 4000 }).then((a) => { atlasCache = a; setAtlas(a); }).catch(() => { atlasCache = null; setAtlas(null); });
  }, []);
  React.useEffect(() => { if (atlasCache === undefined) load(); }, [load]);
  return [atlas, load];
}

// ── CODE pane — the read-only mini-IDE (the code screen's tree + viewer) ──────
export function CodeIdePane({ p, panes }: { p?: Pane; panes?: Pane[] } = {}) {
  const [paths, setPaths] = React.useState<string[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [sel, setSel] = React.useState<string | null>(null);
  const [data, setData] = React.useState<any>(null);
  // browse the WORKSPACE or any of the session's WORKTREES (operator
  // 2026-07-15) — the choice persists on the pane's settings
  const wtPanes = (panes ?? []).filter((x: any) => x.worktree_path && x.id !== p?.id);
  const [wt, setWt] = React.useState<string>(String(paneSettings(p).wt ?? ""));
  const pickWt = (v: string) => {
    setWt(v); setSel(null); setData(null); setPaths(null); setErr(null);
    if (p?.id) void apiPost("/api/v1/cockpit/pane/update", { pane_id: p.id, settings: { ...paneSettings(p), wt: v } }, { timeoutMs: 20000 }).catch(() => { /* persistence is best-effort */ });
  };
  const [openMap, setOpenMap] = React.useState<Record<string, boolean>>(() => {
    const dir = String(paneSettings(p).dir ?? "");
    if (!dir) return {};
    const o: Record<string, boolean> = {}; const parts = dir.split("/");
    for (let i = 1; i <= parts.length; i++) o[parts.slice(0, i).join("/")] = true;
    return o;
  });
  React.useEffect(() => {
    let stop = false;
    apiPost("/api/v1/code/tree", { ...(wt ? { root: wt } : {}) }, { timeoutMs: 30000 }).then((r: any) => {
      const d = unwrap(r);
      if (stop) return;
      const out: string[] = [];
      const walk = (n: any) => { if (!n) return; if (n.type === "file") { out.push(String(n.path)); return; } (n.children ?? []).forEach(walk); };
      walk(d?.tree);
      out.length ? setPaths(out.sort()) : setErr("empty tree — is the workspace git-tracked?");
    }).catch((e: any) => { if (!stop) setErr(e?.message ?? String(e)); });
    return () => { stop = true; };
  }, [wt]);
  React.useEffect(() => {
    if (!sel) return;
    let stop = false; setData(null);
    apiPost("/api/v1/code/file", { path: sel, ...(wt ? { root: wt } : {}) }, { timeoutMs: 30000 })
      .then((r: any) => { if (!stop) setData(unwrap(r)); })
      .catch((e: any) => { if (!stop) setData({ ok: false, error: e?.message ?? String(e) }); });
    return () => { stop = true; };
  }, [sel, wt]);
  const rootNode = React.useMemo(() => (paths ? buildTree(paths.map((p) => ({ path: p, fileNode: null }))) : null), [paths]);
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {wtPanes.length > 0 && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 8px", borderBottom: `1px solid ${C.border}`, background: C.panel, flexShrink: 0 }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>root</span>
          <select value={wt} onChange={(e) => pickWt(e.target.value)} style={{ background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 6px", fontFamily: mono, fontSize: 9.5, flex: 1, minWidth: 0 }}>
            <option value="">workspace (main)</option>
            {wtPanes.map((x: any) => <option key={x.id} value={x.worktree_path}>#{x.idx + 1} {x.subagent_name} · {x.branch ?? x.worktree_path}</option>)}
          </select>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ width: 170, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflowY: "auto", background: C.panel, paddingTop: 4 }}>
          {paths === null && !err && <div style={{ ...padded, fontSize: 9.5 }}>listing…</div>}
          {err && <div style={{ fontFamily: mono, fontSize: 9, color: C.bad, padding: "2px 9px" }}>{err}</div>}
          {rootNode && sortKids(rootNode).map((n: any) => (
            <TreeRow key={n.path} node={n} depth={0} selected={sel} onPick={(node: any) => setSel(node.path)}
              openMap={openMap} setOpen={(p: string, v: boolean) => setOpenMap((m) => ({ ...m, [p]: v }))}
              epCount={() => 0} fontPx={9.5} />
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, overflow: "auto" }}>
            {!sel ? <div style={padded}>pick a file — {wt ? "this agent's worktree" : "the whole workspace"}, read-only.</div>
              : !data ? <div style={padded}>loading…</div>
              : data.ok === false ? <div style={{ ...padded, color: C.bad }}>{data.reason || data.error || "could not read"}</div>
              : <Highlighted code={data.content ?? ""} fontSize={10.5} lineHeight={1.5} lineNumW={42} pad={10} />}
          </div>
          <div style={{ padding: "3px 10px", borderTop: `1px solid ${C.border}`, background: C.panel, fontFamily: mono, fontSize: 8.5, color: C.dim, flexShrink: 0 }}>{sel ?? "—"} · read-only · {wt ? "worktree" : "workspace"}</div>
        </div>
      </div>
    </div>
  );
}

// ═══ THE BRAINSTORM WIZARD — the control center (operator 2026-07-15:
// "interactable — chips, editable sections, sources, drag and drop, steps").
// A fullscreen-ish OVERLAY shared by the plan pane's 🧠 and the intent
// pane's ✨: ① seed + grounding sources → ② ideas as chips (toggle · remove
// · add your own · rename/add sections · drag between dimensions · re-
// brainstorm merges) → ③ forge the picks into the BASE PLAN + decision-tree
// CARDS. The caller decides where the forge lands. ═════════════════════════
type WizIdea = { id: string; text: string; picked: boolean; bundle?: string };
type WizDim = { key: string; title: string; ideas: WizIdea[] };
const wizUid = () => Math.random().toString(36).slice(2, 8);
// the FULL context-studio catalog (operator 2026-07-15: "add all context chips
// from the context studio — don't lose any"). MIRROR of SOURCE_GROUPS in
// cockpit-panes-extra + the session mission/shared docs; keep in sync. Every
// kind resolves through the same notebook-corpus gather the agents read.
const WIZ_CONTEXT: Array<{ group: string; items: Array<[string, string]> }> = [
  { group: "session", items: [["mission", "🎯 mission"], ["shared", "🧠 shared docs · RFCs"]] },
  { group: "code", items: [["ast", "AST"], ["descriptions", "Descriptions"], ["digest", "Digest"], ["entrypoints", "Entry points"], ["data_stories", "Data stories"], ["design", "Design"], ["tests", "Tests"], ["git", "Git"], ["docs", "Docs"]] },
  { group: "work", items: [["cards", "Cards"], ["contracts", "Contracts"], ["failures", "Failures"], ["decisions", "Decisions"], ["timeline", "Timeline"]] },
  { group: "knowledge", items: [["memory", "Memory"], ["faculty_arch", "Stack Gazette"], ["faculty_product", "Market Herald"]] },
];

// module-level wizard memory — survives pane unmount (tab switches) within the
// SPA (operator 2026-07-15: "the brainstorm wizard is disappearing… don't
// disappear just because I switch tabs"). Keyed per session+pane so each wizard
// keeps its own dims/forged/ran across remounts; only ✕ (onClose) clears it.
type WizMem = { open: boolean; seed: string; dims: WizDim[]; forged: number; ran: boolean; lastCall: number | null };
const WIZ_MEM: Record<string, WizMem> = {};
export const wizMem = (sessionId: number, paneId: number): WizMem =>
  (WIZ_MEM[`wiz:${sessionId}:${paneId}`] ??= { open: false, seed: "", dims: [], forged: 0, ran: false, lastCall: null });
export const clearWizMem = (sessionId: number, paneId: number) => { delete WIZ_MEM[`wiz:${sessionId}:${paneId}`]; };

export function BrainstormWizard({ sessionId, paneId, initialSeed, sources, onForged, onClose }: {
  sessionId: number; paneId: number; initialSeed?: string; sources?: string[];
  onForged: (r: { base_plan_md: string; cards: Array<{ id: string; q: string; options: Array<{ id: string; label: string }>; chosen: null }> }) => void | Promise<void>;
  onClose: () => void;
}) {
  // RESULTS-ONLY + AUTO-RUN (operator 2026-07-15: the seed rides the intent
  // line and the ✨ button is the ONLY trigger — no second seed/sources/button
  // here). The wizard brainstorms on mount using the passed seed + sources.
  // restore from the module store so a tab switch (unmount/remount) never loses
  // the dims, the forged count, or the ran-once guard (which also stops a costly
  // re-brainstorm on every remount).
  const mem0 = wizMem(sessionId, paneId);
  const [wiz, setWiz] = React.useState<{ seed: string; busy: string; err: string; dims: WizDim[]; newIdea: Record<string, string>; drag: { dim: number; idx: number } | null; forged: number }>(
    { seed: mem0.seed || (initialSeed ?? ""), busy: "", err: "", dims: mem0.dims, newIdea: {}, drag: null, forged: mem0.forged },
  );
  const ran = React.useRef(mem0.ran);
  // on mount: the DURABLE brainstorm (saved to the ultra plan) wins — restore it
  // and DON'T re-spend; only auto-brainstorm when there's nothing saved anywhere
  React.useEffect(() => {
    (async () => {
      if (ran.current || wiz.dims.length) return; // the module store already had chips
      const d = unwrap(await apiPost("/api/v1/cockpit/plan/generate", { session_id: sessionId, mode: "plan-get" }, { timeoutMs: 20000 }).catch(() => null));
      const dims = d?.plan?.brainstorm?.dims;
      if (Array.isArray(dims) && dims.length) { ran.current = true; wizMem(sessionId, paneId).ran = true; setWiz((w) => (w.dims.length ? w : { ...w, dims })); return; }
      if (!ran.current && (initialSeed ?? "").trim()) { ran.current = true; wizMem(sessionId, paneId).ran = true; void brainstorm(); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // persist the durable slice on every change — the store is the source of truth
  // the next mount reads back
  React.useEffect(() => { const m = wizMem(sessionId, paneId); m.seed = wiz.seed; m.dims = wiz.dims; m.forged = wiz.forged; }, [wiz, sessionId, paneId]);
  const [editing, setEditing] = React.useState<{ id: string; text: string } | null>(null);
  const [refining, setRefining] = React.useState<{ id: string; intent: string } | null>(null);
  // AI transparency (operator 2026-07-15: "the brainstorm call should be
  // transparent — a discrete button to open the AI-call window"). Every call
  // stamps its id here; the ⌖ chip opens the shell's call inspector.
  const { setAiCallId } = useShell();
  const [lastCall, setLastCall] = React.useState<number | null>(mem0.lastCall);
  React.useEffect(() => { wizMem(sessionId, paneId).lastCall = lastCall; }, [lastCall, sessionId, paneId]);
  const stamp = (d: any) => { if (d?.ai_call_id != null) setLastCall(d.ai_call_id); return d; };
  const wizPicked = () => wiz.dims.flatMap((dm) => dm.ideas.filter((i) => i.picked).map((i) => {
    const parent = i.bundle ? dm.ideas.find((x) => x.id === i.bundle) : null;
    return parent ? `[${dm.key}] ${parent.text} → ${i.text}` : `[${dm.key}] ${i.text}`;
  }));
  const wizSetDim = (di: number, patch: Partial<WizDim>) => setWiz((w) => ({ ...w, dims: w.dims.map((x, i) => (i === di ? { ...x, ...patch } : x)) }));
  const brainstorm = async () => {
    setWiz((w) => ({ ...w, busy: "brainstorm", err: "" }));
    try {
      const r: any = await apiPost("/api/v1/cockpit/plan/generate", { session_id: sessionId, pane_id: paneId, ambition: (initialSeed ?? "").trim(), mode: "wizard", sources: sources ?? ["mission", "shared", "digest"] }, { timeoutMs: 180000 });
      const d = stamp(r?.result ?? r);
      if (d?.ok && Array.isArray(d.dimensions)) {
        setWiz((w) => {
          // MERGE, never replace: your edits and picks survive a re-brainstorm
          const dims = [...w.dims];
          for (const dm of d.dimensions) {
            const have = dims.find((x) => x.key === dm.key);
            const fresh = (dm.ideas ?? []).map((t2: string) => ({ id: wizUid(), text: t2, picked: false }));
            if (have) { const seen = new Set(have.ideas.map((i) => i.text)); have.ideas.push(...fresh.filter((i: WizIdea) => !seen.has(i.text))); }
            else dims.push({ key: dm.key, title: dm.title || dm.key, ideas: fresh });
          }
          return { ...w, busy: "", dims };
        });
      } else setWiz((w) => ({ ...w, busy: "", err: d?.error ?? "the wizard failed" }));
    } catch (e: any) { setWiz((w) => ({ ...w, busy: "", err: e?.message ?? "the wizard failed" })); }
  };
  // per-dimension / per-chip AI ops — one small transparent call each
  const ideate = async (busyKey: string, body: any): Promise<string[] | null> => {
    if (wiz.busy) return null;
    setWiz((w) => ({ ...w, busy: busyKey, err: "" }));
    try {
      const r: any = await apiPost("/api/v1/cockpit/plan/generate", { session_id: sessionId, pane_id: paneId, ambition: wiz.seed.trim(), mode: "ideate", ...body }, { timeoutMs: 120000 });
      const d = stamp(r?.result ?? r);
      if (d?.ok && Array.isArray(d.ideas) && d.ideas.length) { setWiz((w) => ({ ...w, busy: "" })); return d.ideas; }
      setWiz((w) => ({ ...w, busy: "", err: d?.error ?? "ideate failed" }));
      return null;
    } catch (e: any) { setWiz((w) => ({ ...w, busy: "", err: e?.message ?? "ideate failed" })); return null; }
  };
  const moreIdeas = async (di: number) => {
    const dm = wiz.dims[di];
    const ideas = await ideate(`more:${dm.key}`, { op: "more", dimension: dm.title || dm.key, existing: dm.ideas.map((i) => i.text) });
    if (ideas) setWiz((w) => ({ ...w, dims: w.dims.map((x, i) => (i === di ? { ...x, ideas: [...x.ideas, ...ideas.filter((t2) => !x.ideas.some((e2) => e2.text === t2)).map((t2) => ({ id: wizUid(), text: t2, picked: false }))] } : x)) }));
  };
  const expandIdea = async (di: number, idea: WizIdea) => {
    const dm = wiz.dims[di];
    const micros = await ideate(`expand:${idea.id}`, { op: "expand", dimension: dm.title || dm.key, idea: idea.text, existing: dm.ideas.map((i) => i.text) });
    if (micros) setWiz((w) => ({ ...w, dims: w.dims.map((x, i) => {
      if (i !== di) return x;
      const at = x.ideas.findIndex((e2) => e2.id === idea.id);
      const bundle = micros.map((t2) => ({ id: wizUid(), text: t2, picked: false, bundle: idea.id }));
      return { ...x, ideas: [...x.ideas.slice(0, at + 1), ...bundle, ...x.ideas.slice(at + 1)] };
    }) }));
  };
  const refineIdea = async (di: number, idea: WizIdea, intent: string) => {
    const dm = wiz.dims[di];
    const out = await ideate(`refine:${idea.id}`, { op: "refine", dimension: dm.title || dm.key, idea: idea.text, intent });
    if (out?.[0]) { setWiz((w) => ({ ...w, dims: w.dims.map((x, i) => (i === di ? { ...x, ideas: x.ideas.map((e2) => (e2.id === idea.id ? { ...e2, text: out[0] } : e2)) } : x)) })); setRefining(null); }
  };
  const removeIdea = (di: number, idea: WizIdea) =>
    // removing a parent removes its bound micros with it
    wizSetDim(di, { ideas: wiz.dims[di].ideas.filter((x) => x.id !== idea.id && x.bundle !== idea.id) });
  const forge = async () => {
    if (wiz.busy) return;
    const picks = wizPicked();
    if (!picks.length) { setWiz({ ...wiz, err: "pick at least one idea across the dimensions" }); return; }
    setWiz({ ...wiz, busy: "forge", err: "" });
    try {
      const r: any = await apiPost("/api/v1/cockpit/plan/generate", { session_id: sessionId, pane_id: paneId, ambition: wiz.seed.trim(), mode: "baseplan", picks }, { timeoutMs: 240000 });
      const d = stamp(r?.result ?? r);
      if (d?.ok) {
        await onForged({
          base_plan_md: d.base_plan_md ?? "",
          cards: (d.decisions ?? []).map((x: any) => ({ id: wizUid(), q: x.q, options: (x.options ?? []).map((o: string) => ({ id: wizUid(), label: o })), chosen: null })),
        });
        // STAY OPEN (operator 2026-07-15: "after forging don't close — keep it
        // so I can always re-run"). Mark forged; the operator re-picks + forges.
        setWiz((w) => ({ ...w, busy: "", err: "", forged: w.forged + 1 }));
        // persist the brainstorm chips + forged base plan to the ULTRA PLAN —
        // durable across reloads/restarts, tying the plan's artifacts by id
        void apiPost("/api/v1/cockpit/plan/generate", { session_id: sessionId, mode: "plan-save", brainstorm_json: JSON.stringify({ seed: wiz.seed, dims: wiz.dims }), baseplan_md: d.base_plan_md ?? "" }, { timeoutMs: 20000 }).catch(() => { /* durability best-effort */ });
      } else setWiz((w) => ({ ...w, busy: "", err: d?.error ?? "the forge failed" }));
    } catch (e: any) { setWiz((w) => ({ ...w, busy: "", err: e?.message ?? "the forge failed" })); }
  };
  const inpW: React.CSSProperties = { background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 8px", fontFamily: nav, fontSize: 11, outline: "none" };
  const miniBtn = (color: string): React.CSSProperties => ({ background: "transparent", border: "none", color, cursor: "pointer", fontSize: 9, padding: "0 2px", lineHeight: 1 });
  const chipEl = (di: number, dm: WizDim, idea: WizIdea, ii: number, micro: boolean) => (
    <React.Fragment key={idea.id}>
      {editing?.id === idea.id ? (
        <input autoFocus value={editing.text} onChange={(e) => setEditing({ id: idea.id, text: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") { wizSetDim(di, { ideas: dm.ideas.map((x) => (x.id === idea.id ? { ...x, text: editing.text.trim() || x.text } : x)) }); setEditing(null); } if (e.key === "Escape") setEditing(null); }}
          onBlur={() => { wizSetDim(di, { ideas: dm.ideas.map((x) => (x.id === idea.id ? { ...x, text: editing.text.trim() || x.text } : x)) }); setEditing(null); }}
          style={{ ...inpW, fontSize: 10.5, width: 300 }} />
      ) : (
        <span draggable={!micro} onDragStart={() => setWiz({ ...wiz, drag: { dim: di, idx: ii } })}
          onClick={() => wizSetDim(di, { ideas: dm.ideas.map((x) => (x.id === idea.id ? { ...x, picked: !x.picked } : x)) })}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, background: idea.picked ? `color-mix(in oklab, ${C.ok} 12%, transparent)` : C.bg, border: `1px solid ${idea.picked ? C.ok : C.border}`, color: idea.picked ? C.ok : C.muted, cursor: micro ? "pointer" : "grab", fontFamily: nav, fontSize: micro ? 10 : 10.5, padding: "3px 8px", borderRadius: 8, maxWidth: "100%" }}>
          {idea.picked ? "✓ " : ""}{idea.text}
          <span style={{ display: "inline-flex", gap: 2, marginLeft: 2 }}>
            <button onClick={(e) => { e.stopPropagation(); setEditing({ id: idea.id, text: idea.text }); }} title="edit" style={miniBtn(C.dim)}>✎</button>
            {!micro && <button onClick={(e) => { e.stopPropagation(); void expandIdea(di, idea); }} title="expand — decompose into bound micro-ideas" style={miniBtn(wiz.busy === `expand:${idea.id}` ? C.warn : C.dim)}>{wiz.busy === `expand:${idea.id}` ? "⏳" : "⊞"}</button>}
            <button onClick={(e) => { e.stopPropagation(); setRefining(refining?.id === idea.id ? null : { id: idea.id, intent: "" }); }} title="refine — tell it what to become" style={miniBtn(refining?.id === idea.id ? C.brand : C.dim)}>✦</button>
            <button onClick={(e) => { e.stopPropagation(); removeIdea(di, idea); }} title={micro ? "remove" : "remove (takes its micro-ideas with it)"} style={miniBtn(C.dim)}>✕</button>
          </span>
        </span>
      )}
      {refining?.id === idea.id && (
        <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
          <input autoFocus value={refining.intent} onChange={(e) => setRefining({ id: idea.id, intent: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && refining.intent.trim()) void refineIdea(di, idea, refining.intent.trim()); if (e.key === "Escape") setRefining(null); }}
            placeholder="the intent — e.g. make it bolder / cheaper / user-facing…" style={{ ...inpW, fontSize: 9.5, padding: "3px 8px", width: 240 }} />
          <button onClick={() => refining.intent.trim() && void refineIdea(di, idea, refining.intent.trim())}
            style={{ background: "transparent", border: `1px solid ${wiz.busy === `refine:${idea.id}` ? C.warn : C.brand}`, color: wiz.busy === `refine:${idea.id}` ? C.warn : C.brand, cursor: "pointer", fontFamily: mono, fontSize: 8.5, padding: "2px 8px", borderRadius: 7 }}>{wiz.busy === `refine:${idea.id}` ? "⏳" : "✦ go"}</button>
        </span>
      )}
    </React.Fragment>
  );
  const hadSeed = !!(initialSeed ?? "").trim();
  return (
    // PART OF THE INTENT SCREEN (operator 2026-07-15: "doesn't need a border,
    // it is part of the intent screen") — no box, renders in-flow.
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 700, color: C.fg }}>🧠 brainstorm wizard</span>
        {hadSeed && <span style={{ fontFamily: nav, fontSize: 10, color: C.muted }}>· planning <b style={{ color: C.fg, fontWeight: 600 }}>{wiz.seed.split("\n")[0].slice(0, 70)}</b></span>}
        {wiz.forged > 0 && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.ok }}>✓ forged{wiz.forged > 1 ? ` ×${wiz.forged}` : ""} · pick again & re-forge</span>}
        <span style={{ flex: 1 }} />
        {wiz.dims.length > 0 && <button onClick={() => void brainstorm()} disabled={!!wiz.busy} title="re-brainstorm — merges fresh ideas into the dimensions" style={{ background: "transparent", border: `1px solid ${wiz.busy === "brainstorm" ? C.warn : C.border}`, color: wiz.busy === "brainstorm" ? C.warn : C.muted, cursor: "pointer", fontFamily: mono, fontSize: 8.5, padding: "2px 8px", borderRadius: 999 }}>{wiz.busy === "brainstorm" ? "⏳" : "↻ re-run"}</button>}
        {/* discrete AI-call transparency chip */}
        {lastCall != null && (
          <button onClick={() => setAiCallId(lastCall)} title="open the AI-call window — model · tokens · price · the full envelope"
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 8.5, padding: "2px 8px", borderRadius: 999 }}>⌖ ai call #{lastCall}</button>
        )}
        <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9.5, padding: "2px 10px", borderRadius: 8 }}>✕</button>
      </div>
      {wiz.err && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.bad }}>{wiz.err} · <button onClick={() => void brainstorm()} style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 8.5, padding: 0 }}>↻ retry</button></span>}
      {wiz.busy === "brainstorm" && !wiz.dims.length && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.warn }}>⏳ thinking across the dimensions…</span>}

      {wiz.dims.length > 0 && (<>
        {wiz.dims.map((dm, di) => (
          <div key={dm.key} onDragOver={(e) => e.preventDefault()}
            onDrop={() => { const g = wiz.drag; if (!g || g.dim === di) { setWiz({ ...wiz, drag: null }); return; } const idea = wiz.dims[g.dim].ideas[g.idx]; if (!idea) { setWiz({ ...wiz, drag: null }); return; } const movedIds = new Set([idea.id, ...wiz.dims[g.dim].ideas.filter((x) => x.bundle === idea.id).map((x) => x.id)]); const moved = wiz.dims[g.dim].ideas.filter((x) => movedIds.has(x.id)); const dims = wiz.dims.map((x, i) => i === g.dim ? { ...x, ideas: x.ideas.filter((e2) => !movedIds.has(e2.id)) } : x).map((x, i) => i === di ? { ...x, ideas: [...x.ideas, ...moved] } : x); setWiz({ ...wiz, dims, drag: null }); }}
            style={{ display: "flex", flexDirection: "column", gap: 4, border: `1px dashed ${wiz.drag && wiz.drag.dim !== di ? C.brand : "transparent"}`, borderRadius: 8, padding: "3px 4px" }}>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <input value={dm.title} onChange={(e) => wizSetDim(di, { title: e.target.value })}
                style={{ background: "transparent", border: "none", outline: "none", color: C.brand, fontFamily: mono, fontSize: 8.5, textTransform: "uppercase", letterSpacing: 1, width: 180 }} />
              <button onClick={() => void moreIdeas(di)} disabled={!!wiz.busy} title="5 more ideas for THIS dimension — one small call"
                style={{ background: "transparent", border: `1px solid ${wiz.busy === `more:${dm.key}` ? C.warn : C.border}`, color: wiz.busy === `more:${dm.key}` ? C.warn : C.muted, cursor: "pointer", fontFamily: mono, fontSize: 8, padding: "1px 8px", borderRadius: 7 }}>{wiz.busy === `more:${dm.key}` ? "⏳" : "✦ +5"}</button>
              <button onClick={() => setWiz({ ...wiz, dims: wiz.dims.filter((_, i) => i !== di) })} title="remove this dimension (and its ideas)"
                style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: "0 4px" }}>✕</button>
              <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim }}>drag ideas here to remix · click to pick · ✎ edit · ⊞ expand · ✦ refine</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
              {dm.ideas.filter((i) => !i.bundle).map((idea) => {
                const ii = dm.ideas.findIndex((x) => x.id === idea.id);
                const micros = dm.ideas.filter((x) => x.bundle === idea.id);
                return (
                  <React.Fragment key={idea.id}>
                    {chipEl(di, dm, idea, ii, false)}
                    {micros.length > 0 && (
                      <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 3, alignItems: "center", padding: "3px 6px", borderRadius: 8, border: `1px dashed color-mix(in oklab, ${C.brand} 45%, ${C.border})`, background: `color-mix(in oklab, ${C.brand} 5%, transparent)` }}
                        title={`bound to: ${idea.text}`}>
                        <span style={{ fontFamily: mono, fontSize: 7.5, color: C.brand }}>⛓</span>
                        {micros.map((mi) => chipEl(di, dm, mi, dm.ideas.findIndex((x) => x.id === mi.id), true))}
                      </span>
                    )}
                  </React.Fragment>
                );
              })}
              <input value={wiz.newIdea[dm.key] ?? ""} onChange={(e) => setWiz({ ...wiz, newIdea: { ...wiz.newIdea, [dm.key]: e.target.value } })}
                onKeyDown={(e) => { if (e.key === "Enter" && (wiz.newIdea[dm.key] ?? "").trim()) { wizSetDim(di, { ideas: [...dm.ideas, { id: wizUid(), text: wiz.newIdea[dm.key].trim(), picked: true }] }); setWiz((w) => ({ ...w, newIdea: { ...w.newIdea, [dm.key]: "" } })); } }}
                placeholder="＋ your own idea (enter)" style={{ ...inpW, fontSize: 9.5, padding: "3px 8px", width: 170 }} />
            </div>
          </div>
        ))}
        {/* the forge bar — inline, no separate step (pick chips → forge) */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 7, marginTop: 2 }}>
          <button onClick={() => setWiz({ ...wiz, dims: [...wiz.dims, { key: `own-${wizUid()}`, title: "my dimension", ideas: [] }] })}
            style={{ background: "transparent", border: `1px dashed ${C.border}`, color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 8.5, padding: "2px 10px", borderRadius: 7 }}>＋ dimension</button>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: mono, fontSize: 8.5, color: wizPicked().length ? C.ok : C.dim }}>{wizPicked().length} picked</span>
          <button onClick={() => void forge()} disabled={!!wiz.busy || !wizPicked().length}
            title={wizPicked().length ? "forge the picked ideas into the base plan + decision tree" : "pick ideas first (click the chips)"}
            style={{ background: `linear-gradient(120deg, ${C.brand}, color-mix(in oklab, ${C.brand} 60%, ${C.ok}))`, border: "none", color: C.bg, cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 700, padding: "5px 16px", borderRadius: 8, opacity: wiz.busy || !wizPicked().length ? 0.55 : 1 }}>
            {wiz.busy === "forge" ? "⏳ forging…" : "⚒ forge base plan + tree"}
          </button>
        </div>
      </>)}
    </div>
  );
}

// (the 🌳 Plan/decision pane was eliminated 2026-07-15 — the shape tree owns the decisions; the brainstorm hands its artifact to shape via the session base-plan channel)

// scope selector for the graph/diagram panes (operator 2026-07-13: "graph, diagrams
// panes all that should be scoped — the docs have graphs and diagrams scoped, reuse
// the idea"): folders derived from the atlas, passed as initialDir; the key remount
// re-anchors the view to the chosen scope.
export function atlasDirs(atlas: AtlasResponse | null | undefined): string[] {
  const count = new Map<string, number>();
  for (const n of ((atlas as any)?.nodes ?? []) as any[]) {
    const parts = String(n.path ?? "").split("/");
    if (parts.length > 1) count.set(parts[0], (count.get(parts[0]) ?? 0) + 1);
    if (parts.length > 2) { const d2 = parts.slice(0, 2).join("/"); count.set(d2, (count.get(d2) ?? 0) + 1); }
  }
  return [...count.entries()].filter(([, c]) => c >= 3).sort((a, b) => a[0].localeCompare(b[0])).map(([d]) => d);
}
function ScopeSelect({ atlas, dir, setDir }: { atlas: AtlasResponse | null | undefined; dir: string; setDir: (d: string) => void }) {
  const dirs = React.useMemo(() => atlasDirs(atlas), [atlas]);
  return (
    <select value={dir} onChange={(e) => setDir(e.target.value)} title="scope the view to a folder" style={{ ...inp, fontSize: 9.5, padding: "1px 6px", maxWidth: 170 }}>
      <option value="">whole codebase</option>
      {dirs.map((d) => <option key={d} value={d}>{d}/</option>)}
    </select>
  );
}

// ── GRAPH pane — the atlas import graph (AtlasGraphMini, the code screen's) ──
export function GraphPane({ p }: { p?: Pane } = {}) {
  const [atlas, reload] = useAtlas();
  const [dir, setDir] = React.useState<string>(String(paneSettings(p).dir ?? ""));
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", borderBottom: `1px solid ${C.border}` }}>
        <span style={head}>code graph · {atlas?.node_count ?? "…"} nodes</span>
        <span style={{ flex: 1 }} />
        <ScopeSelect atlas={atlas} dir={dir} setDir={setDir} />
        <button onClick={reload} style={{ ...btn, padding: "0 8px", fontSize: 9.5, color: C.muted }}>↻</button>
      </div>
      {atlas === undefined ? <div style={padded}>loading the atlas…</div>
        : !atlas || !(atlas as any)?.nodes?.length ? <div style={{ ...padded, color: C.warn }}>atlas empty — onboard it on the Code screen first.</div>
        : <div style={{ flex: 1, minHeight: 0 }}><AtlasGraphMini key={dir} atlas={atlas} height={430} controls initialDir={dir || undefined} /></div>}
    </div>
  );
}

// ── DIAGRAM pane — the code structure diagrams (DiagramView, the code screen's) ──
export function DiagramPane({ p }: { p?: Pane } = {}) {
  const [atlas, reload] = useAtlas();
  const [dir, setDir] = React.useState<string>(String(paneSettings(p).dir ?? ""));
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", borderBottom: `1px solid ${C.border}` }}>
        <span style={head}>code diagrams · navigate folders, drill into files</span>
        <span style={{ flex: 1 }} />
        <ScopeSelect atlas={atlas} dir={dir} setDir={setDir} />
        <button onClick={reload} style={{ ...btn, padding: "0 8px", fontSize: 9.5, color: C.muted }}>↻</button>
      </div>
      {atlas === undefined ? <div style={padded}>loading the atlas…</div>
        : !atlas || !(atlas as any)?.nodes?.length ? <div style={{ ...padded, color: C.warn }}>atlas empty — onboard it on the Code screen first.</div>
        : <div style={{ flex: 1, minHeight: 0 }}><DiagramView key={dir} atlas={atlas} height={430} initialDir={dir || undefined} /></div>}
    </div>
  );
}

// ── KANBAN pane — YOUR Trello for the session (operator 2026-07-13: "i didnt
// mean the board of pipeline, i meant an editable kanban for the user like
// trello"). Cards you add, drag between columns, edit, delete — stored as
// pane-scoped blackboard rows (kind 'kanban', body = JSON {col,text}), so they
// live with the session and are never injected into agent prompts.
const KANBAN_COLS: Array<[string, string, string]> = [["todo", "To do", C.dim], ["doing", "Doing", C.brand], ["done", "Done", C.ok]];
export function KanbanPane({ sessionId, paneId }: { sessionId: number; paneId: number }) {
  const [items, setItems] = React.useState<any[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [editId, setEditId] = React.useState<number | null>(null);
  const [editText, setEditText] = React.useState("");
  const dragId = React.useRef<number | null>(null);
  const [overCol, setOverCol] = React.useState<string | null>(null);
  const parse = (b: string) => { try { const j = JSON.parse(b); return { col: String(j.col ?? "todo"), text: String(j.text ?? "") }; } catch { return { col: "todo", text: String(b ?? "") }; } };
  const load = React.useCallback(async () => {
    const d = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: sessionId, pane_id: paneId }, { timeoutMs: 20000 }));
    setItems((d?.scratch ?? []).filter((s: any) => s.kind === "kanban").map((s: any) => ({ id: s.id, ...parse(s.body_md) })));
  }, [sessionId, paneId]);
  React.useEffect(() => { void load(); }, [load]);
  const add = async (col: string) => {
    const text = (drafts[col] ?? "").trim();
    if (!text) return;
    await apiPost("/api/v1/cockpit/blackboard/post", { session_id: sessionId, pane_id: paneId, kind: "kanban", body_md: JSON.stringify({ col, text }) }, { timeoutMs: 20000 });
    setDrafts((d) => ({ ...d, [col]: "" })); load();
  };
  const save = async (id: number, col: string, text: string) => {
    await apiPost("/api/v1/cockpit/blackboard/post", { op: "update", id, body_md: JSON.stringify({ col, text }) }, { timeoutMs: 20000 });
    load();
  };
  const del = async (id: number) => { await apiPost("/api/v1/cockpit/blackboard/post", { op: "delete", id }, { timeoutMs: 20000 }); load(); };
  const drop = async (col: string) => {
    const id = dragId.current; dragId.current = null; setOverCol(null);
    const it = items.find((x) => x.id === id);
    if (it && it.col !== col) await save(it.id, col, it.text);
  };
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6, overflowX: "auto", padding: 7 }}>
      {KANBAN_COLS.map(([col, title, tone]) => {
        const colItems = items.filter((i) => i.col === col);
        return (
          <div key={col} data-testid={`kanban-col-${col}`}
            onDragOver={(e) => { e.preventDefault(); setOverCol(col); }} onDragLeave={() => setOverCol((c) => (c === col ? null : c))} onDrop={() => void drop(col)}
            style={{ flex: 1, minWidth: 128, display: "flex", flexDirection: "column", minHeight: 0, border: `1px ${overCol === col ? "dashed" : "solid"} ${overCol === col ? tone : C.border}`, borderRadius: 8, background: C.panel }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: mono, fontSize: 9.5, color: tone, textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700 }}>{title}</span>
              <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{colItems.length}</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 6, display: "flex", flexDirection: "column", gap: 5 }}>
              {colItems.map((it) => (
                <div key={it.id} data-testid="kanban-card" draggable onDragStart={(e) => { dragId.current = it.id; startBlockDrag(e, { label: String(it.text ?? "card").slice(0, 40), uid: `kanban-${it.id}`, source: `kanban card (${title})`, content: `Kanban card [${title}]: ${it.text ?? ""}` }); }}
                  style={{ border: `1px solid ${C.border}`, borderLeft: `2px solid ${tone}`, borderRadius: 5, padding: "4px 6px", background: C.bg, cursor: "grab" }}>
                  {editId === it.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <textarea value={editText} onChange={(e) => setEditText(e.target.value)} style={{ ...inp, width: "100%", minHeight: 40, resize: "vertical", boxSizing: "border-box", fontSize: 9.5 }} />
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => { void save(it.id, it.col, editText); setEditId(null); }} style={{ ...btn, padding: "0 6px", fontSize: 8.5, color: C.ok, borderColor: C.ok }}>save</button>
                        <button onClick={() => setEditId(null)} style={{ ...btn, padding: "0 6px", fontSize: 8.5, color: C.muted }}>cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{it.text}</div>
                      <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
                        <span style={{ flex: 1 }} />
                        <button onClick={() => { setEditId(it.id); setEditText(it.text); }} style={{ ...btn, padding: "0 5px", fontSize: 8, color: C.muted, borderColor: "transparent" }}>✎</button>
                        <button onClick={() => void del(it.id)} style={{ ...btn, padding: "0 5px", fontSize: 8, color: C.bad, borderColor: "transparent" }}>✕</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, padding: 6, borderTop: `1px solid ${C.border}` }}>
              <input value={drafts[col] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [col]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") void add(col); }}
                placeholder="+ card (Enter)" style={{ ...inp, flex: 1, minWidth: 0, fontSize: 9.5, padding: "3px 6px" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── STANDUP pane — one click, every turn-capable agent reports (side by side) ──
const STANDUP_PROMPT = "STANDUP — reply in 3 short lines, no code:\n1) done: what you completed\n2) now: what you're working on\n3) blocked: what's in the way (or 'nothing')";
// A CLI agent (claude / codex / opencode) has no turn endpoint: the question is typed into its
// terminal and its next answer (captured by the antiloki Stop hook into answers.jsonl) is the report.
const STANDUP_CLI_TIMEOUT_MS = 120_000;
export async function standupFromCli(paneId: number, question: string, timeoutMs = STANDUP_CLI_TIMEOUT_MS): Promise<{ reply: string | null; error?: string }> {
  const before = await fetchAnswers(paneId, 1);
  const lastT = before[0]?.t ?? null;
  const lastText = before[0]?.text ?? null;
  const ok = await sayToAgent(paneId, question);
  if (!ok) return { reply: null, error: "could not type into the agent's terminal (is it running?)" };
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 3000));
    const now = await fetchAnswers(paneId, 1);
    const a = now[0];
    if (a && (a.t !== lastT || a.text !== lastText) && String(a.text ?? "").trim()) return { reply: String(a.text) };
  }
  return { reply: null, error: "no answer within 2 minutes — the agent may be busy or waiting on a permission" };
}
export function StandupPane({ p, panes }: { p?: Pane; panes: Pane[] }) {
  const question = String(paneSettings(p).prompt ?? "").trim() || STANDUP_PROMPT;
  const turnable = panes.filter((x: any) => x.chat_session_id || (CLI_KINDS.has(String(x.pane_kind ?? "")) && !x.synthetic && x.worktree_path));
  const [rounds, setRounds] = React.useState<Array<{ at: string; replies: Array<{ pane: any; reply: string | null; error?: string }> }>>([]);
  const [running, setRunning] = React.useState(false);
  const run = async () => {
    if (!turnable.length || running) return;
    setRunning(true);
    const at = new Date().toLocaleTimeString();
    const replies = await Promise.all(turnable.map(async (p: any) => {
      if (!p.chat_session_id) { const r = await standupFromCli(p.id, question); return { pane: p, ...r }; }
      try {
        const d = unwrap(await apiPost("/api/v1/cockpit/pane/message", { pane_id: p.id, user_input: question }, { timeoutMs: 120000 }));
        return { pane: p, reply: d?.reply_md ?? null, error: d?.reply_md ? undefined : (d?.error ?? "no reply") };
      } catch (e: any) { return { pane: p, reply: null, error: e?.message ?? String(e) }; }
    }));
    setRounds((r) => [{ at, replies }, ...r].slice(0, 10));
    setRunning(false);
  };
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: `1px solid ${C.border}` }}>
        <span style={head}>standup · {turnable.length} agent{turnable.length === 1 ? "" : "s"} report</span>
        <span style={{ flex: 1 }} />
        <button onClick={run} disabled={running || !turnable.length} data-testid="run-standup"
          style={{ ...btn, color: running ? C.muted : C.ok, borderColor: running ? C.border : C.ok }}>{running ? "⏳ collecting…" : "📣 run standup"}</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 10 }}>
        {!turnable.length && <span style={padded}>no agent pane in this session yet — add claude / codex / opencode from the Agents category (a code agent must have its box provisioned to report).</span>}
        {turnable.length > 0 && rounds.length === 0 && !running && <span style={padded}>📣 asks every agent "done / now / blocked" and lines the answers up here. Each round costs one AI turn per agent; a code agent gets the question typed into its terminal and its next answer is the report.</span>}
        {rounds.map((round, ri) => (
          <div key={ri} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel }}>
            <div style={{ padding: "4px 9px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 9, color: C.dim }}>round · {round.at}</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(round.replies.length, 3)}, 1fr)`, gap: 1, background: C.border }}>
              {round.replies.map(({ pane, reply, error }) => (
                <div key={pane.id} style={{ background: C.panel, padding: "6px 9px", minWidth: 0 }}>
                  <div style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, fontWeight: 700, marginBottom: 3 }}>#{pane.idx + 1} {pane.chat_session_id ? pane.subagent_name : String(pane.pane_kind ?? pane.subagent_name)}</div>
                  {reply
                    ? <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 130, overflowY: "auto" }}>{reply}</div>
                    : <div style={{ fontFamily: mono, fontSize: 9.5, color: C.bad }}>✗ {error}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SHELL pane — a real PTY in the workspace root or any sibling worktree ─────
/** THE NAME THE OPERATOR KNOWS (operator 2026-09-20: "the terminal's dropdown shows worktrees but I can't
 * say which agent they belong to"): the recipe's icon + name when the pane was born from one, else the
 * thread that holds it on the stage — then the engine. Never the pane key or the branch. Pure. */
export function worktreeLabel(x: any, stage: any): string {
  const st = x?.settings ?? (() => { try { return JSON.parse(x?.settings_json ?? "{}"); } catch { return {}; } })();
  const d = paneDisplay(String(x?.pane_kind ?? ""));
  const recipe = st?.recipe;
  const place = placeOf(stage, String(x?.subagent_name ?? ""));
  const who = recipe?.name ? `${recipe.icon ? `${recipe.icon} ` : ""}${recipe.name}` : place ? place.threadName : null;
  const idx = x?._session ? String(x._session).replace(/^antichat#/, "chat ") : `#${Number(x?.idx ?? 0) + 1}`;
  return who ? `${who} · ${d.name}${place && recipe?.name ? ` · ${place.threadName}` : ""}` : `${d.name} · ${idx}`;
}
export function ShellPane({ p, panes }: { p: Pane; panes: Pane[] }) {
  const { data: wsForLabels } = useWorkspaces();
  const stage = readStage(wsForLabels?.active?.name ?? null);
  // EVERY WORKTREE (operator 2026-09-18: "the terminal widget should be able to choose the worktree to
  // work on"): a Threads terminal lives in its own cockpit session, so the sibling list is empty — the
  // agents' worktrees sit in other sessions. Merge every open session's worktree panes in.
  const [others, setOthers] = React.useState<any[]>([]);
  React.useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const list = unwrap(await apiPost(`/api/v1/cockpit/session/get`, {}, { timeoutMs: 15_000 }));
        const sessions = (Array.isArray(list?.sessions) ? list.sessions : []).filter((s: any) => s?.status !== "closed" && s.id !== p.session_id);
        const found: any[] = [];
        for (const s of sessions) { try { const got = unwrap(await apiPost(`/api/v1/cockpit/session/get`, { id: s.id }, { timeoutMs: 15_000 })); for (const x of (Array.isArray(got?.panes) ? got.panes : [])) if (x?.worktree_path) found.push({ ...x, _session: s.name }); } catch { /* skip */ } }
        if (!stop) setOthers(found);
      } catch { /* BE away */ }
    };
    void tick(); const t = setInterval(tick, 20_000); return () => { stop = true; clearInterval(t); };
  }, [p.session_id]);
  const wtPanes = [...panes.filter((x: any) => x.worktree_path && x.id !== p.id), ...others.filter((o) => !panes.some((x) => x.id === o.id))];
  const [target, setTarget] = React.useState<number>(Number(paneSettings(p).target_pane ?? 0) || 0); // 0 = workspace root
  const [nonce, setNonce] = React.useState(0); // retarget = fresh terminal mount
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 10px", borderBottom: `1px solid ${C.border}` }}>
        <span style={head}>shell in</span>
        <select value={target} onChange={(e) => { setTarget(Number(e.target.value)); setNonce((n) => n + 1); }} style={{ ...inp, flex: 1, fontSize: 10 }}>
          <option value={0}>workspace root</option>
          {wtPanes.map((x: any) => <option key={x.id} value={x.id}>{worktreeLabel(x, stage)}</option>)}
        </select>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        <PtyTerminal key={nonce} paneId={p.id} startBody={target ? { wt_pane_id: target } : {}} height={340}
          label={target ? "shell · pane worktree" : "shell · workspace root"}
          startTitle="a real shell in this target (docker exec into the workspace container when the runtime is docker)" />
      </div>
    </div>
  );
}

// ── REVIEW pane — every pane's diff in ONE seat (per-pane ◨ buttons retired) ──
function PatchView({ patch }: { patch: string }) {
  return (
    <pre style={{ margin: 0, padding: "6px 8px", fontFamily: mono, fontSize: 9.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all", background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, maxHeight: 340, overflowY: "auto" }}>
      {String(patch ?? "").split("\n").map((l, i) => (
        <div key={i} style={{ color: l.startsWith("+") && !l.startsWith("+++") ? C.ok : l.startsWith("-") && !l.startsWith("---") ? C.bad : l.startsWith("@@") ? C.brand : l.startsWith("diff ") ? C.fg : C.muted }}>{l || " "}</div>
      ))}
    </pre>
  );
}
export function ReviewPane({ panes, onChanged }: { panes: Pane[]; onChanged: () => void }) {
  const wtPanes = panes.filter((x: any) => x.worktree_path);
  const [diffs, setDiffs] = React.useState<Record<number, { busy?: boolean; changed?: number; patch?: string; error?: string }>>({});
  const load = async (paneId: number) => {
    setDiffs((m) => ({ ...m, [paneId]: { ...m[paneId], busy: true } }));
    try {
      const d = unwrap(await apiPost("/api/v1/cockpit/pane/diff", { pane_id: paneId, mode: "diff" }, { timeoutMs: 60000 }));
      setDiffs((m) => ({ ...m, [paneId]: d?.ok === false ? { error: d?.error ?? "diff failed" } : { changed: d?.changed ?? 0, patch: d?.patch ?? "" } }));
    } catch (e: any) { setDiffs((m) => ({ ...m, [paneId]: { error: e?.message ?? String(e) } })); }
  };
  const act = async (paneId: number, mode: "commit" | "discard") => {
    if (mode === "discard" && !window.confirm("discard ALL uncommitted changes in this pane's worktree?")) return;
    try { await apiPost("/api/v1/cockpit/pane/diff", { pane_id: paneId, mode }, { timeoutMs: 120000 }); } catch { /* surfaced on reload */ }
    await load(paneId); onChanged();
  };
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
      {!wtPanes.length && <span style={padded}>no worktree panes to review yet.</span>}
      {wtPanes.map((x: any) => {
        const d = diffs[x.id];
        return (
          <div key={x.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 9px", borderBottom: d ? `1px solid ${C.border}` : "none" }}>
              <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 700 }}>#{x.idx + 1}</span>
              <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{x.subagent_name} · {x.branch ?? "worktree"}</span>
              {d?.changed != null && <span style={{ fontFamily: mono, fontSize: 9, color: d.changed ? C.warn : C.dim }}>{d.changed} changed</span>}
              <span style={{ flex: 1 }} />
              <button onClick={() => load(x.id)} data-testid={`review-load-${x.id}`} style={{ ...btn, padding: "1px 8px", fontSize: 9.5, color: C.brand }}>{d?.busy ? "…" : d ? "↻ diff" : "◨ diff"}</button>
              {d?.patch != null && d.changed! > 0 && (<>
                <button onClick={() => act(x.id, "commit")} style={{ ...btn, padding: "1px 8px", fontSize: 9.5, color: C.ok, borderColor: C.ok }}>commit</button>
                <button onClick={() => act(x.id, "discard")} style={{ ...btn, padding: "1px 8px", fontSize: 9.5, color: C.bad }}>discard</button>
              </>)}
            </div>
            {d && !d.busy && (
              <div style={{ padding: 7 }}>
                {d.error ? <span style={{ fontFamily: mono, fontSize: 9.5, color: C.bad }}>{d.error}</span>
                  : !d.patch ? <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>clean — nothing uncommitted.</span>
                  : <PatchView patch={d.patch} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── TODO pane — a checkable session todolist (blackboard kind 'todo') ─────────
export function TodoPane({ sessionId, paneId }: { sessionId: number; paneId: number }) {
  const [items, setItems] = React.useState<any[]>([]);
  const [draft, setDraft] = React.useState("");
  const load = React.useCallback(async () => {
    const d = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: sessionId, pane_id: paneId }, { timeoutMs: 20000 }));
    setItems((d?.scratch ?? []).filter((s: any) => s.kind === "todo"));
  }, [sessionId, paneId]);
  React.useEffect(() => { void load(); }, [load]);
  const add = async () => {
    if (!draft.trim()) return;
    await apiPost("/api/v1/cockpit/blackboard/post", { session_id: sessionId, pane_id: paneId, kind: "todo", body_md: "[ ] " + draft.trim() }, { timeoutMs: 20000 });
    setDraft(""); load();
  };
  const toggle = async (it: any) => {
    const done = String(it.body_md).startsWith("[x]");
    const body = (done ? "[ ]" : "[x]") + String(it.body_md).slice(3);
    await apiPost("/api/v1/cockpit/blackboard/post", { op: "update", id: it.id, body_md: body }, { timeoutMs: 20000 });
    load();
  };
  const del = async (id: number) => { await apiPost("/api/v1/cockpit/blackboard/post", { op: "delete", id }, { timeoutMs: 20000 }); load(); };
  const open = items.filter((i) => !String(i.body_md).startsWith("[x]"));
  const done = items.filter((i) => String(i.body_md).startsWith("[x]"));
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderBottom: `1px solid ${C.border}` }}>
        <span style={head}>todo · {open.length} open{done.length ? ` · ${done.length} done` : ""}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        {!items.length && <span style={padded}>your session checklist — add below, click to check off.</span>}
        {[...open, ...done].map((it) => {
          const isDone = String(it.body_md).startsWith("[x]");
          return (
            <div key={it.id} data-testid="todo-item" draggable onDragStart={(e) => startBlockDrag(e, { label: String(it.body_md).slice(4, 44), uid: `todo-${it.id}`, source: "session todo list", content: `Todo item (${isDone ? "done" : "open"}): ${String(it.body_md).slice(4)}` })}
              style={{ display: "flex", alignItems: "flex-start", gap: 7, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 7px", background: C.bg, opacity: isDone ? 0.55 : 1, cursor: "grab" }}>
              <button onClick={() => toggle(it)} title={isDone ? "reopen" : "check off"}
                style={{ background: "transparent", border: `1px solid ${isDone ? C.ok : C.border}`, color: isDone ? C.ok : C.muted, borderRadius: 4, width: 16, height: 16, cursor: "pointer", fontSize: 10, lineHeight: 1, padding: 0, flexShrink: 0, marginTop: 1 }}>{isDone ? "✓" : ""}</button>
              <span style={{ fontFamily: mono, fontSize: 10, color: isDone ? C.dim : C.fg, textDecoration: isDone ? "line-through" : "none", flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{String(it.body_md).slice(4)}</span>
              <button onClick={() => del(it.id)} style={{ ...btn, padding: "0 5px", fontSize: 8.5, color: C.bad, borderColor: "transparent" }}>✕</button>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, padding: 8, borderTop: `1px solid ${C.border}` }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder="add a todo… (Enter)" style={{ ...inp, flex: 1 }} />
        <button onClick={add} disabled={!draft.trim()} style={{ ...btn, color: draft.trim() ? C.ok : C.muted, borderColor: draft.trim() ? C.ok : C.border }}>+ add</button>
      </div>
    </div>
  );
}

// ── RACE pane — the same brief to N agents; referee lanes; crown the winner ───
export function RacePane({ p, panes, onChanged }: { p: Pane; panes: Pane[]; onChanged: () => void }) {
  const racersAvail = panes.filter((x: any) => x.chat_session_id && x.id !== p.id);
  // in a BAKE-OFF collection the formation's lanes come pre-selected
  const [picked, setPicked] = React.useState<Set<number>>(() => {
    const col = collectionOf(p);
    return col ? new Set(panes.filter((x: any) => x.id !== p.id && collectionOf(x) === col && x.pane_kind === "agent").map((x: any) => x.id)) : new Set();
  });
  const [brief, setBrief] = React.useState("");
  const [phase, setPhase] = React.useState<"setup" | "running" | "done">("setup");
  const [tick, setTick] = React.useState(0); // seconds since race start — the 1s interval drives value AND re-render
  const [results, setResults] = React.useState<Record<number, { reply?: string; error?: string; ms?: number }>>({});
  const [lanes, setLanes] = React.useState<Record<number, any>>({});
  const sid = p.session_id;
  React.useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  React.useEffect(() => { // live diffstat lanes while racing (git-graph poll)
    if (phase !== "running") return;
    let stop = false;
    const poll = async () => {
      try {
        const d = unwrap(await apiPost("/api/v1/cockpit/git-graph", { op: "graph", session_id: sid }, { timeoutMs: 20000 }));
        if (!stop && d?.lanes) setLanes(Object.fromEntries(d.lanes.map((l: any) => [l.pane_id, l])));
      } catch { /* */ }
    };
    poll(); const t = setInterval(poll, 4000);
    return () => { stop = true; clearInterval(t); };
  }, [phase, sid]);
  const start = async () => {
    const racers = racersAvail.filter((x: any) => picked.has(x.id));
    if (racers.length < 2 || !brief.trim()) return;
    setPhase("running"); setTick(0); setResults({});
    const prompt = `RACE — you are racing ${racers.length - 1} other agent(s) on the SAME task, each in your own worktree. Work autonomously and reply with a 3-line summary of what you built when done.\n\nTASK:\n${brief.trim()}`;
    await Promise.all(racers.map(async (x: any) => {
      const started = Date.now();
      try {
        const d = unwrap(await apiPost("/api/v1/cockpit/pane/message", { pane_id: x.id, user_input: prompt }, { timeoutMs: 600000 }));
        setResults((r) => ({ ...r, [x.id]: { reply: d?.reply_md ?? "(no reply)", ms: Date.now() - started } }));
      } catch (e: any) { setResults((r) => ({ ...r, [x.id]: { error: e?.message ?? String(e), ms: Date.now() - started } })); }
    }));
    setPhase("done");
  };
  const crown = async (winnerId: number) => {
    const losers = [...picked].filter((id) => id !== winnerId);
    const winner = racersAvail.find((x: any) => x.id === winnerId);
    if (!window.confirm(`crown #${winner ? winner.idx + 1 : "?"}? Its worktree MERGES to base; ${losers.length} other racer worktree(s) are DISCARDED.`)) return;
    await apiPost("/api/v1/cockpit/pane/remove", { pane_id: winnerId, mode: "merge" }, { timeoutMs: 120000 });
    for (const id of losers) await apiPost("/api/v1/cockpit/pane/remove", { pane_id: id, mode: "discard" }, { timeoutMs: 120000 });
    onChanged();
  };
  const racers = racersAvail.filter((x: any) => picked.has(x.id));
  const elapsed = phase === "running" ? tick : 0;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: `1px solid ${C.border}` }}>
        <span style={head}>race · same task, {picked.size || "N"} agents, one winner</span>
        <span style={{ flex: 1 }} />
        {phase === "running" && <span style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>⏱ {elapsed}s</span>}
        {phase !== "setup" && <button onClick={() => { setPhase("setup"); setResults({}); }} style={{ ...btn, padding: "1px 8px", fontSize: 9.5, color: C.muted }}>new race</button>}
      </div>
      {phase === "setup" && (
        <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
          {racersAvail.length < 2 && <span style={padded}>needs ≥2 turn-capable agent panes in this session (add agents first).</span>}
          {racersAvail.length >= 2 && (<>
            <div style={head}>pick the racers (≥2)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {racersAvail.map((x: any) => {
                const on = picked.has(x.id);
                return (
                  <button key={x.id} data-testid={`racer-${x.id}`} onClick={() => setPicked((s) => { const n = new Set(s); n.has(x.id) ? n.delete(x.id) : n.add(x.id); return n; })}
                    style={{ fontFamily: mono, fontSize: 10, padding: "3px 9px", borderRadius: 12, cursor: "pointer", border: `1px solid ${on ? C.brand : C.border}`, background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", color: on ? C.brand : C.muted }}>
                    {on ? "✓ " : ""}#{x.idx + 1} {x.subagent_name}{x.auto_apply ? " ⚡" : ""}
                  </button>
                );
              })}
            </div>
            <div style={head}>the task (every racer gets the same brief)</div>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. build the login form at src/ui/Login.tsx — validation, error states, tests" style={{ ...inp, width: "100%", minHeight: 64, resize: "vertical", boxSizing: "border-box" }} />
            <div style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>⚡ auto-apply racers write real files (diffs race live); plan-mode racers reply with proposals.</div>
            <button onClick={start} disabled={picked.size < 2 || !brief.trim()} style={{ ...btn, alignSelf: "flex-start", color: picked.size >= 2 && brief.trim() ? C.ok : C.muted, borderColor: picked.size >= 2 && brief.trim() ? C.ok : C.border }}>🏁 start race</button>
          </>)}
        </div>
      )}
      {phase !== "setup" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {racers.map((x: any) => {
            const res = results[x.id]; const lane = lanes[x.id];
            return (
              <div key={x.id} style={{ border: `1px solid ${res?.reply ? C.ok : res?.error ? C.bad : C.border}`, borderRadius: 8, background: C.panel }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 9px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 700 }}>#{x.idx + 1} {x.subagent_name}</span>
                  {lane && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>{lane.dirty_files ?? 0} dirty · {lane.dirty_stat || lane.diffstat || ""}</span>}
                  <span style={{ flex: 1 }} />
                  {res?.ms != null && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{Math.round(res.ms / 1000)}s</span>}
                  {!res && phase === "running" && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.warn }}>● racing…</span>}
                  {phase === "done" && x.worktree_path && <button onClick={() => crown(x.id)} style={{ ...btn, padding: "1px 9px", fontSize: 9.5, color: C.warn, borderColor: C.warn }}>👑 crown</button>}
                </div>
                {res && (
                  <div style={{ padding: "6px 9px", fontFamily: mono, fontSize: 9.5, color: res.error ? C.bad : C.muted, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 150, overflowY: "auto" }}>
                    {res.error ? `✗ ${res.error}` : res.reply}
                  </div>
                )}
              </div>
            );
          })}
          {phase === "done" && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, padding: "0 2px" }}>👑 crown = merge that racer's worktree to base and discard the others (confirmed first). Review diffs in the Review pane before crowning.</div>}
        </div>
      )}
    </div>
  );
}

// ── DESIGN CANVAS pane (operator 2026-07-14: "a canvas of the real design
// running… instead of click-functional be like a layout, where we can select
// components, or draw in areas") — the dev server in an iframe with a DRAW
// overlay: mark areas, write intent on each, send the annotated strategy to the
// shared context (agents READ it — it embeds like any context doc). The design
// screen's palette truth rides along as swatches. Cross-origin iframes hide
// their DOM, so selection is area-based (honest v1), not element-based.
type DesignRect = { x: number; y: number; w: number; h: number; note: string };
export function DesignPane({ p, panes, sessionId }: { p: Pane; panes: Pane[]; sessionId: number }) {
  const wtPanes = panes.filter((x: any) => x.worktree_path && x.id !== p.id);
  const [target, setTarget] = React.useState<number>(Number(paneSettings(p).target_pane ?? 0) || 0);
  const [st, setSt] = React.useState<any>({ running: false, url: null, log: "" });
  const [booting, setBooting] = React.useState(false);
  const [mode, setMode] = React.useState<"interact" | "draw">("interact");
  const [rects, setRects] = React.useState<DesignRect[]>([]);
  const [sel, setSel] = React.useState<number | null>(null);
  const [palette, setPalette] = React.useState<any[] | null>(null);
  const [sent, setSent] = React.useState(false);
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const drawRef = React.useRef<{ x: number; y: number } | null>(null);
  const [ghost, setGhost] = React.useState<DesignRect | null>(null);
  const key = target ? `pane:${target}` : "root";

  const poll = React.useCallback(async () => {
    try { const r: any = await apiGet(`/api/v1/pr/preview/status?ref_slug=${encodeURIComponent(key)}`); const d = r?.result ?? r; setSt(d ?? { running: false, url: null, log: "" }); if (d?.exited != null) setBooting(false); return d; } catch { return null; }
  }, [key]);
  React.useEffect(() => { poll().then((d: any) => { if (d?.running || d?.url) setBooting(true); }); }, [poll]);
  React.useEffect(() => {
    if (!booting || st?.url) return;
    const t = setInterval(poll, 1500); return () => clearInterval(t);
  }, [booting, st?.url, poll]);
  React.useEffect(() => { // the design screen's palette truth (already-allowlisted read)
    (async () => {
      try { const d = unwrap(await apiPost("/api/v1/codebase/design/get", {}, { timeoutMs: 30000 })); setPalette(d?.palette?.color?.declared ?? []); } catch { setPalette([]); }
    })();
  }, []);
  const boot = async () => {
    setBooting(true); setSt({ running: true, url: null, log: "starting…" });
    try {
      const body = target ? { pane_id: target } : { target: "root" };
      const r: any = await apiPost("/api/v1/pr/preview/start", body, { timeoutMs: 30000 });
      const d = r?.result ?? r;
      if (!d?.ok) { setSt({ running: false, url: null, log: d?.error ?? "could not boot", exited: -1 }); setBooting(false); return; }
      poll();
    } catch (e: any) { setSt({ running: false, url: null, log: e?.message ?? String(e), exited: -1 }); setBooting(false); }
  };
  const stop = async () => { try { await apiPost("/api/v1/pr/preview/stop", { ref_slug: key }, { timeoutMs: 15000 }); } catch { /* */ } setBooting(false); setSt({ running: false, url: null, log: "" }); };

  const pct = (e: React.MouseEvent) => {
    const el = canvasRef.current; if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)), y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)) };
  };
  const downDraw = (e: React.MouseEvent) => { if (e.button !== 0) return; const pt = pct(e); if (pt) { drawRef.current = pt; setGhost({ ...pt, w: 0, h: 0, note: "" }); } };
  const moveDraw = (e: React.MouseEvent) => {
    const s = drawRef.current; if (!s) return; const pt = pct(e); if (!pt) return;
    setGhost({ x: Math.min(s.x, pt.x), y: Math.min(s.y, pt.y), w: Math.abs(pt.x - s.x), h: Math.abs(pt.y - s.y), note: "" });
  };
  const upDraw = () => {
    const g = ghost; drawRef.current = null; setGhost(null);
    if (g && g.w > 1.5 && g.h > 1.5) { setRects((r) => [...r, g]); setSel(rects.length); setSent(false); }
  };
  const sendToContext = async () => {
    if (!rects.length || !st?.url) return;
    const lines = rects.map((r, i) => `${i + 1}. [area ${r.x.toFixed(0)}%,${r.y.toFixed(0)}% → ${r.w.toFixed(0)}×${r.h.toFixed(0)}%] ${r.note.trim() || "(no note)"}`);
    const body = `DESIGN STRATEGY — canvas annotations on the running app (${st.url}):\n${lines.join("\n")}\n(coordinates are % of the viewport, top-left origin)`;
    await apiPost("/api/v1/cockpit/blackboard/post", { session_id: sessionId, kind: "context", body_md: body }, { timeoutMs: 20000 });
    setSent(true);
  };
  const col = collectionOf(p);
  const muse = col ? panes.find((x: any) => collectionOf(x) === col && x.pane_kind === "agent" && x.chat_session_id) : null;
  const sendToMuse = async () => {
    if (!muse || !rects.length) return;
    const lines = rects.map((r, i) => `${i + 1}. [area ${r.x.toFixed(0)}%,${r.y.toFixed(0)}% → ${r.w.toFixed(0)}×${r.h.toFixed(0)}%] ${r.note.trim() || "(no note)"}`);
    await apiPost("/api/v1/cockpit/pane/message", { pane_id: muse.id, user_input: `DESIGN STRATEGY — implement these canvas annotations on the running app (${st?.url ?? "the app"}):\n${lines.join("\n")}\n(coordinates are % of the viewport, top-left origin). Respect the design system's tokens.` }, { timeoutMs: 600000 });
    setSent(true);
  };
  // ENTER SENDS THE PROMPT (operator 2026-09-28: "the studio design canvas — on enter in the input it is not sending the
  // prompt"): the note box only ever wrote into state and waited for a button. Enter now sends what is drawn — straight to
  // the collection's agent when there is one, into the session's context otherwise; Shift+Enter is still a new line.
  const sendNow = () => { if (muse) void sendToMuse(); else void sendToContext(); };
  const url = st?.url;
  const exited = st?.exited != null && !url;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 10px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <select value={target} onChange={(e) => setTarget(Number(e.target.value))} disabled={booting || !!url} style={{ ...inp, minWidth: 110, fontSize: 10 }} title="where the app runs">
          <option value={0}>workspace root</option>
          {wtPanes.map((x: any) => <option key={x.id} value={x.id}>#{x.idx + 1} {x.subagent_name}</option>)}
        </select>
        {!booting && !url && <button onClick={boot} style={{ ...btn, padding: "1px 9px", fontSize: 10, color: C.ok, borderColor: C.ok }}>▶ run design</button>}
        {exited && <button onClick={boot} style={{ ...btn, padding: "1px 9px", fontSize: 10, color: C.brand }}>▶ retry</button>}
        {url && (<>
          <button data-testid="design-mode" onClick={() => setMode((m) => (m === "draw" ? "interact" : "draw"))}
            style={{ ...btn, padding: "1px 9px", fontSize: 10, color: mode === "draw" ? C.warn : C.muted, borderColor: mode === "draw" ? C.warn : C.border }}
            title={mode === "draw" ? "draw mode — drag marks areas; click 🖱 to use the app" : "interact mode — the app is live; click ⬚ to draw areas"}>
            {mode === "draw" ? "⬚ drawing" : "🖱 interact"}
          </button>
          {rects.length > 0 && <button onClick={() => { setRects([]); setSel(null); }} style={{ ...btn, padding: "1px 8px", fontSize: 9.5, color: C.muted }}>clear</button>}
          {rects.length > 0 && <button data-testid="design-send" onClick={sendToContext} style={{ ...btn, padding: "1px 9px", fontSize: 10, color: sent ? C.ok : C.brand, borderColor: sent ? C.ok : C.brand }}>{sent ? "✓ in context" : `→ context (${rects.length})`}</button>}
        {rects.length > 0 && muse && <button data-testid="design-send-muse" onClick={() => void sendToMuse()} title={`send the annotations straight to #${muse.idx + 1} ${muse.subagent_name} (one AI turn)`} style={{ ...btn, padding: "1px 9px", fontSize: 10, color: C.warn, borderColor: C.warn }}>→ {muse.subagent_name}</button>}
        </>)}
        {(booting || url) && <button onClick={stop} style={{ ...btn, padding: "1px 8px", fontSize: 10, color: C.bad, borderColor: C.bad }}>■</button>}
      </div>
      {/* palette truth from the Design screen — the tokens agents should reuse */}
      {palette !== null && palette.length > 0 && (
        <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "3px 10px", borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
          <span style={{ ...head, flexShrink: 0 }}>palette</span>
          {palette.slice(0, 14).map((t: any) => (
            <span key={t.token} title={`${t.token} = ${t.value}`} style={{ width: 14, height: 14, borderRadius: 4, background: t.value, border: `1px solid ${C.border}`, flexShrink: 0 }} />
          ))}
          <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, flexShrink: 0 }}>{palette.length} tokens — the design system's truth</span>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div ref={canvasRef} style={{ flex: 1, minWidth: 0, position: "relative", background: "#fff" }}>
          {url
            ? <iframe src={url} title={`design canvas ${p.id}`} style={{ width: "100%", height: "100%", border: "none", display: "block" }} />
            : (booting || exited)
              ? <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0b0f16" }}>
                  <pre style={{ margin: 0, padding: "8px 10px", flex: 1, minHeight: 0, overflow: "auto", background: "#0b0f16", fontFamily: mono, fontSize: 9.5, lineHeight: 1.5, color: exited ? "#f0b6b6" : "#c9d4e3", whiteSpace: "pre-wrap", wordBreak: "break-word", boxSizing: "border-box" }}>{st?.log || "booting…"}</pre>
                  {exited && needsDevScript(st?.log) && <DevScriptFix onSaved={() => void boot()} />}
                </div>
              : <div style={{ ...padded, background: C.bg, height: "100%", boxSizing: "border-box" }}>▶ run the design — the real app becomes your canvas: interact, or flip to ⬚ draw and mark areas with intent.</div>}
          {/* the DRAW overlay: swallows pointer events so the app becomes a layout */}
          {url && mode === "draw" && (
            <div data-testid="design-overlay" onMouseDown={downDraw} onMouseMove={moveDraw} onMouseUp={upDraw} onMouseLeave={upDraw}
              style={{ position: "absolute", inset: 0, cursor: "crosshair", background: "color-mix(in oklab, #000 12%, transparent)" }}>
              {[...rects, ...(ghost ? [ghost] : [])].map((r, i) => (
                <div key={i} onMouseDown={(e) => { if (i < rects.length) { e.stopPropagation(); setSel(i); } }}
                  style={{ position: "absolute", left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, border: `2px ${i === rects.length ? "dotted" : "solid"} ${sel === i ? C.warn : C.brand}`, background: "color-mix(in oklab, #fff 8%, transparent)", cursor: "pointer" }}>
                  {i < rects.length && <span style={{ position: "absolute", top: -9, left: -9, width: 18, height: 18, borderRadius: "50%", background: sel === i ? C.warn : C.brand, color: C.bg, fontFamily: mono, fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center" }}>{i + 1}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* the strategy rail: one note per drawn area */}
        {url && rects.length > 0 && (
          <div style={{ width: 190, flexShrink: 0, borderLeft: `1px solid ${C.border}`, overflowY: "auto", padding: 7, display: "flex", flexDirection: "column", gap: 6, background: C.panel }}>
            <span style={head}>areas · write the intent</span>
            {rects.map((r, i) => (
              <div key={i} style={{ border: `1px solid ${sel === i ? C.warn : C.border}`, borderRadius: 6, padding: 6, background: C.bg }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                  <span style={{ fontFamily: mono, fontSize: 9.5, color: C.brand, fontWeight: 700 }}>#{i + 1}</span>
                  <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{r.x.toFixed(0)}%,{r.y.toFixed(0)}% · {r.w.toFixed(0)}×{r.h.toFixed(0)}%</span>
                  <span style={{ flex: 1 }} />
                  <button onClick={() => { setRects((rs) => rs.filter((_, j) => j !== i)); setSel(null); setSent(false); }} style={{ ...btn, padding: "0 5px", fontSize: 8, color: C.bad, borderColor: "transparent" }}>✕</button>
                </div>
                <textarea value={r.note} onFocus={() => setSel(i)} onChange={(e) => { setRects((rs) => rs.map((x, j) => (j === i ? { ...x, note: e.target.value } : x))); setSent(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendNow(); } }}
                  placeholder="what should change here… (Enter sends · Shift+Enter for a new line)" style={{ ...inp, width: "100%", minHeight: 40, resize: "vertical", boxSizing: "border-box", fontSize: 9.5 }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── SESSION TIMELINE pane — this session's audit: skills · AI calls · chain ───
export function SessionTimelinePane({ sessionId, p }: { sessionId: number; p?: Pane }) {
  const [data, setData] = React.useState<any | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"all" | "skills" | "ai" | "audit">(String(paneSettings(p).tab ?? "all") as any);
  // 📰 the NARRATOR flip (operator: one low AI call, click-only — never automatic)
  const [story, setStory] = React.useState<string | null>(null);
  const [narrating, setNarrating] = React.useState(false);
  const narrate = async () => {
    if (narrating) return;
    setNarrating(true);
    try {
      const d = unwrap(await apiPost("/api/v1/cockpit/session/narrate", { session_id: sessionId }, { timeoutMs: 120000 }));
      setStory(d?.ok === false ? "(" + (d?.error ?? "narrator failed") + ")" : String(d?.story_md ?? ""));
    } catch (e: any) { setStory("(" + (e?.message ?? "narrator unreachable — restart the BE") + ")"); }
    setNarrating(false);
  };
  const load = React.useCallback(async () => {
    try {
      const d = unwrap(await apiPost("/api/v1/cockpit/session/audit", { session_id: sessionId }, { timeoutMs: 30000 }));
      if (d?.ok === false) setErr(d?.error ?? "audit read failed"); else { setData(d); setErr(null); }
    } catch (e: any) { setErr(e?.message ?? String(e)); }
  }, [sessionId]);
  React.useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);
  const rows = React.useMemo(() => {
    if (!data) return [];
    const out: Array<{ ts: string; type: "skill" | "ai" | "audit"; text: string; tone: string }> = [];
    if (tab === "all" || tab === "skills") for (const r of data.runtime ?? []) out.push({ ts: r.ts, type: "skill", text: `${r.action ?? ""}${r.skill ? ` › ${r.skill}` : ""} → ${r.outcome ?? ""}${r.error_code ? ` [${r.error_code}]` : ""}`, tone: r.outcome === "ok" ? C.ok : r.error_code ? C.bad : C.muted });
    if (tab === "all" || tab === "ai") for (const a of data.ai_calls ?? []) out.push({ ts: a.ts, type: "ai", text: `${a.model_id ?? a.provider ?? "ai"} · ${a.tokens_in ?? 0}→${a.tokens_out ?? 0} tok · $${Number(a.cost_usd_actual ?? 0).toFixed(4)}${a.subagent ? ` · ${a.subagent}` : ""} · ${a.outcome ?? ""}`, tone: a.outcome === "ok" ? C.brand : C.warn });
    if (tab === "all" || tab === "audit") for (const t of data.timeline ?? []) out.push({ ts: t.ts, type: "audit", text: `${t.operation ?? ""} ${t.entity_type ?? ""}#${t.entity_id ?? ""} by ${t.actor ?? ""}`, tone: C.fg });
    return out.sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, 300);
  }, [data, tab]);
  const glyph = { skill: "⚙", ai: "🤖", audit: "⛓" } as const;
  const tabs: Array<["all" | "skills" | "ai" | "audit", string]> = [["all", "all"], ["skills", `⚙ skills ${data?.totals?.runtime ?? ""}`], ["ai", `🤖 ai ${data?.totals?.ai_calls ?? ""}`], ["audit", `⛓ chain ${data?.totals?.timeline ?? ""}`]];
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...btn, padding: "1px 8px", fontSize: 9, color: tab === k ? C.brand : C.muted, borderColor: tab === k ? C.brand : C.border }}>{label}</button>
        ))}
        <span style={{ flex: 1 }} />
        {data?.totals && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }} title="session AI spend">${Number(data.totals.spend ?? 0).toFixed(3)}</span>}
        <button onClick={narrate} disabled={narrating} title="📰 narrate the session — ONE low-tier AI call (costs money, click-only)" style={{ ...btn, padding: "1px 8px", fontSize: 9.5, color: narrating ? C.warn : C.brand, borderColor: C.border }}>{narrating ? "⏳" : "📰"} narrate</button>
        <button onClick={load} style={{ ...btn, padding: "1px 7px", fontSize: 9.5, color: C.muted }}>↻</button>
      </div>
      {story != null && (
        <div style={{ borderBottom: `1px solid ${C.border}`, background: `color-mix(in oklab, ${C.brand} 6%, transparent)`, padding: "7px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontFamily: mono, fontSize: 8.5, color: C.brand, textTransform: "uppercase", letterSpacing: 0.8 }}>📰 the story so far</span>
            <span style={{ flex: 1 }} />
            <button onClick={() => setStory(null)} style={{ ...btn, padding: "0 6px", fontSize: 8.5, color: C.muted, borderColor: "transparent" }}>✕</button>
          </div>
          <div style={{ fontFamily: mono, fontSize: 10.5, lineHeight: 1.65, color: C.fg, whiteSpace: "pre-wrap" }}>{story}</div>
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {err && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.warn }}>{err} — restart the BE to load the session-audit endpoint.</span>}
        {!err && data && rows.length === 0 && <span style={padded}>nothing recorded for this session yet — it fills as the agents work.</span>}
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 7, alignItems: "baseline", fontFamily: mono, fontSize: 9.5, minWidth: 0 }}>
            <span style={{ color: C.dim, flexShrink: 0, fontSize: 8.5 }}>{String(r.ts ?? "").slice(5, 19)}</span>
            <span style={{ flexShrink: 0 }}>{glyph[r.type]}</span>
            <span style={{ color: r.tone, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.text}>{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DOCS SLICE pane (operator 2026-07-14: "a pane tool for docs, which we can
// select a slice of the generated docs to show") — the SELF-GENERATED docs site
// (code-docs-build): pick any folder/file page, read it as didactic markdown
// beside the agents. The chosen page persists on the pane (settings.page).
function MdInline({ text }: { text: string }) {
  return (<>
    {String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((t, k) =>
      t.startsWith("**") && t.endsWith("**") ? <strong key={k} style={{ color: C.fg }}>{t.slice(2, -2)}</strong>
        : t.startsWith("`") && t.endsWith("`") && t.length > 1 ? <code key={k} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, padding: "0 3px", fontSize: "0.95em" }}>{t.slice(1, -1)}</code>
        : <React.Fragment key={k}>{t}</React.Fragment>)}
  </>);
}
function MiniMd({ text }: { text: string }) {
  // a deliberately tiny renderer for the generated docs' markdown dialect
  const lines = String(text ?? "").split("\n");
  return (
    <div style={{ fontFamily: mono, fontSize: 10.5, lineHeight: 1.6, color: C.muted }}>
      {lines.map((l, i) => {
        const h = /^(#{1,3})\s+(.*)$/.exec(l);
        if (h) return <div key={i} style={{ fontSize: [14, 12.5, 11.5][h[1].length - 1], fontWeight: 700, color: C.fg, margin: h[1].length === 1 ? "10px 0 6px" : "8px 0 4px", borderBottom: h[1].length === 1 ? `1px solid ${C.border}` : "none", paddingBottom: h[1].length === 1 ? 4 : 0 }}><MdInline text={h[2]} /></div>;
        if (/^\s*[-•]\s+/.test(l)) return <div key={i} style={{ paddingLeft: 14 }}>• <MdInline text={l.replace(/^\s*[-•]\s+/, "")} /></div>;
        return <div key={i} style={{ minHeight: l.trim() ? undefined : 6 }}><MdInline text={l} /></div>;
      })}
    </div>
  );
}
export function DocsSlicePane({ p }: { p?: Pane } = {}) {
  const [pages, setPages] = React.useState<Array<{ path: string; type: string }> | null>(null);
  const [page, setPage] = React.useState<string>(String(paneSettings(p).page ?? ""));
  const [md, setMd] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    let stop = false;
    apiPost("/api/v1/codebase/docs/build", {}, { timeoutMs: 60000 }).then((r: any) => {
      const d = unwrap(r);
      if (stop) return;
      const out: Array<{ path: string; type: string }> = [];
      const walk = (node: any) => { if (!node) return; out.push({ path: String(node.path ?? ""), type: String(node.type ?? "") }); (node.children ?? []).forEach(walk); };
      walk(d?.tree);
      setPages(out);
    }).catch((e: any) => { if (!stop) setErr(e?.message ?? String(e)); });
    return () => { stop = true; };
  }, []);
  React.useEffect(() => {
    let stop = false; setMd(null);
    apiPost("/api/v1/codebase/docs/build", { page, format: "md" }, { timeoutMs: 60000 })
      .then((r: any) => { const d = unwrap(r); if (!stop) setMd(String(d?.markdown ?? "")); })
      .catch((e: any) => { if (!stop) setErr(e?.message ?? String(e)); });
    return () => { stop = true; };
  }, [page]);
  const pick = (v: string) => {
    setPage(v);
    if (p?.id) void apiPost("/api/v1/cockpit/pane/update", { pane_id: p.id, settings: { ...paneSettings(p), page: v } }, { timeoutMs: 20000 });
  };
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 10px", borderBottom: `1px solid ${C.border}` }}>
        <span style={head}>docs slice</span>
        <select value={page} onChange={(e) => pick(e.target.value)} style={{ ...inp, flex: 1, fontSize: 10 }} title="which page of the generated docs this pane shows">
          <option value="">/ — codebase overview</option>
          {(pages ?? []).filter((x) => x.path).map((x) => <option key={x.path} value={x.path}>{x.type === "folder" ? "▸ " : ""}{x.path}</option>)}
        </select>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
        {err ? <span style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>{err} — is the atlas onboarded?</span>
          : md === null ? <div style={padded}>building the page…</div>
          : md ? <MiniMd text={md} />
          : <div style={padded}>this page is empty.</div>}
      </div>
    </div>
  );
}

// ── SKETCH pane (operator 2026-07-14: "a pane for drawing excalidraw like, or
// make diagrams") — a thinking canvas: freehand, boxes, ellipses, arrows, text,
// theme colors, undo/clear. The drawing persists as ONE blackboard row per pane
// (kind 'sketch', JSON shapes in viewBox units), so it survives reloads.
type Shape = { t: "path" | "rect" | "ellipse" | "arrow" | "text"; x?: number; y?: number; w?: number; h?: number; pts?: number[][]; text?: string; color: string };
export function SketchPane({ sessionId, paneId }: { sessionId: number; paneId: number }) {
  const [shapes, setShapes] = React.useState<Shape[]>([]);
  const [rowId, setRowId] = React.useState<number | null>(null);
  const [tool, setTool] = React.useState<"pen" | "rect" | "ellipse" | "arrow" | "text">("pen");
  const [color, setColor] = React.useState<string>(C.brand);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const drawing = React.useRef<Shape | null>(null);
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const VW = 1200; const VH = 800;
  React.useEffect(() => {
    (async () => {
      const d = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: sessionId, pane_id: paneId }, { timeoutMs: 20000 }));
      const row = (d?.scratch ?? []).find((s: any) => s.kind === "sketch");
      if (row) { setRowId(row.id); try { const v = JSON.parse(row.body_md); if (Array.isArray(v)) setShapes(v); } catch { /* fresh */ } }
    })();
  }, [sessionId, paneId]);
  const save = React.useCallback(async (next: Shape[]) => {
    const body = JSON.stringify(next).slice(0, 19000);
    if (rowId) await apiPost("/api/v1/cockpit/blackboard/post", { op: "update", id: rowId, body_md: body }, { timeoutMs: 20000 });
    else { const d = unwrap(await apiPost("/api/v1/cockpit/blackboard/post", { session_id: sessionId, pane_id: paneId, kind: "sketch", body_md: body }, { timeoutMs: 20000 })); if (d?.id) setRowId(d.id); }
  }, [rowId, sessionId, paneId]);
  const pt = (e: React.PointerEvent) => {
    const el = svgRef.current; if (!el) return [0, 0];
    const r = el.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * VW, ((e.clientY - r.top) / r.height) * VH].map((v) => Math.round(v));
  };
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const [x, y] = pt(e);
    if (tool === "text") {
      const text = window.prompt("text:");
      if (text?.trim()) { const next = [...shapes, { t: "text", x, y, text: text.trim(), color } as Shape]; setShapes(next); void save(next); }
      return;
    }
    drawing.current = tool === "pen" ? { t: "path", pts: [[x, y]], color } : { t: tool, x, y, w: 0, h: 0, pts: [[x, y]], color };
    force();
  };
  const move = (e: React.PointerEvent) => {
    const d = drawing.current; if (!d) return;
    const [x, y] = pt(e);
    if (d.t === "path") d.pts!.push([x, y]);
    else { const [sx, sy] = d.pts![0]; d.x = Math.min(sx, x); d.y = Math.min(sy, y); d.w = Math.abs(x - sx); d.h = Math.abs(y - sy); if (d.t === "arrow") { d.x = sx; d.y = sy; d.w = x - sx; d.h = y - sy; } }
    force();
  };
  const up = () => {
    const d = drawing.current; drawing.current = null;
    if (!d) return;
    const trivial = d.t === "path" ? (d.pts?.length ?? 0) < 3 : Math.abs(d.w ?? 0) + Math.abs(d.h ?? 0) < 6;
    if (!trivial) { const next = [...shapes, d]; setShapes(next); void save(next); } else force();
  };
  const undo = () => { const next = shapes.slice(0, -1); setShapes(next); void save(next); };
  const clear = () => { if (shapes.length && window.confirm("clear the whole sketch?")) { setShapes([]); void save([]); } };
  const renderShape = (s2: Shape, i: number) => {
    if (s2.t === "path") return <polyline key={i} points={(s2.pts ?? []).map((q) => q.join(",")).join(" ")} fill="none" stroke={s2.color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />;
    if (s2.t === "rect") return <rect key={i} x={s2.x} y={s2.y} width={s2.w} height={s2.h} fill="none" stroke={s2.color} strokeWidth={2.4} rx={8} />;
    if (s2.t === "ellipse") return <ellipse key={i} cx={(s2.x ?? 0) + (s2.w ?? 0) / 2} cy={(s2.y ?? 0) + (s2.h ?? 0) / 2} rx={(s2.w ?? 0) / 2} ry={(s2.h ?? 0) / 2} fill="none" stroke={s2.color} strokeWidth={2.4} />;
    if (s2.t === "arrow") {
      const x1 = s2.x ?? 0; const y1 = s2.y ?? 0; const x2 = x1 + (s2.w ?? 0); const y2 = y1 + (s2.h ?? 0);
      const a = Math.atan2(y2 - y1, x2 - x1); const L = 12;
      return (<g key={i} stroke={s2.color} strokeWidth={2.4} strokeLinecap="round">
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        <line x1={x2} y1={y2} x2={x2 - L * Math.cos(a - 0.5)} y2={y2 - L * Math.sin(a - 0.5)} />
        <line x1={x2} y1={y2} x2={x2 - L * Math.cos(a + 0.5)} y2={y2 - L * Math.sin(a + 0.5)} />
      </g>);
    }
    return <text key={i} x={s2.x} y={s2.y} fill={s2.color} style={{ font: `600 20px ${mono}` }}>{s2.text}</text>;
  };
  const TOOLS: Array<["pen" | "rect" | "ellipse" | "arrow" | "text", string, string]> = [["pen", "✏", "freehand"], ["rect", "▭", "box"], ["ellipse", "◯", "ellipse"], ["arrow", "→", "arrow"], ["text", "T", "text"]];
  const COLORS = [C.brand, C.ok, C.warn, C.bad, C.fg];
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "4px 10px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        {TOOLS.map(([k, glyph, title]) => (
          <button key={k} onClick={() => setTool(k)} title={title} style={{ ...btn, padding: "1px 8px", fontSize: 11, color: tool === k ? C.brand : C.muted, borderColor: tool === k ? C.brand : C.border }}>{glyph}</button>
        ))}
        <span style={{ width: 1, height: 15, background: C.border }} />
        {COLORS.map((c2) => (
          <button key={c2} onClick={() => setColor(c2)} title="color" style={{ width: 15, height: 15, borderRadius: "50%", background: c2, border: color === c2 ? `2px solid ${C.fg}` : `1px solid ${C.border}`, cursor: "pointer", padding: 0 }} />
        ))}
        <span style={{ flex: 1 }} />
        <button onClick={undo} disabled={!shapes.length} style={{ ...btn, padding: "1px 8px", fontSize: 10, color: shapes.length ? C.muted : C.border }}>↶ undo</button>
        <button onClick={clear} disabled={!shapes.length} style={{ ...btn, padding: "1px 8px", fontSize: 10, color: shapes.length ? C.bad : C.border }}>✕ clear</button>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" data-testid="sketch-canvas"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        style={{ flex: 1, minHeight: 0, width: "100%", touchAction: "none", cursor: "crosshair", background: C.bg }}>
        {shapes.map(renderShape)}
        {drawing.current && renderShape(drawing.current, -1)}
      </svg>
    </div>
  );
}

// ── FUEL pane (operator 2026-07-14: "a complete spend planning with real and
// live display of what is costing the session — a full control center") —
// budget (persisted on settings.budget) vs LIVE spend from the session audit:
// burn rate, projection, per-pane bars, per-model breakdown. Read-only + one knob.
export function FuelPane({ p, panes, sessionId }: { p: Pane; panes: Pane[]; sessionId: number }) {
  const [audit, setAudit] = React.useState<any | null>(null);
  const [budget, setBudget] = React.useState<number>(Number(paneSettings(p).budget ?? 0) || 0);
  const load = React.useCallback(async () => {
    try { const d = unwrap(await apiPost("/api/v1/cockpit/session/audit", { session_id: sessionId }, { timeoutMs: 30000 })); if (d?.ok !== false) setAudit(d); } catch { /* pre-restart */ }
  }, [sessionId]);
  React.useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);
  // THE CLI AGENTS (operator 2026-09-16: "fuel is showing but is not wired with claude codex and
  // open code panes"): their spend never reaches the session audit — Claude/Codex/OpenCode run in
  // their own process. Each is asked through the pack's antiloki_usage tool (status line / rollout /
  // opencode.db) and shown as its own row: context %, session tokens, cost, 5h + weekly windows.
  const cliPanes = panes.filter((x) => CLI_KINDS.has(String(x.pane_kind ?? "")) && !(x as any).synthetic);
  const cliKey = cliPanes.map((x) => x.id).join(",");
  const [cliUsage, setCliUsage] = React.useState<Record<number, PackUsage | null>>({});
  React.useEffect(() => {
    if (!cliKey) return;
    let stop = false;
    const tick = async () => {
      const ids = cliKey.split(",").map(Number);
      const got = await Promise.all(ids.map((id) => fetchUsage(id)));
      if (stop) return;
      setCliUsage(Object.fromEntries(ids.map((id, i) => [id, got[i]])));
    };
    void tick();
    const t = setInterval(tick, 15000);
    return () => { stop = true; clearInterval(t); };
  }, [cliKey]);
  const cliCost = (id: number) => Number(cliUsage[id]?.cost_usd ?? cliUsage[id]?.proxy?.cost_usd ?? 0) || 0;
  const saveBudget = (v: number) => {
    setBudget(v);
    if ((p as any).synthetic) return;
    void apiPost("/api/v1/cockpit/pane/update", { pane_id: p.id, settings: { ...paneSettings(p), budget: v } }, { timeoutMs: 20000 });
  };
  const spend = Number(audit?.totals?.spend ?? 0) + cliPanes.reduce((s, x) => s + cliCost(x.id), 0);
  const calls: any[] = audit?.ai_calls ?? [];
  // burn rate: spend inside the last 30 minutes, scaled to $/h
  const now = Date.now();
  const recent = calls.filter((a) => now - new Date(String(a.ts).replace(" ", "T") + "Z").getTime() < 30 * 60000);
  const burnPerH = recent.reduce((s, a) => s + (Number(a.cost_usd_actual) || 0), 0) * 2;
  const left = budget > 0 ? Math.max(0, budget - spend) : null;
  const etaH = left != null && burnPerH > 0.0001 ? left / burnPerH : null;
  const byModel = new Map<string, { cost: number; n: number }>();
  for (const a of calls) { const k = String(a.model_id ?? a.provider ?? "?").split("/").pop() ?? "?"; const cur = byModel.get(k) ?? { cost: 0, n: 0 }; cur.cost += Number(a.cost_usd_actual) || 0; cur.n++; byModel.set(k, cur); }
  const paneCost = (x: Pane) => (x.cost_usd ?? 0) + (cliUsage[x.id] ? cliCost(x.id) : 0);
  const paneCosts = panes.filter((x) => paneCost(x) > 0).sort((a, b) => paneCost(b) - paneCost(a));
  const maxPane = Math.max(0.0001, ...paneCosts.map(paneCost));
  const pct = budget > 0 ? Math.min(100, (spend / budget) * 100) : 0;
  const tone = pct >= 90 ? C.bad : pct >= 65 ? C.warn : C.ok;
  const stat = (label: string, value: string, color: string) => (
    <div key={label} style={{ flex: 1, minWidth: 86, border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 8px", background: C.panel }}>
      <div style={{ fontFamily: mono, fontSize: 12.5, color, fontWeight: 700, lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
    </div>
  );
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 9, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {stat("session spend", "$" + spend.toFixed(3), C.fg)}
        {stat("burn rate", "$" + burnPerH.toFixed(3) + "/h", burnPerH > 0 ? C.warn : C.dim)}
        {stat("ai calls", String(audit?.totals?.ai_calls ?? 0), C.brand)}
        {stat("tokens out", fmtTok(Number(audit?.totals?.tokens_out ?? 0)), C.muted)}
      </div>
      {/* THE PLAN — budget vs reality */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, padding: "7px 9px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={head}>spend plan</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>budget $</span>
          <input type="number" min={0} step={0.5} value={budget || ""} onChange={(e) => saveBudget(Number(e.target.value) || 0)} placeholder="0 = no cap"
            style={{ ...inp, width: 74, fontSize: 10, padding: "2px 6px" }} />
        </div>
        {budget > 0 ? (<>
          <div style={{ height: 10, borderRadius: 6, background: C.bg, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ width: pct + "%", height: "100%", background: tone, transition: "width .4s" }} />
          </div>
          <div style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>
            ${spend.toFixed(3)} of ${budget.toFixed(2)} · <span style={{ color: tone }}>{pct.toFixed(0)}%</span>
            {left != null && <> · ${left.toFixed(3)} left{etaH != null ? ` · ~${etaH > 48 ? ">48" : etaH.toFixed(1)}h at this burn` : ""}</>}
          </div>
        </>) : <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>set a budget to see the plan bar, remaining and the burn-down ETA. Advisory — it never blocks.</span>}
      </div>
      {/* WHO is costing — per-pane bars */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, padding: "7px 9px" }}>
        <div style={{ ...head, marginBottom: 5 }}>what's costing · per pane</div>
        {!paneCosts.length && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>no pane has spent yet.</span>}
        {paneCosts.map((x) => (
          <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
            <span style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, width: 108, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>#{x.idx + 1} {CLI_KINDS.has(String(x.pane_kind ?? "")) ? String(x.pane_kind) : x.subagent_name}</span>
            <div style={{ flex: 1, height: 7, borderRadius: 4, background: C.bg, overflow: "hidden" }}>
              <div style={{ width: (paneCost(x) / maxPane) * 100 + "%", height: "100%", background: C.brand, opacity: 0.85 }} />
            </div>
            <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, width: 52, textAlign: "right" }}>${paneCost(x).toFixed(3)}</span>
            <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, width: 40, textAlign: "right" }}>{cliUsage[x.id] ? `${cliUsage[x.id]?.session?.turns ?? cliUsage[x.id]?.session?.messages ?? "—"} turns` : `${x.calls ?? 0} turns`}</span>
          </div>
        ))}
      </div>
      {/* THE CODE AGENTS — claude / codex / opencode, straight from each engine's own meter */}
      <div data-testid="fuel-agents" style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, padding: "7px 9px" }}>
        <div style={{ ...head, marginBottom: 5 }}>code agents · context · session · windows</div>
        {!cliPanes.length && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>no claude / codex / opencode pane in this session yet — add one from the Agents category.</span>}
        {cliPanes.map((x) => {
          const u = cliUsage[x.id];
          const ctx = u?.context?.used_pct;
          const ctxTone = ctx == null ? C.dim : ctx >= 85 ? C.bad : ctx >= 60 ? C.warn : C.ok;
          const win = (label: string) => u?.limits?.find((l) => l.label === label);
          return (
            <div key={x.id} title={usageChipTitle(u)} style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 6, fontFamily: mono, fontSize: 9.5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: C.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1 }}>#{x.idx + 1} {String(x.pane_kind)}{u?.model ? <span style={{ color: C.dim }}> · {String(u.model).split("/").pop()}</span> : null}</span>
                <div style={{ flex: 1, minWidth: 40, height: 7, borderRadius: 4, background: C.bg, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, Number(ctx ?? 0))}%`, height: "100%", background: ctxTone, opacity: 0.85 }} />
                </div>
                <span style={{ color: ctxTone, flexShrink: 0 }}>{ctx == null ? (u?.source === "none" ? "no data" : "ctx —") : `ctx ${Math.round(ctx)}%`}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", color: C.muted }}>
                <span>{u?.session?.tokens_total != null ? `${fmtTok(Number(u.session.tokens_total))} tok` : "— tok"}</span>
                <span>{u?.cost_usd != null ? `$${Number(u.cost_usd).toFixed(3)}` : u?.proxy?.cost_usd != null ? `$${Number(u.proxy.cost_usd).toFixed(3)}` : "$ —"}</span>
                <span style={{ color: win("5h") ? (win("5h")!.used_pct >= 85 ? C.bad : C.muted) : C.dim }}>{win("5h") ? `5h ${Math.round(win("5h")!.used_pct)}%` : "5h —"}</span>
                <span style={{ color: win("week") ? (win("week")!.used_pct >= 85 ? C.bad : C.muted) : C.dim }}>{win("week") ? `wk ${Math.round(win("week")!.used_pct)}%` : u?.weekly_local?.tokens != null ? `wk ${fmtTok(Number(u.weekly_local.tokens))}` : "wk —"}</span>
              </div>
            </div>
          );
        })}
        {cliPanes.length > 0 && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>hover a row for the full meter · refreshed every 15 s from the engine's own status line / rollout / db.</span>}
      </div>
      {/* WITH what — per-model breakdown */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, padding: "7px 9px" }}>
        <div style={{ ...head, marginBottom: 5 }}>by model</div>
        {!byModel.size && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>no AI calls recorded for this session yet{audit ? "" : " (restart the BE to load the audit endpoint)"}.</span>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {[...byModel.entries()].sort((a, b) => b[1].cost - a[1].cost).map(([m, v]) => (
            <span key={m} style={{ fontFamily: mono, fontSize: 9, border: `1px solid ${C.border}`, borderRadius: 10, padding: "2px 8px", color: C.muted }}>
              {m} · <span style={{ color: C.fg }}>${v.cost.toFixed(3)}</span> · {v.n}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── NOTEBOOK pane (operator 2026-07-14, corrected: "not to use a notebook —
// to use notebook CAPABILITIES, session-scoped with the session shared memory,
// internally editable to funnel the context, generating ANY artifact"). The pane
// drives the hidden scratch notebook: before every mint it re-seeds the scratch
// with the SESSION MEMORY (mission + shared context docs) as the conversation
// and the pane's FUNNEL text as the primary focus — then mints any of the 11
// artifact kinds. Minted artifact ids persist on the pane, tiles open inside.
const NB_MINTS: Array<{ key: string; glyph: string; label: string; desc: string; url: string; body: (id: number) => any }> = [
  { key: "overview", glyph: "📋", label: "Overview", desc: "what this is, its parts, how they fit", url: "/api/v1/notebook/generate", body: (id) => ({ id, kind: "overview" }) },
  { key: "walkthrough", glyph: "🚶", label: "Walkthrough", desc: "step-by-step through the primary flow", url: "/api/v1/notebook/generate", body: (id) => ({ id, kind: "walkthrough" }) },
  { key: "questions", glyph: "❓", label: "Open questions", desc: "risks + unknowns as actionable bullets", url: "/api/v1/notebook/generate", body: (id) => ({ id, kind: "questions" }) },
  { key: "onboarding", glyph: "🎓", label: "Onboarding", desc: "where to start, concepts, gotchas", url: "/api/v1/notebook/generate", body: (id) => ({ id, kind: "onboarding" }) },
  { key: "glossary", glyph: "📖", label: "Glossary", desc: "the domain terms, grounded", url: "/api/v1/notebook/generate", body: (id) => ({ id, kind: "glossary" }) },
  { key: "risks", glyph: "⚠", label: "Risk report", desc: "what could break, severity-ordered", url: "/api/v1/notebook/generate", body: (id) => ({ id, kind: "risks" }) },
  { key: "faq", glyph: "💬", label: "FAQ", desc: "the most useful questions, answered", url: "/api/v1/notebook/generate", body: (id) => ({ id, kind: "faq" }) },
  { key: "timeline", glyph: "🕰", label: "Timeline", desc: "how this evolved, milestone by milestone", url: "/api/v1/notebook/generate", body: (id) => ({ id, kind: "timeline" }) },
  { key: "quiz", glyph: "❔", label: "Quiz", desc: "test the understanding", url: "/api/v1/notebook/quiz", body: (id) => ({ id }) },
  { key: "flashcards", glyph: "🃏", label: "Flashcards", desc: "spaced-repetition cards", url: "/api/v1/notebook/flashcards", body: (id) => ({ id }) },
  { key: "mindmap", glyph: "🕸", label: "Mindmap", desc: "the concept graph", url: "/api/v1/notebook/mindmap", body: (id) => ({ id }) },
];
export function NotebookPane({ p, sessionId }: { p?: Pane; sessionId: number }) {
  const [items, setItems] = React.useState<any[]>([]);
  const [view, setView] = React.useState<any | null>(null);
  const [minting, setMinting] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [funnelOpen, setFunnelOpen] = React.useState(false);
  const [funnel, setFunnel] = React.useState<string>(String(paneSettings(p).focus ?? ""));
  const ids: number[] = React.useMemo(() => (Array.isArray(paneSettings(p).artifact_ids) ? paneSettings(p).artifact_ids : []), [p?.settings_json]);
  const idsRef = React.useRef<number[]>(ids);
  React.useEffect(() => { idsRef.current = ids; }, [ids]);

  const sessionContext = React.useCallback(async () => {
    const d = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: sessionId }, { timeoutMs: 20000 }));
    return ["MISSION:", d?.mission_md ?? "(none)", "", "SHARED CONTEXT DOCS:", ...(d?.context_docs ?? []).map((x: any) => "--- doc #" + x.id + " ---\n" + String(x.body_md).slice(0, 1500))].join("\n").slice(0, 14000);
  }, [sessionId]);
  const ensureScratch = React.useCallback(async () => {
    // re-seed the hidden scratch RIGHT BEFORE use: session memory = the conversation,
    // the pane's funnel = the primary focus. Every mint grounds on the current truth.
    const conv = await sessionContext();
    const d = unwrap(await apiPost("/api/v1/notebook/store", { op: "scratch", conversation_md: conv, last_response_md: funnel.trim() || "(no extra funnel — use the session memory)" }, { timeoutMs: 30000 }));
    return Number(d?.notebook?.id) || 0;
  }, [sessionContext, funnel]);
  const refresh = React.useCallback(async (nbId: number) => {
    if (!nbId) return;
    const d = unwrap(await apiPost("/api/v1/notebook/store", { op: "get", id: nbId }, { timeoutMs: 20000 }));
    setItems((d?.items ?? []).filter((i: any) => idsRef.current.includes(Number(i.id))));
  }, []);
  React.useEffect(() => {
    (async () => { if (ids.length) { try { const nbId = await ensureScratch(); await refresh(nbId); } catch { /* pre-restart */ } } })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const saveFunnel = (v: string) => {
    setFunnel(v);
    if (p?.id) void apiPost("/api/v1/cockpit/pane/update", { pane_id: p.id, settings: { ...paneSettings(p), focus: v, artifact_ids: idsRef.current } }, { timeoutMs: 20000 });
  };
  const mint = async (m: typeof NB_MINTS[number]) => {
    if (minting) return;
    setMinting(m.key); setErr(null); setAddOpen(false);
    try {
      const nbId = await ensureScratch();
      const before = unwrap(await apiPost("/api/v1/notebook/store", { op: "get", id: nbId }, { timeoutMs: 20000 }));
      const beforeIds = new Set((before?.items ?? []).map((i: any) => Number(i.id)));
      const d = unwrap(await apiPost(m.url, m.body(nbId), { timeoutMs: 240000 }));
      if (d?.ok === false) setErr(d?.error ?? m.key + " failed");
      const after = unwrap(await apiPost("/api/v1/notebook/store", { op: "get", id: nbId }, { timeoutMs: 20000 }));
      const fresh = (after?.items ?? []).map((i: any) => Number(i.id)).filter((x: number) => !beforeIds.has(x));
      if (fresh.length) {
        idsRef.current = [...idsRef.current, ...fresh];
        if (p?.id) void apiPost("/api/v1/cockpit/pane/update", { pane_id: p.id, settings: { ...paneSettings(p), focus: funnel, artifact_ids: idsRef.current } }, { timeoutMs: 20000 });
      }
      setItems((after?.items ?? []).filter((i: any) => idsRef.current.includes(Number(i.id))));
    } catch (e: any) { setErr(e?.message ?? String(e)); }
    setMinting(null);
  };
  const glyphOf = (it: any) => NB_MINTS.find((m) => m.key === (it.meta?.artifact_kind ?? it.kind))?.glyph ?? "📄";
  if (view) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 10px", borderBottom: `1px solid ${C.border}` }}>
          <button onClick={() => setView(null)} style={{ ...btn, padding: "1px 9px", fontSize: 10, color: C.muted }}>← back</button>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.fg, fontWeight: 700 }}>{glyphOf(view)} {view.title ?? view.kind}</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}><MiniMd text={view.body_md ?? ""} /></div>
      </div>
    );
  }
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderBottom: `1px solid ${C.border}` }}>
        <span style={head}>session notebook · grounded in the shared memory</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setFunnelOpen((f) => !f)} title="the FUNNEL — extra context that narrows every artifact (persisted on the pane)" style={{ ...btn, padding: "1px 8px", fontSize: 9.5, color: funnel.trim() ? C.warn : C.muted, borderColor: funnel.trim() ? C.warn : C.border }}>🎯 funnel{funnel.trim() ? " ·" : ""}</button>
        <div style={{ position: "relative" }} onMouseLeave={() => setAddOpen(false)}>
          <button onMouseEnter={() => setAddOpen(true)} onClick={() => setAddOpen((a) => !a)} style={{ ...btn, padding: "1px 10px", fontSize: 10.5, color: C.brand, borderColor: C.brand }}>{minting ? "⏳" : "＋"} artifact</button>
          {addOpen && !minting && (
            <div style={{ position: "absolute", top: 24, right: 0, zIndex: 25, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 8, boxShadow: "0 6px 22px rgba(0,0,0,.4)", display: "grid", gridTemplateColumns: "repeat(4, 44px)", gap: 6 }}>
              {NB_MINTS.map((m, mi) => (
                <button key={m.key} onClick={() => void mint(m)} title={`${m.label} — ${m.desc} (one AI call)`}
                  style={{ width: 40, height: 40, borderRadius: "50%", cursor: "pointer", fontSize: 15, display: "grid", placeItems: "center", border: `1.5px solid ${C.border}`, background: C.bg, animation: `vibeRise .25s ${mi * 0.03}s cubic-bezier(.2,.9,.3,1.2) backwards` }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = C.brand; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = C.border; }}>
                  {m.glyph}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {funnelOpen && (
        <div style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>funnel — added as the PRIMARY FOCUS on every mint (on top of mission + shared docs)</span>
          <textarea value={funnel} onChange={(e) => saveFunnel(e.target.value)} placeholder="e.g. only the checkout flow; assume the reader is a designer…" style={{ ...inp, width: "100%", minHeight: 44, resize: "vertical", boxSizing: "border-box" }} />
        </div>
      )}
      {err && <div style={{ padding: "3px 10px", fontFamily: mono, fontSize: 9.5, color: C.warn }}>{err}</div>}
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {!items.length && <span style={padded}>hover ＋ artifact and pick a circle — overview, walkthrough, quiz, mindmap… Every mint grounds on the session's shared memory{funnel.trim() ? " + your funnel" : ""} (one AI call each). Tiles land here; click one to step inside.</span>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))", gap: 7 }}>
          {items.map((it: any) => (
            <button key={it.id} data-testid="nb-artifact" onClick={() => setView(it)}
              style={{ textAlign: "left", cursor: "pointer", border: `1px solid ${C.border}`, borderRadius: 9, padding: 8, background: C.bg, display: "flex", flexDirection: "column", gap: 4, minHeight: 64 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = C.brand; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = C.border; }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{glyphOf(it)}</span>
              <span style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, fontWeight: 600, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{it.title ?? it.kind}</span>
              <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim }}>{String(it.created_at ?? "").slice(5, 16)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ERROR RADAR pane (operator 2026-07-14: "error radar is good too") — the
// unified failure feed (system.failure.feed: every recorded failure, pattern-
// grouped) scoped to the last days, live, severity-filterable.
export function ErrorRadarPane({ p, panes = [] }: { p?: Pane; panes?: Pane[] } = {}) {
  const [rows, setRows] = React.useState<any[] | null>(null);
  const [sev, setSev] = React.useState<"all" | "error" | "warn">("all");
  const [days, setDays] = React.useState(7);
  // THE HUNT WIRE (bug-hunt collection): a failure row → the formation's patch agent
  const col = p ? collectionOf(p) : null;
  const hunter = col ? panes.find((x: any) => collectionOf(x) === col && x.pane_kind === "agent" && x.chat_session_id) : null;
  const [hunting, setHunting] = React.useState<number | null>(null);
  const [hunted, setHunted] = React.useState<Set<number>>(new Set());
  const hunt = async (r: any, i: number) => {
    if (!hunter || hunting != null) return;
    setHunting(i);
    try {
      await apiPost("/api/v1/cockpit/pane/message", { pane_id: hunter.id, user_input: `HUNT THIS FAILURE:\n[${r.kind}] ${r.title}\nrecorded: ${r.ts}${r.severity ? ` · severity: ${r.severity}` : ""}\n\nReproduce it, fix the ROOT CAUSE (not the symptom), and leave a test that would have caught it. Reply with the failure chain in one line + what you changed.` }, { timeoutMs: 600000 });
      setHunted((h) => new Set(h).add(i));
    } catch { /* the agent pane shows the error */ }
    setHunting(null);
  };
  const load = React.useCallback(async () => {
    try { const r: any = await apiGet(`/api/v1/failures/feed?days=${days}&limit=120`); const d = r?.result ?? r; setRows(d?.rows ?? []); } catch { setRows([]); }
  }, [days]);
  React.useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  const shown = (rows ?? []).filter((r) => sev === "all" || r.severity === sev);
  const sevColor = (s2: string) => (s2 === "error" ? C.bad : s2 === "warn" ? C.warn : C.dim);
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "4px 10px", borderBottom: `1px solid ${C.border}` }}>
        <span style={head}>error radar · {shown.length}</span>
        <span style={{ flex: 1 }} />
        {(["all", "error", "warn"] as const).map((k) => (
          <button key={k} onClick={() => setSev(k)} style={{ ...btn, padding: "1px 8px", fontSize: 9, color: sev === k ? C.brand : C.muted, borderColor: sev === k ? C.brand : C.border }}>{k}</button>
        ))}
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ ...inp, fontSize: 9.5, padding: "1px 5px" }}>
          <option value={1}>1d</option><option value={7}>7d</option><option value={30}>30d</option>
        </select>
        <button onClick={load} style={{ ...btn, padding: "1px 7px", fontSize: 9.5, color: C.muted }}>↻</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
        {rows === null && <span style={padded}>scanning the failure feed…</span>}
        {rows !== null && !shown.length && <span style={padded}>quiet skies — nothing recorded in the window.</span>}
        {shown.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 7, alignItems: "baseline", fontFamily: mono, fontSize: 9.5, minWidth: 0 }} title={r.title}>
            <span style={{ color: C.dim, flexShrink: 0, fontSize: 8.5 }}>{String(r.ts ?? "").slice(5, 16)}</span>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: sevColor(String(r.severity)), flexShrink: 0, alignSelf: "center" }} />
            <span style={{ color: C.muted, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              <span style={{ color: C.dim }}>[{r.kind}] </span>{r.title}
            </span>
            {hunter && (
              <button onClick={() => void hunt(r, i)} disabled={hunting != null || hunted.has(i)}
                title={`send this failure to #${hunter.idx + 1} ${hunter.subagent_name} — reproduce · root-cause · test (one AI turn)`}
                style={{ ...btn, padding: "0 7px", fontSize: 8.5, flexShrink: 0, color: hunted.has(i) ? C.ok : hunting === i ? C.warn : C.bad, borderColor: hunted.has(i) ? C.ok : C.border }}>
                {hunted.has(i) ? "✓ hunting" : hunting === i ? "⏳" : "→ hunt"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BUG FINDER — the 3-wave AUTOMATION (operator 2026-07-17: "bug finder is not
// a pane, it's an automation — the 3 waves, each one a pane"). Each wave is its
// own pane; the 🐞 Bug finder collection wires them. They share ONE run through
// the blackboard handoff: WAVE 1 (determinism · $0) opens the run and broadcasts
// {run_id, scope}; WAVE 2 (shard swarm · low) and WAVE 3 (sweep · one mid call)
// read it and APPEND — one bug-finding pass, one ledger row. Advisory: one-click
// classify feeds the Bug Finder precision ledger; nothing here blocks. ────────
const SEV_COLOR: Record<string, string> = { high: C.bad, medium: C.warn, low: C.dim };
const BF_WAVE: Record<number, { title: string; accent: string; cost: string; skip: string[]; blurb: string; runLabel: string }> = {
  1: { title: "wave 1 · determinism", accent: C.ok, cost: "$0", skip: ["shards", "sweep"],
       blurb: "lint · typecheck · hallucinated imports vs disk+atlas · structural smells — counted facts, instant.", runLabel: "▶ run wave 1 · $0" },
  2: { title: "wave 2 · shard swarm", accent: C.warn, cost: "low tier", skip: ["lint", "typecheck", "existence", "smells", "sweep"],
       blurb: "narrow low-tier finders, one bug species each; every lead needs a verbatim quote or it is void.", runLabel: "▶ run wave 2 · shards" },
  3: { title: "wave 3 · the sweep", accent: C.brand, cost: "one mid call", skip: ["lint", "typecheck", "existence", "smells", "shards"],
       blurb: "ONE mid call for anything outside the covered categories — told what waves 1+2 already found.", runLabel: "▶ run wave 3 · sweep" },
};
const HANDOFF_KIND = "handoff";
const bfScopeLabel = (sc: any) => sc?.root ? "worktree" : `diff vs ${sc?.base ?? "main"}`;

// one component, three waves. Coordinates through the shared coordination log:
// wave 1 upserts a handoff for its collection, waves 2/3 read + append to it.
export function BugFinderWavePane({ p, panes = [], sessionId, wave }: { p?: Pane; panes?: Pane[]; sessionId?: number | null; wave: number }) {
  const meta = BF_WAVE[wave] ?? BF_WAVE[1];
  const col = p ? collectionOf(p) : null;
  const worktrees = panes.filter((x: any) => x.worktree_path);
  const [target, setTarget] = React.useState<string>("root"); // 'root' | pane id  (used when standalone / wave 1)
  const [base, setBase] = React.useState("main");
  const [busy, setBusy] = React.useState(false);
  const [run, setRun] = React.useState<any | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [classed, setClassed] = React.useState<Record<number, string>>({});
  const [handoff, setHandoff] = React.useState<{ id: number; run_id: number; scope: any } | null>(null);

  // read the collection's shared handoff (the run wave 1 opened + its scope)
  const loadHandoff = React.useCallback(async () => {
    if (!sessionId || !p?.id || col == null) return;
    try {
      const d: any = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: sessionId, pane_id: p.id }, { timeoutMs: 20000 }));
      let best: { id: number; run_id: number; scope: any } | null = null;
      for (const row of (d?.coordination ?? [])) {
        if (row.kind !== HANDOFF_KIND) continue;
        try { const b = JSON.parse(row.body_md); if (b?.bugfinder && b.collection === col && b.run_id != null) best = { id: row.id, run_id: b.run_id, scope: b.scope ?? {} }; } catch { /* skip */ }
      }
      setHandoff(best);
    } catch { /* offline — the pane still runs standalone */ }
  }, [sessionId, p?.id, col]);
  React.useEffect(() => { void loadHandoff(); const t = setInterval(loadHandoff, 8000); return () => clearInterval(t); }, [loadHandoff]);

  const upsertHandoff = async (run_id: number, scope: any) => {
    if (!sessionId || col == null) return;
    const body = JSON.stringify({ bugfinder: true, collection: col, run_id, scope });
    try {
      if (handoff?.id) await apiPost("/api/v1/cockpit/blackboard/post", { op: "update", id: handoff.id, body_md: body }, { timeoutMs: 20000 });
      else await apiPost("/api/v1/cockpit/blackboard/post", { session_id: sessionId, kind: HANDOFF_KIND, body_md: body }, { timeoutMs: 20000 });
      void loadHandoff();
    } catch { /* the run still happened; only the wiring broadcast failed */ }
  };

  const linked = wave > 1 && handoff != null;
  const fire = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    // linked waves 2/3 inherit wave 1's scope + run_id (append); else use the picker
    let scope: any;
    let appendRunId: number | null = null;
    if (linked) { scope = handoff!.scope ?? {}; appendRunId = handoff!.run_id; }
    else {
      const wt = target === "root" ? null : worktrees.find((x: any) => String(x.id) === target);
      scope = { ...(wt ? { root: (wt as any).worktree_path } : {}), base: base.trim() || "main" };
    }
    const input: any = {
      source: "vibe", skip: meta.skip,
      ...(sessionId != null ? { session_id: String(sessionId) } : {}),
      ...(scope.root ? { root: scope.root } : {}),
      base: scope.base ?? "main",
      ...(appendRunId != null ? { run_id: appendRunId } : {}),
    };
    try {
      const r: any = await apiPost(`/api/v1/dispatch`, { action_name: "system.bugfinder.run", input }, { timeoutMs: 600000 });
      const d = unwrap(r) ?? r?.result ?? r;
      if (d?.run_id == null) throw new Error(d?.message ?? "no run came back");
      setRun(d); setClassed({});
      if (wave === 1 && col != null) await upsertHandoff(d.run_id, scope); // broadcast to waves 2/3
    } catch (e: any) { setError(String(e?.message ?? "bug finder failed").slice(0, 200)); }
    setBusy(false);
  };
  const classify = async (findingId: number | undefined, cls: string) => {
    if (findingId == null) return;
    try {
      await apiPost(`/api/v1/dispatch`, { action_name: "system.bugfinder.classify", input: { finding_id: findingId, class: cls } });
      setClassed((c) => ({ ...c, [findingId]: cls }));
    } catch { /* advisory */ }
  };

  const kept = (run?.findings ?? []) as any[];
  const needsWave1 = wave > 1 && col != null && !handoff;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "4px 10px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <span style={{ ...head, color: meta.accent }}>🐞 {meta.title}</span>
        {linked ? (
          <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }} title="inherits wave 1's run + scope">▪ run #{handoff!.run_id} · {bfScopeLabel(handoff!.scope)}</span>
        ) : (wave === 1 || col == null) ? (<>
          <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ ...inp, fontSize: 9.5, padding: "1px 5px", maxWidth: 120 }} title="what to scan">
            <option value="root">workspace diff</option>
            {worktrees.map((x: any) => (<option key={x.id} value={String(x.id)}>#{x.idx + 1} {x.subagent_name || "pane"} wt</option>))}
          </select>
          <input value={base} onChange={(e) => setBase(e.target.value)} style={{ ...inp, fontSize: 9.5, padding: "1px 5px", width: 52 }} title="diff base" />
        </>) : null}
        <span style={{ flex: 1 }} />
        <button onClick={() => void fire()} disabled={busy || needsWave1} style={{ ...btn, padding: "1px 8px", fontSize: 9, color: meta.accent, borderColor: busy ? meta.accent : C.border }} title={meta.blurb}>
          {busy ? "⏳" : meta.runLabel}
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>{meta.cost} · {meta.blurb}</span>
        {needsWave1 && <span style={{ ...padded, color: C.warn }}>waiting for wave 1 — run the determinism pane first; this wave appends to its run.</span>}
        {error && <span style={{ ...padded, color: C.bad }}>{error}</span>}
        {run && (<>
          <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span>run <b style={{ color: C.fg }}>#{run.run_id}</b>{run.appended ? " ·appended" : ""}</span>
            <span>this wave <b style={{ color: kept.length ? C.warn : C.ok }}>{run.wave_kept ?? kept.length}</b></span>
            <span>run total <b style={{ color: C.fg }}>{run.counts?.kept ?? "?"}</b></span>
            <span>void <b style={{ color: C.dim }}>{run.dropped ?? 0}</b></span>
            <span>${Number(run.wave_cost_usd ?? run.cost_usd ?? 0).toFixed(4)}</span>
            {run.capped > 0 && <span style={{ color: C.warn }}>capped +{run.capped}</span>}
          </div>
          {!kept.length && <span style={padded}>this wave found nothing new. (a complete answer, not a failure)</span>}
          {kept.map((f: any, i: number) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "baseline", fontFamily: mono, fontSize: 9.5, minWidth: 0 }} title={f.evidence ? `evidence: ${f.evidence}` : undefined}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: SEV_COLOR[String(f.severity)] ?? C.dim, flexShrink: 0, alignSelf: "center" }} />
              <span style={{ color: C.brand, flexShrink: 0 }}>{f.category}</span>
              <span style={{ color: C.muted, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                <span style={{ color: C.dim }}>{f.file}{f.line != null ? `:${f.line}` : ""} </span>{f.detail}
              </span>
              {f.id != null && (classed[f.id] ? (
                <span style={{ color: C.ok, fontSize: 8.5, flexShrink: 0 }}>✓ {classed[f.id]}</span>
              ) : (
                <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                  {(["real", "false-positive", "known"] as const).map((cls) => (
                    <button key={cls} onClick={() => void classify(f.id, cls)} title={`classify: ${cls} (feeds the precision ledger)`}
                      style={{ ...btn, padding: "0 5px", fontSize: 8, color: cls === "real" ? C.bad : cls === "false-positive" ? C.dim : C.muted }}>
                      {cls === "real" ? "bug" : cls === "false-positive" ? "fp" : "known"}
                    </button>
                  ))}
                </span>
              ))}
            </div>
          ))}
        </>)}
      </div>
    </div>
  );
}

// ── PANE COLLECTIONS, wave 1 (operator 2026-07-14: "ultra dev be a group of
// panes instead of one pane — panes that work together sharing information in
// steps; each collection has an intent or goal; steps sync or parallel") ──────
// A collection = a TYPED FRAME (board_json frames carry {template, goal}) whose
// member panes are stamped settings.collection = frameId + settings.role. The
// blackboard stays the bus: the SHAPE pane owns the plan row; INTENT mints onto
// it; EXECUTE drains its queue from it; JUDGE rules it. Membership only ADDS
// wires — every pane still works standalone.
const VERDICT_TONE: Record<string, string> = { pass: C.ok, fail: C.bad, needs_human: C.warn, executing: C.brand, planned: C.dim, queued: C.brand, running: C.warn, done: C.ok, failed: C.bad };
function StatusChip({ s: st }: { s: string }) {
  const tone = VERDICT_TONE[st] ?? C.dim;
  return <span style={{ fontFamily: mono, fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: tone, border: `1px solid ${tone}`, borderRadius: 8, padding: "0 6px" }}>{st.replace("_", " ")}</span>;
}
export const collectionOf = (p: any) => paneSettings(p).collection ?? null;
export const sibling = (panes: any[], p: any, kinds: string[]) => {
  const col = collectionOf(p);
  if (col) { const hit = panes.find((x: any) => x.id !== p.id && collectionOf(x) === col && kinds.includes(x.pane_kind)); if (hit) return hit; }
  return panes.find((x: any) => x.id !== p.id && kinds.includes(x.pane_kind)) ?? null;
};
export const findPlanPane = (panes: any[]) => panes.find((x: any) => ["ultraplan", "breakdown"].includes(x.pane_kind));

// THE BASE PLAN CHANNEL (operator 2026-07-15: the brainstorm hands its
// artifact to the shape pane directly — no decision pane, no paste box). The
// forged artifact lives as ONE session-level 'baseplan' doc; the shape pane
// reads it as its tree root. Update-in-place so it stays single.
export async function readSessionBasePlan(sessionId: number): Promise<{ id: number; md: string } | null> {
  const d = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: sessionId }, { timeoutMs: 20000 }).catch(() => null));
  const row = (d?.coordination ?? []).filter((r: any) => r.kind === "baseplan").pop();
  return row?.body_md ? { id: row.id, md: String(row.body_md) } : null;
}
export async function writeSessionBasePlan(sessionId: number, md: string): Promise<void> {
  const existing = await readSessionBasePlan(sessionId);
  const body = String(md ?? "").slice(0, 19000);
  if (existing?.id) await apiPost("/api/v1/cockpit/blackboard/post", { op: "update", id: existing.id, body_md: body }, { timeoutMs: 20000 }).catch(() => null);
  else await apiPost("/api/v1/cockpit/blackboard/post", { session_id: sessionId, kind: "baseplan", body_md: body }, { timeoutMs: 20000 }).catch(() => null);
}
async function readPlan(sessionId: number, planPaneId: number): Promise<any | null> {
  const d = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: sessionId, pane_id: planPaneId }, { timeoutMs: 20000 }));
  const row = (d?.scratch ?? []).filter((r: any) => r.kind === "plan").pop();
  if (!row) return null;
  try { return { row_id: row.id, ...JSON.parse(row.body_md) }; } catch { return null; }
}
function taskBriefFor(item: any, vibeKey: string): string {
  const persona = (VIBE_PERSONAS as any)[vibeKey] ?? "";
  const bp = item.blueprint && item.blueprint_approved
    ? `BLUEPRINT (implement TO this shape — the judge compares your diff against it):\n` + item.blueprint.files.map((f: any) => `${f.path} (${f.action}):\n${(f.symbols ?? []).map((sy: any) => `  - ${sy.kind} ${sy.name}${sy.signature ? " " + sy.signature : ""}${sy.intent ? " — " + sy.intent : ""}`).join("\n")}`).join("\n")
    : "";
  return [persona, `INTENT:\n${item.intent || item.title}`,
    bp,
    item.files_hint?.length ? `FILES HINT:\n${item.files_hint.join("\n")}` : "",
    item.acceptance?.length ? `ACCEPTANCE (a judge verifies these against your diff):\n${item.acceptance.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
}

// ── 🧠 BRAINSTORM pane (it was the 🎯 Intent pane) lives in brainstorm-pane.tsx (operator 2026-10-11).

// ── 🧩 SHAPE pane — step ② (sync): the diagram; owns the plan row; feeds EXECUTE.
export function ShapePane({ p, panes, sessionId, onChanged }: { p: Pane; panes: Pane[]; sessionId: number; onChanged: () => void }) {
  const [goal, setGoal] = React.useState("");
  const [plan, setPlan] = React.useState<any | null>(null);
  const [busyPlan, setBusyPlan] = React.useState<string | null>(null);
  const [actBusy, setActBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [exported, setExported] = React.useState(false);
  const [openItem, setOpenItem] = React.useState<string | null>(null);
  const seededGoal = React.useRef(false);
  const exec = sibling(panes, p, ["swarm"]);
  const load = React.useCallback(async () => {
    const pl = await readPlan(sessionId, p.id);
    setPlan(pl);
    if (pl?.ambition && !seededGoal.current) { seededGoal.current = true; setGoal(pl.ambition.split("\n")[0]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, p.id]);
  React.useEffect(() => { void load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);
  const items = (plan?.phases ?? []).flatMap((ph: any) => ph.items);
  const accepted = items.filter((it: any) => it.accepted !== false);
  const persistPlan = async (next: any) => {
    setPlan(next); setExported(false);
    if (next?.row_id) await apiPost("/api/v1/cockpit/blackboard/post", { op: "update", id: next.row_id, body_md: JSON.stringify({ ...next, row_id: undefined }).slice(0, 19000) }, { timeoutMs: 20000 });
  };
  const patchItem = (id: string, patch: any) => {
    const next = { ...plan, phases: plan.phases.map((ph: any) => ({ ...ph, items: ph.items.map((it: any) => (it.id === id ? { ...it, ...patch } : it)) })) };
    void persistPlan(next);
  };
  const mint = async (mode: "ultra" | "breakdown") => {
    if (!goal.trim() || busyPlan) return;
    setBusyPlan(mode); setErr(null);
    try {
      const d = unwrap(await apiPost("/api/v1/cockpit/plan/generate", { session_id: sessionId, pane_id: p.id, ambition: goal.trim(), mode }, { timeoutMs: 300000 }));
      if (d?.ok === false) setErr(d?.error ?? "plan failed"); else { setExported(false); await load(); }
    } catch (e: any) { setErr(e?.message ?? "unreachable — restart the BE"); }
    setBusyPlan(null);
  };
  // MANUAL node — build the brainstorm tree by hand (no intent / no AI mint needed). Appends to the plan,
  // creating the plan row if there isn't one yet, then opens the new node for renaming.
  const addNode = async () => {
    const item = { id: `n${Date.now().toString(36)}`, title: "new node", agent: "dev", size: "m", accepted: true, status: "planned" };
    if (plan?.row_id) {
      const phs = plan.phases?.length ? plan.phases : [{ title: "manual", items: [] }];
      const next = { ...plan, phases: phs.map((ph: any, i: number) => (i === phs.length - 1 ? { ...ph, items: [...(ph.items ?? []), item] } : ph)) };
      await persistPlan(next);
    } else {
      const fresh = { ambition: goal.trim() || "manual plan", phases: [{ title: "manual", items: [item] }] };
      await apiPost("/api/v1/cockpit/blackboard/post", { session_id: sessionId, pane_id: p.id, kind: "plan", body_md: JSON.stringify(fresh) }, { timeoutMs: 20000 });
      await load();
    }
    setOpenItem(item.id);
  };
  const renameNode = (it: any) => { const t = window.prompt("Rename node", it.title); if (t != null && t.trim()) patchItem(it.id, { title: t.trim() }); };
  const exportToMemory = async () => {
    if (!accepted.length) return;
    const lines = accepted.map((it: any, i: number) => `${i + 1}. [${it.agent}·${it.size}] ${it.title}${it.intent ? " — " + it.intent : ""}${it.files_hint?.length ? ` (files: ${it.files_hint.join(", ")})` : ""}`);
    await apiPost("/api/v1/cockpit/blackboard/post", { session_id: sessionId, kind: "context", body_md: `PLAN — ${plan?.ambition ?? goal}:\n${lines.join("\n")}` }, { timeoutMs: 20000 });
    setExported(true);
  };
  const spawn = async (it: any) => {
    setActBusy("spawn:" + it.id);
    try {
      await apiPost("/api/v1/cockpit/pane/add", { session_id: sessionId, base_agent: "dev", subagent_name: `${it.agent}·${String(it.title).slice(0, 18)}`, scope: it.files_hint ?? [], grants: ["file.read", "file.write"], extra_prompt_md: taskBriefFor(it, it.agent), tier: it.size === "l" ? "mid" : "low" }, { timeoutMs: 120000 });
      onChanged();
    } catch { /* */ }
    setActBusy(null);
  };
  const queueItem = async (it: any) => {
    if (!exec) { setErr("no execute pane in this collection — spawn the Ultra Dev collection or add a 🐝 Execute pane"); return; }
    setActBusy("queue:" + it.id);
    try {
      await apiPost("/api/v1/cockpit/swarm/run", { op: "add", pane_id: exec.id, session_id: sessionId, task: { title: it.title, brief: taskBriefFor(it, it.agent), agent: it.agent } }, { timeoutMs: 20000 });
      patchItem(it.id, { queued: true, status: it.status === "planned" ? "executing" : it.status });
    } catch { /* */ }
    setActBusy(null);
  };
  const queueAll = async () => { for (const it of accepted.filter((x: any) => !x.queued && !(x.blueprint && !x.blueprint_approved))) await queueItem(it); };
  const judge = async (it: any) => {
    setActBusy("judge:" + it.id);
    try { await apiPost("/api/v1/cockpit/plan/judge", { session_id: sessionId, plan_pane_id: p.id, item_id: it.id }, { timeoutMs: 240000 }); await load(); onChanged(); } catch { /* */ }
    setActBusy(null);
  };
  const blueprint = async (it: any) => {
    setActBusy("bp:" + it.id);
    setErr(null);
    try {
      const d = unwrap(await apiPost("/api/v1/cockpit/plan/generate", { session_id: sessionId, pane_id: p.id, item_id: it.id, mode: "blueprint" }, { timeoutMs: 240000 }));
      if (d?.ok === false) setErr(d?.error ?? "blueprint failed");
      await load();
      setOpenItem(it.id);
    } catch (e: any) { setErr(e?.message ?? "unreachable — restart the BE"); }
    setActBusy(null);
  };
  const toneOf = (st: string) => VERDICT_TONE[st] ?? C.dim;
  const box = (accepted2: boolean | undefined): React.CSSProperties => ({
    border: `1.5px solid ${accepted2 === false ? C.border : C.brand}`, borderRadius: 10, background: C.panel, padding: "7px 9px",
    opacity: accepted2 === false ? 0.45 : 1, position: "relative", display: "flex", flexDirection: "column", gap: 4, minWidth: 0,
  });
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "4px 10px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <span style={head}>🧩 shape · step ②</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: mono, fontSize: 8.5, color: exec ? C.ok : C.dim }} title={exec ? `queues onto #${exec.idx + 1}` : "no execute pane — → pane still works"}>{exec ? `⇣ → #${exec.idx + 1} execute` : "no execute pane"}</span>
        {items.length > 0 && accepted.some((x: any) => !x.queued) && exec && <button onClick={() => void queueAll()} disabled={!!actBusy} style={{ ...btn, padding: "1px 8px", fontSize: 9, color: C.warn, borderColor: C.warn }}>⇊ queue accepted</button>}
        {items.length > 0 && <button onClick={exportToMemory} title="export the ACCEPTED slices to the shared memory — every agent reads it" style={{ ...btn, padding: "1px 8px", fontSize: 9, color: exported ? C.ok : C.brand, borderColor: exported ? C.ok : C.brand }}>{exported ? "✓ in memory" : `⤴ memory (${accepted.length})`}</button>}
      </div>
      {err && <div style={{ padding: "3px 10px", fontFamily: mono, fontSize: 9.5, color: C.warn }}>{err}</div>}
      <div style={{ flex: 1, overflowY: "auto", padding: 12, background: `radial-gradient(circle, color-mix(in oklab, ${C.border} 55%, transparent) 1px, transparent 1px) 0 0 / 22px 22px` }}>
        <div style={{ maxWidth: 480, margin: "0 auto", border: `2px solid ${C.fg}`, borderRadius: 12, background: C.panel, padding: 9, boxShadow: "0 3px 14px rgba(0,0,0,.25)" }}>
          <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>the goal — from 🎯 intent, or type + mint here</div>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="the ambition…" style={{ ...inp, flex: 1, fontSize: 10.5, border: "none", background: C.bg }} />
            <button onClick={() => void mint("ultra")} disabled={!!busyPlan || !goal.trim()} title="one HIGH call, grounded" style={{ ...btn, padding: "2px 8px", fontSize: 9.5, color: busyPlan === "ultra" ? C.warn : C.brand, borderColor: busyPlan === "ultra" ? C.warn : C.brand }}>{busyPlan === "ultra" ? "⏳" : "🗺"}</button>
            <button onClick={() => void mint("breakdown")} disabled={!!busyPlan || !goal.trim()} title="one MID call, quick" style={{ ...btn, padding: "2px 8px", fontSize: 9.5, color: busyPlan === "breakdown" ? C.warn : C.muted }}>{busyPlan === "breakdown" ? "⏳" : "🧩"}</button>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <button onClick={() => void addNode()} disabled={!!busyPlan} title="add a node by hand — build the tree without intent or AI" style={{ ...btn, padding: "2px 10px", fontSize: 9.5, color: C.brand }}>+ node</button>
        </div>
        {items.length > 0 && (<>
          <div style={{ width: 2, height: 22, background: C.brand, margin: "0 auto", opacity: 0.7 }} />
          <div style={{ height: 2, background: C.brand, opacity: 0.7, margin: "0 8%", borderRadius: 2 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 18, alignItems: "start" }}>
            {items.map((it: any) => (
              <div key={it.id} style={box(it.accepted)}>
                <div style={{ position: "absolute", top: -18, left: "50%", width: 2, height: 18, background: C.brand, opacity: it.accepted === false ? 0.2 : 0.7 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 13 }}>{(VIBE_AVATARS as any)[it.agent] ?? "🤖"}</span>
                  <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 4px" }}>{it.size}</span>
                  {it.queued && <StatusChip s={it.status === "planned" ? "executing" : it.status ?? "executing"} />}
                  {!it.queued && it.status && it.status !== "planned" && <StatusChip s={it.status} />}
                  <span style={{ flex: 1 }} />
                  <button onClick={() => patchItem(it.id, { accepted: true })} title="accept" style={{ ...btn, padding: "0 6px", fontSize: 9.5, color: it.accepted !== false ? C.ok : C.muted, borderColor: it.accepted !== false ? C.ok : C.border }}>✓</button>
                  <button onClick={() => patchItem(it.id, { accepted: false })} title="reject (dims it; excluded from export + queue-all)" style={{ ...btn, padding: "0 6px", fontSize: 9.5, color: it.accepted === false ? C.bad : C.muted, borderColor: it.accepted === false ? C.bad : C.border }}>✗</button>
                </div>
                <div onClick={() => setOpenItem(openItem === it.id ? null : it.id)} style={{ fontFamily: mono, fontSize: 10, color: C.fg, fontWeight: 700, lineHeight: 1.35, cursor: "pointer" }}>{openItem === it.id ? "▾ " : ""}{it.title}</div>
                {openItem === it.id && (<>
                  <button onClick={() => renameNode(it)} title="rename this node" style={{ ...btn, alignSelf: "flex-start", padding: "0 7px", fontSize: 8.5, color: C.brand }}>✎ rename</button>
                  {it.intent && <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, lineHeight: 1.45 }}>{it.intent}</div>}
                  {(it.acceptance ?? []).map((c: string, i: number) => {
                    const v = (it.verdicts ?? [])[i];
                    return <div key={i} style={{ display: "flex", gap: 5, alignItems: "baseline" }} title={v?.reasoning ?? ""}>
                      <span style={{ fontFamily: mono, fontSize: 8.5, color: v ? toneOf(v.verdict) : C.dim, flexShrink: 0 }}>{v ? (v.verdict === "pass" ? "✓" : v.verdict === "fail" ? "✗" : "?") : "☐"}</span>
                      <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, lineHeight: 1.4 }}>{c}</span>
                    </div>;
                  })}
                  {(it.files_hint ?? []).length > 0 && <div style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>files: {it.files_hint.join(" · ")}</div>}
                  {it.blueprint && (
                    <div style={{ border: `1px solid ${it.blueprint_approved ? C.ok : C.warn}`, borderRadius: 7, background: C.bg, padding: "5px 7px", display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: mono, fontSize: 8, color: it.blueprint_approved ? C.ok : C.warn, textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700 }}>📐 blueprint {it.blueprint_approved ? "· approved" : "· awaiting your gate"}</span>
                        <span style={{ flex: 1 }} />
                        {!it.blueprint_approved && <button onClick={() => patchItem(it.id, { blueprint_approved: true })} title="approve — it rides the task brief and sharpens the judge" style={{ ...btn, padding: "0 7px", fontSize: 8.5, color: C.ok, borderColor: C.ok }}>✓ approve</button>}
                        <button onClick={() => void blueprint(it)} disabled={!!actBusy} title="re-roll the blueprint (one mid call)" style={{ ...btn, padding: "0 7px", fontSize: 8.5, color: C.muted }}>{actBusy === "bp:" + it.id ? "⏳" : "♻"}</button>
                        <button onClick={() => patchItem(it.id, { blueprint: undefined, blueprint_approved: undefined })} title="discard the blueprint (queue unlocks without a gate)" style={{ ...btn, padding: "0 7px", fontSize: 8.5, color: C.bad, borderColor: "transparent" }}>✕</button>
                      </div>
                      {it.blueprint.files.map((f: any, fi: number) => (
                        <div key={fi}>
                          <div style={{ fontFamily: mono, fontSize: 8.5, color: C.fg }}>
                            <span style={{ color: f.action === "create" ? C.ok : C.brand, fontWeight: 700 }}>{f.action === "create" ? "＋" : "±"}</span> {f.path}
                          </div>
                          {(f.symbols ?? []).map((sy: any, si: number) => (
                            <div key={si} style={{ fontFamily: mono, fontSize: 8, color: C.muted, paddingLeft: 12 }} title={sy.intent}>
                              <span style={{ color: C.dim }}>{sy.kind}</span> <span style={{ color: C.fg }}>{sy.name}</span><span style={{ color: C.dim }}>{sy.signature ? " " + sy.signature : ""}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </>)}
                {it.accepted !== false && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {!it.blueprint && <button onClick={() => void blueprint(it)} disabled={!!actBusy} title="📐 design the SHAPE before executing (files → symbols → signatures) — one mid call; you approve it as a gate" style={{ ...btn, padding: "0 7px", fontSize: 8.5, color: C.brand }}>{actBusy === "bp:" + it.id ? "⏳" : "📐 blueprint"}</button>}
                    <button onClick={() => void queueItem(it)} disabled={!!actBusy || !!it.queued || !exec || (it.blueprint && !it.blueprint_approved)} title={it.blueprint && !it.blueprint_approved ? "the blueprint gate: approve (✓) or discard (✕) it first" : exec ? `queue on #${exec.idx + 1}'s worktree` : "no execute pane in the collection"} style={{ ...btn, padding: "0 7px", fontSize: 8.5, color: it.queued ? C.dim : it.blueprint && !it.blueprint_approved ? C.muted : C.warn }}>{actBusy === "queue:" + it.id ? "⏳" : it.queued ? "✓ queued" : it.blueprint && !it.blueprint_approved ? "🔒 gated" : "⇣ queue"}</button>
                    <button onClick={() => void spawn(it)} disabled={!!actBusy} title="spawn a pre-configured agent pane instead" style={{ ...btn, padding: "0 7px", fontSize: 8.5, color: C.brand }}>{actBusy === "spawn:" + it.id ? "⏳" : "→ pane"}</button>
                    {(it.acceptance ?? []).length > 0 && <button onClick={() => void judge(it)} disabled={!!actBusy} title="⚖ judge the acceptance against evidence from every pane — one mid call" style={{ ...btn, padding: "0 7px", fontSize: 8.5, color: C.ok }}>{actBusy === "judge:" + it.id ? "⏳" : "⚖ judge"}</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>)}
        {!items.length && <div style={{ ...padded, textAlign: "center" }}>the plan lands here from 🎯 intent (or mint above): slices as boxes with ✓/✗, 📐 blueprint gates, ⇣ queue to execute, ⚖ judge.</div>}
      </div>
    </div>
  );
}

// ── 🐝 EXECUTE pane — step ③ (sync-gated by blueprints, parallel with judge):
// the queue in THIS pane's worktree — one writer, one coherent diff.
export function ExecutePane({ p, sessionId, onChanged }: { p: Pane; sessionId: number; onChanged: () => void }) {
  const [tasks, setTasks] = React.useState<any[]>([]);
  const [draft, setDraft] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [auto, setAuto] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<number | null>(null);
  const load = React.useCallback(async () => {
    try { const d = unwrap(await apiPost("/api/v1/cockpit/swarm/run", { op: "list", pane_id: p.id, session_id: sessionId }, { timeoutMs: 20000 })); setTasks(d?.tasks ?? []); } catch { /* pre-restart */ }
  }, [p.id, sessionId]);
  React.useEffect(() => { void load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  const add = async () => {
    if (!draft.trim()) return;
    await apiPost("/api/v1/cockpit/swarm/run", { op: "add", pane_id: p.id, session_id: sessionId, task: { title: draft.trim().slice(0, 80), brief: draft.trim(), agent: "forge" } }, { timeoutMs: 20000 });
    setDraft(""); load();
  };
  const runNext = React.useCallback(async () => {
    setRunning(true); setErr(null);
    try {
      const d = unwrap(await apiPost("/api/v1/cockpit/swarm/run", { op: "run-next", pane_id: p.id }, { timeoutMs: 600000 }));
      if (d?.ok === false) setErr(d?.error ?? "run failed");
    } catch (e: any) { setErr(e?.message ?? "unreachable — restart the BE"); }
    await load(); onChanged();
    setRunning(false);
  }, [p.id, load, onChanged]);
  React.useEffect(() => {
    if (!auto || running) return;
    if (!tasks.some((t) => t.status === "queued")) { setAuto(false); return; }
    void runNext();
  }, [auto, running, tasks, runNext]);
  const queued = tasks.filter((t) => t.status === "queued").length;
  const doneN = tasks.filter((t) => t.status === "done").length;
  const toneOf = (st: string) => VERDICT_TONE[st] ?? C.dim;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <span style={head}>🐝 execute · step ③ · {queued} queued · {doneN} done</span>
        <span style={{ fontSize: 10, color: p.worktree_path ? C.ok : C.warn }} title={p.worktree_path ?? "worktree provisioning…"}>⎇ {p.branch ?? "provisioning…"}</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => void runNext()} disabled={running || !queued} title="run the next task — ONE AI turn writing into this worktree" style={{ ...btn, padding: "1px 9px", fontSize: 10, color: running ? C.warn : queued ? C.ok : C.muted, borderColor: running ? C.warn : queued ? C.ok : C.border }}>{running ? "⏳ working…" : "▶ next"}</button>
        <button onClick={() => setAuto((a) => !a)} disabled={!queued && !auto} title="drain the queue, one task at a time (one writer per worktree)" style={{ ...btn, padding: "1px 9px", fontSize: 10, color: auto ? C.warn : C.muted, borderColor: auto ? C.warn : C.border }}>{auto ? "■ stop auto" : "▶▶ auto"}</button>
      </div>
      {err && <div style={{ padding: "3px 10px", fontFamily: mono, fontSize: 9.5, color: C.warn }}>{err}</div>}
      <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        {!tasks.length && <span style={padded}>the queue fills from 🧩 shape (⇣ / ⇊) or type a task below. Tasks run ONE at a time into this pane's worktree; review the combined diff in ◨ Review.</span>}
        {tasks.map((t) => (
          <div key={t.id} style={{ border: `1px solid ${toneOf(t.status)}`, borderRadius: 7, background: C.bg }}>
            <div onClick={() => setOpen(open === t.id ? null : t.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", cursor: "pointer" }}>
              <span style={{ fontSize: 11 }}>{(VIBE_AVATARS as any)[t.agent] ?? "🤖"}</span>
              <span style={{ fontFamily: mono, fontSize: 10, color: C.fg, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
              <StatusChip s={t.status} />
              {t.status === "queued" && <button onClick={(e) => { e.stopPropagation(); void apiPost("/api/v1/cockpit/swarm/run", { op: "remove", id: t.id }, { timeoutMs: 15000 }).then(() => void load()); }} style={{ ...btn, padding: "0 5px", fontSize: 8, color: C.bad, borderColor: "transparent" }}>✕</button>}
            </div>
            {open === t.id && (t.brief || t.reply) && (
              <div style={{ borderTop: `1px solid ${C.border}`, padding: "5px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                {t.reply && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, whiteSpace: "pre-wrap", wordBreak: "break-word" }}><span style={{ color: toneOf(t.status) }}>reply · </span>{t.reply}{t.applied != null ? ` (${t.applied} file${t.applied === 1 ? "" : "s"} applied)` : ""}</div>}
                {t.brief && <pre style={{ margin: 0, fontFamily: mono, fontSize: 8.5, color: C.dim, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 100, overflowY: "auto" }}>{t.brief}</pre>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, padding: 8, borderTop: `1px solid ${C.border}` }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder="add a task… (Enter)" style={{ ...inp, flex: 1 }} />
        <button onClick={add} disabled={!draft.trim()} style={{ ...btn, color: draft.trim() ? C.ok : C.muted, borderColor: draft.trim() ? C.ok : C.border }}>+ queue</button>
      </div>
    </div>
  );
}

// ── ⚖ JUDGE PANEL — the ultra plan tried as a TRIBUNAL (operator 2026-07-15:
// "one call to the defender, another to the prosecutor, and a HIGH for the
// judge to analyze the case. Then a full case dashboard"). The three agents
// are fed the whole intent context + the full plan; this pane convenes them
// and renders the verdict, both pleas, and the judge's opinion.
const V_TONE: Record<string, string> = { sound: C.ok, sound_with_revisions: C.warn, not_ready: C.bad };
const V_LABEL: Record<string, string> = { sound: "SOUND", sound_with_revisions: "SOUND · needs revisions", not_ready: "NOT READY" };

// ── tribunal visuals — deterministic SVG drawn from the case data (operator
// 2026-07-15: "make the verdict visual, pretty, like with draws, charts,
// stats. Not just text"). No extra AI: the balance, the gauge and the radar
// are all computed from the pleas + the judge's scores. ────────────────────
const W_VAL: Record<string, number> = { high: 3, medium: 2, low: 1 };
const sideWeight = (args: any[]) => (args ?? []).reduce((s: number, a: any) => s + (W_VAL[a?.weight] ?? 2), 0);
// the scales of justice — the beam tilts toward whichever side argued heavier
function ScalesOfJustice({ balance, tone, defW, proW }: { balance: number; tone: string; defW: number; proW: number }) {
  const t = Math.max(-1, Math.min(1, balance)); const fx = 110, fy = 32, L = 80, drop = 22, r = 15;
  const ly = fy + t * 16, ry = fy - t * 16; // defense (left) drops when the case leans to it
  const pan = (x: number, endY: number, glyph: string, w: number, label: string, col: string) => {
    const py = endY + drop;
    return (<g>
      <line x1={x} y1={endY} x2={x} y2={py - r} stroke={C.dim} strokeWidth={1} />
      <circle cx={x} cy={py} r={r} fill={`color-mix(in oklab, ${col} 18%, ${C.panel})`} stroke={col} strokeWidth={1.5} />
      <text x={x} y={py + 1} textAnchor="middle" dominantBaseline="middle" fontSize={13}>{glyph}</text>
      <text x={x} y={py + r + 9} textAnchor="middle" fontSize={7} fill={col} fontFamily="monospace" fontWeight={700}>{label} · {w}</text>
    </g>);
  };
  return (
    <svg viewBox="0 0 220 118" width="100%" style={{ maxWidth: 232 }}>
      <path d={`M96 104 L110 ${fy} L124 104 Z`} fill={`color-mix(in oklab, ${tone} 14%, transparent)`} stroke={tone} strokeWidth={1} />
      <line x1={80} y1={104} x2={140} y2={104} stroke={tone} strokeWidth={2} strokeLinecap="round" />
      <line x1={fx - L} y1={ly} x2={fx + L} y2={ry} stroke={tone} strokeWidth={3.5} strokeLinecap="round" />
      <circle cx={fx} cy={fy} r={3} fill={tone} />
      {pan(fx - L, ly, "🛡", defW, "def", C.ok)}
      {pan(fx + L, ry, "⚔", proW, "pros", C.bad)}
    </svg>
  );
}
// a semicircle confidence gauge
function Gauge({ value, tone, label }: { value: number; tone: string; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value))); const cx = 50, cy = 50, r = 42;
  const pol = (deg: number): [number, number] => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)];
  const [ex, ey] = pol(180 - 1.8 * v);
  return (
    <svg viewBox="0 0 100 60" width="100%" style={{ maxWidth: 118 }}>
      <path d={`M 8 50 A ${r} ${r} 0 0 1 92 50`} fill="none" stroke={C.border} strokeWidth={7} strokeLinecap="round" />
      {v > 0 && <path d={`M 8 50 A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke={tone} strokeWidth={7} strokeLinecap="round" />}
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize={19} fontFamily="monospace" fontWeight={800} fill={tone}>{v}</text>
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize={7} fontFamily="monospace" fill={C.dim}>{label}</text>
    </svg>
  );
}
// the dimension scorecard as a radar / spider chart
function Radar({ dims, tone }: { dims: any[]; tone: string }) {
  // wide viewBox + modest radius so the radial name+score labels never clip
  const cx = 130, cy = 82, R = 48, N = dims.length;
  const ang = (i: number) => ((-90 + (i * 360) / N) * Math.PI) / 180;
  const pt = (i: number, s: number): [number, number] => [cx + ((R * s) / 100) * Math.cos(ang(i)), cy + ((R * s) / 100) * Math.sin(ang(i))];
  const poly = (s: (i: number) => number) => dims.map((_, i) => pt(i, s(i)).join(",")).join(" ");
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  return (
    <svg viewBox="0 0 260 166" width="100%" style={{ maxWidth: 340 }}>
      {[25, 50, 75, 100].map((rr) => <polygon key={rr} points={poly(() => rr)} fill="none" stroke={C.border} strokeWidth={0.7} opacity={0.6} />)}
      {dims.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={C.border} strokeWidth={0.6} opacity={0.5} />; })}
      <polygon points={poly((i) => clamp(dims[i].score))} fill={`color-mix(in oklab, ${tone} 22%, transparent)`} stroke={tone} strokeWidth={1.6} />
      {dims.map((d, i) => { const [x, y] = pt(i, clamp(d.score)); return <circle key={i} cx={x} cy={y} r={2.3} fill={tone} />; })}
      {dims.map((d, i) => {
        const [x, y] = pt(i, 121); const c = Math.cos(ang(i));
        const anchor = c > 0.3 ? "start" : c < -0.3 ? "end" : "middle";
        return <text key={i} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" fontSize={7.5} fontFamily="monospace" fill={C.muted}>{d.name} <tspan fill={tone} fontWeight={700}>{d.score}</tspan>{d.note ? <title>{d.note}</title> : null}</text>;
      })}
    </svg>
  );
}

// a discrete "?" that explains a widget on hover (operator 2026-07-16). Native
// title tooltip — a widget renders deterministically AND says what it is.
function Help({ t }: { t: string }) {
  return <span title={t} style={{ cursor: "help", fontFamily: mono, fontSize: 7.5, fontWeight: 800, color: C.dim, border: `1px solid ${C.border}`, borderRadius: "50%", width: 12, height: 12, minWidth: 12, display: "inline-grid", placeItems: "center", flexShrink: 0, lineHeight: 1 }}>?</span>;
}
// one flex header row: an uppercase label + its help dot
function WHead({ label, t, color }: { label: string; t: string; color?: string }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ ...head, color: color ?? C.dim }}>{label}</span><Help t={t} /></div>;
}

// the argument-balance bar — the exact proportion behind the tilting scales
function ArgBalance({ defW, proW }: { defW: number; proW: number }) {
  const total = defW + proW;
  const dp = total ? Math.round((defW / total) * 100) : 50; const pp = 100 - dp;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 7.5 }}>
        <span style={{ color: C.ok }}>🛡 {defW}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>argument weight <Help t="The exact weight split behind the tilting scales — defense vs prosecution argument strength (high=3, med=2, low=1)." /></span>
        <span style={{ color: C.bad }}>{proW} ⚔</span>
      </div>
      <div style={{ display: "flex", height: 13, borderRadius: 7, overflow: "hidden", border: `1px solid ${C.border}` }}>
        <div style={{ width: `${dp}%`, background: C.ok, display: "grid", placeItems: "center" }}>{dp >= 16 && <span style={{ fontFamily: mono, fontSize: 7, color: C.bg, fontWeight: 800 }}>{dp}%</span>}</div>
        <div style={{ width: `${pp}%`, background: C.bad, display: "grid", placeItems: "center" }}>{pp >= 16 && <span style={{ fontFamily: mono, fontSize: 7, color: C.bg, fontWeight: 800 }}>{pp}%</span>}</div>
      </div>
    </div>
  );
}
// the composition of the judge's proposed edits, as one stacked bar
function ChangesBar({ add, update, remove }: { add: number; update: number; remove: number }) {
  const total = add + update + remove;
  const seg = (n: number, col: string, label: string) => n > 0 ? <div key={label} title={`${label}: ${n}`} style={{ width: `${(n / (total || 1)) * 100}%`, background: col, display: "grid", placeItems: "center" }}>{n / (total || 1) >= 0.16 && <span style={{ fontFamily: mono, fontSize: 7, color: C.bg, fontWeight: 800 }}>{n}</span>}</div> : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 7.5, color: C.dim }}><span style={{ display: "inline-flex", alignItems: "center", gap: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>proposed edits <Help t="The make-up of the judge's proposed tree edits — new nodes vs edits vs cuts." /></span><span>{total}</span></div>
      <div style={{ display: "flex", height: 13, borderRadius: 7, overflow: "hidden", border: `1px solid ${C.border}` }}>
        {seg(add, C.ok, "add")}{seg(update, C.brand, "update")}{seg(remove, C.bad, "remove")}
        {total === 0 && <div style={{ flex: 1, display: "grid", placeItems: "center", fontFamily: mono, fontSize: 7, color: C.dim }}>none proposed</div>}
      </div>
      <div style={{ display: "flex", gap: 9, fontFamily: mono, fontSize: 7 }}>
        <span style={{ color: C.ok }}>✚ {add} new</span><span style={{ color: C.brand }}>✎ {update} edit</span><span style={{ color: C.bad }}>✖ {remove} cut</span>
      </div>
    </div>
  );
}

// node-coverage ring — compact: a small dial beside its numbers
function CoverageRing({ touched, total, added }: { touched: number; total: number; added: number }) {
  const pct = total ? Math.round((touched / total) * 100) : 0;
  const r = 15, circ = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={head}>◔ node coverage</span><Help t="What share of the plan's existing nodes the judge's edits touch (updates + removals). Higher = a more sweeping ruling." /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <svg viewBox="0 0 40 40" width={40} height={40} style={{ flexShrink: 0 }}>
          <circle cx={20} cy={20} r={r} fill="none" stroke={C.border} strokeWidth={5} />
          <circle cx={20} cy={20} r={r} fill="none" stroke={pct >= 60 ? C.warn : C.brand} strokeWidth={5} strokeLinecap="round" strokeDasharray={`${(pct / 100) * circ} ${circ}`} transform="rotate(-90 20 20)" />
          <text x={20} y={23.5} textAnchor="middle" fontSize={11} fontWeight={800} fontFamily="monospace" fill={C.fg}>{pct}%</text>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, fontFamily: mono, fontSize: 8, color: C.dim }}>
          <span><b style={{ color: C.fg }}>{touched}</b>/{total} touched</span>
          <span style={{ color: C.ok }}>+{added} new</span>
        </div>
      </div>
    </div>
  );
}
// the extremes — the weakest dimension to fix first, the strongest to keep
function WeakestLink({ weakest, strongest }: { weakest: any; strongest: any }) {
  const tone = (s: number) => s >= 66 ? C.ok : s >= 40 ? C.warn : C.bad;
  const row = (glyph: string, label: string, d: any) => d ? (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11 }}>{glyph}</span>
      <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase" }}>{label}</span>
      <b style={{ fontFamily: nav, fontSize: 10, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</b>
      <span style={{ flex: 1 }} />
      <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 800, color: tone(d.score) }}>{d.score}</span>
    </div>
  ) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <WHead label="the extremes" t="The lowest-scoring dimension to fix first, and the highest to preserve." />
      {row("⚠", "fix first", weakest)}
      {row("💪", "strength", strongest)}
    </div>
  );
}
// argument strength — quality of each side's pleas (high/med/low), not just count
function ArgStrength({ def, pro }: { def: any[]; pro: any[] }) {
  const row = (glyph: string, args: any[], tone: string) => {
    const b = { high: 0, medium: 0, low: 0 } as Record<string, number>;
    for (const a of args) b[a?.weight] = (b[a?.weight] ?? 0) + 1;
    const total = args.length || 1;
    const seg = (n: number, mix: number) => n > 0 ? <div key={mix} title={`${n}`} style={{ width: `${(n / total) * 100}%`, background: mix === 100 ? tone : `color-mix(in oklab, ${tone} ${mix}%, ${C.bg})` }} /> : null;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 10, width: 15 }}>{glyph}</span>
        <div style={{ flex: 1, display: "flex", height: 11, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}` }}>
          {seg(b.high, 100)}{seg(b.medium, 60)}{seg(b.low, 30)}{!args.length && <div style={{ flex: 1 }} />}
        </div>
        <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, width: 12, textAlign: "right" }}>{args.length}</span>
      </div>
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <WHead label="argument strength" t="How strongly each side argued — bars weighted by high/med/low conviction, not just the number of arguments." />
      {row("🛡", def, C.ok)}{row("⚔", pro, C.bad)}
      <span style={{ fontFamily: mono, fontSize: 7, color: C.dim }}>dark = high · faded = low</span>
    </div>
  );
}
// blast radius — what the proposed edits most likely affect, and the risk
function BlastRadius({ branches, siblings, files, removes, score }: { branches: Set<string>; siblings: number; files: Set<string>; removes: number; score: number }) {
  const [label, tone]: [string, string] = score >= 16 ? ["systemic", C.bad] : score >= 9 ? ["wide", C.warn] : score >= 4 ? ["moderate", "oklch(0.80 0.13 90)"] : ["contained", C.ok];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={head}>💥 blast radius</span><Help t="What the proposed edits most likely affect — branches touched, neighbour tasks in those branches, and shared files — scored into a risk level (contained → systemic)." /></div><span style={{ fontFamily: mono, fontSize: 8.5, fontWeight: 800, color: tone, textTransform: "uppercase" }}>{label}</span></div>
      <div style={{ height: 8, background: C.bg, borderRadius: 5, overflow: "hidden" }}><div style={{ width: `${Math.min(100, score * 5)}%`, height: "100%", background: tone, borderRadius: 5 }} /></div>
      <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, lineHeight: 1.5 }}>touches {branches.size} branch{branches.size === 1 ? "" : "es"} · {siblings} neighbour task{siblings === 1 ? "" : "s"} · {files.size} file{files.size === 1 ? "" : "s"}{removes ? ` · ${removes} removal${removes === 1 ? "" : "s"}` : ""}</span>
      {branches.size > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>{[...branches].slice(0, 5).map((b) => <span key={b} style={{ fontFamily: mono, fontSize: 7, color: tone, border: `1px solid ${tone}`, borderRadius: 999, padding: "0 6px", textTransform: "uppercase" }}>{b}</span>)}</div>}
    </div>
  );
}

export function JudgmentPane({ p, panes, sessionId }: { p?: Pane; panes: Pane[]; sessionId: number }) {
  const [caseObj, setCaseObj] = React.useState<any | null>(null);
  const [subject, setSubject] = React.useState(""); // standalone: a free-text thing to judge (no shape tree)
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const { setAiCallId } = useShell();
  // the intent's selected sources ride along so the tribunal reads what the
  // intent read (persisted on the intent pane's settings)
  const intentPane = (p ? sibling(panes, p, ["intent"]) : null) ?? panes.find((x: any) => x.pane_kind === "intent") ?? null;
  const sources = (): string[] => {
    const s = intentPane ? paneSettings(intentPane).wizSrc : null;
    const keys = (s && typeof s === "object") ? Object.keys(s).filter((k) => (s as any)[k]) : [];
    return keys.length ? keys : ["mission", "shared", "digest"];
  };
  // the COURT-SESSION HISTORY — every past convene, newest first (operator
  // 2026-07-16). Loading the latest here is also what makes ESC safe: any
  // instance that (re)mounts pulls the saved session from the history table.
  const [history, setHistory] = React.useState<any[]>([]);
  const [histIdx, setHistIdx] = React.useState(0);
  const loadCase = React.useCallback(async () => {
    const d = unwrap(await apiPost("/api/v1/cockpit/plan/judge", { session_id: sessionId, mode: "tribunal-history" }, { timeoutMs: 30000 }).catch(() => null));
    const sessions: any[] = Array.isArray(d?.sessions) ? d.sessions : [];
    setHistory(sessions);
    if (sessions.length) { setHistIdx(0); setCaseObj(sessions[0].case); }
  }, [sessionId]);
  React.useEffect(() => { void loadCase(); }, [loadCase]);
  // cross-instance sync — a convene in the fullscreen instance refreshes the
  // board-card instance too, so exiting fullscreen (ESC) never shows a stale court
  React.useEffect(() => {
    const h = (e: any) => { if (e?.detail?.sessionId === sessionId) void loadCase(); };
    window.addEventListener("antiloki:tribunal-updated", h as any);
    return () => window.removeEventListener("antiloki:tribunal-updated", h as any);
  }, [sessionId, loadCase]);
  // a READ-ONLY copy of the shape tree — feeds node-coverage + blast-radius
  const shapePaneId: number | undefined = ((p ? sibling(panes, p, ["ultraplan", "breakdown"]) : null) ?? panes.find((x: any) => ["ultraplan", "breakdown"].includes(x.pane_kind)))?.id;
  const [shape, setShape] = React.useState<any | null>(null);
  const refreshShape = React.useCallback(async () => {
    if (!shapePaneId) return;
    const d = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: sessionId, pane_id: shapePaneId }, { timeoutMs: 20000 }).catch(() => null));
    const row = (d?.scratch ?? []).filter((r: any) => r.kind === "shape").pop();
    if (row) { try { setShape(JSON.parse(row.body_md)); } catch { /* corrupt — coverage just stays 0 */ } }
  }, [sessionId, shapePaneId]);
  React.useEffect(() => { void refreshShape(); }, [refreshShape]);
  const convene = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const d = unwrap(await apiPost("/api/v1/cockpit/plan/judge", { session_id: sessionId, mode: "tribunal", sources: sources(), subject: subject.trim() || undefined }, { timeoutMs: 300000 }));
      if (d?.ok === false) setErr(d?.error ?? "the tribunal failed");
      else if (d?.case) { setCaseObj(d.case); setApplied(new Set()); window.dispatchEvent(new CustomEvent("antiloki:tribunal-updated", { detail: { sessionId } })); void loadCase(); }
    } catch (e: any) { setErr(e?.message ?? "unreachable — restart the BE"); }
    setBusy(false);
  };
  // ── APPLY the judge's proposed edits straight onto the shape tree (operator
  // 2026-07-16: "add buttons to each proposal to apply at the tree, and a
  // single one on top to apply all"). Reads the shape row, mutates, writes back,
  // and pings the 🧩 shape pane to reload.
  const [applied, setApplied] = React.useState<Set<string>>(new Set());
  const [applying, setApplying] = React.useState<string | null>(null);
  const applyToTree = async (edits: Array<{ kind: string; data: any }>): Promise<boolean> => {
    const shapePane = (p ? sibling(panes, p, ["ultraplan", "breakdown"]) : null) ?? panes.find((x: any) => ["ultraplan", "breakdown"].includes(x.pane_kind));
    if (!shapePane) { setErr("no 🧩 shape pane on the board to apply onto"); return false; }
    const d = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: sessionId, pane_id: shapePane.id }, { timeoutMs: 20000 }).catch(() => null));
    const row = (d?.scratch ?? []).filter((r: any) => r.kind === "shape").pop();
    if (!row) { setErr("no shape tree grown yet — grow it on the 🧩 shape pane first"); return false; }
    let tree: any; try { tree = JSON.parse(row.body_md); } catch { setErr("the shape tree is unreadable"); return false; }
    if (!Array.isArray(tree.branches)) tree.branches = [];
    const nid = () => Math.random().toString(36).slice(2, 8);
    for (const { kind, data } of edits) {
      if (kind === "add") {
        const b = tree.branches.find((x: any) => x.key === data.branch) ?? tree.branches[0];
        // idempotent — never duplicate a node already present (re-apply after a reload)
        if (b) { if (!Array.isArray(b.nodes)) b.nodes = []; if (!b.nodes.some((n: any) => n.title === data.title)) b.nodes.push({ id: nid(), title: String(data.title ?? "new microtask"), detail: String(data.detail ?? data.why ?? ""), alts: [], chosen: null }); }
      } else if (kind === "update") {
        for (const b of tree.branches) { const n = (b.nodes ?? []).find((x: any) => x.title === data.target); if (n) { n.detail = String(data.change ?? n.detail); break; } }
      } else if (kind === "remove") {
        for (const b of tree.branches) { const i = (b.nodes ?? []).findIndex((x: any) => x.title === data.target); if (i >= 0) { b.nodes.splice(i, 1); break; } }
      }
    }
    await apiPost("/api/v1/cockpit/blackboard/post", { op: "update", id: row.id, body_md: JSON.stringify(tree).slice(0, 19500) }, { timeoutMs: 20000 }).catch(() => null);
    window.dispatchEvent(new CustomEvent("antiloki:shape-reload", { detail: { sessionId } }));
    return true;
  };
  const applyOne = async (key: string, kind: string, data: any) => {
    if (applying || applied.has(key)) return;
    setApplying(key); setErr(null);
    if (await applyToTree([{ kind, data }])) { setApplied((s) => new Set(s).add(key)); void refreshShape(); }
    setApplying(null);
  };
  const applyAll = async (edits: Array<{ key: string; kind: string; data: any }>) => {
    const pending = edits.filter((e) => !applied.has(e.key));
    if (applying || !pending.length) return;
    setApplying("all"); setErr(null);
    if (await applyToTree(pending.map((e) => ({ kind: e.kind, data: e.data })))) { setApplied((s) => { const n = new Set(s); pending.forEach((e) => n.add(e.key)); return n; }); void refreshShape(); }
    setApplying(null);
  };
  const judge = caseObj?.judge; const vt = judge ? (V_TONE[judge.verdict] ?? C.dim) : C.dim;
  // derived, deterministic — the numbers behind the drawings
  const dims: any[] = judge?.dimensions ?? [];
  const defW = sideWeight(caseObj?.defender?.arguments); const proW = sideWeight(caseObj?.prosecutor?.arguments);
  const balance = (defW + proW) ? (defW - proW) / (defW + proW) : 0;
  const leans = Math.abs(balance) < 0.12 ? "finely balanced" : balance > 0 ? "leans to the defense" : "leans to the prosecution";
  const avgScore = dims.length ? Math.round(dims.reduce((s: number, d: any) => s + (d.score ?? 0), 0) / dims.length) : 0;
  const changeN = judge?.changes ? ((judge.changes.add?.length ?? 0) + (judge.changes.update?.length ?? 0) + (judge.changes.remove?.length ?? 0)) : 0;
  // ── shape-derived: readiness, the extremes, node coverage + blast radius ────
  const cAdd: any[] = judge?.changes?.add ?? []; const cUpd: any[] = judge?.changes?.update ?? []; const cRem: any[] = judge?.changes?.remove ?? [];
  const shapeNodes: Array<{ title: string; branch: string; files: string[] }> = React.useMemo(() => {
    const out: any[] = [];
    for (const b of (shape?.branches ?? [])) for (const n of (b.nodes ?? [])) out.push({ title: n.title, branch: b.key, files: Array.isArray(n.files) ? n.files : [] });
    return out;
  }, [shape]);
  const branchOf = (title: string) => shapeNodes.find((n) => n.title === title)?.branch;
  const touchedTitles = new Set<string>([...cUpd, ...cRem].map((c: any) => c.target).filter((t: string) => shapeNodes.some((n) => n.title === t)));
  const totalNodes = shapeNodes.length;
  const touchedBranches = new Set<string>(([...cAdd.map((c: any) => c.branch), ...[...cUpd, ...cRem].map((c: any) => branchOf(c.target))].filter(Boolean)) as string[]);
  const neighborhood = shapeNodes.filter((n) => touchedBranches.has(n.branch) && !touchedTitles.has(n.title)).length;
  const filesAffected = new Set<string>(shapeNodes.filter((n) => touchedTitles.has(n.title)).flatMap((n) => n.files));
  const blastScore = touchedTitles.size * 2 + touchedBranches.size * 2 + neighborhood + filesAffected.size * 2 + cRem.length * 3 + cAdd.length;
  const readiness = Math.round((avgScore * 0.55) + ((judge?.confidence ?? 0) * 0.45));
  const rTone = readiness >= 66 ? C.ok : readiness >= 40 ? C.warn : C.bad;
  const weakest = dims.length ? dims.reduce((a: any, b: any) => (b.score < a.score ? b : a)) : null;
  const strongest = dims.length ? dims.reduce((a: any, b: any) => (b.score > a.score ? b : a)) : null;
  const callChip = (id: number | null | undefined, label: string) => id != null ? (
    <button onClick={() => setAiCallId(id)} title="open the AI-call window — model · tokens · price · envelope" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 7.5, padding: "1px 6px", borderRadius: 999 }}>⌖ {label} #{id}</button>
  ) : null;
  const wBadge = (w: string, tone: string) => (
    <span style={{ fontFamily: mono, fontSize: 6.5, color: tone, opacity: w === "high" ? 1 : w === "medium" ? 0.7 : 0.42, border: `1px solid ${tone}`, borderRadius: 999, padding: "0 4px", textTransform: "uppercase", flexShrink: 0 }}>{w}</span>
  );
  const tagBadge = (tone: string): React.CSSProperties => ({ fontFamily: mono, fontSize: 7, fontWeight: 800, color: C.bg, background: tone, borderRadius: 999, padding: "1px 6px", textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0 });
  const branchChip: React.CSSProperties = { fontFamily: mono, fontSize: 7, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 999, padding: "0 6px", textTransform: "uppercase", flexShrink: 0 };
  const renderPlea = (side: string, glyph: string, data: any, tone: string, tag: string) => (
    <div style={{ flex: "1 1 240px", minWidth: 0, borderLeft: `3px solid ${tone}`, paddingLeft: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13 }}>{glyph}</span>
        <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, color: tone, textTransform: "uppercase", letterSpacing: 0.8 }}>{side}</span>
        <span style={{ flex: 1 }} />
        {callChip(data?.ai_call_id, tag)}
      </div>
      {data?.stance && <div style={{ fontFamily: nav, fontSize: 10.5, color: C.fg, fontStyle: "italic", lineHeight: 1.4 }}>{data.stance}</div>}
      {(data?.arguments ?? []).map((a: any, i: number) => (
        <div key={i} style={{ borderLeft: `2px solid ${tone}`, paddingLeft: 7, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <span style={{ fontFamily: nav, fontSize: 10, fontWeight: 600, color: C.fg, lineHeight: 1.3 }}>{a.claim}</span>
            {a.weight && wBadge(a.weight, tone)}
          </div>
          {a.support && <span style={{ fontFamily: nav, fontSize: 9.5, color: C.muted, lineHeight: 1.45 }}>{a.support}</span>}
        </div>
      ))}
      {data?.strongest && <div style={{ fontFamily: mono, fontSize: 8, color: tone, marginTop: 1, lineHeight: 1.45 }}>◆ strongest: <span style={{ color: C.fg }}>{data.strongest}</span></div>}
      {!(data?.arguments ?? []).length && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, fontStyle: "italic" }}>no arguments parsed</span>}
    </div>
  );
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={head}>⚖ tribunal</span>
        {judge && <span style={{ fontFamily: mono, fontSize: 8.5, fontWeight: 800, color: vt, border: `1px solid ${vt}`, borderRadius: 999, padding: "1px 9px", textTransform: "uppercase", letterSpacing: 0.5 }}>{V_LABEL[judge.verdict] ?? judge.verdict}</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }} title="the tribunal is fed these intent sources + the full plan">ctx: {sources().slice(0, 4).join(" · ")}{sources().length > 4 ? "…" : ""}</span>
        {history.length > 0 && (
          <select value={histIdx} onChange={(e) => { const i = Number(e.target.value); setHistIdx(i); setCaseObj(history[i]?.case ?? null); setApplied(new Set()); }}
            title="the court-session history — retrieve any past ruling (saved, never lost)"
            style={{ background: C.bg, color: histIdx === 0 ? C.ok : C.brand, border: `1px solid ${histIdx === 0 ? C.border : C.brand}`, borderRadius: 7, fontFamily: mono, fontSize: 8.5, padding: "2px 5px", maxWidth: 210, outline: "none", cursor: "pointer" }}>
            {history.map((s: any, i: number) => {
              const w = String(s.created_at ?? "").replace(" ", "T");
              const ts = w ? new Date(w.endsWith("Z") ? w : w + "Z") : null;
              return <option key={s.id} value={i}>🗂 {i === 0 ? "latest" : `#${history.length - i}`} · {(V_LABEL[s.verdict] ?? s.verdict ?? "").split(" ")[0]} · {ts && !isNaN(+ts) ? ts.toLocaleString() : s.created_at}</option>;
            })}
          </select>
        )}
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="standalone: what should it judge?" title="type a free-text subject to judge without a shape tree (passed to the tribunal as the subject)" style={{ ...inp, flex: 1, minWidth: 110, fontSize: 10, marginRight: 5 }} /><button onClick={convene} disabled={busy} title="convene the tribunal — defender + prosecutor (mid) then a HIGH judge, over the whole plan (3 AI calls). Saved as a new court session." style={{ ...btn, color: busy ? C.warn : C.ok, borderColor: busy ? C.warn : C.ok }}>{busy ? "⏳ in session…" : history.length ? "⚖ new session" : "⚖ convene (3 calls)"}</button>
      </div>
      {err && <div style={{ padding: "3px 10px", fontFamily: mono, fontSize: 9.5, color: C.warn }}>{err}</div>}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {(!caseObj || !judge) ? (
          <div style={{ padding: 9, display: "flex", flexDirection: "column", gap: 9 }}>
            {!caseObj && !busy && <span style={padded}>convene the tribunal to try the ultra plan: a <b style={{ color: C.ok }}>defender</b> and a <b style={{ color: C.bad }}>prosecutor</b> argue the case from the whole intent context + the full plan, then a <b style={{ color: C.brand }}>high-tier judge</b> rules. Forge a base plan and grow the shape tree first.</span>}
            {busy && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 4px" }}>
                {[["🛡", "the defender argues it is sound…", C.ok], ["⚔", "the prosecutor argues it is not…", C.bad], ["⚖", "the high judge weighs the case…", C.brand]].map(([g, t, c], i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 10, color: c as string }}><span style={{ fontSize: 14 }}>{g}</span>{t}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "stretch", minHeight: "100%" }}>
          {/* MAIN (left) — the ruling in words + the actions on the tree, a
              single flowing surface (operator 2026-07-16: "no box borders") */}
          <div style={{ flex: 1, minWidth: 0, padding: "12px 15px", display: "flex", flexDirection: "column", gap: 16 }}>
            {/* THE OPINION (left) · THE PROPOSED CHANGES (right) — one row
                (operator 2026-07-16: "place it on the right side of the opinion") */}
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "2 1 340px", minWidth: 0, borderLeft: `3px solid ${vt}`, paddingLeft: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ ...head, color: vt }}>⚖ the opinion</span>
                <span style={{ fontFamily: mono, fontSize: 8, fontWeight: 800, color: vt, border: `1px solid ${vt}`, borderRadius: 999, padding: "0 7px", textTransform: "uppercase" }}>{V_LABEL[judge.verdict] ?? judge.verdict}</span>
                <span style={{ flex: 1 }} />
                {callChip(judge.ai_call_id, "judge")}
              </div>
              {/* the sections are SMALL — they flow 2-up (operator 2026-07-16);
                  only the verdict prose spans the full width */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "8px 18px", alignItems: "start" }}>
              {(judge.evidence ?? []).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ ...head, color: C.muted }}>📋 evidence</span>
                  {judge.evidence.map((e: string, i: number) => <div key={i} style={{ display: "flex", gap: 6, fontFamily: nav, fontSize: 10.5, color: C.fg, lineHeight: 1.4 }}><span style={{ color: C.dim, flexShrink: 0 }}>▪</span><span>{e}</span></div>)}
                </div>
              )}
              {(judge.insights ?? []).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ ...head, color: C.brand }}>💡 insights</span>
                  {judge.insights.map((e: string, i: number) => <div key={i} style={{ display: "flex", gap: 6, fontFamily: nav, fontSize: 10.5, color: C.fg, lineHeight: 1.4 }}><span style={{ color: C.brand, flexShrink: 0 }}>→</span><span>{e}</span></div>)}
                </div>
              )}
              {(judge.opinion || judge.decisive_factor) && (
                <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 3, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                  <span style={{ ...head, color: vt }}>⚖ the verdict</span>
                  {judge.opinion && <div style={{ fontFamily: nav, fontSize: 11.5, color: C.fg, lineHeight: 1.6 }}>{judge.opinion}{judge.parse_ok === false ? <span style={{ color: C.warn }}> …</span> : null}</div>}
                  {judge.decisive_factor && <div style={{ fontFamily: mono, fontSize: 8.5, color: C.brand, lineHeight: 1.5 }}>⚑ decisive: <span style={{ color: C.muted }}>{judge.decisive_factor}</span></div>}
                </div>
              )}
              {(judge.to_approve ?? []).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                  <span style={{ ...head, color: C.warn }}>✅ to approve the tree</span>
                  {judge.to_approve.map((e: string, i: number) => <div key={i} style={{ display: "flex", gap: 6, fontFamily: nav, fontSize: 10.5, color: C.fg, lineHeight: 1.4 }}><span style={{ color: C.warn, flexShrink: 0 }}>☐</span><span>{e}</span></div>)}
                </div>
              )}
              {(judge.preserve ?? []).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                  <span style={{ ...head, color: C.ok }}>✓ preserve</span>
                  {judge.preserve.map((e: string, i: number) => <div key={i} style={{ display: "flex", gap: 6, fontFamily: nav, fontSize: 10.5, color: C.fg, lineHeight: 1.4 }}><span style={{ color: C.ok, flexShrink: 0 }}>✓</span><span>{e}</span></div>)}
                </div>
              )}
              </div>
              {!(judge.evidence ?? []).length && !(judge.insights ?? []).length && !judge.opinion && (<>
                {judge.headline && <div style={{ fontFamily: nav, fontSize: 11, color: C.fg, lineHeight: 1.5 }}>{judge.headline}</div>}
                <div style={{ fontFamily: mono, fontSize: 9, color: C.warn, lineHeight: 1.55 }}>⚠ the reasoning came back {judge.parse_ok === false ? "truncated" : "thin"} — press <b>⚖ retry the case</b>{judge.ai_call_id != null ? ", or open the ⌖ judge call for the raw response" : ""}.</div>
              </>)}
            </div>
          {/* THE PROPOSED CHANGES — borderless, apply onto the shape tree */}
          {(() => {
            const add = judge.changes?.add ?? []; const update = judge.changes?.update ?? []; const remove = judge.changes?.remove ?? [];
            const all: Array<{ key: string; kind: string; data: any }> = [
              ...add.map((c: any, i: number) => ({ key: `add:${i}`, kind: "add", data: c })),
              ...update.map((c: any, i: number) => ({ key: `update:${i}`, kind: "update", data: c })),
              ...remove.map((c: any, i: number) => ({ key: `remove:${i}`, kind: "remove", data: c })),
            ];
            // an always-visible shell — a ruling with no edits says so instead
            // of vanishing (operator 2026-07-16: "the section disappeared")
            if (!all.length) return (
              <div style={{ flex: "1 1 300px", minWidth: 0, borderLeft: `3px solid ${C.border}`, paddingLeft: 12, display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={head}>⚙ proposed changes to the tree</span>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, fontStyle: "italic" }}>this ruling proposed no tree edits — ⚖ retry the case for corrections, or the plan is already sound.</span>
              </div>
            );
            const pendingN = all.filter((e) => !applied.has(e.key)).length;
            const applyBtn = (key: string, kind: string, data: any, tone: string) => {
              const done = applied.has(key);
              return <button onClick={() => void applyOne(key, kind, data)} disabled={done || !!applying} title="apply this edit onto the 🧩 shape tree"
                style={{ flexShrink: 0, background: done ? "transparent" : `color-mix(in oklab, ${tone} 14%, transparent)`, border: `1px solid ${done ? C.border : tone}`, color: done ? C.dim : tone, cursor: done || applying ? "default" : "pointer", fontFamily: mono, fontSize: 8, fontWeight: 700, padding: "2px 8px", borderRadius: 7 }}>{done ? "✓ applied" : applying === key ? "…" : "apply"}</button>;
            };
            return (
              <div style={{ flex: "1 1 300px", minWidth: 0, borderLeft: `3px solid ${C.brand}`, paddingLeft: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={head}>⚙ proposed changes to the tree · {add.length}✚ {update.length}✎ {remove.length}✖</span>
                  <span style={{ flex: 1 }} />
                  <button onClick={() => void applyAll(all)} disabled={!!applying || pendingN === 0} title="apply every proposed edit onto the shape tree at once"
                    style={{ background: pendingN ? `linear-gradient(120deg, ${C.brand}, color-mix(in oklab, ${C.brand} 60%, ${C.ok}))` : "transparent", border: pendingN ? "none" : `1px solid ${C.border}`, color: pendingN ? C.bg : C.dim, cursor: pendingN && !applying ? "pointer" : "default", fontFamily: mono, fontSize: 9, fontWeight: 800, padding: "3px 12px", borderRadius: 8 }}>{applying === "all" ? "⏳ applying…" : pendingN ? `✓ apply all (${pendingN})` : "✓ all applied"}</button>
                </div>
                {add.map((c: any, i: number) => (
                  <div key={"a" + i} style={{ borderLeft: `2.5px solid ${C.ok}`, paddingLeft: 8, display: "flex", flexDirection: "column", gap: 2, opacity: applied.has(`add:${i}`) ? 0.55 : 1 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={tagBadge(C.ok)}>✚ new node</span>
                      {c.branch && <span style={branchChip}>{c.branch}</span>}
                      <b style={{ fontFamily: nav, fontSize: 10.5, color: C.fg }}>{c.title}</b>
                      <span style={{ flex: 1 }} />
                      {applyBtn(`add:${i}`, "add", c, C.ok)}
                    </div>
                    {c.detail && <span style={{ fontFamily: nav, fontSize: 9.5, color: C.muted, lineHeight: 1.4 }}>{c.detail}</span>}
                    {c.why && <span style={{ fontFamily: nav, fontSize: 9.5, color: C.dim, fontStyle: "italic", lineHeight: 1.4 }}>— {c.why}</span>}
                  </div>
                ))}
                {update.map((c: any, i: number) => (
                  <div key={"u" + i} style={{ borderLeft: `2.5px solid ${C.brand}`, paddingLeft: 8, display: "flex", flexDirection: "column", gap: 2, opacity: applied.has(`update:${i}`) ? 0.55 : 1 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={tagBadge(C.brand)}>✎ update</span>
                      <b style={{ fontFamily: nav, fontSize: 10.5, color: C.fg }}>{c.target}</b>
                      <span style={{ flex: 1 }} />
                      {applyBtn(`update:${i}`, "update", c, C.brand)}
                    </div>
                    <span style={{ fontFamily: nav, fontSize: 9.5, color: C.fg, lineHeight: 1.4 }}>→ {c.change}</span>
                    {c.why && <span style={{ fontFamily: nav, fontSize: 9.5, color: C.dim, fontStyle: "italic", lineHeight: 1.4 }}>— {c.why}</span>}
                  </div>
                ))}
                {remove.map((c: any, i: number) => (
                  <div key={"r" + i} style={{ borderLeft: `2.5px solid ${C.bad}`, paddingLeft: 8, display: "flex", flexDirection: "column", gap: 2, opacity: applied.has(`remove:${i}`) ? 0.55 : 1 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={tagBadge(C.bad)}>✖ remove</span>
                      <b style={{ fontFamily: nav, fontSize: 10.5, color: C.muted, textDecoration: "line-through" }}>{c.target}</b>
                      <span style={{ flex: 1 }} />
                      {applyBtn(`remove:${i}`, "remove", c, C.bad)}
                    </div>
                    {c.why && <span style={{ fontFamily: nav, fontSize: 9.5, color: C.dim, fontStyle: "italic", lineHeight: 1.4 }}>— {c.why}</span>}
                  </div>
                ))}
                <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim }}>applies onto the 🧩 shape pane's tree · the pane refreshes live</span>
              </div>
            );
          })()}
          </div>
          {/* THE BLUEPRINT — the pipeline's flow, court-scoped: skeleton →
              stubs → planned graph + delta (operator 2026-07-16) */}
          <div style={{ borderLeft: `3px solid ${C.brand}`, paddingLeft: 12 }}>
            <CodeBlueprint sessionId={sessionId} />
          </div>
            {/* THE TWO PLEAS — adversarial, side by side (in the main column) */}
            <div style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}>
              {renderPlea("defense", "🛡", caseObj.defender, C.ok, "def")}
              {renderPlea("prosecution", "⚔", caseObj.prosecutor, C.bad, "pros")}
            </div>
          </div>
          {/* SIDEBAR (right) — every widget, borderless, thin dividers between */}
          <div style={{ width: 300, flexShrink: 0, borderLeft: `1px solid ${C.border}`, padding: "12px 13px", display: "flex", flexDirection: "column", gap: 13 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "center", textAlign: "center" }}>
              <ScalesOfJustice balance={balance} tone={vt} defW={defW} proW={proW} />
              <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 800, color: vt, border: `1px solid ${vt}`, borderRadius: 999, padding: "2px 11px", textTransform: "uppercase", letterSpacing: 0.5 }}>{V_LABEL[judge.verdict] ?? judge.verdict}</span>
              <div style={{ fontFamily: nav, fontSize: 12, fontWeight: 700, color: C.fg, lineHeight: 1.35 }}>{judge.headline}</div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: mono, fontSize: 8, color: C.dim }}>⚖ the case {leans} <Help t="The scales tilt toward whichever side argued heavier (by total argument weight); the dial is the judge's confidence in the ruling." /></span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 96 }}><Gauge value={judge.confidence} tone={vt} label="confidence" /></div>{callChip(judge.ai_call_id, "judge")}</div>
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 11, display: "flex", flexWrap: "wrap" }}>
              {([
                ["🛡 defense", `${caseObj.defender?.arguments?.length ?? 0} args`, C.ok],
                ["⚔ prosec.", `${caseObj.prosecutor?.arguments?.length ?? 0} args`, C.bad],
                ["⚖ weight", `${defW}–${proW}`, vt],
                ["◎ avg score", `${avgScore}`, avgScore >= 66 ? C.ok : avgScore >= 40 ? C.warn : C.bad],
                ["⚙ changes", `${changeN}`, C.brand],
                ["🌿 branches", `${caseObj.meta?.branches ?? 0}`, C.muted],
              ] as Array<[string, string, string]>).map(([label, value, tone], i) => (
                <div key={i} style={{ flex: "1 1 33%", minWidth: 74, display: "flex", flexDirection: "column", gap: 1, padding: "3px 8px" }}>
                  <span style={{ fontFamily: mono, fontSize: 7, color: C.dim, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap" }}>{label}</span>
                  <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 800, color: tone }}>{value}</span>
                </div>
              ))}
            </div>
            {dims.length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 11, display: "flex", flexDirection: "column", gap: 4 }}>
                <WHead label="the scorecard" t="The plan scored 0–100 across dimensions (scope, risk, feasibility, sequencing, clarity). A bigger, fuller polygon is a stronger plan." />
                {dims.length >= 3 ? (
                  <div style={{ display: "flex", justifyContent: "center" }}><Radar dims={dims} tone={vt} /></div>
                ) : dims.map((d: any, i: number) => (
                  <div key={i} title={d.note} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 84, fontFamily: mono, fontSize: 9, color: C.muted, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                    <div style={{ flex: 1, height: 11, background: C.panel, borderRadius: 6, overflow: "hidden" }}><div style={{ width: `${d.score}%`, height: "100%", background: d.score >= 66 ? C.ok : d.score >= 40 ? C.warn : C.bad, borderRadius: 6 }} /></div>
                    <span style={{ width: 24, fontFamily: mono, fontSize: 9, color: C.fg, textAlign: "right" }}>{d.score}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 11, display: "flex", flexDirection: "column", gap: 3 }}>
              <WHead label="◐ readiness" t="A ship-readiness score blending the dimension scores (55%) with the judge's confidence (45%)." />
              <Gauge value={readiness} tone={rTone} label="ready" />
            </div>
            {dims.length > 0 && <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 11 }}><WeakestLink weakest={weakest} strongest={strongest} /></div>}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 11 }}><ArgBalance defW={defW} proW={proW} /></div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 11 }}><ArgStrength def={caseObj.defender?.arguments ?? []} pro={caseObj.prosecutor?.arguments ?? []} /></div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 11 }}><ChangesBar add={cAdd.length} update={cUpd.length} remove={cRem.length} /></div>
            {changeN > 0 && <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 11 }}><BlastRadius branches={touchedBranches} siblings={neighborhood} files={filesAffected} removes={cRem.length} score={blastScore} /></div>}
            {totalNodes > 0 && <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 11 }}><CoverageRing touched={touchedTitles.size} total={totalNodes} added={cAdd.length} /></div>}
            {caseObj.meta?.tried_at && <span style={{ borderTop: `1px solid ${C.border}`, paddingTop: 9, fontFamily: mono, fontSize: 7.5, color: C.dim }}>tried {new Date(caseObj.meta.tried_at).toLocaleString()}</span>}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 🧭 ORCHESTRATOR pane (operator 2026-07-14: "an orchestration wizard pane to
// manage all — context, goal, etc") — every formation spawns one: the goal
// (renames the frame), the member roster (role · kind · status), the step flow,
// a one-shot context feeder for the whole formation, and ✂ dissolve.
export function OrchestratorPane({ p, panes, sessionId, frames, onRenameFrame, onDissolveFrame }: { p: Pane; panes: Pane[]; sessionId: number; frames: any[]; onRenameFrame: (frameId: number, title: string) => void; onDissolveFrame: (frameId: number) => void }) {
  const col = collectionOf(p);
  const frame = frames.find((f: any) => f.id === col) ?? null;
  const members = panes.filter((x: any) => collectionOf(x) === col && x.id !== p.id);
  const [goal, setGoal] = React.useState<string>(String(frame?.title ?? ""));
  const [ctx, setCtx] = React.useState("");
  const [fed, setFed] = React.useState(false);
  React.useEffect(() => { if (frame?.title) setGoal(frame.title); }, [frame?.title]);
  const feed = async () => {
    if (!ctx.trim()) return;
    await apiPost("/api/v1/cockpit/blackboard/post", { session_id: sessionId, kind: "context", body_md: `FORMATION ${frame?.title ?? "collection"} — shared context:\n${ctx.trim()}` }, { timeoutMs: 20000 });
    setCtx(""); setFed(true); setTimeout(() => setFed(false), 2500);
  };
  const statusDot = (x: any) => x.status === "working" ? C.warn : x.status === "error" ? C.bad : x.status === "merged" ? C.ok : C.dim;
  // 🗺 FLOW VIEW (operator 2026-07-16: "panes are steps — this is orchestration,
  // reminds me of n8n · this canvas is focused on the FULL orchestration of the
  // collection"): the GOAL as the root node, the members chained as steps with
  // arrows, everything draggable like an n8n workflow.
  const [flowView, setFlowView] = React.useState(false);
  // ── the RUNNER (full-n8n): one step per call; the FE pumps the visible
  // auto-advance loop — agent steps fire, tool steps pause for the operator ──
  const [run, setRun] = React.useState<any | null>(null);
  const [runBusy, setRunBusy] = React.useState(false);
  const pumpRef = React.useRef(false);
  const fmOp = React.useCallback(async (op: string) => unwrap(await apiPost("/api/v1/cockpit/formation/run", { session_id: sessionId, col, op }, { timeoutMs: op === "next" ? 240000 : 20000 }).catch(() => null)), [sessionId, col]);
  React.useEffect(() => { if (flowView && col) { void (async () => { const d = await fmOp("status"); if (d?.ok) setRun(d.run); })(); } }, [flowView, col, fmOp]);
  React.useEffect(() => () => { pumpRef.current = false; }, []); // unmount stops the loop
  const pump = async () => {
    if (pumpRef.current) return;
    pumpRef.current = true; setRunBusy(true);
    try {
      for (let i = 0; i < 24 && pumpRef.current; i++) { // hard loop cap — never a runaway
        const d = await fmOp("next");
        if (d?.run) setRun(d.run);
        if (!d?.ok || d.run?.status !== "running") break;
      }
    } finally { pumpRef.current = false; setRunBusy(false); }
  };
  const startRun = async () => { const d = await fmOp("start"); if (d?.ok) { setRun(d.run); void pump(); } };
  const pauseRun = async () => { pumpRef.current = false; const d = await fmOp("pause"); if (d?.ok) setRun(d.run); };
  const resumeRun = async () => { const d = await fmOp("resume"); if (d?.ok) { setRun(d.run); void pump(); } };
  const doneManual = async () => { const d = await fmOp("done-manual"); if (d?.ok) { setRun(d.run); if (d.run?.status === "running") void pump(); } };
  const stepStatus = (paneId: number) => run?.steps?.find((s: any) => s.pane_id === paneId)?.status ?? null;
  const stGlyph: Record<string, string> = { done: "✓ ", running: "⏳ ", waiting_operator: "⏸ ", error: "✗ " };
  const flowCards: BoardCard[] = [
    { id: "goal", label: "🧭 the goal", w: 210, x: 10, y: 110, node: (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontFamily: nav, fontSize: 11, fontWeight: 700, color: C.fg, lineHeight: 1.4 }}>{frame?.title ?? "the formation"}</div>
        <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim }}>{frame?.template ? `formation · ${frame.template}` : "collection"} · {members.length} steps</span>
        {!!members.reduce((s: number, x: any) => s + (x.cost_usd ?? 0), 0) && <span style={{ fontFamily: mono, fontSize: 7.5, color: C.muted }}>total ${members.reduce((s: number, x: any) => s + (x.cost_usd ?? 0), 0).toFixed(3)}</span>}
      </div>
    ) },
    ...members.map((x: any, mi: number) => {
      const ident = (KIND_IDENT as any)[x.pane_kind] ?? { glyph: "▦", color: C.dim };
      const role = String(paneSettings(x).role ?? x.pane_kind);
      return {
        id: `pane:${x.id}`, label: `${stGlyph[stepStatus(x.id) ?? ""] ?? ""}step ${mi + 1} · #${x.idx + 1} ${x.subagent_name}`, w: 218,
        x: 280 + mi * 268, y: 60 + (mi % 2) * 150, // the n8n zigzag
        node: (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 20, height: 20, borderRadius: 5, display: "grid", placeItems: "center", fontSize: 12, background: `color-mix(in oklab, ${ident.color} 16%, transparent)`, border: `1px solid color-mix(in oklab, ${ident.color} 45%, transparent)`, color: ident.color }}>{ident.glyph}</span>
              <span style={{ fontFamily: mono, fontSize: 8, color: ident.color, border: `1px solid ${ident.color}`, borderRadius: 8, padding: "0 6px", textTransform: "uppercase", letterSpacing: 0.6 }}>{role}</span>
              <span style={{ flex: 1 }} />
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusDot(x) }} title={x.status} />
            </div>
            <div style={{ display: "flex", gap: 8, fontFamily: mono, fontSize: 7.5, color: C.dim, flexWrap: "wrap" }}>
              <span>{x.status}</span>
              {x.worktree_path && <span style={{ color: C.ok }} title={x.branch}>⎇ {String(x.branch ?? "worktree").slice(0, 18)}</span>}
              {!!x.cost_usd && <span>${x.cost_usd.toFixed(3)}</span>}
              {!!x.calls && <span>{x.calls} calls</span>}
            </div>
          </div>
        ),
      };
    }),
  ];
  // WIRED edges when the formation was composed (reads/emits on the panes);
  // the plain step chain when it wasn't
  const emitOf = (x: any) => String(paneSettings(x).emit ?? `step:${x.subagent_name}`);
  const byEmit = new Map<string, number>(members.map((x: any) => [emitOf(x), x.id]));
  const wired: BoardEdge[] = members.flatMap((x: any) => (Array.isArray(paneSettings(x).reads) ? paneSettings(x).reads : [])
    .filter((r: string) => String(r).startsWith("step:") && byEmit.has(String(r)) && byEmit.get(String(r)) !== x.id)
    .map((r: string) => ({ from: `pane:${byEmit.get(String(r))}`, to: `pane:${x.id}`, tone: (KIND_IDENT as any)[x.pane_kind]?.color ?? C.brand, label: String(r).slice(5) })));
  const flowEdges: BoardEdge[] = [
    ...(members.length ? [{ from: "goal", to: `pane:${members[0].id}`, tone: C.fg, label: "starts" }] : []),
    ...(wired.length ? wired : members.slice(0, -1).map((x: any, mi: number) => ({ from: `pane:${x.id}`, to: `pane:${members[mi + 1].id}`, tone: (KIND_IDENT as any)[members[mi + 1].pane_kind ?? ""]?.color ?? C.brand, label: `step ${mi + 2}` }))),
  ];
  if (!col) return <div style={padded}>this orchestrator lost its automation — it manages an automation's panes (spawn one from the Automations group).</div>;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 10px", borderBottom: `1px solid ${C.border}` }}>
        <span style={head}>🧭 orchestrator{frame?.template ? ` · ${frame.template}` : ""}</span>
        <span style={{ flex: 1 }} />
        {members.length > 0 && <button onClick={() => setFlowView((v) => !v)} title={flowView ? "back to the list" : "the formation as an n8n-style flow — panes as connected steps"} style={{ ...btn, padding: "1px 8px", fontSize: 9, color: C.brand, borderColor: C.border }}>{flowView ? "☰ list" : "🗺 flow"}</button>}
        <button onClick={() => frame && onDissolveFrame(frame.id)} title="dissolve the formation — the frame goes, every pane stays" style={{ ...btn, padding: "1px 8px", fontSize: 9, color: C.bad, borderColor: C.border }}>✂ dissolve</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 9, display: "flex", flexDirection: "column", gap: 8 }}>
        {/* the GOAL — renames the frame, every member sees it on the board */}
        <div style={{ border: `1.5px solid ${C.fg}`, borderRadius: 10, background: C.panel, padding: 8 }}>
          <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>the goal — names the formation</div>
          <div style={{ display: "flex", gap: 5 }}>
            <input value={goal} onChange={(e) => setGoal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && frame) onRenameFrame(frame.id, goal.trim() || frame.title); }} placeholder="e.g. checkout revamp…" style={{ ...inp, flex: 1, fontSize: 10.5 }} />
            <button onClick={() => frame && onRenameFrame(frame.id, goal.trim() || frame.title)} disabled={!frame || !goal.trim() || goal === frame?.title} style={{ ...btn, padding: "2px 9px", fontSize: 9.5, color: goal !== frame?.title && goal.trim() ? C.ok : C.muted, borderColor: goal !== frame?.title && goal.trim() ? C.ok : C.border }}>save</button>
          </div>
        </div>
        {/* the FORMATION — members as the step flow (list, or the n8n canvas) */}
        <div>
          <div style={{ ...head, marginBottom: 5 }}>the formation · {members.length} panes</div>
          {flowView ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {/* ▶ THE RUN — visible auto-advance: agents fire, tools pause */}
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {(!run || run.status === "idle") && <button onClick={() => void startRun()} disabled={runBusy} title="run the formation — each agent step is one AI turn (its wired inputs ride the brief; its output is emitted for the next steps); tool steps pause for you" style={{ ...btn, fontSize: 9.5, fontWeight: 700, color: C.ok, borderColor: C.ok }}>▶ run formation</button>}
                {run?.status === "running" && <button onClick={() => void pauseRun()} style={{ ...btn, fontSize: 9.5, color: C.warn, borderColor: C.warn }}>{runBusy ? "⏳ firing…" : "⏸ pause"}</button>}
                {run?.status === "paused" && <button onClick={() => void resumeRun()} style={{ ...btn, fontSize: 9.5, color: C.ok, borderColor: C.ok }}>▶ resume</button>}
                {run?.status === "paused_tool" && <button onClick={() => void doneManual()} title="the current step is a TOOL — do it on its pane, then continue" style={{ ...btn, fontSize: 9.5, fontWeight: 700, color: C.warn, borderColor: C.warn }}>✅ step done → continue</button>}
                {run?.status === "error" && <button onClick={() => void resumeRun()} style={{ ...btn, fontSize: 9.5, color: C.bad, borderColor: C.bad }}>↻ retry step</button>}
                {run?.status === "done" && <button onClick={() => void startRun()} style={{ ...btn, fontSize: 9.5, color: C.brand, borderColor: C.brand }}>↻ re-run</button>}
                {run && run.status !== "idle" && (
                  <span style={{ fontFamily: mono, fontSize: 8.5, color: run.status === "done" ? C.ok : run.status === "error" ? C.bad : run.status === "running" ? C.warn : C.muted }}>
                    {run.status === "done" ? "✓ run complete" : run.status === "error" ? `✗ ${run.steps?.[run.current]?.label ?? "step"} failed` : run.status === "paused_tool" ? `⏸ waiting on the ${run.steps?.[run.current]?.label ?? "tool"} pane` : `${run.current}/${run.steps?.length ?? 0} · ${run.steps?.[run.current]?.label ?? ""}`}
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim }}>one AI turn per agent step · cancel any time</span>
              </div>
              <div style={{ height: 430, display: "flex", border: `1px solid ${C.border}`, borderRadius: 9, overflow: "hidden" }}>
                <CanvasBoard boardKey={`orch:${sessionId}:${col}`} cards={flowCards} edges={flowEdges} />
              </div>
            </div>
          ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {members.map((x: any, mi: number) => {
              const ident = (KIND_IDENT as any)[x.pane_kind] ?? { glyph: "▦", color: C.dim };
              const role = String(paneSettings(x).role ?? x.pane_kind);
              return (
                <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 8px", background: C.bg, animation: `vibeRise .3s ${mi * 0.05}s cubic-bezier(.2,.9,.3,1.2) backwards` }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, display: "grid", placeItems: "center", fontSize: 11, background: `color-mix(in oklab, ${ident.color} 16%, transparent)`, border: `1px solid color-mix(in oklab, ${ident.color} 45%, transparent)`, color: ident.color }}>{ident.glyph}</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: C.fg, fontWeight: 600 }}>#{x.idx + 1} {x.subagent_name}</span>
                  <span style={{ fontFamily: mono, fontSize: 8, color: ident.color, border: `1px solid ${ident.color}`, borderRadius: 8, padding: "0 6px", textTransform: "uppercase", letterSpacing: 0.6 }}>{role}</span>
                  {x.worktree_path && <span style={{ fontSize: 9, color: C.ok }} title={x.branch}>⎇</span>}
                  <span style={{ flex: 1 }} />
                  {!!x.cost_usd && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>${x.cost_usd.toFixed(3)}</span>}
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusDot(x) }} title={x.status} />
                </div>
              );
            })}
            {!members.length && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.warn }}>no members found — if the panes failed to spawn (cap?), dissolve and re-create the formation.</span>}
          </div>
          )}
        </div>
        {/* FEED the formation — one shot into the shared memory, prefixed by the goal */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, padding: 8 }}>
          <div style={{ ...head, marginBottom: 4 }}>feed the formation · lands in the shared memory</div>
          <div style={{ display: "flex", gap: 5 }}>
            <input value={ctx} onChange={(e) => setCtx(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void feed(); }} placeholder="constraint, decision, link — every agent reads it…" style={{ ...inp, flex: 1, fontSize: 10 }} />
            <button onClick={() => void feed()} disabled={!ctx.trim()} style={{ ...btn, padding: "2px 9px", fontSize: 9.5, color: fed ? C.ok : ctx.trim() ? C.brand : C.muted, borderColor: fed ? C.ok : C.border }}>{fed ? "✓ fed" : "+ feed"}</button>
          </div>
        </div>
        <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>deep controls live on the member panes — this is the formation's bridge: goal · roster · context. ⛶ context studio for the full memory.</span>
      </div>
    </div>
  );
}
