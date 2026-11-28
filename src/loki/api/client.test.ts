import { describe, it, expect, beforeEach } from "vitest";
import {
  isNotWired,
  sameOrNext,
  unwrapResult,
  getFeSession,
} from "./client";

// FEAT-FE-UNIT-API-CLIENT-PURE-FUNCS.
// Cheap unit coverage for the small pure-ish helpers in api/client.ts.
// All assertions run in jsdom; the localStorage/sessionStorage backing
// stores are reset between cases via beforeEach.

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("isNotWired", () => {
  it("returns true for the NotWired sentinel shape", () => {
    expect(isNotWired({ __not_wired: true })).toBe(true);
  });
  it("returns false for regular objects and primitives", () => {
    expect(isNotWired(null)).toBe(false);
    expect(isNotWired(undefined)).toBe(false);
    expect(isNotWired({})).toBe(false);
    expect(isNotWired({ data: [1, 2] })).toBe(false);
    expect(isNotWired("not-wired")).toBe(false);
    expect(isNotWired(0)).toBe(false);
  });
});

describe("unwrapResult", () => {
  it("prefers .result when present, else the value itself, else null", () => {
    expect(unwrapResult({ result: { ok: true } })).toEqual({ ok: true });
    expect(unwrapResult({ ok: true })).toEqual({ ok: true });
    expect(unwrapResult(null)).toBeNull();
    expect(unwrapResult(undefined)).toBeNull();
    // historical quirk kept verbatim from the 16 module-local copies: an
    // explicitly-null .result falls through ?? back to the wrapper object.
    expect(unwrapResult({ result: null })).toEqual({ result: null });
  });
});

describe("sameOrNext", () => {
  it("returns prev when the deep-stringify comparison matches", () => {
    const prev = { a: 1, b: [2, 3] };
    const next = { a: 1, b: [2, 3] };
    expect(sameOrNext(prev, next)).toBe(prev);
  });
  it("returns next when content differs", () => {
    const prev = { a: 1 };
    const next = { a: 2 };
    expect(sameOrNext(prev, next)).toBe(next);
  });
  it("returns next on stringify failure (cycle)", () => {
    const cycle: any = { a: 1 };
    cycle.self = cycle;
    expect(sameOrNext({ a: 1 }, cycle)).toBe(cycle);
  });
});

describe("getFeSession", () => {
  it("generates a stable session id and reuses it across calls", () => {
    const first = getFeSession();
    const second = getFeSession();
    expect(first).toBeTruthy();
    expect(first).toBe(second);
  });
  it("returns a different id after sessionStorage clears", () => {
    const first = getFeSession();
    window.sessionStorage.clear();
    const second = getFeSession();
    expect(second).not.toBe(first);
  });
});

