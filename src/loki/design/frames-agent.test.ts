// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { bodyOfDocument, FRAMES_SHOW_EVENT, mockupLine, parseMockups, peekPendingMockup, showMockup, takePendingMockup } from "./frames-agent";

describe("mockups made by agents", () => {
  it("reads the serve's list defensively and says in a line who made each and how it stands", () => {
    const l = parseMockups({ frames: [{ id: "m1", name: "Settings", ask: "a settings screen", status: "done", author: { engine: "claude-code", model: "sonnet" }, created_ms: 5 }, { id: "m2", name: "Pricing", status: "working", author: {} }, { id: "m3", name: "X", status: "failed", error: "no seat" }, { nope: 1 }, "x"] });
    expect(l.map((m) => m.id)).toEqual(["m1", "m2", "m3"]); expect(mockupLine(l[0])).toBe("by claude-code · sonnet"); expect(mockupLine(l[1])).toBe("being made…"); expect(mockupLine(l[2])).toBe("could not be made"); expect(l[2].error).toBe("no seat");
    expect(parseMockups(null)).toEqual([]);
  });
  it("turns a whole document into what a frame holds: its style blocks, then its body", () => {
    const b = bodyOfDocument("<!doctype html><html><head><style>h1{color:red}</style></head><body><h1>Hi</h1><style>p{margin:0}</style><p>x</p></body></html>");
    expect(b).toContain("h1{color:red}"); expect(b).toContain("p{margin:0}"); expect(b).toContain("<h1>Hi</h1>"); expect(b.indexOf("<style>")).toBeLessThan(b.indexOf("<h1>")); expect(b).not.toContain("<html");
  });
  it("remembers the mockup the screen was asked to show until a Frames pane takes it, and announces it to one that is open (a peek never takes it)", () => {
    const seen: string[] = []; const h = (e: Event) => seen.push((e as CustomEvent).detail.id); window.addEventListener(FRAMES_SHOW_EVENT, h);
    expect(peekPendingMockup()).toBeNull(); showMockup("m1"); expect(seen).toEqual(["m1"]); expect(peekPendingMockup()).toBe("m1"); expect(peekPendingMockup()).toBe("m1"); expect(takePendingMockup("other")).toBe("m1"); expect(peekPendingMockup()).toBe("m1");   // another id does not clear it; a pane that mounts twice finds it both times
    takePendingMockup("m1"); expect(peekPendingMockup()).toBeNull();
    window.removeEventListener(FRAMES_SHOW_EVENT, h);
  });
});
