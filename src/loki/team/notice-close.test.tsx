// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as React from "react";
import { NoticeCard } from "./NoticeHost";

describe("a team notice", () => {
  afterEach(() => cleanup());
  it("has a discreet ✕ that dismisses it", () => {
    render(<NoticeCard><div data-testid="n">the run finished</div></NoticeCard>);
    expect(screen.getByTestId("n")).toBeTruthy(); fireEvent.click(screen.getByTestId("notice-close")); expect(screen.queryByTestId("n")).toBeNull(); expect(screen.queryByTestId("notice-close")).toBeNull();
  });
});
