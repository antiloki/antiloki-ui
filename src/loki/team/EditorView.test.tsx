import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import * as React from "react";

const EV = [
  { i: 0, t_ms: 1000, node: "front", kind: "write", file: "src/a.ts", text: "const a = 1;\nconst b = 2;\n" },
  { i: 1, t_ms: 1200, node: "back", kind: "write", file: "srv/b.js", text: "export const x = 1;\n" },
  { i: 2, t_ms: 12000, node: "back", kind: "run", cmd: "npm test" },
];
vi.mock("./api", () => ({ teamOp: vi.fn(async (op: string, b: any) => op === "edits" ? { ok: true, events: EV, total: 3, live: false, now_ms: 99999 } : op === "file_tree" ? { ok: true, ...(globalThis as any).__withDir ? { dir: "/work/run" } : {}, files: ["README.md", "src/a.ts", "srv/b.js", "docs/guide.md"] } : op === "doc_of" ? { ok: true, path: b.path, kind: "markdown", title: "Doc", summary: "a summary", sections: [{ title: "The file", items: [{ k: "path", v: b.path }] }] } : op === "file_now" ? { ok: true, text: b.path === "README.md" ? "# Title\nhello\n" : "const a = 1;\n" } : { ok: true, text: "" }) }));
vi.mock("@/loki/codebase/code-editor", () => ({ CodeEditor: () => <div data-testid="cm" /> }));
vi.mock("@/loki/codebase/xray-board", () => ({ x2: vi.fn(async () => ({ ok: true, trees: [{ thread: "t", root: "/work/tree", files: 4, last: "" }] })) }));
import { EditorView, chipOf, treeOf } from "./EditorView";

