// EPISODES BELONG TO THEIR AGENT (operator 2026-09-23: "episodes on the agents, place it below each agent
// collapsed, on click the agent it expands the last 3 episodes with blur and another expand button to expand the
// rest"). They used to be one block at the bottom of the roster describing whichever row was selected, which read
// as the sidebar's list rather than the agent's. What is pinned here: three at a time, newest first, a fade only
// when something is actually hidden, and a way to see the rest.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/loki/widgets/cockpit-pane-body", () => ({ CockpitPaneBody: () => null }));

import { Episodes } from "./agents-tab";

const agent = (n: number) => ({
  slug: "scout", name: "X trend scout", icon: "🔭", provider: "opencode", pane_id: 9, engine: "opencode",
  pair: "solo", status: "idle", tone: "idle", saved: 0, saved_est: 0, live: false, runs: 0,
  episodes: Array.from({ length: n }, (_, i) => ({ n: i + 1, title: `episode ${i + 1}`, turns: i + 1 })),
}) as any;

describe("an agent's episodes", () => {
  it("shows the last three, newest first", () => {
    render(<Episodes agent={agent(6)} />);
    const list = screen.getByTestId("agent-episodes-list");
    expect(screen.getByTestId("agent-episodes").getAttribute("data-shown")).toBe("3");
    expect(list.textContent).toContain("episode 6");
    expect(list.textContent).toContain("episode 4");
    expect(list.textContent).not.toContain("episode 3");
  });

  it("fades the list only when episodes are actually hidden", () => {
    render(<Episodes agent={agent(6)} />);
    expect(screen.getByTestId("agent-episodes-list").getAttribute("data-faded")).toBe("1");
  });

  it("does not fade when everything already fits", () => {
    render(<Episodes agent={agent(2)} />);
    expect(screen.getByTestId("agent-episodes-list").getAttribute("data-faded")).toBeNull();
    expect(screen.queryByTestId("agent-episodes-more")).toBeNull();
  });

  it("expands to the rest, and folds back to three", () => {
    render(<Episodes agent={agent(6)} />);
    const more = screen.getByTestId("agent-episodes-more");
    expect(more.textContent).toContain("3 more");
    fireEvent.click(more);
    const list = screen.getByTestId("agent-episodes-list");
    expect(list.textContent).toContain("episode 1");
    expect(list.getAttribute("data-faded")).toBeNull();   // nothing is hidden, so nothing fades
    fireEvent.click(screen.getByTestId("agent-episodes-more"));
    expect(screen.getByTestId("agent-episodes-list").textContent).not.toContain("episode 1");
  });

  it("says what is there when an agent has none yet", () => {
    render(<Episodes agent={agent(0)} />);
    expect(screen.getByTestId("agent-episodes").textContent).toMatch(/nothing yet/);
  });
});
