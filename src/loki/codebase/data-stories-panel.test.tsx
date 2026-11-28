// @vitest-environment jsdom
// AI-SCRAPED STORIES (2026-09-19): the engine's journeys become proposals only where every hop is a
// real atlas file; a story keeps ≥ 2 resolved hops. The deterministic proposals stay as they were.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

let reply: any;
vi.mock("@/loki/api/engine", () => ({ askEngine: vi.fn(async () => reply) }));
vi.mock("@/loki/api/codebase", () => ({
  storyList: vi.fn(async () => ({ stories: [{ id: 1, name: "login", direction: "forward", hop_count: 3 }], count: 1 })),
  storyPropose: vi.fn(async () => ({ proposals: [] })), storyGet: vi.fn(async () => null), storyAdd: vi.fn(async () => ({ id: 2 })), storyDelete: vi.fn(async () => ({ ok: true })),
}));
vi.mock("./atlas-graph", () => ({ AtlasGraphMini: () => null, layoutDiagram: () => ({ boxes: [], arrows: [] }), roleOfPath: () => "other", DIAG_ROLE: {} }));
import { DataStoriesPanel, storyAsk, scrapedToProposals } from "./data-stories-panel";

const atlas: any = { nodes: [{ id: "n1", path: "src/api.ts", type: "file" }, { id: "n2", path: "src/store.ts", type: "file" }, { id: "n3", path: "src/db.ts", type: "file" }], edges: [] };
beforeEach(() => { reply = { ok: true, json: { stories: [
  { name: "checkout", description: "cart → order row", direction: "forward", hops: [{ path: "./src/api.ts", label: "receives" }, { path: "src/ghost.ts" }, { path: "src/db.ts", label: "inserts" }] },
  { name: "one-hop", hops: [{ path: "src/api.ts" }] },
  { name: "junk" },
] }, text: "", engine: "claude-code", ms: 1 }; });

describe("scrapedToProposals / storyAsk — pure", () => {
  it("resolves paths to atlas ids, drops unknown hops, keeps ≥2-hop stories; the call carries the known files and stories", () => {
    const m = new Map<string, string>(atlas.nodes.map((n: any) => [n.path, n.id] as [string, string]));
    const { proposals, dropped } = scrapedToProposals(reply.json, m);
    expect(proposals).toEqual([{ name: "checkout", description: "cart → order row", direction: "forward", hops: [{ node_id: "n1", label: "receives" }, { node_id: "n3", label: "inserts" }] }]);
    expect(dropped).toBe(1);
    // the text lives in the serve's prompt catalog (xray.data_stories); the FE sends the known files and the saved stories
    expect(storyAsk(["src/api.ts"], ["login"])).toEqual({ template: "xray.data_stories", vars: { known: "src/api.ts", have: "login" } });
    expect(storyAsk([], []).vars).toEqual({ known: "", have: "" });
  });
});

describe("the ◆ AI scrape button", () => {
  it("adds the engine's journeys to the proposals with a note, saved stories untouched; a failure is an error line", async () => {
    render(<DataStoriesPanel atlas={atlas} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/saved stories \(1\)/)).toBeTruthy());
    fireEvent.click(screen.getByTestId("stories-ai-scrape"));
    await waitFor(() => expect(screen.getByTestId("stories-ai-note").textContent).toContain("1 AI-scraped story added"));
    expect(screen.getByTestId("stories-ai-note").textContent).toContain("1 hop the atlas does not know");
    expect(screen.getByText("checkout")).toBeTruthy();
    reply = { ok: false, error: "no text", engine: "codex", ms: 1 };
    fireEvent.click(screen.getByTestId("stories-ai-scrape"));
    await waitFor(() => expect(screen.getByText(/AI scrape failed — no text/)).toBeTruthy());
  });
});
