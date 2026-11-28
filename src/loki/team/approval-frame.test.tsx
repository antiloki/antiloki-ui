// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
const api = vi.hoisted(() => ({ getArtifact: vi.fn() }));
vi.mock("./api", () => api);
import { ApprovalCard } from "./ApprovalCard";

describe("an approval that shows a design before anything is built", () => {
  afterEach(() => cleanup());
  it("draws the artifact in a frame with no scripts, says so when it is not written, and shows no frame without `show`", async () => {
    api.getArtifact.mockImplementation(async (_r: string, n: string) => n === "frames.html" ? { ok: true, name: "frames.html", format: "html", text: "<html><body>frame one</body></html>" } : { ok: false });
    const { rerender } = render(<ApprovalCard gate="review" node="design_gate" run="r1" approval={{ risk: "low", show: "frames" }} onAnswer={() => {}} />);
    const f = await waitFor(() => screen.getByTestId("approval-frame") as HTMLIFrameElement); expect(f.getAttribute("sandbox")).toBe(""); expect(f.getAttribute("srcdoc")).toContain("frame one"); expect(api.getArtifact).toHaveBeenCalledWith("r1", "frames.html");
    fireEvent.click(screen.getByTestId("approval-frame-full")); const big = screen.getByTestId("approval-frame-big") as HTMLIFrameElement; expect(big.getAttribute("sandbox")).toBe(""); expect(screen.getByTestId("glass-view").parentElement).toBe(document.body); fireEvent.keyDown(window, { key: "Escape" }); expect(screen.queryByTestId("glass-view")).toBeNull();
    api.getArtifact.mockImplementation(async () => ({ ok: false }));
    rerender(<ApprovalCard gate="review" node="design_gate" run="r2" approval={{ risk: "low", show: "frames" }} onAnswer={() => {}} />); await waitFor(() => screen.getByTestId("approval-frame-missing"));
    rerender(<ApprovalCard gate="review" node="x" run="r2" approval={{ risk: "low" }} onAnswer={() => {}} />); expect(screen.queryByTestId("approval-frame")).toBeNull();
  });
});
