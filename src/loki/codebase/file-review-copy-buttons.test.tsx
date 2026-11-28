// The file review's two clipboard buttons (operator 2026-09-29): "copy feedback" is the primary
// button in the tab bar, "copy plan" sits at the top of the plan, and "plan" stays as a small link.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn(async () => null), apiGet: vi.fn(async () => null), unwrapResult: (r: any) => r }));
vi.mock("@/loki/api/codebase", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  decorateFile: vi.fn(async () => ({ ok: true, decorators: [] })),
  getAtlas: vi.fn(async () => null),
  fileRead: vi.fn(async () => ({ content: "line1\nfor (a of b) { for (c of d) {} }\nline3\n" })),
  fileReviewHistoryGet: vi.fn(async () => ({ unavailable: "none" })),
}));

import { FileReviewBody } from "./atlas-decorators";

const con: any = {
  found: true, path: "src/a.ts", health: 60, axes: {},
  violations: [{ law_key: "nest", severity: "warn", line: 2, title: "No nested loops", fix: "extract the inner loop", rule_md: "avoid nesting", evidence: "for (a of b)" }],
};

describe("FileReviewBody — copy buttons", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => { writeText.mockClear(); Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true }); });

  it("copy feedback copies file, line and the change; flips to copied ✓", async () => {
    render(<FileReviewBody con={con} />);
    const b = await screen.findByTestId("copy-feedback");
    fireEvent.click(b);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain("src/a.ts:2");
    expect(text).toContain("extract the inner loop");
    await waitFor(() => expect(screen.getByTestId("copy-feedback").textContent).toContain("copied"));
  });

  it("the plan stays reachable through the small link and carries copy plan at its top", async () => {
    render(<FileReviewBody con={con} />);
    fireEvent.click(await screen.findByTestId("review-plan-link"));
    const b = await screen.findByTestId("copy-plan");
    fireEvent.click(b);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("## Fix plan — src/a.ts");
  });
});
