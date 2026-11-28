// Cockpit — EPIC-VIBE-COCKPIT. The human-driven twin of the swarm: a SUPER-SESSION of N scoped agents, each its
// own saved pane-session in its own git worktree, coordinating via a partitioned blackboard, folded back through a
// gated merge. Each pane = a scoped sub-agent you converse with; edits land only inside the pane's scope.
import { reportScreenState, clearScreenState } from "@/loki/chat/screen-manifest";
import type { Pane } from "@/loki/api/types";
import * as React from "react";
import { apiGet, apiPost, unwrapResult as unwrap } from "@/loki/api/client";
import { C } from "@/loki/theme";
import { useShell } from "@/loki/shell/slug-context";
import { useDockSurface } from "@/loki/shell/dock";
import { markSurfaceMounted, clearSurfaceMounted } from "@/loki/demo/demo-mode";
import { ModeSwitch, ModelPicker } from "../chat/chat-modes";
import { GitGraphPane, ContextPane, CloseWorktreeModal, ContextStudio, NotesPane, StatePane, RunPane, GatePane, SOURCE_GROUPS } from "./cockpit-panes-extra";
import { IssuesPane } from "./issues-pane";
import { BrainstormPane } from "./brainstorm-pane";
import { CodeIdePane, DiagramPane, GraphPane, StandupPane, ShellPane, ReviewPane, RacePane, SessionTimelinePane, DesignPane, DocsSlicePane, SketchPane, FuelPane, NotebookPane, ErrorRadarPane, BugFinderWavePane, ExecutePane, JudgmentPane, OrchestratorPane, paneSettings } from "./cockpit-panes-tools";
import { ShapeTreePane } from "./shape-tree";

// viewer/tool pane kinds: no agent, no own worktree, no grants (docs retired 2026-07-13)
const TOOL_KINDS = ["git", "context", "notes", "state", "run", "gate", "code", "diagram", "graph", "kanban", "standup", "shell", "review", "todo", "race", "timeline", "design", "docs", "sketch", "fuel", "notebook", "radar", "bfw1", "bfw2", "bfw3", "judgment", "intent", "orchestrator"] as const;

// COLLECTION TEMPLATES (wave 2): each is a formation — a typed frame + role-
// stamped panes laid out on a col/row grid. agent slots carry a vibe persona
// (provisioned worktree); exec = the swarm queue worktree (auto-apply).
// step/reads/emit = the WIRING a composed formation carries (🧪 composer):
// run order + input channels + the output tag the runner emits under.
type ColSlot = { kind: string; role: string; label: string; col: number; row: number; agent?: string; exec?: boolean; step?: number; reads?: string[]; emit?: string };
const ORCH = (label = "orchestrator"): ColSlot => ({ kind: "orchestrator", role: "orchestrator", label, col: 0, row: 0 });
const COLLECTION_TEMPLATES: Record<string, { title: string; cols: number; rows: number; slots: ColSlot[] }> = {
  // ULTRA PLAN (operator 2026-07-15, renamed from "ultra dev"): the collection's
  // goal is the PLAN — intent (with the brainstorm wizard) → shape (the tree)
  // → judged; its product is an RFC doc every agent receives. The 🌳 plan
  // pane left the formation (operator: "shape has the decision tree — take
  // out the decision tab") — the ✨ forge auto-creates one beside the frame
  // when needed, and 🌳 stays available standalone in the gallery.
  "ultra-dev": { title: "ultra plan", cols: 2, rows: 3, slots: [
    ORCH(),
    { kind: "intent", role: "intent", label: "brainstorm", col: 0, row: 1 },
    { kind: "ultraplan", role: "shape", label: "shape", col: 1, row: 1 },
    { kind: "judgment", role: "judge", label: "judge", col: 0, row: 2 },
  ] },
  "bug-hunt": { title: "bug hunt", cols: 2, rows: 3, slots: [
    ORCH(),
    { kind: "radar", role: "radar", label: "radar", col: 0, row: 1 },
    { kind: "agent", role: "hunter", label: "patch", col: 1, row: 1, agent: "patch" },
    { kind: "gate", role: "gate", label: "gate", col: 0, row: 2 },
    { kind: "judgment", role: "judge", label: "judge", col: 1, row: 2 },
  ] },
  // BUG FINDER (operator 2026-07-17): the 3-wave defect gate as an automation —
  // each wave is a pane, wired to share one run through the blackboard handoff.
  // Wave 1 (determinism · $0) opens the run; waves 2 (shards) + 3 (sweep) append.
  "bug-finder": { title: "bug finder", cols: 2, rows: 3, slots: [
    ORCH(),
    { kind: "bfw1", role: "wave1", label: "wave 1 · $0", col: 0, row: 1, step: 1, emit: "bugfinder-run" },
    { kind: "bfw2", role: "wave2", label: "wave 2 · shards", col: 1, row: 1, step: 2, reads: ["bugfinder-run"], emit: "bugfinder-run" },
    { kind: "bfw3", role: "wave3", label: "wave 3 · sweep", col: 0, row: 2, step: 3, reads: ["bugfinder-run"], emit: "bugfinder-run" },
  ] },
  "bake-off": { title: "bake-off", cols: 3, rows: 3, slots: [
    ORCH(),
    { kind: "race", role: "referee", label: "race", col: 0, row: 1 },
    { kind: "agent", role: "lane", label: "forge·lane", col: 1, row: 1, agent: "forge" },
    { kind: "agent", role: "lane", label: "prism·lane", col: 2, row: 1, agent: "prism" },
    { kind: "review", role: "review", label: "review", col: 0, row: 2 },
    { kind: "judgment", role: "judge", label: "judge", col: 1, row: 2 },
  ] },
  "design-studio": { title: "design studio", cols: 2, rows: 3, slots: [
    ORCH(),
    { kind: "design", role: "canvas", label: "canvas", col: 0, row: 1 },
    { kind: "agent", role: "muse", label: "muse", col: 1, row: 1, agent: "muse" },
    { kind: "run", role: "run", label: "run", col: 0, row: 2 },
    { kind: "judgment", role: "judge", label: "judge", col: 1, row: 2 },
  ] },
  "understanding-lab": { title: "understanding lab", cols: 2, rows: 3, slots: [
    ORCH(),
    { kind: "notebook", role: "notebook", label: "notebook", col: 0, row: 1 },
    { kind: "docs", role: "docs", label: "docs", col: 1, row: 1 },
    { kind: "graph", role: "graph", label: "graph", col: 0, row: 2 },
    { kind: "agent", role: "scout", label: "sage", col: 1, row: 2, agent: "sage" },
  ] },
  "release-check": { title: "release check", cols: 2, rows: 3, slots: [
    ORCH(),
    { kind: "review", role: "review", label: "review", col: 0, row: 1 },
    { kind: "gate", role: "gate", label: "gate", col: 1, row: 1 },
    { kind: "fuel", role: "fuel", label: "fuel", col: 0, row: 2 },
    { kind: "timeline", role: "audit", label: "timeline", col: 1, row: 2 },
  ] },
};
import { PANE_KINDS, PaneCard, VIBE_AGENTS, KIND_IDENT } from "./pane-gallery";
import { FormationComposer } from "./formation-composer";
import { registerHere, type StoreItem } from "@/loki/shell/command-store-registry";
import { PaneChatThread } from "./pane-chat-thread";
import { OpencodePane } from "./opencode-pane";
import { isEnginePaneKind, isSubscriptionPaneKind } from "@/loki/api/engine";
import { paneDisplay } from "@/loki/widgets/types";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 11, padding: "3px 10px", borderRadius: 5 };
const inp: React.CSSProperties = { background: C.bg, border: `1px solid ${C.border}`, color: C.fg, fontFamily: mono, fontSize: 11, padding: "4px 8px", borderRadius: 5, outline: "none" };
const padded: React.CSSProperties = { padding: "16px 4px", color: C.muted, fontStyle: "italic", fontFamily: mono, fontSize: 12 };
const statusColor = (s: string) => (s === "working" ? C.warn : s === "error" ? C.bad : s === "merged" ? C.ok : C.muted);

// ── BOARD COMMENTS (operator 2026-07-16: "excalidraw-style comments with
// arrows connected to panes, binded panes or groups") — hand-written sticky
// notes on the canvas; each may point a bowed arrow at a pane, a whole book,
// or a group frame. The arrow re-anchors live as its target drags. ──
const CMT_W = 200;
const CMT_FONT = '"Segoe Print", "Comic Sans MS", "Chalkboard SE", cursive';
type CmtRect = { x: number; y: number; w: number; h: number };
// where the center→target ray leaves a box — arrows meet boxes at their edge, never the center
const rectEdgePt = (r: CmtRect, tx: number, ty: number) => {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const t = Math.min(dx ? r.w / 2 / Math.abs(dx) : Infinity, dy ? r.h / 2 / Math.abs(dy) : Infinity);
  return { x: cx + dx * t, y: cy + dy * t };
};
const cmtArrow = (from: CmtRect, to: CmtRect, bowSign: number) => {
  const a = rectEdgePt(from, to.x + to.w / 2, to.y + to.h / 2);
  const raw = rectEdgePt(to, from.x + from.w / 2, from.y + from.h / 2);
  const dx = raw.x - a.x, dy = raw.y - a.y; const len = Math.hypot(dx, dy) || 1;
  const b = { x: raw.x - (dx / len) * 7, y: raw.y - (dy / len) * 7 }; // land just off the target box
  const bow = Math.min(48, len * 0.18) * bowSign;
  const mx = (a.x + b.x) / 2 - (dy / len) * bow, my = (a.y + b.y) / 2 + (dx / len) * bow;
  const ang = Math.atan2(b.y - my, b.x - mx); const V = 0.5, L = 9; // open-V head along the tip tangent
  return {
    d: `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`,
    head: `M ${b.x - L * Math.cos(ang - V)} ${b.y - L * Math.sin(ang - V)} L ${b.x} ${b.y} L ${b.x - L * Math.cos(ang + V)} ${b.y - L * Math.sin(ang + V)}`,
  };
};

type Note = { id: number; pane_id: number; body_md: string; created_at: string };
export type Entry = { path: string; dir: boolean };
const MAIN_AGENTS = ["dev", "qa", "pl", "tl", "man"]; // the base identities a pane can inherit (only the mains for now)

// FileTree — the WHOLE codebase (folders + files, indented) as themed checkboxes to define scope. A folder writes
// `folder/**`; a file writes its exact path. CHECKING A FOLDER cascades: everything below it reads as checked
// (covered by the glob). Filter narrows; the text box stays for custom globs.
// COLLAPSED BY DEFAULT (operator 2026-09-16): folders start closed — ▸ opens one level, ▾ closes it; the
// ancestors of anything already in the scope start open so the selection is visible. A filter shows matches flat.
export const parentDirs = (p: string): string[] => { const out: string[] = []; const parts = p.split("/"); for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("/")); return out; };
export function visibleEntries(entries: Entry[], open: Set<string>): Entry[] {
  return entries.filter((e) => parentDirs(e.path).every((d) => open.has(d)));
}
/** ≈tokens under a path: a file's own count, a folder's sum. */
export function tokensUnder(tokens: Record<string, number> | undefined, path: string, dir: boolean): number | null {
  if (!tokens) return null;
  if (!dir) return tokens[path] ?? null;
  let sum = 0; let any = false;
  const prefix = path + "/";
  for (const k in tokens) if (k.startsWith(prefix)) { sum += tokens[k]; any = true; }
  return any ? sum : null;
}
const fmtTokShort = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
/** ≈tokens per FOLDER, summed once per token map (2026-09-20): the per-row scan of every file
 *  (600 rows × thousands of keys, on every keystroke) froze the picker on a big repository. */
export function folderTokens(tokens: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!tokens) return out;
  for (const k in tokens) {
    const n = tokens[k]; if (!Number.isFinite(n)) continue;
    let i = k.lastIndexOf("/");
    while (i > 0) { const d = k.slice(0, i); out[d] = (out[d] ?? 0) + n; i = k.lastIndexOf("/", i - 1); }
  }
  return out;
}
/** THE SCOPE GLOBS AFTER UNTICKING ONE ENTRY (Grokbot QA 2026-10-12, item 9: "unchecking a nested child under a `**` parent does not exclude it; the first uncheck even ADDS it to the scope string").
 *  An entry can be ticked in two ways: its own token is in the list (drop it), or a folder glob above it covers it. In the second case the covering glob is spelled out as that folder's direct
 *  children, the one holding the entry is expanded again, and so on down to the entry itself - so everything else stays ticked. `**` (the whole project) is the top-level entries. Pure - tested. */
