// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as React from "react";
import { AppConnections } from "./AppConnections";

describe("a team's web apps before a run", () => {
  afterEach(() => cleanup());
  it("shows nothing for a team with no app, one state per app, and what the person must do when not ready", () => {
    const { container, rerender } = render(<AppConnections pre={{ used: 0, ready: true, items: [], human: [] }} />); expect(container.innerHTML).toBe("");
    rerender(<AppConnections pre={{ used: 2, ready: false, items: [{ app: "linear", name: "Linear", state: "answers", nodes: ["a"], outward: false }, { app: "notion", name: "Notion", state: "needs_signin", nodes: ["b"], outward: false }], human: ["sign in to Notion"] }} />);
    expect(screen.getByTestId("app-state-linear").getAttribute("data-state")).toBe("answers"); expect(screen.getByTestId("app-state-notion").textContent).toContain("needs sign-in"); expect(screen.getByTestId("app-need").textContent).toContain("sign in to Notion");
  });
});
