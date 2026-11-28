// @vitest-environment jsdom
// THE CODE TAB STAGE (operator 2026-09-18, the 12-item batch): the code is the front face, ◧ review
// flips to the docked review (with "why not 100"), the file's "docs" tab stacks four views, a folder
// NAME opens the folder stage, nothing picked shows the repository docs — and the chat is told all of
// it through the screen manifest (2026-09-19). Heavy siblings are stubbed; the stage logic is real.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn(async () => null), apiGet: vi.fn(async () => null), isNotWired: () => false, unwrapResult: (r: any) => r }));
vi.mock("@/loki/api/codebase", () => ({
  fileRead: vi.fn(async ({ path }: any) => ({ path, content: "const a = 1;\nexport default a;\n", lines: 2 })),
  decorateFile: vi.fn(async () => ({ ok: true, decorators: [] })), entryPointsGet: vi.fn(async () => null),
  findSymbol: vi.fn(), gitInit: vi.fn(), fileSave: vi.fn(), coverageGet: vi.fn(async () => null),
}));
vi.mock("@/loki/api/hooks", () => ({ useCodeGit: () => ({ data: null, isLoading: false }), useWorkspaces: () => ({ data: { active: { name: "w" } } }) }));
vi.mock("@/loki/shell/command-store-registry", () => ({ registerHere: () => () => {} }));
vi.mock("@/loki/chat/ui-bus", () => ({ consumePendingIdeView: () => null }));
// the real editor has its own tests (code-editor.test.tsx, atlas-files-ide.edit.test.tsx); here the stage logic is what is under test
vi.mock("./code-editor", async () => { const R = await import("react"); return { CodeEditor: R.forwardRef(({ initial }: any, _ref: any) => <pre data-testid="code">{initial}</pre>) }; });
vi.mock("./atlas-graph", () => ({ extColor: () => "#fff", fileDetail: () => ({ importers: [], imports: [], fileNode: null, defs: [] }), FilePanel: ({ defaultTab }: any) => <div data-testid={`file-panel-${defaultTab}`} />, AtlasGraphMini: () => <div data-testid="graph" />, DiagramView: () => <div data-testid="diagram" /> }));
vi.mock("./repo-dashboard", async (orig) => ({ ...(await orig<any>()), RepoDashboard: () => <div data-testid="dashboard" /> }));
vi.mock("./design-view", () => ({ DesignView: () => <div data-testid="design" /> }));
vi.mock("./rules-panel", () => ({ RulesPanel: () => <div data-testid="rules" /> }));
vi.mock("./ultra-review", () => ({ UltraReview: () => <div data-testid="ultra" /> }));
vi.mock("./constitution-agents", () => ({ AgentsPanel: () => <div data-testid="missions" />, PaperCreatorInline: () => <div data-testid="papers" /> }));
vi.mock("@/loki/ultra-review", () => ({ UltraReviewScreen: () => <div data-testid="ultra-screen" />, worstUnitsLine: () => "" }));
vi.mock("./constitution-panel", () => ({ ConstitutionPanel: () => <div data-testid="constitution" /> }));
vi.mock("./atlas-description", () => ({ DescriptionView: ({ path }: any) => <div data-testid="describe">{path}</div> }));
vi.mock("./gravity-map", () => ({ GravityMap: () => <div data-testid="gravity" /> }));
vi.mock("./data-stories-panel", () => ({ DataStoriesPanel: () => <div data-testid="stories" /> }));
vi.mock("./history-panel", () => ({ HistoryPanel: () => <div data-testid="history" /> }));
vi.mock("./substrate-panel", () => ({ SubstratePanel: () => <div data-testid="substrate" /> }));
vi.mock("./review-history-panel", () => ({ ReviewHistoryPanel: () => <div data-testid="review-history" /> }));
vi.mock("./authors-panel", () => ({ AuthorsPanel: () => <div data-testid="authors" /> }));
vi.mock("./coverage-panel", () => ({ CoveragePanel: () => <div data-testid="coverage" /> }));
vi.mock("./file-history-replay", () => ({ FileHistoryReplay: () => <div data-testid="replay" /> }));
vi.mock("./diff-panel", () => ({ DiffPanel: () => <div data-testid="diff" /> }));
vi.mock("@/loki/util/export-view", () => ({ ExportButtons: () => null }));
const cons: Record<string, any> = vi.hoisted(() => ({
  "src/a.ts": { found: true, path: "src/a.ts", health: 81, axes: { tests: { score: 27 }, coupling: { score: 57 }, compliance: { score: 100 } }, violations: [{ law_key: "no-var", severity: "warn", line: 1 }], signals: { loc: 2 } },
  "src/clean.ts": { found: true, path: "src/clean.ts", health: 100, axes: { compliance: { score: 100 } }, violations: [] },
  "src": { found: true, path: "src", is_folder: true, files: 2, health: 90, members: [] },
}));
vi.mock("./atlas-decorators", async (orig) => ({
  ...(await orig<any>()),
  fetchFileCon: vi.fn(async (p: string) => cons[p] ?? null),
  FileReviewBody: ({ con }: any) => <div data-testid="review-body">{con.path}</div>,
  FolderStageBody: ({ con }: any) => <div data-testid="folder-body">{con.path}</div>,
  DocsView: ({ path }: any) => <div data-testid="docs-view">{path === null ? "REPO DOCS" : path}</div>,
  DecoratorStrip: () => null, ViolationStrip: () => null, FileScoreModal: () => null,
}));

