import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { TooltipHost, keyLabel, tipOf, SHOW_MS } from "./tooltip-host";

afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("tooltips", () => {
  it("reads words from data-tip or title, the keys from data-keys, and Mod is the platform's own key", () => {
    const b = document.createElement("button"); b.setAttribute("title", "split"); b.setAttribute("data-keys", "Mod K"); expect(tipOf(b)).toEqual({ text: "split", keys: ["Mod", "K"] });
    b.setAttribute("data-tip", "wins"); expect(tipOf(b)!.text).toBe("wins"); expect(tipOf(document.createElement("i"))).toBeNull(); expect(keyLabel("Mod", true)).toBe("⌘"); expect(keyLabel("Mod", false)).toBe("Ctrl"); expect(keyLabel("K", true)).toBe("K");
  });
  it("a control inside a titled bar wears an empty title, so the browser shows neither card, and loses it on leave", () => {
    vi.useFakeTimers(); render(<div><TooltipHost /><div title="drag the header"><button data-testid="c" data-tip="Open as its own app">a</button><button data-testid="d" title="full screen">f</button></div></div>);
    const c = screen.getByTestId("c"); fireEvent.mouseOver(c); act(() => { vi.advanceTimersByTime(SHOW_MS + 10); }); expect(c.getAttribute("title")).toBe(""); expect(screen.getByTestId("tooltip")).toHaveTextContent("Open as its own app");
    const d = screen.getByTestId("d"); fireEvent.mouseOver(d); act(() => { vi.advanceTimersByTime(SHOW_MS + 10); }); expect(c.getAttribute("title")).toBeNull(); expect(d.getAttribute("title")).toBe(""); expect(screen.getByTestId("tooltip")).toHaveTextContent("full screen");
  });
  it("shows after a short wait with the words and keys, keeps the title as it was, and goes away on leave and on Escape", () => {
    vi.useFakeTimers(); render(<div><TooltipHost /><button data-testid="b" title="Command menu" data-keys="Mod K">⌕</button></div>);
    const b = screen.getByTestId("b"); fireEvent.mouseOver(b); expect(b.getAttribute("title")).toBe(""); expect(screen.queryByTestId("tooltip")).toBeNull();   // not at once: it never flickers, and the browser's own card is held back
    act(() => { vi.advanceTimersByTime(SHOW_MS + 10); }); expect(screen.getByTestId("tooltip")).toHaveTextContent("Command menu"); expect(screen.getByTestId("tooltip").querySelector("kbd")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" }); expect(screen.queryByTestId("tooltip")).toBeNull(); expect(b.getAttribute("title")).toBe("Command menu");
    fireEvent.mouseOver(b); act(() => { vi.advanceTimersByTime(SHOW_MS + 10); }); expect(screen.getByTestId("tooltip")).toBeTruthy(); fireEvent.mouseOver(document.body); expect(screen.queryByTestId("tooltip")).toBeNull();
  });
});
