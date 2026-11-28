// The dock store persists the everywhere-chat's layout. The interesting rule is what it REFUSES to
// persist: a live submit handler or the current chat mode written to localStorage would be restored
// on the next reload as a stale lie — a dead function, or a mode the screen isn't on.
import { describe, it, expect, beforeEach, vi } from "vitest";

const KEY = "antiloki:dock";

// The module snapshots localStorage at import time, so each scenario needs a fresh module instance.
async function freshStore(seed?: string) {
  localStorage.clear();
  if (seed !== undefined) localStorage.setItem(KEY, seed);
  vi.resetModules();
  return await import("./dock-store");
}

beforeEach(() => localStorage.clear());

describe("load", () => {
  it("starts floating (no side) with sensible defaults", async () => {
    const { dockStore } = await freshStore();
    expect(dockStore.get()).toEqual({
      side: null, size: 420, collapsed: false, full: false, chatMode: "agent", surface: null,
    });
  });

  it("restores a persisted layout", async () => {
    const { dockStore } = await freshStore(JSON.stringify({ side: "right", size: 640, collapsed: true, full: false }));
    expect(dockStore.get().side).toBe("right");
    expect(dockStore.get().size).toBe(640);
    expect(dockStore.get().collapsed).toBe(true);
  });

  it("FORCES chatMode back to 'agent' and surface to null even if they were persisted", async () => {
    // A restored surface would be a dead function; a restored mode would claim a screen we're not on.
    const { dockStore } = await freshStore(
      JSON.stringify({ side: "left", chatMode: "vibe", surface: { placeholder: "stale" } }),
    );
    expect(dockStore.get().chatMode).toBe("agent");
    expect(dockStore.get().surface).toBeNull();
  });

  it("falls back to defaults on corrupt JSON instead of throwing at import", async () => {
    const { dockStore } = await freshStore("{not json");
    expect(dockStore.get().side).toBeNull();
    expect(dockStore.get().size).toBe(420);
  });
});

describe("set", () => {
  it("merges a patch rather than replacing the state", async () => {
    const { dockStore } = await freshStore();
    dockStore.set({ side: "bottom" });
    expect(dockStore.get()).toMatchObject({ side: "bottom", size: 420, chatMode: "agent" });
  });

  it("persists ONLY the four layout fields", async () => {
    const { dockStore } = await freshStore();
    dockStore.set({ side: "top", size: 300, collapsed: true, full: true, chatMode: "vibe", surface: { placeholder: "p", submit: () => {} } });
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(Object.keys(saved).sort()).toEqual(["collapsed", "full", "side", "size"]);
    expect(saved).toEqual({ side: "top", size: 300, collapsed: true, full: true });
  });

  it("keeps a live surface in memory even though it is never written to disk", async () => {
    const { dockStore } = await freshStore();
    const submit = vi.fn();
    dockStore.set({ surface: { placeholder: "ask", submit } });
    dockStore.get().surface!.submit("hi");
    expect(submit).toHaveBeenCalledWith("hi");
  });

  it("survives a localStorage that throws (private mode / quota) without losing the in-memory state", async () => {
    const { dockStore } = await freshStore();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => dockStore.set({ side: "left" })).not.toThrow();
    expect(dockStore.get().side).toBe("left");
    spy.mockRestore();
  });
});

describe("subscribe", () => {
  it("notifies every subscriber on each set", async () => {
    const { dockStore } = await freshStore();
    const a = vi.fn(), b = vi.fn();
    dockStore.subscribe(a);
    dockStore.subscribe(b);
    dockStore.set({ size: 500 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("the returned disposer actually unsubscribes", async () => {
    const { dockStore } = await freshStore();
    const f = vi.fn();
    dockStore.subscribe(f)();
    dockStore.set({ size: 500 });
    expect(f).not.toHaveBeenCalled();
  });

  it("get() returns a NEW object identity after a set, so useSyncExternalStore re-renders", async () => {
    const { dockStore } = await freshStore();
    const before = dockStore.get();
    dockStore.set({ size: 501 });
    expect(dockStore.get()).not.toBe(before);
  });
});

describe("the cross-mount handoff", () => {
  it("a message typed on the floating field is parked and can be cleared once consumed", async () => {
    const mod = await freshStore();
    expect(mod.dockPending).toBeNull();
    mod.setDockPending("explain the audit chain");
    expect(mod.dockPending).toBe("explain the audit chain");
    mod.setDockPending(null);
    expect(mod.dockPending).toBeNull();
  });

  it("the transcript is module-level so a side switch does not lose it", async () => {
    const { dockMsgs } = await freshStore();
    dockMsgs.push({ role: "you", md: "hi" });
    expect(dockMsgs).toHaveLength(1);
    dockMsgs.length = 0;
  });
});
