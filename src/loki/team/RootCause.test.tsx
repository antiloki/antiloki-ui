import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as api from "./api";
import { RootCause } from "./RootCause";

const rc: any = { run: "r1", node: "builder", kind: "Error", error: "x", failures: 1, finding: "Run r1 failed at builder", hypotheses: [{ claim: "A tool or file the step needs is missing", status: "confirmed", evidence: 'the error says "not found"', fix: "install it" }, { claim: "The step ran out of time", status: "ruled_out", evidence: "the failure is not a timeout", fix: "" }] };
describe("root cause", () => {
  it("says nothing for a run that did not fail, without even asking", async () => { const s = vi.spyOn(api, "rootCause"); const { container } = render(<RootCause run="r1" team="T" failed={false} />); expect(container.textContent).toBe(""); expect(s).not.toHaveBeenCalled(); });
  it("lists confirmed and ruled-out causes, and copies the finding with the improver's brief", async () => {
    vi.spyOn(api, "rootCause").mockResolvedValue(rc); vi.spyOn(api, "improvePrompt").mockResolvedValue({ ok: true, prompt: "BRIEF" } as any);
    const write = vi.fn(async () => {}); Object.assign(navigator, { clipboard: { writeText: write } });
    render(<RootCause run="r1" team="T" failed />); expect((await screen.findAllByTestId("cause-confirmed")).length).toBe(1); expect(screen.getAllByTestId("cause-ruled_out").length).toBe(1);
    fireEvent.click(screen.getByTestId("copy-finding")); await waitFor(() => expect(write).toHaveBeenCalled()); expect((write.mock.calls[0] as any)[0]).toContain("Run r1 failed at builder"); expect((write.mock.calls[0] as any)[0]).toContain("BRIEF");
  });
});
