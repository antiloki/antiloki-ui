// THE LIVE STRIP OF A NODE (the operator 2026-11-15: "it is not a theme, it is the content inside the nodes": small icons and two short lines saying what runs now, in EVERY look; where a look has no room it sits below the node). The tools the node's
// agent used show as tiny icon badges with the one in use lit; line one is what it does now, line two what it did before; when the news changes the lines slide in. Flat, no shadows. Reads only what the run holds.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { Icon } from "./icons";
import { liveOf, type NodeState } from "./model";
import type { GNode, Run } from "./types";

export const LIVE_CSS = `
@keyframes nl-in{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
@keyframes nl-lit{0%,100%{opacity:1}50%{opacity:.45}}
.nl-line{animation:nl-in .28s ease-out both}.nl-lit{animation:nl-lit 1.4s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.nl-line,.nl-lit{animation:none}}`;
const COL: Record<string, string> = { working: "#60a5fa", waiting: "#f5b942", failed: "#f87171", done: "#34d399", idle: "#94a3b8" };

export function NodeLive({ id, n, st, run, icons = true, style }: { id: string; n: GNode; st: NodeState; run: Run | null; icons?: boolean; style?: React.CSSProperties }) {
  const l = liveOf(id, n, st, run); if (!l.shown) return null; const col = COL[st] ?? C.muted;
  return (
    <div data-testid={`live-${id}`} data-state={st} style={{ fontFamily: nav, fontSize: 10.5, lineHeight: 1.25, color: C.muted, minWidth: 0, pointerEvents: "none", ...style }}>
      <style>{LIVE_CSS}</style>
      <div key={l.key} className="nl-line" style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
        {icons && l.icons.length > 0 && <span data-testid={`live-icons-${id}`} style={{ display: "inline-flex", gap: 3, flex: "none" }}>{l.icons.map((i) => { const lit = l.active === i; return <span key={i} data-lit={lit ? "1" : "0"} className={lit ? "nl-lit" : undefined} style={{ width: 15, height: 15, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", color: lit ? col : C.dim, background: `color-mix(in srgb, ${lit ? col : "currentColor"} ${lit ? 16 : 8}%, transparent)`, border: `1px solid color-mix(in srgb, ${lit ? col : "currentColor"} ${lit ? 40 : 14}%, transparent)` }}><Icon name={i} size={9} /></span>; })}</span>}
        <span data-testid={`live-now-${id}`} style={{ color: st === "working" ? C.fg : C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: l.active ? mono : nav }}>{l.now}</span>
      </div>
      {l.before && <div data-testid={`live-before-${id}`} className="nl-line" style={{ color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: mono }}>{l.before}</div>}
    </div>
  );
}
