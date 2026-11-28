import { describe, it, expect } from "vitest";
import { dress, installWindowShell, isScrim, SHELL_CSS } from "./window-shell";

describe("the window box", () => {
  it("knows a full-screen scrim from a window", () => { expect(isScrim({ width: 1440, height: 900 }, { width: 1440, height: 900 })).toBe(true); expect(isScrim({ width: 400, height: 300 }, { width: 1440, height: 900 })).toBe(false); });
  it("dresses a window or a menu that opens, leaves its content alone, and skips one that asks", async () => {
    const real = window.getComputedStyle; window.getComputedStyle = (() => ({ getPropertyValue: () => "" })) as never;   // jsdom cannot read colour-mix gradients
    installWindowShell(); expect(document.getElementById("antiloki-window-shell")?.textContent).toContain("backdrop-filter");
    const d = document.createElement("div"); d.setAttribute("role", "dialog"); d.innerHTML = "<p id='inner'>content</p>"; document.body.appendChild(d); const m = document.createElement("div"); m.setAttribute("role", "menu"); document.body.appendChild(m);
    const no = document.createElement("div"); no.setAttribute("role", "dialog"); no.setAttribute("data-no-shell", ""); document.body.appendChild(no); await new Promise((r) => setTimeout(r, 20));
    expect(d.classList.contains("aw-win")).toBe(true); expect(m.classList.contains("aw-win")).toBe(true); expect(no.classList.contains("aw-win")).toBe(false); expect(document.getElementById("inner")?.className).toBe(""); window.getComputedStyle = real;
  });
  it("has a touch for each look", () => { for (const l of ["pixel", "shadow", "liquid", "minimal"]) expect(SHELL_CSS).toContain(`data-look=${l}`); });
});
