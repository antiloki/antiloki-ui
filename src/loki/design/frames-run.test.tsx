// @vitest-environment jsdom
// RUN AND CAPTURE says why it cannot (operator 2026-09-19): the dev server's refusal is visible above
// the button, and a running URL can be captured instead.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const calls: string[] = [];
vi.mock("@/loki/api/client", async (orig) => ({
  ...(await orig<any>()),
  apiGet: vi.fn(async () => ({ result: {} })),
  apiPost: vi.fn(async (url: string, body: any) => {
    calls.push(`${url} ${JSON.stringify(body)}`);
    if (url.endsWith("/design/snapshots")) return { result: { snapshots: [], css: "", baseUrl: "" } };
    if (url.endsWith("/pr/preview/start")) return { result: { ok: false, error: "no dev script set — configure it on the Code screen" } };
    if (url.endsWith("/design/capture")) return { result: { ok: true, screens: 2, components: 5, framework: "react" } };
    return { result: {} };
  }),
  isNotWired: () => false,
  unwrapResult: (r: any) => r?.result ?? r,
  BE_URL: "",
}));
vi.mock("@/loki/widgets/agents-timeline", () => ({ noteTimeline: vi.fn() }));
import { DesignFrames } from "./frames";

describe("Frames › run and capture", () => {
  it("shows the dev server's refusal above the button, and captures a typed URL instead", async () => {
    render(<DesignFrames />);
    await waitFor(() => expect(screen.getByTestId("frames-run")).toBeTruthy());
    fireEvent.click(screen.getByTestId("frames-run"));
    await waitFor(() => expect(screen.getByTestId("frames-run-msg").textContent).toContain("no dev script set"));
    const msg = screen.getByTestId("frames-run-msg"); const btn = screen.getByTestId("frames-run");
    expect(msg.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(screen.getByTestId("frames-url"), { target: { value: "localhost:3000" } });
    fireEvent.submit(screen.getByTestId("frames-url-form"));
    await waitFor(() => expect(calls.some((c) => c.includes("/design/capture") && c.includes("http://localhost:3000"))).toBe(true));
    await waitFor(() => expect(screen.getByTestId("frames-run-msg").textContent).toContain("captured 2 screens"));
  });
});
