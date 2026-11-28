// The cowork components, with the terminal and the serve mocked: what they draw, what they refuse, and what they call.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";

const openExternal = vi.fn();
vi.mock("@/loki/desktop/shell", async (orig) => ({ ...(await orig<any>()), openExternal: (...a: any[]) => openExternal(...a) }));
vi.mock("@/loki/shell/logo-menu", () => ({ LogoMenu: () => <div data-testid="logo" />, LogoMark: () => <div data-testid="logo" /> }));

import { Strip } from "./Strip";
import { AgentStats } from "./AgentStats";
import { Sidebar } from "./Sidebar";
import { PaneFrame, HOVER_FOCUS_MS, RENAME_PANE, overlayInsets } from "./PaneFrame";
import { PaneDragContext } from "./drag-context";
import { STUDIO_PANE_LIST } from "./studio-panes";
import { PaneTree } from "./PaneTree";
import { AddPaneMenu } from "./AddPaneMenu";
import { live, type StripState } from "./strip-model";
import { addPane, emptyLayout, splitPane, type PaneRef } from "./layout";
import type { PaneUsage } from "./api";


const known = (over: Partial<PaneUsage> = {}): PaneUsage => ({ known: true, working: false, blocked: null, model: "Sonnet 5.5", contextPct: 38, limits: [{ label: "5h", used_pct: 61 }], sessionCost: 2.84, run: null, ...over });
const summaryState = (): StripState => ({ mode: "summary", item: { pane: "7", paneName: "Claude Code", usage: { tokensIn: 42_100, tokensOut: 3_800, cost: 0.31, baseline: 3.1, ms: 294_800, turns: 19, tools: 6, against: "claude · opus" } }, queue: [], remaining: 3000, lastTick: 0, paused: false });
const noop = () => {};

/** what the three dots held opens with a right click on the pane's bar */
const openMenu = () => { const bar = document.querySelector('[data-testid^="pane-"] [style*="height: 30px"]') as HTMLElement | null; fireEvent.contextMenu(bar ?? screen.getAllByTestId(/^pane-/)[0]); };
describe("the strip", () => {
  const base = { engineLabel: "Claude Code", now: 0, reduceMotion: true, onHover: noop, onLeave: noop, onDismiss: noop, onAction: noop };
  it("the agent's numbers are in its own pane's top bar, a dash for what is not known, and the bottom bar no longer carries them", () => {
    const { rerender } = render(<AgentStats usage={known({ run: { startedT: "x", finishedT: "y", prompt: "", tokensIn: 42_100, tokensOut: 3_800, cost: 0.31, baseline: 3.1, against: "claude · opus" } })} now={0} />);
    const t = screen.getByTestId("agent-stats").textContent!;
    expect(t).toContain("in 42.1k"); expect(t).toContain("out 3.8k"); expect(t).toContain("ctx 38%"); expect(t).toContain("5h 61%"); expect(t).toContain("run ≈ $0.31"); expect(t).toContain("session $2.84");   // a cost with no source is an estimate
    rerender(<AgentStats usage={known({ run: { startedT: "x", finishedT: "y", prompt: "", tokensIn: 1000, tokensOut: 10, cost: 0.0094, baseline: 0.29, costSource: "engine" } })} now={0} />);
    expect(screen.getByTestId("agent-stats").textContent).toContain("run $0.0094"); expect(screen.getByTestId("agent-stats").textContent).not.toContain("run ≈");
    rerender(<AgentStats usage={{ known: false, working: false, blocked: null, contextPct: null, limits: [], sessionCost: null, run: null, reason: "no local usage source" }} now={0} />);
    expect(screen.getByTestId("agent-stats").textContent).toContain("numbers: —");
    rerender(<AgentStats usage={known({ blocked: "Do you want to proceed?" })} now={0} />); expect(screen.getByTestId("agent-stats").textContent).toContain("needs you");
    rerender(<AgentStats usage={null} now={0} />); expect(screen.queryByTestId("agent-stats")).toBeNull();
    rerender(<Strip {...base} usage={known()} state={live()} note={{ text: "committed" }} />); expect(screen.getByTestId("strip-live").textContent).toBe("committed");
  });
  it("the summary state shows the run's parts, the timer line and a dismiss; the live layer is hidden from assistive tech", () => {
    const dismiss = vi.fn();
    render(<Strip {...base} usage={known()} state={summaryState()} onDismiss={dismiss} />);
    const el = screen.getByTestId("strip");
    expect(el.getAttribute("data-mode")).toBe("summary");
    const t = screen.getByTestId("strip-summary").textContent!;
    for (const part of ["Run finished", "19 turns · 294.8 s", "sent 42.1k · received 3.8k", "cost ≈ $0.31", "saved 90% vs claude · opus", "6 tools", "session $2.84"]) expect(t).toContain(part);
    expect(screen.getByTestId("strip-live").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("strip-timer").style.width).toBe("50%");
    fireEvent.click(screen.getByTestId("strip-dismiss")); expect(dismiss).toHaveBeenCalled();
    fireEvent.keyDown(el, { key: "Escape" }); expect(dismiss).toHaveBeenCalledTimes(2);
  });
  it("announces the summary politely and pauses on hover", () => {
    const hover = vi.fn(); const leave = vi.fn();
    render(<Strip {...base} usage={known()} state={summaryState()} onHover={hover} onLeave={leave} />);
    expect(screen.getByRole("status").textContent).toContain("Run finished");
    fireEvent.mouseEnter(screen.getByTestId("strip")); fireEvent.mouseLeave(screen.getByTestId("strip"));
    expect(hover).toHaveBeenCalled(); expect(leave).toHaveBeenCalled();
  });
  it("the icons call their action; a disabled one says why and does nothing", () => {
    const act = vi.fn();
    render(<Strip {...base} usage={known()} state={live()} onAction={act} disabled={{ push: "focus an agent pane first" }} />);
    fireEvent.click(screen.getByTestId("strip-commit")); expect(screen.queryByTestId("strip-consolidate")).toBeNull(); fireEvent.click(screen.getByTestId("strip-push"));
    expect(act.mock.calls.map((c) => c[0])).toEqual(["commit"]); expect(screen.queryByTestId("strip-close")).toBeNull();
    expect(screen.getByTestId("strip-push").getAttribute("data-tip")).toBe("focus an agent pane first");
  });
  it("a note from the last action replaces the numbers for a moment", () => {
    render(<Strip {...base} usage={known()} state={live()} note={{ text: "episode saved: fix the picker" }} />);
    expect(screen.getByTestId("strip-note").textContent).toBe("episode saved: fix the picker");
  });
});

