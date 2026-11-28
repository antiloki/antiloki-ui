// Artifact exports v1 (research architecture plan, 2026-07-20): every artifact
// leaves in its NATURAL file type, client-side and deterministic — no server
// round-trip, no new dependency. .md = the body verbatim · .csv = the parsed
// markdown table · .html = a standalone pressed page (md2html) · pdf = the
// browser print pipeline over that page (a headless renderer is not warranted)
// · .png = the artifact's own SVG rasterized at 2x · .mp3 = the persisted
// soliloquy fetched from the BE stream endpoint.
import { md2html } from "./faculty-viz";
import { BE_URL } from "@/loki/api/client";

export const fileSlug = (s: string) =>
  String(s || "artifact").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "artifact";

export function dlBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const dlText = (name: string, text: string, mime: string) => dlBlob(name, new Blob([text], { type: mime }));

// the FIRST markdown table in the body → CSV (RFC-ish quoting); null when there is none.
export function mdTableToCsv(md: string): string | null {
  const lines = String(md ?? "").split(/\n/).map((l) => l.trim());
  const rows = lines.filter((l) => /^\|.*\|$/.test(l) && !/^\|[\s:|-]+\|$/.test(l))
    .map((l) => l.slice(1, -1).split("|").map((c) => c.trim().replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1")));
  if (!rows.length) return null;
  const cell = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}

// a standalone artifact page — dark on screen, clean light in print (the pdf door).
export function artifactHtml(title: string, md: string): string {
  const date = new Intl.DateTimeFormat("en-CA").format(new Date());
  return [
    `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${title.replace(/</g, "&lt;")}</title><style>`,
    `body{margin:0;background:#101216;color:#e8eaef;font:15px/1.7 Georgia,serif}`,
    `main{max-width:760px;margin:0 auto;padding:48px 24px 90px}`,
    `h1{font-size:28px;margin:0 0 6px}h2{font-size:20px;border-bottom:1px solid #2a2e39;padding-bottom:6px;margin-top:38px;color:#5fd1c4}h3{font-size:16px}`,
    `code{background:#1a1d25;padding:1px 6px;border-radius:4px;font-size:13px}ul{padding-left:22px}`,
    `table{border-collapse:collapse;width:100%;margin:14px 0;font-size:13.5px}th,td{border:1px solid #2a2e39;padding:6px 10px;text-align:left}th{color:#5fd1c4;font-family:monospace;font-size:11px;text-transform:uppercase}`,
    `.stamp{font:10.5px monospace;color:#778;margin-bottom:34px}`,
    `@media print{body{background:#fff;color:#16181d}h2{color:#0a6e63;border-color:#ccc}code{background:#f0f0f2}th{color:#0a6e63}th,td{border-color:#ccc}.stamp{color:#999}}`,
    `</style></head><body><main>`,
    `<h1>${title.replace(/</g, "&lt;")}</h1><div class="stamp">a research artifact · antiloki notebooks · ${date}</div>`,
    md2html(md),
    `</main></body></html>`,
  ].join("\n");
}

export function exportHtml(title: string, md: string) {
  dlText(`${fileSlug(title)}.html`, artifactHtml(title, md), "text/html;charset=utf-8");
}

// pdf = the print pipeline: open the pressed page and hand the user the system dialog.
export function printPdf(title: string, md: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(artifactHtml(title, md));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

// the artifact's own rendered SVG (mindmap / diagram) → a 2x PNG. Returns false when
// the card carries no SVG so the caller can say so instead of failing silently.
export async function exportPngFromSvg(container: HTMLElement, name: string): Promise<boolean> {
  const svg = container.querySelector("svg");
  if (!svg) return false;
  const rect = svg.getBoundingClientRect();
  const wpx = Math.max(1, Math.ceil(rect.width)), hpx = Math.max(1, Math.ceil(rect.height));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!clone.getAttribute("width")) clone.setAttribute("width", String(wpx));
  if (!clone.getAttribute("height")) clone.setAttribute("height", String(hpx));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("svg raster failed")); img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = wpx * 2; canvas.height = hpx * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.fillStyle = "#101216"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (!blob) return false;
    dlBlob(`${name}.png`, blob);
    return true;
  } finally { URL.revokeObjectURL(url); }
}

// the soliloquy's persisted mp3, fetched as a blob so the download name sticks
// (a cross-origin <a download> would navigate instead).
export async function exportMp3(itemId: number, title: string) {
  const r = await fetch(`${BE_URL}/api/v1/notebook/audio/${itemId}`);
  if (!r.ok) throw new Error(`audio fetch failed (${r.status})`);
  dlBlob(`${fileSlug(title)}.mp3`, await r.blob());
}
