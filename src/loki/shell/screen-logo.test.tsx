// THE LOGO MENU IS ON THE LIVE HEADER, NOT A DEAD ONE (2026-09-27).
//
// The first attempt at "return the antiloki logo dropdown to the top header left" put it in `top-tabs.tsx` — and
// NOTHING MOUNTS THAT FILE: `TopTabs` and `ActivityBar` are each imported only by their own test. The operator saw no
// change, correctly. This test exists so the next person cannot repeat it: it asserts the logo renders from the
// component the root layout actually draws.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...p }: any) => <a {...p}>{children}</a>,
  useLocation: () => ({ pathname: "/cost" }),
  useRouter: () => ({ navigate: vi.fn() }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/loki/api/hooks", () => ({ useWorkspaces: () => ({ data: { workspaces: [] } }) }));
vi.mock("./slug-context", () => ({ useShellMaybe: () => null }));
vi.mock("@/loki/codebase/rebuild-panel", () => ({ RebuildPanel: () => null }));
vi.mock("./sidebar", () => ({ WorkspaceSwitcher: () => null }));

import { ScreenSwitch } from "./screen-switch";

describe("the live header carries the logo menu", () => {
  it("renders it, fixed at the top-left", () => {
    const { queryByTestId } = render(<ScreenSwitch />);
    const slot = queryByTestId("screen-logo-menu");
    expect(slot).not.toBeNull();
    expect(slot!.getAttribute("style") || "").toMatch(/position:\s*fixed/);
    expect(slot!.getAttribute("style") || "").toMatch(/left:\s*10px/);
  });
});
