// FEAT-FE-UNIT-API-DISPATCH (quality program 2026-07-16, phase-2 tests).
// Behavioral coverage for api/dispatch.ts: the fix-option switch (nav vs
// (resolveDispatchError mirrors the substrate skill — drift/law/unknown),
// the confirm seam's silent-swallow fix, and the operator-confirmed
// propose→"go" double-POST (turn then dispatch). apiPost is mocked at the
// client boundary — no network, no BE.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client", () => ({
  apiPost: vi.fn(),
  apiGet: vi.fn(),
  BE_URL: "http://test-be",
  getFeSession: () => "test-session",
}));

import { apiPost } from "./client";
import {
  activateWorkspace,
  dispatchFixOption,
  confirmInterviewerTurn,
  dispatchCardAdd,
  resolveDispatchError,
} from "./dispatch";
import type { FixOption } from "./types";

const apiPostMock = vi.mocked(apiPost);

beforeEach(() => {
  apiPostMock.mockReset();
});

describe("resolveDispatchError", () => {
  it("classifies code drift (by law or by message) with commit-from-chat as the lead alternative", () => {
    const byLaw = resolveDispatchError("blocked by law 'COMMIT_CODE_BEFORE_AUDIT_COMMIT': tree dirty");
    expect(byLaw.kind).toBe("git_drift");
    expect(byLaw.law).toBe("COMMIT_CODE_BEFORE_AUDIT_COMMIT");
    expect(byLaw.alternatives.map((a) => a.action_kind)).toEqual(["commit_pending", "guidance", "write_myself"]);

    const byMessage = resolveDispatchError("Code drift detected: 3 uncommitted files");
    expect(byMessage.kind).toBe("git_drift");
  });

  it("classifies other law denials as law_denied and names the law in the message", () => {
    const r = resolveDispatchError("refused by law 'CARD_BODY_MUST_MATCH_SCHEMA'");
    expect(r.kind).toBe("law_denied");
    expect(r.law).toBe("CARD_BODY_MUST_MATCH_SCHEMA");
    expect(r.message_md).toContain("CARD_BODY_MUST_MATCH_SCHEMA");
    expect(r.alternatives.map((a) => a.action_kind)).toEqual(["rephrase", "retry", "write_myself"]);
  });

  it("treats PERMISSION_DENIED without a quoted law as law_denied with the generic message", () => {
    const r = resolveDispatchError("PERMISSION_DENIED: agent lacks grant");
    expect(r.kind).toBe("law_denied");
    expect(r.law).toBeUndefined();
    expect(r.message_md).toBe("That action was denied by a rule.");
  });

  it("falls back to unknown, preserving the raw message (or a stock one when empty)", () => {
    const r = resolveDispatchError("socket hang up");
    expect(r.kind).toBe("unknown");
    expect(r.message_md).toBe("socket hang up");
    expect(r.alternatives.map((a) => a.key)).toEqual(["T", "R", "W"]);

    expect(resolveDispatchError("").message_md).toBe("Something went wrong.");
  });
});

