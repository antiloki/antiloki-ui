// The rail decides what a paid crew of specialists will READ. Two rules carry money: the scope is
// hard-capped at six files (a runaway scope is a runaway bill), and the "always rides" verdict slices
// are stated as facts, not toggles — an operator who thinks they can switch them off would
// mis-read every cost estimate on the screen.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiPost = vi.fn();
vi.mock("@/loki/api/client", () => ({
  apiPost: (...a: any[]) => apiPost(...a),
  unwrapResult: (r: any) => (r?.result ?? r) ?? null,
}));
vi.mock("@/loki/widgets/studio-overlay", () => ({
  SOURCE_GROUPS: [
    { group: "Code", items: [["atlas", "atlas"], ["docs", "docs"]] },
    { group: "Work", items: [["cards", "cards"]] },
  ],
}));

import { MissionRail } from "./mission-rail";

const atlas = {
  nodes: [
    { type: "file", path: "src/a.ts" },
    { type: "file", path: "src/deep/b.ts" },
    { type: "symbol", path: "src/a.ts#fn" },
    { type: "file", path: "docs/readme.md" },
  ],
  file_tokens: { "src/a.ts": 1000, "src/deep/b.ts": 500, "docs/readme.md": 200 },
};

const props = (over: any = {}) => ({
  missionTitle: "Harden the auth path",
  scope: [] as string[], onScope: vi.fn(),
  candidates: [] as any[],
  research: false, onResearch: vi.fn(),
  sources: [] as string[], onSources: vi.fn(),
  ...over,
});

const mountWith = async (over: any = {}) => {
  const p = props(over);
  const r = render(<MissionRail {...p} />);
  await waitFor(() => expect(screen.queryByText("loading atlas…")).toBeNull());
  return { ...r, p };
};

beforeEach(() => { apiPost.mockReset(); apiPost.mockResolvedValue(atlas); });

describe("the mission line", () => {
  it("leads with the armed mission", async () => {
    await mountWith();
    expect(screen.getByText(/Harden the auth path/)).toBeTruthy();
  });

  it("prompts for one when nothing is armed", async () => {
    await mountWith({ missionTitle: null });
    expect(screen.getByText(/no mission armed/)).toBeTruthy();
  });
});

