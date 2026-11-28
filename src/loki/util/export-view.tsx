// EXPORT-VIEW (operator 2026-07-23: "add export button in all sidebar options / all file-review
// tabs · export in md or pdf"). One generic exporter for any rendered panel — the app styles
// everything inline, so a panel's DOM is self-contained: MD = its text, PDF = a faithful print
// window (the inline styles + inline SVGs travel with outerHTML; print-color-adjust keeps the look).
import React from "react";
import { C, mono } from "@/loki/theme";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const slug = (s: string) => (s.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "export");
const stamp = () => { try { return new Date().toISOString().slice(0, 10); } catch { return ""; } };

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}

function nodeToMd(node: HTMLElement): string {
  const txt = (node.innerText || "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const visual = node.querySelector("svg") ? "> This view includes a diagram — export as PDF to capture the visual.\n\n" : "";
  return visual + txt;
}

// The panels are styled with inline `style={{ color: C.brand, ... }}` where C.* are CSS variables
// (var(--c-*)) defined by a theme CLASS on <html> in styles.css. A blank print window has none of
// those variables, so everything collapsed to black text (operator 2026-07-23: "the pdfs are just
// text black and white … they should be the same as the screens"). Fix: BAKE the current theme's
// resolved custom properties into the print doc's :root, carry the theme class, and force color
// printing — so the popup renders identically to the screen.
function bakedRootVars(): { css: string; bg: string; fg: string } {
  const names = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try { rules = sheet.cssRules; } catch { continue; } // cross-origin sheet — skip
    if (!rules) continue;
    for (const rule of Array.from(rules) as any[]) {
      const st = rule.style as CSSStyleDeclaration | undefined;
      if (st && typeof st.length === "number") for (let i = 0; i < st.length; i++) { const p = st[i]; if (p && p.startsWith("--")) names.add(p); }
    }
  }
  const cs = getComputedStyle(document.documentElement);
  let out = "";
  names.forEach((n) => { const v = cs.getPropertyValue(n); if (v && v.trim()) out += `${n}:${v.trim()};`; });
  const bg = cs.getPropertyValue("--c-bg").trim() || "#0e0e11";
  const fg = cs.getPropertyValue("--c-fg").trim() || "#e7e7ea";
  return { css: out ? `:root{${out}}` : "", bg, fg };
}

// Build ONE self-contained HTML document: the current theme's resolved custom properties baked into
// :root, the theme class carried, colour printing forced, and the panel's outerHTML (inline styles +
// inline SVGs travel with it). Used for BOTH the PDF print window and the standalone .html download,
// so the two always look identical.
function buildStandaloneHtml(node: HTMLElement, title: string): string {
  const { css: rootVars, bg, fg } = bakedRootVars();
  const htmlClass = esc(document.documentElement.getAttribute("class") ?? "");
  return (
    `<!doctype html><html class="${htmlClass}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>` +
    `<style>` +
    rootVars +
    `html,body{margin:0;padding:0;background:${bg};color:${fg}}` +
    `body{padding:20px;font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}` +
    `h2{font-size:14px;margin:0 0 4px;font-weight:600}` +
    `.exp-meta{font-size:10px;opacity:.55;margin:0 0 14px}` +
    // print EVERY element's colours/backgrounds/SVG fills — not just body (that was why the PDF stayed B&W)
    `*{box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}` +
    // reveal content panels clip with overflow/fixed heights, without collapsing sized boxes or SVGs
    `.exp-root :not(svg):not(svg *){overflow:visible !important;max-height:none !important}` +
    `@page{margin:12mm}` +
    `</style></head><body>` +
    `<h2>${esc(title)}</h2><div class="exp-meta">exported ${stamp()}</div>` +
    `<div class="exp-root">${node.outerHTML}</div>` +
    `</body></html>`
  );
}

function printNode(node: HTMLElement, title: string) {
  const w = window.open("", "_blank", "width=1024,height=1200");
  if (!w) { window.alert("Allow pop-ups for this site to export as PDF (your browser blocked the print window)."); return; }
  w.document.write(buildStandaloneHtml(node, title));
  w.document.close(); w.focus();
  setTimeout(() => { try { w.print(); } catch { /* user can print manually */ } }, 500);
}

export function exportView(node: HTMLElement | null, title: string, fmt: "md" | "pdf" | "html") {
  if (!node) { window.alert("Nothing to export yet — open a view first."); return; }
  if (fmt === "md") download(`# ${title}\n\n_exported ${stamp()}_\n\n${nodeToMd(node)}\n`, `${slug(title)}.md`, "text/markdown;charset=utf-8");
  else if (fmt === "html") download(buildStandaloneHtml(node, title), `${slug(title)}.html`, "text/html;charset=utf-8");
  else printNode(node, title);
}

// the compact ⬇ md · pdf control — drops into any header. getNode is called at click time so it
// always reads the currently-rendered panel.
export function ExportButtons({ getNode, title, size = 8 }: { getNode: () => HTMLElement | null; title: string; size?: number }) {
  const b: React.CSSProperties = { background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: size, padding: "0 2px" };
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 3 }} title="export this view as Markdown, standalone HTML, or PDF">
      <span style={{ fontFamily: mono, fontSize: size, color: C.dim, opacity: 0.65 }}>⬇</span>
      <button style={b} onClick={() => exportView(getNode(), title, "md")} title="export as Markdown (.md)">md</button>
      <span style={{ color: C.dim, opacity: 0.4, fontSize: size }}>·</span>
      <button style={b} onClick={() => exportView(getNode(), title, "html")} title="export as a standalone HTML file (self-contained — theme + figures baked in)">html</button>
      <span style={{ color: C.dim, opacity: 0.4, fontSize: size }}>·</span>
      <button style={b} onClick={() => exportView(getNode(), title, "pdf")} title="export as PDF (opens a print window → Save as PDF)">pdf</button>
    </span>
  );
}
