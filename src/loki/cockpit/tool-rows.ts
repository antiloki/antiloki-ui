// WHAT THE SERVER MAKES OF A KIND IT DOES NOT KNOW (found 2026-10-11: "when trying to add a new issue on the issues widget, it is not working").
// The blackboard keeps an allowlist of row kinds and quietly stores anything else as a plain 'note'. The tools that were added after that list was written (Issues, and the Brainstorm conversation) post their own kinds, so on a
// serve that has not been updated their rows come back as 'note' and a widget that only looked for its own kind saw nothing: the issue was saved and never shown.
// The serve now knows the kinds (`cockpit-blackboard-post.rs`), but a serve that is already running does not until it is restarted, so every reader here accepts the row by its kind OR, when it came back as a 'note', by its SHAPE:
// a JSON object that has exactly the fields only that tool writes. A person's own note is prose, never that, so the two cannot be confused. Pure - tested.
type Row = { kind?: string; body_md?: string };
const STATUS = ["backlog", "todo", "doing", "done", "canceled"];
const obj = (body: unknown): Record<string, any> | null => { try { const j = JSON.parse(String(body ?? "")); return j && typeof j === "object" && !Array.isArray(j) ? j : null; } catch { return null; } };
const sameKeys = (j: Record<string, any>, keys: string[]) => { const k = Object.keys(j).sort(); return k.length === keys.length && keys.slice().sort().every((x, i) => x === k[i]); };
const asNote = (r: Row) => r.kind === "note";

export const isIssueRow = (r: Row): boolean => {
  if (r.kind === "issue") return true;
  if (!asNote(r)) return false;
  const j = obj(r.body_md);
  return !!j && sameKeys(j, ["n", "title", "status", "priority"]) && typeof j.title === "string" && Number.isFinite(j.n) && STATUS.includes(j.status);
};
export const isPrefRow = (r: Row): boolean => {
  if (r.kind === "pref") return true;
  if (!asNote(r)) return false;
  const j = obj(r.body_md);
  return !!j && sameKeys(j, ["view"]) && (j.view === "list" || j.view === "board");
};
export const isBrainstormMsgRow = (r: Row): boolean => {
  if (r.kind === "brainstorm") return true;
  if (!asNote(r)) return false;
  const j = obj(r.body_md);
  return !!j && (j.role === "you" || j.role === "brain") && typeof j.text === "string" && Object.keys(j).every((k) => ["role", "text", "tone", "chips"].includes(k));
};
export const isBrainstormChipsRow = (r: Row): boolean => {
  if (r.kind === "brainstorm-chips") return true;
  if (!asNote(r)) return false;
  const j = obj(r.body_md);
  return !!j && sameKeys(j, ["kind", "areas", "bold", "musts"]) && Array.isArray(j.areas) && Array.isArray(j.musts);
};
