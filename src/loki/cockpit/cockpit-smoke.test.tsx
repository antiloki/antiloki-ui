// SMOKE (2026-07-14, "all the buttons don't show"): CockpitView must RENDER —
// list view and session view — with a stubbed API. A runtime crash here is the
// blank-screen class tsc can't catch.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/loki/api/client", () => ({
  unwrapResult: (r: any) => (r?.result ?? r) ?? null, // real impl — components import it from the mocked module
  apiPost: vi.fn(async (url: string) => {
    if (url.endsWith("/cockpit/session/get")) return {
      session: { id: 1, name: "smoke", status: "active", mode: "steer", mission_md: "", board_json: JSON.stringify({ frames: [{ id: 9, x: 10, y: 10, w: 400, h: 300, title: "g", color: "#888" }], binds: [[11, 12]], splits: [[11, 12]] }) },
      panes: [
        { id: 11, idx: 0, subagent_name: "a", pane_kind: "agent", scope: [], grants: [], status: "idle", settings_json: JSON.stringify({ x: 20, y: 20 }) },
        { id: 12, idx: 1, subagent_name: "b", pane_kind: "kanban", scope: [], grants: [], status: "idle", settings_json: null },
      ],
      coordination: [], notes: [], claims: [],
    };
    if (url.endsWith("/cockpit/session/get") === false && url.endsWith("/overview")) return { sessions: [] };
    if (url.endsWith("/codebase/get")) return { nodes: [], file_tokens: {} };
    if (url.endsWith("/blackboard/read")) return { mission_md: "", context_docs: [], coordination: [], scratch: [] };
    return { ok: true, sessions: [{ id: 1, name: "smoke", status: "active", mode: "steer", created_at: "2026-07-14" }] };
  }),
  apiGet: vi.fn(async () => ({ ok: true, rows: [], sessions: [] })),
  isNotWired: () => false,
}));
vi.mock("@/loki/shell/slug-context", () => ({ useShell: () => ({ setRailCollapsed: () => {} }) }));

import { CockpitView } from "./cockpit-view";

describe("cockpit smoke", () => {
  it("renders the vibe screen without crashing (list view)", async () => {
    render(<CockpitView />);
    // the goal bar moved ONTO the dock field (operator 2026-07-20: one universal
    // composer) — the dashboard registers its concierge surface on the dock
    // store instead of rendering an input of its own.
    const { dockStore } = await import("@/loki/shell/dock-store");
    await vi.waitFor(() => { expect(dockStore.get().surface?.placeholder).toMatch(/what do you want to ship/i); });
  });
});
