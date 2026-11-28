// The kanban is the operator's at-a-glance answer to "what is the substrate doing, and what needs
// me?". Two regressions have hit it before and are pinned here: a blocked card rendering as an
// ordinary tile (invisible escalation), and RUN playing a card that the preflight rejected. The
// phase→column mapping is the third — a card in an unmapped phase must land somewhere visible
// rather than vanishing off the board.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

let active: any = { data: [], loading: false, error: false };
const setCardIntent = vi.fn();
const dispatchForceTick = vi.fn();
const dispatchHalt = vi.fn();
const cardPreflight = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, children, ...rest }: any) =>
    <a href={String(to).replace("$slug", params?.slug ?? "")} {...rest}>{children}</a>,
}));
vi.mock("@/loki/api/hooks", () => ({ useActiveCards: () => active }));
vi.mock("@/loki/api/dispatch", () => ({
  setCardIntent: (...a: any[]) => setCardIntent(...a),
  dispatchForceTick: (...a: any[]) => dispatchForceTick(...a),
  dispatchHalt: (...a: any[]) => dispatchHalt(...a),
  cardPreflight: (...a: any[]) => cardPreflight(...a),
}));
vi.mock("@/loki/components/LoadGate", () => ({ LoadGate: ({ children }: any) => <>{children}</> }));

import { KanbanPipelineLive } from "./kanban-live";

const card = (over: any = {}) => ({
  id: 1, slug: "FEAT-A", title: "Ship the thing", status: "doing", current_phase: "tl_draft",
  driver_intent: null, size: "M", last_event_ts: new Date().toISOString(),
  last_failure_at: null, last_failure_kind: null, awaiting_children_at: null, ...over,
});

const board = (cards: any[], over: any = {}) => {
  active = { data: cards, loading: false, error: false, ...over };
  return render(<KanbanPipelineLive />);
};
const tile = (slug = "FEAT-A") => screen.getByText(slug).closest("a") as HTMLElement;
const columnOf = (slug = "FEAT-A") => tile(slug).parentElement!.parentElement!.textContent;

beforeEach(() => {
  active = { data: [], loading: false, error: false };
  setCardIntent.mockReset().mockResolvedValue({ ok: true });
  dispatchForceTick.mockReset().mockResolvedValue({ ok: true });
  dispatchHalt.mockReset().mockResolvedValue({ ok: true });
  cardPreflight.mockReset().mockResolvedValue({ ok: true, blockers: [] });
});
afterEach(() => vi.useRealTimers());

describe("the header", () => {
  it("counts the active cards and says how often it refreshes", () => {
    board([card({ id: 1, slug: "A" }), card({ id: 2, slug: "B" })]);
    const header = screen.getByText(/polled every 2s/).parentElement!;
    expect(header.textContent).toContain("2active");
  });

  it("says loading only while there is nothing to show yet", () => {
    board([], { loading: true });
    expect(screen.getByText("loading…")).toBeTruthy();
    expect(screen.queryByText(/polled every 2s/)).toBeNull();
  });

  it("names the endpoint that failed", () => {
    board([], { error: true });
    expect(screen.getByText(/error loading \/api\/v1\/cards-active/)).toBeTruthy();
  });

  it("tolerates a non-array payload", () => {
    expect(() => board({ oops: true } as any)).not.toThrow();
  });
});

describe("the phase → column mapping", () => {
  it("routes contract, development and consolidation phases to their own columns", () => {
    board([
      card({ id: 1, slug: "CONTRACT", current_phase: "tl_draft" }),
      card({ id: 2, slug: "DEV", current_phase: "impl_start" }),
      card({ id: 3, slug: "SEALED", current_phase: "seal" }),
    ]);
    expect(columnOf("CONTRACT")).toContain("Contract");
    expect(columnOf("DEV")).toContain("Development");
    expect(columnOf("SEALED")).toContain("Consolidation");
  });

  it("never loses a card whose phase it does not recognise", () => {
    board([card({ slug: "WEIRD", current_phase: "some_new_gate" })]);
    expect(columnOf("WEIRD")).toContain("Contract");
  });

  it("puts a card with no phase at all on the board too", () => {
    board([card({ slug: "NEW", current_phase: null })]);
    expect(screen.getByText("NEW")).toBeTruthy();
    expect(screen.getByText("no events")).toBeTruthy();
  });
});

