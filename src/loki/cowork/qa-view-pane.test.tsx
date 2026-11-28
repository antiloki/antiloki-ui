// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/loki/api/client", async (orig) => ({ ...(await orig<typeof import("@/loki/api/client")>()), apiGet: vi.fn() }));
import { apiGet } from "@/loki/api/client";
import { QaViewPane, viewOf } from "./QaViewPane";

afterEach(() => { cleanup(); vi.mocked(apiGet).mockReset(); });
const snap = (over: object) => ({ ok: true, snapshot: { type: "snapshot", timeline: [], last_frame: null, done: false, ...over } });

describe("the QA pane", () => {
  it("reads the serve's snapshot with the Studio's own reducer: the frame, the steps played and what each came to", () => {
    const v = viewOf({ type: "snapshot", done: true, last_frame: { jpeg: "AAAA" }, timeline: [
      { type: "step", n: 1, of: 2, kind: "goto", text: "open /" }, { type: "step-done", n: 1, ok: true, message: "" },
      { type: "step", n: 2, of: 2, kind: "click", text: "click text=Add" }, { type: "step-done", n: 2, ok: false, message: "nothing matches" }] });
    expect(v.status).toBe("over"); expect(v.frame).toBe("data:image/jpeg;base64,AAAA"); expect(v.results.map((r) => r.ok)).toEqual([true, false]); expect(viewOf(null).status).toBe("connecting");
  });
  it("shows the picture and the steps as they arrive, and stops asking once the run is over", async () => {
    vi.mocked(apiGet).mockResolvedValueOnce(snap({ last_frame: { jpeg: "AAAA" }, timeline: [{ type: "step", n: 1, of: 2, kind: "goto", text: "open /" }] }) as never)
      .mockResolvedValue(snap({ done: true, last_frame: { jpeg: "BBBB" }, timeline: [{ type: "step", n: 1, of: 2, kind: "goto", text: "open /" }, { type: "step-done", n: 1, ok: true, message: "" }, { type: "step", n: 2, of: 2, kind: "shot", text: "screenshot cart" }, { type: "step-done", n: 2, ok: false, message: "no page" }] }) as never);
    render(<QaViewPane run={5} />);
    await waitFor(() => expect(screen.getByTestId("qa-frame").getAttribute("src")).toBe("data:image/jpeg;base64,AAAA"));
    expect(screen.getByTestId("qa-view").getAttribute("data-status")).toBe("live");
    await waitFor(() => expect(screen.getByTestId("qa-view").getAttribute("data-status")).toBe("over"), { timeout: 4000 });
    expect(screen.getByTestId("qa-frame").getAttribute("src")).toBe("data:image/jpeg;base64,BBBB"); expect(screen.getByTestId("qa-steps").textContent).toContain("✓ 1. open /"); expect(screen.getByTestId("qa-steps").textContent).toContain("✗ 2. screenshot cart — no page");
    const calls = vi.mocked(apiGet).mock.calls.length; await new Promise((r) => setTimeout(r, 900)); expect(vi.mocked(apiGet).mock.calls.length).toBe(calls);
  });
  it("a run the server does not hold says so instead of waiting for ever", async () => {
    vi.mocked(apiGet).mockResolvedValue({ ok: false, error: "no run" } as never);
    render(<QaViewPane run={9} />);
    await waitFor(() => expect(screen.getByTestId("qa-view").getAttribute("data-status")).toBe("gone")); expect(screen.getByText(/no longer on the server/)).toBeTruthy();
  });
});
