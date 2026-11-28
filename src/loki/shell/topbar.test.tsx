// The heartbeat is the operator's answer to "is the substrate alive?", and getting its VOCABULARY
// wrong is worse than showing nothing: the driver is event-driven, so a quiet board is idle, not
// dead. Colouring idle red trained operators to ignore the dot. Down means exactly two things —
// halted, or unreachable — and that is what these tests hold in place.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

let notifications: any = { data: [] };
let focus: any = { data: null };
let driverStatus: any = { data: null, error: false };
let activeCards: any = { data: [] };
const shell = {
  setChatOpen: vi.fn(), setPaletteOpen: vi.fn(), setNotifOpen: vi.fn(),
  chatOpen: false, notifOpen: false, role: "operator", setRole: vi.fn(),
};

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, children, ...rest }: any) =>
    <a href={params?.slug ? String(to).replace("$slug", params.slug) : to} {...rest}>{children}</a>,
}));
vi.mock("./slug-context", () => ({ useShell: () => shell }));
vi.mock("./term", () => ({ Term: ({ children, name }: any) => <>{children ?? name}</> }));
vi.mock("@/loki/api/hooks", () => ({
  useNotifications: () => notifications,
  useFocus: () => focus,
  useDriverStatus: () => driverStatus,
  useActiveCards: () => activeCards,
}));

import { TopBar, DoingCardsDropdown } from "./topbar";

const bar = () => render(<TopBar onToggleSidebar={onToggleSidebar} />);
const onToggleSidebar = vi.fn();
const beat = () => screen.getByText("BE").parentElement as HTMLElement;

beforeEach(() => {
  notifications = { data: [] };
  focus = { data: null };
  driverStatus = { data: null, error: false };
  activeCards = { data: [] };
  Object.assign(shell, { chatOpen: false, notifOpen: false });
  for (const fn of [shell.setChatOpen, shell.setPaletteOpen, shell.setNotifOpen, onToggleSidebar]) fn.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("the substrate heartbeat", () => {
  it("reads DOWN when the BE is unreachable", () => {
    driverStatus = { data: null, error: true };
    bar();
    expect(beat().getAttribute("title")).toContain("unreachable");
  });

  it("reads DOWN and says HALTED when the halt file is present", () => {
    driverStatus = { data: { halt_file_exists: true }, error: false };
    bar();
    expect(screen.getByText(/HALTED/)).toBeTruthy();
    expect(beat().getAttribute("title")).toContain("HALTED");
  });

  it("reads IDLE — not red — when there is simply nothing to run", () => {
    driverStatus = { data: { be_tick_running: false, tick_in_progress: false }, error: false };
    bar();
    expect(screen.getByText("· idle")).toBeTruthy();
    const tip = beat().getAttribute("title")!;
    expect(tip).toContain("idle");
    expect(tip).toContain("straight line on dispatch");
  });

  it("reads LIVE while a tick is running, with the rates the operator scans for", () => {
    driverStatus = { data: { be_tick_running: true, ticks_5m: 7, ticks_1h: 40, cost_usd_1h: 1.5, last_tick_at: new Date().toISOString() }, error: false };
    bar();
    expect(screen.getByText("7t/5m")).toBeTruthy();
    const tip = beat().getAttribute("title")!;
    expect(tip).toContain("working");
    expect(tip).toContain("7 ticks/5m");
    expect(tip).toContain("$1.50/h");
  });

  it("gives idle, live and down three distinguishable dot colours", () => {
    const dot = () => (beat().querySelector("span > span") as HTMLElement).style.background;
    const colours = new Set<string>();
    for (const d of [
      { data: { be_tick_running: true }, error: false },
      { data: { be_tick_running: false }, error: false },
      { data: null, error: true },
    ]) {
      driverStatus = d;
      const { unmount } = bar();
      colours.add(dot());
      unmount();
    }
    expect(colours.size).toBe(3);
  });

  it("counts the age of the last tick from a naked SQLite timestamp, read as UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-05-20T12:00:30Z"));
    driverStatus = { data: { be_tick_running: true, last_tick_at: "2026-05-20 12:00:00" }, error: false };
    bar();
    expect(screen.getByText(/30s ago/)).toBeTruthy();
  });

  it("keeps the age honest between polls, ticking once a second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-05-20T12:00:10Z"));
    driverStatus = { data: { be_tick_running: true, last_tick_at: "2026-05-20T12:00:00Z" }, error: false };
    bar();
    expect(screen.getByText(/10s ago/)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText(/13s ago/)).toBeTruthy();
  });

  it("says 'live' rather than a bogus age when the timestamp is unusable", () => {
    driverStatus = { data: { be_tick_running: true, last_tick_at: "not a date" }, error: false };
    bar();
    expect(screen.getByText(/· live/)).toBeTruthy();
  });

  it("never shows a negative age", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-05-20T12:00:00Z"));
    driverStatus = { data: { be_tick_running: true, last_tick_at: "2026-05-20T12:05:00Z" }, error: false };
    bar();
    expect(screen.getByText(/0s ago/)).toBeTruthy();
  });
});

