// growShapeTree is the one path that turns an artifact into a shape tree, called from BOTH the
// shape pane and the intent pane's forge. It writes to the blackboard, so the tests pin the two
// things that corrupt operator work if they regress: update-in-place (never a duplicate row) and
// the 19500-char body clamp (an over-long body is rejected by the BE and the tree is lost).
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiPost = vi.fn();
vi.mock("@/loki/api/client", () => ({
  apiPost: (...a: any[]) => apiPost(...a),
  unwrapResult: (d: any) => d,
}));

const { growShapeTree, uid } = await import("./shape-grow");

const post = (path: string) => apiPost.mock.calls.filter((c) => c[0] === path);
const lastBody = (path: string) => post(path).at(-1)![1];

// Routes each call by URL + payload, mirroring the real BE's three endpoints.
function route({ plan, contextDocs = [], scratch = [], postResult = { id: 999 } }: any) {
  apiPost.mockImplementation((url: string, body: any) => {
    if (url === "/api/v1/cockpit/plan/generate") return Promise.resolve(plan);
    if (url === "/api/v1/cockpit/blackboard/read")
      return Promise.resolve(body.pane_id ? { scratch } : { context_docs: contextDocs });
    if (url === "/api/v1/cockpit/blackboard/post") return Promise.resolve(postResult);
    throw new Error(`unexpected ${url}`);
  });
}

// Block bodies, deliberately: a concise arrow would RETURN the Mock (mockReset/
// mockImplementation are chainable), and vitest registers a returned function as a teardown
// hook — which then calls the mock with no arguments during cleanup.
beforeEach(() => { apiPost.mockReset(); });

describe("refusals", () => {
  it("refuses an empty or whitespace-only artifact WITHOUT calling the BE", async () => {
    for (const art of ["", "   ", "\n"]) {
      expect(await growShapeTree(1, 2, art)).toEqual({ ok: false, error: "no artifact to grow from" });
    }
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("reports a failed generate instead of writing a half-built tree", async () => {
    route({ plan: { ok: false, error: "model refused" } });
    const r = await growShapeTree(1, 2, "the plan");
    expect(r).toEqual({ ok: false, error: "model refused" });
    expect(post("/api/v1/cockpit/blackboard/post")).toHaveLength(0);
  });

  it("turns a network throw into an operator-readable message", async () => {
    apiPost.mockRejectedValue(new Error("ECONNREFUSED"));
    const r = await growShapeTree(1, 2, "the plan");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("is the BE restarted?");
  });
});

describe("the assembled tree", () => {
  beforeEach(() =>
    route({
      plan: {
        ok: true,
        branches: [{ key: "b1", title: "Backend", nodes: [{ title: "n1" }, { title: "n2" }] }],
        phases: [{ title: "P1", refs: [] }],
      },
      contextDocs: [{ body_md: "RFC one\nsecond line" }],
    }),
  );

  it("titles the tree from the artifact's FIRST line, capped at 90 chars", async () => {
    const { tree } = await growShapeTree(1, 2, "Ship the cutover\nthen the rest");
    expect(tree!.title).toBe("Ship the cutover");

    const long = await growShapeTree(1, 2, "T".repeat(200));
    expect(long.tree!.title.length).toBe(90);
  });

  it("keeps the whole artifact verbatim alongside the derived title", async () => {
    const art = "Ship the cutover\nthen the rest";
    expect((await growShapeTree(1, 2, art)).tree!.artifact_md).toBe(art);
  });

  it("gives EVERY node a fresh id — the BE does not supply one and React keys on it", async () => {
    const { tree } = await growShapeTree(1, 2, "plan");
    const ids = tree!.branches.flatMap((b) => b.nodes.map((n) => n.id));
    expect(ids).toHaveLength(2);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });

  it("builds the context branch from the shared docs, titled by their first line", async () => {
    const { tree } = await growShapeTree(1, 2, "plan");
    expect(tree!.context).toHaveLength(1);
    expect(tree!.context[0].title).toBe("RFC one");
  });

  it("caps the context branch at 6 docs", async () => {
    route({ plan: { ok: true, branches: [] }, contextDocs: Array.from({ length: 20 }, (_, i) => ({ body_md: `doc ${i}` })) });
    expect((await growShapeTree(1, 2, "plan")).tree!.context).toHaveLength(6);
  });

  it("survives a plan with no branches or phases", async () => {
    route({ plan: { ok: true } });
    const { tree } = await growShapeTree(1, 2, "plan");
    expect(tree!.branches).toEqual([]);
    expect(tree!.phases).toEqual([]);
  });

  it("names a context doc that has no text rather than leaving it blank", async () => {
    route({ plan: { ok: true, branches: [] }, contextDocs: [{ body_md: "" }] });
    expect((await growShapeTree(1, 2, "plan")).tree!.context[0].title).toBe("context doc");
  });
});

describe("the blackboard write", () => {
  it("UPDATES the latest existing shape row rather than inserting a duplicate", async () => {
    route({
      plan: { ok: true, branches: [] },
      scratch: [{ id: 10, kind: "shape" }, { id: 11, kind: "note" }, { id: 12, kind: "shape" }],
    });
    const r = await growShapeTree(1, 2, "plan");
    const body = lastBody("/api/v1/cockpit/blackboard/post");
    expect(body.op).toBe("update");
    expect(body.id).toBe(12); // the LATEST shape row, not the first
    expect(r.rowId).toBe(12);
  });

  it("inserts a new row when the pane has no shape yet, and returns its id", async () => {
    route({ plan: { ok: true, branches: [] }, scratch: [{ id: 5, kind: "note" }], postResult: { id: 77 } });
    const r = await growShapeTree(1, 2, "plan");
    const body = lastBody("/api/v1/cockpit/blackboard/post");
    expect(body.op).toBeUndefined();
    expect(body).toMatchObject({ session_id: 1, pane_id: 2, kind: "shape" });
    expect(r.rowId).toBe(77);
  });

  it("clamps the serialised body to 19500 chars", async () => {
    route({
      plan: { ok: true, branches: [{ key: "b", title: "B", nodes: Array.from({ length: 2000 }, () => ({ title: "x".repeat(50) })) }] },
    });
    const r = await growShapeTree(1, 2, "plan");
    expect(lastBody("/api/v1/cockpit/blackboard/post").body_md.length).toBe(19500);
    expect(r.ok).toBe(true);
  });

  it("reads the pane's own scratch separately from the shared context docs", async () => {
    route({ plan: { ok: true, branches: [] } });
    await growShapeTree(1, 2, "plan");
    const reads = post("/api/v1/cockpit/blackboard/read");
    expect(reads).toHaveLength(2);
    expect(reads[0][1]).toEqual({ session_id: 1 }); // shared docs — no pane_id
    expect(reads[1][1]).toEqual({ session_id: 1, pane_id: 2 });
  });

  it("still reports success when the write itself fails, but with no row id", async () => {
    // The operator keeps the grown tree on screen; only persistence was lost.
    apiPost.mockImplementation((url: string) =>
      url === "/api/v1/cockpit/blackboard/post" ? Promise.reject(new Error("down")) :
      url === "/api/v1/cockpit/plan/generate" ? Promise.resolve({ ok: true, branches: [] }) : Promise.resolve({}));
    const r = await growShapeTree(1, 2, "plan");
    expect(r.ok).toBe(true);
    expect(r.rowId).toBeUndefined();
  });
});

describe("uid", () => {
  it("produces distinct 6-char ids", () => {
    const ids = new Set(Array.from({ length: 500 }, uid));
    expect(ids.size).toBeGreaterThan(495);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{1,6}$/);
  });
});
