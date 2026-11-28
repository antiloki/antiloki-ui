// @vitest-environment jsdom
// THE FLOATING ROW STAYS WHERE IT WAS (operator 2026-10-11: lowering it was tried and "before was better"; the X-ray menu moved to a right sidebar instead).
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { ViewSwitch, FLOATING_TOP } from "./view-switch";

describe("the floating switcher row", () => {
  it("sits at 8px, from one shared number", () => {
    expect(FLOATING_TOP).toBe(8);
    render(<ViewSwitch testId="sw" view="a" options={[{ key: "a", label: "A" }, { key: "b", label: "B" }] as any} onChange={() => {}} />);
    expect(screen.getByTestId("sw").style.top).toBe(`${FLOATING_TOP}px`);
  });
});
