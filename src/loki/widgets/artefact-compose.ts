// ARTEFACT COMPOSER — turn a widget's shaped information into a readable ARTICLE (a paper), 100%
// deterministic, no AI. Bespoke composers reshape a kind's real data into prose + tables + sections;
// everything else falls back to a structured pass over the rendered DOM (headings from the visual
// hierarchy, not a flat text dump). The result renders through ArtifactWidget's Markdown.
import { fetchFileCon } from "@/loki/codebase/atlas-decorators";
import { latestReport, getAtlas } from "@/loki/api/codebase";
import { apiPost } from "@/loki/api/client";
import type { Widget } from "./types";

// unwrap the dispatch envelope the same way the panels do (result.result ?? result ?? raw)
async function dispatch(action: string, input: any = {}, timeoutMs = 30000): Promise<any> {
  const r: any = await apiPost(`/api/v1/dispatch`, { action_name: action, input }, { timeoutMs });
  return r?.result?.result ?? r?.result ?? r;
}

// An artefact is either a rendered ARTICLE component (article + optionally its data — absent data means
// it's a RECIPE: the widget re-derives the data deterministically on render, $0) or a markdown body.
export type Artefact = { title: string; body_md?: string; article?: string; data?: any };

// the RECIPE executor — regenerate a deterministic article's data from the substrate. Used at render
// time by ArtifactWidget (recipe rows) and at save time to verify the substrate answers.
export async function fetchArticleData(article: string): Promise<any | null> {
  try {
    if (article === "xray") {
      const report = await latestReport({});
      if (!report) return null;
      // the report has no reliable file total — pull the real digest (files/symbols/edges/tokens) from the atlas
      let digest: any = null;
      try {
        const atlas: any = await getAtlas({ with_tokens: true });
        if (atlas) digest = {
          files: atlas.file_count ?? atlas.node_count ?? null,
          symbols: Math.max(0, (atlas.node_count ?? 0) - (atlas.file_count ?? 0)) || null,
          edges: atlas.edge_count ?? (atlas.edges?.length ?? null),
          tokens: atlas.total_tokens ?? null,
        };
      } catch { /* digest optional */ }
      return { ...report, _digest: digest };
    }
    if (article === "constitution") {
      const report = await dispatch("system.constitution.report", {});
      return report && ("constitution" in report || "summary" in report) ? report : null;
    }
  } catch { /* substrate unavailable */ }
  return null;
}

const stamp = () => { try { return new Date().toISOString().slice(0, 10); } catch { return ""; } };
const base = (p: string) => p.split("/").pop() || p;
const round = (n: any) => (n == null ? null : Math.round(Number(n)));