describe("the code scope tree", () => {
  it("says it is loading before the atlas answers", () => {
    apiPost.mockReturnValue(new Promise(() => {}));
    render(<MissionRail {...props()} />);
    expect(screen.getByText("loading atlas…")).toBeTruthy();
  });

  it("asks the atlas for files with their token weights", async () => {
    await mountWith();
    expect(apiPost).toHaveBeenCalledWith("/api/v1/codebase/get", expect.objectContaining({ origin: "atlas", with_tokens: true, types: ["file"] }), expect.objectContaining({ timeoutMs: 30000 }));
  });

  it("builds the tree from FILE nodes only", async () => {
    await mountWith();
    expect(screen.getByText("src/")).toBeTruthy();
    expect(screen.getByText("docs/")).toBeTruthy();
    expect(screen.queryByText(/#fn/)).toBeNull();
  });

  it("tells the operator to rebuild when the atlas is empty", async () => {
    apiPost.mockResolvedValue({ nodes: [] });
    await mountWith();
    expect(screen.getByText(/atlas empty — rebuild it in Code/)).toBeTruthy();
  });

  it("a thrown atlas read shows the error with ↻ retry — never 'atlas empty' (the atlas may be fine, the serve busy)", async () => {
    apiPost.mockRejectedValue(new Error("down"));
    await mountWith();
    expect(screen.queryByText(/atlas empty/)).toBeNull();
    expect(screen.getByText(/down/)).toBeTruthy();
    apiPost.mockResolvedValue(atlas);
    fireEvent.click(screen.getByText("↻ retry"));
    await waitFor(() => expect(screen.getByText("src/")).toBeTruthy());
  });

  it("a null reply (timeout) retries once by itself before giving up", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // the rail also asks the context library for its packs (2026-09-19) — only the atlas calls count here
    let atlasCalls = 0;
    apiPost.mockImplementation(async (url: string) => { if (String(url).includes("/context/library")) return { result: { ok: true, packs: [] } }; atlasCalls += 1; return atlasCalls === 1 ? null : atlas; });
    render(<MissionRail {...props()} />);
    await waitFor(() => expect(atlasCalls).toBe(1));
    await vi.advanceTimersByTimeAsync(4500);
    await waitFor(() => expect(screen.getByText("src/")).toBeTruthy());
    expect(atlasCalls).toBe(2);
    vi.useRealTimers();
  });

  it("filters the tree and force-expands it so matches are visible without clicking", async () => {
    await mountWith();
    expect(screen.queryByText("b.ts")).toBeNull();          // collapsed by default
    fireEvent.change(screen.getByPlaceholderText("filter files…"), { target: { value: "deep" } });
    expect(screen.getByText("b.ts")).toBeTruthy();
    expect(screen.queryByText("readme.md")).toBeNull();
  });

  it("adds a clicked file to the scope", async () => {
    const { p } = await mountWith();
    fireEvent.click(screen.getByText("src/"));               // expand
    fireEvent.click(screen.getByText("a.ts"));
    expect(p.onScope).toHaveBeenCalledWith(["src/a.ts"]);
  });

  it("removes a file that was already in scope", async () => {
    const { p } = await mountWith({ scope: ["src/a.ts"] });
    fireEvent.click(screen.getByText("src/"));
    fireEvent.click(screen.getByText("a.ts"));
    expect(p.onScope).toHaveBeenCalledWith([]);
  });

  it("hard-caps the scope at six files", async () => {
    const six = ["1", "2", "3", "4", "5", "6"];
    const { p } = await mountWith({ scope: six });
    fireEvent.click(screen.getByText("src/"));
    fireEvent.click(screen.getByText("a.ts"));
    expect(p.onScope.mock.calls[0][0]).toHaveLength(6);
  });

  it("shows the running scope count and its token weight", async () => {
    await mountWith({ scope: ["src/a.ts"] });
    expect(screen.getByText(/1\/6 · ~/)).toBeTruthy();
  });

  it("shows no counter at all when nothing is scoped", async () => {
    await mountWith();
    expect(screen.queryByText(/\/6 ·/)).toBeNull();
  });
});

describe("the candidate chips", () => {
  const unhealthy = Array.from({ length: 12 }, (_, i) => ({ path: `src/f${i}.ts`, health: 10 + i }));

  it("offers only the unhealthy files, worst first, ten at a time", async () => {
    await mountWith({ candidates: unhealthy });
    expect(screen.getByText(/best candidates — worst health first \(12\)/)).toBeTruthy();
    expect(screen.getByText("f0.ts")).toBeTruthy();
    expect(screen.queryByText("f10.ts")).toBeNull();
    fireEvent.click(screen.getByText(/show 10 more \(2 left\)/));
    expect(screen.getByText("f10.ts")).toBeTruthy();
  });

  it("hides healthy files and files with no health at all", async () => {
    await mountWith({ candidates: [{ path: "a.ts", health: 90 }, { path: "b.ts", health: null }] });
    expect(screen.queryByText(/best candidates/)).toBeNull();
  });

  it("drops a candidate once it is already in scope", async () => {
    await mountWith({ candidates: [{ path: "src/a.ts", health: 40 }], scope: ["src/a.ts"] });
    expect(screen.queryByText(/best candidates/)).toBeNull();
  });

  it("adds a candidate to the scope in one click", async () => {
    const { p } = await mountWith({ candidates: [{ path: "src/a.ts", health: 40 }] });
    fireEvent.click(screen.getByTitle("add src/a.ts to scope"));
    expect(p.onScope).toHaveBeenCalledWith(["src/a.ts"]);
  });

  it("colours the health number by band", async () => {
    await mountWith({ candidates: [{ path: "a.ts", health: 40 }, { path: "b.ts", health: 70 }] });
    const bad = screen.getByText("40") as HTMLElement;
    const warn = screen.getByText("70") as HTMLElement;
    expect(bad.style.color).not.toBe(warn.style.color);
  });
});

describe("the always-rides verdict slices", () => {
  it("states them as facts — none of them is a button", async () => {
    await mountWith();
    for (const label of ["verdict + axes", "laws + violations", "the field", "population", "source ≤5k"]) {
      const chip = screen.getByText(`✓ ${label}`);
      expect(chip.tagName, label).toBe("SPAN");
      expect(chip.getAttribute("title"), label).toContain("always rides");
    }
  });

  it("presents the editor the same way, since it is obligatory", async () => {
    await mountWith();
    expect(screen.getByText("✓ ✒ the editor").tagName).toBe("SPAN");
  });
});

describe("the optional context sources", () => {
  it("renders a toggle per source, grouped — the X-ray's file review + folder paper first, Code next, no Work / Knowledge (operator 2026-09-19)", async () => {
    await mountWith();
    expect(screen.getByText("X-ray")).toBeTruthy();
    expect(screen.getByText("File review").tagName).toBe("BUTTON");
    expect(screen.getByText("Folder paper").tagName).toBe("BUTTON");
    expect(screen.getByText("Code")).toBeTruthy();
    expect(screen.queryByText("Work")).toBeNull();
    expect(screen.getByText("atlas").tagName).toBe("BUTTON");
  });

  it("the box layout (inside the mission) shows the cases and the sources without the priority line", async () => {
    const { p } = await mountWith();
    render(<MissionRail {...props(p)} layout="box" />);
    const boxes = screen.getAllByTestId("scope-box");
    expect(boxes.length).toBe(1);
    expect(boxes[0].textContent).toContain("Scope — the cases");
    expect(boxes[0].textContent).not.toContain("Priority");
  });

  it("adds a source on click and removes it on a second click", async () => {
    const { p, rerender } = await mountWith();
    fireEvent.click(screen.getByText("atlas"));
    expect(p.onSources).toHaveBeenCalledWith(["atlas"]);

    rerender(<MissionRail {...props({ ...p, sources: ["atlas"], onSources: p.onSources })} />);
    fireEvent.click(screen.getByText("✓ atlas"));
    expect(p.onSources).toHaveBeenLastCalledWith([]);
  });

  it("marks the enabled sources and explains what enabling means", async () => {
    await mountWith({ sources: ["atlas"] });
    expect(screen.getByText("✓ atlas").getAttribute("title")).toContain("rides the crew");
    expect(screen.getByText("docs").getAttribute("title")).toContain("add this source");
  });
});

describe("the run switches", () => {
  it("toggles web research", async () => {
    const { p } = await mountWith();
    fireEvent.click(screen.getByText(/web research/));
    expect(p.onResearch).toHaveBeenCalled();
  });

  it("marks web research when it is armed", async () => {
    await mountWith({ research: true });
    expect(screen.getByText(/✓ 🌐 web research/)).toBeTruthy();
  });
});
