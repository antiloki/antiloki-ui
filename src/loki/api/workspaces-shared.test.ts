// Grokbot QA 2026-10-12, performance: fifteen mounts of useWorkspaces must not make fifteen requests.
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchWorkspaces = vi.fn();
vi.mock("./dispatch", async (importOriginal) => ({ ...(await importOriginal<any>()), fetchWorkspaces: (...a: any[]) => fetchWorkspaces(...a) }));
import { fetchWorkspacesShared } from "./hooks";

beforeEach(() => { fetchWorkspaces.mockReset(); });
describe("the shared workspace list request", () => {
  it("fifteen callers in the same moment make one request and all get its answer", async () => {
    let resolve!: (v: any) => void;
    fetchWorkspaces.mockReturnValue(new Promise((r) => { resolve = r; }));
    const calls = Array.from({ length: 15 }, () => fetchWorkspacesShared());
    resolve({ active: null, workspaces: [] });
    const all = await Promise.all(calls);
    expect(fetchWorkspaces).toHaveBeenCalledTimes(1);
    expect(all.every((x) => x === all[0])).toBe(true);
  });
  it("a call after the first finished makes a new request: no stale answer after a switch", async () => {
    fetchWorkspaces.mockResolvedValueOnce({ active: "a", workspaces: [] }).mockResolvedValueOnce({ active: "b", workspaces: [] });
    expect((await fetchWorkspacesShared())!.active).toBe("a");
    expect((await fetchWorkspacesShared())!.active).toBe("b");
    expect(fetchWorkspaces).toHaveBeenCalledTimes(2);
  });
  it("a failed request does not stick: the next call tries again", async () => {
    fetchWorkspaces.mockResolvedValueOnce(null).mockResolvedValueOnce({ active: "a", workspaces: [] });
    expect(await fetchWorkspacesShared()).toBeNull();
    expect((await fetchWorkspacesShared())!.active).toBe("a");
  });
});
