// The failure feed's job is LEARNING, and the load-bearing derivation is the retryability axis:
// "structural" means a re-author cannot fix it (a human must change code or design), while
// "transient" self-heals. Getting that classification wrong sends the operator to fix infra when the
// design is broken, or to redesign when a socket blipped. The four states of the screen matter too —
// this screen replaced one that showed nothing while five tables were full of failures.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock("@/loki/api/client", () => ({
  apiGet: (...a: any[]) => apiGet(...a),
  apiPost: (...a: any[]) => apiPost(...a),
  isNotWired: (v: any) => !!(v && typeof v === "object" && v.__not_wired === true),
  unwrapResult: (r: any) => (r?.result ?? r) ?? null,
}));

import { FailuresScreen } from "./failures";

const row = (over: any = {}) => ({
  kind: "build_gate", ref_id: 1, ts: "2026-05-20 10:00:00", severity: "error",
  title: "npm run build failed", detail: "TS2304: cannot find name", pattern_key: "build:ts2304",
  card_slug: "FEAT-A", contract_slug: null, remedy_md: null, recovered: 0, dismissed: 0, ...over,
});
const group = (over: any = {}) => ({
  pattern_key: "build:ts2304", kind: "build_gate", count: 2, sample_title: "npm run build failed",
  first_ts: "2026-05-01 10:00:00", last_ts: "2026-05-20 10:00:00", cards: ["FEAT-A"], ...over,
});
const feed = (rows: any[], groups: any[] = [group()]) => ({
  rows, groups,
  stats: { total: rows.length, by_kind: rows.reduce((a: any, r) => ({ ...a, [r.kind]: (a[r.kind] ?? 0) + 1 }), {}), by_day: { "2026-05-20": rows.length } },
});

const mount = async (body: any) => {
  apiGet.mockResolvedValue(body);
  const r = render(<FailuresScreen />);
  await waitFor(() => expect(screen.queryByText(/aggregating ticks/)).toBeNull());
  return r;
};

beforeEach(() => { apiGet.mockReset(); apiPost.mockReset().mockResolvedValue({ ok: true }); });