// ── bespoke: a file review as a court-grade REVIEW PAPER ──────────────────────
async function reviewArticle(path: string): Promise<Artefact | null> {
  const con: any = await fetchFileCon(path);
  if (!con) return null;
  const health = round(con.health);
  const vios: any[] = con.violations ?? [];
  const L: string[] = [];
  L.push(`# Code Review — ${base(path)}`, "", `\`${path}\``, "");
  L.push(`> A deterministic review — every number measured from the AST, no AI.`, "");
  L.push(`**Health ${health ?? "—"} / 100**${con.archetype ? ` · _${con.archetype}_` : ""} · ${vios.length ? `${vios.length} finding${vios.length === 1 ? "" : "s"}` : "clean"}`, "");
  const axes = Object.entries(con.axes ?? {}).filter(([, v]: any) => v && v.score != null);
  if (axes.length) {
    L.push(`## Health by axis`, "", `| axis | score |`, `| --- | ---: |`);
    for (const [k, v] of axes) L.push(`| ${k} | ${round((v as any).score)} |`);
    L.push("");
  }
  const s = con.signals ?? {};
  const sig: string[] = [];
  if (s.loc != null) sig.push(`- **${s.loc}** lines${s.complexity != null ? ` · complexity **${s.complexity}**` : ""}`);
  if (s.fan_in != null) sig.push(`- depended on by **${s.fan_in}** · depends on **${s.fan_out ?? 0}**`);
  if (s.covered != null) sig.push(`- ${s.covered ? "covered by tests ✓" : "**not covered by tests**"}`);
  if (s.authors != null) sig.push(`- **${s.authors}** author${s.authors === 1 ? "" : "s"}${s.churn != null ? ` · churn ${s.churn}` : ""}`);
  if (sig.length) L.push(`## Signals`, "", ...sig, "");
  L.push(`## Findings`, "");
  if (!vios.length) L.push(`_No problems found — a clean review._`, "");
  else for (const v of vios) {
    L.push(`### § ${v.title ?? v.law_key}${v.line != null ? ` · L${v.line}` : ""} · ${v.severity}`);
    const body = v.rule_md ?? v.evidence;
    if (body) L.push("", String(body));
    if (v.fix) L.push("", `**Fix.** ${v.fix}`);
    if (v.example?.good) L.push("", "```", "// after", String(v.example.good), "```");
    L.push("");
  }
  L.push(`---`, `*Generated ${stamp()} · deterministic · antiIDE*`);
  return { title: `Code Review — ${base(path)}`, body_md: L.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n" };
}

// ── fallback: reshape the rendered DOM into a structured article (leaf text, classified by the
// visual hierarchy — big/bold → headings, bold → strong, else prose) ──────────
function fmtLeaf(tx: string, fs: number, fw: number, mono: boolean): string {
  if (fs >= 15 || (fw >= 600 && fs >= 13)) return `\n## ${tx}\n`;
  if (fw >= 600) return `**${tx}**`;
  if (mono && tx.length <= 64 && !/\s{2,}/.test(tx)) return `\`${tx}\``;
  return tx;
}
export function articleFromNode(root: HTMLElement | null, title: string): string {
  const head = [`# ${title}`, "", `> A deterministic artefact — reshaped from the ${title} view, no AI.`, "", `*Captured ${stamp()}*`, "", "---", ""];
  if (!root) return [...head, "_(nothing to capture)_", ""].join("\n");
  const parts: string[] = [];
  const visit = (el: HTMLElement) => {
    if (el.children.length === 0) {
      const tx = (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (tx) { let fs = 12, fw = 400, mono = false; try { const cs = getComputedStyle(el); fs = parseFloat(cs.fontSize) || 12; fw = parseInt(cs.fontWeight) || 400; mono = /mono/i.test(cs.fontFamily); } catch { /* detached */ } parts.push(fmtLeaf(tx, fs, fw, mono)); }
      return;
    }
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === 3) { const tx = (c.textContent || "").replace(/\s+/g, " ").trim(); if (tx) parts.push(tx); }
      else if (c.nodeType === 1) visit(c as HTMLElement);
    }
  };
  try { visit(root); } catch { return [...head, (root.innerText ?? root.textContent ?? "").trim(), ""].join("\n"); }
  const body = parts.filter((p, i) => p && !(p === parts[i - 1])).join("\n\n");
  return [...head, body, ""].join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

const niceTitle = (w: Widget) => (w.kind === "vibe-pane" ? String((w.payload as any)?.paneKind ?? "pane") : w.kind).replace(/^atlas-|^vibe-/, "");

export async function composeArtefact(widget: Widget, node: HTMLElement | null): Promise<Artefact> {
  try {
    if (widget.kind === "atlas-review" && (widget.payload as any)?.path) {
      const a = await reviewArticle(String((widget.payload as any).path));
      if (a) return a;
    }
    // DETERMINISTIC articles persist as a RECIPE, not the data (operator 2026-07-25: the full report
    // blew past the 200k payload cap → the save 400'd → the artefact was silently ephemeral). They're
    // $0 to regenerate — ArtifactWidget re-fetches via fetchArticleData on render, so the stored row is
    // tiny and the article always reflects the latest rebuild. AI-written artefacts (body_md) still
    // persist FULLY — those cost money and can't be re-derived.
    if (widget.kind === "atlas-xray") {
      const data = await fetchArticleData("xray"); // verify the substrate answers before minting a recipe
      if (data) return { title: "Codebase X-ray", article: "xray" };
    }
    if (widget.kind === "atlas-constitution") {
      const data = await fetchArticleData("constitution");
      if (data) return { title: "The Constitution", article: "constitution" };
    }
    // (more bespoke article composers slot in here — graph, authors, docs …)
  } catch { /* fall through to the deterministic DOM reshape */ }
  const t = niceTitle(widget);
  return { title: `${t} · artefact`, body_md: articleFromNode(node, t) };
}
