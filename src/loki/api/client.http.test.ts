// FEAT-FE-UNIT-API-CLIENT-HTTP (quality program 2026-07-16, A2).
// Behavioral coverage for the transport layer every screen rides on:
// the 404 fork (route-not-wired sentinel vs a real engine error mapped to
// 404 by EngineErrorFilter), the auth-header contract (no god/CSRF headers,
// null as "BE said nothing"), header assembly, the timeout-abort → null
// collapse, and makePoll's visibility/in-flight/stop semantics.
// fetch is stubbed at the global — no network. client.test.ts covers the
// pure helpers; this file covers the HTTP paths.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiGet, apiPost, isNotWired, engineError, makePoll } from "./client";

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> };
function res(status: number, body: unknown): FakeResponse {
  const text = body == null ? "" : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text),
    text: async () => text,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the 404 fork", () => {
  it("a Nest route-miss 404 becomes the NotWired sentinel", async () => {
    fetchMock.mockResolvedValueOnce(res(404, { statusCode: 404, message: "Cannot POST /api/v1/nope", error: "Not Found" }));
    const r = await apiPost("/api/v1/nope", {});
    expect(isNotWired(r)).toBe(true);
    expect(engineError(r)).toBeNull();
  });

  it("an engine NOT_FOUND mapped to 404 surfaces as __engine_error, NOT as not-wired", async () => {
    fetchMock.mockResolvedValueOnce(res(404, { error: { code: "NOT_FOUND", cause: "card 'FEAT-X' not found", skill: "card-get" } }));
    const r = await apiGet("/api/v1/card/FEAT-X");
    expect(isNotWired(r)).toBe(false);
    expect(engineError(r)).toEqual(expect.objectContaining({ code: "NOT_FOUND", cause: "card 'FEAT-X' not found" }));
  });

  it("a non-JSON 404 body still collapses to NotWired instead of throwing", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => { throw new Error("not json"); }, text: async () => "<html>" });
    const r = await apiGet("/api/v1/gone");
    expect(isNotWired(r)).toBe(true);
  });
});

describe("auth headers", () => {
  it("401 collapses to null like any other failure", async () => {
    fetchMock.mockResolvedValueOnce(res(401, {}));
    await expect(apiPost("/api/v1/turn", {})).resolves.toBeNull();
  });

  // GOD MODE REMOVED (2026-08-13). This is the regression guard: antiloki is a local
  // single-operator app, so the browser must never hold a second credential. If a god header
  // ever comes back, this fails.
  it("no god/CSRF headers are ever sent; every call carries X-FE-Session", async () => {
    fetchMock.mockResolvedValueOnce(res(200, { ok: true }));
    await apiPost("/api/v1/driver/halt", { halt: true });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-God-Token"]).toBeUndefined();
    expect(init.headers["X-CSRF-Token"]).toBeUndefined();
    expect(init.headers["X-FE-Session"]).toBeTruthy();
    expect(init.headers["content-type"]).toBe("application/json");
  });

  it("GET sends no content-type header (no body)", async () => {
    fetchMock.mockResolvedValueOnce(res(200, {}));
    await apiGet("/api/v1/board");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["content-type"]).toBeUndefined();
    expect(init.headers["X-FE-Session"]).toBeTruthy();
  });
});

describe("failure collapse + success parsing", () => {
  it("HTTP 500 → null (never throws into the React tree)", async () => {
    fetchMock.mockResolvedValueOnce(res(500, { message: "boom" }));
    await expect(apiPost("/api/v1/turn", {})).resolves.toBeNull();
  });

  it("network rejection → null", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(apiGet("/api/v1/board")).resolves.toBeNull();
  });

  it("2xx parses JSON; an empty body is null, not a parse error", async () => {
    fetchMock.mockResolvedValueOnce(res(200, { turn_id: 7 }));
    await expect(apiPost("/api/v1/turn", { user_text: "hi" })).resolves.toEqual({ turn_id: 7 });

    fetchMock.mockResolvedValueOnce(res(204, null));
    await expect(apiPost("/api/v1/notifications/1/dismiss", {})).resolves.toBeNull();
  });

  it("the timeout aborts the request and collapses to null (default 30s — the serve serializes dispatches)", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      }));
    const pending = apiGet("/api/v1/slow");
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(pending).resolves.toBeNull();
  });
});

describe("makePoll", () => {
  beforeEach(() => vi.useFakeTimers());

  it("fires immediately, then on the interval; stop() ends it", async () => {
    const fn = vi.fn(async () => {});
    const stop = makePoll(fn, 1_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(fn).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("skips the fetch while the tab is hidden and resumes on visibilitychange", async () => {
    const fn = vi.fn(async () => {});
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    const stop = makePoll(fn, 1_000);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fn).not.toHaveBeenCalled(); // hidden: timer re-arms, no requests

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    stop();
  });

  it("never overlaps a slow poll (in-flight guard re-arms without calling)", async () => {
    let release!: () => void;
    const fn = vi.fn(() => new Promise<void>((r) => { release = r; }));
    const stop = makePoll(fn, 1_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3_500); // several intervals while still in flight
    expect(fn).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fn).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe("a refusal the caller asked to be told about (2026-09-28)", () => {
  it("still collapses to null by default, and throws with the server's reason when asked", async () => {
    const g: any = globalThis;
    g.fetch = async () => new Response(JSON.stringify({ error: { message: "delegation is off for this pane" } }),
      { status: 400, headers: { "content-type": "application/json" } });
    // the hundred read paths are unchanged
    expect(await apiPost("/api/v1/x", {})).toBeNull();
    // …and the one that needs the reason gets it
    await expect(apiPost("/api/v1/x", {}, { throwOnError: true } as any))
      .rejects.toThrow(/delegation is off for this pane/);
  });
});
