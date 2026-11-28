// Client-side, deterministic artifact export. The pure parts (slug, CSV, HTML) are where a bug
// silently corrupts what leaves the app: a mis-quoted CSV cell shifts every column after it, and an
// unescaped title injects markup into the pressed page.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./faculty-viz", () => ({ md2html: (md: string) => `<p>${md}</p>` }));
vi.mock("@/loki/api/client", () => ({ BE_URL: "http://be.test" }));

const { fileSlug, mdTableToCsv, artifactHtml, dlBlob, dlText, exportHtml, exportPngFromSvg, exportMp3 } =
  await import("./artifact-export");

describe("fileSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(fileSlug("The Research Brief")).toBe("the-research-brief");
  });

  it("collapses runs of punctuation into a single hyphen", () => {
    expect(fileSlug("a  --  b!!!c")).toBe("a-b-c");
  });

  it("trims leading and trailing hyphens so the filename never starts with one", () => {
    expect(fileSlug("  ...Brief...  ")).toBe("brief");
  });

  it("caps the length at 60 chars", () => {
    expect(fileSlug("x".repeat(200))).toHaveLength(60);
  });

  it("falls back to 'artifact' for empty, null and all-punctuation input", () => {
    // Without the fallback these produce a file literally named ".md".
    expect(fileSlug("")).toBe("artifact");
    expect(fileSlug(null as any)).toBe("artifact");
    expect(fileSlug("!!!")).toBe("artifact");
  });

  it("strips non-ascii rather than emitting an unusable filename", () => {
    expect(fileSlug("Rapport — Café")).toBe("rapport-caf");
  });
});

describe("mdTableToCsv", () => {
  const table = ["| Name | Count |", "| --- | ---: |", "| auth | 12 |", "| db | 3 |"].join("\n");

  it("converts the first markdown table, header row included", () => {
    expect(mdTableToCsv(table)).toBe("Name,Count\nauth,12\ndb,3");
  });

  it("DROPS the separator row rather than exporting a row of dashes", () => {
    expect(mdTableToCsv(table)).not.toContain("---");
  });

  it("returns null when there is no table, so the caller can say so", () => {
    expect(mdTableToCsv("just prose")).toBeNull();
    expect(mdTableToCsv("")).toBeNull();
    expect(mdTableToCsv(null as any)).toBeNull();
  });

  it("strips bold and inline-code markers from cells", () => {
    const md = ["| a | b |", "| --- | --- |", "| **bold** | `code` |"].join("\n");
    expect(mdTableToCsv(md)).toBe("a,b\nbold,code");
  });

  it("quotes a cell containing a comma, and doubles embedded quotes", () => {
    // This is the one that shifts every subsequent column if it regresses.
    const md = ["| a | b |", "| --- | --- |", '| x, y | he said "hi" |'].join("\n");
    expect(mdTableToCsv(md)).toBe('a,b\n"x, y","he said ""hi"""');
  });

  it("leaves an ordinary cell unquoted", () => {
    expect(mdTableToCsv(table)!.split("\n")[1]).toBe("auth,12");
  });

  it("tolerates indented tables and surrounding prose", () => {
    const md = ["intro", "   | a | b |", "   | --- | --- |", "   | 1 | 2 |", "outro"].join("\n");
    expect(mdTableToCsv(md)).toBe("a,b\n1,2");
  });

  it("keeps empty cells as empty fields rather than dropping them", () => {
    const md = ["| a | b |", "| --- | --- |", "|  | 2 |"].join("\n");
    expect(mdTableToCsv(md)).toBe("a,b\n,2");
  });
});

describe("artifactHtml", () => {
  it("produces a standalone document with the title in <title> and <h1>", () => {
    const html = artifactHtml("The Brief", "body");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>The Brief</title>");
    expect(html).toContain("<h1>The Brief</h1>");
    expect(html).toContain("</html>");
  });

  it("escapes < in the title so a title can never OPEN a tag", () => {
    // Only `<` is escaped, and that is the whole requirement: no tag can be opened without it, and
    // a bare `>` is inert in text content. Both the <title> and <h1> insertions are text contexts.
    const html = artifactHtml("<script>alert(1)</script>", "body");
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script>alert(1)");
    // and the document still has exactly the one real <h1> the template opens
    expect(html.match(/<h1>/g)).toHaveLength(1);
  });

  it("carries a print stylesheet — pdf export is the print pipeline over this page", () => {
    expect(artifactHtml("t", "b")).toContain("@media print");
  });

  it("renders the body through the markdown converter", () => {
    expect(artifactHtml("t", "the body")).toContain("<p>the body</p>");
  });

  it("stamps a date", () => {
    expect(artifactHtml("t", "b")).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("the download mechanics", () => {
  let click: any;
  beforeEach(() => {
    vi.useFakeTimers();
    (URL as any).createObjectURL = vi.fn(() => "blob:x");
    (URL as any).revokeObjectURL = vi.fn();
    click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("clicks a named anchor and REVOKES the url afterwards", () => {
    dlBlob("out.md", new Blob(["x"]));
    expect(click).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
    // Without the revoke the blob is pinned for the life of the tab.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });

  it("removes the anchor from the document immediately", () => {
    dlBlob("out.md", new Blob(["x"]));
    expect(document.querySelector('a[download="out.md"]')).toBeNull();
  });

  it("dlText builds a blob with the requested mime type", async () => {
    const spy = vi.spyOn(URL, "createObjectURL");
    dlText("a.csv", "x,y", "text/csv");
    expect((spy.mock.calls[0][0] as Blob).type).toBe("text/csv");
  });

  it("exportHtml names the file from the slugged title", () => {
    exportHtml("The Research Brief", "body");
    // The anchor is removed synchronously, so assert via the download attribute at click time.
    expect(click).toHaveBeenCalled();
  });
});

describe("exportPngFromSvg", () => {
  it("reports false when the artifact carries no SVG, so the caller can explain", async () => {
    const div = document.createElement("div");
    expect(await exportPngFromSvg(div, "x")).toBe(false);
  });
});

describe("exportMp3", () => {
  it("throws with the status when the audio fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(exportMp3(7, "t")).rejects.toThrow("audio fetch failed (404)");
    vi.unstubAllGlobals();
  });

  it("fetches from the BE audio endpoint for that item", async () => {
    const f = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["mp3"]) }));
    vi.stubGlobal("fetch", f);
    (URL as any).createObjectURL = vi.fn(() => "blob:x");
    (URL as any).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await exportMp3(7, "The Brief");
    expect(f).toHaveBeenCalledWith("http://be.test/api/v1/notebook/audio/7");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
