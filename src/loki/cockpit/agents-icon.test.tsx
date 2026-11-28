// THE AGENTS ICON (operator 2026-09-23: "remove the agents running indication on the right bottom, the mini window.
// Keep the agent running in background at a notification icon on the switcher top center. Add a notification icon
// that the border is coloured when some agent is running, discrete. On click open a full window with all
// notifications and agents stats"). The border IS the message, so what it says is the thing to pin.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/loki/api/client", () => ({ apiGet: async () => ({ agents: live }), apiPost: async () => [], unwrapResult: (r: any) => r }));
vi.mock("@/loki/api/hooks", () => ({ useNotifications: () => ({ data: [{ id: 1, severity: "warn", message_md: "a goal run needs a yes", ts: "2026-09-23 10:00:00" }] }) }));

import { AgentsIcon, toneOf, liveOnes, checksRunning, ram, machineLine } from "./agents-icon";
import type { LiveAgent } from "./agents-float";

const agent = (p: Partial<LiveAgent>): LiveAgent => ({
  pane_id: 1, session_id: 1, session_name: "s", key: "k", kind: "claude-code", worktree: "/w", ui: "chat",
  icon: null, name: "Scout", max: false, running: true, busy: false, model: "sonnet", cost_usd: 0.25,
  quota: null, preview: { text: "", tool: "", tool_open: false, t: 0 }, run: null, last_activity: null, checks: [], ...p,
});
let live: LiveAgent[] = [];

describe("what the border says", () => {
  it("is quiet when nothing is happening", () => {
    expect(toneOf([agent({ running: false })])).toBe("quiet");
    expect(toneOf([])).toBe("quiet");
  });

  it("is busy while an agent works", () => {
    expect(toneOf([agent({ busy: true })])).toBe("busy");
    expect(toneOf([agent({ run: { id: 1, status: "running", goal: "g", done: 0, running: 1, total: 2, created: 0, ended: null, questions: 0 } })])).toBe("busy");
  });

  it("an agent waiting on you outranks one that is merely working", () => {
    const working = agent({ pane_id: 1, busy: true });
    const asking = agent({ pane_id: 2, run: { id: 2, status: "awaiting-answers", goal: "g", done: 0, running: 0, total: 1, created: 0, ended: null, questions: 2 } });
    expect(toneOf([working, asking])).toBe("ask");
  });

  it("counts only agents that did something — a provisioned pane is not news", () => {
    const idle = agent({ pane_id: 3, running: false, busy: false });
    expect(liveOnes([idle])).toHaveLength(0);
    expect(liveOnes([idle, agent({ pane_id: 4, busy: true })])).toHaveLength(1);
  });
});

describe("the icon in the switcher", () => {
  it("wears the tone on its border and opens the full window on click", async () => {
    live = [agent({ busy: true })];
    render(<AgentsIcon pollMs={100000} />);
    await waitFor(() => expect(screen.getByTestId("agents-icon").getAttribute("data-tone")).toBe("busy"));
    expect(screen.queryByTestId("agents-window")).toBeNull();
    fireEvent.click(screen.getByTestId("agents-icon"));
    const w = await screen.findByTestId("agents-window");
    expect(w.textContent).toContain("Scout");
    expect(screen.getByTestId("agents-window-notes").textContent).toContain("a goal run needs a yes");
  });

  it("says nothing is running rather than showing an empty list", async () => {
    live = [];
    render(<AgentsIcon pollMs={100000} />);
    await waitFor(() => expect(screen.getByTestId("agents-icon").getAttribute("data-tone")).toBe("quiet"));
    fireEvent.click(screen.getByTestId("agents-icon"));
    expect((await screen.findByTestId("agents-window-stats")).textContent).toMatch(/nothing running/);
  });
});

// LIVE MACHINES, NOT MODELS (operator 2026-09-24: "we have a loading for subagents on the top, add on the side
// for QA, build, test, lint etc so we see live running processes"). A build takes minutes; until now it spent
// them invisibly and the agent looked idle while the box was busy proving its claim.
describe("the deterministic checks in flight", () => {
  it("shows each check once, counts the agents running it, and says nothing when nothing runs", () => {
    const a = (checks?: string[]) => agent({ checks });
    expect(checksRunning([a(), a([])])).toEqual([]);
    expect(checksRunning([a(["build", "test"]), a(["build"])])).toEqual([{ what: "build", n: 2 }, { what: "test", n: 1 }]);
    expect(checksRunning([a([" lint ", ""])])).toEqual([{ what: "lint", n: 1 }]);
  });

  it("puts a pulsing chip beside the bell only while something is actually running", async () => {
    live = [agent({ checks: ["build"] })];
    render(<AgentsIcon pollMs={10_000} />);
    await waitFor(() => expect(screen.getByTestId("agents-check-build").textContent).toBe("build"));
    expect(screen.getByTestId("agents-checks").getAttribute("title")).toContain("proving an agent's claim");

    live = [agent({ checks: [] })];
    render(<AgentsIcon pollMs={10_000} />);
    await waitFor(() => expect(screen.queryAllByTestId("agents-checks").length).toBe(1), { timeout: 2000 });
  });
});

// WHAT EACH AGENT COSTS IN MEMORY, AND THE EMERGENCY (operator 2026-09-24: "be aware of RAM spent in each agent,
// show discretely at the agents the current ram used in each one (live). So have a measure if the PC is close to
// froze like pause one process till other finishes (only as emergency measure)").
describe("the memory readings", () => {
  it("reads at a glance and says nothing when there is nothing to say", () => {
    expect(ram(undefined)).toBe("");
    expect(ram(0)).toBe("");
    expect(ram(420 * 1024 * 1024)).toBe("420 MB");
    expect(ram(1024 ** 3 + 1024 ** 2 * 400)).toBe("1.4 GB");
  });

  it("the machine's own line appears only when the box is actually under pressure", () => {
    // an always-visible number is a number nobody reads
    expect(machineLine({ available: 8 * 1024 ** 3, pressure: "easy" })).toBeNull();
    expect(machineLine(null)).toBeNull();
    expect(machineLine({ pressure: "tight", available: 2 * 1024 ** 3 })).toEqual({ text: "2.0 GB of memory left", tone: "warn" });
    const crit = machineLine({ pressure: "critical", available: 800 * 1024 ** 2 })!;
    expect(crit.tone).toBe("bad");
    expect(crit.text).toContain("antiloki will pause an agent before the machine freezes");
  });

  it("an agent's row carries its own number, and says when the watchdog stopped it", async () => {
    live = [agent({ rss: 1024 ** 3 + 1024 ** 2 * 400, cost_usd: 0.25, paused: true })];
    render(<AgentsIcon pollMs={10_000} />);
    await waitFor(() => expect(screen.getByTestId("agents-icon")).toBeTruthy());
    fireEvent.click(screen.getByTestId("agents-icon"));
    const row = screen.getByTestId("agents-window-1").textContent ?? "";
    expect(row).toContain("1.4 GB");
    expect(row).toContain("paused");
    expect(screen.getByTestId("agents-paused-1").getAttribute("title")).toContain("resumes by itself");
  });
});