import { FilesIDE } from "./atlas-files-ide";
import { screenPages, composeScreenManifest, clearScreenState } from "@/loki/chat/screen-manifest";

const groups = [{ path: "src/a.ts", fileNode: { id: 1 } }, { path: "src/clean.ts", fileNode: { id: 2 } }];
function Harness({ initial = null }: { initial?: { path: string; fileNode: any } | null }) {
  const [selected, setSelected] = React.useState<{ path: string; fileNode: any } | null>(initial);
  return <FilesIDE groups={groups} atlas={{ nodes: [], edges: [] }} selected={selected} onSelect={setSelected} />;
}
beforeEach(() => { localStorage.setItem("antiloki:ide-dash-tab", "code"); for (const [u] of screenPages()) clearScreenState(u); });

describe("the Code tab stage", () => {
  it("nothing picked → the repository docs live on the Code tab (the Reference tab is gone)", async () => {
    render(<Harness />);
    expect(screen.getAllByTestId(/^dash-tab-/).map((b) => b.textContent)).toEqual(["Overview", "Code", "Design", "Quality", "Architecture", "History", "Ultra review"]);
    // every section of the right sidebar has its own thin line icon, and the icons add no text to the labels
    for (const k of ["overview", "code", "design", "hurt", "breaks", "happened", "ultra"]) { const icon = screen.getByTestId(`dash-icon-${k}`); expect(icon.tagName.toLowerCase()).toBe("svg"); expect(screen.getByTestId(`dash-tab-${k}`).contains(icon)).toBe(true); }
    expect(new Set(["overview", "code", "design", "hurt", "breaks", "happened", "ultra"].map((k) => screen.getByTestId(`dash-icon-${k}`).outerHTML)).size).toBe(7);   // seven different icons
    expect(screen.getByTestId("ide-repo-docs").textContent).toContain("REPO DOCS");
    expect(composeScreenManifest({})).toContain("X-ray — tab Code · the repository docs (no file picked)");
  });

  it("a file opens on its CODE face; ◧ review flips the card to the review with 'why not 100'; the chat gets the dossier", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTitle("src/a.ts"));
    await waitFor(() => expect(screen.getByTestId("ide-file-stage").dataset.face).toBe("code"));
    await waitFor(() => expect(screen.getByTestId("code").textContent).toContain("const a = 1;"));
    expect(screen.queryByTestId("review-body")).toBeNull(); // the back face is not even mounted until the first flip
    expect(screen.getByTestId("ide-eye").textContent).toBe("◧ review");
    fireEvent.click(screen.getByTestId("ide-eye"));
    expect(screen.getByTestId("ide-file-stage").dataset.face).toBe("review");
    await waitFor(() => expect(screen.getByTestId("review-body").textContent).toBe("src/a.ts"));
    expect(screen.getByTestId("file-review-stage-health").textContent).toBe("81");
    const why = screen.getByTestId("file-review-why").textContent!;
    expect(why).toContain("why not 100"); expect(why).toContain("tests 27 · −73 — how much of it the tests reach"); expect(why).toContain("coupling 57 · −43"); expect(why).toContain("1 law violation below");
    expect(screen.getAllByTestId(/^file-tab-/).map((b) => b.textContent)).toEqual(["code review", "docs"]);
    await waitFor(() => expect(Object.fromEntries(screenPages())["xray-file"]).toContain("file src/a.ts — health 81"));
    expect(composeScreenManifest({})).toContain("file src/a.ts — showing the code review (annotated review · beyond the lines · history)");
    // the code face is still mounted behind (the flip is a rotation, not a swap); 👁 code flips back
    expect(screen.getByTestId("code")).toBeTruthy();
    expect(screen.getByTestId("ide-eye").textContent).toBe("👁 code");
    fireEvent.click(screen.getByTestId("ide-eye"));
    expect(screen.getByTestId("ide-file-stage").dataset.face).toBe("code");
  });

  it("a 100 file has no 'why'; the docs tab stacks docs · describe · structure · snapshot", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTitle("src/clean.ts"));
    fireEvent.click(await screen.findByTestId("ide-eye"));
    await waitFor(() => expect(screen.getByTestId("file-review-stage-health").textContent).toBe("100"));
    expect(screen.queryByTestId("file-review-why")).toBeNull();
    fireEvent.click(screen.getByTestId("file-tab-docs"));
    const docs = screen.getByTestId("file-docs-stage");
    expect(docs.querySelector('[data-testid="docs-view"]')!.textContent).toBe("src/clean.ts");
    expect(docs.querySelector('[data-testid="describe"]')!.textContent).toBe("src/clean.ts");
    expect(docs.textContent).toContain("structure — the shape of the file");
    expect(docs.textContent).toContain("snapshot — the file as the last analysis saw it");
    expect(composeScreenManifest({})).toContain("showing the docs (generated docs · describe · structure · snapshot)");
  });

  it("the folder NAME opens the folder stage (paper + neighborhood); the arrow only folds; ✕ folder closes it", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("tree-arrow-src"));
    expect(screen.queryByTestId("ide-folder-stage")).toBeNull();
    expect(screen.queryByTitle("src/a.ts")).toBeNull(); // folded
    fireEvent.click(screen.getByTestId("tree-arrow-src"));
    fireEvent.click(screen.getByTestId("tree-folder-src"));
    await waitFor(() => expect(screen.getByTestId("folder-body").textContent).toBe("src"));
    // the xray page is registered by an EFFECT, so it can land a tick after the body renders: waited for, not assumed
    await waitFor(() => expect(Object.fromEntries(screenPages())["xray-folder"]).toContain("folder src — health 90 · 2 files"));
    expect(composeScreenManifest({})).toContain("folder review of src (paper + neighborhood)");
    fireEvent.click(screen.getByTestId("ide-folder-close"));
    expect(screen.queryByTestId("ide-folder-stage")).toBeNull();
    expect(screen.getByTestId("ide-repo-docs")).toBeTruthy();
    expect(Object.fromEntries(screenPages())["xray-folder"]).toBeUndefined();
  });

  it("picking a file while a folder is open replaces the folder stage with the file's code", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("tree-folder-src"));
    await waitFor(() => expect(screen.getByTestId("folder-body")).toBeTruthy());
    fireEvent.click(screen.getByTitle("src/a.ts"));
    await waitFor(() => expect(screen.getByTestId("ide-file-stage").dataset.face).toBe("code"));
    expect(screen.queryByTestId("folder-body")).toBeNull();
  });
});


