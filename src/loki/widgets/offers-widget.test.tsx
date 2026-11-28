// THE RESPONSE ACTION ROW under each reply. Trimmed 2026-07-26 (operator: "take out Add to
// notebook, propose and diagram this") — this file was rewritten 2026-08-13 because it still
// asserted those three removed affordances and had been failing ever since.
//
// The row's live contract: ✂ Simplify · ⤢ Expand · ⧉ Copy, plus ⊞ SUGGESTION buttons for the
// studio-generable offer kinds only. A suggestion OPENS the Studio preselected and must never
// generate by itself — generation costs money, so "one click = one charge" would be a real defect.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/loki/api/client", () => ({
  unwrapResult: (r: any) => (r?.result ?? r) ?? null, // real impl — components import it from the mocked module
  apiPost: vi.fn(async (url: string) => {
    if (url.endsWith("/notebook/store")) return { notebook: { id: 1 } };
    if (url.endsWith("/notebook/source")) return { sources: [] };
    if (url.endsWith("/notebook/corpus")) return { total_tokens: 0, blocks: [] };
    if (url.endsWith("/codebase/get")) return { nodes: [], file_tokens: null };
    return { ok: true };
  }),
}));
const widgetGenerate = vi.fn(async (..._args: any[]) => ({ kind: "diagram", payload: { diagram: null } }));
vi.mock("@/loki/api/codebase", () => ({
  widgetGenerate: (...a: any[]) => widgetGenerate(...a),
  widgetSave: vi.fn(async () => ({ notebook_slug: "nb" })),
}));

import { OffersWidget } from "./offers-widget";

const reply = "Auth lives in auth.service.ts.";
const context = { request: "how does auth work", response: reply };
const ctx = (over: any = {}) => ({ turnId: 7, onRewrite: vi.fn(), rewriteBusy: null, shownReply: reply, ...over });

// Block bodies: a concise arrow returning a Mock would be registered as a vitest teardown hook.
beforeEach(() => { widgetGenerate.mockClear(); });

describe("the row's buttons", () => {
  it("renders exactly Simplify · Expand · Copy when there are no studio-generable offers", () => {
    render(<OffersWidget payload={{ offers: [{ kind: "diagram", label: "Diagram" }, { kind: "table", label: "Table" }], context }} ctx={ctx()} />);
    expect(screen.getByText("✂ Simplify")).toBeTruthy();
    expect(screen.getByText("⤢ Expand")).toBeTruthy();
    expect(screen.getByText("⧉ Copy")).toBeTruthy();
    // Neither offer kind maps to a Studio generator, so neither gets a suggestion button.
    expect(screen.queryByText("⊞ Diagram")).toBeNull();
    expect(screen.queryByText("⊞ Table")).toBeNull();
  });

  it("does NOT render the three affordances the operator removed on 2026-07-26", () => {
    render(<OffersWidget payload={{ offers: [], context }} ctx={ctx()} />);
    expect(screen.queryByText("◇ Propose")).toBeNull();
    expect(screen.queryByText("+ Add to notebook")).toBeNull();
    expect(screen.queryByText("⊞ Studio")).toBeNull(); // the bare link moved to the composer
  });

  it("renders a ⊞ suggestion for each studio-generable offer kind", () => {
    render(
      <OffersWidget
        payload={{ offers: [{ kind: "code", label: "Sample" }, { kind: "improvements", label: "Improve" }, { kind: "logic-spec", label: "Logic" }], context }}
        ctx={ctx()}
      />,
    );
    expect(screen.getByText("⊞ Sample")).toBeTruthy();
    expect(screen.getByText("⊞ Improve")).toBeTruthy();
    expect(screen.getByText("⊞ Logic")).toBeTruthy();
  });

  it("DEDUPES by studio generator — two offers of one kind give one button", () => {
    render(<OffersWidget payload={{ offers: [{ kind: "code", label: "First" }, { kind: "code", label: "Second" }], context }} ctx={ctx()} />);
    expect(screen.getByText("⊞ First")).toBeTruthy();
    expect(screen.queryByText("⊞ Second")).toBeNull();
  });

  it("falls back to the offer kind when it carries no label", () => {
    render(<OffersWidget payload={{ offers: [{ kind: "code" }], context }} ctx={ctx()} />);
    expect(screen.getByText("⊞ code")).toBeTruthy();
  });

  it("survives a malformed or absent offers list", () => {
    expect(() => render(<OffersWidget payload={{ offers: "not an array", context }} ctx={ctx()} />)).not.toThrow();
    expect(() => render(<OffersWidget payload={{ context }} ctx={ctx()} />)).not.toThrow();
    expect(() => render(<OffersWidget payload={{}} ctx={ctx()} />)).not.toThrow();
  });
});

