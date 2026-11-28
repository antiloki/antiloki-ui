import { describe, it, expect } from "vitest";
import { seatsOf, offered, seatName } from "./seats";
import { ENGINE_KEYS, pinnedEngine } from "./engine";

// THE MACHINE OF 2026-10-01: Claude switched off (its subscription ended), Codex + Cursor + Gemini signed in, no OpenCode
const payload = (heimdall?: string | null) => ({
  switches: {}, engines: [
    { key: "gemini", name: "Gemini", usable: true, on: true }, { key: "claude-code", name: "Claude", usable: false, on: false },
    { key: "codex", name: "Codex", usable: true, on: true }, { key: "grok", name: "Grok", usable: false, on: true },
    { key: "cursor", name: "Cursor", usable: true, on: true }, { key: "opencode", name: "OpenCode", usable: false, on: true },
  ], heimdall: { provider: "pane", effective: heimdall },
});

describe("the seats the serve reports", () => {
  it("the default is the seat Heimdall plans on, never a fixed Claude", () => {
    expect(seatsOf(payload("codex"))!.defaultKey).toBe("codex");
    // no effective seat named: the first usable one in the serve's own order
    expect(seatsOf(payload(null))!.defaultKey).toBe("gemini");
    // nothing can run: no default at all, not a guess
    const none = { engines: payload().engines.map((e) => ({ ...e, usable: false })) };
    expect(seatsOf(none)!.defaultKey).toBeNull();
  });
  it("a picker offers the seats that are on and usable - a switched-off Claude is not one", () => {
    const s = seatsOf(payload("gemini"));
    expect(offered(s)).toEqual(["gemini", "codex", "cursor"]);
    expect(offered(s)).not.toContain("claude-code");
    expect(offered(s, "claude-code")).toContain("claude-code");   // the one a pane is on stays visible
  });
  it("offers NOTHING on ignorance - no read yet, or an older serve - rather than all six seats with a switched-off Claude among them; the one in force still shows", () => {
    expect(offered(null)).toEqual([]);
    expect(offered({ seats: [], defaultKey: null })).toEqual([]);
    expect(offered(null, "codex")).toEqual(["codex"]);
    expect(offered(null, "not-a-seat")).toEqual([]);
    expect(ENGINE_KEYS).toEqual(["claude-code", "codex", "gemini", "grok", "cursor", "opencode"]);
    expect(seatsOf({ message: "Not Found", statusCode: 404 })).toBeNull();
    expect(seatsOf(null)).toBeNull();
  });
  it("names a seat by the serve's name", () => {
    expect(seatName(seatsOf(payload("gemini")), "cursor")).toBe("Cursor");
    expect(seatName(null, "cursor")).toBe("cursor");
  });
  it("nothing pinned is null (auto), and a pin for any of the six seats is kept", () => {
    localStorage.clear();
    expect(pinnedEngine()).toBeNull();
    localStorage.setItem("antiloki:chat-engine", "cli:gemini"); expect(pinnedEngine()).toBe("gemini");
    localStorage.setItem("antiloki:chat-engine", "cli:nonsense"); expect(pinnedEngine()).toBeNull();
    localStorage.clear();
  });
});
