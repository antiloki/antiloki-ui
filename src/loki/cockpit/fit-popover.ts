// A PREVIEW MUST STAY ON THE SCREEN (operator 2026-10-11: the instruments moved to a pill at the right edge, and "some previews are leaking on the right side"). The hover previews were written for
// a chip in the middle of the screen: centred on the chip, 250 px wide. Near an edge that runs off it. `fitRef` is a ref callback for the preview's element: once it is laid out, it is nudged
// sideways just enough to sit inside the window, whichever edge it was leaking over.

/** How far (in px, negative = left) to move a box spanning [left, right] so it sits inside a window `vw` wide with `margin` to spare. 0 when it already fits or cannot. Pure - tested. */
export function shiftToFit(left: number, right: number, vw: number, margin = 12): number {
  if (right - left > vw - 2 * margin) return margin - left;   // wider than the window: line its left edge up
  if (right > vw - margin) return vw - margin - right;
  if (left < margin) return margin - left;
  return 0;
}

export function fitPopover(el: HTMLElement, margin = 12) {
  el.style.marginLeft = "0px";
  const r = el.getBoundingClientRect();
  const dx = shiftToFit(r.left, r.right, window.innerWidth, margin);
  if (dx) el.style.marginLeft = `${dx}px`;
}
/** `ref={fitRef}` on a preview's element. */
export const fitRef = (el: HTMLElement | null) => { if (el) fitPopover(el); };
