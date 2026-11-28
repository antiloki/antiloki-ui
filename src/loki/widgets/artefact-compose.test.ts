// Composing an artefact is the "save this widget as a paper" path. Two things here have already
// cost real artefacts: a deterministic article must persist as a RECIPE (an article id) rather than
// its data — the full x-ray report blew past the 200k payload cap, the save 400'd, and the artefact
// was silently ephemeral — and the whole compose must NEVER throw, because it runs on a click with
// no error surface: an unreachable substrate has to degrade into the DOM reshape, not a dead button.
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchFileCon = vi.fn();
const latestReport = vi.fn();
const getAtlas = vi.fn();
const apiPost = vi.fn();

vi.mock("@/loki/codebase/atlas-decorators", () => ({ fetchFileCon: (...a: any[]) => fetchFileCon(...a) }));
vi.mock("@/loki/api/codebase", () => ({
  latestReport: (...a: any[]) => latestReport(...a),
  getAtlas: (...a: any[]) => getAtlas(...a),
}));
vi.mock("@/loki/api/client", () => ({ apiPost: (...a: any[]) => apiPost(...a) }));

import { composeArtefact, fetchArticleData } from "./artefact-compose";

// jsdom has no innerText; the composer reads it to get a leaf's visible text. Mirror textContent so
// the DOM-reshape path is exercised the way a browser would run it.
Object.defineProperty(HTMLElement.prototype, "innerText", {
  configurable: true,
  get(this: HTMLElement) { return this.textContent ?? ""; },
});

const widget = (kind: string, payload: any = {}) => ({ kind, payload }) as any;

const node = (html: string): HTMLElement => {
  const d = document.createElement("div");
  d.innerHTML = html;
  document.body.appendChild(d);
  return d;
};

beforeEach(() => {
  fetchFileCon.mockReset(); latestReport.mockReset(); getAtlas.mockReset(); apiPost.mockReset();
  latestReport.mockResolvedValue(null); getAtlas.mockResolvedValue(null);
  apiPost.mockResolvedValue(null); fetchFileCon.mockResolvedValue(null);
  document.body.innerHTML = "";
});

describe("fetchArticleData — the recipe executor", () => {
  it("merges the atlas digest into the x-ray report because the report has no file total", async () => {
    latestReport.mockResolvedValue({ project: "p", score: 80 });
    getAtlas.mockResolvedValue({ node_count: 120, file_count: 20, edge_count: 300, total_tokens: 9000 });
    const d = await fetchArticleData("xray");
    expect(d).toMatchObject({ project: "p", _digest: { files: 20, symbols: 100, edges: 300, tokens: 9000 } });
    expect(getAtlas).toHaveBeenCalledWith({ with_tokens: true });
  });

  it("still returns the report when the digest read fails — the digest is optional", async () => {
    latestReport.mockResolvedValue({ project: "p" });
    getAtlas.mockRejectedValue(new Error("down"));
    expect(await fetchArticleData("xray")).toMatchObject({ project: "p", _digest: null });
  });

  it("falls back to the node count when the atlas reports no file count", async () => {
    latestReport.mockResolvedValue({ project: "p" });
    getAtlas.mockResolvedValue({ node_count: 10, edges: [1, 2] });
    const d: any = await fetchArticleData("xray");
    expect(d._digest).toEqual({ files: 10, symbols: 10, edges: 2, tokens: null });
  });

  it("returns null when there is no report to build the x-ray from", async () => {
    latestReport.mockResolvedValue(null);
    expect(await fetchArticleData("xray")).toBeNull();
  });

  it("unwraps the constitution report through the dispatch envelope", async () => {
    apiPost.mockResolvedValue({ result: { result: { constitution: { articles: [] } } } });
    expect(await fetchArticleData("constitution")).toEqual({ constitution: { articles: [] } });
    expect(apiPost.mock.calls[0][1]).toMatchObject({ action_name: "system.constitution.report" });
  });

  it("rejects a constitution body that carries neither constitution nor summary", async () => {
    apiPost.mockResolvedValue({ result: { unrelated: 1 } });
    expect(await fetchArticleData("constitution")).toBeNull();
  });

  it("returns null for an article it does not know how to regenerate", async () => {
    expect(await fetchArticleData("nope")).toBeNull();
  });

  it("swallows a thrown substrate error rather than breaking the render", async () => {
    latestReport.mockRejectedValue(new Error("boom"));
    expect(await fetchArticleData("xray")).toBeNull();
  });
});