describe("the four states of the screen", () => {
  it("says what it is aggregating while it loads", () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    render(<FailuresScreen />);
    expect(screen.getByText(/aggregating ticks · build gates · judgments/)).toBeTruthy();
  });

  it("tells the operator to restart when the route is not wired", async () => {
    await mount({ __not_wired: true });
    expect(screen.getByText(/isn't wired yet — restart the BE/)).toBeTruthy();
  });

  it("distinguishes a failed read from an unwired route", async () => {
    await mount({ nonsense: true });
    expect(screen.getByText(/can't reach \/api\/v1\/failures\/feed/)).toBeTruthy();
  });

  it("treats a thrown request as an error, not as a clean window", async () => {
    apiGet.mockRejectedValue(new Error("boom"));
    render(<FailuresScreen />);
    await waitFor(() => expect(screen.getByText(/can't reach/)).toBeTruthy());
  });

  it("celebrates a genuinely clean window and names the sources it checked", async () => {
    await mount(feed([], []));
    expect(screen.getByText(/a clean 30-day window — no recorded failures/)).toBeTruthy();
    expect(screen.getByText(/driver ticks, build gates, judgment courts/)).toBeTruthy();
  });
});

describe("the window", () => {
  it("asks for 30 days by default and re-reads when the window changes", async () => {
    await mount(feed([row()]));
    expect(apiGet.mock.calls[0][0]).toContain("days=30");
    fireEvent.click(screen.getByText("7d"));
    await waitFor(() => expect(apiGet.mock.calls[1][0]).toContain("days=7"));
  });

  it("re-reads on demand", async () => {
    await mount(feed([row()]));
    fireEvent.click(screen.getByText("↻"));
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  });
});

describe("the kind filter", () => {
  const two = feed([row({ kind: "build_gate", ref_id: 1 }), row({ kind: "tick", ref_id: 2, pattern_key: "tick:stuck", title: "tick stalled" })],
    [group(), group({ pattern_key: "tick:stuck", kind: "tick", count: 1 })]);

  it("counts every kind and offers one chip each", async () => {
    await mount(two);
    expect(screen.getByText("all 2")).toBeTruthy();
    expect(screen.getByText("build 1")).toBeTruthy();
    expect(screen.getByText("tick 1")).toBeTruthy();
  });

  it("narrows the feed to one kind and back", async () => {
    await mount(two);
    fireEvent.click(screen.getByText("≡ timeline"));
    expect(screen.getByText("npm run build failed")).toBeTruthy();

    fireEvent.click(screen.getByText("tick 1"));
    expect(screen.queryByText("npm run build failed")).toBeNull();
    expect(screen.getByText("tick stalled")).toBeTruthy();

    fireEvent.click(screen.getByText("tick 1"));      // clicking the active chip clears it
    expect(screen.getByText("npm run build failed")).toBeTruthy();
  });
});

describe("the control-center map", () => {
  it("classifies each failure kind onto the retryability axis", async () => {
    await mount(feed([
      row({ ref_id: 1, kind: "lint_gate", pattern_key: "lint:x" }),        // structural
      row({ ref_id: 2, kind: "build_gate", pattern_key: "build:x" }),      // retryable
      row({ ref_id: 3, kind: "ai_call", pattern_key: "provider timeout" }),// transient
      row({ ref_id: 4, kind: "notification", pattern_key: "notif:x" }),    // human
    ], []));
    // one of the four is structural; that is the number the operator acts on
    expect(screen.getByText("structural").previousSibling!.textContent).toBe("1");
  });

  it("counts a court judgment as structural — a re-author cannot argue with the verdict", async () => {
    await mount(feed([row({ kind: "judgment", pattern_key: "design:court" })], []));
    expect(screen.getByText("structural").previousSibling!.textContent).toBe("1");
  });

  it("summarises the window: failures, distinct patterns, cards touched, worst recurrence", async () => {
    await mount(feed(
      [row({ ref_id: 1, card_slug: "FEAT-A" }), row({ ref_id: 2, card_slug: "FEAT-B" })],
      [group({ count: 9 }), group({ pattern_key: "p2", count: 2 })],
    ));
    expect(screen.getByText("failures (window)").previousSibling!.textContent).toBe("2");
    expect(screen.getByText("distinct patterns").previousSibling!.textContent).toBe("2");
    expect(screen.getByText("cards touched").previousSibling!.textContent).toBe("2");
    expect(screen.getAllByText("×9").length).toBeGreaterThan(0);
  });
});

describe("the patterns lens", () => {
  const recurring = feed(
    [row({ ref_id: 1 }), row({ ref_id: 2, ts: "2026-05-19 10:00:00" })],
    [group({ count: 4 })],
  );
  const patterns = async (body: any = recurring) => {
    await mount(body);
    fireEvent.click(screen.getByText("⧉ patterns"));
  };

  it("shows each pattern with its recurrence count and window", async () => {
    await patterns();
    expect(screen.getByText("4×")).toBeTruthy();
    expect(screen.getByText("build:ts2304")).toBeTruthy();
    expect(screen.getByText(/05-01 10:00 → 05-20 10:00/)).toBeTruthy();
  });

  it("flags a recurring pattern as something to TEACH — that is the point of the screen", async () => {
    await patterns();
    expect(screen.getByText("recurring — teach it")).toBeTruthy();
  });

  it("does not nag about a one-off", async () => {
    await patterns(feed([row()], [group({ count: 1 })]));
    expect(screen.queryByText("recurring — teach it")).toBeNull();
  });

  it("expands to its member failures and the cards they hit", async () => {
    await patterns();
    expect(screen.queryByText("npm run build failed")).toBeNull();
    fireEvent.click(screen.getByText("build:ts2304"));
    expect(screen.getByText(/cards: FEAT-A/)).toBeTruthy();
    expect(screen.getAllByText("npm run build failed")).toHaveLength(2);
  });
});

describe("a failure's detail", () => {
  // one mount per scenario — a leftover screen makes every query ambiguous
  let mounted: { unmount: () => void } | null = null;
  const openDetail = async (r: any = row()) => {
    mounted?.unmount();
    mounted = await mount(feed([r]));
    fireEvent.click(screen.getByText("≡ timeline"));
    fireEvent.click(screen.getByText(r.title));
  };
  afterEach(() => { mounted?.unmount(); mounted = null; });

  it("shows the raw evidence verbatim", async () => {
    await openDetail();
    const pre = document.querySelector("pre") as HTMLElement;
    expect(pre.textContent).toBe("TS2304: cannot find name");
    expect(pre.style.whiteSpace).toBe("pre-wrap");
  });

  it("highlights the remedy when the substrate recorded one", async () => {
    await openDetail(row({ remedy_md: "add the missing import" }));
    expect(screen.getByText(/HOW TO PROCEED/)).toBeTruthy();
    expect(screen.getByText(/add the missing import/)).toBeTruthy();
  });

  it("marks a recovered or dismissed failure so it is not re-investigated", async () => {
    await openDetail(row({ recovered: 1, dismissed: 1 }));
    expect(screen.getByText("✓ recovered")).toBeTruthy();
    expect(screen.getByText("dismissed")).toBeTruthy();
  });

  it("copies a lesson containing the pattern, the evidence and the teach prompt", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await openDetail();
    fireEvent.click(screen.getByText(/copy as lesson/));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const md = writeText.mock.calls[0][0];
    expect(md).toContain("Failure lesson — build:ts2304");
    expect(md).toContain("TS2304: cannot find name");
    expect(md).toContain("card FEAT-A");
    expect(md).toContain("Recurring? Teach it");
    await waitFor(() => expect(screen.getByText("✓ copied")).toBeTruthy());
  });

  it("mints a risk tag carrying the prevention and the retryability, slugged from the pattern", async () => {
    await openDetail(row({ pattern_key: "build:TS 2304!", detail: "broke in src/a.tsx and lib/b.py", remedy_md: "import it" }));
    fireEvent.click(screen.getByText(/teach as risk tag/));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/api/v1/risk-tags", expect.objectContaining({
      slug: "build-ts-2304",
      prevention_md: "import it",
      retryability: "retryable",
      source_pattern_key: "build:TS 2304!",
    })));
    expect(apiPost.mock.calls[0][1].applies_to.langs.sort()).toEqual(["py", "tsx"]);
    await waitFor(() => expect(screen.getByText("✓ risk tag minted")).toBeTruthy());
  });

  it("says so when minting the tag fails, instead of claiming success", async () => {
    apiPost.mockRejectedValue(new Error("denied"));
    await openDetail();
    fireEvent.click(screen.getByText(/teach as risk tag/));
    await waitFor(() => expect(screen.getByText("✗ failed")).toBeTruthy());
  });

  it("offers the failure-advice snippet only for an UNCLASSIFIED build failure", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    await openDetail(row({ pattern_key: "build:unclassified" }));
    fireEvent.click(screen.getByText(/teach failure-advice/));
    await waitFor(() => expect(writeText.mock.calls[0][0]).toContain("failure-advice.mjs"));

    await openDetail(row({ pattern_key: "build:ts2304" }));
    expect(screen.queryByText(/teach failure-advice/)).toBeNull();
  });

  it("links an AI-call failure to its call only when the app exposes the opener", async () => {
    await openDetail(row({ kind: "ai_call", ref_id: 42, pattern_key: "provider timeout" }));
    expect(screen.queryByText(/open call #42/)).toBeNull();

    (window as any).antilokiOpenAICall = vi.fn();
    await openDetail(row({ kind: "ai_call", ref_id: 42, pattern_key: "provider timeout" }));
    fireEvent.click(screen.getByText(/open call #42/));
    expect((window as any).antilokiOpenAICall).toHaveBeenCalledWith(42);
    delete (window as any).antilokiOpenAICall;
  });
});
