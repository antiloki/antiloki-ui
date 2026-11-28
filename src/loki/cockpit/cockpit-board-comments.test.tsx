// BOARD COMMENTS smoke (2026-07-16): the session BOARD must render sticky-note
// comments from board_json — pane-, book- and frame-anchored arrows included —
// plus the "✎ + comment" control. Same blank-screen class as cockpit-smoke,
// one level deeper (the board view).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const BOARD = JSON.stringify({
  frames: [{ id: 9, x: 10, y: 400, w: 400, h: 300, title: "g", color: "#888" }],
  binds: [[11, 12]],
  splits: [],
  comments: [
    { id: 5, x: 900, y: 30, text: "ship this first", color: "#888", target: { kind: "pane", id: 11 } },
    { id: 6, x: 900, y: 160, text: "the whole book", color: "#888", target: { kind: "bind", id: 12 } },
    { id: 7, x: 900, y: 290, text: "this group waits", color: "#888", target: { kind: "frame", id: 9 } },
    { id: 8, x: 900, y: 420, text: "free-floating", color: "#888" },
  ],
});

vi.mock("@/loki/api/client", () => ({
  unwrapResult: (r: any) => (r?.result ?? r) ?? null, // real impl — components import it from the mocked module
  apiPost: vi.fn(async (url: string, body?: any) => {
    if (url.endsWith("/cockpit/session/get")) {
      if (body?.id) return {
        session: { id: 1, name: "smoke", status: "active", mode: "steer", mission_md: "", board_json: BOARD },
        panes: [
          { id: 11, idx: 0, subagent_name: "a", pane_kind: "agent", scope: [], grants: [], status: "idle", settings_json: JSON.stringify({ x: 20, y: 20 }) },
          { id: 12, idx: 1, subagent_name: "b", pane_kind: "kanban", scope: [], grants: [], status: "idle", settings_json: null },
        ],
        coordination: [], notes: [], claims: [],
      };
      return { sessions: [{ id: 1, name: "smoke", status: "active", mode: "steer", created_at: "2026-07-16" }] };
    }
    if (url.endsWith("/cockpit/overview")) return { sessions: [{ id: 1, name: "smoke", status: "active", mode: "steer", panes: 2, calls: 0, cost_usd: 0, created_at: "2026-07-16" }], totals: { sessions: 1, active: 1, panes: 2, calls: 0, cost_usd: 0 } };
    if (url.endsWith("/codebase/get")) return { nodes: [], file_tokens: {} };
    if (url.endsWith("/blackboard/read")) return { mission_md: "", context_docs: [], coordination: [], scratch: [] };
    return { ok: true };
  }),
  apiGet: vi.fn(async () => ({ ok: true, rows: [], sessions: [] })),
  isNotWired: () => false,
}));
vi.mock("@/loki/shell/slug-context", () => ({ useShell: () => ({ setRailCollapsed: () => {} }) }));

import { CockpitView } from "./cockpit-view";

describe("board comments", () => {
  it("renders the notes + arrows on the session board", async () => {
    render(<CockpitView />);
    fireEvent.click((await screen.findAllByText("smoke"))[0]);
    const notes = await screen.findAllByTestId("board-comment");
    expect(notes.length).toBe(4);
    expect(screen.getByText("ship this first")).toBeTruthy();
    expect(screen.getByText("the whole book")).toBeTruthy();
    expect(screen.getByText("this group waits")).toBeTruthy();
    expect(screen.getByText("✎ + comment")).toBeTruthy();
  });
});
