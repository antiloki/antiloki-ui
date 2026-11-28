// @vitest-environment jsdom
// THE HAND-OFF IS A VERB ON EVERY AGENT (operator's queue, 2026-09-25): "move this session to Codex/OpenCode carrying
// the conversation". The chip and the endpoint both existed for antiChat; only the `chat` gate kept them from the rest.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
vi.mock("@/loki/api/client", () => ({ apiGet: vi.fn(async () => null), apiPost: vi.fn(async () => null) }));
import { ProviderSwitch, WireNotes, applyEvent } from "./agent-chat-pane";


// ── THE HAND-OFF IS A VERB ON EVERY AGENT (2026-09-25) ─────────────────────────────────────────────────────────────
describe("the provider hand-off", () => {
  it("offers the chip on an ordinary agent pane, not only on antiChat", () => {
    const picked: string[] = [];
    const Harness = () => { const [open, setOpen] = React.useState(false);
      return <ProviderSwitch sw={{ engines: ["claude-code", "codex", "opencode"], busy: false, pick: (e) => picked.push(e) }} engine="claude-code" open={open} setOpen={setOpen} />; };
    render(<Harness />);
    const chip = screen.getByTestId("chat-provider");
    expect(chip).toBeTruthy();
    fireEvent.click(chip);
    const menu = screen.getByTestId("chat-provider-menu");
    expect(menu.textContent).toContain("codex");
  });

  it("says it is handing over while the serve works, and refuses a second click", () => {
    const picked: string[] = [];
    render(<ProviderSwitch sw={{ engines: ["codex"], busy: true, pick: (e) => picked.push(e) }} engine="claude-code" open={false} setOpen={() => {}} />);
    const chip = screen.getByTestId("chat-provider") as HTMLButtonElement;
    expect(chip.textContent).toContain("handing over");
    expect(chip.disabled).toBe(true);
  });
});


// THE WIRE IS FOLDED, NOT DROPPED (operator 2026-09-28, quoting their own transcript: "· ⌕ looked up: … · ✦
// composer-2.5 · 21.4 s · 47.2k tokens · $0.0088 · ◌ checking the claim … · ✓ laws: not run …" — "i dont want you
// to remove them, i want you to collapse and hidde. Onclick be able to see it").
describe("the telemetry fold", () => {
  const ev = (seq: number, e: any) => ({ seq, t: seq, ev: e });

  it("files the operator's own four noisy lines on the wire, not in the conversation", () => {
    let turns: any[] = [];
    const wire = [
      { type: "antiloki", subtype: "context", used: [{ label: "goal run #245" }, { label: "goal run #232" }] },
      { type: "antiloki", subtype: "audit", model: "composer-2.5", ms: 21400, tokens: 47200, cost: 0.0088 },
      { type: "antiloki", subtype: "gates", state: "running", text: "checking the claim: laws over 2 changed file(s)" },
      { type: "antiloki", subtype: "gates", state: "passed", text: "laws: not run — no code laws written yet" },
    ];
    wire.forEach((e, i) => { turns = applyEvent(turns, i + 1, ev(i + 1, e)); });
    const notes = turns.filter((t) => t.kind === "note");
    expect(notes.length).toBe(4);                      // nothing was dropped
    expect(notes.every((n) => n.chan === "wire")).toBe(true);
  });

  it("carries the event id onto a warning note and renders it only when present", () => {
    let turns: any[] = [];
    turns = applyEvent(turns, 1, { seq: 1, t: 1, id: "W1a2b-003", ev: { type: "antiloki", subtype: "note", tone: "warn", text: "quota low" } });
    turns = applyEvent(turns, 2, { seq: 2, t: 2, ev: { type: "antiloki", subtype: "note", tone: "warn", text: "older warning" } });
    const notes = turns.filter((t) => t.kind === "note");
    expect(notes[0].id).toBe("W1a2b-003");
    expect(notes[1].id).toBeUndefined();
    render(<WireNotes notes={notes.map((n: any) => ({ ...n, chan: "wire" }))} />);
    fireEvent.click(screen.getByTestId("wire-notes-toggle"));
    const tags = screen.getAllByTestId("note-id");
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent).toBe("W1a2b-003");
  });

  it("keeps a stack trace out of the transcript — one event per line is how it floods", () => {
    let turns: any[] = [];
    const trace = ["Error: boom", "    at one (a.ts:1:1)", "    at two (b.ts:2:2)"];
    trace.forEach((line, i) => { turns = applyEvent(turns, i + 1, ev(i + 1, { type: "antiloki", subtype: "stderr", text: line })); });
    const notes = turns.filter((t) => t.kind === "note");
    expect(notes.length).toBe(3);
    expect(notes.every((n) => n.chan === "wire" && n.tone === "bad")).toBe(true);
  });

  it("leaves the conversation alone — a note the operator should read stays inline", () => {
    let turns: any[] = [];
    turns = applyEvent(turns, 1, ev(1, { type: "antiloki", subtype: "note", text: "the worktree was created", tone: "ok" }));
    turns = applyEvent(turns, 2, ev(2, { type: "antiloki", subtype: "episode", n: 3, reason: "new topic" }));
    turns = applyEvent(turns, 3, ev(3, { type: "antiloki", subtype: "exited", code: 1 }));
    const notes = turns.filter((t) => t.kind === "note");
    expect(notes.length).toBe(3);
    expect(notes.every((n) => n.chan !== "wire")).toBe(true);
  });

  it("shows nothing until clicked, then shows every line", () => {
    const notes = [
      { text: "⌕ looked up: goal run #245", tone: "dim" as const },
      { text: "Error: boom", tone: "bad" as const },
    ];
    render(<WireNotes notes={notes} />);
    expect(screen.queryByTestId("wire-notes")).toBeNull();          // folded by default
    const toggle = screen.getByTestId("wire-notes-toggle");
    expect(toggle.textContent).toContain("1 line of error output");  // the summary names the worst of it
    fireEvent.click(toggle);
    expect(screen.getByTestId("wire-notes").textContent).toContain("Error: boom");
    expect(screen.getByTestId("wire-notes").textContent).toContain("goal run #245");
  });

  it("renders nothing at all when there is no telemetry", () => {
    const { container } = render(<WireNotes notes={[]} />);
    expect(container.textContent).toBe("");
  });
});


