// Export is the one feature whose output the operator keeps after the app is closed, so its
// failures are permanent: a PDF that prints black-on-white because the theme variables never made it
// into the print window (a real 2026-07-23 report), a Markdown file that silently loses a diagram,
// or a pop-up blocker eating the print window with no explanation. Each of those is pinned here.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { exportView, ExportButtons } from "./export-view";

// Capture downloads instead of writing them: remember the blob's text, type and filename.
const downloads: Array<{ name: string; type: string; text: string }> = [];
let lastBlob: Blob | null = null;

const setupDownloadCapture = () => {
  downloads.length = 0;
  lastBlob = null;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (b: Blob) => { lastBlob = b; return "blob:mock"; },
    revokeObjectURL: vi.fn(),
  });
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, type: lastBlob?.type ?? "", text: (lastBlob as any)?.__text ?? "" });
  };
  return () => { HTMLAnchorElement.prototype.click = realClick; };
};

// jsdom Blob can't be read synchronously; stash the text on the instance at construction.
const RealBlob = globalThis.Blob;
class TextBlob extends RealBlob {
  __text: string;
  constructor(parts: any[], opts?: BlobPropertyBag) { super(parts, opts); this.__text = parts.join(""); }
}

let restoreClick: () => void;
const alertMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("Blob", TextBlob as any);
  restoreClick = setupDownloadCapture();
  alertMock.mockReset();
  vi.stubGlobal("alert", alertMock);
  document.body.innerHTML = "";
});
afterEach(() => { restoreClick(); vi.unstubAllGlobals(); });

const panel = (html: string, text?: string): HTMLElement => {
  const d = document.createElement("div");
  d.innerHTML = html;
  Object.defineProperty(d, "innerText", { configurable: true, value: text ?? d.textContent ?? "" });
  document.body.appendChild(d);
  return d;
};

describe("markdown export", () => {
  it("writes a titled, dated document containing the panel's text", () => {
    exportView(panel("<p>hello world</p>"), "Coverage Panel", "md");
    const [d] = downloads;
    expect(d.name).toBe("Coverage_Panel.md");
    expect(d.type).toContain("text/markdown");
    expect(d.text).toContain("# Coverage Panel");
    expect(d.text).toMatch(/_exported \d{4}-\d{2}-\d{2}_/);
    expect(d.text).toContain("hello world");
  });

  it("warns that a diagram was left behind rather than exporting a doc that quietly lost it", () => {
    exportView(panel("<svg></svg><p>chart</p>"), "Graph", "md");
    expect(downloads[0].text).toContain("export as PDF to capture the visual");
  });

  it("says nothing about diagrams when there are none", () => {
    exportView(panel("<p>text only</p>"), "Plain", "md");
    expect(downloads[0].text).not.toContain("export as PDF to capture");
  });

  it("collapses the blank runs a rendered panel leaves in its text", () => {
    exportView(panel("<p>x</p>", "a\n\n\n\nb   \nc"), "T", "md");
    expect(downloads[0].text).not.toMatch(/\n{3}/);
  });

  it("makes a filesystem-safe name out of any title", () => {
    exportView(panel("<p>x</p>"), "src/loki: review (v2)!", "md");
    expect(downloads[0].name).toBe("src_loki_review_v2.md");
  });

  it("falls back to a generic name when the title has nothing usable left", () => {
    exportView(panel("<p>x</p>"), "///", "md");
    expect(downloads[0].name).toBe("export.md");
  });

  it("caps a runaway title instead of producing an unopenable filename", () => {
    exportView(panel("<p>x</p>"), "a".repeat(200), "md");
    expect(downloads[0].name.length).toBeLessThanOrEqual(84);
  });
});

