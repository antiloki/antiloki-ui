// THE SIDEBAR IN THE THREE LOOKS (the operator 2026-11-22, from the mockup "Sidebar in the three looks", a little and not exaggerated): what is active or running in the left column is told by the look of the pixel effects.
// Pixelated: a dither that fades toward the right of the row. Shadow: a soft cloud of colour under it that drifts while it runs. Minimal: nothing drawn but a coloured border (the callers do that).
import * as React from "react";
import { usePixelStyle } from "./use-appearance";
import { GooDefs } from "./SpecialistAvatar";

function ensureCss() { if (typeof document === "undefined" || document.getElementById("sfx-css")) return; const el = document.createElement("style"); el.id = "sfx-css"; el.textContent = CSS; document.head.appendChild(el); }
const CSS = "@keyframes sfx-px{0%,100%{opacity:.4}50%{opacity:.9}}@keyframes sfx-sh{0%,100%{transform:translateX(0);opacity:.4}50%{transform:translateX(-14px);opacity:.75}}@keyframes sfx-l1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-18px,4px) scale(1.25)}}@keyframes sfx-l2{0%,100%{transform:translate(0,0)}50%{transform:translate(14px,-5px) scale(.9)}}@keyframes sfx-l3{0%,100%{transform:translate(0,0)}50%{transform:translate(-10px,6px) scale(1.4)}}@media (prefers-reduced-motion: reduce){.sfx{animation:none!important}}";
/** Put inside a `position: relative; overflow: hidden; isolation: isolate` element: draws the look behind its content. Nothing in the minimal look. */
export function SideFx({ color, running = false }: { color: string; running?: boolean }) {
  const style = usePixelStyle(); if (style === "minimal") return null; ensureCss();
  if (style === "pixel") return <span aria-hidden data-testid="side-fx" data-style="pixel" className="sfx" style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none", backgroundImage: `repeating-conic-gradient(${color} 0 25%, transparent 0 50%)`, backgroundSize: "5px 5px", imageRendering: "pixelated", WebkitMaskImage: "linear-gradient(to right, transparent 45%, rgba(0,0,0,.65))", maskImage: "linear-gradient(to right, transparent 45%, rgba(0,0,0,.65))", opacity: 0.5, animation: running ? "sfx-px 1.2s steps(4) infinite" : "none" }} />;
  if (style === "liquid") return <span aria-hidden data-testid="side-fx" data-style="liquid" style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none", filter: "url(#antiloki-goo)", opacity: 0.28 }}><GooDefs />{[[-6, 50, 26, "sfx-l1", 5.2], [34, 30, 34, "sfx-l2", 4.4], [-30, 60, 22, "sfx-l3", 6]].map(([r, t, z, n, d], i) => <i key={i} className="sfx" style={{ position: "absolute", right: r as number, top: `${t}%`, width: z as number, height: z as number, marginTop: -(z as number) / 2, borderRadius: "50%", background: color, animation: `${n} ${running ? d : 14}s ease-in-out infinite` }} />)}</span>;
  return <span aria-hidden data-testid="side-fx" data-style="shadow" className="sfx" style={{ position: "absolute", inset: "-40% -10% -40% 30%", zIndex: -1, pointerEvents: "none", borderRadius: "50%", background: `radial-gradient(ellipse at 70% 50%, ${color}, transparent 68%)`, filter: "blur(12px)", opacity: 0.5, animation: running ? "sfx-sh 3.2s ease-in-out infinite" : "none" }} />;
}
/** The look of a row that is on: the minimal look draws only its coloured border. */
export function onRowStyle(style: "pixel" | "shadow" | "minimal" | "liquid", color: string): React.CSSProperties {
  return style === "minimal" ? { background: "transparent", outline: `1px solid ${color}`, outlineOffset: -1 } : { position: "relative", overflow: "hidden", isolation: "isolate" };
}
