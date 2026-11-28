// THE NODE CARD (the operator 2026-11-15: "cards like AffectUI's Agent Crew on the canvas, for every kind of node"; flat, Linear-like, never 3D). Every step of a team is a card: an agent or the leader is a full card (its dot-matrix mark,
// name and model, a status pill, what it does now, its spend against its cap, its tools); a tool or a piece of control flow is a small card (an icon badge, its name, what it is, a state dot). While a card works or waits it takes the colour of
// its state: a flat tinted wash that breathes, a border in that colour, three dots that run in the pill. Nothing here has a shadow or a gradient. The look follows the idea of AffectUI's Agent Crew card (seen rendered); the build is ours.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { Icon } from "./icons";
import { AgentFace, type ThemeKey } from "./themes";
import { NodeLive } from "./NodeLive";
import { stepsOf, cardLine, cardSpend, liveOf, cardTools, codeOf, faceOf, iconOf, letterOf, isDeterministic, loopProgress, modelLine, money, sublabel, titleOf, type NodeState } from "./model";
import type { GNode, Run } from "./types";

export const STATE_COLOR: Record<NodeState, string> = { idle: "#94a3b8", working: "#60a5fa", waiting: "#f5b942", done: "#34d399", failed: "#f87171" };
const WORD: Record<NodeState, string> = { idle: "Idle", working: "Working", waiting: "Waiting", done: "Done", failed: "Failed" };
const mix = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
export const CARD_CSS = `
@keyframes nc-wash{from{opacity:.35}to{opacity:1}}
@keyframes nc-dot{0%,80%,100%{opacity:.25}40%{opacity:1}}
@keyframes nc-spin{to{transform:rotate(360deg)}}
.nc{position:absolute;box-sizing:border-box;border:1px solid var(--c-border);border-radius:12px;background:var(--c-panel);overflow:hidden;user-select:none;transition:border-color .25s}
.nc-wash{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .3s}
.nc[data-state=working] .nc-wash,.nc[data-state=waiting] .nc-wash{opacity:1}
.nc-turn{animation:nc-spin 1.4s linear infinite}.nc-beat{animation:nc-beat 1.6s ease-in-out infinite}
@keyframes nc-beat{50%{opacity:.35}}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.nc-dots i{display:inline-block;width:3px;height:3px;border-radius:50%;background:currentColor;margin-left:2px;animation:nc-dot 1.2s infinite}
.nc-dots i:nth-child(2){animation-delay:.2s}.nc-dots i:nth-child(3){animation-delay:.4s}
.nc-spin{width:9px;height:9px;border-radius:50%;border:1.5px solid color-mix(in srgb,currentColor 25%,transparent);border-top-color:currentColor;animation:nc-spin .9s linear infinite;display:inline-block}
@media (prefers-reduced-motion:reduce){.nc-turn,.nc-beat{animation:none}.nc-dots i,.nc-spin{animation:none}}`;

