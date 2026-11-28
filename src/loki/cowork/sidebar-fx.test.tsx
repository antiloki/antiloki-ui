import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SideFx, onRowStyle } from "./sidebar-fx";
import { LookContext } from "./use-appearance";

const withLook = (pixelStyle: string, ui: React.ReactElement) => render(<LookContext.Provider value={{ ap: { pixelStyle } } as never}>{ui}</LookContext.Provider>);
describe("the sidebar in the three looks", () => {
  it("pixelated: a dither behind the row; shadow: a soft cloud; minimal: nothing drawn", () => {
    const a = withLook("pixel", <SideFx color="#f26b21" running />); expect(screen.getByTestId("side-fx").getAttribute("data-style")).toBe("pixel"); expect((screen.getByTestId("side-fx") as HTMLElement).style.imageRendering).toBe("pixelated"); a.unmount();
    const b = withLook("shadow", <SideFx color="#f26b21" />); expect(screen.getByTestId("side-fx").getAttribute("data-style")).toBe("shadow"); b.unmount();
    const l = withLook("liquid", <SideFx color="#f26b21" running />); expect(screen.getByTestId("side-fx").getAttribute("data-style")).toBe("liquid"); l.unmount();
    const c = withLook("minimal", <SideFx color="#f26b21" />); expect(screen.queryByTestId("side-fx")).toBeNull(); c.unmount();
  });
  it("a row that is on draws only a coloured border in the minimal look, and gets room for the effect in the others", () => {
    expect(onRowStyle("minimal", "#f26b21")).toMatchObject({ background: "transparent", outline: "1px solid #f26b21" }); expect(onRowStyle("pixel", "#f26b21")).toMatchObject({ position: "relative", overflow: "hidden", isolation: "isolate" }); expect(onRowStyle("shadow", "#f26b21").outline).toBeUndefined();
  });
});
