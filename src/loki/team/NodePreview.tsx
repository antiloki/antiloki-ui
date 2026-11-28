// A MINI PREVIEW BESIDE A NODE (the operator 2026-11-20: "nodes with outputs like designs, videos, reports, htmls should have mini previews on the graph, like linked to them a box"): what the node made, small, next to it on the graph.
// A page or drawing is shown as the page itself, scaled down in a frame with no scripts; a report as its first lines; a picture or a video as itself. A click opens it in the glass window. The pure parts are tested.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { getArtifact, getResult, mediaUrl, type Media } from "./api";
import { BE_URL } from "@/loki/api/client";
import { frameDoc } from "./frameDoc";
import { GlassView } from "./GlassView";
import { Markdown, highlight } from "@/loki/components/Markdown";
import type { Artifact } from "./types";

export const PREVIEW_W = 132; export const PREVIEW_H = 86;
export type PreviewSource = { kind: "page" | "text" | "image" | "video"; title: string; artifact?: string; file?: string; /** the run's MASTER PAGE (what the Result and files tab shows), not one artifact */ result?: boolean; /** a document's format (md, txt, json, csv): how it is drawn */ format?: string };
/** What an artifact node's output is shown as: a page or drawing as itself, a document as its text. Pure. */
export function artifactPreview(a: { name: string; format: string }): PreviewSource | null {
  const f = a.format.toLowerCase(); const file = `${a.name}.${f}`;
  if (f === "html" || f === "svg") return { kind: "page", title: a.name, artifact: file };
  if (["md", "txt", "json", "csv"].includes(f)) return { kind: "text", title: a.name, artifact: file, format: f };
  if (["png", "jpg", "gif", "webp"].includes(f)) return { kind: "image", title: a.name, file };
  if (["mp4", "webm", "mov"].includes(f)) return { kind: "video", title: a.name, file };
  return null;
}
/** A bundle of files in one text (`=== path/File.tsx ===` before each): the notes above the first marker, then each file. null when the text is not a bundle. Pure. */
export function parseBundle(text: string): { notes: string; files: { path: string; code: string }[] } | null {
  const re = /^=== (.+?) ===[ \t]*$/gm; const hits: { path: string; start: number; end: number }[] = []; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) hits.push({ path: m[1].trim(), start: m.index, end: m.index + m[0].length });
  if (!hits.length) return null;
  const files = hits.map((h, i) => ({ path: h.path, code: text.slice(h.end, i + 1 < hits.length ? hits[i + 1].start : text.length).replace(/^\r?\n/, "").replace(/\s+$/, "") }));
  return { notes: text.slice(0, hits[0].start).trim(), files };
}
/** Notes that letter their sub-points (`  (a) …`, indented under a bullet) get each as a list item, so they do not run together as one paragraph. Pure. */
export function notesAsList(notes: string): string { return notes.replace(/^[ \t]+\(([a-z0-9]{1,2})\)[ \t]+/gm, "- ($1) ").replace(/^- ([A-Z][A-Za-z0-9 /-]{1,28}):[ \t]/gm, "- **$1:** "); }
const langOf = (path: string) => (path.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase().replace("tsx", "ts").replace("jsx", "js");
/** A file of a bundle: its name on top with its length and a Copy button, then the code with line numbers, not wrapped, in colour. */
function CodeFile({ path, code, big }: { path: string; code: string; big: boolean }) {
  const [copied, setCopied] = React.useState(false); const lines = code.split("\n");
  return (
    <div data-testid="bundle-file" style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", background: "oklch(0.13 0.005 250)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 12, color: C.fg }}>
        <span style={{ fontWeight: 600 }}>{path}</span><span style={{ color: C.dim }}>{lines.length} lines</span>
        {big && <button data-testid="bundle-copy" onClick={() => { void navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{ marginLeft: "auto", background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 10px", cursor: "pointer", fontFamily: nav, fontSize: 11.5 }}>{copied ? "Copied" : "Copy"}</button>}
      </div>
      <div style={{ display: "flex", overflowX: "auto", maxHeight: big ? 560 : undefined, overflowY: big ? "auto" : "hidden" }}>
        <div aria-hidden style={{ padding: "10px 10px 10px 12px", textAlign: "right", color: C.dim, fontFamily: mono, fontSize: 12, lineHeight: "21px", userSelect: "none", borderRight: `1px solid ${C.border}`, flexShrink: 0 }}>{lines.map((_, i) => <div key={i}>{i + 1}</div>)}</div>
        <pre style={{ margin: 0, padding: "10px 14px", fontFamily: mono, fontSize: 13, lineHeight: "21px", color: C.fg, whiteSpace: "pre", flex: 1 }}>{highlight(code, langOf(path))}</pre>
      </div>
    </div>
  );
}
/** Long text starts closed on its first part with a fade and a button to read it all (notes that run on are for a machine; the person gets the start). */
function Collapsible({ limit, text, children }: { limit: number; text: string; children: React.ReactNode }) {
  const long = text.length > limit; const [open, setOpen] = React.useState(false);
  return (
    <div>
      <div data-testid="collapsible" data-open={!long || open ? "1" : "0"} style={{ position: "relative", maxHeight: !long || open ? undefined : 230, overflow: "hidden" }}>{children}
        {long && !open && <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 70, background: "linear-gradient(transparent, var(--c-panel2, var(--c-panel)))" }} />}</div>
      {long && <button data-testid="collapsible-toggle" onClick={() => setOpen((o) => !o)} style={{ marginTop: 8, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "3px 12px", cursor: "pointer", fontFamily: nav, fontSize: 12 }}>{open ? "Show less" : "Read all the notes"}</button>}
    </div>
  );
}
/** A bundle drawn as a reader wants it: the notes as a document, a list of the files, then each file in its own block. */
function Bundle({ b, big }: { b: { notes: string; files: { path: string; code: string }[] }; big: boolean }) {
  return (
    <div data-testid="bundle" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {b.notes && <section data-testid="bundle-notes" className="nd" style={{ background: "var(--c-panel2, var(--c-panel))", border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 24px" }}><div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Notes</div><Collapsible limit={900} text={b.notes}><Markdown text={notesAsList(b.notes.replace(/^notes\b[^\n]*\n+/i, ""))} compact={false} /></Collapsible></section>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{b.files.map((f) => <span key={f.path} style={{ fontFamily: mono, fontSize: 12, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 10px" }}>{f.path}</span>)}</div>
      {b.files.map((f) => <CodeFile key={f.path} path={f.path} code={f.code} big={big} />)}
    </div>
  );
}
/** A document as it should be read: JSON indented, the rest as it is. Pure. */
export function prettyText(text: string, format?: string): string { if (format === "json") { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } } return text; }
/** The rows of a small CSV (quotes and doubled quotes understood), at most `max` rows. Pure. */
export function csvRows(text: string, max = 200): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length && rows.length < max; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((x) => x !== "") || row.length > 1) rows.push(row); row = []; } else cur += c; }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); } return rows;
}
/** The first lines of a document, trimmed of mark-up noise, for a small box. Pure. */
export function excerpt(text: string, lines = 6, width = 30): string[] {
  return text.replace(/\r/g, "").split("\n").map((l) => l.replace(/^[#>*\-\s`]+/, "").trim()).filter(Boolean).slice(0, lines).map((l) => (l.length > width ? l.slice(0, width - 1) + "…" : l));
}
/** Which of a run's media a node may show: pictures and videos hang off the Deliver node (the run does not record which node made which file). Pure. */
export function mediaPreviews(media: readonly Media[]): PreviewSource[] {
  return media.filter((m) => m.kind === "video" || m.kind === "image").slice(0, 2).map((m) => ({ kind: m.kind === "video" ? "video" as const : "image" as const, title: m.name, file: m.file }));
}
/** Which node made which picture or video: a file belongs to the node whose recorded outputs name it (the capture's `shots` list its screenshots by path); the rest, which no node names, is left for Deliver (except a leftover beside a node's own files). Pure. */
export function mediaByNode(media: readonly Media[], values: Record<string, unknown> | undefined | null): { byNode: Record<string, Media[]>; rest: Media[] } {
  const strings = (v: unknown, out: string[] = [], depth = 0): string[] => { if (depth > 4) return out; if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.slice(0, 200).forEach((x) => strings(x, out, depth + 1)); else if (v && typeof v === "object") Object.values(v as object).slice(0, 60).forEach((x) => strings(x, out, depth + 1)); return out; };
  const named = Object.entries(values ?? {}).filter(([id]) => !id.startsWith("_")).map(([id, v]) => [id, strings(v)] as const);
  const byNode: Record<string, Media[]> = {}; const rest: Media[] = [];
  const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : ""); const claimed = new Set<string>(); const loose: Media[] = [];
  for (const m of media) { const hit = named.find(([, ss]) => ss.some((x) => x === m.path || x.endsWith(`/${m.path}`))); if (hit) { (byNode[hit[0]] ??= []).push(m); claimed.add(dirOf(m.path)); } else loose.push(m); }
  // a file that no node names but that sits beside a node's own files (the same folder) is a LEFTOVER of an earlier run, not this run's result: it is not shown on Deliver
  for (const m of loose) if (!(claimed.has(dirOf(m.path)) && dirOf(m.path) !== "")) rest.push(m);
  return { byNode, rest };
}
/** The artifact a node made, from the run's list. Pure. */
export function artifactOf(list: readonly Artifact[], a: { name: string; format: string }): Artifact | undefined { return list.find((x) => x.name === `${a.name}.${a.format}` && x.kind === "made") ?? list.find((x) => x.name === `${a.name}.${a.format}`); }

/** A document drawn as what it is: markdown rendered, a table for CSV, indented JSON, code as code. `big` is the full window (readable size), else the same page drawn wide and scaled into the small box. */
export function Doc({ text, format, big }: { text: string; format?: string; big: boolean }) {
  const bundle = format === "txt" || format === "md" ? parseBundle(text) : null;
  const body = bundle ? <Bundle b={bundle} big={big} /> : format === "md" ? <Markdown text={text} compact={false} />
    : format === "csv" ? <div style={{ overflow: "auto" }}><table style={{ borderCollapse: "collapse", fontFamily: nav, fontSize: 13 }}><tbody>{csvRows(text).map((r, i) => <tr key={i}>{r.map((c, j) => i === 0 ? <th key={j} style={{ textAlign: "left", padding: "5px 12px", borderBottom: `1px solid ${C.border}`, color: C.fg }}>{c}</th> : <td key={j} style={{ padding: "5px 12px", borderBottom: `1px solid ${C.border}`, color: C.dim }}>{c}</td>)}</tr>)}</tbody></table></div>
    : <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: mono, fontSize: 13, lineHeight: 1.55, color: C.fg }}>{prettyText(text, format)}</pre>;
  const READ = ".nd{font-size:15px;line-height:1.7}.nd li,.nd p{color:var(--c-fg)!important;font-size:15px}.nd ul,.nd ol{gap:12px!important;padding-left:20px!important}.nd li::marker{color:var(--c-muted)}.nd strong,.nd b{color:var(--c-fg);font-weight:650}.nd h1{font-size:22px!important}.nd h2{font-size:18px!important}.nd h3{font-size:15.5px!important}.nd code{font-size:.9em}";
  if (big) return <div data-testid="preview-doc-big" style={{ flex: 1, overflow: "auto", padding: "32px 0 48px", background: "var(--c-panel, #131316)" }}><style>{READ}</style><div className="nd" style={{ maxWidth: bundle ? 1040 : 820, margin: "0 auto", padding: "0 32px", fontFamily: nav }}>{body}</div></div>;
  return <div data-testid="preview-doc" style={{ width: 520, padding: 22, background: "var(--c-panel, #131316)", transform: `scale(${PREVIEW_W / 520})`, transformOrigin: "0 0", pointerEvents: "none", fontFamily: nav }}>{body}</div>;
}

