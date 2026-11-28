// A WIDGET OPENS BESIDE THE CHAT (operator 2026-09-23). The cards this started as are gone — "do not show them in
// the chat inside", "the widget headers take out … integrate them into the page on the splitted section". What is
// left is the rule that keeps this from becoming threads: ONE widget beside the conversation at a time.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SplitPane, readSplit, writeSplit, splitKey, widgetWord, CHAT_WIDGETS, type ChatWidget } from "./chat-widgets";

vi.mock("@/loki/widgets/widget-host", () => ({ WidgetHost: ({ widget }: any) => <div data-testid={`host-${widget.kind}`}>{widget.kind}</div> }));

const w = (id = "w1", kind = "shared-diff"): ChatWidget =>
  ({ id, seq: 3, t: Date.now(), title: "the diff", why: "after the edit", widget: { kind, key: id, payload: {} } as any });

describe("the widget beside the chat", () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* fine */ } });

  it("renders the widget itself, with no chrome of its own around it", () => {
    render(<SplitPane w={w()} onClose={() => {}} />);
    const pane = screen.getByTestId("split-pane");
    expect(screen.getByTestId("host-shared-diff")).toBeTruthy();
    expect(pane.textContent).not.toContain("the diff");   // no title bar — the widget brings its own header
  });

  it("strips the widget's own frame so it reads as the page, not a card", () => {
    render(<SplitPane w={w()} onClose={() => {}} />);
    expect(screen.getByTestId("host-shared-diff").closest(".lwx-flat")).toBeTruthy();
  });

  it("closes from the ✕ laid over it, which says what it closes", () => {
    const onClose = vi.fn();
    render(<SplitPane w={w()} onClose={onClose} />);
    const x = screen.getByTestId("split-close");
    expect(x.getAttribute("title")).toMatch(/the diff/);
    fireEvent.click(x);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("⤢ takes it over the whole screen, and ⤡ brings it back beside the chat", () => {
    render(<SplitPane w={w()} onClose={() => {}} />);
    const b = screen.getByTestId("split-full");
    expect(screen.getByTestId("split-pane").getAttribute("data-full")).toBeNull();
    fireEvent.click(b);
    const full = screen.getByTestId("split-pane");
    expect(full.getAttribute("data-full")).toBe("1");
    // the desk animates with transforms, and a transformed ancestor captures position:fixed — so full screen has
    // to leave the tree entirely or it is "fixed" to its own column
    expect(full.parentElement).toBe(document.body);
    fireEvent.click(screen.getByTestId("split-full"));
    expect(screen.getByTestId("split-pane").getAttribute("data-full")).toBeNull();
  });

  it("Escape leaves full screen", () => {
    render(<SplitPane w={w()} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("split-full"));
    expect(screen.getByTestId("split-pane").getAttribute("data-full")).toBe("1");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("split-pane").getAttribute("data-full")).toBeNull();
  });

  it("one split at a time, remembered per pane — this is what keeps it from becoming threads", () => {
    expect(readSplit(7)).toBeNull();
    writeSplit(7, "w1");
    expect(readSplit(7)).toBe("w1");
    writeSplit(7, "w2");                      // a second widget REPLACES the first, never adds a zone
    expect(readSplit(7)).toBe("w2");
    expect(readSplit(8)).toBeNull();          // another pane has its own
    writeSplit(7, null);
    expect(readSplit(7)).toBeNull();
    expect(splitKey(7)).toBe("antiloki:split-widget:7");
  });

  it("names the widgets a chat can raise the way a person would say them", () => {
    expect(widgetWord("shared-diff")).toBe(CHAT_WIDGETS["shared-diff"]);
    expect(widgetWord("atlas-xray")).toBe("the review");
    expect(widgetWord("atlas-something-else")).toBe("something else");   // an unlisted kind still reads as words
  });
});
