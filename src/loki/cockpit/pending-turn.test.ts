// THE ASK MUST APPEAR THE MOMENT IT IS SENT (operator 2026-09-25, from the Windows build: "I noticed when i
// write something first the heimdall side pane blinks wich is good, but the chat shows nothing, even my
// prompt"). Every turn in a pane came from the serve's event log, so nothing was drawn until the engine echoed
// the ask back — and on the Heimdall door that echo arrives only after a model has been picked and started.
import { describe, it, expect } from "vitest";
import { applyEvent, type Turn } from "./agent-chat-pane";

const user = (text: string) => ({ ev: { type: "antiloki", subtype: "user", text }, t: 1000 });
const pending = (text: string): Turn => ({ kind: "user", seq: 0.5, t: 1, text, pending: true });

describe("the optimistic ask", () => {
  it("is adopted by the serve's echo, not printed twice", () => {
    const out = applyEvent([pending("fix the login page")], 7, user("fix the login page"));
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ kind: "user", seq: 7, t: 1000, text: "fix the login page" });
    expect((out[0] as any).pending).toBeUndefined();  // it is the real turn now, with the real seq
  });

  it("a different ask is a different turn — the echo does not swallow an unrelated placeholder", () => {
    const out = applyEvent([pending("first ask")], 7, user("second ask"));
    expect(out).toHaveLength(2);
    expect(out.map((x: any) => x.text)).toEqual(["first ask", "second ask"]);
    expect((out[0] as any).pending).toBe(true);
  });

  it("an echo with no placeholder still lands — a turn from the terminal session, or a resumed log", () => {
    const out = applyEvent([], 3, user("typed straight into the CLI"));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "user", text: "typed straight into the CLI" });
  });

  it("only a PENDING turn is adopted, so re-reading a log does not rewrite history", () => {
    const settled: Turn = { kind: "user", seq: 2, t: 5, text: "same words" };
    const out = applyEvent([settled], 9, user("same words"));
    expect(out).toHaveLength(2);  // two genuine asks with the same text stay two asks
  });
});
