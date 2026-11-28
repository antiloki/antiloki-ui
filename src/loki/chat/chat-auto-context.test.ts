// @vitest-environment jsdom
// ANTICHAT'S AUTOMATIC CONTEXT (2026-09-21): the picks are kept per turn for the chips; pins always ride, drops never.
import { describe, it, expect } from "vitest";
import { readUsed, noteUsed, readContextPrefs, setContextPref, writeContextPrefs } from "./auto-context";

describe("antiChat's automatic context — the chips' storage", () => {
  it("keeps the picks by turn per session and the pins/drops per session", () => {
    localStorage.clear();
    expect(readUsed(7)).toEqual({});
    noteUsed(7, 12, [{ kind: "agent", label: "the chat of the agent cart totals", ref: "agent:4", why: "2 matches", chars: 900 }]);
    expect(readUsed(7)["12"][0].ref).toBe("agent:4"); expect(readUsed(8)).toEqual({});
    let p = readContextPrefs(7); expect(p).toEqual({ pins: [], drops: [] });
    p = setContextPref(p, "agent:4", "pin"); expect(p).toEqual({ pins: ["agent:4"], drops: [] });
    p = setContextPref(p, "agent:4", "drop"); expect(p).toEqual({ pins: [], drops: ["agent:4"] }); // a drop unpins
    p = setContextPref(p, "intel", "pin"); p = setContextPref(p, "agent:4", "off"); expect(p).toEqual({ pins: ["intel"], drops: [] });
    writeContextPrefs(7, p); expect(readContextPrefs(7)).toEqual(p); expect(readContextPrefs(null)).toEqual({ pins: [], drops: [] });
  });
});
