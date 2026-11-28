// A PANE NUMBER MEANS NOTHING ON ITS OWN (operator 2026-10-11: "the same conversation in all projects"). Every project numbers its panes from 1, so a browser-side memory keyed by the
// pane number alone - the theme picked for a chat, the widget split beside it - carries from project A's chat 5 to project B's. The serve scopes its chat folders by project now; this does the same for
// what the browser remembers. The active project's root is learned whenever the workspace list is read (`fetchWorkspaces`); until it is, keys are unscoped, as they always were.
let scope = "";
export function setWorkspaceScope(root: string | null | undefined) { scope = hash(String(root ?? "").trim().replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase()); }
export function workspaceScope(): string { return scope; }
/** `base` for a pane of the active project: `base:<project>:<pane>`, or `base:<pane>` while the project is not known yet. Pure given the scope. */
export function paneKey(base: string, paneId: number): string { return scope ? `${base}:${scope}:${paneId}` : `${base}:${paneId}`; }
function hash(s: string): string {
  if (!s) return "";
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
