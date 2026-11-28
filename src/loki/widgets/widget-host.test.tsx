// The host decides HOW a widget appears: inline (artifacts are papers, read in the flow), as a pill
// that opens a fullscreen page (everything else in the thread), or bare with no chrome at all (chat
// controls like confirm — a toolbar on those would be nonsense). It also has to fail soft: an
// unknown kind and a widget that throws while previewing must both leave the thread intact.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const composeArtefact = vi.fn();
const reportScreenState = vi.fn();
const clearScreenState = vi.fn();

const Boom = () => { throw new Error("preview exploded"); };
vi.mock("./registry", () => ({
  WIDGET_REGISTRY: {
    board: ({ payload }: any) => <div>board:{payload?.marker ?? ""}</div>,
    artifact: () => <div>the artefact body</div>,
    confirm: () => <div>confirm control</div>,
    "atlas-xray": () => <div>xray body</div>,
    "vibe-pane": () => <div>pane body</div>,
    boom: () => <Boom />,
  },
}));
vi.mock("@/loki/util/export-view", () => ({ ExportButtons: () => <div data-testid="export" /> }));
vi.mock("./artefact-compose", () => ({ composeArtefact: (...a: any[]) => composeArtefact(...a) }));
vi.mock("@/loki/chat/widget-dock", () => ({ WidgetDragGrip: ({ onDock }: any) => <button onClick={() => onDock("left")}>grip</button> }));
vi.mock("./agent-action-button", () => ({ AgentActionButton: () => <div data-testid="agent-btn" /> }));
vi.mock("./agent-interact", () => ({ feedAgent: vi.fn(async () => "path") }));
vi.mock("@/loki/chat/screen-manifest", () => ({
  reportScreenState: (...a: any[]) => reportScreenState(...a),
  clearScreenState: (...a: any[]) => clearScreenState(...a),
}));

import { WidgetHost, WidgetPreviewCard } from "./widget-host";

const widget = (kind: string, payload: any = {}) => ({ kind, key: `k-${kind}`, payload }) as any;
const host = (kind: string, payload: any = {}, ctx: any = {}) =>
  render(<WidgetHost widget={widget(kind, payload)} ctx={{ collapsible: true, ...ctx }} />);

beforeEach(() => {
  composeArtefact.mockReset();
  composeArtefact.mockResolvedValue({ title: "a paper", body_md: "# body" });
  reportScreenState.mockClear(); clearScreenState.mockClear();
});

