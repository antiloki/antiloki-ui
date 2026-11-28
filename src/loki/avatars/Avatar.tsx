// ONE AGENT AS A SMALL FLAT CHARACTER (operator 2026-11-16): a shape, a colour and one accessory per role; its motion says what it is doing (idle, work, wait, error, done, sleep).
import type * as React from "react";
import { AVATAR_CSS } from "./avatar.css";

export type AvatarState = "idle" | "work" | "wait" | "error" | "done" | "sleep";
type Look = { k: string; shape: "tri" | "heart" | "round" | "blob" | "bump"; acc: "star" | "pencil" | "glasses" | "hat" | "sprout"; eye?: string };
const LOOKS: Record<string, Look> = {
  leader: { k: "#6f8cff", shape: "tri", acc: "star" }, writer: { k: "#ff86bd", shape: "heart", acc: "pencil" }, reviewer: { k: "#8e9ab5", shape: "round", acc: "glasses", eye: "#fff" },
  builder: { k: "#f4b73f", shape: "blob", acc: "hat" }, designer: { k: "#93d445", shape: "bump", acc: "sprout" },
};
const ORDER = ["leader", "writer", "reviewer", "builder", "designer"];
/** The look of a role; a role we have no look for gets a stable one from its pane number. Pure. */
export function lookOf(role: string, paneId: number): Look { return LOOKS[role] ?? LOOKS[ORDER[Math.abs(paneId) % ORDER.length]]; }
function bump(): string { const pts: string[] = []; for (let i = 0; i < 64; i++) { const t = (i / 64) * Math.PI * 2, r = 15 + 2.2 * Math.sin(t * 9); pts.push(`${(24 + r * Math.cos(t)).toFixed(1)} ${(26 + r * Math.sin(t)).toFixed(1)}`); } return `M${pts.join("L")}Z`; }
const SHAPE = { tri: "M24 9Q27 9 29 13L40 34Q43 41 37 41L11 41Q5 41 8 34L19 13Q21 9 24 9Z", heart: "M24 41C10 32 6 23 11 17C15 12 22 14 24 19C26 14 33 12 37 17C42 23 38 32 24 41Z", round: "M24 10A16 16 0 1 1 23.9 10Z", blob: "M24 9Q33 8 38 15Q44 24 38 34Q31 42 22 40Q11 38 9 28Q8 17 16 11Q20 9 24 9Z", bump: bump() };
const EYE = { tri: [[20, 28], [28, 28]], heart: [[19, 27], [29, 27]], round: [[19, 26], [29, 26]], blob: [[19, 27], [29, 27]], bump: [[20, 26], [28, 26]] } as const;
const ACC: Record<Look["acc"], React.ReactElement> = {
  star: <path d="M24 1.5l1.6 3.4 3.7.4-2.8 2.5.8 3.7L24 9.6l-3.3 1.9.8-3.7-2.8-2.5 3.7-.4z" fill="#ffd45c" stroke="#c9961f" strokeWidth=".8" strokeLinejoin="round" />,
  pencil: <g transform="rotate(28 24 8)"><rect x="21.5" y="-1" width="5" height="13" rx="1" fill="#ffd45c" stroke="#c9961f" strokeWidth=".8" /><path d="M21.5 12l2.5 4 2.5-4z" fill="#f3d9b1" stroke="#c9961f" strokeWidth=".8" /></g>,
  glasses: <g fill="none" stroke="#e8ebf2" strokeWidth="1.4"><circle cx="19" cy="26" r="5" /><circle cx="29" cy="26" r="5" /></g>,
  hat: <g><path d="M12 14Q24 3 36 14Z" fill="#ff7a3d" stroke="#b9501f" strokeWidth=".9" /><rect x="9" y="13.5" width="30" height="3.2" rx="1.6" fill="#ff7a3d" stroke="#b9501f" strokeWidth=".9" /></g>,
  sprout: <g><path d="M24 11Q24 5 24 4" stroke="#4d8f1c" strokeWidth="1.4" fill="none" /><path d="M24 6Q17 2 15 8Q21 11 24 6Z" fill="#6fbf2a" stroke="#4d8f1c" strokeWidth=".8" /><path d="M24 6Q31 2 33 8Q27 11 24 6Z" fill="#6fbf2a" stroke="#4d8f1c" strokeWidth=".8" /></g>,
};
const CONF = [[-16, -14, "#ffd45c"], [16, -16, "#ff86bd"], [-20, 2, "#6f8cff"], [20, 0, "#93d445"], [-8, -20, "#ff7a3d"], [9, -21, "#8ee0ff"]] as const;
let css = false;
function ensureCss() { if (css || typeof document === "undefined") return; css = true; const s = document.createElement("style"); s.textContent = AVATAR_CSS; document.head.appendChild(s); }

export function Avatar({ role, paneId = 0, state, size = 44 }: { role: string; paneId?: number; state: AvatarState; size?: number }) {
  ensureCss(); const c = lookOf(role, paneId), e = EYE[c.shape];
  const [a, b] = e; const [x1, y1] = a, [x2, y2] = b;
  return (
    <span className="avatar" data-testid="avatar" data-s={state} style={{ ["--s" as any]: `${size}px`, ["--k" as any]: c.k, ...(c.eye ? { ["--eye" as any]: c.eye } : {}) }}>
      <svg className="face" viewBox="0 0 48 48" aria-hidden>
        <ellipse className="shadow" cx="24" cy="44.5" rx="12" ry="2.4" /><circle className="aura" cx="24" cy="26" r="19" />
        <g className="orb"><circle cx="24" cy="5" r="1.7" /><circle cx="41" cy="30" r="1.4" /><circle cx="9" cy="32" r="1.4" /></g>
        <path className="body" d={SHAPE[c.shape]} />
        <g className="eyes"><circle className="e n" cx={x1} cy={y1} r="1.9" /><circle className="e n" cx={x2} cy={y2} r="1.9" /></g>
        <path className="x" d={`M${x1 - 2} ${y1 - 2}l4 4M${x1 + 2} ${y1 - 2}l-4 4M${x2 - 2} ${y2 - 2}l4 4M${x2 + 2} ${y2 - 2}l-4 4`} />
        <path className="h2" d={`M${x1 - 2.4} ${y1 + 1}q2.4-4 4.8 0M${x2 - 2.4} ${y2 + 1}q2.4-4 4.8 0`} />
        <path className="z" d={`M${x1 - 2.2} ${y1}h4.4M${x2 - 2.2} ${y2}h4.4`} />
        <path className="mo" d={`M${x1 + 3} ${y1 + 8}q2-3 4 0`} /><path className="sw" d={`M${x1 + 3} ${y1 + 6}q2 3 4 0`} />
        <g className="acc">{ACC[c.acc]}</g>
        <path className="drop" d="M37 17q2 3 0 4.4q-2-1.4 0-4.4z" />
        <g className="conf">{CONF.map(([dx, dy, f], i) => <circle key={i} cx="24" cy="22" r="1.7" fill={f} style={{ ["--dx" as any]: `${dx}px`, ["--dy" as any]: `${dy}px`, animationDelay: `${i * 30}ms` }} />)}</g>
        <text className="zz" x="36" y="12" fontSize="8" fontFamily="monospace" fill="currentColor">z</text>
      </svg>
    </span>
  );
}
