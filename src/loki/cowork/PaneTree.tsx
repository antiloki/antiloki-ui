// THE SPLIT TREE (RFC 0007 §5.3): lays the layout out with flex, puts a draggable gap between siblings, and renders a zoomed pane alone.
// The drag changes two neighbouring shares and nothing else; `layout.ts` keeps every share above its minimum.
import * as React from "react";
import { C } from "@/loki/theme";
import { CollapseContext, STRIP_PX } from "./collapse-context";
import { MIN_SHARE, leaves, normalize, type Layout, type Node, type PaneRef } from "./layout";

/** HOW SHORT A STACKED PANE MAY GET (operator 2026-11-10: "sometimes panes and agents are getting too small to see, so add vertical scroll on the space"): panes stacked in a column keep at least this much height
 *  and the column scrolls when they no longer fit, instead of squeezing every terminal to a few lines. */
export const MIN_PANE_H = 320;
/** RAISED 2026-11-21 (operator: "panes can get too thin; a minimal relief good enough to read the content with some space; new panes go on a new line, the workspace scrolls vertically"): 170 px showed a pane as a sliver, so the least is now 380 wide and a wrapped line 440 high.
 *  HOW SMALL A PANE MAY GET (operator 2026-11-11: "when a team, a pane or an agent gets too small there should be a limit; past it we jump a line; vertical scroll is no problem, but not horizontal"): panes side by side keep at least this much width, and a row that cannot give each that
 *  much BREAKS INTO LINES, the way text does; the space scrolls vertically and never sideways. A line is at least `WRAPPED_MIN_H` high. */
export const MIN_PANE_W = 380;
/** Panes whose contents are laid out in columns of their own need more than a terminal does: Frames (screens | canvas | inspector) and the shared Diff. */
export const WIDE_TOOL_MIN_W: Record<string, number> = { frames: 640, "shared-diff": 420 };
/** A side question is a small read-only helper beside its agent: it needs less room than a full agent, so the pair stays side by side on an ordinary screen. */
export const SIDE_MIN_W = 300;
const leafMinW = (p: PaneRef): number => (p.collapsed === true ? STRIP_PX.row : p.side !== undefined ? SIDE_MIN_W : WIDE_TOOL_MIN_W[p.tool ?? ""] ?? MIN_PANE_W);
export const WRAPPED_MIN_H = 440;
/** What a block's frame adds on each side of its panes (border + padding), so the frame's cell is never narrower than frame and panes together. A block's cell takes its height from its own contents (the bar over the panes + the panes' minimum), not from a number here. */
export const BLOCK_CHROME_W = 16;
/** Does a row have to break into lines? `mins`: the least width each child needs (a folded one its strip, a pane `MIN_PANE_W`, a team the SUM of its members'). Pure - tested. */
/** An agent and its side question (a block made by the `?`): they go below one another only when the room is smaller than the two minimums added up, never because a roomier rule says so. Pure. */
export function pairWraps(width: number, mins: readonly number[], gap = 8): boolean { return width > 0 && mins.length > 1 && mins.reduce((n, m) => n + m, 0) + gap * (mins.length - 1) > width; }
export function rowWrapsFor(width: number, mins: readonly number[], gap = 8): boolean { return width > 0 && mins.length > 1 && (mins.length > maxPerLine(width) || mins.reduce((n, m) => n + roomFor(m), 0) + gap * (mins.length - 1) > width); }
/** HOW MANY PANES A LINE HOLDS (operator 2026-11-21: "four, and on a big screen up to eight"): four on an ordinary screen, one more for every 480 px the row has beyond that, at most eight. Pure. */
export const MAX_PER_LINE = 4;
export const MAX_PER_LINE_BIG = 8;
export const maxPerLine = (width: number): number => Math.min(MAX_PER_LINE_BIG, Math.max(MAX_PER_LINE, Math.floor(width / 480)));
/** ROOM TO RESIZE (operator 2026-11-21: "i cant resize width anymore"): a row of panes each at exactly its least width has no slack, so no seam can move. A row wraps while its panes would have less than this much above their least widths, so every line keeps some room to widen one pane against its neighbour. A folded strip needs none. */
export const ROOM = 1.15;
export const roomFor = (m: number): number => (m >= MIN_PANE_W ? Math.ceil(m * ROOM) : m);
/** The same for plain panes: `folded` says which are strips. */
export function rowWraps(width: number, folded: readonly boolean[], gap = 8): boolean { return rowWrapsFor(width, folded.map((f) => (f ? STRIP_PX.row : MIN_PANE_W)), gap); }
/** THE LEAST A BLOCK MAY BE (operator 2026-11-11: "a team's minimum width is the sum of its members' minimum widths"): a pane has its own minimum, side by side the minimums add up, stacked the widest counts; the same for height the other way round. A team is a block of
 *  panes, so it needs what they need together; and the whole thread scrolls (vertically) when the sum is more than the screen. Pure - tested. */