describe("choosing a presentation", () => {
  it("renders an unknown kind as a small 'retired' card, never a crash", () => {
    const { container } = host("not-a-widget");
    const card = container.querySelector('[data-testid="widget-retired"]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.dataset.kind).toBe("not-a-widget");
    expect(card.textContent).toContain("retired");
  });

  it("renders chat-flow controls bare — no pill, no toolbar", () => {
    const { container } = host("confirm");
    expect(screen.getByText("confirm control")).toBeTruthy();
    expect(container.querySelector(".loki-widget-pill")).toBeNull();
    expect(screen.queryByTitle(/export/)).toBeNull();
  });

  it("renders an artifact inline, because a paper is meant to be read in the flow", () => {
    const { container } = host("artifact");
    expect(screen.getByText("the artefact body")).toBeTruthy();
    expect(container.querySelector(".loki-widget-pill")).toBeNull();
  });

  it("renders any other widget in the thread as a pill, not inline", () => {
    host("board", { marker: "x" });
    expect(screen.queryByText("board:x")).toBeNull();
    expect(screen.getByTitle("open this widget in a window")).toBeTruthy();
  });

  it("renders inline in the sidebar window, where there is room", () => {
    host("board", { marker: "x" }, { collapsible: false });
    expect(screen.getByText("board:x")).toBeTruthy();
  });

  it("titles a pane by the AGENT's name rather than a generic 'pane'", () => {
    host("vibe-pane", { paneKind: "claude-code" });
    expect(screen.getByText("Claude Code")).toBeTruthy();
  });

  it("shows the durable identity on the pill when the widget has one", () => {
    host("board", { _uid: "w7" });
    expect(screen.getByText("#w7")).toBeTruthy();
  });
});

describe("the fullscreen page", () => {
  const open = () => fireEvent.click(screen.getByTitle("open this widget in a window"));

  it("opens on click and closes on ← back, ✕ and Escape", () => {
    host("board", { marker: "x" });
    open();
    expect(screen.getByText("board:x")).toBeTruthy();

    fireEvent.click(screen.getByText("← back"));
    expect(screen.queryByText("board:x")).toBeNull();

    open();
    fireEvent.click(screen.getByTitle("close (Esc)"));
    expect(screen.queryByText("board:x")).toBeNull();

    open();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("board:x")).toBeNull();
  });

  it("explains what the widget IS and lists its sections", () => {
    host("atlas-xray");
    open();
    expect(screen.getByText(/The codebase x-ray/)).toBeTruthy();
    expect(screen.getByText("sections")).toBeTruthy();
    expect(screen.getByText(/files to watch/)).toBeTruthy();
  });

  it("falls back to a generic explanation for a family it has no blurb for", () => {
    host("vibe-pane", { paneKind: "codex" });
    fireEvent.click(screen.getByTitle("open this widget in a window"));
    expect(screen.getByText(/deterministic view over the substrate/)).toBeTruthy();
  });

  it("marks an atlas widget as free and deterministic", () => {
    host("atlas-xray");
    open();
    expect(screen.getByText("$0")).toBeTruthy();
  });

  it("tells the chat that the operator is reading this page, and clears it on close", () => {
    host("board", { _uid: "w9" });
    open();
    expect(reportScreenState).toHaveBeenCalledWith("fullscreen", expect.stringContaining("#w9"));
    fireEvent.click(screen.getByText("← back"));
    expect(clearScreenState).toHaveBeenCalledWith("fullscreen");
  });

  it("opens and closes on the assistant's UI bus, but only for its own uid", () => {
    host("board", { _uid: "w1", marker: "x" });
    const fire = (verb: string, uid: string) =>
      fireEvent(window, new CustomEvent("antiloki:ui", { detail: { verb, uid } }));

    fire("open_widget", "someone-else");
    expect(screen.queryByText("board:x")).toBeNull();

    fire("open_widget", "w1");
    expect(screen.getByText("board:x")).toBeTruthy();

    fire("close_widget", "w1");
    expect(screen.queryByText("board:x")).toBeNull();
  });
});

describe("the export toolbar", () => {
  const hover = () => fireEvent.mouseEnter(screen.getByTitle(/export — hover/).parentElement!);

  it("collapses to a single icon until hovered", () => {
    host("artifact");
    expect(screen.getByTitle(/export — hover/)).toBeTruthy();
    expect(screen.queryByTestId("export")).toBeNull();
    hover();
    expect(screen.getByTestId("export")).toBeTruthy();
    expect(screen.getByTestId("agent-btn")).toBeTruthy();
  });

  it("offers ⊕ save only for the report widgets, and only with a handler", () => {
    const { unmount } = host("atlas-xray", {}, { collapsible: false, onSaveArtifact: vi.fn() });
    hover();
    expect(screen.getByText("⊕ save")).toBeTruthy();
    unmount();

    host("atlas-xray", {}, { collapsible: false });   // no handler → nothing to save into
    hover();
    expect(screen.queryByText("⊕ save")).toBeNull();
  });

  it("does not offer save for a live view that is not a paper", () => {
    host("board", {}, { collapsible: false, onSaveArtifact: vi.fn() });
    hover();
    expect(screen.queryByText("⊕ save")).toBeNull();
  });

  it("composes the artefact deterministically and hands it over with its origin", async () => {
    const onSaveArtifact = vi.fn();
    host("atlas-xray", {}, { collapsible: false, onSaveArtifact });
    hover();
    fireEvent.click(screen.getByText("⊕ save"));
    await waitFor(() => expect(onSaveArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ title: "a paper", from_widget: "atlas-xray" })));
    expect(screen.getByText("✓ saved")).toBeTruthy();
  });

  it("still saves something readable when the composer fails", async () => {
    composeArtefact.mockRejectedValueOnce(new Error("nope"));
    const onSaveArtifact = vi.fn();
    host("atlas-xray", {}, { collapsible: false, onSaveArtifact });
    hover();
    fireEvent.click(screen.getByText("⊕ save"));
    await waitFor(() => expect(onSaveArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("artefact") })));
  });
});

