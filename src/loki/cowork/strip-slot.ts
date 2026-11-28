// WHERE THE BOTTOM BAR DRAWS WHAT A TEAM HAS TO SAY (the operator 2026-11-22: "add on the bottom bar left, after the icons, a mini discrete preview of time and cost of the team or the thread I am in"): the bar offers a place after its icons; the team on screen draws into it through a portal.
// The bar and the panes are siblings, so the place is held here (a tiny store) instead of passed down.
import * as React from "react";
let el: HTMLElement | null = null; const subs = new Set<() => void>();
export const setStripSlot = (e: HTMLElement | null) => { if (el === e) return; el = e; subs.forEach((f) => f()); };
export function useStripSlot(): HTMLElement | null { return React.useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => el, () => null); }
