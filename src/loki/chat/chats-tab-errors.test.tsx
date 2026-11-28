// @vitest-environment jsdom
// A CHAT ACTION THE SERVE REFUSED (audit 2026-10-01): switching the provider or opening a new topic answered null on a refusal and showed nothing at all.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/loki/widgets/cockpit-pane-body", () => ({ CockpitPaneBody: () => null }));
const chat = { pane_id: 8, session_id: 3, key: "chat-1", engine: "codex", title: "", last: 3, made: 1, turns: 3, live: true, busy: false,
  episodes: [{ n: 1, seq: 1, t: Date.now() - 3_600_000, reason: "the first", engine: "codex", turns: 1, last_t: Date.now() - 3_500_000, first_ask: "hi", snapshot: "", title: "hi" }] };
vi.mock("@/loki/api/client", async () => { const real: any = await vi.importActual("@/loki/api/client"); return { ...real, apiGet: vi.fn(async () => ({ chats: [chat] })), apiPost: vi.fn(async () => null) }; });
import { useChatsTab } from "./chats-tab";

function Harness() { const { side, stage } = useChatsTab(true); return <>{side}{stage}</>; }

describe("the chats tab when the serve refuses", () => {
  it("a new topic the serve did not open says so", async () => {
    render(<Harness />);
    const btn = await screen.findByTestId("chat-new-topic");
    await waitFor(() => expect((screen.getByTestId("chat-new-topic") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    await waitFor(() => expect(document.body.textContent).toContain("did not answer"));
  });
});