describe("docking a widget from the pill", () => {
  it("offers the grip only when the host can dock, and does not open the page when it is used", () => {
    const onDockWidget = vi.fn();
    const { unmount } = host("board");
    expect(screen.queryByText("grip")).toBeNull();
    unmount();

    host("board", { marker: "x" }, { onDockWidget });
    fireEvent.click(screen.getByText("grip"));
    expect(onDockWidget).toHaveBeenCalledWith("left", expect.objectContaining({ kind: "board" }));
    expect(screen.queryByText("board:x")).toBeNull();   // the page did not open
  });
});

describe("WidgetPreviewCard", () => {
  it("renders the live widget behind the glass, labelled and aria-hidden", () => {
    const { container } = render(<WidgetPreviewCard widget={widget("board", { marker: "y" })} onOpen={vi.fn()} />);
    expect(screen.getByText("board:y")).toBeTruthy();
    expect(container.querySelector(".lwc-preview")!.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTitle("open board")).toBeTruthy();
  });

  it("opens on click", () => {
    const onOpen = vi.fn();
    render(<WidgetPreviewCard widget={widget("board")} onOpen={onOpen} />);
    fireEvent.click(screen.getByTitle("open board"));
    expect(onOpen).toHaveBeenCalled();
  });

  it("shows the frosted card with no live content for the heavy kinds", () => {
    const { container } = render(<WidgetPreviewCard widget={widget("vibe-pane", { paneKind: "codex" })} onOpen={vi.fn()} />);
    expect(container.querySelector(".lwc-preview")).toBeNull();
    expect(screen.getByText("Codex")).toBeTruthy();
  });

  it("survives a widget that throws while previewing — the thread must not go down with it", () => {
    const err = console.error; console.error = () => {};
    expect(() => render(<WidgetPreviewCard widget={widget("boom")} onOpen={vi.fn()} />)).not.toThrow();
    console.error = err;
  });

  it("renders nothing for an unknown kind", () => {
    const { container } = render(<WidgetPreviewCard widget={widget("nope")} onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("labels the card with the widget's own topics, identity first", () => {
    render(<WidgetPreviewCard widget={widget("atlas-xray", { _uid: "w3" })} onOpen={vi.fn()} />);
    expect(screen.getByText("#w3")).toBeTruthy();
    expect(screen.getByText("verdict")).toBeTruthy();
  });

  it("prefers the payload's own structure over the family defaults", () => {
    render(<WidgetPreviewCard widget={widget("board", { tabs: [{ label: "alpha" }, { label: "beta" }] })} onOpen={vi.fn()} />);
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.queryByText("cards by stage")).toBeNull();
  });

  it("truncates a very long topic instead of blowing out the card", () => {
    render(<WidgetPreviewCard widget={widget("board", { columns: ["x".repeat(40)] })} onOpen={vi.fn()} />);
    expect(screen.getByText(/^x+…$/).textContent!.length).toBe(22);
  });

  it("falls back to the file basename, then the slug, for a family with no known sections", () => {
    const { unmount } = render(<WidgetPreviewCard widget={widget("artifact", { path: "src/deep/a.ts" })} onOpen={vi.fn()} />);
    expect(screen.getByText("a.ts")).toBeTruthy();
    unmount();
    render(<WidgetPreviewCard widget={widget("artifact", { slug: "FEAT-X" })} onOpen={vi.fn()} />);
    expect(screen.getByText("FEAT-X")).toBeTruthy();
  });
});
