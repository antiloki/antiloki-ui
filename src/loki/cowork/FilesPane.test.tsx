import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
const listing = (path: string, entries: any[], parent: string | null) => ({ ok: true, path, parent, home: "/home/u", entries, more: false, private: false, places: [{ name: "Home", path: "/home/u" }, { name: "Computer", path: "/" }] });
const fs: Record<string, any> = { "/home/u": listing("/home/u", [{ name: "docs", kind: "dir", link: false, size: null, mtime: 1700000000000, hidden: false }, { name: "a.txt", kind: "file", link: false, size: 2048, mtime: 1700000000000, hidden: false }, { name: ".secret", kind: "file", link: false, size: 3, mtime: null, hidden: true }], "/home"), "/home/u/docs": listing("/home/u/docs", [], "/home/u") };
vi.mock("./api", () => ({ listFolder: async (p: string) => fs[p || "/home/u"] ?? { ok: false, error: "cannot open" }, lookAtFile: async (p: string) => ({ ok: true, kind: "text", text: `contents of ${p}`, size: 2048 }) }));
import { FilesPane, crumbs, fmtSize } from "./FilesPane";
import { FileView, mediaOf, rawUrl } from "./FileView";
import { FILE_DRAG, draggedPath, startFileDrag } from "./file-drag";

afterEach(() => cleanup());
describe("the files pane", () => {
  it("formats sizes and breaks a path into steps", () => { expect(fmtSize(512)).toBe("512 B"); expect(fmtSize(2048)).toBe("2.0 KB"); expect(fmtSize(5 * 1048576)).toBe("5.0 MB"); expect(crumbs("/home/u/dev").map((c) => c.path)).toEqual(["/", "/home", "/home/u", "/home/u/dev"]); });
  it("opens on home, hides hidden files until asked, enters a folder, previews a file and goes back up", async () => {
    render(<FilesPane />); await waitFor(() => expect(screen.getByTestId("file-docs")).toBeTruthy()); expect(screen.queryByTestId("file-.secret")).toBeNull(); fireEvent.click(screen.getByTestId("files-hidden")); expect(screen.getByTestId("file-.secret")).toBeTruthy();
    fireEvent.click(screen.getByTestId("file-a.txt")); await waitFor(() => expect(screen.getByTestId("file-text").textContent).toContain("contents of /home/u/a.txt")); fireEvent.click(screen.getByTestId("file-back")); expect(screen.queryByTestId("file-view")).toBeNull();
    fireEvent.click(screen.getByTestId("file-docs")); await waitFor(() => expect(screen.getByTestId("files-empty")).toBeTruthy()); expect((screen.getByTestId("files-path") as HTMLInputElement).value).toBe("/home/u/docs");
    fireEvent.click(screen.getByTestId("files-up")); await waitFor(() => expect(screen.getByTestId("file-a.txt")).toBeTruthy());
  });
  it("filters the folder and shows the serve's reason when a folder cannot be opened", async () => {
    render(<FilesPane />); await waitFor(() => expect(screen.getByTestId("file-docs")).toBeTruthy()); fireEvent.change(screen.getByTestId("files-filter"), { target: { value: "a.t" } }); expect(screen.queryByTestId("file-docs")).toBeNull(); expect(screen.getByTestId("file-a.txt")).toBeTruthy();
    fireEvent.change(screen.getByTestId("files-path"), { target: { value: "/nope" } }); fireEvent.keyDown(screen.getByTestId("files-path"), { key: "Enter" }); await waitFor(() => expect(screen.getByTestId("files-error").textContent).toContain("cannot open"));
  });
});

describe("opening and dragging a file", () => {
  it("knows pictures, sound and video by their ending, and reads the rest as text", () => { expect([mediaOf("/a/B.PNG"), mediaOf("/a/s.flac"), mediaOf("/a/m.webm"), mediaOf("/a/n.md"), mediaOf("/a/x.svg")]).toEqual(["image", "audio", "video", null, null]); });
  it("plays a song and a film straight from the serve, and says when it cannot", () => {
    const a = render(<FileView path="/h/a b.mp3" size="" onBack={() => {}} />); expect(screen.getByTestId("file-audio").getAttribute("src")).toBe(rawUrl("/h/a b.mp3")); fireEvent.error(screen.getByTestId("file-audio")); expect(screen.getByTestId("file-broken")).toBeTruthy(); a.unmount();
    const v = render(<FileView path="/h/m.mp4" size="" onBack={() => {}} />); expect(screen.getByTestId("file-video")).toBeTruthy(); v.unmount();
  });
  it("comes back where it was when the screen rebuilds it", async () => {
    const a = render(<FilesPane id="f1" />); await waitFor(() => expect(screen.getByTestId("file-docs")).toBeTruthy()); fireEvent.click(screen.getByTestId("file-a.txt")); a.unmount();
    render(<FilesPane id="f1" />); await waitFor(() => expect(screen.getByTestId("file-text").textContent).toContain("a.txt"));
  });
  it("a dragged row carries the whole path as its own kind of drag", async () => {
    const kept: Record<string, string> = {}; const dt = { setData: (k: string, v: string) => { kept[k] = v; }, getData: (k: string) => kept[k] ?? "", get types() { return Object.keys(kept); }, effectAllowed: "" } as unknown as DataTransfer;
    render(<FilesPane />); await waitFor(() => expect(screen.getByTestId("file-a.txt")).toBeTruthy()); fireEvent.dragStart(screen.getByTestId("file-a.txt"), { dataTransfer: dt });
    expect(kept[FILE_DRAG]).toBe("/home/u/a.txt"); expect(draggedPath(dt)).toBe("/home/u/a.txt"); startFileDrag(dt, "/x"); expect(draggedPath(dt)).toBe("/x");
  });
});
