// @vitest-environment jsdom
// THE AUDIT SCREEN (2026-09-23): totals, per model, per job, the calls — deterministic cost in colour, the engine's
// figure beside it, never summed.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
vi.mock("@/loki/api/client", () => ({ apiGet: vi.fn(async () => ({
  calls: [{ t: 1790120000000, kind: "cli", job: "verifier", engine: "claude-code", model: "sonnet", pane_id: 0, run_id: 3, ms: 4200, tokens_in: 20000, tokens_out: 1000, cache_read: 0, cache_write: 0, cost: 0.075, cost_reported: 0.09, ok: true },
          { t: 1790119000000, kind: "turn", job: "chat", engine: "opencode", model: "opencode/qwen3.6-plus", pane_id: 7, run_id: 0, ms: 33000, tokens_in: 5000, tokens_out: 800, cache_read: 0, cache_write: 0, cost: 0.003, cost_reported: null, ok: false }],
  by_model: [{ engine: "claude-code", model: "sonnet", calls: 1, ms: 4200, tokens: 21000, cost: 0.075, cost_reported: 0.09, ok: 1 }, { engine: "opencode", model: "opencode/qwen3.6-plus", calls: 1, ms: 33000, tokens: 5800, cost: 0.003, cost_reported: 0, ok: 0 }],
  by_job: [{ job: "verifier", calls: 1, ms: 4200, cost: 0.075 }, { job: "chat", calls: 1, ms: 33000, cost: 0.003 }],
  total: { calls: 2, cost: 0.078, ms: 37200 }, file: "/x/merges.sqlite" })) }));
import { AuditScreen, fmtMs, fmtTok, fmtUsd } from "./audit";
import { apiGet } from "@/loki/api/client";

describe("the audit screen", () => {
  it("formats deterministically", () => { expect(fmtMs(4200)).toBe("4.2 s"); expect(fmtMs(90000)).toBe("1.5 min"); expect(fmtTok(21000)).toBe("21.0k"); expect(fmtUsd(0.075)).toBe("$0.075"); expect(fmtUsd(0.003)).toBe("$0.0030"); });
  it("shows the totals, the models with the engine's figure beside the deterministic one, and the calls", async () => {
    render(<AuditScreen />);
    await waitFor(() => expect(screen.getByTestId("audit-total")).toBeTruthy());
    expect(screen.getByTestId("audit-total").textContent).toContain("2 calls"); expect(screen.getByTestId("audit-total").textContent).toContain("$0.078 deterministic");
    expect(screen.getByTestId("audit-model-sonnet").textContent).toContain("$0.075"); expect(screen.getByTestId("audit-model-sonnet").textContent).toContain("$0.090");
    expect(screen.getByTestId("audit-model-opencode-qwen3.6-plus").textContent).toContain("0/1");
    expect(screen.getByTestId("audit-call-0").textContent).toContain("verifier"); expect(screen.getByTestId("audit-call-1").textContent).toContain("✗");
  });

  it("does not crash on a serve without the route — it says so", async () => {
    (apiGet as any).mockImplementationOnce(async () => ({ message: "Not Found", statusCode: 404 }));
    render(<AuditScreen />);
    await waitFor(() => expect(screen.getByTestId("audit-screen").textContent).toContain("Not Found"));
  });
});
