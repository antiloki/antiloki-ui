// ONE BOX FOR EVERY WINDOW (the operator 2026-11-22, approved mockup "Window kit": "it is just the box, don't change the content"): any window or menu that opens (role dialog, menu or listbox) is dressed in the theme's frosted glass: no border, a soft shadow, a rounded corner, and the look's own touch (pixel: blocks and a square-ish corner; shadow: a soft coloured glow; liquid: a flat drop in the corner; minimal: a hairline). Only the box changes; what is inside is left alone. A full-screen scrim is not a window: its first child (the real box) is dressed instead. A window that wants nothing says `data-no-shell`.
export const SHELL_CSS = `
.aw-win{background:color-mix(in srgb,var(--c-bg,#0c0c11) 58%,transparent)!important;backdrop-filter:blur(22px) saturate(1.35)!important;-webkit-backdrop-filter:blur(22px) saturate(1.35)!important;border:none!important;box-shadow:0 20px 60px rgba(0,0,0,.45)!important;border-radius:16px!important}
html[data-look=pixel] .aw-win{border-radius:6px!important;background-image:repeating-conic-gradient(rgba(255,255,255,.035) 0 25%,transparent 0 50%)!important;background-size:8px 8px!important;box-shadow:0 0 0 2px color-mix(in srgb,#fff 10%,transparent),0 20px 60px rgba(0,0,0,.45)!important}
html[data-look=shadow] .aw-win{box-shadow:0 0 22px 1px color-mix(in srgb,#7c5cf0 45%,transparent),0 0 44px 4px color-mix(in srgb,#e86cc0 22%,transparent),0 20px 60px rgba(0,0,0,.45)!important}
html[data-look=liquid] .aw-win{overflow:hidden}
html[data-look=liquid] .aw-win::after{content:"";position:absolute;right:-30px;top:-30px;width:110px;height:110px;border-radius:50%;background:var(--c-brand,#7c5cf0);opacity:.2;pointer-events:none}
html[data-look=minimal] .aw-win{background:color-mix(in srgb,var(--c-bg,#0c0c11) 30%,transparent)!important;backdrop-filter:blur(14px)!important;-webkit-backdrop-filter:blur(14px)!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,#fff 24%,transparent)!important}
`;
const SEL = '[role="dialog"], [role="menu"], [role="listbox"]';
/** Is this element a full-screen scrim (not the window itself)? Pure over the two boxes. */
export const isScrim = (box: { width: number; height: number }, view: { width: number; height: number }): boolean => box.width >= view.width * 0.95 && box.height >= view.height * 0.95;
export function dress(el: HTMLElement) {
  if (el.hasAttribute("data-no-shell") || el.classList.contains("aw-win")) return;
  const r = el.getBoundingClientRect(); const view = { width: window.innerWidth, height: window.innerHeight };
  if (r.width > 0 && isScrim(r, view)) { const kid = el.firstElementChild as HTMLElement | null; if (kid && !kid.classList.contains("aw-win")) kid.classList.add("aw-win"); return; }
  el.classList.add("aw-win");
}
let installed = false;
export function installWindowShell() {
  if (installed || typeof document === "undefined" || typeof MutationObserver === "undefined") return; installed = true;
  const st = document.createElement("style"); st.id = "antiloki-window-shell"; st.textContent = SHELL_CSS; document.head.appendChild(st);
  const scan = (n: Node) => { if (!(n instanceof HTMLElement)) return; if (n.matches?.(SEL)) dress(n); n.querySelectorAll?.<HTMLElement>(SEL).forEach(dress); };
  new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach(scan); }).observe(document.body, { childList: true, subtree: true });
  scan(document.body);
}
