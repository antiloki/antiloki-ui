// EVERYTHING IS A WIDGET (operator 2026-07-25) — ONE DOCK (operator 2026-07-26: "the entire screen
// should be 1 docking area"): the page is a single queue of dockables — sessions, the context box,
// the instruments rail, and every user widget — docked together in order. EVERY item stays OPEN
// side by side; one collapses to a VERTICAL STRIP only when ITS ▾ is clicked (operator: "dont
// collapse docked widgets unless the user collapse it himself"). Panels keep a fixed width; widgets
// share the remaining space. ⠿ drags an item along the queue to REORDER it (live, animated);
// obligatory items collapse but never close; a user widget's ✕ DESTROYS its slot (it stays in the
// instruments history). Widths slide ~.28s, content cross-fades.
import React from "react";
import { ChibiFace, type Shape } from "./chibi-face";
import { setThreadRefables, setGhostHost } from "./thread-refables";
import { useTourUnlock } from "@/loki/shell/mini-tour";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import { StudioIcon, CATEGORY_TINT } from "@/loki/widgets/studio-icons";
import { LogoMenu } from "@/loki/shell/logo-menu";
import { introFor } from "@/loki/widgets/studio-demos";
import { readSubagents, subscribeSubagents, jobGlyph, activeJobs, readGoalRuns, activeRuns, taskGlyph } from "@/loki/widgets/subagents";

export type ZoneId = "left" | "center" | "right";
export type WidgetDockSide = "left" | "right"; // kept for the card grip (cards dock to sides)
const EDGE = 110; // px from a viewport edge that counts as "drop there" (same feel as the chat dock)
const MIN_W = 280, MAX_W = 680, DEF_W = 380;
const STRIP_W = 26;
// ROWS (operator 2026-09-16: "add a second line on antiDesk so we can scroll vertically to panes
// below the first line. Each line can have 10 panes"): the center stage lays its queue out in rows
// of ROW_MAX; every row is one screen tall and the stage scrolls vertically between them.
export const ROW_MAX = 10;
export function dockRows<T>(items: T[], max = ROW_MAX): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += max) rows.push(items.slice(i, i + max));
  return rows;
}

// A STABLE HOST NODE per docked item (operator 2026-09-16: "expand button from standup is not
// showing the standup that is showed on the normal pane"): the fullscreen page used to call
// `render()` again, i.e. a fresh React subtree — every pane's state (standup rounds, run output,
// a terminal) was lost on ⛶. The body now renders ONCE into a DOM node we own, and that node is
// simply re-parented into the column or the fullscreen page. React state survives the move.
function Mount({ node, style }: { node: HTMLElement; style?: React.CSSProperties }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.appendChild(node);
    // the body just changed container (column ⇄ fullscreen ⇄ threads): terminals and canvases
    // size themselves on window resize, so tell them the box changed
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 30);
    return () => { clearTimeout(t); if (node.parentNode === el) el.removeChild(node); };
  }, [node]);
  return <div ref={ref} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", ...style }} />;
}

export const widgetSideAt = (x: number): WidgetDockSide | null =>
  x < EDGE ? "left" : x > window.innerWidth - EDGE ? "right" : null;
// zones incl. the CENTER — the middle third of the screen (used by panel grips; the chat can dock anywhere).
export const zoneAt = (x: number): ZoneId | null => {
  const w = window.innerWidth;
  if (x < EDGE) return "left";
  if (x > w - EDGE) return "right";
  if (x > w * 0.36 && x < w * 0.64) return "center";
  return null;
};

const zoneHintStyle = (z: ZoneId, active: boolean): React.CSSProperties => ({
  position: "fixed", zIndex: 300, pointerEvents: "none", transition: "opacity .15s ease",
  opacity: active ? 1 : 0.25,
  background: active ? `color-mix(in oklab, ${C.brand} 16%, transparent)` : "transparent",
  border: `1px dashed color-mix(in oklab, ${C.brand} ${active ? 70 : 30}%, transparent)`,
  ...(z === "left" ? { left: 6, top: 6, bottom: 6, width: EDGE - 12 }
    : z === "right" ? { right: 6, top: 6, bottom: 6, width: EDGE - 12 }
    : { left: "36vw", right: "36vw", top: 6, bottom: 6 }),
  borderRadius: 12,
});
const footprintStyle = (z: ZoneId, size: number): React.CSSProperties => ({
  position: "fixed", zIndex: 299, pointerEvents: "none", borderRadius: 10,
  background: `color-mix(in oklab, ${C.panel} 45%, transparent)`,
  border: `1px dashed color-mix(in oklab, ${C.brand} 65%, transparent)`,
  backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
  ...(z === "right" ? { right: 0, top: 0, bottom: 0, width: size }
    : z === "left" ? { left: 0, top: 0, bottom: 0, width: size }
    : { left: "30vw", right: "30vw", top: 0, bottom: 0 }),
});
const ghostStyle = (pos: { x: number; y: number }): React.CSSProperties => ({
  position: "fixed", left: pos.x - 110, top: pos.y - 16, width: 220, height: 32, zIndex: 301, pointerEvents: "none",
  borderRadius: 12, background: `color-mix(in oklab, ${C.panel} 55%, transparent)`,
  border: `1px solid color-mix(in oklab, ${C.brand} 50%, ${C.border})`,
  backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
  display: "flex", alignItems: "center", gap: 6, padding: "0 12px", fontFamily: nav, fontSize: 11.5, color: C.dim, opacity: 0.85,
});

// ── the ⠿ grip — drag to a zone, release to dock. Cards allow left|right; panels also center. ────
export function WidgetDragGrip({ label, onDock, allowCenter = false }: {
  label: string; onDock: (zone: ZoneId) => void; allowCenter?: boolean;
}) {
  const [dragging, setDragging] = React.useState(false);
  const [dragZone, setDragZone] = React.useState<ZoneId | null>(null);
  const [dragPos, setDragPos] = React.useState<{ x: number; y: number } | null>(null);
  const at = (x: number): ZoneId | null => { const z = allowCenter ? zoneAt(x) : widgetSideAt(x); return z; };
  const onGrip = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation(); // never trigger the card's click-to-open
    setDragging(true);
    setDragPos({ x: e.clientX, y: e.clientY });
    const move = (ev: PointerEvent) => { setDragPos({ x: ev.clientX, y: ev.clientY }); setDragZone(at(ev.clientX)); };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const z = at(ev.clientX);
      setDragging(false); setDragZone(null); setDragPos(null);
      if (z) onDock(z);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const zones: ZoneId[] = allowCenter ? ["left", "center", "right"] : ["left", "right"];
  return (
    <>
      <span onPointerDown={onGrip} onClick={(e) => e.stopPropagation()} title={`drag to dock ${allowCenter ? "(left · center · right)" : "(left · right)"}`}
        style={{ cursor: "grab", color: C.dim, fontSize: 11, padding: "0 2px", userSelect: "none", touchAction: "none" }}>⠿</span>
      {dragging && zones.map((z) => <div key={z} style={zoneHintStyle(z, dragZone === z)} />)}
      {dragging && dragZone && <div style={footprintStyle(dragZone, DEF_W)} />}
      {dragging && dragPos && <div style={ghostStyle(dragPos)}><span style={{ color: C.brand }}>◆</span>{label}</div>}
    </>
  );
}

// ── the VERTICAL STRIP — a collapsed dockable: slim, full height, its name rotated in the middle ──
export function VStrip({ label, onClick, onClose, title, closeTitle, grip }: { label: string; onClick: () => void; onClose?: () => void; title?: string; closeTitle?: string; grip?: (e: React.PointerEvent) => void }) {
  const [hot, setHot] = React.useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)} title={title ?? `open ${label}`}
      style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center",
        background: hot ? C.panel2 : C.bg, cursor: "pointer", userSelect: "none", transition: "background .18s ease",
      }}>
      {grip && <span onPointerDown={(e) => { e.stopPropagation(); grip(e); }} onClick={(e) => e.stopPropagation()} title="drag along the dock to reorder"
        style={{ color: hot ? C.dim : "transparent", cursor: "grab", fontSize: 11, padding: "4px 0 0", userSelect: "none", touchAction: "none", transition: "color .18s ease" }}>⠿</span>}
      {onClose && <button onClick={(e) => { e.stopPropagation(); onClose(); }} title={closeTitle ?? "undock"} style={{ background: "transparent", border: "none", color: hot ? C.muted : "transparent", cursor: "pointer", fontFamily: mono, fontSize: 10, padding: "4px 0", transition: "color .18s ease" }}>✕</button>}
      <span style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", writingMode: "vertical-rl", transform: "rotate(180deg)", fontFamily: mono, fontSize: 9.5, letterSpacing: 0.8, color: hot ? C.fg : C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxHeight: "72vh", transition: "color .18s ease" }}>
        <span style={{ color: C.brand, marginBottom: 4 }}>◆</span>{label}
      </span>
    </div>
  );
}

// ── one DOCK ZONE — items as animated columns: the open one wide, the rest strips. Width slides,
// content cross-fades (operator: "cool effects, not instant"). ───────────────────────────────────
export type ZoneItem = {
  id: string;
  label: string;
  uid?: string | null;
  category?: string;             // THREADS layout: the group the item is listed under (Agents · antiVibe · antiIDE · …)
  subagentsKey?: string;         // THREADS layout: an agent's temporary subagents are listed under it (see widgets/subagents.ts)
  kind?: string;                 // THREADS layout: the catalog kind this item is an instance of (`vibe-pane:<paneKind>` for panes)
  obligatory?: boolean;          // reorders + collapses, never closes
  bare?: boolean;                // the item manages its own scroll/padding (the chat)
  fixed?: number;                // OPEN width in px (panels); absent → the item flexes
  closeTitle?: string;           // ✕ tooltip — "destroy …" for user widgets, "undock" for panels
  render: () => React.ReactNode; // the OPEN body
};

