// @vitest-environment jsdom
// EDITING AND SAVING IN THE CODE TAB (operator 2026-10-11). THE CODE TAB STAGE (operator 2026-09-18, the 12-item batch): the code is the front face, ◧ review
// flips to the docked review (with "why not 100"), the file's "docs" tab stacks four views, a folder
// NAME opens the folder stage, nothing picked shows the repository docs — and the chat is told all of
// it through the screen manifest (2026-09-19). Heavy siblings are stubbed; the stage logic is real.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act, configure } from "@testing-library/react";
// the whole suite runs on a loaded machine: a wait that is one second tight there is a flake, not a failure
configure({ asyncUtilTimeout: 20_000 });
vi.setConfig({ testTimeout: 60_000 });

vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn(async () => null), apiGet: vi.fn(async () => null), isNotWired: () => false, unwrapResult: (r: any) => r }));
const api = vi.hoisted(() => ({ version: {} as Record<string, number>, truncated: new Set<string>(), save: null as any }));
vi.mock("@/loki/api/codebase", () => ({
  fileRead: vi.fn(async ({ path }: any) => { const v = (api.version[path] ??= 1); return { path, content: `// ${path} v${v}
const a = 1;
`, lines: 3, bytes: 20, truncated: api.truncated.has(path), sha256: `sha-${path}-${v}` }; }),
  fileSave: vi.fn(async (a: any) => api.save(a)),
  decorateFile: vi.fn(async () => ({ ok: true, decorators: [] })), entryPointsGet: vi.fn(async () => null),
  findSymbol: vi.fn(), gitInit: vi.fn(), coverageGet: vi.fn(async () => null),
}));
vi.mock("@/loki/api/hooks", () => ({ useCodeGit: () => ({ data: null, isLoading: false }), useWorkspaces: () => ({ data: { active: { name: "w", root_path: "/ws" } } }) }));
vi.mock("@/loki/shell/command-store-registry", () => ({ registerHere: () => () => {} }));
vi.mock("@/loki/chat/ui-bus", () => ({ consumePendingIdeView: () => null }));
// the real editor has its own tests (code-editor.test.tsx, atlas-files-ide.edit.test.tsx); here the stage logic is what is under test
vi.mock("./code-editor", async () => {
  const R = await import("react");
  // a stand-in with the real editor's contract: a textarea that reports dirty against the saved text and hands back what was typed when it goes away
  return { CodeEditor: R.forwardRef((p: any, ref: any) => {
    const [text, setText] = R.useState<string>(p.initial); const textRef = R.useRef<string>(p.initial); const base = R.useRef<string>(p.saved ?? p.initial);
    R.useImperativeHandle(ref, () => ({ getText: () => textRef.current, setText: (t: string) => { textRef.current = t; setText(t); p.onDirty?.(t !== base.current); }, markSaved: (t: string) => { base.current = t; p.onDirty?.(textRef.current !== t); }, goToLine: () => {}, focus: () => {} }), []);
    const first = R.useRef(true);
    R.useEffect(() => {   // a new document: start over from its text, and when it is left behind say which one it was (the first mount already starts from it, so it is not reset: a late effect must not undo a keystroke)
      if (first.current) { first.current = false; p.onDirty?.(p.initial !== base.current); }
      else { textRef.current = p.initial; setText(p.initial); base.current = p.saved ?? p.initial; p.onDirty?.(p.initial !== base.current); }
      const key = p.docKey; return () => p.onLeave?.(textRef.current, textRef.current !== base.current, key);
    }, [p.docKey]);   // eslint-disable-line
    return <textarea data-testid="ed" value={text} readOnly={p.readOnly} onChange={(e) => { textRef.current = e.target.value; setText(e.target.value); p.onDirty?.(e.target.value !== base.current); }} />;
  }) };
});
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
import { fileSave } from "@/loki/api/codebase";
import { editedPaths, resetEdits } from "./code-edits";

