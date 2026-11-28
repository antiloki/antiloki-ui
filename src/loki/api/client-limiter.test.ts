import { describe, it, expect } from "vitest";
import { createLimiter, isUrgent } from "./client";

describe("typing never waits behind the pollers", () => {
  it("lets three background asks through at once and the rest in order, and frees a slot when one ends", async () => {
    const limited = createLimiter(3); let running = 0, peak = 0; const order: number[] = []; const gates: (() => void)[] = [];
    const job = (n: number) => limited(async () => { running++; peak = Math.max(peak, running); order.push(n); await new Promise<void>((r) => gates.push(r)); running--; });
    const all = [1, 2, 3, 4, 5].map(job); await Promise.resolve(); await new Promise((r) => setTimeout(r, 5));
    expect(running).toBe(3); expect(order).toEqual([1, 2, 3]); gates.shift()!(); await new Promise((r) => setTimeout(r, 5)); expect(order).toEqual([1, 2, 3, 4]); expect(peak).toBe(3);
    while (gates.length) { gates.shift()!(); await new Promise((r) => setTimeout(r, 2)); } await Promise.all(all); expect(order).toEqual([1, 2, 3, 4, 5]);
  });
  it("knows what the person is doing: keys, sends, stops, and anything meant to run long go around the queue", () => {
    expect(isUrgent("/api/v1/cockpit/pty/input", 8000)).toBe(true); expect(isUrgent("/api/v1/cockpit/pty/send", 30000)).toBe(true); expect(isUrgent("/api/v1/cockpit/agent/stop", 30000)).toBe(true);
    expect(isUrgent("/api/v1/cockpit/team-graph", 120_000)).toBe(true); expect(isUrgent("/api/v1/cockpit/team-graph", 30_000)).toBe(false); expect(isUrgent("/api/v1/sagas", 30_000)).toBe(false); expect(isUrgent("/api/v1/license/status", 30_000)).toBe(false);
  });
});
