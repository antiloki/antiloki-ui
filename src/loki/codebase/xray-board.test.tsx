import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const post = vi.fn();
vi.mock("@/loki/api/client", () => ({ BE_URL: "http://be", apiPost: (...a: unknown[]) => post(...a), apiGet: vi.fn(), getRequestWorkspace: () => "", setRequestWorkspace: () => {} }));
import { XrayBoard, snap, WidgetView } from "./xray-board";

const W = [{ id: "laws", title: "Laws", source: "laws", view: "list", base: true }, { id: "git", title: "Git", source: "git", view: "table", base: true }];
let grid: any[]; let n: number; const calls: any[] = [];
beforeEach(() => {
  post.mockReset(); calls.length = 0; grid = [{ widget: "laws", x: 0, y: 0, w: 6, h: 3 }, { widget: "git", x: 6, y: 0, w: 6, h: 3 }]; n = 0;
  post.mockImplementation(async (_u: string, b: any) => { calls.push(b);
    switch (b.op) {
      case "widgets": return { ok: true, widgets: W, packages: [], proposals: [{ name: "health", version: "1", widgets: 2 }], renderers: ["text", "list", "table"] };
      case "layout": return { ok: true, screen: "home", n, by: "default", grid };
      case "views": return { ok: true, views: [] };
      case "data": return b.id === "laws" ? { ok: true, id: "laws", title: "Laws", view: "list", data: { items: ["law one", "law two"] } } : { ok: true, id: "git", title: "Git", view: "table", data: { columns: ["sha", "subject"], rows: [["a1", "first"], ["b2", "second"]] } };
      case "layout_set": grid = b.grid; n += 1; return { ok: true, layout: { screen: "home", n, by: "person", grid } };
      case "layout_undo": n += 1; return { ok: true, layout: { screen: "home", n, by: "person", grid } };
      case "install": return b.proposal === "health" ? { ok: true, installed: "health" } : { ok: false, error: "no proposal" };
      default: return { ok: false, error: `unexpected ${b.op}` };
    }
  });
});

describe("the X-ray board", () => {
  it("draws each declared widget with its fixed renderer, from what the serve shaped", async () => {
    render(<XrayBoard />); expect(await screen.findByText("law two")).toBeTruthy(); expect(await screen.findByText("second")).toBeTruthy();
    expect(screen.getByTestId("board-cell-laws")).toHaveTextContent("base"); expect(screen.getByTestId("board-cell-git")).toHaveTextContent("subject");
  });
  it("takes a widget off the board as a saved version, and undo asks the serve", async () => {
    render(<XrayBoard />); await screen.findByText("law two"); fireEvent.click(screen.getByTestId("board-arrange")); fireEvent.click(screen.getByLabelText("take laws off the board"));
    await waitFor(() => expect(calls.some((c) => c.op === "layout_set" && c.grid.length === 1 && c.grid[0].widget === "git")).toBe(true)); expect(await screen.findByTestId("board-msg")).toHaveTextContent("saved version 1");
    fireEvent.click(screen.getByTestId("board-undo")); await waitFor(() => expect(calls.some((c) => c.op === "layout_undo")).toBe(true));
  });
  it("shows a proposal waiting in the store and installs it only on the person's click", async () => {
    render(<XrayBoard />); await screen.findByText("law two"); fireEvent.click(await screen.findByTestId("board-store")); const p = await screen.findByTestId("proposal-health");
    expect(calls.some((c) => c.op === "install")).toBe(false); fireEvent.click(p.querySelector("button")!); await waitFor(() => expect(calls.some((c) => c.op === "install" && c.proposal === "health")).toBe(true));
  });
  it("snaps a drag to whole columns and rows inside the twelve columns, and draws a misfit as its reason", () => {
    const c = { widget: "a", x: 2, y: 1, w: 4, h: 2 };
    expect(snap(c, 160, 152, 80, "move")).toEqual({ ...c, x: 4, y: 3 }); expect(snap(c, 4000, -9000, 80, "move")).toEqual({ ...c, x: 8, y: 0 }); expect(snap(c, 400, 76, 80, "resize")).toEqual({ ...c, w: 9, h: 3 }); expect(snap(c, -9999, -9999, 80, "resize")).toEqual({ ...c, w: 1, h: 1 });
    const { container } = render(<WidgetView res={{ ok: false, error: "this source's answer is not JSON" }} />); expect(container).toHaveTextContent("not JSON");
  });
});

