// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as React from "react";
import { SoonBlur } from "./soon-blur";

afterEach(() => cleanup());
describe("SoonBlur", () => {
  it("draws the whole page behind a blur nobody can click, with a Soon card on top", () => {
    render(<SoonBlur on title="Ultra review is coming soon"><button data-testid="real">the real page</button></SoonBlur>);
    expect(screen.getByTestId("real")).toBeTruthy();   // the page is there
    expect(screen.getByTestId("real").closest("[aria-hidden]")).toBeTruthy();   // but hidden from assistive tech
    expect((screen.getByTestId("real").closest("[aria-hidden]") as HTMLElement).style.pointerEvents).toBe("none");
    expect(screen.getByTestId("soon-overlay").textContent).toMatch(/soon/i);
    expect(screen.getByTestId("soon-overlay").textContent).toMatch(/Ultra review is coming soon/);
  });
  it("is just the page when it is on for real (the dev build)", () => {
    render(<SoonBlur on={false} title="x"><button data-testid="real">the real page</button></SoonBlur>);
    expect(screen.queryByTestId("soon-overlay")).toBeNull();
    expect(screen.getByTestId("real").closest("[aria-hidden]")).toBeNull();
  });
});
