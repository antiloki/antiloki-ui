// The dock is chrome that follows the operator everywhere, so its failure modes are spatial: a
// panel that can be resized past the viewport, an edge-drop that docks to the wrong side, a
// fullscreen you cannot escape, or a panel that appears on the two screens it must stay off
// (settings, and the Agent chat, which has its own composer).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: "/operations" }),
  useRouter: () => ({ navigate: vi.fn() }),
}));
vi.mock("@/loki/chat/chat-modes", () => ({ ModeSwitch: () => <div data-testid="modes" /> }));
vi.mock("@/loki/components/Markdown", () => ({ Markdown: ({ text }: any) => <div>{text}</div> }));
const turn = vi.hoisted(() => ({ fn: vi.fn(async (..._a: any[]) => ({ result: { response_md: "the answer" } } as any)) }));
vi.mock("@/loki/api/dispatch", () => ({ sendChatTurn: (...a: any[]) => turn.fn(...a) }));
vi.mock("@/loki/chat/screen-manifest", () => ({ composeScreenManifest: () => "## page · xray\nverdict: 412 files", screenActionsFor: () => [] }));
vi.mock("@/loki/chat/ui-bus", () => ({ executeUiCommands: vi.fn(), describeUiCommand: () => "" }));
vi.mock("@/loki/api/codebase", () => ({ onboardStart: vi.fn(async () => ({ job_id: "j" })) }));
vi.mock("@/loki/api/client", () => ({ getFeSession: () => "sess" }));
vi.mock("./corner-menu", () => ({ MenuCircle: () => <div data-testid="corner" /> }));

import { GlassBar, DockGrip, DockShell, DockPanel, useDockSurface } from "./dock";
import { dockStore } from "./dock-store";

const reset = () => act(() => dockStore.set({ side: null, size: 420, collapsed: false, full: false, surface: null }));

const drag = (to: { x: number; y: number }) => {
  fireEvent.pointerDown(screen.getByTitle(/drag to an edge/), { clientX: 500, clientY: 400 });
  act(() => { window.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: to.x, clientY: to.y })); });
  act(() => { window.dispatchEvent(Object.assign(new Event("pointerup"), { clientX: to.x, clientY: to.y })); });
};

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, "innerWidth", { value: 1200, writable: true, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, writable: true, configurable: true });
  reset();
});
afterEach(reset);

describe("GlassBar", () => {
  it("is a ghost at rest and becomes solid on hover", () => {
    const { container } = render(<GlassBar>x</GlassBar>);
    const bar = container.firstChild as HTMLElement;
    const rest = parseFloat(bar.style.opacity);
    fireEvent.mouseEnter(bar);
    expect(parseFloat(bar.style.opacity)).toBeGreaterThan(rest);
    fireEvent.mouseLeave(bar);
    expect(parseFloat(bar.style.opacity)).toBe(rest);
  });

  it("also wakes up when something inside it takes focus", () => {
    const { container } = render(<GlassBar><input /></GlassBar>);
    const bar = container.firstChild as HTMLElement;
    const rest = parseFloat(bar.style.opacity);
    fireEvent.focus(container.querySelector("input")!);
    expect(parseFloat(bar.style.opacity)).toBeGreaterThan(rest);
  });

  it("lets the caller override its styling and keeps its children", () => {
    const { container } = render(<GlassBar style={{ marginTop: 40 }}>content</GlassBar>);
    expect((container.firstChild as HTMLElement).style.marginTop).toBe("40px");
    expect(container.textContent).toBe("content");
  });
});

describe("DockGrip — drag to an edge to dock there", () => {
  it("docks to whichever edge the pointer was released on", () => {
    for (const [pos, side] of [
      [{ x: 20, y: 400 }, "left"],
      [{ x: 1180, y: 400 }, "right"],
      [{ x: 600, y: 20 }, "top"],
      [{ x: 600, y: 780 }, "bottom"],
    ] as const) {
      reset();
      const { unmount } = render(<DockGrip />);
      drag(pos);
      expect(dockStore.get().side, side).toBe(side);
      unmount();
    }
  });

  it("does nothing when released in the middle of the screen", () => {
    render(<DockGrip />);
    drag({ x: 600, y: 400 });
    expect(dockStore.get().side).toBeNull();
  });

  it("un-collapses on a drop, so the panel is actually visible where it landed", () => {
    act(() => dockStore.set({ collapsed: true }));
    render(<DockGrip />);
    drag({ x: 20, y: 400 });
    expect(dockStore.get().collapsed).toBe(false);
  });

  it("shows the drop hints and a cursor ghost only while dragging", () => {
    const { container } = render(<DockGrip />);
    const overlays = () => container.querySelectorAll("div");
    expect(overlays()).toHaveLength(0);

    fireEvent.pointerDown(screen.getByTitle(/drag to an edge/), { clientX: 500, clientY: 400 });
    act(() => { window.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: 20, clientY: 400 })); });
    expect(overlays().length).toBeGreaterThan(0);
    expect(container.textContent).toContain("Message antiloki…");

    act(() => { window.dispatchEvent(Object.assign(new Event("pointerup"), { clientX: 20, clientY: 400 })); });
    expect(overlays()).toHaveLength(0);
  });

  it("stops listening to the window once the drag ends", () => {
    render(<DockGrip />);
    drag({ x: 20, y: 400 });
    act(() => dockStore.set({ side: null }));
    act(() => { window.dispatchEvent(Object.assign(new Event("pointerup"), { clientX: 1180, clientY: 400 })); });
    expect(dockStore.get().side).toBeNull();   // a stray pointerup must not re-dock
  });
});