describe("standalone HTML export", () => {
  const html = () => downloads[0].text;

  it("carries the panel's own markup, inline styles and SVGs included", () => {
    exportView(panel(`<div style="color:red">kept</div><svg><circle/></svg>`), "Panel", "html");
    expect(html()).toContain(`style="color:red"`);
    expect(html()).toContain("<svg>");
    expect(downloads[0].name).toBe("Panel.html");
  });

  it("carries the theme class so the baked variables resolve the same way they do on screen", () => {
    document.documentElement.setAttribute("class", "theme-dark");
    exportView(panel("<p>x</p>"), "Panel", "html");
    expect(html()).toContain(`<html class="theme-dark">`);
  });

  it("forces colour printing on every element — this is what stopped PDFs coming out black and white", () => {
    exportView(panel("<p>x</p>"), "Panel", "html");
    expect(html()).toContain("print-color-adjust:exact !important");
    expect(html()).toContain("*{");
  });

  it("unclips panels that scroll on screen so nothing is cut off on the page", () => {
    exportView(panel("<p>x</p>"), "Panel", "html");
    expect(html()).toContain("overflow:visible !important");
    expect(html()).toContain("max-height:none !important");
    expect(html()).toContain(".exp-root");
  });

  it("escapes the title everywhere it is interpolated", () => {
    exportView(panel("<p>x</p>"), `<script>alert(1)</script>`, "html");
    expect(html()).not.toContain("<script>alert(1)</script>");
    expect(html()).toContain("&lt;script&gt;");
  });

  it("still produces a readable document when the theme defines no variables", () => {
    exportView(panel("<p>x</p>"), "Panel", "html");
    expect(html()).toMatch(/html,body\{margin:0;padding:0;background:[^;]+;color:[^}]+\}/);
  });
});

describe("PDF export goes through a print window", () => {
  it("opens a window, writes the same standalone document into it and asks it to print", () => {
    vi.useFakeTimers();
    const w = { document: { write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn() };
    vi.stubGlobal("open", vi.fn(() => w));

    exportView(panel(`<div style="color:red">printed</div>`), "Panel", "pdf");
    expect(w.document.write).toHaveBeenCalledOnce();
    const doc = w.document.write.mock.calls[0][0];
    expect(doc).toContain("printed");
    expect(doc).toContain("print-color-adjust:exact !important");
    expect(w.document.close).toHaveBeenCalled();
    expect(w.print).not.toHaveBeenCalled();      // not before the document has settled

    vi.advanceTimersByTime(600);
    expect(w.print).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("tells the operator when a pop-up blocker ate the print window", () => {
    vi.stubGlobal("open", vi.fn(() => null));
    exportView(panel("<p>x</p>"), "Panel", "pdf");
    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("pop-ups"));
  });

  it("does not throw when the print call itself fails", () => {
    vi.useFakeTimers();
    const w = { document: { write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: () => { throw new Error("blocked"); } };
    vi.stubGlobal("open", vi.fn(() => w));
    exportView(panel("<p>x</p>"), "Panel", "pdf");
    expect(() => vi.advanceTimersByTime(600)).not.toThrow();
    vi.useRealTimers();
  });
});

describe("exporting nothing", () => {
  it("explains instead of downloading an empty file", () => {
    for (const fmt of ["md", "html", "pdf"] as const) {
      exportView(null, "Panel", fmt);
    }
    expect(alertMock).toHaveBeenCalledTimes(3);
    expect(alertMock.mock.calls[0][0]).toContain("Nothing to export");
    expect(downloads).toHaveLength(0);
  });
});

describe("ExportButtons", () => {
  it("offers all three formats and labels what each does", () => {
    render(<ExportButtons getNode={() => null} title="T" />);
    for (const label of ["md", "html", "pdf"]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("md").getAttribute("title")).toContain("Markdown");
    expect(screen.getByText("pdf").getAttribute("title")).toContain("PDF");
  });

  it("reads the node at CLICK time, so it always exports what is on screen now", () => {
    const getNode = vi.fn(() => panel("<p>current</p>"));
    render(<ExportButtons getNode={getNode} title="T" />);
    expect(getNode).not.toHaveBeenCalled();      // not at render time
    fireEvent.click(screen.getByText("md"));
    expect(getNode).toHaveBeenCalledTimes(1);
    expect(downloads[0].text).toContain("current");
  });

  it("each button exports its own format", () => {
    vi.stubGlobal("open", vi.fn(() => null));
    render(<ExportButtons getNode={() => panel("<p>x</p>")} title="T" />);
    fireEvent.click(screen.getByText("md"));
    fireEvent.click(screen.getByText("html"));
    expect(downloads.map((d) => d.name)).toEqual(["T.md", "T.html"]);
    fireEvent.click(screen.getByText("pdf"));
    expect(downloads).toHaveLength(2);            // pdf prints, it does not download
  });
});
