// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
const models = vi.fn(); const setH = vi.fn();
vi.mock("./api", () => ({ paneModels: (...a: any[]) => models(...a), setPaneHeimdall: (...a: any[]) => setH(...a) }));
import { HeimdallToggle, heimdallLine } from "./HeimdallToggle";

describe("the Heimdall switch of an agent", () => {
  beforeEach(() => { models.mockReset(); setH.mockReset(); }); afterEach(() => cleanup());
  it("says what it is and what a flip does, by the provider's default", () => {
    expect(heimdallLine(false, true)).toMatchObject({ label: "Heimdall screening: off", next: true }); expect(heimdallLine(true, true)).toMatchObject({ label: "Heimdall screening: on", next: false });
    expect(heimdallLine(true, false).hint).toContain("screens its own work"); expect(heimdallLine(true, false).next).toBeNull(); expect(heimdallLine(false, false).next).toBeNull();
  });
  it("shows a frontier agent as off, turns it on, and clears the override when it goes back to the default", async () => {
    models.mockResolvedValue({ heimdall: false, heimdallDefault: false, models: [], engine: "claude-code", current: "", live: true }); setH.mockResolvedValue({ ok: true, heimdall: true, heimdallDefault: false });
    const done = vi.fn(); render(<HeimdallToggle paneId={7} onDone={done} />);
    await waitFor(() => screen.getByTestId("heimdall-toggle-7")); expect(screen.getByTestId("heimdall-toggle-7").getAttribute("data-on")).toBe("0");
    fireEvent.click(screen.getByTestId("heimdall-toggle-7")); await waitFor(() => expect(screen.getByTestId("heimdall-toggle-7").getAttribute("data-on")).toBe("1")); expect(setH).toHaveBeenCalledWith(7, true); expect(done).toHaveBeenCalled();
    setH.mockResolvedValue({ ok: true, heimdall: false, heimdallDefault: false }); fireEvent.click(screen.getByTestId("heimdall-toggle-7")); await waitFor(() => expect(setH).toHaveBeenLastCalledWith(7, null));
  });
  it("shows nothing until the serve has said", () => { models.mockReturnValue(new Promise(() => {})); render(<HeimdallToggle paneId={1} onDone={() => {}} />); expect(screen.queryByTestId("heimdall-toggle-1")).toBeNull(); });
});
