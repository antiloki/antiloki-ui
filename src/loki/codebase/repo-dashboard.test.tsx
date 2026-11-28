// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RepoDashboard, calendar, compact, coverageBuckets, deltaText, digestFor, sparkPath, xrayBrief } from "./repo-dashboard";
import { screenPages, clearScreenState } from "@/loki/chat/screen-manifest";

const flags = vi.hoisted(() => ({ empty: false }));
vi.mock("@/loki/api/client", () => ({ apiPost: vi.fn(async (url: string) => {
  if (flags.empty) return url.endsWith("/codebase/report/latest") || url.endsWith("/codebase/metrics") ? null : (url.endsWith("/code/git") ? { is_git: false } : null);
  if (url.endsWith("/code/git")) return { is_git: true, branch: "main", commits: [{ sha: "abc1234def", author: "dan", subject: "first", date: new Date().toISOString() }, { sha: "bcd", author: "dan", subject: "second", date: new Date().toISOString() }, { sha: "cde", author: "dan", subject: "old", date: "2020-01-01T00:00:00Z" }] };
  if (url.endsWith("/codebase/report/latest")) return { report_id: 1, origin: "x", project: { health: 16, risk: 84 }, top_risk: [{ path: "src/big.ts", risk: 91, health: 12, factors: {} }, { path: "src/ok.ts", risk: 22, health: 80, factors: {} }], smells: [{ kind: "god", severity: "high", nodes: [], detail: "" }], vulns: [{ severity: "high" }], counts: { files: 412 }, created_at: "2026-09-18T10:00:00Z" };
  if (url.endsWith("/codebase/review-history")) return { snapshot_count: 3, file_count: 412, timeline: [{ id: 1, at: "a", files: 400, avg_health: 40, avg_score: 1 }, { id: 2, at: "b", files: 410, avg_health: 30, avg_score: 1 }, { id: 3, at: "c", files: 412, avg_health: 16, avg_score: 1 }], movers: { improved: [{ path: "src/ok.ts", from: 60, to: 80, delta: 20, series: [] }], regressed: [{ path: "src/big.ts", from: 40, to: 12, delta: -28, series: [] }] }, axes_drift: [] };
  if (url.endsWith("/codebase/history")) return { origin: "x", count: 3, points: [{ id: 3, at: "2026-09-18T10:00:00Z", files: 412, health: 16, risk: 84, cycles: 0, coverage: null, smells: 6, fan_in: 1 }, { id: 2, at: "2026-09-10T10:00:00Z", files: 410, health: 30, risk: 70, cycles: 0, coverage: null, smells: 4, fan_in: 1 }, { id: 1, at: "2026-09-01T10:00:00Z", files: 400, health: 40, risk: 60, cycles: 0, coverage: null, smells: 3, fan_in: 1 }], trend: { now: 16, month: null, quarter: null }, incident: null };
  if (url.endsWith("/codebase/coverage")) return { total_pct: 41, count: 10, ran: true, cmd: "npm test", files: [{ path: "src/big.ts", pct: 0, hit: 0, total: 10 }, { path: "src/ok.ts", pct: 90, hit: 9, total: 10 }] };
  if (url.endsWith("/code/authors")) return { root: "/", commit_count: 1234, author_count: 2, authors: [{ id: "d", name: "dan", email: "", commits: 1000, files: 300, first: "", last: "", solo: 200, files_list: [] }], files: [], edges: [], codep: [], bus_factor: { total_files: 412, solo_files: 300, top_solo: [] } };
  if (url.endsWith("/codebase/metrics")) return { metrics_by_file: { "src/big.ts": { fan_in: 9, fan_out: 2, loc: 900, symbol_count: 30, is_test: false, covered: false, gravity: 80, badness: 0.9, churn: 12, gravity_parts: { size: 0.9, complexity: 0.5, coupling: 0.9, density: 0.2, churn: 0.9, untested: 1 } }, "src/ok.ts": { fan_in: 1, fan_out: 1, loc: 40, symbol_count: 3, is_test: false, covered: true, gravity: 10, badness: 0.1, churn: 1 }, "src/ok.test.ts": { fan_in: 0, fan_out: 1, loc: 20, symbol_count: 1, is_test: true, covered: true, gravity: 5, badness: 0 } } };
  return { result: { result: { constitution: {}, by_law: [{ law_key: "NO_GOD_FILE", title: "No god files", n: 14, mass: 90, scope: "file" }, { law_key: "TESTS", title: "t", n: 3, mass: 10, scope: "file" }], deltas: { health: -6, from_snapshot: 2 } } } };
}) }));

