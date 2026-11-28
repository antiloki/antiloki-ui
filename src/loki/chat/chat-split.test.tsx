// THE STUDIO PICK OPENS BESIDE THE CHAT (operator 2026-09-23: "the studio widgets onclick do nothing. It was
// suppose to open in split screen … at least 1 per time", "split screen i mean vertically splited", "do not show
// them in the chat inside").
//
// Two things are pinned here, because both were broken and each hid the other:
//   1. In the chat surface a tile ADDS — it no longer opens the thread preview, which had nowhere to render once
//      the right half became the conversation, so the click looked like it did nothing at all.
//   2. The widget it adds is asked for SPLIT, and the split renders as the right half of the same row as the chat.
// The split half is a sibling of the chat body, not a child of a pane: an earlier attempt addressed it to whichever
// chat pane claimed "the front" over a window event, and hidden agent panes kept claiming it.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/loki/widgets/widget-host", () => ({ WidgetHost: ({ widget }: any) => <div data-testid="host">{widget.kind}</div> }));

import { DockZone, type CatalogKind } from "./widget-dock";

const kind = (add: CatalogKind["add"], k = "shared-diff"): CatalogKind => ({ kind: k, label: k, add });
// DockZone bails out early with no items, so the surface needs one — the chat, as the real caller has.
const ITEM = { id: "chat", label: "chat", render: () => <div /> };
const mount = (add: CatalogKind["add"], split?: React.ReactNode) => render(
  <DockZone zone="center" layout="threads" items={[ITEM]} collapsed={[]} sideTab="chats"
    onToggle={() => {}} onCloseItem={() => {}}
    catalog={[{ category: "tools", kinds: [kind(add), kind(add, "design-frames")] }]}
    chatsBody={<div data-testid="the-chat" />} chatsSplit={split} />
);

describe("a Studio tile in the chat surface", () => {
  it("opens the widget instead of a preview that has nowhere to go", () => {
    const add = vi.fn();
    mount(add);
    fireEvent.click(screen.getByTestId("studio-kind-shared-diff"));
    expect(add).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("studio-preview")).toBeNull();
  });

  it("asks for the split — one widget beside the chat, not a card inside it", () => {
    const add = vi.fn();
    mount(add);
    fireEvent.click(screen.getByTestId("studio-kind-shared-diff"));
    expect(add.mock.calls[0][1]).toEqual({ split: true });
  });

  it("renders the split as a sibling of the chat, so the row is the vertical split", () => {
    mount(vi.fn(), <div data-testid="split-pane" />);
    const chat = screen.getByTestId("the-chat");
    const split = screen.getByTestId("split-pane");
    expect(chat.parentElement?.parentElement).toBe(split.parentElement);
    expect((split.parentElement as HTMLElement).style.flexDirection).toBe("row");
  });

  it("shows no split when nothing has been picked", () => {
    mount(vi.fn());
    expect(screen.queryByTestId("split-pane")).toBeNull();
  });

  // operator 2026-09-23: "when openning a widget the sidebar right collapses like threads did before, same
  // animation and design" — the widget is what you came to look at, so the shop gets out of its way
  it("keeps the Studio rail open while nothing is beside the chat", () => {
    mount(vi.fn());
    const rail = screen.getByTestId("agents-catalogue");
    expect(rail.getAttribute("data-folded")).toBeNull();
    expect(screen.getByTestId("studio-kind-shared-diff")).toBeTruthy();
  });

  it("folds the Studio rail to a strip when a widget is picked", () => {
    mount(vi.fn());
    fireEvent.click(screen.getByTestId("studio-kind-shared-diff"));
    const rail = screen.getByTestId("agents-catalogue");
    expect(rail.getAttribute("data-folded")).toBe("1");
    expect(screen.getByTestId("studio-rail-folded").textContent).toContain("studio");
    expect((rail as HTMLElement).style.transition).toContain("width");
  });

  it("the folded strip opens again on click, and offers its own way back", () => {
    mount(vi.fn());
    fireEvent.click(screen.getByTestId("studio-kind-shared-diff"));
    fireEvent.click(screen.getByTestId("studio-rail-unfold"));
    expect(screen.getByTestId("agents-catalogue").getAttribute("data-folded")).toBeNull();
    expect(screen.getByTestId("studio-rail-fold")).toBeTruthy();
  });

  // operator 2026-09-23: "frames widget needs more space, so when click on frames not just collapse the studio but
  // the chat too" — a canvas is the work, not a reference beside the conversation
  it("folds the conversation too for a widget that wants the desk", () => {
    mount(vi.fn());
    fireEvent.click(screen.getByTestId("studio-kind-design-frames"));
    expect(screen.getByTestId("chats-body-folded").textContent).toContain("the chat");
    expect(screen.queryByTestId("the-chat")).toBeNull();
    expect(screen.getByTestId("agents-catalogue").getAttribute("data-folded")).toBe("1");
  });

  it("leaves the conversation alone for an ordinary widget", () => {
    mount(vi.fn());
    fireEvent.click(screen.getByTestId("studio-kind-shared-diff"));
    expect(screen.getByTestId("the-chat")).toBeTruthy();
    expect(screen.queryByTestId("chats-body-folded")).toBeNull();
  });

  it("the folded conversation comes back on click", () => {
    mount(vi.fn());
    fireEvent.click(screen.getByTestId("studio-kind-design-frames"));
    fireEvent.click(screen.getByTestId("chats-body-unfold"));
    expect(screen.getByTestId("the-chat")).toBeTruthy();
  });

  // ▶ preview raises its run cell from the agent's own footer, never through a tile — so the fold follows the
  // split, not the click (operator 2026-09-23: "it opened preview but didn't collapse the sidebar right")
  it("folds the Studio rail for a widget that opened without a tile click", () => {
    const { rerender } = mount(vi.fn());
    expect(screen.getByTestId("agents-catalogue").getAttribute("data-folded")).toBeNull();
    rerender(
      <DockZone zone="center" layout="threads" items={[ITEM]} collapsed={[]} sideTab="chats"
        onToggle={() => {}} onCloseItem={() => {}}
        catalog={[{ category: "tools", kinds: [kind(vi.fn()), kind(vi.fn(), "design-frames")] }]}
        chatsBody={<div data-testid="the-chat" />} chatsSplit={<div data-testid="split-pane" />} />
    );
    expect(screen.getByTestId("agents-catalogue").getAttribute("data-folded")).toBe("1");
  });

  // operator 2026-09-23: "even if i expanded, when i choose a widget collapse again"
  it("folds again on EVERY pick, not only the first", () => {
    const add = vi.fn();
    mount(add);
    fireEvent.click(screen.getByTestId("studio-kind-shared-diff"));
    fireEvent.click(screen.getByTestId("studio-rail-unfold"));
    expect(screen.getByTestId("agents-catalogue").getAttribute("data-folded")).toBeNull();
    fireEvent.click(screen.getByTestId("studio-kind-shared-diff"));
    expect(screen.getByTestId("agents-catalogue").getAttribute("data-folded")).toBe("1");
    expect(add).toHaveBeenCalledTimes(2);
  });
});
