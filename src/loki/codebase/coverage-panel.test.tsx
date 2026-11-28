// The whole point of this panel is the JOIN: coverage alone ranks by percentage, which puts a
// trivial 0% helper above a 40%-covered file the whole app leans on. Risk = mass × (1 − coverage),
// and "blind spots" are the heavy files that never appear in the report at all — the ones plain
// coverage can't see. Those two derivations, and the path matching that feeds them, are what break.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const coverageGet = vi.fn();
const getMetrics = vi.fn();
vi.mock("@/loki/api/codebase", () => ({
  coverageGet: (...a: any[]) => coverageGet(...a),
  getMetrics: (...a: any[]) => getMetrics(...a),
}));

// jsdom has no ResizeObserver; the panel measures itself to size the scatter.
class RO { observe() {} disconnect() {} }
vi.stubGlobal("ResizeObserver", RO);

import { CoveragePanel } from "./coverage-panel";

const file = (path: string, pct: number, over: any = {}) => ({ path, pct, hit: pct, total: 100, ...over });
const metric = (over: any = {}) => ({ gravity: 10, fan_in: 2, loc: 100, complexity: 5, is_test: false, ...over });

const mount = async (cov: any, mets: any = null) => {
  coverageGet.mockResolvedValue(cov);
  getMetrics.mockResolvedValue(mets ? { metrics_by_file: mets } : null);
  const r = render(<CoveragePanel onOpen={onOpen} />);
  await waitFor(() => expect(screen.queryByText("reading coverage…")).toBeNull());
  return r;
};
const onOpen = vi.fn();

beforeEach(() => { coverageGet.mockReset(); getMetrics.mockReset(); onOpen.mockReset(); });

describe("before there is a report", () => {
  it("says it is reading, not that coverage is zero", () => {
    coverageGet.mockReturnValue(new Promise(() => {}));
    getMetrics.mockReturnValue(new Promise(() => {}));
    render(<CoveragePanel />);
    expect(screen.getByText("reading coverage…")).toBeTruthy();
  });

  it("explains how to produce one, naming the tools that work", async () => {
    await mount({ files: [], count: 0, total_pct: null, ran: false });
    expect(screen.getByText(/no coverage report yet/)).toBeTruthy();
    expect(screen.getByText(/coverage\/lcov.info/)).toBeTruthy();
  });

  it("shows the BE's own explanation when it gave one", async () => {
    await mount({ files: [], error: "lcov.info not found", ran: false });
    expect(screen.getByText(/lcov.info not found/)).toBeTruthy();
  });

  it("surfaces the run error separately from the empty state", async () => {
    await mount({ files: [], run_error: "npm test exited 1", ran: true });
    expect(screen.getByText(/run: npm test exited 1/)).toBeTruthy();
  });
});

