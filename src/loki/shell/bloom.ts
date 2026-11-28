// EVERY WINDOW BLOOMS (the operator 2026-11-22: "the cool animation of the menu appearing: make it for all windows that we open on the center of the screen, like the usage etc."): any element with role="dialog" that appears grows out of where it was opened from (the last click), with the soft overshoot of the sidebar launcher, and settles. One observer for the whole app, so no window has to ask for it. A window that animates itself says `data-no-bloom`.
const CSS = "@keyframes antiloki-bloom{0%{opacity:0;translate:var(--bx) var(--by);scale:.08}60%{opacity:1;translate:0 0;scale:1.03}100%{opacity:1;translate:0 0;scale:1}}@media (prefers-reduced-motion: reduce){[data-bloomed]{animation:none!important}}";
export const BLOOM_MS = 420; const FRESH_MS = 1500;
let last = { x: 0, y: 0, t: 0 }; let installed = false;
/** Where a window that opens now should grow from, relative to its own middle: the last click when it was a moment ago, else its own middle. Pure. */
export function originFor(click: { x: number; y: number; t: number }, now: number, box: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  if (now - click.t > FRESH_MS) return { x: 0, y: 0 }; return { x: click.x - (box.left + box.width / 2), y: click.y - (box.top + box.height / 2) };
}
export function bloom(el: HTMLElement, now = Date.now()) {
  if (el.dataset.bloomed || el.hasAttribute("data-no-bloom")) return; el.dataset.bloomed = "1";
  const o = originFor(last, now, el.getBoundingClientRect()); el.style.setProperty("--bx", `${Math.round(o.x)}px`); el.style.setProperty("--by", `${Math.round(o.y)}px`); el.style.animation = `antiloki-bloom ${BLOOM_MS}ms cubic-bezier(.2,.9,.25,1.05) both`;
}
/** Start watching (once). */
export function installBloom() {
  if (installed || typeof document === "undefined" || typeof MutationObserver === "undefined") return; installed = true;
  const st = document.createElement("style"); st.id = "antiloki-bloom-css"; st.textContent = CSS; document.head.appendChild(st);
  document.addEventListener("pointerdown", (e) => { last = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
  const scan = (n: Node) => { if (!(n instanceof HTMLElement)) return; if (n.getAttribute("role") === "dialog") bloom(n); n.querySelectorAll?.<HTMLElement>('[role="dialog"]').forEach((d) => bloom(d)); };
  new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach(scan); }).observe(document.body, { childList: true, subtree: true });
}
/** For tests: the last remembered click. */
export function rememberClick(x: number, y: number, t = Date.now()) { last = { x, y, t }; }
