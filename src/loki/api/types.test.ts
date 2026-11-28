// isRecentlyFailing is the shared predicate behind the Board's "thrashing" badge. It parses
// timestamps the BE writes in two shapes (SQLite "YYYY-MM-DD HH:MM:SS" in UTC, and ISO), and the
// SQLite one has no timezone marker — reading it as local time shifts the window by hours and the
// badge either never lights up or never goes out.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isRecentlyFailing, NOT_WIRED } from "./types";

const NOW = Date.parse("2026-05-20T12:00:00Z");
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();
const sqliteAgo = (mins: number) => ago(mins).replace("T", " ").replace(/\.\d+Z$/, "");

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

describe("isRecentlyFailing", () => {
  it("is false with no recorded failure", () => {
    expect(isRecentlyFailing({ status: "doing" })).toBe(false);
    expect(isRecentlyFailing({ status: "doing", last_failure_at: null })).toBe(false);
    expect(isRecentlyFailing({ status: "doing", last_failure_at: "" })).toBe(false);
  });

  it("is true inside the 30-minute window", () => {
    expect(isRecentlyFailing({ status: "doing", last_failure_at: ago(1) })).toBe(true);
    expect(isRecentlyFailing({ status: "doing", last_failure_at: ago(29) })).toBe(true);
  });

  it("goes quiet once the failure is older than the window", () => {
    expect(isRecentlyFailing({ status: "doing", last_failure_at: ago(31) })).toBe(false);
    expect(isRecentlyFailing({ status: "doing", last_failure_at: ago(60 * 24) })).toBe(false);
  });

  it("reads a SQLite timestamp as UTC, not local — the badge must not shift with the operator's clock", () => {
    // No 'T' and no zone: "2026-05-20 11:59:00" is UTC. Parsed as local it would be hours off.
    expect(isRecentlyFailing({ status: "doing", last_failure_at: sqliteAgo(5) })).toBe(true);
    expect(isRecentlyFailing({ status: "doing", last_failure_at: sqliteAgo(45) })).toBe(false);
  });

  it("yields to the blocked badge — a blocked card already says why it is stuck", () => {
    expect(isRecentlyFailing({ status: "blocked", last_failure_at: ago(1) })).toBe(false);
  });

  it("stays false for an unparseable timestamp instead of flashing the badge", () => {
    expect(isRecentlyFailing({ status: "doing", last_failure_at: "not a date" })).toBe(false);
  });

  it("treats a future timestamp as failing (the window is one-sided)", () => {
    // Documented, not endorsed: only the upper bound is checked, so a clock-skewed BE stamping the
    // future keeps the badge lit. Harmless today because the BE stamps its own now(); if that ever
    // changes, this test is where the decision to bound the other side gets made.
    expect(isRecentlyFailing({ status: "doing", last_failure_at: ago(-120) })).toBe(true);
  });
});

describe("NOT_WIRED", () => {
  it("is a unique symbol — comparable only to itself", () => {
    expect(typeof NOT_WIRED).toBe("symbol");
    expect(NOT_WIRED).not.toBe(Symbol("not_wired"));
  });
});
