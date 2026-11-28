// A notifications drawer that shows "all clear" when it actually failed to reach the BE is worse
// than one that shows nothing — the operator stops checking. So the four empty-ish states (unwired
// route, still loading, genuinely empty, BE unreachable) must each say the right thing, and dismiss
// must refetch so a dismissed row cannot linger.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

let shell = { notifOpen: true, setNotifOpen: vi.fn() };
let poll: any = { data: [], loading: false, notWired: false, error: false, refetch: vi.fn() };
const dismiss = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, children, ...rest }: any) =>
    <a href={params?.slug ? String(to).replace("$slug", params.slug) : to} {...rest}>{children}</a>,
}));
vi.mock("./slug-context", () => ({ useShell: () => shell }));
vi.mock("@/loki/api/hooks", () => ({ useNotifications: () => poll }));
vi.mock("@/loki/api/dispatch", () => ({ dispatchNotifDismiss: (...a: any[]) => dismiss(...a) }));

import { NotificationsDrawer } from "./notifications-drawer";

const notif = (over: any = {}) => ({
  id: 1, severity: "error", kind: "tick-loop-dead", ts: "2026-05-20T12:00:00Z",
  message_md: "the driver stopped ticking", card_slug: null, ...over,
});

beforeEach(() => {
  shell = { notifOpen: true, setNotifOpen: vi.fn() };
  poll = { data: [], loading: false, notWired: false, error: false, refetch: vi.fn() };
  dismiss.mockReset();
  dismiss.mockResolvedValue({ ok: true });
});

describe("visibility", () => {
  it("renders nothing at all while closed", () => {
    shell.notifOpen = false;
    const { container } = render(<NotificationsDrawer />);
    expect(container).toBeEmptyDOMElement();
  });

  it("closes on the ✕ and on the backdrop", () => {
    const { container } = render(<NotificationsDrawer />);
    fireEvent.click(screen.getByLabelText("Close notifications"));
    expect(shell.setNotifOpen).toHaveBeenCalledWith(false);

    shell.setNotifOpen.mockClear();
    fireEvent.click(container.firstChild as HTMLElement);   // the scrim
    expect(shell.setNotifOpen).toHaveBeenCalledWith(false);
  });

  it("refetches on demand", () => {
    render(<NotificationsDrawer />);
    fireEvent.click(screen.getByLabelText("Refresh notifications"));
    expect(poll.refetch).toHaveBeenCalled();
  });
});

describe("the empty states each say something different", () => {
  it("an unwired route points at the endpoint it needs", () => {
    poll.notWired = true;
    render(<NotificationsDrawer />);
    expect(screen.getByText("/api/v1/notifications/list")).toBeTruthy();
  });

  it("the first load says loading, not 'all clear'", () => {
    poll = { ...poll, data: null, loading: true };
    render(<NotificationsDrawer />);
    expect(screen.getByText("loading…")).toBeTruthy();
  });

  it("a genuinely empty list says all clear", () => {
    render(<NotificationsDrawer />);
    expect(screen.getByText(/all clear/)).toBeTruthy();
  });

  it("an unreachable BE says so instead of claiming there is nothing to report", () => {
    poll.error = true;
    render(<NotificationsDrawer />);
    expect(screen.getByText("BE unreachable.")).toBeTruthy();
    expect(screen.queryByText(/all clear/)).toBeNull();
  });
});

describe("a notification row", () => {
  it("shows severity, kind, time and the message", () => {
    poll.data = [notif()];
    render(<NotificationsDrawer />);
    expect(screen.getByText("error")).toBeTruthy();
    expect(screen.getByText("tick-loop-dead")).toBeTruthy();
    expect(screen.getByText("the driver stopped ticking")).toBeTruthy();
  });

  it("colours the stripe by severity — and info is visible, not undefined", () => {
    poll.data = [notif({ id: 1, severity: "error" }), notif({ id: 2, severity: "warning" }), notif({ id: 3, severity: "info" })];
    const { container } = render(<NotificationsDrawer />);
    const stripes = Array.from(container.querySelectorAll("aside > div:nth-child(2) > div"))
      .map((d) => (d as HTMLElement).style.borderLeft);
    expect(new Set(stripes).size).toBe(3);
    for (const s of stripes) expect(s).not.toContain("undefined");
  });

  it("falls back to a neutral stripe for an unknown severity", () => {
    poll.data = [notif({ severity: "weird" })];
    const { container } = render(<NotificationsDrawer />);
    const row = container.querySelector("aside > div:nth-child(2) > div") as HTMLElement;
    expect(row.style.borderLeft).toBeTruthy();
    expect(row.style.borderLeft).not.toContain("undefined");
  });

  it("counts the active notifications in the header", () => {
    poll.data = [notif({ id: 1 }), notif({ id: 2 })];
    render(<NotificationsDrawer />);
    expect(screen.getByText("2 active")).toBeTruthy();
  });

  it("links to the card it is about, and closes the drawer on the way", () => {
    poll.data = [notif({ card_slug: "FEAT-X" })];
    render(<NotificationsDrawer />);
    const link = screen.getByText("→ FEAT-X");
    expect(link.getAttribute("href")).toBe("/");
    fireEvent.click(link);
    expect(shell.setNotifOpen).toHaveBeenCalledWith(false);
  });

  it("omits the card link when the notification is not about one", () => {
    poll.data = [notif()];
    render(<NotificationsDrawer />);
    expect(screen.queryByText(/^→/)).toBeNull();
  });

  it("dismisses that notification and refreshes the list afterwards", async () => {
    poll.data = [notif({ id: 7 })];
    render(<NotificationsDrawer />);
    fireEvent.click(screen.getByText("dismiss"));
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith(7));
    await waitFor(() => expect(poll.refetch).toHaveBeenCalled());
  });
});
