// DRAG ANYTHING TO THE CHAT (operator 2026-09-18: "make all maps, graphs, sections, items draggable
// to drop on antiChat as context for some prompt"). A section (a dashboard panel, a KPI, a file
// review) carries a CONTEXT — its title and a text rendering of what it shows — as an HTML5 drag;
// the two composers (antiChat's and the docked chat's) accept the drop and append it as a fenced
// block the prompt can refer to. text/plain rides along, so a drop into any other editor still pastes.
export const CONTEXT_MIME = "application/x-antiloki-context";
export type DragContext = { title: string; text: string; kind?: string };

/** The block a dropped context becomes in the composer. Pure — tested. */
export function contextBlock(c: DragContext): string {
  const body = c.text.trim().replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").slice(0, 2400);
  return `[context · ${c.title.trim()}]\n${body}\n[/context]`;
}
/** A DOM node's readable text as context — headings and rows on their own lines, tooltips folded in. Pure — tested. */
export function textOf(el: { innerText?: string; textContent: string | null } | null): string {
  if (!el) return "";
  const raw = (el.innerText ?? el.textContent ?? "").replace(/\u00a0/g, " ");
  return raw.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
}
/** The ghost under the pointer while dragging: a small card with the title and the first lines (operator
 *  2026-09-18: "show a preview of the dragged item") — instead of the browser's snapshot of a whole section. */
function dragPreview(ctx: DragContext): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const el = document.createElement("div");
  const lines = ctx.text.split("\n").filter(Boolean).slice(0, 4).map((l) => l.slice(0, 70));
  el.setAttribute("data-testid", "drag-preview");
  el.style.cssText = "position:fixed;top:-1000px;left:-1000px;width:300px;padding:10px 12px;border-radius:10px;background:#1c1a17;color:#efe9e2;border:1px solid #4a433c;box-shadow:0 12px 30px rgba(0,0,0,.45);font:12px/1.45 -apple-system,system-ui,sans-serif;pointer-events:none;z-index:9999";
  el.innerHTML = `<div style="font-weight:700;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">⤵ ${escapeHtml(ctx.title)}</div><div style="font:10.5px/1.45 ui-monospace,Menlo,monospace;color:#a3998f;white-space:pre-wrap">${escapeHtml(lines.join("\n"))}${ctx.text.length > 280 ? "\n…" : ""}</div><div style="margin-top:6px;font:9.5px ui-monospace,monospace;color:#c97c5c">drop on a chat → context for your prompt</div>`;
  document.body.appendChild(el);
  return el;
}
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c] as string));
export function startContextDrag(e: React.DragEvent, ctx: DragContext) {
  const block = contextBlock(ctx);
  try {
    e.dataTransfer.setData(CONTEXT_MIME, JSON.stringify(ctx)); e.dataTransfer.setData("text/plain", block); e.dataTransfer.effectAllowed = "copy";
    const ghost = dragPreview(ctx);
    if (ghost && typeof e.dataTransfer.setDragImage === "function") { e.dataTransfer.setDragImage(ghost, 16, 16); setTimeout(() => ghost.remove(), 0); } else ghost?.remove();
  } catch { /* a synthetic event */ }
}
/** The context of a drop, if the drag carried one (else the plain text, else null). */
export function readContextDrop(e: { dataTransfer: DataTransfer | null }): string | null {
  const dt = e.dataTransfer; if (!dt) return null;
  const raw = dt.getData(CONTEXT_MIME);
  if (raw) { try { return contextBlock(JSON.parse(raw)); } catch { /* fall through */ } }
  const plain = dt.getData("text/plain");
  return plain ? plain : null;
}
export function isContextDrag(e: { dataTransfer: DataTransfer | null }): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types ?? []).includes(CONTEXT_MIME);
}
/** Append a dropped block to a composer's text, on its own paragraph. Pure. */
export function appendContext(current: string, block: string): string {
  const cur = current.replace(/\s+$/, "");
  return cur ? `${cur}\n\n${block}\n` : `${block}\n`;
}
