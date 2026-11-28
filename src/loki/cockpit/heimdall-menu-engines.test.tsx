// @vitest-environment jsdom
// THE MENU IS THE SAME ON EVERY ENGINE AND ON THE CHATS (operator 2026-09-22: "test all this on base agent claude,
// codex and opencode and also on the chats"). claude-code · codex · opencode panes are ONE component — the composer
// footer of AgentChatPane — and antiChat mounts the same component with `chat`. What this pins: the heimdall word
// opens the menu on all four, the switch · AUTO · sub-agents · QA are in it, and QA and sub-agents no longer have
// chips of their own in the strip.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/loki/api/client", () => ({ apiGet: vi.fn(async () => ({})), apiPost: vi.fn(async () => ({})) }));
vi.mock("./pty-streams", () => ({ subscribeAgent: () => () => {} }));
vi.mock("@/loki/api/engine", async (importOriginal) => ({ ...(await importOriginal<any>()), askEngine: vi.fn(async () => ({})) }));
vi.mock("@/loki/api/dispatch", () => ({ uploadFile: vi.fn(async () => ({})) }));
vi.mock("@/loki/desktop/shell", () => ({ isDesktop: () => false, pickFile: vi.fn() }));
vi.mock("@/loki/shell/mini-tour", () => ({ useTourUnlock: () => () => {} }));
import { AgentChatPane } from "./agent-chat-pane";

const props = (kind: string, chat = false) => ({
  p: { id: 7, pane_kind: kind, subagent_name: `agent-${kind}`, worktree_path: "/tmp/wt", settings_json: "{}" },
  chat,
  heimdallOn: true, heimdallMode: "auto" as const, onHeimdallMode: vi.fn(),
  onToggleHeimdall: vi.fn(), dial: { position: 1 as const, context: 1 as const, cost: 1 as const }, onDialChange: vi.fn(),
  qaOn: false, onToggleQa: vi.fn(), subagentsOn: true, onToggleSubagents: vi.fn(),
});

describe.each([["claude-code"], ["codex"], ["opencode"]])("the heimdall menu on a %s pane", (kind) => {
  beforeEach(() => cleanup());
  it("opens from the word and carries the switch, AUTO, sub-agents and QA", () => {
    render(<AgentChatPane {...props(kind)} />);
    expect(screen.queryByTestId("heimdall-menu")).toBeNull();
    fireEvent.click(screen.getByTestId("agent-heimdall-chip"));
    expect(screen.getByTestId("heimdall-menu")).toBeTruthy();
    for (const t of ["heimdall-switch", "heimdall-mode-auto", "heimdall-subagents", "heimdall-qa", "heimdall-bars"]) {
      expect(screen.getByTestId(t), `${t} on ${kind}`).toBeTruthy();
    }
    // the strip no longer duplicates them
    expect(screen.queryByTestId("agent-qa")).toBeNull();
    expect(screen.queryByTestId("agent-subagents")).toBeNull();
  });
});

describe("the heimdall menu on a chat", () => {
  beforeEach(() => cleanup());
  it("is the same menu — antiChat mounts the same composer", () => {
    render(<AgentChatPane {...props("claude-code", true)} />);
    fireEvent.click(screen.getByTestId("agent-heimdall-chip"));
    expect(screen.getByTestId("heimdall-menu")).toBeTruthy();
    expect(screen.getByTestId("heimdall-switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("heimdall-bars")).toBeTruthy();
  });

  it("but shorter: a chat dispatches no work and gates no claims, so no sub-agents and no QA", () => {
    // the chat mount passes neither handler — the menu then has the states and the bars, and nothing else
    const { onToggleQa, onToggleSubagents, ...chatProps } = props("claude-code", true);
    render(<AgentChatPane {...chatProps} />);
    fireEvent.click(screen.getByTestId("agent-heimdall-chip"));
    expect(screen.getByTestId("heimdall-bars")).toBeTruthy();
    expect(screen.queryByTestId("heimdall-subagents")).toBeNull();
    expect(screen.queryByTestId("heimdall-qa")).toBeNull();
  });

  it("the chip carries what this pane saved — arithmetic when the router ran it, an estimate for MIN turns", () => {
    cleanup();
    // a routed run: the number is arithmetic, shown plainly
    render(<AgentChatPane {...props("claude-code")} heimdallSaved={1.234} />);
    expect(screen.getByTestId("agent-heimdall-chip").textContent).toContain("$1.23");
    expect(screen.getByTestId("agent-heimdall-chip").textContent).not.toContain("~");
    cleanup();
    // a chat: every turn is a MIN turn, so the only number is MIN's estimate — marked with a tilde
    render(<AgentChatPane {...props("claude-code", true)} heimdallSaved={0}
      routes={[{ id: 1, min: true, savings: { saved_usd: 0.4, actual_usd: 0.4 } } as any, { id: 2, min: true, savings: { saved_usd: 0.2, actual_usd: 0.2 } } as any]} />);
    expect(screen.getByTestId("agent-heimdall-chip").textContent).toContain("~$0.60");
  });

  it("the chip says which state Heimdall is in, on every engine", () => {
    for (const kind of ["claude-code", "codex", "opencode"]) {
      cleanup();
      render(<AgentChatPane {...props(kind)} heimdallMode="off" heimdallOn={false} />);
      expect(screen.getByTestId("agent-heimdall-chip").textContent).toContain("OFF");
    }
  });
});