const run: any = { id: "r1", team: "t", engine: "claude-code", live: false, graph: { nodes: { front: { node: "role", role: "Frontend" }, back: { node: "role", role: "Backend" } } }, state: { node_cost: { back: 0.02 } } };
const mount = async () => { render(<EditorView run={run} />); await act(async () => { await vi.advanceTimersByTimeAsync(150); }); };
describe("EditorView", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "requestAnimationFrame", "cancelAnimationFrame"] }); });
  afterEach(() => vi.useRealTimers());
  it("a finished run opens editable at the end, and its explorer lists the WHOLE project, not only the touched files", async () => {
    await mount();
    expect(screen.queryByTestId("ev-lock")).toBeNull();   // an editable file needs no lock; only a read-only one shows it, as an icon of the file bar
    expect(screen.getByTestId("ev-editable")).toBeTruthy(); expect(screen.getByTestId("cm")).toBeTruthy();
    expect(screen.getByTestId("ev-file-README.md")).toBeTruthy(); expect(screen.getByTestId("ev-dir-docs")).toBeTruthy(); expect(screen.getByTestId("ev-file-src/a.ts")).toBeTruthy();
  });
  it("any file opens by a click, like VS Code: an untouched one is read from the run's folder, and it gets a tab of its own", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByTestId("ev-file-README.md")); await vi.advanceTimersByTimeAsync(50); });
    expect(screen.getAllByRole("tab").some((t) => t.textContent?.includes("README.md") && t.getAttribute("aria-selected") === "true")).toBe(true);
    expect(screen.getByTestId("ev-file-docs/guide.md")).toBeTruthy();   // a folder with a file of the run opens by itself
    await act(async () => { fireEvent.click(screen.getByTestId("ev-dir-docs")); await vi.advanceTimersByTimeAsync(10); }); expect(screen.queryByTestId("ev-file-docs/guide.md")).toBeNull();
  });
  it("replay from the start is read-only, shows one named pointer per working agent with a token counter, and stepping back and forth is deterministic", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByLabelText("Restart")); await vi.advanceTimersByTimeAsync(700); });
    await act(async () => { fireEvent.click(screen.getByTestId("ev-play")); await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByTestId("ev-lock").getAttribute("title")).toMatch(/Read-only/); expect(document.querySelector(".ev-flip")?.contains(screen.getByTestId("ev-lock"))).toBe(true);   // the lock is an icon of the file bar, not a line of its own expect(screen.queryByTestId("ev-editable")).toBeNull(); expect(screen.getByTestId("ev-ptr-front")).toBeTruthy(); expect(screen.getByTestId("ev-ptr-back")).toBeTruthy();
    expect(screen.getByTestId("ev-ptr-front").textContent).toMatch(/ · (creating|writing)/); expect(screen.getByTestId("ev-count-front").textContent).toMatch(/tok/);
    const slider = screen.getByTestId("ev-scrub"); const snap = async (key: string, n: number) => { for (let i = 0; i < n; i++) await act(async () => { fireEvent.keyDown(slider, { key }); await vi.advanceTimersByTimeAsync(5); }); return screen.getByTestId("ev-replay").textContent + "|" + (document.querySelector(".ev-code")?.textContent ?? ""); };
    const a = await snap("ArrowRight", 0); await snap("ArrowRight", 1); const b = await snap("ArrowLeft", 1); expect(b).toBe(a);
  });
  it("the replay is a tab of the bottom panel with a lane per agent, an event feed, and the controls in the tab bar", async () => {
    await mount();
    expect(screen.getByTestId("ev-rt")).toBeTruthy(); expect(screen.getByTestId("ev-lane-count-front")).toBeTruthy(); expect(screen.getByTestId("ev-feed").textContent).toMatch(/wrote|run/);
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /Terminal/ })); }); expect(screen.getByTestId("ev-term").textContent).toMatch(/npm test/); expect(screen.queryByTestId("ev-replay")).toBeNull();
  });
  it("an activity-bar icon changes the editor to the real X-ray part about the team's own tree (not a copy of it)", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByTestId("ev-act-graph")); await vi.advanceTimersByTimeAsync(50); });
    const f = screen.getByTestId("ev-xray-frame") as HTMLIFrameElement; expect(f.getAttribute("src")).toContain("view=import-graph"); expect(f.getAttribute("src")).toContain("space=%2Fwork%2Ftree");
    await act(async () => { fireEvent.click(screen.getByTestId("ev-sub-system-diagram")); }); expect((screen.getByTestId("ev-xray-frame") as HTMLIFrameElement).getAttribute("src")).toContain("view=system-diagram");
    for (const gone of ["review", "docs", "quality-rules"]) expect(screen.queryByTestId(`ev-act-${gone}`)).toBeNull();   // file review, folder review and docs are the flip icons of a file, not sidebar parts
    await act(async () => { fireEvent.click(screen.getByTestId("ev-act-design")); await vi.advanceTimersByTimeAsync(20); }); expect(document.querySelectorAll('[data-testid^="ev-sub-"]').length).toBe(0);   // the design is one thing: no tabs
    expect((screen.getByTestId("ev-xray-frame") as HTMLIFrameElement).getAttribute("src")).toContain("view=design"); for (const gone of ["quality", "review", "docs"]) expect(screen.queryByTestId(`ev-act-${gone}`)).toBeNull();   // coverage, health and history left the sidebar; the code constitution belongs to the book
  });
  it("the file tree and the bottom panel each collapse to a bar and come back; Changes is a flat list, different from the Explorer", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByTestId("ev-side-collapse")); }); expect(document.querySelector(".ev-side")).toBeNull(); expect((document.querySelector(".ev-body") as HTMLElement).style.gridTemplateColumns).toBe("40px minmax(0,1fr) auto");   // the editor takes the freed room, not a hidden column
    await act(async () => { fireEvent.click(screen.getByTestId("ev-act-all")); }); expect(document.querySelector(".ev-side")).not.toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId("ev-act-changed")); }); expect(screen.getByTestId("ev-change-src/a.ts")).toBeTruthy(); expect(screen.queryByTestId("ev-file-README.md")).toBeNull(); expect(screen.queryByTestId("ev-dir-src")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId("ev-act-all")); }); expect(screen.getByTestId("ev-file-README.md")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByTestId("ev-panel-toggle")); }); expect(screen.getByTestId("ev-panel").className).toContain("collapsed");
    await act(async () => { fireEvent.click(screen.getByTestId("ev-ptab-replay")); }); expect(screen.getByTestId("ev-panel").className).not.toContain("collapsed");
    await act(async () => { fireEvent.click(screen.getByTestId("ev-ptabs")); }); expect(screen.getByTestId("ev-panel").className).toContain("collapsed");   // a click on the bar itself collapses it
    await act(async () => { fireEvent.click(screen.getByTestId("ev-ptabs")); }); expect(screen.getByTestId("ev-panel").className).not.toContain("collapsed");   // and another expands it
  });
  it("switching to an X-ray part shows a skeleton on the panel's own background until the frame has loaded, never a white page", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByTestId("ev-act-overview")); await vi.advanceTimersByTimeAsync(30); });
    expect(screen.getByTestId("ev-skel-cards")).toBeTruthy(); expect((screen.getByTestId("ev-xray-frame") as HTMLIFrameElement).style.opacity).toBe("0");
    await act(async () => { fireEvent.load(screen.getByTestId("ev-xray-frame")); await vi.advanceTimersByTimeAsync(5000); }); expect(screen.queryByTestId("ev-skel-cards")).toBeNull(); expect((screen.getByTestId("ev-xray-frame") as HTMLIFrameElement).style.opacity).toBe("1");
  });
  it("the file's tab bar flips the editor to X-ray's file review, folder review, generated docs and git history replay, for the open file", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByTestId("ev-file-src/a.ts")); await vi.advanceTimersByTimeAsync(30); });
    for (const [k, view, path] of [["file", "file", "src%2Fa.ts"], ["folder", "folder", "src"], ["history", "history", "src%2Fa.ts"]] as const) {
      await act(async () => { fireEvent.click(screen.getByTestId(`ev-flip-${k}`)); await vi.advanceTimersByTimeAsync(30); });
      const src = (screen.getByTestId("ev-flip-frame") as HTMLIFrameElement).getAttribute("src")!; expect(src).toContain(`view=${view}`); expect(src).toContain(`path=${path}`);
    }
        await act(async () => { fireEvent.click(screen.getByTestId("ev-flip-docs")); await vi.advanceTimersByTimeAsync(30); }); expect(screen.getByTestId("file-docs-summary").textContent).toBe("a summary"); expect(screen.queryByTestId("ev-flip-frame")).toBeNull();   // the docs are the book's: generated from the file by the doc laws, any kind of project
    await act(async () => { fireEvent.click(screen.getByTestId("ev-file-refresh")); await vi.advanceTimersByTimeAsync(30); }); expect(screen.getByTestId("file-docs")).toBeTruthy();   // rebuild just this file
    await act(async () => { fireEvent.click(screen.getByTestId("ev-flip-code")); }); expect(screen.queryByTestId("ev-flip-frame")).toBeNull();
  });
  it("the panel's tab bar has a Rebuild X-ray icon that opens the same rebuild window", async () => {
    await mount(); await act(async () => { fireEvent.click(screen.getByTestId("ev-panel-rebuild")); }); expect(screen.getByTestId("ev-rebuild-frame")).toBeTruthy();
  });
  it("Rebuild opens X-ray's own rebuild window over the editor and closes with it", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByTestId("ev-act-graph")); await vi.advanceTimersByTimeAsync(30); });
    await act(async () => { fireEvent.click(screen.getByTestId("ev-rebuild")); }); expect((screen.getByTestId("ev-rebuild-frame") as HTMLIFrameElement).getAttribute("src")).toContain("view=rebuild");
    expect(screen.getByTestId("ev-skel-cards")).toBeTruthy();   // a skeleton, never a white page, until the window is drawn
    await act(async () => { window.dispatchEvent(new MessageEvent("message", { data: { antilokiRebuildClosed: true } })); }); expect(screen.queryByTestId("ev-rebuild-window")).toBeNull();   // X-ray's own window closing closes this one: one window
  });
  it("the panel is smaller by default, docks on the right with one icon, and then the replay runs vertically (time down, an agent per column)", async () => {
    await mount();
    expect(screen.getByTestId("ev-replay")).toBeTruthy(); expect(screen.queryByTestId("ev-replay-vertical")).toBeNull(); expect(screen.getByTestId("ev-panel-resize")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByTestId("ev-panel-dock")); }); expect(screen.getByTestId("ev-replay-vertical")).toBeTruthy(); expect(screen.queryByTestId("ev-replay")).toBeNull(); expect(screen.getByTestId("ev-panel").className).toContain("right");
    expect((document.querySelector(".ev-body") as HTMLElement).style.gridTemplateColumns).toMatch(/430px/);
    const slider = screen.getByTestId("ev-vscrub"); await act(async () => { fireEvent.keyDown(slider, { key: "ArrowUp" }); }); expect(screen.getAllByRole("button", { name: /write|run/ }).length).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(screen.getByTestId("ev-panel-dock")); }); expect(screen.getByTestId("ev-replay")).toBeTruthy();   // back at the bottom
  });
  it("with the run's folder known, a finished run opens the file in X-ray's own editor (doc cards, violations, save), not in a copy of it; the path sits in the tab bar", async () => {
    (globalThis as any).__withDir = true;
    try { await mount(); await act(async () => { fireEvent.click(screen.getByTestId("ev-file-src/a.ts")); await vi.advanceTimersByTimeAsync(50); });
      const f = screen.getByTestId("ev-flip-frame") as HTMLIFrameElement; expect(f.getAttribute("src")).toContain("view=code-edit"); expect(f.getAttribute("src")).toContain("space=%2Fwork%2Frun"); expect(f.getAttribute("src")).toContain("path=src%2Fa.ts");
      expect(screen.getByTestId("ev-crumb").textContent).toBe("src › a.ts"); expect(document.querySelector(".ev-trow")?.contains(screen.getByTestId("ev-crumb"))).toBe(true); expect(document.querySelector(".ev-bar")).toBeNull();   // no band of its own for the path, the lock or the agent picker
    } finally { (globalThis as any).__withDir = false; }
  });
  it("X-ray's own chrome (the ⋯ menu for swapping a part) is never drawn inside the Editor view: every frame it opens asks for the bare page", async () => {
    await mount(); await act(async () => { fireEvent.click(screen.getByTestId("ev-act-graph")); await vi.advanceTimersByTimeAsync(30); });
    expect((screen.getByTestId("ev-xray-frame") as HTMLIFrameElement).getAttribute("src")).toContain("bare=1");
    await act(async () => { fireEvent.click(screen.getByTestId("ev-rebuild")); }); expect((screen.getByTestId("ev-rebuild-frame") as HTMLIFrameElement).getAttribute("src")).toContain("bare=1");
  });
  it("the chips and the tree are pure: an extension gets its chip, folders come first", () => {
    expect(chipOf("src/App.tsx")).toEqual({ label: "TSX", color: "#3b7bd8" }); expect(chipOf("x.unknownext").label).toBe("UNK");
    const t = treeOf(["b.md", "src/z.ts", "src/a.ts", "a.md"]); expect(t.map((n) => n.name)).toEqual(["src", "a.md", "b.md"]); expect(t[0].kids.map((n) => n.name)).toEqual(["a.ts", "z.ts"]);
  });
});
