// TABLES AND INLINE MARKDOWN FOR THE LIVE PAGE (operator 2026-11-18: "the notes pane is badly formatted, it should have all the markdown formatting with live showing like Obsidian"):
// a markdown table is drawn as a real table while the cursor is outside it (the raw pipes come back when it is inside, to edit). Pure parsing here, DOM built node by node (nothing is parsed into HTML text).
export type Align = "left" | "center" | "right" | null;
export type Table = { head: string[]; align: Align[]; rows: string[][] };

/** The cells of one table row: split on pipes that are not escaped, the outer pipes dropped, each cell trimmed. Pure. */
export function splitRow(line: string): string[] {
  let s = line.trim(); if (s.startsWith("|")) s = s.slice(1); if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = []; let cur = "";
  for (let i = 0; i < s.length; i++) { if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; } else if (s[i] === "|") { cells.push(cur.trim()); cur = ""; } else cur += s[i]; }
  cells.push(cur.trim()); return cells;
}
const DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
/** A GFM table from its source text, or null when it is not one (a header, a delimiter row of dashes, rows). Rows are padded or cut to the header's width. Pure. */
export function parseTable(src: string): Table | null {
  const lines = src.split("\n").filter((l) => l.trim() !== ""); if (lines.length < 2 || !lines[0].includes("|") || !DELIM.test(lines[1])) return null;
  const head = splitRow(lines[0]); const delim = splitRow(lines[1]); if (delim.length < 1 || head.length < 1) return null;
  const align: Align[] = head.map((_, i) => { const d = delim[i] ?? ""; const l = d.startsWith(":"), r = d.endsWith(":"); return l && r ? "center" : r ? "right" : l ? "left" : null; });
  const rows = lines.slice(2).map((l) => { const c = splitRow(l); while (c.length < head.length) c.push(""); return c.slice(0, head.length); });
  return { head, align, rows };
}

export type Inline = { kind: "text" | "strong" | "em" | "strike" | "code" | "link"; text: string; href?: string };
/** The inline markdown of a cell as a flat list: **bold**, *em* / _em_, ~~strike~~, `code`, [text](address), bare addresses. Pure. */
export function inlineParts(s: string): Inline[] {
  const out: Inline[] = []; let rest = s;
  const rx = /(\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|`([^`]+)`|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<)]+))/;
  while (rest) {
    const m = rx.exec(rest); if (!m) { out.push({ kind: "text", text: rest }); break; }
    if (m.index > 0) out.push({ kind: "text", text: rest.slice(0, m.index) });
    if (m[2] !== undefined || m[3] !== undefined) out.push({ kind: "strong", text: m[2] ?? m[3] });
    else if (m[4] !== undefined) out.push({ kind: "strike", text: m[4] });
    else if (m[5] !== undefined) out.push({ kind: "code", text: m[5] });
    else if (m[6] !== undefined || m[7] !== undefined) out.push({ kind: "em", text: m[6] ?? m[7] });
    else if (m[8] !== undefined) out.push({ kind: "link", text: m[8], href: m[9] });
    else out.push({ kind: "link", text: m[10], href: m[10] });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}
/** Only addresses that are safe to open from a note. Pure. */
export const safeHref = (h: string | undefined): string | null => (h && /^(https?:|mailto:|#|\/)/i.test(h) ? h : null);

/** The DOM of inline markdown: elements made one by one, so a cell can never inject markup. */
export function inlineNodes(doc: Document, s: string): Node[] {
  return inlineParts(s).map((p) => {
    if (p.kind === "text") return doc.createTextNode(p.text);
    const tag = p.kind === "strong" ? "strong" : p.kind === "em" ? "em" : p.kind === "strike" ? "s" : p.kind === "code" ? "code" : "a";
    const el = doc.createElement(tag); el.textContent = p.text;
    if (p.kind === "link") { const h = safeHref(p.href); if (h) { (el as HTMLAnchorElement).href = h; (el as HTMLAnchorElement).target = "_blank"; (el as HTMLAnchorElement).rel = "noreferrer noopener"; } }
    return el;
  });
}
/** The table as DOM. */
export function tableElement(doc: Document, t: Table): HTMLElement {
  const tbl = doc.createElement("table"); tbl.className = "cm-md-table";
  const cell = (tag: "th" | "td", text: string, a: Align) => { const c = doc.createElement(tag); if (a) c.style.textAlign = a; for (const n of inlineNodes(doc, text)) c.appendChild(n); return c; };
  const thead = doc.createElement("thead"), hr = doc.createElement("tr"); t.head.forEach((h, i) => hr.appendChild(cell("th", h, t.align[i]))); thead.appendChild(hr); tbl.appendChild(thead);
  const tbody = doc.createElement("tbody"); for (const r of t.rows) { const tr = doc.createElement("tr"); r.forEach((c, i) => tr.appendChild(cell("td", c, t.align[i]))); tbody.appendChild(tr); } tbl.appendChild(tbody);
  return tbl;
}
