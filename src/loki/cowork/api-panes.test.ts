// A TERMINAL PANE IS A REAL BOX, NOT THE CHAT SANDBOX (operator 2026-11-10: "claude only knew the name of the workspace ... should be as resourceful as herdr").
// `chat/create` makes an empty read-only box for the conversational chat; a terminal pane gets its own git worktree of the project.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiPost = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: vi.fn(), apiPost: (...a: any[]) => apiPost(...(a as [])), BE_URL: "http://x" }));
import { createEnginePane, ensureSession } from "./api";

beforeEach(() => { apiPost.mockReset(); });

describe("opening an engine's terminal", () => {
  it("opens the agent in the open thread (the serve provisions its box from the thread's branch), and never the chat door", async () => {
    apiPost.mockImplementation(async (url: string) => {
      if (url.endsWith("/session/get")) return { sessions: [{ id: 1, name: "chats", status: "active" }, { id: 7, name: "Cowork", status: "active" }] };
      if (url.endsWith("/agent/new")) return { ok: true, pane_id: 42 };
      return {};
    });
    expect(await createEnginePane("claude-code", "Claude Code")).toEqual({ paneId: 42, sessionId: 7 });
    expect(apiPost.mock.calls.find((c) => String(c[0]).endsWith("/agent/new"))![1]).toMatchObject({ session_id: 7, engine: "claude-code", title: "Claude Code", thread: "main" });
    expect(await createEnginePane("codex", "Codex", "fix-checkout")).toEqual({ paneId: 42, sessionId: 7 }); expect(apiPost.mock.calls.filter((c) => String(c[0]).endsWith("/agent/new")).pop()![1]).toMatchObject({ engine: "codex", thread: "fix-checkout" });
    expect(apiPost.mock.calls.some((c) => String(c[0]).includes("chat/create"))).toBe(false);
  });
  it("makes the Cowork session when there is none, and reuses it after", async () => {
    apiPost.mockImplementation(async (url: string) => {
      if (url.endsWith("/session/get")) return { sessions: [{ id: 1, name: "chats", status: "active" }, { id: 3, name: "Cowork", status: "closed" }] };
      if (url.endsWith("/session/create")) return { ok: true, session: { id: 9 } };
      return {};
    });
    expect(await ensureSession()).toBe(9);
    expect(apiPost.mock.calls.find((c) => String(c[0]).endsWith("/session/create"))![1]).toMatchObject({ name: "Cowork" });
  });
  it("a refusal or an unreachable serve is null, not a throw", async () => {
    apiPost.mockRejectedValue(new Error("down"));
    expect(await createEnginePane("codex", "Codex")).toBeNull();
    apiPost.mockReset().mockImplementation(async (url: string) => (url.endsWith("/session/get") ? { sessions: [{ id: 7, name: "Cowork", status: "active" }] } : { ok: false, error: "provision failed" }));
    expect(await createEnginePane("codex", "Codex")).toBeNull();
  });
});
