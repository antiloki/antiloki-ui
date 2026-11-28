import { describe, it, expect } from "vitest";
import { levelOf, vadStart, vadStep, barsFrom, pickMime, micError, MAX_MS, SPEECH_LEVEL } from "./voice";

describe("the microphone's rules", () => {
  it("measures loudness: silence is 0, a loud block near 1, an empty block 0", () => {
    expect(levelOf(new Uint8Array(512).fill(128))).toBe(0); expect(levelOf([])).toBe(0);
    expect(levelOf(Uint8Array.from({ length: 512 }, (_, i) => (i % 2 ? 250 : 6)))).toBe(1);
    const talk = levelOf(Uint8Array.from({ length: 512 }, (_, i) => 128 + Math.round(Math.sin(i / 3) * 20))); expect(talk).toBeGreaterThan(SPEECH_LEVEL); expect(talk).toBeLessThan(1);
  });
  it("never stops by itself for a pause or for silence: only at the ceiling, and it notes whether anything was heard", () => {
    let v = vadStart(0); const at = (l: number, t: number) => { const r = vadStep(v, l, t); v = r.vad; return r.stop; };
    expect(at(0, 1000)).toBeNull(); expect(v.heardAt).toBeNull(); expect(at(0.4, 2000)).toBeNull(); expect(v.heardAt).toBe(2000);
    expect(at(0, 20_000)).toBeNull(); expect(at(0, 120_000)).toBeNull(); expect(at(0, 5 * 60_000)).toBeNull();   // long pauses, minutes of silence: it keeps recording
    expect(at(0.4, 9_000)).toBeNull(); expect(v.heardAt).toBe(2000); expect(at(0, MAX_MS - 1)).toBeNull(); expect(at(0, MAX_MS)).toBe("max");
    expect(SPEECH_LEVEL).toBeGreaterThan(0);
  });
  it("draws the last levels as bars, oldest at the left, padded, never under a dot's height", () => {
    expect(barsFrom([0.5, 1], 4)).toEqual([0.06, 0.06, 0.5, 1]); expect(barsFrom([0.2, 0.3, 0.4, 0.5, 0.6], 3)).toEqual([0.4, 0.5, 0.6]); expect(barsFrom([2, -1], 2)).toEqual([1, 0.06]); expect(barsFrom([], 3)).toEqual([0.06, 0.06, 0.06]);
  });
  it("picks the best recording format the browser has, and says why the microphone failed", () => {
    expect(pickMime((m) => m === "audio/webm")).toBe("audio/webm"); expect(pickMime((m) => m === "audio/mp4")).toBe("audio/mp4"); expect(pickMime(() => false)).toBeNull(); expect(pickMime(() => true)).toBe("audio/webm;codecs=opus");
    expect(micError({ name: "NotAllowedError" }, true)).toContain("blocked"); expect(micError({ name: "NotFoundError" }, true)).toContain("no microphone"); expect(micError({ name: "NotReadableError" }, true)).toContain("in use"); expect(micError({ message: "x" }, true)).toContain("x"); expect(micError(null, false)).toContain("https");
  });
});
