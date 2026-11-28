// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
const api = vi.hoisted(() => ({ getArtifact: vi.fn(), mediaUrl: (r: string, f: string) => `http://x/media?run=${r}&file=${f}`, listArtifacts: vi.fn(), listMedia: vi.fn(), getResult: vi.fn() }));
vi.mock("./api", () => api); vi.mock("@/loki/api/client", () => ({ BE_URL: "http://be" }));
import { NodePreview, artifactOf, artifactPreview, csvRows, excerpt, mediaByNode, mediaPreviews, notesAsList, parseBundle, prettyText } from "./NodePreview";
import { previewItems, previewSpots } from "./AgentGraph";

describe("mini previews on the graph", () => {
  afterEach(() => cleanup());
  it("says what each output is shown as, takes the first lines of a report, and keeps pictures and videos for Deliver", () => {
    expect(artifactPreview({ name: "frames", format: "html" })).toMatchObject({ kind: "page", artifact: "frames.html" }); expect(artifactPreview({ name: "r", format: "md" })?.kind).toBe("text"); expect(artifactPreview({ name: "x", format: "exe" })).toBeNull();
    expect(excerpt("# Title\n\n> quoted line\n- item one\n" + "x".repeat(60), 3, 12)).toEqual(["Title", "quoted line", "item one"]);
    expect(mediaPreviews([{ file: "a.mp4", name: "a", path: "", kind: "video", bytes: 1 }, { file: "b.txt", name: "b", path: "", kind: "file", bytes: 1 }, { file: "c.png", name: "c", path: "", kind: "image", bytes: 1 }]).map((m) => m.kind)).toEqual(["video", "image"]);
    expect(artifactOf([{ name: "frames.html", format: "html", bytes: 1, node: "d", kind: "draft", t_ms: 1 }, { name: "frames.html", format: "html", bytes: 1, node: null, kind: "made", t_ms: 2 }], { name: "frames", format: "html" })?.kind).toBe("made");
  });
  it("puts a box beside its node on the side away from the Leader, never over another node or preview, inside the drawing", () => {
    const pos: any = { leader: { x: 450, y: 280, kind: "hub" }, doc: { x: 700, y: 200, kind: "tool" }, near: { x: 790, y: 215, kind: "agent" } }; const src: any = { kind: "page", title: "t" };
    const s = previewSpots(pos, [{ id: "doc", src }, { id: "doc", src }, { id: "nope", src }], 900, 560); expect(s).toHaveLength(2); expect(s[0].key).toBe("pv:doc:0");
    const overlap = (a: { x: number; y: number }, b: { x: number; y: number }, hw: number, hh: number) => Math.abs(a.x - b.x) < hw && Math.abs(a.y - b.y) < hh;
    for (const v of s) { expect(v.x - 66).toBeGreaterThanOrEqual(0); expect(v.x + 66).toBeLessThanOrEqual(900); expect(v.y - 43).toBeGreaterThanOrEqual(0); expect(v.y + 43).toBeLessThanOrEqual(560); for (const p of Object.values<any>(pos)) expect(overlap(v, p, 66 + 50, 43 + 30)).toBe(false); }
    expect(overlap(s[0], s[1], 132, 86)).toBe(false);
  });
  it("draws a page as a scaled frame with no scripts, and opens it in the glass window on a click", async () => {
    api.getArtifact.mockResolvedValue({ ok: true, text: "<html><body>design</body></html>" });
    render(<NodePreview run="r1" id="frames_doc" src={{ kind: "page", title: "frames", artifact: "frames.html" }} />);
    const f = await waitFor(() => screen.getByTestId("preview-page") as HTMLIFrameElement); expect(f.getAttribute("sandbox")).toBe(""); expect(f.getAttribute("srcdoc")).toContain("design");
    fireEvent.click(screen.getByTestId("ag-preview-frames_doc")); await waitFor(() => screen.getByTestId("glass-view")); expect(screen.getByTestId("preview-page-big").getAttribute("sandbox")).toBe("");
  });
  it("a picture or video preview is not draggable by the browser itself, so the box can be dragged on the graph", () => {
    render(<><NodePreview run="r1" id="a" src={{ kind: "image", title: "shot", file: "a.png" }} /><NodePreview run="r1" id="b" src={{ kind: "video", title: "clip", file: "a.mp4" }} /></>);
    const img = screen.getByTestId("preview-image") as HTMLImageElement; expect(img.getAttribute("draggable")).toBe("false"); expect(img.style.pointerEvents).toBe("none"); expect((screen.getByTestId("preview-video") as HTMLVideoElement).style.pointerEvents).toBe("none");
  });
  it("gives a picture to the node whose outputs name it (the capture's screenshots), and the rest to Deliver", () => {
    const m = (path: string, kind: "image" | "video" = "image") => ({ file: `kept/${path}`, name: path.split("/").pop()!, path, kind, bytes: 1 });
    const { byNode, rest } = mediaByNode([m("browse/a-1440.png"), m("browse/b-390.png"), m("video/out/video.mp4", "video")], { capture: { count: 2, shots: ["/w/run/browse/a-1440.png", "/w/run/browse/b-390.png"] }, director: { text: "done" }, _integrated: true });
    expect(byNode.capture?.map((x) => x.name)).toEqual(["a-1440.png", "b-390.png"]); expect(rest.map((x) => x.name)).toEqual(["video.mp4"]); expect(mediaByNode([], null)).toEqual({ byNode: {}, rest: [] });
  });
  it("shows the final result on Deliver: the finished document wired into it, and the pictures no node names", () => {
    const g: any = { nodes: { capture: { node: "use_tool" }, code_doc: { node: "artifact", name: "pane-code", format: "txt", from: "coder" }, deliver: { node: "deliver" } }, edges: [{ from: "code_doc", port: "out", to: "deliver" }] };
    const arts: any = [{ name: "pane-code.txt", format: "txt", bytes: 1, node: null, kind: "made", t_ms: 1 }];
    const items = previewItems(g, arts, [{ file: "k/x.png", name: "x.png", path: "browse/x.png", kind: "image", bytes: 1 }, { file: "k/v.mp4", name: "v.mp4", path: "out/v.mp4", kind: "video", bytes: 1 }], { capture: { shots: ["/r/browse/x.png"] } });
    expect(items.filter((i) => i.id === "deliver").map((i) => i.src.title)).toEqual(["pane-code", "v.mp4"]); expect(items.filter((i) => i.id === "code_doc")).toHaveLength(1); expect(items.filter((i) => i.id === "capture").map((i) => i.src.title)).toEqual(["x.png"]);
  });
  it("draws a document as what it is: markdown rendered (headings and lists), JSON indented, CSV as rows", async () => {
    expect(prettyText('{"a":1,"b":[2]}', "json")).toBe('{\n  "a": 1,\n  "b": [\n    2\n  ]\n}'); expect(prettyText("not json", "json")).toBe("not json"); expect(csvRows('a,b\n"x, y",2\n"say ""hi""",3')).toEqual([["a", "b"], ["x, y", "2"], ['say "hi"', "3"]]);
    api.getArtifact.mockResolvedValue({ ok: true, text: "# Report\n\n- first point\n- second point\n\n| a | b |\n|---|---|\n| 1 | 2 |" });
    render(<NodePreview run="r1" id="rep" src={{ kind: "text", title: "report", artifact: "report.md", format: "md" }} />);
    const mini = await waitFor(() => screen.getByTestId("preview-doc")); expect(mini.querySelector("h1")?.textContent).toBe("Report"); expect(mini.querySelectorAll("li").length).toBe(2);
    fireEvent.click(screen.getByTestId("ag-preview-rep")); const big = await waitFor(() => screen.getByTestId("preview-doc-big")); expect(big.querySelector("h1")?.textContent).toBe("Report"); expect(big.querySelector("table")).toBeTruthy();
  });
  it("splits a bundle of files into its notes and files, and draws each file on its own with its name, line numbers and a Copy button", async () => {
    const text = "NOTES\n\n- Target: the frames\n- Kept: every testid\n\n=== reference/LinearPane.tsx ===\nimport * as React from \"react\";\nexport function A() { return null; }\n\n=== reference/linear.ts ===\nexport const x = 1;\n";
    const b = parseBundle(text)!; expect(b.files.map((f) => f.path)).toEqual(["reference/LinearPane.tsx", "reference/linear.ts"]); expect(b.notes).toContain("Target: the frames"); expect(b.files[0].code.split("\n")).toHaveLength(2); expect(parseBundle("just text")).toBeNull();
    api.getArtifact.mockResolvedValue({ ok: true, text });
    render(<NodePreview run="r1" id="pc" src={{ kind: "text", title: "pane-code", artifact: "pane-code.txt", format: "txt" }} />);
    await waitFor(() => screen.getByTestId("preview-doc")); fireEvent.click(screen.getByTestId("ag-preview-pc")); const big = await waitFor(() => screen.getByTestId("preview-doc-big"));
    expect(big.querySelectorAll("[data-testid=bundle-file]").length).toBe(2); expect(big.querySelectorAll("li").length).toBe(2); expect(big.textContent).toContain("reference/LinearPane.tsx"); expect(big.querySelector("[data-testid=bundle-copy]")).toBeTruthy();
  });
  it("lists lettered sub-points on their own lines", () => { expect(notesAsList("- Could not match:\n  (a) the title\n  (b) the hero\nplain")).toBe("- Could not match:\n- (a) the title\n- (b) the hero\nplain"); });
  it("Deliver shows the master page of the Result and files tab when the run has one", async () => {
    const g: any = { nodes: { code_doc: { node: "artifact", name: "pane-code", format: "txt" }, deliver: { node: "deliver" } }, edges: [{ from: "code_doc", port: "out", to: "deliver" }] };
    const arts: any = [{ name: "pane-code.txt", format: "txt", bytes: 1, node: null, kind: "made", t_ms: 1 }];
    expect(previewItems(g, arts, [], null, true).filter((i) => i.id === "deliver")).toEqual([{ id: "deliver", src: { kind: "page", title: "Result", result: true } }]);
    api.getResult.mockResolvedValue({ ok: true, text: "<html><body>master page</body></html>" });
    render(<NodePreview run="r1" id="deliver_0" src={{ kind: "page", title: "Result", result: true }} />);
    const f = await waitFor(() => screen.getByTestId("preview-page") as HTMLIFrameElement); expect(f.getAttribute("srcdoc")).toContain("master page"); expect(f.getAttribute("sandbox")).toBe("allow-scripts");
  });
  it("long notes start closed with a button to read them all", async () => {
    const long = "NOTES\n\n" + Array.from({ length: 30 }, (_, i) => `- point number ${i} with some words in it`).join("\n") + "\n\n=== a.ts ===\nconst a = 1;\n";
    api.getArtifact.mockResolvedValue({ ok: true, text: long });
    render(<NodePreview run="r1" id="pc2" src={{ kind: "text", title: "pane-code", artifact: "pane-code.txt", format: "txt" }} />);
    await waitFor(() => screen.getByTestId("preview-doc")); fireEvent.click(screen.getByTestId("ag-preview-pc2")); const big = await waitFor(() => screen.getByTestId("preview-doc-big")); const c = () => big.querySelector("[data-testid=collapsible]")!;
    expect(c().getAttribute("data-open")).toBe("0"); fireEvent.click(big.querySelector("[data-testid=collapsible-toggle]")!); expect(c().getAttribute("data-open")).toBe("1");
  });
  it("a leftover picture of an earlier run, beside the files a node names, is not shown on Deliver", () => {
    const m = (path: string, kind: "image" | "video" = "image") => ({ file: `kept/${path}`, name: path.split("/").pop()!, path, kind, bytes: 1 });
    const { byNode, rest } = mediaByNode([m("browse/notion-1440.png"), m("browse/linear-old-1440.png"), m("video/out/video.mp4", "video")], { capture: { shots: ["/w/run/browse/notion-1440.png"] } });
    expect(byNode.capture?.map((x) => x.name)).toEqual(["notion-1440.png"]); expect(rest.map((x) => x.name)).toEqual(["video.mp4"]);
  });
});