export function NodeCard({ id, n, st, run, theme, lead, style, big, selected, stepsOpen, onSteps }: { id: string; n: GNode; st: NodeState; run: Run | null; theme: ThemeKey; lead: { state: NodeState; word: string }; style: React.CSSProperties; big: boolean; selected?: boolean; stepsOpen?: boolean; onSteps?: () => void }) {
  const isLead = n.node === "leader"; const state = isLead ? lead.state : st; const col = STATE_COLOR[state]; const active = state === "working" || state === "waiting";
  const border = active ? mix(col, 55) : state === "failed" ? mix(col, 50) : state === "done" ? mix(col, 30) : undefined;
  const base: React.CSSProperties = { ...style, borderColor: border, outline: selected ? `2px solid ${C.brand}` : "none", outlineOffset: 3, fontFamily: nav, color: C.fg };
  const wash = <span className="nc-wash" aria-hidden style={{ background: mix(col, 5) }} />;
  const asks = n.autonomy === "ask" || n.autonomy === "always" ? <span data-testid={`card-asks-${id}`} title={n.autonomy === "always" ? "asks you every time before it starts" : "asks you once per run before it starts"} style={{ display: "inline-flex", color: STATE_COLOR.waiting, flex: "none" }}><Icon name="hand" size={12} /></span> : null;
  const glyph = { idle: "clock", working: "spark", waiting: "hand", done: "tick", failed: "x" }[state];
  const pill = <span data-testid={`card-pill-${id}`} title={isLead ? lead.word : WORD[state]} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, flex: "none", color: state === "idle" ? C.dim : col }}>
    <span className={state === "working" ? "nc-turn" : state === "waiting" ? "nc-beat" : undefined} style={{ display: "inline-flex" }}><Icon name={glyph} size={14} /></span><span className="sr-only">{isLead ? lead.word : WORD[state]}</span></span>;
  if (big) {
    const sp = cardSpend(n, run?.state.node_cost?.[id]); const tools = cardTools(n); const line = isLead ? (state === "working" ? "Leading" : lead.word) : cardLine(id, n, st, run);
    const lineIcon = liveOf(id, n, st, run).active ?? (state === "done" ? "file" : state === "waiting" ? "fallback" : null);
    return (
      <div className="nc" data-state={state} data-card="big" style={{ ...base, padding: "11px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {wash}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", color: active || state === "failed" || state === "done" ? col : C.muted, background: mix(col, active ? 12 : 6), border: `1px solid ${mix(col, active ? 30 : 14)}` }}><Icon name={isLead ? "spark" : iconOf(n)} size={16} /></span>
          <span style={{ minWidth: 0, fontWeight: 500, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={isLead ? "Leader" : titleOf(id, n)}>{isLead ? "Leader" : titleOf(id, n)}</span>
          {state !== "working" && state !== "done" && asks}{pill}
        </div>
        {liveOf(id, n, st, run).shown ? <NodeLive id={id} n={n} st={st} run={run} style={{ position: "relative", minHeight: 20 }} /> : <div data-testid={`card-line-${id}`} style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, minHeight: 16, minWidth: 0 }}>{lineIcon && <span style={{ display: "inline-flex", flex: "none", color: C.dim }}><Icon name={lineIcon} size={12} /></span>}<span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line}</span>{sp.words && state !== "working" && <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4, alignItems: "center", fontFamily: mono, fontSize: 11, color: C.dim, flex: "none" }}><Icon name="coin" size={11} />{sp.words.split(" / ")[0].replace("$", "")}</span>}</div>}
        {state === "working" && (sp.share !== null || sp.words) && <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, height: 2, borderRadius: 2, background: mix("currentColor", 10), overflow: "hidden" }}><i data-testid={`card-bar-${id}`} style={{ display: "block", height: "100%", width: `${Math.round((sp.share ?? 0) * 100)}%`, background: sp.share !== null && sp.share > 0.85 ? STATE_COLOR.failed : col, borderRadius: 2, transition: "width .4s" }} /></span>
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center", fontFamily: mono, fontSize: 10.5, color: C.dim, whiteSpace: "nowrap" }}><Icon name="coin" size={10} />{sp.words}</span></div>}
        {onSteps && (run?.tools_live?.[id]?.length ?? 0) > 0 && <button data-testid={`card-steps-toggle-${id}`} aria-expanded={!!stepsOpen} aria-label={stepsOpen ? "hide its steps" : "show its steps"} onClick={(e) => { e.stopPropagation(); onSteps(); }} onPointerDown={(e) => e.stopPropagation()} style={{ position: "absolute", zIndex: 3, right: 6, bottom: 4, width: 18, height: 18, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", color: C.muted, border: "none", borderRadius: 5, cursor: "pointer", transform: stepsOpen ? "rotate(180deg)" : "none" }}><Icon name="chev" size={13} /></button>}
        {(state === "working" || stepsOpen) && tools.icons.length > 0 && <div data-testid={`card-tools-${id}`} style={{ position: "relative", display: "flex", gap: 4, alignItems: "center", pointerEvents: "none" }}>
          {tools.icons.map((i) => <span key={i} style={{ width: 18, height: 18, borderRadius: 5, display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.muted, background: mix("currentColor", 8) }}><Icon name={i} size={11} /></span>)}
          {tools.more > 0 && <span style={{ fontSize: 10.5, color: C.dim }}>+{tools.more}</span>}</div>}
      </div>);
  }
  const lp = n.node === "loop" ? loopProgress(run, id) : null; const sub = sublabel(n) || (n.node === "human" ? "needs a person" : "");
  return (
    <div className="nc" data-state={state} data-card="small" style={{ ...base, padding: "0 10px", display: "flex", alignItems: "center", gap: 8 }}>
      {wash}
      <span style={{ position: "relative", width: 26, height: 26, borderRadius: 8, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", color: active || state === "failed" || state === "done" ? col : C.muted, background: mix(col, active ? 14 : 8), border: `1px solid ${mix(col, active ? 35 : 20)}` }}><Icon name={iconOf(n)} size={14} /></span>
      <span style={{ position: "relative", minWidth: 0, display: "grid" }}><span style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={titleOf(id, n)}>{titleOf(id, n)}</span>{sub && <span style={{ fontSize: 10.5, color: C.dim, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>}</span>
      <span style={{ position: "relative", marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }}>
        {isDeterministic(n) && <span data-testid={`card-det-${id}`} title="Deterministic: no model is called, the same input always gives the same output" style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".04em", color: C.dim, border: `1px solid ${C.border}`, borderRadius: 4, padding: "0 4px", lineHeight: "13px" }}>det</span>}{asks}{lp && <span style={{ fontFamily: mono, fontSize: 10.5, color: C.muted }}>{lp.n}/{lp.max}</span>}
        <span data-testid={`card-dot-${id}`} data-state={state} style={{ display: "inline-flex", color: state === "idle" ? C.dim : col }}><span className={state === "working" ? "nc-turn" : state === "waiting" ? "nc-beat" : undefined} style={{ display: "inline-flex" }}><Icon name={{ idle: "clock", working: "spark", waiting: "hand", done: "tick", failed: "x" }[state]} size={13} /></span></span></span>
    </div>);
}

/** The steps of a card, expanded under it (the operator 2026-11-15: "an expand button on the agent, we don't need to open it: see the subtasks in real time"): the tools it used, newest first, each sliding in. */
export function StepsPanel({ id, run, now, style }: { id: string; run: Run | null; now: number; style?: React.CSSProperties }) {
  const steps = stepsOf(id, run, now, 6); if (!steps.length) return null;
  return <div data-testid={`card-steps-${id}`} style={{ position: "absolute", left: 6, right: 6, top: "100%", zIndex: 8, marginTop: 2, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 8px", fontFamily: nav, display: "grid", gap: 2, ...style }}>
    {steps.map((s, i) => <div key={`${i}-${s.text}`} className="nl-line" style={{ display: "grid", gridTemplateColumns: "14px 1fr auto", gap: 6, alignItems: "center", fontSize: 10.5 }}><span style={{ color: i === 0 && run?.live ? STATE_COLOR.working : C.dim, display: "inline-flex" }}><Icon name={s.icon} size={10} /></span><span style={{ fontFamily: mono, color: i === 0 ? C.fg : C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.text}</span><span style={{ color: C.dim }}>{s.ago}</span></div>)}
  </div>;
}
