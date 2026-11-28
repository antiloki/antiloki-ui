// With the left rail hidden, this circle is the ENTIRE system chrome — if its menu can't be opened,
// or can't be closed, the operator has no way to reach settings, the palette or the workspace
// switcher. The scrim that closes it on an outside click is the part most likely to regress.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const setPaletteOpen = vi.fn();
const setChatOpen = vi.fn();
let chatOpen = false;
let workspaces: any = { active: { name: "antiloki" }, workspaces: [] };

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}));
vi.mock("./slug-context", () => ({ useShell: () => ({ setPaletteOpen, setChatOpen, chatOpen }) }));
vi.mock("@/loki/api/hooks", () => ({ useWorkspaces: () => ({ data: workspaces }) }));
vi.mock("./sidebar", () => ({ WorkspaceSwitcher: () => <div data-testid="switcher" /> }));
const openDocs = vi.fn();
vi.mock("@/loki/desktop/shell", () => ({ openDocs: () => openDocs() }));

import { MenuCircle, CornerMenu } from "./corner-menu";

const open = () => fireEvent.click(screen.getAllByRole("button")[0]);

beforeEach(() => {
  setPaletteOpen.mockReset(); setChatOpen.mockReset(); openDocs.mockReset();
  chatOpen = false;
  workspaces = { active: { name: "antiloki" }, workspaces: [] };
});

describe("the circle", () => {
  it("shows the active workspace's initial", () => {
    render(<MenuCircle />);
    expect(screen.getAllByRole("button")[0].textContent).toBe("A");
  });

  it("falls back to ? when no workspace is active yet", () => {
    workspaces = { active: null };
    render(<MenuCircle />);
    expect(screen.getAllByRole("button")[0].textContent).toBe("?");
  });

  it("names the workspace in its tooltip, and still explains itself without one", () => {
    const { unmount } = render(<MenuCircle />);
    expect(screen.getAllByRole("button")[0].getAttribute("title")).toContain("antiloki —");
    unmount();
    workspaces = { active: null };
    render(<MenuCircle />);
    expect(screen.getAllByRole("button")[0].getAttribute("title")).toBe("settings · workspace · profile");
  });

  it("scales its glyph with the requested size", () => {
    render(<MenuCircle size={40} />);
    const el = screen.getAllByRole("button")[0];
    expect(el.style.width).toBe("40px");
    expect(parseFloat(el.style.fontSize)).toBe(16);
  });
});

describe("the menu", () => {
  it("stays closed until the circle is clicked", () => {
    render(<MenuCircle />);
    expect(screen.queryByText("Settings")).toBeNull();
    open();
    expect(screen.getByText("Docs")).toBeTruthy();
  });

  it("offers every system destination, including the workspace switcher", () => {
    render(<MenuCircle />);
    open();
    for (const label of ["Search · jump · run", "Side chat", "Docs"]) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
    expect(screen.getByTestId("switcher")).toBeTruthy();
  });

  it("opens the documentation on the website, in the system browser, instead of an in-app page", () => {
    render(<MenuCircle />);
    open();
    expect(screen.getByText("Docs").closest("a")).toBeNull();   // not a route any more
    fireEvent.click(screen.getByText("Docs"));
    expect(openDocs).toHaveBeenCalledTimes(1);
  });

  it("opens the palette and closes itself", () => {
    render(<MenuCircle />);
    open();
    fireEvent.click(screen.getByText("Search · jump · run"));
    expect(setPaletteOpen).toHaveBeenCalledWith(true);
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("toggles the side chat rather than always opening it", () => {
    const { unmount } = render(<MenuCircle />);
    open();
    fireEvent.click(screen.getByText("Side chat"));
    expect(setChatOpen).toHaveBeenCalledWith(true);
    unmount();

    chatOpen = true;
    render(<MenuCircle />);
    open();
    fireEvent.click(screen.getByText("Side chat"));
    expect(setChatOpen).toHaveBeenLastCalledWith(false);
  });

  it("closes when a link is followed", () => {
    render(<MenuCircle />);
    open();
    fireEvent.click(screen.getByText("Docs"));
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("closes on an outside click via the full-screen scrim", () => {
    const { container } = render(<MenuCircle />);
    open();
    const scrim = Array.from(container.querySelectorAll("div"))
      .find((d) => (d as HTMLElement).style.position === "fixed" && (d as HTMLElement).style.inset === "0px")!;
    fireEvent.click(scrim);
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("closes when the circle is clicked again", () => {
    render(<MenuCircle />);
    open();
    open();
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("opens downward by default and upward for a bottom-anchored host", () => {
    const panel = (c: HTMLElement) => Array.from(c.querySelectorAll("div"))
      .find((d) => (d as HTMLElement).style.width === "236px") as HTMLElement;

    const down = render(<MenuCircle />);
    fireEvent.click(down.container.querySelector("button")!);
    expect(panel(down.container).style.top).toBe("calc(100% + 8px)");

    const up = render(<MenuCircle up />);
    fireEvent.click(up.container.querySelector("button")!);
    expect(panel(up.container).style.bottom).toBe("calc(100% + 8px)");
  });
});

describe("CornerMenu", () => {
  it("pins the circle to the top-right above the page content", () => {
    const { container } = render(<CornerMenu />);
    const fixed = container.firstChild as HTMLElement;
    expect(fixed.style.position).toBe("fixed");
    expect(fixed.style.right).toBe("14px");
    expect(Number(fixed.style.zIndex)).toBeGreaterThan(100);
  });
});