describe("a part of X-ray is a slot", () => {
  it("draws the built-in until a widget is put in its place, and restores it", async () => {
    const { SlotFrame } = await import("./xray-slot"); let replaced: string | null = null;
    post.mockImplementation(async (_u: string, b: any) => { switch (b.op) {
      case "slots": return { ok: true, slots: [{ slot: "overview", about: "x", state: replaced ? "replaced" : "built-in", widget: replaced, from: replaced ? "workspace" : "default" }] };
      case "widgets": return { ok: true, widgets: [{ id: "mine", title: "Mine", source: "digest", view: "text" }] };
      case "slot_set": replaced = b.widget; return { ok: true };
      case "slot_reset": replaced = null; return { ok: true };
      case "data": return { ok: true, id: "mine", view: "text", data: { text: "my own overview" } };
      default: return { ok: false, error: "x" }; } });
    render(<SlotFrame slot="overview"><div>the built-in overview</div></SlotFrame>); expect(screen.getByText("the built-in overview")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("slot-menu")); fireEvent.click(await screen.findByTestId("slot-pick-mine")); expect(await screen.findByText("my own overview")).toBeTruthy(); expect(screen.queryByText("the built-in overview")).toBeNull();
    fireEvent.click(screen.getByTestId("slot-menu")); fireEvent.click(await screen.findByTestId("slot-restore")); expect(await screen.findByText("the built-in overview")).toBeTruthy();
  });
});

