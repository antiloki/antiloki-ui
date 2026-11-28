// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import * as client from "@/loki/api/client";
import { MultiplexWindow } from "./MultiplexWindow";
import { InstallMultiplex } from "./InstallMultiplex";
import { multiplexManifest } from "./multiplex-app";

afterEach(() => { cleanup(); vi.restoreAllMocks(); delete (window as any).documentPictureInPicture; delete (window as any).__TAURI__; });
const offer = () => { const e: any = new Event("beforeinstallprompt"); e.prompt = vi.fn(); act(() => { window.dispatchEvent(e); }); return e; };
describe("multiplex as an app", () => {
  it("has its own manifest", () => { const m = multiplexManifest("http://x", []); expect([m.start_url, m.scope, m.display, m.name]).toEqual(["http://x/multiplex", "http://x/multiplex", "standalone", "antiloki Multiplex"]); });
  it("the start screen installs it in one click, and opens it where the browser offers nothing", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null); render(<InstallMultiplex />);
    const btn = screen.getByTestId("install-multiplex-btn"); expect(btn.textContent).toContain("Open Multiplex"); fireEvent.click(btn); expect(open).toHaveBeenCalled();
    const e = offer(); expect(btn.textContent).toContain("Install Multiplex"); fireEvent.click(btn); expect(e.prompt).toHaveBeenCalled();
  });
  it("shows the agents, even when none run, and says when antiloki does not answer", async () => {
    const get = vi.spyOn(client, "apiGet").mockResolvedValue({ agents: [] } as any); vi.spyOn(client, "apiPost").mockResolvedValue({ runs: [] } as any);
    const a = render(<MultiplexWindow pollMs={100000} />); await waitFor(() => expect(screen.getByTestId("closed-avatar-head").textContent).toContain("all quiet")); expect(screen.queryByTestId("multiplex-pin")).toBeNull(); a.unmount();
    get.mockRejectedValue(new Error("down")); render(<MultiplexWindow pollMs={100000} />); await screen.findByTestId("multiplex-down");
  });
  it("the mark is all colour only while an agent runs", async () => {
    const get = vi.spyOn(client, "apiGet").mockResolvedValue({ agents: [{ pane_id: 1, name: "Docs", role: "", kind: "claude", state: "work" }] } as any); vi.spyOn(client, "apiPost").mockResolvedValue({ runs: [] } as any);
    const a = render(<MultiplexWindow pollMs={100000} />); await waitFor(() => expect(screen.getByTestId("closed-avatar-face").getAttribute("data-running")).toBe("1")); a.unmount();
    get.mockResolvedValue({ agents: [{ pane_id: 1, name: "Docs", role: "", kind: "claude", state: "wait" }] } as any);
    render(<MultiplexWindow pollMs={100000} />); await waitFor(() => expect(screen.getByTestId("closed-avatar-head").textContent).toContain("1 waiting")); expect(screen.getByTestId("closed-avatar-face").getAttribute("data-running")).toBe("0");
  });
  it("pins into a floating window and comes back", async () => {
    vi.spyOn(client, "apiGet").mockResolvedValue({ agents: [{ pane_id: 1, name: "Docs", role: "", kind: "claude", state: "work" }] } as any); vi.spyOn(client, "apiPost").mockResolvedValue({ runs: [] } as any);
    const doc = document.implementation.createHTMLDocument(""); let gone: () => void = () => {};
    const pip: any = { document: doc, addEventListener: (_: string, f: () => void) => { gone = f; }, close: () => gone(), setInterval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window) };
    (window as any).documentPictureInPicture = { requestWindow: async () => pip };
    render(<MultiplexWindow pollMs={100000} />); fireEvent.click(await screen.findByTestId("multiplex-pin"));
    await waitFor(() => expect(doc.body.querySelector('[data-testid="multiplex-pinned"]')?.textContent).toContain("Docs")); expect(screen.getByTestId("multiplex-away")).toBeTruthy();
    act(() => pip.close()); await waitFor(() => expect(screen.getByTestId("multiplex-window")).toBeTruthy());
  });
});
