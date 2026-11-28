// A saga is titled by the first prompt of its agent; a prompt that was a pasted block starts with `<pasted_content id="…">` or Claude's `[Pasted text #1 +12 lines]`, which is not a title (the operator 2026-11-18).
// The serve now strips it before the list leaves; this is the same cleaning where the words are drawn, for a serve that does not yet. Pure.
export function cleanSagaWords(s: string | null | undefined): string {
  return (s ?? "").replace(/<\/?pasted_content[^>]*>?/g, " ").replace(/\[Pasted text[^\]]*\]?/g, " ").replace(/\s+/g, " ").trim();
}