describe("the repo dashboard (2026-09-18): an integrated analytics page — KPIs, then charts that carry the data", () => {
  it("pure bits: compact numbers, the sparkline path, the delta line, the commit calendar, the coverage buckets", () => {
    expect(compact(1234)).toBe("1234"); expect(compact(12_900)).toBe("12.9K"); expect(compact(4_200_000)).toBe("4.2M"); expect(compact(null)).toBe("—");
    expect(sparkPath([0, 100])).toBe("M0.0,24.0L96.0,0.0"); expect(sparkPath([50, null, 50], 96, 24)).toBe("M0.0,12.0M96.0,12.0");
    expect(deltaText([40, 30, 16])).toEqual({ text: "-14 vs previous snapshot", dir: "down" }); expect(deltaText([5])).toBeNull();
    const today = new Date("2026-09-18T12:00:00Z");
    const cal = calendar(["2026-09-18T09:00:00Z", "2026-09-18T10:00:00Z", "2026-09-17T10:00:00Z", "2020-01-01T00:00:00Z"], today);
    expect(cal.max).toBe(2); expect(cal.cells[cal.cells.length - 1]).toMatchObject({ date: "2026-09-18", n: 2, day: 5 });
    expect(cal.cells.length).toBeGreaterThan(364); expect(cal.months[0].label).toBe("Sep"); expect(cal.months.length).toBeGreaterThanOrEqual(12);
    expect(coverageBuckets([0, 5, 25, 61, 99, 100]).map((b) => b.n)).toEqual([2, 1, 0, 1, 2]);
  });
  it("renders the KPIs, the over-time chart with its tooltip, the treemap, the hotspots, the calendar, the bars; a box opens the file, ⤢ opens the analysis", async () => {
    const onOpen = vi.fn(); const onOpenFile = vi.fn();
    localStorage.removeItem("antiloki:ide-dash-tab");
    render(<RepoDashboard onOpen={onOpen} onOpenFile={onOpenFile} extra={[{ key: "x-happened", title: "X", tab: "happened", node: () => <b>EXTRA-HAPPENED</b> }, { key: "x-breaks", title: "Y", tab: "breaks", node: () => <b>EXTRA-BREAKS</b> }]} />);
    await waitFor(() => expect(screen.getByTestId("kpi-health").textContent).toContain("16"));
    expect(screen.getByTestId("kpi-health").getAttribute("title")).toContain("-14 vs previous snapshot"); // the mini verdict: icons + numbers, the words in the tooltip
    // drag a section → the context payload names it and carries its text
    const set = vi.fn(); const dt = { setData: set, effectAllowed: "" } as any;
    fireEvent.dragStart(screen.getByTestId("repo-grip-hotspots"), { dataTransfer: dt });
    expect(set).toHaveBeenCalledWith("application/x-antiloki-context", expect.stringContaining("Hotspots"));
    fireEvent.dragStart(screen.getByTestId("repo-verdict").querySelector("[draggable]")!, { dataTransfer: dt });
    expect(set).toHaveBeenLastCalledWith("text/plain", expect.stringContaining("[context · The verdict]"));
    expect(screen.getByTestId("kpi-risk").textContent).toContain("84");
    await waitFor(() => expect(screen.getByTestId("over-time")).toBeTruthy());
    fireEvent.mouseMove(screen.getByTestId("over-time"), { clientX: 900, clientY: 50 });
    await waitFor(() => expect(screen.getByTestId("over-time-tip").textContent).toContain("health 16"));
    await waitFor(() => expect(screen.getByTestId("repo-treemap").querySelectorAll("rect").length).toBe(2)); // the test file is not on the map
    fireEvent.click(screen.getByTestId("repo-treemap").querySelector("g")!);
    expect(onOpenFile).toHaveBeenCalledWith("src/big.ts");
    await waitFor(() => expect(screen.getByTestId("repo-calendar")).toBeTruthy());
    expect(screen.getByTestId("repo-panel-activity").textContent).toContain("3 commits in the window");
    await waitFor(() => expect(screen.getByTestId("repo-movers").textContent).toContain("40 → 12"));
    fireEvent.click(screen.getByTestId("repo-panel-hotspots").querySelector("button[title='the full analysis']")!);
    expect(onOpen).toHaveBeenCalledWith("insights");
    // the tabs: one dashboard per question; extra sections land on their tab and render lazily
    fireEvent.click(screen.getByTestId("dash-tab-hurt"));
    await waitFor(() => expect(screen.getByTestId("repo-laws").textContent).toContain("NO_GOD_FILE"));
    expect(screen.getByTestId("repo-panel-laws").textContent).toContain("health ▼ -6 since snapshot #2");
    await waitFor(() => expect(screen.getByTestId("repo-coverage").textContent).toContain("0–20%"));
    expect(screen.queryByTestId("repo-treemap")).toBeNull();
    fireEvent.click(screen.getByTestId("dash-tab-overview"));
    await waitFor(() => expect(screen.getByTestId("repo-authors").textContent).toContain("dan")); // authors ride Activity
    expect(screen.getByTestId("repo-commits").textContent).toContain("abc1234");
    fireEvent.click(screen.getByTestId("dash-tab-happened"));
    expect(screen.queryByTestId("kpi-health")).toBeNull(); // the verdict is the Overview's
    expect(screen.getByTestId("repo-panel-x-happened").textContent).toContain("EXTRA-HAPPENED");
    expect(screen.queryByTestId("repo-panel-x-breaks")).toBeNull();
    fireEvent.click(screen.getByTestId("dash-tab-breaks"));
    expect(screen.getByTestId("repo-panel-x-breaks").textContent).toContain("EXTRA-BREAKS");
    expect(localStorage.getItem("antiloki:ide-dash-tab")).toBe("breaks");
  });
});

