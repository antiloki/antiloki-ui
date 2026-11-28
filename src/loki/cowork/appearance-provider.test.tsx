// @vitest-environment jsdom
// THE APPEARANCE ON EVERY SCREEN (operator 2026-11-13): the palette is on the page wherever you are, the wallpaper behind every screen but Cowork, a screen asking for the appearance gets the shared one.
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

const themes = vi.fn();
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), listThemes: (...a: unknown[]) => themes(...a) }));
import { AppearanceProvider, PageBackdrop, glassShare } from "./AppearanceProvider";
import { useAppearance } from "./use-appearance";
import { APPEARANCE_KEY, bootAppearance, PALETTE_VARS } from "./appearance";

const antiapps = { id: "antiapps", name: "Antiapps", source: "downloaded", mode: "dark", colors: { background: "#111114", darker_background: "#0b0b0d", foreground: "#ecebe6", accent: "#ff4a3d" }, backgrounds: ["1-antiloki.webp", "2-antihunt.webp"], preview: true };
const wear = (extra: object = {}) => localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ themeId: "antiapps", ...extra }));
const root = () => document.documentElement;
function Wall() { const l = useAppearance(); return <i data-testid="wall">{l.wallpaperUrl ?? "none"}</i>; }
function Probe() { const l = useAppearance(); return <i data-testid="probe">{l.active?.id ?? "none"}</i>; }

beforeEach(() => { localStorage.clear(); themes.mockReset(); themes.mockResolvedValue({ current: null, themes: [antiapps], dir: "" }); });
afterEach(() => { cleanup(); for (const k of PALETTE_VARS) root().style.removeProperty(k); root().removeAttribute("data-wallpaper"); });

describe("the default wallpaper", () => {
  it("is antiloki's own red sun when no theme is worn or the machine has none, and nothing only when the person chose no wallpaper", async () => {
    themes.mockResolvedValue({ current: null, themes: [], dir: "" });
    render(<AppearanceProvider pathname="/"><Wall /></AppearanceProvider>);
    await waitFor(() => expect(themes).toHaveBeenCalled());
    expect(screen.getByTestId("wall").textContent).toMatch(/start-sun/);
    cleanup(); localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ wallpaper: "" }));
    render(<AppearanceProvider pathname="/"><Wall /></AppearanceProvider>);
    await waitFor(() => expect(themes).toHaveBeenCalled());
    expect(screen.getByTestId("wall").textContent).toBe("none");
  });
});

describe("the appearance on every screen", () => {
  it("puts the worn palette on the page from a screen that is not Cowork, and takes it off when the theme goes", async () => {
    wear();
    const { rerender } = render(<AppearanceProvider pathname="/sagas"><div /></AppearanceProvider>);
    await waitFor(() => expect(root().style.getPropertyValue("--c-brand")).toBe("#ff4a3d"));
    expect(root().style.getPropertyValue("--c-bg")).toBe("#0b0b0d");
    wear({ themeId: null });   // the person chose antiloki's own: the provider reads storage once, so remount
    cleanup(); render(<AppearanceProvider pathname="/sagas"><div /></AppearanceProvider>);
    await waitFor(() => expect(root().style.getPropertyValue("--c-brand")).toBe(""));
    void rerender;
  });
  it("draws the wallpaper behind every screen but Cowork, and glass over the pages' surfaces", async () => {
    wear();
    render(<AppearanceProvider pathname="/operations/atlas"><PageBackdrop pathname="/operations/atlas" /></AppearanceProvider>);
    const bd = await screen.findByTestId("page-backdrop");
    expect(bd.style.backgroundImage).toContain("/api/v1/themes/omarchy/file?id=antiapps&path=backgrounds%2F1-antiloki.webp");
    await waitFor(() => expect(root().getAttribute("data-wallpaper")).toBe("page"));
    expect(root().style.getPropertyValue("--aw-bg")).toBe(`${glassShare(0.75)}%`);
  });
  it("leaves Cowork to draw its own wallpaper, and 'no wallpaper' is respected", async () => {
    wear();
    render(<AppearanceProvider pathname="/"><PageBackdrop pathname="/" /></AppearanceProvider>);
    await waitFor(() => expect(themes).toHaveBeenCalled()); await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("page-backdrop")).toBeNull(); expect(root().getAttribute("data-wallpaper")).toBeNull();
    cleanup(); wear({ wallpaper: "" });
    render(<AppearanceProvider pathname="/sagas"><PageBackdrop pathname="/sagas" /></AppearanceProvider>);
    await waitFor(() => expect(themes).toHaveBeenCalled()); await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("page-backdrop")).toBeNull();
  });
  it("an embedded page (no wallpaper asked) wears the palette only", async () => {
    wear();
    render(<AppearanceProvider pathname="/embed/xray" wallpaper={false}><PageBackdrop pathname="/embed/xray" /><Probe /></AppearanceProvider>);
    await waitFor(() => expect(root().style.getPropertyValue("--c-brand")).toBe("#ff4a3d"));
    expect(root().getAttribute("data-wallpaper")).toBeNull(); expect(screen.getByTestId("probe").textContent).toBe("antiapps");
  });
  it("a screen under the provider shares its state (one fetch of the themes), one without holds its own", async () => {
    wear();
    render(<AppearanceProvider pathname="/sagas"><Probe /><Probe /></AppearanceProvider>);
    await waitFor(() => expect(screen.getAllByTestId("probe")[0].textContent).toBe("antiapps"));
    expect(themes).toHaveBeenCalledTimes(1);
    cleanup(); themes.mockClear(); render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("antiapps")); expect(themes).toHaveBeenCalledTimes(1);
  });
  it("the palette last worn is on the page before React paints, and only colour values of known names are taken", () => {
    localStorage.setItem("antiloki.cowork.appearance.vars", JSON.stringify({ "--c-brand": "#ff4a3d", "--c-bg": "url(http://x/y)", "--evil": "#fff", "--c-fg": "#ecebe6" }));
    bootAppearance();
    expect(root().style.getPropertyValue("--c-brand")).toBe("#ff4a3d"); expect(root().style.getPropertyValue("--c-fg")).toBe("#ecebe6");
    expect(root().style.getPropertyValue("--c-bg")).toBe(""); expect(root().style.getPropertyValue("--evil")).toBe("");
  });
});
