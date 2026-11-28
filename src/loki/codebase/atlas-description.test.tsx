// A file's description is two things with very different costs: deterministic FACTS gathered on
// rebuild (free, instant) and a LOW-AI narrative (paid, cached). The panel must never blur them —
// showing an essay as if it were fact, or re-paying for one that is already cached — and a `stale`
// description must force a regenerate rather than serving the outdated cache.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const descriptionGet = vi.fn();
const describeFile = vi.fn();
vi.mock("@/loki/api/codebase", () => ({
  descriptionGet: (...a: any[]) => descriptionGet(...a),
  describeFile: (...a: any[]) => describeFile(...a),
}));

import { DescriptionView } from "./atlas-description";

const desc = (over: any = {}) => ({
  path: "src/a.ts", origin: "atlas", facts: null, summary_md: null, has_essay: false, stale: false, ...over,
});

const mount = async (d: any, path: string | null = "src/a.ts") => {
  descriptionGet.mockResolvedValue(d);
  const r = render(<DescriptionView path={path} />);
  if (path) await waitFor(() => expect(screen.queryByText("loading…")).toBeNull());
  return r;
};

beforeEach(() => { descriptionGet.mockReset(); describeFile.mockReset(); });

describe("with no file selected", () => {
  it("invites the operator to pick one, and asks the BE for nothing", async () => {
    render(<DescriptionView path={null} />);
    expect(screen.getByText(/open a file in the tree/)).toBeTruthy();
    expect(descriptionGet).not.toHaveBeenCalled();
  });
});

describe("loading", () => {
  it("says loading on the first read", () => {
    descriptionGet.mockReturnValue(new Promise(() => {}));
    render(<DescriptionView path="src/a.ts" />);
    expect(screen.getByText("loading…")).toBeTruthy();
  });

  it("re-reads when the selected file changes", async () => {
    await mount(desc());
    descriptionGet.mockResolvedValue(desc({ path: "src/b.ts" }));
    render(<DescriptionView path="src/b.ts" />);
    await waitFor(() => expect(descriptionGet).toHaveBeenCalledTimes(2));
    expect(descriptionGet.mock.calls[1][0]).toMatchObject({ path: "src/b.ts", origin: "atlas" });
  });

  it("honours a non-default origin", async () => {
    descriptionGet.mockResolvedValue(desc());
    render(<DescriptionView path="src/a.ts" origin="design" />);
    await waitFor(() => expect(descriptionGet).toHaveBeenCalledWith({ path: "src/a.ts", origin: "design" }));
  });
});

describe("the narrative", () => {
  const genBtn = () => screen.getByRole("button", { name: /^(generate|regenerate|writing…)$/ });

  it("offers to generate one when there is none, and says it will cost a low-tier call", async () => {
    await mount(desc());
    expect(genBtn().textContent).toBe("generate");
    expect(screen.getByText(/low-cost AI description grounded in the facts/)).toBeTruthy();
  });

  it("offers a regenerate once an essay exists", async () => {
    await mount(desc({ summary_md: "This file guards the door.", has_essay: true }));
    expect(screen.getByText("This file guards the door.")).toBeTruthy();
    expect(genBtn().textContent).toBe("regenerate");
  });

  it("generates without forcing when the cache is still good", async () => {
    describeFile.mockResolvedValue({ summary_md: "fresh essay", facts: null });
    await mount(desc());
    fireEvent.click(genBtn());
    await waitFor(() => expect(describeFile).toHaveBeenCalledWith({ path: "src/a.ts", origin: "atlas", force: false }));
    await waitFor(() => expect(screen.getByText("fresh essay")).toBeTruthy());
  });

  it("FORCES a regenerate for a stale description — serving the cache would describe old code", async () => {
    describeFile.mockResolvedValue({ summary_md: "rewritten", facts: null });
    await mount(desc({ summary_md: "old", has_essay: true, stale: true }));
    expect(screen.getByText(/stale — file changed/)).toBeTruthy();
    fireEvent.click(genBtn());
    await waitFor(() => expect(describeFile.mock.calls[0][0].force).toBe(true));
    await waitFor(() => expect(screen.queryByText(/stale — file changed/)).toBeNull());
  });

  it("shows progress and refuses a second click while writing", async () => {
    let release: (v: any) => void = () => {};
    describeFile.mockReturnValue(new Promise((r) => { release = r; }));
    await mount(desc());
    fireEvent.click(genBtn());
    expect(genBtn().textContent).toBe("writing…");
    fireEvent.click(genBtn());
    expect(describeFile).toHaveBeenCalledTimes(1);
    release({ summary_md: "done", facts: null });
    await waitFor(() => expect(screen.getByText("done")).toBeTruthy());
  });

  it("keeps the existing facts when the generate call returns none", async () => {
    describeFile.mockResolvedValue({ summary_md: "essay", facts: null });
    await mount(desc({ facts: { imports: ["./b"] } }));
    fireEvent.click(genBtn());
    await waitFor(() => expect(screen.getByText("essay")).toBeTruthy());
    expect(screen.getByText("./b")).toBeTruthy();
  });

  it("leaves the panel unchanged when the generate call fails outright", async () => {
    describeFile.mockResolvedValue(null);
    await mount(desc());
    fireEvent.click(genBtn());
    await waitFor(() => expect(genBtn().textContent).toBe("generate"));
    expect(screen.getByText(/No narrative yet/)).toBeTruthy();
  });
});

describe("the facts", () => {
  it("lists what the file defines, imports and is depended on by", async () => {
    await mount(desc({ facts: {
      role: "guard",
      symbols: [{ name: "verifyToken", signature: "(t: string)" }, { name: "requireGrant" }],
      imports: ["./db", "./log"],
      dependents: ["dispatch.ts"],
    } }));
    expect(screen.getByText("guard")).toBeTruthy();
    expect(screen.getByText("verifyToken(t: string)")).toBeTruthy();
    expect(screen.getByText("requireGrant")).toBeTruthy();     // no signature → just the name
    expect(screen.getByText("./db")).toBeTruthy();
    expect(screen.getByText("dispatch.ts")).toBeTruthy();
  });

  it("omits a fact row that has nothing in it", async () => {
    await mount(desc({ facts: { imports: ["./db"], symbols: [], dependents: [] } }));
    expect(screen.getByText("imports")).toBeTruthy();
    expect(screen.queryByText("defines")).toBeNull();
    expect(screen.queryByText("depended on by")).toBeNull();
  });

  it("tells the operator to rebuild when no facts were gathered", async () => {
    await mount(desc({ facts: null }));
    expect(screen.getByText(/No facts gathered yet — rebuild the codebase/)).toBeTruthy();
  });

  it("names an unnamed symbol rather than rendering 'undefined'", async () => {
    await mount(desc({ facts: { symbols: [{ signature: "()" }] } }));
    expect(screen.getByText("?()")).toBeTruthy();
  });
});