describe("the intro + daily digest per dashboard (2026-09-18) — deterministic, from the loaded data", () => {
  const now = new Date("2026-09-18T20:00:00Z");
  const d = {
    report: { report_id: 1, origin: "x", project: { health: 63, risk: 37 }, smells: [{ kind: "god", severity: "high", nodes: [], detail: "" }], vulns: [], counts: { files: 2171 } } as any,
    hist: { snapshot_count: 6, file_count: 2171, timeline: [], movers: { improved: [{ path: "src/ok.ts", from: 60, to: 80, delta: 20, series: [] }], regressed: [{ path: "src/big.ts", from: 40, to: 12, delta: -28, series: [] }] }, axes_drift: [] } as any,
    arch: { origin: "x", count: 2, points: [{ id: 3, at: "2026-09-18", files: 2171, health: 63, risk: 37, cycles: 4, coverage: 41, smells: 6 }, { id: 2, at: "2026-09-10", files: 2160, health: 64, risk: 36, cycles: 3, coverage: 40, smells: 5 }], trend: { now: 63, month: null, quarter: null }, incident: { severity: "medium", summary: "3 new cycles in packages/react-reconciler", at: "", from_at: "" } } as any,
    laws: { by_law: [{ law_key: "NO_GOD_FILE", n: 14, mass: 90 }, { law_key: "TESTS", n: 3, mass: 10 }], deltas: { health: -6, from_snapshot: 2, worse: [{ path: "src/big.ts" }] } },
    cov: { total_pct: 41, count: 10, ran: true, files: [] } as any,
    authors: { author_count: 12, commit_count: 1234, authors: [], bus_factor: { total_files: 2171, solo_files: 1150, top_solo: [] } } as any,
    commits: [{ sha: "abc1234def", author: "dan", date: "2026-09-18T10:00:00Z", subject: "first" }, { sha: "bcd", author: "dan", date: "2026-09-18T09:00:00Z", subject: "second" }, { sha: "cde", author: "old", date: "2026-09-01T00:00:00Z", subject: "old" }],
    metrics: [{ path: "src/hub.ts", fan_in: 40 } as any, { path: "src/leaf.ts", fan_in: 1 } as any],
    now,
  };
  it("Overview: the numbers and the movers; Quality: laws + coverage; Architecture: cycles + the incident; History: commits by author", () => {
    const o = digestFor("overview", d);
    expect(o.intro).toContain("2171 files judged · health 63 (-1 since the previous snapshot) · risk 37 · 1 smell");
    expect(o.today).toEqual(["2 commits in the last 24 h by dan (2)", "health -1 · risk +1 since snapshot #2", "most regressed: src/big.ts (40 → 12)", "most improved: src/ok.ts (60 → 80)"]);
    const q = digestFor("hurt", d);
    expect(q.intro).toContain("17 violations across 2 laws — heaviest: NO_GOD_FILE. Coverage 41%");
    expect(q.today).toEqual(["law-score health -6 since snapshot #2", "worse: src/big.ts", "coverage +1 pts", "smells +1"]);
    const a = digestFor("breaks", d);
    expect(a.intro).toContain("4 import cycles. The most depended-on file is src/hub.ts (fan-in 40).");
    expect(a.today[0]).toBe("import cycles +1"); expect(a.today).toContain("medium: 3 new cycles in packages/react-reconciler");
    const h = digestFor("happened", d);
    expect(h.intro).toContain("6 snapshots. 12 authors, 1234 commits, 1150 of 2171 files with a single author.");
    expect(h.today.slice(0, 3)).toEqual(["2 commits in the last 24 h by dan (2)", "abc1234 first", "bcd second"]);
    expect(digestFor("overview", { now }).today).toEqual(["nothing changed since the previous snapshot"]);
    expect(digestFor("code", d).intro).toBe("");
  });

  // THE X-RAY BRIEF (2026-09-19): the chat reads what the operator reads — the tab, the digest, then
  // every number the dashboard holds. Deterministic: same data → same page.
  it("xrayBrief: the open tab and its sections first, then verdict · riskiest · heaviest · hubs · laws · movers · authors · activity", () => {
    const md = xrayBrief("overview", { ...d, report: { ...d.report, top_risk: [{ path: "src/big.ts", risk: 91, health: 12, factors: {} }] }, metrics: [{ path: "src/hub.ts", fan_in: 40, fan_out: 1, loc: 900, complexity: 30, covered: false, gravity: 80 } as any, { path: "src/leaf.ts", fan_in: 1, fan_out: 3, loc: 20, covered: true, gravity: 2 } as any] }, ["The verdict", "Activity"]);
    const lines = md.split("\n");
    expect(lines[0]).toBe("X-ray (the code analysis screen, LEFT of the chat) — open tab: Overview");
    expect(lines[1]).toBe("sections on this tab, top to bottom: The verdict · Activity");
    expect(md).toContain("Overview: 2171 files judged · health 63");
    expect(md).toContain("today: 2 commits in the last 24 h by dan (2)");
    expect(md).toContain("verdict: 2171 files · health 63 · risk 37 · 1 smells · 0 vulnerable deps · coverage 41% · 4 import cycles");
    expect(md).toContain("riskiest files: src/big.ts (risk 91, health 12)");
    expect(md).toContain("heaviest files (mass = size·complexity·coupling): src/hub.ts (loc 900, cx 30, in 40/out 1, untested); src/leaf.ts (loc 20, cx ?, in 1/out 3)");
    expect(md).toContain("most depended-on: src/hub.ts (40 importers); src/leaf.ts (1 importers)");
    expect(md).toContain("laws broken most: NO_GOD_FILE ×14, TESTS ×3");
    expect(md).toContain("regressed since the previous snapshot: src/big.ts 40→12");
    expect(md).toContain("improved: src/ok.ts 60→80");
    expect(md).toContain("review history: 6 snapshots · 2171 files judged");
    expect(md).toContain("health over time: 2026-09-10 64 → 2026-09-18 63");
    expect(md).toContain("bus factor: 1150/2171 files solo-owned");
    expect(md).toContain("activity: 3 commits in the window · latest: abc1234 first (dan, 2026-09-18T10:00:00Z)");
    expect(xrayBrief("hurt", { now: d.now })).toBe("X-ray (the code analysis screen, LEFT of the chat) — open tab: Quality\nQuality: Where the code breaks its own rules and what the tests never reach. No constitution snapshot yet.\ntoday: nothing changed since the previous snapshot");
    // the same data twice → the same page (the chat's context must not flicker)
    expect(xrayBrief("overview", d)).toBe(xrayBrief("overview", d));
  });

  it("the dashboard PUBLISHES the brief as the 'xray' screen page and clears it on unmount", async () => {
    clearScreenState("xray");
    localStorage.removeItem("antiloki:ide-dash-tab");
    const { unmount } = render(<RepoDashboard onOpen={vi.fn()} onOpenFile={vi.fn()} extra={[{ key: "diagram", title: "System diagram", tab: "breaks", node: () => <b>D</b> }]} />);
    await waitFor(() => expect(Object.fromEntries(screenPages()).xray).toContain("verdict: 412 files · health 16 · risk 84"));
    expect(Object.fromEntries(screenPages()).xray).toContain("open tab: Overview");
    fireEvent.click(screen.getByTestId("dash-tab-breaks"));
    await waitFor(() => expect(Object.fromEntries(screenPages()).xray).toContain("open tab: Architecture\nsections on this tab, top to bottom: System diagram"));
    unmount();
    expect(Object.fromEntries(screenPages()).xray).toBeUndefined();
  });

  // FIRST RUN (2026-09-18): a fresh workspace shows one card that says what a rebuild does and offers it,
  // instead of six empty charts.
  it("a never-analyzed repository shows the 'analyze this repository' card with the rebuild verb", async () => {
    flags.empty = true;
    try {
      const onRebuild = vi.fn();
      localStorage.removeItem("antiloki:ide-dash-tab");
      render(<RepoDashboard onOpen={vi.fn()} onOpenFile={vi.fn()} onRebuild={onRebuild} />);
      await waitFor(() => expect(screen.getByText("This repository has not been analyzed yet")).toBeTruthy());
      fireEvent.click(screen.getByText("↻ analyze this repository"));
      expect(onRebuild).toHaveBeenCalled();
      expect(screen.queryByTestId("repo-treemap")).toBeNull();
    } finally { flags.empty = false; }
  });
});