describe("dispatchFixOption", () => {
  it("nav_card routes to the card (or /operations without a slug) with zero requests", async () => {
    expect(await dispatchFixOption({ action: "nav_card", card_slug: "FEAT-X" } as FixOption))
      .toEqual({ ok: true, nav: "/contracts/FEAT-X" });
    expect(await dispatchFixOption({ action: "nav_card" } as FixOption))
      .toEqual({ ok: true, nav: "/operations" });
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("set_intent posts to the intent route and maps a null response to a failure", async () => {
    const opt = { action: "set_intent", card_slug: "FEAT-X", intent: "play" } as FixOption;

    apiPostMock.mockResolvedValueOnce({});
    expect(await dispatchFixOption(opt)).toEqual({ ok: true, error: undefined });
    expect(apiPostMock).toHaveBeenCalledWith("/api/v1/driver/card/play", { slug: "FEAT-X" });

    apiPostMock.mockResolvedValueOnce(null);
    expect(await dispatchFixOption(opt)).toEqual({ ok: false, error: "request failed" });
  });

  it("set_intent/set_status refuse locally when required fields are missing", async () => {
    expect((await dispatchFixOption({ action: "set_intent", card_slug: "X" } as FixOption)).ok).toBe(false);
    expect((await dispatchFixOption({ action: "set_status", status: "done" } as FixOption)).ok).toBe(false);
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("set_status dispatches board-keeper.card.status.change (no god gate — god mode is gone)", async () => {
    apiPostMock.mockResolvedValue({});
    await dispatchFixOption({ action: "set_status", card_slug: "X", status: "archived" } as FixOption);
    expect(apiPostMock).toHaveBeenLastCalledWith(
      "/api/v1/dispatch",
      { action_name: "board-keeper.card.status.change", input: { slug: "X", status: "archived" } },
    );

    await dispatchFixOption({ action: "set_status", card_slug: "X", status: "review" } as FixOption);
    expect(apiPostMock).toHaveBeenLastCalledWith("/api/v1/dispatch", expect.anything());
  });

  it("unknown actions fail closed with the not-yet-wired error; thrown errors become {ok:false}", async () => {
    const r = await dispatchFixOption({ action: "warp_drive" } as unknown as FixOption);
    expect(r).toEqual({ ok: false, error: "action 'warp_drive' not yet wired in v1" });

    apiPostMock.mockRejectedValueOnce(new Error("boom"));
    expect(await dispatchFixOption({ action: "tick_now" } as FixOption))
      .toEqual({ ok: false, error: "boom" });
  });
});

describe("confirmInterviewerTurn", () => {
  it("posts turn_id + confirmation and reports ok on success", async () => {
    apiPostMock.mockResolvedValueOnce({ ok: true, results: [] });
    expect(await confirmInterviewerTurn(42)).toEqual({ ok: true });
    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/v1/dispatch",
      { turn_id: 42, confirmation_text: "go" },
      { timeoutMs: 60_000 },
    );
  });

  it("surfaces the first per-action error instead of a false success (silent-swallow fix)", async () => {
    apiPostMock.mockResolvedValueOnce({ ok: false, failed: true, errors: [{ action: "a.b", error: "law said no" }] });
    expect(await confirmInterviewerTurn(42)).toEqual({ ok: false, error: "a.b: law said no" });

    apiPostMock.mockResolvedValueOnce({ failed: true, errors: [] });
    expect(await confirmInterviewerTurn(42)).toEqual({ ok: false, error: "dispatch failed" });

    apiPostMock.mockRejectedValueOnce(new Error("net down"));
    expect(await confirmInterviewerTurn(42)).toEqual({ ok: false, error: "net down" });
  });
});

describe("dispatchCardAdd (operator-confirmed propose→go seam)", () => {
  const card = { slug: "FEAT-NEW", title: "New card", body: { kind: "feature", size: "small", why: "w" } };

  it("POSTs the prebuilt plan as a turn, then dispatches it with confirmation 'go'", async () => {
    apiPostMock
      .mockResolvedValueOnce({ turn_id: 7 })
      .mockResolvedValueOnce({ results: [{ action: "board-keeper.card.add", ok: true }] });

    expect(await dispatchCardAdd(card)).toEqual({ ok: true, error: undefined });

    const [turnPath, turnBody] = apiPostMock.mock.calls[0];
    expect(turnPath).toBe("/api/v1/turn");
    expect(turnBody).toMatchObject({
      user_identifier: "danil",
      prebuilt_plan: [{ action: "board-keeper.card.add", args: expect.objectContaining({ slug: "FEAT-NEW" }) }],
    });
    const [dispatchPath, dispatchBody] = apiPostMock.mock.calls[1];
    expect(dispatchPath).toBe("/api/v1/dispatch");
    expect(dispatchBody).toEqual({ turn_id: 7, confirmation_text: "go" });
  });

  it("stops (no dispatch POST) when the turn returns no turn_id", async () => {
    apiPostMock.mockResolvedValueOnce({});
    expect(await dispatchCardAdd(card)).toEqual({ ok: false, error: "no turn_id returned" });
    expect(apiPostMock).toHaveBeenCalledTimes(1);
  });

  it("propagates the per-action failure from the dispatch results", async () => {
    apiPostMock
      .mockResolvedValueOnce({ turn_id: 7 })
      .mockResolvedValueOnce({ results: [{ action: "board-keeper.card.add", ok: false, error: "schema refused" }] });
    expect(await dispatchCardAdd(card)).toEqual({ ok: false, error: "schema refused" });

    apiPostMock
      .mockResolvedValueOnce({ turn_id: 8 })
      .mockResolvedValueOnce({ results: [] });
    expect(await dispatchCardAdd(card)).toEqual({ ok: false, error: "no dispatch result" });
  });
});

describe("activateWorkspace", () => {
  it("reports success from the serve's answer", async () => {
    apiPostMock.mockResolvedValueOnce({ ok: true, active: "ws-main" });
    expect(await activateWorkspace("ws-main")).toEqual({ ok: true, error: undefined });
  });
  it("keeps the serve's own sentence when the workspace is not registered (a 404 comes back as an engine error, not a throw)", async () => {
    // QA report BUG-001: this used to be an HTTP 500 that apiPost threw with the reason; it is a 404 now and apiPost hands the error object back
    apiPostMock.mockResolvedValueOnce({ __engine_error: { code: "NOT_FOUND", cause: "workspace-activate: workspace 'gone' is not registered" }, path: "/api/v1/workspaces/activate" });
    expect(await activateWorkspace("gone")).toEqual({ ok: false, error: "workspace-activate: workspace 'gone' is not registered" });
  });
});
