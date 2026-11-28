// A FAST FADE-AND-SLIDE when what a pane area shows is switched (a team, a fork, a thread): the operator 2026-11-18, "a pretty fast animation transition".
// It animates the element it is given; nothing is remounted (a terminal keeps its session). Off with the system's "reduce motion", and when the browser has no Web Animations.
import * as React from "react";

export const SWITCH_MS = 150;
export const SWITCH_FRAMES: Keyframe[] = [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }];
/** Should a switch be animated here? Pure over what the environment says. */
export function canAnimate(el: { animate?: unknown } | null, reduce: boolean): boolean { return !!el && typeof el.animate === "function" && !reduce; }
/** The ref to put on the area; the animation runs each time `key` changes (not on the first paint). */
export function useSwitchAnim<T extends HTMLElement>(key: unknown) {
  const ref = React.useRef<T>(null); const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) { first.current = false; return; }
    const el = ref.current; let reduce = false; try { reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { /* none */ }
    if (canAnimate(el, reduce)) el!.animate(SWITCH_FRAMES, { duration: SWITCH_MS, easing: "cubic-bezier(.2,.7,.2,1)" });
  }, [key]);
  return ref;
}
