// A PANE AS ONE FILE (RFC 0016 M6): the file name an export gets, and what an import may be: an `antiloki-pane/1` export, or a team's bundle {id, manifest, files} ("Install this pane"). Both land as drafts; the approval is asked again. Pure.
export const fileNameFor = (id: string) => `antiloki-pane-${id.replace(/[^a-z0-9-]/g, "-")}.json`;
export type ImportBody = { op: "import"; export: unknown } | { op: "install"; bundle: unknown };
/** What was dropped on the menu, or why it is not a pane. A file is at most 3 MB (a pane is 2 MB and its pictures grow by a third as text). */
export function parseImport(text: string): ImportBody | string {
  if (text.length > 3 * 1024 * 1024) return "that file is over 3 MB: a pane is at most 2 MB";
  let j: any; try { j = JSON.parse(text); } catch { return "that file is not JSON, so it is not a pane"; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return "a pane is a JSON object";
  if (j.schema === "antiloki-pane/1" && j.kind === "export") return { op: "import", export: j };
  if (j.manifest && typeof j.manifest === "object" && j.files && typeof j.files === "object") return { op: "install", bundle: j };
  return "that file is neither an antiloki pane export nor a team's bundle ({id, manifest, files})";
}
