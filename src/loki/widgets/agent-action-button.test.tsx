// One button that targets an agent pane. The whole design hinges on the count: zero panes must say
// so (not fail silently), one pane must act immediately (no pointless picker), several must ask
// first. It also lives inside clickable rows, so every click it handles has to stop there.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const listAgents = vi.fn();
vi.mock("./agent-interact", () => ({ listAgents: (...a: any[]) => listAgents(...a) }));

import { AgentActionButton } from "./agent-action-button";

const pane = (id: number, kind = "claude-code") => ({ id, kind, name: `pane ${id}` });

const mount = (act_: any, sessionId: number | null = 5) =>
  render(<AgentActionButton chatSessionId={sessionId} label="feed" title="feed this to an agent" act={act_} />);

beforeEach(() => { listAgents.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe("with exactly one agent pane", () => {
  it("acts on it straight away — no picker", async () => {
    listAgents.mockResolvedValue([pane(3)]);
    const doIt = vi.fn(async () => "sent");
    mount(doIt);
    fireEvent.click(screen.getByText("feed"));
    await waitFor(() => expect(doIt).toHaveBeenCalledWith(pane(3)));
    expect(await screen.findByText("sent")).toBeTruthy();
  });

  it("asks for the panes of THIS chat session", async () => {
    listAgents.mockResolvedValue([]);
    mount(vi.fn(), 42);
    fireEvent.click(screen.getByText("feed"));
    await waitFor(() => expect(listAgents).toHaveBeenCalledWith(42));
  });
});

describe("with several agent panes", () => {
  it("offers one button per pane, glyphed and numbered", async () => {
    listAgents.mockResolvedValue([pane(1), pane(2, "codex")]);
    mount(vi.fn(async () => "ok"));
    fireEvent.click(screen.getByText("feed"));
    expect(await screen.findByText(/#1/)).toBeTruthy();
    expect(screen.getByText(/#2/)).toBeTruthy();
    expect(screen.getByText(/#1/).textContent).toContain("✦");  // claude-code's glyph
    expect(screen.getByText(/#2/).textContent).toContain("◇");  // codex's
  });

  it("acts on the pane the operator picked", async () => {
    listAgents.mockResolvedValue([pane(1), pane(2)]);
    const doIt = vi.fn(async () => "done");
    mount(doIt);
    fireEvent.click(screen.getByText("feed"));
    fireEvent.click(await screen.findByText(/#2/));
    await waitFor(() => expect(doIt).toHaveBeenCalledWith(pane(2)));
  });

  it("can be dismissed without acting", async () => {
    listAgents.mockResolvedValue([pane(1), pane(2)]);
    const doIt = vi.fn();
    mount(doIt);
    fireEvent.click(screen.getByText("feed"));
    fireEvent.click(await screen.findByText("✕"));
    await waitFor(() => expect(screen.getByText("feed")).toBeTruthy());
    expect(doIt).not.toHaveBeenCalled();
  });

  it("names each pane in a tooltip so #2 is not just a number", async () => {
    listAgents.mockResolvedValue([pane(1), pane(2)]);
    mount(vi.fn());
    fireEvent.click(screen.getByText("feed"));
    expect((await screen.findByText(/#1/)).getAttribute("title")).toBe("pane 1 · pane #1");
  });
});

describe("with no agent panes", () => {
  it("says so instead of appearing to do nothing", async () => {
    listAgents.mockResolvedValue([]);
    const doIt = vi.fn();
    mount(doIt);
    fireEvent.click(screen.getByText("feed"));
    expect(await screen.findByText("no agent panes yet")).toBeTruthy();
    expect(doIt).not.toHaveBeenCalled();
  });
});

describe("results", () => {
  it("shows a failure marker when the action returns nothing", async () => {
    listAgents.mockResolvedValue([pane(1)]);
    mount(vi.fn(async () => null));
    fireEvent.click(screen.getByText("feed"));
    expect(await screen.findByText("⚠ failed")).toBeTruthy();
  });

  it("clears the note after a few seconds and returns to the button", async () => {
    vi.useFakeTimers();
    listAgents.mockResolvedValue([pane(1)]);
    mount(vi.fn(async () => "sent"));
    fireEvent.click(screen.getByText("feed"));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText("sent")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByText("feed")).toBeTruthy();
  });
});

describe("inside a clickable row", () => {
  it("never lets its own click reach the row", async () => {
    listAgents.mockResolvedValue([pane(1), pane(2)]);
    const rowClick = vi.fn();
    render(<div onClick={rowClick}><AgentActionButton chatSessionId={1} label="feed" title="t" act={vi.fn(async () => "ok")} /></div>);
    fireEvent.click(screen.getByText("feed"));
    fireEvent.click(await screen.findByText(/#1/));
    expect(rowClick).not.toHaveBeenCalled();
  });
});

describe("while busy", () => {
  it("shows a placeholder and refuses a second click", async () => {
    let release: (v: any) => void = () => {};
    listAgents.mockImplementation(() => new Promise((r) => { release = r; }));
    mount(vi.fn());
    fireEvent.click(screen.getByText("feed"));
    expect(await screen.findByText("…")).toBeTruthy();
    fireEvent.click(screen.getByText("…"));
    await act(async () => { release([]); });
    expect(listAgents).toHaveBeenCalledTimes(1);
  });
});
