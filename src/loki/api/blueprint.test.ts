// The Blueprint tab distinguishes three states that look alike from here: "no blueprint yet"
// (blueprint: null — show Empty), "read failed / route unwired" (null — show nothing), and a real
// blueprint. Collapsing the first two together makes an undesigned contract look broken, so the
// unwrap must keep {contract_slug, blueprint: null} alive while dropping the sentinels.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiPost = vi.fn();
vi.mock("./client", () => ({
  apiPost: (...a: any[]) => apiPost(...a),
  isNotWired: (v: any) => !!(v && typeof v === "object" && v.__not_wired === true),
}));

import { getBlueprint, describeBlueprint } from "./blueprint";

beforeEach(() => { apiPost.mockReset(); });

describe("getBlueprint", () => {
  it("posts the contract slug to the dedicated read route", async () => {
    apiPost.mockResolvedValue({ contract_slug: "CT-1" });
    await getBlueprint("CT-1");
    expect(apiPost).toHaveBeenCalledWith("/api/v1/blueprint/get", { contract_slug: "CT-1" });
  });

  it("keeps a designed-but-empty contract distinguishable from a failed read", async () => {
    apiPost.mockResolvedValue({ contract_slug: "CT-1", blueprint: null });
    const bp = await getBlueprint("CT-1");
    expect(bp).not.toBeNull();
    expect(bp!.blueprint).toBeNull();
  });

  it("unwraps the blocks/bindings graph from either shape", async () => {
    const graph = {
      contract_slug: "CT-1",
      blocks: [{ id: "f1", type: "file", path: "a.ts", intent: "x", children: [] }],
      bindings: [{ from: "f1", to: "f2" }],
    };
    apiPost.mockResolvedValue(graph);
    expect((await getBlueprint("CT-1"))!.blocks).toHaveLength(1);
    apiPost.mockResolvedValue({ result: graph });
    expect((await getBlueprint("CT-1"))!.bindings).toHaveLength(1);
  });

  it("returns null for a transient failure, an unwired route, or a body with no contract", async () => {
    for (const body of [null, { __not_wired: true }, { ok: true }, { result: { ok: true } }]) {
      apiPost.mockResolvedValue(body);
      expect(await getBlueprint("CT-1"), JSON.stringify(body)).toBeNull();
    }
  });
});

describe("describeBlueprint", () => {
  it("does not force a regenerate unless asked", async () => {
    apiPost.mockResolvedValue({ summary_md: "s", cached: true });
    await describeBlueprint("CT-1");
    expect(apiPost.mock.calls[0][1]).toEqual({ contract_slug: "CT-1", force: false });
    await describeBlueprint("CT-1", true);
    expect(apiPost.mock.calls[1][1]).toEqual({ contract_slug: "CT-1", force: true });
  });

  it("gets a longer timeout than the default — it may run an AI essay", async () => {
    apiPost.mockResolvedValue({ summary_md: "s", cached: false });
    await describeBlueprint("CT-1");
    expect(apiPost.mock.calls[0][2].timeoutMs).toBeGreaterThanOrEqual(30_000);
  });

  it("normalises the cached flag to a boolean and keeps a null summary", async () => {
    apiPost.mockResolvedValue({ summary_md: null, cached: 1 });
    expect(await describeBlueprint("CT-1")).toEqual({ summary_md: null, cached: true });
  });

  it("reads the nested .result shape when the flat one has neither field", async () => {
    apiPost.mockResolvedValue({ result: { summary_md: "essay", cached: false } });
    expect(await describeBlueprint("CT-1")).toEqual({ summary_md: "essay", cached: false });
  });

  it("returns null when the read fails, is unwired, or carries nothing usable", async () => {
    for (const body of [null, { __not_wired: true }, { other: 1 }]) {
      apiPost.mockResolvedValue(body);
      expect(await describeBlueprint("CT-1"), JSON.stringify(body)).toBeNull();
    }
  });
});
