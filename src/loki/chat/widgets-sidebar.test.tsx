// The session rail is the index of everything a chat produced. Its rule is that CONTROL widgets
// (confirm, screening, offers…) are chat flow, not artefacts of the session — listing them would
// bury the actual output under the machinery. The other rule is naming: a generic pane must be
// labelled by the agent inside it, and an artefact by its own title, or the rail is a list of
// indistinguishable rows.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const deriveWidgets = vi.fn();
vi.mock("@/loki/widgets/derive", () => ({ deriveWidgets: (...a: any[]) => deriveWidgets(...a) }));
vi.mock("@/loki/widgets/widget-host", () => ({
  WidgetHost: ({ widget, ctx }: any) => <div data-testid="host">{widget.kind}:{ctx.variant}</div>,
  WidgetPreviewCard: ({ widget, onOpen }: any) => <button data-testid="preview" onClick={onOpen}>{widget.kind}</button>,
}));

import { WidgetsSidebar } from "./widgets-sidebar";

const w = (kind: string, payload: any = {}) => ({ kind, key: `k-${kind}`, payload }) as any;
const mount = (widgets: any[], props: any = {}) => {
  deriveWidgets.mockReturnValue(widgets);
  return render(<WidgetsSidebar turns={[{ id: 3 }]} localWidgets={[]} {...props} />);
};

beforeEach(() => deriveWidgets.mockReset());

describe("what the rail lists", () => {
  it("hides the chat-flow control widgets", () => {
    mount([w("confirm"), w("screening"), w("offers"), w("sources"), w("answer"), w("graph")]);
    expect(screen.getAllByTestId("preview")).toHaveLength(1);
    expect(screen.getByText("graph")).toBeTruthy();
  });

  it("counts everything it is showing", () => {
    mount([w("graph"), w("table")]);
    expect(screen.getByText(/◳ session · 2/)).toBeTruthy();
  });

  it("includes widgets created live, outside a turn", () => {
    deriveWidgets.mockReturnValue([]);
    render(<WidgetsSidebar turns={[{ id: 1 }]} localWidgets={[{ id: "l1", widget: w("diagram") }]} />);
    expect(screen.getByText("diagram")).toBeTruthy();
  });

  it("ignores a malformed local entry rather than crashing the rail", () => {
    deriveWidgets.mockReturnValue([]);
    expect(() => render(<WidgetsSidebar turns={[]} localWidgets={[{ id: "x" } as any]} />)).not.toThrow();
  });

  it("separates widgets from artefacts, each counted", () => {
    mount([w("graph"), w("artifact", { item: { title: "The x-ray paper" } })]);
    expect(screen.getByText(/◳ widgets · 1/)).toBeTruthy();
    expect(screen.getByText(/◆ artefacts · 1/)).toBeTruthy();
  });

  it("can be narrowed to one section for its own dock", () => {
    const { unmount } = mount([w("graph"), w("artifact", { item: { title: "paper" } })], { only: "widgets" });
    expect(screen.getByTestId("preview")).toBeTruthy();
    expect(screen.queryByText("paper")).toBeNull();
    unmount();

    mount([w("graph"), w("artifact", { item: { title: "paper" } })], { only: "artifacts" });
    expect(screen.queryByTestId("preview")).toBeNull();
    expect(screen.getByText("paper")).toBeTruthy();
  });
});

describe("naming a row", () => {
  it("labels a known kind by what it IS, not by its slug", () => {
    mount([w("atlas-review"), w("artifact", { item: { title: "The auth study" } })]);
    expect(screen.getByText("The auth study")).toBeTruthy();
  });

  it("labels a generic pane by the agent inside it", () => {
    mount([w("vibe-pane", { paneKind: "claude-code" }), w("artifact", { item: { title: "t" } })]);
    // the pane renders as a preview box; its label lives on the opened window's header
    fireEvent.click(screen.getByTestId("preview"));
    expect(screen.getByText(/claude-code/)).toBeTruthy();
  });

  it("falls back to the raw kind for something it has never seen", () => {
    mount([w("artifact", { item: {} })]);
    expect(screen.getByText("artefact")).toBeTruthy();
  });

  it("stamps the turn a widget came from, and omits it for a live one", () => {
    deriveWidgets.mockReturnValue([w("artifact", { item: { title: "from a turn" } })]);
    render(<WidgetsSidebar turns={[{ id: 42 }]} localWidgets={[{ id: "l", widget: w("artifact", { item: { title: "live" } }) }]} />);
    expect(screen.getByText("#42")).toBeTruthy();
    expect(screen.getAllByText(/#/)).toHaveLength(1);
  });
});

describe("the empty state", () => {
  it("says how to make a widget", () => {
    mount([]);
    expect(screen.getByText(/nothing generated yet/)).toBeTruthy();
    expect(screen.getByText("/graph")).toBeTruthy();
  });

  it("says how to make an artefact when that is the section", () => {
    mount([], { only: "artifacts" });
    expect(screen.getByText(/nothing saved yet/)).toBeTruthy();
    expect(screen.getByText(/⊕ save a report widget/)).toBeTruthy();
  });
});

describe("opening one", () => {
  it("opens it in a focused window over the thread, in page variant", () => {
    mount([w("artifact", { item: { title: "the paper" } })]);
    fireEvent.click(screen.getByText("the paper"));
    expect(screen.getByTestId("host").textContent).toBe("artifact:page");
  });

  it("closes on the ✕ and on the backdrop, but not from inside", () => {
    const { container } = mount([w("artifact", { item: { title: "the paper" } })]);
    fireEvent.click(screen.getByText("the paper"));
    fireEvent.click(screen.getByText("×"));
    expect(screen.queryByTestId("host")).toBeNull();

    fireEvent.click(screen.getByText("the paper"));
    fireEvent.click(screen.getByTestId("host"));
    expect(screen.getByTestId("host")).toBeTruthy();

    const scrim = Array.from(container.parentElement!.querySelectorAll("div"))
      .find((d) => (d as HTMLElement).style.position === "fixed" && (d as HTMLElement).style.inset === "0px")!;
    fireEvent.click(scrim);
    expect(screen.queryByTestId("host")).toBeNull();
  });

  it("opens from a preview box too", () => {
    mount([w("graph")]);
    fireEvent.click(screen.getByTestId("preview"));
    expect(screen.getByTestId("host").textContent).toBe("graph:page");
  });

  it("shows which turn the opened widget came from", () => {
    mount([w("artifact", { item: { title: "p" } })]);
    fireEvent.click(screen.getByText("p"));
    expect(screen.getByText("turn #3")).toBeTruthy();
  });
});

describe("framing", () => {
  it("drops the rail chrome when the dock provides it", () => {
    const wide = mount([w("graph")]);
    expect((wide.container.firstChild as HTMLElement).style.width).toBe("178px");
    expect(screen.getByText(/◳ session/)).toBeTruthy();
    wide.unmount();

    const bare = mount([w("graph")], { frameless: true });
    expect((bare.container.firstChild as HTMLElement).style.width).toBe("");
    expect(screen.queryByText(/◳ session/)).toBeNull();
  });
});
