// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
const frame = vi.fn(); const launch = vi.fn();
vi.mock("./api", () => ({ checkFrame: (...a: any[]) => frame(...a), launchAppWindow: (...a: any[]) => launch(...a), appTools: async () => ({ ok: false, tools: [], signed_in: false, needs_signin: false }), appSignIn: vi.fn(), appCall: vi.fn() }));
import { WebAppPane } from "./WebAppPane";
const app = { id: "linear", name: "Linear", url: "https://linear.app" };
describe("an installed web app's pane", () => {
  beforeEach(() => { frame.mockReset(); launch.mockReset(); }); afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it("shows the page in a frame when the site allows it", async () => {
    frame.mockResolvedValue({ frameable: true, why: "" }); render(<WebAppPane app={app} />); expect(screen.getByTestId("webapp-checking")).toBeTruthy();
    await waitFor(() => screen.getByTestId("webapp-frame")); expect((screen.getByTestId("webapp-frame") as HTMLIFrameElement).src).toBe("https://linear.app/"); expect(screen.queryByTestId("webapp-refuses")).toBeNull();
  });
  it("says so when the site forbids being framed (no broken frame) and starts the app as a window of its own through the serve", async () => {
    frame.mockResolvedValue({ frameable: false, why: "it sends X-Frame-Options: deny" }); launch.mockResolvedValue({ ok: true }); const open = vi.spyOn(window, "open");
    render(<WebAppPane app={app} />); await waitFor(() => screen.getByTestId("webapp-refuses")); expect(screen.queryByTestId("webapp-frame")).toBeNull(); expect(screen.getByTestId("webapp-why").textContent).toContain("X-Frame-Options: deny");
    fireEvent.click(screen.getByTestId("webapp-window-main")); await waitFor(() => expect(screen.getByTestId("webapp-note").textContent).toContain("open in its own window")); expect(launch).toHaveBeenCalledWith(app); expect(open).not.toHaveBeenCalled();
    expect(screen.getByTestId("webapp-external").getAttribute("href")).toBe("https://linear.app");
  });
  it("falls back to the browser's pop-up when the serve cannot start a window, and says if that is blocked too", async () => {
    frame.mockResolvedValue({ frameable: false, why: "" }); launch.mockResolvedValue({ ok: false, error: "no Chromium-family browser was found" }); const open = vi.spyOn(window, "open").mockReturnValue({ focus: vi.fn() } as any);
    render(<WebAppPane app={app} />); await waitFor(() => screen.getByTestId("webapp-refuses")); fireEvent.click(screen.getByTestId("webapp-window-main")); await waitFor(() => expect(open).toHaveBeenCalledWith("https://linear.app", "antiloki-app-linear", expect.stringContaining("popup")));
    expect(screen.getByTestId("webapp-note").textContent).toContain("no Chromium-family browser"); open.mockReturnValue(null); fireEvent.click(screen.getByTestId("webapp-window-main")); await waitFor(() => expect(screen.getByTestId("webapp-popup-blocked")).toBeTruthy());
  });
  it("tries the frame when the serve cannot say", async () => { frame.mockResolvedValue({ frameable: "unknown", why: "" }); render(<WebAppPane app={app} />); await waitFor(() => screen.getByTestId("webapp-frame")); });
});