function Content({ run, src, big }: { run: string; src: PreviewSource; big: boolean }) {
  const [text, setText] = React.useState<string | null | undefined>(undefined);
  React.useEffect(() => { if (!src.artifact && !src.result) return; let stop = false; void Promise.resolve().then(() => (src.result ? getResult(run) : getArtifact(run, src.artifact!))).then((r: any) => { if (!stop) setText(r?.ok && typeof r.text === "string" ? r.text : null); }).catch(() => { if (!stop) setText(null); }); return () => { stop = true; }; }, [run, src.artifact, src.result]);
  if (src.kind === "image") return <img data-testid="preview-image" alt={src.title} src={mediaUrl(run, src.file!)} draggable={false} onDragStart={(e) => e.preventDefault()} style={{ width: "100%", height: "100%", objectFit: big ? "contain" : "cover", pointerEvents: big ? "auto" : "none", userSelect: "none" }} />;
  if (src.kind === "video") return <video data-testid="preview-video" muted playsInline preload="metadata" controls={big} draggable={false} src={`${mediaUrl(run, src.file!)}#t=0.5`} style={{ width: "100%", height: "100%", objectFit: big ? "contain" : "cover", background: "#000", pointerEvents: big ? "auto" : "none" }} />;
  if (text === undefined) return <div style={{ color: C.muted, fontSize: 10, padding: 6 }}>…</div>;
  if (text === null) return <div style={{ color: C.muted, fontSize: 10, padding: 6 }}>not written yet</div>;
  if (src.kind === "page") return big ? <iframe data-testid="preview-page-big" title={src.title} sandbox={src.result ? "allow-scripts" : ""} srcDoc={frameDoc(text, src.result ? BE_URL : "")} style={{ flex: 1, width: "100%", border: 0, background: "#fff" }} /> : (
    <iframe data-testid="preview-page" title={src.title} sandbox={src.result ? "allow-scripts" : ""} tabIndex={-1} srcDoc={frameDoc(text, src.result ? BE_URL : "")} style={{ width: 1100, height: 720, border: 0, background: "#fff", transform: `scale(${PREVIEW_W / 1100})`, transformOrigin: "0 0", pointerEvents: "none" }} />);
  return <Doc text={text} format={src.format} big={big} />;
}
/** The box itself (HTML: drawn inside a foreignObject on the graph). */
export function NodePreview({ run, src, id, dragged }: { run: string; src: PreviewSource; id: string; /** a drag that ends over the box is not a click */ dragged?: () => boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <div data-testid={`ag-preview-${id}`} role="button" tabIndex={0} aria-label={`preview of ${src.title}: open`} title={`${src.title}: click to open`} onDragStart={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); if (dragged?.()) return; setOpen(true); }} onKeyDown={(e) => { if (e.key === "Enter") setOpen(true); }}
        style={{ width: PREVIEW_W, height: PREVIEW_H, overflow: "hidden", position: "relative", borderRadius: 8, border: `1px solid ${C.border}`, background: src.kind === "page" ? "#fff" : "var(--c-panel2, #18181c)", cursor: "grab", boxSizing: "border-box", userSelect: "none" }}>
        <Content run={run} src={src} big={false} />
      </div>
      {open && <GlassView title={src.title} sub={src.kind} onClose={() => setOpen(false)}><Content run={run} src={src} big /></GlassView>}
    </>
  );
}