describe("a card tile", () => {
  it("shows its id, title, slug and size; the removed card screen links home", () => {
    board([card({ id: 42, slug: "FEAT-X", title: "Ship it", size: "L" })]);
    expect(tile("FEAT-X").getAttribute("href")).toBe("/");
    expect(screen.getByText("#42")).toBeTruthy();
    expect(screen.getByText("Ship it")).toBeTruthy();
    expect(screen.getByText("L")).toBeTruthy();
  });

  it("names the sub-phase — the operator's 'where exactly?' signal", () => {
    board([card({ current_phase: "tl_sign" })]);
    expect(tile().textContent).toMatch(/TL|sign/i);
  });

  it("shouts when a card is BLOCKED — the escalation must never look ordinary", () => {
    board([card({ status: "blocked" })]);
    expect(screen.getByText(/blocked — needs you/)).toBeTruthy();
    expect(tile().style.borderLeft).toContain("3px solid");
  });

  it("marks a card that is failing right now, with the failure kind in reach", () => {
    board([card({ last_failure_at: new Date().toISOString(), last_failure_kind: "build" })]);
    expect(screen.getByText(/⚠ failing/)).toBeTruthy();
    expect(screen.getByTitle("build")).toBeTruthy();
  });

  it("stops flagging a failure once it is old", () => {
    board([card({ last_failure_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() })]);
    expect(screen.queryByText(/⚠ failing/)).toBeNull();
  });

  it("lets blocked win over failing — the louder state is the true one", () => {
    board([card({ status: "blocked", last_failure_at: new Date().toISOString() })]);
    expect(screen.getByText(/blocked — needs you/)).toBeTruthy();
    expect(screen.queryByText(/⚠ failing/)).toBeNull();
  });

  it("shows a parent waiting on children as gated, not as being worked on", () => {
    board([card({ status: "awaiting_children" })]);
    expect(screen.getByText("awaiting children")).toBeTruthy();
    expect(parseFloat(tile().style.opacity)).toBeLessThan(1);
  });

  it("ages the last event in human units", () => {
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
    board([
      card({ id: 1, slug: "S", last_event_ts: ago(5_000) }),
      card({ id: 2, slug: "M", last_event_ts: ago(5 * 60_000) }),
      card({ id: 3, slug: "H", last_event_ts: ago(5 * 3_600_000) }),
      card({ id: 4, slug: "D", last_event_ts: ago(3 * 86_400_000) }),
      card({ id: 5, slug: "NONE", last_event_ts: null }),
    ]);
    expect(screen.getByText("5s ago")).toBeTruthy();
    expect(screen.getByText("5m ago")).toBeTruthy();
    expect(screen.getByText("5h ago")).toBeTruthy();
    expect(screen.getByText("3d ago")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("the per-tile RUN button", () => {
  const run = () => fireEvent.click(screen.getByLabelText("run card"));

  it("runs the preflight BEFORE playing anything", async () => {
    board([card()]);
    run();
    await waitFor(() => expect(cardPreflight).toHaveBeenCalledWith("FEAT-A"));
    await waitFor(() => expect(setCardIntent).toHaveBeenCalledWith("FEAT-A", "play"));
  });

  it("clears the driver halt before playing — otherwise the tick is a no-op", async () => {
    board([card()]);
    run();
    await waitFor(() => expect(dispatchHalt).toHaveBeenCalledWith(false));
    await waitFor(() => expect(dispatchForceTick).toHaveBeenCalled());
  });

  it("HARD-blocks on a failed preflight: no play, no tick, blockers shown", async () => {
    cardPreflight.mockResolvedValue({ ok: false, blockers: [{ message: "depends on FEAT-B" }, { message: "no acceptance criteria" }], accuracy_score: 40, accuracy_min: 70 });
    board([card()]);
    run();
    await waitFor(() => expect(screen.getByText("run blocked")).toBeTruthy());
    expect(screen.getByText("depends on FEAT-B")).toBeTruthy();
    expect(screen.getByText("no acceptance criteria")).toBeTruthy();
    expect(screen.getByText(/accuracy 40\/100 · gate ≥70/)).toBeTruthy();
    expect(setCardIntent).not.toHaveBeenCalled();
    expect(dispatchForceTick).not.toHaveBeenCalled();
  });

  it("says so when the preflight itself could not run", async () => {
    cardPreflight.mockResolvedValue(null);
    board([card()]);
    run();
    await waitFor(() => expect(screen.getByText("preflight failed — try again")).toBeTruthy());
    expect(setCardIntent).not.toHaveBeenCalled();
  });

  it("surfaces a thrown error instead of silently doing nothing", async () => {
    cardPreflight.mockRejectedValue(new Error("BE down"));
    board([card()]);
    run();
    await waitFor(() => expect(screen.getByText("BE down")).toBeTruthy());
  });

  it("dismisses the blocker popover on an outside click", async () => {
    cardPreflight.mockResolvedValue({ ok: false, blockers: [{ message: "nope" }] });
    const { container } = board([card()]);
    run();
    await waitFor(() => expect(screen.getByText("run blocked")).toBeTruthy());
    const scrim = Array.from(container.querySelectorAll("div"))
      .find((d) => (d as HTMLElement).style.position === "fixed" && (d as HTMLElement).style.inset === "0px")!;
    fireEvent.click(scrim);
    expect(screen.queryByText("run blocked")).toBeNull();
  });

  it("pauses without a preflight — stopping is never gated", async () => {
    board([card({ driver_intent: "play" })]);
    fireEvent.click(screen.getByLabelText("pause card"));
    await waitFor(() => expect(setCardIntent).toHaveBeenCalledWith("FEAT-A", "pause"));
    expect(cardPreflight).not.toHaveBeenCalled();
    expect(dispatchForceTick).not.toHaveBeenCalled();
  });

  it("never navigates when the run button is clicked — the tile is a link", async () => {
    board([card()]);
    const clicked = vi.fn();
    tile().addEventListener("click", clicked);
    run();
    await waitFor(() => expect(cardPreflight).toHaveBeenCalled());
    expect(clicked.mock.calls.every((c) => c[0].defaultPrevented)).toBe(true);
  });

  it("refuses a second click while the first is still running", async () => {
    let release: (v: any) => void = () => {};
    cardPreflight.mockReturnValue(new Promise((r) => { release = r; }));
    board([card()]);
    run();
    await waitFor(() => expect(screen.getByLabelText("run card").textContent).toBe("…"));
    run();
    expect(cardPreflight).toHaveBeenCalledTimes(1);
    release({ ok: true, blockers: [] });
  });
});
