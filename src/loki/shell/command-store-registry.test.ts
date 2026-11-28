// Small module, one subtle rule: the disposer clears the section ONLY if the title still matches.
// React unmounts the outgoing screen AFTER the incoming one mounts, so a disposer that cleared
// unconditionally would wipe the new screen's freshly-registered section and leave ⌘K's HERE empty.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerHere, getHere, subscribeHere } from "./command-store-registry";

const item = (label: string) => ({ icon: "▸", label, run: () => {} });

beforeEach(() => { registerHere("reset", [])(); });

describe("registerHere", () => {
  it("publishes the section and replaces any previous one", () => {
    registerHere("Atlas", [item("graph")]);
    expect(getHere()).toEqual({ title: "Atlas", items: [{ icon: "▸", label: "graph", run: expect.any(Function) }] });

    registerHere("Kanban", [item("board")]);
    expect(getHere()!.title).toBe("Kanban");
    expect(getHere()!.items).toHaveLength(1);
  });

  it("starts empty", () => {
    expect(getHere()).toBeNull();
  });
});

describe("the disposer", () => {
  it("clears the section it registered", () => {
    const off = registerHere("Atlas", [item("graph")]);
    off();
    expect(getHere()).toBeNull();
  });

  it("does NOT clear a section registered by a LATER screen", () => {
    // The real sequence during navigation: new screen mounts (registers), old screen unmounts
    // (disposes). An unconditional clear here empties ⌘K's HERE on every navigation.
    const offAtlas = registerHere("Atlas", [item("graph")]);
    registerHere("Kanban", [item("board")]);
    offAtlas();
    expect(getHere()!.title).toBe("Kanban");
  });

  it("is idempotent — calling it twice does not clear a newer section", () => {
    const off = registerHere("Atlas", []);
    off();
    registerHere("Kanban", []);
    off();
    expect(getHere()!.title).toBe("Kanban");
  });
});

describe("subscribeHere", () => {
  it("fires on register and on dispose", () => {
    const f = vi.fn();
    subscribeHere(f);
    const off = registerHere("Atlas", []);
    expect(f).toHaveBeenCalledTimes(1);
    off();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does NOT fire when a stale disposer is a no-op", () => {
    // A spurious notification would re-render ⌘K for nothing.
    const offAtlas = registerHere("Atlas", []);
    registerHere("Kanban", []);
    const f = vi.fn();
    subscribeHere(f);
    offAtlas();
    expect(f).not.toHaveBeenCalled();
  });

  it("notifies every subscriber, and unsubscribing stops it", () => {
    const a = vi.fn(), b = vi.fn();
    subscribeHere(a);
    const offB = subscribeHere(b);
    offB();
    registerHere("Atlas", []);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });
});

describe("the items themselves", () => {
  it("carries run() through untouched so ⌘K can invoke it", () => {
    const run = vi.fn();
    registerHere("Atlas", [{ icon: "▸", label: "graph", hint: "the import map", tint: "#f00", run }]);
    const it0 = getHere()!.items[0];
    it0.run();
    expect(run).toHaveBeenCalled();
    expect(it0.hint).toBe("the import map");
    expect(it0.tint).toBe("#f00");
  });
});
