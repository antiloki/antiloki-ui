// FEAT-FE-UNIT-API-EVENTS (quality program 2026-07-16, phase-2 tests).
// Behavioral coverage for the shared-EventSource contract in api/events.ts:
// refcount (open on first subscriber, close on last), topic-filtered fan-out,
// heartbeat vs change frames, the 50s staleness window behind
// isStreamHealthy(), and the 3s manual reconnect that only runs while
// subscribers remain. The module keeps its state at module scope, so every
// test re-imports a fresh copy via vi.resetModules().
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  url: string;
  readyState = FakeEventSource.CONNECTING;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
  // test drivers
  open() {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }
  message(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
  fail(readyState: number) {
    this.readyState = readyState;
    this.onerror?.();
  }
}

async function freshEvents() {
  vi.resetModules();
  return await import("./events");
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("subscribeToSubstrate refcount", () => {
  it("opens ONE shared EventSource for many subscribers and closes it when the last leaves", async () => {
    const { subscribeToSubstrate } = await freshEvents();
    const un1 = subscribeToSubstrate(vi.fn());
    const un2 = subscribeToSubstrate(vi.fn());
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toContain("/api/v1/events");

    un1();
    expect(FakeEventSource.instances[0].closed).toBe(false);
    un2();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });
});

describe("fan-out + topic filtering", () => {
  it("delivers topic-tagged pings only to overlapping subscribers; untagged pings reach everyone", async () => {
    const { subscribeToSubstrate } = await freshEvents();
    const all = vi.fn();
    const cards = vi.fn();
    const driver = vi.fn();
    subscribeToSubstrate(all);
    subscribeToSubstrate(cards, ["cards"]);
    subscribeToSubstrate(driver, ["driver"]);

    const es = FakeEventSource.instances[0];
    es.open(); // (re)connect kick notifies everyone once
    all.mockClear(); cards.mockClear(); driver.mockClear();

    es.message({ t: "change", ts: "t1", topics: ["cards"] });
    expect(all).toHaveBeenCalledTimes(1); // no topics declared → gets everything
    expect(cards).toHaveBeenCalledTimes(1);
    expect(driver).not.toHaveBeenCalled();

    es.message({ t: "change", ts: "t2" }); // untagged ping → broadcast
    expect(all).toHaveBeenCalledTimes(2);
    expect(cards).toHaveBeenCalledTimes(2);
    expect(driver).toHaveBeenCalledTimes(1);
  });

  it("passes the typed change through and survives a throwing listener", async () => {
    const { subscribeToSubstrate } = await freshEvents();
    const bad = vi.fn(() => { throw new Error("listener bug"); });
    const good = vi.fn();
    subscribeToSubstrate(bad);
    subscribeToSubstrate(good);

    const es = FakeEventSource.instances[0];
    es.open();
    good.mockClear();
    const change = { t: "change", ts: "t1", entities: [{ kind: "card", id: "X" }] };
    es.message(change);
    expect(good).toHaveBeenCalledWith(expect.objectContaining({ t: "change", ts: "t1" }));
  });
});

describe("isStreamHealthy staleness window", () => {
  it("healthy after traffic, stale after 50s of silence, refreshed by heartbeats without notifying", async () => {
    const { subscribeToSubstrate, isStreamHealthy } = await freshEvents();
    const listener = vi.fn();
    subscribeToSubstrate(listener);
    expect(isStreamHealthy()).toBe(false); // never connected

    const es = FakeEventSource.instances[0];
    es.open();
    expect(isStreamHealthy()).toBe(true);
    listener.mockClear();

    vi.advanceTimersByTime(40_000);
    es.message({ t: "ping" }); // heartbeat: keeps health, is NOT a substrate change
    expect(listener).not.toHaveBeenCalled();
    expect(isStreamHealthy()).toBe(true);

    vi.advanceTimersByTime(50_001); // silence past STALE_MS
    expect(isStreamHealthy()).toBe(false);
  });
});

describe("reconnect", () => {
  it("reopens 3s after a CLOSED error while subscribers remain, and kicks a reconcile notify on reopen", async () => {
    const { subscribeToSubstrate } = await freshEvents();
    const listener = vi.fn();
    subscribeToSubstrate(listener);

    const first = FakeEventSource.instances[0];
    first.open();
    listener.mockClear();

    first.fail(FakeEventSource.CLOSED);
    expect(first.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(1); // not yet — timer pending

    vi.advanceTimersByTime(3_000);
    expect(FakeEventSource.instances).toHaveLength(2);

    FakeEventSource.instances[1].open(); // was down → reconcile kick
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(undefined);
  });

  it("does NOT reconnect once the last subscriber has left", async () => {
    const { subscribeToSubstrate } = await freshEvents();
    const un = subscribeToSubstrate(vi.fn());
    const es = FakeEventSource.instances[0];
    es.open();

    es.fail(FakeEventSource.CLOSED); // arms the 3s reconnect timer
    un(); // last subscriber leaves → timer must be cancelled

    vi.advanceTimersByTime(10_000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("leaves CONNECTING errors to the browser's own retry (no manual timer, socket kept)", async () => {
    const { subscribeToSubstrate } = await freshEvents();
    subscribeToSubstrate(vi.fn());
    const es = FakeEventSource.instances[0];
    es.open();

    es.fail(FakeEventSource.CONNECTING);
    expect(es.closed).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
