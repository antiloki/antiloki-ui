import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const op = vi.fn();
vi.mock("./api", () => ({ teamOp: (...a: unknown[]) => op(...a) }));
import { AutofixToggle } from "./AutofixToggle";

describe("the autofix switch on the Leader's top bar", () => {
  it("shows what the team has, turns it off and on, and puts it back when the serve refuses", async () => {
    let state = true; op.mockImplementation(async (name: string, body: { on?: boolean }) => { if (name === "autofix") return { ok: true, on: state }; if (name === "autofix_set") { state = !!body.on; return { ok: true, on: state }; } return { ok: false }; });
    render(<AutofixToggle team="Video editing" />); const b = await screen.findByTestId("autofix-toggle"); expect(b).toHaveAttribute("aria-checked", "true"); expect(b).toHaveAttribute("aria-label", "autofix on");
    fireEvent.click(b); await waitFor(() => expect(screen.getByTestId("autofix-toggle")).toHaveAttribute("aria-label", "autofix off")); expect(op).toHaveBeenCalledWith("autofix_set", { team: "Video editing", on: false });
    op.mockImplementation(async (name: string) => (name === "autofix_set" ? { ok: false, error: "no" } : { ok: true, on: false })); fireEvent.click(screen.getByTestId("autofix-toggle")); await waitFor(() => expect(screen.getByTestId("autofix-toggle")).toHaveAttribute("aria-label", "autofix off"));
  });
});
