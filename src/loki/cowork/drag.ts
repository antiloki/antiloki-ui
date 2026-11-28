// DRAGGING A PANE (RFC 0007 §17.5): grab a pane by its header and drop it on another. The edge you drop on says where it goes (left or right of the target makes a
// row, above or below a column), and the middle swaps the two. Pure: which zone a pointer is in, and the rectangle that shows it.
import type { Side } from "./layout";

export type Zone = Side | "swap";
/** The edge band, as a share of the pane's width or height: inside it the nearest edge wins, outside it the drop is a swap. */
export const EDGE = 0.28;

export function zoneAt(x: number, y: number, r: { left: number; top: number; width: number; height: number }): Zone {
  if (r.width <= 0 || r.height <= 0) return "swap";
  const fx = Math.min(1, Math.max(0, (x - r.left) / r.width)); const fy = Math.min(1, Math.max(0, (y - r.top) / r.height));
  const d: Array<[Zone, number]> = [["left", fx], ["right", 1 - fx], ["above", fy], ["below", 1 - fy]];
  d.sort((a, b) => a[1] - b[1]);
  return d[0][1] < EDGE ? d[0][0] : "swap";
}

/** The part of the target that lights up for a zone, as percentages of its box (a swap lights all of it). */
export function zoneBox(z: Zone): { left: string; top: string; width: string; height: string } {
  switch (z) {
    case "left": return { left: "0%", top: "0%", width: "50%", height: "100%" };
    case "right": return { left: "50%", top: "0%", width: "50%", height: "100%" };
    case "above": return { left: "0%", top: "0%", width: "100%", height: "50%" };
    case "below": return { left: "0%", top: "50%", width: "100%", height: "50%" };
    default: return { left: "0%", top: "0%", width: "100%", height: "100%" };
  }
}
