// STUDIO select → Generate (operator 2026-07-15): clicking a generator card SELECTS it; only the
// footer's ▶ Generate fires. preselect opens with a generator (+ file scope) already chosen, and
// widget generation carries the checked code paths (the studio context) alongside the conversation.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/loki/api/client", () => ({
  unwrapResult: (r: any) => (r?.result ?? r) ?? null, // real impl — components import it from the mocked module
  apiPost: vi.fn(async (url: string) => {
    if (url.endsWith("/notebook/store")) return { notebook: { id: 1 } };
    if (url.endsWith("/notebook/source")) return { sources: [] };
    if (url.endsWith("/notebook/corpus")) return { total_tokens: 0, blocks: [] };
    if (url.endsWith("/codebase/get")) return { nodes: [{ type: "file", path: "src/a.ts" }], file_tokens: null };
    return { ok: true };
  }),
}));
const widgetGenerate = vi.fn(async (..._args: any[]) => ({ kind: "diagram", payload: { diagram: { nodes: [] } } }));
vi.mock("@/loki/api/codebase", () => ({
  widgetGenerate: (...a: any[]) => widgetGenerate(...a),
  widgetSave: vi.fn(async () => ({ notebook_slug: "nb" })),
}));

import { StudioOverlay } from "./studio-overlay";

const conv = { request: "explain auth", response: "auth lives in auth.service.ts" };

describe("StudioOverlay — select then Generate", () => {
  beforeEach(() => widgetGenerate.mockClear());

  it("the gallery leads with the Agents, has no generator cards, and Generate stays gated without a preselect", async () => {
    const onResult = vi.fn();
    render(<StudioOverlay conv={conv} onResult={onResult} onClose={() => {}} />);
    const generate = await screen.findByText("▶ Generate");
    expect((generate as HTMLButtonElement).disabled).toBe(true);
    // Agents first (operator 2026-09-16), the AI generators and antiDocs hidden, antiFlow gone
    const labels = Array.from(document.querySelectorAll("*")).map((n) => n.textContent ?? "");
    expect(labels.some((s) => s === "Claude Code")).toBe(true);
    expect(screen.queryByText("Diagram")).toBeNull();
    expect(screen.queryByText("Import book")).toBeNull();
    expect(screen.queryByText("File review")).toBeNull();
    expect(screen.queryByText("antiFlow")).toBeNull();
    expect(screen.queryByText("Agent (native)")).toBeNull();
    fireEvent.click(screen.getByText("Claude Code"));
    // an agent card hands over to the AGENT CARD (engine · scope · ask) — not a bare pane (2026-09-16)
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ type: "agent-card", engine: "claude-code" }));
    expect(widgetGenerate).not.toHaveBeenCalled();
  });

  it("preselect opens with the generator + file scope + intent prefilled; Generate carries paths", async () => {
    const onResult = vi.fn();
    render(<StudioOverlay conv={conv} onResult={onResult} onClose={() => {}}
      preselect={{ type: "widget", kind: "code", paths: ["src/a.ts"], intent: "show the auth code" }} />);
    expect((await screen.findByText(/widget · code/)).textContent).toContain("1 file scoped");
    expect((screen.getByPlaceholderText(/intent — what should it produce/) as HTMLInputElement).value).toBe("show the auth code");
    expect(widgetGenerate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("▶ Generate"));
    await waitFor(() => expect(widgetGenerate).toHaveBeenCalledTimes(1));
    const call = widgetGenerate.mock.calls[0][0] as any;
    expect(call.name).toBe("code-sample"); // regKind: studio 'code' → producer 'code-sample'
    expect(call.args.paths).toEqual(["src/a.ts"]);
    expect(call.args.request).toBe("show the auth code");
  });
});