describe("DockShell", () => {
  const mount = (props: any = {}) => render(<DockShell {...props}><div>transcript</div></DockShell>);

  it("renders nothing while floating or collapsed", () => {
    expect(mount().container).toBeEmptyDOMElement();
    act(() => dockStore.set({ side: "right", collapsed: true }));
    expect(mount().container).toBeEmptyDOMElement();
  });

  it("anchors to its side at the stored size", () => {
    act(() => dockStore.set({ side: "right", size: 500 }));
    const { container } = mount();
    const panel = container.firstChild as HTMLElement;
    expect(panel.style.position).toBe("fixed");
    expect(panel.style.right).toBe("0px");
    expect(panel.style.width).toBe("500px");
  });

  it("fills the viewport in fullscreen and drops the resize handle", () => {
    act(() => dockStore.set({ side: "right", full: true }));
    const { container } = mount();
    const panel = container.firstChild as HTMLElement;
    expect([panel.style.top, panel.style.bottom, panel.style.left, panel.style.right]).toEqual(["0px", "0px", "0px", "0px"]);
    expect(screen.queryByTitle("drag to resize")).toBeNull();
  });

  it("says where it is docked, and that it is fullscreen when it is", () => {
    act(() => dockStore.set({ side: "left" }));
    const { unmount } = mount({ label: "antiChat" });
    expect(screen.getByText("antiChat · docked left")).toBeTruthy();
    unmount();
    act(() => dockStore.set({ full: true }));
    mount({ label: "antiChat" });
    expect(screen.getByText("antiChat · fullscreen")).toBeTruthy();
  });

  it("offers the three OTHER sides to move to, never the current one", () => {
    act(() => dockStore.set({ side: "right" }));
    mount();
    expect(screen.queryByTitle("dock right")).toBeNull();
    for (const s of ["left", "top", "bottom"]) expect(screen.getByTitle(`dock ${s}`)).toBeTruthy();
    fireEvent.click(screen.getByTitle("dock top"));
    expect(dockStore.get().side).toBe("top");
  });

  it("floats again, collapses to the pill, and toggles fullscreen from the header", () => {
    act(() => dockStore.set({ side: "right" }));
    const { unmount } = mount();
    fireEvent.click(screen.getByTitle(/expand — the chat takes the whole screen/));
    expect(dockStore.get().full).toBe(true);
    unmount();

    act(() => dockStore.set({ full: false, side: "right", collapsed: false }));
    const second = mount();
    fireEvent.click(screen.getByTitle(/collapse to the pill/));
    expect(dockStore.get()).toMatchObject({ collapsed: true, full: false, side: "right" });
    second.unmount();

    act(() => dockStore.set({ collapsed: false }));
    mount();
    fireEvent.click(screen.getByTitle(/float again/));
    expect(dockStore.get().side).toBeNull();
  });

  it("leaves fullscreen on Escape — and only while fullscreen", () => {
    act(() => dockStore.set({ side: "right", full: true }));
    const { unmount } = mount();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dockStore.get().full).toBe(false);
    unmount();

    act(() => dockStore.set({ side: "right", collapsed: false }));
    mount();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dockStore.get().side).toBe("right");   // Escape does not close a docked panel
  });

  it("resizes by dragging the divider, clamped to sane bounds", () => {
    act(() => dockStore.set({ side: "right", size: 420 }));
    mount();
    const divider = screen.getByTitle("drag to resize");

    const dragTo = (x: number) => {
      fireEvent.pointerDown(divider, { clientX: 1200 - 420, clientY: 400 });
      act(() => { window.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: x, clientY: 400 })); });
      act(() => { window.dispatchEvent(Object.assign(new Event("pointerup"), { clientX: x, clientY: 400 })); });
    };

    dragTo(700);
    expect(dockStore.get().size).toBe(500);
    dragTo(1190);                      // dragged past the right edge → the minimum, not 10px
    expect(dockStore.get().size).toBe(320);
    dragTo(0);                         // dragged off the left → capped at 60% of the viewport
    expect(dockStore.get().size).toBe(680);
  });

  it("is a ghost overlay at rest (2026-09-19: the screen keeps its width), solid on hover / focus / boost / fullscreen", () => {
    act(() => dockStore.set({ side: "right" }));
    const { container, unmount } = mount();
    const panel = () => container.firstChild as HTMLElement;
    expect(parseFloat(panel().style.opacity)).toBeLessThan(1);
    fireEvent.mouseEnter(panel());
    expect(parseFloat(panel().style.opacity)).toBe(1);
    fireEvent.mouseLeave(panel());
    expect(parseFloat(panel().style.opacity)).toBeLessThan(1);
    unmount();

    const boosted = mount({ boost: true });
    expect(parseFloat((boosted.container.firstChild as HTMLElement).style.opacity)).toBe(1);
    boosted.unmount();
    act(() => dockStore.set({ side: "right", full: true }));
    const fullscreen = mount();
    expect(parseFloat((fullscreen.container.firstChild as HTMLElement).style.opacity)).toBe(1);
  });

  it("renders whatever transcript it was given", () => {
    act(() => dockStore.set({ side: "right" }));
    mount();
    expect(screen.getByText("transcript")).toBeTruthy();
  });
});

