// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { appendContext, contextBlock, readContextDrop, startContextDrag, textOf, CONTEXT_MIME } from "./drag-context";

describe("drag a section to the chat (2026-09-18)", () => {
  it("renders a fenced context block, trims and caps the body", () => {
    const b = contextBlock({ title: " Hotspots ", text: "a   \n\n\n\nb\n" });
    expect(b).toBe("[context · Hotspots]\na\n\nb\n[/context]");
    expect(contextBlock({ title: "x", text: "y".repeat(5000) }).length).toBeLessThan(2450);
  });
  it("reads a DOM node as lines and appends a drop as its own paragraph", () => {
    expect(textOf({ textContent: "  Health  16 \n\n risk 84 \n", innerText: undefined as any })).toBe("Health 16\nrisk 84");
    expect(appendContext("", "B")).toBe("B\n");
    expect(appendContext("hello  \n", "B")).toBe("hello\n\nB\n");
  });
  it("prefers the antiloki context payload, falls back to text/plain, null when empty", () => {
    const dt = (data: Record<string, string>) => ({ dataTransfer: { getData: (k: string) => data[k] ?? "", types: Object.keys(data) } as any });
    expect(readContextDrop(dt({ [CONTEXT_MIME]: JSON.stringify({ title: "T", text: "body" }), "text/plain": "x" }))).toBe("[context · T]\nbody\n[/context]");
    expect(readContextDrop(dt({ "text/plain": "plain" }))).toBe("plain");
    expect(readContextDrop(dt({}))).toBeNull();
  });
});

// THE DRAG GHOST (operator 2026-09-18: "dragging a dashboard item onto the chat should show a preview
// of the dragged item"): startContextDrag builds a card (title + the first lines) and hands it to
// setDragImage; the card leaves the DOM right after, so nothing lingers on the page.
describe("startContextDrag — the payload and the ghost card", () => {
  it("sets both MIME types, asks for a copy, and paints a preview card with the title and the first lines", async () => {
    const set = vi.fn(); const setDragImage = vi.fn();
    const e: any = { dataTransfer: { setData: set, setDragImage, effectAllowed: "" } };
    startContextDrag(e, { title: "Hotspots — churn × mass", text: "one\ntwo\nthree\nfour\nfive\n<b>", kind: "hotspots" });
    expect(set).toHaveBeenCalledWith(CONTEXT_MIME, expect.stringContaining('"kind":"hotspots"'));
    expect(set).toHaveBeenCalledWith("text/plain", expect.stringContaining("[context · Hotspots — churn × mass]"));
    expect(e.dataTransfer.effectAllowed).toBe("copy");
    const ghost = setDragImage.mock.calls[0][0] as HTMLElement;
    expect(ghost.getAttribute("data-testid")).toBe("drag-preview");
    expect(ghost.textContent).toContain("⤵ Hotspots — churn × mass");
    expect(ghost.textContent).toContain("one"); expect(ghost.textContent).toContain("four");
    expect(ghost.textContent).not.toContain("five"); // four lines, no more
    expect(ghost.innerHTML).not.toContain("<b>"); // escaped, never injected
    expect(document.body.contains(ghost)).toBe(true); // attached for the browser to rasterize…
    await new Promise((r) => setTimeout(r, 5));
    expect(document.body.contains(ghost)).toBe(false); // …and gone right after
  });
  it("survives a dataTransfer without setDragImage (synthetic events) and leaves no card behind", () => {
    const e: any = { dataTransfer: { setData: vi.fn(), effectAllowed: "" } };
    expect(() => startContextDrag(e, { title: "t", text: "x", kind: "k" })).not.toThrow();
    expect(document.querySelector('[data-testid="drag-preview"]')).toBeNull();
  });
});
