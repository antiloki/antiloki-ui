import { describe, it, expect } from "vitest";
import { DEFAULT_APPEARANCE, MAX_DIM, MIN_OPACITY, clampDim, clampOpacity, dimLayer, panePct, paletteToVars, parseAppearance, pickWallpaper, themeFileUrl } from "./appearance";

const tokyo = { mode: "dark", accent: "#7aa2f7", selection: "#292e42", muted: "#414868", background: "#1a1b26", dark_background: "#13141c", darker_background: "#0e0e14", lighter_background: "#24283b", foreground: "#a9b1d6", dark_foreground: "#565f89", red: "#f7768e", yellow: "#e0af68", green: "#9ece6a" };

describe("an Omarchy palette becomes antiloki's tokens", () => {
  it("maps each colour to the surface Omarchy uses it for", () => {
    const v = paletteToVars(tokyo);
    expect(v).toMatchObject({ "--c-bg": "#0e0e14", "--c-panel": "#1a1b26", "--c-panel2": "#24283b", "--c-border": "#292e42", "--c-fg": "#a9b1d6", "--c-muted": "#565f89", "--c-dim": "#414868", "--c-ok": "#9ece6a", "--c-warn": "#e0af68", "--c-bad": "#f7768e", "--c-brand": "#7aa2f7", "--c-hover": "#292e42", "--c-active": "#24283b" });
  });
  it("a theme with fewer colours leaves antiloki's own showing through, and a value that is not a colour is never used", () => {
    const v = paletteToVars({ background: "#101010", accent: "#abc", foreground: "javascript:alert(1)", red: "red; background:url(x)" });
    expect(v).toEqual({ "--c-bg": "#101010", "--c-panel": "#101010", "--c-panel2": "#101010", "--c-brand": "#abc" });
    expect(paletteToVars({})).toEqual({});
  });
});

describe("the settings are the person's, limited, and never trusted", () => {
  it("opacity and dim stay inside their limits", () => {
    expect(clampOpacity(0)).toBe(MIN_OPACITY); expect(clampOpacity(7)).toBe(1); expect(clampOpacity(0.5)).toBe(0.5); expect(clampOpacity(NaN)).toBe(DEFAULT_APPEARANCE.termOpacity);
    expect(clampDim(-1)).toBe(0); expect(clampDim(5)).toBe(MAX_DIM);
    expect(panePct(0.555)).toBe("56%"); expect(panePct(0)).toBe("0%"); expect(dimLayer(0.4)).toBe("color-mix(in srgb, var(--c-bg) 40%, transparent)");
  });
  it("storage that is empty, broken or hostile gives the defaults, field by field", () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE); expect(parseAppearance("{")).toEqual(DEFAULT_APPEARANCE); expect(parseAppearance(7)).toEqual(DEFAULT_APPEARANCE);
    const a = parseAppearance({ termOpacity: "lots", dim: 0.5, themeId: "../etc", wallpaper: "x.sh", follow: "yes" });
    expect(a).toEqual({ ...DEFAULT_APPEARANCE, dim: 0.5 });
    expect(parseAppearance(JSON.stringify({ termOpacity: 0.6, dim: 0.2, themeId: "tokyo-night", wallpaper: "1-quattro.jpg", follow: true }))).toEqual({ termOpacity: 0.6, paneOpacity: 0.6, dim: 0.2, themeId: "tokyo-night", wallpaper: "1-quattro.jpg", follow: true, agentSkin: "terminal", pixelStyle: "pixel" });
  });
  it("the pixel effects are pixelated unless the setting says shadow", () => { expect(DEFAULT_APPEARANCE.pixelStyle).toBe("pixel"); expect(parseAppearance({ pixelStyle: "shadow" }).pixelStyle).toBe("shadow"); expect(parseAppearance({ pixelStyle: "x" }).pixelStyle).toBe("pixel"); });
  it("terminals and panes have their own opacity, both able to reach fully clear; a setting kept before that has the panes follow the terminals", () => {
    expect(parseAppearance({ termOpacity: 0, paneOpacity: 0 })).toMatchObject({ termOpacity: 0, paneOpacity: 0 });
    expect(parseAppearance({ termOpacity: 1, paneOpacity: 0.3 })).toMatchObject({ termOpacity: 1, paneOpacity: 0.3 });
    expect(parseAppearance({ termOpacity: 0.4 })).toMatchObject({ termOpacity: 0.4, paneOpacity: 0.4 });
    expect(parseAppearance({ paneOpacity: 9 }).paneOpacity).toBe(1);
  });
});

describe("wallpapers", () => {
  it("is the chosen file when the theme has it, else the first, else none", () => {
    expect(pickWallpaper(["0-a.jpg", "1-b.jpg"], "1-b.jpg")).toBe("1-b.jpg"); expect(pickWallpaper(["0-a.jpg"], "gone.jpg")).toBe("0-a.jpg"); expect(pickWallpaper([], "x.jpg")).toBeNull(); expect(pickWallpaper(["0-a.jpg"], null)).toBe("0-a.jpg");
  });
  it("`none` is a choice that stays: an empty wallpaper is no wallpaper, not the theme's first", () => {
    expect(parseAppearance(JSON.stringify({ wallpaper: "" })).wallpaper).toBe(""); expect(parseAppearance({ wallpaper: null }).wallpaper).toBeNull(); expect(parseAppearance({ wallpaper: 5 }).wallpaper).toBeNull();
    const a = parseAppearance({ ...DEFAULT_APPEARANCE, wallpaper: "" }); expect(parseAppearance(JSON.stringify(a)).wallpaper).toBe("");
  });
  it("the generated antiloki wallpaper is a wallpaper you can keep: it survives a reload, a script does not", () => {
    expect(parseAppearance(JSON.stringify({ wallpaper: "antiloki.svg" })).wallpaper).toBe("antiloki.svg");
    expect(parseAppearance(JSON.stringify({ wallpaper: "x.svg.sh" })).wallpaper).toBeNull();
  });
  it("addresses a wallpaper or a preview on the serve, encoded", () => {
    expect(themeFileUrl("http://x", "tokyo-night", "0-winding road.jpg")).toBe("http://x/api/v1/themes/omarchy/file?id=tokyo-night&path=backgrounds%2F0-winding%20road.jpg");
    expect(themeFileUrl("http://x", "nord", "preview.png")).toBe("http://x/api/v1/themes/omarchy/file?id=nord&path=preview.png");
  });
});
