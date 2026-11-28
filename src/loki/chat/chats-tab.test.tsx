// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { EpisodesSidebar, ChatsStage, createChat, ago, type ChatRow } from "./chats-tab";

let body: any = null;
const posts: any[] = [];
vi.mock("@/loki/widgets/cockpit-pane-body", () => ({ CockpitPaneBody: (p: any) => { body = p; return null; } }));
vi.mock("@/loki/api/client", async () => { const real: any = await vi.importActual("@/loki/api/client"); return { ...real, apiPost: vi.fn(async (url: string, b: any) => { posts.push({ url, b }); return { pane: { id: 9, session_id: 2, subagent_name: "chat-1", pane_kind: "gemini" } }; }) }; });
// THE MACHINE OF 2026-10-01: Claude switched off; Codex + Cursor + Gemini signed in
vi.mock("@/loki/api/seats", async () => { const real: any = await vi.importActual("@/loki/api/seats"); return { ...real, useSeats: () => real.seatsOf({ engines: [
  { key: "gemini", name: "Gemini", usable: true, on: true }, { key: "claude-code", name: "Claude", usable: false, on: false }, { key: "codex", name: "Codex", usable: true, on: true },
  { key: "grok", name: "Grok", usable: false, on: true }, { key: "cursor", name: "Cursor", usable: true, on: true }, { key: "opencode", name: "OpenCode", usable: false, on: true }], heimdall: { effective: "gemini" } }) }; });

const chat: ChatRow = {
  pane_id: 8, session_id: 3, key: "chat-1", engine: "opencode", title: "", last: 3, made: 1, turns: 3, live: true, busy: false,
  episodes: [
    { n: 1, seq: 1, t: Date.now() - 3_600_000, reason: "the first", engine: "claude-code", turns: 1, last_t: Date.now() - 3_500_000, first_ask: "what did the QA judge say?", snapshot: "", title: "what did the QA judge say?", subtitle: "Run #38 passed 97/100.", replies: 1 },
    { n: 2, seq: 6, t: Date.now() - 1_800_000, reason: "continued on opencode", engine: "opencode", turns: 2, last_t: Date.now() - 1_000_000, first_ask: "which box?", snapshot: "**operator:** what did the QA judge say?\n\n**agent:** Run #38 passed", title: "which box?", subtitle: "cockpit-5-0, 97/100.", replies: 2 },
    { n: 3, seq: 12, t: Date.now() - 60_000, reason: "you marked a new topic", engine: "opencode", turns: 0, last_t: Date.now() - 60_000, first_ask: "", snapshot: "4 turn(s); the last 4:\n- **you:** which box?", title: "", subtitle: "", replies: 0 },
  ],
};

describe("the chats tab (2026-09-21): one chat, a line of episodes named by their consolidations", () => {
  it("● now is the open episode; the chapters list back through time with title and subtitle; a record unfolds", () => {
    const onNewTopic = vi.fn();
    render(<EpisodesSidebar chat={chat} busy={false} onNewTopic={onNewTopic} />);
    expect(screen.getByTestId("episode-now").textContent).toContain("now — episode #3");
    expect(screen.getByTestId("episode-now").textContent).toContain("opened — you marked a new topic");
    // the chapters: newest first, each with its name
    const e2 = screen.getByTestId("episode-2"); expect(e2.textContent).toContain("episode #2"); expect(e2.textContent).toContain("“which box?”"); expect(e2.textContent).toContain("cockpit-5-0, 97/100.");
    expect(e2.textContent).toContain("opened — continued on opencode");
    expect(screen.getByTestId("episode-1").textContent).toContain("“what did the QA judge say?”");
    // the record of #2 is the snapshot #3's marker carries, markdown bold stripped
    expect(screen.getByTestId("episode-record-2").textContent).toContain("- you: which box?");
    expect(screen.getByTestId("episode-record-1").textContent).toContain("operator: what did the QA judge say?");
    // New topic is off while the open episode is empty
    expect((screen.getByTestId("chat-new-topic") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("chat-new-topic")); expect(onNewTopic).not.toHaveBeenCalled();
    // with turns it fires
    const withTurns = { ...chat, episodes: chat.episodes.map((e) => (e.n === 3 ? { ...e, turns: 1 } : e)) };
    render(<EpisodesSidebar chat={withTurns} busy={false} onNewTopic={onNewTopic} />);
    fireEvent.click(screen.getAllByTestId("chat-new-topic")[1]); expect(onNewTopic).toHaveBeenCalledTimes(1);
    expect(ago(Date.now() - 5 * 60_000)).toBe("5m ago"); expect(ago(0)).toBe("");
  });
  it("without a chat the story has not begun", () => {
    render(<EpisodesSidebar chat={null} busy={false} onNewTopic={() => {}} />);
    expect(screen.getByTestId("chat-episodes").textContent).toContain("the story begins with your first message");
  });
});

describe("no default provider is Claude (operator 2026-10-01, \"Engine config also\")", () => {
  it("a new chat names no engine - the serve assigns the seat - and the row carries the engine it assigned", async () => {
    posts.length = 0;
    const row = await createChat();
    expect(posts[0].url).toBe("/api/v1/cockpit/chat/create");
    expect("engine" in posts[0].b).toBe(false);
    expect(row?.engine).toBe("gemini");
    // a chosen one is still sent
    await createChat("codex");
    expect(posts[1].b.engine).toBe("codex");
  });
  it("the provider picker offers the seats that can run today - not a switched-off Claude - and keeps the chat's own", () => {
    render(<ChatsStage chat={chat} busy="" err={null} onSwitch={() => {}} />);
    expect(body.chatSwitch.engines).toEqual(["gemini", "codex", "cursor", "opencode"]);   // opencode: it is this chat's own seat
    expect(body.chatSwitch.engines).not.toContain("claude-code");
  });
});