// RENAME (operator 2026-09-16: "easily I should be able to rename the agents panes"): the label of
// any user widget is editable in place — ✎ or double-click, Enter commits, Esc cancels.
// the agent's temporary subagents, listed under it in the Threads list (re-renders when the store changes)
function useSubagentRows(key: string | undefined) {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => (key ? subscribeSubagents(force) : undefined), [key]);
  return key ? readSubagents(key) : [];
}
function SubagentRows({ item, onOpen }: { item: ZoneItem; onOpen: () => void }) {
  const jobs = useSubagentRows(item.subagentsKey);
  const runs = item.subagentsKey ? readGoalRuns(item.subagentsKey) : [];
  const liveRuns = activeRuns(runs);
  if (!jobs.length && !liveRuns.length) return null;
  const active = activeJobs(jobs).length;
  const shown = active ? jobs.filter((j) => j.status === "queued" || j.status === "running") : liveRuns.length ? [] : jobs.slice(-3);
  const tone = (t: string) => (t === "ok" ? C.ok : t === "warn" ? C.warn : t === "bad" ? C.bad : t === "fg" ? C.fg : C.dim);
  return (
    <div data-testid={`thread-subagents-${item.id}`} style={{ paddingLeft: 26, animation: "lokiZoneFade .24s ease" }}>
      {/* goal runs: the run line, then its tasks by wave */}
      {liveRuns.map((r) => (
        <div key={`run-${r.id}`} data-testid={`thread-goal-${r.id}`}>
          <div onClick={onOpen} title={`goal run #${r.id} — ${r.goal}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 14px 2px 0", cursor: "pointer", fontFamily: mono, fontSize: 9.5, color: C.fg }}>
            <span style={{ color: r.status === "paused" ? C.dim : C.warn, width: 10 }}>⋔</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>goal #{r.id} · {r.goal}</span>
            <span style={{ color: C.dim, flexShrink: 0 }}>{r.status === "awaiting-approval" ? "approve?" : r.status}</span>
          </div>
          {r.tasks.map((t) => { const g = taskGlyph(t); return (
            <div key={t.id} onClick={onOpen} title={`${t.title} — ${g.state}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "1px 14px 1px 12px", cursor: "pointer", fontFamily: mono, fontSize: 9, color: C.muted }}>
              <span style={{ color: tone(g.tone), width: 10 }}>{g.glyph}</span>
              <span style={{ color: C.dim }}>w{t.wave + 1}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
              <span style={{ color: tone(g.tone), flexShrink: 0 }}>{g.state}</span>
            </div>
          ); })}
        </div>
      ))}
      {shown.map((j) => { const g = jobGlyph(j); const tone = g.tone === "ok" ? C.ok : g.tone === "warn" ? C.warn : g.tone === "bad" ? C.bad : C.dim; return (
        <div key={j.id} onClick={onOpen} title={`${j.title} — ${g.state} · click opens the agent`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 14px 2px 0", cursor: "pointer", fontFamily: mono, fontSize: 9.5, color: C.muted }}>
          <span style={{ color: tone, width: 10 }}>{g.glyph}</span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.title}</span>
          <span style={{ color: tone, flexShrink: 0 }}>{g.state}</span>
        </div>
      ); })}
      {!active && jobs.length > 3 && <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, padding: "0 0 2px" }}>+{jobs.length - 3} earlier</div>}
    </div>
  );
}

export function Renamable({ label, canRename, onRename, style }: { label: string; canRename: boolean; onRename?: (label: string) => void; style?: React.CSSProperties }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(label);
  React.useEffect(() => { if (!editing) setDraft(label); }, [label, editing]);
  const commit = () => { const v = draft.trim(); setEditing(false); if (v && v !== label) onRename?.(v); };
  if (editing && canRename) {
    return (
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onClick={(e) => e.stopPropagation()}
        onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(label); setEditing(false); } e.stopPropagation(); }}
        data-testid="rename-input" style={{ ...style, background: C.panel, border: `1px solid ${C.brand}`, borderRadius: 4, padding: "0 4px", outline: "none", minWidth: 0, width: "100%" }} />
    );
  }
  return (
    <span onDoubleClick={(e) => { if (canRename) { e.stopPropagation(); setEditing(true); } }} title={canRename ? `${label} — double-click to rename` : label}
      style={{ ...style, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: canRename ? "text" : undefined }}>
      {label}
      {canRename && <button onClick={(e) => { e.stopPropagation(); setEditing(true); }} title="rename" className="loki-rename" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: "0 0 0 5px", opacity: 0.55 }}>✎</button>}
    </span>
  );
}

// THREADS (operator 2026-09-16: "another type of view called Threads — a simple chat design like
// the codex desktop: the added widgets in categories on the left, click one and it shows on the
// right; minimalist, no distractions, same workspace"). Same queue, same host nodes — a list
// instead of columns. Category order is fixed; unknown categories trail.
// FLIP (operator 2026-09-16: "the panes inside a thread should be easily draggable and reorganizable
// with animations"): before a reorder the cells' rects are remembered; after React lays the new
// order out, each cell is translated back to where it was and eased to its new place.
// (2026-09-18, "some bug on the animation") Two fixes: the cells SLIDE only — never scale — because
// scaling a cell scales the widget inside it (the chat ballooned to 2× mid-flight when its span
// changed); and every rect is measured with the transforms cleared, so a reorder that lands while the
// previous slide is still easing starts from the true layout, not from a half-way frame. The cell under
// the pointer (data-dragging) never animates — it rides the ghost chip.
function useFlip(root: React.RefObject<HTMLElement | null>, selector: string, key: string) {
  const prev = React.useRef<Map<string, DOMRect>>(new Map());
  React.useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const cells = Array.from(el.querySelectorAll<HTMLElement>(selector));
    // the true layout — transforms off while measuring
    for (const c of cells) { c.style.transition = "none"; c.style.transform = ""; }
    const rects = cells.map((c) => c.getBoundingClientRect());
    cells.forEach((c, i) => {
      const id = c.getAttribute("data-flip-id") ?? "";
      const now = rects[i];
      const was = prev.current.get(id);
      const dx = was ? was.left - now.left : 0; const dy = was ? was.top - now.top : 0;
      if (was && !c.hasAttribute("data-dragging") && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
        c.style.transform = `translate(${dx}px, ${dy}px)`;
        void c.offsetWidth; // commit the inverted transform before the transition starts (else it never plays)
        requestAnimationFrame(() => requestAnimationFrame(() => { c.style.transition = "transform .28s ease"; c.style.transform = ""; }));
      }
      prev.current.set(id, now);
    });
    // after the slide, the measured rects must be the resting ones — refresh them once it settles
    const settle = window.setTimeout(() => { for (const c of cells) { const id = c.getAttribute("data-flip-id") ?? ""; if (c.isConnected) prev.current.set(id, c.getBoundingClientRect()); } }, 320);
    return () => window.clearTimeout(settle);
  }, [root, selector, key]);
}

/** Resize weights for a cols×rows split: dragging a seam moves size between its two neighbours. */
/** A cell never narrower than this (operator 2026-09-21: "I don't want a pane to be too small") — the seam stops there. */
export const MIN_CELL_PX = 380;
/** `minWeight`: the floor for either side in weight units (a pixel floor converted by the caller); the 15% floor stays as the least. */
export function resizeWeights(weights: number[], seam: number, delta: number, minWeight = 0): number[] {
  const out = [...weights];
  const a = seam - 1; const b = seam;
  if (a < 0 || b >= out.length) return out;
  const total = out[a] + out[b];
  const min = Math.min(total / 2, Math.max(total * 0.15, minWeight));
  out[a] = Math.min(total - min, Math.max(min, out[a] + delta));
  out[b] = total - out[a];
  return out;
}
/** Move `id` to the slot of `overId` (the rest shift) — the live reorder of split cells. */
export function moveBefore(order: string[], id: string, overId: string): string[] {
  if (id === overId) return order;
  const from = order.indexOf(id); const to = order.indexOf(overId);
  if (from < 0 || to < 0) return order;
  const next = order.filter((x) => x !== id);
  next.splice(to, 0, id);
  return next;
}

// Named for what they hold, not for the products (operator 2026-09-17: "rename the categories for
// what they represent"): chat · workspace · agents · tools · codebase · widgets.
export const THREAD_CATEGORIES = ["chat", "workspace", "agents", "tools", "design", "codebase", "widgets"];

/** THE ROSTER IS GONE (operator 2026-09-26: "No sidebar left just the switcher agent dropdown … We only have one
 *  agent that switch roles based on heimdall").
 *
 *  This went in two steps and the first was half the rule. It began as "hide at one agent, a compact switcher at
 *  two", and shipped as "hide at one" with the full 248px column still standing at two — which is the column the
 *  operator asked about. Then the design moved past it: with Heimdall routing the ROLE, there is one agent, so
 *  there is no roster to fold or unfold. What is left is a switcher for the operator who wants to pick the role
 *  by hand, and that belongs in the agent's own header, not in a column of its own.
 *
 *  Kept as a function rather than deleted because the threads surface still asks it, and because the answer is a
 *  rule worth naming: a list of one is not a list. Pure — tested. */
export function showRoster(agents: number): boolean { return agents > 1; }
/** the two tabs of the catalog: `models` = the agents (base agents · yours · merged winners), `studio` = every other category as a headed section */
export const STUDIO_TABS = ["studio", "models"] as const;
export type StudioTab = (typeof STUDIO_TABS)[number];
export function studioTabOf(category: string): StudioTab { return category === "agents" ? "models" : "studio"; }
/** The screen holds THREAD_MAX_COLS × THREAD_VISIBLE_ROWS readable panes (operator 2026-09-17: "when
 *  choosing more widgets than the screen can have, add new lines"): columns never exceed 3, so a
 *  7th+ pane opens a NEW ROW below — each row keeps a half-screen height and the split scrolls. */
export const THREAD_MAX_COLS = 3;
export const THREAD_VISIBLE_ROWS = 2;
/** The Studio shows this many tools before "more" (the first five: terminal · design · intent · context · standup). */
export const STUDIO_FIRST_TOOLS = 5;
/** How n split threads tile the right side: 1 → 1×1, 2 → 2×1, 3–4 → 2×2, 5–6 → 3×2, 7–9 → 3×3 (one
 *  row below the fold), 10–12 → 3×4 …
 *  No empty quarter (operator 2026-09-16: "3 panes → one has full height"): when the grid has spare
 *  cells, the first ones take a FULL-HEIGHT column each (3 → one tall + two stacked; 5 → one tall +
 *  2×2); on three-row grids the last pane widens over the spare cells instead. */
export function threadGrid(n: number): { cols: number; rows: number; cells: { rowSpan: number; colSpan: number }[] } {
  const k = Math.max(1, n);
  const cols = Math.min(THREAD_MAX_COLS, Math.ceil(Math.sqrt(k)));
  const rows = Math.ceil(k / cols);
  const cells = Array.from({ length: k }, () => ({ rowSpan: 1, colSpan: 1 }));
  const empty = cols * rows - k;
  if (empty > 0) {
    if (rows <= 2) for (let i = 0; i < empty; i++) cells[i].rowSpan = rows;
    else cells[k - 1].colSpan = empty + 1;
  }
  return { cols, rows, cells };
}
export function threadGroups(items: ZoneItem[], catalogCategories: string[] = []): { category: string; items: ZoneItem[] }[] {
  const by = new Map<string, ZoneItem[]>();
  for (const it of items) { const c = it.category ?? "widgets"; by.set(c, [...(by.get(c) ?? []), it]); }
  const builtIn = THREAD_CATEGORIES.filter((c) => by.has(c) || catalogCategories.includes(c)).map((c) => ({ category: c, items: by.get(c) ?? [] }));
  const stray = Array.from(by.keys()).filter((k) => !THREAD_CATEGORIES.includes(k)).map((c) => ({ category: c, items: by.get(c)! }));
  return [...builtIn, ...stray];
}

