import { describe, it, expect, vi, beforeEach } from "vitest";
const get = vi.fn(); const post = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => get(...a), apiPost: (...a: any[]) => post(...a), BE_URL: "http://x", isNotWired: (v: any) => !!(v && typeof v === "object" && v.__not_wired === true) }));
import { openSideQuestion, voiceStatus, transcribe, OUT_OF_DATE } from "./api";

describe("a serve older than the screen says so instead of failing silently", () => {
  beforeEach(() => { get.mockReset(); post.mockReset(); vi.unstubAllGlobals(); });
  it("says it for a side question, the microphone's status and a transcription", async () => {
    post.mockResolvedValue({ __not_wired: true }); const r = await openSideQuestion(7); expect(r).toEqual({ ok: false, error: OUT_OF_DATE("side questions") }); expect(OUT_OF_DATE("x")).toContain("Restart");
    get.mockResolvedValue({ __not_wired: true }); expect(await voiceStatus()).toEqual({ available: false, engine: null, hint: OUT_OF_DATE("the microphone") });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 }))); expect(await transcribe(new Blob(["a"]))).toEqual({ ok: false, error: OUT_OF_DATE("the microphone") });
  });
  it("still says what the serve said when it answers, and that it did not answer when it did not", async () => {
    post.mockResolvedValue({ ok: false, error: "that agent has no box here yet" }); expect(await openSideQuestion(7)).toEqual({ ok: false, error: "that agent has no box here yet" });
    post.mockResolvedValue(null); expect(await openSideQuestion(7)).toEqual({ ok: false, error: "the serve did not answer" });
    post.mockResolvedValue({ ok: true, pane_id: 9, session_id: 2, title: "Side · x", engine: "claude-code" }); expect(await openSideQuestion(7)).toMatchObject({ ok: true, paneId: 9 });
  });
});