describe("capturing coverage", () => {
  it("reads without running by default — the safe path", async () => {
    await mount({ files: [], count: 0 });
    expect(coverageGet).toHaveBeenCalledWith({});
  });

  it("runs the operator's own command, with room for a real suite", async () => {
    await mount({ files: [], count: 0 });
    fireEvent.click(screen.getByText("▶ run"));
    await waitFor(() => expect(coverageGet).toHaveBeenCalledWith(expect.objectContaining({ run: true, timeout_ms: 300000 })));
    expect(coverageGet.mock.calls[1][0].cmd).toContain("lcov");
  });

  it("sends the edited command", async () => {
    await mount({ files: [], count: 0 });
    fireEvent.change(screen.getByTitle(/your project's coverage command/), { target: { value: "pytest --cov" } });
    fireEvent.click(screen.getByText("▶ run"));
    await waitFor(() => expect(coverageGet.mock.calls[1][0].cmd).toBe("pytest --cov"));
  });

  it("refuses to run an empty command", async () => {
    await mount({ files: [], count: 0 });
    fireEvent.change(screen.getByTitle(/your project's coverage command/), { target: { value: "  " } });
    expect((screen.getByText("▶ run") as HTMLButtonElement).disabled).toBe(true);
  });

  it("warns that a run executes the real suite", async () => {
    await mount({ files: [], count: 0 });
    coverageGet.mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByText("▶ run"));
    await waitFor(() => expect(screen.getByText(/running your coverage command in the sandbox/)).toBeTruthy());
  });

  it("re-reads both coverage and the gravity metrics on ↻", async () => {
    await mount({ files: [], count: 0 });
    getMetrics.mockClear();
    fireEvent.click(screen.getByTitle(/re-read coverage/));
    await waitFor(() => expect(getMetrics).toHaveBeenCalled());
  });
});

describe("the grade strip", () => {
  const report = {
    count: 4, total_pct: 62, ran: true,
    files: [file("a.ts", 100, { hit: 50, total: 50 }), file("b.ts", 0, { hit: 0, total: 30 }), file("c.ts", 40, { hit: 8, total: 20 }), file("d.ts", 100, { hit: 10, total: 10 })],
  };

  it("grades the total and counts the extremes", async () => {
    await mount(report);
    expect(screen.getByText("C")).toBeTruthy();              // 62% → C
    expect(screen.getByText("62%")).toBeTruthy();
    expect(screen.getByText("68 / 110")).toBeTruthy();        // lines run / total, summed
    expect(screen.getByText("fully covered").previousSibling!.textContent).toBe("2");
    expect(screen.getByText("0% files").previousSibling!.textContent).toBe("1");
  });

  it("maps each band of the scale to its letter", async () => {
    for (const [pct, letter] of [[95, "A"], [80, "B"], [65, "C"], [45, "D"], [10, "F"]] as const) {
      const { unmount } = await mount({ ...report, total_pct: pct });
      expect(screen.getByText(letter), String(pct)).toBeTruthy();
      unmount();
    }
  });

  it("shows a dash rather than F when there is no total at all", async () => {
    await mount({ ...report, total_pct: null });
    expect(screen.getAllByText("—")).toHaveLength(2);   // the grade badge and the percentage
  });
});

describe("the distribution", () => {
  it("buckets every file into exactly one band", async () => {
    await mount({ count: 6, total_pct: 50, files: [
      file("a", 0), file("b", 10), file("c", 30), file("d", 60), file("e", 99), file("f", 100),
    ] });
    for (const label of ["0%", "<25", "<50", "<75", "<100", "100%"]) {
      expect(screen.getByTitle(new RegExp(`1 file at ${label.replace(/[<%]/g, (m) => "\\" + m)} coverage`)), label).toBeTruthy();
    }
  });
});

describe("the risk join", () => {
  it("ranks a heavy half-covered file above a light untested one", async () => {
    await mount(
      { count: 2, total_pct: 50, files: [file("src/light.ts", 0), file("src/heavy.ts", 50)] },
      { "src/light.ts": metric({ gravity: 1 }), "src/heavy.ts": metric({ gravity: 100 }) },
    );
    const gaps = screen.getAllByTitle(/click to open/).map((e) => e.textContent);
    expect(gaps[0]).toContain("heavy.ts");
    expect(gaps[1]).toContain("light.ts");
  });

  it("still ranks by coverage when there are no gravity metrics, and says so", async () => {
    await mount({ count: 2, total_pct: 50, files: [file("a.ts", 80), file("b.ts", 10)] });
    expect(screen.getByText(/gravity metrics unavailable/)).toBeTruthy();
    const gaps = screen.getAllByTitle(/click to open/).map((e) => e.textContent);
    expect(gaps[0]).toContain("b.ts");
  });

  it("matches metrics to coverage across path shapes — absolute vs relative, backslashes vs forward", async () => {
    await mount(
      { count: 1, total_pct: 40, files: [file("src\\deep\\a.ts", 40)] },
      { "/repo/src/deep/a.ts": metric({ gravity: 42, fan_in: 9 }) },
    );
    expect(screen.getByText(/9 import it/)).toBeTruthy();
  });

  it("excludes fully covered files from the gaps list", async () => {
    await mount({ count: 2, total_pct: 100, files: [file("a.ts", 100), file("b.ts", 100)] });
    expect(screen.getByText(/no gaps — every reported file is fully covered/)).toBeTruthy();
  });

  it("annotates a gap only with the signals that matter", async () => {
    await mount(
      { count: 2, total_pct: 0, files: [file("hot.ts", 0, { total: 200 }), file("quiet.ts", 0, { total: 12 })] },
      { "hot.ts": metric({ fan_in: 9, complexity: 22, loc: 200 }), "quiet.ts": metric({ fan_in: 1, complexity: 2, loc: 12 }) },
    );
    const rows = screen.getAllByTitle(/click to open/).map((e) => e.textContent);
    const hot = rows.find((t) => t!.includes("hot.ts"))!;
    const quiet = rows.find((t) => t!.includes("quiet.ts"))!;
    expect(hot).toContain("9 import it");
    expect(hot).toContain("cyclomatic 22");
    expect(quiet).not.toContain("import it");     // fan-in 1 is not worth the ink
    expect(quiet).not.toContain("cyclomatic");
  });

  it("opens a file from the gap list", async () => {
    await mount({ count: 1, total_pct: 0, files: [file("src/a.ts", 0)] });
    fireEvent.click(screen.getAllByTitle(/click to open/)[0]);
    expect(onOpen).toHaveBeenCalledWith("src/a.ts");
  });
});

describe("blind spots — what coverage cannot see", () => {
  it("lists heavy files absent from the report entirely", async () => {
    await mount(
      { count: 1, total_pct: 100, files: [file("src/tested.ts", 100)] },
      { "src/tested.ts": metric(), "src/never-run.ts": metric({ gravity: 80, fan_in: 12 }) },
    );
    expect(screen.getByText(/heavy code no test ever runs/)).toBeTruthy();
    expect(screen.getByText("never-run.ts")).toBeTruthy();
    expect(screen.getByText(/gravity 80 · 12 import it/)).toBeTruthy();
  });

  it("counts a file reported at exactly 0% as blind too", async () => {
    await mount(
      { count: 1, total_pct: 0, files: [file("src/zero.ts", 0)] },
      { "src/zero.ts": metric({ gravity: 50 }) },
    );
    expect(screen.getByText(/heavy code no test ever runs/)).toBeTruthy();
  });

  it("never blames a TEST file for being untested", async () => {
    await mount(
      { count: 1, total_pct: 100, files: [file("src/a.ts", 100)] },
      { "src/a.ts": metric(), "src/a.test.ts": metric({ is_test: true, gravity: 99 }) },
    );
    expect(screen.queryByText("a.test.ts")).toBeNull();
  });

  it("ignores weightless files — a blind spot has to matter", async () => {
    await mount(
      { count: 1, total_pct: 100, files: [file("src/a.ts", 100)] },
      { "src/a.ts": metric(), "src/trivial.ts": metric({ gravity: 0 }) },
    );
    expect(screen.queryByText(/heavy code no test ever runs/)).toBeNull();
    expect(screen.getByText("blind spots").previousSibling!.textContent).toBe("0");
  });

  it("opens a blind spot from its row", async () => {
    await mount(
      { count: 1, total_pct: 100, files: [file("src/a.ts", 100)] },
      { "src/a.ts": metric(), "src/never-run.ts": metric({ gravity: 80 }) },
    );
    fireEvent.click(screen.getByText("never-run.ts"));
    expect(onOpen).toHaveBeenCalledWith("src/never-run.ts");
  });
});

describe("the risk scatter", () => {
  it("plots one dot per file that has both signals, titled with all three numbers", async () => {
    await mount(
      { count: 2, total_pct: 50, files: [file("a.ts", 20), file("b.ts", 90)] },
      { "a.ts": metric({ gravity: 30, fan_in: 4 }), "b.ts": metric({ gravity: 5, fan_in: 1 }) },
    );
    const dots = document.querySelectorAll("svg circle");
    expect(dots).toHaveLength(2);
    expect(dots[0].querySelector("title")!.textContent).toContain("20% covered · gravity 30 · fan-in 4");
  });

  it("draws no scatter at all when nothing can be joined", async () => {
    await mount({ count: 1, total_pct: 50, files: [file("a.ts", 50)] });
    expect(document.querySelector("svg circle")).toBeNull();
  });

  it("opens the file a dot represents", async () => {
    await mount(
      { count: 1, total_pct: 20, files: [file("src/a.ts", 20)] },
      { "src/a.ts": metric() },
    );
    fireEvent.click(document.querySelector("svg circle")!);
    expect(onOpen).toHaveBeenCalledWith("src/a.ts");
  });

  it("marks the danger zone so the heavy+untested corner reads at a glance", async () => {
    await mount(
      { count: 1, total_pct: 20, files: [file("a.ts", 20)] },
      { "a.ts": metric() },
    );
    expect(screen.getByText("danger")).toBeTruthy();
  });
});