describe("the sidebar", () => {
  const eps = [1, 2, 3, 4].map((i) => ({ id: i, title: `Saga ${i}`, summary: `summary ${i}`, status: i === 4 ? "doing" : "done", open: i === 4, pane: "Backender", paneId: 7, engine: "claude-code", model: "claude-haiku-5-5", turns: i, usd: i / 100, tokens: 1000 * i, updated: 1000 + i, source: "model" }));
  const threadCalls = { onThread: vi.fn(), onNewThread: vi.fn(), onRenameThread: vi.fn(), onDeleteThread: vi.fn() };
  const threads = [{ id: "main", name: "Main", active: true, panes: [{ id: "a", kind: "engine" }, { id: "b", kind: "shell" }] }, { id: "fix", name: "Fix checkout", active: false, panes: [] }];
  const props = { threads, ...threadCalls, spaces: [{ name: "ministore", active: true }, { name: "wantyos", active: false }], agents: [], seen: new Set<string>(), focusedId: null, episodes: eps, onOpenSaga: noop, paneCount: 2,
    onSpace: noop, onNewSpace: noop, onFocusAgent: noop, onAddAgent: noop, onAddPane: noop, collapsed: false, onToggle: noop, onRenameAgent: noop, onRenameSpace: noop };
  it("lists the open space's threads under it, opens another on a click, makes a new one by name and deletes an empty one", () => {
    render(<Sidebar {...props} />);
    expect(screen.getByTestId("thread-main").getAttribute("data-active")).toBe("1"); expect(screen.getByTestId("thread-main").textContent).toContain("2"); expect(screen.queryByTestId("thread-delete-main")).toBeNull();   // it holds panes: no ✕
    fireEvent.click(screen.getByTestId("thread-fix")); expect(threadCalls.onThread).toHaveBeenCalledWith("fix");
    fireEvent.click(screen.getByTestId("thread-main")); expect(threadCalls.onThread).toHaveBeenCalledTimes(1);   // the open one is not "switched to"
    fireEvent.click(screen.getByTestId("thread-delete-fix")); expect(threadCalls.onDeleteThread).toHaveBeenCalledWith("fix"); expect(threadCalls.onThread).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("new-thread")); fireEvent.change(screen.getByTestId("new-thread-input"), { target: { value: " Refactor " } }); fireEvent.keyDown(screen.getByTestId("new-thread-input"), { key: "Enter" });
    expect(threadCalls.onNewThread).toHaveBeenCalledWith("Refactor");
  });
  it("lists the spaces as glass tiles, the open one expanded with its name and panes and the others as their tile alone, and switches on a click", () => {
    const onSpace = vi.fn();
    render(<Sidebar {...props} onSpace={onSpace} />);
    expect(screen.getByTestId("space-ministore").getAttribute("data-active")).toBe("1"); expect(screen.getByTestId("space-ministore").textContent).toContain("2 panes"); expect(screen.getByTestId("space-ministore").textContent).toContain("ministore");
    expect(screen.getByTestId("space-wantyos").getAttribute("data-active")).toBe("0"); expect(screen.getByTestId("space-wantyos").textContent).toBe("W");   // a tile with its letter, no name: it says its name on hover
    expect(screen.getByTestId("space-wantyos").getAttribute("title")).toContain("wantyos"); expect(screen.getByTestId("space-tile-wantyos").style.background).toContain("transparent");   // glass, not a gradient
    fireEvent.click(screen.getByTestId("space-ministore")); expect(onSpace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("space-wantyos")); expect(onSpace).toHaveBeenCalledWith("wantyos");
  });
  it("has a gear for the settings and no logo menu", () => {
    const onSettings = vi.fn(); render(<Sidebar {...props} onSettings={onSettings} />); fireEvent.click(screen.getByTestId("sidebar-settings")); expect(onSettings).toHaveBeenCalled();
  });
  it("the agents are icons only, under the threads of the open space: the provider's mark with its state at the corner, no names, no section of their own", () => {
    const onFocusAgent = vi.fn();
    render(<Sidebar {...props} onFocusAgent={onFocusAgent} agents={[{ id: "p", name: "Plan", status: "working", engine: "claude-code", team: "k", teamName: "Night shift", role: "planner" }, { id: "w", name: "Build", status: "idle", engine: "codex", team: "k", teamName: "Night shift", role: "worker" }, { id: "x", name: "Solo", status: "blocked", engine: "gemini", detail: "Do you want to proceed?" }]} />);
    const box = screen.getByTestId("thread-agents"); expect(screen.queryByLabelText("Agents", { selector: "section" })).toBeNull(); expect(box.textContent).toBe("");   // icons only
    expect(box.querySelector('[data-testid="agent-p"] [data-sprite="claude-code"]')).toBeTruthy(); expect(box.querySelector('[data-testid="agent-w"] [data-sprite="codex"]')).toBeTruthy(); expect(box.querySelector('[data-testid="agent-x"] [data-sprite="gemini"]')).toBeTruthy();
    expect(screen.getByTestId("agent-p").querySelector('[data-testid="provider-badge"]')!.getAttribute("data-status")).toBe("working"); expect(screen.getByTestId("agent-x").getAttribute("data-status")).toBe("blocked");
    expect(screen.getByTestId("agent-x").getAttribute("title")).toContain("needs you"); expect(screen.getByTestId("agent-p").getAttribute("title")).toContain("planner");
    fireEvent.click(screen.getByTestId("agent-w")); expect(onFocusAgent).toHaveBeenCalledWith("w");
  });
  it("lists the workspace's sagas (an episode is a saga): three at first, the rest behind a toggle, each with its summary, pane, turns and price, and an open one marked", () => {
    const onAll = vi.fn(); render(<Sidebar {...props} onAllSagas={onAll} />);
    expect(screen.getByTestId("episodes").textContent).toContain("Sagas"); expect(screen.getByTestId("episodes").textContent).toContain("Saga 1"); expect(screen.queryByTestId("episode-4")).toBeNull();
    expect(screen.getByTestId("episodes-all")).toHaveTextContent(/^all$/); fireEvent.click(screen.getByTestId("episodes-all")); expect(onAll).toHaveBeenCalledTimes(1);   // the word "all" opens the Sagas page
    expect(screen.getByTestId("episode-2").textContent).toContain("summary 2"); expect(screen.getByTestId("episode-2").textContent).toContain("Backender · 2 turns · $0.02");
  });
  it("clicking a saga opens it on the Sagas screen", () => {
    const onOpenSaga = vi.fn(); render(<Sidebar {...props} onOpenSaga={onOpenSaga} />); fireEvent.click(screen.getByTestId("episode-2")); expect(onOpenSaga).toHaveBeenCalledWith(2);
  });
  it("says what sagas are when there are none", () => {
    render(<Sidebar {...props} episodes={[]} />);
    expect(screen.getByTestId("episodes").textContent).toContain("no sagas yet");
  });
});

