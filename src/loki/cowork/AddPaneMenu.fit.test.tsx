// @vitest-environment jsdom
// THE MENU NEVER RUNS OFF THE SCREEN (operator 2026-11-23: "the list is huge and cut at the top, it should have columns if needed and never be cut, from agents and panes").
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AddPaneMenu } from "./AddPaneMenu";

const proto = HTMLElement.prototype;
let needCols = 1;
beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true }); Object.defineProperty(window, "innerHeight", { value: 700, configurable: true });
  // jsdom has no layout: pretend the list is too tall until the menu has `needCols` columns
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 500; } });
  Object.defineProperty(proto, "scrollHeight", { configurable: true, get() { return Number((this as HTMLElement).getAttribute("data-cols") || 1) < needCols ? 900 : 400; } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete (proto as any).clientHeight; delete (proto as any).scrollHeight; });
const engines: any[] = Array.from({ length: 4 }, (_, i) => ({ key: `e${i}`, label: `Agent ${i}`, installed: true }));
const menu = () => screen.getByTestId("add-pane-menu");

describe("the new-agent / new-pane list", () => {
  it("one column when it fits", () => {
    needCols = 1;
    render(<AddPaneMenu engines={engines} anchor={{ left: 100, bottom: 60 }} onPick={() => {}} onClose={() => {}} atLimit={null} mode="agent" />);
    expect(menu().dataset.cols).toBe("1");
  });
  it("grows a column at a time until it fits, and the box is as wide as its columns", () => {
    needCols = 3;
    render(<AddPaneMenu engines={engines} anchor={{ left: 100, bottom: 60 }} onPick={() => {}} onClose={() => {}} atLimit={null} mode="agent" />);
    expect(menu().dataset.cols).toBe("3");
    expect(menu().style.width).toBe(`${3 * 262 + 2 * 12 + 16}px`);
  });
  it("never needs more columns than the screen has room for", () => {
    needCols = 9; Object.defineProperty(window, "innerWidth", { value: 600, configurable: true });
    render(<AddPaneMenu engines={engines} anchor={{ left: 100, bottom: 60 }} onPick={() => {}} onClose={() => {}} atLimit={null} mode="agent" />);
    expect(Number(menu().dataset.cols)).toBeLessThanOrEqual(2);
  });
  it("its height is the room beside the anchor, so a menu opened near the bottom is not cut at the top", () => {
    needCols = 1;
    render(<AddPaneMenu engines={engines} anchor={{ left: 100, bottom: 60 }} onPick={() => {}} onClose={() => {}} atLimit={null} mode="pane" />);
    expect(menu().style.maxHeight).toBe(`${700 - 60 - 12}px`);          // not 100vh - 24: that is taller than the room above the anchor
    expect(menu().style.bottom).toBe("60px");
  });
  it("one anchored low from the top flips to open upward with the whole screen, and one near the right edge shifts left to stay inside", () => {
    needCols = 1;
    render(<AddPaneMenu engines={engines} anchor={{ left: 1190, top: 600 }} onPick={() => {}} onClose={() => {}} atLimit={null} mode="all" />);
    expect(menu().style.bottom).toBe("12px"); expect(menu().style.top).toBe("");
    expect(Number.parseInt(menu().style.left)).toBeLessThanOrEqual(1200 - 262 - 16 - 12);
  });
  it("one anchored near the top opens downward and is as tall as the room below", () => {
    needCols = 1;
    render(<AddPaneMenu engines={engines} anchor={{ left: 100, top: 40 }} onPick={() => {}} onClose={() => {}} atLimit={null} mode="all" />);
    expect(menu().style.top).toBe("40px"); expect(menu().style.maxHeight).toBe(`${700 - 40 - 12}px`);
  });
});

describe("opened from an empty thread", () => {
  it("sits in the middle of the screen, grows columns, and scrolls only up and down", () => {
    needCols = 3;
    render(<AddPaneMenu engines={engines} anchor={{ left: 0, center: true } as any} onPick={() => {}} onClose={() => {}} atLimit={null} mode="all" />);
    const w = 3 * 262 + 2 * 12 + 16; expect(menu().style.left).toBe(`${(1200 - w) / 2}px`); expect(menu().style.maxHeight).toBe(`${700 - 24}px`);
    expect(menu().style.overflowX).toBe("hidden"); expect(menu().style.columnCount).toBe(""); expect(screen.getByTestId("add-pane-columns").style.columnCount).toBe("3");
  });
});

