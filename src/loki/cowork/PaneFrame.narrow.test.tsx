import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { PaneFrame } from "./PaneFrame";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const bar = () => document.querySelector('[data-testid="pane-p1"] [style*="height: 30px"]') as HTMLElement;
const frame = () => render(<PaneFrame pane={{ id: "p1", kind: "engine", engine: "claude-code", paneId: 7 } as any} title="Claude" focused={false} zoomed={false} dot="idle" onFocus={() => {}} onZoom={() => {}} onSplit={() => {}} onClose={() => {}}><div /></PaneFrame>);
describe("a narrow agent pane", () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  it("keeps the buttons that did not fit within reach of a right click, the app one among them", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 150, height: 30, top: 0, left: 0, right: 150, bottom: 30, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 150 }); Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 150 });
    try { frame(); expect(screen.queryByTestId("as-app-p1")).toBeNull(); fireEvent.contextMenu(bar()); expect(screen.getByTestId("menu-app-p1")).toHaveTextContent("open as its own app"); }
    finally { delete (HTMLElement.prototype as any).offsetWidth; delete (HTMLElement.prototype as any).clientWidth; }
  });
});
