// The authors layer is framed as KNOWLEDGE and BUS-FACTOR, never blame — and its avatars are fully
// local (a monogram hued from a hash of the email), because the operator's rule is no third-party
// requests. Both of those are properties a refactor could quietly break: a gravatar URL would leak
// every committer's email, and a "who broke it" framing would change what the screen is for.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const authorsGet = vi.fn();
const getMetrics = vi.fn();
vi.mock("@/loki/api/codebase", () => ({
  authorsGet: (...a: any[]) => authorsGet(...a),
  getMetrics: (...a: any[]) => getMetrics(...a),
}));

class RO { observe() {} disconnect() {} }
vi.stubGlobal("ResizeObserver", RO);

import { AuthorsPanel } from "./authors-panel";

const author = (over: any = {}) => ({
  id: "dane@x.com", name: "Dane Silva", email: "dane@x.com", commits: 40, files: 3,
  first: "2026-01-01", last: "2026-05-01", solo: 2, files_list: ["src/a.ts", "src/b.ts"], ...over,
});
const authors = (over: any = {}) => ({
  root: "/repo", commit_count: 120, author_count: 2,
  authors: [author(), author({ id: "sam@x.com", name: "Sam Lee", email: "sam@x.com", commits: 20, files_list: ["src/a.ts"] })],
  files: [{ path: "src/a.ts", authors: 2, touches: 10 }],
  edges: [{ author: "dane@x.com", path: "src/a.ts", touches: 7 }, { author: "sam@x.com", path: "src/a.ts", touches: 3 }],
  codep: [{ a: "dane@x.com", b: "sam@x.com", shared: 3 }],
  bus_factor: { total_files: 10, solo_files: 6, top_solo: [{ id: "dane@x.com", name: "Dane Silva", solo: 4 }] },
  ...over,
});

const onOpen = vi.fn();
const mount = async (data: any) => {
  authorsGet.mockResolvedValue(data);
  const r = render(<AuthorsPanel onOpen={onOpen} />);
  await waitFor(() => expect(screen.queryByText(/reading git history/)).toBeNull());
  return r;
};
const tab = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => { authorsGet.mockReset(); getMetrics.mockReset().mockResolvedValue(null); onOpen.mockReset(); });

describe("availability", () => {
  it("says it is reading git", () => {
    authorsGet.mockReturnValue(new Promise(() => {}));
    render(<AuthorsPanel />);
    expect(screen.getByText(/reading git history/)).toBeTruthy();
  });

  it("says what it needs when there is no history", async () => {
    await mount(authors({ author_count: 0, authors: [] }));
    expect(screen.getByText(/no authors found/)).toBeTruthy();
    expect(screen.getByText(/Needs a git repository with history/)).toBeTruthy();
  });

  it("surfaces git's own error", async () => {
    await mount(authors({ error: "not a git repository" }));
    expect(screen.getByText(/not a git repository/)).toBeTruthy();
  });

  it("treats a failed read as no authors", async () => {
    await mount(null);
    expect(screen.getByText(/no authors found/)).toBeTruthy();
  });

  it("states the counts and that everything is local and deterministic", async () => {
    await mount(authors());
    expect(screen.getByText(/2 authors · 120 commits · local avatars, deterministic from git/)).toBeTruthy();
  });
});

describe("the avatars are local", () => {
  it("draws a monogram, never an image or a remote request", async () => {
    const { container } = await mount(authors());
    tab("co-dependency");                       // the tab that actually renders avatars
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByTitle(/Dane Silva · dane@x.com/).length).toBeGreaterThan(0);
  });

  it("gives different people different hues, deterministically", async () => {
    const { container } = await mount(authors());
    tab("bus-factor");
    const monogram = screen.getByText("DS") as HTMLElement;
    expect(monogram.style.background).toContain("oklch");
    expect(container.querySelector("img")).toBeNull();
  });

  it("builds initials from the name, tolerating a single-word or odd one", async () => {
    await mount(authors({ authors: [author({ name: "cher", id: "c@x", email: "c@x", files_list: [] })], author_count: 1, bus_factor: null }));
    tab("profile");
    expect(screen.getAllByText("C").length).toBeGreaterThan(0);
  });
});

describe("the four tabs", () => {
  it("opens on the graph and reaches each of the others", async () => {
    await mount(authors());
    expect(document.querySelector("svg")).toBeTruthy();

    tab("co-dependency");
    expect(screen.getByText(/which authors each FILE depends on/)).toBeTruthy();

    tab("bus-factor");
    expect(screen.getByText("single-owner files")).toBeTruthy();

    tab("profile");
    expect(screen.getAllByText(/Dane Silva/).length).toBeGreaterThan(0);
  });
});

describe("the co-dependency heatmap", () => {
  it("labels each cell with who touched what, how often", async () => {
    await mount(authors());
    tab("co-dependency");
    expect(screen.getByTitle("a.ts ⟵ Dane Silva: 7 commits")).toBeTruthy();
    expect(screen.getByTitle("a.ts ⟵ Sam Lee: 3 commits")).toBeTruthy();
  });

  it("explains that one bright cell in a row IS the bus factor", async () => {
    await mount(authors());
    tab("co-dependency");
    expect(screen.getByText(/a single bright cell in a row = bus-factor/)).toBeTruthy();
  });

  it("opens a file from its row", async () => {
    await mount(authors());
    tab("co-dependency");
    fireEvent.click(screen.getByTitle("src/a.ts"));
    expect(onOpen).toHaveBeenCalledWith("src/a.ts");
  });

  it("says so when there is no author↔file data", async () => {
    await mount(authors({ edges: [] }));
    tab("co-dependency");
    expect(screen.getByText(/no author↔file data/)).toBeTruthy();
  });
});

describe("the bus factor", () => {
  it("reports the single-owner share as knowledge risk, not as blame", async () => {
    await mount(authors());
    tab("bus-factor");
    expect(screen.getByText("60%")).toBeTruthy();
    expect(screen.getByText(/6 of 10 files have been touched by exactly one person/)).toBeTruthy();
    expect(screen.getByText(/that knowledge goes with them/)).toBeTruthy();
    expect(screen.getByText(/knowledge concentration/)).toBeTruthy();
  });

  it("tones the share by how risky it is", async () => {
    const tone = async (solo: number) => {
      const { unmount } = await mount(authors({ bus_factor: { total_files: 10, solo_files: solo, top_solo: [] } }));
      tab("bus-factor");
      const c = (screen.getByText(`${solo * 10}%`) as HTMLElement).style.color;
      unmount();
      return c;
    };
    expect(new Set([await tone(7), await tone(4), await tone(1)]).size).toBe(3);
  });

  it("celebrates a well-shared codebase rather than showing an empty list", async () => {
    await mount(authors({ bus_factor: { total_files: 10, solo_files: 0, top_solo: [] } }));
    tab("bus-factor");
    expect(screen.getByText(/knowledge is well shared/)).toBeTruthy();
  });

  it("says so when git gave no bus-factor at all", async () => {
    await mount(authors({ bus_factor: null }));
    tab("bus-factor");
    expect(screen.getByText(/no bus-factor data/)).toBeTruthy();
  });
});
