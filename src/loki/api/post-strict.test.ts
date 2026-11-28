// THE STRICT POST (audit 2026-10-01): every way a write can fail must reach the caller as a thrown reason, over the REAL client (fetch stubbed).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiPostStrict, reasonOf } from "./post-strict";

const fetchMock = vi.fn();
const res = (status: number, body: unknown) => { const text = body == null ? "" : JSON.stringify(body); return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(text), text: async () => text }; };
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("apiPostStrict", () => {
  it("returns the body when the serve accepts", async () => {
    fetchMock.mockResolvedValueOnce(res(200, { ok: true, login: "x" }));
    expect(await apiPostStrict("/api/v1/a", {})).toEqual({ ok: true, login: "x" });
  });
  it("throws the serve's own sentence for a refusal, without the transport prefix", async () => {
    fetchMock.mockResolvedValueOnce(res(401, { error: { message: "GitHub says this token is not valid (401)" } }));
    const e: any = await apiPostStrict("/api/v1/a", {}).catch((x) => x);
    expect(reasonOf(e)).toBe("GitHub says this token is not valid (401)");
  });
  it("throws for a dead serve (fetch rejects) instead of returning null", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Failed to fetch"));
    await expect(apiPostStrict("/api/v1/a", {})).rejects.toThrow(/did not answer/);
  });
  it("throws for a route an older serve does not have (404 is a truthy sentinel, not null)", async () => {
    fetchMock.mockResolvedValueOnce(res(404, { statusCode: 404, message: "Not Found" }));
    await expect(apiPostStrict("/api/v1/settings/forge-tokens", {})).rejects.toThrow(/does not have \/settings\/forge-tokens yet/);
  });
  it("throws the cause of an engine error mapped to 404", async () => {
    fetchMock.mockResolvedValueOnce(res(404, { error: { code: "NOT_FOUND", cause: "no such run" } }));
    await expect(apiPostStrict("/api/v1/a", {})).rejects.toThrow("no such run");
  });
});
