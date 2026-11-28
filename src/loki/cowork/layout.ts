// THE COWORK LAYOUT TREE (RFC 0007 §5.3): panes split right, below and left, like herdr. Pure and immutable: every
// operation returns a new Layout, so the screen is a function of it and a reload restores it exactly.
//
// A pane is an engine terminal (claude, codex, ...), a shell, or a Studio tool. The tree holds only references; the
// terminal itself lives in the host, so closing the window or restarting the serve never touches it.

export type PaneKind = "engine" | "shell" | "tool" | "worker";
/** `paneId` is the serve's pane row (the terminal's key); `id` is this layout's own handle. */
/** An installed web app shown in a pane (webapps.ts): its id, name and the page it opens. */
export type WebAppRef = { id: string; name: string; url: string };
export type PaneRef = { id: string; kind: PaneKind; /** nothing runs until the person starts it (a team's Leader that nobody asked for: issue 30) */ held?: boolean; /** a SPECIALIST's pane: the same terminal with its own context and access behind it; its bar and face carry its colour */ specialist?: { id: string; shape?: string; color?: string; /** the Leader of a team, a specialist that lives in the team */ leader?: boolean }; /** how this agent pane is drawn (its own switch); unset = the default of Appearance */ skin?: "terminal" | "chat"; /** a team leader's avatar (its bar wears the same pixelated look as a specialist's, tagged LEADER) */ look?: { shape?: string; color?: string };  /** a free pane (RFC 0016): the folder it shows */ free?: { id: string }; engine?: string; tool?: string; title?: string; paneId?: number; /** a team pane: the team it shows (RFC 0008) */ teamId?: string; /** an agent terminal that is the LEADER of this team (a fork of a team has a Leader of its own: the operator 2026-11-18); drawn inside the team pane, not as a tile */ leaderOf?: string; /** the cockpit session a tool pane belongs to */ sessionId?: number; /** a preview pane runs this pane's app */ target?: number; /** a QA pane: the id of the QA run it shows live (an agent's antiloki_qa) */ run?: number; /** a worker pane: the key of the delegated task it shows (workers.ts). Derived from the serve's runs, never stored. */ worker?: string; /** an X-ray pane: the one part of X-ray it shows, for which space (an agent's antiloki_xray_open) */ xray?: XrayView; /** a web app pane: the installed app it shows */ webapp?: WebAppRef; /** a pane linked into a team: the role it plays there (team-layout.ts) */ role?: TeamRole; /** a SIDE QUESTION: the cockpit pane number of the agent it answers questions about (read-only) */ side?: number; /** a GROUP pane: the number of the group whose conversation it shows (RFC 0025) */ group?: number; /** folded into a strip with its name (its terminal keeps running) */ collapsed?: boolean };
/** WHAT AN X-RAY PANE SHOWS: one part of X-ray, for one space (a name or root; empty is the open one). */
export type XrayView = { view: string; space?: string; path?: string; symbol?: string; depth?: number; source?: string };
export type Leaf = { type: "leaf"; pane: PaneRef };
export type TeamRole = "planner" | "worker" | "qa";
/** `team` marks a split that IS a team: its children are the team's panes, in role order, and it is dragged as one block (team-layout.ts). */
export type Split = { type: "split"; dir: "row" | "col"; sizes: number[]; children: Node[]; team?: string };
export type Node = Leaf | Split;
export type Layout = { root: Node | null; focus: string | null; zoom: string | null };
/** Where a new pane goes, relative to the one it splits. */
export type Side = "right" | "left" | "below" | "above";

/** A soft cap: a live terminal is a few hundred MB, and this is a laptop shared with a browser (RFC 0007 §11). */
export const MAX_PANES = 12;
/** No pane is ever squeezed below this share of its split. */
export const MIN_SHARE = 0.08;

export const emptyLayout = (): Layout => ({ root: null, focus: null, zoom: null });

export function leaves(n: Node | null): PaneRef[] {
  if (!n) return [];
  return n.type === "leaf" ? [n.pane] : n.children.flatMap(leaves);
}
export const paneCount = (l: Layout): number => leaves(l.root).length;
export const findPane = (l: Layout, id: string): PaneRef | null => leaves(l.root).find((p) => p.id === id) ?? null;
export const hasPane = (l: Layout, id: string): boolean => findPane(l, id) !== null;

