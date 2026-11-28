// SWIPING BETWEEN PANES ON A PHONE (operator 2026-11-12: "on cowork I can't switch between pages by dragging; the panes should be like a switch on dragging the screen"). Pure parts, tested.

/** A horizontal drag of at least this many px, clearly more sideways than up or down, is a page switch. */
export const SWIPE_MIN_PX = 56;
/** Which way a drag goes: `1` = the next pane (the finger moved left), `-1` = the previous (right), `0` = not a switch. Pure. */
export function swipeStep(dx: number, dy: number, min = SWIPE_MIN_PX): 1 | -1 | 0 {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}
/** Does a touch that began on `el` begin inside something that scrolls sideways (a wide table, a code editor, a text field being dragged in)? Then the drag belongs to it, not to the pager. */
export function startsInSideScroll(el: Element | null, stop: Element | null): boolean {
  for (let n: Element | null = el; n && n !== stop; n = n.parentElement) {
    const tag = n.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (n as HTMLElement).isContentEditable) return true;
    const ox = typeof getComputedStyle === "function" ? getComputedStyle(n).overflowX : "";
    if ((ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth + 2) return true;
  }
  return false;
}
/** The pane ids in order and the one shown: where a step lands (wrapping round), or null with nothing to switch to. Pure. */
export function stepTo(ids: string[], at: string | null, step: 1 | -1): string | null {
  if (ids.length < 2) return null; const i = at ? ids.indexOf(at) : -1;
  return ids[(i + step + ids.length) % ids.length];
}
