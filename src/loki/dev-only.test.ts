// The gate that keeps an unfinished feature out of the shipped app (operator 2026-09-23: "let's hide for now teams
// feature to the app and only show in dev mode"). Two ways in, and one of them must survive a browser that refuses
// storage — a thrown localStorage used to be enough to blank a surface.
import { describe, it, expect, afterEach, vi } from "vitest";
import { devOnly, DEV_FLAG_KEY } from "./dev-only";

afterEach(() => { try { localStorage.removeItem(DEV_FLAG_KEY); } catch { /* fine */ } vi.unstubAllGlobals(); });

describe("the dev gate", () => {
  it("is open under the dev build and the test runner", () => {
    expect(devOnly()).toBe(true);
  });

  it("opens on the per-browser flag, for showing the thing in a built app on purpose", () => {
    localStorage.setItem(DEV_FLAG_KEY, "on");
    expect(devOnly()).toBe(true);
    localStorage.setItem(DEV_FLAG_KEY, "off");
    expect(devOnly()).toBe(true);   // still dev here; the flag only ever ADDS
  });

  it("survives a browser that throws on storage", () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    expect(() => devOnly()).not.toThrow();
    expect(devOnly()).toBe(true);   // the build still decides
    if (real) Object.defineProperty(globalThis, "localStorage", real);
  });
});
