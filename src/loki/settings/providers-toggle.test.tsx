// @vitest-environment jsdom
// A WHOLE SEAT SWITCHED OFF (operator 2026-09-30: the Claude subscription ends today). The Providers screen carries one switch per seat and posts the engine key.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const posts: any[] = [];
let payload: any; let refuse = false;
vi.mock("@/loki/api/client", () => ({
  apiGet: vi.fn(async () => payload),
  apiPost: vi.fn(async (_u: string, b: any) => { posts.push(b); if (refuse) return null; /* the real client's answer to a refusal, a timeout or a dead serve */ const r = payload.engines.find((e: any) => e.key === b.name); if (r) { r.on = b.on; r.blocked = b.on ? null : "Claude is switched off (Settings › Seats)."; r.usable = b.on; } return { ok: true }; }),
}));
import { Providers } from "./ai-engines";

beforeEach(() => {
  posts.length = 0; refuse = false;
  payload = {
    switches: {},
    engines: [
      { key: "claude-code", name: "Claude", binaries: ["claude"], binary: "claude", installed: true, signed_in: true, usable: true, metered_gateway: false, blocked: null, on: true },
      { key: "codex", name: "Codex", binaries: ["codex"], binary: "codex", installed: true, signed_in: true, usable: true, metered_gateway: false, blocked: null, on: true },
    ],
  };
});

describe("the per-seat switch", () => {
  it("turns a seat off by posting its engine key, and shows it switched off with the way back", async () => {
    render(<Providers />);
    const t = await screen.findByTestId("seat-toggle-claude-code");
    expect(t.textContent).toBe("turn off");
    fireEvent.click(t);
    await waitFor(() => expect(posts).toEqual([{ name: "claude-code", on: false }]));
    await waitFor(() => expect(screen.getByTestId("seat-toggle-claude-code").textContent).toBe("turn on"));
    expect(screen.getByTestId("seat-claude-code").textContent).toContain("switched off");
    expect(screen.getByTestId("seat-codex").textContent).toContain("ready");       // the others are untouched
  });
  it("a switch the serve refused shows why and leaves the seat as it was (apiPost never throws: the old catch was dead)", async () => {
    refuse = true;
    render(<Providers />);
    fireEvent.click(await screen.findByTestId("seat-toggle-claude-code"));
    await waitFor(() => expect(screen.getByTestId("providers").textContent).toContain("could not save"));
    expect(screen.getByTestId("seat-toggle-claude-code").textContent).toBe("turn off");
  });
});
