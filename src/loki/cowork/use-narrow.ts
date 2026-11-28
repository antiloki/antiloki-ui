// A NARROW SCREEN (operator 2026-11-10, the phone): under this width Cowork shows one pane at a time and keeps the sidebar in a drawer. Pure parts tested.
import * as React from "react";

export const NARROW_PX = 720;
/** Is a viewport this wide a phone's? Pure. */
export const isNarrow = (width: number) => width > 0 && width < NARROW_PX;
export function useNarrow(): boolean {
  const [n, setN] = React.useState(() => typeof window !== "undefined" && isNarrow(window.innerWidth));
  React.useEffect(() => { const f = () => setN(isNarrow(window.innerWidth)); window.addEventListener("resize", f); f(); return () => window.removeEventListener("resize", f); }, []);
  return n;
}
/** The layout as a phone shows it: the focused pane (else the first) fills the screen. The real layout is never changed by it. Pure. */
export function oneAtATime<L extends { root: unknown; focus: string | null; zoom: string | null }>(l: L, firstId: string | null): L { return l.root && !l.zoom ? { ...l, zoom: l.focus ?? firstId } : l; }