export function minWidthOf(n: Node, gap = 8, frame = true): number {
  if (n.type === "leaf") return leafMinW(n.pane);
  const ms = n.children.map((c) => minWidthOf(c, gap)); const own = n.dir === "row" ? ms.reduce((a, b) => a + b, 0) + gap * Math.max(0, ms.length - 1) : Math.max(0, ...ms);
  return own + (frame && n.team ? BLOCK_CHROME_W : 0);
}
export function minHeightOf(n: Node, gap = 8, frame = true): number {
  if (n.type === "leaf") return n.pane.collapsed === true ? STRIP_PX.col : MIN_PANE_H;
  const ms = n.children.map((c) => minHeightOf(c, gap)); const own = n.dir === "col" ? ms.reduce((a, b) => a + b, 0) + gap * Math.max(0, ms.length - 1) : Math.max(0, ...ms);
  return own + (frame && n.team ? blockChromeH(n.team) : 0);
}
/** What a block's frame puts over and around its panes, in height: a team's bar (its name, its task line, run) or a side question's thin bar, plus the frame's border and padding. */
export const blockChromeH = (team: string): number => (team.startsWith("side:") ? 34 : 52);

export type Render = (pane: PaneRef) => React.ReactNode;
/** A team block is drawn inside a frame of its own (its bar over its three panes): the screen decides what that frame is. */
/** `min`: the least the block's panes need (minWidthOf / minHeightOf of the block): the frame keeps its inside at least that big, so a team is never squeezed out of sight (operator 2026-11-11: "my team still disappears vertically"). */
export type RenderBlock = (team: string, inner: React.ReactNode, min: { w: number; h: number }) => React.ReactNode;

