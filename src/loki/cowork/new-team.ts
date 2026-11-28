// A NEW TEAM STARTS IN A THREAD OF ITS OWN (2026-11-27): the name that thread takes, and the note that says its leader is still to be opened.
/** `base`, or `base 2`, `base 3`… : the first one no thread has. Pure. */
export function freeThreadName(taken: string[], base: string): string {
  const have = new Set(taken.map((n) => n.trim().toLowerCase()));
  for (let i = 1; ; i++) { const name = i === 1 ? base : `${base} ${i}`; if (!have.has(name.toLowerCase())) return name; }
}
export const onboardKey = (workspace: string, thread: string) => `antiloki.team.onboard.${workspace}|${thread.trim().toLowerCase()}`;