describe("on a phone", () => {
  it("the file tree and the sections menu fold away and open over the page from a bar of their own (a 390 px screen cannot hold 382 px of side panels)", async () => {
    const was = window.innerWidth; Object.defineProperty(window, "innerWidth", { value: 390, configurable: true }); window.dispatchEvent(new Event("resize"));
    try {
      render(<Harness />);
      expect(screen.getByTestId("ide-narrow-bar")).toBeTruthy(); expect(screen.getByTestId("ide-menu").style.display).toBe("none"); expect(screen.getByTestId("ide-tree").style.display).toBe("none");
      fireEvent.click(screen.getByTestId("ide-menu-toggle")); expect(screen.getByTestId("ide-menu").style.display).toBe("flex"); expect(screen.getByTestId("ide-scrim")).toBeTruthy();
      fireEvent.click(screen.getByTestId("dash-tab-design")); expect(screen.getByTestId("ide-menu").style.display).toBe("none");   // a section is picked: the menu closes
      fireEvent.click(screen.getByTestId("dash-tab-code") ?? screen.getByTestId("ide-menu-toggle"));
    } finally { Object.defineProperty(window, "innerWidth", { value: was, configurable: true }); window.dispatchEvent(new Event("resize")); }
  });
  it("a desktop keeps both panels in place and has no bar", () => {
    render(<Harness />); expect(screen.queryByTestId("ide-narrow-bar")).toBeNull(); expect(screen.getByTestId("ide-menu").style.display).toBe("flex"); expect(screen.getByTestId("ide-tree").style.width).toBe("210px");
  });
});