describe("it opens and closes like the other windows", () => {
  it("rises in on open, and folds out before it asks to be removed", async () => {
    needCols = 1; const onClose = vi.fn();
    render(<AddPaneMenu engines={engines} anchor={{ left: 100, top: 40 }} atLimit={null} onPick={() => {}} onClose={onClose} mode="agent" />);
    expect(menu().style.animation).toContain("apm-in");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await vi.waitFor(() => expect(menu().getAttribute("data-closing")).toBe("1"));
    expect(menu().style.animation).toContain("apm-out"); expect(onClose).not.toHaveBeenCalled();   // it is still folding
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe("the local model server says what is wrong", () => {
  it("not answering: a row that says so and opens the download page; answering with no model: the command to pull one; with a model: neither", async () => {
    const api = await import("./api"); const shell = await import("@/loki/desktop/shell"); const open = vi.spyOn(shell, "openExternal").mockResolvedValue();
    needCols = 1;
    vi.spyOn(api, "localModels").mockResolvedValue({ reachable: false, base: "http://127.0.0.1:11434", models: [], error: "refused" });
    const a = render(<AddPaneMenu engines={engines} anchor={{ left: 10, top: 10 }} atLimit={null} mode="agent" onLocal={() => {}} onPick={() => {}} onClose={() => {}} />);
    const down = await screen.findByTestId("ollama-down"); expect(down.textContent).toContain("not answering"); down.click(); expect(open).toHaveBeenCalledWith("https://ollama.com/download"); a.unmount();
    vi.spyOn(api, "localModels").mockResolvedValue({ reachable: true, base: "http://127.0.0.1:11434", models: [] });
    const b = render(<AddPaneMenu engines={engines} anchor={{ left: 10, top: 10 }} atLimit={null} mode="agent" onLocal={() => {}} onPick={() => {}} onClose={() => {}} />);
    expect((await screen.findByTestId("ollama-empty")).textContent).toContain("ollama pull"); b.unmount();
    vi.spyOn(api, "localModels").mockResolvedValue({ reachable: true, base: "x", models: [{ id: "local:qwen3:4b", tag: "qwen3:4b", label: "local · qwen3:4b", size_gb: 2.5, params: "4B" } as any] });
    render(<AddPaneMenu engines={engines} anchor={{ left: 10, top: 10 }} atLimit={null} mode="agent" onLocal={() => {}} onPick={() => {}} onClose={() => {}} />);
    (await screen.findByTestId("pick-local-window")).click(); await screen.findByTestId("local-card-qwen3:4b"); expect(screen.queryByTestId("ollama-down")).toBeNull(); expect(screen.queryByTestId("ollama-empty")).toBeNull();
  });
});

describe("the local models say whether the GPU is used", () => {
  const m = [{ id: "local:qwen3:4b", tag: "qwen3:4b", label: "local · qwen3:4b", size_gb: 2.5, params: "4B" } as any];
  it("no GPU: a warning that it is the CPU; a GPU: its VRAM, and what the loaded model really uses", async () => {
    const api = await import("./api"); needCols = 1;
    vi.spyOn(api, "localModels").mockResolvedValue({ reachable: true, base: "x", models: m, gpuMb: null, loaded: [] });
    const a = render(<AddPaneMenu engines={engines} anchor={{ left: 10, top: 10 }} atLimit={null} mode="agent" onLocal={() => {}} onPick={() => {}} onClose={() => {}} />);
    (await screen.findByTestId("pick-local-window")).click(); expect((await screen.findByTestId("local-models-hw")).textContent).toContain("No GPU found"); a.unmount(); document.body.innerHTML = "";
    vi.spyOn(api, "localModels").mockResolvedValue({ reachable: true, base: "x", models: m, gpuMb: 12288, loaded: [{ name: "qwen3:4b", gpu_pct: 0 }] });
    render(<AddPaneMenu engines={engines} anchor={{ left: 10, top: 10 }} atLimit={null} mode="agent" onLocal={() => {}} onPick={() => {}} onClose={() => {}} />);
    (await screen.findByTestId("pick-local-window")).click();
    const hw = (await screen.findByTestId("local-models-hw")).textContent ?? ""; expect(hw).toContain("12 GB of VRAM"); expect((await screen.findByTestId("local-card-qwen3:4b")).textContent).toContain("loaded now · 0% on the GPU");
  });
});