// THE CHAT SAYS WHAT HAPPENED (operator 2026-09-28: "the stats detail box didnt show after completion of my
// prompt, neither an answer of the AI. Even tough it did the task i asked, didnt say anything after. Dont hide the
// model response, show real logs from the agent.")
describe("a delegated run reaching the chat", () => {
  const ev = (seq: number, e: any) => ({ seq, t: seq, ev: e });

  it("opens a stats box the moment a run starts here, not only when the pane answered it itself", () => {
    // `savings` only ever arrives for a turn the pane's OWN session answered; a delegated run is done by
    // sub-agents in the box, so the chat used to stay blank while the work happened
    let turns = applyEvent([], 1, ev(1, { type: "antiloki", subtype: "run", run: 245 }));
    const story = turns.find((t: any) => t.kind === "story") as any;
    expect(story?.run).toBe(245);
    // the same run announced twice does not open a second box
    turns = applyEvent(turns, 2, ev(2, { type: "antiloki", subtype: "savings", run: 245 }));
    expect(turns.filter((t: any) => t.kind === "story").length).toBe(1);
  });

  it("keeps the events it has no line for instead of dropping them on the floor", () => {
    let turns: any[] = [];
    // every one of these was emitted by the serve, written to the log, and discarded by this reducer
    for (const [i, e] of [
      { type: "antiloki", subtype: "role", text: "Frontender — same engine" },
      { type: "antiloki", subtype: "handoff", ms: 1200 },
      { type: "antiloki", subtype: "paused" },
    ].entries()) turns = applyEvent(turns, i + 1, ev(i + 1, e));
    const notes = turns.filter((t: any) => t.kind === "note");
    expect(notes.length).toBe(3);
    expect(notes.every((n: any) => n.chan === "wire")).toBe(true);     // kept, folded, one click away
    expect(notes[0].text).toContain("Frontender");                     // what it said, when it said something
    expect(notes[2].text).toBe("paused");                              // and its own name when it did not
  });

  it("still ignores an event with no subtype at all", () => {
    expect(applyEvent([], 1, ev(1, { type: "antiloki" })).length).toBe(0);
  });
});
