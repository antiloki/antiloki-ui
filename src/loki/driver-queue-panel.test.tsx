// This panel is the operator's window into WHY the driver isn't picking a card. Its whole value is
// the per-row status vocabulary: NEXT / READY / BACKOFF / DONE / BLOCKED must be assigned in the
// right precedence, or a card that is merely backing off reads as permanently blocked (and the
// operator goes looking for a bug that isn't there).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let queue: any = { data: null, loading: false };
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, children, ...rest }: any) =>
    <a href={String(to).replace("$slug", params?.slug ?? "")} {...rest}>{children}</a>,
}));
vi.mock("@/loki/api/hooks", () => ({ useDriverQueue: () => queue }));

import { DriverQueuePanel } from "./driver-queue-panel";

const item = (over: any = {}) => ({
  position: 1, slug: "FEAT-A", title: "Ship it", status: "doing",
  is_next: false, dispatchable: false, backoff: false, terminal: false,
  next_agent: null, next_action: null, reason: null, ...over,
});
const withQueue = (items: any[], counts: any = {}) => {
  queue = { data: { queue: items, counts: { total: items.length, dispatchable: 0, blocked: 0, ...counts } }, loading: false };
  return render(<DriverQueuePanel />);
};

beforeEach(() => { queue = { data: null, loading: false }; });

describe("the header", () => {
  it("says it is read-only — RUN lives in card context, not here", () => {
    withQueue([]);
    expect(screen.getByText(/read-only · driver-schedule candidates/)).toBeTruthy();
  });

  it("summarises ready / blocked / total once the data lands", () => {
    withQueue([item()], { dispatchable: 3, blocked: 2, total: 7 });
    expect(screen.getByText("3 ready · 2 blocked · 7 total")).toBeTruthy();
  });

  it("shows no counts at all before the first read", () => {
    render(<DriverQueuePanel />);
    expect(screen.queryByText(/ready ·/)).toBeNull();
  });
});

describe("the empty and loading states", () => {
  it("says loading on the first read, not 'no cards'", () => {
    queue = { data: null, loading: true };
    render(<DriverQueuePanel />);
    expect(screen.getByText("loading…")).toBeTruthy();
    expect(screen.queryByText(/no active cards/)).toBeNull();
  });

  it("says there is nothing queued once the read came back empty", () => {
    withQueue([]);
    expect(screen.getByText(/no active cards in the driver queue/)).toBeTruthy();
  });
});

describe("the status vocabulary", () => {
  const labelFor = (over: any) => {
    const { unmount } = withQueue([item(over)]);
    const label = screen.getByText(/NEXT|READY|BACKOFF|DONE|BLOCKED/).textContent;
    unmount();
    return label;
  };

  it("names each state", () => {
    expect(labelFor({ is_next: true, dispatchable: true })).toBe("NEXT");
    expect(labelFor({ dispatchable: true })).toBe("READY");
    expect(labelFor({ backoff: true })).toBe("BACKOFF");
    expect(labelFor({ terminal: true })).toBe("DONE");
    expect(labelFor({})).toBe("BLOCKED");
  });

  it("prefers NEXT over everything else, and READY over BACKOFF", () => {
    expect(labelFor({ is_next: true, backoff: true, terminal: true, dispatchable: true })).toBe("NEXT");
    expect(labelFor({ dispatchable: true, backoff: true })).toBe("READY");
  });

  it("colours a backing-off card differently from a blocked one", () => {
    const colour = (over: any) => {
      const { unmount } = withQueue([item(over)]);
      const c = (screen.getByText(/NEXT|READY|BACKOFF|DONE|BLOCKED/) as HTMLElement).style.color;
      unmount();
      return c;
    };
    expect(colour({ backoff: true })).not.toBe(colour({}));
    expect(new Set([colour({ is_next: true }), colour({ dispatchable: true }), colour({ backoff: true }), colour({ terminal: true }), colour({})]).size).toBe(5);
  });
});

describe("a queue row", () => {
  it("is titled, with its rank; the removed card screen links home", () => {
    withQueue([item({ position: 4, slug: "FEAT-X", title: "Ship the thing" })]);
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("Ship the thing").getAttribute("href")).toBe("/");
  });

  it("falls back to the slug when the card has no title", () => {
    withQueue([item({ title: null, slug: "FEAT-Y" })]);
    expect(screen.getByText("FEAT-Y")).toBeTruthy();
  });

  it("shows what the driver will DO next for the next card", () => {
    withQueue([item({ is_next: true, next_agent: "dev", next_action: "code.write", reason: "ignored" })]);
    expect(screen.getByText("→ dev.code.write")).toBeTruthy();
    expect(screen.queryByText("ignored")).toBeNull();
  });

  it("shows WHY every other card is not next", () => {
    withQueue([item({ reason: "waiting on children" })]);
    expect(screen.getByText("waiting on children")).toBeTruthy();
  });

  it("falls back to the raw status when no reason was given", () => {
    withQueue([item({ reason: null, status: "blocked" })]);
    expect(screen.getByText("blocked")).toBeTruthy();
  });

  it("highlights the next card's row", () => {
    const { container } = withQueue([item({ is_next: true, slug: "A" }), item({ slug: "B", position: 2 })]);
    const rows = Array.from(container.querySelectorAll("div > div")).filter((d) => (d as HTMLElement).style.padding === "8px 14px") as HTMLElement[];
    expect(rows[0].style.background).not.toBe(rows[1].style.background);
  });

  it("renders every candidate the scheduler returned", () => {
    withQueue([item({ slug: "A" }), item({ slug: "B", position: 2 }), item({ slug: "C", position: 3 })]);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
