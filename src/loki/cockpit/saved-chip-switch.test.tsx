// @vitest-environment jsdom
// THE CHIP ON A WORKSPACE SWITCH (operator 2026-09-30: "the value that appears on the switcher is still wrong, is from another workspace").
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";

const apiGet = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...(a as [])) }));
vi.mock("./fuel-mini", () => ({ useFuelLive: () => null, FuelMini: ({ label }: any) => <span data-testid="money">{label}</span> }));
import { SavedChip } from "./saved-chip";

const ledger = (usd: number) => ({ savings: { saved_usd: usd, actual_usd: 1, baseline_usd: usd + 1, tokens: 1, runs: 2 } });
beforeEach(() => apiGet.mockReset());

describe("SavedChip across a workspace switch", () => {
  it("shows nothing - not the other project's money - until the new workspace answers", async () => {
    apiGet.mockResolvedValueOnce(ledger(44.15));
    render(<SavedChip />);
    await waitFor(() => expect(screen.getByTestId("money").textContent).toBe("$44.15"));
    let release: (v: any) => void = () => {};
    apiGet.mockReturnValueOnce(new Promise((r) => { release = r; }));
    act(() => { window.dispatchEvent(new CustomEvent("antiloki:workspace-changed")); });
    expect(screen.queryByTestId("money")).toBeNull();
    await act(async () => { release(ledger(1.5)); });
    await waitFor(() => expect(screen.getByTestId("money").textContent).toBe("$1.50"));
  });

  it("ignores an answer that was still on its way for the old workspace", async () => {
    let releaseOld: (v: any) => void = () => {};
    apiGet.mockReturnValueOnce(new Promise((r) => { releaseOld = r; }));
    render(<SavedChip />);
    apiGet.mockResolvedValueOnce(ledger(2));
    act(() => { window.dispatchEvent(new CustomEvent("antiloki:workspace-changed")); });
    await waitFor(() => expect(screen.getByTestId("money").textContent).toBe("$2.00"));
    await act(async () => { releaseOld(ledger(999)); });
    expect(screen.getByTestId("money").textContent).toBe("$2.00");
  });
});
