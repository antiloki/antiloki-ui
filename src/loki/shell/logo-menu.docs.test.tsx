// The Docs row of the logo menu (the menu that holds Settings) opens the documentation on the website in the
// system browser; it is not a route inside the app (operator 2026-10-12).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const openDocs = vi.fn();
vi.mock("@/loki/desktop/shell", () => ({ openDocs: () => openDocs() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
  useNavigate: () => () => {},
}));
vi.mock("./slug-context", () => ({ useShellMaybe: () => null }));
vi.mock("@/loki/api/hooks", () => ({ useWorkspaces: () => ({ data: { active: { name: "antiloki" }, workspaces: [] } }) }));
vi.mock("./sidebar", () => ({ WorkspaceSwitcher: () => <div /> }));
vi.mock("@/loki/codebase/rebuild-panel", () => ({ RebuildPanel: () => <div /> }));

import { LogoMenu } from "./logo-menu";

describe("logo menu · Docs", () => {
  it("opens the website docs and is not a link to an in-app route", () => {
    render(<LogoMenu />);
    fireEvent.click(screen.getAllByRole("button")[0]);   // pin it open
    const row = screen.getByText("Docs");
    expect(row.closest("a")).toBeNull();
    fireEvent.click(row);
    expect(openDocs).toHaveBeenCalledTimes(1);
  });
});