describe("a file review composes into a court-grade review paper", () => {
  const con = {
    health: 72.4,
    archetype: "orchestrator",
    axes: { cohesion: { score: 80.6 }, coupling: { score: 40 }, empty: null },
    signals: { loc: 120, complexity: 9, fan_in: 4, fan_out: 2, covered: 0, authors: 1, churn: 3 },
    violations: [
      { title: "God file", law_key: "L1", line: 12, severity: "high", rule_md: "too much", fix: "split it", example: { good: "const a = 1" } },
    ],
  };

  const compose = (payload: any = { path: "src/a.ts" }) => composeArtefact(widget("atlas-review", payload), null);

  it("titles the paper after the file's basename and keeps the full path in the body", async () => {
    fetchFileCon.mockResolvedValue(con);
    const a = await compose({ path: "src/deep/a.ts" });
    expect(a.title).toBe("Code Review — a.ts");
    expect(a.body_md).toContain("`src/deep/a.ts`");
  });

  it("rounds the health score and names the archetype", async () => {
    fetchFileCon.mockResolvedValue(con);
    const { body_md } = await compose();
    expect(body_md).toContain("**Health 72 / 100**");
    expect(body_md).toContain("_orchestrator_");
  });

  it("tabulates only the axes that actually scored", async () => {
    fetchFileCon.mockResolvedValue(con);
    const { body_md } = await compose();
    expect(body_md).toContain("| cohesion | 81 |");
    expect(body_md).toContain("| coupling | 40 |");
    expect(body_md).not.toContain("| empty |");
  });

  it("spells out the signals, including the uncovered warning", async () => {
    fetchFileCon.mockResolvedValue(con);
    const { body_md } = await compose();
    expect(body_md).toContain("**120** lines");
    expect(body_md).toContain("**not covered by tests**");
    expect(body_md).toContain("**1** author"); // singular, not "1 authors"
  });

  it("renders each finding with its line, severity, rule, fix and example", async () => {
    fetchFileCon.mockResolvedValue(con);
    const { body_md } = await compose();
    expect(body_md).toContain("### § God file · L12 · high");
    expect(body_md).toContain("too much");
    expect(body_md).toContain("**Fix.** split it");
    expect(body_md).toContain("const a = 1");
    expect(body_md).toContain("1 finding"); // singular again
  });

  it("says so plainly when a file is clean", async () => {
    fetchFileCon.mockResolvedValue({ ...con, violations: [] });
    const { body_md } = await compose();
    expect(body_md).toContain("clean");
    expect(body_md).toContain("_No problems found — a clean review._");
  });

  it("survives a con with nothing but a path", async () => {
    fetchFileCon.mockResolvedValue({});
    const { body_md } = await compose();
    expect(body_md).toContain("**Health — / 100**");
    expect(body_md).toContain("_No problems found");
  });

  it("falls back to the DOM reshape when the file has no con at all", async () => {
    fetchFileCon.mockResolvedValue(null);
    const a = await composeArtefact(widget("atlas-review", { path: "a.ts" }), node("<div>fallback</div>"));
    expect(a.title).toBe("review · artefact");
  });

  it("does not attempt a review paper without a path", async () => {
    const a = await composeArtefact(widget("atlas-review", {}), node("<div>x</div>"));
    expect(fetchFileCon).not.toHaveBeenCalled();
    expect(a.title).toBe("review · artefact");
  });
});

