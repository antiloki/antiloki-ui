// WHERE A TOOL'S DATA LIVES (operator 2026-09-23: "some tools and widgets like kanban notes etc when close they
// delete the data, id like the data be saved").
//
// Nothing was ever deleted. A Kanban board, a Notes page, a Todo list are rows on the server blackboard, keyed by
// (session, pane), and closing a widget only takes it off the screen. What looked like deletion was the OPEN: the
// pane half of that key used to be `Math.random()`, so every pick minted a brand-new empty board and yesterday's
// cards stayed on the server, unreachable forever.
//
// So the pane id is DERIVED from the widget's kind: the Kanban is always the same Kanban. The session half is
// resolved from the conversation at render time (vibe-widgets' useVibeSession), and that is what scopes a board to
// its chat — the number here is only that lookup's fallback, kept in the "minted" range so it can never collide
// with a real session row.
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
/** FNV-1a over the seed → a stable unsigned 32-bit number. Pure. */
export function stableHash(seed: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, FNV_PRIME); }
  return h >>> 0;
}
/** The (session, pane) key a widget kind always opens on. Pure, and the same for the life of the kind. */
export function widgetIds(kind: string): { sessionId: number; paneId: number } {
  return { sessionId: 1_700_000_000_000 + (stableHash(`s:${kind}`) % 1_000_000_000), paneId: stableHash(`p:${kind}`) % 1_000_000_000 };
}