describe("the drift badge", () => {
  it("stays hidden when no card is red", () => {
    focus = { data: { signals: { A: { signal: "green" }, B: { signal: "yellow" } } } };
    bar();
    expect(screen.queryByTitle(/red signal/)).toBeNull();
  });

  it("counts the red signals and links to the board", () => {
    focus = { data: { signals: { A: { signal: "red" }, B: { signal: "green" }, C: { signal: "red" } } } };
    bar();
    const badge = screen.getByTitle(/red signal/);
    expect(badge.textContent).toContain("2");
    expect(badge.getAttribute("href")).toBe("/operations");
  });
});

describe("the toolbar buttons", () => {
  it("toggles the sidebar, the palette and the chat drawer", () => {
    bar();
    fireEvent.click(screen.getByLabelText("Toggle sidebar"));
    expect(onToggleSidebar).toHaveBeenCalled();
    fireEvent.click(screen.getByText(/Search · jump · run/));
    expect(shell.setPaletteOpen).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByText("chat"));
    expect(shell.setChatOpen).toHaveBeenCalledWith(true);
  });

  it("badges the bell with the count of UNDISMISSED errors only", () => {
    notifications = { data: [
      { severity: "error" },
      { severity: "error", dismissed_at: "2026-05-20" },
      { severity: "warning" },
    ] };
    bar();
    expect(screen.getByLabelText("Notifications").textContent).toContain("1");
  });

  it("shows no badge when nothing is wrong", () => {
    notifications = { data: [{ severity: "info" }] };
    bar();
    expect(screen.getByLabelText("Notifications").textContent!.replace(/\s/g, "")).toBe("🔔");
  });

  it("toggles the notifications drawer", () => {
    bar();
    fireEvent.click(screen.getByLabelText("Notifications"));
    expect(shell.setNotifOpen).toHaveBeenCalledWith(true);
  });
});

describe("DoingCardsDropdown", () => {
  const card = (over: any = {}) => ({ id: 1, slug: "FEAT-A", title: "Ship the thing", last_event_ts: "2026-05-20 10:00:00", ...over });
  const drop = (open = false, setOpen = vi.fn()) => { render(<DoingCardsDropdown open={open} setOpen={setOpen} />); return setOpen; };

  it("says nothing is in flight on an empty board", () => {
    drop();
    expect(screen.getByText("0 doing")).toBeTruthy();
    expect(screen.getByText("nothing in flight")).toBeTruthy();
  });

  it("summarises the count and headlines the most recently active card", () => {
    activeCards = { data: [
      card({ id: 1, slug: "OLD", title: "older", last_event_ts: "2026-05-19 10:00:00" }),
      card({ id: 2, slug: "NEW", title: "newest", last_event_ts: "2026-05-20 10:00:00" }),
    ] };
    drop();
    expect(screen.getByText("2 doing")).toBeTruthy();
    expect(screen.getByText("newest")).toBeTruthy();
  });

  it("lists every card, newest first (the removed card screen links home)", () => {
    activeCards = { data: [
      card({ id: 1, slug: "OLD", title: "older", last_event_ts: "2026-05-19 10:00:00" }),
      card({ id: 2, slug: "NEW", title: "newest", last_event_ts: "2026-05-20 10:00:00" }),
    ] };
    drop(true);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/", "/",
    ]);
  });

  it("shows the phase and the operator's intent per row", () => {
    activeCards = { data: [card({ current_phase: "qa", driver_intent: "play" })] };
    drop(true);
    expect(screen.getByText("qa")).toBeTruthy();
    expect(screen.getByText("▶")).toBeTruthy();
  });

  it("marks a paused card differently from a playing one", () => {
    activeCards = { data: [card({ driver_intent: "paused" })] };
    drop(true);
    expect(screen.getByText("⏸")).toBeTruthy();
  });

  it("explains how to queue work when the open menu is empty", () => {
    drop(true);
    expect(screen.getByText(/Set a backlog card's intent/)).toBeTruthy();
  });

  it("opens, closes on the scrim, and closes when a card is chosen", () => {
    activeCards = { data: [card()] };
    const setOpen = vi.fn();
    const { container } = render(<DoingCardsDropdown open={false} setOpen={setOpen} />);
    fireEvent.click(screen.getByTitle(/card\(s\) in flight/));
    expect(setOpen).toHaveBeenCalledWith(true);

    setOpen.mockClear();
    render(<DoingCardsDropdown open setOpen={setOpen} />);
    fireEvent.click(screen.getAllByRole("link")[0]);
    expect(setOpen).toHaveBeenCalledWith(false);

    setOpen.mockClear();
    const scrim = Array.from(container.parentElement!.querySelectorAll("div"))
      .find((d) => (d as HTMLElement).style.position === "fixed" && (d as HTMLElement).style.inset === "0px")!;
    fireEvent.click(scrim);
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("tolerates a non-array payload from a degraded poll", () => {
    activeCards = { data: { oops: true } };
    expect(() => drop(true)).not.toThrow();
    expect(screen.getByText("0 doing")).toBeTruthy();
  });
});
