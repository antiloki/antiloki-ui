// The hooks in this module are mostly one-line usePoll wrappers, but a handful carry real logic:
// they unwrap an envelope the BE changed shape on, pick ONE row out of a list, patch a 2000-card
// payload in place rather than refetching it, or share one in-flight request across every mount of
// a shell-wide indicator. Those are the ones that break silently — a wrong unwrap renders an empty
// list on a healthy BE, and a broken share turns one ping into N identical HTTP calls.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const apiGet = vi.fn();
const apiPost = vi.fn();
let firedListener: ((change?: any) => void) | null = null;

vi.mock("./client", () => ({
  apiGet: (...a: any[]) => apiGet(...a),
  apiPost: (...a: any[]) => apiPost(...a),
  makePoll: () => () => {},              // no background polling in tests
  sameOrNext: (_p: unknown, n: unknown) => n,
  isNotWired: (v: any) => !!(v && typeof v === "object" && v.__not_wired === true),
}));
vi.mock("./events", () => ({
  subscribeToSubstrate: (fn: any) => { firedListener = fn; return () => {}; },
  isStreamHealthy: () => true,
}));
vi.mock("./dispatch", () => ({ fetchWorkspaces: vi.fn(async () => null) }));

import {
  useInbox, useCards, useCardProposal, useDriverStatus, useSubstrateStream, useDriftFeed,
  decideProposal, fetchDriftQuestionnaire, resolveDrift,
} from "./hooks";

const ping = async (entities: any[]) => {
  await act(async () => {
    firedListener?.({ t: "change", entities });
    await new Promise((r) => setTimeout(r, 700)); // past the 600ms debounce
  });
};

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  apiGet.mockResolvedValue(null);
  apiPost.mockResolvedValue(null);
});

describe("useInbox unwraps whichever envelope the BE sends", () => {
  const settle = async (raw: any) => {
    apiPost.mockResolvedValue(raw);
    const { result } = renderHook(() => useInbox());
    await waitFor(() => expect(result.current.loading).toBe(false));
    return result.current.data;
  };

  const state = async (raw: any) => {
    apiPost.mockResolvedValue(raw);
    const { result } = renderHook(() => useInbox());
    await waitFor(() => expect(result.current.loading).toBe(false));
    return result.current;
  };

  it("pulls the rows out of {messages, counts}", async () => {
    expect(await settle({ messages: [{ id: 1 }], counts: { total: 1 } })).toEqual([{ id: 1 }]);
  });

  it("still accepts the older bare-array shape", async () => {
    expect(await settle([{ id: 2 }])).toEqual([{ id: 2 }]);
  });

  it("returns an empty array — never undefined — for an envelope it does not recognise", async () => {
    expect(await settle({ something: "else" })).toEqual([]);
  });

  it("hands the sentinels to usePoll rather than turning them into rows", async () => {
    // The unwrap must NOT coerce these to [] — an empty inbox and an unreachable BE are different
    // states, and only the poller can tell the badge which one it is looking at.
    const dead = await state(null);
    expect(dead.data).toBeNull();
    expect(dead.error).toBe(true);

    const unwired = await state({ __not_wired: true, path: "/x" });
    expect(unwired.data).toBeNull();
    expect(unwired.notWired).toBe(true);
    expect(unwired.error).toBe(false);
  });

  it("asks only for the few unarchived messages the shell badge needs", async () => {
    await settle({ messages: [] });
    expect(apiPost).toHaveBeenCalledWith("/api/v1/inbox/list", { include_archived: false, limit: 5 });
  });
});

describe("useCards patches one card in place instead of refetching two thousand", () => {
  const LIST = "/api/v1/cards?limit=2000&slim=1";

  const mountWith = async (list: any[]) => {
    apiGet.mockImplementation(async (path: string) => (path === LIST ? list : null));
    const h = renderHook(() => useCards());
    await waitFor(() => expect(h.result.current.data).toEqual(list));
    return h;
  };

  it("fetches the slim list only, and only once, when a precise ping arrives", async () => {
    const { result } = await mountWith([{ slug: "A", status: "doing" }]);
    apiGet.mockClear();
    apiGet.mockImplementation(async (path: string) =>
      path === `/api/v1/cards/A` ? { slug: "A", status: "done", body_json: "{}", accuracy_detail_json: "{}" } : null);

    await ping([{ kind: "card", id: "A", op: "update" }]);

    expect(result.current.data).toEqual([{ slug: "A", status: "done" }]);
    // the fat columns never reach a list surface
    expect(Object.keys(result.current.data![0])).not.toContain("body_json");
    expect(apiGet.mock.calls.filter((c) => c[0] === LIST)).toHaveLength(0); // no full refetch
  });

  it("appends a card the list had not seen yet", async () => {
    const { result } = await mountWith([{ slug: "A" }]);
    apiGet.mockImplementation(async (p: string) => (p === "/api/v1/cards/B" ? { slug: "B" } : null));
    await ping([{ kind: "card", id: "B", op: "update" }]);
    expect(result.current.data!.map((c: any) => c.slug)).toEqual(["A", "B"]);
  });

  it("drops a deleted card without asking the BE for it", async () => {
    const { result } = await mountWith([{ slug: "A" }, { slug: "B" }]);
    apiGet.mockClear();
    await ping([{ kind: "card", id: "B", op: "delete" }]);
    expect(result.current.data!.map((c: any) => c.slug)).toEqual(["A"]);
    expect(apiGet).not.toHaveBeenCalledWith("/api/v1/cards/B");
  });

  it("falls back to a full refetch when the ping is not about a specific card", async () => {
    let n = 0;
    apiGet.mockImplementation(async (p: string) => (p === LIST ? [{ slug: "A", v: ++n }] : null));
    const { result } = renderHook(() => useCards());
    await waitFor(() => expect(result.current.data).toEqual([{ slug: "A", v: 1 }]));

    await ping([{ kind: "card", op: "add" }]);           // an add has no id to patch
    await waitFor(() => expect(result.current.data).toEqual([{ slug: "A", v: 2 }]));
  });

  it("falls back to a full refetch when the per-card read fails or answers an engine error", async () => {
    for (const bad of [null, { __engine_error: { code: "NOT_FOUND" } }, { notASlug: 1 }]) {
      let n = 0;
      apiGet.mockImplementation(async (p: string) => (p === LIST ? [{ slug: "A", v: ++n }] : bad));
      const { result, unmount } = renderHook(() => useCards());
      await waitFor(() => expect(result.current.data).toEqual([{ slug: "A", v: 1 }]));
      await ping([{ kind: "card", id: "A", op: "update" }]);
      await waitFor(() => expect(result.current.data).toEqual([{ slug: "A", v: 2 }]));
      unmount();
    }
  });
});

