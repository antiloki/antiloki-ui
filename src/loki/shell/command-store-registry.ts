// THE ⌘K STORE REGISTRY (operator 2026-07-14: one window replacing the general
// palette AND the vibe-local palette). Screens register their LIVE features —
// the store's "HERE" section — via registerHere in a useEffect; the returned
// cleanup unregisters on unmount. Dependency-free on purpose: importing this
// from a screen must never drag shell modules into that screen's test setup.

export type StoreItem = { icon: string; tint?: string; label: string; hint?: string; run: () => void };
export type HereSection = { title: string; items: StoreItem[] };

let hereSection: HereSection | null = null;
const subs = new Set<() => void>();

export function registerHere(title: string, items: StoreItem[]): () => void {
  hereSection = { title, items };
  subs.forEach((f) => f());
  return () => {
    if (hereSection && hereSection.title === title) { hereSection = null; subs.forEach((f) => f()); }
  };
}

export function getHere(): HereSection | null { return hereSection; }

export function subscribeHere(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}
