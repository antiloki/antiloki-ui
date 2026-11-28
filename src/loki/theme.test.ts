// The theme module is the whole app's colour surface. Two things must hold: an unknown or corrupt
// stored key can never leave the app unstyled, and applying a theme must REMOVE the previous class
// (two theme classes on <html> at once is a silent, hard-to-spot visual bug).
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { C, THEMES, getTheme, applyTheme, mono, nav } from "./theme";

const classes = () => Array.from(document.documentElement.classList);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
});
afterEach(() => vi.restoreAllMocks());

describe("the token map", () => {
  it("resolves every token to a CSS variable, so themes can switch at runtime", () => {
    // A literal colour here would be frozen at build time and ignore the theme class entirely.
    for (const [name, value] of Object.entries(C)) {
      expect(value, `${name} must be a var()`).toMatch(/^var\(--c-[a-z0-9]+\)$/);
    }
  });

  it("exposes the tokens screens actually depend on", () => {
    for (const k of ["bg", "panel", "border", "fg", "dim", "ok", "warn", "bad", "brand"]) {
      expect(C).toHaveProperty(k);
    }
  });
});

describe("the theme catalogue", () => {
  it("has unique keys — a duplicate would make one theme unreachable in settings", () => {
    const keys = THEMES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every theme a label and a hint for the settings list", () => {
    for (const t of THEMES) {
      expect(t.label.trim().length).toBeGreaterThan(0);
      expect(t.hint.trim().length).toBeGreaterThan(0);
    }
  });

  it("contains the default", () => {
    expect(THEMES.map((t) => t.key)).toContain("ember");
  });
});

describe("getTheme", () => {
  it("defaults to ember when nothing is stored", () => {
    expect(getTheme()).toBe("ember");
  });

  it("returns a stored key that is in the catalogue", () => {
    localStorage.setItem("antiloki-theme", "nord");
    expect(getTheme()).toBe("nord");
  });

  it("REJECTS a stored key that is not in the catalogue", () => {
    // Otherwise a removed theme leaves the app with a class that no stylesheet defines.
    localStorage.setItem("antiloki-theme", "theme-from-a-past-build");
    expect(getTheme()).toBe("ember");
  });

  it("falls back to ember when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(getTheme()).toBe("ember");
  });
});

describe("applyTheme", () => {
  it("puts exactly one theme class on the document element", () => {
    applyTheme("nord");
    expect(classes()).toEqual(["theme-nord"]);
  });

  it("REMOVES the previous theme class when switching", () => {
    applyTheme("nord");
    applyTheme("dracula");
    expect(classes()).toEqual(["theme-dracula"]);
    expect(classes().filter((c) => c.startsWith("theme-"))).toHaveLength(1);
  });

  it("coerces an unknown key to ember rather than applying a dead class", () => {
    applyTheme("not-a-theme");
    expect(classes()).toEqual(["theme-ember"]);
  });

  it("persists the choice so it survives a reload", () => {
    applyTheme("gruvbox");
    expect(localStorage.getItem("antiloki-theme")).toBe("gruvbox");
    expect(getTheme()).toBe("gruvbox");
  });

  it("still applies the class when persistence fails (private mode)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => applyTheme("nord")).not.toThrow();
    expect(classes()).toEqual(["theme-nord"]);
  });

  it("leaves unrelated classes on <html> alone", () => {
    document.documentElement.classList.add("dark", "js-enabled");
    applyTheme("nord");
    expect(classes()).toEqual(expect.arrayContaining(["dark", "js-enabled", "theme-nord"]));
  });

  it("every catalogued theme round-trips through apply → get", () => {
    for (const t of THEMES) {
      applyTheme(t.key);
      expect(getTheme()).toBe(t.key);
      expect(classes()).toContain(`theme-${t.key}`);
    }
  });
});

describe("font stacks", () => {
  it("both end in a generic family so text renders before webfonts load", () => {
    expect(mono).toMatch(/monospace$/);
    expect(nav).toMatch(/sans-serif$/);
  });
});
