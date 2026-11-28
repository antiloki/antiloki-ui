import { describe, it, expect } from "vitest";
import { reconnectingSource, type RawSource } from "./reconnect-source";

class Fake implements RawSource {
  static all: Fake[] = [];
  readyState = 0; onopen: null | (() => void) = null; onerror: null | (() => void) = null; onmessage: null | ((ev: { data?: unknown }) => void) = null; closed = false;
  private named = new Map<string, (ev: { data?: unknown }) => void>();
  constructor() { Fake.all.push(this); }
  addEventListener(n: string, f: (ev: { data?: unknown }) => void) { this.named.set(n, f); }
  close() { this.closed = true; this.readyState = 2; }
  emit(n: string, data: string) { this.named.get(n)?.({ data }); }
}
const setup = () => {
  Fake.all = []; const seen: string[] = []; const states: string[] = []; const timers: { f: () => void; ms: number; id: number }[] = []; let id = 0;
  const src = reconnectingSource(() => new Fake(), (t, d) => seen.push(`${t}:${d}`), (s, rs) => states.push(`${s}${rs}`), ["hello"], (f, ms) => { timers.push({ f, ms, id: ++id }); return id; }, (t) => { const i = timers.findIndex((x) => x.id === t); if (i >= 0) timers.splice(i, 1); });
  return { src, seen, states, timers };
};

describe("a stream that comes back", () => {
  it("opens a fresh source after the browser gives up (CLOSED), with a growing pause, and the new one carries the events", () => {
    const { seen, timers } = setup();
    const first = Fake.all[0]; first.readyState = 2; first.onerror!();
    expect(timers).toHaveLength(1); expect(timers[0].ms).toBe(500);
    timers.shift()!.f();
    expect(Fake.all).toHaveLength(2);
    const second = Fake.all[1]; second.readyState = 2; second.onerror!();
    expect(timers[0].ms).toBe(1000);                                   // the pause doubles...
    timers.shift()!.f(); Fake.all[2].emit("hello", "x"); expect(seen).toContain("hello:x");
  });
  it("leaves a source the browser is retrying by itself alone, and resets the pause once it opens", () => {
    const { timers } = setup();
    const a = Fake.all[0]; a.readyState = 0; a.onerror!();
    expect(timers).toHaveLength(0);                                    // CONNECTING: the browser is on it
    a.readyState = 2; a.onerror!(); timers.shift()!.f();
    Fake.all[1].readyState = 1; Fake.all[1].onopen!();
    Fake.all[1].readyState = 2; Fake.all[1].onerror!();
    expect(timers[0].ms).toBe(500);                                    // an open connection resets the backoff
  });
  it("stops for good when closed: no timer survives and no new source is opened", () => {
    const { src, timers } = setup();
    Fake.all[0].readyState = 2; Fake.all[0].onerror!();
    expect(timers).toHaveLength(1);
    src.close();
    expect(timers).toHaveLength(0); expect(Fake.all[0].closed).toBe(true);
  });
  it("never waits longer than five seconds", () => {
    const { timers } = setup();
    for (let i = 0; i < 8; i++) { const cur = Fake.all[Fake.all.length - 1]; cur.readyState = 2; cur.onerror!(); timers.shift()!.f(); }
    const cur = Fake.all[Fake.all.length - 1]; cur.readyState = 2; cur.onerror!();
    expect(timers[0].ms).toBe(5000);
  });
});