describe("useDockSurface — a screen claiming the floating field", () => {
  const surface = { placeholder: "ask the concierge…", submit: vi.fn() };
  function Claimer({ s }: { s: any }) { useDockSurface(s); return null; }

  it("registers on mount and releases on unmount", () => {
    const { unmount } = render(<Claimer s={surface} />);
    expect(dockStore.get().surface).toBe(surface);
    unmount();
    expect(dockStore.get().surface).toBeNull();
  });

  it("does not clear a surface another screen has since claimed", () => {
    const other = { placeholder: "other", submit: vi.fn() };
    const { unmount } = render(<Claimer s={surface} />);
    act(() => dockStore.set({ surface: other }));
    unmount();
    expect(dockStore.get().surface).toBe(other);
  });

  it("claiming null explicitly hands the field back", () => {
    act(() => dockStore.set({ surface }));
    render(<Claimer s={null} />);
    expect(dockStore.get().surface).toBeNull();
  });
});

// X-RAY HAS NO CHAT (operator 2026-09-29): the ghost field, the docked panel and the ✦ pill all obey panelHiddenHere.
describe("where the chat may ride", () => {
  it("is absent on X-ray (and its sub-routes) and on settings, present elsewhere", async () => {
    const { panelHiddenHere } = await import("./dock");
    expect(panelHiddenHere("/operations/atlas", "vibe")).toBe(true);
    expect(panelHiddenHere("/sagas", "vibe")).toBe(true); expect(panelHiddenHere("/sagas", "agent")).toBe(true);   // SAGAS HAS NO CHAT (2026-10-11)
    expect(panelHiddenHere("/operations/atlas/anything", "agent")).toBe(true);
    expect(panelHiddenHere("/settings/byok", "vibe")).toBe(false);
    expect(panelHiddenHere("/operations/pulls", "vibe")).toBe(false);
    expect(panelHiddenHere("/operations", "vibe")).toBe(false);
    expect(panelHiddenHere("/", "vibe")).toBe(false);
    expect(panelHiddenHere("/", "agent")).toBe(true);
  });
});

describe("the docked chat is a column (2026-09-18): the screen pads by its size", () => {
  it("dockInset takes no room any more — the docked chat floats over the screen (2026-09-19)", async () => {
    const { dockInset } = await import("./dock");
    const base = { side: "right" as const, size: 420, collapsed: false, full: false, chatMode: "agent" };
    expect(dockInset(base, "/operations/atlas")).toEqual({});
    expect(dockInset({ ...base, side: "left" }, "/x")).toEqual({});
    expect(dockInset({ ...base, side: null }, "/x")).toEqual({});
  });
});

// THE DOCKED CHAT'S TURN (2026-09-19: "make the antiChat see the screen on the left"): the panel
// sends the screen manifest (pages included), rides the operator's CLI engine pin, and shows the
// interviewer's `response_md` — before, it ignored the pin and printed "(no reply)" over a real answer.
describe("DockPanel — the turn", () => {
  const dockRight = () => act(() => dockStore.set({ side: "right", size: 420, collapsed: false, full: false, surface: null }));
  const sendText = async (text: string) => {
    const ta = screen.getByPlaceholderText("Message antiloki…") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: text } });
    await act(async () => { fireEvent.keyDown(ta, { key: "Enter" }); await new Promise((r) => setTimeout(r, 0)); });
  };
  it("sends the manifest and the pinned CLI engine, and renders response_md", async () => {
    localStorage.setItem("antiloki:chat-engine", "cli:opencode");
    turn.fn.mockClear();
    dockRight();
    render(<DockPanel />);
    await sendText("what am I looking at?");
    expect(turn.fn).toHaveBeenCalledTimes(1);
    const [text, session, , , model, , screenMd] = turn.fn.mock.calls[0] as any[];
    expect(text).toBe("what am I looking at?"); expect(session).toBe("sess"); expect(model).toBe("cli:opencode");
    expect(screenMd).toContain("## page · xray");
    expect(await screen.findByText("the answer")).toBeTruthy();
  });
  it("without a CLI pin the model is left to the interviewer (null), and a legacy reply key still renders", async () => {
    turn.fn.mockClear(); turn.fn.mockResolvedValueOnce({ result: { interviewer_response_md: "legacy" } } as any);
    dockRight();
    render(<DockPanel />);
    await sendText("hi");
    expect((turn.fn.mock.calls[0] as any[])[4]).toBeNull();
    expect(await screen.findByText("legacy")).toBeTruthy();
  });
});