describe("rewrite", () => {
  it("hands the turn id and the operation to the thread", () => {
    const onRewrite = vi.fn();
    render(<OffersWidget payload={{ offers: [], context }} ctx={ctx({ onRewrite })} />);
    fireEvent.click(screen.getByText("✂ Simplify"));
    expect(onRewrite).toHaveBeenCalledWith(7, "simplify");
    fireEvent.click(screen.getByText("⤢ Expand"));
    expect(onRewrite).toHaveBeenCalledWith(7, "expand");
  });

  it("shows which operation is running and blocks a second click while it is", () => {
    const onRewrite = vi.fn();
    render(<OffersWidget payload={{ offers: [], context }} ctx={ctx({ onRewrite, rewriteBusy: "7:simplify" })} />);
    expect(screen.getByText("✂ simplifying…")).toBeTruthy();
    fireEvent.click(screen.getByText("✂ simplifying…"));
    fireEvent.click(screen.getByText("⤢ Expand"));
    expect(onRewrite).not.toHaveBeenCalled();
  });

  it("is disabled when the turn has no id, no handler, or no reply to rewrite", () => {
    for (const over of [{ turnId: null }, { onRewrite: undefined }]) {
      const onRewrite = vi.fn();
      const { unmount } = render(<OffersWidget payload={{ offers: [], context }} ctx={ctx({ onRewrite, ...over })} />);
      fireEvent.click(screen.getByText("✂ Simplify"));
      expect(onRewrite).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("another turn's in-flight rewrite does not label THIS turn as busy", () => {
    render(<OffersWidget payload={{ offers: [], context }} ctx={ctx({ rewriteBusy: "99:simplify" })} />);
    expect(screen.getByText("✂ Simplify")).toBeTruthy();
  });
});

describe("copy", () => {
  it("copies the reply AS SHOWN, so a rewritten reply copies the rewrite", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<OffersWidget payload={{ offers: [], context }} ctx={ctx({ shownReply: "the SIMPLIFIED reply" })} />);
    fireEvent.click(screen.getByText("⧉ Copy"));
    expect(writeText).toHaveBeenCalledWith("the SIMPLIFIED reply");
    expect(await screen.findByText("✓ copied")).toBeTruthy();
  });

  it("falls back to the persisted response when the thread published no shown reply", () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<OffersWidget payload={{ offers: [], context }} ctx={ctx({ shownReply: undefined })} />);
    fireEvent.click(screen.getByText("⧉ Copy"));
    expect(writeText).toHaveBeenCalledWith(reply);
  });

  it("does not crash when the clipboard API is unavailable", () => {
    Object.assign(navigator, { clipboard: undefined });
    render(<OffersWidget payload={{ offers: [], context }} ctx={ctx()} />);
    expect(() => fireEvent.click(screen.getByText("⧉ Copy"))).not.toThrow();
  });
});

describe("a suggestion opens the Studio — it never generates", () => {
  it("opens the Studio with that generator preselected and calls NOTHING", async () => {
    // The load-bearing assertion is the last one: generation costs money, so a suggestion click
    // must only ever open the window.
    render(<OffersWidget payload={{ offers: [{ kind: "code", label: "Sample", args: { query: "how does auth work" } }], context }} ctx={ctx()} />);
    fireEvent.click(screen.getByText("⊞ Sample"));
    expect(await screen.findByText("⊞ Studio")).toBeTruthy();
    expect((await screen.findByText(/widget · code/)).textContent).toContain("code");
    expect(widgetGenerate).not.toHaveBeenCalled();
  });

  it("carries the offer's query through as the Studio's intent prefill", async () => {
    render(<OffersWidget payload={{ offers: [{ kind: "code", label: "Sample", args: { query: "how does auth work" } }], context }} ctx={ctx()} />);
    fireEvent.click(screen.getByText("⊞ Sample"));
    expect(await screen.findByDisplayValue("how does auth work")).toBeTruthy();
  });
});