export type Thread = { id: string; name: string; items: string[]; aliases?: Record<string, string>; collapsed?: Record<string, ThreadStrip> };
/** A collapsed thread pane parks as a strip on an edge of the split: "v" = a vertical strip on the right (collapsed horizontally), "h" = a bar at the bottom (collapsed vertically). */
export type ThreadStrip = "v" | "h";
export type CatalogKind = {
  kind: string; label: string; glyph?: string; description?: string; sample?: React.ReactNode; preview?: React.ReactNode;
  /** an operator-made agent (a recipe): its emoji is the tile's icon */
  emoji?: string;
  /** an agent's face (chibi-face.tsx): the slug the shape and colour are fixed by — every Studio agent has one (2026-09-23) */
  face?: string;
  /** the face's colour — the agent's theme accent (each one has a theme, 2026-09-23); unset = the palette */
  tint?: string;
  /** a chosen face shape (a recipe whose icon is a face) — else the slug's */
  faceShape?: Shape;
  /** a winner's stamp — the job name under the face's corner (Merged Winners, 2026-09-23) */
  stamp?: string;
  /** the colour group this tile is drawn in, when it is not the section it is listed under (the Studio is one list of tools; design and codebase tools keep their own colour) */
  category?: string;
  /** a heading before this tile, across the grid — a sub-category inside the tab (operator 2026-09-23: "merged winners are a category below agents, not on tabs") */
  section?: string;
  /** a tile with nothing to add yet (a job without a winner) — shown dimmed, the description says why */
  pending?: boolean;
  /** a tile that opens something instead of adding a widget (the "＋ add agent" tile) */
  action?: () => void;
  /** open it. In the chat-first surface a Studio pick opens SPLIT — beside the conversation, one at a time
   *  (operator 2026-09-23: "the studio widgets onclick … was suppose to open in split screen, at least 1 per time"). */
  add: (target?: AddTarget, opts?: { split?: boolean }) => void;
  // an ALREADY-OPEN instance this kind stands for (the chat, id "chat"): the Studio adds THAT item to the
  // thread instead of minting one (operator 2026-09-18: "chat is a widget under agents now — added to a
  // thread like any other; everything is threads")
  instance?: string;
};
/** Where a newly opened widget lands: a NEW thread, or the given thread — the chat-thread's dockWidget reads it. */
export type AddTarget = { thread: "new" | string };
/** the kinds that take the whole desk rather than half of it — a canvas is the work, not a reference beside it */
export const WIDE_WIDGETS = new Set<string>(["design-frames", "design-view:system", "design-view:components", "vibe-pane:design"]);
export function DockZone({ zone, items, collapsed, onToggle, onCloseItem, onMoveItem, onReorderItem, layout = "dock", selected, onSelect, onRenameItem, catalog = [], threads = [], activeThread = null, onSelectThread, onNewThread, onRenameThread, onDeleteThread, onSetThreadItems, onSetThreadCollapsed, sideTab = "threads", onSideTab, chatsSide, chatsBody, chatsSplit, chatsAvatars, chatsCount, chatsEpisodes }: {
  zone: ZoneId;
  items: ZoneItem[];
  collapsed: string[];                               // ids the USER collapsed — everything else is open
  onToggle: (id: string, collapsed: boolean) => void;
  onCloseItem: (id: string) => void;
  onMoveItem?: (id: string, to: ZoneId) => void;    // legacy 3-zone move (unused on the one-dock stage)
  onReorderItem?: (dragId: string, overId: string, before: boolean) => void; // ⠿ along the queue
  layout?: "dock" | "threads";                       // threads = list left, one body right
  // CHATS · THREADS (operator 2026-09-21: "place Chats as a tab with threads", chats first): the sidebar's header is
  // two tabs. On `chats` the sidebar is `chatsSide` (the sessions) and the stage is `chatsBody` (the conversation);
  // the threads' widgets stay mounted in their hosts underneath, untouched.
  sideTab?: "chats" | "threads";
  onSideTab?: (t: "chats" | "threads") => void;
  chatsSide?: React.ReactNode;
  chatsBody?: React.ReactNode;
  /** the widget opened beside the chat — one at a time, the right half of the vertical split (2026-09-23) */
  chatsSplit?: React.ReactNode;
  /** THE FOLDED STRIP'S CONTENT: mini avatars, supplied by the caller because the dock has no idea what an
   *  agent looks like (operator 2026-09-25). */
  chatsAvatars?: React.ReactNode;
  /** THE EPISODES COLUMN (operator 2026-09-27: "add back a sidebar left, but instead of agents, just the
   *  episodes"). When given, the agents surface has a left column again and this is what is in it. */
  chatsEpisodes?: React.ReactNode;
  /** how many agents the roster would list — the sidebar hides itself at one (`showRoster`).
   *  UNDEFINED MEANS "the caller did not say", which is not the same as "there are none": an un-updated caller
   *  keeps its sidebar rather than silently losing it. Only a counted 0 or 1 hides the column. */
  chatsCount?: number;
  selected?: string[];                               // threads: the shown items (controlled when given)
  onSelect?: (ids: string[]) => void;
  onRenameItem?: (id: string, label: string) => void; // threads only: the widget's ALIAS inside the active thread (built-in names stay)
  // THE STUDIO (operator 2026-09-18: "a super category called studio with mini icons and the name
  // below; hover → the description; select → the widget in preview on the right with a new-thread
  // button. We don't create categories, we create threads."): every kind, per category.
  catalog?: { category: string; kinds: CatalogKind[] }[];
  // THREADS are named, ordered compositions over the same widget instances (an agent in two threads
  // is the same live agent). The active one is the split on the right.
  threads?: Thread[];
  activeThread?: string | null;
  onSelectThread?: (id: string) => void;
  onNewThread?: (items?: string[]) => void;
  onRenameThread?: (id: string, name: string) => void;
  onDeleteThread?: (id: string) => void;
  onSetThreadItems?: (id: string, items: string[]) => void;
  // (operator 2026-09-18: "a pane on a thread should collapse vertically and horizontally like on Blocks")
  onSetThreadCollapsed?: (id: string, collapsed: Record<string, ThreadStrip>) => void;
}) {
  const [size, setSize] = React.useState(DEF_W);
  const [hot, setHot] = React.useState(false);
  // ⠿ REORDER drag — live: while the pointer crosses a sibling column, the queue re-sorts under it
  // (the .28s width transitions make the shuffle feel physical). The ghost chip follows the pointer.
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [dragItem, setDragItem] = React.useState<string | null>(null);
  const [dragPos, setDragPos] = React.useState<{ x: number; y: number } | null>(null);
  const startReorder = (id: string) => (e: React.PointerEvent) => {
    if (!onReorderItem) return;
    e.preventDefault();
    e.stopPropagation();
    setDragItem(id);
    setDragPos({ x: e.clientX, y: e.clientY });
    const move = (ev: PointerEvent) => {
      setDragPos({ x: ev.clientX, y: ev.clientY });
      const root = rootRef.current;
      if (!root) return;
      const els = Array.from(root.querySelectorAll("[data-dock-id]")) as HTMLElement[];
      for (const el of els) {
        const oid = el.getAttribute("data-dock-id");
        if (!oid || oid === id) continue;
        const r = el.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) { onReorderItem(id, oid, ev.clientX < r.left + r.width / 2); break; }
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragItem(null); setDragPos(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  // ⛶ any docked panel can go FULLSCREEN (operator 2026-07-25) — a full-viewport page, Esc/← returns.
  const [fs, setFs] = React.useState<string | null>(null);
  const [selfSel, setSelfSel] = React.useState<string[]>([]); // threads: the picked items (uncontrolled)
  // STUDIO TYPES AS TABS (operator 2026-09-21: "studio types could be tabs too?"): one category's icons at a time —
  // agents · tools · design · codebase — instead of the stacked sections behind a "more"; remembered per install.
  // STUDIO | MODELS (operator 2026-09-23: "make a tab beside studio called models — the current agents inside studio;
  // the studio stops having tabs below, they all display as categories"): two tabs, each a column of headed sections
  const [studioTab, setStudioTabRaw] = React.useState<StudioTab>(() => { try { return (localStorage.getItem("antiloki:studio-tab") as StudioTab) || "models"; } catch { return "models"; } });
  const setStudioTab = (v: StudioTab) => { setStudioTabRaw(v); try { localStorage.setItem("antiloki:studio-tab", v); } catch { /* fine */ } };
  // A SWITCHER, NOT A COLUMN (operator 2026-09-26: "why the sidebar left still exists with different agents?").
  //
  // The rule was: one agent, nothing; two or more, a COMPACT SWITCHER. Only the first half shipped — at two agents
  // the full 248px roster was still standing, which is the column the operator was asking about. The folded
  // sidebar is already an avatar rail: who is here, clickable, in a 26px strip. That IS the switcher, so it is the
  // default now and the full roster is one click away for whoever wants it.
  //
  // A STORED PREFERENCE STILL WINS. Someone who opened the roster once keeps it open; only a first run folds.
  const [storedFold, setSideFoldedRaw] = React.useState<boolean | null>(() => {
    try { const v = localStorage.getItem("antiloki:threads-sidebar"); return v == null ? null : v === "folded"; }
    catch { return null; }
  });
  // UNSET MEANS "IT DEPENDS WHICH SIDEBAR". On the agents surface the default is the avatar rail — that is the
  // switcher, and the full roster is one click away. The THREADS sidebar is untouched: the operator asked about the
  // agents column, and folding a surface nobody complained about would be the same over-reach in the other
  // direction. A stored preference wins over both.
  // …and the EPISODES column starts open: it was just asked for, and defaulting it to the avatar rail would hide
  // the thing the operator added. The stored preference still wins, as it does everywhere else.
  // THE EPISODES COLUMN DOES NOT COLLAPSE (operator 2026-09-27: "dont collapse the sidebar left, and the logo also
  // dont collapse"). It is the surface's only navigation — the episodes ARE the units of work — and the logo menu
  // lives in its header, so folding it takes the way back as well as the way around. A stored `folded` from before
  // this column existed must not resurrect the rail either, so the override is unconditional rather than a default.
  // …EXCEPT WHILE A PREVIEW IS UP (operator 2026-09-28: "on active preview you should collapse both sidebars, not
  // just studio, but also episodes"). The rule above — never fold the episodes — was written for the ordinary
  // screen, where that column is the only way around. A preview is the opposite case: it is the thing the operator
  // opened, it wants the width, and closing it brings the column straight back, so nothing is lost for longer than
  // the widget is up. A stored preference still decides when there is no split.
  // …AND A CLICK ON THE FOLDED RAIL GETS THE COLUMN BACK (operator 2026-09-28: "onclick on the episode sidebar left that is
  // collapsed because of preview, it deactivates the preview and opens the sidebar"). The fold is derived from the split,
  // so the old click flipped a stored flag nothing read. A preview is turned off (which closes its split and unfolds the
  // column); any other widget just lets the column PEEK open beside it until the split changes.
  const [peek, setPeek] = React.useState(false);
  const sideFolded = chatsEpisodes ? (!!chatsSplit && !peek) : (storedFold ?? (sideTab === "chats"));
  const splitIsPreview = (() => { const w: any = (chatsSplit as any)?.widget; return w?.kind === "vibe-pane" && w?.payload?.paneKind === "run"; })();
  const unfoldSide = () => {
    if (!chatsEpisodes) { setSideFolded(false); return; }
    // the column opens either way: if the visible pane's preview flag was out of step (nothing to switch off), the click must
    // still do what it says — the peek lasts only until the split changes, which turning the preview off does at once
    if (splitIsPreview) window.dispatchEvent(new CustomEvent("antiloki:ui", { detail: { verb: "preview-yield", close: true } }));
    setPeek(true);
  };
  // Typed `boolean` on purpose: a bare `sideTab === "chats"` in the JSX narrows the discriminant for everything
  // below it, and TypeScript then calls the surviving `sideTab === "chats"` branches impossible. They are not
  // dead — they render the agents STAGE, which stays.
  //
  // THE COLUMN IS BACK, WITH EPISODES IN IT (operator 2026-09-27: "add back a sidebar left, but instead of agents,
  // just the episodes"). It went away because a single role-switching agent has no roster worth a column; its
  // episodes are the units of work and do deserve one. Still conditional on `chatsEpisodes` being passed, so a
  // caller that wants the bare stage — and every test that asserts there is no column — is unaffected.
  const hideSidebar: boolean = sideTab === "chats" && !chatsEpisodes;
  // THE STUDIO RAIL FOLDS FOR A WIDGET (operator 2026-09-23: "when openning a widget the sidebar right collapses
  // like threads did before, same animation and design"). A widget beside the chat is what the operator came to
  // look at, so the shop gets out of its way — the same slim strip, the same rotated label, the same ▸ back. It is
  // only a default: folding it by hand afterwards, or unfolding it, sticks until the split changes again.
  const [studioFolded, setStudioFolded] = React.useState(false);
  // SOME WIDGETS WANT THE DESK (operator 2026-09-23: "frames widget needs more space, so when click on frames
  // don't just collapse the studio but the chat too"). A canvas is not something you read next to a conversation —
  // it is the work. Picking one folds the conversation to the same slim strip the sidebars use; it comes back on
  // click, or when the widget closes. Everything else still opens beside the chat.
  const [chatFolded, setChatFolded] = React.useState(false);
  const hadSplit = React.useRef(false);
  React.useEffect(() => {
    const on = !!chatsSplit;
    if (on === hadSplit.current) return;
    hadSplit.current = on;
    setPeek(false);   // a new split re-folds the column; a peek lasts as long as the widget it peeked beside
    // a widget can open without a tile click — ▶ preview raises its run cell from the agent's own footer (operator
    // 2026-09-23: "it opened preview but didn't collapse the sidebar right as supposed, because it is a widget") —
    // so the fold follows the SPLIT, not the click. The click handler folds again on a later pick.
    setStudioFolded(on);
      // AND THE LEFT USED TO FOLD TOO (operator 2026-09-25: "when preview or some widget are openned, not just the
      // sidebar right collapse, also the left should it. But differently the avatars, just the avatars stays") —
      // withdrawn 2026-09-27 for the EPISODES column: "dont collapse the sidebar left". That instruction was about a
      // ROSTER of agents, which a widget could reasonably push aside because the avatars carried it in 26 pixels.
      // Episodes have no such 26-pixel form, and the logo menu rides in the same header, so folding costs the
      // navigation and the way back at once. The right-hand studio still folds for the widget; the left stays.
      // the episodes column follows the split without being REMEMBERED as folded — `sideFolded` reads the split
      // directly for it, so the operator's stored preference survives the preview opening and closing
      if (!chatsEpisodes) setSideFolded(on);
    if (!on) setChatFolded(false);   // the widget closed — the desk comes back
  }, [chatsSplit]);
  const setSideFolded = (v: boolean) => { setSideFoldedRaw(v); try { localStorage.setItem("antiloki:threads-sidebar", v ? "folded" : "open"); } catch { /* private mode */ } };
  // THE STUDIO STARTS CLOSED (operator 2026-09-26, on the screen being heavy: "the studio can be collapsed by
  // default"). It is a shelf of things to open, not something you read — so it costs a click when you want it and
  // nothing when you don't, instead of a column of widgets competing with the answer for the whole session.
  //
  // CLOSED BY DEFAULT, NOT HOVER-TO-OPEN. A panel that expands on pass-through fights the mouse, fires on the way
  // to something else, and does not exist on a trackpad-heavy or touch machine. The fold button already remembers,
  // so opening it once is the last time anyone has to think about it.
  const [collapsedCats, setCollapsedCats] = React.useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("antiloki:threads-collapsed");
      // THE STUDIO IS FOLDED EVERY TIME, NOT ONCE (operator 2026-09-28: "studio should always be collapsed unless
      // the user clicks on expand"). It used to be folded only until the first time anyone opened it, and the
      // stored set then kept it open for good — so a single click three sessions ago left a column of widgets
      // competing with the answer on every load since. Expanding it is now an act for the session you are in.
      // Every OTHER category still obeys what was stored, because those are real preferences about real panes.
      const stored: string[] = raw == null ? [] : JSON.parse(raw);
      return new Set([...(Array.isArray(stored) ? stored : []), "studio"]);
    } catch { return new Set(["studio"]); }
  });
  const [dragCell, setDragCell] = React.useState<string | null>(null); // threads: the split cell being reordered
  // STUDIO PREVIEW: a catalog kind (or an open instance) picked in the sidebar renders on the right
  // instead of the split, with "+ new thread" / "add to <thread>" — nothing is created until then.
  const [preview, setPreview] = React.useState<{ kind: CatalogKind; category: string } | null>(null);
  useTourUnlock("studio", !!preview); // the progressive tour: the first widget the user previews
  const [cellPos, setCellPos] = React.useState<{ x: number; y: number } | null>(null);
  const [sizes, setSizes] = React.useState<{ key: string; cols: number[]; rows: number[] } | null>(null); // split seams, per grid shape
  const splitRef = React.useRef<HTMLDivElement | null>(null);
  const shownListRef = React.useRef<ZoneItem[]>([]);
  // THREADS layout — the list on the left, the picked bodies on the right, every body kept mounted.
  // SPLIT (operator 2026-09-16: "the threads mode can show the thread dividing the screen — 4 widgets
  // → 4 panes in 2 lines"): click = that thread alone; ⊞ (or ctrl/⌘-click) adds it to the split, the
  // right side becomes a grid — 2 side by side, 3–4 in 2×2, 5–6 in 3×2, 7–9 in 3×3 … (threadGrid).
  const pick = selected !== undefined ? selected : selfSel;
  const alive = pick.filter((id) => items.some((x) => x.id === id));
  const shownList: ZoneItem[] = alive.length ? alive.map((id) => items.find((x) => x.id === id)!) : [items.find((x) => x.id === "chat") ?? items[0]].filter(Boolean) as ZoneItem[];
  const setPick = (ids: string[]) => { if (onSelect) onSelect(ids); else setSelfSel(ids); };
  const choose = (id: string, add: boolean) => {
    const cur = shownList.map((x) => x.id);
    if (!add) { setPick([id]); return; }
    setPick(cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id]);
  };
  // FOCUS (operator 2026-09-18: "inside a thread select a single widget to view, or multiple, just by
  // clicking"): a per-thread, session-only subset of the members. Click a row → that one alone; click
  // more rows → they join; click a focused row → it leaves (the last one leaving shows everything
  // again); click the active thread's own row → everything. Nothing here changes the thread's members.
  const [focusBy, setFocusBy] = React.useState<Record<string, string[]>>({});
  const focus = (activeThread && focusBy[activeThread]) || [];
  const setFocus = (ids: string[]) => { if (activeThread) setFocusBy((m) => ({ ...m, [activeThread]: ids })); };
  const toggleFocus = (id: string) => {
    if (!focus.length) { setFocus([id]); return; }
    setFocus(focus.includes(id) ? focus.filter((x) => x !== id) : [...focus, id]);
  };
  // the floating agents bar asks for one widget in view (2026-09-20): that one alone, scrolled to
  React.useEffect(() => {
    const h = (e: any) => { const item = e?.detail?.item; if (typeof item !== "string" || !activeThread) return; setFocus([item]); setTimeout(() => document.querySelector(`[data-thread-id="${item}"]`)?.scrollIntoView({ block: "nearest" }), 30); };
    window.addEventListener("antiloki:focus-widget", h);
    return () => window.removeEventListener("antiloki:focus-widget", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThread]);
  const viewList = focus.length ? shownList.filter((x) => focus.includes(x.id)) : shownList;
  // collapsed panes leave the grid for the edge rails; the grid is the OPEN ones
  // the active thread's cells as `#` refables for the agents' composers (thread-refables.ts) — top level, every layout
  React.useEffect(() => {
    // every docked widget, the active thread's first (on screen), then the other threads' (off screen, named by thread)
    const th = layout === "threads" ? threads.find((x) => x.id === activeThread) : undefined;
    const seen = new Set<string>();
    const out: { refId: string; label: string; kind: string; type: string; thread?: string; onScreen?: boolean; agentKey?: string }[] = [];
    const push = (id: string, t: typeof th, onScreen: boolean) => {
      if (seen.has(id)) return; const it = items.find((x) => x.id === id); if (!it || it.id === "chat") return; seen.add(id);
      out.push({ refId: it.id, label: t?.aliases?.[it.id] ?? it.label, kind: it.kind ?? "chat", type: "widget", thread: t?.name, onScreen, agentKey: it.subagentsKey });
    };
    for (const id of th?.items ?? []) push(id, th, true);
    if (layout === "threads") for (const t of threads) { if (t.id === th?.id) continue; for (const id of t.items) push(id, t, false); }
    else for (const it of items) push(it.id, undefined, true);
    for (const it of items) push(it.id, undefined, false); // docked in no thread (Blocks only)
    setThreadRefables(out);
  }, [layout, threads, activeThread, items]);
  // THE GHOST HOST: an off-screen widget asked for by `#` is mounted hidden for one read (thread-refables.ts)
  const [ghosts, setGhosts] = React.useState<string[]>([]);
  React.useEffect(() => { setGhostHost((op, id) => setGhosts((g) => (op === "add" ? (g.includes(id) ? g : [...g, id]) : g.filter((x) => x !== id)))); return () => setGhostHost(null); }, []);
  const ghostHost = ghosts.length ? (
    <div aria-hidden data-testid="ghost-host" style={{ position: "fixed", left: -20000, top: 0, width: 960, height: 720, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
      {ghosts.map((id) => { const it = items.find((x) => x.id === id); return it ? <div key={id} data-ghost-cell={id} style={{ width: 960, height: 720, overflow: "auto" }}>{it.render()}</div> : null; })}
    </div>
  ) : null;
  const stripOf = threads.find((x) => x.id === activeThread)?.collapsed ?? {};
  const openList = (viewList.length ? viewList : shownList).filter((x) => !stripOf[x.id]);
  const vStrips = viewList.filter((x) => stripOf[x.id] === "v");
  const hStrips = viewList.filter((x) => stripOf[x.id] === "h");
  const setStrip = (id: string, mode: ThreadStrip | null) => {
    const th = threads.find((x) => x.id === activeThread); if (!th || !onSetThreadCollapsed) return;
    const next = { ...(th.collapsed ?? {}) }; if (mode) next[id] = mode; else delete next[id];
    onSetThreadCollapsed(th.id, next);
  };
  const canStrip = !!onSetThreadCollapsed && !!threads.find((x) => x.id === activeThread);
  const grid = threadGrid(openList.length);
  const shapeKey = `${grid.cols}x${grid.rows}`;
  const colW = sizes?.key === shapeKey ? sizes.cols : Array.from({ length: grid.cols }, () => 1);
  const rowW = sizes?.key === shapeKey ? sizes.rows : Array.from({ length: grid.rows }, () => 1);
  const orderKey = openList.map((x) => x.id).join("|");
  useFlip(splitRef, "[data-thread-cell]", orderKey); // order changes animate; seam drags are live, no FLIP
  React.useEffect(() => {
    if (fs == null) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setFs(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [fs]);
  const fsItem = fs != null ? items.find((x) => x.id === fs) ?? null : null;
  const isSide = zone !== "center";
  const hosts = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const hostFor = (it: ZoneItem) => {
    let n = hosts.current.get(it.id);
    if (!n) {
      n = document.createElement("div");
      n.style.cssText = "flex:1;min-height:0;display:flex;flex-direction:column;";
      hosts.current.set(it.id, n);
    }
    return n;
  };
  // drop the hosts of items that left the queue (their portal unmounts with them)
  React.useEffect(() => {
    const ids = new Set(items.map((x) => x.id));
    for (const k of Array.from(hosts.current.keys())) if (!ids.has(k)) hosts.current.delete(k);
  }, [items]);
  const bodyStyle = (it: ZoneItem, page: boolean): React.CSSProperties =>
    it.bare ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } : { flex: 1, minHeight: 0, overflow: "auto", padding: page ? "12px 20px" : "8px 10px" };
  const onDivider = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX, startSize = size;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      setSize(Math.max(MIN_W, Math.min(MAX_W, zone === "right" ? startSize - dx : startSize + dx)));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  // NOT ON THE AGENTS SURFACE (2026-09-24). This bail is about the DOCK having no tiles to draw. The agents surface
  // draws from none of them — its content is the roster, the conversation and the Studio rail — and `items` there is
  // empty until the operator has docked something. So a brand-new install, with nothing docked yet, fell through
  // this line and rendered an EMPTY DESK: switcher at the top, nothing under it. It only looked fine in a profile
  // that had accumulated widgets. Found by shooting the landing prints in a fresh browser.
  if (!items.length && !(layout === "threads" && sideTab === "chats")) return zone === "center" ? <div style={{ flex: 1, minWidth: 0 }} /> : null;

  const col = (it: ZoneItem) => {
    const isOpen = !collapsed.includes(it.id);
    // animated column: width slides between the strip and the panel; content cross-fades.
    // Open: a panel keeps its FIXED width; a widget flexes over the remaining space (many can be
    // open at once — collapse is always the user's click, never a side effect of opening another).
    return (
      <div key={it.id} data-dock-id={it.id} style={{
        ...(isOpen ? (it.fixed ? { width: it.fixed, flexShrink: 0 } : { flex: 1, minWidth: MIN_W }) : { width: STRIP_W, flexShrink: 0 }),
        display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden",
        transition: "width .28s ease, flex-grow .28s ease", background: C.bg,
        borderLeft: `1px solid ${C.border}`,
      }}>
        {isOpen ? (
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%", animation: "lokiZoneFade .24s ease" }}>
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderBottom: `1px solid ${C.border}` }}>
              {onReorderItem
                ? <span onPointerDown={startReorder(it.id)} title="drag along the dock to reorder"
                    style={{ cursor: "grab", color: C.dim, fontSize: 11, padding: "0 2px", userSelect: "none", touchAction: "none" }}>⠿</span>
                : <WidgetDragGrip label={it.label} allowCenter onDock={(z) => onMoveItem?.(it.id, z)} />}
              <span style={{ color: C.brand, fontFamily: mono, fontSize: 11 }}>◆</span>
              <Renamable label={it.label} canRename={!!onRenameItem && !it.obligatory && it.id !== "context"} onRename={(v) => onRenameItem?.(it.id, v)} style={{ color: C.fg, fontFamily: mono, fontSize: 11.5, fontWeight: 700, minWidth: 0 }} />
              {it.uid && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, flexShrink: 0 }}>#{it.uid}</span>}
              <button onClick={() => setFs(it.id)} title="fullscreen — the panel takes the whole page (Esc returns)" style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 11, padding: 0 }}>⛶</button>
              <button onClick={() => onToggle(it.id, true)} title="collapse to a strip" style={{ marginLeft: 6, background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 11, padding: 0 }}>▾</button>
              {!it.obligatory && <button onClick={() => onCloseItem(it.id)} title={it.closeTitle ?? "undock"} style={{ marginLeft: 6, background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: 0 }}>✕</button>}
            </div>
            {/* lwx-flat: a docked widget is PART OF THE SCREEN — its own box border + name header are stripped.
                The body lives in the item's stable host node (see Mount) — fullscreen re-parents it, never re-renders it. */}
            {fs !== it.id && <Mount node={hostFor(it)} />}
          </div>
        ) : (
          <VStrip label={it.label} onClick={() => onToggle(it.id, false)} title={`open ${it.label}`}
            onClose={it.obligatory ? undefined : () => onCloseItem(it.id)} closeTitle={it.closeTitle}
            grip={onReorderItem ? startReorder(it.id) : undefined} />
        )}
      </div>
    );
  };

  const divider = isSide ? (
    <div onPointerDown={onDivider} title="drag to resize"
      style={{ width: 5, cursor: "col-resize", alignSelf: "stretch", flexShrink: 0, background: "transparent", touchAction: "none" }} />
  ) : null;

  // ⠿ on a cell header: pointer-captured drag; crossing another cell moves the dragged one into its slot (live, FLIP-animated)
  // (2026-09-18 "the drop gets crazy") Two guards against the ping-pong: the hit test reads each cell's
  // RESTING rect (its in-flight FLIP translate subtracted — getBoundingClientRect includes it, so the
  // cell that just slid away still "covered" the pointer and swapped straight back), and a swap with a
  // cell is not repeated until the pointer has left it (or come back over the dragged cell itself).
  const restingRect = (c: HTMLElement) => {
    const r = c.getBoundingClientRect();
    // the FLIP only ever writes translate(x, y) → matrix(1, 0, 0, 1, x, y); anything else counts as none
    const m = /^matrix\(([^)]+)\)$/.exec(getComputedStyle(c).transform || "");
    const [tx, ty] = m ? m[1].split(",").map(Number).slice(4) : [0, 0];
    return { left: r.left - (tx || 0), right: r.right - (tx || 0), top: r.top - (ty || 0), bottom: r.bottom - (ty || 0) };
  };
  const startCellDrag = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragCell(id); setCellPos({ x: e.clientX, y: e.clientY });
    let lastSwap: string | null = null;
    const move = (ev: PointerEvent) => {
      setCellPos({ x: ev.clientX, y: ev.clientY });
      const root = splitRef.current; if (!root) return;
      let over: string | null = null;
      for (const c of Array.from(root.querySelectorAll<HTMLElement>("[data-thread-cell]"))) {
        const oid = c.getAttribute("data-thread-cell"); if (!oid) continue;
        const r = restingRect(c);
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) { over = oid; break; }
      }
      if (over === null || over === id) { lastSwap = null; return; } // off the grid, or back home — re-arm
      if (over === lastSwap) return;
      const cur = shownListRef.current.map((x) => x.id);
      const next = moveBefore(cur, id, over);
      lastSwap = over;
      if (next.join("|") !== cur.join("|")) { const th = threads.find((x) => x.id === activeThread); if (th && onSetThreadItems) onSetThreadItems(th.id, next); else setPick(next); }
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setDragCell(null); setCellPos(null); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  shownListRef.current = shownList;
  // seams: drag between two columns / rows to resize them (weights in fr)
  const startSeam = (axis: "col" | "row", seam: number) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const root = splitRef.current; if (!root) return;
    const rect = root.getBoundingClientRect();
    const start = axis === "col" ? e.clientX : e.clientY;
    const base = axis === "col" ? colW : rowW;
    const totalPx = axis === "col" ? rect.width : rect.height;
    const totalW = base.reduce((s, x) => s + x, 0);
    const move = (ev: PointerEvent) => {
      const px = (axis === "col" ? ev.clientX : ev.clientY) - start;
      const next = resizeWeights(base, seam, (px / totalPx) * totalW, (MIN_CELL_PX / Math.max(1, totalPx)) * totalW); // the pixel floor in weight units
      setSizes({ key: shapeKey, cols: axis === "col" ? next : colW, rows: axis === "row" ? next : rowW });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const seamPositions = (w: number[]) => { const total = w.reduce((s, x) => s + x, 0); let acc = 0; return w.slice(0, -1).map((x) => { acc += x; return (acc / total) * 100; }); };
  // THE BODIES — rendered once each into their host node, whichever surface currently shows it.
  // Always the FIRST child of the root in both layouts, so a dock ⇄ threads switch reconciles the
  // same portals in place (state survives the switch too, not just fullscreen).
  const portals = items.map((it) => createPortal(
    <div key={it.id} className={it.bare ? undefined : "lwx-flat"} style={bodyStyle(it, fs === it.id)}>{it.render()}</div>,
    hostFor(it),
    it.id,
  ));
  if (layout === "threads") {
    const toggleCollapse = (cat: string) => setCollapsedCats((s) => { const n = new Set(s); if (n.has(cat)) n.delete(cat); else n.add(cat); try { localStorage.setItem("antiloki:threads-collapsed", JSON.stringify(Array.from(n))); } catch { /* fine */ } return n; });
    const active = threads.find((th) => th.id === activeThread) ?? null;
    const inActive = (id: string) => !!active && active.items.includes(id);
    const aliasOf = (it: ZoneItem) => active?.aliases?.[it.id] ?? it.label;

    const removeFromThread = (id: string) => { if (active && onSetThreadItems) onSetThreadItems(active.id, active.items.filter((x) => x !== id)); };
    const addToActive = (id: string) => { if (active && onSetThreadItems && !active.items.includes(id)) onSetThreadItems(active.id, [...active.items, id]); else if (!active && onNewThread) onNewThread([id]); };
    const catStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "2px 14px 4px 8px", fontFamily: mono, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 1.2 };
    const foldBtn = (key: string) => <button data-testid={`thread-fold-${key}`} onClick={() => toggleCollapse(key)} title={collapsedCats.has(key) ? "expand" : "collapse"} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 8, width: 12, padding: 0, transform: collapsedCats.has(key) ? "rotate(-90deg)" : "none", transition: "transform .2s ease" }}>▾</button>;
    const fold = (key: string, body: React.ReactNode) => { const shut = key !== "studio" && collapsedCats.has(key); return (
      <div style={{ display: "grid", gridTemplateRows: shut ? "0fr" : "1fr", transition: "grid-template-rows .26s ease" }}>
        <div style={{ overflow: "hidden", minHeight: 0, opacity: shut ? 0 : 1, transition: "opacity .2s ease" }}>{body}</div>
      </div>
    ); };
  const studioPanel = (
          <div data-thread-cat="studio" data-tour="desk-studio" style={{ marginBottom: 10 }}>
            {(() => { return (<>
            {/* THE RAIL IS TOOLS, AND ONLY TOOLS (operator 2026-09-23: "take out completely on the sidebar right the
                models tab"). The agents, the roles and the merged winners were a second tab here, which put "what
                you open" and "who you hire" in one list. Hiring happens at the ＋ on the agents sidebar now. */}
            {/* NO INTERNAL FOLD (operator 2026-09-28: "remove the internal collapse from studio … when the studio is expanded the studio items should be too") — the rail itself still folds; what is inside it never hides on its own */}
            <div style={catStyle}><span style={{ fontFamily: mono, fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", color: C.ok }}>studio</span></div>
            {fold("studio", (
              <div>
                {/* every category the caller gives, with no tab to hide half of them behind. The agents category is
                    simply not passed any more — hiring moved to the ＋ on the agents sidebar. */}
                {catalog.map((c) => { const shown = c.kinds; if (!shown.length) return null; return (
                  <div key={c.category} data-studio-cat={c.category} data-tour={`desk-studio-${c.category}`} style={{ padding: "4px 10px 6px" }}>
                    {/* NO NAME FOR A LONE LIST (operator 2026-10-11: "drop the name tools, it is all studio now"): a section is titled only when there is more than one to tell apart */}
                    {catalog.filter((x) => x.kinds.length).length > 1 && <div data-testid={`studio-section-${c.category}`} style={{ padding: "2px 4px 4px", fontFamily: mono, fontSize: 8.5, letterSpacing: 1.2, textTransform: "uppercase", color: CATEGORY_TINT[c.category] ?? C.dim }}>{c.category}</div>}
                    {/* `1fr` is `minmax(auto, 1fr)`: a long label ("Frontend designer") widens its own track and
                        pushes the third column past the rail's edge. minmax(0, 1fr) plus minWidth:0 on the tile is
                        what makes the ellipsis actually happen. */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4 }}>
                    {shown.map((k) => { const sel = !!preview && "kind" in preview && preview.kind.kind === k.kind; return (<React.Fragment key={k.kind}>
                      {k.section && <div data-testid={`studio-section-${k.section.replace(/\s+/g, "-")}`} style={{ gridColumn: "1 / -1", marginTop: 6, padding: "4px 4px 0", borderTop: `1px solid ${C.border}`, fontFamily: mono, fontSize: 8.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.dim }}>{k.section}</div>}
                      <button data-testid={`studio-kind-${k.kind}`} data-thread-catalog={k.kind} onClick={() => { if (k.action) { k.action(); return; } if (sideTab === "chats") window.dispatchEvent(new CustomEvent("antiloki:ui", { detail: { verb: "preview-yield" } })); /* a Studio pick takes the split: the agent's preview goes off, button and all */ if (sideTab !== "chats") { setPreview({ kind: k, category: k.category ?? c.category }); return; }
                          // every pick folds the rail, not only the first (operator 2026-09-23: "even if i expanded,
                          // when i choose a widget collapse again") — the widget is what you asked to look at
                          k.add(undefined, { split: true }); setStudioFolded(true); setChatFolded(WIDE_WIDGETS.has(k.kind)); }}
                        title={sideTab === "chats" ? `${k.description ?? k.label} — opens beside the conversation` : (k.description ?? k.label)}
                        style={{ background: sel ? C.panel2 : "transparent", border: `1px solid ${sel ? C.brand : "transparent"}`, borderRadius: 7, padding: "8px 2px 5px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, transition: "background .15s ease", opacity: sel ? 1 : 0.85, minWidth: 0, overflow: "hidden" }}
                        onMouseEnter={(e) => { if (!sel) (e.currentTarget as HTMLElement).style.background = C.panel; }} onMouseLeave={(e) => { if (!sel) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                        {k.face ? <span style={{ display: "inline-flex", opacity: k.pending ? .5 : 1 }}><ChibiFace slug={k.face} mood={sel ? "live" : "idle"} size={22} color={k.tint} shape={k.faceShape} /></span> : k.emoji ? <span style={{ fontSize: 18, lineHeight: "18px", height: 18 }}>{k.emoji}</span> : <StudioIcon kind={k.kind} category={k.category ?? c.category} active={sel} />}
                        <span style={{ fontFamily: mono, fontSize: 8.5, color: sel ? C.fg : C.muted, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.label}</span>
                      </button>
                    </React.Fragment>
                    ); })}
                    </div>
                  </div>
                ); })}
              </div>
            ))}
            </>); })()}
          </div>
  );
    return (
      <div ref={rootRef} data-testid="threads-view" style={{ display: "flex", flex: 1, minWidth: 0, minHeight: 0, alignSelf: "stretch", background: C.bg }}>
        {portals}
        {/* THE SIDEBAR COLLAPSE (operator 2026-09-18: "a collapse button so we can have the full-screen feeling at
            will"): ◂ folds the whole sidebar to a slim rail — the active thread's name rotated, ▸ to unfold. */}
        {/* NO COLUMN ON THE AGENTS SURFACE AT ALL — not a roster, not a rail. One agent that switches roles has
            nothing to list; the role switcher lives in the agent's own header. The threads surface is untouched. */}
        {hideSidebar ? null : sideFolded ? (
          <div data-testid="threads-sidebar-folded" style={{ width: 26, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", minHeight: 0, background: C.bg }}>
            <button data-testid="threads-sidebar-unfold" onClick={unfoldSide} title="show the sidebar" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: "8px 0 4px" }}>▸</button>
              {/* FOLDED = THE WORD, LIKE THE STUDIO'S (operator 2026-09-28: "the collapsed sidebar episodes has an avatar. Remove the avatar and add the word EPISODES, just like studio does"). The avatars stay only where there is no episodes list to name. */}
              {sideTab === "chats" && chatsAvatars && !chatsEpisodes ? (
                /* THE AVATARS ARE THE FOLDED SIDEBAR (operator 2026-09-25): who is here, still clickable, in
                   26 pixels. The vertical word it replaces named the surface they had just folded, which is
                   the one thing the operator already knew. */
                <div data-testid="threads-sidebar-avatars" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingTop: 2, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
                  {chatsAvatars}
                </div>
              ) : (
            <span data-testid="threads-sidebar-word" onClick={unfoldSide} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", writingMode: "vertical-rl", ...(sideTab === "chats" && chatsEpisodes ? {} : { transform: "rotate(180deg)" }), fontFamily: mono, fontSize: 9.5, letterSpacing: 0.8, color: C.dim, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
              {/* the folded rail names the SURFACE, not the composition (operator 2026-09-24: "when i collapse the
                  sidebar left is called thread 2, rename for Agents"). On the agents surface the thread behind it
                  is an implementation detail — "thread 2" told the operator nothing about what they folded away. */}
              {sideTab === "chats" && chatsEpisodes ? "EPISODES" : <><span style={{ color: C.brand, marginBottom: 4 }}>●</span>{sideTab === "chats" ? "agents" : active?.name ?? "threads"}</>}
            </span>
              )}
          </div>
        ) : (
        <div data-testid="threads-sidebar" data-tour="desk-sidebar" style={{ width: 248, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "10px 0" }}>
          {/* THREADS — named compositions; the active one is the split. Its members list under it with ⊟ and an alias (double-click). */}
          <div data-thread-cat="threads" style={{ marginBottom: 10, ...(sideTab === "chats" ? { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 } : {}) }}>
            <div style={catStyle}><LogoMenu wide={sideTab === "chats"} />{sideTab === "threads" ? foldBtn("threads") : null}
              {/* AGENTS, AND ONLY AGENTS (operator 2026-09-23: "not using threads anymore"). There is no container to
                  create and file work into — an agent IS the workspace, and its episodes are the units of work. The
                  word is not written beside the logo: the roster below is already headed "agents" (operator: "take
                  out the word agents on the side of antiloki logo, it already have agents name below"). */}
              {sideTab !== "chats" && <span data-testid="side-tab-chats" style={{ fontFamily: mono, fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", color: C.fg, padding: "0 4px" }}>agents</span>}

              <span style={{ flex: 1 }} />
              {!chatsEpisodes && <button data-testid="threads-sidebar-fold" onClick={() => setSideFolded(true)} title="hide the sidebar — the thread takes the whole screen" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, width: 16, height: 16, lineHeight: "13px", padding: 0, cursor: "pointer", fontFamily: mono, fontSize: 10, marginRight: 4 }}>◂</button>}
              {sideTab === "threads" && onNewThread && <button data-testid="thread-new" onClick={() => onNewThread()} title="a new, empty thread" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, width: 16, height: 16, lineHeight: "13px", padding: 0, cursor: "pointer", fontFamily: mono, fontSize: 11 }}>+</button>}
            </div>
            {/* THE TITLE SITS UNDER THE LOGO, AGAINST THE RIGHT EDGE (operator 2026-09-27: "EPISODES tile should be
                below the logo not on the side", then "below but on the right part of the sidebar"). Beside the logo
                the two competed for one 248px line; under it and left-aligned it read as a second wordmark. Right is
                where a column heading belongs when the brand is holding the left. */}
            {sideTab === "chats" && chatsEpisodes && (
              <div data-testid="side-tab-episodes" style={{ fontFamily: mono, fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", color: C.fg, padding: "2px 14px 6px 10px", textAlign: "right" }}>episodes</div>
            )}
            {sideTab === "chats" ? <Slide id="chats" order={["chats", "threads"]} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}><div data-testid="chats-side" data-tour="chats-sidebar" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* the roster takes what is left and scrolls inside itself; the catalogue below is bounded, so the two
                  never draw over each other (2026-09-23) */}
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>{chatsEpisodes ?? chatsSide}</div>
            </div></Slide> : <Slide id="threads" order={["chats", "threads"]}>{fold("threads", (<>
              {!threads.length && <div style={{ padding: "2px 14px 6px", fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.5 }}>no threads yet — pick something in the Studio below and press “new thread”</div>}
              {threads.map((th) => { const on = th.id === activeThread; return (
                <div key={th.id} data-thread-row={th.id} style={{ marginBottom: on ? 4 : 0 }}>
                  <div onClick={() => { if (on) setFocus([]); else onSelectThread?.(th.id); }} className="loki-thread-row" title={`${th.items.length} widget${th.items.length === 1 ? "" : "s"} · click to open · double-click the name to rename`}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", cursor: "pointer", background: on ? C.panel2 : "transparent", borderLeft: `2px solid ${on ? C.brand : "transparent"}` }}>
                    <span style={{ color: on ? C.brand : C.dim, fontFamily: mono, fontSize: 10 }}>{on ? "●" : "○"}</span>
                    <Renamable label={th.name} canRename={!!onRenameThread} onRename={(v) => onRenameThread?.(th.id, v)} style={{ flex: 1, fontFamily: mono, fontSize: 11, color: on ? C.fg : C.muted, minWidth: 0 }} />
                    {/* WHAT IS INSIDE (operator 2026-09-20: "each thread could have below small icons that symbolize each widget inside"): one pictogram per member, the count only when it overflows */}
                    <span data-testid={`thread-icons-${th.id}`} title={th.items.map((id) => items.find((x) => x.id === id)).filter((x): x is ZoneItem => !!x).map(aliasOf).join(" · ")} style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                      {th.items.map((id) => items.find((x) => x.id === id)).filter((x): x is ZoneItem => !!x).slice(0, 6).map((it) => <StudioIcon key={it.id} kind={it.kind ?? "chat"} category={it.category} size={11} active={on} />)}
                      {th.items.length > 6 && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>+{th.items.length - 6}</span>}
                      {!th.items.length && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>0</span>}
                    </span>
                    {onDeleteThread && <button data-testid={`thread-delete-${th.id}`} onClick={(e) => { e.stopPropagation(); onDeleteThread(th.id); }} title="delete this thread — widgets that live only here close" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 11, padding: 0 }}>✕</button>}
                  </div>
                  {on && th.items.map((id) => items.find((x) => x.id === id)).filter((x): x is ZoneItem => !!x).map((it) => (
                    <div key={it.id} data-thread-id={it.id} data-in-thread={th.id} data-focused={!focus.length ? undefined : focus.includes(it.id) ? "on" : "off"} className="loki-thread-row" onClick={() => { setPreview(null); toggleFocus(it.id); }}
                      title={!focus.length ? "click to view this one alone" : focus.includes(it.id) ? "click to take it out of the view" : "click to add it to the view"}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 14px 4px 26px", cursor: "pointer", animation: "lokiZoneFade .24s ease", opacity: focus.length && !focus.includes(it.id) ? 0.45 : 1, transition: "opacity .18s ease" }}>
                      <span style={{ color: C.brand, fontFamily: mono, fontSize: 9 }}>{focus.length && !focus.includes(it.id) ? "◇" : "◆"}</span>
                      <Renamable label={aliasOf(it)} canRename={!!onRenameItem} onRename={(v) => onRenameItem?.(it.id, v)} style={{ flex: 1, fontFamily: mono, fontSize: 10.5, color: C.fg, minWidth: 0 }} />
                      {it.uid && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>#{it.uid}</span>}
                      <button data-testid={`thread-split-${it.id}`} onClick={(e) => { e.stopPropagation(); removeFromThread(it.id); }} title="remove from this thread (the widget stays open where else it is used)" style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 11, padding: 0 }}>⊟</button>
                    </div>
                  ))}
                  {on && th.items.map((id) => items.find((x) => x.id === id)).filter((x): x is ZoneItem => !!x && !!x.subagentsKey).map((it) => <SubagentRows key={`sub-${it.id}`} item={it} onOpen={() => setPreview(null)} />)}
                </div>
              ); })}
            </>))}</Slide>}
          </div>

          {/* STUDIO | MODELS — the catalog as icons, every category a headed section (no tabs below); `models` holds the agents */}
        </div>
        )}
          {/* the old surface still renders the same panel while it is being removed — one behaviour change per commit */}
          {sideTab === "threads" && studioPanel}
        {/* THE PREVIEW (studio pick) — the widget as it will look, and the two ways in */}
        {sideTab === "chats" ? (
          <Slide id="chats" order={["chats", "threads"]} style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "row", overflow: "hidden" }}>
            {chatFolded ? (
              <div data-testid="chats-body-folded" style={{ width: 26, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", minHeight: 0, background: C.bg }}>
                <button data-testid="chats-body-unfold" onClick={() => setChatFolded(false)} title="show the conversation" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: "8px 0 4px" }}>▸</button>
                <span onClick={() => setChatFolded(false)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", writingMode: "vertical-rl", transform: "rotate(180deg)", fontFamily: mono, fontSize: 9.5, letterSpacing: 0.8, color: C.dim, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>the chat</span>
              </div>
            ) : (
              <div data-testid="chats-body" data-tour="chats-thread" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", background: C.bg }}>{chatsBody}</div>
            )}
            {/* THE SPLIT (operator 2026-09-23: "was suppose to open in split screen … at least 1 per time",
                "split screen i mean vertically splited"): a Studio pick opens here — the conversation keeps the
                left half, the widget takes the right. One at a time, so there is no layout to compose. */}
            {chatsSplit}
          </Slide>
        ) : preview ? (
          <div data-testid="studio-preview" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", background: C.bg }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
              {preview.kind.face ? <ChibiFace slug={preview.kind.face} mood="live" size={20} color={preview.kind.tint} shape={preview.kind.faceShape} /> : preview.kind.emoji ? <span style={{ fontSize: 16 }}>{preview.kind.emoji}</span> : <StudioIcon kind={preview.kind.kind} category={preview.category} size={16} active />}
              <span style={{ fontFamily: mono, fontSize: 12.5, color: C.fg, fontWeight: 700 }}>{preview.kind.label}</span>
              <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{preview.category} · preview</span>
              <span style={{ flex: 1 }} />
              <button data-testid="preview-close" onClick={() => setPreview(null)} title="back to the thread" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>
            </div>
            {/* THE EXAMPLE (left, full size) + THE INTRO (right): what it is · does · how · costs, and the two ways in */}
            <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 0 }}>
              <div style={{ flex: 1, minWidth: 0, minHeight: 0, margin: 16, marginRight: 0, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", background: C.bg }}>
                {preview.kind.preview
                  ? <div className="lwx-flat" data-testid="studio-example" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "auto" }}>{preview.kind.preview}</div>
                  : <div className="lwx-flat" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 24, display: "grid", placeItems: "center" }}>{preview.kind.sample ? <div style={{ zoom: 2.4, width: 280, pointerEvents: "none" } as React.CSSProperties}>{preview.kind.sample}</div> : <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted }}>no preview for this one — add it to see it live</div>}</div>}
              </div>
              {(() => { const k = preview.kind; const intro = introFor(k.kind); const tint = CATEGORY_TINT[preview.category] ?? C.dim; return (
                <div data-testid="studio-intro" style={{ width: 300, flexShrink: 0, margin: 16, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", fontFamily: mono }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 40, height: 40, borderRadius: 10, background: `color-mix(in oklab, ${tint} 14%, transparent)`, border: `1px solid color-mix(in oklab, ${tint} 35%, transparent)`, display: "grid", placeItems: "center" }}>{k.face ? <ChibiFace slug={k.face} mood="live" size={30} color={k.tint} shape={k.faceShape} /> : <StudioIcon kind={k.kind} category={preview.category} size={22} />}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: C.fg, fontWeight: 700 }}>{k.label}</div>
                      <div style={{ fontSize: 9.5, color: tint, textTransform: "uppercase", letterSpacing: 0.6 }}>{preview.category}</div>
                    </div>
                  </div>
                  {k.description && <div style={{ fontSize: 11.5, color: C.fg, lineHeight: 1.55, fontFamily: nav }}>{k.description}</div>}
                  {intro && (<>
                    <div><div style={{ fontSize: 9, color: C.dim, letterSpacing: 0.8, marginBottom: 6 }}>WHAT IT DOES</div><ul style={{ margin: 0, paddingLeft: 16, fontFamily: nav, fontSize: 11.5, color: C.muted, lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 4 }}>{intro.does.map((s) => <li key={s}>{s}</li>)}</ul></div>
                    <div><div style={{ fontSize: 9, color: C.dim, letterSpacing: 0.8, marginBottom: 6 }}>HOW TO USE IT</div><ul style={{ margin: 0, paddingLeft: 16, fontFamily: nav, fontSize: 11.5, color: C.muted, lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 4 }}>{intro.how.map((s) => <li key={s}>{s}</li>)}</ul></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.dim, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}><span>cost</span><span style={{ color: intro.cost.startsWith("$0") ? C.ok : C.warn }}>{intro.cost}</span></div>
                  </>)}
                  <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                    {(!k.instance || onNewThread) && <button data-testid="preview-new-thread" onClick={() => { setPreview(null); if (k.instance) onNewThread?.([k.instance]); else k.add({ thread: "new" }); }} style={{ background: C.brand, border: `1px solid ${C.brand}`, color: C.bg, borderRadius: 7, padding: "8px 12px", cursor: "pointer", fontFamily: mono, fontSize: 11, fontWeight: 700 }}>+ new thread with {k.label}</button>}
                    {active && (k.instance && inActive(k.instance)
                      ? <div data-testid="preview-in-thread" style={{ border: `1px dashed ${C.border}`, color: C.dim, borderRadius: 7, padding: "7px 12px", fontFamily: mono, fontSize: 10.5, textAlign: "center" }}>already in “{active.name}”</div>
                      : <button data-testid="preview-add" onClick={() => { setPreview(null); if (k.instance) addToActive(k.instance); else k.add({ thread: active.id }); }} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 7, padding: "7px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>add to “{active.name}”</button>)}
                  </div>
                </div>
              ); })()}
            </div>
          </div>
        ) : (<Slide id="threads" order={["chats", "threads"]} style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* more rows than the screen holds → the grid grows below the fold (each row still half a screen) and this scrolls */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
        <div data-testid="threads-split-scroll" style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: grid.rows > THREAD_VISIBLE_ROWS ? "auto" : "hidden", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
        <div ref={splitRef} data-testid="threads-split" data-cols={grid.cols} data-rows={grid.rows} style={{ flexShrink: 0, height: grid.rows > THREAD_VISIBLE_ROWS ? `${Math.round((grid.rows / THREAD_VISIBLE_ROWS) * 100)}%` : "100%", minWidth: 0, minHeight: 0, position: "relative", display: "grid", gridTemplateColumns: colW.map((w) => `minmax(0, ${w}fr)`).join(" "), gridTemplateRows: rowW.map((w) => `minmax(0, ${w}fr)`).join(" "), gap: 1, background: C.border }}>
          {openList.map((shown, i) => (
            <div key={shown.id} data-thread-cell={shown.id} data-flip-id={shown.id} data-dragging={dragCell === shown.id ? "" : undefined} data-span={`${grid.cells[i].colSpan}x${grid.cells[i].rowSpan}`}
              style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", background: C.bg, gridRow: `span ${grid.cells[i].rowSpan}`, gridColumn: `span ${grid.cells[i].colSpan}`, opacity: dragCell === shown.id ? 0.45 : 1, outline: dragCell === shown.id ? `1px dashed ${C.brand}` : "none", outlineOffset: -1 }}>
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: `1px solid ${C.border}` }}>
                {openList.length > 1 && <span data-testid={`cell-grip-${shown.id}`} onPointerDown={startCellDrag(shown.id)} title="drag to another slot" style={{ cursor: "grab", color: C.dim, fontSize: 11, userSelect: "none", touchAction: "none" }}>⠿</span>}
                <span style={{ color: C.brand, fontFamily: mono, fontSize: 11 }}>◆</span>
                <Renamable label={(threads.find((th) => th.id === activeThread)?.aliases ?? {})[shown.id] ?? shown.label} canRename={!!onRenameItem} onRename={(v) => onRenameItem?.(shown.id, v)} style={{ color: C.fg, fontFamily: mono, fontSize: 11.5, fontWeight: 700, minWidth: 0 }} />
                {shown.uid && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>#{shown.uid}</span>}
                <span style={{ flex: 1 }} />
                {canStrip && <button data-testid={`cell-strip-v-${shown.id}`} onClick={() => setStrip(shown.id, "v")} title="collapse to a strip on the right" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: 0 }}>⊣</button>}
                {canStrip && <button data-testid={`cell-strip-h-${shown.id}`} onClick={() => setStrip(shown.id, "h")} title="collapse to a bar at the bottom" style={{ marginLeft: 6, background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: 0 }}>⊥</button>}
                {shownList.length > 1 && <button onClick={() => { const th = threads.find((x) => x.id === activeThread); if (th && onSetThreadItems) onSetThreadItems(th.id, th.items.filter((x) => x !== shown.id)); else choose(shown.id, true); }} title="remove from this thread" style={{ marginLeft: 6, background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: 0 }}>⊟</button>}
                {!shown.obligatory && <button onClick={() => onCloseItem(shown.id)} title={shown.closeTitle ?? "undock"} style={{ marginLeft: 6, background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: 0 }}>✕</button>}
              </div>
              <Mount node={hostFor(shown)} />
            </div>
          ))}
          {/* SEAMS — drag to resize columns / rows (operator 2026-09-16: "including resizing") */}
          {seamPositions(colW).map((pct, i) => (
            <div key={`c${i}`} data-testid={`seam-col-${i + 1}`} onPointerDown={startSeam("col", i + 1)} title="drag to resize"
              style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${pct}% - 3px)`, width: 7, cursor: "col-resize", zIndex: 5, touchAction: "none" }} />
          ))}
          {seamPositions(rowW).map((pct, i) => (
            <div key={`r${i}`} data-testid={`seam-row-${i + 1}`} onPointerDown={startSeam("row", i + 1)} title="drag to resize"
              style={{ position: "absolute", left: 0, right: 0, top: `calc(${pct}% - 3px)`, height: 7, cursor: "row-resize", zIndex: 5, touchAction: "none" }} />
          ))}
          {dragCell && cellPos && <div style={ghostStyle(cellPos)}><span style={{ color: C.brand }}>◆</span>{items.find((x) => x.id === dragCell)?.label ?? dragCell}</div>}
        </div>
        </div>
        {/* THE SIDE RAIL — panes collapsed horizontally: slim vertical strips, the name rotated (Blocks' strip) */}
        {vStrips.map((s) => (
          <div key={s.id} data-thread-strip={s.id} data-strip="v" style={{ width: STRIP_W, flexShrink: 0, borderLeft: `1px solid ${C.border}`, display: "flex", minHeight: 0 }}>
            <VStrip label={(threads.find((th) => th.id === activeThread)?.aliases ?? {})[s.id] ?? s.label} onClick={() => setStrip(s.id, null)} title={`open ${s.label}`} onClose={s.obligatory ? undefined : () => onCloseItem(s.id)} closeTitle={s.closeTitle} />
          </div>
        ))}
        </div>
        {/* THE BOTTOM RAIL — panes collapsed vertically: one bar each, the name in line */}
        {hStrips.map((s) => (
          <div key={s.id} data-thread-strip={s.id} data-strip="h" onClick={() => setStrip(s.id, null)} title={`open ${s.label}`} className="loki-thread-row"
            style={{ flexShrink: 0, height: 26, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", cursor: "pointer", fontFamily: mono, fontSize: 10.5, color: C.dim, background: C.bg }}>
            <span style={{ color: C.brand }}>◆</span>
            <span style={{ color: C.muted }}>{(threads.find((th) => th.id === activeThread)?.aliases ?? {})[s.id] ?? s.label}</span>
            {s.uid && <span style={{ fontSize: 9, color: C.dim }}>#{s.uid}</span>}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 9 }}>click to open</span>
            {!s.obligatory && <button onClick={(e) => { e.stopPropagation(); onCloseItem(s.id); }} title={s.closeTitle ?? "undock"} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: 0 }}>✕</button>}
          </div>
        ))}
        </div>
        </Slide>)}
        {/* STUDIO | MODELS ON THE RIGHT (operator 2026-09-23: "studio and models place on a sidebar right"). It sat
            under the roster, which put the shop and the working surface in one column and squeezed both. Here it is
            its own rail: agents on the left, the conversation in the middle, what you can open on the right. */}
        {sideTab === "chats" && catalog.length > 0 && (
          <div data-testid="agents-catalogue" data-folded={studioFolded ? "1" : undefined}
            style={{ position: "relative", width: studioFolded ? 26 : 248, flexShrink: 0, borderLeft: `1px solid ${C.border}`, overflowY: studioFolded ? "hidden" : "auto", overflowX: "hidden", background: C.bg, paddingTop: studioFolded ? 0 : 34, transition: "width .26s ease" }}>
            {studioFolded ? (
              <div data-testid="studio-rail-folded" style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", minHeight: 0 }}>
                <button data-testid="studio-rail-unfold" onClick={() => setStudioFolded(false)} title="show the Studio" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: "8px 0 4px" }}>◂</button>
                <span onClick={() => setStudioFolded(false)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", writingMode: "vertical-rl", fontFamily: mono, fontSize: 9.5, letterSpacing: 0.8, color: C.dim, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>studio</span>
              </div>
            ) : (
              <>
                <button data-testid="studio-rail-fold" onClick={() => setStudioFolded(true)} title="hide the Studio" style={{ position: "absolute", right: 4, top: 38, background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: 0, zIndex: 2 }}>▸</button>
                {studioPanel}
              </>
            )}
          </div>
        )}
        {ghostHost}
      </div>
    );
  }
  // the center stage: rows of ROW_MAX, each one screen tall, scrolled vertically
  const rows = zone === "center" ? dockRows(items) : [items];
  const filler = (row: ZoneItem[]) => row.every((it) => collapsed.includes(it.id) || it.fixed) && <div style={{ flex: 1, minWidth: 0, background: C.bg, borderLeft: `1px solid ${C.border}` }} />;
  // side zones are ghost-at-rest (appear on hover); the center stays solid (it's the working surface).
  return (
    <>
    <div ref={rootRef} onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{ display: "flex", alignSelf: "stretch", minHeight: 0, ...(zone === "center" ? { flex: 1, minWidth: 0, flexDirection: "column", overflowX: "hidden", overflowY: rows.length > 1 ? "auto" : "hidden" } : {}), opacity: !isSide || hot ? 1 : 0.42, transition: "opacity .22s ease" }}>
      {portals}
      {zone === "center"
        ? rows.map((row, ri) => (
            <div key={ri} data-dock-row={ri} style={{ display: "flex", flex: "0 0 100%", minHeight: 0, overflowX: "auto", overflowY: "hidden", borderTop: ri ? `2px solid ${C.border}` : undefined }}>
              {row.map(col)}
              {/* when nothing flexible is open, the fixed panels + strips hug the left — fill the row */}
              {filler(row)}
            </div>
          ))
        : zone === "right" ? <>{divider}{items.map(col)}{filler(items)}</> : <>{items.map(col)}{divider}{filler(items)}</>}
      {/* the ⠿ reorder ghost — the dragged item's name chip riding the pointer */}
      {dragItem && dragPos && (
        <div style={ghostStyle(dragPos)}><span style={{ color: C.brand }}>◆</span>{items.find((x) => x.id === dragItem)?.label ?? dragItem}</div>
      )}
      {/* ⛶ fullscreen — the docked panel as a full-viewport page */}
      {fsItem && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 220, background: C.bg, display: "flex", flexDirection: "column", animation: "lokiZoneFade .18s ease" }}>
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: `1px solid ${C.border}` }}>
            <button onClick={() => setFs(null)} title="back (Esc)" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: 0 }}>← back</button>
            <span style={{ color: C.brand, fontFamily: mono, fontSize: 12 }}>◆</span>
            <span style={{ color: C.fg, fontFamily: mono, fontSize: 12.5, fontWeight: 700 }}>{fsItem.label}</span>
            {fsItem.uid && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>#{fsItem.uid}</span>}
            <button onClick={() => setFs(null)} title="close (Esc)" style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 14, padding: 0 }}>✕</button>
          </div>
          <Mount node={hostFor(fsItem)} />
        </div>,
        document.body,
      )}
    </div>
      {ghostHost}
    </>
  );
}

// the zone-fade keyframes — injected once (content cross-fade when a column opens).
if (typeof document !== "undefined" && !document.getElementById("loki-zone-anim")) {
  const s = document.createElement("style");
  s.id = "loki-zone-anim";
  s.textContent = "@keyframes lokiZoneFade{from{opacity:0}to{opacity:1}}"
    // TAB SWITCHES (operator 2026-09-21: "to switch the tabs make beautiful animations"): the content glides in from
    // the side its tab sits on, a touch blurred, and settles; the underline slides between the words (TabRow).
    + "@keyframes lokiSlideFromRight{from{opacity:0;transform:translateX(18px);filter:blur(2px)}60%{filter:blur(0)}to{opacity:1;transform:none;filter:blur(0)}}"
    + "@keyframes lokiSlideFromLeft{from{opacity:0;transform:translateX(-18px);filter:blur(2px)}60%{filter:blur(0)}to{opacity:1;transform:none;filter:blur(0)}}"
    + "@media (prefers-reduced-motion: reduce){[data-loki-slide]{animation:none!important}}";
  document.head.appendChild(s);
}

/** THE TAB ROW — small uppercase words, the active one lit, a thin underline that glides to it (the MIN · SCOPE · MAX
 *  dial's move). `tint(tab)` colours the underline per tab; the words cross-fade. Pure UI. */
export function TabRow<K extends string>({ tabs, value, onChange, tint, testPrefix, size = 9, gap = 2, style, label }: {
  tabs: readonly K[]; value: K; onChange: (t: K) => void; tint?: (t: K) => string; testPrefix: string; size?: number; gap?: number; style?: React.CSSProperties; /** the word shown for a key, when it is not the key itself */ label?: (t: K) => string;
}) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const [bar, setBar] = React.useState<{ left: number; width: number } | null>(null);
  React.useLayoutEffect(() => { const el = refs.current[value]; if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth }); }, [value, tabs.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const color = tint?.(value) ?? C.brand;
  return (
    <span data-testid={`${testPrefix}-row`} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap, whiteSpace: "nowrap", ...style }}>
      {tabs.map((t) => { const on = value === t; return (
        <button key={t} ref={(el) => { refs.current[t] = el; }} data-testid={`${testPrefix}-${t}`} data-on={on ? "" : undefined} onClick={() => onChange(t)}
          style={{ background: "transparent", border: "none", padding: "0 4px", cursor: "pointer", fontFamily: mono, fontSize: size, letterSpacing: 1.2, textTransform: "uppercase", lineHeight: "16px", color: on ? C.fg : C.dim, transform: on ? "translateY(-0.5px)" : "none", transition: "color .25s ease, transform .25s cubic-bezier(.2,.8,.2,1)" }}
          onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = C.muted; }} onMouseLeave={(e) => { e.currentTarget.style.color = on ? C.fg : C.dim; }}>{label ? label(t) : t}</button>
      ); })}
      {bar && <i aria-hidden style={{ position: "absolute", bottom: -1, height: 1.5, borderRadius: 1, background: color, left: bar.left, width: bar.width, transition: "left .32s cubic-bezier(.2,.8,.2,1), width .32s ease, background .25s ease" }} />}
    </span>
  );
}
/** THE SLIDE — remounts its child when `id` changes and glides it in from the side of travel: `order` ranks the ids,
 *  so moving to a later tab enters from the right, to an earlier one from the left. */
export function Slide({ id, order, children, style }: { id: string; order: readonly string[]; children: React.ReactNode; style?: React.CSSProperties }) {
  const prev = React.useRef(id);
  const dir = order.indexOf(id) >= order.indexOf(prev.current) ? "lokiSlideFromRight" : "lokiSlideFromLeft";
  React.useEffect(() => { prev.current = id; }, [id]);
  return <div key={id} data-loki-slide={id} style={{ animation: `${dir} .34s cubic-bezier(.2,.8,.2,1) both`, ...style }}>{children}</div>;
}
