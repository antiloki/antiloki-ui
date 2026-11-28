// THE APPEARANCE ON EVERY SCREEN (operator 2026-11-13: "make the themes of cowork work on all pages, sagas and x-ray too"). One holder at the root: the palette is on the page wherever you are,
// and a worn wallpaper is drawn behind every screen. Cowork draws its own (it also has the glass terminals and panes), so here it is every screen but Cowork. The pages' own big surfaces
// (`background: var(--c-bg)` / `--c-panel`, set inline) turn to glass over the wallpaper by one rule below, so no page has to be rewritten: that rule covers what is inside `<main>`, and it
// leaves menus and dialogs that open over the screen (they are outside `<main>`) solid.
import * as React from "react";
import { dimLayer } from "./appearance";
import { LookContext, useAppearance, useAppearanceState } from "./use-appearance";

const COWORK_PATH = "/";
/** the glass over a wallpaper: the page's surfaces keep this much of their colour (the pane opacity, held back so the picture still shows) */
export const glassShare = (paneOpacity: number): number => Math.round(Math.min(1, Math.max(0, paneOpacity)) * 70);

// What reads as a page-wide wash (it fills its parent: `height: 100%`, `flex: 1 1 0%`, `min-height: 100%`, `100vh`) goes clear, and `<main>` carries ONE glass wash for all of them; a card, a chart, a
// panel keeps its own glass. Without this, a page that nests five full-size `--c-bg` boxes would stack five glasses into an opaque wall.
const SURF = (v: string) => `html[data-wallpaper="page"] main [style*="background: var(--${v})"], html[data-wallpaper="page"] main [style*="background-color: var(--${v})"]`;
const FILL = ["height: 100%", "flex: 1 1 0%", "height: 100vh"].map((h) => `[style*="${h}"]`);
const FILLS = (v: string) => FILL.flatMap((f) => [`html[data-wallpaper="page"] main [style*="background: var(--${v})"]${f}`, `html[data-wallpaper="page"] main [style*="background-color: var(--${v})"]${f}`]).join(", ");
export const WALLPAPER_CSS = [
  'html[data-wallpaper="page"] main { background: color-mix(in srgb, var(--c-bg) var(--aw-wash, 26%), transparent); }',
  `${SURF("c-bg")} { background: color-mix(in srgb, var(--c-bg) var(--aw-bg, 55%), transparent) !important; }`,
  `${SURF("c-panel")} { background: color-mix(in srgb, var(--c-panel) var(--aw-panel, 60%), transparent) !important; backdrop-filter: blur(6px); }`,
  `${SURF("c-panel2")} { background: color-mix(in srgb, var(--c-panel2) var(--aw-panel, 60%), transparent) !important; }`,
  `${FILLS("c-bg")}, ${FILLS("c-panel")}, ${FILLS("c-panel2")} { background: transparent !important; backdrop-filter: none !important; }`,
].join("\n");

export function AppearanceProvider({ children, wallpaper = true, pathname }: { children: React.ReactNode; wallpaper?: boolean; pathname: string }) {
  const look = useAppearanceState(true);
  const showing = wallpaper && pathname !== COWORK_PATH && !!look.wallpaperUrl && look.ap.wallpaper !== "";
  React.useEffect(() => {
    const root = document.documentElement;
    if (!showing) { root.removeAttribute("data-wallpaper"); return; }
    root.setAttribute("data-wallpaper", "page"); root.style.setProperty("--aw-bg", `${glassShare(look.ap.paneOpacity)}%`); root.style.setProperty("--aw-wash", `${Math.round(glassShare(look.ap.paneOpacity) / 2)}%`); root.style.setProperty("--aw-panel", `${Math.min(80, glassShare(look.ap.paneOpacity) + 8)}%`);
    return () => { root.removeAttribute("data-wallpaper"); root.style.removeProperty("--aw-bg"); root.style.removeProperty("--aw-wash"); root.style.removeProperty("--aw-panel"); };
  }, [showing, look.ap.paneOpacity]);
  return (
    <LookContext.Provider value={look}>
      {showing && <style>{WALLPAPER_CSS}</style>}
      {children}
    </LookContext.Provider>
  );
}

/** The wallpaper behind a screen, to sit as the first child of a `position: relative; isolation: isolate` box. Nothing when none is worn, and nothing on Cowork (which draws its own). */
export function PageBackdrop({ pathname }: { pathname: string }) {
  const look = useAppearance();
  if (pathname === COWORK_PATH || !look.wallpaperUrl || look.ap.wallpaper === "") return null;
  return (
    <>
      <div data-testid="page-backdrop" aria-hidden style={{ position: "absolute", inset: 0, zIndex: -2, backgroundImage: `url("${look.wallpaperUrl}")`, backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: dimLayer(look.ap.dim), pointerEvents: "none" }} />
    </>
  );
}
