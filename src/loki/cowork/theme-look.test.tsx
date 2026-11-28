// @vitest-environment jsdom
// "on the new themes i cant click on other pixel effects, just shadow works" (operator 2026-11-26)
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
vi.mock("./api", () => ({ listThemes: async () => ({ ok: true, current: null, themes: [{ id: "doom", name: "Doom", custom: true, look: "shadow", colors: {}, backgrounds: [] }] }) }));
import { useAppearanceState } from "./use-appearance";

afterEach(() => { cleanup(); window.localStorage.clear(); });
describe("a custom theme's own look", () => {
  it("is worn with the theme, gives way to a click, and comes back when the theme is chosen again", async () => {
    const { result } = renderHook(() => useAppearanceState(true));
    await waitFor(() => expect(result.current.themes).toBeTruthy());
    act(() => result.current.set({ themeId: "doom" })); expect(result.current.ap.pixelStyle).toBe("shadow");
    for (const s of ["pixel", "liquid", "minimal"] as const) { act(() => result.current.set({ pixelStyle: s })); expect(result.current.ap.pixelStyle).toBe(s); }
    act(() => result.current.set({ themeId: "doom" })); expect(result.current.ap.pixelStyle).toBe("shadow");
  });
});
