// The bypass log is an append-only record of every escape from protocol. Its counts are what an
// operator reads first, so "blocked" and "allowed" must never blur: a blocked attempt is the
// substrate refusing, an allowed one is a real override that happened. A bypass with no recorded
// reason is itself a finding, and the log marks it as one.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

let poll: any = { data: [], loading: false, notWired: false };
vi.mock("@tanstack/react-router", () => ({ Link: ({ to, children }: any) => <a href={to}>{children}</a> }));
vi.mock("@/loki/api/hooks", () => ({ useBypasses: () => poll }));
vi.mock("@/loki/components/EndpointStub", () => ({ EndpointStub: ({ endpoint }: any) => <div data-testid="stub">{endpoint}</div> }));

import { BypassesLog } from "./bypasses";

const bypass = (over: any = {}) => ({
  id: 1, ts: "2026-05-20 10:00:00", actor: "human:dane", kind: "god_dispatch",
  action_name: "system.law.add", law_slug: null, reason: "seeding the laws", outcome: "allowed", ...over,
});

const mount = (rows: any[], over: any = {}) => {
  poll = { data: rows, loading: false, notWired: false, ...over };
  return render(<BypassesLog />);
};
// The same words appear three times over: as a stat LABEL (div), a filter BUTTON, and a row CELL
// (span). Each helper picks the one it means.
const statCard = (label: string) => screen.getAllByText(label).find((e) => e.tagName === "DIV")!;
const stat = (label: string) => statCard(label).parentElement!.textContent;
const filterBtn = (k: string) => screen.getByRole("button", { name: k });
const cell = (text: string) => screen.getAllByText(text).find((e) => e.tagName === "SPAN")!;

beforeEach(() => { poll = { data: [], loading: false, notWired: false }; });

describe("availability", () => {
  it("shows the endpoint stub when the log route is not wired", () => {
    mount([], { notWired: true });
    expect(screen.getByTestId("stub").textContent).toBe("/api/v1/bypasses/list");
  });

  it("names the source and says the log is append-only", () => {
    mount([]);
    expect(screen.getByText(/source · \/api\/v1\/bypasses\/list · append-only/)).toBeTruthy();
  });
});

describe("the counts", () => {
  it("splits the total into blocked and allowed", () => {
    mount([
      bypass({ id: 1, outcome: "allowed" }),
      bypass({ id: 2, outcome: "blocked" }),
      bypass({ id: 3, outcome: "allowed" }),
    ]);
    expect(stat("total")).toContain("3");
    expect(stat("blocked")).toContain("1");
    expect(stat("allowed")).toContain("2");
  });

  it("tones a non-zero blocked count as an alarm", () => {
    const colour = (rows: any[]) => {
      const { unmount } = mount(rows);
      const c = (statCard("blocked").nextSibling as HTMLElement).style.color;
      unmount();
      return c;
    };
    expect(colour([bypass({ outcome: "blocked" })])).not.toBe(colour([bypass({ outcome: "allowed" })]));
  });

  it("counts the WHOLE log, not the filtered view", () => {
    mount([bypass({ id: 1, kind: "god_dispatch" }), bypass({ id: 2, kind: "no_verify" })]);
    fireEvent.click(filterBtn("no_verify"));
    expect(stat("total")).toContain("2");
  });
});

describe("filtering", () => {
  it("offers every kind plus 'all', and narrows the rows", () => {
    mount([bypass({ id: 1, kind: "god_dispatch" }), bypass({ id: 2, kind: "unsafe_skill", action_name: "raw-skill" })]);
    for (const k of ["all", "god_dispatch", "unsafe_skill", "no_verify", "law_blocked"]) {
      expect(filterBtn(k), k).toBeTruthy();
    }
    fireEvent.click(filterBtn("unsafe_skill"));
    expect(screen.getByText("raw-skill")).toBeTruthy();
    expect(screen.queryByText("system.law.add")).toBeNull();
  });

  it("goes back to everything", () => {
    mount([bypass({ id: 1 }), bypass({ id: 2, kind: "no_verify", action_name: "git commit" })]);
    fireEvent.click(filterBtn("no_verify"));
    fireEvent.click(filterBtn("all"));
    expect(screen.getByText("system.law.add")).toBeTruthy();
    expect(screen.getByText("git commit")).toBeTruthy();
  });
});

describe("a bypass row", () => {
  it("records who, what, why and the outcome", () => {
    mount([bypass()]);
    expect(screen.getByText("human:dane")).toBeTruthy();
    expect(cell("god_dispatch")).toBeTruthy();
    expect(screen.getByText("system.law.add")).toBeTruthy();
    expect(screen.getByText("seeding the laws")).toBeTruthy();
    expect(cell("allowed")).toBeTruthy();
  });

  it("falls back to the law slug when there is no action", () => {
    mount([bypass({ action_name: null, law_slug: "NEVER_COMMIT_SECRETS" })]);
    expect(screen.getByText("NEVER_COMMIT_SECRETS")).toBeTruthy();
  });

  it("shows a dash when neither is recorded", () => {
    mount([bypass({ action_name: null, law_slug: null, reason: "x" })]);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("marks a MISSING reason as a finding, not as ordinary text", () => {
    mount([bypass({ reason: null })]);
    const cell = screen.getByText("—") as HTMLElement;
    expect(cell.style.fontStyle).toBe("italic");
    expect(cell.style.color).toBeTruthy();
  });

  it("colours a blocked outcome apart from an allowed one", () => {
    mount([bypass({ id: 1, outcome: "allowed" }), bypass({ id: 2, outcome: "blocked" })]);
    expect((cell("allowed") as HTMLElement).style.color)
      .not.toBe((cell("blocked") as HTMLElement).style.color);
  });

  it("colours each kind of escape distinctly, and falls back for an unknown one", () => {
    mount([
      bypass({ id: 1, kind: "god_dispatch" }), bypass({ id: 2, kind: "unsafe_skill" }),
      bypass({ id: 3, kind: "law_blocked" }), bypass({ id: 4, kind: "brand_new_kind" }),
    ]);
    const rowKind = (k: string) => (cell(k) as HTMLElement).style.color;
    expect(new Set([rowKind("god_dispatch"), rowKind("unsafe_skill"), rowKind("brand_new_kind")]).size).toBeGreaterThanOrEqual(2);
  });
});

describe("the empty state", () => {
  it("distinguishes loading from a genuinely clean log", () => {
    const { unmount } = mount([], { loading: true });
    expect(screen.getByText("loading…")).toBeTruthy();
    unmount();

    mount([]);
    expect(screen.getByText("no bypasses recorded")).toBeTruthy();
  });

  it("says nothing matches the filter without claiming the log is empty overall", () => {
    mount([bypass({ kind: "god_dispatch" })]);
    fireEvent.click(filterBtn("law_blocked"));
    expect(screen.getByText("no bypasses recorded")).toBeTruthy();
    expect(stat("total")).toContain("1");
  });
});
