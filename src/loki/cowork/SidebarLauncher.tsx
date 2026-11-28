// THE SIDEBAR OPENS FROM THE LOGO (the operator 2026-11-22: the corner logo and the detour are gone; "the antiloki logo on the bottom bar right onclick opens the menu now"; it blooms out of that logo). Earlier: THE SIDEBAR BECOMES THE LOGO (the operator 2026-11-22, option A of the mockup "The sidebar becomes the logo"): the left column is gone; only the a. stays in the corner. A click on it opens the whole sidebar in the middle of the screen: it grows out of the logo (scale with a soft overshoot), the screen behind it dims and blurs, and the rows rise in one after the other. A click outside, Esc, or choosing something folds it back into the logo.
import * as React from "react";
import { C } from "@/loki/theme";

const CSS = `
@keyframes sl-scrim{from{opacity:0}to{opacity:1}}
@keyframes sl-bloom{0%{opacity:0;transform:translate(var(--bx),var(--by)) scale(.08)}60%{opacity:1;transform:translate(0,0) scale(1.03)}100%{opacity:1;transform:none}}
@keyframes sl-fold{0%{opacity:1;transform:none}100%{opacity:0;transform:translate(var(--bx),var(--by)) scale(.08)}}
@keyframes sl-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.sl-panel aside{width:100%!important;max-width:none!important;height:100%!important;background:transparent!important;border:none!important;box-shadow:none!important}
.sl-panel aside>*{animation:sl-rise .42s cubic-bezier(.2,.8,.2,1) both}
.sl-panel aside>*:nth-child(1){animation-delay:.16s}.sl-panel aside>*:nth-child(2){animation-delay:.22s}.sl-panel aside>*:nth-child(3){animation-delay:.28s}.sl-panel aside>*:nth-child(4){animation-delay:.34s}.sl-panel aside>*:nth-child(5){animation-delay:.4s}.sl-panel aside>*:nth-child(n+6){animation-delay:.46s}
@media (prefers-reduced-motion: reduce){.sl-panel,.sl-scrim,.sl-panel aside>*{animation:none!important}}`;
export const BLOOM_MS = 460; export const FOLD_MS = 260;

/** The offset (in px) from the middle of the screen to the logo: where the panel grows from and folds back to. */
export function originOf(logo: { left: number; top: number; width: number; height: number } | null, vw: number, vh: number): { x: number; y: number } {
  if (!logo) return { x: -vw / 3, y: -vh / 3 }; return { x: logo.left + logo.width / 2 - vw / 2, y: logo.top + logo.height / 2 - vh / 2 };
}
/** The middle-of-the-screen shell: scrim, the panel that blooms out of the logo, folding back on Esc, a click outside, or `closeSignal`. */
export function BloomPanel({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const [closing, setClosing] = React.useState(false); const [o] = React.useState(() => originOf(document.querySelector<HTMLElement>("[data-testid=bar-logo]")?.getBoundingClientRect() ?? null, window.innerWidth, window.innerHeight));
  const fold = React.useCallback(() => { setClosing(true); window.setTimeout(onClose, FOLD_MS); }, [onClose]);
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); fold(); } }; window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true); }, [fold]);
  return (
    <>
      <style>{CSS}</style>
      <div data-testid="launcher-scrim" className="sl-scrim" onMouseDown={fold} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(8,8,12,.55)", backdropFilter: "blur(3px)", animation: closing ? undefined : "sl-scrim .24s ease-out both", opacity: closing ? 0 : 1, transition: closing ? `opacity ${FOLD_MS}ms ease-in` : undefined }} />
      <div data-no-bloom data-testid="launcher-panel" data-closing={closing ? "1" : "0"} className="sl-panel" role="dialog" aria-modal="true" aria-label="spaces, threads and agents"
        style={{ position: "fixed", left: "50%", top: "50%", width: "min(400px, calc(100vw - 32px))", height: "min(720px, calc(100vh - 56px))", marginLeft: "calc(min(400px, calc(100vw - 32px)) / -2)", marginTop: "calc(min(720px, calc(100vh - 56px)) / -2)", zIndex: 401, borderRadius: 20, overflow: "hidden", background: `color-mix(in srgb, ${C.panel} 94%, transparent)`, border: `1px solid ${C.border}`, boxShadow: "0 24px 60px rgba(0,0,0,.5)", transformOrigin: "50% 50%",
          ["--bx" as string]: `${o.x}px`, ["--by" as string]: `${o.y}px`, animation: closing ? `sl-fold ${FOLD_MS}ms cubic-bezier(.4,0,.8,.4) both` : `sl-bloom ${BLOOM_MS}ms cubic-bezier(.2,.9,.25,1.05) both` }}>
        {children}
      </div>
    </>
  );
}
