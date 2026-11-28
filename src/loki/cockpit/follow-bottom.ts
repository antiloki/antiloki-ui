// A THREAD THAT FOLLOWS ITS BOTTOM (operator 2026-10-09: "I sent a message and nothing happened visually", reproduced in a live browser test: the new ask, the run card and the result were all IN the thread,
// but the view stayed where it was, so they sat below the fold). The thread scrolled to the bottom only when its `turns` changed; a reply's cards (run card, story, result) are drawn AFTER that and make the
// list taller without changing `turns`, so the bottom moved away from the view. This keeps the view on the bottom whenever the list grows, for as long as the reader has not scrolled up (`stick`).
// A growth never fires a scroll event, so `stick` stays true through it; a reader who scrolls up fires one, and the follow stops. Pure over an element and a predicate - tested.
export function followBottom(el: HTMLElement, stick: () => boolean): () => void {
  if (typeof MutationObserver === "undefined") return () => {};
  const go = () => { if (stick()) el.scrollTop = el.scrollHeight; };
  const mo = new MutationObserver(go);
  mo.observe(el, { childList: true, subtree: true, characterData: true });
  return () => mo.disconnect();
}
