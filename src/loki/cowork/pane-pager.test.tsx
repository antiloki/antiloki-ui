// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanePager } from "./PanePager";

afterEach(cleanup);
const panes = [{ id: "a", title: "Claude Code" }, { id: "b", title: "Team" }, { id: "c", title: "Terminal" }];
const drag = (el: Element, from: [number, number], to: [number, number]) => { fireEvent.touchStart(el, { touches: [{ clientX: from[0], clientY: from[1] }] }); fireEvent.touchMove(el, { touches: [{ clientX: to[0], clientY: to[1] }] }); fireEvent.touchEnd(el, { changedTouches: [{ clientX: to[0], clientY: to[1] }] }); };
it("hears a touch inside a child that stops it from bubbling (a terminal does)", () => {
  const onFocus = vi.fn(); render(<PanePager panes={panes} focusId="a" onFocus={onFocus}><div data-testid="term" onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()} /></PanePager>);
  const term = screen.getByTestId("term"); fireEvent.touchStart(term, { touches: [{ clientX: 300, clientY: 400 }] }); fireEvent.touchEnd(term, { changedTouches: [{ clientX: 100, clientY: 405 }] }); expect(onFocus).toHaveBeenCalledWith("b");
});

describe("the panes as pages on a phone", () => {
  it("a swipe left shows the next pane, a swipe right the one before, and the dots say where you are and jump on a tap", () => {
    const onFocus = vi.fn(); const { rerender } = render(<PanePager panes={panes} focusId="a" onFocus={onFocus}><div>page</div></PanePager>);
    const pager = screen.getByTestId("pane-pager"); drag(pager, [300, 400], [120, 410]); expect(onFocus).toHaveBeenLastCalledWith("b");
    rerender(<PanePager panes={panes} focusId="b" onFocus={onFocus}><div>page</div></PanePager>); drag(pager, [100, 400], [260, 395]); expect(onFocus).toHaveBeenLastCalledWith("a");
    expect(screen.getByTestId("pager-dot-b")).toHaveAttribute("aria-selected", "true"); expect(screen.getByTestId("pager-dot-b")).toHaveTextContent("Team"); fireEvent.click(screen.getByTestId("pager-dot-c")); expect(onFocus).toHaveBeenLastCalledWith("c");
  });
  it("a vertical scroll or a short touch does not switch; neither does a drag that began in a field", () => {
    const onFocus = vi.fn(); render(<PanePager panes={panes} focusId="a" onFocus={onFocus}><input data-testid="field" /></PanePager>); const pager = screen.getByTestId("pane-pager");
    drag(pager, [200, 100], [190, 500]); drag(pager, [200, 300], [170, 300]); drag(screen.getByTestId("field"), [300, 300], [100, 300]); expect(onFocus).not.toHaveBeenCalled();
  });
  it("shows no dots for one pane, and never switches with nothing to switch to", () => {
    const onFocus = vi.fn(); render(<PanePager panes={[panes[0]]} focusId="a" onFocus={onFocus}><div /></PanePager>); expect(screen.queryByTestId("pager-dots")).toBeNull(); drag(screen.getByTestId("pane-pager"), [300, 300], [50, 300]); expect(onFocus).not.toHaveBeenCalled();
  });
});