describe("the media renderer", () => {
  it("plays a video, frames a page, and shows a picture from what the teams made", () => {
    const { container } = render(<WidgetView res={{ ok: true, view: "media", data: { items: [{ run: "r1", kind: "video", name: "out/a.mp4", file: "kept/out/a.mp4" }, { run: "r1", kind: "page", name: "video/index.html", file: "kept/video/index.html" }, { run: "r1", kind: "picture", name: "p.png", file: "kept/p.png" }] } }} />);
    expect(container.querySelector("video")).toBeTruthy(); expect(container.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts"); expect(container.querySelector("img")).toBeTruthy(); expect(container.querySelector("video")?.getAttribute("src")).toContain("file=kept%2Fout%2Fa.mp4");
  });
});

describe("the built-in parts on the board", () => {
  it("draws a built-in part by name, in the cell, with its own component", async () => {
    vi.resetModules(); vi.doMock("./xray-embed", () => ({ XrayView: ({ q }: { q: { view: string } }) => <div>real {q.view} component</div> })); const { WidgetView: Fresh } = await import("./xray-board");
    const { container } = render(<Fresh res={{ ok: true, view: "component", data: { name: "rules" } }} />); expect(await screen.findByText("real rules component")).toBeTruthy(); expect(container.querySelector("[data-testid=builtin-rules]")).toBeTruthy();
  });
});

describe("the board's screens", () => {
  it("shows a team's screens as tabs and asks the serve for the one chosen", async () => {
    post.mockImplementation(async (_u: string, b: any) => { calls.push(b); if (b.op === "widgets") return { ok: true, widgets: [], packages: [], proposals: [] }; if (b.op === "layout") return { ok: true, screen: b.screen, n: 0, by: "default", grid: [] }; if (b.op === "views") return { ok: true, views: [] }; return { ok: true }; });
    calls.length = 0; render(<XrayBoard screen="team-a" lockScreen screens={[{ screen: "team-a", label: "Overview" }, { screen: "team-a-parts", label: "Parts" }]} />);
    fireEvent.click(await screen.findByTestId("board-screen-parts")); await waitFor(() => expect(calls.some((c) => c.op === "layout" && c.screen === "team-a-parts")).toBe(true));
  });
});

describe("the team's tree", () => {
  it("is the team's own thread tree, matched by name (a fork keeps its family)", async () => {
    const { treeOfTeam } = await import("./xray-tree"); const t = [{ thread: "ministore-video", root: "/t/a", files: 2, last: "" }, { thread: "video-editing", root: "/t/b", files: 1, last: "x" }];
    expect(treeOfTeam(t, "Video editing")?.root).toBe("/t/b"); expect(treeOfTeam(t, "Video editing--t-test")?.root).toBe("/t/b"); expect(treeOfTeam(t, "Nothing")).toBeNull();
  });
});

describe("the files of a space with no index", () => {
  it("lists the files and previews a page working", async () => {
    vi.doMock("@/loki/api/codebase", () => ({ fileRead: async () => ({ content: "<p>hello video</p>" }), getAtlas: vi.fn(), onboardStart: vi.fn() }));
    post.mockImplementation(async (_u: string, b: any) => (b.op === "tree_files" ? { ok: true, files: [{ path: "video/index.html", kb: 2.8, kind: "page" }, { path: "README.md", kb: 0.1, kind: "document" }] } : { ok: false }));
    const { TreeFiles } = await import("./tree-files"); render(<TreeFiles space="/tree" />);
    expect(await screen.findByTestId("tree-file-video/index.html")).toBeTruthy(); expect(await screen.findByTestId("tree-preview")).toBeTruthy(); fireEvent.click(screen.getByTestId("tree-mode-code")); await waitFor(() => expect(screen.queryByTestId("tree-preview")).toBeNull());
  });
});

describe("the X-ray screen's drawings", () => {
  it("lays a treemap inside its box, counts growth over the runs, and fills the week", async () => {
    const { treemap, growth, week } = await import("./xray-dashboard");
    const cells = treemap([{ key: "a", w: 6 }, { key: "b", w: 3 }, { key: "c", w: 1 }], 0, 0, 100, 50); expect(cells).toHaveLength(3); expect(cells.reduce((a, c) => a + c.w * c.h, 0)).toBeCloseTo(5000, 3); expect(cells.every((c) => c.x >= 0 && c.y >= 0 && c.x + c.w <= 100.0001 && c.y + c.h <= 50.0001)).toBe(true); expect(cells[0].key).toBe("a");
    const runs = [{ run: "r2", started: 2000 }, { run: "r1", started: 1000 }] as any; const g = growth({ runs, outputs: [{ run: "r1" }, { run: "r1" }, { run: "r2" }] as any }); expect(g).toEqual([{ t: 1000, n: 2 }, { t: 2000, n: 3 }]);
    const now = new Date(2026, 10, 19, 12).getTime(); const w = week([{ run: "x", started: now - 3600_000, status: "done", spent_usd: 0, team: "", ask: "" }, { run: "y", started: now - 3 * 86_400_000, status: "done", spent_usd: 0, team: "", ask: "" }] as any, now); expect(w).toHaveLength(7); expect(w[6].runs).toHaveLength(1); expect(w[3].runs).toHaveLength(1);
  });
});

describe("the code analysis on the X-ray screen", () => {
  it("draws health, the laws hit and who wrote it from the analysis, only when there is one", async () => {
    const { XrayDashboard } = await import("./xray-dashboard"); const base = { ok: true, now: 1795100000000, runs: [], outputs: [], stats: { files: 3 }, kinds: {}, files: [], commits: [] };
    post.mockImplementation(async () => ({ ...base, health: { report: { summary: { health: 76, violations: 12, axes_avg: { tests: 28, structure: 82 } }, by_law: [{ law_key: "k", title: "No swallowed errors", category: "correctness", n: 36, mass: 288 }] }, smells: { counts: { orphan: 5, "god-file": 2, total: 7 }, smells: [{ kind: "god-file", severity: "high", nodes: ["src/big.rs"], detail: "" }] }, authors: { commit_count: 10, authors: [{ id: "a", name: "Ana", commits: 9, files: 4, solo: 3, first: "", last: "" }], bus_factor: { total_files: 4, solo_files: 3 } } } }));
    const { container } = render(<XrayDashboard />); expect(await screen.findByTestId("xd-health")).toBeTruthy(); expect(container.textContent).toContain("No swallowed errors"); expect(container.textContent).toContain("src/big.rs"); expect(container.textContent).toContain("Ana"); expect(container.textContent).toContain("3 of 4 files have one author");
  });
  it("shows no health section for a space that was never indexed", async () => {
    const { XrayDashboard } = await import("./xray-dashboard"); post.mockImplementation(async () => ({ ok: true, now: 1, runs: [], outputs: [], stats: {}, kinds: {}, files: [], commits: [], health: { report: null, smells: null, authors: null } }));
    render(<XrayDashboard />); await screen.findByTestId("xray-dashboard"); expect(screen.queryByTestId("xd-health")).toBeNull();
  });
});

describe("stars and the jump menu on the X-ray screen", () => {
  const data = { ok: true, now: 1795100000000, runs: [], outputs: [], stats: {}, kinds: {}, files: [{ path: "a.md", kb: 1, kind: "document" }], commits: [], health: null };
  it("filters the menu by what is typed", async () => {
    const { filterJumps } = await import("./xray-dashboard"); const items = [{ id: "made", label: "Made" }, { id: "runs", label: "Runs" }, { id: "laws", label: "Laws hit" }];
    expect(filterJumps(items, "ru").map((i) => i.id)).toEqual(["runs"]); expect(filterJumps(items, "").length).toBe(3); expect(filterJumps(items, "zzz")).toEqual([]);
  });
  it("opens on Ctrl+K, goes to a section on Enter, and stars move a section to the top", async () => {
    const { XrayDashboard } = await import("./xray-dashboard"); post.mockImplementation(async () => data); localStorage.removeItem("antiloki.xray.stars"); const scroll = vi.fn(); (Element.prototype as any).scrollIntoView = scroll;
    const { container } = render(<XrayDashboard />); await screen.findByTestId("xd-sec-runs");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true }); const input = await screen.findByTestId("xd-jump-input"); fireEvent.change(input, { target: { value: "files" } }); fireEvent.keyDown(input, { key: "Enter" }); expect(scroll).toHaveBeenCalled(); await waitFor(() => expect(screen.queryByTestId("xd-jump")).toBeNull());
    expect(screen.getByTestId("xd-sec-history").style.order).toBe("0"); fireEvent.click(screen.getByTestId("xd-star-history")); expect(screen.getByTestId("xd-sec-history").style.order).toBe("-1"); expect(screen.getByTestId("xd-sec-history").getAttribute("data-starred")).toBe("1"); expect(JSON.parse(localStorage.getItem("antiloki.xray.stars") ?? "[]")).toEqual(["history"]); void container;
  });
});
