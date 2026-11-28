// This module exists because a broken browser was invisible to a substrate that audits everything
// else. Its whole value is that it NEVER makes things worse: it must not throw, must not recurse
// when the report itself fails, and must not flood the BE. Those three are what the tests pin.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./client", () => ({ BE_URL: "http://be.test", getFeSession: () => "sess-1" }));

const fetchMock = vi.fn();

// The dedup set and the throttle counter are module state, so each scenario needs a fresh module.
async function fresh() {
  vi.resetModules();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  return await import("./error-report");
}

const bodies = () => fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("the report itself", () => {
  it("POSTs to the BE with the session header and the full context", async () => {
    const { reportFeError } = await fresh();
    reportFeError("window.onerror", "boom", "at x.ts:1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://be.test/api/v1/fe-errors");
    expect(init.method).toBe("POST");
    expect(init.headers["X-FE-Session"]).toBe("sess-1");
    expect(JSON.parse(init.body)).toMatchObject({ kind: "window.onerror", message: "boom", stack: "at x.ts:1" });
    expect(JSON.parse(init.body).url).toContain("http");
  });

  it("sends an empty stack rather than the string 'undefined'", async () => {
    const { reportFeError } = await fresh();
    reportFeError("k", "m");
    expect(bodies()[0].stack).toBe("");
  });

  it("truncates message and stack so one huge error cannot blow the payload", async () => {
    const { reportFeError } = await fresh();
    reportFeError("k", "m".repeat(5000), "s".repeat(5000));
    expect(bodies()[0].message).toHaveLength(500);
    expect(bodies()[0].stack).toHaveLength(2000);
  });
});

describe("never make things worse", () => {
  it("swallows a rejected fetch instead of causing a second unhandled rejection", async () => {
    const { reportFeError } = await fresh();
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(() => reportFeError("k", "m")).not.toThrow();
    await vi.runAllTimersAsync();
  });

  it("swallows a fetch that throws synchronously", async () => {
    const { reportFeError } = await fresh();
    fetchMock.mockImplementation(() => { throw new Error("blocked by extension"); });
    expect(() => reportFeError("k", "m")).not.toThrow();
  });
});

describe("dedup", () => {
  it("reports a given kind+message ONCE, however often it repeats", async () => {
    // A render loop can throw the same error thousands of times per second.
    const { reportFeError } = await fresh();
    for (let i = 0; i < 50; i++) reportFeError("window.onerror", "same boom");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a different message, or the same message under a different kind, as new", async () => {
    const { reportFeError } = await fresh();
    reportFeError("window.onerror", "a");
    reportFeError("window.onerror", "b");
    reportFeError("unhandledrejection", "a");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("dedups on the first 200 chars, so near-identical giant errors collapse", async () => {
    const { reportFeError } = await fresh();
    reportFeError("k", "x".repeat(300) + "TAIL-A");
    reportFeError("k", "x".repeat(300) + "TAIL-B");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("throttle", () => {
  it("stops after 10 distinct errors in a minute", async () => {
    const { reportFeError } = await fresh();
    for (let i = 0; i < 25; i++) reportFeError("k", `distinct ${i}`);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("reopens the window after 60 seconds", async () => {
    const { reportFeError } = await fresh();
    for (let i = 0; i < 25; i++) reportFeError("k", `first ${i}`);
    expect(fetchMock).toHaveBeenCalledTimes(10);

    vi.advanceTimersByTime(60_001);
    reportFeError("k", "after the window");
    expect(fetchMock).toHaveBeenCalledTimes(11);
  });
});

describe("installGlobalErrorReporting", () => {
  it("reports an uncaught error with its stack", async () => {
    const { installGlobalErrorReporting } = await fresh();
    installGlobalErrorReporting();
    const err = new Error("render crash");
    window.dispatchEvent(new ErrorEvent("error", { message: "render crash", error: err }));
    expect(bodies()[0]).toMatchObject({ kind: "window.onerror", message: "render crash" });
    expect(bodies()[0].stack).toContain("render crash");
  });

  it("reports an unhandled promise rejection", async () => {
    const { installGlobalErrorReporting } = await fresh();
    installGlobalErrorReporting();
    const e: any = new Event("unhandledrejection");
    e.reason = new Error("await blew up");
    window.dispatchEvent(e);
    expect(bodies()[0]).toMatchObject({ kind: "unhandledrejection", message: "await blew up" });
  });

  it("stringifies a non-Error rejection reason rather than sending 'undefined'", async () => {
    const { installGlobalErrorReporting } = await fresh();
    installGlobalErrorReporting();
    const e: any = new Event("unhandledrejection");
    e.reason = "a bare string";
    window.dispatchEvent(e);
    expect(bodies()[0].message).toBe("a bare string");
  });

  it("labels a rejection with no reason as 'unknown', never the string 'undefined'", async () => {
    const { installGlobalErrorReporting } = await fresh();
    installGlobalErrorReporting();
    window.dispatchEvent(new Event("unhandledrejection"));
    expect(bodies()[0].message).toBe("unknown");
  });
});