function Resizer({ dir, onDrag }: { dir: "row" | "col"; onDrag: (deltaPx: number, done: boolean) => void }) {
  const start = React.useRef<number | null>(null);
  const move = (e: PointerEvent) => { if (start.current !== null) onDrag((dir === "row" ? e.clientX : e.clientY) - start.current, false); };
  const up = (e: PointerEvent) => { if (start.current !== null) { onDrag((dir === "row" ? e.clientX : e.clientY) - start.current, true); start.current = null; } window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  return (
    <div role="separator" aria-orientation={dir === "row" ? "vertical" : "horizontal"} data-testid="resizer"
      onPointerDown={(e) => { start.current = dir === "row" ? e.clientX : e.clientY; window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); e.preventDefault(); }}
      style={{ flex: `0 0 8px`, cursor: dir === "row" ? "col-resize" : "row-resize", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none" }}>
      <div style={{ width: dir === "row" ? 2 : 28, height: dir === "row" ? 28 : 2, borderRadius: 2, background: C.border }} />
    </div>
  );
}

function SplitView({ node, path, render, renderBlock, onSizes }: { node: Extract<Node, { type: "split" }>; path: number[]; render: Render; renderBlock?: RenderBlock; onSizes: (path: number[], sizes: number[]) => void }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const live = React.useRef<number[] | null>(null);
  const [sizes, setSizes] = React.useState(node.sizes);
  React.useEffect(() => { setSizes(node.sizes); }, [node.sizes]);
  const drag = (i: number, lineEl?: HTMLElement | null, lineSum = 1) => (delta: number, done: boolean) => {
    const el = lineEl ?? ref.current; if (!el) return;
    const total = node.dir === "row" ? el.clientWidth : el.clientHeight; if (total <= 0) return;
    const base = live.current && !done ? live.current : node.sizes;
    const d = (delta / total) * (lineEl ? lineSum : 1);   // inside a line of a wrapped row the shares are those of the line's members only
    const pair = node.sizes[i] + node.sizes[i + 1];
    const a = Math.min(pair - MIN_SHARE, Math.max(MIN_SHARE, node.sizes[i] + d));
    const next = node.sizes.slice(); next[i] = a; next[i + 1] = pair - a;
    void base; live.current = next; setSizes(next);
    if (done) { live.current = null; onSizes(path, normalize(next)); }
  };
  // does this row have room for every pane at its minimum width? if not it wraps (and drops its resizers: lines have no seam to drag)
  const [wide, setWide] = React.useState(10_000);
  React.useLayoutEffect(() => { const el = ref.current; if (!el || node.dir !== "row" || typeof ResizeObserver === "undefined") return; const ro = new ResizeObserver(() => setWide(el.clientWidth || 10_000)); ro.observe(el); setWide(el.clientWidth || 10_000); return () => ro.disconnect(); }, [node.dir]);
  const wrapped = node.dir === "row" && (node.team?.startsWith("side:") ? pairWraps(wide, node.children.map((c) => minWidthOf(c))) : rowWrapsFor(wide, node.children.map((c) => minWidthOf(c))));
  // the folded panes keep a fixed strip; the open ones share what is left, so their shares are scaled to add up to one (a flex row whose grow factors add up to less than one leaves a gap)
  // A WRAPPED ROW IS LINES (2026-11-21: "i cant resize width anymore"): the children are packed into lines by their least widths, and each line is a row of its own with its own seams, so a pane can still be widened or narrowed against its neighbour on the same line
  const lines: number[][] = React.useMemo(() => { if (!wrapped) return []; const out: number[][] = []; let cur: number[] = []; let used = 0; node.children.forEach((c, i) => { const m = roomFor(minWidthOf(c)); if (cur.length && (cur.length >= maxPerLine(wide) || used + 8 + m > wide)) { out.push(cur); cur = []; used = 0; } used += (cur.length ? 8 : 0) + m; cur.push(i); }); if (cur.length) out.push(cur); return out; }, [wrapped, wide, node.children]);
  const lineRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const openSum = node.children.reduce((n, c, i) => n + (c.type === "leaf" && c.pane.collapsed ? 0 : sizes[i] ?? 1 / node.children.length), 0) || 1;
  const cell = (c: Node, i: number, share: number, inLine: boolean) => { const folded = c.type === "leaf" && c.pane.collapsed === true; return (
    <div data-testid="split-cell" data-collapsed={folded ? "1" : "0"} style={{ flex: folded ? `0 0 ${STRIP_PX[node.dir]}px` : `${share} 1 0`, minWidth: node.dir === "row" && !folded ? minWidthOf(c) : 0, minHeight: folded ? 0 : inLine ? Math.max(WRAPPED_MIN_H, minHeightOf(c)) : minHeightOf(c), display: "flex" }}>
      <CollapseContext.Provider value={node.dir}><NodeView node={c} path={[...path, i]} render={render} renderBlock={renderBlock} onSizes={onSizes} /></CollapseContext.Provider>
    </div>); };
  const inner = wrapped ? (
    <div ref={ref} data-testid="split" data-dir={node.dir} data-wrapped="1" data-team={node.team ?? ""} style={{ flex: path.length === 0 ? "1 0 auto" : 1, minWidth: 0, minHeight: minHeightOf(node, 8, false), display: "flex", flexDirection: "column", gap: 8, overflowY: path.length === 0 ? "visible" : "auto", overflowX: "hidden" }}>
      {lines.map((line, li) => {
        const sum = line.reduce((n, i) => n + (node.children[i].type === "leaf" && (node.children[i] as any).pane.collapsed ? 0 : sizes[i] ?? 1 / node.children.length), 0) || 1;
        return (
          <div key={li} ref={(el) => { lineRefs.current[li] = el; }} data-testid="split-line" style={{ display: "flex", flex: "1 0 auto", minWidth: 0 }}>
            {line.map((i, k) => (
              <React.Fragment key={node.children[i].type === "leaf" ? (node.children[i] as any).pane.id : `s${i}`}>
                {cell(node.children[i], i, (sizes[i] ?? 1 / node.children.length) / sum, true)}
                {k < line.length - 1 && <Resizer dir="row" onDrag={(d, done) => drag(i, lineRefs.current[li], sum)(d, done)} />}
              </React.Fragment>))}
          </div>); })}
    </div>
  ) : (
    <div ref={ref} data-testid="split" data-dir={node.dir} data-team={node.team ?? ""} style={{ flex: 1, minWidth: 0, minHeight: minHeightOf(node, 8, false), display: "flex", flexDirection: node.dir === "row" ? "row" : "column", ...(node.dir === "col" ? { overflowY: "auto", overflowX: "hidden" } : { overflow: "hidden" }) }}>
      {node.children.map((c, i) => (
        <React.Fragment key={c.type === "leaf" ? c.pane.id : `s${i}`}>
          {cell(c, i, (sizes[i] ?? 1 / node.children.length) / openSum, false)}
          {i < node.children.length - 1 && <Resizer dir={node.dir} onDrag={drag(i)} />}
        </React.Fragment>
      ))}
    </div>
  );
  return node.team && renderBlock ? <>{renderBlock(node.team, inner, { w: minWidthOf(node, 8, false), h: minHeightOf(node, 8, false) })}</> : inner;
}
function NodeView({ node, path, render, renderBlock, onSizes }: { node: Node; path: number[]; render: Render; renderBlock?: RenderBlock; onSizes: (path: number[], sizes: number[]) => void }) {
  return node.type === "leaf" ? <>{render(node.pane)}</> : <SplitView node={node} path={path} render={render} renderBlock={renderBlock} onSizes={onSizes} />;
}

/** The whole tree, or just the zoomed pane. Zoom shows only that pane: the others unmount, and re-attach on unzoom (their terminals live on in the serve and the host). */
export function PaneTree({ layout, render, renderBlock, onSizes }: { layout: Layout; render: Render; renderBlock?: RenderBlock; onSizes: (path: number[], sizes: number[]) => void }) {
  if (!layout.root) return null;
  const zoomed = layout.zoom ? leaves(layout.root).find((p) => p.id === layout.zoom) : null;
  if (zoomed) return <div data-testid="zoomed" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>{render(zoomed)}</div>;
  // the thread scrolls as a whole, vertically, when what is in it needs more than the screen gives (never sideways)
  return <div data-testid="thread-scroll" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto", overflowX: "hidden" }}><NodeView node={layout.root} path={[]} render={render} renderBlock={renderBlock} onSizes={onSizes} /></div>;
}
