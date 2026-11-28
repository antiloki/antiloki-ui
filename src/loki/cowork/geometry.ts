// WHERE THE PANES ARE (operator 2026-11-10: shortcuts to move and focus panes). The layout is a tree of splits, with no coordinates; this lays it out on a unit square, using the
// splits' own shares, so "the pane to the right of this one" has an answer. Pure.
import { swapPanes, type Layout, type Node } from "./layout";

export type Rect = { x: number; y: number; w: number; h: number };
export type Dir = "left" | "right" | "up" | "down";
export const DIRS: readonly Dir[] = ["left", "right", "up", "down"];

/** Every pane's rectangle on the unit square (the zoom is ignored: it is where the pane is in the layout, not what is on screen). */
export function rectsOf(l: Layout): Map<string, Rect> {
  const out = new Map<string, Rect>();
  const walk = (n: Node, r: Rect) => {
    if (n.type === "leaf") { out.set(n.pane.id, r); return; }
    const total = n.sizes.reduce((a, b) => a + b, 0) || 1; let at = 0;
    n.children.forEach((c, i) => {
      const share = (n.sizes[i] ?? 1 / n.children.length) / total;
      walk(c, n.dir === "row" ? { x: r.x + at * r.w, y: r.y, w: r.w * share, h: r.h } : { x: r.x, y: r.y + at * r.h, w: r.w, h: r.h * share });
      at += share;
    });
  };
  if (l.root) walk(l.root, { x: 0, y: 0, w: 1, h: 1 });
  return out;
}

const EPS = 1e-6;
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** The pane next door in a direction: the nearest one that lies wholly beyond this one's edge and shares some of its extent; of the nearest, the one sharing most. `null` at the edge. */
export function neighbour(l: Layout, id: string, dir: Dir): string | null {
  const rs = rectsOf(l); const me = rs.get(id); if (!me) return null;
  let best: { id: string; gap: number; shared: number } | null = null;
  for (const [other, r] of rs) {
    if (other === id) continue;
    const horizontal = dir === "left" || dir === "right";
    const gap = dir === "right" ? r.x - (me.x + me.w) : dir === "left" ? me.x - (r.x + r.w) : dir === "down" ? r.y - (me.y + me.h) : me.y - (r.y + r.h);
    if (gap < -EPS) continue;
    const shared = horizontal ? overlap(me.y, me.y + me.h, r.y, r.y + r.h) : overlap(me.x, me.x + me.w, r.x, r.x + r.w);
    if (shared <= EPS) continue;
    if (!best || gap < best.gap - EPS || (Math.abs(gap - best.gap) <= EPS && shared > best.shared)) best = { id: other, gap, shared };
  }
  return best?.id ?? null;
}

/** Move the focused pane one place in a direction: it trades places with its neighbour there (shares stay with their slots). At the edge, nothing happens. */
export function shiftPane(l: Layout, id: string | null, dir: Dir): Layout {
  if (!id) return l;
  const nb = neighbour(l, id, dir);
  return nb ? swapPanes(l, id, nb) : l;
}

/** Focus follows a direction: the neighbour there, or where it already is. */
export function focusToward(l: Layout, dir: Dir): Layout {
  if (!l.focus) return l;
  const nb = neighbour(l, l.focus, dir);
  return nb ? { ...l, focus: nb } : l;
}
