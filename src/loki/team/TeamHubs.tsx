// THE THREE HUBS OF THE TEAM PANE (the operator 2026-11-15, after the first real run: "the canvas is heavy, complicated and saturated; merge and simplify; use icons"). Ten tabs became four: Run, Activity, Recap, Edit.
// Activity holds the waterfall, the chat, the files changed and the context map behind one icon switch; Recap holds the result, the proof and what happened while you were away; Edit holds the editor, the saga and the improver as sections.
import * as React from "react";
import { C, nav } from "@/loki/theme";
import { Icon } from "./icons";
import { TraceWaterfall } from "./TraceWaterfall";
import { TeamChat } from "./TeamChat";
import { LedgerView } from "./LedgerView";
import { DiffTimeline } from "./DiffTimeline";
import { LiveReport } from "./LiveReport";
import { ContextMap } from "./ContextMap";
import { PlanActual } from "./PlanActual";
import { ProofCard } from "./ProofCard";
import { RunRecaps } from "./RunRecaps";
import type { Graph, Run } from "./types";

export type Lens = "recap" | "report" | "waterfall" | "plan" | "chat" | "files" | "context"; export type Section = "graph" | "saga" | "improve" | "requests";
export const LENSES: [Lens, string, string][] = [["recap", "recap", "Recap"], ["report", "report", "Report"], ["waterfall", "waterfall", "Time and cost"], ["plan", "plan", "Plan and actual"], ["chat", "teamchat", "Team chat"], ["files", "diff", "Files changed"], ["context", "context", "Context"]];
export const SECTIONS: [Section, string, string][] = [["graph", "graph", "Team"], ["saga", "saga", "Saga"], ["improve", "undo", "Improve"], ["requests", "branch", "Requests"]];

/** An icon switch: each choice is an icon with its word beside it (the word drops away on a narrow pane, the title keeps it). */
export function IconSeg<K extends string>({ items, value, onPick, testPrefix, label, bare }: { items: [K, string, string][]; value: K; onPick: (k: K) => void; testPrefix: string; label: string; /** no box of its own: it already sits inside one (the floating bar) */ bare?: boolean }) {
  // ICONS ONLY (the operator 2026-11-24: "make it a switcher of icons on the top bar, the name appears on mouse over"): the name shows as a bubble while the pointer is on the icon; the native title stays for a keyboard focus
  const [hover, setHover] = React.useState<K | null>(null);
  return <span role="group" aria-label={label} style={bare ? { display: "inline-flex", gap: 2 } : { display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 10, padding: 2, gap: 2, background: "color-mix(in srgb, currentColor 5%, transparent)" }}>
    {items.map(([k, icon, word]) => <span key={k} style={{ position: "relative", display: "inline-flex" }}>
      <button data-testid={`${testPrefix}-${k}`} aria-pressed={value === k} title={word} aria-label={word} onClick={() => onPick(k)} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(k)} onBlur={() => setHover(null)}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 24, borderRadius: 8, border: "none", cursor: "pointer", background: value === k ? C.panel : "transparent", color: value === k ? C.fg : C.muted, outline: value === k ? `1px solid ${C.border}` : "none" }}><Icon name={icon} size={14} /></button>
      {hover === k && <span role="tooltip" data-testid={`${testPrefix}-${k}-name`} style={{ position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", zIndex: 20, whiteSpace: "nowrap", pointerEvents: "none", padding: "3px 8px", borderRadius: 6, background: C.panel, border: `1px solid ${C.border}`, color: C.fg, fontFamily: nav, fontSize: 11.5 }}>{word}</span>}
    </span>)}
  </span>;
}
const empty = (testid: string, icon: string, text: string) => <div data-testid={testid} style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, color: C.muted, fontFamily: nav, fontSize: 13 }}><Icon name={icon} size={16} />{text}</div>;

export function ActivityHub({ graph, run, lens, onLens, onChanged, onSelect }: { graph: Graph; run: Run | null; lens: Lens; onLens: (l: Lens) => void; onChanged: () => void; onSelect: () => void }) {
  return <div data-testid="activity" data-lens={lens}>
    <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}><IconSeg items={LENSES} value={lens} onPick={onLens} testPrefix="lens" label="what to look at" /></div>
    {lens === "recap" ? <RecapHub team={graph.team} onOpenRun={onSelect} /> : !run ? empty(lens === "waterfall" || lens === "plan" ? "waterfall-empty" : lens === "chat" ? "chat-empty" : lens === "report" ? "report-empty" : lens === "files" ? "ledger-empty" : "ctx-empty", "clock", "No run yet. Start the team on the Run tab; what happens appears here.")
      : lens === "waterfall" ? <TraceWaterfall run={run} /> : lens === "plan" ? <PlanActual team={graph.team} run={run} /> : lens === "chat" ? <TeamChat graph={graph} run={run} onChanged={onChanged} /> : lens === "report" ? <LiveReport run={run} /> : lens === "files" ? <><DiffTimeline run={run} /><LedgerView run={run} onSelect={onSelect} /></> : <ContextMap run={run} onSelect={() => undefined} />}
  </div>;
}

export function RecapHub({ team, onOpenRun }: { team: string; onOpenRun: () => void }) {
  return <div data-testid="recap-hub"><ProofCard team={team} /><RunRecaps team={team} /></div>;
}