export function scopeWithout(globs: string[], entries: Entry[], e: Entry): string[] {
  const tokenOf = (x: Entry) => (x.dir ? `${x.path}/**` : x.path);
  let cur = globs.includes("**") ? entries.filter((x) => !x.path.includes("/")).map(tokenOf) : globs.slice();
  for (let guard = 0; guard < 64; guard += 1) {
    const t = tokenOf(e);
    if (cur.includes(t)) return cur.filter((x) => x !== t);
    // the deepest folder glob that covers this entry (not the entry's own token)
    let cover: string | null = null;
    for (const g of cur) {
      if (!g.endsWith("/**")) continue;
      const base = g.slice(0, -2);                                   // "client/"
      if (!(e.path + "/").startsWith(base) || base === e.path + "/") continue;
      if (cover == null || base.length > cover.length - 2) cover = g;
    }
    if (cover == null) return cur;                                    // not covered by anything: nothing to untick
    const parent = cover.slice(0, -3);                                // "client"
    const kids = entries.filter((x) => x.path.startsWith(parent + "/") && !x.path.slice(parent.length + 1).includes("/")).map(tokenOf);
    if (kids.length === 0) return cur.filter((x) => x !== cover);     // a folder the tree knows nothing inside of: unticking its child can only mean dropping it
    cur = cur.filter((x) => x !== cover).concat(kids);
  }
  return cur;
}
const normGlobs = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean).join(", ");
export function FileTree({ value, onChange, entries, tokens }: { value: string; onChange: (v: string) => void; entries: Entry[]; tokens?: Record<string, number> }) {
  const [filter, setFilter] = React.useState("");
  const dirTok = React.useMemo(() => folderTokens(tokens), [tokens]);
  const tokOf = (e: Entry): number | null => (!tokens ? null : e.dir ? (dirTok[e.path] ?? null) : (tokens[e.path] ?? null));
  const globs = value.split(",").map((s) => s.trim()).filter(Boolean);
  const tokenFor = (e: Entry) => (e.dir ? `${e.path}/**` : e.path);
  const dirBase = (g: string) => (g.endsWith("/**") ? g.slice(0, -2) : null); // "src/ui/"
  // checked if its exact token is selected OR a parent folder glob covers it (cascade)
  const checked = (e: Entry) => globs.includes("**") || globs.includes(tokenFor(e)) || globs.some((g) => { const b = dirBase(g); return b != null && (e.path + "/").startsWith(b); });
  const toggle = (e: Entry) => {
    // ticked (its own token, or a folder / `**` above it covers it) -> unticking spells the cover out and leaves the entry out; not ticked -> add its token
    if (checked(e)) onChange(scopeWithout(globs, entries, e).join(", "));
    else onChange([...globs, tokenFor(e)].join(", "));
  };
  // THE TEXT BOX KEEPS WHAT WAS TYPED (item 10: "the field re-parses on every keystroke, so typing `client/src/**, server/src/**` drops characters and commas"). `value` is the parsed list joined back, which
  // strips a trailing comma or space as it is typed; the box holds its own text and takes the parent's only when it says something different.
  const [text, setText] = React.useState(value);
  React.useEffect(() => { setText((t) => (normGlobs(t) === normGlobs(value) ? t : value)); }, [value]);
  // expansion: the ancestors of every selected glob start open, everything else closed
  const [open, setOpen] = React.useState<Set<string>>(() => new Set(globs.flatMap((g) => parentDirs(g.replace(/\/\*\*$/, "")))));
  const toggleOpen = (path: string) => setOpen((s) => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n; });
  const shown = React.useMemo(() => (filter ? entries.filter((e) => e.path.toLowerCase().includes(filter.toLowerCase())) : visibleEntries(entries, open)).slice(0, 600), [entries, filter, open]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter files / folders…" style={{ ...inp }} />
      <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 6px" }}>
        {entries.length === 0 && <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, padding: 4 }}>no atlas for this workspace yet — rebuild the codebase atlas to pick from files, or type globs below.</div>}
        {shown.map((e, i) => { const depth = filter ? 0 : e.path.split("/").length - 1; const ck = checked(e); const isOpen = open.has(e.path); const tk = tokOf(e); return (
          <div key={e.path + i} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 10, color: ck ? C.brand : (e.dir ? C.muted : C.dim), cursor: "pointer", whiteSpace: "nowrap", padding: "1px 0 1px " + (depth * 12) }} title={filter ? e.path : undefined}>
            <span onClick={() => toggle(e)} style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${ck ? C.brand : C.border}`, background: ck ? C.brand : "transparent", display: "inline-grid", placeItems: "center", flex: "none" }}>{ck && <span style={{ color: C.bg, fontSize: 9, lineHeight: 1 }}>✓</span>}</span>
            {e.dir
              ? <span onClick={() => (filter ? toggle(e) : toggleOpen(e.path))} title={filter ? e.path : `${e.path} — click to ${isOpen ? "collapse" : "expand"}`} style={{ display: "inline-flex", gap: 4 }}><span style={{ width: 10, display: "inline-block", color: C.dim }}>{isOpen ? "▾" : "▸"}</span>{filter ? e.path : e.path.split("/").pop()}</span>
              : <span onClick={() => toggle(e)} title={e.path}>{filter ? e.path : e.path.split("/").pop()}</span>}
            {tk != null && <span style={{ fontFamily: mono, fontSize: 8, color: C.muted, opacity: 0.75 }} title={`≈ ${tk.toLocaleString()} tokens${e.dir ? " under this folder" : ""} (bytes/4)`}>~{fmtTokShort(tk)}</span>}
          </div>
        ); })}
        {shown.length >= 600 && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, padding: 4 }}>showing 600 — use the filter to narrow.</div>}
      </div>
      <input value={text} onChange={(e) => { setText(e.target.value); onChange(e.target.value); }} placeholder="scope globs (comma-sep) — e.g. src/ui/**" style={{ ...inp }} />
    </div>
  );
}

export function CockpitView({ mode, setMode }: any = {}) {
  // demo-mode surface announce — render-time, so the mount fetches see it
  markSurfaceMounted("canvas");
  React.useEffect(() => () => clearSurfaceMounted("canvas"), []);
  const [sessions, setSessions] = React.useState<any[]>([]);
  // vibe = the whole screen: collapse the main rail to icons while mounted.
  const { setRailCollapsed } = useShell();
  // OPTIMISTIC SPAWN (plan S2): the pane appears the moment you press create;
  // the server provisions in the background and the 1.2s poll reconciles the
  // ghost away. No more staring at a form for up to 120 seconds.
  const [ghosts, setGhosts] = React.useState<{ key: number; name: string; kind: string }[]>([]);
  const [studioOpen, setStudioOpen] = React.useState(false);
  const [sessOpen, setSessOpen] = React.useState(false);
  // LEGIBILITY (approved wave 2026-07-14): pane pulse + ⚡ attention + the jump
  // ring. The screen's live features surface in the UNIFIED ⌘K store now
  // (operator: "replace both ctrl+ks with a single window") via registerHere.
  const [flashPane, setFlashPane] = React.useState<number | null>(null); // jump-target ring
  const attIxRef = React.useRef(0); // ⚡ cycles through attention panes
  const [sid, setSid] = React.useState<number | null>(null);
  // collapse the rail only INSIDE a session (operator 2026-07-14) — the
  // dashboard keeps the full sidebar; the board gets the immersive width
  React.useEffect(() => { setRailCollapsed(sid != null); return () => setRailCollapsed(false); }, [sid, setRailCollapsed]);
  const [data, setData] = React.useState<any>(null);
  const [overview, setOverview] = React.useState<any>(null);
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [mission, setMission] = React.useState("");
  const [base, setBase] = React.useState("dev");
  const [compose, setCompose] = React.useState<Record<number, string>>({});
  const [busy, setBusy] = React.useState<Record<number, boolean>>({});
  // per-pane last-turn process info (operator 2026-07-06: "didn't show the process") —
  // the AI call id (clickable), what got planned/applied/rejected, parse warnings.
  const [lastTurn, setLastTurn] = React.useState<Record<number, any>>({});
  const [agents, setAgents] = React.useState<any[]>([]);
  const [atlasNodes, setAtlasNodes] = React.useState<any[]>([]);
  const [fileTok, setFileTok] = React.useState<Record<string, number> | null>(null);
  const [integ, setInteg] = React.useState<any>(null);
  // BOARD CANVAS (operator 2026-07-14: "navigate any direction… groups… zoom"):
  // free pane positions (settings.x/y), group frames (session.board_json), zoom.
  const [zoom, setZoom] = React.useState(1);
  const [boardPos, setBoardPos] = React.useState<Record<number, { x: number; y: number }>>({});
  const [frames, setFrames] = React.useState<any[]>([]);
  const [editingFrame, setEditingFrame] = React.useState<number | null>(null);
  const [boardDrag, setBoardDrag] = React.useState(false);
  const moveRef = React.useRef<any>(null); // { kind:'pane'|'frame'|'resize'|'marquee'|'bindline', ... }
  // INTERACTIONS (operator 2026-07-14): marquee multi-select, header-drag,
  // edge BINDING (a book of up to 6 panes), fullscreen (+ book tabs).
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [hoverCard, setHoverCard] = React.useState<number | null>(null);
  const [hoverHead, setHoverHead] = React.useState<number | null>(null);
  const [marqueeBox, setMarqueeBox] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [bindLine, setBindLine] = React.useState<{ fromId: number; x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [binds, setBinds] = React.useState<number[][]>([]);
  // COMMENTS: sticky notes {id,x,y,text,color,target?:{kind:'pane'|'bind'|'frame',id}} —
  // persisted in board_json beside frames/binds/splits ('bind' stores a MEMBER
  // pane id; the book resolves via bindOf at render, falling back to the pane).
  const [comments, setComments] = React.useState<any[]>([]);
  const [editingCmt, setEditingCmt] = React.useState<number | null>(null);
  const [hoverCmt, setHoverCmt] = React.useState<number | null>(null);
  const [noteLine, setNoteLine] = React.useState<{ fromId: number; x1: number; y1: number; x2: number; y2: number } | null>(null);
  const cmtHRef = React.useRef<Record<number, number>>({}); // measured note heights → arrow anchors
  const [, cmtTick] = React.useReducer((n) => n + 1, 0);
  const [splits, setSplits] = React.useState<any[]>([]); // fullscreen SPLIT tabs: {cols, cells:[{id,w,h}]} (legacy: number[])
  const splitCellDrag = React.useRef<number | null>(null); // dragged cell index (reorder)
  const [splitDragFrom, setSplitDragFrom] = React.useState<number | null>(null); // renders the slot affordances
  const [splitDragOver, setSplitDragOver] = React.useState<number | null>(null);
  const [splitDraft, setSplitDraft] = React.useState<number[] | null>(null); // the ＋ builder
  const [fullscreen, setFullscreen] = React.useState<{ pane?: number; bind?: number; tab?: number } | null>(null);
  // GO-TO-PANE hook (operator 2026-07-15: after ✨ forge, jump to the 🧩 shape
  // pane so its growing tree is front-and-center). Fired via window so any
  // child pane can request focus without prop-drilling.
  React.useEffect(() => {
    (window as any).antilokiFocusPane = (paneId: number) => { if (Number.isFinite(paneId)) setFullscreen({ pane: Number(paneId) }); };
    return () => { delete (window as any).antilokiFocusPane; };
  }, []);
  // DECKS (operator 2026-07-14: collections as overlapping CARDS — one active,
  // the rest as vertical spines; hover peeks, click brings to top).
  const [deckActive, setDeckActive] = React.useState<Record<number, number>>({});
  const [spineHover, setSpineHover] = React.useState<number | null>(null);
  React.useEffect(() => {
    // ctrl+wheel zooms THE CANVAS ONLY — must be a NATIVE non-passive listener:
    // React attaches onWheel passively, preventDefault was ignored and the
    // browser page-zoom fired alongside (live bug: "zooming affects the screen").
    // DOCUMENT-level, attached once while vibe is mounted (rounds 1–3 all lost to
    // attachment timing on element listeners). ctrl+wheel anywhere on the vibe
    // screen: browser page-zoom suppressed; the CANVAS zooms only when the cursor
    // is over the board. NOTE: a page-zoom level the old bug already set persists
    // in the browser until Ctrl+0.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      if (!rootRef.current || !rootRef.current.contains(e.target as Node)) return;
      e.preventDefault();
      if (boardRef.current && boardRef.current.contains(e.target as Node)) {
        setZoom((z) => Math.min(1.5, Math.max(0.4, Math.round((z - Math.sign(e.deltaY) * 0.1) * 10) / 10)));
      }
    };
    console.log("[vibe] zoom-guard v4 armed (document-level, non-passive)");
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);
  const bindOf = (paneId: number) => binds.findIndex((b) => b.includes(paneId));
  React.useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(null);
      if (fullscreen.bind != null && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        const ids = binds[fullscreen.bind] ?? [];
        const cellsOf = (sp: any) => (Array.isArray(sp) ? sp : (sp?.cells ?? []).map((c2: any) => c2.id));
        const len = ids.length + splits.filter((sp) => { const cs = cellsOf(sp); return cs.length && cs.every((id: number) => ids.includes(id)); }).length;
        if (!len) return;
        setFullscreen((f) => f ? { ...f, tab: (((f.tab ?? 0) + (e.key === "ArrowRight" ? 1 : -1)) % len + len) % len } : f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, binds, splits]);
  // the canvas may be TRANSLATED to give negative-territory panes scroll space
  // (set during board render, read by every client→canvas conversion)
  const offRef = React.useRef({ x: 0, y: 0 });
  const canvasPt = (e: { clientX: number; clientY: number }) => {
    const el = boardRef.current; if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left + el.scrollLeft) / zoom - offRef.current.x, y: (e.clientY - r.top + el.scrollTop) / zoom - offRef.current.y };
  };
  const [promoteMsg, setPromoteMsg] = React.useState("");
  const [promoteFor, setPromoteFor] = React.useState<number | null>(null);
  const [promoteGoal, setPromoteGoal] = React.useState("");
  const [promoteDraft, setPromoteDraft] = React.useState<{ title: string; body: string } | null>(null);
  const [promoteBusy, setPromoteBusy] = React.useState(false);
  const ctrls = React.useRef<Record<number, AbortController>>({});
  // unified add/edit form: formMode = 'add' | <paneId to edit> | null
  const [formMode, setFormMode] = React.useState<"add" | number | null>(null);
  const [fBase, setFBase] = React.useState(""); const [fName, setFName] = React.useState(""); const [fScope, setFScope] = React.useState("");
  const [fVibe, setFVibe] = React.useState("forge"); // the vibe-agent persona (add mode)
  const [fSettings, setFSettings] = React.useState<any>({}); // per-tool config → pane.settings_json
  const [fSeed, setFSeed] = React.useState("");               // seed content (todo/kanban/notes)
  const [fExtra, setFExtra] = React.useState(""); const [fTier, setFTier] = React.useState("low"); const [fModel, setFModel] = React.useState<string | null>(null);
  const [fKind, setFKind] = React.useState<string>("agent"); const [fScript, setFScript] = React.useState("build");
  // vibe ENGINES (2026-07-09): opencode | claude-code | codex — all provision + spawn identically;
  // the BE picks the binary + whether the proxy is in the loop. Preflight tells us which CLIs are installed.
  const [engines, setEngines] = React.useState<Record<string, { installed: boolean; label: string; subscription?: boolean }>>({});
  React.useEffect(() => { apiGet("/api/v1/cockpit/engines").then((d: any) => { const m: any = {}; for (const e of (unwrap(d)?.engines ?? [])) m[e.key] = e; setEngines(m); }).catch(() => {}); }, []);

  const loadSessions = React.useCallback(async () => { const d = unwrap(await apiPost("/api/v1/cockpit/session/get", {})); if (d?.sessions) setSessions(d.sessions.filter((s: any) => !String(s?.name ?? "").startsWith("antichat#"))); }, []); // antichat sessions are the CHAT's infrastructure — a different entity, never listed as vibe sessions
  const loadSession = React.useCallback(async (id: number) => { const d = unwrap(await apiPost("/api/v1/cockpit/session/get", { id })); if (d?.session) setData(d); }, []);
  React.useEffect(() => { loadSessions(); }, [loadSessions]);
  React.useEffect(() => { if (sid) loadSession(sid); }, [sid, loadSession]);
  React.useEffect(() => { if (!sid) (async () => { const d = unwrap(await apiPost("/api/v1/cockpit/overview", {})); setOverview(d); })(); }, [sid, sessions]);
  React.useEffect(() => { (async () => { const d = unwrap(await apiPost("/api/v1/personas/dashboard", { window_hours: 168 })); if (Array.isArray(d?.personas)) setAgents(d.personas); })(); }, []);
  // the workspace's files (for the scope tree), from the atlas
  React.useEffect(() => { (async () => { const d = unwrap(await apiPost("/api/v1/codebase/get", { origin: "atlas", with_tokens: true })); const nodes = d?.nodes ?? d?.atlas?.nodes ?? []; if (Array.isArray(nodes)) setAtlasNodes(nodes); if (d?.file_tokens) setFileTok(d.file_tokens); })(); }, []);

  const createSession = async () => {
    if (!name.trim()) return;
    const d = unwrap(await apiPost("/api/v1/cockpit/session/create", { name: name.trim(), mission_md: mission.trim(), base_branch: base.trim() }));
    if (d?.session) { setCreating(false); setName(""); setMission(""); await loadSessions(); setSid(d.session.id); }
  };
  // FIRST FLIGHT (adoption slice 1, 2026-07-14): the goal box — a new operator
  // wins once before learning any noun. One input → session + two personas
  // racing the goal in parallel worktrees + a review referee, all defaults.
  // The AI concierge (proposal cards) rides on top in slice 2; this
  // deterministic path is also its fallback when there is no key / AI fails.
  const [heroGoal, setHeroGoal] = React.useState("");
  const [heroBusy, setHeroBusy] = React.useState(false);
  const [heroErr, setHeroErr] = React.useState<string | null>(null);
  // THE DOCK FIELD is the vibe composer (operator 2026-07-20): on the dashboard
  // it feeds the concierge; inside a board it falls back to the chat panel.
  useDockSurface(React.useMemo(() => (sid != null ? null : {
    placeholder: heroBusy ? "the concierge is preparing…" : "what do you want to ship?",
    hint: "⏎ GO — the concierge prepares the whole session · drag ⠿ to dock the chat",
    submit: (t: string) => { setHeroGoal(t); void firstFlight(t); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sid, heroBusy]));
  // essentials-first gallery (adoption slice 3) — expanded once, remembered forever
  const [galleryAll, setGalleryAll] = React.useState<boolean>(() => { try { return localStorage.getItem("vibe_gallery_all") === "1"; } catch { return true; } });
  // slice 2, THE CONCIERGE: the goal box asks the AI to PROPOSE the crew as
  // accept/reject cards — the AI proposes, the operator disposes; nothing
  // spawns without the click. The duo below is the deterministic fallback
  // (no key / AI down / parse fail) so first flight never depends on an LLM.
  const [heroCrew, setHeroCrew] = React.useState<null | { sid: number | null; goal: string; mission: string; loading: boolean; error: string | null; shared: Array<{ key: string; label: string; on: boolean }>; panes: Array<{ kind: string; label: string; agent: string; why: string; reads: string[]; on: boolean }> }>(null);
  const SRC_LABEL: Record<string, string> = React.useMemo(() => Object.fromEntries(SOURCE_GROUPS.flatMap((g) => g.items)), []);
  const spawnDuo = async (sid2: number, goal: string) => {
    const duo = [VIBE_AGENTS.find((v) => v.key === "forge") ?? VIBE_AGENTS[0], VIBE_AGENTS.find((v) => v.key === "prism") ?? VIBE_AGENTS[1] ?? VIBE_AGENTS[0]];
    await Promise.all(duo.map((vb, di) => apiPost("/api/v1/cockpit/pane/add", {
      session_id: sid2, base_agent: vb.base, subagent_name: `${vb.name.toLowerCase()}·racer`,
      extra_prompt_md: `${vb.persona}\n\nRACE BRIEF — deliver this goal, end to end:\n${goal}`,
      tier: "low", scope: [], settings: { x: 24 + di * (PW + GAP), y: 24 },
    }, { timeoutMs: 180000 }).catch(() => null)));
    const rv = unwrap(await apiPost("/api/v1/cockpit/pane/add", { session_id: sid2, base_agent: "dev", subagent_name: "review", pane_kind: "review", scope: [], grants: [], provision: false, settings: { x: 24, y: 24 + PH + GAP } }, { timeoutMs: 60000 }).catch(() => null));
    const rvId = rv?.pane_id ?? rv?.pane?.id;
    if (rvId) await apiPost("/api/v1/cockpit/pane/update", { pane_id: rvId, pane_kind: "review", settings: { x: 24, y: 24 + PH + GAP } }, { timeoutMs: 30000 }).catch(() => null);
  };
  const enterSession = async (sid2: number) => { setHeroCrew(null); setHeroGoal(""); await loadSessions(); setSid(sid2); };
  const firstFlight = async (goalArg?: string) => {
    const goal = (goalArg ?? heroGoal).trim(); if (!goal || heroBusy) return;
    // DETERMINISTIC WIZARD (operator 2026-07-14: "it should FIRST open the
    // window wizard, then show a loading where the AI call is made… make the
    // opening deterministic"): the window opens NOW, unconditionally; the
    // session + concierge run inside it; failures render inside it; nothing
    // ever spawns without a click.
    setHeroBusy(true); setHeroErr(null);
    setHeroCrew({ sid: null, goal, mission: "", loading: true, error: null, shared: [], panes: [] });
    try {
      const nm = goal.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "first-mission";
      const d = unwrap(await apiPost("/api/v1/cockpit/session/create", { name: nm, mission_md: goal, base_branch: "main" }).catch(() => null));
      const newSid = d?.session?.id ? Number(d.session.id) : null;
      if (!newSid) { setHeroCrew((hc) => (hc ? { ...hc, loading: false, error: d?.error ?? "could not create the session — is the backend running?" } : hc)); return; }
      setHeroCrew((hc) => (hc ? { ...hc, sid: newSid } : hc));
      const catalog = PANE_KINDS.filter((m) => m.group !== "collections" && !m.soon && !isEnginePaneKind(m.key)).map((m) => ({ key: m.key, desc: m.desc.slice(0, 160) }));
      const sources = SOURCE_GROUPS.flatMap((g) => g.items.map(([k, label]) => ({ key: k, desc: `${g.group} · ${label}` })));
      const prep = unwrap(await apiPost("/api/v1/cockpit/plan/generate", { session_id: newSid, pane_id: 0, ambition: goal, mode: "prepare", catalog, sources, formations: [] }, { timeoutMs: 120000 }).catch((e) => ({ ok: false, error: String(e?.message ?? e) })));
      if (prep?.ok && prep.crew?.panes?.length) {
        setHeroCrew((hc) => (hc ? {
          ...hc, loading: false, error: null, mission: prep.crew.mission || goal,
          shared: (prep.crew.shared ?? []).map((k: string) => ({ key: k, label: SRC_LABEL[k] ?? k, on: true })),
          panes: prep.crew.panes.map((p2: any) => ({ ...p2, reads: p2.reads ?? [], on: true })),
        } : hc));
      } else {
        setHeroCrew((hc) => (hc ? { ...hc, loading: false, error: `concierge unavailable — ${prep?.error ?? "no answer"}` } : hc));
      }
    } finally { setHeroBusy(false); }
  };
  const spawnCrew = async () => {
    if (!heroCrew || heroBusy) return;
    setHeroBusy(true); setHeroErr(null);
    try {
      if (heroCrew.sid == null) return;
      const picked = heroCrew.panes.filter((p) => p.on);
      if (!picked.length) await spawnDuo(heroCrew.sid, heroCrew.goal);
      // 1) SHARED CONTEXT first — one doc per accepted source, same shape the
      //    context studio's chips write ("CONTEXT SOURCE — <label>:" prefix).
      const sharedOn = heroCrew.shared.filter((s) => s.on);
      const crewSid = heroCrew.sid;
      for (const s of sharedOn) {
        await apiPost("/api/v1/cockpit/blackboard/post", { session_id: crewSid, kind: "context", body_md: `CONTEXT SOURCE — ${s.label}:\n(consult the current ${s.label.toLowerCase()} for this session before working.)` }, { timeoutMs: 30000 }).catch(() => null);
      }
      // …then read the docs back to learn their ids (excludes are id-based)
      const bb = unwrap(await apiPost("/api/v1/cockpit/blackboard/read", { session_id: crewSid }, { timeoutMs: 30000 }).catch(() => null));
      const docIdByKey: Record<string, number> = {};
      for (const s of sharedOn) {
        const doc = (bb?.context_docs ?? []).find((d2: any) => String(d2.body_md).startsWith(`CONTEXT SOURCE — ${s.label}:`));
        if (doc) docIdByKey[s.key] = Number(doc.id);
      }
      const allDocIds = Object.values(docIdByKey);
      // 2) the panes — per-pane READS become context_excludes (reads ⊆ shared;
      //    empty reads = the pane sees everything shared)
      let nAgents = 0; let nTools = 0;
      for (const cp of picked) {
        const excludes = cp.reads.length ? allDocIds.filter((id2) => !cp.reads.some((rk) => docIdByKey[rk] === id2)) : [];
        let pid2: number | null = null;
        if (cp.kind === "agent") {
          const vb = VIBE_AGENTS.find((v) => v.key === cp.agent) ?? VIBE_AGENTS[0];
          const st = { x: 24 + nAgents * (PW + GAP), y: 24 }; nAgents += 1;
          const d2 = unwrap(await apiPost("/api/v1/cockpit/pane/add", { session_id: crewSid, base_agent: vb.base, subagent_name: cp.label || vb.name.toLowerCase(), extra_prompt_md: `${vb.persona}\n\nMISSION BRIEF:\n${heroCrew.mission}\n\nGOAL:\n${heroCrew.goal}`, tier: "low", scope: [], settings: st }, { timeoutMs: 180000 }).catch(() => null));
          pid2 = Number(d2?.pane_id ?? d2?.pane?.id) || null;
        } else {
          const st = { x: 24 + nTools * (PW + GAP), y: 24 + PH + GAP }; nTools += 1;
          const d2 = unwrap(await apiPost("/api/v1/cockpit/pane/add", { session_id: crewSid, base_agent: "dev", subagent_name: cp.label || cp.kind, pane_kind: cp.kind, scope: [], grants: [], provision: false, settings: st }, { timeoutMs: 60000 }).catch(() => null));
          pid2 = Number(d2?.pane_id ?? d2?.pane?.id) || null;
          if (pid2) await apiPost("/api/v1/cockpit/pane/update", { pane_id: pid2, pane_kind: cp.kind, settings: { x: 24 + (nTools - 1) * (PW + GAP), y: 24 + PH + GAP } }, { timeoutMs: 30000 }).catch(() => null);
        }
        if (pid2 && excludes.length) await apiPost("/api/v1/cockpit/pane/update", { pane_id: pid2, context_excludes: excludes }, { timeoutMs: 30000 }).catch(() => null);
      }
      await enterSession(crewSid);
    } finally { setHeroBusy(false); }
  };
  const openAdd = () => { setFormMode("add"); setFBase("dev"); setFVibe("forge"); setFName(""); setFScope(""); setFExtra(""); setFTier("low"); setFModel(null); setFKind("agent"); setFScript("build"); setFSettings({}); setFSeed(""); };
  const openEdit = (p: Pane) => { setFormMode(p.id); setFBase(p.base_agent || ""); setFName(p.subagent_name || ""); setFScope((p.scope || []).join(", ")); setFExtra(p.extra_prompt_md || ""); setFTier(p.tier || "low"); setFModel(p.model_id || null); };
  const closeForm = () => setFormMode(null);
  // OPTIMISTIC SPAWN (plan S2): fire the add in the background; render a ghost
  // pane immediately; reconcile on response (or surface the refusal — e.g. an
  // overlapping scope claim). No more staring at a form for up to 120s.
  const spawnOptimistic = (body: Record<string, unknown>, name: string, kind: string) => {
    const key = Date.now();
    setGhosts((g) => [...g, { key, name, kind }]);
    void apiPost("/api/v1/cockpit/pane/add", body, { timeoutMs: 120000 }).then((raw2) => {
      const d = unwrap(raw2);
      setGhosts((g) => g.filter((x) => x.key !== key));
      if (d && d.ok === false) setPromoteMsg(`✕ ${d.error ?? "pane refused"}`);
      if (sid) loadSession(sid);
    });
  };
  const saveForm = async () => {
    if (!sid || (!fBase && fKind === "agent")) return;
    if (fKind === "opencode" && !fScope.trim()) { /* scope optional — full checkout then */ }
    const scope = fScope.split(",").map((s) => s.trim()).filter(Boolean);
    if (formMode === "add" && (TOOL_KINDS as readonly string[]).includes(fKind)) {
      // VIEWER / TOOL panes: no agent, no worktree, no grants — viewers/runners
      // over session or repo data. pane_kind rides the ADD (the update round-trip
      // left a coerced 'agent' pane when the kind was unknown — live incident).
      // Per-tool config → settings_json; seed lines post right after the add.
      const label = fName.trim() || (fKind === "git" ? "git·graph" : fKind);
      const settings = Object.fromEntries(Object.entries(fSettings).filter(([, v]) => v !== "" && v != null && v !== 0));
      const d = unwrap(await apiPost("/api/v1/cockpit/pane/add", { session_id: sid, base_agent: "dev", subagent_name: label, pane_kind: fKind, scope: [], grants: [], provision: false, ...(Object.keys(settings).length ? { settings } : {}) }, { timeoutMs: 60000 }));
      const paneId = d?.pane_id ?? d?.pane?.id;
      if (paneId) await apiPost("/api/v1/cockpit/pane/update", { pane_id: paneId, pane_kind: fKind, ...(Object.keys(settings).length ? { settings } : {}) }, { timeoutMs: 30000 });
      if (paneId && fSeed.trim() && (fKind === "todo" || fKind === "kanban" || fKind === "notes")) {
        const lines = fKind === "notes" ? [fSeed.trim()] : fSeed.split("\n").map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          const body = fKind === "todo" ? "[ ] " + line : fKind === "kanban" ? JSON.stringify({ col: "todo", text: line }) : line;
          await apiPost("/api/v1/cockpit/blackboard/post", { session_id: sid, pane_id: paneId, kind: fKind === "notes" ? "note" : fKind, body_md: body }, { timeoutMs: 20000 });
        }
      }
    } else if (formMode === "add" && (fKind === "ultraplan" || fKind === "swarm")) {
      // SHAPE (no worktree) / EXECUTE (its OWN worktree + auto-apply).
      const isExec = fKind === "swarm";
      const label = fName.trim() || (isExec ? "execute" : "shape");
      const d = unwrap(await apiPost("/api/v1/cockpit/pane/add", { session_id: sid, base_agent: "dev", subagent_name: label, pane_kind: fKind, scope: [], grants: isExec ? ["file.read", "file.write"] : [], provision: isExec, extra_prompt_md: isExec ? "You are the EXECUTE worktree agent: you run ONE queued task at a time, applying edits directly in this worktree. Stay strictly on the task's brief." : undefined }, { timeoutMs: 120000 }));
      const paneId = d?.pane_id ?? d?.pane?.id;
      if (paneId) await apiPost("/api/v1/cockpit/pane/update", { pane_id: paneId, pane_kind: fKind, ...(isExec ? { auto_apply: 1 } : {}) }, { timeoutMs: 30000 });
    } else if (formMode === "add" && fKind.startsWith("col-")) {
      // COLLECTION SPAWNER (wave 2, data-driven): a typed frame + role-stamped
      // panes on the template's grid. Agent slots wear a vibe persona (worktree
      // provisioned); exec slots are the queue worktree (auto-apply ON).
      const tpl = COLLECTION_TEMPLATES[fKind.slice(4)] ?? userTpls[fKind.slice(4)]; // stock or YOUR saved formation
      if (tpl && panes.length + tpl.slots.length > cap) {
        window.alert(`this formation needs ${tpl.slots.length} slots but the session holds ${panes.length}/${cap} panes — close some panes (or start a fresh session) first.`);
      } else if (tpl) {
        const colId = Date.now();
        const el = boardRef.current;
        const ox = Math.max(24, el ? (el.scrollLeft + 60) / zoom : 40);
        const oy = Math.max(24, el ? (el.scrollTop + 60) / zoom : 40);
        const failures: string[] = [];
        let created = 0;
        const createdIds: number[] = [];
        for (const slot of tpl.slots) {
          const vibe = slot.agent ? VIBE_AGENTS.find((v) => v.key === slot.agent) : null;
          // composed formations carry their WIRING (step order + reads/emits) —
          // it rides the pane settings so the 🗺 flow runner can auto-advance
          const st = {
            collection: colId, role: slot.role, x: Math.round(ox + 16 + slot.col * (PW + GAP)), y: Math.round(oy + 40 + slot.row * (PH + GAP)),
            ...(slot.step != null ? { step: slot.step, reads: slot.reads, emit: slot.emit ?? `step:${slot.label ?? slot.role}` } : {}),
          };
          const d = unwrap(await apiPost("/api/v1/cockpit/pane/add", {
            session_id: sid, base_agent: "dev", subagent_name: slot.label, pane_kind: slot.kind,
            scope: [], grants: (slot.exec || vibe) ? ["file.read", "file.write"] : [],
            provision: !!(slot.exec || vibe),
            extra_prompt_md: slot.exec
              ? "You are the EXECUTE worktree agent: you run ONE queued task at a time, applying edits directly in this worktree. Stay strictly on the task's brief."
              : vibe?.persona,
            tier: "low",
            settings: st,
          }, { timeoutMs: 180000 }));
          const paneId = d?.pane_id ?? d?.pane?.id;
          if (paneId) { created++; createdIds.push(Number(paneId)); await apiPost("/api/v1/cockpit/pane/update", { pane_id: paneId, pane_kind: slot.kind, ...(slot.exec ? { auto_apply: 1 } : {}), settings: st }, { timeoutMs: 30000 }); }
          else failures.push(`${slot.label}: ${d?.error ?? "add failed"}`);
        }
        // BOUND TOGETHER (operator 2026-07-14): the formation is also a BOOK —
        // the 📖 ribbon, travel-together, and ⛶ open book = fullscreen with ←/→
        // turning through the steps like pages.
        if (created > 0) saveBoard([...frames, { id: colId, x: ox, y: oy, w: (PW + GAP) * tpl.cols + 32, h: (PH + GAP) * tpl.rows + 76, title: fName.trim() || tpl.title, color: C.brand, template: fKind.slice(4) }], createdIds.length >= 2 && createdIds.length <= 6 ? [...binds, createdIds] : binds);
        if (failures.length) window.alert(`formation spawned ${created}/${tpl.slots.length} panes — failed:\n${failures.join("\n")}\n(restart the BE if the pane cap or a kind was just updated)`);
      }
    } else if (formMode === "add" && fKind === "script") {
      // SCRIPT-RUNNER PANE: no agent turn ever fires — no edit grants, no scope, no worktree
      // of its own (it runs in a SIBLING pane's worktree, chosen on the pane).
      const d = unwrap(await apiPost("/api/v1/cockpit/pane/add", { session_id: sid, base_agent: "dev", subagent_name: `script·${fScript}`, scope: [], grants: [], provision: false }, { timeoutMs: 60000 }));
      const paneId = d?.pane_id ?? d?.pane?.id;
      if (paneId) await apiPost("/api/v1/cockpit/pane/update", { pane_id: paneId, pane_kind: "script", script_kind: fScript }, { timeoutMs: 30000 });
    } else if (formMode === "add" && isEnginePaneKind(fKind)) {
      // ENGINE PANE: pane_kind rides the ADD so provisioning builds the BOX (FULL worktree —
      // scope is the pane's EDIT whitelist, enforced at the merge gate; AGENTS.md + the engine's
      // context file). OPTIMISTIC: a ghost renders now, the poll reconciles it away.
      // the vibe persona ANNEXES the engine too (operator 2026-07-14: "base agent should
      // work on all agent types — a sliced context that gives personality to the providers"):
      // for engines it rides extra_prompt_md into the worktree AGENTS.md brief.
      const vb = VIBE_AGENTS.find((v) => v.key === fVibe) ?? VIBE_AGENTS[0];
      const vExtra = [vb.persona, fExtra.trim()].filter(Boolean).join(String.fromCharCode(10) + String.fromCharCode(10));
      const vLabel = fName.trim() || vb.name.toLowerCase();
      spawnOptimistic({ session_id: sid, pane_kind: fKind, base_agent: vb.base, subagent_name: vLabel, extra_prompt_md: vExtra || undefined, model_id: fModel || undefined, tier: fTier, scope }, vLabel, fKind);
    } else if (formMode === "add") {
      // VIBE AGENT: the roster persona rides the extra prompt (visible + editable
      // in ✎ edit and the 🧾 prompt window — never hidden cognition).
      const vibe = VIBE_AGENTS.find((v) => v.key === fVibe) ?? VIBE_AGENTS[0];
      const extra = [vibe.persona, fExtra.trim()].filter(Boolean).join("\n\n");
      const label = fName.trim() || vibe.name.toLowerCase();
      spawnOptimistic({ session_id: sid, base_agent: vibe.base, subagent_name: label, extra_prompt_md: extra, model_id: fModel || undefined, tier: fTier, scope }, label, "agent");
    } else if (typeof formMode === "number") {
      await apiPost("/api/v1/cockpit/pane/update", { pane_id: formMode, base_agent: fBase, subagent_name: fName.trim() || fBase, scope, extra_prompt_md: fExtra.trim(), model_id: fModel, tier: fTier }, { timeoutMs: 60000 });
    }
    closeForm(); if (sid) loadSession(sid);
  };
  // WORKTREE LIFECYCLE (operator 2026-07-06): closing a pane that HOLDS a worktree opens the
  // merge-or-discard warning (with all merge info) instead of silently tearing it down.
  const [closing, setClosing] = React.useState<any>(null); // { pane, info?, busy?, error? }
  const removePane = async (id: number, mode?: "merge" | "discard") => {
    const r = unwrap(await apiPost("/api/v1/cockpit/pane/remove", { pane_id: id, ...(mode ? { mode } : {}) }, { timeoutMs: 120000 }));
    if (r && r.ok === false) { setClosing((c: any) => c ? { ...c, busy: false, error: r.error } : c); return false; }
    setClosing(null); if (sid) loadSession(sid); return true;
  };
  const requestClose = async (p: Pane) => {
    if (!(p as any).worktree_path || (p as any).pane_kind === "script" || (TOOL_KINDS as readonly string[]).includes((p as any).pane_kind)) { removePane(p.id); return; }
    setClosing({ pane: p, busy: true });
    const info = unwrap(await apiPost("/api/v1/cockpit/git-graph", { op: "close_info", pane_id: p.id }, { timeoutMs: 30000 }));
    setClosing({ pane: p, info, busy: false });
  };
  const openWorktree = async (id: number) => { try { await apiPost("/api/v1/cockpit/git-graph", { op: "open_worktree", pane_id: id }, { timeoutMs: 15000 }); } catch { /* */ } };
  // ── board geometry: free positions with an auto-layout fallback ──
  const PW = 356; const PH = 340; const GAP = 16;
  const paneW = (p: any) => PW * (Number(p.span_cols) || 1) + GAP * ((Number(p.span_cols) || 1) - 1);
  const paneH = (p: any) => PH * (Number(p.span_rows) || 1) + GAP * ((Number(p.span_rows) || 1) - 1);
  const autoPos = (i: number) => ({ x: 24 + (i % 4) * (PW + GAP + 8), y: 24 + Math.floor(i / 4) * (PH + GAP + 8) });
  const posOf = (p: any, i: number) => {
    if (boardPos[p.id]) return boardPos[p.id];
    const st = paneSettings(p);
    return Number.isFinite(Number(st.x)) && Number.isFinite(Number(st.y)) && (st.x != null) ? { x: Number(st.x), y: Number(st.y) } : autoPos(i);
  };
  const persistPanePos = (p: any, x: number, y: number) => {
    void apiPost("/api/v1/cockpit/pane/update", { pane_id: p.id, settings: { ...paneSettings(p), x: Math.round(x), y: Math.round(y) } }, { timeoutMs: 20000 });
  };
  const saveBoard = (nextFrames: any[], nextBinds?: number[][], nextSplits?: number[][], nextComments?: any[]) => {
    setFrames(nextFrames);
    if (nextBinds) setBinds(nextBinds);
    if (nextSplits) setSplits(nextSplits);
    if (nextComments) setComments(nextComments);
    if (sid) void apiPost("/api/v1/cockpit/blackboard/post", { op: "board", session_id: sid, board_json: JSON.stringify({ frames: nextFrames, binds: nextBinds ?? binds, splits: nextSplits ?? splits, comments: nextComments ?? comments }) }, { timeoutMs: 20000 });
  };
  React.useEffect(() => { // frames follow the session (unless mid-drag)
    if (moveRef.current) return;
    try {
      const v = JSON.parse(data?.session?.board_json ?? "[]");
      if (Array.isArray(v)) { setFrames(v); setBinds([]); setSplits([]); setComments([]); }
      else { setFrames(Array.isArray(v?.frames) ? v.frames : []); setBinds(Array.isArray(v?.binds) ? v.binds : []); setSplits(Array.isArray(v?.splits) ? v.splits : []); setComments(Array.isArray(v?.comments) ? v.comments : []); }
    } catch { setFrames([]); setBinds([]); setSplits([]); setComments([]); }
  }, [data?.session?.board_json]);
  const FRAME_COLORS = [C.brand, C.ok, C.warn, C.bad];
  const addFrame = () => {
    const el = boardRef.current;
    const cx = el ? (el.scrollLeft + el.clientWidth / 2) / zoom : 300;
    const cy = el ? (el.scrollTop + el.clientHeight / 2) / zoom : 240;
    saveBoard([...frames, { id: Date.now(), x: Math.max(12, cx - 380), y: Math.max(12, cy - 260), w: 780, h: 540, title: "group " + (frames.length + 1), color: FRAME_COLORS[frames.length % FRAME_COLORS.length] }]);
  };
  const addComment = () => {
    const el = boardRef.current;
    const cx = el ? (el.scrollLeft + el.clientWidth / 2) / zoom - offRef.current.x : 300;
    const cy = el ? (el.scrollTop + el.clientHeight / 2) / zoom - offRef.current.y : 240;
    const id = Date.now();
    saveBoard(frames, undefined, undefined, [...comments, { id, x: Math.max(12, cx - CMT_W / 2), y: Math.max(12, cy - 40), text: "", size: 14, color: FRAME_COLORS[comments.length % FRAME_COLORS.length] }]);
    setEditingCmt(id);
  };
  const startCmtMove = (e: React.MouseEvent, c: any) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest?.("button, textarea, [data-cmt-anchor]")) return;
    e.preventDefault(); e.stopPropagation();
    moveRef.current = { kind: "comment", id: c.id, ox: e.clientX, oy: e.clientY, sx: c.x, sy: c.y };
    setBoardDrag(true);
  };
  // the comment's arrow: drag the ○ anchor onto a pane (a bound pane offers the
  // whole book via the 📖 toggle) or a group frame; drop on the void to detach
  const startNoteLine = (e: React.MouseEvent, c: any) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const h = cmtHRef.current[c.id] ?? 64;
    moveRef.current = { kind: "noteline" };
    setNoteLine({ fromId: c.id, x1: c.x + CMT_W / 2, y1: c.y + h, x2: c.x + CMT_W / 2, y2: c.y + h });
    setBoardDrag(true);
  };
  const startPaneMove = (e: React.MouseEvent, p: any, i: number) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest?.("button, select, input, textarea")) return; // header buttons stay buttons
    e.preventDefault();
    // travel companions: the whole selection when this pane is in it; the whole book when bound
    const bi = bindOf(p.id);
    const ids = selected.has(p.id) ? [...selected] : bi >= 0 ? binds[bi] : [p.id];
    const members = panes.map((p2, i2) => ({ p: p2, pos: posOf(p2, i2) })).filter(({ p: p2 }) => ids.includes(p2.id))
      .map(({ p: p2, pos: pos2 }) => ({ p: p2, sx: pos2.x, sy: pos2.y }));
    moveRef.current = { kind: "pane", members, ox: e.clientX, oy: e.clientY };
    setBoardDrag(true);
  };
  // ── BINDING (operator: "like 2 pages of a book, side by side") ──
  const snapBind = (ids: number[]) => {
    const first = panes.findIndex((p2) => p2.id === ids[0]);
    if (first < 0) return;
    const base = posOf(panes[first], first);
    let x = base.x;
    setBoardPos((b) => {
      const nb = { ...b };
      for (const id of ids) {
        const i2 = panes.findIndex((p2) => p2.id === id); if (i2 < 0) continue;
        nb[id] = { x, y: base.y };
        persistPanePos(panes[i2], x, base.y);
        x += paneW(panes[i2]) + 2;
      }
      return nb;
    });
  };
  const createBind = (fromId: number, toId: number) => {
    const a = bindOf(fromId); const b = bindOf(toId);
    let next = binds.map((x) => [...x]);
    if (a >= 0 && b >= 0 && a !== b) { if (next[a].length + next[b].length > 6) return; next[a] = [...next[a], ...next[b]]; next.splice(b, 1); }
    else if (a >= 0) { if (next[a].length >= 6) return; if (!next[a].includes(toId)) next[a].push(toId); }
    else if (b >= 0) { if (next[b].length >= 6) return; if (!next[b].includes(fromId)) next[b].unshift(fromId); }
    else next.push([fromId, toId]);
    next = next.filter((x) => x.length >= 2);
    saveBoard(frames, next);
    const merged = next.find((x) => x.includes(fromId));
    if (merged) snapBind(merged);
  };
  const unbind = (paneId: number) => {
    const bi = bindOf(paneId); if (bi < 0) return;
    let next = binds.map((x) => [...x]);
    next[bi] = next[bi].filter((id) => id !== paneId);
    next = next.filter((x) => x.length >= 2);
    saveBoard(frames, next);
  };
  const startBindLine = (e: React.MouseEvent, p: any, i: number, side: "left" | "right") => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const pos2 = posOf(p, i);
    const x1 = side === "left" ? pos2.x : pos2.x + paneW(p);
    const y1 = pos2.y + paneH(p) / 2;
    moveRef.current = { kind: "bindline" };
    setBindLine({ fromId: p.id, x1, y1, x2: x1, y2: y1 });
    setBoardDrag(true);
  };
  const startFrameMove = (e: React.MouseEvent, f: any) => {
    if (e.button !== 0) return;
    e.preventDefault();
    // members = panes whose CENTER sits inside the frame right now — they travel with it
    const members = panes.map((p, i) => ({ p, pos: posOf(p, i) }))
      .filter(({ p, pos }) => pos.x + paneW(p) / 2 >= f.x && pos.x + paneW(p) / 2 <= f.x + f.w && pos.y + paneH(p) / 2 >= f.y && pos.y + paneH(p) / 2 <= f.y + f.h);
    moveRef.current = { kind: "frame", frame: f, ox: e.clientX, oy: e.clientY, sx: f.x, sy: f.y, members: members.map((m) => ({ p: m.p, sx: m.pos.x, sy: m.pos.y })) };
    setBoardDrag(true);
  };
  const startFrameResize = (e: React.MouseEvent, f: any) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    moveRef.current = { kind: "resize", frame: f, ox: e.clientX, oy: e.clientY, sw: f.w, sh: f.h };
    setBoardDrag(true);
  };
  React.useEffect(() => {
    if (!boardDrag) return;
    const move = (e: MouseEvent) => {
      const m = moveRef.current; if (!m) return;
      const dx = (e.clientX - m.ox) / zoom; const dy = (e.clientY - m.oy) / zoom;
      if (m.kind === "pane") {
        setBoardPos((b) => { const nb = { ...b }; for (const mem of m.members) nb[mem.p.id] = { x: Math.max(0, mem.sx + dx), y: Math.max(0, mem.sy + dy) }; return nb; });
      } else if (m.kind === "marquee") {
        const pt2 = canvasPt(e);
        setMarqueeBox({ x: Math.min(m.x0, pt2.x), y: Math.min(m.y0, pt2.y), w: Math.abs(pt2.x - m.x0), h: Math.abs(pt2.y - m.y0) });
      } else if (m.kind === "bindline") {
        const pt2 = canvasPt(e);
        setBindLine((bl) => (bl ? { ...bl, x2: pt2.x, y2: pt2.y } : bl));
      } else if (m.kind === "comment") {
        setComments((cs) => cs.map((c) => (c.id === m.id ? { ...c, x: Math.max(0, m.sx + dx), y: Math.max(0, m.sy + dy) } : c)));
      } else if (m.kind === "noteline") {
        const pt2 = canvasPt(e);
        setNoteLine((nl) => (nl ? { ...nl, x2: pt2.x, y2: pt2.y } : nl));
      } else if (m.kind === "frame") {
        const nx = Math.max(0, m.sx + dx); const ny = Math.max(0, m.sy + dy);
        setFrames((fs2) => fs2.map((f) => (f.id === m.frame.id ? { ...f, x: nx, y: ny } : f)));
        setBoardPos((b) => { const nb = { ...b }; for (const mem of m.members) nb[mem.p.id] = { x: Math.max(0, mem.sx + dx), y: Math.max(0, mem.sy + dy) }; return nb; });
      } else if (m.kind === "resize") {
        setFrames((fs2) => fs2.map((f) => (f.id === m.frame.id ? { ...f, w: Math.max(240, m.sw + dx), h: Math.max(180, m.sh + dy) } : f)));
      }
    };
    const up = () => {
      const m = moveRef.current; moveRef.current = null; setBoardDrag(false);
      if (!m) return;
      if (m.kind === "pane") { setBoardPos((b) => { for (const mem of m.members) { const cur = b[mem.p.id]; if (cur) persistPanePos(mem.p, cur.x, cur.y); } return b; }); }
      else if (m.kind === "marquee") {
        setMarqueeBox((box) => {
          if (box && (box.w > 6 || box.h > 6)) {
            const hit = new Set<number>();
            panes.forEach((p2, i2) => {
              const pos2 = posOf(p2, i2); const w2 = paneW(p2); const h2 = paneH(p2);
              if (pos2.x < box.x + box.w && pos2.x + w2 > box.x && pos2.y < box.y + box.h && pos2.y + h2 > box.y) hit.add(p2.id);
            });
            setSelected(hit);
          }
          return null;
        });
      }
      else if (m.kind === "bindline") {
        setBindLine((bl) => {
          if (bl) {
            const drop = panes.map((p2, i2) => ({ p: p2, pos: posOf(p2, i2) }))
              .find(({ p: p2, pos: pos2 }) => p2.id !== bl.fromId && bl.x2 >= pos2.x && bl.x2 <= pos2.x + paneW(p2) && bl.y2 >= pos2.y && bl.y2 <= pos2.y + paneH(p2));
            if (drop) createBind(bl.fromId, drop.p.id);
          }
          return null;
        });
      }
      else if (m.kind === "comment") { setComments((cs) => { saveBoard(frames, undefined, undefined, cs); return cs; }); }
      else if (m.kind === "noteline") {
        setNoteLine((nl) => {
          if (nl) {
            const drop = panes.map((p2, i2) => ({ p: p2, pos: posOf(p2, i2) }))
              .find(({ p: p2, pos: pos2 }) => nl.x2 >= pos2.x && nl.x2 <= pos2.x + paneW(p2) && nl.y2 >= pos2.y && nl.y2 <= pos2.y + paneH(p2));
            const fr = !drop ? frames.find((f) => nl.x2 >= f.x && nl.x2 <= f.x + f.w && nl.y2 >= f.y && nl.y2 <= f.y + f.h) : null;
            const target = drop ? { kind: "pane", id: drop.p.id } : fr ? { kind: "frame", id: fr.id } : null;
            setComments((cs) => { const next = cs.map((c) => (c.id === nl.fromId ? { ...c, target } : c)); saveBoard(frames, undefined, undefined, next); return next; });
          }
          return null;
        });
      }
      else if (m.kind === "frame") { setFrames((fs2) => { saveBoard(fs2); return fs2; }); setBoardPos((b) => { for (const mem of m.members) { const cur = b[mem.p.id]; if (cur) persistPanePos(mem.p, cur.x, cur.y); } return b; }); }
      else if (m.kind === "resize") { setFrames((fs2) => { saveBoard(fs2); return fs2; }); }
    };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [boardDrag, zoom]);
  const stopAll = () => { Object.values(ctrls.current).forEach((c) => { try { c.abort(); } catch { /* */ } }); ctrls.current = {}; setBusy({}); };
  // per-pane diff UI retired 2026-07-13 — ALL diffs live in the REVIEW pane now.
  const doPromoteDraft = async (id: number, goal: string) => {
    setPromoteBusy(true);
    const d = unwrap(await apiPost("/api/v1/cockpit/promote", { pane_id: id, goal: goal.trim() || undefined, draft: true }, { timeoutMs: 120000 }));
    setPromoteBusy(false);
    if (d?.title != null) setPromoteDraft({ title: d.title, body: d.body || "" });
    else { setPromoteFor(null); setPromoteMsg(`draft failed: ${d?.error || "?"}`); }
  };
  const doPromoteCreate = async (id: number) => {
    if (!promoteDraft) return;
    const draft = promoteDraft; setPromoteFor(null); setPromoteDraft(null);
    const d = unwrap(await apiPost("/api/v1/cockpit/promote", { pane_id: id, title: draft.title, body: draft.body }, { timeoutMs: 60000 }));
    setPromoteMsg(d?.slug ? `promoted → driver card ${d.slug}` : `promote failed: ${d?.error || "?"}`); if (sid) loadSession(sid);
  };
  const send = async (paneId: number, textOverride?: string) => {
    const text = (textOverride ?? compose[paneId] ?? "").trim(); if (!text) return;
    setBusy((b) => ({ ...b, [paneId]: true }));
    if (textOverride == null) setCompose((c) => ({ ...c, [paneId]: "" }));
    const ctrl = new AbortController(); ctrls.current[paneId] = ctrl;
    try {
      const r = unwrap(await apiPost("/api/v1/cockpit/pane/message", { pane_id: paneId, user_input: text }, { timeoutMs: 300000, signal: ctrl.signal }));
      if (r) setLastTurn((m) => ({ ...m, [paneId]: r }));
    } catch { /* aborted / failed */ }
    delete ctrls.current[paneId];
    setBusy((b) => ({ ...b, [paneId]: false })); if (sid) loadSession(sid);
  };
  // PLAN-THEN-APPLY (operator 2026-07-06): the agent's edits wait as a pending plan;
  // Apply writes them, Discard drops them; the ⚡ toggle (auto_apply) skips the ask.
  const paneOp = async (paneId: number, op: "apply_pending" | "discard_pending") => {
    setBusy((b) => ({ ...b, [paneId]: true }));
    try { await apiPost("/api/v1/cockpit/pane/message", { pane_id: paneId, op }, { timeoutMs: 60000 }); } catch { /* */ }
    setBusy((b) => ({ ...b, [paneId]: false })); if (sid) loadSession(sid);
  };
  const toggleAuto = async (p: Pane) => {
    await apiPost("/api/v1/cockpit/pane/update", { pane_id: p.id, auto_apply: p.auto_apply ? 0 : 1 }, { timeoutMs: 30000 });
    if (sid) loadSession(sid);
  };
  const integrate = async () => { if (!sid) return; const d = unwrap(await apiPost("/api/v1/cockpit/pr/open", { session_id: sid }, { timeoutMs: 120000 })); setInteg({ opened: d?.opened?.length || 0 }); loadSession(sid); };
  const closeSession = async () => { if (!sid) return; await apiPost("/api/v1/cockpit/session/close", { session_id: sid, mode: "abandoned" }); setSid(null); setData(null); loadSessions(); };
  // ARCHIVE (operator 2026-07-14): shelve the session — worktrees kept
  const archiveSession = async (id: number) => { await apiPost("/api/v1/cockpit/session/close", { session_id: id, mode: "archived", cleanup: false }); if (sid === id) { setSid(null); setData(null); } loadSessions(); };

  const panes: Pane[] = data?.panes || [];
  // SCREEN MANIFEST: antiVibe tells the chat which session is open and what panes are on the board.
  React.useEffect(() => {
    if (sid == null) { clearScreenState("antivibe"); return () => clearScreenState("antivibe"); }
    const name = sessions.find((s2: any) => s2.id === sid)?.name ?? `#${sid}`;
    const kinds = panes.slice(0, 8).map((p2: any) => p2.pane_kind).join(", ");
    reportScreenState("antivibe", `antiVibe cockpit — session "${name}" · ${panes.length} pane${panes.length === 1 ? "" : "s"}${kinds ? ` (${kinds})` : ""}`);
    return () => clearScreenState("antivibe");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, panes.length]);
  // AUTO-CLEANUP the eliminated decision pane (operator 2026-07-15: "remove
  // it — I told you multiple times"). A stale pane_kind:'plan' from an older
  // board is deleted outright, once, the moment it's spotted. It's a tool pane
  // (no worktree), so removePane deletes it directly with no close modal.
  const purgedPlan = React.useRef(false);
  React.useEffect(() => {
    if (purgedPlan.current) return;
    const stale = panes.filter((x: any) => x.pane_kind === "plan");
    if (!stale.length) return;
    purgedPlan.current = true;
    void (async () => { for (const sp of stale) { await apiPost("/api/v1/cockpit/pane/remove", { pane_id: sp.id }, { timeoutMs: 30000 }).catch(() => null); } if (sid) loadSession(sid); })();
  }, [panes, sid, loadSession]);
  const fittedFor = React.useRef<number | null>(null); // auto-fit once per session open
  const fitNow = React.useCallback(() => {
    const el = boardRef.current; if (!el) return;
    // fit the CONTENT into the viewport (never enlarge past 100%) + rewind the scroll
    let ex = 0; let ey = 0;
    panes.forEach((p2, i2) => { const q = posOf(p2, i2); ex = Math.max(ex, q.x + paneW(p2)); ey = Math.max(ey, q.y + paneH(p2)); });
    if (!ex || !ey) { setZoom(1); el.scrollLeft = 0; el.scrollTop = 0; return; }
    const fit = Math.min(1, (el.clientWidth - 40) / ex, (el.clientHeight - 40) / ey);
    setZoom(Math.max(0.4, Math.round(fit * 10) / 10));
    el.scrollLeft = 0; el.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panes]);
  React.useEffect(() => {
    if (!sid || fittedFor.current === sid || !boardRef.current || !panes.length) return;
    fittedFor.current = sid;
    fitNow();
  }, [sid, panes.length, fitNow]);
  // fly the board to a pane (palette jump / ⚡ attention) + flash a ring on arrival
  const jumpToPane = (p: Pane) => {
    setFullscreen(null);
    const el = boardRef.current; if (!el) return;
    const i = panes.findIndex((x) => x.id === p.id); if (i < 0) return;
    const q = posOf(p, i);
    el.scrollTo({ left: Math.max(0, q.x * zoom + (paneW(p) * zoom) / 2 - el.clientWidth / 2), top: Math.max(0, q.y * zoom + (paneH(p) * zoom) / 2 - el.clientHeight / 2), behavior: "smooth" });
    setFlashPane(p.id); window.setTimeout(() => setFlashPane((f) => (f === p.id ? null : f)), 1800);
  };
  // the needs-you predicate: errored panes today; widen as richer states land
  const attention = panes.filter((p) => p.status === "error");
  const attNext = () => { if (!attention.length) return; const p = attention[attIxRef.current % attention.length]; attIxRef.current += 1; jumpToPane(p); };
  // OUTCOME SHELF (approved idea 6): what this session PRODUCED — merged panes
  // and notebook artifacts today; PRs/memories join as they become visible here.
  const [shelfOpen, setShelfOpen] = React.useState(false);
  const outcomes = [
    ...panes.filter((p) => p.status === "merged").map((p) => ({ icon: "⛙", tint: C.ok, label: `merged · #${p.idx + 1} ${p.subagent_name}`, run: () => jumpToPane(p) })),
    ...panes.flatMap((p) => ((paneSettings(p).artifact_ids as number[] | undefined) ?? []).map((aid) => ({ icon: "▤", tint: C.brand, label: `artifact #${aid} · ${p.subagent_name}`, run: () => jumpToPane(p) }))),
  ];
  // SESSION-AS-TEMPLATE (approved idea 4): freeze THIS board into a named custom
  // formation — same noun, same gallery, same spawner as the stock collections,
  // zero new concepts. v1 persists in the browser; substrate rows can follow.
  const [userTpls, setUserTpls] = React.useState<Record<string, { title: string; cols: number; rows: number; slots: any[] }>>(() => {
    try { return JSON.parse(localStorage.getItem("vibe_user_formations") ?? "{}"); } catch { return {}; }
  });
  const saveAsFormation = () => {
    if (!sid || !panes.length) return;
    const nm = window.prompt(`formation name — this board (${panes.length} panes) joins the add-pane gallery under Collections:`, "");
    if (!nm || !nm.trim()) return;
    const key = nm.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28) || `formation-${sid}`;
    // grid-ify the free-form layout: distinct x/y bands become template cols/rows
    const placed = panes.map((p, i) => ({ p, pos: posOf(p, i) })).sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);
    const colBands = [...new Set(placed.map((s) => Math.round(s.pos.x / (PW + GAP))))].sort((a, b) => a - b);
    const rowBands = [...new Set(placed.map((s) => Math.round(s.pos.y / (PH + GAP))))].sort((a, b) => a - b);
    const slots = placed.map(({ p, pos }) => {
      const k = String(paneSettings(p).kind ?? p.pane_kind ?? "agent");
      const needsBox = k === "agent" || isEnginePaneKind(k);
      return {
        kind: k, role: String(paneSettings(p).role ?? k), label: p.subagent_name,
        col: Math.max(0, colBands.indexOf(Math.round(pos.x / (PW + GAP)))),
        row: Math.max(0, rowBands.indexOf(Math.round(pos.y / (PH + GAP)))),
        // persona keys aren't recoverable from a live pane — captured agent slots
        // spawn as forge so they get a worktree; retune personas after spawning
        ...(needsBox ? { agent: "forge" } : {}), ...(k === "swarm" ? { exec: true } : {}),
      };
    });
    const next = { ...userTpls, [key]: { title: nm.trim(), cols: Math.max(1, colBands.length), rows: Math.max(1, rowBands.length), slots } };
    setUserTpls(next);
    try { localStorage.setItem("vibe_user_formations", JSON.stringify(next)); } catch { /* storage full — keep it in memory */ }
    setPromoteMsg(`▧ saved formation "${nm.trim()}" — find it under Automations when adding a pane`);
  };
  // 🧪 THE COMPOSER (operator 2026-07-16: "create our own personalized
  // collection — organize and shape the inputs/outputs of each node"): builds a
  // WIRED formation (steps + reads/emits) into the same store; the orchestrator
  // 🗺 flow auto-runs it (agent steps fire, tool steps pause).
  const [composerOpen, setComposerOpen] = React.useState(false);
  const saveComposed = (key: string, tpl: any) => {
    const next = { ...userTpls, [key]: tpl };
    setUserTpls(next);
    try { localStorage.setItem("vibe_user_formations", JSON.stringify(next)); } catch { /* storage full — keep it in memory */ }
    setComposerOpen(false);
    setPromoteMsg(`🧪 composed "${tpl.title}" — spawn it from Automations, then ▶ run it on the 🧭 orchestrator`);
  };
  const deleteUserTpl = (key: string) => {
    if (!window.confirm(`delete the automation "${userTpls[key]?.title ?? key}"? (already-spawned panes stay on their boards)`)) return;
    const next = { ...userTpls }; delete next[key];
    setUserTpls(next);
    try { localStorage.setItem("vibe_user_formations", JSON.stringify(next)); } catch { /* private mode — memory only */ }
    if (fKind === `col-${key}`) setFKind("agent" as any);
  };
  // the UNIFIED ⌘K store's "HERE" section — this screen's live features
  // (board: jump to every pane + actions; dashboard: sessions + new session)
  React.useEffect(() => {
    const items: StoreItem[] = [];
    if (sid) {
      panes.forEach((p) => {
        const id2 = (KIND_IDENT as any)[String(paneSettings(p).kind ?? p.pane_kind ?? "agent")] ?? { glyph: "◈", color: C.brand };
        items.push({ icon: id2.glyph, tint: id2.color, label: `#${p.idx + 1} ${p.subagent_name}`, hint: p.status, run: () => jumpToPane(p) });
      });
      items.push({ icon: "⌖", label: "fit view", run: fitNow });
      items.push({ icon: "⛶", label: "context studio", run: () => setStudioOpen(true) });
      items.push({ icon: "▦", label: "new group", run: addFrame });
      items.push({ icon: "✎", label: "new comment", run: addComment });
      items.push({ icon: "＋", tint: C.ok, label: "add pane", run: () => openAdd() });
      if (attention.length) items.push({ icon: "⚡", tint: C.bad, label: `attention (${attention.length})`, run: attNext });
      items.push({ icon: "▸", tint: C.warn, label: "pull requests", run: integrate });
      if (panes.length) items.push({ icon: "▧", label: "save automation", run: saveAsFormation });
      items.push({ icon: "🧪", tint: C.brand, label: "compose automation", run: () => setComposerOpen(true) });
      items.push({ icon: "⏏", tint: C.dim, label: "dashboard", run: () => setSid(null) });
    } else {
      items.push({ icon: "＋", tint: C.ok, label: "new session", run: () => setCreating(true) });
      sessions.slice(0, 10).forEach((s2) => items.push({ icon: "❖", label: s2.name, hint: s2.status, run: () => setSid(s2.id) }));
    }
    return registerHere(sid ? "vibe · this board" : "vibe · dashboard", items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, panes, sessions, attention.length]);
  const notes: Note[] = data?.notes || [];
  const coordination = data?.coordination || [];
  const cap = data?.session?.mode === "monitor" ? 24 : 20; // operator 2026-07-13: "20 panes tops"
  // BOARD CANVAS (operator 2026-07-13: "drag the screen on clicking the right button…
  // a hand to drag"): right-button drag PANS the pane board (scroll both axes).
  const boardRef = React.useRef<HTMLDivElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null); // the whole vibe screen (header incl.) — ctrl+wheel guard
  const panRef = React.useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null);
  const [panning, setPanning] = React.useState(false);
  const panStart = (e: React.MouseEvent) => {
    // right/middle button PANS from anywhere; LEFT on the canvas background
    // starts a MARQUEE — drag to select many panes, click empty to clear.
    const onBackground = (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.canvas != null);
    if ((e.button === 2 || e.button === 1) && boardRef.current) {
      if (e.button === 1) e.preventDefault();
      panRef.current = { x: e.clientX, y: e.clientY, sl: boardRef.current.scrollLeft, st: boardRef.current.scrollTop, moved: false };
      setPanning(true);
      return;
    }
    if (e.button === 0 && onBackground) {
      const pt0 = canvasPt(e);
      setSelected(new Set());
      moveRef.current = { kind: "marquee", x0: pt0.x, y0: pt0.y };
      setMarqueeBox({ x: pt0.x, y: pt0.y, w: 0, h: 0 });
      setBoardDrag(true);
    }
  };
  React.useEffect(() => {
    if (!panning) return;
    const move = (e: MouseEvent) => {
      const p = panRef.current; const el = boardRef.current;
      if (!p || !el) return;
      const dx = e.clientX - p.x; const dy = e.clientY - p.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) p.moved = true;
      el.scrollLeft = p.sl - dx; el.scrollTop = p.st - dy;
    };
    const up = () => setPanning(false);
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [panning]);
  // one pane's BODY — shared by the board card and the fullscreen overlay
  const paneBody = (p: Pane) => (
    <React.Fragment>
      {(p.pane_kind === "script" || /^script·/.test(p.subagent_name ?? "")) ? (
        <ScriptPane p={p} panes={panes} onChanged={() => sid && loadSession(sid)} />
      ) : isEnginePaneKind(p.pane_kind) ? (
        <OpencodePane p={p} />
      ) : (p.pane_kind === "git" || p.subagent_name === "git·graph") ? (
        <GitGraphPane sessionId={sid!} panes={panes} onOpenWorktree={openWorktree} />
      ) : (p.pane_kind === "context" || p.subagent_name === "context") ? (
        <ContextPane sessionId={sid!} mission={data?.session?.mission_md ?? ""} onChanged={() => sid && loadSession(sid)} onOpenStudio={() => setStudioOpen(true)} />
      ) : (p.pane_kind === "notes") ? (
        <NotesPane sessionId={sid!} paneId={p.id} onChanged={() => sid && loadSession(sid)} />
      ) : (p.pane_kind === "state") ? (
        <StatePane sessionId={sid!} panes={panes} />
      ) : (p.pane_kind === "run") ? (
        <RunPane p={p} panes={panes} onChanged={() => sid && loadSession(sid)} />
      ) : (p.pane_kind === "gate") ? (
        <GatePane p={p} panes={panes} />
      ) : (p.pane_kind === "code") ? (
        <CodeIdePane p={p} panes={panes} />
      ) : (p.pane_kind === "diagram") ? (
        <DiagramPane p={p} />
      ) : (p.pane_kind === "graph") ? (
        <GraphPane p={p} />
      ) : (p.pane_kind === "kanban") ? (
        <IssuesPane sessionId={sid!} paneId={p.id} />
      ) : (p.pane_kind === "standup") ? (
        <StandupPane p={p} panes={panes} />
      ) : (p.pane_kind === "shell") ? (
        <ShellPane p={p} panes={panes} />
      ) : (p.pane_kind === "review") ? (
        <ReviewPane panes={panes} onChanged={() => sid && loadSession(sid)} />
      ) : (p.pane_kind === "todo") ? (
        <IssuesPane sessionId={sid!} paneId={p.id} />
      ) : (p.pane_kind === "race") ? (
        <RacePane p={p} panes={panes} onChanged={() => sid && loadSession(sid)} />
      ) : (p.pane_kind === "timeline") ? (
        <SessionTimelinePane sessionId={sid!} p={p} />
      ) : (p.pane_kind === "design") ? (
        <DesignPane p={p} panes={panes} sessionId={sid!} />
      ) : (p.pane_kind === "docs") ? (
        <DocsSlicePane p={p} />
      ) : (p.pane_kind === "sketch") ? (
        <SketchPane sessionId={sid!} paneId={p.id} />
      ) : (p.pane_kind === "fuel") ? (
        <FuelPane p={p} panes={panes} sessionId={sid!} />
      ) : (p.pane_kind === "notebook") ? (
        <NotebookPane p={p} sessionId={sid!} />
      ) : (p.pane_kind === "radar") ? (
        <ErrorRadarPane p={p} panes={panes} />
      ) : (p.pane_kind === "bfw1") ? (
        <BugFinderWavePane wave={1} p={p} panes={panes} sessionId={sid} />
      ) : (p.pane_kind === "bfw2") ? (
        <BugFinderWavePane wave={2} p={p} panes={panes} sessionId={sid} />
      ) : (p.pane_kind === "bfw3") ? (
        <BugFinderWavePane wave={3} p={p} panes={panes} sessionId={sid} />
      ) : (p.pane_kind === "plan") ? (
        // the decision pane was eliminated (operator 2026-07-15) — a stale one
        // from an older board lands here; tombstone it so it can be closed.
        <div style={{ flex: 1, minHeight: 0, display: "grid", placeItems: "center", padding: 18, textAlign: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", maxWidth: 300 }}>
            <span style={{ fontSize: 26 }}>🪦</span>
            <span style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, lineHeight: 1.6 }}>the decision pane was removed — the 🧩 <b style={{ color: C.fg }}>shape</b> pane owns every decision now.</span>
            <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>close this pane (✕ in its header)</span>
          </div>
        </div>
      ) : (p.pane_kind === "ultraplan" || p.pane_kind === "breakdown") ? (
        <ShapeTreePane p={p} panes={panes} sessionId={sid!} onChanged={() => sid && loadSession(sid)} />
      ) : (p.pane_kind === "intent") ? (
        <BrainstormPane p={p} panes={panes} sessionId={sid!} onChanged={() => sid && loadSession(sid)} />
      ) : (p.pane_kind === "swarm") ? (
        <ExecutePane p={p} sessionId={sid!} onChanged={() => sid && loadSession(sid)} />
      ) : (p.pane_kind === "judgment") ? (
        <JudgmentPane p={p} panes={panes} sessionId={sid!} />
      ) : (p.pane_kind === "orchestrator") ? (
        <OrchestratorPane p={p} panes={panes} sessionId={sid!} frames={frames}
          onRenameFrame={(fid, title) => saveBoard(frames.map((f) => (f.id === fid ? { ...f, title } : f)), binds)}
          onDissolveFrame={(fid) => {
            const memberIds = new Set(panes.filter((x) => paneSettings(x).collection === fid).map((x) => x.id));
            saveBoard(frames.filter((f) => f.id !== fid), binds.filter((b) => !b.every((id) => memberIds.has(id))));
          }} />
      ) : (
        <>
          <div style={{ padding: "3px 10px", fontFamily: mono, fontSize: 9.5, color: C.dim, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={`${p.scope.join(" · ")} · ${p.grants.join("/")}`}>
            {p.scope.length ? p.scope.join(" · ") : "(unrestricted)"} · {p.grants.join("/")}
          </div>
          {p.chat_session_id ? (
            /* EPIC-VIBE-CHAT-UNIFICATION M4: the pane thread IS the chat — same Turn
               component (bubbles · trace trail · AI badge · widgets), pane skin. */
            <PaneChatThread chatSessionId={p.chat_session_id} busy={!!busy[p.id]}
              notes={notes.filter((n) => n.pane_id === p.id)}
              onSendText={(text) => send(p.id, text)} />
          ) : (
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
            {notes.filter((n) => n.pane_id === p.id).map((n) => (
              <div key={n.id} style={{ fontFamily: mono, fontSize: 10.5, color: n.body_md.startsWith("🧑") ? C.fg : C.muted, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{n.body_md}</div>
            ))}
            {busy[p.id] && <div style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>working…</div>}
          </div>
          )}
          <TurnProcess t={lastTurn[p.id]} />
          <PendingPlan p={p} busy={!!busy[p.id]} onOp={(op) => paneOp(p.id, op)} />
          <div style={{ display: "flex", gap: 6, padding: "6px 10px", borderTop: `1px solid ${C.border}`, background: C.panel }}>
            <textarea value={compose[p.id] || ""} onChange={(e) => setCompose((c) => ({ ...c, [p.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(p.id); }}
              placeholder="message this agent (⌘/Ctrl+Enter) · @other to hand off" style={{ ...inp, flex: 1, minHeight: 32, maxHeight: 90, resize: "vertical" }} />
            <button onClick={() => send(p.id)} disabled={busy[p.id]} style={{ ...btn, alignSelf: "flex-end" }}>↑</button>
          </div>
        </>
      )}
    </React.Fragment>
  );
  const sessionCost = panes.reduce((s, p) => s + (p.cost_usd || 0), 0);
  const entries = React.useMemo<Entry[]>(() => {
    const folders = new Set<string>(); const files: string[] = [];
    for (const n of atlasNodes) {
      if (n?.type !== "file" || !n?.path) continue;
      const path = String(n.path); files.push(path);
      const parts = path.split("/"); parts.pop();
      let acc = ""; for (const part of parts) { acc = acc ? `${acc}/${part}` : part; folders.add(acc); }
    }
    const all: Entry[] = [...[...folders].map((f) => ({ path: f, dir: true })), ...files.map((f) => ({ path: f, dir: false }))];
    all.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return all;
  }, [atlasNodes]);
  // WRITES transparency (operator 2026-07-14: token sums on scopes): what the
  // selected scope COVERS — file count + ≈tokens from the atlas token map.
  const fmtTok = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));
  const scopeStats = React.useMemo(() => {
    const globs = fScope.split(",").map((s) => s.trim()).filter(Boolean);
    if (!globs.length) return null;
    const dirBase = (g: string) => (g.endsWith("/**") ? g.slice(0, -2) : null);
    let files = 0; let tok = 0;
    for (const e of entries) {
      if (e.dir) continue;
      const covered = globs.includes(e.path) || globs.some((g) => { const b = dirBase(g); return b != null && (e.path + "/").startsWith(b); });
      if (covered) { files++; tok += Number(fileTok?.[e.path] ?? 0); }
    }
    return { files, tok };
  }, [fScope, entries, fileTok]);
  const scopeSumLine = (
    <span style={{ fontFamily: mono, fontSize: 8.5, color: C.warn }}>
      {scopeStats ? `✍ WRITES: covers ${scopeStats.files} file${scopeStats.files === 1 ? "" : "s"}${scopeStats.tok ? ` · ≈${fmtTok(scopeStats.tok)} tok` : ""}` : "✍ WRITES: no scope selected = unrestricted (gated at merge)"}
    </span>
  );
  const readsLine = (
    <span style={{ fontFamily: mono, fontSize: 8.5, color: C.ok }}>
      👁 READS (context): mission + shared context docs — sources embedded at turn time · tune per-agent in the Context Studio
    </span>
  );

  return (
    /* VIEWPORT-bounded (operator 2026-07-14: "when zooming there is no way to
       scroll or drag horizontal — horizontal navigation is blocked"): the shell
       let this root GROW with the canvas, so the board (overflow:auto) never
       overflowed — pan writes boardRef.scrollLeft/Top, which had zero range, and
       only the PAGE scrolled (wheel = vertical only → horizontal felt blocked;
       it also birthed the far-away-buttons saga). 100dvh is exact: the rail is
       the only chrome and it spans the full viewport height. flex-basis pins the
       size even where the parent chain's height is indefinite. */
    <div ref={rootRef} style={{ display: "flex", flexDirection: "column", flex: "0 0 100dvh", height: "100dvh", maxHeight: "100dvh", minHeight: 0, overflow: "hidden" }}>
      <style>{`@keyframes vibeRise { from { opacity: 0; transform: translateY(10px) scale(.85); } to { opacity: 1; transform: none; } } @keyframes vibePulse { 0%, 100% { box-shadow: 0 0 0 0 var(--pulse); } 50% { box-shadow: 0 0 16px 3px var(--pulse); } }`}</style>
      {/* header — doubles as the chat mode bar (Agent · Vibe · DeepSearch) */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "10px 14px", flexWrap: "wrap" }}>
        {sid != null && (
          <button onClick={() => setSid(null)} title="back to the vibe dashboard"
            style={{ ...btn, padding: "2px 10px", fontSize: 12, color: C.muted, display: "inline-flex", alignItems: "center", gap: 5 }}>← dashboard</button>
        )}
        <span style={{ fontFamily: mono, fontSize: 13, color: C.fg, fontWeight: 600 }}>Canvas</span>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: C.muted }}>{sid ? `super-session · ${panes.length} agent-session${panes.length === 1 ? "" : "s"}` : "scoped agents · worktree-isolated · gated merge"}</span>
        {sessionCost > 0 && <span style={{ fontFamily: mono, fontSize: 10, color: C.ok }} title="total AI spend this session (BYOK, metered)">${sessionCost.toFixed(4)}</span>}
        <span style={{ flex: 1 }} />
      </div>
      {/* header ACTIONS — VIEWPORT-pinned at the bottom-right (operator 2026-07-14,
          three directives in order: "float fixed" → "bottom right" → "everything
          that is not the agent/vibe/research tabs collapsed in a single icon,
          beautifully"). So the pill is [❖ session hub] + mode tabs; the hub menu
          opens UPWARD with the session list, + new session, ▸ PRs and ✕ close. */}
      <div style={{ position: "fixed", bottom: 18, right: 18, zIndex: 150, display: "flex", gap: 8, alignItems: "center", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, padding: "4px 7px", boxShadow: "0 3px 14px rgba(0,0,0,.3)" }}>
        <div style={{ position: "relative" }}>
          <button onClick={() => setSessOpen((o) => !o)} title={sid ? `session: ${sessions.find((s) => s.id === sid)?.name ?? sid} — sessions & actions` : "sessions & actions"}
            style={{ position: "relative", width: 30, height: 30, borderRadius: 8, cursor: "pointer", display: "grid", placeItems: "center", fontSize: 14, transition: "all .15s", color: sid ? C.brand : C.muted, border: `1px solid ${sessOpen ? C.brand : C.border}`, background: sessOpen ? `color-mix(in oklab, ${C.brand} 10%, transparent)` : "transparent" }}>
            ❖
            {sid != null && <span style={{ position: "absolute", top: 3, right: 3, width: 6, height: 6, borderRadius: "50%", background: sessions.find((s) => s.id === sid)?.status === "active" ? C.ok : C.dim, boxShadow: `0 0 6px color-mix(in oklab, ${C.ok} 60%, transparent)` }} />}
          </button>
          {sessOpen && (
            <div onMouseLeave={() => setSessOpen(false)} style={{ position: "absolute", bottom: "calc(100% + 10px)", right: 0, zIndex: 120, width: 276, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 7, boxShadow: "0 12px 38px rgba(0,0,0,.5)", display: "flex", flexDirection: "column", gap: 4, animation: "vibeRise .18s cubic-bezier(.2,.9,.3,1.2) backwards" }}>
              <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, letterSpacing: 1.2, textTransform: "uppercase", padding: "3px 8px 1px" }}>super-sessions</span>
              <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {!sessions.length && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim, padding: "6px 10px" }}>no sessions yet</span>}
                {sessions.map((s, si2) => {
                  const on = s.id === sid;
                  return (
                    <button key={s.id} onClick={() => { setSid(s.id); setSessOpen(false); }}
                      style={{ textAlign: "left", cursor: "pointer", border: `1px solid ${on ? C.brand : "transparent"}`, background: on ? `color-mix(in oklab, ${C.brand} 9%, transparent)` : "transparent", borderRadius: 8, padding: "7px 10px", display: "flex", alignItems: "center", gap: 9, animation: `vibeRise .25s ${si2 * 0.03}s cubic-bezier(.2,.9,.3,1.2) backwards` }}
                      onMouseEnter={(e) => { if (!on) (e.currentTarget as HTMLElement).style.background = `color-mix(in oklab, ${C.fg} 5%, transparent)`; }}
                      onMouseLeave={(e) => { if (!on) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: s.status === "active" ? C.ok : s.status === "merged" ? C.brand : C.dim }} title={s.status} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "block", fontFamily: mono, fontSize: 11, color: on ? C.fg : C.muted, fontWeight: on ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                        <span style={{ display: "block", fontFamily: mono, fontSize: 8.5, color: C.dim }}>{s.status}{s.mode ? ` · ${s.mode}` : ""}{s.created_at ? ` · ${String(s.created_at).slice(5, 10)}` : ""}</span>
                      </span>
                      {on && <span style={{ fontFamily: mono, fontSize: 10, color: C.brand }}>✓</span>}
                    </button>
                  );
                })}
              </div>
              {sid != null && (
                <button onClick={() => { setSid(null); setSessOpen(false); }} style={{ ...btn, fontSize: 9.5, color: C.muted, borderColor: "transparent", textAlign: "left" }}>⏏ leave session (overview)</button>
              )}
              <span style={{ height: 1, background: C.border, margin: "3px 2px" }} />
              <button onClick={() => { setCreating(true); setSessOpen(false); window.scrollTo({ top: 0, left: 0 }); }}
                style={{ textAlign: "left", cursor: "pointer", border: "1px solid transparent", background: "transparent", borderRadius: 8, padding: "7px 10px", fontFamily: mono, fontSize: 10.5, color: C.ok, display: "flex", alignItems: "center", gap: 8 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `color-mix(in oklab, ${C.ok} 7%, transparent)`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>＋ new session</button>
              {sid != null && (
                <button onClick={() => { setSessOpen(false); integrate(); }} title="open pull requests for the panes' changes"
                  style={{ textAlign: "left", cursor: "pointer", border: "1px solid transparent", background: "transparent", borderRadius: 8, padding: "7px 10px", fontFamily: mono, fontSize: 10.5, color: C.warn, display: "flex", alignItems: "center", gap: 8 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `color-mix(in oklab, ${C.warn} 7%, transparent)`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>▸ pull requests</button>
              )}
              {sid != null && panes.length > 0 && (
                <button onClick={() => { setSessOpen(false); saveAsFormation(); }} title="freeze this board into a custom formation — it joins the add-pane gallery under Collections"
                  style={{ textAlign: "left", cursor: "pointer", border: "1px solid transparent", background: "transparent", borderRadius: 8, padding: "7px 10px", fontFamily: mono, fontSize: 10.5, color: C.brand, display: "flex", alignItems: "center", gap: 8 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `color-mix(in oklab, ${C.brand} 7%, transparent)`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>▧ save board as formation</button>
              )}
              {sid != null && (
                <button onClick={() => { setSessOpen(false); setComposerOpen(true); }} title="compose a personalized formation — nodes wired by inputs/outputs; agent steps auto-run, tool steps pause"
                  style={{ textAlign: "left", cursor: "pointer", border: "1px solid transparent", background: "transparent", borderRadius: 8, padding: "7px 10px", fontFamily: mono, fontSize: 10.5, color: C.brand, display: "flex", alignItems: "center", gap: 8 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `color-mix(in oklab, ${C.brand} 7%, transparent)`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>🧪 compose formation (wired)</button>
              )}
              {sid != null && (
                <button onClick={() => { setSessOpen(false); if (sid != null) void archiveSession(sid); }} title="shelve this session — worktrees kept, reopen any time from the archive"
                  style={{ textAlign: "left", cursor: "pointer", border: "1px solid transparent", background: "transparent", borderRadius: 8, padding: "7px 10px", fontFamily: mono, fontSize: 10.5, color: C.muted, display: "flex", alignItems: "center", gap: 8 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `color-mix(in oklab, ${C.fg} 5%, transparent)`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>🗄 archive session</button>
              )}
              {sid != null && (
                <button onClick={() => { setSessOpen(false); closeSession(); }} title="abandon + tear down worktrees"
                  style={{ textAlign: "left", cursor: "pointer", border: "1px solid transparent", background: "transparent", borderRadius: 8, padding: "7px 10px", fontFamily: mono, fontSize: 10.5, color: C.bad, display: "flex", alignItems: "center", gap: 8 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `color-mix(in oklab, ${C.bad} 7%, transparent)`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>✕ close session</button>
              )}
            </div>
          )}
        </div>
        {/* on the dashboard the goal bar carries the mode tabs — the pill only
            duplicates them INSIDE a session, where there is no composer */}
        {setMode && sid != null && <span style={{ width: 1, height: 16, background: C.border }} />}
        {setMode && sid != null && <ModeSwitch mode={mode} setMode={setMode} />}
      </div>
      {/* OUTCOME SHELF — the session's trophy row, pinned bottom-center: every
          deliverable this session produced, each row flying to its source pane. */}
      {sid != null && outcomes.length > 0 && (
        <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 18, zIndex: 150 }}>
          {shelfOpen && (
            <div onMouseLeave={() => setShelfOpen(false)} style={{ position: "absolute", bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)", width: 280, maxHeight: 300, overflowY: "auto", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 7, boxShadow: "0 12px 38px rgba(0,0,0,.5)", display: "flex", flexDirection: "column", gap: 3, animation: "vibeRise .18s cubic-bezier(.2,.9,.3,1.2) backwards" }}>
              <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, letterSpacing: 1.2, textTransform: "uppercase", padding: "3px 8px 1px" }}>this session produced</span>
              {outcomes.map((o, oi) => (
                <button key={oi} onClick={() => { setShelfOpen(false); o.run(); }}
                  style={{ textAlign: "left", cursor: "pointer", border: "1px solid transparent", background: "transparent", borderRadius: 8, padding: "6px 9px", display: "flex", alignItems: "center", gap: 9, animation: `vibeRise .25s ${oi * 0.03}s cubic-bezier(.2,.9,.3,1.2) backwards` }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `color-mix(in oklab, ${C.fg} 5%, transparent)`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, display: "grid", placeItems: "center", fontSize: 10, flex: "none", background: `color-mix(in oklab, ${o.tint} 15%, transparent)`, color: o.tint }}>{o.icon}</span>
                  <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setShelfOpen((o) => !o)} title="the outcome shelf — what this session produced"
            style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 12px", fontSize: 10, color: C.ok, borderColor: shelfOpen ? C.ok : C.border, background: C.panel, boxShadow: "0 3px 14px rgba(0,0,0,.3)" }}>
            ▤ outcomes <span style={{ fontWeight: 700 }}>{outcomes.length}</span>
          </button>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

      {creating && (
        <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="session name (e.g. ship login)" style={{ ...inp }} />
          <textarea value={mission} onChange={(e) => setMission(e.target.value)} placeholder="mission brief — the shared, read-only goal every pane sees" style={{ ...inp, minHeight: 54, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>base branch</span>
            <input value={base} onChange={(e) => setBase(e.target.value)} style={{ ...inp, width: 120 }} />
            <button onClick={createSession} style={{ ...btn, color: C.ok, borderColor: C.ok }}>create</button>
          </div>
        </div>
      )}

      {!sid && !creating && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* FIRST FLIGHT — the goal box: win once before learning anything.
              Two personas race the goal in isolated worktrees; you merge the
              winner. The whole gallery of depth stays one click away. */}
          {/* THE FLEET DASHBOARD (operator 2026-07-14: "the sessions list screen is
              ugly — make it a dashboard of all sessions: graphs, stats, cool info").
              Everything derives client-side from the overview payload (panes, cost,
              calls, status, created_at per session) — no chart lib, pure CSS. */}
          {(() => {
            const ssAll: any[] = overview?.sessions || [];
            const archivedSs = ssAll.filter((s3: any) => s3.status === "archived");
            const ss: any[] = ssAll.filter((s3: any) => s3.status !== "archived");
            const maxCost = Math.max(0.0001, ...ss.map((s) => s.cost_usd || 0));
            const topSpend = [...ss].filter((s) => (s.cost_usd || 0) > 0).sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0)).slice(0, 6);
            const nAct = ss.filter((s) => s.status === "active").length;
            const nMer = ss.filter((s) => s.status === "merged").length;
            const nOth = ss.length - nAct - nMer;
            const tot = Math.max(1, ss.length);
            const degA = (nAct / tot) * 360; const degM = degA + (nMer / tot) * 360;
            const days: Array<{ key: string; label: string; n: number }> = [];
            for (let i = 13; i >= 0; i--) {
              const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
              days.push({ key, label: key.slice(8), n: ss.filter((s) => String(s.created_at ?? "").slice(0, 10) === key).length });
            }
            const maxDay = Math.max(1, ...days.map((d) => d.n));
            const KPI = [
              { icon: "❖", tint: C.brand, label: "super-sessions", val: overview?.totals?.sessions ?? 0 },
              { icon: "●", tint: C.ok, label: "active now", val: overview?.totals?.active ?? 0 },
              { icon: "⚉", tint: C.warn, label: "agents", val: overview?.totals?.panes ?? 0 },
              { icon: "⚡", tint: C.brand, label: "AI turns", val: overview?.totals?.calls ?? 0 },
              { icon: "⛽", tint: C.ok, label: "total spend", val: "$" + (overview?.totals?.cost_usd ?? 0).toFixed(4) },
            ];
            const chartBox = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column" as const, gap: 8, minWidth: 0 };
            const chartTitle = { fontFamily: mono, fontSize: 8.5, color: C.dim, letterSpacing: 1.2, textTransform: "uppercase" as const };
            return (<>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                {KPI.map((k, ki) => (
                  <div key={k.label} style={{ position: "relative", overflow: "hidden", background: `linear-gradient(135deg, color-mix(in oklab, ${k.tint} 9%, ${C.panel}), ${C.panel} 60%)`, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, animation: `vibeRise .3s ${ki * 0.05}s cubic-bezier(.2,.9,.3,1.2) backwards` }}>
                    <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", fontSize: 14, background: `color-mix(in oklab, ${k.tint} 16%, transparent)`, border: `1px solid color-mix(in oklab, ${k.tint} 40%, transparent)`, color: k.tint }}>{k.icon}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontFamily: mono, fontSize: 19, color: C.fg, fontWeight: 700, lineHeight: 1.1 }}>{k.val}</span>
                      <span style={{ display: "block", fontFamily: mono, fontSize: 9, color: C.muted }}>{k.label}</span>
                    </span>
                  </div>
                ))}
              </div>
              {ss.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                  <div style={chartBox}>
                    <span style={chartTitle}>spend by session</span>
                    {topSpend.length === 0 && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>no spend yet — the meter starts with the first AI turn</span>}
                    {topSpend.map((s) => (
                      <div key={s.id} onClick={() => setSid(s.id)} style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                          <span style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, flex: "none" }}>${(s.cost_usd || 0).toFixed(3)}</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: `color-mix(in oklab, ${C.border} 60%, transparent)`, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.max(3, Math.round(((s.cost_usd || 0) / maxCost) * 100))}%`, borderRadius: 3, background: `linear-gradient(90deg, color-mix(in oklab, ${C.brand} 55%, transparent), ${C.brand})` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={chartBox}>
                    <span style={chartTitle}>fleet status</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
                      <div style={{ position: "relative", width: 92, height: 92, flex: "none", borderRadius: "50%", background: `conic-gradient(${C.ok} 0deg ${degA}deg, ${C.brand} ${degA}deg ${degM}deg, color-mix(in oklab, ${C.dim} 45%, transparent) ${degM}deg 360deg)` }}>
                        <div style={{ position: "absolute", inset: 11, borderRadius: "50%", background: C.panel, display: "grid", placeItems: "center" }}>
                          <span style={{ fontFamily: mono, fontSize: 17, color: C.fg, fontWeight: 700 }}>{ss.length}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {[{ c: C.ok, l: "active", n: nAct }, { c: C.brand, l: "merged", n: nMer }, { c: C.dim, l: "other", n: nOth }].map((r) => (
                          <span key={r.l} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: mono, fontSize: 10, color: C.muted }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.c }} /> {r.n} {r.l}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={chartBox}>
                    <span style={chartTitle}>sessions started · last 14 days</span>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, flex: 1, minHeight: 64 }}>
                      {days.map((d) => (
                        <div key={d.key} title={`${d.key} — ${d.n} session${d.n === 1 ? "" : "s"}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 2, minWidth: 0 }}>
                          <div style={{ height: `${Math.max(d.n > 0 ? 14 : 3, Math.round((d.n / maxDay) * 100))}%`, minHeight: d.n > 0 ? 8 : 2, borderRadius: 3, background: d.n > 0 ? `linear-gradient(180deg, ${C.brand}, color-mix(in oklab, ${C.brand} 45%, transparent))` : `color-mix(in oklab, ${C.border} 60%, transparent)` }} />
                          <span style={{ fontFamily: mono, fontSize: 6.5, color: C.dim, textAlign: "center" }}>{d.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, letterSpacing: 1.2, textTransform: "uppercase" }}>super-sessions</span>
                <span style={{ flex: 1, height: 1, background: C.border }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10 }}>
                {ss.map((s: any, si3: number) => {
                  const tone = s.status === "active" ? C.ok : s.status === "merged" ? C.brand : C.dim;
                  return (
                    <div key={s.id} onClick={() => setSid(s.id)}
                      onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(-2px)"; el.style.borderColor = tone; }}
                      onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.transform = ""; el.style.borderColor = C.border; }}
                      style={{ background: `linear-gradient(150deg, color-mix(in oklab, ${tone} 7%, ${C.panel}), ${C.panel} 55%)`, border: `1px solid ${C.border}`, borderRadius: 12, padding: 13, cursor: "pointer", display: "flex", flexDirection: "column", gap: 7, transition: "transform .15s, border-color .15s", animation: `vibeRise .3s ${Math.min(si3, 12) * 0.04}s cubic-bezier(.2,.9,.3,1.2) backwards` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", flex: "none", background: tone, ...(s.status === "active" ? { ["--pulse" as any]: `color-mix(in oklab, ${C.ok} 45%, transparent)`, animation: "vibePulse 1.9s ease-in-out infinite" } : {}) }} />
                        <span style={{ fontFamily: mono, fontSize: 12.5, color: C.fg, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                        <span style={{ flex: 1 }} />
                        {s.mode && <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 7px" }}>{s.mode}</span>}
                        <button onClick={(e) => { e.stopPropagation(); archiveSession(s.id); }} title="archive this session (worktrees kept)"
                          style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, fontSize: 11, padding: 0 }}>🗄</button>
                        <span style={{ fontFamily: mono, fontSize: 9, color: tone }}>{s.status}</span>
                      </div>
                      <div style={{ display: "flex", gap: 10, fontFamily: mono, fontSize: 9.5, color: C.muted }}>
                        <span title="agents">⚉ {s.panes}</span>
                        <span title="AI turns">⚡ {s.calls}</span>
                        <span title="spend">⛽ ${(s.cost_usd || 0).toFixed(3)}</span>
                        <span style={{ flex: 1 }} />
                        {s.created_at && <span style={{ color: C.dim }}>{String(s.created_at).slice(5, 10)}</span>}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: `color-mix(in oklab, ${C.border} 60%, transparent)`, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.max(2, Math.round(((s.cost_usd || 0) / maxCost) * 100))}%`, borderRadius: 2, background: `linear-gradient(90deg, color-mix(in oklab, ${tone} 50%, transparent), ${tone})` }} />
                      </div>
                      {s.agents && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.agents}</div>}
                    </div>
                  );
                })}
                {ss.length === 0 && <div style={{ ...padded }}>no sessions yet — type a goal in the bar below and hit ▶.</div>}
              </div>
              {archivedSs.length > 0 && (
                <details style={{ marginTop: 2 }}>
                  <summary style={{ cursor: "pointer", fontFamily: mono, fontSize: 9, color: C.dim, letterSpacing: 1, textTransform: "uppercase" }}>🗄 archive ({archivedSs.length})</summary>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 8, marginTop: 8 }}>
                    {archivedSs.map((s: any) => (
                      <div key={s.id} onClick={() => setSid(s.id)} title="open the archived session" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 11, cursor: "pointer", opacity: 0.7, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: mono, fontSize: 11, color: C.muted, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                        <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>⚉ {s.panes ?? 0} · ${(s.cost_usd || 0).toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>);
          })()}
        </div>
          {/* THE GOAL BAR IS GONE (operator 2026-07-20: "remove the chat that is
              there, reuse the transparent draggable one") — the DOCK FIELD is the
              concierge's input now (registered below via useDockSurface). Only the
              editable preview remains, anchored where the bar used to sit. */}
          <div style={{ flexShrink: 0, padding: "6px 14px 14px" }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 820, margin: "0 auto" }}>
            {heroErr && !heroCrew && <div title={heroErr} style={{ fontFamily: mono, fontSize: 9.5, color: C.bad, textAlign: "center", padding: "2px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>✕ {heroErr}</div>}
            {/* THE PREVIEW IS A SUGGESTION (operator 2026-07-14): everything here
                is editable before anything exists — toggle shared-context chips,
                uncheck proposed panes, check IN unproposed kinds from "add more",
                read each pane's context tags. ▶ prepare & spawn applies it all:
                context docs first, then panes, then per-pane excludes. */}
            {heroCrew && (
              <div style={{ position: "absolute", bottom: "calc(100% + 12px)", left: "50%", transform: "translateX(-50%)", width: "min(780px, 92vw)", maxHeight: "58vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, textAlign: "left", background: `color-mix(in oklab, ${C.panel} 86%, transparent)`, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: `1px solid color-mix(in oklab, ${C.brand} 24%, ${C.border})`, borderRadius: 14, padding: 14, boxShadow: "0 14px 44px rgba(0,0,0,.5)", animation: "vibeRise .18s cubic-bezier(.2,.9,.3,1.2) backwards" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: mono, fontSize: 11, color: C.brand, fontWeight: 700, flex: "none" }}>⚑ session wizard</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{heroCrew.goal}</span>
                  <button onClick={() => setHeroCrew(null)} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 10, flex: "none" }}>✕</button>
                </div>
                {heroCrew.loading && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "26px 0" }}>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", border: `3px solid ${C.border}`, borderTopColor: C.brand, animation: "spin 0.9s linear infinite" }} />
                    <style>{`@keyframes spin { to { transform: rotate(1turn); } }`}</style>
                    <span style={{ fontFamily: mono, fontSize: 10.5, color: C.muted }}>the concierge is reading your goal + the whole context — assembling the best crew…</span>
                  </div>
                )}
                {!heroCrew.loading && heroCrew.error && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: "8px 2px" }}>
                    <span style={{ fontFamily: mono, fontSize: 10.5, color: C.bad }}>✕ {heroCrew.error}</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { const g = heroCrew.goal; setHeroCrew(null); setHeroGoal(g); void firstFlight(); }} style={{ ...btn, fontSize: 10.5, color: C.brand, borderColor: C.brand }}>↻ retry</button>
                      {heroCrew.sid != null && (
                        <button onClick={async () => { if (heroBusy || heroCrew.sid == null) return; setHeroBusy(true); try { await spawnDuo(heroCrew.sid, heroCrew.goal); await enterSession(heroCrew.sid); } finally { setHeroBusy(false); } }}
                          style={{ ...btn, fontSize: 10.5, color: C.muted }}>use the classic duo instead</button>
                      )}
                    </div>
                  </div>
                )}
                {heroCrew.mission && heroCrew.mission !== heroCrew.goal && (
                  <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, textAlign: "left", lineHeight: 1.5, background: `color-mix(in oklab, ${C.brand} 5%, transparent)`, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px" }}>{heroCrew.mission}</div>
                )}
                {heroCrew.shared.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                    <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>shared context</span>
                    {heroCrew.shared.map((s, si4) => (
                      <button key={s.key} onClick={() => setHeroCrew((hc) => (hc ? { ...hc, shared: hc.shared.map((x, xi) => (xi === si4 ? { ...x, on: !x.on } : x)) } : hc))}
                        title={s.on ? "click to drop this source from the session" : "click to include it"}
                        style={{ fontFamily: mono, fontSize: 9.5, padding: "2px 9px", borderRadius: 20, cursor: "pointer", border: `1px solid ${s.on ? C.ok : C.border}`, background: s.on ? `color-mix(in oklab, ${C.ok} 13%, transparent)` : "transparent", color: s.on ? C.ok : C.dim }}>{s.on ? "✓ " : "+ "}{s.label}</button>
                    ))}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(225px, 1fr))", gap: 8 }}>
                  {heroCrew.panes.map((cp, cpi) => {
                    const id2 = (KIND_IDENT as any)[cp.kind] ?? { glyph: "◈", color: C.brand };
                    return (
                      <button key={cpi} onClick={() => setHeroCrew((hc) => (hc ? { ...hc, panes: hc.panes.map((x, xi) => (xi === cpi ? { ...x, on: !x.on } : x)) } : hc))}
                        title={cp.on ? "click to leave this pane out" : "click to include it"}
                        style={{ textAlign: "left", cursor: "pointer", borderRadius: 11, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 5, border: `1px solid ${cp.on ? C.brand : C.border}`, background: cp.on ? `linear-gradient(160deg, color-mix(in oklab, ${id2.color} 8%, ${C.panel}), ${C.panel} 70%)` : "transparent", opacity: cp.on ? 1 : 0.5, animation: `vibeRise .25s ${cpi * 0.05}s cubic-bezier(.2,.9,.3,1.2) backwards` }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center", fontSize: 11.5, flex: "none", background: `color-mix(in oklab, ${id2.color} 16%, transparent)`, border: `1px solid color-mix(in oklab, ${id2.color} 40%, transparent)`, color: id2.color }}>{id2.glyph}</span>
                          <span style={{ fontFamily: mono, fontSize: 11, color: C.fg, fontWeight: 700, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cp.label}</span>
                          {cp.kind === "agent" && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }} title="persona">↳{cp.agent}</span>}
                          <span style={{ fontFamily: mono, fontSize: 11, color: cp.on ? C.ok : C.dim }}>{cp.on ? "✓" : "○"}</span>
                        </span>
                        <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, lineHeight: 1.4 }}>{cp.why}</span>
                        <span style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {(cp.reads.length ? cp.reads : ["__all__"]).map((rk) => (
                            <span key={rk} style={{ fontFamily: mono, fontSize: 7.5, color: rk === "__all__" ? C.dim : C.brand, border: `1px solid ${rk === "__all__" ? C.border : `color-mix(in oklab, ${C.brand} 40%, transparent)`}`, borderRadius: 999, padding: "0px 6px" }}>
                              {rk === "__all__" ? "reads all shared" : `⇢ ${SRC_LABEL[rk] ?? rk}`}
                            </span>
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  const extras = PANE_KINDS.filter((m) => (m.group === "tools" || m.key === "agent") && !m.soon && !heroCrew.panes.some((p) => p.kind === m.key && p.on));
                  return extras.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                      <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>add more</span>
                      {extras.map((m) => { const id2 = (KIND_IDENT as any)[m.key] ?? { glyph: "▦", color: C.dim }; return (
                        <button key={m.key} title={m.desc}
                          onClick={() => setHeroCrew((hc) => (hc ? { ...hc, panes: [...hc.panes, { kind: m.key, label: m.key === "agent" ? "extra agent" : m.key, agent: "forge", why: "added by you", reads: [], on: true }] } : hc))}
                          style={{ fontFamily: mono, fontSize: 9.5, padding: "2px 9px", borderRadius: 20, cursor: "pointer", border: `1px dashed ${C.border}`, background: "transparent", color: id2.color, display: "inline-flex", alignItems: "center", gap: 4 }}>+ {id2.glyph} {m.key}</button>
                      ); })}
                    </div>
                  ) : null;
                })()}
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  <button onClick={spawnCrew} disabled={heroBusy || !heroCrew.panes.some((x) => x.on)}
                    style={{ padding: "9px 22px", fontSize: 11.5, fontFamily: mono, fontWeight: 700, borderRadius: 10, border: "1px solid transparent", cursor: "pointer", color: C.bg, background: `linear-gradient(120deg, ${C.ok}, color-mix(in oklab, ${C.ok} 55%, ${C.brand}))`, opacity: heroBusy || !heroCrew.panes.some((x) => x.on) ? 0.5 : 1 }}>
                    {heroBusy ? "preparing the session…" : `▶ prepare & spawn ${heroCrew.panes.filter((x) => x.on).length} pane${heroCrew.panes.filter((x) => x.on).length === 1 ? "" : "s"}`}
                  </button>
                  <button onClick={async () => { if (heroBusy || !heroCrew || heroCrew.sid == null) return; const s2 = heroCrew.sid; setHeroBusy(true); try { await spawnDuo(s2, heroCrew.goal); await enterSession(s2); } finally { setHeroBusy(false); } }} disabled={heroBusy || heroCrew.sid == null}
                    style={{ ...btn, padding: "8px 14px", fontSize: 10.5, color: C.muted }}>just the two racers</button>
                  <button onClick={() => setHeroCrew(null)} disabled={heroBusy} style={{ ...btn, padding: "8px 14px", fontSize: 10.5, color: C.dim, borderColor: "transparent" }}>✎ different goal</button>
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {sid && data && (
        <>
          {(data.session?.mission_md || integ?.opened != null) && (
            <div style={{ padding: "7px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 3 }}>
              {data.session?.mission_md && <div style={{ fontFamily: mono, fontSize: 11, color: C.fg }}><span style={{ color: C.dim }}>mission · </span>{data.session.mission_md}</div>}
              {integ?.opened != null && <div style={{ fontFamily: mono, fontSize: 10.5, color: C.ok }}>opened {integ.opened} pull request{integ.opened === 1 ? "" : "s"} — review + merge them in the Pulls tab (⇄).</div>}
            </div>
          )}

          {(Object.values(busy).some(Boolean) || promoteMsg) && (
            <div style={{ display: "flex", gap: 8, padding: "5px 14px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
              {Object.values(busy).some(Boolean) && <button onClick={stopAll} title="stop all running pane turns" style={{ ...btn, color: C.bad, borderColor: C.bad }}>■ stop all</button>}
              {promoteMsg && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.ok }}>{promoteMsg}</span>}
            </div>
          )}

          {/* THE BOARD — an infinite canvas (operator 2026-07-14): free positions,
              right-drag pans ANY direction, group frames travel with their panes,
              zoom scales the whole surface (sizer keeps scroll extents honest). */}
          {(() => {
            const placed = panes.map((p, i) => ({ p, i, pos: posOf(p, i) }));
            let extX = 0; let extY = 0; let minX = 0; let minY = 0;
            for (const { p, pos } of placed) { extX = Math.max(extX, pos.x + paneW(p)); extY = Math.max(extY, pos.y + paneH(p)); minX = Math.min(minX, pos.x); minY = Math.min(minY, pos.y); }
            for (const f of frames) { extX = Math.max(extX, f.x + f.w); extY = Math.max(extY, f.y + f.h); minX = Math.min(minX, f.x); minY = Math.min(minY, f.y); }
            for (const cm of comments) { extX = Math.max(extX, cm.x + CMT_W + 40); extY = Math.max(extY, cm.y + (cmtHRef.current[cm.id] ?? 64) + 40); minX = Math.min(minX, cm.x); minY = Math.min(minY, cm.y); }
            const addPos = autoPos(panes.length + ghosts.length);
            extX = Math.max(extX, addPos.x + PW); extY = Math.max(extY, addPos.y + PH);
            // distant panes get REAL scroll space at any zoom (operator
            // 2026-07-15: "some blocks are missed — the space should expand
            // as long as panes are distant"): negative territory translates
            // into the canvas, positive extents carry a wider margin.
            const offX = minX < 0 ? -minX + 60 : 0; const offY = minY < 0 ? -minY + 60 : 0;
            offRef.current = { x: offX, y: offY };
            const CW = Math.max(2600, extX + offX + 900); const CH = Math.max(1700, extY + offY + 900);
            return (
          <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex" }}>
          <div ref={boardRef} onMouseDown={panStart} onContextMenu={(e) => { if (panRef.current?.moved) { e.preventDefault(); panRef.current.moved = false; } }}
            style={{ flex: 1, minHeight: 0, overflow: "auto", cursor: panning ? "grabbing" : undefined, userSelect: panning || boardDrag ? "none" : undefined, background: C.bg }}>
            {/* the sizer keeps SCROLL SPACE at any zoom — at fit-zoom CW*zoom used to
                shrink to the viewport → zero overflow → pan was DEAD (live bug).
                Second act (operator 2026-07-15, wide monitor): the px floor alone
                (CW*0.9 ≈ 2340px) sat NARROWER than the viewport → zero horizontal
                range → right-drag panned vertically only. calc(100% + slack)
                guarantees free pan on BOTH axes at any viewport size. */}
            <div data-canvas="" style={{ width: `max(${Math.max(CW * zoom, CW * 0.9)}px, calc(100% + 600px))`, height: `max(${Math.max(CH * zoom, CH * 0.9)}px, calc(100% + 600px))`, position: "relative" }}>
            <div data-canvas="" style={{ width: CW, height: CH, position: "relative", transform: `scale(${zoom}) translate(${offX}px, ${offY}px)`, transformOrigin: "0 0", backgroundImage: `radial-gradient(circle, ${C.border} 1px, transparent 1px)`, backgroundSize: "28px 28px" }}>
            {/* GROUP FRAMES — behind the panes; the title bar drags the whole group */}
            {frames.filter((f) => !f.template).map((f) => (
              <div key={f.id} data-testid="board-frame" style={{ position: "absolute", left: f.x, top: f.y, width: f.w, height: f.h, border: `1.5px dashed ${f.color}`, borderRadius: 12, background: `color-mix(in oklab, ${f.color} 5%, transparent)` }}>
                <div onMouseDown={(e) => startFrameMove(e, f)} style={{ position: "absolute", top: -1, left: -1, right: -1, display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: "12px 12px 0 0", background: `color-mix(in oklab, ${f.color} 14%, ${C.bg})`, cursor: "grab" }}>
                  {editingFrame === f.id
                    ? <input autoFocus defaultValue={f.title} onBlur={(e) => { setEditingFrame(null); saveBoard(frames.map((x) => (x.id === f.id ? { ...x, title: e.target.value.trim() || x.title } : x))); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} onMouseDown={(e) => e.stopPropagation()} style={{ ...inp, fontSize: 10, padding: "0 6px", width: 160 }} />
                    : <span onDoubleClick={() => setEditingFrame(f.id)} style={{ fontFamily: mono, fontSize: 10.5, color: f.color, fontWeight: 700, cursor: "text" }} title="double-click to rename">{f.template ? "🗼 " : ""}{f.title}</span>}
                  {f.template && <span style={{ fontFamily: mono, fontSize: 8, color: f.color, border: `1px solid ${f.color}`, borderRadius: 8, padding: "0 6px", opacity: 0.85 }} title="a pane COLLECTION — steps wired toward one goal">{f.template}</span>}
                  <span style={{ flex: 1 }} />
                  <button onMouseDown={(e) => e.stopPropagation()} onClick={() => saveBoard(frames.filter((x) => x.id !== f.id))} title="dissolve the group (panes stay)" style={{ ...btn, padding: "0 6px", fontSize: 9, color: C.bad, borderColor: "transparent" }}>✕</button>
                </div>
                <div onMouseDown={(e) => startFrameResize(e, f)} title="resize" style={{ position: "absolute", right: -2, bottom: -2, width: 16, height: 16, cursor: "nwse-resize", borderRight: `3px solid ${f.color}`, borderBottom: `3px solid ${f.color}`, borderRadius: "0 0 10px 0", opacity: 0.8 }} />
              </div>
            ))}
            {marqueeBox && (
              <div style={{ position: "absolute", left: marqueeBox.x, top: marqueeBox.y, width: marqueeBox.w, height: marqueeBox.h, border: `1.5px dashed ${C.warn}`, background: `color-mix(in oklab, ${C.warn} 8%, transparent)`, zIndex: 4, pointerEvents: "none" }} />
            )}
            {bindLine && (
              <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 4, pointerEvents: "none" }}>
                <line x1={bindLine.x1} y1={bindLine.y1} x2={bindLine.x2} y2={bindLine.y2} stroke={C.brand} strokeWidth={2.5} strokeDasharray="7 5" strokeLinecap="round" />
                <circle cx={bindLine.x2} cy={bindLine.y2} r={5} fill={C.brand} />
              </svg>
            )}
            {/* COMMENT ARROWS — above the panes; each re-anchors live to its
                target's CURRENT box: a pane rect, the union box of a whole book
                (kind 'bind'), or a group frame. A dead target = no arrow. */}
            {comments.some((c) => c.target) && (
              <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 5, pointerEvents: "none", overflow: "visible" }}>
                {comments.map((c) => {
                  const t = c.target; if (!t) return null;
                  let box: CmtRect | null = null;
                  if (t.kind === "frame") { const f = frames.find((x) => x.id === t.id); if (f) box = { x: f.x, y: f.y, w: f.w, h: f.h }; }
                  else {
                    const bi2 = t.kind === "bind" ? bindOf(t.id) : -1;
                    const ids = bi2 >= 0 ? binds[bi2] : [t.id];
                    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
                    for (const id of ids) { const j = panes.findIndex((x) => x.id === id); if (j < 0) continue; const q = posOf(panes[j], j); x1 = Math.min(x1, q.x); y1 = Math.min(y1, q.y); x2 = Math.max(x2, q.x + paneW(panes[j])); y2 = Math.max(y2, q.y + paneH(panes[j])); }
                    if (x2 > -Infinity) box = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
                  }
                  if (!box) return null;
                  const { d, head } = cmtArrow({ x: c.x, y: c.y, w: CMT_W, h: cmtHRef.current[c.id] ?? 64 }, box, c.id % 2 ? 1 : -1);
                  return (
                    <g key={c.id} stroke={c.color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.9}>
                      <path d={d} /><path d={head} />
                    </g>
                  );
                })}
              </svg>
            )}
            {noteLine && (
              <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 6, pointerEvents: "none" }}>
                <line x1={noteLine.x1} y1={noteLine.y1} x2={noteLine.x2} y2={noteLine.y2} stroke={C.warn} strokeWidth={2} strokeDasharray="6 5" strokeLinecap="round" />
                <circle cx={noteLine.x2} cy={noteLine.y2} r={5} fill={C.warn} />
              </svg>
            )}
            {/* THE NOTES — bare hand-written text on the canvas (operator: "take
                out the border and background, just text and the arrow the same
                as excalidraw"); a dashed outline appears only on hover/edit so
                the drag surface stays findable. The ○ anchor drags the arrow,
                the hover pill holds 📖 / A− A+ / color / delete. */}
            {comments.map((c) => {
              const editing = editingCmt === c.id;
              const hov = hoverCmt === c.id && !boardDrag;
              const fs = c.size ?? 14;
              const targetBound = c.target && c.target.kind !== "frame" && bindOf(c.target.id) >= 0;
              return (
                <div key={c.id} data-testid="board-comment" onMouseDown={(e) => startCmtMove(e, c)} onDoubleClick={() => setEditingCmt(c.id)}
                  onMouseEnter={() => setHoverCmt(c.id)} onMouseLeave={() => setHoverCmt((h) => (h === c.id ? null : h))}
                  ref={(el) => { if (el && Math.abs((cmtHRef.current[c.id] ?? 0) - el.offsetHeight) > 2) { cmtHRef.current[c.id] = el.offsetHeight; cmtTick(); } }}
                  style={{ position: "absolute", left: c.x, top: c.y, width: CMT_W, zIndex: 6, cursor: "grab", padding: "4px 6px", borderRadius: 6, outline: hov || editing ? `1px dashed color-mix(in oklab, ${c.color} 45%, transparent)` : "none" }}>
                  {editing ? (
                    <textarea autoFocus defaultValue={c.text} maxLength={400} rows={3} placeholder="say it…"
                      onMouseDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
                      onBlur={(e) => { setEditingCmt(null); const text = e.target.value.trim(); saveBoard(frames, undefined, undefined, text ? comments.map((x) => (x.id === c.id ? { ...x, text } : x)) : comments.filter((x) => x.id !== c.id)); }}
                      style={{ width: "100%", background: "transparent", border: "none", outline: "none", resize: "none", color: c.color, fontFamily: CMT_FONT, fontSize: fs, lineHeight: 1.45 }} />
                  ) : (
                    <div title="double-click to edit" style={{ color: c.color, fontFamily: CMT_FONT, fontSize: fs, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word", minHeight: 18 }}>{c.text || "…"}</div>
                  )}
                  {(hov || editing) && (
                    <span data-cmt-anchor="" onMouseDown={(e) => startNoteLine(e, c)} title="drag onto a pane or a group to point the arrow at it — drop on the void to detach"
                      style={{ position: "absolute", left: -9, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, borderRadius: "50%", border: `2.5px solid ${c.color}`, background: c.target ? c.color : C.panel, cursor: "crosshair", boxShadow: `0 0 0 3px color-mix(in oklab, ${c.color} 25%, transparent)` }} />
                  )}
                  {hov && !editing && (
                    /* the paddingTop BRIDGES the visual gap — a bare gap fires
                       mouseleave and unmounts the pill before a click can land */
                    <div onMouseDown={(e) => e.stopPropagation()} style={{ position: "absolute", left: 6, top: "100%", paddingTop: 5, zIndex: 7 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "3px 7px", boxShadow: "0 3px 12px rgba(0,0,0,.3)" }}>
                      {targetBound && (
                        <button onClick={() => saveBoard(frames, undefined, undefined, comments.map((x) => (x.id === c.id ? { ...x, target: { ...x.target, kind: x.target.kind === "bind" ? "pane" : "bind" } } : x)))}
                          title={c.target.kind === "bind" ? "pointing at the WHOLE book — click for just this pane" : "pointing at one pane — click for the whole book"}
                          style={{ ...btn, padding: "0 5px", fontSize: 10, color: c.target.kind === "bind" ? c.color : C.dim, borderColor: "transparent" }}>📖</button>
                      )}
                      <button onClick={() => saveBoard(frames, undefined, undefined, comments.map((x) => (x.id === c.id ? { ...x, size: Math.max(10, (x.size ?? 14) - 2) } : x)))}
                        title="smaller text" style={{ ...btn, padding: "0 5px", fontSize: 9, color: C.muted, borderColor: "transparent" }}>A−</button>
                      <button onClick={() => saveBoard(frames, undefined, undefined, comments.map((x) => (x.id === c.id ? { ...x, size: Math.min(36, (x.size ?? 14) + 2) } : x)))}
                        title="bigger text" style={{ ...btn, padding: "0 5px", fontSize: 11, color: C.muted, borderColor: "transparent" }}>A+</button>
                      <button onClick={() => saveBoard(frames, undefined, undefined, comments.map((x) => (x.id === c.id ? { ...x, color: FRAME_COLORS[(FRAME_COLORS.indexOf(x.color) + 1) % FRAME_COLORS.length] } : x)))}
                        title="next color" style={{ width: 13, height: 13, borderRadius: "50%", background: c.color, border: `1px solid ${C.border}`, cursor: "pointer", padding: 0 }} />
                      <button onClick={() => saveBoard(frames, undefined, undefined, comments.filter((x) => x.id !== c.id))} title="delete the comment" style={{ ...btn, padding: "0 5px", fontSize: 10, color: C.bad, borderColor: "transparent" }}>✕</button>
                    </div>
                    </div>
                  )}
                </div>
              );
            })}
            {ghosts.map((g2, gi) => { const gp = autoPos(panes.length + gi); return (
              <div key={g2.key} data-testid="ghost-pane" style={{ position: "absolute", left: gp.x, top: gp.y, width: PW, height: PH, background: C.panel, border: `1px dashed ${C.border}`, borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, opacity: 0.85 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.brand, animation: "pulse 1.6s infinite" }} />
                <span style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 600 }}>{g2.name}</span>
                <span style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>provisioning worktree in the background…</span>
              </div>
            ); })}
            {(() => {
            const deckFrameIds = new Set(frames.filter((f) => f.template).map((f) => f.id));
            const inDeck = (p2: any) => deckFrameIds.has(paneSettings(p2).collection);
            const renderCard = (p: Pane, i: number, pos: { x: number; y: number } | null) => {
              // CAPABILITY-DRIVEN HEADER (operator 2026-07-12): each pane kind
              // shows ONLY the buttons for abilities it actually has — a git
              // graph or context pane has no worktree, so no diff/promote/open;
              // only agent panes stage plans (⚡). Fixed-purpose panes aren't
              // editable. Derived from pane_kind (with the legacy name fallbacks
              // the render below already uses).
              const kind = (p.pane_kind
                ?? (/^script·/.test(p.subagent_name ?? "") ? "script"
                  : p.subagent_name === "git·graph" ? "git"
                  : p.subagent_name === "context" ? "context" : "agent")) as string;
              const isEngine = isEnginePaneKind(kind);
              const cap = {
                worktree: (kind === "agent" || isEngine) && !!p.worktree_path,
                plans: kind === "agent",                          // stages file.write plans
                promote: kind === "agent" || isEngine,            // can become a card
                openFolder: (kind === "agent" || isEngine) && !!p.worktree_path,
                span: true,                                       // layout — everyone
                edit: kind === "agent" || isEngine,               // git/context/script are fixed
              };
              const bi = bindOf(p.id);
              const isSel = selected.has(p.id);
              return (
              <div key={p.id} data-pane="" onMouseEnter={() => setHoverCard(p.id)} onMouseLeave={() => { setHoverCard((h) => (h === p.id ? null : h)); setHoverHead((h) => (h === p.id ? null : h)); }}
                style={{ ...(pos ? { position: "absolute" as const, left: pos.x, top: pos.y, height: paneH(p) } : { position: "relative" as const, flexShrink: 0, height: "100%" }), width: paneW(p), border: isSel ? `1.5px dashed ${C.warn}` : hoverHead === p.id ? `1.5px dashed ${C.brand}` : bi >= 0 && pos ? `1.5px solid ${C.brand}` : pos ? `1px solid ${C.border}` : "none", borderRadius: pos ? 8 : 0, background: C.panel, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", boxShadow: isSel && pos ? `0 0 0 3px color-mix(in oklab, ${C.warn} 22%, transparent)` : pos ? "0 2px 10px rgba(0,0,0,.18)" : "none",
                  /* PULSE LAYER: a working pane breathes warm, an errored one throbs red —
                     session health readable from fit-zoom without clicking anything */
                  ...(pos && p.status === "working" ? { ["--pulse" as any]: `color-mix(in oklab, ${C.warn} 50%, transparent)`, animation: "vibePulse 1.9s ease-in-out infinite" } : {}),
                  ...(pos && p.status === "error" ? { ["--pulse" as any]: `color-mix(in oklab, ${C.bad} 55%, transparent)`, animation: "vibePulse 1.15s ease-in-out infinite" } : {}),
                  ...(pos && flashPane === p.id ? { outline: `2.5px solid ${C.brand}`, outlineOffset: 4 } : {}) }}>
                {bi >= 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 10px", background: `color-mix(in oklab, ${C.brand} 14%, ${C.bg})`, borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontFamily: mono, fontSize: 8.5, color: C.brand, fontWeight: 700 }}>📖 book {bi + 1} · {binds[bi].indexOf(p.id) + 1}/{binds[bi].length}</span>
                    <span style={{ flex: 1 }} />
                    <button onClick={() => setFullscreen({ bind: bi, tab: binds[bi].indexOf(p.id) })} title="open the book fullscreen — ←/→ switch pages" style={{ ...btn, padding: "0 6px", fontSize: 8.5, color: C.brand, borderColor: "transparent" }}>⛶ open book</button>
                    <button onClick={() => unbind(p.id)} title="unbind this pane from the book" style={{ ...btn, padding: "0 6px", fontSize: 8.5, color: C.bad, borderColor: "transparent" }}>✂</button>
                  </div>
                )}
                {/* edge BIND handles (Obsidian-canvas style): hover the card, drag a dot to another pane */}
                {pos != null && hoverCard === p.id && !boardDrag && (["left", "right"] as const).map((side) => (
                  <div key={side} onMouseDown={(e) => startBindLine(e, p, i, side)} title="drag to another pane to BIND them (a book, up to 6)"
                    style={{ position: "absolute", [side]: -7, top: "50%", transform: "translateY(-50%)", width: 14, height: 40, display: "grid", placeItems: "center", cursor: "crosshair", zIndex: 3 }}>
                    <span style={{ width: 8, height: 26, borderRadius: 5, background: C.brand, opacity: 0.85, boxShadow: `0 0 0 3px color-mix(in oklab, ${C.brand} 25%, transparent)` }} />
                  </div>
                ))}
                <div onMouseEnter={() => setHoverHead(p.id)} onMouseLeave={() => setHoverHead((h) => (h === p.id ? null : h))} onMouseDown={(e) => pos && startPaneMove(e, p, i)}
                  style={{ display: "flex", gap: 6, alignItems: "center", padding: "7px 10px", borderBottom: `1px solid ${C.border}`, background: hoverHead === p.id ? `color-mix(in oklab, ${C.brand} 7%, ${C.panel})` : C.panel, cursor: pos && hoverHead === p.id ? "grab" : undefined }}>
                  <span title="drag to move on the board" style={{ cursor: "grab", color: hoverHead === p.id ? C.brand : C.dim, fontSize: 12, flex: "none", userSelect: "none" }}>⠿</span>
                  {(() => { const id2 = KIND_IDENT[kind] ?? { glyph: "▦", color: C.dim }; return (
                    <span title={kind} style={{ width: 18, height: 18, borderRadius: 5, flex: "none", display: "grid", placeItems: "center", fontSize: 11, lineHeight: 1, background: `color-mix(in oklab, ${id2.color} 16%, transparent)`, border: `1px solid color-mix(in oklab, ${id2.color} 45%, transparent)`, color: id2.color }}>{id2.glyph}</span>
                  ); })()}
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(p.status), flex: "none" }} title={p.status} />
                  <span style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 600 }}>#{p.idx + 1}</span>
                  {p.base_agent && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }} title="base identity">↳{p.base_agent}</span>}
                  <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }} title={p.model_id || "the tier router picks the model"}>{p.model_id ? p.model_id.split("/").pop() : p.tier}</span>
                  {!!p.cost_usd && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }} title={`${p.calls || 0} AI turns`}>${p.cost_usd.toFixed(3)}</span>}
                  <span style={{ flex: 1 }} />
                  {cap.plans && (
                    <button onClick={() => toggleAuto(p)}
                      title={p.auto_apply ? "auto-mode ON — edits apply without asking (click for plan-then-Apply)" : "plan mode — edits wait for your Apply (click for auto-mode)"}
                      style={{ ...btn, padding: "1px 6px", fontSize: 10, color: p.auto_apply ? C.warn : C.muted, borderColor: p.auto_apply ? C.warn : C.border }}>⚡</button>
                  )}
                  {(kind === "agent" || isEngine) && <span style={{ fontSize: 10, color: p.worktree_path ? C.ok : C.warn }} title={p.worktree_path ? `worktree ${p.branch}` : "worktree pending — needs a git workspace"}>⎇</span>}
                  {cap.promote && <button onClick={() => { setPromoteFor(p.id); setPromoteGoal(""); setPromoteDraft(null); }} title="promote this pane's work to the driver as a card" style={{ ...btn, padding: "1px 6px", fontSize: 10, color: C.muted, borderColor: C.border }}>↗</button>}
                  {cap.openFolder && <button onClick={() => openWorktree(p.id)} title={`open the worktree folder in Explorer
${p.worktree_path}`} style={{ ...btn, padding: "1px 6px", fontSize: 10, color: C.muted, borderColor: C.border }}>📂</button>}
                  <button onClick={async () => { await apiPost("/api/v1/cockpit/pane/update", { pane_id: p.id, span_cols: (((p as any).span_cols ?? 1) % 3) + 1 }); if (sid) loadSession(sid); }}
                    title={`width: ${(p as any).span_cols ?? 1} column(s) — click to cycle 1→2→3`}
                    style={{ ...btn, padding: "1px 6px", fontSize: 10, color: ((p as any).span_cols ?? 1) > 1 ? C.brand : C.muted, borderColor: C.border }}>⬌{((p as any).span_cols ?? 1) > 1 ? (p as any).span_cols : ""}</button>
                  <button onClick={async () => { await apiPost("/api/v1/cockpit/pane/update", { pane_id: p.id, span_rows: (((p as any).span_rows ?? 1) % 3) + 1 }); if (sid) loadSession(sid); }}
                    title={`height: ${(p as any).span_rows ?? 1} row(s) — click to cycle 1→2→3`}
                    style={{ ...btn, padding: "1px 6px", fontSize: 10, color: ((p as any).span_rows ?? 1) > 1 ? C.brand : C.muted, borderColor: C.border }}>⬍{((p as any).span_rows ?? 1) > 1 ? (p as any).span_rows : ""}</button>
                  <button onClick={() => { const b2 = bindOf(p.id); b2 >= 0 ? setFullscreen({ bind: b2, tab: binds[b2].indexOf(p.id) }) : setFullscreen({ pane: p.id }); }} title="fullscreen (Esc exits · ←/→ turn pages in a book)" style={{ ...btn, padding: "1px 6px", fontSize: 10, color: C.muted, borderColor: C.border }}>⛶</button>
                  {cap.edit && <button onClick={() => openEdit(p)} title="edit agent" style={{ ...btn, padding: "1px 6px", fontSize: 10, color: C.muted, borderColor: C.border }}>✎</button>}
                  <button onClick={() => requestClose(p)} title={p.worktree_path ? "close — you'll choose merge or discard for its worktree" : "remove this pane"} style={{ ...btn, padding: "1px 6px", fontSize: 10, color: C.bad, borderColor: C.border }}>✕</button>
                </div>
                {paneBody(p)}
              </div>
              );
            };
            return (<>
            {placed.filter(({ p }) => !inDeck(p)).map(({ p, i, pos }) => renderCard(p, i, pos))}
            {/* THE DECKS — a collection as a card deck: active pane full, siblings as
                vertical SPINES (icon + #id + name); hover peeks, click surfaces. */}
            {frames.filter((f) => f.template).map((f) => {
              const members = placed.filter(({ p }) => paneSettings(p).collection === f.id);
              if (!members.length) return null;
              const sorted = [...members].sort((a, b) => ((paneSettings(a.p).role === "orchestrator" ? 0 : 1) - (paneSettings(b.p).role === "orchestrator" ? 0 : 1)) || a.p.idx - b.p.idx);
              const activeId = deckActive[f.id] ?? sorted[0].p.id;
              const bi2 = binds.findIndex((b) => sorted.some(({ p: mp }) => b.includes(mp.id)));
              const W = PW + (sorted.length - 1) * 36 + 3;
              return (
                <div key={"deck" + f.id} data-testid="deck" style={{ position: "absolute", left: f.x, top: f.y, width: W, zIndex: 2 }}>
                  <div onMouseDown={(e) => startFrameMove(e, f)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 10px", borderRadius: "10px 10px 0 0", background: `color-mix(in oklab, ${f.color} 14%, ${C.bg})`, border: `1.5px solid ${f.color}`, borderBottom: "none", cursor: "grab", userSelect: "none" }}>
                    <span style={{ fontFamily: mono, fontSize: 10, color: f.color, fontWeight: 700 }}>🗼 {f.title}</span>
                    <span style={{ fontFamily: mono, fontSize: 8, color: f.color, border: `1px solid ${f.color}`, borderRadius: 8, padding: "0 6px", opacity: 0.85 }}>{f.template}</span>
                    <span style={{ flex: 1 }} />
                    {bi2 >= 0 && <button onMouseDown={(e) => e.stopPropagation()} onClick={() => setFullscreen({ bind: bi2, tab: Math.max(0, binds[bi2].indexOf(activeId)) })} title="open the book — fullscreen, ←/→ turn the steps" style={{ ...btn, padding: "0 7px", fontSize: 8.5, color: f.color, borderColor: "transparent" }}>⛶ book</button>}
                  </div>
                  <div style={{ display: "flex", height: paneH(sorted.find(({ p: mp }) => mp.id === activeId)?.p ?? sorted[0].p), border: `1.5px solid ${f.color}`, borderRadius: "0 0 10px 10px", overflow: "hidden", background: C.bg, boxShadow: "0 3px 14px rgba(0,0,0,.28)" }}>
                    {sorted.map(({ p: mp, i: mi }) => {
                      if (mp.id === activeId) return <React.Fragment key={mp.id}>{renderCard(mp, mi, null)}</React.Fragment>;
                      const ident = KIND_IDENT[mp.pane_kind ?? "agent"] ?? { glyph: "▦", color: C.dim };
                      const hov = spineHover === mp.id;
                      return (
                        <div key={mp.id} data-testid="deck-spine" onClick={() => setDeckActive((d) => ({ ...d, [f.id]: mp.id }))}
                          onMouseEnter={() => setSpineHover(mp.id)} onMouseLeave={() => setSpineHover((h) => (h === mp.id ? null : h))}
                          title={`#${mp.idx + 1} ${mp.subagent_name} — click to surface`}
                          style={{ width: hov ? 48 : 36, transition: "width .14s ease, background .14s", flexShrink: 0, borderLeft: `1px solid ${C.border}`, background: hov ? `color-mix(in oklab, ${ident.color} 12%, ${C.panel})` : C.panel, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "7px 0", minHeight: 0 }}>
                          <span style={{ width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center", fontSize: 12, background: `color-mix(in oklab, ${ident.color} 16%, transparent)`, border: `1px solid color-mix(in oklab, ${ident.color} 45%, transparent)`, color: ident.color, flexShrink: 0 }}>{ident.glyph}</span>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor(mp.status), flexShrink: 0 }} title={mp.status} />
                          <span style={{ fontFamily: mono, fontSize: 9, color: hov ? C.fg : C.muted, writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: 0.6, flex: 1, minHeight: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>#{mp.idx + 1} {mp.subagent_name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </>);
            })()}

            {panes.length < cap && (
              <button onClick={openAdd} style={{ position: "absolute", left: addPos.x, top: addPos.y, width: PW, height: PH, border: `1px dashed ${C.border}`, borderRadius: 8, background: "transparent", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12, display: "grid", placeItems: "center" }}>+ add pane ({panes.length}/{cap})</button>
            )}
            </div>
            </div>
          </div>
          {/* board controls — zoom + groups. VIEWPORT-pinned (operator 2026-07-14:
              "add them floating with fixed position", then "push to the bottom
              LEFT corner"): position:fixed keeps the cluster on the WINDOW at any
              zoom/scroll; left:68 clears the collapsed 54px rail (vibe collapses
              it on mount). The header-actions pill owns the bottom-RIGHT corner.
              zIndex 150: above the board, under modals (200) and fullscreen (260). */}
          <div style={{ position: "fixed", left: 68, bottom: 18, zIndex: 150, display: "flex", gap: 5, alignItems: "center", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, padding: "4px 7px", boxShadow: "0 3px 14px rgba(0,0,0,.3)" }}>
            <button onClick={() => setStudioOpen(true)} title="the Context Studio — mission, shared context, who reads what" style={{ ...btn, padding: "1px 8px", fontSize: 10, color: C.brand }}>⛶ context studio</button>
            <span style={{ width: 1, height: 16, background: C.border }} />
            <button onClick={addFrame} title="new group frame — drag panes into it; its title bar moves the whole group" style={{ ...btn, padding: "1px 8px", fontSize: 10, color: C.brand }}>▦ + group</button>
            <button onClick={addComment} title="new comment — a sticky note on the board; drag its ○ anchor onto a pane, a book or a group to point the arrow at it" style={{ ...btn, padding: "1px 8px", fontSize: 10, color: C.brand }}>✎ + comment</button>
            <span style={{ width: 1, height: 16, background: C.border }} />
            <button onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))} style={{ ...btn, padding: "1px 8px", fontSize: 11, color: C.muted }}>−</button>
            <span title="zoom-guard v4 — if ctrl+wheel still zooms the page, this tab runs STALE code: hard-reload (Ctrl+Shift+R)" style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, minWidth: 34, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))} style={{ ...btn, padding: "1px 8px", fontSize: 11, color: C.muted }}>+</button>
            <button onClick={() => setZoom(1)} title="reset zoom (100%)" style={{ ...btn, padding: "1px 7px", fontSize: 10, color: C.muted }}>⌂</button>
            <button onClick={fitNow} title="⌖ fit — bring every pane back into view (re-fits the zoom + rewinds the scroll)" style={{ ...btn, padding: "1px 8px", fontSize: 10, color: C.brand, borderColor: C.brand }}>⌖ fit</button>
            {attention.length > 0 && (
              <button onClick={attNext} title={`${attention.length} pane${attention.length === 1 ? "" : "s"} need${attention.length === 1 ? "s" : ""} you — click to fly to each in turn`}
                style={{ ...btn, padding: "1px 8px", fontSize: 10, color: C.bad, borderColor: C.bad, ["--pulse" as any]: `color-mix(in oklab, ${C.bad} 40%, transparent)`, animation: "vibePulse 1.5s ease-in-out infinite" }}>⚡ {attention.length}</button>
            )}
          </div>
          </div>
            );
          })()}

          {/* shared-memory bar retired (operator 2026-07-14) — the ⛶ context studio lives in the board cluster */}
        </>
      )}
      </div>

      {/* FULLSCREEN (operator: "like F11") — one pane, or a BOOK as tabs (←/→) */}
      {fullscreen && (() => {
        const bookIds = fullscreen.bind != null ? (binds[fullscreen.bind] ?? []) : null;
        // THE 4×4 SPLIT (operator 2026-07-14: "every split screen should have 4
        // slots for row and 4 for column"): a FIXED 4×4 grid, every tile PINNED
        // {col,row,w,h}. Free squares are bounded (≤16) — no ghost multiplication.
        const GRID = 4;
        const occOf = (cells: any[], skip = -1) => {
          const occ = Array.from({ length: GRID }, () => Array(GRID).fill(false));
          cells.forEach((c2: any, i: number) => { if (i === skip) return; for (let dr = 0; dr < c2.h; dr++) for (let dc = 0; dc < c2.w; dc++) { const rr = c2.row + dr, cc = c2.col + dc; if (rr < GRID && cc < GRID) occ[rr][cc] = true; } });
          return occ;
        };
        const fitsAt = (occ: boolean[][], c: number, r: number, w: number, h: number) => {
          if (c < 0 || r < 0 || c + w > GRID || r + h > GRID) return false;
          for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) if (occ[r + dr][c + dc]) return false;
          return true;
        };
        const firstFit = (cells: any[], w = 1, h = 1) => {
          const occ = occOf(cells);
          for (let r = 0; r <= GRID - h; r++) for (let c = 0; c <= GRID - w; c++) if (fitsAt(occ, c, r, w, h)) return { col: c, row: r };
          return null;
        };
        const normSplit = (sp: any) => {
          const rawCells = Array.isArray(sp) ? sp.map((id: number) => ({ id })) : Array.isArray(sp?.cells) ? sp.cells : [];
          const cells: any[] = [];
          for (const c2 of rawCells) {
            const w = Math.max(1, Math.min(GRID, Number(c2.w) || 1));
            const h = Math.max(1, Math.min(GRID, Number(c2.h) || 1));
            let col = Number.isFinite(Number(c2.col)) && c2.col != null ? Number(c2.col) : null;
            let row = Number.isFinite(Number(c2.row)) && c2.row != null ? Number(c2.row) : null;
            if (col == null || row == null || !fitsAt(occOf(cells), col, row, w, h)) {
              const spot = firstFit(cells, w, h) ?? firstFit(cells, 1, 1);
              if (!spot) continue; // grid full — drop the overflow tile from view
              col = spot.col; row = spot.row;
            }
            cells.push({ id: Number(c2.id), col, row, w: col + w > GRID ? GRID - col : w, h: row + h > GRID ? GRID - row : h });
          }
          return { cols: GRID, cells };
        };
        const bookSplits = bookIds ? splits.map((sp, si) => ({ ns: normSplit(sp), si })).filter(({ ns }) => ns.cells.length >= 1 && ns.cells.every((c2: any) => bookIds.includes(c2.id))) : [];
        const seqLen = (bookIds?.length ?? 0) + bookSplits.length;
        const tab = Math.min(fullscreen.tab ?? 0, Math.max(0, seqLen - 1));
        const activeSplit = bookIds && tab >= bookIds.length ? bookSplits[tab - bookIds.length] : null;
        const activeId = bookIds ? (activeSplit ? null : bookIds[tab]) : fullscreen.pane;
        const fp = activeId != null ? panes.find((x) => x.id === activeId) : null;
        if (!bookIds && !fp) { setFullscreen(null); return null; }
        const glyphOf = (pk: any) => (KIND_IDENT[pk?.pane_kind ?? "agent"] ?? { glyph: "▦", color: C.dim });
        const updateSplit = (si: number, next: any) => saveBoard(frames, binds, splits.map((sp, xi) => (xi === si ? next : sp)));
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 260, background: C.bg, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${C.border}`, background: C.panel, flexWrap: "wrap" }}>
              {bookIds ? (<>
                {bookIds.map((id, ti) => {
                  const tp = panes.find((x) => x.id === id);
                  const on = !activeSplit && id === activeId;
                  return (
                    <button key={id} onClick={() => { setSplitDraft(null); setFullscreen({ bind: fullscreen.bind, tab: ti }); }}
                      style={{ ...btn, padding: "2px 12px", fontSize: 11, color: on ? C.brand : C.muted, borderColor: on ? C.brand : C.border, background: on ? `color-mix(in oklab, ${C.brand} 10%, transparent)` : "transparent" }}>
                      {glyphOf(tp).glyph} #{(tp?.idx ?? 0) + 1} {tp?.subagent_name ?? "?"}
                    </button>
                  );
                })}
                {bookSplits.map(({ ns, si }, bi2) => {
                  const on = activeSplit?.si === si;
                  return (
                    <button key={"sp" + si} onClick={() => { setSplitDraft(null); setFullscreen({ bind: fullscreen.bind, tab: (bookIds?.length ?? 0) + bi2 }); }}
                      title={"split screen · " + ns.cells.length + " panes — right-click removes the split"}
                      onContextMenu={(e) => { e.preventDefault(); saveBoard(frames, binds, splits.filter((_, xi) => xi !== si)); setFullscreen({ bind: fullscreen.bind, tab: 0 }); }}
                      style={{ ...btn, padding: "2px 10px", fontSize: 11, color: on ? C.warn : C.muted, borderColor: on ? C.warn : C.border, background: on ? `color-mix(in oklab, ${C.warn} 10%, transparent)` : "transparent" }}>
                      ⊞ {ns.cells.map((c2: any) => glyphOf(panes.find((x) => x.id === c2.id)).glyph).join("")}
                    </button>
                  );
                })}
                {splitDraft === null
                  ? <button onClick={() => setSplitDraft([])} title="new SPLIT tab — a 4×4 grid; pick panes, then expand/contract each tile from its edges" style={{ ...btn, padding: "2px 10px", fontSize: 11, color: C.ok, borderColor: C.ok }}>＋</button>
                  : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, border: `1.5px dashed ${C.ok}`, borderRadius: 8, padding: "2px 7px" }}>
                      <span style={{ fontFamily: mono, fontSize: 8.5, color: C.ok }}>pick panes:</span>
                      {bookIds.map((id) => {
                        const tp = panes.find((x) => x.id === id);
                        const picked = splitDraft.includes(id);
                        return (
                          <button key={"d" + id} onClick={() => setSplitDraft((d) => (d ? (d.includes(id) ? d.filter((x) => x !== id) : d.length < 6 ? [...d, id] : d) : d))}
                            title={`#${(tp?.idx ?? 0) + 1} ${tp?.subagent_name ?? "?"}`}
                            style={{ width: 24, height: 24, borderRadius: 6, cursor: "pointer", fontSize: 12, display: "grid", placeItems: "center", border: `1.5px solid ${picked ? C.ok : C.border}`, background: picked ? `color-mix(in oklab, ${C.ok} 14%, transparent)` : C.bg }}>
                            {glyphOf(tp).glyph}
                          </button>
                        );
                      })}
                      <button onClick={() => { if (splitDraft.length >= 2) { const cells: any[] = []; for (const id of splitDraft) { const spot = firstFit(cells, 2, 2) ?? firstFit(cells, 1, 1); if (spot) cells.push({ id, col: spot.col, row: spot.row, w: Math.min(2, GRID - spot.col), h: Math.min(2, GRID - spot.row) }); } saveBoard(frames, binds, [...splits, { cols: GRID, cells }]); setFullscreen({ bind: fullscreen.bind, tab: (bookIds?.length ?? 0) + bookSplits.length }); } setSplitDraft(null); }}
                        disabled={splitDraft.length < 2} style={{ ...btn, padding: "0 8px", fontSize: 10, color: splitDraft.length >= 2 ? C.ok : C.muted, borderColor: splitDraft.length >= 2 ? C.ok : C.border }}>✓ {splitDraft.length}</button>
                      <button onClick={() => setSplitDraft(null)} style={{ ...btn, padding: "0 6px", fontSize: 10, color: C.muted, borderColor: "transparent" }}>✕</button>
                    </span>
                  )}
              </>) : (
                <span style={{ fontFamily: mono, fontSize: 12.5, color: C.fg, fontWeight: 700 }}>#{fp!.idx + 1} {fp!.subagent_name}</span>
              )}
              <span style={{ flex: 1 }} />
              {bookIds && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>← → turn · ⊞ 4×4 splits</span>}
              <button onClick={() => { setSplitDraft(null); setFullscreen(null); }} style={{ ...btn, color: C.muted }}>✕ esc</button>
            </div>
            {activeSplit && (() => {
              const { ns, si } = activeSplit;
              const inSplit = new Set(ns.cells.map((c2: any) => c2.id));
              const addable = (bookIds ?? []).filter((id) => !inSplit.has(id));
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 14px", borderBottom: `1px solid ${C.border}`, background: `color-mix(in oklab, ${C.warn} 5%, ${C.bg})`, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: mono, fontSize: 8.5, color: C.warn, textTransform: "uppercase", letterSpacing: 0.7 }}>4×4 grid</span>
                  <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>drag a tile's header to a free slot · edge ⊕ expands into the empty side · ⊖ contracts one slot</span>
                  <span style={{ flex: 1 }} />
                  {addable.length > 0 && (<>
                    <span style={{ fontFamily: mono, fontSize: 8.5, color: C.ok }}>＋ add:</span>
                    {addable.map((id) => {
                      const tp = panes.find((x) => x.id === id);
                      const spot = firstFit(ns.cells, 1, 1);
                      return (
                        <button key={"add" + id} disabled={!spot} onClick={() => { const sp2 = firstFit(ns.cells, 1, 1); if (sp2) updateSplit(si, { ...ns, cells: [...ns.cells, { id, col: sp2.col, row: sp2.row, w: 1, h: 1 }] }); }}
                          title={spot ? `add #${(tp?.idx ?? 0) + 1} ${tp?.subagent_name ?? "?"}` : "the grid is full"}
                          style={{ width: 22, height: 22, borderRadius: 6, cursor: spot ? "pointer" : "not-allowed", fontSize: 11, display: "grid", placeItems: "center", border: `1px solid ${C.border}`, background: C.bg, opacity: spot ? 1 : 0.4 }}>
                          {glyphOf(tp).glyph}
                        </button>
                      );
                    })}
                  </>)}
                </div>
              );
            })()}
            {(() => {
              if (!activeSplit) {
                // every book member stays MOUNTED — ←/→ only flips visibility
                // (operator 2026-07-15: "when I switch binded items with the
                // arrow they lose their state" — the old code swapped the one
                // rendered child, unmounting the agent terminal / the runner)
                const liveIds = bookIds ?? (fp ? [fp.id] : []);
                return (
                  <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                    {liveIds.map((id) => {
                      const pp = panes.find((x) => x.id === id);
                      if (!pp) return null;
                      const on = id === (activeId ?? fp?.id);
                      return (
                        <div key={id} style={{ position: "absolute", inset: 0, display: on ? "flex" : "none", flexDirection: "column" }}>
                          {paneBody(pp)}
                        </div>
                      );
                    })}
                  </div>
                );
              }
              const { ns, si } = activeSplit;
              const occNoDrag = splitDragFrom != null ? occOf(ns.cells, splitDragFrom) : null;
              const dragCell = splitDragFrom != null ? ns.cells[splitDragFrom] : null;
              const ghosts2: Array<{ c: number; r: number }> = [];
              if (occNoDrag && dragCell) {
                for (let r = 0; r <= GRID - dragCell.h; r++) for (let c = 0; c <= GRID - dragCell.w; c++) {
                  if (c === dragCell.col && r === dragCell.row) continue;
                  if (fitsAt(occNoDrag, c, r, dragCell.w, dragCell.h)) ghosts2.push({ c, r });
                }
              }
              const expand = (ci: number, side: "left" | "right" | "top" | "bottom") => {
                const cell = ns.cells[ci];
                const occ = occOf(ns.cells, ci);
                let { col, row, w, h } = cell;
                const stripFree = (c: number, r: number, w2: number, h2: number) => fitsAt(occ, c, r, w2, h2);
                if (side === "right") { while (col + w < GRID && stripFree(col + w, row, 1, h)) w++; }
                if (side === "left") { while (col > 0 && stripFree(col - 1, row, 1, h)) { col--; w++; } }
                if (side === "bottom") { while (row + h < GRID && stripFree(col, row + h, w, 1)) h++; }
                if (side === "top") { while (row > 0 && stripFree(col, row - 1, w, 1)) { row--; h++; } }
                updateSplit(si, { ...ns, cells: ns.cells.map((c2: any, xi: number) => (xi === ci ? { ...c2, col, row, w, h } : c2)) });
              };
              const contract = (ci: number, side: "left" | "right" | "top" | "bottom") => {
                const cell = ns.cells[ci];
                let { col, row, w, h } = cell;
                if (side === "right" && w > 1) w--;
                if (side === "left" && w > 1) { col++; w--; }
                if (side === "bottom" && h > 1) h--;
                if (side === "top" && h > 1) { row++; h--; }
                updateSplit(si, { ...ns, cells: ns.cells.map((c2: any, xi: number) => (xi === ci ? { ...c2, col, row, w, h } : c2)) });
              };
              const canExpand = (ci: number, side: "left" | "right" | "top" | "bottom") => {
                const cell = ns.cells[ci];
                const occ = occOf(ns.cells, ci);
                if (side === "right") return cell.col + cell.w < GRID && fitsAt(occ, cell.col + cell.w, cell.row, 1, cell.h);
                if (side === "left") return cell.col > 0 && fitsAt(occ, cell.col - 1, cell.row, 1, cell.h);
                if (side === "bottom") return cell.row + cell.h < GRID && fitsAt(occ, cell.col, cell.row + cell.h, cell.w, 1);
                return cell.row > 0 && fitsAt(occ, cell.col, cell.row - 1, cell.w, 1);
              };
              const edgeBtn = (label: string, onClick: () => void, tone: string, style2: React.CSSProperties) => (
                <button onClick={(e) => { e.stopPropagation(); onClick(); }} style={{ position: "absolute", zIndex: 4, width: 18, height: 18, borderRadius: 5, border: `1px solid ${tone}`, background: C.panel, color: tone, fontSize: 10, lineHeight: 1, cursor: "pointer", display: "grid", placeItems: "center", ...style2 }}>{label}</button>
              );
              return (
                <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${GRID}, minmax(0, 1fr))`, gap: 1, background: C.border }}>
                  {ghosts2.map(({ c, r }) => {
                    const on = splitDragOver === -(c * 100 + r + 1);
                    return (
                      <div key={"ghost" + c + ":" + r}
                        onDragOver={(e) => { e.preventDefault(); setSplitDragOver(-(c * 100 + r + 1)); }}
                        onDragLeave={() => setSplitDragOver((o) => (o === -(c * 100 + r + 1) ? null : o))}
                        onDrop={() => { const from = splitCellDrag.current; splitCellDrag.current = null; setSplitDragFrom(null); setSplitDragOver(null); if (from == null) return; updateSplit(si, { ...ns, cells: ns.cells.map((c2: any, xi: number) => (xi === from ? { ...c2, col: c, row: r } : c2)) }); }}
                        style={{ gridColumn: `${c + 1} / span ${dragCell?.w ?? 1}`, gridRow: `${r + 1} / span ${dragCell?.h ?? 1}`, minWidth: 0, minHeight: 0, border: on ? `2px dashed ${C.ok}` : `2px dashed color-mix(in oklab, ${C.ok} 40%, transparent)`, background: on ? `color-mix(in oklab, ${C.ok} 8%, ${C.bg})` : C.bg, borderRadius: 8, display: "grid", placeItems: "center", zIndex: 1 }}>
                        <span style={{ fontFamily: mono, fontSize: 9.5, color: on ? C.ok : C.dim, pointerEvents: "none" }}>{on ? "⤓ drop here" : "free slot"}</span>
                      </div>
                    );
                  })}
                  {ns.cells.map((cell: any, ci: number) => {
                    const sp2 = panes.find((x) => x.id === cell.id);
                    if (!sp2) return null;
                    const g = glyphOf(sp2);
                    return (
                      <div key={cell.id + ":" + ci}
                        onDragOver={(e) => { e.preventDefault(); if (splitDragFrom != null && splitDragOver !== ci) setSplitDragOver(ci); }}
                        onDragLeave={() => setSplitDragOver((o) => (o === ci ? null : o))}
                        onDrop={() => { const from = splitCellDrag.current; splitCellDrag.current = null; setSplitDragFrom(null); setSplitDragOver(null); if (from == null || from === ci) return; const a = ns.cells[from]; const b = ns.cells[ci]; if (a.w === b.w && a.h === b.h) { updateSplit(si, { ...ns, cells: ns.cells.map((c2: any, xi: number) => (xi === from ? { ...c2, col: b.col, row: b.row } : xi === ci ? { ...c2, col: a.col, row: a.row } : c2)) }); } }}
                        style={{ gridColumn: `${cell.col + 1} / span ${cell.w}`, gridRow: `${cell.row + 1} / span ${cell.h}`, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", position: "relative", background: splitDragOver === ci && splitDragFrom !== ci ? `color-mix(in oklab, ${C.warn} 7%, ${C.bg})` : C.bg, opacity: splitDragFrom === ci ? 0.45 : 1, transition: "border-color .1s, background .1s",
                          border: splitDragFrom != null && splitDragFrom !== ci
                            ? (splitDragOver === ci ? `2px dashed ${C.warn}` : `2px dashed color-mix(in oklab, ${C.brand} 45%, transparent)`)
                            : "2px solid transparent" }}>
                        {/* EDGE CONTROLS: ⊕ = expand into the empty slots on this side; ⊖ = contract one slot from this side */}
                        {canExpand(ci, "left") && edgeBtn("⊕", () => expand(ci, "left"), C.brand, { left: -2, top: "50%", transform: "translateY(-140%)" })}
                        {cell.w > 1 && edgeBtn("⊖", () => contract(ci, "left"), C.muted, { left: -2, top: "50%", transform: "translateY(40%)" })}
                        {canExpand(ci, "right") && edgeBtn("⊕", () => expand(ci, "right"), C.brand, { right: -2, top: "50%", transform: "translateY(-140%)" })}
                        {cell.w > 1 && edgeBtn("⊖", () => contract(ci, "right"), C.muted, { right: -2, top: "50%", transform: "translateY(40%)" })}
                        {canExpand(ci, "top") && edgeBtn("⊕", () => expand(ci, "top"), C.brand, { top: 30, left: "50%", transform: "translateX(-140%)" })}
                        {cell.h > 1 && edgeBtn("⊖", () => contract(ci, "top"), C.muted, { top: 30, left: "50%", transform: "translateX(40%)" })}
                        {canExpand(ci, "bottom") && edgeBtn("⊕", () => expand(ci, "bottom"), C.brand, { bottom: -2, left: "50%", transform: "translateX(-140%)" })}
                        {cell.h > 1 && edgeBtn("⊖", () => contract(ci, "bottom"), C.muted, { bottom: -2, left: "50%", transform: "translateX(40%)" })}
                        <div draggable onDragStart={() => { splitCellDrag.current = ci; setSplitDragFrom(ci); }} onDragEnd={() => { splitCellDrag.current = null; setSplitDragFrom(null); setSplitDragOver(null); }}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderBottom: `1px solid ${C.border}`, background: C.panel, cursor: "grab" }}>
                          <span style={{ fontSize: 11, color: g.color }}>{g.glyph}</span>
                          <span style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>#{sp2.idx + 1} {sp2.subagent_name}</span>
                          <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>{cell.w}×{cell.h}</span>
                          <span style={{ flex: 1 }} />
                          <button onClick={() => updateSplit(si, { ...ns, cells: ns.cells.filter((_: any, xi: number) => xi !== ci) })} title="remove from this split (the pane stays in the book)" style={{ ...btn, padding: "0 6px", fontSize: 9, color: C.bad, borderColor: "transparent" }}>✕</button>
                        </div>
                        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{paneBody(sp2)}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        );
      })()}
      <CloseWorktreeModal closing={closing}
        onMerge={() => { setClosing((c: any) => ({ ...c, busy: true, error: null })); removePane(closing.pane.id, "merge"); }}
        onDiscard={() => { setClosing((c: any) => ({ ...c, busy: true, error: null })); removePane(closing.pane.id, "discard"); }}
        onCancel={() => setClosing(null)}
        onOpenWorktree={openWorktree} />

      {/* add / edit agent — a modal so the file-tree + model picker have room and never clip */}
      {formMode !== null && (
        <div onClick={closeForm} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 200, display: "grid", placeItems: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: formMode === "add" ? "min(960px, 96vw)" : "min(560px, 94vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, overflow: "hidden" }}>
            <span style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 600 }}>{formMode === "add" ? "add pane" : "edit agent"}</span>
            {/* edit mode is a FLEX column too (was display:block — the config column had no
                height bound inside overflow:hidden, clipping the modal bottom: live bug). */}
            <div style={{ flex: 1, minHeight: 0, display: formMode === "add" ? "grid" : "flex", flexDirection: formMode === "add" ? undefined : "column", gridTemplateColumns: formMode === "add" ? "minmax(300px, 340px) 1fr" : undefined, gap: 16, overflow: "hidden" }}>
              {/* LEFT — configure the pane (widget-studio sidebar) */}
              <div style={{ minWidth: 0, minHeight: 0, flex: formMode === "add" ? undefined : 1, display: "flex", flexDirection: "column", gap: 7, overflowY: "auto", paddingRight: 4 }}>
                <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>Configure</div>
            {formMode === "add" && (fKind === "opencode" || fKind === "opencode-direct") && (
              <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>the REAL OpenCode agent in an antiloki-controlled terminal: scope = sparse worktree (it can't see other files), context via AGENTS.md, model traffic through the pane proxy ({fKind === "opencode-direct" ? "direct OpenAI key · .antiloki/auth/openai.key" : "your OpenCode login · or BYOK OpenRouter when .antiloki/auth/openrouter.key exists"}). ▶ boots it.</span>
            )}
            {formMode === "add" && isSubscriptionPaneKind(fKind) && (
              <span style={{ fontFamily: mono, fontSize: 9, color: engines[fKind] && !engines[fKind].installed ? C.bad : C.dim }}>
                {engines[fKind] && !engines[fKind].installed
                  ? `${({ "claude-code": "claude", gemini: "agy", cursor: "cursor-agent" } as Record<string, string>)[fKind] ?? fKind} CLI not found on PATH — install + log in first (auth is your subscription; antiloki never sees the secret).`
                  : `${paneDisplay(fKind).name} on YOUR subscription, in an antiloki-controlled terminal: sparse worktree · context via ${fKind === "claude-code" ? "AGENTS.md + CLAUDE.md" : "AGENTS.md"} · scope enforced by the merge-gate. No proxy — auth is the CLI's own login. ▶ boots it.`}
              </span>
            )}
            {formMode === "add" && (fKind === "ultraplan" || fKind === "swarm" || fKind.startsWith("col-")) && (
              <>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, lineHeight: 1.5 }}>{fKind.startsWith("col-")
                  ? (PANE_KINDS.find((m) => m.key === fKind)?.desc ?? "spawns the formation — a titled frame with its panes wired as steps.")
                  : fKind === "swarm" ? "step ③: the queue in this pane's OWN worktree (provisioned on add, auto-apply ON) — one writer, one coherent diff."
                  : "step ②: the plan diagram — owns the plan row; queues onto the collection's execute pane."}</span>
                <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder={fKind.startsWith("col-") ? "goal / frame title (e.g. checkout revamp)" : "label (optional)"} style={{ ...inp }} />
              </>
            )}
            {formMode === "add" && fKind === "script" && (
              <>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>script (from the registry on the Code screen — not editable here)</span>
                <select value={fScript} onChange={(e) => setFScript(e.target.value)} style={{ ...inp }}>
                  <option value="build">build</option><option value="dev">dev / run</option><option value="test">test</option>
                </select>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>the worktree it runs in is chosen ON the pane (any sibling pane with a worktree)</span>
              </>
            )}
            {/* UNIVERSAL TOOL CONFIG (operator 2026-07-14: "every tool should have
                configuration options") — summary + label always, then per-tool options
                persisted on pane.settings_json; seeds post right after the add. */}
            {formMode === "add" && (TOOL_KINDS as readonly string[]).includes(fKind) && (() => {
              const meta = PANE_KINDS.find((m) => m.key === fKind);
              const wtP = panes.filter((x) => x.worktree_path);
              const setS = (k: string, v: any) => setFSettings((s0: any) => ({ ...s0, [k]: v }));
              const lbl = (t: string) => <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{t}</span>;
              return (<>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, lineHeight: 1.5 }}>{meta?.desc}</span>
                <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder={`label (defaults to ${fKind})`} style={{ ...inp }} />
                {(fKind === "run" || fKind === "gate" || fKind === "shell" || fKind === "design") && (<>
                  {lbl("default target — where it runs")}
                  <select value={fSettings.target_pane ?? 0} onChange={(e) => setS("target_pane", Number(e.target.value))} style={{ ...inp }}>
                    <option value={0}>{fKind === "gate" ? "— pick on the pane (gates need a worktree) —" : "workspace root"}</option>
                    {wtP.map((x) => <option key={x.id} value={x.id}>#{x.idx + 1} {x.subagent_name} · worktree</option>)}
                  </select>
                </>)}
                {(fKind === "graph" || fKind === "diagram" || fKind === "code") && (<>
                  {lbl("start scoped to (optional folder)")}
                  <input list="tool-dirs" value={fSettings.dir ?? ""} onChange={(e) => setS("dir", e.target.value)} placeholder="whole codebase" style={{ ...inp }} />
                  <datalist id="tool-dirs">{entries.filter((e) => e.dir && e.path.split("/").length <= 2).map((e) => <option key={e.path} value={e.path} />)}</datalist>
                </>)}
                {fKind === "standup" && (<>
                  {lbl("the standup question — every agent answers it")}
                  <textarea value={fSettings.prompt ?? ""} onChange={(e) => setS("prompt", e.target.value)} placeholder="default: done / now / blocked, 3 short lines" style={{ ...inp, minHeight: 52, resize: "vertical" }} />
                </>)}
                {fKind === "docs" && (<>
                  {lbl("start on page (optional — e.g. src or src/ui/App.tsx)")}
                  <input value={fSettings.page ?? ""} onChange={(e) => setS("page", e.target.value)} placeholder="/ — codebase overview" style={{ ...inp }} />
                </>)}
                {fKind === "fuel" && (<>
                  {lbl("session budget in $ (0 = no cap — advisory, never blocks)")}
                  <input type="number" min={0} step={0.5} value={fSettings.budget ?? ""} onChange={(e) => setS("budget", Number(e.target.value) || 0)} placeholder="e.g. 5" style={{ ...inp }} />
                </>)}
                {fKind === "timeline" && (<>
                  {lbl("opens on")}
                  <select value={fSettings.tab ?? "all"} onChange={(e) => setS("tab", e.target.value)} style={{ ...inp }}>
                    <option value="all">everything</option><option value="skills">⚙ skills</option><option value="ai">🤖 ai calls</option><option value="audit">⛓ chain</option>
                  </select>
                </>)}
                {(fKind === "todo" || fKind === "kanban" || fKind === "notes") && (<>
                  {lbl(fKind === "todo" ? "seed todos — one per line" : fKind === "kanban" ? "seed cards (land in To do) — one per line" : "first note (optional)")}
                  <textarea value={fSeed} onChange={(e) => setFSeed(e.target.value)} placeholder={fKind === "notes" ? "jot the first note…" : "one item per line…"} style={{ ...inp, minHeight: 52, resize: "vertical" }} />
                </>)}
                {(fKind === "git" || fKind === "state" || fKind === "review" || fKind === "context" || fKind === "race" || fKind === "sketch" || fKind === "notebook" || fKind === "radar" || fKind === "bfw1" || fKind === "bfw2" || fKind === "bfw3" || fKind === "judgment") && (
                  <span style={{ fontFamily: mono, fontSize: 8.5, color: C.ok }}>
                    {fKind === "race" ? "✓ ready — racers + the brief are picked ON the pane when you start a race."
                      : fKind === "review" ? "✓ ready — diffs load per pane inside; commit/discard live there too."
                      : fKind === "git" ? "✓ ready — reads the session's worktrees live, nothing to preset."
                      : fKind === "context" ? "✓ ready — everything is managed inside the studio."
                      : fKind === "sketch" ? "✓ ready — tools + colors live on the pane; the drawing persists with the session."
                      : fKind === "notebook" ? "✓ ready — pick the notebook ON the pane; each artifact mint is one AI call."
                      : fKind === "radar" ? "✓ ready — severity + window filters live on the pane."
                      : fKind === "bfw1" ? "✓ ready — pick a target on the pane and run; $0. Inside a 🐞 Bug finder automation it opens the shared run."
                      : fKind === "bfw2" ? "✓ ready — appends the shard swarm to wave 1's run when in a 🐞 automation; runs standalone otherwise."
                      : fKind === "bfw3" ? "✓ ready — appends the one-call sweep to the shared run; excludes what waves 1+2 already found."
                      : fKind === "judgment" ? "✓ ready — pick a ultra-dev item (or free criteria) ON the pane; one mid call rules the evidence."
                      : "✓ ready — a live dashboard over the whole session, nothing to preset."}
                  </span>
                )}
              </>);
            })()}
            {/* native antiloki agent + OpenCode(proxied): full identity + persona.
                In ADD mode the identity comes from the VIBE AGENT picker (right column,
                avatars + full names) — the raw base select shows only when EDITING. */}
            {(formMode !== "add" || fKind === "agent" || fKind === "opencode") && <>
            {formMode !== "add" && (<>
              <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>base identity</span>
              <select value={fBase} onChange={(e) => setFBase(e.target.value)} style={{ ...inp }} title="inherit an existing system agent's persona">
                <option value="">— pick a base agent —</option>
                {MAIN_AGENTS.map((nm) => { const a = agents.find((x) => x.agent === nm); return <option key={nm} value={nm}>{nm}{a?.description ? ` · ${String(a.description).slice(0, 36)}` : ""}</option>; })}
              </select>
            </>)}
            {formMode === "add" && (fKind === "agent" || fKind === "opencode") && (() => { const v = VIBE_AGENTS.find((x) => x.key === fVibe) ?? VIBE_AGENTS[0]; return (
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${v.color}`, borderRadius: 8, padding: "6px 9px", background: `color-mix(in oklab, ${v.color} 8%, transparent)` }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>{v.avatar}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 700 }}>{v.name} <span style={{ color: C.dim, fontWeight: 400 }}>· {v.tagline}</span></div>
                  <div style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>persona rides the prompt (visible in 🧾) · pick another on the right ↴</div>
                </div>
              </div>
            ); })()}
            <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder={formMode === "add" && fKind === "agent" ? `label (defaults to ${(VIBE_AGENTS.find((x) => x.key === fVibe) ?? VIBE_AGENTS[0]).name.toLowerCase()})` : "label (optional, defaults to the agent)"} style={{ ...inp }} />
            <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>edit scope · files this agent may WRITE (reads the whole repo)</span>
            <FileTree value={fScope} onChange={setFScope} entries={entries} />
            {scopeSumLine}
            {readsLine}
            <textarea value={fExtra} onChange={(e) => setFExtra(e.target.value)} placeholder="extra prompt — extends the base agent for this session" style={{ ...inp, minHeight: 52, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>tier</span>
              <select value={fTier} onChange={(e) => setFTier(e.target.value)} style={{ ...inp }} title="complexity tier this agent needs">
                <option value="low">low · simple</option><option value="mid">mid · balanced</option><option value="high">high · complex</option>
              </select>
              <ModelPicker model={fModel} setModel={setFModel} up />
            </div>
            </>}
            {/* subscription/direct engines (Claude Code · Codex · OpenCode·OpenAI): no
                antiloki persona (they run their own CLI) — but scope IS their edit
                whitelist now (S1), so it MUST be settable. This was the bug: the
                block above hid it for these kinds. */}
            {formMode === "add" && isEnginePaneKind(fKind) && fKind !== "opencode" && <>
            {(() => { const v = VIBE_AGENTS.find((x) => x.key === fVibe) ?? VIBE_AGENTS[0]; return (
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${v.color}`, borderRadius: 8, padding: "6px 9px", background: `color-mix(in oklab, ${v.color} 8%, transparent)` }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>{v.avatar}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 700 }}>{v.name} <span style={{ color: C.dim, fontWeight: 400 }}>· {v.tagline}</span></div>
                  <div style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>the persona rides the engine&apos;s AGENTS.md brief · pick another on the right ↴</div>
                </div>
              </div>
            ); })()}
            <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder={`label (defaults to ${(VIBE_AGENTS.find((x) => x.key === fVibe) ?? VIBE_AGENTS[0]).name.toLowerCase()})`} style={{ ...inp }} />
            <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>edit scope · files this engine may WRITE — reads the whole repo, edits outside are blocked at the merge gate</span>
            <FileTree value={fScope} onChange={setFScope} entries={entries} />
            {scopeSumLine}
            <span style={{ fontFamily: mono, fontSize: 8.5, color: C.ok }}>👁 READS (context): the whole worktree + its AGENTS.md brief (mission + your guidance, written at provision time)</span>
            <textarea value={fExtra} onChange={(e) => setFExtra(e.target.value)} placeholder="extra guidance — added to the engine's AGENTS.md brief" style={{ ...inp, minHeight: 52, resize: "vertical" }} />
            </>}
              </div>
              {/* RIGHT — pick the pane type (gallery) */}
              {formMode === "add" && (
                <div style={{ minWidth: 0, overflowY: "auto", borderLeft: `1px solid ${C.border}`, paddingLeft: 16 }}>
                  <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Pane type</div>
                  {(() => {
              const groups: ("agents" | "tools" | "collections")[] = ["collections", "agents", "tools"];
              // ESSENTIALS-FIRST (adoption slice 3): six kinds cover the golden
              // path; the other ~19 sit behind one expander so the wall of choices
              // never greets a newcomer. Your own saved formations always show.
              const ESSENTIALS = new Set(["agent", "opencode", "review", "run", "kanban", "col-ultra-dev"]);
              const visible = (k: string) => galleryAll || ESSENTIALS.has(k) || (k.startsWith("col-") && !!userTpls[k.slice(4)]);
              const hiddenCount = PANE_KINDS.filter((m) => !visible(m.key)).length;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {groups.map((grp) => (
                    <div key={grp}>
                      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{grp === "agents" ? "Agents — they write code" : grp === "collections" ? "Automations — panes wired together as steps toward one goal" : "Tools — viewers & session surfaces"}</div>
                      {(grp !== "tools" ? [undefined] : [...new Set(PANE_KINDS.filter((m) => m.group === "tools").map((m) => m.cat))]).map((cat) => {
                        const items = [...PANE_KINDS.filter((m) => m.group === grp && (grp !== "tools" || m.cat === cat)),
                          /* YOUR automations ride the same gallery shelf as the stock ones */
                          ...(grp === "collections" ? Object.entries(userTpls).map(([k, t]) => ({ key: `col-${k}`, label: `▧ ${t.title}`, group: "collections" as const, desc: `YOUR automation · ${t.slots.length} pane${t.slots.length === 1 ? "" : "s"}: ${t.slots.map((s: any) => s.label).join(", ")}`, sample: null as React.ReactNode, soon: false, custom: k })) : [])].filter((m) => visible(m.key));
                        if (!items.length && grp !== "collections") return null;
                        return (
                        <div key={cat ?? "all"} style={{ marginBottom: grp === "tools" ? 8 : 0 }}>
                          {cat && <div style={{ fontFamily: mono, fontSize: 8, color: C.brand, textTransform: "uppercase", letterSpacing: 0.9, margin: "2px 0 4px" }}>{cat}</div>}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 7 }}>
                            {items.map((m) => {
                              const eng = (engines as any)[m.key];
                              const missing = eng && !eng.installed;
                              const custom = (m as any).custom as string | undefined;
                              const card = <PaneCard key={m.key} meta={{ ...m, desc: missing ? m.desc + " (CLI not found on PATH — install it first.)" : m.desc }} selected={fKind === m.key} disabled={!!m.soon} onSelect={() => setFKind(m.key as any)} />;
                              if (!custom) return card;
                              return (
                                <div key={m.key} style={{ position: "relative" }}>
                                  {card}
                                  <button onClick={(e) => { e.stopPropagation(); deleteUserTpl(custom); }} title="delete this automation (already-spawned panes stay)"
                                    style={{ position: "absolute", top: 3, right: 3, width: 15, height: 15, borderRadius: "50%", border: `1px solid ${C.border}`, background: C.bg, color: C.bad, cursor: "pointer", fontFamily: mono, fontSize: 8, lineHeight: 1, padding: 0, display: "grid", placeItems: "center" }}>✕</button>
                                </div>
                              );
                            })}
                            {/* ＋ CREATE — always the last card of the Automations shelf */}
                            {grp === "collections" && (
                              <button onClick={() => setComposerOpen(true)} title="compose a personalized automation — nodes wired by inputs/outputs; agent steps auto-run, tool steps pause"
                                style={{ minHeight: 64, border: `1.5px dashed ${C.brand}`, borderRadius: 10, background: "transparent", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
                                <span style={{ fontSize: 15 }}>🧪</span>＋ create automation</button>
                            )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  ))}
                  <button onClick={() => { const v = !galleryAll; setGalleryAll(v); try { localStorage.setItem("vibe_gallery_all", v ? "1" : "0"); } catch { /* private mode */ } }}
                    style={{ ...btn, alignSelf: "flex-start", padding: "4px 12px", fontSize: 10, color: C.brand, borderColor: "transparent" }}>
                    {galleryAll ? "▴ show the essentials only" : `▾ everything (${hiddenCount} more)`}
                  </button>
                </div>
              );
                  })()}
                  {/* THE VIBE ROSTER (operator 2026-07-14: "the base identity should have
                      more personality — mini avatars, complete name… it opens below when
                      you choose the agent"): pick WHO builds, not a pipeline role. */}
                  {(fKind === "agent" || isEnginePaneKind(fKind)) && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Base agent — who is this?</div>
                      {/* AVATAR CIRCLES (operator 2026-07-14: "a circle with only the icon and
                          name like an avatar, mouse over the info, select shows the border,
                          beautiful animation"): staggered rise-in, hover popover. */}
                      <style>{`@keyframes vibeRise { from { opacity: 0; transform: translateY(10px) scale(.85); } to { opacity: 1; transform: none; } } @keyframes vibePulse { 0%, 100% { box-shadow: 0 0 0 0 var(--pulse); } 50% { box-shadow: 0 0 16px 3px var(--pulse); } }`}</style>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "4px 2px 2px" }}>
                        {VIBE_AGENTS.map((v, vi) => {
                          const on = fVibe === v.key;
                          return (
                            <div key={v.key} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, animation: `vibeRise .34s ${vi * 0.055}s cubic-bezier(.2,.9,.3,1.2) backwards` }}
                              onMouseEnter={(e) => { const pop = (e.currentTarget.querySelector("[data-pop]") as HTMLElement); if (pop) pop.style.display = "block"; }}
                              onMouseLeave={(e) => { const pop = (e.currentTarget.querySelector("[data-pop]") as HTMLElement); if (pop) pop.style.display = "none"; }}>
                              <button data-testid={`vibe-${v.key}`} onClick={() => { setFVibe(v.key); setFBase(v.base); }}
                                style={{ width: 52, height: 52, borderRadius: "50%", cursor: "pointer", fontSize: 23, lineHeight: 1, display: "grid", placeItems: "center", transition: "transform .12s, border-color .12s, box-shadow .12s", transform: on ? "scale(1.08)" : undefined, border: on ? `2.5px solid ${v.color}` : `1.5px solid ${C.border}`, background: on ? `color-mix(in oklab, ${v.color} 14%, ${C.bg})` : C.bg, boxShadow: on ? `0 0 0 4px color-mix(in oklab, ${v.color} 18%, transparent)` : "none" }}>
                                {v.avatar}
                              </button>
                              <span style={{ fontFamily: mono, fontSize: 9.5, fontWeight: on ? 700 : 500, color: on ? v.color : C.muted }}>{v.name}</span>
                              <div data-pop style={{ display: "none", position: "absolute", top: 58, left: "50%", transform: "translateX(-50%)", zIndex: 20, width: 195, background: C.panel, border: `1px solid ${v.color}`, borderRadius: 9, padding: "7px 9px", boxShadow: "0 6px 20px rgba(0,0,0,.35)", pointerEvents: "none" }}>
                                <div style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 700 }}>{v.avatar} {v.name}</div>
                                <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, lineHeight: 1.45, margin: "2px 0" }}>{v.tagline}</div>
                                <div style={{ fontFamily: mono, fontSize: 8, color: v.color }}>vibes with: {v.vibes}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, marginTop: 5 }}>the persona is injected into the pane's prompt — inspect or override it any time (✎ edit · 🧾 prompt window). "vibes with" = source chips worth adding in the Context Studio.</div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              {(() => { const engineKind = isEnginePaneKind(fKind) && fKind !== "opencode"; const canSave = engineKind || fKind === "script" || fKind === "git" || fKind === "context" || !!fBase; return (
              <button onClick={saveForm} disabled={!canSave} style={{ ...btn, color: canSave ? C.ok : C.muted, borderColor: canSave ? C.ok : C.border, cursor: canSave ? "pointer" : "not-allowed" }}>{formMode === "add" ? "add pane" : "save"}</button>
              ); })()}
              <button onClick={closeForm} style={{ ...btn, color: C.muted }}>cancel</button>
            </div>
          </div>
        </div>
      )}

      {studioOpen && sid && (
        <ContextStudio sessionId={sid} panes={panes} onClose={() => setStudioOpen(false)} onChanged={() => { if (sid) loadSession(sid); }} />
      )}

      {/* 🧪 the formation composer — build a personalized, WIRED collection */}
      {composerOpen && <FormationComposer onSave={saveComposed} onClose={() => setComposerOpen(false)} />}

      {/* promote — ask for the goal; the AI drafts the card from it + the pane context */}
      {promoteFor !== null && (
        <div onClick={() => { setPromoteFor(null); setPromoteDraft(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 200, display: "grid", placeItems: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(600px, 94vw)", maxHeight: "88vh", overflowY: "auto", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 600 }}>promote to a driver card</span>
            {!promoteDraft ? (
              <>
                <span style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>what's the goal? the AI drafts a card from your goal + this pane's context — you review it before it's created.</span>
                <textarea value={promoteGoal} onChange={(e) => setPromoteGoal(e.target.value)} placeholder="e.g. finish the login form + wire it to the real /auth endpoint, with tests" style={{ ...inp, minHeight: 70, resize: "vertical" }} autoFocus />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => doPromoteDraft(promoteFor, promoteGoal)} disabled={promoteBusy} style={{ ...btn, color: C.brand, borderColor: C.brand }}>{promoteBusy ? "drafting…" : "draft card →"}</button>
                  <button onClick={() => setPromoteFor(null)} style={{ ...btn, color: C.muted }}>cancel</button>
                </div>
              </>
            ) : (
              <>
                <span style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>review + edit, then approve. nothing is created until you click create.</span>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>title</span>
                <input value={promoteDraft.title} onChange={(e) => setPromoteDraft({ ...promoteDraft, title: e.target.value })} style={{ ...inp }} />
                <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>body</span>
                <textarea value={promoteDraft.body} onChange={(e) => setPromoteDraft({ ...promoteDraft, body: e.target.value })} style={{ ...inp, minHeight: 200, resize: "vertical" }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => doPromoteCreate(promoteFor)} style={{ ...btn, color: C.ok, borderColor: C.ok }}>✓ create card</button>
                  <button onClick={() => setPromoteDraft(null)} style={{ ...btn, color: C.muted }}>← back</button>
                  <button onClick={() => { setPromoteFor(null); setPromoteDraft(null); }} style={{ ...btn, color: C.bad, borderColor: C.border }}>reject</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// PENDING PLAN (operator 2026-07-06: "always deliver the plan, only apply on Apply"): the
// agent's proposed edits, per-file expandable old→new, with Apply/Discard. Renders only
// while a plan is pending on the pane.
function PendingPlan({ p, busy, onOp }: { p: any; busy: boolean; onOp: (op: "apply_pending" | "discard_pending") => void }) {
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  let plan: any[] = [];
  try { plan = JSON.parse(p.pending_edits_json ?? "[]"); } catch { plan = []; }
  if (!Array.isArray(plan) || !plan.length) return null;
  return (
    <div style={{ borderTop: `1px solid ${C.warn}`, background: "oklch(0.24 0.04 90 / 0.25)", padding: "6px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.warn, fontWeight: 700 }}>📋 plan — {plan.length} file(s) waiting</span>
        <span style={{ flex: 1 }} />
        <button disabled={busy} onClick={() => onOp("apply_pending")} style={{ ...btn, padding: "1px 10px", fontSize: 10, color: C.ok, borderColor: C.ok }}>✓ Apply</button>
        <button disabled={busy} onClick={() => onOp("discard_pending")} style={{ ...btn, padding: "1px 10px", fontSize: 10, color: C.bad, borderColor: C.border }}>✕ Discard</button>
      </div>
      {plan.map((f: any) => (
        <div key={f.path}>
          <button onClick={() => setOpen((o) => ({ ...o, [f.path]: !o[f.path] }))}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: mono, fontSize: 9.5, color: C.fg }}>
            {open[f.path] ? "▾" : "▸"} {f.path} <span style={{ color: C.dim }}>({f.old_content == null ? "new file" : `${String(f.old_content).length} → ${String(f.content).length} chars`})</span>
          </button>
          {open[f.path] && <DiffView oldText={f.old_content} newText={f.content} />}
        </div>
      ))}
    </div>
  );
}

// SCRIPT-RUNNER PANE (operator 2026-07-06): runs a scripts-registry command (never free
// text) in a CHOSEN sibling pane's worktree; live output streams via the existing
// /gate/build-live poll (key vibe-pane-<id>). Run again = kill + fresh run.
export function ScriptPane({ p, panes, onChanged }: { p: any; panes: any[]; onChanged: () => void }) {
  const [out, setOut] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [err2, setErr2] = React.useState<string | null>(null);
  const lastId = React.useRef(0);
  const boxRef = React.useRef<HTMLPreElement | null>(null);
  const wtPanes = panes.filter((x: any) => x.worktree_path && x.id !== p.id);
  // "root" = the workspace root itself (operator 2026-09-16: the Terminal pane's scripts tab must run
  // even when no agent pane owns a worktree); a pane id = that agent's box.
  const [wtPane, setWtPane] = React.useState<number | "root" | null>(p.script_worktree_pane ?? wtPanes[0]?.id ?? "root");

  React.useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const r: any = await apiGet(`/api/v1/gate/build-live?contract_slug=${encodeURIComponent(`vibe-pane-${p.id}`)}&after=${lastId.current}`);
        const d = r?.result ?? r;
        if (stop || !d) return;
        if (d.chunks?.length) {
          lastId.current = d.last_id;
          setOut((prev) => (prev + d.chunks.map((c: any) => c.chunk ?? "").join("")).slice(-60000));
          requestAnimationFrame(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; });
        }
        if (d.done) setRunning(false);
      } catch { /* endpoint absent pre-restart */ }
    };
    poll();
    const t = setInterval(poll, running ? 1200 : 5000);
    return () => { stop = true; clearInterval(t); };
  }, [p.id, running]);

  const run = async () => {
    if (!wtPane) { setErr2("pick a worktree pane first"); return; }
    setErr2(null); setOut(""); lastId.current = 0; setRunning(true);
    try {
      const scriptKind = p.script_kind ?? (String(p.subagent_name ?? "").split("·")[1] || "build");
      const r: any = await apiPost("/api/v1/cockpit/script-run", { op: "run", pane_id: p.id, script: scriptKind, worktree_pane_id: wtPane }, { timeoutMs: 30000 });
      const d = r?.result ?? r;
      if (!d?.ok) { setErr2(d?.error ?? "run refused"); setRunning(false); }
      if (wtPane !== "root" && wtPane !== p.script_worktree_pane && !p.synthetic) { await apiPost("/api/v1/cockpit/pane/update", { pane_id: p.id, script_worktree_pane: wtPane }, { timeoutMs: 30000 }); onChanged(); }
    } catch (e: any) { setErr2(e?.message ?? "run failed"); setRunning(false); }
  };
  const stopRun = async () => {
    try { await apiPost("/api/v1/cockpit/script-run", { op: "stop", pane_id: p.id }, { timeoutMs: 30000 }); } catch { /* */ }
    setRunning(false);
  };
  // the runner FLIPS to the browser (operator 2026-07-15: "the runner should
  // have a flip button to show the browser at the port"): the served URL is
  // read from the run output itself; both faces stay mounted so neither the
  // scrollback nor the page reloads on flip.
  const previewUrl = React.useMemo(() => {
    const m = [...out.matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d{2,5})?(?:\/[^\s'"`)\]]*)?/gi)];
    const raw = m.length ? m[m.length - 1][0] : null;
    return raw ? raw.replace("0.0.0.0", "localhost").replace(/[.,;]+$/, "") : null;
  }, [out]);
  const [flip, setFlip] = React.useState(false);
  React.useEffect(() => { if (!previewUrl) setFlip(false); }, [previewUrl]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>worktree</span>
        <select value={wtPane ?? ""} onChange={(e) => setWtPane(e.target.value === "root" ? "root" : e.target.value ? Number(e.target.value) : null)} style={{ ...inp, flex: 1, fontSize: 10 }}>
          <option value="root">workspace root</option>
          {wtPanes.map((x: any) => <option key={x.id} value={x.id}>#{x.idx + 1} {x.subagent_name} · {x.branch ?? x.worktree_path}</option>)}
        </select>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.brand, fontWeight: 700 }} title="from the scripts registry — not editable here">{p.script_kind ?? (String(p.subagent_name ?? "").split("·")[1] || "build")}</span>
        {previewUrl && (
          <button onClick={() => setFlip((v) => !v)} title={flip ? "back to the run output" : `open ${previewUrl} inside the pane`}
            style={{ ...btn, padding: "1px 10px", fontSize: 10, color: flip ? C.muted : C.brand, borderColor: flip ? C.border : C.brand }}>
            {flip ? "◀ output" : "🌐 preview"}
          </button>
        )}
        <button onClick={run} style={{ ...btn, padding: "1px 10px", fontSize: 10, color: C.ok, borderColor: C.ok }}>{running ? "↻ re-run" : "▶ run"}</button>
        {running && <button onClick={stopRun} style={{ ...btn, padding: "1px 8px", fontSize: 10, color: C.bad, borderColor: C.bad }}>■</button>}
      </div>
      {err2 && <div style={{ padding: "4px 10px", fontFamily: mono, fontSize: 9.5, color: C.bad }}>{err2}</div>}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <pre ref={boxRef} style={{ position: "absolute", inset: 0, margin: 0, padding: "8px 10px", overflow: "auto", background: "#0b0f16", fontFamily: mono, fontSize: 10, lineHeight: 1.5, color: "#c9d4e3", whiteSpace: "pre-wrap", wordBreak: "break-word", display: flip ? "none" : "block" }}>
          {out || "no output yet — pick where to run (workspace root or an agent's box) and hit ▶ run (the command comes from the scripts registry on the Code screen)"}
        </pre>
        {previewUrl && (
          <iframe src={previewUrl} title={`preview ${previewUrl}`}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", background: "#fff", display: flip ? "block" : "none" }} />
        )}
      </div>
    </div>
  );
}

// LINE DIFF (operator 2026-07-06: "didn't show diff in a human way to read"): LCS over
// lines (capped), unchanged runs collapsed — the classic +green/−red unified view.
function diffLines(a: string, b: string): Array<{ t: " " | "+" | "-"; s: string }> {
  const A = String(a ?? "").split("\n").slice(0, 500);
  const B = String(b ?? "").split("\n").slice(0, 500);
  const n = A.length; const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Array<{ t: " " | "+" | "-"; s: string }> = [];
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: " ", s: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: "-", s: A[i] }); i++; }
    else { out.push({ t: "+", s: B[j] }); j++; }
  }
  while (i < n) { out.push({ t: "-", s: A[i++] }); }
  while (j < m) { out.push({ t: "+", s: B[j++] }); }
  return out;
}