const groups = [{ path: "src/a.ts", fileNode: { id: 1 } }, { path: "src/clean.ts", fileNode: { id: 2 } }];
function Harness() {
  const [selected, setSelected] = React.useState<{ path: string; fileNode: any } | null>(groups[0]);
  return <><button data-testid="pick-a" onClick={() => setSelected(groups[0])} /><button data-testid="pick-clean" onClick={() => setSelected(groups[1])} />
    <FilesIDE groups={groups} atlas={{ nodes: [], edges: [] }} selected={selected} onSelect={setSelected} /></>;
}
const type = (text: string) => fireEvent.change(screen.getByTestId("ed"), { target: { value: text } });
beforeEach(() => {
  localStorage.clear(); localStorage.setItem("antiloki:ide-dash-tab", "code"); resetEdits();
  api.version = {}; api.truncated = new Set(); (fileSave as any).mockClear();
  api.save = async (a: any) => ({ ok: true, path: a.path, sha256: `sha-saved-${a.content.length}`, bytes: a.content.length, lines: 2 });
});

describe("the Code tab is an editor", () => {
  it("opens the file for editing with nothing unsaved, and offers none of the old line actions", async () => {
    render(<Harness />);
    await waitFor(() => expect((screen.getByTestId("ed") as HTMLTextAreaElement).value).toContain("// src/a.ts v1"));
    expect(screen.queryByTestId("code-unsaved")).toBeNull();
    expect((screen.getByTestId("code-save") as HTMLButtonElement).disabled).toBe(true);
    const text = document.body.textContent ?? "";
    for (const gone of ["explain", "regenerate", "→ chat", "playground", "stage in sandbox"]) expect(text, gone).not.toContain(gone);
  });

  it("typing marks it unsaved; Save writes it against the version that was opened, and flags the analysis as out of date", async () => {
    render(<Harness />);
    await waitFor(() => screen.getByTestId("ed"), { timeout: 5000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });   // under load the file's own load can still be in flight; typing before it lands is overwritten by it (issue 18)
    type("const a = 2;\n");
    expect(screen.getByTestId("code-unsaved")).toBeTruthy();
    const save = screen.getByTestId("code-save") as HTMLButtonElement; expect(save.disabled).toBe(false);
    await act(async () => { fireEvent.click(save); });
    expect(fileSave).toHaveBeenCalledWith({ path: "src/a.ts", content: "const a = 2;\n", expected_sha256: "sha-src/a.ts-1" });
    await waitFor(() => expect(screen.getByTestId("code-save-note").textContent).toContain("saved to the workspace"), { timeout: 5000 });
    expect(screen.getByTestId("code-stale-note").textContent).toContain("out of date");
    expect(editedPaths("/ws")).toEqual(["src/a.ts"]);               // the rebuild button reads this
    expect(screen.queryByTestId("code-unsaved")).toBeNull(); expect((screen.getByTestId("code-save") as HTMLButtonElement).disabled).toBe(true);
    // the next save is based on the version the last save produced
    type("const a = 3;\n"); await act(async () => { fireEvent.click(screen.getByTestId("code-save")); });
    expect((fileSave as any).mock.calls[1][0].expected_sha256).toBe("sha-saved-13");
  });

  it("a file that changed on disk is a conflict: nothing is overwritten unless the person says so", async () => {
    render(<Harness />);
    await waitFor(() => screen.getByTestId("ed"), { timeout: 5000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });   // under load the file's own load can land after a typed change and overwrite it (issue 18)
    api.save = async () => ({ ok: false, conflict: true, error: "the file changed on disk since it was opened" });
    type("mine\n"); await act(async () => { fireEvent.click(screen.getByTestId("code-save")); });
    const note = await screen.findByTestId("code-save-note", undefined, { timeout: 5000 });
    expect(note.textContent).toContain("changed on disk"); expect(editedPaths("/ws")).toEqual([]);
    expect(screen.getByTestId("code-unsaved")).toBeTruthy();       // still unsaved
    // save anyway: it reads the file again and saves against the version it finds
    api.version["src/a.ts"] = 2; api.save = async (a: any) => ({ ok: true, path: a.path, sha256: "sha-new", bytes: 5, lines: 2 });
    await act(async () => { fireEvent.click(screen.getByTestId("code-save-anyway")); });
    await waitFor(() => expect(screen.getByTestId("code-save-note").textContent).toContain("saved to the workspace"));
    expect((fileSave as any).mock.calls.at(-1)[0]).toEqual({ path: "src/a.ts", content: "mine\n", expected_sha256: "sha-src/a.ts-2" });
  });

  it("reload from disk drops the unsaved text and shows the file as it is now", async () => {
    render(<Harness />);
    await waitFor(() => screen.getByTestId("ed"), { timeout: 5000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });   // under load the file's own load can land after a typed change and overwrite it (issue 18)
    api.save = async () => ({ ok: false, conflict: true, error: "changed on disk" });
    type("mine\n"); await act(async () => { fireEvent.click(screen.getByTestId("code-save")); });
    api.version["src/a.ts"] = 2;
    await act(async () => { fireEvent.click(await screen.findByTestId("code-reload")); });
    await waitFor(() => expect((screen.getByTestId("ed") as HTMLTextAreaElement).value).toContain("// src/a.ts v2"));
    expect(screen.queryByTestId("code-unsaved")).toBeNull(); expect(screen.queryByTestId("code-save-note")).toBeNull();
  });

  it("another kind of refusal says why and keeps the text", async () => {
    render(<Harness />);
    await waitFor(() => screen.getByTestId("ed"), { timeout: 5000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });   // under load the file's own load can land after a typed change and overwrite it (issue 18)
    api.save = async () => ({ ok: false, error: "files under .git and .antiloki are not edited from here" });
    type("x\n"); await act(async () => { fireEvent.click(screen.getByTestId("code-save")); });
    expect((await screen.findByTestId("code-save-note", undefined, { timeout: 5000 })).textContent).toContain(".git");
    expect(screen.queryByTestId("code-save-anyway")).toBeNull(); expect(screen.getByTestId("code-unsaved")).toBeTruthy();
  });

  it("clicking to another file keeps what was typed as a draft and gives it back with the file", async () => {
    render(<Harness />);
    await waitFor(() => screen.getByTestId("ed"), { timeout: 5000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });   // under load the file's own load can land after a typed change and overwrite it (issue 18)
    type("half-written change\n");
    await act(async () => { fireEvent.click(screen.getByTestId("pick-clean")); });
    await waitFor(() => expect((screen.getByTestId("ed") as HTMLTextAreaElement).value).toContain("// src/clean.ts v1"));
    expect(screen.queryByTestId("code-unsaved")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId("pick-a")); });
    await waitFor(() => expect((screen.getByTestId("ed") as HTMLTextAreaElement).value).toBe("half-written change\n"));
    expect(screen.getByTestId("code-unsaved")).toBeTruthy();
    // its base is the version it was written against, so saving is checked against the disk like any other
    await act(async () => { fireEvent.click(screen.getByTestId("code-save")); });
    expect((fileSave as any).mock.calls[0][0].expected_sha256).toBe("sha-src/a.ts-1");
  });

  it("a draft whose file changed on disk meanwhile comes back with a warning", async () => {
    render(<Harness />);
    await waitFor(() => screen.getByTestId("ed"), { timeout: 5000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });   // under load the file's own load can land after a typed change and overwrite it (issue 18)
    type("my draft\n");
    await act(async () => { fireEvent.click(screen.getByTestId("pick-clean")); });
    await waitFor(() => expect((screen.getByTestId("ed") as HTMLTextAreaElement).value).toContain("clean.ts"));
    api.version["src/a.ts"] = 2;   // an agent edited a.ts while the person was elsewhere
    await act(async () => { fireEvent.click(screen.getByTestId("pick-a")); });
    expect((await screen.findByTestId("code-save-note", undefined, { timeout: 5000 })).textContent).toContain("changed on disk while you were away");
    expect((screen.getByTestId("ed") as HTMLTextAreaElement).value).toBe("my draft\n");
  });

  it("a file too large to open whole is read-only: no save", async () => {
    api.truncated.add("src/a.ts");
    render(<Harness />);
    await waitFor(() => screen.getByTestId("ed"), { timeout: 5000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });   // under load the file's own load can land after a typed change and overwrite it (issue 18)
    expect(screen.getByText(/read-only · too large to edit/)).toBeTruthy();
    expect(screen.queryByTestId("code-save")).toBeNull(); expect((screen.getByTestId("ed") as HTMLTextAreaElement).readOnly).toBe(true);
  });
});
