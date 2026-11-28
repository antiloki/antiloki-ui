// The rail is the only persistent chrome in the app: if its active-match logic is wrong the operator
// can't tell which product they're in, and if the bottom menu can't be opened there is no route to
// settings, the palette or the workspace switcher at all. Both are pinned here.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

let pathname = "/";
let railCollapsed = false;
const setPaletteOpen = vi.fn();
const setChatOpen = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
  useLocation: () => ({ pathname }),
}));
vi.mock("./slug-context", () => ({
  useShell: () => ({ railCollapsed, setPaletteOpen, setChatOpen, chatOpen: false }),
}));
vi.mock("@/loki/api/hooks", () => ({ useWorkspaces: () => ({ data: { active: { name: "antiloki" } } }) }));
vi.mock("./sidebar", () => ({ WorkspaceSwitcher: () => <div data-testid="switcher" /> }));
vi.mock("./topbar", () => ({ DoingCardsDropdown: () => null }));
const openDocs = vi.fn();
vi.mock("@/loki/desktop/shell", () => ({ openDocs: () => openDocs() }));

import { ActivityBar } from "./activity-bar";

const link = (label: string) => screen.getByTitle(label) as HTMLAnchorElement;
const colourOf = (el: HTMLElement) => el.style.color;

beforeEach(() => { pathname = "/"; railCollapsed = false; setPaletteOpen.mockReset(); setChatOpen.mockReset(); openDocs.mockReset(); });

describe("destinations", () => {
  it("offers every product surface, each routed to its own path", () => {
    render(<ActivityBar />);
    const expected: Record<string, string> = {
      Agent: "/",
      Harness: "/operations",
      "Pulls & Tests": "/operations/pulls",
      Code: "/operations/atlas",
      "Ultra Review": "/ultra-review",
      "Bug Finder": "/bug-finder",
      Tagging: "/tagging",
    };
    for (const [label, to] of Object.entries(expected)) {
      expect(link(label).getAttribute("href"), label).toBe(to);
    }
  });

  it("highlights the destination matching the current route", () => {
    render(<ActivityBar />);
    const muted = colourOf(link("Tagging"));    // known-inactive on "/"
    expect(colourOf(link("Agent"))).not.toBe(muted);
  });

  it("keeps a deep route highlighted on its parent product", () => {
    const cases: Array<[string, string]> = [
      ["/operations/waterfall/FEAT-X", "Harness"],
      ["/operations/pipeline", "Harness"],
      ["/operations/tests", "Pulls & Tests"],
      ["/operations/design", "Code"],
      ["/operations/atlas/file", "Code"],
      ["/ultra-review/42", "Ultra Review"],
    ];
    for (const [path, label] of cases) {
      pathname = path;
      const { unmount } = render(<ActivityBar />);
      const muted = colourOf(link("Tagging"));
      expect(colourOf(link(label)), `${path} → ${label}`).not.toBe(muted);
      unmount();
    }
  });

  it("does NOT light up Agent on a deep route — '/' matches exactly", () => {
    pathname = "/operations";
    render(<ActivityBar />);
    expect(colourOf(link("Agent"))).toBe(colourOf(link("Tagging")));
  });

  it("does not confuse the pulls route with the harness board", () => {
    pathname = "/operations/pulls";
    render(<ActivityBar />);
    const muted = colourOf(link("Tagging"));
    expect(colourOf(link("Pulls & Tests"))).not.toBe(muted);
    expect(colourOf(link("Harness"))).toBe(muted);
  });
});

describe("collapsing", () => {
  it("narrows the rail and drops the labels, keeping the icons and their tooltips", () => {
    const wide = render(<ActivityBar />);
    expect(screen.getByText("Harness")).toBeTruthy();
    const wideWidth = parseFloat((wide.container.firstChild as HTMLElement).style.width);
    wide.unmount();

    railCollapsed = true;
    const narrow = render(<ActivityBar />);
    expect(parseFloat((narrow.container.firstChild as HTMLElement).style.width)).toBeLessThan(wideWidth);
    expect(screen.queryByText("Harness")).toBeNull();
    expect(link("Harness")).toBeTruthy();             // still reachable, still labelled
  });

  it("swaps the wordmark for the monogram when collapsed", () => {
    const home = () => screen.getByRole("link", { name: /antiloki|a\./ });
    const { unmount } = render(<ActivityBar />);
    expect(home().textContent).toBe("antiloki.");
    unmount();

    railCollapsed = true;
    render(<ActivityBar />);
    expect(home().textContent).toBe("a.");
  });
});

describe("the workspace menu at the bottom", () => {
  const openMenu = () => fireEvent.click(screen.getByTitle(/menu/));

  it("shows the active workspace by name and initial", () => {
    render(<ActivityBar />);
    const menu = screen.getByTitle("antiloki — menu");
    expect(menu.textContent).toBe("Aantiloki");   // the avatar initial, then the name
  });

  it("stays closed until clicked, then offers the system rows", () => {
    render(<ActivityBar />);
    expect(screen.queryByText("Settings")).toBeNull();
    openMenu();
    for (const label of ["Search · jump · run", "Side chat", "Docs"]) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
    expect(screen.getByTestId("switcher")).toBeTruthy();
  });

  it("opens the website's documentation from the Docs row and closes the menu", () => {
    render(<ActivityBar />);
    openMenu();
    fireEvent.click(screen.getByText("Docs"));
    expect(openDocs).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("opens the palette and closes the menu", () => {
    render(<ActivityBar />);
    openMenu();
    fireEvent.click(screen.getByText("Search · jump · run"));
    expect(setPaletteOpen).toHaveBeenCalledWith(true);
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("toggles the side chat", () => {
    render(<ActivityBar />);
    openMenu();
    fireEvent.click(screen.getByText("Side chat"));
    expect(setChatOpen).toHaveBeenCalledWith(true);
  });

  it("closes on an outside click", () => {
    const { container } = render(<ActivityBar />);
    openMenu();
    const scrim = Array.from(container.querySelectorAll("div"))
      .find((d) => (d as HTMLElement).style.position === "fixed" && (d as HTMLElement).style.inset === "0px")!;
    fireEvent.click(scrim);
    expect(screen.queryByText("Settings")).toBeNull();
  });
});
