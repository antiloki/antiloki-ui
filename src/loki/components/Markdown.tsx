// Minimal markdown renderer — handles the subset that contract.goal_md,
// briefing_md, and similar substrate strings actually use:
//   # / ## / ### headings (h1-h3), #### and deeper as a quiet h4
//   - and * unordered lists (single level)
//   1. ordered lists
//   `code` inline + ``` fenced code blocks
//   **bold** and *italic*
//   blank lines → paragraph breaks
//   pre-wrap for everything else
//
// Not a full CommonMark parser — that would be a 30KB dep. The substrate's
// markdown content sticks to these primitives so we don't need more. If
// something fancier shows up (tables, footnotes), upgrade to a real lib.
import * as React from "react";
import { C, mono } from "@/loki/theme";

interface Block {
  kind: "h1" | "h2" | "h3" | "h4" | "p" | "ul" | "ol" | "code" | "hr" | "table";
  text?: string;
  items?: string[];
  lang?: string;
  header?: string[];
  rows?: string[][];
}

function parse(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Fenced code
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      i++;
      const buf: string[] = [];
      while (i < lines.length && !lines[i].trimEnd().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing ```
      blocks.push({ kind: "code", text: buf.join("\n"), lang });
      continue;
    }

    if (line === "") { i++; continue; }
    if (line.match(/^-{3,}$/) || line.match(/^_{3,}$/)) { blocks.push({ kind: "hr" }); i++; continue; }

    // #### … ###### (2026-09-28: a worker's report printed "#### File Paths" as literal hashes) — a quiet fourth level
    { const h = line.match(/^#{4,6}\s+(.*)$/); if (h) { blocks.push({ kind: "h4", text: h[1] }); i++; continue; } }
    if (line.startsWith("### ")) { blocks.push({ kind: "h3", text: line.slice(4) }); i++; continue; }
    if (line.startsWith("## "))  { blocks.push({ kind: "h2", text: line.slice(3) }); i++; continue; }
    if (line.startsWith("# "))   { blocks.push({ kind: "h1", text: line.slice(2) }); i++; continue; }

    // GFM table: a header row containing | followed by a |---|---| separator row
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1].includes("-") && /^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/.test(lines[i + 1].trim())) {
      const splitRow = (r: string) => r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const header = splitRow(line);
      i += 2; // header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") { rows.push(splitRow(lines[i])); i++; }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    // Unordered list
    if (line.match(/^[-*]\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trimEnd().match(/^[-*]\s+/)) {
        items.push(lines[i].trimEnd().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    // Ordered list
    if (line.match(/^\d+\.\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trimEnd().match(/^\d+\.\s+/)) {
        items.push(lines[i].trimEnd().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Paragraph (consume contiguous non-blank lines)
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].match(/^(#{1,6}\s|[-*]\s|\d+\.\s|```)/)) {
      buf.push(lines[i].trim());
      i++;
    }
    blocks.push({ kind: "p", text: buf.join(" ") });
  }
  return blocks;
}

