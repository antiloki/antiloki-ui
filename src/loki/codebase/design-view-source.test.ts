// Grokbot QA 2026-10-12, item 26: a component's source must load for a project that is not a git repo.
import { describe, it, expect, vi, beforeEach } from "vitest";

const fileRead = vi.fn();
const apiPost = vi.fn();
vi.mock("@/loki/api/codebase", () => ({ fileRead: (a: any) => fileRead(a) }));
vi.mock("@/loki/api/client", () => ({ apiPost: (...a: any[]) => apiPost(...a), isNotWired: () => false, unwrapResult: (r: any) => r?.result ?? r }));
vi.mock("@/loki/design/frames", () => ({ DesignFrames: () => null }));
vi.mock("./design-system-showcase", () => ({ DesignSystemShowcase: () => null }));
vi.mock("./highlight", () => ({ Highlighted: () => null }));
vi.mock("@/loki/api/engine", () => ({ askEngine: vi.fn() }));

import { loadSource } from "./design-view";

beforeEach(() => { fileRead.mockReset(); apiPost.mockReset(); });
describe("a component's source", () => {
  it("is read from the workspace first, so a non-git project works", async () => {
    fileRead.mockResolvedValue({ path: "client/src/App.tsx", content: "export const A = 1;" });
    expect(await loadSource("client/src/App.tsx")).toEqual({ code: "export const A = 1;" });
    expect(apiPost).not.toHaveBeenCalled();
  });
  it("falls back to the git reader when the workspace reader has nothing", async () => {
    fileRead.mockResolvedValue(null);
    apiPost.mockResolvedValue({ result: { content: "from git" } });
    expect(await loadSource("a.tsx")).toEqual({ code: "from git" });
  });
  it("says why when neither can read it", async () => {
    fileRead.mockRejectedValue(new Error("down"));
    apiPost.mockResolvedValue({ result: { error: "tracked file 'a.tsx' not found" } });
    const r = await loadSource("a.tsx");
    expect(r.code).toBe("");
    expect(r.err).toContain("couldn't load source for a.tsx");
    expect(r.err).toContain("not found");
  });
});
