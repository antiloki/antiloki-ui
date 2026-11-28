// @vitest-environment jsdom
// EVERY ENGINE SEAT HAS A PANE (operator 2026-09-30: "'cursor' runs in the cockpit - it needs a worktree/agent session, so open it there. The agent just disappeared on Main").
// The pane switch named four engines; a Cursor, Gemini or Grok agent fell through to a placeholder sentence instead of its own pane.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

vi.mock("@/loki/api/client", () => ({
  apiGet: vi.fn(async () => ({})),
  apiPost: vi.fn(async () => { throw new Error("offline"); }),   // the pane may fail to provision here; what matters is that it TRIES (it is not the placeholder)
}));
import { CockpitPaneBody } from "./cockpit-pane-body";

describe("CockpitPaneBody", () => {
  for (const kind of ["claude-code", "codex", "opencode", "cursor", "gemini", "grok"]) {
    it(`${kind} is an agent pane, never the 'runs in the cockpit' placeholder`, () => {
      render(<CockpitPaneBody kind={kind as any} sessionId={1} paneId={1} />);
      expect(screen.queryByText(/runs in the cockpit/)).toBeNull();
    });
  }
  it("a kind that is not a seat or a tool still gets the placeholder (so the test above can fail)", () => {
    render(<CockpitPaneBody kind={"nonsense" as any} sessionId={1} paneId={1} />);
    expect(screen.getByText(/runs in the cockpit/)).toBeTruthy();
  });
});
