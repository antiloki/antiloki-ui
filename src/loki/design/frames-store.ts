// DESIGN FRAMES — the pure half: the snapshot store, the frame document, the inspector's property list
// and the layer naming. No React, so the editor stays fast-refreshable and these stay unit-tested.
export type Snap = { kind: string; name: string; path: string; framework: string; html: string };
export type Frame = { id: string; name: string; base: string; html: string; createdAt: number; updatedAt: number; width: number };

const BASE_CSS = `*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:system-ui,sans-serif}[data-lf-hidden]{display:none!important}`;

// ── the snapshot store (pure, tested) ────────────────────────────────────────────────────────
export const storeKey = (ws: string) => `antiloki:design-frames:${ws || "default"}`;
export function readFrames(ws: string): Frame[] { try { const v = JSON.parse(localStorage.getItem(storeKey(ws)) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
export function writeFrames(ws: string, frames: Frame[]) { try { localStorage.setItem(storeKey(ws), JSON.stringify(frames)); } catch { /* quota / private mode */ } }
export function upsertFrame(frames: Frame[], f: Frame): Frame[] { const i = frames.findIndex((x) => x.id === f.id); return i < 0 ? [f, ...frames] : frames.map((x) => (x.id === f.id ? f : x)); }
export function nextName(base: string, frames: Frame[]): string { const n = frames.filter((f) => f.base === base).length + 1; return `${base} · v${n}`; }
export const mint = () => `f${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** The frame document: the captured screen's HTML with the project's CSS, plus our hidden-layer rule. */
export function frameDoc(html: string, css: string, baseUrl?: string) {
  return `<!doctype html><html><head><meta charset="utf-8">${baseUrl ? `<base href="${baseUrl}/">` : ""}<style>${BASE_CSS}\n${css}</style></head><body>${html}</body></html>`;
}

// the properties the panel exposes — the Figma inspector's first page, mapped to CSS
export const PROPS: { key: string; label: string; kind: "color" | "text" | "number"; unit?: string }[] = [
  { key: "background-color", label: "fill", kind: "color" },
  { key: "color", label: "text", kind: "color" },
  { key: "border-color", label: "stroke", kind: "color" },
  { key: "border-radius", label: "radius", kind: "number", unit: "px" },
  { key: "font-size", label: "size", kind: "number", unit: "px" },
  { key: "font-weight", label: "weight", kind: "text" },
  { key: "letter-spacing", label: "tracking", kind: "text" },
  { key: "padding", label: "padding", kind: "text" },
  { key: "gap", label: "gap", kind: "text" },
  { key: "opacity", label: "opacity", kind: "text" },
];

/** rgb(a) → #hex for the color inputs; anything else passes through. Pure — tested. */
export function toHex(v: string): string {
  const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return v.startsWith("#") ? v : "#000000";
  if (m[4] !== undefined && Number(m[4]) === 0) return "#000000";
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}
/** A readable layer name for a DOM node, like Figma's layer list. Pure — tested. */
export function layerName(el: { tagName: string; id?: string; className?: string; textContent?: string | null }): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter((c) => c && !/^(css|sc|_|jsx)-?[\w-]*\d/i.test(c))[0] : "";
  if (cls) return `${tag}.${cls}`;
  const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
  return text ? `${tag} “${text.slice(0, 18)}${text.length > 18 ? "…" : ""}”` : tag;
}


// ── CHANGES DETECTED (operator 2026-09-18: "on a snapshot with changes detected: copy a very detailed
// prompt, download an RFC in md, or send it to an agent in a thread and generate a PR") ─────────────
// Every edit the editor makes is an INLINE STYLE, a `data-lf-hidden` mark, or retyped TEXT on the
// frame's DOM. So the delta between a snapshot and its code-based screen is exactly: the elements
// that carry inline styles (property → value), the hidden layers, and the leaves whose text differs
// from the same node of the base. Walked by structural path (child index), so a node is matched to
// its twin in the base even when nothing else identifies it.
export type FrameChange = { path: string; layer: string; selector: string; kind: "style" | "hidden" | "text"; props?: { key: string; before: string; after: string }[]; before?: string; after?: string };

function parse(html: string): Document | null {
  try { return new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html"); } catch { return null; }
}
/** A CSS-ish selector a developer can grep for: tag#id, tag.class, or the nth-child chain from body. */
export function selectorFor(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.tagName !== "BODY" && parts.length < 6) {
    const tag = cur.tagName.toLowerCase();
    if (cur.id) { parts.unshift(`${tag}#${cur.id}`); break; }
    const cls = typeof cur.className === "string" ? cur.className.trim().split(/\s+/).filter((c) => c && !/^(css|sc|_|jsx)-?[\w-]*\d/i.test(c)).slice(0, 2).join(".") : "";
    const idx = cur.parentElement ? Array.from(cur.parentElement.children).indexOf(cur) + 1 : 1;
    parts.unshift(cls ? `${tag}.${cls}` : `${tag}:nth-child(${idx})`);
    cur = cur.parentElement;
  }
  return parts.join(" > ");
}
const pathOf = (el: Element): string => { const p: number[] = []; let cur: Element | null = el; while (cur && cur.tagName !== "BODY") { p.unshift(cur.parentElement ? Array.from(cur.parentElement.children).indexOf(cur) : 0); cur = cur.parentElement; } return p.join("/"); };
const byPath = (doc: Document, path: string): Element | null => { let cur: Element | null = doc.body; for (const i of path.split("/").filter((s) => s !== "")) { cur = cur?.children[Number(i)] ?? null; if (!cur) return null; } return cur; };

export function diffFrame(baseHtml: string, frameHtml: string): FrameChange[] {
  const base = parse(baseHtml); const frame = parse(frameHtml);
  if (!base || !frame) return [];
  const out: FrameChange[] = [];
  for (const el of Array.from(frame.body.querySelectorAll("*"))) {
    const path = pathOf(el); const twin = byPath(base, path);
    const layer = layerName(el as any); const selector = selectorFor(el);
    if (el.hasAttribute("data-lf-hidden")) { out.push({ path, layer, selector, kind: "hidden" }); continue; }
    const style = (el as HTMLElement).getAttribute("style") ?? "";
    const twinStyle = twin?.getAttribute("style") ?? "";
    if (style && style !== twinStyle) {
      const parseDecl = (s: string) => Object.fromEntries(s.split(";").map((d) => d.trim()).filter(Boolean).map((d) => { const i = d.indexOf(":"); return [d.slice(0, i).trim(), d.slice(i + 1).trim()]; }));
      const a = parseDecl(style), b = parseDecl(twinStyle);
      const props = Object.keys(a).filter((k) => a[k] !== b[k] && k !== "outline").map((k) => ({ key: k, before: b[k] ?? "(from the stylesheet)", after: a[k] }));
      if (props.length) out.push({ path, layer, selector, kind: "style", props });
    }
    // a leaf whose text was retyped (elements with only text inside)
    if (twin && el.children.length === 0) {
      const t = (el.textContent ?? "").trim(), u = (twin.textContent ?? "").trim();
      if (t !== u) out.push({ path, layer, selector, kind: "text", before: u, after: t });
    }
  }
  return out;
}

/** The change list as one line each — the shared body of the prompt and the RFC. */
export function describeChanges(changes: FrameChange[]): string[] {
  return changes.map((c) => {
    if (c.kind === "hidden") return `- HIDE \`${c.selector}\` (${c.layer}) — the layer is removed from the screen`;
    if (c.kind === "text") return `- TEXT \`${c.selector}\` (${c.layer}): “${c.before}” → “${c.after}”`;
    return `- STYLE \`${c.selector}\` (${c.layer}): ${(c.props ?? []).map((p) => `${p.key} ${p.before} → ${p.after}`).join(" · ")}`;
  });
}

/** THE PROMPT — what an agent needs to implement the design change in the CODE, with nothing left to guess. */
export function changePrompt(opts: { screen: string; snapshot: string; path?: string; framework?: string; changes: FrameChange[] }): string {
  const lines = describeChanges(opts.changes);
  return `Implement a design change in this codebase. The change was made visually on a pixel-perfect frame of the rendered screen "${opts.screen}"${opts.path ? ` (route/file: ${opts.path})` : ""}${opts.framework ? ` · ${opts.framework}` : ""}; snapshot "${opts.snapshot}". Below is the exact delta between the rendered code and the edited design — every line is a selector into the REAL DOM of that screen, so find the component that renders it and change the source, never the built output.

## The changes (${lines.length})
${lines.join("\n")}

## How to implement
1. For each selector, locate the component/template that renders that element (grep for the class names, ids or the text; walk the parent chain if the node is anonymous).
2. Apply the change in the SOURCE with the project's own conventions: design-system tokens/variables over raw values, the existing spacing scale, the component's props over inline styles. A "STYLE" line gives the computed before → after; map the after value to the nearest token.
3. "HIDE" means remove the element from the render path (or its trigger), not \`display:none\`. "TEXT" is a copy change — update i18n sources if the app has them.
4. Keep every other screen unchanged; if a shared component is touched, check where else it is used (blast radius) and keep those call sites visually identical.
5. Update or add the tests that cover the touched components; run the typecheck, lint and the test suite.
6. Commit on your branch with a message that names the screen and the change; the pull request is opened from antiloki › Pulls with this prompt as its description.

## Acceptance
- the screen "${opts.screen}" renders exactly the edited design for every change above
- no other screen changes; the build, lint and tests pass
- the change lives in source (tokens/props), not in overrides`;
}

/** THE RFC — the same delta as a document a team can read and approve before anyone codes. */
export function changeRfc(opts: { screen: string; snapshot: string; path?: string; framework?: string; changes: FrameChange[]; author?: string; date?: string }): string {
  const lines = describeChanges(opts.changes);
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const rows = opts.changes.map((c) => c.kind === "style" ? (c.props ?? []).map((p) => `| \`${c.selector}\` | ${c.layer} | ${p.key} | ${p.before} | ${p.after} |`).join("\n") : `| \`${c.selector}\` | ${c.layer} | ${c.kind} | ${c.before ?? "visible"} | ${c.after ?? "hidden"} |`).join("\n");
  return `# RFC · ${opts.screen} — design change (${opts.snapshot})

**Date:** ${date}${opts.author ? `  \n**Author:** ${opts.author}` : ""}  \n**Screen:** ${opts.screen}${opts.path ? ` (\`${opts.path}\`)` : ""}${opts.framework ? ` · ${opts.framework}` : ""}  \n**Source of truth:** a pixel-perfect frame of the rendered screen, edited in antiloki › Design › Frames; the base is deterministic (captured from the running code).

## Summary
${lines.length} change${lines.length === 1 ? "" : "s"} to the ${opts.screen} screen, made visually on the real DOM and recorded as selector-level deltas. No code was touched; this document is the proposal.

## Changes
| selector | layer | property | before | after |
|---|---|---|---|---|
${rows}

## Rationale
_(fill in: why this change, what it fixes or improves for the user)_

## Implementation notes
- map every "after" value to the design system's tokens; use component props over inline styles
- "hidden" layers leave the render path (not \`display:none\`)
- shared components: check every call site (blast radius) before changing them

## Acceptance criteria
- [ ] the ${opts.screen} screen matches the snapshot "${opts.snapshot}" for every row above
- [ ] no other screen changes
- [ ] typecheck, lint and tests pass; touched components have updated tests

## Out of scope
- copy or behaviour not listed above
`;
}