describe("deterministic articles persist as a recipe, never as their data", () => {
  it("mints {article:'xray'} with no payload once the substrate answers", async () => {
    latestReport.mockResolvedValue({ project: "p" });
    const a = await composeArtefact(widget("atlas-xray"), node("<div>x</div>"));
    expect(a).toEqual({ title: "Codebase X-ray", article: "xray" });
    expect(a.data).toBeUndefined();
    expect(a.body_md).toBeUndefined();
  });

  it("mints {article:'constitution'} the same way", async () => {
    apiPost.mockResolvedValue({ result: { summary: "s" } });
    expect(await composeArtefact(widget("atlas-constitution"), node("<div>x</div>")))
      .toEqual({ title: "The Constitution", article: "constitution" });
  });

  it("falls back to the DOM reshape when the substrate cannot answer — no empty recipe is minted", async () => {
    latestReport.mockResolvedValue(null);
    const a = await composeArtefact(widget("atlas-xray"), node("<div>still something</div>"));
    expect(a.article).toBeUndefined();
    expect(a.body_md).toContain("still something");
  });
});

describe("the DOM reshape is the universal fallback", () => {
  it("names the artefact after the widget kind, stripped of its family prefix", async () => {
    expect((await composeArtefact(widget("atlas-graph"), node("<div>a</div>"))).title).toBe("graph · artefact");
    expect((await composeArtefact(widget("vibe-thing"), node("<div>a</div>"))).title).toBe("thing · artefact");
  });

  it("uses the pane kind for a vibe pane, which is otherwise a meaningless title", async () => {
    const a = await composeArtefact(widget("vibe-pane", { paneKind: "terminal" }), node("<div>a</div>"));
    expect(a.title).toBe("terminal · artefact");
  });

  it("says nothing-to-capture instead of producing an empty document", async () => {
    const a = await composeArtefact(widget("atlas-graph"), null);
    expect(a.body_md).toContain("_(nothing to capture)_");
  });

  it("opens with the title, a provenance line and a date", async () => {
    const { body_md } = await composeArtefact(widget("atlas-graph"), node("<div>body text</div>"));
    expect(body_md!.startsWith("# graph")).toBe(true);
    expect(body_md).toContain("deterministic artefact");
    expect(body_md).toMatch(/\*Captured \d{4}-\d{2}-\d{2}\*/);
  });

  it("promotes big or bold leaves to headings and marks bold text as strong", async () => {
    const { body_md } = await composeArtefact(widget("atlas-graph"), node(
      `<div style="font-size:18px">A Section</div>` +
      `<div style="font-weight:700;font-size:12px">Emphasised</div>` +
      `<div style="font-size:12px">plain prose</div>`,
    ));
    expect(body_md).toContain("## A Section");
    expect(body_md).toContain("**Emphasised**");
    expect(body_md).toContain("plain prose");
  });

  it("collapses runs of whitespace and drops a leaf that repeats the one before it", async () => {
    const { body_md } = await composeArtefact(widget("atlas-graph"), node(
      "<div>same</div><div>same</div><div>  spaced    out  </div>",
    ));
    expect(body_md).toContain("spaced out");
    expect(body_md!.match(/same/g)).toHaveLength(1);
  });

  it("descends into nested structure instead of flattening one blob of text", async () => {
    const { body_md } = await composeArtefact(widget("atlas-graph"), node(
      "<section><header><div>Alpha</div></header><div><span>Beta</span></div></section>",
    ));
    expect(body_md).toContain("Alpha");
    expect(body_md).toContain("Beta");
  });

  it("never leaves three blank lines in the output", async () => {
    const { body_md } = await composeArtefact(widget("atlas-graph"), node(
      `<div style="font-size:18px">H</div><div style="font-size:18px">H2</div>`,
    ));
    expect(body_md).not.toMatch(/\n{3}/);
  });
});
