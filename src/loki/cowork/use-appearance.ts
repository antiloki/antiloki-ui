// THE APPEARANCE, HELD (RFC 0007 §17.8): the person's settings (kept per browser, only a convenience), the themes the serve has, and the palette put on the page. Since 2026-11-13
// (operator: "make the themes of cowork work on all pages, sagas and x-ray too") ONE holder lives at the root (`AppearanceProvider`) and the palette is on every screen; a screen that
// asks for `useAppearance()` gets that holder's state. Without a provider (a test, a screen mounted alone) it holds its own, as it always did.
import DEFAULT_WALLPAPER from "@/assets/start-sun.webp";
import * as React from "react";
import { BE_URL } from "@/loki/api/client";
import { listThemes, type OmarchyTheme, type ThemeList } from "./api";
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, parseAppearance, paletteToVars, pickWallpaper, themeFileUrl, rememberVars, PALETTE_VARS, type Appearance } from "./appearance";

function load(): Appearance { try { return parseAppearance(window.localStorage.getItem(APPEARANCE_KEY)); } catch { return { ...DEFAULT_APPEARANCE }; } }
const slug = (name: string | null) => (name ? name.trim().toLowerCase().replace(/\s+/g, "-") : null);

export type Look = ReturnType<typeof useAppearanceState>;
export const LookContext = React.createContext<Look | null>(null);
/** The appearance every screen shares (the root provider's), or its own when there is no provider. */
export function useAppearance(): Look { const shared = React.useContext(LookContext); const own = useAppearanceState(shared === null); return shared ?? own; }

/** How the pixel effects are drawn (the Appearance setting): blocks, or the same smooth, like a moving shadow. Pixels when there is no provider. */
export function usePixelStyle(slot?: "topbar" | "loading" | "reasoning" | "avatar"): "pixel" | "shadow" | "minimal" | "liquid" { const shared = React.useContext(LookContext); const a = shared?.active; const mine = !!a && shared?.ap?.lookOver === a.id; const fx = slot && a?.custom && !mine ? fxOf(a.animations?.[slot]) : null; if (fx) return fx.style; const v = shared?.ap?.pixelStyle; return v === "shadow" || v === "minimal" || v === "liquid" ? v : "pixel"; }

export function useAppearanceState(enabled = true) {
  const [ap, setAp] = React.useState<Appearance>(load);
  const [themes, setThemes] = React.useState<ThemeList | null>(null);
  const wornRef = React.useRef<string | null>(null);
  const set = React.useCallback((patch: Partial<Appearance>) => setAp((a) => {
    // A CLICK ON A LOOK WINS OVER THE THEME'S (found 2026-11-26: "on the new themes i cant click on other pixel effects, just shadow works"); wearing a theme anew brings its own look back
    const own = patch.pixelStyle ? { lookOver: wornRef.current } : "themeId" in patch || "follow" in patch ? { lookOver: null } : {};
    const next = parseAppearance({ ...a, ...patch, ...own });
    try { window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next)); } catch { /* blocked storage: the choice lasts until the page does */ }
    return next;
  }), []);
  const refresh = React.useCallback(async () => { const t = await listThemes(); if (t) setThemes(t); return t; }, []);
  // the themes are read when the screen opens, and every fifteen seconds while it follows Omarchy (its theme can change under it)
  React.useEffect(() => { if (enabled) void refresh(); }, [refresh, enabled]);
  React.useEffect(() => { if (!enabled || !ap.follow) return; const t = setInterval(() => { void refresh(); }, 15_000); return () => clearInterval(t); }, [enabled, ap.follow, refresh]);

  const wornId = ap.follow ? slug(themes?.current ?? null) ?? ap.themeId : ap.themeId;
  const active: OmarchyTheme | null = (wornId && themes?.themes.find((t) => t.id === wornId)) || null;
  // the palette goes on the page; it comes off when another theme (or none) is worn. The last one is remembered so the next load paints it from the first frame (`bootAppearance`)
  React.useEffect(() => {
    if (!enabled || !themes) return;   // until the serve has answered, what the boot put on the page stays
    const root = document.documentElement; for (const k of PALETTE_VARS) root.style.removeProperty(k);   // what the boot (or the last theme) left
    if (!active) { rememberVars(null); return; }
    const vars = paletteToVars(active.colors);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    rememberVars(vars);
    return () => { for (const k of Object.keys(vars)) root.style.removeProperty(k); };
  }, [active, enabled, themes]);
  const wallpaperFile = active ? pickWallpaper(active.backgrounds, ap.wallpaper) : null;
  // THE DEFAULT WALLPAPER (operator 2026-11-23): a machine with no Omarchy theme (or a theme with no picture) used to get a black screen. antiloki's own red sun ships with the app and is worn unless a theme brings a
  // picture or a CSS look of its own, or the person chose no wallpaper at all.
  const themeCss = active?.custom && ap.wallpaper !== "" ? active.wallpaper_css ?? null : null;
  const wallpaperUrl = active && wallpaperFile ? themeFileUrl(BE_URL, active.id, wallpaperFile) : (ap.wallpaper === "" || themeCss ? null : DEFAULT_WALLPAPER);
  // a CUSTOM theme brings its own look and its own moving places (the person's choice of look is what the theme is not worn)
  wornRef.current = active?.id ?? null;
  const apEff = React.useMemo(() => (active?.custom && active.look && ap.lookOver !== active.id ? { ...ap, pixelStyle: active.look } : ap), [ap, active]);
  React.useEffect(() => { if (enabled) document.documentElement.dataset.look = apEff.pixelStyle; }, [apEff.pixelStyle, enabled]);   // the window box reads the look from the page
  const wallpaperCss = themeCss;
  return { ap: apEff, set, themes, refresh, active, wallpaperUrl, wallpaperFile, wallpaperCss };
}

/** What a custom theme says about one moving place (topbar, loading, reasoning, avatar): its effect mapped to the look that draws it, with its colours, speed and strength. `null` when the worn theme says nothing about it. */
export type Fx = { style: "pixel" | "shadow" | "minimal" | "liquid"; effect: string; colors: string[]; speed_s: number; intensity: number };
export const STYLE_OF_EFFECT: Record<string, Fx["style"]> = { glow: "shadow", pulse: "shadow", shimmer: "shadow", orbit: "shadow", pixels: "pixel", liquid: "liquid", dots: "minimal", bar: "minimal", none: "minimal" };
export function fxOf(spec: { effect: string; colors?: string[]; speed_s?: number; intensity?: number } | undefined | null): Fx | null { if (!spec || !(spec.effect in STYLE_OF_EFFECT)) return null; return { style: STYLE_OF_EFFECT[spec.effect], effect: spec.effect, colors: spec.colors ?? [], speed_s: spec.speed_s ?? 3.2, intensity: spec.intensity ?? 0.6 }; }
export function useFx(slot: "topbar" | "loading" | "reasoning" | "avatar"): Fx | null { const shared = React.useContext(LookContext); const a = shared?.active; return a?.custom && shared?.ap?.lookOver !== a.id ? fxOf(a.animations?.[slot]) : null; }