function DiffView({ oldText, newText }: { oldText: string | null; newText: string }) {
  const rows = React.useMemo(() => {
    if (oldText == null) return String(newText ?? "").split("\n").map((s) => ({ t: "+" as const, s }));
    return diffLines(oldText, newText);
  }, [oldText, newText]);
  // collapse unchanged runs longer than 5 into "· N unchanged"
  const view: Array<{ t: string; s: string; n?: number }> = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length > 5) { view.push({ t: " ", s: run[0] }); view.push({ t: "·", s: "", n: run.length - 2 }); view.push({ t: " ", s: run[run.length - 1] }); }
    else run.forEach((s) => view.push({ t: " ", s }));
    run = [];
  };
  for (const r of rows) { if (r.t === " ") run.push(r.s); else { flush(); view.push(r); } }
  flush();
  return (
    <pre style={{ margin: "2px 0 0", padding: 6, maxHeight: 220, overflow: "auto", fontFamily: mono, fontSize: 9.5, lineHeight: 1.5, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
      {view.map((r, i) => r.t === "·"
        ? <div key={i} style={{ color: C.dim, textAlign: "center" }}>· · · {r.n} unchanged lines · · ·</div>
        : <div key={i} style={{ color: r.t === "+" ? C.ok : r.t === "-" ? C.bad : C.dim, background: r.t === "+" ? "oklch(0.3 0.05 150 / 0.25)" : r.t === "-" ? "oklch(0.3 0.05 25 / 0.25)" : "transparent" }}>{r.t === " " ? "  " : r.t + " "}{r.s}</div>)}
    </pre>
  );
}

// TURN PROCESS strip (operator 2026-07-06: "didn't show the process like the skills
// called and AI lifecycle like chat does"): what the last turn actually did — the AI
// call (clickable → the full call modal), plan/applied/rejected counts, parse warnings.
function TurnProcess({ t }: { t: any }) {
  if (!t) return null;
  const openCall = () => { try { (window as any).antilokiOpenAICall?.(t.ai_call_id); } catch { /* modal absent */ } };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 10px", borderTop: `1px solid ${C.border}`, fontFamily: mono, fontSize: 9, color: C.dim, flexWrap: "wrap" }}>
      <span style={{ color: C.muted }}>⚙ last turn</span>
      {t.ai_call_id && <button onClick={openCall} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: mono, fontSize: 9, color: C.brand, textDecoration: "underline" }}>call #{t.ai_call_id}</button>}
      {t.pending?.length > 0 && <span style={{ color: C.warn }}>📋 planned {t.pending.length} file(s)</span>}
      {t.applied?.length > 0 && <span style={{ color: C.ok }}>✓ applied {t.applied.length}</span>}
      {t.rejected?.length > 0 && <span style={{ color: C.bad }} title={t.rejected.map((r: any) => `${r.path}: ${r.reason}`).join("\n")}>✗ rejected {t.rejected.length}</span>}
      {t.unparsed_edit_hint && <span style={{ color: C.warn }}>⚠ edit-like JSON didn't match the contract — no plan made</span>}
      {t.agent_error && <span style={{ color: C.bad }}>error: {String(t.agent_error).slice(0, 60)}</span>}
    </div>
  );
}