/** Why a pane cannot be added, or null. Pure. */
export function addBlocked(l: Layout, pane: PaneRef): string | null {
  if (hasPane(l, pane.id)) return `pane ${pane.id} is already open`;
  if (paneCount(l) >= MAX_PANES) return `${MAX_PANES} panes are open, which is the most this machine should hold; close one first`;
  return null;
}

const leaf = (pane: PaneRef): Leaf => ({ type: "leaf", pane });
const even = (n: number): number[] => Array.from({ length: n }, () => 1 / n);
/** Scale to sum 1 and lift anything under MIN_SHARE, taking the difference from the largest. */
export function normalize(sizes: number[]): number[] {
  const n = sizes.length;
  if (n === 0) return [];
  const clean = sizes.map((s) => (Number.isFinite(s) && s > 0 ? s : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  let out = total > 0 ? clean.map((s) => s / total) : even(n);
  if (n * MIN_SHARE >= 1) return even(n);
  for (let guard = 0; guard < n + 2; guard += 1) {
    const low = out.findIndex((s) => s < MIN_SHARE - 1e-9);
    if (low < 0) break;
    const need = MIN_SHARE - out[low];
    const big = out.reduce((bi, s, i) => (s > out[bi] ? i : bi), 0);
    out = out.map((s, i) => (i === low ? MIN_SHARE : i === big ? s - need : s));
  }
  return out;
}

/** Add a pane. The first one becomes the root; otherwise it splits the focused pane to the right. */
export function addPane(l: Layout, pane: PaneRef, side: Side = "right"): Layout {
  if (addBlocked(l, pane)) return l;
  if (!l.root) return { root: leaf(pane), focus: pane.id, zoom: null };
  const target = l.focus && hasPane(l, l.focus) ? l.focus : leaves(l.root)[0].id;
  return splitPane(l, target, side, pane);
}

/** Split `targetId` on `side`, putting `pane` there. A neighbour split in the same direction takes it as a sibling. */
export function splitPane(l: Layout, targetId: string, side: Side, pane: PaneRef): Layout {
  if (!l.root || !hasPane(l, targetId) || addBlocked(l, pane)) return l;
  return { ...splitNode(l, targetId, side, leaf(pane)), focus: pane.id, zoom: null };
}
/** The same for any node (a pane, or a whole team block): put `node` beside the pane `targetId`, on `side`. Focus is the caller's to set. */
export function splitNode(l: Layout, targetId: string, side: Side, node: Node): Layout {
  if (!l.root || !hasPane(l, targetId)) return l;
  const dir: "row" | "col" = side === "right" || side === "left" ? "row" : "col";
  const before = side === "left" || side === "above";
  const walk = (n: Node): Node => {
    if (n.type === "leaf") {
      if (n.pane.id !== targetId) return n;
      const kids = before ? [node, n] : [n, node];
      return { type: "split", dir, sizes: [0.5, 0.5], children: kids };
    }
    const idx = n.children.findIndex((c) => c.type === "leaf" && c.pane.id === targetId);
    // a team block keeps its panes: whatever is dropped beside one of them goes beside the BLOCK, not into it
    if (idx >= 0 && n.team) return { type: "split", dir, sizes: [0.5, 0.5], children: before ? [node, n] : [n, node] };
    if (idx >= 0 && n.dir === dir) {
      const at = before ? idx : idx + 1;
      const half = n.sizes[idx] / 2;
      const sizes = n.sizes.slice();
      sizes[idx] = half;
      sizes.splice(at, 0, half);
      const children = n.children.slice();
      children.splice(at, 0, node);
      return { ...n, sizes: normalize(sizes), children };
    }
    return { ...n, children: n.children.map(walk) };
  };
  return { ...l, root: walk(l.root), zoom: null };
}

/** Close a pane. A split left with one child collapses into it; the freed share goes to the neighbour. */
export function closePane(l: Layout, id: string): Layout {
  if (!l.root || !hasPane(l, id)) return l;
  const order = leaves(l.root).map((p) => p.id);
  const next = order[order.indexOf(id) + 1] ?? order[order.indexOf(id) - 1] ?? null;
  const drop = (n: Node): Node | null => {
    if (n.type === "leaf") return n.pane.id === id ? null : n;
    const kept: Node[] = []; const sizes: number[] = [];
    n.children.forEach((c, i) => { const r = drop(c); if (r) { kept.push(r); sizes.push(n.sizes[i]); } });
    if (kept.length === 0) return null;
    if (kept.length === 1) return kept[0];
    return { ...n, children: kept, sizes: normalize(sizes) };
  };
  const root = drop(l.root);
  return { root, focus: l.focus === id ? (root ? next : null) : l.focus, zoom: l.zoom === id ? null : l.zoom };
}

/** Give a pane a share of the split it sits in (a number from 0 to 1): the others keep their proportions among what is left. A pane alone, or one that is not there, changes nothing. The share is held to what no pane
 *  can be squeezed below (MIN_SHARE), on both sides. */
export function resizePane(l: Layout, id: string, share: number): Layout {
  if (!l.root || !hasPane(l, id) || !Number.isFinite(share)) return l;
  let done = false;
  const walk = (n: Node): Node => {
    if (n.type === "leaf" || done) return n;
    const i = n.children.findIndex((c) => c.type === "leaf" && c.pane.id === id);
    if (i >= 0) {
      done = true;
      const k = n.children.length; const mine = Math.min(Math.max(share, MIN_SHARE), 1 - MIN_SHARE * (k - 1));
      const rest = n.sizes.reduce((a, b, j) => (j === i ? a : a + b), 0);
      const sizes = n.sizes.map((sz, j) => (j === i ? mine : rest > 0 ? (sz / rest) * (1 - mine) : (1 - mine) / (k - 1)));
      return { ...n, sizes: normalize(sizes) };
    }
    return { ...n, children: n.children.map(walk) };
  };
  const root = walk(l.root);
  return done ? { ...l, root } : l;
}

/** Set the sizes of the split at `path` (child indexes from the root). */
export function setSizes(l: Layout, path: number[], sizes: number[]): Layout {
  if (!l.root) return l;
  const go = (n: Node, p: number[]): Node => {
    if (n.type === "leaf") return n;
    if (p.length === 0) return sizes.length === n.children.length ? { ...n, sizes: normalize(sizes) } : n;
    const [i, ...rest] = p;
    return { ...n, children: n.children.map((c, ci) => (ci === i ? go(c, rest) : c)) };
  };
  return { ...l, root: go(l.root, path) };
}

export function focusPane(l: Layout, id: string): Layout { return hasPane(l, id) ? { ...l, focus: id } : l; }
/** Cycle focus in reading order. `step` is 1 or -1. */
export function cycleFocus(l: Layout, step: 1 | -1): Layout {
  const ids = leaves(l.root).map((p) => p.id);
  if (ids.length === 0) return l;
  const at = l.focus ? ids.indexOf(l.focus) : -1;
  return { ...l, focus: ids[(at + step + ids.length) % ids.length] };
}
export function toggleZoom(l: Layout, id: string | null = l.focus): Layout {
  if (!id || !hasPane(l, id)) return l;
  return { ...l, zoom: l.zoom === id ? null : id };
}
/** Fold a pane into its strip, or open it again. The last pane that is open cannot be folded (the screen would be only strips). Pure - tested. */
export function toggleCollapse(l: Layout, id: string | null = l.focus): Layout {
  if (!id || !l.root) return l;
  const all = leaves(l.root); const p = all.find((x) => x.id === id); if (!p) return l;
  if (!p.collapsed && all.filter((x) => !x.collapsed).length < 2) return l;
  const walk = (n: Node): Node => n.type === "leaf" ? (n.pane.id === id ? { ...n, pane: p.collapsed ? (({ collapsed: _c, ...rest }) => rest)(n.pane) : { ...n.pane, collapsed: true } } : n) : { ...n, children: n.children.map(walk) };
  return { ...l, root: walk(l.root) };
}
/** Swap two panes in place; sizes stay with their slots. */
export function swapPanes(l: Layout, a: string, b: string): Layout {
  const pa = findPane(l, a); const pb = findPane(l, b);
  if (!l.root || !pa || !pb || a === b) return l;
  const walk = (n: Node): Node => n.type === "leaf"
    ? (n.pane.id === a ? leaf(pb) : n.pane.id === b ? leaf(pa) : n)
    : { ...n, children: n.children.map(walk) };
  return { ...l, root: walk(l.root) };
}
/** Move a pane next to another: it leaves where it was (the neighbour takes its share) and is split in on `side` of `targetId`. Dropping on the left or right of a pane
 *  makes a row there, on the top or bottom a column, so one gesture changes both the order and the orientation. Moving onto itself, or a pane that is not there, changes nothing. */
export function movePane(l: Layout, id: string, targetId: string, side: Side): Layout {
  const pane = findPane(l, id);
  if (!l.root || !pane || id === targetId || !hasPane(l, targetId)) return l;
  const without = closePane(l, id);
  const next = splitPane(without, targetId, side, pane);
  return next === without ? l : { ...next, zoom: null };
}
/** Turn the split a pane sits in the other way (side by side becomes stacked and back): the pane's own parent split only, children and shares kept. */
export function flipSplit(l: Layout, id: string): Layout {
  if (!l.root || !hasPane(l, id)) return l;
  let done = false;
  const walk = (n: Node): Node => {
    if (n.type === "leaf" || done) return n;
    if (n.children.some((c) => c.type === "leaf" && c.pane.id === id)) { done = true; return { ...n, dir: n.dir === "row" ? "col" : "row" }; }
    return { ...n, children: n.children.map(walk) };
  };
  const root = walk(l.root);
  return done ? { ...l, root } : l;
}
/** Replace one pane's reference (its title changed, its terminal restarted) without moving it. */
export function updatePane(l: Layout, id: string, patch: Partial<PaneRef>): Layout {
  if (!l.root || !hasPane(l, id)) return l;
  const walk = (n: Node): Node => n.type === "leaf"
    ? (n.pane.id === id ? leaf({ ...n.pane, ...patch, id }) : n)
    : { ...n, children: n.children.map(walk) };
  return { ...l, root: walk(l.root) };
}

// ── persistence: parse whatever came back from the serve, never trust it ─────────────────────────────────────────
const isKind = (k: unknown): k is PaneKind => k === "engine" || k === "shell" || k === "tool";
function parseNode(v: any, seen: Set<string>, depth: number): Node | null {
  if (!v || typeof v !== "object" || depth > 12) return null;
  if (v.type === "leaf") {
    const p = v.pane;
    if (!p || typeof p.id !== "string" || !p.id || !isKind(p.kind) || seen.has(p.id)) return null;
    seen.add(p.id);
    const pane: PaneRef = { id: p.id, kind: p.kind };
    if (typeof p.engine === "string") pane.engine = p.engine;
    if (typeof p.tool === "string") pane.tool = p.tool;
    if (typeof p.title === "string") pane.title = p.title.slice(0, 80);
    if (typeof p.paneId === "number" && Number.isFinite(p.paneId)) pane.paneId = p.paneId;
    if (typeof p.sessionId === "number" && Number.isFinite(p.sessionId)) pane.sessionId = p.sessionId;
    if (typeof p.target === "number" && Number.isFinite(p.target)) pane.target = p.target;
    if (typeof p.run === "number" && Number.isFinite(p.run)) pane.run = p.run;
    if (p.role === "planner" || p.role === "worker" || p.role === "qa") pane.role = p.role;
    if (p.collapsed === true) pane.collapsed = true;
    if (p.held === true) pane.held = true;
    if (typeof p.side === "number" && Number.isFinite(p.side) && p.side > 0) pane.side = p.side;
    if (typeof p.group === "number" && Number.isFinite(p.group) && p.group > 0) pane.group = p.group;
    if (p.xray && typeof p.xray === "object" && typeof (p.xray as any).view === "string") { const x = p.xray as Record<string, unknown>; const t = (v: unknown, n = 300) => (typeof v === "string" ? v.slice(0, n) : undefined); pane.xray = { view: String(x.view).slice(0, 40), space: t(x.space), path: t(x.path, 500), symbol: t(x.symbol, 200), source: t(x.source, 60), depth: typeof x.depth === "number" && Number.isFinite(x.depth) ? x.depth : undefined }; }
    if (typeof p.teamId === "string" && /^[a-z0-9-]{1,80}$/.test(p.teamId)) pane.teamId = p.teamId;
    if (typeof p.leaderOf === "string" && /^[A-Za-z0-9 _.-]{1,120}$/.test(p.leaderOf)) pane.leaderOf = p.leaderOf;
    if (p.skin === "terminal" || p.skin === "chat") pane.skin = p.skin;
    const lk = p.look as { shape?: unknown; color?: unknown } | undefined; if (lk && typeof lk === "object") { const look: { shape?: string; color?: string } = {}; if (typeof lk.shape === "string" && /^[a-z]{1,16}$/.test(lk.shape)) look.shape = lk.shape; if (typeof lk.color === "string" && /^[a-z]{1,16}$/.test(lk.color)) look.color = lk.color; if (look.shape || look.color) pane.look = look; }
    const sp = p.specialist as { id?: unknown } | undefined; if (sp && typeof sp.id === "string" && /^[a-z0-9-]{1,48}$/.test(sp.id)) pane.specialist = { id: sp.id, ...((sp as { leader?: unknown }).leader === true ? { leader: true } : {}), ...(typeof (sp as { shape?: unknown }).shape === "string" && /^[a-z]{1,16}$/.test((sp as { shape: string }).shape) ? { shape: (sp as { shape: string }).shape } : {}), ...(typeof (sp as { color?: unknown }).color === "string" && /^[a-z]{1,16}$/.test((sp as { color: string }).color) ? { color: (sp as { color: string }).color } : {}) };   // a specialist pane stays one after a reload
    if (p.free && typeof p.free === "object") { const fid = (p.free as Record<string, unknown>).id; if (typeof fid === "string" && /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]?$/.test(fid)) pane.free = { id: fid }; }   // a free pane keeps its folder's name (RFC 0016); anything else is dropped
    if (p.webapp && typeof p.webapp === "object") { const w = p.webapp as Record<string, unknown>; if (typeof w.id === "string" && typeof w.url === "string" && /^https?:\/\//i.test(w.url)) pane.webapp = { id: w.id.slice(0, 60), name: typeof w.name === "string" ? w.name.slice(0, 80) : w.id.slice(0, 60), url: w.url.slice(0, 600) }; }
    return leaf(pane);
  }
  if (v.type === "split" && (v.dir === "row" || v.dir === "col") && Array.isArray(v.children)) {
    const kids = v.children.map((c: unknown) => parseNode(c, seen, depth + 1)).filter(Boolean) as Node[];
    if (kids.length === 0) return null;
    if (kids.length === 1) return kids[0];
    const sizes = Array.isArray(v.sizes) && v.sizes.length === kids.length ? normalize(v.sizes) : even(kids.length);
    return { type: "split", dir: v.dir, sizes, children: kids, ...(() => { const t = v.team ?? v.crew; return typeof t === "string" && t ? { team: t.slice(0, 80) } : {}; })()  /* a layout saved before RFC 0008 says `crew` */ };
  }
  return null;
}
/** A layout from stored JSON, or an empty one. Duplicate panes, unknown kinds and absurd depth are dropped. */
export function parseLayout(raw: unknown): Layout {
  let v: any = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return emptyLayout(); } }
  if (!v || typeof v !== "object") return emptyLayout();
  const root = parseNode(v.root, new Set(), 0);
  const ids = leaves(root).map((p) => p.id);
  const focus = typeof v.focus === "string" && ids.includes(v.focus) ? v.focus : ids[0] ?? null;
  const zoom = typeof v.zoom === "string" && ids.includes(v.zoom) ? v.zoom : null;
  return { root, focus, zoom };
}
export const serializeLayout = (l: Layout): string => JSON.stringify(l);

/** Every pane of one specialist wears the same avatar: change it in one and it changes in all (the operator 2026-11-22). Pure. */
export function setSpecialistLook(l: Layout, id: string, shape: string, color: string): Layout {
  let out = l; for (const p of leaves(l.root ?? null)) { if (p.specialist?.id === id) out = updatePane(out, p.id, { specialist: { ...p.specialist, shape, color } }); } return out;
}
