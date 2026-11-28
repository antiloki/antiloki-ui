// @vitest-environment jsdom
// THE EPISODES SIDEBAR (operator 2026-09-27: "add back a sidebar left, but instead of agents, just the episodes,
// make the episode design back with the consolidation preview summary").
//
// The left column had been removed on the agents surface — one role-switching agent has no roster worth a column.
// Its EPISODES do: they are the units of work, and what each one came to is the thing worth carrying down the side.
// So the column is back, it lists episodes rather than agents, and it reads through the same `episodeSummary` the
// nested list uses so the two designs can never drift apart.
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { EpisodesSidebar, episodeSummary } from "./agents-tab";

const agent = (episodes: any[]) => ({ slug: "a", name: "A", episodes } as any);

describe("the episodes sidebar", () => {
  it("lists every episode newest first, with the consolidation line and not just a turn count", () => {
    render(<EpisodesSidebar agent={agent([
      { n: 1, title: "the cart rounding", subtitle: "found the float and pinned it with a test", turns: 4, engine: "codex" },
      { n: 2, first_ask: "make formatPrice use Intl", story: "Switched to Intl.NumberFormat. Kept the signature.", turns: 2 },
    ])} />);
    const side = screen.getByTestId("episodes-sidebar");
    expect(side.getAttribute("data-count")).toBe("2");
    // NEWEST FIRST — an episode list read oldest-first makes the reader scroll to find where they are
    const order = [...side.querySelectorAll("[data-testid^='side-episode-']")].map((e) => e.getAttribute("data-testid"));
    expect(order).toEqual(["side-episode-2", "side-episode-1"]);
    // the consolidation's own line is the point of the design, so it must actually be on screen
    expect(screen.getByText("found the float and pinned it with a test")).toBeTruthy();
    // and the story stands in when there is no subtitle, trimmed to one sentence
    expect(screen.getByText("Switched to Intl.NumberFormat.")).toBeTruthy();
    // the meta row carries turns and engine
    expect(screen.getByText(/4 turns · codex/)).toBeTruthy();
  });

  it("says so rather than drawing an empty column", () => {
    render(<EpisodesSidebar agent={agent([])} />);
    expect(screen.getByTestId("episodes-sidebar").getAttribute("data-count")).toBe("0");
    expect(screen.getByText(/no closed episode yet/)).toBeTruthy();
  });

  it("survives having no agent at all — the surface renders before the roster arrives", () => {
    render(<EpisodesSidebar agent={null} />);
    expect(screen.getByText(/no agent open yet/)).toBeTruthy();
  });

  it("titles an unnamed episode by the ask it opened on, never by the word 'episode'", () => {
    // the same rule the nested list obeys, asserted here so the sidebar cannot drift from it
    expect(episodeSummary({ n: 1, first_ask: "fix the retry backoff\nand the test" }).head).toBe("fix the retry backoff");
    expect(episodeSummary({ n: 1 }).head).toBe("episode");
  });
});

describe("an episode that came from a fork", () => {
  it("is marked in master's list, and the live one never is", () => {
    // operator 2026-09-27: "only on merge with the master they merge with master episodes (but showing wich
    // episodes came from outside)". Without the mark a merged timeline claims the master agent did work it
    // inherited, which is the one thing a record of who-did-what must not do.
    render(<EpisodesSidebar agent={agent([
      { n: 1, title: "on master", turns: 2 },
      { n: 2, title: "in the double", turns: 3, forked_from: 25, agent: "main-sly-twin" },
      { n: 3, turns: 0 },
    ])} />);
    expect(screen.getByTestId("episode-forked-2")).toBeTruthy();
    expect(screen.queryByTestId("episode-forked-1")).toBeNull();
    // #3 is the OPEN one: it is where you are, not something inherited, so it wears NOW and never the fork mark
    expect(screen.getByTestId("episode-live")).toBeTruthy();
    expect(screen.queryByTestId("episode-forked-3")).toBeNull();
  });
});
