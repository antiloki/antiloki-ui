import { describe, it, expect } from "vitest";
import { isNarrow, oneAtATime } from "./use-narrow";

describe("the phone's view of Cowork", () => {
  it("is narrow under 720 px and never for a missing width", () => { expect(isNarrow(390)).toBe(true); expect(isNarrow(719)).toBe(true); expect(isNarrow(720)).toBe(false); expect(isNarrow(1440)).toBe(false); expect(isNarrow(0)).toBe(false); });
  it("fills the screen with the focused pane, else the first, keeps a chosen zoom and an empty layout, and leaves the layout it was given alone", () => {
    const l = { root: { type: "leaf" }, focus: "b", zoom: null as string | null };
    expect(oneAtATime(l, "a").zoom).toBe("b"); expect(oneAtATime({ ...l, focus: null }, "a").zoom).toBe("a"); expect(oneAtATime({ ...l, zoom: "c" }, "a").zoom).toBe("c"); expect(oneAtATime({ root: null, focus: null, zoom: null }, "a").zoom).toBeNull(); expect(l.zoom).toBeNull();
  });
});
