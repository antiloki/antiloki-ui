/** The model as a short code for a small button: the first letter of its name and its version ("Haiku 5.5" -> "H5.5", "Opus 5.5" -> "O5.5"). Pure. */
export function shortModel(label: string): string {
  const local = /[A-Za-z][A-Za-z0-9._\/-]*:[A-Za-z0-9._-]+/.exec(label)?.[0]; if (local) return local;   // a local model is named by its own tag: its first letter and a number said nothing ("A4", issue 28)
  const name = /[A-Za-z]/.exec(label)?.[0]?.toUpperCase() ?? ""; const ver = /\d+(?:[.-]\d+)?/.exec(label)?.[0]?.replace("-", ".") ?? "";
  return name || ver ? `${name}${ver}` : "model";
}