describe("the pane frame and the tree", () => {
  const pane: PaneRef = { id: "claude-1", kind: "engine", engine: "claude-code", paneId: 1 };
  const frame = (over = {}) => render(<PaneFrame pane={pane} title="Claude Code" subtitle="Sonnet" route="heimdall → backender" dot="working" focused zoomed={false} onFocus={noop} onSplit={noop} onZoom={noop} onClose={noop} {...over}><div>body</div></PaneFrame>);

  it("the skin switch is an icon on the header only when the pane can be read as a chat, and flips between the two", () => {
    const onSkin = vi.fn(); frame({ onSkin, skin: "terminal" }); fireEvent.click(screen.getByTestId("skin-claude-1")); expect(onSkin).toHaveBeenCalledTimes(1); expect(screen.getByTestId("skin-claude-1").getAttribute("aria-pressed")).toBe("false"); cleanup();
    frame({ onSkin, skin: "chat" }); expect(screen.getByTestId("skin-claude-1").getAttribute("aria-pressed")).toBe("true"); cleanup();
    frame({}); expect(screen.queryByTestId("skin-claude-1")).toBeNull();
  });
  it("a focused specialist's pane takes the specialist's colour as its border (an ordinary agent keeps the normal focus colour)", () => {
    const { container, unmount } = frame({ pane: { id: "claude-1", kind: "engine", engine: "claude-code", specialist: { id: "cc", color: "pink" } } as PaneRef, focused: true }); const box = container.firstElementChild as HTMLElement;
    expect(box.style.border).toContain("rgb(234, 61, 140)"); expect(box.style.boxShadow).toContain("0 0 0 3px"); unmount();
    const plain = frame({ focused: true }).container.firstElementChild as HTMLElement; expect(plain.style.border).not.toContain("rgb(234, 61, 140)");
  });
  it("a team pane has no fold-into-a-strip icon (a team thread has one pane), an agent pane keeps it", () => {
    frame({ onCollapse: vi.fn() }); expect(screen.getByTestId("collapse-claude-1")).toBeTruthy(); expect(screen.getByTestId("fullscreen-claude-1")).toBeTruthy(); cleanup();
    frame({ pane: { id: "team-1", kind: "tool", tool: "team", teamId: "t" } as PaneRef, onCollapse: vi.fn() }); expect(screen.queryByTestId("collapse-team-1")).toBeNull(); expect(screen.queryByTestId("fullscreen-team-1")).toBeNull();   // a team thread has one pane: no fold, no full screen
  });  it("draws the header: state dot, title, route label, and the controls", () => {
    frame();
    expect(screen.getByTestId("pane-dot").getAttribute("data-state")).toBe("working"); expect(screen.getByTestId("pane-route").textContent).toBe("heimdall → backender");
    expect(screen.getByTestId("pane-claude-1").getAttribute("data-focused")).toBe("1"); expect(screen.getByText("body")).toBeTruthy();
  });
  it("a team thread offers no split anywhere (only an ordinary thread opens panes and agents)", () => {
    frame({ splitLocked: true, pane: { id: "sh-1", kind: "shell" } as PaneRef });
    openMenu();
    for (const t of ["split right", "split below", "split left", "split above"]) expect(screen.queryByText(t), t).toBeNull();
    expect(screen.queryByLabelText("split right")).toBeNull();
  });
  it("no split icons on the bar: every split and zoom are in the three dots; close closes", () => {
    const onSplit = vi.fn(); const onZoom = vi.fn(); const onClose = vi.fn();
    frame({ onSplit, onZoom, onClose, pane: { id: "sh-1", kind: "shell" } as PaneRef });
    expect(screen.queryByLabelText("split right")).toBeNull(); expect(screen.queryByLabelText("split below")).toBeNull();   // not on the bar
    openMenu(); fireEvent.click(screen.getByText("split right")); expect(onSplit.mock.calls[0][0]).toBe("right");
    openMenu(); fireEvent.click(screen.getByText("split below")); expect(onSplit.mock.calls[1][0]).toBe("below");
    openMenu(); fireEvent.click(screen.getByText("split left")); expect(onSplit.mock.calls[2][0]).toBe("left");
    openMenu(); fireEvent.click(screen.getByText("zoom")); expect(onZoom).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("close pane")); expect(onClose).toHaveBeenCalled();
  });
  it("resting the pointer on an unfocused pane focuses it after a moment; passing over it does not; a focused pane or a drag in progress is left alone", () => {
    vi.useFakeTimers();
    try {
      const onFocus = vi.fn();
      const { rerender } = render(<PaneFrame pane={pane} title="Claude Code" dot="idle" focused={false} zoomed={false} onFocus={onFocus} onSplit={noop} onZoom={noop} onClose={noop}>body</PaneFrame>);
      const el = screen.getByTestId("pane-claude-1");
      fireEvent.mouseEnter(el); vi.advanceTimersByTime(HOVER_FOCUS_MS - 20); fireEvent.mouseLeave(el); vi.advanceTimersByTime(500);
      expect(onFocus).not.toHaveBeenCalled();                                     // just crossing it
      fireEvent.mouseEnter(el); vi.advanceTimersByTime(HOVER_FOCUS_MS + 5); expect(onFocus).toHaveBeenCalledTimes(1);   // resting on it
      rerender(<PaneFrame pane={pane} title="Claude Code" dot="idle" focused zoomed={false} onFocus={onFocus} onSplit={noop} onZoom={noop} onClose={noop}>body</PaneFrame>);
      fireEvent.mouseEnter(el); vi.advanceTimersByTime(1000); expect(onFocus).toHaveBeenCalledTimes(1);                  // already focused
      const drag = { dragging: "other", start: noop, end: noop, drop: noop };
      rerender(<PaneDragContext.Provider value={drag}><PaneFrame pane={pane} title="Claude Code" dot="idle" focused={false} zoomed={false} onFocus={onFocus} onSplit={noop} onZoom={noop} onClose={noop}>body</PaneFrame></PaneDragContext.Provider>);
      fireEvent.mouseEnter(el); vi.advanceTimersByTime(1000); expect(onFocus).toHaveBeenCalledTimes(1);                  // a pane is being dragged
    } finally { vi.useRealTimers(); }
  });
  it("a header keeps clear of the floating switch and pill that sit over it: padding from the side each one is nearest, nothing for one that is elsewhere", () => {
    const r = (x: number, y: number, w: number, h: number) => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h }) as DOMRect;
    const header = r(100, 0, 600, 30);
    expect(overlayInsets(header, [r(560, 4, 200, 22)])).toEqual({ l: 0, r: 148 });                 // a pill over the right end: pad by how far in it reaches, plus a gap
    expect(overlayInsets(header, [r(80, 4, 120, 22)])).toEqual({ l: 108, r: 0 });                  // a switch over the left end
    expect(overlayInsets(header, [r(560, 4, 200, 22), r(80, 4, 120, 22)])).toEqual({ l: 108, r: 148 });
    expect(overlayInsets(header, [r(560, 60, 200, 22)])).toEqual({ l: 0, r: 0 });                  // below the header: nothing
    expect(overlayInsets(header, [r(800, 4, 100, 22)])).toEqual({ l: 0, r: 0 });                   // beside it: nothing
    expect(overlayInsets(header, [r(560, 4, 0, 0)])).toEqual({ l: 0, r: 0 }); expect(overlayInsets(header, [])).toEqual({ l: 0, r: 0 });
  });
  it("an agent's pane menu offers closing it with a decision about its changes; a terminal's does not", () => {
    const onCloseDecide = vi.fn();
    // the operator 2026-11-22: no three dots on any agent (a specialist, a team Leader, an agent): the close button is the way
    const { unmount } = frame({ onCloseDecide }); expect(screen.queryByLabelText("more pane actions")).toBeNull();   // no ⋯ button anywhere unmount();
    frame({ pane: { id: "sh-1", kind: "shell" } as PaneRef }); openMenu(); expect(screen.queryByTestId("close-decide")).toBeNull();
  });
  it("every pane has a full screen button that says what it will do, and leaves it again; a worker's pane has none", () => {
    const onZoom = vi.fn();
    const { rerender } = render(<PaneFrame pane={pane} title="Claude Code" dot="idle" focused zoomed={false} onFocus={noop} onSplit={noop} onZoom={onZoom} onClose={noop}>body</PaneFrame>);
    const b = screen.getByLabelText("full screen"); expect(b.getAttribute("aria-pressed")).toBe("false"); fireEvent.click(b); expect(onZoom).toHaveBeenCalledTimes(1);
    rerender(<PaneFrame pane={pane} title="Claude Code" dot="idle" focused zoomed onFocus={noop} onSplit={noop} onZoom={onZoom} onClose={noop}>body</PaneFrame>);
    expect(screen.getByLabelText("exit full screen").getAttribute("aria-pressed")).toBe("true"); expect(screen.queryByLabelText("full screen")).toBeNull();
    rerender(<PaneFrame pane={{ id: "w", kind: "worker" }} title="worker" dot="done" focused={false} zoomed={false} onFocus={noop} onSplit={noop} onZoom={onZoom} onClose={noop}>body</PaneFrame>);
    expect(screen.queryByLabelText("full screen")).toBeNull();
  });
  it("the rename shortcut's event starts the name editing on that pane only", () => {
    const onRename = vi.fn();
    render(<PaneFrame pane={pane} title="Claude Code" dot="idle" focused zoomed={false} onFocus={noop} onSplit={noop} onZoom={noop} onClose={noop} onRename={onRename}>body</PaneFrame>);
    expect(screen.queryByTestId("inline-name-input")).toBeNull();
    fireEvent(window, new CustomEvent(RENAME_PANE, { detail: "some-other-pane" })); expect(screen.queryByTestId("inline-name-input")).toBeNull();
    fireEvent(window, new CustomEvent(RENAME_PANE, { detail: "claude-1" }));
    const input = screen.getByTestId("inline-name-input") as HTMLInputElement; expect(input.value).toBe("Claude Code");
    fireEvent.change(input, { target: { value: "Backender" } }); fireEvent.keyDown(input, { key: "Enter" }); expect(onRename).toHaveBeenCalledWith("Backender");
  });
  it("the tree renders every pane of a layout, a resizer between siblings, and only the zoomed pane when zoomed", () => {
    let l = addPane(emptyLayout(), pane); l = splitPane(l, "claude-1", "below", { id: "shell-1", kind: "shell", paneId: 2 });
    const render1 = (p: PaneRef) => <div data-testid={`leaf-${p.id}`} />;
    const { rerender } = render(<PaneTree layout={l} render={render1} onSizes={noop} />);
    expect(screen.getByTestId("leaf-claude-1")).toBeTruthy(); expect(screen.getByTestId("leaf-shell-1")).toBeTruthy(); expect(screen.getAllByTestId("resizer")).toHaveLength(1);
    expect(screen.getByTestId("split").getAttribute("data-dir")).toBe("col");
    rerender(<PaneTree layout={{ ...l, zoom: "shell-1" }} render={render1} onSizes={noop} />);
    expect(screen.queryByTestId("leaf-claude-1")).toBeNull(); expect(screen.getByTestId("leaf-shell-1")).toBeTruthy();
    rerender(<PaneTree layout={emptyLayout()} render={render1} onSizes={noop} />);
    expect(screen.queryByTestId("split")).toBeNull();
  });
});