// Inline transformation: **bold**, *italic*, `code`, [text](url) links. Returns React nodes.
/** The address a markdown link points at: `<https://x>` (angle brackets, as Linear writes them) and a trailing `"title"` are understood; an http, https or mailto address, an in-app path (`/operations`) or an anchor is a link; any other scheme (javascript:, data:) is not. Pure. */
export function linkTarget(raw: string): string | null {
  let d = raw.trim(); const angled = /^<([^>]*)>/.exec(d); d = angled ? angled[1] : d.split(/\s+"/)[0].split(/\s+'/)[0];
  d = d.trim(); return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(d) ? d : null;
}
function inline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|<https?:\/\/[^>\s]+>)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**") && t.endsWith("**")) {
      parts.push(<strong key={parts.length} style={{ color: C.fg, fontWeight: 700 }}>{t.slice(2, -2)}</strong>);
    } else if (t.startsWith("~~") && t.endsWith("~~")) {
      parts.push(<s key={parts.length} style={{ opacity: 0.75 }}>{t.slice(2, -2)}</s>);
    } else if (t.startsWith("<http")) {
      const u = t.slice(1, -1); parts.push(<a key={parts.length} href={u} target="_blank" rel="noreferrer" style={{ color: C.brand, textDecoration: "underline" }}>{u}</a>);
    } else if (t.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t); const href = mm ? linkTarget(mm[2]) : null;
      if (mm && href) parts.push(<a key={parts.length} href={href} target="_blank" rel="noreferrer" style={{ color: C.brand, textDecoration: "underline" }}>{mm[1]}</a>);
      else parts.push(mm ? mm[1] : t);
    } else if (t.startsWith("*") && t.endsWith("*")) {
      parts.push(<em key={parts.length}>{t.slice(1, -1)}</em>);
    } else if (t.startsWith("`")) {
      parts.push(
        <code key={parts.length} style={{
          fontFamily: mono, fontSize: "0.92em",
          padding: "1px 5px", background: "oklch(0.16 0.005 250)",
          color: C.brand, borderRadius: 3,
        }}>{t.slice(1, -1)}</code>
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Lightweight, dependency-free syntax highlighting for fenced code blocks (the "colorful code" the operator
// wanted). Tokenizes comments · strings · numbers · keywords and colours them; everything else stays plain.
// `#`-comments only for hash-comment languages so a JS `#private` field isn't greyed.
const KEYWORDS = new Set(("const let var function return if else for while do switch case break continue import " +
  "export default from class extends new async await yield try catch finally throw typeof instanceof in of this " +
  "super null undefined true false void delete def lambda pass elif except raise with as public private protected " +
  "static interface type enum struct func fn impl pub use mod match where select insert update delete where").split(/\s+/));
export function highlight(code: string, lang?: string): React.ReactNode[] {
  const hash = /^(py|python|rb|ruby|sh|bash|shell|zsh|yaml|yml|toml|r|perl|makefile|dockerfile)$/i.test(String(lang || ""));
  const re = hash
    ? /(\/\/[^\n]*|#[^\n]*)|(\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d._]*\b)|([A-Za-z_$][\w$]*)/g
    : /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d._]*\b)|([A-Za-z_$][\w$]*)/g;
  const out: React.ReactNode[] = [];
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const [tok, lineC, blockC, str, num, word] = m;
    let color: string | null = null;
    if (lineC || blockC) color = C.muted;                       // comments
    else if (str) color = "oklch(0.80 0.12 150)";               // strings — green
    else if (num) color = "oklch(0.82 0.10 65)";                // numbers — amber
    else if (word && KEYWORDS.has(word)) color = "oklch(0.78 0.13 300)"; // keywords — violet
    out.push(color ? <span key={k++} style={{ color }}>{tok}</span> : tok);
    last = m.index + tok.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function Markdown({ text, compact = false }: { text: string; compact?: boolean }) {
  const blocks = React.useMemo(() => parse(text), [text]);
  return (
    <div style={{
      color: C.fg, fontSize: compact ? 11.5 : 13, lineHeight: 1.55,
      display: "flex", flexDirection: "column", gap: compact ? 6 : 10,
    }}>
      {blocks.map((b, i) => {
        if (b.kind === "h1") return <h1 key={i} style={{ margin: 0, fontSize: compact ? 14 : 17, fontWeight: 700, color: C.fg }}>{inline(b.text ?? "")}</h1>;
        if (b.kind === "h2") return <h2 key={i} style={{ margin: 0, fontSize: compact ? 13 : 15, fontWeight: 600, color: C.fg, borderBottom: `1px solid ${C.border}`, paddingBottom: 3 }}>{inline(b.text ?? "")}</h2>;
        if (b.kind === "h4") return <h4 key={i} style={{ margin: 0, fontSize: compact ? 11.5 : 12.5, fontWeight: 600, color: C.muted, letterSpacing: 0.3 }}>{inline(b.text ?? "")}</h4>;
        if (b.kind === "h3") return <h3 key={i} style={{ margin: 0, fontSize: compact ? 12 : 13.5, fontWeight: 600, color: C.brand }}>{inline(b.text ?? "")}</h3>;
        if (b.kind === "hr") return <hr key={i} style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: 0 }} />;
        if (b.kind === "code") return (
          <pre key={i} style={{
            margin: 0, padding: 10, background: "oklch(0.12 0.005 250)",
            border: `1px solid ${C.border}`, borderRadius: 4,
            fontFamily: mono, fontSize: compact ? 10.5 : 11.5, color: C.fg, lineHeight: 1.5,
            whiteSpace: "pre-wrap", wordBreak: "break-word", overflow: "auto",
          }}>{highlight(b.text ?? "", b.lang)}</pre>
        );
        if (b.kind === "ul") return (
          <ul key={i} style={{ margin: 0, paddingLeft: 18, color: C.dim, display: "flex", flexDirection: "column", gap: 3 }}>
            {(b.items ?? []).map((item, j) => <li key={j}>{inline(item)}</li>)}
          </ul>
        );
        if (b.kind === "ol") return (
          <ol key={i} style={{ margin: 0, paddingLeft: 22, color: C.dim, display: "flex", flexDirection: "column", gap: 3 }}>
            {(b.items ?? []).map((item, j) => <li key={j}>{inline(item)}</li>)}
          </ol>
        );
        if (b.kind === "table") return (
          <div key={i} style={{ overflowX: "auto", margin: "2px 0" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: mono, fontSize: compact ? 10 : 11 }}>
              <thead><tr>{(b.header ?? []).map((h, j) => <th key={j} style={{ textAlign: "left", padding: "4px 9px", borderBottom: `1px solid ${C.border}`, color: C.fg, background: C.panel, fontWeight: 600, whiteSpace: "nowrap" }}>{inline(h)}</th>)}</tr></thead>
              <tbody>{(b.rows ?? []).map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} style={{ padding: "4px 9px", borderBottom: `1px solid ${C.border}`, color: C.dim, verticalAlign: "top" }}>{inline(c)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        // paragraph
        return <p key={i} style={{ margin: 0, color: C.dim }}>{inline(b.text ?? "")}</p>;
      })}
    </div>
  );
}