describe("useCardProposal picks the one pending proposal that belongs to this card", () => {
  const proposals = [
    { id: 1, card_slug: "FEAT-A", decided_at: null, created_at: "2026-01-01" },
    { id: 2, card_slug: "FEAT-A", decided_at: null, created_at: "2026-03-01" },
    { id: 3, card_slug: "FEAT-A", decided_at: "2026-04-01", created_at: "2026-04-01" },
    { id: 4, card_slug: "FEAT-B", decided_at: null, created_at: "2026-05-01" },
  ];

  const settle = async (slug: string | null, raw: any = proposals) => {
    apiGet.mockResolvedValue(raw);
    const { result } = renderHook(() => useCardProposal(slug));
    await waitFor(() => expect(result.current.loading).toBe(false));
    return result.current.data;
  };

  it("takes the newest undecided proposal for this card, ignoring other cards and decided ones", async () => {
    expect((await settle("FEAT-A"))!.proposal).toMatchObject({ id: 2 });
  });

  it("reports no proposal rather than null when this card has none pending", async () => {
    expect((await settle("FEAT-C"))!.proposal).toBeNull();
  });

  it("stays inert without a slug — no request, no data", async () => {
    apiGet.mockResolvedValue(proposals);
    const { result } = renderHook(() => useCardProposal(null));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(apiGet).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it("tolerates a non-array body instead of throwing inside the poll", async () => {
    expect((await settle("FEAT-A", { oops: true }))!.proposal).toBeNull();
  });
});

describe("useDriverStatus shares one request across every shell surface that renders it", () => {
  it("makes a single HTTP call for N simultaneous mounts", async () => {
    apiPost.mockResolvedValue({ tick_loop: "alive" });
    const a = renderHook(() => useDriverStatus());
    const b = renderHook(() => useDriverStatus());
    const c = renderHook(() => useDriverStatus());
    await waitFor(() => expect(a.result.current.data).toBeTruthy());
    await waitFor(() => expect(b.result.current.data).toBeTruthy());
    await waitFor(() => expect(c.result.current.data).toBeTruthy());
    expect(apiPost.mock.calls.filter((x) => x[0] === "/api/v1/driver/status")).toHaveLength(1);
    expect(c.result.current.data).toEqual({ tick_loop: "alive" });
  });
});

describe("query strings the pollers build", () => {
  it("useSubstrateStream asks for all four sources by default and honours an override", async () => {
    renderHook(() => useSubstrateStream());
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(apiGet.mock.calls[0][0]).toBe("/api/v1/substrate/stream?limit=200&kinds=audit,ai,tick,notification");

    apiGet.mockClear();
    renderHook(() => useSubstrateStream(["tick"], 10));
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(apiGet.mock.calls[0][0]).toBe("/api/v1/substrate/stream?limit=10&kinds=tick");
  });

  it("useDriftFeed defaults to the unfiltered feed", async () => {
    renderHook(() => useDriftFeed());
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(apiGet.mock.calls[0][0]).toBe("/api/v1/drift?filter=all&limit=100");
    apiGet.mockClear();
    renderHook(() => useDriftFeed("stuck"));
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(apiGet.mock.calls[0][0]).toBe("/api/v1/drift?filter=stuck&limit=100");
  });
});

describe("the write helpers", () => {
  it("decideProposal waits out the post-accept AI rescore instead of timing out at 5s", async () => {
    // A 5s timeout returned null even though the write landed, so the FE skipped its refresh.
    await decideProposal(7, "accepted", { title: "x" });
    const [path, body, opts] = apiPost.mock.calls[0];
    expect(path).toBe("/api/v1/enrich/7/decide");
    expect(body).toEqual({ decision: "accepted", edited_body: { title: "x" } });
    expect(opts.timeoutMs).toBeGreaterThanOrEqual(60_000);
  });

  it("drift ids are percent-encoded into the path — they are free-form strings", async () => {
    await fetchDriftQuestionnaire("card/FEAT A");
    expect(apiGet.mock.calls[0][0]).toBe("/api/v1/drift/card%2FFEAT%20A/questionnaire");
    await resolveDrift("card/FEAT A", { choice_label: "restart" });
    expect(apiPost.mock.calls[0][0]).toBe("/api/v1/drift/card%2FFEAT%20A/resolve");
    expect(apiPost.mock.calls[0][1]).toEqual({ choice_label: "restart" });
  });
});