describe("the add-pane menu", () => {
  const engines = [{ key: "claude-code", label: "Claude Code", installed: true, seat: true }, { key: "codex", label: "Codex", installed: false, seat: false }];
  it("offers installed engines, shows the others as not installed, a terminal and the tools, and opens on the chosen side", async () => {
    const onPick = vi.fn(); const onClose = vi.fn();
    render(<AddPaneMenu engines={engines} anchor={{ left: 10, top: 40 }} atLimit={null} initialSide="below" onPick={onPick} onClose={onClose} />);
    expect(screen.getByTestId("side-below").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("pick-codex").textContent).toContain("not found"); expect(screen.getByTestId("pick-codex").textContent).toContain("install guide");
    fireEvent.click(screen.getByTestId("pick-codex")); expect(openExternal).toHaveBeenCalledWith("https://developers.openai.com/codex/cli"); expect(onPick).not.toHaveBeenCalled();   // a missing CLI opens its official install page, never a pane
    fireEvent.click(screen.getByTestId("side-left")); fireEvent.click(screen.getByTestId("pick-claude-code"));
    expect(onPick).toHaveBeenCalledWith({ kind: "engine", engine: engines[0] }, "left"); await waitFor(() => expect(onClose).toHaveBeenCalled());   // after its short fold
    fireEvent.click(screen.getByTestId("pick-shell")); expect(onPick.mock.calls[1][0]).toEqual({ kind: "shell" });
  });
  it("the new-pane menu offers no Studio tools and no X-ray (they are off, STUDIO_IN_MENU), only the terminal and Your panes, with discrete web-app suggestions (no Web apps button, no store)", () => {
    const onPick = vi.fn();
    render(<AddPaneMenu engines={engines} anchor={{ left: 10, top: 40 }} atLimit={null} onPick={onPick} onClose={noop} />);
    const picks = screen.getAllByRole("menuitem").map((b) => b.getAttribute("data-testid")).filter((t) => t && !["pick-claude-code", "pick-codex", "pick-shell"].includes(t));
    expect(picks).toEqual(["pick-hermes", "pick-board", "pick-connectors", "pick-free-menu"]);   // Connectors (RFC 0022) and Your panes expect(screen.getByTestId("pane-suggestions")).toBeTruthy(); expect(screen.queryByTestId("pick-webapps-menu")).toBeNull();
    expect(screen.queryByTestId("pick-skillshare")).toBeNull(); expect(screen.queryByTestId("pick-xray")).toBeNull();
  });
  it("a CLI that was found but will not run says so, with the reason, and cannot be picked; one that is nowhere shows what was searched on hover", () => {
    const engs = [{ key: "claude-code", label: "Claude Code", installed: true, seat: true, broken: "env: node: No such file or directory", missing: "`claude` was found at /x/claude but did not run" },
      { key: "grok", label: "Grok", installed: false, seat: true, missing: "`grok` is not on this machine (looked in the PATH this app started with (4 folders))" }];
    render(<AddPaneMenu engines={engs as any} anchor={{ left: 1, top: 1 }} atLimit={null} mode="agent" onPick={noop} onClose={noop} />);
    const c = screen.getByTestId("pick-claude-code") as HTMLButtonElement; expect(c.textContent).toContain("found, will not run"); expect(c.title).toContain("did not run"); expect(c.title).toContain("official install page");
    expect(screen.getByTestId("pick-grok").title).toContain("looked in the PATH");
  });
  it("in the new-agent menu there are only agents, and in the new-pane menu the terminal and Your panes (no Studio)", () => {
    const { unmount } = render(<AddPaneMenu engines={engines} anchor={{ left: 1, top: 1 }} atLimit={null} mode="agent" onPick={noop} onClose={noop} />);
    expect(screen.queryByTestId("pick-skillshare")).toBeNull(); expect(screen.getByTestId("pick-claude-code")).toBeTruthy(); unmount();
    render(<AddPaneMenu engines={engines} anchor={{ left: 1, top: 1 }} atLimit={null} mode="pane" onPick={noop} onClose={noop} />);
    expect(screen.queryByTestId("pick-claude-code")).toBeNull(); expect(screen.getByTestId("pick-shell")).toBeTruthy(); expect(screen.queryByTestId("pick-skillshare")).toBeNull();
  });
  it("at the pane limit nothing can be picked, and it says why; Escape closes", async () => {
    const onClose = vi.fn();
    render(<AddPaneMenu engines={engines} anchor={{ left: 10, bottom: 10 }} atLimit="12 panes are open" onPick={noop} onClose={onClose} />);
    expect(screen.getByTestId("add-pane-limit").textContent).toContain("12 panes"); expect((screen.getByTestId("pick-shell") as HTMLButtonElement).disabled).toBe(true);
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); }); await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("the pane header never loses its close button", () => {
  it("fits as many controls as the room allows, in priority order, and the rest go to the menu", async () => {
    const { fitControls, controlRoom } = await import("./PaneFrame");
    const items = [{ id: "full", cost: 24 }, { id: "mic", cost: 24 }, { id: "fold", cost: 24 }, { id: "side", cost: 24 }, { id: "splitr", cost: 24 }, { id: "splitb", cost: 24 }, { id: "model", cost: 118 }];
    expect([...fitControls(1000, items)]).toEqual(["full", "mic", "fold", "side", "splitr", "splitb", "model"]); expect([...fitControls(100, items)]).toEqual(["full", "mic", "fold", "side"]); expect([...fitControls(30, items)]).toEqual(["full"]); expect([...fitControls(0, items)]).toEqual([]);
    expect(controlRoom(600, 0, 0)).toBe(600 - 12 - 8 - 70 - 52); expect(controlRoom(100, 60, 60)).toBe(0); expect(controlRoom(10_000, 0, 0)).toBeGreaterThan(9000);
  });
});

describe("a row that is too narrow breaks into lines", () => {
  it("wraps when the panes would be under the minimum width, counting a folded one as its strip, and not before", async () => {
    const { rowWraps, MIN_PANE_W, ROOM } = await import("./PaneTree"); const W = Math.ceil(MIN_PANE_W * ROOM);   // a pane needs its least width plus a little room, so a seam can still move
    expect(rowWraps(10_000, [false, false, false])).toBe(false); expect(rowWraps(0, [false, false])).toBe(false);
    expect(rowWraps(W * 3 + 16, [false, false, false])).toBe(false); expect(rowWraps(W * 3 + 15, [false, false, false])).toBe(true);
    expect(rowWraps(W * 2 + 40 + 16, [false, false, true])).toBe(false); expect(rowWraps(W * 2 + 40 + 15, [false, false, true])).toBe(true);
    const { maxPerLine } = await import("./PaneTree"); expect([900, 1440, 1919, 2400, 3000, 3840, 10_000].map(maxPerLine)).toEqual([4, 4, 4, 5, 6, 8, 8]); expect(rowWraps(1900, Array(5).fill(false))).toBe(true); expect(rowWraps(10_000, Array(8).fill(false))).toBe(false); expect(rowWraps(10_000, Array(9).fill(false))).toBe(true);   // four to a line, up to eight on a big screen
    expect(rowWraps(100, [false])).toBe(false);   // one pane alone has no neighbour to break away from
  });
});

describe("the least a block may be", () => {
  const leaf = (id: string, collapsed = false) => ({ type: "leaf" as const, pane: { id, kind: "shell" as const, collapsed } });
  const split = (dir: "row" | "col", children: any[], team?: string) => ({ type: "split" as const, dir, sizes: children.map(() => 1 / children.length), children, team });
  it("a team's minimum is its members' added up PLUS its own bar and frame, so it never disappears; stacked blocks need the widest and add their heights", async () => {
    const { minWidthOf, minHeightOf, MIN_PANE_W, MIN_PANE_H, BLOCK_CHROME_W, blockChromeH } = await import("./PaneTree");
    const team = split("row", [leaf("a"), leaf("b"), leaf("c")], "x");
    expect(minWidthOf(leaf("p"))).toBe(MIN_PANE_W); expect(minWidthOf(team)).toBe(MIN_PANE_W * 3 + 16 + BLOCK_CHROME_W); expect(minWidthOf(team, 8, false)).toBe(MIN_PANE_W * 3 + 16);
    expect(minHeightOf(team)).toBe(MIN_PANE_H + blockChromeH("x")); expect(minHeightOf(team, 8, false)).toBe(MIN_PANE_H);
    expect(minWidthOf(split("row", [leaf("p"), team]))).toBe(MIN_PANE_W + 8 + minWidthOf(team));
    const col = split("col", [leaf("p"), team]); expect(minHeightOf(col)).toBe(MIN_PANE_H + 8 + MIN_PANE_H + blockChromeH("x")); expect(minWidthOf(col)).toBe(minWidthOf(team));
    expect(minWidthOf(split("row", [leaf("a"), leaf("b", true)]))).toBe(MIN_PANE_W + 8 + 40);   // a folded pane is its strip
    expect(blockChromeH("side:4")).toBeLessThan(blockChromeH("x"));   // a side question's bar is the thin one
  });
});

describe("a team thread's two obligatory panes", () => {
  it("the team pane and the Leader's terminal cannot be closed there, and nothing is protected on a plain thread", async () => {
    const { teamRequired, leaderPaneOf } = await import("./team-panes"); expect(leaderPaneOf([{ id: "e1", kind: "engine", paneId: 7 }, { id: "e2", kind: "engine", paneId: 9 }], "x", 9)).toBe(9); expect(leaderPaneOf([{ id: "e1", kind: "engine", paneId: 7 }], "x", 0)).toBe(7); expect(leaderPaneOf([], "x", 0)).toBe(0); expect(leaderPaneOf([{ id: "e1", kind: "engine", paneId: 7 }], null)).toBe(0); const panes = [{ id: "e1", kind: "engine", paneId: 7 }, { id: "team-x", kind: "tool", tool: "team" }, { id: "e2", kind: "engine", paneId: 9 }, { id: "sh", kind: "shell" }];
    expect([...teamRequired(panes, "x", 9)].sort()).toEqual(["e2", "team-x"]); expect([...teamRequired(panes, "x", 0)].sort()).toEqual(["e1", "team-x"]); expect(teamRequired(panes, null).size).toBe(0); expect(teamRequired([], "x", 0).size).toBe(0);
  });
});
